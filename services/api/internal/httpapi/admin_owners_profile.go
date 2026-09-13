package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
)

func digitsOnly(value string) string {
	var b strings.Builder
	for _, r := range value {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func validOwnerDocument(kind, document string) bool {
	if document == "" {
		return true
	}
	if kind == "empresa" {
		return len(document) == 9 || len(document) == 11
	}
	return len(document) == 11
}

func normalizeOwnerStatus(value string) string {
	if strings.EqualFold(strings.TrimSpace(value), "blocked") {
		return "blocked"
	}
	return "active"
}

func normalizeBusinessStatus(value string) string {
	if strings.EqualFold(strings.TrimSpace(value), "inactive") {
		return "inactive"
	}
	return "active"
}

func normalizeOwnerGender(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "masculino", "femenino", "otro":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func normalizeOwnerDocument(subjectType, value string) (string, string) {
	document := digitsOnly(value)
	kind := strings.ToLower(strings.TrimSpace(subjectType))
	if document == "" {
		return "", ""
	}
	if kind != "persona" && kind != "empresa" {
		if len(document) == 9 {
			kind = "empresa"
		} else {
			kind = "persona"
		}
	}
	return kind, document
}

func (s *Server) adminVerifyOwnerIdentity(w http.ResponseWriter, r *http.Request) {
	var in struct {
		SubjectType string `json:"subject_type"`
		Document    string `json:"document"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, http.StatusBadRequest, "Indica una Cédula o RNC")
		return
	}
	kind, document := normalizeOwnerDocument(in.SubjectType, in.Document)
	if document == "" {
		jsonErr(w, http.StatusBadRequest, "Indica una Cédula o RNC")
		return
	}
	if !validOwnerDocument(kind, document) {
		jsonErr(w, http.StatusBadRequest, "La Cédula debe tener 11 dígitos y el RNC 9 u 11 dígitos")
		return
	}
	identity := s.platformSetting(r.Context(), "identity")
	enabled, _ := identity["enabled"].(bool)
	if !enabled {
		jsonErr(w, http.StatusServiceUnavailable, "La integración de Identidad Dominicana no está habilitada")
		return
	}
	envelope, status, err := s.verifyIdentityDocument(r.Context(), kind, document)
	if err != nil {
		jsonErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	jsonOut(w, http.StatusOK, map[string]any{"ok": true, "status": status, "subject_type": kind, "document": document, "profile": identityProfile(kind, envelope), "result": envelope})
}

func (s *Server) adminOwnerDetail(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var ownerID, name, lastName, phone, status, docType, document, birthDate, gender, planID, planName string
	var created time.Time
	var identityVerified, whatsappVerified bool
	err := s.db.QueryRow(r.Context(), `SELECT u.id,u.name,coalesce(u.last_name,''),coalesce(u.phone,''),u.status,u.created_at,coalesce(u.document_type,''),coalesce(u.document_number,''),coalesce(to_char(u.birth_date,'YYYY-MM-DD'),''),coalesce(u.gender,''),u.identity_verified_at IS NOT NULL,u.whatsapp_verified_at IS NOT NULL,coalesce(p.id::text,''),coalesce(p.name,'Sin plan') FROM users u LEFT JOIN subscriptions sub ON sub.user_id=u.id LEFT JOIN plans p ON p.id=sub.plan_id WHERE u.id=$1 AND u.role='owner'`, id).Scan(&ownerID, &name, &lastName, &phone, &status, &created, &docType, &document, &birthDate, &gender, &identityVerified, &whatsappVerified, &planID, &planName)
	if err != nil {
		jsonErr(w, http.StatusNotFound, "Propietario no encontrado")
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT st.id,st.name,st.slug,coalesce(st.whatsapp,''),st.is_active,st.created_at,coalesce(bt.slug,'otro-negocio'),coalesce(bt.name,'Otro tipo de negocio'),coalesce(st.rnc,''),coalesce(st.legal_name,''),coalesce(st.commercial_name,''),st.rnc_verified_at IS NOT NULL,coalesce(st.province_code,''),coalesce(st.province,''),coalesce(st.city_id,''),coalesce(st.municipality,''),coalesce(st.neighborhood_id,''),coalesce(st.neighborhood,''),coalesce(st.street,''),coalesce(st.street_number,'') FROM stores st LEFT JOIN business_templates bt ON bt.id=st.template_id WHERE st.user_id=$1 ORDER BY st.created_at`, id)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudieron cargar los negocios asociados")
		return
	}
	defer rows.Close()
	stores := []map[string]any{}
	for rows.Next() {
		var storeID, storeName, slug, whatsapp, templateSlug, templateName, rnc, legalName, commercialName string
		var provinceCode, province, cityID, municipality, neighborhoodID, neighborhood, street, streetNumber string
		var active, rncVerified bool
		var storeCreated time.Time
		if rows.Scan(&storeID, &storeName, &slug, &whatsapp, &active, &storeCreated, &templateSlug, &templateName, &rnc, &legalName, &commercialName, &rncVerified, &provinceCode, &province, &cityID, &municipality, &neighborhoodID, &neighborhood, &street, &streetNumber) == nil {
			stores = append(stores, map[string]any{"id": storeID, "name": storeName, "slug": slug, "whatsapp": whatsapp, "is_active": active, "created_at": storeCreated, "template_slug": templateSlug, "template_name": templateName, "rnc": rnc, "legal_name": legalName, "commercial_name": commercialName, "rnc_verified": rncVerified, "province_code": provinceCode, "province": province, "city_id": cityID, "municipality": municipality, "neighborhood_id": neighborhoodID, "neighborhood": neighborhood, "street": street, "street_number": streetNumber})
		}
	}
	jsonOut(w, http.StatusOK, map[string]any{
		"id": ownerID, "name": name, "last_name": lastName, "phone": phone, "status": status, "created_at": created,
		"document_type": docType, "document_number": document, "birth_date": birthDate, "gender": gender, "identity_verified": identityVerified, "whatsapp_verified": whatsappVerified,
		"plan_id": planID, "plan_name": planName, "stores": stores,
	})
}

func (s *Server) adminUpdateOwner(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		Name           string `json:"name"`
		LastName       string `json:"last_name"`
		Phone          string `json:"phone"`
		PIN            string `json:"pin"`
		DocumentNumber string `json:"document_number"`
		BirthDate      string `json:"birth_date"`
		Gender         string `json:"gender"`
		Status         string `json:"status"`
		PlanID         string `json:"plan_id"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	name := strings.TrimSpace(in.Name)
	lastName := strings.TrimSpace(in.LastName)
	phone := normalizePhone(in.Phone)
	if name == "" || phone == "" {
		jsonErr(w, http.StatusBadRequest, "Nombre y WhatsApp son obligatorios")
		return
	}
	if in.PIN != "" {
		ok, length := s.validPINFor(r.Context(), "owner", in.PIN)
		if !ok {
			jsonErr(w, http.StatusBadRequest, fmt.Sprintf("El PIN debe tener exactamente %d dígitos", length))
			return
		}
	}

	var currentPhone, currentDocument string
	var currentIdentityVerified, currentWhatsAppVerified bool
	if s.db.QueryRow(r.Context(), `SELECT regexp_replace(coalesce(phone,''),'[^0-9]','','g'),coalesce(document_number,''),identity_verified_at IS NOT NULL,whatsapp_verified_at IS NOT NULL FROM users WHERE id=$1 AND role='owner'`, id).Scan(&currentPhone, &currentDocument, &currentIdentityVerified, &currentWhatsAppVerified) != nil {
		jsonErr(w, http.StatusNotFound, "Propietario no encontrado")
		return
	}
	whatsappVerifiedAt := any(time.Now())
	if currentPhone != phone || !currentWhatsAppVerified {
		if _, err := s.validateOwnerWhatsAppForSave(r.Context(), phone); err != nil {
			jsonErr(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
	}

	var exists bool
	_ = s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM users WHERE role='owner' AND id<>$1 AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=$2)`, id, phone).Scan(&exists)
	if exists {
		jsonErr(w, http.StatusConflict, "Ese WhatsApp ya pertenece a otro propietario")
		return
	}

	document := digitsOnly(in.DocumentNumber)
	if len(document) != 11 {
		jsonErr(w, http.StatusBadRequest, "La Cédula es obligatoria y debe tener exactamente 11 dígitos")
		return
	}
	if document != "" {
		_ = s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM users WHERE role='owner' AND id<>$1 AND document_type='persona' AND document_number=$2)`, id, document).Scan(&exists)
		if exists {
			jsonErr(w, http.StatusConflict, "Esa Cédula ya pertenece a otro propietario")
			return
		}
	}
	identity := s.platformSetting(r.Context(), "identity")
	requireIdentity, _ := identity["require_owner_verification"].(bool)
	identityEnabled, _ := identity["enabled"].(bool)
	var verifiedAt any
	if requireIdentity && document == "" {
		jsonErr(w, http.StatusUnprocessableEntity, "La verificación de Cédula es obligatoria")
		return
	}
	sameVerifiedDocument := currentIdentityVerified && currentDocument == document && document != ""
	if document != "" && identityEnabled {
		if _, _, err := s.verifyIdentityDocument(r.Context(), "persona", document); err != nil {
			jsonErr(w, http.StatusUnprocessableEntity, "No pudimos verificar la Cédula: "+err.Error())
			return
		}
		verifiedAt = time.Now()
	} else if sameVerifiedDocument {
		verifiedAt = time.Now()
	} else if requireIdentity {
		jsonErr(w, http.StatusServiceUnavailable, "La verificación de Cédula es obligatoria, pero la integración está deshabilitada")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo actualizar el propietario")
		return
	}
	defer tx.Rollback(r.Context())
	status := normalizeOwnerStatus(in.Status)
	birthDate := strings.TrimSpace(in.BirthDate)
	gender := normalizeOwnerGender(in.Gender)
	if in.PIN == "" {
		cmd, err := tx.Exec(r.Context(), `UPDATE users SET name=$1,last_name=$2,phone=$3,status=$4,document_type=CASE WHEN nullif($5,'') IS NULL THEN NULL ELSE 'persona' END,document_number=nullif($5,''),birth_date=nullif($6,'')::date,gender=nullif($7,''),identity_verified_at=$8,whatsapp_verified_at=$9,updated_at=now() WHERE id=$10 AND role='owner'`, name, lastName, phone, status, document, birthDate, gender, verifiedAt, whatsappVerifiedAt, id)
		if err != nil || cmd.RowsAffected() == 0 {
			jsonErr(w, http.StatusNotFound, "Propietario no encontrado")
			return
		}
	} else {
		hash, err := bcrypt.GenerateFromPassword([]byte(in.PIN), bcrypt.DefaultCost)
		if err != nil {
			jsonErr(w, http.StatusInternalServerError, "No se pudo proteger el PIN")
			return
		}
		cmd, err := tx.Exec(r.Context(), `UPDATE users SET name=$1,last_name=$2,phone=$3,status=$4,document_type=CASE WHEN nullif($5,'') IS NULL THEN NULL ELSE 'persona' END,document_number=nullif($5,''),birth_date=nullif($6,'')::date,gender=nullif($7,''),identity_verified_at=$8,whatsapp_verified_at=$9,pin_hash=$10,pin_changed_at=now(),updated_at=now() WHERE id=$11 AND role='owner'`, name, lastName, phone, status, document, birthDate, gender, verifiedAt, whatsappVerifiedAt, string(hash), id)
		if err != nil || cmd.RowsAffected() == 0 {
			jsonErr(w, http.StatusNotFound, "Propietario no encontrado")
			return
		}
	}
	if planID := strings.TrimSpace(in.PlanID); planID != "" {
		var active bool
		if tx.QueryRow(r.Context(), `SELECT is_active FROM plans WHERE id=$1`, planID).Scan(&active) != nil || !active {
			jsonErr(w, http.StatusNotFound, "Plan no disponible")
			return
		}
		if _, err := tx.Exec(r.Context(), `INSERT INTO subscriptions(user_id,plan_id,status,starts_at,ends_at) VALUES($1,$2,'active',now(),NULL) ON CONFLICT(user_id) DO UPDATE SET plan_id=excluded.plan_id,status='active',starts_at=now(),ends_at=NULL`, id, planID); err != nil {
			jsonErr(w, http.StatusInternalServerError, "No se pudo actualizar el plan")
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo confirmar la actualización")
		return
	}
	c := claims(r)
	s.auditPlatform(r.Context(), c.UserID, "owner.updated", "owner", id, map[string]any{"identity_verified": verifiedAt != nil, "whatsapp_verified": true, "status": status})
	jsonOut(w, http.StatusOK, map[string]bool{"ok": true})
}

type adminBusinessInput struct {
	Name           string `json:"name"`
	TemplateSlug   string `json:"template_slug"`
	WhatsApp       string `json:"whatsapp"`
	Status         string `json:"status"`
	RNC            string `json:"rnc"`
	LegalName      string `json:"legal_name"`
	CommercialName string `json:"commercial_name"`
	ProvinceCode   string `json:"province_code"`
	Province       string `json:"province"`
	CityID         string `json:"city_id"`
	Municipality   string `json:"municipality"`
	NeighborhoodID string `json:"neighborhood_id"`
	Neighborhood   string `json:"neighborhood"`
	Street         string `json:"street"`
	StreetNumber   string `json:"street_number"`
}

func businessAddress(in adminBusinessInput) string {
	parts := []string{}
	street := strings.TrimSpace(strings.TrimSpace(in.Street) + " " + strings.TrimSpace(in.StreetNumber))
	for _, value := range []string{street, strings.TrimSpace(in.Neighborhood), strings.TrimSpace(in.Municipality), strings.TrimSpace(in.Province)} {
		if value != "" {
			parts = append(parts, value)
		}
	}
	return strings.Join(parts, ", ")
}

func (s *Server) prepareBusinessIdentity(ctx context.Context, in adminBusinessInput, currentRNC string, currentVerified bool) (string, string, string, any, error) {
	rnc := digitsOnly(in.RNC)
	legalName := strings.TrimSpace(in.LegalName)
	commercialName := strings.TrimSpace(in.CommercialName)
	if rnc == "" {
		return "", legalName, commercialName, nil, nil
	}
	if len(rnc) != 9 && len(rnc) != 11 {
		return "", "", "", nil, fmt.Errorf("El RNC debe tener 9 u 11 dígitos")
	}
	if currentVerified && rnc == currentRNC {
		return rnc, legalName, commercialName, time.Now(), nil
	}
	verifiedRNC, profile, verifiedAt, err := s.verifyBusinessRNC(ctx, rnc)
	if err != nil {
		return "", "", "", nil, err
	}
	if v := strings.TrimSpace(str(profile["legal_name"])); v != "" {
		legalName = v
	}
	if v := strings.TrimSpace(str(profile["commercial_name"])); v != "" {
		commercialName = v
	}
	return verifiedRNC, legalName, commercialName, verifiedAt, nil
}

func (s *Server) adminCreateOwnerStore(w http.ResponseWriter, r *http.Request) {
	ownerID := chi.URLParam(r, "id")
	var in adminBusinessInput
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, http.StatusBadRequest, "El nombre del negocio es obligatorio")
		return
	}
	var ownerPhone string
	if s.db.QueryRow(r.Context(), `SELECT coalesce(phone,'') FROM users WHERE id=$1 AND role='owner'`, ownerID).Scan(&ownerPhone) != nil {
		jsonErr(w, http.StatusNotFound, "Propietario no encontrado")
		return
	}
	name := strings.TrimSpace(in.Name)
	whatsapp := normalizePhone(in.WhatsApp)
	if whatsapp == "" {
		whatsapp = ownerPhone
	}
	rnc, legalName, commercialName, rncVerifiedAt, err := s.prepareBusinessIdentity(r.Context(), in, "", false)
	if err != nil {
		jsonErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	slug := s.safeStoreSlugFor(r.Context(), name)
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo crear el negocio")
		return
	}
	defer tx.Rollback(r.Context())
	var storeID string
	active := normalizeBusinessStatus(in.Status) == "active"
	address := businessAddress(in)
	if err := tx.QueryRow(r.Context(), `INSERT INTO stores(user_id,name,slug,phone,whatsapp,is_active,address,rnc,legal_name,commercial_name,rnc_verified_at,province_code,province,city_id,municipality,neighborhood_id,neighborhood,street,street_number) VALUES($1,$2,$3,NULL,$4,$5,nullif($6,''),nullif($7,''),nullif($8,''),nullif($9,''),$10,nullif($11,''),nullif($12,''),nullif($13,''),nullif($14,''),nullif($15,''),nullif($16,''),nullif($17,''),nullif($18,'')) RETURNING id`, ownerID, name, slug, whatsapp, active, address, rnc, legalName, commercialName, rncVerifiedAt, strings.TrimSpace(in.ProvinceCode), strings.TrimSpace(in.Province), strings.TrimSpace(in.CityID), strings.TrimSpace(in.Municipality), strings.TrimSpace(in.NeighborhoodID), strings.TrimSpace(in.Neighborhood), strings.TrimSpace(in.Street), strings.TrimSpace(in.StreetNumber)).Scan(&storeID); err != nil {
		jsonErr(w, http.StatusConflict, "No se pudo crear el negocio; verifica el nombre o RNC")
		return
	}
	if err := s.applyBusinessTemplate(r.Context(), tx, storeID, in.TemplateSlug); err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo preparar el negocio")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo confirmar el negocio")
		return
	}
	c := claims(r)
	s.auditPlatform(r.Context(), c.UserID, "store.created", "store", storeID, map[string]any{"owner_id": ownerID, "rnc_verified": rncVerifiedAt != nil})
	jsonOut(w, http.StatusCreated, map[string]any{"id": storeID, "slug": slug, "ok": true})
}

func (s *Server) adminUpdateAdminStore(w http.ResponseWriter, r *http.Request) {
	storeID := chi.URLParam(r, "id")
	var in adminBusinessInput
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, http.StatusBadRequest, "El nombre del negocio es obligatorio")
		return
	}
	var currentRNC, currentLegal, currentCommercial string
	var currentVerified bool
	if s.db.QueryRow(r.Context(), `SELECT coalesce(rnc,''),coalesce(legal_name,''),coalesce(commercial_name,''),rnc_verified_at IS NOT NULL FROM stores WHERE id=$1`, storeID).Scan(&currentRNC, &currentLegal, &currentCommercial, &currentVerified) != nil {
		jsonErr(w, http.StatusNotFound, "Negocio no encontrado")
		return
	}
	if strings.TrimSpace(in.LegalName) == "" {
		in.LegalName = currentLegal
	}
	if strings.TrimSpace(in.CommercialName) == "" {
		in.CommercialName = currentCommercial
	}
	rnc, legalName, commercialName, rncVerifiedAt, err := s.prepareBusinessIdentity(r.Context(), in, currentRNC, currentVerified)
	if err != nil {
		jsonErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	name := strings.TrimSpace(in.Name)
	whatsapp := normalizePhone(in.WhatsApp)
	active := normalizeBusinessStatus(in.Status) == "active"
	var templateID, engine string
	var settings []byte
	templateSlug := strings.TrimSpace(in.TemplateSlug)
	if templateSlug == "" {
		templateSlug = "otro-negocio"
	}
	if s.db.QueryRow(r.Context(), `SELECT id,engine,settings FROM business_templates WHERE slug=$1 AND is_active=true`, templateSlug).Scan(&templateID, &engine, &settings) != nil {
		jsonErr(w, http.StatusNotFound, "Tipo de negocio no disponible")
		return
	}
	address := businessAddress(in)
	cmd, err := s.db.Exec(r.Context(), `UPDATE stores SET name=$1,whatsapp=nullif($2,''),is_active=$3,template_id=$4,business_engine=$5,template_config=$6::jsonb,address=nullif($7,''),rnc=nullif($8,''),legal_name=nullif($9,''),commercial_name=nullif($10,''),rnc_verified_at=$11,province_code=nullif($12,''),province=nullif($13,''),city_id=nullif($14,''),municipality=nullif($15,''),neighborhood_id=nullif($16,''),neighborhood=nullif($17,''),street=nullif($18,''),street_number=nullif($19,''),updated_at=now() WHERE id=$20`, name, whatsapp, active, templateID, engine, string(settings), address, rnc, legalName, commercialName, rncVerifiedAt, strings.TrimSpace(in.ProvinceCode), strings.TrimSpace(in.Province), strings.TrimSpace(in.CityID), strings.TrimSpace(in.Municipality), strings.TrimSpace(in.NeighborhoodID), strings.TrimSpace(in.Neighborhood), strings.TrimSpace(in.Street), strings.TrimSpace(in.StreetNumber), storeID)
	if err != nil || cmd.RowsAffected() == 0 {
		jsonErr(w, http.StatusConflict, "No se pudo actualizar el negocio; verifica el nombre o RNC")
		return
	}
	c := claims(r)
	s.auditPlatform(r.Context(), c.UserID, "store.updated", "store", storeID, map[string]any{"template_slug": templateSlug, "status": normalizeBusinessStatus(in.Status), "rnc_verified": rncVerifiedAt != nil})
	jsonOut(w, http.StatusOK, map[string]bool{"ok": true})
}
