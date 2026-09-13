package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func (s *Server) adminValidateOwnerWhatsApp(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Phone string `json:"phone"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, http.StatusBadRequest, "Indica el WhatsApp del propietario")
		return
	}
	out, err := s.validateOwnerWhatsAppForSave(r.Context(), in.Phone)
	if err != nil {
		jsonErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	jsonOut(w, http.StatusOK, out)
}

func (s *Server) validateOwnerWhatsAppForSave(ctx context.Context, raw string) (map[string]any, error) {
	phone := normalizePhone(raw)
	if len(phone) < 8 || len(phone) > 15 {
		return nil, fmt.Errorf("El número de WhatsApp no es válido")
	}
	out, err := s.bridgeReq(ctx, http.MethodPost, "/sessions/support/check", map[string]string{"phone": "+" + phone})
	if err != nil {
		return nil, fmt.Errorf("No se pudo validar el WhatsApp. Vincula primero el WhatsApp de plataforma en Configuración → WhatsApp")
	}
	registered, _ := out["registered"].(bool)
	if !registered {
		return nil, fmt.Errorf("Este número no tiene WhatsApp activo. Verifica el número para continuar")
	}
	return map[string]any{
		"ok":         true,
		"registered": true,
		"phone":      "+" + phone,
		"jid":        out["jid"],
	}, nil
}

func nestedIdentityMaps(envelope map[string]any, kind string) []map[string]any {
	out := []map[string]any{envelope}
	for _, key := range []string{"data", "result"} {
		if m, ok := envelope[key].(map[string]any); ok {
			out = append(out, m)
			if child, ok := m[kind].(map[string]any); ok {
				out = append(out, child)
			}
			if kind == "persona" {
				if child, ok := m["persona"].(map[string]any); ok {
					out = append(out, child)
				}
			} else {
				if child, ok := m["empresa"].(map[string]any); ok {
					out = append(out, child)
				}
			}
		}
	}
	if child, ok := envelope[kind].(map[string]any); ok {
		out = append(out, child)
	}
	return out
}

func firstIdentityString(maps []map[string]any, keys ...string) string {
	for _, m := range maps {
		for _, key := range keys {
			if v, ok := m[key]; ok && v != nil {
				s := strings.TrimSpace(fmt.Sprint(v))
				if s != "" && s != "<nil>" {
					return s
				}
			}
		}
	}
	return ""
}

func normalizeIdentityDate(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	layouts := []string{"2006-01-02", time.RFC3339, "02/01/2006", "2/1/2006", "2006/01/02"}
	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed.Format("2006-01-02")
		}
	}
	if len(value) >= 10 && value[4] == '-' && value[7] == '-' {
		return value[:10]
	}
	return ""
}

func normalizeIdentityGender(value string) string {
	v := strings.ToLower(strings.TrimSpace(value))
	switch v {
	case "m", "masculino", "male", "hombre":
		return "masculino"
	case "f", "femenino", "female", "mujer":
		return "femenino"
	default:
		return ""
	}
}

func identityProfile(kind string, envelope map[string]any) map[string]any {
	maps := nestedIdentityMaps(envelope, kind)
	if kind == "persona" {
		name := firstIdentityString(maps, "nombres", "nombre", "first_name", "firstName")
		lastName := firstIdentityString(maps, "apellidos", "apellido", "last_name", "lastName")
		fullName := firstIdentityString(maps, "nombre_completo", "nombreCompleto", "full_name", "fullName")
		if name == "" && fullName != "" {
			parts := strings.Fields(fullName)
			if len(parts) > 0 {
				name = parts[0]
				if len(parts) > 1 {
					lastName = strings.Join(parts[1:], " ")
				}
			}
		}
		return map[string]any{
			"name":       name,
			"last_name":  lastName,
			"birth_date": normalizeIdentityDate(firstIdentityString(maps, "fecha_nacimiento", "fechaNacimiento", "birth_date", "birthDate")),
			"gender":     normalizeIdentityGender(firstIdentityString(maps, "sexo", "genero", "género", "gender")),
		}
	}
	legal := firstIdentityString(maps, "razon_social", "razonSocial", "razón_social", "legal_name", "legalName", "nombre")
	commercial := firstIdentityString(maps, "nombre_comercial", "nombreComercial", "commercial_name", "commercialName")
	if commercial == "" {
		commercial = legal
	}
	return map[string]any{"legal_name": legal, "commercial_name": commercial}
}

func (s *Server) verifyBusinessRNC(ctx context.Context, raw string) (string, map[string]any, time.Time, error) {
	rnc := digitsOnly(raw)
	if rnc == "" {
		return "", nil, time.Time{}, nil
	}
	if len(rnc) != 9 && len(rnc) != 11 {
		return "", nil, time.Time{}, fmt.Errorf("El RNC debe tener 9 u 11 dígitos")
	}
	identity := s.platformSetting(ctx, "identity")
	enabled, _ := identity["enabled"].(bool)
	if !enabled {
		return "", nil, time.Time{}, fmt.Errorf("La integración de Identidad Dominicana debe estar habilitada para verificar el RNC")
	}
	envelope, _, err := s.verifyIdentityDocument(ctx, "empresa", rnc)
	if err != nil {
		return "", nil, time.Time{}, fmt.Errorf("No pudimos verificar el RNC: %w", err)
	}
	return rnc, identityProfile("empresa", envelope), time.Now(), nil
}

func (s *Server) territoryGET(ctx context.Context, path string, query url.Values) (any, error) {
	cfg := s.platformSetting(ctx, "territory")
	enabled, _ := cfg["enabled"].(bool)
	if !enabled {
		return nil, fmt.Errorf("GEO RD MAP no está habilitado en Centro SaaS")
	}
	baseURL := "https://geo.ltd.do"
	if v, ok := cfg["base_url"].(string); ok && strings.TrimSpace(v) != "" {
		baseURL = strings.TrimRight(strings.TrimSpace(v), "/")
	}
	u := baseURL + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	if key := s.readPlatformSecret(ctx, "territory.api_key"); strings.TrimSpace(key) != "" {
		req.Header.Set("X-API-Key", key)
	}
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("GEO RD MAP respondió %d", resp.StatusCode)
	}
	var out any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *Server) adminTerritoryProvinces(w http.ResponseWriter, r *http.Request) {
	out, err := s.territoryGET(r.Context(), "/api/v1/territories/provinces", nil)
	if err != nil {
		jsonErr(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	jsonOut(w, http.StatusOK, out)
}

func (s *Server) adminTerritoryCities(w http.ResponseWriter, r *http.Request) {
	provinceCode := strings.TrimSpace(r.URL.Query().Get("provinceCode"))
	if provinceCode == "" {
		jsonErr(w, http.StatusBadRequest, "Selecciona una provincia")
		return
	}
	out, err := s.territoryGET(r.Context(), "/api/v1/territories/cities", url.Values{"provinceCode": []string{provinceCode}})
	if err != nil {
		jsonErr(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	jsonOut(w, http.StatusOK, out)
}

func (s *Server) adminTerritoryNeighborhoods(w http.ResponseWriter, r *http.Request) {
	cityID := strings.TrimSpace(r.URL.Query().Get("cityId"))
	if cityID == "" {
		jsonErr(w, http.StatusBadRequest, "Selecciona un municipio o distrito")
		return
	}
	out, err := s.territoryGET(r.Context(), "/api/v1/territories/cities/"+url.PathEscape(cityID)+"/neighborhoods", url.Values{"includeCustom": []string{"true"}})
	if err != nil {
		jsonErr(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	jsonOut(w, http.StatusOK, out)
}
