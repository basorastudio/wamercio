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
		api.Post("/auth/login", s.login)
		api.Post("/auth/register", s.register)
		api.Post("/auth/logout", s.logout)
		api.Get("/plans", s.listPlans)
		api.Get("/public/stores/{slug}", s.publicStore)
		api.Post("/public/stores/{slug}/checkout", s.checkout)
		api.Post("/internal/whatsapp/events", s.whatsappEvent)
		api.Group(func(p chi.Router) {
			p.Use(s.requireAuth)
			p.Get("/me", s.me)
			p.Get("/dashboard", s.dashboard)
			p.Get("/stores", s.listStores)
			p.Post("/stores", s.createStore)
			p.Put("/stores/{id}", s.updateStore)
			p.Delete("/stores/{id}", s.deleteStore)
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
			p.Post("/uploads", s.upload)
			p.Get("/whatsapp/{storeID}/status", s.whatsappStatus)
			p.Post("/whatsapp/{storeID}/connect", s.whatsappConnect)
			p.Post("/whatsapp/{storeID}/disconnect", s.whatsappDisconnect)
			p.Post("/whatsapp/{storeID}/send", s.whatsappSend)
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

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := ""
		if c, err := r.Cookie("wamercio_token"); err == nil {
			token = c.Value
		}
		if token == "" {
			h := r.Header.Get("Authorization")
			if strings.HasPrefix(h, "Bearer ") {
				token = strings.TrimPrefix(h, "Bearer ")
			}
		}
		if token == "" {
			jsonErr(w, 401, "Sesión requerida")
			return
		}
		c, err := authpkg.Parse(s.cfg.JWTSecret, token)
		if err != nil {
			jsonErr(w, 401, "Sesión inválida o vencida")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), claimsKey, c)))
	})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var in struct{ Email, Password string }
	if decode(r, &in) != nil || in.Email == "" || in.Password == "" {
		jsonErr(w, 400, "Correo y contraseña son obligatorios")
		return
	}
	var id, name, email, hash, role, status string
	err := s.db.QueryRow(r.Context(), `SELECT id,name,email,password_hash,role,status FROM users WHERE lower(email)=lower($1)`, in.Email).Scan(&id, &name, &email, &hash, &role, &status)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil || status != "active" {
		jsonErr(w, 401, "Credenciales inválidas")
		return
	}
	tok, err := authpkg.Sign(s.cfg.JWTSecret, id, role)
	if err != nil {
		jsonErr(w, 500, "No se pudo crear la sesión")
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "wamercio_token", Value: tok, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: strings.HasPrefix(s.cfg.AppURL, "https://"), MaxAge: 7 * 24 * 3600})
	jsonOut(w, 200, map[string]any{"user": map[string]any{"id": id, "name": name, "email": email, "role": role}})
}
func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Phone    string `json:"phone"`
		Password string `json:"password"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" || strings.TrimSpace(in.Email) == "" || len(in.Password) < 8 {
		jsonErr(w, 400, "Nombre, correo y una contraseña de al menos 8 caracteres son obligatorios")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
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
	err = tx.QueryRow(r.Context(), `INSERT INTO users(name,email,phone,password_hash,role,status) VALUES($1,lower($2),$3,$4,'owner','active') RETURNING id`, strings.TrimSpace(in.Name), strings.TrimSpace(in.Email), strings.TrimSpace(in.Phone), string(hash)).Scan(&id)
	if err != nil {
		jsonErr(w, 409, "Ya existe una cuenta con ese correo")
		return
	}
	var planID string
	if err = tx.QueryRow(r.Context(), `SELECT id FROM plans WHERE slug='emprende' AND is_active=true LIMIT 1`).Scan(&planID); err == nil {
		_, _ = tx.Exec(r.Context(), `INSERT INTO subscriptions(user_id,plan_id,status) VALUES($1,$2,'active') ON CONFLICT(user_id) DO NOTHING`, id, planID)
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
	http.SetCookie(w, &http.Cookie{Name: "wamercio_token", Value: tok, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: strings.HasPrefix(s.cfg.AppURL, "https://"), MaxAge: 7 * 24 * 3600})
	jsonOut(w, 201, map[string]any{"user": map[string]any{"id": id, "name": in.Name, "email": strings.ToLower(in.Email), "role": "owner"}})
}
func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: "wamercio_token", Value: "", Path: "/", HttpOnly: true, MaxAge: -1})
	jsonOut(w, 200, map[string]bool{"ok": true})
}
func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var name, email, phone, role string
	var created time.Time
	err := s.db.QueryRow(r.Context(), `SELECT name,email,coalesce(phone,''),role,created_at FROM users WHERE id=$1`, c.UserID).Scan(&name, &email, &phone, &role, &created)
	if err != nil {
		jsonErr(w, 404, "Usuario no encontrado")
		return
	}
	jsonOut(w, 200, map[string]any{"id": c.UserID, "name": name, "email": email, "phone": phone, "role": role, "created_at": created})
}

func (s *Server) dashboard(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var stores, products, orders int
	var revenue float64
	_ = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM stores WHERE user_id=$1`, c.UserID).Scan(&stores)
	_ = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM products p JOIN stores s ON s.id=p.store_id WHERE s.user_id=$1`, c.UserID).Scan(&products)
	_ = s.db.QueryRow(r.Context(), `SELECT COUNT(*),coalesce(sum(o.total) FILTER (WHERE o.status!='canceled'),0) FROM orders o JOIN stores s ON s.id=o.store_id WHERE s.user_id=$1`, c.UserID).Scan(&orders, &revenue)
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
	jsonOut(w, 200, map[string]any{"metrics": map[string]any{"stores": stores, "products": products, "orders": orders, "revenue": revenue}, "recent_orders": recent})
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
	var in struct{ Name, Slug, Description, LogoURL, Phone, Whatsapp, Address, PrimaryColor string }
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
		Name, Slug, Description, LogoURL, Phone, Whatsapp, Address, PrimaryColor string
		IsActive                                                                 *bool
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
		StoreID, Name, Slug, Description, ImageURL string
		SortOrder                                  int
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
		StoreID, Name, Slug, Description, ImageURL string
		SortOrder                                  int
		IsActive                                   bool
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
	var id, sid, cid, name, slug, sku, desc, img string
	var price float64
	var compare, stock float64
	var track, active bool
	var variants, extras []byte
	var created, updated time.Time
	err := rows.Scan(&id, &sid, &cid, &name, &slug, &sku, &desc, &img, &price, &compare, &stock, &track, &variants, &extras, &active, &created, &updated)
	if err != nil {
		return nil, err
	}
	var v, e any
	_ = json.Unmarshal(variants, &v)
	_ = json.Unmarshal(extras, &e)
	return map[string]any{"id": id, "store_id": sid, "category_id": cid, "name": name, "slug": slug, "sku": sku, "description": desc, "image_url": img, "price": price, "compare_price": compare, "stock": stock, "track_stock": track, "variants": v, "extras": e, "is_active": active, "created_at": created, "updated_at": updated}, nil
}
func (s *Server) listProducts(w http.ResponseWriter, r *http.Request) {
	sid, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id,store_id,coalesce(category_id::text,''),name,slug,coalesce(sku,''),coalesce(description,''),coalesce(image_url,''),price,coalesce(compare_price,0),coalesce(stock,0),track_stock,variants,extras,is_active,created_at,updated_at FROM products WHERE store_id=$1 ORDER BY created_at DESC`, sid)
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
		StoreID, CategoryID, Name, Slug, SKU, Description, ImageURL string
		Price                                                       float64
		ComparePrice                                                *float64
		Stock                                                       *float64
		TrackStock                                                  bool
		Variants, Extras                                            json.RawMessage
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
	err := s.db.QueryRow(r.Context(), `INSERT INTO products(store_id,category_id,name,slug,sku,description,image_url,price,compare_price,stock,track_stock,variants,extras) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`, in.StoreID, cat, in.Name, slugify(firstNonEmpty(in.Slug, in.Name)), in.SKU, in.Description, in.ImageURL, in.Price, in.ComparePrice, in.Stock, in.TrackStock, in.Variants, in.Extras).Scan(&id)
	if err != nil {
		jsonErr(w, 409, "No se pudo crear el producto")
		return
	}
	jsonOut(w, 201, map[string]string{"id": id})
}
func (s *Server) updateProduct(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		StoreID, CategoryID, Name, Slug, SKU, Description, ImageURL string
		Price                                                       float64
		ComparePrice                                                *float64
		Stock                                                       *float64
		TrackStock                                                  bool
		Variants, Extras                                            json.RawMessage
		IsActive                                                    bool
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
	_, err := s.db.Exec(r.Context(), `UPDATE products SET category_id=$1,name=$2,slug=$3,sku=$4,description=$5,image_url=$6,price=$7,compare_price=$8,stock=$9,track_stock=$10,variants=$11,extras=$12,is_active=$13,updated_at=now() WHERE id=$14 AND store_id=$15`, cat, in.Name, slugify(firstNonEmpty(in.Slug, in.Name)), in.SKU, in.Description, in.ImageURL, in.Price, in.ComparePrice, in.Stock, in.TrackStock, in.Variants, in.Extras, in.IsActive, id, in.StoreID)
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
		StoreID, Code, DiscountType string
		DiscountValue, MinOrder     float64
		UsageLimit                  *int
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
		StoreID, Code, DiscountType string
		DiscountValue, MinOrder     float64
		UsageLimit                  *int
		IsActive                    bool
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
		StoreID, Name    string
		Charge           float64
		EstimatedMinutes int
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
		StoreID, Name    string
		Charge           float64
		EstimatedMinutes int
		IsActive         bool
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
	rows, err := s.db.Query(r.Context(), `SELECT id,order_number,customer_name,customer_phone,total,payment_method,payment_status,status,source,created_at FROM orders WHERE store_id=$1 ORDER BY created_at DESC LIMIT 500`, sid)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, phone, pm, ps, st, source string
		var num int64
		var total float64
		var cr time.Time
		_ = rows.Scan(&id, &num, &name, &phone, &total, &pm, &ps, &st, &source, &cr)
		out = append(out, map[string]any{"id": id, "number": num, "customer_name": name, "customer_phone": phone, "total": total, "payment_method": pm, "payment_status": ps, "status": st, "source": source, "created_at": cr})
	}
	jsonOut(w, 200, out)
}
func (s *Server) getOrder(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c := claims(r)
	var sid, name, phone, email, address, coupon, pm, ps, status, notes, source string
	var num int64
	var subtotal, discount, shipping, total float64
	var cr time.Time
	err := s.db.QueryRow(r.Context(), `SELECT o.store_id,o.order_number,o.customer_name,o.customer_phone,coalesce(o.customer_email,''),coalesce(o.delivery_address,''),coalesce(o.coupon_code,''),o.subtotal,o.discount,o.shipping,o.total,o.payment_method,o.payment_status,o.status,coalesce(o.notes,''),o.source,o.created_at FROM orders o WHERE o.id=$1`, id).Scan(&sid, &num, &name, &phone, &email, &address, &coupon, &subtotal, &discount, &shipping, &total, &pm, &ps, &status, &notes, &source, &cr)
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
	jsonOut(w, 200, map[string]any{"id": id, "store_id": sid, "number": num, "customer_name": name, "customer_phone": phone, "customer_email": email, "delivery_address": address, "coupon_code": coupon, "subtotal": subtotal, "discount": discount, "shipping": shipping, "total": total, "payment_method": pm, "payment_status": ps, "status": status, "notes": notes, "source": source, "created_at": cr, "items": items})
}
func (s *Server) updateOrderStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct{ Status, PaymentStatus string }
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	var sid, phone string
	var num int64
	if s.db.QueryRow(r.Context(), `SELECT store_id,customer_phone,order_number FROM orders WHERE id=$1`, id).Scan(&sid, &phone, &num) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, sid) {
		jsonErr(w, 404, "Pedido no encontrado")
		return
	}
	valid := map[string]bool{"pending": true, "processing": true, "out_for_delivery": true, "delivered": true, "canceled": true}
	if !valid[in.Status] {
		jsonErr(w, 400, "Estado no válido")
		return
	}
	if in.PaymentStatus == "" {
		_, _ = s.db.Exec(r.Context(), `UPDATE orders SET status=$1,updated_at=now() WHERE id=$2`, in.Status, id)
	} else {
		_, _ = s.db.Exec(r.Context(), `UPDATE orders SET status=$1,payment_status=$2,updated_at=now() WHERE id=$3`, in.Status, in.PaymentStatus, id)
	}
	go s.trySendWhatsApp(context.Background(), sid, phone, fmt.Sprintf("Actualización de tu pedido #%d: %s", num, spanishStatus(in.Status)))
	jsonOut(w, 200, map[string]bool{"ok": true})
}
func spanishStatus(v string) string {
	return map[string]string{"pending": "Pendiente", "processing": "En proceso", "out_for_delivery": "En camino", "delivered": "Entregado", "canceled": "Cancelado"}[v]
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
	var sid, name, desc, logo, phone, wa, address, currency, color string
	err := s.db.QueryRow(r.Context(), `SELECT id,name,coalesce(description,''),coalesce(logo_url,''),coalesce(phone,''),coalesce(whatsapp,''),coalesce(address,''),currency,primary_color FROM stores WHERE slug=$1 AND is_active=true`, slug).Scan(&sid, &name, &desc, &logo, &phone, &wa, &address, &currency, &color)
	if err != nil {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
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
	pr, _ := s.db.Query(r.Context(), `SELECT id,store_id,coalesce(category_id::text,''),name,slug,coalesce(sku,''),coalesce(description,''),coalesce(image_url,''),price,coalesce(compare_price,0),coalesce(stock,0),track_stock,variants,extras,is_active,created_at,updated_at FROM products WHERE store_id=$1 AND is_active=true ORDER BY created_at DESC`, sid)
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
	jsonOut(w, 200, map[string]any{"store": map[string]any{"id": sid, "name": name, "slug": slug, "description": desc, "logo_url": logo, "phone": phone, "whatsapp": wa, "address": address, "currency": currency, "primary_color": color}, "categories": cats, "products": prods, "shipping_zones": zones})
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
		CustomerName, CustomerPhone, CustomerEmail, DeliveryAddress, ShippingZoneID, CouponCode, PaymentMethod, Notes string
		Items                                                                                                         []checkoutItem `json:"items"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.CustomerName) == "" || strings.TrimSpace(in.CustomerPhone) == "" || len(in.Items) == 0 {
		jsonErr(w, 400, "Completa cliente, teléfono y productos")
		return
	}
	var sid, ownerID string
	if s.db.QueryRow(r.Context(), `SELECT id,user_id FROM stores WHERE slug=$1 AND is_active=true`, slug).Scan(&sid, &ownerID) != nil {
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
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo iniciar el pedido")
		return
	}
	defer tx.Rollback(r.Context())
	type priceOption struct {
		Name  string  `json:"name"`
		Price float64 `json:"price"`
	}
	type resolved struct {
		pid, name, variant string
		extras             []map[string]any
		unit, qty, line    float64
	}
	resolvedItems := []resolved{}
	subtotal := 0.0
	for _, it := range in.Items {
		if it.Quantity <= 0 || it.Quantity > 999 {
			continue
		}
		var name string
		var base float64
		var active bool
		var variantsRaw, extrasRaw []byte
		if tx.QueryRow(r.Context(), `SELECT name,price,is_active,variants,extras FROM products WHERE id=$1 AND store_id=$2`, it.ProductID, sid).Scan(&name, &base, &active, &variantsRaw, &extrasRaw) != nil || !active {
			jsonErr(w, 400, "Uno de los productos ya no está disponible")
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
		resolvedItems = append(resolvedItems, resolved{it.ProductID, name, variantName, normalizedExtras, unit, it.Quantity, line})
	}
	if len(resolvedItems) == 0 {
		jsonErr(w, 400, "El pedido no contiene productos válidos")
		return
	}
	discount := 0.0
	if strings.TrimSpace(in.CouponCode) != "" {
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
	if in.ShippingZoneID != "" {
		if tx.QueryRow(r.Context(), `SELECT charge FROM shipping_zones WHERE id=$1 AND store_id=$2 AND is_active=true`, in.ShippingZoneID, sid).Scan(&shipping) == nil {
			zone = in.ShippingZoneID
		} else {
			jsonErr(w, 400, "Zona de delivery inválida")
			return
		}
	}
	allowedPayments := map[string]bool{"cash": true, "bank_transfer": true, "cash_on_delivery": true}
	if !allowedPayments[in.PaymentMethod] {
		in.PaymentMethod = "cash_on_delivery"
	}
	total := subtotal - discount + shipping
	var orderID string
	var num int64
	err = tx.QueryRow(r.Context(), `INSERT INTO orders(store_id,customer_name,customer_phone,customer_email,delivery_address,shipping_zone_id,coupon_code,subtotal,discount,shipping,total,payment_method,notes,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'web') RETURNING id,order_number`, sid, strings.TrimSpace(in.CustomerName), strings.TrimSpace(in.CustomerPhone), strings.TrimSpace(in.CustomerEmail), strings.TrimSpace(in.DeliveryAddress), zone, strings.ToUpper(strings.TrimSpace(in.CouponCode)), subtotal, discount, shipping, total, in.PaymentMethod, in.Notes).Scan(&orderID, &num)
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
	}
	if err := tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar el pedido")
		return
	}
	go s.trySendWhatsApp(context.Background(), sid, in.CustomerPhone, fmt.Sprintf("¡Gracias %s! Recibimos tu pedido #%d por RD$ %.2f. Estado: Pendiente.", in.CustomerName, num, total))
	jsonOut(w, 201, map[string]any{"id": orderID, "number": num, "subtotal": subtotal, "discount": discount, "shipping": shipping, "total": total, "status": "pending"})
}
func (s *Server) listPlans(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT id,name,slug,price,billing_period,max_stores,max_products,max_orders,whatsapp_enabled FROM plans WHERE is_active=true ORDER BY price`)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, n, sl, bill string
		var price float64
		var stores, products, orders int
		var wa bool
		_ = rows.Scan(&id, &n, &sl, &price, &bill, &stores, &products, &orders, &wa)
		out = append(out, map[string]any{"id": id, "name": n, "slug": sl, "price": price, "billing_period": bill, "max_stores": stores, "max_products": products, "max_orders": orders, "whatsapp_enabled": wa})
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
