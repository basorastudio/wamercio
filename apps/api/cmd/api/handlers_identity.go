package main

import (
	"context"
	"errors"
	"net"
	"net/http"
	"strings"
	"time"
	"wamercio/api/internal/httpx"
	ident "wamercio/api/internal/identity"
	"wamercio/api/internal/store"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
)

func (a *app) identityRateAllowed(ctx context.Context, flow, ip string) bool {
	if a.rdb == nil {
		return true
	}
	key := "wamercio:identity:public:" + flow + ":" + ip
	n, err := a.rdb.Incr(ctx, key).Result()
	if err != nil {
		return true
	}
	if n == 1 {
		_ = a.rdb.Expire(ctx, key, time.Minute).Err()
	}
	return n <= int64(a.cfg.IdentityPublicRateLimit)
}

func requestIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	if r.RemoteAddr == "" {
		return "unknown"
	}
	return r.RemoteAddr
}

func (a *app) verifyOwnerIdentity(w http.ResponseWriter, r *http.Request) {
	a.verifyPublicPerson(w, r, "owner", a.cfg.IdentityOwnerContext)
}
func (a *app) verifyCustomerIdentity(w http.ResponseWriter, r *http.Request) {
	a.verifyPublicPerson(w, r, "customer", a.cfg.IdentityCustomerContext)
}

func (a *app) verifyPublicPerson(w http.ResponseWriter, r *http.Request, flow, usageContext string) {
	if !a.identityRateAllowed(r.Context(), flow, requestIP(r)) {
		httpx.Error(w, 429, "demasiadas verificaciones; intenta nuevamente en un minuto")
		return
	}
	var in struct {
		Cedula string `json:"cedula"`
	}
	if httpx.Decode(r, &in) != nil || len(ident.Digits(in.Cedula)) != 11 {
		httpx.Error(w, 422, "introduce una cédula dominicana válida")
		return
	}
	p, err := a.resolvePersonIdentity(r.Context(), in.Cedula, usageContext, chimw.GetReqID(r.Context()))
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "identity": personPublic(p)})
}

func (a *app) verifyBusinessIdentity(w http.ResponseWriter, r *http.Request) {
	if !a.identityRateAllowed(r.Context(), "business", requestIP(r)) {
		httpx.Error(w, 429, "demasiadas verificaciones; intenta nuevamente en un minuto")
		return
	}
	var in struct {
		RNC string `json:"rnc"`
	}
	if httpx.Decode(r, &in) != nil || len(ident.Digits(in.RNC)) != 9 {
		httpx.Error(w, 422, "introduce un RNC válido")
		return
	}
	v, err := a.id.Verify(r.Context(), "empresa", in.RNC, a.cfg.IdentityBusinessContext, chimw.GetReqID(r.Context()))
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	if !v.Valida || !v.Encontrada || !v.PuedeRegistrarse || v.Company == nil {
		msg := strings.TrimSpace(v.Motivo)
		if msg == "" {
			msg = "el RNC no puede utilizarse para registrar el negocio"
		}
		httpx.Error(w, 422, msg)
		return
	}
	c := verifiedCompany(v)
	httpx.JSON(w, 200, map[string]any{"ok": true, "identity": map[string]any{"rnc": ident.Digits(c.RNC), "razon_social": c.LegalName, "nombre_comercial": c.TradeName, "estado": c.Status, "activa": c.Active, "fuente": c.Source, "request_id": c.RequestID, "requiere_confirmacion": v.RequiereConfirmacion}})
}

func (a *app) resolvePersonIdentity(ctx context.Context, cedula, usageContext, requestID string) (store.VerifiedPerson, error) {
	if a.id == nil || !a.id.Configured() {
		return store.VerifiedPerson{}, errors.New("la verificación de identidad no está configurada")
	}
	hash := a.id.DocumentHash(cedula)
	if p, ok, err := a.st.CachedIdentityPerson(ctx, hash); err == nil && ok {
		return p, nil
	}
	v, err := a.id.Verify(ctx, "persona", cedula, usageContext, requestID)
	if err != nil {
		return store.VerifiedPerson{}, err
	}
	if !v.Valida || !v.Encontrada || !v.PuedeAutocompletar || !v.PuedeRegistrarse || v.Person == nil {
		msg := strings.TrimSpace(v.Motivo)
		if msg == "" {
			msg = "la cédula no puede utilizarse para completar este registro"
		}
		return store.VerifiedPerson{}, errors.New(msg)
	}
	return verifiedPerson(a.id.DocumentHash(cedula), v), nil
}

func verifiedPerson(hash string, v ident.Verification) store.VerifiedPerson {
	p := v.Person
	return store.VerifiedPerson{DocumentHash: hash, DocumentMasked: ident.MaskDocument(p.Cedula), FullName: p.NombreCompleto, GivenNames: p.Nombres, Surnames: p.Apellidos, FirstName: p.PrimerNombre, SecondName: p.SegundoNombre, FirstSurname: p.PrimerApellido, SecondSurname: p.SegundoApellido, BirthDate: p.FechaNacimiento, Sex: p.Sexo, NameSplitReliable: p.SeparacionNombreConfiable, Source: v.Fuente, RequestID: v.RequestID}
}
func verifiedCompany(v ident.Verification) store.VerifiedCompany {
	c := v.Company
	return store.VerifiedCompany{RNC: ident.Digits(c.RNC), LegalName: c.RazonSocial, TradeName: c.NombreComercial, Status: c.Estado, Active: c.Activa, Source: v.Fuente, RequestID: v.RequestID}
}
func personPublic(p store.VerifiedPerson) map[string]any {
	return map[string]any{"documento": p.DocumentMasked, "nombre_completo": p.FullName, "nombres": p.GivenNames, "apellidos": p.Surnames, "primer_nombre": p.FirstName, "segundo_nombre": p.SecondName, "primer_apellido": p.FirstSurname, "segundo_apellido": p.SecondSurname, "fecha_nacimiento": p.BirthDate, "sexo": p.Sex, "separacion_nombre_confiable": p.NameSplitReliable, "fuente": p.Source, "request_id": p.RequestID, "verificada": true}
}

func validDominicanWhatsApp(v string) (string, bool) {
	d := ident.Digits(v)
	local := d
	if len(local) == 11 && strings.HasPrefix(local, "1") {
		local = local[1:]
	}
	if len(local) != 10 || !(strings.HasPrefix(local, "809") || strings.HasPrefix(local, "829") || strings.HasPrefix(local, "849")) {
		return "", false
	}
	return local, true
}

func (a *app) registerPublicCustomer(w http.ResponseWriter, r *http.Request) {
	if !a.identityRateAllowed(r.Context(), "customer-register", requestIP(r)) {
		httpx.Error(w, 429, "demasiados intentos de registro; intenta nuevamente en un minuto")
		return
	}
	slug := chi.URLParam(r, "slug")
	var in struct {
		Cedula            string  `json:"cedula"`
		WhatsApp          string  `json:"whatsapp"`
		Email             string  `json:"email"`
		Province          string  `json:"province"`
		Municipality      string  `json:"municipality"`
		Sector            string  `json:"sector"`
		Address           string  `json:"address"`
		Reference         string  `json:"reference"`
		GeoProvinceCode   string  `json:"geo_province_code"`
		GeoCityID         string  `json:"geo_city_id"`
		GeoNeighborhoodID string  `json:"geo_neighborhood_id"`
		GeoID             string  `json:"geo_id"`
		GeoAddressLabel   string  `json:"geo_address_label"`
		GeoAddressSource  string  `json:"geo_address_source"`
		Latitude          float64 `json:"latitude"`
		Longitude         float64 `json:"longitude"`
	}
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	phone, ok := validDominicanWhatsApp(in.WhatsApp)
	if !ok {
		httpx.Error(w, 422, "introduce un WhatsApp dominicano válido (809, 829 o 849)")
		return
	}
	p, err := a.resolvePersonIdentity(r.Context(), in.Cedula, a.cfg.IdentityCustomerContext, chimw.GetReqID(r.Context()))
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	geoAddr, err := a.normalizeGeoAddress(r.Context(), in.GeoProvinceCode, in.GeoCityID, in.GeoNeighborhoodID, in.Latitude, in.Longitude)
	if err != nil {
		httpx.Error(w, 422, "ubicación inválida: "+err.Error())
		return
	}
	address := strings.TrimSpace(in.Address)
	if address == "" && geoAddr.Street != "" {
		address = geoAddr.Street
	}
	c, err := a.st.RegisterVerifiedCustomer(r.Context(), store.PublicCustomerInput{TenantSlug: slug, WhatsApp: phone, Email: strings.TrimSpace(in.Email), Province: geoAddr.ProvinceName, Municipality: geoAddr.CityName, Sector: geoAddr.NeighborhoodName, Address: address, Reference: strings.TrimSpace(in.Reference), Person: p, GeoAddress: store.GeoAddressInput{ProvinceCode: geoAddr.ProvinceCode, CityID: geoAddr.CityID, NeighborhoodID: geoAddr.NeighborhoodID, GeoID: firstNonEmpty(geoAddr.GeoID, in.GeoID), Label: firstNonEmpty(geoAddr.Label, in.GeoAddressLabel), Source: firstNonEmpty(geoAddr.Source, in.GeoAddressSource), ProvinceName: geoAddr.ProvinceName, CityName: geoAddr.CityName, NeighborhoodName: geoAddr.NeighborhoodName, Address: address, Reference: strings.TrimSpace(in.Reference), Latitude: geoAddr.Latitude, Longitude: geoAddr.Longitude}})
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "customer": c})
}
