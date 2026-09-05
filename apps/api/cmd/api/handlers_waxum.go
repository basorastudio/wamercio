package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"wamercio/api/internal/auth"
	"wamercio/api/internal/httpx"
	"wamercio/api/internal/store"
	"wamercio/api/internal/whatsapp"
)

func waxumSessionID(tenantID string) string {
	return "wamercio-" + strings.ReplaceAll(strings.ToLower(tenantID), "-", "")
}

func (a *app) loadOrInitWaxum(ctx context.Context, tenantID string) (store.WaxumIntegration, string, error) {
	name, _, err := a.st.TenantIdentity(ctx, tenantID)
	if err != nil {
		return store.WaxumIntegration{}, "", err
	}
	x, err := a.st.WaxumIntegration(ctx, tenantID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return store.WaxumIntegration{}, "", err
	}
	if x.SessionID == "" {
		x.SessionID = waxumSessionID(tenantID)
	}
	if x.WebhookToken == "" {
		t, err := randomToken()
		if err != nil {
			return store.WaxumIntegration{}, "", err
		}
		x.WebhookToken = t
	}
	return x, name, nil
}

func (a *app) waxumStatus(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	if !a.wa.Configured() {
		httpx.JSON(w, 200, map[string]any{"ok": true, "configured": false, "status": "not_configured"})
		return
	}
	x, err := a.st.WaxumIntegration(r.Context(), c.TenantID)
	if errors.Is(err, pgx.ErrNoRows) || x.SessionID == "" {
		httpx.JSON(w, 200, map[string]any{"ok": true, "configured": true, "linked": false, "enabled": false, "status": "disconnected"})
		return
	}
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	status, err := a.wa.Status(r.Context(), x.SessionID)
	if err != nil {
		httpx.JSON(w, 200, map[string]any{"ok": true, "configured": true, "linked": false, "enabled": x.Enabled, "session_id": x.SessionID, "status": "disconnected", "warning": err.Error()})
		return
	}
	_ = a.st.UpdateWaxumConnectionState(r.Context(), c.TenantID, status.Status, status.PhoneNumber, status.PushName)
	httpx.JSON(w, 200, map[string]any{
		"ok": true, "configured": true, "linked": status.IsLoggedIn,
		"enabled": x.Enabled, "session_id": x.SessionID, "status": status.Status,
		"is_logged_in": status.IsLoggedIn, "socket_alive": status.SocketAlive, "paused": status.Paused,
		"phone_number": status.PhoneNumber, "push_name": status.PushName, "reachability": status.Reachability,
	})
}

func (a *app) waxumConnect(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	if c.Role != "tenant_admin" {
		httpx.Error(w, 403, "solo el administrador del negocio puede administrar la sesión de WhatsApp")
		return
	}
	if !a.wa.Configured() {
		httpx.Error(w, 503, "Waxum no está configurado por el SuperAdmin")
		return
	}
	x, tenantName, err := a.loadOrInitWaxum(r.Context(), c.TenantID)
	if err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	var webhook *whatsapp.WebhookRequest
	if a.cfg.WaxumWebhookBaseURL != "" {
		webhook = &whatsapp.WebhookRequest{
			URL:    a.cfg.WaxumWebhookBaseURL + "/" + c.TenantID + "/" + x.WebhookToken,
			Events: []string{"message", "receipt", "qr_code", "pair_code", "connected", "disconnected", "logged_out", "offline_sync_completed", "scheduled_sent", "scheduled_failed"},
		}
	}
	_, code, getErr := a.wa.GetSession(r.Context(), x.SessionID)
	if getErr != nil && code == http.StatusNotFound {
		_, _, err = a.wa.CreateSession(r.Context(), whatsapp.CreateSessionRequest{ID: x.SessionID, Name: tenantName, Webhook: webhook})
	} else if getErr != nil {
		httpx.Error(w, 503, getErr.Error())
		return
	} else {
		if webhook != nil {
			_ = a.wa.RegisterWebhook(r.Context(), x.SessionID, *webhook)
		}
		err = a.wa.Connect(r.Context(), x.SessionID)
	}
	if err != nil {
		httpx.Error(w, 503, err.Error())
		return
	}
	x.Enabled = true
	x.LastStatus = "connecting"
	if err := a.st.SaveWaxumIntegration(r.Context(), c.TenantID, x); err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "session_id": x.SessionID, "status": "connecting"})
}

func (a *app) waxumQR(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	x, err := a.st.WaxumIntegration(r.Context(), c.TenantID)
	if err != nil || x.SessionID == "" {
		httpx.Error(w, 404, "sesión de WhatsApp no iniciada")
		return
	}
	qr, err := a.wa.QR(r.Context(), x.SessionID)
	if err != nil {
		httpx.Error(w, 503, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "qr_codes": qr.QRCodes, "timeout_seconds": qr.TimeoutSeconds, "status": qr.Status})
}

func (a *app) waxumDisconnect(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	if c.Role != "tenant_admin" {
		httpx.Error(w, 403, "solo el administrador del negocio puede administrar la sesión de WhatsApp")
		return
	}
	x, err := a.st.WaxumIntegration(r.Context(), c.TenantID)
	if err != nil || x.SessionID == "" {
		httpx.Error(w, 404, "sesión de WhatsApp no encontrada")
		return
	}
	if err := a.wa.Disconnect(r.Context(), x.SessionID); err != nil {
		httpx.Error(w, 503, err.Error())
		return
	}
	x.Enabled = false
	x.LastStatus = "disconnected"
	_ = a.st.SaveWaxumIntegration(r.Context(), c.TenantID, x)
	httpx.JSON(w, 200, map[string]any{"ok": true})
}

func (a *app) waxumUnlink(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	if c.Role != "tenant_admin" {
		httpx.Error(w, 403, "solo el administrador del negocio puede administrar la sesión de WhatsApp")
		return
	}
	x, err := a.st.WaxumIntegration(r.Context(), c.TenantID)
	if err != nil || x.SessionID == "" {
		httpx.Error(w, 404, "sesión de WhatsApp no encontrada")
		return
	}
	if err := a.wa.DeleteSession(r.Context(), x.SessionID); err != nil && !strings.Contains(err.Error(), "HTTP 404") {
		httpx.Error(w, 503, err.Error())
		return
	}
	x.Enabled = false
	x.PhoneNumber = ""
	x.PushName = ""
	x.LastStatus = "disconnected"
	_ = a.st.SaveWaxumIntegration(r.Context(), c.TenantID, x)
	httpx.JSON(w, 200, map[string]any{"ok": true})
}

func (a *app) waxumSendText(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in struct {
		To   string `json:"to"`
		Text string `json:"text"`
	}
	if httpx.Decode(r, &in) != nil || strings.TrimSpace(in.To) == "" || strings.TrimSpace(in.Text) == "" {
		httpx.Error(w, 400, "destinatario y texto son requeridos")
		return
	}
	x, err := a.st.EnabledWaxumIntegration(r.Context(), c.TenantID)
	if err != nil {
		httpx.Error(w, 409, err.Error())
		return
	}
	out, err := a.wa.SendText(r.Context(), x.SessionID, in.To, in.Text)
	if err != nil {
		httpx.Error(w, 503, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "result": out})
}

func (a *app) waxumSendQuickReply(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in struct {
		To       string                      `json:"to"`
		BodyText string                      `json:"body_text"`
		Footer   string                      `json:"footer_text"`
		Buttons  []whatsapp.QuickReplyButton `json:"buttons"`
	}
	if httpx.Decode(r, &in) != nil || in.To == "" || in.BodyText == "" || len(in.Buttons) < 1 || len(in.Buttons) > 3 {
		httpx.Error(w, 400, "Quick Reply requiere destinatario, texto y de 1 a 3 botones")
		return
	}
	x, err := a.st.EnabledWaxumIntegration(r.Context(), c.TenantID)
	if err != nil {
		httpx.Error(w, 409, err.Error())
		return
	}
	out, err := a.wa.SendQuickReply(r.Context(), x.SessionID, in.To, in.BodyText, in.Footer, in.Buttons)
	if err != nil {
		httpx.Error(w, 503, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "result": out})
}

func (a *app) waxumSendList(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in struct {
		To          string                 `json:"to"`
		Title       string                 `json:"title"`
		Description string                 `json:"description"`
		ButtonText  string                 `json:"button_text"`
		Footer      string                 `json:"footer"`
		Sections    []whatsapp.ListSection `json:"sections"`
	}
	if httpx.Decode(r, &in) != nil || in.To == "" || in.Title == "" || in.Description == "" || in.ButtonText == "" || len(in.Sections) == 0 {
		httpx.Error(w, 400, "lista interactiva incompleta")
		return
	}
	x, err := a.st.EnabledWaxumIntegration(r.Context(), c.TenantID)
	if err != nil {
		httpx.Error(w, 409, err.Error())
		return
	}
	out, err := a.wa.SendList(r.Context(), x.SessionID, in.To, in.Title, in.Description, in.ButtonText, in.Footer, in.Sections)
	if err != nil {
		httpx.Error(w, 503, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "result": out})
}

func (a *app) waxumSendCTA(w http.ResponseWriter, r *http.Request) {
	c := auth.From(r)
	var in struct {
		To          string `json:"to"`
		DisplayText string `json:"display_text"`
		URL         string `json:"url"`
		HeaderText  string `json:"header_text"`
		BodyText    string `json:"body_text"`
		FooterText  string `json:"footer_text"`
		ImageURL    string `json:"image_url"`
	}
	if httpx.Decode(r, &in) != nil || in.To == "" || in.DisplayText == "" || in.URL == "" {
		httpx.Error(w, 400, "CTA URL requiere destinatario, texto del botón y URL")
		return
	}
	x, err := a.st.EnabledWaxumIntegration(r.Context(), c.TenantID)
	if err != nil {
		httpx.Error(w, 409, err.Error())
		return
	}
	out, err := a.wa.SendCTAURL(r.Context(), x.SessionID, in.To, in.DisplayText, in.URL, in.HeaderText, in.BodyText, in.FooterText, in.ImageURL)
	if err != nil {
		httpx.Error(w, 503, err.Error())
		return
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "result": out})
}

func (a *app) waxumWebhook(w http.ResponseWriter, r *http.Request) {
	tenantID := chi.URLParam(r, "tenantID")
	token := chi.URLParam(r, "token")
	x, err := a.st.WaxumIntegration(r.Context(), tenantID)
	if err != nil || x.WebhookToken == "" || len(token) != len(x.WebhookToken) || subtle.ConstantTimeCompare([]byte(token), []byte(x.WebhookToken)) != 1 {
		httpx.Error(w, 404, "webhook no encontrado")
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 2<<20))
	if err != nil || len(body) == 0 || !json.Valid(body) {
		httpx.Error(w, 400, "payload inválido")
		return
	}
	var payload map[string]any
	_ = json.Unmarshal(body, &payload)
	event := firstString(payload, "event", "type")
	sessionID := firstString(payload, "session_id", "session")
	if sessionID == "" {
		sessionID = x.SessionID
	}
	if sessionID != x.SessionID {
		httpx.Error(w, 403, "sesión no corresponde al negocio")
		return
	}
	if err := a.st.RecordWhatsAppEvent(r.Context(), tenantID, sessionID, event, body); err != nil {
		httpx.Error(w, 500, err.Error())
		return
	}
	if event == "connected" || event == "disconnected" || event == "logged_out" {
		phone := firstString(payload, "phone_number", "phone")
		push := firstString(payload, "push_name", "name")
		_ = a.st.UpdateWaxumConnectionState(r.Context(), tenantID, event, phone, push)
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
}

func firstString(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k].(string); ok && v != "" {
			return v
		}
	}
	for _, nestedKey := range []string{"data", "payload", "session"} {
		if n, ok := m[nestedKey].(map[string]any); ok {
			if v := firstString(n, keys...); v != "" {
				return v
			}
		}
	}
	return ""
}

func (a *app) sendOrderNotification(ctx context.Context, orderID string) error {
	if !a.wa.Configured() {
		return nil
	}
	o, err := a.st.OrderNotification(ctx, orderID)
	if err != nil {
		return err
	}
	x, err := a.st.EnabledWaxumIntegration(ctx, o.TenantID)
	if err != nil {
		return nil // WhatsApp is optional for a valid web order.
	}
	text := o.WhatsAppText
	if tmpl, err := a.st.NotificationTemplate(ctx, o.TenantID, "order_created"); err == nil && strings.TrimSpace(tmpl) != "" {
		text = renderNotificationTemplate(tmpl, o)
	}
	_, err = a.wa.SendText(ctx, x.SessionID, o.WhatsApp, text)
	return err
}

func renderNotificationTemplate(tmpl string, o store.OrderNotification) string {
	r := strings.NewReplacer(
		"{{cliente}}", o.CustomerName,
		"{{pedido}}", o.PublicCode,
		"{{total}}", fmt.Sprintf("RD$ %.2f", o.Total),
		"{{negocio}}", o.TenantName,
		"{{estado}}", o.Status,
	)
	return r.Replace(tmpl)
}

func (a *app) sendOrderStatusNotification(ctx context.Context, orderID, status string) error {
	if !a.wa.Configured() {
		return nil
	}
	o, err := a.st.OrderNotification(ctx, orderID)
	if err != nil {
		return err
	}
	x, err := a.st.EnabledWaxumIntegration(ctx, o.TenantID)
	if err != nil {
		return nil
	}
	events := map[string]string{
		"accepted":         "order_accepted",
		"preparing":        "order_preparing",
		"out_for_delivery": "order_out_for_delivery",
		"completed":        "order_completed",
		"cancelled":        "order_cancelled",
		"refunded":         "order_refunded",
	}
	event := events[status]
	if event == "" {
		return nil
	}
	defaults := map[string]string{
		"accepted":         "Hola {{cliente}}, {{negocio}} aceptó tu pedido #{{pedido}} por {{total}}.",
		"preparing":        "Tu pedido #{{pedido}} ya está en preparación en {{negocio}}.",
		"out_for_delivery": "Tu pedido #{{pedido}} salió para entrega. 🛵",
		"completed":        "Tu pedido #{{pedido}} fue completado. ¡Gracias por comprar en {{negocio}}!",
		"cancelled":        "Tu pedido #{{pedido}} fue cancelado. Si necesitas ayuda, comunícate con {{negocio}}.",
		"refunded":         "El pedido #{{pedido}} fue marcado como reembolsado por {{negocio}}.",
	}
	text := defaults[status]
	if tmpl, err := a.st.NotificationTemplate(ctx, o.TenantID, event); err == nil && strings.TrimSpace(tmpl) != "" {
		text = tmpl
	}
	if strings.TrimSpace(text) == "" {
		return nil
	}
	o.Status = status
	_, err = a.wa.SendText(ctx, x.SessionID, o.WhatsApp, renderNotificationTemplate(text, o))
	return err
}
