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

func TestSafeStoreSlug(t *testing.T) {
	tests := map[string]string{
		"Mi Mascota": "mi-mascota",
		"admin":      "admin-tienda",
		"stores":     "stores-tienda",
		"CATALOG":    "catalog-tienda",
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
