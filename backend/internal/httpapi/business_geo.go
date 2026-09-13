package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"wamercio/backend/internal/integrations/geordmap"
	"wamercio/backend/internal/platform/tenancy"
)

const geoBusinessServiceName = "delivery"

type geoDeliveryPoint struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

func geoDeliveryPolygon(raw json.RawMessage) []geoDeliveryPoint {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var points []geoDeliveryPoint
	if json.Unmarshal(raw, &points) == nil {
		return points
	}
	return nil
}

func geoDeliveryPolygonJSON(points []geoDeliveryPoint) json.RawMessage {
	raw, err := json.Marshal(points)
	if err != nil {
		return json.RawMessage(`[]`)
	}
	return raw
}

func validGeoDeliveryPolygon(points []geoDeliveryPoint) bool {
	if len(points) < 3 || len(points) > 250 {
		return false
	}
	for _, point := range points {
		if !validGeoPoint(point.Lat, point.Lng) {
			return false
		}
	}
	return true
}

func geoPolygonContains(points []geoDeliveryPoint, lat, lng float64) bool {
	if !validGeoPoint(lat, lng) || len(points) < 3 {
		return false
	}
	inside := false
	for current, previous := 0, len(points)-1; current < len(points); previous, current = current, current+1 {
		a := points[current]
		b := points[previous]
		crosses := (a.Lat > lat) != (b.Lat > lat)
		if !crosses {
			continue
		}
		denominator := b.Lat - a.Lat
		if math.Abs(denominator) < 1e-12 {
			continue
		}
		crossLng := (b.Lng-a.Lng)*(lat-a.Lat)/denominator + a.Lng
		if lng < crossLng {
			inside = !inside
		}
	}
	return inside
}

func customerGeoCoordinates(customer Customer) (float64, float64, bool) {
	latText := strings.TrimSpace(customer.Lat)
	lngText := strings.TrimSpace(customer.Lng)
	if latText == "" || lngText == "" {
		return 0, 0, false
	}
	var lat, lng float64
	if _, err := fmt.Sscan(latText, &lat); err != nil {
		return 0, 0, false
	}
	if _, err := fmt.Sscan(lngText, &lng); err != nil {
		return 0, 0, false
	}
	return lat, lng, validGeoPoint(lat, lng)
}

func (s *Server) businessGeoStatus(w http.ResponseWriter, r *http.Request) {
	config, err := s.readPlatformGeoRDMapConfig(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	payload := map[string]any{
		"enabled":         geoConfigReady(config),
		"source":          "GEO RD MAP",
		"base_url":        config.BaseURL,
		"territories":     geoConfigReady(config),
		"geolocation":     geoConfigReady(config),
		"routing":         geoConfigReady(config),
		"geofences":       geoConfigReady(config),
		"live_tracking":   true,
		"private_api_key": config.APIKey != "",
	}
	if geoConfigReady(config) {
		if status, statusErr := s.geoTerritoryStatus(r.Context(), config, false); statusErr == nil {
			payload["postgres"] = status.Postgres
			payload["redis"] = status.Redis
			payload["ready"] = true
		} else {
			payload["ready"] = false
			payload["warning"] = statusErr.Error()
		}
	}
	writeJSON(w, http.StatusOK, payload)
}

func (s *Server) businessGeoGeocode(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Query string `json:"query"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	config, err := s.readPlatformGeoRDMapConfig(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	if !geoConfigReady(config) {
		writeError(w, geoConfigurationRequiredError())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), time.Duration(config.TimeoutSeconds)*time.Second)
	defer cancel()
	result, err := s.geoRDMapClient(config).Geocode(ctx, input.Query)
	if err != nil {
		writeError(w, geoFriendlyError(err))
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) businessGeoReverseGeocode(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if !validGeoPoint(input.Lat, input.Lng) {
		writeError(w, badRequest("Las coordenadas no son válidas"))
		return
	}
	config, err := s.readPlatformGeoRDMapConfig(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	if !geoConfigReady(config) {
		writeError(w, geoConfigurationRequiredError())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), time.Duration(config.TimeoutSeconds)*time.Second)
	defer cancel()
	result, err := s.geoRDMapClient(config).ReverseGeocode(ctx, geordmap.Point{Lat: input.Lat, Lng: input.Lng})
	if err != nil {
		writeError(w, geoFriendlyError(err))
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) geoRouteForDelivery(ctx context.Context, startLat, startLng, endLat, endLng float64) (deliveryRoutePlan, bool) {
	config, err := s.readPlatformGeoRDMapConfig(ctx)
	if err != nil || !geoConfigReady(config) {
		return deliveryRoutePlan{}, false
	}
	requestCtx, cancel := context.WithTimeout(ctx, time.Duration(config.TimeoutSeconds)*time.Second)
	defer cancel()
	result, err := s.geoRDMapClient(config).Route(requestCtx, geordmap.RouteInput{
		Origin:      geordmap.Point{Lat: startLat, Lng: startLng},
		Destination: geordmap.Point{Lat: endLat, Lng: endLng},
		Profile:     "driving",
	})
	if err != nil || len(result.Coordinates) < 2 {
		return deliveryRoutePlan{}, false
	}
	points := make([]deliveryRoutePoint, 0, len(result.Coordinates))
	for _, point := range result.Coordinates {
		if validGeoPoint(point.Lat, point.Lng) {
			points = append(points, deliveryRoutePoint{Lat: point.Lat, Lng: point.Lng})
		}
	}
	if len(points) < 2 {
		return deliveryRoutePlan{}, false
	}
	return deliveryRoutePlan{
		Coordinates:     compactRouteGeometry(points, maxRouteGeometryPoints),
		DistanceKM:      math.Round(result.DistanceKM*10) / 10,
		DurationMinutes: maxInt(1, result.DurationMinutes),
		Source:          "geo_rd_map",
		GeneratedAt:     time.Now().UTC(),
	}, true
}

func (s *Server) geoSyncDeliveryZone(ctx context.Context, zone DeliveryZone) (DeliveryZone, error) {
	if zone.ZoneType != "geofence" {
		return zone, nil
	}
	points := geoDeliveryPolygon(zone.GeoPolygon)
	if !validGeoDeliveryPolygon(points) {
		return zone, badRequest("La geocerca necesita al menos 3 puntos válidos")
	}
	config, err := s.readPlatformGeoRDMapConfig(ctx)
	if err != nil {
		return zone, err
	}
	if !geoConfigReady(config) {
		return zone, geoConfigurationRequiredError()
	}
	tenant, _ := tenancy.FromContext(ctx)
	geoPoints := make([]geordmap.Point, 0, len(points))
	for _, point := range points {
		geoPoints = append(geoPoints, geordmap.Point{Lat: point.Lat, Lng: point.Lng})
	}
	input := geordmap.GeofenceInput{
		Name:        firstNonEmpty(zone.NeighborhoodName, "Zona de entrega"),
		Type:        "service_area",
		Service:     firstNonEmpty(zone.GeoService, geoBusinessServiceName),
		Description: "Zona de entrega administrada desde WAMERCIO",
		Polygon:     geoPoints,
		Metadata: map[string]any{
			"platform":  "wamercio",
			"tenant_id": tenant.ID,
			"store_id":  zone.StoreID,
			"zone_id":   zone.ID,
		},
	}
	requestCtx, cancel := context.WithTimeout(ctx, time.Duration(config.TimeoutSeconds)*time.Second)
	defer cancel()
	var remote geordmap.Geofence
	if strings.TrimSpace(zone.GeoGeofenceID) == "" {
		remote, err = s.geoRDMapClient(config).CreateGeofence(requestCtx, input)
	} else {
		remote, err = s.geoRDMapClient(config).UpdateGeofence(requestCtx, zone.GeoGeofenceID, input)
	}
	if err != nil {
		return zone, geoFriendlyError(err)
	}
	if strings.TrimSpace(remote.ID) != "" {
		zone.GeoGeofenceID = strings.TrimSpace(remote.ID)
	}
	zone.GeoSyncStatus = "synced"
	zone.GeoSyncError = ""
	now := time.Now().UTC()
	zone.GeoSyncedAt = &now
	return zone, nil
}

func (s *Server) geoDeleteDeliveryZone(ctx context.Context, zone DeliveryZone) {
	if zone.ZoneType != "geofence" || strings.TrimSpace(zone.GeoGeofenceID) == "" {
		return
	}
	config, err := s.readPlatformGeoRDMapConfig(ctx)
	if err != nil || !geoConfigReady(config) {
		return
	}
	requestCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), time.Duration(config.TimeoutSeconds)*time.Second)
	defer cancel()
	_ = s.geoRDMapClient(config).DeleteGeofence(requestCtx, zone.GeoGeofenceID)
}
