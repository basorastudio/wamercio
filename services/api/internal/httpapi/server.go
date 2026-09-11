package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	authpkg "wamercio/services/api/internal/auth"
	"wamercio/services/api/internal/config"
)

type Server struct {
	cfg  config.Config
	db   *pgxpool.Pool
	http *http.Client
}
type ctxKey string

const claimsKey ctxKey = "claims"

func New(cfg config.Config, db *pgxpool.Pool) *Server {
	_ = os.MkdirAll(cfg.UploadDir, 0755)
	return &Server{cfg: cfg, db: db, http: &http.Client{Timeout: 12 * time.Second}}
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(cors.Handler(cors.Options{AllowedOrigins: []string{"*"}, AllowedMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}, AllowedHeaders: []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "X-Internal-Secret"}, AllowCredentials: true, MaxAge: 300}))
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		jsonOut(w, 200, map[string]any{"ok": true, "service": "wamercio-api"})
	})
	r.Handle("/media/*", http.StripPrefix("/media/", http.FileServer(http.Dir(s.cfg.UploadDir))))

	r.Route("/api/v1", func(api chi.Router) {
		// Merchant/store access is intentionally independent from SaaS administration.
		api.Post("/auth/store/login", s.storeLogin)
		api.Post("/auth/store/register", s.register)
		api.Post("/auth/store/logout", s.storeLogout)
		// Legacy aliases kept for clients created before 1.2.
		api.Post("/auth/register", s.register)
		api.Post("/auth/admin/login", s.adminLogin)
		api.Post("/auth/admin/logout", s.adminLogout)
		api.Post("/auth/login", s.adminLogin)

		api.Get("/plans", s.listPlans)
		api.Get("/public/stores/{slug}", s.publicStore)
		api.Post("/public/stores/{slug}/checkout", s.checkout)
		api.Post("/internal/whatsapp/events", s.whatsappEvent)

		api.Group(func(p chi.Router) {
			p.Use(s.requireStoreAuth)
			p.Get("/me", s.me)
			p.Patch("/me", s.updateMe)
			p.Post("/me/pin", s.changePIN)
			p.Get("/dashboard", s.dashboard)
			p.Get("/stores", s.listStores)
			p.Post("/stores", s.createStore)
			p.Put("/stores/{id}", s.updateStore)
			p.Delete("/stores/{id}", s.deleteStore)
			p.Get("/stores/{id}/settings", s.getStoreSettings)
			p.Put("/stores/{id}/settings", s.updateStoreSettings)
			p.Get("/categories", s.listCategories)
			p.Post("/categories", s.createCategory)
			p.Put("/categories/{id}", s.updateCategory)
			p.Delete("/categories/{id}", s.deleteCategory)
			p.Get("/products", s.listProducts)
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
			p.Get("/orders", s.listOrders)
			p.Get("/orders/{id}", s.getOrder)
			p.Patch("/orders/{id}/status", s.updateOrderStatus)
			p.Patch("/orders/{id}/payment", s.updateOrderPayment)
			p.Get("/customers", s.listCustomers)
			p.Get("/customers/{id}", s.getCustomer)
			p.Put("/customers/{id}", s.updateCustomer)
			p.Get("/subscription", s.subscription)
			p.Get("/subscription/requests", s.mySubscriptionRequests)
			p.Post("/subscription/requests", s.requestSubscription)
			p.Get("/transactions", s.listTransactions)
			p.Get("/tickets", s.listTickets)
			p.Post("/tickets", s.createTicket)
			p.Get("/tickets/{id}", s.getTicket)
			p.Post("/tickets/{id}/reply", s.replyTicket)
			p.Patch("/tickets/{id}/close", s.closeTicket)
			p.Get("/conversations", s.listConversations)
			p.Get("/conversations/{id}/messages", s.listMessages)
			p.Patch("/conversations/{id}/read", s.readConversation)
			p.Post("/conversations/{id}/send", s.sendConversationMessage)
			p.Post("/uploads", s.upload)
			p.Get("/whatsapp/{storeID}/status", s.whatsappStatus)
			p.Post("/whatsapp/{storeID}/connect", s.whatsappConnect)
			p.Post("/whatsapp/{storeID}/disconnect", s.whatsappDisconnect)
			p.Post("/whatsapp/{storeID}/send", s.whatsappSend)

		})

		api.Group(func(a chi.Router) {
			a.Use(s.requireAdminAuth)
			a.Get("/admin/me", s.adminMe)
			a.Get("/admin/dashboard", s.adminDashboard)
			a.Get("/admin/users", s.adminUsers)
			a.Patch("/admin/users/{id}/status", s.adminUserStatus)
			a.Put("/admin/users/{id}/plan", s.adminAssignPlan)
			a.Put("/admin/users/{id}/pin", s.adminSetUserPIN)
			a.Put("/admin/users/{id}/access", s.adminSetUserAccess)
			a.Get("/admin/stores", s.adminStores)
			a.Get("/admin/plans", s.adminPlans)
			a.Post("/admin/plans", s.adminCreatePlan)
			a.Put("/admin/plans/{id}", s.adminUpdatePlan)
			a.Get("/admin/subscription-requests", s.adminSubscriptionRequests)
			a.Patch("/admin/subscription-requests/{id}", s.adminReviewSubscriptionRequest)
			a.Get("/admin/transactions", s.adminTransactions)
			a.Get("/admin/tickets", s.adminTickets)
			a.Get("/admin/tickets/{id}", s.adminTicket)
			a.Post("/admin/tickets/{id}/reply", s.adminReplyTicket)
			a.Patch("/admin/tickets/{id}/status", s.adminTicketStatus)
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

func normalizePhone(v string) string {
	digits := regexp.MustCompile(`\D+`).ReplaceAllString(strings.TrimSpace(v), "")
	if len(digits) == 10 {
		digits = "1" + digits
	}
	return digits
}

func validPIN(v string) bool {
	return regexp.MustCompile(`^[0-9]{4}$`).MatchString(v)
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

func (s *Server) requireAdminAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := s.claimsFromCookie(r, "wamercio_admin_token")
		if err != nil || c.Role != "superadmin" {
			jsonErr(w, 401, "Sesión de SuperAdmin requerida")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), claimsKey, c)))
	})
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

func (s *Server) storeLogin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Phone string `json:"phone"`
		PIN   string `json:"pin"`
	}
	if decode(r, &in) != nil || normalizePhone(in.Phone) == "" || !validPIN(in.PIN) {
		jsonErr(w, 400, "Ingresa tu número de WhatsApp y un PIN de 4 dígitos")
		return
	}
	phone := normalizePhone(in.Phone)
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
	tok, err := authpkg.Sign(s.cfg.JWTSecret, id, "owner")
	if err != nil {
		jsonErr(w, 500, "No se pudo crear la sesión")
		return
	}
	_, _ = s.db.Exec(r.Context(), `UPDATE users SET last_login_at=now() WHERE id=$1`, id)
	s.setSessionCookie(w, "wamercio_store_token", tok, 30*24*3600)
	jsonOut(w, 200, map[string]any{"user": map[string]any{"id": id, "name": name, "phone": storedPhone, "role": "owner"}})
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
	var id, name, email, hash, status string
	err := s.db.QueryRow(r.Context(), `SELECT id,name,coalesce(email,''),password_hash,status FROM users WHERE role='superadmin' AND lower(email)=lower($1)`, strings.TrimSpace(in.Email)).Scan(&id, &name, &email, &hash, &status)
	if err != nil || status != "active" || bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil {
		jsonErr(w, 401, "Credenciales administrativas inválidas")
		return
	}
	tok, err := authpkg.Sign(s.cfg.JWTSecret, id, "superadmin")
	if err != nil {
		jsonErr(w, 500, "No se pudo crear la sesión")
		return
	}
	_, _ = s.db.Exec(r.Context(), `UPDATE users SET last_login_at=now() WHERE id=$1`, id)
	s.setSessionCookie(w, "wamercio_admin_token", tok, 12*3600)
	jsonOut(w, 200, map[string]any{"user": map[string]any{"id": id, "name": name, "email": email, "role": "superadmin"}})
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name         string `json:"name"`
		Email        string `json:"email"`
		Phone        string `json:"phone"`
		PIN          string `json:"pin"`
		BusinessName string `json:"business_name"`
	}
	name := strings.TrimSpace(in.Name)
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	name = strings.TrimSpace(in.Name)
	phone := normalizePhone(in.Phone)
	if name == "" || phone == "" || !validPIN(in.PIN) {
		jsonErr(w, 400, "Nombre, WhatsApp y un PIN de 4 dígitos son obligatorios")
		return
	}
	var exists int
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM users WHERE role='owner' AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=$1`, phone).Scan(&exists)
	if exists > 0 {
		jsonErr(w, 409, "Ya existe una cuenta con ese número de WhatsApp")
		return
	}
	pinHash, err := bcrypt.GenerateFromPassword([]byte(in.PIN), bcrypt.DefaultCost)
	if err != nil {
		jsonErr(w, 500, "No se pudo proteger el PIN")
		return
	}
	// Owners don't use passwords to sign in. Keep an unusable random hash for schema compatibility.
	randomHash, err := bcrypt.GenerateFromPassword([]byte(uuid.NewString()+uuid.NewString()), bcrypt.DefaultCost)
	if err != nil {
		jsonErr(w, 500, "No se pudo crear la cuenta")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo crear la cuenta")
		return
	}
	defer tx.Rollback(r.Context())
	var id string
	var email any
	if strings.TrimSpace(in.Email) != "" {
		email = strings.ToLower(strings.TrimSpace(in.Email))
	}
	err = tx.QueryRow(r.Context(), `INSERT INTO users(name,email,phone,password_hash,pin_hash,pin_changed_at,role,status) VALUES($1,$2,$3,$4,$5,now(),'owner','active') RETURNING id`, name, email, phone, string(randomHash), string(pinHash)).Scan(&id)
	if err != nil {
		jsonErr(w, 409, "No se pudo crear la cuenta; verifica el correo o WhatsApp")
		return
	}
	var planID string
	if err = tx.QueryRow(r.Context(), `SELECT id FROM plans WHERE slug='emprende' AND is_active=true LIMIT 1`).Scan(&planID); err == nil {
		_, _ = tx.Exec(r.Context(), `INSERT INTO subscriptions(user_id,plan_id,status) VALUES($1,$2,'active') ON CONFLICT(user_id) DO NOTHING`, id, planID)
	}
	businessName := strings.TrimSpace(in.BusinessName)
	if businessName != "" {
		slug := slugify(businessName)
		_, _ = tx.Exec(r.Context(), `INSERT INTO stores(user_id,name,slug,phone,whatsapp) VALUES($1,$2,$3,$4,$4)`, id, businessName, slug, phone)
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la cuenta")
		return
	}
	tok, err := authpkg.Sign(s.cfg.JWTSecret, id, "owner")
	if err != nil {
		jsonErr(w, 500, "Cuenta creada, pero no se pudo iniciar sesión")
		return
	}
	s.setSessionCookie(w, "wamercio_store_token", tok, 30*24*3600)
	jsonOut(w, 201, map[string]any{"user": map[string]any{"id": id, "name": name, "phone": phone, "role": "owner"}})
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
	err := s.db.QueryRow(r.Context(), `SELECT name,coalesce(email,''),role,created_at FROM users WHERE id=$1 AND role='superadmin'`, c.UserID).Scan(&name, &email, &role, &created)
	if err != nil {
		jsonErr(w, 404, "Administrador no encontrado")
		return
	}
	jsonOut(w, 200, map[string]any{"id": c.UserID, "name": name, "email": email, "role": role, "created_at": created})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var name, email, phone, role string
	var created time.Time
	err := s.db.QueryRow(r.Context(), `SELECT name,coalesce(email,''),coalesce(phone,''),role,created_at FROM users WHERE id=$1`, c.UserID).Scan(&name, &email, &phone, &role, &created)
	if err != nil {
		jsonErr(w, 404, "Usuario no encontrado")
		return
	}
	jsonOut(w, 200, map[string]any{"id": c.UserID, "name": name, "email": email, "phone": phone, "role": role, "created_at": created})
}

func (s *Server) dashboard(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var stores, products, orders, customers int
	var revenue float64
	_ = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM stores WHERE user_id=$1`, c.UserID).Scan(&stores)
	_ = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM products p JOIN stores s ON s.id=p.store_id WHERE s.user_id=$1`, c.UserID).Scan(&products)
	_ = s.db.QueryRow(r.Context(), `SELECT COUNT(*),coalesce(sum(o.total) FILTER (WHERE o.status!='canceled'),0) FROM orders o JOIN stores s ON s.id=o.store_id WHERE s.user_id=$1`, c.UserID).Scan(&orders, &revenue)
	_ = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM customers cu JOIN stores s ON s.id=cu.store_id WHERE s.user_id=$1`, c.UserID).Scan(&customers)
	rows, _ := s.db.Query(r.Context(), `SELECT o.id,o.order_number,o.customer_name,o.total,o.status,o.created_at,s.name FROM orders o JOIN stores s ON s.id=o.store_id WHERE s.user_id=$1 ORDER BY o.created_at DESC LIMIT 8`, c.UserID)
	defer func() {
		if rows != nil {
			rows.Close()
		}
	}()
	recent := []map[string]any{}
	if rows != nil {
		for rows.Next() {
			var id, customer, status, store string
			var num int64
			var total float64
			var created time.Time
			_ = rows.Scan(&id, &num, &customer, &total, &status, &created, &store)
			recent = append(recent, map[string]any{"id": id, "number": num, "customer": customer, "total": total, "status": status, "created_at": created, "store": store})
		}
	}
	jsonOut(w, 200, map[string]any{"metrics": map[string]any{"stores": stores, "products": products, "orders": orders, "customers": customers, "revenue": revenue}, "recent_orders": recent})
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
	q := `SELECT id,name,slug,coalesce(description,''),coalesce(logo_url,''),coalesce(phone,''),coalesce(whatsapp,''),coalesce(address,''),currency,primary_color,is_active,created_at FROM stores`
	args := []any{}
	if c.Role != "superadmin" {
		q += ` WHERE user_id=$1`
		args = append(args, c.UserID)
	}
	q += ` ORDER BY created_at DESC`
	rows, err := s.db.Query(r.Context(), q, args...)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, slug, desc, logo, phone, wa, address, currency, color string
		var active bool
		var created time.Time
		_ = rows.Scan(&id, &name, &slug, &desc, &logo, &phone, &wa, &address, &currency, &color, &active, &created)
		out = append(out, map[string]any{"id": id, "name": name, "slug": slug, "description": desc, "logo_url": logo, "phone": phone, "whatsapp": wa, "address": address, "currency": currency, "primary_color": color, "is_active": active, "created_at": created})
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
		Phone        string `json:"phone"`
		Whatsapp     string `json:"whatsapp"`
		Address      string `json:"address"`
		PrimaryColor string `json:"primary_color"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Nombre obligatorio")
		return
	}
	if c.Role != "superadmin" {
		limits := s.limitsForUser(r.Context(), c.UserID)
		var count int
		_ = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM stores WHERE user_id=$1`, c.UserID).Scan(&count)
		if count >= limits.MaxStores {
			jsonErr(w, 403, "Has alcanzado el límite de tiendas de tu plan")
			return
		}
	}
	if in.Slug == "" {
		in.Slug = slugify(in.Name)
	} else {
		in.Slug = slugify(in.Slug)
	}
	if in.PrimaryColor == "" {
		in.PrimaryColor = "#16a34a"
	}
	var id string
	err := s.db.QueryRow(r.Context(), `INSERT INTO stores(user_id,name,slug,description,logo_url,phone,whatsapp,address,primary_color) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, c.UserID, in.Name, in.Slug, in.Description, in.LogoURL, in.Phone, in.Whatsapp, in.Address, in.PrimaryColor).Scan(&id)
	if err != nil {
		jsonErr(w, 409, "No se pudo crear la tienda; verifica que el identificador sea único")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id, "slug": in.Slug})
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
		Phone        string `json:"phone"`
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
		in.Slug = slugify(in.Name)
	} else {
		in.Slug = slugify(in.Slug)
	}
	_, err := s.db.Exec(r.Context(), `UPDATE stores SET name=$1,slug=$2,description=$3,logo_url=$4,phone=$5,whatsapp=$6,address=$7,primary_color=$8,is_active=$9,updated_at=now() WHERE id=$10`, in.Name, in.Slug, in.Description, in.LogoURL, in.Phone, in.Whatsapp, in.Address, in.PrimaryColor, active, id)
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
	_, err := s.db.Exec(r.Context(), `DELETE FROM stores WHERE id=$1`, id)
	if err != nil {
		jsonErr(w, 409, "La tienda tiene información que impide eliminarla")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
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

func scanProduct(rows pgx.Rows) (map[string]any, error) {
	var id, sid, cid, name, slug, sku, desc, img, tag string
	var price float64
	var compare, stock float64
	var track, featured, active bool
	var sortOrder int
	var variants, extras []byte
	var created, updated time.Time
	err := rows.Scan(&id, &sid, &cid, &name, &slug, &sku, &desc, &img, &price, &compare, &stock, &track, &variants, &extras, &tag, &featured, &sortOrder, &active, &created, &updated)
	if err != nil {
		return nil, err
	}
	var v, e any
	_ = json.Unmarshal(variants, &v)
	_ = json.Unmarshal(extras, &e)
	return map[string]any{"id": id, "store_id": sid, "category_id": cid, "name": name, "slug": slug, "sku": sku, "description": desc, "image_url": img, "price": price, "compare_price": compare, "stock": stock, "track_stock": track, "variants": v, "extras": e, "tag": tag, "is_featured": featured, "sort_order": sortOrder, "is_active": active, "created_at": created, "updated_at": updated}, nil
}
func (s *Server) listProducts(w http.ResponseWriter, r *http.Request) {
	sid, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id,store_id,coalesce(category_id::text,''),name,slug,coalesce(sku,''),coalesce(description,''),coalesce(image_url,''),price,coalesce(compare_price,0),coalesce(stock,0),track_stock,variants,extras,coalesce(tag,''),is_featured,sort_order,is_active,created_at,updated_at FROM products WHERE store_id=$1 ORDER BY is_featured DESC,sort_order,name`, sid)
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
	var cat any = nil
	if in.CategoryID != "" {
		cat = in.CategoryID
	}
	var id string
	err := s.db.QueryRow(r.Context(), `INSERT INTO products(store_id,category_id,name,slug,sku,description,image_url,price,compare_price,stock,track_stock,variants,extras,tag,is_featured,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`, in.StoreID, cat, in.Name, slugify(firstNonEmpty(in.Slug, in.Name)), in.SKU, in.Description, in.ImageURL, in.Price, in.ComparePrice, in.Stock, in.TrackStock, in.Variants, in.Extras, in.Tag, in.IsFeatured, in.SortOrder).Scan(&id)
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
	if len(in.Variants) == 0 {
		in.Variants = []byte("[]")
	}
	if len(in.Extras) == 0 {
		in.Extras = []byte("[]")
	}
	var cat any = nil
	if in.CategoryID != "" {
		cat = in.CategoryID
	}
	_, err := s.db.Exec(r.Context(), `UPDATE products SET category_id=$1,name=$2,slug=$3,sku=$4,description=$5,image_url=$6,price=$7,compare_price=$8,stock=$9,track_stock=$10,variants=$11,extras=$12,tag=$13,is_featured=$14,sort_order=$15,is_active=$16,updated_at=now() WHERE id=$17 AND store_id=$18`, cat, in.Name, slugify(firstNonEmpty(in.Slug, in.Name)), in.SKU, in.Description, in.ImageURL, in.Price, in.ComparePrice, in.Stock, in.TrackStock, in.Variants, in.Extras, in.Tag, in.IsFeatured, in.SortOrder, in.IsActive, id, in.StoreID)
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

func (s *Server) listOrders(w http.ResponseWriter, r *http.Request) {
	sid, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id,order_number,customer_name,customer_phone,total,payment_method,payment_status,status,source,delivery_type,created_at FROM orders WHERE store_id=$1 ORDER BY created_at DESC LIMIT 500`, sid)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, phone, pm, ps, st, source, deliveryType string
		var num int64
		var total float64
		var cr time.Time
		_ = rows.Scan(&id, &num, &name, &phone, &total, &pm, &ps, &st, &source, &deliveryType, &cr)
		out = append(out, map[string]any{"id": id, "number": num, "customer_name": name, "customer_phone": phone, "total": total, "payment_method": pm, "payment_status": ps, "status": st, "source": source, "delivery_type": deliveryType, "created_at": cr})
	}
	jsonOut(w, 200, out)
}
func (s *Server) getOrder(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c := claims(r)
	var sid, customerID, name, phone, email, address, deliveryType, coupon, pm, ps, status, notes, source, proof string
	var num int64
	var subtotal, discount, shipping, total float64
	var cr time.Time
	err := s.db.QueryRow(r.Context(), `SELECT o.store_id,coalesce(o.customer_id::text,''),o.order_number,o.customer_name,o.customer_phone,coalesce(o.customer_email,''),coalesce(o.delivery_address,''),o.delivery_type,coalesce(o.coupon_code,''),o.subtotal,o.discount,o.shipping,o.total,o.payment_method,o.payment_status,o.status,coalesce(o.notes,''),o.source,coalesce(o.payment_proof_url,''),o.created_at FROM orders o WHERE o.id=$1`, id).Scan(&sid, &customerID, &num, &name, &phone, &email, &address, &deliveryType, &coupon, &subtotal, &discount, &shipping, &total, &pm, &ps, &status, &notes, &source, &proof, &cr)
	if err != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, sid) {
		jsonErr(w, 404, "Pedido no encontrado")
		return
	}
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
	jsonOut(w, 200, map[string]any{"id": id, "store_id": sid, "customer_id": customerID, "number": num, "customer_name": name, "customer_phone": phone, "customer_email": email, "delivery_address": address, "delivery_type": deliveryType, "coupon_code": coupon, "subtotal": subtotal, "discount": discount, "shipping": shipping, "total": total, "payment_method": pm, "payment_status": ps, "payment_proof_url": proof, "status": status, "notes": notes, "source": source, "created_at": cr, "items": items})
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
	var sid, phone, currentStatus, customerID string
	var num int64
	if s.db.QueryRow(r.Context(), `SELECT store_id,customer_phone,order_number,status,coalesce(customer_id::text,'') FROM orders WHERE id=$1`, id).Scan(&sid, &phone, &num, &currentStatus, &customerID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, sid) {
		jsonErr(w, 404, "Pedido no encontrado")
		return
	}
	valid := map[string]bool{"pending": true, "processing": true, "out_for_delivery": true, "delivered": true, "canceled": true}
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
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar el cambio")
		return
	}
	s.refreshCustomerStats(r.Context(), customerID)
	go s.trySendWhatsApp(context.Background(), sid, phone, fmt.Sprintf("Actualización de tu pedido #%d: %s", num, spanishStatus(in.Status)))
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func spanishStatus(status string) string {
	switch status {
	case "pending":
		return "Pendiente"
	case "processing":
		return "En proceso"
	case "out_for_delivery":
		return "En camino"
	case "delivered":
		return "Entregado"
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
	rows, err := s.db.Query(r.Context(), `SELECT id,remote_jid,coalesce(display_name,''),unread_count,coalesce(last_message,''),last_message_at,created_at FROM conversations WHERE store_id=$1 ORDER BY last_message_at DESC NULLS LAST,created_at DESC LIMIT 300`, sid)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las conversaciones")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, jid, name, last string
		var unread int
		var lastAt *time.Time
		var created time.Time
		_ = rows.Scan(&id, &jid, &name, &unread, &last, &lastAt, &created)
		out = append(out, map[string]any{"id": id, "remote_jid": jid, "display_name": name, "unread_count": unread, "last_message": last, "last_message_at": lastAt, "created_at": created})
	}
	jsonOut(w, 200, out)
}
func (s *Server) conversationOwned(ctx context.Context, c *authpkg.Claims, id string) (string, string, bool) {
	var sid, jid string
	err := s.db.QueryRow(ctx, `SELECT store_id,remote_jid FROM conversations WHERE id=$1`, id).Scan(&sid, &jid)
	if err != nil || !queryStoreOwned(ctx, s.db, c.UserID, c.Role, sid) {
		return "", "", false
	}
	return sid, jid, true
}
func (s *Server) listMessages(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	_, _, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id,coalesce(message_id,''),direction,type,coalesce(body,''),coalesce(status,''),occurred_at FROM messages WHERE conversation_id=$1 ORDER BY occurred_at ASC LIMIT 1000`, id)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los mensajes")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var mid, msgid, dir, typ, body, status string
		var at time.Time
		_ = rows.Scan(&mid, &msgid, &dir, &typ, &body, &status, &at)
		out = append(out, map[string]any{"id": mid, "message_id": msgid, "direction": dir, "type": typ, "body": body, "status": status, "occurred_at": at})
	}
	jsonOut(w, 200, out)
}
func (s *Server) readConversation(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	_, _, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
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

func (s *Server) publicStore(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var sid, name, desc, logo, banner, email, phone, wa, address, currency, color string
	var bankName, accountName, accountNumber, accountType, orderNotice, checkoutMessage string
	var minimum float64
	var pickup, delivery, cash, cod, transfer bool
	var hoursRaw []byte
	err := s.db.QueryRow(r.Context(), `SELECT id,name,coalesce(description,''),coalesce(logo_url,''),coalesce(banner_url,''),coalesce(email,''),coalesce(phone,''),coalesce(whatsapp,''),coalesce(address,''),currency,primary_color,minimum_order,pickup_enabled,delivery_enabled,cash_enabled,cash_on_delivery_enabled,bank_transfer_enabled,coalesce(bank_name,''),coalesce(bank_account_name,''),coalesce(bank_account_number,''),coalesce(bank_account_type,''),business_hours,coalesce(order_notice,''),coalesce(checkout_message,'') FROM stores WHERE slug=$1 AND is_active=true`, slug).Scan(&sid, &name, &desc, &logo, &banner, &email, &phone, &wa, &address, &currency, &color, &minimum, &pickup, &delivery, &cash, &cod, &transfer, &bankName, &accountName, &accountNumber, &accountType, &hoursRaw, &orderNotice, &checkoutMessage)
	if err != nil {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	var hours any = map[string]any{}
	_ = json.Unmarshal(hoursRaw, &hours)
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
	pr, _ := s.db.Query(r.Context(), `SELECT id,store_id,coalesce(category_id::text,''),name,slug,coalesce(sku,''),coalesce(description,''),coalesce(image_url,''),price,coalesce(compare_price,0),coalesce(stock,0),track_stock,variants,extras,coalesce(tag,''),is_featured,sort_order,is_active,created_at,updated_at FROM products WHERE store_id=$1 AND is_active=true ORDER BY is_featured DESC,sort_order,name`, sid)
	if pr != nil {
		defer pr.Close()
		for pr.Next() {
			p, e := scanProduct(pr)
			if e == nil {
				prods = append(prods, p)
			}
		}
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
	jsonOut(w, 200, map[string]any{
		"store": map[string]any{
			"id": sid, "name": name, "slug": slug, "description": desc, "logo_url": logo, "banner_url": banner, "email": email,
			"phone": phone, "whatsapp": wa, "address": address, "currency": currency, "primary_color": color, "minimum_order": minimum,
			"pickup_enabled": pickup, "delivery_enabled": delivery, "business_hours": hours, "order_notice": orderNotice, "checkout_message": checkoutMessage,
			"payment_methods": map[string]bool{"cash": cash, "cash_on_delivery": cod, "bank_transfer": transfer},
			"bank_transfer":   map[string]any{"bank_name": bankName, "account_name": accountName, "account_number": accountNumber, "account_type": accountType},
		},
		"categories": cats, "products": prods, "shipping_zones": zones,
	})
}

type checkoutItem struct {
	ProductID   string           `json:"product_id"`
	Quantity    float64          `json:"quantity"`
	VariantName string           `json:"variant_name"`
	Extras      []map[string]any `json:"extras"`
}

func (s *Server) checkout(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var in struct {
		CustomerName    string         `json:"customer_name"`
		CustomerPhone   string         `json:"customer_phone"`
		CustomerEmail   string         `json:"customer_email"`
		DeliveryAddress string         `json:"delivery_address"`
		DeliveryType    string         `json:"delivery_type"`
		ShippingZoneID  string         `json:"shipping_zone_id"`
		CouponCode      string         `json:"coupon_code"`
		PaymentMethod   string         `json:"payment_method"`
		Notes           string         `json:"notes"`
		Items           []checkoutItem `json:"items"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.CustomerName) == "" || strings.TrimSpace(in.CustomerPhone) == "" || len(in.Items) == 0 {
		jsonErr(w, 400, "Completa cliente, teléfono y productos")
		return
	}
	var sid, ownerID string
	var minimum float64
	var pickupEnabled, deliveryEnabled, cashEnabled, codEnabled, transferEnabled bool
	if s.db.QueryRow(r.Context(), `SELECT id,user_id,minimum_order,pickup_enabled,delivery_enabled,cash_enabled,cash_on_delivery_enabled,bank_transfer_enabled FROM stores WHERE slug=$1 AND is_active=true`, slug).Scan(&sid, &ownerID, &minimum, &pickupEnabled, &deliveryEnabled, &cashEnabled, &codEnabled, &transferEnabled) != nil {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	limits := s.limitsForUser(r.Context(), ownerID)
	var monthOrders int
	_ = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM orders o JOIN stores st ON st.id=o.store_id WHERE st.user_id=$1 AND o.created_at>=date_trunc('month',now())`, ownerID).Scan(&monthOrders)
	if monthOrders >= limits.MaxOrders {
		jsonErr(w, 403, "Esta tienda alcanzó temporalmente el límite de pedidos de su plan")
		return
	}

	in.CustomerName = strings.TrimSpace(in.CustomerName)
	in.CustomerPhone = strings.TrimSpace(in.CustomerPhone)
	in.CustomerEmail = strings.TrimSpace(in.CustomerEmail)
	in.DeliveryAddress = strings.TrimSpace(in.DeliveryAddress)
	in.CouponCode = strings.ToUpper(strings.TrimSpace(in.CouponCode))
	if in.DeliveryType == "" {
		if in.ShippingZoneID != "" {
			in.DeliveryType = "delivery"
		} else {
			in.DeliveryType = "pickup"
		}
	}
	if in.DeliveryType != "delivery" && in.DeliveryType != "pickup" {
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
	if in.DeliveryType == "delivery" && in.DeliveryAddress == "" {
		jsonErr(w, 400, "Indica la dirección de entrega")
		return
	}

	allowedPayments := map[string]bool{"cash": cashEnabled, "bank_transfer": transferEnabled, "cash_on_delivery": codEnabled}
	if !allowedPayments[in.PaymentMethod] {
		for _, candidate := range []string{"cash_on_delivery", "cash", "bank_transfer"} {
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

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo iniciar el pedido")
		return
	}
	defer tx.Rollback(r.Context())

	var customerID, customerStatus string
	err = tx.QueryRow(r.Context(), `SELECT id,status FROM customers WHERE store_id=$1 AND phone=$2`, sid, in.CustomerPhone).Scan(&customerID, &customerStatus)
	if err == nil && customerStatus == "blocked" {
		jsonErr(w, 403, "Este contacto no puede realizar pedidos en esta tienda")
		return
	}
	if err != nil {
		err = tx.QueryRow(r.Context(), `INSERT INTO customers(store_id,name,phone,email,address,status) VALUES($1,$2,$3,$4,$5,'active') RETURNING id,status`, sid, in.CustomerName, in.CustomerPhone, in.CustomerEmail, in.DeliveryAddress).Scan(&customerID, &customerStatus)
		if err != nil {
			jsonErr(w, 500, "No se pudo registrar el cliente")
			return
		}
	} else {
		_, _ = tx.Exec(r.Context(), `UPDATE customers SET name=$1,email=coalesce(nullif($2,''),email),address=coalesce(nullif($3,''),address),updated_at=now() WHERE id=$4`, in.CustomerName, in.CustomerEmail, in.DeliveryAddress, customerID)
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
		if strings.TrimSpace(it.VariantName) != "" {
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
	if in.DeliveryType == "delivery" {
		if in.ShippingZoneID == "" {
			jsonErr(w, 400, "Selecciona una zona de delivery")
			return
		}
		if tx.QueryRow(r.Context(), `SELECT charge FROM shipping_zones WHERE id=$1 AND store_id=$2 AND is_active=true`, in.ShippingZoneID, sid).Scan(&shipping) == nil {
			zone = in.ShippingZoneID
		} else {
			jsonErr(w, 400, "Zona de delivery inválida")
			return
		}
	}
	total := subtotal - discount + shipping
	var orderID string
	var num int64
	err = tx.QueryRow(r.Context(), `INSERT INTO orders(store_id,customer_id,customer_name,customer_phone,customer_email,delivery_address,delivery_type,shipping_zone_id,coupon_code,subtotal,discount,shipping,total,payment_method,notes,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'web') RETURNING id,order_number`, sid, customerID, in.CustomerName, in.CustomerPhone, in.CustomerEmail, in.DeliveryAddress, in.DeliveryType, zone, in.CouponCode, subtotal, discount, shipping, total, in.PaymentMethod, in.Notes).Scan(&orderID, &num)
	if err != nil {
		jsonErr(w, 500, "No se pudo crear el pedido")
		return
	}
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
	go s.trySendWhatsApp(context.Background(), sid, in.CustomerPhone, fmt.Sprintf("¡Gracias %s! Recibimos tu pedido #%d por RD$ %.2f. Estado: Pendiente.", in.CustomerName, num, total))
	jsonOut(w, 201, map[string]any{"id": orderID, "number": num, "subtotal": subtotal, "discount": discount, "shipping": shipping, "total": total, "status": "pending", "payment_method": in.PaymentMethod, "delivery_type": in.DeliveryType})
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
	_, _ = s.bridgeReq(ctx, "POST", "/sessions/"+storeID+"/messages", map[string]any{"to": phone, "text": text})
}

func (s *Server) whatsappEvent(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Internal-Secret") != s.cfg.InternalWebhookSecret || s.cfg.InternalWebhookSecret == "" {
		jsonErr(w, 403, "No autorizado")
		return
	}
	var in struct {
		StoreID     string    `json:"store_id"`
		RemoteJID   string    `json:"remote_jid"`
		MessageID   string    `json:"message_id"`
		Body        string    `json:"body"`
		Direction   string    `json:"direction"`
		Type        string    `json:"type"`
		DisplayName string    `json:"display_name"`
		OccurredAt  time.Time `json:"occurred_at"`
	}
	if decode(r, &in) != nil || in.StoreID == "" || in.RemoteJID == "" {
		jsonErr(w, 400, "Evento inválido")
		return
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
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "db")
		return
	}
	defer tx.Rollback(r.Context())
	var convID string
	err = tx.QueryRow(r.Context(), `INSERT INTO conversations(store_id,remote_jid,display_name,unread_count,last_message,last_message_at) VALUES($1,$2,$3,1,$4,$5) ON CONFLICT(store_id,remote_jid) DO UPDATE SET display_name=coalesce(nullif(EXCLUDED.display_name,''),conversations.display_name), unread_count=conversations.unread_count+1,last_message=EXCLUDED.last_message,last_message_at=EXCLUDED.last_message_at,updated_at=now() RETURNING id`, in.StoreID, in.RemoteJID, in.DisplayName, in.Body, in.OccurredAt).Scan(&convID)
	if err != nil {
		jsonErr(w, 500, "No se pudo registrar conversación")
		return
	}
	_, _ = tx.Exec(r.Context(), `INSERT INTO messages(conversation_id,message_id,direction,type,body,status,occurred_at) VALUES($1,$2,$3,$4,$5,'received',$6) ON CONFLICT(conversation_id,message_id) DO NOTHING`, convID, in.MessageID, in.Direction, in.Type, in.Body, in.OccurredAt)
	_ = tx.Commit(r.Context())
	jsonOut(w, 200, map[string]bool{"ok": true})
}

// --- WAMERCIO 1.1 account, store settings, CRM and SuperAdmin -----------------

func (s *Server) updateMe(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var in struct {
		Name  string `json:"name"`
		Phone string `json:"phone"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "El nombre es obligatorio")
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
	_, err := s.db.Exec(r.Context(), `UPDATE users SET name=$1,phone=$2,updated_at=now() WHERE id=$3`, strings.TrimSpace(in.Name), phone, c.UserID)
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar el perfil")
		return
	}
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
	if decode(r, &in) != nil || !validPIN(in.New) {
		jsonErr(w, 400, "El nuevo PIN debe tener exactamente 4 dígitos")
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
	var name, slug, desc, logo, banner, email, phone, wa, address, currency, color string
	var bankName, accountName, accountNumber, accountType, orderNotice, checkoutMessage string
	var minimum float64
	var pickup, delivery, cash, cod, transfer, active bool
	var hoursRaw []byte
	err := s.db.QueryRow(r.Context(), `SELECT name,slug,coalesce(description,''),coalesce(logo_url,''),coalesce(banner_url,''),coalesce(email,''),coalesce(phone,''),coalesce(whatsapp,''),coalesce(address,''),currency,primary_color,minimum_order,pickup_enabled,delivery_enabled,cash_enabled,cash_on_delivery_enabled,bank_transfer_enabled,coalesce(bank_name,''),coalesce(bank_account_name,''),coalesce(bank_account_number,''),coalesce(bank_account_type,''),business_hours,coalesce(order_notice,''),coalesce(checkout_message,''),is_active FROM stores WHERE id=$1`, id).Scan(&name, &slug, &desc, &logo, &banner, &email, &phone, &wa, &address, &currency, &color, &minimum, &pickup, &delivery, &cash, &cod, &transfer, &bankName, &accountName, &accountNumber, &accountType, &hoursRaw, &orderNotice, &checkoutMessage, &active)
	if err != nil {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	var hours any = map[string]any{}
	_ = json.Unmarshal(hoursRaw, &hours)
	jsonOut(w, 200, map[string]any{
		"id": id, "name": name, "slug": slug, "description": desc, "logo_url": logo, "banner_url": banner, "email": email,
		"phone": phone, "whatsapp": wa, "address": address, "currency": currency, "primary_color": color, "minimum_order": minimum,
		"pickup_enabled": pickup, "delivery_enabled": delivery, "cash_enabled": cash, "cash_on_delivery_enabled": cod,
		"bank_transfer_enabled": transfer, "bank_name": bankName, "bank_account_name": accountName, "bank_account_number": accountNumber,
		"bank_account_type": accountType, "business_hours": hours, "order_notice": orderNotice, "checkout_message": checkoutMessage, "is_active": active,
	})
}

func (s *Server) updateStoreSettings(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, id) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	var in struct {
		Name                  string         `json:"name"`
		Slug                  string         `json:"slug"`
		Description           string         `json:"description"`
		LogoURL               string         `json:"logo_url"`
		BannerURL             string         `json:"banner_url"`
		Email                 string         `json:"email"`
		Phone                 string         `json:"phone"`
		Whatsapp              string         `json:"whatsapp"`
		Address               string         `json:"address"`
		Currency              string         `json:"currency"`
		PrimaryColor          string         `json:"primary_color"`
		MinimumOrder          float64        `json:"minimum_order"`
		PickupEnabled         bool           `json:"pickup_enabled"`
		DeliveryEnabled       bool           `json:"delivery_enabled"`
		CashEnabled           bool           `json:"cash_enabled"`
		CashOnDeliveryEnabled bool           `json:"cash_on_delivery_enabled"`
		BankTransferEnabled   bool           `json:"bank_transfer_enabled"`
		IsActive              bool           `json:"is_active"`
		BankName              string         `json:"bank_name"`
		BankAccountName       string         `json:"bank_account_name"`
		BankAccountNumber     string         `json:"bank_account_number"`
		BankAccountType       string         `json:"bank_account_type"`
		OrderNotice           string         `json:"order_notice"`
		CheckoutMessage       string         `json:"checkout_message"`
		BusinessHours         map[string]any `json:"business_hours"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Datos de tienda inválidos")
		return
	}
	if in.Slug == "" {
		in.Slug = slugify(in.Name)
	} else {
		in.Slug = slugify(in.Slug)
	}
	if in.Currency == "" {
		in.Currency = "DOP"
	}
	if in.PrimaryColor == "" {
		in.PrimaryColor = "#16a34a"
	}
	if in.MinimumOrder < 0 {
		in.MinimumOrder = 0
	}
	hours, _ := json.Marshal(in.BusinessHours)
	_, err := s.db.Exec(r.Context(), `UPDATE stores SET name=$1,slug=$2,description=$3,logo_url=$4,banner_url=$5,email=$6,phone=$7,whatsapp=$8,address=$9,currency=$10,primary_color=$11,minimum_order=$12,pickup_enabled=$13,delivery_enabled=$14,cash_enabled=$15,cash_on_delivery_enabled=$16,bank_transfer_enabled=$17,bank_name=$18,bank_account_name=$19,bank_account_number=$20,bank_account_type=$21,business_hours=$22,order_notice=$23,checkout_message=$24,is_active=$25,updated_at=now() WHERE id=$26`, strings.TrimSpace(in.Name), in.Slug, in.Description, in.LogoURL, in.BannerURL, in.Email, in.Phone, in.Whatsapp, in.Address, in.Currency, in.PrimaryColor, in.MinimumOrder, in.PickupEnabled, in.DeliveryEnabled, in.CashEnabled, in.CashOnDeliveryEnabled, in.BankTransferEnabled, in.BankName, in.BankAccountName, in.BankAccountNumber, in.BankAccountType, hours, in.OrderNotice, in.CheckoutMessage, in.IsActive, id)
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
	rows, err := s.db.Query(r.Context(), `SELECT id,name,phone,coalesce(email,''),coalesce(address,''),coalesce(notes,''),status,order_count,total_spent,last_order_at,created_at FROM customers WHERE store_id=$1 ORDER BY last_order_at DESC NULLS LAST,created_at DESC`, sid)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los clientes")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, phone, email, address, notes, status string
		var count int
		var spent float64
		var last *time.Time
		var created time.Time
		_ = rows.Scan(&id, &name, &phone, &email, &address, &notes, &status, &count, &spent, &last, &created)
		out = append(out, map[string]any{"id": id, "name": name, "phone": phone, "email": email, "address": address, "notes": notes, "status": status, "order_count": count, "total_spent": spent, "last_order_at": last, "created_at": created, "store_id": sid, "owner": c.UserID})
	}
	jsonOut(w, 200, out)
}

func (s *Server) getCustomer(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	var sid, name, phone, email, address, notes, status string
	var count int
	var spent float64
	var last *time.Time
	var created time.Time
	q := `SELECT c.store_id,c.name,c.phone,coalesce(c.email,''),coalesce(c.address,''),coalesce(c.notes,''),c.status,c.order_count,c.total_spent,c.last_order_at,c.created_at FROM customers c JOIN stores s ON s.id=c.store_id WHERE c.id=$1`
	args := []any{id}
	if c.Role != "superadmin" {
		q += ` AND s.user_id=$2`
		args = append(args, c.UserID)
	}
	if s.db.QueryRow(r.Context(), q, args...).Scan(&sid, &name, &phone, &email, &address, &notes, &status, &count, &spent, &last, &created) != nil {
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
	jsonOut(w, 200, map[string]any{"id": id, "store_id": sid, "name": name, "phone": phone, "email": email, "address": address, "notes": notes, "status": status, "order_count": count, "total_spent": spent, "last_order_at": last, "created_at": created, "orders": orders})
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
	var in struct{ Name, Email, Address, Notes, Status string }
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Nombre obligatorio")
		return
	}
	if in.Status != "active" && in.Status != "blocked" {
		in.Status = "active"
	}
	_, err := s.db.Exec(r.Context(), `UPDATE customers SET name=$1,email=$2,address=$3,notes=$4,status=$5,updated_at=now() WHERE id=$6`, strings.TrimSpace(in.Name), strings.TrimSpace(in.Email), strings.TrimSpace(in.Address), in.Notes, in.Status, id)
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
	_, _ = s.db.Exec(ctx, `UPDATE customers c SET order_count=x.cnt,total_spent=x.spent,last_order_at=x.last_at,updated_at=now() FROM (SELECT count(*)::int cnt,coalesce(sum(total) FILTER (WHERE status<>'canceled'),0) spent,max(created_at) last_at FROM orders WHERE customer_id=$1) x WHERE c.id=$1`, customerID)
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
	allowed := map[string]bool{"pending": true, "paid": true, "failed": true, "refunded": true}
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
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM stores WHERE user_id=$1`, c.UserID).Scan(&stores)
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
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM users WHERE role<>'superadmin'`).Scan(&users)
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM stores`).Scan(&stores)
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM products`).Scan(&products)
	_ = s.db.QueryRow(r.Context(), `SELECT count(*),coalesce(sum(total) FILTER (WHERE status<>'canceled'),0) FROM orders`).Scan(&orders, &revenue)
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM subscription_requests WHERE status='pending'`).Scan(&pending)
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM support_tickets WHERE status<>'closed'`).Scan(&openTickets)
	jsonOut(w, 200, map[string]any{"users": users, "stores": stores, "products": products, "orders": orders, "revenue": revenue, "pending_plan_requests": pending, "open_tickets": openTickets})
}

func (s *Server) adminUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT u.id,u.name,coalesce(u.email,''),coalesce(u.phone,''),u.status,u.created_at,coalesce(p.id::text,''),coalesce(p.name,'Sin plan'),coalesce(p.slug,''),(SELECT count(*) FROM stores st WHERE st.user_id=u.id),(coalesce(u.pin_hash,'')<>'') FROM users u LEFT JOIN subscriptions sub ON sub.user_id=u.id LEFT JOIN plans p ON p.id=sub.plan_id WHERE u.role<>'superadmin' ORDER BY u.created_at DESC`)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los usuarios")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, email, phone, status, planID, planName, planSlug string
		var created time.Time
		var stores int
		var pinConfigured bool
		_ = rows.Scan(&id, &name, &email, &phone, &status, &created, &planID, &planName, &planSlug, &stores, &pinConfigured)
		out = append(out, map[string]any{"id": id, "name": name, "email": email, "phone": phone, "status": status, "created_at": created, "plan_id": planID, "plan_name": planName, "plan_slug": planSlug, "stores": stores, "pin_configured": pinConfigured})
	}
	jsonOut(w, 200, out)
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
	_, err := s.db.Exec(r.Context(), `UPDATE users SET status=$1,updated_at=now() WHERE id=$2 AND role<>'superadmin'`, in.Status, id)
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar el usuario")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminSetUserPIN(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		PIN string `json:"pin"`
	}
	if decode(r, &in) != nil || !validPIN(in.PIN) {
		jsonErr(w, 400, "El PIN debe tener exactamente 4 dígitos")
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
	if in.PIN != "" && !validPIN(in.PIN) {
		jsonErr(w, 400, "El PIN debe tener exactamente 4 dígitos")
		return
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
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminStores(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT st.id,st.name,st.slug,st.is_active,st.created_at,u.name,coalesce(u.email,''),(SELECT count(*) FROM products p WHERE p.store_id=st.id),(SELECT count(*) FROM orders o WHERE o.store_id=st.id) FROM stores st JOIN users u ON u.id=st.user_id ORDER BY st.created_at DESC`)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las tiendas")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, slug, owner, email string
		var active bool
		var created time.Time
		var products, orders int
		_ = rows.Scan(&id, &name, &slug, &active, &created, &owner, &email, &products, &orders)
		out = append(out, map[string]any{"id": id, "name": name, "slug": slug, "is_active": active, "created_at": created, "owner": owner, "owner_email": email, "products": products, "orders": orders})
	}
	jsonOut(w, 200, out)
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

func (s *Server) adminSubscriptionRequests(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT sr.id,u.id,u.name,coalesce(u.email,''),coalesce(cp.name,'Sin plan'),rp.id,rp.name,rp.price,coalesce(sr.note,''),sr.status,sr.created_at,sr.reviewed_at FROM subscription_requests sr JOIN users u ON u.id=sr.user_id LEFT JOIN plans cp ON cp.id=sr.current_plan_id JOIN plans rp ON rp.id=sr.requested_plan_id ORDER BY CASE WHEN sr.status='pending' THEN 0 ELSE 1 END,sr.created_at DESC`)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las solicitudes")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, uid, name, email, current, planID, requested, note, status string
		var price float64
		var created time.Time
		var reviewed *time.Time
		_ = rows.Scan(&id, &uid, &name, &email, &current, &planID, &requested, &price, &note, &status, &created, &reviewed)
		out = append(out, map[string]any{"id": id, "user_id": uid, "user_name": name, "user_email": email, "current_plan": current, "requested_plan_id": planID, "requested_plan": requested, "price": price, "note": note, "status": status, "created_at": created, "reviewed_at": reviewed})
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
	rows, err := s.db.Query(r.Context(), `SELECT t.id,u.name,coalesce(u.email,''),coalesce(st.name,''),t.type,t.amount,t.currency,t.status,coalesce(t.reference,''),coalesce(t.description,''),t.created_at FROM transactions t JOIN users u ON u.id=t.user_id LEFT JOIN stores st ON st.id=t.store_id ORDER BY t.created_at DESC LIMIT 1000`)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los movimientos")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, userName, email, store, typ, currency, status, reference, description string
		var amount float64
		var created time.Time
		if rows.Scan(&id, &userName, &email, &store, &typ, &amount, &currency, &status, &reference, &description, &created) == nil {
			out = append(out, map[string]any{"id": id, "user_name": userName, "user_email": email, "store_name": store, "type": typ, "amount": amount, "currency": currency, "status": status, "reference": reference, "description": description, "created_at": created})
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
	var uid, name, email, subject, priority, status string
	var last, created time.Time
	if err := s.db.QueryRow(ctx, `SELECT t.number,t.user_id::text,u.name,coalesce(u.email,''),t.subject,t.priority,t.status,t.last_reply_at,t.created_at FROM support_tickets t JOIN users u ON u.id=t.user_id WHERE t.id=$1`, id).Scan(&number, &uid, &name, &email, &subject, &priority, &status, &last, &created); err != nil {
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
	return map[string]any{"id": id, "number": number, "user_id": uid, "user_name": name, "user_email": email, "subject": subject, "priority": priority, "status": status, "last_reply_at": last, "created_at": created, "messages": messages}, nil
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
	q := `SELECT t.id,t.number,u.name,coalesce(u.email,''),t.subject,t.priority,t.status,t.last_reply_at,t.created_at FROM support_tickets t JOIN users u ON u.id=t.user_id`
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
		var id, name, email, subject, priority, st string
		var number int64
		var last, created time.Time
		if rows.Scan(&id, &number, &name, &email, &subject, &priority, &st, &last, &created) == nil {
			out = append(out, map[string]any{"id": id, "number": number, "user_name": name, "user_email": email, "subject": subject, "priority": priority, "status": st, "last_reply_at": last, "created_at": created})
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
