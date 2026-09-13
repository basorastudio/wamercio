package geordmap

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientProvincesSendsAPIKey(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("X-API-Key"); got != "geo_test_key" {
			t.Fatalf("expected X-API-Key header, got %q", got)
		}
		if r.URL.Path != "/api/v1/territories/provinces" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"valid": true,
			"data":  []map[string]string{{"code": "01", "name": "Distrito Nacional"}},
		})
	}))
	defer server.Close()

	client := Client{BaseURL: server.URL, APIKey: "geo_test_key", HTTP: server.Client()}
	items, err := client.Provinces(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Code != "01" {
		t.Fatalf("unexpected response: %#v", items)
	}
}

func TestClientNeighborhoodsUsesCityID(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/territories/cities/25:01:01/neighborhoods" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		if got := r.URL.Query().Get("includeCustom"); got != "true" {
			t.Fatalf("expected includeCustom=true, got %q", got)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"valid": true,
			"data":  []map[string]any{{"id": "n1", "name": "Centro", "custom": false}},
		})
	}))
	defer server.Close()

	client := Client{BaseURL: server.URL, APIKey: "x", HTTP: server.Client()}
	items, err := client.Neighborhoods(context.Background(), "25:01:01", true)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Name != "Centro" {
		t.Fatalf("unexpected response: %#v", items)
	}
}

func TestClientReturnsAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]any{"valid": false, "message": "API key inválida"})
	}))
	defer server.Close()

	client := Client{BaseURL: server.URL, APIKey: "bad", HTTP: server.Client()}
	_, err := client.Status(context.Background())
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected APIError, got %T (%v)", err, err)
	}
	if apiErr.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unexpected status: %d", apiErr.StatusCode)
	}
}

func TestClientSuggestNeighborhoodUsesCentralEndpoint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/v1/territories/neighborhoods/custom/suggestions" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		var payload SuggestNeighborhoodInput
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if payload.Name != "Residencial Ejemplo" || payload.CityID != "25:01:01" {
			t.Fatalf("unexpected payload: %#v", payload)
		}
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(map[string]any{"valid": true, "data": []any{"shape-can-change"}})
	}))
	defer server.Close()

	client := Client{BaseURL: server.URL, APIKey: "geo_test_key", HTTP: server.Client()}
	if _, err := client.SuggestNeighborhood(context.Background(), SuggestNeighborhoodInput{Name: "Residencial Ejemplo", CityID: "25:01:01"}); err != nil {
		t.Fatal(err)
	}
}
