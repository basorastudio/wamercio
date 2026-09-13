package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"
)

const platformAccessPolicySettingKey = "access_policy"
const defaultAdminAccessPINLength = 6
const defaultAccessPINLength = defaultAdminAccessPINLength // legacy administration alias
const defaultCustomerAccessPINLength = 4
const legacyAccessPINLength = 4
const minAccessPINLength = 4
const maxAccessPINLength = 8
const recoveryCodeLength = 6
const recoveryMethodOTP = "otp"
const recoveryMethodLink = "link"
const defaultRecoveryCTAHeader = "Recuperar acceso"
const defaultRecoveryCTABody = "Pulsa el botón para crear un nuevo PIN de acceso a WAMERCIO."
const defaultRecoveryCTAFooter = "Enlace seguro de un solo uso. Vence en {minutos} minutos."
const defaultRecoveryCTAButton = "Recuperar acceso"

// accessPolicyConfig stores two independent PIN policies:
//   - AdminPINLength: owners, platform users, administrators, cashiers and delivery drivers.
//   - CustomerPINLength: storefront customers.
//
// PINLength and LegacyPINLengths are retained only to migrate installations created before
// the policy was split. New writes use the explicit admin/customer fields.
type accessPolicyConfig struct {
	PINLength                int    `json:"pin_length,omitempty"`
	LegacyPINLengths         []int  `json:"legacy_pin_lengths,omitempty"`
	AdminPINLength           int    `json:"admin_pin_length"`
	CustomerPINLength        int    `json:"customer_pin_length"`
	LegacyAdminPINLengths    []int  `json:"legacy_admin_pin_lengths,omitempty"`
	LegacyCustomerPINLengths []int  `json:"legacy_customer_pin_lengths,omitempty"`
	RecoveryEnabled          bool   `json:"recovery_enabled"`
	RecoveryMethod           string `json:"recovery_method"`
	RecoveryTTLMinutes       int    `json:"recovery_ttl_minutes"`
	RecoveryMaxAttempts      int    `json:"recovery_max_attempts"`
	RecoveryCTAHeader        string `json:"recovery_cta_header,omitempty"`
	RecoveryCTABody          string `json:"recovery_cta_body,omitempty"`
	RecoveryCTAFooter        string `json:"recovery_cta_footer,omitempty"`
	RecoveryCTAButtonLabel   string `json:"recovery_cta_button_label,omitempty"`
	RecoveryCTAImageURL      string `json:"recovery_cta_image_url,omitempty"`
}

func defaultAccessPolicy() accessPolicyConfig {
	return accessPolicyConfig{
		AdminPINLength:           defaultAdminAccessPINLength,
		CustomerPINLength:        defaultCustomerAccessPINLength,
		LegacyAdminPINLengths:    []int{legacyAccessPINLength},
		LegacyCustomerPINLengths: []int{defaultAdminAccessPINLength},
		RecoveryEnabled:          true,
		RecoveryMethod:           recoveryMethodOTP,
		RecoveryTTLMinutes:       10,
		RecoveryMaxAttempts:      5,
		RecoveryCTAHeader:        defaultRecoveryCTAHeader,
		RecoveryCTABody:          defaultRecoveryCTABody,
		RecoveryCTAFooter:        defaultRecoveryCTAFooter,
		RecoveryCTAButtonLabel:   defaultRecoveryCTAButton,
	}
}

func validConfiguredPINLength(length int) bool {
	return length >= minAccessPINLength && length <= maxAccessPINLength
}

func normalizeLegacyPINLengths(current int, values ...[]int) []int {
	seen := map[int]bool{current: true}
	legacy := make([]int, 0)
	for _, group := range values {
		for _, length := range group {
			if !validConfiguredPINLength(length) || seen[length] {
				continue
			}
			seen[length] = true
			legacy = append(legacy, length)
		}
	}
	sort.Ints(legacy)
	return legacy
}

func normalizeAccessPolicy(policy accessPolicyConfig) accessPolicyConfig {
	defaults := defaultAccessPolicy()
	legacyGlobalLength := policy.PINLength

	// Upgrade an old single-PIN policy without locking out existing accounts.
	// Administration preserves the previous configured length. Customers move to the
	// shorter customer default for new PINs while the previous length remains accepted.
	if !validConfiguredPINLength(policy.AdminPINLength) {
		if validConfiguredPINLength(legacyGlobalLength) {
			policy.AdminPINLength = legacyGlobalLength
		} else {
			policy.AdminPINLength = defaults.AdminPINLength
		}
	}
	if !validConfiguredPINLength(policy.CustomerPINLength) {
		policy.CustomerPINLength = defaults.CustomerPINLength
	}

	policy.LegacyAdminPINLengths = normalizeLegacyPINLengths(
		policy.AdminPINLength,
		policy.LegacyAdminPINLengths,
		policy.LegacyPINLengths,
	)
	customerLegacy := append([]int{}, policy.LegacyCustomerPINLengths...)
	customerLegacy = append(customerLegacy, policy.LegacyPINLengths...)
	if validConfiguredPINLength(legacyGlobalLength) && legacyGlobalLength != policy.CustomerPINLength {
		customerLegacy = append(customerLegacy, legacyGlobalLength)
	}
	// Six digits were the historical platform-wide default; preserve customer accounts
	// created before the split while new customer PINs default to four digits.
	if defaultAdminAccessPINLength != policy.CustomerPINLength {
		customerLegacy = append(customerLegacy, defaultAdminAccessPINLength)
	}
	policy.LegacyCustomerPINLengths = normalizeLegacyPINLengths(policy.CustomerPINLength, customerLegacy)

	// Old fields are no longer persisted on subsequent saves.
	policy.PINLength = 0
	policy.LegacyPINLengths = nil

	if policy.RecoveryTTLMinutes < 3 || policy.RecoveryTTLMinutes > 60 {
		policy.RecoveryTTLMinutes = defaults.RecoveryTTLMinutes
	}
	if policy.RecoveryMaxAttempts < 3 || policy.RecoveryMaxAttempts > 10 {
		policy.RecoveryMaxAttempts = defaults.RecoveryMaxAttempts
	}
	policy.RecoveryMethod = strings.ToLower(strings.TrimSpace(policy.RecoveryMethod))
	if policy.RecoveryMethod != recoveryMethodOTP && policy.RecoveryMethod != recoveryMethodLink {
		policy.RecoveryMethod = defaults.RecoveryMethod
	}
	policy.RecoveryCTAHeader = strings.TrimSpace(policy.RecoveryCTAHeader)
	if policy.RecoveryCTAHeader == "" {
		policy.RecoveryCTAHeader = defaults.RecoveryCTAHeader
	}
	policy.RecoveryCTABody = strings.TrimSpace(policy.RecoveryCTABody)
	if policy.RecoveryCTABody == "" {
		policy.RecoveryCTABody = defaults.RecoveryCTABody
	}
	policy.RecoveryCTAFooter = strings.TrimSpace(policy.RecoveryCTAFooter)
	if policy.RecoveryCTAFooter == "" {
		policy.RecoveryCTAFooter = defaults.RecoveryCTAFooter
	}
	policy.RecoveryCTAButtonLabel = strings.TrimSpace(policy.RecoveryCTAButtonLabel)
	if policy.RecoveryCTAButtonLabel == "" {
		policy.RecoveryCTAButtonLabel = defaults.RecoveryCTAButtonLabel
	}
	policy.RecoveryCTAImageURL = strings.TrimSpace(policy.RecoveryCTAImageURL)
	return policy
}

func (s *Server) accessPolicy(ctx context.Context) accessPolicyConfig {
	policy := defaultAccessPolicy()
	var raw []byte
	err := s.platformDB().QueryRow(ctx, `SELECT value FROM platform_settings WHERE key=$1`, platformAccessPolicySettingKey).Scan(&raw)
	if err != nil {
		return normalizeAccessPolicy(policy)
	}
	if json.Unmarshal(raw, &policy) != nil {
		return normalizeAccessPolicy(defaultAccessPolicy())
	}
	return normalizeAccessPolicy(policy)
}

func acceptedPINLengths(current int, legacy []int) []int {
	accepted := append([]int{current}, legacy...)
	sort.Ints(accepted)
	return uniqueInts(accepted)
}

func accessPolicyPublicPayload(policy accessPolicyConfig) map[string]any {
	adminAccepted := acceptedPINLengths(policy.AdminPINLength, policy.LegacyAdminPINLengths)
	customerAccepted := acceptedPINLengths(policy.CustomerPINLength, policy.LegacyCustomerPINLengths)
	return map[string]any{
		// Explicit split policy.
		"admin_pin_length":              policy.AdminPINLength,
		"customer_pin_length":           policy.CustomerPINLength,
		"accepted_admin_pin_lengths":    adminAccepted,
		"accepted_customer_pin_lengths": customerAccepted,
		// Backward-compatible aliases for older frontends. They represent administration.
		"pin_length":                policy.AdminPINLength,
		"accepted_pin_lengths":      adminAccepted,
		"recovery_enabled":          policy.RecoveryEnabled,
		"recovery_method":           policy.RecoveryMethod,
		"recovery_code_length":      recoveryCodeLength,
		"recovery_ttl_minutes":      policy.RecoveryTTLMinutes,
		"recovery_max_attempts":     policy.RecoveryMaxAttempts,
		"recovery_cta_header":       policy.RecoveryCTAHeader,
		"recovery_cta_body":         policy.RecoveryCTABody,
		"recovery_cta_footer":       policy.RecoveryCTAFooter,
		"recovery_cta_button_label": policy.RecoveryCTAButtonLabel,
		"recovery_cta_image_url":    policy.RecoveryCTAImageURL,
	}
}

func uniqueInts(values []int) []int {
	if len(values) == 0 {
		return values
	}
	out := make([]int, 0, len(values))
	last := -1
	for _, value := range values {
		if value == last {
			continue
		}
		out = append(out, value)
		last = value
	}
	return out
}

func (s *Server) publicAccessPolicy(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, accessPolicyPublicPayload(s.accessPolicy(r.Context())))
}

func (s *Server) platformAccessPolicy(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, accessPolicyPublicPayload(s.accessPolicy(r.Context())))
}

func (s *Server) updatePlatformAccessPolicy(w http.ResponseWriter, r *http.Request) {
	current := s.accessPolicy(r.Context())
	var input struct {
		PINLength              *int    `json:"pin_length"`
		AdminPINLength         *int    `json:"admin_pin_length"`
		CustomerPINLength      *int    `json:"customer_pin_length"`
		RecoveryEnabled        *bool   `json:"recovery_enabled"`
		RecoveryMethod         *string `json:"recovery_method"`
		RecoveryTTLMinutes     *int    `json:"recovery_ttl_minutes"`
		RecoveryMaxAttempts    *int    `json:"recovery_max_attempts"`
		RecoveryCTAHeader      *string `json:"recovery_cta_header"`
		RecoveryCTABody        *string `json:"recovery_cta_body"`
		RecoveryCTAFooter      *string `json:"recovery_cta_footer"`
		RecoveryCTAButtonLabel *string `json:"recovery_cta_button_label"`
		RecoveryCTAImageURL    *string `json:"recovery_cta_image_url"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}

	next := current
	// pin_length remains accepted as an administration-only compatibility alias.
	requestedAdminLength := input.AdminPINLength
	if requestedAdminLength == nil {
		requestedAdminLength = input.PINLength
	}
	if requestedAdminLength != nil {
		if !validConfiguredPINLength(*requestedAdminLength) {
			writeError(w, badRequest(fmt.Sprintf("La longitud del PIN administrativo debe estar entre %d y %d dígitos", minAccessPINLength, maxAccessPINLength)))
			return
		}
		if *requestedAdminLength != current.AdminPINLength {
			next.LegacyAdminPINLengths = append(next.LegacyAdminPINLengths, current.AdminPINLength)
			next.AdminPINLength = *requestedAdminLength
		}
	}
	if input.CustomerPINLength != nil {
		if !validConfiguredPINLength(*input.CustomerPINLength) {
			writeError(w, badRequest(fmt.Sprintf("La longitud del PIN de cliente debe estar entre %d y %d dígitos", minAccessPINLength, maxAccessPINLength)))
			return
		}
		if *input.CustomerPINLength != current.CustomerPINLength {
			next.LegacyCustomerPINLengths = append(next.LegacyCustomerPINLengths, current.CustomerPINLength)
			next.CustomerPINLength = *input.CustomerPINLength
		}
	}
	if input.RecoveryEnabled != nil {
		next.RecoveryEnabled = *input.RecoveryEnabled
	}
	if input.RecoveryMethod != nil {
		method := strings.ToLower(strings.TrimSpace(*input.RecoveryMethod))
		if method != recoveryMethodOTP && method != recoveryMethodLink {
			writeError(w, badRequest("El método de recuperación no es válido"))
			return
		}
		next.RecoveryMethod = method
	}
	if input.RecoveryTTLMinutes != nil {
		if *input.RecoveryTTLMinutes < 3 || *input.RecoveryTTLMinutes > 60 {
			writeError(w, badRequest("La vigencia de la recuperación debe estar entre 3 y 60 minutos"))
			return
		}
		next.RecoveryTTLMinutes = *input.RecoveryTTLMinutes
	}
	if input.RecoveryMaxAttempts != nil {
		if *input.RecoveryMaxAttempts < 3 || *input.RecoveryMaxAttempts > 10 {
			writeError(w, badRequest("Los intentos máximos deben estar entre 3 y 10"))
			return
		}
		next.RecoveryMaxAttempts = *input.RecoveryMaxAttempts
	}
	if input.RecoveryCTAHeader != nil {
		next.RecoveryCTAHeader = truncateText(strings.TrimSpace(*input.RecoveryCTAHeader), 80)
	}
	if input.RecoveryCTABody != nil {
		next.RecoveryCTABody = truncateText(strings.TrimSpace(*input.RecoveryCTABody), 500)
	}
	if input.RecoveryCTAFooter != nil {
		next.RecoveryCTAFooter = truncateText(strings.TrimSpace(*input.RecoveryCTAFooter), 160)
	}
	if input.RecoveryCTAButtonLabel != nil {
		next.RecoveryCTAButtonLabel = truncateText(strings.TrimSpace(*input.RecoveryCTAButtonLabel), 30)
	}
	if input.RecoveryCTAImageURL != nil {
		imageURL := strings.TrimSpace(*input.RecoveryCTAImageURL)
		if imageURL != "" && !strings.HasPrefix(strings.ToLower(imageURL), "https://") {
			writeError(w, badRequest("La imagen del CTA debe utilizar una URL HTTPS pública"))
			return
		}
		next.RecoveryCTAImageURL = imageURL
	}
	next = normalizeAccessPolicy(next)

	raw, err := json.Marshal(next)
	if err != nil {
		writeError(w, err)
		return
	}
	_, err = s.platformDB().Exec(r.Context(), `
		INSERT INTO platform_settings (key,value,updated_at)
		VALUES ($1,$2::jsonb,now())
		ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()
	`, platformAccessPolicySettingKey, raw)
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), s.platformActor(r), "", "platform.access_policy.update", map[string]any{
		"admin_pin_length":      next.AdminPINLength,
		"customer_pin_length":   next.CustomerPINLength,
		"recovery_enabled":      next.RecoveryEnabled,
		"recovery_method":       next.RecoveryMethod,
		"recovery_ttl_minutes":  next.RecoveryTTLMinutes,
		"recovery_max_attempts": next.RecoveryMaxAttempts,
	})
	writeJSON(w, http.StatusOK, accessPolicyPublicPayload(next))
}

func isSupportedPINLength(pin string, current int, legacy []int) bool {
	pin = strings.TrimSpace(pin)
	if onlyDigits(pin) != pin {
		return false
	}
	if len(pin) == current {
		return true
	}
	for _, length := range legacy {
		if len(pin) == length {
			return true
		}
	}
	return false
}

func (s *Server) validNewAdminAccessPIN(ctx context.Context, pin string) bool {
	return isValidAccessPINLength(pin, s.accessPolicy(ctx).AdminPINLength)
}

func (s *Server) validNewCustomerAccessPIN(ctx context.Context, pin string) bool {
	return isValidAccessPINLength(pin, s.accessPolicy(ctx).CustomerPINLength)
}

func (s *Server) supportedAdminAccessPIN(ctx context.Context, pin string) bool {
	policy := s.accessPolicy(ctx)
	return isSupportedPINLength(pin, policy.AdminPINLength, policy.LegacyAdminPINLengths)
}

func (s *Server) supportedCustomerAccessPIN(ctx context.Context, pin string) bool {
	policy := s.accessPolicy(ctx)
	return isSupportedPINLength(pin, policy.CustomerPINLength, policy.LegacyCustomerPINLengths)
}

func (s *Server) validateNewAdminAccessPIN(ctx context.Context, pin string) error {
	return validateAccessSecretLength(pin, s.accessPolicy(ctx).AdminPINLength)
}

func (s *Server) validateNewCustomerAccessPIN(ctx context.Context, pin string) error {
	return validateAccessSecretLength(pin, s.accessPolicy(ctx).CustomerPINLength)
}

func (s *Server) adminAccessPINLength(ctx context.Context) int {
	return s.accessPolicy(ctx).AdminPINLength
}

func (s *Server) customerAccessPINLength(ctx context.Context) int {
	return s.accessPolicy(ctx).CustomerPINLength
}

// Compatibility aliases for administration paths that predate the split.
func (s *Server) validNewAccessPIN(ctx context.Context, pin string) bool {
	return s.validNewAdminAccessPIN(ctx, pin)
}

func (s *Server) supportedAccessPIN(ctx context.Context, pin string) bool {
	return s.supportedAdminAccessPIN(ctx, pin)
}

func (s *Server) validateNewAccessPIN(ctx context.Context, pin string) error {
	return s.validateNewAdminAccessPIN(ctx, pin)
}

func (s *Server) accessPINLength(ctx context.Context) int {
	return s.adminAccessPINLength(ctx)
}

func isValidAccessPINLength(pin string, length int) bool {
	pin = strings.TrimSpace(pin)
	return len(pin) == length && onlyDigits(pin) == pin
}

func accessPINLengthMessage(length int) string {
	return fmt.Sprintf("El PIN debe tener %d dígitos", length)
}

func (s *Server) recoveryExpiration(ctx context.Context) time.Duration {
	return time.Duration(s.accessPolicy(ctx).RecoveryTTLMinutes) * time.Minute
}

func (s *Server) recoveryEnabled(ctx context.Context) bool {
	return s.accessPolicy(ctx).RecoveryEnabled
}
