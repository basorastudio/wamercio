package httpapi

import "testing"

func TestDeliveryLocationMatchesRejectsMissingCustomerLocation(t *testing.T) {
	if deliveryLocationMatches("01", "Santo Domingo", "", "") {
		t.Fatal("a specific delivery zone must not match an empty customer location")
	}
	if !deliveryLocationMatches("01", "Santo Domingo", "01", "") {
		t.Fatal("matching location codes should be accepted")
	}
}

func TestNearestNeighborRouteUsesDriverStart(t *testing.T) {
	stops := []routeStop{
		{OrderID: "far", Lat: 18.50, Lng: -69.80, HasLocation: true},
		{OrderID: "near", Lat: 18.4802, Lng: -69.9002, HasLocation: true},
		{OrderID: "middle", Lat: 18.49, Lng: -69.86, HasLocation: true},
	}

	ordered := nearestNeighborRoute(stops, 18.48, -69.90, true)
	if len(ordered) != len(stops) {
		t.Fatalf("expected %d stops, got %d", len(stops), len(ordered))
	}
	if ordered[0].OrderID != "near" {
		t.Fatalf("expected nearest stop first, got %q", ordered[0].OrderID)
	}
}

func TestNearestNeighborRoutePreservesStopsWithoutCoordinates(t *testing.T) {
	stops := []routeStop{
		{OrderID: "without-location"},
		{OrderID: "located", Lat: 18.48, Lng: -69.90, HasLocation: true},
	}

	ordered := nearestNeighborRoute(stops, 18.47, -69.91, true)
	if len(ordered) != 2 {
		t.Fatalf("expected both stops to remain in the route, got %d", len(ordered))
	}
	if ordered[0].OrderID != "located" || ordered[1].OrderID != "without-location" {
		t.Fatalf("unexpected order: %#v", ordered)
	}
}

func TestDeliveryZoneSpecificityPrefersNeighborhood(t *testing.T) {
	broad := DeliveryZone{ProvinceCode: "01", MunicipalityCode: "0101"}
	specific := DeliveryZone{ProvinceCode: "01", MunicipalityCode: "0101", NeighborhoodID: "los-mina"}
	if deliveryZoneSpecificity(specific) <= deliveryZoneSpecificity(broad) {
		t.Fatal("a neighborhood delivery zone must be preferred over a broad municipal zone")
	}
}

func TestAutomaticSingleDriverAssignmentDetection(t *testing.T) {
	if !isAutomaticSingleDriverAssignment("automatic:single_active_driver:admin@example.com") {
		t.Fatal("expected single-driver assignment marker to be detected")
	}
	if isAutomaticSingleDriverAssignment("admin@example.com") {
		t.Fatal("manual assignments must not be detected as automatic")
	}
}

func TestTwoOptRouteImprovesCrossedRoute(t *testing.T) {
	stops := []routeStop{
		{OrderID: "a", Lat: 18.00, Lng: -70.00, HasLocation: true},
		{OrderID: "b", Lat: 18.01, Lng: -69.99, HasLocation: true},
		{OrderID: "c", Lat: 18.00, Lng: -69.99, HasLocation: true},
		{OrderID: "d", Lat: 18.01, Lng: -70.00, HasLocation: true},
	}

	before := routeLength(stops, 0, 0, false)
	optimized := twoOptRoute(stops, 0, 0, false)
	after := routeLength(optimized, 0, 0, false)
	if after >= before {
		t.Fatalf("expected 2-opt to improve route: before=%f after=%f", before, after)
	}
	if len(optimized) != len(stops) {
		t.Fatalf("expected %d stops after optimization, got %d", len(stops), len(optimized))
	}
}

func TestCustomerVisibleDeliveryStatusHidesDeliveryHandoffOnly(t *testing.T) {
	if got := customerVisibleDeliveryStatus(deliveryAudienceClient, "ready_for_delivery", "delivery"); got != "preparing" {
		t.Fatalf("expected delivery client status preparing, got %q", got)
	}
	if got := customerVisibleDeliveryStatus(deliveryAudienceClient, "ready_for_delivery", "pickup"); got != "ready_for_delivery" {
		t.Fatalf("expected pickup client status ready_for_delivery, got %q", got)
	}
	if got := customerVisibleDeliveryStatus(deliveryAudienceAdmin, "ready_for_delivery", "delivery"); got != "ready_for_delivery" {
		t.Fatalf("expected admin status ready_for_delivery, got %q", got)
	}
	if got := customerVisibleDeliveryStatus(deliveryAudienceClient, "on_the_way", "delivery"); got != "on_the_way" {
		t.Fatalf("expected on_the_way to remain visible, got %q", got)
	}
}
