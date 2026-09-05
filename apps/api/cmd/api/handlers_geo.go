package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
	"wamercio/api/internal/auth"
	"wamercio/api/internal/geord"
	"wamercio/api/internal/httpx"
	"wamercio/api/internal/store"

	"github.com/go-chi/chi/v5"
)

func (a *app) geoRateAllowed(ctx context.Context, flow, ip string) bool {
	if a.rdb == nil {
		return true
	}
	key := "wamercio:geo:public:" + flow + ":" + ip
	n, err := a.rdb.Incr(ctx, key).Result()
	if err != nil {
		return true
	}
	if n == 1 {
		_ = a.rdb.Expire(ctx, key, time.Minute).Err()
	}
	return n <= int64(a.cfg.GeoPublicRateLimit)
}

func (a *app) requireGeo(w http.ResponseWriter) bool {
	if a.geo == nil || !a.geo.Configured() {
		httpx.Error(w, 503, "GEO RD MAP no está configurado")
		return false
	}
	return true
}

func (a *app) geoSelectors(w http.ResponseWriter, r *http.Request) {
	if !a.requireGeo(w) || !a.geoRateAllowed(r.Context(), "selectors", requestIP(r)) {
		if a.geo != nil && a.geo.Configured() {
			httpx.Error(w, 429, "demasiadas consultas geográficas; intenta nuevamente en un minuto")
		}
		return
	}
	bundle, err := a.geo.Selectors(r.Context(), r.URL.Query().Get("provinceCode"), r.URL.Query().Get("cityId"), r.URL.Query().Get("includeCustom") != "false")
	if err != nil {
		httpx.Error(w, 502, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "data": bundle})
}

func (a *app) geoSearch(w http.ResponseWriter, r *http.Request)       { a.geoSearchCommon(w, r, false) }
func (a *app) geoAutocomplete(w http.ResponseWriter, r *http.Request) { a.geoSearchCommon(w, r, true) }
func (a *app) geoSearchCommon(w http.ResponseWriter, r *http.Request, autocomplete bool) {
	if !a.requireGeo(w) {
		return
	}
	flow := "search"
	if autocomplete {
		flow = "autocomplete"
	}
	if !a.geoRateAllowed(r.Context(), flow, requestIP(r)) {
		httpx.Error(w, 429, "demasiadas búsquedas; intenta nuevamente en un minuto")
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		httpx.Error(w, 400, "consulta requerida")
		return
	}
	var lat, lng *float64
	if v, err := strconv.ParseFloat(r.URL.Query().Get("lat"), 64); err == nil {
		lat = &v
	}
	if v, err := strconv.ParseFloat(r.URL.Query().Get("lng"), 64); err == nil {
		lng = &v
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 10
	}
	if limit > 30 {
		limit = 30
	}
	data, err := a.geo.Search(r.Context(), q, lat, lng, limit, autocomplete)
	if err != nil {
		httpx.Error(w, 502, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "data": data})
}

func (a *app) geoReverse(w http.ResponseWriter, r *http.Request) {
	if !a.requireGeo(w) {
		return
	}
	if !a.geoRateAllowed(r.Context(), "reverse", requestIP(r)) {
		httpx.Error(w, 429, "demasiadas consultas; intenta nuevamente en un minuto")
		return
	}
	lat, lng, ok := parseRDCoords(r.URL.Query().Get("lat"), r.URL.Query().Get("lng"))
	if !ok {
		httpx.Error(w, 422, "coordenadas fuera de República Dominicana")
		return
	}
	data, err := a.geo.Reverse(r.Context(), lat, lng)
	if err != nil {
		httpx.Error(w, 502, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "data": data})
}

func (a *app) geoConfirmSelection(w http.ResponseWriter, r *http.Request) {
	if !a.requireGeo(w) {
		return
	}
	if !a.geoRateAllowed(r.Context(), "selection", requestIP(r)) {
		httpx.Error(w, 429, "demasiadas consultas; intenta nuevamente en un minuto")
		return
	}
	var in geord.PlaceSelectionRequest
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "selección inválida")
		return
	}
	data, err := a.geo.ConfirmSelection(r.Context(), in)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "data": data})
}

func (a *app) geoValidateAddress(w http.ResponseWriter, r *http.Request) {
	if !a.requireGeo(w) {
		return
	}
	if !a.geoRateAllowed(r.Context(), "validate-address", requestIP(r)) {
		httpx.Error(w, 429, "demasiadas validaciones; intenta nuevamente en un minuto")
		return
	}
	var in geord.AddressValidationRequest
	if httpx.Decode(r, &in) != nil || !coordsInsideRD(in.Lat, in.Lng) {
		httpx.Error(w, 422, "ubicación inválida")
		return
	}
	data, err := a.geo.ValidateAddress(r.Context(), in)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	if !data.InsideCountry {
		httpx.Error(w, 422, "la ubicación debe estar dentro de República Dominicana")
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "data": data})
}

func (a *app) geoSuggestNeighborhood(w http.ResponseWriter, r *http.Request) {
	if !a.requireGeo(w) {
		return
	}
	if !a.geoRateAllowed(r.Context(), "neighborhood-suggest", requestIP(r)) {
		httpx.Error(w, 429, "demasiadas sugerencias; intenta nuevamente en un minuto")
		return
	}
	var in struct {
		TenantSlug       string `json:"tenant_slug"`
		Name             string `json:"name"`
		ProvinceCode     string `json:"provinceCode"`
		ProvinceName     string `json:"provinceName"`
		MunicipalityCode string `json:"municipalityCode"`
		MunicipalityName string `json:"municipalityName"`
		DistrictCode     string `json:"districtCode"`
		CityID           string `json:"cityId"`
		SubmittedPhone   string `json:"submittedPhone"`
	}
	if httpx.Decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		httpx.Error(w, 400, "nombre del barrio requerido")
		return
	}
	tenantID := ""
	if in.TenantSlug != "" {
		if t, err := a.st.PublicTenant(r.Context(), in.TenantSlug); err == nil {
			tenantID = t.ID
		}
	}
	data, err := a.geo.SuggestNeighborhood(r.Context(), tenantID, geord.CustomNeighborhoodSuggestionRequest{Name: in.Name, ProvinceCode: in.ProvinceCode, ProvinceName: in.ProvinceName, MunicipalityCode: in.MunicipalityCode, MunicipalityName: in.MunicipalityName, DistrictCode: in.DistrictCode, CityID: in.CityID, SubmittedRole: "cliente", SubmittedPhone: in.SubmittedPhone, SubmittedName: "wamercio"})
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 202, map[string]any{"ok": true, "data": data})
}

func (a *app) geoMapConfig(w http.ResponseWriter, r *http.Request) {
	if !a.requireGeo(w) {
		return
	}
	if !a.geoRateAllowed(r.Context(), "map-config", requestIP(r)) {
		httpx.Error(w, 429, "límite de mapa excedido")
		return
	}
	cfg, err := a.geo.MapConfig(r.Context())
	if err != nil {
		httpx.Error(w, 502, err.Error())
		return
	}
	// Never expose the upstream API key or require the browser to call GEO RD MAP directly.
	cfg.TileURL = ""
	cfg.VectorTileURL = "/api/backend/api/v1/public/geo/map/tiles/{z}/{x}/{y}.pbf"
	httpx.JSON(w, 200, map[string]any{"ok": true, "data": cfg})
}

func (a *app) geoMapFeatures(w http.ResponseWriter, r *http.Request) {
	if !a.requireGeo(w) {
		return
	}
	if !a.geoRateAllowed(r.Context(), "map-features", requestIP(r)) {
		httpx.Error(w, 429, "límite de mapa excedido")
		return
	}
	bbox := strings.TrimSpace(r.URL.Query().Get("bbox"))
	if bbox == "" {
		httpx.Error(w, 400, "bbox requerido")
		return
	}
	zoom, _ := strconv.Atoi(r.URL.Query().Get("zoom"))
	raw, err := a.geo.MapFeatures(r.Context(), bbox, zoom, r.URL.Query().Get("layers"))
	if err != nil {
		httpx.Error(w, 502, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(200)
	_, _ = w.Write(raw)
}

func (a *app) geoVectorTile(w http.ResponseWriter, r *http.Request) {
	if !a.requireGeo(w) {
		return
	}
	if !a.geoRateAllowed(r.Context(), "tiles", requestIP(r)) {
		httpx.Error(w, 429, "límite de mapa excedido")
		return
	}
	z, e1 := strconv.Atoi(chi.URLParam(r, "z"))
	x, e2 := strconv.Atoi(chi.URLParam(r, "x"))
	y, e3 := strconv.Atoi(chi.URLParam(r, "y"))
	if e1 != nil || e2 != nil || e3 != nil || z < 0 || z > 22 {
		httpx.Error(w, 400, "tesela inválida")
		return
	}
	body, ct, err := a.geo.VectorTile(r.Context(), z, x, y, r.URL.Query().Get("layers"))
	if err != nil {
		httpx.Error(w, 502, err.Error())
		return
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.WriteHeader(200)
	_, _ = w.Write(body)
}

func (a *app) geoRoute(w http.ResponseWriter, r *http.Request) {
	if !a.requireGeo(w) {
		return
	}
	if !a.geoRateAllowed(r.Context(), "route", requestIP(r)) {
		httpx.Error(w, 429, "demasiadas rutas; intenta nuevamente en un minuto")
		return
	}
	var in geord.RouteRequest
	if httpx.Decode(r, &in) != nil || len(in.Locations) < 2 {
		httpx.Error(w, 400, "origen y destino requeridos")
		return
	}
	for _, p := range in.Locations {
		if !coordsInsideRD(p.Lat, p.Lon) {
			httpx.Error(w, 422, "la ruta debe permanecer dentro de República Dominicana")
			return
		}
	}
	data, err := a.geo.Route(r.Context(), in)
	if err != nil {
		httpx.Error(w, 502, err.Error())
		return
	}
	distance, duration := routeSummary(data)
	httpx.JSON(w, 200, map[string]any{"ok": true, "data": data, "summary": map[string]any{"distance_km": distance, "duration_seconds": duration}})
}

func (a *app) dashboardGeoGeofences(w http.ResponseWriter, r *http.Request) {
	if !a.requireGeo(w) {
		return
	}
	data, err := a.geo.Geofences(r.Context(), r.URL.Query().Get("category"), firstNonEmpty(r.URL.Query().Get("serviceType"), "delivery"))
	if err != nil {
		httpx.Error(w, 502, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "geofences": data})
}
func (a *app) dashboardGeoGeofence(w http.ResponseWriter, r *http.Request) {
	if !a.requireGeo(w) {
		return
	}
	data, err := a.geo.Geofence(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, 404, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "geofence": data})
}
func (a *app) importGeoDeliveryZone(w http.ResponseWriter, r *http.Request) {
	if !a.requireGeo(w) {
		return
	}
	claims := auth.From(r)
	var in struct {
		GeofenceID string  `json:"geofence_id"`
		Fee        float64 `json:"fee"`
		Priority   int     `json:"priority"`
	}
	if httpx.Decode(r, &in) != nil || strings.TrimSpace(in.GeofenceID) == "" || in.Fee < 0 {
		httpx.Error(w, 400, "datos de zona inválidos")
		return
	}
	g, err := a.geo.Geofence(r.Context(), in.GeofenceID)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	if !g.Active {
		httpx.Error(w, 422, "la geocerca no está activa")
		return
	}
	if g.ServiceType != "" && g.ServiceType != "delivery" {
		httpx.Error(w, 422, "la geocerca no corresponde al servicio delivery")
		return
	}
	z, err := a.st.ImportGeoDeliveryZone(r.Context(), claims.TenantID, store.GeoDeliveryZoneInput{GeofenceID: g.ID, Name: g.Name, Category: g.Category, ServiceType: firstNonEmpty(g.ServiceType, "delivery"), Fee: in.Fee, Priority: in.Priority, Properties: g.Properties, Geometry: g.Geometry})
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "zone": z})
}

type deliveryQuoteResolved struct {
	Serviceable         bool
	Fee                 float64
	Zone                store.DeliveryZone
	Matched             bool
	DistanceKm          float64
	DurationSeconds     int
	Route               any
	ContainingGeofences []geord.GeofenceSummary
	Reason              string
}

func (a *app) resolveDeliveryQuote(ctx context.Context, slug string, lat, lng float64) (deliveryQuoteResolved, error) {
	var out deliveryQuoteResolved
	cfg, err := a.st.TenantDeliveryGeoConfig(ctx, slug)
	if err != nil {
		return out, err
	}
	inside, err := a.geo.GeofencesContains(ctx, lat, lng, "", "delivery")
	if err != nil {
		return out, err
	}
	ids := make([]string, 0, len(inside))
	for _, g := range inside {
		ids = append(ids, g.ID)
	}
	zone, matched, err := a.st.DeliveryZoneByContainingGeofences(ctx, cfg.TenantID, ids)
	if err != nil {
		return out, err
	}
	hasZones, _ := a.st.TenantHasGeoDeliveryZones(ctx, cfg.TenantID)
	out.Serviceable = matched || !hasZones
	out.Fee = cfg.DefaultDeliveryFee
	out.Zone = zone
	out.Matched = matched
	out.ContainingGeofences = inside
	if matched {
		out.Fee = zone.Fee
	}
	if !out.Serviceable {
		out.Reason = "La ubicación está fuera de las zonas de delivery configuradas por el negocio."
	}
	if out.Serviceable && coordsInsideRD(cfg.Latitude, cfg.Longitude) {
		if data, routeErr := a.geo.Route(ctx, geord.RouteRequest{Locations: []geord.RouteLocation{{Lat: cfg.Latitude, Lon: cfg.Longitude}, {Lat: lat, Lon: lng}}, Costing: "auto", Units: "kilometers", Language: "es-ES"}); routeErr == nil {
			out.Route = data
			out.DistanceKm, out.DurationSeconds = routeSummary(data)
		}
	}
	return out, nil
}

func (a *app) geoDeliveryQuote(w http.ResponseWriter, r *http.Request) {
	if !a.requireGeo(w) {
		return
	}
	if !a.geoRateAllowed(r.Context(), "delivery-quote", requestIP(r)) {
		httpx.Error(w, 429, "demasiadas cotizaciones; intenta nuevamente en un minuto")
		return
	}
	lat, lng, ok := parseRDCoords(r.URL.Query().Get("lat"), r.URL.Query().Get("lng"))
	if !ok {
		httpx.Error(w, 422, "ubicación de entrega inválida")
		return
	}
	q, err := a.resolveDeliveryQuote(r.Context(), chi.URLParam(r, "slug"), lat, lng)
	if err != nil {
		httpx.Error(w, 502, err.Error())
		return
	}
	result := map[string]any{"serviceable": q.Serviceable, "fee": q.Fee, "distance_km": q.DistanceKm, "duration_seconds": q.DurationSeconds, "route": q.Route, "containing_geofences": q.ContainingGeofences}
	if q.Matched {
		result["zone"] = q.Zone
	} else if q.Reason != "" {
		result["reason"] = q.Reason
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "quote": result})
}

func parseRDCoords(latS, lngS string) (float64, float64, bool) {
	lat, e1 := strconv.ParseFloat(latS, 64)
	lng, e2 := strconv.ParseFloat(lngS, 64)
	return lat, lng, e1 == nil && e2 == nil && coordsInsideRD(lat, lng)
}
func coordsInsideRD(lat, lng float64) bool {
	return lat >= 17.0 && lat <= 20.5 && lng >= -72.5 && lng <= -68.0
}
func firstNonEmpty(v, d string) string {
	if strings.TrimSpace(v) != "" {
		return v
	}
	return d
}
func routeSummary(data map[string]any) (float64, int) {
	// Valhalla normally returns trip.summary.{length,time}; keep defensive fallbacks for proxy variations.
	var summary map[string]any
	if trip, ok := data["trip"].(map[string]any); ok {
		summary, _ = trip["summary"].(map[string]any)
	}
	if summary == nil {
		summary, _ = data["summary"].(map[string]any)
	}
	if summary == nil {
		return 0, 0
	}
	d := number(summary["length"])
	if d == 0 {
		d = number(summary["distance_km"])
	}
	t := int(number(summary["time"]))
	if t == 0 {
		t = int(number(summary["duration_seconds"]))
	}
	return d, t
}
func number(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case float32:
		return float64(x)
	case int:
		return float64(x)
	case int64:
		return float64(x)
	case json.Number:
		f, _ := x.Float64()
		return f
	case string:
		f, _ := strconv.ParseFloat(x, 64)
		return f
	}
	return 0
}

type normalizedGeoAddress struct {
	ProvinceCode, ProvinceName, CityID, CityName, NeighborhoodID, NeighborhoodName string
	GeoID, Label, Source, Street                                                   string
	Latitude, Longitude                                                            float64
}

func (a *app) normalizeGeoAddress(ctx context.Context, provinceCode, cityID, neighborhoodID string, lat, lng float64) (normalizedGeoAddress, error) {
	var out normalizedGeoAddress
	if a.geo == nil || !a.geo.Configured() {
		return out, fmt.Errorf("GEO RD MAP no está configurado")
	}
	provinceCode = strings.TrimSpace(provinceCode)
	cityID = strings.TrimSpace(cityID)
	neighborhoodID = strings.TrimSpace(neighborhoodID)
	if provinceCode == "" || cityID == "" {
		return out, fmt.Errorf("provincia y ciudad son requeridas")
	}
	bundle, err := a.geo.Selectors(ctx, provinceCode, cityID, true)
	if err != nil {
		return out, err
	}
	for _, p := range bundle.Provinces {
		if p.Code == provinceCode {
			out.ProvinceCode = p.Code
			out.ProvinceName = p.Name
			break
		}
	}
	if out.ProvinceCode == "" {
		return out, fmt.Errorf("provincia no reconocida por GEO RD MAP")
	}
	for _, c := range bundle.Cities {
		if c.CityID == cityID && c.ProvinceCode == provinceCode {
			out.CityID = c.CityID
			out.CityName = c.Name
			break
		}
	}
	if out.CityID == "" {
		return out, fmt.Errorf("la ciudad no pertenece a la provincia seleccionada")
	}
	if neighborhoodID != "" {
		for _, n := range bundle.Neighborhoods {
			if n.ID == neighborhoodID {
				out.NeighborhoodID = n.ID
				out.NeighborhoodName = n.Name
				break
			}
		}
		if out.NeighborhoodID == "" {
			return out, fmt.Errorf("barrio no reconocido para la ciudad seleccionada")
		}
	}
	if lat != 0 || lng != 0 {
		if !coordsInsideRD(lat, lng) {
			return out, fmt.Errorf("la ubicación debe estar dentro de República Dominicana")
		}
		validation, err := a.geo.ValidateAddress(ctx, geord.AddressValidationRequest{Lat: lat, Lng: lng, ProvinceCode: provinceCode, CityID: cityID})
		if err != nil {
			return out, err
		}
		if !validation.InsideCountry {
			return out, fmt.Errorf("la ubicación debe estar dentro de República Dominicana")
		}
		if validation.ProvinceCode != "" && validation.ProvinceCode != provinceCode {
			return out, fmt.Errorf("la ubicación no coincide con la provincia seleccionada")
		}
		if validation.CityID != "" && validation.CityID != cityID {
			return out, fmt.Errorf("la ubicación no coincide con la ciudad seleccionada")
		}
		out.Latitude = lat
		out.Longitude = lng
		if rev, revErr := a.geo.Reverse(ctx, lat, lng); revErr == nil && rev.Result != nil {
			out.GeoID = rev.Result.GeoID
			out.Label = rev.Result.Label
			out.Source = rev.Result.Source
			out.Street = rev.Result.Street
			if out.NeighborhoodName == "" && rev.Result.Neighborhood != "" {
				out.NeighborhoodName = rev.Result.Neighborhood
			}
		}
	}
	return out, nil
}
