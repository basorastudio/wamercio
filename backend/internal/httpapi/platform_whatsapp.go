package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	waxum "github.com/basoradev/waxum-go"
	"github.com/jackc/pgx/v5"
)

const (
	platformWhatsAppSettingKey      = "whatsapp_platform"
	platformWaxumSettingKey         = "waxum"
	platformWhatsAppSessionID       = "WAMERCIO"
	platformWhatsAppLegacySessionID = "wamercio-saas-superadmin"
	platformWhatsAppSessionName     = "WAMERCIO"
)

type platformWaxumConfig struct {
	Enabled      bool   `json:"enabled"`
	PublicURL    string `json:"public_url"`
	DashboardURL string `json:"dashboard_url"`
	DocsURL      string `json:"docs_url"`
	AdminToken   string `json:"admin_token,omitempty"`
}

type platformWhatsAppConfig struct {
	Enabled           bool   `json:"enabled"`
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

func (s *Server) platformWhatsAppState(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	ctx := r.Context()
	whatsapp, err := s.readPlatformWhatsAppConfig(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	waxumConfig, _ := s.readPlatformWaxumConfig(ctx)
	autoDeleted := false
	if waxumConfig.Enabled && waxumConfig.PublicURL != "" && waxumConfig.AdminToken != "" {
		client, clientErr := s.newPlatformWaxumClient(waxumConfig)
		if clientErr != nil {
			writeError(w, clientErr)
			return
		}
		whatsapp, autoDeleted, err = s.reconcilePlatformWhatsAppSession(ctx, client, whatsapp)
		if err != nil {
			writeError(w, waxumFriendlyError("No se pudo actualizar el WhatsApp global", err))
			return
		}
	}
	_ = s.writePlatformSetting(ctx, platformWhatsAppSettingKey, whatsapp)
	writeJSON(w, http.StatusOK, map[string]any{
		"whatsapp":     sanitizePlatformWhatsAppConfig(whatsapp),
		"waxum":        sanitizePlatformWaxumConfig(waxumConfig),
		"auto_deleted": autoDeleted,
	})
}

func (s *Server) configurePlatformWaxum(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}

	var input platformWaxumConfig
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	config, err := normalizePlatformWaxumConfig(input)
	if err != nil {
		writeError(w, err)
		return
	}

	ctx := r.Context()
	previousWaxum, _ := s.readPlatformWaxumConfig(ctx)
	whatsapp, err := s.readPlatformWhatsAppConfig(ctx)
	if err != nil {
		writeError(w, err)
		return
	}

	if config.Enabled {
		client, clientErr := s.newPlatformWaxumClient(config)
		if clientErr != nil {
			writeError(w, clientErr)
			return
		}
		if _, _, listErr := client.Sessions.List(ctx); listErr != nil {
			writeError(w, waxumFriendlyError("No se pudo validar la URL o el token de WAXUM", listErr))
			return
		}
	}

	providerChanged := previousWaxum.Enabled && previousWaxum.PublicURL != "" && previousWaxum.AdminToken != "" && (!config.Enabled ||
		previousWaxum.PublicURL != config.PublicURL ||
		previousWaxum.AdminToken != config.AdminToken)
	if providerChanged {
		previousClient, clientErr := s.newPlatformWaxumClient(previousWaxum)
		if clientErr != nil {
			writeError(w, clientErr)
			return
		}
		if purgeErr := s.purgeManagedWhatsAppSessions(ctx, previousClient); purgeErr != nil {
			writeError(w, waxumFriendlyError("No se pudieron retirar todas las sesiones del proveedor anterior", purgeErr))
			return
		}
		whatsapp, _ = s.readPlatformWhatsAppConfig(ctx)
	}

	if err := s.writePlatformSetting(ctx, platformWaxumSettingKey, config); err != nil {
		writeError(w, err)
		return
	}

	if config.Enabled {
		client, clientErr := s.newPlatformWaxumClient(config)
		if clientErr != nil {
			writeError(w, clientErr)
			return
		}
		whatsapp, _, err = s.reconcilePlatformWhatsAppSession(ctx, client, whatsapp)
		if err != nil {
			writeError(w, waxumFriendlyError("No se pudo reconciliar la sesión global", err))
			return
		}
	} else {
		whatsapp = s.pendingPlatformWhatsAppConfig(ctx, whatsapp)
	}
	if err := s.writePlatformSetting(ctx, platformWhatsAppSettingKey, whatsapp); err != nil {
		writeError(w, err)
		return
	}

	s.auditPlatform(ctx, s.platformActor(r), "", "platform.waxum.configure", map[string]any{
		"waxum":    sanitizePlatformWaxumConfig(config),
		"whatsapp": sanitizePlatformWhatsAppConfig(whatsapp),
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"waxum":    sanitizePlatformWaxumConfig(config),
		"whatsapp": sanitizePlatformWhatsAppConfig(whatsapp),
	})
}

func (s *Server) createPlatformWhatsAppSession(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	currentConfig, err := s.readPlatformWhatsAppConfig(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	currentConfig = beginPlatformWhatsAppLinking(currentConfig, "qr", 0)
	if err := s.writePlatformSetting(ctx, platformWhatsAppSettingKey, currentConfig); err != nil {
		writeError(w, err)
		return
	}
	current, err := s.ensurePlatformWhatsAppSession(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(ctx, s.platformActor(r), "", "platform.whatsapp.session.create", sanitizePlatformWhatsAppConfig(current))
	writeJSON(w, http.StatusOK, s.platformWhatsAppPayload(ctx, current, nil))
}

func (s *Server) connectPlatformWhatsApp(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	currentConfig, err := s.readPlatformWhatsAppConfig(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	currentConfig = beginPlatformWhatsAppLinking(currentConfig, "qr", 0)
	if err := s.writePlatformSetting(ctx, platformWhatsAppSettingKey, currentConfig); err != nil {
		writeError(w, err)
		return
	}
	client, whatsapp, err := s.platformWaxumClientAuto(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	whatsapp, err = s.preparePlatformWhatsAppLinkingSession(ctx, client, whatsapp)
	if err != nil {
		writeError(w, err)
		return
	}
	whatsapp = touchWhatsAppConfig(whatsapp)
	if err := s.writePlatformSetting(ctx, platformWhatsAppSettingKey, whatsapp); err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(ctx, s.platformActor(r), "", "platform.whatsapp.session.connect", sanitizePlatformWhatsAppConfig(whatsapp))
	writeJSON(w, http.StatusOK, s.platformWhatsAppPayload(ctx, whatsapp, nil))
}

func (s *Server) platformWhatsAppQR(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	current, err := s.readPlatformWhatsAppConfig(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	current = beginPlatformWhatsAppLinking(current, "qr", 0)
	if err := s.writePlatformSetting(ctx, platformWhatsAppSettingKey, current); err != nil {
		writeError(w, err)
		return
	}
	client, whatsapp, err := s.platformWaxumClientAuto(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	whatsapp, err = s.preparePlatformWhatsAppLinkingSession(ctx, client, whatsapp)
	if err != nil {
		writeError(w, err)
		return
	}
	if whatsapp.LoggedIn {
		whatsapp = s.hydratePlatformWhatsAppIdentity(ctx, client, whatsapp)
		whatsapp = touchWhatsAppConfig(whatsapp)
		_ = s.writePlatformSetting(ctx, platformWhatsAppSettingKey, whatsapp)
		writeJSON(w, http.StatusOK, s.platformWhatsAppPayload(ctx, whatsapp, map[string]any{"already_linked": true}))
		return
	}

	qrCode, whatsapp, err := s.waitForPlatformWhatsAppQRCode(ctx, client, whatsapp)
	if err != nil {
		writeError(w, err)
		return
	}
	whatsapp.Connected = true
	whatsapp.LoggedIn = false
	whatsapp.Status = "qr_ready"
	whatsapp.LinkingMethod = "qr"
	whatsapp.LinkingExpiresAt = whatsappLinkingExpiresAt(time.Now(), 0)
	whatsapp = touchWhatsAppConfig(whatsapp)
	if err := s.writePlatformSetting(ctx, platformWhatsAppSettingKey, whatsapp); err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(ctx, s.platformActor(r), "", "platform.whatsapp.session.qr", sanitizePlatformWhatsAppConfig(whatsapp))
	writeJSON(w, http.StatusOK, s.platformWhatsAppPayload(ctx, whatsapp, map[string]any{"qr_code": qrCode}))
}

func (s *Server) platformWhatsAppPairingCode(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var input struct {
		Phone string `json:"phone"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	phone := normalizePlatformWhatsAppPhone(input.Phone)
	if phone == "" {
		phone = normalizePlatformWhatsAppPhone(s.readPlatformSupportWhatsApp(ctx))
	}
	if phone == "" {
		writeError(w, badRequest("Configura primero el WhatsApp de soporte en Ajustes generales para generar el código de emparejamiento automáticamente"))
		return
	}
	current, err := s.readPlatformWhatsAppConfig(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	current = beginPlatformWhatsAppLinking(current, "pairing", 0)
	current.LastPairingPhone = phone
	if err := s.writePlatformSetting(ctx, platformWhatsAppSettingKey, current); err != nil {
		writeError(w, err)
		return
	}
	client, whatsapp, err := s.platformWaxumClientAuto(ctx)
	if err != nil {
		writeError(w, err)
		return
	}

	whatsapp = s.refreshPlatformWhatsAppFromWaxum(ctx, whatsapp)
	if whatsapp.LoggedIn {
		whatsapp.Phone = phone
		whatsapp.LastPairingPhone = phone
		whatsapp = s.hydratePlatformWhatsAppIdentity(ctx, client, whatsapp)
		whatsapp = touchWhatsAppConfig(whatsapp)
		_ = s.writePlatformSetting(ctx, platformWhatsAppSettingKey, whatsapp)
		writeJSON(w, http.StatusOK, s.platformWhatsAppPayload(ctx, whatsapp, map[string]any{"already_linked": true, "phone": phone}))
		return
	}

	device := &waxum.DevicePropsRequest{OS: waxum.Ptr("WAMERCIO"), Platform: waxum.Ptr("chrome")}
	pair, err := requestWaxumPhonePairingCode(
		ctx,
		client,
		whatsapp.SessionID,
		phone,
		device,
		&waxum.CreateSessionRequest{
			ID:     waxum.Ptr(platformWhatsAppSessionID),
			Name:   waxum.Ptr(platformWhatsAppSessionName),
			Device: device,
		},
	)
	if errors.Is(err, errWaxumSessionAlreadyLinked) {
		whatsapp = s.refreshPlatformWhatsAppFromWaxum(ctx, whatsapp)
		whatsapp = s.hydratePlatformWhatsAppIdentity(ctx, client, whatsapp)
		whatsapp = touchWhatsAppConfig(whatsapp)
		_ = s.writePlatformSetting(ctx, platformWhatsAppSettingKey, whatsapp)
		writeJSON(w, http.StatusOK, s.platformWhatsAppPayload(ctx, whatsapp, map[string]any{"already_linked": true, "phone": phone}))
		return
	}
	if err != nil {
		writeError(w, friendlyWaxumPairingError(err))
		return
	}
	linkingCode := strings.TrimSpace(pair.Code)
	if linkingCode == "" {
		writeError(w, badRequest("WAXUM aceptó la solicitud, pero no devolvió el código de emparejamiento."))
		return
	}

	whatsapp.Phone = phone
	whatsapp.LastPairingPhone = phone
	whatsapp.Connected = true
	whatsapp.LoggedIn = false
	whatsapp.Status = "pairing_code_ready"
	whatsapp.LinkingMethod = "pairing"
	whatsapp.LinkingExpiresAt = whatsappLinkingExpiresAt(time.Now(), pair.TimeoutSeconds)
	whatsapp = touchWhatsAppConfig(whatsapp)
	if err := s.writePlatformSetting(ctx, platformWhatsAppSettingKey, whatsapp); err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(ctx, s.platformActor(r), "", "platform.whatsapp.session.pairing_code", sanitizePlatformWhatsAppConfig(whatsapp))
	writeJSON(w, http.StatusOK, s.platformWhatsAppPayload(ctx, whatsapp, map[string]any{
		"phone":                       phone,
		"pairing_code":                linkingCode,
		"linking_code":                linkingCode,
		"push_notification_requested": true,
		"timeout_seconds":             pair.TimeoutSeconds,
	}))
}

func (s *Server) platformWhatsAppStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	client, whatsapp, err := s.platformWaxumClient(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	whatsapp, autoDeleted, err := s.reconcilePlatformWhatsAppSession(ctx, client, whatsapp)
	if err != nil {
		writeError(w, waxumFriendlyError("No se pudo actualizar el estado de WhatsApp", err))
		return
	}
	if err := s.writePlatformSetting(ctx, platformWhatsAppSettingKey, whatsapp); err != nil {
		writeError(w, err)
		return
	}
	if autoDeleted {
		s.auditPlatform(ctx, s.platformActor(r), "", "platform.whatsapp.external_unlink_detected", sanitizePlatformWhatsAppConfig(whatsapp))
	}
	writeJSON(w, http.StatusOK, s.platformWhatsAppPayload(ctx, whatsapp, map[string]any{"auto_unlinked": autoDeleted, "auto_deleted": autoDeleted}))
}

func (s *Server) platformWhatsAppDisconnect(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	whatsapp, err := s.readPlatformWhatsAppConfig(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	client, clientErr := s.platformWaxumClientFromSettings(ctx)
	if clientErr != nil {
		writeError(w, clientErr)
		return
	}
	cleared, err := s.clearPlatformWhatsAppRemoteSession(ctx, client, whatsapp)
	if err != nil {
		writeError(w, waxumFriendlyError("No se pudo eliminar la conexión global de WhatsApp", err))
		return
	}
	if err := s.writePlatformSetting(ctx, platformWhatsAppSettingKey, cleared); err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(ctx, s.platformActor(r), "", "platform.whatsapp.session.unlink_delete", sanitizePlatformWhatsAppConfig(cleared))
	writeJSON(w, http.StatusOK, s.platformWhatsAppPayload(ctx, cleared, nil))
}

func (s *Server) platformWhatsAppValidateNumber(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Phone string `json:"phone"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	phone := normalizePlatformWhatsAppPhone(input.Phone)
	if phone == "" || len(phone) < 11 {
		writeJSON(w, http.StatusOK, map[string]any{
			"valid": false, "has_whatsapp": false, "phone": phone,
			"message": "Completa un número de WhatsApp válido para poder verificarlo.",
		})
		return
	}
	result, err := s.checkPlatformWhatsAppNumber(r.Context(), input.Phone)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

type platformWhatsAppNumberValidation struct {
	Valid             bool   `json:"valid"`
	HasWhatsApp       bool   `json:"has_whatsapp"`
	Phone             string `json:"phone"`
	DisplayPhone      string `json:"display_phone"`
	JID               string `json:"jid,omitempty"`
	ProfileName       string `json:"profile_name,omitempty"`
	ProfilePictureURL string `json:"profile_picture_url,omitempty"`
	Message           string `json:"message"`
}

func (s *Server) requirePlatformWhatsAppNumber(ctx context.Context, phone string) error {
	_, err := s.validatePlatformWhatsAppNumberForSave(ctx, phone)
	return err
}

func (s *Server) validatePlatformWhatsAppNumberForSave(ctx context.Context, phone string) (platformWhatsAppNumberValidation, error) {
	result, err := s.checkPlatformWhatsAppNumber(ctx, phone)
	if err != nil {
		return result, err
	}
	if !result.Valid {
		return result, badRequest(defaultString(result.Message, "Este número no tiene cuenta de WhatsApp. Cambia el número para continuar."))
	}
	return result, nil
}

func (s *Server) fetchPlatformWhatsAppAvatarURL(ctx context.Context, phone string) string {
	normalized := normalizePlatformWhatsAppPhone(phone)
	if normalized == "" {
		return ""
	}
	client, whatsapp, err := s.platformWaxumClient(ctx)
	if err != nil {
		return ""
	}
	whatsapp = s.refreshPlatformWhatsAppFromWaxum(ctx, whatsapp)
	if !whatsapp.LoggedIn {
		return ""
	}
	return fetchPlatformWhatsAppAvatarURLFromClient(ctx, client, whatsapp.SessionID, normalized)
}

func fetchPlatformWhatsAppAvatarURLFromClient(ctx context.Context, client *waxum.Client, sessionID, phone string) string {
	if client == nil || strings.TrimSpace(sessionID) == "" {
		return ""
	}
	jid := waxum.UserJID(normalizePlatformWhatsAppPhone(phone))
	if jid == "" {
		return ""
	}
	picture, _, err := client.Contacts.GetProfilePicture(ctx, sessionID, jid)
	if err != nil || picture == nil || picture.URL == nil {
		return ""
	}
	return strings.TrimSpace(*picture.URL)
}

func (s *Server) checkPlatformWhatsAppNumber(ctx context.Context, phone string) (platformWhatsAppNumberValidation, error) {
	normalized := normalizePlatformWhatsAppPhone(phone)
	result := platformWhatsAppNumberValidation{
		Phone: normalized, DisplayPhone: formatPlatformWhatsAppPhone(normalized),
		Message: "Este número no tiene cuenta de WhatsApp. Cambia el número para continuar.",
	}
	if normalized == "" || len(normalized) < 11 {
		result.Message = "Completa un número de WhatsApp válido para poder verificarlo."
		return result, nil
	}
	client, whatsapp, err := s.platformWaxumClient(ctx)
	if err != nil {
		return result, err
	}
	whatsapp, autoDeleted, reconcileErr := s.reconcilePlatformWhatsAppSession(ctx, client, whatsapp)
	if reconcileErr != nil {
		return result, waxumFriendlyError("No se pudo confirmar el estado del WhatsApp global", reconcileErr)
	}
	if autoDeleted {
		_ = s.writePlatformSetting(ctx, platformWhatsAppSettingKey, whatsapp)
		return result, badRequest("El WhatsApp global fue desvinculado. Vuelve a vincularlo en Configuración > WhatsApp para validar números.")
	}
	if !whatsapp.LoggedIn {
		_ = s.writePlatformSetting(ctx, platformWhatsAppSettingKey, whatsapp)
		return result, badRequest("Primero vincula correctamente el WhatsApp global de superadministración para validar números con WAXUM.")
	}

	check, _, err := client.Contacts.CheckOnWhatsApp(ctx, whatsapp.SessionID, &waxum.CheckOnWhatsAppRequest{Phones: []string{normalized}})
	if err != nil {
		return result, waxumFriendlyError("No se pudo validar el número en WAXUM", err)
	}
	for _, item := range check.Results {
		if !platformPhonesMatch(item.Phone, normalized) && item.JID != nil && !platformPhonesMatch(*item.JID, normalized) {
			continue
		}
		result.Valid = item.IsRegistered
		result.HasWhatsApp = item.IsRegistered
		result.Phone = normalizePlatformWhatsAppPhone(firstNonEmpty(item.Phone, normalized))
		result.DisplayPhone = formatPlatformWhatsAppPhone(result.Phone)
		if item.JID != nil {
			result.JID = strings.TrimSpace(*item.JID)
		}
		break
	}
	if result.Valid {
		result.Message = "WhatsApp válido. Puedes continuar con el registro."
		result.ProfilePictureURL = fetchPlatformWhatsAppAvatarURLFromClient(ctx, client, whatsapp.SessionID, normalized)
		result.ProfileName = fetchPlatformWhatsAppContactName(ctx, client, whatsapp.SessionID, normalized)
	}
	return result, nil
}

func fetchPlatformWhatsAppContactName(ctx context.Context, client *waxum.Client, sessionID, phone string) string {
	query := normalizePlatformWhatsAppPhone(phone)
	if client == nil || sessionID == "" || query == "" {
		return ""
	}
	limit := int32(10)
	contacts, _, err := client.Contacts.List(ctx, sessionID, &waxum.ListParams{Q: &query, Limit: &limit})
	if err != nil || contacts == nil {
		return ""
	}
	for _, contact := range contacts.Contacts {
		if !platformPhonesMatch(firstNonEmpty(contact.JID, stringPointerValue(contact.Phone)), query) {
			continue
		}
		return firstNonEmpty(
			stringPointerValue(contact.FullName),
			stringPointerValue(contact.BusinessName),
			stringPointerValue(contact.PushName),
			stringPointerValue(contact.FirstName),
		)
	}
	return ""
}

func (s *Server) pendingPlatformWhatsAppConfig(ctx context.Context, whatsapp platformWhatsAppConfig) platformWhatsAppConfig {
	cleared := platformWhatsAppConfig{
		Enabled:     true,
		SessionID:   platformWhatsAppSessionID,
		SessionName: platformWhatsAppSessionName,
		Status:      "pending",
		Phone: normalizePlatformWhatsAppPhone(firstNonEmpty(
			whatsapp.Phone,
			whatsapp.LastPairingPhone,
			s.readPlatformSupportWhatsApp(ctx),
		)),
	}
	return touchWhatsAppConfig(cleared)
}

func beginPlatformWhatsAppLinking(whatsapp platformWhatsAppConfig, method string, timeoutSeconds int64) platformWhatsAppConfig {
	whatsapp.LinkingMethod = strings.TrimSpace(method)
	whatsapp.LinkingExpiresAt = whatsappLinkingExpiresAt(time.Now(), timeoutSeconds)
	whatsapp.UnlinkDetectedAt = ""
	whatsapp.LoggedIn = false
	whatsapp.Connected = true
	if whatsapp.LinkingMethod == "pairing" {
		whatsapp.Status = "pairing_code_ready"
	} else {
		whatsapp.Status = "connecting"
	}
	return touchWhatsAppConfig(whatsapp)
}

func (s *Server) clearPlatformWhatsAppRemoteSession(ctx context.Context, client *waxum.Client, whatsapp platformWhatsAppConfig) (platformWhatsAppConfig, error) {
	if client == nil {
		var err error
		client, err = s.platformWaxumClientFromSettings(ctx)
		if err != nil {
			return whatsapp, err
		}
	}
	if err := deleteWaxumSessionCompletely(ctx, client, whatsapp.SessionID); err != nil {
		return whatsapp, err
	}
	return s.pendingPlatformWhatsAppConfig(ctx, whatsapp), nil
}

// reconcilePlatformWhatsAppSession reflects an existing WAXUM session without
// creating one. Unauthenticated sessions are only retained while an explicit
// QR or phone-pairing window is active. This prevents dashboard reads from
// leaving permanent orphan sessions behind.
func (s *Server) reconcilePlatformWhatsAppSession(
	ctx context.Context,
	client *waxum.Client,
	whatsapp platformWhatsAppConfig,
) (platformWhatsAppConfig, bool, error) {
	if client == nil || strings.TrimSpace(whatsapp.SessionID) == "" {
		return s.pendingPlatformWhatsAppConfig(ctx, whatsapp), false, nil
	}
	wasLinked := whatsapp.LoggedIn || whatsapp.Status == "linked"
	session, _, err := client.Sessions.Get(ctx, whatsapp.SessionID)
	if err != nil {
		if waxum.IsStatus(err, http.StatusNotFound) {
			return s.pendingPlatformWhatsAppConfig(ctx, whatsapp), false, nil
		}
		return whatsapp, false, err
	}
	whatsapp = applyWaxumSessionInfo(whatsapp, session)
	remoteStatus := session.Status
	if status, _, statusErr := client.Sessions.GetStatus(ctx, whatsapp.SessionID); statusErr == nil && status != nil {
		remoteStatus = status.Status
		whatsapp = applyWaxumSessionStatus(whatsapp, status)
	} else if statusErr != nil && waxum.IsStatus(statusErr, http.StatusNotFound) {
		return s.pendingPlatformWhatsAppConfig(ctx, whatsapp), false, nil
	}
	if whatsapp.LoggedIn {
		whatsapp = s.hydratePlatformWhatsAppIdentity(ctx, client, whatsapp)
		return touchWhatsAppConfig(whatsapp), false, nil
	}

	now := time.Now().UTC()
	linkingActive := whatsappLinkingIsActive(whatsapp.LinkingExpiresAt, now)
	shouldDelete := !linkingActive
	if wasLinked && remoteStatus == waxum.SessionStatusConnecting {
		if whatsapp.UnlinkDetectedAt == "" {
			whatsapp.UnlinkDetectedAt = now.Format(time.RFC3339)
		}
		shouldDelete = !whatsappReconnectGraceActive(whatsapp.UnlinkDetectedAt, now)
	}
	if wasLinked && remoteStatus != waxum.SessionStatusConnecting {
		shouldDelete = true
	}
	if !shouldDelete {
		return touchWhatsAppConfig(whatsapp), false, nil
	}
	cleared, err := s.clearPlatformWhatsAppRemoteSession(ctx, client, whatsapp)
	if err != nil {
		return whatsapp, false, err
	}
	return cleared, true, nil
}

func (s *Server) ensurePlatformWhatsAppSession(ctx context.Context) (platformWhatsAppConfig, error) {
	client, err := s.platformWaxumClientFromSettings(ctx)
	if err != nil {
		return platformWhatsAppConfig{}, err
	}
	current, err := s.readPlatformWhatsAppConfig(ctx)
	if err != nil {
		return platformWhatsAppConfig{}, err
	}

	// WAXUM muestra el ID de la sesión en su consola, no solo el nombre
	// descriptivo. Por eso ambos valores deben usar exactamente "WAMERCIO".
	current.SessionID = platformWhatsAppSessionID
	current.SessionName = platformWhatsAppSessionName

	var session *waxum.SessionInfo
	legacySessionIDs := make([]string, 0, 1)
	list, _, listErr := client.Sessions.List(ctx)
	if listErr != nil {
		return platformWhatsAppConfig{}, waxumFriendlyError("No se pudieron consultar las sesiones de WAXUM", listErr)
	}
	if list != nil {
		for idx := range list.Sessions {
			item := &list.Sessions[idx]
			switch {
			case item.ID == platformWhatsAppSessionID:
				session = item
			case strings.EqualFold(strings.TrimSpace(item.ID), platformWhatsAppLegacySessionID):
				legacySessionIDs = append(legacySessionIDs, item.ID)
			}
		}
	}
	if session == nil {
		created, _, createErr := client.Sessions.Create(ctx, &waxum.CreateSessionRequest{
			ID:   waxum.Ptr(platformWhatsAppSessionID),
			Name: waxum.Ptr(platformWhatsAppSessionName),
			Device: &waxum.DevicePropsRequest{
				OS:       waxum.Ptr("Linux"),
				Platform: waxum.Ptr("chrome"),
			},
		})
		if createErr != nil {
			return platformWhatsAppConfig{}, waxumFriendlyError("No se pudo crear la sesión WAMERCIO en WAXUM", createErr)
		}
		session = &created.Session
	}
	current = applyWaxumSessionInfo(current, session)
	current.Enabled = true
	current.Phone = normalizePlatformWhatsAppPhone(firstNonEmpty(current.Phone, current.LastPairingPhone, s.readPlatformSupportWhatsApp(ctx)))
	if current.CreatedAt == "" {
		current.CreatedAt = unixTimestampString(session.CreatedAt)
		if current.CreatedAt == "" {
			current.CreatedAt = time.Now().UTC().Format(time.RFC3339)
		}
	}

	// El API de WAXUM no ofrece un endpoint para renombrar el ID. Se crea la
	// sesión canónica y la sesión anterior se conserva hasta que WAMERCIO esté
	// vinculada, evitando dejar la plataforma sin una conexión funcional.
	if current.LoggedIn {
		for _, legacyID := range legacySessionIDs {
			_, _, _ = client.Sessions.Disconnect(ctx, legacyID)
			_, _, _ = client.Sessions.Delete(ctx, legacyID)
		}
	}

	current = touchWhatsAppConfig(current)
	if err := s.writePlatformSetting(ctx, platformWhatsAppSettingKey, current); err != nil {
		return platformWhatsAppConfig{}, err
	}
	return current, nil
}

func (s *Server) preparePlatformWhatsAppLinkingSession(ctx context.Context, client *waxum.Client, whatsapp platformWhatsAppConfig) (platformWhatsAppConfig, error) {
	if status, _, err := client.Sessions.GetStatus(ctx, whatsapp.SessionID); err == nil {
		whatsapp = applyWaxumSessionStatus(whatsapp, status)
		whatsapp = touchWhatsAppConfig(whatsapp)
		_ = s.writePlatformSetting(ctx, platformWhatsAppSettingKey, whatsapp)
		if whatsapp.Connected || whatsapp.LoggedIn {
			return whatsapp, nil
		}
	}
	_, _, connectErr := client.Sessions.Connect(ctx, whatsapp.SessionID, &waxum.ConnectRequest{
		Device: &waxum.DevicePropsRequest{OS: waxum.Ptr("Linux"), Platform: waxum.Ptr("chrome")},
	})
	if connectErr != nil {
		return whatsapp, waxumFriendlyError("No se pudo conectar la sesión de WAXUM", connectErr)
	}
	var lastErr error
	for attempt := 0; attempt < 18; attempt++ {
		status, _, statusErr := client.Sessions.GetStatus(ctx, whatsapp.SessionID)
		if statusErr == nil {
			whatsapp = applyWaxumSessionStatus(whatsapp, status)
			whatsapp = touchWhatsAppConfig(whatsapp)
			_ = s.writePlatformSetting(ctx, platformWhatsAppSettingKey, whatsapp)
			if whatsapp.Connected || whatsapp.LoggedIn {
				return whatsapp, nil
			}
		} else {
			lastErr = statusErr
		}
		if !sleepContext(ctx, time.Duration(500+attempt*150)*time.Millisecond) {
			return whatsapp, ctx.Err()
		}
	}
	if lastErr != nil {
		return whatsapp, waxumFriendlyError("La sesión se solicitó, pero no se pudo confirmar el estado en WAXUM", lastErr)
	}
	return whatsapp, badRequest("WAXUM aceptó la solicitud, pero la sesión aún aparece desconectada. Vuelve a intentarlo en unos segundos.")
}

func (s *Server) refreshPlatformWhatsAppFromWaxum(ctx context.Context, whatsapp platformWhatsAppConfig) platformWhatsAppConfig {
	if whatsapp.SessionID == "" {
		return whatsapp
	}
	client, err := s.platformWaxumClientFromSettings(ctx)
	if err != nil {
		return whatsapp
	}
	if session, _, getErr := client.Sessions.Get(ctx, whatsapp.SessionID); getErr == nil {
		whatsapp = applyWaxumSessionInfo(whatsapp, session)
	} else if waxum.IsStatus(getErr, http.StatusNotFound) {
		whatsapp.Connected = false
		whatsapp.LoggedIn = false
		whatsapp.Status = "disconnected"
		return touchWhatsAppConfig(whatsapp)
	}
	if status, _, statusErr := client.Sessions.GetStatus(ctx, whatsapp.SessionID); statusErr == nil {
		whatsapp = applyWaxumSessionStatus(whatsapp, status)
	}
	if whatsapp.LoggedIn {
		whatsapp = s.hydratePlatformWhatsAppIdentity(ctx, client, whatsapp)
	} else {
		whatsapp.ProfileName = ""
		whatsapp.ProfilePictureURL = ""
	}
	return touchWhatsAppConfig(whatsapp)
}

func (s *Server) hydratePlatformWhatsAppIdentity(ctx context.Context, client *waxum.Client, whatsapp platformWhatsAppConfig) platformWhatsAppConfig {
	status, _, err := client.Sessions.GetStatus(ctx, whatsapp.SessionID)
	if err == nil && status != nil {
		whatsapp = applyWaxumSessionStatus(whatsapp, status)
	}
	phone := normalizePlatformWhatsAppPhone(firstNonEmpty(whatsapp.Phone, phoneFromWhatsAppJID(whatsapp.JID), whatsapp.LastPairingPhone))
	if phone != "" {
		whatsapp.Phone = phone
		whatsapp.JID = waxum.UserJID(phone)
		if picture := fetchPlatformWhatsAppAvatarURLFromClient(ctx, client, whatsapp.SessionID, phone); picture != "" {
			whatsapp.ProfilePictureURL = picture
		}
	}
	return whatsapp
}

func (s *Server) waitForPlatformWhatsAppQRCode(ctx context.Context, client *waxum.Client, whatsapp platformWhatsAppConfig) (string, platformWhatsAppConfig, error) {
	var lastErr error
	for attempt := 0; attempt < 24; attempt++ {
		qr, _, qrErr := client.Sessions.GetQRCode(ctx, whatsapp.SessionID)
		if qrErr == nil && qr != nil {
			for _, candidate := range qr.QRCodes {
				if clean := strings.TrimSpace(candidate); clean != "" {
					return clean, whatsapp, nil
				}
			}
			lastErr = badRequest("WAXUM respondió sin contenido QR")
		} else {
			lastErr = qrErr
		}
		if status, _, statusErr := client.Sessions.GetStatus(ctx, whatsapp.SessionID); statusErr == nil {
			whatsapp = applyWaxumSessionStatus(whatsapp, status)
			whatsapp = touchWhatsAppConfig(whatsapp)
			_ = s.writePlatformSetting(ctx, platformWhatsAppSettingKey, whatsapp)
			if whatsapp.LoggedIn {
				return "", whatsapp, badRequest("La sesión ya aparece vinculada en WAXUM. Actualiza el estado en WAMERCIO.")
			}
		}
		if attempt == 4 || attempt == 10 || attempt == 16 {
			_, _, _ = client.Sessions.Connect(ctx, whatsapp.SessionID, &waxum.ConnectRequest{})
		}
		if !sleepContext(ctx, time.Duration(650+attempt*180)*time.Millisecond) {
			return "", whatsapp, ctx.Err()
		}
	}
	return "", whatsapp, waxumFriendlyError("No se pudo obtener el código QR desde WAXUM", lastErr)
}

func (s *Server) newPlatformWaxumClient(config platformWaxumConfig) (*waxum.Client, error) {
	if !config.Enabled || config.PublicURL == "" || config.AdminToken == "" {
		return nil, badRequest("Configura y activa primero la conexión WAXUM dentro de WhatsApp con URL pública y token de superadministración")
	}
	options := []waxum.Option{
		waxum.WithBaseURL(config.PublicURL),
		waxum.WithMaxResponseBody(8 << 20),
		waxum.WithRetry(waxum.RetryConfig{MaxAttempts: 2, InitialBackoff: 250 * time.Millisecond, MaxBackoff: time.Second}),
	}
	if s.waxumHTTPClient != nil {
		options = append(options, waxum.WithHTTPClient(s.waxumHTTPClient))
	} else {
		options = append(options, waxum.WithTimeout(s.waxumTimeout()))
	}
	client, err := waxum.NewClient(config.AdminToken, options...)
	if err != nil {
		return nil, badRequest("No se pudo inicializar el cliente WAXUM: " + err.Error())
	}
	return client, nil
}

func (s *Server) platformWaxumClientFromSettings(ctx context.Context) (*waxum.Client, error) {
	config, err := s.readPlatformWaxumConfig(ctx)
	if err != nil {
		return nil, err
	}
	return s.newPlatformWaxumClient(config)
}

func (s *Server) platformWaxumClientAuto(ctx context.Context) (*waxum.Client, platformWhatsAppConfig, error) {
	client, err := s.platformWaxumClientFromSettings(ctx)
	if err != nil {
		return nil, platformWhatsAppConfig{}, err
	}

	// Do not trust only the locally stored session_id. ensurePlatformWhatsAppSession
	// lists the real WAXUM sessions and recreates the WAMERCIO session when it is
	// missing remotely, which makes QR and pairing actions self-healing.
	whatsapp, err := s.ensurePlatformWhatsAppSession(ctx)
	if err != nil {
		return nil, platformWhatsAppConfig{}, err
	}
	return client, whatsapp, nil
}

func (s *Server) platformWaxumClient(ctx context.Context) (*waxum.Client, platformWhatsAppConfig, error) {
	client, err := s.platformWaxumClientFromSettings(ctx)
	if err != nil {
		return nil, platformWhatsAppConfig{}, err
	}
	whatsapp, err := s.readPlatformWhatsAppConfig(ctx)
	if err != nil {
		return nil, platformWhatsAppConfig{}, err
	}
	if whatsapp.SessionID == "" {
		return nil, platformWhatsAppConfig{}, badRequest("Primero crea la sesión global de WhatsApp")
	}
	return client, whatsapp, nil
}

func (s *Server) waxumTimeout() time.Duration {
	if s.cfg.WaxumHTTPTimeout > 0 {
		return s.cfg.WaxumHTTPTimeout
	}
	return 25 * time.Second
}

func (s *Server) readPlatformWaxumConfig(ctx context.Context) (platformWaxumConfig, error) {
	raw, err := s.readPlatformSettingMap(ctx, platformWaxumSettingKey)
	if err != nil {
		return platformWaxumConfig{}, err
	}
	publicURL := normalizePlatformWaxumPublicURL(stringSetting(raw, "public_url"))
	return platformWaxumConfig{
		Enabled:      boolSetting(raw, true, "enabled"),
		PublicURL:    publicURL,
		DashboardURL: publicURL,
		DocsURL:      buildPlatformWaxumDocsURL(publicURL),
		AdminToken:   strings.TrimSpace(stringSetting(raw, "admin_token")),
	}, nil
}

func normalizePlatformWaxumConfig(config platformWaxumConfig) (platformWaxumConfig, error) {
	config.PublicURL = normalizePlatformWaxumPublicURL(config.PublicURL)
	config.AdminToken = strings.TrimSpace(config.AdminToken)
	config.DashboardURL = config.PublicURL
	config.DocsURL = buildPlatformWaxumDocsURL(config.PublicURL)

	if !config.Enabled {
		return config, nil
	}
	if config.PublicURL == "" || config.AdminToken == "" {
		return platformWaxumConfig{}, badRequest("Completa la URL pública y el token de superadministración de WAXUM")
	}
	parsed, err := url.Parse(config.PublicURL)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return platformWaxumConfig{}, badRequest("La URL pública de WAXUM debe ser una dirección HTTP o HTTPS válida")
	}
	return config, nil
}

func normalizePlatformWaxumPublicURL(value string) string {
	clean := normalizePlatformURL(value)
	if clean == "" {
		return ""
	}
	parsed, err := url.Parse(clean)
	if err != nil || parsed.Host == "" {
		return clean
	}
	path := strings.TrimRight(parsed.Path, "/")
	lowerPath := strings.ToLower(path)
	for _, suffix := range []string{"/dashboard", "/swagger-ui", "/swagger-ui/index.html", "/api-docs/openapi.json"} {
		if strings.HasSuffix(lowerPath, suffix) {
			path = strings.TrimRight(path[:len(path)-len(suffix)], "/")
			break
		}
	}
	parsed.Path = path
	parsed.RawPath = ""
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return strings.TrimRight(parsed.String(), "/")
}

func buildPlatformWaxumDocsURL(publicURL string) string {
	publicURL = strings.TrimRight(strings.TrimSpace(publicURL), "/")
	if publicURL == "" {
		return ""
	}
	return publicURL + "/swagger-ui/"
}

func (s *Server) readPlatformWhatsAppConfig(ctx context.Context) (platformWhatsAppConfig, error) {
	raw, err := s.readPlatformSettingMap(ctx, platformWhatsAppSettingKey)
	if err != nil {
		return platformWhatsAppConfig{}, err
	}
	return platformWhatsAppConfig{
		Enabled:           boolSetting(raw, true, "enabled"),
		SessionID:         platformWhatsAppSessionID,
		SessionName:       platformWhatsAppSessionName,
		Status:            defaultString(stringSetting(raw, "status"), "pending"),
		Connected:         boolSetting(raw, false, "connected"),
		LoggedIn:          boolSetting(raw, false, "logged_in"),
		JID:               stringSetting(raw, "jid"),
		Phone:             stringSetting(raw, "phone"),
		LastPairingPhone:  stringSetting(raw, "last_pairing_phone"),
		ProfileName:       stringSetting(raw, "profile_name"),
		ProfilePictureURL: stringSetting(raw, "profile_picture_url"),
		LinkingMethod:     stringSetting(raw, "linking_method"),
		LinkingExpiresAt:  stringSetting(raw, "linking_expires_at"),
		UnlinkDetectedAt:  stringSetting(raw, "unlink_detected_at"),
		CreatedAt:         stringSetting(raw, "created_at"),
		UpdatedAt:         stringSetting(raw, "updated_at"),
	}, nil
}

func (s *Server) readPlatformSupportWhatsApp(ctx context.Context) string {
	if s.tenantManager == nil {
		return ""
	}
	var raw []byte
	if err := s.tenantManager.CoreDB().QueryRow(ctx, `SELECT value FROM platform_settings WHERE key=$1`, "support_whatsapp").Scan(&raw); err != nil {
		return ""
	}
	var value any
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &value)
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case json.Number:
		return typed.String()
	default:
		return strings.Trim(strings.TrimSpace(string(raw)), `"`)
	}
}

func (s *Server) readPlatformSettingMap(ctx context.Context, key string) (map[string]any, error) {
	if s.tenantManager == nil {
		return map[string]any{}, badRequest("El modo SaaS multi-tenant no está activo")
	}
	var raw []byte
	err := s.tenantManager.CoreDB().QueryRow(ctx, `SELECT value FROM platform_settings WHERE key=$1`, key).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}
	out := map[string]any{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return out, nil
}

func (s *Server) writePlatformSetting(ctx context.Context, key string, value any) error {
	payload, err := marshalJSONDatabaseValue(value)
	if err != nil {
		return err
	}
	_, err = s.tenantManager.CoreDB().Exec(ctx, `
		INSERT INTO platform_settings (key, value, updated_at) VALUES ($1,$2::jsonb,now())
		ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()
	`, key, payload)
	return err
}

func sanitizePlatformWaxumConfig(config platformWaxumConfig) map[string]any {
	return map[string]any{
		"enabled":                config.Enabled,
		"public_url":             config.PublicURL,
		"dashboard_url":          config.DashboardURL,
		"docs_url":               config.DocsURL,
		"admin_token_configured": config.AdminToken != "",
		"ready":                  config.Enabled && config.PublicURL != "" && config.AdminToken != "",
	}
}

func (s *Server) platformWhatsAppPayload(ctx context.Context, whatsapp platformWhatsAppConfig, extra map[string]any) map[string]any {
	payload := map[string]any{
		"whatsapp": sanitizePlatformWhatsAppConfig(whatsapp),
	}
	if config, err := s.readPlatformWaxumConfig(ctx); err == nil {
		payload["waxum"] = sanitizePlatformWaxumConfig(config)
	}
	for key, value := range extra {
		payload[key] = value
	}
	return payload
}

func sanitizePlatformWhatsAppConfig(config platformWhatsAppConfig) map[string]any {
	return map[string]any{
		"enabled":             config.Enabled,
		"session_id":          config.SessionID,
		"session_name":        config.SessionName,
		"status":              config.Status,
		"connected":           config.Connected,
		"logged_in":           config.LoggedIn,
		"jid":                 config.JID,
		"phone":               config.Phone,
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

func touchWhatsAppConfig(config platformWhatsAppConfig) platformWhatsAppConfig {
	config.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if config.SessionName == "" {
		config.SessionName = platformWhatsAppSessionName
	}
	return config
}

func applyWaxumSessionInfo(config platformWhatsAppConfig, session *waxum.SessionInfo) platformWhatsAppConfig {
	if session == nil {
		return config
	}
	config.SessionID = session.ID
	config.SessionName = platformWhatsAppSessionName
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
	return config
}

func applyWaxumSessionStatus(config platformWhatsAppConfig, status *waxum.SessionStatusResponse) platformWhatsAppConfig {
	if status == nil {
		return config
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
	return config
}

func waxumSessionConnected(status waxum.SessionStatus, loggedIn bool) bool {
	if loggedIn || status == waxum.SessionStatusLoggedIn {
		return true
	}
	switch status {
	case waxum.SessionStatusConnecting,
		waxum.SessionStatusWaitingForQR,
		waxum.SessionStatusWaitingForPairCode,
		waxum.SessionStatusConnected:
		return true
	default:
		return false
	}
}

func platformStatusFromWaxum(status waxum.SessionStatus, loggedIn bool) string {
	if loggedIn || status == waxum.SessionStatusLoggedIn {
		return "linked"
	}
	switch status {
	case waxum.SessionStatusConnected:
		return "connected"
	case waxum.SessionStatusConnecting:
		return "connecting"
	case waxum.SessionStatusWaitingForQR:
		return "qr_ready"
	case waxum.SessionStatusWaitingForPairCode:
		return "pairing_code_ready"
	case waxum.SessionStatusDisconnected:
		return "disconnected"
	default:
		return defaultString(strings.TrimSpace(string(status)), "pending")
	}
}

func unixTimestampString(value int64) string {
	if value <= 0 {
		return ""
	}
	if value > 10_000_000_000 {
		value /= 1000
	}
	return time.Unix(value, 0).UTC().Format(time.RFC3339)
}

func phoneFromWhatsAppJID(jid string) string {
	clean := strings.TrimSpace(jid)
	if idx := strings.Index(clean, "@"); idx >= 0 {
		clean = clean[:idx]
	}
	if idx := strings.Index(clean, ":"); idx >= 0 {
		clean = clean[:idx]
	}
	return clean
}

func platformPhonesMatch(candidate, expected string) bool {
	left := normalizePlatformWhatsAppPhone(firstNonEmpty(phoneFromWhatsAppJID(candidate), candidate))
	right := normalizePlatformWhatsAppPhone(firstNonEmpty(phoneFromWhatsAppJID(expected), expected))
	if left == "" || right == "" {
		return false
	}
	if left == right {
		return true
	}
	return len(left) >= 10 && len(right) >= 10 && left[len(left)-10:] == right[len(right)-10:]
}

func formatPlatformWhatsAppPhone(phone string) string {
	digits := normalizePlatformWhatsAppPhone(phone)
	if digits == "" {
		return ""
	}
	if len(digits) == 11 && strings.HasPrefix(digits, "1") {
		number := digits[1:]
		return "+1 " + number[:3] + "-" + number[3:6] + "-" + number[6:]
	}
	return "+" + digits
}

func normalizePlatformURL(value string) string {
	clean := strings.TrimRight(strings.TrimSpace(value), "/")
	if clean == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(clean), "http://") || strings.HasPrefix(strings.ToLower(clean), "https://") {
		return clean
	}
	return "https://" + clean
}

var nonDigitPattern = regexp.MustCompile(`\D+`)

func normalizePlatformWhatsAppPhone(value string) string {
	digits := nonDigitPattern.ReplaceAllString(value, "")
	if len(digits) == 10 {
		digits = "1" + digits
	}
	if len(digits) < 8 {
		return ""
	}
	if len(digits) > 15 {
		digits = digits[:15]
	}
	return digits
}

func stringSetting(values map[string]any, key string) string {
	raw, ok := values[key]
	if !ok {
		return ""
	}
	switch value := raw.(type) {
	case string:
		return strings.TrimSpace(value)
	case json.Number:
		return value.String()
	default:
		return ""
	}
}

func boolSetting(values map[string]any, fallback bool, key string) bool {
	raw, ok := values[key]
	if !ok {
		return fallback
	}
	switch value := raw.(type) {
	case bool:
		return value
	case string:
		clean := strings.ToLower(strings.TrimSpace(value))
		return clean == "1" || clean == "true" || clean == "yes" || clean == "on" || clean == "activo"
	default:
		return fallback
	}
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func stringPointerValue(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func waxumFriendlyError(prefix string, err error) error {
	if err == nil {
		return badRequest(prefix)
	}
	var apiErr *waxum.APIError
	if errors.As(err, &apiErr) {
		detail := firstNonEmpty(apiErr.Message, waxumMessageFromBody(apiErr.Body), apiErr.Code, http.StatusText(apiErr.StatusCode))
		return badRequest(strings.TrimSpace(prefix + ": " + detail))
	}
	return badRequest(strings.TrimSpace(prefix + ": " + err.Error()))
}

func waxumMessageFromBody(body []byte) string {
	body = []byte(strings.TrimSpace(string(body)))
	if len(body) == 0 {
		return ""
	}
	var parsed map[string]any
	if err := json.Unmarshal(body, &parsed); err != nil {
		return string(body)
	}
	for _, key := range []string{"error", "details", "message", "code"} {
		if text := strings.TrimSpace(fmt.Sprint(parsed[key])); text != "" && text != "<nil>" {
			return text
		}
	}
	return string(body)
}
