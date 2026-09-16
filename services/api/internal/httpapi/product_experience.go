package httpapi

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

type productMediaInput struct {
	URL       string `json:"url"`
	AltText   string `json:"alt_text"`
	SortOrder int    `json:"sort_order"`
}

type productTranslationInput struct {
	Locale      string `json:"locale"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type productExperienceInput struct {
	StoreID      string                    `json:"store_id"`
	ProductMedia []productMediaInput       `json:"product_media"`
	Translations []productTranslationInput `json:"product_translations"`
}

func normalizeLocale(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	if len(v) > 10 {
		v = v[:10]
	}
	return v
}

func (s *Server) loadProductExperience(ctx context.Context, productID string) map[string]any {
	media := []map[string]any{}
	if rows, err := s.db.Query(ctx, `SELECT id::text,url,alt_text,sort_order FROM product_media WHERE product_id=$1 ORDER BY sort_order,created_at`, productID); err == nil {
		for rows.Next() {
			var id, url, alt string
			var sortOrder int
			if rows.Scan(&id, &url, &alt, &sortOrder) == nil {
				media = append(media, map[string]any{"id": id, "url": url, "alt_text": alt, "sort_order": sortOrder})
			}
		}
		rows.Close()
	}
	translations := []map[string]any{}
	if rows, err := s.db.Query(ctx, `SELECT locale,name,description FROM product_translations WHERE product_id=$1 ORDER BY locale`, productID); err == nil {
		for rows.Next() {
			var locale, name, description string
			if rows.Scan(&locale, &name, &description) == nil {
				translations = append(translations, map[string]any{"locale": locale, "name": name, "description": description})
			}
		}
		rows.Close()
	}
	var rating float64
	var reviewCount int
	_ = s.db.QueryRow(ctx, `SELECT coalesce(avg(rating),0),count(*)::int FROM product_reviews WHERE product_id=$1 AND status='published'`, productID).Scan(&rating, &reviewCount)
	return map[string]any{"product_media": media, "product_translations": translations, "rating_average": rating, "review_count": reviewCount}
}

func (s *Server) enrichProductExperience(ctx context.Context, product map[string]any) map[string]any {
	id, _ := product["id"].(string)
	if id == "" {
		return product
	}
	for key, value := range s.loadProductExperience(ctx, id) {
		product[key] = value
	}
	return product
}

func (s *Server) getProductExperience(w http.ResponseWriter, r *http.Request) {
	productID := chi.URLParam(r, "id")
	c := claims(r)
	var storeID string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM products WHERE id=$1`, productID).Scan(&storeID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Producto no encontrado")
		return
	}
	jsonOut(w, 200, s.loadProductExperience(r.Context(), productID))
}

func (s *Server) updateProductExperience(w http.ResponseWriter, r *http.Request) {
	productID := chi.URLParam(r, "id")
	var in productExperienceInput
	if decode(r, &in) != nil || strings.TrimSpace(in.StoreID) == "" {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar la experiencia del producto")
		return
	}
	defer tx.Rollback(r.Context())
	var exists bool
	_ = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM products WHERE id=$1 AND store_id=$2)`, productID, in.StoreID).Scan(&exists)
	if !exists {
		jsonErr(w, 404, "Producto no encontrado")
		return
	}
	_, _ = tx.Exec(r.Context(), `DELETE FROM product_media WHERE product_id=$1`, productID)
	for idx, item := range in.ProductMedia {
		url := strings.TrimSpace(item.URL)
		if url == "" {
			continue
		}
		sortOrder := item.SortOrder
		if sortOrder == 0 {
			sortOrder = (idx + 1) * 10
		}
		if _, err = tx.Exec(r.Context(), `INSERT INTO product_media(product_id,url,alt_text,sort_order) VALUES($1,$2,$3,$4)`, productID, url, strings.TrimSpace(item.AltText), sortOrder); err != nil {
			jsonErr(w, 400, "No se pudo guardar una imagen de la galería")
			return
		}
	}
	_, _ = tx.Exec(r.Context(), `DELETE FROM product_translations WHERE product_id=$1`, productID)
	seen := map[string]bool{}
	for _, item := range in.Translations {
		locale := normalizeLocale(item.Locale)
		if locale == "" || locale == "es" || seen[locale] {
			continue
		}
		seen[locale] = true
		if _, err = tx.Exec(r.Context(), `INSERT INTO product_translations(product_id,locale,name,description) VALUES($1,$2,$3,$4)`, productID, locale, strings.TrimSpace(item.Name), strings.TrimSpace(item.Description)); err != nil {
			jsonErr(w, 400, "No se pudo guardar una traducción")
			return
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la experiencia del producto")
		return
	}
	jsonOut(w, 200, s.loadProductExperience(r.Context(), productID))
}

func (s *Server) listPublicReviews(w http.ResponseWriter, r *http.Request) {
	resolved, err := s.resolveStoreHost(r.Context(), s.requestHostname(r))
	if err != nil {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	productID := strings.TrimSpace(r.URL.Query().Get("product_id"))
	args := []any{resolved.StoreID}
	query := `SELECT pr.id::text,pr.product_id::text,p.name,pr.rating,pr.body,pr.verified_purchase,pr.created_at,coalesce(gc.name,'Cliente') FROM product_reviews pr JOIN products p ON p.id=pr.product_id LEFT JOIN global_customers gc ON gc.id=pr.global_customer_id WHERE pr.store_id=$1 AND pr.status='published'`
	if productID != "" {
		query += ` AND pr.product_id=$2`
		args = append(args, productID)
	}
	query += ` ORDER BY pr.created_at DESC LIMIT 100`
	rows, err := s.db.Query(r.Context(), query, args...)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las reseñas")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, pid, productName, body, customerName string
		var rating int
		var verified bool
		var created time.Time
		if rows.Scan(&id, &pid, &productName, &rating, &body, &verified, &created, &customerName) == nil {
			out = append(out, map[string]any{"id": id, "product_id": pid, "product_name": productName, "rating": rating, "body": body, "verified_purchase": verified, "customer_name": customerName, "created_at": created})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) createPublicReview(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var in struct {
		OrderID   string `json:"order_id"`
		ProductID string `json:"product_id"`
		Rating    int    `json:"rating"`
		Body      string `json:"body"`
	}
	if decode(r, &in) != nil || in.Rating < 1 || in.Rating > 5 || strings.TrimSpace(in.OrderID) == "" || strings.TrimSpace(in.ProductID) == "" {
		jsonErr(w, 400, "Completa el pedido, producto y una calificación de 1 a 5")
		return
	}
	storeID := ""
	if resolved, err := s.resolveStoreHost(r.Context(), s.requestHostname(r)); err == nil {
		storeID = resolved.StoreID
	}
	if storeID == "" {
		_ = s.db.QueryRow(r.Context(), `SELECT store_id::text FROM orders WHERE id=$1 AND global_customer_id=$2`, in.OrderID, c.UserID).Scan(&storeID)
	}
	if storeID == "" {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	if blocked, reason := s.customerBlockedInStore(r.Context(), storeID, c.UserID, ""); blocked {
		jsonErr(w, http.StatusForbidden, blockedCustomerMessage(reason))
		return
	}
	var eligible bool
	_ = s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.id=$1 AND o.store_id=$2 AND o.global_customer_id=$3 AND o.status IN ('delivered','picked_up','completed') AND oi.product_id=$4)`, in.OrderID, storeID, c.UserID, in.ProductID).Scan(&eligible)
	if !eligible {
		jsonErr(w, 409, "Solo puedes reseñar productos de pedidos completados")
		return
	}
	var id string
	err := s.db.QueryRow(r.Context(), `INSERT INTO product_reviews(store_id,product_id,order_id,global_customer_id,rating,body,status,verified_purchase) VALUES($1,$2,$3,$4,$5,$6,'pending',true) ON CONFLICT(product_id,order_id,global_customer_id) DO NOTHING RETURNING id::text`, storeID, in.ProductID, in.OrderID, c.UserID, in.Rating, strings.TrimSpace(in.Body)).Scan(&id)
	if err != nil {
		jsonErr(w, 409, "Ya enviaste una reseña para este producto y pedido")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id, "status": "pending", "verified_purchase": true})
}

func (s *Server) listReviews(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT pr.id::text,pr.product_id::text,p.name,pr.order_id::text,pr.rating,pr.body,pr.status,pr.verified_purchase,pr.created_at,coalesce(gc.name,'Cliente'),coalesce(gc.phone,'') FROM product_reviews pr JOIN products p ON p.id=pr.product_id LEFT JOIN global_customers gc ON gc.id=pr.global_customer_id WHERE pr.store_id=$1 ORDER BY pr.created_at DESC LIMIT 500`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las reseñas")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, productID, productName, orderID, body, status, customerName, phone string
		var rating int
		var verified bool
		var created time.Time
		if rows.Scan(&id, &productID, &productName, &orderID, &rating, &body, &status, &verified, &created, &customerName, &phone) == nil {
			out = append(out, map[string]any{"id": id, "product_id": productID, "product_name": productName, "order_id": orderID, "rating": rating, "body": body, "status": status, "verified_purchase": verified, "customer_name": customerName, "customer_phone": phone, "created_at": created})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) updateReviewStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		Status string `json:"status"`
	}
	if decode(r, &in) != nil || (in.Status != "published" && in.Status != "hidden" && in.Status != "pending") {
		jsonErr(w, 400, "Estado de reseña inválido")
		return
	}
	c := claims(r)
	var storeID string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM product_reviews WHERE id=$1`, id).Scan(&storeID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Reseña no encontrada")
		return
	}
	_, err := s.db.Exec(r.Context(), `UPDATE product_reviews SET status=$1,updated_at=now() WHERE id=$2`, in.Status, id)
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar la reseña")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}
