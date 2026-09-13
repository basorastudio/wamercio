package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"wamercio/backend/internal/platform/tenancy"
)

func TestNormalizeIdentityBaseURL(t *testing.T) {
	got := normalizeIdentityBaseURL("https://id.ltd.do/api/v1/identidad/verificar")
	if got != "https://id.ltd.do" {
		t.Fatalf("normalizeIdentityBaseURL() = %q", got)
	}
}

func TestValidatePlatformIdentityVerificationInput(t *testing.T) {
	if err := validatePlatformIdentityVerificationInput(platformIdentityVerificationInput{
		SubjectType: "persona",
		Document:    "00100000001",
		Context:     "registro_propietario",
	}); err != nil {
		t.Fatalf("valid input failed: %v", err)
	}
	if err := validatePlatformIdentityVerificationInput(platformIdentityVerificationInput{
		SubjectType: "persona",
		Document:    "00100000001",
		Context:     "registro_usuario_saas",
	}); err != nil {
		t.Fatalf("valid SaaS user context failed: %v", err)
	}
	if err := validatePlatformIdentityVerificationInput(platformIdentityVerificationInput{
		SubjectType: "persona",
		Document:    "001",
		Context:     "registro_propietario",
	}); err == nil {
		t.Fatal("expected invalid document error")
	}
	if err := validatePlatformIdentityVerificationInput(platformIdentityVerificationInput{
		SubjectType: "persona",
		Document:    "00100000001",
		Context:     "contexto_arbitrario",
	}); err == nil {
		t.Fatal("expected invalid context error")
	}
}

func TestValidatePlatformIdentityCompanyInput(t *testing.T) {
	if err := validatePlatformIdentityVerificationInput(platformIdentityVerificationInput{
		SubjectType: "empresa",
		Document:    "101000001",
		Context:     "registro_negocio",
	}); err != nil {
		t.Fatalf("valid company input failed: %v", err)
	}
}

func TestIdentityVerifyUsesDedicatedPermissionMiddleware(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/platform/identity/verify", nil)
	if permission := platformPermissionForRequest(req); permission != "" {
		t.Fatalf("identity verification permission = %q, want dedicated middleware", permission)
	}
	req = httptest.NewRequest(http.MethodPatch, "/api/platform/identity/configure", nil)
	if permission := platformPermissionForRequest(req); permission != platformPermissionSettings {
		t.Fatalf("identity configure permission = %q, want %q", permission, platformPermissionSettings)
	}
}

func TestSanitizePlatformIdentityConfigHidesAPIKey(t *testing.T) {
	payload := sanitizePlatformIdentityConfig(platformIdentityConfig{
		Enabled:        true,
		BaseURL:        "https://id.ltd.do",
		APIKey:         "secret",
		ClientID:       "wamercio",
		TimeoutSeconds: 12,
	})
	if _, exposed := payload["api_key"]; exposed {
		t.Fatal("sanitized identity config exposed api_key")
	}
	if configured, _ := payload["api_key_configured"].(bool); !configured {
		t.Fatal("sanitized identity config should report a configured key")
	}
}

func TestMarkTenantBusinessIdentityUnverifiedClearsFiscalVerification(t *testing.T) {
	input := tenancy.TenantProvisionInput{
		RNC:                "",
		IdentityStatus:     "verified",
		IdentitySource:     "dgii",
		IdentityRequestID:  "request-123",
		IdentityVerifiedAt: "2026-08-04T12:00:00Z",
		IdentityConfirmed:  true,
	}

	got := markTenantBusinessIdentityUnverified(input)
	if got.IdentityStatus != "unverified" {
		t.Fatalf("IdentityStatus = %q, want unverified", got.IdentityStatus)
	}
	if got.IdentitySource != "" || got.IdentityRequestID != "" || got.IdentityVerifiedAt != "" {
		t.Fatal("optional RNC should not keep stale verification metadata")
	}
	if got.IdentityConfirmed {
		t.Fatal("optional RNC should not remain confirmed")
	}
}
