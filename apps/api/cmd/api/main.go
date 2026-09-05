package main

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
	"wamercio/api/internal/auth"
	"wamercio/api/internal/config"
	"wamercio/api/internal/geord"
	"wamercio/api/internal/httpx"
	"wamercio/api/internal/identity"
	"wamercio/api/internal/migrate"
	"wamercio/api/internal/store"
	"wamercio/api/internal/whatsapp"
)

type app struct {
	cfg  config.Config
	st   *store.Store
	auth *auth.Manager
	wa   *whatsapp.Client
	id   *identity.Client
	geo  *geord.Client
	rdb  *redis.Client
}

func main() {
	cfg := config.Load()
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		client := &http.Client{Timeout: 2 * time.Second}
		resp, err := client.Get("http://127.0.0.1:8080/healthz")
		if err != nil {
			os.Exit(1)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			os.Exit(1)
		}
		return
	}
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL requerido")
	}
	if len(cfg.JWTSecret) < 32 {
		log.Fatal("JWT_SECRET requerido y debe tener al menos 32 caracteres")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err := waitDB(ctx, db); err != nil {
		log.Fatalf("postgresql no disponible: %v", err)
	}
	log.Printf("postgresql listo")
	if err := migrate.Run(ctx, db); err != nil {
		log.Fatalf("migraciones fallaron: %v", err)
	}
	log.Printf("migraciones aplicadas correctamente")
	var rdb *redis.Client
	ropt, err := redis.ParseURL(cfg.RedisURL)
	if err == nil {
		rdb = redis.NewClient(ropt)
		if pingErr := rdb.Ping(ctx).Err(); pingErr != nil {
			log.Printf("redis no disponible: %v", pingErr)
		} else {
			log.Printf("redis listo")
		}
		defer rdb.Close()
	}
	a := &app{cfg: cfg, st: store.New(db), auth: auth.New(cfg.JWTSecret, cfg.JWTDuration), wa: whatsapp.New(cfg.WaxumBaseURL, cfg.WaxumToken), id: identity.New(cfg.IdentityBaseURL, cfg.IdentityAPIKey, cfg.IdentityClientID, cfg.IdentityApplicationDomain, cfg.IdentityHashSecret), geo: geord.New(cfg.GeoBaseURL, cfg.GeoAPIKey), rdb: rdb}
	if cfg.SuperAdminPassword != "" {
		if err := bootstrapSuperAdmin(ctx, db, cfg); err != nil {
			log.Fatal(err)
		}
	}
	if cfg.SeedDemo {
		if cfg.DemoAdminPassword == "" {
			log.Fatal("DEMO_ADMIN_PASSWORD requerido cuando SEED_DEMO=true")
		}
		if err := seedDemo(ctx, db, cfg); err != nil {
			log.Printf("seed demo: %v", err)
		}
	}
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Recoverer, middleware.Timeout(30*time.Second))
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		httpx.JSON(w, 200, map[string]any{"ok": true, "service": cfg.AppName})
	})
	r.Handle("/media/*", http.StripPrefix("/media/", http.FileServer(http.Dir(cfg.MediaDir))))
	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/auth/login", a.login)
		r.Route("/public", func(r chi.Router) {
			r.Get("/plans", a.publicPlans)
			r.Post("/identity/owner", a.verifyOwnerIdentity)
			r.Post("/identity/business", a.verifyBusinessIdentity)
			r.Post("/identity/customer", a.verifyCustomerIdentity)
			r.Get("/geography", a.publicGeography)
			r.Get("/geo/selectors", a.geoSelectors)
			r.Get("/geo/search", a.geoSearch)
			r.Get("/geo/autocomplete", a.geoAutocomplete)
			r.Get("/geo/reverse", a.geoReverse)
			r.Post("/geo/selections", a.geoConfirmSelection)
			r.Post("/geo/validate-address", a.geoValidateAddress)
			r.Post("/geo/neighborhood-suggestions", a.geoSuggestNeighborhood)
			r.Get("/geo/map/config", a.geoMapConfig)
			r.Get("/geo/map/features", a.geoMapFeatures)
			r.Get("/geo/map/tiles/{z}/{x}/{y}.pbf", a.geoVectorTile)
			r.Post("/geo/route", a.geoRoute)
			r.Get("/tenants/{slug}/delivery/quote", a.geoDeliveryQuote)
			r.Post("/register", a.register)
			r.Get("/marketplaces/{slug}", a.publicMarketplace)
			r.Get("/tenants/{slug}", a.publicTenant)
			r.Get("/tenants/{slug}/catalog", a.catalog)
			r.Get("/tenants/{slug}/products/{id}", a.publicProductDetail)
			r.Post("/tenants/{slug}/customers", a.registerPublicCustomer)
			r.Post("/orders", a.createOrder)
			r.Get("/printer/pending", a.printerPending)
			r.Post("/webhooks/waxum/{tenantID}/{token}", a.waxumWebhook)
			r.Post("/printer/orders/{id}/printed", a.printerMarkPrinted)
		})
		r.Group(func(r chi.Router) {
			r.Use(a.auth.Middleware)
			r.Get("/me", a.me)
			r.Post("/media", a.upload)
			r.Route("/dashboard", func(r chi.Router) {
				r.Use(auth.RequireRoles("tenant_admin", "staff"))
				r.Get("/summary", a.dashboard)
				r.Get("/orders", a.orders)
				r.Get("/orders/{id}", a.orderDetail)
				r.Patch("/orders/{id}/status", a.orderStatus)
				r.Get("/products", a.adminProducts)
				r.Post("/products", a.createProductFull)
				r.Get("/products/{id}", a.productDetail)
				r.Put("/products/{id}", a.updateProduct)
				r.Delete("/products/{id}", a.deleteProduct)
				r.Post("/products/{id}/images", a.addProductImage)
				r.Delete("/products/{id}/images/{imageID}", a.deleteProductImage)
				r.Post("/products/{id}/option-groups", a.addOptionGroup)
				r.Delete("/products/{id}/option-groups/{groupID}", a.deleteOptionGroup)
				r.Get("/categories", a.adminCategories)
				r.Post("/categories", a.createCategory)
				r.Put("/categories/{id}", a.updateCategory)
				r.Delete("/categories/{id}", a.deleteCategory)
				r.Get("/banners", a.banners)
				r.Post("/banners", a.createBanner)
				r.Delete("/banners/{id}", a.deleteBanner)
				r.Get("/coupons", a.coupons)
				r.Post("/coupons", a.createCoupon)
				r.Delete("/coupons/{id}", a.deleteCoupon)
				r.Get("/delivery-zones", a.deliveryZones)
				r.Post("/delivery-zones", a.createDeliveryZone)
				r.Delete("/delivery-zones/{id}", a.deleteDeliveryZone)
				r.Get("/geo/geofences", a.dashboardGeoGeofences)
				r.Get("/geo/geofences/{id}", a.dashboardGeoGeofence)
				r.Post("/delivery-zones/geofence", a.importGeoDeliveryZone)
				r.Get("/opening-hours", a.openingHours)
				r.Put("/opening-hours", a.saveOpeningHours)
				r.Get("/tables", a.tables)
				r.Post("/tables", a.createTable)
				r.Delete("/tables/{id}", a.deleteTable)
				r.Get("/settings", a.settings)
				r.Put("/settings", a.updateSettings)
				r.Get("/subscription", a.subscription)
				r.Get("/report", a.report)
				r.Get("/customers", a.customers)
				r.Get("/integrations", a.integrations)
				r.Put("/integrations", a.saveIntegration)
				r.Put("/notification-templates", a.saveTemplate)
				r.Get("/whatsapp/status", a.waxumStatus)
				r.Post("/whatsapp/connect", a.waxumConnect)
				r.Get("/whatsapp/qr", a.waxumQR)
				r.Post("/whatsapp/disconnect", a.waxumDisconnect)
				r.Delete("/whatsapp/session", a.waxumUnlink)
				r.Post("/whatsapp/messages/text", a.waxumSendText)
				r.Post("/whatsapp/messages/quick-reply", a.waxumSendQuickReply)
				r.Post("/whatsapp/messages/list", a.waxumSendList)
				r.Post("/whatsapp/messages/cta-url", a.waxumSendCTA)
				r.Get("/printer-tokens", a.printerTokens)
				r.Post("/printer-tokens", a.createPrinterToken)
			})
			r.Route("/superadmin", func(r chi.Router) {
				r.Use(auth.RequireRoles("superadmin"))
				r.Get("/summary", a.superSummary)
				r.Get("/tenants", a.tenants)
				r.Get("/plans", a.adminPlans)
				r.Post("/plans", a.createAdminPlan)
				r.Put("/plans/{id}", a.saveAdminPlan)
				r.Get("/users", a.adminUsers)
				r.Post("/users", a.createAdminUser)
				r.Patch("/users/{id}/active", a.setAdminUserActive)
				r.Get("/subscriptions", a.adminSubscriptions)
				r.Post("/subscriptions", a.createAdminSubscription)
				r.Patch("/subscriptions/{id}", a.updateAdminSubscription)
				r.Get("/vouchers", a.adminVouchers)
				r.Post("/vouchers", a.createAdminVoucher)
				r.Delete("/vouchers/{id}", a.deleteAdminVoucher)
				r.Get("/affiliates", a.adminAffiliates)
				r.Post("/affiliates", a.createAdminAffiliate)
				r.Put("/affiliates/{id}", a.updateAdminAffiliate)
				r.Get("/marketplaces", a.adminMarketplaces)
				r.Post("/marketplaces", a.createAdminMarketplace)
				r.Put("/marketplaces/{id}", a.updateAdminMarketplace)
				r.Get("/geography", a.adminGeography)
				r.Get("/settings", a.adminSettings)
				r.Put("/settings", a.saveAdminSettings)
			})
			r.Route("/affiliate", func(r chi.Router) {
				r.Use(auth.RequireRoles("affiliate"))
				r.Get("/summary", a.affiliateSummary)
				r.Get("/tenants", a.affiliateTenants)
			})
		})
	})
	log.Printf("%s escuchando en :8080", cfg.AppName)
	log.Fatal(http.ListenAndServe(":8080", r))
}
func waitDB(ctx context.Context, db *pgxpool.Pool) error {
	var err error
	for i := 0; i < 30; i++ {
		err = db.Ping(ctx)
		if err == nil {
			return nil
		}
		time.Sleep(time.Second)
	}
	return err
}
func bootstrapSuperAdmin(ctx context.Context, db *pgxpool.Pool, c config.Config) error {
	hashAdmin, err := bcrypt.GenerateFromPassword([]byte(c.SuperAdminPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = db.Exec(ctx, `INSERT INTO users(name,email,password_hash,role) VALUES('Super Administrador',$1,$2,'superadmin') ON CONFLICT(email) DO NOTHING`, c.SuperAdminEmail, string(hashAdmin))
	return err
}

func seedDemo(ctx context.Context, db *pgxpool.Pool, c config.Config) error {
	hashDemo, _ := bcrypt.GenerateFromPassword([]byte(c.DemoAdminPassword), bcrypt.DefaultCost)
	var err error
	var tenantID string
	err = db.QueryRow(ctx, `INSERT INTO tenants(name,slug,description,accent_color,whatsapp,email,minimum_order,default_delivery_fee,delivery_enabled,pickup_enabled,table_enabled,marketplace_enabled) VALUES('Colmado Demo','colmado-demo','Tu colmado de confianza, ahora también en línea.','#ff5400','18095550101','demo@wamercio.local',200,100,true,true,false,true) ON CONFLICT(slug) DO UPDATE SET slug=excluded.slug RETURNING id::text`).Scan(&tenantID)
	if err != nil {
		return err
	}
	_, err = db.Exec(ctx, `INSERT INTO users(tenant_id,name,email,password_hash,role) VALUES($1,'Administrador Demo',$2,$3,'tenant_admin') ON CONFLICT(email) DO NOTHING`, tenantID, c.DemoAdminEmail, string(hashDemo))
	if err != nil {
		return err
	}
	var cat string
	err = db.QueryRow(ctx, `INSERT INTO categories(tenant_id,name,position) SELECT $1,'Bebidas',1 WHERE NOT EXISTS(SELECT 1 FROM categories WHERE tenant_id=$1 AND name='Bebidas') RETURNING id::text`, tenantID).Scan(&cat)
	if err != nil {
		_ = db.QueryRow(ctx, `SELECT id::text FROM categories WHERE tenant_id=$1 AND name='Bebidas' LIMIT 1`, tenantID).Scan(&cat)
	}
	_, _ = db.Exec(ctx, `INSERT INTO products(tenant_id,category_id,name,description,reference,price,promo_price,on_sale,featured,visible,active,position) SELECT $1,$2,'Refresco Cola 2L','Refresco familiar de 2 litros.','BEB-001',125,110,true,true,true,true,1 WHERE NOT EXISTS(SELECT 1 FROM products WHERE tenant_id=$1 AND reference='BEB-001')`, tenantID, cat)
	_, _ = db.Exec(ctx, `INSERT INTO products(tenant_id,category_id,name,description,reference,price,on_sale,featured,visible,active,position) SELECT $1,$2,'Agua 1.5L','Agua purificada.','BEB-002',50,false,false,true,true,2 WHERE NOT EXISTS(SELECT 1 FROM products WHERE tenant_id=$1 AND reference='BEB-002')`, tenantID, cat)
	_, _ = db.Exec(ctx, `INSERT INTO subscriptions(tenant_id,plan_id,price,status,expires_at) SELECT $1,p.id,p.monthly_price,'active',current_date+interval '1 year' FROM plans p WHERE p.name='Comercio' AND NOT EXISTS(SELECT 1 FROM subscriptions WHERE tenant_id=$1) LIMIT 1`, tenantID)
	return nil
}

func (a *app) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	u, err := a.st.UserByEmail(r.Context(), in.Email)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(in.Password)) != nil {
		httpx.Error(w, 401, "correo o contraseña incorrectos")
		return
	}
	token, err := a.auth.Sign(u.ID, u.Role, u.TenantID)
	if err != nil {
		httpx.Error(w, 500, "no fue posible crear la sesión")
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "token": token, "user": map[string]any{"id": u.ID, "name": u.Name, "email": u.Email, "role": u.Role, "tenant_id": u.TenantID}})
}
func (a *app) me(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, 200, map[string]any{"ok": true, "claims": auth.From(r)})
}
func (a *app) publicTenant(w http.ResponseWriter, r *http.Request) {
	t, err := a.st.PublicTenant(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		httpx.Error(w, 404, "negocio no encontrado")
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "tenant": t})
}
func (a *app) catalog(w http.ResponseWriter, r *http.Request) {
	t, err := a.st.PublicTenant(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		httpx.Error(w, 404, "negocio no encontrado")
		return
	}
	cats, _ := a.st.Categories(r.Context(), t.ID)
	products, _ := a.st.Products(r.Context(), t.ID, r.URL.Query().Get("category"), r.URL.Query().Get("q"))
	zones, _ := a.st.DeliveryZones(r.Context(), t.ID)
	banners, _ := a.st.Banners(r.Context(), t.ID)
	tables, _ := a.st.PublicTables(r.Context(), t.ID)
	httpx.JSON(w, 200, map[string]any{"ok": true, "tenant": t, "categories": cats, "products": products, "delivery_zones": zones, "banners": banners, "tables": tables})
}
func (a *app) createOrder(w http.ResponseWriter, r *http.Request) {
	if !a.identityRateAllowed(r.Context(), "order-identity", requestIP(r)) {
		httpx.Error(w, 429, "demasiados intentos; intenta nuevamente en un minuto")
		return
	}
	var raw struct {
		TenantSlug        string                 `json:"tenant_slug"`
		CustomerName      string                 `json:"customer_name"`
		Cedula            string                 `json:"cedula"`
		Email             string                 `json:"email"`
		WhatsApp          string                 `json:"whatsapp"`
		DeliveryType      string                 `json:"delivery_type"`
		DeliveryZoneID    string                 `json:"delivery_zone_id"`
		Province          string                 `json:"province"`
		Municipality      string                 `json:"municipality"`
		Sector            string                 `json:"sector"`
		Address           string                 `json:"address"`
		Reference         string                 `json:"reference"`
		GeoProvinceCode   string                 `json:"geo_province_code"`
		GeoCityID         string                 `json:"geo_city_id"`
		GeoNeighborhoodID string                 `json:"geo_neighborhood_id"`
		GeoID             string                 `json:"geo_id"`
		GeoAddressLabel   string                 `json:"geo_address_label"`
		GeoAddressSource  string                 `json:"geo_address_source"`
		Latitude          float64                `json:"latitude"`
		Longitude         float64                `json:"longitude"`
		PaymentMethod     string                 `json:"payment_method"`
		PaymentInfo       string                 `json:"payment_info"`
		CouponCode        string                 `json:"coupon_code"`
		TableNumber       int                    `json:"table_number"`
		Items             []store.OrderItemInput `json:"items"`
	}
	dec := json.NewDecoder(r.Body)
	if dec.Decode(&raw) != nil {
		httpx.Error(w, 400, "pedido inválido")
		return
	}
	raw.WhatsApp = strings.TrimSpace(raw.WhatsApp)
	if strings.TrimSpace(raw.Cedula) == "" || raw.WhatsApp == "" {
		httpx.Error(w, 422, "cédula y WhatsApp son requeridos")
		return
	}
	person, identityErr := a.resolvePersonIdentity(r.Context(), raw.Cedula, a.cfg.IdentityCustomerContext, middleware.GetReqID(r.Context()))
	if identityErr != nil {
		httpx.Error(w, 422, "no fue posible verificar al cliente: "+identityErr.Error())
		return
	}
	raw.CustomerName = person.FullName
	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, raw.WhatsApp)
	localDigits := digits
	if len(localDigits) == 11 && strings.HasPrefix(localDigits, "1") {
		localDigits = localDigits[1:]
	}
	if len(localDigits) != 10 || !(strings.HasPrefix(localDigits, "809") || strings.HasPrefix(localDigits, "829") || strings.HasPrefix(localDigits, "849")) {
		httpx.Error(w, 422, "introduce un número de WhatsApp dominicano válido (809, 829 o 849)")
		return
	}
	raw.WhatsApp = localDigits
	var geoAddr store.GeoAddressInput
	var routeDistance float64
	var routeDuration int
	if raw.DeliveryType == "delivery" {
		if strings.TrimSpace(raw.Address) == "" {
			httpx.Error(w, 422, "la dirección de entrega es requerida")
			return
		}
		if a.geo == nil || !a.geo.Configured() {
			httpx.Error(w, 503, "GEO RD MAP no está configurado")
			return
		}
		if !coordsInsideRD(raw.Latitude, raw.Longitude) {
			httpx.Error(w, 422, "selecciona la ubicación exacta de entrega")
			return
		}
		norm, geoErr := a.normalizeGeoAddress(r.Context(), raw.GeoProvinceCode, raw.GeoCityID, raw.GeoNeighborhoodID, raw.Latitude, raw.Longitude)
		if geoErr != nil {
			httpx.Error(w, 422, "dirección de entrega inválida: "+geoErr.Error())
			return
		}
		raw.Province, raw.Municipality, raw.Sector = norm.ProvinceName, norm.CityName, norm.NeighborhoodName
		if norm.Street != "" && strings.TrimSpace(raw.Address) == "" {
			raw.Address = norm.Street
		}
		geoAddr = store.GeoAddressInput{ProvinceCode: norm.ProvinceCode, CityID: norm.CityID, NeighborhoodID: norm.NeighborhoodID, GeoID: firstNonEmpty(norm.GeoID, raw.GeoID), Label: firstNonEmpty(norm.Label, raw.GeoAddressLabel), Source: firstNonEmpty(norm.Source, raw.GeoAddressSource), ProvinceName: norm.ProvinceName, CityName: norm.CityName, NeighborhoodName: norm.NeighborhoodName, Address: raw.Address, Reference: raw.Reference, Latitude: norm.Latitude, Longitude: norm.Longitude}
		quote, quoteErr := a.resolveDeliveryQuote(r.Context(), raw.TenantSlug, norm.Latitude, norm.Longitude)
		if quoteErr != nil {
			httpx.Error(w, 502, "no fue posible validar la zona de delivery: "+quoteErr.Error())
			return
		}
		if !quote.Serviceable {
			httpx.Error(w, 422, firstNonEmpty(quote.Reason, "esta ubicación está fuera de la zona de delivery"))
			return
		}
		if quote.Matched {
			raw.DeliveryZoneID = quote.Zone.ID
		}
		routeDistance, routeDuration = quote.DistanceKm, quote.DurationSeconds
	}
	if raw.DeliveryType == "table" && raw.TableNumber < 1 {
		httpx.Error(w, 422, "selecciona la mesa")
		return
	}
	in := store.CreateOrderInput{TenantSlug: raw.TenantSlug, CustomerName: raw.CustomerName, CustomerEmail: strings.TrimSpace(raw.Email), WhatsApp: raw.WhatsApp, DeliveryType: raw.DeliveryType, DeliveryZoneID: raw.DeliveryZoneID, Province: raw.Province, Municipality: raw.Municipality, Sector: raw.Sector, Address: raw.Address, Reference: raw.Reference, PaymentMethod: raw.PaymentMethod, PaymentInfo: raw.PaymentInfo, CouponCode: raw.CouponCode, CustomerIdentity: person, GeoAddress: geoAddr, RouteDistanceKm: routeDistance, RouteDurationSeconds: routeDuration, TableNumber: raw.TableNumber, Items: raw.Items}
	o, err := a.st.CreateOrder(r.Context(), in)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	waWarning := ""
	if err := a.sendOrderNotification(r.Context(), o.ID); err != nil {
		waWarning = err.Error()
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "order": o, "whatsapp_warning": waWarning})
}
func (a *app) dashboard(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	x, err := a.st.Dashboard(r.Context(), c.TenantID)
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "summary": x})
}
func (a *app) orders(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	x, err := a.st.Orders(r.Context(), c.TenantID)
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "orders": x})
}
func (a *app) orderStatus(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in struct {
		Status string `json:"status"`
	}
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	allowed := map[string]bool{"pending": true, "accepted": true, "preparing": true, "out_for_delivery": true, "completed": true, "cancelled": true, "refunded": true}
	if !allowed[in.Status] {
		httpx.Error(w, 422, "estado inválido")
		return
	}
	orderID := chi.URLParam(r, "id")
	if err := a.st.UpdateOrderStatus(r.Context(), c.TenantID, orderID, in.Status); err != nil {
		httpx.Error(w, 404, err.Error())
		return
	}
	waWarning := ""
	if err := a.sendOrderStatusNotification(r.Context(), orderID, in.Status); err != nil {
		waWarning = err.Error()
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "whatsapp_warning": waWarning})
}
func (a *app) adminProducts(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	x, err := a.st.AdminProducts(r.Context(), c.TenantID)
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "products": x})
}
func (a *app) createProduct(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in struct {
		Name        string  `json:"Name"`
		CategoryID  string  `json:"CategoryID"`
		Description string  `json:"Description"`
		Reference   string  `json:"Reference"`
		Price       float64 `json:"Price"`
		PromoPrice  float64 `json:"PromoPrice"`
		Featured    bool    `json:"Featured"`
		OnSale      bool    `json:"OnSale"`
	}
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	x, err := a.st.CreateProduct(r.Context(), c.TenantID, in.Name, in.CategoryID, in.Description, in.Reference, in.Price, in.PromoPrice, in.Featured, in.OnSale)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "product": x})
}
func (a *app) adminCategories(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	x, err := a.st.Categories(r.Context(), c.TenantID)
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "categories": x})
}
func (a *app) createCategory(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in struct {
		Name string `json:"name"`
	}
	if httpx.Decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		httpx.Error(w, 400, "nombre requerido")
		return
	}
	x, err := a.st.CreateCategory(r.Context(), c.TenantID, in.Name)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "category": x})
}
func (a *app) superSummary(w http.ResponseWriter, r *http.Request) {
	x, err := a.st.SuperSummary(r.Context())
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "summary": x})
}
func (a *app) tenants(w http.ResponseWriter, r *http.Request) {
	x, err := a.st.Tenants(r.Context())
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "tenants": x})
}
func (a *app) upload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(12 << 20); err != nil {
		httpx.Error(w, 400, "archivo inválido")
		return
	}
	f, h, err := r.FormFile("file")
	if err != nil {
		httpx.Error(w, 400, "archivo requerido")
		return
	}
	defer f.Close()
	ext := strings.ToLower(filepath.Ext(h.Filename))
	allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true}
	if !allowed[ext] {
		httpx.Error(w, 422, "formato no permitido")
		return
	}
	name := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	if err := saveMultipart(f, filepath.Join(a.cfg.MediaDir, name)); err != nil {
		httpx.Error(w, 500, "no fue posible guardar el archivo")
		return
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "url": "/media/" + name})
}
func saveMultipart(src multipart.File, path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	dst, err := os.Create(path)
	if err != nil {
		return err
	}
	defer dst.Close()
	_, err = io.Copy(dst, src)
	return err
}
