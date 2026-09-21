package httpapi

import (
	"context"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

func (s *Server) listDeliveryAssignments(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT a.id::text,a.order_id::text,o.order_number,o.customer_name,o.customer_phone,o.total,o.payment_method,o.payment_status,o.status,coalesce(a.courier_staff_id::text,''),coalesce(st.name,''),a.status,a.delivery_address,a.latitude,a.longitude,a.reference,a.notes,a.assigned_at,a.accepted_at,a.picked_up_at,a.delivered_at,a.created_at,a.updated_at,coalesce(a.route_id::text,'') FROM delivery_assignments a JOIN orders o ON o.id=a.order_id LEFT JOIN store_staff st ON st.id=a.courier_staff_id WHERE a.store_id=$1 ORDER BY CASE WHEN a.status IN ('delivered','failed','cancelled') THEN 1 ELSE 0 END,a.created_at DESC`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las entregas")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, orderID, name, phone, paymentMethod, paymentStatus, orderStatus, courierID, courierName, status, address, reference, notes, routeID string
		var number int64
		var total float64
		var lat, lon *float64
		var assignedAt, acceptedAt, pickedAt, deliveredAt *time.Time
		var createdAt, updatedAt time.Time
		if rows.Scan(&id, &orderID, &number, &name, &phone, &total, &paymentMethod, &paymentStatus, &orderStatus, &courierID, &courierName, &status, &address, &lat, &lon, &reference, &notes, &assignedAt, &acceptedAt, &pickedAt, &deliveredAt, &createdAt, &updatedAt, &routeID) == nil {
			out = append(out, map[string]any{"id": id, "order_id": orderID, "order_number": number, "customer_name": name, "customer_phone": phone, "total": total, "payment_method": paymentMethod, "payment_status": paymentStatus, "order_status": orderStatus, "courier_staff_id": courierID, "courier_name": courierName, "status": status, "delivery_address": address, "latitude": lat, "longitude": lon, "reference": reference, "notes": notes, "assigned_at": assignedAt, "accepted_at": acceptedAt, "picked_up_at": pickedAt, "delivered_at": deliveredAt, "route_id": routeID, "created_at": createdAt, "updated_at": updatedAt})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) upsertDeliveryAssignment(w http.ResponseWriter, r *http.Request) {
	var in struct {
		StoreID, OrderID, CourierStaffID, Notes string   `json:"store_id"`
		DeliveryAddress                         string   `json:"delivery_address"`
		Latitude                                *float64 `json:"latitude"`
		Longitude                               *float64 `json:"longitude"`
		Reference                               string   `json:"reference"`
	}
	// Go cannot map repeated tag declarations compactly, decode a map-backed shape explicitly below.
	var raw struct {
		StoreID         string   `json:"store_id"`
		OrderID         string   `json:"order_id"`
		CourierStaffID  string   `json:"courier_staff_id"`
		Notes           string   `json:"notes"`
		DeliveryAddress string   `json:"delivery_address"`
		Latitude        *float64 `json:"latitude"`
		Longitude       *float64 `json:"longitude"`
		Reference       string   `json:"reference"`
	}
	if decode(r, &raw) != nil || raw.StoreID == "" || raw.OrderID == "" {
		jsonErr(w, 400, "Tienda y pedido son obligatorios")
		return
	}
	in.StoreID, in.OrderID, in.CourierStaffID, in.Notes, in.DeliveryAddress, in.Latitude, in.Longitude, in.Reference = raw.StoreID, raw.OrderID, raw.CourierStaffID, raw.Notes, raw.DeliveryAddress, raw.Latitude, raw.Longitude, raw.Reference
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	var orderAddress string
	var orderLat, orderLon *float64
	if s.db.QueryRow(r.Context(), `SELECT coalesce(delivery_address,''),delivery_latitude,delivery_longitude FROM orders WHERE id=$1 AND store_id=$2 AND flow_type<>'quote'`, in.OrderID, in.StoreID).Scan(&orderAddress, &orderLat, &orderLon) != nil {
		jsonErr(w, 404, "Pedido no encontrado")
		return
	}
	if in.CourierStaffID != "" {
		var n int
		_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM store_staff WHERE id=$1 AND store_id=$2 AND status='active'`, in.CourierStaffID, in.StoreID).Scan(&n)
		if n == 0 {
			jsonErr(w, 400, "Repartidor no válido")
			return
		}
	}
	if strings.TrimSpace(in.DeliveryAddress) == "" {
		in.DeliveryAddress = orderAddress
	}
	if in.Latitude == nil {
		in.Latitude = orderLat
	}
	if in.Longitude == nil {
		in.Longitude = orderLon
	}
	var id string
	err := s.db.QueryRow(r.Context(), `INSERT INTO delivery_assignments(store_id,order_id,courier_staff_id,status,delivery_address,latitude,longitude,reference,notes,assigned_at) VALUES($1,$2,NULLIF($3,'')::uuid,CASE WHEN $3='' THEN 'unassigned' ELSE 'assigned' END,$4,$5,$6,$7,$8,CASE WHEN $3='' THEN NULL ELSE now() END) ON CONFLICT(order_id) DO UPDATE SET courier_staff_id=NULLIF(EXCLUDED.courier_staff_id::text,'')::uuid,status=CASE WHEN EXCLUDED.courier_staff_id IS NULL THEN delivery_assignments.status ELSE 'assigned' END,delivery_address=EXCLUDED.delivery_address,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,reference=EXCLUDED.reference,notes=EXCLUDED.notes,assigned_at=CASE WHEN EXCLUDED.courier_staff_id IS NOT NULL THEN now() ELSE delivery_assignments.assigned_at END,updated_at=now() RETURNING id::text`, in.StoreID, in.OrderID, in.CourierStaffID, in.DeliveryAddress, in.Latitude, in.Longitude, in.Reference, in.Notes).Scan(&id)
	if err != nil {
		jsonErr(w, 500, "No se pudo preparar la entrega")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id, "ok": true})
}

func (s *Server) updateDeliveryAssignment(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		StoreID        string   `json:"store_id"`
		CourierStaffID string   `json:"courier_staff_id"`
		Status         string   `json:"status"`
		Notes          string   `json:"notes"`
		Latitude       *float64 `json:"latitude"`
		Longitude      *float64 `json:"longitude"`
	}
	if decode(r, &in) != nil || in.StoreID == "" {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	allowed := map[string]bool{"unassigned": true, "assigned": true, "accepted": true, "picked_up": true, "on_route": true, "arrived": true, "delivered": true, "failed": true, "cancelled": true}
	if !allowed[in.Status] {
		jsonErr(w, 400, "Estado inválido")
		return
	}
	res, err := s.db.Exec(r.Context(), `UPDATE delivery_assignments SET courier_staff_id=CASE WHEN $1='' THEN courier_staff_id ELSE $1::uuid END,status=$2,notes=CASE WHEN $3='' THEN notes ELSE $3 END,latitude=coalesce($4,latitude),longitude=coalesce($5,longitude),assigned_at=CASE WHEN $2='assigned' THEN coalesce(assigned_at,now()) ELSE assigned_at END,accepted_at=CASE WHEN $2='accepted' THEN coalesce(accepted_at,now()) ELSE accepted_at END,picked_up_at=CASE WHEN $2='picked_up' THEN coalesce(picked_up_at,now()) ELSE picked_up_at END,delivered_at=CASE WHEN $2='delivered' THEN coalesce(delivered_at,now()) ELSE delivered_at END,updated_at=now() WHERE id=$6 AND store_id=$7`, in.CourierStaffID, in.Status, in.Notes, in.Latitude, in.Longitude, id, in.StoreID)
	if err != nil || res.RowsAffected() == 0 {
		jsonErr(w, 404, "Entrega no encontrada")
		return
	}
	if in.Status == "delivered" {
		_, _ = s.db.Exec(r.Context(), `UPDATE orders SET status='delivered',updated_at=now() WHERE id=(SELECT order_id FROM delivery_assignments WHERE id=$1)`, id)
	} else if in.Status == "on_route" {
		_, _ = s.db.Exec(r.Context(), `UPDATE orders SET status='out_for_delivery',updated_at=now() WHERE id=(SELECT order_id FROM delivery_assignments WHERE id=$1) AND status NOT IN ('delivered','canceled')`, id)
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

type routeInput struct {
	StoreID        string   `json:"store_id"`
	CourierStaffID string   `json:"courier_staff_id"`
	Name           string   `json:"name"`
	RouteDate      string   `json:"route_date"`
	Status         string   `json:"status"`
	AssignmentIDs  []string `json:"assignment_ids"`
}

func (s *Server) listDeliveryRoutes(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT dr.id::text,dr.name,dr.route_date,dr.status,coalesce(dr.courier_staff_id::text,''),coalesce(st.name,''),dr.total_distance_km,dr.estimated_minutes,dr.started_at,dr.completed_at,dr.created_at,count(rs.id)::int FROM delivery_routes dr LEFT JOIN store_staff st ON st.id=dr.courier_staff_id LEFT JOIN delivery_route_stops rs ON rs.route_id=dr.id WHERE dr.store_id=$1 GROUP BY dr.id,st.name ORDER BY dr.route_date DESC,dr.created_at DESC`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las rutas")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, status, courierID, courierName string
		var date time.Time
		var distance float64
		var minutes, count int
		var started, completed *time.Time
		var created time.Time
		if rows.Scan(&id, &name, &date, &status, &courierID, &courierName, &distance, &minutes, &started, &completed, &created, &count) == nil {
			out = append(out, map[string]any{"id": id, "name": name, "route_date": date, "status": status, "courier_staff_id": courierID, "courier_name": courierName, "total_distance_km": distance, "estimated_minutes": minutes, "started_at": started, "completed_at": completed, "created_at": created, "stops_count": count})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) createDeliveryRoute(w http.ResponseWriter, r *http.Request) {
	var in routeInput
	if decode(r, &in) != nil || in.StoreID == "" {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	if strings.TrimSpace(in.Name) == "" {
		in.Name = "Ruta de entrega"
	}
	routeDate := time.Now()
	if in.RouteDate != "" {
		if d, e := time.Parse("2006-01-02", in.RouteDate); e == nil {
			routeDate = d
		}
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo crear la ruta")
		return
	}
	defer tx.Rollback(r.Context())
	var id string
	if err = tx.QueryRow(r.Context(), `INSERT INTO delivery_routes(store_id,courier_staff_id,name,route_date) VALUES($1,NULLIF($2,'')::uuid,$3,$4) RETURNING id::text`, in.StoreID, in.CourierStaffID, in.Name, routeDate).Scan(&id); err != nil {
		jsonErr(w, 500, "No se pudo crear la ruta")
		return
	}
	for i, assignmentID := range in.AssignmentIDs {
		if strings.TrimSpace(assignmentID) == "" {
			continue
		}
		_, err = tx.Exec(r.Context(), `INSERT INTO delivery_route_stops(route_id,assignment_id,stop_order) SELECT $1,a.id,$3 FROM delivery_assignments a WHERE a.id=$2 AND a.store_id=$4 ON CONFLICT(route_id,assignment_id) DO NOTHING`, id, assignmentID, i+1, in.StoreID)
		if err != nil {
			jsonErr(w, 400, "Una entrega no es válida")
			return
		}
		_, _ = tx.Exec(r.Context(), `UPDATE delivery_assignments SET route_id=$1,courier_staff_id=coalesce(NULLIF($2,'')::uuid,courier_staff_id),status=CASE WHEN status='unassigned' AND $2<>'' THEN 'assigned' ELSE status END,updated_at=now() WHERE id=$3 AND store_id=$4`, id, in.CourierStaffID, assignmentID, in.StoreID)
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la ruta")
		return
	}
	distance, minutes, _ := s.optimizeRoute(r.Context(), id, in.StoreID)
	jsonOut(w, 201, map[string]any{"id": id, "ok": true, "total_distance_km": distance, "estimated_minutes": minutes})
}

func (s *Server) updateDeliveryRoute(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in routeInput
	if decode(r, &in) != nil || in.StoreID == "" {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	allowed := map[string]bool{"planned": true, "active": true, "completed": true, "cancelled": true}
	if !allowed[in.Status] {
		in.Status = "planned"
	}
	res, err := s.db.Exec(r.Context(), `UPDATE delivery_routes SET name=$1,courier_staff_id=NULLIF($2,'')::uuid,status=$3,started_at=CASE WHEN $3='active' THEN coalesce(started_at,now()) ELSE started_at END,completed_at=CASE WHEN $3='completed' THEN coalesce(completed_at,now()) ELSE completed_at END,updated_at=now() WHERE id=$4 AND store_id=$5`, in.Name, in.CourierStaffID, in.Status, id, in.StoreID)
	if err != nil || res.RowsAffected() == 0 {
		jsonErr(w, 404, "Ruta no encontrada")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) deleteDeliveryRoute(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	storeID := r.URL.Query().Get("store_id")
	c := claims(r)
	if storeID == "" || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	tx, _ := s.db.Begin(r.Context())
	if tx == nil {
		jsonErr(w, 500, "No se pudo eliminar")
		return
	}
	defer tx.Rollback(r.Context())
	_, _ = tx.Exec(r.Context(), `UPDATE delivery_assignments SET route_id=NULL,updated_at=now() WHERE route_id=$1 AND store_id=$2`, id, storeID)
	res, err := tx.Exec(r.Context(), `DELETE FROM delivery_routes WHERE id=$1 AND store_id=$2`, id, storeID)
	if err != nil || res.RowsAffected() == 0 {
		jsonErr(w, 404, "Ruta no encontrada")
		return
	}
	_ = tx.Commit(r.Context())
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) associateConversationLocation(w http.ResponseWriter, r *http.Request) {
	conversationID := chi.URLParam(r, "id")
	c := claims(r)
	var storeID, customerID, globalID string
	if s.db.QueryRow(r.Context(), `SELECT c.store_id::text,coalesce(c.customer_id::text,''),coalesce(cu.global_customer_id::text,'') FROM conversations c LEFT JOIN customers cu ON cu.id=c.customer_id WHERE c.id=$1`, conversationID).Scan(&storeID, &customerID, &globalID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	if globalID == "" {
		jsonErr(w, 409, "El contacto debe estar registrado como cliente global para guardar una dirección")
		return
	}
	var lat, lon float64
	if s.db.QueryRow(r.Context(), `SELECT latitude,longitude FROM messages WHERE conversation_id=$1 AND type IN ('location','live_location') AND latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY occurred_at DESC LIMIT 1`, conversationID).Scan(&lat, &lon) != nil {
		jsonErr(w, 404, "La conversación no tiene una ubicación reciente")
		return
	}
	var in struct {
		Label, ProvinceCode, Province, CityID, Municipality, NeighborhoodID, Neighborhood, Street, StreetNumber, Reference string  `json:"label"`
		MakePrimary                                                                                                        bool    `json:"is_primary"`
		AutoCreateZone                                                                                                     bool    `json:"auto_create_zone"`
		ZoneCharge                                                                                                         float64 `json:"zone_charge"`
		EstimatedMinutes                                                                                                   int     `json:"estimated_minutes"`
	}
	// Decode into a second explicit shape so all JSON keys remain unambiguous.
	var raw struct {
		Label            string  `json:"label"`
		ProvinceCode     string  `json:"province_code"`
		Province         string  `json:"province"`
		CityID           string  `json:"city_id"`
		Municipality     string  `json:"municipality"`
		NeighborhoodID   string  `json:"neighborhood_id"`
		Neighborhood     string  `json:"neighborhood"`
		Street           string  `json:"street"`
		StreetNumber     string  `json:"street_number"`
		Reference        string  `json:"reference"`
		MakePrimary      bool    `json:"is_primary"`
		AutoCreateZone   bool    `json:"auto_create_zone"`
		ZoneCharge       float64 `json:"zone_charge"`
		EstimatedMinutes int     `json:"estimated_minutes"`
	}
	if decode(r, &raw) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	in.Label, in.ProvinceCode, in.Province, in.CityID, in.Municipality, in.NeighborhoodID, in.Neighborhood, in.Street, in.StreetNumber, in.Reference, in.MakePrimary, in.AutoCreateZone, in.ZoneCharge, in.EstimatedMinutes = raw.Label, raw.ProvinceCode, raw.Province, raw.CityID, raw.Municipality, raw.NeighborhoodID, raw.Neighborhood, raw.Street, raw.StreetNumber, raw.Reference, raw.MakePrimary, raw.AutoCreateZone, raw.ZoneCharge, raw.EstimatedMinutes
	if strings.TrimSpace(in.Label) == "" {
		in.Label = "WhatsApp"
	}
	if strings.TrimSpace(in.Street) == "" {
		in.Street = "Ubicación compartida por WhatsApp"
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar la dirección")
		return
	}
	defer tx.Rollback(r.Context())
	if in.MakePrimary {
		_, _ = tx.Exec(r.Context(), `UPDATE customer_addresses SET is_primary=false,updated_at=now() WHERE global_customer_id=$1`, globalID)
	}
	var addressID string
	err = tx.QueryRow(r.Context(), `INSERT INTO customer_addresses(global_customer_id,label,province_code,province,city_id,municipality,neighborhood_id,neighborhood,street,street_number,reference,is_primary,latitude,longitude) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id::text`, globalID, in.Label, in.ProvinceCode, in.Province, in.CityID, in.Municipality, in.NeighborhoodID, in.Neighborhood, in.Street, in.StreetNumber, in.Reference, in.MakePrimary, lat, lon).Scan(&addressID)
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar la dirección")
		return
	}
	zoneID := ""
	if in.AutoCreateZone && strings.TrimSpace(in.Neighborhood) != "" {
		if in.EstimatedMinutes <= 0 {
			in.EstimatedMinutes = 30
		}
		_ = tx.QueryRow(r.Context(), `INSERT INTO shipping_zones(store_id,name,charge,estimated_minutes,coverage_type,province_code,province,municipality_id,municipality,neighborhood_id,neighborhood,center_latitude,center_longitude,auto_created) VALUES($1,$2,$3,$4,'territory',$5,$6,$7,$8,$9,$10,$11,$12,true) ON CONFLICT DO NOTHING RETURNING id::text`, storeID, in.Neighborhood, in.ZoneCharge, in.EstimatedMinutes, in.ProvinceCode, in.Province, in.CityID, in.Municipality, in.NeighborhoodID, in.Neighborhood, lat, lon).Scan(&zoneID)
		if zoneID == "" {
			_ = tx.QueryRow(r.Context(), `SELECT id::text FROM shipping_zones WHERE store_id=$1 AND lower(coalesce(neighborhood,''))=lower($2) ORDER BY created_at LIMIT 1`, storeID, in.Neighborhood).Scan(&zoneID)
		}
	}
	if customerID != "" {
		addressText := strings.TrimSpace(strings.Join([]string{in.Street, in.StreetNumber, in.Neighborhood, in.Municipality, in.Province}, ", "))
		_, _ = tx.Exec(r.Context(), `UPDATE customers SET address=$1,updated_at=now() WHERE id=$2`, addressText, customerID)
		_, _ = tx.Exec(r.Context(), `UPDATE conversations SET contact_address=$1,updated_at=now() WHERE id=$2`, addressText, conversationID)
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar la dirección")
		return
	}
	jsonOut(w, 201, map[string]any{"ok": true, "address_id": addressID, "zone_id": zoneID, "latitude": lat, "longitude": lon})
}

func (s *Server) recordCourierLocation(w http.ResponseWriter, r *http.Request) {
	var in struct {
		StoreID        string   `json:"store_id"`
		CourierStaffID string   `json:"courier_staff_id"`
		AssignmentID   string   `json:"assignment_id"`
		Latitude       float64  `json:"latitude"`
		Longitude      float64  `json:"longitude"`
		AccuracyMeters *float64 `json:"accuracy_meters"`
	}
	if decode(r, &in) != nil || in.StoreID == "" || in.CourierStaffID == "" || in.Latitude < -90 || in.Latitude > 90 || in.Longitude < -180 || in.Longitude > 180 {
		jsonErr(w, 400, "Ubicación inválida")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	var n int
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM store_staff WHERE id=$1 AND store_id=$2 AND status='active'`, in.CourierStaffID, in.StoreID).Scan(&n)
	if n == 0 {
		jsonErr(w, 404, "Repartidor no encontrado")
		return
	}
	_, err := s.db.Exec(r.Context(), `INSERT INTO courier_location_events(store_id,courier_staff_id,assignment_id,latitude,longitude,accuracy_meters) VALUES($1,$2,NULLIF($3,'')::uuid,$4,$5,$6)`, in.StoreID, in.CourierStaffID, in.AssignmentID, in.Latitude, in.Longitude, in.AccuracyMeters)
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar la ubicación")
		return
	}
	if in.AssignmentID != "" {
		_, _ = s.db.Exec(r.Context(), `UPDATE delivery_assignments SET latitude=$1,longitude=$2,updated_at=now() WHERE id=$3 AND store_id=$4`, in.Latitude, in.Longitude, in.AssignmentID, in.StoreID)
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

type deliveryRouteCoord struct {
	StopID       string
	AssignmentID string
	Lat          *float64
	Lon          *float64
	Original     int
}

func haversineKM(aLat, aLon, bLat, bLon float64) float64 {
	const earth = 6371.0
	toRad := func(v float64) float64 { return v * math.Pi / 180 }
	dLat, dLon := toRad(bLat-aLat), toRad(bLon-aLon)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(toRad(aLat))*math.Cos(toRad(bLat))*math.Sin(dLon/2)*math.Sin(dLon/2)
	return earth * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

// optimizeRoute applies a local nearest-neighbour ordering. It deliberately works
// without an external map provider; GEO RD MAP/routing can later replace the
// distance heuristic without changing the route/stops contract.
func (s *Server) optimizeRoute(ctx context.Context, routeID, storeID string) (float64, int, error) {
	rows, err := s.db.Query(ctx, `SELECT rs.id::text,rs.assignment_id::text,a.latitude,a.longitude,rs.stop_order FROM delivery_route_stops rs JOIN delivery_assignments a ON a.id=rs.assignment_id JOIN delivery_routes dr ON dr.id=rs.route_id WHERE rs.route_id=$1 AND dr.store_id=$2 ORDER BY rs.stop_order`, routeID, storeID)
	if err != nil {
		return 0, 0, err
	}
	defer rows.Close()
	all := []deliveryRouteCoord{}
	for rows.Next() {
		var x deliveryRouteCoord
		if rows.Scan(&x.StopID, &x.AssignmentID, &x.Lat, &x.Lon, &x.Original) == nil {
			all = append(all, x)
		}
	}
	if len(all) == 0 {
		_, _ = s.db.Exec(ctx, `UPDATE delivery_routes SET total_distance_km=0,estimated_minutes=0,updated_at=now() WHERE id=$1 AND store_id=$2`, routeID, storeID)
		return 0, 0, nil
	}
	geo, missing := []deliveryRouteCoord{}, []deliveryRouteCoord{}
	for _, x := range all {
		if x.Lat != nil && x.Lon != nil {
			geo = append(geo, x)
		} else {
			missing = append(missing, x)
		}
	}
	ordered := []deliveryRouteCoord{}
	if len(geo) > 0 {
		ordered = append(ordered, geo[0])
		remaining := append([]deliveryRouteCoord(nil), geo[1:]...)
		for len(remaining) > 0 {
			last := ordered[len(ordered)-1]
			best, bestDist := 0, math.MaxFloat64
			for i, candidate := range remaining {
				d := haversineKM(*last.Lat, *last.Lon, *candidate.Lat, *candidate.Lon)
				if d < bestDist {
					best, bestDist = i, d
				}
			}
			ordered = append(ordered, remaining[best])
			remaining = append(remaining[:best], remaining[best+1:]...)
		}
	}
	ordered = append(ordered, missing...)
	distance := 0.0
	for i := 1; i < len(ordered); i++ {
		if ordered[i-1].Lat != nil && ordered[i].Lat != nil {
			distance += haversineKM(*ordered[i-1].Lat, *ordered[i-1].Lon, *ordered[i].Lat, *ordered[i].Lon)
		}
	}
	minutes := len(ordered) * 5
	if distance > 0 {
		minutes += int(math.Ceil(distance / 25 * 60))
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback(ctx)
	// Temporary negative values avoid UNIQUE(route_id,stop_order) collisions.
	for i, x := range ordered {
		_, _ = tx.Exec(ctx, `UPDATE delivery_route_stops SET stop_order=$1 WHERE id=$2`, -(i + 1), x.StopID)
	}
	for i, x := range ordered {
		_, _ = tx.Exec(ctx, `UPDATE delivery_route_stops SET stop_order=$1 WHERE id=$2`, i+1, x.StopID)
	}
	_, err = tx.Exec(ctx, `UPDATE delivery_routes SET total_distance_km=$1,estimated_minutes=$2,updated_at=now() WHERE id=$3 AND store_id=$4`, distance, minutes, routeID, storeID)
	if err != nil {
		return 0, 0, err
	}
	if err = tx.Commit(ctx); err != nil {
		return 0, 0, err
	}
	return distance, minutes, nil
}

func (s *Server) optimizeDeliveryRoute(w http.ResponseWriter, r *http.Request) {
	storeID := r.URL.Query().Get("store_id")
	c := claims(r)
	if storeID == "" || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	distance, minutes, err := s.optimizeRoute(r.Context(), chi.URLParam(r, "id"), storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudo optimizar la ruta")
		return
	}
	jsonOut(w, 200, map[string]any{"ok": true, "total_distance_km": distance, "estimated_minutes": minutes})
}
