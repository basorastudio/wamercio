package geord

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	baseURL string
	apiKey  string
	http    *http.Client
}

func New(baseURL, apiKey string) *Client {
	return &Client{
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		apiKey:  strings.TrimSpace(apiKey),
		http:    &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *Client) Configured() bool { return c != nil && c.baseURL != "" && c.apiKey != "" }

type Envelope[T any] struct {
	Valid   bool   `json:"valid"`
	Data    T      `json:"data"`
	Message string `json:"message"`
}

type Province struct {
	Code       string `json:"code"`
	Name       string `json:"name"`
	Identifier string `json:"identifier"`
	RegionCode string `json:"regionCode"`
}

type City struct {
	ID               int64  `json:"id"`
	CityID           string `json:"cityId"`
	Name             string `json:"name"`
	Kind             string `json:"kind"`
	KindLabel        string `json:"kindLabel"`
	Identifier       string `json:"identifier"`
	ProvinceCode     string `json:"provinceCode"`
	MunicipalityCode string `json:"municipalityCode"`
	DistrictCode     string `json:"districtCode"`
	RegionCode       string `json:"regionCode"`
}

type Neighborhood struct {
	ID               string `json:"id"`
	Code             string `json:"code"`
	Name             string `json:"name"`
	Identifier       string `json:"identifier"`
	Key              string `json:"key"`
	SectionCode      string `json:"sectionCode"`
	DistrictCode     string `json:"districtCode"`
	MunicipalityCode string `json:"municipalityCode"`
	ProvinceCode     string `json:"provinceCode"`
	RegionCode       string `json:"regionCode"`
	Custom           bool   `json:"custom"`
	Source           string `json:"source"`
	GERSID           string `json:"gersId"`
	OvertureSubtype  string `json:"overtureSubtype"`
}

type SelectorBundle struct {
	Provinces     []Province     `json:"provinces"`
	Cities        []City         `json:"cities"`
	Neighborhoods []Neighborhood `json:"neighborhoods"`
}

type GeoSearchResult struct {
	GeoID            string  `json:"geoId"`
	ID               string  `json:"id"`
	Type             string  `json:"type"`
	Name             string  `json:"name"`
	Label            string  `json:"label"`
	Category         string  `json:"category"`
	Lat              float64 `json:"lat"`
	Lng              float64 `json:"lng"`
	Source           string  `json:"source"`
	Attribution      string  `json:"attribution"`
	Street           string  `json:"street"`
	Neighborhood     string  `json:"neighborhood"`
	Municipality     string  `json:"municipality"`
	Province         string  `json:"province"`
	ProvinceCode     string  `json:"provinceCode"`
	CityID           string  `json:"cityId"`
	CityName         string  `json:"cityName"`
	CityKind         string  `json:"cityKind"`
	MunicipalityCode string  `json:"municipalityCode"`
	DistrictCode     string  `json:"districtCode"`
	DistanceKm       float64 `json:"distanceKm"`
	SelectionToken   string  `json:"selectionToken"`
}

type GeoSearchData struct {
	Results   []GeoSearchResult `json:"results"`
	Source    string            `json:"source"`
	Providers []string          `json:"providers"`
}

type GeoReverseData struct {
	Result *GeoSearchResult `json:"result"`
	Source string           `json:"source"`
}

type GeofenceSummary struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Category    string         `json:"category"`
	ServiceType string         `json:"serviceType"`
	Active      bool           `json:"active"`
	Properties  map[string]any `json:"properties"`
}

type GeoJSONGeometry struct {
	Type        string `json:"type"`
	Coordinates any    `json:"coordinates"`
}

type Geofence struct {
	ID             string          `json:"id"`
	Name           string          `json:"name"`
	Description    string          `json:"description"`
	Category       string          `json:"category"`
	ServiceType    string          `json:"serviceType"`
	Active         bool            `json:"active"`
	Geometry       GeoJSONGeometry `json:"geometry"`
	Properties     map[string]any  `json:"properties"`
	SourceClientID string          `json:"sourceClientId"`
	CreatedAt      string          `json:"createdAt"`
	UpdatedAt      string          `json:"updatedAt"`
}

type AddressValidationRequest struct {
	Lat          float64 `json:"lat"`
	Lng          float64 `json:"lng"`
	ProvinceCode string  `json:"provinceCode,omitempty"`
	CityID       string  `json:"cityId,omitempty"`
}

type AddressValidationResult struct {
	CountryCode     string `json:"countryCode"`
	CountryName     string `json:"countryName"`
	InsideCountry   bool   `json:"insideCountry"`
	ProvinceCode    string `json:"provinceCode"`
	ProvinceName    string `json:"provinceName"`
	ProvinceMatches bool   `json:"provinceMatches"`
	CityID          string `json:"cityId"`
	CityName        string `json:"cityName"`
	CityMatches     bool   `json:"cityMatches"`
}

type RouteLocation struct {
	Lat  float64 `json:"lat"`
	Lon  float64 `json:"lon"`
	Type string  `json:"type,omitempty"`
}

type RouteRequest struct {
	Locations  []RouteLocation `json:"locations"`
	Costing    string          `json:"costing,omitempty"`
	Units      string          `json:"units,omitempty"`
	Language   string          `json:"language,omitempty"`
	Alternates int             `json:"alternates,omitempty"`
}

type GenericData map[string]any

type MapConfig struct {
	CountryCode string `json:"countryCode"`
	CountryName string `json:"countryName"`
	Center      struct {
		Lat  float64 `json:"lat"`
		Lng  float64 `json:"lng"`
		Zoom int     `json:"zoom"`
	} `json:"center"`
	Bounds struct {
		MinLng float64 `json:"minLng"`
		MinLat float64 `json:"minLat"`
		MaxLng float64 `json:"maxLng"`
		MaxLat float64 `json:"maxLat"`
	} `json:"bounds"`
	TileURL       string   `json:"tileUrl"`
	VectorTileURL string   `json:"vectorTileUrl"`
	Attribution   string   `json:"attribution"`
	Layers        []string `json:"layers"`
}

type PlaceSelectionRequest struct {
	Query  string          `json:"query,omitempty"`
	Result GeoSearchResult `json:"result"`
}

type CustomNeighborhoodSuggestionRequest struct {
	Name             string `json:"name"`
	ProvinceCode     string `json:"provinceCode,omitempty"`
	ProvinceName     string `json:"provinceName,omitempty"`
	MunicipalityCode string `json:"municipalityCode,omitempty"`
	MunicipalityName string `json:"municipalityName,omitempty"`
	DistrictCode     string `json:"districtCode,omitempty"`
	CityID           string `json:"cityId,omitempty"`
	SubmittedRole    string `json:"submittedRole,omitempty"`
	SubmittedPhone   string `json:"submittedPhone,omitempty"`
	SubmittedName    string `json:"submittedName,omitempty"`
}

func (c *Client) Selectors(ctx context.Context, provinceCode, cityID string, includeCustom bool) (SelectorBundle, error) {
	q := url.Values{}
	if provinceCode != "" {
		q.Set("provinceCode", provinceCode)
	}
	if cityID != "" {
		q.Set("cityId", cityID)
	}
	q.Set("includeCustom", strconv.FormatBool(includeCustom))
	var out Envelope[SelectorBundle]
	err := c.doJSON(ctx, http.MethodGet, "/api/v1/territories/selectors?"+q.Encode(), nil, "", &out)
	if err != nil {
		return SelectorBundle{}, err
	}
	if !out.Valid {
		return SelectorBundle{}, errors.New(messageOr(out.Message, "GEO RD MAP rechazó la solicitud"))
	}
	return out.Data, nil
}

func (c *Client) Search(ctx context.Context, qstr string, lat, lng *float64, limit int, autocomplete bool) (GeoSearchData, error) {
	q := url.Values{"q": []string{qstr}}
	if lat != nil {
		q.Set("lat", strconv.FormatFloat(*lat, 'f', -1, 64))
	}
	if lng != nil {
		q.Set("lng", strconv.FormatFloat(*lng, 'f', -1, 64))
	}
	path := "/api/v1/geolocation/search"
	if autocomplete {
		path = "/api/v1/geolocation/autocomplete"
	} else if limit > 0 {
		q.Set("limit", strconv.Itoa(limit))
	}
	var out Envelope[GeoSearchData]
	if err := c.doJSON(ctx, http.MethodGet, path+"?"+q.Encode(), nil, "", &out); err != nil {
		return GeoSearchData{}, err
	}
	if !out.Valid {
		return GeoSearchData{}, errors.New(messageOr(out.Message, "búsqueda geográfica no disponible"))
	}
	return out.Data, nil
}

func (c *Client) Reverse(ctx context.Context, lat, lng float64) (GeoReverseData, error) {
	q := url.Values{"lat": []string{fmtFloat(lat)}, "lng": []string{fmtFloat(lng)}}
	var out Envelope[GeoReverseData]
	if err := c.doJSON(ctx, http.MethodGet, "/api/v1/geolocation/reverse?"+q.Encode(), nil, "", &out); err != nil {
		return GeoReverseData{}, err
	}
	if !out.Valid {
		return GeoReverseData{}, errors.New(messageOr(out.Message, "no fue posible resolver la ubicación"))
	}
	return out.Data, nil
}

func (c *Client) ConfirmSelection(ctx context.Context, in PlaceSelectionRequest) (map[string]any, error) {
	var out Envelope[map[string]any]
	if err := c.doJSON(ctx, http.MethodPost, "/api/v1/geolocation/selections", in, "", &out); err != nil {
		return nil, err
	}
	if !out.Valid {
		return nil, errors.New(messageOr(out.Message, "no fue posible confirmar la ubicación"))
	}
	return out.Data, nil
}

func (c *Client) ValidateAddress(ctx context.Context, in AddressValidationRequest) (AddressValidationResult, error) {
	var out Envelope[AddressValidationResult]
	if err := c.doJSON(ctx, http.MethodPost, "/api/v1/addresses/validate", in, "", &out); err != nil {
		return AddressValidationResult{}, err
	}
	if !out.Valid {
		return AddressValidationResult{}, errors.New(messageOr(out.Message, "dirección inválida"))
	}
	return out.Data, nil
}

func (c *Client) Geofences(ctx context.Context, category, serviceType string) ([]GeofenceSummary, error) {
	q := url.Values{}
	if category != "" {
		q.Set("category", category)
	}
	if serviceType != "" {
		q.Set("serviceType", serviceType)
	}
	var out Envelope[[]GeofenceSummary]
	path := "/api/v1/geofences"
	if len(q) > 0 {
		path += "?" + q.Encode()
	}
	if err := c.doJSON(ctx, http.MethodGet, path, nil, "", &out); err != nil {
		return nil, err
	}
	if !out.Valid {
		return nil, errors.New(messageOr(out.Message, "no fue posible listar geocercas"))
	}
	return out.Data, nil
}

func (c *Client) GeofencesContains(ctx context.Context, lat, lng float64, category, serviceType string) ([]GeofenceSummary, error) {
	q := url.Values{"lat": []string{fmtFloat(lat)}, "lng": []string{fmtFloat(lng)}}
	if category != "" {
		q.Set("category", category)
	}
	if serviceType != "" {
		q.Set("serviceType", serviceType)
	}
	var out Envelope[[]GeofenceSummary]
	if err := c.doJSON(ctx, http.MethodGet, "/api/v1/geofences/contains?"+q.Encode(), nil, "", &out); err != nil {
		return nil, err
	}
	if !out.Valid {
		return nil, errors.New(messageOr(out.Message, "no fue posible comprobar la zona de servicio"))
	}
	return out.Data, nil
}

func (c *Client) Geofence(ctx context.Context, id string) (Geofence, error) {
	var out Envelope[Geofence]
	if err := c.doJSON(ctx, http.MethodGet, "/api/v1/geofences/"+url.PathEscape(id), nil, "", &out); err != nil {
		return Geofence{}, err
	}
	if !out.Valid {
		return Geofence{}, errors.New(messageOr(out.Message, "geocerca no encontrada"))
	}
	return out.Data, nil
}

func (c *Client) Route(ctx context.Context, in RouteRequest) (GenericData, error) {
	if in.Costing == "" {
		in.Costing = "auto"
	}
	if in.Units == "" {
		in.Units = "kilometers"
	}
	if in.Language == "" {
		in.Language = "es-ES"
	}
	var out Envelope[GenericData]
	if err := c.doJSON(ctx, http.MethodPost, "/api/v1/routing/route", in, "", &out); err != nil {
		return nil, err
	}
	if !out.Valid {
		return nil, errors.New(messageOr(out.Message, "no fue posible calcular la ruta"))
	}
	return out.Data, nil
}

func (c *Client) MapConfig(ctx context.Context) (MapConfig, error) {
	var out Envelope[MapConfig]
	if err := c.doJSON(ctx, http.MethodGet, "/api/v1/map/config", nil, "", &out); err != nil {
		return MapConfig{}, err
	}
	if !out.Valid {
		return MapConfig{}, errors.New(messageOr(out.Message, "configuración de mapa no disponible"))
	}
	return out.Data, nil
}

func (c *Client) MapFeatures(ctx context.Context, bbox string, zoom int, layers string) (json.RawMessage, error) {
	q := url.Values{"bbox": []string{bbox}}
	if zoom >= 0 {
		q.Set("zoom", strconv.Itoa(zoom))
	}
	if layers != "" {
		q.Set("layers", layers)
	}
	var raw json.RawMessage
	if err := c.doRawJSON(ctx, http.MethodGet, "/api/v1/map/features?"+q.Encode(), nil, "", &raw); err != nil {
		return nil, err
	}
	return raw, nil
}

func (c *Client) VectorTile(ctx context.Context, z, x, y int, layers string) ([]byte, string, error) {
	q := url.Values{}
	if layers != "" {
		q.Set("layers", layers)
	}
	path := fmt.Sprintf("/api/v1/map/tiles/%d/%d/%d.pbf", z, x, y)
	if len(q) > 0 {
		path += "?" + q.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return nil, "", err
	}
	c.addHeaders(req, "")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", apiError(resp.StatusCode, body)
	}
	ct := resp.Header.Get("Content-Type")
	if ct == "" {
		ct = "application/vnd.mapbox-vector-tile"
	}
	return body, ct, nil
}

func (c *Client) SuggestNeighborhood(ctx context.Context, tenantID string, in CustomNeighborhoodSuggestionRequest) (map[string]any, error) {
	var out Envelope[map[string]any]
	if err := c.doJSON(ctx, http.MethodPost, "/api/v1/territories/neighborhoods/custom/suggestions", in, tenantID, &out); err != nil {
		return nil, err
	}
	if !out.Valid {
		return nil, errors.New(messageOr(out.Message, "no fue posible registrar la sugerencia"))
	}
	return out.Data, nil
}

func (c *Client) doJSON(ctx context.Context, method, path string, body any, tenantID string, out any) error {
	var buf io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		buf = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, buf)
	if err != nil {
		return err
	}
	c.addHeaders(req, tenantID)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return apiError(resp.StatusCode, b)
	}
	if err := json.Unmarshal(b, out); err != nil {
		return fmt.Errorf("respuesta GEO RD MAP inválida: %w", err)
	}
	return nil
}

func (c *Client) doRawJSON(ctx context.Context, method, path string, body any, tenantID string, out *json.RawMessage) error {
	var buf io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		buf = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, buf)
	if err != nil {
		return err
	}
	c.addHeaders(req, tenantID)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return apiError(resp.StatusCode, b)
	}
	*out = append((*out)[:0], b...)
	return nil
}

func (c *Client) addHeaders(req *http.Request, tenantID string) {
	req.Header.Set("X-API-Key", c.apiKey)
	req.Header.Set("Accept", "application/json")
	if tenantID != "" {
		req.Header.Set("X-Tenant-ID", tenantID)
	}
}

func apiError(status int, body []byte) error {
	var e struct {
		Message string `json:"message"`
	}
	_ = json.Unmarshal(body, &e)
	if strings.TrimSpace(e.Message) == "" {
		e.Message = http.StatusText(status)
	}
	return fmt.Errorf("GEO RD MAP: %s", e.Message)
}

func messageOr(v, fallback string) string {
	if strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	return fallback
}

func fmtFloat(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }
