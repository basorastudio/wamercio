package httpapi

import (
	"reflect"
	"testing"
)

func TestExtractNotificationTemplateVariables(t *testing.T) {
	body := "Hola {{ cliente }}, pedido {{pedido_id}} en {{negocio}}. Repite {{cliente}}."
	got := extractNotificationTemplateVariables(body)
	want := []string{"cliente", "negocio", "pedido_id"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("variables = %#v, want %#v", got, want)
	}
}

func TestRenderNotificationTemplateBody(t *testing.T) {
	body := "Hola {{cliente}}\n\nTu pedido {{pedido_id}} está {{estado}}.\n{{desconocida}}"
	got := renderNotificationTemplateBody(body, map[string]string{
		"cliente":   "Ana",
		"pedido_id": "#42",
		"estado":    "listo",
	})
	want := "Hola Ana\n\nTu pedido #42 está listo."
	if got != want {
		t.Fatalf("rendered = %q, want %q", got, want)
	}
}

func TestNormalizeNotificationTemplateCategory(t *testing.T) {
	if got := normalizeNotificationTemplateCategory("Pagos y Fiado"); got != "pagos-y-fiado" {
		t.Fatalf("category = %q", got)
	}
}
