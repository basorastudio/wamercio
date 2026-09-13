package httpapi

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	deliveryGeoTimeout           = 800 * time.Millisecond
	deliveryDriverPresenceTTL    = 4 * time.Minute
	deliveryDestinationMemberTag = "order:"
)

func deliveryDriversGeoKey(ctx context.Context) string {
	return tenantGeoPrefix(ctx) + ":drivers:live"
}

func deliveryDestinationsGeoKey(ctx context.Context) string {
	return tenantGeoPrefix(ctx) + ":deliveries:active"
}

func deliveryDriverGeoMember(driverID string) string {
	return "driver:" + strings.TrimSpace(driverID)
}

func deliveryDriverPresenceKey(ctx context.Context, driverID string) string {
	return tenantGeoPrefix(ctx) + ":driver:" + strings.TrimSpace(driverID) + ":presence"
}

func deliveryDestinationGeoMember(orderID string) string {
	return deliveryDestinationMemberTag + strings.TrimSpace(orderID)
}

func validGeoPoint(latitude, longitude float64) bool {
	return !math.IsNaN(latitude) && !math.IsInf(latitude, 0) && latitude >= -90 && latitude <= 90 &&
		!math.IsNaN(longitude) && !math.IsInf(longitude, 0) && longitude >= -180 && longitude <= 180
}

func optionalGeoMetric(value *float64) float64 {
	if value == nil || math.IsNaN(*value) || math.IsInf(*value, 0) {
		return 0
	}
	return *value
}

func (s *Server) syncDeliveryDriverGeoLocation(ctx context.Context, driverID string, latitude, longitude, accuracy float64, heading, speed *float64, updatedAt time.Time) {
	if s.redis == nil || strings.TrimSpace(driverID) == "" || !validGeoPoint(latitude, longitude) {
		return
	}
	geoCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), deliveryGeoTimeout)
	defer cancel()
	member := deliveryDriverGeoMember(driverID)
	_ = s.redis.GeoAdd(geoCtx, deliveryDriversGeoKey(ctx), &redis.GeoLocation{
		Name:      member,
		Latitude:  latitude,
		Longitude: longitude,
	}).Err()
	presence := fmt.Sprintf(
		`{"updated_at":%q,"accuracy":%.2f,"heading":%.2f,"speed":%.2f}`,
		updatedAt.UTC().Format(time.RFC3339Nano), math.Max(0, accuracy), optionalGeoMetric(heading), optionalGeoMetric(speed),
	)
	_ = s.redis.Set(geoCtx, deliveryDriverPresenceKey(ctx, driverID), presence, deliveryDriverPresenceTTL).Err()
}

func (s *Server) deliveryDriverGeoCoordinates(ctx context.Context, driverID string) (float64, float64, bool) {
	if s.redis == nil || strings.TrimSpace(driverID) == "" {
		return 0, 0, false
	}
	geoCtx, cancel := context.WithTimeout(ctx, deliveryGeoTimeout)
	defer cancel()
	present, err := s.redis.Exists(geoCtx, deliveryDriverPresenceKey(ctx, driverID)).Result()
	if err != nil || present == 0 {
		return 0, 0, false
	}
	positions, err := s.redis.GeoPos(geoCtx, deliveryDriversGeoKey(ctx), deliveryDriverGeoMember(driverID)).Result()
	if err != nil || len(positions) == 0 || positions[0] == nil {
		return 0, 0, false
	}
	latitude, longitude := positions[0].Latitude, positions[0].Longitude
	if !validGeoPoint(latitude, longitude) {
		return 0, 0, false
	}
	return latitude, longitude, true
}

func (s *Server) clearDeliveryDriverGeoLocation(ctx context.Context, driverID string) {
	if s.redis == nil || strings.TrimSpace(driverID) == "" {
		return
	}
	geoCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), deliveryGeoTimeout)
	defer cancel()
	_ = s.redis.ZRem(geoCtx, deliveryDriversGeoKey(ctx), deliveryDriverGeoMember(driverID)).Err()
	_ = s.redis.Del(geoCtx, deliveryDriverPresenceKey(ctx, driverID)).Err()
}

func (s *Server) syncActiveDeliveryGeoDestination(ctx context.Context, orderID string) {
	if s.redis == nil || strings.TrimSpace(orderID) == "" {
		return
	}
	var latitude, longitude sql.NullFloat64
	var status string
	err := s.db.QueryRow(ctx, `
		SELECT operation.customer_lat, operation.customer_lng, sale.status
		FROM delivery_operations operation
		JOIN sales sale ON sale.id=operation.sale_id
		WHERE operation.sale_id=$1::uuid
	`, orderID).Scan(&latitude, &longitude, &status)
	geoCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), deliveryGeoTimeout)
	defer cancel()
	key := deliveryDestinationsGeoKey(ctx)
	member := deliveryDestinationGeoMember(orderID)
	if err != nil || !latitude.Valid || !longitude.Valid || !validGeoPoint(latitude.Float64, longitude.Float64) {
		_ = s.redis.ZRem(geoCtx, key, member).Err()
		return
	}
	switch normalizeOrderStatus(status) {
	case "pending", "preparing", "ready_for_delivery", "on_the_way", "issue":
		_ = s.redis.GeoAdd(geoCtx, key, &redis.GeoLocation{
			Name:      member,
			Latitude:  latitude.Float64,
			Longitude: longitude.Float64,
		}).Err()
	default:
		_ = s.redis.ZRem(geoCtx, key, member).Err()
	}
}
