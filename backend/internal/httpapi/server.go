package httpapi

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"wamercio/backend/internal/config"
	"wamercio/backend/internal/db/sqlc"
	"wamercio/backend/internal/platform/tenancy"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/singleflight"
)

type AppDB interface {
	sqlc.DBTX
	BeginTx(context.Context, pgx.TxOptions) (pgx.Tx, error)
	Ping(context.Context) error
}

type Server struct {
	cfg                config.Config
	db                 AppDB
	globalCustomersDB  AppDB
	queries            *sqlc.Queries
	redis              *redis.Client
	location           *time.Location
	tenantManager      *tenancy.Manager
	events             *EventBroker
	rateLimiter        *rateLimiter
	authFailures       *authFailureTracker
	metrics            *serviceMetrics
	r2HTTPClient       *http.Client
	routingHTTPClient  *http.Client
	waxumHTTPClient    *http.Client
	identityHTTPClient *http.Client
	geoHTTPClient      *http.Client
	territoryCache     *territoryAPICache
	instanceID         string
	realtime           *realtimeLifecycle
	businessWorkers    *businessWorkerLifecycle
	bootstrapGroup     singleflight.Group
	territoryGroup     singleflight.Group
}

func NewServer(cfg config.Config, db AppDB, redisClient *redis.Client, tenantManager *tenancy.Manager, globalCustomersDB AppDB) *Server {
	location, err := time.LoadLocation(cfg.AppTimezone)
	if err != nil {
		location = time.Local
	}
	if globalCustomersDB == nil {
		globalCustomersDB = db
	}
	serverMetrics := newServiceMetrics()
	return &Server{
		cfg:               cfg,
		db:                db,
		globalCustomersDB: globalCustomersDB,
		queries:           sqlc.New(db),
		redis:             redisClient,
		location:          location,
		tenantManager:     tenantManager,
		events: NewEventBroker(EventBrokerConfig{
			QueueSize:               cfg.SSEClientQueueSize,
			ReplaySize:              cfg.SSEReplaySize,
			ReplayTenantLimit:       cfg.SSEReplayTenantLimit,
			MaxConnectionsTotal:     cfg.SSEMaxConnectionsTotal,
			MaxConnectionsTenant:    cfg.SSEMaxConnectionsPerTenant,
			MaxConnectionsPerClient: cfg.SSEMaxConnectionsPerClient,
		}),
		rateLimiter:        newRateLimiter(),
		authFailures:       newAuthFailureTracker(),
		metrics:            serverMetrics,
		r2HTTPClient:       newReusableHTTPClient(cfg.R2HTTPTimeout),
		routingHTTPClient:  newReusableHTTPClient(cfg.RoutingHTTPTimeout),
		waxumHTTPClient:    newReusableHTTPClient(cfg.WaxumHTTPTimeout),
		identityHTTPClient: newReusableHTTPClient(cfg.IdentityAPITimeout),
		geoHTTPClient:      newReusableHTTPClient(cfg.HTTPExternalRequestTimeout),
		territoryCache:     newTerritoryAPICache(),
		instanceID:         newInstanceID(),
		realtime:           newRealtimeLifecycle(),
		businessWorkers:    newBusinessWorkerLifecycle(),
	}
}

func (s *Server) globalDB() AppDB {
	if s.globalCustomersDB != nil {
		return s.globalCustomersDB
	}
	return s.db
}

func (s *Server) now() time.Time {
	return time.Now().In(s.location)
}

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(s.observeRequests)
	r.Use(middleware.Recoverer)
	r.Use(s.securityHeaders)
	r.Use(s.cors)
	r.Use(s.limitRequestBody)
	r.Use(s.requestDeadline)

	r.Get("/health", s.health)
	r.Get("/health/live", s.live)
	r.Get("/health/ready", s.ready)
	r.Route("/api", func(r chi.Router) {
		r.Get("/health", s.health)
		r.Get("/runtime-config", s.runtimeConfig)
		r.Get("/access-policy", s.publicAccessPolicy)
		r.Get("/landing", s.publicLandingPage)
		r.Get("/legal", s.publicLegalSettings)
		r.Get("/pwa/manifest.json", s.dynamicManifest)
		r.Get("/pwa/icon.png", s.dynamicPWAIcon)
		r.Get("/og/store", s.storeOpenGraph)
		r.Post("/session/logout", s.logout)
		r.With(s.rateLimitAuthentication).Post("/admin/lookup", s.adminLookup)
		r.With(s.rateLimitAuthentication).Post("/admin/staff-login", s.adminStaffLogin)
		r.With(s.rateLimitAuthentication).Post("/admin/login", s.adminLogin)
		r.With(s.rateLimitAuthentication).Post("/central-account-recovery/request", s.requestCentralAccountRecovery)
		r.With(s.rateLimitAuthentication).Post("/central-account-recovery/verify", s.verifyCentralAccountRecovery)
		r.With(s.rateLimitAuthentication).Post("/central-account-recovery/reset", s.resetCentralAccountSecret)
		r.With(s.requireAdmin).Get("/admin/session", s.adminSession)
		r.With(s.requireAdmin).Get("/admin/businesses", s.listAdminTenants)
		r.With(s.requireAdmin).Get("/admin/businesses/settings", s.listAdminBusinessConfigurations)
		r.With(s.requireAdmin).Patch("/admin/businesses/{id}/store", s.updateAdminTenantStore)
		r.With(s.requireAdmin).Get("/admin/businesses/{id}/whatsapp", s.businessWhatsAppState)
		r.With(s.requireAdmin).Get("/admin/businesses/{id}/whatsapp/qr", s.businessWhatsAppQR)
		r.With(s.requireAdmin).Post("/admin/businesses/{id}/whatsapp/pairing-code", s.businessWhatsAppPairingCode)
		r.With(s.requireAdmin).Get("/admin/businesses/{id}/whatsapp/status", s.businessWhatsAppStatus)
		r.With(s.requireAdmin).Post("/admin/businesses/{id}/whatsapp/disconnect", s.businessWhatsAppDisconnect)
		r.With(s.requireAdmin).Post("/admin/catalog/global/activate-multi", s.activateGlobalCatalogProductAcrossTenants)
		r.With(s.requireAdmin).Post("/admin/businesses", s.createAdminTenant)
		r.With(s.requireAdmin).Get("/admin/plans", s.listPlans)
		r.With(s.requireAdmin).Get("/admin/business-types", s.listBusinessTypes)
		r.Route("/platform", func(r chi.Router) {
			r.With(s.rateLimitAuthentication).Post("/login", s.platformLogin)
			r.Group(func(r chi.Router) {
				r.Use(s.requirePlatformAdmin)
				r.Use(s.requirePlatformPermission)
				r.Get("/session", s.platformSession)
				r.Get("/profile", s.platformProfile)
				r.Patch("/profile", s.updatePlatformProfile)
				r.Post("/profile/password", s.updatePlatformPassword)
				r.Get("/users", s.listPlatformUsers)
				r.Post("/users", s.createPlatformUser)
				r.Patch("/users/{id}", s.updatePlatformUser)
				r.Delete("/users/{id}", s.deletePlatformUser)
				r.Get("/overview", s.platformOverview)
				r.Get("/capacity", s.platformCapacity)
				r.Get("/plans", s.listPlans)
				r.Post("/plans", s.createPlan)
				r.Patch("/plans/{slug}", s.updatePlan)
				r.Delete("/plans/{slug}", s.deletePlan)
				r.Get("/owners", s.listPlatformOwners)
				r.Post("/owners", s.createPlatformOwner)
				r.Patch("/owners/{id}", s.updatePlatformOwner)
				r.Delete("/owners/{id}", s.deletePlatformOwner)
				r.Get("/business-types", s.listBusinessTypes)
				r.Post("/business-types", s.createBusinessType)
				r.Patch("/business-types/{id}", s.updateBusinessType)
				r.Delete("/business-types/{id}", s.deleteBusinessType)
				r.Get("/territories/integration", s.platformGeoRDMapState)
				r.Post("/territories/integration", s.configurePlatformGeoRDMap)
				r.Patch("/territories/integration", s.configurePlatformGeoRDMap)
				r.Get("/territories/summary", s.territorySummary)
				r.Post("/territories/verify", s.verifyTerritoryData)
				r.Post("/territories/sync", s.syncTerritoryData)
				r.Get("/territories/neighborhoods/all", s.territoryAllNeighborhoods)
				r.Get("/territories/provinces", s.territoryProvinces)
				r.Get("/territories/districts", s.territoryDistricts)
				r.Get("/territories/neighborhoods", s.territoryNeighborhoods)
				r.Get("/territories/neighborhoods/custom", s.territoryCustomNeighborhoods)
				r.Post("/territories/neighborhoods/custom", s.createTerritoryCustomNeighborhood)
				r.Patch("/territories/neighborhoods/custom/{id}", s.updateTerritoryCustomNeighborhood)
				r.Delete("/territories/neighborhoods/custom/{id}", s.deleteTerritoryCustomNeighborhood)
				r.Get("/businesses", s.listTenants)
				r.Post("/businesses", s.createTenant)
				r.Get("/businesses/{id}", s.getTenant)
				r.Patch("/businesses/{id}", s.updateTenant)
				r.Patch("/businesses/{id}/status", s.updateTenantStatus)
				r.Post("/businesses/{id}/admin-session", s.createTenantAdminSession)
				r.Delete("/businesses/{id}", s.deleteTenant)
				r.Get("/businesses/{id}/domains", s.listTenantDomains)
				r.Post("/businesses/{id}/domains", s.addTenantDomain)
				r.Patch("/businesses/{id}/subscription", s.updateTenantSubscription)
				r.Get("/domains", s.listPlatformDomains)
				r.Patch("/domains/{id}/primary", s.setPrimaryDomain)
				r.Delete("/domains/{id}", s.deleteTenantDomain)
				r.Get("/databases", s.listPlatformDatabases)
				r.Get("/subscriptions", s.listSubscriptions)
				r.Get("/catalog", s.platformCatalog)
				r.Get("/catalog/barcode/{barcode}", s.platformCatalogBarcodeLookup)
				r.Post("/catalog/import-default", s.importPlatformCatalogDefault)
				r.Delete("/catalog", s.clearPlatformCatalog)
				r.Post("/catalog/categories", s.createPlatformCatalogCategory)
				r.Patch("/catalog/categories/{id}", s.updatePlatformCatalogCategory)
				r.Delete("/catalog/categories/{id}", s.deletePlatformCatalogCategory)
				r.Post("/catalog/groups", s.createPlatformCatalogGroup)
				r.Patch("/catalog/groups/{id}", s.updatePlatformCatalogGroup)
				r.Delete("/catalog/groups/{id}", s.deletePlatformCatalogGroup)
				r.Post("/catalog/details", s.createPlatformCatalogDetail)
				r.Patch("/catalog/details/{id}", s.updatePlatformCatalogDetail)
				r.Delete("/catalog/details/{id}", s.deletePlatformCatalogDetail)
				r.Post("/catalog/brands", s.createPlatformCatalogBrand)
				r.Patch("/catalog/brands/{id}", s.updatePlatformCatalogBrand)
				r.Delete("/catalog/brands/{id}", s.deletePlatformCatalogBrand)
				r.Post("/catalog/products", s.createPlatformCatalogProduct)
				r.Patch("/catalog/products/{id}/image", s.replacePlatformCatalogProductImage)
				r.Patch("/catalog/products/{id}", s.updatePlatformCatalogProduct)
				r.Delete("/catalog/products/{id}", s.deletePlatformCatalogProduct)
				r.Delete("/catalog/suggestions", s.clearPlatformCatalogSuggestions)
				r.Get("/customers", s.listPlatformCustomers)
				r.Get("/banks", s.listPlatformBanks)
				r.Post("/banks", s.createPlatformBank)
				r.Patch("/banks/{id}", s.updatePlatformBank)
				r.Delete("/banks/{id}", s.deletePlatformBank)
				r.Get("/settings", s.platformSettings)
				r.Patch("/settings", s.updatePlatformSettings)
				r.Get("/access-policy", s.platformAccessPolicy)
				r.Patch("/access-policy", s.updatePlatformAccessPolicy)
				r.Post("/access-policy/cta-image", s.uploadPlatformRecoveryCTAImage)
				r.Post("/waxum/configure", s.configurePlatformWaxum)
				r.Patch("/waxum/configure", s.configurePlatformWaxum)
				r.Get("/whatsapp", s.platformWhatsAppState)
				// Keep the original instance route as a stable compatibility alias.
				// Both routes now create or reconcile a WAXUM session through the
				// bundled SDK; no legacy provider logic remains behind the alias.
				r.Post("/whatsapp/instance", s.createPlatformWhatsAppSession)
				r.Post("/whatsapp/session", s.createPlatformWhatsAppSession)
				r.Post("/whatsapp/connect", s.connectPlatformWhatsApp)
				r.Get("/whatsapp/qr", s.platformWhatsAppQR)
				r.Post("/whatsapp/pairing-code", s.platformWhatsAppPairingCode)
				r.Get("/whatsapp/status", s.platformWhatsAppStatus)
				r.Post("/whatsapp/validate-number", s.platformWhatsAppValidateNumber)
				r.Post("/whatsapp/disconnect", s.platformWhatsAppDisconnect)
				r.Get("/identity", s.platformIdentityState)
				r.Post("/identity/configure", s.configurePlatformIdentity)
				r.Patch("/identity/configure", s.configurePlatformIdentity)
				r.With(s.requirePlatformIdentityVerificationPermission, s.rateLimitPlatformIdentity).Post("/identity/verify", s.verifyPlatformIdentity)
				r.Get("/notification-templates", s.listPlatformNotificationTemplates)
				r.Post("/notification-templates", s.createPlatformNotificationTemplate)
				r.Patch("/notification-templates/{id}", s.updatePlatformNotificationTemplate)
				r.Delete("/notification-templates/{id}", s.deletePlatformNotificationTemplate)
				r.Get("/audit-logs", s.listPlatformAuditLogs)
			})
		})
		r.Group(func(r chi.Router) {
			r.With(s.rateLimitIP, s.resolveTenantIdentity, s.rateLimitTenant).Get("/events", s.eventsStream)
		})
		r.Group(func(r chi.Router) {
			r.Use(s.rateLimitIP)
			r.Use(s.resolveTenant)
			r.Use(s.rateLimitTenant)
			r.Get("/tenant", s.currentTenant)
			r.Get("/territories/provinces", s.territoryProvinces)
			r.Get("/territories/districts", s.territoryDistricts)
			r.Get("/territories/neighborhoods", s.territoryNeighborhoods)
			r.Get("/territories/neighborhoods/custom", s.territoryCustomNeighborhoods)
			r.With(s.requireAdmin).Post("/territories/neighborhoods/custom", s.createTerritoryCustomNeighborhood)
			r.With(s.requireAdmin).Get("/geo/status", s.businessGeoStatus)
			r.With(s.requireAdmin).Post("/geo/geocode", s.businessGeoGeocode)
			r.With(s.requireAdmin).Post("/geo/reverse", s.businessGeoReverseGeocode)
			r.With(s.requireAdmin).Get("/admin/profile", s.adminProfile)
			r.With(s.requireAdmin).Patch("/admin/profile", s.updateAdminProfile)
			r.With(s.requireAdmin).Post("/admin/password", s.updateAdminPassword)
			r.With(s.requireAdmin).Get("/users", s.listSystemUsers)
			r.With(s.requireAdmin).Post("/users", s.createSystemUser)
			r.With(s.requireAdmin).Patch("/users/{id}", s.updateSystemUser)
			r.With(s.requireAdmin).Delete("/users/{id}", s.deleteSystemUser)
			r.With(s.rateLimitAuthentication).Post("/staff/login", s.staffLogin)
			r.With(s.requireStaff).Get("/staff/session", s.staffSession)
			r.With(s.requireStaff).Get("/staff/profile", s.staffProfile)
			r.With(s.requireStaff).Patch("/staff/profile", s.updateStaffProfile)
			r.With(s.requireStaff).Post("/staff/pin", s.updateStaffPin)
			r.With(s.rateLimitAuthentication).Post("/client/lookup", s.clientLookup)
			r.Post("/client/validate-whatsapp", s.clientValidateWhatsAppNumber)
			r.Post("/client/verify-identity", s.verifyClientIdentity)
			r.With(s.rateLimitAuthentication).Post("/client/register", s.clientRegister)
			r.With(s.rateLimitAuthentication).Post("/client/login", s.clientLogin)
			r.With(s.rateLimitAuthentication).Post("/account-recovery/request", s.requestAccountRecovery)
			r.With(s.rateLimitAuthentication).Post("/account-recovery/verify", s.verifyAccountRecovery)
			r.With(s.rateLimitAuthentication).Post("/account-recovery/reset", s.resetAccountSecret)
			r.With(s.requireCustomer).Get("/client/session", s.clientSession)
			r.With(s.requireCustomer).Patch("/client/profile", s.updateClientProfile)
			r.With(s.requireCustomer).Post("/client/geo/reverse", s.businessGeoReverseGeocode)
			r.With(s.requireCustomer).Post("/client/geo/geocode", s.businessGeoGeocode)
			r.With(s.requireCustomer).Get("/client/orders", s.clientOrders)
			r.With(s.requireCustomer).Get("/client/orders/{id}/tracking", s.clientDeliveryTracking)
			r.With(s.requireCustomer).Post("/client/orders/{id}/pickup", s.confirmClientPickup)
			r.With(s.requireCustomer).Post("/client/orders", s.createClientOrder)
			r.With(s.requireCustomer).Get("/client/cart", s.clientCart)
			r.With(s.requireCustomer).Patch("/client/cart", s.updateClientCart)
			r.With(s.requireCustomer).Delete("/client/cart", s.clearClientCart)
			r.With(s.requireCustomer).Get("/client/catalog/barcode/{barcode}", s.customerCatalogBarcodeLookup)
			r.With(s.requireCustomer).Post("/client/product-suggestions", s.createCustomerProductSuggestion)
			r.With(s.requireBusinessPermission(permissionDeliveryManage, "delivery_driver", "administrator")).Get("/delivery/orders", s.deliveryOrders)
			r.With(s.requireAdmin).Get("/delivery/live", s.adminDeliveryLiveOperations)
			r.With(s.requireBusinessPermission(permissionDeliveryManage, "delivery_driver", "administrator")).Get("/delivery/orders/{id}/route", s.deliveryRouteForOrder)
			r.With(s.requireAdmin).Get("/delivery/drivers", s.listDeliveryDrivers)
			r.With(s.requireAdmin).Post("/delivery/orders/{id}/assign", s.assignDeliveryOrder)
			r.With(s.requireAdmin).Patch("/orders/{id}/status", s.updateOrderStatus)
			r.With(s.requireBusinessPermission(permissionDeliveryManage, "delivery_driver")).Post("/delivery/orders/{id}/accept", s.acceptDeliveryOrder)
			r.With(s.requireBusinessPermission(permissionDeliveryManage, "delivery_driver")).Post("/delivery/orders/{id}/start", s.startDeliveryOrder)
			r.With(s.requireBusinessPermission(permissionDeliveryManage, "delivery_driver")).Post("/delivery/orders/{id}/complete", s.completeDeliveryOrder)
			r.With(s.requireBusinessPermission(permissionDeliveryManage, "delivery_driver")).Post("/delivery/orders/{id}/issue", s.reportDeliveryIssue)
			r.With(s.requireAdmin).Post("/delivery/orders/{id}/issue/resolve", s.resolveDeliveryIssue)
			r.With(s.requireBusinessPermission(permissionDeliveryManage, "delivery_driver")).Post("/delivery/location", s.updateDeliveryLocation)
			r.With(s.requireBusinessPermission(permissionDeliveryManage, "delivery_driver")).Post("/delivery/route/optimize", s.optimizeDeliveryRoute)
			r.Get("/bootstrap", s.bootstrap)
			r.Get("/stores", s.listStores)
			r.With(s.requireAdmin).Post("/stores", s.createStore)
			r.Get("/stores/{id}/data", s.storeData)
			r.With(s.requireAdmin).Patch("/stores/{id}", s.updateStore)
			r.With(s.requireAdmin).Delete("/stores/{id}", s.deleteStore)
			r.With(s.requireAdmin).Get("/delivery-zones", s.listDeliveryZones)
			r.With(s.requireAdmin).Post("/delivery-zones", s.createDeliveryZone)
			r.With(s.requireAdmin).Patch("/delivery-zones/{id}", s.updateDeliveryZone)
			r.With(s.requireAdmin).Post("/delivery-zones/{id}/geo-sync", s.syncDeliveryZoneGeo)
			r.With(s.requireAdmin).Delete("/delivery-zones/{id}", s.deleteDeliveryZone)

			r.With(s.requireAdmin).Post("/categories", s.createCategory)
			r.With(s.requireAdmin).Delete("/categories", s.deleteCategory)
			r.With(s.requireAdmin).Post("/brands", s.createBrand)
			r.With(s.requireAdmin).Delete("/brands", s.deleteBrand)

			r.With(s.requireAdmin).Get("/catalog/global", s.platformCatalog)
			r.With(s.requireAdmin).Get("/catalog/barcode/{barcode}", s.adminCatalogBarcodeLookup)
			r.With(s.requireAdmin).Get("/inventory/suggestions", s.listTenantProductSuggestions)
			r.With(s.requireAdmin).Patch("/inventory/suggestions/{id}", s.updateTenantProductSuggestion)

			r.With(s.requireAdmin).Post("/products", s.createProduct)
			r.With(s.requireAdmin).Patch("/products/{id}", s.updateProduct)
			r.With(s.requireAdmin).Delete("/products/{id}", s.deleteProduct)
			r.With(s.requireAdmin).Post("/products/{id}/stock", s.updateProductStock)
			r.With(s.requireAdmin).Get("/inventory/movements", s.listInventoryMovements)
			r.With(s.requireAdmin).Get("/inventory/purchase-suggestions", s.listPurchaseSuggestions)
			r.With(s.requireAdmin).Post("/inventory/purchase-suggestions/generate", s.generatePurchaseSuggestions)
			r.With(s.requireAdmin).Patch("/inventory/purchase-suggestions/{id}", s.updatePurchaseSuggestion)
			r.With(s.requireAdmin).Get("/inventory/batches", s.listProductBatches)
			r.With(s.requireAdmin).Post("/inventory/batches", s.createProductBatch)
			r.With(s.requireAdmin).Patch("/inventory/batches/{id}", s.updateProductBatch)
			r.With(s.requireAdmin).Get("/inventory/batches/{id}/movements", s.listProductBatchMovements)
			r.With(s.requireAdmin).Get("/inventory/batches/expiring", s.expiringBatchSummary)
			r.With(s.requireAdmin).Patch("/products/{id}/reorder-policy", s.updateProductReorderPolicy)

			r.With(s.requireAdmin).Get("/suppliers", s.listSuppliers)
			r.With(s.requireAdmin).Post("/suppliers", s.createSupplier)
			r.With(s.requireAdmin).Patch("/suppliers/{id}", s.updateSupplier)
			r.With(s.requireAdmin).Get("/suppliers/payables", s.listSupplierPayables)
			r.With(s.requireAdmin).Post("/suppliers/{id}/payments", s.recordSupplierPayment)
			r.With(s.requireAdmin).Get("/purchase-orders", s.listPurchaseOrders)
			r.With(s.requireAdmin).Post("/purchase-orders", s.createPurchaseOrder)
			r.With(s.requireAdmin).Get("/purchase-orders/{id}", s.purchaseOrderDetail)
			r.With(s.requireAdmin).Post("/purchase-orders/{id}/submit", s.submitPurchaseOrder)
			r.With(s.requireAdmin).Post("/purchase-orders/{id}/cancel", s.cancelPurchaseOrder)
			r.With(s.requireAdmin).Post("/purchase-orders/{id}/receive", s.receivePurchaseOrder)

			r.With(s.requireBusinessPermission(permissionSalesView, "cashier", "administrator")).Get("/sales", s.listSalesPaginated)
			r.With(s.requireBusinessPermission(permissionSalesCreate, "cashier", "administrator")).Post("/sales", s.createSale)
			r.With(s.requireAdmin).Post("/sales/{id}/void", s.voidSale)
			r.With(s.requireAdmin).Post("/sales/{id}/returns", s.returnSaleItems)
			r.With(s.requireBusinessPermission(permissionSalesCreate, "cashier", "administrator")).Post("/assisted-orders/customer-lookup", s.assistedOrderCustomerLookup)
			r.With(s.requireBusinessPermission(permissionSalesCreate, "cashier", "administrator")).Post("/assisted-orders", s.createAssistedOrder)
			r.With(s.requireAdmin).Post("/store-credits", s.createStoreCredit)
			r.With(s.requireBusinessPermission(permissionCreditCollect, "cashier", "administrator")).Post("/store-credits/customer-payment", s.recordCustomerStoreCreditPayment)
			r.With(s.requireBusinessPermission(permissionCreditCollect, "cashier", "administrator")).Patch("/store-credits/{id}/payment", s.recordStoreCreditPartialPayment)

			r.With(s.requireBusinessPermission(permissionCustomersView, "cashier", "administrator")).Get("/customers", s.listBusinessCustomers)
			r.With(s.requireAdmin).Post("/customers", s.createCustomer)
			r.With(s.requireAdmin).Patch("/customers/{id}", s.updateCustomer)
			r.With(s.requireAdmin).Delete("/customers/{id}", s.deleteCustomer)

			r.Get("/banks", s.listTenantBankCatalog)
			r.Get("/bank-accounts/public", s.listPublicBankAccounts)
			r.With(s.requireAdmin).Post("/bank-accounts", s.createBankAccount)
			r.With(s.requireAdmin).Patch("/bank-accounts/{id}", s.updateBankAccount)
			r.With(s.requireAdmin).Delete("/bank-accounts/{id}", s.deleteBankAccount)

			r.With(s.requireBusinessPermission(permissionCashManage, "cashier", "administrator")).Post("/cash-history", s.createCashHistory)
			r.With(s.requireBusinessPermission(permissionCashManage, "cashier", "administrator")).Get("/cash/sessions/current", s.currentCashSession)
			r.With(s.requireAdmin).Get("/cash/sessions", s.listCashSessions)
			r.With(s.requireBusinessPermission(permissionCashManage, "cashier", "administrator")).Post("/cash/sessions", s.openCashSession)
			r.With(s.requireBusinessPermission(permissionCashManage, "cashier", "administrator")).Post("/cash/movements", s.createCashMovement)
			r.With(s.requireBusinessPermission(permissionCashManage, "cashier", "administrator")).Post("/cash/sessions/{id}/close", s.closeCashSession)
			r.With(s.requireAdmin).Get("/reports/summary", s.businessReportSummary)
			r.With(s.requireAdmin).Get("/accounting/dashboard", s.accountingDashboard)
			r.With(s.requireAdmin).Get("/accounting/opening-balance", s.accountingOpeningBalance)
			r.With(s.requireAdmin).Post("/accounting/opening-balance", s.initializeAccountingOpeningBalance)
			r.With(s.requireAdmin).Get("/accounting/accounts", s.listAccountingAccounts)
			r.With(s.requireAdmin).Post("/accounting/accounts", s.createAccountingAccount)
			r.With(s.requireAdmin).Patch("/accounting/accounts/{id}", s.updateAccountingAccount)
			r.With(s.requireAdmin).Get("/accounting/journal-entries", s.listJournalEntries)
			r.With(s.requireAdmin).Post("/accounting/journal-entries", s.createJournalEntry)
			r.With(s.requireAdmin).Get("/accounting/journal-entries/{id}", s.journalEntryDetail)
			r.With(s.requireAdmin).Post("/accounting/journal-entries/{id}/post", s.postJournalEntry)
			r.With(s.requireAdmin).Post("/accounting/journal-entries/{id}/void", s.voidJournalEntry)
			r.With(s.requireAdmin).Get("/accounting/trial-balance", s.accountingTrialBalance)
			r.With(s.requireAdmin).Get("/accounting/ledger", s.accountingGeneralLedger)
			r.With(s.requireAdmin).Get("/accounting/periods", s.listAccountingPeriods)
			r.With(s.requireAdmin).Post("/accounting/periods", s.createAccountingPeriod)
			r.With(s.requireAdmin).Post("/accounting/periods/{id}/close", s.closeAccountingPeriod)
			r.With(s.requireAdmin).Get("/audit-logs", s.listBusinessAuditLogs)
			r.With(s.requireAdminOrStaffRoles("cashier", "delivery_driver", "administrator")).Get("/notifications", s.listBusinessNotifications)
			r.With(s.requireAdminOrStaffRoles("cashier", "delivery_driver", "administrator")).Patch("/notifications/{id}/read", s.markBusinessNotificationRead)
		})
	})
	return r
}

func (s *Server) cors(next http.Handler) http.Handler {
	allowed := map[string]bool{}
	for _, origin := range s.cfg.CORSAllowedOrigins {
		allowed[origin] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && (allowed[origin] || allowed["*"]) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key, X-Requested-With, X-WAMERCIO-Device-ID, X-WAMERCIO-Tenant, X-WAMERCIO-Tenant-Slug, X-Tenant-Slug, X-Tenant")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type platformLoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type platformTokenPayload struct {
	Username  string `json:"username"`
	UserID    string `json:"user_id,omitempty"`
	Role      string `json:"role,omitempty"`
	Scope     string `json:"scope"`
	ExpiresAt int64  `json:"expires_at"`
}

type platformUserContextKey struct{}

func (s *Server) platformLogin(w http.ResponseWriter, r *http.Request) {
	var input platformLoginRequest
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	username := strings.TrimSpace(input.Username)
	failureKey := s.authFailureKey(r, "platform", username)
	if s.authLocked(r.Context(), failureKey) {
		s.rejectLockedAuthentication(w)
		return
	}
	if _, err := s.ensurePlatformRootUser(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	user, err := s.platformSuperadminByLogin(r.Context(), username)
	if err != nil || !user.Active || normalizePlatformRole(user.Role) != "superadmin" {
		s.recordAuthenticationFailure(r.Context(), failureKey)
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Usuario o contraseña de superadministración incorrectos"})
		return
	}
	passwordOK, upgrade := verifyAccessSecret(user.PasswordHash, input.Password)
	if !passwordOK {
		s.recordAuthenticationFailure(r.Context(), failureKey)
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Usuario o contraseña de superadministración incorrectos"})
		return
	}
	if upgrade {
		_ = upgradeAccessSecretHash(func(hash string) error {
			_, updateErr := s.platformDB().Exec(r.Context(), `UPDATE platform_users SET password_hash=$2, updated_at=now() WHERE id=$1::uuid`, user.ID, hash)
			if updateErr == nil {
				user.PasswordHash = hash
			}
			return updateErr
		}, input.Password)
	}
	token, err := s.issuePlatformToken(user)
	if err != nil {
		writeError(w, err)
		return
	}
	s.clearAuthenticationFailures(r.Context(), failureKey)
	s.setSessionCookie(w, platformSessionCookie, token, 12*time.Hour)
	writeJSON(w, http.StatusOK, map[string]any{
		"token":       "cookie",
		"user":        user,
		"role":        user.Role,
		"permissions": user.Permissions,
		"expires_in":  int64(12 * time.Hour / time.Second),
	})
}

func (s *Server) platformSession(w http.ResponseWriter, r *http.Request) {
	user, ok := platformUserFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Sesión de plataforma no válida"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"authenticated": true, "user": user, "role": user.Role, "permissions": user.Permissions})
}

func (s *Server) requirePlatformAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		secret := strings.TrimSpace(r.Header.Get("X-Platform-Secret"))
		if secret == "" {
			candidate := bearerOrCookieToken(r, platformSessionCookie)
			if subtle.ConstantTimeCompare([]byte(candidate), []byte(strings.TrimSpace(s.cfg.PlatformAdminSecret))) == 1 {
				secret = candidate
			} else if user, err := s.validatePlatformToken(r.Context(), candidate); err == nil {
				ctx := context.WithValue(r.Context(), platformUserContextKey{}, user)
				setRequestActor(ctx, user.ID, user.Role)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}
		expected := strings.TrimSpace(s.cfg.PlatformAdminSecret)
		if expected == "" || subtle.ConstantTimeCompare([]byte(secret), []byte(expected)) != 1 {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Se requiere una sesión de superadministración para administrar la plataforma"})
			return
		}
		user, err := s.ensurePlatformRootUser(r.Context())
		if err != nil {
			writeError(w, err)
			return
		}
		ctx := context.WithValue(r.Context(), platformUserContextKey{}, user)
		setRequestActor(ctx, user.ID, user.Role)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) issuePlatformToken(user PlatformUser) (string, error) {
	payload := platformTokenPayload{Username: user.Username, UserID: user.ID, Role: user.Role, Scope: "platform", ExpiresAt: time.Now().Add(12 * time.Hour).Unix()}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	body := base64.RawURLEncoding.EncodeToString(payloadJSON)
	mac := hmac.New(sha256.New, []byte("platform:"+s.cfg.PlatformTokenSecret))
	mac.Write([]byte(body))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return body + "." + sig, nil
}

func (s *Server) validatePlatformToken(ctx context.Context, token string) (PlatformUser, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return PlatformUser{}, errors.New("invalid token")
	}
	mac := hmac.New(sha256.New, []byte("platform:"+s.cfg.PlatformTokenSecret))
	mac.Write([]byte(parts[0]))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if subtle.ConstantTimeCompare([]byte(expected), []byte(parts[1])) != 1 {
		return PlatformUser{}, errors.New("invalid token signature")
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return PlatformUser{}, err
	}
	var payload platformTokenPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return PlatformUser{}, err
	}
	if payload.Scope != "platform" || strings.TrimSpace(payload.Username) == "" || time.Now().Unix() > payload.ExpiresAt {
		return PlatformUser{}, errors.New("expired token")
	}
	user, err := s.platformUserByUsername(ctx, payload.Username)
	if err != nil || !user.Active {
		return PlatformUser{}, errors.New("inactive platform user")
	}
	return user, nil
}

func (s *Server) resolveTenant(next http.Handler) http.Handler {
	return s.resolveTenantContext(next, true)
}

func (s *Server) resolveTenantIdentity(next http.Handler) http.Handler {
	return s.resolveTenantContext(next, false)
}

func (s *Server) resolveTenantContext(next http.Handler, openPool bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.tenantManager == nil {
			next.ServeHTTP(w, r)
			return
		}
		var tenant tenancy.Tenant
		var pool *pgxpool.Pool
		var err error
		if openPool {
			tenant, pool, err = s.tenantManager.ResolveRequest(r.Context(), r)
		} else {
			tenant, err = s.tenantManager.ResolveRequestTenant(r.Context(), r)
		}
		if err != nil {
			// A tenant administrator may operate from the central SaaS domain. The
			// frontend normally sends X-WAMERCIO-Tenant, but a token that belongs to
			// exactly one tenant is also safe to resolve automatically.
			if openPool {
				tenant, pool, err = s.resolveSingleAdminTenant(r)
			} else {
				tenant, err = s.resolveSingleAdminTenantIdentity(r)
			}
		}
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "No se encontró un negocio activo para este dominio o subdominio"})
			return
		}
		ctx := tenancy.WithTenant(r.Context(), tenant, pool)
		setRequestTenant(ctx, tenant.ID)
		w.Header().Set("X-WAMERCIO-Tenant", tenant.Slug)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) resolveSingleAdminTenant(r *http.Request) (tenancy.Tenant, *pgxpool.Pool, error) {
	tenant, err := s.resolveSingleAdminTenantIdentity(r)
	if err != nil {
		return tenancy.Tenant{}, nil, err
	}
	pool, err := s.tenantManager.Pool(r.Context(), tenant)
	if err != nil {
		return tenancy.Tenant{}, nil, err
	}
	return tenant, pool, nil
}

func (s *Server) resolveSingleAdminTenantIdentity(r *http.Request) (tenancy.Tenant, error) {
	if s.tenantManager == nil {
		return tenancy.Tenant{}, errors.New("tenant manager unavailable")
	}
	token := bearerOrCookieToken(r, adminSessionCookie)
	if token == "" {
		return tenancy.Tenant{}, errors.New("admin token unavailable")
	}
	payload, err := s.validateAdminTokenPayload(r.Context(), token)
	if err != nil {
		return tenancy.Tenant{}, err
	}
	refs := make([]string, 0, len(payload.TenantIDs)+1)
	seen := map[string]bool{}
	for _, ref := range append(payload.TenantIDs, payload.TenantID) {
		ref = strings.TrimSpace(ref)
		if ref != "" && !seen[ref] {
			seen[ref] = true
			refs = append(refs, ref)
		}
	}
	if len(refs) != 1 {
		return tenancy.Tenant{}, errors.New("an explicit tenant is required")
	}
	tenant, err := s.tenantManager.ResolveReference(r.Context(), refs[0])
	if err != nil {
		return tenancy.Tenant{}, err
	}
	return tenant, nil
}

type platformOwner struct {
	ID                           string     `json:"id"`
	FirstName                    string     `json:"first_name"`
	LastName                     string     `json:"last_name"`
	Name                         string     `json:"name"`
	Whatsapp                     string     `json:"whatsapp"`
	ProfilePictureURL            string     `json:"profile_picture_url"`
	NationalID                   string     `json:"national_id"`
	BirthDate                    string     `json:"birth_date"`
	Gender                       string     `json:"gender"`
	Province                     string     `json:"province"`
	Municipality                 string     `json:"municipality"`
	Neighborhood                 string     `json:"neighborhood"`
	Status                       string     `json:"status"`
	IdentityVerifiedAt           *time.Time `json:"identity_verified_at,omitempty"`
	IdentityVerificationStatus   string     `json:"identity_verification_status"`
	IdentitySource               string     `json:"identity_source,omitempty"`
	IdentityRequestID            string     `json:"identity_request_id,omitempty"`
	IdentityRequiresConfirmation bool       `json:"identity_requires_confirmation"`
	IdentityConfirmedByUser      bool       `json:"identity_confirmed_by_user"`
	TenantsCount                 int64      `json:"tenants_count"`
	CreatedAt                    time.Time  `json:"created_at"`
	UpdatedAt                    time.Time  `json:"updated_at"`
}

type platformOwnerInput struct {
	FirstName         string `json:"first_name"`
	LastName          string `json:"last_name"`
	Name              string `json:"name"`
	Whatsapp          string `json:"whatsapp"`
	ProfilePictureURL string `json:"profile_picture_url"`
	NationalID        string `json:"national_id"`
	BirthDate         string `json:"birth_date"`
	Gender            string `json:"gender"`
	Province          string `json:"province"`
	Municipality      string `json:"municipality"`
	Neighborhood      string `json:"neighborhood"`
	Status            string `json:"status"`
	Password          string `json:"password"`
	PIN               string `json:"pin"`
	IdentityConfirmed bool   `json:"identity_confirmed"`
}

func scanPlatformOwner(row pgx.Row) (platformOwner, error) {
	var item platformOwner
	err := row.Scan(&item.ID, &item.FirstName, &item.LastName, &item.Name, &item.Whatsapp, &item.ProfilePictureURL, &item.NationalID, &item.BirthDate, &item.Gender, &item.Province, &item.Municipality, &item.Neighborhood, &item.Status, &item.IdentityVerifiedAt, &item.IdentityVerificationStatus, &item.IdentitySource, &item.IdentityRequestID, &item.IdentityRequiresConfirmation, &item.IdentityConfirmedByUser, &item.TenantsCount, &item.CreatedAt, &item.UpdatedAt)
	if err == nil {
		item.FirstName = normalizePersonName(item.FirstName)
		item.LastName = normalizePersonName(item.LastName)
		item.Name = normalizePersonName(item.Name)
	}
	return item, err
}

func platformOwnerSelect(where string) string {
	return `
		SELECT o.id::text, o.first_name, o.last_name, COALESCE(NULLIF(o.name,''), trim(o.first_name || ' ' || o.last_name)),
		       o.whatsapp, COALESCE(o.profile_picture_url,''), o.national_id, COALESCE(o.birth_date,''), COALESCE(o.gender,''), o.province, o.municipality, o.neighborhood, o.status,
		       o.identity_verified_at, COALESCE(o.identity_verification_status,'unverified'), COALESCE(o.identity_source,''),
		       COALESCE(o.identity_request_id,''), COALESCE(o.identity_requires_confirmation,false), COALESCE(o.identity_confirmed_by_user,false),
		       (SELECT count(*) FROM tenants t WHERE t.owner_id=o.id), o.created_at, o.updated_at
		FROM platform_owners o
	` + where
}

func normalizeOwnerInput(input platformOwnerInput) platformOwnerInput {
	input.Name = normalizePersonName(input.Name)
	input.FirstName = normalizePersonName(input.FirstName)
	input.LastName = normalizePersonName(input.LastName)
	if input.FirstName == "" && input.Name != "" {
		parts := strings.Fields(input.Name)
		if len(parts) > 0 {
			input.FirstName = normalizePersonName(parts[0])
		}
		if len(parts) > 1 && input.LastName == "" {
			input.LastName = normalizePersonName(strings.Join(parts[1:], " "))
		}
	}
	if input.FirstName != "" || input.LastName != "" {
		input.Name = normalizePersonName(strings.Join([]string{input.FirstName, input.LastName}, " "))
	}
	input.Whatsapp = strings.TrimSpace(input.Whatsapp)
	input.NationalID = normalizeNationalID(input.NationalID)
	input.BirthDate = normalizePersonBirthDate(input.BirthDate)
	input.Gender = normalizePersonGender(input.Gender)
	input.Province = strings.TrimSpace(input.Province)
	input.Municipality = strings.TrimSpace(input.Municipality)
	input.Neighborhood = strings.TrimSpace(input.Neighborhood)
	input.Status = strings.ToLower(strings.TrimSpace(input.Status))
	if input.Status == "" {
		input.Status = "active"
	}
	return input
}

func (s *Server) listPlatformOwners(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeJSON(w, http.StatusOK, []platformOwner{})
		return
	}
	rows, err := s.tenantManager.CoreDB().Query(r.Context(), platformOwnerSelect(`ORDER BY o.created_at DESC`))
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []platformOwner{}
	for rows.Next() {
		item, err := scanPlatformOwner(rows)
		if err != nil {
			writeError(w, err)
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, err)
		return
	}
	items = s.hydratePlatformOwnerAvatars(r.Context(), items)
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) hydratePlatformOwnerAvatars(ctx context.Context, items []platformOwner) []platformOwner {
	if len(items) == 0 || s.tenantManager == nil {
		return items
	}
	for i := range items {
		if strings.TrimSpace(items[i].ProfilePictureURL) != "" || strings.TrimSpace(items[i].Whatsapp) == "" {
			continue
		}
		url := s.fetchPlatformWhatsAppAvatarURL(ctx, items[i].Whatsapp)
		if url == "" {
			continue
		}
		items[i].ProfilePictureURL = url
		_, _ = s.tenantManager.CoreDB().Exec(ctx, `UPDATE platform_owners SET profile_picture_url=$2, updated_at=now() WHERE id=$1::uuid`, items[i].ID, url)
	}
	return items
}

func (s *Server) createPlatformOwner(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	var input platformOwnerInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input = normalizeOwnerInput(input)
	if input.Name == "" || onlyDigits(input.Whatsapp) == "" {
		writeError(w, badRequest("Nombre y WhatsApp del propietario son requeridos"))
		return
	}
	input, identityVerification, err := s.verifyPlatformOwnerIdentityForSave(r.Context(), input, requestTraceID(r), identityDeviceKeyFromRequest(r))
	if err != nil {
		writeError(w, err)
		return
	}
	if err := validatePersonDemographics(input.BirthDate, input.Gender); err != nil {
		writeError(w, err)
		return
	}
	validation, err := s.validatePlatformWhatsAppNumberForSave(r.Context(), input.Whatsapp)
	if err != nil {
		writeError(w, err)
		return
	}
	input.ProfilePictureURL = firstNonEmpty(strings.TrimSpace(input.ProfilePictureURL), validation.ProfilePictureURL)
	pin := onlyDigits(firstNonEmpty(input.PIN, input.Password))
	if !s.validNewAccessPIN(r.Context(), pin) {
		writeError(w, badRequest(fmt.Sprintf("Debes definir un PIN de %d dígitos para el propietario", s.accessPINLength(r.Context()))))
		return
	}
	passwordHash, err := hashAccessSecret(pin)
	if err != nil {
		writeError(w, err)
		return
	}
	item, err := scanPlatformOwner(s.tenantManager.CoreDB().QueryRow(r.Context(), `
		INSERT INTO platform_owners (first_name,last_name,name,whatsapp,whatsapp_digits,profile_picture_url,national_id,national_id_digits,birth_date,gender,province,municipality,neighborhood,status,password_hash,identity_verified_at,identity_verification_status,identity_source,identity_request_id,identity_requires_confirmation,identity_confirmed_by_user)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
		RETURNING id::text, first_name, last_name, COALESCE(NULLIF(name,''), trim(first_name || ' ' || last_name)), whatsapp, COALESCE(profile_picture_url,''), national_id, COALESCE(birth_date,''), COALESCE(gender,''), province, municipality, neighborhood, status,
		          identity_verified_at, identity_verification_status, identity_source, identity_request_id, identity_requires_confirmation, identity_confirmed_by_user,
		          0::bigint, created_at, updated_at
	`, input.FirstName, input.LastName, input.Name, input.Whatsapp, onlyDigits(input.Whatsapp), input.ProfilePictureURL, input.NationalID, onlyDigits(input.NationalID), input.BirthDate, input.Gender, input.Province, input.Municipality, input.Neighborhood, input.Status, passwordHash, identityVerification.VerifiedAt, identityVerification.Status, identityVerification.Source, identityVerification.RequestID, identityVerification.RequiresConfirmation, identityVerification.ConfirmedByUser))
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, badRequest("Ya existe un propietario con ese WhatsApp o cédula"))
			return
		}
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), s.platformActor(r), "", "owner.create", map[string]any{
		"owner_id":        item.ID,
		"name":            item.Name,
		"whatsapp":        item.Whatsapp,
		"national_id":     maskIdentityDocument(item.NationalID),
		"identity_status": item.IdentityVerificationStatus,
		"identity_source": item.IdentitySource,
		"request_id":      item.IdentityRequestID,
	})
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) updatePlatformOwner(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	var input platformOwnerInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input = normalizeOwnerInput(input)
	if input.Status != "active" && input.Status != "disabled" {
		writeError(w, badRequest("Estado de propietario inválido"))
		return
	}
	if input.Name == "" || onlyDigits(input.Whatsapp) == "" {
		writeError(w, badRequest("Nombre y WhatsApp del propietario son requeridos"))
		return
	}
	input, identityVerification, err := s.verifyPlatformOwnerIdentityForSave(r.Context(), input, requestTraceID(r), identityDeviceKeyFromRequest(r))
	if err != nil {
		writeError(w, err)
		return
	}
	if err := validatePersonDemographics(input.BirthDate, input.Gender); err != nil {
		writeError(w, err)
		return
	}
	validation, err := s.validatePlatformWhatsAppNumberForSave(r.Context(), input.Whatsapp)
	if err != nil {
		writeError(w, err)
		return
	}
	input.ProfilePictureURL = firstNonEmpty(strings.TrimSpace(input.ProfilePictureURL), validation.ProfilePictureURL)
	pin := onlyDigits(firstNonEmpty(input.PIN, input.Password))
	if pin != "" && !s.validNewAccessPIN(r.Context(), pin) {
		writeError(w, badRequest(accessPINLengthMessage(s.accessPINLength(r.Context()))))
		return
	}
	passwordHash := ""
	if pin != "" {
		passwordHash, err = hashAccessSecret(pin)
		if err != nil {
			writeError(w, err)
			return
		}
	}
	ownerID := chi.URLParam(r, "id")
	item, err := scanPlatformOwner(s.tenantManager.CoreDB().QueryRow(r.Context(), `
		UPDATE platform_owners
		SET first_name=$2, last_name=$3, name=$4, whatsapp=$5, whatsapp_digits=$6, profile_picture_url=$7,
		    national_id=$8, national_id_digits=$9, birth_date=$10, gender=$11, province=$12, municipality=$13, neighborhood=$14,
		    status=$15, password_hash=CASE WHEN NULLIF($16,'') IS NULL THEN password_hash ELSE $16 END,
		    identity_verified_at=$17, identity_verification_status=$18, identity_source=$19, identity_request_id=$20,
		    identity_requires_confirmation=$21, identity_confirmed_by_user=$22, updated_at=now()
		WHERE id=$1::uuid
		RETURNING id::text, first_name, last_name, COALESCE(NULLIF(name,''), trim(first_name || ' ' || last_name)), whatsapp, COALESCE(profile_picture_url,''), national_id, COALESCE(birth_date,''), COALESCE(gender,''), province, municipality, neighborhood, status,
		          identity_verified_at, identity_verification_status, identity_source, identity_request_id, identity_requires_confirmation, identity_confirmed_by_user,
		          (SELECT count(*) FROM tenants t WHERE t.owner_id=platform_owners.id), created_at, updated_at
	`, ownerID, input.FirstName, input.LastName, input.Name, input.Whatsapp, onlyDigits(input.Whatsapp), input.ProfilePictureURL, input.NationalID, onlyDigits(input.NationalID), input.BirthDate, input.Gender, input.Province, input.Municipality, input.Neighborhood, input.Status, passwordHash, identityVerification.VerifiedAt, identityVerification.Status, identityVerification.Source, identityVerification.RequestID, identityVerification.RequiresConfirmation, identityVerification.ConfirmedByUser))
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Propietario no encontrado"})
		return
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, badRequest("Ya existe un propietario con ese WhatsApp o cédula"))
			return
		}
		writeError(w, err)
		return
	}
	_, _ = s.tenantManager.CoreDB().Exec(r.Context(), `UPDATE tenants SET owner_name=$2, owner_whatsapp=$3, updated_at=now() WHERE owner_id=$1::uuid`, ownerID, item.Name, item.Whatsapp)
	s.auditPlatform(r.Context(), s.platformActor(r), "", "owner.update", map[string]any{
		"owner_id":        item.ID,
		"name":            item.Name,
		"national_id":     maskIdentityDocument(item.NationalID),
		"identity_status": item.IdentityVerificationStatus,
		"identity_source": item.IdentitySource,
		"request_id":      item.IdentityRequestID,
	})
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) deletePlatformOwner(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	ownerID := chi.URLParam(r, "id")
	var count int64
	_ = s.tenantManager.CoreDB().QueryRow(r.Context(), `SELECT count(*) FROM tenants WHERE owner_id=$1::uuid`, ownerID).Scan(&count)
	if count > 0 {
		writeError(w, badRequest("No se puede eliminar un propietario con negocios asignados. Desactívalo o reasigna sus negocios."))
		return
	}
	cmd, err := s.tenantManager.CoreDB().Exec(r.Context(), `DELETE FROM platform_owners WHERE id=$1::uuid`, ownerID)
	if err != nil {
		writeError(w, err)
		return
	}
	if cmd.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Propietario no encontrado"})
		return
	}
	s.auditPlatform(r.Context(), s.platformActor(r), "", "owner.delete", map[string]any{"owner_id": ownerID})
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

type platformBusinessType struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Slug         string    `json:"slug"`
	DomainSuffix string    `json:"domain_suffix"`
	Emoji        string    `json:"emoji"`
	SortOrder    int       `json:"sort_order"`
	Active       bool      `json:"active"`
	TenantsCount int64     `json:"tenants_count"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func scanBusinessType(row pgx.Row) (platformBusinessType, error) {
	var item platformBusinessType
	err := row.Scan(&item.ID, &item.Name, &item.Slug, &item.DomainSuffix, &item.Emoji, &item.SortOrder, &item.Active, &item.TenantsCount, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}

func businessTypeSelect(where string) string {
	return `
		SELECT bt.id::text, bt.name, bt.slug, bt.domain_suffix, bt.emoji, bt.sort_order, bt.active,
		       (SELECT count(*) FROM tenants t WHERE t.metadata->>'business_type_id'=bt.id::text), bt.created_at, bt.updated_at
		FROM platform_business_types bt
	` + where
}

func (s *Server) listBusinessTypes(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeJSON(w, http.StatusOK, []platformBusinessType{})
		return
	}
	rows, err := s.tenantManager.CoreDB().Query(r.Context(), businessTypeSelect(`ORDER BY active DESC, sort_order ASC, name ASC`))
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []platformBusinessType{}
	for rows.Next() {
		item, err := scanBusinessType(rows)
		if err != nil {
			writeError(w, err)
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func normalizeDomainSuffix(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.TrimPrefix(value, "https://")
	value = strings.TrimPrefix(value, "http://")
	value = strings.Trim(value, " /")
	if value == "" {
		return ".ltd.do"
	}
	if !strings.HasPrefix(value, ".") {
		value = "." + value
	}
	return value
}

func (s *Server) createBusinessType(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS no está activo"))
		return
	}
	var input struct {
		Name         string `json:"name"`
		Slug         string `json:"slug"`
		DomainSuffix string `json:"domain_suffix"`
		Emoji        string `json:"emoji"`
		SortOrder    int    `json:"sort_order"`
		Active       bool   `json:"active"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		writeError(w, badRequest("El nombre del tipo de negocio es requerido"))
		return
	}
	slug := tenancy.NormalizeSlug(firstNonEmpty(input.Slug, name))
	if slug == "" {
		writeError(w, badRequest("El slug del tipo de negocio es requerido"))
		return
	}
	emoji := strings.TrimSpace(input.Emoji)
	if emoji == "" {
		emoji = "🏪"
	}
	item, err := scanBusinessType(s.tenantManager.CoreDB().QueryRow(r.Context(), `
		INSERT INTO platform_business_types (name, slug, domain_suffix, emoji, sort_order, active)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id::text, name, slug, domain_suffix, emoji, sort_order, active,
		          0::bigint, created_at, updated_at
	`, name, slug, normalizeDomainSuffix(input.DomainSuffix), emoji, input.SortOrder, input.Active))
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), s.platformActor(r), "", "business_type.create", map[string]any{"id": item.ID, "name": item.Name})
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) updateBusinessType(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS no está activo"))
		return
	}
	var input struct {
		Name         string `json:"name"`
		Slug         string `json:"slug"`
		DomainSuffix string `json:"domain_suffix"`
		Emoji        string `json:"emoji"`
		SortOrder    int    `json:"sort_order"`
		Active       bool   `json:"active"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		writeError(w, badRequest("El nombre del tipo de negocio es requerido"))
		return
	}
	slug := tenancy.NormalizeSlug(firstNonEmpty(input.Slug, name))
	emoji := strings.TrimSpace(input.Emoji)
	if emoji == "" {
		emoji = "🏪"
	}
	item, err := scanBusinessType(s.tenantManager.CoreDB().QueryRow(r.Context(), `
		UPDATE platform_business_types
		SET name=$2, slug=$3, domain_suffix=$4, emoji=$5, sort_order=$6, active=$7, updated_at=now()
		WHERE id=$1::uuid
		RETURNING id::text, name, slug, domain_suffix, emoji, sort_order, active,
		          (SELECT count(*) FROM tenants t WHERE t.metadata->>'business_type_id'=platform_business_types.id::text), created_at, updated_at
	`, chi.URLParam(r, "id"), name, slug, normalizeDomainSuffix(input.DomainSuffix), emoji, input.SortOrder, input.Active))
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), s.platformActor(r), "", "business_type.update", map[string]any{"id": item.ID, "name": item.Name})
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) deleteBusinessType(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS no está activo"))
		return
	}
	id := chi.URLParam(r, "id")
	var count int64
	_ = s.tenantManager.CoreDB().QueryRow(r.Context(), `SELECT count(*) FROM tenants WHERE metadata->>'business_type_id'=$1`, id).Scan(&count)
	if count > 0 {
		writeError(w, badRequest("No puedes eliminar un tipo con negocios asignados"))
		return
	}
	cmd, err := s.tenantManager.CoreDB().Exec(r.Context(), `DELETE FROM platform_business_types WHERE id=$1::uuid`, id)
	if err != nil {
		writeError(w, err)
		return
	}
	if cmd.RowsAffected() == 0 {
		writeError(w, notFound("Tipo de negocio no encontrado"))
		return
	}
	s.auditPlatform(r.Context(), s.platformActor(r), "", "business_type.delete", map[string]any{"id": id})
	w.WriteHeader(http.StatusNoContent)
}

type platformTenant struct {
	ID                 string     `json:"id"`
	Name               string     `json:"name"`
	Slug               string     `json:"slug"`
	Status             string     `json:"status"`
	PlanSlug           string     `json:"plan_slug"`
	OwnerID            string     `json:"owner_id"`
	OwnerName          string     `json:"owner_name"`
	OwnerWhatsapp      string     `json:"owner_whatsapp"`
	RNC                string     `json:"rnc"`
	LegalName          string     `json:"legal_name"`
	CommercialName     string     `json:"commercial_name"`
	IdentityStatus     string     `json:"identity_verification_status"`
	IdentitySource     string     `json:"identity_source"`
	IdentityRequestID  string     `json:"identity_request_id"`
	IdentityVerifiedAt string     `json:"identity_verified_at"`
	IdentityConfirmed  bool       `json:"identity_confirmed_by_user"`
	Province           string     `json:"province"`
	ProvinceCode       string     `json:"province_code"`
	Municipality       string     `json:"municipality"`
	MunicipalityCode   string     `json:"municipality_code"`
	DistrictCode       string     `json:"district_code"`
	Neighborhood       string     `json:"neighborhood"`
	NeighborhoodID     string     `json:"neighborhood_id"`
	Street             string     `json:"street"`
	Number             string     `json:"street_number"`
	Address            string     `json:"address"`
	DeliveryScope      string     `json:"delivery_scope"`
	DomainID           string     `json:"domain_id"`
	Domain             string     `json:"domain"`
	DatabaseName       string     `json:"database_name"`
	DatabaseStatus     string     `json:"database_status"`
	SubscriptionStatus string     `json:"subscription_status"`
	BillingPeriod      string     `json:"billing_period"`
	NextBillingAt      *time.Time `json:"next_billing_at,omitempty"`
	DomainsCount       int64      `json:"domains_count"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

func (s *Server) scanPlatformTenant(row pgx.Row) (platformTenant, error) {
	var item platformTenant
	var nextBilling sql.NullTime
	err := row.Scan(
		&item.ID, &item.Name, &item.Slug, &item.Status, &item.PlanSlug, &item.OwnerID, &item.OwnerName, &item.OwnerWhatsapp,
		&item.RNC, &item.LegalName, &item.CommercialName, &item.IdentityStatus, &item.IdentitySource, &item.IdentityRequestID, &item.IdentityVerifiedAt, &item.IdentityConfirmed,
		&item.Province, &item.ProvinceCode, &item.Municipality, &item.MunicipalityCode, &item.DistrictCode, &item.Neighborhood, &item.NeighborhoodID, &item.Street, &item.Number, &item.Address, &item.DeliveryScope,
		&item.DomainID, &item.Domain, &item.DatabaseName, &item.DatabaseStatus, &item.SubscriptionStatus, &item.BillingPeriod, &nextBilling, &item.DomainsCount, &item.CreatedAt, &item.UpdatedAt,
	)
	if nextBilling.Valid {
		item.NextBillingAt = &nextBilling.Time
	}
	return item, err
}

func (s *Server) platformTenantSelect(where string) string {
	return `
		SELECT t.id::text, t.name, t.slug, t.status, t.plan_slug, COALESCE(t.owner_id::text,''), COALESCE(NULLIF(o.name,''), t.owner_name), COALESCE(NULLIF(o.whatsapp,''), t.owner_whatsapp),
		       COALESCE(t.metadata->>'rnc', ''), COALESCE(t.metadata->>'legal_name', ''), COALESCE(t.metadata->>'commercial_name', ''),
		       COALESCE(t.metadata->>'identity_verification_status', 'unverified'), COALESCE(t.metadata->>'identity_source', ''), COALESCE(t.metadata->>'identity_request_id', ''),
		       COALESCE(t.metadata->>'identity_verified_at', ''), COALESCE((t.metadata->>'identity_confirmed_by_user')::boolean, false),
		       COALESCE(t.metadata->>'province', ''), COALESCE(t.metadata->>'province_code', ''),
		       COALESCE(t.metadata->>'municipality', ''), COALESCE(t.metadata->>'municipality_code', ''), COALESCE(t.metadata->>'district_code', ''),
		       COALESCE(t.metadata->>'neighborhood', ''), COALESCE(t.metadata->>'neighborhood_id', ''), COALESCE(t.metadata->>'street', ''), COALESCE(t.metadata->>'street_number', ''), COALESCE(t.metadata->>'address', ''), COALESCE(t.metadata->>'delivery_scope', 'municipal'),
		       COALESCE(d.id::text,''), COALESCE(d.domain,''), COALESCE(db.database_name,''), COALESCE(db.status,'pending'),
		       COALESCE(sub.status,''), COALESCE(sub.billing_period,''), sub.next_billing_at,
		       (SELECT count(*) FROM tenant_domains td WHERE td.tenant_id=t.id),
		       t.created_at, t.updated_at
		FROM tenants t
		LEFT JOIN platform_owners o ON o.id=t.owner_id
		LEFT JOIN tenant_domains d ON d.tenant_id=t.id AND d.is_primary=true
		LEFT JOIN tenant_databases db ON db.tenant_id=t.id
		LEFT JOIN LATERAL (
			SELECT status, billing_period, next_billing_at FROM subscriptions s
			WHERE s.tenant_id=t.id ORDER BY created_at DESC LIMIT 1
		) sub ON true
	` + where
}

func (s *Server) listTenants(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeJSON(w, http.StatusOK, []platformTenant{})
		return
	}
	rows, err := s.tenantManager.CoreDB().Query(r.Context(), s.platformTenantSelect(`ORDER BY t.created_at DESC`))
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []platformTenant{}
	for rows.Next() {
		item, err := s.scanPlatformTenant(rows)
		if err != nil {
			writeError(w, err)
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) createTenant(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	var input tenancy.TenantProvisionInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if err := normalizeTenantProvisionLocation(&input); err != nil {
		writeError(w, err)
		return
	}
	if strings.TrimSpace(input.OwnerID) == "" {
		writeError(w, badRequest("Debes seleccionar un propietario para crear el negocio"))
		return
	}
	input, err := s.verifyTenantBusinessIdentityForSave(r.Context(), input, requestTraceID(r), identityDeviceKeyFromRequest(r))
	if err != nil {
		writeError(w, err)
		return
	}
	provisioningKey, err := requestIdempotencyKey(r, "La clave de creación del negocio supera el tamaño permitido", "La clave de creación del negocio no tiene un formato válido")
	if err != nil {
		writeError(w, err)
		return
	}
	requestHash := tenantProvisioningHash(input)
	reservation, err := reserveTenantProvisioning(r.Context(), s.tenantManager.CoreDB(), input.OwnerID, provisioningKey, requestHash)
	if err != nil {
		writeError(w, err)
		return
	}
	input.ProvisioningKey = provisioningKey
	var tenant tenancy.Tenant
	if reservation.TenantID != "" {
		tenant, err = s.tenantManager.ResolveReference(r.Context(), reservation.TenantID)
	} else {
		tenant, err = s.tenantManager.ProvisionTenant(r.Context(), input)
	}
	if err != nil {
		_ = markTenantProvisioningStage(r.Context(), s.tenantManager.CoreDB(), input.OwnerID, provisioningKey, reservation.TenantID, "failed", "tenant_registration_failed")
		writeError(w, err)
		return
	}
	if !reservation.Replay {
		if err := s.configureTenantStoreProfile(r.Context(), tenant, input); err != nil {
			_ = markTenantProvisioningStage(r.Context(), s.tenantManager.CoreDB(), input.OwnerID, provisioningKey, tenant.ID, "failed", "store_configuration_failed")
			writeError(w, err)
			return
		}
		if err := markTenantProvisioningStage(r.Context(), s.tenantManager.CoreDB(), input.OwnerID, provisioningKey, tenant.ID, "processing", "store_configured"); err != nil {
			writeError(w, err)
			return
		}
		if err := s.createTenantAdminProfile(r.Context(), tenant, input); err != nil {
			_ = markTenantProvisioningStage(r.Context(), s.tenantManager.CoreDB(), input.OwnerID, provisioningKey, tenant.ID, "failed", "admin_configuration_failed")
			writeError(w, err)
			return
		}
		if err := markTenantProvisioningStage(r.Context(), s.tenantManager.CoreDB(), input.OwnerID, provisioningKey, tenant.ID, "processing", "admin_created"); err != nil {
			writeError(w, err)
			return
		}
		if err := markTenantProvisioningStage(r.Context(), s.tenantManager.CoreDB(), input.OwnerID, provisioningKey, tenant.ID, "completed", "tenant_activated"); err != nil {
			writeError(w, err)
			return
		}
		s.auditPlatform(r.Context(), s.platformActor(r), tenant.ID, "tenant.create", map[string]any{"name": tenant.Name, "slug": tenant.Slug, "domain": tenant.Domain, "plan_slug": tenant.PlanSlug, "owner_id": input.OwnerID, "rnc": maskIdentityDocument(input.RNC), "identity_status": input.IdentityStatus})
	} else {
		w.Header().Set("Idempotency-Replayed", "true")
	}
	writeJSON(w, http.StatusCreated, tenant)
}

func (s *Server) configureTenantStoreProfile(ctx context.Context, tenant tenancy.Tenant, input tenancy.TenantProvisionInput) error {
	if s.tenantManager == nil {
		return fmt.Errorf("modo SaaS no disponible")
	}
	pool, err := s.tenantManager.Pool(ctx, tenant)
	if err != nil {
		return err
	}
	address := strings.TrimSpace(input.Address)
	if address == "" {
		parts := []string{}
		line := strings.TrimSpace(strings.TrimSpace(input.Street) + " " + strings.TrimSpace(input.Number))
		if line != "" {
			parts = append(parts, line)
		}
		if strings.TrimSpace(input.Neighborhood) != "" {
			parts = append(parts, strings.TrimSpace(input.Neighborhood))
		}
		if strings.TrimSpace(input.Municipality) != "" {
			parts = append(parts, strings.TrimSpace(input.Municipality))
		}
		if strings.TrimSpace(input.Province) != "" {
			parts = append(parts, strings.TrimSpace(input.Province))
		}
		address = strings.Join(parts, ", ")
	}
	if address == "" {
		address = "Configura la dirección de tu negocio"
	}
	whatsapp := strings.TrimSpace(firstNonEmpty(input.AdminWhatsapp, input.OwnerWhatsapp))
	if whatsapp == "" {
		whatsapp = "+18090000000"
	}
	var latitude, longitude, locationAccuracy, locationUpdatedAt any
	if input.Latitude != nil && input.Longitude != nil {
		latitude = *input.Latitude
		longitude = *input.Longitude
		if input.LocationAccuracy != nil {
			locationAccuracy = *input.LocationAccuracy
		}
		locationUpdatedAt = time.Now().UTC()
	}
	_, err = pool.Exec(ctx, `
		UPDATE stores
		SET name=$1, slogan=$2, address=$3,
		    province=$4, province_code=$5, municipality=$6, municipality_code=$7, district_code=$8,
		    neighborhood=$9, neighborhood_id=$10, street=$11, street_number=$12,
		    whatsapp=$13, whatsapp_display=$13, latitude=$14, longitude=$15,
		    location_accuracy=$16, location_source=$17, location_updated_at=$18
		WHERE id=(SELECT id FROM stores ORDER BY created_at LIMIT 1)
	`, tenant.Name, "Tu negocio listo para vender", address,
		strings.TrimSpace(input.Province), strings.TrimSpace(input.ProvinceCode), strings.TrimSpace(input.Municipality), strings.TrimSpace(input.MunicipalityCode), strings.TrimSpace(input.DistrictCode),
		strings.TrimSpace(input.Neighborhood), strings.TrimSpace(input.NeighborhoodID), strings.TrimSpace(input.Street), onlyDigits(input.Number), whatsapp,
		latitude, longitude, locationAccuracy, strings.TrimSpace(input.LocationSource), locationUpdatedAt)
	if err != nil {
		return err
	}
	tenantCtx := tenancy.WithTenant(ctx, tenant, pool)
	if store, storeErr := s.firstTenantStore(tenantCtx); storeErr == nil {
		s.syncStoreGeoLocation(tenantCtx, store)
	}
	return nil
}

func (s *Server) createTenantAdminProfile(ctx context.Context, tenant tenancy.Tenant, input tenancy.TenantProvisionInput) error {
	if s.tenantManager == nil {
		return fmt.Errorf("modo SaaS no disponible")
	}
	ownerID := strings.TrimSpace(input.OwnerID)
	if ownerID == "" {
		return fmt.Errorf("propietario requerido para crear el administrador del negocio")
	}

	var ownerFirstName, ownerLastName, ownerName, ownerWhatsapp, ownerNationalID, ownerPasswordHash, ownerProfilePictureURL string
	if err := s.tenantManager.CoreDB().QueryRow(ctx, `
		SELECT COALESCE(first_name,''), COALESCE(last_name,''), COALESCE(NULLIF(name,''), trim(first_name || ' ' || last_name)),
		       COALESCE(whatsapp,''), COALESCE(national_id,''), COALESCE(password_hash,''), COALESCE(profile_picture_url,'')
		FROM platform_owners WHERE id=$1::uuid AND status='active' LIMIT 1
	`, ownerID).Scan(&ownerFirstName, &ownerLastName, &ownerName, &ownerWhatsapp, &ownerNationalID, &ownerPasswordHash, &ownerProfilePictureURL); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("propietario no encontrado o inactivo")
		}
		return err
	}

	username := normalizeWhatsappDigits(ownerWhatsapp)
	if username == "" {
		return fmt.Errorf("el propietario debe tener un WhatsApp válido para entrar al panel administrativo")
	}
	if strings.TrimSpace(ownerPasswordHash) == "" {
		return fmt.Errorf("el propietario debe tener un PIN de %d dígitos para entrar al panel administrativo", s.accessPINLength(ctx))
	}

	adminName := normalizePersonName(ownerFirstName)
	adminLastName := normalizePersonName(ownerLastName)
	if adminName == "" {
		adminName, adminLastName = splitFullName(normalizePersonName(ownerName))
		adminName = normalizePersonName(adminName)
		adminLastName = normalizePersonName(adminLastName)
	}
	if adminName == "" {
		adminName = "Administrador"
	}
	adminNationalID := normalizeNationalID(ownerNationalID)
	ownerPasswordHash = strings.ToLower(strings.TrimSpace(ownerPasswordHash))
	ownerProfilePictureURL = strings.TrimSpace(ownerProfilePictureURL)
	if ownerProfilePictureURL == "" {
		if url := s.fetchPlatformWhatsAppAvatarURL(ctx, ownerWhatsapp); url != "" {
			ownerProfilePictureURL = url
			_, _ = s.tenantManager.CoreDB().Exec(ctx, `UPDATE platform_owners SET profile_picture_url=$2, updated_at=now() WHERE id=$1::uuid`, ownerID, url)
		}
	}

	pool, err := s.tenantManager.Pool(ctx, tenant)
	if err != nil {
		return err
	}

	if _, err := pool.Exec(ctx, `
		WITH updated AS (
			UPDATE admin_profiles
			SET username=$1,
			    name=$2,
			    last_name=$3,
			    national_id=$4,
			    whatsapp=$5,
			    whatsapp_display=$5,
			    profile_picture_url=CASE WHEN $7 <> '' AND trim(profile_picture_url) = '' THEN $7 ELSE profile_picture_url END,
			    country_code='do',
			    dial_code='+1',
			    password_hash=$6,
			    updated_at=now()
			WHERE username=$1
			   OR right(regexp_replace(username, '\D', '', 'g'), 10)=$1
			   OR right(regexp_replace(whatsapp, '\D', '', 'g'), 10)=$1
			   OR ($4 <> '' AND replace(national_id, '-', '')=replace($4, '-', ''))
			RETURNING username
		)
		INSERT INTO admin_profiles (username, name, last_name, national_id, whatsapp, whatsapp_display, profile_picture_url, country_code, dial_code, password_hash)
		SELECT $1,$2,$3,$4,$5,$5,$7,'do','+1',$6
		WHERE NOT EXISTS (SELECT 1 FROM updated)
		ON CONFLICT (username) DO UPDATE
		SET name=EXCLUDED.name,
		    last_name=EXCLUDED.last_name,
		    national_id=EXCLUDED.national_id,
		    whatsapp=EXCLUDED.whatsapp,
		    whatsapp_display=EXCLUDED.whatsapp_display,
		    profile_picture_url=CASE WHEN EXCLUDED.profile_picture_url <> '' AND trim(admin_profiles.profile_picture_url) = '' THEN EXCLUDED.profile_picture_url ELSE admin_profiles.profile_picture_url END,
		    password_hash=EXCLUDED.password_hash,
		    updated_at=now()
	`, username, adminName, adminLastName, adminNationalID, username, ownerPasswordHash, strings.TrimSpace(ownerProfilePictureURL)); err != nil {
		return err
	}

	if _, err := pool.Exec(ctx, `
		WITH updated AS (
			UPDATE system_users
			SET name=$1,
			    last_name=$2,
			    national_id=$3,
			    whatsapp=$4,
			    whatsapp_display=$4,
			    profile_picture_url=CASE WHEN $6 <> '' AND trim(profile_picture_url) = '' THEN $6 ELSE profile_picture_url END,
			    country_code='do',
			    dial_code='+1',
			    pin_hash=$5,
			    role='administrator',
			    active=true,
			    updated_at=now()
			WHERE right(regexp_replace(whatsapp, '\D', '', 'g'), 10)=$4
			   OR ($3 <> '' AND replace(national_id, '-', '')=replace($3, '-', ''))
			RETURNING id
		)
		INSERT INTO system_users (name, last_name, national_id, whatsapp, whatsapp_display, profile_picture_url, country_code, dial_code, pin_hash, role, active)
		SELECT $1,$2,$3,$4,$4,$6,'do','+1',$5,'administrator',true
		WHERE NOT EXISTS (SELECT 1 FROM updated)
		ON CONFLICT DO NOTHING
	`, adminName, adminLastName, adminNationalID, username, ownerPasswordHash, strings.TrimSpace(ownerProfilePictureURL)); err != nil {
		return err
	}

	return nil
}

func (s *Server) authenticateLocalSystemAdministrator(ctx context.Context, username string, password string) (StaffUser, bool) {
	phone := onlyDigits(username)
	if phone == "" || strings.TrimSpace(password) == "" {
		return StaffUser{}, false
	}
	var user StaffUser
	var storedHash string
	err := s.db.QueryRow(ctx, `
		SELECT id::text, name, last_name, national_id, whatsapp, whatsapp_display, COALESCE(profile_picture_url,''), country_code, dial_code, role, COALESCE(permissions,'{}'::jsonb), active, created_at, updated_at, pin_hash
		FROM system_users
		WHERE active=true
		  AND role='administrator'
		  AND regexp_replace(whatsapp, '\D', '', 'g') <> ''
		  AND (
			regexp_replace(whatsapp, '\D', '', 'g') = $1
			OR right(regexp_replace(whatsapp, '\D', '', 'g'), 10) = right($1, 10)
			OR right(regexp_replace(whatsapp, '\D', '', 'g'), length($1)) = $1
			OR right($1, length(regexp_replace(whatsapp, '\D', '', 'g'))) = regexp_replace(whatsapp, '\D', '', 'g')
		  )
		LIMIT 1
	`, phone).Scan(&user.ID, &user.Name, &user.LastName, &user.NationalID, &user.Whatsapp, &user.WhatsappDisplay, &user.ProfilePictureURL, &user.CountryCode, &user.DialCode, &user.Role, &user.Permissions, &user.Active, &user.CreatedAt, &user.UpdatedAt, &storedHash)
	if err != nil || strings.TrimSpace(storedHash) == "" {
		return StaffUser{}, false
	}
	valid, upgrade := verifyAccessSecret(storedHash, password)
	if !valid {
		return StaffUser{}, false
	}
	if upgrade {
		_ = upgradeAccessSecretHash(func(hash string) error {
			_, updateErr := s.db.Exec(ctx, `UPDATE system_users SET pin_hash=$2, updated_at=now() WHERE id=$1::uuid`, user.ID, hash)
			return updateErr
		}, password)
	}
	return s.hydrateStaffUserAvatar(ctx, user), true
}

func (s *Server) authenticateTenantAdmin(ctx context.Context, username string, password string) ([]tenancy.Tenant, error) {
	if s.tenantManager == nil {
		return nil, nil
	}
	tenants, err := s.tenantManager.ListTenants(ctx)
	if err != nil {
		return nil, err
	}
	matches := make([]tenancy.Tenant, 0, len(tenants))
	seen := map[string]bool{}
	addMatch := func(tenant tenancy.Tenant) {
		key := strings.TrimSpace(tenant.ID)
		if key == "" {
			key = strings.TrimSpace(tenant.Slug)
		}
		if key == "" || seen[key] {
			return
		}
		seen[key] = true
		matches = append(matches, tenant)
	}

	for _, tenant := range tenants {
		if tenant.Status != "active" && tenant.Status != "trial" {
			continue
		}
		pool, err := s.tenantManager.Pool(ctx, tenant)
		if err != nil {
			continue
		}

		var profileUsername, storedHash string
		err = pool.QueryRow(ctx, `
			SELECT username, password_hash
			FROM admin_profiles
			WHERE password_hash <> ''
			  AND (
				regexp_replace(username, '\D', '', 'g') = $1
				OR right(regexp_replace(username, '\D', '', 'g'), 10) = right($1, 10)
				OR regexp_replace(whatsapp, '\D', '', 'g') = $1
				OR right(regexp_replace(whatsapp, '\D', '', 'g'), 10) = right($1, 10)
				OR right(regexp_replace(whatsapp, '\D', '', 'g'), length($1)) = $1
				OR right($1, length(regexp_replace(whatsapp, '\D', '', 'g'))) = regexp_replace(whatsapp, '\D', '', 'g')
			  )
			LIMIT 1
		`, username).Scan(&profileUsername, &storedHash)
		if err == nil && strings.TrimSpace(storedHash) != "" {
			valid, upgrade := verifyAccessSecret(storedHash, password)
			if valid {
				if upgrade {
					_ = upgradeAccessSecretHash(func(hash string) error {
						_, updateErr := pool.Exec(ctx, `UPDATE admin_profiles SET password_hash=$2, updated_at=now() WHERE username=$1`, profileUsername, hash)
						return updateErr
					}, password)
				}
				addMatch(tenant)
				continue
			}
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			continue
		}

		var userID string
		err = pool.QueryRow(ctx, `
			SELECT id::text, pin_hash
			FROM system_users
			WHERE active=true
			  AND role='administrator'
			  AND regexp_replace(whatsapp, '\D', '', 'g') <> ''
			  AND (
				regexp_replace(whatsapp, '\D', '', 'g') = $1
				OR right(regexp_replace(whatsapp, '\D', '', 'g'), 10) = right($1, 10)
				OR right(regexp_replace(whatsapp, '\D', '', 'g'), length($1)) = $1
				OR right($1, length(regexp_replace(whatsapp, '\D', '', 'g'))) = regexp_replace(whatsapp, '\D', '', 'g')
			  )
			LIMIT 1
		`, username).Scan(&userID, &storedHash)
		if err == nil && strings.TrimSpace(storedHash) != "" {
			valid, upgrade := verifyAccessSecret(storedHash, password)
			if valid {
				if upgrade {
					_ = upgradeAccessSecretHash(func(hash string) error {
						_, updateErr := pool.Exec(ctx, `UPDATE system_users SET pin_hash=$2, updated_at=now() WHERE id=$1::uuid`, userID, hash)
						return updateErr
					}, password)
				}
				addMatch(tenant)
				continue
			}
		}

		var ownerID, ownerHash string
		err = s.tenantManager.CoreDB().QueryRow(ctx, `
			SELECT o.id::text, o.password_hash
			FROM tenants t
			JOIN platform_owners o ON o.id=t.owner_id
			WHERE t.id=$1::uuid
			  AND t.status IN ('active','trial')
			  AND o.status='active'
			  AND o.whatsapp_digits=$2
			LIMIT 1
		`, tenant.ID, username).Scan(&ownerID, &ownerHash)
		if err == nil && strings.TrimSpace(ownerID) != "" {
			valid, upgrade := verifyAccessSecret(ownerHash, password)
			if valid {
				if upgrade {
					_ = upgradeAccessSecretHash(func(hash string) error {
						_, updateErr := s.tenantManager.CoreDB().Exec(ctx, `UPDATE platform_owners SET password_hash=$2, updated_at=now() WHERE id=$1::uuid`, ownerID, hash)
						return updateErr
					}, password)
				}
				_ = s.createTenantAdminProfile(ctx, tenant, tenancy.TenantProvisionInput{OwnerID: ownerID})
				addMatch(tenant)
			}
		}
	}
	return matches, nil
}

func (s *Server) platformActor(r *http.Request) string {
	user, ok := platformUserFromContext(r.Context())
	if ok {
		return user.Username
	}
	return s.cfg.PlatformAdminUsername
}

func (s *Server) listAdminTenants(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	allowed := adminTenantIDsFromContext(r.Context())
	if len(allowed) == 0 {
		writeJSON(w, http.StatusOK, []platformTenant{})
		return
	}
	placeholders := make([]string, 0, len(allowed))
	args := make([]any, 0, len(allowed))
	for i, id := range allowed {
		placeholders = append(placeholders, fmt.Sprintf("$%d::uuid", i+1))
		args = append(args, id)
	}
	where := fmt.Sprintf("WHERE t.id IN (%s) ORDER BY t.created_at DESC", strings.Join(placeholders, ","))
	rows, err := s.tenantManager.CoreDB().Query(r.Context(), s.platformTenantSelect(where), args...)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []platformTenant{}
	for rows.Next() {
		item, err := s.scanPlatformTenant(rows)
		if err != nil {
			writeError(w, err)
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) allowedAdminPlatformTenants(ctx context.Context, allowed []string) ([]platformTenant, error) {
	if s.tenantManager == nil || len(allowed) == 0 {
		return []platformTenant{}, nil
	}
	placeholders := make([]string, 0, len(allowed))
	args := make([]any, 0, len(allowed))
	for i, id := range allowed {
		placeholders = append(placeholders, fmt.Sprintf("$%d::uuid", i+1))
		args = append(args, id)
	}
	where := fmt.Sprintf("WHERE t.id IN (%s) ORDER BY t.created_at DESC", strings.Join(placeholders, ","))
	rows, err := s.tenantManager.CoreDB().Query(ctx, s.platformTenantSelect(where), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []platformTenant{}
	for rows.Next() {
		item, err := s.scanPlatformTenant(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func platformTenantAsTenant(item platformTenant) tenancy.Tenant {
	return tenancy.Tenant{
		ID:           item.ID,
		Name:         item.Name,
		Slug:         item.Slug,
		Status:       item.Status,
		PlanSlug:     item.PlanSlug,
		Domain:       item.Domain,
		DatabaseName: item.DatabaseName,
		CreatedAt:    item.CreatedAt,
	}
}

func (s *Server) adminTenantFromParam(ctx context.Context, ref string) (platformTenant, tenancy.Tenant, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return platformTenant{}, tenancy.Tenant{}, badRequest("Selecciona un negocio válido")
	}
	items, err := s.allowedAdminPlatformTenants(ctx, adminTenantIDsFromContext(ctx))
	if err != nil {
		return platformTenant{}, tenancy.Tenant{}, err
	}
	for _, item := range items {
		if item.ID == ref || item.Slug == ref || item.Domain == ref {
			return item, platformTenantAsTenant(item), nil
		}
	}
	return platformTenant{}, tenancy.Tenant{}, forbidden("No tienes permiso para administrar este negocio")
}

func (s *Server) firstTenantStore(ctx context.Context) (Store, error) {
	var store Store
	err := s.db.QueryRow(ctx, storeSelectSQL(`SELECT`)+` FROM stores ORDER BY created_at LIMIT 1`).Scan(storeScanPtrs(&store)...)
	return store, err
}

func platformTenantStatusIsActive(status string) bool {
	status = strings.TrimSpace(strings.ToLower(status))
	return status == "active" || status == "trial"
}

func adminBusinessConfigPayload(item platformTenant, store Store, hasStore bool, salesToday int64, incomeToday float64, products int64, currentRef string, storeErr error) map[string]any {
	active := platformTenantStatusIsActive(item.Status)
	storeStatus := "CERRADA"
	paymentSettings := json.RawMessage(defaultPaymentSettingsJSON)
	serviceHours := json.RawMessage(defaultServiceHoursJSON)
	if hasStore {
		active = active && store.Active
		storeStatus = store.StoreStatus
		paymentSettings = store.PaymentSettings
		serviceHours = store.ServiceHours
	}
	name := strings.TrimSpace(item.Name)
	if hasStore && strings.TrimSpace(store.Name) != "" {
		name = store.Name
	}
	address := strings.TrimSpace(item.Address)
	if hasStore && strings.TrimSpace(store.Address) != "" {
		address = store.Address
	}
	deliveryScope := normalizeDeliveryScopeValue(item.DeliveryScope)
	if hasStore && strings.TrimSpace(store.DeliveryScope) != "" {
		deliveryScope = normalizeDeliveryScopeValue(store.DeliveryScope)
	}
	currentRef = strings.TrimSpace(currentRef)
	isCurrent := currentRef != "" && (currentRef == item.ID || currentRef == item.Slug || currentRef == item.Domain)
	payload := map[string]any{
		"id":                  firstNonEmpty(store.ID, item.ID),
		"store_id":            store.ID,
		"storeId":             store.ID,
		"tenant_id":           item.ID,
		"tenantId":            item.ID,
		"tenant_slug":         item.Slug,
		"tenantSlug":          item.Slug,
		"tenant_name":         item.Name,
		"tenantName":          item.Name,
		"domain":              item.Domain,
		"database_status":     item.DatabaseStatus,
		"status":              item.Status,
		"name":                name,
		"slogan":              store.Slogan,
		"address":             address,
		"province":            firstNonEmpty(store.Province, item.Province),
		"province_code":       firstNonEmpty(store.ProvinceCode, item.ProvinceCode),
		"provinceCode":        firstNonEmpty(store.ProvinceCode, item.ProvinceCode),
		"municipality":        firstNonEmpty(store.Municipality, item.Municipality),
		"municipality_code":   firstNonEmpty(store.MunicipalityCode, item.MunicipalityCode),
		"municipalityCode":    firstNonEmpty(store.MunicipalityCode, item.MunicipalityCode),
		"district_code":       firstNonEmpty(store.DistrictCode, item.DistrictCode),
		"districtCode":        firstNonEmpty(store.DistrictCode, item.DistrictCode),
		"neighborhood":        firstNonEmpty(store.Neighborhood, item.Neighborhood),
		"neighborhood_id":     firstNonEmpty(store.NeighborhoodID, item.NeighborhoodID),
		"neighborhoodId":      firstNonEmpty(store.NeighborhoodID, item.NeighborhoodID),
		"street":              firstNonEmpty(store.Street, item.Street),
		"street_number":       firstNonEmpty(store.StreetNumber, item.Number),
		"whatsapp":            store.Whatsapp,
		"whatsapp_display":    store.WhatsappDisplay,
		"whatsappDisplay":     store.WhatsappDisplay,
		"country_code":        store.CountryCode,
		"countryCode":         store.CountryCode,
		"dial_code":           store.DialCode,
		"dialCode":            store.DialCode,
		"emoji":               firstNonEmpty(store.Emoji, "🏪"),
		"color":               firstNonEmpty(store.Color, "#00a884"),
		"active":              active,
		"store_active":        store.Active,
		"storeActive":         store.Active,
		"store_status":        storeStatus,
		"storeStatus":         storeStatus,
		"cashRegisterOpen":    storeStatus == "ABIERTA",
		"payment_settings":    paymentSettings,
		"paymentSettings":     paymentSettings,
		"service_hours":       serviceHours,
		"serviceHours":        serviceHours,
		"delivery_scope":      deliveryScope,
		"deliveryScope":       deliveryScope,
		"latitude":            floatOrNil(store.Latitude),
		"lat":                 floatOrNil(store.Latitude),
		"longitude":           floatOrNil(store.Longitude),
		"lng":                 floatOrNil(store.Longitude),
		"location_accuracy":   floatOrNil(store.LocationAccuracy),
		"locationAccuracy":    floatOrNil(store.LocationAccuracy),
		"location_source":     store.LocationSource,
		"locationSource":      store.LocationSource,
		"location_updated_at": timeOrNil(store.LocationUpdatedAt),
		"locationUpdatedAt":   timeOrNil(store.LocationUpdatedAt),
		"location_configured": store.Latitude.Valid && store.Longitude.Valid,
		"locationConfigured":  store.Latitude.Valid && store.Longitude.Valid,
		"salesToday":          salesToday,
		"sales_today":         salesToday,
		"incomeToday":         incomeToday,
		"income_today":        incomeToday,
		"products":            products,
		"is_current_tenant":   isCurrent,
		"isCurrentTenant":     isCurrent,
	}
	if storeErr != nil && !errors.Is(storeErr, pgx.ErrNoRows) {
		payload["warning"] = storeErr.Error()
	}
	return payload
}

func (s *Server) listAdminBusinessConfigurations(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeJSON(w, http.StatusOK, []map[string]any{})
		return
	}
	items, err := s.allowedAdminPlatformTenants(r.Context(), adminTenantIDsFromContext(r.Context()))
	if err != nil {
		writeError(w, err)
		return
	}
	currentRef := firstNonEmpty(r.Header.Get("X-WAMERCIO-Tenant"), r.Header.Get("X-WAMERCIO-Tenant-Slug"), r.URL.Query().Get("tenant"))
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		tenant := platformTenantAsTenant(item)
		pool, err := s.tenantManager.Pool(r.Context(), tenant)
		if err != nil {
			payload := adminBusinessConfigPayload(item, Store{}, false, 0, 0, 0, currentRef, err)
			payload["business_whatsapp"] = s.businessWhatsAppSummary(r.Context(), tenant)
			payload["businessWhatsApp"] = payload["business_whatsapp"]
			result = append(result, payload)
			continue
		}
		tenantCtx := tenancy.WithTenant(r.Context(), tenant, pool)
		store, storeErr := s.firstTenantStore(tenantCtx)
		var salesToday int64
		var incomeToday float64
		var products int64
		if storeErr == nil && store.ID != "" {
			_ = s.db.QueryRow(tenantCtx, `SELECT count(*) FROM products WHERE store_id=$1`, store.ID).Scan(&products)
			_ = s.db.QueryRow(tenantCtx, `
				SELECT count(*), COALESCE(sum(total),0)
				FROM sales
				WHERE store_id=$1
				  AND financial_status NOT IN ('voided','returned')
				  AND date >= date_trunc('day', now())
			`, store.ID).Scan(&salesToday, &incomeToday)
		}
		payload := adminBusinessConfigPayload(item, store, storeErr == nil, salesToday, incomeToday, products, currentRef, storeErr)
		payload["business_whatsapp"] = s.businessWhatsAppSummary(r.Context(), tenant)
		payload["businessWhatsApp"] = payload["business_whatsapp"]
		result = append(result, payload)
	}
	writeJSON(w, http.StatusOK, result)
}

func allowedStoreUpdateColumns() map[string]string {
	return map[string]string{
		"name": "name", "slogan": "slogan", "address": "address",
		"province_code": "province_code", "provinceCode": "province_code", "province": "province",
		"municipality_code": "municipality_code", "municipalityCode": "municipality_code", "municipality": "municipality",
		"district_code": "district_code", "districtCode": "district_code",
		"neighborhood_id": "neighborhood_id", "neighborhoodId": "neighborhood_id", "neighborhood": "neighborhood", "sector": "neighborhood",
		"street": "street", "street_number": "street_number",
		"whatsapp": "whatsapp", "whatsapp_display": "whatsapp_display", "whatsappDisplay": "whatsapp_display", "country_code": "country_code", "countryCode": "country_code", "dial_code": "dial_code", "dialCode": "dial_code", "emoji": "emoji", "logo_url": "logo_url", "logoUrl": "logo_url", "color": "color", "active": "active", "store_status": "store_status", "storeStatus": "store_status", "payment_settings": "payment_settings", "paymentSettings": "payment_settings", "service_hours": "service_hours", "serviceHours": "service_hours", "delivery_scope": "delivery_scope", "deliveryScope": "delivery_scope", "latitude": "latitude", "lat": "latitude", "longitude": "longitude", "lng": "longitude", "lon": "longitude", "location_accuracy": "location_accuracy", "locationAccuracy": "location_accuracy", "accuracy": "location_accuracy", "location_source": "location_source", "locationSource": "location_source", "location_updated_at": "location_updated_at",
	}
}

func (s *Server) updateAdminTenantStore(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	platformItem, tenant, err := s.adminTenantFromParam(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, err)
		return
	}
	pool, err := s.tenantManager.Pool(r.Context(), tenant)
	if err != nil {
		writeError(w, err)
		return
	}
	tenantCtx := tenancy.WithTenant(r.Context(), tenant, pool)
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if value, ok := input["phone"]; ok {
		input["whatsapp"] = value
		delete(input, "phone")
	}
	if value, ok := input["payment_settings"]; ok {
		input["payment_settings"] = normalizePaymentSettingsPayload(value)
	}
	if value, ok := input["paymentSettings"]; ok {
		input["paymentSettings"] = normalizePaymentSettingsPayload(value)
	}
	normalizeTerritoryAddressInput(input)
	store, storeErr := s.firstTenantStore(tenantCtx)
	if errors.Is(storeErr, pgx.ErrNoRows) {
		store, storeErr = s.insertStore(tenantCtx, map[string]any{
			"name": platformItem.Name, "address": platformItem.Address, "province": platformItem.Province, "province_code": platformItem.ProvinceCode,
			"municipality": platformItem.Municipality, "municipality_code": platformItem.MunicipalityCode, "district_code": platformItem.DistrictCode,
			"neighborhood": platformItem.Neighborhood, "neighborhood_id": platformItem.NeighborhoodID, "street": platformItem.Street, "street_number": platformItem.Number,
			"emoji": "🏪", "color": "#00a884", "service_hours": defaultServiceHoursJSON, "delivery_scope": platformItem.DeliveryScope,
		})
	}
	if storeErr != nil {
		writeError(w, storeErr)
		return
	}
	updated, err := s.updateReturningStore(tenantCtx, store.ID, allowedStoreUpdateColumns(), input)
	if err != nil {
		writeError(w, err)
		return
	}
	s.syncTenantStoreDeliveryScope(tenantCtx, updated.DeliveryScope)
	s.syncStoreGeoLocation(tenantCtx, updated)
	s.invalidateTenantCache(tenantCtx)
	s.publishTenantEvent(tenantCtx, "store_updated", map[string]any{"storeId": updated.ID, "tenantId": tenant.ID})
	writeJSON(w, http.StatusOK, adminBusinessConfigPayload(platformItem, updated, true, 0, 0, 0, firstNonEmpty(r.Header.Get("X-WAMERCIO-Tenant"), r.URL.Query().Get("tenant")), nil))
}

func stringSliceFromAny(value any) []string {
	items := []string{}
	switch typed := value.(type) {
	case []string:
		items = append(items, typed...)
	case []any:
		for _, item := range typed {
			text := strings.TrimSpace(fmt.Sprint(item))
			if text != "" {
				items = append(items, text)
			}
		}
	case string:
		for _, item := range strings.Split(typed, ",") {
			text := strings.TrimSpace(item)
			if text != "" {
				items = append(items, text)
			}
		}
	}
	seen := map[string]bool{}
	clean := []string{}
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item != "" && !seen[item] {
			seen[item] = true
			clean = append(clean, item)
		}
	}
	return clean
}

func (s *Server) activateGlobalCatalogProductAcrossTenants(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	productInput, _ := input["product"].(map[string]any)
	if productInput == nil {
		productInput = input
	}
	targetRefs := stringSliceFromAny(firstNonEmptyAny(input["tenant_ids"], input["tenantIds"], input["tenants"]))
	if len(targetRefs) == 0 {
		writeError(w, badRequest("Selecciona al menos un negocio para activar el producto"))
		return
	}
	allowedItems, err := s.allowedAdminPlatformTenants(r.Context(), adminTenantIDsFromContext(r.Context()))
	if err != nil {
		writeError(w, err)
		return
	}
	allowed := map[string]platformTenant{}
	for _, item := range allowedItems {
		allowed[item.ID] = item
		allowed[item.Slug] = item
		if item.Domain != "" {
			allowed[item.Domain] = item
		}
	}
	results := []map[string]any{}
	for _, ref := range targetRefs {
		platformItem, ok := allowed[ref]
		if !ok {
			results = append(results, map[string]any{"tenant": ref, "ok": false, "error": "No tienes permiso para administrar este negocio"})
			continue
		}
		tenant := platformTenantAsTenant(platformItem)
		pool, err := s.tenantManager.Pool(r.Context(), tenant)
		if err != nil {
			results = append(results, map[string]any{"tenant": platformItem.Slug, "ok": false, "error": err.Error()})
			continue
		}
		tenantCtx := tenancy.WithTenant(r.Context(), tenant, pool)
		store, err := s.firstTenantStore(tenantCtx)
		if err != nil {
			results = append(results, map[string]any{"tenant": platformItem.Slug, "ok": false, "error": "Este negocio no tiene tienda local configurada"})
			continue
		}
		payload := map[string]any{}
		for key, value := range productInput {
			payload[key] = value
		}
		payload["store_id"] = store.ID
		payload["storeId"] = store.ID
		globalID := strings.TrimSpace(firstNonEmpty(str(payload, "global_id"), str(payload, "globalId")))
		var existingID string
		if globalID != "" {
			_ = s.db.QueryRow(tenantCtx, `SELECT id::text FROM products WHERE store_id=$1 AND global_id=$2 ORDER BY created_at DESC LIMIT 1`, store.ID, globalID).Scan(&existingID)
		}
		var product Product
		if existingID != "" {
			product, err = s.updateReturningProduct(tenantCtx, existingID, payload)
		} else {
			product, err = s.insertProduct(tenantCtx, payload)
		}
		if err != nil {
			results = append(results, map[string]any{"tenant": platformItem.Slug, "ok": false, "error": err.Error()})
			continue
		}
		s.invalidateTenantCache(tenantCtx)
		s.publishTenantEvent(tenantCtx, "product_updated", map[string]any{"productId": product.ID, "storeId": product.StoreID, "tenantId": tenant.ID})
		results = append(results, map[string]any{"tenant": platformItem.Slug, "tenant_id": platformItem.ID, "ok": true, "product": product})
	}
	writeJSON(w, http.StatusOK, map[string]any{"results": results})
}

func firstNonEmptyAny(values ...any) any {
	for _, value := range values {
		if value == nil {
			continue
		}
		if strings.TrimSpace(fmt.Sprint(value)) != "" {
			return value
		}
	}
	return nil
}

func (s *Server) adminOwnerByWhatsapp(ctx context.Context, whatsappDigits string) (platformOwner, error) {
	if s.tenantManager == nil {
		return platformOwner{}, badRequest("El modo SaaS no está disponible")
	}
	whatsappDigits = normalizeWhatsappDigits(whatsappDigits)
	if whatsappDigits == "" {
		return platformOwner{}, badRequest("WhatsApp administrativo inválido")
	}
	item, err := scanPlatformOwner(s.tenantManager.CoreDB().QueryRow(ctx, platformOwnerSelect(`WHERE o.status='active' AND o.whatsapp_digits=$1 LIMIT 1`), whatsappDigits))
	if errors.Is(err, pgx.ErrNoRows) {
		return platformOwner{}, badRequest("No se encontró un propietario activo para este WhatsApp")
	}
	return item, err
}

func (s *Server) adminOwnerByID(ctx context.Context, ownerID string) (platformOwner, error) {
	if s.tenantManager == nil {
		return platformOwner{}, badRequest("El modo SaaS no está disponible")
	}
	ownerID = strings.TrimSpace(ownerID)
	if ownerID == "" {
		return platformOwner{}, badRequest("No se encontró el propietario del negocio actual")
	}
	item, err := scanPlatformOwner(s.tenantManager.CoreDB().QueryRow(ctx, platformOwnerSelect(`WHERE o.status='active' AND o.id=$1::uuid LIMIT 1`), ownerID))
	if errors.Is(err, pgx.ErrNoRows) {
		return platformOwner{}, badRequest("El propietario del negocio actual no está activo o no existe")
	}
	return item, err
}

func (s *Server) adminOwnerFromRequest(ctx context.Context, r *http.Request) (platformOwner, error) {
	username, _ := ctx.Value(adminUserContextKey{}).(string)
	if owner, err := s.adminOwnerByWhatsapp(ctx, username); err == nil {
		return owner, nil
	}

	allowed := adminTenantIDsFromContext(ctx)
	if len(allowed) == 0 {
		return platformOwner{}, badRequest("No tienes negocios asignados para crear otro negocio")
	}

	currentRef := firstNonEmpty(r.Header.Get("X-WAMERCIO-Tenant"), r.Header.Get("X-WAMERCIO-Tenant-Slug"), r.URL.Query().Get("tenant"))
	if strings.TrimSpace(currentRef) != "" {
		if item, _, err := s.adminTenantFromParam(ctx, currentRef); err == nil && strings.TrimSpace(item.OwnerID) != "" {
			return s.adminOwnerByID(ctx, item.OwnerID)
		}
	}

	placeholders := make([]string, 0, len(allowed))
	args := make([]any, 0, len(allowed))
	for i, id := range allowed {
		placeholders = append(placeholders, fmt.Sprintf("$%d::uuid", i+1))
		args = append(args, id)
	}
	query := platformOwnerSelect(fmt.Sprintf(`
		JOIN tenants t ON t.owner_id=o.id
		WHERE o.status='active'
		  AND t.id IN (%s)
		ORDER BY t.created_at ASC
		LIMIT 1
	`, strings.Join(placeholders, ",")))
	owner, err := scanPlatformOwner(s.tenantManager.CoreDB().QueryRow(ctx, query, args...))
	if errors.Is(err, pgx.ErrNoRows) {
		return platformOwner{}, badRequest("No se encontró un propietario activo para los negocios asignados a esta sesión")
	}
	return owner, err
}

func (s *Server) adminTenantIDsForOwner(ctx context.Context, ownerID string) ([]string, error) {
	ownerID = strings.TrimSpace(ownerID)
	if ownerID == "" || s.tenantManager == nil {
		return []string{}, nil
	}
	rows, err := s.tenantManager.CoreDB().Query(ctx, `
		SELECT id::text
		FROM tenants
		WHERE owner_id=$1::uuid AND status IN ('active','trial')
		ORDER BY created_at DESC
	`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (s *Server) createAdminTenant(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	owner, err := s.adminOwnerFromRequest(r.Context(), r)
	if err != nil {
		writeError(w, err)
		return
	}
	var input tenancy.TenantProvisionInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input.OwnerID = owner.ID
	input.OwnerName = owner.Name
	input.OwnerWhatsapp = owner.Whatsapp
	input.AdminNationalID = owner.NationalID
	input.AdminWhatsapp = owner.Whatsapp
	if err := normalizeTenantProvisionLocation(&input); err != nil {
		writeError(w, err)
		return
	}

	if strings.TrimSpace(input.BusinessTypeID) != "" {
		var typeName, typeSlug string
		err := s.tenantManager.CoreDB().QueryRow(r.Context(), `
			SELECT name, slug FROM platform_business_types
			WHERE id=$1::uuid AND active=true
			LIMIT 1
		`, strings.TrimSpace(input.BusinessTypeID)).Scan(&typeName, &typeSlug)
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, badRequest("Selecciona un tipo de negocio activo"))
			return
		}
		if err != nil {
			writeError(w, err)
			return
		}
		input.BusinessTypeName = typeName
		input.BusinessTypeSlug = typeSlug
	}
	if strings.TrimSpace(input.BusinessTypeName) == "" {
		writeError(w, badRequest("Selecciona el nombre/prefijo del negocio"))
		return
	}
	if strings.TrimSpace(input.BusinessName) == "" && strings.TrimSpace(input.Name) == "" {
		writeError(w, badRequest("Completa el nombre del negocio"))
		return
	}
	if strings.TrimSpace(input.Province) == "" || strings.TrimSpace(input.Municipality) == "" || strings.TrimSpace(input.Neighborhood) == "" {
		writeError(w, badRequest("Selecciona provincia, municipio/distrito y barrio"))
		return
	}
	if strings.TrimSpace(input.Street) == "" || strings.TrimSpace(input.Number) == "" {
		writeError(w, badRequest("Completa la calle y el número del negocio"))
		return
	}

	provisioningKey, err := requestIdempotencyKey(r, "La clave de creación del negocio supera el tamaño permitido", "La clave de creación del negocio no tiene un formato válido")
	if err != nil {
		writeError(w, err)
		return
	}
	requestHash := tenantProvisioningHash(input)
	reservation, err := reserveTenantProvisioning(r.Context(), s.tenantManager.CoreDB(), owner.ID, provisioningKey, requestHash)
	if err != nil {
		writeError(w, err)
		return
	}
	input.ProvisioningKey = provisioningKey
	var tenant tenancy.Tenant
	if reservation.TenantID != "" {
		tenant, err = s.tenantManager.ResolveReference(r.Context(), reservation.TenantID)
	} else {
		tenant, err = s.tenantManager.ProvisionTenant(r.Context(), input)
	}
	if err != nil {
		_ = markTenantProvisioningStage(r.Context(), s.tenantManager.CoreDB(), owner.ID, provisioningKey, reservation.TenantID, "failed", "tenant_registration_failed")
		writeError(w, err)
		return
	}
	if !reservation.Replay {
		if err := s.configureTenantStoreProfile(r.Context(), tenant, input); err != nil {
			_ = markTenantProvisioningStage(r.Context(), s.tenantManager.CoreDB(), owner.ID, provisioningKey, tenant.ID, "failed", "store_configuration_failed")
			writeError(w, err)
			return
		}
		if err := markTenantProvisioningStage(r.Context(), s.tenantManager.CoreDB(), owner.ID, provisioningKey, tenant.ID, "processing", "store_configured"); err != nil {
			writeError(w, err)
			return
		}
		if err := s.createTenantAdminProfile(r.Context(), tenant, input); err != nil {
			_ = markTenantProvisioningStage(r.Context(), s.tenantManager.CoreDB(), owner.ID, provisioningKey, tenant.ID, "failed", "admin_configuration_failed")
			writeError(w, err)
			return
		}
		if err := markTenantProvisioningStage(r.Context(), s.tenantManager.CoreDB(), owner.ID, provisioningKey, tenant.ID, "processing", "admin_created"); err != nil {
			writeError(w, err)
			return
		}
		if err := markTenantProvisioningStage(r.Context(), s.tenantManager.CoreDB(), owner.ID, provisioningKey, tenant.ID, "completed", "tenant_activated"); err != nil {
			writeError(w, err)
			return
		}
	} else {
		w.Header().Set("Idempotency-Replayed", "true")
	}
	tenantIDs, err := s.adminTenantIDsForOwner(r.Context(), owner.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	token, err := s.issueAdminTokenForTenants(normalizeWhatsappDigits(owner.Whatsapp), tenantIDs)
	if err != nil {
		writeError(w, err)
		return
	}
	if !reservation.Replay {
		s.auditPlatform(r.Context(), normalizeWhatsappDigits(owner.Whatsapp), tenant.ID, "tenant.owner_create", map[string]any{"name": tenant.Name, "slug": tenant.Slug, "domain": tenant.Domain, "plan_slug": tenant.PlanSlug, "owner_id": owner.ID})
	}
	writeJSON(w, http.StatusCreated, map[string]any{"tenant": tenant, "token": token, "tenants": tenantIDs})
}

func (s *Server) auditPlatform(ctx context.Context, actor string, tenantID string, action string, details any) {
	if s.tenantManager == nil || strings.TrimSpace(action) == "" {
		return
	}
	if actor == "" {
		actor = s.cfg.PlatformAdminUsername
	}
	payload, err := marshalJSONDatabaseValue(details)
	if err != nil || payload == "null" {
		payload = `{}`
	}
	if strings.TrimSpace(tenantID) == "" {
		_, _ = s.tenantManager.CoreDB().Exec(ctx, `INSERT INTO platform_audit_logs (actor, action, details) VALUES ($1,$2,$3::jsonb)`, actor, action, payload)
		return
	}
	_, _ = s.tenantManager.CoreDB().Exec(ctx, `INSERT INTO platform_audit_logs (tenant_id, actor, action, details) VALUES ($1::uuid,$2,$3,$4::jsonb)`, tenantID, actor, action, payload)
}

func (s *Server) getTenant(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	item, err := s.scanPlatformTenant(s.tenantManager.CoreDB().QueryRow(r.Context(), s.platformTenantSelect(`WHERE t.id=$1::uuid LIMIT 1`), chi.URLParam(r, "id")))
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Negocio no encontrado"})
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

type tenantUpdateInput struct {
	Name          string `json:"name"`
	PlanSlug      string `json:"plan_slug"`
	OwnerID       string `json:"owner_id"`
	OwnerName     string `json:"owner_name"`
	OwnerWhatsapp string `json:"owner_whatsapp"`
}

func (s *Server) updateTenant(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	var input tenantUpdateInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	tenantID := chi.URLParam(r, "id")
	_, err := s.tenantManager.CoreDB().Exec(r.Context(), `
		UPDATE tenants
		SET name=COALESCE(NULLIF($2,''), name),
		    plan_slug=COALESCE(NULLIF($3,''), plan_slug),
		    owner_id=NULLIF($4,'')::uuid,
		    owner_name=$5,
		    owner_whatsapp=$6,
		    updated_at=now()
		WHERE id=$1::uuid
	`, tenantID, strings.TrimSpace(input.Name), strings.TrimSpace(input.PlanSlug), strings.TrimSpace(input.OwnerID), strings.TrimSpace(input.OwnerName), strings.TrimSpace(input.OwnerWhatsapp))
	if err != nil {
		writeError(w, err)
		return
	}
	if strings.TrimSpace(input.PlanSlug) != "" {
		_, _ = s.tenantManager.CoreDB().Exec(r.Context(), `
			INSERT INTO subscriptions (tenant_id, plan_slug, status, billing_period)
			VALUES ($1::uuid,$2,'active','monthly')
			ON CONFLICT DO NOTHING
		`, tenantID, strings.TrimSpace(input.PlanSlug))
		_, _ = s.tenantManager.CoreDB().Exec(r.Context(), `
			UPDATE subscriptions SET plan_slug=$2, updated_at=now()
			WHERE id=(SELECT id FROM subscriptions WHERE tenant_id=$1::uuid ORDER BY created_at DESC LIMIT 1)
		`, tenantID, strings.TrimSpace(input.PlanSlug))
	}
	s.auditPlatform(r.Context(), s.platformActor(r), tenantID, "tenant.update", input)
	item, err := s.scanPlatformTenant(s.tenantManager.CoreDB().QueryRow(r.Context(), s.platformTenantSelect(`WHERE t.id=$1::uuid LIMIT 1`), tenantID))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

type platformDomain struct {
	ID         string     `json:"id"`
	TenantID   string     `json:"tenant_id"`
	TenantName string     `json:"tenant_name,omitempty"`
	Domain     string     `json:"domain"`
	Type       string     `json:"type"`
	IsPrimary  bool       `json:"is_primary"`
	VerifiedAt *time.Time `json:"verified_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

type tenantDomainInput struct {
	Domain    string `json:"domain"`
	Type      string `json:"type"`
	IsPrimary bool   `json:"is_primary"`
}

func scanPlatformDomain(rows pgx.Rows) (platformDomain, error) {
	var item platformDomain
	var verified sql.NullTime
	err := rows.Scan(&item.ID, &item.TenantID, &item.TenantName, &item.Domain, &item.Type, &item.IsPrimary, &verified, &item.CreatedAt)
	if verified.Valid {
		item.VerifiedAt = &verified.Time
	}
	return item, err
}

func (s *Server) listPlatformDomains(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeJSON(w, http.StatusOK, []platformDomain{})
		return
	}
	rows, err := s.tenantManager.CoreDB().Query(r.Context(), `
		SELECT d.id::text, d.tenant_id::text, t.name, d.domain, d.type, d.is_primary, d.verified_at, d.created_at
		FROM tenant_domains d JOIN tenants t ON t.id=d.tenant_id
		ORDER BY d.is_primary DESC, d.created_at DESC
	`)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []platformDomain{}
	for rows.Next() {
		item, err := scanPlatformDomain(rows)
		if err != nil {
			writeError(w, err)
			return
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) listTenantDomains(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeJSON(w, http.StatusOK, []platformDomain{})
		return
	}
	rows, err := s.tenantManager.CoreDB().Query(r.Context(), `
		SELECT d.id::text, d.tenant_id::text, t.name, d.domain, d.type, d.is_primary, d.verified_at, d.created_at
		FROM tenant_domains d JOIN tenants t ON t.id=d.tenant_id
		WHERE d.tenant_id=$1::uuid
		ORDER BY d.is_primary DESC, d.created_at DESC
	`, chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []platformDomain{}
	for rows.Next() {
		item, err := scanPlatformDomain(rows)
		if err != nil {
			writeError(w, err)
			return
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) addTenantDomain(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	var input tenantDomainInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	domain := strings.ToLower(strings.Trim(strings.TrimSpace(input.Domain), "."))
	if domain == "" {
		writeError(w, badRequest("El dominio es obligatorio"))
		return
	}
	rootDomain := strings.ToLower(strings.Trim(strings.TrimSpace(s.cfg.RootDomain), "."))
	if rootDomain != "" && domain == rootDomain {
		writeError(w, badRequest("El dominio raíz pertenece a la landing del SaaS. Usa un subdominio del comodín para el tenant."))
		return
	}
	domainType := strings.TrimSpace(input.Type)
	if domainType == "" {
		domainType = "subdomain"
	}
	switch domainType {
	case "root", "subdomain", "custom_domain":
	default:
		domainType = "custom_domain"
	}
	tenantID := chi.URLParam(r, "id")
	if input.IsPrimary {
		_, _ = s.tenantManager.CoreDB().Exec(r.Context(), `UPDATE tenant_domains SET is_primary=false WHERE tenant_id=$1::uuid`, tenantID)
	}
	var item platformDomain
	var verified sql.NullTime
	err := s.tenantManager.CoreDB().QueryRow(r.Context(), `
		INSERT INTO tenant_domains (tenant_id, domain, type, is_primary, verified_at)
		VALUES ($1::uuid,$2,$3,$4,now())
		ON CONFLICT (domain) DO UPDATE SET tenant_id=EXCLUDED.tenant_id, type=EXCLUDED.type, is_primary=EXCLUDED.is_primary, verified_at=COALESCE(tenant_domains.verified_at, now())
		RETURNING id::text, tenant_id::text, '', domain, type, is_primary, verified_at, created_at
	`, tenantID, domain, domainType, input.IsPrimary).Scan(&item.ID, &item.TenantID, &item.TenantName, &item.Domain, &item.Type, &item.IsPrimary, &verified, &item.CreatedAt)
	if verified.Valid {
		item.VerifiedAt = &verified.Time
	}
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), s.platformActor(r), tenantID, "tenant.domain.add", map[string]any{"domain": domain, "type": domainType, "is_primary": input.IsPrimary})
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) setPrimaryDomain(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	domainID := chi.URLParam(r, "id")
	var tenantID string
	if err := s.tenantManager.CoreDB().QueryRow(r.Context(), `SELECT tenant_id::text FROM tenant_domains WHERE id=$1::uuid`, domainID).Scan(&tenantID); err != nil {
		writeError(w, err)
		return
	}
	_, _ = s.tenantManager.CoreDB().Exec(r.Context(), `UPDATE tenant_domains SET is_primary=false WHERE tenant_id=$1::uuid`, tenantID)
	_, err := s.tenantManager.CoreDB().Exec(r.Context(), `UPDATE tenant_domains SET is_primary=true, verified_at=COALESCE(verified_at, now()) WHERE id=$1::uuid`, domainID)
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), s.platformActor(r), tenantID, "tenant.domain.primary", map[string]any{"domain_id": domainID})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) deleteTenantDomain(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	domainID := chi.URLParam(r, "id")
	var tenantID, domain string
	if err := s.tenantManager.CoreDB().QueryRow(r.Context(), `SELECT tenant_id::text, domain FROM tenant_domains WHERE id=$1::uuid`, domainID).Scan(&tenantID, &domain); err != nil {
		writeError(w, err)
		return
	}
	var count int64
	_ = s.tenantManager.CoreDB().QueryRow(r.Context(), `SELECT count(*) FROM tenant_domains WHERE tenant_id=$1::uuid`, tenantID).Scan(&count)
	if count <= 1 {
		writeError(w, badRequest("No puedes eliminar el único dominio del tenant"))
		return
	}
	_, err := s.tenantManager.CoreDB().Exec(r.Context(), `DELETE FROM tenant_domains WHERE id=$1::uuid`, domainID)
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), s.platformActor(r), tenantID, "tenant.domain.delete", map[string]any{"domain": domain})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type platformCatalogCategory struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Icon          string    `json:"icon"`
	Description   string    `json:"description"`
	SortOrder     int       `json:"sort_order"`
	Active        bool      `json:"active"`
	GroupsCount   int64     `json:"groups_count"`
	DetailsCount  int64     `json:"details_count"`
	ProductsCount int64     `json:"products_count"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type platformCatalogGroup struct {
	ID            string    `json:"id"`
	CategoryID    string    `json:"category_id"`
	CategoryName  string    `json:"category_name"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	SortOrder     int       `json:"sort_order"`
	Active        bool      `json:"active"`
	ProductsCount int64     `json:"products_count"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type platformCatalogDetail struct {
	ID            string    `json:"id"`
	CategoryID    string    `json:"category_id"`
	CategoryName  string    `json:"category_name"`
	GroupID       string    `json:"group_id"`
	GroupName     string    `json:"group_name"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	SortOrder     int       `json:"sort_order"`
	Active        bool      `json:"active"`
	ProductsCount int64     `json:"products_count"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type platformCatalogBrand struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Logo          string    `json:"logo"`
	OriginCountry string    `json:"origin_country"`
	Description   string    `json:"description"`
	SortOrder     int       `json:"sort_order"`
	Active        bool      `json:"active"`
	ProductsCount int64     `json:"products_count"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type platformCatalogProduct struct {
	ID             string         `json:"id"`
	SourceKey      string         `json:"source_key"`
	Name           string         `json:"name"`
	Description    string         `json:"description"`
	Barcode        string         `json:"barcode"`
	Image          string         `json:"image"`
	ImageSourceURL string         `json:"image_source_url"`
	CategoryID     string         `json:"category_id"`
	CategoryName   string         `json:"category_name"`
	CategoryIcon   string         `json:"category_icon"`
	GroupID        string         `json:"group_id"`
	GroupName      string         `json:"group_name"`
	DetailID       string         `json:"detail_id"`
	DetailName     string         `json:"detail_name"`
	BrandID        string         `json:"brand_id"`
	BrandName      string         `json:"brand_name"`
	Format         string         `json:"format"`
	SortOrder      int            `json:"sort_order"`
	Active         bool           `json:"active"`
	Metadata       map[string]any `json:"metadata"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

type platformCatalogSuggestion struct {
	ID              string    `json:"id"`
	Barcode         string    `json:"barcode"`
	RequestsCount   int       `json:"requests_count"`
	OwnerName       string    `json:"owner_name"`
	OwnerWhatsapp   string    `json:"owner_whatsapp"`
	TenantName      string    `json:"tenant_name"`
	Status          string    `json:"status"`
	LastRequestedAt time.Time `json:"last_requested_at"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type platformCatalogPayload struct {
	Stats       map[string]any              `json:"stats"`
	Categories  []platformCatalogCategory   `json:"categories"`
	Groups      []platformCatalogGroup      `json:"groups"`
	Details     []platformCatalogDetail     `json:"details"`
	Brands      []platformCatalogBrand      `json:"brands"`
	Products    []platformCatalogProduct    `json:"products"`
	Suggestions []platformCatalogSuggestion `json:"suggestions"`
}

type defaultCatalogProduct struct {
	Name               string `json:"name"`
	Description        string `json:"description"`
	Image              string `json:"image"`
	ImageSourceURL     string `json:"imageSourceUrl"`
	Brand              string `json:"brand"`
	SourceSubCategory  string `json:"sourceSubCategory"`
	SourceSubCategory2 string `json:"sourceSubCategory2"`
	SourceSiteName     string `json:"sourceSiteName"`
	SourceCategory     string `json:"sourceCategory"`
	Barcode            string `json:"barcode"`
}

type defaultCatalogFile struct {
	GeneratedAt   string `json:"generatedAt"`
	SourceFiles   int    `json:"sourceFiles"`
	TotalProducts int    `json:"totalProducts"`
	Categories    []struct {
		Category      string `json:"category"`
		TotalProducts int    `json:"totalProducts"`
	} `json:"categories"`
	Products []defaultCatalogProduct `json:"products"`
}

type catalogImportRequest struct {
	Offset int `json:"offset"`
	Limit  int `json:"limit"`
}

const catalogImportMaxBatchSize = 100

func catalogImportWindow(total, offset, limit int) (int, int) {
	if total < 0 {
		total = 0
	}
	if offset < 0 {
		offset = 0
	}
	if offset > total {
		offset = total
	}
	if limit <= 0 || limit > catalogImportMaxBatchSize {
		limit = catalogImportMaxBatchSize
	}
	end := offset + limit
	if end > total {
		end = total
	}
	return offset, end
}

func (s *Server) platformCatalogDB() AppDB {
	if s.tenantManager != nil {
		return s.tenantManager.CoreDB()
	}
	return s.db
}

func (s *Server) ensurePlatformCatalogTables(ctx context.Context) error {
	_, err := s.platformCatalogDB().Exec(ctx, `
		CREATE TABLE IF NOT EXISTS platform_catalog_categories (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, icon text NOT NULL DEFAULT '📦', description text NOT NULL DEFAULT '', sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
		);
		CREATE TABLE IF NOT EXISTS platform_catalog_groups (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category_id uuid NOT NULL REFERENCES platform_catalog_categories(id) ON DELETE CASCADE, name text NOT NULL, description text NOT NULL DEFAULT '', sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(category_id, name)
		);
		CREATE TABLE IF NOT EXISTS platform_catalog_details (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category_id uuid NOT NULL REFERENCES platform_catalog_categories(id) ON DELETE CASCADE, group_id uuid REFERENCES platform_catalog_groups(id) ON DELETE CASCADE, name text NOT NULL, description text NOT NULL DEFAULT '', sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(category_id, group_id, name)
		);
		CREATE TABLE IF NOT EXISTS platform_catalog_brands (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, logo text NOT NULL DEFAULT '', origin_country text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '', sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
		);
		CREATE TABLE IF NOT EXISTS platform_catalog_products (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_key text NOT NULL UNIQUE, name text NOT NULL, description text NOT NULL DEFAULT '', barcode text NOT NULL DEFAULT '', image text NOT NULL DEFAULT '', image_source_url text NOT NULL DEFAULT '', category_id uuid REFERENCES platform_catalog_categories(id) ON DELETE SET NULL, group_id uuid REFERENCES platform_catalog_groups(id) ON DELETE SET NULL, detail_id uuid REFERENCES platform_catalog_details(id) ON DELETE SET NULL, brand_id uuid REFERENCES platform_catalog_brands(id) ON DELETE SET NULL, format text NOT NULL DEFAULT 'Unidad', sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
		);
		CREATE TABLE IF NOT EXISTS platform_catalog_suggestions (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(), barcode text NOT NULL UNIQUE, requests_count integer NOT NULL DEFAULT 1, owner_name text NOT NULL DEFAULT '', owner_whatsapp text NOT NULL DEFAULT '', tenant_name text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending', last_requested_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
		);
		CREATE INDEX IF NOT EXISTS idx_platform_catalog_categories_lower_name ON platform_catalog_categories(lower(name));
		CREATE INDEX IF NOT EXISTS idx_platform_catalog_groups_lower_name ON platform_catalog_groups(lower(name));
		CREATE INDEX IF NOT EXISTS idx_platform_catalog_brands_lower_name ON platform_catalog_brands(lower(name));
		CREATE INDEX IF NOT EXISTS idx_platform_catalog_products_active ON platform_catalog_products(active);
		CREATE INDEX IF NOT EXISTS idx_platform_catalog_products_category ON platform_catalog_products(category_id);
		CREATE INDEX IF NOT EXISTS idx_platform_catalog_products_category_active ON platform_catalog_products(category_id, active, sort_order, name);
		CREATE INDEX IF NOT EXISTS idx_platform_catalog_products_group ON platform_catalog_products(group_id);
		CREATE INDEX IF NOT EXISTS idx_platform_catalog_products_group_active ON platform_catalog_products(group_id, active, sort_order, name);
		CREATE INDEX IF NOT EXISTS idx_platform_catalog_products_detail ON platform_catalog_products(detail_id);
		CREATE INDEX IF NOT EXISTS idx_platform_catalog_products_brand ON platform_catalog_products(brand_id);
		CREATE INDEX IF NOT EXISTS idx_platform_catalog_products_brand_active ON platform_catalog_products(brand_id, active, sort_order, name);
		CREATE INDEX IF NOT EXISTS idx_platform_catalog_products_barcode ON platform_catalog_products(barcode);
	`)
	return err
}

func catalogCategoryIcon(name string) string {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "carnes y pescados":
		return "🥩"
	case "congelados":
		return "🧊"
	case "cuidado personal":
		return "🧴"
	case "despensa":
		return "🛒"
	case "frutas y vegetales":
		return "🥦"
	case "galletas y dulces":
		return "🍪"
	case "lacteos y huevos", "lácteos y huevos":
		return "🥛"
	case "limpieza y desechables":
		return "🧹"
	case "mascotas":
		return "🐶"
	case "panaderia y reposteria", "panadería y repostería":
		return "🍞"
	case "picadera":
		return "🥨"
	case "quesos y embutidos":
		return "🧀"
	case "licores y cervezas":
		return "🍺"
	case "bebidas":
		return "🥤"
	default:
		return "📦"
	}
}

func inferCatalogFormat(name string) string {
	value := strings.ToLower(name)
	switch {
	case strings.Contains(value, " lb") || strings.Contains(value, "libra") || strings.Contains(value, "lbs"):
		return "Libra"
	case strings.Contains(value, "botella"):
		return "Botella"
	case strings.Contains(value, "funda"):
		return "Funda"
	case strings.Contains(value, "paq") || strings.Contains(value, "paquete"):
		return "Paquete"
	case strings.Contains(value, "caja"):
		return "Caja"
	case strings.Contains(value, "carton") || strings.Contains(value, "cartón"):
		return "Cartón"
	case strings.Contains(value, "galon") || strings.Contains(value, "galón"):
		return "Galón"
	case strings.Contains(value, "lata"):
		return "Lata"
	case strings.Contains(value, "saco"):
		return "Saco"
	default:
		return "Unidad"
	}
}

var productSearchSeparatorPattern = regexp.MustCompile(`[^\p{L}\p{N}]+`)

var productSearchAccentReplacer = strings.NewReplacer(
	"á", "a",
	"é", "e",
	"í", "i",
	"ó", "o",
	"ú", "u",
	"ü", "u",
	"ñ", "n",
)

func normalizeProductSearchText(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	normalized = productSearchAccentReplacer.Replace(normalized)
	normalized = productSearchSeparatorPattern.ReplaceAllString(normalized, " ")
	return strings.Join(strings.Fields(normalized), " ")
}

func trimCatalogSlashes(value string) string {
	return strings.Trim(strings.ReplaceAll(strings.TrimSpace(value), "\\", "/"), "/")
}

func applyCatalogImagePathAliases(value string) string {
	normalized := strings.TrimSpace(value)
	replacements := [][2]string{
		{"/quesos-y-embutidos/complementos-deli/", "/quesos-y-embutidos/delicateces/"},
		{"/quesos-y-embutidos/complementos/", "/quesos-y-embutidos/delicateces/"},
		{"/despensa/conservas-enlatados-y-aceitunas/conservas-de-pescado-marisco/", "/despensa/conservas-enlatados-y-aceitunas/conservas-de-pescado-y-marisco/"},
		{"/despensa/conservas-enlatados-y-aceitunas/conserva-vegetales-legumbres/", "/despensa/conservas-enlatados-y-aceitunas/conserva-vegetales-y-legumbres/"},
		{"/bebidas/refrescos-y-energizantes/mixers-soda-tonica2c-entre-otros/", "/bebidas/refrescos-y-energizantes/mixers-soda-tonicas-entre-otros/"},
	}
	for _, replacement := range replacements {
		if strings.Contains(normalized, replacement[0]) {
			normalized = strings.Replace(normalized, replacement[0], replacement[1], 1)
		}
		fromWithoutLeading := strings.TrimPrefix(replacement[0], "/")
		toWithoutLeading := strings.TrimPrefix(replacement[1], "/")
		if strings.Contains(normalized, fromWithoutLeading) {
			normalized = strings.Replace(normalized, fromWithoutLeading, toWithoutLeading, 1)
		}
	}
	return normalized
}

func normalizeCatalogImagePath(value string) string {
	pathValue := trimCatalogSlashes(value)
	pathValue = strings.TrimPrefix(pathValue, "catalogo/")
	pathValue = strings.TrimPrefix(pathValue, "images/")
	for strings.Contains(pathValue, "//") {
		pathValue = strings.ReplaceAll(pathValue, "//", "/")
	}
	return trimCatalogSlashes(applyCatalogImagePathAliases(pathValue))
}

func normalizeCatalogImageURL(value string) string {
	raw := strings.TrimSpace(value)
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(raw, "data:") || strings.HasPrefix(raw, "blob:") {
		return raw
	}
	if strings.HasPrefix(raw, "//") {
		return normalizeCatalogImageURL("https:" + raw)
	}
	lower := strings.ToLower(raw)
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
		u, err := url.Parse(raw)
		if err != nil || u.Host == "" {
			return applyCatalogImagePathAliases(raw)
		}
		if strings.EqualFold(u.Host, "catalogo.ltd.do") {
			u.Path = "/" + normalizeCatalogImagePath(u.Path)
			return u.String()
		}
		return applyCatalogImagePathAliases(raw)
	}
	return "https://catalogo.ltd.do/" + normalizeCatalogImagePath(raw)
}

func catalogImageExtensionFallbacks(value string) []string {
	if !strings.Contains(value, "catalogo.ltd.do") {
		return nil
	}
	lower := strings.ToLower(value)
	extensions := []string{".jpg", ".jpeg", ".png", ".webp"}
	current := ""
	for _, ext := range extensions {
		if strings.HasSuffix(lower, ext) {
			current = ext
			break
		}
	}
	if current == "" {
		return nil
	}
	base := value[:len(value)-len(current)]
	fallbacks := []string{}
	for _, ext := range extensions {
		if ext != current {
			fallbacks = append(fallbacks, base+ext)
		}
	}
	return fallbacks
}

func catalogImageURLCandidates(image, imageSourceURL string) []string {
	candidates := []string{}
	seen := map[string]bool{}
	add := func(value string) {
		normalized := normalizeCatalogImageURL(value)
		if normalized == "" || seen[normalized] {
			return
		}
		seen[normalized] = true
		candidates = append(candidates, normalized)
		for _, fallback := range catalogImageExtensionFallbacks(normalized) {
			if fallback != "" && !seen[fallback] {
				seen[fallback] = true
				candidates = append(candidates, fallback)
			}
		}
	}
	add(image)
	add(imageSourceURL)
	return candidates
}

func preferredCatalogImageURL(image, imageSourceURL string) string {
	candidates := catalogImageURLCandidates(image, imageSourceURL)
	if len(candidates) == 0 {
		return ""
	}
	return candidates[0]
}

func normalizePlatformCatalogProductImage(item *platformCatalogProduct) {
	if item == nil {
		return
	}
	item.Image = strings.TrimSpace(item.Image)
	item.ImageSourceURL = preferredCatalogImageURL(item.Image, item.ImageSourceURL)
}

func catalogSourceKey(parts ...string) string {
	base := strings.Join(parts, "|")
	if strings.TrimSpace(base) == "" {
		base = time.Now().UTC().Format(time.RFC3339Nano)
	}
	return "catalog:" + sha256Hex(base)[:32]
}

func scanNullString(ns sql.NullString) string {
	if ns.Valid {
		return ns.String
	}
	return ""
}

func (s *Server) ensureCatalogCategory(ctx context.Context, name, icon, description string, sortOrder int) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", badRequest("El nombre de la categoría es obligatorio")
	}
	if icon == "" {
		icon = catalogCategoryIcon(name)
	}
	var id string
	err := s.platformCatalogDB().QueryRow(ctx, `
		INSERT INTO platform_catalog_categories (name, icon, description, sort_order, active)
		VALUES ($1,$2,$3,$4,true)
		ON CONFLICT (name) DO UPDATE SET icon=COALESCE(NULLIF(platform_catalog_categories.icon,''), EXCLUDED.icon), description=COALESCE(NULLIF(platform_catalog_categories.description,''), EXCLUDED.description), updated_at=now()
		RETURNING id::text
	`, name, icon, description, sortOrder).Scan(&id)
	return id, err
}

func (s *Server) ensureCatalogGroup(ctx context.Context, categoryID, name, description string, sortOrder int) (string, error) {
	name = strings.TrimSpace(name)
	if categoryID == "" || name == "" {
		return "", nil
	}
	var id string
	err := s.platformCatalogDB().QueryRow(ctx, `
		INSERT INTO platform_catalog_groups (category_id, name, description, sort_order, active)
		VALUES ($1::uuid,$2,$3,$4,true)
		ON CONFLICT (category_id, name) DO UPDATE SET description=COALESCE(NULLIF(platform_catalog_groups.description,''), EXCLUDED.description), updated_at=now()
		RETURNING id::text
	`, categoryID, name, description, sortOrder).Scan(&id)
	return id, err
}

func (s *Server) ensureCatalogDetail(ctx context.Context, categoryID, groupID, name, description string, sortOrder int) (string, error) {
	name = strings.TrimSpace(name)
	if categoryID == "" || name == "" {
		return "", nil
	}
	var id string
	err := s.platformCatalogDB().QueryRow(ctx, `
		INSERT INTO platform_catalog_details (category_id, group_id, name, description, sort_order, active)
		VALUES ($1::uuid,NULLIF($2,'')::uuid,$3,$4,$5,true)
		ON CONFLICT (category_id, group_id, name) DO UPDATE SET description=COALESCE(NULLIF(platform_catalog_details.description,''), EXCLUDED.description), updated_at=now()
		RETURNING id::text
	`, categoryID, groupID, name, description, sortOrder).Scan(&id)
	return id, err
}

func (s *Server) ensureCatalogBrand(ctx context.Context, name, logo, country, description string, sortOrder int) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "Sin marca"
	}
	var id string
	err := s.platformCatalogDB().QueryRow(ctx, `
		INSERT INTO platform_catalog_brands (name, logo, origin_country, description, sort_order, active)
		VALUES ($1,$2,$3,$4,$5,true)
		ON CONFLICT (name) DO UPDATE SET logo=COALESCE(NULLIF(platform_catalog_brands.logo,''), EXCLUDED.logo), origin_country=COALESCE(NULLIF(platform_catalog_brands.origin_country,''), EXCLUDED.origin_country), description=COALESCE(NULLIF(platform_catalog_brands.description,''), EXCLUDED.description), updated_at=now()
		RETURNING id::text
	`, name, logo, country, description, sortOrder).Scan(&id)
	return id, err
}

func (s *Server) upsertCatalogProduct(ctx context.Context, input map[string]any) (platformCatalogProduct, error) {
	name := strings.TrimSpace(str(input, "name"))
	if name == "" {
		return platformCatalogProduct{}, badRequest("El nombre comercial es obligatorio")
	}
	categoryID := strings.TrimSpace(strEither(input, "category_id", "categoryId"))
	categoryName := strings.TrimSpace(firstNonEmpty(str(input, "category_name"), str(input, "category")))
	categoryIcon := strings.TrimSpace(firstNonEmpty(strEither(input, "category_icon", "categoryIcon"), catalogCategoryIcon(categoryName)))
	if categoryID == "" && categoryName != "" {
		id, err := s.ensureCatalogCategory(ctx, categoryName, categoryIcon, "", intValue(input, "sort_order"))
		if err != nil {
			return platformCatalogProduct{}, err
		}
		categoryID = id
	}
	groupID := strings.TrimSpace(strEither(input, "group_id", "groupId"))
	groupName := strings.TrimSpace(firstNonEmpty(str(input, "group_name"), str(input, "group")))
	if groupID == "" && categoryID != "" && groupName != "" {
		id, err := s.ensureCatalogGroup(ctx, categoryID, groupName, "", 0)
		if err != nil {
			return platformCatalogProduct{}, err
		}
		groupID = id
	}
	detailID := strings.TrimSpace(strEither(input, "detail_id", "detailId"))
	detailName := strings.TrimSpace(firstNonEmpty(str(input, "detail_name"), str(input, "detail")))
	if detailID == "" && categoryID != "" && detailName != "" {
		id, err := s.ensureCatalogDetail(ctx, categoryID, groupID, detailName, "", 0)
		if err != nil {
			return platformCatalogProduct{}, err
		}
		detailID = id
	}
	brandID := strings.TrimSpace(strEither(input, "brand_id", "brandId"))
	brandName := strings.TrimSpace(firstNonEmpty(str(input, "brand_name"), str(input, "brand")))
	if brandID == "" && brandName != "" {
		id, err := s.ensureCatalogBrand(ctx, brandName, str(input, "brand_logo"), strEither(input, "origin_country", "originCountry"), "", 0)
		if err != nil {
			return platformCatalogProduct{}, err
		}
		brandID = id
	}
	barcode := normalizeBarcode(str(input, "barcode"))
	image := normalizeCatalogImageURL(str(input, "image"))
	imageURL := preferredCatalogImageURL(image, strEither(input, "image_source_url", "imageSourceUrl"))
	format := strings.TrimSpace(str(input, "format"))
	if format == "" {
		format = inferCatalogFormat(name)
	}
	metadata := map[string]any{}
	if raw, ok := input["metadata"].(map[string]any); ok {
		metadata = raw
	}
	metadataBytes, _ := json.Marshal(metadata)
	sourceKey := strings.TrimSpace(strEither(input, "source_key", "sourceKey"))
	if sourceKey == "" {
		sourceKey = catalogSourceKey(categoryName, groupName, detailName, barcode, name, image)
	}
	// Imports and concurrent catalog operations converge on the canonical product
	// already assigned to this normalized barcode instead of creating duplicates.
	if barcode != "" {
		existing, lookupErr := s.lookupPlatformCatalogProductByBarcode(ctx, barcode)
		if lookupErr == nil {
			sourceKey = existing.SourceKey
		} else if !errors.Is(lookupErr, pgx.ErrNoRows) {
			return platformCatalogProduct{}, lookupErr
		}
	}
	active := boolDefault(input, "active", true)
	if _, ok := input["visibility"]; ok {
		active = strings.ToLower(strings.TrimSpace(str(input, "visibility"))) != "hidden"
	}

	var item platformCatalogProduct
	var categoryIDNS, categoryNameNS, categoryIconNS, groupIDNS, groupNameNS, detailIDNS, detailNameNS, brandIDNS, brandNameNS sql.NullString
	var metadataRaw []byte
	err := s.platformCatalogDB().QueryRow(ctx, `
		WITH upserted AS (
			INSERT INTO platform_catalog_products (source_key, name, description, barcode, image, image_source_url, category_id, group_id, detail_id, brand_id, format, sort_order, active, metadata)
			VALUES ($1,$2,$3,$4,$5,$6,NULLIF($7,'')::uuid,NULLIF($8,'')::uuid,NULLIF($9,'')::uuid,NULLIF($10,'')::uuid,$11,$12,$13,$14::jsonb)
			ON CONFLICT (source_key) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, barcode=EXCLUDED.barcode, image=EXCLUDED.image, image_source_url=EXCLUDED.image_source_url, category_id=EXCLUDED.category_id, group_id=EXCLUDED.group_id, detail_id=EXCLUDED.detail_id, brand_id=EXCLUDED.brand_id, format=EXCLUDED.format, sort_order=EXCLUDED.sort_order, active=EXCLUDED.active, metadata=EXCLUDED.metadata, updated_at=now()
			RETURNING *
		)
		SELECT p.id::text, p.source_key, p.name, p.description, p.barcode, p.image, p.image_source_url,
		       COALESCE(c.id::text,''), COALESCE(c.name,''), COALESCE(c.icon,''), COALESCE(g.id::text,''), COALESCE(g.name,''), COALESCE(d.id::text,''), COALESCE(d.name,''), COALESCE(b.id::text,''), COALESCE(b.name,''),
		       p.format, p.sort_order, p.active, p.metadata, p.created_at, p.updated_at
		FROM upserted p
		LEFT JOIN platform_catalog_categories c ON c.id=p.category_id
		LEFT JOIN platform_catalog_groups g ON g.id=p.group_id
		LEFT JOIN platform_catalog_details d ON d.id=p.detail_id
		LEFT JOIN platform_catalog_brands b ON b.id=p.brand_id
	`, sourceKey, name, str(input, "description"), barcode, image, imageURL, categoryID, groupID, detailID, brandID, format, intValue(input, "sort_order"), active, string(metadataBytes)).Scan(
		&item.ID, &item.SourceKey, &item.Name, &item.Description, &item.Barcode, &item.Image, &item.ImageSourceURL,
		&categoryIDNS, &categoryNameNS, &categoryIconNS, &groupIDNS, &groupNameNS, &detailIDNS, &detailNameNS, &brandIDNS, &brandNameNS,
		&item.Format, &item.SortOrder, &item.Active, &metadataRaw, &item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		return item, err
	}
	item.CategoryID, item.CategoryName, item.CategoryIcon = scanNullString(categoryIDNS), scanNullString(categoryNameNS), scanNullString(categoryIconNS)
	item.GroupID, item.GroupName = scanNullString(groupIDNS), scanNullString(groupNameNS)
	item.DetailID, item.DetailName = scanNullString(detailIDNS), scanNullString(detailNameNS)
	item.BrandID, item.BrandName = scanNullString(brandIDNS), scanNullString(brandNameNS)
	item.Metadata = map[string]any{}
	_ = json.Unmarshal(metadataRaw, &item.Metadata)
	normalizePlatformCatalogProductImage(&item)
	if barcode != "" {
		_, _ = s.platformCatalogDB().Exec(ctx, `UPDATE platform_catalog_suggestions SET status='converted', updated_at=now() WHERE barcode=$1`, barcode)
	}
	return item, nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func normalizeBarcode(value string) string {
	value = strings.TrimSpace(value)
	value = strings.Map(func(r rune) rune {
		if r == '\u200b' || r == '\u200c' || r == '\u200d' || r == '\ufeff' || r == ' ' || r == '\t' || r == '\n' || r == '\r' {
			return -1
		}
		return r
	}, value)
	return strings.ToUpper(strings.TrimSpace(value))
}

func scanPlatformCatalogProductRow(row rowScanner) (platformCatalogProduct, error) {
	var item platformCatalogProduct
	var categoryIDNS, categoryNameNS, categoryIconNS, groupIDNS, groupNameNS, detailIDNS, detailNameNS, brandIDNS, brandNameNS sql.NullString
	var metadataRaw []byte
	err := row.Scan(
		&item.ID, &item.SourceKey, &item.Name, &item.Description, &item.Barcode, &item.Image, &item.ImageSourceURL,
		&categoryIDNS, &categoryNameNS, &categoryIconNS, &groupIDNS, &groupNameNS, &detailIDNS, &detailNameNS, &brandIDNS, &brandNameNS,
		&item.Format, &item.SortOrder, &item.Active, &metadataRaw, &item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		return item, err
	}
	item.CategoryID, item.CategoryName, item.CategoryIcon = scanNullString(categoryIDNS), scanNullString(categoryNameNS), scanNullString(categoryIconNS)
	item.GroupID, item.GroupName = scanNullString(groupIDNS), scanNullString(groupNameNS)
	item.DetailID, item.DetailName = scanNullString(detailIDNS), scanNullString(detailNameNS)
	item.BrandID, item.BrandName = scanNullString(brandIDNS), scanNullString(brandNameNS)
	item.Metadata = map[string]any{}
	_ = json.Unmarshal(metadataRaw, &item.Metadata)
	normalizePlatformCatalogProductImage(&item)
	return item, nil
}

func (s *Server) lookupPlatformCatalogProductByBarcode(ctx context.Context, rawBarcode string) (platformCatalogProduct, error) {
	barcode := normalizeBarcode(rawBarcode)
	if barcode == "" {
		return platformCatalogProduct{}, badRequest("El código de barras es obligatorio")
	}
	return scanPlatformCatalogProductRow(s.platformCatalogDB().QueryRow(ctx, `
		SELECT p.id::text, p.source_key, p.name, p.description, p.barcode, p.image, p.image_source_url,
		       COALESCE(c.id::text,''), COALESCE(c.name,''), COALESCE(c.icon,''), COALESCE(g.id::text,''), COALESCE(g.name,''), COALESCE(d.id::text,''), COALESCE(d.name,''), COALESCE(b.id::text,''), COALESCE(b.name,''),
		       p.format, p.sort_order, p.active, p.metadata, p.created_at, p.updated_at
		FROM platform_catalog_products p
		LEFT JOIN platform_catalog_categories c ON c.id=p.category_id
		LEFT JOIN platform_catalog_groups g ON g.id=p.group_id
		LEFT JOIN platform_catalog_details d ON d.id=p.detail_id
		LEFT JOIN platform_catalog_brands b ON b.id=p.brand_id
		WHERE upper(regexp_replace(p.barcode, '[[:space:]]+', '', 'g'))=$1
		ORDER BY p.active DESC, p.updated_at DESC, p.created_at DESC
		LIMIT 1
	`, barcode))
}

func (s *Server) platformCatalogBarcodeLookup(w http.ResponseWriter, r *http.Request) {
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	barcode := normalizeBarcode(chi.URLParam(r, "barcode"))
	item, err := s.lookupPlatformCatalogProductByBarcode(r.Context(), barcode)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusOK, map[string]any{"found": false, "barcode": barcode})
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"found": true, "barcode": barcode, "product": item})
}

func (s *Server) ensureTenantBarcodeTables(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS product_barcodes (
			product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
			store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
			barcode text NOT NULL,
			created_at timestamptz NOT NULL DEFAULT now(),
			updated_at timestamptz NOT NULL DEFAULT now(),
			UNIQUE(store_id, barcode)
		);
		CREATE INDEX IF NOT EXISTS idx_product_barcodes_barcode ON product_barcodes(barcode);
		CREATE TABLE IF NOT EXISTS product_suggestions (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
			barcode text NOT NULL,
			global_product_id text NOT NULL DEFAULT '',
			product_name text NOT NULL DEFAULT '',
			product_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
			requests_count integer NOT NULL DEFAULT 1 CHECK (requests_count > 0),
			customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
			customer_name text NOT NULL DEFAULT '',
			customer_whatsapp text NOT NULL DEFAULT '',
			status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','dismissed')),
			last_requested_at timestamptz NOT NULL DEFAULT now(),
			created_at timestamptz NOT NULL DEFAULT now(),
			updated_at timestamptz NOT NULL DEFAULT now(),
			UNIQUE(store_id, barcode)
		);
		CREATE INDEX IF NOT EXISTS idx_product_suggestions_store_status ON product_suggestions(store_id, status, last_requested_at DESC);
	`)
	return err
}

func (s *Server) hydrateProductBarcode(ctx context.Context, product Product) Product {
	if strings.TrimSpace(product.ID) == "" {
		return product
	}
	_ = s.ensureTenantBarcodeTables(ctx)
	_ = s.db.QueryRow(ctx, `SELECT barcode FROM product_barcodes WHERE product_id=$1::uuid`, product.ID).Scan(&product.Barcode)
	return product
}

func (s *Server) hydrateProductBarcodes(ctx context.Context, products []Product) []Product {
	if len(products) == 0 {
		return products
	}
	if err := s.ensureTenantBarcodeTables(ctx); err != nil {
		return products
	}
	rows, err := s.db.Query(ctx, `SELECT product_id::text, barcode FROM product_barcodes`)
	if err != nil {
		return products
	}
	defer rows.Close()
	codes := map[string]string{}
	for rows.Next() {
		var id, barcode string
		if rows.Scan(&id, &barcode) == nil {
			codes[id] = barcode
		}
	}
	for i := range products {
		products[i].Barcode = codes[products[i].ID]
	}
	return products
}

func (s *Server) localProductByBarcode(ctx context.Context, storeID, rawBarcode string) (Product, error) {
	barcode := normalizeBarcode(rawBarcode)
	if err := s.ensureTenantBarcodeTables(ctx); err != nil {
		return Product{}, err
	}
	var productID string
	err := s.db.QueryRow(ctx, `
		SELECT product_id::text
		FROM product_barcodes
		WHERE store_id=$1::uuid AND barcode=$2
		LIMIT 1
	`, storeID, barcode).Scan(&productID)
	if err != nil {
		return Product{}, err
	}
	product, err := s.queries.GetProduct(ctx, productID)
	if err != nil {
		return Product{}, err
	}
	product.Barcode = barcode
	return product, nil
}

func (s *Server) catalogBarcodeLookupPayload(ctx context.Context, barcode string) (map[string]any, error) {
	store, err := s.firstTenantStore(ctx)
	if err != nil {
		return nil, err
	}
	payload := map[string]any{"barcode": barcode, "local_found": false, "global_found": false}
	local, localErr := s.localProductByBarcode(ctx, store.ID, barcode)
	if localErr == nil {
		payload["local_found"] = true
		payload["local_product"] = local
	} else if !errors.Is(localErr, pgx.ErrNoRows) {
		return nil, localErr
	}
	if err := s.ensurePlatformCatalogTables(ctx); err != nil {
		return nil, err
	}
	global, globalErr := s.lookupPlatformCatalogProductByBarcode(ctx, barcode)
	if globalErr == nil {
		payload["global_found"] = true
		payload["global_product"] = global
		if payload["local_found"] == false {
			var productID string
			err := s.db.QueryRow(ctx, `SELECT id::text FROM products WHERE store_id=$1::uuid AND global_id=$2 ORDER BY created_at LIMIT 1`, store.ID, global.ID).Scan(&productID)
			if err == nil {
				product, getErr := s.queries.GetProduct(ctx, productID)
				if getErr != nil {
					return nil, getErr
				}
				_, _ = s.db.Exec(ctx, `
					INSERT INTO product_barcodes (product_id, store_id, barcode)
					VALUES ($1::uuid,$2::uuid,$3)
					ON CONFLICT (product_id) DO UPDATE SET barcode=EXCLUDED.barcode, updated_at=now()
				`, product.ID, store.ID, barcode)
				product.Barcode = barcode
				payload["local_found"] = true
				payload["local_product"] = product
			} else if !errors.Is(err, pgx.ErrNoRows) {
				return nil, err
			}
		}
	} else if !errors.Is(globalErr, pgx.ErrNoRows) {
		return nil, globalErr
	}
	return payload, nil
}

func (s *Server) adminCatalogBarcodeLookup(w http.ResponseWriter, r *http.Request) {
	barcode := normalizeBarcode(chi.URLParam(r, "barcode"))
	if barcode == "" {
		writeError(w, badRequest("El código de barras es obligatorio"))
		return
	}
	payload, err := s.catalogBarcodeLookupPayload(r.Context(), barcode)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, payload)
}

func (s *Server) customerCatalogBarcodeLookup(w http.ResponseWriter, r *http.Request) {
	barcode := normalizeBarcode(chi.URLParam(r, "barcode"))
	if barcode == "" {
		writeError(w, badRequest("El código de barras es obligatorio"))
		return
	}
	payload, err := s.catalogBarcodeLookupPayload(r.Context(), barcode)
	if err != nil {
		writeError(w, err)
		return
	}
	if product, ok := payload["local_product"].(Product); ok && payload["local_found"] == true && product.Stock <= 0 {
		payload["local_found"] = false
		payload["local_out_of_stock"] = true
	}
	writeJSON(w, http.StatusOK, payload)
}

type tenantProductSuggestion struct {
	ID               string         `json:"id"`
	StoreID          string         `json:"store_id"`
	Barcode          string         `json:"barcode"`
	GlobalProductID  string         `json:"global_product_id"`
	ProductName      string         `json:"product_name"`
	ProductSnapshot  map[string]any `json:"product_snapshot"`
	RequestsCount    int            `json:"requests_count"`
	CustomerID       string         `json:"customer_id"`
	CustomerName     string         `json:"customer_name"`
	CustomerWhatsapp string         `json:"customer_whatsapp"`
	Status           string         `json:"status"`
	LastRequestedAt  time.Time      `json:"last_requested_at"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
}

func scanTenantProductSuggestion(row rowScanner) (tenantProductSuggestion, error) {
	var item tenantProductSuggestion
	var snapshotRaw []byte
	var customerID sql.NullString
	err := row.Scan(&item.ID, &item.StoreID, &item.Barcode, &item.GlobalProductID, &item.ProductName, &snapshotRaw, &item.RequestsCount, &customerID, &item.CustomerName, &item.CustomerWhatsapp, &item.Status, &item.LastRequestedAt, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		return item, err
	}
	item.CustomerID = scanNullString(customerID)
	item.ProductSnapshot = map[string]any{}
	_ = json.Unmarshal(snapshotRaw, &item.ProductSnapshot)
	return item, nil
}

const tenantSuggestionColumns = `id::text, store_id::text, barcode, global_product_id, product_name, product_snapshot, requests_count,
       customer_id::text, customer_name, customer_whatsapp, status, last_requested_at, created_at, updated_at`

const tenantSuggestionSelect = `SELECT ` + tenantSuggestionColumns + ` FROM product_suggestions`

func (s *Server) createCustomerProductSuggestion(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Barcode string `json:"barcode"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	barcode := normalizeBarcode(input.Barcode)
	if barcode == "" {
		writeError(w, badRequest("El código de barras es obligatorio"))
		return
	}
	if err := s.ensureTenantBarcodeTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	store, err := s.firstTenantStore(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	lookupPayload, err := s.catalogBarcodeLookupPayload(r.Context(), barcode)
	if err != nil {
		writeError(w, err)
		return
	}
	if product, ok := lookupPayload["local_product"].(Product); ok && lookupPayload["local_found"] == true {
		writeJSON(w, http.StatusOK, map[string]any{"status": "already_available", "product": product})
		return
	}
	customer, err := s.customerFromRequest(r)
	if err != nil {
		writeError(w, err)
		return
	}
	global, globalFound := lookupPayload["global_product"].(platformCatalogProduct)
	snapshot := map[string]any{}
	globalID, productName := "", ""
	if globalFound {
		globalID, productName = global.ID, global.Name
		raw, _ := json.Marshal(global)
		_ = json.Unmarshal(raw, &snapshot)
	}
	snapshotBytes, _ := json.Marshal(snapshot)
	item, err := scanTenantProductSuggestion(s.db.QueryRow(r.Context(), `
		INSERT INTO product_suggestions (store_id, barcode, global_product_id, product_name, product_snapshot, customer_id, customer_name, customer_whatsapp)
		VALUES ($1::uuid,$2,$3,$4,$5::jsonb,$6::uuid,$7,$8)
		ON CONFLICT (store_id, barcode) DO UPDATE SET
			global_product_id=COALESCE(NULLIF(EXCLUDED.global_product_id,''), product_suggestions.global_product_id),
			product_name=COALESCE(NULLIF(EXCLUDED.product_name,''), product_suggestions.product_name),
			product_snapshot=CASE WHEN EXCLUDED.product_snapshot='{}'::jsonb THEN product_suggestions.product_snapshot ELSE EXCLUDED.product_snapshot END,
			requests_count=product_suggestions.requests_count+1,
			customer_id=EXCLUDED.customer_id,
			customer_name=EXCLUDED.customer_name,
			customer_whatsapp=EXCLUDED.customer_whatsapp,
			status='pending', last_requested_at=now(), updated_at=now()
		RETURNING `+tenantSuggestionColumns, store.ID, barcode, globalID, productName, string(snapshotBytes), customer.ID, customer.Name, customer.Whatsapp))
	if err != nil {
		writeError(w, err)
		return
	}

	escalated := false
	if !globalFound {
		tenantName := store.Name
		ownerName, ownerWhatsapp := customer.Name, customer.Whatsapp
		if tenant, ok := tenancy.FromContext(r.Context()); ok {
			if strings.TrimSpace(tenant.Name) != "" {
				tenantName = tenant.Name
			}
			if s.tenantManager != nil && strings.TrimSpace(tenant.ID) != "" {
				platformTenant, tenantErr := s.scanPlatformTenant(s.tenantManager.CoreDB().QueryRow(r.Context(), s.platformTenantSelect(`WHERE t.id=$1::uuid LIMIT 1`), tenant.ID))
				if tenantErr == nil {
					ownerName = firstNonEmpty(platformTenant.OwnerName, ownerName)
					ownerWhatsapp = firstNonEmpty(platformTenant.OwnerWhatsapp, ownerWhatsapp)
					tenantName = firstNonEmpty(platformTenant.Name, tenantName)
				}
			}
		}
		_, err = s.platformCatalogDB().Exec(r.Context(), `
			INSERT INTO platform_catalog_suggestions (barcode, requests_count, owner_name, owner_whatsapp, tenant_name, status)
			VALUES ($1,1,$2,$3,$4,'pending')
			ON CONFLICT (barcode) DO UPDATE SET requests_count=platform_catalog_suggestions.requests_count+1,
				owner_name=EXCLUDED.owner_name, owner_whatsapp=EXCLUDED.owner_whatsapp, tenant_name=EXCLUDED.tenant_name,
				status='pending', last_requested_at=now(), updated_at=now()
		`, barcode, ownerName, ownerWhatsapp, tenantName)
		if err != nil {
			writeError(w, err)
			return
		}
		escalated = true
	}
	writeJSON(w, http.StatusCreated, map[string]any{"suggestion": item, "global_available": globalFound, "escalated_to_platform": escalated})
}

func (s *Server) listTenantProductSuggestions(w http.ResponseWriter, r *http.Request) {
	if err := s.ensureTenantBarcodeTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	store, err := s.firstTenantStore(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	status := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("status")))
	query := tenantSuggestionSelect + ` WHERE store_id=$1::uuid`
	args := []any{store.ID}
	if status != "" && status != "all" {
		query += ` AND status=$2`
		args = append(args, status)
	}
	query += ` ORDER BY status='pending' DESC, requests_count DESC, last_requested_at DESC`
	rows, err := s.db.Query(r.Context(), query, args...)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []tenantProductSuggestion{}
	for rows.Next() {
		item, scanErr := scanTenantProductSuggestion(rows)
		if scanErr != nil {
			writeError(w, scanErr)
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, err)
		return
	}
	rows.Close()

	// A product may have been created globally after the customer submitted the
	// local suggestion. Resolve it lazily so the business can activate it without
	// requiring another customer request or duplicating the suggestion.
	if err := s.ensurePlatformCatalogTables(r.Context()); err == nil {
		for index := range items {
			if strings.TrimSpace(items[index].GlobalProductID) != "" {
				continue
			}
			global, lookupErr := s.lookupPlatformCatalogProductByBarcode(r.Context(), items[index].Barcode)
			if lookupErr != nil {
				continue
			}
			snapshotBytes, _ := json.Marshal(global)
			refreshed, updateErr := scanTenantProductSuggestion(s.db.QueryRow(r.Context(), `
				UPDATE product_suggestions
				SET global_product_id=$3, product_name=$4, product_snapshot=$5::jsonb, updated_at=now()
				WHERE id=$1::uuid AND store_id=$2::uuid
				RETURNING `+tenantSuggestionColumns,
				items[index].ID, store.ID, global.ID, global.Name, string(snapshotBytes)))
			if updateErr == nil {
				items[index] = refreshed
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"suggestions": items})
}

func (s *Server) updateTenantProductSuggestion(w http.ResponseWriter, r *http.Request) {
	if err := s.ensureTenantBarcodeTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	var input struct {
		Action string `json:"action"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	action := strings.ToLower(strings.TrimSpace(input.Action))
	if action != "accept" && action != "dismiss" && action != "pending" {
		writeError(w, badRequest("Acción inválida"))
		return
	}
	store, err := s.firstTenantStore(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	id := chi.URLParam(r, "id")
	item, err := scanTenantProductSuggestion(s.db.QueryRow(r.Context(), tenantSuggestionSelect+` WHERE id=$1::uuid AND store_id=$2::uuid`, id, store.ID))
	if err != nil {
		writeError(w, err)
		return
	}
	if action == "dismiss" || action == "pending" {
		status := map[string]string{"dismiss": "dismissed", "pending": "pending"}[action]
		item, err = scanTenantProductSuggestion(s.db.QueryRow(r.Context(), `UPDATE product_suggestions SET status=$2, updated_at=now() WHERE id=$1::uuid AND store_id=$3::uuid RETURNING `+tenantSuggestionColumns, id, status, store.ID))
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"suggestion": item})
		return
	}
	global, err := s.lookupPlatformCatalogProductByBarcode(r.Context(), item.Barcode)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, apiError{status: http.StatusConflict, msg: "El producto todavía no existe en el catálogo global. La sugerencia permanece pendiente para el superadministrador."})
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	var product Product
	var productID string
	err = s.db.QueryRow(r.Context(), `
		SELECT id::text
		FROM products
		WHERE store_id=$1::uuid AND global_id=$2
		ORDER BY created_at
		LIMIT 1
	`, store.ID, global.ID).Scan(&productID)
	if errors.Is(err, pgx.ErrNoRows) {
		product, err = s.localProductByBarcode(r.Context(), store.ID, item.Barcode)
	} else if err == nil {
		product, err = s.queries.GetProduct(r.Context(), productID)
		if err == nil {
			product = s.hydrateProductBarcode(r.Context(), product)
		}
	}
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, apiError{status: http.StatusConflict, msg: "Abre la tarjeta del producto, configura precio de venta, precio de compra y existencia disponible, y luego guarda para activarlo."})
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	if product.Price <= 0 || product.Cost <= 0 || product.Stock <= 0 {
		writeError(w, apiError{status: http.StatusConflict, msg: "Completa el precio de venta, el precio de compra y una existencia disponible mayor que cero antes de activar el producto."})
		return
	}
	item, err = scanTenantProductSuggestion(s.db.QueryRow(r.Context(), `UPDATE product_suggestions SET status='accepted', global_product_id=$2, product_name=$3, updated_at=now() WHERE id=$1::uuid AND store_id=$4::uuid RETURNING `+tenantSuggestionColumns, id, global.ID, global.Name, store.ID))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"suggestion": item, "product": product})
}

func (s *Server) platformCatalog(w http.ResponseWriter, r *http.Request) {
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	core := s.platformCatalogDB()
	queryValues := r.URL.Query()
	view := strings.ToLower(strings.TrimSpace(queryValues.Get("view")))
	summaryOnly := view == "summary" || queryValues.Get("summary") == "1"
	productBrowser := view == "products" || queryValues.Get("products") == "1"
	includeInactive := queryValues.Get("include_inactive") == "1" || strings.EqualFold(queryValues.Get("include_inactive"), "true")

	parseLimitedInt := func(key string, fallback int, max int) int {
		raw := strings.TrimSpace(queryValues.Get(key))
		if raw == "" {
			return fallback
		}
		var parsed int
		if _, err := fmt.Sscanf(raw, "%d", &parsed); err != nil || parsed < 0 {
			return fallback
		}
		if max > 0 && parsed > max {
			return max
		}
		return parsed
	}

	stats := map[string]any{}
	statQueries := map[string]string{
		"categories_total":    `SELECT count(*) FROM platform_catalog_categories`,
		"categories_active":   `SELECT count(*) FROM platform_catalog_categories WHERE active=true`,
		"groups_total":        `SELECT count(*) FROM platform_catalog_groups`,
		"details_total":       `SELECT count(*) FROM platform_catalog_details`,
		"brands_total":        `SELECT count(*) FROM platform_catalog_brands`,
		"brands_active":       `SELECT count(*) FROM platform_catalog_brands WHERE active=true`,
		"products_active":     `SELECT count(*) FROM platform_catalog_products WHERE active=true`,
		"products_inactive":   `SELECT count(*) FROM platform_catalog_products WHERE active=false`,
		"suggestions_pending": `SELECT count(*) FROM platform_catalog_suggestions WHERE status='pending'`,
	}
	for key, query := range statQueries {
		var total int64
		_ = core.QueryRow(r.Context(), query).Scan(&total)
		stats[key] = total
	}

	categories := []platformCatalogCategory{}
	rows, err := core.Query(r.Context(), `
		SELECT c.id::text, c.name, c.icon, c.description, c.sort_order, c.active,
		       (SELECT count(*) FROM platform_catalog_groups g WHERE g.category_id=c.id),
		       (SELECT count(*) FROM platform_catalog_details d WHERE d.category_id=c.id),
		       (SELECT count(*) FROM platform_catalog_products p WHERE p.category_id=c.id AND p.active=true),
		       c.created_at, c.updated_at
		FROM platform_catalog_categories c
		ORDER BY c.sort_order, c.name
	`)
	if err != nil {
		writeError(w, err)
		return
	}
	for rows.Next() {
		var item platformCatalogCategory
		if err := rows.Scan(&item.ID, &item.Name, &item.Icon, &item.Description, &item.SortOrder, &item.Active, &item.GroupsCount, &item.DetailsCount, &item.ProductsCount, &item.CreatedAt, &item.UpdatedAt); err != nil {
			rows.Close()
			writeError(w, err)
			return
		}
		categories = append(categories, item)
	}
	rows.Close()

	groups := []platformCatalogGroup{}
	rows, err = core.Query(r.Context(), `
		SELECT g.id::text, g.category_id::text, c.name, g.name, g.description, g.sort_order, g.active,
		       (SELECT count(*) FROM platform_catalog_products p WHERE p.group_id=g.id AND p.active=true), g.created_at, g.updated_at
		FROM platform_catalog_groups g JOIN platform_catalog_categories c ON c.id=g.category_id
		ORDER BY c.sort_order, c.name, g.sort_order, g.name
	`)
	if err != nil {
		writeError(w, err)
		return
	}
	for rows.Next() {
		var item platformCatalogGroup
		if err := rows.Scan(&item.ID, &item.CategoryID, &item.CategoryName, &item.Name, &item.Description, &item.SortOrder, &item.Active, &item.ProductsCount, &item.CreatedAt, &item.UpdatedAt); err != nil {
			rows.Close()
			writeError(w, err)
			return
		}
		groups = append(groups, item)
	}
	rows.Close()

	details := []platformCatalogDetail{}
	rows, err = core.Query(r.Context(), `
		SELECT d.id::text, d.category_id::text, c.name, COALESCE(d.group_id::text,''), COALESCE(g.name,''), d.name, d.description, d.sort_order, d.active,
		       (SELECT count(*) FROM platform_catalog_products p WHERE p.detail_id=d.id AND p.active=true), d.created_at, d.updated_at
		FROM platform_catalog_details d JOIN platform_catalog_categories c ON c.id=d.category_id LEFT JOIN platform_catalog_groups g ON g.id=d.group_id
		ORDER BY c.sort_order, c.name, g.sort_order, g.name, d.sort_order, d.name
	`)
	if err != nil {
		writeError(w, err)
		return
	}
	for rows.Next() {
		var item platformCatalogDetail
		if err := rows.Scan(&item.ID, &item.CategoryID, &item.CategoryName, &item.GroupID, &item.GroupName, &item.Name, &item.Description, &item.SortOrder, &item.Active, &item.ProductsCount, &item.CreatedAt, &item.UpdatedAt); err != nil {
			rows.Close()
			writeError(w, err)
			return
		}
		details = append(details, item)
	}
	rows.Close()

	brands := []platformCatalogBrand{}
	rows, err = core.Query(r.Context(), `
		SELECT b.id::text, b.name, b.logo, b.origin_country, b.description, b.sort_order, b.active,
		       (SELECT count(*) FROM platform_catalog_products p WHERE p.brand_id=b.id AND p.active=true), b.created_at, b.updated_at
		FROM platform_catalog_brands b ORDER BY b.sort_order, b.name
	`)
	if err != nil {
		writeError(w, err)
		return
	}
	for rows.Next() {
		var item platformCatalogBrand
		if err := rows.Scan(&item.ID, &item.Name, &item.Logo, &item.OriginCountry, &item.Description, &item.SortOrder, &item.Active, &item.ProductsCount, &item.CreatedAt, &item.UpdatedAt); err != nil {
			rows.Close()
			writeError(w, err)
			return
		}
		brands = append(brands, item)
	}
	rows.Close()

	products := []platformCatalogProduct{}
	if !summaryOnly {
		where := []string{}
		args := []any{}
		addArg := func(value any) string {
			args = append(args, value)
			return fmt.Sprintf("$%d", len(args))
		}
		if (productBrowser && !includeInactive) || strings.EqualFold(queryValues.Get("active"), "true") {
			where = append(where, "p.active=true")
		} else if strings.EqualFold(queryValues.Get("active"), "false") {
			where = append(where, "p.active=false")
		}
		if id := strings.TrimSpace(queryValues.Get("id")); id != "" {
			placeholder := addArg(id)
			where = append(where, fmt.Sprintf("(p.id::text=%s OR p.source_key=%s)", placeholder, placeholder))
		}
		if categoryID := strings.TrimSpace(queryValues.Get("category_id")); categoryID != "" {
			where = append(where, "COALESCE(p.category_id::text,'') = "+addArg(categoryID))
		} else if category := strings.TrimSpace(queryValues.Get("category")); category != "" {
			where = append(where, "LOWER(COALESCE(c.name,'')) = LOWER("+addArg(category)+")")
		}
		if groupID := strings.TrimSpace(queryValues.Get("group_id")); groupID != "" {
			where = append(where, "COALESCE(p.group_id::text,'') = "+addArg(groupID))
		} else if group := strings.TrimSpace(queryValues.Get("group")); group != "" {
			where = append(where, "LOWER(COALESCE(g.name,'')) = LOWER("+addArg(group)+")")
		}
		if detailID := strings.TrimSpace(queryValues.Get("detail_id")); detailID != "" {
			where = append(where, "COALESCE(p.detail_id::text,'') = "+addArg(detailID))
		} else if detail := strings.TrimSpace(queryValues.Get("detail")); detail != "" {
			where = append(where, "LOWER(COALESCE(d.name,'')) = LOWER("+addArg(detail)+")")
		}
		if brandID := strings.TrimSpace(queryValues.Get("brand_id")); brandID != "" {
			where = append(where, "COALESCE(p.brand_id::text,'') = "+addArg(brandID))
		} else if brand := strings.TrimSpace(queryValues.Get("brand")); brand != "" {
			where = append(where, "LOWER(COALESCE(b.name,'')) = LOWER("+addArg(brand)+")")
		}
		if search := normalizeProductSearchText(queryValues.Get("q")); search != "" {
			identityExpression := `regexp_replace(translate(lower(concat_ws(' ', p.name, b.name)), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', ' ', 'g')`
			barcodeExpression := `regexp_replace(lower(COALESCE(p.barcode,'')), '[^a-z0-9]+', '', 'g')`
			sourceKeyExpression := `regexp_replace(lower(COALESCE(p.source_key,'')), '[^a-z0-9]+', '', 'g')`
			tokenClauses := make([]string, 0, len(strings.Fields(search)))
			for _, token := range strings.Fields(search) {
				pattern := "% " + token + "%"
				if _, err := strconv.Atoi(token); err == nil {
					pattern = "% " + token + " %"
				}
				tokenClauses = append(tokenClauses, fmt.Sprintf("(' ' || %s || ' ') LIKE %s", identityExpression, addArg(pattern)))
			}
			compactSearch := strings.ReplaceAll(search, " ", "")
			codeClause := "FALSE"
			if len(compactSearch) >= 4 {
				codePattern := addArg(compactSearch + "%")
				codeClause = fmt.Sprintf("(%s LIKE %s OR %s LIKE %s)", barcodeExpression, codePattern, sourceKeyExpression, codePattern)
			}
			where = append(where, fmt.Sprintf("(%s OR (%s))", codeClause, strings.Join(tokenClauses, " AND ")))
		}
		whereSQL := ""
		if len(where) > 0 {
			whereSQL = "WHERE " + strings.Join(where, " AND ")
		}

		defaultLimit := 100
		if productBrowser || len(where) > 0 {
			defaultLimit = 80
		}
		limit := parseLimitedInt("limit", defaultLimit, 250)
		offset := parseLimitedInt("offset", 0, 100000)
		limitSQL := ""
		if limit > 0 {
			limitSQL = fmt.Sprintf(" LIMIT %d OFFSET %d", limit, offset)
		}

		var filteredTotal int64
		if err := core.QueryRow(r.Context(), `
			SELECT count(*)
			FROM platform_catalog_products p
			LEFT JOIN platform_catalog_categories c ON c.id=p.category_id
			LEFT JOIN platform_catalog_groups g ON g.id=p.group_id
			LEFT JOIN platform_catalog_details d ON d.id=p.detail_id
			LEFT JOIN platform_catalog_brands b ON b.id=p.brand_id
			`+whereSQL, args...).Scan(&filteredTotal); err != nil {
			writeError(w, err)
			return
		}
		stats["products_filtered_total"] = filteredTotal

		rows, err = core.Query(r.Context(), `
			SELECT p.id::text, p.source_key, p.name, p.description, p.barcode, p.image, p.image_source_url,
			       COALESCE(c.id::text,''), COALESCE(c.name,''), COALESCE(c.icon,''), COALESCE(g.id::text,''), COALESCE(g.name,''), COALESCE(d.id::text,''), COALESCE(d.name,''), COALESCE(b.id::text,''), COALESCE(b.name,''),
			       p.format, p.sort_order, p.active, p.metadata, p.created_at, p.updated_at
			FROM platform_catalog_products p
			LEFT JOIN platform_catalog_categories c ON c.id=p.category_id
			LEFT JOIN platform_catalog_groups g ON g.id=p.group_id
			LEFT JOIN platform_catalog_details d ON d.id=p.detail_id
			LEFT JOIN platform_catalog_brands b ON b.id=p.brand_id
			`+whereSQL+`
			ORDER BY c.sort_order NULLS LAST, c.name NULLS LAST, g.sort_order NULLS LAST, g.name NULLS LAST, p.sort_order, p.name
			`+limitSQL, args...)
		if err != nil {
			writeError(w, err)
			return
		}
		for rows.Next() {
			var item platformCatalogProduct
			var metadataRaw []byte
			if err := rows.Scan(&item.ID, &item.SourceKey, &item.Name, &item.Description, &item.Barcode, &item.Image, &item.ImageSourceURL, &item.CategoryID, &item.CategoryName, &item.CategoryIcon, &item.GroupID, &item.GroupName, &item.DetailID, &item.DetailName, &item.BrandID, &item.BrandName, &item.Format, &item.SortOrder, &item.Active, &metadataRaw, &item.CreatedAt, &item.UpdatedAt); err != nil {
				rows.Close()
				writeError(w, err)
				return
			}
			item.Metadata = map[string]any{}
			_ = json.Unmarshal(metadataRaw, &item.Metadata)
			normalizePlatformCatalogProductImage(&item)
			products = append(products, item)
		}
		rows.Close()
		stats["products_returned"] = len(products)
		stats["products_limit"] = limit
		stats["products_offset"] = offset
	}

	suggestions := []platformCatalogSuggestion{}
	if !productBrowser {
		rows, err = core.Query(r.Context(), `SELECT id::text, barcode, requests_count, owner_name, owner_whatsapp, tenant_name, status, last_requested_at, created_at, updated_at FROM platform_catalog_suggestions ORDER BY status, last_requested_at DESC LIMIT 250`)
		if err != nil {
			writeError(w, err)
			return
		}
		for rows.Next() {
			var item platformCatalogSuggestion
			if err := rows.Scan(&item.ID, &item.Barcode, &item.RequestsCount, &item.OwnerName, &item.OwnerWhatsapp, &item.TenantName, &item.Status, &item.LastRequestedAt, &item.CreatedAt, &item.UpdatedAt); err != nil {
				rows.Close()
				writeError(w, err)
				return
			}
			suggestions = append(suggestions, item)
		}
		rows.Close()
	}

	writeJSON(w, http.StatusOK, platformCatalogPayload{Stats: stats, Categories: categories, Groups: groups, Details: details, Brands: brands, Products: products, Suggestions: suggestions})
}

func (s *Server) catalogDefaultPath() (string, error) {
	fileNames := []string{"catalog.json", "catalogo.json"}
	candidates := make([]string, 0, 16)
	if configuredFile := strings.TrimSpace(s.cfg.CatalogDataFile); configuredFile != "" {
		candidates = append(candidates, configuredFile)
	}
	if dataDir := strings.TrimSpace(s.cfg.TerritoryDataDir); dataDir != "" {
		for _, fileName := range fileNames {
			candidates = append(candidates, filepath.Join(dataDir, fileName))
		}
	}
	if executable, err := os.Executable(); err == nil {
		executableDataDir := filepath.Join(filepath.Dir(executable), "data")
		for _, fileName := range fileNames {
			candidates = append(candidates, filepath.Join(executableDataDir, fileName))
		}
	}
	for _, dataDir := range []string{"data", filepath.Join("backend", "data"), "/app/data"} {
		for _, fileName := range fileNames {
			candidates = append(candidates, filepath.Join(dataDir, fileName))
		}
	}

	seen := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		cleaned := filepath.Clean(strings.TrimSpace(candidate))
		if cleaned == "." || cleaned == "" {
			continue
		}
		if _, exists := seen[cleaned]; exists {
			continue
		}
		seen[cleaned] = struct{}{}
		info, err := os.Stat(cleaned)
		if err == nil && !info.IsDir() {
			return cleaned, nil
		}
	}

	return "", os.ErrNotExist
}

func (s *Server) importPlatformCatalogDefault(w http.ResponseWriter, r *http.Request) {
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	input := catalogImportRequest{}
	if r.Body != nil && r.ContentLength != 0 {
		if err := readJSON(r, &input); err != nil && !errors.Is(err, io.EOF) {
			writeError(w, badRequest(err.Error()))
			return
		}
	}
	catalogPath, err := s.catalogDefaultPath()
	if err != nil {
		writeError(w, badRequest("No se encontró el archivo data/catalog.json incluido en la instalación del backend"))
		return
	}
	payload, err := os.ReadFile(catalogPath)
	if err != nil {
		writeError(w, badRequest("No se pudo leer el archivo data/catalog.json incluido en la instalación del backend"))
		return
	}
	var catalog defaultCatalogFile
	if err := json.Unmarshal(payload, &catalog); err != nil {
		writeError(w, badRequest("El archivo catalog.json no tiene un formato válido"))
		return
	}
	total := len(catalog.Products)
	var end int
	input.Offset, end = catalogImportWindow(total, input.Offset, input.Limit)
	categoryOrder := map[string]int{}
	for idx, c := range catalog.Categories {
		categoryOrder[strings.TrimSpace(c.Category)] = idx + 1
	}
	categoryIDs := map[string]string{}
	groupIDs := map[string]string{}
	detailIDs := map[string]string{}
	brandIDs := map[string]string{}
	imported := 0
	for idx := input.Offset; idx < end; idx++ {
		p := catalog.Products[idx]
		categoryName := strings.TrimSpace(p.SourceCategory)
		if categoryName == "" {
			categoryName = "Sin categoría"
		}
		catID, found := categoryIDs[categoryName]
		if !found {
			catID, err = s.ensureCatalogCategory(r.Context(), categoryName, catalogCategoryIcon(categoryName), "", categoryOrder[categoryName])
			if err != nil {
				writeError(w, err)
				return
			}
			categoryIDs[categoryName] = catID
		}
		groupName := strings.TrimSpace(p.SourceSubCategory)
		groupKey := catID + "\x00" + groupName
		groupID, found := groupIDs[groupKey]
		if !found {
			groupID, err = s.ensureCatalogGroup(r.Context(), catID, groupName, "", 0)
			if err != nil {
				writeError(w, err)
				return
			}
			groupIDs[groupKey] = groupID
		}
		detailName := strings.TrimSpace(p.SourceSubCategory2)
		detailKey := catID + "\x00" + groupID + "\x00" + detailName
		detailID, found := detailIDs[detailKey]
		if !found {
			detailID, err = s.ensureCatalogDetail(r.Context(), catID, groupID, detailName, "", 0)
			if err != nil {
				writeError(w, err)
				return
			}
			detailIDs[detailKey] = detailID
		}
		brandName := strings.TrimSpace(p.Brand)
		if brandName == "" {
			brandName = "Sin marca"
		}
		brandID, found := brandIDs[brandName]
		if !found {
			brandID, err = s.ensureCatalogBrand(r.Context(), brandName, "", "", "", 0)
			if err != nil {
				writeError(w, err)
				return
			}
			brandIDs[brandName] = brandID
		}
		metadata := map[string]any{"sourceSiteName": p.SourceSiteName, "generatedAt": catalog.GeneratedAt}
		_, err = s.upsertCatalogProduct(r.Context(), map[string]any{
			"source_key": catalogSourceKey(categoryName, p.SourceSubCategory, p.SourceSubCategory2, p.Barcode, p.Name, p.Image),
			"name":       p.Name, "description": p.Description, "barcode": p.Barcode, "image": normalizeCatalogImageURL(p.Image), "image_source_url": preferredCatalogImageURL(p.Image, p.ImageSourceURL),
			"category_id": catID, "group_id": groupID, "detail_id": detailID, "brand_id": brandID, "format": inferCatalogFormat(p.Name), "sort_order": idx, "active": true, "metadata": metadata,
		})
		if err != nil {
			writeError(w, err)
			return
		}
		imported++
	}
	processed := end
	done := processed >= total
	percent := 100
	if total > 0 {
		percent = int(float64(processed) / float64(total) * 100)
		if percent > 100 {
			percent = 100
		}
	}
	if done {
		s.auditPlatform(r.Context(), s.platformActor(r), "", "catalog.import", map[string]any{"products": total, "source": filepath.Base(catalogPath)})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":           true,
		"imported":     imported,
		"processed":    processed,
		"offset":       input.Offset,
		"next_offset":  processed,
		"total":        total,
		"done":         done,
		"percent":      percent,
		"categories":   len(catalog.Categories),
		"generated_at": catalog.GeneratedAt,
	})
}

func (s *Server) clearPlatformCatalog(w http.ResponseWriter, r *http.Request) {
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}

	_, err := s.platformCatalogDB().Exec(r.Context(), `TRUNCATE platform_catalog_products, platform_catalog_details, platform_catalog_groups, platform_catalog_brands, platform_catalog_categories RESTART IDENTITY CASCADE`)
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), s.platformActor(r), "", "catalog.clear", map[string]any{"preserved_assets": true, "storage": "cloudflare-r2"})
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":               true,
		"cleared_catalog":  true,
		"preserved_assets": true,
		"storage":          "cloudflare-r2",
		"message":          "Se vació el catálogo global de la aplicación sin eliminar imágenes del bucket R2.",
	})
}

func (s *Server) clearPlatformCatalogSuggestions(w http.ResponseWriter, r *http.Request) {
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	_, err := s.platformCatalogDB().Exec(r.Context(), `DELETE FROM platform_catalog_suggestions`)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) createPlatformCatalogCategory(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	id, err := s.ensureCatalogCategory(r.Context(), str(input, "name"), str(input, "icon"), str(input, "description"), intValue(input, "sort_order"))
	if err != nil {
		writeError(w, err)
		return
	}
	_, _ = s.platformCatalogDB().Exec(r.Context(), `UPDATE platform_catalog_categories SET active=$2 WHERE id=$1::uuid`, id, boolDefault(input, "active", true))
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (s *Server) updatePlatformCatalogCategory(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	_, err := s.platformCatalogDB().Exec(r.Context(), `UPDATE platform_catalog_categories SET name=$2, icon=$3, description=$4, sort_order=$5, active=$6, updated_at=now() WHERE id=$1::uuid`, chi.URLParam(r, "id"), strings.TrimSpace(str(input, "name")), strDefault(input, "icon", "📦"), str(input, "description"), intValue(input, "sort_order"), boolDefault(input, "active", true))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) deletePlatformCatalogCategory(w http.ResponseWriter, r *http.Request) {
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	_, err := s.platformCatalogDB().Exec(r.Context(), `DELETE FROM platform_catalog_categories WHERE id=$1::uuid`, chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) createPlatformCatalogGroup(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	id, err := s.ensureCatalogGroup(r.Context(), strEither(input, "category_id", "categoryId"), str(input, "name"), str(input, "description"), intValue(input, "sort_order"))
	if err != nil {
		writeError(w, err)
		return
	}
	_, _ = s.platformCatalogDB().Exec(r.Context(), `UPDATE platform_catalog_groups SET active=$2 WHERE id=$1::uuid`, id, boolDefault(input, "active", true))
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}
func (s *Server) updatePlatformCatalogGroup(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	_, err := s.platformCatalogDB().Exec(r.Context(), `UPDATE platform_catalog_groups SET category_id=$2::uuid, name=$3, description=$4, sort_order=$5, active=$6, updated_at=now() WHERE id=$1::uuid`, chi.URLParam(r, "id"), strEither(input, "category_id", "categoryId"), strings.TrimSpace(str(input, "name")), str(input, "description"), intValue(input, "sort_order"), boolDefault(input, "active", true))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
func (s *Server) deletePlatformCatalogGroup(w http.ResponseWriter, r *http.Request) {
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	_, err := s.platformCatalogDB().Exec(r.Context(), `DELETE FROM platform_catalog_groups WHERE id=$1::uuid`, chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) createPlatformCatalogDetail(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	id, err := s.ensureCatalogDetail(r.Context(), strEither(input, "category_id", "categoryId"), strEither(input, "group_id", "groupId"), str(input, "name"), str(input, "description"), intValue(input, "sort_order"))
	if err != nil {
		writeError(w, err)
		return
	}
	_, _ = s.platformCatalogDB().Exec(r.Context(), `UPDATE platform_catalog_details SET active=$2 WHERE id=$1::uuid`, id, boolDefault(input, "active", true))
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}
func (s *Server) updatePlatformCatalogDetail(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	_, err := s.platformCatalogDB().Exec(r.Context(), `UPDATE platform_catalog_details SET category_id=$2::uuid, group_id=NULLIF($3,'')::uuid, name=$4, description=$5, sort_order=$6, active=$7, updated_at=now() WHERE id=$1::uuid`, chi.URLParam(r, "id"), strEither(input, "category_id", "categoryId"), strEither(input, "group_id", "groupId"), strings.TrimSpace(str(input, "name")), str(input, "description"), intValue(input, "sort_order"), boolDefault(input, "active", true))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
func (s *Server) deletePlatformCatalogDetail(w http.ResponseWriter, r *http.Request) {
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	_, err := s.platformCatalogDB().Exec(r.Context(), `DELETE FROM platform_catalog_details WHERE id=$1::uuid`, chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) createPlatformCatalogBrand(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	id, err := s.ensureCatalogBrand(r.Context(), str(input, "name"), str(input, "logo"), strEither(input, "origin_country", "originCountry"), str(input, "description"), intValue(input, "sort_order"))
	if err != nil {
		writeError(w, err)
		return
	}
	_, _ = s.platformCatalogDB().Exec(r.Context(), `UPDATE platform_catalog_brands SET active=$2 WHERE id=$1::uuid`, id, boolDefault(input, "active", true))
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}
func (s *Server) updatePlatformCatalogBrand(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	brandID := chi.URLParam(r, "id")
	active := boolDefault(input, "active", true)
	core := s.platformCatalogDB()
	tx, err := core.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())

	cmd, err := tx.Exec(r.Context(), `UPDATE platform_catalog_brands SET name=$2, logo=$3, origin_country=$4, description=$5, sort_order=$6, active=$7, updated_at=now() WHERE id=$1::uuid`, brandID, strings.TrimSpace(str(input, "name")), str(input, "logo"), strEither(input, "origin_country", "originCountry"), str(input, "description"), intValue(input, "sort_order"), active)
	if err != nil {
		writeError(w, err)
		return
	}
	if cmd.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Marca no encontrada"})
		return
	}
	productCmd, err := tx.Exec(r.Context(), `UPDATE platform_catalog_products SET active=$2, updated_at=now() WHERE brand_id=$1::uuid AND active IS DISTINCT FROM $2`, brandID, active)
	if err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "products_updated": productCmd.RowsAffected(), "active": active})
}
func (s *Server) deletePlatformCatalogBrand(w http.ResponseWriter, r *http.Request) {
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	_, err := s.platformCatalogDB().Exec(r.Context(), `DELETE FROM platform_catalog_brands WHERE id=$1::uuid`, chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) createPlatformCatalogProduct(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	barcode := normalizeBarcode(str(input, "barcode"))
	input["barcode"] = barcode
	if barcode != "" {
		if existing, lookupErr := s.lookupPlatformCatalogProductByBarcode(r.Context(), barcode); lookupErr == nil {
			writeJSON(w, http.StatusConflict, map[string]any{"error": "Ya existe un producto global con este código de barras", "product": existing})
			return
		} else if !errors.Is(lookupErr, pgx.ErrNoRows) {
			writeError(w, lookupErr)
			return
		}
	}
	item, err := s.upsertCatalogProduct(r.Context(), input)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}
func (s *Server) updatePlatformCatalogProduct(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	id := chi.URLParam(r, "id")
	barcode := normalizeBarcode(str(input, "barcode"))
	input["barcode"] = barcode
	if barcode != "" {
		if existing, lookupErr := s.lookupPlatformCatalogProductByBarcode(r.Context(), barcode); lookupErr == nil && existing.ID != id {
			writeJSON(w, http.StatusConflict, map[string]any{"error": "Ya existe otro producto global con este código de barras", "product": existing})
			return
		} else if lookupErr != nil && !errors.Is(lookupErr, pgx.ErrNoRows) {
			writeError(w, lookupErr)
			return
		}
	}
	var existingSource string
	_ = s.platformCatalogDB().QueryRow(r.Context(), `SELECT source_key FROM platform_catalog_products WHERE id=$1::uuid`, id).Scan(&existingSource)
	if strEither(input, "source_key", "sourceKey") == "" {
		input["source_key"] = existingSource
	}
	item, err := s.upsertCatalogProduct(r.Context(), input)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) replacePlatformCatalogProductImage(w http.ResponseWriter, r *http.Request) {
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}

	id := chi.URLParam(r, "id")
	var currentImage, currentImageURL string
	if err := s.platformCatalogDB().QueryRow(r.Context(), `SELECT image, image_source_url FROM platform_catalog_products WHERE id=$1::uuid`, id).Scan(&currentImage, &currentImageURL); err != nil {
		writeError(w, err)
		return
	}

	stableURL := strings.TrimSpace(firstNonEmpty(currentImageURL, currentImage))
	if stableURL == "" {
		writeError(w, badRequest("Este producto no tiene una imagen existente para reemplazar manteniendo la misma URL."))
		return
	}

	objectKey, err := s.r2ObjectKeyFromCatalogURL(stableURL)
	if err != nil {
		writeError(w, err)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, (15<<20)+(1<<20))
	if err := r.ParseMultipartForm(512 << 10); err != nil {
		writeError(w, badRequest("No se pudo leer la imagen. Sube un archivo de imagen menor de 15 MB."))
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	file, header, err := r.FormFile("image")
	if err != nil {
		writeError(w, badRequest("Selecciona una imagen válida para reemplazar la imagen actual."))
		return
	}
	defer file.Close()

	if header.Size <= 0 {
		writeError(w, badRequest("La imagen seleccionada está vacía."))
		return
	}
	if header.Size > 15<<20 {
		writeError(w, badRequest("No se pudo leer la imagen. Sube un archivo de imagen menor de 15 MB."))
		return
	}
	sniff := make([]byte, 512)
	read, err := io.ReadFull(file, sniff)
	if err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, io.ErrUnexpectedEOF) {
		writeError(w, badRequest("No se pudo procesar la imagen seleccionada."))
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		writeError(w, badRequest("No se pudo preparar la imagen seleccionada."))
		return
	}
	contentType := strings.TrimSpace(header.Header.Get("Content-Type"))
	if contentType == "" || contentType == "application/octet-stream" {
		contentType = http.DetectContentType(sniff[:read])
	}
	if !strings.HasPrefix(strings.ToLower(contentType), "image/") {
		writeError(w, badRequest("El archivo seleccionado debe ser una imagen."))
		return
	}

	if err := s.putR2Object(r.Context(), objectKey, file, header.Size, contentType); err != nil {
		writeError(w, err)
		return
	}

	_, err = s.platformCatalogDB().Exec(r.Context(), `UPDATE platform_catalog_products SET image=$2, image_source_url=$3, updated_at=now() WHERE id=$1::uuid`, id, currentImage, currentImageURL)
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), s.platformActor(r), "", "catalog.product.image.replace", map[string]any{"product_id": id, "object_key": objectKey, "preserved_url": stableURL})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "image": currentImage, "image_source_url": currentImageURL, "url": stableURL, "object_key": objectKey, "message": "Imagen reemplazada en R2 manteniendo el mismo nombre, directorio y URL."})
}

func (s *Server) r2ObjectKeyFromCatalogURL(rawURL string) (string, error) {
	value := strings.TrimSpace(rawURL)
	if value == "" {
		return "", badRequest("No se encontró una URL de imagen para reemplazar.")
	}

	if base := strings.TrimSpace(s.cfg.CloudflareR2PublicBaseURL); base != "" && strings.HasPrefix(strings.TrimRight(value, "/"), strings.TrimRight(base, "/")) {
		value = strings.TrimPrefix(value, strings.TrimRight(base, "/"))
	}

	var objectPath string
	if u, err := url.Parse(value); err == nil && u.Scheme != "" && u.Host != "" {
		objectPath = strings.TrimPrefix(u.EscapedPath(), "/")
		if decoded, err := url.PathUnescape(objectPath); err == nil {
			objectPath = decoded
		}
		if strings.Contains(u.Host, "r2.cloudflarestorage.com") && s.cfg.CloudflareR2Bucket != "" {
			prefix := strings.Trim(s.cfg.CloudflareR2Bucket, "/") + "/"
			objectPath = strings.TrimPrefix(objectPath, prefix)
		}
	} else {
		objectPath = strings.TrimPrefix(value, "/")
	}

	objectPath = path.Clean("/" + objectPath)
	objectPath = strings.TrimPrefix(objectPath, "/")
	if objectPath == "" || objectPath == "." || strings.HasPrefix(objectPath, "../") {
		return "", badRequest("La URL actual de la imagen no permite calcular una ruta válida dentro del bucket R2.")
	}
	return objectPath, nil
}

func (s *Server) putR2Object(ctx context.Context, objectKey string, body io.ReadSeeker, size int64, contentType string) error {
	bucket := strings.TrimSpace(s.cfg.CloudflareR2Bucket)
	accessKey := strings.TrimSpace(s.cfg.CloudflareR2AccessKeyID)
	secretKey := strings.TrimSpace(s.cfg.CloudflareR2SecretAccessKey)
	endpoint := strings.TrimRight(strings.TrimSpace(s.cfg.CloudflareR2Endpoint), "/")
	if endpoint == "" && strings.TrimSpace(s.cfg.CloudflareR2AccountID) != "" {
		endpoint = fmt.Sprintf("https://%s.r2.cloudflarestorage.com", strings.TrimSpace(s.cfg.CloudflareR2AccountID))
	}
	if bucket == "" || accessKey == "" || secretKey == "" || endpoint == "" {
		return badRequest("Cloudflare R2 no está configurado. Define CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_BUCKET, CLOUDFLARE_R2_ACCESS_KEY_ID y CLOUDFLARE_R2_SECRET_ACCESS_KEY.")
	}

	endpointURL, err := url.Parse(endpoint)
	if err != nil || endpointURL.Scheme == "" || endpointURL.Host == "" {
		return badRequest("CLOUDFLARE_R2_ENDPOINT no tiene un formato válido.")
	}

	encodedKey := awsEncodePath(objectKey)
	canonicalURI := "/" + strings.Trim(bucket, "/") + "/" + encodedKey
	target := strings.TrimRight(endpointURL.String(), "/") + canonicalURI
	payloadDigest := sha256.New()
	if _, err := io.Copy(payloadDigest, body); err != nil {
		return fmt.Errorf("no se pudo calcular la firma de la imagen: %w", err)
	}
	payloadHash := hex.EncodeToString(payloadDigest.Sum(nil))
	if _, err := body.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("no se pudo preparar la imagen para Cloudflare R2: %w", err)
	}
	now := time.Now().UTC()
	amzDate := now.Format("20060102T150405Z")
	dateStamp := now.Format("20060102")
	region := "auto"
	service := "s3"
	signedHeaders := "cache-control;content-type;host;x-amz-content-sha256;x-amz-date"
	cacheControl := "public, max-age=0, must-revalidate"
	canonicalHeaders := "cache-control:" + cacheControl + "\n" +
		"content-type:" + contentType + "\n" +
		"host:" + endpointURL.Host + "\n" +
		"x-amz-content-sha256:" + payloadHash + "\n" +
		"x-amz-date:" + amzDate + "\n"
	canonicalRequest := strings.Join([]string{"PUT", canonicalURI, "", canonicalHeaders, signedHeaders, payloadHash}, "\n")
	credentialScope := strings.Join([]string{dateStamp, region, service, "aws4_request"}, "/")
	stringToSign := strings.Join([]string{"AWS4-HMAC-SHA256", amzDate, credentialScope, sha256HexBytes([]byte(canonicalRequest))}, "\n")
	signingKey := awsV4SigningKey(secretKey, dateStamp, region, service)
	signature := hex.EncodeToString(hmacSHA256(signingKey, stringToSign))
	authorization := fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s", accessKey, credentialScope, signedHeaders, signature)

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, target, body)
	if err != nil {
		return err
	}
	req.ContentLength = size
	req.Header.Set("Authorization", authorization)
	req.Header.Set("Cache-Control", cacheControl)
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	req.Header.Set("X-Amz-Date", amzDate)

	resp, err := s.r2HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("no se pudo conectar con Cloudflare R2: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 600))
		msg := strings.TrimSpace(string(body))
		if msg == "" {
			msg = resp.Status
		}
		return badRequest("Cloudflare R2 rechazó el reemplazo de imagen: " + msg)
	}
	return nil
}

func awsEncodePath(value string) string {
	parts := strings.Split(strings.Trim(value, "/"), "/")
	for i, part := range parts {
		parts[i] = strings.ReplaceAll(url.PathEscape(part), "+", "%20")
	}
	return strings.Join(parts, "/")
}

func sha256HexBytes(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func hmacSHA256(key []byte, data string) []byte {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(data))
	return mac.Sum(nil)
}

func awsV4SigningKey(secret, dateStamp, region, service string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+secret), dateStamp)
	kRegion := hmacSHA256(kDate, region)
	kService := hmacSHA256(kRegion, service)
	return hmacSHA256(kService, "aws4_request")
}
func (s *Server) deletePlatformCatalogProduct(w http.ResponseWriter, r *http.Request) {
	if err := s.ensurePlatformCatalogTables(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	_, err := s.platformCatalogDB().Exec(r.Context(), `DELETE FROM platform_catalog_products WHERE id=$1::uuid`, chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) currentTenant(w http.ResponseWriter, r *http.Request) {
	tenant, ok := tenancy.FromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{"multi_tenant": false})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"multi_tenant": true, "tenant": tenant})
}

func (s *Server) platformOverview(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"tenants_total":     0,
			"tenants_active":    0,
			"tenants_trial":     0,
			"tenants_suspended": 0,
			"databases_ready":   0,
			"plans_active":      0,
		})
		return
	}
	core := s.tenantManager.CoreDB()
	var tenantsTotal, tenantsActive, tenantsTrial, tenantsSuspended, tenantsDisabled, databasesReady, databaseErrors, plansActive, domainsTotal, customDomains, subscriptionsActive, globalCustomers, ownersTotal int64
	_ = core.QueryRow(r.Context(), `SELECT count(*) FROM tenants`).Scan(&tenantsTotal)
	_ = core.QueryRow(r.Context(), `SELECT count(*) FROM tenants WHERE status='active'`).Scan(&tenantsActive)
	_ = core.QueryRow(r.Context(), `SELECT count(*) FROM tenants WHERE status='trial'`).Scan(&tenantsTrial)
	_ = core.QueryRow(r.Context(), `SELECT count(*) FROM tenants WHERE status='suspended'`).Scan(&tenantsSuspended)
	_ = core.QueryRow(r.Context(), `SELECT count(*) FROM tenants WHERE status IN ('disabled','provisioning')`).Scan(&tenantsDisabled)
	_ = core.QueryRow(r.Context(), `SELECT count(*) FROM tenant_databases WHERE status='ready'`).Scan(&databasesReady)
	_ = core.QueryRow(r.Context(), `SELECT count(*) FROM tenant_databases WHERE status='error'`).Scan(&databaseErrors)
	_ = core.QueryRow(r.Context(), `SELECT count(*) FROM plans WHERE active=true`).Scan(&plansActive)
	_ = core.QueryRow(r.Context(), `SELECT count(*) FROM tenant_domains`).Scan(&domainsTotal)
	_ = core.QueryRow(r.Context(), `SELECT count(*) FROM tenant_domains WHERE type='custom_domain'`).Scan(&customDomains)
	_ = core.QueryRow(r.Context(), `SELECT count(*) FROM subscriptions WHERE status='active'`).Scan(&subscriptionsActive)
	_ = s.globalDB().QueryRow(r.Context(), `SELECT count(*) FROM global_customers`).Scan(&globalCustomers)
	_ = core.QueryRow(r.Context(), `SELECT count(*) FROM platform_owners`).Scan(&ownersTotal)
	writeJSON(w, http.StatusOK, map[string]any{
		"tenants_total":        tenantsTotal,
		"tenants_active":       tenantsActive,
		"tenants_trial":        tenantsTrial,
		"tenants_suspended":    tenantsSuspended,
		"tenants_disabled":     tenantsDisabled,
		"databases_ready":      databasesReady,
		"database_errors":      databaseErrors,
		"plans_active":         plansActive,
		"domains_total":        domainsTotal,
		"custom_domains":       customDomains,
		"subscriptions_active": subscriptionsActive,
		"global_customers":     globalCustomers,
		"owners_total":         ownersTotal,
	})
}

type platformPlan struct {
	ID           string    `json:"id"`
	Slug         string    `json:"slug"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	PriceMonthly float64   `json:"price_monthly"`
	Limits       any       `json:"limits"`
	Active       bool      `json:"active"`
	CreatedAt    time.Time `json:"created_at"`
}

func (s *Server) listPlans(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeJSON(w, http.StatusOK, []platformPlan{})
		return
	}
	rows, err := s.tenantManager.CoreDB().Query(r.Context(), `
		SELECT id::text, slug, name, description, price_monthly, limits, active, created_at
		FROM plans
		ORDER BY price_monthly ASC, created_at ASC
	`)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []platformPlan{}
	for rows.Next() {
		var p platformPlan
		var limitsBytes []byte
		if err := rows.Scan(&p.ID, &p.Slug, &p.Name, &p.Description, &p.PriceMonthly, &limitsBytes, &p.Active, &p.CreatedAt); err != nil {
			writeError(w, err)
			return
		}
		var limits any = map[string]any{}
		if len(limitsBytes) > 0 {
			_ = json.Unmarshal(limitsBytes, &limits)
		}
		p.Limits = limits
		items = append(items, p)
	}
	if err := rows.Err(); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) updateTenantStatus(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	var input tenancy.TenantStatusUpdate
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	tenantID := chi.URLParam(r, "id")
	tenant, err := s.tenantManager.UpdateTenantStatus(r.Context(), tenantID, input.Status)
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), s.platformActor(r), tenantID, "tenant.status", map[string]any{"status": input.Status})
	writeJSON(w, http.StatusOK, tenant)
}

func (s *Server) createTenantAdminSession(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	tenantID := chi.URLParam(r, "id")
	item, err := s.scanPlatformTenant(s.tenantManager.CoreDB().QueryRow(r.Context(), s.platformTenantSelect(`WHERE t.id=$1::uuid LIMIT 1`), tenantID))
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Negocio no encontrado"})
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	if !platformTenantStatusIsActive(item.Status) {
		writeError(w, badRequest("El negocio debe estar activo o en prueba para abrir el panel administrativo"))
		return
	}
	actor := s.platformActor(r)
	adminUser := normalizeWhatsappDigits(item.OwnerWhatsapp)
	if adminUser == "" && strings.TrimSpace(item.OwnerID) != "" {
		owner, ownerErr := s.adminOwnerByID(r.Context(), item.OwnerID)
		if ownerErr == nil {
			adminUser = normalizeWhatsappDigits(owner.Whatsapp)
		}
	}
	if adminUser == "" {
		writeError(w, badRequest("Este negocio no tiene un propietario con WhatsApp válido para abrir el panel administrativo"))
		return
	}
	token, err := s.issueAdminTokenForTenants(adminUser, []string{item.ID})
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), actor, item.ID, "tenant.admin_session", map[string]any{"name": item.Name, "slug": item.Slug, "domain": item.Domain, "admin_user": adminUser})
	s.setSessionCookie(w, adminSessionCookie, token, 12*time.Hour)
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{
		"token":          "cookie",
		"user":           adminUser,
		"platform_actor": actor,
		"tenant":         item,
		"expires_in":     int64(12 * time.Hour / time.Second),
	})
}

func (s *Server) deleteTenant(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	tenantID := chi.URLParam(r, "id")
	item, err := s.scanPlatformTenant(s.tenantManager.CoreDB().QueryRow(r.Context(), s.platformTenantSelect(`WHERE t.id=$1::uuid LIMIT 1`), tenantID))
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Negocio no encontrado"})
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	waxumConfig, _ := s.readPlatformWaxumConfig(r.Context())
	if waxumConfig.Enabled && waxumConfig.PublicURL != "" && waxumConfig.AdminToken != "" {
		client, clientErr := s.newPlatformWaxumClient(waxumConfig)
		if clientErr != nil {
			writeError(w, clientErr)
			return
		}
		sessionID := businessWhatsAppSessionID(tenancy.Tenant{ID: item.ID, Name: item.Name, Slug: item.Slug, Domain: item.Domain})
		if deleteErr := deleteWaxumSessionCompletely(r.Context(), client, sessionID); deleteErr != nil {
			writeError(w, waxumFriendlyError("No se pudo eliminar la sesión de WhatsApp del negocio antes de borrarlo", deleteErr))
			return
		}
	}
	s.auditPlatform(r.Context(), s.platformActor(r), item.ID, "tenant.delete", map[string]any{"name": item.Name, "slug": item.Slug, "domain": item.Domain, "database_name": item.DatabaseName, "owner_id": item.OwnerID})
	deleted, err := s.tenantManager.DeleteTenant(r.Context(), item.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "tenant": deleted})
}

type platformPlanInput struct {
	Slug         string         `json:"slug"`
	Name         string         `json:"name"`
	Description  string         `json:"description"`
	PriceMonthly float64        `json:"price_monthly"`
	Limits       map[string]any `json:"limits"`
	Active       *bool          `json:"active"`
}

type platformPlanUpdateInput struct {
	Name         *string        `json:"name"`
	Description  *string        `json:"description"`
	PriceMonthly *float64       `json:"price_monthly"`
	Limits       map[string]any `json:"limits"`
	Active       *bool          `json:"active"`
}

func scanPlatformPlan(row pgx.Row) (platformPlan, error) {
	var p platformPlan
	var limitsBytes []byte
	err := row.Scan(&p.ID, &p.Slug, &p.Name, &p.Description, &p.PriceMonthly, &limitsBytes, &p.Active, &p.CreatedAt)
	var limits any = map[string]any{}
	if len(limitsBytes) > 0 {
		_ = json.Unmarshal(limitsBytes, &limits)
	}
	p.Limits = limits
	return p, err
}

func (s *Server) createPlan(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	var input platformPlanInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	slug := tenancy.NormalizeSlug(input.Slug)
	if slug == "" {
		writeError(w, badRequest("El slug del plan es obligatorio"))
		return
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		writeError(w, badRequest("El nombre del plan es obligatorio"))
		return
	}
	active := true
	if input.Active != nil {
		active = *input.Active
	}
	limits, err := marshalJSONDatabaseValue(input.Limits)
	if err != nil {
		writeError(w, err)
		return
	}
	if limits == "null" {
		limits = `{}`
	}
	plan, err := scanPlatformPlan(s.tenantManager.CoreDB().QueryRow(r.Context(), `
		INSERT INTO plans (slug, name, description, price_monthly, limits, active)
		VALUES ($1,$2,$3,$4,$5::jsonb,$6)
		RETURNING id::text, slug, name, description, price_monthly, limits, active, created_at
	`, slug, name, strings.TrimSpace(input.Description), input.PriceMonthly, limits, active))
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), s.platformActor(r), "", "plan.create", plan)
	writeJSON(w, http.StatusCreated, plan)
}

func (s *Server) updatePlan(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	var input platformPlanUpdateInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}

	slug := tenancy.NormalizeSlug(chi.URLParam(r, "slug"))
	if slug == "" {
		writeError(w, badRequest("El identificador del plan es obligatorio"))
		return
	}

	updates := []string{"updated_at=now()"}
	args := []any{slug}
	addValue := func(column string, value any) {
		args = append(args, value)
		updates = append(updates, fmt.Sprintf("%s=$%d", column, len(args)))
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			writeError(w, badRequest("El nombre del plan es obligatorio"))
			return
		}
		addValue("name", name)
	}
	if input.Description != nil {
		addValue("description", strings.TrimSpace(*input.Description))
	}
	if input.PriceMonthly != nil {
		if *input.PriceMonthly < 0 {
			writeError(w, badRequest("El precio mensual no puede ser negativo"))
			return
		}
		addValue("price_monthly", *input.PriceMonthly)
	}
	if input.Limits != nil {
		limits, err := marshalJSONDatabaseValue(input.Limits)
		if err != nil {
			writeError(w, err)
			return
		}
		args = append(args, limits)
		updates = append(updates, fmt.Sprintf("limits=$%d::jsonb", len(args)))
	}
	if input.Active != nil {
		addValue("active", *input.Active)
	}

	if len(updates) == 1 {
		writeError(w, badRequest("No se recibieron cambios para el plan"))
		return
	}

	query := fmt.Sprintf(`
		UPDATE plans SET %s
		WHERE slug=$1
		RETURNING id::text, slug, name, description, price_monthly, limits, active, created_at
	`, strings.Join(updates, ", "))
	plan, err := scanPlatformPlan(s.tenantManager.CoreDB().QueryRow(r.Context(), query, args...))
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Plan no encontrado"})
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), s.platformActor(r), "", "plan.update", plan)
	writeJSON(w, http.StatusOK, plan)
}

func (s *Server) deletePlan(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	slug := tenancy.NormalizeSlug(chi.URLParam(r, "slug"))
	var used int64
	_ = s.tenantManager.CoreDB().QueryRow(r.Context(), `SELECT count(*) FROM tenants WHERE plan_slug=$1`, slug).Scan(&used)
	if used > 0 {
		writeError(w, badRequest("No puedes eliminar un plan asignado a tenants. Desactívalo primero."))
		return
	}
	_, err := s.tenantManager.CoreDB().Exec(r.Context(), `DELETE FROM plans WHERE slug=$1`, slug)
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), s.platformActor(r), "", "plan.delete", map[string]any{"slug": slug})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type platformDatabase struct {
	ID               string    `json:"id"`
	TenantID         string    `json:"tenant_id"`
	TenantName       string    `json:"tenant_name"`
	TenantSlug       string    `json:"tenant_slug"`
	DatabaseName     string    `json:"database_name"`
	Status           string    `json:"status"`
	MigrationVersion int64     `json:"migration_version"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

func (s *Server) listPlatformDatabases(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeJSON(w, http.StatusOK, []platformDatabase{})
		return
	}
	rows, err := s.tenantManager.CoreDB().Query(r.Context(), `
		SELECT db.id::text, db.tenant_id::text, t.name, t.slug, db.database_name, db.status, db.migration_version, db.created_at, db.updated_at
		FROM tenant_databases db JOIN tenants t ON t.id=db.tenant_id
		ORDER BY db.database_name ASC
	`)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []platformDatabase{}
	for rows.Next() {
		var item platformDatabase
		if err := rows.Scan(&item.ID, &item.TenantID, &item.TenantName, &item.TenantSlug, &item.DatabaseName, &item.Status, &item.MigrationVersion, &item.CreatedAt, &item.UpdatedAt); err != nil {
			writeError(w, err)
			return
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

type platformSubscription struct {
	ID            string     `json:"id"`
	TenantID      string     `json:"tenant_id"`
	TenantName    string     `json:"tenant_name"`
	TenantSlug    string     `json:"tenant_slug"`
	PlanSlug      string     `json:"plan_slug"`
	Status        string     `json:"status"`
	BillingPeriod string     `json:"billing_period"`
	StartsAt      time.Time  `json:"starts_at"`
	NextBillingAt *time.Time `json:"next_billing_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

func (s *Server) listSubscriptions(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeJSON(w, http.StatusOK, []platformSubscription{})
		return
	}
	rows, err := s.tenantManager.CoreDB().Query(r.Context(), `
		SELECT s.id::text, s.tenant_id::text, t.name, t.slug, s.plan_slug, s.status, s.billing_period, s.starts_at, s.next_billing_at, s.created_at, s.updated_at
		FROM subscriptions s JOIN tenants t ON t.id=s.tenant_id
		ORDER BY s.created_at DESC
	`)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []platformSubscription{}
	for rows.Next() {
		var item platformSubscription
		var next sql.NullTime
		if err := rows.Scan(&item.ID, &item.TenantID, &item.TenantName, &item.TenantSlug, &item.PlanSlug, &item.Status, &item.BillingPeriod, &item.StartsAt, &next, &item.CreatedAt, &item.UpdatedAt); err != nil {
			writeError(w, err)
			return
		}
		if next.Valid {
			item.NextBillingAt = &next.Time
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

type subscriptionUpdateInput struct {
	PlanSlug      string `json:"plan_slug"`
	Status        string `json:"status"`
	BillingPeriod string `json:"billing_period"`
	NextBillingAt string `json:"next_billing_at"`
}

func (s *Server) updateTenantSubscription(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	var input subscriptionUpdateInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	tenantID := chi.URLParam(r, "id")
	plan := strings.TrimSpace(input.PlanSlug)
	if plan == "" {
		plan = "starter"
	}
	status := strings.TrimSpace(input.Status)
	if status == "" {
		status = "trial"
	}
	period := strings.TrimSpace(input.BillingPeriod)
	if period == "" {
		period = "monthly"
	}
	next := strings.TrimSpace(input.NextBillingAt)
	_, err := s.tenantManager.CoreDB().Exec(r.Context(), `
		INSERT INTO subscriptions (tenant_id, plan_slug, status, billing_period, next_billing_at)
		VALUES ($1::uuid,$2,$3,$4,NULLIF($5,'')::timestamptz)
	`, tenantID, plan, status, period, next)
	if err != nil {
		writeError(w, err)
		return
	}
	_, _ = s.tenantManager.CoreDB().Exec(r.Context(), `UPDATE tenants SET plan_slug=$2, updated_at=now() WHERE id=$1::uuid`, tenantID, plan)
	s.auditPlatform(r.Context(), s.platformActor(r), tenantID, "subscription.update", input)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type platformCustomer struct {
	ID                string    `json:"id"`
	Name              string    `json:"name"`
	NationalID        string    `json:"national_id"`
	BirthDate         string    `json:"birth_date"`
	Gender            string    `json:"gender"`
	Whatsapp          string    `json:"whatsapp"`
	WhatsappDisplay   string    `json:"whatsapp_display"`
	ProfilePictureURL string    `json:"profile_picture_url"`
	CountryCode       string    `json:"country_code"`
	Province          string    `json:"province"`
	Municipality      string    `json:"municipality"`
	Sector            string    `json:"sector"`
	Neighborhood      string    `json:"neighborhood"`
	Street            string    `json:"street"`
	StreetNumber      string    `json:"street_number"`
	AddressReference  string    `json:"address_reference"`
	Lat               string    `json:"lat"`
	Lng               string    `json:"lng"`
	TenantLinks       int64     `json:"tenant_links"`
	CreditActive      int64     `json:"credit_active"`
	CreditTotal       int64     `json:"credit_total"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

func (s *Server) listPlatformCustomers(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeJSON(w, http.StatusOK, []platformCustomer{})
		return
	}
	rows, err := s.globalDB().Query(r.Context(), `
		SELECT id::text, name, national_id, COALESCE(birth_date,''), COALESCE(gender,''), whatsapp, whatsapp_display, COALESCE(profile_picture_url,''), country_code,
		       province, municipality, sector, street, street_number, address_reference, lat, lng,
		       created_at, updated_at
		FROM global_customers
		ORDER BY created_at DESC
		LIMIT 500
	`)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []platformCustomer{}
	ids := []string{}
	for rows.Next() {
		var item platformCustomer
		if err := rows.Scan(&item.ID, &item.Name, &item.NationalID, &item.BirthDate, &item.Gender, &item.Whatsapp, &item.WhatsappDisplay, &item.ProfilePictureURL, &item.CountryCode, &item.Province, &item.Municipality, &item.Sector, &item.Street, &item.StreetNumber, &item.AddressReference, &item.Lat, &item.Lng, &item.CreatedAt, &item.UpdatedAt); err != nil {
			writeError(w, err)
			return
		}
		item.Name = normalizePersonName(item.Name)
		item.Neighborhood = item.Sector
		items = append(items, item)
		ids = append(ids, item.ID)
	}
	if err := rows.Err(); err != nil {
		writeError(w, err)
		return
	}
	linkCounts, creditActive, creditTotal := s.globalCustomerLinkAndCreditCounts(r.Context(), ids)
	for i := range items {
		items[i].TenantLinks = linkCounts[items[i].ID]
		items[i].CreditActive = creditActive[items[i].ID]
		items[i].CreditTotal = creditTotal[items[i].ID]
	}
	items = s.hydratePlatformCustomerAvatars(r.Context(), items)
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) hydratePlatformCustomerAvatars(ctx context.Context, items []platformCustomer) []platformCustomer {
	if len(items) == 0 {
		return items
	}
	global := s.globalDB()
	if global == nil {
		return items
	}
	for i := range items {
		if strings.TrimSpace(items[i].ProfilePictureURL) != "" || strings.TrimSpace(items[i].Whatsapp) == "" {
			continue
		}
		url := s.fetchPlatformWhatsAppAvatarURL(ctx, items[i].Whatsapp)
		if url == "" {
			continue
		}
		items[i].ProfilePictureURL = url
		_, _ = global.Exec(ctx, `UPDATE global_customers SET profile_picture_url=$2, updated_at=now() WHERE id=$1::uuid`, items[i].ID, url)
	}
	return items
}

func (s *Server) globalCustomerLinkAndCreditCounts(ctx context.Context, ids []string) (map[string]int64, map[string]int64, map[string]int64) {
	links := map[string]int64{}
	active := map[string]int64{}
	total := map[string]int64{}
	if s.tenantManager == nil || len(ids) == 0 {
		return links, active, total
	}
	wanted := map[string]bool{}
	for _, id := range ids {
		if strings.TrimSpace(id) != "" {
			wanted[id] = true
		}
	}
	rows, err := s.tenantManager.CoreDB().Query(ctx, `
		SELECT l.global_customer_id::text, l.local_customer_id::text,
		       t.id::text, COALESCE(t.name,''), COALESCE(t.slug,''), COALESCE(d.domain,''), COALESCE(db.database_name,'')
		FROM tenant_customer_links l
		JOIN tenants t ON t.id=l.tenant_id
		LEFT JOIN tenant_domains d ON d.tenant_id=t.id AND d.is_primary=true
		LEFT JOIN tenant_databases db ON db.tenant_id=t.id
		WHERE l.global_customer_id::text = ANY($1::text[])
	`, ids)
	if err != nil {
		return links, active, total
	}
	defer rows.Close()
	for rows.Next() {
		var globalID, localCustomerID, tenantID, tenantName, tenantSlug, domain, databaseName string
		if err := rows.Scan(&globalID, &localCustomerID, &tenantID, &tenantName, &tenantSlug, &domain, &databaseName); err != nil {
			continue
		}
		if !wanted[globalID] {
			continue
		}
		links[globalID]++
		if strings.TrimSpace(databaseName) == "" || strings.TrimSpace(localCustomerID) == "" {
			continue
		}
		pool, err := s.tenantManager.Pool(ctx, tenancy.Tenant{ID: tenantID, Name: tenantName, Slug: tenantSlug, Domain: domain, DatabaseName: databaseName})
		if err != nil {
			continue
		}
		var raw []byte
		if err := pool.QueryRow(ctx, `SELECT COALESCE(store_credit, '{}'::jsonb) FROM customers WHERE id=$1::uuid LIMIT 1`, localCustomerID).Scan(&raw); err != nil {
			continue
		}
		var credit map[string]any
		if err := json.Unmarshal(raw, &credit); err != nil {
			continue
		}
		for _, value := range credit {
			total[globalID]++
			switch typed := value.(type) {
			case bool:
				if typed {
					active[globalID]++
				}
			case map[string]any:
				if enabled, _ := typed["enabled"].(bool); enabled {
					active[globalID]++
				}
			}
		}
	}
	return links, active, total
}

type platformBank struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Logo      string `json:"logo"`
	Active    bool   `json:"active"`
	SortOrder int    `json:"sort_order"`
}

func defaultPlatformBanks() []platformBank {
	names := []string{"Banco de Reservas", "Banco Popular", "Banco BHD", "Asociación Cibao", "Scotiabank", "Promerica", "Banco Santa Cruz"}
	banks := make([]platformBank, 0, len(names))
	for index, name := range names {
		banks = append(banks, platformBank{ID: platformBankSlug(name), Name: name, Logo: "", Active: true, SortOrder: (index + 1) * 10})
	}
	return banks
}

func platformBankSlug(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	replacements := map[string]string{
		"á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u", "ñ": "n",
	}
	for old, next := range replacements {
		value = strings.ReplaceAll(value, old, next)
	}
	value = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(value, "-")
	value = strings.Trim(value, "-")
	if len(value) > 48 {
		value = strings.Trim(value[:48], "-")
	}
	return value
}

func normalizePlatformBankID(value string) string {
	clean := platformBankSlug(value)
	if clean == "" {
		return fmt.Sprintf("banco-%d", time.Now().UnixNano())
	}
	return clean
}

func normalizePlatformBankList(raw []platformBank) []platformBank {
	seen := map[string]bool{}
	out := make([]platformBank, 0, len(raw))
	for index, item := range raw {
		item.Name = strings.TrimSpace(item.Name)
		item.Logo = strings.TrimSpace(item.Logo)
		if item.Name == "" {
			continue
		}
		if item.ID == "" {
			item.ID = normalizePlatformBankID(item.Name)
		} else {
			item.ID = normalizePlatformBankID(item.ID)
		}
		baseID := item.ID
		for suffix := 2; seen[item.ID]; suffix++ {
			item.ID = fmt.Sprintf("%s-%d", baseID, suffix)
		}
		seen[item.ID] = true
		if item.SortOrder == 0 {
			item.SortOrder = (index + 1) * 10
		}
		out = append(out, item)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].SortOrder == out[j].SortOrder {
			return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
		}
		return out[i].SortOrder < out[j].SortOrder
	})
	return out
}

func (s *Server) platformBanks(ctx context.Context) ([]platformBank, error) {
	defaults := defaultPlatformBanks()
	if s.tenantManager == nil || s.tenantManager.CoreDB() == nil {
		return defaults, nil
	}
	var raw []byte
	err := s.tenantManager.CoreDB().QueryRow(ctx, `SELECT value FROM platform_settings WHERE key='banks'`).Scan(&raw)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, sql.ErrNoRows) {
			return defaults, nil
		}
		return nil, err
	}
	var banks []platformBank
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &banks)
	}
	if len(banks) == 0 {
		return defaults, nil
	}
	return normalizePlatformBankList(banks), nil
}

func (s *Server) savePlatformBanks(ctx context.Context, banks []platformBank) error {
	if s.tenantManager == nil || s.tenantManager.CoreDB() == nil {
		return badRequest("El modo SaaS multi-tenant no está activo")
	}
	banks = normalizePlatformBankList(banks)
	payload, err := marshalJSONDatabaseValue(banks)
	if err != nil {
		return err
	}
	_, err = s.tenantManager.CoreDB().Exec(ctx, `
		INSERT INTO platform_settings (key, value, updated_at) VALUES ('banks',$1::jsonb,now())
		ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()
	`, payload)
	return err
}

func (s *Server) listPlatformBanks(w http.ResponseWriter, r *http.Request) {
	banks, err := s.platformBanks(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, banks)
}

func (s *Server) listTenantBankCatalog(w http.ResponseWriter, r *http.Request) {
	banks, err := s.platformBanks(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	active := make([]platformBank, 0, len(banks))
	for _, bank := range banks {
		if bank.Active {
			active = append(active, bank)
		}
	}
	writeJSON(w, http.StatusOK, active)
}

func (s *Server) createPlatformBank(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	name := strings.TrimSpace(str(input, "name"))
	if name == "" {
		writeError(w, badRequest("El nombre del banco es obligatorio"))
		return
	}
	banks, err := s.platformBanks(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	bank := platformBank{
		ID:        normalizePlatformBankID(firstNonEmpty(str(input, "id"), name)),
		Name:      name,
		Logo:      strings.TrimSpace(str(input, "logo")),
		Active:    parseBoolValue(input["active"], true),
		SortOrder: intValue(input, "sort_order"),
	}
	if bank.SortOrder == 0 {
		bank.SortOrder = (len(banks) + 1) * 10
	}
	banks = append(banks, bank)
	if err := s.savePlatformBanks(r.Context(), banks); err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), s.platformActor(r), "", "platform.banks.create", bank)
	s.listPlatformBanks(w, r)
}

func (s *Server) updatePlatformBank(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	banks, err := s.platformBanks(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	found := false
	for index := range banks {
		if banks[index].ID != id {
			continue
		}
		found = true
		if value := strings.TrimSpace(str(input, "name")); value != "" {
			banks[index].Name = value
		}
		if _, ok := input["logo"]; ok {
			banks[index].Logo = strings.TrimSpace(str(input, "logo"))
		}
		if _, ok := input["active"]; ok {
			banks[index].Active = parseBoolValue(input["active"], banks[index].Active)
		}
		if _, ok := input["sort_order"]; ok {
			banks[index].SortOrder = intValue(input, "sort_order")
		}
		break
	}
	if !found {
		writeError(w, notFound("Banco no encontrado"))
		return
	}
	if err := s.savePlatformBanks(r.Context(), banks); err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), s.platformActor(r), "", "platform.banks.update", map[string]any{"id": id, "changes": input})
	s.listPlatformBanks(w, r)
}

func (s *Server) deletePlatformBank(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	banks, err := s.platformBanks(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	out := make([]platformBank, 0, len(banks))
	removed := false
	for _, bank := range banks {
		if bank.ID == id {
			removed = true
			continue
		}
		out = append(out, bank)
	}
	if !removed {
		writeError(w, notFound("Banco no encontrado"))
		return
	}
	if len(out) == 0 {
		writeError(w, badRequest("Debe quedar al menos un banco en el catálogo"))
		return
	}
	if err := s.savePlatformBanks(r.Context(), out); err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), s.platformActor(r), "", "platform.banks.delete", map[string]any{"id": id})
	s.listPlatformBanks(w, r)
}

func defaultLandingPageSettings(rootDomain string) map[string]any {
	rootDomain = strings.TrimSpace(rootDomain)
	if rootDomain == "" {
		rootDomain = "ltd.do"
	}
	return map[string]any{
		"brand_name":     "WAMERCIO",
		"brand_subtitle": "",
		"brand_icon":     "🛡️",
		"logo_url":       "",
		"nav_links": []map[string]any{
			{"label": "Inicio", "url": "#inicio"},
			{"label": "Solución", "url": "#solucion"},
			{"label": "Módulos", "url": "#modulos"},
			{"label": "Planes", "url": "#planes"},
			{"label": "Preguntas", "url": "#faq"},
		},
		"access_button_text":    "Acceso",
		"access_button_url":     "#/admin",
		"demo_button_text":      "Demo gratis",
		"demo_button_url":       "#contacto",
		"badge_text":            "Comercio conversacional hecho en República Dominicana 🇩🇴",
		"hero_title":            "Digitaliza tu negocio",
		"hero_highlight":        "sin complicaciones.",
		"hero_description":      "La plataforma para negocios dominicanos que venden y atienden por WhatsApp. Organiza catálogo, pedidos, clientes, inventario, cobros y entregas desde un solo lugar.",
		"primary_button_text":   "Solicitar demo gratis",
		"primary_button_url":    "#contacto",
		"secondary_button_text": "Ver video",
		"secondary_button_url":  "#solucion",
		"hero_image_url":        "https://images.unsplash.com/photo-1556742044-3c52d6e88c62?q=80&w=1200&auto=format&fit=crop",
		"hero_stat_label":       "Nuevos pedidos",
		"hero_stat_value":       "Pedido listo",
		"trust_items":           []string{"PWA Instalable", "RD$", "Control de fiado"},
		"problems_title":        "Tu negocio no necesita más desorden.",
		"problems_highlight":    "Necesita más control.",
		"problems_description":  "Administrar un negocio con métodos tradicionales es agotador. WAMERCIO elimina estos dolores de cabeza.",
		"problems": []map[string]any{
			{"icon": "message", "title": "WhatsApp desordenado", "text": "Mensajes perdidos, audios confusos y errores al tomar notas."},
			{"icon": "book", "title": "Fiado en libretas", "text": "Cálculos manuales, cuadernos perdidos y deudas difíciles de cobrar."},
			{"icon": "package", "title": "Inventario ciego", "text": "Vendes productos que ya no tienes o no sabes qué falta comprar."},
			{"icon": "map", "title": "Entregas sin zonas", "text": "Problemas para cobrar el envío correcto según el barrio."},
			{"icon": "dollar", "title": "Caja sin control", "text": "Cierres de caja al ojo sin saber realmente cuánto se vendió."},
			{"icon": "users", "title": "Sin historial", "text": "No sabes quién compra más ni cuáles son sus favoritos."},
			{"icon": "search", "title": "Precios ocultos", "text": "Clientes preguntando precios a cada rato por falta de catálogo."},
			{"icon": "userx", "title": "Dueño dependiente", "text": "Si no estás en el negocio, todo se vuelve un caos."},
		},
		"modules_title":       "Todo tu negocio en una mano.",
		"modules_description": "Módulos conectados entre sí diseñados específicamente para la realidad del comercio dominicano.",
		"modules": []map[string]any{
			{"icon": "smartphone", "title": "Tienda PWA", "text": "Enlace propio para que tus clientes pidan desde su celular sin descargar aplicaciones."},
			{"icon": "shoppingbag", "title": "Carrito de compra", "text": "Experiencia intuitiva para armar pedidos y enviarlos por WhatsApp."},
			{"icon": "monitor", "title": "Punto de Venta", "text": "Cobra en el local, controla caja y agiliza la atención al cliente."},
			{"icon": "filetext", "title": "Fiado digital", "text": "Adiós a la libreta. Controla deudas, abonos y balances por cliente."},
			{"icon": "layers", "title": "Inventario Real", "text": "Gestiona existencias, categorías y precios de forma masiva."},
			{"icon": "truck", "title": "Entrega por barrio", "text": "Zonas de entrega dinámicas con costos de envío configurables."},
			{"icon": "piechart", "title": "Reportes Diarios", "text": "Ventas, ganancias y movimientos de caja en tiempo real."},
			{"icon": "users", "title": "Base de Clientes", "text": "Conoce a tus clientes, sus gustos y frecuencia de compra."},
		},
		"rd_title":       "Diseñado para vender en RD, no adaptado a medias.",
		"rd_description": "WAMERCIO entiende cómo se vende en República Dominicana: pedidos rápidos, clientes locales, entrega cercana, pagos mixtos, fiado, transferencias, efectivo y negocios que necesitan operar desde el celular.",
		"rd_tags":        []string{"RD$", "Cédula", "Pedidos por WhatsApp", "Fiado", "Entrega por barrio", "Provincias y municipios", "Sectores y zonas de entrega", "WhatsApp", "Efectivo y transferencia", "Comercio local", "PWA"},
		"rd_card_title":  "Comienza más rápido con una base pensada para negocios dominicanos.",
		"rd_card_text":   "No tienes que empezar desde cero. WAMERCIO está preparado para ayudarte a configurar productos, categorías y zonas de entrega adaptadas al mercado dominicano.",
		"rd_card_items":  []string{"Catálogo base de productos y marcas", "Territorio dominicano completo (Provincias, Municipios)", "Sectores, barrios y zonas de entrega predefinidas"},
		"audience_title": "Comercio conversacional para distintos tipos de negocio.",
		"business_types": []string{"Tiendas", "Supermercados", "Ferreterías", "Farmacias", "Restaurantes", "Boutiques", "Salones y barberías", "Tecnología y celulares", "Repuestos y talleres", "Distribuidoras", "Servicios profesionales", "Otros negocios"},
		"roles_title":    "Cada persona trabaja desde su propio panel.",
		"roles": []map[string]any{
			{"icon": "usercheck", "title": "Dueño o administrador", "text": "Controla productos, inventario, usuarios, clientes, reportes, zonas de entrega, métodos de pago y configuración del negocio."},
			{"icon": "monitor", "title": "Cajero", "text": "Registra ventas, consulta sus movimientos y gestiona caja desde un panel simple."},
			{"icon": "navigation", "title": "Repartidor", "text": "Recibe pedidos asignados, revisa rutas y actualiza el estado de las entregas."},
			{"icon": "smartphone", "title": "Cliente", "text": "Consulta productos, arma su pedido, revisa sus compras y puede ver su fiado."},
			{"icon": "settings", "title": "Administración SaaS", "text": "Administra negocios, planes, dominios, catálogo global, territorio, bancos y configuración general de la plataforma."},
		},
		"steps_title": "Empieza a digitalizar tu negocio en pocos pasos.",
		"steps": []map[string]any{
			{"title": "Crea tu negocio", "text": "Registra el nombre, logo, horarios, zona y datos principales."},
			{"title": "Activa tu catálogo", "text": "Agrega productos manualmente o parte de un catálogo base para avanzar más rápido."},
			{"title": "Comparte tu enlace", "text": "Envía tu tienda a tus clientes para que entren desde el celular."},
			{"title": "Recibe pedidos", "text": "Los clientes agregan productos y envían pedidos organizados."},
			{"title": "Despacha y entrega", "text": "Administra estados, caja, entregas y repartidores."},
			{"title": "Controla y crece", "text": "Consulta reportes, clientes, ventas, fiados e inventario."},
		},
		"benefits_title":    "Más ventas, más orden y más control.",
		"benefits":          []string{"Reduce pedidos perdidos.", "Evita confusiones por WhatsApp.", "Controla el inventario de forma real.", "Organiza el fiado sin libretas.", "Mejora la atención al cliente.", "Acelera ventas en caja.", "Coordina entregas por sector o barrio.", "Controla cajeros y repartidores.", "Consulta reportes del día.", "Administra el negocio desde celular, tablet o PC."},
		"plans_title":       "Planes a tu medida",
		"plans_description": "Escoge el plan que mejor se adapte al tamaño y operación de tu negocio.",
		"pricing_plans": []map[string]any{
			{"name": "Inicial", "price": "Consultar", "description": "Perfecto para comenzar a vender en línea.", "features": []string{"Tienda en línea (PWA)", "Catálogo básico", "Gestión de pedidos", "Base de clientes", "Soporte básico"}, "popular": false, "button_text": "Solicitar información", "button_url": "#contacto"},
			{"name": "Pro", "price": "Recomendado", "description": "La solución completa para tu operación diaria.", "features": []string{"Todo lo del plan Inicial", "Punto de venta (POS)", "Inventario y kardex", "Control de fiado", "Aplicación para repartidores", "Reportes de caja"}, "popular": true, "button_text": "Solicitar información", "button_url": "#contacto"},
			{"name": "Empresarial", "price": "Cotizar", "description": "Para propietarios que administran varios negocios independientes.", "features": []string{"Multi-negocio", "Usuarios ilimitados", "Capacidad masiva", "Soporte 24/7 prioritario", "Configuración avanzada"}, "popular": false, "button_text": "Solicitar información", "button_url": "#contacto"},
		},
		"faq_title":       "Preguntas frecuentes",
		"faq_description": "Resolvemos tus dudas principales sobre WAMERCIO.",
		"faqs": []map[string]any{
			{"question": "¿WAMERCIO sirve para diferentes tipos de negocio?", "answer": "Sí. WAMERCIO está pensado para comercios y servicios que venden o atienden por WhatsApp: tiendas, supermercados, ferreterías, farmacias, restaurantes, boutiques, salones, tecnología, repuestos, distribuidoras y muchos otros."},
			{"question": "¿Mis clientes tienen que descargar una aplicación?", "answer": "No necesariamente. La tienda funciona como PWA, por lo que el cliente puede abrirla desde el navegador y guardarla en su celular."},
			{"question": "¿Puedo manejar entregas a domicilio?", "answer": "Sí. Puedes configurar zonas de entrega, sectores, barrios, cobertura y costos."},
			{"question": "¿Puedo manejar fiado?", "answer": "Sí. La plataforma permite controlar clientes con crédito, balances pendientes, pagos y reportes."},
			{"question": "¿Puedo tener cajeros y repartidores?", "answer": "Sí. El sistema incluye roles y paneles separados para administrador, cajero y repartidor."},
			{"question": "¿Puedo vender desde mi propio enlace?", "answer": "Sí. Cada negocio puede tener su propio enlace para compartirlo con sus clientes."},
			{"question": "¿Sirve para varios negocios?", "answer": "Sí. La plataforma está diseñada para administrar uno o varios negocios desde un entorno SaaS."},
			{"question": "¿Puedo controlar mis productos?", "answer": "Sí. Puedes gestionar productos, categorías, marcas, precios, disponibilidad e inventario."},
			{"question": "¿Acepta pagos?", "answer": "Sí. El negocio puede registrar efectivo, transferencia manual, tarjeta cobrada en una terminal externa y fiado. WAMERCIO no autoriza ni procesa pagos electrónicos dentro de la aplicación en esta versión."},
		},
		"cta_title":          "Tu negocio puede vender mejor desde hoy.",
		"cta_description":    "Organiza tu negocio, atiende más rápido y dale a tus clientes una experiencia moderna sin perder la cercanía de siempre.",
		"cta_primary_text":   "Solicitar demo",
		"cta_primary_url":    "#contacto",
		"cta_secondary_text": "Hablar por WhatsApp",
		"cta_secondary_url":  "https://wa.me/",
		"cta_tertiary_text":  "Ver planes",
		"cta_tertiary_url":   "#planes",
		"footer_description": "Plataforma SaaS para digitalizar comercios y negocios en República Dominicana.",
		"footer_email":       "hola@wamercio.com",
		"footer_status_text": "Sistemas operativos",
		"maintenance": map[string]any{
			"enabled":             false,
			"badge_text":          "Mantenimiento programado",
			"title":               "Estamos realizando mejoras en la página principal",
			"description":         "La página principal estará temporalmente en mantenimiento mientras optimizamos la experiencia de WAMERCIO. Los negocios activos continúan operando desde sus subdominios.",
			"status_label":        "Estado del servicio",
			"status_value":        "Mantenimiento activo",
			"notice_title":        "Página principal pausada temporalmente",
			"notice_text":         "El acceso administrativo y las tiendas existentes siguen disponibles. Esta pantalla solo afecta el dominio principal.",
			"support_button_text": "Entrar al panel de administración",
			"support_button_url":  "#/admin",
		},
	}
}

func mergeLandingPageSettings(raw map[string]any, rootDomain string) map[string]any {
	settings := defaultLandingPageSettings(rootDomain)
	defaults := defaultLandingPageSettings(rootDomain)
	for key, value := range raw {
		settings[key] = value
	}
	if rawMaintenance, ok := raw["maintenance"].(map[string]any); ok {
		maintenance, _ := defaults["maintenance"].(map[string]any)
		merged := map[string]any{}
		for key, value := range maintenance {
			merged[key] = value
		}
		for key, value := range rawMaintenance {
			merged[key] = value
		}
		delete(merged, "estimated_return")
		merged["support_button_url"] = "#/admin"
		settings["maintenance"] = merged
	} else if _, ok := settings["maintenance"]; !ok {
		settings["maintenance"] = defaults["maintenance"]
	}
	return settings
}

func (s *Server) publicLandingPage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store, max-age=0")
	rootDomain := strings.TrimSpace(s.cfg.RootDomain)
	if rootDomain == "" {
		rootDomain = "ltd.do"
	}
	defaults := defaultLandingPageSettings(rootDomain)
	if s.tenantManager == nil {
		writeJSON(w, http.StatusOK, map[string]any{"domain": rootDomain, "landing_page": defaults})
		return
	}
	var rawBytes []byte
	err := s.tenantManager.CoreDB().QueryRow(r.Context(), `SELECT value FROM platform_settings WHERE key='landing_page'`).Scan(&rawBytes)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, http.StatusOK, map[string]any{"domain": rootDomain, "landing_page": defaults})
			return
		}
		writeError(w, err)
		return
	}
	var raw map[string]any
	if len(rawBytes) > 0 {
		_ = json.Unmarshal(rawBytes, &raw)
	}
	writeJSON(w, http.StatusOK, map[string]any{"domain": rootDomain, "landing_page": mergeLandingPageSettings(raw, rootDomain)})
}

func (s *Server) platformSettings(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeJSON(w, http.StatusOK, map[string]any{})
		return
	}
	rows, err := s.tenantManager.CoreDB().Query(r.Context(), `SELECT key, value, updated_at FROM platform_settings ORDER BY key ASC`)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	settings := map[string]any{}
	updated := map[string]time.Time{}
	for rows.Next() {
		var key string
		var valueBytes []byte
		var updatedAt time.Time
		if err := rows.Scan(&key, &valueBytes, &updatedAt); err != nil {
			writeError(w, err)
			return
		}
		var value any
		if len(valueBytes) > 0 {
			_ = json.Unmarshal(valueBytes, &value)
		}
		settings[key] = value
		updated[key] = updatedAt
	}
	// Never expose server-side identity credentials through the generic settings endpoint,
	// even when the stored configuration is incomplete or invalid.
	delete(settings, platformIdentitySettingKey)
	if identityConfig, identityErr := s.readPlatformIdentityConfig(r.Context()); identityErr == nil {
		settings[platformIdentitySettingKey] = sanitizePlatformIdentityConfig(identityConfig)
	} else {
		settings[platformIdentitySettingKey] = map[string]any{
			"enabled":             false,
			"required":            false,
			"api_key_configured":  false,
			"ready":               false,
			"configuration_error": true,
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"settings": settings, "updated_at": updated})
}

func (s *Server) updatePlatformSettings(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if raw, ok := input["settings"].(map[string]any); ok {
		input = raw
	}
	for key, value := range input {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if key == platformIdentitySettingKey {
			writeError(w, badRequest("Usa la sección Identidad para actualizar esta integración de forma segura"))
			return
		}
		payload, err := marshalJSONDatabaseValue(value)
		if err != nil {
			writeError(w, err)
			return
		}
		_, err = s.tenantManager.CoreDB().Exec(r.Context(), `
			INSERT INTO platform_settings (key, value, updated_at) VALUES ($1,$2::jsonb,now())
			ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()
		`, key, payload)
		if err != nil {
			writeError(w, err)
			return
		}
	}
	s.auditPlatform(r.Context(), s.platformActor(r), "", "platform.settings.update", redactPlatformSettingsForAudit(input))
	s.platformSettings(w, r)
}

func redactPlatformSettingsForAudit(input map[string]any) map[string]any {
	result := make(map[string]any, len(input))
	for key, value := range input {
		lower := strings.ToLower(strings.TrimSpace(key))
		if strings.Contains(lower, "secret") || strings.Contains(lower, "password") || strings.Contains(lower, "token") || strings.Contains(lower, "access_key") || strings.Contains(lower, "api_key") {
			result[key] = "[REDACTED]"
			continue
		}
		if nested, ok := value.(map[string]any); ok {
			result[key] = redactPlatformSettingsForAudit(nested)
			continue
		}
		result[key] = value
	}
	return result
}

type platformAuditLog struct {
	ID         string    `json:"id"`
	TenantID   string    `json:"tenant_id"`
	TenantName string    `json:"tenant_name"`
	Actor      string    `json:"actor"`
	Action     string    `json:"action"`
	Details    any       `json:"details"`
	CreatedAt  time.Time `json:"created_at"`
}

func (s *Server) listPlatformAuditLogs(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeJSON(w, http.StatusOK, []platformAuditLog{})
		return
	}
	rows, err := s.tenantManager.CoreDB().Query(r.Context(), `
		SELECT l.id::text, COALESCE(l.tenant_id::text,''), COALESCE(t.name,''), l.actor, l.action, l.details, l.created_at
		FROM platform_audit_logs l LEFT JOIN tenants t ON t.id=l.tenant_id
		ORDER BY l.created_at DESC LIMIT 300
	`)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []platformAuditLog{}
	for rows.Next() {
		var item platformAuditLog
		var detailsBytes []byte
		if err := rows.Scan(&item.ID, &item.TenantID, &item.TenantName, &item.Actor, &item.Action, &detailsBytes, &item.CreatedAt); err != nil {
			writeError(w, err)
			return
		}
		var details any = map[string]any{}
		if len(detailsBytes) > 0 {
			_ = json.Unmarshal(detailsBytes, &details)
		}
		item.Details = details
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) dynamicManifest(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager != nil {
		if tenant, pool, err := s.tenantManager.ResolveRequest(r.Context(), r); err == nil {
			ctx := tenancy.WithTenant(r.Context(), tenant, pool)
			s.tenantManifest(w, r.WithContext(ctx))
			return
		}
	}
	s.platformManifest(w, r)
}

func (s *Server) platformManifest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/manifest+json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store, max-age=0")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"name":             "WAMERCIO SaaS",
		"short_name":       "WAMERCIO",
		"description":      "Plataforma SaaS multi-tenant para negocios.",
		"start_url":        "/#/",
		"scope":            "/",
		"display":          "standalone",
		"background_color": "#ffffff",
		"theme_color":      "#00a884",
		"orientation":      "portrait",
		"icons": []map[string]string{
			{"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
			{"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
		},
	})
}

func (s *Server) tenantManifest(w http.ResponseWriter, r *http.Request) {
	storeName := s.cfg.AppName
	themeColor := "#00a884"
	iconURL := "/api/pwa/icon.png"
	stores, _ := s.queryStores(r.Context())
	if len(stores) > 0 {
		storeName = strings.TrimSpace(firstNonEmpty(stores[0].Name, storeName))
		themeColor = strings.TrimSpace(firstNonEmpty(stores[0].Color, themeColor))
	}
	w.Header().Set("Content-Type", "application/manifest+json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store, max-age=0")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"name":             storeName,
		"short_name":       truncateText(storeName, 24),
		"description":      "Tienda digital y gestión de pedidos del negocio.",
		"start_url":        "/#/",
		"scope":            "/",
		"display":          "standalone",
		"background_color": "#ffffff",
		"theme_color":      themeColor,
		"orientation":      "portrait",
		"icons": []map[string]string{
			{"src": iconURL + "?size=192", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
			{"src": iconURL + "?size=512", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
		},
	})
}

func (s *Server) dynamicPWAIcon(w http.ResponseWriter, r *http.Request) {
	logoURL := ""
	if s.tenantManager != nil {
		if tenant, pool, err := s.tenantManager.ResolveRequest(r.Context(), r); err == nil {
			ctx := tenancy.WithTenant(r.Context(), tenant, pool)
			stores, _ := s.queryStores(ctx)
			if len(stores) > 0 {
				logoURL = strings.TrimSpace(stores[0].LogoURL)
			}
		}
	}
	if serveLogoURL(w, r, logoURL) {
		return
	}
	fallback := "/icons/icon-512.png"
	if strings.TrimSpace(r.URL.Query().Get("size")) == "192" {
		fallback = "/icons/icon-192.png"
	}
	w.Header().Set("Cache-Control", "public, max-age=300")
	http.Redirect(w, r, fallback, http.StatusFound)
}

func serveLogoURL(w http.ResponseWriter, r *http.Request, logoURL string) bool {
	logoURL = strings.TrimSpace(logoURL)
	if logoURL == "" {
		return false
	}
	if strings.HasPrefix(logoURL, "data:image/") {
		parts := strings.SplitN(logoURL, ",", 2)
		if len(parts) != 2 {
			return false
		}
		meta := parts[0]
		payload := parts[1]
		contentType := "image/png"
		if strings.HasPrefix(meta, "data:") {
			contentType = strings.TrimPrefix(strings.Split(strings.TrimPrefix(meta, "data:"), ";")[0], " ")
			if contentType == "" {
				contentType = "image/png"
			}
		}
		var data []byte
		var err error
		if strings.Contains(meta, ";base64") {
			data, err = base64.StdEncoding.DecodeString(payload)
		} else {
			decoded, decodeErr := url.QueryUnescape(payload)
			err = decodeErr
			data = []byte(decoded)
		}
		if err != nil || len(data) == 0 {
			return false
		}
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Cache-Control", "no-store, max-age=0")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(data)
		return true
	}
	if strings.HasPrefix(logoURL, "http://") || strings.HasPrefix(logoURL, "https://") || strings.HasPrefix(logoURL, "/") {
		http.Redirect(w, r, logoURL, http.StatusFound)
		return true
	}
	return false
}

func (s *Server) storeOpenGraph(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager != nil {
		if tenant, pool, err := s.tenantManager.ResolveRequest(r.Context(), r); err == nil {
			ctx := tenancy.WithTenant(r.Context(), tenant, pool)
			s.tenantOpenGraph(w, r.WithContext(ctx), tenant)
			return
		}
	}
	s.platformOpenGraph(w, r)
}

func (s *Server) tenantOpenGraph(w http.ResponseWriter, r *http.Request, tenant tenancy.Tenant) {
	storeName := strings.TrimSpace(firstNonEmpty(tenant.Name, s.cfg.AppName, "WAMERCIO"))
	description := "Tienda digital para hacer pedidos rápidos, seguros y directos desde tu negocio."
	address := ""
	whatsapp := ""
	stores, _ := s.queryStores(r.Context())
	if len(stores) > 0 {
		store := stores[0]
		storeName = strings.TrimSpace(firstNonEmpty(store.Name, storeName))
		if strings.TrimSpace(store.Slogan) != "" {
			description = strings.TrimSpace(store.Slogan)
		}
		address = strings.TrimSpace(store.Address)
		whatsapp = strings.TrimSpace(firstNonEmpty(store.WhatsappDisplay, store.Whatsapp))
	}
	if address != "" {
		description = strings.TrimSpace(description + " · " + address)
	}
	if whatsapp != "" {
		description = strings.TrimSpace(description + " · WhatsApp: " + whatsapp)
	}
	s.writeOpenGraphPage(w, r, openGraphPage{
		Title:       storeName + " | WAMERCIO",
		Description: description,
		URL:         publicURLFromRequest(r),
		ImageURL:    absoluteAssetURL(r, "/og-store.png"),
		ImageAlt:    "Tarjeta profesional de " + storeName,
		SiteName:    "WAMERCIO",
	})
}

func (s *Server) platformOpenGraph(w http.ResponseWriter, r *http.Request) {
	s.writeOpenGraphPage(w, r, openGraphPage{
		Title:       "WAMERCIO SaaS",
		Description: "Sistema de gestión para negocios, ventas, inventario, pedidos y reportes.",
		URL:         publicURLFromRequest(r),
		ImageURL:    absoluteAssetURL(r, "/og-store.png"),
		ImageAlt:    "WAMERCIO SaaS para negocios",
		SiteName:    "WAMERCIO",
	})
}

type openGraphPage struct {
	Title       string
	Description string
	URL         string
	ImageURL    string
	ImageAlt    string
	SiteName    string
}

func (s *Server) writeOpenGraphPage(w http.ResponseWriter, r *http.Request, page openGraphPage) {
	page.Title = strings.TrimSpace(firstNonEmpty(page.Title, "WAMERCIO"))
	page.Description = truncateText(strings.TrimSpace(firstNonEmpty(page.Description, "Tienda digital WAMERCIO.")), 220)
	page.URL = strings.TrimSpace(firstNonEmpty(page.URL, publicURLFromRequest(r)))
	page.ImageURL = strings.TrimSpace(firstNonEmpty(page.ImageURL, absoluteAssetURL(r, "/og-store.png")))
	page.ImageAlt = strings.TrimSpace(firstNonEmpty(page.ImageAlt, page.Title))
	page.SiteName = strings.TrimSpace(firstNonEmpty(page.SiteName, "WAMERCIO"))

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store, max-age=0")
	w.WriteHeader(http.StatusOK)
	_, _ = fmt.Fprintf(w, `<!doctype html>
<html lang="es-DO" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>%s</title>
  <link rel="canonical" href="%s" />
  <meta name="description" content="%s" />
  <meta property="og:title" content="%s" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="%s" />
  <meta property="og:image" content="%s" />
  <meta property="og:image:secure_url" content="%s" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="%s" />
  <meta property="og:description" content="%s" />
  <meta property="og:site_name" content="%s" />
  <meta property="og:locale" content="es_DO" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="%s" />
  <meta name="twitter:description" content="%s" />
  <meta name="twitter:image" content="%s" />
  <meta http-equiv="refresh" content="0;url=%s" />
</head>
<body>
  <main style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 32px; color: #111827;">
    <h1>%s</h1>
    <p>%s</p>
    <p><a href="%s">Abrir tienda</a></p>
  </main>
</body>
</html>`,
		html.EscapeString(page.Title),
		html.EscapeString(page.URL),
		html.EscapeString(page.Description),
		html.EscapeString(page.Title),
		html.EscapeString(page.URL),
		html.EscapeString(page.ImageURL),
		html.EscapeString(page.ImageURL),
		html.EscapeString(page.ImageAlt),
		html.EscapeString(page.Description),
		html.EscapeString(page.SiteName),
		html.EscapeString(page.Title),
		html.EscapeString(page.Description),
		html.EscapeString(page.ImageURL),
		html.EscapeString(page.URL),
		html.EscapeString(page.Title),
		html.EscapeString(page.Description),
		html.EscapeString(page.URL),
	)
}

func publicURLFromRequest(r *http.Request) string {
	proto := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto"))
	if proto == "" {
		proto = strings.TrimSpace(r.URL.Scheme)
	}
	if proto == "" {
		proto = "https"
	}
	if strings.Contains(proto, ",") {
		proto = strings.TrimSpace(strings.Split(proto, ",")[0])
	}
	host := strings.TrimSpace(r.Header.Get("X-Forwarded-Host"))
	if host == "" {
		host = strings.TrimSpace(r.Host)
	}
	if strings.Contains(host, ",") {
		host = strings.TrimSpace(strings.Split(host, ",")[0])
	}
	if host == "" {
		host = "ltd.do"
	}
	return proto + "://" + host + "/"
}

func absoluteAssetURL(r *http.Request, assetPath string) string {
	assetPath = "/" + strings.TrimLeft(assetPath, "/")
	base := strings.TrimSuffix(publicURLFromRequest(r), "/")
	return base + assetPath
}

func truncateText(value string, max int) string {
	value = strings.TrimSpace(value)
	if max <= 0 || len([]rune(value)) <= max {
		return value
	}
	runes := []rune(value)
	return strings.TrimSpace(string(runes[:max-1])) + "…"
}

const defaultPaymentSettingsJSON = `{"cash":true,"bankTransfer":true,"credit":true,"card":true,"transferAccount":"","terminalAccount":"","terminalCommission":0,"terminalFixedFee":0,"orderModes":{"delivery":true,"pickup":true}}`
const defaultServiceHoursJSON = `{"monday":{"enabled":true,"open":"08:00","close":"22:00"},"tuesday":{"enabled":true,"open":"08:00","close":"22:00"},"wednesday":{"enabled":true,"open":"08:00","close":"22:00"},"thursday":{"enabled":true,"open":"08:00","close":"22:00"},"friday":{"enabled":true,"open":"08:00","close":"22:00"},"saturday":{"enabled":true,"open":"08:00","close":"22:00"},"sunday":{"enabled":false,"open":"08:00","close":"22:00"}}`

type Store = sqlc.Store
type Product = sqlc.Product
type Sale = sqlc.Sale
type StoreCredit = sqlc.StoreCredit
type Customer = sqlc.Customer
type BankAccount = sqlc.BankAccount
type CashHistory = sqlc.CashHistory

type DeliveryZone struct {
	ID               string          `json:"id"`
	StoreID          string          `json:"store_id"`
	ProvinceCode     string          `json:"province_code"`
	ProvinceName     string          `json:"province_name"`
	MunicipalityCode string          `json:"municipality_code"`
	MunicipalityName string          `json:"municipality_name"`
	DistrictCode     string          `json:"district_code"`
	NeighborhoodID   string          `json:"neighborhood_id"`
	NeighborhoodName string          `json:"neighborhood_name"`
	DeliveryCost     float64         `json:"delivery_cost"`
	Active           bool            `json:"active"`
	ZoneType         string          `json:"zone_type"`
	GeoGeofenceID    string          `json:"geo_geofence_id"`
	GeoService       string          `json:"geo_service"`
	GeoPolygon       json.RawMessage `json:"geo_polygon"`
	GeoSyncStatus    string          `json:"geo_sync_status"`
	GeoSyncError     string          `json:"geo_sync_error"`
	GeoSyncedAt      *time.Time      `json:"geo_synced_at,omitempty"`
	CreatedAt        time.Time       `json:"created_at"`
	UpdatedAt        time.Time       `json:"updated_at"`
}

type StaffUser struct {
	ID                string          `json:"id"`
	Name              string          `json:"name"`
	LastName          string          `json:"last_name"`
	NationalID        string          `json:"national_id"`
	Whatsapp          string          `json:"whatsapp"`
	WhatsappDisplay   string          `json:"whatsapp_display"`
	ProfilePictureURL string          `json:"profile_picture_url"`
	CountryCode       string          `json:"country_code"`
	DialCode          string          `json:"dial_code"`
	Role              string          `json:"role"`
	Permissions       json.RawMessage `json:"permissions"`
	Active            bool            `json:"active"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

type Category struct {
	ID        string    `json:"id"`
	StoreID   string    `json:"store_id"`
	Name      string    `json:"name"`
	Icon      string    `json:"icon"`
	CreatedAt time.Time `json:"created_at"`
}

type Brand struct {
	ID        string    `json:"id"`
	StoreID   string    `json:"store_id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

type adminLookupRequest struct {
	Whatsapp string `json:"whatsapp"`
}

type adminLoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Whatsapp string `json:"whatsapp"`
	PIN      string `json:"pin"`
}

type adminTokenPayload struct {
	Username  string   `json:"username"`
	TenantID  string   `json:"tenant_id,omitempty"`
	TenantIDs []string `json:"tenant_ids,omitempty"`
	ExpiresAt int64    `json:"expires_at"`
}

type customerTokenPayload struct {
	CustomerID string `json:"customer_id"`
	TenantID   string `json:"tenant_id,omitempty"`
	ExpiresAt  int64  `json:"expires_at"`
}

type staffTokenPayload struct {
	UserID    string `json:"user_id"`
	Role      string `json:"role"`
	TenantID  string `json:"tenant_id,omitempty"`
	ExpiresAt int64  `json:"expires_at"`
}

func (s *Server) adminLookup(w http.ResponseWriter, r *http.Request) {
	var input adminLookupRequest
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	whatsapp := normalizeWhatsappDigits(input.Whatsapp)
	if whatsapp == "" || len(whatsapp) != 10 {
		writeJSON(w, http.StatusOK, map[string]any{"exists": false, "error": "Ingresa un WhatsApp válido"})
		return
	}
	if platformUser, err := s.platformUserByWhatsapp(r.Context(), whatsapp); err == nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"exists":        true,
			"whatsapp":      whatsapp,
			"tenants_count": 0,
			"role":          platformUser.Role,
			"account_type":  platformRoleLabel(platformUser.Role),
			"scope":         "platform",
			"panel_path":    "/superadmin",
		})
		return
	} else if !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, err)
		return
	}

	if s.tenantManager == nil {
		writeJSON(w, http.StatusOK, map[string]any{"exists": true, "whatsapp": whatsapp, "tenants_count": 1, "role": "administrator", "account_type": "Administrador"})
		return
	}

	var ownerCount int
	err := s.tenantManager.CoreDB().QueryRow(r.Context(), `
		SELECT count(DISTINCT t.id)
		FROM tenants t
		JOIN platform_owners o ON o.id=t.owner_id
		WHERE t.status IN ('active','trial')
		  AND o.status='active'
		  AND o.whatsapp_digits=$1
	`, whatsapp).Scan(&ownerCount)
	if err != nil {
		writeError(w, err)
		return
	}
	if ownerCount > 0 {
		writeJSON(w, http.StatusOK, map[string]any{
			"exists":        true,
			"whatsapp":      whatsapp,
			"tenants_count": ownerCount,
			"role":          "administrator",
			"account_type":  "Administrador",
			"scope":         "owner",
		})
		return
	}

	tenantPayload := func(tenant tenancy.Tenant, role string) map[string]any {
		role = normalizeStaffRole(role)
		panelPath := "/admin"
		if role == "cashier" {
			panelPath = "/cashier"
		} else if role == "delivery_driver" {
			panelPath = "/delivery"
		}
		return map[string]any{
			"exists":        true,
			"whatsapp":      whatsapp,
			"tenants_count": 1,
			"role":          role,
			"account_type":  roleLabel(role),
			"scope":         "staff",
			"panel_path":    panelPath,
			"tenant_id":     tenant.ID,
			"tenant_slug":   tenant.Slug,
			"tenant_name":   tenant.Name,
			"tenant_domain": tenant.Domain,
			"tenant":        tenant,
		}
	}

	tenantMatchesPhoneSQL := `
		regexp_replace(whatsapp, '\D', '', 'g') <> ''
		AND (
			regexp_replace(whatsapp, '\D', '', 'g') = $1
			OR right(regexp_replace(whatsapp, '\D', '', 'g'), 10) = right($1, 10)
			OR right(regexp_replace(whatsapp, '\D', '', 'g'), length($1)) = $1
			OR right($1, length(regexp_replace(whatsapp, '\D', '', 'g'))) = regexp_replace(whatsapp, '\D', '', 'g')
		)
	`

	tenants, err := s.tenantManager.ListTenants(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	for _, tenant := range tenants {
		if tenant.Status != "active" && tenant.Status != "trial" {
			continue
		}
		pool, err := s.tenantManager.Pool(r.Context(), tenant)
		if err != nil {
			continue
		}

		var role string
		err = pool.QueryRow(r.Context(), `
			SELECT role
			FROM system_users
			WHERE active=true
			  AND lower(trim(role)) IN ('administrator','cashier','delivery_driver')
			  AND `+tenantMatchesPhoneSQL+`
			ORDER BY CASE lower(trim(role))
				WHEN 'administrator' THEN 1
				WHEN 'cashier' THEN 2
				WHEN 'delivery_driver' THEN 3
				ELSE 4 END,
				updated_at DESC
			LIMIT 1
		`, whatsapp).Scan(&role)
		if err == nil && normalizeStaffRole(role) != "" {
			writeJSON(w, http.StatusOK, tenantPayload(tenant, role))
			return
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			continue
		}

		var adminProfileFound bool
		err = pool.QueryRow(r.Context(), `
			SELECT EXISTS(
				SELECT 1
				FROM admin_profiles
				WHERE COALESCE(password_hash,'') <> ''
				  AND (
					(
						regexp_replace(username, '\D', '', 'g') <> ''
						AND (
							regexp_replace(username, '\D', '', 'g') = $1
							OR right(regexp_replace(username, '\D', '', 'g'), 10) = right($1, 10)
							OR right(regexp_replace(username, '\D', '', 'g'), length($1)) = $1
							OR right($1, length(regexp_replace(username, '\D', '', 'g'))) = regexp_replace(username, '\D', '', 'g')
						)
					)
					OR (`+tenantMatchesPhoneSQL+`)
				  )
			)
		`, whatsapp).Scan(&adminProfileFound)
		if err == nil && adminProfileFound {
			writeJSON(w, http.StatusOK, tenantPayload(tenant, "administrator"))
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"exists": false, "whatsapp": whatsapp, "tenants_count": 0})
}

func (s *Server) adminLogin(w http.ResponseWriter, r *http.Request) {
	var input adminLoginRequest
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}

	username := strings.TrimSpace(firstNonEmpty(input.Whatsapp, input.Username))
	password := strings.TrimSpace(firstNonEmpty(input.PIN, input.Password))
	if s.tenantManager != nil {
		username = normalizeWhatsappDigits(username)
		password = onlyDigits(password)
	}
	failureKey := s.authFailureKey(r, "admin", username)
	if s.authLocked(r.Context(), failureKey) {
		s.rejectLockedAuthentication(w)
		return
	}
	fail := func(message string) {
		s.recordAuthenticationFailure(r.Context(), failureKey)
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": message})
	}
	if username == "" || password == "" || (s.tenantManager != nil && !s.supportedAccessPIN(r.Context(), password)) {
		fail("WhatsApp o PIN incorrectos")
		return
	}
	if platformUser, err := s.platformUserByWhatsapp(r.Context(), username); err == nil {
		passwordOK, upgrade := verifyAccessSecret(platformUser.PasswordHash, password)
		if passwordOK {
			if upgrade {
				_ = upgradeAccessSecretHash(func(hash string) error {
					_, updateErr := s.platformDB().Exec(r.Context(), `UPDATE platform_users SET password_hash=$2, updated_at=now() WHERE id=$1::uuid`, platformUser.ID, hash)
					return updateErr
				}, password)
			}
			token, tokenErr := s.issuePlatformToken(platformUser)
			if tokenErr != nil {
				writeError(w, tokenErr)
				return
			}
			s.clearAuthenticationFailures(r.Context(), failureKey)
			s.setSessionCookie(w, platformSessionCookie, token, 12*time.Hour)
			writeJSON(w, http.StatusOK, map[string]any{
				"token":       "cookie",
				"user":        platformUser,
				"role":        platformUser.Role,
				"permissions": platformUser.Permissions,
				"scope":       "platform",
				"panel_path":  "/superadmin",
				"expires_in":  int64(12 * time.Hour / time.Second),
			})
			return
		}
		// El mismo WhatsApp puede pertenecer también a un propietario o empleado.
		// Si el PIN SaaS no coincide, continúa con los métodos existentes para no
		// bloquear el acceso legítimo a su negocio.
	} else if !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, err)
		return
	}

	if s.tenantManager != nil {
		tenants, err := s.authenticateTenantAdmin(r.Context(), username, password)
		if err != nil {
			writeError(w, err)
			return
		}
		if len(tenants) == 0 {
			fail("No se encontró ningún negocio asignado a este WhatsApp y PIN")
			return
		}
		tenantIDs := make([]string, 0, len(tenants))
		for _, tenant := range tenants {
			tenantIDs = append(tenantIDs, tenant.ID)
		}
		token, err := s.issueAdminTokenForTenants(username, tenantIDs)
		if err != nil {
			writeError(w, err)
			return
		}
		s.clearAuthenticationFailures(r.Context(), failureKey)
		s.setSessionCookie(w, adminSessionCookie, token, 12*time.Hour)
		writeJSON(w, http.StatusOK, map[string]any{
			"token":      "cookie",
			"user":       username,
			"tenants":    tenants,
			"expires_in": int64(12 * time.Hour / time.Second),
		})
		return
	}

	if user, ok := s.authenticateLocalSystemAdministrator(r.Context(), username, password); ok {
		token, err := s.issueAdminToken(r.Context(), onlyDigits(user.Whatsapp))
		if err != nil {
			writeError(w, err)
			return
		}
		s.clearAuthenticationFailures(r.Context(), failureKey)
		s.setSessionCookie(w, adminSessionCookie, token, 12*time.Hour)
		writeJSON(w, http.StatusOK, map[string]any{
			"token":      "cookie",
			"user":       onlyDigits(user.Whatsapp),
			"profile":    user,
			"expires_in": int64(12 * time.Hour / time.Second),
		})
		return
	}

	usernameOK := strings.TrimSpace(s.cfg.AdminUsername) != "" && subtle.ConstantTimeCompare([]byte(username), []byte(s.cfg.AdminUsername)) == 1
	passwordOK := strings.TrimSpace(s.cfg.AdminPasswordSHA256) != "" && subtle.ConstantTimeCompare([]byte(sha256Hex(password)), []byte(strings.ToLower(s.cfg.AdminPasswordSHA256))) == 1
	if !usernameOK || !passwordOK {
		fail("Usuario o contraseña incorrectos")
		return
	}

	token, err := s.issueAdminToken(r.Context(), username)
	if err != nil {
		writeError(w, err)
		return
	}
	s.clearAuthenticationFailures(r.Context(), failureKey)
	s.setSessionCookie(w, adminSessionCookie, token, 12*time.Hour)
	writeJSON(w, http.StatusOK, map[string]any{
		"token":      "cookie",
		"user":       username,
		"expires_in": int64(12 * time.Hour / time.Second),
	})
}

func (s *Server) adminSession(w http.ResponseWriter, r *http.Request) {
	username, _ := r.Context().Value(adminUserContextKey{}).(string)
	if tenantIDFromContext(r.Context()) == "" {
		writeJSON(w, http.StatusOK, map[string]any{"authenticated": true, "user": username, "profile": map[string]any{"username": username, "name": "Administrador", "last_name": ""}})
		return
	}
	profile, _ := s.ensureAdminProfile(r.Context(), username)
	writeJSON(w, http.StatusOK, map[string]any{"authenticated": true, "user": username, "profile": profile.public()})
}

type AdminProfile struct {
	Username          string    `json:"username"`
	Name              string    `json:"name"`
	LastName          string    `json:"last_name"`
	NationalID        string    `json:"national_id"`
	Whatsapp          string    `json:"whatsapp"`
	WhatsappDisplay   string    `json:"whatsapp_display"`
	ProfilePictureURL string    `json:"profile_picture_url"`
	CountryCode       string    `json:"country_code"`
	DialCode          string    `json:"dial_code"`
	PasswordHash      string    `json:"-"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

func (p AdminProfile) public() map[string]any {
	return map[string]any{
		"username":            p.Username,
		"name":                p.Name,
		"last_name":           p.LastName,
		"national_id":         p.NationalID,
		"whatsapp":            p.Whatsapp,
		"whatsapp_display":    p.WhatsappDisplay,
		"profile_picture_url": p.ProfilePictureURL,
		"profilePictureUrl":   p.ProfilePictureURL,
		"country_code":        p.CountryCode,
		"dial_code":           p.DialCode,
		"created_at":          p.CreatedAt,
		"updated_at":          p.UpdatedAt,
	}
}

func (s *Server) adminProfile(w http.ResponseWriter, r *http.Request) {
	username, _ := r.Context().Value(adminUserContextKey{}).(string)
	profile, err := s.ensureAdminProfile(r.Context(), username)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, profile.public())
}

func (s *Server) updateAdminProfile(w http.ResponseWriter, r *http.Request) {
	username, _ := r.Context().Value(adminUserContextKey{}).(string)
	if _, err := s.ensureAdminProfile(r.Context(), username); err != nil {
		writeError(w, err)
		return
	}
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if value, ok := input["whatsappDisplay"]; ok {
		input["whatsapp_display"] = value
		delete(input, "whatsappDisplay")
	}
	if value, ok := input["countryCode"]; ok {
		input["country_code"] = value
		delete(input, "countryCode")
	}
	if value, ok := input["dialCode"]; ok {
		input["dial_code"] = value
		delete(input, "dialCode")
	}
	if value, ok := input["profilePictureUrl"]; ok {
		input["profile_picture_url"] = value
		delete(input, "profilePictureUrl")
	}
	if value, ok := input["whatsapp"]; ok {
		if strings.TrimSpace(str(input, "profile_picture_url")) == "" {
			if url := s.fetchPlatformWhatsAppAvatarURL(r.Context(), fmt.Sprint(value)); url != "" {
				input["profile_picture_url"] = url
			}
		}
	}
	if value, ok := input["national_id"]; ok {
		nationalID := normalizeNationalID(fmt.Sprint(value))
		if nationalID != "" {
			if !validDominicanNationalID(nationalID) {
				writeError(w, badRequest("Ingresa una cédula dominicana válida"))
				return
			}
			if err := s.ensureNationalIDAvailable(r.Context(), nationalID, "admin_profiles", username); err != nil {
				writeError(w, err)
				return
			}
		}
		input["national_id"] = nationalID
	}
	allowed := map[string]string{"name": "name", "last_name": "last_name", "national_id": "national_id", "whatsapp": "whatsapp", "whatsapp_display": "whatsapp_display", "country_code": "country_code", "dial_code": "dial_code", "profile_picture_url": "profile_picture_url"}
	set, args := buildSet(input, allowed)
	if set == "" {
		profile, err := s.ensureAdminProfile(r.Context(), username)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, profile.public())
		return
	}
	set = set + ", updated_at=now()"
	args = append([]any{username}, args...)
	var profile AdminProfile
	err := s.db.QueryRow(r.Context(), `
		UPDATE admin_profiles SET `+set+` WHERE username=$1
		RETURNING username, name, last_name, national_id, whatsapp, whatsapp_display, COALESCE(profile_picture_url,''), country_code, dial_code, password_hash, created_at, updated_at
	`, args...).Scan(adminProfileScanPtrs(&profile)...)
	if err != nil {
		writeError(w, err)
		return
	}
	profile = s.hydrateAdminProfileAvatar(r.Context(), profile)
	writeJSON(w, http.StatusOK, profile.public())
}

func (s *Server) updateAdminPassword(w http.ResponseWriter, r *http.Request) {
	username, _ := r.Context().Value(adminUserContextKey{}).(string)
	profile, err := s.ensureAdminProfile(r.Context(), username)
	if err != nil {
		writeError(w, err)
		return
	}
	var input struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
		ConfirmPassword string `json:"confirm_password"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if !s.supportedAccessPIN(r.Context(), input.CurrentPassword) {
		writeError(w, badRequest("El PIN actual no es válido"))
		return
	}
	if !s.validNewAccessPIN(r.Context(), input.NewPassword) || input.NewPassword != input.ConfirmPassword {
		writeError(w, badRequest(fmt.Sprintf("El nuevo PIN debe tener %d dígitos y coincidir", s.accessPINLength(r.Context()))))
		return
	}
	storedHash := strings.TrimSpace(profile.PasswordHash)
	if storedHash == "" {
		storedHash = strings.TrimSpace(s.cfg.AdminPasswordSHA256)
	}
	valid, _ := verifyAccessSecret(storedHash, input.CurrentPassword)
	if !valid {
		writeError(w, apiError{status: http.StatusUnauthorized, msg: "El PIN actual no es correcto"})
		return
	}
	newHash, err := hashAccessSecret(input.NewPassword)
	if err != nil {
		writeError(w, err)
		return
	}
	_, err = s.db.Exec(r.Context(), `UPDATE admin_profiles SET password_hash=$2, updated_at=now() WHERE username=$1`, username, newHash)
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditBusiness(r.Context(), "admin.pin.updated", "admin_profile", username, map[string]any{})
	writeJSON(w, http.StatusOK, map[string]bool{"updated": true})
}

func (s *Server) listSystemUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.querySystemUsers(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, users)
}

func (s *Server) createSystemUser(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	pin := strings.TrimSpace(str(input, "pin"))
	if !s.validNewAccessPIN(r.Context(), pin) {
		writeError(w, badRequest(fmt.Sprintf("Define un PIN de acceso de %d dígitos", s.accessPINLength(r.Context()))))
		return
	}
	user, err := s.insertSystemUser(r.Context(), input, pin)
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditBusiness(r.Context(), "staff.created", "system_user", user.ID, map[string]any{"role": user.Role, "active": user.Active})
	writeJSON(w, http.StatusCreated, user)
}

func (s *Server) updateSystemUser(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	user, err := s.updateReturningSystemUser(r.Context(), chi.URLParam(r, "id"), input)
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditBusiness(r.Context(), "staff.updated", "system_user", user.ID, map[string]any{"role": user.Role, "active": user.Active})
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) deleteSystemUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	command, err := s.db.Exec(r.Context(), `UPDATE system_users SET active=false, updated_at=now() WHERE id=$1::uuid`, id)
	if err != nil {
		writeError(w, err)
		return
	}
	if command.RowsAffected() == 0 {
		writeError(w, apiError{status: http.StatusNotFound, msg: "Usuario no encontrado"})
		return
	}
	s.auditBusiness(r.Context(), "staff.deactivated", "system_user", id, map[string]any{"active": false})
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true, "deactivated": true})
}

func (s *Server) adminStaffLogin(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Whatsapp string `json:"whatsapp"`
		Pin      string `json:"pin"`
		Role     string `json:"role"`
		TenantID string `json:"tenant_id"`
		Tenant   string `json:"tenant"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	failureKey := s.authFailureKey(r, "staff", input.Whatsapp+":"+input.Role)
	if s.authLocked(r.Context(), failureKey) {
		s.rejectLockedAuthentication(w)
		return
	}
	user, tenant, tenantCtx, err := s.authenticateStaffAcrossTenants(r.Context(), input.Role, input.Whatsapp, input.Pin, firstNonEmpty(input.TenantID, input.Tenant))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			s.recordAuthenticationFailure(r.Context(), failureKey)
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "WhatsApp o PIN incorrecto"})
			return
		}
		writeError(w, err)
		return
	}
	token, err := s.issueStaffToken(tenantCtx, user.ID, user.Role)
	if err != nil {
		writeError(w, err)
		return
	}
	s.clearAuthenticationFailures(r.Context(), failureKey)
	s.setSessionCookie(w, staffSessionCookie, token, 12*time.Hour)
	writeJSON(w, http.StatusOK, map[string]any{"token": "cookie", "user": user, "role": user.Role, "tenant": tenant, "tenant_id": tenant.ID, "tenant_slug": tenant.Slug})
}

func (s *Server) staffLogin(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Whatsapp string `json:"whatsapp"`
		Pin      string `json:"pin"`
		Role     string `json:"role"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	failureKey := s.authFailureKey(r, "staff", input.Whatsapp+":"+input.Role)
	if s.authLocked(r.Context(), failureKey) {
		s.rejectLockedAuthentication(w)
		return
	}

	var user StaffUser
	var tenant tenancy.Tenant
	var tenantCtx context.Context
	var err error
	if currentTenant, ok := tenancy.FromContext(r.Context()); ok {
		user, err = s.authenticateStaffInContext(r.Context(), input.Role, input.Whatsapp, input.Pin)
		tenant = currentTenant
		tenantCtx = r.Context()
	} else {
		user, tenant, tenantCtx, err = s.authenticateStaffAcrossTenants(r.Context(), input.Role, input.Whatsapp, input.Pin, "")
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			s.recordAuthenticationFailure(r.Context(), failureKey)
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "WhatsApp o PIN incorrecto"})
			return
		}
		writeError(w, err)
		return
	}

	token, err := s.issueStaffToken(tenantCtx, user.ID, user.Role)
	if err != nil {
		writeError(w, err)
		return
	}
	s.clearAuthenticationFailures(r.Context(), failureKey)
	s.setSessionCookie(w, staffSessionCookie, token, 12*time.Hour)
	payload := map[string]any{"token": "cookie", "user": user, "role": user.Role}
	if strings.TrimSpace(tenant.ID) != "" {
		payload["tenant"] = tenant
		payload["tenant_id"] = tenant.ID
		payload["tenant_slug"] = tenant.Slug
	}
	writeJSON(w, http.StatusOK, payload)
}

func (s *Server) authenticateStaffInContext(ctx context.Context, roleRaw, whatsappRaw, pinRaw string) (StaffUser, error) {
	role := normalizeStaffRole(roleRaw)
	phone := normalizeWhatsappDigits(whatsappRaw)
	if phone == "" {
		phone = onlyDigits(whatsappRaw)
	}
	pin := onlyDigits(pinRaw)
	if phone == "" || !s.supportedAccessPIN(ctx, pin) {
		return StaffUser{}, pgx.ErrNoRows
	}

	whereRole := ""
	args := []any{phone}
	switch role {
	case "administrator":
		whereRole = " AND lower(trim(role)) = 'administrator'"
	case "cashier":
		whereRole = " AND lower(trim(role)) = 'cashier'"
	case "delivery_driver":
		whereRole = " AND lower(trim(role)) = 'delivery_driver'"
	}

	var u StaffUser
	var storedHash string
	err := s.db.QueryRow(ctx, `
		SELECT id::text, name, last_name, national_id, whatsapp, whatsapp_display, COALESCE(profile_picture_url,''), country_code, dial_code, role, COALESCE(permissions,'{}'::jsonb), active, created_at, updated_at, pin_hash
		FROM system_users
		WHERE active=true
		  AND COALESCE(pin_hash,'') <> ''
		  AND lower(trim(role)) IN ('administrator','cashier','delivery_driver')
		  AND regexp_replace(COALESCE(whatsapp,''), '\D', '', 'g') <> ''
		  AND (
			regexp_replace(whatsapp, '\D', '', 'g') = $1
			OR right(regexp_replace(whatsapp, '\D', '', 'g'), 10) = right($1, 10)
			OR right(regexp_replace(whatsapp, '\D', '', 'g'), length($1)) = $1
			OR right($1, length(regexp_replace(whatsapp, '\D', '', 'g'))) = regexp_replace(whatsapp, '\D', '', 'g')
		  )`+whereRole+`
		ORDER BY CASE lower(trim(role))
				WHEN 'administrator' THEN 1
				WHEN 'cashier' THEN 2
				WHEN 'delivery_driver' THEN 3
				ELSE 4 END,
			updated_at DESC
		LIMIT 1
	`, args...).Scan(&u.ID, &u.Name, &u.LastName, &u.NationalID, &u.Whatsapp, &u.WhatsappDisplay, &u.ProfilePictureURL, &u.CountryCode, &u.DialCode, &u.Role, &u.Permissions, &u.Active, &u.CreatedAt, &u.UpdatedAt, &storedHash)
	if err != nil {
		return StaffUser{}, err
	}
	valid, upgrade := verifyAccessSecret(storedHash, pin)
	if !valid {
		return StaffUser{}, pgx.ErrNoRows
	}
	if upgrade {
		_ = upgradeAccessSecretHash(func(hash string) error {
			_, updateErr := s.db.Exec(ctx, `UPDATE system_users SET pin_hash=$2, updated_at=now() WHERE id=$1::uuid`, u.ID, hash)
			return updateErr
		}, pin)
	}
	u.Role = normalizeStaffRole(u.Role)
	if u.Role == "" {
		return StaffUser{}, pgx.ErrNoRows
	}
	return s.hydrateStaffUserAvatar(ctx, u), nil
}

func (s *Server) authenticateStaffAcrossTenants(ctx context.Context, roleRaw, whatsappRaw, pinRaw, tenantHint string) (StaffUser, tenancy.Tenant, context.Context, error) {
	if s.tenantManager == nil {
		user, err := s.authenticateStaffInContext(ctx, roleRaw, whatsappRaw, pinRaw)
		return user, tenancy.Tenant{}, ctx, err
	}

	tenants, err := s.tenantManager.ListTenants(ctx)
	if err != nil {
		return StaffUser{}, tenancy.Tenant{}, ctx, err
	}
	tenantHint = strings.ToLower(strings.TrimSpace(tenantHint))
	for _, tenant := range tenants {
		if tenant.Status != "active" && tenant.Status != "trial" {
			continue
		}
		if tenantHint != "" {
			matchesHint := strings.EqualFold(tenant.ID, tenantHint) || strings.EqualFold(tenant.Slug, tenantHint) || strings.EqualFold(tenant.Domain, tenantHint)
			if !matchesHint {
				continue
			}
		}
		pool, err := s.tenantManager.Pool(ctx, tenant)
		if err != nil {
			continue
		}
		tenantCtx := tenancy.WithTenant(ctx, tenant, pool)
		user, err := s.authenticateStaffInContext(tenantCtx, roleRaw, whatsappRaw, pinRaw)
		if err == nil {
			return user, tenant, tenantCtx, nil
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			continue
		}
	}
	return StaffUser{}, tenancy.Tenant{}, ctx, pgx.ErrNoRows
}

func (s *Server) staffSession(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(staffUserContextKey{}).(StaffUser)
	writeJSON(w, http.StatusOK, map[string]any{"authenticated": true, "user": user, "role": user.Role})
}

func (s *Server) staffProfile(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(staffUserContextKey{}).(StaffUser)
	writeJSON(w, http.StatusOK, map[string]any{"user": user, "role": user.Role})
}

func (s *Server) updateStaffProfile(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(staffUserContextKey{}).(StaffUser)
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	filtered := map[string]any{}
	for _, key := range []string{"name", "name", "last_name", "last_name", "national_id", "whatsapp", "whatsapp_display", "whatsappDisplay", "country_code", "countryCode", "dial_code", "dialCode", "profile_picture_url", "profilePictureUrl", "avatar_url", "avatarUrl"} {
		if value, ok := input[key]; ok {
			filtered[key] = value
		}
	}
	updated, err := s.updateReturningSystemUser(r.Context(), user.ID, filtered)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": updated, "role": updated.Role})
}

func (s *Server) updateStaffPin(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(staffUserContextKey{}).(StaffUser)
	var input struct {
		CurrentPin string `json:"current_pin"`
		NewPin     string `json:"new_pin"`
		ConfirmPin string `json:"confirm_pin"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if !s.supportedAccessPIN(r.Context(), input.CurrentPin) {
		writeError(w, badRequest("El PIN actual no es válido"))
		return
	}
	if !s.validNewAccessPIN(r.Context(), input.NewPin) || input.NewPin != input.ConfirmPin {
		writeError(w, badRequest(fmt.Sprintf("El nuevo PIN debe tener %d dígitos y coincidir", s.accessPINLength(r.Context()))))
		return
	}
	var storedHash string
	if err := s.db.QueryRow(r.Context(), `SELECT pin_hash FROM system_users WHERE id=$1`, user.ID).Scan(&storedHash); err != nil {
		writeError(w, err)
		return
	}
	valid, _ := verifyAccessSecret(storedHash, input.CurrentPin)
	if !valid {
		writeError(w, apiError{status: http.StatusUnauthorized, msg: "El PIN actual no es correcto"})
		return
	}
	newHash, err := hashAccessSecret(input.NewPin)
	if err != nil {
		writeError(w, err)
		return
	}
	_, err = s.db.Exec(r.Context(), `UPDATE system_users SET pin_hash=$2, updated_at=now() WHERE id=$1`, user.ID, newHash)
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditBusiness(r.Context(), "staff.pin.updated", "system_user", user.ID, map[string]any{"role": user.Role})
	writeJSON(w, http.StatusOK, map[string]bool{"updated": true})
}

func tenantIDFromContext(ctx context.Context) string {
	tenant, ok := tenancy.FromContext(ctx)
	if !ok {
		return ""
	}
	return tenant.ID
}

func tenantTokenMatches(ctx context.Context, tokenTenantID string, tokenTenantIDs []string) bool {
	currentTenantID := tenantIDFromContext(ctx)
	if currentTenantID == "" {
		return true
	}
	for _, id := range tokenTenantIDs {
		if strings.TrimSpace(id) == currentTenantID {
			return true
		}
	}
	return strings.TrimSpace(tokenTenantID) != "" && tokenTenantID == currentTenantID
}

type adminUserContextKey struct{}
type adminTenantIDsContextKey struct{}
type staffUserContextKey struct{}

func adminTenantIDsFromContext(ctx context.Context) []string {
	ids, _ := ctx.Value(adminTenantIDsContextKey{}).([]string)
	return ids
}

func adminTenantAllowed(ctx context.Context, tenantID string) bool {
	tenantID = strings.TrimSpace(tenantID)
	if tenantID == "" {
		return false
	}
	for _, id := range adminTenantIDsFromContext(ctx) {
		if strings.TrimSpace(id) == tenantID {
			return true
		}
	}
	return false
}

func (s *Server) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := bearerOrCookieToken(r, adminSessionCookie)
		if token == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Sesión de administrador requerida"})
			return
		}
		payload, err := s.validateAdminTokenPayload(r.Context(), token)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Sesión expirada o inválida"})
			return
		}
		ctx := context.WithValue(r.Context(), adminUserContextKey{}, payload.Username)
		ctx = context.WithValue(ctx, adminTenantIDsContextKey{}, payload.TenantIDs)
		setRequestActor(ctx, payload.Username, "administrator")
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) issueAdminToken(ctx context.Context, username string) (string, error) {
	tenantID := tenantIDFromContext(ctx)
	tenantIDs := []string{}
	if tenantID != "" {
		tenantIDs = append(tenantIDs, tenantID)
	}
	return s.issueAdminTokenForTenants(username, tenantIDs)
}

func (s *Server) issueAdminTokenForTenants(username string, tenantIDs []string) (string, error) {
	cleanIDs := make([]string, 0, len(tenantIDs))
	seen := map[string]bool{}
	for _, id := range tenantIDs {
		id = strings.TrimSpace(id)
		if id != "" && !seen[id] {
			seen[id] = true
			cleanIDs = append(cleanIDs, id)
		}
	}
	payload := adminTokenPayload{Username: strings.TrimSpace(username), TenantIDs: cleanIDs, ExpiresAt: time.Now().Add(12 * time.Hour).Unix()}
	if len(cleanIDs) == 1 {
		payload.TenantID = cleanIDs[0]
	}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	body := base64.RawURLEncoding.EncodeToString(payloadJSON)
	sig := s.signAdminTokenBody(body)
	return body + "." + sig, nil
}

func (s *Server) validateAdminToken(ctx context.Context, token string) (string, error) {
	payload, err := s.validateAdminTokenPayload(ctx, token)
	if err != nil {
		return "", err
	}
	return payload.Username, nil
}

func (s *Server) validateAdminTokenPayload(ctx context.Context, token string) (adminTokenPayload, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return adminTokenPayload{}, errors.New("invalid token")
	}
	expectedSig := s.signAdminTokenBody(parts[0])
	if subtle.ConstantTimeCompare([]byte(expectedSig), []byte(parts[1])) != 1 {
		return adminTokenPayload{}, errors.New("invalid token signature")
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return adminTokenPayload{}, err
	}
	var payload adminTokenPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return adminTokenPayload{}, err
	}
	if strings.TrimSpace(payload.Username) == "" || time.Now().Unix() > payload.ExpiresAt || !tenantTokenMatches(ctx, payload.TenantID, payload.TenantIDs) {
		return adminTokenPayload{}, errors.New("expired token")
	}
	return payload, nil
}

func bearerTokenFromRequest(r *http.Request) string {
	return bearerOrCookieToken(r, adminSessionCookie, staffSessionCookie, clientSessionCookie, platformSessionCookie)
}

func (s *Server) hasAdminOrStaffAccess(r *http.Request, allowedRoles ...string) bool {
	candidates := sessionTokenCandidates(r, adminSessionCookie, staffSessionCookie)
	for _, token := range candidates {
		if payload, err := s.validateAdminTokenPayload(r.Context(), token); err == nil {
			ctx := context.WithValue(r.Context(), adminUserContextKey{}, payload.Username)
			ctx = context.WithValue(ctx, adminTenantIDsContextKey{}, payload.TenantIDs)
			setRequestActor(ctx, payload.Username, "administrator")
			*r = *r.WithContext(ctx)
			return true
		}
	}
	for _, token := range candidates {
		user, err := s.validateStaffToken(r.Context(), token)
		if err != nil {
			continue
		}
		role := normalizeStaffRole(user.Role)
		if len(allowedRoles) > 0 {
			allowedRole := false
			for _, allowed := range allowedRoles {
				if role == normalizeStaffRole(allowed) {
					allowedRole = true
					break
				}
			}
			if !allowedRole {
				continue
			}
		}
		ctx := context.WithValue(r.Context(), staffUserContextKey{}, user)
		setRequestActor(ctx, user.ID, role)
		*r = *r.WithContext(ctx)
		return true
	}
	return false
}

func (s *Server) requireAdminOrStaffRoles(allowedRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			candidates := sessionTokenCandidates(r, adminSessionCookie, staffSessionCookie)
			if len(candidates) == 0 {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Sesión requerida"})
				return
			}
			for _, token := range candidates {
				if payload, err := s.validateAdminTokenPayload(r.Context(), token); err == nil {
					ctx := context.WithValue(r.Context(), adminUserContextKey{}, payload.Username)
					ctx = context.WithValue(ctx, adminTenantIDsContextKey{}, payload.TenantIDs)
					setRequestActor(ctx, payload.Username, "administrator")
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}
			for _, token := range candidates {
				user, err := s.validateStaffToken(r.Context(), token)
				if err != nil {
					continue
				}
				role := normalizeStaffRole(user.Role)
				allowed := len(allowedRoles) == 0
				for _, item := range allowedRoles {
					if role == normalizeStaffRole(item) {
						allowed = true
						break
					}
				}
				if !allowed {
					writeJSON(w, http.StatusForbidden, map[string]string{"error": "No tienes permisos para realizar esta acción"})
					return
				}
				ctx := context.WithValue(r.Context(), staffUserContextKey{}, user)
				setRequestActor(ctx, user.ID, role)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Sesión expirada o inválida"})
		})
	}
}

func (s *Server) requireStaff(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := bearerOrCookieToken(r, staffSessionCookie)
		if token == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Sesión de usuario requerida"})
			return
		}
		user, err := s.validateStaffToken(r.Context(), token)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Sesión expirada o inválida"})
			return
		}
		ctx := context.WithValue(r.Context(), staffUserContextKey{}, user)
		setRequestActor(ctx, user.ID, normalizeStaffRole(user.Role))
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) issueStaffToken(ctx context.Context, userID, role string) (string, error) {
	payload := staffTokenPayload{UserID: userID, Role: role, TenantID: tenantIDFromContext(ctx), ExpiresAt: time.Now().Add(12 * time.Hour).Unix()}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	body := base64.RawURLEncoding.EncodeToString(payloadJSON)
	mac := hmac.New(sha256.New, []byte("staff:"+s.cfg.AdminTokenSecret))
	mac.Write([]byte(body))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return body + "." + sig, nil
}

func (s *Server) validateStaffToken(ctx context.Context, token string) (StaffUser, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return StaffUser{}, errors.New("invalid token")
	}
	mac := hmac.New(sha256.New, []byte("staff:"+s.cfg.AdminTokenSecret))
	mac.Write([]byte(parts[0]))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if subtle.ConstantTimeCompare([]byte(expected), []byte(parts[1])) != 1 {
		return StaffUser{}, errors.New("invalid token signature")
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return StaffUser{}, err
	}
	var payload staffTokenPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return StaffUser{}, err
	}
	if payload.UserID == "" || time.Now().Unix() > payload.ExpiresAt || !tenantTokenMatches(ctx, payload.TenantID, nil) {
		return StaffUser{}, errors.New("expired token")
	}
	user, err := s.getSystemUser(ctx, payload.UserID)
	if err != nil {
		return StaffUser{}, err
	}
	if !user.Active || normalizeStaffRole(user.Role) != normalizeStaffRole(payload.Role) {
		return StaffUser{}, errors.New("inactive user")
	}
	user.Role = normalizeStaffRole(user.Role)
	return user, nil
}

func (s *Server) signAdminTokenBody(body string) string {
	mac := hmac.New(sha256.New, []byte(s.cfg.AdminTokenSecret))
	mac.Write([]byte(body))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func sha256Hex(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	s.ready(w, r)
}

func (s *Server) live(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":   "ok",
		"app":      s.cfg.AppName,
		"time":     s.now(),
		"timezone": s.cfg.AppTimezone,
	})
}

func (s *Server) ready(w http.ResponseWriter, r *http.Request) {
	if s.metrics != nil && !s.metrics.ready.Load() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"status": "shutting_down", "app": s.cfg.AppName})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	responseStatus := http.StatusOK
	status := map[string]any{"status": "ok", "app": s.cfg.AppName, "time": s.now(), "timezone": s.cfg.AppTimezone}
	var coreSchemaReady bool
	if err := s.db.Ping(ctx); err != nil {
		responseStatus = http.StatusServiceUnavailable
		status["status"] = "unavailable"
		status["postgres"] = "unavailable"
	} else if err := s.db.QueryRow(ctx, `SELECT to_regclass('public.tenants') IS NOT NULL`).Scan(&coreSchemaReady); err != nil || !coreSchemaReady {
		responseStatus = http.StatusServiceUnavailable
		status["status"] = "unavailable"
		status["postgres"] = "migration_required"
	} else {
		status["postgres"] = "ok"
	}
	if s.globalCustomersDB != nil {
		var globalSchemaReady bool
		if err := s.globalCustomersDB.Ping(ctx); err != nil {
			responseStatus = http.StatusServiceUnavailable
			status["status"] = "unavailable"
			status["global_customers_postgres"] = "unavailable"
		} else if err := s.globalCustomersDB.QueryRow(ctx, `SELECT to_regclass('public.global_customers') IS NOT NULL`).Scan(&globalSchemaReady); err != nil || !globalSchemaReady {
			responseStatus = http.StatusServiceUnavailable
			status["status"] = "unavailable"
			status["global_customers_postgres"] = "migration_required"
		} else {
			status["global_customers_postgres"] = "ok"
		}
	}
	if s.redis != nil {
		if err := s.redis.Ping(ctx).Err(); err != nil {
			status["redis"] = "degraded"
		} else {
			status["redis"] = "ok"
		}
	}
	writeJSON(w, responseStatus, status)
}

func (s *Server) SetReady(ready bool) {
	if s != nil && s.metrics != nil {
		s.metrics.ready.Store(ready)
	}
}

func (s *Server) MetricsHandler() http.Handler {
	if s == nil || s.metrics == nil {
		return http.NotFoundHandler()
	}
	return s.metrics.handler(s)
}

func (s *Server) bootstrap(w http.ResponseWriter, r *http.Request) {
	includePrivate := s.hasAdminOrStaffAccess(r, "cashier", "delivery_driver", "administrator")
	ctx := r.Context()
	stores, err := s.queryStores(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	if len(stores) == 0 {
		created, err := s.insertDefaultStore(ctx)
		if err != nil {
			writeError(w, err)
			return
		}
		stores = []Store{created}
	}
	storeID := stores[0].ID
	if !includePrivate {
		if s.writeCachedBootstrap(ctx, w, storeID) {
			return
		}
	}
	var payload map[string]any
	if !includePrivate {
		cacheKey := s.bootstrapCacheKey(ctx, storeID)
		if cacheKey != "" {
			value, buildErr, _ := s.bootstrapGroup.Do(cacheKey, func() (any, error) {
				return s.buildDataPayload(ctx, storeID, stores, false)
			})
			err = buildErr
			if buildErr == nil {
				var ok bool
				payload, ok = value.(map[string]any)
				if !ok {
					err = errors.New("bootstrap payload has an unexpected type")
				}
			}
		} else {
			payload, err = s.buildDataPayload(ctx, storeID, stores, false)
		}
	} else {
		payload, err = s.buildDataPayload(ctx, storeID, stores, true)
	}
	if err != nil {
		writeError(w, err)
		return
	}
	if !includePrivate {
		s.writeJSONWithBootstrapCache(ctx, w, storeID, payload)
		return
	}
	writeJSON(w, http.StatusOK, payload)
}

func (s *Server) storeData(w http.ResponseWriter, r *http.Request) {
	includePrivate := s.hasAdminOrStaffAccess(r, "cashier", "delivery_driver", "administrator")
	ctx := r.Context()
	stores, err := s.queryStores(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	payload, err := s.buildDataPayload(ctx, chi.URLParam(r, "id"), stores, includePrivate)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, payload)
}

func (s *Server) buildDataPayload(ctx context.Context, storeID string, stores []Store, includePrivate bool) (map[string]any, error) {
	products, err := s.queryProducts(ctx, storeID)
	if err != nil {
		return nil, err
	}
	if !includePrivate {
		availableProducts := make([]Product, 0, len(products))
		for _, product := range products {
			if product.Stock > 0 {
				availableProducts = append(availableProducts, product)
			}
		}
		products = availableProducts
	}
	categories, err := s.queryCategories(ctx, storeID)
	if err != nil {
		return nil, err
	}
	brands, err := s.queryBrands(ctx, storeID)
	if err != nil {
		return nil, err
	}
	sales := []map[string]any{}
	storeCredits := []StoreCredit{}
	cash := []CashHistory{}
	customers := []Customer{}
	accounts, err := s.queryPublicBankAccounts(ctx)
	if err != nil {
		return nil, err
	}
	if includePrivate {
		var err error
		sales, err = s.querySalesForViewerLimit(ctx, storeID, 250)
		if err != nil {
			return nil, err
		}
		staff, hasStaff := ctx.Value(staffUserContextKey{}).(StaffUser)
		isDeliveryDriver := hasStaff && normalizeStaffRole(staff.Role) == "delivery_driver"
		if !isDeliveryDriver {
			storeCredits, err = s.queryStoreCreditsLimit(ctx, storeID, 500)
			if err != nil {
				return nil, err
			}
			cash, err = s.queryCashHistoryLimit(ctx, storeID, 100)
			if err != nil {
				return nil, err
			}
			customers, _, err = s.queryCustomersPage(ctx, "", 200, 0)
			if err != nil {
				return nil, err
			}
			accounts, err = s.queryBankAccounts(ctx)
			if err != nil {
				return nil, err
			}
		}
	}
	deliveryZones, err := s.queryDeliveryZones(ctx, storeID)
	if err != nil {
		return nil, err
	}
	tenant, _ := tenancy.FromContext(ctx)
	return map[string]any{
		"stores":          stores,
		"activeStoreId":   storeID,
		"deliveryZones":   deliveryZones,
		"delivery_zones":  deliveryZones,
		"products":        products,
		"categories":      categories,
		"brands":          brands,
		"sales":           sales,
		"store_credits":   storeCredits,
		"cashHistory":     cash,
		"customers":       customers,
		"bankAccounts":    accounts,
		"timezone":        s.cfg.AppTimezone,
		"tenant":          tenant,
		"multiTenant":     true,
		"bootstrapLimits": map[string]int{"sales": 250, "storeCredits": 500, "cashHistory": 100, "customers": 200},
	}, nil
}

func (s *Server) listStores(w http.ResponseWriter, r *http.Request) {
	stores, err := s.queryStores(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, stores)
}

func (s *Server) createStore(w http.ResponseWriter, r *http.Request) {
	stores, err := s.queryStores(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	if len(stores) >= 1 {
		writeJSON(w, http.StatusOK, stores[0])
		return
	}
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if err := validateTerritoryAddressInput(input); err != nil {
		writeError(w, err)
		return
	}
	normalizeTerritoryAddressInput(input)
	store, err := s.insertStore(r.Context(), input)
	if err != nil {
		writeError(w, err)
		return
	}
	s.syncStoreGeoLocation(r.Context(), store)
	writeJSON(w, http.StatusCreated, store)
}

func (s *Server) updateStore(w http.ResponseWriter, r *http.Request) {
	allowed := map[string]string{
		"name": "name", "slogan": "slogan", "address": "address",
		"province_code": "province_code", "provinceCode": "province_code", "province": "province",
		"municipality_code": "municipality_code", "municipalityCode": "municipality_code", "municipality": "municipality",
		"district_code": "district_code", "districtCode": "district_code",
		"neighborhood_id": "neighborhood_id", "neighborhoodId": "neighborhood_id", "neighborhood": "neighborhood", "sector": "neighborhood",
		"street": "street", "street_number": "street_number",
		"whatsapp": "whatsapp", "whatsapp_display": "whatsapp_display", "whatsappDisplay": "whatsapp_display", "country_code": "country_code", "countryCode": "country_code", "dial_code": "dial_code", "dialCode": "dial_code", "emoji": "emoji", "logo_url": "logo_url", "logoUrl": "logo_url", "color": "color", "active": "active", "store_status": "store_status", "storeStatus": "store_status", "payment_settings": "payment_settings", "paymentSettings": "payment_settings", "service_hours": "service_hours", "serviceHours": "service_hours", "delivery_scope": "delivery_scope", "deliveryScope": "delivery_scope", "latitude": "latitude", "lat": "latitude", "longitude": "longitude", "lng": "longitude", "lon": "longitude", "location_accuracy": "location_accuracy", "locationAccuracy": "location_accuracy", "accuracy": "location_accuracy", "location_source": "location_source", "locationSource": "location_source", "location_updated_at": "location_updated_at",
	}
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if value, ok := input["phone"]; ok {
		input["whatsapp"] = value
		delete(input, "phone")
	}
	if value, ok := input["payment_settings"]; ok {
		input["payment_settings"] = normalizePaymentSettingsPayload(value)
	}
	if value, ok := input["paymentSettings"]; ok {
		input["paymentSettings"] = normalizePaymentSettingsPayload(value)
	}
	normalizeTerritoryAddressInput(input)
	store, err := s.updateReturningStore(r.Context(), chi.URLParam(r, "id"), allowed, input)
	if err != nil {
		writeError(w, err)
		return
	}
	s.syncTenantStoreDeliveryScope(r.Context(), store.DeliveryScope)
	s.syncStoreGeoLocation(r.Context(), store)
	s.invalidateTenantCache(r.Context())
	s.publishTenantEvent(r.Context(), "store_updated", map[string]any{"storeId": store.ID})
	writeJSON(w, http.StatusOK, store)
}

func (s *Server) deleteStore(w http.ResponseWriter, r *http.Request) {
	stores, err := s.queryStores(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	if len(stores) <= 1 {
		writeJSON(w, http.StatusOK, map[string]any{"deleted": false, "reason": "single_tenant_store_mode"})
		return
	}
	storeID := chi.URLParam(r, "id")
	err = s.queries.DeleteStore(r.Context(), storeID)
	if err != nil {
		writeError(w, err)
		return
	}
	s.removeStoreGeoLocation(r.Context(), storeID)
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

func deliveryZoneSelectSQL(prefix string) string {
	return prefix + ` id::text, store_id::text, province_code, province_name, municipality_code, municipality_name, district_code, neighborhood_id, neighborhood_name, delivery_cost, active,
		zone_type, geo_geofence_id, geo_service, geo_polygon, geo_sync_status, geo_sync_error, geo_synced_at, created_at, updated_at`
}

func deliveryZoneScanPtrs(z *DeliveryZone) []any {
	return []any{&z.ID, &z.StoreID, &z.ProvinceCode, &z.ProvinceName, &z.MunicipalityCode, &z.MunicipalityName, &z.DistrictCode, &z.NeighborhoodID, &z.NeighborhoodName, &z.DeliveryCost, &z.Active,
		&z.ZoneType, &z.GeoGeofenceID, &z.GeoService, &z.GeoPolygon, &z.GeoSyncStatus, &z.GeoSyncError, &z.GeoSyncedAt, &z.CreatedAt, &z.UpdatedAt}
}

func (s *Server) queryDeliveryZones(ctx context.Context, storeID string) ([]DeliveryZone, error) {
	storeID = strings.TrimSpace(storeID)
	if storeID == "" {
		return []DeliveryZone{}, nil
	}
	rows, err := s.db.Query(ctx, deliveryZoneSelectSQL(`SELECT`)+` FROM delivery_zones WHERE store_id=$1 ORDER BY active DESC, province_name, municipality_name, neighborhood_name`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []DeliveryZone{}
	for rows.Next() {
		var item DeliveryZone
		if err := rows.Scan(deliveryZoneScanPtrs(&item)...); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func normalizeDeliveryScopeValue(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "provincial", "province", "provincia_completa":
		return "provincial"
	case "municipal", "municipality", "local":
		return "municipal"
	default:
		return "municipal"
	}
}

func (s *Server) syncTenantStoreDeliveryScope(ctx context.Context, value string) {
	if s.tenantManager == nil {
		return
	}
	tenant, ok := tenancy.FromContext(ctx)
	if !ok || strings.TrimSpace(tenant.ID) == "" {
		return
	}
	scope := normalizeDeliveryScopeValue(value)
	_, _ = s.tenantManager.CoreDB().Exec(ctx, `
		UPDATE tenants
		SET metadata=jsonb_set(COALESCE(metadata, '{}'::jsonb), '{delivery_scope}', to_jsonb($2::text), true),
		    updated_at=now()
		WHERE id=$1::uuid
	`, tenant.ID, scope)
}

func normalizeDeliveryZoneInput(input map[string]any) map[string]any {
	zoneType := strings.ToLower(strings.TrimSpace(firstNonEmpty(str(input, "zone_type"), str(input, "zoneType"))))
	if zoneType == "" {
		zoneType = "territorial"
	}
	geoService := strings.TrimSpace(firstNonEmpty(str(input, "geo_service"), str(input, "geoService")))
	if geoService == "" {
		geoService = "delivery"
	}
	polygon := input["geo_polygon"]
	if polygon == nil {
		polygon = input["geoPolygon"]
	}
	polygonRaw := json.RawMessage(`[]`)
	if polygon != nil {
		if raw, err := json.Marshal(polygon); err == nil {
			polygonRaw = raw
		}
	}
	geoGeofenceID := strings.TrimSpace(firstNonEmpty(str(input, "geo_geofence_id"), str(input, "geoGeofenceId")))
	if zoneType != "geofence" {
		geoGeofenceID = ""
		polygonRaw = json.RawMessage(`[]`)
	}
	return map[string]any{
		"store_id":          strings.TrimSpace(firstNonEmpty(str(input, "store_id"), str(input, "storeId"))),
		"province_code":     strings.TrimSpace(firstNonEmpty(str(input, "province_code"), str(input, "provinceCode"), str(input, "province_code"), str(input, "provinceCode"))),
		"province_name":     strings.TrimSpace(firstNonEmpty(str(input, "province_name"), str(input, "provinceName"), str(input, "province"))),
		"municipality_code": strings.TrimSpace(firstNonEmpty(str(input, "municipality_code"), str(input, "municipalityCode"), str(input, "municipality_code"), str(input, "municipalityCode"))),
		"municipality_name": strings.TrimSpace(firstNonEmpty(str(input, "municipality_name"), str(input, "municipalityName"), str(input, "municipality"))),
		"district_code":     strings.TrimSpace(firstNonEmpty(str(input, "district_code"), str(input, "districtCode"), str(input, "district_code"), str(input, "districtCode"))),
		"neighborhood_id":   strings.TrimSpace(firstNonEmpty(str(input, "neighborhood_id"), str(input, "neighborhoodId"), str(input, "neighborhood_id"), str(input, "neighborhoodId"))),
		"neighborhood_name": strings.TrimSpace(firstNonEmpty(str(input, "neighborhood_name"), str(input, "neighborhoodName"), str(input, "neighborhood"), str(input, "sector"))),
		"delivery_cost":     firstFloat(input, "delivery_cost", "deliveryCost", "costo", "cost"),
		"active":            boolDefault(input, "active", true),
		"zone_type":         zoneType,
		"geo_geofence_id":   geoGeofenceID,
		"geo_service":       geoService,
		"geo_polygon":       polygonRaw,
	}
}

func (s *Server) applyStoreDeliveryScopeToZone(ctx context.Context, input map[string]any) error {
	storeID := strings.TrimSpace(fmt.Sprint(input["store_id"]))
	if storeID == "" {
		return nil
	}
	store, err := s.queries.GetStore(ctx, storeID)
	if err != nil {
		return err
	}
	if store.ProvinceCode != "" {
		input["province_code"] = store.ProvinceCode
	}
	if store.Province != "" {
		input["province_name"] = store.Province
	}
	if normalizeDeliveryScopeValue(store.DeliveryScope) == "municipal" {
		if store.MunicipalityCode != "" {
			input["municipality_code"] = store.MunicipalityCode
		}
		if store.Municipality != "" {
			input["municipality_name"] = store.Municipality
		}
		if store.DistrictCode != "" {
			input["district_code"] = store.DistrictCode
		}
	}
	return nil
}

func validateDeliveryZoneInput(input map[string]any) error {
	if strings.TrimSpace(fmt.Sprint(input["store_id"])) == "" {
		return badRequest("Selecciona el negocio para la zona de entrega")
	}
	zoneType := strings.TrimSpace(fmt.Sprint(input["zone_type"]))
	if zoneType != "territorial" && zoneType != "geofence" {
		return badRequest("El tipo de zona de entrega no es válido")
	}
	if zoneType == "territorial" {
		if strings.TrimSpace(fmt.Sprint(input["province_code"])) == "" || strings.TrimSpace(fmt.Sprint(input["province_name"])) == "" {
			return badRequest("Selecciona la provincia")
		}
		if strings.TrimSpace(fmt.Sprint(input["municipality_code"])) == "" || strings.TrimSpace(fmt.Sprint(input["municipality_name"])) == "" {
			return badRequest("Selecciona el municipio o distrito")
		}
		if strings.TrimSpace(fmt.Sprint(input["neighborhood_name"])) == "" {
			return badRequest("Selecciona el barrio o sector")
		}
	} else {
		if strings.TrimSpace(fmt.Sprint(input["neighborhood_name"])) == "" {
			return badRequest("Escribe un nombre para la geocerca")
		}
		raw, ok := input["geo_polygon"].(json.RawMessage)
		if !ok {
			encoded, err := json.Marshal(input["geo_polygon"])
			if err != nil {
				return badRequest("La geometría de la geocerca no es válida")
			}
			raw = encoded
		}
		if !validGeoDeliveryPolygon(geoDeliveryPolygon(raw)) {
			return badRequest("Dibuja una geocerca con al menos 3 puntos válidos")
		}
	}
	if cost := float(input, "delivery_cost"); cost < 0 {
		return badRequest("El costo de entrega no puede ser negativo")
	}
	return nil
}

func (s *Server) listDeliveryZones(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(firstNonEmpty(r.URL.Query().Get("store_id"), r.URL.Query().Get("storeId")))
	if storeID == "" {
		stores, err := s.queryStores(r.Context())
		if err != nil {
			writeError(w, err)
			return
		}
		if len(stores) > 0 {
			storeID = stores[0].ID
		}
	}
	items, err := s.queryDeliveryZones(r.Context(), storeID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) createDeliveryZone(w http.ResponseWriter, r *http.Request) {
	var raw map[string]any
	if err := readJSON(r, &raw); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input := normalizeDeliveryZoneInput(raw)
	if err := s.applyStoreDeliveryScopeToZone(r.Context(), input); err != nil {
		writeError(w, err)
		return
	}
	if err := validateDeliveryZoneInput(input); err != nil {
		writeError(w, err)
		return
	}
	var item DeliveryZone
	geoStatus := "not_applicable"
	if input["zone_type"] == "geofence" {
		geoStatus = "pending"
	}
	err := s.db.QueryRow(r.Context(), deliveryZoneSelectSQL(`
		INSERT INTO delivery_zones (store_id, province_code, province_name, municipality_code, municipality_name, district_code, neighborhood_id, neighborhood_name, delivery_cost, active, zone_type, geo_geofence_id, geo_service, geo_polygon, geo_sync_status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		RETURNING`),
		input["store_id"], input["province_code"], input["province_name"], input["municipality_code"], input["municipality_name"], input["district_code"], input["neighborhood_id"], input["neighborhood_name"], input["delivery_cost"], input["active"], input["zone_type"], input["geo_geofence_id"], input["geo_service"], input["geo_polygon"], geoStatus,
	).Scan(deliveryZoneScanPtrs(&item)...)
	if err != nil {
		writeError(w, err)
		return
	}
	if item.ZoneType == "geofence" {
		synced, syncErr := s.geoSyncDeliveryZone(r.Context(), item)
		if syncErr == nil {
			item = synced
			_ = s.db.QueryRow(r.Context(), deliveryZoneSelectSQL(`UPDATE delivery_zones SET geo_geofence_id=$2, geo_sync_status='synced', geo_sync_error='', geo_synced_at=now(), updated_at=now() WHERE id=$1::uuid RETURNING`), item.ID, item.GeoGeofenceID).Scan(deliveryZoneScanPtrs(&item)...)
		} else {
			_ = s.db.QueryRow(r.Context(), deliveryZoneSelectSQL(`UPDATE delivery_zones SET geo_sync_status='error', geo_sync_error=$2, updated_at=now() WHERE id=$1::uuid RETURNING`), item.ID, truncateText(syncErr.Error(), 500)).Scan(deliveryZoneScanPtrs(&item)...)
		}
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) updateDeliveryZone(w http.ResponseWriter, r *http.Request) {
	var previous DeliveryZone
	_ = s.db.QueryRow(r.Context(), deliveryZoneSelectSQL(`SELECT`)+` FROM delivery_zones WHERE id=$1::uuid`, chi.URLParam(r, "id")).Scan(deliveryZoneScanPtrs(&previous)...)
	var raw map[string]any
	if err := readJSON(r, &raw); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input := normalizeDeliveryZoneInput(raw)
	if err := s.applyStoreDeliveryScopeToZone(r.Context(), input); err != nil {
		writeError(w, err)
		return
	}
	if _, ok := raw["active"]; !ok {
		if _, ok2 := raw["zona_activa"]; ok2 {
			input["active"] = boolDefault(raw, "zona_activa", true)
		}
	}
	if err := validateDeliveryZoneInput(input); err != nil {
		writeError(w, err)
		return
	}
	var item DeliveryZone
	err := s.db.QueryRow(r.Context(), deliveryZoneSelectSQL(`
		UPDATE delivery_zones
		SET store_id=$2, province_code=$3, province_name=$4, municipality_code=$5, municipality_name=$6, district_code=$7, neighborhood_id=$8, neighborhood_name=$9, delivery_cost=$10, active=$11,
		    zone_type=$12, geo_geofence_id=$13, geo_service=$14, geo_polygon=$15,
		    geo_sync_status=CASE WHEN $12='geofence' THEN 'pending' ELSE 'not_applicable' END,
		    geo_sync_error='', updated_at=now()
		WHERE id=$1
		RETURNING`),
		chi.URLParam(r, "id"), input["store_id"], input["province_code"], input["province_name"], input["municipality_code"], input["municipality_name"], input["district_code"], input["neighborhood_id"], input["neighborhood_name"], input["delivery_cost"], input["active"], input["zone_type"], input["geo_geofence_id"], input["geo_service"], input["geo_polygon"],
	).Scan(deliveryZoneScanPtrs(&item)...)
	if err != nil {
		writeError(w, err)
		return
	}
	if item.ZoneType == "geofence" {
		synced, syncErr := s.geoSyncDeliveryZone(r.Context(), item)
		if syncErr == nil {
			item = synced
			_ = s.db.QueryRow(r.Context(), deliveryZoneSelectSQL(`UPDATE delivery_zones SET geo_geofence_id=$2, geo_sync_status='synced', geo_sync_error='', geo_synced_at=now(), updated_at=now() WHERE id=$1::uuid RETURNING`), item.ID, item.GeoGeofenceID).Scan(deliveryZoneScanPtrs(&item)...)
		} else {
			_ = s.db.QueryRow(r.Context(), deliveryZoneSelectSQL(`UPDATE delivery_zones SET geo_sync_status='error', geo_sync_error=$2, updated_at=now() WHERE id=$1::uuid RETURNING`), item.ID, truncateText(syncErr.Error(), 500)).Scan(deliveryZoneScanPtrs(&item)...)
		}
	} else if previous.ZoneType == "geofence" && strings.TrimSpace(previous.GeoGeofenceID) != "" {
		s.geoDeleteDeliveryZone(r.Context(), previous)
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) syncDeliveryZoneGeo(w http.ResponseWriter, r *http.Request) {
	var item DeliveryZone
	if err := s.db.QueryRow(r.Context(), deliveryZoneSelectSQL(`SELECT`)+` FROM delivery_zones WHERE id=$1::uuid`, chi.URLParam(r, "id")).Scan(deliveryZoneScanPtrs(&item)...); err != nil {
		writeError(w, err)
		return
	}
	if item.ZoneType != "geofence" {
		writeError(w, badRequest("Solo las geocercas se sincronizan con GEO RD MAP"))
		return
	}
	synced, err := s.geoSyncDeliveryZone(r.Context(), item)
	if err != nil {
		_ = s.db.QueryRow(r.Context(), deliveryZoneSelectSQL(`UPDATE delivery_zones SET geo_sync_status='error', geo_sync_error=$2, updated_at=now() WHERE id=$1::uuid RETURNING`), item.ID, truncateText(err.Error(), 500)).Scan(deliveryZoneScanPtrs(&item)...)
		writeError(w, err)
		return
	}
	item = synced
	if err := s.db.QueryRow(r.Context(), deliveryZoneSelectSQL(`UPDATE delivery_zones SET geo_geofence_id=$2, geo_sync_status='synced', geo_sync_error='', geo_synced_at=now(), updated_at=now() WHERE id=$1::uuid RETURNING`), item.ID, item.GeoGeofenceID).Scan(deliveryZoneScanPtrs(&item)...); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) deleteDeliveryZone(w http.ResponseWriter, r *http.Request) {
	var item DeliveryZone
	_ = s.db.QueryRow(r.Context(), deliveryZoneSelectSQL(`SELECT`)+` FROM delivery_zones WHERE id=$1::uuid`, chi.URLParam(r, "id")).Scan(deliveryZoneScanPtrs(&item)...)
	_, err := s.db.Exec(r.Context(), `DELETE FROM delivery_zones WHERE id=$1`, chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, err)
		return
	}
	s.geoDeleteDeliveryZone(r.Context(), item)
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

func (s *Server) createCategory(w http.ResponseWriter, r *http.Request) {
	var input struct {
		StoreID string `json:"store_id"`
		Name    string `json:"name"`
		Icon    string `json:"icon"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input.StoreID = strings.TrimSpace(input.StoreID)
	input.Name = strings.TrimSpace(input.Name)
	if input.Icon == "" {
		input.Icon = "📦"
	}
	if input.StoreID == "" || input.Name == "" {
		writeError(w, badRequest("Debes seleccionar el negocio e indicar el nombre de la categoría"))
		return
	}
	category, err := s.ensureCategory(r.Context(), input.StoreID, input.Name, input.Icon)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, category)
}

func (s *Server) deleteCategory(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	name := strings.TrimSpace(r.URL.Query().Get("name"))
	if storeID == "" || name == "" {
		writeError(w, badRequest("Debes seleccionar el negocio e indicar el nombre de la categoría"))
		return
	}
	_, err := s.db.Exec(r.Context(), `DELETE FROM categories WHERE store_id=$1 AND name=$2`, storeID, name)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

func (s *Server) createBrand(w http.ResponseWriter, r *http.Request) {
	var input struct {
		StoreID string `json:"store_id"`
		Name    string `json:"name"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input.StoreID = strings.TrimSpace(input.StoreID)
	input.Name = strings.TrimSpace(input.Name)
	if input.StoreID == "" || input.Name == "" {
		writeError(w, badRequest("Debes seleccionar el negocio e indicar el nombre de la marca"))
		return
	}
	brand, err := s.ensureBrand(r.Context(), input.StoreID, input.Name)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, brand)
}

func (s *Server) deleteBrand(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	name := strings.TrimSpace(r.URL.Query().Get("name"))
	if storeID == "" || name == "" {
		writeError(w, badRequest("Debes seleccionar el negocio e indicar el nombre de la marca"))
		return
	}
	_, err := s.db.Exec(r.Context(), `DELETE FROM brands WHERE store_id=$1 AND name=$2`, storeID, name)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

func (s *Server) createProduct(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	product, err := s.insertProduct(r.Context(), input)
	if err != nil {
		writeError(w, err)
		return
	}
	s.invalidateTenantCache(r.Context())
	s.publishTenantEvent(r.Context(), "product_updated", map[string]any{"productId": product.ID, "storeId": product.StoreID})
	writeJSON(w, http.StatusCreated, product)
}

func (s *Server) updateProduct(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	product, err := s.updateReturningProduct(r.Context(), chi.URLParam(r, "id"), input)
	if err != nil {
		writeError(w, err)
		return
	}
	s.invalidateTenantCache(r.Context())
	s.publishTenantEvent(r.Context(), "product_updated", map[string]any{"productId": product.ID, "storeId": product.StoreID})
	writeJSON(w, http.StatusOK, product)
}

func (s *Server) deleteProduct(w http.ResponseWriter, r *http.Request) {
	err := s.queries.DeleteProduct(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, err)
		return
	}
	s.invalidateTenantCache(r.Context())
	s.publishTenantEvent(r.Context(), "product_updated", map[string]any{"productId": chi.URLParam(r, "id")})
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

func (s *Server) updateProductStock(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Stock  *float64 `json:"stock"`
		Delta  *float64 `json:"delta"`
		Reason string   `json:"reason"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	id := chi.URLParam(r, "id")
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var current Product
	err = tx.QueryRow(r.Context(), productSelectSQL("SELECT")+` FROM products WHERE id=$1::uuid FOR UPDATE`, id).Scan(productScanPtrs(&current)...)
	if err != nil {
		writeError(w, err)
		return
	}
	before := current.Stock
	var requestedStock float64
	if input.Stock != nil {
		requestedStock = normalizeInventoryStock(*input.Stock, current.Format)
	} else if input.Delta != nil {
		delta := normalizeInventoryDelta(*input.Delta, current.Format)
		if delta == 0 {
			writeError(w, badRequest("El ajuste no puede ser cero"))
			return
		}
		requestedStock = normalizeInventoryStock(before+delta, current.Format)
	} else {
		writeError(w, badRequest("La existencia o el ajuste es requerido"))
		return
	}
	if math.Abs(requestedStock-before) < 0.000001 {
		writeError(w, badRequest("La existencia no presenta cambios"))
		return
	}
	if current.TrackBatches && requestedStock-before > 0.000001 {
		writeError(w, apiError{status: http.StatusConflict, msg: "Para aumentar la existencia de un producto controlado por lotes, registra un lote o una recepción de compra"})
		return
	}
	var product Product
	err = tx.QueryRow(r.Context(), productSelectSQL("UPDATE products SET stock=$2 WHERE id=$1::uuid RETURNING"), id, requestedStock).Scan(productScanPtrs(&product)...)
	if err != nil {
		writeError(w, err)
		return
	}
	reason := strings.TrimSpace(input.Reason)
	if reason == "" {
		reason = "Ajuste manual de inventario"
	}
	actor := actorFromContext(r.Context())
	var movementID string
	err = tx.QueryRow(r.Context(), `
		INSERT INTO inventory_movements (
			store_id,product_id,movement_type,quantity_delta,stock_before,stock_after,
			reason,reference_type,actor_id,actor_role
		) VALUES ($1::uuid,$2::uuid,'adjustment',$3,$4,$5,$6,'manual',$7,$8)
		RETURNING id::text
	`, product.StoreID, product.ID, product.Stock-before, before, product.Stock, reason, actor.ID, actor.Role).Scan(&movementID)
	if err != nil {
		writeError(w, err)
		return
	}
	if current.TrackBatches && product.Stock < before {
		if err := reduceTrackedBatchesForAdjustmentTx(r.Context(), tx, product.StoreID, product.ID, before-product.Stock, movementID, reason, actor); err != nil {
			writeError(w, err)
			return
		}
	}
	if err := postInventoryAdjustmentAccountingTx(r.Context(), tx, product.StoreID, movementID, product.Stock-before, product.Cost, actor); err != nil {
		writeError(w, err)
		return
	}
	if err := insertAuditTx(r.Context(), tx, product.StoreID, actor, "inventory.stock.adjusted", "product", product.ID, map[string]any{"store_id": product.StoreID, "stock_before": before, "stock_after": product.Stock, "reason": reason}); err != nil {
		writeError(w, err)
		return
	}
	if err := insertOutboxTx(r.Context(), tx, product.StoreID, "product", product.ID, "inventory.stock.adjusted", map[string]any{"product_id": product.ID, "store_id": product.StoreID, "stock": product.Stock}, ""); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	product = s.hydrateProductBarcode(r.Context(), product)
	s.invalidateTenantCache(r.Context())
	writeJSON(w, http.StatusOK, product)
}

func (s *Server) createSale(w http.ResponseWriter, r *http.Request) {
	var input struct {
		StoreID         string          `json:"store_id"`
		Items           json.RawMessage `json:"items"`
		Total           float64         `json:"total"`
		Method          string          `json:"method"`
		Customer        string          `json:"customer"`
		CustomerID      string          `json:"customer_id"`
		DeliveryAddress string          `json:"delivery_address"`
		Date            *time.Time      `json:"date"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if strings.TrimSpace(input.StoreID) == "" {
		writeError(w, badRequest("Debes seleccionar el negocio"))
		return
	}
	if input.Method == "" {
		input.Method = "cash"
	}
	method, methodErr := validateOfflinePaymentMethod(input.Method)
	if methodErr != nil {
		writeError(w, methodErr)
		return
	}
	input.Method = method
	date := s.now()
	if input.Date != nil {
		date = *input.Date
	}
	items, total, _, err := canonicalSaleItems(r.Context(), s.db, input.StoreID, input.Items, false)
	if err != nil {
		writeError(w, err)
		return
	}
	input.Items, input.Total = items, total
	name := strings.TrimSpace(input.Customer)
	customerID := ""
	var customer *Customer
	ref := strings.TrimSpace(input.CustomerID)
	if ref == "" {
		ref = name
	}
	if ref != "" {
		found, err := s.findCustomerByReference(r.Context(), ref)
		if err != nil {
			writeError(w, err)
			return
		}
		if found == nil && input.CustomerID != "" {
			writeError(w, badRequest("El cliente seleccionado no existe"))
			return
		}
		if found != nil {
			customer = found
			name = found.Name
			customerID = found.ID
		}
	}
	if input.Method == "store_credit" {
		if customer == nil {
			writeError(w, badRequest("Selecciona un cliente registrado para vender fiado"))
			return
		}
		credit := parseCreditConfig(customer.StoreCredit, input.StoreID)
		if !credit.Enabled || strings.EqualFold(credit.Status, "blocked") {
			writeError(w, badRequest("El crédito fiado no está habilitado"))
			return
		}
		debt, err := s.customerDebt(r.Context(), input.StoreID, customer.Name)
		if err != nil {
			writeError(w, err)
			return
		}
		if !strings.EqualFold(credit.Type, "unlimited") && (credit.Limit <= 0 || debt+input.Total > credit.Limit) {
			writeError(w, badRequest("El pedido supera el límite de crédito disponible"))
			return
		}
	}
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	items, total, adjustments, err := canonicalSaleItems(r.Context(), tx, input.StoreID, input.Items, true)
	if err != nil {
		writeError(w, err)
		return
	}
	input.Items, input.Total = items, total
	qtx := s.queries.WithTx(tx)
	sale, err := qtx.CreateSale(r.Context(), sqlc.CreateSaleParams{StoreID: input.StoreID, Items: input.Items, Total: input.Total, Method: input.Method, Customer: name, Date: date, CustomerID: customerID, DeliveryAddress: strings.TrimSpace(input.DeliveryAddress), Status: "delivered", OrderType: "pos"})
	if err != nil {
		writeError(w, err)
		return
	}
	referenceNumber := "V-" + strings.ToUpper(strings.ReplaceAll(sale.ID, "-", ""))
	if len(referenceNumber) > 12 {
		referenceNumber = referenceNumber[:12]
	}
	_, err = tx.Exec(r.Context(), `UPDATE sales SET reference_number=$2,updated_at=now() WHERE id=$1::uuid`, sale.ID, referenceNumber)
	if err != nil {
		writeError(w, err)
		return
	}
	if err := consumeTrackedBatchesTx(r.Context(), tx, input.StoreID, sale.ID, adjustments); err != nil {
		writeError(w, err)
		return
	}
	if err := applyInventoryAdjustments(r.Context(), tx, input.StoreID, adjustments); err != nil {
		writeError(w, err)
		return
	}
	actor := actorFromContext(r.Context())
	if err := recordInventoryAdjustmentsTx(r.Context(), tx, input.StoreID, "sale", "Venta realizada", "sale", sale.ID, actor, adjustments, -1); err != nil {
		writeError(w, err)
		return
	}
	var creditCreated *StoreCredit
	if input.Method == "store_credit" && customer != nil {
		f, err := qtx.CreateStoreCredit(r.Context(), sqlc.CreateStoreCreditParams{StoreID: input.StoreID, Customer: customer.Name, Amount: input.Total, Note: "Venta a crédito", Status: "pending", Type: "charge", Date: date})
		if err != nil {
			writeError(w, err)
			return
		}
		f.CustomerID = customerID
		f.RemainingAmount = f.Amount
		f.ReferenceType = "sale"
		f.ReferenceID = sale.ID
		f.CreatedBy = actor.ID
		creditCreated = &f
		_, err = tx.Exec(r.Context(), `
			UPDATE store_credits SET customer_id=NULLIF($2,'')::uuid,reference_type='sale',reference_id=$3::uuid,created_by=$4,updated_at=now()
			WHERE id=$1::uuid
		`, f.ID, customerID, sale.ID, actor.ID)
		if err != nil {
			writeError(w, err)
			return
		}
	}
	if input.Method == "cash" {
		if err := insertCashMovementForOpenSession(r.Context(), tx, input.StoreID, "sale", input.Total, input.Method, "Venta en efectivo", "sale", sale.ID, actor); err != nil {
			writeError(w, err)
			return
		}
	}
	if err := postSaleAccountingTx(r.Context(), tx, input.StoreID, sale.ID, input.Method, input.Total, input.Items, actor); err != nil {
		writeError(w, err)
		return
	}
	if err := insertAuditTx(r.Context(), tx, input.StoreID, actor, "sale.created", "sale", sale.ID, map[string]any{"store_id": input.StoreID, "total": input.Total, "method": input.Method, "customer_id": customerID}); err != nil {
		writeError(w, err)
		return
	}
	if err := insertOutboxTx(r.Context(), tx, input.StoreID, "sale", sale.ID, "sale.created", map[string]any{"sale_id": sale.ID, "store_id": input.StoreID, "customer_id": customerID, "total": input.Total, "method": input.Method}, "sale.created:"+sale.ID); err != nil {
		writeError(w, err)
		return
	}
	if err := insertNotificationTx(r.Context(), tx, input.StoreID, "administrator", "", "sale.created", "Nueva venta", fmt.Sprintf("Se registró una venta por RD$ %.2f.", input.Total), map[string]any{"sale_id": sale.ID, "method": input.Method}); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	s.invalidateTenantCache(r.Context())
	products, _ := s.queryProducts(r.Context(), input.StoreID)
	writeJSON(w, http.StatusCreated, map[string]any{"sale": sale, "products": products, "store_credit": creditCreated})
}

func (s *Server) assistedOrderCustomerLookup(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Whatsapp string `json:"whatsapp"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	phoneDigits := onlyDigits(input.Whatsapp)
	if len(phoneDigits) < 10 {
		writeError(w, badRequest("Ingresa un WhatsApp válido"))
		return
	}

	localCustomer, err := s.findCustomerByReference(r.Context(), phoneDigits)
	if err != nil {
		writeError(w, err)
		return
	}
	if localCustomer != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"found":                 true,
			"scope":                 "local",
			"customer":              localCustomer,
			"registration_complete": strings.TrimSpace(localCustomer.PinHash) != "",
		})
		return
	}

	globalCustomer, err := s.findGlobalCustomerForAssistedOrder(r.Context(), phoneDigits)
	if err != nil {
		writeError(w, err)
		return
	}
	if globalCustomer != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"found":                 true,
			"scope":                 "global",
			"customer":              globalCustomer,
			"registration_complete": strings.TrimSpace(globalCustomer.PinHash) != "",
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"found": false, "scope": "", "customer": nil})
}

func (s *Server) createAssistedOrder(w http.ResponseWriter, r *http.Request) {
	var input struct {
		StoreID                 string          `json:"store_id"`
		Items                   json.RawMessage `json:"items"`
		Subtotal                float64         `json:"subtotal"`
		DeliveryCost            float64         `json:"delivery_cost"`
		DeliveryCostCamel       float64         `json:"deliveryCost"`
		Total                   float64         `json:"total"`
		Method                  string          `json:"method"`
		PaymentBankAccountID    string          `json:"payment_bank_account_id"`
		PaymentBankAccountCamel string          `json:"paymentBankAccountId"`
		BankAccountID           string          `json:"bank_account_id"`
		BankAccountIDCamel      string          `json:"bankAccountId"`
		OrderMode               string          `json:"order_mode"`
		OrderModeCamel          string          `json:"orderMode"`
		OrderSource             string          `json:"order_source"`
		OrderSourceCamel        string          `json:"orderSource"`
		CustomerID              string          `json:"customer_id"`
		CustomerIDCamel         string          `json:"customerId"`
		CustomerName            string          `json:"customer_name"`
		CustomerNameCamel       string          `json:"customerName"`
		CustomerFirstName       string          `json:"customer_first_name"`
		CustomerFirstNameCamel  string          `json:"customerFirstName"`
		CustomerLastName        string          `json:"customer_last_name"`
		CustomerLastNameCamel   string          `json:"customerLastName"`
		CustomerWhatsapp        string          `json:"customer_whatsapp"`
		CustomerWhatsappCamel   string          `json:"customerWhatsapp"`
		Whatsapp                string          `json:"whatsapp"`
		WhatsappDisplay         string          `json:"whatsapp_display"`
		WhatsappDisplayCamel    string          `json:"whatsappDisplay"`
		CountryCode             string          `json:"country_code"`
		CountryCodeCamel        string          `json:"countryCode"`
		DialCode                string          `json:"dial_code"`
		DialCodeCamel           string          `json:"dialCode"`
		Address                 string          `json:"address"`
		DeliveryAddress         string          `json:"delivery_address"`
		DeliveryAddressCamel    string          `json:"deliveryAddress"`
		DeliveryZoneID          string          `json:"delivery_zone_id"`
		DeliveryZoneIDCamel     string          `json:"deliveryZoneId"`
		Province                string          `json:"province"`
		ProvinceCode            string          `json:"province_code"`
		ProvinceCodeCamel       string          `json:"provinceCode"`
		Municipality            string          `json:"municipality"`
		MunicipalityCode        string          `json:"municipality_code"`
		MunicipalityCodeCamel   string          `json:"municipalityCode"`
		DistrictCode            string          `json:"district_code"`
		DistritoCodeCamel       string          `json:"districtCode"`
		Neighborhood            string          `json:"neighborhood"`
		Sector                  string          `json:"sector"`
		NeighborhoodID          string          `json:"neighborhood_id"`
		NeighborhoodIDCamel     string          `json:"neighborhoodId"`
		Street                  string          `json:"street"`
		StreetNumber            string          `json:"street_number"`
		CashChangeNeeded        *bool           `json:"cash_change_needed"`
		CashChangeNeededCamel   *bool           `json:"cashChangeNeeded"`
		CashChangeAnswered      *bool           `json:"cash_change_answered"`
		CashChangeAnsweredCamel *bool           `json:"cashChangeAnswered"`
		CashChangeFrom          float64         `json:"cash_change_from"`
		CashChangeFromCamel     float64         `json:"cashChangeFrom"`
		CashTenderedAmount      float64         `json:"cash_tendered_amount"`
		CashTenderedAmountCamel float64         `json:"cashTenderedAmount"`
		Notes                   string          `json:"notes"`
		Date                    *time.Time      `json:"date"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if strings.TrimSpace(input.StoreID) == "" {
		writeError(w, badRequest("Debes seleccionar el negocio"))
		return
	}
	if len(input.Items) == 0 || string(input.Items) == "null" {
		writeError(w, badRequest("El pedido no tiene productos"))
		return
	}

	store, err := s.queries.GetStore(r.Context(), input.StoreID)
	if err != nil {
		writeError(w, err)
		return
	}
	input.Method, err = validateOfflinePaymentMethod(input.Method)
	if err != nil {
		writeError(w, err)
		return
	}
	if !storePaymentMethodEnabled(store, input.Method) {
		writeError(w, badRequest("El método de pago seleccionado no está disponible para este negocio"))
		return
	}

	orderMode := normalizeOrderModeValue(firstNonEmpty(input.OrderMode, input.OrderModeCamel))
	if orderMode == "" {
		writeError(w, badRequest("Selecciona si el pedido será para entrega o recogida"))
		return
	}
	if !storeOrderModes(store).enabled(orderMode) {
		writeError(w, badRequest("La modalidad seleccionada no está disponible para este negocio"))
		return
	}
	canonicalItems, canonicalSubtotal, _, err := canonicalSaleItems(r.Context(), s.db, input.StoreID, input.Items, false)
	if err != nil {
		writeError(w, err)
		return
	}
	input.Items, input.Subtotal = canonicalItems, canonicalSubtotal

	whatsappRaw := strings.TrimSpace(firstNonEmpty(input.CustomerWhatsapp, input.CustomerWhatsappCamel, input.Whatsapp))
	whatsappDigits := normalizePlatformWhatsAppPhone(whatsappRaw)
	if whatsappDigits == "" || len(whatsappDigits) < 11 || len(whatsappDigits) > 15 {
		writeError(w, badRequest("Ingresa un WhatsApp válido para identificar al cliente"))
		return
	}
	whatsappValidation, err := s.validatePlatformWhatsAppNumberForSave(r.Context(), whatsappRaw)
	if err != nil {
		writeError(w, err)
		return
	}
	if whatsappValidation.Phone != "" {
		whatsappDigits = whatsappValidation.Phone
	}
	customerFirstName := strings.TrimSpace(firstNonEmpty(input.CustomerFirstName, input.CustomerFirstNameCamel))
	customerLastName := strings.TrimSpace(firstNonEmpty(input.CustomerLastName, input.CustomerLastNameCamel))
	customerName := strings.TrimSpace(firstNonEmpty(input.CustomerName, input.CustomerNameCamel))
	if customerName == "" {
		customerName = strings.TrimSpace(customerFirstName + " " + customerLastName)
	}
	customerID := strings.TrimSpace(firstNonEmpty(input.CustomerID, input.CustomerIDCamel))
	var customer *Customer
	if customerID != "" {
		found, err := s.queries.GetCustomer(r.Context(), customerID)
		if err != nil {
			writeError(w, badRequest("El cliente seleccionado no existe o ya no está disponible"))
			return
		}
		storedPhone := onlyDigits(found.Whatsapp)
		if storedPhone != "" && !(storedPhone == whatsappDigits || strings.HasSuffix(storedPhone, whatsappDigits) || strings.HasSuffix(whatsappDigits, storedPhone)) {
			writeError(w, badRequest("El WhatsApp ingresado no coincide con el cliente seleccionado"))
			return
		}
		customer = &found
	} else {
		found, err := s.findCustomerByReference(r.Context(), whatsappRaw)
		if err != nil {
			writeError(w, err)
			return
		}
		customer = found
	}
	if customer == nil {
		globalCustomer, err := s.findGlobalCustomerForAssistedOrder(r.Context(), whatsappDigits)
		if err != nil {
			writeError(w, err)
			return
		}
		customer = globalCustomer
	}
	creatingPartialCustomer := customer == nil
	localizingGlobalCustomer := customer != nil && strings.TrimSpace(customer.ID) == ""
	if creatingPartialCustomer && (customerFirstName == "" || customerLastName == "") {
		writeError(w, badRequest("Completa el nombre y el apellido para crear el registro parcial"))
		return
	}
	if creatingPartialCustomer && customerName == "" {
		writeError(w, badRequest("Escribe el nombre del cliente para crear su registro parcial"))
		return
	}
	if customer != nil {
		customerName = strings.TrimSpace(firstNonEmpty(customer.Name, customerName))
		customer.Name = customerName
	}

	var transferAccount *BankAccount
	if normalizePaymentMethodValue(input.Method) == "bank_transfer" {
		bankAccountID := strings.TrimSpace(firstNonEmpty(input.PaymentBankAccountID, input.PaymentBankAccountCamel, input.BankAccountID, input.BankAccountIDCamel))
		if bankAccountID == "" {
			writeError(w, badRequest("Selecciona la cuenta donde se recibirá la transferencia"))
			return
		}
		account, err := s.queries.GetBankAccount(r.Context(), bankAccountID)
		if err != nil || !account.Active {
			writeError(w, badRequest("La cuenta bancaria seleccionada no está disponible"))
			return
		}
		transferAccount = &account
	}

	if input.DeliveryCost <= 0 && input.DeliveryCostCamel > 0 {
		input.DeliveryCost = input.DeliveryCostCamel
	}
	address := strings.TrimSpace(firstNonEmpty(input.Address, input.DeliveryAddress, input.DeliveryAddressCamel))
	province := strings.TrimSpace(input.Province)
	provinceCode := strings.TrimSpace(firstNonEmpty(input.ProvinceCode, input.ProvinceCodeCamel))
	municipality := strings.TrimSpace(input.Municipality)
	municipalityCode := strings.TrimSpace(firstNonEmpty(input.MunicipalityCode, input.MunicipalityCodeCamel))
	districtCode := strings.TrimSpace(firstNonEmpty(input.DistrictCode, input.DistritoCodeCamel))
	neighborhood := strings.TrimSpace(firstNonEmpty(input.Neighborhood, input.Sector))
	neighborhoodID := strings.TrimSpace(firstNonEmpty(input.NeighborhoodID, input.NeighborhoodIDCamel))
	street := strings.TrimSpace(input.Street)
	streetNumber := onlyDigits(input.StreetNumber)
	structuredAddressProvided := orderMode == "delivery" && (province != "" || provinceCode != "" || municipality != "" || municipalityCode != "" || neighborhood != "" || neighborhoodID != "" || street != "" || streetNumber != "")
	if structuredAddressProvided {
		if province == "" || municipality == "" || neighborhood == "" || street == "" || streetNumber == "" {
			writeError(w, badRequest("Completa la provincia, el municipio o distrito, el barrio, la calle y el número para la entrega"))
			return
		}
		address = strings.TrimSpace(strings.Join([]string{
			strings.TrimSpace(fmt.Sprintf("%s #%s", street, streetNumber)),
			neighborhood,
			municipality,
			province,
		}, ", "))
	}
	rawDeliveryAddress := address
	deliveryCustomer := Customer{}
	if customer != nil {
		deliveryCustomer = *customer
	}
	if structuredAddressProvided {
		deliveryCustomer.Province = province
		deliveryCustomer.ProvinceCode = provinceCode
		deliveryCustomer.Municipality = municipality
		deliveryCustomer.MunicipalityCode = municipalityCode
		deliveryCustomer.DistrictCode = districtCode
		deliveryCustomer.NeighborhoodID = neighborhoodID
		deliveryCustomer.Sector = neighborhood
		deliveryCustomer.Street = street
		deliveryCustomer.StreetNumber = streetNumber
	}
	var deliveryZone DeliveryZone
	if orderMode == "delivery" {
		if address == "" && customer != nil {
			address = customerDeliveryAddressLine(*customer)
		}
		rawDeliveryAddress = address
		if address == "" {
			writeError(w, badRequest("Completa la dirección donde se entregará el pedido"))
			return
		}
		zoneID := strings.TrimSpace(firstNonEmpty(input.DeliveryZoneID, input.DeliveryZoneIDCamel))
		if zoneID != "" {
			selectedZone, zoneErr := s.deliveryZoneByID(r.Context(), input.StoreID, zoneID)
			if zoneErr != nil {
				if errors.Is(zoneErr, pgx.ErrNoRows) || errors.Is(zoneErr, sql.ErrNoRows) {
					writeError(w, badRequest("La zona de entrega seleccionada ya no está disponible"))
					return
				}
				writeError(w, zoneErr)
				return
			}
			if !deliveryZoneMatchesCustomer(selectedZone, deliveryCustomer) {
				writeError(w, badRequest("La dirección indicada no pertenece a la zona de entrega seleccionada"))
				return
			}
			deliveryZone = selectedZone
		} else {
			matchedZone, covered, zoneErr := s.deliveryZoneForCustomer(r.Context(), input.StoreID, deliveryCustomer)
			if zoneErr != nil {
				writeError(w, zoneErr)
				return
			}
			if !covered {
				writeError(w, badRequest("La dirección está fuera de la zona de cobertura. Selecciona otra dirección o crea el pedido para recogida."))
				return
			}
			deliveryZone = matchedZone
		}
		input.DeliveryCost = roundPayableAmount(deliveryZone.DeliveryCost)
		input.Total = roundPayableAmount(input.Subtotal + input.DeliveryCost)
		if deliveryCustomer.Lat != "" && deliveryCustomer.Lng != "" && !strings.Contains(address, "GPS:") {
			address = fmt.Sprintf("%s · GPS: %s, %s", address, deliveryCustomer.Lat, deliveryCustomer.Lng)
		}
		address = strings.TrimSpace(fmt.Sprintf("Modalidad: Entrega · Entrega: RD$ %.0f · %s", input.DeliveryCost, address))
	} else {
		input.DeliveryCost = 0
		input.Total = input.Subtotal
		address = strings.TrimSpace(fmt.Sprintf("Modalidad: Recogida · Retirar en: %s", storePickupAddressLine(store)))
	}
	if transferAccount != nil {
		address = strings.TrimSpace(fmt.Sprintf("%s · Transferencia: %s · Cuenta %s · Titular %s", address, transferAccount.Bank, transferAccount.Number, transferAccount.Holder))
	}
	if orderMode == "delivery" && input.Method == "cash" {
		answered := boolFromPtr(input.CashChangeAnswered) || boolFromPtr(input.CashChangeAnsweredCamel) || input.CashChangeNeeded != nil || input.CashChangeNeededCamel != nil
		if !answered {
			writeError(w, badRequest("Indica si el cliente necesitará cambio"))
			return
		}
		needsChange := boolFromPtr(input.CashChangeNeeded) || boolFromPtr(input.CashChangeNeededCamel)
		changeFrom := firstPositiveNumber(input.CashChangeFrom, input.CashChangeFromCamel, input.CashTenderedAmount, input.CashTenderedAmountCamel)
		if needsChange {
			if changeFrom < input.Total {
				writeError(w, badRequest("Selecciona un monto que cubra el total del pedido"))
				return
			}
			address = strings.TrimSpace(fmt.Sprintf("%s · Cambio: requiere vuelto de RD$ %.0f (vuelto RD$ %.0f)", address, changeFrom, changeFrom-input.Total))
		} else {
			address = strings.TrimSpace(fmt.Sprintf("%s · Cambio: no necesita vuelto (pagará exacto)", address))
		}
	}

	source := strings.ToLower(strings.TrimSpace(firstNonEmpty(input.OrderSource, input.OrderSourceCamel)))
	sourceLabel := "WhatsApp"
	switch source {
	case "phone", "telefono", "teléfono", "llamada", "call":
		source = "phone"
		sourceLabel = "Llamada"
	case "other", "otro", "manual":
		source = "other"
		sourceLabel = "Otro"
	default:
		source = "whatsapp"
		sourceLabel = "WhatsApp"
	}
	address = strings.TrimSpace(fmt.Sprintf("%s · Origen: Pedido asistido · Canal: %s", address, sourceLabel))
	if note := strings.TrimSpace(input.Notes); note != "" {
		address = strings.TrimSpace(fmt.Sprintf("%s · Nota: %s", address, note))
	}

	if input.Method == "store_credit" {
		if creatingPartialCustomer || customer == nil {
			writeError(w, badRequest("El fiado solo está disponible para clientes registrados con crédito habilitado"))
			return
		}
		credit := parseCreditConfig(customer.StoreCredit, input.StoreID)
		if !credit.Enabled || strings.EqualFold(credit.Status, "blocked") {
			writeError(w, badRequest("El crédito fiado no está habilitado para este cliente"))
			return
		}
		debt, err := s.customerDebt(r.Context(), input.StoreID, customer.Name)
		if err != nil {
			writeError(w, err)
			return
		}
		if !strings.EqualFold(credit.Type, "unlimited") && (credit.Limit <= 0 || debt+input.Total > credit.Limit) {
			writeError(w, badRequest("El pedido supera el límite de crédito disponible"))
			return
		}
	}

	date := s.now()
	if input.Date != nil {
		date = *input.Date
	}
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	canonicalItems, canonicalSubtotal, adjustments, err := canonicalSaleItems(r.Context(), tx, input.StoreID, input.Items, true)
	if err != nil {
		writeError(w, err)
		return
	}
	input.Items, input.Subtotal = canonicalItems, canonicalSubtotal
	if orderMode == "delivery" {
		input.Total = roundPayableAmount(input.Subtotal + input.DeliveryCost)
	} else {
		input.Total = input.Subtotal
	}
	qtx := s.queries.WithTx(tx)

	if creatingPartialCustomer || localizingGlobalCustomer {
		storeCredit := map[string]any{input.StoreID: map[string]any{"enabled": false, "type": "limited", "limit": 0, "status": "active"}}
		creditJSON, _ := json.Marshal(storeCredit)
		candidate := deliveryCustomer
		profilePictureURL := strings.TrimSpace(firstNonEmpty(candidate.ProfilePictureURL, whatsappValidation.ProfilePictureURL))
		if profilePictureURL == "" {
			profilePictureURL = s.fetchPlatformWhatsAppAvatarURL(r.Context(), whatsappRaw)
		}
		reference := candidate.AddressReference
		if !structuredAddressProvided {
			reference = firstNonEmpty(reference, rawDeliveryAddress)
		}
		created, err := qtx.CreateCustomer(r.Context(), sqlc.CreateCustomerParams{
			Name:              customerName,
			NationalID:        candidate.NationalID,
			Whatsapp:          firstNonEmpty(candidate.Whatsapp, whatsappRaw),
			WhatsappDisplay:   strings.TrimSpace(firstNonEmpty(candidate.WhatsappDisplay, input.WhatsappDisplay, input.WhatsappDisplayCamel, whatsappValidation.DisplayPhone, whatsappRaw)),
			ProfilePictureURL: profilePictureURL,
			CountryCode:       firstNonEmpty(candidate.CountryCode, input.CountryCode, input.CountryCodeCamel, "do"),
			DialCode:          firstNonEmpty(candidate.DialCode, input.DialCode, input.DialCodeCamel, "+1"),
			PinHash:           candidate.PinHash,
			Province:          firstNonEmpty(candidate.Province, province),
			ProvinceCode:      firstNonEmpty(candidate.ProvinceCode, provinceCode),
			Municipality:      firstNonEmpty(candidate.Municipality, municipality),
			MunicipalityCode:  firstNonEmpty(candidate.MunicipalityCode, municipalityCode),
			DistrictCode:      firstNonEmpty(candidate.DistrictCode, districtCode),
			NeighborhoodID:    firstNonEmpty(candidate.NeighborhoodID, neighborhoodID),
			Sector:            firstNonEmpty(candidate.Sector, neighborhood),
			Street:            firstNonEmpty(candidate.Street, street),
			StreetNumber:      firstNonEmpty(candidate.StreetNumber, streetNumber),
			AddressReference:  reference,
			Lat:               candidate.Lat,
			Lng:               candidate.Lng,
			StoreCredit:       json.RawMessage(creditJSON),
		})
		if err != nil {
			writeError(w, err)
			return
		}
		customer = &created
		customerName = created.Name
	}

	sale, err := qtx.CreateSale(r.Context(), sqlc.CreateSaleParams{
		StoreID:         input.StoreID,
		Items:           input.Items,
		Total:           input.Total,
		Method:          input.Method,
		Customer:        customerName,
		Date:            date,
		CustomerID:      customer.ID,
		DeliveryAddress: address,
		Status:          "pending",
		OrderType:       "customer",
	})
	if err != nil {
		writeError(w, err)
		return
	}
	if err := consumeTrackedBatchesTx(r.Context(), tx, input.StoreID, sale.ID, adjustments); err != nil {
		writeError(w, err)
		return
	}
	if err := applyInventoryAdjustments(r.Context(), tx, input.StoreID, adjustments); err != nil {
		writeError(w, err)
		return
	}
	actor := actorFromContext(r.Context())
	if err := recordInventoryAdjustmentsTx(r.Context(), tx, input.StoreID, "sale", "Pedido asistido registrado", "sale", sale.ID, actor, adjustments, -1); err != nil {
		writeError(w, err)
		return
	}
	if orderMode == "delivery" {
		if err := s.createDeliveryOperation(r.Context(), tx, sale.ID, input.StoreID, deliveryZone.ID, deliveryCustomer.Lat, deliveryCustomer.Lng); err != nil {
			writeError(w, err)
			return
		}
	}
	var createdStoreCredit *StoreCredit
	if input.Method == "store_credit" {
		storeCredit, err := qtx.CreateStoreCredit(r.Context(), sqlc.CreateStoreCreditParams{StoreID: input.StoreID, Customer: customerName, Amount: input.Total, Note: "Pedido asistido", Status: "pending", Type: "charge", Date: date})
		if err != nil {
			writeError(w, err)
			return
		}
		if _, err := tx.Exec(r.Context(), `
			UPDATE store_credits SET customer_id=NULLIF($2,'')::uuid,reference_type='sale',reference_id=$3::uuid,created_by=$4,updated_at=now()
			WHERE id=$1::uuid
		`, storeCredit.ID, customer.ID, sale.ID, actor.ID); err != nil {
			writeError(w, err)
			return
		}
		storeCredit.CustomerID = customer.ID
		storeCredit.RemainingAmount = storeCredit.Amount
		storeCredit.ReferenceType = "sale"
		storeCredit.ReferenceID = sale.ID
		storeCredit.CreatedBy = actor.ID
		createdStoreCredit = &storeCredit
	}
	if err := postSaleAccountingTx(r.Context(), tx, input.StoreID, sale.ID, input.Method, input.Total, input.Items, actor); err != nil {
		writeError(w, err)
		return
	}
	orderDetails := map[string]any{"store_id": input.StoreID, "sale_id": sale.ID, "customer_id": customer.ID, "total": input.Total, "method": input.Method, "order_mode": orderMode, "source": source}
	if err := insertAuditTx(r.Context(), tx, input.StoreID, actor, "order.assisted.created", "sale", sale.ID, orderDetails); err != nil {
		writeError(w, err)
		return
	}
	if err := insertOutboxTx(r.Context(), tx, input.StoreID, "sale", sale.ID, "order.created", orderDetails, "order.created:"+sale.ID); err != nil {
		writeError(w, err)
		return
	}
	if err := insertNotificationTx(r.Context(), tx, input.StoreID, "administrator", "", "order.created", "Nuevo pedido asistido", fmt.Sprintf("Se registró un pedido asistido por RD$ %.2f para %s.", input.Total, customerName), orderDetails); err != nil {
		writeError(w, err)
		return
	}
	if err := insertNotificationTx(r.Context(), tx, input.StoreID, "customer", customer.ID, "order.created", "Pedido registrado", "Tu pedido fue registrado correctamente y está pendiente de confirmación.", orderDetails); err != nil {
		writeError(w, err)
		return
	}
	if err := insertNotificationChannelTx(r.Context(), tx, input.StoreID, "customer", customer.ID, "whatsapp", "order.created", "Pedido registrado", "Tu pedido fue registrado correctamente y está pendiente de confirmación.", orderDetails); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	if orderMode == "delivery" {
		s.syncActiveDeliveryGeoDestination(r.Context(), sale.ID)
	}
	if (creatingPartialCustomer || localizingGlobalCustomer) && customer != nil {
		s.syncGlobalCustomer(r.Context(), *customer)
	}
	products, _ := s.queryProducts(r.Context(), input.StoreID)
	order := saleToOrder(sale)
	if enriched, enrichErr := s.enrichOrdersWithDelivery(r.Context(), []map[string]any{order}, deliveryAudienceAdmin); enrichErr == nil && len(enriched) > 0 {
		order = enriched[0]
	}
	s.invalidateTenantCache(r.Context())
	writeJSON(w, http.StatusCreated, map[string]any{
		"sale":              sale,
		"order":             order,
		"customer":          customer,
		"customer_created":  creatingPartialCustomer,
		"customerCreated":   creatingPartialCustomer,
		"customer_imported": localizingGlobalCustomer,
		"customerImported":  localizingGlobalCustomer,
		"products":          products,
		"store_credit":      createdStoreCredit,
	})
}

func (s *Server) findGlobalCustomerForAssistedOrder(ctx context.Context, phoneDigits string) (*Customer, error) {
	if s.tenantManager == nil || strings.TrimSpace(phoneDigits) == "" {
		return nil, nil
	}
	var customer Customer
	err := s.globalDB().QueryRow(ctx, `
		SELECT name, national_id, COALESCE(birth_date,''), COALESCE(gender,''), whatsapp, whatsapp_display, COALESCE(profile_picture_url,''), country_code, dial_code, pin_hash,
		       province, province_code, municipality, municipality_code, district_code, neighborhood_id, sector, street, street_number, address_reference, lat, lng
		FROM global_customers
		WHERE whatsapp_digits <> ''
		  AND (
			whatsapp_digits = $1
			OR right(whatsapp_digits, 10) = right($1, 10)
			OR right(whatsapp_digits, length($1)) = $1
			OR right($1, length(whatsapp_digits)) = whatsapp_digits
		  )
		ORDER BY updated_at DESC
		LIMIT 1
	`, phoneDigits).Scan(
		&customer.Name, &customer.NationalID, &customer.BirthDate, &customer.Gender, &customer.Whatsapp, &customer.WhatsappDisplay, &customer.ProfilePictureURL,
		&customer.CountryCode, &customer.DialCode, &customer.PinHash, &customer.Province, &customer.ProvinceCode,
		&customer.Municipality, &customer.MunicipalityCode, &customer.DistrictCode, &customer.NeighborhoodID, &customer.Sector,
		&customer.Street, &customer.StreetNumber, &customer.AddressReference, &customer.Lat, &customer.Lng,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	customer.Name = normalizePersonName(customer.Name)
	return &customer, nil
}

func (s *Server) findCustomerByReference(ctx context.Context, customerRef string) (*Customer, error) {
	ref := strings.TrimSpace(customerRef)
	if ref == "" {
		return nil, nil
	}
	customers, err := s.queryCustomers(ctx)
	if err != nil {
		return nil, err
	}
	refLower := strings.ToLower(ref)
	refDigits := onlyDigits(ref)
	for _, c := range customers {
		customer := c
		if strings.EqualFold(customer.ID, ref) || strings.EqualFold(customer.Name, ref) || strings.ToLower(strings.TrimSpace(customer.Name)) == refLower {
			return &customer, nil
		}
		phoneDigits := onlyDigits(customer.Whatsapp)
		if refDigits != "" && phoneDigits != "" && (phoneDigits == refDigits || strings.HasSuffix(phoneDigits, refDigits) || strings.HasSuffix(refDigits, phoneDigits)) {
			return &customer, nil
		}
		if customer.NationalID != "" && refDigits != "" && onlyDigits(customer.NationalID) == refDigits {
			return &customer, nil
		}
	}
	return nil, nil
}

func (s *Server) createStoreCredit(w http.ResponseWriter, r *http.Request) {
	var input struct {
		StoreID  string     `json:"store_id"`
		Customer string     `json:"customer"`
		Amount   float64    `json:"amount"`
		Note     string     `json:"note"`
		Type     string     `json:"type"`
		Date     *time.Time `json:"date"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input.StoreID = strings.TrimSpace(input.StoreID)
	input.Customer = strings.TrimSpace(input.Customer)
	if input.StoreID == "" || input.Customer == "" || input.Amount <= 0 {
		writeError(w, badRequest("Selecciona el cliente e ingresa un monto válido"))
		return
	}
	if normalized := strings.ToLower(strings.TrimSpace(input.Type)); normalized != "" && normalized != "charge" {
		writeError(w, badRequest("Los abonos deben registrarse desde la opción Registrar abono"))
		return
	}
	date := s.now()
	if input.Date != nil {
		date = *input.Date
	}
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	customerID := ""
	_ = tx.QueryRow(r.Context(), `SELECT id::text FROM customers WHERE lower(name)=lower($1) ORDER BY registered_at DESC LIMIT 1`, input.Customer).Scan(&customerID)
	actor := actorFromContext(r.Context())
	var storeCredit StoreCredit
	err = tx.QueryRow(r.Context(), storeCreditSelectSQL(`
		INSERT INTO store_credits (store_id,customer,customer_id,amount,note,status,type,date,reference_type,created_by)
		VALUES ($1::uuid,$2,NULLIF($3,'')::uuid,$4,$5,'pending','charge',$6,'manual',$7)
		RETURNING
	`), input.StoreID, input.Customer, customerID, roundCurrency(input.Amount), strings.TrimSpace(input.Note), date, actor.ID).Scan(storeCreditScanPointers(&storeCredit)...)
	if err != nil {
		writeError(w, err)
		return
	}
	if err := postStoreCreditChargeAccountingTx(r.Context(), tx, input.StoreID, storeCredit.ID, storeCredit.Amount, actor); err != nil {
		writeError(w, err)
		return
	}
	details := map[string]any{"store_id": input.StoreID, "customer": input.Customer, "customer_id": customerID, "amount": storeCredit.Amount, "note": input.Note}
	if err := insertAuditTx(r.Context(), tx, input.StoreID, actor, "store_credit.charge.created", "store_credit", storeCredit.ID, details); err != nil {
		writeError(w, err)
		return
	}
	if err := insertOutboxTx(r.Context(), tx, input.StoreID, "store_credit", storeCredit.ID, "store_credit.charge.created", details, "store_credit.charge:"+storeCredit.ID); err != nil {
		writeError(w, err)
		return
	}
	if err := insertNotificationTx(r.Context(), tx, input.StoreID, "administrator", "", "store_credit.charge.created", "Cargo de fiado registrado", fmt.Sprintf("Se registró un cargo de RD$ %.2f a %s.", storeCredit.Amount, input.Customer), details); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, storeCredit)
}

func (s *Server) createCustomer(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	customer, err := s.insertCustomer(r.Context(), input)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, customer)
}

func (s *Server) updateCustomer(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	customer, err := s.updateReturningCustomer(r.Context(), chi.URLParam(r, "id"), input)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, customer)
}

func (s *Server) deleteCustomer(w http.ResponseWriter, r *http.Request) {
	err := s.queries.DeleteCustomer(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

func (s *Server) listPublicBankAccounts(w http.ResponseWriter, r *http.Request) {
	accounts, err := s.queryPublicBankAccounts(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, accounts)
}

func (s *Server) createBankAccount(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	account, err := s.insertBankAccount(r.Context(), input)
	if err != nil {
		writeError(w, err)
		return
	}
	s.invalidateTenantCache(r.Context())
	s.publishTenantEvent(r.Context(), "bank_accounts_updated", map[string]any{"accountId": account.ID})
	writeJSON(w, http.StatusCreated, account)
}

func (s *Server) updateBankAccount(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	account, err := s.updateReturningBankAccount(r.Context(), chi.URLParam(r, "id"), input)
	if err != nil {
		writeError(w, err)
		return
	}
	s.invalidateTenantCache(r.Context())
	s.publishTenantEvent(r.Context(), "bank_accounts_updated", map[string]any{"accountId": account.ID})
	writeJSON(w, http.StatusOK, account)
}

func (s *Server) deleteBankAccount(w http.ResponseWriter, r *http.Request) {
	accountID := chi.URLParam(r, "id")
	err := s.queries.DeleteBankAccount(r.Context(), accountID)
	if err != nil {
		writeError(w, err)
		return
	}
	s.invalidateTenantCache(r.Context())
	s.publishTenantEvent(r.Context(), "bank_accounts_updated", map[string]any{"accountId": accountID})
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

func (s *Server) createCashHistory(w http.ResponseWriter, r *http.Request) {
	var input struct {
		StoreID string          `json:"store_id"`
		Opening json.RawMessage `json:"opening"`
		Closing json.RawMessage `json:"closing"`
		Summary json.RawMessage `json:"summary"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if input.StoreID == "" {
		writeError(w, badRequest("Debes seleccionar el negocio"))
		return
	}
	if len(input.Opening) == 0 {
		input.Opening = json.RawMessage("{}")
	}
	if len(input.Closing) == 0 {
		input.Closing = json.RawMessage("{}")
	}
	if len(input.Summary) == 0 {
		input.Summary = json.RawMessage("{}")
	}
	cash, err := s.queries.CreateCashHistory(r.Context(), sqlc.CreateCashHistoryParams{
		StoreID: input.StoreID,
		Opening: input.Opening,
		Closing: input.Closing,
		Summary: input.Summary,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, cash)
}

type customerIDContextKey struct{}

func (s *Server) clientValidateWhatsAppNumber(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Phone    string `json:"phone"`
		Whatsapp string `json:"whatsapp"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}

	phone := strings.TrimSpace(firstNonEmpty(input.Phone, input.Whatsapp))
	normalized := normalizePlatformWhatsAppPhone(phone)
	if normalized == "" || len(normalized) < 11 {
		writeJSON(w, http.StatusOK, map[string]any{
			"valid":         false,
			"has_whatsapp":  false,
			"phone":         normalized,
			"display_phone": formatPlatformWhatsAppPhone(normalized),
			"message":       "Completa un número de WhatsApp válido para poder verificarlo.",
		})
		return
	}

	result, err := s.checkPlatformWhatsAppNumber(r.Context(), phone)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) clientLookup(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Whatsapp string `json:"whatsapp"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	phone := onlyDigits(input.Whatsapp)
	if len(phone) < 10 {
		writeError(w, badRequest("Ingresa un WhatsApp válido"))
		return
	}

	customers, err := s.queryCustomers(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	for _, c := range customers {
		stored := onlyDigits(c.Whatsapp)
		if stored != "" && (stored == phone || strings.HasSuffix(stored, phone) || strings.HasSuffix(phone, stored)) {
			if strings.TrimSpace(c.PinHash) == "" {
				writeJSON(w, http.StatusOK, map[string]any{
					"exists":      false,
					"partial":     true,
					"accountType": "Cliente",
					"role":        "customer",
					"message":     "Encontramos un registro parcial. Completa tus datos para activar tu cuenta.",
				})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"exists": true, "accountType": "Cliente", "role": "customer"})
			return
		}
	}

	var staffRole string
	err = s.db.QueryRow(r.Context(), `
		SELECT role
		FROM system_users
		WHERE active=true
		  AND lower(trim(role)) IN ('administrator','cashier','delivery_driver')
		  AND regexp_replace(COALESCE(whatsapp,''), '\D', '', 'g') <> ''
		  AND (
			regexp_replace(whatsapp, '\D', '', 'g') = $1
			OR right(regexp_replace(whatsapp, '\D', '', 'g'), 10) = right($1, 10)
			OR right(regexp_replace(whatsapp, '\D', '', 'g'), length($1)) = $1
			OR right($1, length(regexp_replace(whatsapp, '\D', '', 'g'))) = regexp_replace(whatsapp, '\D', '', 'g')
		  )
		ORDER BY CASE lower(trim(role))
				WHEN 'administrator' THEN 1
				WHEN 'cashier' THEN 2
				WHEN 'delivery_driver' THEN 3
				ELSE 4 END,
			updated_at DESC
		LIMIT 1
	`, phone).Scan(&staffRole)
	if err == nil {
		staffRole = normalizeStaffRole(staffRole)
		writeJSON(w, http.StatusOK, map[string]any{"exists": true, "accountType": roleLabel(staffRole), "role": staffRole})
		return
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, err)
		return
	}

	var adminProfileFound bool
	err = s.db.QueryRow(r.Context(), `
		SELECT EXISTS(
			SELECT 1
			FROM admin_profiles
			WHERE COALESCE(password_hash,'') <> ''
			  AND (
				(
					regexp_replace(username, '\D', '', 'g') <> ''
					AND (
						regexp_replace(username, '\D', '', 'g') = $1
						OR right(regexp_replace(username, '\D', '', 'g'), 10) = right($1, 10)
						OR right(regexp_replace(username, '\D', '', 'g'), length($1)) = $1
						OR right($1, length(regexp_replace(username, '\D', '', 'g'))) = regexp_replace(username, '\D', '', 'g')
					)
				)
				OR (
					regexp_replace(whatsapp, '\D', '', 'g') <> ''
					AND (
						regexp_replace(whatsapp, '\D', '', 'g') = $1
						OR right(regexp_replace(whatsapp, '\D', '', 'g'), 10) = right($1, 10)
						OR right(regexp_replace(whatsapp, '\D', '', 'g'), length($1)) = $1
						OR right($1, length(regexp_replace(whatsapp, '\D', '', 'g'))) = regexp_replace(whatsapp, '\D', '', 'g')
					)
				)
			  )
		)
	`, phone).Scan(&adminProfileFound)
	if err != nil {
		writeError(w, err)
		return
	}
	if adminProfileFound {
		writeJSON(w, http.StatusOK, map[string]any{"exists": true, "accountType": "Administrador", "role": "administrator"})
		return
	}

	if s.tenantManager != nil {
		currentTenantID := tenantIDFromContext(r.Context())
		if currentTenantID != "" {
			var ownerFound bool
			err := s.tenantManager.CoreDB().QueryRow(r.Context(), `
				SELECT EXISTS(
					SELECT 1
					FROM tenants t
					JOIN platform_owners o ON o.id=t.owner_id
					WHERE t.id=$1::uuid
					  AND t.status IN ('active','trial')
					  AND o.status='active'
					  AND o.whatsapp_digits <> ''
					  AND (
						o.whatsapp_digits = $2
						OR right(o.whatsapp_digits, 10) = right($2, 10)
						OR right(o.whatsapp_digits, length($2)) = $2
						OR right($2, length(o.whatsapp_digits)) = o.whatsapp_digits
					  )
				)
			`, currentTenantID, phone).Scan(&ownerFound)
			if err != nil {
				writeError(w, err)
				return
			}
			if ownerFound {
				writeJSON(w, http.StatusOK, map[string]any{"exists": true, "accountType": "Administrador", "role": "administrator", "scope": "owner"})
				return
			}
		}
		var globalID, globalPinHash string
		err := s.globalDB().QueryRow(r.Context(), `
			SELECT id::text, COALESCE(pin_hash,'')
			FROM global_customers
			WHERE whatsapp_digits <> ''
			  AND (
				whatsapp_digits = $1
				OR right(whatsapp_digits, 10) = right($1, 10)
				OR right(whatsapp_digits, length($1)) = $1
				OR right($1, length(whatsapp_digits)) = whatsapp_digits
			  )
			ORDER BY updated_at DESC
			LIMIT 1
		`, phone).Scan(&globalID, &globalPinHash)
		if err == nil && globalID != "" {
			if strings.TrimSpace(globalPinHash) == "" {
				writeJSON(w, http.StatusOK, map[string]any{
					"exists":      false,
					"partial":     true,
					"accountType": "Cliente",
					"role":        "customer",
					"scope":       "global",
					"message":     "Encontramos un registro parcial. Completa tus datos para activar tu cuenta.",
				})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"exists": true, "accountType": "Cliente", "role": "customer", "scope": "global"})
			return
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			writeError(w, err)
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"exists": false, "accountType": "", "role": ""})
}

func (s *Server) clientRegister(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if !boolFromAny(input["terms_accepted"], false) || !boolFromAny(input["privacy_accepted"], false) {
		writeError(w, badRequest("Debes aceptar los términos y la política de privacidad para crear tu cuenta"))
		return
	}
	pin := strings.TrimSpace(str(input, "pin"))
	if !s.validNewCustomerAccessPIN(r.Context(), pin) {
		writeError(w, badRequest(fmt.Sprintf("Define un PIN de %d dígitos", s.customerAccessPINLength(r.Context()))))
		return
	}
	whatsapp := strings.TrimSpace(str(input, "whatsapp"))
	newPhone := onlyDigits(whatsapp)
	if len(newPhone) < 10 {
		writeError(w, badRequest("Ingresa un WhatsApp válido"))
		return
	}
	validation, err := s.validatePlatformWhatsAppNumberForSave(r.Context(), whatsapp)
	if err != nil {
		writeError(w, err)
		return
	}
	if validation.ProfilePictureURL != "" {
		input["profile_picture_url"] = validation.ProfilePictureURL
	}
	nationalID := normalizeNationalID(str(input, "national_id"))
	if nationalID == "" {
		writeError(w, badRequest("La cédula es requerida"))
		return
	}
	if !validDominicanNationalID(nationalID) {
		writeError(w, badRequest("Ingresa una cédula dominicana válida"))
		return
	}
	firstName := normalizePersonName(str(input, "name"))
	lastName := normalizePersonName(str(input, "last_name"))
	birthDate := normalizePersonBirthDate(strEither(input, "birth_date", "birthDate"))
	gender := normalizePersonGender(str(input, "gender"))
	firstName, lastName, birthDate, gender, err = s.verifyClientIdentityForRegistration(
		r.Context(),
		nationalID,
		firstName,
		lastName,
		birthDate,
		gender,
		requestTraceID(r),
		identityDeviceKeyFromRequest(r),
	)
	if err != nil {
		writeError(w, err)
		return
	}
	if err := validatePersonDemographics(birthDate, gender); err != nil {
		writeError(w, err)
		return
	}
	name := normalizePersonName(strings.Join([]string{firstName, lastName}, " "))
	if name == "" {
		writeError(w, badRequest("El nombre del cliente es requerido"))
		return
	}

	customers, err := s.queryCustomers(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	var partialLocal *Customer
	for _, c := range customers {
		existingPhone := onlyDigits(c.Whatsapp)
		phoneMatches := existingPhone != "" && (existingPhone == newPhone || strings.HasSuffix(existingPhone, newPhone) || strings.HasSuffix(newPhone, existingPhone))
		if phoneMatches {
			if strings.TrimSpace(c.PinHash) != "" {
				writeError(w, apiError{status: http.StatusConflict, msg: "Ya existe un cliente con ese WhatsApp. Ingresa tu WhatsApp y PIN para entrar."})
				return
			}
			cc := c
			partialLocal = &cc
		}
	}
	partialLocalID := ""
	if partialLocal != nil {
		partialLocalID = partialLocal.ID
	}
	if err := s.ensureNationalIDAvailable(r.Context(), nationalID, "customers", partialLocalID); err != nil {
		writeError(w, err)
		return
	}

	if s.tenantManager != nil {
		var globalID, globalPinHash, globalPhoneDigits, globalNationalIDDigits string
		err := s.globalDB().QueryRow(r.Context(), `
			SELECT id::text, COALESCE(pin_hash,''), COALESCE(whatsapp_digits,''), COALESCE(national_id_digits,'')
			FROM global_customers
			WHERE ($1 <> '' AND national_id_digits = $1)
			   OR ($2 <> '' AND whatsapp_digits <> '' AND (
				whatsapp_digits = $2
				OR right(whatsapp_digits, 10) = right($2, 10)
				OR right(whatsapp_digits, length($2)) = $2
				OR right($2, length(whatsapp_digits)) = whatsapp_digits
			   ))
			ORDER BY updated_at DESC
			LIMIT 1
		`, onlyDigits(nationalID), newPhone).Scan(&globalID, &globalPinHash, &globalPhoneDigits, &globalNationalIDDigits)
		if err == nil && globalID != "" {
			phoneMatches := globalPhoneDigits != "" && (globalPhoneDigits == newPhone || strings.HasSuffix(globalPhoneDigits, newPhone) || strings.HasSuffix(newPhone, globalPhoneDigits))
			nationalIDMatches := globalNationalIDDigits == "" || globalNationalIDDigits == onlyDigits(nationalID)
			claimablePartial := phoneMatches && nationalIDMatches && strings.TrimSpace(globalPinHash) == ""
			if !claimablePartial {
				writeError(w, apiError{status: http.StatusConflict, msg: "Este cliente ya existe en WAMERCIO. Ingresa tu WhatsApp y PIN para entrar a este negocio."})
				return
			}
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			writeError(w, err)
			return
		}
	}

	stores, err := s.queryStores(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	if len(stores) == 0 {
		created, err := s.insertDefaultStore(r.Context())
		if err != nil {
			writeError(w, err)
			return
		}
		stores = []Store{created}
	}
	store := stores[0]
	s.applyStoreDeliveryScopeToCustomer(input, store)
	if err := s.ensureCustomerSubmittedNeighborhood(r.Context(), input, store); err != nil {
		writeError(w, err)
		return
	}
	if err := validateTerritoryAddressInput(input); err != nil {
		writeError(w, err)
		return
	}
	storeID := store.ID
	storeCredit := map[string]any{storeID: map[string]any{"enabled": false, "type": "limited", "limit": 0, "status": "active"}}
	if partialLocal != nil && len(partialLocal.StoreCredit) > 0 {
		var current map[string]any
		if json.Unmarshal(partialLocal.StoreCredit, &current) == nil && current != nil {
			storeCredit = current
		}
	}
	creditJSON, _ := json.Marshal(storeCredit)

	input["name"] = name
	input["national_id"] = nationalID
	input["birth_date"] = birthDate
	input["gender"] = gender
	input["whatsapp"] = whatsapp
	input["whatsapp_display"] = firstNonEmpty(str(input, "whatsappDisplay"), whatsapp)
	input["country_code"] = strDefault(input, "countryCode", "do")
	input["dial_code"] = strDefault(input, "dialCode", "+1")
	pinHash, err := hashAccessSecret(pin)
	if err != nil {
		writeError(w, err)
		return
	}
	input["pin_hash"] = pinHash
	normalizeTerritoryAddressInput(input)
	input["store_credit"] = json.RawMessage(creditJSON)

	var customer Customer
	if partialLocal != nil {
		customer, err = s.updateReturningCustomer(r.Context(), partialLocal.ID, input)
	} else {
		customer, err = s.insertCustomer(r.Context(), input)
	}
	if err != nil {
		writeError(w, err)
		return
	}
	token, err := s.issueCustomerToken(r.Context(), customer.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	s.setSessionCookie(w, clientSessionCookie, token, 12*time.Hour)
	s.syncGlobalCustomer(r.Context(), customer)
	if err := s.recordCustomerLegalAcceptances(r.Context(), customer, r); err != nil {
		writeError(w, err)
		return
	}
	profile, err := s.buildClientProfile(r.Context(), customer, storeID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"token": "cookie", "client": profile, "completed_partial_registration": partialLocal != nil, "legal_version": currentLegalDocumentVersion})
}

func (s *Server) clientLogin(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Whatsapp string `json:"whatsapp"`
		Pin      string `json:"pin"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	phone := onlyDigits(input.Whatsapp)
	pin := strings.TrimSpace(input.Pin)
	failureKey := s.authFailureKey(r, "client", phone)
	if s.authLocked(r.Context(), failureKey) {
		s.rejectLockedAuthentication(w)
		return
	}
	fail := func() {
		s.recordAuthenticationFailure(r.Context(), failureKey)
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "WhatsApp o PIN incorrecto. Verifica tus datos."})
	}
	if !s.supportedCustomerAccessPIN(r.Context(), pin) {
		fail()
		return
	}
	customers, err := s.queryCustomers(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	var found *Customer
	for _, c := range customers {
		stored := onlyDigits(c.Whatsapp)
		if stored == "" || c.PinHash == "" || !(stored == phone || strings.HasSuffix(stored, phone) || strings.HasSuffix(phone, stored)) {
			continue
		}
		valid, upgrade := verifyAccessSecret(c.PinHash, pin)
		if !valid {
			continue
		}
		cc := c
		if upgrade {
			modernHash, hashErr := hashAccessSecret(pin)
			if hashErr != nil {
				writeError(w, hashErr)
				return
			}
			_, _ = s.db.Exec(r.Context(), `UPDATE customers SET pin_hash=$2 WHERE id=$1::uuid`, c.ID, modernHash)
			cc.PinHash = modernHash
			s.syncGlobalCustomer(r.Context(), cc)
		}
		found = &cc
		break
	}
	stores, err := s.queryStores(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	storeID := ""
	if len(stores) > 0 {
		storeID = stores[0].ID
	}
	if found == nil {
		globalCustomer, err := s.createLocalCustomerFromGlobal(r.Context(), phone, pin, storeID)
		if err != nil {
			writeError(w, err)
			return
		}
		found = globalCustomer
	}
	if found == nil {
		fail()
		return
	}
	token, err := s.issueCustomerToken(r.Context(), found.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	s.clearAuthenticationFailures(r.Context(), failureKey)
	s.setSessionCookie(w, clientSessionCookie, token, 12*time.Hour)
	profile, err := s.buildClientProfile(r.Context(), *found, storeID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": "cookie", "client": profile})
}

func (s *Server) clientSession(w http.ResponseWriter, r *http.Request) {
	customer, err := s.customerFromRequest(r)
	if err != nil {
		writeError(w, err)
		return
	}
	stores, _ := s.queryStores(r.Context())
	storeID := ""
	if len(stores) > 0 {
		storeID = stores[0].ID
	}
	profile, err := s.buildClientProfile(r.Context(), customer, storeID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"authenticated": true, "client": profile})
}

func (s *Server) updateClientProfile(w http.ResponseWriter, r *http.Request) {
	customer, err := s.customerFromRequest(r)
	if err != nil {
		writeError(w, err)
		return
	}
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	updates := map[string]any{}
	firstName := strings.TrimSpace(str(input, "name"))
	lastName := strings.TrimSpace(str(input, "last_name"))
	name := strings.TrimSpace(strings.Join([]string{firstName, lastName}, " "))
	if name != "" {
		updates["name"] = name
	}
	if pin := strings.TrimSpace(str(input, "pin")); pin != "" {
		if !s.validNewCustomerAccessPIN(r.Context(), pin) {
			writeError(w, badRequest(accessPINLengthMessage(s.customerAccessPINLength(r.Context()))))
			return
		}
		pinHash, err := hashAccessSecret(pin)
		if err != nil {
			writeError(w, err)
			return
		}
		updates["pin_hash"] = pinHash
	}
	if dirs, ok := input["addresses"].([]any); ok && len(dirs) > 0 {
		principal, _ := dirs[0].(map[string]any)
		for _, raw := range dirs {
			if d, ok := raw.(map[string]any); ok && boolFromAny(d["isPrincipal"], false) {
				principal = d
				break
			}
		}
		if principal == nil {
			writeError(w, badRequest("Selecciona una dirección principal válida"))
			return
		}
		if stores, storeErr := s.queryStores(r.Context()); storeErr == nil && len(stores) > 0 {
			s.applyStoreDeliveryScopeToCustomer(principal, stores[0])
			if err := s.ensureCustomerSubmittedNeighborhood(r.Context(), principal, stores[0]); err != nil {
				writeError(w, err)
				return
			}
		}
		updates["province"] = firstNonEmpty(fmt.Sprint(principal["province"]))
		updates["province_code"] = firstNonEmpty(fmt.Sprint(principal["provinceCode"]), fmt.Sprint(principal["province_code"]))
		updates["municipality"] = firstNonEmpty(fmt.Sprint(principal["municipality"]))
		updates["municipality_code"] = firstNonEmpty(fmt.Sprint(principal["municipalityCode"]), fmt.Sprint(principal["municipality_code"]))
		updates["district_code"] = firstNonEmpty(fmt.Sprint(principal["districtCode"]), fmt.Sprint(principal["district_code"]))
		updates["neighborhood_id"] = firstNonEmpty(fmt.Sprint(principal["neighborhoodId"]), fmt.Sprint(principal["neighborhood_id"]))
		updates["sector"] = strings.TrimSpace(firstNonEmpty(fmt.Sprint(principal["sector"]), fmt.Sprint(principal["neighborhood"])))
		updates["street"] = firstNonEmpty(fmt.Sprint(principal["street"]))
		updates["street_number"] = onlyDigits(firstNonEmpty(fmt.Sprint(principal["street_number"])))
		updates["address_reference"] = firstNonEmpty(fmt.Sprint(principal["address_reference"]))
		updates["lat"] = firstNonEmpty(fmt.Sprint(principal["lat"]))
		updates["lng"] = firstNonEmpty(fmt.Sprint(principal["lng"]))
	}
	updated, err := s.updateReturningCustomer(r.Context(), customer.ID, updates)
	if err != nil {
		writeError(w, err)
		return
	}
	s.syncGlobalCustomer(r.Context(), updated)
	if _, changedPIN := updates["pin_hash"]; changedPIN {
		s.propagateCustomerPINAcrossTenants(r.Context(), updated.Whatsapp, updated.PinHash)
	}
	stores, _ := s.queryStores(r.Context())
	storeID := ""
	if len(stores) > 0 {
		storeID = stores[0].ID
	}
	profile, err := s.buildClientProfile(r.Context(), updated, storeID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"client": profile})
}

func (s *Server) resolveClientCartStoreID(ctx context.Context, requested string) (string, error) {
	requested = strings.TrimSpace(requested)
	stores, err := s.queryStores(ctx)
	if err != nil {
		return "", err
	}
	if len(stores) == 0 {
		return "", badRequest("No hay negocio configurado para sincronizar la funda")
	}
	if requested == "" {
		return stores[0].ID, nil
	}
	for _, store := range stores {
		if store.ID == requested {
			return requested, nil
		}
	}
	return "", badRequest("El negocio seleccionado para la funda no existe")
}

func sanitizeCartItems(raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return json.RawMessage("[]"), nil
	}
	var items []map[string]any
	if err := json.Unmarshal(raw, &items); err != nil {
		return nil, badRequest("La funda no tiene un formato válido")
	}
	if len(items) > 150 {
		return nil, badRequest("La funda supera el límite permitido")
	}
	clean := make([]map[string]any, 0, len(items))
	for _, item := range items {
		id := itemText(item, "id", "product_id", "productId")
		if id == "" {
			continue
		}
		weighted := boolFromAny(firstNonNil(item["weighted_sale_enabled"], item["weightedSaleEnabled"]), strings.EqualFold(itemText(item, "format"), "Libra"))
		mode := strings.ToLower(itemText(item, "sale_mode", "saleMode"))
		if mode == "monto" {
			mode = "amount"
		}
		if mode == "peso" || mode == "libra" {
			mode = "weight"
		}
		if !weighted {
			mode = "unit"
		}
		if weighted && mode != "amount" && mode != "weight" {
			mode = "weight"
		}

		minimumWeight := defaultMinimumWeight
		weightIncrement := defaultWeightIncrement
		minimumAmount := defaultMinimumAmount
		weightPrecision := defaultWeightPrecision

		qty := itemNumber(item, "quantity", "requested_weight", "requestedWeight", "estimated_weight", "estimatedWeight")
		if weighted {
			if mode == "amount" {
				qty = roundDecimal(math.Max(0.01, qty), defaultWeightPrecision)
			} else {
				qty = normalizeRequestedWeight(qty, minimumWeight, weightIncrement)
			}
		} else {
			qty = math.Min(999, math.Max(1, math.Floor(qty)))
		}

		price := roundCurrency(itemNumber(item, "price", "unit_price", "unitPrice"))
		minimumAmount = minimumAmountForUnitPrice(price)
		requestedAmount := roundPayableAmount(itemNumber(item, "requested_amount", "requestedAmount", "line_total", "lineTotal"))
		lineTotal := requestedAmount
		weightIsExact := true
		if weighted {
			if mode == "amount" {
				requestedAmount = math.Max(minimumAmount, requestedAmount)
				lineTotal = requestedAmount
				if price > 0 {
					qty, weightIsExact = amountWeightBreakdown(
						requestedAmount,
						price,
						minimumWeight,
						weightIncrement,
					)
				} else {
					weightIsExact = false
				}
			} else {
				lineTotal = roundPayableAmount(price * qty)
				requestedAmount = lineTotal
			}
		} else {
			lineTotal = roundCurrency(price * qty)
			requestedAmount = lineTotal
		}

		unit := "unidad"
		if weighted {
			unit = defaultWeightUnit
		}
		key := firstNonEmpty(itemText(item, "cart_key", "cartKey"), id+":"+mode)
		clean = append(clean, map[string]any{
			"id":                    id,
			"store_id":              itemText(item, "store_id", "storeId"),
			"storeId":               itemText(item, "store_id", "storeId"),
			"name":                  itemText(item, "name"),
			"description":           itemText(item, "description"),
			"category":              itemText(item, "category"),
			"brand":                 itemText(item, "brand"),
			"format":                itemText(item, "format"),
			"image":                 itemText(item, "image"),
			"price":                 price,
			"unit_price":            price,
			"unitPrice":             price,
			"quantity":              qty,
			"sale_mode":             mode,
			"saleMode":              mode,
			"unit":                  unit,
			"requested_amount":      requestedAmount,
			"requestedAmount":       requestedAmount,
			"requested_weight":      qty,
			"requestedWeight":       qty,
			"estimated_weight":      qty,
			"estimatedWeight":       qty,
			"weight_is_exact":       weightIsExact,
			"weightIsExact":         weightIsExact,
			"line_total":            lineTotal,
			"lineTotal":             lineTotal,
			"cart_key":              key,
			"cartKey":               key,
			"weighted_sale_enabled": weighted,
			"weightedSaleEnabled":   weighted,
			"allow_weight_sales":    weighted,
			"allowWeightSales":      weighted,
			"allow_amount_sales":    weighted,
			"allowAmountSales":      weighted,
			"weight_unit":           unit,
			"weightUnit":            unit,
			"minimum_weight":        minimumWeight,
			"minimumWeight":         minimumWeight,
			"weight_increment":      weightIncrement,
			"weightIncrement":       weightIncrement,
			"minimum_amount":        minimumAmount,
			"minimumAmount":         minimumAmount,
			"weight_precision":      weightPrecision,
			"weightPrecision":       weightPrecision,
		})
	}
	encoded, _ := json.Marshal(clean)
	return json.RawMessage(encoded), nil
}

func firstNonNil(values ...any) any {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

func (s *Server) clientCart(w http.ResponseWriter, r *http.Request) {
	customerID, _ := r.Context().Value(customerIDContextKey{}).(string)
	storeID, err := s.resolveClientCartStoreID(r.Context(), r.URL.Query().Get("store_id"))
	if err != nil {
		writeError(w, err)
		return
	}
	items := json.RawMessage("[]")
	var updatedAt *time.Time
	var dbItems []byte
	var dbUpdated time.Time
	err = s.db.QueryRow(r.Context(), `SELECT items, updated_at FROM client_carts WHERE customer_id=$1 AND store_id=$2`, customerID, storeID).Scan(&dbItems, &dbUpdated)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, err)
		return
	}
	if err == nil {
		items = json.RawMessage(dbItems)
		updatedAt = &dbUpdated
	}
	writeJSON(w, http.StatusOK, map[string]any{"store_id": storeID, "items": items, "updatedAt": updatedAt})
}

func (s *Server) updateClientCart(w http.ResponseWriter, r *http.Request) {
	customerID, _ := r.Context().Value(customerIDContextKey{}).(string)
	var input struct {
		StoreID string          `json:"store_id"`
		Items   json.RawMessage `json:"items"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	storeID, err := s.resolveClientCartStoreID(r.Context(), input.StoreID)
	if err != nil {
		writeError(w, err)
		return
	}
	items, err := sanitizeCartItems(input.Items)
	if err != nil {
		writeError(w, err)
		return
	}
	var updatedAt time.Time
	err = s.db.QueryRow(r.Context(), `
		INSERT INTO client_carts (customer_id, store_id, items, updated_at)
		VALUES ($1, $2, $3::jsonb, now())
		ON CONFLICT (customer_id, store_id) DO UPDATE SET items=EXCLUDED.items, updated_at=now()
		RETURNING updated_at
	`, customerID, storeID, string(items)).Scan(&updatedAt)
	if err != nil {
		writeError(w, err)
		return
	}
	s.publishTenantEvent(r.Context(), "cart_updated", map[string]any{"storeId": storeID, "customerId": customerID})
	writeJSON(w, http.StatusOK, map[string]any{"store_id": storeID, "items": items, "updatedAt": updatedAt})
}

func (s *Server) clearClientCart(w http.ResponseWriter, r *http.Request) {
	customerID, _ := r.Context().Value(customerIDContextKey{}).(string)
	storeID, err := s.resolveClientCartStoreID(r.Context(), r.URL.Query().Get("store_id"))
	if err != nil {
		writeError(w, err)
		return
	}
	var updatedAt time.Time
	err = s.db.QueryRow(r.Context(), `
		INSERT INTO client_carts (customer_id, store_id, items, updated_at)
		VALUES ($1, $2, '[]'::jsonb, now())
		ON CONFLICT (customer_id, store_id) DO UPDATE SET items='[]'::jsonb, updated_at=now()
		RETURNING updated_at
	`, customerID, storeID).Scan(&updatedAt)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"store_id": storeID, "items": json.RawMessage("[]"), "updatedAt": updatedAt})
}

func (s *Server) clientOrders(w http.ResponseWriter, r *http.Request) {
	customerID, _ := r.Context().Value(customerIDContextKey{}).(string)
	orders, err := s.queryClientOrders(r.Context(), customerID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, orders)
}

func (s *Server) createClientOrder(w http.ResponseWriter, r *http.Request) {
	customer, err := s.customerFromRequest(r)
	if err != nil {
		writeError(w, err)
		return
	}
	idempotencyKey, err := orderIdempotencyKey(r)
	if err != nil {
		writeError(w, err)
		return
	}
	var input struct {
		StoreID                 string          `json:"store_id"`
		Items                   json.RawMessage `json:"items"`
		Subtotal                float64         `json:"subtotal"`
		DeliveryCost            float64         `json:"delivery_cost"`
		DeliveryCostCamel       float64         `json:"deliveryCost"`
		Total                   float64         `json:"total"`
		Method                  string          `json:"method"`
		PaymentBankAccountID    string          `json:"payment_bank_account_id"`
		PaymentBankAccountCamel string          `json:"paymentBankAccountId"`
		BankAccountID           string          `json:"bank_account_id"`
		BankAccountIDCamel      string          `json:"bankAccountId"`
		OrderMode               string          `json:"order_mode"`
		OrderModeCamel          string          `json:"orderMode"`
		DeliveryZoneID          string          `json:"delivery_zone_id"`
		DeliveryZoneIDCamel     string          `json:"deliveryZoneId"`
		CashChangeNeeded        *bool           `json:"cash_change_needed"`
		CashChangeNeededCamel   *bool           `json:"cashChangeNeeded"`
		CashChangeAnswered      *bool           `json:"cash_change_answered"`
		CashChangeAnsweredCamel *bool           `json:"cashChangeAnswered"`
		CashChangeFrom          float64         `json:"cash_change_from"`
		CashChangeFromCamel     float64         `json:"cashChangeFrom"`
		CashTenderedAmount      float64         `json:"cash_tendered_amount"`
		CashTenderedAmountCamel float64         `json:"cashTenderedAmount"`
		Address                 string          `json:"address"`
		Date                    *time.Time      `json:"date"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if input.StoreID == "" {
		stores, err := s.queryStores(r.Context())
		if err != nil || len(stores) == 0 {
			writeError(w, badRequest("No hay negocio configurado para registrar el pedido"))
			return
		}
		input.StoreID = stores[0].ID
	}
	// Dates are assigned by the client for display, but a retry may generate a
	// new timestamp. Excluding it keeps the same business request replayable.
	requestDate := input.Date
	input.Date = nil
	requestHash := orderRequestHash(customer.ID, input)
	input.Date = requestDate
	existingOrderID, replay, err := lookupCompletedOrderIdempotency(r.Context(), s.db, customer.ID, input.StoreID, idempotencyKey, requestHash)
	if err != nil {
		writeError(w, err)
		return
	}
	if replay {
		s.writeClientOrderReplay(w, r, customer, input.StoreID, existingOrderID)
		return
	}
	if len(input.Items) == 0 || string(input.Items) == "null" {
		writeError(w, badRequest("El pedido no tiene productos"))
		return
	}
	input.Method, err = validateOfflinePaymentMethod(input.Method)
	if err != nil {
		writeError(w, err)
		return
	}
	store, err := s.queries.GetStore(r.Context(), input.StoreID)
	if err != nil {
		writeError(w, err)
		return
	}
	if !storePaymentMethodEnabled(store, input.Method) {
		writeError(w, badRequest("El método de pago seleccionado no está disponible para este negocio"))
		return
	}
	var transferAccount *BankAccount
	if normalizePaymentMethodValue(input.Method) == "bank_transfer" {
		bankAccountID := strings.TrimSpace(firstNonEmpty(input.PaymentBankAccountID, input.PaymentBankAccountCamel, input.BankAccountID, input.BankAccountIDCamel))
		if bankAccountID == "" {
			writeError(w, badRequest("Selecciona una cuenta bancaria para realizar la transferencia"))
			return
		}
		account, err := s.queries.GetBankAccount(r.Context(), bankAccountID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, sql.ErrNoRows) {
				writeError(w, badRequest("La cuenta bancaria seleccionada no está disponible"))
				return
			}
			writeError(w, err)
			return
		}
		if !account.Active {
			writeError(w, badRequest("La cuenta bancaria seleccionada está inactiva"))
			return
		}
		transferAccount = &account
	}
	orderMode := normalizeOrderModeValue(firstNonEmpty(input.OrderMode, input.OrderModeCamel))
	if orderMode == "" {
		writeError(w, badRequest("Selecciona si deseas entrega o recogida antes de confirmar el pedido"))
		return
	}
	if !storeOrderModes(store).enabled(orderMode) {
		writeError(w, badRequest("La modalidad seleccionada no está disponible para este negocio"))
		return
	}
	canonicalItems, canonicalSubtotal, _, err := canonicalSaleItems(r.Context(), s.db, input.StoreID, input.Items, false)
	if err != nil {
		if s.replayCompletedOrderIfAvailable(w, r, customer, input.StoreID, idempotencyKey, requestHash) {
			return
		}
		writeError(w, err)
		return
	}
	input.Items, input.Subtotal = canonicalItems, canonicalSubtotal
	if input.DeliveryCost <= 0 && input.DeliveryCostCamel > 0 {
		input.DeliveryCost = input.DeliveryCostCamel
	}
	var deliveryZone DeliveryZone
	switch orderMode {
	case "delivery":
		deliveryLat := strings.TrimSpace(customer.Lat)
		deliveryLng := strings.TrimSpace(customer.Lng)
		zoneID := strings.TrimSpace(firstNonEmpty(input.DeliveryZoneID, input.DeliveryZoneIDCamel))
		if zoneID != "" {
			selectedZone, zoneErr := s.deliveryZoneByID(r.Context(), input.StoreID, zoneID)
			if zoneErr != nil {
				if errors.Is(zoneErr, pgx.ErrNoRows) || errors.Is(zoneErr, sql.ErrNoRows) {
					writeError(w, badRequest("La zona de entrega seleccionada ya no está disponible"))
					return
				}
				writeError(w, zoneErr)
				return
			}
			if !deliveryZoneMatchesCustomer(selectedZone, customer) {
				writeError(w, badRequest("La dirección seleccionada no pertenece a la zona de entrega indicada"))
				return
			}
			deliveryZone = selectedZone
		} else {
			matchedZone, covered, zoneErr := s.deliveryZoneForCustomer(r.Context(), input.StoreID, customer)
			if zoneErr != nil {
				writeError(w, zoneErr)
				return
			}
			if !covered {
				writeError(w, badRequest("La dirección seleccionada está fuera de la zona de cobertura. Elige otra dirección o selecciona recogida."))
				return
			}
			deliveryZone = matchedZone
		}
		input.DeliveryCost = roundPayableAmount(deliveryZone.DeliveryCost)
		input.Total = roundPayableAmount(input.Subtotal + input.DeliveryCost)
		if strings.TrimSpace(input.Address) == "" {
			input.Address = customerDeliveryAddressLine(customer)
		}
		address := strings.TrimSpace(input.Address)
		if address == "" {
			writeError(w, badRequest("Completa una dirección de entrega válida antes de confirmar el pedido"))
			return
		}
		if deliveryLat != "" && deliveryLng != "" && !strings.Contains(address, "GPS:") {
			address = fmt.Sprintf("%s · GPS: %s, %s", address, deliveryLat, deliveryLng)
		}
		input.Address = strings.TrimSpace(fmt.Sprintf("Modalidad: Entrega · Entrega: RD$ %.0f · %s", input.DeliveryCost, address))
	case "pickup":
		input.DeliveryCost = 0
		input.Total = input.Subtotal
		pickupAddress := storePickupAddressLine(store)
		input.Address = strings.TrimSpace(fmt.Sprintf("Modalidad: Recogida · Retirar en: %s", pickupAddress))
	}
	if transferAccount != nil {
		input.Address = strings.TrimSpace(fmt.Sprintf("%s · Transferencia: %s · Cuenta %s · Titular %s", input.Address, transferAccount.Bank, transferAccount.Number, transferAccount.Holder))
	}
	if orderMode == "delivery" && input.Method == "cash" {
		answered := boolFromPtr(input.CashChangeAnswered) || boolFromPtr(input.CashChangeAnsweredCamel) || input.CashChangeNeeded != nil || input.CashChangeNeededCamel != nil
		if !answered {
			writeError(w, badRequest("Indica si necesitas cambio antes de confirmar el pedido"))
			return
		}
		needsChange := boolFromPtr(input.CashChangeNeeded) || boolFromPtr(input.CashChangeNeededCamel)
		changeFrom := firstPositiveNumber(input.CashChangeFrom, input.CashChangeFromCamel, input.CashTenderedAmount, input.CashTenderedAmountCamel)
		if needsChange {
			if changeFrom < input.Total {
				writeError(w, badRequest("Selecciona un monto que cubra el total del pedido"))
				return
			}
			input.Address = strings.TrimSpace(fmt.Sprintf("%s · Cambio: requiere vuelto de RD$ %.0f (vuelto RD$ %.0f)", input.Address, changeFrom, changeFrom-input.Total))
		} else {
			input.Address = strings.TrimSpace(fmt.Sprintf("%s · Cambio: no necesita vuelto (pagará exacto)", input.Address))
		}
	}
	date := s.now()
	if input.Date != nil {
		date = *input.Date
	}

	if input.Method == "store_credit" {
		credit := parseCreditConfig(customer.StoreCredit, input.StoreID)
		if !credit.Enabled || strings.EqualFold(credit.Status, "blocked") {
			writeError(w, badRequest("El crédito fiado no está habilitado para este cliente"))
			return
		}
		debt, err := s.customerDebt(r.Context(), input.StoreID, customer.Name)
		if err != nil {
			writeError(w, err)
			return
		}
		if !strings.EqualFold(credit.Type, "unlimited") && (credit.Limit <= 0 || debt+input.Total > credit.Limit) {
			if s.replayCompletedOrderIfAvailable(w, r, customer, input.StoreID, idempotencyKey, requestHash) {
				return
			}
			writeError(w, badRequest("El pedido supera el límite de crédito disponible"))
			return
		}
	}

	transactionTimeout := s.cfg.OrderTransactionTimeout
	if transactionTimeout <= 0 {
		transactionTimeout = 5 * time.Second
	}
	transactionContext, cancelTransaction := context.WithTimeout(r.Context(), transactionTimeout)
	defer cancelTransaction()
	tx, err := s.db.BeginTx(transactionContext, pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer func() {
		rollbackContext, cancelRollback := context.WithTimeout(context.WithoutCancel(r.Context()), 2*time.Second)
		defer cancelRollback()
		_ = tx.Rollback(rollbackContext)
	}()

	existingOrderID, acquired, err := reserveOrderIdempotency(transactionContext, tx, customer.ID, input.StoreID, idempotencyKey, requestHash)
	if err != nil {
		writeError(w, err)
		return
	}
	if !acquired {
		if err := tx.Rollback(transactionContext); err != nil && !errors.Is(err, pgx.ErrTxClosed) {
			writeError(w, err)
			return
		}
		s.writeClientOrderReplay(w, r, customer, input.StoreID, existingOrderID)
		return
	}

	canonicalItems, canonicalSubtotal, adjustments, err := canonicalSaleItems(transactionContext, tx, input.StoreID, input.Items, true)
	if err != nil {
		writeError(w, err)
		return
	}
	input.Items, input.Subtotal = canonicalItems, canonicalSubtotal
	if orderMode == "delivery" {
		input.Total = roundPayableAmount(input.Subtotal + input.DeliveryCost)
	} else {
		input.Total = input.Subtotal
	}
	qtx := s.queries.WithTx(tx)
	sale, err := qtx.CreateSale(transactionContext, sqlc.CreateSaleParams{
		StoreID:         input.StoreID,
		Items:           input.Items,
		Total:           input.Total,
		Method:          input.Method,
		Customer:        customer.Name,
		Date:            date,
		CustomerID:      customer.ID,
		DeliveryAddress: input.Address,
		Status:          "pending",
		OrderType:       "customer",
	})
	if err != nil {
		writeError(w, err)
		return
	}
	if err := consumeTrackedBatchesTx(transactionContext, tx, input.StoreID, sale.ID, adjustments); err != nil {
		writeError(w, err)
		return
	}
	if err := applyInventoryAdjustments(transactionContext, tx, input.StoreID, adjustments); err != nil {
		writeError(w, err)
		return
	}
	customerActor := businessActor{ID: customer.ID, Role: "customer"}
	if err := recordInventoryAdjustmentsTx(transactionContext, tx, input.StoreID, "sale", "Pedido de cliente registrado", "sale", sale.ID, customerActor, adjustments, -1); err != nil {
		writeError(w, err)
		return
	}
	if orderMode == "delivery" {
		if err := s.createDeliveryOperation(transactionContext, tx, sale.ID, input.StoreID, deliveryZone.ID, customer.Lat, customer.Lng); err != nil {
			writeError(w, err)
			return
		}
	}
	var storeCredit *StoreCredit
	if input.Method == "store_credit" {
		f, err := qtx.CreateStoreCredit(transactionContext, sqlc.CreateStoreCreditParams{StoreID: input.StoreID, Customer: customer.Name, Amount: input.Total, Note: "Pedido de cliente", Status: "pending", Type: "charge", Date: date})
		if err != nil {
			writeError(w, err)
			return
		}
		if _, err := tx.Exec(transactionContext, `
			UPDATE store_credits SET customer_id=$2::uuid,reference_type='sale',reference_id=$3::uuid,created_by=$4,updated_at=now()
			WHERE id=$1::uuid
		`, f.ID, customer.ID, sale.ID, customer.ID); err != nil {
			writeError(w, err)
			return
		}
		f.CustomerID = customer.ID
		f.RemainingAmount = f.Amount
		f.ReferenceType = "sale"
		f.ReferenceID = sale.ID
		f.CreatedBy = customer.ID
		storeCredit = &f
	}
	if err := postSaleAccountingTx(transactionContext, tx, input.StoreID, sale.ID, input.Method, input.Total, input.Items, customerActor); err != nil {
		writeError(w, err)
		return
	}
	orderDetails := map[string]any{"store_id": input.StoreID, "sale_id": sale.ID, "customer_id": customer.ID, "total": input.Total, "method": input.Method, "order_mode": orderMode}
	if err := insertAuditTx(transactionContext, tx, input.StoreID, customerActor, "order.customer.created", "sale", sale.ID, orderDetails); err != nil {
		writeError(w, err)
		return
	}
	if err := insertOutboxTx(transactionContext, tx, input.StoreID, "sale", sale.ID, "order.created", orderDetails, "order.created:"+sale.ID); err != nil {
		writeError(w, err)
		return
	}
	if err := insertNotificationTx(transactionContext, tx, input.StoreID, "administrator", "", "order.created", "Nuevo pedido en línea", fmt.Sprintf("%s realizó un pedido por RD$ %.2f.", customer.Name, input.Total), orderDetails); err != nil {
		writeError(w, err)
		return
	}
	if err := insertNotificationTx(transactionContext, tx, input.StoreID, "customer", customer.ID, "order.created", "Pedido recibido", "Recibimos tu pedido. Te avisaremos cuando cambie de estado.", orderDetails); err != nil {
		writeError(w, err)
		return
	}
	if err := insertNotificationChannelTx(transactionContext, tx, input.StoreID, "customer", customer.ID, "whatsapp", "order.created", "Pedido recibido", "Recibimos tu pedido. Te avisaremos cuando cambie de estado.", orderDetails); err != nil {
		writeError(w, err)
		return
	}
	if err := completeOrderIdempotency(transactionContext, tx, customer.ID, input.StoreID, idempotencyKey, sale.ID); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(transactionContext); err != nil {
		writeError(w, err)
		return
	}
	if orderMode == "delivery" {
		s.syncActiveDeliveryGeoDestination(r.Context(), sale.ID)
	}
	_, _ = s.db.Exec(r.Context(), `
		INSERT INTO client_carts (customer_id, store_id, items, updated_at)
		VALUES ($1, $2, '[]'::jsonb, now())
		ON CONFLICT (customer_id, store_id) DO UPDATE SET items='[]'::jsonb, updated_at=now()
	`, customer.ID, input.StoreID)
	order := saleToOrder(sale)
	if enriched, enrichErr := s.enrichOrdersWithDelivery(r.Context(), []map[string]any{order}, deliveryAudienceClient); enrichErr == nil && len(enriched) > 0 {
		order = enriched[0]
	}
	s.invalidateTenantCache(r.Context())
	s.publishTenantEvent(r.Context(), "cart_updated", map[string]any{"storeId": input.StoreID, "customerId": customer.ID})
	profile, _ := s.buildClientProfile(r.Context(), customer, input.StoreID)
	products, _ := s.queryProducts(r.Context(), input.StoreID)
	writeJSON(w, http.StatusCreated, map[string]any{"order": order, "profile": profile, "products": products, "store_credit": storeCredit})
}

func (s *Server) writeClientOrderReplay(w http.ResponseWriter, r *http.Request, customer Customer, storeID, orderID string) {
	sale, err := saleByID(r.Context(), s.db, orderID)
	if err != nil {
		writeError(w, err)
		return
	}
	w.Header().Set("Idempotency-Replayed", "true")
	profile, _ := s.buildClientProfile(r.Context(), customer, storeID)
	products, _ := s.queryProducts(r.Context(), storeID)
	order := saleToOrder(sale)
	if enriched, enrichErr := s.enrichOrdersWithDelivery(r.Context(), []map[string]any{order}, deliveryAudienceClient); enrichErr == nil && len(enriched) > 0 {
		order = enriched[0]
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"order":        order,
		"profile":      profile,
		"products":     products,
		"store_credit": nil,
	})
}

func (s *Server) replayCompletedOrderIfAvailable(w http.ResponseWriter, r *http.Request, customer Customer, storeID, key, requestHash string) bool {
	orderID, replay, err := lookupCompletedOrderIdempotency(r.Context(), s.db, customer.ID, storeID, key, requestHash)
	if err != nil {
		writeError(w, err)
		return true
	}
	if !replay {
		return false
	}
	s.writeClientOrderReplay(w, r, customer, storeID, orderID)
	return true
}

func (s *Server) issueCustomerToken(ctx context.Context, customerID string) (string, error) {
	payload := customerTokenPayload{CustomerID: customerID, TenantID: tenantIDFromContext(ctx), ExpiresAt: time.Now().Add(30 * 24 * time.Hour).Unix()}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	body := base64.RawURLEncoding.EncodeToString(payloadJSON)
	mac := hmac.New(sha256.New, []byte("customer:"+s.cfg.AdminTokenSecret))
	mac.Write([]byte(body))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return body + "." + sig, nil
}

func (s *Server) validateCustomerToken(ctx context.Context, token string) (string, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return "", errors.New("invalid token")
	}
	mac := hmac.New(sha256.New, []byte("customer:"+s.cfg.AdminTokenSecret))
	mac.Write([]byte(parts[0]))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if subtle.ConstantTimeCompare([]byte(expected), []byte(parts[1])) != 1 {
		return "", errors.New("invalid token signature")
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return "", err
	}
	var payload customerTokenPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return "", err
	}
	if payload.CustomerID == "" || time.Now().Unix() > payload.ExpiresAt || !tenantTokenMatches(ctx, payload.TenantID, nil) {
		return "", errors.New("expired token")
	}
	return payload.CustomerID, nil
}

func (s *Server) requireCustomer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := bearerOrCookieToken(r, clientSessionCookie)
		if token == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Sesión de cliente requerida"})
			return
		}
		customerID, err := s.validateCustomerToken(r.Context(), token)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Sesión de cliente expirada o inválida"})
			return
		}
		ctx := context.WithValue(r.Context(), customerIDContextKey{}, customerID)
		setRequestActor(ctx, customerID, "customer")
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) customerFromRequest(r *http.Request) (Customer, error) {
	customerID, _ := r.Context().Value(customerIDContextKey{}).(string)
	return s.queries.GetCustomer(r.Context(), customerID)
}

func customerDeliveryAddressLine(customer Customer) string {
	streetLine := strings.TrimSpace(strings.Join([]string{customer.Street, customer.StreetNumber}, " "))
	parts := []string{}
	for _, value := range []string{streetLine, customer.Sector, customer.Municipality, customer.Province, customer.AddressReference} {
		value = strings.TrimSpace(value)
		if value != "" {
			parts = append(parts, value)
		}
	}
	return strings.Join(parts, ", ")
}

func normalizePaymentMethodValue(value string) string {
	v := strings.ToLower(strings.TrimSpace(value))
	replacements := map[string]string{"á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u"}
	for old, next := range replacements {
		v = strings.ReplaceAll(v, old, next)
	}
	switch {
	case strings.Contains(v, "efectivo") || strings.Contains(v, "cash"):
		return "cash"
	case strings.Contains(v, "transfer") || strings.Contains(v, "banco"):
		return "bank_transfer"
	case strings.Contains(v, "tarjeta") || strings.Contains(v, "card") || strings.Contains(v, "terminal"):
		return "card"
	case strings.Contains(v, "fiado") || strings.Contains(v, "credito"):
		return "store_credit"
	default:
		return strings.TrimSpace(v)
	}
}

func storePaymentMethodEnabled(store Store, method string) bool {
	settings := map[string]any{}
	raw := []byte(defaultPaymentSettingsJSON)
	if len(bytes.TrimSpace(store.PaymentSettings)) > 0 {
		raw = store.PaymentSettings
	}
	if err := json.Unmarshal(raw, &settings); err != nil {
		_ = json.Unmarshal([]byte(defaultPaymentSettingsJSON), &settings)
	}
	keys := map[string]string{
		"cash":          "cash",
		"bank_transfer": "bankTransfer",
		"card":          "card",
		"store_credit":  "credit",
	}
	key, ok := keys[normalizePaymentMethodValue(method)]
	if !ok {
		return true
	}
	value, exists := settings[key]
	if !exists {
		return true
	}
	return parseBoolValue(value, true)
}

type orderModeSettings struct {
	Delivery bool `json:"delivery"`
	Pickup   bool `json:"pickup"`
}

func (settings orderModeSettings) enabled(mode string) bool {
	switch normalizeOrderModeValue(mode) {
	case "delivery":
		return settings.Delivery
	case "pickup":
		return settings.Pickup
	default:
		return false
	}
}

func normalizeOrderModeValue(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "delivery":
		return "delivery"
	case "pickup":
		return "pickup"
	default:
		return ""
	}
}

func parseBoolValue(value any, fallback bool) bool {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		trimmed := strings.ToLower(strings.TrimSpace(v))
		switch trimmed {
		case "true", "1", "yes", "si", "sí", "enabled", "habilitado", "activo":
			return true
		case "false", "0", "no", "disabled", "deshabilitado", "inactivo":
			return false
		}
	case float64:
		return v != 0
	case int:
		return v != 0
	}
	return fallback
}

func normalizeOrderModeSettings(raw map[string]any) orderModeSettings {
	settings := orderModeSettings{Delivery: true, Pickup: true}
	if raw == nil {
		return settings
	}
	if value, ok := raw["delivery"]; ok {
		settings.Delivery = parseBoolValue(value, settings.Delivery)
	}
	if value, ok := raw["pickup"]; ok {
		settings.Pickup = parseBoolValue(value, settings.Pickup)
	}
	if !settings.Delivery && !settings.Pickup {
		settings.Delivery = true
	}
	return settings
}

func storeOrderModes(store Store) orderModeSettings {
	settings := orderModeSettings{Delivery: true, Pickup: true}
	if len(bytes.TrimSpace(store.PaymentSettings)) == 0 {
		return settings
	}
	var payment map[string]any
	if err := json.Unmarshal(store.PaymentSettings, &payment); err != nil {
		return settings
	}
	for _, key := range []string{"orderModes", "order_modes"} {
		if raw, ok := payment[key]; ok {
			if nested, ok := raw.(map[string]any); ok {
				return normalizeOrderModeSettings(nested)
			}
		}
	}
	return settings
}

func normalizePaymentSettingsPayload(value any) map[string]any {
	raw := asJSON(value, defaultPaymentSettingsJSON)
	settings := map[string]any{}
	if err := json.Unmarshal(raw, &settings); err != nil {
		_ = json.Unmarshal([]byte(defaultPaymentSettingsJSON), &settings)
	}
	modes := orderModeSettings{Delivery: true, Pickup: true}
	for _, key := range []string{"orderModes", "order_modes"} {
		if nested, ok := settings[key].(map[string]any); ok {
			modes = normalizeOrderModeSettings(nested)
			break
		}
	}
	normalizedModes := map[string]bool{"delivery": modes.Delivery, "pickup": modes.Pickup}
	settings["orderModes"] = normalizedModes
	settings["order_modes"] = normalizedModes
	return settings
}

func storePickupAddressLine(store Store) string {
	street := strings.TrimSpace(store.Street)
	streetNumber := strings.TrimSpace(store.StreetNumber)
	streetLine := street
	if street != "" && streetNumber != "" {
		streetLine = fmt.Sprintf("%s #%s", street, streetNumber)
	} else if streetNumber != "" {
		streetLine = streetNumber
	}

	parts := []string{}
	for _, value := range []string{streetLine, store.Neighborhood, store.Municipality} {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		duplicate := false
		for _, existing := range parts {
			if strings.EqualFold(existing, value) {
				duplicate = true
				break
			}
		}
		if !duplicate {
			parts = append(parts, value)
		}
	}
	for _, value := range strings.Split(store.Address, ",") {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		duplicate := false
		for _, existing := range parts {
			if strings.EqualFold(existing, value) {
				duplicate = true
				break
			}
		}
		if !duplicate {
			parts = append(parts, value)
		}
		if len(parts) == 3 {
			break
		}
	}
	return strings.Join(parts, ", ")
}

func normalizeDeliveryCompare(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func deliveryLocationMatches(zoneCode, zoneName, customerCode, customerName string) bool {
	zoneCode = strings.TrimSpace(zoneCode)
	zoneName = normalizeDeliveryCompare(zoneName)
	customerCode = strings.TrimSpace(customerCode)
	customerName = normalizeDeliveryCompare(customerName)
	if zoneCode == "" && zoneName == "" {
		return true
	}
	if customerCode == "" && customerName == "" {
		return false
	}
	if zoneCode != "" && customerCode != "" {
		return strings.EqualFold(zoneCode, customerCode)
	}
	return zoneName != "" && customerName != "" && zoneName == customerName
}

func deliveryZoneMatchesCustomer(zone DeliveryZone, customer Customer) bool {
	if !zone.Active {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(zone.ZoneType), "geofence") {
		lat, lng, ok := customerGeoCoordinates(customer)
		if !ok {
			return false
		}
		return geoPolygonContains(geoDeliveryPolygon(zone.GeoPolygon), lat, lng)
	}
	if !deliveryLocationMatches(zone.ProvinceCode, zone.ProvinceName, customer.ProvinceCode, customer.Province) {
		return false
	}
	if !deliveryLocationMatches(zone.MunicipalityCode, zone.MunicipalityName, customer.MunicipalityCode, customer.Municipality) {
		return false
	}
	if zone.DistrictCode != "" {
		if strings.TrimSpace(customer.DistrictCode) == "" || !strings.EqualFold(zone.DistrictCode, customer.DistrictCode) {
			return false
		}
	}
	if zone.NeighborhoodID != "" {
		if customer.NeighborhoodID != "" {
			return strings.EqualFold(zone.NeighborhoodID, customer.NeighborhoodID)
		}
		return zone.NeighborhoodName != "" && customer.Sector != "" && normalizeDeliveryCompare(zone.NeighborhoodName) == normalizeDeliveryCompare(customer.Sector)
	}
	if zone.NeighborhoodName != "" {
		return customer.Sector != "" && normalizeDeliveryCompare(zone.NeighborhoodName) == normalizeDeliveryCompare(customer.Sector)
	}
	return true
}

func (s *Server) deliveryCostForCustomer(ctx context.Context, storeID string, customer Customer) (float64, error) {
	zones, err := s.queryDeliveryZones(ctx, storeID)
	if err != nil {
		return 0, err
	}
	for _, zone := range zones {
		if deliveryZoneMatchesCustomer(zone, customer) {
			return zone.DeliveryCost, nil
		}
	}
	return 0, nil
}

func (s *Server) buildClientProfile(ctx context.Context, customer Customer, storeID string) (map[string]any, error) {
	customer = s.hydrateCustomerAvatar(ctx, customer)
	orders, err := s.queryClientOrders(ctx, customer.ID)
	if err != nil {
		return nil, err
	}
	manualStoreCredits, _ := s.queryCustomerStoreCredits(ctx, storeID, customer.Name)
	usedBalance, _ := s.customerDebt(ctx, storeID, customer.Name)
	credit := parseCreditConfig(customer.StoreCredit, storeID)
	creditActive := credit.Enabled && !strings.EqualFold(credit.Status, "blocked")
	creditUnlimited := creditActive && strings.EqualFold(credit.Type, "unlimited")
	creditLimit := credit.Limit
	if creditUnlimited {
		creditLimit = 0
	}
	parts := strings.Fields(customer.Name)
	name := customer.Name
	lastName := ""
	if len(parts) > 1 {
		name = parts[0]
		lastName = strings.Join(parts[1:], " ")
	}
	neighborhoodName, customNeighborhood := s.canonicalCustomNeighborhoodName(ctx, customer.NeighborhoodID, customer.Sector)
	addressName := strings.TrimSpace(strings.Join([]string{neighborhoodName, customer.Street}, ", "))
	addresses := []map[string]any{}
	if customer.Province != "" || customer.Municipality != "" || customer.Sector != "" || customer.Street != "" || customer.StreetNumber != "" {
		addresses = append(addresses, map[string]any{"id": customer.ID, "name": "Principal", "province": customer.Province, "provinceCode": customer.ProvinceCode, "province_code": customer.ProvinceCode, "municipality": customer.Municipality, "municipalityCode": customer.MunicipalityCode, "municipality_code": customer.MunicipalityCode, "districtCode": customer.DistrictCode, "district_code": customer.DistrictCode, "neighborhoodId": customer.NeighborhoodID, "neighborhood_id": customer.NeighborhoodID, "neighborhood": neighborhoodName, "sector": neighborhoodName, "customNeighborhood": customNeighborhood, "custom_neighborhood": customNeighborhood, "street": customer.Street, "street_number": customer.StreetNumber, "address_reference": customer.AddressReference, "lat": customer.Lat, "lng": customer.Lng, "isPrincipal": true})
	}
	storeCreditOrders := []map[string]any{}
	for _, order := range orders {
		if fmt.Sprint(order["paymentMethod"]) == "store_credit" {
			storeCreditOrders = append(storeCreditOrders, map[string]any{"id": order["id"], "date": order["date"], "items": order["items"], "total": order["total"], "status": "pending"})
		}
	}
	storeCreditOrders = append(storeCreditOrders, manualStoreCredits...)
	return map[string]any{
		"id": customer.ID, "name": name, "last_name": lastName, "full_name": customer.Name,
		"national_id": customer.NationalID, "birth_date": customer.BirthDate, "birthDate": customer.BirthDate, "gender": customer.Gender, "whatsapp": customer.Whatsapp, "whatsappDisplay": customer.WhatsappDisplay, "whatsapp_display": customer.WhatsappDisplay,
		"profilePictureUrl": customer.ProfilePictureURL, "profile_picture_url": customer.ProfilePictureURL, "avatarUrl": customer.ProfilePictureURL, "avatar_url": customer.ProfilePictureURL,
		"countryCode": customer.CountryCode, "country_code": customer.CountryCode, "dialCode": customer.DialCode, "dial_code": customer.DialCode,
		"province": customer.Province, "provinceCode": customer.ProvinceCode, "municipality": customer.Municipality, "municipalityCode": customer.MunicipalityCode, "districtCode": customer.DistrictCode, "neighborhoodId": customer.NeighborhoodID, "neighborhood": neighborhoodName, "sector": neighborhoodName, "customNeighborhood": customNeighborhood, "custom_neighborhood": customNeighborhood, "street": customer.Street, "street_number": customer.StreetNumber,
		"memberSince": formatMonthYear(customer.RegisteredAt.In(s.location)), "registered_at": customer.RegisteredAt,
		"totalOrders": len(orders), "points": int(totalDelivered(orders) / 100), "orders": orders, "addresses": addresses,
		"primaryAddress": addressName, "creditEnabled": creditActive,
		"creditType": credit.Type, "creditUnlimited": creditUnlimited,
		"creditLimit": creditLimit, "usedBalance": usedBalance, "accumulatedBalance": usedBalance, "storeCreditOrders": storeCreditOrders,
	}, nil
}

type creditConfig struct {
	Enabled bool
	Type    string
	Limit   float64
	Status  string
}

func parseCreditConfig(raw json.RawMessage, storeID string) creditConfig {
	cfg := creditConfig{Enabled: false, Type: "limited", Limit: 0, Status: "active"}
	if len(raw) == 0 || storeID == "" {
		return cfg
	}
	var data map[string]any
	if err := json.Unmarshal(raw, &data); err != nil {
		return cfg
	}
	entry, ok := data[storeID]
	if !ok {
		return cfg
	}
	switch v := entry.(type) {
	case bool:
		cfg.Enabled = v
		if v {
			cfg.Type = "unlimited"
		}
	case map[string]any:
		cfg.Enabled = boolFromAny(v["enabled"], true)
		if t := strings.TrimSpace(fmt.Sprint(v["type"])); t != "" && t != "<nil>" {
			cfg.Type = t
		}
		cfg.Limit = floatFromAny(v["limit"])
		if st := strings.TrimSpace(fmt.Sprint(v["status"])); st != "" && st != "<nil>" {
			cfg.Status = st
		}
	}
	return cfg
}

func boolFromAny(v any, def bool) bool {
	if v == nil {
		return def
	}
	if b, ok := v.(bool); ok {
		return b
	}
	return strings.EqualFold(fmt.Sprint(v), "true")
}
func floatFromAny(v any) float64 {
	switch n := v.(type) {
	case json.Number:
		f, _ := n.Float64()
		return f
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case string:
		var f float64
		fmt.Sscan(n, &f)
		return f
	}
	return 0
}

func (s *Server) customerDebt(ctx context.Context, storeID, customer string) (float64, error) {
	var total float64
	err := s.db.QueryRow(ctx, `SELECT COALESCE(SUM(CASE WHEN type='charge' AND status NOT IN ('paid','reversed') THEN GREATEST(amount-paid_amount,0) WHEN type='payment' AND COALESCE(reference_type,'')='' THEN -amount ELSE 0 END), 0) FROM store_credits WHERE store_id=$1 AND LOWER(customer)=LOWER($2)`, storeID, customer).Scan(&total)
	return total, err
}

func (s *Server) queryClientOrders(ctx context.Context, customerID string) ([]map[string]any, error) {
	rows, err := s.db.Query(ctx, `
		SELECT sale.id::text, sale.store_id::text, sale.items, sale.total, sale.method, sale.customer, sale.date,
		       COALESCE(sale.customer_id::text, '') AS customer_id, sale.delivery_address, sale.status, sale.order_type,
		       COALESCE(sale.reversal_reason,''), sale.reversed_at, sale.financial_status,
		       COALESCE(return_summary.records,'[]'::jsonb), COALESCE(return_summary.returned_amount,0)
		FROM sales sale
		LEFT JOIN LATERAL (
			SELECT jsonb_agg(jsonb_build_object(
				'id',sale_return.id::text,
				'items',sale_return.items,
				'amount',sale_return.amount,
				'reason',sale_return.reason,
				'resolution',sale_return.resolution,
				'inventory_disposition',sale_return.inventory_disposition,
				'inventory_restocked',sale_return.inventory_restocked,
				'created_at',sale_return.created_at
			) ORDER BY sale_return.created_at DESC) AS records,
			COALESCE(SUM(sale_return.amount),0) AS returned_amount
			FROM sale_returns sale_return
			WHERE sale_return.sale_id=sale.id
		) return_summary ON true
		WHERE sale.customer_id=$1 AND sale.order_type='customer'
		ORDER BY sale.date DESC
	`, customerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	orders := []map[string]any{}
	for rows.Next() {
		var sale Sale
		var reversalReason, financialStatus string
		var reversedAt sql.NullTime
		var returnRecords json.RawMessage
		var returnedAmount float64
		scanPointers := append(saleScanPtrs(&sale), &reversalReason, &reversedAt, &financialStatus, &returnRecords, &returnedAmount)
		if err := rows.Scan(scanPointers...); err != nil {
			return nil, err
		}
		order := saleToOrder(sale)
		order["financial_status"] = financialStatus
		order["financialStatus"] = financialStatus
		order["returns"] = returnRecords
		order["returned_amount"] = roundCurrency(returnedAmount)
		order["returnedAmount"] = roundCurrency(returnedAmount)
		order["net_total"] = roundCurrency(math.Max(0, sale.Total-returnedAmount))
		order["netTotal"] = roundCurrency(math.Max(0, sale.Total-returnedAmount))
		if reversalReason != "" {
			order["reversal_reason"] = reversalReason
			order["reversalReason"] = reversalReason
			order["cancellation_reason"] = reversalReason
			order["cancellationReason"] = reversalReason
		}
		if reversedAt.Valid {
			order["reversed_at"] = reversedAt.Time
			order["reversedAt"] = reversedAt.Time
		}
		orders = append(orders, order)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return s.enrichOrdersWithDelivery(ctx, orders, deliveryAudienceClient)
}

func (s *Server) queryCustomerStoreCredits(ctx context.Context, storeID, customer string) ([]map[string]any, error) {
	if storeID == "" || customer == "" {
		return []map[string]any{}, nil
	}
	rows, err := s.db.Query(ctx, `SELECT id::text, amount, note, date, status, type FROM store_credits WHERE store_id=$1 AND LOWER(customer)=LOWER($2) AND type='charge' AND note <> 'Pedido de cliente' ORDER BY date DESC`, storeID, customer)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, note, status, typ string
		var amount float64
		var date time.Time
		if err := rows.Scan(&id, &amount, &note, &date, &status, &typ); err != nil {
			return nil, err
		}
		normalizedStatus := "pending"
		if strings.EqualFold(status, "paid") {
			normalizedStatus = "paid"
		}
		label := strings.TrimSpace(note)
		if label == "" {
			label = "Crédito del negocio"
		}
		items = append(items, map[string]any{"id": id, "date": date, "items": []map[string]any{{"name": label, "quantity": 1, "price": amount}}, "total": amount, "status": normalizedStatus})
	}
	return items, rows.Err()
}

func orderModeFromSaleAddress(address string) string {
	normalized := strings.ToLower(strings.TrimSpace(address))
	normalized = strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ñ", "n").Replace(normalized)
	if strings.Contains(normalized, "modalidad: recogida") || strings.Contains(normalized, "retirar en") {
		return "pickup"
	}
	if strings.Contains(normalized, "modalidad: entrega") || strings.Contains(normalized, "entrega:") || strings.Contains(normalized, "gps:") {
		return "delivery"
	}
	return ""
}

func deliveryCostFromSaleAddress(address string) float64 {
	lower := strings.ToLower(address)
	idx := strings.Index(lower, "entrega:")
	if idx < 0 {
		return 0
	}
	part := strings.TrimSpace(address[idx+len("entrega:"):])
	part = strings.TrimSpace(strings.TrimPrefix(part, "RD$"))
	part = strings.TrimSpace(strings.TrimPrefix(part, "rd$"))
	var number strings.Builder
	for _, r := range part {
		if (r >= '0' && r <= '9') || r == '.' || r == ',' {
			number.WriteRune(r)
			continue
		}
		if number.Len() > 0 {
			break
		}
	}
	parsed, err := strconv.ParseFloat(strings.ReplaceAll(number.String(), ",", ""), 64)
	if err != nil {
		return 0
	}
	return parsed
}

func parseMoney(value string) float64 {
	var number strings.Builder
	for _, r := range strings.TrimSpace(value) {
		if (r >= '0' && r <= '9') || r == '.' || r == ',' {
			number.WriteRune(r)
			continue
		}
		if number.Len() > 0 {
			break
		}
	}
	parsed, err := strconv.ParseFloat(strings.ReplaceAll(number.String(), ",", ""), 64)
	if err != nil {
		return 0
	}
	return parsed
}

var paymentChangeAmountRe = regexp.MustCompile(`(?i)Cambio\s*:\s*requiere vuelto de RD\$?\s*([0-9.,]+)`)
var paymentChangeBackRe = regexp.MustCompile(`(?i)vuelto RD\$?\s*([0-9.,]+)`)

func boolFromPtr(value *bool) bool {
	return value != nil && *value
}

func firstPositiveNumber(values ...float64) float64 {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}

func paymentChangeFromSaleAddress(address string) map[string]any {
	lower := strings.ToLower(address)
	answered := strings.Contains(lower, "cambio:") || strings.Contains(lower, "no necesita vuelto") || strings.Contains(lower, "pagará exacto") || strings.Contains(lower, "pagara exacto")
	if !answered {
		return map[string]any{"cash_change_answered": false, "cashChangeAnswered": false, "cash_change_needed": false, "cashChangeNeeded": false, "cash_change_from": 0, "cashChangeFrom": 0, "cash_change_amount": 0, "cashChangeAmount": 0}
	}
	amount := 0.0
	if match := paymentChangeAmountRe.FindStringSubmatch(address); len(match) > 1 {
		amount = parseMoney(match[1])
	}
	changeAmount := 0.0
	if match := paymentChangeBackRe.FindStringSubmatch(address); len(match) > 1 {
		changeAmount = parseMoney(match[1])
	}
	needed := amount > 0
	return map[string]any{"cash_change_answered": true, "cashChangeAnswered": true, "cash_change_needed": needed, "cashChangeNeeded": needed, "cash_change_from": amount, "cashChangeFrom": amount, "cash_change_amount": changeAmount, "cashChangeAmount": changeAmount}
}

func saleOrderNumber(sale Sale) string {
	cleanID := strings.ToUpper(strings.NewReplacer("-", "", " ", "").Replace(strings.TrimSpace(sale.ID)))
	if len(cleanID) > 6 {
		cleanID = cleanID[len(cleanID)-6:]
	}
	if cleanID == "" {
		cleanID = "000000"
	}
	return fmt.Sprintf("#%s", cleanID)
}

func saleToOrder(sale Sale) map[string]any {
	items := []map[string]any{}
	_ = json.Unmarshal(sale.Items, &items)
	orderMode := orderModeFromSaleAddress(sale.DeliveryAddress)
	deliveryCost := deliveryCostFromSaleAddress(sale.DeliveryAddress)
	paymentChange := paymentChangeFromSaleAddress(sale.DeliveryAddress)
	orderNumber := saleOrderNumber(sale)
	order := map[string]any{"id": sale.ID, "order_number": orderNumber, "orderNumber": orderNumber, "store_id": sale.StoreID, "date": sale.Date, "status": normalizeOrderStatus(sale.Status), "items": items, "total": sale.Total, "address": sale.DeliveryAddress, "delivery_address": sale.DeliveryAddress, "deliveryAddress": sale.DeliveryAddress, "paymentMethod": sale.Method, "customer": sale.Customer, "customer_id": sale.CustomerID, "order_type": sale.OrderType, "order_mode": orderMode, "orderMode": orderMode, "delivery_cost": deliveryCost, "deliveryCost": deliveryCost}
	for key, value := range paymentChange {
		order[key] = value
	}
	return order
}

func normalizeOrderStatus(status string) string {
	status = strings.ToLower(strings.TrimSpace(status))
	if status == "" {
		return "pending"
	}
	return status
}

func totalDelivered(orders []map[string]any) float64 {
	var total float64
	for _, o := range orders {
		if fmt.Sprint(o["status"]) == "delivered" {
			total += floatFromAny(firstNonNil(o["net_total"], o["netTotal"], o["total"]))
		}
	}
	return total
}

func formatMonthYear(t time.Time) string {
	months := []string{"enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"}
	return strings.Title(months[int(t.Month())-1]) + fmt.Sprintf(" %d", t.Year())
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" && strings.TrimSpace(value) != "<nil>" {
			return value
		}
	}
	return ""
}

func (s *Server) applyStoreDeliveryScopeToCustomer(input map[string]any, store Store) {
	if store.ProvinceCode != "" {
		input["province_code"] = store.ProvinceCode
		input["provinceCode"] = store.ProvinceCode
	}
	if store.Province != "" {
		input["province"] = store.Province
	}
	if normalizeDeliveryScopeValue(store.DeliveryScope) == "municipal" {
		if store.MunicipalityCode != "" {
			input["municipality_code"] = store.MunicipalityCode
			input["municipalityCode"] = store.MunicipalityCode
		}
		if store.Municipality != "" {
			input["municipality"] = store.Municipality
		}
		if store.DistrictCode != "" {
			input["district_code"] = store.DistrictCode
			input["districtCode"] = store.DistrictCode
		}
	}
}

func validateTerritoryAddressInput(input map[string]any) error {
	if strings.TrimSpace(str(input, "province")) == "" || strings.TrimSpace(str(input, "municipality")) == "" || strings.TrimSpace(firstNonEmpty(str(input, "neighborhood"), str(input, "sector"))) == "" {
		return badRequest("Selecciona provincia, municipio/distrito y barrio")
	}
	if strings.TrimSpace(str(input, "street")) == "" {
		return badRequest("La calle es requerida")
	}
	if onlyDigits(str(input, "street_number")) == "" {
		return badRequest("El número de la dirección es requerido")
	}
	return nil
}

func normalizeTerritoryAddressInput(input map[string]any) {
	if value := strDefaultEither(input, "province_code", "provinceCode", ""); value != "" {
		input["province_code"] = value
	}
	if value := strDefaultEither(input, "municipality_code", "municipalityCode", ""); value != "" {
		input["municipality_code"] = value
	}
	if value := strDefaultEither(input, "district_code", "districtCode", ""); value != "" {
		input["district_code"] = value
	}
	if value := strDefaultEither(input, "neighborhood_id", "neighborhoodId", ""); value != "" {
		input["neighborhood_id"] = value
	}
	neighborhood := strings.TrimSpace(firstNonEmpty(str(input, "neighborhood"), str(input, "sector")))
	if neighborhood != "" {
		input["neighborhood"] = neighborhood
		input["sector"] = neighborhood
	}
	if value, ok := input["street_number"]; ok {
		input["street_number"] = onlyDigits(fmt.Sprint(value))
	}
	if strings.TrimSpace(str(input, "address")) == "" && hasAddressFields(input) {
		input["address"] = composeAddress(input)
	}
}

func hasAddressFields(input map[string]any) bool {
	for _, key := range []string{"province", "municipality", "neighborhood", "sector", "street", "street_number"} {
		if strings.TrimSpace(fmt.Sprint(input[key])) != "" && strings.TrimSpace(fmt.Sprint(input[key])) != "<nil>" {
			return true
		}
	}
	return false
}

func composeAddress(input map[string]any) string {
	neighborhood := firstNonEmpty(str(input, "neighborhood"), str(input, "sector"))
	streetNumber := strings.TrimSpace(strings.Join([]string{str(input, "street"), onlyDigits(str(input, "street_number"))}, " "))
	parts := []string{}
	for _, value := range []string{streetNumber, neighborhood, str(input, "municipality"), str(input, "province")} {
		value = strings.TrimSpace(value)
		if value != "" {
			parts = append(parts, value)
		}
	}
	return strings.Join(parts, ", ")
}

func normalizeWhatsappDigits(value string) string {
	digits := onlyDigits(value)
	if len(digits) == 11 && strings.HasPrefix(digits, "1") {
		digits = digits[1:]
	}
	if len(digits) > 10 {
		digits = digits[len(digits)-10:]
	}
	return digits
}

func onlyDigits(value string) string {
	var b strings.Builder
	for _, r := range value {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func normalizeNationalID(value string) string {
	digits := onlyDigits(value)
	if len(digits) > 11 {
		digits = digits[:11]
	}
	if len(digits) <= 3 {
		return digits
	}
	if len(digits) <= 10 {
		return digits[:3] + "-" + digits[3:]
	}
	return digits[:3] + "-" + digits[3:10] + "-" + digits[10:]
}

func validDominicanNationalID(value string) bool {
	digits := onlyDigits(value)
	if len(digits) != 11 {
		return false
	}
	repeated := true
	for i := 1; i < len(digits); i++ {
		if digits[i] != digits[0] {
			repeated = false
			break
		}
	}
	if repeated {
		return false
	}
	sum := 0
	for i := 0; i < 10; i++ {
		multiplier := 1
		if i%2 == 1 {
			multiplier = 2
		}
		product := int(digits[i]-'0') * multiplier
		if product > 9 {
			product = (product / 10) + (product % 10)
		}
		sum += product
	}
	checkDigit := (10 - (sum % 10)) % 10
	return checkDigit == int(digits[10]-'0')
}

func (s *Server) ensureNationalIDAvailable(ctx context.Context, nationalID, ownerTable, ownerID string) error {
	digits := onlyDigits(nationalID)
	if digits == "" {
		return nil
	}
	rows, err := s.db.Query(ctx, `
		SELECT source, record_id FROM (
			SELECT 'customers' AS source, id::text AS record_id FROM customers WHERE regexp_replace(national_id, '\D', '', 'g') = $1
			UNION ALL
			SELECT 'system_users' AS source, id::text AS record_id FROM system_users WHERE regexp_replace(national_id, '\D', '', 'g') = $1
			UNION ALL
			SELECT 'admin_profiles' AS source, username AS record_id FROM admin_profiles WHERE regexp_replace(national_id, '\D', '', 'g') = $1
		) cedulas
	`, digits)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var source, recordID string
		if err := rows.Scan(&source, &recordID); err != nil {
			return err
		}
		if source == ownerTable && recordID == ownerID {
			continue
		}
		return apiError{status: http.StatusConflict, msg: "Ya existe un usuario o cliente registrado con esa cédula"}
	}
	return rows.Err()
}

func normalizeStaffRole(role string) string {
	role = strings.ToLower(strings.TrimSpace(role))
	switch role {
	case "administrator":
		return "administrator"
	case "cashier":
		return "cashier"
	case "delivery_driver":
		return "delivery_driver"
	default:
		return ""
	}
}

func roleLabel(role string) string {
	switch normalizeStaffRole(role) {
	case "administrator":
		return "Administrador"
	case "cashier":
		return "Cajero"
	case "delivery_driver":
		return "Repartidor"
	default:
		return "Usuario"
	}
}

func splitFullName(value string) (string, string) {
	parts := strings.Fields(strings.TrimSpace(value))
	if len(parts) == 0 {
		return "", ""
	}
	if len(parts) == 1 {
		return parts[0], ""
	}
	return parts[0], strings.Join(parts[1:], " ")
}

type adminProfileDefaults struct {
	FirstName         string
	LastName          string
	NationalID        string
	Whatsapp          string
	ProfilePictureURL string
}

func (s *Server) adminDefaultsFromTenant(ctx context.Context) adminProfileDefaults {
	if s.tenantManager == nil || s.tenantManager.CoreDB() == nil {
		return adminProfileDefaults{}
	}
	tenantID := tenantIDFromContext(ctx)
	if strings.TrimSpace(tenantID) == "" {
		return adminProfileDefaults{}
	}
	var defaults adminProfileDefaults
	var ownerName string
	_ = s.tenantManager.CoreDB().QueryRow(ctx, `
		SELECT COALESCE(o.first_name,''), COALESCE(o.last_name,''), COALESCE(NULLIF(o.name,''), t.owner_name, ''),
		       COALESCE(NULLIF(o.national_id,''), ''), COALESCE(NULLIF(o.whatsapp,''), t.owner_whatsapp, ''),
		       COALESCE(NULLIF(o.profile_picture_url,''), '')
		FROM tenants t
		LEFT JOIN platform_owners o ON o.id=t.owner_id
		WHERE t.id=$1::uuid LIMIT 1
	`, tenantID).Scan(&defaults.FirstName, &defaults.LastName, &ownerName, &defaults.NationalID, &defaults.Whatsapp, &defaults.ProfilePictureURL)
	if defaults.FirstName == "" && ownerName != "" {
		defaults.FirstName, defaults.LastName = splitFullName(ownerName)
	}
	defaults.NationalID = normalizeNationalID(defaults.NationalID)
	return defaults
}

func adminProfileScanPtrs(p *AdminProfile) []any {
	return []any{&p.Username, &p.Name, &p.LastName, &p.NationalID, &p.Whatsapp, &p.WhatsappDisplay, &p.ProfilePictureURL, &p.CountryCode, &p.DialCode, &p.PasswordHash, &p.CreatedAt, &p.UpdatedAt}
}

func (s *Server) ensureAdminProfile(ctx context.Context, username string) (AdminProfile, error) {
	username = strings.TrimSpace(username)
	if username == "" {
		username = s.cfg.AdminUsername
	}
	defaults := s.adminDefaultsFromTenant(ctx)
	defaultName := strings.TrimSpace(defaults.FirstName)
	if defaultName == "" {
		defaultName = "Administrador"
	}
	_, err := s.db.Exec(ctx, `
		INSERT INTO admin_profiles (username, name, last_name, national_id, whatsapp, whatsapp_display, profile_picture_url, country_code, dial_code)
		VALUES ($1, $2, $3, $4, $5, $5, $6, 'do', '+1')
		ON CONFLICT (username) DO NOTHING
	`, username, defaultName, strings.TrimSpace(defaults.LastName), strings.TrimSpace(defaults.NationalID), strings.TrimSpace(defaults.Whatsapp), strings.TrimSpace(defaults.ProfilePictureURL))
	if err != nil {
		return AdminProfile{}, err
	}
	if defaults.FirstName != "" || defaults.LastName != "" || defaults.NationalID != "" || defaults.Whatsapp != "" || defaults.ProfilePictureURL != "" {
		fullDefaultName := strings.TrimSpace(strings.TrimSpace(defaults.FirstName) + " " + strings.TrimSpace(defaults.LastName))
		_, _ = s.db.Exec(ctx, `
			UPDATE admin_profiles
			SET name=CASE WHEN $2 <> '' AND (trim(name) = '' OR trim(name) = 'Administrador' OR (trim(last_name) = '' AND trim(name) = $6)) THEN $2 ELSE name END,
			    last_name=CASE WHEN $3 <> '' AND trim(last_name) = '' THEN $3 ELSE last_name END,
			    national_id=CASE WHEN $4 <> '' AND trim(national_id) = '' THEN $4 ELSE national_id END,
			    whatsapp=CASE WHEN $5 <> '' AND trim(whatsapp) = '' THEN $5 ELSE whatsapp END,
			    whatsapp_display=CASE WHEN $5 <> '' AND trim(whatsapp_display) = '' THEN $5 ELSE whatsapp_display END,
			    profile_picture_url=CASE WHEN $7 <> '' AND trim(profile_picture_url) = '' THEN $7 ELSE profile_picture_url END,
			    updated_at=now()
			WHERE username=$1
		`, username, strings.TrimSpace(defaults.FirstName), strings.TrimSpace(defaults.LastName), strings.TrimSpace(defaults.NationalID), strings.TrimSpace(defaults.Whatsapp), fullDefaultName, strings.TrimSpace(defaults.ProfilePictureURL))
	}
	profile, err := s.getAdminProfile(ctx, username)
	if err != nil {
		return AdminProfile{}, err
	}
	return s.hydrateAdminProfileAvatar(ctx, profile), nil
}

func (s *Server) hydrateAdminProfileAvatar(ctx context.Context, profile AdminProfile) AdminProfile {
	if strings.TrimSpace(profile.ProfilePictureURL) != "" || strings.TrimSpace(profile.Whatsapp) == "" {
		return profile
	}
	url := s.fetchPlatformWhatsAppAvatarURL(ctx, profile.Whatsapp)
	if url == "" {
		return profile
	}
	profile.ProfilePictureURL = url
	_, _ = s.db.Exec(ctx, `UPDATE admin_profiles SET profile_picture_url=$2, updated_at=now() WHERE username=$1`, profile.Username, url)
	return profile
}

func (s *Server) getAdminProfile(ctx context.Context, username string) (AdminProfile, error) {
	var profile AdminProfile
	err := s.db.QueryRow(ctx, `
		SELECT username, name, last_name, national_id, whatsapp, whatsapp_display, COALESCE(profile_picture_url,''), country_code, dial_code, password_hash, created_at, updated_at
		FROM admin_profiles WHERE username=$1
	`, username).Scan(adminProfileScanPtrs(&profile)...)
	return profile, err
}

func (s *Server) resolveStaffAvatarURL(ctx context.Context, currentURL, whatsapp, nationalID string) string {
	currentURL = strings.TrimSpace(currentURL)
	if currentURL != "" {
		return currentURL
	}
	if url := s.findTenantAdminProfileAvatarURL(ctx, whatsapp, nationalID); url != "" {
		return url
	}
	if url := s.findPlatformOwnerAvatarURL(ctx, whatsapp, nationalID); url != "" {
		return url
	}
	return s.fetchPlatformWhatsAppAvatarURL(ctx, whatsapp)
}

func (s *Server) findTenantAdminProfileAvatarURL(ctx context.Context, whatsapp, nationalID string) string {
	phone := normalizeWhatsappDigits(whatsapp)
	nationalIDDigits := onlyDigits(nationalID)
	if phone == "" && nationalIDDigits == "" {
		return ""
	}
	var url string
	err := s.db.QueryRow(ctx, `
		SELECT COALESCE(profile_picture_url,'')
		FROM admin_profiles
		WHERE COALESCE(profile_picture_url,'') <> ''
		  AND (
			($1 <> '' AND (
				right(regexp_replace(username, '\D', '', 'g'), 10)=$1
				OR right(regexp_replace(whatsapp, '\D', '', 'g'), 10)=$1
			))
			OR ($2 <> '' AND regexp_replace(national_id, '\D', '', 'g')=$2)
		  )
		ORDER BY updated_at DESC
		LIMIT 1
	`, phone, nationalIDDigits).Scan(&url)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(url)
}

func (s *Server) findPlatformOwnerAvatarURL(ctx context.Context, whatsapp, nationalID string) string {
	if s.tenantManager == nil || s.tenantManager.CoreDB() == nil {
		return ""
	}
	phone := normalizeWhatsappDigits(whatsapp)
	nationalIDDigits := onlyDigits(nationalID)
	if phone == "" && nationalIDDigits == "" {
		return ""
	}
	var url string
	err := s.tenantManager.CoreDB().QueryRow(ctx, `
		SELECT COALESCE(profile_picture_url,'')
		FROM platform_owners
		WHERE COALESCE(profile_picture_url,'') <> ''
		  AND (
			($1 <> '' AND (
				whatsapp_digits=$1
				OR right(regexp_replace(whatsapp, '\D', '', 'g'), 10)=$1
			))
			OR ($2 <> '' AND (
				national_id_digits=$2
				OR regexp_replace(national_id, '\D', '', 'g')=$2
			))
		  )
		ORDER BY updated_at DESC
		LIMIT 1
	`, phone, nationalIDDigits).Scan(&url)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(url)
}

func (s *Server) hydrateStaffUserAvatar(ctx context.Context, user StaffUser) StaffUser {
	if strings.TrimSpace(user.ProfilePictureURL) != "" || (strings.TrimSpace(user.Whatsapp) == "" && strings.TrimSpace(user.NationalID) == "") {
		return user
	}
	url := s.resolveStaffAvatarURL(ctx, user.ProfilePictureURL, user.Whatsapp, user.NationalID)
	if url == "" {
		return user
	}
	user.ProfilePictureURL = url
	_, _ = s.db.Exec(ctx, `UPDATE system_users SET profile_picture_url=$2, updated_at=now() WHERE id=$1::uuid AND COALESCE(profile_picture_url,'')=''`, user.ID, url)
	return user
}

func (s *Server) querySystemUsers(ctx context.Context) ([]StaffUser, error) {
	rows, err := s.db.Query(ctx, `SELECT id::text, name, last_name, national_id, whatsapp, whatsapp_display, COALESCE(profile_picture_url,''), country_code, dial_code, role, COALESCE(permissions,'{}'::jsonb), active, created_at, updated_at FROM system_users ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := []StaffUser{}
	for rows.Next() {
		var u StaffUser
		if err := rows.Scan(staffUserScanPtrs(&u)...); err != nil {
			return nil, err
		}
		users = append(users, s.hydrateStaffUserAvatar(ctx, u))
	}
	return users, rows.Err()
}

func (s *Server) getSystemUser(ctx context.Context, id string) (StaffUser, error) {
	var u StaffUser
	err := s.db.QueryRow(ctx, `SELECT id::text, name, last_name, national_id, whatsapp, whatsapp_display, COALESCE(profile_picture_url,''), country_code, dial_code, role, COALESCE(permissions,'{}'::jsonb), active, created_at, updated_at FROM system_users WHERE id=$1`, id).Scan(staffUserScanPtrs(&u)...)
	if err != nil {
		return u, err
	}
	return s.hydrateStaffUserAvatar(ctx, u), nil
}

func (s *Server) insertSystemUser(ctx context.Context, input map[string]any, pin string) (StaffUser, error) {
	name := strings.TrimSpace(str(input, "name"))
	if name == "" {
		name = strings.TrimSpace(str(input, "name"))
	}
	lastName := strings.TrimSpace(strEither(input, "last_name", "last_name"))
	nationalID := normalizeNationalID(str(input, "national_id"))
	whatsapp := strings.TrimSpace(str(input, "whatsapp"))
	role := normalizeStaffRole(str(input, "role"))
	if name == "" || lastName == "" || nationalID == "" || whatsapp == "" {
		return StaffUser{}, badRequest("Nombre, apellido, cédula y WhatsApp son requeridos")
	}
	if role == "" {
		return StaffUser{}, badRequest("Selecciona el rol Administrador, Cajero o Repartidor")
	}
	if !validDominicanNationalID(nationalID) {
		return StaffUser{}, badRequest("Ingresa una cédula dominicana válida")
	}
	if err := s.ensureNationalIDAvailable(ctx, nationalID, "", ""); err != nil {
		return StaffUser{}, err
	}
	if len(onlyDigits(whatsapp)) < 10 {
		return StaffUser{}, badRequest("Ingresa un WhatsApp válido")
	}
	profilePictureURL := strings.TrimSpace(firstNonEmpty(strEither(input, "profile_picture_url", "profilePictureUrl"), strEither(input, "avatar_url", "avatarUrl")))
	profilePictureURL = s.resolveStaffAvatarURL(ctx, profilePictureURL, whatsapp, nationalID)
	pinHash, err := hashAccessSecret(pin)
	if err != nil {
		return StaffUser{}, err
	}
	var u StaffUser
	err = s.db.QueryRow(ctx, `
		INSERT INTO system_users (name, last_name, national_id, whatsapp, whatsapp_display, profile_picture_url, country_code, dial_code, pin_hash, role, permissions, active)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
		RETURNING id::text, name, last_name, national_id, whatsapp, whatsapp_display, COALESCE(profile_picture_url,''), country_code, dial_code, role, COALESCE(permissions,'{}'::jsonb), active, created_at, updated_at
	`, name, lastName, nationalID, whatsapp, strEither(input, "whatsapp_display", "whatsappDisplay"), profilePictureURL, strDefaultEither(input, "country_code", "countryCode", "do"), strDefaultEither(input, "dial_code", "dialCode", "+1"), pinHash, role, normalizedStaffPermissionsJSON(role, input["permissions"]), boolDefault(input, "active", true)).Scan(staffUserScanPtrs(&u)...)
	return u, err
}

func (s *Server) updateReturningSystemUser(ctx context.Context, id string, input map[string]any) (StaffUser, error) {
	updates := map[string]any{}
	for _, key := range []string{"name", "name", "last_name", "last_name", "national_id", "whatsapp", "whatsapp_display", "whatsappDisplay", "country_code", "countryCode", "dial_code", "dialCode", "profile_picture_url", "profilePictureUrl", "avatar_url", "avatarUrl", "role", "permissions", "active"} {
		if value, ok := input[key]; ok {
			updates[key] = value
		}
	}
	if pin := strings.TrimSpace(str(input, "pin")); pin != "" {
		if !s.validNewAccessPIN(ctx, pin) {
			return StaffUser{}, badRequest(accessPINLengthMessage(s.accessPINLength(ctx)))
		}
		pinHash, err := hashAccessSecret(pin)
		if err != nil {
			return StaffUser{}, err
		}
		updates["pin_hash"] = pinHash
	}
	if roleRaw, ok := updates["role"]; ok {
		role := normalizeStaffRole(fmt.Sprint(roleRaw))
		if role == "" {
			return StaffUser{}, badRequest("Selecciona el rol Administrador, Cajero o Repartidor")
		}
		updates["role"] = role
	}
	if value, ok := updates["whatsappDisplay"]; ok {
		updates["whatsapp_display"] = value
		delete(updates, "whatsappDisplay")
	}
	if value, ok := updates["countryCode"]; ok {
		updates["country_code"] = value
		delete(updates, "countryCode")
	}
	if value, ok := updates["dialCode"]; ok {
		updates["dial_code"] = value
		delete(updates, "dialCode")
	}
	if value, ok := updates["profilePictureUrl"]; ok {
		updates["profile_picture_url"] = value
		delete(updates, "profilePictureUrl")
	}
	if value, ok := updates["avatar_url"]; ok {
		updates["profile_picture_url"] = value
		delete(updates, "avatar_url")
	}
	if value, ok := updates["avatarUrl"]; ok {
		updates["profile_picture_url"] = value
		delete(updates, "avatarUrl")
	}
	if strings.TrimSpace(str(updates, "profile_picture_url")) == "" {
		lookupWhatsapp := firstNonEmpty(fmt.Sprint(updates["whatsapp"]), str(input, "whatsapp"))
		lookupNationalID := firstNonEmpty(fmt.Sprint(updates["national_id"]), str(input, "national_id"))
		if url := s.resolveStaffAvatarURL(ctx, "", lookupWhatsapp, lookupNationalID); url != "" {
			updates["profile_picture_url"] = url
		}
	}
	if value, ok := updates["national_id"]; ok {
		nationalID := normalizeNationalID(fmt.Sprint(value))
		if nationalID == "" || !validDominicanNationalID(nationalID) {
			return StaffUser{}, badRequest("Ingresa una cédula dominicana válida")
		}
		if err := s.ensureNationalIDAvailable(ctx, nationalID, "system_users", id); err != nil {
			return StaffUser{}, err
		}
		updates["national_id"] = nationalID
	}
	if _, hasPermissions := updates["permissions"]; hasPermissions {
		existing, err := s.getSystemUser(ctx, id)
		if err != nil {
			return StaffUser{}, err
		}
		role := existing.Role
		if roleRaw, ok := updates["role"]; ok {
			role = fmt.Sprint(roleRaw)
		}
		updates["permissions"] = normalizedStaffPermissionsJSON(role, updates["permissions"])
	} else if roleRaw, roleChanged := updates["role"]; roleChanged {
		updates["permissions"] = normalizedStaffPermissionsJSON(fmt.Sprint(roleRaw), nil)
	}
	allowed := map[string]string{"name": "name", "last_name": "last_name", "national_id": "national_id", "whatsapp": "whatsapp", "whatsapp_display": "whatsapp_display", "country_code": "country_code", "dial_code": "dial_code", "profile_picture_url": "profile_picture_url", "pin_hash": "pin_hash", "role": "role", "permissions": "permissions", "active": "active"}
	set, args := buildSet(updates, allowed)
	if set == "" {
		return s.getSystemUser(ctx, id)
	}
	set = set + ", updated_at=now()"
	args = append([]any{id}, args...)
	var u StaffUser
	err := s.db.QueryRow(ctx, `UPDATE system_users SET `+set+` WHERE id=$1 RETURNING id::text, name, last_name, national_id, whatsapp, whatsapp_display, COALESCE(profile_picture_url,''), country_code, dial_code, role, COALESCE(permissions,'{}'::jsonb), active, created_at, updated_at`, args...).Scan(staffUserScanPtrs(&u)...)
	if err != nil {
		return u, err
	}
	return s.hydrateStaffUserAvatar(ctx, u), nil
}

func (s *Server) queryStores(ctx context.Context) ([]Store, error) {
	return s.queries.ListStores(ctx)
}

func (s *Server) insertDefaultStore(ctx context.Context) (Store, error) {
	return s.insertStore(ctx, map[string]any{"name": "Mi Negocio", "slogan": "Tu negocio listo para vender", "address": "Configura la dirección de tu negocio", "whatsapp": "+18090000000", "whatsapp_display": "(809) 000-0000", "country_code": "do", "dial_code": "+1", "emoji": "🏪", "color": "#00a884", "service_hours": defaultServiceHoursJSON, "delivery_scope": "municipal"})
}

func (s *Server) insertStore(ctx context.Context, input map[string]any) (Store, error) {
	if _, err := normalizeStoreLocationInput(input); err != nil {
		return Store{}, err
	}
	payment := asJSON(input["payment_settings"], defaultPaymentSettingsJSON)
	if v, ok := input["paymentSettings"]; ok {
		payment = asJSON(v, defaultPaymentSettingsJSON)
	}
	serviceHours := asJSON(input["service_hours"], defaultServiceHoursJSON)
	if v, ok := input["serviceHours"]; ok {
		serviceHours = asJSON(v, defaultServiceHoursJSON)
	}
	whatsapp := strEither(input, "whatsapp", "phone")
	address := str(input, "address")
	if address == "" {
		address = composeAddress(input)
	}
	return s.queries.CreateStore(ctx, sqlc.CreateStoreParams{
		Name:              str(input, "name"),
		Slogan:            str(input, "slogan"),
		Address:           address,
		ProvinceCode:      strDefaultEither(input, "province_code", "provinceCode", ""),
		Province:          str(input, "province"),
		MunicipalityCode:  strDefaultEither(input, "municipality_code", "municipalityCode", ""),
		Municipality:      str(input, "municipality"),
		DistrictCode:      strDefaultEither(input, "district_code", "districtCode", ""),
		NeighborhoodID:    strDefaultEither(input, "neighborhood_id", "neighborhoodId", ""),
		Neighborhood:      strings.TrimSpace(firstNonEmpty(str(input, "neighborhood"), str(input, "sector"))),
		Street:            str(input, "street"),
		StreetNumber:      onlyDigits(str(input, "street_number")),
		Whatsapp:          whatsapp,
		WhatsappDisplay:   strDefaultEither(input, "whatsapp_display", "whatsappDisplay", whatsapp),
		CountryCode:       strDefaultEither(input, "country_code", "countryCode", "do"),
		DialCode:          strDefaultEither(input, "dial_code", "dialCode", "+1"),
		Emoji:             strDefault(input, "emoji", "🏪"),
		Color:             strDefault(input, "color", "#00a884"),
		Active:            boolDefault(input, "active", true),
		StoreStatus:       strDefault(input, "store_status", "CERRADA"),
		PaymentSettings:   payment,
		ServiceHours:      serviceHours,
		DeliveryScope:     normalizeDeliveryScopeValue(firstNonEmpty(str(input, "delivery_scope"), str(input, "deliveryScope"))),
		Latitude:          input["latitude"],
		Longitude:         input["longitude"],
		LocationAccuracy:  input["location_accuracy"],
		LocationSource:    strings.TrimSpace(str(input, "location_source")),
		LocationUpdatedAt: input["location_updated_at"],
	})
}

func (s *Server) updateReturningStore(ctx context.Context, id string, allowed map[string]string, input map[string]any) (Store, error) {
	if _, err := normalizeStoreLocationInput(input); err != nil {
		return Store{}, err
	}
	if value, ok := input["street_number"]; ok {
		input["street_number"] = onlyDigits(fmt.Sprint(value))
	}
	if strings.TrimSpace(str(input, "address")) == "" && hasAddressFields(input) {
		input["address"] = composeAddress(input)
	}
	if value, ok := input["deliveryScope"]; ok {
		input["delivery_scope"] = value
		delete(input, "deliveryScope")
	}
	if value, ok := input["delivery_scope"]; ok {
		input["delivery_scope"] = normalizeDeliveryScopeValue(fmt.Sprint(value))
	}
	set, args := buildSet(input, allowed)
	if set == "" {
		return s.queries.GetStore(ctx, id)
	}
	args = append([]any{id}, args...)
	var store Store
	err := s.db.QueryRow(ctx, storeSelectSQL(`UPDATE stores SET `+set+` WHERE id=$1 RETURNING`), args...).Scan(storeScanPtrs(&store)...)
	return store, err
}

func (s *Server) queryProducts(ctx context.Context, storeID string) ([]Product, error) {
	products, err := s.queries.ListProductsByStore(ctx, storeID)
	if err != nil {
		return nil, err
	}
	return s.hydrateProductBarcodes(ctx, products), nil
}

func (s *Server) queryCategories(ctx context.Context, storeID string) ([]string, error) {
	rows, err := s.db.Query(ctx, `
		SELECT name FROM categories WHERE store_id=$1 AND name <> ''
		UNION
		SELECT DISTINCT category AS name FROM products WHERE store_id=$1 AND category <> ''
		ORDER BY name
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		items = append(items, name)
	}
	return items, rows.Err()
}

func (s *Server) queryBrands(ctx context.Context, storeID string) ([]string, error) {
	rows, err := s.db.Query(ctx, `
		SELECT name FROM brands WHERE store_id=$1 AND name <> ''
		UNION
		SELECT DISTINCT brand AS name FROM products WHERE store_id=$1 AND brand <> ''
		ORDER BY name
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		items = append(items, name)
	}
	return items, rows.Err()
}

func (s *Server) ensureBrand(ctx context.Context, storeID string, name string) (Brand, error) {
	name = strings.TrimSpace(name)
	var brand Brand
	if name == "" {
		return brand, badRequest("nombre de marca requerido")
	}
	err := s.db.QueryRow(ctx, `
		INSERT INTO brands (store_id, name)
		VALUES ($1, $2)
		ON CONFLICT (store_id, name) DO UPDATE SET name=EXCLUDED.name
		RETURNING id::text, store_id::text, name, created_at
	`, storeID, name).Scan(&brand.ID, &brand.StoreID, &brand.Name, &brand.CreatedAt)
	return brand, err
}

func (s *Server) ensureCategory(ctx context.Context, storeID string, name string, icon string) (Category, error) {
	name = strings.TrimSpace(name)
	if icon == "" {
		icon = "📦"
	}
	var category Category
	if name == "" {
		return category, badRequest("nombre de categoría requerido")
	}
	err := s.db.QueryRow(ctx, `
		INSERT INTO categories (store_id, name, icon)
		VALUES ($1, $2, $3)
		ON CONFLICT (store_id, name) DO UPDATE SET icon=EXCLUDED.icon
		RETURNING id::text, store_id::text, name, icon, created_at
	`, storeID, name, icon).Scan(&category.ID, &category.StoreID, &category.Name, &category.Icon, &category.CreatedAt)
	return category, err
}

func (s *Server) insertProduct(ctx context.Context, input map[string]any) (Product, error) {
	storeID := strEither(input, "store_id", "storeId")
	if storeID == "" {
		return Product{}, badRequest("Debes seleccionar el negocio")
	}
	if err := s.ensureTenantBarcodeTables(ctx); err != nil {
		return Product{}, err
	}
	globalID := strings.TrimSpace(strEither(input, "global_id", "globalId"))
	barcode := normalizeBarcode(str(input, "barcode"))

	// Activating the same global item or scanning the same barcode must be idempotent.
	var existingID string
	if globalID != "" {
		err := s.db.QueryRow(ctx, `SELECT id::text FROM products WHERE store_id=$1::uuid AND global_id=$2 ORDER BY created_at LIMIT 1`, storeID, globalID).Scan(&existingID)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return Product{}, err
		}
	}
	if existingID == "" && barcode != "" {
		err := s.db.QueryRow(ctx, `SELECT product_id::text FROM product_barcodes WHERE store_id=$1::uuid AND barcode=$2 LIMIT 1`, storeID, barcode).Scan(&existingID)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return Product{}, err
		}
	}
	if existingID != "" {
		product, err := s.queries.GetProduct(ctx, existingID)
		if err != nil {
			return Product{}, err
		}
		if barcode != "" {
			_, err = s.db.Exec(ctx, `
				INSERT INTO product_barcodes (product_id, store_id, barcode)
				VALUES ($1::uuid,$2::uuid,$3)
				ON CONFLICT (product_id) DO UPDATE SET barcode=EXCLUDED.barcode, store_id=EXCLUDED.store_id, updated_at=now()
			`, product.ID, storeID, barcode)
			if err != nil {
				return Product{}, apiError{status: http.StatusConflict, msg: "Este código de barras ya está vinculado a otro producto del negocio"}
			}
			product.Barcode = barcode
		} else {
			product = s.hydrateProductBarcode(ctx, product)
		}
		return product, nil
	}

	category := str(input, "category")
	brand := str(input, "brand")
	format := strDefault(input, "format", "Unidad")
	weightedEnabled := formatUsesWeight(format) && boolDefaultEither(
		input,
		"weighted_sale_enabled",
		"weightedSaleEnabled",
		true,
	)
	categoryIcon := strDefaultEither(input, "category_icon", "categoryIcon", "📦")
	price := float(input, "price")
	product, err := s.queries.CreateProduct(ctx, sqlc.CreateProductParams{
		StoreID:             storeID,
		GlobalID:            globalID,
		Name:                str(input, "name"),
		Description:         str(input, "description"),
		Category:            category,
		CategoryIcon:        categoryIcon,
		Price:               price,
		Cost:                float(input, "cost"),
		Stock:               normalizeInventoryStock(float(input, "stock"), format),
		Image:               str(input, "image"),
		Brand:               brand,
		Format:              format,
		Group:               str(input, "group"),
		Detail:              firstNonEmpty(str(input, "detail"), str(input, "detail_name"), str(input, "detailName")),
		WeightedSaleEnabled: weightedEnabled,
		AllowWeightSales:    true,
		AllowAmountSales:    true,
		WeightUnit:          defaultWeightUnit,
		MinimumWeight:       defaultMinimumWeight,
		WeightIncrement:     defaultWeightIncrement,
		MinimumAmount:       minimumAmountForUnitPrice(price),
		WeightPrecision:     defaultWeightPrecision,
	})
	if err != nil {
		return Product{}, err
	}
	if barcode != "" {
		_, err = s.db.Exec(ctx, `INSERT INTO product_barcodes (product_id, store_id, barcode) VALUES ($1::uuid,$2::uuid,$3)`, product.ID, storeID, barcode)
		if err != nil {
			_, _ = s.db.Exec(ctx, `DELETE FROM products WHERE id=$1::uuid`, product.ID)
			return Product{}, apiError{status: http.StatusConflict, msg: "Este código de barras ya está vinculado a otro producto del negocio"}
		}
		product.Barcode = barcode
	}
	if category != "" {
		_, _ = s.ensureCategory(ctx, storeID, category, categoryIcon)
	}
	if brand != "" {
		_, _ = s.ensureBrand(ctx, storeID, brand)
	}
	return product, nil
}

func (s *Server) updateReturningProduct(ctx context.Context, id string, input map[string]any) (Product, error) {
	current, err := s.queries.GetProduct(ctx, id)
	if err != nil {
		return Product{}, err
	}
	barcodeValue, barcodeProvided := input["barcode"]
	if barcodeProvided {
		delete(input, "barcode")
		if err := s.ensureTenantBarcodeTables(ctx); err != nil {
			return Product{}, err
		}
		barcode := normalizeBarcode(fmt.Sprint(barcodeValue))
		if barcode != "" {
			var conflictingProductID string
			lookupErr := s.db.QueryRow(ctx, `
				SELECT product_id::text
				FROM product_barcodes
				WHERE store_id=$1::uuid AND barcode=$2 AND product_id<>$3::uuid
				LIMIT 1
			`, current.StoreID, barcode, current.ID).Scan(&conflictingProductID)
			if lookupErr == nil {
				return Product{}, apiError{status: http.StatusConflict, msg: "Este código de barras ya está vinculado a otro producto del negocio"}
			}
			if !errors.Is(lookupErr, pgx.ErrNoRows) {
				return Product{}, lookupErr
			}
		}
	}
	effectiveFormat := current.Format
	if rawFormat, ok := input["format"]; ok {
		effectiveFormat = strings.TrimSpace(fmt.Sprint(rawFormat))
	}
	effectivePrice := current.Price
	if _, hasPrice := input["price"]; hasPrice {
		effectivePrice = float(input, "price")
	}
	if _, hasStock := input["stock"]; hasStock {
		input["stock"] = normalizeInventoryStock(float(input, "stock"), effectiveFormat)
	} else if !strings.EqualFold(strings.TrimSpace(effectiveFormat), strings.TrimSpace(current.Format)) {
		input["stock"] = normalizeInventoryStock(current.Stock, effectiveFormat)
	}

	// The simplified weighted-sale interface has no technical fields for the
	// administrator. Keep those values canonical and derive the amount minimum
	// from the current price of a quarter pound.
	for _, key := range []string{
		"minimumWeight", "weightIncrement", "minimumAmount", "weightPrecision",
		"weightUnit", "allowWeightSales", "allowAmountSales",
	} {
		delete(input, key)
	}
	if formatUsesWeight(effectiveFormat) {
		input["minimum_weight"] = defaultMinimumWeight
		input["weight_increment"] = defaultWeightIncrement
		input["minimum_amount"] = minimumAmountForUnitPrice(effectivePrice)
		input["weight_precision"] = defaultWeightPrecision
		input["weight_unit"] = defaultWeightUnit
		input["allow_weight_sales"] = true
		input["allow_amount_sales"] = true
	} else {
		input["weighted_sale_enabled"] = false
		delete(input, "weightedSaleEnabled")
	}
	allowed := map[string]string{"global_id": "global_id", "globalId": "global_id", "name": "name", "description": "description", "category": "category", "category_icon": "category_icon", "categoryIcon": "category_icon", "price": "price", "cost": "cost", "stock": "stock", "image": "image", "brand": "brand", "format": "format", "group": "\"group\"", "detail": "detail", "detail_name": "detail", "detailName": "detail", "weighted_sale_enabled": "weighted_sale_enabled", "weightedSaleEnabled": "weighted_sale_enabled", "allow_weight_sales": "allow_weight_sales", "allowWeightSales": "allow_weight_sales", "allow_amount_sales": "allow_amount_sales", "allowAmountSales": "allow_amount_sales", "weight_unit": "weight_unit", "weightUnit": "weight_unit", "minimum_weight": "minimum_weight", "minimumWeight": "minimum_weight", "weight_increment": "weight_increment", "weightIncrement": "weight_increment", "minimum_amount": "minimum_amount", "minimumAmount": "minimum_amount", "weight_precision": "weight_precision", "weightPrecision": "weight_precision"}
	set, args := buildSet(input, allowed)
	var p Product
	if set == "" {
		p = current
	} else {
		args = append([]any{id}, args...)
		err = s.db.QueryRow(ctx, productSelectSQL(`UPDATE products SET `+set+` WHERE id=$1 RETURNING`), args...).Scan(productScanPtrs(&p)...)
	}
	if err == nil && p.Category != "" {
		_, _ = s.ensureCategory(ctx, p.StoreID, p.Category, p.CategoryIcon)
	}
	if err == nil && p.Brand != "" {
		_, _ = s.ensureBrand(ctx, p.StoreID, p.Brand)
	}
	if err == nil {
		if barcodeProvided {
			if tableErr := s.ensureTenantBarcodeTables(ctx); tableErr != nil {
				return Product{}, tableErr
			}
			barcode := normalizeBarcode(fmt.Sprint(barcodeValue))
			if barcode == "" {
				_, err = s.db.Exec(ctx, `DELETE FROM product_barcodes WHERE product_id=$1::uuid`, p.ID)
			} else {
				_, err = s.db.Exec(ctx, `
					INSERT INTO product_barcodes (product_id, store_id, barcode)
					VALUES ($1::uuid,$2::uuid,$3)
					ON CONFLICT (product_id) DO UPDATE SET store_id=EXCLUDED.store_id, barcode=EXCLUDED.barcode, updated_at=now()
				`, p.ID, p.StoreID, barcode)
				if err != nil {
					return Product{}, apiError{status: http.StatusConflict, msg: "Este código de barras ya está vinculado a otro producto del negocio"}
				}
				p.Barcode = barcode
			}
		} else {
			p = s.hydrateProductBarcode(ctx, p)
		}
	}
	return p, err
}

func (s *Server) querySales(ctx context.Context, storeID string) ([]map[string]any, error) {
	return s.querySalesForViewer(ctx, storeID)
}

func (s *Server) queryStoreCredits(ctx context.Context, storeID string) ([]StoreCredit, error) {
	return s.queryStoreCreditsLimit(ctx, storeID, 500)
}

func (s *Server) queryCustomers(ctx context.Context) ([]Customer, error) {
	customers, err := s.queries.ListCustomers(ctx)
	if err != nil {
		return nil, err
	}
	for index := range customers {
		customers[index].Name = normalizePersonName(customers[index].Name)
	}
	return s.hydrateCustomerAvatars(ctx, customers), nil
}

func (s *Server) hydrateCustomerAvatars(ctx context.Context, customers []Customer) []Customer {
	if len(customers) == 0 {
		return customers
	}
	for i := range customers {
		customers[i] = s.hydrateCustomerAvatar(ctx, customers[i])
	}
	return customers
}

func (s *Server) hydrateCustomerAvatar(ctx context.Context, customer Customer) Customer {
	if strings.TrimSpace(customer.ProfilePictureURL) != "" || strings.TrimSpace(customer.ID) == "" {
		return customer
	}
	url := s.linkedGlobalCustomerProfilePictureURL(ctx, customer)
	if strings.TrimSpace(url) == "" {
		url = s.fetchPlatformWhatsAppAvatarURL(ctx, customer.Whatsapp)
	}
	if strings.TrimSpace(url) == "" {
		return customer
	}
	customer.ProfilePictureURL = strings.TrimSpace(url)
	_, _ = s.db.Exec(ctx, `UPDATE customers SET profile_picture_url=$2 WHERE id=$1::uuid AND COALESCE(profile_picture_url,'')=''`, customer.ID, customer.ProfilePictureURL)
	s.syncGlobalCustomer(ctx, customer)
	return customer
}

func (s *Server) linkedGlobalCustomerProfilePictureURL(ctx context.Context, customer Customer) string {
	if s.tenantManager == nil {
		return ""
	}
	global := s.globalDB()
	if global == nil {
		return ""
	}
	tenantID := tenantIDFromContext(ctx)
	if strings.TrimSpace(tenantID) != "" && strings.TrimSpace(customer.ID) != "" {
		var globalID string
		err := s.tenantManager.CoreDB().QueryRow(ctx, `
			SELECT global_customer_id::text
			FROM tenant_customer_links
			WHERE tenant_id=$1::uuid AND local_customer_id=$2::uuid
			ORDER BY last_seen_at DESC
			LIMIT 1
		`, tenantID, customer.ID).Scan(&globalID)
		if err == nil && strings.TrimSpace(globalID) != "" {
			if url := s.globalCustomerProfilePictureURLByID(ctx, globalID); strings.TrimSpace(url) != "" {
				return url
			}
		}
	}

	nationalIDDigits := onlyDigits(customer.NationalID)
	phoneDigits := onlyDigits(customer.Whatsapp)
	if nationalIDDigits == "" && phoneDigits == "" {
		return ""
	}
	var url string
	err := global.QueryRow(ctx, `
		SELECT COALESCE(profile_picture_url,'')
		FROM global_customers
		WHERE COALESCE(profile_picture_url,'') <> ''
		  AND (
			($1 <> '' AND national_id_digits = $1)
			OR ($2 <> '' AND whatsapp_digits <> '' AND (
				whatsapp_digits = $2
				OR right(whatsapp_digits, 10) = right($2, 10)
				OR right(whatsapp_digits, length($2)) = $2
				OR right($2, length(whatsapp_digits)) = whatsapp_digits
			))
		  )
		ORDER BY updated_at DESC
		LIMIT 1
	`, nationalIDDigits, phoneDigits).Scan(&url)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(url)
}

func (s *Server) globalCustomerProfilePictureURLByID(ctx context.Context, globalID string) string {
	globalID = strings.TrimSpace(globalID)
	if globalID == "" {
		return ""
	}
	var url string
	err := s.globalDB().QueryRow(ctx, `SELECT COALESCE(profile_picture_url,'') FROM global_customers WHERE id=$1::uuid`, globalID).Scan(&url)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(url)
}

func (s *Server) insertCustomer(ctx context.Context, input map[string]any) (Customer, error) {
	nationalID := normalizeNationalID(str(input, "national_id"))
	if nationalID == "" || !validDominicanNationalID(nationalID) {
		return Customer{}, badRequest("Ingresa una cédula dominicana válida")
	}
	if err := s.ensureNationalIDAvailable(ctx, nationalID, "", ""); err != nil {
		return Customer{}, err
	}
	credit := asJSON(input["store_credit"], `{}`)
	if _, hasSnakeCase := input["store_credit"]; !hasSnakeCase {
		if v, ok := input["storeCredit"]; ok {
			credit = asJSON(v, `{}`)
		}
	}
	birthDate := normalizePersonBirthDate(strEither(input, "birth_date", "birthDate"))
	gender := normalizePersonGender(str(input, "gender"))
	if err := validatePersonDemographics(birthDate, gender); err != nil {
		return Customer{}, err
	}
	profilePictureURL := strings.TrimSpace(firstNonEmpty(strEither(input, "profile_picture_url", "profilePictureUrl"), strEither(input, "avatar_url", "avatarUrl")))
	if profilePictureURL == "" {
		profilePictureURL = s.fetchPlatformWhatsAppAvatarURL(ctx, str(input, "whatsapp"))
	}
	customer, err := s.queries.CreateCustomer(ctx, sqlc.CreateCustomerParams{
		Name:              normalizePersonName(str(input, "name")),
		NationalID:        nationalID,
		BirthDate:         birthDate,
		Gender:            gender,
		Whatsapp:          str(input, "whatsapp"),
		WhatsappDisplay:   str(input, "whatsapp_display"),
		ProfilePictureURL: profilePictureURL,
		CountryCode:       strDefault(input, "country_code", "do"),
		DialCode:          strDefault(input, "dial_code", "+1"),
		PinHash:           str(input, "pin_hash"),
		Province:          str(input, "province"),
		ProvinceCode:      strDefaultEither(input, "province_code", "provinceCode", ""),
		Municipality:      str(input, "municipality"),
		MunicipalityCode:  strDefaultEither(input, "municipality_code", "municipalityCode", ""),
		DistrictCode:      strDefaultEither(input, "district_code", "districtCode", ""),
		NeighborhoodID:    strDefaultEither(input, "neighborhood_id", "neighborhoodId", ""),
		Sector:            strings.TrimSpace(firstNonEmpty(str(input, "sector"), str(input, "neighborhood"))),
		Street:            str(input, "street"),
		StreetNumber:      onlyDigits(str(input, "street_number")),
		AddressReference:  str(input, "address_reference"),
		Lat:               str(input, "lat"),
		Lng:               str(input, "lng"),
		StoreCredit:       credit,
	})
	if err == nil {
		s.syncGlobalCustomer(ctx, customer)
	}
	return customer, err
}

type globalCustomerAddress struct {
	Province         string
	ProvinceCode     string
	Municipality     string
	MunicipalityCode string
	DistrictCode     string
	NeighborhoodID   string
	Sector           string
	Street           string
	StreetNumber     string
	AddressReference string
	Lat              string
	Lng              string
}

func hasGlobalCustomerAddress(a globalCustomerAddress) bool {
	return strings.TrimSpace(a.Province) != "" || strings.TrimSpace(a.Municipality) != "" || strings.TrimSpace(a.Sector) != "" || strings.TrimSpace(a.Street) != "" || strings.TrimSpace(a.StreetNumber) != ""
}

func (s *Server) findLinkedGlobalCustomerAddress(ctx context.Context, globalID string) (globalCustomerAddress, bool) {
	if s.tenantManager == nil || strings.TrimSpace(globalID) == "" {
		return globalCustomerAddress{}, false
	}
	rows, err := s.tenantManager.CoreDB().Query(ctx, `
		SELECT l.tenant_id::text, l.local_customer_id::text, COALESCE(t.name,''), COALESCE(t.slug,''), COALESCE(d.domain,''), COALESCE(db.database_name,'')
		FROM tenant_customer_links l
		JOIN tenants t ON t.id=l.tenant_id
		LEFT JOIN tenant_domains d ON d.tenant_id=t.id AND d.is_primary=true
		LEFT JOIN tenant_databases db ON db.tenant_id=t.id
		WHERE l.global_customer_id=$1::uuid
		ORDER BY l.last_seen_at DESC
		LIMIT 20
	`, globalID)
	if err != nil {
		return globalCustomerAddress{}, false
	}
	defer rows.Close()
	for rows.Next() {
		var tenantID, localCustomerID, tenantName, tenantSlug, domain, databaseName string
		if err := rows.Scan(&tenantID, &localCustomerID, &tenantName, &tenantSlug, &domain, &databaseName); err != nil {
			continue
		}
		if strings.TrimSpace(databaseName) == "" || strings.TrimSpace(localCustomerID) == "" {
			continue
		}
		pool, err := s.tenantManager.Pool(ctx, tenancy.Tenant{ID: tenantID, Name: tenantName, Slug: tenantSlug, Domain: domain, DatabaseName: databaseName})
		if err != nil {
			continue
		}
		var address globalCustomerAddress
		err = pool.QueryRow(ctx, `
			SELECT province, province_code, municipality, municipality_code, district_code, neighborhood_id, sector, street, street_number, address_reference, lat, lng
			FROM customers
			WHERE id=$1::uuid
			LIMIT 1
		`, localCustomerID).Scan(
			&address.Province, &address.ProvinceCode, &address.Municipality, &address.MunicipalityCode, &address.DistrictCode, &address.NeighborhoodID,
			&address.Sector, &address.Street, &address.StreetNumber, &address.AddressReference, &address.Lat, &address.Lng,
		)
		if err == nil && hasGlobalCustomerAddress(address) {
			return address, true
		}
	}
	return globalCustomerAddress{}, false
}

func (s *Server) createLocalCustomerFromGlobal(ctx context.Context, phoneDigits, pin, storeID string) (*Customer, error) {
	if s.tenantManager == nil || phoneDigits == "" || pin == "" || storeID == "" {
		return nil, nil
	}
	var globalID string
	var name, nationalID, birthDate, gender, whatsapp, whatsappDisplay, profilePictureURL, countryCode, dialCode, globalPinHash string
	var province, provinceCode, municipality, municipalityCode, districtCode, neighborhoodID, sector, street, streetNumber, addressReference, lat, lng string
	err := s.globalDB().QueryRow(ctx, `
		SELECT id::text, name, national_id, COALESCE(birth_date,''), COALESCE(gender,''), whatsapp, whatsapp_display, COALESCE(profile_picture_url,''), country_code, dial_code, pin_hash,
		       province, province_code, municipality, municipality_code, district_code, neighborhood_id, sector, street, street_number, address_reference, lat, lng
		FROM global_customers
		WHERE whatsapp_digits <> ''
		  AND (
			whatsapp_digits = $1
			OR right(whatsapp_digits, 10) = right($1, 10)
			OR right(whatsapp_digits, length($1)) = $1
			OR right($1, length(whatsapp_digits)) = whatsapp_digits
		  )
		ORDER BY updated_at DESC
		LIMIT 1
	`, phoneDigits).Scan(
		&globalID, &name, &nationalID, &birthDate, &gender, &whatsapp, &whatsappDisplay, &profilePictureURL, &countryCode, &dialCode, &globalPinHash,
		&province, &provinceCode, &municipality, &municipalityCode, &districtCode, &neighborhoodID, &sector, &street, &streetNumber, &addressReference, &lat, &lng,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	name = normalizePersonName(name)
	valid, upgrade := verifyAccessSecret(globalPinHash, pin)
	if !valid {
		return nil, nil
	}
	if upgrade {
		modernHash, hashErr := hashAccessSecret(pin)
		if hashErr != nil {
			return nil, hashErr
		}
		globalPinHash = modernHash
		_, _ = s.globalDB().Exec(ctx, `UPDATE global_customers SET pin_hash=$2, updated_at=now() WHERE id=$1::uuid`, globalID, modernHash)
	}
	if province == "" || municipality == "" || sector == "" || street == "" || streetNumber == "" {
		if address, ok := s.findLinkedGlobalCustomerAddress(ctx, globalID); ok {
			province = firstNonEmpty(province, address.Province)
			provinceCode = firstNonEmpty(provinceCode, address.ProvinceCode)
			municipality = firstNonEmpty(municipality, address.Municipality)
			municipalityCode = firstNonEmpty(municipalityCode, address.MunicipalityCode)
			districtCode = firstNonEmpty(districtCode, address.DistrictCode)
			neighborhoodID = firstNonEmpty(neighborhoodID, address.NeighborhoodID)
			sector = firstNonEmpty(sector, address.Sector)
			street = firstNonEmpty(street, address.Street)
			streetNumber = firstNonEmpty(streetNumber, address.StreetNumber)
			addressReference = firstNonEmpty(addressReference, address.AddressReference)
			lat = firstNonEmpty(lat, address.Lat)
			lng = firstNonEmpty(lng, address.Lng)
			_, _ = s.globalDB().Exec(ctx, `
				UPDATE global_customers
				SET province=COALESCE(NULLIF($2,''), province), province_code=COALESCE(NULLIF($3,''), province_code),
				    municipality=COALESCE(NULLIF($4,''), municipality), municipality_code=COALESCE(NULLIF($5,''), municipality_code),
				    district_code=COALESCE(NULLIF($6,''), district_code), neighborhood_id=COALESCE(NULLIF($7,''), neighborhood_id),
				    sector=COALESCE(NULLIF($8,''), sector), street=COALESCE(NULLIF($9,''), street), street_number=COALESCE(NULLIF($10,''), street_number),
				    address_reference=COALESCE(NULLIF($11,''), address_reference), lat=COALESCE(NULLIF($12,''), lat), lng=COALESCE(NULLIF($13,''), lng),
				    updated_at=now()
				WHERE id=$1::uuid
			`, globalID, province, provinceCode, municipality, municipalityCode, districtCode, neighborhoodID, sector, street, streetNumber, addressReference, lat, lng)
		}
	}

	storeCredit := map[string]any{storeID: map[string]any{"enabled": false, "type": "limited", "limit": 0, "status": "active"}}
	creditJSON, _ := json.Marshal(storeCredit)
	input := map[string]any{
		"name":                name,
		"national_id":         nationalID,
		"birth_date":          birthDate,
		"gender":              gender,
		"whatsapp":            whatsapp,
		"whatsapp_display":    whatsappDisplay,
		"profile_picture_url": profilePictureURL,
		"country_code":        firstNonEmpty(countryCode, "do"),
		"dial_code":           firstNonEmpty(dialCode, "+1"),
		"pin_hash":            globalPinHash,
		"province":            province,
		"province_code":       provinceCode,
		"municipality":        municipality,
		"municipality_code":   municipalityCode,
		"district_code":       districtCode,
		"neighborhood_id":     neighborhoodID,
		"sector":              sector,
		"neighborhood":        sector,
		"street":              street,
		"street_number":       streetNumber,
		"address_reference":   addressReference,
		"lat":                 lat,
		"lng":                 lng,
		"store_credit":        json.RawMessage(creditJSON),
	}
	customer, err := s.insertCustomer(ctx, input)
	if err != nil {
		return nil, err
	}
	return &customer, nil
}

func (s *Server) propagateCustomerPINAcrossTenants(ctx context.Context, whatsapp, pinHash string) {
	if s.tenantManager == nil || strings.TrimSpace(pinHash) == "" {
		return
	}
	phoneDigits := onlyDigits(whatsapp)
	if phoneDigits == "" {
		return
	}
	var globalID string
	if err := s.globalDB().QueryRow(ctx, `
		SELECT id::text
		FROM global_customers
		WHERE whatsapp_digits <> '' AND (
			whatsapp_digits=$1
			OR right(whatsapp_digits,10)=right($1,10)
			OR right(whatsapp_digits,length($1))=$1
			OR right($1,length(whatsapp_digits))=whatsapp_digits
		)
		ORDER BY updated_at DESC LIMIT 1
	`, phoneDigits).Scan(&globalID); err != nil || globalID == "" {
		return
	}
	rows, err := s.tenantManager.CoreDB().Query(ctx, `
		SELECT tenant_id::text, local_customer_id::text
		FROM tenant_customer_links
		WHERE global_customer_id=$1::uuid
	`, globalID)
	if err != nil {
		return
	}
	defer rows.Close()
	links := make(map[string][]string)
	for rows.Next() {
		var tenantID, localCustomerID string
		if rows.Scan(&tenantID, &localCustomerID) == nil && tenantID != "" && localCustomerID != "" {
			links[tenantID] = append(links[tenantID], localCustomerID)
		}
	}
	if len(links) == 0 {
		return
	}
	tenants, err := s.tenantManager.ListTenants(ctx)
	if err != nil {
		return
	}
	for _, tenant := range tenants {
		localIDs := links[tenant.ID]
		if len(localIDs) == 0 {
			continue
		}
		pool, err := s.tenantManager.Pool(ctx, tenant)
		if err != nil {
			continue
		}
		for _, localID := range localIDs {
			_, _ = pool.Exec(ctx, `UPDATE customers SET pin_hash=$2 WHERE id=$1::uuid`, localID, pinHash)
		}
	}
}

func (s *Server) syncGlobalCustomer(ctx context.Context, customer Customer) {
	customer.Name = normalizePersonName(customer.Name)
	if s.tenantManager == nil {
		return
	}
	tenant, ok := tenancy.FromContext(ctx)
	if !ok || tenant.ID == "" || customer.ID == "" {
		return
	}
	core := s.tenantManager.CoreDB()
	global := s.globalDB()
	nationalIDDigits := onlyDigits(customer.NationalID)
	phoneDigits := onlyDigits(customer.Whatsapp)
	if nationalIDDigits == "" && phoneDigits == "" {
		return
	}
	var globalID string
	err := global.QueryRow(ctx, `
		SELECT id::text
		FROM global_customers
		WHERE ($1 <> '' AND national_id_digits = $1)
		   OR ($2 <> '' AND whatsapp_digits <> '' AND (
			whatsapp_digits = $2
			OR right(whatsapp_digits, 10) = right($2, 10)
			OR right(whatsapp_digits, length($2)) = $2
			OR right($2, length(whatsapp_digits)) = whatsapp_digits
		   ))
		ORDER BY updated_at DESC
		LIMIT 1
	`, nationalIDDigits, phoneDigits).Scan(&globalID)
	if errors.Is(err, pgx.ErrNoRows) {
		err = global.QueryRow(ctx, `
			INSERT INTO global_customers (
				name, national_id, birth_date, gender, whatsapp, whatsapp_display, profile_picture_url, national_id_digits, whatsapp_digits, country_code, dial_code, pin_hash,
				province, province_code, municipality, municipality_code, district_code, neighborhood_id, sector, street, street_number, address_reference, lat, lng
			)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
			RETURNING id::text
		`,
			customer.Name, customer.NationalID, customer.BirthDate, customer.Gender, customer.Whatsapp, customer.WhatsappDisplay, customer.ProfilePictureURL, nationalIDDigits, phoneDigits, customer.CountryCode, customer.DialCode, customer.PinHash,
			customer.Province, customer.ProvinceCode, customer.Municipality, customer.MunicipalityCode, customer.DistrictCode, customer.NeighborhoodID, customer.Sector, customer.Street, customer.StreetNumber, customer.AddressReference, customer.Lat, customer.Lng,
		).Scan(&globalID)
	} else if err == nil {
		_, _ = global.Exec(ctx, `
			UPDATE global_customers
			SET name=COALESCE(NULLIF($2,''), name),
			    national_id=COALESCE(NULLIF($3,''), national_id),
			    birth_date=COALESCE(NULLIF($4,''), birth_date),
			    gender=COALESCE(NULLIF($5,''), gender),
			    whatsapp=COALESCE(NULLIF($6,''), whatsapp),
			    whatsapp_display=COALESCE(NULLIF($7,''), whatsapp_display),
			    profile_picture_url=COALESCE(NULLIF($8,''), profile_picture_url),
			    national_id_digits=COALESCE(NULLIF($9,''), national_id_digits),
			    whatsapp_digits=COALESCE(NULLIF($10,''), whatsapp_digits),
			    country_code=COALESCE(NULLIF($11,''), country_code),
			    dial_code=COALESCE(NULLIF($12,''), dial_code),
			    pin_hash=COALESCE(NULLIF($13,''), pin_hash),
			    province=COALESCE(NULLIF($14,''), province),
			    province_code=COALESCE(NULLIF($15,''), province_code),
			    municipality=COALESCE(NULLIF($16,''), municipality),
			    municipality_code=COALESCE(NULLIF($17,''), municipality_code),
			    district_code=COALESCE(NULLIF($18,''), district_code),
			    neighborhood_id=COALESCE(NULLIF($19,''), neighborhood_id),
			    sector=COALESCE(NULLIF($20,''), sector),
			    street=COALESCE(NULLIF($21,''), street),
			    street_number=COALESCE(NULLIF($22,''), street_number),
			    address_reference=COALESCE(NULLIF($23,''), address_reference),
			    lat=COALESCE(NULLIF($24,''), lat),
			    lng=COALESCE(NULLIF($25,''), lng),
			    updated_at=now()
			WHERE id=$1::uuid
		`,
			globalID, customer.Name, customer.NationalID, customer.BirthDate, customer.Gender, customer.Whatsapp, customer.WhatsappDisplay, customer.ProfilePictureURL, nationalIDDigits, phoneDigits, customer.CountryCode, customer.DialCode, customer.PinHash,
			customer.Province, customer.ProvinceCode, customer.Municipality, customer.MunicipalityCode, customer.DistrictCode, customer.NeighborhoodID, customer.Sector, customer.Street, customer.StreetNumber, customer.AddressReference, customer.Lat, customer.Lng,
		)
	}
	if err != nil || globalID == "" {
		return
	}
	_, _ = core.Exec(ctx, `
		INSERT INTO tenant_customer_links (tenant_id, global_customer_id, local_customer_id)
		VALUES ($1::uuid, $2::uuid, $3::uuid)
		ON CONFLICT (tenant_id, local_customer_id) DO UPDATE
		SET global_customer_id=EXCLUDED.global_customer_id, last_seen_at=now()
	`, tenant.ID, globalID, customer.ID)
}

func (s *Server) updateReturningCustomer(ctx context.Context, id string, input map[string]any) (Customer, error) {
	if value, ok := input["name"]; ok {
		input["name"] = normalizePersonName(fmt.Sprint(value))
	}
	if value, ok := input["national_id"]; ok {
		nationalID := normalizeNationalID(fmt.Sprint(value))
		if nationalID == "" || !validDominicanNationalID(nationalID) {
			return Customer{}, badRequest("Ingresa una cédula dominicana válida")
		}
		if err := s.ensureNationalIDAvailable(ctx, nationalID, "customers", id); err != nil {
			return Customer{}, err
		}
		input["national_id"] = nationalID
	}
	if value, ok := input["birth_date"]; ok {
		input["birth_date"] = normalizePersonBirthDate(fmt.Sprint(value))
	}
	if value, ok := input["birthDate"]; ok {
		input["birthDate"] = normalizePersonBirthDate(fmt.Sprint(value))
	}
	if value, ok := input["gender"]; ok {
		input["gender"] = normalizePersonGender(fmt.Sprint(value))
	}
	_, hasBirthDate := input["birth_date"]
	_, hasBirthDateCamel := input["birthDate"]
	_, hasGender := input["gender"]
	if hasBirthDate || hasBirthDateCamel || hasGender {
		if err := validatePersonDemographics(
			normalizePersonBirthDate(strEither(input, "birth_date", "birthDate")),
			normalizePersonGender(str(input, "gender")),
		); err != nil {
			return Customer{}, err
		}
	}
	if value, ok := input["street_number"]; ok {
		input["street_number"] = onlyDigits(fmt.Sprint(value))
	}
	if value, ok := input["profilePictureUrl"]; ok {
		input["profile_picture_url"] = value
		delete(input, "profilePictureUrl")
	}
	if value, ok := input["avatar_url"]; ok {
		input["profile_picture_url"] = value
		delete(input, "avatar_url")
	}
	if value, ok := input["avatarUrl"]; ok {
		input["profile_picture_url"] = value
		delete(input, "avatarUrl")
	}
	if value, ok := input["whatsapp"]; ok && strings.TrimSpace(str(input, "profile_picture_url")) == "" {
		if url := s.fetchPlatformWhatsAppAvatarURL(ctx, fmt.Sprint(value)); url != "" {
			input["profile_picture_url"] = url
		}
	}
	allowed := map[string]string{"name": "name", "national_id": "national_id", "birth_date": "birth_date", "birthDate": "birth_date", "gender": "gender", "whatsapp": "whatsapp", "whatsapp_display": "whatsapp_display", "whatsappDisplay": "whatsapp_display", "country_code": "country_code", "countryCode": "country_code", "dial_code": "dial_code", "dialCode": "dial_code", "profile_picture_url": "profile_picture_url", "pin_hash": "pin_hash", "province": "province", "province_code": "province_code", "provinceCode": "province_code", "municipality": "municipality", "municipality_code": "municipality_code", "municipalityCode": "municipality_code", "district_code": "district_code", "districtCode": "district_code", "neighborhood_id": "neighborhood_id", "neighborhoodId": "neighborhood_id", "sector": "sector", "neighborhood": "sector", "street": "street", "street_number": "street_number", "address_reference": "address_reference", "lat": "lat", "lng": "lng", "store_credit": "store_credit", "storeCredit": "store_credit"}
	set, args := buildSet(input, allowed)
	if set == "" {
		return s.queries.GetCustomer(ctx, id)
	}
	args = append([]any{id}, args...)
	var c Customer
	err := s.db.QueryRow(ctx, customerSelectSQL(`UPDATE customers SET `+set+` WHERE id=$1 RETURNING`), args...).Scan(customerScanPtrs(&c)...)
	if err == nil {
		s.syncGlobalCustomer(ctx, c)
	}
	return c, err
}

func (s *Server) queryBankAccounts(ctx context.Context) ([]BankAccount, error) {
	return s.queries.ListBankAccounts(ctx)
}

func (s *Server) queryPublicBankAccounts(ctx context.Context) ([]BankAccount, error) {
	rows, err := s.db.Query(ctx, bankSelectSQL(`SELECT`)+` FROM bank_accounts WHERE active=true ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	accounts := []BankAccount{}
	for rows.Next() {
		var account BankAccount
		if err := rows.Scan(bankScanPtrs(&account)...); err != nil {
			return nil, err
		}
		accounts = append(accounts, account)
	}
	return accounts, rows.Err()
}

func (s *Server) insertBankAccount(ctx context.Context, input map[string]any) (BankAccount, error) {
	return s.queries.CreateBankAccount(ctx, sqlc.CreateBankAccountParams{
		Bank:   str(input, "bank"),
		Type:   strDefault(input, "type", "Corriente"),
		Number: str(input, "number"),
		Holder: str(input, "holder"),
		Active: boolDefault(input, "active", true),
	})
}

func (s *Server) updateReturningBankAccount(ctx context.Context, id string, input map[string]any) (BankAccount, error) {
	allowed := map[string]string{"bank": "bank", "type": "type", "number": "number", "holder": "holder", "active": "active"}
	set, args := buildSet(input, allowed)
	if set == "" {
		return s.queries.GetBankAccount(ctx, id)
	}
	args = append([]any{id}, args...)
	var a BankAccount
	err := s.db.QueryRow(ctx, bankSelectSQL(`UPDATE bank_accounts SET `+set+` WHERE id=$1 RETURNING`), args...).Scan(bankScanPtrs(&a)...)
	return a, err
}

func (s *Server) queryCashHistory(ctx context.Context, storeID string) ([]CashHistory, error) {
	return s.queries.ListCashHistoryByStore(ctx, storeID)
}

func storeSelectSQL(prefix string) string {
	return prefix + ` id::text, name, slogan, address, province_code, province, municipality_code, municipality, district_code, neighborhood_id, neighborhood, street, street_number, whatsapp, whatsapp_display, country_code, dial_code, emoji, logo_url, color, active, store_status, payment_settings, service_hours, delivery_scope, latitude, longitude, location_accuracy, location_source, location_updated_at, created_at`
}
func productSelectSQL(prefix string) string {
	return prefix + ` id::text, store_id::text, global_id, name, description, category, category_icon, price, cost, stock, image, brand, format, "group", detail, weighted_sale_enabled, allow_weight_sales, allow_amount_sales, weight_unit, minimum_weight, weight_increment, minimum_amount, weight_precision, track_batches, reorder_point, reorder_target, safety_stock, lead_time_days, COALESCE(preferred_supplier_id::text,''), created_at`
}
func saleSelectSQL(prefix string) string {
	return prefix + ` id::text, store_id::text, items, total, method, customer, date, COALESCE(customer_id::text,''), delivery_address, status, order_type`
}
func storeCreditSelectSQL(prefix string) string {
	return prefix + ` id::text, store_id::text, customer, amount, note, date, status, type,
		COALESCE(customer_id::text,''), COALESCE(due_date::text,''), paid_amount,
		GREATEST(amount-paid_amount,0), reference_type, COALESCE(reference_id::text,''),
		reversed_at, created_by, updated_at`
}
func customerSelectSQL(prefix string) string {
	return prefix + ` id::text, name, national_id, birth_date, gender, whatsapp, whatsapp_display, profile_picture_url, country_code, dial_code, pin_hash, province, province_code, municipality, municipality_code, district_code, neighborhood_id, sector, street, street_number, address_reference, lat, lng, store_credit, registered_at`
}
func bankSelectSQL(prefix string) string {
	return prefix + ` id::text, bank, type, number, holder, active, created_at`
}
func cashSelectSQL(prefix string) string {
	return prefix + ` id::text, store_id::text, opening, closing, summary, created_at`
}

func storeScanPtrs(s *Store) []any {
	return []any{&s.ID, &s.Name, &s.Slogan, &s.Address, &s.ProvinceCode, &s.Province, &s.MunicipalityCode, &s.Municipality, &s.DistrictCode, &s.NeighborhoodID, &s.Neighborhood, &s.Street, &s.StreetNumber, &s.Whatsapp, &s.WhatsappDisplay, &s.CountryCode, &s.DialCode, &s.Emoji, &s.LogoURL, &s.Color, &s.Active, &s.StoreStatus, &s.PaymentSettings, &s.ServiceHours, &s.DeliveryScope, &s.Latitude, &s.Longitude, &s.LocationAccuracy, &s.LocationSource, &s.LocationUpdatedAt, &s.CreatedAt}
}
func productScanPtrs(p *Product) []any {
	return []any{&p.ID, &p.StoreID, &p.GlobalID, &p.Name, &p.Description, &p.Category, &p.CategoryIcon, &p.Price, &p.Cost, &p.Stock, &p.Image, &p.Brand, &p.Format, &p.Group, &p.Detail, &p.WeightedSaleEnabled, &p.AllowWeightSales, &p.AllowAmountSales, &p.WeightUnit, &p.MinimumWeight, &p.WeightIncrement, &p.MinimumAmount, &p.WeightPrecision, &p.TrackBatches, &p.ReorderPoint, &p.ReorderTarget, &p.SafetyStock, &p.LeadTimeDays, &p.PreferredSupplierID, &p.CreatedAt}
}
func saleScanPtrs(s *Sale) []any {
	return []any{&s.ID, &s.StoreID, &s.Items, &s.Total, &s.Method, &s.Customer, &s.Date, &s.CustomerID, &s.DeliveryAddress, &s.Status, &s.OrderType}
}
func storeCreditScanPointers(f *StoreCredit) []any {
	return []any{&f.ID, &f.StoreID, &f.Customer, &f.Amount, &f.Note, &f.Date, &f.Status, &f.Type,
		&f.CustomerID, &f.DueDate, &f.PaidAmount, &f.RemainingAmount, &f.ReferenceType,
		&f.ReferenceID, &f.ReversedAt, &f.CreatedBy, &f.UpdatedAt}
}
func customerScanPtrs(c *Customer) []any {
	return []any{&c.ID, &c.Name, &c.NationalID, &c.BirthDate, &c.Gender, &c.Whatsapp, &c.WhatsappDisplay, &c.ProfilePictureURL, &c.CountryCode, &c.DialCode, &c.PinHash, &c.Province, &c.ProvinceCode, &c.Municipality, &c.MunicipalityCode, &c.DistrictCode, &c.NeighborhoodID, &c.Sector, &c.Street, &c.StreetNumber, &c.AddressReference, &c.Lat, &c.Lng, &c.StoreCredit, &c.RegisteredAt}
}
func bankScanPtrs(a *BankAccount) []any {
	return []any{&a.ID, &a.Bank, &a.Type, &a.Number, &a.Holder, &a.Active, &a.CreatedAt}
}
func cashScanPtrs(c *CashHistory) []any {
	return []any{&c.ID, &c.StoreID, &c.Opening, &c.Closing, &c.Summary, &c.CreatedAt}
}
func staffUserScanPtrs(u *StaffUser) []any {
	return []any{&u.ID, &u.Name, &u.LastName, &u.NationalID, &u.Whatsapp, &u.WhatsappDisplay, &u.ProfilePictureURL, &u.CountryCode, &u.DialCode, &u.Role, &u.Permissions, &u.Active, &u.CreatedAt, &u.UpdatedAt}
}

func buildSet(input map[string]any, allowed map[string]string) (string, []any) {
	sets := []string{}
	args := []any{}
	idx := 2
	seen := map[string]bool{}
	for key, value := range input {
		col, ok := allowed[key]
		if !ok || seen[col] {
			continue
		}
		seen[col] = true
		if isJSONColumn(col) {
			fallback := `{}`
			if col == "items" {
				fallback = `[]`
			}
			value = string(asJSON(value, fallback))
			sets = append(sets, fmt.Sprintf("%s=$%d::jsonb", col, idx))
		} else {
			if n, ok := value.(json.Number); ok {
				f, _ := n.Float64()
				if col == "stock" {
					value = roundDecimal(math.Max(0, f), defaultWeightPrecision)
				} else {
					value = f
				}
			}
			sets = append(sets, fmt.Sprintf("%s=$%d", col, idx))
		}
		args = append(args, value)
		idx++
	}
	return strings.Join(sets, ", "), args
}

func isJSONColumn(col string) bool {
	switch col {
	case "payment_settings", "service_hours", "store_credit", "opening", "closing", "summary", "items", "permissions":
		return true
	default:
		return false
	}
}

type apiError struct {
	status int
	msg    string
}

func (e apiError) Error() string { return e.msg }
func badRequest(msg string) apiError {
	status := http.StatusBadRequest
	if msg == "La solicitud supera el tamaño máximo permitido" {
		status = http.StatusRequestEntityTooLarge
	}
	return apiError{status: status, msg: msg}
}
func forbidden(msg string) apiError { return apiError{status: http.StatusForbidden, msg: msg} }
func notFound(msg string) apiError  { return apiError{status: http.StatusNotFound, msg: msg} }

func writeError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	msg := "error interno del servidor"
	var ae apiError
	if errors.As(err, &ae) {
		status = ae.status
		msg = ae.msg
	}
	if errors.Is(err, pgx.ErrNoRows) {
		status = http.StatusNotFound
		msg = "registro no encontrado"
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		msg = pgErr.Message
		switch pgErr.Code {
		case "22P02":
			status = http.StatusBadRequest
			if strings.Contains(strings.ToLower(pgErr.Message), "json") {
				msg = "Los datos enviados no tienen un formato válido. Actualiza la página e inténtalo nuevamente."
			} else {
				msg = "Uno de los datos enviados no tiene un formato válido"
			}
		case "23505":
			status = http.StatusConflict
			if strings.Contains(pgErr.ConstraintName, "national_id") {
				msg = "Ya existe un usuario o cliente registrado con esa cédula"
			} else if strings.Contains(pgErr.ConstraintName, "whatsapp") {
				msg = "Ya existe un registro con ese WhatsApp"
			} else if strings.Contains(pgErr.ConstraintName, "delivery_zones") {
				msg = "Ya existe una zona de entrega configurada para ese barrio o sector"
			}
		}
	}
	writeJSON(w, status, map[string]string{"error": msg})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func readJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	dec.UseNumber()
	if err := dec.Decode(v); err != nil {
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			return errors.New("La solicitud supera el tamaño máximo permitido")
		}
		return err
	}
	var trailing any
	if err := dec.Decode(&trailing); !errors.Is(err, io.EOF) {
		return errors.New("La solicitud contiene más de un objeto JSON")
	}
	return nil
}

func str(m map[string]any, key string) string {
	if v, ok := m[key]; ok {
		return fmt.Sprint(v)
	}
	return ""
}
func strDefault(m map[string]any, key, def string) string {
	if v := strings.TrimSpace(str(m, key)); v != "" {
		return v
	}
	return def
}
func strEither(m map[string]any, a, b string) string {
	if v := str(m, a); v != "" {
		return v
	}
	return str(m, b)
}
func strDefaultEither(m map[string]any, a, b, def string) string {
	if v := strEither(m, a, b); strings.TrimSpace(v) != "" {
		return v
	}
	return def
}
func boolDefault(m map[string]any, key string, def bool) bool {
	if v, ok := m[key]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
		return strings.EqualFold(fmt.Sprint(v), "true")
	}
	return def
}
func boolDefaultEither(m map[string]any, a, b string, def bool) bool {
	if _, ok := m[a]; ok {
		return boolDefault(m, a, def)
	}
	if _, ok := m[b]; ok {
		return boolDefault(m, b, def)
	}
	return def
}
func positiveFloatEither(m map[string]any, a, b string, def float64) float64 {
	value := firstFloat(m, a, b)
	if value <= 0 {
		return def
	}
	return value
}
func boundedIntEither(m map[string]any, a, b string, def, min, max int) int {
	value := def
	if _, ok := m[a]; ok {
		value = intValue(m, a)
	} else if _, ok := m[b]; ok {
		value = intValue(m, b)
	}
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}
func firstFloat(m map[string]any, keys ...string) float64 {
	for _, key := range keys {
		if _, ok := m[key]; ok {
			return float(m, key)
		}
	}
	return 0
}

func float(m map[string]any, key string) float64 {
	if v, ok := m[key]; ok {
		switch n := v.(type) {
		case json.Number:
			f, _ := n.Float64()
			return f
		case float64:
			return n
		case float32:
			return float64(n)
		case int:
			return float64(n)
		case string:
			var f float64
			_, _ = fmt.Sscan(n, &f)
			return f
		}
	}
	return 0
}
func intValue(m map[string]any, key string) int {
	if v, ok := m[key]; ok {
		switch n := v.(type) {
		case json.Number:
			i, _ := n.Int64()
			return int(i)
		case float64:
			return int(n)
		case int:
			return n
		case string:
			var i int
			_, _ = fmt.Sscan(n, &i)
			return i
		}
	}
	return 0
}
func asJSON(v any, fallback string) json.RawMessage {
	fallback = strings.TrimSpace(fallback)
	if fallback == "" || !json.Valid([]byte(fallback)) {
		fallback = `{}`
	}
	fallbackRaw := json.RawMessage(fallback)
	if v == nil {
		return fallbackRaw
	}

	validOrFallback := func(raw []byte) json.RawMessage {
		trimmed := bytes.TrimSpace(raw)
		if len(trimmed) > 0 && json.Valid(trimmed) {
			return json.RawMessage(trimmed)
		}
		return fallbackRaw
	}

	switch t := v.(type) {
	case json.RawMessage:
		return validOrFallback(t)
	case []byte:
		return validOrFallback(t)
	case string:
		return validOrFallback([]byte(t))
	}
	b, err := json.Marshal(v)
	if err != nil || len(b) == 0 || !json.Valid(b) {
		return fallbackRaw
	}
	return b
}
