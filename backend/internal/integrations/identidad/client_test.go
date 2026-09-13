package identidad

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestVerifySendsPrivateHeadersAndDecodesEnvelope(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("X-API-Key"); got != "secret" {
			t.Fatalf("X-API-Key = %q", got)
		}
		if got := r.Header.Get("X-Client-ID"); got != "colmapro" {
			t.Fatalf("X-Client-ID = %q", got)
		}
		if got := r.Header.Get("X-Application-Domain"); got != "wamercio.com" {
			t.Fatalf("X-Application-Domain = %q", got)
		}
		if got := r.Header.Get("X-Usage-Context"); got != "registro_propietario" {
			t.Fatalf("X-Usage-Context = %q", got)
		}
		if got := r.Header.Get("X-Request-ID"); got != "request-123" {
			t.Fatalf("X-Request-ID = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"tipo_sujeto":"persona","tipo_documento":"cedula","documento":"00100000001","valida":true,"encontrada":true,"puede_autocompletar":true,"requiere_confirmacion":false,"puede_registrarse":true,"fuente":"DGII","persona":{"cedula":"00100000001","nombre_completo":"ANA PEREZ","nombres":"ANA","apellidos":"PEREZ","fecha_nacimiento":"1990-05-16","sexo":"F","separacion_nombre_confiable":true}},"meta":{"request_id":"upstream-456"}}`))
	}))
	defer server.Close()

	client, err := New(server.URL, "secret", "colmapro", "https://WAMERCIO.com:443/admin", server.Client())
	if err != nil {
		t.Fatal(err)
	}
	result, meta, err := client.Verify(context.Background(), Request{SubjectType: "persona", Document: "00100000001", Context: "registro_propietario"}, "request-123")
	if err != nil {
		t.Fatal(err)
	}
	if !result.Valid || result.Person == nil || result.Person.FirstNames != "ANA" || result.Person.BirthDate != "1990-05-16" || result.Person.Gender != "F" {
		t.Fatalf("resultado inesperado: %#v", result)
	}
	if meta.RequestID != "upstream-456" {
		t.Fatalf("request id = %q", meta.RequestID)
	}
}

func TestVerifyReturnsStructuredAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"code":"INVALID_API_KEY","message":"Clave inválida","request_id":"req-error"}}`))
	}))
	defer server.Close()

	client, err := New(server.URL, "bad", "colmapro", "wamercio.com", server.Client())
	if err != nil {
		t.Fatal(err)
	}
	_, _, err = client.Verify(context.Background(), Request{SubjectType: "persona", Document: "00100000001", Context: "registro_propietario"}, "")
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("error = %T, want *APIError", err)
	}
	if apiErr.StatusCode != http.StatusUnauthorized || apiErr.Code != "INVALID_API_KEY" || apiErr.RequestID != "req-error" {
		t.Fatalf("APIError inesperado: %#v", apiErr)
	}
}

func TestNormalizeApplicationDomain(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{name: "host", input: "wamercio.com", want: "wamercio.com"},
		{name: "url port path", input: "https://WAMERCIO.com:443/admin", want: "wamercio.com"},
		{name: "localhost", input: "localhost:3000", want: "localhost"},
		{name: "wildcard", input: "*.ltd.do", wantErr: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := normalizeApplicationDomain(test.input)
			if test.wantErr {
				if err == nil {
					t.Fatalf("expected error, got %q", got)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got != test.want {
				t.Fatalf("normalizeApplicationDomain(%q) = %q, want %q", test.input, got, test.want)
			}
		})
	}
}
