package httpapi

import "testing"

func TestMergePlatformLegalSettingsPreservesDocumentDefaults(t *testing.T) {
	merged := mergePlatformLegalSettings(map[string]any{
		"version": "2.0",
		"terms": map[string]any{
			"title": "Condiciones actualizadas",
		},
	})
	if merged["version"] != "2.0" {
		t.Fatalf("version = %v, want 2.0", merged["version"])
	}
	terms, ok := merged["terms"].(map[string]any)
	if !ok {
		t.Fatalf("terms type = %T, want map[string]any", merged["terms"])
	}
	if terms["title"] != "Condiciones actualizadas" {
		t.Fatalf("terms title = %v", terms["title"])
	}
	if terms["intro"] == "" || terms["sections"] == nil {
		t.Fatal("document defaults must remain available after a partial update")
	}
}
