package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"wamercio/backend/internal/integrations/identidad"
	"wamercio/backend/internal/platform/tenancy"
)

const platformIdentitySettingKey = "identity"

type platformIdentityConfig struct {
	Enabled                  bool   `json:"enabled"`
	Required                 bool   `json:"required"`
	BaseURL                  string `json:"base_url"`
	APIKey                   string `json:"api_key,omitempty"`
	ClientID                 string `json:"client_id"`
	TimeoutSeconds           int    `json:"timeout_seconds"`
	DeviceLimitEnabled       bool   `json:"device_limit_enabled"`
	DeviceLimitMax           int    `json:"device_limit_max"`
	DeviceLimitWindowMinutes int    `json:"device_limit_window_minutes"`
}

type platformIdentityVerificationInput struct {
	SubjectType string `json:"tipo_sujeto"`
	Document    string `json:"documento"`
	Context     string `json:"contexto"`
}

const (
	platformIdentityVerificationsPerMinute  = 5
	defaultIdentityDeviceLimitMax           = 20
	defaultIdentityDeviceLimitWindowMinutes = 60
	platformIdentityDeviceHeader            = "X-WAMERCIO-Device-ID"
)

var allowedPlatformIdentityContexts = map[string]struct{}{
	"registro_propietario":  {},
	"registro_usuario_saas": {},
	"registro_negocio":      {},
	"alta_empleado":         {},
	"alta_repartidor":       {},
	"alta_proveedor":        {},
	"registro_cliente":      {},
	"actualizar_perfil":     {},
	"prueba_conexion":       {},
}

func (s *Server) requirePlatformIdentityVerificationPermission(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := platformUserFromContext(r.Context())
		if !ok || (!platformPermissionEnabled(user, platformPermissionBusinesses) && !platformPermissionEnabled(user, platformPermissionSettings) && !platformPermissionEnabled(user, platformPermissionUsers)) {
			writeJSON(w, http.StatusForbidden, map[string]string{
				"error": "Tu rol no tiene permiso para verificar identidades en la plataforma",
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) rateLimitPlatformIdentity(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.allowPlatformIdentityVerification(r.Context()) {
			s.recordIdentityRateLimit()
			writeJSON(w, http.StatusOK, identityManualReviewResponse(
				"IDENTITY_RATE_LIMITED",
				"Verificación limitada, inténtalo en 1 minuto.",
				60,
			))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) allowPlatformIdentityVerification(ctx context.Context) bool {
	if s.rateLimiter == nil && s.redis == nil {
		return true
	}
	actor := strings.TrimSpace(s.cfg.PlatformAdminUsername)
	if user, ok := platformUserFromContext(ctx); ok && strings.TrimSpace(user.Username) != "" {
		actor = strings.TrimSpace(user.Username)
	}
	if actor == "" {
		actor = "platform"
	}
	return s.allowRequest(ctx, "identity:platform:"+strings.ToLower(actor), platformIdentityVerificationsPerMinute, time.Now())
}

func identityDeviceKeyFromRequest(r *http.Request) string {
	if r == nil {
		return ""
	}
	raw := strings.TrimSpace(r.Header.Get(platformIdentityDeviceHeader))
	if raw == "" {
		raw = "ip:" + requestIP(r)
	}
	if len(raw) > 160 {
		raw = raw[:160]
	}
	return safeLogIdentifier(raw)
}

func (s *Server) allowIdentityDeviceVerification(ctx context.Context, config platformIdentityConfig, deviceKey string) bool {
	if !config.DeviceLimitEnabled || config.DeviceLimitMax <= 0 {
		return true
	}
	deviceKey = strings.TrimSpace(deviceKey)
	if deviceKey == "" {
		deviceKey = "unknown"
	}
	scope := strings.TrimSpace(tenantIDFromContext(ctx))
	if scope == "" {
		scope = "platform"
	}
	window := time.Duration(config.DeviceLimitWindowMinutes) * time.Minute
	return s.allowRequestWindow(
		ctx,
		"identity:device:"+safeLogIdentifier(scope)+":"+deviceKey,
		config.DeviceLimitMax,
		window,
		time.Now(),
	)
}

func (s *Server) recordIdentityRateLimit() {
	if s.metrics != nil {
		s.metrics.rateLimited.Add(1)
	}
}

func identityManualReviewResponse(code, message string, retryAfterSeconds int) map[string]any {
	errorPayload := map[string]any{
		"code":    strings.TrimSpace(code),
		"message": strings.TrimSpace(message),
	}
	if retryAfterSeconds > 0 {
		errorPayload["retry_after_seconds"] = retryAfterSeconds
	}
	return map[string]any{
		"success":        false,
		"manual_allowed": true,
		"error":          errorPayload,
	}
}

func identityDeviceLimitMessage(retryAfterSeconds int) string {
	retryMinutes := (retryAfterSeconds + 59) / 60
	if retryMinutes < 1 {
		retryMinutes = 1
	}
	if retryMinutes == 1 {
		return "Verificación limitada, inténtalo en 1 minuto."
	}
	return fmt.Sprintf("Verificación limitada, inténtalo en %d minutos.", retryMinutes)
}

func identityDeviceLimitRetrySeconds(config platformIdentityConfig, now time.Time) int {
	windowMinutes := config.DeviceLimitWindowMinutes
	if windowMinutes <= 0 {
		windowMinutes = defaultIdentityDeviceLimitWindowMinutes
	}
	windowSeconds := int64(windowMinutes * 60)
	if windowSeconds <= 0 {
		return defaultIdentityDeviceLimitWindowMinutes * 60
	}
	remaining := windowSeconds - (now.Unix() % windowSeconds)
	if remaining <= 0 || remaining > windowSeconds {
		remaining = windowSeconds
	}
	return int(remaining)
}

func (s *Server) platformIdentityState(w http.ResponseWriter, r *http.Request) {
	config, err := s.readPlatformIdentityConfig(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"identity": sanitizePlatformIdentityConfig(config)})
}

func (s *Server) configurePlatformIdentity(w http.ResponseWriter, r *http.Request) {
	if s.tenantManager == nil {
		writeError(w, badRequest("El modo SaaS multi-tenant no está activo"))
		return
	}
	var input platformIdentityConfig
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	current, err := s.readPlatformIdentityConfig(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	if strings.TrimSpace(input.APIKey) == "" {
		input.APIKey = current.APIKey
	}
	config, err := normalizePlatformIdentityConfig(input)
	if err != nil {
		writeError(w, err)
		return
	}
	if err := s.writePlatformSetting(r.Context(), platformIdentitySettingKey, config); err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), s.platformActor(r), "", "platform.identity.configure", map[string]any{
		"identity": sanitizePlatformIdentityConfig(config),
	})
	writeJSON(w, http.StatusOK, map[string]any{"identity": sanitizePlatformIdentityConfig(config)})
}

func (s *Server) verifyPlatformIdentity(w http.ResponseWriter, r *http.Request) {
	var input platformIdentityVerificationInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input.SubjectType = strings.ToLower(strings.TrimSpace(input.SubjectType))
	input.Document = onlyDigits(input.Document)
	input.Context = strings.ToLower(strings.TrimSpace(input.Context))
	if err := validatePlatformIdentityVerificationInput(input); err != nil {
		writeError(w, err)
		return
	}

	config, err := s.readPlatformIdentityConfig(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	if !s.allowIdentityDeviceVerification(r.Context(), config, identityDeviceKeyFromRequest(r)) {
		s.recordIdentityRateLimit()
		retryAfterSeconds := identityDeviceLimitRetrySeconds(config, time.Now())
		writeJSON(w, http.StatusOK, identityManualReviewResponse(
			"IDENTITY_DEVICE_LIMIT_REACHED",
			identityDeviceLimitMessage(retryAfterSeconds),
			retryAfterSeconds,
		))
		return
	}
	result, meta, err := s.verifyIdentity(r.Context(), config, input, requestTraceID(r))
	if err == nil {
		normalizeIdentityPersonResult(&result)
	}
	if err != nil {
		var apiErr *identidad.APIError
		if errors.As(err, &apiErr) && identityErrorAllowsManualReview(apiErr) {
			writeJSON(w, http.StatusOK, map[string]any{
				"success":        false,
				"manual_allowed": true,
				"error": map[string]any{
					"code":       apiErr.Code,
					"message":    identityFriendlyError(apiErr),
					"request_id": apiErr.RequestID,
				},
			})
			return
		}
		writeIdentityAPIError(w, err)
		return
	}

	s.auditPlatform(r.Context(), s.platformActor(r), "", "platform.identity.verify", map[string]any{
		"subject_type": input.SubjectType,
		"document":     maskIdentityDocument(input.Document),
		"context":      input.Context,
		"valid":        result.Valid,
		"found":        result.Found,
		"source":       result.Source,
		"request_id":   meta.RequestID,
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"data":    result,
		"meta":    meta,
	})
}

func normalizeIdentityPersonResult(result *identidad.Result) {
	if result == nil || result.Person == nil {
		return
	}
	result.Person.FirstNames = normalizePersonName(result.Person.FirstNames)
	result.Person.LastNames = normalizePersonName(result.Person.LastNames)
	result.Person.FullName = normalizePersonName(result.Person.FullName)
	result.Person.BirthDate = normalizePersonBirthDate(result.Person.BirthDate)
	result.Person.Gender = normalizePersonGender(result.Person.Gender)
}

func (s *Server) verifyClientIdentity(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Document string `json:"documento"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}

	document := onlyDigits(input.Document)
	formatted := normalizeNationalID(document)
	if len(document) != 11 || !validDominicanNationalID(formatted) {
		writeError(w, badRequest("Ingresa una cédula dominicana válida"))
		return
	}

	config, err := s.readPlatformIdentityConfig(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	if !s.allowIdentityDeviceVerification(r.Context(), config, identityDeviceKeyFromRequest(r)) {
		s.recordIdentityRateLimit()
		retryAfterSeconds := identityDeviceLimitRetrySeconds(config, time.Now())
		writeJSON(w, http.StatusOK, identityManualReviewResponse(
			"IDENTITY_DEVICE_LIMIT_REACHED",
			identityDeviceLimitMessage(retryAfterSeconds),
			retryAfterSeconds,
		))
		return
	}
	verification := platformIdentityVerificationInput{
		SubjectType: "persona",
		Document:    document,
		Context:     "registro_cliente",
	}
	result, _, err := s.verifyIdentity(r.Context(), config, verification, requestTraceID(r))
	if err != nil {
		var apiErr *identidad.APIError
		if errors.As(err, &apiErr) && identityErrorAllowsManualReview(apiErr) {
			writeJSON(w, http.StatusOK, map[string]any{
				"success":        false,
				"manual_allowed": true,
				"error": map[string]any{
					"code":    apiErr.Code,
					"message": identityFriendlyError(apiErr),
				},
			})
			return
		}
		writeIdentityAPIError(w, err)
		return
	}

	normalizeIdentityPersonResult(&result)
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"data":    result,
	})
}

func (s *Server) verifyClientIdentityForRegistration(ctx context.Context, nationalID, firstName, lastName, birthDate, gender, requestID, deviceKey string) (string, string, string, string, error) {
	birthDate = normalizePersonBirthDate(birthDate)
	gender = normalizePersonGender(gender)
	config, err := s.readPlatformIdentityConfig(ctx)
	if err != nil {
		return firstName, lastName, birthDate, gender, err
	}
	if !config.Enabled {
		return firstName, lastName, birthDate, gender, nil
	}
	if !s.allowIdentityDeviceVerification(ctx, config, deviceKey) {
		s.recordIdentityRateLimit()
		return firstName, lastName, birthDate, gender, nil
	}

	result, _, verifyErr := s.verifyIdentity(ctx, config, platformIdentityVerificationInput{
		SubjectType: "persona",
		Document:    onlyDigits(nationalID),
		Context:     "registro_cliente",
	}, requestID)
	if verifyErr != nil {
		var apiErr *identidad.APIError
		if errors.As(verifyErr, &apiErr) && identityErrorAllowsManualReview(apiErr) {
			return firstName, lastName, birthDate, gender, nil
		}
		return firstName, lastName, birthDate, gender, identityOwnerSaveError(verifyErr)
	}
	if !result.Valid || !result.Found || !result.CanRegister {
		message := strings.TrimSpace(result.Reason)
		if message == "" {
			message = "La cédula no pudo ser verificada para crear la cuenta"
		}
		return firstName, lastName, birthDate, gender, badRequest(message)
	}
	if result.Person == nil {
		return firstName, lastName, birthDate, gender, badRequest("No se encontraron los datos de la persona")
	}
	normalizeIdentityPersonResult(&result)
	if result.CanAutocomplete {
		if value := normalizePersonName(result.Person.FirstNames); value != "" {
			firstName = value
		}
		if value := normalizePersonName(result.Person.LastNames); value != "" {
			lastName = value
		}
		if value := normalizePersonBirthDate(result.Person.BirthDate); value != "" {
			birthDate = value
		}
		if value := normalizePersonGender(result.Person.Gender); value != "" {
			gender = value
		}
	}
	return firstName, lastName, birthDate, gender, nil
}

func (s *Server) verifyIdentity(ctx context.Context, config platformIdentityConfig, input platformIdentityVerificationInput, requestID string) (identidad.Result, identidad.Meta, error) {
	if !config.Enabled {
		return identidad.Result{}, identidad.Meta{}, &identidad.APIError{
			StatusCode: http.StatusServiceUnavailable,
			Code:       "IDENTITY_DISABLED",
			Message:    "La verificación de identidad está desactivada en WAMERCIO.",
		}
	}
	client, err := s.newPlatformIdentityClient(config)
	if err != nil {
		return identidad.Result{}, identidad.Meta{}, err
	}
	return client.Verify(ctx, identidad.Request{
		SubjectType: input.SubjectType,
		Document:    input.Document,
		Context:     input.Context,
	}, requestID)
}

func (s *Server) newPlatformIdentityClient(config platformIdentityConfig) (*identidad.Client, error) {
	config, err := normalizePlatformIdentityConfig(config)
	if err != nil {
		return nil, err
	}
	if !config.Enabled {
		return nil, &identidad.APIError{StatusCode: http.StatusServiceUnavailable, Code: "IDENTITY_DISABLED", Message: "La verificación de identidad está desactivada."}
	}
	httpClient := s.identityHTTPClient
	if httpClient == nil || config.TimeoutSeconds != int(s.cfg.IdentityAPITimeout/time.Second) {
		httpClient = newReusableHTTPClient(time.Duration(config.TimeoutSeconds) * time.Second)
	}
	client, err := identidad.New(config.BaseURL, config.APIKey, config.ClientID, s.cfg.AppDomain, httpClient)
	if err != nil {
		return nil, badRequest(err.Error())
	}
	return client, nil
}

func (s *Server) readPlatformIdentityConfig(ctx context.Context) (platformIdentityConfig, error) {
	fallbackTimeout := int(s.cfg.IdentityAPITimeout / time.Second)
	if fallbackTimeout <= 0 {
		fallbackTimeout = 12
	}
	fallback := platformIdentityConfig{
		Enabled:                  s.cfg.IdentityAPIEnabled,
		Required:                 s.cfg.IdentityAPIRequired,
		BaseURL:                  strings.TrimRight(strings.TrimSpace(s.cfg.IdentityAPIURL), "/"),
		APIKey:                   strings.TrimSpace(s.cfg.IdentityAPIKey),
		ClientID:                 strings.TrimSpace(s.cfg.IdentityAPIClientID),
		TimeoutSeconds:           fallbackTimeout,
		DeviceLimitEnabled:       true,
		DeviceLimitMax:           defaultIdentityDeviceLimitMax,
		DeviceLimitWindowMinutes: defaultIdentityDeviceLimitWindowMinutes,
	}
	if fallback.BaseURL == "" {
		fallback.BaseURL = "https://id.ltd.do"
	}
	if fallback.ClientID == "" {
		fallback.ClientID = "wamercio"
	}
	if s.tenantManager == nil {
		return normalizePlatformIdentityConfig(fallback)
	}
	raw, err := s.readPlatformSettingMap(ctx, platformIdentitySettingKey)
	if err != nil {
		return platformIdentityConfig{}, err
	}
	if len(raw) == 0 {
		return normalizePlatformIdentityConfig(fallback)
	}
	config := platformIdentityConfig{
		Enabled:                  boolSetting(raw, fallback.Enabled, "enabled"),
		Required:                 boolSetting(raw, fallback.Required, "required"),
		BaseURL:                  firstNonEmpty(stringSetting(raw, "base_url"), stringSetting(raw, "url"), fallback.BaseURL),
		APIKey:                   firstNonEmpty(stringSetting(raw, "api_key"), fallback.APIKey),
		ClientID:                 firstNonEmpty(stringSetting(raw, "client_id"), fallback.ClientID),
		TimeoutSeconds:           intSetting(raw, fallback.TimeoutSeconds, "timeout_seconds"),
		DeviceLimitEnabled:       boolSetting(raw, fallback.DeviceLimitEnabled, "device_limit_enabled"),
		DeviceLimitMax:           intSetting(raw, fallback.DeviceLimitMax, "device_limit_max"),
		DeviceLimitWindowMinutes: intSetting(raw, fallback.DeviceLimitWindowMinutes, "device_limit_window_minutes"),
	}
	return normalizePlatformIdentityConfig(config)
}

func normalizePlatformIdentityConfig(config platformIdentityConfig) (platformIdentityConfig, error) {
	config.BaseURL = normalizeIdentityBaseURL(config.BaseURL)
	config.APIKey = strings.TrimSpace(config.APIKey)
	config.ClientID = strings.TrimSpace(config.ClientID)
	if config.ClientID == "" {
		config.ClientID = "wamercio"
	}
	if config.TimeoutSeconds <= 0 {
		config.TimeoutSeconds = 12
	}
	if config.DeviceLimitMax <= 0 {
		config.DeviceLimitMax = defaultIdentityDeviceLimitMax
	}
	if config.DeviceLimitWindowMinutes <= 0 {
		config.DeviceLimitWindowMinutes = defaultIdentityDeviceLimitWindowMinutes
	}
	if config.TimeoutSeconds < 2 || config.TimeoutSeconds > 60 {
		return platformIdentityConfig{}, badRequest("El timeout de Identidad API debe estar entre 2 y 60 segundos")
	}
	if config.DeviceLimitMax < 1 || config.DeviceLimitMax > 500 {
		return platformIdentityConfig{}, badRequest("El límite por dispositivo debe estar entre 1 y 500 verificaciones")
	}
	if config.DeviceLimitWindowMinutes < 1 || config.DeviceLimitWindowMinutes > 1440 {
		return platformIdentityConfig{}, badRequest("La ventana del límite por dispositivo debe estar entre 1 y 1440 minutos")
	}
	if config.BaseURL == "" {
		return platformIdentityConfig{}, badRequest("Completa la URL de Identidad API")
	}
	parsed, err := url.Parse(config.BaseURL)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return platformIdentityConfig{}, badRequest("La URL de Identidad API debe ser una dirección HTTP o HTTPS válida")
	}
	if config.Enabled && config.APIKey == "" {
		return platformIdentityConfig{}, badRequest("Completa la API key de Identidad API antes de activar la integración")
	}
	return config, nil
}

func normalizeIdentityBaseURL(value string) string {
	clean := strings.TrimRight(strings.TrimSpace(value), "/")
	for _, suffix := range []string{"/api/v1/identidad/verificar", "/swagger-ui/index.html", "/swagger-ui", "/api-docs/openapi.json", "/openapi.json"} {
		if strings.HasSuffix(strings.ToLower(clean), suffix) {
			clean = strings.TrimRight(clean[:len(clean)-len(suffix)], "/")
			break
		}
	}
	return clean
}

func sanitizePlatformIdentityConfig(config platformIdentityConfig) map[string]any {
	return map[string]any{
		"enabled":                     config.Enabled,
		"required":                    config.Required,
		"base_url":                    config.BaseURL,
		"client_id":                   config.ClientID,
		"timeout_seconds":             config.TimeoutSeconds,
		"device_limit_enabled":        config.DeviceLimitEnabled,
		"device_limit_max":            config.DeviceLimitMax,
		"device_limit_window_minutes": config.DeviceLimitWindowMinutes,
		"api_key_configured":          config.APIKey != "",
		"ready":                       config.Enabled && config.BaseURL != "" && config.APIKey != "",
	}
}

func validatePlatformIdentityVerificationInput(input platformIdentityVerificationInput) error {
	if input.SubjectType != "persona" && input.SubjectType != "empresa" {
		return badRequest("El tipo de sujeto debe ser persona o empresa")
	}
	if _, allowed := allowedPlatformIdentityContexts[input.Context]; !allowed {
		return badRequest("El contexto de verificación no está permitido")
	}
	if input.SubjectType == "persona" && len(input.Document) != 11 {
		return badRequest("La cédula debe contener 11 dígitos")
	}
	if input.SubjectType == "empresa" && len(input.Document) != 9 && len(input.Document) != 11 {
		return badRequest("El RNC debe contener 9 u 11 dígitos")
	}
	return nil
}

func identityErrorAllowsManualReview(apiErr *identidad.APIError) bool {
	if apiErr == nil {
		return false
	}
	// Authentication, throttling, timeouts and upstream/server errors are
	// integration problems, not evidence that the supplied identity is invalid.
	// WAMERCIO therefore keeps the registration available in manual-review mode.
	switch apiErr.StatusCode {
	case http.StatusUnauthorized,
		http.StatusForbidden,
		http.StatusRequestTimeout,
		http.StatusTooManyRequests,
		http.StatusBadGateway,
		http.StatusServiceUnavailable,
		http.StatusGatewayTimeout:
		return true
	}
	if apiErr.StatusCode >= 500 {
		return true
	}
	switch strings.ToUpper(strings.TrimSpace(apiErr.Code)) {
	case "IDENTITY_DISABLED",
		"IDENTITY_SERVICE_UNAVAILABLE",
		"IDENTITY_INVALID_RESPONSE",
		"IDENTITY_RESPONSE_TOO_LARGE",
		"INVALID_API_KEY",
		"UNAUTHORIZED",
		"FORBIDDEN",
		"RATE_LIMITED",
		"TOO_MANY_REQUESTS":
		return true
	default:
		return false
	}
}

func writeIdentityAPIError(w http.ResponseWriter, err error) {
	var apiErr *identidad.APIError
	if !errors.As(err, &apiErr) {
		writeError(w, err)
		return
	}
	status := apiErr.StatusCode
	switch {
	case status == http.StatusUnauthorized || status == http.StatusForbidden:
		status = http.StatusBadGateway
	case status == http.StatusTooManyRequests:
		status = http.StatusTooManyRequests
	case status >= 400 && status < 500:
		status = http.StatusUnprocessableEntity
	case status < 400 || status > 599:
		status = http.StatusBadGateway
	}
	writeJSON(w, status, map[string]any{
		"success": false,
		"error": map[string]any{
			"code":       apiErr.Code,
			"message":    identityFriendlyError(apiErr),
			"request_id": apiErr.RequestID,
		},
	})
}

func identityFriendlyError(apiErr *identidad.APIError) string {
	if apiErr == nil {
		return "No se pudo verificar el documento."
	}
	switch apiErr.Code {
	case "IDENTITY_DISABLED":
		return "La verificación de identidad está desactivada."
	case "APPLICATION_DOMAIN_REQUIRED":
		return "Identidad API requiere identificar el dominio de WAMERCIO. Revisa APP_DOMAIN y vuelve a intentar."
	case "APPLICATION_DOMAIN_NOT_ALLOWED":
		return "El dominio configurado para WAMERCIO no está autorizado en esta API key."
	case "INVALID_API_KEY", "UNAUTHORIZED", "FORBIDDEN":
		return "La conexión con Identidad API no está autorizada. Revisa la API key."
	case "IDENTITY_SERVICE_UNAVAILABLE":
		return "Identidad API no está disponible temporalmente."
	}
	if strings.TrimSpace(apiErr.Message) != "" {
		return strings.TrimSpace(apiErr.Message)
	}
	return "No se pudo verificar el documento."
}

func maskIdentityDocument(document string) string {
	digits := onlyDigits(document)
	if len(digits) <= 4 {
		return strings.Repeat("*", len(digits))
	}
	return strings.Repeat("*", len(digits)-4) + digits[len(digits)-4:]
}

func intSetting(values map[string]any, fallback int, keys ...string) int {
	for _, key := range keys {
		switch value := values[key].(type) {
		case float64:
			return int(value)
		case int:
			return value
		case string:
			if parsed, err := time.ParseDuration(strings.TrimSpace(value)); err == nil {
				return int(parsed / time.Second)
			}
		}
	}
	return fallback
}

type platformOwnerIdentityVerification struct {
	VerifiedAt           *time.Time
	Status               string
	Source               string
	RequestID            string
	RequiresConfirmation bool
	ConfirmedByUser      bool
}

type platformUserIdentityInput struct {
	Name              string
	LastName          string
	NationalID        string
	IdentityConfirmed bool
}

func (s *Server) verifyPlatformUserIdentityForSave(ctx context.Context, input platformUserIdentityInput, requestID, deviceKey string) (platformUserIdentityInput, platformOwnerIdentityVerification, error) {
	input.Name = normalizePersonName(input.Name)
	input.LastName = normalizePersonName(input.LastName)
	input.NationalID = normalizeNationalID(input.NationalID)

	config, err := s.readPlatformIdentityConfig(ctx)
	if err != nil {
		return input, platformOwnerIdentityVerification{}, err
	}
	if input.NationalID == "" {
		return input, platformOwnerIdentityVerification{}, badRequest("La cédula del usuario SaaS es obligatoria para verificar su identidad")
	}
	if !validDominicanNationalID(input.NationalID) {
		return input, platformOwnerIdentityVerification{}, badRequest("Ingresa una cédula dominicana válida")
	}

	if !config.Enabled {
		return input, platformOwnerIdentityVerification{
			Status:          "pending_manual",
			ConfirmedByUser: input.IdentityConfirmed,
		}, nil
	}
	if !s.allowPlatformIdentityVerification(ctx) || !s.allowIdentityDeviceVerification(ctx, config, deviceKey) {
		s.recordIdentityRateLimit()
		return input, platformOwnerIdentityVerification{
			Status:          "pending_manual",
			ConfirmedByUser: input.IdentityConfirmed,
		}, nil
	}

	result, meta, verifyErr := s.verifyIdentity(ctx, config, platformIdentityVerificationInput{
		SubjectType: "persona",
		Document:    onlyDigits(input.NationalID),
		Context:     "registro_usuario_saas",
	}, requestID)
	if verifyErr != nil {
		var apiErr *identidad.APIError
		if errors.As(verifyErr, &apiErr) && identityErrorAllowsManualReview(apiErr) {
			return input, platformOwnerIdentityVerification{
				Status:          "pending_manual",
				RequestID:       apiErr.RequestID,
				ConfirmedByUser: input.IdentityConfirmed,
			}, nil
		}
		return input, platformOwnerIdentityVerification{}, identityOwnerSaveError(verifyErr)
	}
	if !result.Valid || !result.Found || !result.CanRegister {
		message := strings.TrimSpace(result.Reason)
		if message == "" {
			message = "La cédula no pudo ser validada para registrar al usuario SaaS"
		}
		return input, platformOwnerIdentityVerification{}, badRequest(message)
	}
	if result.Person == nil {
		return input, platformOwnerIdentityVerification{}, badRequest("Identidad API no devolvió los datos de la persona")
	}
	normalizeIdentityPersonResult(&result)
	if result.CanAutocomplete {
		if value := normalizePersonName(result.Person.FirstNames); value != "" {
			input.Name = value
		}
		if value := normalizePersonName(result.Person.LastNames); value != "" {
			input.LastName = value
		}
	}
	if result.RequiresConfirmation && !input.IdentityConfirmed {
		return input, platformOwnerIdentityVerification{}, badRequest("Confirma que el nombre devuelto por Identidad API corresponde al usuario SaaS")
	}
	now := s.now()
	return input, platformOwnerIdentityVerification{
		VerifiedAt:           &now,
		Status:               "verified",
		Source:               strings.TrimSpace(result.Source),
		RequestID:            strings.TrimSpace(meta.RequestID),
		RequiresConfirmation: result.RequiresConfirmation,
		ConfirmedByUser:      input.IdentityConfirmed || !result.RequiresConfirmation,
	}, nil
}

func (s *Server) verifyPlatformOwnerIdentityForSave(ctx context.Context, input platformOwnerInput, requestID, deviceKey string) (platformOwnerInput, platformOwnerIdentityVerification, error) {
	input.NationalID = normalizeNationalID(input.NationalID)
	config, err := s.readPlatformIdentityConfig(ctx)
	if err != nil {
		return input, platformOwnerIdentityVerification{}, err
	}
	if input.NationalID == "" {
		if config.Required {
			return input, platformOwnerIdentityVerification{}, badRequest("La cédula del propietario es obligatoria para verificar su identidad")
		}
		return input, platformOwnerIdentityVerification{Status: "unverified"}, nil
	}
	if !validDominicanNationalID(input.NationalID) {
		return input, platformOwnerIdentityVerification{}, badRequest("Ingresa una cédula dominicana válida")
	}

	if !config.Enabled {
		return input, platformOwnerIdentityVerification{
			Status:          "pending_manual",
			ConfirmedByUser: input.IdentityConfirmed,
		}, nil
	}
	if !s.allowPlatformIdentityVerification(ctx) || !s.allowIdentityDeviceVerification(ctx, config, deviceKey) {
		s.recordIdentityRateLimit()
		return input, platformOwnerIdentityVerification{
			Status:          "pending_manual",
			ConfirmedByUser: input.IdentityConfirmed,
		}, nil
	}

	result, meta, verifyErr := s.verifyIdentity(ctx, config, platformIdentityVerificationInput{
		SubjectType: "persona",
		Document:    onlyDigits(input.NationalID),
		Context:     "registro_propietario",
	}, requestID)
	if verifyErr != nil {
		var apiErr *identidad.APIError
		if errors.As(verifyErr, &apiErr) && identityErrorAllowsManualReview(apiErr) {
			return input, platformOwnerIdentityVerification{
				Status:          "pending_manual",
				RequestID:       apiErr.RequestID,
				ConfirmedByUser: input.IdentityConfirmed,
			}, nil
		}
		return input, platformOwnerIdentityVerification{}, identityOwnerSaveError(verifyErr)
	}
	if !result.Valid || !result.Found || !result.CanRegister {
		message := strings.TrimSpace(result.Reason)
		if message == "" {
			message = "La cédula no pudo ser validada para registrar al propietario"
		}
		return input, platformOwnerIdentityVerification{}, badRequest(message)
	}
	if result.Person == nil {
		return input, platformOwnerIdentityVerification{}, badRequest("Identidad API no devolvió los datos de la persona")
	}
	if result.CanAutocomplete {
		if value := normalizePersonName(result.Person.FirstNames); value != "" {
			input.FirstName = value
		}
		if value := normalizePersonName(result.Person.LastNames); value != "" {
			input.LastName = value
		}
		if value := normalizePersonName(result.Person.FullName); value != "" {
			input.Name = value
		} else {
			input.Name = normalizePersonName(strings.Join([]string{input.FirstName, input.LastName}, " "))
		}
		if value := normalizePersonBirthDate(result.Person.BirthDate); value != "" {
			input.BirthDate = value
		}
		if value := normalizePersonGender(result.Person.Gender); value != "" {
			input.Gender = value
		}
	}
	input = normalizeOwnerInput(input)
	if result.RequiresConfirmation && !input.IdentityConfirmed {
		return input, platformOwnerIdentityVerification{}, badRequest("Confirma que el nombre devuelto por Identidad API corresponde al propietario")
	}
	now := s.now()
	return input, platformOwnerIdentityVerification{
		VerifiedAt:           &now,
		Status:               "verified",
		Source:               strings.TrimSpace(result.Source),
		RequestID:            strings.TrimSpace(meta.RequestID),
		RequiresConfirmation: result.RequiresConfirmation,
		ConfirmedByUser:      input.IdentityConfirmed || !result.RequiresConfirmation,
	}, nil
}

func markTenantBusinessIdentityUnverified(input tenancy.TenantProvisionInput) tenancy.TenantProvisionInput {
	input.IdentityStatus = "unverified"
	input.IdentitySource = ""
	input.IdentityRequestID = ""
	input.IdentityVerifiedAt = ""
	input.IdentityConfirmed = false
	return input
}

func (s *Server) verifyTenantBusinessIdentityForSave(ctx context.Context, input tenancy.TenantProvisionInput, requestID, deviceKey string) (tenancy.TenantProvisionInput, error) {
	input.RNC = onlyDigits(input.RNC)
	input.LegalName = strings.TrimSpace(input.LegalName)
	input.CommercialName = strings.TrimSpace(input.CommercialName)

	if input.RNC == "" {
		// El RNC es un dato fiscal opcional para el alta del negocio. La política
		// "required" solo exige una respuesta válida de Identidad API cuando el
		// usuario decide suministrar un documento. Por eso el alta sin RNC tampoco
		// depende de que la integración de identidad esté configurada o disponible.
		return markTenantBusinessIdentityUnverified(input), nil
	}

	config, err := s.readPlatformIdentityConfig(ctx)
	if err != nil {
		return input, err
	}
	if len(input.RNC) != 9 && len(input.RNC) != 11 {
		return input, badRequest("El RNC debe contener 9 u 11 dígitos")
	}
	if !config.Enabled {
		input.IdentityStatus = "pending_manual"
		input.IdentitySource = ""
		input.IdentityRequestID = ""
		input.IdentityVerifiedAt = ""
		return input, nil
	}
	if !s.allowPlatformIdentityVerification(ctx) || !s.allowIdentityDeviceVerification(ctx, config, deviceKey) {
		s.recordIdentityRateLimit()
		input.IdentityStatus = "pending_manual"
		input.IdentitySource = ""
		input.IdentityRequestID = ""
		input.IdentityVerifiedAt = ""
		return input, nil
	}

	result, meta, verifyErr := s.verifyIdentity(ctx, config, platformIdentityVerificationInput{
		SubjectType: "empresa",
		Document:    input.RNC,
		Context:     "registro_negocio",
	}, requestID)
	if verifyErr != nil {
		var apiErr *identidad.APIError
		if errors.As(verifyErr, &apiErr) && identityErrorAllowsManualReview(apiErr) {
			input.IdentityStatus = "pending_manual"
			input.IdentityRequestID = strings.TrimSpace(apiErr.RequestID)
			return input, nil
		}
		return input, identityOwnerSaveError(verifyErr)
	}
	if !result.Valid || !result.Found || !result.CanRegister {
		message := strings.TrimSpace(result.Reason)
		if message == "" {
			message = "El RNC no cumple las condiciones para registrar el negocio"
		}
		return input, badRequest(message)
	}
	if result.Company == nil {
		return input, badRequest("Identidad API no devolvió los datos de la empresa")
	}
	if result.CanAutocomplete {
		if value := strings.TrimSpace(result.Company.LegalName); value != "" {
			input.LegalName = value
		}
		if value := strings.TrimSpace(result.Company.CommercialName); value != "" {
			input.CommercialName = value
			if strings.TrimSpace(input.BusinessName) == "" {
				input.BusinessName = value
			}
		}
	}
	if result.RequiresConfirmation && !input.IdentityConfirmed {
		return input, badRequest("Confirma que la razón social devuelta por Identidad API corresponde al negocio")
	}
	input.IdentityStatus = "verified"
	input.IdentitySource = strings.TrimSpace(result.Source)
	input.IdentityRequestID = strings.TrimSpace(meta.RequestID)
	input.IdentityVerifiedAt = time.Now().UTC().Format(time.RFC3339)
	input.IdentityConfirmed = input.IdentityConfirmed || !result.RequiresConfirmation
	return input, nil
}

func identityOwnerSaveError(err error) error {
	var apiErr *identidad.APIError
	if !errors.As(err, &apiErr) {
		return err
	}
	if identityErrorAllowsManualReview(apiErr) {
		return apiError{status: http.StatusServiceUnavailable, msg: identityFriendlyError(apiErr)}
	}
	return badRequest(identityFriendlyError(apiErr))
}
