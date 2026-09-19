package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

var callStatuses = map[string]bool{"ringing": true, "connecting": true, "active": true, "held": true, "transferred": true, "completed": true, "missed": true, "rejected": true, "failed": true}

func callStatusTerminal(status string) bool {
	return status == "completed" || status == "missed" || status == "rejected" || status == "failed"
}

func preserveCallProgress(persisted, incoming string) string {
	if callStatusTerminal(persisted) {
		return persisted
	}
	if callStatusTerminal(incoming) {
		return incoming
	}
	// Do not regress lifecycle events that arrive out-of-order from the embedded
	// bridge. active/held may legitimately alternate, but neither may fall back
	// to connecting/ringing. connecting may not fall back to ringing.
	switch persisted {
	case "active":
		if incoming == "ringing" || incoming == "connecting" {
			return persisted
		}
	case "held":
		if incoming == "ringing" || incoming == "connecting" {
			return persisted
		}
	case "transferred":
		if incoming == "ringing" || incoming == "connecting" {
			return persisted
		}
	case "connecting":
		if incoming == "ringing" {
			return persisted
		}
	}
	return incoming
}

func (s *Server) resolveCallIdentity(ctx context.Context, storeID, remoteJID, phone, fallback string) (conversationID, displayName, avatarURL string) {
	normalized := normalizePhone(phone)
	// Prefer the tenant relationship and the platform/customer identity over the
	// WhatsApp push name. This mirrors the contact naming rules used by the chat.
	err := s.db.QueryRow(ctx, `
		SELECT c.id::text,
		       coalesce(nullif(c.contact_name,''),nullif(cu.name,''),
		                nullif(trim(concat_ws(' ',gc.name,nullif(gc.last_name,''))),''),
		                nullif(c.whatsapp_name,''),nullif(c.display_name,''),$4),
		       coalesce(nullif(gc.profile_picture_url,''),nullif(c.profile_picture_url,''),'')
		FROM conversations c
		LEFT JOIN customers cu ON cu.id=c.customer_id
		LEFT JOIN global_customers gc ON gc.id=cu.global_customer_id
		WHERE c.store_id=$1
		  AND (
		    ($2<>'' AND c.remote_jid=$2)
		    OR ($3<>'' AND regexp_replace(coalesce(c.whatsapp_phone,''),'[^0-9]','','g')=$3)
		    OR ($3<>'' AND regexp_replace(coalesce(cu.phone,''),'[^0-9]','','g')=$3)
		  )
		ORDER BY CASE WHEN $2<>'' AND c.remote_jid=$2 THEN 0 ELSE 1 END,
		         c.updated_at DESC
		LIMIT 1`, storeID, remoteJID, normalized, strings.TrimSpace(fallback)).Scan(&conversationID, &displayName, &avatarURL)
	if err == nil {
		return conversationID, displayName, avatarURL
	}
	// A customer can exist before a conversation is linked. Resolve that local
	// customer by phone so inbound calls still show the WAMERCIO customer name.
	_ = s.db.QueryRow(ctx, `
		SELECT coalesce(nullif(cu.name,''),nullif(trim(concat_ws(' ',gc.name,nullif(gc.last_name,''))),''),$3),
		       coalesce(nullif(gc.profile_picture_url,''),'')
		FROM customers cu
		LEFT JOIN global_customers gc ON gc.id=cu.global_customer_id
		WHERE cu.store_id=$1
		  AND $2<>''
		  AND regexp_replace(coalesce(cu.phone,''),'[^0-9]','','g')=$2
		ORDER BY cu.updated_at DESC
		LIMIT 1`, storeID, normalized, strings.TrimSpace(fallback)).Scan(&displayName, &avatarURL)
	return conversationID, displayName, avatarURL
}

func (s *Server) refreshCallWhatsAppProfile(storeID, callID, conversationID, phone string) {
	storeID = strings.TrimSpace(storeID)
	callID = strings.TrimSpace(callID)
	phone = normalizePhone(phone)
	if storeID == "" || callID == "" || phone == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 18*time.Second)
	defer cancel()
	out, err := s.bridgeReqWithTimeout(ctx, http.MethodPost, "/sessions/"+storeID+"/profile", map[string]any{"phone": phone}, 15*time.Second)
	if err != nil || out == nil {
		return
	}
	avatar := strings.TrimSpace(flowString(out["profile_picture_url"]))
	pictureID := strings.TrimSpace(flowString(out["profile_picture_id"]))
	whatsappName := strings.TrimSpace(flowString(out["whatsapp_name"]))
	if avatar == "" && pictureID == "" && whatsappName == "" {
		return
	}
	meta := map[string]any{}
	if avatar != "" {
		meta["avatar_url"] = avatar
	}
	if pictureID != "" {
		meta["profile_picture_id"] = pictureID
	}
	_, _ = s.db.Exec(ctx, `UPDATE whatsapp_calls SET metadata=metadata||$1::jsonb,updated_at=now() WHERE id=$2 AND store_id=$3`, mustJSON(meta), callID, storeID)
	if strings.TrimSpace(conversationID) != "" {
		_, _ = s.db.Exec(ctx, `UPDATE conversations SET whatsapp_name=coalesce(nullif($1,''),whatsapp_name),profile_picture_url=coalesce(nullif($2,''),profile_picture_url),profile_picture_id=coalesce(nullif($3,''),profile_picture_id),profile_picture_updated_at=CASE WHEN nullif($2,'') IS NOT NULL OR nullif($3,'') IS NOT NULL THEN now() ELSE profile_picture_updated_at END,updated_at=now() WHERE id=$4 AND store_id=$5`, whatsappName, avatar, pictureID, conversationID, storeID)
	} else {
		_, _ = s.db.Exec(ctx, `UPDATE conversations SET whatsapp_name=coalesce(nullif($1,''),whatsapp_name),profile_picture_url=coalesce(nullif($2,''),profile_picture_url),profile_picture_id=coalesce(nullif($3,''),profile_picture_id),profile_picture_updated_at=CASE WHEN nullif($2,'') IS NOT NULL OR nullif($3,'') IS NOT NULL THEN now() ELSE profile_picture_updated_at END,updated_at=now() WHERE store_id=$4 AND regexp_replace(coalesce(whatsapp_phone,''),'[^0-9]','','g')=$5`, whatsappName, avatar, pictureID, storeID, phone)
	}
	if avatar != "" {
		_, _ = s.db.Exec(ctx, `UPDATE global_customers gc SET profile_picture_url=coalesce(nullif($1,''),gc.profile_picture_url),profile_picture_id=coalesce(nullif($2,''),gc.profile_picture_id),profile_picture_updated_at=now(),updated_at=now() FROM customers cu WHERE cu.global_customer_id=gc.id AND cu.store_id=$3 AND regexp_replace(coalesce(cu.phone,''),'[^0-9]','','g')=$4`, avatar, pictureID, storeID, phone)
	}
	s.publishStoreEvent(ctx, storeID, "call", map[string]any{"call_id": callID, "status": "profile_updated"})
}

func (s *Server) reconcileCallsWithEngine(ctx context.Context, storeID string) {
	if strings.TrimSpace(storeID) == "" {
		return
	}
	engine, err := s.bridgeReqWithTimeout(ctx, http.MethodGet, "/calls/status?store_id="+storeID, nil, 1500*time.Millisecond)
	if err != nil {
		return
	}
	activeByExternal := map[string]string{}
	activeByRecord := map[string]string{}
	if raw, ok := engine["active_call_snapshots"].([]any); ok {
		for _, item := range raw {
			m, _ := item.(map[string]any)
			if m == nil {
				continue
			}
			externalID := strings.TrimSpace(flowString(m["external_call_id"]))
			recordID := strings.TrimSpace(flowString(m["record_id"]))
			status := strings.TrimSpace(flowString(m["status"]))
			if !callStatuses[status] || callStatusTerminal(status) {
				continue
			}
			if externalID != "" {
				activeByExternal[externalID] = status
			}
			if recordID != "" {
				activeByRecord[recordID] = status
			}
		}
	}

	rows, qerr := s.db.Query(ctx, `SELECT id::text,coalesce(external_call_id,''),direction,status,started_at FROM whatsapp_calls WHERE store_id=$1 AND status IN ('ringing','connecting','active','held','transferred') ORDER BY started_at`, storeID)
	if qerr != nil {
		return
	}
	type pendingCall struct {
		id, externalID, direction, status string
		started                           time.Time
	}
	pending := []pendingCall{}
	for rows.Next() {
		var c pendingCall
		if rows.Scan(&c.id, &c.externalID, &c.direction, &c.status, &c.started) == nil {
			pending = append(pending, c)
		}
	}
	rows.Close()
	now := time.Now()
	for _, c := range pending {
		engineStatus := ""
		if c.externalID != "" {
			engineStatus = activeByExternal[c.externalID]
		}
		if engineStatus == "" {
			engineStatus = activeByRecord[c.id]
		}
		if engineStatus != "" {
			next := preserveCallProgress(c.status, engineStatus)
			if next != c.status {
				_, _ = s.db.Exec(ctx, `UPDATE whatsapp_calls SET status=$1,answered_at=CASE WHEN $1='active' THEN coalesce(answered_at,now()) ELSE answered_at END,updated_at=now(),metadata=metadata||jsonb_build_object('reconciled','engine_snapshot') WHERE id=$2 AND store_id=$3`, next, c.id, storeID)
			}
			continue
		}
		// The embedded engine is authoritative for live calls. A record may be
		// briefly absent while POST /calls is still returning its external id, so
		// keep a short grace period before self-healing the database.
		if now.Sub(c.started) < 12*time.Second {
			continue
		}
		terminal := "failed"
		if c.status == "active" || c.status == "held" || c.status == "transferred" {
			terminal = "completed"
		} else if c.direction == "in" {
			terminal = "missed"
		}
		_, _ = s.db.Exec(ctx, `UPDATE whatsapp_calls SET status=$1,ended_at=coalesce(ended_at,now()),duration_seconds=CASE WHEN answered_at IS NOT NULL THEN greatest(0,extract(epoch FROM (coalesce(ended_at,now())-answered_at))::int) ELSE duration_seconds END,updated_at=now(),metadata=metadata||jsonb_build_object('reconciled','engine_absent') WHERE id=$2 AND store_id=$3 AND status IN ('ringing','connecting','active','held','transferred')`, terminal, c.id, storeID)
	}
}

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
	// Hierro del Norte self-heals its broker against the live call registry. Do
	// the same here: the embedded bridge is authoritative for live calls.
	s.reconcileCallsWithEngine(r.Context(), storeID)
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
			metadata := map[string]any{}
			_ = json.Unmarshal(raw, &metadata)
			// Self-heal a live inbound row created by an older bridge/API build so
			// the softphone immediately uses the same customer identity as Chat.
			if direction == "in" && !callStatusTerminal(status) {
				resolvedConversationID, resolvedName, resolvedAvatar := s.resolveCallIdentity(r.Context(), storeID, jid, phone, name)
				changed := false
				if conversationID == "" && resolvedConversationID != "" {
					conversationID = resolvedConversationID
					changed = true
				}
				if strings.TrimSpace(resolvedName) != "" && resolvedName != name {
					name = resolvedName
					changed = true
				}
				if resolvedAvatar != "" {
					metadata["avatar_url"] = resolvedAvatar
				}
				if changed {
					_, _ = s.db.Exec(r.Context(), `UPDATE whatsapp_calls SET conversation_id=coalesce(NULLIF($1,'')::uuid,conversation_id),display_name=coalesce(NULLIF($2,''),display_name),metadata=metadata||$3::jsonb,updated_at=now() WHERE id=$4 AND store_id=$5`, conversationID, name, mustJSON(metadata), id, storeID)
				}
			}
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
		AvatarURL       string `json:"avatar_url"`
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
	// Clear any persisted ghost from a previous call before preparing a new
	// outbound dial. This is the same self-healing principle HDN applies before
	// allowing an operator to dial again.
	s.reconcileCallsWithEngine(r.Context(), in.StoreID)
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
	// Resolve the same tenant/global identity used by Chat before the call is
	// persisted. The caller avatar therefore follows the contact into Calls
	// instead of falling back to initials during the ringing phase.
	resolvedConversationID, resolvedName, resolvedAvatar := s.resolveCallIdentity(r.Context(), in.StoreID, remoteJID, in.Phone, in.DisplayName)
	if in.ConversationID == "" && resolvedConversationID != "" {
		in.ConversationID = resolvedConversationID
	}
	if strings.TrimSpace(resolvedName) != "" {
		in.DisplayName = resolvedName
	}
	avatarURL := strings.TrimSpace(resolvedAvatar)
	if avatarURL == "" {
		avatarURL = strings.TrimSpace(in.AvatarURL)
	}
	metadata := map[string]any{"requested_by": c.UserID}
	if avatarURL != "" {
		metadata["avatar_url"] = avatarURL
	}
	var id string
	// Keep the critical insert intentionally small and explicitly typed. Optional
	// relations are attached immediately afterwards so they cannot prevent a
	// valid WhatsApp call from reaching the embedded engine.
	err := s.db.QueryRow(r.Context(), `INSERT INTO whatsapp_calls(store_id,remote_jid,phone,display_name,direction,status,metadata) VALUES($1,$2,$3,$4,'out','connecting',$5::jsonb) RETURNING id::text`, in.StoreID, remoteJID, in.Phone, strings.TrimSpace(in.DisplayName), mustJSON(metadata)).Scan(&id)
	if err != nil {
		log.Printf("wamercio calls: prepare outgoing call failed store=%s phone=%s err=%v", in.StoreID, in.Phone, err)
		jsonErr(w, 500, "No se pudo preparar la llamada")
		return
	}
	if strings.TrimSpace(in.ConversationID) != "" {
		_, _ = s.db.Exec(r.Context(), `UPDATE whatsapp_calls SET conversation_id=$1::uuid,updated_at=now() WHERE id=$2 AND store_id=$3`, in.ConversationID, id, in.StoreID)
	}
	if strings.TrimSpace(in.AssignedStaffID) != "" {
		_, _ = s.db.Exec(r.Context(), `UPDATE whatsapp_calls SET assigned_staff_id=$1::uuid,updated_at=now() WHERE id=$2 AND store_id=$3`, in.AssignedStaffID, id, in.StoreID)
	}
	if avatarURL == "" {
		go s.refreshCallWhatsAppProfile(in.StoreID, id, in.ConversationID, in.Phone)
	}
	payload := map[string]any{"call_id": id, "store_id": in.StoreID, "conversation_id": in.ConversationID, "remote_jid": remoteJID, "phone": in.Phone, "display_name": in.DisplayName, "assigned_staff_id": in.AssignedStaffID}
	response, err := s.bridgeReqWithTimeout(r.Context(), http.MethodPost, "/calls", payload, 65*time.Second)
	if err != nil {
		_, _ = s.db.Exec(r.Context(), `UPDATE whatsapp_calls SET status='failed',ended_at=now(),metadata=metadata||jsonb_build_object('engine_error',$1::text),updated_at=now() WHERE id=$2`, err.Error(), id)
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
		// Ending a call must be locally final even if the peer already terminated it
		// or the bridge response is lost. Otherwise the same stale ringing record
		// keeps reopening the softphone on every poll/navigation. Keep the transport
		// error in call_events for diagnostics, but make hangup/reject idempotent.
		if action == "hangup" || action == "reject" {
			terminalStatus := "completed"
			if action == "reject" {
				terminalStatus = "rejected"
			}
			_, _ = s.db.Exec(r.Context(), `UPDATE whatsapp_calls SET status=$1,ended_at=coalesce(ended_at,now()),updated_at=now(),metadata=metadata||jsonb_build_object('control_warning',$2::text) WHERE id=$3 AND store_id=$4`, terminalStatus, err.Error(), id, storeID)
			_, _ = s.db.Exec(r.Context(), `INSERT INTO call_events(call_id,event_type,metadata) VALUES($1,$2,$3::jsonb)`, id, action+"_local", mustJSON(map[string]any{"engine_error": err.Error()}))
			s.publishStoreEvent(r.Context(), storeID, "call", map[string]any{"call_id": id, "status": terminalStatus, "action": action})
			jsonOut(w, 200, map[string]any{"ok": true, "status": terminalStatus, "warning": err.Error(), "engine": map[string]any{"degraded": true}})
			return
		}
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
	resolvedConversationID, resolvedName, resolvedAvatar := s.resolveCallIdentity(r.Context(), in.StoreID, in.RemoteJID, in.Phone, in.DisplayName)
	if strings.TrimSpace(in.ConversationID) == "" && resolvedConversationID != "" {
		in.ConversationID = resolvedConversationID
	}
	if strings.TrimSpace(resolvedName) != "" {
		in.DisplayName = resolvedName
	}
	if resolvedAvatar != "" {
		if in.Metadata == nil {
			in.Metadata = map[string]any{}
		}
		in.Metadata["avatar_url"] = resolvedAvatar
	}
	if in.CallID == "" && in.ExternalCallID != "" {
		_ = s.db.QueryRow(r.Context(), `SELECT id::text FROM whatsapp_calls WHERE store_id=$1 AND external_call_id=$2 ORDER BY started_at DESC LIMIT 1`, in.StoreID, in.ExternalCallID).Scan(&in.CallID)
	}
	createdCall := false
	if in.CallID == "" {
		if in.ExternalCallID == "" {
			in.ExternalCallID = fmt.Sprintf("wamercio-call-%d", time.Now().UnixNano())
		}
		err := s.db.QueryRow(r.Context(), `INSERT INTO whatsapp_calls(store_id,conversation_id,remote_jid,phone,display_name,direction,status,assigned_staff_id,external_call_id,metadata) VALUES($1,NULLIF($2,'')::uuid,$3,$4,$5,$6,$7,NULLIF($8,'')::uuid,$9,$10::jsonb) RETURNING id::text`, in.StoreID, in.ConversationID, in.RemoteJID, normalizePhone(in.Phone), in.DisplayName, in.Direction, in.Status, in.AssignedStaffID, in.ExternalCallID, mustJSON(in.Metadata)).Scan(&in.CallID)
		if err != nil {
			jsonErr(w, 500, "No se pudo registrar la llamada")
			return
		}
		createdCall = true
	}
	// Call lifecycle is monotonic even though persistence callbacks are sent
	// asynchronously. Terminal states never resurrect, Active/Held never regress
	// to Ringing/Connecting, and Connecting never regresses to Ringing.
	var persistedStatus string
	_ = s.db.QueryRow(r.Context(), `SELECT status FROM whatsapp_calls WHERE id=$1 AND store_id=$2`, in.CallID, in.StoreID).Scan(&persistedStatus)
	in.Status = preserveCallProgress(persistedStatus, in.Status)
	answeredSQL := "answered_at"
	ended := callStatusTerminal(in.Status)
	_, _ = s.db.Exec(r.Context(), fmt.Sprintf(`UPDATE whatsapp_calls SET status=$1,assigned_staff_id=coalesce(NULLIF($2,'')::uuid,assigned_staff_id),external_call_id=coalesce(NULLIF($3,''),external_call_id),recording_url=coalesce(NULLIF($4,''),recording_url),transcript=coalesce(NULLIF($5,''),transcript),metadata=metadata||$6::jsonb,%s=CASE WHEN $1='active' THEN coalesce(%s,now()) ELSE %s END,ended_at=CASE WHEN $7 THEN coalesce(ended_at,now()) ELSE ended_at END,duration_seconds=CASE WHEN $7 AND %s IS NOT NULL THEN greatest(0,extract(epoch FROM (coalesce(ended_at,now())-%s))::int) ELSE duration_seconds END,conversation_id=coalesce(NULLIF($10,'')::uuid,conversation_id),remote_jid=coalesce(NULLIF($11,''),remote_jid),phone=coalesce(NULLIF($12,''),phone),display_name=coalesce(NULLIF($13,''),display_name),updated_at=now() WHERE id=$8 AND store_id=$9`, answeredSQL, answeredSQL, answeredSQL, answeredSQL, answeredSQL), in.Status, in.AssignedStaffID, in.ExternalCallID, in.RecordingURL, in.Transcript, mustJSON(in.Metadata), ended, in.CallID, in.StoreID, in.ConversationID, in.RemoteJID, normalizePhone(in.Phone), strings.TrimSpace(in.DisplayName))
	_, _ = s.db.Exec(r.Context(), `INSERT INTO call_events(call_id,event_type,actor_staff_id,metadata) VALUES($1,$2,NULLIF($3,'')::uuid,$4::jsonb)`, in.CallID, in.Status, in.AssignedStaffID, mustJSON(in.Metadata))
	s.publishStoreEvent(r.Context(), in.StoreID, "call", map[string]any{"call_id": in.CallID, "status": in.Status})
	if createdCall && strings.TrimSpace(resolvedAvatar) == "" && normalizePhone(in.Phone) != "" {
		go s.refreshCallWhatsAppProfile(in.StoreID, in.CallID, in.ConversationID, in.Phone)
	}
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
