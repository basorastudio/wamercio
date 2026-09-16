package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

type promotionInput struct {
	StoreID       string     `json:"store_id"`
	Name          string     `json:"name"`
	DiscountType  string     `json:"discount_type"`
	DiscountValue float64    `json:"discount_value"`
	Scope         string     `json:"scope"`
	MinOrder      float64    `json:"min_order"`
	StartsAt      *time.Time `json:"starts_at"`
	EndsAt        *time.Time `json:"ends_at"`
	UsageLimit    *int       `json:"usage_limit"`
	IsActive      *bool      `json:"is_active"`
	ProductIDs    []string   `json:"product_ids"`
	CategoryIDs   []string   `json:"category_ids"`
}

type promotionCheckoutLine struct {
	ProductID  string
	CategoryID string
	LineTotal  float64
}

type promotionCandidate struct {
	ID       string
	Name     string
	Discount float64
}

func validatePromotionInput(in *promotionInput) error {
	in.StoreID = strings.TrimSpace(in.StoreID)
	in.Name = strings.TrimSpace(in.Name)
	in.DiscountType = strings.ToLower(strings.TrimSpace(in.DiscountType))
	in.Scope = strings.ToLower(strings.TrimSpace(in.Scope))
	if in.StoreID == "" || in.Name == "" {
		return fmt.Errorf("Completa el negocio y el nombre de la promoción")
	}
	if in.DiscountType != "flat" && in.DiscountType != "percentage" {
		return fmt.Errorf("Tipo de descuento inválido")
	}
	if in.DiscountValue <= 0 {
		return fmt.Errorf("El descuento debe ser mayor que cero")
	}
	if in.DiscountType == "percentage" && in.DiscountValue > 100 {
		return fmt.Errorf("El porcentaje no puede superar 100%%")
	}
	if in.Scope != "all" && in.Scope != "products" && in.Scope != "categories" {
		return fmt.Errorf("Alcance de promoción inválido")
	}
	if in.Scope == "products" && len(in.ProductIDs) == 0 {
		return fmt.Errorf("Selecciona al menos un producto")
	}
	if in.Scope == "categories" && len(in.CategoryIDs) == 0 {
		return fmt.Errorf("Selecciona al menos una categoría")
	}
	if in.StartsAt != nil && in.EndsAt != nil && in.EndsAt.Before(*in.StartsAt) {
		return fmt.Errorf("La fecha final debe ser posterior a la inicial")
	}
	if in.UsageLimit != nil && *in.UsageLimit < 1 {
		return fmt.Errorf("El límite de usos debe ser mayor que cero")
	}
	if in.MinOrder < 0 {
		in.MinOrder = 0
	}
	return nil
}

func (s *Server) listPromotions(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id::text,name,discount_type,discount_value,scope,min_order,starts_at,ends_at,usage_limit,used_count,is_active,created_at,updated_at FROM promotions WHERE store_id=$1 ORDER BY created_at DESC`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las promociones")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, typ, scope string
		var value, minOrder float64
		var startsAt, endsAt *time.Time
		var usageLimit *int
		var usedCount int
		var active bool
		var createdAt, updatedAt time.Time
		if rows.Scan(&id, &name, &typ, &value, &scope, &minOrder, &startsAt, &endsAt, &usageLimit, &usedCount, &active, &createdAt, &updatedAt) != nil {
			continue
		}
		productIDs := []string{}
		categoryIDs := []string{}
		if targets, qerr := s.db.Query(r.Context(), `SELECT product_id::text FROM promotion_products WHERE promotion_id=$1 ORDER BY product_id`, id); qerr == nil {
			for targets.Next() {
				var target string
				if targets.Scan(&target) == nil {
					productIDs = append(productIDs, target)
				}
			}
			targets.Close()
		}
		if targets, qerr := s.db.Query(r.Context(), `SELECT category_id::text FROM promotion_categories WHERE promotion_id=$1 ORDER BY category_id`, id); qerr == nil {
			for targets.Next() {
				var target string
				if targets.Scan(&target) == nil {
					categoryIDs = append(categoryIDs, target)
				}
			}
			targets.Close()
		}
		out = append(out, map[string]any{
			"id": id, "name": name, "discount_type": typ, "discount_value": value, "scope": scope, "min_order": minOrder,
			"starts_at": startsAt, "ends_at": endsAt, "usage_limit": usageLimit, "used_count": usedCount, "is_active": active,
			"product_ids": productIDs, "category_ids": categoryIDs, "created_at": createdAt, "updated_at": updatedAt,
		})
	}
	jsonOut(w, 200, out)
}

func replacePromotionTargets(ctx context.Context, tx pgx.Tx, promotionID, scope string, productIDs, categoryIDs []string) error {
	if _, err := tx.Exec(ctx, `DELETE FROM promotion_products WHERE promotion_id=$1`, promotionID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM promotion_categories WHERE promotion_id=$1`, promotionID); err != nil {
		return err
	}
	if scope == "products" {
		for _, id := range productIDs {
			id = strings.TrimSpace(id)
			if id == "" {
				continue
			}
			if _, err := tx.Exec(ctx, `INSERT INTO promotion_products(promotion_id,product_id) SELECT $1,p.id FROM products p JOIN promotions pr ON pr.id=$1 WHERE p.id=$2 AND p.store_id=pr.store_id ON CONFLICT DO NOTHING`, promotionID, id); err != nil {
				return err
			}
		}
	}
	if scope == "categories" {
		for _, id := range categoryIDs {
			id = strings.TrimSpace(id)
			if id == "" {
				continue
			}
			if _, err := tx.Exec(ctx, `INSERT INTO promotion_categories(promotion_id,category_id) SELECT $1,c.id FROM categories c JOIN promotions pr ON pr.id=$1 WHERE c.id=$2 AND c.store_id=pr.store_id ON CONFLICT DO NOTHING`, promotionID, id); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Server) createPromotion(w http.ResponseWriter, r *http.Request) {
	var in promotionInput
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	if err := validatePromotionInput(&in); err != nil {
		jsonErr(w, 400, err.Error())
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo iniciar la promoción")
		return
	}
	defer tx.Rollback(r.Context())
	var id string
	if err = tx.QueryRow(r.Context(), `INSERT INTO promotions(store_id,name,discount_type,discount_value,scope,min_order,starts_at,ends_at,usage_limit,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true) RETURNING id::text`, in.StoreID, in.Name, in.DiscountType, in.DiscountValue, in.Scope, in.MinOrder, in.StartsAt, in.EndsAt, in.UsageLimit).Scan(&id); err != nil {
		jsonErr(w, 409, "No se pudo crear la promoción")
		return
	}
	if err = replacePromotionTargets(r.Context(), tx, id, in.Scope, in.ProductIDs, in.CategoryIDs); err != nil {
		jsonErr(w, 400, "Uno de los productos o categorías no pertenece al negocio")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo guardar la promoción")
		return
	}
	if in.StartsAt == nil || !in.StartsAt.After(time.Now()) {
		go s.triggerAutomationEvent(context.Background(), in.StoreID, automationPromotionStarted, map[string]string{"entity_id": id, "promocion": in.Name})
	}
	jsonOut(w, 201, map[string]string{"id": id})
}

func (s *Server) updatePromotion(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in promotionInput
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	if err := validatePromotionInput(&in); err != nil {
		jsonErr(w, 400, err.Error())
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	active := true
	if in.IsActive != nil {
		active = *in.IsActive
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar la promoción")
		return
	}
	defer tx.Rollback(r.Context())
	res, err := tx.Exec(r.Context(), `UPDATE promotions SET name=$1,discount_type=$2,discount_value=$3,scope=$4,min_order=$5,starts_at=$6,ends_at=$7,usage_limit=$8,is_active=$9,updated_at=now() WHERE id=$10 AND store_id=$11`, in.Name, in.DiscountType, in.DiscountValue, in.Scope, in.MinOrder, in.StartsAt, in.EndsAt, in.UsageLimit, active, id, in.StoreID)
	if err != nil || res.RowsAffected() == 0 {
		jsonErr(w, 404, "Promoción no encontrada")
		return
	}
	if err = replacePromotionTargets(r.Context(), tx, id, in.Scope, in.ProductIDs, in.CategoryIDs); err != nil {
		jsonErr(w, 400, "Uno de los productos o categorías no pertenece al negocio")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la promoción")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) deletePromotion(w http.ResponseWriter, r *http.Request) {
	s.deleteStoreChild(w, r, "promotions")
}

func bestPromotionForCheckout(ctx context.Context, tx pgx.Tx, storeID string, subtotal float64, lines []promotionCheckoutLine) (promotionCandidate, error) {
	best := promotionCandidate{}
	rows, err := tx.Query(ctx, `SELECT id::text,name,discount_type,discount_value,scope,min_order FROM promotions WHERE store_id=$1 AND is_active=true AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>=now()) AND (usage_limit IS NULL OR used_count<usage_limit) ORDER BY created_at DESC FOR UPDATE`, storeID)
	if err != nil {
		return best, err
	}
	defer rows.Close()
	type row struct {
		id, name, typ, scope string
		value, minOrder      float64
	}
	promotions := []row{}
	for rows.Next() {
		var p row
		if rows.Scan(&p.id, &p.name, &p.typ, &p.value, &p.scope, &p.minOrder) == nil {
			promotions = append(promotions, p)
		}
	}
	// pgx transactions cannot run another query while a previous Rows is still open.
	// Materialize the candidates first, then resolve their product/category targets.
	rows.Close()
	for _, p := range promotions {
		if subtotal < p.minOrder {
			continue
		}
		eligible := 0.0
		switch p.scope {
		case "all":
			eligible = subtotal
		case "products":
			targets := map[string]bool{}
			targetRows, qerr := tx.Query(ctx, `SELECT product_id::text FROM promotion_products WHERE promotion_id=$1`, p.id)
			if qerr != nil {
				return best, qerr
			}
			for targetRows.Next() {
				var id string
				if targetRows.Scan(&id) == nil {
					targets[id] = true
				}
			}
			targetRows.Close()
			for _, line := range lines {
				if targets[line.ProductID] {
					eligible += line.LineTotal
				}
			}
		case "categories":
			targets := map[string]bool{}
			targetRows, qerr := tx.Query(ctx, `SELECT category_id::text FROM promotion_categories WHERE promotion_id=$1`, p.id)
			if qerr != nil {
				return best, qerr
			}
			for targetRows.Next() {
				var id string
				if targetRows.Scan(&id) == nil {
					targets[id] = true
				}
			}
			targetRows.Close()
			for _, line := range lines {
				if targets[line.CategoryID] {
					eligible += line.LineTotal
				}
			}
		}
		if eligible <= 0 {
			continue
		}
		discount := p.value
		if p.typ == "percentage" {
			discount = eligible * (p.value / 100)
		}
		if discount > eligible {
			discount = eligible
		}
		if discount > best.Discount {
			best = promotionCandidate{ID: p.id, Name: p.name, Discount: discount}
		}
	}
	return best, nil
}

func analyticsRange(value string) (string, int) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "7d":
		return "7d", 7
	case "90d":
		return "90d", 90
	default:
		return "30d", 30
	}
}

func (s *Server) storeAnalytics(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rangeName, days := analyticsRange(r.URL.Query().Get("range"))
	since := time.Now().AddDate(0, 0, -(days - 1)).Truncate(24 * time.Hour)
	previousSince := since.AddDate(0, 0, -days)
	var orders, customers int
	var revenue, average float64
	_ = s.db.QueryRow(r.Context(), `SELECT count(*)::int,coalesce(sum(total),0),coalesce(avg(total),0),count(DISTINCT coalesce(global_customer_id::text,nullif(regexp_replace(customer_phone,'[^0-9]','','g'),'')))::int FROM orders WHERE store_id=$1 AND created_at>=$2 AND status<>'canceled' AND flow_type<>'quote'`, storeID, since).Scan(&orders, &revenue, &average, &customers)

	previousPeriod := map[string]any{"orders": 0, "revenue": 0.0, "average_ticket": 0.0, "customers": 0}
	var previousOrders, previousCustomers int
	var previousRevenue, previousAverage float64
	_ = s.db.QueryRow(r.Context(), `SELECT count(*)::int,coalesce(sum(total),0),coalesce(avg(total),0),count(DISTINCT coalesce(global_customer_id::text,nullif(regexp_replace(customer_phone,'[^0-9]','','g'),'')))::int FROM orders WHERE store_id=$1 AND created_at>=$2 AND created_at<$3 AND status<>'canceled' AND flow_type<>'quote'`, storeID, previousSince, since).Scan(&previousOrders, &previousRevenue, &previousAverage, &previousCustomers)
	previousPeriod = map[string]any{"orders": previousOrders, "revenue": previousRevenue, "average_ticket": previousAverage, "customers": previousCustomers}

	var repeatCustomers int
	_ = s.db.QueryRow(r.Context(), `SELECT count(*)::int FROM (SELECT coalesce(global_customer_id::text,nullif(regexp_replace(customer_phone,'[^0-9]','','g'),'')) identity FROM orders WHERE store_id=$1 AND created_at>=$2 AND status<>'canceled' AND flow_type<>'quote' GROUP BY 1 HAVING count(*)>1) q WHERE identity IS NOT NULL`, storeID, since).Scan(&repeatCustomers)
	repeatCustomerRate := 0.0
	if customers > 0 {
		repeatCustomerRate = float64(repeatCustomers) * 100 / float64(customers)
	}
	var allOrders, canceledOrders int
	_ = s.db.QueryRow(r.Context(), `SELECT count(*)::int,count(*) FILTER(WHERE status='canceled')::int FROM orders WHERE store_id=$1 AND created_at>=$2 AND flow_type<>'quote'`, storeID, since).Scan(&allOrders, &canceledOrders)
	cancellationRate := 0.0
	if allOrders > 0 {
		cancellationRate = float64(canceledOrders) * 100 / float64(allOrders)
	}

	daily := []map[string]any{}
	if rows, err := s.db.Query(r.Context(), `SELECT to_char(date_trunc('day',created_at),'YYYY-MM-DD'),count(*)::int,coalesce(sum(total),0) FROM orders WHERE store_id=$1 AND created_at>=$2 AND status<>'canceled' AND flow_type<>'quote' GROUP BY 1 ORDER BY 1`, storeID, since); err == nil {
		for rows.Next() {
			var day string
			var count int
			var total float64
			if rows.Scan(&day, &count, &total) == nil {
				daily = append(daily, map[string]any{"date": day, "orders": count, "revenue": total})
			}
		}
		rows.Close()
	}
	fulfillment := []map[string]any{}
	if rows, err := s.db.Query(r.Context(), `SELECT delivery_type,count(*)::int,coalesce(sum(total),0) FROM orders WHERE store_id=$1 AND created_at>=$2 AND status<>'canceled' AND flow_type<>'quote' GROUP BY delivery_type ORDER BY 3 DESC`, storeID, since); err == nil {
		for rows.Next() {
			var name string
			var count int
			var total float64
			if rows.Scan(&name, &count, &total) == nil {
				fulfillment = append(fulfillment, map[string]any{"name": name, "orders": count, "revenue": total})
			}
		}
		rows.Close()
	}
	payments := []map[string]any{}
	if rows, err := s.db.Query(r.Context(), `SELECT payment_method,count(*)::int,coalesce(sum(total),0) FROM orders WHERE store_id=$1 AND created_at>=$2 AND status<>'canceled' AND flow_type<>'quote' GROUP BY payment_method ORDER BY 3 DESC`, storeID, since); err == nil {
		for rows.Next() {
			var name string
			var count int
			var total float64
			if rows.Scan(&name, &count, &total) == nil {
				payments = append(payments, map[string]any{"name": name, "orders": count, "revenue": total})
			}
		}
		rows.Close()
	}
	sourceBreakdown := []map[string]any{}
	if rows, err := s.db.Query(r.Context(), `SELECT coalesce(nullif(source,''),'storefront'),count(*)::int,coalesce(sum(total),0) FROM orders WHERE store_id=$1 AND created_at>=$2 AND status<>'canceled' AND flow_type<>'quote' GROUP BY 1 ORDER BY 3 DESC`, storeID, since); err == nil {
		for rows.Next() {
			var name string
			var count int
			var total float64
			if rows.Scan(&name, &count, &total) == nil {
				sourceBreakdown = append(sourceBreakdown, map[string]any{"name": name, "orders": count, "revenue": total})
			}
		}
		rows.Close()
	}
	topProducts := []map[string]any{}
	if rows, err := s.db.Query(r.Context(), `SELECT oi.product_name,coalesce(sum(oi.quantity),0),coalesce(sum(oi.line_total),0) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.store_id=$1 AND o.created_at>=$2 AND o.status<>'canceled' AND o.flow_type<>'quote' GROUP BY oi.product_name ORDER BY 3 DESC LIMIT 10`, storeID, since); err == nil {
		for rows.Next() {
			var name string
			var quantity, total float64
			if rows.Scan(&name, &quantity, &total) == nil {
				topProducts = append(topProducts, map[string]any{"name": name, "quantity": quantity, "revenue": total})
			}
		}
		rows.Close()
	}
	promotions := []map[string]any{}
	promotionOrders := 0
	if rows, err := s.db.Query(r.Context(), `SELECT promotion_name,count(*)::int,coalesce(sum(discount),0),coalesce(sum(total),0) FROM orders WHERE store_id=$1 AND created_at>=$2 AND status<>'canceled' AND flow_type<>'quote' AND promotion_id IS NOT NULL GROUP BY promotion_name ORDER BY 4 DESC`, storeID, since); err == nil {
		for rows.Next() {
			var name string
			var count int
			var discount, total float64
			if rows.Scan(&name, &count, &discount, &total) == nil {
				promotionOrders += count
				promotions = append(promotions, map[string]any{"name": name, "orders": count, "discount": discount, "revenue": total})
			}
		}
		rows.Close()
	}
	promotionRate := 0.0
	if orders > 0 {
		promotionRate = float64(promotionOrders) * 100 / float64(orders)
	}
	promotionConversion := map[string]any{"orders": promotionOrders, "rate": promotionRate, "total_orders": orders}

	jsonOut(w, 200, map[string]any{
		"range": rangeName, "from": since,
		"metrics":         map[string]any{"orders": orders, "revenue": revenue, "average_ticket": average, "customers": customers, "repeat_customer_rate": repeatCustomerRate, "cancellation_rate": cancellationRate},
		"previous_period": previousPeriod,
		"daily":           daily, "fulfillment": fulfillment, "payments": payments, "source_breakdown": sourceBreakdown, "top_products": topProducts, "promotions": promotions, "promotion_conversion": promotionConversion,
	})
}

func (s *Server) listReservations(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT tr.id::text,tr.table_id::text,t.name,a.name,tr.reserved_at,tr.duration_minutes,tr.party_size,tr.status,
		coalesce(nullif(trim(concat_ws(' ',gc.name,gc.last_name)),''),nullif(tr.guest_name,''),nullif(o.customer_name,''),'Cliente'),
		coalesce(nullif(gc.phone,''),nullif(tr.guest_phone,''),nullif(o.customer_phone,''),''),coalesce(tr.notes,''),coalesce(tr.order_id::text,''),tr.created_at
		FROM table_reservations tr
		JOIN store_tables t ON t.id=tr.table_id
		JOIN store_table_areas a ON a.id=t.area_id
		LEFT JOIN global_customers gc ON gc.id=tr.global_customer_id
		LEFT JOIN orders o ON o.id=tr.order_id
		WHERE tr.store_id=$1 ORDER BY tr.reserved_at DESC LIMIT 500`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las reservaciones")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, tableID, tableName, areaName, status, customerName, customerPhone, notes, orderID string
		var reservedAt, createdAt time.Time
		var duration, partySize int
		if rows.Scan(&id, &tableID, &tableName, &areaName, &reservedAt, &duration, &partySize, &status, &customerName, &customerPhone, &notes, &orderID, &createdAt) == nil {
			out = append(out, map[string]any{"id": id, "table_id": tableID, "table_name": tableName, "area_name": areaName, "reserved_at": reservedAt, "duration_minutes": duration, "party_size": partySize, "status": status, "customer_name": customerName, "customer_phone": customerPhone, "notes": notes, "order_id": orderID, "created_at": createdAt})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) createReservation(w http.ResponseWriter, r *http.Request) {
	var in struct {
		StoreID         string     `json:"store_id"`
		TableID         string     `json:"table_id"`
		ReservedAt      *time.Time `json:"reserved_at"`
		DurationMinutes int        `json:"duration_minutes"`
		PartySize       int        `json:"party_size"`
		GuestName       string     `json:"guest_name"`
		GuestPhone      string     `json:"guest_phone"`
		Notes           string     `json:"notes"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.StoreID) == "" || strings.TrimSpace(in.TableID) == "" || in.ReservedAt == nil {
		jsonErr(w, 400, "Completa mesa, fecha y hora")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	if in.ReservedAt.Before(time.Now().Add(-5 * time.Minute)) {
		jsonErr(w, 400, "Selecciona una fecha y hora válida")
		return
	}
	if in.PartySize < 1 {
		in.PartySize = 1
	}
	if in.DurationMinutes < 15 {
		_ = s.db.QueryRow(r.Context(), `SELECT reservation_duration_minutes FROM stores WHERE id=$1`, in.StoreID).Scan(&in.DurationMinutes)
	}
	if in.DurationMinutes < 15 {
		in.DurationMinutes = 90
	}
	if in.DurationMinutes > 480 {
		in.DurationMinutes = 480
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo iniciar la reservación")
		return
	}
	defer tx.Rollback(r.Context())
	var capacity int
	var tableName string
	if tx.QueryRow(r.Context(), `SELECT capacity,name FROM store_tables WHERE id=$1 AND store_id=$2 AND is_active=true FOR UPDATE`, in.TableID, in.StoreID).Scan(&capacity, &tableName) != nil {
		jsonErr(w, 400, "La mesa seleccionada no está disponible")
		return
	}
	if in.PartySize > capacity {
		jsonErr(w, 400, fmt.Sprintf("La mesa admite hasta %d personas", capacity))
		return
	}
	var conflicts int
	_ = tx.QueryRow(r.Context(), `SELECT count(*) FROM table_reservations WHERE store_id=$1 AND table_id=$2 AND status NOT IN ('canceled','cancelled','completed','no_show') AND reserved_at < $3 + ($4 * interval '1 minute') AND reserved_at + (duration_minutes * interval '1 minute') > $3`, in.StoreID, in.TableID, *in.ReservedAt, in.DurationMinutes).Scan(&conflicts)
	if conflicts > 0 {
		jsonErr(w, 409, "Esa mesa ya está reservada para ese horario")
		return
	}
	guestPhone := normalizePhone(in.GuestPhone)
	var customerID any
	if guestPhone != "" {
		var id string
		if tx.QueryRow(r.Context(), `SELECT id::text FROM global_customers WHERE regexp_replace(coalesce(phone,''),'[^0-9]','','g')=$1 LIMIT 1`, guestPhone).Scan(&id) == nil {
			customerID = id
		}
	}
	var id string
	if err = tx.QueryRow(r.Context(), `INSERT INTO table_reservations(store_id,table_id,global_customer_id,reserved_at,duration_minutes,party_size,status,guest_name,guest_phone,notes) VALUES($1,$2,$3,$4,$5,$6,'reserved',nullif($7,''),nullif($8,''),nullif($9,'')) RETURNING id::text`, in.StoreID, in.TableID, customerID, *in.ReservedAt, in.DurationMinutes, in.PartySize, strings.TrimSpace(in.GuestName), guestPhone, strings.TrimSpace(in.Notes)).Scan(&id); err != nil {
		jsonErr(w, 500, "No se pudo crear la reservación")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la reservación")
		return
	}
	guestName := strings.TrimSpace(in.GuestName)
	if guestName == "" {
		guestName = "Cliente"
	}
	go s.triggerAutomationEvent(context.Background(), in.StoreID, automationReservationCreated, map[string]string{
		"entity_id": id, "telefono": guestPhone, "cliente": guestName, "mesa": tableName, "fecha": in.ReservedAt.In(time.FixedZone("AST", -4*60*60)).Format("02/01/2006 15:04"),
	})
	jsonOut(w, 201, map[string]string{"id": id})
}

func (s *Server) updateReservationStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		Status string `json:"status"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	in.Status = strings.ToLower(strings.TrimSpace(in.Status))
	valid := map[string]bool{"reserved": true, "confirmed": true, "seated": true, "completed": true, "canceled": true, "no_show": true}
	if !valid[in.Status] {
		jsonErr(w, 400, "Estado de reservación inválido")
		return
	}
	c := claims(r)
	var storeID string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM table_reservations WHERE id=$1`, id).Scan(&storeID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Reservación no encontrada")
		return
	}
	if _, err := s.db.Exec(r.Context(), `UPDATE table_reservations SET status=$1,updated_at=now() WHERE id=$2`, in.Status, id); err != nil {
		jsonErr(w, 500, "No se pudo actualizar la reservación")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) kitchenDisplay(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	stationID := strings.TrimSpace(r.URL.Query().Get("station_id"))
	if stationID != "" {
		var exists bool
		_ = s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM kds_stations WHERE id=$1 AND store_id=$2 AND is_active=true)`, stationID, storeID).Scan(&exists)
		if !exists {
			jsonErr(w, 404, "Estación no encontrada")
			return
		}
	}
	query := `SELECT o.id::text,o.order_number,o.customer_name,o.customer_phone,o.status,o.delivery_type,coalesce(o.notes,''),o.created_at,o.total,coalesce(t.name,''),coalesce(a.name,'')
		FROM orders o LEFT JOIN store_tables t ON t.id=o.table_id LEFT JOIN store_table_areas a ON a.id=t.area_id
		WHERE o.store_id=$1 AND o.flow_type<>'quote' AND o.status IN ('pending','confirmed','processing','preparing','ready')`
	args := []any{storeID}
	if stationID != "" {
		query += ` AND EXISTS(SELECT 1 FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=o.id AND (EXISTS(SELECT 1 FROM kds_station_categories ksc WHERE ksc.category_id=p.category_id AND ksc.station_id=$2) OR EXISTS(SELECT 1 FROM kds_station_products ksp WHERE ksp.product_id=p.id AND ksp.station_id=$2)))`
		args = append(args, stationID)
	}
	query += ` ORDER BY o.created_at`
	rows, err := s.db.Query(r.Context(), query, args...)
	if err != nil {
		jsonErr(w, 500, "No se pudo cargar cocina")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, customerName, customerPhone, status, deliveryType, notes, tableName, areaName string
		var number int64
		var createdAt time.Time
		var total float64
		if rows.Scan(&id, &number, &customerName, &customerPhone, &status, &deliveryType, &notes, &createdAt, &total, &tableName, &areaName) != nil {
			continue
		}
		items := []map[string]any{}
		itemQuery := `SELECT oi.product_name,coalesce(oi.variant_name,''),oi.extras,oi.quantity,coalesce(oi.product_id::text,'') FROM order_items oi WHERE oi.order_id=$1`
		itemArgs := []any{id}
		if stationID != "" {
			itemQuery += ` AND EXISTS(SELECT 1 FROM products p WHERE p.id=oi.product_id AND (EXISTS(SELECT 1 FROM kds_station_categories ksc WHERE ksc.category_id=p.category_id AND ksc.station_id=$2) OR EXISTS(SELECT 1 FROM kds_station_products ksp WHERE ksp.product_id=p.id AND ksp.station_id=$2)))`
			itemArgs = append(itemArgs, stationID)
		}
		itemQuery += ` ORDER BY oi.id`
		if itemRows, qerr := s.db.Query(r.Context(), itemQuery, itemArgs...); qerr == nil {
			for itemRows.Next() {
				var productName, variantName, productID string
				var extras []byte
				var quantity float64
				if itemRows.Scan(&productName, &variantName, &extras, &quantity, &productID) == nil {
					var decoded any
					_ = json.Unmarshal(extras, &decoded)
					items = append(items, map[string]any{"product_id": productID, "product_name": productName, "variant_name": variantName, "extras": decoded, "quantity": quantity})
				}
			}
			itemRows.Close()
		}
		out = append(out, map[string]any{"id": id, "number": number, "customer_name": customerName, "customer_phone": customerPhone, "status": status, "delivery_type": deliveryType, "notes": notes, "created_at": createdAt, "total": total, "table_name": tableName, "area_name": areaName, "station_id": stationID, "items": items})
	}
	jsonOut(w, 200, out)
}
