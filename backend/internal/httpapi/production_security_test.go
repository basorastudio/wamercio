package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"colmapro/backend/internal/config"
)

func TestAccessSecretHashAndLegacyUpgrade(t *testing.T) {
	t.Parallel()

	hash, err := hashAccessSecret("864209")
	if err != nil {
		t.Fatalf("hashAccessSecret returned an error: %v", err)
	}
	if strings.EqualFold(hash, sha256Hex("864209")) {
		t.Fatal("new credentials must not use the legacy SHA-256 representation")
	}
	valid, upgrade := verifyAccessSecret(hash, "864209")
	if !valid || upgrade {
		t.Fatalf("bcrypt credential verification = (%v, %v), want (true, false)", valid, upgrade)
	}
	if valid, _ := verifyAccessSecret(hash, "864208"); valid {
		t.Fatal("an incorrect PIN was accepted")
	}

	legacy := sha256Hex("1234")
	valid, upgrade = verifyAccessSecret(legacy, "1234")
	if !valid || !upgrade {
		t.Fatalf("legacy credential verification = (%v, %v), want (true, true)", valid, upgrade)
	}
}

func TestOfflinePaymentMethodValidation(t *testing.T) {
	t.Parallel()

	for _, method := range []string{"cash", "bank_transfer", "card", "store_credit"} {
		got, err := validateOfflinePaymentMethod(method)
		if err != nil || got != method {
			t.Fatalf("validateOfflinePaymentMethod(%q) = (%q, %v)", method, got, err)
		}
	}
	for _, method := range []string{"paypal", "stripe", "azul_online", "crypto", ""} {
		if _, err := validateOfflinePaymentMethod(method); err == nil {
			t.Fatalf("electronic or invalid method %q was accepted", method)
		}
	}
}

func TestNormalizedStaffPermissionsRespectExplicitDenials(t *testing.T) {
	t.Parallel()

	raw := map[string]any{
		permissionSalesView:     true,
		permissionSalesCreate:   false,
		permissionCustomersView: false,
		"unknown.permission":    true,
	}
	encoded := normalizedStaffPermissionsJSON("cashier", raw)
	var permissions map[string]bool
	if err := json.Unmarshal([]byte(encoded), &permissions); err != nil {
		t.Fatalf("permissions are not valid JSON: %v", err)
	}
	if !permissions[permissionSalesView] || permissions[permissionSalesCreate] || permissions[permissionCustomersView] {
		t.Fatalf("explicit permissions were not preserved: %#v", permissions)
	}
	if _, exists := permissions["unknown.permission"]; exists {
		t.Fatalf("unknown permission was persisted: %#v", permissions)
	}
}

func TestAdministratorAlwaysReceivesAllBusinessPermissions(t *testing.T) {
	t.Parallel()

	encoded := normalizedStaffPermissionsJSON("administrator", map[string]bool{permissionCashManage: false})
	var permissions map[string]bool
	if err := json.Unmarshal([]byte(encoded), &permissions); err != nil {
		t.Fatal(err)
	}
	for _, permission := range staffPermissionKeys {
		if !permissions[permission] {
			t.Fatalf("administrator is missing %q", permission)
		}
	}
}

func TestSecurityHeaders(t *testing.T) {
	t.Parallel()

	server := &Server{}
	handler := server.securityHeaders(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	request := httptest.NewRequest(http.MethodGet, "/api/bootstrap", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	for header := range map[string]struct{}{
		"Content-Security-Policy": {},
		"X-Content-Type-Options":  {},
		"X-Frame-Options":         {},
		"Referrer-Policy":         {},
		"Permissions-Policy":      {},
		"Cache-Control":           {},
	} {
		if strings.TrimSpace(response.Header().Get(header)) == "" {
			t.Fatalf("security header %s is missing", header)
		}
	}
}

func TestCustomerSearchDoesNotTurnAlphabeticInputIntoWildcardDigits(t *testing.T) {
	t.Parallel()

	if got := onlyDigits("María Pérez"); got != "" {
		t.Fatalf("onlyDigits alphabetic search = %q, want empty", got)
	}
}

func TestProductionContentSecurityPolicyDisablesUnsafeEval(t *testing.T) {
	t.Parallel()

	server := &Server{cfg: config.Config{AppEnv: "production"}}
	handler := server.securityHeaders(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	request := httptest.NewRequest(http.MethodGet, "/api/bootstrap", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	policy := response.Header().Get("Content-Security-Policy")
	if strings.Contains(policy, "'unsafe-eval'") {
		t.Fatalf("production CSP contains unsafe-eval: %s", policy)
	}
	if response.Header().Get("Strict-Transport-Security") == "" {
		t.Fatal("production responses must include HSTS")
	}
}

func TestAdminSessionCookieIsSecureAndScopedToAPI(t *testing.T) {
	t.Parallel()

	server := &Server{cfg: config.Config{AppEnv: "production"}}
	response := httptest.NewRecorder()
	server.setSessionCookie(response, adminSessionCookie, "delegated-session", 12*time.Hour)

	cookies := response.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("admin session cookies = %d, want 1", len(cookies))
	}
	cookie := cookies[0]
	if cookie.Name != adminSessionCookie || cookie.Value != "delegated-session" {
		t.Fatalf("unexpected admin session cookie: %#v", cookie)
	}
	if cookie.Path != "/api" || !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteLaxMode {
		t.Fatalf("admin session cookie is not securely scoped: %#v", cookie)
	}
}

func TestOrderStatusNotificationCopy(t *testing.T) {
	t.Parallel()

	for _, status := range []string{"pending", "preparing", "ready_for_delivery", "on_the_way", "delivered", "issue"} {
		title, message := orderStatusNotificationCopy(status)
		if strings.TrimSpace(title) == "" || strings.TrimSpace(message) == "" {
			t.Fatalf("status %q does not have customer-facing notification copy", status)
		}
	}
}

func TestAuthenticationFailureTrackerWorksWithoutRedis(t *testing.T) {
	t.Parallel()

	tracker := newAuthFailureTracker()
	now := time.Now()
	for attempt := 0; attempt < 5; attempt++ {
		tracker.record("admin:127.0.0.1:8090000000", 15*time.Minute, now)
	}
	if !tracker.locked("admin:127.0.0.1:8090000000", 5, now.Add(time.Minute)) {
		t.Fatal("authentication failures did not trigger the local fallback lockout")
	}
	tracker.clear("admin:127.0.0.1:8090000000")
	if tracker.locked("admin:127.0.0.1:8090000000", 5, now.Add(time.Minute)) {
		t.Fatal("authentication lockout was not cleared after a successful login")
	}
}
