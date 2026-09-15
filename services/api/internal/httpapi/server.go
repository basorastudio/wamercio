package httpapi

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"

	authpkg "wamercio/services/api/internal/auth"
	"wamercio/services/api/internal/config"
)

type Server struct {
	cfg   config.Config
	db    *pgxpool.Pool
	cache *redis.Client
	http  *http.Client
}
type ctxKey string

const claimsKey ctxKey = "claims"

func New(cfg config.Config, db *pgxpool.Pool) *Server {
	_ = os.MkdirAll(cfg.UploadDir, 0755)
	var cache *redis.Client
	if opt, err := redis.ParseURL(cfg.RedisURL); err == nil {
		cache = redis.NewClient(opt)
	}
	srv := &Server{cfg: cfg, db: db, cache: cache, http: &http.Client{Timeout: 12 * time.Second}}
	go srv.outboxLoop()
	return srv
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(cors.Handler(cors.Options{AllowedOrigins: s.cfg.AllowedOrigins, AllowedMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}, AllowedHeaders: []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "X-Internal-Secret", "X-Wamercio-Host"}, AllowCredentials: true, MaxAge: 300}))
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		jsonOut(w, 200, map[string]any{"ok": true, "service": "wamercio-api"})
	})
	r.Handle("/media/*", http.StripPrefix("/media/", http.FileServer(http.Dir(s.cfg.UploadDir))))

	r.Route("/api/v1", func(api chi.Router) {
		api.Get("/meta/country", s.metaCountry)
		// Merchant/store access is intentionally independent from SaaS administration.
		api.Post("/auth/store/lookup", s.storeLookup)
		api.Post("/auth/store/validate-whatsapp", s.publicValidateRegistrationWhatsApp)
		api.Post("/auth/store/verify-identity", s.publicVerifyRegistrationIdentity)
		api.Post("/auth/store/login", s.storeLogin)
		api.Post("/auth/store/sso/exchange", s.ownerSSOExchange)
		api.Post("/auth/store/register", s.register)
		api.Post("/auth/store/logout", s.storeLogout)
		// Global customer identity and access. This session is independent from
		// merchant/store administration and follows the customer across stores.
		api.Post("/auth/customer/lookup", s.customerLookup)
		api.Post("/auth/customer/validate-whatsapp", s.customerValidateWhatsApp)
		api.Post("/auth/customer/verify-identity", s.customerVerifyIdentity)
		api.Post("/auth/customer/register", s.customerRegister)
		api.Post("/auth/customer/login", s.customerLogin)
		api.Post("/auth/customer/logout", s.customerLogout)
		api.Post("/auth/customer/sso/exchange", s.customerSSOExchange)
		// Legacy aliases kept for clients created before 1.2.
		api.Post("/auth/register", s.register)
		api.Post("/auth/admin/login", s.adminLogin)
		api.Post("/auth/admin/logout", s.adminLogout)
		api.Post("/auth/login", s.adminLogin)

		api.Get("/plans", s.listPlans)
		api.Get("/public/platform", s.publicPlatformSettings)
		api.Get("/public/territories/provinces", s.publicTerritoryProvinces)
		api.Get("/public/territories/cities", s.publicTerritoryCities)
		api.Get("/public/territories/neighborhoods", s.publicTerritoryNeighborhoods)
		api.Get("/public/legal", s.publicLegalSettings)
		api.Get("/templates", s.listBusinessTemplates)
		api.Get("/templates/{slug}", s.getBusinessTemplate)
		api.Get("/public/store", s.publicStore)
		api.Post("/public/store/checkout", s.checkout)
		api.Get("/public/orders/{token}", s.publicOrder)
		api.Post("/public/orders/{token}/proof", s.publicOrderProof)
		api.Post("/internal/whatsapp/events", s.whatsappEvent)
		api.Post("/internal/whatsapp/profile", s.whatsappProfile)
		api.Post("/internal/whatsapp/receipts", s.whatsappReceipt)

		api.Group(func(p chi.Router) {
			p.Use(s.requireStoreAuth)
			p.Get("/me", s.me)
			p.Patch("/me", s.updateMe)
			p.Post("/me/pin", s.changePIN)
			p.Get("/dashboard", s.dashboard)
			p.Get("/events", s.storeEvents)
			p.Get("/stores", s.listStores)
			p.Post("/stores", s.createStore)
			p.Put("/stores/{id}", s.updateStore)
			p.Delete("/stores/{id}", s.deleteStore)
			p.Get("/stores/{id}/settings", s.getStoreSettings)
			p.Put("/stores/{id}/settings", s.updateStoreSettings)
			p.Get("/store-domains", s.listStoreDomains)
			p.Post("/store-domains", s.createStoreDomain)
			p.Post("/store-domains/{id}/verify", s.verifyStoreDomain)
			p.Post("/store-domains/{id}/primary", s.primaryStoreDomain)
			p.Delete("/store-domains/{id}", s.deleteStoreDomain)
			p.Get("/categories", s.listCategories)
			p.Post("/categories", s.createCategory)
			p.Put("/categories/{id}", s.updateCategory)
			p.Delete("/categories/{id}", s.deleteCategory)
			p.Get("/products", s.listProducts)
			p.Get("/product-attributes", s.listProductAttributes)
			p.Post("/products", s.createProduct)
			p.Put("/products/{id}", s.updateProduct)
			p.Delete("/products/{id}", s.deleteProduct)
			p.Get("/coupons", s.listCoupons)
			p.Post("/coupons", s.createCoupon)
			p.Put("/coupons/{id}", s.updateCoupon)
			p.Delete("/coupons/{id}", s.deleteCoupon)
			p.Get("/shipping", s.listShipping)
			p.Post("/shipping", s.createShipping)
			p.Put("/shipping/{id}", s.updateShipping)
			p.Delete("/shipping/{id}", s.deleteShipping)
			p.Get("/tables", s.listStoreTables)
			p.Post("/tables", s.createStoreTable)
			p.Put("/tables/{id}", s.updateStoreTable)
			p.Delete("/tables/{id}", s.deleteStoreTable)
			p.Get("/quick-replies", s.listQuickReplies)
			p.Post("/quick-replies", s.createQuickReply)
			p.Put("/quick-replies/{id}", s.updateQuickReply)
			p.Delete("/quick-replies/{id}", s.deleteQuickReply)
			p.Get("/orders", s.listOrders)
			p.Get("/orders/{id}", s.getOrder)
			p.Patch("/orders/{id}/status", s.updateOrderStatus)
			p.Patch("/orders/{id}/payment", s.updateOrderPayment)
			p.Get("/customers", s.listCustomers)
			p.Get("/contacts", s.listContacts)
			p.Get("/banks", s.listActiveBanks)
			p.Get("/customers/{id}", s.getCustomer)
			p.Put("/customers/{id}", s.updateCustomer)
			p.Get("/staff", s.listStoreStaff)
			p.Post("/staff", s.createStoreStaff)
			p.Put("/staff/{id}", s.updateStoreStaff)
			p.Delete("/staff/{id}", s.deleteStoreStaff)
			p.Post("/pos/sales", s.createPOSSale)
			p.Get("/subscription", s.subscription)
			p.Get("/subscription/requests", s.mySubscriptionRequests)
			p.Post("/subscription/requests", s.requestSubscription)
			p.Get("/transactions", s.listTransactions)
			p.Get("/tickets", s.listTickets)
			p.Post("/tickets", s.createTicket)
			p.Get("/tickets/{id}", s.getTicket)
			p.Post("/tickets/{id}/reply", s.replyTicket)
			p.Patch("/tickets/{id}/close", s.closeTicket)
			p.Get("/support/whatsapp", s.supportWhatsAppInfo)
			p.Get("/conversations", s.listConversations)
			p.Get("/conversations/{id}/messages", s.listMessages)
			p.Get("/conversations/{id}/details", s.conversationDetails)
			p.Put("/conversations/{id}/customer", s.saveConversationCustomer)
			p.Patch("/conversations/{id}/status", s.updateConversationStatus)
			p.Delete("/conversations/{id}", s.deleteConversation)
			p.Delete("/conversations/{id}/messages", s.clearConversationMessages)
			p.Patch("/conversations/{id}/block", s.blockConversation)
			p.Get("/conversations/{id}/notes", s.listConversationNotes)
			p.Post("/conversations/{id}/notes", s.createConversationNote)
			p.Patch("/conversations/{id}/read", s.readConversation)
			p.Post("/conversations/{id}/send", s.sendConversationMessage)
			p.Post("/conversations/{id}/send-media", s.sendConversationMedia)
			p.Post("/conversations/{id}/orders", s.createConversationOrder)
			p.Post("/uploads", s.upload)
			p.Get("/whatsapp/{storeID}/status", s.whatsappStatus)
			p.Get("/whatsapp/{storeID}/sync-settings", s.whatsappSyncSettings)
			p.Put("/whatsapp/{storeID}/sync-settings", s.updateWhatsappSyncSettings)
			p.Post("/whatsapp/{storeID}/sync", s.whatsappSyncNow)
			p.Post("/whatsapp/{storeID}/connect", s.whatsappConnect)
			p.Post("/whatsapp/{storeID}/disconnect", s.whatsappDisconnect)
			p.Post("/whatsapp/{storeID}/send", s.whatsappSend)

		})

		api.Group(func(c chi.Router) {
			c.Use(s.requireCustomerAuth)
			c.Get("/customer/me", s.customerMe)
			c.Put("/customer/me", s.customerUpdateMe)
			c.Get("/customer/addresses", s.customerAddresses)
			c.Post("/customer/addresses", s.customerCreateAddress)
			c.Put("/customer/addresses/{id}", s.customerUpdateAddress)
			c.Delete("/customer/addresses/{id}", s.customerDeleteAddress)
			c.Get("/customer/orders", s.customerOrders)
			c.Get("/customer/orders/{id}", s.customerOrder)
			c.Post("/customer/sso/start", s.customerSSOStart)
		})

		api.Group(func(a chi.Router) {
			a.Use(s.requireAdminAuth)
			a.Get("/admin/me", s.adminMe)
			a.With(s.requireAdminArea("dashboard")).Get("/admin/dashboard", s.adminDashboard)
			a.With(s.requireAdminArea("owners")).Get("/admin/owners", s.adminOwners)
			a.With(s.requireAdminArea("owners")).Post("/admin/owners", s.adminCreateOwner)
			a.With(s.requireAdminArea("owners")).Post("/admin/owners/verify-identity", s.adminVerifyOwnerIdentity)
			a.With(s.requireAdminArea("owners")).Post("/admin/owners/validate-whatsapp", s.adminValidateOwnerWhatsApp)
			a.With(s.requireAdminArea("owners")).Post("/admin/owners/profiles/refresh", s.adminRefreshOwnerWhatsAppProfiles)
			a.With(s.requireAdminArea("owners")).Get("/admin/territories/provinces", s.adminTerritoryProvinces)
			a.With(s.requireAdminArea("owners")).Get("/admin/territories/cities", s.adminTerritoryCities)
			a.With(s.requireAdminArea("owners")).Get("/admin/territories/neighborhoods", s.adminTerritoryNeighborhoods)
			a.With(s.requireAdminArea("owners")).Get("/admin/owners/{id}", s.adminOwnerDetail)
			a.With(s.requireAdminArea("owners")).Put("/admin/owners/{id}", s.adminUpdateOwner)
			a.With(s.requireAdminArea("owners")).Post("/admin/owners/{id}/stores", s.adminCreateOwnerStore)
			a.With(s.requireAdminArea("customers")).Get("/admin/global-customers", s.adminGlobalCustomers)
			a.With(s.requireAdminArea("users")).Get("/admin/platform-users", s.adminPlatformUsers)
			a.With(s.requireAdminArea("users")).Post("/admin/platform-users", s.adminCreatePlatformUser)
			a.With(s.requireAdminArea("users")).Patch("/admin/platform-users/{id}/status", s.adminPlatformUserStatus)
			a.With(s.requireAdminArea("users")).Delete("/admin/platform-users/{id}", s.adminDeletePlatformUser)
			a.With(s.requireAdminArea("landing")).Get("/admin/platform/landing", s.adminLandingSettings)
			a.With(s.requireAdminArea("landing")).Put("/admin/platform/landing", s.adminUpdateLandingSettings)
			a.With(s.requireAdminArea("settings")).Get("/admin/platform/settings", s.adminPlatformSettings)
			a.With(s.requireAdminArea("settings")).Put("/admin/platform/settings", s.adminUpdatePlatformSettings)
			a.With(s.requireAdminArea("settings")).Put("/admin/platform/settings/{key}", s.adminUpdatePlatformSetting)
			a.With(s.requireAdminArea("settings")).Get("/admin/platform/database/status", s.adminDatabaseStatus)
			a.With(s.requireAdminArea("settings")).Post("/admin/platform/test/{kind}", s.adminTestPlatformIntegration)
			a.With(s.requireAdminArea("settings")).Get("/admin/platform/banks", s.adminBanks)
			a.With(s.requireAdminArea("settings")).Post("/admin/platform/banks", s.adminCreateBank)
			a.With(s.requireAdminArea("settings")).Put("/admin/platform/banks/{id}", s.adminUpdateBank)
			a.With(s.requireAdminArea("settings")).Delete("/admin/platform/banks/{id}", s.adminDeleteBank)
			a.With(s.requireAdminArea("settings")).Get("/admin/platform/audit", s.adminAuditLog)
			a.With(s.requireAdminArea("owners")).Get("/admin/users", s.adminUsers)
			a.With(s.requireAdminArea("owners")).Delete("/admin/users/{id}", s.adminDeleteUser)
			a.With(s.requireAdminArea("owners")).Patch("/admin/users/{id}/status", s.adminUserStatus)
			a.With(s.requireAdminArea("owners")).Put("/admin/users/{id}/plan", s.adminAssignPlan)
			a.With(s.requireAdminArea("owners")).Put("/admin/users/{id}/pin", s.adminSetUserPIN)
			a.With(s.requireAdminArea("owners")).Put("/admin/users/{id}/access", s.adminSetUserAccess)
			a.With(s.requireAdminArea("owners")).Get("/admin/stores", s.adminStores)
			a.With(s.requireAdminArea("owners")).Put("/admin/stores/{id}", s.adminUpdateAdminStore)
			a.With(s.requireAdminArea("owners")).Delete("/admin/stores/{id}", s.adminDeleteStore)
			a.With(s.requireAdminArea("settings")).Get("/admin/templates", s.adminTemplates)
			a.With(s.requireAdminArea("settings")).Post("/admin/templates", s.adminCreateTemplate)
			a.With(s.requireAdminArea("settings")).Put("/admin/templates/{id}", s.adminUpdateTemplate)
			a.With(s.requireAdminArea("settings")).Post("/admin/templates/{id}/duplicate", s.adminDuplicateTemplate)
			a.With(s.requireAdminArea("settings")).Get("/admin/templates/{id}/content", s.adminTemplateContent)
			a.With(s.requireAdminArea("settings")).Put("/admin/templates/{id}/content", s.adminUpdateTemplateContent)
			a.With(s.requireAdminArea("plans")).Get("/admin/plans", s.adminPlans)
			a.With(s.requireAdminArea("plans")).Post("/admin/plans", s.adminCreatePlan)
			a.With(s.requireAdminArea("plans")).Put("/admin/plans/{id}", s.adminUpdatePlan)
			a.With(s.requireAdminArea("plans")).Get("/admin/subscriptions", s.adminSubscriptions)
			a.With(s.requireAdminArea("plans")).Get("/admin/subscription-requests", s.adminSubscriptionRequests)
			a.With(s.requireAdminArea("plans")).Patch("/admin/subscription-requests/{id}", s.adminReviewSubscriptionRequest)
			a.Get("/admin/transactions", s.adminTransactions)
			a.Get("/admin/tickets", s.adminTickets)
			a.Get("/admin/tickets/{id}", s.adminTicket)
			a.Post("/admin/tickets/{id}/reply", s.adminReplyTicket)
			a.Patch("/admin/tickets/{id}/status", s.adminTicketStatus)
			a.Get("/admin/whatsapp/status", s.adminWhatsAppStatus)
			a.Post("/admin/whatsapp/connect", s.adminWhatsAppConnect)
			a.Post("/admin/whatsapp/disconnect", s.adminWhatsAppDisconnect)
			a.Get("/admin/whatsapp/conversations", s.adminWhatsAppConversations)
			a.Post("/admin/whatsapp/conversations", s.adminWhatsAppEnsureConversation)
			a.Get("/admin/whatsapp/conversations/{id}/messages", s.adminWhatsAppMessages)
			a.Patch("/admin/whatsapp/conversations/{id}/read", s.adminWhatsAppRead)
			a.Post("/admin/whatsapp/conversations/{id}/send", s.adminWhatsAppSend)
			a.Post("/admin/whatsapp/conversations/{id}/send-media", s.adminWhatsAppSendMedia)
		})
	})
	return r
}

func jsonOut(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func jsonErr(w http.ResponseWriter, status int, msg string) {
	jsonOut(w, status, map[string]any{"error": msg})
}
func decode(r *http.Request, dst any) error {
	return json.NewDecoder(io.LimitReader(r.Body, 2<<20)).Decode(dst)
}
func claims(r *http.Request) *authpkg.Claims {
	c, _ := r.Context().Value(claimsKey).(*authpkg.Claims)
	return c
}
func str(v any) string {
	if v == nil {
		return ""
	}
	return fmt.Sprint(v)
}

func normalizeVisualTheme(v string) string {
	v = strings.TrimSpace(strings.ToLower(v))
	allowed := map[string]bool{"fresh-market": true, "food-bold": true, "editorial-fashion": true, "beauty-soft": true, "luxury": true, "tech-modern": true, "industrial-pro": true, "minimal-shop": true}
	if !allowed[v] {
		return "minimal-shop"
	}
	return v
}

func normalizePhone(v string) string {
	raw := strings.TrimSpace(v)
	digits := regexp.MustCompile(`\D+`).ReplaceAllString(raw, "")
	// Legacy Dominican/NANP entries may arrive as ten local digits. When the
	// client already sent an international E.164 number (leading +), preserve it.
	if !strings.HasPrefix(raw, "+") && len(digits) == 10 {
		digits = "1" + digits
	}
	return digits
}

func clientIP(r *http.Request) string {
	if v := strings.TrimSpace(strings.Split(r.Header.Get("CF-Connecting-IP"), ",")[0]); v != "" {
		return v
	}
	if v := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-For"), ",")[0]); v != "" {
		return v
	}
	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i > -1 {
		host = host[:i]
	}
	return strings.Trim(host, "[]")
}

func (s *Server) allowAttempt(ctx context.Context, key string, limit int64, window time.Duration) bool {
	if s.cache == nil {
		return true
	}
	n, err := s.cache.Incr(ctx, key).Result()
	if err != nil {
		return true
	}
	if n == 1 {
		_ = s.cache.Expire(ctx, key, window).Err()
	}
	return n <= limit
}

func (s *Server) resetAttempts(ctx context.Context, key string) {
	if s.cache != nil {
		_ = s.cache.Del(ctx, key).Err()
	}
}

func (s *Server) metaCountry(w http.ResponseWriter, r *http.Request) {
	country := strings.ToLower(strings.TrimSpace(r.Header.Get("CF-IPCountry")))
	if !regexp.MustCompile(`^[a-z]{2}$`).MatchString(country) || country == "xx" {
		country = "do"
	}
	jsonOut(w, 200, map[string]string{"country": country})
}

func validPIN(v string) bool {
	return regexp.MustCompile(`^[0-9]{4}$`).MatchString(v)
}

func (s *Server) validPINFor(ctx context.Context, audience, value string) (bool, int) {
	length := 4
	access := s.platformSetting(ctx, "access")
	key := "owner_pin_length"
	switch audience {
	case "staff":
		key = "staff_pin_length"
	case "customer":
		key = "customer_pin_length"
	}
	if n := settingInt(access, key, 4); n >= 4 && n <= 8 {
		length = n
	}
	matched, _ := regexp.MatchString(fmt.Sprintf(`^[0-9]{%d}$`, length), value)
	return matched, length
}

func pinLengthsFromSetting(value any) []int {
	out := []int{}
	seen := map[int]bool{}
	appendLength := func(n int) {
		if n < 4 || n > 8 || seen[n] {
			return
		}
		seen[n] = true
		out = append(out, n)
	}
	switch values := value.(type) {
	case []any:
		for _, raw := range values {
			switch n := raw.(type) {
			case float64:
				appendLength(int(n))
			case int:
				appendLength(n)
			}
		}
	case []int:
		for _, n := range values {
			appendLength(n)
		}
	}
	return out
}

func (s *Server) acceptedOwnerPINLengths(ctx context.Context) []int {
	access := s.platformSetting(ctx, "access")
	current := settingInt(access, "owner_pin_length", 4)
	if current < 4 || current > 8 {
		current = 4
	}
	accepted := []int{current}
	seen := map[int]bool{current: true}
	for _, n := range pinLengthsFromSetting(access["legacy_owner_pin_lengths"]) {
		if !seen[n] {
			seen[n] = true
			accepted = append(accepted, n)
		}
	}
	sort.Ints(accepted)
	return accepted
}

func (s *Server) validOwnerLoginPIN(ctx context.Context, value string) (bool, []int) {
	if matched, _ := regexp.MatchString(`^[0-9]{4,8}$`, value); !matched {
		return false, s.acceptedOwnerPINLengths(ctx)
	}
	accepted := s.acceptedOwnerPINLengths(ctx)
	for _, n := range accepted {
		if len(value) == n {
			return true, accepted
		}
	}
	return false, accepted
}

func (s *Server) acceptedCustomerPINLengths(ctx context.Context) []int {
	access := s.platformSetting(ctx, "access")
	current := settingInt(access, "customer_pin_length", 4)
	if current < 4 || current > 8 {
		current = 4
	}
	accepted := []int{current}
	seen := map[int]bool{current: true}
	for _, n := range pinLengthsFromSetting(access["legacy_customer_pin_lengths"]) {
		if !seen[n] {
			seen[n] = true
			accepted = append(accepted, n)
		}
	}
	sort.Ints(accepted)
	return accepted
}

func (s *Server) validCustomerLoginPIN(ctx context.Context, value string) (bool, []int) {
	if matched, _ := regexp.MatchString(`^[0-9]{4,8}$`, value); !matched {
		return false, s.acceptedCustomerPINLengths(ctx)
	}
	accepted := s.acceptedCustomerPINLengths(ctx)
	for _, n := range accepted {
		if len(value) == n {
			return true, accepted
		}
	}
	return false, accepted
}

func pinLengthsMessage(lengths []int) string {
	if len(lengths) == 0 {
		return "4 dígitos"
	}
	parts := make([]string, 0, len(lengths))
	for _, n := range lengths {
		parts = append(parts, fmt.Sprintf("%d", n))
	}
	if len(parts) == 1 {
		return parts[0] + " dígitos"
	}
	return strings.Join(parts[:len(parts)-1], ", ") + " o " + parts[len(parts)-1] + " dígitos"
}

func (s *Server) claimsFromCookie(r *http.Request, cookieName string) (*authpkg.Claims, error) {
	cookie, err := r.Cookie(cookieName)
	if err != nil || cookie.Value == "" {
		return nil, fmt.Errorf("sesión requerida")
	}
	return authpkg.Parse(s.cfg.JWTSecret, cookie.Value)
}

func (s *Server) requireStoreAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := s.claimsFromCookie(r, "wamercio_store_token")
		if err != nil || c.Role != "owner" {
			jsonErr(w, 401, "Sesión de tienda requerida")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), claimsKey, c)))
	})
}

func (s *Server) requireCustomerAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := s.claimsFromCookie(r, "wamercio_customer_token")
		if err != nil || c.Role != "customer" {
			jsonErr(w, 401, "Sesión de cliente requerida")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), claimsKey, c)))
	})
}

func (s *Server) requireAdminAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := s.claimsFromCookie(r, "wamercio_admin_token")
		if err != nil || c.Role == "owner" || c.Role == "" {
			jsonErr(w, 401, "Sesión SaaS requerida")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), claimsKey, c)))
	})
}

func (s *Server) requireAdminArea(area string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c := claims(r)
			if c == nil {
				jsonErr(w, 401, "Sesión SaaS requerida")
				return
			}
			if c.Role == "superadmin" {
				next.ServeHTTP(w, r)
				return
			}
			var allowed bool
			_ = s.db.QueryRow(r.Context(), `SELECT admin_access ? $1 FROM users WHERE id=$2 AND role<>'owner' AND status='active'`, area, c.UserID).Scan(&allowed)
			if !allowed {
				jsonErr(w, http.StatusForbidden, "No tienes acceso a esta área")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func (s *Server) setSessionCookie(w http.ResponseWriter, name, token string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   strings.HasPrefix(s.cfg.AppURL, "https://"),
		MaxAge:   maxAge,
	})
}

func (s *Server) clearSessionCookie(w http.ResponseWriter, name string) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: "", Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: strings.HasPrefix(s.cfg.AppURL, "https://"), MaxAge: -1})
}

func (s *Server) customerCookieDomain(r *http.Request) string {
	host := s.requestHostname(r)
	root := normalizeHostname(s.cfg.TenantRootDomain)
	if root != "" && (host == root || strings.HasSuffix(host, "."+root)) {
		return "." + root
	}
	return ""
}

func (s *Server) setCustomerSessionCookie(w http.ResponseWriter, r *http.Request, token string, maxAge int) {
	http.SetCookie(w, &http.Cookie{Name: "wamercio_customer_token", Value: token, Path: "/", Domain: s.customerCookieDomain(r), HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: s.requestScheme(r) == "https", MaxAge: maxAge})
}

func (s *Server) clearCustomerSessionCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: "wamercio_customer_token", Value: "", Path: "/", Domain: s.customerCookieDomain(r), HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: s.requestScheme(r) == "https", MaxAge: -1})
}

func (s *Server) storeLookup(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Phone string `json:"phone"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Número de WhatsApp inválido")
		return
	}
	phone := normalizePhone(in.Phone)
	if len(phone) < 10 {
		jsonErr(w, 400, "Ingresa un número de WhatsApp válido")
		return
	}
	if !s.allowAttempt(r.Context(), "rl:store-lookup:"+clientIP(r), 30, time.Minute) {
		jsonErr(w, http.StatusTooManyRequests, "Demasiados intentos. Espera un momento e inténtalo de nuevo")
		return
	}
	var exists bool
	err := s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM users WHERE role='owner' AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=$1)`, phone).Scan(&exists)
	if err != nil {
		jsonErr(w, 500, "No se pudo verificar el WhatsApp")
		return
	}
	jsonOut(w, 200, map[string]bool{"exists": exists})
}

func (s *Server) storeLogin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Phone string `json:"phone"`
		PIN   string `json:"pin"`
	}
	if decode(r, &in) != nil || normalizePhone(in.Phone) == "" {
		jsonErr(w, 400, "Ingresa tu número de WhatsApp y PIN")
		return
	}
	pinOK, acceptedPINLengths := s.validOwnerLoginPIN(r.Context(), in.PIN)
	if !pinOK {
		jsonErr(w, 400, "El PIN debe tener "+pinLengthsMessage(acceptedPINLengths))
		return
	}
	phone := normalizePhone(in.Phone)
	attemptKey := "rl:store-login:" + clientIP(r) + ":" + phone
	if !s.allowAttempt(r.Context(), attemptKey, 8, 15*time.Minute) {
		jsonErr(w, http.StatusTooManyRequests, "Demasiados intentos. Espera unos minutos antes de volver a intentar")
		return
	}
	var id, name, storedPhone, pinHash, status string
	err := s.db.QueryRow(r.Context(), `SELECT id,name,coalesce(phone,''),coalesce(pin_hash,''),status FROM users WHERE role='owner' AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=$1 ORDER BY created_at LIMIT 1`, phone).Scan(&id, &name, &storedPhone, &pinHash, &status)
	if err != nil || status != "active" {
		jsonErr(w, 401, "WhatsApp o PIN incorrecto")
		return
	}
	if pinHash == "" {
		jsonErr(w, 403, "Tu PIN todavía no está configurado. Solicítalo al administrador de WAMERCIO.")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(pinHash), []byte(in.PIN)) != nil {
		jsonErr(w, 401, "WhatsApp o PIN incorrecto")
		return
	}
	s.resetAttempts(r.Context(), attemptKey)
	tok, err := authpkg.Sign(s.cfg.JWTSecret, id, "owner")
	if err != nil {
		jsonErr(w, 500, "No se pudo crear la sesión")
		return
	}
	_, _ = s.db.Exec(r.Context(), `UPDATE users SET last_login_at=now() WHERE id=$1`, id)
	host := normalizeHostname(s.requestHostname(r))
	platformHost := normalizeHostname(s.cfg.PlatformDomain)
	if host != "" && platformHost != "" && host != platformHost && host != "www."+platformHost {
		redirectURL, handoffErr := s.createOwnerSSOHandoff(r.Context(), id)
		if handoffErr != nil {
			jsonErr(w, 500, "No se pudo abrir el panel del negocio")
			return
		}
		jsonOut(w, 200, map[string]any{"user": map[string]any{"id": id, "name": name, "phone": storedPhone, "role": "owner"}, "redirect_url": redirectURL})
		return
	}
	s.setSessionCookie(w, "wamercio_store_token", tok, 30*24*3600)
	jsonOut(w, 200, map[string]any{"user": map[string]any{"id": id, "name": name, "phone": storedPhone, "role": "owner"}, "redirect_url": "/dashboard"})
}

func (s *Server) adminLogin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Email) == "" || in.Password == "" {
		jsonErr(w, 400, "Correo y contraseña son obligatorios")
		return
	}
	adminAttemptKey := "rl:admin-login:" + clientIP(r) + ":" + strings.ToLower(strings.TrimSpace(in.Email))
	if !s.allowAttempt(r.Context(), adminAttemptKey, 8, 15*time.Minute) {
		jsonErr(w, http.StatusTooManyRequests, "Demasiados intentos. Espera unos minutos")
		return
	}
	var id, name, email, hash, status, role string
	err := s.db.QueryRow(r.Context(), `SELECT id,name,coalesce(email,''),password_hash,status,role FROM users WHERE role<>'owner' AND lower(email)=lower($1)`, strings.TrimSpace(in.Email)).Scan(&id, &name, &email, &hash, &status, &role)
	if err != nil || status != "active" || bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil {
		jsonErr(w, 401, "Credenciales administrativas inválidas")
		return
	}
	s.resetAttempts(r.Context(), adminAttemptKey)
	tok, err := authpkg.Sign(s.cfg.JWTSecret, id, role)
	if err != nil {
		jsonErr(w, 500, "No se pudo crear la sesión")
		return
	}
	_, _ = s.db.Exec(r.Context(), `UPDATE users SET last_login_at=now() WHERE id=$1`, id)
	s.setSessionCookie(w, "wamercio_admin_token", tok, 12*3600)
	jsonOut(w, 200, map[string]any{"user": map[string]any{"id": id, "name": name, "email": email, "role": role}})
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	general := s.platformSetting(r.Context(), "general")
	if enabled, ok := general["public_registration"].(bool); ok && !enabled {
		jsonErr(w, http.StatusForbidden, "El registro público de negocios está temporalmente deshabilitado")
		return
	}
	var in struct {
		Name                string `json:"name"`
		LastName            string `json:"last_name"`
		Phone               string `json:"phone"`
		PIN                 string `json:"pin"`
		Cedula              string `json:"cedula"`
		BirthDate           string `json:"birth_date"`
		Gender              string `json:"gender"`
		BusinessName        string `json:"business_name"`
		TemplateSlug        string `json:"template_slug"`
		ProvinceCode        string `json:"province_code"`
		Province            string `json:"province"`
		CityID              string `json:"city_id"`
		Municipality        string `json:"municipality"`
		NeighborhoodID      string `json:"neighborhood_id"`
		Neighborhood        string `json:"neighborhood"`
		Street              string `json:"street"`
		StreetNumber        string `json:"street_number"`
		IdentitySubjectType string `json:"identity_subject_type"` // compatibilidad 2.3.0-2.3.2
		IdentityDocument    string `json:"identity_document"`     // compatibilidad 2.3.0-2.3.2
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}

	name := strings.TrimSpace(in.Name)
	lastName := strings.TrimSpace(in.LastName)
	phone := normalizePhone(in.Phone)
	businessName := strings.TrimSpace(in.BusinessName)
	cedula := digitsOnly(in.Cedula)
	if cedula == "" && strings.EqualFold(strings.TrimSpace(in.IdentitySubjectType), "persona") {
		cedula = digitsOnly(in.IdentityDocument)
	}
	pinOK, pinLength := s.validPINFor(r.Context(), "owner", in.PIN)
	if name == "" || phone == "" || businessName == "" || !pinOK {
		jsonErr(w, 400, fmt.Sprintf("Nombre, WhatsApp, negocio y un PIN de %d dígitos son obligatorios", pinLength))
		return
	}
	if len(cedula) != 11 {
		jsonErr(w, http.StatusUnprocessableEntity, "La Cédula es obligatoria y debe tener exactamente 11 dígitos")
		return
	}

	// Un nuevo propietario solo puede registrarse con un número realmente
	// disponible en WhatsApp. La comprobación usa la sesión SaaS principal.
	if _, err := s.validateOwnerWhatsAppForSave(r.Context(), phone); err != nil {
		jsonErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	}

	identity := s.platformSetting(r.Context(), "identity")
	requireIdentity, _ := identity["require_owner_verification"].(bool)
	identityEnabled, _ := identity["enabled"].(bool)
	identityVerified := false
	if requireIdentity && !identityEnabled {
		jsonErr(w, http.StatusServiceUnavailable, "La verificación de Cédula es obligatoria, pero la integración está deshabilitada")
		return
	}
	if identityEnabled {
		envelope, _, err := s.verifyIdentityDocument(r.Context(), "persona", cedula)
		if err != nil {
			jsonErr(w, http.StatusUnprocessableEntity, "No pudimos verificar la Cédula: "+err.Error())
			return
		}
		profile := identityProfile("persona", envelope)
		if v := strings.TrimSpace(str(profile["name"])); v != "" {
			name = v
		}
		if v := strings.TrimSpace(str(profile["last_name"])); v != "" {
			lastName = v
		}
		if v := strings.TrimSpace(str(profile["birth_date"])); v != "" {
			in.BirthDate = v
		}
		if v := normalizeOwnerGender(str(profile["gender"])); v != "" {
			in.Gender = v
		}
		identityVerified = true
	}

	birthDate := strings.TrimSpace(in.BirthDate)
	if birthDate != "" {
		if _, err := time.Parse("2006-01-02", birthDate); err != nil {
			jsonErr(w, http.StatusBadRequest, "La fecha de nacimiento no es válida")
			return
		}
	}
	gender := normalizeOwnerGender(in.Gender)

	var exists bool
	_ = s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM users WHERE role='owner' AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=$1)`, phone).Scan(&exists)
	if exists {
		jsonErr(w, 409, "Ya existe una cuenta con ese número de WhatsApp")
		return
	}
	_ = s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM users WHERE role='owner' AND document_type='persona' AND document_number=$1)`, cedula).Scan(&exists)
	if exists {
		jsonErr(w, 409, "Ya existe una cuenta con esa Cédula")
		return
	}

	pinHash, err := bcrypt.GenerateFromPassword([]byte(in.PIN), bcrypt.DefaultCost)
	if err != nil {
		jsonErr(w, 500, "No se pudo proteger el PIN")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo crear la cuenta")
		return
	}
	defer tx.Rollback(r.Context())

	var ownerID string
	var identityVerifiedAt any
	if identityVerified {
		identityVerifiedAt = time.Now()
	}
	whatsappVerifiedAt := time.Now()
	err = tx.QueryRow(r.Context(), `INSERT INTO users(name,last_name,email,phone,password_hash,pin_hash,pin_changed_at,role,status,document_type,document_number,birth_date,gender,identity_verified_at,whatsapp_verified_at) VALUES($1,$2,NULL,$3,NULL,$4,now(),'owner','active','persona',$5,nullif($6,'')::date,nullif($7,''),$8,$9) RETURNING id`, name, lastName, phone, string(pinHash), cedula, birthDate, gender, identityVerifiedAt, whatsappVerifiedAt).Scan(&ownerID)
	if err != nil {
		jsonErr(w, 409, "No se pudo crear la cuenta; verifica el WhatsApp y la Cédula")
		return
	}

	var planID string
	defaultPlan := "emprende"
	if v, ok := general["default_plan"].(string); ok && strings.TrimSpace(v) != "" {
		defaultPlan = strings.TrimSpace(v)
	}
	if err = tx.QueryRow(r.Context(), `SELECT id FROM plans WHERE slug=$1 AND is_active=true LIMIT 1`, defaultPlan).Scan(&planID); err == nil {
		_, _ = tx.Exec(r.Context(), `INSERT INTO subscriptions(user_id,plan_id,status) VALUES($1,$2,'active') ON CONFLICT(user_id) DO NOTHING`, ownerID, planID)
	}

	templateSlug := strings.TrimSpace(in.TemplateSlug)
	if templateSlug == "" {
		templateSlug = "otro-negocio"
	}
	slug := s.safeStoreSlugFor(r.Context(), businessName)
	addressInput := adminBusinessInput{
		ProvinceCode:   strings.TrimSpace(in.ProvinceCode),
		Province:       strings.TrimSpace(in.Province),
		CityID:         strings.TrimSpace(in.CityID),
		Municipality:   strings.TrimSpace(in.Municipality),
		NeighborhoodID: strings.TrimSpace(in.NeighborhoodID),
		Neighborhood:   strings.TrimSpace(in.Neighborhood),
		Street:         strings.TrimSpace(in.Street),
		StreetNumber:   strings.TrimSpace(in.StreetNumber),
	}
	address := businessAddress(addressInput)
	var storeID string
	if err = tx.QueryRow(r.Context(), `INSERT INTO stores(user_id,name,slug,phone,whatsapp,address,province_code,province,city_id,municipality,neighborhood_id,neighborhood,street,street_number) VALUES($1,$2,$3,NULL,$4,nullif($5,''),nullif($6,''),nullif($7,''),nullif($8,''),nullif($9,''),nullif($10,''),nullif($11,''),nullif($12,''),nullif($13,'')) RETURNING id`, ownerID, businessName, slug, phone, address, addressInput.ProvinceCode, addressInput.Province, addressInput.CityID, addressInput.Municipality, addressInput.NeighborhoodID, addressInput.Neighborhood, addressInput.Street, addressInput.StreetNumber).Scan(&storeID); err != nil {
		jsonErr(w, 409, "No se pudo crear el comercio")
		return
	}
	if err = s.applyBusinessTemplate(r.Context(), tx, storeID, templateSlug); err != nil {
		jsonErr(w, 500, "No se pudo preparar la plantilla del negocio")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la cuenta")
		return
	}
	tok, err := authpkg.Sign(s.cfg.JWTSecret, ownerID, "owner")
	if err != nil {
		jsonErr(w, 500, "Cuenta creada, pero no se pudo iniciar sesión")
		return
	}
	s.setSessionCookie(w, "wamercio_store_token", tok, 30*24*3600)
	jsonOut(w, 201, map[string]any{"user": map[string]any{"id": ownerID, "name": name, "last_name": lastName, "phone": phone, "role": "owner"}, "store": map[string]any{"id": storeID, "slug": slug, "name": businessName}})
}

func (s *Server) storeLogout(w http.ResponseWriter, r *http.Request) {
	s.clearSessionCookie(w, "wamercio_store_token")
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminLogout(w http.ResponseWriter, r *http.Request) {
	s.clearSessionCookie(w, "wamercio_admin_token")
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminMe(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var name, email, role string
	var created time.Time
	var accessRaw []byte
	err := s.db.QueryRow(r.Context(), `SELECT name,coalesce(email,''),role,created_at,admin_access FROM users WHERE id=$1 AND role<>'owner'`, c.UserID).Scan(&name, &email, &role, &created, &accessRaw)
	if err != nil {
		jsonErr(w, 404, "Administrador no encontrado")
		return
	}
	var access any = []any{}
	_ = json.Unmarshal(accessRaw, &access)
	jsonOut(w, 200, map[string]any{"id": c.UserID, "name": name, "email": email, "role": role, "access": access, "created_at": created})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var phone, role string
	if err := s.db.QueryRow(r.Context(), `SELECT coalesce(phone,''),role FROM users WHERE id=$1`, c.UserID).Scan(&phone, &role); err != nil {
		jsonErr(w, 404, "Usuario no encontrado")
		return
	}
	if role == "owner" && phone != "" {
		_ = s.refreshUserWhatsAppProfile(r.Context(), c.UserID, phone, "")
	}
	var name, lastName, document, birthDate, gender, whatsappName, profilePictureURL string
	var created time.Time
	var identityVerified, whatsappVerified bool
	err := s.db.QueryRow(r.Context(), `SELECT name,coalesce(last_name,''),coalesce(phone,''),role,created_at,coalesce(document_number,''),coalesce(to_char(birth_date,'YYYY-MM-DD'),''),coalesce(gender,''),identity_verified_at IS NOT NULL,whatsapp_verified_at IS NOT NULL,coalesce(whatsapp_name,''),coalesce(profile_picture_url,'') FROM users WHERE id=$1`, c.UserID).Scan(&name, &lastName, &phone, &role, &created, &document, &birthDate, &gender, &identityVerified, &whatsappVerified, &whatsappName, &profilePictureURL)
	if err != nil {
		jsonErr(w, 404, "Usuario no encontrado")
		return
	}
	jsonOut(w, 200, map[string]any{"id": c.UserID, "name": name, "last_name": lastName, "phone": phone, "role": role, "created_at": created, "document_number": document, "birth_date": birthDate, "gender": gender, "identity_verified": identityVerified, "whatsapp_verified": whatsappVerified, "whatsapp_name": whatsappName, "profile_picture_url": profilePictureURL})
}

func (s *Server) publishStoreEvent(ctx context.Context, storeID, event string, payload any) {
	if s.cache == nil || strings.TrimSpace(storeID) == "" {
		return
	}
	body, _ := json.Marshal(map[string]any{"event": event, "payload": payload, "at": time.Now().UTC()})
	_ = s.cache.Publish(ctx, "wamercio:store:"+storeID, string(body)).Err()
}

func (s *Server) storeEvents(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonErr(w, 500, "Streaming no disponible")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	fmt.Fprintf(w, "event: ready\ndata: {\"ok\":true}\n\n")
	flusher.Flush()
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()
	var ch <-chan *redis.Message
	var sub *redis.PubSub
	if s.cache != nil {
		sub = s.cache.Subscribe(r.Context(), "wamercio:store:"+storeID)
		defer sub.Close()
		ch = sub.Channel()
	}
	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			fmt.Fprintf(w, ": heartbeat\n\n")
			flusher.Flush()
		case msg, open := <-ch:
			if !open && ch != nil {
				ch = nil
				continue
			}
			if msg != nil {
				fmt.Fprintf(w, "data: %s\n\n", msg.Payload)
				flusher.Flush()
			}
		}
	}
}

func (s *Server) dashboard(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var stores, products, customers int
	var ordersToday, pendingOrders, unreadChats, lowStock int
	var revenueToday float64
	_ = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM stores WHERE user_id=$1`, c.UserID).Scan(&stores)
	_ = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM products p JOIN stores s ON s.id=p.store_id WHERE s.user_id=$1`, c.UserID).Scan(&products)
	_ = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM customers cu JOIN stores s ON s.id=cu.store_id WHERE s.user_id=$1 AND EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=cu.id AND o.status<>'canceled' AND o.flow_type<>'quote')`, c.UserID).Scan(&customers)
	_ = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FILTER (WHERE o.flow_type<>'quote'),coalesce(sum(o.total) FILTER (WHERE o.status<>'canceled' AND o.flow_type<>'quote'),0) FROM orders o JOIN stores s ON s.id=o.store_id WHERE s.user_id=$1 AND o.created_at>=date_trunc('day',now())`, c.UserID).Scan(&ordersToday, &revenueToday)
	_ = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM orders o JOIN stores s ON s.id=o.store_id WHERE s.user_id=$1 AND o.flow_type<>'quote' AND o.status IN ('pending','confirmed','processing','preparing','ready','out_for_delivery')`, c.UserID).Scan(&pendingOrders)
	_ = s.db.QueryRow(r.Context(), `SELECT coalesce(sum(c.unread_count),0) FROM conversations c JOIN stores s ON s.id=c.store_id WHERE s.user_id=$1`, c.UserID).Scan(&unreadChats)
	_ = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM products p JOIN stores s ON s.id=p.store_id WHERE s.user_id=$1 AND p.track_stock=true AND coalesce(p.stock,0)<=5`, c.UserID).Scan(&lowStock)

	rows, _ := s.db.Query(r.Context(), `SELECT o.id,o.order_number,o.customer_name,o.total,o.status,o.created_at,s.name,o.source,o.flow_type FROM orders o JOIN stores s ON s.id=o.store_id WHERE s.user_id=$1 ORDER BY o.created_at DESC LIMIT 8`, c.UserID)
	defer func() {
		if rows != nil {
			rows.Close()
		}
	}()
	recent := []map[string]any{}
	if rows != nil {
		for rows.Next() {
			var id, customer, status, store, source, flowType string
			var num int64
			var total float64
			var created time.Time
			_ = rows.Scan(&id, &num, &customer, &total, &status, &created, &store, &source, &flowType)
			recent = append(recent, map[string]any{"id": id, "number": num, "customer": customer, "total": total, "status": status, "created_at": created, "store": store, "source": source, "flow_type": flowType})
		}
	}
	jsonOut(w, 200, map[string]any{
		"metrics": map[string]any{
			"stores": stores, "products": products, "customers": customers,
			"orders_today": ordersToday, "revenue_today": revenueToday,
			"pending_orders": pendingOrders, "unread_chats": unreadChats, "low_stock": lowStock,
		},
		"recent_orders": recent,
	})
}

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	repl := strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ñ", "n", " ", "-", "_", "-")
	s = repl.Replace(s)
	re := regexp.MustCompile(`[^a-z0-9-]+`)
	s = re.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	for strings.Contains(s, "--") {
		s = strings.ReplaceAll(s, "--", "-")
	}
	if s == "" {
		s = "item-" + uuid.NewString()[:8]
	}
	return s
}

// storeSlugify genera el identificador público compacto de un negocio.
// A diferencia de los slugs de catálogo, las URLs de tiendas no usan
// separadores entre el tipo y el nombre: "Pizzería Demo" -> "pizzeriademo".
func storeSlugify(s string) string {
	slug := strings.ReplaceAll(slugify(s), "-", "")
	if slug == "" {
		slug = "tienda" + strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	}
	return slug
}

var reservedStoreSlugs = map[string]bool{
	"admin": true, "api": true, "catalog": true, "conversations": true, "coupons": true,
	"customers": true, "cliente": true, "dashboard": true, "delivery": true, "domains": true, "geo": true, "health": true, "id": true, "login": true,
	"media": true, "order": true, "orders": true, "plans": true, "register": true, "pos": true, "staff": true, "payment-methods": true,
	"settings": true, "store": true, "stores": true, "support": true, "transactions": true, "proyecto": true, "waxum": true, "www": true,
	"favicon.ico": true, "icon.svg": true, "manifest.webmanifest": true, "sw.js": true,
	"robots.txt": true, "sitemap.xml": true, "_next": true,
	"terminos":   true,
	"privacidad": true,
}

func isReservedStoreSlug(slug string) bool {
	if reservedStoreSlugs[slug] {
		return true
	}
	for key := range reservedStoreSlugs {
		if storeSlugify(key) == slug {
			return true
		}
	}
	return false
}

func safeStoreSlug(value string) string {
	slug := storeSlugify(value)
	if isReservedStoreSlug(slug) {
		return slug + "tienda"
	}
	return slug
}
func (s *Server) safeStoreSlugFor(ctx context.Context, value string) string {
	slug := storeSlugify(value)
	reserved := isReservedStoreSlug(slug)
	domains := s.platformSetting(ctx, "domains")
	if raw, ok := domains["reserved_subdomains"].([]any); ok {
		for _, item := range raw {
			if storeSlugify(strings.TrimSpace(fmt.Sprint(item))) == slug {
				reserved = true
				break
			}
		}
	}
	if raw, ok := domains["reserved_subdomains"].([]string); ok {
		for _, item := range raw {
			if storeSlugify(strings.TrimSpace(item)) == slug {
				reserved = true
				break
			}
		}
	}
	if reserved {
		return slug + "tienda"
	}
	return slug
}
func ownedStoreFilter(role, userID string) (string, []any) {
	if role == "superadmin" {
		return "1=1", []any{}
	}
	return "user_id=$1", []any{userID}
}
func queryStoreOwned(ctx context.Context, db *pgxpool.Pool, userID, role, storeID string) bool {
	var n int
	q := `SELECT COUNT(*) FROM stores WHERE id=$1`
	args := []any{storeID}
	if role != "superadmin" {
		q += ` AND user_id=$2`
		args = append(args, userID)
	}
	_ = db.QueryRow(ctx, q, args...).Scan(&n)
	return n > 0
}

type planLimits struct {
	MaxStores, MaxProducts, MaxOrders int
	WhatsApp                          bool
}

func (s *Server) limitsForUser(ctx context.Context, userID string) planLimits {
	var out planLimits
	err := s.db.QueryRow(ctx, `SELECT p.max_stores,p.max_products,p.max_orders,p.whatsapp_enabled FROM subscriptions sub JOIN plans p ON p.id=sub.plan_id WHERE sub.user_id=$1 AND sub.status='active' AND (sub.ends_at IS NULL OR sub.ends_at>now()) LIMIT 1`, userID).Scan(&out.MaxStores, &out.MaxProducts, &out.MaxOrders, &out.WhatsApp)
	if err != nil {
		return planLimits{MaxStores: 1, MaxProducts: 50, MaxOrders: 100, WhatsApp: true}
	}
	return out
}
func (s *Server) ownerForStore(ctx context.Context, storeID string) (string, error) {
	var uid string
	err := s.db.QueryRow(ctx, `SELECT user_id FROM stores WHERE id=$1`, storeID).Scan(&uid)
	return uid, err
}

func (s *Server) listStores(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	q := `SELECT st.id,st.name,st.slug,coalesce(st.description,''),coalesce(st.logo_url,''),coalesce(st.whatsapp,''),coalesce(st.address,''),st.currency,st.primary_color,st.is_active,st.created_at,st.business_engine,st.template_config,coalesce(bt.slug,''),coalesce(bt.name,''),st.visual_theme,st.theme_config FROM stores st LEFT JOIN business_templates bt ON bt.id=st.template_id`
	args := []any{}
	if c.Role != "superadmin" {
		q += ` WHERE st.user_id=$1`
		args = append(args, c.UserID)
	}
	q += ` ORDER BY st.created_at DESC`
	rows, err := s.db.Query(r.Context(), q, args...)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, slug, desc, logo, wa, address, currency, color, engine, templateSlug, templateName, visualTheme string
		var active bool
		var created time.Time
		var configRaw, themeRaw []byte
		if rows.Scan(&id, &name, &slug, &desc, &logo, &wa, &address, &currency, &color, &active, &created, &engine, &configRaw, &templateSlug, &templateName, &visualTheme, &themeRaw) != nil {
			continue
		}
		var config any = map[string]any{}
		var themeConfig any = map[string]any{}
		_ = json.Unmarshal(configRaw, &config)
		_ = json.Unmarshal(themeRaw, &themeConfig)
		out = append(out, map[string]any{"id": id, "name": name, "slug": slug, "public_url": s.storePublicURL(r.Context(), id, slug), "description": desc, "logo_url": logo, "whatsapp": wa, "address": address, "currency": currency, "primary_color": color, "is_active": active, "created_at": created, "business_engine": engine, "template_config": config, "template_slug": templateSlug, "template_name": templateName, "visual_theme": visualTheme, "theme_config": themeConfig})
	}
	jsonOut(w, 200, out)
}

func (s *Server) createStore(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var in struct {
		Name         string `json:"name"`
		Slug         string `json:"slug"`
		Description  string `json:"description"`
		LogoURL      string `json:"logo_url"`
		Whatsapp     string `json:"whatsapp"`
		Address      string `json:"address"`
		PrimaryColor string `json:"primary_color"`
		TemplateSlug string `json:"template_slug"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Nombre obligatorio")
		return
	}
	if c.Role != "superadmin" {
		limits := s.limitsForUser(r.Context(), c.UserID)
		var count int
		_ = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM stores WHERE user_id=$1 AND is_active=true`, c.UserID).Scan(&count)
		if count >= limits.MaxStores {
			jsonErr(w, 403, "Has alcanzado el límite de tiendas de tu plan")
			return
		}
	}
	if in.Slug == "" {
		in.Slug = s.safeStoreSlugFor(r.Context(), in.Name)
	} else {
		in.Slug = s.safeStoreSlugFor(r.Context(), in.Slug)
	}
	if in.PrimaryColor == "" {
		in.PrimaryColor = "#36b385"
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo crear la tienda")
		return
	}
	defer tx.Rollback(r.Context())
	var id string
	err = tx.QueryRow(r.Context(), `INSERT INTO stores(user_id,name,slug,description,logo_url,phone,whatsapp,address,primary_color) VALUES($1,$2,$3,$4,$5,NULL,$6,$7,$8) RETURNING id`, c.UserID, in.Name, in.Slug, in.Description, in.LogoURL, in.Whatsapp, in.Address, in.PrimaryColor).Scan(&id)
	if err != nil {
		jsonErr(w, 409, "No se pudo crear la tienda; verifica que el identificador sea único")
		return
	}
	if err = s.applyBusinessTemplate(r.Context(), tx, id, in.TemplateSlug); err != nil {
		jsonErr(w, 500, "No se pudo preparar la plantilla del negocio")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la tienda")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id, "slug": in.Slug, "public_url": s.storePublicURL(r.Context(), id, in.Slug)})
}

func (s *Server) updateStore(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, id) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	var in struct {
		Name         string `json:"name"`
		Slug         string `json:"slug"`
		Description  string `json:"description"`
		LogoURL      string `json:"logo_url"`
		Whatsapp     string `json:"whatsapp"`
		Address      string `json:"address"`
		PrimaryColor string `json:"primary_color"`
		IsActive     *bool  `json:"is_active"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	active := true
	if in.IsActive != nil {
		active = *in.IsActive
	}
	if in.Slug == "" {
		in.Slug = s.safeStoreSlugFor(r.Context(), in.Name)
	} else {
		in.Slug = s.safeStoreSlugFor(r.Context(), in.Slug)
	}
	_, err := s.db.Exec(r.Context(), `UPDATE stores SET name=$1,slug=$2,description=$3,logo_url=$4,phone=NULL,whatsapp=$5,address=$6,primary_color=$7,is_active=$8,updated_at=now() WHERE id=$9`, in.Name, in.Slug, in.Description, in.LogoURL, in.Whatsapp, in.Address, in.PrimaryColor, active, id)
	if err != nil {
		jsonErr(w, 409, "No se pudo actualizar la tienda")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}
func (s *Server) deleteStore(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, id) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	_, err := s.db.Exec(r.Context(), `UPDATE stores SET is_active=false,accepting_orders=false,updated_at=now() WHERE id=$1`, id)
	if err != nil {
		jsonErr(w, 500, "No se pudo archivar la tienda")
		return
	}
	jsonOut(w, 200, map[string]any{"ok": true, "archived": true})
}

func storeIDFrom(r *http.Request) string { return r.URL.Query().Get("store_id") }
func (s *Server) assertStore(w http.ResponseWriter, r *http.Request) (string, bool) {
	id := storeIDFrom(r)
	if id == "" {
		jsonErr(w, 400, "store_id es obligatorio")
		return "", false
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, id) {
		jsonErr(w, 404, "Tienda no encontrada")
		return "", false
	}
	return id, true
}

func (s *Server) listCategories(w http.ResponseWriter, r *http.Request) {
	sid, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id,name,slug,coalesce(description,''),coalesce(image_url,''),sort_order,is_active,created_at FROM categories WHERE store_id=$1 ORDER BY sort_order,name`, sid)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, n, sl, d, img string
		var sort int
		var a bool
		var cr time.Time
		_ = rows.Scan(&id, &n, &sl, &d, &img, &sort, &a, &cr)
		out = append(out, map[string]any{"id": id, "name": n, "slug": sl, "description": d, "image_url": img, "sort_order": sort, "is_active": a, "created_at": cr})
	}
	jsonOut(w, 200, out)
}
func (s *Server) createCategory(w http.ResponseWriter, r *http.Request) {
	var in struct {
		StoreID     string `json:"store_id"`
		Name        string `json:"name"`
		Slug        string `json:"slug"`
		Description string `json:"description"`
		ImageURL    string `json:"image_url"`
		SortOrder   int    `json:"sort_order"`
	}
	if decode(r, &in) != nil || in.StoreID == "" || in.Name == "" {
		jsonErr(w, 400, "Tienda y nombre son obligatorios")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	if in.Slug == "" {
		in.Slug = slugify(in.Name)
	}
	if in.SortOrder <= 0 {
		_ = s.db.QueryRow(r.Context(), `SELECT COALESCE(MAX(sort_order),0)+10 FROM categories WHERE store_id=$1`, in.StoreID).Scan(&in.SortOrder)
	}
	var id string
	err := s.db.QueryRow(r.Context(), `INSERT INTO categories(store_id,name,slug,description,image_url,sort_order) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, in.StoreID, in.Name, slugify(in.Slug), in.Description, in.ImageURL, in.SortOrder).Scan(&id)
	if err != nil {
		jsonErr(w, 409, "Categoría duplicada")
		return
	}
	jsonOut(w, 201, map[string]string{"id": id})
}
func (s *Server) updateCategory(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		StoreID     string `json:"store_id"`
		Name        string `json:"name"`
		Slug        string `json:"slug"`
		Description string `json:"description"`
		ImageURL    string `json:"image_url"`
		SortOrder   int    `json:"sort_order"`
		IsActive    bool   `json:"is_active"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	if strings.TrimSpace(in.Slug) == "" {
		in.Slug = slugify(in.Name)
	}
	_, err := s.db.Exec(r.Context(), `UPDATE categories SET name=$1,slug=$2,description=$3,image_url=$4,sort_order=$5,is_active=$6 WHERE id=$7 AND store_id=$8`, in.Name, slugify(in.Slug), in.Description, in.ImageURL, in.SortOrder, in.IsActive, id, in.StoreID)
	if err != nil {
		jsonErr(w, 409, "No se pudo actualizar")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}
func (s *Server) deleteCategory(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var sid string
	err := s.db.QueryRow(r.Context(), `SELECT store_id FROM categories WHERE id=$1`, id).Scan(&sid)
	if err != nil {
		jsonErr(w, 404, "Categoría no encontrada")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, sid) {
		jsonErr(w, 403, "No autorizado")
		return
	}
	_, _ = s.db.Exec(r.Context(), `DELETE FROM categories WHERE id=$1`, id)
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) listProductAttributes(w http.ResponseWriter, r *http.Request) {
	sid, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT sa.id,sa.key,sa.label,sa.input_type,sa.options,sa.is_required,sa.sort_order,coalesce(sg.name,'')
		FROM store_attributes sa LEFT JOIN store_attribute_groups sg ON sg.id=sa.group_id
		WHERE sa.store_id=$1 ORDER BY coalesce(sg.sort_order,0),sa.sort_order,sa.label`, sid)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los campos del catálogo")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, key, label, inputType, groupName string
		var optionsRaw []byte
		var required bool
		var sortOrder int
		if rows.Scan(&id, &key, &label, &inputType, &optionsRaw, &required, &sortOrder, &groupName) != nil {
			continue
		}
		var options any = []any{}
		_ = json.Unmarshal(optionsRaw, &options)
		out = append(out, map[string]any{"id": id, "key": key, "label": label, "input_type": inputType, "options": options, "is_required": required, "sort_order": sortOrder, "group_name": groupName})
	}
	jsonOut(w, 200, out)
}

func scanProduct(rows pgx.Rows) (map[string]any, error) {
	var id, sid, cid, name, slug, sku, desc, img, tag string
	var price float64
	var compare, stock float64
	var track, featured, active bool
	var sortOrder int
	var variants, extras, attributes []byte
	var created, updated time.Time
	err := rows.Scan(&id, &sid, &cid, &name, &slug, &sku, &desc, &img, &price, &compare, &stock, &track, &variants, &extras, &attributes, &tag, &featured, &sortOrder, &active, &created, &updated)
	if err != nil {
		return nil, err
	}
	var v, e, a any
	_ = json.Unmarshal(variants, &v)
	_ = json.Unmarshal(extras, &e)
	_ = json.Unmarshal(attributes, &a)
	return map[string]any{"id": id, "store_id": sid, "category_id": cid, "name": name, "slug": slug, "sku": sku, "description": desc, "image_url": img, "price": price, "compare_price": compare, "stock": stock, "track_stock": track, "variants": v, "extras": e, "attributes": a, "tag": tag, "is_featured": featured, "sort_order": sortOrder, "is_active": active, "created_at": created, "updated_at": updated}, nil
}

func (s *Server) listProducts(w http.ResponseWriter, r *http.Request) {
	sid, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id,store_id,coalesce(category_id::text,''),name,slug,coalesce(sku,''),coalesce(description,''),coalesce(image_url,''),price,coalesce(compare_price,0),coalesce(stock,0),track_stock,variants,extras,attributes,coalesce(tag,''),is_featured,sort_order,is_active,created_at,updated_at FROM products WHERE store_id=$1 ORDER BY is_featured DESC,sort_order,name`, sid)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		p, e := scanProduct(rows)
		if e == nil {
			out = append(out, p)
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) createProduct(w http.ResponseWriter, r *http.Request) {
	var in struct {
		StoreID      string          `json:"store_id"`
		CategoryID   string          `json:"category_id"`
		Name         string          `json:"name"`
		Slug         string          `json:"slug"`
		SKU          string          `json:"sku"`
		Description  string          `json:"description"`
		ImageURL     string          `json:"image_url"`
		Tag          string          `json:"tag"`
		Price        float64         `json:"price"`
		ComparePrice *float64        `json:"compare_price"`
		Stock        *float64        `json:"stock"`
		TrackStock   bool            `json:"track_stock"`
		Variants     json.RawMessage `json:"variants"`
		Extras       json.RawMessage `json:"extras"`
		Attributes   json.RawMessage `json:"attributes"`
		IsFeatured   bool            `json:"is_featured"`
		SortOrder    int             `json:"sort_order"`
	}
	if decode(r, &in) != nil || in.StoreID == "" || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Tienda y nombre son obligatorios")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	productCaps, capsOK := s.businessCapabilityFlagsForStore(r.Context(), in.StoreID)
	if !capsOK {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	if !productCaps.SupportsVariants {
		in.Variants = []byte("[]")
	}
	if !productCaps.SupportsExtras {
		in.Extras = []byte("[]")
	}
	if c.Role != "superadmin" {
		limits := s.limitsForUser(r.Context(), c.UserID)
		var count int
		_ = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM products p JOIN stores st ON st.id=p.store_id WHERE st.user_id=$1`, c.UserID).Scan(&count)
		if count >= limits.MaxProducts {
			jsonErr(w, 403, "Has alcanzado el límite de productos de tu plan")
			return
		}
	}
	if len(in.Variants) == 0 {
		in.Variants = []byte("[]")
	}
	if len(in.Extras) == 0 {
		in.Extras = []byte("[]")
	}
	if len(in.Attributes) == 0 {
		in.Attributes = []byte("{}")
	}
	var cat any = nil
	if in.CategoryID != "" {
		cat = in.CategoryID
	}
	if in.SortOrder <= 0 {
		_ = s.db.QueryRow(r.Context(), `SELECT COALESCE(MAX(sort_order),0)+10 FROM products WHERE store_id=$1`, in.StoreID).Scan(&in.SortOrder)
	}
	var id string
	err := s.db.QueryRow(r.Context(), `INSERT INTO products(store_id,category_id,name,slug,sku,description,image_url,price,compare_price,stock,track_stock,variants,extras,attributes,tag,is_featured,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`, in.StoreID, cat, in.Name, slugify(firstNonEmpty(in.Slug, in.Name)), in.SKU, in.Description, in.ImageURL, in.Price, in.ComparePrice, in.Stock, in.TrackStock, in.Variants, in.Extras, in.Attributes, in.Tag, in.IsFeatured, in.SortOrder).Scan(&id)
	if err != nil {
		jsonErr(w, 409, "No se pudo crear el producto")
		return
	}
	jsonOut(w, 201, map[string]string{"id": id})
}

func (s *Server) updateProduct(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		StoreID      string          `json:"store_id"`
		CategoryID   string          `json:"category_id"`
		Name         string          `json:"name"`
		Slug         string          `json:"slug"`
		SKU          string          `json:"sku"`
		Description  string          `json:"description"`
		ImageURL     string          `json:"image_url"`
		Tag          string          `json:"tag"`
		Price        float64         `json:"price"`
		ComparePrice *float64        `json:"compare_price"`
		Stock        *float64        `json:"stock"`
		TrackStock   bool            `json:"track_stock"`
		Variants     json.RawMessage `json:"variants"`
		Extras       json.RawMessage `json:"extras"`
		Attributes   json.RawMessage `json:"attributes"`
		IsActive     bool            `json:"is_active"`
		IsFeatured   bool            `json:"is_featured"`
		SortOrder    int             `json:"sort_order"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	productCaps, capsOK := s.businessCapabilityFlagsForStore(r.Context(), in.StoreID)
	if !capsOK {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	if !productCaps.SupportsVariants {
		in.Variants = []byte("[]")
	}
	if !productCaps.SupportsExtras {
		in.Extras = []byte("[]")
	}
	if len(in.Variants) == 0 {
		in.Variants = []byte("[]")
	}
	if len(in.Extras) == 0 {
		in.Extras = []byte("[]")
	}
	if len(in.Attributes) == 0 {
		in.Attributes = []byte("{}")
	}
	var cat any = nil
	if in.CategoryID != "" {
		cat = in.CategoryID
	}
	_, err := s.db.Exec(r.Context(), `UPDATE products SET category_id=$1,name=$2,slug=$3,sku=$4,description=$5,image_url=$6,price=$7,compare_price=$8,stock=$9,track_stock=$10,variants=$11,extras=$12,attributes=$13,tag=$14,is_featured=$15,sort_order=$16,is_active=$17,updated_at=now() WHERE id=$18 AND store_id=$19`, cat, in.Name, slugify(firstNonEmpty(in.Slug, in.Name)), in.SKU, in.Description, in.ImageURL, in.Price, in.ComparePrice, in.Stock, in.TrackStock, in.Variants, in.Extras, in.Attributes, in.Tag, in.IsFeatured, in.SortOrder, in.IsActive, id, in.StoreID)
	if err != nil {
		jsonErr(w, 409, "No se pudo actualizar")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) deleteProduct(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var sid string
	if s.db.QueryRow(r.Context(), `SELECT store_id FROM products WHERE id=$1`, id).Scan(&sid) != nil {
		jsonErr(w, 404, "Producto no encontrado")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, sid) {
		jsonErr(w, 403, "No autorizado")
		return
	}
	_, _ = s.db.Exec(r.Context(), `DELETE FROM products WHERE id=$1`, id)
	jsonOut(w, 200, map[string]bool{"ok": true})
}
func firstNonEmpty(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}

func formatOrderQuantity(value float64) string {
	text := strconv.FormatFloat(value, 'f', 3, 64)
	text = strings.TrimRight(strings.TrimRight(text, "0"), ".")
	if text == "" {
		return "0"
	}
	return text
}

func (s *Server) listCoupons(w http.ResponseWriter, r *http.Request) {
	sid, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id,code,discount_type,discount_value,min_order,starts_at,ends_at,usage_limit,used_count,is_active,created_at FROM coupons WHERE store_id=$1 ORDER BY created_at DESC`, sid)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, code, typ string
		var val, min float64
		var st, en *time.Time
		var lim *int
		var used int
		var active bool
		var cr time.Time
		_ = rows.Scan(&id, &code, &typ, &val, &min, &st, &en, &lim, &used, &active, &cr)
		out = append(out, map[string]any{"id": id, "code": code, "discount_type": typ, "discount_value": val, "min_order": min, "starts_at": st, "ends_at": en, "usage_limit": lim, "used_count": used, "is_active": active, "created_at": cr})
	}
	jsonOut(w, 200, out)
}
func (s *Server) createCoupon(w http.ResponseWriter, r *http.Request) {
	var in struct {
		StoreID       string  `json:"store_id"`
		Code          string  `json:"code"`
		DiscountType  string  `json:"discount_type"`
		DiscountValue float64 `json:"discount_value"`
		MinOrder      float64 `json:"min_order"`
		UsageLimit    *int    `json:"usage_limit"`
	}
	if decode(r, &in) != nil || in.StoreID == "" || in.Code == "" {
		jsonErr(w, 400, "Datos incompletos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	if in.DiscountType != "flat" && in.DiscountType != "percentage" {
		in.DiscountType = "flat"
	}
	var id string
	err := s.db.QueryRow(r.Context(), `INSERT INTO coupons(store_id,code,discount_type,discount_value,min_order,usage_limit) VALUES($1,upper($2),$3,$4,$5,$6) RETURNING id`, in.StoreID, in.Code, in.DiscountType, in.DiscountValue, in.MinOrder, in.UsageLimit).Scan(&id)
	if err != nil {
		jsonErr(w, 409, "Cupón duplicado")
		return
	}
	jsonOut(w, 201, map[string]string{"id": id})
}
func (s *Server) updateCoupon(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		StoreID       string  `json:"store_id"`
		Code          string  `json:"code"`
		DiscountType  string  `json:"discount_type"`
		DiscountValue float64 `json:"discount_value"`
		MinOrder      float64 `json:"min_order"`
		UsageLimit    *int    `json:"usage_limit"`
		IsActive      bool    `json:"is_active"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	_, err := s.db.Exec(r.Context(), `UPDATE coupons SET code=upper($1),discount_type=$2,discount_value=$3,min_order=$4,usage_limit=$5,is_active=$6 WHERE id=$7 AND store_id=$8`, in.Code, in.DiscountType, in.DiscountValue, in.MinOrder, in.UsageLimit, in.IsActive, id, in.StoreID)
	if err != nil {
		jsonErr(w, 409, "No se pudo actualizar")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}
func (s *Server) deleteCoupon(w http.ResponseWriter, r *http.Request) {
	s.deleteStoreChild(w, r, "coupons")
}

func (s *Server) listShipping(w http.ResponseWriter, r *http.Request) {
	sid, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id,name,charge,estimated_minutes,is_active,created_at FROM shipping_zones WHERE store_id=$1 ORDER BY name`, sid)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, n string
		var charge float64
		var min int
		var a bool
		var cr time.Time
		_ = rows.Scan(&id, &n, &charge, &min, &a, &cr)
		out = append(out, map[string]any{"id": id, "name": n, "charge": charge, "estimated_minutes": min, "is_active": a, "created_at": cr})
	}
	jsonOut(w, 200, out)
}
func (s *Server) createShipping(w http.ResponseWriter, r *http.Request) {
	var in struct {
		StoreID          string  `json:"store_id"`
		Name             string  `json:"name"`
		Charge           float64 `json:"charge"`
		EstimatedMinutes int     `json:"estimated_minutes"`
	}
	if decode(r, &in) != nil || in.StoreID == "" || in.Name == "" {
		jsonErr(w, 400, "Datos incompletos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	if in.EstimatedMinutes <= 0 {
		in.EstimatedMinutes = 30
	}
	var id string
	err := s.db.QueryRow(r.Context(), `INSERT INTO shipping_zones(store_id,name,charge,estimated_minutes) VALUES($1,$2,$3,$4) RETURNING id`, in.StoreID, in.Name, in.Charge, in.EstimatedMinutes).Scan(&id)
	if err != nil {
		jsonErr(w, 500, "No se pudo crear")
		return
	}
	jsonOut(w, 201, map[string]string{"id": id})
}
func (s *Server) updateShipping(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		StoreID          string  `json:"store_id"`
		Name             string  `json:"name"`
		Charge           float64 `json:"charge"`
		EstimatedMinutes int     `json:"estimated_minutes"`
		IsActive         bool    `json:"is_active"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	_, _ = s.db.Exec(r.Context(), `UPDATE shipping_zones SET name=$1,charge=$2,estimated_minutes=$3,is_active=$4 WHERE id=$5 AND store_id=$6`, in.Name, in.Charge, in.EstimatedMinutes, in.IsActive, id, in.StoreID)
	jsonOut(w, 200, map[string]bool{"ok": true})
}
func (s *Server) deleteShipping(w http.ResponseWriter, r *http.Request) {
	s.deleteStoreChild(w, r, "shipping_zones")
}

func (s *Server) listStoreTables(w http.ResponseWriter, r *http.Request) {
	sid, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id::text,name,capacity,sort_order,is_active,created_at FROM store_tables WHERE store_id=$1 ORDER BY sort_order,name`, sid)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las mesas")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name string
		var capacity, sortOrder int
		var active bool
		var created time.Time
		if rows.Scan(&id, &name, &capacity, &sortOrder, &active, &created) == nil {
			out = append(out, map[string]any{"id": id, "name": name, "capacity": capacity, "sort_order": sortOrder, "is_active": active, "created_at": created})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) createStoreTable(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var in struct {
		StoreID   string `json:"store_id"`
		Name      string `json:"name"`
		Capacity  int    `json:"capacity"`
		SortOrder int    `json:"sort_order"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.StoreID) == "" || strings.TrimSpace(in.Name) == "" || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 400, "Datos de mesa inválidos")
		return
	}
	if in.Capacity <= 0 {
		in.Capacity = 4
	}
	if in.Capacity > 50 {
		in.Capacity = 50
	}
	if in.SortOrder <= 0 {
		_ = s.db.QueryRow(r.Context(), `SELECT coalesce(max(sort_order),0)+10 FROM store_tables WHERE store_id=$1`, in.StoreID).Scan(&in.SortOrder)
	}
	var id string
	if err := s.db.QueryRow(r.Context(), `INSERT INTO store_tables(store_id,name,capacity,sort_order) VALUES($1,$2,$3,$4) RETURNING id::text`, in.StoreID, strings.TrimSpace(in.Name), in.Capacity, in.SortOrder).Scan(&id); err != nil {
		jsonErr(w, 409, "No se pudo crear la mesa; verifica que el nombre no esté repetido")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id, "name": strings.TrimSpace(in.Name), "capacity": in.Capacity, "sort_order": in.SortOrder, "is_active": true})
}

func (s *Server) updateStoreTable(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	var in struct {
		StoreID   string `json:"store_id"`
		Name      string `json:"name"`
		Capacity  int    `json:"capacity"`
		SortOrder int    `json:"sort_order"`
		IsActive  bool   `json:"is_active"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 400, "Datos de mesa inválidos")
		return
	}
	if in.Capacity <= 0 {
		in.Capacity = 4
	}
	if in.Capacity > 50 {
		in.Capacity = 50
	}
	res, err := s.db.Exec(r.Context(), `UPDATE store_tables SET name=$1,capacity=$2,sort_order=$3,is_active=$4,updated_at=now() WHERE id=$5 AND store_id=$6`, strings.TrimSpace(in.Name), in.Capacity, in.SortOrder, in.IsActive, id, in.StoreID)
	if err != nil || res.RowsAffected() == 0 {
		jsonErr(w, 404, "Mesa no encontrada")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) deleteStoreTable(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	var sid string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM store_tables WHERE id=$1`, id).Scan(&sid) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, sid) {
		jsonErr(w, 404, "Mesa no encontrada")
		return
	}
	_, _ = s.db.Exec(r.Context(), `UPDATE store_tables SET is_active=false,updated_at=now() WHERE id=$1`, id)
	jsonOut(w, 200, map[string]bool{"ok": true})
}
func (s *Server) deleteStoreChild(w http.ResponseWriter, r *http.Request, table string) {
	id := chi.URLParam(r, "id")
	var sid string
	q := fmt.Sprintf(`SELECT store_id FROM %s WHERE id=$1`, table)
	if s.db.QueryRow(r.Context(), q, id).Scan(&sid) != nil {
		jsonErr(w, 404, "Registro no encontrado")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, sid) {
		jsonErr(w, 403, "No autorizado")
		return
	}
	_, _ = s.db.Exec(r.Context(), fmt.Sprintf(`DELETE FROM %s WHERE id=$1`, table), id)
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) listQuickReplies(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	var count int
	_ = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM quick_replies WHERE store_id=$1`, storeID).Scan(&count)
	if count == 0 {
		defaults := [][2]string{
			{"Saludo", "¡Hola! 👋 Gracias por escribirnos. ¿En qué podemos ayudarte?"},
			{"Disponible", "Sí, tenemos disponible. Si deseas, puedo prepararte el pedido por aquí."},
			{"Entrega", "Claro. ¿En qué zona o dirección deseas recibir tu pedido?"},
		}
		for i, item := range defaults {
			_, _ = s.db.Exec(r.Context(), `INSERT INTO quick_replies(store_id,title,body,sort_order) VALUES($1,$2,$3,$4)`, storeID, item[0], item[1], (i+1)*10)
		}
	}
	rows, err := s.db.Query(r.Context(), `SELECT id::text,title,body,sort_order FROM quick_replies WHERE store_id=$1 ORDER BY sort_order,title`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las respuestas rápidas")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, title, body string
		var order int
		if rows.Scan(&id, &title, &body, &order) == nil {
			out = append(out, map[string]any{"id": id, "title": title, "body": body, "sort_order": order})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) createQuickReply(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var in struct {
		StoreID string `json:"store_id"`
		Title   string `json:"title"`
		Body    string `json:"body"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Title) == "" || strings.TrimSpace(in.Body) == "" {
		jsonErr(w, 400, "Completa título y mensaje")
		return
	}
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	var id string
	err := s.db.QueryRow(r.Context(), `INSERT INTO quick_replies(store_id,title,body,sort_order) VALUES($1,$2,$3,coalesce((SELECT max(sort_order)+10 FROM quick_replies WHERE store_id=$1),10)) RETURNING id`, in.StoreID, strings.TrimSpace(in.Title), strings.TrimSpace(in.Body)).Scan(&id)
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar la respuesta")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id, "title": strings.TrimSpace(in.Title), "body": strings.TrimSpace(in.Body)})
}

func (s *Server) updateQuickReply(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	var storeID string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM quick_replies WHERE id=$1`, id).Scan(&storeID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Respuesta no encontrada")
		return
	}
	var in struct {
		Title string `json:"title"`
		Body  string `json:"body"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Title) == "" || strings.TrimSpace(in.Body) == "" {
		jsonErr(w, 400, "Completa título y mensaje")
		return
	}
	_, err := s.db.Exec(r.Context(), `UPDATE quick_replies SET title=$1,body=$2,updated_at=now() WHERE id=$3`, strings.TrimSpace(in.Title), strings.TrimSpace(in.Body), id)
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar la respuesta")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) deleteQuickReply(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	var storeID string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM quick_replies WHERE id=$1`, id).Scan(&storeID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Respuesta no encontrada")
		return
	}
	_, _ = s.db.Exec(r.Context(), `DELETE FROM quick_replies WHERE id=$1`, id)
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) listOrders(w http.ResponseWriter, r *http.Request) {
	sid, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT o.id,o.order_number,o.customer_name,o.customer_phone,o.total,o.payment_method,o.payment_status,o.cash_change_requested,coalesce(o.cash_tendered,0),o.status,o.source,o.flow_type,o.delivery_type,o.created_at,coalesce(o.table_id::text,''),coalesce(t.name,''),o.reservation_at,coalesce(o.party_size,0) FROM orders o LEFT JOIN store_tables t ON t.id=o.table_id WHERE o.store_id=$1 ORDER BY o.created_at DESC LIMIT 500`, sid)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, phone, pm, ps, st, source, flowType, deliveryType, tableID, tableName string
		var num int64
		var total, cashTendered float64
		var cashChangeRequested bool
		var cr time.Time
		var reservationAt *time.Time
		var partySize int
		_ = rows.Scan(&id, &num, &name, &phone, &total, &pm, &ps, &cashChangeRequested, &cashTendered, &st, &source, &flowType, &deliveryType, &cr, &tableID, &tableName, &reservationAt, &partySize)
		out = append(out, map[string]any{"id": id, "number": num, "customer_name": name, "customer_phone": phone, "total": total, "payment_method": pm, "payment_status": ps, "cash_change_requested": cashChangeRequested, "cash_tendered": cashTendered, "status": st, "source": source, "flow_type": flowType, "delivery_type": deliveryType, "table_id": tableID, "table_name": tableName, "reservation_at": reservationAt, "party_size": partySize, "created_at": cr})
	}
	jsonOut(w, 200, out)
}
func (s *Server) getOrder(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c := claims(r)
	var sid, customerID, name, phone, address, deliveryType, coupon, pm, ps, status, notes, source, proof, flowType, tableID, tableName string
	var num int64
	var subtotal, discount, shipping, total, cashTendered float64
	var cashChangeRequested bool
	var cr time.Time
	var reservationAt *time.Time
	var partySize int
	var customFieldsRaw []byte
	err := s.db.QueryRow(r.Context(), `SELECT o.store_id,coalesce(o.customer_id::text,''),o.order_number,o.customer_name,o.customer_phone,coalesce(o.delivery_address,''),o.delivery_type,coalesce(o.coupon_code,''),o.subtotal,o.discount,o.shipping,o.total,o.payment_method,o.payment_status,o.cash_change_requested,coalesce(o.cash_tendered,0),o.status,coalesce(o.notes,''),o.source,coalesce(o.payment_proof_url,''),o.flow_type,o.custom_fields,o.created_at,coalesce(o.table_id::text,''),coalesce(t.name,''),o.reservation_at,coalesce(o.party_size,0) FROM orders o LEFT JOIN store_tables t ON t.id=o.table_id WHERE o.id=$1`, id).Scan(&sid, &customerID, &num, &name, &phone, &address, &deliveryType, &coupon, &subtotal, &discount, &shipping, &total, &pm, &ps, &cashChangeRequested, &cashTendered, &status, &notes, &source, &proof, &flowType, &customFieldsRaw, &cr, &tableID, &tableName, &reservationAt, &partySize)
	if err != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, sid) {
		jsonErr(w, 404, "Pedido no encontrado")
		return
	}
	customFields := map[string]any{}
	_ = json.Unmarshal(customFieldsRaw, &customFields)
	rows, _ := s.db.Query(r.Context(), `SELECT id,coalesce(product_id::text,''),product_name,coalesce(variant_name,''),extras,unit_price,quantity,line_total FROM order_items WHERE order_id=$1`, id)
	items := []map[string]any{}
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var iid, pid, pn, vn string
			var extras []byte
			var unit, qty, line float64
			_ = rows.Scan(&iid, &pid, &pn, &vn, &extras, &unit, &qty, &line)
			var ex any
			_ = json.Unmarshal(extras, &ex)
			items = append(items, map[string]any{"id": iid, "product_id": pid, "product_name": pn, "variant_name": vn, "extras": ex, "unit_price": unit, "quantity": qty, "line_total": line})
		}
	}
	jsonOut(w, 200, map[string]any{"id": id, "store_id": sid, "customer_id": customerID, "number": num, "customer_name": name, "customer_phone": phone, "delivery_address": address, "delivery_type": deliveryType, "table_id": tableID, "table_name": tableName, "reservation_at": reservationAt, "party_size": partySize, "coupon_code": coupon, "subtotal": subtotal, "discount": discount, "shipping": shipping, "total": total, "payment_method": pm, "payment_status": ps, "cash_change_requested": cashChangeRequested, "cash_tendered": cashTendered, "payment_proof_url": proof, "status": status, "notes": notes, "source": source, "flow_type": flowType, "custom_fields": customFields, "created_at": cr, "items": items})
}
func (s *Server) updateOrderStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		Status        string `json:"status"`
		PaymentStatus string `json:"payment_status"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	var sid, phone, currentStatus, customerID, customerName, storeName string
	var num int64
	var total float64
	if s.db.QueryRow(r.Context(), `SELECT o.store_id,o.customer_phone,o.order_number,o.status,coalesce(o.customer_id::text,''),o.customer_name,o.total,st.name FROM orders o JOIN stores st ON st.id=o.store_id WHERE o.id=$1`, id).Scan(&sid, &phone, &num, &currentStatus, &customerID, &customerName, &total, &storeName) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, sid) {
		jsonErr(w, 404, "Pedido no encontrado")
		return
	}
	valid := map[string]bool{"pending": true, "confirmed": true, "processing": true, "preparing": true, "ready": true, "out_for_delivery": true, "delivered": true, "picked_up": true, "canceled": true}
	if !valid[in.Status] {
		jsonErr(w, 400, "Estado no válido")
		return
	}
	if currentStatus == "canceled" && in.Status != "canceled" {
		jsonErr(w, 409, "Un pedido cancelado no puede reactivarse; crea un nuevo pedido")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar el pedido")
		return
	}
	defer tx.Rollback(r.Context())
	if currentStatus != "canceled" && in.Status == "canceled" {
		rows, _ := tx.Query(r.Context(), `SELECT product_id,quantity FROM order_items WHERE order_id=$1 AND product_id IS NOT NULL`, id)
		if rows != nil {
			for rows.Next() {
				var pid string
				var qty float64
				_ = rows.Scan(&pid, &qty)
				_, _ = tx.Exec(r.Context(), `UPDATE products SET stock=coalesce(stock,0)+$1,updated_at=now() WHERE id=$2 AND track_stock=true`, qty, pid)
			}
			rows.Close()
		}
	}
	if in.PaymentStatus == "" {
		_, err = tx.Exec(r.Context(), `UPDATE orders SET status=$1,updated_at=now() WHERE id=$2`, in.Status, id)
	} else {
		_, err = tx.Exec(r.Context(), `UPDATE orders SET status=$1,payment_status=$2,updated_at=now() WHERE id=$3`, in.Status, in.PaymentStatus, id)
	}
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar el pedido")
		return
	}
	// Keep table availability consistent with the order lifecycle.
	switch in.Status {
	case "canceled":
		_, _ = tx.Exec(r.Context(), `UPDATE table_reservations SET status='canceled',updated_at=now() WHERE order_id=$1 AND status NOT IN ('canceled','completed')`, id)
	case "delivered", "picked_up":
		_, _ = tx.Exec(r.Context(), `UPDATE table_reservations SET status='completed',updated_at=now() WHERE order_id=$1 AND status NOT IN ('canceled','completed')`, id)
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar el cambio")
		return
	}
	s.refreshCustomerStats(r.Context(), customerID)
	s.publishStoreEvent(r.Context(), sid, "order_status", map[string]any{"id": id, "number": num, "status": in.Status})
	key := ""
	switch in.Status {
	case "confirmed":
		key = "order_confirmed"
	case "ready":
		key = "order_ready"
	case "out_for_delivery":
		key = "order_on_the_way"
	case "delivered", "picked_up":
		key = "order_delivered"
	}
	message := fmt.Sprintf("Actualización de tu pedido #%d: %s", num, spanishStatus(in.Status))
	if key != "" {
		message = s.renderPlatformNotification(r.Context(), key, message, map[string]string{
			"cliente": customerName,
			"negocio": storeName,
			"pedido":  fmt.Sprint(num),
			"total":   fmt.Sprintf("RD$ %.2f", total),
		})
	}
	go s.trySendWhatsApp(context.Background(), sid, phone, message)
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func spanishStatus(status string) string {
	switch status {
	case "pending":
		return "Pendiente"
	case "confirmed":
		return "Confirmado"
	case "processing", "preparing":
		return "Preparando"
	case "ready":
		return "Listo"
	case "out_for_delivery":
		return "En camino"
	case "delivered":
		return "Entregado"
	case "picked_up":
		return "Recogido"
	case "canceled":
		return "Cancelado"
	default:
		return status
	}
}

func (s *Server) listConversations(w http.ResponseWriter, r *http.Request) {
	sid, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT c.id,c.remote_jid,
		       CASE WHEN EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=c.customer_id AND o.status<>'canceled' AND o.flow_type<>'quote')
		            THEN coalesce(nullif(cu.name,''),nullif(c.contact_name,''),nullif(c.whatsapp_name,''),nullif(c.display_name,''),'')
		            ELSE coalesce(nullif(c.contact_name,''),nullif(c.whatsapp_name,''),nullif(c.display_name,''),'') END,
		       c.unread_count,coalesce(c.last_message,''),c.last_message_at,c.created_at,
		       coalesce(c.customer_id::text,''),coalesce(c.status,'open'),
		       coalesce(nullif(c.whatsapp_phone,''),nullif(cu.phone,''),
		                CASE WHEN split_part(lower(c.remote_jid),'@',2)='s.whatsapp.net' THEN regexp_replace(split_part(c.remote_jid,'@',1),'[^0-9]','','g') ELSE '' END),
		       coalesce(c.whatsapp_name,''),coalesce(c.profile_picture_url,''),
		       CASE WHEN EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=c.customer_id AND o.status<>'canceled' AND o.flow_type<>'quote') THEN 'customer' ELSE 'contact' END
		FROM conversations c
		LEFT JOIN customers cu ON cu.id=c.customer_id
		WHERE c.store_id=$1
		  AND split_part(lower(c.remote_jid),'@',2) IN ('s.whatsapp.net','lid')
		ORDER BY c.last_message_at DESC NULLS LAST,c.created_at DESC
		LIMIT 300`, sid)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las conversaciones")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, jid, name, last, customerID, status, phone, whatsappName, profilePictureURL, contactType string
		var unread int
		var lastAt *time.Time
		var created time.Time
		_ = rows.Scan(&id, &jid, &name, &unread, &last, &lastAt, &created, &customerID, &status, &phone, &whatsappName, &profilePictureURL, &contactType)
		out = append(out, map[string]any{
			"id": id, "remote_jid": jid, "display_name": name, "unread_count": unread,
			"last_message": last, "last_message_at": lastAt, "created_at": created,
			"customer_id": customerID, "status": status, "phone": phone,
			"whatsapp_name": whatsappName, "profile_picture_url": profilePictureURL, "contact_type": contactType,
		})
	}
	jsonOut(w, 200, out)
}
func (s *Server) conversationOwned(ctx context.Context, c *authpkg.Claims, id string) (string, string, bool) {
	var sid, jid string
	err := s.db.QueryRow(ctx, `SELECT store_id,remote_jid FROM conversations WHERE id=$1 AND split_part(lower(remote_jid),'@',2) IN ('s.whatsapp.net','lid')`, id).Scan(&sid, &jid)
	if err != nil || !queryStoreOwned(ctx, s.db, c.UserID, c.Role, sid) {
		return "", "", false
	}
	return sid, jid, true
}
func isDirectWhatsAppJID(jid string) bool {
	parts := strings.SplitN(strings.ToLower(strings.TrimSpace(jid)), "@", 2)
	if len(parts) != 2 || strings.TrimSpace(parts[0]) == "" {
		return false
	}
	return parts[1] == "s.whatsapp.net" || parts[1] == "lid"
}

func conversationPhone(jid string) string {
	base := strings.SplitN(jid, "@", 2)[0]
	return normalizePhone(base)
}
func (s *Server) listMessages(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	_, _, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id,coalesce(message_id,''),direction,type,coalesce(body,''),coalesce(status,''),coalesce(media_url,''),coalesce(mime_type,''),coalesce(file_name,''),coalesce(file_size,0),coalesce(caption,''),occurred_at FROM messages WHERE conversation_id=$1 ORDER BY occurred_at ASC LIMIT 1000`, id)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los mensajes")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var mid, msgid, dir, typ, body, status, mediaURL, mimeType, fileName, caption string
		var fileSize int64
		var at time.Time
		_ = rows.Scan(&mid, &msgid, &dir, &typ, &body, &status, &mediaURL, &mimeType, &fileName, &fileSize, &caption, &at)
		out = append(out, map[string]any{"id": mid, "message_id": msgid, "direction": dir, "type": typ, "body": body, "status": status, "media_url": mediaURL, "mime_type": mimeType, "file_name": fileName, "file_size": fileSize, "caption": caption, "occurred_at": at})
	}
	jsonOut(w, 200, out)
}
func (s *Server) conversationDetails(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	sid, jid, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	var displayName, customerID, status, contactName, contactAddress, contactNotes, contactStatus, whatsappName, whatsappPhone, profilePictureURL string
	_ = s.db.QueryRow(r.Context(), `SELECT coalesce(display_name,''),coalesce(customer_id::text,''),coalesce(status,'open'),coalesce(contact_name,''),coalesce(contact_address,''),coalesce(contact_notes,''),coalesce(contact_status,'active'),coalesce(whatsapp_name,''),coalesce(whatsapp_phone,''),coalesce(profile_picture_url,'') FROM conversations WHERE id=$1`, id).Scan(&displayName, &customerID, &status, &contactName, &contactAddress, &contactNotes, &contactStatus, &whatsappName, &whatsappPhone, &profilePictureURL)
	phone := normalizePhone(whatsappPhone)
	if phone == "" && strings.HasSuffix(strings.ToLower(jid), "@s.whatsapp.net") {
		phone = conversationPhone(jid)
	}
	customer := map[string]any{"id": "", "name": "", "phone": phone, "address": "", "notes": "", "status": "active", "order_count": 0, "total_spent": 0.0}
	orders := []map[string]any{}
	isCustomer := false
	if customerID != "" {
		_ = s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM orders WHERE customer_id=$1 AND status<>'canceled' AND flow_type<>'quote')`, customerID).Scan(&isCustomer)
		var name, cphone, address, notes, cstatus string
		var count int
		var spent float64
		var last *time.Time
		var created time.Time
		if s.db.QueryRow(r.Context(), `SELECT name,phone,coalesce(address,''),coalesce(notes,''),status,order_count,total_spent,last_order_at,created_at FROM customers WHERE id=$1`, customerID).Scan(&name, &cphone, &address, &notes, &cstatus, &count, &spent, &last, &created) == nil {
			if phone == "" {
				phone = normalizePhone(cphone)
			}
			orows, _ := s.db.Query(r.Context(), `SELECT id,order_number,total,status,payment_status,flow_type,created_at FROM orders WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 20`, customerID)
			if orows != nil {
				defer orows.Close()
				for orows.Next() {
					var oid, ost, ps, flowType string
					var num int64
					var total float64
					var at time.Time
					_ = orows.Scan(&oid, &num, &total, &ost, &ps, &flowType, &at)
					orders = append(orders, map[string]any{"id": oid, "number": num, "total": total, "status": ost, "payment_status": ps, "flow_type": flowType, "created_at": at})
				}
			}
			if isCustomer {
				customer = map[string]any{"id": customerID, "name": name, "phone": cphone, "address": address, "notes": notes, "status": cstatus, "order_count": count, "total_spent": spent, "last_order_at": last, "created_at": created}
				if contactName == "" {
					contactName = name
				}
				if contactAddress == "" {
					contactAddress = address
				}
				if contactNotes == "" {
					contactNotes = notes
				}
				if contactStatus == "" {
					contactStatus = cstatus
				}
			}
		}
	}
	if contactName == "" {
		contactName = strings.TrimSpace(whatsappName)
	}
	if contactName == "" {
		contactName = strings.TrimSpace(displayName)
	}
	if contactName == "" && phone != "" {
		contactName = "+" + phone
	}
	if isCustomer {
		if name, ok := customer["name"].(string); ok && strings.TrimSpace(name) != "" {
			displayName = name
		}
	} else {
		displayName = contactName
	}
	contactType := "contact"
	if isCustomer {
		contactType = "customer"
	}
	contact := map[string]any{"name": contactName, "phone": phone, "address": contactAddress, "notes": contactNotes, "status": contactStatus}
	var total, incoming, outgoing, images, videos, audios, documents int
	var firstAt, lastAt *time.Time
	_ = s.db.QueryRow(r.Context(), `SELECT count(*)::int,count(*) FILTER (WHERE direction='in')::int,count(*) FILTER (WHERE direction='out')::int,count(*) FILTER (WHERE type ILIKE '%image%')::int,count(*) FILTER (WHERE type ILIKE '%video%')::int,count(*) FILTER (WHERE type ILIKE '%audio%' OR type ILIKE '%ptt%')::int,count(*) FILTER (WHERE type ILIKE '%document%')::int,min(occurred_at),max(occurred_at) FROM messages WHERE conversation_id=$1`, id).Scan(&total, &incoming, &outgoing, &images, &videos, &audios, &documents, &firstAt, &lastAt)
	jsonOut(w, 200, map[string]any{
		"id": id, "store_id": sid, "remote_jid": jid, "display_name": displayName, "phone": phone,
		"status": status, "contact_type": contactType, "whatsapp_name": whatsappName,
		"profile_picture_url": profilePictureURL, "contact": contact, "customer": customer, "orders": orders,
		"metrics": map[string]any{"messages": total, "incoming": incoming, "outgoing": outgoing, "images": images, "videos": videos, "audios": audios, "documents": documents, "first_interaction": firstAt, "last_interaction": lastAt},
	})
}
func (s *Server) saveConversationCustomer(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	_, jid, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	var in struct {
		Name    string `json:"name"`
		Address string `json:"address"`
		Notes   string `json:"notes"`
		Status  string `json:"status"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "El nombre es obligatorio")
		return
	}
	if in.Status != "blocked" {
		in.Status = "active"
	}
	var linkedCustomerID, linkedPhone, whatsappPhone string
	_ = s.db.QueryRow(r.Context(), `SELECT coalesce(c.customer_id::text,''),coalesce(cu.phone,''),coalesce(c.whatsapp_phone,'') FROM conversations c LEFT JOIN customers cu ON cu.id=c.customer_id WHERE c.id=$1`, id).Scan(&linkedCustomerID, &linkedPhone, &whatsappPhone)
	phone := normalizePhone(whatsappPhone)
	if phone == "" {
		phone = normalizePhone(linkedPhone)
	}
	if phone == "" && strings.HasSuffix(strings.ToLower(jid), "@s.whatsapp.net") {
		phone = conversationPhone(jid)
	}
	if phone == "" {
		jsonErr(w, 400, "No se pudo determinar el WhatsApp del contacto")
		return
	}
	isCustomer := false
	if linkedCustomerID != "" {
		_ = s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM orders WHERE customer_id=$1 AND status<>'canceled' AND flow_type<>'quote')`, linkedCustomerID).Scan(&isCustomer)
	}
	name := strings.TrimSpace(in.Name)
	address := strings.TrimSpace(in.Address)
	if isCustomer {
		_, err := s.db.Exec(r.Context(), `UPDATE customers SET name=$1,address=$2,notes=$3,status=$4,updated_at=now() WHERE id=$5`, name, address, in.Notes, in.Status, linkedCustomerID)
		if err != nil {
			jsonErr(w, 500, "No se pudo guardar el cliente")
			return
		}
		_, _ = s.db.Exec(r.Context(), `UPDATE conversations SET contact_name=$1,contact_address=$2,contact_notes=$3,contact_status=$4,display_name=$1,whatsapp_phone=coalesce(nullif(whatsapp_phone,''),$5),updated_at=now() WHERE id=$6`, name, address, in.Notes, in.Status, phone, id)
		s.refreshCustomerStats(r.Context(), linkedCustomerID)
		jsonOut(w, 200, map[string]any{"ok": true, "customer_id": linkedCustomerID, "name": name, "phone": phone, "contact_type": "customer"})
		return
	}
	_, err := s.db.Exec(r.Context(), `UPDATE conversations SET customer_id=NULL,contact_name=$1,contact_address=$2,contact_notes=$3,contact_status=$4,display_name=$1,whatsapp_phone=coalesce(nullif(whatsapp_phone,''),$5),updated_at=now() WHERE id=$6`, name, address, in.Notes, in.Status, phone, id)
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar el contacto")
		return
	}
	jsonOut(w, 200, map[string]any{"ok": true, "customer_id": "", "name": name, "phone": phone, "contact_type": "contact"})
}
func (s *Server) updateConversationStatus(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	_, _, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	var in struct {
		Status string `json:"status"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Estado inválido")
		return
	}
	if in.Status != "open" && in.Status != "pending" && in.Status != "closed" {
		in.Status = "open"
	}
	_, _ = s.db.Exec(r.Context(), `UPDATE conversations SET status=$1,updated_at=now() WHERE id=$2`, in.Status, id)
	jsonOut(w, 200, map[string]bool{"ok": true})
}
func (s *Server) deleteConversation(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	_, _, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	if _, err := s.db.Exec(r.Context(), `DELETE FROM conversations WHERE id=$1`, id); err != nil {
		jsonErr(w, 500, "No se pudo eliminar la conversación")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) clearConversationMessages(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	_, _, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo vaciar la conversación")
		return
	}
	defer tx.Rollback(r.Context())
	if _, err = tx.Exec(r.Context(), `DELETE FROM messages WHERE conversation_id=$1`, id); err != nil {
		jsonErr(w, 500, "No se pudieron eliminar los mensajes")
		return
	}
	if _, err = tx.Exec(r.Context(), `UPDATE conversations SET unread_count=0,last_message='',last_message_at=NULL,updated_at=now() WHERE id=$1`, id); err != nil {
		jsonErr(w, 500, "No se pudo actualizar la conversación")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo vaciar la conversación")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) blockConversation(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	_, _, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	var in struct {
		Blocked bool `json:"blocked"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Estado inválido")
		return
	}
	status := "active"
	if in.Blocked {
		status = "blocked"
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar el contacto")
		return
	}
	defer tx.Rollback(r.Context())
	var customerID string
	_ = tx.QueryRow(r.Context(), `SELECT coalesce(customer_id::text,'') FROM conversations WHERE id=$1`, id).Scan(&customerID)
	if _, err = tx.Exec(r.Context(), `UPDATE conversations SET contact_status=$1,status=CASE WHEN $2 THEN 'closed' ELSE status END,unread_count=CASE WHEN $2 THEN 0 ELSE unread_count END,updated_at=now() WHERE id=$3`, status, in.Blocked, id); err != nil {
		jsonErr(w, 500, "No se pudo actualizar la conversación")
		return
	}
	if customerID != "" {
		_, _ = tx.Exec(r.Context(), `UPDATE customers SET status=$1,updated_at=now() WHERE id=$2`, status, customerID)
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo actualizar el contacto")
		return
	}
	jsonOut(w, 200, map[string]any{"ok": true, "blocked": in.Blocked})
}

func (s *Server) conversationIsBlocked(ctx context.Context, id string) bool {
	var blocked bool
	_ = s.db.QueryRow(ctx, `SELECT coalesce(contact_status,'active')='blocked' FROM conversations WHERE id=$1`, id).Scan(&blocked)
	return blocked
}

func (s *Server) listConversationNotes(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	_, _, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT n.id,n.note,n.created_at,coalesce(u.name,'WAMERCIO') FROM conversation_notes n LEFT JOIN users u ON u.id=n.created_by WHERE n.conversation_id=$1 ORDER BY n.created_at DESC LIMIT 100`, id)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los registros")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var nid, note, author string
		var at time.Time
		_ = rows.Scan(&nid, &note, &at, &author)
		out = append(out, map[string]any{"id": nid, "note": note, "created_at": at, "author": author})
	}
	jsonOut(w, 200, out)
}
func (s *Server) createConversationNote(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	_, _, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	var in struct {
		Note string `json:"note"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Note) == "" {
		jsonErr(w, 400, "Escribe un registro")
		return
	}
	var nid string
	var at time.Time
	if s.db.QueryRow(r.Context(), `INSERT INTO conversation_notes(conversation_id,created_by,note) VALUES($1,$2,$3) RETURNING id,created_at`, id, c.UserID, strings.TrimSpace(in.Note)).Scan(&nid, &at) != nil {
		jsonErr(w, 500, "No se pudo guardar el registro")
		return
	}
	jsonOut(w, 201, map[string]any{"id": nid, "note": strings.TrimSpace(in.Note), "created_at": at})
}
func (s *Server) readConversation(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	sid, jid, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	rows, _ := s.db.Query(r.Context(), `SELECT message_id FROM messages WHERE conversation_id=$1 AND direction='in' AND coalesce(message_id,'')<>'' AND coalesce(status,'')<>'read' ORDER BY occurred_at DESC LIMIT 100`, id)
	ids := []string{}
	if rows != nil {
		for rows.Next() {
			var mid string
			if rows.Scan(&mid) == nil {
				ids = append(ids, mid)
			}
		}
		rows.Close()
	}
	if len(ids) > 0 {
		_, _ = s.bridgeReq(r.Context(), "POST", "/sessions/"+sid+"/read", map[string]any{"chat": jid, "message_ids": ids})
		_, _ = s.db.Exec(r.Context(), `UPDATE messages SET status='read' WHERE conversation_id=$1 AND direction='in' AND message_id=ANY($2::text[])`, id, ids)
	}
	_, _ = s.db.Exec(r.Context(), `UPDATE conversations SET unread_count=0,updated_at=now() WHERE id=$1`, id)
	jsonOut(w, 200, map[string]bool{"ok": true})
}
func (s *Server) sendConversationMessage(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	sid, jid, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	if s.conversationIsBlocked(r.Context(), id) {
		jsonErr(w, 409, "El contacto está bloqueado")
		return
	}
	var in struct {
		Text string `json:"text"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Text) == "" {
		jsonErr(w, 400, "Escribe un mensaje")
		return
	}
	out, err := s.bridgeReq(r.Context(), "POST", "/sessions/"+sid+"/messages", map[string]any{"to": jid, "text": strings.TrimSpace(in.Text)})
	if err != nil {
		jsonErr(w, 502, "No se pudo enviar. Verifica la conexión de WhatsApp")
		return
	}
	msgID := fmt.Sprint(out["id"])
	now := time.Now()
	_, _ = s.db.Exec(r.Context(), `INSERT INTO messages(conversation_id,message_id,direction,type,body,status,occurred_at) VALUES($1,$2,'out','text',$3,'sent',$4) ON CONFLICT(conversation_id,message_id) DO NOTHING`, id, msgID, strings.TrimSpace(in.Text), now)
	_, _ = s.db.Exec(r.Context(), `UPDATE conversations SET last_message=$1,last_message_at=$2,updated_at=now() WHERE id=$3`, strings.TrimSpace(in.Text), now, id)
	jsonOut(w, 200, map[string]any{"ok": true, "id": msgID, "occurred_at": now})
}

func businessOpenNow(raw []byte, timezone string) bool {
	if len(raw) == 0 || string(raw) == "{}" || string(raw) == "null" {
		return true
	}
	loc, err := time.LoadLocation(strings.TrimSpace(timezone))
	if err != nil {
		loc, _ = time.LoadLocation("America/Santo_Domingo")
	}
	now := time.Now().In(loc)
	keys := map[time.Weekday]string{
		time.Monday: "mon", time.Tuesday: "tue", time.Wednesday: "wed", time.Thursday: "thu",
		time.Friday: "fri", time.Saturday: "sat", time.Sunday: "sun",
	}
	var hours map[string]struct {
		Enabled bool   `json:"enabled"`
		Open    string `json:"open"`
		Close   string `json:"close"`
	}
	if json.Unmarshal(raw, &hours) != nil || len(hours) == 0 {
		return true
	}
	day, ok := hours[keys[now.Weekday()]]
	if !ok {
		return true
	}
	if !day.Enabled {
		return false
	}
	openAt, err1 := time.ParseInLocation("15:04", day.Open, loc)
	closeAt, err2 := time.ParseInLocation("15:04", day.Close, loc)
	if err1 != nil || err2 != nil {
		return true
	}
	current := now.Hour()*60 + now.Minute()
	openMin := openAt.Hour()*60 + openAt.Minute()
	closeMin := closeAt.Hour()*60 + closeAt.Minute()
	if closeMin == openMin {
		return true
	}
	if closeMin > openMin {
		return current >= openMin && current < closeMin
	}
	return current >= openMin || current < closeMin
}

func (s *Server) publicStore(w http.ResponseWriter, r *http.Request) {
	resolved, err := s.resolveStoreHost(r.Context(), s.requestHostname(r))
	if err != nil {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	slug := resolved.Slug
	var sid, name, desc, logo, banner, wa, address, currency, color, timezone, businessEngine, visualTheme string
	var bankName, accountName, accountNumber, accountType, orderNotice, checkoutMessage string
	var serviceScope, provinceCode, province, cityID, municipality, neighborhoodID, neighborhood string
	var minimum float64
	var pickup, delivery, dineIn, cash, cod, transfer, acceptingOrders bool
	var reservationDuration int
	var hoursRaw, templateConfigRaw, themeConfigRaw []byte
	err = s.db.QueryRow(r.Context(), `SELECT id,name,coalesce(description,''),coalesce(logo_url,''),coalesce(banner_url,''),coalesce(whatsapp,''),coalesce(address,''),currency,primary_color,timezone,minimum_order,pickup_enabled,delivery_enabled,dine_in_enabled,reservation_duration_minutes,cash_enabled,cash_on_delivery_enabled,bank_transfer_enabled,accepting_orders,coalesce(bank_name,''),coalesce(bank_account_name,''),coalesce(bank_account_number,''),coalesce(bank_account_type,''),business_hours,coalesce(order_notice,''),coalesce(checkout_message,''),business_engine,template_config,visual_theme,theme_config,coalesce(service_scope,'national'),coalesce(province_code,''),coalesce(province,''),coalesce(city_id,''),coalesce(municipality,''),coalesce(neighborhood_id,''),coalesce(neighborhood,'') FROM stores WHERE id=$1 AND is_active=true`, resolved.StoreID).Scan(&sid, &name, &desc, &logo, &banner, &wa, &address, &currency, &color, &timezone, &minimum, &pickup, &delivery, &dineIn, &reservationDuration, &cash, &cod, &transfer, &acceptingOrders, &bankName, &accountName, &accountNumber, &accountType, &hoursRaw, &orderNotice, &checkoutMessage, &businessEngine, &templateConfigRaw, &visualTheme, &themeConfigRaw, &serviceScope, &provinceCode, &province, &cityID, &municipality, &neighborhoodID, &neighborhood)
	if err != nil {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	var hours any = map[string]any{}
	var templateConfig any = map[string]any{}
	var themeConfig any = map[string]any{}
	_ = json.Unmarshal(hoursRaw, &hours)
	_ = json.Unmarshal(templateConfigRaw, &templateConfig)
	_ = json.Unmarshal(themeConfigRaw, &themeConfig)
	openNow := acceptingOrders && businessOpenNow(hoursRaw, timezone)
	cats := []map[string]any{}
	rows, _ := s.db.Query(r.Context(), `SELECT id,name,slug,coalesce(description,''),coalesce(image_url,'') FROM categories WHERE store_id=$1 AND is_active=true ORDER BY sort_order,name`, sid)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var id, n, sl, d, img string
			_ = rows.Scan(&id, &n, &sl, &d, &img)
			cats = append(cats, map[string]any{"id": id, "name": n, "slug": sl, "description": d, "image_url": img})
		}
	}
	prods := []map[string]any{}
	pr, err := s.db.Query(r.Context(), `SELECT id,store_id,coalesce(category_id::text,''),name,slug,coalesce(sku,''),coalesce(description,''),coalesce(image_url,''),price,coalesce(compare_price,0),coalesce(stock,0),track_stock,variants,extras,attributes,coalesce(tag,''),is_featured,sort_order,is_active,created_at,updated_at FROM products WHERE store_id=$1 AND is_active=true ORDER BY is_featured DESC,sort_order,name`, sid)
	if err != nil {
		jsonErr(w, 500, "No se pudo cargar el catálogo público")
		return
	}
	defer pr.Close()
	for pr.Next() {
		p, e := scanProduct(pr)
		if e != nil {
			jsonErr(w, 500, "No se pudo leer un producto del catálogo")
			return
		}
		prods = append(prods, p)
	}
	zones := []map[string]any{}
	zr, _ := s.db.Query(r.Context(), `SELECT id,name,charge,estimated_minutes FROM shipping_zones WHERE store_id=$1 AND is_active=true ORDER BY name`, sid)
	if zr != nil {
		defer zr.Close()
		for zr.Next() {
			var id, n string
			var ch float64
			var min int
			_ = zr.Scan(&id, &n, &ch, &min)
			zones = append(zones, map[string]any{"id": id, "name": n, "charge": ch, "estimated_minutes": min})
		}
	}
	tables := []map[string]any{}
	if dineIn {
		tr, _ := s.db.Query(r.Context(), `SELECT id::text,name,capacity FROM store_tables WHERE store_id=$1 AND is_active=true ORDER BY sort_order,name`, sid)
		if tr != nil {
			defer tr.Close()
			for tr.Next() {
				var id, tableName string
				var capacity int
				_ = tr.Scan(&id, &tableName, &capacity)
				tables = append(tables, map[string]any{"id": id, "name": tableName, "capacity": capacity})
			}
		}
	}
	jsonOut(w, 200, map[string]any{
		"store": map[string]any{
			"id": sid, "name": name, "slug": slug, "hostname": resolved.Hostname, "public_url": s.storePublicURL(r.Context(), sid, slug), "description": desc, "logo_url": logo, "banner_url": banner,
			"whatsapp": wa, "address": address, "currency": currency, "primary_color": color, "minimum_order": minimum,
			"business_engine": businessEngine, "template_config": templateConfig, "visual_theme": visualTheme, "theme_config": themeConfig,
			"service_scope": normalizeStoreServiceScope(serviceScope), "province_code": provinceCode, "province": province, "city_id": cityID, "municipality": municipality, "neighborhood_id": neighborhoodID, "neighborhood": neighborhood,
			"pickup_enabled": pickup, "delivery_enabled": delivery, "dine_in_enabled": dineIn, "reservation_duration_minutes": reservationDuration, "business_hours": hours, "order_notice": orderNotice, "checkout_message": checkoutMessage, "accepting_orders": acceptingOrders, "open_now": openNow,
			"payment_methods": map[string]bool{"cash": cash, "cash_on_delivery": cod, "bank_transfer": transfer},
			"bank_transfer":   map[string]any{"bank_name": bankName, "account_name": accountName, "account_number": accountNumber, "account_type": accountType},
		},
		"categories": cats, "products": prods, "shipping_zones": zones, "tables": tables,
	})
}

func (s *Server) publicOrder(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(chi.URLParam(r, "token"))
	if token == "" {
		jsonErr(w, 404, "Pedido no encontrado")
		return
	}
	var id, storeName, storeWhatsapp, customerName, deliveryType, paymentMethod, paymentStatus, status, paymentProof string
	var number int64
	var subtotal, discount, shipping, total, cashTendered float64
	var cashChangeRequested bool
	var created, updated time.Time
	err := s.db.QueryRow(r.Context(), `SELECT o.id::text,st.name,coalesce(st.whatsapp,''),o.order_number,o.customer_name,o.delivery_type,o.subtotal,o.discount,o.shipping,o.total,o.payment_method,o.payment_status,o.cash_change_requested,coalesce(o.cash_tendered,0),o.status,coalesce(o.payment_proof_url,''),o.created_at,o.updated_at FROM orders o JOIN stores st ON st.id=o.store_id WHERE o.public_token::text=$1`, token).Scan(&id, &storeName, &storeWhatsapp, &number, &customerName, &deliveryType, &subtotal, &discount, &shipping, &total, &paymentMethod, &paymentStatus, &cashChangeRequested, &cashTendered, &status, &paymentProof, &created, &updated)
	if err != nil {
		jsonErr(w, 404, "Pedido no encontrado")
		return
	}
	items := []map[string]any{}
	rows, _ := s.db.Query(r.Context(), `SELECT product_name,coalesce(variant_name,''),extras,unit_price,quantity,line_total FROM order_items WHERE order_id=$1 ORDER BY id`, id)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var name, variant string
			var extrasRaw []byte
			var unit, qty, line float64
			_ = rows.Scan(&name, &variant, &extrasRaw, &unit, &qty, &line)
			var extras any = []any{}
			_ = json.Unmarshal(extrasRaw, &extras)
			items = append(items, map[string]any{"product_name": name, "variant_name": variant, "extras": extras, "unit_price": unit, "quantity": qty, "line_total": line})
		}
	}
	jsonOut(w, 200, map[string]any{
		"id": id, "number": number, "store_name": storeName, "store_whatsapp": storeWhatsapp, "customer_name": customerName,
		"delivery_type": deliveryType, "subtotal": subtotal, "discount": discount, "shipping": shipping, "total": total,
		"payment_method": paymentMethod, "payment_status": paymentStatus, "cash_change_requested": cashChangeRequested, "cash_tendered": cashTendered, "payment_proof_url": paymentProof, "status": status, "created_at": created, "updated_at": updated,
		"items": items,
	})
}

type checkoutItem struct {
	ProductID   string           `json:"product_id"`
	Quantity    float64          `json:"quantity"`
	VariantName string           `json:"variant_name"`
	Extras      []map[string]any `json:"extras"`
}

func normalizeCheckoutFieldKey(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = regexp.MustCompile(`[^a-z0-9_]+`).ReplaceAllString(value, "_")
	return strings.Trim(value, "_")
}

func templateBool(config map[string]any, key string) bool {
	value, ok := config[key]
	if !ok || value == nil {
		return false
	}
	if b, ok := value.(bool); ok {
		return b
	}
	return strings.EqualFold(strings.TrimSpace(fmt.Sprint(value)), "true")
}

type businessCapabilityFlags struct {
	SupportsVariants bool
	SupportsExtras   bool
	SupportsDineIn   bool
	SupportsDelivery bool
	SupportsPickup   bool
	RequiresPayment  bool
}

func templateBoolDefault(config map[string]any, key string, fallback bool) bool {
	value, ok := config[key]
	if !ok || value == nil {
		return fallback
	}
	if b, ok := value.(bool); ok {
		return b
	}
	text := strings.TrimSpace(fmt.Sprint(value))
	if strings.EqualFold(text, "true") {
		return true
	}
	if strings.EqualFold(text, "false") {
		return false
	}
	return fallback
}

func businessCapabilityFlagsFromRaw(engine string, raw []byte) businessCapabilityFlags {
	config := map[string]any{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &config)
	}
	engine = strings.ToLower(strings.TrimSpace(engine))
	isService := engine == "services"
	requiresLeadTime := templateBoolDefault(config, "requires_lead_time", false)
	return businessCapabilityFlags{
		SupportsVariants: templateBoolDefault(config, "supports_variants", !isService),
		SupportsExtras:   templateBoolDefault(config, "supports_extras", engine == "food"),
		SupportsDineIn:   templateBoolDefault(config, "supports_dine_in", engine == "food" && !requiresLeadTime),
		SupportsDelivery: templateBoolDefault(config, "delivery_enabled", !isService),
		SupportsPickup:   templateBoolDefault(config, "pickup_enabled", true),
		RequiresPayment:  !templateBoolDefault(config, "quotation", engine == "quotation"),
	}
}

func (s *Server) businessCapabilityFlagsForStore(ctx context.Context, storeID string) (businessCapabilityFlags, bool) {
	var engine string
	var raw []byte
	if s.db.QueryRow(ctx, `SELECT business_engine,template_config FROM stores WHERE id=$1`, storeID).Scan(&engine, &raw) != nil {
		return businessCapabilityFlags{}, false
	}
	return businessCapabilityFlagsFromRaw(engine, raw), true
}

func contextualCheckoutData(templateConfigRaw []byte, submitted map[string]any, deliveryType string) (map[string]any, string, error) {
	config := map[string]any{}
	if len(templateConfigRaw) > 0 {
		_ = json.Unmarshal(templateConfigRaw, &config)
	}
	flowType := "order"
	if templateBool(config, "appointments") || deliveryType == "dine_in" {
		flowType = "reservation"
	}
	if templateBool(config, "quotation") {
		flowType = "quote"
	}
	clean := map[string]any{}
	rawFields, _ := config["checkout_fields"].([]any)
	for _, raw := range rawFields {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		label := strings.TrimSpace(fmt.Sprint(item["label"]))
		key := normalizeCheckoutFieldKey(fmt.Sprint(item["key"]))
		if key == "" {
			key = normalizeCheckoutFieldKey(label)
		}
		if key == "" || label == "" {
			continue
		}
		fieldType := strings.ToLower(strings.TrimSpace(fmt.Sprint(item["type"])))
		switch fieldType {
		case "text", "number", "date", "time", "textarea", "select":
		default:
			fieldType = "text"
		}
		required, _ := item["required"].(bool)
		value, exists := submitted[key]
		if !exists || strings.TrimSpace(fmt.Sprint(value)) == "" {
			if required {
				return nil, flowType, fmt.Errorf("completa %s", label)
			}
			continue
		}
		switch fieldType {
		case "number":
			n, err := strconv.ParseFloat(strings.TrimSpace(fmt.Sprint(value)), 64)
			if err != nil {
				return nil, flowType, fmt.Errorf("%s debe ser un número válido", label)
			}
			clean[key] = n
		case "select":
			choice := strings.TrimSpace(fmt.Sprint(value))
			valid := false
			if options, ok := item["options"].([]any); ok {
				for _, option := range options {
					if choice == strings.TrimSpace(fmt.Sprint(option)) {
						valid = true
						break
					}
				}
			}
			if !valid {
				return nil, flowType, fmt.Errorf("selecciona una opción válida para %s", label)
			}
			clean[key] = choice
		default:
			text := strings.TrimSpace(fmt.Sprint(value))
			if len(text) > 500 {
				text = text[:500]
			}
			clean[key] = text
		}
	}
	return clean, flowType, nil
}

func allowedPaymentProof(h *multipart.FileHeader) bool {
	t := strings.ToLower(h.Header.Get("Content-Type"))
	return (strings.HasPrefix(t, "image/") || t == "application/pdf") && h.Size <= 8<<20
}

func (s *Server) publicOrderProof(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(chi.URLParam(r, "token"))
	if token == "" {
		jsonErr(w, 404, "Pedido no encontrado")
		return
	}
	var orderID, method, status string
	if s.db.QueryRow(r.Context(), `SELECT id::text,payment_method,payment_status FROM orders WHERE public_token::text=$1`, token).Scan(&orderID, &method, &status) != nil {
		jsonErr(w, 404, "Pedido no encontrado")
		return
	}
	if method != "bank_transfer" {
		jsonErr(w, 400, "Este pedido no utiliza transferencia bancaria")
		return
	}
	if status == "paid" || status == "refunded" {
		jsonErr(w, 409, "El estado de pago ya no permite cambiar el comprobante")
		return
	}
	if err := r.ParseMultipartForm(9 << 20); err != nil {
		jsonErr(w, 400, "El comprobante es demasiado grande")
		return
	}
	f, h, err := r.FormFile("file")
	if err != nil || h == nil || !allowedPaymentProof(h) {
		jsonErr(w, 400, "Envía una imagen o PDF de hasta 8 MB")
		return
	}
	defer f.Close()
	ext := strings.ToLower(filepath.Ext(h.Filename))
	if ext == "" {
		if strings.EqualFold(h.Header.Get("Content-Type"), "application/pdf") {
			ext = ".pdf"
		} else {
			ext = ".webp"
		}
	}
	name := randomName(ext)
	dst, err := os.Create(filepath.Join(s.cfg.UploadDir, name))
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar el comprobante")
		return
	}
	if _, err = io.Copy(dst, io.LimitReader(f, 8<<20)); err != nil {
		dst.Close()
		_ = os.Remove(filepath.Join(s.cfg.UploadDir, name))
		jsonErr(w, 500, "No se pudo guardar el comprobante")
		return
	}
	_ = dst.Close()
	url := "/media/" + name
	if _, err = s.db.Exec(r.Context(), `UPDATE orders SET payment_proof_url=$1,updated_at=now() WHERE id=$2`, url, orderID); err != nil {
		_ = os.Remove(filepath.Join(s.cfg.UploadDir, name))
		jsonErr(w, 500, "No se pudo asociar el comprobante")
		return
	}
	jsonOut(w, 201, map[string]any{"ok": true, "url": url})
}

func contextualCheckoutLines(templateConfigRaw []byte, values map[string]any) []string {
	if len(values) == 0 {
		return nil
	}
	config := map[string]any{}
	_ = json.Unmarshal(templateConfigRaw, &config)
	labels := map[string]string{}
	if fields, ok := config["checkout_fields"].([]any); ok {
		for _, raw := range fields {
			item, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			label := strings.TrimSpace(fmt.Sprint(item["label"]))
			key := normalizeCheckoutFieldKey(fmt.Sprint(item["key"]))
			if key == "" {
				key = normalizeCheckoutFieldKey(label)
			}
			if key != "" && label != "" {
				labels[key] = label
			}
		}
	}
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	lines := make([]string, 0, len(keys))
	for _, key := range keys {
		label := labels[key]
		if label == "" {
			label = strings.ReplaceAll(strings.Title(strings.ReplaceAll(key, "_", " ")), "  ", " ")
		}
		lines = append(lines, fmt.Sprintf("%s: %v", label, values[key]))
	}
	return lines
}

func (s *Server) createConversationOrder(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	conversationID := chi.URLParam(r, "id")
	storeID, remoteJID, ok := s.conversationOwned(r.Context(), c, conversationID)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	var in struct {
		CustomerName    string         `json:"customer_name"`
		DeliveryAddress string         `json:"delivery_address"`
		DeliveryType    string         `json:"delivery_type"`
		ShippingZoneID  string         `json:"shipping_zone_id"`
		PaymentMethod   string         `json:"payment_method"`
		Notes           string         `json:"notes"`
		CustomFields    map[string]any `json:"custom_fields"`
		Items           []checkoutItem `json:"items"`
	}
	if decode(r, &in) != nil || len(in.Items) == 0 {
		jsonErr(w, 400, "Agrega al menos un producto")
		return
	}
	phone := conversationPhone(remoteJID)
	var displayName, customerID, whatsappPhone string
	_ = s.db.QueryRow(r.Context(), `SELECT coalesce(nullif(contact_name,''),nullif(whatsapp_name,''),display_name,''),coalesce(customer_id::text,''),coalesce(whatsapp_phone,'') FROM conversations WHERE id=$1`, conversationID).Scan(&displayName, &customerID, &whatsappPhone)
	if strings.TrimSpace(whatsappPhone) != "" {
		phone = strings.TrimSpace(whatsappPhone)
	}
	if strings.TrimSpace(in.CustomerName) == "" {
		in.CustomerName = strings.TrimSpace(displayName)
	}
	if in.CustomerName == "" {
		in.CustomerName = phone
	}
	if phone == "" {
		jsonErr(w, 400, "No se pudo determinar el WhatsApp del cliente")
		return
	}

	var pickupEnabled, deliveryEnabled, cashEnabled, codEnabled, transferEnabled, acceptingOrders bool
	var storeName, storeSlug, businessEngine string
	var templateConfigRaw []byte
	if s.db.QueryRow(r.Context(), `SELECT name,slug,pickup_enabled,delivery_enabled,cash_enabled,cash_on_delivery_enabled,bank_transfer_enabled,accepting_orders,business_engine,template_config FROM stores WHERE id=$1 AND is_active=true`, storeID).Scan(&storeName, &storeSlug, &pickupEnabled, &deliveryEnabled, &cashEnabled, &codEnabled, &transferEnabled, &acceptingOrders, &businessEngine, &templateConfigRaw) != nil {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	if !acceptingOrders {
		jsonErr(w, 409, "La tienda tiene los pedidos pausados")
		return
	}
	storeCaps := businessCapabilityFlagsFromRaw(businessEngine, templateConfigRaw)
	deliveryEnabled = deliveryEnabled && storeCaps.SupportsDelivery
	pickupEnabled = pickupEnabled && storeCaps.SupportsPickup
	if in.DeliveryType == "" {
		if deliveryEnabled {
			in.DeliveryType = "delivery"
		} else {
			in.DeliveryType = "pickup"
		}
	}
	if in.DeliveryType == "delivery" && !deliveryEnabled {
		jsonErr(w, 400, "Delivery no disponible")
		return
	}
	if in.DeliveryType == "pickup" && !pickupEnabled {
		jsonErr(w, 400, "Recogida no disponible")
		return
	}
	customFields, flowType, customFieldErr := contextualCheckoutData(templateConfigRaw, in.CustomFields, in.DeliveryType)
	if customFieldErr != nil {
		jsonErr(w, 400, customFieldErr.Error())
		return
	}
	customFieldsJSON, _ := json.Marshal(customFields)

	if flowType == "quote" || !storeCaps.RequiresPayment {
		in.PaymentMethod = "pending_quote"
	} else {
		allowedPayments := map[string]bool{"cash": cashEnabled, "cash_on_delivery": codEnabled, "bank_transfer": transferEnabled}
		if !allowedPayments[in.PaymentMethod] {
			for _, method := range []string{"cash", "cash_on_delivery", "bank_transfer"} {
				if allowedPayments[method] {
					in.PaymentMethod = method
					break
				}
			}
		}
		if in.PaymentMethod == "" || !allowedPayments[in.PaymentMethod] {
			jsonErr(w, 400, "No hay un método de pago disponible")
			return
		}
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo iniciar el pedido")
		return
	}
	defer tx.Rollback(r.Context())

	if customerID == "" {
		err = tx.QueryRow(r.Context(), `INSERT INTO customers(store_id,name,phone,address,status) VALUES($1,$2,$3,$4,'active') ON CONFLICT(store_id,phone) DO UPDATE SET name=excluded.name,address=coalesce(nullif(excluded.address,''),customers.address),updated_at=now() RETURNING id`, storeID, strings.TrimSpace(in.CustomerName), phone, strings.TrimSpace(in.DeliveryAddress)).Scan(&customerID)
		if err != nil {
			jsonErr(w, 500, "No se pudo preparar el cliente")
			return
		}
		_, _ = tx.Exec(r.Context(), `UPDATE conversations SET customer_id=$1,display_name=$2,updated_at=now() WHERE id=$3`, customerID, strings.TrimSpace(in.CustomerName), conversationID)
	} else {
		_, _ = tx.Exec(r.Context(), `UPDATE customers SET name=$1,address=coalesce(nullif($2,''),address),updated_at=now() WHERE id=$3`, strings.TrimSpace(in.CustomerName), strings.TrimSpace(in.DeliveryAddress), customerID)
	}

	type priceOption struct {
		Name  string  `json:"name"`
		Price float64 `json:"price"`
	}
	type resolvedItem struct {
		pid, name, variant string
		extras             []map[string]any
		unit, qty, line    float64
		trackStock         bool
	}
	resolvedItems := []resolvedItem{}
	subtotal := 0.0
	for _, item := range in.Items {
		if item.Quantity <= 0 || item.Quantity > 999 {
			continue
		}
		var name string
		var base, stock float64
		var active, trackStock bool
		var variantsRaw, extrasRaw []byte
		if tx.QueryRow(r.Context(), `SELECT name,price,coalesce(stock,0),track_stock,is_active,variants,extras FROM products WHERE id=$1 AND store_id=$2 FOR UPDATE`, item.ProductID, storeID).Scan(&name, &base, &stock, &trackStock, &active, &variantsRaw, &extrasRaw) != nil || !active {
			jsonErr(w, 400, "Uno de los productos ya no está disponible")
			return
		}
		if trackStock && stock < item.Quantity {
			jsonErr(w, 400, "No hay existencia suficiente de "+name)
			return
		}
		var variants, allowedExtras []priceOption
		_ = json.Unmarshal(variantsRaw, &variants)
		_ = json.Unmarshal(extrasRaw, &allowedExtras)
		unit := base
		variantName := ""
		if storeCaps.SupportsVariants && strings.TrimSpace(item.VariantName) != "" {
			found := false
			for _, variant := range variants {
				if variant.Name == item.VariantName {
					found = true
					variantName = variant.Name
					if variant.Price > 0 {
						unit = variant.Price
					}
					break
				}
			}
			if !found {
				jsonErr(w, 400, "Variante inválida para "+name)
				return
			}
		}
		normalizedExtras := []map[string]any{}
		if !storeCaps.SupportsExtras {
			item.Extras = nil
		}
		for _, requested := range item.Extras {
			reqName := strings.TrimSpace(fmt.Sprint(requested["name"]))
			if reqName == "" {
				continue
			}
			found := false
			for _, allowed := range allowedExtras {
				if allowed.Name == reqName {
					found = true
					unit += allowed.Price
					normalizedExtras = append(normalizedExtras, map[string]any{"name": allowed.Name, "price": allowed.Price})
					break
				}
			}
			if !found {
				jsonErr(w, 400, "Adicional inválido para "+name)
				return
			}
		}
		line := unit * item.Quantity
		subtotal += line
		resolvedItems = append(resolvedItems, resolvedItem{item.ProductID, name, variantName, normalizedExtras, unit, item.Quantity, line, trackStock})
	}
	if len(resolvedItems) == 0 {
		jsonErr(w, 400, "El pedido no contiene productos válidos")
		return
	}

	shipping := 0.0
	var zone any = nil
	if in.DeliveryType == "delivery" {
		if strings.TrimSpace(in.DeliveryAddress) == "" {
			jsonErr(w, 400, "Indica la dirección de entrega")
			return
		}
		if in.ShippingZoneID != "" {
			if tx.QueryRow(r.Context(), `SELECT charge FROM shipping_zones WHERE id=$1 AND store_id=$2 AND is_active=true`, in.ShippingZoneID, storeID).Scan(&shipping) != nil {
				jsonErr(w, 400, "Zona de delivery inválida")
				return
			}
			zone = in.ShippingZoneID
		}
	}
	total := subtotal + shipping
	var orderID, publicToken string
	var number int64
	err = tx.QueryRow(r.Context(), `INSERT INTO orders(store_id,customer_id,conversation_id,customer_name,customer_phone,delivery_address,delivery_type,shipping_zone_id,subtotal,discount,shipping,total,payment_method,notes,custom_fields,flow_type,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$12,$13,$14,$15,'whatsapp') RETURNING id,order_number,public_token::text`, storeID, customerID, conversationID, strings.TrimSpace(in.CustomerName), phone, strings.TrimSpace(in.DeliveryAddress), in.DeliveryType, zone, subtotal, shipping, total, in.PaymentMethod, strings.TrimSpace(in.Notes), customFieldsJSON, flowType).Scan(&orderID, &number, &publicToken)
	if err != nil {
		jsonErr(w, 500, "No se pudo crear el pedido")
		return
	}
	for _, item := range resolvedItems {
		extrasJSON, _ := json.Marshal(item.extras)
		if _, err = tx.Exec(r.Context(), `INSERT INTO order_items(order_id,product_id,product_name,variant_name,extras,unit_price,quantity,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, orderID, item.pid, item.name, item.variant, extrasJSON, item.unit, item.qty, item.line); err != nil {
			jsonErr(w, 500, "No se pudieron guardar los productos")
			return
		}
		if item.trackStock {
			_, _ = tx.Exec(r.Context(), `UPDATE products SET stock=greatest(coalesce(stock,0)-$1,0),updated_at=now() WHERE id=$2`, item.qty, item.pid)
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar el pedido")
		return
	}
	s.refreshCustomerStats(r.Context(), customerID)
	s.publishStoreEvent(r.Context(), storeID, "order", map[string]any{"id": orderID, "number": number, "source": "whatsapp"})
	lines := make([]string, 0, len(resolvedItems))
	for _, item := range resolvedItems {
		lines = append(lines, fmt.Sprintf("• %sx %s — RD$ %.2f", formatOrderQuantity(item.qty), item.name, item.line))
	}
	flowNoun := "pedido"
	if flowType == "reservation" {
		flowNoun = "reserva"
	} else if flowType == "quote" {
		flowNoun = "solicitud"
	}
	contextLines := contextualCheckoutLines(templateConfigRaw, customFields)
	detailLines := append([]string{}, lines...)
	if len(contextLines) > 0 {
		detailLines = append(detailLines, "", strings.Join(contextLines, "\n"))
	}
	trackingURL := s.storePublicURL(r.Context(), storeID, storeSlug) + "/order/" + publicToken
	message := s.renderPlatformNotification(r.Context(), "order_new", "Hola {cliente}, recibimos tu {tipo} #{pedido} en {negocio}.\n{detalle}\n\nTotal: {total}\nSeguimiento: {seguimiento}", map[string]string{
		"cliente":     strings.TrimSpace(in.CustomerName),
		"negocio":     strings.TrimSpace(storeName),
		"tipo":        flowNoun,
		"pedido":      fmt.Sprint(number),
		"total":       fmt.Sprintf("RD$ %.2f", total),
		"detalle":     strings.Join(detailLines, "\n"),
		"seguimiento": trackingURL,
	})
	_ = s.queueWhatsApp(context.Background(), storeID, conversationID, remoteJID, message, "order")
	jsonOut(w, 201, map[string]any{"id": orderID, "number": number, "public_token": publicToken, "tracking_url": trackingURL, "subtotal": subtotal, "shipping": shipping, "total": total, "status": "pending", "payment_status": "pending", "flow_type": flowType, "source": "whatsapp"})
}

func (s *Server) checkout(w http.ResponseWriter, r *http.Request) {
	tenantStore, err := s.resolveStoreHost(r.Context(), s.requestHostname(r))
	if err != nil {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	customerClaims, err := s.claimsFromCookie(r, "wamercio_customer_token")
	if err != nil || customerClaims.Role != "customer" {
		jsonErr(w, http.StatusUnauthorized, "Inicia sesión como cliente para confirmar el pedido")
		return
	}
	var in struct {
		AddressID      string         `json:"address_id"`
		DeliveryType   string         `json:"delivery_type"`
		ShippingZoneID string         `json:"shipping_zone_id"`
		CouponCode     string         `json:"coupon_code"`
		PaymentMethod  string         `json:"payment_method"`
		NeedsChange    *bool          `json:"needs_change"`
		CashTendered   *float64       `json:"cash_tendered"`
		TableID        string         `json:"table_id"`
		ReservationAt  string         `json:"reservation_at"`
		PartySize      int            `json:"party_size"`
		Notes          string         `json:"notes"`
		CustomFields   map[string]any `json:"custom_fields"`
		Items          []checkoutItem `json:"items"`
	}
	if decode(r, &in) != nil || len(in.Items) == 0 {
		jsonErr(w, 400, "Agrega productos antes de confirmar el pedido")
		return
	}
	var sid, ownerID, timezone, storeName, storeAddress, businessEngine string
	var serviceScope, scopeProvinceCode, scopeProvince, scopeCityID, scopeMunicipality string
	var minimum float64
	var reservationDuration int
	var pickupEnabled, deliveryEnabled, dineInEnabled, cashEnabled, codEnabled, transferEnabled, acceptingOrders bool
	var hoursRaw, templateConfigRaw []byte
	if s.db.QueryRow(r.Context(), `SELECT id,user_id,name,coalesce(address,''),minimum_order,pickup_enabled,delivery_enabled,dine_in_enabled,reservation_duration_minutes,cash_enabled,cash_on_delivery_enabled,bank_transfer_enabled,accepting_orders,business_hours,timezone,business_engine,template_config,coalesce(service_scope,'national'),coalesce(province_code,''),coalesce(province,''),coalesce(city_id,''),coalesce(municipality,'') FROM stores WHERE id=$1 AND is_active=true`, tenantStore.StoreID).Scan(&sid, &ownerID, &storeName, &storeAddress, &minimum, &pickupEnabled, &deliveryEnabled, &dineInEnabled, &reservationDuration, &cashEnabled, &codEnabled, &transferEnabled, &acceptingOrders, &hoursRaw, &timezone, &businessEngine, &templateConfigRaw, &serviceScope, &scopeProvinceCode, &scopeProvince, &scopeCityID, &scopeMunicipality) != nil {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	if !acceptingOrders {
		jsonErr(w, 409, "La tienda pausó temporalmente la recepción de pedidos")
		return
	}
	if !businessOpenNow(hoursRaw, timezone) {
		jsonErr(w, 409, "La tienda está fuera de su horario de pedidos")
		return
	}
	storeCaps := businessCapabilityFlagsFromRaw(businessEngine, templateConfigRaw)
	deliveryEnabled = deliveryEnabled && storeCaps.SupportsDelivery
	pickupEnabled = pickupEnabled && storeCaps.SupportsPickup
	dineInEnabled = dineInEnabled && storeCaps.SupportsDineIn
	_ = ownerID

	var customerFirstName, customerLastName, customerPhone, customerStatus string
	if s.db.QueryRow(r.Context(), `SELECT name,coalesce(last_name,''),phone,status FROM global_customers WHERE id=$1`, customerClaims.UserID).Scan(&customerFirstName, &customerLastName, &customerPhone, &customerStatus) != nil || customerStatus != "active" {
		jsonErr(w, http.StatusUnauthorized, "La sesión del cliente ya no está disponible")
		return
	}
	customerName := strings.TrimSpace(strings.TrimSpace(customerFirstName) + " " + strings.TrimSpace(customerLastName))
	if customerName == "" {
		customerName = strings.TrimSpace(customerFirstName)
	}
	in.CouponCode = strings.ToUpper(strings.TrimSpace(in.CouponCode))
	if in.DeliveryType == "" {
		if in.ShippingZoneID != "" {
			in.DeliveryType = "delivery"
		} else if pickupEnabled {
			in.DeliveryType = "pickup"
		} else if dineInEnabled {
			in.DeliveryType = "dine_in"
		}
	}
	if in.DeliveryType != "delivery" && in.DeliveryType != "pickup" && in.DeliveryType != "dine_in" {
		jsonErr(w, 400, "Tipo de entrega inválido")
		return
	}
	if in.DeliveryType == "delivery" && !deliveryEnabled {
		jsonErr(w, 400, "Esta tienda no tiene delivery habilitado")
		return
	}
	if in.DeliveryType == "pickup" && !pickupEnabled {
		jsonErr(w, 400, "Esta tienda no permite recogida")
		return
	}
	if in.DeliveryType == "dine_in" && !dineInEnabled {
		jsonErr(w, 400, "Esta tienda no tiene mesas y reservas habilitadas")
		return
	}
	deliveryAddress := ""
	selectedAddressID := strings.TrimSpace(in.AddressID)
	if in.DeliveryType == "delivery" {
		var label, provinceCode, province, cityID, municipality, neighborhoodID, neighborhood, street, streetNumber, reference string
		var primary bool
		query := `SELECT id::text,label,coalesce(province_code,''),coalesce(province,''),coalesce(city_id,''),coalesce(municipality,''),coalesce(neighborhood_id,''),coalesce(neighborhood,''),street,coalesce(street_number,''),coalesce(reference,''),is_primary FROM customer_addresses WHERE global_customer_id=$1`
		args := []any{customerClaims.UserID}
		if selectedAddressID != "" {
			query += ` AND id=$2`
			args = append(args, selectedAddressID)
		} else {
			query += ` ORDER BY is_primary DESC,created_at DESC LIMIT 1`
		}
		if s.db.QueryRow(r.Context(), query, args...).Scan(&selectedAddressID, &label, &provinceCode, &province, &cityID, &municipality, &neighborhoodID, &neighborhood, &street, &streetNumber, &reference, &primary) != nil {
			jsonErr(w, 400, "Selecciona una dirección de entrega válida")
			return
		}
		selectedAddress := customerAddressInput{Label: label, ProvinceCode: provinceCode, Province: province, CityID: cityID, Municipality: municipality, NeighborhoodID: neighborhoodID, Neighborhood: neighborhood, Street: street, StreetNumber: streetNumber, Reference: reference, IsPrimary: primary}
		storeScope := storeServiceTerritory{Scope: serviceScope, ProvinceCode: scopeProvinceCode, Province: scopeProvince, CityID: scopeCityID, Municipality: scopeMunicipality}
		if !addressMatchesStoreServiceScope(storeScope, selectedAddress) {
			jsonErr(w, 400, "La dirección seleccionada está fuera del alcance de este negocio")
			return
		}
		deliveryAddress = customerAddressText(selectedAddress)
	} else if in.DeliveryType == "dine_in" {
		deliveryAddress = strings.TrimSpace(storeAddress)
	}

	customFields, flowType, customFieldErr := contextualCheckoutData(templateConfigRaw, in.CustomFields, in.DeliveryType)
	if customFieldErr != nil {
		jsonErr(w, 400, customFieldErr.Error())
		return
	}
	customFieldsJSON, _ := json.Marshal(customFields)

	if flowType == "quote" || !storeCaps.RequiresPayment {
		in.PaymentMethod = "pending_quote"
	} else {
		allowedPayments := map[string]bool{"cash": cashEnabled, "bank_transfer": transferEnabled, "cash_on_delivery": codEnabled}
		if !allowedPayments[in.PaymentMethod] {
			for _, candidate := range []string{"cash", "cash_on_delivery", "bank_transfer"} {
				if allowedPayments[candidate] {
					in.PaymentMethod = candidate
					break
				}
			}
		}
		if in.PaymentMethod == "" || !allowedPayments[in.PaymentMethod] {
			jsonErr(w, 400, "La tienda no tiene un método de pago disponible")
			return
		}
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo iniciar el pedido")
		return
	}
	defer tx.Rollback(r.Context())

	var customerID, localCustomerStatus string
	err = tx.QueryRow(r.Context(), `SELECT id,status FROM customers WHERE store_id=$1 AND (global_customer_id=$2 OR phone=$3) ORDER BY (global_customer_id=$2) DESC LIMIT 1`, sid, customerClaims.UserID, customerPhone).Scan(&customerID, &localCustomerStatus)
	if err == nil && localCustomerStatus == "blocked" {
		jsonErr(w, 403, "Este cliente no puede realizar pedidos en esta tienda")
		return
	}
	if err != nil {
		err = tx.QueryRow(r.Context(), `INSERT INTO customers(store_id,global_customer_id,name,phone,address,status) VALUES($1,$2,$3,$4,nullif($5,''),'active') RETURNING id,status`, sid, customerClaims.UserID, customerName, customerPhone, deliveryAddress).Scan(&customerID, &localCustomerStatus)
		if err != nil {
			jsonErr(w, 500, "No se pudo vincular el cliente con este negocio")
			return
		}
	} else {
		_, _ = tx.Exec(r.Context(), `UPDATE customers SET global_customer_id=$1,name=$2,phone=$3,address=coalesce(nullif($4,''),address),updated_at=now() WHERE id=$5`, customerClaims.UserID, customerName, customerPhone, deliveryAddress, customerID)
	}

	var reservationAt *time.Time
	var reservedTableID any
	partySize := in.PartySize
	if in.DeliveryType == "dine_in" {
		if strings.TrimSpace(in.TableID) == "" || strings.TrimSpace(in.ReservationAt) == "" {
			jsonErr(w, 400, "Selecciona una mesa, fecha y hora para la reserva")
			return
		}
		parsed, parseErr := time.Parse(time.RFC3339, strings.TrimSpace(in.ReservationAt))
		if parseErr != nil || parsed.Before(time.Now().Add(-5*time.Minute)) {
			jsonErr(w, 400, "Selecciona una fecha y hora de reserva válida")
			return
		}
		if partySize < 1 {
			partySize = 1
		}
		var capacity int
		if tx.QueryRow(r.Context(), `SELECT capacity FROM store_tables WHERE id=$1 AND store_id=$2 AND is_active=true FOR UPDATE`, in.TableID, sid).Scan(&capacity) != nil {
			jsonErr(w, 400, "La mesa seleccionada no está disponible")
			return
		}
		if partySize > capacity {
			jsonErr(w, 400, fmt.Sprintf("La mesa admite hasta %d personas", capacity))
			return
		}
		if reservationDuration < 15 {
			reservationDuration = 90
		}
		var conflicts int
		_ = tx.QueryRow(r.Context(), `SELECT count(*) FROM table_reservations WHERE store_id=$1 AND table_id=$2 AND status NOT IN ('canceled','cancelled','completed') AND reserved_at < $3 + ($4 * interval '1 minute') AND reserved_at + (duration_minutes * interval '1 minute') > $3`, sid, in.TableID, parsed, reservationDuration).Scan(&conflicts)
		if conflicts > 0 {
			jsonErr(w, 409, "Esa mesa ya está reservada para ese horario")
			return
		}
		reservationAt = &parsed
		reservedTableID = in.TableID
	}

	type priceOption struct {
		Name  string  `json:"name"`
		Price float64 `json:"price"`
	}
	type resolved struct {
		pid, name, variant string
		extras             []map[string]any
		unit, qty, line    float64
		trackStock         bool
	}
	resolvedItems := []resolved{}
	subtotal := 0.0
	for _, it := range in.Items {
		if it.Quantity <= 0 || it.Quantity > 999 {
			continue
		}
		var name string
		var base, stock float64
		var active, trackStock bool
		var variantsRaw, extrasRaw []byte
		if tx.QueryRow(r.Context(), `SELECT name,price,coalesce(stock,0),track_stock,is_active,variants,extras FROM products WHERE id=$1 AND store_id=$2 FOR UPDATE`, it.ProductID, sid).Scan(&name, &base, &stock, &trackStock, &active, &variantsRaw, &extrasRaw) != nil || !active {
			jsonErr(w, 400, "Uno de los productos ya no está disponible")
			return
		}
		if trackStock && stock < it.Quantity {
			jsonErr(w, 400, fmt.Sprintf("No hay existencia suficiente de %s", name))
			return
		}
		var variants, allowedExtras []priceOption
		_ = json.Unmarshal(variantsRaw, &variants)
		_ = json.Unmarshal(extrasRaw, &allowedExtras)
		variantName := ""
		unit := base
		if storeCaps.SupportsVariants && strings.TrimSpace(it.VariantName) != "" {
			found := false
			for _, v := range variants {
				if v.Name == it.VariantName {
					found = true
					variantName = v.Name
					if v.Price > 0 {
						unit = v.Price
					}
					break
				}
			}
			if !found {
				jsonErr(w, 400, "Variante inválida para "+name)
				return
			}
		}
		normalizedExtras := []map[string]any{}
		if !storeCaps.SupportsExtras {
			it.Extras = nil
		}
		for _, requested := range it.Extras {
			reqName := strings.TrimSpace(fmt.Sprint(requested["name"]))
			if reqName == "" {
				continue
			}
			found := false
			for _, allowed := range allowedExtras {
				if allowed.Name == reqName {
					found = true
					unit += allowed.Price
					normalizedExtras = append(normalizedExtras, map[string]any{"name": allowed.Name, "price": allowed.Price})
					break
				}
			}
			if !found {
				jsonErr(w, 400, "Adicional inválido para "+name)
				return
			}
		}
		line := unit * it.Quantity
		subtotal += line
		resolvedItems = append(resolvedItems, resolved{it.ProductID, name, variantName, normalizedExtras, unit, it.Quantity, line, trackStock})
	}
	if len(resolvedItems) == 0 {
		jsonErr(w, 400, "El pedido no contiene productos válidos")
		return
	}
	if minimum > 0 && subtotal < minimum {
		jsonErr(w, 400, fmt.Sprintf("El pedido mínimo de esta tienda es RD$ %.2f", minimum))
		return
	}

	discount := 0.0
	if in.CouponCode != "" {
		var typ string
		var val, min float64
		var active bool
		var limit *int
		var used int
		err := tx.QueryRow(r.Context(), `SELECT discount_type,discount_value,min_order,is_active,usage_limit,used_count FROM coupons WHERE store_id=$1 AND code=upper($2) AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>=now())`, sid, in.CouponCode).Scan(&typ, &val, &min, &active, &limit, &used)
		if err == nil && active && subtotal >= min && (limit == nil || used < *limit) {
			if typ == "percentage" {
				discount = subtotal * (val / 100)
			} else {
				discount = val
			}
			if discount > subtotal {
				discount = subtotal
			}
			_, _ = tx.Exec(r.Context(), `UPDATE coupons SET used_count=used_count+1 WHERE store_id=$1 AND code=upper($2)`, sid, in.CouponCode)
		}
	}

	shipping := 0.0
	var zone any = nil
	if in.DeliveryType == "delivery" && strings.TrimSpace(in.ShippingZoneID) != "" {
		if tx.QueryRow(r.Context(), `SELECT charge FROM shipping_zones WHERE id=$1 AND store_id=$2 AND is_active=true`, in.ShippingZoneID, sid).Scan(&shipping) == nil {
			zone = in.ShippingZoneID
		} else {
			jsonErr(w, 400, "Zona de delivery inválida")
			return
		}
	}
	total := subtotal - discount + shipping
	cashChangeRequested := false
	var cashTendered any
	if in.PaymentMethod == "cash" && in.DeliveryType == "delivery" && in.NeedsChange != nil {
		cashChangeRequested = *in.NeedsChange
	}
	if cashChangeRequested {
		if in.CashTendered == nil || *in.CashTendered <= total {
			jsonErr(w, 400, "Indica un monto mayor al total para calcular el cambio")
			return
		}
		cashTendered = *in.CashTendered
	}
	var orderID, publicToken string
	var num int64
	err = tx.QueryRow(r.Context(), `INSERT INTO orders(store_id,customer_id,global_customer_id,customer_name,customer_phone,delivery_address,delivery_type,shipping_zone_id,coupon_code,subtotal,discount,shipping,total,payment_method,cash_change_requested,cash_tendered,notes,custom_fields,flow_type,table_id,reservation_at,party_size,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'web') RETURNING id,order_number,public_token::text`, sid, customerID, customerClaims.UserID, customerName, customerPhone, deliveryAddress, in.DeliveryType, zone, in.CouponCode, subtotal, discount, shipping, total, in.PaymentMethod, cashChangeRequested, cashTendered, in.Notes, customFieldsJSON, flowType, reservedTableID, reservationAt, func() any {
		if in.DeliveryType == "dine_in" {
			return partySize
		}
		return nil
	}()).Scan(&orderID, &num, &publicToken)
	if err != nil {
		jsonErr(w, 500, "No se pudo crear el pedido")
		return
	}
	if in.DeliveryType == "dine_in" && reservationAt != nil {
		if _, err = tx.Exec(r.Context(), `INSERT INTO table_reservations(store_id,table_id,global_customer_id,order_id,reserved_at,duration_minutes,party_size,status) VALUES($1,$2,$3,$4,$5,$6,$7,'reserved')`, sid, in.TableID, customerClaims.UserID, orderID, *reservationAt, reservationDuration, partySize); err != nil {
			jsonErr(w, 409, "No se pudo reservar la mesa seleccionada")
			return
		}
	}
	// Link any pre-existing WhatsApp conversation to the buyer after the first purchase.
	_, _ = tx.Exec(r.Context(), `UPDATE conversations SET customer_id=$1,updated_at=now() WHERE store_id=$2 AND split_part(lower(remote_jid),'@',2) IN ('s.whatsapp.net','lid') AND coalesce(nullif(regexp_replace(coalesce(whatsapp_phone,''),'[^0-9]','','g'),''),CASE WHEN split_part(lower(remote_jid),'@',2)='s.whatsapp.net' THEN regexp_replace(split_part(remote_jid,'@',1),'[^0-9]','','g') ELSE '' END)=$3`, customerID, sid, customerPhone)
	for _, it := range resolvedItems {
		b, _ := json.Marshal(it.extras)
		if _, err = tx.Exec(r.Context(), `INSERT INTO order_items(order_id,product_id,product_name,variant_name,extras,unit_price,quantity,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, orderID, it.pid, it.name, it.variant, b, it.unit, it.qty, it.line); err != nil {
			jsonErr(w, 500, "No se pudieron guardar los productos")
			return
		}
		if it.trackStock {
			_, _ = tx.Exec(r.Context(), `UPDATE products SET stock=greatest(coalesce(stock,0)-$1,0),updated_at=now() WHERE id=$2`, it.qty, it.pid)
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar el pedido")
		return
	}
	s.refreshCustomerStats(r.Context(), customerID)
	s.publishStoreEvent(r.Context(), sid, "order", map[string]any{"id": orderID, "number": num, "source": "web"})
	trackingURL := s.requestOrigin(r) + "/order/" + publicToken
	lines := make([]string, 0, len(resolvedItems))
	for _, item := range resolvedItems {
		lines = append(lines, fmt.Sprintf("• %sx %s — RD$ %.2f", formatOrderQuantity(item.qty), item.name, item.line))
	}
	message := s.renderPlatformNotification(r.Context(), "order_new", "Hola {cliente}, recibimos tu pedido #{pedido} en {negocio}.\n{detalle}\n\nTotal: {total}\nSeguimiento: {seguimiento}", map[string]string{
		"cliente":     customerName,
		"negocio":     storeName,
		"pedido":      fmt.Sprint(num),
		"total":       fmt.Sprintf("RD$ %.2f", total),
		"detalle":     strings.Join(lines, "\n"),
		"seguimiento": trackingURL,
	})
	_ = s.queueWhatsApp(context.Background(), sid, "", customerPhone, message, "order")
	jsonOut(w, 201, map[string]any{"id": orderID, "number": num, "public_token": publicToken, "tracking_url": trackingURL, "subtotal": subtotal, "discount": discount, "shipping": shipping, "total": total, "status": "pending", "payment_method": in.PaymentMethod, "delivery_type": in.DeliveryType, "table_id": reservedTableID, "reservation_at": reservationAt, "party_size": func() any {
		if in.DeliveryType == "dine_in" {
			return partySize
		}
		return nil
	}(), "cash_change_requested": cashChangeRequested, "cash_tendered": cashTendered})
}

func (s *Server) listPlans(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT id,name,slug,coalesce(description,''),price,billing_period,max_stores,max_products,max_orders,whatsapp_enabled,is_featured FROM plans WHERE is_active=true ORDER BY price`)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, n, sl, desc, bill string
		var price float64
		var stores, products, orders int
		var wa, featured bool
		_ = rows.Scan(&id, &n, &sl, &desc, &price, &bill, &stores, &products, &orders, &wa, &featured)
		out = append(out, map[string]any{"id": id, "name": n, "slug": sl, "description": desc, "price": price, "billing_period": bill, "max_stores": stores, "max_products": products, "max_orders": orders, "whatsapp_enabled": wa, "is_featured": featured})
	}
	jsonOut(w, 200, out)
}

func randomName(ext string) string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b) + ext
}
func allowedImage(h *multipart.FileHeader) bool {
	t := strings.ToLower(h.Header.Get("Content-Type"))
	return strings.HasPrefix(t, "image/") && h.Size <= 8<<20
}
func (s *Server) upload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(9 << 20); err != nil {
		jsonErr(w, 400, "Archivo demasiado grande")
		return
	}
	f, h, err := r.FormFile("file")
	if err != nil || !allowedImage(h) {
		jsonErr(w, 400, "Envía una imagen válida de hasta 8 MB")
		return
	}
	defer f.Close()
	ext := strings.ToLower(filepath.Ext(h.Filename))
	if ext == "" {
		ext = ".webp"
	}
	name := randomName(ext)
	dst, err := os.Create(filepath.Join(s.cfg.UploadDir, name))
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar")
		return
	}
	defer dst.Close()
	_, _ = io.Copy(dst, io.LimitReader(f, 8<<20))
	jsonOut(w, 201, map[string]string{"url": "/media/" + name})
}

func (s *Server) bridgeReq(ctx context.Context, method, path string, body any) (map[string]any, error) {
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = strings.NewReader(string(b))
	}
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(s.cfg.WhatsAppBridgeURL, "/")+path, rd)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Secret", s.cfg.InternalWebhookSecret)
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if resp.StatusCode >= 300 {
		return out, fmt.Errorf("bridge status %d", resp.StatusCode)
	}
	return out, nil
}
func (s *Server) whatsappStatus(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	sid := chi.URLParam(r, "storeID")
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, sid) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	out, err := s.bridgeReq(r.Context(), "GET", "/sessions/"+sid+"/status", nil)
	if err != nil {
		jsonOut(w, 200, map[string]any{"status": "unavailable", "message": "Motor WhatsApp no disponible"})
		return
	}
	jsonOut(w, 200, out)
}
func normalizeHistorySyncMode(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	if v == "auto" || v == "automatic" || v == "automatica" || v == "automática" {
		return "auto"
	}
	return "manual"
}

func syncDateString(v *time.Time) string {
	if v == nil {
		return ""
	}
	return v.Format("2006-01-02")
}

func (s *Server) whatsappSyncSettings(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	sid := chi.URLParam(r, "storeID")
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, sid) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	var mode, status, syncErr string
	var from, to *time.Time
	var lastAt *time.Time
	err := s.db.QueryRow(r.Context(), `SELECT history_sync_mode,history_sync_from,history_sync_to,history_sync_last_at,history_sync_status,coalesce(history_sync_error,'') FROM whatsapp_sessions WHERE store_id=$1`, sid).Scan(&mode, &from, &to, &lastAt, &status, &syncErr)
	if err != nil {
		now := time.Now().In(time.FixedZone("America/Santo_Domingo", -4*60*60))
		jsonOut(w, 200, map[string]any{"mode": "manual", "from": now.AddDate(0, 0, -7).Format("2006-01-02"), "to": now.Format("2006-01-02"), "status": "idle", "last_synced_at": nil, "error": ""})
		return
	}
	jsonOut(w, 200, map[string]any{"mode": mode, "from": syncDateString(from), "to": syncDateString(to), "status": status, "last_synced_at": lastAt, "error": syncErr})
}

func (s *Server) updateWhatsappSyncSettings(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	sid := chi.URLParam(r, "storeID")
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, sid) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	var in struct {
		Mode string `json:"mode"`
		From string `json:"from"`
		To   string `json:"to"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Configuración inválida")
		return
	}
	mode := normalizeHistorySyncMode(in.Mode)
	from, errFrom := time.Parse("2006-01-02", strings.TrimSpace(in.From))
	to, errTo := time.Parse("2006-01-02", strings.TrimSpace(in.To))
	if errFrom != nil || errTo != nil || to.Before(from) {
		jsonErr(w, 400, "Selecciona un rango de fechas válido")
		return
	}
	if to.Sub(from) > 366*24*time.Hour {
		jsonErr(w, 400, "El rango máximo de sincronización es de 366 días")
		return
	}
	_, err := s.db.Exec(r.Context(), `INSERT INTO whatsapp_sessions(store_id,status,history_sync_mode,history_sync_from,history_sync_to,history_sync_status,history_sync_error,updated_at) VALUES($1,'disconnected',$2,$3,$4,'idle',NULL,now()) ON CONFLICT(store_id) DO UPDATE SET history_sync_mode=excluded.history_sync_mode,history_sync_from=excluded.history_sync_from,history_sync_to=excluded.history_sync_to,history_sync_error=NULL,updated_at=now()`, sid, mode, from, to)
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar la sincronización")
		return
	}
	jsonOut(w, 200, map[string]any{"ok": true, "mode": mode, "from": in.From, "to": in.To})
}

func (s *Server) whatsappSyncNow(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	sid := chi.URLParam(r, "storeID")
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, sid) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	var in struct {
		From string `json:"from"`
		To   string `json:"to"`
	}
	_ = decode(r, &in)
	if strings.TrimSpace(in.From) == "" || strings.TrimSpace(in.To) == "" {
		var from, to *time.Time
		if s.db.QueryRow(r.Context(), `SELECT history_sync_from,history_sync_to FROM whatsapp_sessions WHERE store_id=$1`, sid).Scan(&from, &to) == nil {
			in.From = syncDateString(from)
			in.To = syncDateString(to)
		}
	}
	from, errFrom := time.Parse("2006-01-02", strings.TrimSpace(in.From))
	to, errTo := time.Parse("2006-01-02", strings.TrimSpace(in.To))
	if errFrom != nil || errTo != nil || to.Before(from) {
		jsonErr(w, 400, "Selecciona un rango de fechas válido")
		return
	}
	_, _ = s.db.Exec(r.Context(), `INSERT INTO whatsapp_sessions(store_id,status,history_sync_mode,history_sync_from,history_sync_to,history_sync_status,history_sync_error,updated_at) VALUES($1,'disconnected','manual',$2,$3,'starting',NULL,now()) ON CONFLICT(store_id) DO UPDATE SET history_sync_from=excluded.history_sync_from,history_sync_to=excluded.history_sync_to,history_sync_status='starting',history_sync_error=NULL,updated_at=now()`, sid, from, to)
	out, err := s.bridgeReq(r.Context(), "POST", "/sessions/"+sid+"/history-sync", map[string]any{"from": in.From, "to": in.To})
	if err != nil {
		_, _ = s.db.Exec(r.Context(), `UPDATE whatsapp_sessions SET history_sync_status='error',history_sync_error=$1,updated_at=now() WHERE store_id=$2`, err.Error(), sid)
		jsonErr(w, 502, "No se pudo iniciar la sincronización manual")
		return
	}
	jsonOut(w, 202, out)
}

func (s *Server) whatsappConnect(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	sid := chi.URLParam(r, "storeID")
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, sid) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	out, err := s.bridgeReq(r.Context(), "POST", "/sessions/"+sid+"/connect", map[string]any{})
	if err != nil {
		jsonErr(w, 502, "No se pudo iniciar WhatsApp")
		return
	}
	jsonOut(w, 200, out)
}
func (s *Server) whatsappDisconnect(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	sid := chi.URLParam(r, "storeID")
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, sid) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	out, err := s.bridgeReq(r.Context(), "POST", "/sessions/"+sid+"/disconnect", map[string]any{})
	if err != nil {
		jsonErr(w, 502, "No se pudo desconectar WhatsApp")
		return
	}
	jsonOut(w, 200, out)
}
func (s *Server) whatsappSend(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	sid := chi.URLParam(r, "storeID")
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, sid) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	var in map[string]any
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	out, err := s.bridgeReq(r.Context(), "POST", "/sessions/"+sid+"/messages", in)
	if err != nil {
		jsonErr(w, 502, "No se pudo enviar el mensaje")
		return
	}
	jsonOut(w, 200, out)
}
func (s *Server) trySendWhatsApp(ctx context.Context, storeID, phone, text string) {
	if phone == "" || text == "" {
		return
	}
	_ = s.queueWhatsApp(ctx, storeID, "", phone, text, "system")
}

func (s *Server) queueWhatsApp(ctx context.Context, storeID, conversationID, destination, text, kind string) error {
	destination = strings.TrimSpace(destination)
	text = strings.TrimSpace(text)
	if storeID == "" || destination == "" || text == "" {
		return nil
	}
	if kind == "" {
		kind = "system"
	}
	var conv any
	if conversationID != "" {
		conv = conversationID
	}
	var id string
	err := s.db.QueryRow(ctx, `INSERT INTO message_outbox(store_id,conversation_id,destination,body,kind,status) VALUES($1,$2,$3,$4,$5,'pending') RETURNING id`, storeID, conv, destination, text, kind).Scan(&id)
	if err != nil {
		return err
	}
	go s.deliverOutbox(id)
	return nil
}

func (s *Server) deliverOutbox(id string) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	var storeID, conversationID, destination, body string
	err := s.db.QueryRow(ctx, `SELECT store_id::text,coalesce(conversation_id::text,''),destination,body FROM message_outbox WHERE id=$1 AND status IN ('pending','retry') AND available_at<=now()`, id).Scan(&storeID, &conversationID, &destination, &body)
	if err != nil {
		return
	}
	out, sendErr := s.bridgeReq(ctx, "POST", "/sessions/"+storeID+"/messages", map[string]any{"to": destination, "text": body})
	if sendErr != nil {
		_, _ = s.db.Exec(ctx, `UPDATE message_outbox SET status='retry',attempts=attempts+1,last_error=$1,available_at=now()+LEAST(interval '30 seconds' * power(2,LEAST(attempts,5)), interval '15 minutes'),updated_at=now() WHERE id=$2`, sendErr.Error(), id)
		return
	}
	_, _ = s.db.Exec(ctx, `UPDATE message_outbox SET status='sent',attempts=attempts+1,last_error=NULL,sent_at=now(),updated_at=now() WHERE id=$1`, id)
	if conversationID != "" {
		msgID := strings.TrimSpace(fmt.Sprint(out["id"]))
		if msgID == "" || msgID == "<nil>" {
			msgID = "outbox-" + id
		}
		now := time.Now()
		_, _ = s.db.Exec(ctx, `INSERT INTO messages(conversation_id,message_id,direction,type,body,status,occurred_at) VALUES($1,$2,'out','text',$3,'sent',$4) ON CONFLICT(conversation_id,message_id) DO NOTHING`, conversationID, msgID, body, now)
		_, _ = s.db.Exec(ctx, `UPDATE conversations SET last_message=$1,last_message_at=$2,updated_at=now() WHERE id=$3`, body, now, conversationID)
	}
}

func (s *Server) outboxLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		rows, err := s.db.Query(ctx, `SELECT id::text FROM message_outbox WHERE status IN ('pending','retry') AND available_at<=now() AND attempts<10 ORDER BY created_at LIMIT 50`)
		ids := []string{}
		if err == nil {
			for rows.Next() {
				var id string
				if rows.Scan(&id) == nil {
					ids = append(ids, id)
				}
			}
			rows.Close()
		}
		cancel()
		for _, id := range ids {
			go s.deliverOutbox(id)
		}
	}
}

func (s *Server) whatsappEvent(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Internal-Secret") != s.cfg.InternalWebhookSecret || s.cfg.InternalWebhookSecret == "" {
		jsonErr(w, 403, "No autorizado")
		return
	}
	var in struct {
		StoreID     string    `json:"store_id"`
		SessionKey  string    `json:"session_key"`
		RemoteJID   string    `json:"remote_jid"`
		MessageID   string    `json:"message_id"`
		Body        string    `json:"body"`
		Direction   string    `json:"direction"`
		Type        string    `json:"type"`
		DisplayName string    `json:"display_name"`
		Phone       string    `json:"phone"`
		MediaURL    string    `json:"media_url"`
		MimeType    string    `json:"mime_type"`
		FileName    string    `json:"file_name"`
		FileSize    int64     `json:"file_size"`
		Caption     string    `json:"caption"`
		OccurredAt  time.Time `json:"occurred_at"`
	}
	if decode(r, &in) != nil || in.RemoteJID == "" {
		jsonErr(w, 400, "Evento inválido")
		return
	}
	if !isDirectWhatsAppJID(in.RemoteJID) {
		jsonOut(w, 200, map[string]any{"ok": true, "ignored": true})
		return
	}
	if in.SessionKey == "" {
		in.SessionKey = in.StoreID
	}
	if in.Direction == "" {
		in.Direction = "in"
	}
	if in.Type == "" {
		in.Type = "text"
	}
	if in.OccurredAt.IsZero() {
		in.OccurredAt = time.Now()
	}
	if in.SessionKey == "support" {
		s.supportWhatsAppEvent(r.Context(), w, in.RemoteJID, in.MessageID, in.Body, in.Direction, in.Type, in.DisplayName, in.Phone, in.MediaURL, in.MimeType, in.FileName, in.FileSize, in.Caption, in.OccurredAt)
		return
	}
	if in.StoreID == "" {
		jsonErr(w, 400, "Tienda inválida")
		return
	}
	if in.Direction != "out" {
		var blocked bool
		_ = s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM conversations WHERE store_id=$1 AND remote_jid=$2 AND coalesce(contact_status,'active')='blocked')`, in.StoreID, in.RemoteJID).Scan(&blocked)
		if blocked {
			jsonOut(w, 200, map[string]any{"ok": true, "ignored": true, "reason": "blocked"})
			return
		}
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "db")
		return
	}
	defer tx.Rollback(r.Context())
	var customerID any
	phone := normalizePhone(in.Phone)
	if phone != "" {
		var cid string
		if tx.QueryRow(r.Context(), `SELECT id FROM customers WHERE store_id=$1 AND phone=$2 AND EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=customers.id AND o.status<>'canceled' AND o.flow_type<>'quote') ORDER BY last_order_at DESC NULLS LAST,created_at DESC LIMIT 1`, in.StoreID, phone).Scan(&cid) == nil {
			customerID = cid
		}
	}
	whatsappName := strings.TrimSpace(in.DisplayName)
	unreadInc := 0
	if in.Direction != "out" {
		unreadInc = 1
	}
	var convID string
	err = tx.QueryRow(r.Context(), `INSERT INTO conversations(store_id,remote_jid,display_name,whatsapp_name,whatsapp_phone,customer_id,unread_count,last_message,last_message_at) VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8) ON CONFLICT(store_id,remote_jid) DO UPDATE SET display_name=CASE WHEN coalesce(conversations.contact_name,'')='' THEN coalesce(nullif(EXCLUDED.display_name,''),conversations.display_name) ELSE conversations.display_name END,whatsapp_name=coalesce(nullif(EXCLUDED.whatsapp_name,''),conversations.whatsapp_name),whatsapp_phone=coalesce(nullif(EXCLUDED.whatsapp_phone,''),conversations.whatsapp_phone),customer_id=coalesce(conversations.customer_id,EXCLUDED.customer_id),unread_count=conversations.unread_count+$6,last_message=EXCLUDED.last_message,last_message_at=EXCLUDED.last_message_at,updated_at=now() RETURNING id`, in.StoreID, in.RemoteJID, whatsappName, phone, customerID, unreadInc, in.Body, in.OccurredAt).Scan(&convID)
	if err != nil {
		jsonErr(w, 500, "No se pudo registrar conversación")
		return
	}
	status := "received"
	if in.Direction == "out" {
		status = "sent"
	}
	_, _ = tx.Exec(r.Context(), `INSERT INTO messages(conversation_id,message_id,direction,type,body,status,media_url,mime_type,file_name,file_size,caption,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(conversation_id,message_id) DO UPDATE SET media_url=coalesce(nullif(EXCLUDED.media_url,''),messages.media_url),mime_type=coalesce(nullif(EXCLUDED.mime_type,''),messages.mime_type),file_name=coalesce(nullif(EXCLUDED.file_name,''),messages.file_name),file_size=GREATEST(messages.file_size,EXCLUDED.file_size),caption=coalesce(nullif(EXCLUDED.caption,''),messages.caption)`, convID, in.MessageID, in.Direction, in.Type, in.Body, status, in.MediaURL, in.MimeType, in.FileName, in.FileSize, in.Caption, in.OccurredAt)
	_ = tx.Commit(r.Context())
	s.publishStoreEvent(r.Context(), in.StoreID, "message", map[string]any{"conversation_id": convID, "direction": in.Direction, "type": in.Type})
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) whatsappProfile(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Internal-Secret") != s.cfg.InternalWebhookSecret || s.cfg.InternalWebhookSecret == "" {
		jsonErr(w, 403, "No autorizado")
		return
	}
	var in struct {
		StoreID           string `json:"store_id"`
		RemoteJID         string `json:"remote_jid"`
		Phone             string `json:"phone"`
		WhatsAppName      string `json:"whatsapp_name"`
		ProfilePictureURL string `json:"profile_picture_url"`
		ProfilePictureID  string `json:"profile_picture_id"`
	}
	if decode(r, &in) != nil || in.StoreID == "" || !isDirectWhatsAppJID(in.RemoteJID) {
		jsonErr(w, 400, "Perfil inválido")
		return
	}
	name := strings.TrimSpace(in.WhatsAppName)
	phone := normalizePhone(in.Phone)
	result, err := s.db.Exec(r.Context(), `UPDATE conversations SET whatsapp_name=coalesce(nullif($1,''),whatsapp_name),whatsapp_phone=coalesce(nullif($2,''),whatsapp_phone),profile_picture_url=coalesce(nullif($3,''),profile_picture_url),profile_picture_id=coalesce(nullif($4,''),profile_picture_id),profile_picture_updated_at=CASE WHEN nullif($3,'') IS NOT NULL OR nullif($4,'') IS NOT NULL THEN now() ELSE profile_picture_updated_at END,display_name=CASE WHEN coalesce(contact_name,'')='' THEN coalesce(nullif($1,''),display_name) ELSE display_name END,updated_at=now() WHERE store_id=$5 AND remote_jid=$6`, name, phone, strings.TrimSpace(in.ProfilePictureURL), strings.TrimSpace(in.ProfilePictureID), in.StoreID, in.RemoteJID)
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar el perfil de WhatsApp")
		return
	}
	rows := result.RowsAffected()
	if rows > 0 {
		s.publishStoreEvent(r.Context(), in.StoreID, "contact_profile", map[string]any{"remote_jid": in.RemoteJID})
	}
	jsonOut(w, 200, map[string]any{"ok": true, "updated": rows > 0})
}

func (s *Server) supportWhatsAppEvent(ctx context.Context, w http.ResponseWriter, remoteJID, messageID, body, direction, typ, displayName, phone, mediaURL, mimeType, fileName string, fileSize int64, caption string, occurredAt time.Time) {
	phone = normalizePhone(phone)
	if phone == "" {
		phone = conversationPhone(remoteJID)
	}
	var ownerID any
	var ownerName string
	if phone != "" {
		var id string
		if s.db.QueryRow(ctx, `SELECT id,name FROM users WHERE role='owner' AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=$1 LIMIT 1`, phone).Scan(&id, &ownerName) == nil {
			ownerID = id
		}
	}
	if strings.TrimSpace(displayName) == "" {
		displayName = ownerName
	}
	if strings.TrimSpace(displayName) == "" && phone != "" {
		displayName = "+" + phone
	}
	unread := 0
	if direction != "out" {
		unread = 1
	}
	var convID string
	err := s.db.QueryRow(ctx, `INSERT INTO support_whatsapp_conversations(owner_id,remote_jid,whatsapp,display_name,unread_count,last_message,last_message_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(remote_jid) DO UPDATE SET owner_id=coalesce(support_whatsapp_conversations.owner_id,EXCLUDED.owner_id),whatsapp=coalesce(nullif(EXCLUDED.whatsapp,''),support_whatsapp_conversations.whatsapp),display_name=coalesce(nullif(EXCLUDED.display_name,''),support_whatsapp_conversations.display_name),unread_count=support_whatsapp_conversations.unread_count+$5,last_message=EXCLUDED.last_message,last_message_at=EXCLUDED.last_message_at,updated_at=now() RETURNING id`, ownerID, remoteJID, phone, displayName, unread, body, occurredAt).Scan(&convID)
	if err != nil {
		jsonErr(w, 500, "No se pudo registrar conversación de soporte")
		return
	}
	status := "received"
	if direction == "out" {
		status = "sent"
	}
	_, _ = s.db.Exec(ctx, `INSERT INTO support_whatsapp_messages(conversation_id,message_id,direction,type,body,media_url,mime_type,file_name,file_size,caption,status,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(conversation_id,message_id) DO UPDATE SET media_url=coalesce(nullif(EXCLUDED.media_url,''),support_whatsapp_messages.media_url),mime_type=coalesce(nullif(EXCLUDED.mime_type,''),support_whatsapp_messages.mime_type),file_name=coalesce(nullif(EXCLUDED.file_name,''),support_whatsapp_messages.file_name),file_size=GREATEST(support_whatsapp_messages.file_size,EXCLUDED.file_size),caption=coalesce(nullif(EXCLUDED.caption,''),support_whatsapp_messages.caption)`, convID, messageID, direction, typ, body, mediaURL, mimeType, fileName, fileSize, caption, status, occurredAt)
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) whatsappReceipt(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Internal-Secret") != s.cfg.InternalWebhookSecret || s.cfg.InternalWebhookSecret == "" {
		jsonErr(w, 403, "No autorizado")
		return
	}
	var in struct {
		SessionKey string   `json:"session_key"`
		MessageIDs []string `json:"message_ids"`
		Type       string   `json:"type"`
	}
	if decode(r, &in) != nil || len(in.MessageIDs) == 0 {
		jsonErr(w, 400, "Recibo inválido")
		return
	}
	status := "delivered"
	if in.Type == "read" || in.Type == "read-self" || in.Type == "played" {
		status = "read"
	}
	if in.Type == "retry" {
		status = "retry"
	}
	for _, id := range in.MessageIDs {
		if in.SessionKey == "support" {
			_, _ = s.db.Exec(r.Context(), `UPDATE support_whatsapp_messages SET status=$1 WHERE message_id=$2`, status, id)
		} else {
			_, _ = s.db.Exec(r.Context(), `UPDATE messages SET status=$1 WHERE message_id=$2 AND conversation_id IN (SELECT id FROM conversations WHERE store_id=$3)`, status, id, in.SessionKey)
		}
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

// --- WAMERCIO 1.1 account, store settings, CRM and SuperAdmin -----------------

func (s *Server) updateMe(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var in struct {
		Name           string `json:"name"`
		LastName       string `json:"last_name"`
		Phone          string `json:"phone"`
		DocumentNumber string `json:"document_number"`
		BirthDate      string `json:"birth_date"`
		Gender         string `json:"gender"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	phone := normalizePhone(in.Phone)
	if phone == "" {
		jsonErr(w, 400, "El WhatsApp es obligatorio")
		return
	}
	var duplicate int
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM users WHERE role='owner' AND id<>$1 AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=$2`, c.UserID, phone).Scan(&duplicate)
	if duplicate > 0 {
		jsonErr(w, 409, "Ese WhatsApp ya está asociado a otra cuenta")
		return
	}

	var currentName, currentLastName, currentDocument, currentBirthDate, currentGender string
	var identityVerified bool
	if err := s.db.QueryRow(r.Context(), `SELECT name,coalesce(last_name,''),coalesce(document_number,''),coalesce(to_char(birth_date,'YYYY-MM-DD'),''),coalesce(gender,''),identity_verified_at IS NOT NULL FROM users WHERE id=$1 AND role='owner'`, c.UserID).Scan(&currentName, &currentLastName, &currentDocument, &currentBirthDate, &currentGender, &identityVerified); err != nil {
		jsonErr(w, 404, "Cuenta no encontrada")
		return
	}
	name := strings.TrimSpace(in.Name)
	lastName := strings.TrimSpace(in.LastName)
	document := digitsOnly(in.DocumentNumber)
	birthDate := strings.TrimSpace(in.BirthDate)
	gender := normalizeOwnerGender(in.Gender)
	var verifiedAt any
	if identityVerified {
		name, lastName, document, birthDate, gender = currentName, currentLastName, currentDocument, currentBirthDate, currentGender
		verifiedAt = time.Now()
	} else if document != "" {
		if len(document) != 11 {
			jsonErr(w, 400, "La Cédula debe tener exactamente 11 dígitos")
			return
		}
		identity := s.platformSetting(r.Context(), "identity")
		if enabled, _ := identity["enabled"].(bool); enabled {
			envelope, _, err := s.verifyIdentityDocument(r.Context(), "persona", document)
			if err != nil {
				jsonErr(w, 422, "No pudimos verificar la Cédula: "+err.Error())
				return
			}
			profile := identityProfile("persona", envelope)
			if v := strings.TrimSpace(str(profile["name"])); v != "" {
				name = v
			}
			if v := strings.TrimSpace(str(profile["last_name"])); v != "" {
				lastName = v
			}
			if v := strings.TrimSpace(str(profile["birth_date"])); v != "" {
				birthDate = v
			}
			if v := normalizeOwnerGender(str(profile["gender"])); v != "" {
				gender = v
			}
			verifiedAt = time.Now()
		}
	}
	if strings.TrimSpace(name) == "" {
		jsonErr(w, 400, "El nombre es obligatorio")
		return
	}
	if birthDate != "" {
		if _, err := time.Parse("2006-01-02", birthDate); err != nil {
			jsonErr(w, 400, "La fecha de nacimiento no es válida")
			return
		}
	}
	_, err := s.db.Exec(r.Context(), `UPDATE users SET name=$1,last_name=$2,phone=$3,document_type=CASE WHEN nullif($4,'') IS NULL THEN document_type ELSE 'persona' END,document_number=CASE WHEN $4='' THEN document_number ELSE $4 END,birth_date=CASE WHEN $5='' THEN birth_date ELSE $5::date END,gender=CASE WHEN $6='' THEN gender ELSE $6 END,identity_verified_at=coalesce($7,identity_verified_at),whatsapp_verified_at=CASE WHEN regexp_replace(coalesce(phone,''),'[^0-9]','','g')<>$3 THEN NULL ELSE whatsapp_verified_at END,profile_picture_updated_at=CASE WHEN regexp_replace(coalesce(phone,''),'[^0-9]','','g')<>$3 THEN NULL ELSE profile_picture_updated_at END,updated_at=now() WHERE id=$8`, name, lastName, phone, document, birthDate, gender, verifiedAt, c.UserID)
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar el perfil")
		return
	}
	_ = s.refreshUserWhatsAppProfile(r.Context(), c.UserID, phone, "")
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var in struct {
		Current string `json:"current_password"`
		New     string `json:"new_password"`
	}
	if decode(r, &in) != nil || len(in.New) < 8 {
		jsonErr(w, 400, "La nueva contraseña debe tener al menos 8 caracteres")
		return
	}
	var hash string
	if err := s.db.QueryRow(r.Context(), `SELECT password_hash FROM users WHERE id=$1`, c.UserID).Scan(&hash); err != nil {
		jsonErr(w, 404, "Usuario no encontrado")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Current)) != nil {
		jsonErr(w, 400, "La contraseña actual no es correcta")
		return
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(in.New), bcrypt.DefaultCost)
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar la contraseña")
		return
	}
	_, err = s.db.Exec(r.Context(), `UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2`, string(newHash), c.UserID)
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar la contraseña")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) changePIN(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var in struct {
		Current string `json:"current_pin"`
		New     string `json:"new_pin"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	pinOK, pinLength := s.validPINFor(r.Context(), "owner", in.New)
	if !pinOK {
		jsonErr(w, 400, fmt.Sprintf("El nuevo PIN debe tener exactamente %d dígitos", pinLength))
		return
	}
	var currentHash string
	if err := s.db.QueryRow(r.Context(), `SELECT coalesce(pin_hash,'') FROM users WHERE id=$1 AND role='owner'`, c.UserID).Scan(&currentHash); err != nil {
		jsonErr(w, 404, "Cuenta no encontrada")
		return
	}
	if currentHash != "" && bcrypt.CompareHashAndPassword([]byte(currentHash), []byte(in.Current)) != nil {
		jsonErr(w, 400, "El PIN actual no es correcto")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.New), bcrypt.DefaultCost)
	if err != nil {
		jsonErr(w, 500, "No se pudo proteger el PIN")
		return
	}
	_, err = s.db.Exec(r.Context(), `UPDATE users SET pin_hash=$1,pin_changed_at=now(),updated_at=now() WHERE id=$2`, string(hash), c.UserID)
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar el PIN")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) getStoreSettings(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, id) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	var name, slug, desc, logo, banner, wa, address, currency, color, businessEngine, visualTheme string
	var bankName, accountName, accountNumber, accountType, orderNotice, checkoutMessage string
	var serviceScope, provinceCode, province, cityID, municipality, neighborhoodID, neighborhood, street, streetNumber string
	var minimum float64
	var pickup, delivery, dineIn, cash, cod, transfer, active, acceptingOrders bool
	var reservationDuration int
	var hoursRaw, templateConfigRaw, themeConfigRaw []byte
	err := s.db.QueryRow(r.Context(), `SELECT name,slug,coalesce(description,''),coalesce(logo_url,''),coalesce(banner_url,''),coalesce(whatsapp,''),coalesce(address,''),currency,primary_color,minimum_order,pickup_enabled,delivery_enabled,dine_in_enabled,reservation_duration_minutes,cash_enabled,cash_on_delivery_enabled,bank_transfer_enabled,coalesce(bank_name,''),coalesce(bank_account_name,''),coalesce(bank_account_number,''),coalesce(bank_account_type,''),business_hours,coalesce(order_notice,''),coalesce(checkout_message,''),is_active,accepting_orders,business_engine,template_config,visual_theme,theme_config,coalesce(service_scope,'national'),coalesce(province_code,''),coalesce(province,''),coalesce(city_id,''),coalesce(municipality,''),coalesce(neighborhood_id,''),coalesce(neighborhood,''),coalesce(street,''),coalesce(street_number,'') FROM stores WHERE id=$1`, id).Scan(&name, &slug, &desc, &logo, &banner, &wa, &address, &currency, &color, &minimum, &pickup, &delivery, &dineIn, &reservationDuration, &cash, &cod, &transfer, &bankName, &accountName, &accountNumber, &accountType, &hoursRaw, &orderNotice, &checkoutMessage, &active, &acceptingOrders, &businessEngine, &templateConfigRaw, &visualTheme, &themeConfigRaw, &serviceScope, &provinceCode, &province, &cityID, &municipality, &neighborhoodID, &neighborhood, &street, &streetNumber)
	if err != nil {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	var hours any = map[string]any{}
	var templateConfig any = map[string]any{}
	var themeConfig any = map[string]any{}
	_ = json.Unmarshal(hoursRaw, &hours)
	_ = json.Unmarshal(templateConfigRaw, &templateConfig)
	_ = json.Unmarshal(themeConfigRaw, &themeConfig)
	jsonOut(w, 200, map[string]any{
		"id": id, "name": name, "slug": slug, "description": desc, "logo_url": logo, "banner_url": banner,
		"whatsapp": wa, "address": address, "currency": currency, "primary_color": color, "minimum_order": minimum, "business_engine": businessEngine, "template_config": templateConfig, "visual_theme": visualTheme, "theme_config": themeConfig,
		"service_scope": normalizeStoreServiceScope(serviceScope), "province_code": provinceCode, "province": province, "city_id": cityID, "municipality": municipality, "neighborhood_id": neighborhoodID, "neighborhood": neighborhood, "street": street, "street_number": streetNumber,
		"pickup_enabled": pickup, "delivery_enabled": delivery, "dine_in_enabled": dineIn, "reservation_duration_minutes": reservationDuration, "cash_enabled": cash, "cash_on_delivery_enabled": cod,
		"bank_transfer_enabled": transfer, "bank_name": bankName, "bank_account_name": accountName, "bank_account_number": accountNumber,
		"bank_account_type": accountType, "business_hours": hours, "order_notice": orderNotice, "checkout_message": checkoutMessage, "is_active": active, "accepting_orders": acceptingOrders,
	})
}

func (s *Server) updateStoreSettings(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, id) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	storeCaps, capsOK := s.businessCapabilityFlagsForStore(r.Context(), id)
	if !capsOK {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	var in struct {
		Name                       string         `json:"name"`
		Slug                       string         `json:"slug"`
		Description                string         `json:"description"`
		LogoURL                    string         `json:"logo_url"`
		BannerURL                  string         `json:"banner_url"`
		Whatsapp                   string         `json:"whatsapp"`
		Address                    string         `json:"address"`
		Currency                   string         `json:"currency"`
		PrimaryColor               string         `json:"primary_color"`
		MinimumOrder               float64        `json:"minimum_order"`
		ServiceScope               string         `json:"service_scope"`
		PickupEnabled              bool           `json:"pickup_enabled"`
		DeliveryEnabled            bool           `json:"delivery_enabled"`
		DineInEnabled              bool           `json:"dine_in_enabled"`
		ReservationDurationMinutes int            `json:"reservation_duration_minutes"`
		CashEnabled                bool           `json:"cash_enabled"`
		CashOnDeliveryEnabled      bool           `json:"cash_on_delivery_enabled"`
		BankTransferEnabled        bool           `json:"bank_transfer_enabled"`
		IsActive                   bool           `json:"is_active"`
		AcceptingOrders            bool           `json:"accepting_orders"`
		BankName                   string         `json:"bank_name"`
		BankAccountName            string         `json:"bank_account_name"`
		BankAccountNumber          string         `json:"bank_account_number"`
		BankAccountType            string         `json:"bank_account_type"`
		OrderNotice                string         `json:"order_notice"`
		CheckoutMessage            string         `json:"checkout_message"`
		BusinessHours              map[string]any `json:"business_hours"`
		VisualTheme                string         `json:"visual_theme"`
		ThemeConfig                map[string]any `json:"theme_config"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Datos de tienda inválidos")
		return
	}
	if in.Slug == "" {
		in.Slug = s.safeStoreSlugFor(r.Context(), in.Name)
	} else {
		in.Slug = s.safeStoreSlugFor(r.Context(), in.Slug)
	}
	if in.Currency == "" {
		in.Currency = "DOP"
	}
	if in.PrimaryColor == "" {
		in.PrimaryColor = "#36b385"
	}
	if in.MinimumOrder < 0 {
		in.MinimumOrder = 0
	}
	in.ServiceScope = normalizeStoreServiceScope(in.ServiceScope)
	var scopeAnchor storeServiceTerritory
	if err := s.db.QueryRow(r.Context(), `SELECT $1,coalesce(province_code,''),coalesce(province,''),coalesce(city_id,''),coalesce(municipality,'') FROM stores WHERE id=$2`, in.ServiceScope, id).Scan(&scopeAnchor.Scope, &scopeAnchor.ProvinceCode, &scopeAnchor.Province, &scopeAnchor.CityID, &scopeAnchor.Municipality); err != nil {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	if err := validateStoreServiceTerritory(scopeAnchor); err != nil {
		jsonErr(w, 400, err.Error())
		return
	}
	if !storeCaps.SupportsDelivery {
		in.DeliveryEnabled = false
	}
	if !storeCaps.SupportsPickup {
		in.PickupEnabled = false
	}
	if !storeCaps.SupportsDineIn {
		in.DineInEnabled = false
	}
	if in.ReservationDurationMinutes < 15 || in.ReservationDurationMinutes > 480 {
		in.ReservationDurationMinutes = 90
	}
	in.VisualTheme = normalizeVisualTheme(in.VisualTheme)
	hours, _ := json.Marshal(in.BusinessHours)
	themeConfig, _ := json.Marshal(in.ThemeConfig)
	_, err := s.db.Exec(r.Context(), `UPDATE stores SET name=$1,slug=$2,description=$3,logo_url=$4,banner_url=$5,phone=NULL,whatsapp=$6,address=$7,currency=$8,primary_color=$9,minimum_order=$10,service_scope=$11,pickup_enabled=$12,delivery_enabled=$13,dine_in_enabled=$14,reservation_duration_minutes=$15,cash_enabled=$16,cash_on_delivery_enabled=$17,bank_transfer_enabled=$18,bank_name=$19,bank_account_name=$20,bank_account_number=$21,bank_account_type=$22,business_hours=$23,order_notice=$24,checkout_message=$25,is_active=$26,accepting_orders=$27,visual_theme=$28,theme_config=$29,updated_at=now() WHERE id=$30`, strings.TrimSpace(in.Name), in.Slug, in.Description, in.LogoURL, in.BannerURL, in.Whatsapp, in.Address, in.Currency, in.PrimaryColor, in.MinimumOrder, in.ServiceScope, in.PickupEnabled, in.DeliveryEnabled, in.DineInEnabled, in.ReservationDurationMinutes, in.CashEnabled, in.CashOnDeliveryEnabled, in.BankTransferEnabled, in.BankName, in.BankAccountName, in.BankAccountNumber, in.BankAccountType, hours, in.OrderNotice, in.CheckoutMessage, in.IsActive, in.AcceptingOrders, in.VisualTheme, themeConfig, id)
	if err != nil {
		jsonErr(w, 409, "No se pudo actualizar la tienda; verifica el identificador web")
		return
	}
	jsonOut(w, 200, map[string]any{"ok": true, "slug": in.Slug})
}

func (s *Server) listCustomers(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	sid, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT cu.id,cu.name,cu.phone,coalesce(cu.address,''),coalesce(cu.notes,''),cu.status,
		       cu.order_count,cu.total_spent,cu.last_order_at,cu.created_at,
		       coalesce(latest.whatsapp_name,''),coalesce(latest.profile_picture_url,'')
		FROM customers cu
		LEFT JOIN LATERAL (
			SELECT c.whatsapp_name,c.profile_picture_url
			FROM conversations c
			WHERE c.customer_id=cu.id
			ORDER BY c.last_message_at DESC NULLS LAST,c.created_at DESC
			LIMIT 1
		) latest ON true
		WHERE cu.store_id=$1
		  AND EXISTS (
			SELECT 1 FROM orders o
			WHERE o.customer_id=cu.id AND o.status<>'canceled' AND o.flow_type<>'quote'
		  )
		ORDER BY cu.last_order_at DESC NULLS LAST,cu.created_at DESC`, sid)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los clientes")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, phone, address, notes, status, whatsappName, profilePictureURL string
		var count int
		var spent float64
		var last *time.Time
		var created time.Time
		_ = rows.Scan(&id, &name, &phone, &address, &notes, &status, &count, &spent, &last, &created, &whatsappName, &profilePictureURL)
		out = append(out, map[string]any{
			"id": id, "name": name, "phone": phone, "address": address, "notes": notes, "status": status,
			"order_count": count, "total_spent": spent, "last_order_at": last, "created_at": created,
			"store_id": sid, "owner": c.UserID, "contact_type": "customer",
			"whatsapp_name": whatsappName, "profile_picture_url": profilePictureURL,
		})
	}
	jsonOut(w, 200, out)
}

func (s *Server) listContacts(w http.ResponseWriter, r *http.Request) {
	sid, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT c.id,
		       coalesce(nullif(c.contact_name,''),nullif(c.whatsapp_name,''),nullif(c.display_name,''),
		                CASE WHEN split_part(lower(c.remote_jid),'@',2)='s.whatsapp.net' THEN '+'||split_part(c.remote_jid,'@',1) ELSE split_part(c.remote_jid,'@',1) END),
		       coalesce(nullif(c.whatsapp_phone,''),nullif(cu.phone,''),
		                CASE WHEN split_part(lower(c.remote_jid),'@',2)='s.whatsapp.net' THEN regexp_replace(split_part(c.remote_jid,'@',1),'[^0-9]','','g') ELSE '' END),
		       coalesce(c.whatsapp_name,''),coalesce(c.profile_picture_url,''),c.unread_count,
		       coalesce(c.last_message,''),c.last_message_at,coalesce(c.status,'open'),c.created_at,
		       coalesce(c.contact_address,''),coalesce(c.contact_notes,''),coalesce(c.contact_status,'active')
		FROM conversations c
		LEFT JOIN customers cu ON cu.id=c.customer_id
		WHERE c.store_id=$1
		  AND split_part(lower(c.remote_jid),'@',2) IN ('s.whatsapp.net','lid')
		  AND NOT EXISTS (
			SELECT 1 FROM orders o
			WHERE o.customer_id=c.customer_id AND o.status<>'canceled' AND o.flow_type<>'quote'
		  )
		ORDER BY c.last_message_at DESC NULLS LAST,c.created_at DESC
		LIMIT 500`, sid)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los contactos")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, phone, whatsappName, profilePictureURL, lastMessage, status, address, notes, contactStatus string
		var unread int
		var lastAt *time.Time
		var created time.Time
		_ = rows.Scan(&id, &name, &phone, &whatsappName, &profilePictureURL, &unread, &lastMessage, &lastAt, &status, &created, &address, &notes, &contactStatus)
		out = append(out, map[string]any{
			"id": id, "conversation_id": id, "name": name, "phone": phone, "whatsapp_name": whatsappName,
			"profile_picture_url": profilePictureURL, "unread_count": unread, "last_message": lastMessage,
			"last_message_at": lastAt, "status": status, "created_at": created, "address": address,
			"notes": notes, "contact_status": contactStatus, "contact_type": "contact",
		})
	}
	jsonOut(w, 200, out)
}

func (s *Server) getCustomer(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	var sid, name, phone, address, notes, status string
	var count int
	var spent float64
	var last *time.Time
	var created time.Time
	q := `SELECT c.store_id,c.name,c.phone,coalesce(c.address,''),coalesce(c.notes,''),c.status,c.order_count,c.total_spent,c.last_order_at,c.created_at FROM customers c JOIN stores s ON s.id=c.store_id WHERE c.id=$1`
	args := []any{id}
	if c.Role != "superadmin" {
		q += ` AND s.user_id=$2`
		args = append(args, c.UserID)
	}
	if s.db.QueryRow(r.Context(), q, args...).Scan(&sid, &name, &phone, &address, &notes, &status, &count, &spent, &last, &created) != nil {
		jsonErr(w, 404, "Cliente no encontrado")
		return
	}
	orows, _ := s.db.Query(r.Context(), `SELECT id,order_number,total,status,payment_status,created_at FROM orders WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 50`, id)
	orders := []map[string]any{}
	if orows != nil {
		defer orows.Close()
		for orows.Next() {
			var oid, st, ps string
			var num int64
			var total float64
			var at time.Time
			_ = orows.Scan(&oid, &num, &total, &st, &ps, &at)
			orders = append(orders, map[string]any{"id": oid, "number": num, "total": total, "status": st, "payment_status": ps, "created_at": at})
		}
	}
	jsonOut(w, 200, map[string]any{"id": id, "store_id": sid, "name": name, "phone": phone, "address": address, "notes": notes, "status": status, "order_count": count, "total_spent": spent, "last_order_at": last, "created_at": created, "orders": orders})
}

func (s *Server) updateCustomer(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	var sid string
	q := `SELECT c.store_id FROM customers c JOIN stores s ON s.id=c.store_id WHERE c.id=$1`
	args := []any{id}
	if c.Role != "superadmin" {
		q += ` AND s.user_id=$2`
		args = append(args, c.UserID)
	}
	if s.db.QueryRow(r.Context(), q, args...).Scan(&sid) != nil {
		jsonErr(w, 404, "Cliente no encontrado")
		return
	}
	var in struct{ Name, Address, Notes, Status string }
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Nombre obligatorio")
		return
	}
	if in.Status != "active" && in.Status != "blocked" {
		in.Status = "active"
	}
	_, err := s.db.Exec(r.Context(), `UPDATE customers SET name=$1,address=$2,notes=$3,status=$4,updated_at=now() WHERE id=$5`, strings.TrimSpace(in.Name), strings.TrimSpace(in.Address), in.Notes, in.Status, id)
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar el cliente")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) refreshCustomerStats(ctx context.Context, customerID string) {
	if customerID == "" {
		return
	}
	_, _ = s.db.Exec(ctx, `UPDATE customers c SET order_count=x.cnt,total_spent=x.spent,last_order_at=x.last_at,updated_at=now() FROM (SELECT count(*) FILTER (WHERE status<>'canceled' AND flow_type<>'quote')::int cnt,coalesce(sum(total) FILTER (WHERE status<>'canceled' AND flow_type<>'quote'),0) spent,max(created_at) FILTER (WHERE status<>'canceled' AND flow_type<>'quote') last_at FROM orders WHERE customer_id=$1) x WHERE c.id=$1`, customerID)
}

func (s *Server) updateOrderPayment(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	var customerID, storeID, ownerID, currency, previous string
	var total float64
	var number int64
	q := `SELECT coalesce(o.customer_id::text,''),o.store_id::text,st.user_id::text,st.currency,o.payment_status,o.total,o.order_number FROM orders o JOIN stores st ON st.id=o.store_id WHERE o.id=$1`
	args := []any{id}
	if c.Role != "superadmin" {
		q += ` AND st.user_id=$2`
		args = append(args, c.UserID)
	}
	if s.db.QueryRow(r.Context(), q, args...).Scan(&customerID, &storeID, &ownerID, &currency, &previous, &total, &number) != nil {
		jsonErr(w, 404, "Pedido no encontrado")
		return
	}
	var in struct {
		Status string `json:"status"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Estado inválido")
		return
	}
	allowed := map[string]bool{"pending": true, "paid": true, "refunded": true}
	if !allowed[in.Status] {
		jsonErr(w, 400, "Estado de pago no permitido")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo iniciar la operación")
		return
	}
	defer tx.Rollback(r.Context())
	if _, err = tx.Exec(r.Context(), `UPDATE orders SET payment_status=$1,updated_at=now() WHERE id=$2`, in.Status, id); err != nil {
		jsonErr(w, 500, "No se pudo actualizar el pago")
		return
	}
	if in.Status != previous && (in.Status == "paid" || in.Status == "refunded") {
		amount := total
		if in.Status == "refunded" {
			amount = -total
		}
		_, err = tx.Exec(r.Context(), `INSERT INTO transactions(user_id,store_id,order_id,type,amount,currency,status,reference,description) VALUES($1,$2,$3,'order_payment',$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`, ownerID, storeID, id, amount, currency, in.Status, fmt.Sprintf("PED-%d", number), "Cambio manual del estado de pago")
		if err != nil {
			jsonErr(w, 500, "No se pudo registrar el movimiento")
			return
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar el pago")
		return
	}
	s.refreshCustomerStats(r.Context(), customerID)
	s.publishStoreEvent(r.Context(), storeID, "payment_status", map[string]any{"id": id, "number": number, "status": in.Status})
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) subscription(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var id, planID, name, slug, billing, status string
	var price float64
	var maxStores, maxProducts, maxOrders int
	var wa bool
	var starts time.Time
	var ends *time.Time
	err := s.db.QueryRow(r.Context(), `SELECT sub.id,p.id,p.name,p.slug,p.price,p.billing_period,p.max_stores,p.max_products,p.max_orders,p.whatsapp_enabled,sub.status,sub.starts_at,sub.ends_at FROM subscriptions sub JOIN plans p ON p.id=sub.plan_id WHERE sub.user_id=$1 LIMIT 1`, c.UserID).Scan(&id, &planID, &name, &slug, &price, &billing, &maxStores, &maxProducts, &maxOrders, &wa, &status, &starts, &ends)
	if err != nil {
		jsonErr(w, 404, "No tienes un plan activo")
		return
	}
	var stores, products, monthOrders int
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM stores WHERE user_id=$1 AND is_active=true`, c.UserID).Scan(&stores)
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM products p JOIN stores st ON st.id=p.store_id WHERE st.user_id=$1`, c.UserID).Scan(&products)
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM orders o JOIN stores st ON st.id=o.store_id WHERE st.user_id=$1 AND o.created_at>=date_trunc('month',now())`, c.UserID).Scan(&monthOrders)
	jsonOut(w, 200, map[string]any{"id": id, "status": status, "starts_at": starts, "ends_at": ends, "plan": map[string]any{"id": planID, "name": name, "slug": slug, "price": price, "billing_period": billing, "max_stores": maxStores, "max_products": maxProducts, "max_orders": maxOrders, "whatsapp_enabled": wa}, "usage": map[string]any{"stores": stores, "products": products, "orders": monthOrders}})
}

func (s *Server) mySubscriptionRequests(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	rows, err := s.db.Query(r.Context(), `SELECT sr.id,p.name,p.slug,sr.status,coalesce(sr.note,''),sr.created_at,sr.reviewed_at FROM subscription_requests sr JOIN plans p ON p.id=sr.requested_plan_id WHERE sr.user_id=$1 ORDER BY sr.created_at DESC LIMIT 50`, c.UserID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las solicitudes")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, slug, status, note string
		var created time.Time
		var reviewed *time.Time
		_ = rows.Scan(&id, &name, &slug, &status, &note, &created, &reviewed)
		out = append(out, map[string]any{"id": id, "plan_name": name, "plan_slug": slug, "status": status, "note": note, "created_at": created, "reviewed_at": reviewed})
	}
	jsonOut(w, 200, out)
}

func (s *Server) requestSubscription(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var in struct {
		PlanID string `json:"plan_id"`
		Note   string `json:"note"`
	}
	if decode(r, &in) != nil || in.PlanID == "" {
		jsonErr(w, 400, "Selecciona un plan")
		return
	}
	var currentPlan string
	_ = s.db.QueryRow(r.Context(), `SELECT plan_id FROM subscriptions WHERE user_id=$1`, c.UserID).Scan(&currentPlan)
	var active bool
	if s.db.QueryRow(r.Context(), `SELECT is_active FROM plans WHERE id=$1`, in.PlanID).Scan(&active) != nil || !active {
		jsonErr(w, 404, "Plan no disponible")
		return
	}
	if currentPlan == in.PlanID {
		jsonErr(w, 400, "Ese ya es tu plan actual")
		return
	}
	var id string
	err := s.db.QueryRow(r.Context(), `INSERT INTO subscription_requests(user_id,current_plan_id,requested_plan_id,note,status) VALUES($1,nullif($2,'')::uuid,$3,$4,'pending') RETURNING id`, c.UserID, currentPlan, in.PlanID, in.Note).Scan(&id)
	if err != nil {
		jsonErr(w, 409, "Ya tienes una solicitud de cambio pendiente")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id, "status": "pending"})
}

func (s *Server) adminDashboard(w http.ResponseWriter, r *http.Request) {
	var users, stores, products, orders, pending, openTickets int
	var revenue float64
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM users WHERE role='owner'`).Scan(&users)
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM stores`).Scan(&stores)
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM products`).Scan(&products)
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FILTER (WHERE flow_type<>'quote'),coalesce(sum(total) FILTER (WHERE status<>'canceled' AND flow_type<>'quote'),0) FROM orders`).Scan(&orders, &revenue)
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM subscription_requests WHERE status='pending'`).Scan(&pending)
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM support_tickets WHERE status<>'closed'`).Scan(&openTickets)
	jsonOut(w, 200, map[string]any{"users": users, "stores": stores, "products": products, "orders": orders, "revenue": revenue, "pending_plan_requests": pending, "open_tickets": openTickets})
}

func (s *Server) adminUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT u.id,u.name,coalesce(u.last_name,''),coalesce(u.phone,''),u.status,u.created_at,coalesce(p.id::text,''),coalesce(p.name,'Sin plan'),coalesce(p.slug,''),(SELECT count(*) FROM stores st WHERE st.user_id=u.id),(coalesce(u.pin_hash,'')<>''),coalesce(u.document_type,''),coalesce(u.document_number,''),u.identity_verified_at IS NOT NULL,coalesce(u.whatsapp_name,''),coalesce(u.profile_picture_url,'') FROM users u LEFT JOIN subscriptions sub ON sub.user_id=u.id LEFT JOIN plans p ON p.id=sub.plan_id WHERE u.role='owner' ORDER BY u.created_at DESC`)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los usuarios")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, lastName, phone, status, planID, planName, planSlug, docType, document, whatsappName, profilePictureURL string
		var created time.Time
		var stores int
		var pinConfigured, identityVerified bool
		_ = rows.Scan(&id, &name, &lastName, &phone, &status, &created, &planID, &planName, &planSlug, &stores, &pinConfigured, &docType, &document, &identityVerified, &whatsappName, &profilePictureURL)
		fullName := strings.TrimSpace(strings.TrimSpace(name) + " " + strings.TrimSpace(lastName))
		out = append(out, map[string]any{"id": id, "name": name, "last_name": lastName, "full_name": fullName, "phone": phone, "status": status, "created_at": created, "plan_id": planID, "plan_name": planName, "plan_slug": planSlug, "stores": stores, "pin_configured": pinConfigured, "document_type": docType, "document_number": document, "identity_verified": identityVerified, "whatsapp_name": whatsappName, "profile_picture_url": profilePictureURL})
	}
	jsonOut(w, 200, out)
}

func (s *Server) adminDeleteUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo iniciar la eliminación")
		return
	}
	defer tx.Rollback(r.Context())

	var name string
	if err := tx.QueryRow(r.Context(), `SELECT name FROM users WHERE id=$1 AND role='owner'`, id).Scan(&name); err != nil {
		jsonErr(w, 404, "Comerciante no encontrado")
		return
	}
	// Orders intentionally use ON DELETE RESTRICT for historical integrity. A hard
	// delete requested by the superadmin must therefore remove the merchant's
	// orders first; order_items cascade and transaction order references become NULL.
	if _, err := tx.Exec(r.Context(), `DELETE FROM orders WHERE store_id IN (SELECT id FROM stores WHERE user_id=$1)`, id); err != nil {
		jsonErr(w, 500, "No se pudieron eliminar los pedidos del comerciante")
		return
	}
	cmd, err := tx.Exec(r.Context(), `DELETE FROM users WHERE id=$1 AND role='owner'`, id)
	if err != nil || cmd.RowsAffected() == 0 {
		jsonErr(w, 500, "No se pudo eliminar el comerciante")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la eliminación")
		return
	}
	jsonOut(w, 200, map[string]any{"ok": true, "deleted": true, "name": name})
}

func (s *Server) adminUserStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		Status string `json:"status"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Estado inválido")
		return
	}
	if in.Status != "active" && in.Status != "blocked" {
		jsonErr(w, 400, "Estado no permitido")
		return
	}
	cmd, err := s.db.Exec(r.Context(), `UPDATE users SET status=$1,updated_at=now() WHERE id=$2 AND role='owner'`, in.Status, id)
	if err != nil || cmd.RowsAffected() == 0 {
		jsonErr(w, 404, "Propietario no encontrado")
		return
	}
	c := claims(r)
	s.auditPlatform(r.Context(), c.UserID, "owner.status.updated", "owner", id, map[string]any{"status": in.Status})
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminSetUserPIN(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		PIN string `json:"pin"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "PIN inválido")
		return
	}
	pinOK, pinLength := s.validPINFor(r.Context(), "owner", in.PIN)
	if !pinOK {
		jsonErr(w, 400, fmt.Sprintf("El PIN debe tener exactamente %d dígitos", pinLength))
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.PIN), bcrypt.DefaultCost)
	if err != nil {
		jsonErr(w, 500, "No se pudo proteger el PIN")
		return
	}
	cmd, err := s.db.Exec(r.Context(), `UPDATE users SET pin_hash=$1,pin_changed_at=now(),updated_at=now() WHERE id=$2 AND role='owner'`, string(hash), id)
	if err != nil || cmd.RowsAffected() == 0 {
		jsonErr(w, 404, "Comerciante no encontrado")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminSetUserAccess(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		Phone string `json:"phone"`
		PIN   string `json:"pin"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	phone := normalizePhone(in.Phone)
	if phone == "" {
		jsonErr(w, 400, "El WhatsApp es obligatorio")
		return
	}
	if in.PIN != "" {
		pinOK, pinLength := s.validPINFor(r.Context(), "owner", in.PIN)
		if !pinOK {
			jsonErr(w, 400, fmt.Sprintf("El PIN debe tener exactamente %d dígitos", pinLength))
			return
		}
	}
	var duplicate int
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM users WHERE role='owner' AND id<>$1 AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=$2`, id, phone).Scan(&duplicate)
	if duplicate > 0 {
		jsonErr(w, 409, "Ese WhatsApp ya pertenece a otro comerciante")
		return
	}
	if in.PIN == "" {
		cmd, err := s.db.Exec(r.Context(), `UPDATE users SET phone=$1,updated_at=now() WHERE id=$2 AND role='owner'`, phone, id)
		if err != nil || cmd.RowsAffected() == 0 {
			jsonErr(w, 404, "Comerciante no encontrado")
			return
		}
		jsonOut(w, 200, map[string]bool{"ok": true})
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.PIN), bcrypt.DefaultCost)
	if err != nil {
		jsonErr(w, 500, "No se pudo proteger el PIN")
		return
	}
	cmd, err := s.db.Exec(r.Context(), `UPDATE users SET phone=$1,pin_hash=$2,pin_changed_at=now(),updated_at=now() WHERE id=$3 AND role='owner'`, phone, string(hash), id)
	if err != nil || cmd.RowsAffected() == 0 {
		jsonErr(w, 404, "Comerciante no encontrado")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminAssignPlan(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		PlanID string `json:"plan_id"`
	}
	if decode(r, &in) != nil || in.PlanID == "" {
		jsonErr(w, 400, "Selecciona un plan")
		return
	}
	var active bool
	if s.db.QueryRow(r.Context(), `SELECT is_active FROM plans WHERE id=$1`, in.PlanID).Scan(&active) != nil || !active {
		jsonErr(w, 404, "Plan no encontrado")
		return
	}
	_, err := s.db.Exec(r.Context(), `INSERT INTO subscriptions(user_id,plan_id,status,starts_at,ends_at) VALUES($1,$2,'active',now(),NULL) ON CONFLICT(user_id) DO UPDATE SET plan_id=EXCLUDED.plan_id,status='active',starts_at=now(),ends_at=NULL`, id, in.PlanID)
	if err != nil {
		jsonErr(w, 500, "No se pudo asignar el plan")
		return
	}
	c := claims(r)
	s.auditPlatform(r.Context(), c.UserID, "owner.plan.updated", "owner", id, map[string]any{"plan_id": in.PlanID})
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminStores(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT st.id,st.name,st.slug,st.is_active,st.created_at,u.id,u.name,coalesce(u.phone,''),(SELECT count(*) FROM products p WHERE p.store_id=st.id),(SELECT count(*) FROM orders o WHERE o.store_id=st.id) FROM stores st JOIN users u ON u.id=st.user_id ORDER BY st.created_at DESC`)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las tiendas")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, slug, ownerID, owner, ownerPhone string
		var active bool
		var created time.Time
		var products, orders int
		_ = rows.Scan(&id, &name, &slug, &active, &created, &ownerID, &owner, &ownerPhone, &products, &orders)
		out = append(out, map[string]any{"id": id, "name": name, "slug": slug, "public_url": s.storePublicURL(r.Context(), id, slug), "is_active": active, "created_at": created, "owner_id": ownerID, "owner": owner, "owner_phone": ownerPhone, "products": products, "orders": orders})
	}
	jsonOut(w, 200, out)
}

func (s *Server) adminDeleteStore(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo iniciar la eliminación")
		return
	}
	defer tx.Rollback(r.Context())

	var name string
	if err := tx.QueryRow(r.Context(), `SELECT name FROM stores WHERE id=$1`, id).Scan(&name); err != nil {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	// Orders use ON DELETE RESTRICT; remove them explicitly before the store.
	if _, err := tx.Exec(r.Context(), `DELETE FROM orders WHERE store_id=$1`, id); err != nil {
		jsonErr(w, 500, "No se pudieron eliminar los pedidos de la tienda")
		return
	}
	cmd, err := tx.Exec(r.Context(), `DELETE FROM stores WHERE id=$1`, id)
	if err != nil || cmd.RowsAffected() == 0 {
		jsonErr(w, 500, "No se pudo eliminar la tienda")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la eliminación")
		return
	}
	jsonOut(w, 200, map[string]any{"ok": true, "deleted": true, "name": name})
}

type adminPlanInput struct {
	Name            string  `json:"name"`
	Slug            string  `json:"slug"`
	Description     string  `json:"description"`
	Price           float64 `json:"price"`
	BillingPeriod   string  `json:"billing_period"`
	MaxStores       int     `json:"max_stores"`
	MaxProducts     int     `json:"max_products"`
	MaxOrders       int     `json:"max_orders"`
	WhatsAppEnabled bool    `json:"whatsapp_enabled"`
	IsActive        bool    `json:"is_active"`
	IsFeatured      bool    `json:"is_featured"`
}

func normalizePlanInput(in *adminPlanInput) {
	if in.Slug == "" {
		in.Slug = slugify(in.Name)
	} else {
		in.Slug = slugify(in.Slug)
	}
	if in.BillingPeriod == "" {
		in.BillingPeriod = "monthly"
	}
	if in.MaxStores < 1 {
		in.MaxStores = 1
	}
	if in.MaxProducts < 1 {
		in.MaxProducts = 1
	}
	if in.MaxOrders < 1 {
		in.MaxOrders = 1
	}
	if in.Price < 0 {
		in.Price = 0
	}
}
func (s *Server) adminPlans(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT id,name,slug,coalesce(description,''),price,billing_period,max_stores,max_products,max_orders,whatsapp_enabled,is_active,is_featured,created_at FROM plans ORDER BY price,name`)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los planes")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, n, sl, d, bill string
		var price float64
		var ms, mp, mo int
		var wa, active, featured bool
		var created time.Time
		_ = rows.Scan(&id, &n, &sl, &d, &price, &bill, &ms, &mp, &mo, &wa, &active, &featured, &created)
		out = append(out, map[string]any{"id": id, "name": n, "slug": sl, "description": d, "price": price, "billing_period": bill, "max_stores": ms, "max_products": mp, "max_orders": mo, "whatsapp_enabled": wa, "is_active": active, "is_featured": featured, "created_at": created})
	}
	jsonOut(w, 200, out)
}
func (s *Server) adminCreatePlan(w http.ResponseWriter, r *http.Request) {
	var in adminPlanInput
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Nombre obligatorio")
		return
	}
	normalizePlanInput(&in)
	var id string
	err := s.db.QueryRow(r.Context(), `INSERT INTO plans(name,slug,description,price,billing_period,max_stores,max_products,max_orders,whatsapp_enabled,is_active,is_featured) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, in.Name, in.Slug, in.Description, in.Price, in.BillingPeriod, in.MaxStores, in.MaxProducts, in.MaxOrders, in.WhatsAppEnabled, in.IsActive, in.IsFeatured).Scan(&id)
	if err != nil {
		jsonErr(w, 409, "No se pudo crear el plan; verifica el identificador")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id})
}
func (s *Server) adminUpdatePlan(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in adminPlanInput
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Nombre obligatorio")
		return
	}
	normalizePlanInput(&in)
	_, err := s.db.Exec(r.Context(), `UPDATE plans SET name=$1,slug=$2,description=$3,price=$4,billing_period=$5,max_stores=$6,max_products=$7,max_orders=$8,whatsapp_enabled=$9,is_active=$10,is_featured=$11 WHERE id=$12`, in.Name, in.Slug, in.Description, in.Price, in.BillingPeriod, in.MaxStores, in.MaxProducts, in.MaxOrders, in.WhatsAppEnabled, in.IsActive, in.IsFeatured, id)
	if err != nil {
		jsonErr(w, 409, "No se pudo actualizar el plan")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminSubscriptions(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT sub.id,u.id,u.name,coalesce(u.phone,''),p.id,p.name,p.price,sub.status,sub.starts_at,sub.ends_at,(SELECT count(*) FROM stores st WHERE st.user_id=u.id)::int FROM subscriptions sub JOIN users u ON u.id=sub.user_id JOIN plans p ON p.id=sub.plan_id WHERE u.role='owner' ORDER BY sub.starts_at DESC`)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las suscripciones")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, userID, name, phone, planID, planName, status string
		var price float64
		var starts time.Time
		var ends *time.Time
		var stores int
		if rows.Scan(&id, &userID, &name, &phone, &planID, &planName, &price, &status, &starts, &ends, &stores) == nil {
			out = append(out, map[string]any{"id": id, "user_id": userID, "user_name": name, "user_phone": phone, "plan_id": planID, "plan_name": planName, "price": price, "status": status, "starts_at": starts, "ends_at": ends, "stores": stores})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) adminSubscriptionRequests(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT sr.id,u.id,u.name,coalesce(u.phone,''),coalesce(cp.name,'Sin plan'),rp.id,rp.name,rp.price,coalesce(sr.note,''),sr.status,sr.created_at,sr.reviewed_at FROM subscription_requests sr JOIN users u ON u.id=sr.user_id LEFT JOIN plans cp ON cp.id=sr.current_plan_id JOIN plans rp ON rp.id=sr.requested_plan_id ORDER BY CASE WHEN sr.status='pending' THEN 0 ELSE 1 END,sr.created_at DESC`)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las solicitudes")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, uid, name, phone, current, planID, requested, note, status string
		var price float64
		var created time.Time
		var reviewed *time.Time
		_ = rows.Scan(&id, &uid, &name, &phone, &current, &planID, &requested, &price, &note, &status, &created, &reviewed)
		out = append(out, map[string]any{"id": id, "user_id": uid, "user_name": name, "user_phone": phone, "current_plan": current, "requested_plan_id": planID, "requested_plan": requested, "price": price, "note": note, "status": status, "created_at": created, "reviewed_at": reviewed})
	}
	jsonOut(w, 200, out)
}
func (s *Server) adminReviewSubscriptionRequest(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	var in struct {
		Decision string `json:"decision"`
	}
	if decode(r, &in) != nil || (in.Decision != "approved" && in.Decision != "rejected") {
		jsonErr(w, 400, "Decisión inválida")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo iniciar la operación")
		return
	}
	defer tx.Rollback(r.Context())
	var uid, pid, status string
	if tx.QueryRow(r.Context(), `SELECT user_id,requested_plan_id,status FROM subscription_requests WHERE id=$1 FOR UPDATE`, id).Scan(&uid, &pid, &status) != nil {
		jsonErr(w, 404, "Solicitud no encontrada")
		return
	}
	if status != "pending" {
		jsonErr(w, 409, "La solicitud ya fue revisada")
		return
	}
	if in.Decision == "approved" {
		if _, err = tx.Exec(r.Context(), `INSERT INTO subscriptions(user_id,plan_id,status,starts_at,ends_at) VALUES($1,$2,'active',now(),NULL) ON CONFLICT(user_id) DO UPDATE SET plan_id=EXCLUDED.plan_id,status='active',starts_at=now(),ends_at=NULL`, uid, pid); err != nil {
			jsonErr(w, 500, "No se pudo activar el plan")
			return
		}
	}
	_, err = tx.Exec(r.Context(), `UPDATE subscription_requests SET status=$1,reviewed_by=$2,reviewed_at=now(),updated_at=now() WHERE id=$3`, in.Decision, c.UserID, id)
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar la solicitud")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la operación")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) listTransactions(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	storeID := r.URL.Query().Get("store_id")
	q := `SELECT t.id,coalesce(t.store_id::text,''),coalesce(st.name,''),coalesce(t.order_id::text,''),t.type,t.amount,t.currency,t.status,coalesce(t.reference,''),coalesce(t.description,''),t.created_at FROM transactions t LEFT JOIN stores st ON st.id=t.store_id WHERE t.user_id=$1`
	args := []any{c.UserID}
	if storeID != "" {
		q += ` AND t.store_id=$2`
		args = append(args, storeID)
	}
	q += ` ORDER BY t.created_at DESC LIMIT 500`
	rows, err := s.db.Query(r.Context(), q, args...)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los movimientos")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, sid, store, orderID, typ, currency, status, reference, description string
		var amount float64
		var created time.Time
		if rows.Scan(&id, &sid, &store, &orderID, &typ, &amount, &currency, &status, &reference, &description, &created) == nil {
			out = append(out, map[string]any{"id": id, "store_id": sid, "store_name": store, "order_id": orderID, "type": typ, "amount": amount, "currency": currency, "status": status, "reference": reference, "description": description, "created_at": created})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) adminTransactions(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT t.id,u.name,coalesce(u.phone,''),coalesce(st.name,''),t.type,t.amount,t.currency,t.status,coalesce(t.reference,''),coalesce(t.description,''),t.created_at FROM transactions t JOIN users u ON u.id=t.user_id LEFT JOIN stores st ON st.id=t.store_id ORDER BY t.created_at DESC LIMIT 1000`)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los movimientos")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, userName, phone, store, typ, currency, status, reference, description string
		var amount float64
		var created time.Time
		if rows.Scan(&id, &userName, &phone, &store, &typ, &amount, &currency, &status, &reference, &description, &created) == nil {
			out = append(out, map[string]any{"id": id, "user_name": userName, "user_phone": phone, "store_name": store, "type": typ, "amount": amount, "currency": currency, "status": status, "reference": reference, "description": description, "created_at": created})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) listTickets(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	rows, err := s.db.Query(r.Context(), `SELECT id,number,subject,priority,status,last_reply_at,created_at FROM support_tickets WHERE user_id=$1 ORDER BY last_reply_at DESC`, c.UserID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los tickets")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, subject, priority, status string
		var number int64
		var last, created time.Time
		if rows.Scan(&id, &number, &subject, &priority, &status, &last, &created) == nil {
			out = append(out, map[string]any{"id": id, "number": number, "subject": subject, "priority": priority, "status": status, "last_reply_at": last, "created_at": created})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) createTicket(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var in struct {
		Subject  string `json:"subject"`
		Priority string `json:"priority"`
		Message  string `json:"message"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Subject) == "" || strings.TrimSpace(in.Message) == "" {
		jsonErr(w, 400, "Asunto y mensaje son obligatorios")
		return
	}
	if in.Priority != "low" && in.Priority != "high" && in.Priority != "urgent" {
		in.Priority = "normal"
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo crear el ticket")
		return
	}
	defer tx.Rollback(r.Context())
	var id string
	var number int64
	if err = tx.QueryRow(r.Context(), `INSERT INTO support_tickets(user_id,subject,priority) VALUES($1,$2,$3) RETURNING id,number`, c.UserID, strings.TrimSpace(in.Subject), in.Priority).Scan(&id, &number); err != nil {
		jsonErr(w, 500, "No se pudo crear el ticket")
		return
	}
	if _, err = tx.Exec(r.Context(), `INSERT INTO support_ticket_messages(ticket_id,sender_user_id,sender_role,message) VALUES($1,$2,$3,$4)`, id, c.UserID, c.Role, strings.TrimSpace(in.Message)); err != nil {
		jsonErr(w, 500, "No se pudo guardar el mensaje")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar el ticket")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id, "number": number})
}

func (s *Server) ticketOwned(ctx context.Context, c *authpkg.Claims, id string) bool {
	if c.Role == "superadmin" {
		var ok bool
		_ = s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM support_tickets WHERE id=$1)`, id).Scan(&ok)
		return ok
	}
	var ok bool
	_ = s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM support_tickets WHERE id=$1 AND user_id=$2)`, id, c.UserID).Scan(&ok)
	return ok
}

func (s *Server) ticketPayload(ctx context.Context, id string) (map[string]any, error) {
	var number int64
	var uid, name, phone, subject, priority, status string
	var last, created time.Time
	if err := s.db.QueryRow(ctx, `SELECT t.number,t.user_id::text,u.name,coalesce(u.phone,''),t.subject,t.priority,t.status,t.last_reply_at,t.created_at FROM support_tickets t JOIN users u ON u.id=t.user_id WHERE t.id=$1`, id).Scan(&number, &uid, &name, &phone, &subject, &priority, &status, &last, &created); err != nil {
		return nil, err
	}
	rows, err := s.db.Query(ctx, `SELECT m.id,coalesce(m.sender_user_id::text,''),m.sender_role,m.message,m.created_at,coalesce(u.name,'Soporte WAMERCIO') FROM support_ticket_messages m LEFT JOIN users u ON u.id=m.sender_user_id WHERE m.ticket_id=$1 ORDER BY m.created_at`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	messages := []map[string]any{}
	for rows.Next() {
		var mid, senderID, role, message, senderName string
		var at time.Time
		if rows.Scan(&mid, &senderID, &role, &message, &at, &senderName) == nil {
			messages = append(messages, map[string]any{"id": mid, "sender_user_id": senderID, "sender_role": role, "sender_name": senderName, "message": message, "created_at": at})
		}
	}
	return map[string]any{"id": id, "number": number, "user_id": uid, "user_name": name, "user_phone": phone, "subject": subject, "priority": priority, "status": status, "last_reply_at": last, "created_at": created, "messages": messages}, nil
}

func (s *Server) getTicket(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	if !s.ticketOwned(r.Context(), c, id) {
		jsonErr(w, 404, "Ticket no encontrado")
		return
	}
	payload, err := s.ticketPayload(r.Context(), id)
	if err != nil {
		jsonErr(w, 404, "Ticket no encontrado")
		return
	}
	jsonOut(w, 200, payload)
}

func (s *Server) replyTicket(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	if !s.ticketOwned(r.Context(), c, id) || c.Role == "superadmin" {
		jsonErr(w, 404, "Ticket no encontrado")
		return
	}
	var in struct {
		Message string `json:"message"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Message) == "" {
		jsonErr(w, 400, "Mensaje obligatorio")
		return
	}
	var status string
	if s.db.QueryRow(r.Context(), `SELECT status FROM support_tickets WHERE id=$1`, id).Scan(&status) != nil || status == "closed" {
		jsonErr(w, 409, "El ticket está cerrado")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo responder")
		return
	}
	defer tx.Rollback(r.Context())
	if _, err = tx.Exec(r.Context(), `INSERT INTO support_ticket_messages(ticket_id,sender_user_id,sender_role,message) VALUES($1,$2,$3,$4)`, id, c.UserID, c.Role, strings.TrimSpace(in.Message)); err != nil {
		jsonErr(w, 500, "No se pudo responder")
		return
	}
	_, _ = tx.Exec(r.Context(), `UPDATE support_tickets SET status='open',last_reply_at=now(),updated_at=now() WHERE id=$1`, id)
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la respuesta")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) closeTicket(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	if !s.ticketOwned(r.Context(), c, id) || c.Role == "superadmin" {
		jsonErr(w, 404, "Ticket no encontrado")
		return
	}
	_, err := s.db.Exec(r.Context(), `UPDATE support_tickets SET status='closed',updated_at=now() WHERE id=$1 AND user_id=$2`, id, c.UserID)
	if err != nil {
		jsonErr(w, 500, "No se pudo cerrar el ticket")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminTickets(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	q := `SELECT t.id,t.number,u.name,coalesce(u.phone,''),t.subject,t.priority,t.status,t.last_reply_at,t.created_at FROM support_tickets t JOIN users u ON u.id=t.user_id`
	args := []any{}
	if status != "" && status != "all" {
		q += ` WHERE t.status=$1`
		args = append(args, status)
	}
	q += ` ORDER BY CASE WHEN t.status='open' THEN 0 WHEN t.status='answered' THEN 1 ELSE 2 END,t.last_reply_at DESC LIMIT 500`
	rows, err := s.db.Query(r.Context(), q, args...)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los tickets")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, phone, subject, priority, st string
		var number int64
		var last, created time.Time
		if rows.Scan(&id, &number, &name, &phone, &subject, &priority, &st, &last, &created) == nil {
			out = append(out, map[string]any{"id": id, "number": number, "user_name": name, "user_phone": phone, "subject": subject, "priority": priority, "status": st, "last_reply_at": last, "created_at": created})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) adminTicket(w http.ResponseWriter, r *http.Request) {
	payload, err := s.ticketPayload(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, 404, "Ticket no encontrado")
		return
	}
	jsonOut(w, 200, payload)
}

func (s *Server) adminReplyTicket(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	var in struct {
		Message string `json:"message"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Message) == "" {
		jsonErr(w, 400, "Mensaje obligatorio")
		return
	}
	if !s.ticketOwned(r.Context(), c, id) {
		jsonErr(w, 404, "Ticket no encontrado")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo responder")
		return
	}
	defer tx.Rollback(r.Context())
	if _, err = tx.Exec(r.Context(), `INSERT INTO support_ticket_messages(ticket_id,sender_user_id,sender_role,message) VALUES($1,$2,'superadmin',$3)`, id, c.UserID, strings.TrimSpace(in.Message)); err != nil {
		jsonErr(w, 500, "No se pudo responder")
		return
	}
	_, _ = tx.Exec(r.Context(), `UPDATE support_tickets SET status='answered',last_reply_at=now(),updated_at=now() WHERE id=$1`, id)
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la respuesta")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminTicketStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		Status string `json:"status"`
	}
	if decode(r, &in) != nil || (in.Status != "open" && in.Status != "answered" && in.Status != "closed") {
		jsonErr(w, 400, "Estado inválido")
		return
	}
	res, err := s.db.Exec(r.Context(), `UPDATE support_tickets SET status=$1,updated_at=now() WHERE id=$2`, in.Status, id)
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar el ticket")
		return
	}
	if res.RowsAffected() == 0 {
		jsonErr(w, 404, "Ticket no encontrado")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) supportWhatsAppInfo(w http.ResponseWriter, r *http.Request) {
	var whatsapp, status, whatsappName, profilePictureURL string
	var lastSeen *time.Time
	err := s.db.QueryRow(r.Context(), `SELECT coalesce(whatsapp,''),status,last_seen_at,coalesce(whatsapp_name,''),coalesce(profile_picture_url,'') FROM support_whatsapp_session WHERE singleton=true`).Scan(&whatsapp, &status, &lastSeen, &whatsappName, &profilePictureURL)
	if err != nil {
		jsonOut(w, 200, map[string]any{"connected": false, "whatsapp": "", "status": "disconnected", "whatsapp_name": "", "profile_picture_url": ""})
		return
	}
	jsonOut(w, 200, map[string]any{"connected": status == "connected" && whatsapp != "", "whatsapp": whatsapp, "status": status, "last_seen_at": lastSeen, "whatsapp_name": whatsappName, "profile_picture_url": profilePictureURL})
}

// bridgeMediaReq forwards a browser upload to the internal WhatsApp service without
// exposing the WhatsApp session service to the public network.
func (s *Server) bridgeMediaReq(ctx context.Context, sessionKey, to, caption string, f multipart.File, h *multipart.FileHeader) (map[string]any, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("to", to)
	_ = mw.WriteField("caption", caption)
	_ = mw.WriteField("mime_type", h.Header.Get("Content-Type"))
	part, err := mw.CreateFormFile("file", h.Filename)
	if err != nil {
		return nil, err
	}
	if _, err = io.Copy(part, io.LimitReader(f, 32<<20)); err != nil {
		return nil, err
	}
	_ = mw.Close()
	req, err := http.NewRequestWithContext(ctx, "POST", strings.TrimRight(s.cfg.WhatsAppBridgeURL, "/")+"/sessions/"+sessionKey+"/media", &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("X-Internal-Secret", s.cfg.InternalWebhookSecret)
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if resp.StatusCode >= 300 {
		return out, fmt.Errorf("bridge status %d", resp.StatusCode)
	}
	return out, nil
}

func (s *Server) sendConversationMedia(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	sid, jid, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	if s.conversationIsBlocked(r.Context(), id) {
		jsonErr(w, 409, "El contacto está bloqueado")
		return
	}
	if err := r.ParseMultipartForm(33 << 20); err != nil {
		jsonErr(w, 400, "Archivo demasiado grande")
		return
	}
	f, h, err := r.FormFile("file")
	if err != nil {
		jsonErr(w, 400, "Selecciona un archivo")
		return
	}
	defer f.Close()
	caption := strings.TrimSpace(r.FormValue("caption"))
	out, err := s.bridgeMediaReq(r.Context(), sid, jid, caption, f, h)
	if err != nil {
		jsonErr(w, 502, "No se pudo enviar el archivo por WhatsApp")
		return
	}
	msgID := fmt.Sprint(out["id"])
	typ := fmt.Sprint(out["type"])
	mediaURL := fmt.Sprint(out["media_url"])
	mimeType := fmt.Sprint(out["mime_type"])
	fileName := fmt.Sprint(out["file_name"])
	body := caption
	if body == "" {
		body = fileName
	}
	if body == "" {
		body = strings.Title(typ)
	}
	now := time.Now()
	_, _ = s.db.Exec(r.Context(), `INSERT INTO messages(conversation_id,message_id,direction,type,body,status,media_url,mime_type,file_name,caption,occurred_at) VALUES($1,$2,'out',$3,$4,'sent',$5,$6,$7,$8,$9) ON CONFLICT(conversation_id,message_id) DO NOTHING`, id, msgID, typ, body, mediaURL, mimeType, fileName, caption, now)
	_, _ = s.db.Exec(r.Context(), `UPDATE conversations SET last_message=$1,last_message_at=$2,updated_at=now() WHERE id=$3`, body, now, id)
	jsonOut(w, 200, map[string]any{"ok": true, "id": msgID, "type": typ, "body": body, "media_url": mediaURL, "mime_type": mimeType, "file_name": fileName, "caption": caption, "occurred_at": now})
}

// --- SuperAdmin WhatsApp support center -------------------------------------

func (s *Server) adminWhatsAppStatus(w http.ResponseWriter, r *http.Request) {
	out, err := s.bridgeReq(r.Context(), "GET", "/sessions/support/status", nil)
	if err != nil {
		jsonOut(w, 200, map[string]any{"status": "unavailable", "connected": false, "message": "Servicio WhatsApp no disponible"})
		return
	}
	jsonOut(w, 200, out)
}
func (s *Server) adminWhatsAppConnect(w http.ResponseWriter, r *http.Request) {
	out, err := s.bridgeReq(r.Context(), "POST", "/sessions/support/connect", map[string]any{})
	if err != nil {
		jsonErr(w, 502, "No se pudo iniciar el WhatsApp de soporte")
		return
	}
	jsonOut(w, 200, out)
}
func (s *Server) adminWhatsAppDisconnect(w http.ResponseWriter, r *http.Request) {
	out, err := s.bridgeReq(r.Context(), "POST", "/sessions/support/disconnect", map[string]any{})
	if err != nil {
		jsonErr(w, 502, "No se pudo desvincular el WhatsApp de soporte")
		return
	}
	jsonOut(w, 200, out)
}
func (s *Server) adminWhatsAppConversations(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT coalesce(c.id::text,''),u.id::text,u.name,coalesce(u.phone,''),coalesce(c.remote_jid,''),coalesce(c.display_name,u.name),coalesce(c.unread_count,0),coalesce(c.last_message,''),c.last_message_at,u.status FROM users u LEFT JOIN LATERAL (SELECT * FROM support_whatsapp_conversations x WHERE x.owner_id=u.id ORDER BY x.last_message_at DESC NULLS LAST LIMIT 1) c ON true WHERE u.role='owner' ORDER BY coalesce(c.last_message_at,u.created_at) DESC`)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los comercios")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, ownerID, name, wa, jid, display, last, status string
		var unread int
		var lastAt *time.Time
		if rows.Scan(&id, &ownerID, &name, &wa, &jid, &display, &unread, &last, &lastAt, &status) == nil {
			out = append(out, map[string]any{"id": id, "owner_id": ownerID, "name": name, "whatsapp": wa, "remote_jid": jid, "display_name": display, "unread_count": unread, "last_message": last, "last_message_at": lastAt, "owner_status": status})
		}
	}
	jsonOut(w, 200, out)
}
func (s *Server) adminWhatsAppEnsureConversation(w http.ResponseWriter, r *http.Request) {
	var in struct {
		OwnerID string `json:"owner_id"`
	}
	if decode(r, &in) != nil || in.OwnerID == "" {
		jsonErr(w, 400, "Comerciante inválido")
		return
	}
	var name, phone string
	if s.db.QueryRow(r.Context(), `SELECT name,coalesce(phone,'') FROM users WHERE id=$1 AND role='owner'`, in.OwnerID).Scan(&name, &phone) != nil {
		jsonErr(w, 404, "Comerciante no encontrado")
		return
	}
	phone = normalizePhone(phone)
	if phone == "" {
		jsonErr(w, 400, "El comerciante no tiene WhatsApp configurado")
		return
	}
	var id, jid string
	if s.db.QueryRow(r.Context(), `SELECT id::text,remote_jid FROM support_whatsapp_conversations WHERE owner_id=$1 ORDER BY last_message_at DESC NULLS LAST LIMIT 1`, in.OwnerID).Scan(&id, &jid) == nil {
		jsonOut(w, 200, map[string]any{"id": id, "remote_jid": jid, "owner_id": in.OwnerID, "display_name": name, "whatsapp": phone})
		return
	}
	jid = phone + "@s.whatsapp.net"
	if s.db.QueryRow(r.Context(), `INSERT INTO support_whatsapp_conversations(owner_id,remote_jid,whatsapp,display_name) VALUES($1,$2,$3,$4) ON CONFLICT(remote_jid) DO UPDATE SET owner_id=excluded.owner_id,whatsapp=excluded.whatsapp,display_name=excluded.display_name,updated_at=now() RETURNING id`, in.OwnerID, jid, phone, name).Scan(&id) != nil {
		jsonErr(w, 500, "No se pudo iniciar la conversación")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id, "remote_jid": jid, "owner_id": in.OwnerID, "display_name": name, "whatsapp": phone})
}
func (s *Server) adminWhatsAppMessages(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var exists bool
	_ = s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM support_whatsapp_conversations WHERE id=$1)`, id).Scan(&exists)
	if !exists {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id,coalesce(message_id,''),direction,type,coalesce(body,''),coalesce(status,''),coalesce(media_url,''),coalesce(mime_type,''),coalesce(file_name,''),coalesce(file_size,0),coalesce(caption,''),occurred_at FROM support_whatsapp_messages WHERE conversation_id=$1 ORDER BY occurred_at ASC LIMIT 1500`, id)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los mensajes")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var mid, msgid, dir, typ, body, status, url, mime, file, caption string
		var size int64
		var at time.Time
		if rows.Scan(&mid, &msgid, &dir, &typ, &body, &status, &url, &mime, &file, &size, &caption, &at) == nil {
			out = append(out, map[string]any{"id": mid, "message_id": msgid, "direction": dir, "type": typ, "body": body, "status": status, "media_url": url, "mime_type": mime, "file_name": file, "file_size": size, "caption": caption, "occurred_at": at})
		}
	}
	jsonOut(w, 200, out)
}
func (s *Server) adminWhatsAppRead(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var jid string
	if s.db.QueryRow(r.Context(), `SELECT remote_jid FROM support_whatsapp_conversations WHERE id=$1`, id).Scan(&jid) != nil {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	rows, _ := s.db.Query(r.Context(), `SELECT message_id FROM support_whatsapp_messages WHERE conversation_id=$1 AND direction='in' AND coalesce(message_id,'')<>'' AND coalesce(status,'')<>'read' ORDER BY occurred_at DESC LIMIT 100`, id)
	ids := []string{}
	if rows != nil {
		for rows.Next() {
			var mid string
			if rows.Scan(&mid) == nil {
				ids = append(ids, mid)
			}
		}
		rows.Close()
	}
	if len(ids) > 0 {
		_, _ = s.bridgeReq(r.Context(), "POST", "/sessions/support/read", map[string]any{"chat": jid, "message_ids": ids})
		_, _ = s.db.Exec(r.Context(), `UPDATE support_whatsapp_messages SET status='read' WHERE conversation_id=$1 AND direction='in' AND message_id=ANY($2::text[])`, id, ids)
	}
	_, _ = s.db.Exec(r.Context(), `UPDATE support_whatsapp_conversations SET unread_count=0,updated_at=now() WHERE id=$1`, id)
	jsonOut(w, 200, map[string]bool{"ok": true})
}
func (s *Server) adminWhatsAppSend(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var jid string
	if s.db.QueryRow(r.Context(), `SELECT remote_jid FROM support_whatsapp_conversations WHERE id=$1`, id).Scan(&jid) != nil {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	var in struct {
		Text string `json:"text"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Text) == "" {
		jsonErr(w, 400, "Escribe un mensaje")
		return
	}
	in.Text = strings.TrimSpace(in.Text)
	out, err := s.bridgeReq(r.Context(), "POST", "/sessions/support/messages", map[string]any{"to": jid, "text": in.Text})
	if err != nil {
		jsonErr(w, 502, "No se pudo enviar por WhatsApp")
		return
	}
	msgID := fmt.Sprint(out["id"])
	now := time.Now()
	_, _ = s.db.Exec(r.Context(), `INSERT INTO support_whatsapp_messages(conversation_id,message_id,direction,type,body,status,occurred_at) VALUES($1,$2,'out','text',$3,'sent',$4) ON CONFLICT(conversation_id,message_id) DO NOTHING`, id, msgID, in.Text, now)
	_, _ = s.db.Exec(r.Context(), `UPDATE support_whatsapp_conversations SET last_message=$1,last_message_at=$2,updated_at=now() WHERE id=$3`, in.Text, now, id)
	jsonOut(w, 200, map[string]any{"ok": true, "id": msgID, "occurred_at": now})
}
func (s *Server) adminWhatsAppSendMedia(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var jid string
	if s.db.QueryRow(r.Context(), `SELECT remote_jid FROM support_whatsapp_conversations WHERE id=$1`, id).Scan(&jid) != nil {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	if err := r.ParseMultipartForm(33 << 20); err != nil {
		jsonErr(w, 400, "Archivo demasiado grande")
		return
	}
	f, h, err := r.FormFile("file")
	if err != nil {
		jsonErr(w, 400, "Selecciona un archivo")
		return
	}
	defer f.Close()
	caption := strings.TrimSpace(r.FormValue("caption"))
	out, err := s.bridgeMediaReq(r.Context(), "support", jid, caption, f, h)
	if err != nil {
		jsonErr(w, 502, "No se pudo enviar el archivo por WhatsApp")
		return
	}
	msgID := fmt.Sprint(out["id"])
	typ := fmt.Sprint(out["type"])
	url := fmt.Sprint(out["media_url"])
	mime := fmt.Sprint(out["mime_type"])
	file := fmt.Sprint(out["file_name"])
	body := caption
	if body == "" {
		body = file
	}
	if body == "" {
		body = typ
	}
	now := time.Now()
	_, _ = s.db.Exec(r.Context(), `INSERT INTO support_whatsapp_messages(conversation_id,message_id,direction,type,body,status,media_url,mime_type,file_name,caption,occurred_at) VALUES($1,$2,'out',$3,$4,'sent',$5,$6,$7,$8,$9) ON CONFLICT(conversation_id,message_id) DO NOTHING`, id, msgID, typ, body, url, mime, file, caption, now)
	_, _ = s.db.Exec(r.Context(), `UPDATE support_whatsapp_conversations SET last_message=$1,last_message_at=$2,updated_at=now() WHERE id=$3`, body, now, id)
	jsonOut(w, 200, map[string]any{"ok": true, "id": msgID, "type": typ, "body": body, "media_url": url, "mime_type": mime, "file_name": file, "caption": caption, "occurred_at": now})
}

func (s *Server) listBusinessTemplates(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT id,slug,name,family,coalesce(description,''),coalesce(icon,''),engine,recommended_style,settings,is_featured,sort_order FROM business_templates WHERE is_active=true ORDER BY is_featured DESC,sort_order,name`)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las plantillas")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, slug, name, family, desc, icon, engine, style string
		var raw []byte
		var featured bool
		var order int
		if rows.Scan(&id, &slug, &name, &family, &desc, &icon, &engine, &style, &raw, &featured, &order) != nil {
			continue
		}
		var settings any = map[string]any{}
		_ = json.Unmarshal(raw, &settings)
		catRows, _ := s.db.Query(r.Context(), `SELECT name FROM template_categories WHERE template_id=$1 ORDER BY sort_order,name LIMIT 6`, id)
		cats := []string{}
		if catRows != nil {
			for catRows.Next() {
				var c string
				if catRows.Scan(&c) == nil {
					cats = append(cats, c)
				}
			}
			catRows.Close()
		}
		out = append(out, map[string]any{"id": id, "slug": slug, "name": name, "family": family, "description": desc, "icon": icon, "engine": engine, "recommended_style": style, "settings": settings, "is_featured": featured, "sort_order": order, "categories": cats})
	}
	jsonOut(w, 200, out)
}

func (s *Server) getBusinessTemplate(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var id, name, family, desc, icon, engine, style string
	var raw []byte
	var featured, active bool
	var order int
	if err := s.db.QueryRow(r.Context(), `SELECT id,name,family,coalesce(description,''),coalesce(icon,''),engine,recommended_style,settings,is_featured,is_active,sort_order FROM business_templates WHERE slug=$1`, slug).Scan(&id, &name, &family, &desc, &icon, &engine, &style, &raw, &featured, &active, &order); err != nil || !active {
		jsonErr(w, 404, "Plantilla no encontrada")
		return
	}
	var settings any = map[string]any{}
	_ = json.Unmarshal(raw, &settings)
	categories := []map[string]any{}
	cr, _ := s.db.Query(r.Context(), `SELECT id,name,slug,coalesce(description,''),sort_order FROM template_categories WHERE template_id=$1 ORDER BY sort_order,name`, id)
	if cr != nil {
		defer cr.Close()
		for cr.Next() {
			var cid, n, sl, d string
			var so int
			if cr.Scan(&cid, &n, &sl, &d, &so) == nil {
				categories = append(categories, map[string]any{"id": cid, "name": n, "slug": sl, "description": d, "sort_order": so})
			}
		}
	}
	products := []map[string]any{}
	pr, _ := s.db.Query(r.Context(), `SELECT id,coalesce(category_slug,''),name,slug,coalesce(description,''),coalesce(image_url,''),price,track_stock,variants,extras,attributes,is_featured,sort_order FROM template_products WHERE template_id=$1 ORDER BY is_featured DESC,sort_order,name`, id)
	if pr != nil {
		defer pr.Close()
		for pr.Next() {
			var pid, cat, n, sl, d, img string
			var price float64
			var track, pf bool
			var variantsRaw, extrasRaw, attributesRaw []byte
			var so int
			if pr.Scan(&pid, &cat, &n, &sl, &d, &img, &price, &track, &variantsRaw, &extrasRaw, &attributesRaw, &pf, &so) == nil {
				var variants, extras any = []any{}, []any{}
				var attributes any = map[string]any{}
				_ = json.Unmarshal(variantsRaw, &variants)
				_ = json.Unmarshal(extrasRaw, &extras)
				_ = json.Unmarshal(attributesRaw, &attributes)
				products = append(products, map[string]any{"id": pid, "category_slug": cat, "name": n, "slug": sl, "description": d, "image_url": img, "price": price, "track_stock": track, "variants": variants, "extras": extras, "attributes": attributes, "is_featured": pf, "sort_order": so})
			}
		}
	}
	replies := []map[string]any{}
	rr, _ := s.db.Query(r.Context(), `SELECT id,shortcut,title,message,sort_order FROM template_quick_replies WHERE template_id=$1 ORDER BY sort_order,title`, id)
	if rr != nil {
		defer rr.Close()
		for rr.Next() {
			var rid, shortcut, title, message string
			var so int
			if rr.Scan(&rid, &shortcut, &title, &message, &so) == nil {
				replies = append(replies, map[string]any{"id": rid, "shortcut": shortcut, "title": title, "message": message, "sort_order": so})
			}
		}
	}
	jsonOut(w, 200, map[string]any{"id": id, "slug": slug, "name": name, "family": family, "description": desc, "icon": icon, "engine": engine, "recommended_style": style, "settings": settings, "is_featured": featured, "sort_order": order, "categories": categories, "products": products, "quick_replies": replies})
}

func (s *Server) applyBusinessTemplate(ctx context.Context, tx pgx.Tx, storeID, templateSlug string) error {
	if strings.TrimSpace(templateSlug) == "" {
		templateSlug = "otro-negocio"
	}
	var templateID, engine string
	var settingsRaw []byte
	err := tx.QueryRow(ctx, `SELECT id,engine,settings FROM business_templates WHERE slug=$1 AND is_active=true`, templateSlug).Scan(&templateID, &engine, &settingsRaw)
	if err != nil && templateSlug != "otro-negocio" {
		templateSlug = "otro-negocio"
		err = tx.QueryRow(ctx, `SELECT id,engine,settings FROM business_templates WHERE slug=$1 AND is_active=true`, templateSlug).Scan(&templateID, &engine, &settingsRaw)
	}
	if err != nil {
		return err
	}
	settings := string(settingsRaw)
	_, err = tx.Exec(ctx, `UPDATE stores SET template_id=$2,business_engine=$3,template_config=$4::jsonb,
		primary_color=coalesce(nullif($4::jsonb->>'accent',''),primary_color),
		delivery_enabled=coalesce(($4::jsonb->>'delivery_enabled')::boolean,delivery_enabled),
		pickup_enabled=coalesce(($4::jsonb->>'pickup_enabled')::boolean,pickup_enabled),
		minimum_order=coalesce(($4::jsonb->>'minimum_order')::numeric,minimum_order),
		order_notice=coalesce(nullif($4::jsonb->>'order_notice',''),order_notice),
		visual_theme=coalesce(nullif($4::jsonb->>'visual_theme',''),'minimal-shop'),theme_config='{}'::jsonb,updated_at=now() WHERE id=$1`, storeID, templateID, engine, settings)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO categories(store_id,name,slug,description,sort_order,is_active)
		SELECT $1,name,slug,description,sort_order,true FROM template_categories WHERE template_id=$2 ORDER BY sort_order
		ON CONFLICT(store_id,slug) DO NOTHING`, storeID, templateID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO products(store_id,category_id,name,slug,description,image_url,price,stock,track_stock,variants,extras,attributes,is_featured,sort_order,is_active)
		SELECT $1,c.id,tp.name,tp.slug,tp.description,tp.image_url,tp.price,CASE WHEN tp.track_stock THEN 10 ELSE NULL END,tp.track_stock,tp.variants,tp.extras,tp.attributes,tp.is_featured,tp.sort_order,true
		FROM template_products tp LEFT JOIN categories c ON c.store_id=$1 AND c.slug=tp.category_slug
		WHERE tp.template_id=$2 ORDER BY tp.sort_order
		ON CONFLICT(store_id,slug) DO NOTHING`, storeID, templateID)
	if err != nil {
		return err
	}
	// Give demo categories a visual cover using the first product image. Merchants can replace it later.
	_, err = tx.Exec(ctx, `UPDATE categories c SET image_url=(
		SELECT p.image_url FROM products p
		WHERE p.store_id=c.store_id AND p.category_id=c.id AND coalesce(p.image_url,'')<>''
		ORDER BY p.is_featured DESC,p.sort_order,p.name LIMIT 1
	)
	WHERE c.store_id=$1 AND coalesce(c.image_url,'')=''
	AND EXISTS(SELECT 1 FROM products p WHERE p.store_id=c.store_id AND p.category_id=c.id AND coalesce(p.image_url,'')<>'')`, storeID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO store_attribute_groups(store_id,name,sort_order)
		SELECT $1,name,sort_order FROM template_attribute_groups WHERE template_id=$2
		ON CONFLICT(store_id,name) DO NOTHING`, storeID, templateID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO store_attributes(store_id,group_id,key,label,input_type,options,is_required,sort_order)
		SELECT $1,sg.id,ta.key,ta.label,ta.input_type,ta.options,ta.is_required,ta.sort_order
		FROM template_attributes ta
		LEFT JOIN template_attribute_groups tg ON tg.id=ta.group_id
		LEFT JOIN store_attribute_groups sg ON sg.store_id=$1 AND sg.name=tg.name
		WHERE ta.template_id=$2
		ON CONFLICT(store_id,key) DO NOTHING`, storeID, templateID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO quick_replies(store_id,title,body,sort_order)
		SELECT $1,title,message,sort_order FROM template_quick_replies WHERE template_id=$2`, storeID, templateID)
	return err
}

type adminTemplateInput struct {
	Name             string         `json:"name"`
	Slug             string         `json:"slug"`
	Family           string         `json:"family"`
	Description      string         `json:"description"`
	Icon             string         `json:"icon"`
	Engine           string         `json:"engine"`
	RecommendedStyle string         `json:"recommended_style"`
	Settings         map[string]any `json:"settings"`
	IsFeatured       bool           `json:"is_featured"`
	IsActive         bool           `json:"is_active"`
	SortOrder        int            `json:"sort_order"`
}

func (s *Server) adminTemplates(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT bt.id,bt.slug,bt.name,bt.family,coalesce(bt.description,''),coalesce(bt.icon,''),bt.engine,bt.recommended_style,bt.settings,bt.is_featured,bt.is_active,bt.sort_order,
		(SELECT count(*) FROM template_categories tc WHERE tc.template_id=bt.id),(SELECT count(*) FROM template_products tp WHERE tp.template_id=bt.id),(SELECT count(*) FROM template_quick_replies tr WHERE tr.template_id=bt.id)
		FROM business_templates bt ORDER BY bt.sort_order,bt.name`)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las plantillas")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, slug, name, family, desc, icon, engine, style string
		var raw []byte
		var featured, active bool
		var sortOrder, categories, products, replies int
		if rows.Scan(&id, &slug, &name, &family, &desc, &icon, &engine, &style, &raw, &featured, &active, &sortOrder, &categories, &products, &replies) != nil {
			continue
		}
		var settings any = map[string]any{}
		_ = json.Unmarshal(raw, &settings)
		out = append(out, map[string]any{"id": id, "slug": slug, "name": name, "family": family, "description": desc, "icon": icon, "engine": engine, "recommended_style": style, "settings": settings, "is_featured": featured, "is_active": active, "sort_order": sortOrder, "category_count": categories, "product_count": products, "reply_count": replies})
	}
	jsonOut(w, 200, out)
}

func (s *Server) adminCreateTemplate(w http.ResponseWriter, r *http.Request) {
	var in adminTemplateInput
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Nombre de plantilla obligatorio")
		return
	}
	if strings.TrimSpace(in.Slug) == "" {
		in.Slug = slugify(in.Name)
	} else {
		in.Slug = slugify(in.Slug)
	}
	if in.Family == "" {
		in.Family = "Otros"
	}
	if in.Engine == "" {
		in.Engine = "retail"
	}
	if in.RecommendedStyle == "" {
		in.RecommendedStyle = "Minimal"
	}
	if in.Settings == nil {
		in.Settings = map[string]any{"item_label": "producto", "item_label_plural": "productos", "primary_action": "Comprar", "delivery_enabled": true, "pickup_enabled": true}
	}
	raw, _ := json.Marshal(in.Settings)
	var id string
	err := s.db.QueryRow(r.Context(), `INSERT INTO business_templates(slug,name,family,description,icon,engine,recommended_style,settings,is_featured,is_active,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, in.Slug, strings.TrimSpace(in.Name), in.Family, in.Description, in.Icon, in.Engine, in.RecommendedStyle, raw, in.IsFeatured, in.IsActive, in.SortOrder).Scan(&id)
	if err != nil {
		jsonErr(w, 409, "Ya existe una plantilla con ese identificador")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id, "slug": in.Slug})
}

func (s *Server) adminUpdateTemplate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in adminTemplateInput
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Datos de plantilla inválidos")
		return
	}
	if strings.TrimSpace(in.Slug) == "" {
		in.Slug = slugify(in.Name)
	} else {
		in.Slug = slugify(in.Slug)
	}
	if in.Engine == "" {
		in.Engine = "retail"
	}
	if in.RecommendedStyle == "" {
		in.RecommendedStyle = "Minimal"
	}
	raw, _ := json.Marshal(in.Settings)
	cmd, err := s.db.Exec(r.Context(), `UPDATE business_templates SET slug=$1,name=$2,family=$3,description=$4,icon=$5,engine=$6,recommended_style=$7,settings=$8,is_featured=$9,is_active=$10,sort_order=$11,updated_at=now() WHERE id=$12`, in.Slug, strings.TrimSpace(in.Name), in.Family, in.Description, in.Icon, in.Engine, in.RecommendedStyle, raw, in.IsFeatured, in.IsActive, in.SortOrder, id)
	if err != nil || cmd.RowsAffected() == 0 {
		jsonErr(w, 409, "No se pudo actualizar la plantilla")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

type adminTemplateContentInput struct {
	Categories []struct {
		Name        string `json:"name"`
		Slug        string `json:"slug"`
		Description string `json:"description"`
		SortOrder   int    `json:"sort_order"`
	} `json:"categories"`
	Products []struct {
		CategorySlug string           `json:"category_slug"`
		Name         string           `json:"name"`
		Slug         string           `json:"slug"`
		Description  string           `json:"description"`
		Price        float64          `json:"price"`
		TrackStock   bool             `json:"track_stock"`
		Variants     []map[string]any `json:"variants"`
		Extras       []map[string]any `json:"extras"`
		Attributes   map[string]any   `json:"attributes"`
		IsFeatured   bool             `json:"is_featured"`
		SortOrder    int              `json:"sort_order"`
	} `json:"products"`
	Attributes []struct {
		GroupName  string   `json:"group_name"`
		Key        string   `json:"key"`
		Label      string   `json:"label"`
		InputType  string   `json:"input_type"`
		Options    []string `json:"options"`
		IsRequired bool     `json:"is_required"`
		SortOrder  int      `json:"sort_order"`
	} `json:"attributes"`
	QuickReplies []struct {
		Shortcut  string `json:"shortcut"`
		Title     string `json:"title"`
		Message   string `json:"message"`
		SortOrder int    `json:"sort_order"`
	} `json:"quick_replies"`
}

func (s *Server) adminTemplateContent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var exists int
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM business_templates WHERE id=$1`, id).Scan(&exists)
	if exists == 0 {
		jsonErr(w, 404, "Plantilla no encontrada")
		return
	}
	categories := []map[string]any{}
	cr, _ := s.db.Query(r.Context(), `SELECT name,slug,coalesce(description,''),sort_order FROM template_categories WHERE template_id=$1 ORDER BY sort_order,name`, id)
	if cr != nil {
		for cr.Next() {
			var name, slug, description string
			var sortOrder int
			if cr.Scan(&name, &slug, &description, &sortOrder) == nil {
				categories = append(categories, map[string]any{"name": name, "slug": slug, "description": description, "sort_order": sortOrder})
			}
		}
		cr.Close()
	}
	products := []map[string]any{}
	pr, _ := s.db.Query(r.Context(), `SELECT coalesce(category_slug,''),name,slug,coalesce(description,''),price,track_stock,variants,extras,attributes,is_featured,sort_order FROM template_products WHERE template_id=$1 ORDER BY sort_order,name`, id)
	if pr != nil {
		for pr.Next() {
			var categorySlug, name, slug, description string
			var price float64
			var trackStock, featured bool
			var variantsRaw, extrasRaw, attributesRaw []byte
			var sortOrder int
			if pr.Scan(&categorySlug, &name, &slug, &description, &price, &trackStock, &variantsRaw, &extrasRaw, &attributesRaw, &featured, &sortOrder) == nil {
				var variants, extras any = []any{}, []any{}
				var attributes any = map[string]any{}
				_ = json.Unmarshal(variantsRaw, &variants)
				_ = json.Unmarshal(extrasRaw, &extras)
				_ = json.Unmarshal(attributesRaw, &attributes)
				products = append(products, map[string]any{"category_slug": categorySlug, "name": name, "slug": slug, "description": description, "price": price, "track_stock": trackStock, "variants": variants, "extras": extras, "attributes": attributes, "is_featured": featured, "sort_order": sortOrder})
			}
		}
		pr.Close()
	}
	attributes := []map[string]any{}
	ar, _ := s.db.Query(r.Context(), `SELECT coalesce(g.name,''),a.key,a.label,a.input_type,a.options,a.is_required,a.sort_order FROM template_attributes a LEFT JOIN template_attribute_groups g ON g.id=a.group_id WHERE a.template_id=$1 ORDER BY coalesce(g.sort_order,0),a.sort_order,a.label`, id)
	if ar != nil {
		for ar.Next() {
			var groupName, key, label, inputType string
			var optionsRaw []byte
			var required bool
			var sortOrder int
			if ar.Scan(&groupName, &key, &label, &inputType, &optionsRaw, &required, &sortOrder) == nil {
				var options any = []any{}
				_ = json.Unmarshal(optionsRaw, &options)
				attributes = append(attributes, map[string]any{"group_name": groupName, "key": key, "label": label, "input_type": inputType, "options": options, "is_required": required, "sort_order": sortOrder})
			}
		}
		ar.Close()
	}
	replies := []map[string]any{}
	rr, _ := s.db.Query(r.Context(), `SELECT shortcut,title,message,sort_order FROM template_quick_replies WHERE template_id=$1 ORDER BY sort_order,title`, id)
	if rr != nil {
		for rr.Next() {
			var shortcut, title, message string
			var sortOrder int
			if rr.Scan(&shortcut, &title, &message, &sortOrder) == nil {
				replies = append(replies, map[string]any{"shortcut": shortcut, "title": title, "message": message, "sort_order": sortOrder})
			}
		}
		rr.Close()
	}
	jsonOut(w, 200, map[string]any{"categories": categories, "products": products, "attributes": attributes, "quick_replies": replies})
}

func (s *Server) adminUpdateTemplateContent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in adminTemplateContentInput
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Contenido de plantilla inválido")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar la plantilla")
		return
	}
	defer tx.Rollback(r.Context())
	var exists int
	if err = tx.QueryRow(r.Context(), `SELECT count(*) FROM business_templates WHERE id=$1`, id).Scan(&exists); err != nil || exists == 0 {
		jsonErr(w, 404, "Plantilla no encontrada")
		return
	}
	for _, table := range []string{"template_attributes", "template_attribute_groups", "template_products", "template_categories", "template_quick_replies"} {
		if _, err = tx.Exec(r.Context(), `DELETE FROM `+table+` WHERE template_id=$1`, id); err != nil {
			jsonErr(w, 500, "No se pudo limpiar el contenido anterior")
			return
		}
	}
	for i, c := range in.Categories {
		name := strings.TrimSpace(c.Name)
		if name == "" {
			continue
		}
		slug := slugify(firstNonEmpty(c.Slug, name))
		sortOrder := c.SortOrder
		if sortOrder <= 0 {
			sortOrder = (i + 1) * 10
		}
		if _, err = tx.Exec(r.Context(), `INSERT INTO template_categories(template_id,name,slug,description,sort_order) VALUES($1,$2,$3,$4,$5)`, id, name, slug, c.Description, sortOrder); err != nil {
			jsonErr(w, 409, "Hay categorías repetidas en la plantilla")
			return
		}
	}
	for i, prod := range in.Products {
		name := strings.TrimSpace(prod.Name)
		if name == "" {
			continue
		}
		slug := slugify(firstNonEmpty(prod.Slug, name))
		sortOrder := prod.SortOrder
		if sortOrder <= 0 {
			sortOrder = (i + 1) * 10
		}
		variants, _ := json.Marshal(prod.Variants)
		extras, _ := json.Marshal(prod.Extras)
		attrs, _ := json.Marshal(prod.Attributes)
		if _, err = tx.Exec(r.Context(), `INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,attributes,is_featured,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, id, prod.CategorySlug, name, slug, prod.Description, prod.Price, prod.TrackStock, variants, extras, attrs, prod.IsFeatured, sortOrder); err != nil {
			jsonErr(w, 409, "Hay ejemplos repetidos en la plantilla")
			return
		}
	}
	groupIDs := map[string]string{}
	groupOrder := 0
	for _, attr := range in.Attributes {
		groupName := strings.TrimSpace(attr.GroupName)
		if groupName == "" {
			groupName = "Detalles"
		}
		if _, ok := groupIDs[groupName]; !ok {
			groupOrder += 10
			var gid string
			if err = tx.QueryRow(r.Context(), `INSERT INTO template_attribute_groups(template_id,name,sort_order) VALUES($1,$2,$3) RETURNING id`, id, groupName, groupOrder).Scan(&gid); err != nil {
				jsonErr(w, 409, "No se pudo crear un grupo de campos")
				return
			}
			groupIDs[groupName] = gid
		}
		key := slugify(firstNonEmpty(attr.Key, attr.Label))
		key = strings.ReplaceAll(key, "-", "_")
		if key == "" || strings.TrimSpace(attr.Label) == "" {
			continue
		}
		inputType := attr.InputType
		if inputType != "text" && inputType != "number" && inputType != "select" {
			inputType = "text"
		}
		options, _ := json.Marshal(attr.Options)
		if _, err = tx.Exec(r.Context(), `INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, id, groupIDs[groupName], key, strings.TrimSpace(attr.Label), inputType, options, attr.IsRequired, attr.SortOrder); err != nil {
			jsonErr(w, 409, "Hay campos repetidos en la plantilla")
			return
		}
	}
	for i, reply := range in.QuickReplies {
		message := strings.TrimSpace(reply.Message)
		if message == "" {
			continue
		}
		shortcut := slugify(firstNonEmpty(reply.Shortcut, reply.Title))
		sortOrder := reply.SortOrder
		if sortOrder <= 0 {
			sortOrder = (i + 1) * 10
		}
		if _, err = tx.Exec(r.Context(), `INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order) VALUES($1,$2,$3,$4,$5)`, id, shortcut, strings.TrimSpace(reply.Title), message, sortOrder); err != nil {
			jsonErr(w, 409, "Hay respuestas rápidas repetidas")
			return
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la plantilla")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminDuplicateTemplate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var slug, name string
	if err := s.db.QueryRow(r.Context(), `SELECT slug,name FROM business_templates WHERE id=$1`, id).Scan(&slug, &name); err != nil {
		jsonErr(w, 404, "Plantilla no encontrada")
		return
	}
	newSlug := slugify(slug + "-copia-" + uuid.NewString()[:6])
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo duplicar la plantilla")
		return
	}
	defer tx.Rollback(r.Context())
	var newID string
	err = tx.QueryRow(r.Context(), `INSERT INTO business_templates(slug,name,family,description,icon,engine,recommended_style,settings,is_featured,is_active,sort_order)
		SELECT $2,name||' (copia)',family,description,icon,engine,recommended_style,settings,false,false,sort_order+1 FROM business_templates WHERE id=$1 RETURNING id`, id, newSlug).Scan(&newID)
	if err == nil {
		_, err = tx.Exec(r.Context(), `INSERT INTO template_categories(template_id,name,slug,description,sort_order) SELECT $2,name,slug,description,sort_order FROM template_categories WHERE template_id=$1`, id, newID)
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `INSERT INTO template_products(template_id,category_slug,name,slug,description,image_url,price,track_stock,variants,extras,attributes,is_featured,sort_order) SELECT $2,category_slug,name,slug,description,image_url,price,track_stock,variants,extras,attributes,is_featured,sort_order FROM template_products WHERE template_id=$1`, id, newID)
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `INSERT INTO template_attribute_groups(template_id,name,sort_order) SELECT $2,name,sort_order FROM template_attribute_groups WHERE template_id=$1`, id, newID)
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
			SELECT $2,ng.id,ta.key,ta.label,ta.input_type,ta.options,ta.is_required,ta.sort_order
			FROM template_attributes ta LEFT JOIN template_attribute_groups og ON og.id=ta.group_id
			LEFT JOIN template_attribute_groups ng ON ng.template_id=$2 AND ng.name=og.name WHERE ta.template_id=$1`, id, newID)
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order) SELECT $2,shortcut,title,message,sort_order FROM template_quick_replies WHERE template_id=$1`, id, newID)
	}
	if err != nil || tx.Commit(r.Context()) != nil {
		jsonErr(w, 500, "No se pudo duplicar la plantilla")
		return
	}
	jsonOut(w, 201, map[string]any{"id": newID, "slug": newSlug, "name": name + " (copia)"})
}

// --- WAMERCIO 2.2 central SaaS operations ------------------------------------

func (s *Server) auditPlatform(ctx context.Context, actorID, action, entityType, entityID string, metadata any) {
	body := []byte(`{}`)
	if metadata != nil {
		if raw, err := json.Marshal(metadata); err == nil {
			body = raw
		}
	}
	_, _ = s.db.Exec(ctx, `INSERT INTO platform_audit_log(actor_id,action,entity_type,entity_id,metadata) VALUES(nullif($1,'')::uuid,$2,$3,$4,$5::jsonb)`, actorID, action, entityType, entityID, string(body))
}

func (s *Server) platformSetting(ctx context.Context, key string) map[string]any {
	var raw []byte
	if err := s.db.QueryRow(ctx, `SELECT value FROM platform_settings WHERE key=$1`, key).Scan(&raw); err != nil {
		return map[string]any{}
	}
	var out map[string]any
	if json.Unmarshal(raw, &out) != nil || out == nil {
		return map[string]any{}
	}
	return out
}

func (s *Server) publicPlatformSettings(w http.ResponseWriter, r *http.Request) {
	access := s.platformSetting(r.Context(), "access")
	identity := s.platformSetting(r.Context(), "identity")
	identityEnabled, _ := identity["enabled"].(bool)
	requireOwnerVerification, _ := identity["require_owner_verification"].(bool)
	territory := s.platformSetting(r.Context(), "territory")
	territoryEnabled, _ := territory["enabled"].(bool)
	jsonOut(w, 200, map[string]any{
		"landing": s.platformSetting(r.Context(), "landing"),
		"general": s.platformSetting(r.Context(), "general"),
		"access": map[string]any{
			"owner_pin_length":              settingInt(access, "owner_pin_length", 4),
			"staff_pin_length":              settingInt(access, "staff_pin_length", 4),
			"customer_pin_length":           settingInt(access, "customer_pin_length", 4),
			"accepted_owner_pin_lengths":    s.acceptedOwnerPINLengths(r.Context()),
			"accepted_customer_pin_lengths": s.acceptedCustomerPINLengths(r.Context()),
		},
		"identity": map[string]any{
			"enabled":                    identityEnabled,
			"require_owner_verification": requireOwnerVerification,
		},
		"territory": map[string]any{
			"enabled": territoryEnabled,
		},
	})
}

func (s *Server) publicLegalSettings(w http.ResponseWriter, r *http.Request) {
	legal := s.platformSetting(r.Context(), "legal")
	jsonOut(w, 200, map[string]any{
		"responsible_entity": legal["responsible_entity"],
		"version":            legal["version"],
		"effective_date":     legal["effective_date"],
		"jurisdiction":       legal["jurisdiction"],
		"contact_email":      legal["contact_email"],
		"terms_text":         legal["terms_text"],
		"privacy_text":       legal["privacy_text"],
	})
}

func (s *Server) adminLandingSettings(w http.ResponseWriter, r *http.Request) {
	jsonOut(w, 200, s.platformSetting(r.Context(), "landing"))
}

func (s *Server) adminUpdateLandingSettings(w http.ResponseWriter, r *http.Request) {
	var in map[string]any
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Configuración inválida")
		return
	}
	body, _ := json.Marshal(in)
	c := claims(r)
	_, err := s.db.Exec(r.Context(), `INSERT INTO platform_settings(key,value,updated_by,updated_at) VALUES('landing',$1::jsonb,$2,now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=now()`, string(body), c.UserID)
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar la página comercial")
		return
	}
	s.auditPlatform(r.Context(), c.UserID, "platform.landing.updated", "platform_setting", "landing", nil)
	jsonOut(w, 200, in)
}

var platformSettingKeys = []string{"general", "territory", "business_types", "domains", "database", "whatsapp", "notifications", "access", "identity", "legal", "backups"}

var platformSecretFields = map[string][]string{
	"territory": {"api_key"},
	"identity":  {"api_key"},
	"backups":   {"r2_secret_access_key", "restic_password"},
}

func platformSettingAllowed(key string) bool {
	for _, candidate := range platformSettingKeys {
		if key == candidate {
			return true
		}
	}
	return false
}

func (s *Server) platformSecretKey() []byte {
	sum := sha256.Sum256([]byte(strings.TrimSpace(s.cfg.PlatformConfigSecret)))
	return sum[:]
}

func (s *Server) encryptPlatformSecret(value string) (string, error) {
	if strings.TrimSpace(s.cfg.PlatformConfigSecret) == "" {
		return "", fmt.Errorf("PLATFORM_CONFIG_SECRET no configurado")
	}
	block, err := aes.NewCipher(s.platformSecretKey())
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nil, nonce, []byte(value), nil)
	payload := append(nonce, sealed...)
	return base64.RawStdEncoding.EncodeToString(payload), nil
}

func (s *Server) decryptPlatformSecret(value string) (string, error) {
	if strings.TrimSpace(s.cfg.PlatformConfigSecret) == "" {
		return "", fmt.Errorf("PLATFORM_CONFIG_SECRET no configurado")
	}
	payload, err := base64.RawStdEncoding.DecodeString(value)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(s.platformSecretKey())
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil || len(payload) < gcm.NonceSize() {
		return "", fmt.Errorf("secreto inválido")
	}
	plain, err := gcm.Open(nil, payload[:gcm.NonceSize()], payload[gcm.NonceSize():], nil)
	return string(plain), err
}

func (s *Server) platformSecretConfigured(ctx context.Context, key string) bool {
	var exists bool
	_ = s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM platform_secrets WHERE key=$1)`, key).Scan(&exists)
	return exists
}

func (s *Server) readPlatformSecret(ctx context.Context, key string) string {
	var encrypted string
	if s.db.QueryRow(ctx, `SELECT ciphertext FROM platform_secrets WHERE key=$1`, key).Scan(&encrypted) != nil {
		return ""
	}
	plain, err := s.decryptPlatformSecret(encrypted)
	if err != nil {
		return ""
	}
	return plain
}

func (s *Server) storePlatformSecret(ctx context.Context, actorID, key, value string) error {
	encrypted, err := s.encryptPlatformSecret(value)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(ctx, `INSERT INTO platform_secrets(key,ciphertext,updated_by,updated_at) VALUES($1,$2,$3,now()) ON CONFLICT(key) DO UPDATE SET ciphertext=excluded.ciphertext,updated_by=excluded.updated_by,updated_at=now()`, key, encrypted, actorID)
	return err
}

func (s *Server) decoratedPlatformSetting(ctx context.Context, key string) map[string]any {
	value := s.platformSetting(ctx, key)
	for _, field := range platformSecretFields[key] {
		delete(value, field)
		value[field+"_configured"] = s.platformSecretConfigured(ctx, key+"."+field)
	}
	if key == "domains" {
		platform := normalizeHostname(s.cfg.PlatformDomain)
		if platform == "" {
			platform = "wamercio.com"
		}
		tenant := normalizeHostname(s.cfg.TenantRootDomain)
		if tenant == "" {
			tenant = "ltd.do"
		}
		value["route_mode"] = "host"
		value["platform_domain"] = platform
		value["tenant_domain"] = tenant
		value["runtime_app_url"] = "https://" + platform
		value["public_url_format"] = "https://{slug}." + tenant
		value["custom_domains_enabled"] = true
		value["custom_domain_cname_target"] = normalizeHostname(s.cfg.CustomDomainCNAMETarget)
	}
	return value
}

func (s *Server) adminPlatformSettings(w http.ResponseWriter, r *http.Request) {
	out := map[string]any{}
	for _, key := range platformSettingKeys {
		out[key] = s.decoratedPlatformSetting(r.Context(), key)
	}
	jsonOut(w, 200, out)
}

func (s *Server) savePlatformSetting(ctx context.Context, actorID, key string, in map[string]any) (map[string]any, error) {
	if !platformSettingAllowed(key) {
		return nil, fmt.Errorf("sección no permitida")
	}
	if key == "domains" {
		in["route_mode"] = "host"
		in["platform_domain"] = normalizeHostname(s.cfg.PlatformDomain)
		in["tenant_domain"] = normalizeHostname(s.cfg.TenantRootDomain)
		in["custom_domains_enabled"] = true
		in["custom_domain_cname_target"] = normalizeHostname(s.cfg.CustomDomainCNAMETarget)
		in["force_https"] = true
		delete(in, "runtime_app_url")
		delete(in, "public_url_format")
	}
	if key == "access" {
		current := s.platformSetting(ctx, "access")
		previousLength := settingInt(current, "owner_pin_length", 4)
		nextLength := settingInt(in, "owner_pin_length", previousLength)
		legacy := pinLengthsFromSetting(current["legacy_owner_pin_lengths"])
		legacy = append(legacy, pinLengthsFromSetting(in["legacy_owner_pin_lengths"])...)
		if previousLength >= 4 && previousLength <= 8 && nextLength != previousLength {
			legacy = append(legacy, previousLength)
		}
		seen := map[int]bool{}
		normalized := make([]int, 0, len(legacy))
		for _, n := range legacy {
			if n < 4 || n > 8 || n == nextLength || seen[n] {
				continue
			}
			seen[n] = true
			normalized = append(normalized, n)
		}
		sort.Ints(normalized)
		in["legacy_owner_pin_lengths"] = normalized

		previousCustomerLength := settingInt(current, "customer_pin_length", 4)
		nextCustomerLength := settingInt(in, "customer_pin_length", previousCustomerLength)
		customerLegacy := pinLengthsFromSetting(current["legacy_customer_pin_lengths"])
		customerLegacy = append(customerLegacy, pinLengthsFromSetting(in["legacy_customer_pin_lengths"])...)
		if previousCustomerLength >= 4 && previousCustomerLength <= 8 && nextCustomerLength != previousCustomerLength {
			customerLegacy = append(customerLegacy, previousCustomerLength)
		}
		seenCustomer := map[int]bool{}
		normalizedCustomer := make([]int, 0, len(customerLegacy))
		for _, n := range customerLegacy {
			if n < 4 || n > 8 || n == nextCustomerLength || seenCustomer[n] {
				continue
			}
			seenCustomer[n] = true
			normalizedCustomer = append(normalizedCustomer, n)
		}
		sort.Ints(normalizedCustomer)
		in["legacy_customer_pin_lengths"] = normalizedCustomer
	}
	for _, field := range platformSecretFields[key] {
		configuredField := field + "_configured"
		delete(in, configuredField)
		if clear, _ := in[field+"_clear"].(bool); clear {
			_, _ = s.db.Exec(ctx, `DELETE FROM platform_secrets WHERE key=$1`, key+"."+field)
		}
		delete(in, field+"_clear")
		if raw, ok := in[field]; ok {
			if secret, ok := raw.(string); ok && strings.TrimSpace(secret) != "" {
				if err := s.storePlatformSecret(ctx, actorID, key+"."+field, strings.TrimSpace(secret)); err != nil {
					return nil, err
				}
			}
			delete(in, field)
		}
	}
	body, _ := json.Marshal(in)
	if _, err := s.db.Exec(ctx, `INSERT INTO platform_settings(key,value,updated_by,updated_at) VALUES($1,$2::jsonb,$3,now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=now()`, key, string(body), actorID); err != nil {
		return nil, err
	}
	s.auditPlatform(ctx, actorID, "platform.settings."+key+".updated", "platform_setting", key, nil)
	return s.decoratedPlatformSetting(ctx, key), nil
}

func (s *Server) adminUpdatePlatformSetting(w http.ResponseWriter, r *http.Request) {
	key := chi.URLParam(r, "key")
	if !platformSettingAllowed(key) {
		jsonErr(w, 404, "Sección de configuración no encontrada")
		return
	}
	var in map[string]any
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Configuración inválida")
		return
	}
	out, err := s.savePlatformSetting(r.Context(), claims(r).UserID, key, in)
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar la configuración: "+err.Error())
		return
	}
	jsonOut(w, 200, out)
}

func (s *Server) adminUpdatePlatformSettings(w http.ResponseWriter, r *http.Request) {
	var in map[string]map[string]any
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Configuración inválida")
		return
	}
	out := map[string]any{}
	for _, key := range platformSettingKeys {
		value, ok := in[key]
		if !ok {
			continue
		}
		saved, err := s.savePlatformSetting(r.Context(), claims(r).UserID, key, value)
		if err != nil {
			jsonErr(w, 500, "No se pudo guardar la configuración")
			return
		}
		out[key] = saved
	}
	jsonOut(w, 200, out)
}

func (s *Server) adminDatabaseStatus(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
	defer cancel()
	started := time.Now()
	if err := s.db.Ping(ctx); err != nil {
		jsonOut(w, 200, map[string]any{"connected": false, "message": "PostgreSQL no respondió"})
		return
	}
	var version, database string
	var size int64
	var connections, stores, customers, orders, migration int
	_ = s.db.QueryRow(ctx, `SHOW server_version`).Scan(&version)
	_ = s.db.QueryRow(ctx, `SELECT current_database()`).Scan(&database)
	_ = s.db.QueryRow(ctx, `SELECT pg_database_size(current_database())`).Scan(&size)
	_ = s.db.QueryRow(ctx, `SELECT count(*)::int FROM pg_stat_activity WHERE datname=current_database()`).Scan(&connections)
	_ = s.db.QueryRow(ctx, `SELECT count(*)::int FROM stores`).Scan(&stores)
	_ = s.db.QueryRow(ctx, `SELECT count(*)::int FROM customers`).Scan(&customers)
	_ = s.db.QueryRow(ctx, `SELECT count(*)::int FROM orders`).Scan(&orders)
	_ = s.db.QueryRow(ctx, `SELECT coalesce(max(version),0)::int FROM schema_migrations WHERE dirty=false`).Scan(&migration)
	jsonOut(w, 200, map[string]any{"connected": true, "engine": "PostgreSQL", "version": version, "database": database, "size_bytes": size, "connections": connections, "stores": stores, "customers": customers, "orders": orders, "migration_version": migration, "latency_ms": time.Since(started).Milliseconds(), "isolation": "Aislamiento lógico por negocio"})
}

func settingString(m map[string]any, key, fallback string) string {
	if v, ok := m[key].(string); ok && strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	return fallback
}

func settingInt(m map[string]any, key string, fallback int) int {
	switch v := m[key].(type) {
	case float64:
		return int(v)
	case int:
		return v
	}
	return fallback
}

func (s *Server) renderPlatformNotification(ctx context.Context, key, fallback string, values map[string]string) string {
	template := settingString(s.platformSetting(ctx, "notifications"), key, fallback)
	for name, value := range values {
		template = strings.ReplaceAll(template, "{"+name+"}", value)
	}
	return strings.TrimSpace(template)
}

func (s *Server) verifyIdentityDocument(ctx context.Context, subjectType, document string) (map[string]any, int, error) {
	cfg := s.platformSetting(ctx, "identity")
	subjectType = strings.ToLower(strings.TrimSpace(subjectType))
	document = regexp.MustCompile(`\D+`).ReplaceAllString(document, "")
	if subjectType == "" {
		if len(document) == 9 {
			subjectType = "empresa"
		} else {
			subjectType = "persona"
		}
	}
	if subjectType != "persona" && subjectType != "empresa" {
		return nil, 0, fmt.Errorf("selecciona persona o empresa")
	}
	if (subjectType == "persona" && len(document) != 11) || (subjectType == "empresa" && len(document) != 9 && len(document) != 11) {
		return nil, 0, fmt.Errorf("la cédula debe tener 11 dígitos y el RNC 9 u 11 dígitos")
	}
	apiKey := s.readPlatformSecret(ctx, "identity.api_key")
	if strings.TrimSpace(apiKey) == "" {
		return nil, 0, fmt.Errorf("configura la API Key de Identidad Dominicana")
	}
	baseURL := strings.TrimRight(settingString(cfg, "base_url", "https://id.ltd.do"), "/")
	target := baseURL + "/api/v1/identidad/verificar"
	payload, _ := json.Marshal(map[string]any{"tipo_sujeto": subjectType, "documento": document, "contexto": "verificacion_propietario"})
	timeout := time.Duration(settingInt(cfg, "timeout_seconds", 12)) * time.Second
	if timeout < 2*time.Second || timeout > 60*time.Second {
		timeout = 12 * time.Second
	}
	requestCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(requestCtx, http.MethodPost, target, bytes.NewReader(payload))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-API-Key", apiKey)
	if clientID := settingString(cfg, "client_id", "wamercio"); clientID != "" {
		req.Header.Set("X-Client-ID", clientID)
	}
	if appURL, parseErr := url.Parse(s.cfg.AppURL); parseErr == nil && appURL.Hostname() != "" {
		req.Header.Set("X-Application-Domain", appURL.Hostname())
	}
	req.Header.Set("X-Usage-Context", "verificacion_propietario")
	resp, err := (&http.Client{Timeout: timeout}).Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("Identidad Dominicana no respondió: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var envelope map[string]any
	_ = json.Unmarshal(body, &envelope)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		message := fmt.Sprintf("Identidad Dominicana respondió HTTP %d", resp.StatusCode)
		if rawErr, ok := envelope["error"].(map[string]any); ok {
			if text, _ := rawErr["message"].(string); strings.TrimSpace(text) != "" {
				message = strings.TrimSpace(text)
			}
		}
		return envelope, resp.StatusCode, fmt.Errorf("%s", message)
	}
	if success, ok := envelope["success"].(bool); ok && !success {
		return envelope, resp.StatusCode, fmt.Errorf("Identidad Dominicana no pudo validar el documento")
	}
	result := envelope
	if data, ok := envelope["data"].(map[string]any); ok {
		result = data
	} else if data, ok := envelope["result"].(map[string]any); ok {
		result = data
	}
	valid, _ := result["valida"].(bool)
	found, _ := result["encontrada"].(bool)
	canRegister, _ := result["puede_registrarse"].(bool)
	if !valid || !found || !canRegister {
		reason, _ := result["motivo"].(string)
		reason = strings.TrimSpace(reason)
		if reason == "" {
			switch {
			case !valid:
				reason = "el documento no es válido"
			case !found:
				reason = "el documento no fue encontrado"
			default:
				reason = "el documento no está habilitado para registro"
			}
		}
		return envelope, resp.StatusCode, fmt.Errorf("%s", reason)
	}
	return envelope, resp.StatusCode, nil
}

func awsHMAC(key []byte, value string) []byte {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(value))
	return mac.Sum(nil)
}

func signR2Request(req *http.Request, accessKey, secretKey string, at time.Time) error {
	accessKey = strings.TrimSpace(accessKey)
	secretKey = strings.TrimSpace(secretKey)
	if accessKey == "" || secretKey == "" {
		return fmt.Errorf("credenciales de R2 incompletas")
	}
	at = at.UTC()
	amzDate := at.Format("20060102T150405Z")
	shortDate := at.Format("20060102")
	emptyHash := sha256.Sum256(nil)
	payloadHash := hex.EncodeToString(emptyHash[:])
	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	canonicalURI := req.URL.EscapedPath()
	if canonicalURI == "" {
		canonicalURI = "/"
	}
	canonicalQuery := req.URL.Query().Encode()
	canonicalHeaders := "host:" + req.URL.Host + "\n" +
		"x-amz-content-sha256:" + payloadHash + "\n" +
		"x-amz-date:" + amzDate + "\n"
	signedHeaders := "host;x-amz-content-sha256;x-amz-date"
	canonicalRequest := req.Method + "\n" + canonicalURI + "\n" + canonicalQuery + "\n" + canonicalHeaders + "\n" + signedHeaders + "\n" + payloadHash
	requestHash := sha256.Sum256([]byte(canonicalRequest))
	scope := shortDate + "/auto/s3/aws4_request"
	stringToSign := "AWS4-HMAC-SHA256\n" + amzDate + "\n" + scope + "\n" + hex.EncodeToString(requestHash[:])
	dateKey := awsHMAC([]byte("AWS4"+secretKey), shortDate)
	regionKey := awsHMAC(dateKey, "auto")
	serviceKey := awsHMAC(regionKey, "s3")
	signingKey := awsHMAC(serviceKey, "aws4_request")
	signature := hex.EncodeToString(awsHMAC(signingKey, stringToSign))
	req.Header.Set("Authorization", "AWS4-HMAC-SHA256 Credential="+accessKey+"/"+scope+", SignedHeaders="+signedHeaders+", Signature="+signature)
	return nil
}

func (s *Server) adminTestPlatformIntegration(w http.ResponseWriter, r *http.Request) {
	kind := chi.URLParam(r, "kind")
	if kind != "territory" && kind != "identity" && kind != "backups" {
		jsonErr(w, 404, "Integración no encontrada")
		return
	}
	cfg := s.platformSetting(r.Context(), kind)
	var target string
	var req *http.Request
	var err error
	timeout := time.Duration(settingInt(cfg, "timeout_seconds", 12)) * time.Second
	if timeout < 2*time.Second || timeout > 60*time.Second {
		timeout = 12 * time.Second
	}
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()

	if kind == "identity" {
		var input struct {
			SubjectType string `json:"subject_type"`
			Document    string `json:"document"`
		}
		if decode(r, &input) != nil {
			jsonErr(w, 400, "Indica una cédula o RNC para realizar la prueba")
			return
		}
		started := time.Now()
		envelope, status, verifyErr := s.verifyIdentityDocument(ctx, input.SubjectType, input.Document)
		out := map[string]any{"ok": verifyErr == nil, "status": status, "latency_ms": time.Since(started).Milliseconds(), "message": "Identidad Dominicana respondió correctamente"}
		if data, exists := envelope["data"]; exists {
			out["result"] = data
		} else if data, exists := envelope["result"]; exists {
			out["result"] = data
		}
		if meta, exists := envelope["meta"]; exists {
			out["meta"] = meta
		}
		if verifyErr != nil {
			out["message"] = verifyErr.Error()
		}
		jsonOut(w, 200, out)
		return
	}

	if kind == "backups" {
		target = strings.TrimRight(settingString(cfg, "r2_endpoint", ""), "/")
		if target == "" {
			account := settingString(cfg, "r2_account_id", "")
			if account != "" {
				target = "https://" + account + ".r2.cloudflarestorage.com"
			}
		}
		bucket := settingString(cfg, "r2_bucket", "")
		accessKey := settingString(cfg, "r2_access_key_id", "")
		secretKey := s.readPlatformSecret(r.Context(), "backups.r2_secret_access_key")
		if target == "" || bucket == "" {
			jsonErr(w, 400, "Configura endpoint y bucket de Cloudflare R2")
			return
		}
		if accessKey == "" || secretKey == "" {
			jsonErr(w, 400, "Configura Access Key ID y Secret Access Key de Cloudflare R2")
			return
		}
		bucketURL := target + "/" + url.PathEscape(bucket)
		req, err = http.NewRequestWithContext(ctx, http.MethodHead, bucketURL, nil)
		if err == nil {
			err = signR2Request(req, accessKey, secretKey, time.Now())
		}
	} else {
		target = strings.TrimRight(settingString(cfg, "base_url", ""), "/")
		if target == "" {
			jsonErr(w, 400, "Configura la URL de la integración")
			return
		}
		healthPath := settingString(cfg, "health_path", "/api/v1/territories/health")
		if !strings.HasPrefix(healthPath, "/") {
			healthPath = "/" + healthPath
		}
		target += healthPath
		req, err = http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
		if err == nil {
			if secret := s.readPlatformSecret(r.Context(), "territory.api_key"); secret != "" {
				req.Header.Set("X-API-Key", secret)
			}
		}
	}
	if err != nil {
		jsonErr(w, 400, "No se pudo preparar la prueba")
		return
	}
	started := time.Now()
	resp, err := (&http.Client{Timeout: timeout}).Do(req)
	if err != nil {
		jsonOut(w, 200, map[string]any{"ok": false, "target": target, "message": "No se pudo conectar: " + err.Error()})
		return
	}
	defer resp.Body.Close()
	ok := resp.StatusCode >= 200 && resp.StatusCode < 400
	message := "Conexión correcta"
	out := map[string]any{"ok": ok, "status": resp.StatusCode, "latency_ms": time.Since(started).Milliseconds(), "target": target}
	if !ok && message == "Conexión correcta" {
		switch resp.StatusCode {
		case http.StatusUnauthorized, http.StatusForbidden:
			message = "La integración respondió, pero rechazó las credenciales o permisos"
		case http.StatusNotFound:
			message = "La integración respondió, pero el recurso configurado no existe"
		default:
			message = fmt.Sprintf("La integración respondió con HTTP %d", resp.StatusCode)
		}
	}
	out["message"] = message
	jsonOut(w, 200, out)
}

func (s *Server) adminCreateOwner(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name                   string `json:"name"`
		LastName               string `json:"last_name"`
		Phone                  string `json:"phone"`
		PIN                    string `json:"pin"`
		DocumentNumber         string `json:"document_number"`
		BirthDate              string `json:"birth_date"`
		Gender                 string `json:"gender"`
		Status                 string `json:"status"`
		PlanID                 string `json:"plan_id"`
		BusinessName           string `json:"business_name"`
		TemplateSlug           string `json:"template_slug"`
		BusinessWhatsApp       string `json:"business_whatsapp"`
		BusinessStatus         string `json:"business_status"`
		BusinessRNC            string `json:"business_rnc"`
		BusinessLegalName      string `json:"business_legal_name"`
		BusinessCommercialName string `json:"business_commercial_name"`
		ProvinceCode           string `json:"province_code"`
		Province               string `json:"province"`
		CityID                 string `json:"city_id"`
		Municipality           string `json:"municipality"`
		NeighborhoodID         string `json:"neighborhood_id"`
		Neighborhood           string `json:"neighborhood"`
		Street                 string `json:"street"`
		StreetNumber           string `json:"street_number"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	name := strings.TrimSpace(in.Name)
	lastName := strings.TrimSpace(in.LastName)
	phone := normalizePhone(in.Phone)
	pinOK, pinLength := s.validPINFor(r.Context(), "owner", in.PIN)
	if name == "" || phone == "" || !pinOK {
		jsonErr(w, 400, fmt.Sprintf("Nombre, WhatsApp y PIN de %d dígitos son obligatorios", pinLength))
		return
	}
	if _, err := s.validateOwnerWhatsAppForSave(r.Context(), phone); err != nil {
		jsonErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	status := normalizeOwnerStatus(in.Status)
	document := digitsOnly(in.DocumentNumber)
	if len(document) != 11 {
		jsonErr(w, 400, "La Cédula es obligatoria y debe tener exactamente 11 dígitos")
		return
	}
	identity := s.platformSetting(r.Context(), "identity")
	requireIdentity, _ := identity["require_owner_verification"].(bool)
	identityEnabled, _ := identity["enabled"].(bool)
	var verifiedAt any
	if requireIdentity && document == "" {
		jsonErr(w, 422, "La Cédula es obligatoria para crear propietarios")
		return
	}
	if document != "" && identityEnabled {
		if _, _, err := s.verifyIdentityDocument(r.Context(), "persona", document); err != nil {
			jsonErr(w, 422, "No pudimos verificar la Cédula: "+err.Error())
			return
		}
		verifiedAt = time.Now()
	} else if requireIdentity {
		jsonErr(w, 503, "La verificación de Cédula es obligatoria, pero la integración está deshabilitada")
		return
	}
	var exists bool
	if err := s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM users WHERE role='owner' AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=$1)`, phone).Scan(&exists); err != nil {
		jsonErr(w, 500, "No se pudo verificar el propietario")
		return
	}
	if exists {
		jsonErr(w, 409, "Ya existe un propietario con ese WhatsApp")
		return
	}
	if document != "" {
		_ = s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM users WHERE role='owner' AND document_type='persona' AND document_number=$1)`, document).Scan(&exists)
		if exists {
			jsonErr(w, 409, "Ya existe un propietario con esa Cédula")
			return
		}
	}

	businessName := strings.TrimSpace(in.BusinessName)
	business := adminBusinessInput{
		Name: businessName, TemplateSlug: in.TemplateSlug, WhatsApp: in.BusinessWhatsApp, Status: in.BusinessStatus,
		RNC: in.BusinessRNC, LegalName: in.BusinessLegalName, CommercialName: in.BusinessCommercialName,
		ProvinceCode: in.ProvinceCode, Province: in.Province, CityID: in.CityID, Municipality: in.Municipality,
		NeighborhoodID: in.NeighborhoodID, Neighborhood: in.Neighborhood, Street: in.Street, StreetNumber: in.StreetNumber,
	}
	var businessRNC, businessLegalName, businessCommercialName string
	var businessRNCVerifiedAt any
	if businessName != "" {
		var err error
		businessRNC, businessLegalName, businessCommercialName, businessRNCVerifiedAt, err = s.prepareBusinessIdentity(r.Context(), business, "", false)
		if err != nil {
			jsonErr(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(in.PIN), bcrypt.DefaultCost)
	if err != nil {
		jsonErr(w, 500, "No se pudo proteger el PIN")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo crear el propietario")
		return
	}
	defer tx.Rollback(r.Context())
	var ownerID string
	if err = tx.QueryRow(r.Context(), `INSERT INTO users(name,last_name,email,phone,password_hash,pin_hash,pin_changed_at,role,status,document_type,document_number,birth_date,gender,identity_verified_at,whatsapp_verified_at) VALUES($1,$2,NULL,$3,NULL,$4,now(),'owner',$5,CASE WHEN nullif($6,'') IS NULL THEN NULL ELSE 'persona' END,nullif($6,''),nullif($7,'')::date,nullif($8,''),$9,now()) RETURNING id`, name, lastName, phone, string(hash), status, document, strings.TrimSpace(in.BirthDate), normalizeOwnerGender(in.Gender), verifiedAt).Scan(&ownerID); err != nil {
		jsonErr(w, 409, "No se pudo crear el propietario")
		return
	}
	planID := strings.TrimSpace(in.PlanID)
	if planID == "" {
		general := s.platformSetting(r.Context(), "general")
		defaultPlan := "emprende"
		if v, ok := general["default_plan"].(string); ok && strings.TrimSpace(v) != "" {
			defaultPlan = strings.TrimSpace(v)
		}
		_ = tx.QueryRow(r.Context(), `SELECT id FROM plans WHERE slug=$1 AND is_active=true LIMIT 1`, defaultPlan).Scan(&planID)
	} else {
		var active bool
		if tx.QueryRow(r.Context(), `SELECT is_active FROM plans WHERE id=$1`, planID).Scan(&active) != nil || !active {
			jsonErr(w, 404, "Plan no disponible")
			return
		}
	}
	if planID != "" {
		_, _ = tx.Exec(r.Context(), `INSERT INTO subscriptions(user_id,plan_id,status) VALUES($1,$2,'active') ON CONFLICT(user_id) DO UPDATE SET plan_id=excluded.plan_id,status='active',starts_at=now(),ends_at=NULL`, ownerID, planID)
	}
	var storeID string
	if businessName != "" {
		slug := s.safeStoreSlugFor(r.Context(), businessName)
		businessWhatsApp := normalizePhone(in.BusinessWhatsApp)
		if businessWhatsApp == "" {
			businessWhatsApp = phone
		}
		businessActive := normalizeBusinessStatus(in.BusinessStatus) == "active"
		address := businessAddress(business)
		if err = tx.QueryRow(r.Context(), `INSERT INTO stores(user_id,name,slug,phone,whatsapp,is_active,address,rnc,legal_name,commercial_name,rnc_verified_at,province_code,province,city_id,municipality,neighborhood_id,neighborhood,street,street_number) VALUES($1,$2,$3,NULL,$4,$5,nullif($6,''),nullif($7,''),nullif($8,''),nullif($9,''),$10,nullif($11,''),nullif($12,''),nullif($13,''),nullif($14,''),nullif($15,''),nullif($16,''),nullif($17,''),nullif($18,'')) RETURNING id`, ownerID, businessName, slug, businessWhatsApp, businessActive, address, businessRNC, businessLegalName, businessCommercialName, businessRNCVerifiedAt, strings.TrimSpace(in.ProvinceCode), strings.TrimSpace(in.Province), strings.TrimSpace(in.CityID), strings.TrimSpace(in.Municipality), strings.TrimSpace(in.NeighborhoodID), strings.TrimSpace(in.Neighborhood), strings.TrimSpace(in.Street), strings.TrimSpace(in.StreetNumber)).Scan(&storeID); err != nil {
			jsonErr(w, 409, "No se pudo crear el negocio; verifica el nombre o RNC")
			return
		}
		if err = s.applyBusinessTemplate(r.Context(), tx, storeID, in.TemplateSlug); err != nil {
			jsonErr(w, 500, "No se pudo preparar el negocio")
			return
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar el propietario")
		return
	}
	c := claims(r)
	s.auditPlatform(r.Context(), c.UserID, "owner.created", "owner", ownerID, map[string]any{"business_id": storeID, "document_type": "persona", "identity_verified": verifiedAt != nil, "whatsapp_verified": true, "rnc_verified": businessRNCVerifiedAt != nil})
	jsonOut(w, 201, map[string]any{"id": ownerID, "store_id": storeID, "ok": true})
}

func (s *Server) adminOwners(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT u.id,u.name,coalesce(u.last_name,''),coalesce(u.phone,''),u.status,u.created_at,count(st.id)::int,coalesce(string_agg(st.name,' · ' ORDER BY st.created_at),''),coalesce(u.document_type,''),coalesce(u.document_number,''),u.identity_verified_at IS NOT NULL FROM users u LEFT JOIN stores st ON st.user_id=u.id WHERE u.role='owner' GROUP BY u.id ORDER BY u.created_at DESC`)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los propietarios")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, lastName, phone, status, stores, docType, document string
		var created time.Time
		var count int
		var identityVerified bool
		if rows.Scan(&id, &name, &lastName, &phone, &status, &created, &count, &stores, &docType, &document, &identityVerified) == nil {
			fullName := strings.TrimSpace(strings.TrimSpace(name) + " " + strings.TrimSpace(lastName))
			out = append(out, map[string]any{"id": id, "name": name, "last_name": lastName, "full_name": fullName, "phone": phone, "status": status, "created_at": created, "store_count": count, "stores": stores, "document_type": docType, "document_number": document, "identity_verified": identityVerified})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) adminGlobalCustomers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `
		SELECT
			g.id,
			g.phone,
			g.name,
			coalesce(g.last_name,''),
			coalesce(g.national_id,''),
			coalesce(g.status,'active'),
			g.identity_verified_at IS NOT NULL,
			g.whatsapp_verified_at IS NOT NULL,
			coalesce(g.whatsapp_name,''),
			coalesce(g.profile_picture_url,''),
			(SELECT count(DISTINCT c.store_id)::int FROM customers c WHERE c.global_customer_id=g.id),
			(SELECT count(c.id)::int FROM customers c WHERE c.global_customer_id=g.id),
			(SELECT coalesce(sum(c.order_count),0)::int FROM customers c WHERE c.global_customer_id=g.id),
			(SELECT coalesce(sum(c.total_spent),0) FROM customers c WHERE c.global_customer_id=g.id),
			(SELECT max(c.last_order_at) FROM customers c WHERE c.global_customer_id=g.id),
			(SELECT count(a.id)::int FROM customer_addresses a WHERE a.global_customer_id=g.id),
			g.updated_at
		FROM global_customers g
		ORDER BY g.updated_at DESC`)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los clientes globales")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, phone, name, lastName, nationalID, status, whatsappName, profilePictureURL string
		var identityVerified, whatsappVerified bool
		var stores, records, orders, addressCount int
		var spent float64
		var last *time.Time
		var updated time.Time
		if rows.Scan(&id, &phone, &name, &lastName, &nationalID, &status, &identityVerified, &whatsappVerified, &whatsappName, &profilePictureURL, &stores, &records, &orders, &spent, &last, &addressCount, &updated) == nil {
			fullName := strings.TrimSpace(strings.TrimSpace(name) + " " + strings.TrimSpace(lastName))
			out = append(out, map[string]any{
				"id":                  id,
				"phone":               phone,
				"name":                name,
				"last_name":           lastName,
				"full_name":           fullName,
				"national_id":         nationalID,
				"status":              status,
				"identity_verified":   identityVerified,
				"whatsapp_verified":   whatsappVerified,
				"whatsapp_name":       whatsappName,
				"profile_picture_url": profilePictureURL,
				"businesses":          stores,
				"records":             records,
				"orders":              orders,
				"total_spent":         spent,
				"last_order_at":       last,
				"address_count":       addressCount,
				"updated_at":          updated,
			})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) adminPlatformUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT id,name,coalesce(email,''),role,status,admin_access,created_at FROM users WHERE role<>'owner' ORDER BY CASE WHEN role='superadmin' THEN 0 ELSE 1 END,created_at`)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los usuarios SaaS")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, email, role, status string
		var access []byte
		var created time.Time
		if rows.Scan(&id, &name, &email, &role, &status, &access, &created) == nil {
			var a any = []any{}
			_ = json.Unmarshal(access, &a)
			out = append(out, map[string]any{"id": id, "name": name, "email": email, "role": role, "status": status, "access": a, "created_at": created})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) adminCreatePlatformUser(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name     string   `json:"name"`
		Email    string   `json:"email"`
		Password string   `json:"password"`
		Role     string   `json:"role"`
		Access   []string `json:"access"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" || strings.TrimSpace(in.Email) == "" || len(in.Password) < 8 {
		jsonErr(w, 400, "Nombre, correo y contraseña de al menos 8 caracteres son obligatorios")
		return
	}
	allowed := map[string]bool{"platform_admin": true, "operations": true, "support": true, "auditor": true}
	if !allowed[in.Role] {
		in.Role = "platform_admin"
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		jsonErr(w, 500, "No se pudo proteger la contraseña")
		return
	}
	access, _ := json.Marshal(in.Access)
	var id string
	err = s.db.QueryRow(r.Context(), `INSERT INTO users(name,email,password_hash,role,status,admin_access) VALUES($1,$2,$3,$4,'active',$5) RETURNING id`, strings.TrimSpace(in.Name), strings.ToLower(strings.TrimSpace(in.Email)), string(hash), in.Role, access).Scan(&id)
	if err != nil {
		jsonErr(w, 409, "No se pudo crear el usuario SaaS; verifica el correo")
		return
	}
	c := claims(r)
	s.auditPlatform(r.Context(), c.UserID, "platform_user.created", "platform_user", id, map[string]any{"role": in.Role, "access": in.Access})
	jsonOut(w, 201, map[string]any{"id": id, "ok": true})
}

func (s *Server) adminPlatformUserStatus(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Status string `json:"status"`
	}
	if decode(r, &in) != nil || (in.Status != "active" && in.Status != "inactive") {
		jsonErr(w, 400, "Estado inválido")
		return
	}
	id := chi.URLParam(r, "id")
	cmd, err := s.db.Exec(r.Context(), `UPDATE users SET status=$1,updated_at=now() WHERE id=$2 AND role<>'owner'`, in.Status, id)
	if err != nil || cmd.RowsAffected() == 0 {
		jsonErr(w, 404, "Usuario SaaS no encontrado")
		return
	}
	c := claims(r)
	s.auditPlatform(r.Context(), c.UserID, "platform_user.status.updated", "platform_user", id, map[string]any{"status": in.Status})
	jsonOut(w, 200, map[string]bool{"ok": true})
}
func (s *Server) adminDeletePlatformUser(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	if id == c.UserID {
		jsonErr(w, 400, "No puedes eliminar tu propia cuenta")
		return
	}
	cmd, err := s.db.Exec(r.Context(), `DELETE FROM users WHERE id=$1 AND role<>'owner' AND role<>'superadmin'`, id)
	if err != nil || cmd.RowsAffected() == 0 {
		jsonErr(w, 404, "Usuario SaaS no encontrado o protegido")
		return
	}
	s.auditPlatform(r.Context(), c.UserID, "platform_user.deleted", "platform_user", id, nil)
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminBanks(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT id,name,coalesce(short_name,''),coalesce(logo_url,''),is_active,sort_order FROM platform_banks ORDER BY sort_order,name`)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los bancos")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, n, sn, logo string
		var active bool
		var sort int
		if rows.Scan(&id, &n, &sn, &logo, &active, &sort) == nil {
			out = append(out, map[string]any{"id": id, "name": n, "short_name": sn, "logo_url": logo, "is_active": active, "sort_order": sort})
		}
	}
	jsonOut(w, 200, out)
}
func (s *Server) adminCreateBank(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name      string `json:"name"`
		ShortName string `json:"short_name"`
		LogoURL   string `json:"logo_url"`
		SortOrder int    `json:"sort_order"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Nombre obligatorio")
		return
	}
	var id string
	if s.db.QueryRow(r.Context(), `INSERT INTO platform_banks(name,short_name,logo_url,sort_order) VALUES($1,$2,$3,$4) RETURNING id`, strings.TrimSpace(in.Name), strings.TrimSpace(in.ShortName), strings.TrimSpace(in.LogoURL), in.SortOrder).Scan(&id) != nil {
		jsonErr(w, 409, "No se pudo crear el banco")
		return
	}
	c := claims(r)
	s.auditPlatform(r.Context(), c.UserID, "bank.created", "bank", id, map[string]any{"name": strings.TrimSpace(in.Name)})
	jsonOut(w, 201, map[string]any{"id": id, "ok": true})
}
func (s *Server) adminUpdateBank(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name      string `json:"name"`
		ShortName string `json:"short_name"`
		LogoURL   string `json:"logo_url"`
		IsActive  bool   `json:"is_active"`
		SortOrder int    `json:"sort_order"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	id := chi.URLParam(r, "id")
	cmd, err := s.db.Exec(r.Context(), `UPDATE platform_banks SET name=$1,short_name=$2,logo_url=$3,is_active=$4,sort_order=$5 WHERE id=$6`, strings.TrimSpace(in.Name), strings.TrimSpace(in.ShortName), strings.TrimSpace(in.LogoURL), in.IsActive, in.SortOrder, id)
	if err != nil || cmd.RowsAffected() == 0 {
		jsonErr(w, 404, "Banco no encontrado")
		return
	}
	c := claims(r)
	s.auditPlatform(r.Context(), c.UserID, "bank.updated", "bank", id, map[string]any{"name": strings.TrimSpace(in.Name), "active": in.IsActive})
	jsonOut(w, 200, map[string]bool{"ok": true})
}
func (s *Server) adminDeleteBank(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cmd, err := s.db.Exec(r.Context(), `DELETE FROM platform_banks WHERE id=$1`, id)
	if err != nil || cmd.RowsAffected() == 0 {
		jsonErr(w, 404, "Banco no encontrado")
		return
	}
	c := claims(r)
	s.auditPlatform(r.Context(), c.UserID, "bank.deleted", "bank", id, nil)
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) listStoreStaff(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	sid := strings.TrimSpace(r.URL.Query().Get("store_id"))
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, sid) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id,name,coalesce(last_name,''),coalesce(phone,''),coalesce(document_number,''),coalesce(to_char(birth_date,'YYYY-MM-DD'),''),coalesce(gender,''),identity_verified_at IS NOT NULL,whatsapp_verified_at IS NOT NULL,coalesce(whatsapp_name,''),coalesce(profile_picture_url,''),role,panel,status,created_at FROM store_staff WHERE store_id=$1 ORDER BY created_at`, sid)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los usuarios")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, lastName, phone, document, birthDate, gender, whatsappName, profilePictureURL, role, panel, status string
		var identityVerified, whatsappVerified bool
		var created time.Time
		if rows.Scan(&id, &name, &lastName, &phone, &document, &birthDate, &gender, &identityVerified, &whatsappVerified, &whatsappName, &profilePictureURL, &role, &panel, &status, &created) == nil {
			out = append(out, map[string]any{"id": id, "name": name, "last_name": lastName, "phone": phone, "document_number": document, "birth_date": birthDate, "gender": gender, "identity_verified": identityVerified, "whatsapp_verified": whatsappVerified, "whatsapp_name": whatsappName, "profile_picture_url": profilePictureURL, "role": role, "panel": panel, "status": status, "created_at": created})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) createStoreStaff(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var in struct {
		StoreID        string `json:"store_id"`
		Name           string `json:"name"`
		LastName       string `json:"last_name"`
		Phone          string `json:"phone"`
		DocumentNumber string `json:"document_number"`
		BirthDate      string `json:"birth_date"`
		Gender         string `json:"gender"`
		Role           string `json:"role"`
		Panel          string `json:"panel"`
		PIN            string `json:"pin"`
	}
	if decode(r, &in) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	phone := normalizePhone(in.Phone)
	if phone == "" {
		jsonErr(w, 400, "El WhatsApp es obligatorio")
		return
	}
	if _, err := s.validateOwnerWhatsAppForSave(r.Context(), phone); err != nil {
		jsonErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	name := strings.TrimSpace(in.Name)
	lastName := strings.TrimSpace(in.LastName)
	document := digitsOnly(in.DocumentNumber)
	if len(document) != 11 {
		jsonErr(w, 400, "La Cédula es obligatoria y debe tener exactamente 11 dígitos")
		return
	}
	birthDate := strings.TrimSpace(in.BirthDate)
	gender := normalizeOwnerGender(in.Gender)
	var identityVerifiedAt any
	if document != "" {
		if len(document) != 11 {
			jsonErr(w, 400, "La Cédula debe tener exactamente 11 dígitos")
			return
		}
		identity := s.platformSetting(r.Context(), "identity")
		if enabled, _ := identity["enabled"].(bool); enabled {
			envelope, _, err := s.verifyIdentityDocument(r.Context(), "persona", document)
			if err != nil {
				jsonErr(w, 422, "No pudimos verificar la Cédula: "+err.Error())
				return
			}
			profile := identityProfile("persona", envelope)
			if v := strings.TrimSpace(str(profile["name"])); v != "" {
				name = v
			}
			if v := strings.TrimSpace(str(profile["last_name"])); v != "" {
				lastName = v
			}
			if v := strings.TrimSpace(str(profile["birth_date"])); v != "" {
				birthDate = v
			}
			if v := normalizeOwnerGender(str(profile["gender"])); v != "" {
				gender = v
			}
			identityVerifiedAt = time.Now()
		}
	}
	if name == "" {
		jsonErr(w, 400, "El nombre es obligatorio")
		return
	}
	if birthDate != "" {
		if _, err := time.Parse("2006-01-02", birthDate); err != nil {
			jsonErr(w, 400, "La fecha de nacimiento no es válida")
			return
		}
	}
	if document != "" {
		var dup int
		_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM store_staff WHERE store_id=$1 AND document_number=$2`, in.StoreID, document).Scan(&dup)
		if dup > 0 {
			jsonErr(w, 409, "Ya existe un usuario con esa Cédula en este negocio")
			return
		}
	}
	var hash any = nil
	if in.PIN != "" {
		pinOK, pinLength := s.validPINFor(r.Context(), "staff", in.PIN)
		if !pinOK {
			jsonErr(w, 400, fmt.Sprintf("El PIN debe tener %d dígitos", pinLength))
			return
		}
		h, _ := bcrypt.GenerateFromPassword([]byte(in.PIN), bcrypt.DefaultCost)
		hash = string(h)
	}
	if in.Role == "" {
		in.Role = "operator"
	}
	if in.Panel == "" {
		in.Panel = "operations"
	}
	var id string
	if s.db.QueryRow(r.Context(), `INSERT INTO store_staff(store_id,name,last_name,phone,document_number,birth_date,gender,identity_verified_at,whatsapp_verified_at,role,panel,pin_hash) VALUES($1,$2,nullif($3,''),$4,nullif($5,''),nullif($6,'')::date,nullif($7,''),$8,now(),$9,$10,$11) RETURNING id`, in.StoreID, name, lastName, phone, document, birthDate, gender, identityVerifiedAt, in.Role, in.Panel, hash).Scan(&id) != nil {
		jsonErr(w, 500, "No se pudo crear el usuario")
		return
	}
	_ = s.refreshStoreStaffWhatsAppProfile(r.Context(), id, in.StoreID, phone)
	jsonOut(w, 201, map[string]any{"id": id, "ok": true})
}

func (s *Server) updateStoreStaff(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	var sid string
	if s.db.QueryRow(r.Context(), `SELECT store_id FROM store_staff WHERE id=$1`, id).Scan(&sid) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, sid) {
		jsonErr(w, 404, "Usuario no encontrado")
		return
	}
	var in struct {
		Name           string `json:"name"`
		LastName       string `json:"last_name"`
		Phone          string `json:"phone"`
		DocumentNumber string `json:"document_number"`
		BirthDate      string `json:"birth_date"`
		Gender         string `json:"gender"`
		Role           string `json:"role"`
		Panel          string `json:"panel"`
		Status         string `json:"status"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	phone := normalizePhone(in.Phone)
	if phone == "" {
		jsonErr(w, 400, "El WhatsApp es obligatorio")
		return
	}
	var currentName, currentLastName, currentDocument, currentBirthDate, currentGender, currentPhone string
	var identityVerified bool
	if err := s.db.QueryRow(r.Context(), `SELECT name,coalesce(last_name,''),coalesce(document_number,''),coalesce(to_char(birth_date,'YYYY-MM-DD'),''),coalesce(gender,''),coalesce(phone,''),identity_verified_at IS NOT NULL FROM store_staff WHERE id=$1`, id).Scan(&currentName, &currentLastName, &currentDocument, &currentBirthDate, &currentGender, &currentPhone, &identityVerified); err != nil {
		jsonErr(w, 404, "Usuario no encontrado")
		return
	}
	name := strings.TrimSpace(in.Name)
	lastName := strings.TrimSpace(in.LastName)
	document := digitsOnly(in.DocumentNumber)
	if len(document) != 11 {
		jsonErr(w, 400, "La Cédula es obligatoria y debe tener exactamente 11 dígitos")
		return
	}
	birthDate := strings.TrimSpace(in.BirthDate)
	gender := normalizeOwnerGender(in.Gender)
	var identityVerifiedAt any
	if identityVerified {
		name, lastName, document, birthDate, gender = currentName, currentLastName, currentDocument, currentBirthDate, currentGender
		identityVerifiedAt = time.Now()
	} else if document != "" {
		if len(document) != 11 {
			jsonErr(w, 400, "La Cédula debe tener exactamente 11 dígitos")
			return
		}
		identity := s.platformSetting(r.Context(), "identity")
		if enabled, _ := identity["enabled"].(bool); enabled {
			envelope, _, err := s.verifyIdentityDocument(r.Context(), "persona", document)
			if err != nil {
				jsonErr(w, 422, "No pudimos verificar la Cédula: "+err.Error())
				return
			}
			profile := identityProfile("persona", envelope)
			if v := strings.TrimSpace(str(profile["name"])); v != "" {
				name = v
			}
			if v := strings.TrimSpace(str(profile["last_name"])); v != "" {
				lastName = v
			}
			if v := strings.TrimSpace(str(profile["birth_date"])); v != "" {
				birthDate = v
			}
			if v := normalizeOwnerGender(str(profile["gender"])); v != "" {
				gender = v
			}
			identityVerifiedAt = time.Now()
		}
	}
	if name == "" {
		jsonErr(w, 400, "El nombre es obligatorio")
		return
	}
	if in.Status == "" {
		in.Status = "active"
	}
	phoneChanged := normalizePhone(currentPhone) != phone
	if phoneChanged {
		if _, err := s.validateOwnerWhatsAppForSave(r.Context(), phone); err != nil {
			jsonErr(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
	}
	_, err := s.db.Exec(r.Context(), `UPDATE store_staff SET name=$1,last_name=nullif($2,''),phone=$3,document_number=nullif($4,''),birth_date=nullif($5,'')::date,gender=nullif($6,''),identity_verified_at=coalesce($7,identity_verified_at),whatsapp_verified_at=CASE WHEN $8 THEN now() ELSE whatsapp_verified_at END,profile_picture_updated_at=CASE WHEN $8 THEN NULL ELSE profile_picture_updated_at END,role=$9,panel=$10,status=$11,updated_at=now() WHERE id=$12`, name, lastName, phone, document, birthDate, gender, identityVerifiedAt, phoneChanged, in.Role, in.Panel, in.Status, id)
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar el usuario")
		return
	}
	_ = s.refreshStoreStaffWhatsAppProfile(r.Context(), id, sid, phone)
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) deleteStoreStaff(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	var sid string
	if s.db.QueryRow(r.Context(), `SELECT store_id FROM store_staff WHERE id=$1`, id).Scan(&sid) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, sid) {
		jsonErr(w, 404, "Usuario no encontrado")
		return
	}
	_, _ = s.db.Exec(r.Context(), `DELETE FROM store_staff WHERE id=$1`, id)
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) createPOSSale(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var in struct {
		StoreID       string `json:"store_id"`
		CustomerID    string `json:"customer_id"`
		CustomerName  string `json:"customer_name"`
		CustomerPhone string `json:"customer_phone"`
		PaymentMethod string `json:"payment_method"`
		Items         []struct {
			ProductID   string           `json:"product_id"`
			Quantity    float64          `json:"quantity"`
			VariantName string           `json:"variant_name"`
			Extras      []map[string]any `json:"extras"`
		} `json:"items"`
	}
	if decode(r, &in) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) || len(in.Items) == 0 {
		jsonErr(w, 400, "Venta inválida")
		return
	}
	productCaps, capsOK := s.businessCapabilityFlagsForStore(r.Context(), in.StoreID)
	if !capsOK {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	var cashEnabled, terminalEnabled, transferEnabled bool
	if s.db.QueryRow(r.Context(), `SELECT cash_enabled,cash_on_delivery_enabled,bank_transfer_enabled FROM stores WHERE id=$1`, in.StoreID).Scan(&cashEnabled, &terminalEnabled, &transferEnabled) != nil {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	allowedPayments := map[string]bool{"cash": cashEnabled, "cash_on_delivery": terminalEnabled, "bank_transfer": transferEnabled}
	if strings.TrimSpace(in.PaymentMethod) == "" {
		for _, candidate := range []string{"cash", "cash_on_delivery", "bank_transfer"} {
			if allowedPayments[candidate] {
				in.PaymentMethod = candidate
				break
			}
		}
	}
	if !allowedPayments[in.PaymentMethod] {
		jsonErr(w, 400, "Método de pago no habilitado para este negocio")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo iniciar la venta")
		return
	}
	defer tx.Rollback(r.Context())

	name := strings.TrimSpace(in.CustomerName)
	phone := normalizePhone(in.CustomerPhone)
	var customerID any
	if strings.TrimSpace(in.CustomerID) != "" {
		var cid, customerName, customerPhone string
		if tx.QueryRow(r.Context(), `SELECT id::text,name,phone FROM customers WHERE id=$1 AND store_id=$2 AND status='active'`, in.CustomerID, in.StoreID).Scan(&cid, &customerName, &customerPhone) != nil {
			jsonErr(w, 400, "Cliente inválido")
			return
		}
		customerID = cid
		name = strings.TrimSpace(customerName)
		phone = normalizePhone(customerPhone)
	} else if phone != "" {
		if name == "" {
			name = phone
		}
		var cid string
		if err := tx.QueryRow(r.Context(), `INSERT INTO customers(store_id,name,phone,status) VALUES($1,$2,$3,'active') ON CONFLICT(store_id,phone) DO UPDATE SET name=coalesce(nullif(excluded.name,''),customers.name),updated_at=now() RETURNING id::text`, in.StoreID, name, phone).Scan(&cid); err == nil && cid != "" {
			customerID = cid
		}
	}
	if name == "" {
		name = "Cliente mostrador"
	}

	type priceOption struct {
		Name  string  `json:"name"`
		Price float64 `json:"price"`
	}
	type line struct {
		id, name, variant string
		extras            []map[string]any
		price, qty        float64
	}
	lines := []line{}
	var subtotal float64
	for _, item := range in.Items {
		if item.Quantity <= 0 || item.Quantity > 999 {
			continue
		}
		var n string
		var base float64
		var stock *float64
		var track bool
		var variantsRaw, extrasRaw []byte
		err = tx.QueryRow(r.Context(), `SELECT name,price,stock,track_stock,variants,extras FROM products WHERE id=$1 AND store_id=$2 AND is_active=true FOR UPDATE`, item.ProductID, in.StoreID).Scan(&n, &base, &stock, &track, &variantsRaw, &extrasRaw)
		if err != nil {
			jsonErr(w, 400, "Producto inválido")
			return
		}
		if track && stock != nil && *stock < item.Quantity {
			jsonErr(w, 400, "Stock insuficiente para "+n)
			return
		}
		var variants, allowedExtras []priceOption
		_ = json.Unmarshal(variantsRaw, &variants)
		_ = json.Unmarshal(extrasRaw, &allowedExtras)
		unit := base
		variantName := ""
		if productCaps.SupportsVariants && strings.TrimSpace(item.VariantName) != "" {
			found := false
			for _, option := range variants {
				if option.Name == item.VariantName {
					found = true
					variantName = option.Name
					if option.Price > 0 {
						unit = option.Price
					}
					break
				}
			}
			if !found {
				jsonErr(w, 400, "Variante inválida para "+n)
				return
			}
		}
		normalizedExtras := []map[string]any{}
		if !productCaps.SupportsExtras {
			item.Extras = nil
		}
		for _, requested := range item.Extras {
			reqName := strings.TrimSpace(fmt.Sprint(requested["name"]))
			if reqName == "" {
				continue
			}
			found := false
			for _, option := range allowedExtras {
				if option.Name == reqName {
					found = true
					unit += option.Price
					normalizedExtras = append(normalizedExtras, map[string]any{"name": option.Name, "price": option.Price})
					break
				}
			}
			if !found {
				jsonErr(w, 400, "Adicional inválido para "+n)
				return
			}
		}
		lines = append(lines, line{id: item.ProductID, name: n, variant: variantName, extras: normalizedExtras, price: unit, qty: item.Quantity})
		subtotal += unit * item.Quantity
	}
	if len(lines) == 0 {
		jsonErr(w, 400, "Agrega productos a la venta")
		return
	}

	method := strings.TrimSpace(in.PaymentMethod)
	var orderID string
	var num int64
	if err = tx.QueryRow(r.Context(), `INSERT INTO orders(store_id,customer_id,customer_name,customer_phone,subtotal,discount,shipping,total,payment_method,payment_status,status,source,delivery_type) VALUES($1,$2,$3,$4,$5,0,0,$5,$6,'paid','completed','pos','pickup') RETURNING id,order_number`, in.StoreID, customerID, name, phone, subtotal, method).Scan(&orderID, &num); err != nil {
		jsonErr(w, 500, "No se pudo registrar la venta")
		return
	}
	if cid, ok := customerID.(string); ok && cid != "" && phone != "" {
		_, _ = tx.Exec(r.Context(), `UPDATE conversations SET customer_id=$1,updated_at=now() WHERE store_id=$2 AND split_part(lower(remote_jid),'@',2) IN ('s.whatsapp.net','lid') AND coalesce(nullif(regexp_replace(coalesce(whatsapp_phone,''),'[^0-9]','','g'),''),CASE WHEN split_part(lower(remote_jid),'@',2)='s.whatsapp.net' THEN regexp_replace(split_part(remote_jid,'@',1),'[^0-9]','','g') ELSE '' END)=$3`, cid, in.StoreID, phone)
	}
	for _, ln := range lines {
		extrasJSON, _ := json.Marshal(ln.extras)
		if _, err = tx.Exec(r.Context(), `INSERT INTO order_items(order_id,product_id,product_name,variant_name,extras,unit_price,quantity,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, orderID, ln.id, ln.name, ln.variant, extrasJSON, ln.price, ln.qty, ln.price*ln.qty); err != nil {
			jsonErr(w, 500, "No se pudo guardar el detalle")
			return
		}
		_, _ = tx.Exec(r.Context(), `UPDATE products SET stock=CASE WHEN track_stock AND stock IS NOT NULL THEN greatest(stock-$1,0) ELSE stock END,updated_at=now() WHERE id=$2`, ln.qty, ln.id)
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la venta")
		return
	}
	if cid, ok := customerID.(string); ok && cid != "" {
		s.refreshCustomerStats(r.Context(), cid)
	}
	s.publishStoreEvent(r.Context(), in.StoreID, "order.created", map[string]any{"id": orderID, "number": num, "source": "pos"})
	jsonOut(w, 201, map[string]any{"id": orderID, "number": num, "total": subtotal, "status": "completed"})
}

func (s *Server) adminAuditLog(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT a.id,a.action,coalesce(a.entity_type,''),coalesce(a.entity_id,''),a.metadata,a.created_at,coalesce(u.name,'Sistema') FROM platform_audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 200`)
	if err != nil {
		jsonErr(w, 500, "No se pudo cargar la auditoría")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var action, typ, entity, actor string
		var meta []byte
		var created time.Time
		if rows.Scan(&id, &action, &typ, &entity, &meta, &created, &actor) == nil {
			var m any = map[string]any{}
			_ = json.Unmarshal(meta, &m)
			out = append(out, map[string]any{"id": id, "action": action, "entity_type": typ, "entity_id": entity, "metadata": m, "created_at": created, "actor": actor})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) listActiveBanks(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT id,name,coalesce(short_name,'') FROM platform_banks WHERE is_active=true ORDER BY sort_order,name`)
	if err != nil {
		jsonErr(w, 500, "No se pudo cargar el catálogo bancario")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, short string
		if rows.Scan(&id, &name, &short) == nil {
			out = append(out, map[string]any{"id": id, "name": name, "short_name": short})
		}
	}
	jsonOut(w, 200, out)
}
