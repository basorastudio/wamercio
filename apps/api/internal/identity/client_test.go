package identity

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestVerifyPersonSendsRequiredHeadersAndParsesResponse(t *testing.T) {
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/identidad/verificar" {
			t.Fatalf("path: %s", r.URL.Path)
		}
		if r.Header.Get("X-API-Key") != "secret" {
			t.Fatalf("missing api key")
		}
		if r.Header.Get("X-Client-ID") != "wamercio" {
			t.Fatalf("missing client id")
		}
		if r.Header.Get("X-Application-Domain") != "app.example.do" {
			t.Fatalf("missing app domain")
		}
		if r.Header.Get("X-Usage-Context") != "registro_cliente" {
			t.Fatalf("missing context")
		}
		if r.Header.Get("X-Request-ID") != "req-1" {
			t.Fatalf("missing request id")
		}
		_ = json.NewDecoder(r.Body).Decode(&got)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"tipo_sujeto":"persona","tipo_documento":"cedula","documento":"00100000000","contexto":"registro_cliente","valida":true,"encontrada":true,"puede_autocompletar":true,"requiere_confirmacion":false,"puede_registrarse":true,"fuente":"mirex","persona":{"cedula":"001-0000000-0","nombre_completo":"ANA PRUEBA","nombres":"ANA","apellidos":"PRUEBA","primer_nombre":"ANA","primer_apellido":"PRUEBA","fecha_nacimiento":"1990-05-16","sexo":"F","separacion_nombre_confiable":true}},"meta":{"request_id":"req-1","timestamp":"2026-09-05T00:00:00Z"}}`))
	}))
	defer srv.Close()

	c := New(srv.URL, "secret", "wamercio", "app.example.do", "hash-secret")
	v, err := c.Verify(context.Background(), "persona", "001-0000000-0", "registro_cliente", "req-1")
	if err != nil {
		t.Fatal(err)
	}
	if got["documento"] != "00100000000" {
		t.Fatalf("document normalization: %#v", got["documento"])
	}
	if v.Person == nil || v.Person.NombreCompleto != "ANA PRUEBA" || v.Person.FechaNacimiento != "1990-05-16" || v.Person.Sexo != "F" {
		t.Fatalf("bad person: %#v", v.Person)
	}
	if !v.PuedeRegistrarse || !v.PuedeAutocompletar || v.RequestID != "req-1" {
		t.Fatalf("bad verification: %#v", v)
	}
}

func TestDocumentHashAndMask(t *testing.T) {
	c := New("http://example.invalid", "x", "", "", "secret")
	a := c.DocumentHash("001-0000000-0")
	b := c.DocumentHash("00100000000")
	if a == "" || a != b {
		t.Fatalf("hash should normalize document")
	}
	if a == "00100000000" {
		t.Fatalf("raw document leaked as hash")
	}
	if got := MaskDocument("001-0000000-0"); got != "*******0000" {
		t.Fatalf("mask = %q", got)
	}
}
