package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	"wamercio/backend/internal/platform/tenancy"

	"github.com/redis/go-redis/v9"
)

const storeGeoTimeout = 800 * time.Millisecond

var storeLocationSources = map[string]bool{
	"":         true,
	"device":   true,
	"manual":   true,
	"map":      true,
	"imported": true,
}

func firstInputValue(input map[string]any, keys ...string) (any, bool) {
	for _, key := range keys {
		value, ok := input[key]
		if ok {
			return value, true
		}
	}
	return nil, false
}

func optionalFloat(value any, fieldName string) (*float64, error) {
	if value == nil {
		return nil, nil
	}
	if text, ok := value.(string); ok && strings.TrimSpace(text) == "" {
		return nil, nil
	}
	var parsed float64
	switch typed := value.(type) {
	case json.Number:
		var err error
		parsed, err = typed.Float64()
		if err != nil {
			return nil, badRequest(fmt.Sprintf("%s no es válida", fieldName))
		}
	case float64:
		parsed = typed
	case float32:
		parsed = float64(typed)
	case int:
		parsed = float64(typed)
	case int64:
		parsed = float64(typed)
	default:
		if _, err := fmt.Sscan(strings.TrimSpace(fmt.Sprint(value)), &parsed); err != nil {
			return nil, badRequest(fmt.Sprintf("%s no es válida", fieldName))
		}
	}
	if math.IsNaN(parsed) || math.IsInf(parsed, 0) {
		return nil, badRequest(fmt.Sprintf("%s no es válida", fieldName))
	}
	return &parsed, nil
}

func normalizeStoreLocationInput(input map[string]any) (bool, error) {
	delete(input, "location_updated_at")
	delete(input, "locationUpdatedAt")
	latitudeValue, hasLatitude := firstInputValue(input, "latitude", "lat")
	longitudeValue, hasLongitude := firstInputValue(input, "longitude", "lng", "lon")
	accuracyValue, hasAccuracy := firstInputValue(input, "location_accuracy", "locationAccuracy", "accuracy")
	sourceValue, hasSource := firstInputValue(input, "location_source", "locationSource")

	if !hasLatitude && !hasLongitude && !hasAccuracy && !hasSource {
		return false, nil
	}

	latitude, err := optionalFloat(latitudeValue, "La latitud")
	if err != nil {
		return false, err
	}
	longitude, err := optionalFloat(longitudeValue, "La longitud")
	if err != nil {
		return false, err
	}
	if (latitude == nil) != (longitude == nil) {
		return false, badRequest("La latitud y la longitud deben guardarse juntas")
	}

	for _, key := range []string{"lat", "lng", "lon", "locationAccuracy", "accuracy", "locationSource"} {
		delete(input, key)
	}

	if latitude == nil && longitude == nil {
		input["latitude"] = nil
		input["longitude"] = nil
		input["location_accuracy"] = nil
		input["location_source"] = ""
		input["location_updated_at"] = nil
		return true, nil
	}
	if *latitude < -90 || *latitude > 90 {
		return false, badRequest("La latitud debe estar entre -90 y 90")
	}
	if *longitude < -180 || *longitude > 180 {
		return false, badRequest("La longitud debe estar entre -180 y 180")
	}

	accuracy, err := optionalFloat(accuracyValue, "La precisión de la ubicación")
	if err != nil {
		return false, err
	}
	if accuracy != nil && *accuracy < 0 {
		return false, badRequest("La precisión de la ubicación no puede ser negativa")
	}
	source := strings.ToLower(strings.TrimSpace(fmt.Sprint(sourceValue)))
	if source == "<nil>" || source == "" {
		source = "manual"
	}
	if !storeLocationSources[source] {
		return false, badRequest("El origen de la ubicación no es válido")
	}

	input["latitude"] = *latitude
	input["longitude"] = *longitude
	if accuracy == nil {
		input["location_accuracy"] = nil
	} else {
		input["location_accuracy"] = *accuracy
	}
	input["location_source"] = source
	input["location_updated_at"] = time.Now().UTC()
	return true, nil
}

func normalizeTenantProvisionLocation(input *tenancy.TenantProvisionInput) error {
	if input == nil {
		return nil
	}
	if input.Latitude == nil && input.Longitude == nil {
		input.LocationAccuracy = nil
		input.LocationSource = ""
		return nil
	}
	if input.Latitude == nil || input.Longitude == nil {
		return badRequest("La latitud y la longitud deben guardarse juntas")
	}
	if math.IsNaN(*input.Latitude) || math.IsInf(*input.Latitude, 0) || *input.Latitude < -90 || *input.Latitude > 90 {
		return badRequest("La latitud debe estar entre -90 y 90")
	}
	if math.IsNaN(*input.Longitude) || math.IsInf(*input.Longitude, 0) || *input.Longitude < -180 || *input.Longitude > 180 {
		return badRequest("La longitud debe estar entre -180 y 180")
	}
	if input.LocationAccuracy != nil && (math.IsNaN(*input.LocationAccuracy) || math.IsInf(*input.LocationAccuracy, 0) || *input.LocationAccuracy < 0) {
		return badRequest("La precisión de la ubicación no puede ser negativa")
	}
	input.LocationSource = strings.ToLower(strings.TrimSpace(input.LocationSource))
	if input.LocationSource == "" {
		input.LocationSource = "manual"
	}
	if !storeLocationSources[input.LocationSource] {
		return badRequest("El origen de la ubicación no es válido")
	}
	return nil
}

func tenantGeoPrefix(ctx context.Context) string {
	if tenant, ok := tenancy.FromContext(ctx); ok && strings.TrimSpace(tenant.ID) != "" {
		return "wamercio:tenant:" + strings.TrimSpace(tenant.ID) + ":geo"
	}
	return "wamercio:tenant:default:geo"
}

func storeGeoKey(ctx context.Context) string {
	return tenantGeoPrefix(ctx) + ":stores"
}

func storeGeoMember(storeID string) string {
	return "store:" + strings.TrimSpace(storeID)
}

func (s *Server) syncStoreGeoLocation(ctx context.Context, store Store) {
	if s.redis == nil || strings.TrimSpace(store.ID) == "" {
		return
	}
	geoCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), storeGeoTimeout)
	defer cancel()
	key := storeGeoKey(ctx)
	member := storeGeoMember(store.ID)
	if !store.Latitude.Valid || !store.Longitude.Valid {
		_ = s.redis.ZRem(geoCtx, key, member).Err()
		return
	}
	_ = s.redis.GeoAdd(geoCtx, key, &redis.GeoLocation{
		Name:      member,
		Latitude:  store.Latitude.Float64,
		Longitude: store.Longitude.Float64,
	}).Err()
}

func (s *Server) removeStoreGeoLocation(ctx context.Context, storeID string) {
	if s.redis == nil || strings.TrimSpace(storeID) == "" {
		return
	}
	geoCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), storeGeoTimeout)
	defer cancel()
	_ = s.redis.ZRem(geoCtx, storeGeoKey(ctx), storeGeoMember(storeID)).Err()
}

func (s *Server) tenantStoreCoordinates(ctx context.Context) (float64, float64, bool) {
	if s.redis != nil {
		geoCtx, cancel := context.WithTimeout(ctx, storeGeoTimeout)
		members, err := s.redis.ZRange(geoCtx, storeGeoKey(ctx), 0, 0).Result()
		if err == nil && len(members) > 0 {
			positions, positionErr := s.redis.GeoPos(geoCtx, storeGeoKey(ctx), members[0]).Result()
			if positionErr == nil && len(positions) > 0 && positions[0] != nil && validGeoPoint(positions[0].Latitude, positions[0].Longitude) {
				cancel()
				return positions[0].Latitude, positions[0].Longitude, true
			}
		}
		cancel()
	}

	var storeID string
	var latitude, longitude sql.NullFloat64
	if err := s.db.QueryRow(ctx, `
		SELECT id::text, latitude, longitude
		FROM stores
		WHERE active=true AND latitude IS NOT NULL AND longitude IS NOT NULL
		ORDER BY created_at
		LIMIT 1
	`).Scan(&storeID, &latitude, &longitude); err != nil || !latitude.Valid || !longitude.Valid || !validGeoPoint(latitude.Float64, longitude.Float64) {
		return 0, 0, false
	}
	s.syncStoreGeoLocation(ctx, Store{
		ID:        storeID,
		Latitude:  latitude,
		Longitude: longitude,
	})
	return latitude.Float64, longitude.Float64, true
}
