package httpapi

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/binary"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

const (
	deliveryAudienceAdmin                 = "admin"
	deliveryAudienceDriver                = "driver"
	deliveryAudienceClient                = "client"
	automaticSingleDriverAssignmentPrefix = "automatic:single_active_driver:"

	deliveryLocationFreshness = 3 * time.Minute
	maxDeliveryRouteStops     = 50
	maxDeliveryTwoOptPasses   = 8
)

type deliveryOperationView struct {
	SaleID                  string
	DeliveryZoneID          string
	AssignedDriverID        string
	AssignedBy              string
	SingleActiveDriverID    string
	DriverName              string
	DriverLastName          string
	DriverWhatsapp          string
	DriverWhatsappDisplay   string
	AssignedAt              sql.NullTime
	AcceptedAt              sql.NullTime
	ReadyAt                 sql.NullTime
	RouteStartedAt          sql.NullTime
	DeliveredAt             sql.NullTime
	DeliveredBy             string
	DeliveredByName         string
	DeliveredByLastName     string
	PinVerifiedAt           sql.NullTime
	ProofType               string
	ProofNote               string
	RecipientName           string
	ProofLat                sql.NullFloat64
	ProofLng                sql.NullFloat64
	CustomerLat             sql.NullFloat64
	CustomerLng             sql.NullFloat64
	RoutePosition           int
	IssueNote               string
	DeliveryStatus          string
	CancelledAt             sql.NullTime
	CancellationReason      string
	CancelledBy             string
	IncidentID              string
	IncidentStatus          string
	IncidentType            string
	IncidentNote            string
	IncidentResolution      string
	IncidentDisposition     string
	IncidentResolutionNote  string
	IncidentReportedAt      sql.NullTime
	IncidentResolvedAt      sql.NullTime
	CustomerWhatsapp        string
	CustomerWhatsappDisplay string
	DriverLat               sql.NullFloat64
	DriverLng               sql.NullFloat64
	DriverAccuracy          sql.NullFloat64
	DriverHeading           sql.NullFloat64
	DriverSpeed             sql.NullFloat64
	DriverLocationUpdatedAt sql.NullTime
}

func isAutomaticSingleDriverAssignment(value string) bool {
	return strings.HasPrefix(strings.TrimSpace(value), automaticSingleDriverAssignmentPrefix)
}

func customerVisibleDeliveryStatus(audience, status, orderMode string) string {
	normalizedStatus := normalizeOrderStatus(status)
	if audience == deliveryAudienceClient && normalizedStatus == "ready_for_delivery" && orderMode != "pickup" {
		return "preparing"
	}
	return normalizedStatus
}

type routeStop struct {
	OrderID       string
	Lat           float64
	Lng           float64
	HasLocation   bool
	RoutePosition int
}

func nullableFloat(value string) any {
	parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
	if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
		return nil
	}
	return parsed
}

func timeOrNil(value sql.NullTime) any {
	if !value.Valid {
		return nil
	}
	return value.Time
}

func floatOrNil(value sql.NullFloat64) any {
	if !value.Valid {
		return nil
	}
	return value.Float64
}

func fullStaffName(firstName, lastName string) string {
	return strings.TrimSpace(strings.Join([]string{strings.TrimSpace(firstName), strings.TrimSpace(lastName)}, " "))
}

func deliveryStatusPriority(status string) int {
	switch normalizeOrderStatus(status) {
	case "ready_for_delivery":
		return 1
	case "on_the_way":
		return 2
	case "pending":
		return 3
	case "preparing":
		return 4
	case "issue":
		return 5
	case "delivered":
		return 6
	case "cancelled":
		return 7
	default:
		return 8
	}
}

func (s *Server) deliveryPIN(orderID string) string {
	mac := hmac.New(sha256.New, []byte("delivery-pin:"+s.cfg.AdminTokenSecret))
	_, _ = mac.Write([]byte(strings.TrimSpace(orderID)))
	digest := mac.Sum(nil)
	value := binary.BigEndian.Uint32(digest[:4]) % 10000
	return fmt.Sprintf("%04d", value)
}

func (s *Server) deliveryZoneForCustomer(ctx context.Context, storeID string, customer Customer) (DeliveryZone, bool, error) {
	zones, err := s.queryDeliveryZones(ctx, storeID)
	if err != nil {
		return DeliveryZone{}, false, err
	}
	bestScore := -1
	var best DeliveryZone
	for _, zone := range zones {
		if !deliveryZoneMatchesCustomer(zone, customer) {
			continue
		}
		score := deliveryZoneSpecificity(zone)
		if score > bestScore {
			bestScore = score
			best = zone
		}
	}
	return best, bestScore >= 0, nil
}

func deliveryZoneSpecificity(zone DeliveryZone) int {
	if strings.EqualFold(strings.TrimSpace(zone.ZoneType), "geofence") {
		return 100
	}
	score := 0
	if strings.TrimSpace(zone.ProvinceCode) != "" || strings.TrimSpace(zone.ProvinceName) != "" {
		score++
	}
	if strings.TrimSpace(zone.MunicipalityCode) != "" || strings.TrimSpace(zone.MunicipalityName) != "" {
		score += 2
	}
	if strings.TrimSpace(zone.DistrictCode) != "" {
		score += 4
	}
	if strings.TrimSpace(zone.NeighborhoodID) != "" {
		score += 8
	} else if strings.TrimSpace(zone.NeighborhoodName) != "" {
		score += 6
	}
	return score
}

func (s *Server) deliveryZoneByID(ctx context.Context, storeID, zoneID string) (DeliveryZone, error) {
	var zone DeliveryZone
	err := s.db.QueryRow(ctx, deliveryZoneSelectSQL(`SELECT`)+`
		FROM delivery_zones
		WHERE id=$1::uuid AND store_id=$2::uuid AND active=true
	`, zoneID, storeID).Scan(deliveryZoneScanPtrs(&zone)...)
	return zone, err
}

func (s *Server) createDeliveryOperation(ctx context.Context, tx pgx.Tx, saleID, storeID, zoneID, customerLat, customerLng string) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO delivery_operations (
			sale_id, store_id, delivery_zone_id, customer_lat, customer_lng, status, created_at, updated_at
		)
		VALUES ($1::uuid, $2::uuid, NULLIF($3,'')::uuid, $4, $5, 'pending', now(), now())
		ON CONFLICT (sale_id) DO UPDATE SET
			delivery_zone_id=COALESCE(EXCLUDED.delivery_zone_id, delivery_operations.delivery_zone_id),
			customer_lat=COALESCE(EXCLUDED.customer_lat, delivery_operations.customer_lat),
			customer_lng=COALESCE(EXCLUDED.customer_lng, delivery_operations.customer_lng),
			updated_at=now()
	`, saleID, storeID, zoneID, nullableFloat(customerLat), nullableFloat(customerLng))
	return err
}

func (s *Server) enrichOrdersWithDelivery(ctx context.Context, orders []map[string]any, audience string) ([]map[string]any, error) {
	if len(orders) == 0 {
		return orders, nil
	}

	indexes := make(map[string]int, len(orders))
	placeholders := make([]string, 0, len(orders))
	args := make([]any, 0, len(orders))
	for i, order := range orders {
		id := strings.TrimSpace(fmt.Sprint(order["id"]))
		if id == "" {
			continue
		}
		indexes[id] = i
		args = append(args, id)
		placeholders = append(placeholders, fmt.Sprintf("$%d::uuid", len(args)))
	}
	if len(args) == 0 {
		return orders, nil
	}

	query := `
		WITH active_driver AS (
			SELECT CASE WHEN COUNT(*)=1 THEN MIN(id::text) ELSE '' END AS single_driver_id
			FROM system_users
			WHERE active=true AND lower(trim(role))='delivery_driver'
		)
		SELECT
			op.sale_id::text,
			COALESCE(op.delivery_zone_id::text,''),
			COALESCE(op.assigned_driver_id::text,''),
			COALESCE(op.assigned_by,''),
			active_driver.single_driver_id,
			COALESCE(NULLIF(op.assigned_driver_name,''), NULLIF(trim(COALESCE(driver.name,'') || ' ' || COALESCE(driver.last_name,'')),''), ''),
			'',
			COALESCE(driver.whatsapp,''), COALESCE(driver.whatsapp_display,''),
			op.assigned_at, op.accepted_at, op.ready_at, op.route_started_at, op.delivered_at,
			COALESCE(op.delivered_by::text,''),
			COALESCE(NULLIF(op.delivered_by_name,''), NULLIF(trim(COALESCE(deliverer.name,'') || ' ' || COALESCE(deliverer.last_name,'')),''), ''),
			'',
			op.pin_verified_at, COALESCE(op.proof_type,''), COALESCE(op.proof_note,''), COALESCE(op.recipient_name,''),
			op.proof_lat, op.proof_lng, op.customer_lat, op.customer_lng,
			op.route_position, COALESCE(op.issue_note,''),
			COALESCE(op.status,''), op.cancelled_at, COALESCE(op.cancellation_reason,''), COALESCE(op.cancelled_by,''),
			COALESCE(incident.id::text,''), COALESCE(incident.status,''), COALESCE(incident.issue_type,''),
			COALESCE(incident.note,''), COALESCE(incident.resolution,''), COALESCE(incident.inventory_disposition,''),
			COALESCE(incident.resolution_note,''), incident.reported_at, incident.resolved_at,
			COALESCE(customer.whatsapp,''), COALESCE(customer.whatsapp_display,''),
			location.lat, location.lng, location.accuracy, location.heading, location.speed, location.updated_at
		FROM delivery_operations op
		CROSS JOIN active_driver
		LEFT JOIN sales sale ON sale.id=op.sale_id
		LEFT JOIN customers customer ON customer.id=sale.customer_id
		LEFT JOIN system_users driver ON driver.id=op.assigned_driver_id
		LEFT JOIN system_users deliverer ON deliverer.id=op.delivered_by
		LEFT JOIN delivery_driver_locations location ON location.driver_id=op.assigned_driver_id
		LEFT JOIN LATERAL (
			SELECT incident_record.*
			FROM delivery_incidents incident_record
			WHERE incident_record.sale_id=op.sale_id
			ORDER BY (incident_record.status='open') DESC, incident_record.reported_at DESC
			LIMIT 1
		) incident ON true
		WHERE op.sale_id IN (` + strings.Join(placeholders, ",") + `)
	`
	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var view deliveryOperationView
		if err := rows.Scan(
			&view.SaleID, &view.DeliveryZoneID, &view.AssignedDriverID, &view.AssignedBy, &view.SingleActiveDriverID,
			&view.DriverName, &view.DriverLastName, &view.DriverWhatsapp, &view.DriverWhatsappDisplay,
			&view.AssignedAt, &view.AcceptedAt, &view.ReadyAt, &view.RouteStartedAt, &view.DeliveredAt,
			&view.DeliveredBy, &view.DeliveredByName, &view.DeliveredByLastName,
			&view.PinVerifiedAt, &view.ProofType, &view.ProofNote, &view.RecipientName,
			&view.ProofLat, &view.ProofLng, &view.CustomerLat, &view.CustomerLng,
			&view.RoutePosition, &view.IssueNote,
			&view.DeliveryStatus, &view.CancelledAt, &view.CancellationReason, &view.CancelledBy,
			&view.IncidentID, &view.IncidentStatus, &view.IncidentType, &view.IncidentNote,
			&view.IncidentResolution, &view.IncidentDisposition, &view.IncidentResolutionNote,
			&view.IncidentReportedAt, &view.IncidentResolvedAt,
			&view.CustomerWhatsapp, &view.CustomerWhatsappDisplay,
			&view.DriverLat, &view.DriverLng, &view.DriverAccuracy, &view.DriverHeading, &view.DriverSpeed, &view.DriverLocationUpdatedAt,
		); err != nil {
			return nil, err
		}
		index, ok := indexes[view.SaleID]
		if !ok {
			continue
		}
		order := orders[index]
		order["delivery_zone_id"] = view.DeliveryZoneID
		order["deliveryZoneId"] = view.DeliveryZoneID
		order["assigned_driver_id"] = view.AssignedDriverID
		order["assignedDriverId"] = view.AssignedDriverID
		status := normalizeOrderStatus(fmt.Sprint(order["status"]))
		orderMode := strings.TrimSpace(fmt.Sprint(order["order_mode"]))
		if orderMode == "" {
			orderMode = orderModeFromSaleAddress(fmt.Sprint(order["deliveryAddress"]))
		}
		visibleStatus := customerVisibleDeliveryStatus(audience, status, orderMode)
		if visibleStatus != status {
			// Keep the operational handoff state private; customers remain in preparation until departure.
			order["status"] = visibleStatus
		}
		automaticAssignment := isAutomaticSingleDriverAssignment(view.AssignedBy) ||
			(status == "ready_for_delivery" && !view.AcceptedAt.Valid &&
				view.SingleActiveDriverID != "" && view.SingleActiveDriverID == view.AssignedDriverID)
		assignmentMode := "manual"
		if automaticAssignment {
			assignmentMode = "automatic"
		}
		effectiveAcceptedAt := view.AcceptedAt
		if automaticAssignment && !effectiveAcceptedAt.Valid {
			effectiveAcceptedAt = view.AssignedAt
			if !effectiveAcceptedAt.Valid {
				effectiveAcceptedAt = view.ReadyAt
			}
		}
		order["assignment_mode"] = assignmentMode
		order["assignmentMode"] = order["assignment_mode"]
		order["automatically_assigned"] = automaticAssignment
		order["automaticallyAssigned"] = automaticAssignment
		order["acceptance_required"] = view.AssignedDriverID != "" && !automaticAssignment && !effectiveAcceptedAt.Valid
		order["acceptanceRequired"] = order["acceptance_required"]
		order["assigned_at"] = timeOrNil(view.AssignedAt)
		order["assignedAt"] = timeOrNil(view.AssignedAt)
		order["accepted_at"] = timeOrNil(effectiveAcceptedAt)
		order["acceptedAt"] = timeOrNil(effectiveAcceptedAt)
		order["ready_at"] = timeOrNil(view.ReadyAt)
		order["readyAt"] = timeOrNil(view.ReadyAt)
		order["route_started_at"] = timeOrNil(view.RouteStartedAt)
		order["routeStartedAt"] = timeOrNil(view.RouteStartedAt)
		order["delivered_at"] = timeOrNil(view.DeliveredAt)
		order["deliveredAt"] = timeOrNil(view.DeliveredAt)
		order["route_position"] = view.RoutePosition
		order["routePosition"] = view.RoutePosition
		order["delivery_pin_verified"] = view.PinVerifiedAt.Valid
		order["deliveryPinVerified"] = view.PinVerifiedAt.Valid
		order["proof_type"] = view.ProofType
		order["proofType"] = view.ProofType
		order["proof_note"] = view.ProofNote
		order["proofNote"] = view.ProofNote
		order["recipient_name"] = view.RecipientName
		order["recipientName"] = view.RecipientName
		order["proof_lat"] = floatOrNil(view.ProofLat)
		order["proof_lng"] = floatOrNil(view.ProofLng)
		order["customer_lat"] = floatOrNil(view.CustomerLat)
		order["customer_lng"] = floatOrNil(view.CustomerLng)
		order["lat"] = floatOrNil(view.CustomerLat)
		order["lng"] = floatOrNil(view.CustomerLng)
		order["issue_note"] = view.IssueNote
		order["issueNote"] = view.IssueNote
		order["delivery_status"] = firstNonEmpty(view.DeliveryStatus, status)
		order["deliveryStatus"] = order["delivery_status"]
		order["cancelled_at"] = timeOrNil(view.CancelledAt)
		order["cancelledAt"] = timeOrNil(view.CancelledAt)
		if strings.TrimSpace(view.CancellationReason) != "" {
			order["cancellation_reason"] = view.CancellationReason
			order["cancellationReason"] = view.CancellationReason
		}
		order["cancelled_by"] = view.CancelledBy
		order["cancelledBy"] = view.CancelledBy
		if view.IncidentID != "" {
			incident := map[string]any{
				"id": view.IncidentID, "status": view.IncidentStatus, "issue_type": view.IncidentType,
				"issueType": view.IncidentType, "note": view.IncidentNote, "resolution": view.IncidentResolution,
				"inventory_disposition": view.IncidentDisposition, "inventoryDisposition": view.IncidentDisposition,
				"resolution_note": view.IncidentResolutionNote, "resolutionNote": view.IncidentResolutionNote,
				"reported_at": timeOrNil(view.IncidentReportedAt), "reportedAt": timeOrNil(view.IncidentReportedAt),
				"resolved_at": timeOrNil(view.IncidentResolvedAt), "resolvedAt": timeOrNil(view.IncidentResolvedAt),
			}
			order["delivery_incident"] = incident
			order["deliveryIncident"] = incident
		}

		if view.AssignedDriverID != "" {
			driverName := fullStaffName(view.DriverName, view.DriverLastName)
			order["assigned_driver"] = map[string]any{
				"id":        view.AssignedDriverID,
				"name":      view.DriverName,
				"last_name": view.DriverLastName,
				"full_name": driverName,
			}
			order["assignedDriver"] = order["assigned_driver"]
		}
		delivererName := fullStaffName(view.DeliveredByName, view.DeliveredByLastName)
		if view.DeliveredBy != "" || delivererName != "" {
			order["delivered_by"] = view.DeliveredBy
			order["deliveredBy"] = view.DeliveredBy
			order["delivered_by_name"] = delivererName
			order["deliveredByName"] = delivererName
		}

		if audience != deliveryAudienceClient {
			order["customer_phone"] = firstNonEmpty(view.CustomerWhatsappDisplay, view.CustomerWhatsapp)
			order["customerPhone"] = order["customer_phone"]
			order["customer_whatsapp"] = view.CustomerWhatsapp
			order["customerWhatsapp"] = view.CustomerWhatsapp
		}
		if audience == deliveryAudienceClient && !view.PinVerifiedAt.Valid && status == "on_the_way" {
			order["delivery_pin"] = s.deliveryPIN(view.SaleID)
			order["deliveryPin"] = order["delivery_pin"]
		}

		trackingFresh := view.DriverLocationUpdatedAt.Valid && time.Since(view.DriverLocationUpdatedAt.Time) <= deliveryLocationFreshness
		trackingAllowed := effectiveAcceptedAt.Valid && trackingFresh && (status == "ready_for_delivery" || status == "on_the_way")
		if audience == deliveryAudienceClient {
			// Do not reveal the driver's position while the order is still waiting at the business.
			trackingAllowed = trackingAllowed && status == "on_the_way"
		}
		if trackingAllowed && view.DriverLat.Valid && view.DriverLng.Valid {
			location := map[string]any{
				"lat":        view.DriverLat.Float64,
				"lng":        view.DriverLng.Float64,
				"accuracy":   floatOrNil(view.DriverAccuracy),
				"heading":    floatOrNil(view.DriverHeading),
				"speed":      floatOrNil(view.DriverSpeed),
				"updated_at": view.DriverLocationUpdatedAt.Time,
			}
			order["driver_location"] = location
			order["driverLocation"] = location
			order["tracking_available"] = true
			order["trackingAvailable"] = true
		} else {
			order["tracking_available"] = false
			order["trackingAvailable"] = false
		}
		orders[index] = order
	}
	return orders, rows.Err()
}

func (s *Server) deliveryOrderByID(ctx context.Context, orderID, audience string) (map[string]any, error) {
	sale, err := saleByID(ctx, s.db, orderID)
	if err != nil {
		return nil, err
	}
	orders, err := s.enrichOrdersWithDelivery(ctx, []map[string]any{saleToOrder(sale)}, audience)
	if err != nil {
		return nil, err
	}
	return orders[0], nil
}

func (s *Server) querySalesForViewer(ctx context.Context, storeID string) ([]map[string]any, error) {
	return s.querySalesForViewerLimit(ctx, storeID, 0)
}

func (s *Server) querySalesForViewerLimit(ctx context.Context, storeID string, limit int) ([]map[string]any, error) {
	staff, hasStaff := ctx.Value(staffUserContextKey{}).(StaffUser)
	args := []any{storeID}
	where := `sale.store_id=$1::uuid`
	audience := deliveryAudienceAdmin
	if hasStaff && normalizeStaffRole(staff.Role) == "delivery_driver" {
		args = append(args, staff.ID)
		where += ` AND sale.order_type='customer'
			AND EXISTS (
				SELECT 1 FROM delivery_operations operation
				WHERE operation.sale_id=sale.id AND operation.assigned_driver_id=$2::uuid
			)`
		audience = deliveryAudienceDriver
	}
	limitClause := ""
	if limit > 0 {
		args = append(args, limit)
		limitClause = fmt.Sprintf(" LIMIT $%d", len(args))
	}
	rows, err := s.db.Query(ctx, `
		SELECT sale.id::text, sale.store_id::text, sale.items, sale.total, sale.method, sale.customer,
		       sale.date, COALESCE(sale.customer_id::text,''), sale.delivery_address, sale.status, sale.order_type,
		       sale.financial_status, COALESCE(return_summary.returned_amount,0)
		FROM sales sale
		LEFT JOIN LATERAL (
			SELECT COALESCE(SUM(sale_return.amount),0) AS returned_amount
			FROM sale_returns sale_return
			WHERE sale_return.sale_id=sale.id
		) return_summary ON true
		WHERE `+where+`
		ORDER BY sale.date DESC`+limitClause, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	orders := []map[string]any{}
	for rows.Next() {
		var sale Sale
		var financialStatus string
		var returnedAmount float64
		scanPointers := append(saleScanPtrs(&sale), &financialStatus, &returnedAmount)
		if err := rows.Scan(scanPointers...); err != nil {
			return nil, err
		}
		order := saleToOrder(sale)
		order["financial_status"] = financialStatus
		order["financialStatus"] = financialStatus
		order["returned_amount"] = roundCurrency(returnedAmount)
		order["returnedAmount"] = roundCurrency(returnedAmount)
		order["net_total"] = roundCurrency(math.Max(0, sale.Total-returnedAmount))
		order["netTotal"] = roundCurrency(math.Max(0, sale.Total-returnedAmount))
		orders = append(orders, order)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return s.enrichOrdersWithDelivery(ctx, orders, audience)
}

func (s *Server) queryDeliveryOrders(ctx context.Context) ([]map[string]any, error) {
	staff, hasStaff := ctx.Value(staffUserContextKey{}).(StaffUser)
	args := []any{}
	where := `sale.order_type='customer'
		AND NOT (lower(sale.delivery_address) LIKE '%modalidad: recogida%' OR lower(sale.delivery_address) LIKE '%retirar en:%')`
	audience := deliveryAudienceAdmin
	if hasStaff && normalizeStaffRole(staff.Role) == "delivery_driver" {
		args = append(args, staff.ID)
		where += ` AND EXISTS (
			SELECT 1 FROM delivery_operations operation
			WHERE operation.sale_id=sale.id AND operation.assigned_driver_id=$1::uuid
		)`
		audience = deliveryAudienceDriver
	}
	rows, err := s.db.Query(ctx, `
		SELECT sale.id::text, sale.store_id::text, sale.items, sale.total, sale.method, sale.customer,
		       sale.date, COALESCE(sale.customer_id::text,''), sale.delivery_address, sale.status, sale.order_type
		FROM sales sale
		WHERE `+where+`
		ORDER BY
			CASE sale.status
				WHEN 'ready_for_delivery' THEN 1
				WHEN 'on_the_way' THEN 2
				WHEN 'pending' THEN 3
				WHEN 'preparing' THEN 4
				WHEN 'issue' THEN 5
				WHEN 'delivered' THEN 6
				WHEN 'cancelled' THEN 7
				ELSE 8
			END,
			sale.date DESC
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	orders := []map[string]any{}
	for rows.Next() {
		var sale Sale
		if err := rows.Scan(saleScanPtrs(&sale)...); err != nil {
			return nil, err
		}
		orders = append(orders, saleToOrder(sale))
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return s.enrichOrdersWithDelivery(ctx, orders, audience)
}

func (s *Server) deliveryOrders(w http.ResponseWriter, r *http.Request) {
	orders, err := s.queryDeliveryOrders(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, orders)
}

func (s *Server) listDeliveryDrivers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `
		SELECT user_record.id::text, user_record.name, user_record.last_name,
		       user_record.whatsapp, user_record.whatsapp_display,
		       COALESCE(user_record.profile_picture_url,''), user_record.active,
		       COUNT(operation.sale_id) FILTER (
				WHERE sale.status IN ('ready_for_delivery','on_the_way','issue')
				  AND operation.status <> 'cancelled' AND operation.delivered_at IS NULL
		       )::int AS active_orders,
		       location.updated_at
		FROM system_users user_record
		LEFT JOIN delivery_operations operation ON operation.assigned_driver_id=user_record.id
		LEFT JOIN sales sale ON sale.id=operation.sale_id
		LEFT JOIN delivery_driver_locations location ON location.driver_id=user_record.id
		WHERE lower(trim(user_record.role))='delivery_driver'
		GROUP BY user_record.id, location.updated_at
		ORDER BY user_record.active DESC, active_orders ASC, user_record.name, user_record.last_name
	`)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	drivers := []map[string]any{}
	for rows.Next() {
		var id, name, lastName, whatsapp, whatsappDisplay, avatar string
		var active bool
		var activeOrders int
		var lastLocation sql.NullTime
		if err := rows.Scan(&id, &name, &lastName, &whatsapp, &whatsappDisplay, &avatar, &active, &activeOrders, &lastLocation); err != nil {
			writeError(w, err)
			return
		}
		drivers = append(drivers, map[string]any{
			"id": id, "name": name, "last_name": lastName, "full_name": fullStaffName(name, lastName),
			"whatsapp": whatsapp, "whatsapp_display": whatsappDisplay, "profile_picture_url": avatar,
			"active": active, "active_orders": activeOrders, "last_location_at": timeOrNil(lastLocation),
		})
	}
	if err := rows.Err(); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, drivers)
}

func assignSingleActiveDeliveryDriver(ctx context.Context, tx pgx.Tx, orderID, storeID, actor string) (bool, error) {
	rows, err := tx.Query(ctx, `
		SELECT id::text, name, last_name
		FROM system_users
		WHERE active=true AND lower(trim(role))='delivery_driver'
		ORDER BY created_at, id
		LIMIT 2
	`)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	type driverCandidate struct {
		ID       string
		Name     string
		LastName string
	}
	candidates := make([]driverCandidate, 0, 2)
	for rows.Next() {
		var candidate driverCandidate
		if err := rows.Scan(&candidate.ID, &candidate.Name, &candidate.LastName); err != nil {
			return false, err
		}
		candidates = append(candidates, candidate)
	}
	if err := rows.Err(); err != nil {
		return false, err
	}
	if len(candidates) != 1 {
		return false, nil
	}

	driver := candidates[0]
	var routePosition int
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(MAX(route_position),0)+1
		FROM delivery_operations
		WHERE assigned_driver_id=$1::uuid AND delivered_at IS NULL AND status <> 'cancelled'
	`, driver.ID).Scan(&routePosition); err != nil {
		return false, err
	}

	actor = strings.TrimSpace(actor)
	if actor == "" {
		actor = "system"
	}
	command, err := tx.Exec(ctx, `
		UPDATE delivery_operations
		SET assigned_driver_id=$3::uuid,
			assigned_driver_name=$4,
			assigned_by=$5,
			assigned_at=now(),
			accepted_at=now(),
			status='accepted',
			route_started_at=NULL,
			delivered_at=NULL,
			delivered_by=NULL,
			pin_verified_at=NULL,
			proof_type='',
			proof_note='',
			recipient_name='',
			proof_lat=NULL,
			proof_lng=NULL,
			route_position=$6,
			ready_at=COALESCE(ready_at,now()),
			issue_note='',
			updated_at=now()
		WHERE sale_id=$1::uuid
		  AND store_id=$2::uuid
		  AND assigned_driver_id IS NULL
	`, orderID, storeID, driver.ID, fullStaffName(driver.Name, driver.LastName), automaticSingleDriverAssignmentPrefix+actor, routePosition)
	if err != nil {
		return false, err
	}
	return command.RowsAffected() > 0, nil
}

func (s *Server) assignDeliveryOrder(w http.ResponseWriter, r *http.Request) {
	var input struct {
		DriverID string `json:"driver_id"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input.DriverID = strings.TrimSpace(input.DriverID)
	if input.DriverID == "" {
		writeError(w, badRequest("Selecciona un repartidor"))
		return
	}
	orderID := chi.URLParam(r, "id")
	actor, _ := r.Context().Value(adminUserContextKey{}).(string)
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())

	var driver StaffUser
	if err := tx.QueryRow(r.Context(), `
		SELECT id::text, name, last_name, national_id, whatsapp, whatsapp_display,
		       COALESCE(profile_picture_url,''), country_code, dial_code, role, active, created_at, updated_at
		FROM system_users
		WHERE id=$1::uuid AND active=true AND lower(trim(role))='delivery_driver'
		FOR UPDATE
	`, input.DriverID).Scan(staffUserScanPtrs(&driver)...); err != nil {
		if errorsIsNoRows(err) {
			writeError(w, badRequest("El repartidor seleccionado no está disponible"))
			return
		}
		writeError(w, err)
		return
	}
	var activeDriverCount int
	if err := tx.QueryRow(r.Context(), `
		SELECT COUNT(*)::int
		FROM system_users
		WHERE active=true AND lower(trim(role))='delivery_driver'
	`).Scan(&activeDriverCount); err != nil {
		writeError(w, err)
		return
	}
	automaticallyAccepted := activeDriverCount == 1
	assignmentActor := strings.TrimSpace(actor)
	if assignmentActor == "" {
		assignmentActor = "system"
	}
	if automaticallyAccepted {
		assignmentActor = automaticSingleDriverAssignmentPrefix + assignmentActor
	}

	var status, address, storeID string
	if err := tx.QueryRow(r.Context(), `
		SELECT status, delivery_address, store_id::text
		FROM sales WHERE id=$1::uuid AND order_type='customer' FOR UPDATE
	`, orderID).Scan(&status, &address, &storeID); err != nil {
		writeError(w, err)
		return
	}
	if orderModeFromSaleAddress(address) != "delivery" {
		writeError(w, badRequest("Solo los pedidos de entrega pueden asignarse a un repartidor"))
		return
	}
	if normalizeOrderStatus(status) != "ready_for_delivery" {
		writeError(w, badRequest("El pedido debe estar listo para entregar antes de asignarlo"))
		return
	}

	var routePosition int
	_ = tx.QueryRow(r.Context(), `
		SELECT COALESCE(MAX(route_position),0)+1
		FROM delivery_operations
		WHERE assigned_driver_id=$1::uuid AND delivered_at IS NULL AND status <> 'cancelled'
	`, input.DriverID).Scan(&routePosition)
	_, err = tx.Exec(r.Context(), `
		INSERT INTO delivery_operations (
			sale_id, store_id, assigned_driver_id, assigned_driver_name, assigned_by, assigned_at, accepted_at, route_position, ready_at, status, updated_at
		)
		VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,now(),CASE WHEN $7 THEN now() ELSE NULL END,$6,now(),CASE WHEN $7 THEN 'accepted' ELSE 'assigned' END,now())
		ON CONFLICT (sale_id) DO UPDATE SET
			assigned_driver_id=EXCLUDED.assigned_driver_id,
			assigned_driver_name=EXCLUDED.assigned_driver_name,
			assigned_by=EXCLUDED.assigned_by,
			assigned_at=now(),
			accepted_at=CASE WHEN $7 THEN now() ELSE NULL END,
			status=CASE WHEN $7 THEN 'accepted' ELSE 'assigned' END,
			route_started_at=NULL,
			delivered_at=NULL,
			delivered_by=NULL,
			pin_verified_at=NULL,
			proof_type='',
			proof_note='',
			recipient_name='',
			proof_lat=NULL,
			proof_lng=NULL,
			route_position=EXCLUDED.route_position,
			ready_at=COALESCE(delivery_operations.ready_at, now()),
			issue_note='',
			updated_at=now()
	`, orderID, storeID, input.DriverID, fullStaffName(driver.Name, driver.LastName), assignmentActor, routePosition, automaticallyAccepted)
	if err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	order, err := s.deliveryOrderByID(r.Context(), orderID, deliveryAudienceAdmin)
	if err != nil {
		writeError(w, err)
		return
	}
	s.invalidateTenantCache(r.Context())
	s.publishTenantEvent(r.Context(), "delivery_assigned", map[string]any{
		"orderId": orderID, "storeId": storeID, "automatic": automaticallyAccepted,
	})
	if automaticallyAccepted {
		s.publishTenantEvent(r.Context(), "delivery_accepted", map[string]any{
			"orderId": orderID, "storeId": storeID, "automatic": true,
		})
	}
	writeJSON(w, http.StatusOK, order)
}

func errorsIsNoRows(err error) bool {
	return err == pgx.ErrNoRows || err == sql.ErrNoRows
}

func staffDriverFromContext(ctx context.Context) (StaffUser, error) {
	user, ok := ctx.Value(staffUserContextKey{}).(StaffUser)
	if !ok || strings.TrimSpace(user.ID) == "" || normalizeStaffRole(user.Role) != "delivery_driver" {
		return StaffUser{}, apiError{status: http.StatusForbidden, msg: "Esta acción requiere una sesión de repartidor"}
	}
	return user, nil
}

func (s *Server) acceptDeliveryOrder(w http.ResponseWriter, r *http.Request) {
	driver, err := staffDriverFromContext(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	orderID := chi.URLParam(r, "id")
	command, err := s.db.Exec(r.Context(), `
		UPDATE delivery_operations operation
		SET accepted_at=COALESCE(accepted_at,now()), status='accepted', updated_at=now()
		FROM sales sale
		WHERE operation.sale_id=sale.id
		  AND operation.sale_id=$1::uuid
		  AND operation.assigned_driver_id=$2::uuid
		  AND sale.status='ready_for_delivery'
	`, orderID, driver.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	if command.RowsAffected() == 0 {
		writeError(w, badRequest("Este pedido no está asignado a tu usuario o ya no está disponible"))
		return
	}
	order, err := s.deliveryOrderByID(r.Context(), orderID, deliveryAudienceDriver)
	if err != nil {
		writeError(w, err)
		return
	}
	s.publishTenantEvent(r.Context(), "delivery_accepted", map[string]any{"orderId": orderID})
	writeJSON(w, http.StatusOK, order)
}

func (s *Server) startDeliveryOrder(w http.ResponseWriter, r *http.Request) {
	driver, err := staffDriverFromContext(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	orderID := chi.URLParam(r, "id")
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var storeID, customerID string
	if err := tx.QueryRow(r.Context(), `
		SELECT store_id::text, COALESCE(customer_id::text,'')
		FROM sales WHERE id=$1::uuid FOR UPDATE
	`, orderID).Scan(&storeID, &customerID); err != nil {
		writeError(w, err)
		return
	}
	if _, err := tx.Exec(r.Context(), `
		UPDATE delivery_operations operation
		SET accepted_at=COALESCE(operation.accepted_at,operation.assigned_at,now()),
			status='accepted',
			assigned_by=CASE
				WHEN trim(COALESCE(operation.assigned_by,''))='' THEN $3
				ELSE operation.assigned_by
			END,
			updated_at=now()
		WHERE operation.sale_id=$1::uuid
		  AND operation.assigned_driver_id=$2::uuid
		  AND operation.accepted_at IS NULL
		  AND (SELECT COUNT(*) FROM system_users WHERE active=true AND lower(trim(role))='delivery_driver')=1
		  AND operation.assigned_driver_id=(
			SELECT id FROM system_users
			WHERE active=true AND lower(trim(role))='delivery_driver'
			ORDER BY created_at, id
			LIMIT 1
		  )
	`, orderID, driver.ID, automaticSingleDriverAssignmentPrefix+"route_start"); err != nil {
		writeError(w, err)
		return
	}
	command, err := tx.Exec(r.Context(), `
		UPDATE sales sale
		SET status='on_the_way'
		FROM delivery_operations operation
		WHERE sale.id=operation.sale_id
		  AND sale.id=$1::uuid
		  AND sale.status='ready_for_delivery'
		  AND operation.assigned_driver_id=$2::uuid
		  AND operation.accepted_at IS NOT NULL
	`, orderID, driver.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	if command.RowsAffected() == 0 {
		writeError(w, badRequest("La entrega debe estar aceptada y asignada a tu usuario antes de iniciar la ruta"))
		return
	}
	if _, err := tx.Exec(r.Context(), `
		UPDATE delivery_operations
		SET route_started_at=COALESCE(route_started_at,now()), status='on_the_way', updated_at=now()
		WHERE sale_id=$1::uuid AND assigned_driver_id=$2::uuid
	`, orderID, driver.ID); err != nil {
		writeError(w, err)
		return
	}
	if err := recordOrderStatusTx(r.Context(), tx, storeID, customerID, orderID, "on_the_way", actorFromContext(r.Context()), map[string]any{"driverId": driver.ID}); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	s.syncActiveDeliveryGeoDestination(r.Context(), orderID)
	order, err := s.deliveryOrderByID(r.Context(), orderID, deliveryAudienceDriver)
	if err != nil {
		writeError(w, err)
		return
	}
	s.invalidateTenantCache(r.Context())
	writeJSON(w, http.StatusOK, order)
}

func (s *Server) completeDeliveryOrder(w http.ResponseWriter, r *http.Request) {
	driver, err := staffDriverFromContext(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	var input struct {
		PIN                string `json:"pin"`
		ProofType          string `json:"proof_type"`
		ProofTypeCamel     string `json:"proofType"`
		ProofNote          string `json:"proof_note"`
		ProofNoteCamel     string `json:"proofNote"`
		RecipientName      string `json:"recipient_name"`
		RecipientNameCamel string `json:"recipientName"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	orderID := chi.URLParam(r, "id")
	proofType := strings.ToLower(strings.TrimSpace(firstNonEmpty(input.ProofType, input.ProofTypeCamel)))
	proofNote := strings.TrimSpace(firstNonEmpty(input.ProofNote, input.ProofNoteCamel))
	recipientName := strings.TrimSpace(firstNonEmpty(input.RecipientName, input.RecipientNameCamel))
	pinVerified := false
	if strings.TrimSpace(input.PIN) != "" {
		expected := s.deliveryPIN(orderID)
		pinVerified = subtle.ConstantTimeCompare([]byte(expected), []byte(strings.TrimSpace(input.PIN))) == 1
		if !pinVerified {
			writeError(w, badRequest("El PIN de entrega no es correcto"))
			return
		}
		proofType = "pin"
	}
	if !pinVerified {
		proofType = "manual"
		if len([]rune(recipientName)) < 2 || len([]rune(proofNote)) < 5 {
			writeError(w, badRequest("Escribe quién recibió y una observación breve como prueba de entrega"))
			return
		}
	}

	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var storeID, customerID string
	if err := tx.QueryRow(r.Context(), `
		SELECT store_id::text, COALESCE(customer_id::text,'')
		FROM sales WHERE id=$1::uuid FOR UPDATE
	`, orderID).Scan(&storeID, &customerID); err != nil {
		writeError(w, err)
		return
	}
	var proofLat, proofLng sql.NullFloat64
	_ = tx.QueryRow(r.Context(), `
		SELECT lat, lng
		FROM delivery_driver_locations
		WHERE driver_id=$1::uuid AND updated_at >= now() - interval '3 minutes'
	`, driver.ID).Scan(&proofLat, &proofLng)
	command, err := tx.Exec(r.Context(), `
		UPDATE sales sale
		SET status='delivered'
		FROM delivery_operations operation
		WHERE sale.id=operation.sale_id
		  AND sale.id=$1::uuid
		  AND sale.status='on_the_way'
		  AND operation.assigned_driver_id=$2::uuid
		  AND operation.accepted_at IS NOT NULL
	`, orderID, driver.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	if command.RowsAffected() == 0 {
		writeError(w, badRequest("El pedido debe estar en ruta y asignado a tu usuario"))
		return
	}
	_, err = tx.Exec(r.Context(), `
		UPDATE delivery_operations
		SET delivered_at=now(), status='delivered', delivered_by=$2::uuid, delivered_by_name=$3,
		    pin_verified_at=CASE WHEN $4 THEN now() ELSE NULL END,
		    proof_type=$5, proof_note=$6, recipient_name=$7,
		    proof_lat=$8, proof_lng=$9, updated_at=now()
		WHERE sale_id=$1::uuid AND assigned_driver_id=$2::uuid
	`, orderID, driver.ID, fullStaffName(driver.Name, driver.LastName), pinVerified, proofType, proofNote, recipientName, floatOrNil(proofLat), floatOrNil(proofLng))
	if err != nil {
		writeError(w, err)
		return
	}
	if err := recordOrderStatusTx(r.Context(), tx, storeID, customerID, orderID, "delivered", actorFromContext(r.Context()), map[string]any{"driverId": driver.ID, "proofType": proofType}); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	s.syncActiveDeliveryGeoDestination(r.Context(), orderID)
	order, err := s.deliveryOrderByID(r.Context(), orderID, deliveryAudienceDriver)
	if err != nil {
		writeError(w, err)
		return
	}
	s.invalidateTenantCache(r.Context())
	writeJSON(w, http.StatusOK, order)
}

func (s *Server) reportDeliveryIssue(w http.ResponseWriter, r *http.Request) {
	driver, err := staffDriverFromContext(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	var input struct {
		Note      string `json:"note"`
		IssueType string `json:"issue_type"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input.Note = strings.TrimSpace(input.Note)
	if len([]rune(input.Note)) < 5 {
		writeError(w, badRequest("Describe brevemente el problema de la entrega"))
		return
	}
	orderID := chi.URLParam(r, "id")
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var storeID, customerID, previousStatus, financialStatus string
	if err := tx.QueryRow(r.Context(), `
		SELECT store_id::text, COALESCE(customer_id::text,''), status, financial_status
		FROM sales WHERE id=$1::uuid FOR UPDATE
	`, orderID).Scan(&storeID, &customerID, &previousStatus, &financialStatus); err != nil {
		writeError(w, err)
		return
	}
	previousStatus = normalizeOrderStatus(previousStatus)
	if financialStatus != "completed" {
		writeError(w, badRequest("La operación financiera del pedido ya está cerrada"))
		return
	}
	if previousStatus == "delivered" || previousStatus == "cancelled" {
		writeError(w, badRequest("Este pedido ya no está disponible para reportar un problema"))
		return
	}
	command, err := tx.Exec(r.Context(), `
		UPDATE sales sale SET status='issue', updated_at=now()
		FROM delivery_operations operation
		WHERE sale.id=operation.sale_id AND sale.id=$1::uuid
		  AND operation.assigned_driver_id=$2::uuid
		  AND sale.status NOT IN ('delivered','cancelled')
	`, orderID, driver.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	if command.RowsAffected() == 0 {
		writeError(w, badRequest("Este pedido no está disponible para reportar un problema"))
		return
	}
	incidentID, err := openDeliveryIncidentTx(r.Context(), tx, storeID, orderID, driver.ID, previousStatus, input.IssueType, input.Note)
	if err != nil {
		writeError(w, err)
		return
	}
	if _, err := tx.Exec(r.Context(), `
		UPDATE delivery_operations
		SET issue_note=$3,status='issue',incident_id=$4::uuid,updated_at=now()
		WHERE sale_id=$1::uuid AND assigned_driver_id=$2::uuid
	`, orderID, driver.ID, input.Note, incidentID); err != nil {
		writeError(w, err)
		return
	}
	if err := recordOrderStatusTx(r.Context(), tx, storeID, customerID, orderID, "issue", actorFromContext(r.Context()), map[string]any{
		"driverId": driver.ID, "note": input.Note, "issueType": input.IssueType, "incidentId": incidentID, "previousStatus": previousStatus,
	}); err != nil {
		writeError(w, err)
		return
	}
	if err := insertOutboxTx(r.Context(), tx, storeID, "delivery_incident", incidentID, "delivery.incident.reported", map[string]any{
		"incidentId": incidentID, "orderId": orderID, "storeId": storeID, "driverId": driver.ID, "note": input.Note,
	}, "delivery.incident.reported:"+incidentID); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	s.syncActiveDeliveryGeoDestination(r.Context(), orderID)
	order, err := s.deliveryOrderByID(r.Context(), orderID, deliveryAudienceDriver)
	if err != nil {
		writeError(w, err)
		return
	}
	s.invalidateTenantCache(r.Context())
	writeJSON(w, http.StatusOK, order)
}

func (s *Server) updateDeliveryLocation(w http.ResponseWriter, r *http.Request) {
	driver, err := staffDriverFromContext(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	var input struct {
		Lat      float64  `json:"lat"`
		Lng      float64  `json:"lng"`
		Accuracy float64  `json:"accuracy"`
		Heading  *float64 `json:"heading"`
		Speed    *float64 `json:"speed"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if input.Lat < -90 || input.Lat > 90 || input.Lng < -180 || input.Lng > 180 {
		writeError(w, badRequest("La ubicación recibida no es válida"))
		return
	}
	var active bool
	if err := s.db.QueryRow(r.Context(), `
		SELECT EXISTS(
			SELECT 1
			FROM delivery_operations operation
			JOIN sales sale ON sale.id=operation.sale_id
			WHERE operation.assigned_driver_id=$1::uuid
			  AND (
				operation.accepted_at IS NOT NULL
				OR operation.assigned_by LIKE 'automatic:single_active_driver:%'
				OR (
				  (SELECT COUNT(*) FROM system_users WHERE active=true AND lower(trim(role))='delivery_driver')=1
				  AND operation.assigned_driver_id=(
					SELECT id FROM system_users
					WHERE active=true AND lower(trim(role))='delivery_driver'
					ORDER BY created_at, id
					LIMIT 1
				  )
				)
			  )
			  AND sale.status IN ('ready_for_delivery','on_the_way')
		)
	`, driver.ID).Scan(&active); err != nil {
		writeError(w, err)
		return
	}
	if !active {
		s.clearDeliveryDriverGeoLocation(r.Context(), driver.ID)
		writeJSON(w, http.StatusOK, map[string]any{"tracking": false, "message": "La ubicación en vivo se activa cuando tienes una entrega lista o en ruta"})
		return
	}
	var updatedAt time.Time
	err = s.db.QueryRow(r.Context(), `
		INSERT INTO delivery_driver_locations (driver_id, lat, lng, accuracy, heading, speed, updated_at)
		VALUES ($1::uuid,$2,$3,$4,$5,$6,now())
		ON CONFLICT (driver_id) DO UPDATE SET
			lat=EXCLUDED.lat, lng=EXCLUDED.lng, accuracy=EXCLUDED.accuracy,
			heading=EXCLUDED.heading, speed=EXCLUDED.speed, updated_at=now()
		RETURNING updated_at
	`, driver.ID, input.Lat, input.Lng, math.Max(0, input.Accuracy), input.Heading, input.Speed).Scan(&updatedAt)
	if err != nil {
		writeError(w, err)
		return
	}
	s.syncDeliveryDriverGeoLocation(r.Context(), driver.ID, input.Lat, input.Lng, input.Accuracy, input.Heading, input.Speed, updatedAt)
	s.publishTenantEvent(r.Context(), "delivery_tracking_updated", map[string]any{"updatedAt": updatedAt})
	writeJSON(w, http.StatusOK, map[string]any{"tracking": true, "updated_at": updatedAt})
}

func haversineKM(aLat, aLng, bLat, bLng float64) float64 {
	const earthRadiusKM = 6371.0088
	toRadians := func(value float64) float64 { return value * math.Pi / 180 }
	dLat := toRadians(bLat - aLat)
	dLng := toRadians(bLng - aLng)
	lat1 := toRadians(aLat)
	lat2 := toRadians(bLat)
	value := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(lat1)*math.Cos(lat2)*math.Sin(dLng/2)*math.Sin(dLng/2)
	return earthRadiusKM * 2 * math.Atan2(math.Sqrt(value), math.Sqrt(1-value))
}

func routeLength(stops []routeStop, startLat, startLng float64, hasStart bool) float64 {
	if len(stops) == 0 {
		return 0
	}
	distance := 0.0
	lastLat, lastLng := stops[0].Lat, stops[0].Lng
	startIndex := 1
	if hasStart {
		lastLat, lastLng = startLat, startLng
		startIndex = 0
	}
	for i := startIndex; i < len(stops); i++ {
		if !stops[i].HasLocation {
			continue
		}
		distance += haversineKM(lastLat, lastLng, stops[i].Lat, stops[i].Lng)
		lastLat, lastLng = stops[i].Lat, stops[i].Lng
	}
	return distance
}

func nearestNeighborRoute(stops []routeStop, startLat, startLng float64, hasStart bool) []routeStop {
	located := make([]routeStop, 0, len(stops))
	unlocated := make([]routeStop, 0, len(stops))
	for _, stop := range stops {
		if stop.HasLocation {
			located = append(located, stop)
		} else {
			unlocated = append(unlocated, stop)
		}
	}
	if len(located) <= 1 {
		return append(located, unlocated...)
	}
	currentLat, currentLng := located[0].Lat, located[0].Lng
	if hasStart {
		currentLat, currentLng = startLat, startLng
	}
	remaining := append([]routeStop(nil), located...)
	ordered := make([]routeStop, 0, len(stops))
	for len(remaining) > 0 {
		bestIndex := 0
		bestDistance := math.MaxFloat64
		for i, stop := range remaining {
			distance := haversineKM(currentLat, currentLng, stop.Lat, stop.Lng)
			if distance < bestDistance {
				bestDistance = distance
				bestIndex = i
			}
		}
		best := remaining[bestIndex]
		ordered = append(ordered, best)
		currentLat, currentLng = best.Lat, best.Lng
		remaining = append(remaining[:bestIndex], remaining[bestIndex+1:]...)
	}
	ordered = twoOptRoute(ordered, startLat, startLng, hasStart)
	return append(ordered, unlocated...)
}

func twoOptRoute(stops []routeStop, startLat, startLng float64, hasStart bool) []routeStop {
	if len(stops) < 4 {
		return stops
	}
	best := append([]routeStop(nil), stops...)
	bestDistance := routeLength(best, startLat, startLng, hasStart)
	for pass := 0; pass < maxDeliveryTwoOptPasses; pass++ {
		improved := false
		for i := 0; i < len(best)-2; i++ {
			for k := i + 1; k < len(best); k++ {
				candidate := append([]routeStop(nil), best...)
				for left, right := i, k; left < right; left, right = left+1, right-1 {
					candidate[left], candidate[right] = candidate[right], candidate[left]
				}
				distance := routeLength(candidate, startLat, startLng, hasStart)
				if distance+0.001 < bestDistance {
					best = candidate
					bestDistance = distance
					improved = true
				}
			}
		}
		if !improved {
			break
		}
	}
	return best
}

func (s *Server) optimizeDeliveryRoute(w http.ResponseWriter, r *http.Request) {
	driver, err := staffDriverFromContext(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	var input struct {
		Lat *float64 `json:"lat"`
		Lng *float64 `json:"lng"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	startLat, startLng := 0.0, 0.0
	startSource := "none"
	hasStart := input.Lat != nil && input.Lng != nil
	if hasStart {
		startSource = "device"
		startLat, startLng = *input.Lat, *input.Lng
		if startLat < -90 || startLat > 90 || startLng < -180 || startLng > 180 {
			writeError(w, badRequest("La ubicación inicial de la ruta no es válida"))
			return
		}
	} else {
		if lat, lng, available := s.deliveryDriverGeoCoordinates(r.Context(), driver.ID); available {
			startLat, startLng, hasStart = lat, lng, true
			startSource = "driver"
		} else {
			var lat, lng float64
			if err := s.db.QueryRow(r.Context(), `
				SELECT lat, lng
				FROM delivery_driver_locations
				WHERE driver_id=$1::uuid AND updated_at >= now() - interval '15 minutes'
			`, driver.ID).Scan(&lat, &lng); err == nil {
				startLat, startLng, hasStart = lat, lng, true
				startSource = "driver"
			}
		}
	}
	if !hasStart {
		if lat, lng, configured := s.tenantStoreCoordinates(r.Context()); configured {
			startLat, startLng, hasStart = lat, lng, true
			startSource = "store"
		}
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT operation.sale_id::text, operation.customer_lat, operation.customer_lng, operation.route_position
		FROM delivery_operations operation
		JOIN sales sale ON sale.id=operation.sale_id
		WHERE operation.assigned_driver_id=$1::uuid
		  AND (
			operation.accepted_at IS NOT NULL
			OR operation.assigned_by LIKE 'automatic:single_active_driver:%'
			OR (
			  (SELECT COUNT(*) FROM system_users WHERE active=true AND lower(trim(role))='delivery_driver')=1
			  AND operation.assigned_driver_id=(
				SELECT id FROM system_users
				WHERE active=true AND lower(trim(role))='delivery_driver'
				ORDER BY created_at, id
				LIMIT 1
			  )
			)
		  )
		  AND sale.status IN ('ready_for_delivery','on_the_way')
		ORDER BY CASE WHEN operation.route_position > 0 THEN 0 ELSE 1 END, operation.route_position, sale.date
	`, driver.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	stops := []routeStop{}
	for rows.Next() {
		var stop routeStop
		var lat, lng sql.NullFloat64
		if err := rows.Scan(&stop.OrderID, &lat, &lng, &stop.RoutePosition); err != nil {
			writeError(w, err)
			return
		}
		stop.HasLocation = lat.Valid && lng.Valid
		if stop.HasLocation {
			stop.Lat, stop.Lng = lat.Float64, lng.Float64
		}
		stops = append(stops, stop)
	}
	if err := rows.Err(); err != nil {
		writeError(w, err)
		return
	}
	if len(stops) > maxDeliveryRouteStops {
		writeError(w, badRequest("La ruta tiene demasiadas paradas para optimizarla de una sola vez"))
		return
	}
	ordered := nearestNeighborRoute(stops, startLat, startLng, hasStart)
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	for index, stop := range ordered {
		if _, err := tx.Exec(r.Context(), `UPDATE delivery_operations SET route_position=$2, updated_at=now() WHERE sale_id=$1::uuid AND assigned_driver_id=$3::uuid`, stop.OrderID, index+1, driver.ID); err != nil {
			writeError(w, err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	distance := routeLength(ordered, startLat, startLng, hasStart)
	estimatedMinutes := int(math.Ceil((distance/25)*60 + float64(len(ordered))*4))
	orders, err := s.queryDeliveryOrders(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	sort.SliceStable(orders, func(i, j int) bool {
		left := int(floatFromAny(orders[i]["route_position"]))
		right := int(floatFromAny(orders[j]["route_position"]))
		if left == 0 {
			left = 999999
		}
		if right == 0 {
			right = 999999
		}
		if left == right {
			return deliveryStatusPriority(fmt.Sprint(orders[i]["status"])) < deliveryStatusPriority(fmt.Sprint(orders[j]["status"]))
		}
		return left < right
	})
	var startLatitude any
	var startLongitude any
	if hasStart {
		startLatitude = startLat
		startLongitude = startLng
	}
	s.publishTenantEvent(r.Context(), "delivery_route_optimized", map[string]any{"stops": len(ordered), "startSource": startSource})
	writeJSON(w, http.StatusOK, map[string]any{
		"orders":              orders,
		"distance_km":         math.Round(distance*10) / 10,
		"estimated_minutes":   estimatedMinutes,
		"optimized":           true,
		"optimization_method": "nearest_neighbor_2opt",
		"start_source":        startSource,
		"start_latitude":      startLatitude,
		"start_longitude":     startLongitude,
	})
}

func (s *Server) confirmClientPickup(w http.ResponseWriter, r *http.Request) {
	orderID := strings.TrimSpace(chi.URLParam(r, "id"))
	customerID, _ := r.Context().Value(customerIDContextKey{}).(string)
	if orderID == "" || strings.TrimSpace(customerID) == "" {
		writeError(w, apiError{status: http.StatusNotFound, msg: "Pedido no encontrado"})
		return
	}

	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())

	var currentStatus, address, storeID, ownerCustomerID string
	err = tx.QueryRow(r.Context(), `
		SELECT status, delivery_address, store_id::text, COALESCE(customer_id::text,'')
		FROM sales
		WHERE id=$1::uuid AND order_type='customer'
		FOR UPDATE
	`, orderID).Scan(&currentStatus, &address, &storeID, &ownerCustomerID)
	if err != nil {
		if err == pgx.ErrNoRows {
			writeError(w, apiError{status: http.StatusNotFound, msg: "Pedido no encontrado"})
			return
		}
		writeError(w, err)
		return
	}
	if ownerCustomerID != customerID {
		writeError(w, apiError{status: http.StatusNotFound, msg: "Pedido no encontrado"})
		return
	}
	if orderModeFromSaleAddress(address) != "pickup" {
		writeError(w, badRequest("Este pedido no corresponde a una recogida en el negocio"))
		return
	}

	currentStatus = normalizeOrderStatus(currentStatus)
	if currentStatus != "ready_for_delivery" && currentStatus != "delivered" {
		writeError(w, badRequest("El pedido todavía no está listo"))
		return
	}

	changed := currentStatus != "delivered"
	if changed {
		if _, err := tx.Exec(r.Context(), `UPDATE sales SET status='delivered' WHERE id=$1::uuid`, orderID); err != nil {
			writeError(w, err)
			return
		}
		if err := recordOrderStatusTx(r.Context(), tx, storeID, customerID, orderID, "delivered", actorFromContext(r.Context()), map[string]any{"mode": "pickup"}); err != nil {
			writeError(w, err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}

	order, err := s.deliveryOrderByID(r.Context(), orderID, deliveryAudienceClient)
	if err != nil {
		writeError(w, err)
		return
	}
	if changed {
		s.invalidateTenantCache(r.Context())
	}
	writeJSON(w, http.StatusOK, map[string]any{"order": order, "picked_up": true})
}

func (s *Server) updateOrderStatus(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Status string `json:"status"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	status := normalizeOrderStatus(input.Status)
	allowed := map[string]bool{
		"pending": true, "preparing": true, "ready_for_delivery": true,
		"delivered": true, "issue": true,
	}
	if !allowed[status] {
		writeError(w, badRequest("Estado de pedido inválido"))
		return
	}
	orderID := chi.URLParam(r, "id")
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var currentStatus, address, storeID, customerID string
	if err := tx.QueryRow(r.Context(), `
		SELECT status, delivery_address, store_id::text, COALESCE(customer_id::text,'')
		FROM sales WHERE id=$1::uuid AND order_type='customer' FOR UPDATE
	`, orderID).Scan(&currentStatus, &address, &storeID, &customerID); err != nil {
		writeError(w, err)
		return
	}
	currentStatus = normalizeOrderStatus(currentStatus)
	mode := orderModeFromSaleAddress(address)
	valid := false
	switch status {
	case "pending":
		valid = currentStatus == "issue" || currentStatus == "pending"
	case "preparing":
		valid = currentStatus == "pending" || currentStatus == "issue" || currentStatus == "preparing"
	case "ready_for_delivery":
		valid = (mode == "delivery" || mode == "pickup") && (currentStatus == "preparing" || currentStatus == "ready_for_delivery")
	case "delivered":
		valid = mode == "pickup" && currentStatus == "delivered"
	case "issue":
		valid = currentStatus != "delivered" && currentStatus != "cancelled"
	}
	if currentStatus == "issue" && status != "issue" {
		writeError(w, apiError{status: http.StatusConflict, msg: "Resuelve la incidencia desde Ventas, anulaciones y devoluciones antes de cambiar el estado"})
		return
	}
	if !valid {
		if mode == "delivery" && status == "delivered" {
			writeError(w, badRequest("Las entregas se completan desde el panel del repartidor con PIN o prueba de entrega"))
			return
		}
		if mode == "pickup" && status == "delivered" {
			writeError(w, badRequest("La recogida se confirma desde el pedido del cliente cuando recibe los productos en el negocio"))
			return
		}
		writeError(w, badRequest("Ese cambio de estado no corresponde al flujo actual del pedido"))
		return
	}
	if _, err := tx.Exec(r.Context(), `UPDATE sales SET status=$2,updated_at=now() WHERE id=$1::uuid`, orderID, status); err != nil {
		writeError(w, err)
		return
	}
	automaticallyAssigned := false
	if mode == "delivery" {
		if _, err := tx.Exec(r.Context(), `
			INSERT INTO delivery_operations (sale_id, store_id, ready_at, status, updated_at)
			VALUES ($1::uuid,$2::uuid,CASE WHEN $3='ready_for_delivery' THEN now() ELSE NULL END,$3,now())
			ON CONFLICT (sale_id) DO UPDATE SET
				ready_at=CASE WHEN $3='ready_for_delivery' THEN COALESCE(delivery_operations.ready_at,now()) ELSE delivery_operations.ready_at END,
				status=$3,
				assigned_driver_id=CASE WHEN $3 IN ('pending','preparing') THEN NULL ELSE delivery_operations.assigned_driver_id END,
				assigned_driver_name=CASE WHEN $3 IN ('pending','preparing') THEN '' ELSE delivery_operations.assigned_driver_name END,
				assigned_by=CASE WHEN $3 IN ('pending','preparing') THEN '' ELSE delivery_operations.assigned_by END,
				assigned_at=CASE WHEN $3 IN ('pending','preparing') THEN NULL ELSE delivery_operations.assigned_at END,
				accepted_at=CASE WHEN $3 IN ('pending','preparing') THEN NULL ELSE delivery_operations.accepted_at END,
				route_started_at=CASE WHEN $3 IN ('pending','preparing') THEN NULL ELSE delivery_operations.route_started_at END,
				route_position=CASE WHEN $3 IN ('pending','preparing') THEN 0 ELSE delivery_operations.route_position END,
				issue_note=CASE WHEN $3 <> 'issue' THEN '' ELSE delivery_operations.issue_note END,
				updated_at=now()
		`, orderID, storeID, status); err != nil {
			writeError(w, err)
			return
		}
		if status == "ready_for_delivery" {
			actor, _ := r.Context().Value(adminUserContextKey{}).(string)
			automaticallyAssigned, err = assignSingleActiveDeliveryDriver(r.Context(), tx, orderID, storeID, actor)
			if err != nil {
				writeError(w, err)
				return
			}
		}
	}
	incidentID := ""
	if status == "issue" {
		incidentID, err = openDeliveryIncidentTx(r.Context(), tx, storeID, orderID, "", currentStatus, "other", "Marcado con problema por la administración")
		if err != nil {
			writeError(w, err)
			return
		}
		if _, err := tx.Exec(r.Context(), `
			UPDATE delivery_operations SET status='issue',incident_id=$2::uuid,issue_note=CASE WHEN trim(issue_note)='' THEN 'Marcado con problema por la administración' ELSE issue_note END,updated_at=now()
			WHERE sale_id=$1::uuid
		`, orderID, incidentID); err != nil {
			writeError(w, err)
			return
		}
	}
	if err := recordOrderStatusTx(r.Context(), tx, storeID, customerID, orderID, status, actorFromContext(r.Context()), map[string]any{"previousStatus": currentStatus, "automaticAssignment": automaticallyAssigned, "incidentId": incidentID}); err != nil {
		writeError(w, err)
		return
	}
	if incidentID != "" {
		if err := insertOutboxTx(r.Context(), tx, storeID, "delivery_incident", incidentID, "delivery.incident.reported", map[string]any{
			"incidentId": incidentID, "orderId": orderID, "storeId": storeID,
			"note": "Marcado con problema por la administración",
		}, "delivery.incident.reported:"+incidentID); err != nil {
			writeError(w, err)
			return
		}
	}
	if automaticallyAssigned {
		if err := insertOutboxTx(r.Context(), tx, storeID, "delivery", orderID, "delivery.assigned", map[string]any{"orderId": orderID, "storeId": storeID, "automatic": true, "accepted": true}, ""); err != nil {
			writeError(w, err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	s.syncActiveDeliveryGeoDestination(r.Context(), orderID)
	order, err := s.deliveryOrderByID(r.Context(), orderID, deliveryAudienceAdmin)
	if err != nil {
		writeError(w, err)
		return
	}
	s.invalidateTenantCache(r.Context())
	writeJSON(w, http.StatusOK, order)
}
