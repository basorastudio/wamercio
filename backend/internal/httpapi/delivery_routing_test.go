package httpapi

import "testing"

func TestDirectDeliveryRouteIncludesEndpoints(t *testing.T) {
	plan := directDeliveryRoute(18.4861, -69.9312, 18.5001, -69.9102)
	if len(plan.Coordinates) != 2 {
		t.Fatalf("expected two route points, got %d", len(plan.Coordinates))
	}
	if plan.Coordinates[0].Lat != 18.4861 || plan.Coordinates[0].Lng != -69.9312 {
		t.Fatal("direct route must preserve the store origin")
	}
	if plan.Coordinates[1].Lat != 18.5001 || plan.Coordinates[1].Lng != -69.9102 {
		t.Fatal("direct route must preserve the customer destination")
	}
	if plan.DistanceKM <= 0 || plan.DurationMinutes <= 0 {
		t.Fatal("direct route must include positive distance and duration")
	}
}

func TestCompactRouteGeometryPreservesEndpoints(t *testing.T) {
	points := make([]deliveryRoutePoint, 100)
	for index := range points {
		points[index] = deliveryRoutePoint{Lat: 18 + float64(index)/1000, Lng: -70 + float64(index)/1000}
	}
	compacted := compactRouteGeometry(points, 12)
	if len(compacted) != 12 {
		t.Fatalf("expected 12 compacted points, got %d", len(compacted))
	}
	if compacted[0] != points[0] {
		t.Fatal("compaction must preserve the first point")
	}
	if compacted[len(compacted)-1] != points[len(points)-1] {
		t.Fatal("compaction must preserve the last point")
	}
}

func TestDeliveryLiveFloatRejectsMissingValues(t *testing.T) {
	if _, ok := deliveryLiveFloat(nil); ok {
		t.Fatal("nil coordinates must not be treated as a geographic point")
	}
	if _, ok := deliveryLiveFloat(""); ok {
		t.Fatal("empty coordinates must not be treated as a geographic point")
	}
	value, ok := deliveryLiveFloat("18.4861")
	if !ok || value != 18.4861 {
		t.Fatal("valid coordinate text must be parsed")
	}
}

func TestCustomerDeliveryTrackingOnlyRunsInRoute(t *testing.T) {
	if customerDeliveryTrackingAllowed("ready_for_delivery") {
		t.Fatal("customer tracking must remain hidden while the order is still at the business")
	}
	if !customerDeliveryTrackingAllowed("on_the_way") {
		t.Fatal("customer tracking must be enabled after the delivery route starts")
	}
	if customerDeliveryTrackingAllowed("delivered") {
		t.Fatal("live customer tracking must stop after delivery")
	}
}
