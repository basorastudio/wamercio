package httpapi

import "testing"

func TestAccessPINLengthValidation(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name   string
		pin    string
		length int
		want   bool
	}{
		{name: "four digits", pin: "1234", length: 4, want: true},
		{name: "six digits", pin: "123456", length: 6, want: true},
		{name: "eight digits", pin: "12345678", length: 8, want: true},
		{name: "wrong length", pin: "12345", length: 6, want: false},
		{name: "contains letters", pin: "12a456", length: 6, want: false},
		{name: "empty", pin: "", length: 6, want: false},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := isValidAccessPINLength(tc.pin, tc.length); got != tc.want {
				t.Fatalf("isValidAccessPINLength(%q, %d) = %v, want %v", tc.pin, tc.length, got, tc.want)
			}
		})
	}
}

func TestNormalizeAccessPolicyMigratesSinglePINIntoSplitPolicy(t *testing.T) {
	t.Parallel()
	policy := normalizeAccessPolicy(accessPolicyConfig{
		PINLength:           6,
		LegacyPINLengths:    []int{4, 5, 12},
		RecoveryEnabled:     true,
		RecoveryTTLMinutes:  10,
		RecoveryMaxAttempts: 5,
	})
	if policy.AdminPINLength != 6 {
		t.Fatalf("AdminPINLength = %d, want 6", policy.AdminPINLength)
	}
	if policy.CustomerPINLength != 4 {
		t.Fatalf("CustomerPINLength = %d, want 4", policy.CustomerPINLength)
	}
	if !isSupportedPINLength("123456", policy.CustomerPINLength, policy.LegacyCustomerPINLengths) {
		t.Fatalf("legacy six-digit customer PIN must remain accepted: %v", policy.LegacyCustomerPINLengths)
	}
	if policy.PINLength != 0 || len(policy.LegacyPINLengths) != 0 {
		t.Fatalf("legacy single policy fields should be cleared after normalization")
	}
}

func TestNormalizeAccessPolicyKeepsIndependentLengths(t *testing.T) {
	t.Parallel()
	policy := normalizeAccessPolicy(accessPolicyConfig{
		AdminPINLength:           7,
		CustomerPINLength:        4,
		LegacyAdminPINLengths:    []int{6, 6, 12},
		LegacyCustomerPINLengths: []int{6, 5},
		RecoveryEnabled:          true,
		RecoveryTTLMinutes:       10,
		RecoveryMaxAttempts:      5,
	})
	if policy.AdminPINLength != 7 || policy.CustomerPINLength != 4 {
		t.Fatalf("split lengths = admin %d customer %d", policy.AdminPINLength, policy.CustomerPINLength)
	}
	if !isSupportedPINLength("123456", policy.AdminPINLength, policy.LegacyAdminPINLengths) {
		t.Fatal("legacy admin length should remain accepted")
	}
	if !isSupportedPINLength("12345", policy.CustomerPINLength, policy.LegacyCustomerPINLengths) {
		t.Fatal("legacy customer length should remain accepted")
	}
}

func TestNormalizeAccessPolicyRecoveryMethodAndCTA(t *testing.T) {
	t.Parallel()
	policy := normalizeAccessPolicy(accessPolicyConfig{
		AdminPINLength:         6,
		CustomerPINLength:      4,
		RecoveryEnabled:        true,
		RecoveryMethod:         "LINK",
		RecoveryTTLMinutes:     12,
		RecoveryMaxAttempts:    5,
		RecoveryCTAHeader:      "  Recuperar cuenta  ",
		RecoveryCTABody:        "Abre el enlace",
		RecoveryCTAFooter:      "Vence en {minutos} minutos",
		RecoveryCTAButtonLabel: "Continuar",
	})
	if policy.RecoveryMethod != recoveryMethodLink {
		t.Fatalf("RecoveryMethod = %q, want %q", policy.RecoveryMethod, recoveryMethodLink)
	}
	if policy.RecoveryCTAHeader != "Recuperar cuenta" {
		t.Fatalf("RecoveryCTAHeader = %q", policy.RecoveryCTAHeader)
	}
	if got := recoveryCTAConfiguredText(policy.RecoveryCTAFooter, policy.RecoveryTTLMinutes); got != "Vence en 12 minutos" {
		t.Fatalf("footer = %q", got)
	}
}

func TestRecoveryLinkTokenAndHashInput(t *testing.T) {
	t.Parallel()
	token, err := generateRecoveryLinkToken()
	if err != nil {
		t.Fatal(err)
	}
	if len(token) < 40 {
		t.Fatalf("token too short: %d", len(token))
	}
	if got := recoveryLinkHashInput("  abc  "); got != "link:abc" {
		t.Fatalf("hash input = %q", got)
	}
}
