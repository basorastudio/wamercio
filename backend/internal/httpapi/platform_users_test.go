package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDefaultPlatformPermissionsByRole(t *testing.T) {
	tests := []struct {
		role       string
		allowed    []string
		restricted []string
	}{
		{
			role:    "superadmin",
			allowed: platformPermissionKeys,
		},
		{
			role:       "administrator",
			allowed:    []string{platformPermissionOverview, platformPermissionBusinesses, platformPermissionPlans, platformPermissionCatalog, platformPermissionCustomers, platformPermissionSettings, platformPermissionAudit},
			restricted: []string{platformPermissionUsers},
		},
		{
			role:       "operations",
			allowed:    []string{platformPermissionOverview, platformPermissionBusinesses, platformPermissionCatalog, platformPermissionCustomers, platformPermissionAudit},
			restricted: []string{platformPermissionPlans, platformPermissionSettings, platformPermissionUsers},
		},
		{
			role:       "support",
			allowed:    []string{platformPermissionOverview, platformPermissionCustomers, platformPermissionAudit},
			restricted: []string{platformPermissionBusinesses, platformPermissionPlans, platformPermissionCatalog, platformPermissionSettings, platformPermissionUsers},
		},
		{
			role:       "auditor",
			allowed:    []string{platformPermissionOverview, platformPermissionAudit},
			restricted: []string{platformPermissionBusinesses, platformPermissionPlans, platformPermissionCatalog, platformPermissionCustomers, platformPermissionSettings, platformPermissionUsers},
		},
	}

	for _, test := range tests {
		t.Run(test.role, func(t *testing.T) {
			permissions := defaultPlatformPermissions(test.role)
			for _, permission := range test.allowed {
				if !permissions[permission] {
					t.Fatalf("expected %s to be enabled for %s", permission, test.role)
				}
			}
			for _, permission := range test.restricted {
				if permissions[permission] {
					t.Fatalf("expected %s to be disabled for %s", permission, test.role)
				}
			}
		})
	}
}

func TestNormalizedPlatformPermissionsCannotRestrictSuperadmin(t *testing.T) {
	raw := map[string]any{
		platformPermissionOverview: false,
		platformPermissionUsers:    false,
		"unknown.permission":       true,
	}

	encoded := normalizedPlatformPermissionsJSON("superadmin", raw)
	permissions := map[string]bool{}
	if err := json.Unmarshal([]byte(encoded), &permissions); err != nil {
		t.Fatalf("decode permissions: %v", err)
	}
	for _, permission := range platformPermissionKeys {
		if !permissions[permission] {
			t.Fatalf("superadmin permission %s must remain enabled", permission)
		}
	}
	if _, exists := permissions["unknown.permission"]; exists {
		t.Fatal("unknown permissions must not be persisted")
	}
}

func TestPlatformPermissionForRequest(t *testing.T) {
	tests := []struct {
		method     string
		path       string
		permission string
	}{
		{http.MethodGet, "/api/platform/session", ""},
		{http.MethodPatch, "/api/platform/profile", ""},
		{http.MethodGet, "/api/platform/overview", platformPermissionOverview},
		{http.MethodGet, "/api/platform/businesses", platformPermissionBusinesses},
		{http.MethodPost, "/api/platform/plans", platformPermissionPlans},
		{http.MethodGet, "/api/platform/catalog", platformPermissionCatalog},
		{http.MethodGet, "/api/platform/customers", platformPermissionCustomers},
		{http.MethodPatch, "/api/platform/settings", platformPermissionSettings},
		{http.MethodPost, "/api/platform/waxum/configure", platformPermissionSettings},
		{http.MethodPatch, "/api/platform/waxum/configure", platformPermissionSettings},
		{http.MethodPost, "/api/platform/whatsapp/instance", platformPermissionSettings},
		{http.MethodPost, "/api/platform/whatsapp/session", platformPermissionSettings},
		{http.MethodGet, "/api/platform/notification-templates", platformPermissionSettings},
		{http.MethodPost, "/api/platform/notification-templates", platformPermissionSettings},
		{http.MethodPatch, "/api/platform/notification-templates/123", platformPermissionSettings},
		{http.MethodDelete, "/api/platform/notification-templates/123", platformPermissionSettings},
		{http.MethodGet, "/api/platform/audit-logs", platformPermissionAudit},
		{http.MethodDelete, "/api/platform/users/123", platformPermissionUsers},
	}

	for _, test := range tests {
		t.Run(test.method+"_"+test.path, func(t *testing.T) {
			request := httptest.NewRequest(test.method, test.path, nil)
			if actual := platformPermissionForRequest(request); actual != test.permission {
				t.Fatalf("expected %q, got %q", test.permission, actual)
			}
		})
	}
}

func TestGeneratedPlatformUsername(t *testing.T) {
	if got := generatedPlatformUsername("048-0106618-6"); got != "saas.04801066186" {
		t.Fatalf("generatedPlatformUsername() = %q", got)
	}
	if got := generatedPlatformUsername(""); got != "" {
		t.Fatalf("generatedPlatformUsername(empty) = %q", got)
	}
}
