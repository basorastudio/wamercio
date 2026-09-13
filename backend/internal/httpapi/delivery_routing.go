package httpapi

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

const (
	deliveryRouteCacheTTL  = 15 * time.Minute
	maxRouteGeometryPoints = 420
)

type deliveryRoutePoint struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type deliveryRoutePlan struct {
	Coordinates     []deliveryRoutePoint `json:"coordinates"`
	DistanceKM      float64              `json:"distance_km"`
	DurationMinutes int                  `json:"duration_minutes"`
	Source          string               `json:"source"`
	GeneratedAt     time.Time            `json:"generated_at"`
}

type deliveryRouteOrderContext struct {
	OrderID             string
	CustomerID          string
	StoreID             string
	StoreName           string
	StoreAddress        string
	StoreLat            float64
	StoreLng            float64
	HasStoreLocation    bool
	CustomerLat         float64
	CustomerLng         float64
	HasCustomerLocation bool
	AssignedDriverID    string
	DeliveryZoneID      string
	Status              string
}

func routeCacheKey(ctx context.Context, startLat, startLng, endLat, endLng float64) string {
	raw := fmt.Sprintf("%.5f,%.5f:%.5f,%.5f", startLat, startLng, endLat, endLng)
	digest := sha256.Sum256([]byte(raw))
	return tenantGeoPrefix(ctx) + ":route:v1:" + hex.EncodeToString(digest[:10])
}

func compactRouteGeometry(points []deliveryRoutePoint, limit int) []deliveryRoutePoint {
	if limit <= 2 || len(points) <= limit {
		return points
	}
	result := make([]deliveryRoutePoint, 0, limit)
	result = append(result, points[0])
	step := float64(len(points)-1) / float64(limit-1)
	for index := 1; index < limit-1; index++ {
		position := int(math.Round(float64(index) * step))
		if position <= 0 {
			position = 1
		}
		if position >= len(points)-1 {
			position = len(points) - 2
		}
		result = append(result, points[position])
	}
	result = append(result, points[len(points)-1])
	return result
}

func directDeliveryRoute(startLat, startLng, endLat, endLng float64) deliveryRoutePlan {
	distance := haversineKM(startLat, startLng, endLat, endLng)
	return deliveryRoutePlan{
		Coordinates:     []deliveryRoutePoint{{Lat: startLat, Lng: startLng}, {Lat: endLat, Lng: endLng}},
		DistanceKM:      math.Round(distance*10) / 10,
		DurationMinutes: int(math.Max(1, math.Ceil((distance/22)*60))),
		Source:          "direct",
		GeneratedAt:     time.Now().UTC(),
	}
}

func (s *Server) deliveryRoadRoute(ctx context.Context, startLat, startLng, endLat, endLng float64) deliveryRoutePlan {
	fallback := directDeliveryRoute(startLat, startLng, endLat, endLng)
	if !validGeoPoint(startLat, startLng) || !validGeoPoint(endLat, endLng) {
		return deliveryRoutePlan{Source: "unavailable", GeneratedAt: time.Now().UTC()}
	}
	cacheKey := routeCacheKey(ctx, startLat, startLng, endLat, endLng)
	if s.redis != nil {
		cacheCtx, cancel := context.WithTimeout(ctx, deliveryGeoTimeout)
		cached, err := s.redis.Get(cacheCtx, cacheKey).Bytes()
		cancel()
		if err == nil && len(cached) > 0 {
			var plan deliveryRoutePlan
			if json.Unmarshal(cached, &plan) == nil && len(plan.Coordinates) >= 2 {
				return plan
			}
		}
	}
	// GEO RD MAP is the primary routing provider for WAMERCIO. The historical
	// OSRM-compatible service remains as a resilience fallback so a temporary
	// GEO RD MAP outage never blocks an order or a delivery.
	if plan, ok := s.geoRouteForDelivery(ctx, startLat, startLng, endLat, endLng); ok && len(plan.Coordinates) >= 2 {
		if s.redis != nil {
			if encoded, err := json.Marshal(plan); err == nil {
				cacheCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), deliveryGeoTimeout)
				_ = s.redis.Set(cacheCtx, cacheKey, encoded, deliveryRouteCacheTTL).Err()
				cancel()
			}
		}
		return plan
	}
	baseURL := strings.TrimSpace(s.cfg.RoutingServiceURL)
	if baseURL == "" || s.routingHTTPClient == nil {
		return fallback
	}
	coordinatePath := strconv.FormatFloat(startLng, 'f', 6, 64) + "," + strconv.FormatFloat(startLat, 'f', 6, 64) + ";" +
		strconv.FormatFloat(endLng, 'f', 6, 64) + "," + strconv.FormatFloat(endLat, 'f', 6, 64)
	routeURL := strings.TrimRight(baseURL, "/") + "/route/v1/driving/" + coordinatePath
	parsed, err := url.Parse(routeURL)
	if err != nil {
		return fallback
	}
	query := parsed.Query()
	query.Set("overview", "full")
	query.Set("geometries", "geojson")
	query.Set("steps", "false")
	query.Set("alternatives", "false")
	parsed.RawQuery = query.Encode()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return fallback
	}
	request.Header.Set("User-Agent", "WAMERCIO/1.0 delivery-routing")
	response, err := s.routingHTTPClient.Do(request)
	if err != nil {
		return fallback
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return fallback
	}
	var payload struct {
		Code   string `json:"code"`
		Routes []struct {
			Distance float64 `json:"distance"`
			Duration float64 `json:"duration"`
			Geometry struct {
				Coordinates [][]float64 `json:"coordinates"`
			} `json:"geometry"`
		} `json:"routes"`
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, 4<<20))
	if decoder.Decode(&payload) != nil || !strings.EqualFold(payload.Code, "Ok") || len(payload.Routes) == 0 {
		return fallback
	}
	points := make([]deliveryRoutePoint, 0, len(payload.Routes[0].Geometry.Coordinates))
	for _, coordinate := range payload.Routes[0].Geometry.Coordinates {
		if len(coordinate) < 2 || !validGeoPoint(coordinate[1], coordinate[0]) {
			continue
		}
		points = append(points, deliveryRoutePoint{Lat: coordinate[1], Lng: coordinate[0]})
	}
	if len(points) < 2 {
		return fallback
	}
	plan := deliveryRoutePlan{
		Coordinates:     compactRouteGeometry(points, maxRouteGeometryPoints),
		DistanceKM:      math.Round((payload.Routes[0].Distance/1000)*10) / 10,
		DurationMinutes: int(math.Max(1, math.Ceil(payload.Routes[0].Duration/60))),
		Source:          "road",
		GeneratedAt:     time.Now().UTC(),
	}
	if s.redis != nil {
		if encoded, err := json.Marshal(plan); err == nil {
			cacheCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), deliveryGeoTimeout)
			_ = s.redis.Set(cacheCtx, cacheKey, encoded, deliveryRouteCacheTTL).Err()
			cancel()
		}
	}
	return plan
}

func (s *Server) deliveryRouteContext(ctx context.Context, orderID string) (deliveryRouteOrderContext, error) {
	var value deliveryRouteOrderContext
	var storeLat, storeLng, customerLat, customerLng sql.NullFloat64
	err := s.db.QueryRow(ctx, `
		SELECT sale.id::text, COALESCE(sale.customer_id::text,''), sale.store_id::text, store.name, store.address,
		       store.latitude, store.longitude,
		       operation.customer_lat, operation.customer_lng,
		       COALESCE(operation.assigned_driver_id::text,''), COALESCE(operation.delivery_zone_id::text,''), sale.status
		FROM sales sale
		JOIN stores store ON store.id=sale.store_id
		JOIN delivery_operations operation ON operation.sale_id=sale.id
		WHERE sale.id=$1::uuid AND sale.order_type='customer'
	`, orderID).Scan(
		&value.OrderID, &value.CustomerID, &value.StoreID, &value.StoreName, &value.StoreAddress,
		&storeLat, &storeLng, &customerLat, &customerLng,
		&value.AssignedDriverID, &value.DeliveryZoneID, &value.Status,
	)
	if err != nil {
		return value, err
	}
	value.HasStoreLocation = storeLat.Valid && storeLng.Valid && validGeoPoint(storeLat.Float64, storeLng.Float64)
	if value.HasStoreLocation {
		value.StoreLat, value.StoreLng = storeLat.Float64, storeLng.Float64
	}
	value.HasCustomerLocation = customerLat.Valid && customerLng.Valid && validGeoPoint(customerLat.Float64, customerLng.Float64)
	if value.HasCustomerLocation {
		value.CustomerLat, value.CustomerLng = customerLat.Float64, customerLng.Float64
	}
	return value, nil
}

func (s *Server) deliveryRouteServiceArea(ctx context.Context, value deliveryRouteOrderContext, driverLocation any) any {
	if strings.TrimSpace(value.DeliveryZoneID) == "" {
		return nil
	}
	zone, err := s.deliveryZoneByID(ctx, value.StoreID, value.DeliveryZoneID)
	if err != nil || !strings.EqualFold(zone.ZoneType, "geofence") {
		return nil
	}
	area := map[string]any{
		"id": zone.ID, "name": zone.NeighborhoodName, "type": "geofence",
		"polygon": geoDeliveryPolygon(zone.GeoPolygon), "geo_geofence_id": zone.GeoGeofenceID,
	}
	if location, ok := driverLocation.(map[string]any); ok {
		lat, hasLat := deliveryLiveFloat(location["lat"])
		lng, hasLng := deliveryLiveFloat(location["lng"])
		if hasLat && hasLng {
			area["driver_inside"] = geoPolygonContains(geoDeliveryPolygon(zone.GeoPolygon), lat, lng)
		}
	}
	return area
}

func (s *Server) deliveryRouteForOrder(w http.ResponseWriter, r *http.Request) {
	orderID := strings.TrimSpace(chi.URLParam(r, "id"))
	value, err := s.deliveryRouteContext(r.Context(), orderID)
	if err != nil {
		writeError(w, err)
		return
	}
	if normalizeOrderStatus(value.Status) == "cancelled" {
		writeError(w, apiError{status: http.StatusConflict, msg: "La entrega fue cancelada y ya no tiene una ruta activa"})
		return
	}
	if staff, ok := r.Context().Value(staffUserContextKey{}).(StaffUser); ok && normalizeStaffRole(staff.Role) == "delivery_driver" {
		if strings.TrimSpace(value.AssignedDriverID) == "" || value.AssignedDriverID != staff.ID {
			writeError(w, apiError{status: http.StatusForbidden, msg: "Esta entrega no está asignada a tu usuario"})
			return
		}
	}
	plan := deliveryRoutePlan{Source: "unavailable", GeneratedAt: time.Now().UTC()}
	if value.HasStoreLocation && value.HasCustomerLocation {
		plan = s.deliveryRoadRoute(r.Context(), value.StoreLat, value.StoreLng, value.CustomerLat, value.CustomerLng)
	}
	driverLocation := s.latestDeliveryDriverLocation(r.Context(), value.AssignedDriverID)
	serviceArea := s.deliveryRouteServiceArea(r.Context(), value, driverLocation)
	var storeLatValue, storeLngValue, customerLatValue, customerLngValue any
	if value.HasStoreLocation {
		storeLatValue, storeLngValue = value.StoreLat, value.StoreLng
	}
	if value.HasCustomerLocation {
		customerLatValue, customerLngValue = value.CustomerLat, value.CustomerLng
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"order_id": orderID,
		"status":   normalizeOrderStatus(value.Status),
		"store": map[string]any{
			"id": value.StoreID, "name": value.StoreName, "address": value.StoreAddress,
			"lat": storeLatValue, "lng": storeLngValue,
		},
		"destination":     map[string]any{"lat": customerLatValue, "lng": customerLngValue},
		"driver_location": driverLocation,
		"service_area":    serviceArea,
		"route":           plan,
	})
}

func customerDeliveryTrackingAllowed(status string) bool {
	return normalizeOrderStatus(status) == "on_the_way"
}

func (s *Server) latestDeliveryDriverLocation(ctx context.Context, driverID string) any {
	if strings.TrimSpace(driverID) == "" {
		return nil
	}
	var lat, lng, accuracy float64
	var heading, speed sql.NullFloat64
	var updatedAt time.Time
	err := s.db.QueryRow(ctx, `
		SELECT lat, lng, accuracy, heading, speed, updated_at
		FROM delivery_driver_locations
		WHERE driver_id=$1::uuid AND updated_at >= now() - interval '4 minutes'
	`, driverID).Scan(&lat, &lng, &accuracy, &heading, &speed, &updatedAt)
	if err != nil {
		return nil
	}
	return map[string]any{
		"lat": lat, "lng": lng, "accuracy": accuracy,
		"heading": floatOrNil(heading), "speed": floatOrNil(speed), "updated_at": updatedAt,
	}
}

func (s *Server) clientDeliveryTracking(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	orderID := strings.TrimSpace(chi.URLParam(r, "id"))
	customerID, _ := r.Context().Value(customerIDContextKey{}).(string)
	value, err := s.deliveryRouteContext(r.Context(), orderID)
	if err != nil {
		writeError(w, err)
		return
	}
	if strings.TrimSpace(customerID) == "" || value.CustomerID != customerID {
		writeError(w, apiError{status: http.StatusNotFound, msg: "Pedido no encontrado"})
		return
	}

	status := normalizeOrderStatus(value.Status)
	if !customerDeliveryTrackingAllowed(status) {
		writeJSON(w, http.StatusOK, map[string]any{
			"order_id":           orderID,
			"status":             status,
			"tracking_available": false,
			"message":            "El seguimiento en vivo estará disponible cuando el pedido salga a entrega",
		})
		return
	}

	plan := deliveryRoutePlan{Source: "unavailable", GeneratedAt: time.Now().UTC()}
	if value.HasStoreLocation && value.HasCustomerLocation {
		plan = s.deliveryRoadRoute(r.Context(), value.StoreLat, value.StoreLng, value.CustomerLat, value.CustomerLng)
	}
	driverLocation := s.latestDeliveryDriverLocation(r.Context(), value.AssignedDriverID)
	serviceArea := s.deliveryRouteServiceArea(r.Context(), value, driverLocation)
	var storeLatValue, storeLngValue, customerLatValue, customerLngValue any
	if value.HasStoreLocation {
		storeLatValue, storeLngValue = value.StoreLat, value.StoreLng
	}
	if value.HasCustomerLocation {
		customerLatValue, customerLngValue = value.CustomerLat, value.CustomerLng
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"order_id":           orderID,
		"status":             status,
		"tracking_available": driverLocation != nil,
		"store": map[string]any{
			"name": value.StoreName, "address": value.StoreAddress,
			"lat": storeLatValue, "lng": storeLngValue,
		},
		"destination":     map[string]any{"lat": customerLatValue, "lng": customerLngValue},
		"driver_location": driverLocation,
		"service_area":    serviceArea,
		"route":           plan,
	})
}
