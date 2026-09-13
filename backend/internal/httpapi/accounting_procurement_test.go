package httpapi

import (
	"encoding/json"
	"testing"
	"time"
)

func TestSaleCostFromItems(t *testing.T) {
	raw := json.RawMessage(`[
		{"id":"a","inventory_quantity":2,"cost":15.50},
		{"id":"b","quantity":1.5,"unit_cost":10}
	]`)
	if got, want := saleCostFromItems(raw), 46.0; got != want {
		t.Fatalf("saleCostFromItems() = %.2f, want %.2f", got, want)
	}
}

func TestReturnedItemsCost(t *testing.T) {
	raw := json.RawMessage(`[{"id":"a","cost":12.5},{"id":"b","cost":5}]`)
	returned := []returnedSaleItem{{ProductID: "a", Quantity: 2}, {ProductID: "b", Quantity: 1}}
	if got, want := returnedItemsCost(raw, returned), 30.0; got != want {
		t.Fatalf("returnedItemsCost() = %.2f, want %.2f", got, want)
	}
}

func TestOfflinePaymentAccountingKeys(t *testing.T) {
	tests := map[string]string{
		"cash":          "cash",
		"transfer":      "bank",
		"bank_transfer": "bank",
		"card":          "card_clearing",
		"store_credit":  "accounts_receivable",
	}
	for method, want := range tests {
		if got := paymentAccountingSystemKey(method); got != want {
			t.Errorf("paymentAccountingSystemKey(%q) = %q, want %q", method, got, want)
		}
	}
}

func TestBatchSaleability(t *testing.T) {
	now := time.Date(2026, 7, 16, 12, 0, 0, 0, time.UTC)
	future := now.AddDate(0, 0, 1)
	past := now.AddDate(0, 0, -1)
	if !batchIsSaleable("active", nil, now) {
		t.Fatal("active batch without expiration should be saleable")
	}
	if !batchIsSaleable("active", &future, now) {
		t.Fatal("active future batch should be saleable")
	}
	if batchIsSaleable("active", &past, now) {
		t.Fatal("expired active batch must not be saleable")
	}
	if batchIsSaleable("quarantined", &future, now) {
		t.Fatal("quarantined batch must not be saleable")
	}
}

func TestPurchasePaymentAccountingKeys(t *testing.T) {
	tests := map[string]string{
		"accounts_payable": "accounts_payable",
		"cash":             "cash",
		"bank_transfer":    "bank",
		"card":             "card_clearing",
		"invalid":          "",
	}
	for method, want := range tests {
		if got := purchasePaymentAccountingSystemKey(method); got != want {
			t.Errorf("purchasePaymentAccountingSystemKey(%q) = %q, want %q", method, got, want)
		}
	}
}

func TestBatchMovementTypeForStatus(t *testing.T) {
	tests := map[string]string{
		"active":      "reactivation",
		"quarantined": "quarantine",
		"expired":     "expiration",
		"recalled":    "recall",
		"depleted":    "adjustment",
	}
	for status, want := range tests {
		if got := batchMovementTypeForStatus(status); got != want {
			t.Errorf("batchMovementTypeForStatus(%q) = %q, want %q", status, got, want)
		}
	}
}
