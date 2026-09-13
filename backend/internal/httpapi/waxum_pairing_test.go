package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	waxum "github.com/basoradev/waxum-go"
)

func newWaxumPairingTestClient(t *testing.T, handler http.Handler) (*waxum.Client, *httptest.Server) {
	t.Helper()
	server := httptest.NewServer(handler)
	client, err := waxum.NewClient(
		"test-token",
		waxum.WithBaseURL(server.URL),
		waxum.WithHTTPClient(server.Client()),
		waxum.WithTimeout(5*time.Second),
	)
	if err != nil {
		server.Close()
		t.Fatalf("new Waxum client: %v", err)
	}
	return client, server
}

func TestRequestWaxumPhonePairingCodeRequestsPushNotificationWithoutConnect(t *testing.T) {
	var mu sync.Mutex
	var calls []string
	var pairBody waxum.PairCodeRequest

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		calls = append(calls, r.Method+" "+r.URL.Path)
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/status"):
			_, _ = w.Write([]byte(`{"status":"waiting_for_qr","is_logged_in":false,"pair":{}}`))
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/disconnect"):
			_, _ = w.Write([]byte(`{"success":true,"message":"Disconnected"}`))
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/pair"):
			if err := json.NewDecoder(r.Body).Decode(&pairBody); err != nil {
				t.Fatalf("decode pair body: %v", err)
			}
			_, _ = w.Write([]byte(`{"code":"ABCD-EFGH","timeout_seconds":180}`))
		default:
			t.Fatalf("unexpected Waxum request: %s %s", r.Method, r.URL.Path)
		}
	})
	client, server := newWaxumPairingTestClient(t, handler)
	defer server.Close()

	pair, err := requestWaxumPhonePairingCode(
		context.Background(),
		client,
		"negocio-prueba",
		"18095551212",
		businessWhatsAppDevice(),
		&waxum.CreateSessionRequest{ID: waxum.Ptr("negocio-prueba"), Name: waxum.Ptr("negocio-prueba"), Device: businessWhatsAppDevice()},
	)
	if err != nil {
		t.Fatalf("request pairing code: %v", err)
	}
	if pair == nil || pair.Code != "ABCD-EFGH" {
		t.Fatalf("unexpected pair response: %#v", pair)
	}
	if pairBody.ShowPushNotification == nil || !*pairBody.ShowPushNotification {
		t.Fatalf("expected show_push_notification=true, got %#v", pairBody.ShowPushNotification)
	}
	if pairBody.PhoneNumber != "+18095551212" {
		t.Fatalf("unexpected phone number: %q", pairBody.PhoneNumber)
	}
	if pairBody.Device == nil || pairBody.Device.OS == nil || *pairBody.Device.OS != "WAMERCIO" {
		t.Fatalf("unexpected device identity: %#v", pairBody.Device)
	}
	mu.Lock()
	defer mu.Unlock()
	for _, call := range calls {
		if strings.HasSuffix(call, "/connect") {
			t.Fatalf("pairing flow must not enter QR connect mode: %v", calls)
		}
	}
}

func TestRequestWaxumPhonePairingCodeRecoversFromIQFailure(t *testing.T) {
	var mu sync.Mutex
	pairAttempts := 0
	created := true

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/status"):
			if !created {
				w.WriteHeader(http.StatusNotFound)
				_, _ = w.Write([]byte(`{"error":{"code":"session_not_found","message":"Session not found"}}`))
				return
			}
			_, _ = w.Write([]byte(`{"status":"waiting_for_qr","is_logged_in":false,"pair":{}}`))
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/disconnect"):
			_, _ = w.Write([]byte(`{"success":true,"message":"Disconnected"}`))
		case r.Method == http.MethodDelete && strings.Contains(r.URL.Path, "/sessions/"):
			created = false
			_, _ = w.Write([]byte(`{"success":true,"message":"Session deleted"}`))
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/sessions":
			created = true
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"session":{"id":"negocio-prueba","name":"negocio-prueba","status":"connecting","is_logged_in":false,"created_at":1,"updated_at":1}}`))
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/pair"):
			pairAttempts++
			if pairAttempts == 1 {
				w.WriteHeader(http.StatusInternalServerError)
				_, _ = w.Write([]byte(`{"success":false,"error":{"code":500,"message":"Internal error: pair_with_code failed: pair-code IQ request failed"}}`))
				return
			}
			_, _ = w.Write([]byte(`{"code":"WXYZ-1234","timeout_seconds":180}`))
		default:
			t.Fatalf("unexpected Waxum request: %s %s", r.Method, r.URL.Path)
		}
	})
	client, server := newWaxumPairingTestClient(t, handler)
	defer server.Close()

	pair, err := requestWaxumPhonePairingCode(
		context.Background(),
		client,
		"negocio-prueba",
		"18095551212",
		businessWhatsAppDevice(),
		&waxum.CreateSessionRequest{ID: waxum.Ptr("negocio-prueba"), Name: waxum.Ptr("negocio-prueba"), Device: businessWhatsAppDevice()},
	)
	if err != nil {
		t.Fatalf("expected recovery, got %v", err)
	}
	if pair == nil || pair.Code != "WXYZ-1234" {
		t.Fatalf("unexpected recovered response: %#v", pair)
	}
	if pairAttempts != 2 {
		t.Fatalf("expected two pair attempts, got %d", pairAttempts)
	}
}

func TestFriendlyWaxumPairingErrorHidesProviderPayload(t *testing.T) {
	err := &waxum.APIError{
		StatusCode: http.StatusInternalServerError,
		Message:    "Internal error: pair_with_code failed: pair-code IQ request failed",
		Body:       []byte(`{"success":false,"error":{"code":500,"message":"pair-code IQ request failed"}}`),
	}
	friendly := friendlyWaxumPairingError(err)
	if friendly == nil {
		t.Fatal("expected friendly error")
	}
	message := friendly.Error()
	if strings.Contains(message, "pair_with_code") || strings.Contains(message, `{"success"`) {
		t.Fatalf("provider payload leaked to UI: %s", message)
	}
	if !strings.Contains(message, "utiliza el código QR") {
		t.Fatalf("unexpected friendly message: %s", message)
	}
}
