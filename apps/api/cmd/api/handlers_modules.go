package main

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"golang.org/x/crypto/bcrypt"

	"wamercio/api/internal/auth"
	"wamercio/api/internal/httpx"
	"wamercio/api/internal/store"
)

func (a *app) banners(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	x, err := a.st.Banners(r.Context(), c.TenantID)
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "banners": x})
}
func (a *app) createBanner(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in store.Banner
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	x, err := a.st.CreateBanner(r.Context(), c.TenantID, in)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "banner": x})
}
func (a *app) deleteBanner(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	if err := a.st.DeleteBanner(r.Context(), c.TenantID, chi.URLParam(r, "id")); err != nil {
		httpx.Error(w, 404, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
}

func (a *app) coupons(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	x, err := a.st.Coupons(r.Context(), c.TenantID)
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "coupons": x})
}
func (a *app) createCoupon(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in store.CouponRow
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	if in.Type != "percent" && in.Type != "fixed" {
		httpx.Error(w, 422, "tipo de cupón inválido")
		return
	}
	x, err := a.st.CreateCoupon(r.Context(), c.TenantID, in)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "coupon": x})
}
func (a *app) deleteCoupon(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	if err := a.st.DeleteCoupon(r.Context(), c.TenantID, chi.URLParam(r, "id")); err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
}

func (a *app) deliveryZones(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	x, err := a.st.DeliveryZones(r.Context(), c.TenantID)
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "zones": x})
}
func (a *app) createDeliveryZone(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in store.DeliveryZone
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	x, err := a.st.CreateDeliveryZone(r.Context(), c.TenantID, in)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "zone": x})
}
func (a *app) deleteDeliveryZone(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	if err := a.st.DeleteDeliveryZone(r.Context(), c.TenantID, chi.URLParam(r, "id")); err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
}

func (a *app) openingHours(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	x, err := a.st.OpeningHours(r.Context(), c.TenantID)
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "hours": x})
}
func (a *app) saveOpeningHours(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in struct {
		Hours []store.OpeningHour `json:"hours"`
	}
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	if err := a.st.SaveOpeningHours(r.Context(), c.TenantID, in.Hours); err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
}

func (a *app) tables(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	x, err := a.st.Tables(r.Context(), c.TenantID)
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "tables": x})
}
func (a *app) createTable(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in store.TableRow
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	x, err := a.st.CreateTable(r.Context(), c.TenantID, in)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "table": x})
}
func (a *app) deleteTable(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	if err := a.st.DeleteTable(r.Context(), c.TenantID, chi.URLParam(r, "id")); err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
}

func (a *app) settings(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	x, err := a.st.Settings(r.Context(), c.TenantID)
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "settings": x})
}
func (a *app) updateSettings(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in store.TenantSettings
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	if strings.TrimSpace(in.Name) == "" {
		httpx.Error(w, 422, "nombre requerido")
		return
	}
	if in.GeoProvinceCode != "" || in.GeoCityID != "" || in.Latitude != 0 || in.Longitude != 0 {
		norm, geoErr := a.normalizeGeoAddress(r.Context(), in.GeoProvinceCode, in.GeoCityID, in.GeoNeighborhoodID, in.Latitude, in.Longitude)
		if geoErr != nil {
			httpx.Error(w, 422, "ubicación inválida: "+geoErr.Error())
			return
		}
		in.GeoProvinceCode, in.GeoCityID, in.GeoNeighborhoodID = norm.ProvinceCode, norm.CityID, norm.NeighborhoodID
		in.Sector = norm.NeighborhoodName
		if norm.GeoID != "" {
			in.GeoID = norm.GeoID
		}
		if norm.Label != "" {
			in.GeoAddressLabel = norm.Label
		}
		if norm.Source != "" {
			in.GeoAddressSource = norm.Source
		}
		if norm.Street != "" && strings.TrimSpace(in.Address) == "" {
			in.Address = norm.Street
		}
	}
	x, err := a.st.UpdateSettings(r.Context(), c.TenantID, in)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "settings": x})
}
func (a *app) subscription(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	x, err := a.st.Subscription(r.Context(), c.TenantID)
	if err != nil {
		httpx.Error(w, 404, "suscripción no encontrada")
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "subscription": x})
}
func (a *app) report(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	x, err := a.st.Report(r.Context(), c.TenantID)
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "days": x})
}
func (a *app) customers(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	x, err := a.st.Customers(r.Context(), c.TenantID)
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "customers": x})
}

func (a *app) publicPlans(w http.ResponseWriter, r *http.Request) {
	x, err := a.st.PublicPlans(r.Context())
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "plans": x})
}
func (a *app) publicMarketplace(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	m, tenants, err := a.st.Marketplace(r.Context(), slug)
	if err != nil {
		httpx.Error(w, 404, "marketplace no encontrado")
		return
	}
	products, _ := a.st.MarketplaceProducts(r.Context(), slug)
	httpx.JSON(w, 200, map[string]any{"ok": true, "marketplace": m, "tenants": tenants, "products": products})
}
func (a *app) register(w http.ResponseWriter, r *http.Request) {
	if !a.identityRateAllowed(r.Context(), "business-register", requestIP(r)) {
		httpx.Error(w, 429, "demasiados intentos de registro; intenta nuevamente en un minuto")
		return
	}
	var in store.RegisterInput
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	if len(in.Password) < 8 {
		httpx.Error(w, 422, "la contraseña debe tener al menos 8 caracteres")
		return
	}
	person, err := a.resolvePersonIdentity(r.Context(), in.OwnerCedula, a.cfg.IdentityOwnerContext, middleware.GetReqID(r.Context()))
	if err != nil {
		httpx.Error(w, 422, "no fue posible verificar al responsable: "+err.Error())
		return
	}
	in.OwnerName = person.FullName
	legalType := strings.TrimSpace(in.LegalSubjectType)
	if legalType == "" {
		legalType = "persona"
	}
	if legalType != "persona" && legalType != "empresa" {
		httpx.Error(w, 422, "tipo legal de negocio inválido")
		return
	}
	in.LegalSubjectType = legalType
	if a.geo == nil || !a.geo.Configured() {
		httpx.Error(w, 503, "GEO RD MAP no está configurado")
		return
	}
	geoAddr, geoErr := a.normalizeGeoAddress(r.Context(), in.GeoProvinceCode, in.GeoCityID, in.GeoNeighborhoodID, in.Latitude, in.Longitude)
	if geoErr != nil {
		httpx.Error(w, 422, "ubicación del negocio inválida: "+geoErr.Error())
		return
	}
	in.GeoProvinceCode, in.GeoProvinceName = geoAddr.ProvinceCode, geoAddr.ProvinceName
	in.GeoCityID, in.GeoCityName = geoAddr.CityID, geoAddr.CityName
	in.GeoNeighborhoodID, in.GeoNeighborhoodName = geoAddr.NeighborhoodID, geoAddr.NeighborhoodName
	if geoAddr.GeoID != "" {
		in.GeoID = geoAddr.GeoID
	}
	if geoAddr.Label != "" {
		in.GeoAddressLabel = geoAddr.Label
	}
	if geoAddr.Source != "" {
		in.GeoAddressSource = geoAddr.Source
	}
	if geoAddr.Street != "" && strings.TrimSpace(in.Address) == "" {
		in.Address = geoAddr.Street
	}
	var company *store.VerifiedCompany
	if legalType == "empresa" {
		v, verifyErr := a.id.Verify(r.Context(), "empresa", in.RNC, a.cfg.IdentityBusinessContext, middleware.GetReqID(r.Context()))
		if verifyErr != nil || !v.Valida || !v.Encontrada || !v.PuedeRegistrarse || v.Company == nil {
			msg := "el RNC no pudo ser verificado"
			if verifyErr != nil {
				msg = verifyErr.Error()
			} else if strings.TrimSpace(v.Motivo) != "" {
				msg = v.Motivo
			}
			httpx.Error(w, 422, msg)
			return
		}
		c := verifiedCompany(v)
		company = &c
	}
	h, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		httpx.Error(w, 500, "no fue posible proteger la contraseña")
		return
	}
	id, err := a.st.RegisterTenant(r.Context(), in, string(h), person, company)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "tenant_id": id, "slug": in.Slug, "owner": personPublic(person)})
}

func (a *app) productDetail(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	x, err := a.st.ProductAdmin(r.Context(), c.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, 404, "producto no encontrado")
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "detail": x})
}
func (a *app) createProductFull(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in store.ProductWrite
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	if strings.TrimSpace(in.Name) == "" || in.CategoryID == "" {
		httpx.Error(w, 422, "nombre y categoría son requeridos")
		return
	}
	x, err := a.st.CreateProductFull(r.Context(), c.TenantID, in)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "product": x})
}
func (a *app) updateProduct(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in store.ProductWrite
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	x, err := a.st.UpdateProduct(r.Context(), c.TenantID, chi.URLParam(r, "id"), in)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "product": x})
}
func (a *app) deleteProduct(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	if err := a.st.DeleteProduct(r.Context(), c.TenantID, chi.URLParam(r, "id")); err != nil {
		httpx.Error(w, 404, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
}
func (a *app) addProductImage(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in struct {
		URL string `json:"url"`
	}
	if httpx.Decode(r, &in) != nil || in.URL == "" {
		httpx.Error(w, 400, "URL requerida")
		return
	}
	x, err := a.st.AddProductImage(r.Context(), c.TenantID, chi.URLParam(r, "id"), in.URL)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "image": x})
}
func (a *app) deleteProductImage(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	if err := a.st.DeleteProductImage(r.Context(), c.TenantID, chi.URLParam(r, "id"), chi.URLParam(r, "imageID")); err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
}
func (a *app) addOptionGroup(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in store.ProductOptionGroup
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	if in.Name == "" {
		httpx.Error(w, 422, "nombre requerido")
		return
	}
	if in.MaxSelect < 1 {
		in.MaxSelect = 1
	}
	x, err := a.st.AddOptionGroup(r.Context(), c.TenantID, chi.URLParam(r, "id"), in)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "group": x})
}
func (a *app) deleteOptionGroup(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	if err := a.st.DeleteOptionGroup(r.Context(), c.TenantID, chi.URLParam(r, "id"), chi.URLParam(r, "groupID")); err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
}

func (a *app) publicProductDetail(w http.ResponseWriter, r *http.Request) {
	t, err := a.st.PublicTenant(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		httpx.Error(w, 404, "negocio no encontrado")
		return
	}
	x, err := a.st.ProductAdmin(r.Context(), t.ID, chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, 404, "producto no encontrado")
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "detail": x})
}
