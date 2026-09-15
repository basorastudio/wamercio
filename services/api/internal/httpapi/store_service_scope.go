package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
)

const (
	storeScopeNational   = "national"
	storeScopeProvincial = "provincial"
	storeScopeMunicipal  = "municipal"
)

type storeServiceTerritory struct {
	Scope        string
	ProvinceCode string
	Province     string
	CityID       string
	Municipality string
}

func normalizeStoreServiceScope(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case storeScopeProvincial:
		return storeScopeProvincial
	case storeScopeMunicipal:
		return storeScopeMunicipal
	default:
		return storeScopeNational
	}
}

func normalizedStoreServiceTerritory(scope storeServiceTerritory) storeServiceTerritory {
	scope.Scope = normalizeStoreServiceScope(scope.Scope)
	scope.ProvinceCode = strings.TrimSpace(scope.ProvinceCode)
	scope.Province = strings.TrimSpace(scope.Province)
	scope.CityID = strings.TrimSpace(scope.CityID)
	scope.Municipality = strings.TrimSpace(scope.Municipality)
	return scope
}

func validateStoreServiceTerritory(scope storeServiceTerritory) error {
	scope = normalizedStoreServiceTerritory(scope)
	if scope.Scope == storeScopeProvincial || scope.Scope == storeScopeMunicipal {
		if scope.ProvinceCode == "" && scope.Province == "" {
			return errors.New("Define la provincia del negocio antes de limitar el alcance")
		}
	}
	if scope.Scope == storeScopeMunicipal {
		if scope.CityID == "" && scope.Municipality == "" {
			return errors.New("Define el municipio o distrito del negocio antes de usar alcance municipal")
		}
	}
	return nil
}

func applyStoreServiceScopeToAddress(scope storeServiceTerritory, in customerAddressInput) (customerAddressInput, error) {
	scope = normalizedStoreServiceTerritory(scope)
	in = normalizeCustomerAddress(in)
	if err := validateStoreServiceTerritory(scope); err != nil {
		return in, err
	}
	if scope.Scope == storeScopeProvincial || scope.Scope == storeScopeMunicipal {
		in.ProvinceCode = scope.ProvinceCode
		in.Province = scope.Province
	}
	if scope.Scope == storeScopeMunicipal {
		in.CityID = scope.CityID
		in.Municipality = scope.Municipality
	}
	return in, nil
}

func equalTerritoryValue(leftID, leftName, rightID, rightName string) bool {
	leftID = strings.TrimSpace(leftID)
	rightID = strings.TrimSpace(rightID)
	if leftID != "" && rightID != "" {
		return strings.EqualFold(leftID, rightID)
	}
	return strings.EqualFold(strings.TrimSpace(leftName), strings.TrimSpace(rightName))
}

func addressMatchesStoreServiceScope(scope storeServiceTerritory, in customerAddressInput) bool {
	scope = normalizedStoreServiceTerritory(scope)
	in = normalizeCustomerAddress(in)
	if validateStoreServiceTerritory(scope) != nil {
		return false
	}
	switch scope.Scope {
	case storeScopeProvincial:
		return equalTerritoryValue(scope.ProvinceCode, scope.Province, in.ProvinceCode, in.Province)
	case storeScopeMunicipal:
		return equalTerritoryValue(scope.ProvinceCode, scope.Province, in.ProvinceCode, in.Province) && equalTerritoryValue(scope.CityID, scope.Municipality, in.CityID, in.Municipality)
	default:
		return true
	}
}

func (s *Server) storeServiceTerritoryByID(ctx context.Context, storeID string) (storeServiceTerritory, error) {
	var out storeServiceTerritory
	err := s.db.QueryRow(ctx, `SELECT coalesce(service_scope,'national'),coalesce(province_code,''),coalesce(province,''),coalesce(city_id,''),coalesce(municipality,'') FROM stores WHERE id=$1 AND is_active=true`, storeID).Scan(&out.Scope, &out.ProvinceCode, &out.Province, &out.CityID, &out.Municipality)
	if err != nil {
		return out, err
	}
	out = normalizedStoreServiceTerritory(out)
	return out, nil
}

func (s *Server) storeServiceTerritoryForRequest(r *http.Request) (storeServiceTerritory, bool) {
	resolved, err := s.resolveStoreHost(r.Context(), s.requestHostname(r))
	if err != nil || resolved.StoreID == "" {
		return storeServiceTerritory{Scope: storeScopeNational}, false
	}
	scope, err := s.storeServiceTerritoryByID(r.Context(), resolved.StoreID)
	if err != nil {
		return storeServiceTerritory{Scope: storeScopeNational}, false
	}
	return scope, true
}
