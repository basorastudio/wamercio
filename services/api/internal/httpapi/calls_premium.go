package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
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
		jsonOut(w, 200, map[string]any{"store_id": storeID, "is_active": active, "record_calls": record, "transcribe_calls": transcribe, "ring_seconds": ring, "routing_strategy": strategy, "adapter_configured": strings.TrimSpace(s.cfg.CallsAdapterURL) != ""})
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
	if strings.TrimSpace(s.cfg.CallsAdapterURL) == "" {
		jsonErr(w, 503, "El transporte de llamadas no está configurado. Define CALLS_ADAPTER_URL para conectar WACalls/WebRTC")
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
	response, err := s.callsAdapterRequest(r.Context(), http.MethodPost, "/calls", payload)
	if err != nil {
		_, _ = s.db.Exec(r.Context(), `UPDATE whatsapp_calls SET status='failed',ended_at=now(),metadata=metadata||jsonb_build_object('adapter_error',$1),updated_at=now() WHERE id=$2`, err.Error(), id)
		jsonErr(w, 502, "El motor de llamadas no pudo iniciar la llamada")
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
	_, _ = s.db.Exec(r.Context(), `UPDATE whatsapp_calls SET external_call_id=$1,status=$2,metadata=metadata||$3::jsonb,updated_at=now() WHERE id=$4`, externalID, status, mustJSON(map[string]any{"adapter": response}), id)
	_, _ = s.db.Exec(r.Context(), `INSERT INTO call_events(call_id,event_type,metadata) VALUES($1,'started',$2::jsonb)`, id, mustJSON(response))
	jsonOut(w, 201, map[string]any{"id": id, "external_call_id": externalID, "status": status, "adapter": response})
}

func (s *Server) updateCallRecord(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c := claims(r)
	var storeID string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM whatsapp_calls WHERE id=$1`, id).Scan(&storeID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
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
	if strings.TrimSpace(s.cfg.CallsAdapterURL) == "" {
		jsonErr(w, 503, "El transporte de llamadas no está configurado")
		return
	}
	allowed := map[string]bool{"answer": true, "reject": true, "hangup": true, "hold": true, "resume": true, "transfer": true}
	if !allowed[action] {
		jsonErr(w, 400, "Acción de llamada no soportada")
		return
	}
	response, err := s.callsAdapterRequest(r.Context(), http.MethodPost, "/calls/"+id+"/"+action, map[string]any{"store_id": storeID, "assigned_staff_id": in.AssignedStaffID})
	if err != nil {
		jsonErr(w, 502, "El motor de llamadas no pudo ejecutar la acción")
		return
	}
	_, _ = s.db.Exec(r.Context(), `INSERT INTO call_events(call_id,event_type,actor_staff_id,metadata) VALUES($1,$2,NULLIF($3,'')::uuid,$4::jsonb)`, id, action, in.AssignedStaffID, mustJSON(response))
	jsonOut(w, 200, map[string]any{"ok": true, "adapter": response})
}

func (s *Server) callsAdapterRequest(ctx context.Context, method, path string, body any) (map[string]any, error) {
	raw, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(s.cfg.CallsAdapterURL, "/")+path, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	secret := strings.TrimSpace(s.cfg.CallsAdapterSecret)
	if secret == "" {
		secret = s.cfg.InternalWebhookSecret
	}
	if secret != "" {
		req.Header.Set("X-Calls-Secret", secret)
	}
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if out == nil {
		out = map[string]any{}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return out, fmt.Errorf("calls adapter status %d", resp.StatusCode)
	}
	return out, nil
}

func (s *Server) callAdapterEvent(w http.ResponseWriter, r *http.Request) {
	secret := strings.TrimSpace(s.cfg.CallsAdapterSecret)
	if secret == "" {
		secret = s.cfg.InternalWebhookSecret
	}
	if secret == "" || r.Header.Get("X-Calls-Secret") != secret {
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
			in.ExternalCallID = fmt.Sprintf("adapter-%d", time.Now().UnixNano())
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
	jsonOut(w, 200, map[string]any{"ok": true, "call_id": in.CallID})
}

func mustJSON(v any) string { raw, _ := json.Marshal(v); return string(raw) }
