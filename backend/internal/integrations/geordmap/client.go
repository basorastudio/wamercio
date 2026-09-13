package geordmap

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

const maxResponseBytes = 4 << 20

type Client struct {
	BaseURL string
	APIKey  string
	HTTP    *http.Client
}

type APIError struct {
	StatusCode int
	Message    string
}

func (e *APIError) Error() string {
	if e == nil {
		return "GEO RD MAP respondió con un error"
	}
	message := strings.TrimSpace(e.Message)
	if message == "" {
		message = http.StatusText(e.StatusCode)
	}
	if message == "" {
		message = "respuesta no válida"
	}
	return fmt.Sprintf("GEO RD MAP: %s", message)
}

type Province struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

type City struct {
	CityID           string `json:"cityId"`
	Name             string `json:"name"`
	Kind             string `json:"kind"`
	KindLabel        string `json:"kindLabel"`
	ProvinceCode     string `json:"provinceCode"`
	MunicipalityCode string `json:"municipalityCode"`
	DistrictCode     string `json:"districtCode"`
}

type Neighborhood struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Custom bool   `json:"custom"`
}

type TerritoryStatus struct {
	Postgres            string `json:"postgres"`
	Redis               string `json:"redis"`
	Regions             int    `json:"regions"`
	Provinces           int    `json:"provinces"`
	Cities              int    `json:"cities"`
	Neighborhoods       int    `json:"neighborhoods"`
	CustomNeighborhoods int    `json:"customNeighborhoods"`
}

type SuggestNeighborhoodInput struct {
	Name           string `json:"name"`
	CityID         string `json:"cityId"`
	SubmittedRole  string `json:"submittedRole,omitempty"`
	SubmittedPhone string `json:"submittedPhone,omitempty"`
	SubmittedName  string `json:"submittedName,omitempty"`
}

type SuggestionResponse map[string]any

type Point struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type GeocodeResult struct {
	Point
	Label        string `json:"label,omitempty"`
	Address      string `json:"address,omitempty"`
	Province     string `json:"province,omitempty"`
	Municipality string `json:"municipality,omitempty"`
	Neighborhood string `json:"neighborhood,omitempty"`
}

type RouteInput struct {
	Origin      Point  `json:"origin"`
	Destination Point  `json:"destination"`
	Profile     string `json:"profile,omitempty"`
}

type RouteResult struct {
	Coordinates     []Point `json:"coordinates"`
	DistanceKM      float64 `json:"distance_km"`
	DurationMinutes int     `json:"duration_minutes"`
	Source          string  `json:"source,omitempty"`
}

type Geofence struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Type        string         `json:"type,omitempty"`
	Service     string         `json:"service,omitempty"`
	Description string         `json:"description,omitempty"`
	Polygon     []Point        `json:"polygon"`
	Metadata    map[string]any `json:"metadata,omitempty"`
}

type GeofenceInput struct {
	Name        string         `json:"name"`
	Type        string         `json:"type,omitempty"`
	Service     string         `json:"service,omitempty"`
	Description string         `json:"description,omitempty"`
	Polygon     []Point        `json:"polygon"`
	Metadata    map[string]any `json:"metadata,omitempty"`
}

func (c *Client) request(ctx context.Context, method, path string, body any, out any) error {
	base := strings.TrimRight(strings.TrimSpace(c.BaseURL), "/")
	if base == "" {
		return &APIError{Message: "URL no configurada"}
	}
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, base+path, reader)
	if err != nil {
		return err
	}
	if strings.TrimSpace(c.APIKey) != "" {
		req.Header.Set("X-API-Key", strings.TrimSpace(c.APIKey))
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	httpClient := c.HTTP
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	limited := io.LimitReader(resp.Body, maxResponseBytes+1)
	raw, err := io.ReadAll(limited)
	if err != nil {
		return err
	}
	if len(raw) > maxResponseBytes {
		return &APIError{StatusCode: resp.StatusCode, Message: "respuesta demasiado grande"}
	}

	var envelope struct {
		Valid   bool            `json:"valid"`
		Data    json.RawMessage `json:"data"`
		Message string          `json:"message"`
		Error   any             `json:"error"`
	}
	if len(bytes.TrimSpace(raw)) == 0 {
		return &APIError{StatusCode: resp.StatusCode, Message: "respuesta vacía"}
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return &APIError{StatusCode: resp.StatusCode, Message: "respuesta JSON no válida"}
	}
	if resp.StatusCode >= 400 || !envelope.Valid {
		message := strings.TrimSpace(envelope.Message)
		if message == "" && envelope.Error != nil {
			message = fmt.Sprint(envelope.Error)
		}
		return &APIError{StatusCode: resp.StatusCode, Message: message}
	}
	if out == nil || len(envelope.Data) == 0 || string(envelope.Data) == "null" {
		return nil
	}
	if err := json.Unmarshal(envelope.Data, out); err != nil {
		return &APIError{StatusCode: resp.StatusCode, Message: "estructura de respuesta inesperada"}
	}
	return nil
}

func (c *Client) requestCandidates(ctx context.Context, method string, paths []string, body any, out any) error {
	var lastErr error
	for _, path := range paths {
		err := c.request(ctx, method, path, body, out)
		if err == nil {
			return nil
		}
		lastErr = err
		var apiErr *APIError
		if !asAPIError(err, &apiErr) || (apiErr.StatusCode != http.StatusNotFound && apiErr.StatusCode != http.StatusMethodNotAllowed) {
			return err
		}
	}
	return lastErr
}

func asAPIError(err error, target **APIError) bool {
	if err == nil {
		return false
	}
	apiErr, ok := err.(*APIError)
	if ok {
		*target = apiErr
	}
	return ok
}

func validPoint(point Point) bool {
	return !math.IsNaN(point.Lat) && !math.IsInf(point.Lat, 0) && point.Lat >= -90 && point.Lat <= 90 &&
		!math.IsNaN(point.Lng) && !math.IsInf(point.Lng, 0) && point.Lng >= -180 && point.Lng <= 180
}

func numberFromMap(value map[string]any, keys ...string) float64 {
	for _, key := range keys {
		if raw, ok := value[key]; ok {
			switch typed := raw.(type) {
			case float64:
				return typed
			case json.Number:
				parsed, _ := typed.Float64()
				return parsed
			default:
				parsed, _ := strconv.ParseFloat(strings.TrimSpace(fmt.Sprint(raw)), 64)
				return parsed
			}
		}
	}
	return 0
}

func stringFromMap(value map[string]any, keys ...string) string {
	for _, key := range keys {
		if raw, ok := value[key]; ok {
			text := strings.TrimSpace(fmt.Sprint(raw))
			if text != "" && text != "<nil>" {
				return text
			}
		}
	}
	return ""
}

func pointFromAny(raw any) (Point, bool) {
	if object, ok := raw.(map[string]any); ok {
		point := Point{Lat: numberFromMap(object, "lat", "latitude", "y"), Lng: numberFromMap(object, "lng", "lon", "longitude", "x")}
		return point, validPoint(point)
	}
	if values, ok := raw.([]any); ok && len(values) >= 2 {
		first, _ := strconv.ParseFloat(strings.TrimSpace(fmt.Sprint(values[0])), 64)
		second, _ := strconv.ParseFloat(strings.TrimSpace(fmt.Sprint(values[1])), 64)
		// GeoJSON uses [lng, lat].
		point := Point{Lat: second, Lng: first}
		return point, validPoint(point)
	}
	return Point{}, false
}

func normalizeGeocodePayload(raw map[string]any) (GeocodeResult, bool) {
	for _, key := range []string{"location", "point", "coordinates", "center", "result"} {
		if nested, ok := raw[key]; ok {
			if nestedMap, ok := nested.(map[string]any); ok {
				for k, v := range nestedMap {
					if _, exists := raw[k]; !exists {
						raw[k] = v
					}
				}
			}
			if point, ok := pointFromAny(nested); ok {
				return GeocodeResult{Point: point, Label: stringFromMap(raw, "label", "display_name", "name"), Address: stringFromMap(raw, "address", "formatted_address"), Province: stringFromMap(raw, "province", "province_name"), Municipality: stringFromMap(raw, "municipality", "city", "municipality_name"), Neighborhood: stringFromMap(raw, "neighborhood", "sector", "neighborhood_name")}, true
			}
		}
	}
	point, ok := pointFromAny(raw)
	if !ok {
		return GeocodeResult{}, false
	}
	return GeocodeResult{Point: point, Label: stringFromMap(raw, "label", "display_name", "name"), Address: stringFromMap(raw, "address", "formatted_address"), Province: stringFromMap(raw, "province", "province_name"), Municipality: stringFromMap(raw, "municipality", "city", "municipality_name"), Neighborhood: stringFromMap(raw, "neighborhood", "sector", "neighborhood_name")}, true
}

func normalizeRoutePayload(raw map[string]any) (RouteResult, bool) {
	root := raw
	if route, ok := raw["route"].(map[string]any); ok {
		root = route
	} else if routes, ok := raw["routes"].([]any); ok && len(routes) > 0 {
		if first, ok := routes[0].(map[string]any); ok {
			root = first
		}
	}

	coordinatesRaw := root["coordinates"]
	if geometry, ok := root["geometry"].(map[string]any); ok && coordinatesRaw == nil {
		coordinatesRaw = geometry["coordinates"]
	}
	coordinates := []Point{}
	if values, ok := coordinatesRaw.([]any); ok {
		for _, value := range values {
			if point, ok := pointFromAny(value); ok {
				coordinates = append(coordinates, point)
			}
		}
	}
	if len(coordinates) < 2 {
		return RouteResult{}, false
	}
	distanceKM := numberFromMap(root, "distance_km", "distanceKm")
	if distanceKM == 0 {
		distanceMeters := numberFromMap(root, "distance", "distance_m", "distanceMeters")
		if distanceMeters > 100 {
			distanceKM = distanceMeters / 1000
		} else {
			distanceKM = distanceMeters
		}
	}
	durationMinutes := int(math.Round(numberFromMap(root, "duration_minutes", "durationMinutes")))
	if durationMinutes <= 0 {
		durationSeconds := numberFromMap(root, "duration", "duration_seconds", "durationSeconds")
		if durationSeconds > 0 {
			durationMinutes = int(math.Ceil(durationSeconds / 60))
		}
	}
	return RouteResult{Coordinates: coordinates, DistanceKM: distanceKM, DurationMinutes: durationMinutes, Source: "geo_rd_map"}, true
}

func normalizeGeofencePayload(raw map[string]any) (Geofence, bool) {
	root := raw
	if value, ok := raw["geofence"].(map[string]any); ok {
		root = value
	}
	polygonRaw := root["polygon"]
	if polygonRaw == nil {
		polygonRaw = root["coordinates"]
	}
	if geometry, ok := root["geometry"].(map[string]any); ok && polygonRaw == nil {
		polygonRaw = geometry["coordinates"]
	}
	points := []Point{}
	if values, ok := polygonRaw.([]any); ok {
		// GeoJSON Polygon is [[[lng,lat], ...]]; unwrap the first ring.
		if len(values) > 0 {
			if first, ok := values[0].([]any); ok && len(first) > 0 {
				if _, nested := first[0].([]any); nested {
					values = first
				}
			}
		}
		for _, value := range values {
			if point, ok := pointFromAny(value); ok {
				points = append(points, point)
			}
		}
	}
	if len(points) < 3 {
		return Geofence{}, false
	}
	return Geofence{ID: stringFromMap(root, "id", "geofence_id", "geofenceId"), Name: stringFromMap(root, "name"), Type: stringFromMap(root, "type"), Service: stringFromMap(root, "service"), Description: stringFromMap(root, "description"), Polygon: points}, true
}

func (c *Client) Status(ctx context.Context) (TerritoryStatus, error) {
	var out TerritoryStatus
	err := c.request(ctx, http.MethodGet, "/api/v1/territories/status", nil, &out)
	return out, err
}

func (c *Client) Health(ctx context.Context) (TerritoryStatus, error) {
	var out TerritoryStatus
	err := c.request(ctx, http.MethodGet, "/api/v1/territories/health", nil, &out)
	return out, err
}

func (c *Client) Provinces(ctx context.Context) ([]Province, error) {
	out := []Province{}
	err := c.request(ctx, http.MethodGet, "/api/v1/territories/provinces", nil, &out)
	return out, err
}

func (c *Client) Cities(ctx context.Context, provinceCode string) ([]City, error) {
	out := []City{}
	path := "/api/v1/territories/cities?provinceCode=" + url.QueryEscape(strings.TrimSpace(provinceCode))
	err := c.request(ctx, http.MethodGet, path, nil, &out)
	return out, err
}

func (c *Client) Neighborhoods(ctx context.Context, cityID string, includeCustom bool) ([]Neighborhood, error) {
	out := []Neighborhood{}
	path := "/api/v1/territories/cities/" + url.PathEscape(strings.TrimSpace(cityID)) + "/neighborhoods?includeCustom="
	if includeCustom {
		path += "true"
	} else {
		path += "false"
	}
	err := c.request(ctx, http.MethodGet, path, nil, &out)
	return out, err
}

func (c *Client) SuggestNeighborhood(ctx context.Context, input SuggestNeighborhoodInput) (SuggestionResponse, error) {
	// WAMERCIO only needs the acceptance status. Ignoring the data payload keeps
	// this call compatible if GEO RD MAP evolves the suggestion response shape.
	err := c.request(ctx, http.MethodPost, "/api/v1/territories/neighborhoods/custom/suggestions", input, nil)
	return SuggestionResponse{}, err
}

func (c *Client) Geocode(ctx context.Context, query string) (GeocodeResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return GeocodeResult{}, &APIError{Message: "dirección vacía"}
	}
	body := map[string]any{"query": query, "address": query, "country": "DO"}
	paths := []string{
		"/api/v1/geocoding/geocode",
		"/api/v1/geocode",
		"/api/v1/maps/geocode",
	}
	for _, path := range paths {
		var raw map[string]any
		err := c.request(ctx, http.MethodPost, path, body, &raw)
		if err == nil {
			if normalized, ok := normalizeGeocodePayload(raw); ok {
				return normalized, nil
			}
			return GeocodeResult{}, &APIError{Message: "GEO RD MAP devolvió una geolocalización inesperada"}
		}
		var apiErr *APIError
		if !asAPIError(err, &apiErr) || (apiErr.StatusCode != http.StatusNotFound && apiErr.StatusCode != http.StatusMethodNotAllowed) {
			return GeocodeResult{}, err
		}
	}
	var raw map[string]any
	path := "/api/v1/geocoding/search?q=" + url.QueryEscape(query)
	if err := c.request(ctx, http.MethodGet, path, nil, &raw); err != nil {
		return GeocodeResult{}, err
	}
	if normalized, ok := normalizeGeocodePayload(raw); ok {
		return normalized, nil
	}
	return GeocodeResult{}, &APIError{Message: "GEO RD MAP devolvió una geolocalización inesperada"}
}

func (c *Client) ReverseGeocode(ctx context.Context, point Point) (GeocodeResult, error) {
	if !validPoint(point) {
		return GeocodeResult{}, &APIError{Message: "coordenadas no válidas"}
	}
	lat := strconv.FormatFloat(point.Lat, 'f', 6, 64)
	lng := strconv.FormatFloat(point.Lng, 'f', 6, 64)
	paths := []string{
		"/api/v1/geocoding/reverse?lat=" + url.QueryEscape(lat) + "&lng=" + url.QueryEscape(lng),
		"/api/v1/reverse-geocode?lat=" + url.QueryEscape(lat) + "&lng=" + url.QueryEscape(lng),
		"/api/v1/maps/reverse?lat=" + url.QueryEscape(lat) + "&lng=" + url.QueryEscape(lng),
	}
	for _, path := range paths {
		var raw map[string]any
		err := c.request(ctx, http.MethodGet, path, nil, &raw)
		if err == nil {
			if normalized, ok := normalizeGeocodePayload(raw); ok {
				return normalized, nil
			}
			return GeocodeResult{}, &APIError{Message: "GEO RD MAP devolvió una dirección inesperada"}
		}
		var apiErr *APIError
		if !asAPIError(err, &apiErr) || (apiErr.StatusCode != http.StatusNotFound && apiErr.StatusCode != http.StatusMethodNotAllowed) {
			return GeocodeResult{}, err
		}
	}
	return GeocodeResult{}, &APIError{StatusCode: http.StatusNotFound, Message: "el servicio de geocodificación inversa no está disponible"}
}

func (c *Client) Route(ctx context.Context, input RouteInput) (RouteResult, error) {
	if !validPoint(input.Origin) || !validPoint(input.Destination) {
		return RouteResult{}, &APIError{Message: "coordenadas de ruta no válidas"}
	}
	if strings.TrimSpace(input.Profile) == "" {
		input.Profile = "driving"
	}
	body := map[string]any{
		"origin":      input.Origin,
		"destination": input.Destination,
		"profile":     input.Profile,
		"from":        input.Origin,
		"to":          input.Destination,
	}
	paths := []string{
		"/api/v1/routing/route",
		"/api/v1/routes/route",
		"/api/v1/route",
	}
	for _, path := range paths {
		var raw map[string]any
		err := c.request(ctx, http.MethodPost, path, body, &raw)
		if err == nil {
			if normalized, ok := normalizeRoutePayload(raw); ok {
				return normalized, nil
			}
			return RouteResult{}, &APIError{Message: "GEO RD MAP devolvió una ruta inesperada"}
		}
		var apiErr *APIError
		if !asAPIError(err, &apiErr) || (apiErr.StatusCode != http.StatusNotFound && apiErr.StatusCode != http.StatusMethodNotAllowed) {
			return RouteResult{}, err
		}
	}
	return RouteResult{}, &APIError{StatusCode: http.StatusNotFound, Message: "el servicio de routing no está disponible"}
}

func geoJSONPolygon(points []Point) map[string]any {
	ring := make([][]float64, 0, len(points)+1)
	for _, point := range points {
		ring = append(ring, []float64{point.Lng, point.Lat})
	}
	if len(points) > 0 {
		first := points[0]
		last := points[len(points)-1]
		if first.Lat != last.Lat || first.Lng != last.Lng {
			ring = append(ring, []float64{first.Lng, first.Lat})
		}
	}
	return map[string]any{
		"type":        "Polygon",
		"coordinates": []any{ring},
	}
}

func (c *Client) CreateGeofence(ctx context.Context, input GeofenceInput) (Geofence, error) {
	if strings.TrimSpace(input.Name) == "" || len(input.Polygon) < 3 {
		return Geofence{}, &APIError{Message: "la geocerca requiere nombre y al menos 3 vértices"}
	}
	if strings.TrimSpace(input.Type) == "" {
		input.Type = "service_area"
	}
	if strings.TrimSpace(input.Service) == "" {
		input.Service = "delivery"
	}
	body := map[string]any{
		"name":        input.Name,
		"type":        input.Type,
		"service":     input.Service,
		"description": input.Description,
		"polygon":     input.Polygon,
		"coordinates": input.Polygon,
		"vertices":    input.Polygon,
		"geometry":    geoJSONPolygon(input.Polygon),
		"metadata":    input.Metadata,
	}
	paths := []string{"/api/v1/geofences", "/api/v1/geocercas", "/api/v1/service-areas"}
	for _, path := range paths {
		var raw map[string]any
		err := c.request(ctx, http.MethodPost, path, body, &raw)
		if err == nil {
			if normalized, ok := normalizeGeofencePayload(raw); ok {
				return normalized, nil
			}
			// Some APIs return only the id. Preserve the submitted polygon locally.
			return Geofence{ID: stringFromMap(raw, "id", "geofence_id", "geofenceId"), Name: input.Name, Type: input.Type, Service: input.Service, Description: input.Description, Polygon: input.Polygon, Metadata: input.Metadata}, nil
		}
		var apiErr *APIError
		if !asAPIError(err, &apiErr) || (apiErr.StatusCode != http.StatusNotFound && apiErr.StatusCode != http.StatusMethodNotAllowed) {
			return Geofence{}, err
		}
	}
	return Geofence{}, &APIError{StatusCode: http.StatusNotFound, Message: "el servicio de geocercas no está disponible"}
}

func (c *Client) UpdateGeofence(ctx context.Context, id string, input GeofenceInput) (Geofence, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return c.CreateGeofence(ctx, input)
	}
	body := map[string]any{
		"name":        input.Name,
		"type":        input.Type,
		"service":     input.Service,
		"description": input.Description,
		"polygon":     input.Polygon,
		"coordinates": input.Polygon,
		"vertices":    input.Polygon,
		"geometry":    geoJSONPolygon(input.Polygon),
		"metadata":    input.Metadata,
	}
	bases := []string{"/api/v1/geofences/", "/api/v1/geocercas/", "/api/v1/service-areas/"}
	for _, base := range bases {
		var raw map[string]any
		err := c.request(ctx, http.MethodPatch, base+url.PathEscape(id), body, &raw)
		if err == nil {
			if normalized, ok := normalizeGeofencePayload(raw); ok {
				return normalized, nil
			}
			return Geofence{ID: id, Name: input.Name, Type: input.Type, Service: input.Service, Description: input.Description, Polygon: input.Polygon, Metadata: input.Metadata}, nil
		}
		var apiErr *APIError
		if !asAPIError(err, &apiErr) || (apiErr.StatusCode != http.StatusNotFound && apiErr.StatusCode != http.StatusMethodNotAllowed) {
			return Geofence{}, err
		}
	}
	return Geofence{}, &APIError{StatusCode: http.StatusNotFound, Message: "la geocerca no pudo actualizarse en GEO RD MAP"}
}

func (c *Client) DeleteGeofence(ctx context.Context, id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil
	}
	bases := []string{"/api/v1/geofences/", "/api/v1/geocercas/", "/api/v1/service-areas/"}
	for _, base := range bases {
		err := c.request(ctx, http.MethodDelete, base+url.PathEscape(id), nil, nil)
		if err == nil {
			return nil
		}
		var apiErr *APIError
		if !asAPIError(err, &apiErr) || (apiErr.StatusCode != http.StatusNotFound && apiErr.StatusCode != http.StatusMethodNotAllowed) {
			return err
		}
	}
	return nil
}
