package httpapi

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"colmapro/backend/internal/platform/tenancy"
	waxum "github.com/basoradev/waxum-go"
)

func TestWhatsAppLinkingWindow(t *testing.T) {
	now := time.Date(2026, 8, 5, 12, 0, 0, 0, time.UTC)
	expiresAt := whatsappLinkingExpiresAt(now, 30)
	if !whatsappLinkingIsActive(expiresAt, now.Add(4*time.Minute)) {
		t.Fatal("expected linking window to remain active")
	}
	if whatsappLinkingIsActive(expiresAt, now.Add(6*time.Minute)) {
		t.Fatal("expected linking window to expire")
	}

	longExpiry := whatsappLinkingExpiresAt(now, 600)
	if !whatsappLinkingIsActive(longExpiry, now.Add(9*time.Minute)) {
		t.Fatal("expected provider timeout longer than default window to be honored")
	}
}

func TestDeleteWaxumSessionCompletelyDisconnectsAndDeletes(t *testing.T) {
	var mu sync.Mutex
	calls := make([]string, 0, 2)
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		calls = append(calls, r.Method+" "+r.URL.Path)
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/disconnect"):
			_, _ = w.Write([]byte(`{"success":true,"message":"Disconnected"}`))
		case r.Method == http.MethodDelete && strings.Contains(r.URL.Path, "/sessions/"):
			_, _ = w.Write([]byte(`{"success":true,"message":"Session deleted"}`))
		default:
			t.Fatalf("unexpected WAXUM request: %s %s", r.Method, r.URL.Path)
		}
	})
	client, server := newWaxumPairingTestClient(t, handler)
	defer server.Close()

	if err := deleteWaxumSessionCompletely(context.Background(), client, "colmado-prueba"); err != nil {
		t.Fatalf("delete complete session: %v", err)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(calls) != 2 || !strings.HasSuffix(calls[0], "/disconnect") || !strings.HasPrefix(calls[1], http.MethodDelete+" ") {
		t.Fatalf("unexpected lifecycle calls: %v", calls)
	}
}

func TestDeleteWaxumSessionCompletelyRetriesDelete(t *testing.T) {
	deleteAttempts := 0
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/disconnect"):
			_, _ = w.Write([]byte(`{"success":true,"message":"Disconnected"}`))
		case r.Method == http.MethodDelete && strings.Contains(r.URL.Path, "/sessions/"):
			deleteAttempts++
			if deleteAttempts == 1 {
				w.WriteHeader(http.StatusInternalServerError)
				_, _ = w.Write([]byte(`{"error":{"code":500,"message":"busy"}}`))
				return
			}
			_, _ = w.Write([]byte(`{"success":true,"message":"Session deleted"}`))
		default:
			t.Fatalf("unexpected WAXUM request: %s %s", r.Method, r.URL.Path)
		}
	})
	client, server := newWaxumPairingTestClient(t, handler)
	defer server.Close()

	if err := deleteWaxumSessionCompletely(context.Background(), client, "colmado-prueba"); err != nil {
		t.Fatalf("delete complete session after retry: %v", err)
	}
	if deleteAttempts != 2 {
		t.Fatalf("expected two DELETE attempts, got %d", deleteAttempts)
	}
}

func newWaxumLifecycleStateHandler(t *testing.T, status waxum.SessionStatus, deleted *bool) http.Handler {
	t.Helper()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/status"):
			_, _ = w.Write([]byte(`{"status":"` + string(status) + `","is_logged_in":false,"pair":{}}`))
		case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/sessions/"):
			_, _ = w.Write([]byte(`{"id":"colmado-prueba","name":"colmado-prueba","status":"` + string(status) + `","is_logged_in":false,"created_at":1,"updated_at":1}`))
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/disconnect"):
			_, _ = w.Write([]byte(`{"success":true,"message":"Disconnected"}`))
		case r.Method == http.MethodDelete && strings.Contains(r.URL.Path, "/sessions/"):
			*deleted = true
			_, _ = w.Write([]byte(`{"success":true,"message":"Session deleted"}`))
		default:
			t.Fatalf("unexpected WAXUM request: %s %s", r.Method, r.URL.Path)
		}
	})
}

func TestReconcileBusinessWhatsAppDeletesUnlinkedSession(t *testing.T) {
	deleted := false
	client, server := newWaxumPairingTestClient(t, newWaxumLifecycleStateHandler(t, waxum.SessionStatusDisconnected, &deleted))
	defer server.Close()

	tenant := tenancy.Tenant{ID: "tenant-id", Name: "Colmado Prueba", Slug: "colmado-prueba"}
	config := touchBusinessWhatsAppConfig(businessWhatsAppConfig{
		Status:    "linked",
		LoggedIn:  true,
		Connected: true,
	}, tenant)
	got, autoDeleted, err := (&Server{}).reconcileBusinessWhatsAppSession(context.Background(), client, tenant, config)
	if err != nil {
		t.Fatalf("reconcile business session: %v", err)
	}
	if !autoDeleted || !deleted {
		t.Fatalf("expected orphan session deletion, auto=%v remote=%v", autoDeleted, deleted)
	}
	if got.LoggedIn || got.Status != "pending" {
		t.Fatalf("expected clean pending state, got %#v", got)
	}
}

func TestReconcileBusinessWhatsAppKeepsActiveLinkingSession(t *testing.T) {
	deleted := false
	client, server := newWaxumPairingTestClient(t, newWaxumLifecycleStateHandler(t, waxum.SessionStatusWaitingForQR, &deleted))
	defer server.Close()

	tenant := tenancy.Tenant{ID: "tenant-id", Slug: "colmado-prueba"}
	config := touchBusinessWhatsAppConfig(businessWhatsAppConfig{
		Status:           "qr_ready",
		Connected:        true,
		LinkingMethod:    "qr",
		LinkingExpiresAt: time.Now().UTC().Add(2 * time.Minute).Format(time.RFC3339),
	}, tenant)
	got, autoDeleted, err := (&Server{}).reconcileBusinessWhatsAppSession(context.Background(), client, tenant, config)
	if err != nil {
		t.Fatalf("reconcile active linking session: %v", err)
	}
	if autoDeleted || deleted {
		t.Fatalf("active linking session must not be deleted, auto=%v remote=%v", autoDeleted, deleted)
	}
	if got.Status == "pending" {
		t.Fatalf("active linking state was cleared: %#v", got)
	}
}

func TestReconcileBusinessWhatsAppDeletesExpiredReconnect(t *testing.T) {
	deleted := false
	client, server := newWaxumPairingTestClient(t, newWaxumLifecycleStateHandler(t, waxum.SessionStatusConnecting, &deleted))
	defer server.Close()

	tenant := tenancy.Tenant{ID: "tenant-id", Slug: "colmado-prueba"}
	config := touchBusinessWhatsAppConfig(businessWhatsAppConfig{
		Status:           "linked",
		LoggedIn:         true,
		Connected:        true,
		UnlinkDetectedAt: time.Now().UTC().Add(-3 * time.Minute).Format(time.RFC3339),
	}, tenant)
	_, autoDeleted, err := (&Server{}).reconcileBusinessWhatsAppSession(context.Background(), client, tenant, config)
	if err != nil {
		t.Fatalf("reconcile expired reconnect: %v", err)
	}
	if !autoDeleted || !deleted {
		t.Fatalf("expected expired reconnect session deletion, auto=%v remote=%v", autoDeleted, deleted)
	}
}

func TestReconcilePlatformWhatsAppDeletesUnlinkedSession(t *testing.T) {
	deleted := false
	client, server := newWaxumPairingTestClient(t, newWaxumLifecycleStateHandler(t, waxum.SessionStatusDisconnected, &deleted))
	defer server.Close()

	config := platformWhatsAppConfig{
		Enabled:     true,
		SessionID:   platformWhatsAppSessionID,
		SessionName: platformWhatsAppSessionName,
		Status:      "linked",
		LoggedIn:    true,
		Connected:   true,
	}
	got, autoDeleted, err := (&Server{}).reconcilePlatformWhatsAppSession(context.Background(), client, config)
	if err != nil {
		t.Fatalf("reconcile platform session: %v", err)
	}
	if !autoDeleted || !deleted {
		t.Fatalf("expected global orphan session deletion, auto=%v remote=%v", autoDeleted, deleted)
	}
	if got.LoggedIn || got.Status != "pending" {
		t.Fatalf("expected clean global pending state, got %#v", got)
	}
}
