package httpapi

import "testing"

func TestCatalogImportWindowCapsLargeBatches(t *testing.T) {
	if catalogImportMaxBatchSize != 100 {
		t.Fatalf("catalogImportMaxBatchSize = %d, want 100", catalogImportMaxBatchSize)
	}
	start, end := catalogImportWindow(7_611, 0, 250)
	if start != 0 || end != catalogImportMaxBatchSize {
		t.Fatalf("catalogImportWindow() = (%d, %d), want (0, %d)", start, end, catalogImportMaxBatchSize)
	}
}

func TestCatalogImportWindowClampsFinalBatch(t *testing.T) {
	start, end := catalogImportWindow(7_611, 7_600, catalogImportMaxBatchSize)
	if start != 7_600 || end != 7_611 {
		t.Fatalf("catalogImportWindow() = (%d, %d), want (7600, 7611)", start, end)
	}
}

func TestCatalogImportWindowNormalizesInvalidValues(t *testing.T) {
	start, end := catalogImportWindow(12, -4, 0)
	if start != 0 || end != 12 {
		t.Fatalf("catalogImportWindow() = (%d, %d), want (0, 12)", start, end)
	}
}
