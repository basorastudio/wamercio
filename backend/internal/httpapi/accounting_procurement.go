package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

type accountingLineInput struct {
	AccountID   string  `json:"account_id"`
	SystemKey   string  `json:"system_key"`
	Description string  `json:"description"`
	Debit       float64 `json:"debit"`
	Credit      float64 `json:"credit"`
}

type receiptItemInput struct {
	PurchaseOrderItemID string  `json:"purchase_order_item_id"`
	ProductID           string  `json:"product_id"`
	Quantity            float64 `json:"quantity"`
	UnitCost            float64 `json:"unit_cost"`
	LotNumber           string  `json:"lot_number"`
	ExpiryDate          string  `json:"expiry_date"`
}

func dateQuery(value string, fallback time.Time) time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	if parsed, err := time.Parse("2006-01-02", value); err == nil {
		return parsed
	}
	return fallback
}

func nullableDate(value string) any {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		return nil
	}
	return parsed
}

func journalEntryNumber(prefix string) string {
	prefix = strings.ToUpper(strings.TrimSpace(prefix))
	if prefix == "" {
		prefix = "AS"
	}
	return fmt.Sprintf("%s-%s-%06d", prefix, time.Now().Format("20060102150405"), time.Now().UnixNano()%1000000)
}

func paymentAccountingSystemKey(method string) string {
	switch normalizePaymentMethodValue(method) {
	case "cash":
		return "cash"
	case "bank_transfer":
		return "bank"
	case "card":
		return "card_clearing"
	case "store_credit", "accounts_payable":
		return "accounts_receivable"
	default:
		return "cash"
	}
}

func purchasePaymentAccountingSystemKey(method string) string {
	switch strings.ToLower(strings.TrimSpace(method)) {
	case "accounts_payable":
		return "accounts_payable"
	case "cash":
		return "cash"
	case "bank_transfer":
		return "bank"
	case "card":
		return "card_clearing"
	default:
		return ""
	}
}

func resolveAccountingAccountIDTx(ctx context.Context, tx pgx.Tx, storeID, accountID, systemKey string) (string, error) {
	accountID = strings.TrimSpace(accountID)
	systemKey = strings.TrimSpace(systemKey)
	var id string
	if accountID != "" {
		err := tx.QueryRow(ctx, `SELECT id::text FROM accounting_accounts WHERE id=$1::uuid AND store_id=$2::uuid AND active=true`, accountID, storeID).Scan(&id)
		return id, err
	}
	if systemKey == "" {
		return "", badRequest("Cada línea contable debe indicar una cuenta")
	}
	err := tx.QueryRow(ctx, `SELECT id::text FROM accounting_accounts WHERE store_id=$1::uuid AND system_key=$2 AND active=true`, storeID, systemKey).Scan(&id)
	return id, err
}

func createJournalEntryTx(ctx context.Context, tx pgx.Tx, storeID string, entryDate time.Time, description, sourceType, sourceID string, actor businessActor, status string, lines []accountingLineInput) (string, error) {
	if len(lines) < 2 {
		return "", badRequest("El asiento debe tener al menos dos líneas")
	}
	if status == "" {
		status = "posted"
	}
	if status != "draft" && status != "posted" {
		return "", badRequest("El estado del asiento no es válido")
	}
	if status == "posted" {
		var closed bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM accounting_periods WHERE store_id=$1::uuid AND status='closed' AND $2::date BETWEEN starts_on AND ends_on)`, storeID, entryDate).Scan(&closed); err != nil {
			return "", err
		}
		if closed {
			return "", apiError{status: http.StatusConflict, msg: "El período contable de esta fecha está cerrado"}
		}
	}
	debits, credits := 0.0, 0.0
	resolved := make([]accountingLineInput, 0, len(lines))
	for _, line := range lines {
		line.Debit = roundCurrency(line.Debit)
		line.Credit = roundCurrency(line.Credit)
		if line.Debit < 0 || line.Credit < 0 || (line.Debit > 0 && line.Credit > 0) || (line.Debit == 0 && line.Credit == 0) {
			return "", badRequest("Las líneas contables deben tener débito o crédito, pero no ambos")
		}
		id, err := resolveAccountingAccountIDTx(ctx, tx, storeID, line.AccountID, line.SystemKey)
		if err != nil {
			return "", err
		}
		line.AccountID = id
		resolved = append(resolved, line)
		debits += line.Debit
		credits += line.Credit
	}
	if math.Abs(debits-credits) > 0.009 || debits <= 0 {
		return "", badRequest("El asiento no está cuadrado")
	}
	if sourceID != "" {
		var existing string
		err := tx.QueryRow(ctx, `SELECT id::text FROM journal_entries WHERE store_id=$1::uuid AND source_type=$2 AND source_id=$3 AND status<>'voided' LIMIT 1`, storeID, sourceType, sourceID).Scan(&existing)
		if err == nil {
			return existing, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return "", err
		}
	}
	entryNumber := journalEntryNumber("AS")
	var entryID string
	err := tx.QueryRow(ctx, `
		INSERT INTO journal_entries (store_id,entry_number,entry_date,description,source_type,source_id,status,created_by,posted_by,posted_at)
		VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $7='posted' THEN $8 ELSE '' END,CASE WHEN $7='posted' THEN now() ELSE NULL END)
		RETURNING id::text
	`, storeID, entryNumber, entryDate, strings.TrimSpace(description), sourceType, sourceID, status, actor.ID).Scan(&entryID)
	if err != nil {
		return "", err
	}
	for _, line := range resolved {
		_, err = tx.Exec(ctx, `INSERT INTO journal_lines (journal_entry_id,account_id,description,debit,credit) VALUES ($1::uuid,$2::uuid,$3,$4,$5)`, entryID, line.AccountID, strings.TrimSpace(line.Description), line.Debit, line.Credit)
		if err != nil {
			return "", err
		}
	}
	return entryID, nil
}

func saleCostFromItems(raw json.RawMessage) float64 {
	var items []map[string]any
	if json.Unmarshal(raw, &items) != nil {
		return 0
	}
	total := 0.0
	for _, item := range items {
		quantity := itemNumber(item, "inventory_quantity", "inventoryQuantity", "quantity", "qty", "weight")
		cost := itemNumber(item, "cost", "unit_cost", "unitCost")
		total += quantity * cost
	}
	return roundCurrency(total)
}

func returnedItemsCost(raw json.RawMessage, returned []returnedSaleItem) float64 {
	var items []map[string]any
	if json.Unmarshal(raw, &items) != nil {
		return 0
	}
	costs := map[string]float64{}
	for _, item := range items {
		costs[itemText(item, "id", "product_id", "productId")] = itemNumber(item, "cost", "unit_cost", "unitCost")
	}
	total := 0.0
	for _, item := range returned {
		total += costs[item.ProductID] * item.Quantity
	}
	return roundCurrency(total)
}

func postSaleAccountingTx(ctx context.Context, tx pgx.Tx, storeID, saleID, method string, total float64, items json.RawMessage, actor businessActor) error {
	lines := []accountingLineInput{
		{SystemKey: paymentAccountingSystemKey(method), Debit: total, Description: "Cobro o cuenta por cobrar de venta"},
		{SystemKey: "sales_revenue", Credit: total, Description: "Ingreso por venta"},
	}
	cost := saleCostFromItems(items)
	if cost > 0 {
		lines = append(lines,
			accountingLineInput{SystemKey: "cost_of_goods_sold", Debit: cost, Description: "Costo de mercancía vendida"},
			accountingLineInput{SystemKey: "inventory", Credit: cost, Description: "Salida de inventario"},
		)
	}
	_, err := createJournalEntryTx(ctx, tx, storeID, time.Now(), "Venta registrada", "sale", saleID, actor, "posted", lines)
	return err
}

func postSaleReversalAccountingTx(ctx context.Context, tx pgx.Tx, storeID, sourceType, sourceID, method string, amount, cost float64, actor businessActor) error {
	lines := []accountingLineInput{
		{SystemKey: "sales_returns", Debit: amount, Description: "Anulación o devolución de venta"},
		{SystemKey: paymentAccountingSystemKey(method), Credit: amount, Description: "Reversión del cobro o cuenta por cobrar"},
	}
	if cost > 0 {
		lines = append(lines,
			accountingLineInput{SystemKey: "inventory", Debit: cost, Description: "Reposición de inventario"},
			accountingLineInput{SystemKey: "cost_of_goods_sold", Credit: cost, Description: "Reversión del costo"},
		)
	}
	_, err := createJournalEntryTx(ctx, tx, storeID, time.Now(), "Reversión de venta", sourceType, sourceID, actor, "posted", lines)
	return err
}

func postSaleCancellationAccountingTx(ctx context.Context, tx pgx.Tx, storeID, sourceType, sourceID, method string, amount, cost float64, inventoryRestocked bool, actor businessActor) error {
	lines := []accountingLineInput{
		{SystemKey: "sales_returns", Debit: amount, Description: "Anulación o devolución de venta"},
		{SystemKey: paymentAccountingSystemKey(method), Credit: amount, Description: "Reversión del cobro o cuenta por cobrar"},
	}
	if cost > 0 {
		if inventoryRestocked {
			lines = append(lines,
				accountingLineInput{SystemKey: "inventory", Debit: cost, Description: "Reposición de inventario"},
				accountingLineInput{SystemKey: "cost_of_goods_sold", Credit: cost, Description: "Reversión del costo"},
			)
		} else {
			lines = append(lines,
				accountingLineInput{SystemKey: "inventory_adjustment", Debit: cost, Description: "Merma o pérdida de inventario"},
				accountingLineInput{SystemKey: "cost_of_goods_sold", Credit: cost, Description: "Reclasificación del costo"},
			)
		}
	}
	_, err := createJournalEntryTx(ctx, tx, storeID, time.Now(), "Reversión de venta", sourceType, sourceID, actor, "posted", lines)
	return err
}

func postDeliveryReplacementAccountingTx(ctx context.Context, tx pgx.Tx, storeID, incidentID string, cost float64, actor businessActor) error {
	cost = roundCurrency(cost)
	if cost <= 0 {
		return nil
	}
	_, err := createJournalEntryTx(ctx, tx, storeID, time.Now(), "Pérdida por reemplazo de mercancía en entrega", "delivery_replacement", incidentID, actor, "posted", []accountingLineInput{
		{SystemKey: "inventory_adjustment", Debit: cost, Description: "Merma o pérdida asociada al reemplazo"},
		{SystemKey: "inventory", Credit: cost, Description: "Salida adicional de inventario para reemplazo"},
	})
	return err
}

func postCashMovementAccountingTx(ctx context.Context, tx pgx.Tx, storeID, movementID, movementType string, amount float64, actor businessActor) error {
	amount = roundCurrency(amount)
	if amount <= 0 {
		return nil
	}
	var description string
	var lines []accountingLineInput
	switch movementType {
	case "deposit", "adjustment":
		description = "Entrada manual de efectivo"
		lines = []accountingLineInput{{SystemKey: "cash", Debit: amount, Description: description}, {SystemKey: "owner_equity", Credit: amount, Description: "Aporte o ajuste de caja"}}
	case "withdrawal":
		description = "Retiro manual de efectivo"
		lines = []accountingLineInput{{SystemKey: "owner_equity", Debit: amount, Description: "Retiro del propietario"}, {SystemKey: "cash", Credit: amount, Description: description}}
	case "expense":
		description = "Gasto pagado desde caja"
		lines = []accountingLineInput{{SystemKey: "operating_expense", Debit: amount, Description: description}, {SystemKey: "cash", Credit: amount, Description: "Salida de efectivo"}}
	default:
		return nil
	}
	_, err := createJournalEntryTx(ctx, tx, storeID, time.Now(), description, "cash_movement", movementID, actor, "posted", lines)
	return err
}

func postStoreCreditPaymentAccountingTx(ctx context.Context, tx pgx.Tx, storeID, paymentID, method string, amount float64, actor businessActor) error {
	amount = roundCurrency(amount)
	if amount <= 0 {
		return nil
	}
	_, err := createJournalEntryTx(ctx, tx, storeID, time.Now(), "Cobro de cuenta por cobrar", "store_credit_payment", paymentID, actor, "posted", []accountingLineInput{
		{SystemKey: paymentAccountingSystemKey(method), Debit: amount, Description: "Cobro manual recibido"},
		{SystemKey: "accounts_receivable", Credit: amount, Description: "Reducción de cuenta por cobrar"},
	})
	return err
}

func postStoreCreditChargeAccountingTx(ctx context.Context, tx pgx.Tx, storeID, creditID string, amount float64, actor businessActor) error {
	amount = roundCurrency(amount)
	if amount <= 0 {
		return nil
	}
	_, err := createJournalEntryTx(ctx, tx, storeID, time.Now(), "Cargo manual a cuenta por cobrar", "store_credit_charge", creditID, actor, "posted", []accountingLineInput{
		{SystemKey: "accounts_receivable", Debit: amount, Description: "Cuenta por cobrar al cliente"},
		{SystemKey: "sales_revenue", Credit: amount, Description: "Ingreso registrado a crédito"},
	})
	return err
}

func postInitialInventoryAccountingTx(ctx context.Context, tx pgx.Tx, storeID, movementID string, quantity, unitCost float64, actor businessActor) error {
	value := roundCurrency(math.Abs(quantity) * math.Max(0, unitCost))
	if value <= 0 {
		return nil
	}
	_, err := createJournalEntryTx(ctx, tx, storeID, time.Now(), "Registro inicial de inventario por lote", "initial_inventory", movementID, actor, "posted", []accountingLineInput{
		{SystemKey: "inventory", Debit: value, Description: "Inventario inicial registrado"},
		{SystemKey: "owner_equity", Credit: value, Description: "Aporte inicial del propietario"},
	})
	return err
}

func postInventoryAdjustmentAccountingTx(ctx context.Context, tx pgx.Tx, storeID, movementID string, delta, unitCost float64, actor businessActor) error {
	value := roundCurrency(math.Abs(delta) * math.Max(0, unitCost))
	if value <= 0 {
		return nil
	}
	lines := []accountingLineInput{}
	description := "Ajuste de inventario"
	if delta > 0 {
		lines = append(lines,
			accountingLineInput{SystemKey: "inventory", Debit: value, Description: "Incremento de inventario"},
			accountingLineInput{SystemKey: "inventory_adjustment", Credit: value, Description: "Ganancia o corrección de inventario"},
		)
	} else {
		lines = append(lines,
			accountingLineInput{SystemKey: "inventory_adjustment", Debit: value, Description: "Pérdida o corrección de inventario"},
			accountingLineInput{SystemKey: "inventory", Credit: value, Description: "Disminución de inventario"},
		)
	}
	_, err := createJournalEntryTx(ctx, tx, storeID, time.Now(), description, "inventory_adjustment", movementID, actor, "posted", lines)
	return err
}

func postCashDifferenceAccountingTx(ctx context.Context, tx pgx.Tx, storeID, sessionID string, difference float64, actor businessActor) error {
	value := roundCurrency(math.Abs(difference))
	if value <= 0 {
		return nil
	}
	lines := []accountingLineInput{}
	if difference > 0 {
		lines = append(lines,
			accountingLineInput{SystemKey: "cash", Debit: value, Description: "Sobrante de caja"},
			accountingLineInput{SystemKey: "cash_over_short", Credit: value, Description: "Sobrante detectado en arqueo"},
		)
	} else {
		lines = append(lines,
			accountingLineInput{SystemKey: "cash_over_short", Debit: value, Description: "Faltante detectado en arqueo"},
			accountingLineInput{SystemKey: "cash", Credit: value, Description: "Ajuste por faltante de caja"},
		)
	}
	_, err := createJournalEntryTx(ctx, tx, storeID, time.Now(), "Diferencia de cierre de caja", "cash_session_difference", sessionID, actor, "posted", lines)
	return err
}

func recordBatchMovementTx(ctx context.Context, tx pgx.Tx, batchID, storeID, productID, movementType string, quantity float64, referenceType, referenceID, reason string, actor businessActor) (string, error) {
	var id string
	err := tx.QueryRow(ctx, `
		INSERT INTO product_batch_movements (
			batch_id,store_id,product_id,movement_type,quantity_delta,reference_type,reference_id,reason,actor_id,actor_role
		) VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10)
		RETURNING id::text
	`, batchID, storeID, productID, movementType, quantity, referenceType, referenceID, strings.TrimSpace(reason), actor.ID, actor.Role).Scan(&id)
	return id, err
}

func batchIsSaleable(status string, expiry *time.Time, now time.Time) bool {
	if status != "active" {
		return false
	}
	if expiry == nil {
		return true
	}
	return expiry.Format("2006-01-02") >= now.Format("2006-01-02")
}

func batchIsWrittenOff(status string) bool {
	return status == "expired" || status == "recalled"
}

func postBatchWriteoffAccountingTx(ctx context.Context, tx pgx.Tx, storeID, movementID string, quantity, unitCost float64, reverse bool, actor businessActor) error {
	value := roundCurrency(math.Abs(quantity) * math.Max(0, unitCost))
	if value <= 0 {
		return nil
	}
	description := "Baja de inventario por lote"
	sourceType := "batch_writeoff"
	lines := []accountingLineInput{
		{SystemKey: "inventory_adjustment", Debit: value, Description: "Pérdida por vencimiento o retiro"},
		{SystemKey: "inventory", Credit: value, Description: "Baja del valor del inventario"},
	}
	if reverse {
		description = "Reactivación de lote previamente dado de baja"
		sourceType = "batch_writeoff_reversal"
		lines = []accountingLineInput{
			{SystemKey: "inventory", Debit: value, Description: "Restitución del valor del inventario"},
			{SystemKey: "inventory_adjustment", Credit: value, Description: "Reversión de la baja del lote"},
		}
	}
	_, err := createJournalEntryTx(ctx, tx, storeID, time.Now(), description, sourceType, movementID, actor, "posted", lines)
	return err
}

func batchMovementTypeForStatus(status string) string {
	switch status {
	case "quarantined":
		return "quarantine"
	case "expired":
		return "expiration"
	case "recalled":
		return "recall"
	case "active":
		return "reactivation"
	default:
		return "adjustment"
	}
}

func (s *Server) applyBatchStateTransitionTx(ctx context.Context, tx pgx.Tx, batchID, requestedStatus, requestedExpiry, requestedLot, requestedNotes string, clearExpiry, replaceNotes bool, actor businessActor) error {
	var storeID, productID, oldStatus, oldLot, oldNotes string
	var oldExpiry *time.Time
	var available, unitCost float64
	err := tx.QueryRow(ctx, `
		SELECT store_id::text,product_id::text,status,lot_number,notes,expiry_date,available_quantity::double precision,unit_cost::double precision
		FROM product_batches WHERE id=$1::uuid FOR UPDATE
	`, batchID).Scan(&storeID, &productID, &oldStatus, &oldLot, &oldNotes, &oldExpiry, &available, &unitCost)
	if err != nil {
		return err
	}
	newStatus := strings.TrimSpace(requestedStatus)
	if newStatus == "" {
		newStatus = oldStatus
	}
	if newStatus != "active" && newStatus != "quarantined" && newStatus != "expired" && newStatus != "recalled" && newStatus != "depleted" {
		return badRequest("El estado del lote no es válido")
	}
	newLot := strings.TrimSpace(requestedLot)
	if newLot == "" {
		newLot = oldLot
	}
	newNotes := oldNotes
	if replaceNotes {
		newNotes = strings.TrimSpace(requestedNotes)
	} else if strings.TrimSpace(requestedNotes) != "" {
		newNotes = strings.TrimSpace(requestedNotes)
	}
	newExpiry := oldExpiry
	if clearExpiry {
		newExpiry = nil
	} else if strings.TrimSpace(requestedExpiry) != "" {
		parsed, parseErr := time.Parse("2006-01-02", strings.TrimSpace(requestedExpiry))
		if parseErr != nil {
			return badRequest("La fecha de vencimiento no es válida")
		}
		newExpiry = &parsed
	}
	now := time.Now()
	if newStatus == "active" && newExpiry != nil && newExpiry.Format("2006-01-02") < now.Format("2006-01-02") {
		return apiError{status: http.StatusConflict, msg: "No puedes activar un lote cuya fecha de vencimiento ya pasó"}
	}
	oldSaleable := batchIsSaleable(oldStatus, oldExpiry, now)
	newSaleable := batchIsSaleable(newStatus, newExpiry, now)
	oldWrittenOff := batchIsWrittenOff(oldStatus)
	newWrittenOff := batchIsWrittenOff(newStatus)

	_, err = tx.Exec(ctx, `
		UPDATE product_batches
		SET status=$2,lot_number=$3,notes=$4,expiry_date=$5,updated_at=now()
		WHERE id=$1::uuid
	`, batchID, newStatus, newLot, strings.TrimSpace(newNotes), newExpiry)
	if err != nil {
		return err
	}

	operationalDelta := 0.0
	if oldSaleable && !newSaleable {
		operationalDelta = -available
	} else if !oldSaleable && newSaleable {
		operationalDelta = available
	}
	movementType := "adjustment"
	if oldStatus != newStatus {
		movementType = batchMovementTypeForStatus(newStatus)
	} else if oldSaleable && !newSaleable {
		movementType = "expiration"
	} else if !oldSaleable && newSaleable {
		movementType = "reactivation"
	}
	movementID, err := recordBatchMovementTx(ctx, tx, batchID, storeID, productID, movementType, operationalDelta, "product_batch", batchID, "Cambio de estado del lote "+newLot, actor)
	if err != nil {
		return err
	}
	if math.Abs(operationalDelta) > 0.000001 {
		var before float64
		if err := tx.QueryRow(ctx, `SELECT stock::double precision FROM products WHERE id=$1::uuid FOR UPDATE`, productID).Scan(&before); err != nil {
			return err
		}
		after := math.Max(0, before+operationalDelta)
		actualDelta := after - before
		if _, err := tx.Exec(ctx, `UPDATE products SET stock=$2 WHERE id=$1::uuid`, productID, after); err != nil {
			return err
		}
		if math.Abs(actualDelta) > 0.000001 {
			var inventoryMovementID string
			err = tx.QueryRow(ctx, `
				INSERT INTO inventory_movements(store_id,product_id,movement_type,quantity_delta,stock_before,stock_after,reason,reference_type,reference_id,actor_id,actor_role)
				VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,'product_batch',$8::uuid,$9,$10)
				RETURNING id::text
			`, storeID, productID, movementType, actualDelta, before, after, "Cambio de disponibilidad del lote "+newLot, batchID, actor.ID, actor.Role).Scan(&inventoryMovementID)
			if err != nil {
				return err
			}
		}
	}
	if !oldWrittenOff && newWrittenOff {
		if err := postBatchWriteoffAccountingTx(ctx, tx, storeID, movementID, available, unitCost, false, actor); err != nil {
			return err
		}
	} else if oldWrittenOff && !newWrittenOff {
		if err := postBatchWriteoffAccountingTx(ctx, tx, storeID, movementID, available, unitCost, true, actor); err != nil {
			return err
		}
	}
	return insertAuditTx(ctx, tx, storeID, actor, "inventory.batch.status_changed", "product_batch", batchID, map[string]any{
		"store_id": storeID, "product_id": productID, "old_status": oldStatus, "new_status": newStatus,
		"lot_number": newLot, "expiry_date": newExpiry, "available_quantity": available,
	})
}

func (s *Server) expireTenantProductBatches(ctx context.Context) error {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	rows, err := tx.Query(ctx, `SELECT id::text FROM product_batches WHERE status='active' AND available_quantity>0 AND expiry_date<CURRENT_DATE ORDER BY expiry_date,id FOR UPDATE SKIP LOCKED`)
	if err != nil {
		return err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	actor := businessActor{ID: "system", Role: "system"}
	for _, id := range ids {
		if err := s.applyBatchStateTransitionTx(ctx, tx, id, "expired", "", "", "Vencimiento automático del lote", false, true, actor); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func reduceTrackedBatchesForAdjustmentTx(ctx context.Context, tx pgx.Tx, storeID, productID string, quantity float64, referenceID, reason string, actor businessActor) error {
	if quantity <= 0.000001 {
		return nil
	}
	rows, err := tx.Query(ctx, `
		SELECT id::text,available_quantity::double precision
		FROM product_batches
		WHERE store_id=$1::uuid AND product_id=$2::uuid AND status='active' AND available_quantity>0
		  AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE)
		ORDER BY expiry_date ASC NULLS LAST,received_at,id
		FOR UPDATE
	`, storeID, productID)
	if err != nil {
		return err
	}
	type batchQuantity struct {
		id       string
		quantity float64
	}
	batches := []batchQuantity{}
	for rows.Next() {
		var batch batchQuantity
		if err := rows.Scan(&batch.id, &batch.quantity); err != nil {
			rows.Close()
			return err
		}
		batches = append(batches, batch)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	remaining := quantity
	for _, batch := range batches {
		if remaining <= 0.000001 {
			break
		}
		used := math.Min(remaining, batch.quantity)
		if _, err := tx.Exec(ctx, `UPDATE product_batches SET available_quantity=available_quantity-$2,status=CASE WHEN available_quantity-$2<=0.000001 THEN 'depleted' ELSE status END,updated_at=now() WHERE id=$1::uuid`, batch.id, used); err != nil {
			return err
		}
		if _, err := recordBatchMovementTx(ctx, tx, batch.id, storeID, productID, "adjustment", -used, "inventory_movement", referenceID, reason, actor); err != nil {
			return err
		}
		remaining -= used
	}
	if remaining > 0.000001 {
		return apiError{status: http.StatusConflict, msg: "Los lotes vigentes no tienen cantidad suficiente para aplicar este ajuste"}
	}
	return nil
}

func consumeTrackedBatchesTx(ctx context.Context, tx pgx.Tx, storeID, saleID string, adjustments []inventoryAdjustment) error {
	for _, adjustment := range adjustments {
		var tracked bool
		if err := tx.QueryRow(ctx, `SELECT track_batches FROM products WHERE id=$1::uuid AND store_id=$2::uuid`, adjustment.ProductID, storeID).Scan(&tracked); err != nil {
			return err
		}
		if !tracked || adjustment.Quantity <= 0 {
			continue
		}
		remaining := adjustment.Quantity
		rows, err := tx.Query(ctx, `
			SELECT id::text, available_quantity::double precision
			FROM product_batches
			WHERE store_id=$1::uuid AND product_id=$2::uuid AND status='active' AND available_quantity>0
			  AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE)
			ORDER BY expiry_date ASC NULLS LAST, received_at ASC, id ASC
			FOR UPDATE
		`, storeID, adjustment.ProductID)
		if err != nil {
			return err
		}
		type batchQty struct {
			id  string
			qty float64
		}
		batches := []batchQty{}
		for rows.Next() {
			var item batchQty
			if err := rows.Scan(&item.id, &item.qty); err != nil {
				rows.Close()
				return err
			}
			batches = append(batches, item)
		}
		rows.Close()
		for _, batch := range batches {
			if remaining <= 0.000001 {
				break
			}
			used := math.Min(remaining, batch.qty)
			_, err = tx.Exec(ctx, `UPDATE product_batches SET available_quantity=available_quantity-$2,status=CASE WHEN available_quantity-$2<=0.000001 THEN 'depleted' ELSE status END,updated_at=now() WHERE id=$1::uuid`, batch.id, used)
			if err != nil {
				return err
			}
			_, err = tx.Exec(ctx, `INSERT INTO sale_batch_allocations (sale_id,product_id,batch_id,quantity) VALUES ($1::uuid,$2::uuid,$3::uuid,$4)`, saleID, adjustment.ProductID, batch.id, used)
			if err != nil {
				return err
			}
			if _, err := recordBatchMovementTx(ctx, tx, batch.id, storeID, adjustment.ProductID, "sale", -used, "sale", saleID, "Salida FEFO por venta", businessActor{ID: "system", Role: "system"}); err != nil {
				return err
			}
			remaining -= used
		}
		if remaining > 0.000001 {
			return apiError{status: http.StatusConflict, msg: "No hay lotes vigentes suficientes para completar la venta"}
		}
	}
	return nil
}

func restoreTrackedBatchesTx(ctx context.Context, tx pgx.Tx, saleID string, requested []returnedSaleItem) error {
	for _, item := range requested {
		remaining := item.Quantity
		rows, err := tx.Query(ctx, `
			SELECT allocation.id::text,allocation.batch_id::text,(allocation.quantity-allocation.restored_quantity)::double precision,batch.store_id::text
			FROM sale_batch_allocations allocation
			JOIN product_batches batch ON batch.id=allocation.batch_id
			WHERE allocation.sale_id=$1::uuid AND allocation.product_id=$2::uuid AND allocation.restored_quantity<allocation.quantity
			ORDER BY allocation.created_at DESC,allocation.id DESC FOR UPDATE OF allocation, batch
		`, saleID, item.ProductID)
		if err != nil {
			return err
		}
		type allocation struct {
			id, batchID, storeID string
			qty                  float64
		}
		items := []allocation{}
		for rows.Next() {
			var allocationItem allocation
			if err := rows.Scan(&allocationItem.id, &allocationItem.batchID, &allocationItem.qty, &allocationItem.storeID); err != nil {
				rows.Close()
				return err
			}
			items = append(items, allocationItem)
		}
		rows.Close()
		if len(items) == 0 {
			continue
		}
		for _, allocationItem := range items {
			if remaining <= 0.000001 {
				break
			}
			restored := math.Min(remaining, allocationItem.qty)
			if _, err := tx.Exec(ctx, `UPDATE sale_batch_allocations SET restored_quantity=restored_quantity+$2 WHERE id=$1::uuid`, allocationItem.id, restored); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `UPDATE product_batches SET available_quantity=available_quantity+$2,status=CASE WHEN status='depleted' THEN 'active' ELSE status END,updated_at=now() WHERE id=$1::uuid`, allocationItem.batchID, restored); err != nil {
				return err
			}
			if _, err := recordBatchMovementTx(ctx, tx, allocationItem.batchID, allocationItem.storeID, item.ProductID, "return", restored, "sale", saleID, "Reposición por devolución o anulación", businessActor{ID: "system", Role: "system"}); err != nil {
				return err
			}
			remaining -= restored
		}
	}
	return nil
}

func (s *Server) listAccountingAccounts(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	rows, err := s.db.Query(r.Context(), `SELECT id::text,code,name,account_type,normal_balance,system_key,COALESCE(parent_id::text,''),active FROM accounting_accounts WHERE store_id=$1::uuid ORDER BY code`, storeID)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, code, name, accountType, normalBalance, systemKey, parentID string
		var active bool
		if err := rows.Scan(&id, &code, &name, &accountType, &normalBalance, &systemKey, &parentID, &active); err != nil {
			writeError(w, err)
			return
		}
		items = append(items, map[string]any{"id": id, "code": code, "name": name, "account_type": accountType, "normal_balance": normalBalance, "system_key": systemKey, "parent_id": parentID, "active": active})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) createAccountingAccount(w http.ResponseWriter, r *http.Request) {
	var input struct {
		StoreID       string `json:"store_id"`
		Code          string `json:"code"`
		Name          string `json:"name"`
		AccountType   string `json:"account_type"`
		NormalBalance string `json:"normal_balance"`
		ParentID      string `json:"parent_id"`
		Active        *bool  `json:"active"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input.StoreID = strings.TrimSpace(input.StoreID)
	input.Code = strings.TrimSpace(input.Code)
	input.Name = strings.TrimSpace(input.Name)
	if input.StoreID == "" || input.Code == "" || input.Name == "" {
		writeError(w, badRequest("Completa los datos de la cuenta"))
		return
	}
	if input.NormalBalance == "" {
		if input.AccountType == "asset" || input.AccountType == "expense" {
			input.NormalBalance = "debit"
		} else {
			input.NormalBalance = "credit"
		}
	}
	active := true
	if input.Active != nil {
		active = *input.Active
	}
	var id string
	err := s.db.QueryRow(r.Context(), `INSERT INTO accounting_accounts(store_id,code,name,account_type,normal_balance,parent_id,active) VALUES($1::uuid,$2,$3,$4,$5,NULLIF($6,'')::uuid,$7) RETURNING id::text`, input.StoreID, input.Code, input.Name, input.AccountType, input.NormalBalance, input.ParentID, active).Scan(&id)
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditBusiness(r.Context(), "accounting.account.created", "accounting_account", id, map[string]any{"store_id": input.StoreID, "code": input.Code})
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (s *Server) updateAccountingAccount(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name   string `json:"name"`
		Active *bool  `json:"active"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	id := chi.URLParam(r, "id")
	_, err := s.db.Exec(r.Context(), `UPDATE accounting_accounts SET name=COALESCE(NULLIF($2,''),name),active=COALESCE($3,active),updated_at=now() WHERE id=$1::uuid AND system_key=''`, id, strings.TrimSpace(input.Name), input.Active)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"updated": true})
}

func scanJournalEntries(ctx context.Context, db interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, query string, args ...any) ([]map[string]any, error) {
	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, storeID, number, description, sourceType, sourceID, status, createdBy, postedBy string
		var entryDate time.Time
		var createdAt time.Time
		var postedAt *time.Time
		var debit, credit float64
		if err := rows.Scan(&id, &storeID, &number, &entryDate, &description, &sourceType, &sourceID, &status, &createdBy, &postedBy, &createdAt, &postedAt, &debit, &credit); err != nil {
			return nil, err
		}
		items = append(items, map[string]any{"id": id, "store_id": storeID, "entry_number": number, "entry_date": entryDate, "description": description, "source_type": sourceType, "source_id": sourceID, "status": status, "created_by": createdBy, "posted_by": postedBy, "created_at": createdAt, "posted_at": postedAt, "debit": debit, "credit": credit})
	}
	return items, rows.Err()
}

func (s *Server) listJournalEntries(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	limit := pageSizeFromRequest(r)
	offset := pageOffsetFromRequest(r)
	items, err := scanJournalEntries(r.Context(), s.db, `
		SELECT e.id::text,e.store_id::text,e.entry_number,e.entry_date,e.description,e.source_type,e.source_id,e.status,e.created_by,e.posted_by,e.created_at,e.posted_at,
		COALESCE(SUM(l.debit),0)::double precision,COALESCE(SUM(l.credit),0)::double precision
		FROM journal_entries e LEFT JOIN journal_lines l ON l.journal_entry_id=e.id
		WHERE e.store_id=$1::uuid GROUP BY e.id ORDER BY e.entry_date DESC,e.created_at DESC LIMIT $2 OFFSET $3`, storeID, limit, offset)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "has_more": len(items) == limit, "limit": limit, "offset": offset})
}

func (s *Server) journalEntryDetail(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var entry map[string]any
	items, err := scanJournalEntries(r.Context(), s.db, `
		SELECT e.id::text,e.store_id::text,e.entry_number,e.entry_date,e.description,e.source_type,e.source_id,e.status,e.created_by,e.posted_by,e.created_at,e.posted_at,
		COALESCE(SUM(l.debit),0)::double precision,COALESCE(SUM(l.credit),0)::double precision
		FROM journal_entries e LEFT JOIN journal_lines l ON l.journal_entry_id=e.id WHERE e.id=$1::uuid GROUP BY e.id`, id)
	if err != nil {
		writeError(w, err)
		return
	}
	if len(items) == 0 {
		writeError(w, pgx.ErrNoRows)
		return
	}
	entry = items[0]
	rows, err := s.db.Query(r.Context(), `SELECT l.id::text,a.id::text,a.code,a.name,l.description,l.debit::double precision,l.credit::double precision FROM journal_lines l JOIN accounting_accounts a ON a.id=l.account_id WHERE l.journal_entry_id=$1::uuid ORDER BY a.code,l.id`, id)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	lines := []map[string]any{}
	for rows.Next() {
		var lineID, accountID, code, name, description string
		var debit, credit float64
		if err := rows.Scan(&lineID, &accountID, &code, &name, &description, &debit, &credit); err != nil {
			writeError(w, err)
			return
		}
		lines = append(lines, map[string]any{"id": lineID, "account_id": accountID, "account_code": code, "account_name": name, "description": description, "debit": debit, "credit": credit})
	}
	entry["lines"] = lines
	writeJSON(w, http.StatusOK, entry)
}

func (s *Server) createJournalEntry(w http.ResponseWriter, r *http.Request) {
	var input struct {
		StoreID     string                `json:"store_id"`
		EntryDate   string                `json:"entry_date"`
		Description string                `json:"description"`
		Post        bool                  `json:"post"`
		Lines       []accountingLineInput `json:"lines"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input.StoreID = strings.TrimSpace(input.StoreID)
	input.Description = strings.TrimSpace(input.Description)
	if input.StoreID == "" || input.Description == "" {
		writeError(w, badRequest("Completa la fecha, descripción y líneas del asiento"))
		return
	}
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	status := "draft"
	if input.Post {
		status = "posted"
	}
	id, err := createJournalEntryTx(r.Context(), tx, input.StoreID, dateQuery(input.EntryDate, time.Now()), input.Description, "manual", "", actorFromContext(r.Context()), status, input.Lines)
	if err != nil {
		writeError(w, err)
		return
	}
	if err := insertAuditTx(r.Context(), tx, input.StoreID, actorFromContext(r.Context()), "accounting.entry.created", "journal_entry", id, map[string]any{"store_id": input.StoreID, "status": status}); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "status": status})
}

func (s *Server) postJournalEntry(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	actor := actorFromContext(r.Context())
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var storeID, status string
	var entryDate time.Time
	err = tx.QueryRow(r.Context(), `SELECT store_id::text,status,entry_date FROM journal_entries WHERE id=$1::uuid FOR UPDATE`, id).Scan(&storeID, &status, &entryDate)
	if err != nil {
		writeError(w, err)
		return
	}
	if status != "draft" {
		writeError(w, apiError{status: http.StatusConflict, msg: "Solo los asientos en borrador pueden publicarse"})
		return
	}
	var debit, credit float64
	if err := tx.QueryRow(r.Context(), `SELECT COALESCE(SUM(debit),0)::double precision,COALESCE(SUM(credit),0)::double precision FROM journal_lines WHERE journal_entry_id=$1::uuid`, id).Scan(&debit, &credit); err != nil {
		writeError(w, err)
		return
	}
	if math.Abs(debit-credit) > 0.009 || debit <= 0 {
		writeError(w, badRequest("El asiento no está cuadrado"))
		return
	}
	var closed bool
	if err := tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM accounting_periods WHERE store_id=$1::uuid AND status='closed' AND $2 BETWEEN starts_on AND ends_on)`, storeID, entryDate).Scan(&closed); err != nil {
		writeError(w, err)
		return
	}
	if closed {
		writeError(w, apiError{status: http.StatusConflict, msg: "El período contable está cerrado"})
		return
	}
	_, err = tx.Exec(r.Context(), `UPDATE journal_entries SET status='posted',posted_by=$2,posted_at=now(),updated_at=now() WHERE id=$1::uuid`, id, actor.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "status": "posted"})
}

func (s *Server) voidJournalEntry(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Reason string `json:"reason"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if len(strings.TrimSpace(input.Reason)) < 5 {
		writeError(w, badRequest("Indica el motivo de anulación"))
		return
	}
	id := chi.URLParam(r, "id")
	actor := actorFromContext(r.Context())
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var storeID, status, description string
	var entryDate time.Time
	err = tx.QueryRow(r.Context(), `SELECT store_id::text,status,description,entry_date FROM journal_entries WHERE id=$1::uuid FOR UPDATE`, id).Scan(&storeID, &status, &description, &entryDate)
	if err != nil {
		writeError(w, err)
		return
	}
	if status != "posted" {
		writeError(w, apiError{status: http.StatusConflict, msg: "Solo los asientos publicados pueden anularse"})
		return
	}
	rows, err := tx.Query(r.Context(), `SELECT account_id::text,description,debit::double precision,credit::double precision FROM journal_lines WHERE journal_entry_id=$1::uuid`, id)
	if err != nil {
		writeError(w, err)
		return
	}
	lines := []accountingLineInput{}
	for rows.Next() {
		var accountID, lineDescription string
		var debit, credit float64
		if err := rows.Scan(&accountID, &lineDescription, &debit, &credit); err != nil {
			rows.Close()
			writeError(w, err)
			return
		}
		lines = append(lines, accountingLineInput{AccountID: accountID, Description: "Reversión: " + lineDescription, Debit: credit, Credit: debit})
	}
	rows.Close()
	reversalID, err := createJournalEntryTx(r.Context(), tx, storeID, time.Now(), "Reversión de "+description+": "+strings.TrimSpace(input.Reason), "journal_reversal", id, actor, "posted", lines)
	if err != nil {
		writeError(w, err)
		return
	}
	_, err = tx.Exec(r.Context(), `UPDATE journal_entries SET status='voided',voided_at=now(),updated_at=now() WHERE id=$1::uuid`, id)
	if err != nil {
		writeError(w, err)
		return
	}
	_, err = tx.Exec(r.Context(), `UPDATE journal_entries SET reversal_of=$2::uuid WHERE id=$1::uuid`, reversalID, id)
	if err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "status": "voided", "reversal_id": reversalID})
}

func accountingBalances(ctx context.Context, db interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, storeID string, from, to time.Time) ([]map[string]any, error) {
	rows, err := db.Query(ctx, `
		SELECT a.id::text,a.code,a.name,a.account_type,a.normal_balance,
		COALESCE(SUM(CASE WHEN e.status='posted' AND e.entry_date BETWEEN $2::date AND $3::date THEN l.debit ELSE 0 END),0)::double precision AS debit,
		COALESCE(SUM(CASE WHEN e.status='posted' AND e.entry_date BETWEEN $2::date AND $3::date THEN l.credit ELSE 0 END),0)::double precision AS credit,
		COALESCE(SUM(CASE WHEN e.status='posted' AND e.entry_date <= $3::date THEN l.debit ELSE 0 END),0)::double precision AS cumulative_debit,
		COALESCE(SUM(CASE WHEN e.status='posted' AND e.entry_date <= $3::date THEN l.credit ELSE 0 END),0)::double precision AS cumulative_credit
		FROM accounting_accounts a LEFT JOIN journal_lines l ON l.account_id=a.id LEFT JOIN journal_entries e ON e.id=l.journal_entry_id
		WHERE a.store_id=$1::uuid AND a.active=true GROUP BY a.id ORDER BY a.code`, storeID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, code, name, accountType, normal string
		var debit, credit, cumDebit, cumCredit float64
		if err := rows.Scan(&id, &code, &name, &accountType, &normal, &debit, &credit, &cumDebit, &cumCredit); err != nil {
			return nil, err
		}
		periodBalance := debit - credit
		cumBalance := cumDebit - cumCredit
		if normal == "credit" {
			periodBalance = -periodBalance
			cumBalance = -cumBalance
		}
		items = append(items, map[string]any{"id": id, "code": code, "name": name, "account_type": accountType, "normal_balance": normal, "debit": debit, "credit": credit, "period_balance": periodBalance, "balance": cumBalance})
	}
	return items, rows.Err()
}

func (s *Server) accountingDashboard(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	now := time.Now()
	from := dateQuery(r.URL.Query().Get("from"), time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()))
	to := dateQuery(r.URL.Query().Get("to"), now)
	balances, err := accountingBalances(r.Context(), s.db, storeID, from, to)
	if err != nil {
		writeError(w, err)
		return
	}
	totals := map[string]float64{"assets": 0, "liabilities": 0, "equity": 0, "revenue": 0, "expenses": 0}
	for _, item := range balances {
		value, _ := item["balance"].(float64)
		period, _ := item["period_balance"].(float64)
		switch item["account_type"] {
		case "asset":
			totals["assets"] += value
		case "liability":
			totals["liabilities"] += value
		case "equity":
			totals["equity"] += value
		case "revenue":
			totals["revenue"] += period
		case "expense":
			totals["expenses"] += period
		}
	}
	totals["net_income"] = totals["revenue"] - totals["expenses"]
	writeJSON(w, http.StatusOK, map[string]any{"from": from.Format("2006-01-02"), "to": to.Format("2006-01-02"), "totals": totals, "accounts": balances})
}

func (s *Server) accountingTrialBalance(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	to := dateQuery(r.URL.Query().Get("to"), time.Now())
	from := time.Date(1900, 1, 1, 0, 0, 0, 0, time.UTC)
	items, err := accountingBalances(r.Context(), s.db, storeID, from, to)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"to": to.Format("2006-01-02"), "items": items})
}

func (s *Server) listAccountingPeriods(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	if storeID == "" {
		writeError(w, badRequest("Debes seleccionar el negocio"))
		return
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT id::text,name,starts_on,ends_on,status,closed_by,closed_at,created_at
		FROM accounting_periods WHERE store_id=$1::uuid ORDER BY starts_on DESC,created_at DESC
	`, storeID)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, name, status, closedBy string
		var startsOn, endsOn, createdAt time.Time
		var closedAt *time.Time
		if err := rows.Scan(&id, &name, &startsOn, &endsOn, &status, &closedBy, &closedAt, &createdAt); err != nil {
			writeError(w, err)
			return
		}
		items = append(items, map[string]any{"id": id, "name": name, "starts_on": startsOn, "ends_on": endsOn, "status": status, "closed_by": closedBy, "closed_at": closedAt, "created_at": createdAt})
	}
	if err := rows.Err(); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) createAccountingPeriod(w http.ResponseWriter, r *http.Request) {
	var input struct {
		StoreID  string `json:"store_id"`
		Name     string `json:"name"`
		StartsOn string `json:"starts_on"`
		EndsOn   string `json:"ends_on"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input.StoreID = strings.TrimSpace(input.StoreID)
	input.Name = strings.TrimSpace(input.Name)
	starts := dateQuery(input.StartsOn, time.Time{})
	ends := dateQuery(input.EndsOn, time.Time{})
	if input.StoreID == "" || input.Name == "" || starts.IsZero() || ends.IsZero() || ends.Before(starts) {
		writeError(w, badRequest("El período contable no es válido"))
		return
	}
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var overlaps bool
	if err := tx.QueryRow(r.Context(), `
		SELECT EXISTS(
			SELECT 1 FROM accounting_periods
			WHERE store_id=$1::uuid AND daterange(starts_on,ends_on,'[]') && daterange($2::date,$3::date,'[]')
		)
	`, input.StoreID, starts, ends).Scan(&overlaps); err != nil {
		writeError(w, err)
		return
	}
	if overlaps {
		writeError(w, apiError{status: http.StatusConflict, msg: "El período se superpone con otro período contable"})
		return
	}
	var id string
	if err := tx.QueryRow(r.Context(), `INSERT INTO accounting_periods(store_id,name,starts_on,ends_on) VALUES($1::uuid,$2,$3,$4) RETURNING id::text`, input.StoreID, input.Name, starts, ends).Scan(&id); err != nil {
		writeError(w, err)
		return
	}
	actor := actorFromContext(r.Context())
	if err := insertAuditTx(r.Context(), tx, input.StoreID, actor, "accounting.period.created", "accounting_period", id, map[string]any{"store_id": input.StoreID, "name": input.Name, "starts_on": starts, "ends_on": ends}); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (s *Server) closeAccountingPeriod(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	actor := actorFromContext(r.Context())
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var storeID, status, name string
	var starts, ends time.Time
	if err := tx.QueryRow(r.Context(), `SELECT store_id::text,status,name,starts_on,ends_on FROM accounting_periods WHERE id=$1::uuid FOR UPDATE`, id).Scan(&storeID, &status, &name, &starts, &ends); err != nil {
		writeError(w, err)
		return
	}
	if status != "open" {
		writeError(w, apiError{status: http.StatusConflict, msg: "El período ya está cerrado"})
		return
	}
	var drafts int
	if err := tx.QueryRow(r.Context(), `SELECT count(*) FROM journal_entries WHERE store_id=$1::uuid AND status='draft' AND entry_date BETWEEN $2::date AND $3::date`, storeID, starts, ends).Scan(&drafts); err != nil {
		writeError(w, err)
		return
	}
	if drafts > 0 {
		writeError(w, apiError{status: http.StatusConflict, msg: "Publica o elimina los asientos en borrador antes de cerrar el período"})
		return
	}
	if _, err := tx.Exec(r.Context(), `UPDATE accounting_periods SET status='closed',closed_by=$2,closed_at=now() WHERE id=$1::uuid`, id, actor.ID); err != nil {
		writeError(w, err)
		return
	}
	if err := insertAuditTx(r.Context(), tx, storeID, actor, "accounting.period.closed", "accounting_period", id, map[string]any{"store_id": storeID, "name": name, "starts_on": starts, "ends_on": ends}); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "status": "closed"})
}

func (s *Server) listSuppliers(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	rows, err := s.db.Query(r.Context(), `SELECT id::text,name,tax_id,contact_name,whatsapp,email,address,notes,active,created_at,updated_at FROM suppliers WHERE store_id=$1::uuid ORDER BY active DESC,name`, storeID)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, name, taxID, contact, whatsapp, email, address, notes string
		var active bool
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&id, &name, &taxID, &contact, &whatsapp, &email, &address, &notes, &active, &createdAt, &updatedAt); err != nil {
			writeError(w, err)
			return
		}
		items = append(items, map[string]any{"id": id, "name": name, "tax_id": taxID, "contact_name": contact, "whatsapp": whatsapp, "email": email, "address": address, "notes": notes, "active": active, "created_at": createdAt, "updated_at": updatedAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) createSupplier(w http.ResponseWriter, r *http.Request) {
	var input struct {
		StoreID     string `json:"store_id"`
		Name        string `json:"name"`
		TaxID       string `json:"tax_id"`
		ContactName string `json:"contact_name"`
		Whatsapp    string `json:"whatsapp"`
		Email       string `json:"email"`
		Address     string `json:"address"`
		Notes       string `json:"notes"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if strings.TrimSpace(input.StoreID) == "" || strings.TrimSpace(input.Name) == "" {
		writeError(w, badRequest("Indica el negocio y nombre del proveedor"))
		return
	}
	var id string
	err := s.db.QueryRow(r.Context(), `INSERT INTO suppliers(store_id,name,tax_id,contact_name,whatsapp,email,address,notes) VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8) RETURNING id::text`, input.StoreID, strings.TrimSpace(input.Name), strings.TrimSpace(input.TaxID), strings.TrimSpace(input.ContactName), strings.TrimSpace(input.Whatsapp), strings.TrimSpace(input.Email), strings.TrimSpace(input.Address), strings.TrimSpace(input.Notes)).Scan(&id)
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditBusiness(r.Context(), "supplier.created", "supplier", id, map[string]any{"store_id": input.StoreID, "name": input.Name})
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (s *Server) updateSupplier(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	encoded, err := marshalJSONDatabaseValue(input)
	if err != nil {
		writeError(w, err)
		return
	}
	id := chi.URLParam(r, "id")
	_, err = s.db.Exec(r.Context(), `
		UPDATE suppliers SET
		name=COALESCE(NULLIF($2::jsonb->>'name',''),name),tax_id=COALESCE($2::jsonb->>'tax_id',tax_id),contact_name=COALESCE($2::jsonb->>'contact_name',contact_name),whatsapp=COALESCE($2::jsonb->>'whatsapp',whatsapp),email=COALESCE($2::jsonb->>'email',email),address=COALESCE($2::jsonb->>'address',address),notes=COALESCE($2::jsonb->>'notes',notes),active=COALESCE(($2::jsonb->>'active')::boolean,active),updated_at=now() WHERE id=$1::uuid`, id, encoded)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"updated": true})
}

func (s *Server) updateProductReorderPolicy(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ReorderPoint        float64 `json:"reorder_point"`
		ReorderTarget       float64 `json:"reorder_target"`
		SafetyStock         float64 `json:"safety_stock"`
		LeadTimeDays        int     `json:"lead_time_days"`
		PreferredSupplierID string  `json:"preferred_supplier_id"`
		TrackBatches        *bool   `json:"track_batches"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if input.ReorderPoint < 0 || input.ReorderTarget < 0 || input.SafetyStock < 0 || input.LeadTimeDays < 0 || input.LeadTimeDays > 365 {
		writeError(w, badRequest("La política de reposición no es válida"))
		return
	}
	productID := chi.URLParam(r, "id")
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var storeID, productName string
	var stock, cost float64
	var currentlyTracked bool
	err = tx.QueryRow(r.Context(), `SELECT store_id::text,name,stock::double precision,cost::double precision,track_batches FROM products WHERE id=$1::uuid FOR UPDATE`, productID).Scan(&storeID, &productName, &stock, &cost, &currentlyTracked)
	if err != nil {
		writeError(w, err)
		return
	}
	input.PreferredSupplierID = strings.TrimSpace(input.PreferredSupplierID)
	if input.PreferredSupplierID != "" {
		var valid bool
		if err := tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM suppliers WHERE id=$1::uuid AND store_id=$2::uuid AND active=true)`, input.PreferredSupplierID, storeID).Scan(&valid); err != nil {
			writeError(w, err)
			return
		}
		if !valid {
			writeError(w, badRequest("El proveedor seleccionado no pertenece a este negocio"))
			return
		}
	}
	newTracked := currentlyTracked
	if input.TrackBatches != nil {
		newTracked = *input.TrackBatches
	}
	if currentlyTracked && !newTracked {
		var available float64
		if err := tx.QueryRow(r.Context(), `SELECT COALESCE(SUM(available_quantity),0)::double precision FROM product_batches WHERE product_id=$1::uuid AND status<>'depleted'`, productID).Scan(&available); err != nil {
			writeError(w, err)
			return
		}
		if available > 0.000001 {
			writeError(w, apiError{status: http.StatusConflict, msg: "No puedes desactivar el control por lotes mientras existan cantidades registradas"})
			return
		}
	}
	_, err = tx.Exec(r.Context(), `
		UPDATE products SET reorder_point=$2,reorder_target=$3,safety_stock=$4,lead_time_days=$5,
		preferred_supplier_id=NULLIF($6,'')::uuid,track_batches=$7 WHERE id=$1::uuid
	`, productID, input.ReorderPoint, input.ReorderTarget, input.SafetyStock, input.LeadTimeDays, input.PreferredSupplierID, newTracked)
	if err != nil {
		writeError(w, err)
		return
	}
	actor := actorFromContext(r.Context())
	if !currentlyTracked && newTracked && stock > 0.000001 {
		var existing int
		if err := tx.QueryRow(r.Context(), `SELECT count(*) FROM product_batches WHERE product_id=$1::uuid`, productID).Scan(&existing); err != nil {
			writeError(w, err)
			return
		}
		if existing == 0 {
			lotNumber := "INICIAL-" + time.Now().Format("20060102")
			var batchID string
			err = tx.QueryRow(r.Context(), `
				INSERT INTO product_batches(store_id,product_id,lot_number,initial_quantity,available_quantity,unit_cost,notes)
				VALUES($1::uuid,$2::uuid,$3,$4,$4,$5,'Lote inicial creado al activar el control por lotes')
				RETURNING id::text
			`, storeID, productID, lotNumber, stock, cost).Scan(&batchID)
			if err != nil {
				writeError(w, err)
				return
			}
			if _, err := recordBatchMovementTx(r.Context(), tx, batchID, storeID, productID, "initial", stock, "product", productID, "Conversión de existencia actual a lote inicial", actor); err != nil {
				writeError(w, err)
				return
			}
		}
	}
	if err := insertAuditTx(r.Context(), tx, storeID, actor, "inventory.reorder_policy.updated", "product", productID, map[string]any{
		"store_id": storeID, "product_name": productName, "reorder_point": input.ReorderPoint,
		"reorder_target": input.ReorderTarget, "safety_stock": input.SafetyStock,
		"lead_time_days": input.LeadTimeDays, "preferred_supplier_id": input.PreferredSupplierID,
		"track_batches": newTracked,
	}); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	s.invalidateTenantCache(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{"updated": true, "track_batches": newTracked})
}

func (s *Server) refreshPurchaseSuggestions(ctx context.Context, storeID string) (int, error) {
	storeID = strings.TrimSpace(storeID)
	if storeID == "" {
		return 0, badRequest("Debes seleccionar el negocio")
	}
	if err := s.expireTenantProductBatches(ctx); err != nil {
		return 0, err
	}
	type productInfo struct {
		ID, Name, Format, SupplierID string
		Stock, Point, Target, Safety float64
		Lead                         int
	}
	rows, err := s.db.Query(ctx, `SELECT id::text,name,format,stock::double precision,reorder_point::double precision,reorder_target::double precision,safety_stock::double precision,lead_time_days,COALESCE(preferred_supplier_id::text,'') FROM products WHERE store_id=$1::uuid ORDER BY name`, storeID)
	if err != nil {
		return 0, err
	}
	products := []productInfo{}
	for rows.Next() {
		var p productInfo
		if err := rows.Scan(&p.ID, &p.Name, &p.Format, &p.Stock, &p.Point, &p.Target, &p.Safety, &p.Lead, &p.SupplierID); err != nil {
			rows.Close()
			return 0, err
		}
		products = append(products, p)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, err
	}
	rows.Close()

	salesRows, err := s.db.Query(ctx, `SELECT items FROM sales WHERE store_id=$1::uuid AND financial_status NOT IN ('voided','returned') AND date>=now()-interval '30 days'`, storeID)
	if err != nil {
		return 0, err
	}
	sold := map[string]float64{}
	for salesRows.Next() {
		var raw json.RawMessage
		if err := salesRows.Scan(&raw); err != nil {
			salesRows.Close()
			return 0, err
		}
		var items []map[string]any
		if json.Unmarshal(raw, &items) == nil {
			for _, item := range items {
				sold[itemText(item, "id", "product_id", "productId")] += itemNumber(item, "inventory_quantity", "inventoryQuantity", "quantity", "qty", "weight")
			}
		}
	}
	if err := salesRows.Err(); err != nil {
		salesRows.Close()
		return 0, err
	}
	salesRows.Close()

	onOrder := map[string]float64{}
	orderRows, err := s.db.Query(ctx, `SELECT i.product_id::text,COALESCE(SUM(i.quantity_ordered-i.quantity_received),0)::double precision FROM purchase_order_items i JOIN purchase_orders o ON o.id=i.purchase_order_id WHERE o.store_id=$1::uuid AND o.status IN ('draft','submitted','partially_received') GROUP BY i.product_id`, storeID)
	if err != nil {
		return 0, err
	}
	for orderRows.Next() {
		var id string
		var quantity float64
		if err := orderRows.Scan(&id, &quantity); err != nil {
			orderRows.Close()
			return 0, err
		}
		onOrder[id] = quantity
	}
	if err := orderRows.Err(); err != nil {
		orderRows.Close()
		return 0, err
	}
	orderRows.Close()

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	count := 0
	for _, p := range products {
		averageDailySales := sold[p.ID] / 30
		reorderPoint := p.Point
		if reorderPoint <= 0 {
			reorderPoint = averageDailySales*float64(maxInt(p.Lead, 1)) + p.Safety
			if reorderPoint < 5 && !formatUsesWeight(p.Format) {
				reorderPoint = 5
			}
		}
		target := p.Target
		if target <= reorderPoint {
			target = math.Max(reorderPoint*2, averageDailySales*float64(p.Lead+14)+p.Safety)
		}
		available := p.Stock + onOrder[p.ID]
		suggested := target - available
		if suggested <= 0 || available > reorderPoint {
			if _, err := tx.Exec(ctx, `UPDATE purchase_suggestions SET status=CASE WHEN status='pending' THEN 'dismissed' ELSE status END,current_stock=$3,on_order_quantity=$4,average_daily_sales=$5,reorder_point=$6,target_stock=$7,suggested_quantity=0,reason='Existencia suficiente',generated_at=now(),updated_at=now() WHERE store_id=$1::uuid AND product_id=$2::uuid`, storeID, p.ID, p.Stock, onOrder[p.ID], averageDailySales, reorderPoint, target); err != nil {
				return 0, err
			}
			continue
		}
		suggested = normalizeInventoryStock(suggested, p.Format)
		reason := fmt.Sprintf("Existencia %.2f; punto de reposición %.2f; venta diaria %.2f", p.Stock, reorderPoint, averageDailySales)
		if _, err := tx.Exec(ctx, `
			INSERT INTO purchase_suggestions(store_id,product_id,supplier_id,current_stock,on_order_quantity,average_daily_sales,reorder_point,target_stock,suggested_quantity,reason,status,generated_at,updated_at)
			VALUES($1::uuid,$2::uuid,NULLIF($3,'')::uuid,$4,$5,$6,$7,$8,$9,$10,'pending',now(),now())
			ON CONFLICT(store_id,product_id) DO UPDATE SET supplier_id=EXCLUDED.supplier_id,current_stock=EXCLUDED.current_stock,on_order_quantity=EXCLUDED.on_order_quantity,average_daily_sales=EXCLUDED.average_daily_sales,reorder_point=EXCLUDED.reorder_point,target_stock=EXCLUDED.target_stock,suggested_quantity=EXCLUDED.suggested_quantity,reason=EXCLUDED.reason,status=CASE WHEN purchase_suggestions.dismissed_until IS NOT NULL AND purchase_suggestions.dismissed_until>CURRENT_DATE THEN purchase_suggestions.status ELSE 'pending' END,generated_at=now(),updated_at=now()
		`, storeID, p.ID, p.SupplierID, p.Stock, onOrder[p.ID], averageDailySales, reorderPoint, target, suggested, reason); err != nil {
			return 0, err
		}
		count++
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return count, nil
}

func (s *Server) generatePurchaseSuggestions(w http.ResponseWriter, r *http.Request) {
	var input struct {
		StoreID string `json:"store_id"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	count, err := s.refreshPurchaseSuggestions(r.Context(), input.StoreID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"generated": count})
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func (s *Server) listPurchaseSuggestions(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	if storeID == "" {
		writeError(w, badRequest("Debes seleccionar el negocio"))
		return
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT s.id::text,s.product_id::text,p.name,p.format,p.stock::double precision,s.current_stock::double precision,s.on_order_quantity::double precision,s.average_daily_sales::double precision,s.reorder_point::double precision,s.target_stock::double precision,s.suggested_quantity::double precision,s.reason,s.status,COALESCE(s.supplier_id::text,''),COALESCE(sp.name,''),s.generated_at
		FROM purchase_suggestions s JOIN products p ON p.id=s.product_id LEFT JOIN suppliers sp ON sp.id=s.supplier_id WHERE s.store_id=$1::uuid ORDER BY CASE s.status WHEN 'pending' THEN 0 WHEN 'ordered' THEN 1 ELSE 2 END,s.suggested_quantity DESC,p.name`, storeID)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, productID, name, format, reason, status, supplierID, supplierName string
		var stock, current, onOrder, avg, point, target, suggested float64
		var generatedAt time.Time
		if err := rows.Scan(&id, &productID, &name, &format, &stock, &current, &onOrder, &avg, &point, &target, &suggested, &reason, &status, &supplierID, &supplierName, &generatedAt); err != nil {
			writeError(w, err)
			return
		}
		items = append(items, map[string]any{"id": id, "product_id": productID, "product_name": name, "format": format, "stock": stock, "current_stock": current, "on_order_quantity": onOrder, "average_daily_sales": avg, "reorder_point": point, "target_stock": target, "suggested_quantity": suggested, "reason": reason, "status": status, "supplier_id": supplierID, "supplier_name": supplierName, "generated_at": generatedAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) updatePurchaseSuggestion(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Action string `json:"action"`
		Days   int    `json:"days"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	id := chi.URLParam(r, "id")
	switch input.Action {
	case "dismiss":
		if input.Days <= 0 {
			input.Days = 7
		}
		_, _ = s.db.Exec(r.Context(), `UPDATE purchase_suggestions SET status='dismissed',dismissed_until=CURRENT_DATE+$2,updated_at=now() WHERE id=$1::uuid`, id, input.Days)
	case "pending":
		_, _ = s.db.Exec(r.Context(), `UPDATE purchase_suggestions SET status='pending',dismissed_until=NULL,updated_at=now() WHERE id=$1::uuid`, id)
	default:
		writeError(w, badRequest("La acción no es válida"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"updated": true})
}

func (s *Server) createPurchaseOrder(w http.ResponseWriter, r *http.Request) {
	var input struct {
		StoreID       string `json:"store_id"`
		SupplierID    string `json:"supplier_id"`
		ExpectedDate  string `json:"expected_date"`
		Notes         string `json:"notes"`
		PaymentMethod string `json:"payment_method"`
		Items         []struct {
			ProductID string  `json:"product_id"`
			Quantity  float64 `json:"quantity"`
			UnitCost  float64 `json:"unit_cost"`
		} `json:"items"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if strings.TrimSpace(input.StoreID) == "" || len(input.Items) == 0 {
		writeError(w, badRequest("Selecciona proveedor y productos"))
		return
	}
	if input.PaymentMethod == "" {
		input.PaymentMethod = "accounts_payable"
	}
	if purchasePaymentAccountingSystemKey(input.PaymentMethod) == "" {
		writeError(w, badRequest("El método de pago no es válido"))
		return
	}
	if input.PaymentMethod == "accounts_payable" && strings.TrimSpace(input.SupplierID) == "" {
		writeError(w, badRequest("Selecciona un proveedor para registrar la compra a crédito"))
		return
	}
	actor := actorFromContext(r.Context())
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	if strings.TrimSpace(input.ExpectedDate) != "" && nullableDate(input.ExpectedDate) == nil {
		writeError(w, badRequest("La fecha esperada de la orden no es válida"))
		return
	}
	if strings.TrimSpace(input.SupplierID) != "" {
		var validSupplier bool
		if err := tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM suppliers WHERE id=$1::uuid AND store_id=$2::uuid AND active=true)`, input.SupplierID, input.StoreID).Scan(&validSupplier); err != nil {
			writeError(w, err)
			return
		}
		if !validSupplier {
			writeError(w, badRequest("El proveedor seleccionado no pertenece a este negocio o está inactivo"))
			return
		}
	}
	number := journalEntryNumber("OC")
	subtotal := 0.0
	for _, item := range input.Items {
		if item.Quantity <= 0 || item.UnitCost < 0 {
			writeError(w, badRequest("Las cantidades de compra no son válidas"))
			return
		}
		subtotal += item.Quantity * item.UnitCost
	}
	var id string
	err = tx.QueryRow(r.Context(), `INSERT INTO purchase_orders(store_id,supplier_id,order_number,expected_date,notes,payment_method,subtotal,created_by) VALUES($1::uuid,NULLIF($2,'')::uuid,$3,$4,$5,$6,$7,$8) RETURNING id::text`, input.StoreID, input.SupplierID, number, nullableDate(input.ExpectedDate), strings.TrimSpace(input.Notes), input.PaymentMethod, roundCurrency(subtotal), actor.ID).Scan(&id)
	if err != nil {
		writeError(w, err)
		return
	}
	for _, item := range input.Items {
		result, insertErr := tx.Exec(r.Context(), `
			INSERT INTO purchase_order_items(purchase_order_id,product_id,quantity_ordered,unit_cost)
			SELECT $1::uuid,id,$3,$4 FROM products WHERE id=$2::uuid AND store_id=$5::uuid
		`, id, item.ProductID, item.Quantity, item.UnitCost, input.StoreID)
		if insertErr != nil {
			writeError(w, insertErr)
			return
		}
		if result.RowsAffected() == 0 {
			writeError(w, badRequest("Uno de los productos no pertenece al negocio"))
			return
		}
		_, _ = tx.Exec(r.Context(), `UPDATE purchase_suggestions SET status='ordered',updated_at=now() WHERE store_id=$1::uuid AND product_id=$2::uuid`, input.StoreID, item.ProductID)
	}
	if err := insertAuditTx(r.Context(), tx, input.StoreID, actor, "purchase_order.created", "purchase_order", id, map[string]any{"store_id": input.StoreID, "order_number": number, "subtotal": subtotal}); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "order_number": number})
}

func (s *Server) listPurchaseOrders(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	rows, err := s.db.Query(r.Context(), `
		SELECT o.id::text,o.order_number,o.status,COALESCE(o.supplier_id::text,''),COALESCE(s.name,''),o.expected_date,o.notes,o.payment_method,o.subtotal::double precision,o.created_by,o.created_at,o.submitted_at,o.received_at,
		COALESCE(SUM(i.quantity_ordered),0)::double precision,COALESCE(SUM(i.quantity_received),0)::double precision
		FROM purchase_orders o LEFT JOIN suppliers s ON s.id=o.supplier_id LEFT JOIN purchase_order_items i ON i.purchase_order_id=o.id WHERE o.store_id=$1::uuid GROUP BY o.id,s.name ORDER BY o.created_at DESC`, storeID)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, number, status, supplierID, supplierName, notes, paymentMethod, createdBy string
		var expected *time.Time
		var createdAt time.Time
		var submittedAt, receivedAt *time.Time
		var subtotal, ordered, received float64
		if err := rows.Scan(&id, &number, &status, &supplierID, &supplierName, &expected, &notes, &paymentMethod, &subtotal, &createdBy, &createdAt, &submittedAt, &receivedAt, &ordered, &received); err != nil {
			writeError(w, err)
			return
		}
		items = append(items, map[string]any{"id": id, "order_number": number, "status": status, "supplier_id": supplierID, "supplier_name": supplierName, "expected_date": expected, "notes": notes, "payment_method": paymentMethod, "subtotal": subtotal, "created_by": createdBy, "created_at": createdAt, "submitted_at": submittedAt, "received_at": receivedAt, "quantity_ordered": ordered, "quantity_received": received})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) purchaseOrderDetail(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var orderID, storeID, number, status, supplierID, supplierName, notes, paymentMethod string
	var expected *time.Time
	var subtotal float64
	var createdAt time.Time
	err := s.db.QueryRow(r.Context(), `SELECT o.id::text,o.store_id::text,o.order_number,o.status,COALESCE(o.supplier_id::text,''),COALESCE(s.name,''),o.expected_date,o.notes,o.payment_method,o.subtotal::double precision,o.created_at FROM purchase_orders o LEFT JOIN suppliers s ON s.id=o.supplier_id WHERE o.id=$1::uuid`, id).Scan(&orderID, &storeID, &number, &status, &supplierID, &supplierName, &expected, &notes, &paymentMethod, &subtotal, &createdAt)
	if err != nil {
		writeError(w, err)
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT i.id::text,i.product_id::text,p.name,p.format,p.track_batches,i.quantity_ordered::double precision,i.quantity_received::double precision,i.unit_cost::double precision,i.line_total::double precision FROM purchase_order_items i JOIN products p ON p.id=i.product_id WHERE i.purchase_order_id=$1::uuid ORDER BY p.name`, id)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var itemID, productID, name, format string
		var track bool
		var ordered, received, cost, total float64
		if err := rows.Scan(&itemID, &productID, &name, &format, &track, &ordered, &received, &cost, &total); err != nil {
			writeError(w, err)
			return
		}
		items = append(items, map[string]any{"id": itemID, "product_id": productID, "product_name": name, "format": format, "track_batches": track, "quantity_ordered": ordered, "quantity_received": received, "remaining_quantity": math.Max(0, ordered-received), "unit_cost": cost, "line_total": total})
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": orderID, "store_id": storeID, "order_number": number, "status": status, "supplier_id": supplierID, "supplier_name": supplierName, "expected_date": expected, "notes": notes, "payment_method": paymentMethod, "subtotal": subtotal, "created_at": createdAt, "items": items})
}

func (s *Server) submitPurchaseOrder(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	actor := actorFromContext(r.Context())
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var storeID, number string
	if err := tx.QueryRow(r.Context(), `
		UPDATE purchase_orders SET status='submitted',approved_by=$2,submitted_at=now(),updated_at=now()
		WHERE id=$1::uuid AND status='draft' RETURNING store_id::text,order_number
	`, id, actor.ID).Scan(&storeID, &number); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, apiError{status: http.StatusConflict, msg: "La orden no está disponible para enviar"})
			return
		}
		writeError(w, err)
		return
	}
	if err := insertAuditTx(r.Context(), tx, storeID, actor, "purchase_order.submitted", "purchase_order", id, map[string]any{"store_id": storeID, "order_number": number}); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "status": "submitted"})
}

func (s *Server) cancelPurchaseOrder(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	actor := actorFromContext(r.Context())
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var storeID, number string
	if err := tx.QueryRow(r.Context(), `
		UPDATE purchase_orders SET status='cancelled',cancelled_at=now(),updated_at=now()
		WHERE id=$1::uuid AND status IN ('draft','submitted') RETURNING store_id::text,order_number
	`, id).Scan(&storeID, &number); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, apiError{status: http.StatusConflict, msg: "La orden ya tiene recepciones o está cerrada"})
			return
		}
		writeError(w, err)
		return
	}
	if _, err := tx.Exec(r.Context(), `
		UPDATE purchase_suggestions suggestion SET status='pending',updated_at=now()
		FROM purchase_order_items item
		WHERE item.purchase_order_id=$1::uuid AND suggestion.store_id=$2::uuid
		  AND suggestion.product_id=item.product_id AND suggestion.status='ordered'
	`, id, storeID); err != nil {
		writeError(w, err)
		return
	}
	if err := insertAuditTx(r.Context(), tx, storeID, actor, "purchase_order.cancelled", "purchase_order", id, map[string]any{"store_id": storeID, "order_number": number}); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "status": "cancelled"})
}

func (s *Server) receivePurchaseOrder(w http.ResponseWriter, r *http.Request) {
	var input struct {
		InvoiceNumber string             `json:"invoice_number"`
		PaymentMethod string             `json:"payment_method"`
		Notes         string             `json:"notes"`
		Items         []receiptItemInput `json:"items"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if len(input.Items) == 0 {
		writeError(w, badRequest("Indica las cantidades recibidas"))
		return
	}
	orderID := chi.URLParam(r, "id")
	actor := actorFromContext(r.Context())
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var storeID, status, orderMethod, supplierID string
	err = tx.QueryRow(r.Context(), `SELECT store_id::text,status,payment_method,COALESCE(supplier_id::text,'') FROM purchase_orders WHERE id=$1::uuid FOR UPDATE`, orderID).Scan(&storeID, &status, &orderMethod, &supplierID)
	if err != nil {
		writeError(w, err)
		return
	}
	if status != "submitted" && status != "partially_received" {
		writeError(w, apiError{status: http.StatusConflict, msg: "La orden debe estar enviada para recibir mercancía"})
		return
	}
	if input.PaymentMethod == "" {
		input.PaymentMethod = orderMethod
	}
	if input.PaymentMethod != "accounts_payable" && input.PaymentMethod != "cash" && input.PaymentMethod != "bank_transfer" && input.PaymentMethod != "card" {
		writeError(w, badRequest("El método de pago de la recepción no es válido"))
		return
	}
	if input.PaymentMethod == "accounts_payable" && supplierID == "" {
		writeError(w, badRequest("La orden necesita un proveedor para recibir mercancía a crédito"))
		return
	}
	receiptNumber := journalEntryNumber("RC")
	var receiptID string
	err = tx.QueryRow(r.Context(), `INSERT INTO purchase_receipts(purchase_order_id,store_id,receipt_number,invoice_number,payment_method,notes,received_by) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7) RETURNING id::text`, orderID, storeID, receiptNumber, strings.TrimSpace(input.InvoiceNumber), input.PaymentMethod, strings.TrimSpace(input.Notes), actor.ID).Scan(&receiptID)
	if err != nil {
		writeError(w, err)
		return
	}
	total := 0.0
	for _, receivedItem := range input.Items {
		if receivedItem.Quantity <= 0 {
			continue
		}
		var itemID, productID, productName, format string
		var ordered, previouslyReceived, defaultCost, currentStock, currentCost float64
		var track bool
		query := `SELECT i.id::text,i.product_id::text,p.name,p.format,p.track_batches,i.quantity_ordered::double precision,i.quantity_received::double precision,i.unit_cost::double precision,p.stock::double precision,p.cost::double precision FROM purchase_order_items i JOIN products p ON p.id=i.product_id WHERE i.purchase_order_id=$1::uuid AND (`
		args := []any{orderID}
		if strings.TrimSpace(receivedItem.PurchaseOrderItemID) != "" {
			query += `i.id=$2::uuid)`
			args = append(args, receivedItem.PurchaseOrderItemID)
		} else {
			query += `i.product_id=$2::uuid)`
			args = append(args, receivedItem.ProductID)
		}
		query += ` FOR UPDATE`
		err = tx.QueryRow(r.Context(), query, args...).Scan(&itemID, &productID, &productName, &format, &track, &ordered, &previouslyReceived, &defaultCost, &currentStock, &currentCost)
		if err != nil {
			writeError(w, err)
			return
		}
		quantity := normalizeInventoryStock(receivedItem.Quantity, format)
		if quantity <= 0 || previouslyReceived+quantity-ordered > 0.000001 {
			writeError(w, badRequest("La cantidad recibida supera la cantidad pendiente de "+productName))
			return
		}
		unitCost := receivedItem.UnitCost
		if unitCost <= 0 {
			unitCost = defaultCost
		}
		lot := strings.TrimSpace(receivedItem.LotNumber)
		expiry := nullableDate(receivedItem.ExpiryDate)
		if track && (lot == "" || expiry == nil) {
			writeError(w, badRequest("El producto "+productName+" requiere número de lote y fecha de vencimiento"))
			return
		}
		var receiptItemID string
		err = tx.QueryRow(r.Context(), `INSERT INTO purchase_receipt_items(receipt_id,purchase_order_item_id,product_id,quantity,unit_cost,lot_number,expiry_date) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7) RETURNING id::text`, receiptID, itemID, productID, quantity, unitCost, lot, expiry).Scan(&receiptItemID)
		if err != nil {
			writeError(w, err)
			return
		}
		if track {
			var batchID string
			err = tx.QueryRow(r.Context(), `
		INSERT INTO product_batches(store_id,product_id,purchase_receipt_item_id,lot_number,expiry_date,initial_quantity,available_quantity,unit_cost)
		VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$6,$7)
		ON CONFLICT(store_id,product_id,lot_number) DO UPDATE SET initial_quantity=product_batches.initial_quantity+EXCLUDED.initial_quantity,available_quantity=product_batches.available_quantity+EXCLUDED.available_quantity,unit_cost=EXCLUDED.unit_cost,expiry_date=COALESCE(EXCLUDED.expiry_date,product_batches.expiry_date),status='active',updated_at=now()
		RETURNING id::text`, storeID, productID, receiptItemID, lot, expiry, quantity, unitCost).Scan(&batchID)
			if err != nil {
				writeError(w, err)
				return
			}
			if _, err := recordBatchMovementTx(r.Context(), tx, batchID, storeID, productID, "receipt", quantity, "purchase_receipt", receiptID, "Recepción "+receiptNumber, actor); err != nil {
				writeError(w, err)
				return
			}
		}
		newStock := currentStock + quantity
		newCost := unitCost
		if newStock > 0 {
			newCost = roundCurrency(((currentStock * currentCost) + (quantity * unitCost)) / newStock)
		}
		_, err = tx.Exec(r.Context(), `UPDATE products SET stock=$2,cost=$3 WHERE id=$1::uuid`, productID, newStock, newCost)
		if err != nil {
			writeError(w, err)
			return
		}
		_, err = tx.Exec(r.Context(), `UPDATE purchase_order_items SET quantity_received=quantity_received+$2,unit_cost=$3,updated_at=now() WHERE id=$1::uuid`, itemID, quantity, unitCost)
		if err != nil {
			writeError(w, err)
			return
		}
		_, err = tx.Exec(r.Context(), `INSERT INTO inventory_movements(store_id,product_id,movement_type,quantity_delta,stock_before,stock_after,reason,reference_type,reference_id,actor_id,actor_role) VALUES($1::uuid,$2::uuid,'purchase',$3,$4,$5,$6,'purchase_receipt',$7::uuid,$8,$9)`, storeID, productID, quantity, currentStock, newStock, "Recepción "+receiptNumber, receiptID, actor.ID, actor.Role)
		if err != nil {
			writeError(w, err)
			return
		}
		total += quantity * unitCost
	}
	total = roundCurrency(total)
	if total <= 0 {
		writeError(w, badRequest("No se recibió ninguna cantidad"))
		return
	}
	_, err = tx.Exec(r.Context(), `UPDATE purchase_receipts SET total=$2 WHERE id=$1::uuid`, receiptID, total)
	if err != nil {
		writeError(w, err)
		return
	}
	var pending int
	err = tx.QueryRow(r.Context(), `SELECT count(*) FROM purchase_order_items WHERE purchase_order_id=$1::uuid AND quantity_received+0.000001<quantity_ordered`, orderID).Scan(&pending)
	if err != nil {
		writeError(w, err)
		return
	}
	newStatus := "partially_received"
	if pending == 0 {
		newStatus = "received"
	}
	_, err = tx.Exec(r.Context(), `UPDATE purchase_orders SET status=$2,received_at=CASE WHEN $2='received' THEN now() ELSE received_at END,updated_at=now() WHERE id=$1::uuid`, orderID, newStatus)
	if err != nil {
		writeError(w, err)
		return
	}
	lines := []accountingLineInput{{SystemKey: "inventory", Debit: total, Description: "Entrada de mercancía"}, {SystemKey: purchasePaymentAccountingSystemKey(input.PaymentMethod), Credit: total, Description: "Pago o cuenta por pagar de compra"}}
	if _, err := createJournalEntryTx(r.Context(), tx, storeID, time.Now(), "Recepción de compra "+receiptNumber, "purchase_receipt", receiptID, actor, "posted", lines); err != nil {
		writeError(w, err)
		return
	}
	if input.PaymentMethod == "cash" {
		if err := insertCashMovementForOpenSession(r.Context(), tx, storeID, "expense", total, "cash", "Pago de compra "+receiptNumber, "purchase_receipt", receiptID, actor); err != nil {
			writeError(w, err)
			return
		}
	}
	if err := insertAuditTx(r.Context(), tx, storeID, actor, "purchase.received", "purchase_receipt", receiptID, map[string]any{"store_id": storeID, "purchase_order_id": orderID, "total": total, "status": newStatus}); err != nil {
		writeError(w, err)
		return
	}
	if err := insertOutboxTx(r.Context(), tx, storeID, "purchase_receipt", receiptID, "purchase.received", map[string]any{"store_id": storeID, "purchase_order_id": orderID, "total": total}, "purchase.received:"+receiptID); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	s.invalidateTenantCache(r.Context())
	writeJSON(w, http.StatusCreated, map[string]any{"id": receiptID, "receipt_number": receiptNumber, "total": total, "order_status": newStatus})
}

func (s *Server) listProductBatches(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	productID := strings.TrimSpace(r.URL.Query().Get("product_id"))
	statusFilter := strings.TrimSpace(r.URL.Query().Get("status"))
	if storeID == "" {
		writeError(w, badRequest("Debes seleccionar el negocio"))
		return
	}
	if err := s.expireTenantProductBatches(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	rows, err := s.db.Query(r.Context(), `
	SELECT b.id::text,b.product_id::text,p.name,b.lot_number,b.expiry_date,b.received_at,b.initial_quantity::double precision,b.available_quantity::double precision,b.unit_cost::double precision,b.status,b.notes,COALESCE(b.purchase_receipt_item_id::text,'')
	FROM product_batches b JOIN products p ON p.id=b.product_id
	WHERE b.store_id=$1::uuid AND ($2='' OR b.product_id=NULLIF($2,'')::uuid) AND ($3='' OR b.status=$3)
	ORDER BY b.expiry_date ASC NULLS LAST,b.received_at DESC`, storeID, productID, statusFilter)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, pid, name, lot, status, notes, receiptItemID string
		var expiry *time.Time
		var receivedAt time.Time
		var initial, available, cost float64
		if err := rows.Scan(&id, &pid, &name, &lot, &expiry, &receivedAt, &initial, &available, &cost, &status, &notes, &receiptItemID); err != nil {
			writeError(w, err)
			return
		}
		daysRemaining := any(nil)
		if expiry != nil {
			daysRemaining = int(math.Ceil(expiry.Sub(time.Now()).Hours() / 24))
		}
		items = append(items, map[string]any{"id": id, "product_id": pid, "product_name": name, "lot_number": lot, "expiry_date": expiry, "days_remaining": daysRemaining, "received_at": receivedAt, "initial_quantity": initial, "available_quantity": available, "unit_cost": cost, "status": status, "notes": notes, "purchase_receipt_item_id": receiptItemID})
	}
	if err := rows.Err(); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) createProductBatch(w http.ResponseWriter, r *http.Request) {
	var input struct {
		StoreID    string  `json:"store_id"`
		ProductID  string  `json:"product_id"`
		LotNumber  string  `json:"lot_number"`
		ExpiryDate string  `json:"expiry_date"`
		Notes      string  `json:"notes"`
		Quantity   float64 `json:"quantity"`
		UnitCost   float64 `json:"unit_cost"`
		AddToStock bool    `json:"add_to_stock"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input.StoreID = strings.TrimSpace(input.StoreID)
	input.ProductID = strings.TrimSpace(input.ProductID)
	input.LotNumber = strings.TrimSpace(input.LotNumber)
	if input.StoreID == "" || input.ProductID == "" || input.LotNumber == "" || input.Quantity <= 0 {
		writeError(w, badRequest("Completa los datos del lote"))
		return
	}
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var format string
	var before, currentCost float64
	err = tx.QueryRow(r.Context(), `SELECT format,stock::double precision,cost::double precision FROM products WHERE id=$1::uuid AND store_id=$2::uuid FOR UPDATE`, input.ProductID, input.StoreID).Scan(&format, &before, &currentCost)
	if err != nil {
		writeError(w, err)
		return
	}
	quantity := normalizeInventoryStock(input.Quantity, format)
	if quantity <= 0 {
		writeError(w, badRequest("La cantidad del lote no es válida"))
		return
	}
	unitCost := roundCurrency(math.Max(0, input.UnitCost))
	expiry := nullableDate(input.ExpiryDate)
	batchStatus := "active"
	if expiryTime, ok := expiry.(time.Time); ok && expiryTime.Format("2006-01-02") < time.Now().Format("2006-01-02") {
		batchStatus = "expired"
		if input.AddToStock {
			writeError(w, apiError{status: http.StatusConflict, msg: "No puedes sumar al inventario vendible un lote ya vencido"})
			return
		}
	}
	if !input.AddToStock {
		var allocated float64
		if err := tx.QueryRow(r.Context(), `SELECT COALESCE(SUM(available_quantity),0)::double precision FROM product_batches WHERE store_id=$1::uuid AND product_id=$2::uuid`, input.StoreID, input.ProductID).Scan(&allocated); err != nil {
			writeError(w, err)
			return
		}
		if allocated+quantity-before > 0.000001 {
			writeError(w, apiError{status: http.StatusConflict, msg: "La cantidad de los lotes supera la existencia actual. Activa “Sumar al inventario general” o corrige la cantidad."})
			return
		}
	}
	var batchID string
	err = tx.QueryRow(r.Context(), `
		INSERT INTO product_batches(store_id,product_id,lot_number,expiry_date,initial_quantity,available_quantity,unit_cost,status,notes)
		VALUES($1::uuid,$2::uuid,$3,$4,$5,$5,$6,$7,$8)
		RETURNING id::text
	`, input.StoreID, input.ProductID, input.LotNumber, expiry, quantity, unitCost, batchStatus, strings.TrimSpace(input.Notes)).Scan(&batchID)
	if err != nil {
		writeError(w, err)
		return
	}
	actor := actorFromContext(r.Context())
	if _, err := recordBatchMovementTx(r.Context(), tx, batchID, input.StoreID, input.ProductID, "initial", quantity, "product_batch", batchID, "Registro inicial del lote", actor); err != nil {
		writeError(w, err)
		return
	}
	if _, err := tx.Exec(r.Context(), `UPDATE products SET track_batches=true WHERE id=$1::uuid`, input.ProductID); err != nil {
		writeError(w, err)
		return
	}
	if input.AddToStock {
		after := normalizeInventoryStock(before+quantity, format)
		newCost := currentCost
		if after > 0 && unitCost > 0 {
			newCost = roundCurrency(((before * currentCost) + (quantity * unitCost)) / after)
		}
		if _, err := tx.Exec(r.Context(), `UPDATE products SET stock=$2,cost=$3 WHERE id=$1::uuid`, input.ProductID, after, newCost); err != nil {
			writeError(w, err)
			return
		}
		var inventoryMovementID string
		err = tx.QueryRow(r.Context(), `
			INSERT INTO inventory_movements(store_id,product_id,movement_type,quantity_delta,stock_before,stock_after,reason,reference_type,reference_id,actor_id,actor_role)
			VALUES($1::uuid,$2::uuid,'initial',$3,$4,$5,$6,'product_batch',$7::uuid,$8,$9)
			RETURNING id::text
		`, input.StoreID, input.ProductID, quantity, before, after, "Registro inicial de lote", batchID, actor.ID, actor.Role).Scan(&inventoryMovementID)
		if err != nil {
			writeError(w, err)
			return
		}
		if err := postInitialInventoryAccountingTx(r.Context(), tx, input.StoreID, inventoryMovementID, quantity, unitCost, actor); err != nil {
			writeError(w, err)
			return
		}
	}
	if err := insertAuditTx(r.Context(), tx, input.StoreID, actor, "inventory.batch.created", "product_batch", batchID, map[string]any{"store_id": input.StoreID, "product_id": input.ProductID, "lot_number": input.LotNumber, "quantity": quantity, "expiry_date": expiry, "add_to_stock": input.AddToStock}); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	s.invalidateTenantCache(r.Context())
	writeJSON(w, http.StatusCreated, map[string]any{"id": batchID, "status": batchStatus})
}

func (s *Server) updateProductBatch(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Status       string `json:"status"`
		Notes        string `json:"notes"`
		ExpiryDate   string `json:"expiry_date"`
		LotNumber    string `json:"lot_number"`
		ClearExpiry  bool   `json:"clear_expiry"`
		ReplaceNotes bool   `json:"replace_notes"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	batchID := chi.URLParam(r, "id")
	actor := actorFromContext(r.Context())
	if err := s.applyBatchStateTransitionTx(r.Context(), tx, batchID, input.Status, input.ExpiryDate, input.LotNumber, input.Notes, input.ClearExpiry, input.ReplaceNotes, actor); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	s.invalidateTenantCache(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{"id": batchID, "updated": true})
}

func (s *Server) expiringBatchSummary(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	if days <= 0 {
		days = 30
	}
	if storeID == "" {
		writeError(w, badRequest("Debes seleccionar el negocio"))
		return
	}
	if err := s.expireTenantProductBatches(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT b.id::text,p.name,b.lot_number,b.expiry_date,b.available_quantity::double precision,b.unit_cost::double precision,b.status
		FROM product_batches b JOIN products p ON p.id=b.product_id
		WHERE b.store_id=$1::uuid AND b.available_quantity>0 AND b.expiry_date IS NOT NULL
		  AND b.expiry_date<=CURRENT_DATE+$2 AND b.status IN ('active','expired')
		ORDER BY b.expiry_date
	`, storeID, days)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	expired, expiring7, expiring30 := 0, 0, 0
	valueAtRisk := 0.0
	for rows.Next() {
		var id, name, lot, status string
		var expiry time.Time
		var quantity, unitCost float64
		if err := rows.Scan(&id, &name, &lot, &expiry, &quantity, &unitCost, &status); err != nil {
			writeError(w, err)
			return
		}
		remaining := int(math.Ceil(expiry.Sub(time.Now()).Hours() / 24))
		if status == "expired" || remaining < 0 {
			expired++
		} else {
			if remaining <= 7 {
				expiring7++
			}
			if remaining <= 30 {
				expiring30++
			}
		}
		if status == "expired" || remaining <= days {
			valueAtRisk += quantity * unitCost
		}
		items = append(items, map[string]any{"id": id, "product_name": name, "lot_number": lot, "expiry_date": expiry, "available_quantity": quantity, "unit_cost": unitCost, "days_remaining": remaining, "status": status})
	}
	if err := rows.Err(); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items": items, "days": days, "expired": expired, "expiring_7_days": expiring7,
		"expiring_30_days": expiring30, "value_at_risk": roundCurrency(valueAtRisk),
	})
}

func (s *Server) accountingGeneralLedger(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	accountID := strings.TrimSpace(r.URL.Query().Get("account_id"))
	if storeID == "" {
		writeError(w, badRequest("Debes seleccionar el negocio"))
		return
	}
	now := time.Now()
	from := dateQuery(r.URL.Query().Get("from"), time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()))
	to := dateQuery(r.URL.Query().Get("to"), now)
	limit := pageSizeFromRequest(r)
	offset := pageOffsetFromRequest(r)
	rows, err := s.db.Query(r.Context(), `
		SELECT e.id::text,e.entry_number,e.entry_date,e.description,e.source_type,e.source_id,
		       a.id::text,a.code,a.name,a.account_type,a.normal_balance,
		       l.id::text,l.description,l.debit::double precision,l.credit::double precision,e.created_at
		FROM journal_entries e
		JOIN journal_lines l ON l.journal_entry_id=e.id
		JOIN accounting_accounts a ON a.id=l.account_id
		WHERE e.store_id=$1::uuid AND e.status='posted'
		  AND e.entry_date BETWEEN $2::date AND $3::date
		  AND ($4='' OR a.id=NULLIF($4,'')::uuid)
		ORDER BY e.entry_date DESC,e.created_at DESC,e.entry_number,l.id
		LIMIT $5 OFFSET $6
	`, storeID, from, to, accountID, limit, offset)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var entryID, number, description, sourceType, sourceID, accountIDValue, code, accountName, accountType, normalBalance, lineID, lineDescription string
		var entryDate, createdAt time.Time
		var debit, credit float64
		if err := rows.Scan(&entryID, &number, &entryDate, &description, &sourceType, &sourceID, &accountIDValue, &code, &accountName, &accountType, &normalBalance, &lineID, &lineDescription, &debit, &credit, &createdAt); err != nil {
			writeError(w, err)
			return
		}
		items = append(items, map[string]any{
			"entry_id": entryID, "entry_number": number, "entry_date": entryDate, "entry_description": description,
			"source_type": sourceType, "source_id": sourceID, "account_id": accountIDValue, "account_code": code,
			"account_name": accountName, "account_type": accountType, "normal_balance": normalBalance,
			"line_id": lineID, "line_description": lineDescription, "debit": debit, "credit": credit, "created_at": createdAt,
		})
	}
	if err := rows.Err(); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"from": from.Format("2006-01-02"), "to": to.Format("2006-01-02"), "items": items, "limit": limit, "offset": offset})
}

func (s *Server) listProductBatchMovements(w http.ResponseWriter, r *http.Request) {
	batchID := strings.TrimSpace(chi.URLParam(r, "id"))
	if batchID == "" {
		writeError(w, badRequest("El lote no es válido"))
		return
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT id::text,movement_type,quantity_delta::double precision,reference_type,reference_id,reason,actor_id,actor_role,created_at
		FROM product_batch_movements WHERE batch_id=$1::uuid ORDER BY created_at DESC,id DESC LIMIT 200
	`, batchID)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, movementType, referenceType, referenceID, reason, actorID, actorRole string
		var quantity float64
		var createdAt time.Time
		if err := rows.Scan(&id, &movementType, &quantity, &referenceType, &referenceID, &reason, &actorID, &actorRole, &createdAt); err != nil {
			writeError(w, err)
			return
		}
		items = append(items, map[string]any{"id": id, "movement_type": movementType, "quantity_delta": quantity, "reference_type": referenceType, "reference_id": referenceID, "reason": reason, "actor_id": actorID, "actor_role": actorRole, "created_at": createdAt})
	}
	if err := rows.Err(); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) listSupplierPayables(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	if storeID == "" {
		writeError(w, badRequest("Debes seleccionar el negocio"))
		return
	}
	rows, err := s.db.Query(r.Context(), `
		WITH received AS (
			SELECT o.supplier_id,COALESCE(SUM(r.total),0) AS total_credit,MAX(r.received_at) AS last_purchase_at
			FROM purchase_receipts r JOIN purchase_orders o ON o.id=r.purchase_order_id
			WHERE r.store_id=$1::uuid AND r.payment_method='accounts_payable' AND o.supplier_id IS NOT NULL
			GROUP BY o.supplier_id
		), paid AS (
			SELECT supplier_id,COALESCE(SUM(amount),0) AS total_paid,MAX(paid_at) AS last_payment_at
			FROM supplier_payments WHERE store_id=$1::uuid GROUP BY supplier_id
		)
		SELECT s.id::text,s.name,s.active,
		       COALESCE(received.total_credit,0)::double precision,
		       COALESCE(paid.total_paid,0)::double precision,
		       GREATEST(COALESCE(received.total_credit,0)-COALESCE(paid.total_paid,0),0)::double precision,
		       received.last_purchase_at,paid.last_payment_at
		FROM suppliers s
		LEFT JOIN received ON received.supplier_id=s.id
		LEFT JOIN paid ON paid.supplier_id=s.id
		WHERE s.store_id=$1::uuid
		ORDER BY GREATEST(COALESCE(received.total_credit,0)-COALESCE(paid.total_paid,0),0) DESC,s.name
	`, storeID)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, name string
		var active bool
		var credit, paid, outstanding float64
		var lastPurchase, lastPayment *time.Time
		if err := rows.Scan(&id, &name, &active, &credit, &paid, &outstanding, &lastPurchase, &lastPayment); err != nil {
			writeError(w, err)
			return
		}
		items = append(items, map[string]any{"supplier_id": id, "supplier_name": name, "active": active, "credit_purchases": credit, "paid": paid, "outstanding": outstanding, "last_purchase_at": lastPurchase, "last_payment_at": lastPayment})
	}
	if err := rows.Err(); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) recordSupplierPayment(w http.ResponseWriter, r *http.Request) {
	var input struct {
		StoreID       string  `json:"store_id"`
		Amount        float64 `json:"amount"`
		PaymentMethod string  `json:"payment_method"`
		Reference     string  `json:"reference"`
		Notes         string  `json:"notes"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input.StoreID = strings.TrimSpace(input.StoreID)
	input.PaymentMethod = strings.ToLower(strings.TrimSpace(input.PaymentMethod))
	input.Amount = roundCurrency(input.Amount)
	if input.StoreID == "" || input.Amount <= 0 || (input.PaymentMethod != "cash" && input.PaymentMethod != "bank_transfer" && input.PaymentMethod != "card") {
		writeError(w, badRequest("Completa correctamente el pago manual al proveedor"))
		return
	}
	supplierID := strings.TrimSpace(chi.URLParam(r, "id"))
	actor := actorFromContext(r.Context())
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var supplierName string
	if err := tx.QueryRow(r.Context(), `SELECT name FROM suppliers WHERE id=$1::uuid AND store_id=$2::uuid FOR UPDATE`, supplierID, input.StoreID).Scan(&supplierName); err != nil {
		writeError(w, err)
		return
	}
	var outstanding float64
	if err := tx.QueryRow(r.Context(), `
		SELECT GREATEST(
			COALESCE((SELECT SUM(r.total) FROM purchase_receipts r JOIN purchase_orders o ON o.id=r.purchase_order_id WHERE r.store_id=$1::uuid AND o.supplier_id=$2::uuid AND r.payment_method='accounts_payable'),0)
			- COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE store_id=$1::uuid AND supplier_id=$2::uuid),0),0
		)::double precision
	`, input.StoreID, supplierID).Scan(&outstanding); err != nil {
		writeError(w, err)
		return
	}
	if input.Amount-outstanding > 0.009 {
		writeError(w, apiError{status: http.StatusConflict, msg: "El pago supera el saldo pendiente del proveedor"})
		return
	}
	var paymentID string
	if err := tx.QueryRow(r.Context(), `
		INSERT INTO supplier_payments(store_id,supplier_id,amount,payment_method,reference,notes,created_by)
		VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7) RETURNING id::text
	`, input.StoreID, supplierID, input.Amount, input.PaymentMethod, strings.TrimSpace(input.Reference), strings.TrimSpace(input.Notes), actor.ID).Scan(&paymentID); err != nil {
		writeError(w, err)
		return
	}
	lines := []accountingLineInput{
		{SystemKey: "accounts_payable", Debit: input.Amount, Description: "Reducción de deuda con proveedor"},
		{SystemKey: purchasePaymentAccountingSystemKey(input.PaymentMethod), Credit: input.Amount, Description: "Pago manual a proveedor"},
	}
	if _, err := createJournalEntryTx(r.Context(), tx, input.StoreID, time.Now(), "Pago a proveedor "+supplierName, "supplier_payment", paymentID, actor, "posted", lines); err != nil {
		writeError(w, err)
		return
	}
	if input.PaymentMethod == "cash" {
		if err := insertCashMovementForOpenSession(r.Context(), tx, input.StoreID, "expense", input.Amount, "cash", "Pago a proveedor "+supplierName, "supplier_payment", paymentID, actor); err != nil {
			writeError(w, err)
			return
		}
	}
	if err := insertAuditTx(r.Context(), tx, input.StoreID, actor, "supplier.payment.recorded", "supplier_payment", paymentID, map[string]any{"store_id": input.StoreID, "supplier_id": supplierID, "amount": input.Amount, "payment_method": input.PaymentMethod, "reference": input.Reference}); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": paymentID, "supplier_id": supplierID, "amount": input.Amount, "remaining": roundCurrency(outstanding - input.Amount)})
}

func (s *Server) accountingOpeningBalance(w http.ResponseWriter, r *http.Request) {
	storeID := strings.TrimSpace(r.URL.Query().Get("store_id"))
	if storeID == "" {
		writeError(w, badRequest("Debes seleccionar el negocio"))
		return
	}
	var initialized bool
	if err := s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM journal_entries WHERE store_id=$1::uuid AND source_type='opening_balance' AND status='posted')`, storeID).Scan(&initialized); err != nil {
		writeError(w, err)
		return
	}
	var inventory, receivables float64
	if err := s.db.QueryRow(r.Context(), `SELECT COALESCE(SUM(GREATEST(stock,0)*GREATEST(cost,0)),0)::double precision FROM products WHERE store_id=$1::uuid`, storeID).Scan(&inventory); err != nil {
		writeError(w, err)
		return
	}
	if err := s.db.QueryRow(r.Context(), `
		SELECT GREATEST(COALESCE(SUM(
			CASE
				WHEN type='charge' AND status NOT IN ('paid','reversed') THEN GREATEST(amount-paid_amount,0)
				WHEN type='payment' AND COALESCE(reference_type,'')='' THEN -amount
				ELSE 0
			END
		),0),0)::double precision
		FROM store_credits WHERE store_id=$1::uuid
	`, storeID).Scan(&receivables); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"initialized": initialized,
		"suggested": map[string]any{
			"inventory":           roundCurrency(inventory),
			"accounts_receivable": roundCurrency(receivables),
			"cash":                0,
			"bank":                0,
			"accounts_payable":    0,
		},
	})
}

func (s *Server) initializeAccountingOpeningBalance(w http.ResponseWriter, r *http.Request) {
	var input struct {
		StoreID            string  `json:"store_id"`
		AsOfDate           string  `json:"as_of_date"`
		Cash               float64 `json:"cash"`
		Bank               float64 `json:"bank"`
		Inventory          float64 `json:"inventory"`
		AccountsReceivable float64 `json:"accounts_receivable"`
		AccountsPayable    float64 `json:"accounts_payable"`
		Notes              string  `json:"notes"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input.StoreID = strings.TrimSpace(input.StoreID)
	entryDate := dateQuery(input.AsOfDate, time.Now())
	values := []*float64{&input.Cash, &input.Bank, &input.Inventory, &input.AccountsReceivable, &input.AccountsPayable}
	for _, value := range values {
		*value = roundCurrency(*value)
		if *value < 0 {
			writeError(w, badRequest("Los saldos iniciales no pueden ser negativos"))
			return
		}
	}
	assets := input.Cash + input.Bank + input.Inventory + input.AccountsReceivable
	if input.StoreID == "" || assets+input.AccountsPayable <= 0 {
		writeError(w, badRequest("Indica al menos un saldo inicial"))
		return
	}
	actor := actorFromContext(r.Context())
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var exists bool
	if err := tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM journal_entries WHERE store_id=$1::uuid AND source_type='opening_balance' AND status<>'voided')`, input.StoreID).Scan(&exists); err != nil {
		writeError(w, err)
		return
	}
	if exists {
		writeError(w, apiError{status: http.StatusConflict, msg: "La contabilidad ya tiene un saldo de apertura"})
		return
	}
	var earliest *time.Time
	if err := tx.QueryRow(r.Context(), `SELECT MIN(entry_date) FROM journal_entries WHERE store_id=$1::uuid AND status='posted'`, input.StoreID).Scan(&earliest); err != nil {
		writeError(w, err)
		return
	}
	if earliest != nil && entryDate.After(*earliest) {
		writeError(w, apiError{status: http.StatusConflict, msg: "La fecha de apertura debe ser anterior o igual al primer asiento publicado"})
		return
	}
	lines := []accountingLineInput{}
	appendDebit := func(systemKey, description string, amount float64) {
		if amount > 0 {
			lines = append(lines, accountingLineInput{SystemKey: systemKey, Debit: amount, Description: description})
		}
	}
	appendDebit("cash", "Saldo inicial de efectivo", input.Cash)
	appendDebit("bank", "Saldo inicial en bancos", input.Bank)
	appendDebit("inventory", "Valor inicial del inventario", input.Inventory)
	appendDebit("accounts_receivable", "Cuentas por cobrar iniciales", input.AccountsReceivable)
	if input.AccountsPayable > 0 {
		lines = append(lines, accountingLineInput{SystemKey: "accounts_payable", Credit: input.AccountsPayable, Description: "Cuentas por pagar iniciales"})
	}
	equity := roundCurrency(assets - input.AccountsPayable)
	if equity > 0 {
		lines = append(lines, accountingLineInput{SystemKey: "owner_equity", Credit: equity, Description: "Patrimonio inicial"})
	} else if equity < 0 {
		lines = append(lines, accountingLineInput{SystemKey: "owner_equity", Debit: math.Abs(equity), Description: "Déficit patrimonial inicial"})
	}
	description := "Saldo de apertura de la contabilidad"
	if strings.TrimSpace(input.Notes) != "" {
		description += " · " + strings.TrimSpace(input.Notes)
	}
	entryID, err := createJournalEntryTx(r.Context(), tx, input.StoreID, entryDate, description, "opening_balance", input.StoreID, actor, "posted", lines)
	if err != nil {
		writeError(w, err)
		return
	}
	if err := insertAuditTx(r.Context(), tx, input.StoreID, actor, "accounting.opening_balance.created", "journal_entry", entryID, map[string]any{"store_id": input.StoreID, "entry_date": entryDate, "assets": assets, "accounts_payable": input.AccountsPayable, "equity": equity}); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": entryID, "initialized": true})
}
