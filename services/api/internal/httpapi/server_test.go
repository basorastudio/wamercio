package httpapi

import "testing"

func TestNormalizePhone(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"dominican_local", "829-793-4075", "18297934075"},
		{"dominican_e164", "+1 829-793-4075", "18297934075"},
		{"international_e164", "+34 612 34 56 78", "34612345678"},
		{"already_digits", "18297934075", "18297934075"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := normalizePhone(tt.in); got != tt.want {
				t.Fatalf("normalizePhone(%q)=%q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestValidPIN(t *testing.T) {
	valid := []string{"0000", "1234", "9876"}
	for _, pin := range valid {
		if !validPIN(pin) {
			t.Fatalf("validPIN(%q)=false, want true", pin)
		}
	}
	invalid := []string{"123", "12345", "12a4", "", " 1234"}
	for _, pin := range invalid {
		if validPIN(pin) {
			t.Fatalf("validPIN(%q)=true, want false", pin)
		}
	}
}

func TestSlugify(t *testing.T) {
	tests := map[string]string{
		"Tienda Demo":          "tienda-demo",
		"Café & Panadería Ñ":   "cafe-panaderia-n",
		"  Mi__Tienda  Nueva ": "mi-tienda-nueva",
	}
	for in, want := range tests {
		if got := slugify(in); got != want {
			t.Fatalf("slugify(%q)=%q, want %q", in, got, want)
		}
	}
}

func TestStoreSlugify(t *testing.T) {
	tests := map[string]string{
		"Pizzería Demo":       "pizzeriademo",
		"Pizzería La Familia": "pizzerialafamilia",
		"Café & Panadería Ñ":  "cafepanaderian",
	}
	for in, want := range tests {
		if got := storeSlugify(in); got != want {
			t.Fatalf("storeSlugify(%q)=%q, want %q", in, got, want)
		}
	}
}

func TestSafeStoreSlug(t *testing.T) {
	tests := map[string]string{
		"Mi Mascota":      "mimascota",
		"admin":           "admintienda",
		"stores":          "storestienda",
		"CATALOG":         "catalogtienda",
		"payment methods": "paymentmethodstienda",
	}
	for in, want := range tests {
		if got := safeStoreSlug(in); got != want {
			t.Fatalf("safeStoreSlug(%q)=%q, want %q", in, got, want)
		}
	}
}

func TestTenantSlugFromHost(t *testing.T) {
	tests := []struct {
		host string
		root string
		want string
		ok   bool
	}{
		{"pizzeria-juan.ltd.do", "ltd.do", "pizzeria-juan", true},
		{"PIZZERIA-JUAN.LTD.DO:443", "ltd.do", "pizzeria-juan", true},
		{"ltd.do", "ltd.do", "", false},
		{"foo.bar.ltd.do", "ltd.do", "", false},
		{"wamercio.com", "ltd.do", "", false},
	}
	for _, tt := range tests {
		got, ok := tenantSlugFromHost(tt.host, tt.root)
		if got != tt.want || ok != tt.ok {
			t.Fatalf("tenantSlugFromHost(%q,%q)=(%q,%v), want (%q,%v)", tt.host, tt.root, got, ok, tt.want, tt.ok)
		}
	}
}

func TestValidCustomHostname(t *testing.T) {
	valid := []string{"pizzeriajuan.com", "tienda.example.do", "WWW.NEGOCIO.COM."}
	for _, raw := range valid {
		if _, ok := validCustomHostname(raw); !ok {
			t.Fatalf("validCustomHostname(%q)=false, want true", raw)
		}
	}
	invalid := []string{"localhost", "https://tienda.com/ruta", "bad_name.com", "127.0.0.1"}
	for _, raw := range invalid {
		if _, ok := validCustomHostname(raw); ok {
			t.Fatalf("validCustomHostname(%q)=true, want false", raw)
		}
	}
}

func TestPaymentMethodAllowedForFulfillment(t *testing.T) {
	raw := []byte(`{"delivery":{"cash":true,"cash_on_delivery":false,"bank_transfer":true},"pickup":{"cash":false,"cash_on_delivery":true,"bank_transfer":true},"dine_in":{"cash":true,"cash_on_delivery":true,"bank_transfer":false}}`)
	globals := map[string]bool{"cash": true, "cash_on_delivery": true, "bank_transfer": true}
	if !paymentMethodAllowedForFulfillment(raw, "delivery", "cash", globals) {
		t.Fatal("delivery cash should be allowed")
	}
	if paymentMethodAllowedForFulfillment(raw, "delivery", "cash_on_delivery", globals) {
		t.Fatal("delivery terminal should be blocked by fulfillment rule")
	}
	if paymentMethodAllowedForFulfillment(raw, "pickup", "cash", globals) {
		t.Fatal("pickup cash should be blocked by fulfillment rule")
	}
	globals["bank_transfer"] = false
	if paymentMethodAllowedForFulfillment(raw, "delivery", "bank_transfer", globals) {
		t.Fatal("global switch must override fulfillment rule")
	}
}

func TestPaymentMethodAllowedForFulfillmentFallsBackToGlobal(t *testing.T) {
	globals := map[string]bool{"cash": true, "cash_on_delivery": false, "bank_transfer": true}
	if !paymentMethodAllowedForFulfillment(nil, "delivery", "cash", globals) {
		t.Fatal("missing rules should fall back to global enabled state")
	}
	if paymentMethodAllowedForFulfillment(nil, "delivery", "cash_on_delivery", globals) {
		t.Fatal("missing rules should still honor global disabled state")
	}
}
