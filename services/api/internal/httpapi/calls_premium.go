package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

var callStatuses = map[string]bool{"ringing": true, "connecting": true, "active": true, "held": true, "transferred": true, "completed": true, "missed": true, "rejected": true, "failed": true}

func (s *Server) callSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		storeID, ok := s.assertStore(w, r)
		if !ok {
			return
		}
		_, _ = s.db.Exec(r.Context(), `INSERT INTO store_call_settings(store_id) VALUES($1) ON CONFLICT(store_id) DO NOTHING`, storeID)
		var active, record, transcribe bool
		var ring int
		var strategy string
		_ = s.db.QueryRow(r.Context(), `SELECT is_active,record_calls,transcribe_calls,ring_seconds,routing_strategy FROM store_call_settings WHERE store_id=$1`, storeID).Scan(&active, &record, &transcribe, &ring, &strategy)
		engine, engineErr := s.bridgeReqWithTimeout(r.Context(), http.MethodGet, "/calls/status?store_id="+storeID, nil, 5*time.Second)
		embedded, _ := engine["engine_embedded"].(bool)
		connected, _ := engine["session_connected"].(bool)
		engineReady := engineErr == nil && embedded && connected
		out := map[string]any{"store_id": storeID, "is_active": active, "record_calls": record, "transcribe_calls": transcribe, "ring_seconds": ring, "routing_strategy": strategy, "engine_embedded": true, "engine_ready": engineReady}
		if engineErr == nil {
			for k, v := range engine {
				out[k] = v
			}
		}
		jsonOut(w, 200, out)
		return
	}
	var in struct {
		StoreID         string `json:"store_id"`
		IsActive        bool   `json:"is_active"`
		RecordCalls     bool   `json:"record_calls"`
		TranscribeCalls bool   `json:"transcribe_calls"`
		RingSeconds     int    `json:"ring_seconds"`
		RoutingStrategy string `json:"routing_strategy"`
	}
	if decode(r, &in) != nil || in.StoreID == "" {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	if in.RingSeconds < 5 {
		in.RingSeconds = 30
	}
	if in.RingSeconds > 120 {
		in.RingSeconds = 120
	}
	if !map[string]bool{"manual": true, "round_robin": true, "least_load": true, "random": true}[in.RoutingStrategy] {
		in.RoutingStrategy = "least_load"
	}
	if in.TranscribeCalls {
		in.RecordCalls = true
	}
	_, err := s.db.Exec(r.Context(), `INSERT INTO store_call_settings(store_id,is_active,record_calls,transcribe_calls,ring_seconds,routing_strategy,updated_at) VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(store_id) DO UPDATE SET is_active=excluded.is_active,record_calls=excluded.record_calls,transcribe_calls=excluded.transcribe_calls,ring_seconds=excluded.ring_seconds,routing_strategy=excluded.routing_strategy,updated_at=now()`, in.StoreID, in.IsActive, in.RecordCalls, in.TranscribeCalls, in.RingSeconds, in.RoutingStrategy)
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar la configuración")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) listCalls(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	// Defensive reconciliation: if the bridge-to-core terminal event was lost,
	// do not leave an old incoming call permanently marked as ringing. The
	// embedded engine itself times unanswered calls out using ring_seconds; this
	// mirrors that lifecycle in the persisted control plane with a small grace.
	_, _ = s.db.Exec(r.Context(), `UPDATE whatsapp_calls c SET status='missed',ended_at=coalesce(ended_at,now()),updated_at=now() FROM store_call_settings cs WHERE c.store_id=$1 AND cs.store_id=c.store_id AND c.direction='in' AND c.status='ringing' AND c.started_at < now() - make_interval(secs => greatest(cs.ring_seconds,5)+15)`, storeID)
	// A connecting call that never reaches active/ended must not block the dialer
	// forever after a network interruption or a lost state callback.
	_, _ = s.db.Exec(r.Context(), `UPDATE whatsapp_calls SET status='failed',ended_at=coalesce(ended_at,now()),updated_at=now(),metadata=metadata||jsonb_build_object('reconciled','stale_connecting') WHERE store_id=$1 AND status='connecting' AND started_at < now() - interval '3 minutes'`, storeID)
	rows, err := s.db.Query(r.Context(), `SELECT c.id::text,coalesce(c.conversation_id::text,''),c.remote_jid,c.phone,c.display_name,c.direction,c.status,coalesce(c.assigned_staff_id::text,''),coalesce(sf.name,''),c.external_call_id,c.started_at,c.answered_at,c.ended_at,c.duration_seconds,c.recording_url,c.transcript,c.metadata FROM whatsapp_calls c LEFT JOIN store_staff sf ON sf.id=c.assigned_staff_id WHERE c.store_id=$1 ORDER BY c.started_at DESC LIMIT 250`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las llamadas")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, conversationID, jid, phone, name, direction, status, staffID, staffName, externalID, recording, transcript string
		var started time.Time
		var answered, ended *time.Time
		var duration int
		var raw []byte
		if rows.Scan(&id, &conversationID, &jid, &phone, &name, &direction, &status, &staffID, &staffName, &externalID, &started, &answered, &ended, &duration, &recording, &transcript, &raw) == nil {
			var metadata any = map[string]any{}
			_ = json.Unmarshal(raw, &metadata)
			out = append(out, map[string]any{"id": id, "conversation_id": conversationID, "remote_jid": jid, "phone": phone, "display_name": name, "direction": direction, "status": status, "assigned_staff_id": staffID, "assigned_staff_name": staffName, "external_call_id": externalID, "started_at": started, "answered_at": answered, "ended_at": ended, "duration_seconds": duration, "recording_url": recording, "transcript": transcript, "metadata": metadata})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) startCallRecord(w http.ResponseWriter, r *http.Request) {
	var in struct {
		StoreID         string `json:"store_id"`
		ConversationID  string `json:"conversation_id"`
		Phone           string `json:"phone"`
		DisplayName     string `json:"display_name"`
		AssignedStaffID string `json:"assigned_staff_id"`
	}
	if decode(r, &in) != nil || in.StoreID == "" {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	var enabled bool
	_ = s.db.QueryRow(r.Context(), `SELECT is_active FROM store_call_settings WHERE store_id=$1`, in.StoreID).Scan(&enabled)
	if !enabled {
		jsonErr(w, 409, "WAMERCIO Calls no está activado para este negocio")
		return
	}
	in.Phone = normalizePhone(in.Phone)
	var remoteJID string
	if in.ConversationID != "" {
		var storeID, phone, name string
		if s.db.QueryRow(r.Context(), `SELECT store_id::text,remote_jid,coalesce(whatsapp_phone,''),coalesce(display_name,'') FROM conversations WHERE id=$1`, in.ConversationID).Scan(&storeID, &remoteJID, &phone, &name) != nil || storeID != in.StoreID {
			jsonErr(w, 400, "Conversación inválida")
			return
		}
		if in.Phone == "" {
			in.Phone = normalizePhone(phone)
		}
		if in.DisplayName == "" {
			in.DisplayName = name
		}
	}
	if in.Phone == "" {
		jsonErr(w, 400, "Indica el WhatsApp a llamar")
		return
	}
	if remoteJID == "" {
		remoteJID = in.Phone + "@s.whatsapp.net"
	}
	var id string
	err := s.db.QueryRow(r.Context(), `INSERT INTO whatsapp_calls(store_id,conversation_id,remote_jid,phone,display_name,direction,status,assigned_staff_id,metadata) VALUES($1,NULLIF($2,'')::uuid,$3,$4,$5,'out','connecting',NULLIF($6,'')::uuid,jsonb_build_object('requested_by',$7)) RETURNING id::text`, in.StoreID, in.ConversationID, remoteJID, in.Phone, strings.TrimSpace(in.DisplayName), in.AssignedStaffID, c.UserID).Scan(&id)
	if err != nil {
		jsonErr(w, 500, "No se pudo preparar la llamada")
		return
	}
	payload := map[string]any{"call_id": id, "store_id": in.StoreID, "conversation_id": in.ConversationID, "remote_jid": remoteJID, "phone": in.Phone, "display_name": in.DisplayName, "assigned_staff_id": in.AssignedStaffID}
	response, err := s.bridgeReqWithTimeout(r.Context(), http.MethodPost, "/calls", payload, 40*time.Second)
	if err != nil {
		_, _ = s.db.Exec(r.Context(), `UPDATE whatsapp_calls SET status='failed',ended_at=now(),metadata=metadata||jsonb_build_object('engine_error',$1),updated_at=now() WHERE id=$2`, err.Error(), id)
		jsonErr(w, 502, "El motor integrado de WAMERCIO no pudo iniciar la llamada: "+err.Error())
		return
	}
	externalID := flowString(response["external_call_id"])
	if externalID == "" {
		externalID = flowString(response["id"])
	}
	status := flowString(response["status"])
	if !callStatuses[status] {
		status = "connecting"
	}
	_, _ = s.db.Exec(r.Context(), `UPDATE whatsapp_calls SET external_call_id=$1,status=$2,metadata=metadata||$3::jsonb,updated_at=now() WHERE id=$4`, externalID, status, mustJSON(map[string]any{"engine": response}), id)
	_, _ = s.db.Exec(r.Context(), `INSERT INTO call_events(call_id,event_type,metadata) VALUES($1,'started',$2::jsonb)`, id, mustJSON(response))
	jsonOut(w, 201, map[string]any{"id": id, "external_call_id": externalID, "status": status, "engine": response})
}

func (s *Server) updateCallRecord(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c := claims(r)
	var storeID, externalCallID string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text,coalesce(external_call_id,'') FROM whatsapp_calls WHERE id=$1`, id).Scan(&storeID, &externalCallID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Llamada no encontrada")
		return
	}
	var in struct {
		Action          string `json:"action"`
		AssignedStaffID string `json:"assigned_staff_id"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	action := strings.ToLower(strings.TrimSpace(in.Action))
	allowed := map[string]bool{"answer": true, "reject": true, "hangup": true, "hold": true, "resume": true, "transfer": true}
	if !allowed[action] {
		jsonErr(w, 400, "Acción de llamada no soportada")
		return
	}
	if externalCallID == "" {
		externalCallID = id
	}
	response, err := s.bridgeReqWithTimeout(r.Context(), http.MethodPost, "/calls/"+externalCallID+"/"+action, map[string]any{"store_id": storeID, "assigned_staff_id": in.AssignedStaffID}, 30*time.Second)
	if err != nil {
		jsonErr(w, 502, "El motor integrado de WAMERCIO no pudo ejecutar la acción: "+err.Error())
		return
	}
	_, _ = s.db.Exec(r.Context(), `INSERT INTO call_events(call_id,event_type,actor_staff_id,metadata) VALUES($1,$2,NULLIF($3,'')::uuid,$4::jsonb)`, id, action, in.AssignedStaffID, mustJSON(response))
	status := strings.TrimSpace(flowString(response["status"]))
	if callStatuses[status] {
		terminal := status == "completed" || status == "missed" || status == "rejected" || status == "failed"
		_, _ = s.db.Exec(r.Context(), `UPDATE whatsapp_calls SET status=$1,answered_at=CASE WHEN $1='active' THEN coalesce(answered_at,now()) ELSE answered_at END,ended_at=CASE WHEN $2 THEN coalesce(ended_at,now()) ELSE ended_at END,updated_at=now() WHERE id=$3 AND store_id=$4`, status, terminal, id, storeID)
	}
	if action == "transfer" && strings.TrimSpace(in.AssignedStaffID) != "" {
		_, _ = s.db.Exec(r.Context(), `UPDATE whatsapp_calls SET assigned_staff_id=$1::uuid,updated_at=now() WHERE id=$2 AND store_id=$3`, in.AssignedStaffID, id, storeID)
	}
	s.publishStoreEvent(r.Context(), storeID, "call", map[string]any{"call_id": id, "status": status, "action": action})
	jsonOut(w, 200, map[string]any{"ok": true, "status": status, "engine": response})
}

func (s *Server) callWebRTC(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c := claims(r)
	var storeID, externalCallID string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text,coalesce(external_call_id,'') FROM whatsapp_calls WHERE id=$1`, id).Scan(&storeID, &externalCallID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Llamada no encontrada")
		return
	}
	var in struct {
		SDPOffer string `json:"sdp_offer"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.SDPOffer) == "" {
		jsonErr(w, 400, "Se requiere sdp_offer")
		return
	}
	if externalCallID == "" {
		externalCallID = id
	}
	out, err := s.bridgeReqWithTimeout(r.Context(), http.MethodPost, "/calls/"+externalCallID+"/webrtc", map[string]any{"store_id": storeID, "sdp_offer": in.SDPOffer}, 15*time.Second)
	if err != nil {
		jsonErr(w, 502, "No se pudo conectar el audio WebRTC con el motor integrado: "+err.Error())
		return
	}
	jsonOut(w, 200, out)
}

func (s *Server) callEngineEvent(w http.ResponseWriter, r *http.Request) {
	secret := strings.TrimSpace(s.cfg.InternalWebhookSecret)
	if secret == "" || r.Header.Get("X-Internal-Secret") != secret {
		jsonErr(w, 403, "No autorizado")
		return
	}
	var in struct {
		CallID          string         `json:"call_id"`
		ExternalCallID  string         `json:"external_call_id"`
		StoreID         string         `json:"store_id"`
		ConversationID  string         `json:"conversation_id"`
		RemoteJID       string         `json:"remote_jid"`
		Phone           string         `json:"phone"`
		DisplayName     string         `json:"display_name"`
		Direction       string         `json:"direction"`
		Status          string         `json:"status"`
		AssignedStaffID string         `json:"assigned_staff_id"`
		RecordingURL    string         `json:"recording_url"`
		Transcript      string         `json:"transcript"`
		Metadata        map[string]any `json:"metadata"`
	}
	if decode(r, &in) != nil || in.StoreID == "" {
		jsonErr(w, 400, "Evento inválido")
		return
	}
	if !callStatuses[in.Status] {
		in.Status = "ringing"
	}
	if in.Direction != "out" {
		in.Direction = "in"
	}
	if in.CallID == "" && in.ExternalCallID != "" {
		_ = s.db.QueryRow(r.Context(), `SELECT id::text FROM whatsapp_calls WHERE store_id=$1 AND external_call_id=$2 ORDER BY started_at DESC LIMIT 1`, in.StoreID, in.ExternalCallID).Scan(&in.CallID)
	}
	if in.CallID == "" {
		if in.ExternalCallID == "" {
			in.ExternalCallID = fmt.Sprintf("wamercio-call-%d", time.Now().UnixNano())
		}
		err := s.db.QueryRow(r.Context(), `INSERT INTO whatsapp_calls(store_id,conversation_id,remote_jid,phone,display_name,direction,status,assigned_staff_id,external_call_id,metadata) VALUES($1,NULLIF($2,'')::uuid,$3,$4,$5,$6,$7,NULLIF($8,'')::uuid,$9,$10::jsonb) RETURNING id::text`, in.StoreID, in.ConversationID, in.RemoteJID, normalizePhone(in.Phone), in.DisplayName, in.Direction, in.Status, in.AssignedStaffID, in.ExternalCallID, mustJSON(in.Metadata)).Scan(&in.CallID)
		if err != nil {
			jsonErr(w, 500, "No se pudo registrar la llamada")
			return
		}
	}
	answeredSQL := "answered_at"
	ended := in.Status == "completed" || in.Status == "missed" || in.Status == "rejected" || in.Status == "failed"
	_, _ = s.db.Exec(r.Context(), fmt.Sprintf(`UPDATE whatsapp_calls SET status=$1,assigned_staff_id=coalesce(NULLIF($2,'')::uuid,assigned_staff_id),external_call_id=coalesce(NULLIF($3,''),external_call_id),recording_url=coalesce(NULLIF($4,''),recording_url),transcript=coalesce(NULLIF($5,''),transcript),metadata=metadata||$6::jsonb,%s=CASE WHEN $1='active' THEN coalesce(%s,now()) ELSE %s END,ended_at=CASE WHEN $7 THEN coalesce(ended_at,now()) ELSE ended_at END,duration_seconds=CASE WHEN $7 AND %s IS NOT NULL THEN greatest(0,extract(epoch FROM (coalesce(ended_at,now())-%s))::int) ELSE duration_seconds END,updated_at=now() WHERE id=$8 AND store_id=$9`, answeredSQL, answeredSQL, answeredSQL, answeredSQL, answeredSQL), in.Status, in.AssignedStaffID, in.ExternalCallID, in.RecordingURL, in.Transcript, mustJSON(in.Metadata), ended, in.CallID, in.StoreID)
	_, _ = s.db.Exec(r.Context(), `INSERT INTO call_events(call_id,event_type,actor_staff_id,metadata) VALUES($1,$2,NULLIF($3,'')::uuid,$4::jsonb)`, in.CallID, in.Status, in.AssignedStaffID, mustJSON(in.Metadata))
	s.publishStoreEvent(r.Context(), in.StoreID, "call", map[string]any{"call_id": in.CallID, "status": in.Status})
	if strings.TrimSpace(in.RecordingURL) != "" {
		go s.maybeTranscribeCall(in.CallID)
	}
	jsonOut(w, 200, map[string]any{"ok": true, "call_id": in.CallID})
}

func (s *Server) maybeTranscribeCall(callID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	if strings.TrimSpace(callID) == "" || strings.TrimSpace(os.Getenv("STT_API_URL")) == "" {
		return
	}
	var storeID, recordingURL string
	var enabled bool
	if err := s.db.QueryRow(ctx, `SELECT c.store_id::text,c.recording_url,coalesce(cs.transcribe_calls,false) FROM whatsapp_calls c LEFT JOIN store_call_settings cs ON cs.store_id=c.store_id WHERE c.id=$1`, callID).Scan(&storeID, &recordingURL, &enabled); err != nil || !enabled || strings.TrimSpace(recordingURL) == "" {
		return
	}
	var existing string
	_ = s.db.QueryRow(ctx, `SELECT coalesce(transcript,'') FROM whatsapp_calls WHERE id=$1`, callID).Scan(&existing)
	if strings.TrimSpace(existing) != "" {
		return
	}
	localPath, err := s.mediaLocalPath(recordingURL)
	if err != nil {
		_, _ = s.db.Exec(ctx, `INSERT INTO call_events(call_id,event_type,metadata) VALUES($1,'transcription_failed',$2::jsonb)`, callID, mustJSON(map[string]any{"error": err.Error()}))
		return
	}
	language := "es"
	_ = s.db.QueryRow(ctx, `SELECT language FROM store_transcription_settings WHERE store_id=$1`, storeID).Scan(&language)
	textValue, detected, engine, err := callTranscriptionAPI(ctx, strings.TrimSpace(os.Getenv("STT_API_URL")), os.Getenv("STT_API_KEY"), envSTTModel(), language, localPath)
	if err != nil {
		_, _ = s.db.Exec(ctx, `INSERT INTO call_events(call_id,event_type,metadata) VALUES($1,'transcription_failed',$2::jsonb)`, callID, mustJSON(map[string]any{"error": err.Error()}))
		return
	}
	if strings.TrimSpace(detected) == "" {
		detected = language
	}
	textValue = strings.TrimSpace(textValue)
	if textValue == "" {
		return
	}
	_, _ = s.db.Exec(ctx, `UPDATE whatsapp_calls SET transcript=$1,metadata=metadata||$2::jsonb,updated_at=now() WHERE id=$3`, textValue, mustJSON(map[string]any{"transcription_engine": engine, "transcription_language": detected}), callID)
	_, _ = s.db.Exec(ctx, `INSERT INTO call_events(call_id,event_type,metadata) VALUES($1,'transcribed',$2::jsonb)`, callID, mustJSON(map[string]any{"engine": engine, "language": detected}))
	s.publishStoreEvent(ctx, storeID, "call", map[string]any{"call_id": callID, "status": "transcribed"})
}

func mustJSON(v any) string { raw, _ := json.Marshal(v); return string(raw) }
