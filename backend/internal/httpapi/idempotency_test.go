package httpapi

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOrderIdempotencyKey(t *testing.T) {
	request := httptest.NewRequest("POST", "/api/client/orders", nil)
	request.Header.Set("Idempotency-Key", "order-123")
	key, err := orderIdempotencyKey(request)
	if err != nil {
		t.Fatalf("valid key rejected: %v", err)
	}
	if key != "order-123" {
		t.Fatalf("key = %q", key)
	}
}

func TestOrderIdempotencyKeyRejectsUnsafeValues(t *testing.T) {
	for _, value := range []string{"contains spaces", strings.Repeat("a", 129)} {
		request := httptest.NewRequest("POST", "/api/client/orders", nil)
		request.Header.Set("Idempotency-Key", value)
		if _, err := orderIdempotencyKey(request); err == nil {
			t.Fatalf("unsafe key %q was accepted", value)
		}
	}
}

func TestOrderRequestHashIsStableAndPayloadSensitive(t *testing.T) {
	type payload struct {
		StoreID string `json:"store_id"`
		Total   int    `json:"total"`
	}
	first := orderRequestHash("customer-a", payload{StoreID: "store-a", Total: 100})
	second := orderRequestHash("customer-a", payload{StoreID: "store-a", Total: 100})
	different := orderRequestHash("customer-a", payload{StoreID: "store-a", Total: 101})
	if first != second {
		t.Fatal("equal order payloads produced different hashes")
	}
	if first == different {
		t.Fatal("different order payloads produced the same hash")
	}
}
