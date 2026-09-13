package httpapi

import (
	"context"
	"testing"

	"wamercio/backend/internal/platform/tenancy"
)

func TestNormalizeStoreLocationInput(t *testing.T) {
	input := map[string]any{
		"lat":              18.4861,
		"lng":              -69.9312,
		"locationAccuracy": 12.5,
		"locationSource":   "device",
	}
	changed, err := normalizeStoreLocationInput(input)
	if err != nil {
		t.Fatalf("normalize location: %v", err)
	}
	if !changed {
		t.Fatal("expected location change")
	}
	if input["latitude"] != 18.4861 || input["longitude"] != -69.9312 {
		t.Fatalf("unexpected coordinates: %#v", input)
	}
	if input["location_source"] != "device" {
		t.Fatalf("unexpected source: %#v", input["location_source"])
	}
	if input["location_updated_at"] == nil {
		t.Fatal("expected update timestamp")
	}
}

func TestNormalizeStoreLocationRequiresCoordinatePair(t *testing.T) {
	_, err := normalizeStoreLocationInput(map[string]any{"latitude": 18.4})
	if err == nil {
		t.Fatal("expected coordinate pair validation error")
	}
}

func TestNormalizeStoreLocationCanClearCoordinates(t *testing.T) {
	input := map[string]any{"latitude": "", "longitude": ""}
	changed, err := normalizeStoreLocationInput(input)
	if err != nil {
		t.Fatalf("clear location: %v", err)
	}
	if !changed || input["latitude"] != nil || input["longitude"] != nil {
		t.Fatalf("expected cleared coordinates: %#v", input)
	}
}

func TestNormalizeTenantProvisionLocation(t *testing.T) {
	latitude := 18.4861
	longitude := -69.9312
	input := tenancy.TenantProvisionInput{Latitude: &latitude, Longitude: &longitude, LocationSource: "device"}
	if err := normalizeTenantProvisionLocation(&input); err != nil {
		t.Fatalf("normalize tenant location: %v", err)
	}
	if input.LocationSource != "device" {
		t.Fatalf("unexpected source: %s", input.LocationSource)
	}
}

func TestNormalizeTenantProvisionLocationRequiresPair(t *testing.T) {
	latitude := 18.4861
	input := tenancy.TenantProvisionInput{Latitude: &latitude}
	if err := normalizeTenantProvisionLocation(&input); err == nil {
		t.Fatal("expected coordinate pair validation error")
	}
}

func TestTenantGeoKeysAreIsolated(t *testing.T) {
	ctx := tenancy.WithTenant(context.Background(), tenancy.Tenant{ID: "tenant-123"}, nil)
	if got := storeGeoKey(ctx); got != "wamercio:tenant:tenant-123:geo:stores" {
		t.Fatalf("unexpected store GEO key: %s", got)
	}
	if got := deliveryDriversGeoKey(ctx); got != "wamercio:tenant:tenant-123:geo:drivers:live" {
		t.Fatalf("unexpected driver GEO key: %s", got)
	}
	if got := deliveryDestinationsGeoKey(ctx); got != "wamercio:tenant:tenant-123:geo:deliveries:active" {
		t.Fatalf("unexpected delivery GEO key: %s", got)
	}
}
