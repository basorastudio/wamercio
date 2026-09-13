package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"colmapro/backend/internal/platform/tenancy"
	waxum "github.com/basoradev/waxum-go"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

const businessWhatsAppMetadataKey = "whatsapp"

var businessWhatsAppSessionUnsafe = regexp.MustCompile(`[^a-z0-9_-]+`)

type businessWhatsAppConfig struct {
	Enabled           bool   `json:"enabled"`
	TenantID          string `json:"tenant_id,omitempty"`
	SessionID         string `json:"session_id"`
	SessionName       string `json:"session_name"`
	Status            string `json:"status"`
	Connected         bool   `json:"connected"`
	LoggedIn          bool   `json:"logged_in"`
	JID               string `json:"jid,omitempty"`
	Phone             string `json:"phone,omitempty"`
	LastPairingPhone  string `json:"last_pairing_phone,omitempty"`
	ProfileName       string `json:"profile_name,omitempty"`
	ProfilePictureURL string `json:"profile_picture_url,omitempty"`
	LinkingMethod     string `json:"linking_method,omitempty"`
	LinkingExpiresAt  string `json:"linking_expires_at,omitempty"`
	UnlinkDetectedAt  string `json:"unlink_detected_at,omitempty"`
	CreatedAt         string `json:"created_at,omitempty"`
	UpdatedAt         string `json:"updated_at,omitempty"`
}

func businessWhatsAppSessionID(tenant tenancy.Tenant) string {
	value := strings.ToLower(strings.TrimSpace(tenant.Slug))
	value = businessWhatsAppSessionUnsafe.ReplaceAllString(value, "-")
	value = strings.Trim(value, "-_")
	if value == "" {
		value = "negocio-" + strings.ReplaceAll(strings.ToLower(strings.TrimSpace(tenant.ID)), "-", "")
	}
	if len(value) > 64 {
		value = strings.Trim(value[:64], "-_")
	}
	return value
}

func businessWhatsAppDevice() *waxum.DevicePropsRequest {
	// WAXUM usa el valor OS como nombre visible en "Dispositivos vinculados".
	// Mantenerlo estable permite que el propietario identifique la conexión.
	return &waxum.DevicePropsRequest{
		OS:       waxum.Ptr("WAMERCIO"),
		Platform: waxum.Ptr("chrome"),
	}
}

func (s *Server) readBusinessWhatsAppConfig(ctx context.Context, tenant tenancy.Tenant) (businessWhatsAppConfig, error) {
	if s.tenantManager == nil {
		return businessWhatsAppConfig{}, badRequest("El modo SaaS multi-tenant no está activo")
	}
	var raw []byte
	err := s.tenantManager.CoreDB().QueryRow(ctx, `
		SELECT COALESCE(metadata -> $2::text, '{}'::jsonb)
		FROM tenants
		WHERE id=$1::uuid
	`, tenant.ID, businessWhatsAppMetadataKey).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return businessWhatsAppConfig{}, notFound("Negocio no encontrado")
	}
	if err != nil {
		return businessWhatsAppConfig{}, err
	}
	values := map[string]any{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &values)
	}
	sessionID := businessWhatsAppSessionID(tenant)
	return businessWhatsAppConfig{
		Enabled:           boolSetting(values, true, "enabled"),
		TenantID:          tenant.ID,
		SessionID:         defaultString(stringSetting(values, "session_id"), sessionID),
		SessionName:       defaultString(stringSetting(values, "session_name"), sessionID),
		Status:            defaultString(stringSetting(values, "status"), "pending"),
		Connected:         boolSetting(values, false, "connected"),
		LoggedIn:          boolSetting(values, false, "logged_in"),
		JID:               stringSetting(values, "jid"),
		Phone:             normalizePlatformWhatsAppPhone(stringSetting(values, "phone")),
		LastPairingPhone:  normalizePlatformWhatsAppPhone(stringSetting(values, "last_pairing_phone")),
		ProfileName:       stringSetting(values, "profile_name"),
		ProfilePictureURL: stringSetting(values, "profile_picture_url"),
		LinkingMethod:     stringSetting(values, "linking_method"),
		LinkingExpiresAt:  stringSetting(values, "linking_expires_at"),
		UnlinkDetectedAt:  stringSetting(values, "unlink_detected_at"),
		CreatedAt:         stringSetting(values, "created_at"),
		UpdatedAt:         stringSetting(values, "updated_at"),
	}, nil
}

func (s *Server) writeBusinessWhatsAppConfig(ctx context.Context, tenantID string, config businessWhatsAppConfig) error {
	payload, err := marshalJSONDatabaseValue(config)
	if err != nil {
		return err
	}
	command, err := s.tenantManager.CoreDB().Exec(ctx, `
		UPDATE tenants
		SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb), ARRAY[$2]::text[], $3::jsonb, true),
		    updated_at=now()
		WHERE id=$1::uuid
	`, tenantID, businessWhatsAppMetadataKey, payload)
	if err != nil {
		return err
	}
	if command.RowsAffected() == 0 {
		return notFound("Negocio no encontrado")
	}
	return nil
}

func sanitizeBusinessWhatsAppConfig(config businessWhatsAppConfig) map[string]any {
	return map[string]any{
		"enabled":             config.Enabled,
		"tenant_id":           config.TenantID,
		"session_id":          config.SessionID,
		"session_name":        config.SessionName,
		"status":              config.Status,
		"connected":           config.Connected,
		"logged_in":           config.LoggedIn,
		"jid":                 config.JID,
		"phone":               config.Phone,
		"display_phone":       formatPlatformWhatsAppPhone(config.Phone),
		"last_pairing_phone":  config.LastPairingPhone,
		"profile_name":        config.ProfileName,
		"profile_picture_url": config.ProfilePictureURL,
		"linking_method":      config.LinkingMethod,
		"linking_expires_at":  config.LinkingExpiresAt,
		"unlink_detected_at":  config.UnlinkDetectedAt,
		"created_at":          config.CreatedAt,
		"updated_at":          config.UpdatedAt,
	}
}

func touchBusinessWhatsAppConfig(config businessWhatsAppConfig, tenant tenancy.Tenant) businessWhatsAppConfig {
	config.Enabled = true
	config.TenantID = tenant.ID
	config.SessionID = businessWhatsAppSessionID(tenant)
	config.SessionName = config.SessionID
	config.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return config
}

func applyWaxumBusinessSessionInfo(config businessWhatsAppConfig, session *waxum.SessionInfo, tenant tenancy.Tenant) businessWhatsAppConfig {
	if session == nil {
		return touchBusinessWhatsAppConfig(config, tenant)
	}
	config.SessionID = session.ID
	config.SessionName = businessWhatsAppSessionID(tenant)
	config.LoggedIn = session.IsLoggedIn || session.Status == waxum.SessionStatusLoggedIn
	config.Connected = waxumSessionConnected(session.Status, config.LoggedIn)
	config.Status = platformStatusFromWaxum(session.Status, config.LoggedIn)
	if config.LoggedIn {
		config.LinkingMethod = ""
		config.LinkingExpiresAt = ""
		config.UnlinkDetectedAt = ""
	}
	if session.PhoneNumber != nil {
		config.Phone = normalizePlatformWhatsAppPhone(*session.PhoneNumber)
		config.JID = waxum.UserJID(config.Phone)
	}
	if session.PushName != nil {
		config.ProfileName = strings.TrimSpace(*session.PushName)
	}
	if config.CreatedAt == "" {
		config.CreatedAt = unixTimestampString(session.CreatedAt)
	}
	return touchBusinessWhatsAppConfig(config, tenant)
}

func applyWaxumBusinessSessionStatus(config businessWhatsAppConfig, status *waxum.SessionStatusResponse, tenant tenancy.Tenant) businessWhatsAppConfig {
	if status == nil {
		return touchBusinessWhatsAppConfig(config, tenant)
	}
	config.LoggedIn = status.IsLoggedIn || status.Status == waxum.SessionStatusLoggedIn
	config.Connected = waxumSessionConnected(status.Status, config.LoggedIn)
	config.Status = platformStatusFromWaxum(status.Status, config.LoggedIn)
	if config.LoggedIn {
		config.LinkingMethod = ""
		config.LinkingExpiresAt = ""
		config.UnlinkDetectedAt = ""
	}
	if status.PhoneNumber != nil {
		config.Phone = normalizePlatformWhatsAppPhone(*status.PhoneNumber)
		config.JID = waxum.UserJID(config.Phone)
	}
	if status.PushName != nil {
		config.ProfileName = strings.TrimSpace(*status.PushName)
	}
	return touchBusinessWhatsAppConfig(config, tenant)
}

func (s *Server) hydrateBusinessWhatsAppIdentity(ctx context.Context, client *waxum.Client, tenant tenancy.Tenant, config businessWhatsAppConfig) businessWhatsAppConfig {
	status, _, err := client.Sessions.GetStatus(ctx, config.SessionID)
	if err == nil {
		config = applyWaxumBusinessSessionStatus(config, status, tenant)
	}
	phone := normalizePlatformWhatsAppPhone(firstNonEmpty(config.Phone, phoneFromWhatsAppJID(config.JID), config.LastPairingPhone))
	if phone != "" {
		config.Phone = phone
		config.JID = waxum.UserJID(phone)
		if picture := fetchPlatformWhatsAppAvatarURLFromClient(ctx, client, config.SessionID, phone); picture != "" {
			config.ProfilePictureURL = picture
		}
	}
	return touchBusinessWhatsAppConfig(config, tenant)
}

func (s *Server) refreshBusinessWhatsAppFromWaxum(ctx context.Context, client *waxum.Client, tenant tenancy.Tenant, config businessWhatsAppConfig) businessWhatsAppConfig {
	if client == nil || strings.TrimSpace(config.SessionID) == "" {
		return touchBusinessWhatsAppConfig(config, tenant)
	}
	if session, _, err := client.Sessions.Get(ctx, config.SessionID); err == nil {
		config = applyWaxumBusinessSessionInfo(config, session, tenant)
	} else if waxum.IsStatus(err, http.StatusNotFound) {
		config.Connected = false
		config.LoggedIn = false
		config.Status = "pending"
		config.ProfileName = ""
		config.ProfilePictureURL = ""
		return touchBusinessWhatsAppConfig(config, tenant)
	}
	if status, _, err := client.Sessions.GetStatus(ctx, config.SessionID); err == nil {
		config = applyWaxumBusinessSessionStatus(config, status, tenant)
	}
	if config.LoggedIn {
		config = s.hydrateBusinessWhatsAppIdentity(ctx, client, tenant, config)
	} else {
		config.ProfilePictureURL = ""
	}
	return touchBusinessWhatsAppConfig(config, tenant)
}

func pendingBusinessWhatsAppConfig(tenant tenancy.Tenant, previous businessWhatsAppConfig) businessWhatsAppConfig {
	return touchBusinessWhatsAppConfig(businessWhatsAppConfig{
		Enabled:          true,
		TenantID:         tenant.ID,
		SessionID:        businessWhatsAppSessionID(tenant),
		SessionName:      businessWhatsAppSessionID(tenant),
		Status:           "pending",
		LastPairingPhone: normalizePlatformWhatsAppPhone(firstNonEmpty(previous.LastPairingPhone, previous.Phone)),
	}, tenant)
}

func beginBusinessWhatsAppLinking(config businessWhatsAppConfig, tenant tenancy.Tenant, method string, timeoutSeconds int64) businessWhatsAppConfig {
	config.LinkingMethod = strings.TrimSpace(method)
	config.LinkingExpiresAt = whatsappLinkingExpiresAt(time.Now(), timeoutSeconds)
	config.UnlinkDetectedAt = ""
	config.LoggedIn = false
	config.Connected = true
	if config.LinkingMethod == "pairing" {
		config.Status = "pairing_code_ready"
	} else {
		config.Status = "connecting"
	}
	return touchBusinessWhatsAppConfig(config, tenant)
}

func (s *Server) businessWhatsAppClientAndConfig(ctx context.Context, tenant tenancy.Tenant) (*waxum.Client, businessWhatsAppConfig, error) {
	client, err := s.platformWaxumClientFromSettings(ctx)
	if err != nil {
		return nil, businessWhatsAppConfig{}, err
	}
	config, err := s.readBusinessWhatsAppConfig(ctx, tenant)
	if err != nil {
		return nil, businessWhatsAppConfig{}, err
	}
	config.SessionID = businessWhatsAppSessionID(tenant)
	config.SessionName = config.SessionID
	return client, config, nil
}

// reconcileBusinessWhatsAppSession never creates a WAXUM session. It only
// reflects an existing remote session and removes it when it is no longer a
// valid linked account or an active, time-bounded linking attempt.
func (s *Server) reconcileBusinessWhatsAppSession(
	ctx context.Context,
	client *waxum.Client,
	tenant tenancy.Tenant,
	config businessWhatsAppConfig,
) (businessWhatsAppConfig, bool, error) {
	if client == nil || strings.TrimSpace(config.SessionID) == "" {
		return pendingBusinessWhatsAppConfig(tenant, config), false, nil
	}

	wasLinked := config.LoggedIn || config.Status == "linked"
	session, _, err := client.Sessions.Get(ctx, config.SessionID)
	if err != nil {
		if waxum.IsStatus(err, http.StatusNotFound) {
			return pendingBusinessWhatsAppConfig(tenant, config), false, nil
		}
		return config, false, err
	}
	config = applyWaxumBusinessSessionInfo(config, session, tenant)
	remoteStatus := session.Status

	if status, _, statusErr := client.Sessions.GetStatus(ctx, config.SessionID); statusErr == nil && status != nil {
		remoteStatus = status.Status
		config = applyWaxumBusinessSessionStatus(config, status, tenant)
	} else if statusErr != nil && waxum.IsStatus(statusErr, http.StatusNotFound) {
		return pendingBusinessWhatsAppConfig(tenant, config), false, nil
	}

	if config.LoggedIn {
		config = s.hydrateBusinessWhatsAppIdentity(ctx, client, tenant, config)
		return config, false, nil
	}

	now := time.Now().UTC()
	linkingActive := whatsappLinkingIsActive(config.LinkingExpiresAt, now)
	shouldDelete := !linkingActive
	if wasLinked && remoteStatus == waxum.SessionStatusConnecting {
		// A short WAXUM reconnect should not destroy a valid device store. A
		// reconnect that remains unauthenticated beyond the grace period is
		// treated as an external unlink and purged.
		if config.UnlinkDetectedAt == "" {
			config.UnlinkDetectedAt = now.Format(time.RFC3339)
		}
		shouldDelete = !whatsappReconnectGraceActive(config.UnlinkDetectedAt, now)
	}
	if wasLinked && remoteStatus != waxum.SessionStatusConnecting {
		shouldDelete = true
	}
	if !shouldDelete {
		return touchBusinessWhatsAppConfig(config, tenant), false, nil
	}

	if err := deleteWaxumSessionCompletely(ctx, client, config.SessionID); err != nil {
		return config, false, err
	}
	return pendingBusinessWhatsAppConfig(tenant, config), true, nil
}

func (s *Server) ensureBusinessWhatsAppSession(ctx context.Context, tenant tenancy.Tenant) (*waxum.Client, businessWhatsAppConfig, error) {
	client, config, err := s.businessWhatsAppClientAndConfig(ctx, tenant)
	if err != nil {
		return nil, businessWhatsAppConfig{}, err
	}
	desiredID := businessWhatsAppSessionID(tenant)
	config.SessionID = desiredID
	config.SessionName = desiredID

	var session *waxum.SessionInfo
	list, _, err := client.Sessions.List(ctx)
	if err != nil {
		return nil, businessWhatsAppConfig{}, waxumFriendlyError("No se pudieron consultar las sesiones de WAXUM", err)
	}
	if list != nil {
		for idx := range list.Sessions {
			if list.Sessions[idx].ID == desiredID {
				session = &list.Sessions[idx]
				break
			}
		}
	}
	if session == nil {
		created, _, createErr := client.Sessions.Create(ctx, &waxum.CreateSessionRequest{
			ID:     waxum.Ptr(desiredID),
			Name:   waxum.Ptr(desiredID),
			Device: businessWhatsAppDevice(),
		})
		if createErr != nil {
			return nil, businessWhatsAppConfig{}, waxumFriendlyError("No se pudo crear la sesión del negocio en WAXUM", createErr)
		}
		session = &created.Session
	}
	config = applyWaxumBusinessSessionInfo(config, session, tenant)
	if config.CreatedAt == "" {
		config.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	if err := s.writeBusinessWhatsAppConfig(ctx, tenant.ID, config); err != nil {
		return nil, businessWhatsAppConfig{}, err
	}
	return client, config, nil
}

func (s *Server) prepareBusinessWhatsAppLinkingSession(ctx context.Context, client *waxum.Client, tenant tenancy.Tenant, config businessWhatsAppConfig) (businessWhatsAppConfig, error) {
	if status, _, err := client.Sessions.GetStatus(ctx, config.SessionID); err == nil {
		config = applyWaxumBusinessSessionStatus(config, status, tenant)
		_ = s.writeBusinessWhatsAppConfig(ctx, tenant.ID, config)
		if config.Connected || config.LoggedIn {
			return config, nil
		}
	}
	_, _, err := client.Sessions.Connect(ctx, config.SessionID, &waxum.ConnectRequest{Device: businessWhatsAppDevice()})
	if err != nil {
		return config, waxumFriendlyError("No se pudo iniciar la vinculación del WhatsApp del negocio", err)
	}
	var lastErr error
	for attempt := 0; attempt < 18; attempt++ {
		status, _, statusErr := client.Sessions.GetStatus(ctx, config.SessionID)
		if statusErr == nil {
			config = applyWaxumBusinessSessionStatus(config, status, tenant)
			_ = s.writeBusinessWhatsAppConfig(ctx, tenant.ID, config)
			if config.Connected || config.LoggedIn {
				return config, nil
			}
		} else {
			lastErr = statusErr
		}
		if !sleepContext(ctx, time.Duration(500+attempt*150)*time.Millisecond) {
			return config, ctx.Err()
		}
	}
	if lastErr != nil {
		return config, waxumFriendlyError("La sesión se solicitó, pero WAXUM no confirmó su estado", lastErr)
	}
	return config, badRequest("La sesión del negocio todavía aparece desconectada. Vuelve a intentarlo en unos segundos.")
}

func (s *Server) waitForBusinessWhatsAppQRCode(ctx context.Context, client *waxum.Client, tenant tenancy.Tenant, config businessWhatsAppConfig) (string, businessWhatsAppConfig, error) {
	var lastErr error
	for attempt := 0; attempt < 24; attempt++ {
		qr, _, qrErr := client.Sessions.GetQRCode(ctx, config.SessionID)
		if qrErr == nil && qr != nil {
			for _, candidate := range qr.QRCodes {
				if clean := strings.TrimSpace(candidate); clean != "" {
					return clean, config, nil
				}
			}
			lastErr = badRequest("WAXUM respondió sin contenido QR")
		} else {
			lastErr = qrErr
		}
		if status, _, statusErr := client.Sessions.GetStatus(ctx, config.SessionID); statusErr == nil {
			config = applyWaxumBusinessSessionStatus(config, status, tenant)
			_ = s.writeBusinessWhatsAppConfig(ctx, tenant.ID, config)
			if config.LoggedIn {
				return "", config, badRequest("El WhatsApp del negocio ya aparece vinculado. Actualiza el estado.")
			}
		}
		if attempt == 4 || attempt == 10 || attempt == 16 {
			_, _, _ = client.Sessions.Connect(ctx, config.SessionID, &waxum.ConnectRequest{Device: businessWhatsAppDevice()})
		}
		if !sleepContext(ctx, time.Duration(650+attempt*180)*time.Millisecond) {
			return "", config, ctx.Err()
		}
	}
	return "", config, waxumFriendlyError("No se pudo obtener el código QR desde WAXUM", lastErr)
}

func (s *Server) businessWhatsAppPayload(ctx context.Context, config businessWhatsAppConfig, extra map[string]any) map[string]any {
	payload := map[string]any{"whatsapp": sanitizeBusinessWhatsAppConfig(config)}
	if waxumConfig, err := s.readPlatformWaxumConfig(ctx); err == nil {
		payload["provider_ready"] = waxumConfig.Enabled && waxumConfig.PublicURL != "" && waxumConfig.AdminToken != ""
	}
	for key, value := range extra {
		payload[key] = value
	}
	return payload
}

func adminBusinessActor(ctx context.Context) string {
	if username, ok := ctx.Value(adminUserContextKey{}).(string); ok && strings.TrimSpace(username) != "" {
		return strings.TrimSpace(username)
	}
	return "business-admin"
}

func (s *Server) businessWhatsAppState(w http.ResponseWriter, r *http.Request) {
	item, tenant, err := s.adminTenantFromParam(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, err)
		return
	}
	client, config, err := s.businessWhatsAppClientAndConfig(r.Context(), tenant)
	if err != nil {
		writeError(w, err)
		return
	}
	config, autoDeleted, err := s.reconcileBusinessWhatsAppSession(r.Context(), client, tenant, config)
	if err != nil {
		writeError(w, waxumFriendlyError("No se pudo actualizar el WhatsApp del negocio", err))
		return
	}
	_ = s.writeBusinessWhatsAppConfig(r.Context(), tenant.ID, config)
	if autoDeleted {
		s.auditPlatform(r.Context(), adminBusinessActor(r.Context()), tenant.ID, "business.whatsapp.external_unlink_detected", map[string]any{"business": item.Name})
	}
	writeJSON(w, http.StatusOK, s.businessWhatsAppPayload(r.Context(), config, map[string]any{
		"business":     map[string]any{"id": item.ID, "name": item.Name, "slug": item.Slug, "domain": item.Domain},
		"auto_deleted": autoDeleted,
	}))
}

func (s *Server) businessWhatsAppQR(w http.ResponseWriter, r *http.Request) {
	item, tenant, err := s.adminTenantFromParam(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, err)
		return
	}
	client, config, err := s.businessWhatsAppClientAndConfig(r.Context(), tenant)
	if err != nil {
		writeError(w, err)
		return
	}
	config, _, err = s.reconcileBusinessWhatsAppSession(r.Context(), client, tenant, config)
	if err != nil {
		writeError(w, waxumFriendlyError("No se pudo preparar la vinculación", err))
		return
	}
	if config.LoggedIn {
		config = s.hydrateBusinessWhatsAppIdentity(r.Context(), client, tenant, config)
		_ = s.writeBusinessWhatsAppConfig(r.Context(), tenant.ID, config)
		writeJSON(w, http.StatusOK, s.businessWhatsAppPayload(r.Context(), config, map[string]any{"already_linked": true}))
		return
	}
	config = beginBusinessWhatsAppLinking(config, tenant, "qr", 0)
	if err := s.writeBusinessWhatsAppConfig(r.Context(), tenant.ID, config); err != nil {
		writeError(w, err)
		return
	}
	client, config, err = s.ensureBusinessWhatsAppSession(r.Context(), tenant)
	if err != nil {
		writeError(w, err)
		return
	}
	config, err = s.prepareBusinessWhatsAppLinkingSession(r.Context(), client, tenant, config)
	if err != nil {
		writeError(w, err)
		return
	}
	if config.LoggedIn {
		config = s.hydrateBusinessWhatsAppIdentity(r.Context(), client, tenant, config)
		_ = s.writeBusinessWhatsAppConfig(r.Context(), tenant.ID, config)
		writeJSON(w, http.StatusOK, s.businessWhatsAppPayload(r.Context(), config, map[string]any{"already_linked": true}))
		return
	}
	qrCode, config, err := s.waitForBusinessWhatsAppQRCode(r.Context(), client, tenant, config)
	if err != nil {
		writeError(w, err)
		return
	}
	config.Status = "qr_ready"
	config.Connected = true
	config.LinkingMethod = "qr"
	config.LinkingExpiresAt = whatsappLinkingExpiresAt(time.Now(), 0)
	config = touchBusinessWhatsAppConfig(config, tenant)
	if err := s.writeBusinessWhatsAppConfig(r.Context(), tenant.ID, config); err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), adminBusinessActor(r.Context()), tenant.ID, "business.whatsapp.session.qr", map[string]any{"session_id": config.SessionID, "business": item.Name})
	writeJSON(w, http.StatusOK, s.businessWhatsAppPayload(r.Context(), config, map[string]any{"qr_code": qrCode}))
}

func (s *Server) businessWhatsAppPairingCode(w http.ResponseWriter, r *http.Request) {
	item, tenant, err := s.adminTenantFromParam(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, err)
		return
	}
	var input struct {
		Phone string `json:"phone"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	phone := normalizePlatformWhatsAppPhone(input.Phone)
	if phone == "" {
		writeError(w, badRequest("Completa el número de WhatsApp que deseas vincular"))
		return
	}
	client, config, err := s.businessWhatsAppClientAndConfig(r.Context(), tenant)
	if err != nil {
		writeError(w, err)
		return
	}
	config, _, err = s.reconcileBusinessWhatsAppSession(r.Context(), client, tenant, config)
	if err != nil {
		writeError(w, waxumFriendlyError("No se pudo preparar la vinculación", err))
		return
	}
	if config.LoggedIn {
		config = s.hydrateBusinessWhatsAppIdentity(r.Context(), client, tenant, config)
		_ = s.writeBusinessWhatsAppConfig(r.Context(), tenant.ID, config)
		writeJSON(w, http.StatusOK, s.businessWhatsAppPayload(r.Context(), config, map[string]any{"already_linked": true}))
		return
	}
	config = beginBusinessWhatsAppLinking(config, tenant, "pairing", 0)
	config.LastPairingPhone = phone
	if err := s.writeBusinessWhatsAppConfig(r.Context(), tenant.ID, config); err != nil {
		writeError(w, err)
		return
	}
	pair, err := requestWaxumPhonePairingCode(
		r.Context(),
		client,
		config.SessionID,
		phone,
		businessWhatsAppDevice(),
		&waxum.CreateSessionRequest{
			ID:     waxum.Ptr(config.SessionID),
			Name:   waxum.Ptr(config.SessionName),
			Device: businessWhatsAppDevice(),
		},
	)
	if errors.Is(err, errWaxumSessionAlreadyLinked) {
		config = s.refreshBusinessWhatsAppFromWaxum(r.Context(), client, tenant, config)
		config = s.hydrateBusinessWhatsAppIdentity(r.Context(), client, tenant, config)
		_ = s.writeBusinessWhatsAppConfig(r.Context(), tenant.ID, config)
		writeJSON(w, http.StatusOK, s.businessWhatsAppPayload(r.Context(), config, map[string]any{"already_linked": true}))
		return
	}
	if err != nil {
		writeError(w, friendlyWaxumPairingError(err))
		return
	}
	code := strings.TrimSpace(pair.Code)
	if code == "" {
		writeError(w, badRequest("WAXUM aceptó la solicitud, pero no devolvió el código de emparejamiento"))
		return
	}
	config.Phone = phone
	config.LastPairingPhone = phone
	config.Status = "pairing_code_ready"
	config.Connected = true
	config.LinkingMethod = "pairing"
	config.LinkingExpiresAt = whatsappLinkingExpiresAt(time.Now(), pair.TimeoutSeconds)
	config = touchBusinessWhatsAppConfig(config, tenant)
	if err := s.writeBusinessWhatsAppConfig(r.Context(), tenant.ID, config); err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), adminBusinessActor(r.Context()), tenant.ID, "business.whatsapp.session.pairing_code", map[string]any{"session_id": config.SessionID, "business": item.Name})
	writeJSON(w, http.StatusOK, s.businessWhatsAppPayload(r.Context(), config, map[string]any{
		"pairing_code":                code,
		"linking_code":                code,
		"phone":                       phone,
		"push_notification_requested": true,
		"timeout_seconds":             pair.TimeoutSeconds,
	}))
}

func (s *Server) businessWhatsAppStatus(w http.ResponseWriter, r *http.Request) {
	item, tenant, err := s.adminTenantFromParam(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, err)
		return
	}
	client, config, err := s.businessWhatsAppClientAndConfig(r.Context(), tenant)
	if err != nil {
		writeError(w, err)
		return
	}
	config, autoDeleted, err := s.reconcileBusinessWhatsAppSession(r.Context(), client, tenant, config)
	if err != nil {
		writeError(w, waxumFriendlyError("No se pudo actualizar el estado de WhatsApp", err))
		return
	}
	if err := s.writeBusinessWhatsAppConfig(r.Context(), tenant.ID, config); err != nil {
		writeError(w, err)
		return
	}
	if autoDeleted {
		s.auditPlatform(r.Context(), adminBusinessActor(r.Context()), tenant.ID, "business.whatsapp.external_unlink_detected", map[string]any{"business": item.Name})
	}
	writeJSON(w, http.StatusOK, s.businessWhatsAppPayload(r.Context(), config, map[string]any{"auto_deleted": autoDeleted}))
}

func (s *Server) businessWhatsAppDisconnect(w http.ResponseWriter, r *http.Request) {
	item, tenant, err := s.adminTenantFromParam(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, err)
		return
	}
	config, err := s.readBusinessWhatsAppConfig(r.Context(), tenant)
	if err != nil {
		writeError(w, err)
		return
	}
	client, clientErr := s.platformWaxumClientFromSettings(r.Context())
	if clientErr != nil {
		writeError(w, clientErr)
		return
	}
	if config.SessionID != "" {
		if deleteErr := deleteWaxumSessionCompletely(r.Context(), client, config.SessionID); deleteErr != nil {
			writeError(w, waxumFriendlyError("No se pudo eliminar la conexión de WhatsApp", deleteErr))
			return
		}
	}
	cleared := pendingBusinessWhatsAppConfig(tenant, config)
	if err := s.writeBusinessWhatsAppConfig(r.Context(), tenant.ID, cleared); err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), adminBusinessActor(r.Context()), tenant.ID, "business.whatsapp.session.unlink_delete", map[string]any{"session_id": config.SessionID, "business": item.Name})
	writeJSON(w, http.StatusOK, s.businessWhatsAppPayload(r.Context(), cleared, nil))
}

func (s *Server) businessWhatsAppSummary(ctx context.Context, tenant tenancy.Tenant) map[string]any {
	config, err := s.readBusinessWhatsAppConfig(ctx, tenant)
	if err != nil {
		return sanitizeBusinessWhatsAppConfig(touchBusinessWhatsAppConfig(businessWhatsAppConfig{Status: "pending"}, tenant))
	}
	return sanitizeBusinessWhatsAppConfig(config)
}

func (s *Server) businessWhatsAppDeliverySession(ctx context.Context, tenantID string) (*waxum.Client, string, error) {
	client, err := s.platformWaxumClientFromSettings(ctx)
	if err != nil {
		return nil, "", err
	}
	if strings.TrimSpace(tenantID) != "" {
		var tenant tenancy.Tenant
		err := s.tenantManager.CoreDB().QueryRow(ctx, `
			SELECT t.id::text,t.name,t.slug,t.status,t.plan_slug,COALESCE(d.domain,''),COALESCE(db.database_name,''),t.created_at
			FROM tenants t
			LEFT JOIN tenant_domains d ON d.tenant_id=t.id AND d.is_primary=true
			LEFT JOIN tenant_databases db ON db.tenant_id=t.id
			WHERE t.id=$1::uuid
		`, tenantID).Scan(&tenant.ID, &tenant.Name, &tenant.Slug, &tenant.Status, &tenant.PlanSlug, &tenant.Domain, &tenant.DatabaseName, &tenant.CreatedAt)
		if err == nil {
			config, readErr := s.readBusinessWhatsAppConfig(ctx, tenant)
			if readErr == nil && config.SessionID != "" {
				reconciled, deleted, reconcileErr := s.reconcileBusinessWhatsAppSession(ctx, client, tenant, config)
				if reconcileErr == nil {
					_ = s.writeBusinessWhatsAppConfig(ctx, tenant.ID, reconciled)
					if deleted {
						s.auditPlatform(ctx, "system", tenant.ID, "business.whatsapp.external_unlink_detected", map[string]any{"business": tenant.Name})
					}
					if reconciled.LoggedIn {
						return client, reconciled.SessionID, nil
					}
				}
			}
		}
	}
	global, err := s.readPlatformWhatsAppConfig(ctx)
	if err != nil {
		return nil, "", err
	}
	global, deleted, reconcileErr := s.reconcilePlatformWhatsAppSession(ctx, client, global)
	if reconcileErr != nil {
		return nil, "", reconcileErr
	}
	_ = s.writePlatformSetting(ctx, platformWhatsAppSettingKey, global)
	if deleted {
		s.auditPlatform(ctx, "system", "", "platform.whatsapp.external_unlink_detected", sanitizePlatformWhatsAppConfig(global))
	}
	if !global.LoggedIn {
		return nil, "", errors.New("business and global WhatsApp sessions are not connected")
	}
	return client, global.SessionID, nil
}
