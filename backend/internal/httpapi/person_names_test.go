package httpapi

import "testing"

func TestNormalizePersonName(t *testing.T) {
	t.Parallel()

	tests := map[string]string{
		"ALFREDO PEREZ BASORA":        "Alfredo Perez Basora",
		"  maría   josé  de la cruz ": "María José De La Cruz",
		"ANA-MARÍA O'NEILL":           "Ana-María O'Neill",
		"josé ángel núñez":            "José Ángel Núñez",
		"":                            "",
	}

	for input, expected := range tests {
		input, expected := input, expected
		t.Run(input, func(t *testing.T) {
			t.Parallel()
			if actual := normalizePersonName(input); actual != expected {
				t.Fatalf("normalizePersonName(%q) = %q; expected %q", input, actual, expected)
			}
		})
	}
}
