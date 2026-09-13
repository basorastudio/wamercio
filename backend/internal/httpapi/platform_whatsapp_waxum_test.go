package httpapi

import (
	"testing"

	waxum "github.com/basoradev/waxum-go"
)

func TestWaxumSessionConnected(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		status   waxum.SessionStatus
		loggedIn bool
		want     bool
	}{
		{name: "logged in flag", status: waxum.SessionStatusDisconnected, loggedIn: true, want: true},
		{name: "logged in status", status: waxum.SessionStatusLoggedIn, want: true},
		{name: "connected", status: waxum.SessionStatusConnected, want: true},
		{name: "waiting for QR", status: waxum.SessionStatusWaitingForQR, want: true},
		{name: "waiting for pair code", status: waxum.SessionStatusWaitingForPairCode, want: true},
		{name: "connecting", status: waxum.SessionStatusConnecting, want: true},
		{name: "disconnected", status: waxum.SessionStatusDisconnected, want: false},
		{name: "unknown", status: waxum.SessionStatus("unknown"), want: false},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			if got := waxumSessionConnected(test.status, test.loggedIn); got != test.want {
				t.Fatalf("waxumSessionConnected(%q, %t) = %t, want %t", test.status, test.loggedIn, got, test.want)
			}
		})
	}
}

func TestPlatformStatusFromWaxum(t *testing.T) {
	t.Parallel()

	tests := []struct {
		status   waxum.SessionStatus
		loggedIn bool
		want     string
	}{
		{status: waxum.SessionStatusLoggedIn, want: "linked"},
		{status: waxum.SessionStatusConnected, want: "connected"},
		{status: waxum.SessionStatusConnecting, want: "connecting"},
		{status: waxum.SessionStatusWaitingForQR, want: "qr_ready"},
		{status: waxum.SessionStatusWaitingForPairCode, want: "pairing_code_ready"},
		{status: waxum.SessionStatusDisconnected, want: "disconnected"},
		{status: "", want: "pending"},
		{status: waxum.SessionStatus("custom"), want: "custom"},
		{status: waxum.SessionStatusDisconnected, loggedIn: true, want: "linked"},
	}

	for _, test := range tests {
		if got := platformStatusFromWaxum(test.status, test.loggedIn); got != test.want {
			t.Fatalf("platformStatusFromWaxum(%q, %t) = %q, want %q", test.status, test.loggedIn, got, test.want)
		}
	}
}

func TestPlatformWhatsAppPhoneHelpers(t *testing.T) {
	t.Parallel()

	if got := normalizePlatformWhatsAppPhone("(809) 555-1234"); got != "18095551234" {
		t.Fatalf("unexpected normalized phone: %q", got)
	}
	if !platformPhonesMatch("18095551234@s.whatsapp.net", "+1 809-555-1234") {
		t.Fatal("expected JID and formatted phone to match")
	}
	if got := formatPlatformWhatsAppPhone("18095551234"); got != "+1 809-555-1234" {
		t.Fatalf("unexpected display phone: %q", got)
	}
}

func TestApplyWaxumSessionInfoUsesCanonicalWAMERCIOName(t *testing.T) {
	t.Parallel()

	legacyName := "WAMERCIO SaaS SuperAdmin"
	got := applyWaxumSessionInfo(platformWhatsAppConfig{SessionName: legacyName}, &waxum.SessionInfo{
		ID:   platformWhatsAppSessionID,
		Name: &legacyName,
	})
	if got.SessionName != "WAMERCIO" {
		t.Fatalf("unexpected session name: %q", got.SessionName)
	}
	if got.SessionID != "WAMERCIO" {
		t.Fatalf("unexpected session ID: %q", got.SessionID)
	}
}
