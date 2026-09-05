package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"wamercio/api/internal/auth"
	"wamercio/api/internal/httpx"
	"wamercio/api/internal/store"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
)

func (a *app) adminPlans(w http.ResponseWriter, r *http.Request) {
	x, err := a.st.AdminPlans(r.Context())
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "plans": x})
}
func (a *app) saveAdminPlan(w http.ResponseWriter, r *http.Request) {
	var in store.AdminPlan
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	x, err := a.st.SaveAdminPlan(r.Context(), chi.URLParam(r, "id"), in)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "plan": x})
}
func (a *app) createAdminPlan(w http.ResponseWriter, r *http.Request) {
	var in store.AdminPlan
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	x, err := a.st.SaveAdminPlan(r.Context(), "", in)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "plan": x})
}

func (a *app) adminUsers(w http.ResponseWriter, r *http.Request) {
	x, err := a.st.AdminUsers(r.Context())
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "users": x})
}
func (a *app) createAdminUser(w http.ResponseWriter, r *http.Request) {
	var in struct {
		store.AdminUser
		Password string
	}
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	if len(in.Password) < 8 {
		httpx.Error(w, 422, "contraseña mínima de 8 caracteres")
		return
	}
	allowed := map[string]bool{"superadmin": true, "tenant_admin": true, "staff": true, "affiliate": true}
	if !allowed[in.Role] {
		httpx.Error(w, 422, "rol inválido")
		return
	}
	h, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		httpx.Error(w, 500, "no fue posible proteger la contraseña")
		return
	}
	x, err := a.st.CreateAdminUser(r.Context(), in.AdminUser, string(h))
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "user": x})
}
func (a *app) setAdminUserActive(w http.ResponseWriter, r *http.Request) {
	var in struct{ Active bool }
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	if err := a.st.SetUserActive(r.Context(), chi.URLParam(r, "id"), in.Active); err != nil {
		httpx.Error(w, 404, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
}

func (a *app) adminSubscriptions(w http.ResponseWriter, r *http.Request) {
	x, err := a.st.AdminSubscriptions(r.Context())
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "subscriptions": x})
}
func (a *app) createAdminSubscription(w http.ResponseWriter, r *http.Request) {
	var in store.AdminSubscription
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	if in.Status == "" {
		in.Status = "active"
	}
	x, err := a.st.CreateSubscription(r.Context(), in)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "subscription": x})
}
func (a *app) updateAdminSubscription(w http.ResponseWriter, r *http.Request) {
	var in struct{ Status, ExpiresAt string }
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	if err := a.st.UpdateSubscription(r.Context(), chi.URLParam(r, "id"), in.Status, in.ExpiresAt); err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
}

func (a *app) adminVouchers(w http.ResponseWriter, r *http.Request) {
	x, err := a.st.AdminVouchers(r.Context())
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "vouchers": x})
}
func (a *app) createAdminVoucher(w http.ResponseWriter, r *http.Request) {
	var in store.AdminVoucher
	if httpx.Decode(r, &in) != nil || strings.TrimSpace(in.Code) == "" {
		httpx.Error(w, 400, "código requerido")
		return
	}
	x, err := a.st.CreateVoucher(r.Context(), in)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "voucher": x})
}
func (a *app) deleteAdminVoucher(w http.ResponseWriter, r *http.Request) {
	if err := a.st.DeleteVoucher(r.Context(), chi.URLParam(r, "id")); err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
}

func (a *app) adminAffiliates(w http.ResponseWriter, r *http.Request) {
	x, err := a.st.Affiliates(r.Context())
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "affiliates": x})
}
func (a *app) createAdminAffiliate(w http.ResponseWriter, r *http.Request) {
	var in store.AffiliateRow
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	x, err := a.st.SaveAffiliate(r.Context(), "", in)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "affiliate": x})
}
func (a *app) updateAdminAffiliate(w http.ResponseWriter, r *http.Request) {
	var in store.AffiliateRow
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	x, err := a.st.SaveAffiliate(r.Context(), chi.URLParam(r, "id"), in)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "affiliate": x})
}

func (a *app) adminMarketplaces(w http.ResponseWriter, r *http.Request) {
	x, err := a.st.MarketplacesAdmin(r.Context())
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "marketplaces": x})
}
func (a *app) createAdminMarketplace(w http.ResponseWriter, r *http.Request) {
	var in store.MarketplaceAdmin
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	if in.Accent == "" {
		in.Accent = "#ff5400"
	}
	if in.GeoProvinceCode == "" || in.GeoCityID == "" {
		httpx.Error(w, 422, "provincia y ciudad GEO RD MAP son requeridas")
		return
	}
	norm, geoErr := a.normalizeGeoAddress(r.Context(), in.GeoProvinceCode, in.GeoCityID, "", 0, 0)
	if geoErr != nil {
		httpx.Error(w, 422, geoErr.Error())
		return
	}
	in.GeoProvinceCode, in.GeoCityID = norm.ProvinceCode, norm.CityID
	x, err := a.st.SaveMarketplace(r.Context(), "", in)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "marketplace": x})
}
func (a *app) updateAdminMarketplace(w http.ResponseWriter, r *http.Request) {
	var in store.MarketplaceAdmin
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	if in.GeoProvinceCode == "" || in.GeoCityID == "" {
		httpx.Error(w, 422, "provincia y ciudad GEO RD MAP son requeridas")
		return
	}
	norm, geoErr := a.normalizeGeoAddress(r.Context(), in.GeoProvinceCode, in.GeoCityID, "", 0, 0)
	if geoErr != nil {
		httpx.Error(w, 422, geoErr.Error())
		return
	}
	in.GeoProvinceCode, in.GeoCityID = norm.ProvinceCode, norm.CityID
	x, err := a.st.SaveMarketplace(r.Context(), chi.URLParam(r, "id"), in)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "marketplace": x})
}
func (a *app) adminGeography(w http.ResponseWriter, r *http.Request) {
	p, err := a.st.Provinces(r.Context())
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	m, _ := a.st.Municipalities(r.Context())
	httpx.JSON(w, 200, map[string]any{"ok": true, "provinces": p, "municipalities": m})
}
func (a *app) adminSettings(w http.ResponseWriter, r *http.Request) {
	x, err := a.st.SystemSettings(r.Context())
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "settings": x})
}
func (a *app) saveAdminSettings(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Settings map[string]string `json:"settings"`
	}
	if httpx.Decode(r, &in) != nil {
		httpx.Error(w, 400, "datos inválidos")
		return
	}
	if err := a.st.SaveSystemSettings(r.Context(), in.Settings); err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
}

func (a *app) integrations(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	x, err := a.st.Integrations(r.Context(), c.TenantID)
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	t, _ := a.st.Templates(r.Context(), c.TenantID)
	httpx.JSON(w, 200, map[string]any{"ok": true, "integrations": x, "templates": t})
}
func (a *app) saveIntegration(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in store.IntegrationRow
	if httpx.Decode(r, &in) != nil || in.Provider == "" {
		httpx.Error(w, 400, "proveedor requerido")
		return
	}
	if err := a.st.SaveIntegration(r.Context(), c.TenantID, in); err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
}
func (a *app) saveTemplate(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in store.TemplateRow
	if httpx.Decode(r, &in) != nil || in.Event == "" || in.TemplateText == "" {
		httpx.Error(w, 400, "evento y plantilla requeridos")
		return
	}
	if in.Channel == "" {
		in.Channel = "whatsapp"
	}
	if err := a.st.SaveTemplate(r.Context(), c.TenantID, in); err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
}

func randomToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
func tokenHash(v string) string { x := sha256.Sum256([]byte(v)); return hex.EncodeToString(x[:]) }
func (a *app) printerTokens(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	x, err := a.st.PrinterTokens(r.Context(), c.TenantID)
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "tokens": x})
}
func (a *app) createPrinterToken(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in struct{ Name string }
	_ = httpx.Decode(r, &in)
	if in.Name == "" {
		in.Name = "Impresora"
	}
	token, err := randomToken()
	if err != nil {
		httpx.Error(w, 500, "no se pudo generar el token")
		return
	}
	row, err := a.st.CreatePrinterToken(r.Context(), c.TenantID, in.Name, tokenHash(token))
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 201, map[string]any{"ok": true, "printer": row, "token": token})
}
func (a *app) printerPending(w http.ResponseWriter, r *http.Request) {
	token := r.Header.Get("X-Printer-Token")
	if token == "" {
		httpx.Error(w, 401, "token requerido")
		return
	}
	tenant, err := a.st.PrinterTenantByHash(r.Context(), tokenHash(token))
	if err != nil {
		httpx.Error(w, 401, "token inválido")
		return
	}
	x, err := a.st.PendingPrintOrders(r.Context(), tenant)
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "orders": x})
}
func (a *app) printerMarkPrinted(w http.ResponseWriter, r *http.Request) {
	token := r.Header.Get("X-Printer-Token")
	tenant, err := a.st.PrinterTenantByHash(r.Context(), tokenHash(token))
	if err != nil {
		httpx.Error(w, 401, "token inválido")
		return
	}
	if err := a.st.MarkPrinted(r.Context(), tenant, chi.URLParam(r, "id")); err != nil {
		httpx.Error(w, 404, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
}

func (a *app) affiliateSummary(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	x, err := a.st.AffiliateSummaryByUser(r.Context(), c.UserID)
	if err != nil {
		httpx.Error(w, 404, "afiliado no encontrado")
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "summary": x})
}
func (a *app) affiliateTenants(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	x, err := a.st.AffiliateTenantsByUser(r.Context(), c.UserID)
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "tenants": x})
}

func (a *app) orderDetail(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	x, err := a.st.OrderDetail(r.Context(), c.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, 404, "pedido no encontrado")
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "order": x})
}
func (a *app) updateCategory(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in struct {
		Name     string
		Position int
		Visible  bool
	}
	if httpx.Decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		httpx.Error(w, 400, "nombre requerido")
		return
	}
	x, err := a.st.UpdateCategory(r.Context(), c.TenantID, chi.URLParam(r, "id"), in.Name, in.Position, in.Visible)
	if err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "category": x})
}
func (a *app) deleteCategory(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	if err := a.st.DeleteCategory(r.Context(), c.TenantID, chi.URLParam(r, "id")); err != nil {
		httpx.Error(w, 422, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
}

func (a *app) publicGeography(w http.ResponseWriter, r *http.Request) {
	p, err := a.st.Provinces(r.Context())
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	m, _ := a.st.Municipalities(r.Context())
	httpx.JSON(w, 200, map[string]any{"ok": true, "provinces": p, "municipalities": m})
}
