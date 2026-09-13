package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

const (
	permissionSalesView      = "sales.view"
	permissionSalesCreate    = "sales.create"
	permissionCustomersView  = "customers.view"
	permissionCreditCollect  = "credit.collect"
	permissionCashManage     = "cash.manage"
	permissionDeliveryManage = "delivery.manage"
)

var staffPermissionKeys = []string{
	permissionSalesView,
	permissionSalesCreate,
	permissionCustomersView,
	permissionCreditCollect,
	permissionCashManage,
	permissionDeliveryManage,
}

func normalizedStaffPermissionsJSON(role string, raw any) string {
	permissions := defaultStaffPermissions(role)
	if raw != nil {
		encoded, err := json.Marshal(raw)
		if err == nil {
			var explicit map[string]bool
			if json.Unmarshal(encoded, &explicit) == nil {
				for _, key := range staffPermissionKeys {
					if value, ok := explicit[key]; ok {
						permissions[key] = value
					}
				}
			}
		}
	}
	if normalizeStaffRole(role) == "administrator" {
		for _, key := range staffPermissionKeys {
			permissions[key] = true
		}
	}
	payload, _ := json.Marshal(permissions)
	return string(payload)
}

func defaultStaffPermissions(role string) map[string]bool {
	switch normalizeStaffRole(role) {
	case "administrator":
		return map[string]bool{
			permissionSalesView: true, permissionSalesCreate: true, permissionCustomersView: true,
			permissionCreditCollect: true, permissionCashManage: true, permissionDeliveryManage: true,
		}
	case "cashier":
		return map[string]bool{
			permissionSalesView: true, permissionSalesCreate: true, permissionCustomersView: true,
			permissionCreditCollect: true, permissionCashManage: true, permissionDeliveryManage: false,
		}
	case "delivery_driver":
		return map[string]bool{
			permissionSalesView: false, permissionSalesCreate: false, permissionCustomersView: false,
			permissionCreditCollect: false, permissionCashManage: false, permissionDeliveryManage: true,
		}
	default:
		return map[string]bool{}
	}
}

func defaultStaffPermissionsJSON(role string) string {
	payload, _ := json.Marshal(defaultStaffPermissions(role))
	return string(payload)
}

func staffPermissionEnabled(user StaffUser, permission string) bool {
	role := normalizeStaffRole(user.Role)
	if role == "administrator" {
		return true
	}
	permissions := defaultStaffPermissions(role)
	if len(user.Permissions) > 0 && string(user.Permissions) != "null" {
		var explicit map[string]bool
		if json.Unmarshal(user.Permissions, &explicit) == nil {
			for key, value := range explicit {
				permissions[strings.TrimSpace(key)] = value
			}
		}
	}
	return permissions[permission]
}

func (s *Server) requireBusinessPermission(permission string, allowedRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			candidates := sessionTokenCandidates(r, adminSessionCookie, staffSessionCookie)
			if len(candidates) == 0 {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Sesión requerida"})
				return
			}
			for _, token := range candidates {
				if payload, err := s.validateAdminTokenPayload(r.Context(), token); err == nil {
					ctx := context.WithValue(r.Context(), adminUserContextKey{}, payload.Username)
					ctx = context.WithValue(ctx, adminTenantIDsContextKey{}, payload.TenantIDs)
					setRequestActor(ctx, payload.Username, "administrator")
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}
			for _, token := range candidates {
				user, err := s.validateStaffToken(r.Context(), token)
				if err != nil {
					continue
				}
				role := normalizeStaffRole(user.Role)
				roleAllowed := len(allowedRoles) == 0
				for _, allowedRole := range allowedRoles {
					if role == normalizeStaffRole(allowedRole) {
						roleAllowed = true
						break
					}
				}
				if !roleAllowed || !staffPermissionEnabled(user, permission) {
					writeJSON(w, http.StatusForbidden, map[string]string{"error": "No tienes permisos para realizar esta acción"})
					return
				}
				ctx := context.WithValue(r.Context(), staffUserContextKey{}, user)
				setRequestActor(ctx, user.ID, role)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Sesión expirada o inválida"})
		})
	}
}
