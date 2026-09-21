package httpapi

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// adminUpdateMe keeps the SuperAdmin account self-service separate from the
// platform-user administration screen. Roles/access are intentionally not
// editable here.
func (s *Server) adminUpdateMe(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var in struct {
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if in.Name == "" {
		jsonErr(w, http.StatusBadRequest, "El nombre es obligatorio")
		return
	}
	if in.Email == "" || !strings.Contains(in.Email, "@") {
		jsonErr(w, http.StatusBadRequest, "Indica un correo válido")
		return
	}
	res, err := s.db.Exec(r.Context(), `UPDATE users SET name=$1,email=$2,updated_at=now() WHERE id=$3 AND role<>'owner'`, in.Name, in.Email, c.UserID)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate") || strings.Contains(strings.ToLower(err.Error()), "unique") {
			jsonErr(w, http.StatusConflict, "Ese correo ya está en uso")
			return
		}
		jsonErr(w, http.StatusInternalServerError, "No se pudo actualizar el perfil")
		return
	}
	if res.RowsAffected() == 0 {
		jsonErr(w, http.StatusNotFound, "Administrador no encontrado")
		return
	}
	jsonOut(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) adminChangePassword(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var in struct {
		Current string `json:"current_password"`
		New     string `json:"new_password"`
	}
	if decode(r, &in) != nil || len(in.New) < 8 {
		jsonErr(w, http.StatusBadRequest, "La nueva contraseña debe tener al menos 8 caracteres")
		return
	}
	var hash string
	if err := s.db.QueryRow(r.Context(), `SELECT coalesce(password_hash,'') FROM users WHERE id=$1 AND role<>'owner'`, c.UserID).Scan(&hash); err != nil || hash == "" {
		jsonErr(w, http.StatusNotFound, "Administrador no encontrado")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Current)) != nil {
		jsonErr(w, http.StatusBadRequest, "La contraseña actual no es correcta")
		return
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(in.New), bcrypt.DefaultCost)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo actualizar la contraseña")
		return
	}
	if _, err = s.db.Exec(r.Context(), `UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2 AND role<>'owner'`, string(newHash), c.UserID); err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo actualizar la contraseña")
		return
	}
	jsonOut(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) enrichSupportCallSnapshot(ctx context.Context, item map[string]any) map[string]any {
	phone := normalizePhone(flowString(item["phone"]))
	remoteJID := strings.TrimSpace(flowString(item["remote_jid"]))
	if phone == "" && remoteJID != "" {
		phone = normalizePhone(strings.Split(remoteJID, "@")[0])
	}
	name := strings.TrimSpace(flowString(item["display_name"]))
	ownerID, avatarURL, conversationID := "", "", ""
	if phone != "" {
		_ = s.db.QueryRow(ctx, `
			SELECT u.id::text,
			       coalesce(nullif(c.display_name,''),nullif(u.whatsapp_name,''),nullif(u.name,''),$3),
			       coalesce(nullif(u.profile_picture_url,''),''),
			       coalesce(c.id::text,'')
			FROM users u
			LEFT JOIN LATERAL (
				SELECT id,display_name FROM support_whatsapp_conversations x
				WHERE x.owner_id=u.id ORDER BY x.last_message_at DESC NULLS LAST LIMIT 1
			) c ON true
			WHERE u.role='owner' AND (
				regexp_replace(coalesce(u.phone,''),'[^0-9]','','g')=$1
				OR EXISTS (
					SELECT 1 FROM support_whatsapp_conversations sc
					WHERE sc.owner_id=u.id AND (
						regexp_replace(coalesce(sc.whatsapp,''),'[^0-9]','','g')=$1
						OR ($2<>'' AND sc.remote_jid=$2)
					)
				)
			)
			LIMIT 1`, phone, remoteJID, name).Scan(&ownerID, &name, &avatarURL, &conversationID)
	}
	item["phone"] = phone
	if name != "" {
		item["display_name"] = name
	}
	item["owner_id"] = ownerID
	item["avatar_url"] = avatarURL
	item["conversation_id"] = conversationID
	return item
}

// The SuperAdmin softphone talks to the same embedded calls engine used by
// merchant stores, but through the global "support" WhatsApp session. No
// tenant UUID or store_call_settings row is required.
func (s *Server) adminSupportCallsStatus(w http.ResponseWriter, r *http.Request) {
	out, err := s.bridgeReqWithTimeout(r.Context(), http.MethodGet, "/calls/status?store_id=support", nil, 5*time.Second)
	if err != nil {
		jsonOut(w, http.StatusOK, map[string]any{"engine_embedded": true, "session_connected": false, "calls_enabled": false, "active_calls": 0, "active_call_snapshots": []any{}, "error": err.Error()})
		return
	}
	if raw, ok := out["active_call_snapshots"].([]any); ok {
		next := make([]any, 0, len(raw))
		for _, v := range raw {
			m, _ := v.(map[string]any)
			if m == nil {
				continue
			}
			next = append(next, s.enrichSupportCallSnapshot(r.Context(), m))
		}
		out["active_call_snapshots"] = next
	}
	jsonOut(w, http.StatusOK, out)
}

func (s *Server) adminSupportStartCall(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Phone       string `json:"phone"`
		DisplayName string `json:"display_name"`
		RemoteJID   string `json:"remote_jid"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	in.Phone = normalizePhone(in.Phone)
	if in.Phone == "" && strings.TrimSpace(in.RemoteJID) == "" {
		jsonErr(w, http.StatusBadRequest, "Indica el WhatsApp a llamar")
		return
	}
	callID := "support-" + uuid.NewString()
	payload := map[string]any{
		"call_id":      callID,
		"store_id":     "support",
		"phone":        in.Phone,
		"remote_jid":   strings.TrimSpace(in.RemoteJID),
		"display_name": strings.TrimSpace(in.DisplayName),
	}
	out, err := s.bridgeReqWithTimeout(r.Context(), http.MethodPost, "/calls", payload, 65*time.Second)
	if err != nil {
		jsonErr(w, http.StatusBadGateway, "No se pudo iniciar la llamada desde el WhatsApp global: "+err.Error())
		return
	}
	externalID := strings.TrimSpace(flowString(out["external_call_id"]))
	if externalID == "" {
		externalID = callID
	}
	jsonOut(w, http.StatusCreated, map[string]any{"id": externalID, "external_call_id": externalID, "status": flowString(out["status"]), "engine": out})
}

func (s *Server) adminSupportCallAction(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	action := strings.ToLower(strings.TrimSpace(chi.URLParam(r, "action")))
	if id == "" || !map[string]bool{"answer": true, "reject": true, "hangup": true, "hold": true, "resume": true}[action] {
		jsonErr(w, http.StatusBadRequest, "Acción de llamada no soportada")
		return
	}
	out, err := s.bridgeReqWithTimeout(r.Context(), http.MethodPost, "/calls/"+id+"/"+action, map[string]any{"store_id": "support"}, 30*time.Second)
	if err != nil {
		if action == "hangup" || action == "reject" {
			status := "completed"
			if action == "reject" {
				status = "rejected"
			}
			jsonOut(w, http.StatusOK, map[string]any{"ok": true, "status": status, "warning": err.Error()})
			return
		}
		jsonErr(w, http.StatusBadGateway, "No se pudo ejecutar la acción: "+err.Error())
		return
	}
	jsonOut(w, http.StatusOK, out)
}

func (s *Server) adminSupportCallWebRTC(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	var in struct {
		SDPOffer string `json:"sdp_offer"`
	}
	if id == "" || decode(r, &in) != nil || strings.TrimSpace(in.SDPOffer) == "" {
		jsonErr(w, http.StatusBadRequest, "Se requiere sdp_offer")
		return
	}
	out, err := s.bridgeReqWithTimeout(r.Context(), http.MethodPost, "/calls/"+id+"/webrtc", map[string]any{"store_id": "support", "sdp_offer": in.SDPOffer}, 15*time.Second)
	if err != nil {
		jsonErr(w, http.StatusBadGateway, "No se pudo conectar el audio del softphone: "+err.Error())
		return
	}
	jsonOut(w, http.StatusOK, out)
}
