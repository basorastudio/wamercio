package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	platformPermissionOverview   = "overview.view"
	platformPermissionBusinesses = "businesses.manage"
	platformPermissionPlans      = "plans.manage"
	platformPermissionCatalog    = "catalog.manage"
	platformPermissionCustomers  = "customers.view"
	platformPermissionSettings   = "settings.manage"
	platformPermissionAudit      = "audit.view"
	platformPermissionUsers      = "users.manage"
)

var platformPermissionKeys = []string{
	platformPermissionOverview,
	platformPermissionBusinesses,
	platformPermissionPlans,
	platformPermissionCatalog,
	platformPermissionCustomers,
	platformPermissionSettings,
	platformPermissionAudit,
	platformPermissionUsers,
}

type PlatformUser struct {
	ID                           string          `json:"id"`
	Username                     string          `json:"username"`
	Name                         string          `json:"name"`
	LastName                     string          `json:"last_name"`
	NationalID                   string          `json:"national_id"`
	Whatsapp                     string          `json:"whatsapp"`
	WhatsappDisplay              string          `json:"whatsapp_display"`
	ProfilePictureURL            string          `json:"profile_picture_url"`
	CountryCode                  string          `json:"country_code"`
	DialCode                     string          `json:"dial_code"`
	PasswordHash                 string          `json:"-"`
	Role                         string          `json:"role"`
	Permissions                  json.RawMessage `json:"permissions"`
	Active                       bool            `json:"active"`
	IsRoot                       bool            `json:"is_root"`
	IdentityVerifiedAt           *time.Time      `json:"identity_verified_at,omitempty"`
	IdentityVerificationStatus   string          `json:"identity_verification_status"`
	IdentitySource               string          `json:"identity_source,omitempty"`
	IdentityRequestID            string          `json:"identity_request_id,omitempty"`
	IdentityRequiresConfirmation bool            `json:"identity_requires_confirmation"`
	IdentityConfirmedByUser      bool            `json:"identity_confirmed_by_user"`
	CreatedAt                    time.Time       `json:"created_at"`
	UpdatedAt                    time.Time       `json:"updated_at"`
}

func normalizePlatformRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "superadmin":
		return "superadmin"
	case "administrator":
		return "administrator"
	case "operations":
		return "operations"
	case "support":
		return "support"
	case "auditor":
		return "auditor"
	default:
		return ""
	}
}

func platformRoleLabel(role string) string {
	switch normalizePlatformRole(role) {
	case "superadmin":
		return "Superadministrador"
	case "administrator":
		return "Administrador SaaS"
	case "operations":
		return "Operaciones"
	case "support":
		return "Soporte"
	case "auditor":
		return "Auditor"
	default:
		return "Usuario SaaS"
	}
}

func defaultPlatformPermissions(role string) map[string]bool {
	permissions := map[string]bool{}
	for _, key := range platformPermissionKeys {
		permissions[key] = false
	}
	switch normalizePlatformRole(role) {
	case "superadmin":
		for _, key := range platformPermissionKeys {
			permissions[key] = true
		}
	case "administrator":
		for _, key := range []string{platformPermissionOverview, platformPermissionBusinesses, platformPermissionPlans, platformPermissionCatalog, platformPermissionCustomers, platformPermissionSettings, platformPermissionAudit} {
			permissions[key] = true
		}
	case "operations":
		for _, key := range []string{platformPermissionOverview, platformPermissionBusinesses, platformPermissionCatalog, platformPermissionCustomers, platformPermissionAudit} {
			permissions[key] = true
		}
	case "support":
		for _, key := range []string{platformPermissionOverview, platformPermissionCustomers, platformPermissionAudit} {
			permissions[key] = true
		}
	case "auditor":
		permissions[platformPermissionOverview] = true
		permissions[platformPermissionAudit] = true
	}
	return permissions
}

func normalizedPlatformPermissionsJSON(role string, raw any) string {
	permissions := defaultPlatformPermissions(role)
	switch value := raw.(type) {
	case json.RawMessage:
		var overrides map[string]bool
		if json.Unmarshal(value, &overrides) == nil {
			for key, enabled := range overrides {
				if _, valid := permissions[key]; valid {
					permissions[key] = enabled
				}
			}
		}
	case []byte:
		return normalizedPlatformPermissionsJSON(role, json.RawMessage(value))
	case string:
		return normalizedPlatformPermissionsJSON(role, json.RawMessage(value))
	case map[string]bool:
		for key, enabled := range value {
			if _, valid := permissions[key]; valid {
				permissions[key] = enabled
			}
		}
	case map[string]any:
		for key, candidate := range value {
			if _, valid := permissions[key]; valid {
				if enabled, ok := candidate.(bool); ok {
					permissions[key] = enabled
				}
			}
		}
	}
	if normalizePlatformRole(role) == "superadmin" {
		for _, key := range platformPermissionKeys {
			permissions[key] = true
		}
	}
	payload, _ := json.Marshal(permissions)
	return string(payload)
}

func platformPermissionEnabled(user PlatformUser, permission string) bool {
	if normalizePlatformRole(user.Role) == "superadmin" {
		return true
	}
	permissions := defaultPlatformPermissions(user.Role)
	var stored map[string]bool
	if json.Unmarshal(user.Permissions, &stored) == nil {
		for key, enabled := range stored {
			if _, valid := permissions[key]; valid {
				permissions[key] = enabled
			}
		}
	}
	return permissions[permission]
}

func platformUserScanPtrs(user *PlatformUser) []any {
	return []any{
		&user.ID, &user.Username, &user.Name, &user.LastName, &user.NationalID,
		&user.Whatsapp, &user.WhatsappDisplay, &user.ProfilePictureURL, &user.CountryCode,
		&user.DialCode, &user.PasswordHash, &user.Role, &user.Permissions, &user.Active,
		&user.IsRoot, &user.IdentityVerifiedAt, &user.IdentityVerificationStatus,
		&user.IdentitySource, &user.IdentityRequestID, &user.IdentityRequiresConfirmation,
		&user.IdentityConfirmedByUser, &user.CreatedAt, &user.UpdatedAt,
	}
}

func platformUserSelect(where string) string {
	return `SELECT id::text, username, name, last_name, national_id, whatsapp, whatsapp_display,
		COALESCE(profile_picture_url,''), country_code, dial_code, password_hash, role,
		COALESCE(permissions,'{}'::jsonb), active, is_root, identity_verified_at,
		COALESCE(identity_verification_status,'unverified'), COALESCE(identity_source,''),
		COALESCE(identity_request_id,''), COALESCE(identity_requires_confirmation,false),
		COALESCE(identity_confirmed_by_user,false), created_at, updated_at
		FROM platform_users ` + where
}

func (s *Server) platformDB() AppDB {
	if s.tenantManager != nil && s.tenantManager.CoreDB() != nil {
		return s.tenantManager.CoreDB()
	}
	return s.db
}

func (s *Server) ensurePlatformRootUser(ctx context.Context) (PlatformUser, error) {
	username := strings.TrimSpace(s.cfg.PlatformAdminUsername)
	if username == "" {
		username = "superadmin"
	}
	permissions := normalizedPlatformPermissionsJSON("superadmin", nil)
	_, err := s.platformDB().Exec(ctx, `
		INSERT INTO platform_users (username, name, password_hash, role, permissions, active, is_root)
		VALUES ($1, 'Superadministrador', $2, 'superadmin', $3::jsonb, true, true)
		ON CONFLICT (lower(username)) DO UPDATE
		SET role='superadmin', permissions=$3::jsonb, active=true, is_root=true,
		    password_hash=CASE WHEN trim(platform_users.password_hash)='' THEN EXCLUDED.password_hash ELSE platform_users.password_hash END,
		    updated_at=now()
	`, username, strings.ToLower(strings.TrimSpace(s.cfg.PlatformAdminPasswordSHA256)), permissions)
	if err != nil {
		return PlatformUser{}, err
	}
	return s.platformUserByUsername(ctx, username)
}

func (s *Server) platformUserByUsername(ctx context.Context, username string) (PlatformUser, error) {
	var user PlatformUser
	err := s.platformDB().QueryRow(ctx, platformUserSelect(`WHERE lower(username)=lower($1) LIMIT 1`), strings.TrimSpace(username)).Scan(platformUserScanPtrs(&user)...)
	return user, err
}

func (s *Server) platformSuperadminByLogin(ctx context.Context, login string) (PlatformUser, error) {
	var user PlatformUser
	login = strings.TrimSpace(login)
	whatsapp := normalizeWhatsappDigits(login)
	err := s.platformDB().QueryRow(ctx, platformUserSelect(`
		WHERE active=true
		  AND lower(trim(role)) = 'superadmin'
		  AND (
			lower(username)=lower($1)
			OR (
				$2 <> ''
				AND regexp_replace(whatsapp, '\D', '', 'g') <> ''
				AND (
					regexp_replace(whatsapp, '\D', '', 'g') = $2
					OR right(regexp_replace(whatsapp, '\D', '', 'g'), 10) = right($2, 10)
				)
			)
		  )
		ORDER BY is_root DESC
		LIMIT 1
	`), login, whatsapp).Scan(platformUserScanPtrs(&user)...)
	return user, err
}

func (s *Server) platformUserByWhatsapp(ctx context.Context, whatsapp string) (PlatformUser, error) {
	var user PlatformUser
	digits := normalizeWhatsappDigits(whatsapp)
	if digits == "" {
		return user, pgx.ErrNoRows
	}
	err := s.platformDB().QueryRow(ctx, platformUserSelect(`
		WHERE active=true
		  AND lower(trim(role)) <> 'superadmin'
		  AND regexp_replace(whatsapp, '\D', '', 'g') <> ''
		  AND (
			regexp_replace(whatsapp, '\D', '', 'g') = $1
			OR right(regexp_replace(whatsapp, '\D', '', 'g'), 10) = right($1, 10)
		  )
		LIMIT 1
	`), digits).Scan(platformUserScanPtrs(&user)...)
	return user, err
}

func generatedPlatformUsername(nationalID string) string {
	digits := onlyDigits(nationalID)
	if digits == "" {
		return ""
	}
	return "saas." + digits
}

func (s *Server) platformUserByID(ctx context.Context, id string) (PlatformUser, error) {
	var user PlatformUser
	err := s.platformDB().QueryRow(ctx, platformUserSelect(`WHERE id=$1::uuid LIMIT 1`), id).Scan(platformUserScanPtrs(&user)...)
	return user, err
}

func platformUserFromContext(ctx context.Context) (PlatformUser, bool) {
	user, ok := ctx.Value(platformUserContextKey{}).(PlatformUser)
	return user, ok && strings.TrimSpace(user.Username) != ""
}

func platformPermissionForRequest(r *http.Request) string {
	path := strings.TrimPrefix(r.URL.Path, "/api/platform")
	if path == "/session" || path == "/profile" || path == "/profile/password" {
		return ""
	}
	switch {
	case strings.HasPrefix(path, "/users"):
		return platformPermissionUsers
	case strings.HasPrefix(path, "/audit-logs"):
		return platformPermissionAudit
	case strings.HasPrefix(path, "/overview"), strings.HasPrefix(path, "/capacity"):
		return platformPermissionOverview
	case strings.HasPrefix(path, "/plans"), strings.HasPrefix(path, "/subscriptions"):
		return platformPermissionPlans
	case strings.HasPrefix(path, "/catalog"):
		return platformPermissionCatalog
	case strings.HasPrefix(path, "/customers"):
		return platformPermissionCustomers
	case path == "/identity/verify":
		// Verification is authorized by its dedicated middleware because it is
		// used from both business-registration forms and the settings test panel.
		return ""
	case strings.HasPrefix(path, "/settings"), strings.HasPrefix(path, "/access-policy"), strings.HasPrefix(path, "/banks"), strings.HasPrefix(path, "/waxum"), strings.HasPrefix(path, "/whatsapp"), strings.HasPrefix(path, "/identity"), strings.HasPrefix(path, "/notification-templates"):
		return platformPermissionSettings
	case strings.HasPrefix(path, "/owners"), strings.HasPrefix(path, "/businesses"), strings.HasPrefix(path, "/business-types"), strings.HasPrefix(path, "/territories"), strings.HasPrefix(path, "/domains"), strings.HasPrefix(path, "/databases"):
		return platformPermissionBusinesses
	case r.Method == http.MethodGet:
		return platformPermissionOverview
	default:
		return platformPermissionOverview
	}
}

func (s *Server) requirePlatformPermission(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		permission := platformPermissionForRequest(r)
		if permission == "" {
			next.ServeHTTP(w, r)
			return
		}
		user, ok := platformUserFromContext(r.Context())
		if !ok || !platformPermissionEnabled(user, permission) {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Tu rol no tiene permiso para realizar esta acción en la plataforma"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) platformProfile(w http.ResponseWriter, r *http.Request) {
	user, ok := platformUserFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Sesión de plataforma no válida"})
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) updatePlatformProfile(w http.ResponseWriter, r *http.Request) {
	current, ok := platformUserFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Sesión de plataforma no válida"})
		return
	}
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	updates := normalizePlatformUserInput(input)
	delete(updates, "username")
	delete(updates, "role")
	delete(updates, "permissions")
	delete(updates, "active")
	if value, exists := updates["national_id"]; exists {
		nationalID := normalizeNationalID(fmt.Sprint(value))
		if nationalID != "" && !validDominicanNationalID(nationalID) {
			writeError(w, badRequest("Ingresa una cédula dominicana válida"))
			return
		}
		updates["national_id"] = nationalID
	}
	if value, exists := updates["whatsapp"]; exists {
		whatsapp := strings.TrimSpace(fmt.Sprint(value))
		if whatsapp != "" && len(onlyDigits(whatsapp)) < 10 {
			writeError(w, badRequest("Ingresa un WhatsApp válido"))
			return
		}
	}
	user, err := s.updatePlatformUserFields(r.Context(), current.ID, updates)
	if err != nil {
		writePlatformUserError(w, err)
		return
	}
	s.auditPlatform(r.Context(), current.Username, "", "platform.profile.updated", map[string]any{"user_id": current.ID})
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) updatePlatformPassword(w http.ResponseWriter, r *http.Request) {
	current, ok := platformUserFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Sesión de plataforma no válida"})
		return
	}
	var input struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
		ConfirmPassword string `json:"confirm_password"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if strings.TrimSpace(input.CurrentPassword) == "" {
		writeError(w, badRequest("Ingresa tu contraseña o PIN actual"))
		return
	}
	if err := s.validateNewAccessPIN(r.Context(), input.NewPassword); err != nil || input.NewPassword != input.ConfirmPassword {
		writeError(w, badRequest(fmt.Sprintf("El nuevo PIN debe tener %d dígitos y coincidir", s.accessPINLength(r.Context()))))
		return
	}
	valid, _ := verifyAccessSecret(current.PasswordHash, input.CurrentPassword)
	if !valid {
		writeError(w, apiError{status: http.StatusUnauthorized, msg: "La contraseña o PIN actual no es correcto"})
		return
	}
	hash, err := hashAccessSecret(input.NewPassword)
	if err == nil {
		_, err = s.platformDB().Exec(r.Context(), `UPDATE platform_users SET password_hash=$2, updated_at=now() WHERE id=$1::uuid`, current.ID, hash)
	}
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), current.Username, "", "platform.pin.updated", map[string]any{"user_id": current.ID})
	writeJSON(w, http.StatusOK, map[string]bool{"updated": true})
}

func (s *Server) listPlatformUsers(w http.ResponseWriter, r *http.Request) {
	if _, err := s.ensurePlatformRootUser(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	rows, err := s.platformDB().Query(r.Context(), platformUserSelect(`ORDER BY is_root DESC, created_at ASC`))
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	users := []PlatformUser{}
	for rows.Next() {
		var user PlatformUser
		if err := rows.Scan(platformUserScanPtrs(&user)...); err != nil {
			writeError(w, err)
			return
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, users)
}

func normalizePlatformUserInput(input map[string]any) map[string]any {
	updates := map[string]any{}
	aliases := map[string]string{
		"name": "name", "last_name": "last_name", "national_id": "national_id",
		"whatsapp": "whatsapp", "whatsapp_display": "whatsapp_display", "whatsappDisplay": "whatsapp_display",
		"country_code": "country_code", "countryCode": "country_code", "dial_code": "dial_code", "dialCode": "dial_code",
		"profile_picture_url": "profile_picture_url", "profilePictureUrl": "profile_picture_url",
		"role": "role", "permissions": "permissions", "active": "active",
	}
	for key, column := range aliases {
		if value, exists := input[key]; exists {
			updates[column] = value
		}
	}
	return updates
}

func (s *Server) createPlatformUser(w http.ResponseWriter, r *http.Request) {
	current, _ := platformUserFromContext(r.Context())
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}

	identityInput := platformUserIdentityInput{
		Name:              str(input, "name"),
		LastName:          str(input, "last_name"),
		NationalID:        str(input, "national_id"),
		IdentityConfirmed: boolDefault(input, "identity_confirmed", false),
	}
	identityInput.NationalID = normalizeNationalID(identityInput.NationalID)
	whatsapp := strings.TrimSpace(str(input, "whatsapp"))
	role := normalizePlatformRole(str(input, "role"))
	pin := strings.TrimSpace(str(input, "pin"))

	if identityInput.NationalID == "" || whatsapp == "" {
		writeError(w, badRequest("Cédula y WhatsApp son requeridos"))
		return
	}
	if !validDominicanNationalID(identityInput.NationalID) {
		writeError(w, badRequest("Ingresa una cédula dominicana válida"))
		return
	}
	if len(onlyDigits(whatsapp)) < 10 {
		writeError(w, badRequest("Ingresa un WhatsApp válido"))
		return
	}
	if err := s.validateNewAccessPIN(r.Context(), pin); err != nil {
		writeError(w, err)
		return
	}
	if role == "" {
		writeError(w, badRequest("Selecciona un rol de plataforma válido"))
		return
	}
	if role == "superadmin" && normalizePlatformRole(current.Role) != "superadmin" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Solo un superadministrador puede crear otro superadministrador"})
		return
	}

	verifiedInput, identityVerification, err := s.verifyPlatformUserIdentityForSave(r.Context(), identityInput, requestTraceID(r), identityDeviceKeyFromRequest(r))
	if err != nil {
		writeError(w, err)
		return
	}
	if verifiedInput.Name == "" || verifiedInput.LastName == "" {
		writeError(w, badRequest("Nombre y apellido son requeridos"))
		return
	}

	username := generatedPlatformUsername(verifiedInput.NationalID)
	hash, err := hashAccessSecret(pin)
	if err != nil {
		writeError(w, err)
		return
	}
	permissions := normalizedPlatformPermissionsJSON(role, input["permissions"])
	var user PlatformUser
	err = s.platformDB().QueryRow(r.Context(), `
		INSERT INTO platform_users (
			username, name, last_name, national_id, whatsapp, whatsapp_display, profile_picture_url,
			country_code, dial_code, password_hash, role, permissions, active,
			identity_verified_at, identity_verification_status, identity_source, identity_request_id,
			identity_requires_confirmation, identity_confirmed_by_user
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$19)
		RETURNING id::text, username, name, last_name, national_id, whatsapp, whatsapp_display,
			COALESCE(profile_picture_url,''), country_code, dial_code, password_hash, role, permissions,
			active, is_root, identity_verified_at, identity_verification_status, identity_source,
			identity_request_id, identity_requires_confirmation, identity_confirmed_by_user,
			created_at, updated_at
	`, username, verifiedInput.Name, verifiedInput.LastName, verifiedInput.NationalID, whatsapp, strEither(input, "whatsapp_display", "whatsappDisplay"), strEither(input, "profile_picture_url", "profilePictureUrl"), strDefaultEither(input, "country_code", "countryCode", "do"), strDefaultEither(input, "dial_code", "dialCode", "+1"), hash, role, permissions, boolDefault(input, "active", true), identityVerification.VerifiedAt, identityVerification.Status, identityVerification.Source, identityVerification.RequestID, identityVerification.RequiresConfirmation, identityVerification.ConfirmedByUser).Scan(platformUserScanPtrs(&user)...)
	if err != nil {
		writePlatformUserError(w, err)
		return
	}
	s.auditPlatform(r.Context(), current.Username, "", "platform.user.created", map[string]any{
		"user_id":         user.ID,
		"role":            user.Role,
		"national_id":     maskIdentityDocument(user.NationalID),
		"identity_status": user.IdentityVerificationStatus,
	})
	writeJSON(w, http.StatusCreated, user)
}

func (s *Server) updatePlatformUser(w http.ResponseWriter, r *http.Request) {
	current, _ := platformUserFromContext(r.Context())
	id := chi.URLParam(r, "id")
	target, err := s.platformUserByID(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Usuario de plataforma no encontrado"})
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	if normalizePlatformRole(target.Role) == "superadmin" && normalizePlatformRole(current.Role) != "superadmin" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Solo un superadministrador puede modificar otra cuenta de superadministración"})
		return
	}
	if target.IsRoot && target.ID != current.ID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "La cuenta raíz solo puede editarse desde Mi perfil"})
		return
	}
	var input map[string]any
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	updates := normalizePlatformUserInput(input)
	if target.IsRoot {
		delete(updates, "role")
		delete(updates, "permissions")
		delete(updates, "active")
	}
	if value, exists := updates["role"]; exists {
		role := normalizePlatformRole(fmt.Sprint(value))
		if role == "" {
			writeError(w, badRequest("Selecciona un rol de plataforma válido"))
			return
		}
		if role == "superadmin" && normalizePlatformRole(current.Role) != "superadmin" {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Solo un superadministrador puede asignar ese rol"})
			return
		}
		updates["role"] = role
	}
	if value, exists := updates["national_id"]; exists {
		nationalID := normalizeNationalID(fmt.Sprint(value))
		if nationalID == "" || !validDominicanNationalID(nationalID) {
			writeError(w, badRequest("Ingresa una cédula dominicana válida"))
			return
		}
		updates["national_id"] = nationalID
	}
	if value, exists := updates["whatsapp"]; exists && len(onlyDigits(fmt.Sprint(value))) < 10 {
		writeError(w, badRequest("Ingresa un WhatsApp válido"))
		return
	}
	if target.ID == current.ID {
		if active, exists := updates["active"]; exists && !boolDefault(map[string]any{"active": active}, "active", true) {
			writeError(w, badRequest("No puedes desactivar tu propia cuenta"))
			return
		}
	}
	if !target.IsRoot {
		nextName := target.Name
		if value, exists := updates["name"]; exists {
			nextName = fmt.Sprint(value)
		}
		nextLastName := target.LastName
		if value, exists := updates["last_name"]; exists {
			nextLastName = fmt.Sprint(value)
		}
		nextNationalID := target.NationalID
		if value, exists := updates["national_id"]; exists {
			nextNationalID = fmt.Sprint(value)
		}
		identityChanged := target.IdentityVerificationStatus != "verified" ||
			normalizeNationalID(nextNationalID) != normalizeNationalID(target.NationalID) ||
			normalizePersonName(nextName) != normalizePersonName(target.Name) ||
			normalizePersonName(nextLastName) != normalizePersonName(target.LastName)
		if identityChanged {
			verifiedInput, verification, verifyErr := s.verifyPlatformUserIdentityForSave(r.Context(), platformUserIdentityInput{
				Name:              nextName,
				LastName:          nextLastName,
				NationalID:        nextNationalID,
				IdentityConfirmed: boolDefault(input, "identity_confirmed", target.IdentityConfirmedByUser),
			}, requestTraceID(r), identityDeviceKeyFromRequest(r))
			if verifyErr != nil {
				writeError(w, verifyErr)
				return
			}
			updates["name"] = verifiedInput.Name
			updates["last_name"] = verifiedInput.LastName
			updates["national_id"] = verifiedInput.NationalID
			updates["identity_verified_at"] = verification.VerifiedAt
			updates["identity_verification_status"] = verification.Status
			updates["identity_source"] = verification.Source
			updates["identity_request_id"] = verification.RequestID
			updates["identity_requires_confirmation"] = verification.RequiresConfirmation
			updates["identity_confirmed_by_user"] = verification.ConfirmedByUser
		}
	}
	if pin := strings.TrimSpace(str(input, "pin")); pin != "" {
		if err := s.validateNewAccessPIN(r.Context(), pin); err != nil {
			writeError(w, err)
			return
		}
		hash, hashErr := hashAccessSecret(pin)
		if hashErr != nil {
			writeError(w, hashErr)
			return
		}
		updates["password_hash"] = hash
	}
	role := target.Role
	if value, exists := updates["role"]; exists {
		role = fmt.Sprint(value)
	}
	if raw, exists := input["permissions"]; exists {
		updates["permissions"] = normalizedPlatformPermissionsJSON(role, raw)
	} else if _, changed := updates["role"]; changed {
		updates["permissions"] = normalizedPlatformPermissionsJSON(role, nil)
	}
	user, err := s.updatePlatformUserFields(r.Context(), id, updates)
	if err != nil {
		writePlatformUserError(w, err)
		return
	}
	s.auditPlatform(r.Context(), current.Username, "", "platform.user.updated", map[string]any{"user_id": user.ID, "role": user.Role, "active": user.Active})
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) updatePlatformUserFields(ctx context.Context, id string, updates map[string]any) (PlatformUser, error) {
	allowed := map[string]string{
		"name": "name", "last_name": "last_name", "national_id": "national_id", "whatsapp": "whatsapp",
		"whatsapp_display": "whatsapp_display", "country_code": "country_code", "dial_code": "dial_code",
		"profile_picture_url": "profile_picture_url", "password_hash": "password_hash", "role": "role",
		"permissions": "permissions", "active": "active", "identity_verified_at": "identity_verified_at",
		"identity_verification_status": "identity_verification_status", "identity_source": "identity_source",
		"identity_request_id": "identity_request_id", "identity_requires_confirmation": "identity_requires_confirmation",
		"identity_confirmed_by_user": "identity_confirmed_by_user",
	}
	set, args := buildSet(updates, allowed)
	if set == "" {
		return s.platformUserByID(ctx, id)
	}
	set += ", updated_at=now()"
	args = append([]any{id}, args...)
	var user PlatformUser
	err := s.platformDB().QueryRow(ctx, `UPDATE platform_users SET `+set+` WHERE id=$1::uuid RETURNING id::text, username, name, last_name, national_id, whatsapp, whatsapp_display, COALESCE(profile_picture_url,''), country_code, dial_code, password_hash, role, permissions, active, is_root, identity_verified_at, identity_verification_status, identity_source, identity_request_id, identity_requires_confirmation, identity_confirmed_by_user, created_at, updated_at`, args...).Scan(platformUserScanPtrs(&user)...)
	return user, err
}

func (s *Server) deletePlatformUser(w http.ResponseWriter, r *http.Request) {
	current, _ := platformUserFromContext(r.Context())
	target, err := s.platformUserByID(r.Context(), chi.URLParam(r, "id"))
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Usuario de plataforma no encontrado"})
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	if target.IsRoot {
		writeError(w, badRequest("La cuenta raíz de plataforma no puede desactivarse"))
		return
	}
	if target.ID == current.ID {
		writeError(w, badRequest("No puedes desactivar tu propia cuenta"))
		return
	}
	_, err = s.platformDB().Exec(r.Context(), `UPDATE platform_users SET active=false, updated_at=now() WHERE id=$1::uuid`, target.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), current.Username, "", "platform.user.deactivated", map[string]any{"user_id": target.ID})
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true, "deactivated": true})
}

func writePlatformUserError(w http.ResponseWriter, err error) {
	var databaseError *pgconn.PgError
	if errors.As(err, &databaseError) && databaseError.Code == "23505" {
		message := "Ya existe un usuario de plataforma con esos datos"
		switch databaseError.ConstraintName {
		case "idx_platform_users_username_unique":
			message = "No se pudo generar un identificador interno único para este usuario"
		case "idx_platform_users_national_id_unique_not_blank":
			message = "Ya existe un usuario de plataforma con esa cédula"
		case "idx_platform_users_whatsapp_unique_not_blank":
			message = "Ya existe un usuario de plataforma con ese WhatsApp"
		}
		writeError(w, apiError{status: http.StatusConflict, msg: message})
		return
	}
	writeError(w, err)
}
