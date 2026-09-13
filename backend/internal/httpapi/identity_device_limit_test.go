package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"colmapro/backend/internal/integrations/identidad"
)

func TestNormalizePlatformIdentityConfigDeviceLimitDefaults(t *testing.T) {
	config, err := normalizePlatformIdentityConfig(platformIdentityConfig{
		BaseURL:  "https://id.ltd.do",
		ClientID: "colmapro",
	})
	if err != nil {
		t.Fatalf("normalize config: %v", err)
	}
	if config.DeviceLimitMax != defaultIdentityDeviceLimitMax {
		t.Fatalf("DeviceLimitMax = %d, want %d", config.DeviceLimitMax, defaultIdentityDeviceLimitMax)
	}
	if config.DeviceLimitWindowMinutes != defaultIdentityDeviceLimitWindowMinutes {
		t.Fatalf("DeviceLimitWindowMinutes = %d, want %d", config.DeviceLimitWindowMinutes, defaultIdentityDeviceLimitWindowMinutes)
	}
}

func TestIdentityDeviceKeyUsesOpaqueHeader(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/client/verify-identity", nil)
	req.Header.Set(platformIdentityDeviceHeader, "device-1234567890")
	got := identityDeviceKeyFromRequest(req)
	if got == "" || got == "device-1234567890" {
		t.Fatalf("device key must be hashed, got %q", got)
	}
}

func TestRateLimiterSupportsCustomWindow(t *testing.T) {
	limiter := newRateLimiter()
	now := time.Date(2026, 8, 4, 12, 0, 0, 0, time.UTC)
	if !limiter.allowWindow("identity-device", 2, time.Hour, now) {
		t.Fatal("first request should pass")
	}
	if !limiter.allowWindow("identity-device", 2, time.Hour, now.Add(10*time.Minute)) {
		t.Fatal("second request should pass")
	}
	if limiter.allowWindow("identity-device", 2, time.Hour, now.Add(20*time.Minute)) {
		t.Fatal("third request in the same window should be blocked")
	}
	if !limiter.allowWindow("identity-device", 2, time.Hour, now.Add(time.Hour)) {
		t.Fatal("new window should reset the limit")
	}
}

func TestDynamicPWAIconFallsBackToRequestedSize(t *testing.T) {
	server := &Server{}
	req := httptest.NewRequest("GET", "/api/pwa/icon.png?size=192", nil)
	recorder := httptest.NewRecorder()
	server.dynamicPWAIcon(recorder, req)
	if recorder.Code != 302 {
		t.Fatalf("status = %d, want 302", recorder.Code)
	}
	if location := recorder.Header().Get("Location"); location != "/icons/icon-192.png" {
		t.Fatalf("Location = %q, want /icons/icon-192.png", location)
	}
}

func TestIdentityErrorAllowsManualReviewForIntegrationFailures(t *testing.T) {
	for _, status := range []int{
		http.StatusUnauthorized,
		http.StatusForbidden,
		http.StatusRequestTimeout,
		http.StatusTooManyRequests,
		http.StatusBadGateway,
		http.StatusServiceUnavailable,
		http.StatusGatewayTimeout,
	} {
		if !identityErrorAllowsManualReview(&identidad.APIError{StatusCode: status}) {
			t.Fatalf("status %d should allow manual review", status)
		}
	}
	if identityErrorAllowsManualReview(&identidad.APIError{StatusCode: http.StatusUnprocessableEntity}) {
		t.Fatal("document validation errors must not be treated as an integration outage")
	}
}

func TestIdentityDeviceLimitMessageUsesRemainingMinutes(t *testing.T) {
	config := platformIdentityConfig{DeviceLimitWindowMinutes: 60}
	now := time.Date(2026, 8, 4, 12, 59, 10, 0, time.UTC)
	retrySeconds := identityDeviceLimitRetrySeconds(config, now)
	if retrySeconds != 50 {
		t.Fatalf("retry seconds = %d, want 50", retrySeconds)
	}
	if message := identityDeviceLimitMessage(retrySeconds); message != "Verificación limitada, inténtalo en 1 minuto." {
		t.Fatalf("message = %q", message)
	}
}
