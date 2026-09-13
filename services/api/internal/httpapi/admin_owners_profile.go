package httpapi

import (
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
	jsonOut(w, http.StatusOK, map[string]any{"ok": true, "status": status, "subject_type": kind, "document": document, "result": envelope})
}

func (s *Server) adminOwnerDetail(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var ownerID, name, lastName, phone, status, docType, document, birthDate, gender, planID, planName string
	var created time.Time
	var identityVerified bool
	err := s.db.QueryRow(r.Context(), `SELECT u.id,u.name,coalesce(u.last_name,''),coalesce(u.phone,''),u.status,u.created_at,coalesce(u.document_type,''),coalesce(u.document_number,''),coalesce(to_char(u.birth_date,'YYYY-MM-DD'),''),coalesce(u.gender,''),u.identity_verified_at IS NOT NULL,coalesce(p.id::text,''),coalesce(p.name,'Sin plan') FROM users u LEFT JOIN subscriptions sub ON sub.user_id=u.id LEFT JOIN plans p ON p.id=sub.plan_id WHERE u.id=$1 AND u.role='owner'`, id).Scan(&ownerID, &name, &lastName, &phone, &status, &created, &docType, &document, &birthDate, &gender, &identityVerified, &planID, &planName)
	if err != nil {
		jsonErr(w, http.StatusNotFound, "Propietario no encontrado")
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT st.id,st.name,st.slug,coalesce(st.whatsapp,''),st.is_active,st.created_at,coalesce(bt.slug,'otro-negocio'),coalesce(bt.name,'Otro tipo de negocio') FROM stores st LEFT JOIN business_templates bt ON bt.id=st.template_id WHERE st.user_id=$1 ORDER BY st.created_at`, id)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudieron cargar los negocios asociados")
		return
	}
	defer rows.Close()
	stores := []map[string]any{}
	for rows.Next() {
		var storeID, storeName, slug, whatsapp, templateSlug, templateName string
		var active bool
		var storeCreated time.Time
		if rows.Scan(&storeID, &storeName, &slug, &whatsapp, &active, &storeCreated, &templateSlug, &templateName) == nil {
			stores = append(stores, map[string]any{"id": storeID, "name": storeName, "slug": slug, "whatsapp": whatsapp, "is_active": active, "created_at": storeCreated, "template_slug": templateSlug, "template_name": templateName})
		}
	}
	jsonOut(w, http.StatusOK, map[string]any{
		"id": ownerID, "name": name, "last_name": lastName, "phone": phone, "status": status, "created_at": created,
		"document_type": docType, "document_number": document, "birth_date": birthDate, "gender": gender, "identity_verified": identityVerified,
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
		DocumentType   string `json:"document_type"`
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
	var exists bool
	_ = s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM users WHERE role='owner' AND id<>$1 AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=$2)`, id, phone).Scan(&exists)
	if exists {
		jsonErr(w, http.StatusConflict, "Ese WhatsApp ya pertenece a otro propietario")
		return
	}
	docType, document := normalizeOwnerDocument(in.DocumentType, in.DocumentNumber)
	if !validOwnerDocument(docType, document) {
		jsonErr(w, http.StatusBadRequest, "La Cédula debe tener 11 dígitos y el RNC 9 u 11 dígitos")
		return
	}
	var currentDocType, currentDocument string
	var currentVerified bool
	if s.db.QueryRow(r.Context(), `SELECT coalesce(document_type,''),coalesce(document_number,''),identity_verified_at IS NOT NULL FROM users WHERE id=$1 AND role='owner'`, id).Scan(&currentDocType, &currentDocument, &currentVerified) != nil {
		jsonErr(w, http.StatusNotFound, "Propietario no encontrado")
		return
	}
	if document != "" {
		_ = s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM users WHERE role='owner' AND id<>$1 AND document_type=$2 AND document_number=$3)`, id, docType, document).Scan(&exists)
		if exists {
			jsonErr(w, http.StatusConflict, "Esa Cédula o RNC ya pertenece a otro propietario")
			return
		}
	}
	identity := s.platformSetting(r.Context(), "identity")
	requireIdentity, _ := identity["require_owner_verification"].(bool)
	identityEnabled, _ := identity["enabled"].(bool)
	var verifiedAt any
	if requireIdentity && document == "" {
		jsonErr(w, http.StatusUnprocessableEntity, "La verificación de Cédula o RNC es obligatoria")
		return
	}
	sameVerifiedDocument := currentVerified && currentDocType == docType && currentDocument == document && document != ""
	if document != "" && identityEnabled {
		if _, _, err := s.verifyIdentityDocument(r.Context(), docType, document); err != nil {
			jsonErr(w, http.StatusUnprocessableEntity, "No pudimos verificar la identidad: "+err.Error())
			return
		}
		verifiedAt = time.Now()
	} else if sameVerifiedDocument {
		verifiedAt = time.Now()
	} else if requireIdentity {
		jsonErr(w, http.StatusServiceUnavailable, "La verificación de identidad es obligatoria, pero la integración está deshabilitada")
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
		cmd, err := tx.Exec(r.Context(), `UPDATE users SET name=$1,last_name=$2,phone=$3,status=$4,document_type=nullif($5,''),document_number=nullif($6,''),birth_date=nullif($7,'')::date,gender=nullif($8,''),identity_verified_at=$9,updated_at=now() WHERE id=$10 AND role='owner'`, name, lastName, phone, status, docType, document, birthDate, gender, verifiedAt, id)
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
		cmd, err := tx.Exec(r.Context(), `UPDATE users SET name=$1,last_name=$2,phone=$3,status=$4,document_type=nullif($5,''),document_number=nullif($6,''),birth_date=nullif($7,'')::date,gender=nullif($8,''),identity_verified_at=$9,pin_hash=$10,pin_changed_at=now(),updated_at=now() WHERE id=$11 AND role='owner'`, name, lastName, phone, status, docType, document, birthDate, gender, verifiedAt, string(hash), id)
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
	s.auditPlatform(r.Context(), c.UserID, "owner.updated", "owner", id, map[string]any{"identity_verified": verifiedAt != nil, "status": status})
	jsonOut(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) adminCreateOwnerStore(w http.ResponseWriter, r *http.Request) {
	ownerID := chi.URLParam(r, "id")
	var in struct {
		Name         string `json:"name"`
		TemplateSlug string `json:"template_slug"`
		WhatsApp     string `json:"whatsapp"`
		Status       string `json:"status"`
	}
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
	slug := s.safeStoreSlugFor(r.Context(), name)
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo crear el negocio")
		return
	}
	defer tx.Rollback(r.Context())
	var storeID string
	active := normalizeBusinessStatus(in.Status) == "active"
	if err := tx.QueryRow(r.Context(), `INSERT INTO stores(user_id,name,slug,phone,whatsapp,is_active) VALUES($1,$2,$3,NULL,$4,$5) RETURNING id`, ownerID, name, slug, whatsapp, active).Scan(&storeID); err != nil {
		jsonErr(w, http.StatusConflict, "No se pudo crear el negocio; verifica el nombre")
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
	s.auditPlatform(r.Context(), c.UserID, "store.created", "store", storeID, map[string]any{"owner_id": ownerID})
	jsonOut(w, http.StatusCreated, map[string]any{"id": storeID, "slug": slug, "ok": true})
}

func (s *Server) adminUpdateAdminStore(w http.ResponseWriter, r *http.Request) {
	storeID := chi.URLParam(r, "id")
	var in struct {
		Name         string `json:"name"`
		TemplateSlug string `json:"template_slug"`
		WhatsApp     string `json:"whatsapp"`
		Status       string `json:"status"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, http.StatusBadRequest, "El nombre del negocio es obligatorio")
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
	cmd, err := s.db.Exec(r.Context(), `UPDATE stores SET name=$1,whatsapp=nullif($2,''),is_active=$3,template_id=$4,business_engine=$5,template_config=$6::jsonb,updated_at=now() WHERE id=$7`, name, whatsapp, active, templateID, engine, string(settings), storeID)
	if err != nil || cmd.RowsAffected() == 0 {
		jsonErr(w, http.StatusNotFound, "Negocio no encontrado")
		return
	}
	c := claims(r)
	s.auditPlatform(r.Context(), c.UserID, "store.updated", "store", storeID, map[string]any{"template_slug": templateSlug, "status": normalizeBusinessStatus(in.Status)})
	jsonOut(w, http.StatusOK, map[string]bool{"ok": true})
}
