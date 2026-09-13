package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5"
)

const (
	defaultPageSize = 50
	maxPageSize     = 200
)

type businessActor struct {
	ID   string
	Role string
}

type returnedSaleItem struct {
	ProductID string  `json:"product_id"`
	Quantity  float64 `json:"quantity"`
}

func actorFromContext(ctx context.Context) businessActor {
	if user, ok := ctx.Value(staffUserContextKey{}).(StaffUser); ok {
		return businessActor{ID: user.ID, Role: normalizeStaffRole(user.Role)}
	}
	if username, ok := ctx.Value(adminUserContextKey{}).(string); ok {
		return businessActor{ID: strings.TrimSpace(username), Role: "administrator"}
	}
	if customerID, ok := ctx.Value(customerIDContextKey{}).(string); ok {
		return businessActor{ID: strings.TrimSpace(customerID), Role: "customer"}
	}
	return businessActor{Role: "system"}
}

func pageSizeFromRequest(r *http.Request) int {
	value, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("limit")))
	if value <= 0 {
		return defaultPageSize
	}
	if value > maxPageSize {
		return maxPageSize
	}
	return value
}

func pageOffsetFromRequest(r *http.Request) int {
	value, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("offset")))
	if value < 0 {
		return 0
	}
	return value
}

func validateOfflinePaymentMethod(value string) (string, error) {
	method := normalizePaymentMethodValue(value)
	switch method {
	case "cash", "bank_transfer", "card", "store_credit":
		return method, nil
	default:
		return "", badRequest("Selecciona un método de pago manual válido")
	}
}

func (s *Server) auditBusiness(ctx context.Context, action, entityType, entityID string, details map[string]any) {
	if s.db == nil || strings.TrimSpace(action) == "" || strings.TrimSpace(entityType) == "" {
		return
	}
	actor := actorFromContext(ctx)
	storeID := ""
	if details != nil {
		storeID = strings.TrimSpace(fmt.Sprint(details["store_id"]))
		if storeID == "<nil>" {
			storeID = ""
		}
	}
	encoded, err := marshalJSONDatabaseValue(details)
	if err != nil {
		encoded = `{}`
	}
	_, _ = s.db.Exec(ctx, `
		INSERT INTO business_audit_logs (
			store_id, actor_id, actor_role, action, entity_type, entity_id, request_id, details
		) VALUES (NULLIF($1,'')::uuid,$2,$3,$4,$5,$6,$7,$8::jsonb)
	`, storeID, actor.ID, actor.Role, action, entityType, entityID, middleware.GetReqID(ctx), encoded)
}

func insertAuditTx(ctx context.Context, tx pgx.Tx, storeID string, actor businessActor, action, entityType, entityID string, details map[string]any) error {
	encoded, err := marshalJSONDatabaseValue(details)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO business_audit_logs (
			store_id, actor_id, actor_role, action, entity_type, entity_id, request_id, details
		) VALUES (NULLIF($1,'')::uuid,$2,$3,$4,$5,$6,$7,$8::jsonb)
	`, storeID, actor.ID, actor.Role, action, entityType, entityID, middleware.GetReqID(ctx), encoded)
	return err
}

func insertOutboxTx(ctx context.Context, tx pgx.Tx, storeID, aggregateType, aggregateID, eventType string, payload any, deduplicationKey string) error {
	encoded, err := marshalJSONDatabaseValue(payload)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO outbox_events (
			store_id, aggregate_type, aggregate_id, event_type, payload, deduplication_key
		) VALUES (NULLIF($1,'')::uuid,$2,$3,$4,$5::jsonb,$6)
		ON CONFLICT (deduplication_key) WHERE deduplication_key <> '' DO NOTHING
	`, storeID, aggregateType, aggregateID, eventType, encoded, deduplicationKey)
	return err
}

func insertNotificationChannelTx(ctx context.Context, tx pgx.Tx, storeID, recipientType, recipientID, channel, eventType, title, message string, data any) error {
	encoded, err := marshalJSONDatabaseValue(data)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO business_notifications (
			store_id, recipient_type, recipient_id, channel, event_type, title, message, data
		) VALUES (NULLIF($1,'')::uuid,$2,$3,$4,$5,$6,$7,$8::jsonb)
	`, storeID, recipientType, recipientID, channel, eventType, title, message, encoded)
	return err
}

func insertNotificationTx(ctx context.Context, tx pgx.Tx, storeID, recipientType, recipientID, eventType, title, message string, data any) error {
	return insertNotificationChannelTx(ctx, tx, storeID, recipientType, recipientID, "in_app", eventType, title, message, data)
}

func recordInventoryAdjustmentsTx(ctx context.Context, tx pgx.Tx, storeID, movementType, reason, referenceType, referenceID string, actor businessActor, adjustments []inventoryAdjustment, direction float64) error {
	for _, adjustment := range adjustments {
		quantity := roundDecimal(adjustment.Quantity*direction, defaultWeightPrecision)
		if math.Abs(quantity) < 0.000001 {
			continue
		}
		var stockAfter float64
		if err := tx.QueryRow(ctx, `SELECT stock::double precision FROM products WHERE id=$1::uuid AND store_id=$2::uuid`, adjustment.ProductID, storeID).Scan(&stockAfter); err != nil {
			return err
		}
		stockBefore := stockAfter - quantity
		_, err := tx.Exec(ctx, `
			INSERT INTO inventory_movements (
				store_id, product_id, movement_type, quantity_delta, stock_before, stock_after,
				reason, reference_type, reference_id, actor_id, actor_role
			) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,NULLIF($9,'')::uuid,$10,$11)
		`, storeID, adjustment.ProductID, movementType, quantity, stockBefore, stockAfter, reason, referenceType, referenceID, actor.ID, actor.Role)
		if err != nil {
			return err
		}
	}
	return nil
}

func restoreInventoryTx(ctx context.Context, tx pgx.Tx, storeID, movementType, reason, referenceType, referenceID string, actor businessActor, items []returnedSaleItem) error {
	for _, item := range items {
		if strings.TrimSpace(item.ProductID) == "" || item.Quantity <= 0 {
			return badRequest("Los productos devueltos no tienen un formato válido")
		}
		var before, after float64
		err := tx.QueryRow(ctx, `
			UPDATE products
			SET stock = stock + $3
			WHERE id=$1::uuid AND store_id=$2::uuid
			RETURNING (stock - $3)::double precision, stock::double precision
		`, item.ProductID, storeID, item.Quantity).Scan(&before, &after)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO inventory_movements (
				store_id, product_id, movement_type, quantity_delta, stock_before, stock_after,
				reason, reference_type, reference_id, actor_id, actor_role
			) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,NULLIF($9,'')::uuid,$10,$11)
		`, storeID, item.ProductID, movementType, item.Quantity, before, after, reason, referenceType, referenceID, actor.ID, actor.Role)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) listInventoryMovements(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	if storeID == "" {
		writeError(w, badRequest("Debes seleccionar el negocio"))
		return
	}
	productID := strings.TrimSpace(r.URL.Query().Get("product_id"))
	limit := pageSizeFromRequest(r)
	offset := pageOffsetFromRequest(r)
	rows, err := s.db.Query(r.Context(), `
		SELECT movement.id::text, movement.store_id::text, movement.product_id::text,
		       product.name, movement.movement_type, movement.quantity_delta,
		       movement.stock_before, movement.stock_after, movement.reason,
		       movement.reference_type, COALESCE(movement.reference_id::text,''),
		       movement.actor_id, movement.actor_role, movement.created_at
		FROM inventory_movements movement
		JOIN products product ON product.id=movement.product_id
		WHERE movement.store_id=$1::uuid
		  AND ($2='' OR movement.product_id=NULLIF($2,'')::uuid)
		ORDER BY movement.created_at DESC, movement.id DESC
		LIMIT $3 OFFSET $4
	`, storeID, productID, limit, offset)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, itemStoreID, itemProductID, productName, movementType, reason, referenceType, referenceID, actorID, actorRole string
		var quantity, before, after float64
		var createdAt time.Time
		if err := rows.Scan(&id, &itemStoreID, &itemProductID, &productName, &movementType, &quantity, &before, &after, &reason, &referenceType, &referenceID, &actorID, &actorRole, &createdAt); err != nil {
			writeError(w, err)
			return
		}
		items = append(items, map[string]any{"id": id, "store_id": itemStoreID, "product_id": itemProductID, "product_name": productName, "movement_type": movementType, "quantity_delta": quantity, "stock_before": before, "stock_after": after, "reason": reason, "reference_type": referenceType, "reference_id": referenceID, "actor_id": actorID, "actor_role": actorRole, "created_at": createdAt})
	}
	if err := rows.Err(); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "limit": limit, "offset": offset, "has_more": len(items) == limit})
}

func (s *Server) listSalesPaginated(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	if storeID == "" {
		writeError(w, badRequest("Debes seleccionar el negocio"))
		return
	}
	limit := pageSizeFromRequest(r)
	offset := pageOffsetFromRequest(r)
	status := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("status")))
	rows, err := s.db.Query(r.Context(), `
		SELECT sale.id::text, sale.store_id::text, sale.items, sale.total, sale.method, sale.customer, sale.date,
		       COALESCE(sale.customer_id::text,''), sale.delivery_address, sale.financial_status, sale.status, sale.order_type,
		       sale.reference_number, sale.reversed_at, sale.reversal_reason, sale.reversed_by,
		       COALESCE(operation.status,''), operation.cancelled_at, COALESCE(operation.cancellation_reason,''),
		       COALESCE(incident.id::text,''), COALESCE(incident.status,''), COALESCE(incident.issue_type,''),
		       COALESCE(incident.note,''), COALESCE(incident.resolution,''), COALESCE(incident.inventory_disposition,''),
		       COALESCE(incident.resolution_note,''), incident.reported_at, incident.resolved_at,
		       COALESCE(return_summary.returned_amount,0)
		FROM sales sale
		LEFT JOIN delivery_operations operation ON operation.sale_id=sale.id
		LEFT JOIN LATERAL (
			SELECT incident_record.*
			FROM delivery_incidents incident_record
			WHERE incident_record.sale_id=sale.id
			ORDER BY (incident_record.status='open') DESC, incident_record.reported_at DESC
			LIMIT 1
		) incident ON true
		LEFT JOIN LATERAL (
			SELECT COALESCE(SUM(sale_return.amount),0) AS returned_amount
			FROM sale_returns sale_return
			WHERE sale_return.sale_id=sale.id
		) return_summary ON true
		WHERE sale.store_id=$1::uuid AND ($2='' OR sale.financial_status=$2)
		ORDER BY sale.date DESC, sale.id DESC
		LIMIT $3 OFFSET $4
	`, storeID, status, limit, offset)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, itemStoreID, method, customer, customerID, address, financialStatus, orderStatus, orderType, reference, reason, reversedBy string
		var deliveryStatus, cancellationReason, incidentID, incidentStatus, incidentType, incidentNote, incidentResolution, incidentDisposition, incidentResolutionNote string
		var rawItems json.RawMessage
		var total, returnedAmount float64
		var date time.Time
		var reversedAt, cancelledAt, incidentReportedAt, incidentResolvedAt sql.NullTime
		if err := rows.Scan(
			&id, &itemStoreID, &rawItems, &total, &method, &customer, &date,
			&customerID, &address, &financialStatus, &orderStatus, &orderType,
			&reference, &reversedAt, &reason, &reversedBy,
			&deliveryStatus, &cancelledAt, &cancellationReason,
			&incidentID, &incidentStatus, &incidentType, &incidentNote, &incidentResolution, &incidentDisposition,
			&incidentResolutionNote, &incidentReportedAt, &incidentResolvedAt, &returnedAmount,
		); err != nil {
			writeError(w, err)
			return
		}
		orderNumber := saleOrderNumber(Sale{ID: id})
		item := map[string]any{
			"id": id, "store_id": itemStoreID, "items": rawItems, "total": total, "method": method,
			"customer": customer, "customer_id": customerID, "delivery_address": address,
			"status": financialStatus, "financial_status": financialStatus, "order_status": normalizeOrderStatus(orderStatus),
			"delivery_status": firstNonEmpty(deliveryStatus, normalizeOrderStatus(orderStatus)),
			"order_type":      orderType, "reference_number": reference, "order_number": orderNumber,
			"date": date, "reversal_reason": reason, "reversed_by": reversedBy,
			"cancellation_reason": cancellationReason,
			"returned_amount":     roundCurrency(returnedAmount), "net_total": roundCurrency(math.Max(0, total-returnedAmount)),
		}
		if reversedAt.Valid {
			item["reversed_at"] = reversedAt.Time
		}
		if cancelledAt.Valid {
			item["cancelled_at"] = cancelledAt.Time
		}
		if incidentID != "" {
			incident := map[string]any{
				"id": incidentID, "status": incidentStatus, "issue_type": incidentType, "issueType": incidentType,
				"note": incidentNote, "resolution": incidentResolution,
				"inventory_disposition": incidentDisposition, "inventoryDisposition": incidentDisposition,
				"resolution_note": incidentResolutionNote, "resolutionNote": incidentResolutionNote,
			}
			if incidentReportedAt.Valid {
				incident["reported_at"] = incidentReportedAt.Time
				incident["reportedAt"] = incidentReportedAt.Time
			}
			if incidentResolvedAt.Valid {
				incident["resolved_at"] = incidentResolvedAt.Time
				incident["resolvedAt"] = incidentResolvedAt.Time
			}
			item["delivery_incident"] = incident
			item["deliveryIncident"] = incident
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "limit": limit, "offset": offset, "has_more": len(items) == limit})
}

func saleItemsForReturn(raw json.RawMessage) (map[string]returnedSaleItem, map[string]float64, error) {
	var items []map[string]any
	if err := json.Unmarshal(raw, &items); err != nil {
		return nil, nil, err
	}
	quantities := make(map[string]returnedSaleItem, len(items))
	lineAmounts := make(map[string]float64, len(items))
	for _, item := range items {
		productID := itemText(item, "id", "product_id", "productId")
		quantity := itemNumber(item, "quantity", "requested_weight", "requestedWeight", "estimated_weight", "estimatedWeight")
		if productID == "" || quantity <= 0 {
			continue
		}
		current := quantities[productID]
		current.ProductID = productID
		current.Quantity += quantity
		quantities[productID] = current
		lineTotal := itemNumber(item, "line_total", "lineTotal")
		if lineTotal <= 0 {
			lineTotal = itemNumber(item, "price", "unit_price", "unitPrice") * quantity
		}
		lineAmounts[productID] += lineTotal
	}
	return quantities, lineAmounts, nil
}

func readPreviouslyReturnedItems(ctx context.Context, tx pgx.Tx, saleID string) (map[string]float64, float64, error) {
	rows, err := tx.Query(ctx, `SELECT items, amount FROM sale_returns WHERE sale_id=$1::uuid`, saleID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	returned := map[string]float64{}
	amount := 0.0
	for rows.Next() {
		var raw json.RawMessage
		var returnAmount float64
		if err := rows.Scan(&raw, &returnAmount); err != nil {
			return nil, 0, err
		}
		amount += returnAmount
		var items []returnedSaleItem
		if err := json.Unmarshal(raw, &items); err != nil {
			return nil, 0, err
		}
		for _, item := range items {
			returned[item.ProductID] += item.Quantity
		}
	}
	return returned, amount, rows.Err()
}

func (s *Server) voidSale(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Reason               string `json:"reason"`
		InventoryDisposition string `json:"inventory_disposition"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input.Reason = strings.TrimSpace(input.Reason)
	if len(input.Reason) < 5 {
		writeError(w, badRequest("Indica un motivo de anulación válido"))
		return
	}
	if strings.TrimSpace(input.InventoryDisposition) != "" && !validInventoryDisposition(input.InventoryDisposition) {
		writeError(w, badRequest("El tratamiento seleccionado para el inventario no es válido"))
		return
	}
	disposition := normalizeInventoryDisposition(input.InventoryDisposition)
	restocked := inventoryDispositionRestocks(disposition)

	saleID := chi.URLParam(r, "id")
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())

	var storeID, method, customerID, orderStatus, orderType, financialStatus string
	var items json.RawMessage
	var total float64
	err = tx.QueryRow(r.Context(), `
		SELECT store_id::text, items, total, method, COALESCE(customer_id::text,''), status, order_type, financial_status
		FROM sales WHERE id=$1::uuid FOR UPDATE
	`, saleID).Scan(&storeID, &items, &total, &method, &customerID, &orderStatus, &orderType, &financialStatus)
	if err != nil {
		writeError(w, err)
		return
	}
	if financialStatus == "voided" || financialStatus == "returned" {
		writeError(w, apiError{status: http.StatusConflict, msg: "La venta ya fue anulada o devuelta"})
		return
	}
	if financialStatus == "partially_returned" {
		writeError(w, apiError{status: http.StatusConflict, msg: "La venta tiene devoluciones parciales. Registra la devolución de las unidades restantes en lugar de anularla completa"})
		return
	}
	if normalizeOrderStatus(orderStatus) == "delivered" && orderType == "customer" && strings.TrimSpace(input.InventoryDisposition) == "" {
		writeError(w, badRequest("Selecciona qué ocurrió con la mercancía antes de anular el pedido"))
		return
	}
	if normalizeOrderStatus(orderStatus) == "issue" && strings.TrimSpace(input.InventoryDisposition) == "" {
		writeError(w, badRequest("Selecciona si la mercancía se repone, quedó dañada, se perdió o pasa a cuarentena"))
		return
	}

	sold, _, err := saleItemsForReturn(items)
	if err != nil {
		writeError(w, err)
		return
	}
	returnItems := make([]returnedSaleItem, 0, len(sold))
	for _, item := range sold {
		returnItems = append(returnItems, item)
	}
	actor := actorFromContext(r.Context())

	var incidentID string
	err = tx.QueryRow(r.Context(), `
		SELECT id::text FROM delivery_incidents
		WHERE sale_id=$1::uuid AND status='open'
		ORDER BY reported_at DESC LIMIT 1 FOR UPDATE
	`, saleID).Scan(&incidentID)
	if err != nil && !errorsIsNoRows(err) {
		writeError(w, err)
		return
	}
	if errorsIsNoRows(err) {
		incidentID = ""
	}

	if restocked {
		if err := restoreInventoryTx(r.Context(), tx, storeID, "void", input.Reason, "sale", saleID, actor, returnItems); err != nil {
			writeError(w, err)
			return
		}
		if err := restoreTrackedBatchesTx(r.Context(), tx, saleID, returnItems); err != nil {
			writeError(w, err)
			return
		}
	}
	if err := recordInventoryDispositionsTx(r.Context(), tx, storeID, saleID, incidentID, disposition, input.Reason, actor, items, returnItems, restocked); err != nil {
		writeError(w, err)
		return
	}

	encodedItems, err := marshalJSONDatabaseValue(returnItems)
	if err != nil {
		writeError(w, err)
		return
	}
	_, err = tx.Exec(r.Context(), `
		INSERT INTO sale_returns (
			sale_id,store_id,items,amount,reason,resolution,payment_method,created_by,created_by_role,
			inventory_disposition,inventory_restocked
		)
		VALUES ($1::uuid,$2::uuid,$3::jsonb,$4,$5,'refund',$6,$7,$8,$9,$10)
	`, saleID, storeID, encodedItems, total, input.Reason, method, actor.ID, actor.Role, disposition, restocked)
	if err != nil {
		writeError(w, err)
		return
	}

	newOrderStatus := orderStatus
	if orderType == "customer" {
		newOrderStatus = "cancelled"
	}
	_, err = tx.Exec(r.Context(), `
		UPDATE sales
		SET status=$2,financial_status='voided',reversed_at=now(),reversal_reason=$3,reversed_by=$4,updated_at=now()
		WHERE id=$1::uuid
	`, saleID, newOrderStatus, input.Reason, actor.ID)
	if err != nil {
		writeError(w, err)
		return
	}

	if orderType == "customer" {
		if _, err := tx.Exec(r.Context(), `
			UPDATE delivery_operations
			SET status='cancelled',cancelled_at=now(),cancellation_reason=$2,cancelled_by=$3,
				incident_id=COALESCE(NULLIF($4,'')::uuid,incident_id),updated_at=now()
			WHERE sale_id=$1::uuid
		`, saleID, input.Reason, actor.ID, incidentID); err != nil {
			writeError(w, err)
			return
		}
		if incidentID != "" {
			if _, err := tx.Exec(r.Context(), `
				UPDATE delivery_incidents
				SET status='resolved',resolution='cancelled',inventory_disposition=$2,resolution_note=$3,
					resolved_at=now(),resolved_by=$4,updated_at=now()
				WHERE id=$1::uuid
			`, incidentID, disposition, input.Reason, actor.ID); err != nil {
				writeError(w, err)
				return
			}
		}
		if err := recordOrderStatusTx(r.Context(), tx, storeID, customerID, saleID, "cancelled", actor, map[string]any{
			"previousStatus": orderStatus, "reason": input.Reason, "inventoryDisposition": disposition,
			"inventoryRestocked": restocked, "incidentId": incidentID,
		}); err != nil {
			writeError(w, err)
			return
		}
	}

	if method == "store_credit" {
		_, err = tx.Exec(r.Context(), `
			UPDATE store_credits
			SET paid_amount=amount, status='paid', reversed_at=now(), updated_at=now()
			WHERE reference_type='sale' AND reference_id=$1::uuid AND type='charge'
		`, saleID)
		if err != nil {
			writeError(w, err)
			return
		}
	}
	if method == "cash" {
		if err := insertCashMovementForOpenSession(r.Context(), tx, storeID, "refund", total, method, "Anulación de venta", "sale", saleID, actor); err != nil {
			writeError(w, err)
			return
		}
	}
	cost := saleCostFromItems(items)
	if err := postSaleCancellationAccountingTx(r.Context(), tx, storeID, "sale_void", saleID, method, total, cost, restocked, actor); err != nil {
		writeError(w, err)
		return
	}
	if err := insertAuditTx(r.Context(), tx, storeID, actor, "sale.voided", "sale", saleID, map[string]any{
		"store_id": storeID, "reason": input.Reason, "total": total, "order_status": newOrderStatus,
		"inventory_disposition": disposition, "inventory_restocked": restocked, "incident_id": incidentID,
	}); err != nil {
		writeError(w, err)
		return
	}
	if err := insertOutboxTx(r.Context(), tx, storeID, "sale", saleID, "sale.voided", map[string]any{
		"sale_id": saleID, "store_id": storeID, "customer_id": customerID, "total": total,
		"order_status": newOrderStatus, "inventory_disposition": disposition,
	}, "sale.voided:"+saleID); err != nil {
		writeError(w, err)
		return
	}
	if orderType == "customer" {
		if err := insertOutboxTx(r.Context(), tx, storeID, "delivery", saleID, "delivery.cancelled", map[string]any{
			"orderId": saleID, "storeId": storeID, "reason": input.Reason, "incidentId": incidentID,
		}, "delivery.cancelled:"+saleID); err != nil {
			writeError(w, err)
			return
		}
	}
	if err := insertOutboxTx(r.Context(), tx, storeID, "inventory", saleID, "inventory.disposition.recorded", map[string]any{
		"saleId": saleID, "storeId": storeID, "disposition": disposition, "restocked": restocked,
	}, "inventory.disposition.recorded:"+saleID); err != nil {
		writeError(w, err)
		return
	}
	if incidentID != "" {
		if err := insertOutboxTx(r.Context(), tx, storeID, "delivery_incident", incidentID, "delivery.incident.resolved", map[string]any{
			"incidentId": incidentID, "orderId": saleID, "storeId": storeID, "resolution": "cancelled", "inventoryDisposition": disposition,
		}, "delivery.incident.resolved:"+incidentID+":cancelled"); err != nil {
			writeError(w, err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}

	if orderType == "customer" {
		s.syncActiveDeliveryGeoDestination(r.Context(), saleID)
	}
	s.invalidateTenantCache(r.Context())
	restoredItems := []returnedSaleItem{}
	if restocked {
		restoredItems = returnItems
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id": saleID, "status": "voided", "financial_status": "voided", "order_status": newOrderStatus,
		"restored_items":        restoredItems,
		"inventory_disposition": disposition, "inventory_restocked": restocked, "incident_id": incidentID,
	})
}

func (s *Server) returnSaleItems(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Items                []returnedSaleItem `json:"items"`
		Reason               string             `json:"reason"`
		Resolution           string             `json:"resolution"`
		InventoryDisposition string             `json:"inventory_disposition"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input.Reason = strings.TrimSpace(input.Reason)
	if len(input.Reason) < 5 || len(input.Items) == 0 {
		writeError(w, badRequest("Indica los productos y el motivo de la devolución"))
		return
	}
	if input.Resolution == "" {
		input.Resolution = "refund"
	}
	if input.Resolution != "refund" && input.Resolution != "store_credit" && input.Resolution != "exchange" {
		writeError(w, badRequest("La resolución seleccionada no es válida"))
		return
	}
	if strings.TrimSpace(input.InventoryDisposition) != "" && !validInventoryDisposition(input.InventoryDisposition) {
		writeError(w, badRequest("El tratamiento seleccionado para el inventario no es válido"))
		return
	}
	disposition := normalizeInventoryDisposition(input.InventoryDisposition)
	restocked := inventoryDispositionRestocks(disposition)

	saleID := chi.URLParam(r, "id")
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var storeID, method, customer, customerID, financialStatus string
	var rawItems json.RawMessage
	var total float64
	err = tx.QueryRow(r.Context(), `
		SELECT store_id::text, items, total, method, customer, COALESCE(customer_id::text,''), financial_status
		FROM sales WHERE id=$1::uuid FOR UPDATE
	`, saleID).Scan(&storeID, &rawItems, &total, &method, &customer, &customerID, &financialStatus)
	if err != nil {
		writeError(w, err)
		return
	}
	if financialStatus == "voided" || financialStatus == "returned" {
		writeError(w, apiError{status: http.StatusConflict, msg: "La venta no admite nuevas devoluciones"})
		return
	}
	sold, lineAmounts, err := saleItemsForReturn(rawItems)
	if err != nil {
		writeError(w, err)
		return
	}
	previouslyReturned, returnedAmount, err := readPreviouslyReturnedItems(r.Context(), tx, saleID)
	if err != nil {
		writeError(w, err)
		return
	}
	requestedByProduct := map[string]float64{}
	amount := 0.0
	cleanItems := make([]returnedSaleItem, 0, len(input.Items))
	for _, item := range input.Items {
		item.ProductID = strings.TrimSpace(item.ProductID)
		item.Quantity = roundDecimal(item.Quantity, defaultWeightPrecision)
		soldItem, exists := sold[item.ProductID]
		if !exists || item.Quantity <= 0 {
			writeError(w, badRequest("Uno de los productos no pertenece a la venta"))
			return
		}
		requestedByProduct[item.ProductID] += item.Quantity
		if requestedByProduct[item.ProductID]+previouslyReturned[item.ProductID]-soldItem.Quantity > 0.000001 {
			writeError(w, badRequest("La cantidad devuelta supera la cantidad vendida"))
			return
		}
		amount += lineAmounts[item.ProductID] * (item.Quantity / soldItem.Quantity)
		cleanItems = append(cleanItems, item)
	}
	amount = roundPayableAmount(amount)
	if amount <= 0 || returnedAmount+amount-total > 0.01 {
		writeError(w, badRequest("El monto de devolución no es válido"))
		return
	}
	actor := actorFromContext(r.Context())
	if restocked {
		if err := restoreInventoryTx(r.Context(), tx, storeID, "return", input.Reason, "sale", saleID, actor, cleanItems); err != nil {
			writeError(w, err)
			return
		}
		if err := restoreTrackedBatchesTx(r.Context(), tx, saleID, cleanItems); err != nil {
			writeError(w, err)
			return
		}
	}
	if err := recordInventoryDispositionsTx(r.Context(), tx, storeID, saleID, "", disposition, input.Reason, actor, rawItems, cleanItems, restocked); err != nil {
		writeError(w, err)
		return
	}
	encodedItems, err := marshalJSONDatabaseValue(cleanItems)
	if err != nil {
		writeError(w, err)
		return
	}
	var returnID string
	err = tx.QueryRow(r.Context(), `
		INSERT INTO sale_returns (
			sale_id,store_id,items,amount,reason,resolution,payment_method,created_by,created_by_role,
			inventory_disposition,inventory_restocked
		)
		VALUES ($1::uuid,$2::uuid,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11)
		RETURNING id::text
	`, saleID, storeID, encodedItems, amount, input.Reason, input.Resolution, method, actor.ID, actor.Role, disposition, restocked).Scan(&returnID)
	if err != nil {
		writeError(w, err)
		return
	}
	newReturnedAmount := returnedAmount + amount
	newFinancialStatus := "partially_returned"
	if math.Abs(newReturnedAmount-total) <= 0.01 {
		newFinancialStatus = "returned"
	}
	_, err = tx.Exec(r.Context(), `
		UPDATE sales
		SET financial_status=$2,
			reversed_at=CASE WHEN $2='returned' THEN now() ELSE reversed_at END,
			reversal_reason=CASE WHEN $2='returned' THEN $3 ELSE reversal_reason END,
			reversed_by=CASE WHEN $2='returned' THEN $4 ELSE reversed_by END,
			updated_at=now()
		WHERE id=$1::uuid
	`, saleID, newFinancialStatus, input.Reason, actor.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	if method == "store_credit" || input.Resolution == "store_credit" {
		_, err = tx.Exec(r.Context(), `
			INSERT INTO store_credits (store_id,customer,customer_id,amount,note,status,type,date,reference_type,reference_id,created_by)
			VALUES ($1::uuid,$2,NULLIF($3,'')::uuid,$4,$5,'paid','payment',now(),'sale_return',$6::uuid,$7)
		`, storeID, customer, customerID, amount, "Crédito por devolución", returnID, actor.ID)
		if err != nil {
			writeError(w, err)
			return
		}
	}
	if input.Resolution == "refund" && method == "cash" {
		if err := insertCashMovementForOpenSession(r.Context(), tx, storeID, "refund", amount, method, "Devolución de venta", "sale_return", returnID, actor); err != nil {
			writeError(w, err)
			return
		}
	}
	cost := returnedItemsCost(rawItems, cleanItems)
	if err := postSaleCancellationAccountingTx(r.Context(), tx, storeID, "sale_return", returnID, method, amount, cost, restocked, actor); err != nil {
		writeError(w, err)
		return
	}
	if err := insertAuditTx(r.Context(), tx, storeID, actor, "sale.returned", "sale", saleID, map[string]any{
		"store_id": storeID, "return_id": returnID, "amount": amount, "reason": input.Reason,
		"resolution": input.Resolution, "inventory_disposition": disposition, "inventory_restocked": restocked,
	}); err != nil {
		writeError(w, err)
		return
	}
	if err := insertOutboxTx(r.Context(), tx, storeID, "sale", saleID, "sale.returned", map[string]any{
		"sale_id": saleID, "return_id": returnID, "store_id": storeID, "customer_id": customerID,
		"amount": amount, "financial_status": newFinancialStatus, "inventory_disposition": disposition,
	}, "sale.returned:"+returnID); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	s.invalidateTenantCache(r.Context())
	writeJSON(w, http.StatusCreated, map[string]any{
		"id": returnID, "sale_id": saleID, "amount": amount, "items": cleanItems, "resolution": input.Resolution,
		"financial_status": newFinancialStatus, "inventory_disposition": disposition, "inventory_restocked": restocked,
	})
}

func insertCashMovementForOpenSession(ctx context.Context, tx pgx.Tx, storeID, movementType string, amount float64, paymentMethod, note, referenceType, referenceID string, actor businessActor) error {
	if amount <= 0 {
		return nil
	}
	result, err := tx.Exec(ctx, `
		INSERT INTO cash_movements (session_id,store_id,movement_type,amount,payment_method,note,reference_type,reference_id,created_by,created_by_role)
		SELECT id,store_id,$2,$3,$4,$5,$6,NULLIF($7,'')::uuid,$8,$9
		FROM cash_sessions
		WHERE store_id=$1::uuid AND status='open'
		ORDER BY opened_at DESC LIMIT 1
	`, storeID, movementType, amount, paymentMethod, note, referenceType, referenceID, actor.ID, actor.Role)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return apiError{status: http.StatusConflict, msg: "Debes abrir la caja antes de registrar operaciones en efectivo"}
	}
	return nil
}

func (s *Server) currentCashSession(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	if storeID == "" {
		writeError(w, badRequest("Debes seleccionar el negocio"))
		return
	}
	item, err := s.cashSessionSummary(r.Context(), storeID, "")
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusOK, map[string]any{"session": nil})
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"session": item})
}

func (s *Server) listCashSessions(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	if storeID == "" {
		writeError(w, badRequest("Debes seleccionar el negocio"))
		return
	}
	limit := pageSizeFromRequest(r)
	offset := pageOffsetFromRequest(r)
	rows, err := s.db.Query(r.Context(), `
		SELECT id::text FROM cash_sessions WHERE store_id=$1::uuid ORDER BY opened_at DESC LIMIT $2 OFFSET $3
	`, storeID, limit, offset)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			writeError(w, err)
			return
		}
		item, err := s.cashSessionSummary(r.Context(), storeID, id)
		if err != nil {
			writeError(w, err)
			return
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "limit": limit, "offset": offset, "has_more": len(items) == limit})
}

func (s *Server) cashSessionSummary(ctx context.Context, storeID, sessionID string) (map[string]any, error) {
	var id, openedBy, openedRole, closedBy, closedRole, status, openingNote, closingNote string
	var openingAmount float64
	var closingAmount, expectedAmount, differenceAmount sql.NullFloat64
	var openedAt time.Time
	var closedAt sql.NullTime
	err := s.db.QueryRow(ctx, `
		SELECT id::text,opened_by,opened_by_role,opening_amount,opened_at,closed_by,closed_by_role,
		       closing_amount,expected_amount,difference_amount,status,opening_note,closing_note,closed_at
		FROM cash_sessions
		WHERE store_id=$1::uuid AND ($2='' OR id=NULLIF($2,'')::uuid) AND ($2<>'' OR status='open')
		ORDER BY opened_at DESC LIMIT 1
	`, storeID, sessionID).Scan(&id, &openedBy, &openedRole, &openingAmount, &openedAt, &closedBy, &closedRole, &closingAmount, &expectedAmount, &differenceAmount, &status, &openingNote, &closingNote, &closedAt)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.Query(ctx, `
		SELECT movement_type, COALESCE(SUM(amount),0) FROM cash_movements WHERE session_id=$1::uuid GROUP BY movement_type
	`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	totals := map[string]float64{}
	for rows.Next() {
		var movementType string
		var total float64
		if err := rows.Scan(&movementType, &total); err != nil {
			return nil, err
		}
		totals[movementType] = total
	}
	item := map[string]any{"id": id, "store_id": storeID, "opened_by": openedBy, "opened_by_role": openedRole, "opening_amount": openingAmount, "opened_at": openedAt, "closed_by": closedBy, "closed_by_role": closedRole, "status": status, "opening_note": openingNote, "closing_note": closingNote, "movements": totals}
	if closingAmount.Valid {
		item["closing_amount"] = closingAmount.Float64
	}
	if expectedAmount.Valid {
		item["expected_amount"] = expectedAmount.Float64
	}
	if differenceAmount.Valid {
		item["difference_amount"] = differenceAmount.Float64
	}
	if closedAt.Valid {
		item["closed_at"] = closedAt.Time
	}
	return item, rows.Err()
}

func (s *Server) openCashSession(w http.ResponseWriter, r *http.Request) {
	var input struct {
		StoreID       string  `json:"store_id"`
		OpeningAmount float64 `json:"opening_amount"`
		Note          string  `json:"note"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input.StoreID = strings.TrimSpace(input.StoreID)
	if input.StoreID == "" || input.OpeningAmount < 0 {
		writeError(w, badRequest("Los datos de apertura no son válidos"))
		return
	}
	actor := actorFromContext(r.Context())
	var id string
	err := s.db.QueryRow(r.Context(), `
		INSERT INTO cash_sessions (store_id,opened_by,opened_by_role,opening_amount,opening_note)
		VALUES ($1::uuid,$2,$3,$4,$5) RETURNING id::text
	`, input.StoreID, actor.ID, actor.Role, input.OpeningAmount, strings.TrimSpace(input.Note)).Scan(&id)
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, apiError{status: http.StatusConflict, msg: "Ya existe una caja abierta para este negocio"})
			return
		}
		writeError(w, err)
		return
	}
	s.auditBusiness(r.Context(), "cash.session.opened", "cash_session", id, map[string]any{"store_id": input.StoreID, "opening_amount": input.OpeningAmount})
	item, err := s.cashSessionSummary(r.Context(), input.StoreID, id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func isUniqueViolation(err error) bool {
	var pgErr interface{ SQLState() string }
	return errors.As(err, &pgErr) && pgErr.SQLState() == "23505"
}

func (s *Server) createCashMovement(w http.ResponseWriter, r *http.Request) {
	var input struct {
		StoreID string  `json:"store_id"`
		Type    string  `json:"type"`
		Amount  float64 `json:"amount"`
		Note    string  `json:"note"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input.StoreID = strings.TrimSpace(input.StoreID)
	input.Type = strings.ToLower(strings.TrimSpace(input.Type))
	input.Amount = roundCurrency(input.Amount)
	if input.StoreID == "" || input.Amount <= 0 {
		writeError(w, badRequest("El movimiento de caja no es válido"))
		return
	}
	if input.Type != "deposit" && input.Type != "withdrawal" && input.Type != "expense" && input.Type != "adjustment" {
		writeError(w, badRequest("El tipo de movimiento no es válido"))
		return
	}
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	actor := actorFromContext(r.Context())
	var id string
	err = tx.QueryRow(r.Context(), `
		INSERT INTO cash_movements (session_id,store_id,movement_type,amount,payment_method,note,created_by,created_by_role)
		SELECT id,store_id,$2,$3,'cash',$4,$5,$6 FROM cash_sessions
		WHERE store_id=$1::uuid AND status='open' ORDER BY opened_at DESC LIMIT 1
		RETURNING id::text
	`, input.StoreID, input.Type, input.Amount, strings.TrimSpace(input.Note), actor.ID, actor.Role).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, apiError{status: http.StatusConflict, msg: "Debes abrir la caja antes de registrar movimientos"})
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	if err := postCashMovementAccountingTx(r.Context(), tx, input.StoreID, id, input.Type, input.Amount, actor); err != nil {
		writeError(w, err)
		return
	}
	details := map[string]any{"store_id": input.StoreID, "type": input.Type, "amount": input.Amount, "note": strings.TrimSpace(input.Note)}
	if err := insertAuditTx(r.Context(), tx, input.StoreID, actor, "cash.movement.created", "cash_movement", id, details); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "store_id": input.StoreID, "type": input.Type, "amount": input.Amount, "note": strings.TrimSpace(input.Note)})
}

func (s *Server) closeCashSession(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ClosingAmount float64 `json:"closing_amount"`
		Note          string  `json:"note"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if input.ClosingAmount < 0 {
		writeError(w, badRequest("El monto contado no es válido"))
		return
	}
	sessionID := chi.URLParam(r, "id")
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var storeID string
	var openingAmount float64
	var status string
	err = tx.QueryRow(r.Context(), `SELECT store_id::text,opening_amount,status FROM cash_sessions WHERE id=$1::uuid FOR UPDATE`, sessionID).Scan(&storeID, &openingAmount, &status)
	if err != nil {
		writeError(w, err)
		return
	}
	if status != "open" {
		writeError(w, apiError{status: http.StatusConflict, msg: "La caja ya está cerrada"})
		return
	}
	var income, expense float64
	err = tx.QueryRow(r.Context(), `
		SELECT
		  COALESCE(SUM(CASE WHEN movement_type IN ('sale','deposit','credit_payment','adjustment') THEN amount ELSE 0 END),0),
		  COALESCE(SUM(CASE WHEN movement_type IN ('withdrawal','expense','refund') THEN amount ELSE 0 END),0)
		FROM cash_movements WHERE session_id=$1::uuid
	`, sessionID).Scan(&income, &expense)
	if err != nil {
		writeError(w, err)
		return
	}
	expected := roundCurrency(openingAmount + income - expense)
	difference := roundCurrency(input.ClosingAmount - expected)
	actor := actorFromContext(r.Context())
	_, err = tx.Exec(r.Context(), `
		UPDATE cash_sessions SET closed_by=$2,closed_by_role=$3,closing_amount=$4,expected_amount=$5,
		  difference_amount=$6,status='closed',closing_note=$7,closed_at=now(),updated_at=now()
		WHERE id=$1::uuid
	`, sessionID, actor.ID, actor.Role, input.ClosingAmount, expected, difference, strings.TrimSpace(input.Note))
	if err != nil {
		writeError(w, err)
		return
	}
	summary, err := marshalJSONDatabaseValue(map[string]any{"opening_amount": openingAmount, "income": income, "expense": expense, "expected_amount": expected, "closing_amount": input.ClosingAmount, "difference_amount": difference})
	if err != nil {
		writeError(w, err)
		return
	}
	_, err = tx.Exec(r.Context(), `
		INSERT INTO cash_history (store_id,opening,closing,summary)
		VALUES ($1::uuid,$2::jsonb,$3::jsonb,$4::jsonb)
	`, storeID, fmt.Sprintf(`{"amount":%.2f}`, openingAmount), fmt.Sprintf(`{"amount":%.2f}`, input.ClosingAmount), summary)
	if err != nil {
		writeError(w, err)
		return
	}
	if err := postCashDifferenceAccountingTx(r.Context(), tx, storeID, sessionID, difference, actor); err != nil {
		writeError(w, err)
		return
	}
	if err := insertAuditTx(r.Context(), tx, storeID, actor, "cash.session.closed", "cash_session", sessionID, map[string]any{"store_id": storeID, "expected_amount": expected, "closing_amount": input.ClosingAmount, "difference_amount": difference}); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	item, err := s.cashSessionSummary(r.Context(), storeID, sessionID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) recordCustomerStoreCreditPayment(w http.ResponseWriter, r *http.Request) {
	var input struct {
		StoreID  string  `json:"store_id"`
		Customer string  `json:"customer"`
		Amount   float64 `json:"amount"`
		Method   string  `json:"method"`
		Note     string  `json:"note"`
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
	method, err := validateOfflinePaymentMethod(firstNonEmpty(input.Method, "cash"))
	if err != nil || method == "store_credit" {
		writeError(w, badRequest("Selecciona efectivo, transferencia manual o terminal externo"))
		return
	}
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	type pendingCredit struct {
		ID         string
		CustomerID string
		Amount     float64
		Paid       float64
	}
	rows, err := tx.Query(r.Context(), `
		SELECT id::text,COALESCE(customer_id::text,''),amount,paid_amount
		FROM store_credits
		WHERE store_id=$1::uuid AND lower(customer)=lower($2)
		  AND type='charge' AND status NOT IN ('paid','reversed') AND amount-paid_amount > 0.009
		ORDER BY date,id
		FOR UPDATE
	`, input.StoreID, input.Customer)
	if err != nil {
		writeError(w, err)
		return
	}
	credits := []pendingCredit{}
	totalOutstanding := 0.0
	for rows.Next() {
		var credit pendingCredit
		if err := rows.Scan(&credit.ID, &credit.CustomerID, &credit.Amount, &credit.Paid); err != nil {
			rows.Close()
			writeError(w, err)
			return
		}
		credits = append(credits, credit)
		totalOutstanding += math.Max(0, credit.Amount-credit.Paid)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		writeError(w, err)
		return
	}
	rows.Close()
	if len(credits) == 0 {
		writeError(w, apiError{status: http.StatusConflict, msg: "El cliente no tiene fiado pendiente"})
		return
	}
	paymentAmount := roundCurrency(input.Amount)
	if paymentAmount-totalOutstanding > 0.01 {
		writeError(w, badRequest("El abono supera la deuda pendiente del cliente"))
		return
	}
	remaining := paymentAmount
	paymentIDs := []string{}
	notificationCustomerID := ""
	actor := actorFromContext(r.Context())
	for _, credit := range credits {
		if notificationCustomerID == "" {
			notificationCustomerID = credit.CustomerID
		}
		if remaining <= 0.009 {
			break
		}
		outstanding := math.Max(0, credit.Amount-credit.Paid)
		allocation := math.Min(outstanding, remaining)
		newPaid := roundCurrency(credit.Paid + allocation)
		status := "partial"
		if credit.Amount-newPaid <= 0.01 {
			newPaid = credit.Amount
			status = "paid"
		}
		if _, err := tx.Exec(r.Context(), `UPDATE store_credits SET paid_amount=$2,status=$3,updated_at=now() WHERE id=$1::uuid`, credit.ID, newPaid, status); err != nil {
			writeError(w, err)
			return
		}
		var paymentID string
		note := strings.TrimSpace(input.Note)
		if note == "" {
			note = "Abono de fiado mediante " + offlinePaymentMethodLabel(method)
		}
		if err := tx.QueryRow(r.Context(), `
			INSERT INTO store_credits (store_id,customer,customer_id,amount,note,status,type,date,reference_type,reference_id,created_by)
			VALUES ($1::uuid,$2,NULLIF($3,'')::uuid,$4,$5,'paid','payment',now(),'store_credit',$6::uuid,$7)
			RETURNING id::text
		`, input.StoreID, input.Customer, credit.CustomerID, allocation, note, credit.ID, actor.ID).Scan(&paymentID); err != nil {
			writeError(w, err)
			return
		}
		paymentIDs = append(paymentIDs, paymentID)
		remaining = roundCurrency(remaining - allocation)
	}
	if err := postStoreCreditPaymentAccountingTx(r.Context(), tx, input.StoreID, paymentIDs[0], method, paymentAmount, actor); err != nil {
		writeError(w, err)
		return
	}
	if method == "cash" {
		if err := insertCashMovementForOpenSession(r.Context(), tx, input.StoreID, "credit_payment", paymentAmount, method, "Abono de fiado de "+input.Customer, "store_credit", paymentIDs[0], actor); err != nil {
			writeError(w, err)
			return
		}
	}
	remainingDebt := math.Max(0, totalOutstanding-paymentAmount)
	details := map[string]any{"store_id": input.StoreID, "customer": input.Customer, "amount": paymentAmount, "method": method, "remaining": remainingDebt, "payment_ids": paymentIDs}
	if err := insertAuditTx(r.Context(), tx, input.StoreID, actor, "store_credit.customer_payment.recorded", "store_credit", paymentIDs[0], details); err != nil {
		writeError(w, err)
		return
	}
	if err := insertOutboxTx(r.Context(), tx, input.StoreID, "store_credit", paymentIDs[0], "store_credit.payment.recorded", details, "store_credit.customer_payment:"+paymentIDs[0]); err != nil {
		writeError(w, err)
		return
	}
	if err := insertNotificationTx(r.Context(), tx, input.StoreID, "administrator", "", "store_credit.payment.recorded", "Abono de fiado registrado", fmt.Sprintf("%s abonó RD$ %.2f mediante %s.", input.Customer, paymentAmount, offlinePaymentMethodLabel(method)), details); err != nil {
		writeError(w, err)
		return
	}
	if notificationCustomerID != "" {
		title := "Abono de fiado registrado"
		message := fmt.Sprintf("Registramos un abono de RD$ %.2f. Saldo pendiente: RD$ %.2f.", paymentAmount, remainingDebt)
		if err := insertNotificationChannelTx(r.Context(), tx, input.StoreID, "customer", notificationCustomerID, "whatsapp", "store_credit.payment.recorded", title, message, details); err != nil {
			writeError(w, err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"amount": paymentAmount, "remaining_amount": remainingDebt, "method": method, "payment_ids": paymentIDs})
}

func (s *Server) recordStoreCreditPartialPayment(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Amount float64 `json:"amount"`
		Method string  `json:"method"`
		Note   string  `json:"note"`
	}
	if err := readJSON(r, &input); err != nil && !errors.Is(err, context.Canceled) {
		// Existing clients send an empty object, which is valid JSON and reaches this branch with nil.
		writeError(w, badRequest(err.Error()))
		return
	}
	if input.Method == "" {
		input.Method = "cash"
	}
	method, err := validateOfflinePaymentMethod(input.Method)
	if err != nil || method == "store_credit" {
		writeError(w, badRequest("Selecciona efectivo, transferencia manual o terminal externo"))
		return
	}
	creditID := chi.URLParam(r, "id")
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var storeID, customer, customerID, creditType, status string
	var amount, paid float64
	err = tx.QueryRow(r.Context(), `
		SELECT store_id::text,customer,COALESCE(customer_id::text,''),amount,paid_amount,type,status
		FROM store_credits WHERE id=$1::uuid FOR UPDATE
	`, creditID).Scan(&storeID, &customer, &customerID, &amount, &paid, &creditType, &status)
	if err != nil {
		writeError(w, err)
		return
	}
	if creditType != "charge" || status == "paid" || status == "reversed" {
		writeError(w, apiError{status: http.StatusConflict, msg: "Esta cuenta no tiene saldo pendiente"})
		return
	}
	outstanding := math.Max(0, amount-paid)
	payment := input.Amount
	if payment <= 0 {
		payment = outstanding
	}
	if payment <= 0 || payment-outstanding > 0.01 {
		writeError(w, badRequest("El abono supera el saldo pendiente"))
		return
	}
	newPaid := roundCurrency(paid + payment)
	newStatus := "partial"
	if outstanding-payment <= 0.01 {
		newStatus = "paid"
		newPaid = amount
	}
	_, err = tx.Exec(r.Context(), `UPDATE store_credits SET paid_amount=$2,status=$3,updated_at=now() WHERE id=$1::uuid`, creditID, newPaid, newStatus)
	if err != nil {
		writeError(w, err)
		return
	}
	actor := actorFromContext(r.Context())
	var paymentID string
	err = tx.QueryRow(r.Context(), `
		INSERT INTO store_credits (store_id,customer,customer_id,amount,note,status,type,date,reference_type,reference_id,created_by)
		VALUES ($1::uuid,$2,NULLIF($3,'')::uuid,$4,$5,'paid','payment',now(),'store_credit',$6::uuid,$7)
		RETURNING id::text
	`, storeID, customer, customerID, payment, strings.TrimSpace(firstNonEmpty(input.Note, "Abono de fiado mediante "+offlinePaymentMethodLabel(method))), creditID, actor.ID).Scan(&paymentID)
	if err != nil {
		writeError(w, err)
		return
	}
	if err := postStoreCreditPaymentAccountingTx(r.Context(), tx, storeID, paymentID, method, payment, actor); err != nil {
		writeError(w, err)
		return
	}
	if method == "cash" {
		if err := insertCashMovementForOpenSession(r.Context(), tx, storeID, "credit_payment", payment, method, "Abono de fiado", "store_credit", creditID, actor); err != nil {
			writeError(w, err)
			return
		}
	}
	if err := insertAuditTx(r.Context(), tx, storeID, actor, "store_credit.payment.recorded", "store_credit", creditID, map[string]any{"store_id": storeID, "payment_id": paymentID, "amount": payment, "method": method, "remaining": math.Max(0, amount-newPaid)}); err != nil {
		writeError(w, err)
		return
	}
	if err := insertOutboxTx(r.Context(), tx, storeID, "store_credit", creditID, "store_credit.payment.recorded", map[string]any{"store_id": storeID, "credit_id": creditID, "customer_id": customerID, "amount": payment, "remaining": math.Max(0, amount-newPaid)}, "store_credit.payment:"+paymentID); err != nil {
		writeError(w, err)
		return
	}
	if customerID != "" {
		details := map[string]any{"store_id": storeID, "credit_id": creditID, "customer_id": customerID, "amount": payment, "remaining": math.Max(0, amount-newPaid)}
		if err := insertNotificationChannelTx(r.Context(), tx, storeID, "customer", customerID, "whatsapp", "store_credit.payment.recorded", "Abono de fiado registrado", fmt.Sprintf("Registramos un abono de RD$ %.2f. Saldo pendiente: RD$ %.2f.", payment, math.Max(0, amount-newPaid)), details); err != nil {
			writeError(w, err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": creditID, "payment_id": paymentID, "amount": amount, "paid_amount": newPaid, "remaining_amount": math.Max(0, amount-newPaid), "status": newStatus, "method": method})
}

func offlinePaymentMethodLabel(method string) string {
	switch method {
	case "cash":
		return "efectivo"
	case "bank_transfer":
		return "transferencia manual"
	case "card":
		return "terminal externo"
	default:
		return "método manual"
	}
}

func (s *Server) queryCustomersPage(ctx context.Context, search string, limit, offset int) ([]Customer, int, error) {
	search = strings.TrimSpace(search)
	if limit <= 0 {
		limit = defaultPageSize
	}
	if limit > maxPageSize {
		limit = maxPageSize
	}
	if offset < 0 {
		offset = 0
	}
	where := ""
	args := []any{}
	if search != "" {
		namePattern := "%" + strings.ToLower(search) + "%"
		digits := onlyDigits(search)
		if digits == "" {
			args = append(args, namePattern)
			where = ` WHERE lower(COALESCE(name,'')) LIKE $1`
		} else {
			args = append(args, namePattern, "%"+digits+"%")
			where = ` WHERE lower(COALESCE(name,'')) LIKE $1
				OR regexp_replace(COALESCE(national_id,''), '\D', '', 'g') LIKE $2
				OR regexp_replace(COALESCE(whatsapp,''), '\D', '', 'g') LIKE $2`
		}
	}
	var total int
	if err := s.db.QueryRow(ctx, `SELECT COUNT(*)::integer FROM customers`+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	limitPosition := len(args) + 1
	offsetPosition := len(args) + 2
	queryArgs := append(append([]any{}, args...), limit, offset)
	rows, err := s.db.Query(ctx, customerSelectSQL(`SELECT`)+` FROM customers`+where+fmt.Sprintf(` ORDER BY registered_at DESC,id DESC LIMIT $%d OFFSET $%d`, limitPosition, offsetPosition), queryArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := make([]Customer, 0, limit)
	for rows.Next() {
		var customer Customer
		if err := rows.Scan(customerScanPtrs(&customer)...); err != nil {
			return nil, 0, err
		}
		items = append(items, customer)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return s.hydrateCustomerAvatars(ctx, items), total, nil
}

func (s *Server) listBusinessCustomers(w http.ResponseWriter, r *http.Request) {
	limit := pageSizeFromRequest(r)
	offset := pageOffsetFromRequest(r)
	items, total, err := s.queryCustomersPage(r.Context(), r.URL.Query().Get("search"), limit, offset)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":    items,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
		"has_more": offset+len(items) < total,
	})
}

func (s *Server) queryStoreCreditsLimit(ctx context.Context, storeID string, limit int) ([]StoreCredit, error) {
	if limit <= 0 {
		limit = 500
	}
	rows, err := s.db.Query(ctx, storeCreditSelectSQL(`SELECT`)+` FROM store_credits WHERE store_id=$1::uuid ORDER BY date DESC,id DESC LIMIT $2`, storeID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]StoreCredit, 0, limit)
	for rows.Next() {
		var item StoreCredit
		if err := rows.Scan(storeCreditScanPointers(&item)...); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Server) queryCashHistoryLimit(ctx context.Context, storeID string, limit int) ([]CashHistory, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := s.db.Query(ctx, cashSelectSQL(`SELECT`)+` FROM cash_history WHERE store_id=$1::uuid ORDER BY created_at DESC,id DESC LIMIT $2`, storeID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]CashHistory, 0, limit)
	for rows.Next() {
		var item CashHistory
		if err := rows.Scan(cashScanPtrs(&item)...); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Server) listBusinessAuditLogs(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	if storeID == "" {
		writeError(w, badRequest("Debes seleccionar el negocio"))
		return
	}
	limit := pageSizeFromRequest(r)
	offset := pageOffsetFromRequest(r)
	rows, err := s.db.Query(r.Context(), `
		SELECT id::text,COALESCE(store_id::text,''),actor_id,actor_role,action,entity_type,entity_id,request_id,details,created_at
		FROM business_audit_logs WHERE store_id=$1::uuid ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3
	`, storeID, limit, offset)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, itemStoreID, actorID, actorRole, action, entityType, entityID, requestID string
		var details json.RawMessage
		var createdAt time.Time
		if err := rows.Scan(&id, &itemStoreID, &actorID, &actorRole, &action, &entityType, &entityID, &requestID, &details, &createdAt); err != nil {
			writeError(w, err)
			return
		}
		items = append(items, map[string]any{"id": id, "store_id": itemStoreID, "actor_id": actorID, "actor_role": actorRole, "action": action, "entity_type": entityType, "entity_id": entityID, "request_id": requestID, "details": details, "created_at": createdAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "limit": limit, "offset": offset, "has_more": len(items) == limit})
}

func (s *Server) businessReportSummary(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	if storeID == "" {
		writeError(w, badRequest("Debes seleccionar el negocio"))
		return
	}

	to := s.now()
	from := to.AddDate(0, 0, -30)
	if value := strings.TrimSpace(r.URL.Query().Get("from")); value != "" {
		parsed, err := time.Parse(time.RFC3339, value)
		if err != nil {
			writeError(w, badRequest("La fecha inicial no es válida"))
			return
		}
		from = parsed
	}
	if value := strings.TrimSpace(r.URL.Query().Get("to")); value != "" {
		parsed, err := time.Parse(time.RFC3339, value)
		if err != nil {
			writeError(w, badRequest("La fecha final no es válida"))
			return
		}
		to = parsed
	}
	if !to.After(from) {
		writeError(w, badRequest("La fecha final debe ser posterior a la fecha inicial"))
		return
	}
	if to.Sub(from) > 366*24*time.Hour {
		writeError(w, badRequest("El período máximo de consulta es de 366 días"))
		return
	}

	periodDuration := to.Sub(from)
	previousFrom := from.Add(-periodDuration)
	previousTo := from

	queryTotals := func(startAt, endAt time.Time) (int, float64, float64, error) {
		var count int
		var gross, returned float64
		err := s.db.QueryRow(r.Context(), `
			SELECT COUNT(*)::integer, COALESCE(SUM(total),0)
			FROM sales
			WHERE store_id=$1::uuid AND date >= $2 AND date < $3
			  AND financial_status <> 'voided'
		`, storeID, startAt, endAt).Scan(&count, &gross)
		if err != nil {
			return 0, 0, 0, err
		}
		err = s.db.QueryRow(r.Context(), `
			SELECT COALESCE(SUM(amount),0)
			FROM sale_returns
			WHERE store_id=$1::uuid AND created_at >= $2 AND created_at < $3
		`, storeID, startAt, endAt).Scan(&returned)
		return count, gross, returned, err
	}

	salesCount, grossSales, returned, err := queryTotals(from, to)
	if err != nil {
		writeError(w, err)
		return
	}
	previousSalesCount, previousGrossSales, previousReturned, err := queryTotals(previousFrom, previousTo)
	if err != nil {
		writeError(w, err)
		return
	}

	var creditOutstanding, inventoryCost float64
	var debtorsCount, lowStockCount, outOfStockCount int
	if err := s.db.QueryRow(r.Context(), `
		SELECT COALESCE(SUM(GREATEST(amount-paid_amount,0)),0),
		       COUNT(DISTINCT COALESCE(customer_id::text, lower(customer)))::integer
		FROM store_credits
		WHERE store_id=$1::uuid AND type='charge'
		  AND status NOT IN ('paid','reversed') AND amount-paid_amount > 0.009
	`, storeID).Scan(&creditOutstanding, &debtorsCount); err != nil {
		writeError(w, err)
		return
	}
	if err := s.db.QueryRow(r.Context(), `
		SELECT COALESCE(SUM(cost*stock),0),
		       COUNT(*) FILTER (WHERE stock > 0 AND stock < 5)::integer,
		       COUNT(*) FILTER (WHERE stock <= 0)::integer
		FROM products WHERE store_id=$1::uuid
	`, storeID).Scan(&inventoryCost, &lowStockCount, &outOfStockCount); err != nil {
		writeError(w, err)
		return
	}

	rows, err := s.db.Query(r.Context(), `
		SELECT method, COUNT(*)::integer, COALESCE(SUM(total),0)
		FROM sales
		WHERE store_id=$1::uuid AND date >= $2 AND date < $3
		  AND financial_status <> 'voided'
		GROUP BY method ORDER BY SUM(total) DESC
	`, storeID, from, to)
	if err != nil {
		writeError(w, err)
		return
	}
	byMethod := []map[string]any{}
	for rows.Next() {
		var method string
		var count int
		var total float64
		if err := rows.Scan(&method, &count, &total); err != nil {
			rows.Close()
			writeError(w, err)
			return
		}
		byMethod = append(byMethod, map[string]any{
			"method": method,
			"label":  offlinePaymentMethodLabel(method),
			"count":  count,
			"total":  roundCurrency(total),
		})
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		writeError(w, err)
		return
	}
	rows.Close()

	bucket := "day"
	if periodDuration <= 26*time.Hour {
		bucket = "hour"
	}
	rows, err = s.db.Query(r.Context(), `
		SELECT date_trunc($4, date AT TIME ZONE 'America/Santo_Domingo') AS bucket,
		       COUNT(*)::integer,
		       COALESCE(SUM(total),0)
		FROM sales
		WHERE store_id=$1::uuid AND date >= $2 AND date < $3
		  AND financial_status <> 'voided'
		GROUP BY 1 ORDER BY 1
	`, storeID, from, to, bucket)
	if err != nil {
		writeError(w, err)
		return
	}
	series := []map[string]any{}
	for rows.Next() {
		var bucketAt time.Time
		var count int
		var total float64
		if err := rows.Scan(&bucketAt, &count, &total); err != nil {
			rows.Close()
			writeError(w, err)
			return
		}
		series = append(series, map[string]any{"date": bucketAt, "count": count, "total": roundCurrency(total)})
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		writeError(w, err)
		return
	}
	rows.Close()

	rows, err = s.db.Query(r.Context(), `
		WITH item_rows AS (
			SELECT item
			FROM sales
			CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(items)='array' THEN items ELSE '[]'::jsonb END) AS item
			WHERE store_id=$1::uuid AND date >= $2 AND date < $3
			  AND financial_status <> 'voided'
		), normalized AS (
			SELECT
				COALESCE(NULLIF(item->>'name',''),'Producto') AS name,
				COALESCE(NULLIF(item->>'category',''),'Sin categoría') AS category,
				CASE
					WHEN COALESCE(item->>'quantity',item->>'requested_weight',item->>'requestedWeight',item->>'estimated_weight',item->>'estimatedWeight','') ~ '^[0-9]+([.][0-9]+)?$'
					THEN COALESCE(item->>'quantity',item->>'requested_weight',item->>'requestedWeight',item->>'estimated_weight',item->>'estimatedWeight')::double precision
					ELSE 0
				END AS quantity,
				CASE
					WHEN COALESCE(item->>'line_total',item->>'lineTotal','') ~ '^[0-9]+([.][0-9]+)?$'
					THEN COALESCE(item->>'line_total',item->>'lineTotal')::double precision
					WHEN COALESCE(item->>'price','') ~ '^[0-9]+([.][0-9]+)?$'
					THEN (item->>'price')::double precision * CASE
						WHEN COALESCE(item->>'quantity',item->>'requested_weight',item->>'requestedWeight',item->>'estimated_weight',item->>'estimatedWeight','') ~ '^[0-9]+([.][0-9]+)?$'
						THEN COALESCE(item->>'quantity',item->>'requested_weight',item->>'requestedWeight',item->>'estimated_weight',item->>'estimatedWeight')::double precision
						ELSE 0 END
					ELSE 0
				END AS revenue
			FROM item_rows
		)
		SELECT name, category, COALESCE(SUM(quantity),0), COALESCE(SUM(revenue),0)
		FROM normalized
		GROUP BY name, category
		ORDER BY SUM(revenue) DESC, SUM(quantity) DESC
		LIMIT 10
	`, storeID, from, to)
	if err != nil {
		writeError(w, err)
		return
	}
	topProducts := []map[string]any{}
	for rows.Next() {
		var name, category string
		var quantity, revenue float64
		if err := rows.Scan(&name, &category, &quantity, &revenue); err != nil {
			rows.Close()
			writeError(w, err)
			return
		}
		topProducts = append(topProducts, map[string]any{"name": name, "category": category, "quantity": quantity, "revenue": roundCurrency(revenue)})
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		writeError(w, err)
		return
	}
	rows.Close()

	netSales := roundCurrency(grossSales - returned)
	previousNetSales := roundCurrency(previousGrossSales - previousReturned)
	averageTicket := 0.0
	if salesCount > 0 {
		averageTicket = roundCurrency(netSales / float64(salesCount))
	}
	previousAverageTicket := 0.0
	if previousSalesCount > 0 {
		previousAverageTicket = roundCurrency(previousNetSales / float64(previousSalesCount))
	}
	percentageChange := func(current, previous float64) float64 {
		if math.Abs(previous) < 0.000001 {
			if math.Abs(current) < 0.000001 {
				return 0
			}
			return 100
		}
		return math.Round(((current-previous)/math.Abs(previous))*10000) / 100
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"store_id":                storeID,
		"from":                    from,
		"to":                      to,
		"bucket":                  bucket,
		"sales_count":             salesCount,
		"gross_sales":             roundCurrency(grossSales),
		"returns":                 roundCurrency(returned),
		"net_sales":               netSales,
		"average_ticket":          averageTicket,
		"previous_sales_count":    previousSalesCount,
		"previous_net_sales":      previousNetSales,
		"previous_average_ticket": previousAverageTicket,
		"sales_trend_percentage":  percentageChange(netSales, previousNetSales),
		"ticket_trend_percentage": percentageChange(averageTicket, previousAverageTicket),
		"outstanding_credit":      roundCurrency(creditOutstanding),
		"debtors_count":           debtorsCount,
		"inventory_cost":          roundCurrency(inventoryCost),
		"low_stock_count":         lowStockCount,
		"out_of_stock_count":      outOfStockCount,
		"payment_methods":         byMethod,
		"series":                  series,
		"top_products":            topProducts,
	})
}

func (s *Server) listBusinessNotifications(w http.ResponseWriter, r *http.Request) {
	actor := actorFromContext(r.Context())
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	limit := pageSizeFromRequest(r)
	rows, err := s.db.Query(r.Context(), `
		SELECT id::text,COALESCE(store_id::text,''),recipient_type,recipient_id,channel,event_type,title,message,data,status,sent_at,read_at,created_at
		FROM business_notifications
		WHERE channel='in_app'
		  AND ($1='' OR store_id=NULLIF($1,'')::uuid)
		  AND (recipient_id='' OR recipient_id=$2 OR recipient_type=$3)
		ORDER BY created_at DESC LIMIT $4
	`, storeID, actor.ID, actor.Role, limit)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, itemStoreID, recipientType, recipientID, channel, eventType, title, message, status string
		var data json.RawMessage
		var sentAt, readAt sql.NullTime
		var createdAt time.Time
		if err := rows.Scan(&id, &itemStoreID, &recipientType, &recipientID, &channel, &eventType, &title, &message, &data, &status, &sentAt, &readAt, &createdAt); err != nil {
			writeError(w, err)
			return
		}
		item := map[string]any{"id": id, "store_id": itemStoreID, "recipient_type": recipientType, "recipient_id": recipientID, "channel": channel, "event_type": eventType, "title": title, "message": message, "data": data, "status": status, "created_at": createdAt}
		if sentAt.Valid {
			item["sent_at"] = sentAt.Time
		}
		if readAt.Valid {
			item["read_at"] = readAt.Time
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) markBusinessNotificationRead(w http.ResponseWriter, r *http.Request) {
	actor := actorFromContext(r.Context())
	id := chi.URLParam(r, "id")
	result, err := s.db.Exec(r.Context(), `
		UPDATE business_notifications SET status='read',read_at=now(),updated_at=now()
		WHERE id=$1::uuid AND channel='in_app' AND (recipient_id='' OR recipient_id=$2 OR recipient_type=$3)
	`, id, actor.ID, actor.Role)
	if err != nil {
		writeError(w, err)
		return
	}
	if result.RowsAffected() == 0 {
		writeError(w, apiError{status: http.StatusNotFound, msg: "La notificación no existe"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "status": "read"})
}
