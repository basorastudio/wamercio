package httpapi

import (
	"net/http"
	"net/url"
	"strings"
	"time"
)

// publicValidateRegistrationWhatsApp validates a new owner's WhatsApp against
// the SaaS support session. Existing owners never need this endpoint to log in.
func (s *Server) publicValidateRegistrationWhatsApp(w http.ResponseWriter, r *http.Request) {
	if !s.allowAttempt(r.Context(), "rl:public-whatsapp-check:"+clientIP(r), 12, time.Minute) {
		jsonErr(w, http.StatusTooManyRequests, "Demasiadas validaciones. Espera un momento e inténtalo de nuevo")
		return
	}
	var in struct {
		Phone string `json:"phone"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, http.StatusBadRequest, "Indica un número de WhatsApp válido")
		return
	}
	out, err := s.validateOwnerWhatsAppForSave(r.Context(), in.Phone)
	if err != nil {
		jsonErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	jsonOut(w, http.StatusOK, out)
}

// publicVerifyRegistrationIdentity exposes only the normalized owner profile
// required by the registration form. The upstream response and API key stay
// server-side.
func (s *Server) publicVerifyRegistrationIdentity(w http.ResponseWriter, r *http.Request) {
	if !s.allowAttempt(r.Context(), "rl:public-identity-check:"+clientIP(r), 12, 5*time.Minute) {
		jsonErr(w, http.StatusTooManyRequests, "Demasiadas verificaciones. Espera unos minutos")
		return
	}
	var in struct {
		Cedula string `json:"cedula"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, http.StatusBadRequest, "Indica una Cédula válida")
		return
	}
	document := digitsOnly(in.Cedula)
	if len(document) != 11 {
		jsonErr(w, http.StatusBadRequest, "La Cédula debe tener exactamente 11 dígitos")
		return
	}
	identity := s.platformSetting(r.Context(), "identity")
	enabled, _ := identity["enabled"].(bool)
	if !enabled {
		jsonErr(w, http.StatusServiceUnavailable, "La integración de Identidad Dominicana no está habilitada")
		return
	}
	envelope, status, err := s.verifyIdentityDocument(r.Context(), "persona", document)
	if err != nil {
		jsonErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	jsonOut(w, http.StatusOK, map[string]any{
		"ok":       true,
		"status":   status,
		"document": document,
		"profile":  identityProfile("persona", envelope),
	})
}

func (s *Server) publicTerritoryProvinces(w http.ResponseWriter, r *http.Request) {
	if !s.allowAttempt(r.Context(), "rl:public-territory:"+clientIP(r), 90, time.Minute) {
		jsonErr(w, http.StatusTooManyRequests, "Demasiadas consultas territoriales")
		return
	}
	out, err := s.territoryGET(r.Context(), "/api/v1/territories/provinces", nil)
	if err != nil {
		jsonErr(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	jsonOut(w, http.StatusOK, out)
}

func (s *Server) publicTerritoryCities(w http.ResponseWriter, r *http.Request) {
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

func (s *Server) publicTerritoryNeighborhoods(w http.ResponseWriter, r *http.Request) {
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
