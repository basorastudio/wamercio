package geord

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSelectorsSendsAPIKeyAndParsesBundle(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-API-Key") != "geo_test" {
			t.Fatalf("missing API key")
		}
		if r.URL.Query().Get("provinceCode") != "25" || r.URL.Query().Get("cityId") != "25:01:01" {
			t.Fatalf("unexpected query: %s", r.URL.RawQuery)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"valid": true, "data": map[string]any{"provinces": []any{map[string]any{"code": "25", "name": "Santiago"}}, "cities": []any{map[string]any{"id": 1, "cityId": "25:01:01", "name": "Santiago de los Caballeros", "kind": "municipality", "kindLabel": "Municipio", "provinceCode": "25", "municipalityCode": "01", "districtCode": "01"}}, "neighborhoods": []any{map[string]any{"id": "n1", "name": "Los Jardines", "municipalityCode": "01", "provinceCode": "25", "custom": false}}}})
	}))
	defer ts.Close()
	c := New(ts.URL, "geo_test")
	b, err := c.Selectors(context.Background(), "25", "25:01:01", true)
	if err != nil {
		t.Fatal(err)
	}
	if len(b.Provinces) != 1 || len(b.Cities) != 1 || b.Cities[0].CityID != "25:01:01" || len(b.Neighborhoods) != 1 {
		t.Fatalf("unexpected bundle: %#v", b)
	}
}

func TestGeofencesContainsAndRoute(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/geofences/contains":
			if r.URL.Query().Get("serviceType") != "delivery" {
				t.Fatalf("serviceType missing")
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"valid": true, "data": []any{map[string]any{"id": "g1", "name": "Centro", "category": "commerce", "serviceType": "delivery", "active": true, "properties": map[string]any{}}}})
		case "/api/v1/routing/route":
			_ = json.NewEncoder(w).Encode(map[string]any{"valid": true, "data": map[string]any{"trip": map[string]any{"summary": map[string]any{"length": 4.2, "time": 600}}}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer ts.Close()
	c := New(ts.URL, "geo_test")
	gs, err := c.GeofencesContains(context.Background(), 18.48, -69.93, "", "delivery")
	if err != nil {
		t.Fatal(err)
	}
	if len(gs) != 1 || gs[0].ID != "g1" {
		t.Fatalf("unexpected geofences %#v", gs)
	}
	route, err := c.Route(context.Background(), RouteRequest{Locations: []RouteLocation{{Lat: 18.48, Lon: -69.93}, {Lat: 18.47, Lon: -69.89}}})
	if err != nil {
		t.Fatal(err)
	}
	if route["trip"] == nil {
		t.Fatalf("route not parsed")
	}
}

func TestSuggestNeighborhoodSendsTenantID(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Tenant-ID") != "tenant-1" {
			t.Fatalf("missing tenant header")
		}
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(map[string]any{"valid": true, "data": map[string]any{"id": "x", "status": "pending"}})
	}))
	defer ts.Close()
	c := New(ts.URL, "geo_test")
	_, err := c.SuggestNeighborhood(context.Background(), "tenant-1", CustomNeighborhoodSuggestionRequest{Name: "Los Pinos", CityID: "25:01:01"})
	if err != nil {
		t.Fatal(err)
	}
}
