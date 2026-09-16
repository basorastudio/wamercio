package httpapi

import "testing"

func TestBulkTableNamesNumeric(t *testing.T) {
	got := bulkTableNames("Mesa", "numeric", 3)
	want := []string{"Mesa 1", "Mesa 2", "Mesa 3"}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("bulkTableNames numeric[%d]=%q, want %q", i, got[i], want[i])
		}
	}
}

func TestBulkTableNamesAlphabeticContinuesAfterZ(t *testing.T) {
	got := bulkTableNames("VIP", "alphabetic", 27)
	if got[0] != "VIP A" || got[25] != "VIP Z" || got[26] != "VIP AA" {
		t.Fatalf("unexpected alphabetic sequence: first=%q z=%q aa=%q", got[0], got[25], got[26])
	}
}

func TestBulkTableNamesMixed(t *testing.T) {
	got := bulkTableNames("Box", "mixed", 3)
	want := []string{"Box A1", "Box A2", "Box A3"}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("bulkTableNames mixed[%d]=%q, want %q", i, got[i], want[i])
		}
	}
}
