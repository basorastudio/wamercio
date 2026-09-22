package httpapi

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

func (s *Server) adminWhatsAppSendPoll(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var jid string
	if s.db.QueryRow(r.Context(), `SELECT remote_jid FROM support_whatsapp_conversations WHERE id=$1`, id).Scan(&jid) != nil {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	var in struct {
		Question      string   `json:"question"`
		Options       []string `json:"options"`
		MaxSelections int      `json:"max_selections"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Encuesta inválida")
		return
	}
	in.Question = strings.TrimSpace(in.Question)
	seen := map[string]bool{}
	options := make([]string, 0, len(in.Options))
	for _, raw := range in.Options {
		option := strings.TrimSpace(raw)
		key := strings.ToLower(option)
		if option == "" || seen[key] {
			continue
		}
		seen[key] = true
		options = append(options, option)
	}
	if in.Question == "" || len(options) < 2 || len(options) > 12 {
		jsonErr(w, 400, "La encuesta requiere una pregunta y entre 2 y 12 opciones")
		return
	}
	if in.MaxSelections <= 0 {
		in.MaxSelections = 1
	}
	if in.MaxSelections > len(options) {
		in.MaxSelections = len(options)
	}
	out, err := s.bridgeReq(r.Context(), "POST", "/sessions/support/polls", map[string]any{
		"to": jid, "question": in.Question, "options": options, "max_selections": in.MaxSelections,
	})
	if err != nil {
		jsonErr(w, 502, "No se pudo enviar la encuesta. Verifica la sesión global de WhatsApp")
		return
	}
	msgID := strings.TrimSpace(fmt.Sprint(out["id"]))
	if msgID == "" || msgID == "<nil>" {
		msgID = fmt.Sprintf("support-poll-%d", time.Now().UnixNano())
	}
	visible := in.Question + "\n" + strings.Join(options, "\n")
	now := time.Now()
	_, _ = s.db.Exec(r.Context(), `INSERT INTO support_whatsapp_messages(conversation_id,message_id,direction,type,body,status,occurred_at) VALUES($1,$2,'out','poll',$3,'sent',$4) ON CONFLICT(conversation_id,message_id) DO NOTHING`, id, msgID, visible, now)
	_, _ = s.db.Exec(r.Context(), `UPDATE support_whatsapp_conversations SET last_message=$1,last_message_at=$2,updated_at=now() WHERE id=$3`, "Encuesta: "+in.Question, now, id)
	jsonOut(w, 200, map[string]any{"ok": true, "id": msgID, "type": "poll", "body": visible, "occurred_at": now})
}

func (s *Server) adminWhatsAppMarkUnread(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cmd, err := s.db.Exec(r.Context(), `UPDATE support_whatsapp_conversations SET unread_count=GREATEST(unread_count,1),updated_at=now() WHERE id=$1`, id)
	if err != nil || cmd.RowsAffected() == 0 {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminWhatsAppClearMessages(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var exists bool
	_ = s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM support_whatsapp_conversations WHERE id=$1)`, id).Scan(&exists)
	if !exists {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	if _, err := s.db.Exec(r.Context(), `DELETE FROM support_whatsapp_messages WHERE conversation_id=$1`, id); err != nil {
		jsonErr(w, 500, "No se pudo vaciar la conversación")
		return
	}
	_, _ = s.db.Exec(r.Context(), `UPDATE support_whatsapp_conversations SET unread_count=0,last_message='',last_message_at=NULL,updated_at=now() WHERE id=$1`, id)
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) adminWhatsAppDeleteConversation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cmd, err := s.db.Exec(r.Context(), `DELETE FROM support_whatsapp_conversations WHERE id=$1`, id)
	if err != nil || cmd.RowsAffected() == 0 {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}
