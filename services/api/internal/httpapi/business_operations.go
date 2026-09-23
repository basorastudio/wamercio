package httpapi

import (
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

// --- Sucursales ------------------------------------------------------------

type branchInput struct {
	StoreID          string   `json:"store_id"`
	Name             string   `json:"name"`
	Code             string   `json:"code"`
	Address          string   `json:"address"`
	Street           string   `json:"street"`
	StreetNumber     string   `json:"street_number"`
	ProvinceCode     string   `json:"province_code"`
	Province         string   `json:"province"`
	MunicipalityID   string   `json:"municipality_id"`
	Municipality     string   `json:"municipality"`
	NeighborhoodID   string   `json:"neighborhood_id"`
	Neighborhood     string   `json:"neighborhood"`
	Phone            string   `json:"phone"`
	Whatsapp         string   `json:"whatsapp"`
	Latitude         *float64 `json:"latitude"`
	Longitude        *float64 `json:"longitude"`
	DeliveryRadiusKM float64  `json:"delivery_radius_km"`
	OpensAt          string   `json:"opens_at"`
	ClosesAt         string   `json:"closes_at"`
	IsPrimary        bool     `json:"is_primary"`
	IsActive         bool     `json:"is_active"`
}

func normalizeBranchTime(v, fallback string) string {
	v = strings.TrimSpace(v)
	if len(v) >= 5 {
		v = v[:5]
		if _, err := time.Parse("15:04", v); err == nil {
			return v
		}
	}
	return fallback
}

func (s *Server) listBranches(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT b.id::text,b.store_id::text,b.name,b.code,b.address,b.street,b.street_number,b.province_code,b.province,b.municipality_id,b.municipality,b.neighborhood_id,b.neighborhood,b.phone,b.whatsapp,b.latitude,b.longitude,b.delivery_radius_km,to_char(b.opens_at,'HH24:MI'),to_char(b.closes_at,'HH24:MI'),b.is_primary,b.is_active,b.created_at,b.updated_at,
		(SELECT count(*) FROM orders o WHERE o.branch_id=b.id)::int,
		(SELECT count(*) FROM cash_sessions cs WHERE cs.branch_id=b.id AND cs.status='open')::int
		FROM store_branches b WHERE b.store_id=$1 ORDER BY b.is_primary DESC,b.is_active DESC,b.name`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las sucursales")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, sid, name, code, address, street, streetNumber, provinceCode, province, municipalityID, municipality, neighborhoodID, neighborhood, phone, whatsapp, opensAt, closesAt string
		var lat, lon *float64
		var radius float64
		var primary, active bool
		var createdAt, updatedAt time.Time
		var ordersCount, openCash int
		if rows.Scan(&id, &sid, &name, &code, &address, &street, &streetNumber, &provinceCode, &province, &municipalityID, &municipality, &neighborhoodID, &neighborhood, &phone, &whatsapp, &lat, &lon, &radius, &opensAt, &closesAt, &primary, &active, &createdAt, &updatedAt, &ordersCount, &openCash) == nil {
			out = append(out, map[string]any{"id": id, "store_id": sid, "name": name, "code": code, "address": address, "street": street, "street_number": streetNumber, "province_code": provinceCode, "province": province, "municipality_id": municipalityID, "municipality": municipality, "neighborhood_id": neighborhoodID, "neighborhood": neighborhood, "phone": phone, "whatsapp": whatsapp, "latitude": lat, "longitude": lon, "delivery_radius_km": radius, "opens_at": opensAt, "closes_at": closesAt, "is_primary": primary, "is_active": active, "orders_count": ordersCount, "cash_open": openCash > 0, "created_at": createdAt, "updated_at": updatedAt})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) createBranch(w http.ResponseWriter, r *http.Request) {
	var in branchInput
	if decode(r, &in) != nil || strings.TrimSpace(in.StoreID) == "" || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Negocio y nombre son obligatorios")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Negocio no encontrado")
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	in.Code = strings.ToUpper(strings.TrimSpace(in.Code))
	if in.Code == "" {
		in.Code = strings.ToUpper(strings.ReplaceAll(slugify(in.Name), "-", "_"))
	}
	if in.DeliveryRadiusKM <= 0 {
		in.DeliveryRadiusKM = 5
	}
	in.OpensAt = normalizeBranchTime(in.OpensAt, "08:00")
	in.ClosesAt = normalizeBranchTime(in.ClosesAt, "22:00")
	if in.IsPrimary {
		in.IsActive = true
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo crear la sucursal")
		return
	}
	defer tx.Rollback(r.Context())
	if in.IsPrimary {
		_, _ = tx.Exec(r.Context(), `UPDATE store_branches SET is_primary=false,updated_at=now() WHERE store_id=$1`, in.StoreID)
	}
	var id string
	err = tx.QueryRow(r.Context(), `INSERT INTO store_branches(store_id,name,code,address,street,street_number,province_code,province,municipality_id,municipality,neighborhood_id,neighborhood,phone,whatsapp,latitude,longitude,delivery_radius_km,opens_at,closes_at,is_primary,is_active)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::time,$19::time,$20,$21) RETURNING id::text`, in.StoreID, in.Name, in.Code, in.Address, in.Street, in.StreetNumber, in.ProvinceCode, in.Province, in.MunicipalityID, in.Municipality, in.NeighborhoodID, in.Neighborhood, normalizePhone(in.Phone), normalizePhone(in.Whatsapp), in.Latitude, in.Longitude, in.DeliveryRadiusKM, in.OpensAt, in.ClosesAt, in.IsPrimary, in.IsActive).Scan(&id)
	if err != nil {
		jsonErr(w, 409, "No se pudo crear la sucursal; revisa el nombre o código")
		return
	}
	if !in.IsPrimary {
		var primaryCount int
		_ = tx.QueryRow(r.Context(), `SELECT count(*) FROM store_branches WHERE store_id=$1 AND is_primary=true`, in.StoreID).Scan(&primaryCount)
		if primaryCount == 0 {
			_, _ = tx.Exec(r.Context(), `UPDATE store_branches SET is_primary=true WHERE id=$1`, id)
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la sucursal")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id})
}

func (s *Server) updateBranch(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in branchInput
	if decode(r, &in) != nil || strings.TrimSpace(in.StoreID) == "" || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Negocio no encontrado")
		return
	}
	var exists int
	var wasPrimary bool
	if s.db.QueryRow(r.Context(), `SELECT 1,is_primary FROM store_branches WHERE id=$1 AND store_id=$2`, id, in.StoreID).Scan(&exists, &wasPrimary) != nil {
		jsonErr(w, 404, "Sucursal no encontrada")
		return
	}
	if wasPrimary && !in.IsPrimary {
		jsonErr(w, 409, "Define otra sucursal como principal antes de quitar esta condición")
		return
	}
	if in.IsPrimary {
		in.IsActive = true
	}
	in.Name = strings.TrimSpace(in.Name)
	in.Code = strings.ToUpper(strings.TrimSpace(in.Code))
	if in.Code == "" {
		in.Code = strings.ToUpper(strings.ReplaceAll(slugify(in.Name), "-", "_"))
	}
	if in.DeliveryRadiusKM <= 0 {
		in.DeliveryRadiusKM = 5
	}
	in.OpensAt = normalizeBranchTime(in.OpensAt, "08:00")
	in.ClosesAt = normalizeBranchTime(in.ClosesAt, "22:00")
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar la sucursal")
		return
	}
	defer tx.Rollback(r.Context())
	if in.IsPrimary {
		_, _ = tx.Exec(r.Context(), `UPDATE store_branches SET is_primary=false,updated_at=now() WHERE store_id=$1 AND id<>$2`, in.StoreID, id)
	}
	_, err = tx.Exec(r.Context(), `UPDATE store_branches SET name=$1,code=$2,address=$3,street=$4,street_number=$5,province_code=$6,province=$7,municipality_id=$8,municipality=$9,neighborhood_id=$10,neighborhood=$11,phone=$12,whatsapp=$13,latitude=$14,longitude=$15,delivery_radius_km=$16,opens_at=$17::time,closes_at=$18::time,is_primary=$19,is_active=$20,updated_at=now() WHERE id=$21 AND store_id=$22`, in.Name, in.Code, in.Address, in.Street, in.StreetNumber, in.ProvinceCode, in.Province, in.MunicipalityID, in.Municipality, in.NeighborhoodID, in.Neighborhood, normalizePhone(in.Phone), normalizePhone(in.Whatsapp), in.Latitude, in.Longitude, in.DeliveryRadiusKM, in.OpensAt, in.ClosesAt, in.IsPrimary, in.IsActive, id, in.StoreID)
	if err != nil {
		jsonErr(w, 409, "No se pudo actualizar la sucursal")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la sucursal")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) deleteBranch(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c := claims(r)
	var storeID string
	var primary bool
	if s.db.QueryRow(r.Context(), `SELECT store_id::text,is_primary FROM store_branches WHERE id=$1`, id).Scan(&storeID, &primary) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Sucursal no encontrada")
		return
	}
	if primary {
		jsonErr(w, 409, "No puedes eliminar la sucursal principal. Define otra como principal primero.")
		return
	}
	var references int
	_ = s.db.QueryRow(r.Context(), `SELECT (SELECT count(*) FROM orders WHERE branch_id=$1)+(SELECT count(*) FROM cash_sessions WHERE branch_id=$1)`, id).Scan(&references)
	if references > 0 {
		jsonErr(w, 409, "La sucursal tiene operaciones registradas. Desactívala en lugar de eliminarla.")
		return
	}
	_, _ = s.db.Exec(r.Context(), `DELETE FROM store_branches WHERE id=$1`, id)
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) branchCatalog(w http.ResponseWriter, r *http.Request) {
	branchID := chi.URLParam(r, "id")
	c := claims(r)
	var storeID string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM store_branches WHERE id=$1`, branchID).Scan(&storeID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Sucursal no encontrada")
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT p.id::text,p.name,coalesce(p.sku,''),coalesce(p.image_url,''),p.price,p.is_active,coalesce(bp.price_override,p.price),coalesce(bp.is_available,true),bp.price_override IS NOT NULL FROM products p LEFT JOIN store_branch_products bp ON bp.product_id=p.id AND bp.branch_id=$1 WHERE p.store_id=$2 ORDER BY p.is_active DESC,p.sort_order,p.name`, branchID, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudo cargar el catálogo de la sucursal")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, sku, image string
		var base, price float64
		var productActive, available, override bool
		if rows.Scan(&id, &name, &sku, &image, &base, &productActive, &price, &available, &override) == nil {
			out = append(out, map[string]any{"product_id": id, "name": name, "sku": sku, "image_url": image, "base_price": base, "price": price, "has_override": override, "is_available": available && productActive, "product_active": productActive})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) updateBranchCatalogItem(w http.ResponseWriter, r *http.Request) {
	branchID := chi.URLParam(r, "id")
	productID := chi.URLParam(r, "productID")
	var in struct {
		StoreID       string   `json:"store_id"`
		PriceOverride *float64 `json:"price_override"`
		IsAvailable   bool     `json:"is_available"`
	}
	if decode(r, &in) != nil || in.StoreID == "" {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Negocio no encontrado")
		return
	}
	var valid int
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM store_branches b JOIN products p ON p.store_id=b.store_id WHERE b.id=$1 AND p.id=$2 AND b.store_id=$3`, branchID, productID, in.StoreID).Scan(&valid)
	if valid == 0 {
		jsonErr(w, 404, "Producto o sucursal no encontrados")
		return
	}
	if in.PriceOverride != nil && *in.PriceOverride < 0 {
		jsonErr(w, 400, "El precio no puede ser negativo")
		return
	}
	_, err := s.db.Exec(r.Context(), `INSERT INTO store_branch_products(branch_id,product_id,price_override,is_available,updated_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(branch_id,product_id) DO UPDATE SET price_override=excluded.price_override,is_available=excluded.is_available,updated_at=now()`, branchID, productID, in.PriceOverride, in.IsAvailable)
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar la disponibilidad")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

// --- Caja y turnos ---------------------------------------------------------

func signedCashMovement(kind string, amount float64) float64 {
	switch kind {
	case "cash_out", "expense", "refund":
		return -amount
	default:
		return amount
	}
}

func (s *Server) listCashSessions(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT cs.id::text,cs.branch_id::text,b.name,cs.opening_amount,cs.closing_amount,cs.expected_amount,cs.difference,cs.status,cs.notes,cs.opened_at,cs.closed_at,coalesce(u.name,'Sistema'),coalesce(cu.name,'') FROM cash_sessions cs JOIN store_branches b ON b.id=cs.branch_id LEFT JOIN users u ON u.id=cs.opened_by_user_id LEFT JOIN users cu ON cu.id=cs.closed_by_user_id WHERE cs.store_id=$1 ORDER BY cs.opened_at DESC LIMIT 100`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los turnos de caja")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, branchID, branchName, status, notes, openedBy, closedBy string
		var opening float64
		var closing, expected, difference *float64
		var openedAt time.Time
		var closedAt *time.Time
		if rows.Scan(&id, &branchID, &branchName, &opening, &closing, &expected, &difference, &status, &notes, &openedAt, &closedAt, &openedBy, &closedBy) == nil {
			out = append(out, map[string]any{"id": id, "branch_id": branchID, "branch_name": branchName, "opening_amount": opening, "closing_amount": closing, "expected_amount": expected, "difference": difference, "status": status, "notes": notes, "opened_at": openedAt, "closed_at": closedAt, "opened_by": openedBy, "closed_by": closedBy})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) cashSummary(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	branchID := strings.TrimSpace(r.URL.Query().Get("branch_id"))
	if branchID == "" {
		_ = s.db.QueryRow(r.Context(), `SELECT id::text FROM store_branches WHERE store_id=$1 AND is_primary=true LIMIT 1`, storeID).Scan(&branchID)
	}
	var branchName string
	if s.db.QueryRow(r.Context(), `SELECT name FROM store_branches WHERE id=$1 AND store_id=$2`, branchID, storeID).Scan(&branchName) != nil {
		jsonErr(w, 404, "Sucursal no encontrada")
		return
	}
	var sessionID, status, notes string
	var opening float64
	var openedAt *time.Time
	err := s.db.QueryRow(r.Context(), `SELECT id::text,status,opening_amount,notes,opened_at FROM cash_sessions WHERE store_id=$1 AND branch_id=$2 AND status='open' ORDER BY opened_at DESC LIMIT 1`, storeID, branchID).Scan(&sessionID, &status, &opening, &notes, &openedAt)
	if err != nil {
		jsonOut(w, 200, map[string]any{"branch_id": branchID, "branch_name": branchName, "open": false, "expected_amount": 0, "movements": []any{}})
		return
	}
	var salesCash, cashIn, cashOut, expenses, deliveryRemit, refunds float64
	_ = s.db.QueryRow(r.Context(), `SELECT coalesce(sum(amount) FILTER(WHERE type='sale_cash'),0),coalesce(sum(amount) FILTER(WHERE type='cash_in'),0),coalesce(sum(amount) FILTER(WHERE type='cash_out'),0),coalesce(sum(amount) FILTER(WHERE type='expense'),0),coalesce(sum(amount) FILTER(WHERE type='delivery_remittance'),0),coalesce(sum(amount) FILTER(WHERE type='refund'),0) FROM cash_movements WHERE cash_session_id=$1`, sessionID).Scan(&salesCash, &cashIn, &cashOut, &expenses, &deliveryRemit, &refunds)
	expected := opening + salesCash + cashIn + deliveryRemit - cashOut - expenses - refunds
	movementRows, _ := s.db.Query(r.Context(), `SELECT id::text,type,amount,description,created_at,coalesce(order_id::text,'') FROM cash_movements WHERE cash_session_id=$1 ORDER BY created_at DESC LIMIT 100`, sessionID)
	movements := []map[string]any{}
	if movementRows != nil {
		defer movementRows.Close()
		for movementRows.Next() {
			var id, kind, description, orderID string
			var amount float64
			var createdAt time.Time
			if movementRows.Scan(&id, &kind, &amount, &description, &createdAt, &orderID) == nil {
				movements = append(movements, map[string]any{"id": id, "type": kind, "amount": amount, "signed_amount": signedCashMovement(kind, amount), "description": description, "order_id": orderID, "created_at": createdAt})
			}
		}
	}
	jsonOut(w, 200, map[string]any{"branch_id": branchID, "branch_name": branchName, "open": true, "session_id": sessionID, "status": status, "opening_amount": opening, "sales_cash": salesCash, "cash_in": cashIn, "cash_out": cashOut, "expenses": expenses, "delivery_remittances": deliveryRemit, "refunds": refunds, "expected_amount": expected, "notes": notes, "opened_at": openedAt, "movements": movements})
}

func (s *Server) openCashSession(w http.ResponseWriter, r *http.Request) {
	var in struct {
		StoreID       string  `json:"store_id"`
		BranchID      string  `json:"branch_id"`
		OpeningAmount float64 `json:"opening_amount"`
		Notes         string  `json:"notes"`
	}
	if decode(r, &in) != nil || in.StoreID == "" || in.BranchID == "" || in.OpeningAmount < 0 {
		jsonErr(w, 400, "Datos de apertura inválidos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Negocio no encontrado")
		return
	}
	var valid int
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM store_branches WHERE id=$1 AND store_id=$2 AND is_active=true`, in.BranchID, in.StoreID).Scan(&valid)
	if valid == 0 {
		jsonErr(w, 400, "Sucursal inválida o inactiva")
		return
	}
	var id string
	err := s.db.QueryRow(r.Context(), `INSERT INTO cash_sessions(store_id,branch_id,opened_by_user_id,opening_amount,notes) VALUES($1,$2,$3,$4,$5) RETURNING id::text`, in.StoreID, in.BranchID, c.UserID, in.OpeningAmount, strings.TrimSpace(in.Notes)).Scan(&id)
	if err != nil {
		jsonErr(w, 409, "Ya existe una caja abierta en esta sucursal")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id})
}

func (s *Server) addCashMovement(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	var in struct {
		StoreID     string  `json:"store_id"`
		Type        string  `json:"type"`
		Amount      float64 `json:"amount"`
		Description string  `json:"description"`
	}
	if decode(r, &in) != nil || in.StoreID == "" || in.Amount <= 0 {
		jsonErr(w, 400, "Movimiento inválido")
		return
	}
	allowed := map[string]bool{"cash_in": true, "cash_out": true, "expense": true, "refund": true}
	if !allowed[in.Type] {
		jsonErr(w, 400, "Tipo de movimiento no permitido")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Negocio no encontrado")
		return
	}
	var valid int
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM cash_sessions WHERE id=$1 AND store_id=$2 AND status='open'`, sessionID, in.StoreID).Scan(&valid)
	if valid == 0 {
		jsonErr(w, 409, "La caja ya está cerrada o no existe")
		return
	}
	var id string
	if s.db.QueryRow(r.Context(), `INSERT INTO cash_movements(cash_session_id,store_id,user_id,type,amount,description) VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text`, sessionID, in.StoreID, c.UserID, in.Type, in.Amount, strings.TrimSpace(in.Description)).Scan(&id) != nil {
		jsonErr(w, 500, "No se pudo registrar el movimiento")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id})
}

func (s *Server) closeCashSession(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	var in struct {
		StoreID       string  `json:"store_id"`
		ClosingAmount float64 `json:"closing_amount"`
		Notes         string  `json:"notes"`
	}
	if decode(r, &in) != nil || in.StoreID == "" || in.ClosingAmount < 0 {
		jsonErr(w, 400, "Cierre inválido")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Negocio no encontrado")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo cerrar la caja")
		return
	}
	defer tx.Rollback(r.Context())
	var opening float64
	var currentNotes string
	if tx.QueryRow(r.Context(), `SELECT opening_amount,notes FROM cash_sessions WHERE id=$1 AND store_id=$2 AND status='open' FOR UPDATE`, sessionID, in.StoreID).Scan(&opening, &currentNotes) != nil {
		jsonErr(w, 409, "La caja ya está cerrada o no existe")
		return
	}
	var net float64
	_ = tx.QueryRow(r.Context(), `SELECT coalesce(sum(CASE WHEN type IN ('cash_out','expense','refund') THEN -amount ELSE amount END),0) FROM cash_movements WHERE cash_session_id=$1`, sessionID).Scan(&net)
	expected := opening + net
	difference := in.ClosingAmount - expected
	notes := strings.TrimSpace(in.Notes)
	if notes == "" {
		notes = currentNotes
	}
	_, err = tx.Exec(r.Context(), `UPDATE cash_sessions SET closing_amount=$1,expected_amount=$2,difference=$3,status='closed',closed_by_user_id=$4,closed_at=now(),notes=$5,updated_at=now() WHERE id=$6`, in.ClosingAmount, expected, difference, c.UserID, notes, sessionID)
	if err != nil {
		jsonErr(w, 500, "No se pudo cerrar la caja")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar el cierre")
		return
	}
	jsonOut(w, 200, map[string]any{"ok": true, "expected_amount": expected, "closing_amount": in.ClosingAmount, "difference": difference})
}

// --- Cobros y liquidaciones de delivery ----------------------------------

func (s *Server) deliveryCourierBalances(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT st.id::text,trim(st.name||' '||coalesce(st.last_name,'')) AS courier_name,coalesce(st.phone,''),coalesce(st.profile_picture_url,''),count(a.id) FILTER(WHERE a.cash_collected_amount>a.cash_remitted_amount)::int,coalesce(sum(greatest(a.cash_collected_amount-a.cash_remitted_amount,0)),0)
		FROM store_staff st LEFT JOIN delivery_assignments a ON a.courier_staff_id=st.id AND a.store_id=st.store_id
		WHERE st.store_id=$1 AND st.role='delivery' AND st.status='active'
		GROUP BY st.id,st.name,st.last_name,st.phone,st.profile_picture_url ORDER BY courier_name`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los saldos de repartidores")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, phone, avatar string
		var pendingCount int
		var pending float64
		if rows.Scan(&id, &name, &phone, &avatar, &pendingCount, &pending) == nil {
			out = append(out, map[string]any{"courier_staff_id": id, "courier_name": strings.TrimSpace(name), "phone": phone, "profile_picture_url": avatar, "pending_deliveries": pendingCount, "pending_cash": pending})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) collectDeliveryPayment(w http.ResponseWriter, r *http.Request) {
	assignmentID := chi.URLParam(r, "id")
	var in struct {
		StoreID string `json:"store_id"`
		Method  string `json:"method"`
	}
	if decode(r, &in) != nil || in.StoreID == "" {
		jsonErr(w, 400, "Cobro inválido")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Negocio no encontrado")
		return
	}
	method := strings.TrimSpace(in.Method)
	if method == "" {
		method = "cash"
	}
	if method != "cash" && method != "cash_on_delivery" && method != "bank_transfer" && method != "card" {
		jsonErr(w, 400, "Método de cobro no válido")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo registrar el cobro")
		return
	}
	defer tx.Rollback(r.Context())
	var orderID, courierID, paymentStatus string
	var total, alreadyCollected float64
	if tx.QueryRow(r.Context(), `SELECT a.order_id::text,coalesce(a.courier_staff_id::text,''),o.total,a.cash_collected_amount,coalesce(o.payment_status,'pending') FROM delivery_assignments a JOIN orders o ON o.id=a.order_id WHERE a.id=$1 AND a.store_id=$2 FOR UPDATE OF a,o`, assignmentID, in.StoreID).Scan(&orderID, &courierID, &total, &alreadyCollected, &paymentStatus) != nil {
		jsonErr(w, 404, "Entrega no encontrada")
		return
	}
	if courierID == "" {
		jsonErr(w, 409, "Asigna un repartidor antes de registrar el cobro")
		return
	}
	if paymentStatus == "paid" {
		jsonErr(w, 409, "Este pedido ya figura como cobrado")
		return
	}
	cashAmount := 0.0
	if method == "cash" {
		cashAmount = total
	}
	if alreadyCollected > 0 && method == "cash" {
		cashAmount = alreadyCollected
	}
	_, err = tx.Exec(r.Context(), `UPDATE delivery_assignments SET cash_collected_amount=CASE WHEN $1='cash' THEN greatest(cash_collected_amount,$2) ELSE cash_collected_amount END,cash_collected_method=$1,cash_collected_at=coalesce(cash_collected_at,now()),updated_at=now() WHERE id=$3`, method, cashAmount, assignmentID)
	if err == nil {
		_, err = tx.Exec(r.Context(), `UPDATE orders SET payment_status='paid',collected_payment_method=$1,payment_collected_at=now(),updated_at=now() WHERE id=$2`, method, orderID)
	}
	if err != nil {
		jsonErr(w, 500, "No se pudo registrar el cobro")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar el cobro")
		return
	}
	jsonOut(w, 200, map[string]any{"ok": true, "amount": total, "method": method})
}

func (s *Server) listDeliveryRemittances(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT dr.id::text,dr.amount,dr.notes,dr.created_at,dr.courier_staff_id::text,trim(st.name||' '||coalesce(st.last_name,'')),dr.branch_id::text,b.name,dr.cash_session_id::text,coalesce(u.name,'Sistema') FROM delivery_remittances dr JOIN store_staff st ON st.id=dr.courier_staff_id JOIN store_branches b ON b.id=dr.branch_id LEFT JOIN users u ON u.id=dr.received_by_user_id WHERE dr.store_id=$1 ORDER BY dr.created_at DESC LIMIT 100`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las liquidaciones")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, notes, courierID, courierName, branchID, branchName, cashSessionID, receivedBy string
		var amount float64
		var createdAt time.Time
		if rows.Scan(&id, &amount, &notes, &createdAt, &courierID, &courierName, &branchID, &branchName, &cashSessionID, &receivedBy) == nil {
			out = append(out, map[string]any{"id": id, "amount": amount, "notes": notes, "created_at": createdAt, "courier_staff_id": courierID, "courier_name": strings.TrimSpace(courierName), "branch_id": branchID, "branch_name": branchName, "cash_session_id": cashSessionID, "received_by": receivedBy})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) createDeliveryRemittance(w http.ResponseWriter, r *http.Request) {
	var in struct {
		StoreID        string  `json:"store_id"`
		CourierStaffID string  `json:"courier_staff_id"`
		CashSessionID  string  `json:"cash_session_id"`
		Amount         float64 `json:"amount"`
		Notes          string  `json:"notes"`
	}
	if decode(r, &in) != nil || in.StoreID == "" || in.CourierStaffID == "" || in.CashSessionID == "" || in.Amount <= 0 {
		jsonErr(w, 400, "Liquidación inválida")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Negocio no encontrado")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo iniciar la liquidación")
		return
	}
	defer tx.Rollback(r.Context())
	var branchID string
	if tx.QueryRow(r.Context(), `SELECT branch_id::text FROM cash_sessions WHERE id=$1 AND store_id=$2 AND status='open' FOR UPDATE`, in.CashSessionID, in.StoreID).Scan(&branchID) != nil {
		jsonErr(w, 409, "Selecciona una caja abierta")
		return
	}
	var courierValid int
	_ = tx.QueryRow(r.Context(), `SELECT count(*) FROM store_staff WHERE id=$1 AND store_id=$2 AND role='delivery' AND status='active'`, in.CourierStaffID, in.StoreID).Scan(&courierValid)
	if courierValid == 0 {
		jsonErr(w, 400, "Repartidor inválido")
		return
	}
	rows, err := tx.Query(r.Context(), `SELECT id::text,greatest(cash_collected_amount-cash_remitted_amount,0) FROM delivery_assignments WHERE store_id=$1 AND courier_staff_id=$2 AND cash_collected_amount>cash_remitted_amount ORDER BY cash_collected_at,id FOR UPDATE`, in.StoreID, in.CourierStaffID)
	if err != nil {
		jsonErr(w, 500, "No se pudo calcular el efectivo pendiente")
		return
	}
	type pendingRow struct {
		id     string
		amount float64
	}
	pendingRows := []pendingRow{}
	pendingTotal := 0.0
	for rows.Next() {
		var row pendingRow
		if rows.Scan(&row.id, &row.amount) == nil {
			pendingRows = append(pendingRows, row)
			pendingTotal += row.amount
		}
	}
	rows.Close()
	if in.Amount-pendingTotal > 0.009 {
		jsonErr(w, 409, fmt.Sprintf("El repartidor solo tiene RD$%.2f pendientes de liquidar", pendingTotal))
		return
	}
	var remittanceID string
	if tx.QueryRow(r.Context(), `INSERT INTO delivery_remittances(store_id,branch_id,courier_staff_id,cash_session_id,received_by_user_id,amount,notes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id::text`, in.StoreID, branchID, in.CourierStaffID, in.CashSessionID, c.UserID, in.Amount, strings.TrimSpace(in.Notes)).Scan(&remittanceID) != nil {
		jsonErr(w, 500, "No se pudo crear la liquidación")
		return
	}
	remaining := in.Amount
	for _, row := range pendingRows {
		if remaining <= 0.009 {
			break
		}
		allocated := math.Min(row.amount, remaining)
		if allocated <= 0 {
			continue
		}
		if _, err = tx.Exec(r.Context(), `INSERT INTO delivery_remittance_items(remittance_id,assignment_id,amount) VALUES($1,$2,$3)`, remittanceID, row.id, allocated); err != nil {
			jsonErr(w, 500, "No se pudo distribuir la liquidación")
			return
		}
		_, err = tx.Exec(r.Context(), `UPDATE delivery_assignments SET cash_remitted_amount=cash_remitted_amount+$1,cash_remitted_at=CASE WHEN cash_remitted_amount+$1>=cash_collected_amount-0.009 THEN now() ELSE cash_remitted_at END,updated_at=now() WHERE id=$2`, allocated, row.id)
		if err != nil {
			jsonErr(w, 500, "No se pudo actualizar la entrega")
			return
		}
		remaining -= allocated
	}
	if remaining > 0.02 {
		jsonErr(w, 409, "El efectivo pendiente cambió mientras registrabas la liquidación")
		return
	}
	_, err = tx.Exec(r.Context(), `INSERT INTO cash_movements(cash_session_id,store_id,user_id,type,amount,description) VALUES($1,$2,$3,'delivery_remittance',$4,$5)`, in.CashSessionID, in.StoreID, c.UserID, in.Amount, "Liquidación de repartidor")
	if err != nil {
		jsonErr(w, 500, "No se pudo reflejar la liquidación en caja")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la liquidación")
		return
	}
	jsonOut(w, 201, map[string]any{"id": remittanceID, "amount": in.Amount})
}
