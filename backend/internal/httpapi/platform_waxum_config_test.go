package httpapi

import "testing"

func TestNormalizePlatformWaxumPublicURL(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{name: "domain", input: "waxum.ltd.do", want: "https://waxum.ltd.do"},
		{name: "root", input: "https://waxum.ltd.do/", want: "https://waxum.ltd.do"},
		{name: "protected dashboard path", input: "https://waxum.ltd.do/dashboard", want: "https://waxum.ltd.do"},
		{name: "swagger path", input: "https://waxum.ltd.do/swagger-ui/", want: "https://waxum.ltd.do"},
		{name: "openapi path", input: "https://waxum.ltd.do/api-docs/openapi.json", want: "https://waxum.ltd.do"},
		{name: "mounted dashboard path", input: "https://example.com/waxum/dashboard", want: "https://example.com/waxum"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := normalizePlatformWaxumPublicURL(test.input); got != test.want {
				t.Fatalf("normalizePlatformWaxumPublicURL(%q) = %q, want %q", test.input, got, test.want)
			}
		})
	}
}

func TestNormalizePlatformWaxumConfigUsesConsoleRoot(t *testing.T) {
	config, err := normalizePlatformWaxumConfig(platformWaxumConfig{
		Enabled:    true,
		PublicURL:  "https://waxum.ltd.do/dashboard",
		AdminToken: " token-value ",
	})
	if err != nil {
		t.Fatal(err)
	}
	if config.PublicURL != "https://waxum.ltd.do" {
		t.Fatalf("unexpected public URL: %q", config.PublicURL)
	}
	if config.DashboardURL != "https://waxum.ltd.do" {
		t.Fatalf("unexpected console URL: %q", config.DashboardURL)
	}
	if config.DocsURL != "https://waxum.ltd.do/swagger-ui/" {
		t.Fatalf("unexpected docs URL: %q", config.DocsURL)
	}
	if config.AdminToken != "token-value" {
		t.Fatalf("token was not trimmed: %q", config.AdminToken)
	}
}

func TestSanitizePlatformWaxumConfigReportsReadinessWithoutExposingToken(t *testing.T) {
	payload := sanitizePlatformWaxumConfig(platformWaxumConfig{
		Enabled:    true,
		PublicURL:  "https://waxum.ltd.do",
		AdminToken: "secret",
	})
	if payload["ready"] != true {
		t.Fatalf("expected ready=true, got %#v", payload["ready"])
	}
	if payload["admin_token_configured"] != true {
		t.Fatalf("expected admin_token_configured=true, got %#v", payload["admin_token_configured"])
	}
	if _, exists := payload["admin_token"]; exists {
		t.Fatal("sanitized payload must not expose admin_token")
	}
}
