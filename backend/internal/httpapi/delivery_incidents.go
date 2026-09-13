package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

const (
	inventoryDispositionRestock    = "restock"
	inventoryDispositionDamaged    = "damaged"
	inventoryDispositionLost       = "lost"
	inventoryDispositionQuarantine = "quarantine"
)

func validActiveIncidentResolution(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "resume", "reassign", "replace_and_continue", "partial_delivery":
		return true
	default:
		return false
	}
}

func validInventoryDisposition(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case inventoryDispositionRestock, inventoryDispositionDamaged, inventoryDispositionLost, inventoryDispositionQuarantine:
		return true
	default:
		return false
	}
}

func normalizeInventoryDisposition(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case inventoryDispositionDamaged:
		return inventoryDispositionDamaged
	case inventoryDispositionLost:
		return inventoryDispositionLost
	case inventoryDispositionQuarantine:
		return inventoryDispositionQuarantine
	default:
		return inventoryDispositionRestock
	}
}

func inventoryDispositionLabel(value string) string {
	switch normalizeInventoryDisposition(value) {
	case inventoryDispositionDamaged:
		return "Mercancía dañada"
	case inventoryDispositionLost:
		return "Mercancía perdida"
	case inventoryDispositionQuarantine:
		return "Mercancía en cuarentena"
	default:
		return "Mercancía repuesta al inventario"
	}
}

func inventoryDispositionRestocks(value string) bool {
	return normalizeInventoryDisposition(value) == inventoryDispositionRestock
}

func saleItemCosts(raw json.RawMessage) map[string]float64 {
	var items []map[string]any
	if json.Unmarshal(raw, &items) != nil {
		return map[string]float64{}
	}
	costs := make(map[string]float64, len(items))
	for _, item := range items {
		productID := itemText(item, "id", "product_id", "productId")
		if productID == "" {
			continue
		}
		costs[productID] = itemNumber(item, "cost", "unit_cost", "unitCost")
	}
	return costs
}

func recordInventoryDispositionsTx(
	ctx context.Context,
	tx pgx.Tx,
	storeID string,
	saleID string,
	incidentID string,
	disposition string,
	reason string,
	actor businessActor,
	rawItems json.RawMessage,
	items []returnedSaleItem,
	restocked bool,
) error {
	disposition = normalizeInventoryDisposition(disposition)
	costs := saleItemCosts(rawItems)
	for _, item := range items {
		if strings.TrimSpace(item.ProductID) == "" || item.Quantity <= 0 {
			return badRequest("Los productos de la disposición no tienen un formato válido")
		}
		unitCost := roundDecimal(costs[item.ProductID], 4)
		totalCost := roundCurrency(unitCost * item.Quantity)
		_, err := tx.Exec(ctx, `
			INSERT INTO inventory_dispositions (
				store_id,product_id,sale_id,incident_id,disposition,quantity,unit_cost,total_cost,
				restocked,reason,actor_id,actor_role
			) VALUES (
				$1::uuid,$2::uuid,$3::uuid,NULLIF($4,'')::uuid,$5,$6,$7,$8,$9,$10,$11,$12
			)
		`, storeID, item.ProductID, saleID, incidentID, disposition, item.Quantity, unitCost, totalCost, restocked, reason, actor.ID, actor.Role)
		if err != nil {
			return err
		}
	}
	return nil
}

func openDeliveryIncidentTx(
	ctx context.Context,
	tx pgx.Tx,
	storeID string,
	orderID string,
	driverID string,
	previousStatus string,
	issueType string,
	note string,
) (string, error) {
	issueType = strings.ToLower(strings.TrimSpace(issueType))
	switch issueType {
	case "damaged", "lost", "customer_unavailable", "address_problem", "vehicle_problem", "payment_problem":
	default:
		issueType = "other"
	}
	var incidentID string
	err := tx.QueryRow(ctx, `
		INSERT INTO delivery_incidents (
			sale_id,store_id,driver_id,previous_order_status,issue_type,note,status,reported_at,created_at,updated_at
		) VALUES ($1::uuid,$2::uuid,NULLIF($3,'')::uuid,$4,$5,$6,'open',now(),now(),now())
		ON CONFLICT (sale_id) WHERE status='open' DO UPDATE SET
			driver_id=EXCLUDED.driver_id,
			issue_type=EXCLUDED.issue_type,
			note=EXCLUDED.note,
			updated_at=now()
		RETURNING id::text
	`, orderID, storeID, driverID, normalizeOrderStatus(previousStatus), issueType, note).Scan(&incidentID)
	return incidentID, err
}

func (s *Server) resolveDeliveryIssue(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Resolution           string             `json:"resolution"`
		Note                 string             `json:"note"`
		InventoryDisposition string             `json:"inventory_disposition"`
		ReplacementItems     []returnedSaleItem `json:"replacement_items"`
		PartialItems         []returnedSaleItem `json:"partial_items"`
		ReturnResolution     string             `json:"return_resolution"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input.Resolution = strings.ToLower(strings.TrimSpace(input.Resolution))
	input.Note = strings.TrimSpace(input.Note)
	if !validActiveIncidentResolution(input.Resolution) {
		writeError(w, badRequest("Selecciona una resolución válida para la incidencia"))
		return
	}
	if len([]rune(input.Note)) < 5 {
		writeError(w, badRequest("Describe brevemente cómo se resolvió la incidencia"))
		return
	}

	orderID := chi.URLParam(r, "id")
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())

	var storeID, customerID, currentStatus, financialStatus, method, customer string
	var rawItems json.RawMessage
	var total float64
	if err := tx.QueryRow(r.Context(), `
		SELECT store_id::text,COALESCE(customer_id::text,''),status,financial_status,items,total,method,customer
		FROM sales
		WHERE id=$1::uuid AND order_type='customer'
		FOR UPDATE
	`, orderID).Scan(&storeID, &customerID, &currentStatus, &financialStatus, &rawItems, &total, &method, &customer); err != nil {
		writeError(w, err)
		return
	}
	if normalizeOrderStatus(currentStatus) != "issue" {
		writeError(w, apiError{status: http.StatusConflict, msg: "El pedido ya no tiene una incidencia abierta"})
		return
	}
	if financialStatus != "completed" {
		writeError(w, apiError{status: http.StatusConflict, msg: "La operación financiera del pedido ya fue cerrada y la incidencia no puede reabrirla"})
		return
	}

	var incidentID, previousStatus string
	if err := tx.QueryRow(r.Context(), `
		SELECT id::text,previous_order_status
		FROM delivery_incidents
		WHERE sale_id=$1::uuid AND status='open'
		ORDER BY reported_at DESC
		LIMIT 1
		FOR UPDATE
	`, orderID).Scan(&incidentID, &previousStatus); err != nil {
		if errorsIsNoRows(err) {
			writeError(w, apiError{status: http.StatusConflict, msg: "No se encontró la incidencia abierta del pedido"})
			return
		}
		writeError(w, err)
		return
	}
	actor := actorFromContext(r.Context())
	incidentDisposition := "none"
	replacementItems := []returnedSaleItem{}
	replacementRestocked := false
	partialItems := []returnedSaleItem{}
	partialReturnID := ""
	partialReturnAmount := 0.0
	if input.Resolution == "replace_and_continue" {
		if strings.TrimSpace(input.InventoryDisposition) == "" {
			writeError(w, badRequest("Selecciona qué ocurrió con los productos que serán reemplazados"))
			return
		}
		if !validInventoryDisposition(input.InventoryDisposition) {
			writeError(w, badRequest("El tratamiento seleccionado para el inventario no es válido"))
			return
		}
		if len(input.ReplacementItems) == 0 {
			writeError(w, badRequest("Selecciona al menos un producto para preparar el reemplazo"))
			return
		}
		incidentDisposition = normalizeInventoryDisposition(input.InventoryDisposition)
		replacementRestocked = inventoryDispositionRestocks(incidentDisposition)
		sold, _, itemErr := saleItemsForReturn(rawItems)
		if itemErr != nil {
			writeError(w, itemErr)
			return
		}
		requested := map[string]float64{}
		for _, item := range input.ReplacementItems {
			item.ProductID = strings.TrimSpace(item.ProductID)
			item.Quantity = roundDecimal(item.Quantity, defaultWeightPrecision)
			soldItem, exists := sold[item.ProductID]
			if !exists || item.Quantity <= 0 {
				writeError(w, badRequest("Uno de los productos seleccionados no pertenece al pedido"))
				return
			}
			requested[item.ProductID] += item.Quantity
			if requested[item.ProductID]-soldItem.Quantity > 0.000001 {
				writeError(w, badRequest("La cantidad de reemplazo supera la cantidad del pedido"))
				return
			}
			replacementItems = append(replacementItems, item)
		}
		if replacementRestocked {
			if err := restoreInventoryTx(r.Context(), tx, storeID, "return", input.Note, "sale", orderID, actor, replacementItems); err != nil {
				writeError(w, err)
				return
			}
			if err := restoreTrackedBatchesTx(r.Context(), tx, orderID, replacementItems); err != nil {
				writeError(w, err)
				return
			}
		}
		if err := recordInventoryDispositionsTx(r.Context(), tx, storeID, orderID, incidentID, incidentDisposition, input.Note, actor, rawItems, replacementItems, replacementRestocked); err != nil {
			writeError(w, err)
			return
		}
		adjustments := make([]inventoryAdjustment, 0, len(replacementItems))
		for _, item := range replacementItems {
			adjustments = append(adjustments, inventoryAdjustment{ProductID: item.ProductID, Quantity: item.Quantity})
		}
		if err := consumeTrackedBatchesTx(r.Context(), tx, storeID, orderID, adjustments); err != nil {
			writeError(w, err)
			return
		}
		if err := applyInventoryAdjustments(r.Context(), tx, storeID, adjustments); err != nil {
			writeError(w, err)
			return
		}
		if err := recordInventoryAdjustmentsTx(r.Context(), tx, storeID, "correction", "Productos preparados como reemplazo por incidencia", "sale", orderID, actor, adjustments, -1); err != nil {
			writeError(w, err)
			return
		}
		if !replacementRestocked {
			cost := returnedItemsCost(rawItems, replacementItems)
			if err := postDeliveryReplacementAccountingTx(r.Context(), tx, storeID, incidentID, cost, actor); err != nil {
				writeError(w, err)
				return
			}
		}
	}

	if input.Resolution == "partial_delivery" {
		if strings.TrimSpace(input.InventoryDisposition) == "" || !validInventoryDisposition(input.InventoryDisposition) {
			writeError(w, badRequest("Selecciona qué ocurrió con los productos que no pudieron entregarse"))
			return
		}
		input.ReturnResolution = strings.ToLower(strings.TrimSpace(input.ReturnResolution))
		if input.ReturnResolution == "" {
			input.ReturnResolution = "refund"
		}
		if input.ReturnResolution != "refund" && input.ReturnResolution != "store_credit" {
			writeError(w, badRequest("Selecciona una resolución financiera válida para la entrega parcial"))
			return
		}
		if len(input.PartialItems) == 0 {
			writeError(w, badRequest("Selecciona los productos que no fueron entregados"))
			return
		}
		incidentDisposition = normalizeInventoryDisposition(input.InventoryDisposition)
		partialRestocked := inventoryDispositionRestocks(incidentDisposition)
		sold, lineAmounts, itemErr := saleItemsForReturn(rawItems)
		if itemErr != nil {
			writeError(w, itemErr)
			return
		}
		requested := map[string]float64{}
		allProductsReturned := true
		for _, item := range input.PartialItems {
			item.ProductID = strings.TrimSpace(item.ProductID)
			item.Quantity = roundDecimal(item.Quantity, defaultWeightPrecision)
			soldItem, exists := sold[item.ProductID]
			if !exists || item.Quantity <= 0 {
				writeError(w, badRequest("Uno de los productos seleccionados no pertenece al pedido"))
				return
			}
			requested[item.ProductID] += item.Quantity
			if requested[item.ProductID]-soldItem.Quantity > 0.000001 {
				writeError(w, badRequest("La cantidad no entregada supera la cantidad del pedido"))
				return
			}
			partialReturnAmount += lineAmounts[item.ProductID] * (item.Quantity / soldItem.Quantity)
			partialItems = append(partialItems, item)
		}
		for productID, soldItem := range sold {
			if soldItem.Quantity-requested[productID] > 0.000001 {
				allProductsReturned = false
				break
			}
		}
		if allProductsReturned {
			writeError(w, badRequest("Para cancelar todos los productos utiliza la opción Cancelar pedido y anular venta"))
			return
		}
		partialReturnAmount = roundPayableAmount(partialReturnAmount)
		if partialReturnAmount <= 0 || partialReturnAmount-total >= -0.009 {
			writeError(w, badRequest("El monto de la entrega parcial no es válido"))
			return
		}
		if partialRestocked {
			if err := restoreInventoryTx(r.Context(), tx, storeID, "return", input.Note, "sale", orderID, actor, partialItems); err != nil {
				writeError(w, err)
				return
			}
			if err := restoreTrackedBatchesTx(r.Context(), tx, orderID, partialItems); err != nil {
				writeError(w, err)
				return
			}
		}
		if err := recordInventoryDispositionsTx(r.Context(), tx, storeID, orderID, incidentID, incidentDisposition, input.Note, actor, rawItems, partialItems, partialRestocked); err != nil {
			writeError(w, err)
			return
		}
		encodedItems, encodeErr := marshalJSONDatabaseValue(partialItems)
		if encodeErr != nil {
			writeError(w, encodeErr)
			return
		}
		if err := tx.QueryRow(r.Context(), `
			INSERT INTO sale_returns (
				sale_id,store_id,items,amount,reason,resolution,payment_method,created_by,created_by_role,
				inventory_disposition,inventory_restocked
			) VALUES ($1::uuid,$2::uuid,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11)
			RETURNING id::text
		`, orderID, storeID, encodedItems, partialReturnAmount, input.Note, input.ReturnResolution, method, actor.ID, actor.Role, incidentDisposition, partialRestocked).Scan(&partialReturnID); err != nil {
			writeError(w, err)
			return
		}
		if method == "store_credit" || input.ReturnResolution == "store_credit" {
			if _, err := tx.Exec(r.Context(), `
				INSERT INTO store_credits (store_id,customer,customer_id,amount,note,status,type,date,reference_type,reference_id,created_by)
				VALUES ($1::uuid,$2,NULLIF($3,'')::uuid,$4,$5,'paid','payment',now(),'sale_return',$6::uuid,$7)
			`, storeID, customer, customerID, partialReturnAmount, "Crédito por entrega parcial", partialReturnID, actor.ID); err != nil {
				writeError(w, err)
				return
			}
		}
		if input.ReturnResolution == "refund" && method == "cash" {
			if err := insertCashMovementForOpenSession(r.Context(), tx, storeID, "refund", partialReturnAmount, method, "Reembolso por entrega parcial", "sale_return", partialReturnID, actor); err != nil {
				writeError(w, err)
				return
			}
		}
		partialCost := returnedItemsCost(rawItems, partialItems)
		if err := postSaleCancellationAccountingTx(r.Context(), tx, storeID, "sale_return", partialReturnID, method, partialReturnAmount, partialCost, partialRestocked, actor); err != nil {
			writeError(w, err)
			return
		}
	}

	nextStatus := normalizeOrderStatus(previousStatus)
	clearAssignment := false
	switch input.Resolution {
	case "reassign":
		nextStatus = "ready_for_delivery"
		clearAssignment = true
	case "replace_and_continue":
		nextStatus = "preparing"
		clearAssignment = true
	case "partial_delivery":
		nextStatus = "delivered"
	case "resume":
		switch nextStatus {
		case "ready_for_delivery", "on_the_way", "preparing", "pending":
		default:
			nextStatus = "ready_for_delivery"
		}
	}

	if input.Resolution == "partial_delivery" {
		if _, err := tx.Exec(r.Context(), `
			UPDATE sales
			SET status='delivered',financial_status='partially_returned',reversed_at=now(),
				reversal_reason=$2,reversed_by=$3,updated_at=now()
			WHERE id=$1::uuid
		`, orderID, input.Note, actor.ID); err != nil {
			writeError(w, err)
			return
		}
		if _, err := tx.Exec(r.Context(), `
			UPDATE delivery_operations
			SET status='delivered',issue_note='',delivered_at=now(),
				delivered_by_name='Resolución administrativa',proof_type='manual',proof_note=$2,
				recipient_name='Entrega parcial',updated_at=now()
			WHERE sale_id=$1::uuid
		`, orderID, input.Note); err != nil {
			writeError(w, err)
			return
		}
	} else {
		if _, err := tx.Exec(r.Context(), `UPDATE sales SET status=$2,updated_at=now() WHERE id=$1::uuid`, orderID, nextStatus); err != nil {
			writeError(w, err)
			return
		}
		if _, err := tx.Exec(r.Context(), `
			UPDATE delivery_operations
			SET status=$2,
				issue_note='',
				assigned_driver_id=CASE WHEN $3 THEN NULL ELSE assigned_driver_id END,
				assigned_driver_name=CASE WHEN $3 THEN '' ELSE assigned_driver_name END,
				assigned_by=CASE WHEN $3 THEN '' ELSE assigned_by END,
				assigned_at=CASE WHEN $3 THEN NULL ELSE assigned_at END,
				accepted_at=CASE WHEN $3 THEN NULL ELSE accepted_at END,
				route_started_at=CASE WHEN $3 THEN NULL ELSE route_started_at END,
				route_position=CASE WHEN $3 THEN 0 ELSE route_position END,
				updated_at=now()
			WHERE sale_id=$1::uuid
		`, orderID, nextStatus, clearAssignment); err != nil {
			writeError(w, err)
			return
		}
	}
	if _, err := tx.Exec(r.Context(), `
		UPDATE delivery_incidents
		SET status='resolved',resolution=$2,inventory_disposition=$3,resolution_note=$4,
			resolved_at=now(),resolved_by=$5,updated_at=now()
		WHERE id=$1::uuid
	`, incidentID, input.Resolution, incidentDisposition, input.Note, actor.ID); err != nil {
		writeError(w, err)
		return
	}
	statusDetails := map[string]any{
		"previousStatus":       currentStatus,
		"incidentId":           incidentID,
		"resolution":           input.Resolution,
		"resolutionNote":       input.Note,
		"inventoryDisposition": incidentDisposition,
		"replacementItems":     replacementItems,
		"partialItems":         partialItems,
		"partialReturnId":      partialReturnID,
		"partialReturnAmount":  partialReturnAmount,
	}
	if err := recordOrderStatusTx(r.Context(), tx, storeID, customerID, orderID, nextStatus, actor, statusDetails); err != nil {
		writeError(w, err)
		return
	}
	if err := insertAuditTx(r.Context(), tx, storeID, actor, "delivery.incident.resolved", "delivery_incident", incidentID, map[string]any{
		"store_id": storeID, "order_id": orderID, "resolution": input.Resolution, "next_status": nextStatus,
		"inventory_disposition": incidentDisposition, "replacement_items": replacementItems,
		"partial_items": partialItems, "partial_return_id": partialReturnID, "partial_return_amount": partialReturnAmount,
	}); err != nil {
		writeError(w, err)
		return
	}
	if err := insertOutboxTx(r.Context(), tx, storeID, "delivery_incident", incidentID, "delivery.incident.resolved", map[string]any{
		"incidentId": incidentID, "orderId": orderID, "storeId": storeID, "resolution": input.Resolution, "status": nextStatus,
		"inventoryDisposition": incidentDisposition, "replacementItems": replacementItems,
		"partialItems": partialItems, "partialReturnId": partialReturnID, "partialReturnAmount": partialReturnAmount,
	}, fmt.Sprintf("delivery.incident.resolved:%s:%s", incidentID, input.Resolution)); err != nil {
		writeError(w, err)
		return
	}
	if input.Resolution == "replace_and_continue" {
		if err := insertOutboxTx(r.Context(), tx, storeID, "delivery_incident", incidentID, "inventory.replacement.recorded", map[string]any{
			"incidentId": incidentID, "orderId": orderID, "storeId": storeID,
			"inventoryDisposition": incidentDisposition, "inventoryRestocked": replacementRestocked,
			"items": replacementItems,
		}, "inventory.replacement.recorded:"+incidentID); err != nil {
			writeError(w, err)
			return
		}
	}
	if input.Resolution == "partial_delivery" {
		if err := insertOutboxTx(r.Context(), tx, storeID, "sale", orderID, "sale.returned", map[string]any{
			"sale_id": orderID, "return_id": partialReturnID, "store_id": storeID, "customer_id": customerID,
			"amount": partialReturnAmount, "financial_status": "partially_returned",
			"inventory_disposition": incidentDisposition, "partial_delivery": true,
		}, "sale.returned:"+partialReturnID); err != nil {
			writeError(w, err)
			return
		}
		if err := insertOutboxTx(r.Context(), tx, storeID, "delivery", orderID, "delivery.partial.completed", map[string]any{
			"orderId": orderID, "storeId": storeID, "incidentId": incidentID,
			"returnId": partialReturnID, "amount": partialReturnAmount, "items": partialItems,
		}, "delivery.partial.completed:"+incidentID); err != nil {
			writeError(w, err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}

	s.syncActiveDeliveryGeoDestination(r.Context(), orderID)
	s.invalidateTenantCache(r.Context())
	order, err := s.deliveryOrderByID(r.Context(), orderID, deliveryAudienceAdmin)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, order)
}
