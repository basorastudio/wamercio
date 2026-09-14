package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	authpkg "wamercio/services/api/internal/auth"
)

type customerAddressInput struct {
	Label          string `json:"label"`
	ProvinceCode   string `json:"province_code"`
	Province       string `json:"province"`
	CityID         string `json:"city_id"`
	Municipality   string `json:"municipality"`
	NeighborhoodID string `json:"neighborhood_id"`
	Neighborhood   string `json:"neighborhood"`
	Street         string `json:"street"`
	StreetNumber   string `json:"street_number"`
	Reference      string `json:"reference"`
	IsPrimary      bool   `json:"is_primary"`
}

func normalizeCustomerAddress(in customerAddressInput) customerAddressInput {
	in.Label = strings.TrimSpace(in.Label)
	if in.Label == "" {
		in.Label = "Principal"
	}
	in.ProvinceCode = strings.TrimSpace(in.ProvinceCode)
	in.Province = strings.TrimSpace(in.Province)
	in.CityID = strings.TrimSpace(in.CityID)
	in.Municipality = strings.TrimSpace(in.Municipality)
	in.NeighborhoodID = strings.TrimSpace(in.NeighborhoodID)
	in.Neighborhood = strings.TrimSpace(in.Neighborhood)
	in.Street = strings.TrimSpace(in.Street)
	in.StreetNumber = strings.TrimSpace(in.StreetNumber)
	in.Reference = strings.TrimSpace(in.Reference)
	return in
}

func customerAddressText(in customerAddressInput) string {
	in = normalizeCustomerAddress(in)
	parts := []string{}
	street := strings.TrimSpace(strings.TrimSpace(in.Street) + " " + strings.TrimSpace(in.StreetNumber))
	for _, value := range []string{street, in.Neighborhood, in.Municipality, in.Province} {
		if value != "" {
			parts = append(parts, value)
		}
	}
	return strings.Join(parts, ", ")
}

func (s *Server) syncGlobalCustomerWhatsAppProfile(ctx context.Context, r *http.Request, customerID, phone string) {
	phone = normalizePhone(phone)
	if customerID == "" || phone == "" {
		return
	}
	var updatedAt *time.Time
	var currentURL string
	if err := s.db.QueryRow(ctx, `SELECT coalesce(profile_picture_url,''),profile_picture_updated_at FROM global_customers WHERE id=$1`, customerID).Scan(&currentURL, &updatedAt); err == nil && updatedAt != nil && time.Since(*updatedAt) < 6*time.Hour {
		return
	}
	// Customer identity is global, so prefer the platform WhatsApp session. It is
	// also the session already used to validate WhatsApp during registration.
	// Fall back to the current store session because contact privacy may allow
	// the business session to see a picture hidden from the platform session.
	profileCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	out, err := s.bridgeReq(profileCtx, http.MethodPost, "/sessions/support/profile", map[string]any{"phone": phone})
	resolved, resolveErr := s.resolveStoreHost(ctx, s.requestHostname(r))
	if err != nil && resolveErr == nil && resolved.StoreID != "" {
		out, err = s.bridgeReq(profileCtx, http.MethodPost, "/sessions/"+resolved.StoreID+"/profile", map[string]any{"phone": phone})
	}
	if err != nil {
		return
	}
	whatsappName := strings.TrimSpace(str(out["whatsapp_name"]))
	pictureURL := strings.TrimSpace(str(out["profile_picture_url"]))
	pictureID := strings.TrimSpace(str(out["profile_picture_id"]))
	_, _ = s.db.Exec(ctx, `UPDATE global_customers SET whatsapp_name=coalesce(nullif($1,''),whatsapp_name),profile_picture_url=coalesce(nullif($2,''),profile_picture_url),profile_picture_id=coalesce(nullif($3,''),profile_picture_id),profile_picture_updated_at=now(),updated_at=now() WHERE id=$4`, whatsappName, pictureURL, pictureID, customerID)
	if resolveErr == nil && resolved.StoreID != "" {
		_, _ = s.db.Exec(ctx, `UPDATE conversations SET whatsapp_name=coalesce(nullif($1,''),whatsapp_name),profile_picture_url=coalesce(nullif($2,''),profile_picture_url),profile_picture_id=coalesce(nullif($3,''),profile_picture_id),profile_picture_updated_at=now(),updated_at=now() WHERE store_id=$4 AND regexp_replace(coalesce(whatsapp_phone,''),'[^0-9]','','g')=$5`, whatsappName, pictureURL, pictureID, resolved.StoreID, phone)
	}
}

func (s *Server) customerLookup(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Phone string `json:"phone"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, http.StatusBadRequest, "Número de WhatsApp inválido")
		return
	}
	phone := normalizePhone(in.Phone)
	if len(phone) < 8 || len(phone) > 15 {
		jsonErr(w, http.StatusBadRequest, "Ingresa un número de WhatsApp válido")
		return
	}
	if !s.allowAttempt(r.Context(), "rl:customer-lookup:"+clientIP(r), 30, time.Minute) {
		jsonErr(w, http.StatusTooManyRequests, "Demasiados intentos. Espera un momento e inténtalo de nuevo")
		return
	}

	// On a tenant storefront, the business owner takes precedence over the
	// global-customer flow. This keeps the public "Entrar" button role-aware.
	if resolved, resolveErr := s.resolveStoreHost(r.Context(), s.requestHostname(r)); resolveErr == nil && resolved.StoreID != "" {
		var ownerID, ownerPIN, ownerStatus string
		ownerErr := s.db.QueryRow(r.Context(), `SELECT u.id::text,coalesce(u.pin_hash,''),u.status FROM stores st JOIN users u ON u.id=st.user_id WHERE st.id=$1 AND u.role='owner' AND regexp_replace(coalesce(u.phone,''),'[^0-9]','','g')=$2 LIMIT 1`, resolved.StoreID, phone).Scan(&ownerID, &ownerPIN, &ownerStatus)
		if ownerErr == nil && ownerStatus == "active" {
			jsonOut(w, http.StatusOK, map[string]any{
				"exists":             true,
				"needs_registration": false,
				"profile_exists":     true,
				"account_type":       "owner",
				"owner_id":           ownerID,
				"pin_configured":     ownerPIN != "",
			})
			return
		}
	}

	var id, pinHash, status string
	err := s.db.QueryRow(r.Context(), `SELECT id::text,coalesce(pin_hash,''),status FROM global_customers WHERE phone=$1`, phone).Scan(&id, &pinHash, &status)
	if err != nil && err != pgx.ErrNoRows {
		jsonErr(w, http.StatusInternalServerError, "No se pudo verificar el WhatsApp")
		return
	}
	exists := err == nil && status == "active" && pinHash != ""
	jsonOut(w, http.StatusOK, map[string]any{
		"exists":             exists,
		"needs_registration": !exists,
		"profile_exists":     err == nil,
		"account_type":       "customer",
	})
}

func (s *Server) customerValidateWhatsApp(w http.ResponseWriter, r *http.Request) {
	if !s.allowAttempt(r.Context(), "rl:customer-whatsapp-check:"+clientIP(r), 12, time.Minute) {
		jsonErr(w, http.StatusTooManyRequests, "Demasiadas validaciones. Espera un momento e inténtalo de nuevo")
		return
	}
	var in struct {
		Phone string `json:"phone"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, http.StatusBadRequest, "Indica un número de WhatsApp válido")
		return
	}
	out, err := s.validateOwnerWhatsAppForSave(r.Context(), in.Phone)
	if err != nil {
		jsonErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	jsonOut(w, http.StatusOK, out)
}

func (s *Server) customerVerifyIdentity(w http.ResponseWriter, r *http.Request) {
	if !s.allowAttempt(r.Context(), "rl:customer-identity-check:"+clientIP(r), 12, 5*time.Minute) {
		jsonErr(w, http.StatusTooManyRequests, "Demasiadas verificaciones. Espera unos minutos")
		return
	}
	var in struct {
		Cedula string `json:"cedula"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, http.StatusBadRequest, "Indica una Cédula válida")
		return
	}
	cedula := digitsOnly(in.Cedula)
	if len(cedula) != 11 {
		jsonErr(w, http.StatusBadRequest, "La Cédula debe tener exactamente 11 dígitos")
		return
	}
	identity := s.platformSetting(r.Context(), "identity")
	enabled, _ := identity["enabled"].(bool)
	if !enabled {
		jsonErr(w, http.StatusServiceUnavailable, "La verificación de Identidad Dominicana no está habilitada")
		return
	}
	envelope, status, err := s.verifyIdentityDocument(r.Context(), "persona", cedula)
	if err != nil {
		jsonErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	jsonOut(w, http.StatusOK, map[string]any{
		"ok":       true,
		"status":   status,
		"document": cedula,
		"profile":  identityProfile("persona", envelope),
	})
}

func (s *Server) customerRegister(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Phone     string               `json:"phone"`
		PIN       string               `json:"pin"`
		Cedula    string               `json:"cedula"`
		Name      string               `json:"name"`
		LastName  string               `json:"last_name"`
		BirthDate string               `json:"birth_date"`
		Gender    string               `json:"gender"`
		Address   customerAddressInput `json:"address"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, http.StatusBadRequest, "Datos de registro inválidos")
		return
	}
	phone := normalizePhone(in.Phone)
	cedula := digitsOnly(in.Cedula)
	pinOK, pinLength := s.validPINFor(r.Context(), "customer", in.PIN)
	if len(phone) < 8 || len(phone) > 15 {
		jsonErr(w, http.StatusBadRequest, "Ingresa un número de WhatsApp válido")
		return
	}
	if !pinOK {
		jsonErr(w, http.StatusBadRequest, fmt.Sprintf("El PIN del cliente debe tener %d dígitos", pinLength))
		return
	}
	if len(cedula) != 11 {
		jsonErr(w, http.StatusUnprocessableEntity, "La Cédula es obligatoria y debe tener exactamente 11 dígitos")
		return
	}
	address := normalizeCustomerAddress(in.Address)
	if address.Province == "" || address.Municipality == "" || address.Neighborhood == "" || address.Street == "" || address.StreetNumber == "" {
		jsonErr(w, http.StatusBadRequest, "Completa provincia, municipio, barrio, calle y número")
		return
	}

	if _, err := s.validateOwnerWhatsAppForSave(r.Context(), phone); err != nil {
		jsonErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	identity := s.platformSetting(r.Context(), "identity")
	identityEnabled, _ := identity["enabled"].(bool)
	if !identityEnabled {
		jsonErr(w, http.StatusServiceUnavailable, "La verificación de Identidad Dominicana debe estar habilitada para registrar clientes")
		return
	}
	envelope, _, err := s.verifyIdentityDocument(r.Context(), "persona", cedula)
	if err != nil {
		jsonErr(w, http.StatusUnprocessableEntity, "No pudimos verificar la Cédula: "+err.Error())
		return
	}
	profile := identityProfile("persona", envelope)
	name := strings.TrimSpace(str(profile["name"]))
	lastName := strings.TrimSpace(str(profile["last_name"]))
	birthDate := strings.TrimSpace(str(profile["birth_date"]))
	gender := normalizeOwnerGender(str(profile["gender"]))
	if name == "" {
		name = strings.TrimSpace(in.Name)
	}
	if lastName == "" {
		lastName = strings.TrimSpace(in.LastName)
	}
	if birthDate == "" {
		birthDate = strings.TrimSpace(in.BirthDate)
	}
	if gender == "" {
		gender = normalizeOwnerGender(in.Gender)
	}
	if name == "" || lastName == "" {
		jsonErr(w, http.StatusUnprocessableEntity, "Identidad Dominicana no devolvió el nombre completo del cliente")
		return
	}
	if birthDate != "" {
		if _, err := time.Parse("2006-01-02", birthDate); err != nil {
			jsonErr(w, http.StatusBadRequest, "La fecha de nacimiento no es válida")
			return
		}
	}

	pinHash, err := bcrypt.GenerateFromPassword([]byte(in.PIN), bcrypt.DefaultCost)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo proteger el PIN")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo crear la cuenta")
		return
	}
	defer tx.Rollback(r.Context())

	var existingID, existingPIN string
	err = tx.QueryRow(r.Context(), `SELECT id::text,coalesce(pin_hash,'') FROM global_customers WHERE phone=$1 FOR UPDATE`, phone).Scan(&existingID, &existingPIN)
	if err != nil && err != pgx.ErrNoRows {
		jsonErr(w, http.StatusInternalServerError, "No se pudo verificar la identidad global")
		return
	}
	if err == nil && existingPIN != "" {
		jsonErr(w, http.StatusConflict, "Ya existe una cuenta de cliente con ese WhatsApp")
		return
	}
	var cedulaOwner string
	_ = tx.QueryRow(r.Context(), `SELECT id::text FROM global_customers WHERE national_id=$1 AND ($2='' OR id::text<>$2) LIMIT 1`, cedula, existingID).Scan(&cedulaOwner)
	if cedulaOwner != "" {
		jsonErr(w, http.StatusConflict, "Ya existe una cuenta de cliente con esa Cédula")
		return
	}

	customerID := existingID
	now := time.Now()
	if customerID == "" {
		err = tx.QueryRow(r.Context(), `INSERT INTO global_customers(phone,name,last_name,national_id,birth_date,gender,pin_hash,pin_changed_at,status,whatsapp_verified_at,identity_verified_at,last_login_at,updated_at) VALUES($1,$2,$3,$4,nullif($5,'')::date,nullif($6,''),$7,now(),'active',$8,$8,$8,now()) RETURNING id::text`, phone, name, lastName, cedula, birthDate, gender, string(pinHash), now).Scan(&customerID)
	} else {
		_, err = tx.Exec(r.Context(), `UPDATE global_customers SET name=$1,last_name=$2,national_id=$3,birth_date=nullif($4,'')::date,gender=nullif($5,''),pin_hash=$6,pin_changed_at=now(),status='active',whatsapp_verified_at=$7,identity_verified_at=$7,last_login_at=$7,updated_at=now() WHERE id=$8`, name, lastName, cedula, birthDate, gender, string(pinHash), now, customerID)
	}
	if err != nil {
		jsonErr(w, http.StatusConflict, "No se pudo crear la cuenta; verifica WhatsApp y Cédula")
		return
	}
	_, _ = tx.Exec(r.Context(), `UPDATE customer_addresses SET is_primary=false,updated_at=now() WHERE global_customer_id=$1 AND is_primary=true`, customerID)
	_, err = tx.Exec(r.Context(), `INSERT INTO customer_addresses(global_customer_id,label,province_code,province,city_id,municipality,neighborhood_id,neighborhood,street,street_number,reference,is_primary) VALUES($1,$2,nullif($3,''),$4,nullif($5,''),$6,nullif($7,''),$8,$9,$10,nullif($11,''),true)`, customerID, address.Label, address.ProvinceCode, address.Province, address.CityID, address.Municipality, address.NeighborhoodID, address.Neighborhood, address.Street, address.StreetNumber, address.Reference)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo guardar la dirección")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo confirmar la cuenta")
		return
	}

	s.syncGlobalCustomerWhatsAppProfile(r.Context(), r, customerID, phone)
	tok, err := authpkg.Sign(s.cfg.JWTSecret, customerID, "customer")
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "Cuenta creada, pero no se pudo iniciar sesión")
		return
	}
	s.setCustomerSessionCookie(w, r, tok, 7*24*3600)
	jsonOut(w, http.StatusCreated, map[string]any{
		"customer": map[string]any{"id": customerID, "name": name, "last_name": lastName, "phone": phone, "national_id": cedula},
		"address":  map[string]any{"label": address.Label, "formatted": customerAddressText(address)},
	})
}

func (s *Server) customerLogin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Phone string `json:"phone"`
		PIN   string `json:"pin"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, http.StatusBadRequest, "Ingresa tu WhatsApp y PIN")
		return
	}
	phone := normalizePhone(in.Phone)
	pinOK, accepted := s.validCustomerLoginPIN(r.Context(), in.PIN)
	if phone == "" || !pinOK {
		jsonErr(w, http.StatusBadRequest, "El PIN debe tener "+pinLengthsMessage(accepted))
		return
	}
	attemptKey := "rl:customer-login:" + clientIP(r) + ":" + phone
	if !s.allowAttempt(r.Context(), attemptKey, 8, 15*time.Minute) {
		jsonErr(w, http.StatusTooManyRequests, "Demasiados intentos. Espera unos minutos antes de volver a intentar")
		return
	}
	var id, name, lastName, storedPhone, pinHash, status string
	err := s.db.QueryRow(r.Context(), `SELECT id::text,name,coalesce(last_name,''),phone,coalesce(pin_hash,''),status FROM global_customers WHERE phone=$1`, phone).Scan(&id, &name, &lastName, &storedPhone, &pinHash, &status)
	if err != nil || status != "active" || pinHash == "" || bcrypt.CompareHashAndPassword([]byte(pinHash), []byte(in.PIN)) != nil {
		jsonErr(w, http.StatusUnauthorized, "WhatsApp o PIN incorrecto")
		return
	}
	s.resetAttempts(r.Context(), attemptKey)
	tok, err := authpkg.Sign(s.cfg.JWTSecret, id, "customer")
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo crear la sesión")
		return
	}
	_, _ = s.db.Exec(r.Context(), `UPDATE global_customers SET last_login_at=now(),updated_at=now() WHERE id=$1`, id)
	s.syncGlobalCustomerWhatsAppProfile(r.Context(), r, id, storedPhone)
	s.setCustomerSessionCookie(w, r, tok, 7*24*3600)
	jsonOut(w, http.StatusOK, map[string]any{"customer": map[string]any{"id": id, "name": name, "last_name": lastName, "phone": storedPhone}})
}

func (s *Server) customerLogout(w http.ResponseWriter, r *http.Request) {
	s.clearCustomerSessionCookie(w, r)
	jsonOut(w, http.StatusOK, map[string]bool{"ok": true})
}
