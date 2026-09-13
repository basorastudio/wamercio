package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"

	"colmapro/backend/internal/db/sqlc"
)

const (
	defaultWeightUnit      = "lb"
	defaultMinimumWeight   = 0.25
	defaultWeightIncrement = 0.25
	defaultMinimumAmount   = 20.0
	defaultWeightPrecision = 2
)

type inventoryAdjustment struct {
	ProductID string
	Quantity  float64
}

func roundDecimal(value float64, precision int) float64 {
	if precision < 0 {
		precision = 0
	}
	if precision > 6 {
		precision = 6
	}
	factor := math.Pow10(precision)
	return math.Round((value+math.SmallestNonzeroFloat64)*factor) / factor
}
func roundCurrency(value float64) float64 { return roundDecimal(value, 2) }

// roundPayableAmount applies the cash rule used in Dominican colmados:
// fractions below .50 go down and fractions from .50 go up.
func roundPayableAmount(value float64) float64 { return math.Round(value) }

// minimumAmountForUnitPrice returns the whole-peso cash equivalent of a
// quarter pound. It replaces the old fixed RD$20 minimum and follows the same
// Dominican cash rounding rule used for payable totals.
func minimumAmountForUnitPrice(unitPrice float64) float64 {
	if unitPrice <= 0 {
		return defaultMinimumAmount
	}
	return math.Max(1, roundPayableAmount(unitPrice*defaultMinimumWeight))
}

// amountWeightBreakdown converts a whole-peso budget into its commercial
// weight equivalent. Exact payable quarter-pound amounts keep the canonical
// quarter value; every other amount keeps a two-decimal approximate weight so
// it is never represented as an exact common fraction.
func amountWeightBreakdown(amount, unitPrice, minimum, increment float64) (float64, bool) {
	if amount <= 0 || unitPrice <= 0 {
		return 0, false
	}
	if minimum <= 0 {
		minimum = defaultMinimumWeight
	}
	rawWeight := math.Max(minimum, amount/unitPrice)
	quarterWeight := normalizeRequestedWeight(rawWeight, minimum, increment)
	payableForQuarter := roundPayableAmount(unitPrice * quarterWeight)
	exact := math.Abs(payableForQuarter-roundPayableAmount(amount)) < 0.000001
	if exact {
		return quarterWeight, true
	}
	return roundDecimal(rawWeight, defaultWeightPrecision), false
}

func amountWeightIsExact(amount, unitPrice, increment float64) bool {
	_, exact := amountWeightBreakdown(amount, unitPrice, defaultMinimumWeight, increment)
	return exact
}

func normalizeRequestedWeight(value, minimum, increment float64) float64 {
	if minimum <= 0 {
		minimum = defaultMinimumWeight
	}
	if increment <= 0 {
		increment = defaultWeightIncrement
	}
	value = math.Max(minimum, value)
	steps := math.Round(value / increment)
	return roundDecimal(math.Max(minimum, steps*increment), defaultWeightPrecision)
}

func formatUsesWeight(format string) bool {
	return strings.EqualFold(strings.TrimSpace(format), "Libra")
}

func normalizeInventoryStock(value float64, format string) float64 {
	value = math.Max(0, value)
	if formatUsesWeight(format) {
		return roundDecimal(value, defaultWeightPrecision)
	}
	return math.Floor(value)
}

func normalizeInventoryDelta(value float64, format string) float64 {
	if formatUsesWeight(format) {
		return roundDecimal(value, defaultWeightPrecision)
	}
	return math.Trunc(value)
}
func productIsWeighted(p Product) bool {
	return p.WeightedSaleEnabled && formatUsesWeight(p.Format)
}
func weightedDefaults(p Product) Product {
	p.WeightUnit = defaultWeightUnit
	p.MinimumWeight = defaultMinimumWeight
	p.WeightIncrement = defaultWeightIncrement
	p.MinimumAmount = minimumAmountForUnitPrice(p.Price)
	p.WeightPrecision = defaultWeightPrecision
	if productIsWeighted(p) {
		p.AllowWeightSales = true
		p.AllowAmountSales = true
	}
	return p
}
func itemNumber(m map[string]any, keys ...string) float64 {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			n := floatFromAny(v)
			if !math.IsNaN(n) && !math.IsInf(n, 0) {
				return n
			}
		}
	}
	return 0
}
func itemText(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			t := strings.TrimSpace(fmt.Sprint(v))
			if t != "" && t != "<nil>" {
				return t
			}
		}
	}
	return ""
}

func canonicalSaleItems(ctx context.Context, db sqlc.DBTX, storeID string, raw json.RawMessage, lock bool) (json.RawMessage, float64, []inventoryAdjustment, error) {
	if strings.TrimSpace(storeID) == "" {
		return nil, 0, nil, badRequest("Debes seleccionar el negocio")
	}
	var requested []map[string]any
	if len(raw) == 0 || string(raw) == "null" || json.Unmarshal(raw, &requested) != nil {
		return nil, 0, nil, badRequest("Los productos enviados no tienen un formato válido")
	}
	if len(requested) == 0 {
		return nil, 0, nil, badRequest("La venta no tiene productos")
	}
	if len(requested) > 150 {
		return nil, 0, nil, badRequest("La venta supera el límite permitido")
	}
	productIDs := make([]string, 0, len(requested))
	seenProductIDs := make(map[string]struct{}, len(requested))
	for _, item := range requested {
		id := itemText(item, "id", "product_id", "productId")
		if id == "" {
			return nil, 0, nil, badRequest("Uno de los productos no tiene identificador")
		}
		if _, exists := seenProductIDs[id]; exists {
			continue
		}
		seenProductIDs[id] = struct{}{}
		productIDs = append(productIDs, id)
	}

	query := productSelectSQL("SELECT") + " FROM products WHERE store_id=$1 AND id = ANY(ARRAY(SELECT item.value::uuid FROM unnest($2::text[]) AS item(value))) ORDER BY id"
	if lock {
		query += " FOR UPDATE"
	}
	rows, err := db.Query(ctx, query, storeID, productIDs)
	if err != nil {
		return nil, 0, nil, err
	}
	products := make(map[string]Product, len(productIDs))
	for rows.Next() {
		var product Product
		if err := rows.Scan(productScanPtrs(&product)...); err != nil {
			rows.Close()
			return nil, 0, nil, err
		}
		product = weightedDefaults(product)
		products[product.ID] = product
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, 0, nil, err
	}
	rows.Close()
	if len(products) != len(productIDs) {
		return nil, 0, nil, badRequest("Uno de los productos ya no está disponible")
	}

	stockTotals := make(map[string]float64, len(productIDs))
	lines := make([]map[string]any, 0, len(requested))
	total := 0.0
	for _, item := range requested {
		id := itemText(item, "id", "product_id", "productId")
		p := products[id]
		if p.Price <= 0 {
			return nil, 0, nil, badRequest(fmt.Sprintf("%s no tiene precio válido", p.Name))
		}
		line := map[string]any{"id": p.ID, "store_id": p.StoreID, "storeId": p.StoreID, "global_id": p.GlobalID, "globalId": p.GlobalID, "name": p.Name, "description": p.Description, "category": p.Category, "category_icon": p.CategoryIcon, "categoryIcon": p.CategoryIcon, "brand": p.Brand, "format": p.Format, "group": p.Group, "detail": p.Detail, "image": p.Image, "price": roundCurrency(p.Price), "cost": roundCurrency(p.Cost), "unit_price": roundCurrency(p.Price), "unitPrice": roundCurrency(p.Price), "weighted_sale_enabled": productIsWeighted(p), "weightedSaleEnabled": productIsWeighted(p)}
		qty, lineTotal := 0.0, 0.0
		weightIsExact := true
		if productIsWeighted(p) {
			mode := strings.ToLower(itemText(item, "sale_mode", "saleMode"))
			if mode == "monto" {
				mode = "amount"
			}
			if mode == "peso" || mode == "libra" {
				mode = "weight"
			}
			if mode == "" {
				if p.AllowWeightSales {
					mode = "weight"
				} else {
					mode = "amount"
				}
			}
			if mode == "amount" && !p.AllowAmountSales {
				return nil, 0, nil, badRequest(fmt.Sprintf("%s no permite pedidos por monto", p.Name))
			}
			if mode == "weight" && !p.AllowWeightSales {
				return nil, 0, nil, badRequest(fmt.Sprintf("%s no permite pedidos por peso", p.Name))
			}
			if mode != "amount" && mode != "weight" {
				return nil, 0, nil, badRequest("Modalidad de venta no válida")
			}
			if mode == "amount" {
				amount := roundPayableAmount(itemNumber(item, "requested_amount", "requestedAmount", "line_total", "lineTotal"))
				if amount < p.MinimumAmount {
					return nil, 0, nil, badRequest(fmt.Sprintf("El monto mínimo para %s es RD$ %.0f", p.Name, p.MinimumAmount))
				}
				qty, weightIsExact = amountWeightBreakdown(
					amount,
					p.Price,
					p.MinimumWeight,
					p.WeightIncrement,
				)
				lineTotal = amount
				line["requested_amount"], line["requestedAmount"] = amount, amount
			} else {
				qty = normalizeRequestedWeight(
					itemNumber(item, "requested_weight", "requestedWeight", "estimated_weight", "estimatedWeight", "quantity"),
					p.MinimumWeight,
					p.WeightIncrement,
				)
				lineTotal = roundPayableAmount(qty * p.Price)
				line["requested_amount"], line["requestedAmount"] = lineTotal, lineTotal
			}
			line["sale_mode"], line["saleMode"] = mode, mode
			line["unit"] = p.WeightUnit
			line["quantity"] = qty
			line["requested_weight"], line["requestedWeight"] = qty, qty
			line["estimated_weight"], line["estimatedWeight"] = qty, qty
			line["weight_is_exact"], line["weightIsExact"] = weightIsExact, weightIsExact
			line["cart_key"], line["cartKey"] = p.ID+":"+mode, p.ID+":"+mode
			line["allow_weight_sales"], line["allowWeightSales"] = p.AllowWeightSales, p.AllowWeightSales
			line["allow_amount_sales"], line["allowAmountSales"] = p.AllowAmountSales, p.AllowAmountSales
			line["weight_unit"], line["weightUnit"] = p.WeightUnit, p.WeightUnit
			line["minimum_weight"], line["minimumWeight"] = p.MinimumWeight, p.MinimumWeight
			line["weight_increment"], line["weightIncrement"] = p.WeightIncrement, p.WeightIncrement
			line["minimum_amount"], line["minimumAmount"] = p.MinimumAmount, p.MinimumAmount
			line["weight_precision"], line["weightPrecision"] = p.WeightPrecision, p.WeightPrecision
		} else {
			qty = math.Floor(itemNumber(item, "quantity"))
			if qty < 1 {
				qty = 1
			}
			if qty > 999 {
				return nil, 0, nil, badRequest("Cantidad superior al límite permitido")
			}
			lineTotal = roundCurrency(qty * p.Price)
			line["quantity"] = int(qty)
			line["sale_mode"], line["saleMode"] = "unit", "unit"
			line["unit"] = "unidad"
			line["cart_key"], line["cartKey"] = p.ID+":unit", p.ID+":unit"
		}
		stockTotals[p.ID] = roundDecimal(stockTotals[p.ID]+qty, defaultWeightPrecision)
		line["line_total"], line["lineTotal"] = lineTotal, lineTotal
		lines = append(lines, line)
		total += lineTotal
	}
	adjustments := make([]inventoryAdjustment, 0, len(stockTotals))
	for id, qty := range stockTotals {
		p := products[id]
		if qty-p.Stock > 0.000001 {
			unit := "unidades"
			if productIsWeighted(p) {
				unit = p.WeightUnit
			}
			return nil, 0, nil, badRequest(fmt.Sprintf("Existencia insuficiente de %s. Disponible: %.2f %s", p.Name, p.Stock, unit))
		}
		adjustments = append(adjustments, inventoryAdjustment{id, qty})
	}
	encoded, err := json.Marshal(lines)
	return json.RawMessage(encoded), roundPayableAmount(total), adjustments, err
}
func applyInventoryAdjustments(ctx context.Context, db sqlc.DBTX, storeID string, adjustments []inventoryAdjustment) error {
	if len(adjustments) == 0 {
		return nil
	}
	productIDs := make([]string, 0, len(adjustments))
	quantities := make([]float64, 0, len(adjustments))
	for _, adjustment := range adjustments {
		productIDs = append(productIDs, adjustment.ProductID)
		quantities = append(quantities, adjustment.Quantity)
	}
	var updated int
	err := db.QueryRow(ctx, `
		WITH requested AS (
			SELECT product_id::uuid, quantity
			FROM unnest($1::text[], $2::double precision[]) AS value(product_id, quantity)
		), updated AS (
			UPDATE products AS product
			SET stock = product.stock - requested.quantity
			FROM requested
			WHERE product.id = requested.product_id
			  AND product.store_id = $3::uuid
			  AND product.stock >= requested.quantity
			RETURNING product.id
		)
		SELECT count(*)::integer FROM updated
	`, productIDs, quantities, storeID).Scan(&updated)
	if err != nil {
		return err
	}
	if updated != len(adjustments) {
		return badRequest("La existencia cambió. Revisa la funda e inténtalo nuevamente")
	}
	return nil
}
