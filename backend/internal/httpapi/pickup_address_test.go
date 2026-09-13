package httpapi

import "testing"

func TestStorePickupAddressLineUsesCompactStructuredAddress(t *testing.T) {
	store := Store{
		Address:      "Manuela Die #27, Brisas del Yuna, Bonao, Monseñor Nouel",
		Street:       "Manuela Die",
		StreetNumber: "27",
		Neighborhood: "Brisas del Yuna",
		Municipality: "Bonao",
		Province:     "Monseñor Nouel",
	}

	got := storePickupAddressLine(store)
	want := "Manuela Die #27, Brisas del Yuna, Bonao"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestStorePickupAddressLineFallsBackWithoutRepeatingSegments(t *testing.T) {
	store := Store{Address: "Calle Duarte #10, Centro, Santiago, Santiago"}

	got := storePickupAddressLine(store)
	want := "Calle Duarte #10, Centro, Santiago"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}
