package httpapi

import "testing"

func TestNormalizeInventoryDisposition(t *testing.T) {
	tests := map[string]string{
		"":           inventoryDispositionRestock,
		"restock":    inventoryDispositionRestock,
		" DAMAGED ":  inventoryDispositionDamaged,
		"lost":       inventoryDispositionLost,
		"quarantine": inventoryDispositionQuarantine,
		"unknown":    inventoryDispositionRestock,
	}
	for input, expected := range tests {
		if got := normalizeInventoryDisposition(input); got != expected {
			t.Fatalf("normalizeInventoryDisposition(%q) = %q, expected %q", input, got, expected)
		}
	}
}

func TestInventoryDispositionRestocksOnlySellableReturns(t *testing.T) {
	if !inventoryDispositionRestocks(inventoryDispositionRestock) {
		t.Fatal("restock disposition must restore inventory")
	}
	for _, disposition := range []string{inventoryDispositionDamaged, inventoryDispositionLost, inventoryDispositionQuarantine} {
		if inventoryDispositionRestocks(disposition) {
			t.Fatalf("%s disposition must not restore sellable inventory", disposition)
		}
	}
}

func TestCancelledOrderNotificationCopy(t *testing.T) {
	title, message := orderStatusNotificationCopy("cancelled")
	if title != "Pedido cancelado" {
		t.Fatalf("unexpected cancellation title %q", title)
	}
	if message == "" {
		t.Fatal("cancelled order notification must explain the result")
	}
}

func TestCustomerVisibleCancelledStatusRemainsCancelled(t *testing.T) {
	if got := customerVisibleDeliveryStatus(deliveryAudienceClient, "cancelled", "delivery"); got != "cancelled" {
		t.Fatalf("expected cancelled status to remain visible, got %q", got)
	}
}

func TestValidInventoryDispositionRejectsUnknownValues(t *testing.T) {
	for _, disposition := range []string{inventoryDispositionRestock, inventoryDispositionDamaged, inventoryDispositionLost, inventoryDispositionQuarantine} {
		if !validInventoryDisposition(disposition) {
			t.Fatalf("expected %q to be valid", disposition)
		}
	}
	for _, disposition := range []string{"", "unknown", "destroyed"} {
		if validInventoryDisposition(disposition) {
			t.Fatalf("expected %q to be rejected", disposition)
		}
	}
}

func TestValidActiveIncidentResolution(t *testing.T) {
	for _, resolution := range []string{"resume", "reassign", "replace_and_continue", "partial_delivery"} {
		if !validActiveIncidentResolution(resolution) {
			t.Fatalf("expected %q to be valid", resolution)
		}
	}
	for _, resolution := range []string{"", "cancelled", "unknown"} {
		if validActiveIncidentResolution(resolution) {
			t.Fatalf("expected %q to be rejected by the active resolution endpoint", resolution)
		}
	}
}
