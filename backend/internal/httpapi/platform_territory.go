package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"wamercio/backend/internal/integrations/geordmap"
	"wamercio/backend/internal/platform/tenancy"

	"github.com/jackc/pgx/v5"
)

const platformGeoRDMapSettingKey = "geo_rd_map"

type platformGeoRDMapConfig struct {
	Enabled        bool   `json:"enabled"`
	BaseURL        string `json:"base_url"`
	APIKey         string `json:"api_key,omitempty"`
	TimeoutSeconds int    `json:"timeout_seconds"`
	CacheMinutes   int    `json:"cache_minutes"`
}

type territoryCacheEntry struct {
	value     any
	expiresAt time.Time
}

type territoryAPICache struct {
	mu     sync.RWMutex
	values map[string]territoryCacheEntry
}

func newTerritoryAPICache() *territoryAPICache {
	return &territoryAPICache{values: map[string]territoryCacheEntry{}}
}

func (c *territoryAPICache) get(key string, now time.Time) (any, bool) {
	if c == nil {
		return nil, false
	}
	c.mu.RLock()
	entry, ok := c.values[key]
	c.mu.RUnlock()
	if !ok || now.After(entry.expiresAt) {
		if ok {
			c.mu.Lock()
			delete(c.values, key)
			c.mu.Unlock()
		}
		return nil, false
	}
	return entry.value, true
}

func (c *territoryAPICache) set(key string, value any, ttl time.Duration, now time.Time) {
	if c == nil || ttl <= 0 {
		return
	}
	c.mu.Lock()
	c.values[key] = territoryCacheEntry{value: value, expiresAt: now.Add(ttl)}
	c.mu.Unlock()
}

func (c *territoryAPICache) clear() {
	if c == nil {
		return
	}
	c.mu.Lock()
	c.values = map[string]territoryCacheEntry{}
	c.mu.Unlock()
}

type territoryNeighborhood struct {
	ID                  string     `json:"id"`
	Code                string     `json:"code,omitempty"`
	Name                string     `json:"name"`
	Identifier          string     `json:"identifier,omitempty"`
	SectionCode         string     `json:"sectionCode,omitempty"`
	DistrictCode        string     `json:"districtCode,omitempty"`
	MunicipalityCode    string     `json:"municipalityCode"`
	MunicipalityName    string     `json:"municipalityName,omitempty"`
	ProvinceCode        string     `json:"provinceCode"`
	ProvinceName        string     `json:"provinceName,omitempty"`
	RegionCode          string     `json:"regionCode,omitempty"`
	Custom              bool       `json:"custom"`
	Source              string     `json:"source,omitempty"`
	ReviewStatus        string     `json:"reviewStatus,omitempty"`
	OriginalName        string     `json:"originalName,omitempty"`
	SubmittedTenantID   string     `json:"submittedTenantId,omitempty"`
	SubmittedTenantName string     `json:"submittedTenantName,omitempty"`
	SubmittedBy         string     `json:"submittedBy,omitempty"`
	SubmissionCount     int        `json:"submissionCount,omitempty"`
	CreatedAt           time.Time  `json:"createdAt,omitempty"`
	UpdatedAt           time.Time  `json:"updatedAt,omitempty"`
	LastSubmittedAt     time.Time  `json:"lastSubmittedAt,omitempty"`
	ReviewedAt          *time.Time `json:"reviewedAt,omitempty"`
	ReviewedBy          string     `json:"reviewedBy,omitempty"`
}

type territoryCustomNeighborhoodInput struct {
	Name             string `json:"name"`
	ProvinceCode     string `json:"provinceCode"`
	ProvinceName     string `json:"provinceName"`
	MunicipalityCode string `json:"municipalityCode"`
	MunicipalityName string `json:"municipalityName"`
	DistrictCode     string `json:"districtCode"`
	CityID           string `json:"cityId"`
}

func (s *Server) readPlatformGeoRDMapConfig(ctx context.Context) (platformGeoRDMapConfig, error) {
	fallbackTimeout := int(s.cfg.GeoRDMapTimeout / time.Second)
	if fallbackTimeout <= 0 {
		fallbackTimeout = 12
	}
	fallback := platformGeoRDMapConfig{
		Enabled:        s.cfg.GeoRDMapEnabled,
		BaseURL:        strings.TrimRight(strings.TrimSpace(s.cfg.GeoRDMapURL), "/"),
		APIKey:         strings.TrimSpace(s.cfg.GeoRDMapAPIKey),
		TimeoutSeconds: fallbackTimeout,
		CacheMinutes:   15,
	}
	if fallback.BaseURL == "" {
		fallback.BaseURL = "https://geo.ltd.do"
	}
	if s.tenantManager == nil {
		return normalizePlatformGeoRDMapConfig(fallback)
	}
	raw, err := s.readPlatformSettingMap(ctx, platformGeoRDMapSettingKey)
	if err != nil {
		return platformGeoRDMapConfig{}, err
	}
	if len(raw) == 0 {
		return normalizePlatformGeoRDMapConfig(fallback)
	}
	config := platformGeoRDMapConfig{
		Enabled:        boolSetting(raw, fallback.Enabled, "enabled"),
		BaseURL:        firstNonEmpty(stringSetting(raw, "base_url"), stringSetting(raw, "url"), fallback.BaseURL),
		APIKey:         firstNonEmpty(stringSetting(raw, "api_key"), fallback.APIKey),
		TimeoutSeconds: intSetting(raw, fallback.TimeoutSeconds, "timeout_seconds"),
		CacheMinutes:   intSetting(raw, fallback.CacheMinutes, "cache_minutes"),
	}
	return normalizePlatformGeoRDMapConfig(config)
}

func normalizeGeoRDMapBaseURL(value string) string {
	clean := strings.TrimRight(strings.TrimSpace(value), "/")
	lower := strings.ToLower(clean)
	for _, marker := range []string{"/api/v1/", "/api/v1", "/admin/", "/admin"} {
		if idx := strings.Index(lower, marker); idx > 0 {
			clean = strings.TrimRight(clean[:idx], "/")
			break
		}
	}
	return clean
}

func normalizePlatformGeoRDMapConfig(config platformGeoRDMapConfig) (platformGeoRDMapConfig, error) {
	config.BaseURL = normalizeGeoRDMapBaseURL(config.BaseURL)
	config.APIKey = strings.TrimSpace(config.APIKey)
	if config.TimeoutSeconds <= 0 {
		config.TimeoutSeconds = 12
	}
	if config.CacheMinutes <= 0 {
		config.CacheMinutes = 15
	}
	if config.TimeoutSeconds < 2 || config.TimeoutSeconds > 60 {
		return platformGeoRDMapConfig{}, badRequest("El timeout de GEO RD MAP debe estar entre 2 y 60 segundos")
	}
	if config.CacheMinutes < 1 || config.CacheMinutes > 1440 {
		return platformGeoRDMapConfig{}, badRequest("La caché territorial debe estar entre 1 y 1440 minutos")
	}
	if config.BaseURL == "" {
		return platformGeoRDMapConfig{}, badRequest("Completa la URL de GEO RD MAP")
	}
	parsed, err := url.Parse(config.BaseURL)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return platformGeoRDMapConfig{}, badRequest("La URL de GEO RD MAP debe ser una dirección HTTP o HTTPS válida")
	}
	if config.Enabled && config.APIKey == "" {
		return platformGeoRDMapConfig{}, badRequest("Completa la API key de GEO RD MAP antes de activar la integración")
	}
	return config, nil
}

func sanitizePlatformGeoRDMapConfig(config platformGeoRDMapConfig) map[string]any {
	return map[string]any{
		"enabled":            config.Enabled,
		"base_url":           config.BaseURL,
		"timeout_seconds":    config.TimeoutSeconds,
		"cache_minutes":      config.CacheMinutes,
		"api_key_configured": config.APIKey != "",
		"ready":              config.Enabled && config.BaseURL != "" && config.APIKey != "",
	}
}

func (s *Server) platformGeoRDMapState(w http.ResponseWriter, r *http.Request) {
	config, err := s.readPlatformGeoRDMapConfig(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"geo_rd_map": sanitizePlatformGeoRDMapConfig(config)})
}

func (s *Server) configurePlatformGeoRDMap(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	var input platformGeoRDMapConfig
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	current, err := s.readPlatformGeoRDMapConfig(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	if strings.TrimSpace(input.APIKey) == "" {
		input.APIKey = current.APIKey
	}
	config, err := normalizePlatformGeoRDMapConfig(input)
	if err != nil {
		writeError(w, err)
		return
	}
	if err := s.writePlatformSetting(r.Context(), platformGeoRDMapSettingKey, config); err != nil {
		writeError(w, err)
		return
	}
	if s.territoryCache != nil {
		s.territoryCache.clear()
	}
	s.auditPlatform(r.Context(), s.platformActor(r), "", "platform.geo_rd_map.configure", map[string]any{
		"geo_rd_map": sanitizePlatformGeoRDMapConfig(config),
	})
	writeJSON(w, http.StatusOK, map[string]any{"geo_rd_map": sanitizePlatformGeoRDMapConfig(config)})
}

func (s *Server) geoRDMapClient(config platformGeoRDMapConfig) *geordmap.Client {
	return &geordmap.Client{
		BaseURL: config.BaseURL,
		APIKey:  config.APIKey,
		HTTP:    s.geoHTTPClient,
	}
}

func geoConfigReady(config platformGeoRDMapConfig) bool {
	return config.Enabled && strings.TrimSpace(config.BaseURL) != "" && strings.TrimSpace(config.APIKey) != ""
}

func geoConfigurationRequiredError() error {
	return apiError{status: http.StatusServiceUnavailable, msg: "Configura y activa GEO RD MAP en Superadministración → Configuración → Territorio"}
}

func geoFriendlyError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return apiError{status: http.StatusGatewayTimeout, msg: "GEO RD MAP tardó demasiado en responder"}
	}
	var apiErr *geordmap.APIError
	if errors.As(err, &apiErr) {
		message := strings.TrimSpace(apiErr.Message)
		if message == "" {
			message = "GEO RD MAP no respondió correctamente"
		}
		switch apiErr.StatusCode {
		case http.StatusUnauthorized, http.StatusForbidden:
			return apiError{status: http.StatusBadGateway, msg: "GEO RD MAP rechazó la API key configurada. Revisa la credencial del cliente WAMERCIO."}
		case http.StatusTooManyRequests:
			return apiError{status: http.StatusServiceUnavailable, msg: "GEO RD MAP alcanzó temporalmente el límite de solicitudes. Inténtalo nuevamente en unos segundos."}
		default:
			if apiErr.StatusCode >= 500 {
				return apiError{status: http.StatusBadGateway, msg: "GEO RD MAP no está disponible temporalmente: " + message}
			}
			return apiError{status: http.StatusBadGateway, msg: message}
		}
	}
	return apiError{status: http.StatusBadGateway, msg: "No se pudo conectar con GEO RD MAP: " + err.Error()}
}

func (s *Server) loadGeoCached(ctx context.Context, config platformGeoRDMapConfig, key string, ttl time.Duration, loader func(context.Context, *geordmap.Client) (any, error)) (any, error) {
	if !geoConfigReady(config) {
		return nil, geoConfigurationRequiredError()
	}
	cacheKey := strings.ToLower(strings.TrimRight(config.BaseURL, "/")) + "|" + key
	now := time.Now()
	if value, ok := s.territoryCache.get(cacheKey, now); ok {
		return value, nil
	}
	value, err, _ := s.territoryGroup.Do(cacheKey, func() (any, error) {
		if cached, ok := s.territoryCache.get(cacheKey, time.Now()); ok {
			return cached, nil
		}
		timeout := time.Duration(config.TimeoutSeconds) * time.Second
		requestCtx, cancel := context.WithTimeout(ctx, timeout)
		defer cancel()
		loaded, loadErr := loader(requestCtx, s.geoRDMapClient(config))
		if loadErr != nil {
			return nil, geoFriendlyError(loadErr)
		}
		s.territoryCache.set(cacheKey, loaded, ttl, time.Now())
		return loaded, nil
	})
	return value, err
}

func geoTerritoryTTL(config platformGeoRDMapConfig) time.Duration {
	minutes := config.CacheMinutes
	if minutes <= 0 {
		minutes = 15
	}
	return time.Duration(minutes) * time.Minute
}

func (s *Server) geoTerritoryStatus(ctx context.Context, config platformGeoRDMapConfig, fresh bool) (geordmap.TerritoryStatus, error) {
	if fresh && s.territoryCache != nil {
		s.territoryCache.clear()
	}
	value, err := s.loadGeoCached(ctx, config, "status", time.Minute, func(ctx context.Context, client *geordmap.Client) (any, error) {
		return client.Status(ctx)
	})
	if err != nil {
		return geordmap.TerritoryStatus{}, err
	}
	status, ok := value.(geordmap.TerritoryStatus)
	if !ok {
		return geordmap.TerritoryStatus{}, apiError{status: http.StatusBadGateway, msg: "GEO RD MAP devolvió un estado territorial inesperado"}
	}
	return status, nil
}

func (s *Server) geoProvinces(ctx context.Context, config platformGeoRDMapConfig) ([]geordmap.Province, error) {
	value, err := s.loadGeoCached(ctx, config, "provinces", geoTerritoryTTL(config)*4, func(ctx context.Context, client *geordmap.Client) (any, error) {
		return client.Provinces(ctx)
	})
	if err != nil {
		return nil, err
	}
	items, ok := value.([]geordmap.Province)
	if !ok {
		return nil, apiError{status: http.StatusBadGateway, msg: "GEO RD MAP devolvió provincias con un formato inesperado"}
	}
	return items, nil
}

func (s *Server) geoCities(ctx context.Context, config platformGeoRDMapConfig, provinceCode string) ([]geordmap.City, error) {
	provinceCode = strings.TrimSpace(provinceCode)
	value, err := s.loadGeoCached(ctx, config, "cities:"+provinceCode, geoTerritoryTTL(config)*2, func(ctx context.Context, client *geordmap.Client) (any, error) {
		return client.Cities(ctx, provinceCode)
	})
	if err != nil {
		return nil, err
	}
	items, ok := value.([]geordmap.City)
	if !ok {
		return nil, apiError{status: http.StatusBadGateway, msg: "GEO RD MAP devolvió ciudades con un formato inesperado"}
	}
	return items, nil
}

func (s *Server) geoNeighborhoods(ctx context.Context, config platformGeoRDMapConfig, cityID string) ([]geordmap.Neighborhood, error) {
	cityID = strings.TrimSpace(cityID)
	value, err := s.loadGeoCached(ctx, config, "neighborhoods:"+cityID, geoTerritoryTTL(config), func(ctx context.Context, client *geordmap.Client) (any, error) {
		return client.Neighborhoods(ctx, cityID, true)
	})
	if err != nil {
		return nil, err
	}
	items, ok := value.([]geordmap.Neighborhood)
	if !ok {
		return nil, apiError{status: http.StatusBadGateway, msg: "GEO RD MAP devolvió barrios con un formato inesperado"}
	}
	return items, nil
}

func geoCityID(provinceCode, municipalityCode, districtCode string) string {
	provinceCode = strings.TrimSpace(provinceCode)
	municipalityCode = strings.TrimSpace(municipalityCode)
	districtCode = strings.TrimSpace(districtCode)
	if districtCode == "" {
		districtCode = "01"
	}
	if provinceCode == "" || municipalityCode == "" {
		return ""
	}
	return provinceCode + ":" + municipalityCode + ":" + districtCode
}

func splitGeoCityID(cityID string) (provinceCode, municipalityCode, districtCode string) {
	parts := strings.Split(strings.TrimSpace(cityID), ":")
	if len(parts) >= 3 {
		return parts[0], parts[1], parts[2]
	}
	return "", "", ""
}

func (s *Server) territoryProvinces(w http.ResponseWriter, r *http.Request) {
	config, err := s.readPlatformGeoRDMapConfig(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	items, err := s.geoProvinces(r.Context(), config)
	if err != nil {
		writeError(w, err)
		return
	}
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{
			"code":       strings.TrimSpace(item.Code),
			"name":       strings.TrimSpace(item.Name),
			"identifier": strings.TrimSpace(item.Code),
			"source":     "geo_rd_map",
		})
	}
	sort.SliceStable(out, func(i, j int) bool { return fmt.Sprint(out[i]["name"]) < fmt.Sprint(out[j]["name"]) })
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) territoryDistricts(w http.ResponseWriter, r *http.Request) {
	provinceCode := firstNonEmpty(r.URL.Query().Get("provinceCode"), r.URL.Query().Get("province_code"))
	if provinceCode == "" {
		writeError(w, badRequest("Selecciona una provincia"))
		return
	}
	config, err := s.readPlatformGeoRDMapConfig(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	items, err := s.geoCities(r.Context(), config, provinceCode)
	if err != nil {
		writeError(w, err)
		return
	}
	out := make([]map[string]any, 0, len(items))
	for idx, item := range items {
		cityProvince := firstNonEmpty(strings.TrimSpace(item.ProvinceCode), provinceCode)
		districtCode := firstNonEmpty(strings.TrimSpace(item.DistrictCode), "01")
		cityID := firstNonEmpty(strings.TrimSpace(item.CityID), geoCityID(cityProvince, item.MunicipalityCode, districtCode))
		out = append(out, map[string]any{
			"id":               idx + 1,
			"code":             districtCode,
			"name":             strings.TrimSpace(item.Name),
			"identifier":       cityID,
			"cityId":           cityID,
			"provinceCode":     cityProvince,
			"municipalityCode": strings.TrimSpace(item.MunicipalityCode),
			"districtCode":     districtCode,
			"kind":             strings.TrimSpace(item.Kind),
			"kindLabel":        strings.TrimSpace(item.KindLabel),
			"source":           "geo_rd_map",
		})
	}
	sort.SliceStable(out, func(i, j int) bool { return fmt.Sprint(out[i]["name"]) < fmt.Sprint(out[j]["name"]) })
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) territoryNeighborhoods(w http.ResponseWriter, r *http.Request) {
	provinceCode := firstNonEmpty(r.URL.Query().Get("provinceCode"), r.URL.Query().Get("province_code"))
	municipalityCode := firstNonEmpty(r.URL.Query().Get("municipalityCode"), r.URL.Query().Get("municipality_code"))
	districtCode := firstNonEmpty(r.URL.Query().Get("districtCode"), r.URL.Query().Get("district_code"))
	cityID := firstNonEmpty(r.URL.Query().Get("cityId"), r.URL.Query().Get("city_id"), geoCityID(provinceCode, municipalityCode, districtCode))
	if cityID == "" {
		writeError(w, badRequest("Selecciona provincia y municipio/distrito"))
		return
	}
	if provinceCode == "" || municipalityCode == "" {
		provinceCode, municipalityCode, districtCode = splitGeoCityID(cityID)
	}
	config, err := s.readPlatformGeoRDMapConfig(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	items, err := s.geoNeighborhoods(r.Context(), config, cityID)
	if err != nil {
		writeError(w, err)
		return
	}
	out := make([]territoryNeighborhood, 0, len(items))
	for _, item := range items {
		id := firstNonEmpty(strings.TrimSpace(item.ID), strings.TrimSpace(item.Name))
		out = append(out, territoryNeighborhood{
			ID:               id,
			Identifier:       id,
			Name:             strings.TrimSpace(item.Name),
			DistrictCode:     firstNonEmpty(districtCode, "01"),
			MunicipalityCode: municipalityCode,
			ProvinceCode:     provinceCode,
			Custom:           item.Custom,
			Source:           "geo_rd_map",
			ReviewStatus:     "approved",
		})
	}
	sort.SliceStable(out, func(i, j int) bool { return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name) })
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) territorySummaryPayload(ctx context.Context, fresh bool) (map[string]any, error) {
	config, err := s.readPlatformGeoRDMapConfig(ctx)
	if err != nil {
		return nil, err
	}
	if !geoConfigReady(config) {
		return map[string]any{
			"status":                  "configuration_required",
			"statusLabel":             "Configuración requerida",
			"syncStatus":              "disabled",
			"regionCount":             0,
			"provinceCount":           0,
			"districtCount":           0,
			"neighborhoodCount":       0,
			"customNeighborhoodCount": 0,
			"source":                  "GEO RD MAP",
			"sourceURL":               config.BaseURL,
			"automaticSync":           "La división territorial se administra centralmente en GEO RD MAP.",
			"message":                 "Configura la API key de GEO RD MAP para activar la división territorial.",
			"ready":                   false,
		}, nil
	}
	status, err := s.geoTerritoryStatus(ctx, config, fresh)
	if err != nil {
		return nil, err
	}
	available := status.Postgres == "" || strings.EqualFold(status.Postgres, "ok")
	label := "GEO RD MAP operativo"
	state := "available"
	if !available {
		label = "GEO RD MAP degradado"
		state = "degraded"
	}
	return map[string]any{
		"status":                  state,
		"statusLabel":             label,
		"syncStatus":              "live",
		"regionCount":             status.Regions,
		"provinceCount":           status.Provinces,
		"districtCount":           status.Cities,
		"neighborhoodCount":       status.Neighborhoods,
		"customNeighborhoodCount": status.CustomNeighborhoods,
		"postgres":                status.Postgres,
		"redis":                   status.Redis,
		"source":                  "GEO RD MAP",
		"sourceURL":               config.BaseURL,
		"lastSync":                "Consulta centralizada",
		"automaticSync":           "GEO RD MAP mantiene el catálogo territorial central; WAMERCIO consulta la API desde su backend y conserva una caché temporal.",
		"message":                 "",
		"ready":                   true,
	}, nil
}

func (s *Server) territorySummary(w http.ResponseWriter, r *http.Request) {
	payload, err := s.territorySummaryPayload(r.Context(), false)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, payload)
}

func (s *Server) verifyTerritoryData(w http.ResponseWriter, r *http.Request) {
	payload, err := s.territorySummaryPayload(r.Context(), true)
	if err != nil {
		writeError(w, err)
		return
	}
	payload["message"] = "Conexión verificada correctamente con GEO RD MAP."
	writeJSON(w, http.StatusOK, payload)
}

func (s *Server) syncTerritoryData(w http.ResponseWriter, r *http.Request) {
	if s.territoryCache != nil {
		s.territoryCache.clear()
	}
	payload, err := s.territorySummaryPayload(r.Context(), true)
	if err != nil {
		writeError(w, err)
		return
	}
	payload["message"] = "Caché territorial de WAMERCIO actualizada desde GEO RD MAP."
	writeJSON(w, http.StatusOK, payload)
}

func (s *Server) territoryAllNeighborhoods(w http.ResponseWriter, r *http.Request) {
	writeError(w, apiError{status: http.StatusGone, msg: "La consulta global de barrios fue retirada. Usa Provincia → Ciudad → Barrio mediante GEO RD MAP."})
}

func (s *Server) territoryCustomNeighborhoods(w http.ResponseWriter, r *http.Request) {
	// Los barrios personalizados son globales y se administran exclusivamente
	// en GEO RD MAP. Los aprobados ya vienen mezclados en el selector de barrios.
	writeJSON(w, http.StatusOK, []territoryNeighborhood{})
}

func normalizeTerritoryCustomNeighborhoodInput(input *territoryCustomNeighborhoodInput) {
	input.Name = strings.Join(strings.Fields(strings.TrimSpace(input.Name)), " ")
	input.ProvinceCode = strings.TrimSpace(input.ProvinceCode)
	input.ProvinceName = strings.TrimSpace(input.ProvinceName)
	input.MunicipalityCode = strings.TrimSpace(input.MunicipalityCode)
	input.MunicipalityName = strings.TrimSpace(input.MunicipalityName)
	input.DistrictCode = strings.TrimSpace(input.DistrictCode)
	input.CityID = strings.TrimSpace(input.CityID)
	if input.CityID == "" {
		input.CityID = geoCityID(input.ProvinceCode, input.MunicipalityCode, input.DistrictCode)
	}
	if input.ProvinceCode == "" || input.MunicipalityCode == "" || input.DistrictCode == "" {
		p, m, d := splitGeoCityID(input.CityID)
		input.ProvinceCode = firstNonEmpty(input.ProvinceCode, p)
		input.MunicipalityCode = firstNonEmpty(input.MunicipalityCode, m)
		input.DistrictCode = firstNonEmpty(input.DistrictCode, d)
	}
}

func validateTerritoryCustomNeighborhoodInput(input territoryCustomNeighborhoodInput) error {
	length := utf8.RuneCountInString(input.Name)
	if length < 2 || length > 120 {
		return badRequest("El nombre del barrio debe contener entre 2 y 120 caracteres")
	}
	if input.CityID == "" || input.ProvinceCode == "" || input.MunicipalityCode == "" || input.DistrictCode == "" {
		return badRequest("La provincia y el municipio/distrito son obligatorios")
	}
	return nil
}

func suggestedNeighborhoodID(cityID, name string) string {
	digest := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(cityID)) + "|" + strings.ToLower(strings.TrimSpace(name))))
	return "geo-suggested:" + hex.EncodeToString(digest[:8])
}

func (s *Server) submitGeoNeighborhoodSuggestion(ctx context.Context, input territoryCustomNeighborhoodInput, submittedRole, submittedName string) (territoryNeighborhood, error) {
	config, err := s.readPlatformGeoRDMapConfig(ctx)
	if err != nil {
		return territoryNeighborhood{}, err
	}
	if !geoConfigReady(config) {
		return territoryNeighborhood{}, geoConfigurationRequiredError()
	}
	requestCtx, cancel := context.WithTimeout(ctx, time.Duration(config.TimeoutSeconds)*time.Second)
	defer cancel()
	_, err = s.geoRDMapClient(config).SuggestNeighborhood(requestCtx, geordmap.SuggestNeighborhoodInput{
		Name:          input.Name,
		CityID:        input.CityID,
		SubmittedRole: strings.TrimSpace(submittedRole),
		SubmittedName: strings.TrimSpace(submittedName),
	})
	if err != nil {
		var apiErr *geordmap.APIError
		if !errors.As(err, &apiErr) || apiErr.StatusCode != http.StatusConflict {
			return territoryNeighborhood{}, geoFriendlyError(err)
		}
		// Un 409 normalmente significa que el barrio ya existe o que ya fue
		// sugerido. No bloqueamos el flujo del consumidor por una duplicidad.
	}
	if s.territoryCache != nil {
		s.territoryCache.clear()
	}
	return territoryNeighborhood{
		ID:               suggestedNeighborhoodID(input.CityID, input.Name),
		Identifier:       input.CityID,
		Name:             input.Name,
		DistrictCode:     input.DistrictCode,
		MunicipalityCode: input.MunicipalityCode,
		MunicipalityName: input.MunicipalityName,
		ProvinceCode:     input.ProvinceCode,
		ProvinceName:     input.ProvinceName,
		Custom:           true,
		Source:           "geo_rd_map",
		ReviewStatus:     "pending",
		OriginalName:     input.Name,
		SubmittedBy:      submittedRole,
		SubmissionCount:  1,
		CreatedAt:        time.Now(),
	}, nil
}

func (s *Server) createTerritoryCustomNeighborhood(w http.ResponseWriter, r *http.Request) {
	var input territoryCustomNeighborhoodInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	normalizeTerritoryCustomNeighborhoodInput(&input)
	if err := validateTerritoryCustomNeighborhoodInput(input); err != nil {
		writeError(w, err)
		return
	}
	role := "business_admin"
	name := ""
	if strings.Contains(r.URL.Path, "/platform/") {
		role = "platform_admin"
		name = s.platformActor(r)
	} else if tenant, ok := tenancy.FromContext(r.Context()); ok {
		name = tenant.Name
	}
	item, err := s.submitGeoNeighborhoodSuggestion(r.Context(), input, role, name)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, item)
}

func (s *Server) updateTerritoryCustomNeighborhood(w http.ResponseWriter, r *http.Request) {
	writeError(w, apiError{status: http.StatusConflict, msg: "Los barrios personalizados se revisan y editan centralmente en GEO RD MAP."})
}

func (s *Server) deleteTerritoryCustomNeighborhood(w http.ResponseWriter, r *http.Request) {
	writeError(w, apiError{status: http.StatusConflict, msg: "Los barrios personalizados se revocan o eliminan centralmente en GEO RD MAP."})
}

func normalizeCustomerSubmittedNeighborhoodName(value string) (string, error) {
	name := strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
	length := utf8.RuneCountInString(name)
	if length < 2 {
		return "", badRequest("Escribe el nombre de tu barrio o residencial")
	}
	if length > 120 {
		return "", badRequest("El nombre del barrio o residencial no puede superar 120 caracteres")
	}
	return name, nil
}

func customerRequestedCustomNeighborhood(input map[string]any) bool {
	for _, key := range []string{"custom_neighborhood", "customNeighborhood", "neighborhood_custom", "neighborhoodCustom"} {
		if value, ok := input[key]; ok && boolFromAny(value, false) {
			return true
		}
	}
	return false
}

func (s *Server) ensureCustomerSubmittedNeighborhood(ctx context.Context, input map[string]any, store Store) error {
	if !customerRequestedCustomNeighborhood(input) {
		return nil
	}
	name, err := normalizeCustomerSubmittedNeighborhoodName(firstNonEmpty(str(input, "neighborhood"), str(input, "sector")))
	if err != nil {
		return err
	}
	custom := territoryCustomNeighborhoodInput{
		Name:             name,
		ProvinceCode:     strDefaultEither(input, "province_code", "provinceCode", ""),
		ProvinceName:     strings.TrimSpace(str(input, "province")),
		MunicipalityCode: strDefaultEither(input, "municipality_code", "municipalityCode", ""),
		MunicipalityName: strings.TrimSpace(str(input, "municipality")),
		DistrictCode:     strDefaultEither(input, "district_code", "districtCode", ""),
	}
	normalizeTerritoryCustomNeighborhoodInput(&custom)
	if err := validateTerritoryCustomNeighborhoodInput(custom); err != nil {
		return err
	}
	submittedName := strings.TrimSpace(store.Name)
	if tenant, ok := tenancy.FromContext(ctx); ok && strings.TrimSpace(tenant.Name) != "" {
		submittedName = strings.TrimSpace(tenant.Name)
	}
	item, err := s.submitGeoNeighborhoodSuggestion(ctx, custom, "customer_registration", submittedName)
	if err != nil {
		return err
	}
	input["neighborhood"] = item.Name
	input["sector"] = item.Name
	input["neighborhood_id"] = item.ID
	input["neighborhoodId"] = item.ID
	input["custom_neighborhood"] = true
	input["customNeighborhood"] = true
	return nil
}

func (s *Server) canonicalCustomNeighborhoodName(ctx context.Context, neighborhoodID, fallback string) (string, bool) {
	neighborhoodID = strings.TrimSpace(neighborhoodID)
	if strings.HasPrefix(neighborhoodID, "geo-suggested:") {
		return strings.TrimSpace(fallback), true
	}
	// Compatibilidad únicamente para registros creados antes de la migración a
	// GEO RD MAP. No se crean nuevos barrios en esta tabla.
	if neighborhoodID == "" || s.db == nil {
		return fallback, false
	}
	var name string
	registryCtx := ctx
	if _, ok := tenancy.FromContext(ctx); ok {
		registryCtx = tenancy.WithoutTenant(ctx)
	}
	err := s.db.QueryRow(registryCtx, `SELECT name FROM territory_custom_neighborhoods WHERE id::text=$1 LIMIT 1`, neighborhoodID).Scan(&name)
	if err == nil && strings.TrimSpace(name) != "" {
		return strings.TrimSpace(name), true
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return fallback, false
	}
	return fallback, false
}
