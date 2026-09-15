package httpapi

import "testing"

func TestApplyStoreServiceScopeNationalKeepsCustomerTerritory(t *testing.T) {
	in := customerAddressInput{ProvinceCode: "01", Province: "Distrito Nacional", CityID: "dn-1", Municipality: "Santo Domingo", NeighborhoodID: "n-1", Neighborhood: "Gazcue"}
	got, err := applyStoreServiceScopeToAddress(storeServiceTerritory{Scope: "national", ProvinceCode: "28", Province: "Monseñor Nouel", CityID: "bonao", Municipality: "Bonao"}, in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.ProvinceCode != in.ProvinceCode || got.CityID != in.CityID || got.NeighborhoodID != in.NeighborhoodID {
		t.Fatalf("national scope changed address: %#v", got)
	}
}

func TestApplyStoreServiceScopeProvincialPinsProvince(t *testing.T) {
	in := customerAddressInput{ProvinceCode: "01", Province: "Distrito Nacional", CityID: "bonao", Municipality: "Bonao", NeighborhoodID: "n-1", Neighborhood: "Los Transformadores"}
	got, err := applyStoreServiceScopeToAddress(storeServiceTerritory{Scope: "provincial", ProvinceCode: "28", Province: "Monseñor Nouel"}, in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.ProvinceCode != "28" || got.Province != "Monseñor Nouel" {
		t.Fatalf("province was not pinned to store: %#v", got)
	}
	if got.CityID != "bonao" || got.Municipality != "Bonao" {
		t.Fatalf("provincial scope must preserve customer city: %#v", got)
	}
}

func TestApplyStoreServiceScopeMunicipalPinsProvinceAndCity(t *testing.T) {
	in := customerAddressInput{ProvinceCode: "01", Province: "Distrito Nacional", CityID: "other", Municipality: "Otro", NeighborhoodID: "n-1", Neighborhood: "Los Transformadores"}
	got, err := applyStoreServiceScopeToAddress(storeServiceTerritory{Scope: "municipal", ProvinceCode: "28", Province: "Monseñor Nouel", CityID: "bonao", Municipality: "Bonao"}, in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.ProvinceCode != "28" || got.Province != "Monseñor Nouel" || got.CityID != "bonao" || got.Municipality != "Bonao" {
		t.Fatalf("municipal scope did not pin store territory: %#v", got)
	}
	if got.NeighborhoodID != "n-1" || got.Neighborhood != "Los Transformadores" {
		t.Fatalf("municipal scope must preserve customer neighborhood: %#v", got)
	}
}

func TestApplyStoreServiceScopeRequiresAnchor(t *testing.T) {
	_, err := applyStoreServiceScopeToAddress(storeServiceTerritory{Scope: "municipal", Province: "Monseñor Nouel"}, customerAddressInput{Neighborhood: "Centro"})
	if err == nil {
		t.Fatal("expected municipal scope without city anchor to fail")
	}
}

func TestAddressMatchesStoreServiceScopeRejectsLegacyOutsideAddress(t *testing.T) {
	scope := storeServiceTerritory{Scope: "municipal", ProvinceCode: "28", Province: "Monseñor Nouel", CityID: "bonao", Municipality: "Bonao"}
	outside := customerAddressInput{ProvinceCode: "28", Province: "Monseñor Nouel", CityID: "maimon", Municipality: "Maimón", Neighborhood: "Centro", Street: "Duarte", StreetNumber: "1"}
	if addressMatchesStoreServiceScope(scope, outside) {
		t.Fatal("legacy address outside municipal scope must not match")
	}
	inside := customerAddressInput{ProvinceCode: "28", Province: "Monseñor Nouel", CityID: "bonao", Municipality: "Bonao", Neighborhood: "Centro", Street: "Duarte", StreetNumber: "1"}
	if !addressMatchesStoreServiceScope(scope, inside) {
		t.Fatal("address inside municipal scope should match")
	}
}
