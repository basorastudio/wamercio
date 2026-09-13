package httpapi

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"colmapro/backend/internal/config"
)

func TestLimitRequestBodyRejectsKnownOversizePayload(t *testing.T) {
	server := &Server{
		cfg:     config.Config{HTTPMaxJSONBodyBytes: 8},
		metrics: newServiceMetrics(),
	}
	handler := server.limitRequestBody(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		w.WriteHeader(http.StatusNoContent)
	}))
	request := httptest.NewRequest(http.MethodPost, "/api/test", strings.NewReader(`{"value":"too-large"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusRequestEntityTooLarge)
	}
}

func TestCatalogImportUsesProvisioningTimeout(t *testing.T) {
	server := &Server{cfg: config.Config{
		HTTPRequestTimeout:             30 * time.Second,
		HTTPExternalRequestTimeout:     75 * time.Second,
		HTTPProvisioningRequestTimeout: 10 * time.Minute,
	}}
	request := httptest.NewRequest(http.MethodPost, "/api/platform/catalog/import-default", nil)

	if got := server.requestTimeout(request); got != 10*time.Minute {
		t.Fatalf("requestTimeout() = %s, want %s", got, 10*time.Minute)
	}
}

func TestExternalIntegrationUsesExternalTimeout(t *testing.T) {
	server := &Server{cfg: config.Config{
		HTTPRequestTimeout:         30 * time.Second,
		HTTPExternalRequestTimeout: 75 * time.Second,
	}}
	request := httptest.NewRequest(http.MethodPost, "/api/platform/whatsapp/status", nil)

	if got := server.requestTimeout(request); got != 75*time.Second {
		t.Fatalf("requestTimeout() = %s, want %s", got, 75*time.Second)
	}
}

func BenchmarkRateLimiterAllow(b *testing.B) {
	limiter := newRateLimiter()
	now := time.Unix(1_700_000_000, 0)
	b.ReportAllocs()
	for b.Loop() {
		limiter.allow("tenant:benchmark", int(^uint(0)>>1), now)
	}
}
