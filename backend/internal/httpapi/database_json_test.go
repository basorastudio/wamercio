package httpapi

import (
	"encoding/json"
	"testing"
)

func TestMarshalJSONDatabaseValueReturnsValidText(t *testing.T) {
	value, err := marshalJSONDatabaseValue(map[string]any{
		"orderId":             "order-123",
		"status":              "preparing",
		"automaticAssignment": false,
	})
	if err != nil {
		t.Fatalf("marshalJSONDatabaseValue returned an error: %v", err)
	}
	if !json.Valid([]byte(value)) {
		t.Fatalf("database JSON parameter is invalid: %q", value)
	}
	if value == "" || value[0] != '{' {
		t.Fatalf("database JSON parameter must be JSON text, got %q", value)
	}
}

func TestValidatedJSONDatabaseValueRejectsInvalidJSON(t *testing.T) {
	if _, err := validatedJSONDatabaseValue([]byte(`{"status":`)); err == nil {
		t.Fatal("expected invalid JSON to be rejected")
	}
}
