package httpapi

import (
	"testing"

	waxum "github.com/basoradev/waxum-go"
	"wamercio/backend/internal/platform/tenancy"
)

func TestBusinessWhatsAppSessionIDUsesTenantSlug(t *testing.T) {
	tenant := tenancy.Tenant{ID: "5df1fbe4-6de9-46ce-a57d-7f449701e1cc", Slug: "Negocio Rafael MNBLT"}
	if got, want := businessWhatsAppSessionID(tenant), "negocio-rafael-mnblt"; got != want {
		t.Fatalf("businessWhatsAppSessionID() = %q, want %q", got, want)
	}
}

func TestBusinessWhatsAppSessionIDFallsBackToTenantID(t *testing.T) {
	tenant := tenancy.Tenant{ID: "5df1fbe4-6de9-46ce-a57d-7f449701e1cc"}
	if got, want := businessWhatsAppSessionID(tenant), "negocio-5df1fbe46de946cea57d7f449701e1cc"; got != want {
		t.Fatalf("businessWhatsAppSessionID() = %q, want %q", got, want)
	}
}

func TestApplyWaxumBusinessSessionStatus(t *testing.T) {
	phone := "18495551234"
	pushName := "Negocio Rafael"
	tenant := tenancy.Tenant{ID: "tenant-id", Slug: "negociorafael-mnblt"}
	got := applyWaxumBusinessSessionStatus(businessWhatsAppConfig{}, &waxum.SessionStatusResponse{
		Status:      waxum.SessionStatusLoggedIn,
		IsLoggedIn:  true,
		PhoneNumber: &phone,
		PushName:    &pushName,
	}, tenant)
	if !got.LoggedIn || !got.Connected || got.Status != "linked" {
		t.Fatalf("unexpected linked state: %#v", got)
	}
	if got.SessionID != tenant.Slug || got.SessionName != tenant.Slug {
		t.Fatalf("unexpected session identity: %#v", got)
	}
	if got.Phone != phone || got.ProfileName != pushName {
		t.Fatalf("unexpected WhatsApp identity: %#v", got)
	}
}

func TestBusinessWhatsAppDeviceIsWAMERCIO(t *testing.T) {
	device := businessWhatsAppDevice()
	if device == nil || device.OS == nil || *device.OS != "WAMERCIO" {
		t.Fatalf("expected WAMERCIO linked device name, got %#v", device)
	}
}
