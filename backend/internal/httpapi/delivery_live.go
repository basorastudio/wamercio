package httpapi

import (
	"database/sql"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type deliveryLiveStore struct {
	ID          string
	Name        string
	Address     string
	Lat         float64
	Lng         float64
	HasLocation bool
}

func deliveryLiveFloat(value any) (float64, bool) {
	if value == nil {
		return 0, false
	}
	text := strings.TrimSpace(fmt.Sprint(value))
	if text == "" || text == "<nil>" {
		return 0, false
	}
	parsed, err := strconv.ParseFloat(text, 64)
	if err != nil {
		return 0, false
	}
	return parsed, true
}

func deliveryLiveStatus(status string) bool {
	switch normalizeOrderStatus(status) {
	case "pending", "preparing", "ready_for_delivery", "on_the_way", "issue":
		return true
	default:
		return false
	}
}

func (s *Server) deliveryLiveStores(r *http.Request, storeFilter string) (map[string]deliveryLiveStore, error) {
	query := `SELECT id::text, name, address, latitude, longitude FROM stores`
	args := []any{}
	if storeFilter != "" {
		query += ` WHERE id=$1::uuid`
		args = append(args, storeFilter)
	}
	rows, err := s.db.Query(r.Context(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	stores := make(map[string]deliveryLiveStore)
	for rows.Next() {
		var store deliveryLiveStore
		var lat, lng sql.NullFloat64
		if err := rows.Scan(&store.ID, &store.Name, &store.Address, &lat, &lng); err != nil {
			return nil, err
		}
		store.HasLocation = lat.Valid && lng.Valid && validGeoPoint(lat.Float64, lng.Float64)
		if store.HasLocation {
			store.Lat, store.Lng = lat.Float64, lng.Float64
		}
		stores[store.ID] = store
	}
	return stores, rows.Err()
}

func (s *Server) adminDeliveryLiveOperations(w http.ResponseWriter, r *http.Request) {
	storeFilter := strings.TrimSpace(r.URL.Query().Get("store_id"))
	stores, err := s.deliveryLiveStores(r, storeFilter)
	if err != nil {
		writeError(w, err)
		return
	}
	orders, err := s.queryDeliveryOrders(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	activeOrders := make([]map[string]any, 0, len(orders))
	drivers := map[string]map[string]any{}
	zoneCache := map[string]DeliveryZone{}
	summary := map[string]int{
		"pending": 0, "preparing": 0, "ready_for_delivery": 0,
		"on_the_way": 0, "issue": 0, "drivers_online": 0,
	}
	for _, order := range orders {
		status := normalizeOrderStatus(fmt.Sprint(order["status"]))
		if !deliveryLiveStatus(status) {
			continue
		}
		orderID := strings.TrimSpace(fmt.Sprint(order["id"]))
		storeID := strings.TrimSpace(fmt.Sprint(order["store_id"]))
		if orderID == "" || storeID == "" || (storeFilter != "" && storeID != storeFilter) {
			continue
		}
		store, ok := stores[storeID]
		if !ok {
			continue
		}
		summary[status]++
		var storeLatValue, storeLngValue any
		if store.HasLocation {
			storeLatValue, storeLngValue = store.Lat, store.Lng
		}
		order["store_location"] = map[string]any{
			"id": store.ID, "name": store.Name, "address": store.Address,
			"lat": storeLatValue, "lng": storeLngValue,
		}
		order["storeLocation"] = order["store_location"]

		customerLat, hasCustomerLat := deliveryLiveFloat(order["customer_lat"])
		customerLng, hasCustomerLng := deliveryLiveFloat(order["customer_lng"])
		plan := deliveryRoutePlan{Source: "unavailable", GeneratedAt: time.Now().UTC()}
		if store.HasLocation && hasCustomerLat && hasCustomerLng && validGeoPoint(customerLat, customerLng) {
			plan = directDeliveryRoute(store.Lat, store.Lng, customerLat, customerLng)
		}
		order["route"] = plan
		trackingAvailable, _ := order["tracking_available"].(bool)
		order["tracking_state"] = "waiting"
		if trackingAvailable && status == "on_the_way" {
			order["tracking_state"] = "live"
		} else if trackingAvailable && status == "ready_for_delivery" {
			order["tracking_state"] = "ready"
		} else if status == "on_the_way" {
			order["tracking_state"] = "offline"
		}
		assignedDriver, _ := order["assigned_driver"].(map[string]any)
		zoneID := strings.TrimSpace(fmt.Sprint(order["delivery_zone_id"]))
		if zoneID != "" {
			cacheKey := storeID + ":" + zoneID
			zone, found := zoneCache[cacheKey]
			if !found {
				if loaded, zoneErr := s.deliveryZoneByID(r.Context(), storeID, zoneID); zoneErr == nil {
					zone = loaded
					zoneCache[cacheKey] = zone
				}
			}
			if strings.EqualFold(zone.ZoneType, "geofence") {
				area := map[string]any{
					"id": zone.ID, "name": zone.NeighborhoodName, "type": "geofence",
					"polygon": geoDeliveryPolygon(zone.GeoPolygon), "geo_geofence_id": zone.GeoGeofenceID,
				}
				if location, ok := order["driver_location"].(map[string]any); ok {
					lat, hasLat := deliveryLiveFloat(location["lat"])
					lng, hasLng := deliveryLiveFloat(location["lng"])
					if hasLat && hasLng {
						area["driver_inside"] = geoPolygonContains(geoDeliveryPolygon(zone.GeoPolygon), lat, lng)
					}
				}
				order["service_area"] = area
				order["serviceArea"] = area
			}
		}
		driverID := strings.TrimSpace(fmt.Sprint(assignedDriver["id"]))
		if driverID != "" {
			driver := drivers[driverID]
			if driver == nil {
				driver = map[string]any{
					"id":            driverID,
					"name":          firstNonEmpty(strings.TrimSpace(fmt.Sprint(assignedDriver["full_name"])), strings.TrimSpace(fmt.Sprint(assignedDriver["name"]))),
					"active_orders": []string{},
					"online":        false,
				}
				drivers[driverID] = driver
			}
			driver["active_orders"] = append(driver["active_orders"].([]string), orderID)
			if location, ok := order["driver_location"].(map[string]any); ok {
				driver["location"] = location
				driver["online"] = true
			}
		}
		activeOrders = append(activeOrders, order)
	}

	driverList := make([]map[string]any, 0, len(drivers))
	for _, driver := range drivers {
		if online, _ := driver["online"].(bool); online {
			summary["drivers_online"]++
		}
		driverList = append(driverList, driver)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"generated_at": time.Now().UTC(),
		"deliveries":   activeOrders,
		"drivers":      driverList,
		"summary":      summary,
	})
}
