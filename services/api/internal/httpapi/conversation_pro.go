package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

type conversationWorkflowInput struct {
	QueueID  string `json:"queue_id"`
	StaffID  string `json:"staff_id"`
	Priority string `json:"priority"`
}

func normalizeConversationPriority(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	switch v {
	case "low", "normal", "high", "urgent":
		return v
	default:
		return "normal"
	}
}

func (s *Server) logConversationEvent(ctx context.Context, storeID, conversationID, actorID, eventType string, metadata map[string]any) {
	if strings.TrimSpace(storeID) == "" || strings.TrimSpace(conversationID) == "" || strings.TrimSpace(eventType) == "" {
		return
	}
	raw, _ := json.Marshal(metadata)
	_, _ = s.db.Exec(ctx, `INSERT INTO conversation_events(conversation_id,store_id,actor_user_id,event_type,metadata) VALUES($1,$2,nullif($3,'')::uuid,$4,$5::jsonb)`, conversationID, storeID, actorID, eventType, string(raw))
}

func (s *Server) listConversationQueues(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	_, _ = s.db.Exec(r.Context(), `INSERT INTO conversation_queues(store_id,name,routing_strategy,sla_minutes,sort_order) VALUES($1,'General','manual',30,10) ON CONFLICT(store_id,name) DO NOTHING`, storeID)
	rows, err := s.db.Query(r.Context(), `
		SELECT q.id::text,q.name,q.routing_strategy,q.sla_minutes,q.is_active,q.sort_order,
		       count(DISTINCT qm.staff_id)::int,
		       count(DISTINCT c.id) FILTER (WHERE c.status<>'closed')::int
		FROM conversation_queues q
		LEFT JOIN conversation_queue_members qm ON qm.queue_id=q.id
		LEFT JOIN conversations c ON c.queue_id=q.id
		WHERE q.store_id=$1
		GROUP BY q.id
		ORDER BY q.sort_order,q.name`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las colas")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, strategy string
		var sla, sortOrder, members, open int
		var active bool
		if rows.Scan(&id, &name, &strategy, &sla, &active, &sortOrder, &members, &open) == nil {
			out = append(out, map[string]any{"id": id, "name": name, "routing_strategy": strategy, "sla_minutes": sla, "is_active": active, "sort_order": sortOrder, "member_count": members, "open_count": open})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) createConversationQueue(w http.ResponseWriter, r *http.Request) {
	var in struct {
		StoreID         string `json:"store_id"`
		Name            string `json:"name"`
		RoutingStrategy string `json:"routing_strategy"`
		SLAMinutes      int    `json:"sla_minutes"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.StoreID) == "" || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Completa el negocio y el nombre de la cola")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	strategy := strings.ToLower(strings.TrimSpace(in.RoutingStrategy))
	switch strategy {
	case "manual", "round_robin", "least_load", "random":
	default:
		strategy = "manual"
	}
	if in.SLAMinutes <= 0 {
		in.SLAMinutes = 30
	}
	if in.SLAMinutes > 10080 {
		in.SLAMinutes = 10080
	}
	var id string
	if err := s.db.QueryRow(r.Context(), `INSERT INTO conversation_queues(store_id,name,routing_strategy,sla_minutes) VALUES($1,$2,$3,$4) RETURNING id::text`, in.StoreID, strings.TrimSpace(in.Name), strategy, in.SLAMinutes).Scan(&id); err != nil {
		jsonErr(w, 409, "No se pudo crear la cola; verifica que el nombre no exista")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id, "ok": true})
}

func (s *Server) updateConversationQueue(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var storeID string
	c := claims(r)
	if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM conversation_queues WHERE id=$1`, id).Scan(&storeID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Cola no encontrada")
		return
	}
	var in struct {
		Name            string `json:"name"`
		RoutingStrategy string `json:"routing_strategy"`
		SLAMinutes      int    `json:"sla_minutes"`
		IsActive        *bool  `json:"is_active"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Nombre inválido")
		return
	}
	strategy := strings.ToLower(strings.TrimSpace(in.RoutingStrategy))
	switch strategy {
	case "manual", "round_robin", "least_load", "random":
	default:
		strategy = "manual"
	}
	if in.SLAMinutes <= 0 {
		in.SLAMinutes = 30
	}
	active := true
	if in.IsActive != nil {
		active = *in.IsActive
	}
	if _, err := s.db.Exec(r.Context(), `UPDATE conversation_queues SET name=$1,routing_strategy=$2,sla_minutes=$3,is_active=$4,updated_at=now() WHERE id=$5`, strings.TrimSpace(in.Name), strategy, in.SLAMinutes, active, id); err != nil {
		jsonErr(w, 409, "No se pudo actualizar la cola")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) listConversationQueueMembers(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c := claims(r)
	var storeID string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM conversation_queues WHERE id=$1`, id).Scan(&storeID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Cola no encontrada")
		return
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT ss.id::text,ss.name,ss.role,ss.status,(qm.staff_id IS NOT NULL) AS selected
		FROM store_staff ss
		LEFT JOIN conversation_queue_members qm ON qm.queue_id=$1 AND qm.staff_id=ss.id
		WHERE ss.store_id=$2 AND ss.status='active' AND ss.role<>'delivery'
		ORDER BY ss.name`, id, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los agentes de la cola")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var staffID, name, role, status string
		var selected bool
		if rows.Scan(&staffID, &name, &role, &status, &selected) == nil {
			out = append(out, map[string]any{"id": staffID, "name": name, "role": role, "status": status, "selected": selected})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) updateConversationQueueMembers(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c := claims(r)
	var storeID string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM conversation_queues WHERE id=$1`, id).Scan(&storeID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Cola no encontrada")
		return
	}
	var in struct {
		StaffIDs []string `json:"staff_ids"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Agentes inválidos")
		return
	}
	clean := make([]string, 0, len(in.StaffIDs))
	seen := map[string]bool{}
	for _, staffID := range in.StaffIDs {
		staffID = strings.TrimSpace(staffID)
		if staffID == "" || seen[staffID] {
			continue
		}
		var actualStore, role string
		if s.db.QueryRow(r.Context(), `SELECT store_id::text,role FROM store_staff WHERE id=$1 AND status='active'`, staffID).Scan(&actualStore, &role) != nil || actualStore != storeID || role == "delivery" {
			jsonErr(w, 400, "Uno de los agentes no pertenece a este negocio o no puede atender conversaciones")
			return
		}
		seen[staffID] = true
		clean = append(clean, staffID)
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar la cola")
		return
	}
	defer tx.Rollback(r.Context())
	if _, err = tx.Exec(r.Context(), `DELETE FROM conversation_queue_members WHERE queue_id=$1`, id); err != nil {
		jsonErr(w, 500, "No se pudo actualizar la cola")
		return
	}
	for _, staffID := range clean {
		if _, err = tx.Exec(r.Context(), `INSERT INTO conversation_queue_members(queue_id,staff_id) VALUES($1,$2)`, id, staffID); err != nil {
			jsonErr(w, 500, "No se pudo actualizar la cola")
			return
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo actualizar la cola")
		return
	}
	jsonOut(w, 200, map[string]any{"ok": true, "member_count": len(clean)})
}

func (s *Server) listConversationTags(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	_, _ = s.db.Exec(r.Context(), `INSERT INTO conversation_tags(store_id,name,color) VALUES($1,'Venta','#D9FDD3'),($1,'Seguimiento','#FFF4CC'),($1,'Importante','#FFE0E0') ON CONFLICT(store_id,name) DO NOTHING`, storeID)
	rows, err := s.db.Query(r.Context(), `SELECT id::text,name,color,is_active FROM conversation_tags WHERE store_id=$1 ORDER BY name`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las etiquetas")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, color string
		var active bool
		if rows.Scan(&id, &name, &color, &active) == nil {
			out = append(out, map[string]any{"id": id, "name": name, "color": color, "is_active": active})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) createConversationTag(w http.ResponseWriter, r *http.Request) {
	var in struct {
		StoreID string `json:"store_id"`
		Name    string `json:"name"`
		Color   string `json:"color"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.StoreID) == "" || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Completa el negocio y el nombre")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	if strings.TrimSpace(in.Color) == "" {
		in.Color = "#D9FDD3"
	}
	var id string
	if err := s.db.QueryRow(r.Context(), `INSERT INTO conversation_tags(store_id,name,color) VALUES($1,$2,$3) RETURNING id::text`, in.StoreID, strings.TrimSpace(in.Name), strings.TrimSpace(in.Color)).Scan(&id); err != nil {
		jsonErr(w, 409, "No se pudo crear la etiqueta")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id, "ok": true})
}

func (s *Server) conversationWorkflow(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	storeID, _, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	var queueID, queueName, staffID, staffName, priority string
	var slaMinutes int
	var assignmentAt, lastInbound, lastOutbound, firstResponse, resolvedAt *time.Time
	_ = s.db.QueryRow(r.Context(), `
		SELECT coalesce(c.queue_id::text,''),coalesce(q.name,''),coalesce(q.sla_minutes,30),
		       coalesce(c.assigned_staff_id::text,''),coalesce(ss.name,''),coalesce(c.priority,'normal'),
		       c.assignment_updated_at,c.last_inbound_at,c.last_outbound_at,c.first_response_at,c.resolved_at
		FROM conversations c
		LEFT JOIN conversation_queues q ON q.id=c.queue_id
		LEFT JOIN store_staff ss ON ss.id=c.assigned_staff_id
		WHERE c.id=$1`, id).Scan(&queueID, &queueName, &slaMinutes, &staffID, &staffName, &priority, &assignmentAt, &lastInbound, &lastOutbound, &firstResponse, &resolvedAt)
	rows, _ := s.db.Query(r.Context(), `SELECT t.id::text,t.name,t.color FROM conversation_tag_links l JOIN conversation_tags t ON t.id=l.tag_id WHERE l.conversation_id=$1 ORDER BY t.name`, id)
	tags := []map[string]any{}
	if rows != nil {
		for rows.Next() {
			var tid, name, color string
			if rows.Scan(&tid, &name, &color) == nil {
				tags = append(tags, map[string]any{"id": tid, "name": name, "color": color})
			}
		}
		rows.Close()
	}
	var pending int
	_ = s.db.QueryRow(r.Context(), `SELECT count(*)::int FROM scheduled_conversation_messages WHERE conversation_id=$1 AND status='pending'`, id).Scan(&pending)
	waitingMinutes := 0
	if lastInbound != nil && (lastOutbound == nil || lastInbound.After(*lastOutbound)) {
		waitingMinutes = int(time.Since(*lastInbound).Minutes())
		if waitingMinutes < 0 {
			waitingMinutes = 0
		}
	}
	jsonOut(w, 200, map[string]any{
		"store_id": storeID, "queue_id": queueID, "queue_name": queueName, "sla_minutes": slaMinutes,
		"staff_id": staffID, "staff_name": staffName, "priority": priority, "assignment_updated_at": assignmentAt,
		"last_inbound_at": lastInbound, "last_outbound_at": lastOutbound, "first_response_at": firstResponse, "resolved_at": resolvedAt,
		"waiting_minutes": waitingMinutes, "sla_breached": lastInbound != nil && (lastOutbound == nil || lastInbound.After(*lastOutbound)) && waitingMinutes > slaMinutes && resolvedAt == nil,
		"tags": tags, "pending_scheduled": pending,
	})
}

func (s *Server) updateConversationWorkflow(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	storeID, _, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	var in conversationWorkflowInput
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	in.Priority = normalizeConversationPriority(in.Priority)
	if in.QueueID != "" {
		var queueStore string
		if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM conversation_queues WHERE id=$1 AND is_active=true`, in.QueueID).Scan(&queueStore) != nil || queueStore != storeID {
			jsonErr(w, 400, "La cola no pertenece a este negocio")
			return
		}
	}
	if in.StaffID != "" {
		var staffStore string
		if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM store_staff WHERE id=$1 AND status='active'`, in.StaffID).Scan(&staffStore) != nil || staffStore != storeID {
			jsonErr(w, 400, "El agente no pertenece a este negocio")
			return
		}
	}
	_, err := s.db.Exec(r.Context(), `UPDATE conversations SET queue_id=nullif($1,'')::uuid,assigned_staff_id=nullif($2,'')::uuid,priority=$3,assignment_updated_at=now(),updated_at=now() WHERE id=$4`, in.QueueID, in.StaffID, in.Priority, id)
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar la atención")
		return
	}
	s.logConversationEvent(r.Context(), storeID, id, c.UserID, "workflow_updated", map[string]any{"queue_id": in.QueueID, "staff_id": in.StaffID, "priority": in.Priority})
	s.publishStoreEvent(r.Context(), storeID, "conversation_workflow", map[string]any{"conversation_id": id})
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) autoAssignConversation(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	storeID, _, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	var in struct {
		QueueID string `json:"queue_id"`
	}
	_ = decode(r, &in)
	if strings.TrimSpace(in.QueueID) == "" {
		_ = s.db.QueryRow(r.Context(), `SELECT coalesce(queue_id::text,'') FROM conversations WHERE id=$1`, id).Scan(&in.QueueID)
	}
	if strings.TrimSpace(in.QueueID) == "" {
		_ = s.db.QueryRow(r.Context(), `SELECT id::text FROM conversation_queues WHERE store_id=$1 AND is_active=true ORDER BY sort_order,name LIMIT 1`, storeID).Scan(&in.QueueID)
	}
	var strategy string
	if s.db.QueryRow(r.Context(), `SELECT routing_strategy FROM conversation_queues WHERE id=$1 AND store_id=$2 AND is_active=true`, in.QueueID, storeID).Scan(&strategy) != nil {
		jsonErr(w, 400, "Selecciona una cola activa")
		return
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT ss.id::text,ss.name,
		       count(c.id) FILTER (WHERE c.status<>'closed')::int AS open_count,
		       max(c.assignment_updated_at) AS last_assignment
		FROM store_staff ss
		LEFT JOIN conversations c ON c.assigned_staff_id=ss.id
		WHERE ss.store_id=$1 AND ss.status='active' AND ss.role<>'delivery'
		  AND (NOT EXISTS (SELECT 1 FROM conversation_queue_members qm WHERE qm.queue_id=$2)
		       OR EXISTS (SELECT 1 FROM conversation_queue_members qm WHERE qm.queue_id=$2 AND qm.staff_id=ss.id))
		GROUP BY ss.id,ss.name`, storeID, in.QueueID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los agentes")
		return
	}
	defer rows.Close()
	type candidate struct {
		id, name string
		open     int
		last     *time.Time
	}
	candidates := []candidate{}
	for rows.Next() {
		var x candidate
		if rows.Scan(&x.id, &x.name, &x.open, &x.last) == nil {
			candidates = append(candidates, x)
		}
	}
	if len(candidates) == 0 {
		jsonErr(w, 409, "No hay agentes activos disponibles")
		return
	}
	pick := candidates[0]
	switch strategy {
	case "random":
		pick = candidates[rand.IntN(len(candidates))]
	case "round_robin":
		for _, x := range candidates[1:] {
			if pick.last != nil && (x.last == nil || x.last.Before(*pick.last)) {
				pick = x
			}
		}
	case "least_load":
		for _, x := range candidates[1:] {
			if x.open < pick.open || (x.open == pick.open && pick.last != nil && (x.last == nil || x.last.Before(*pick.last))) {
				pick = x
			}
		}
	default:
		jsonErr(w, 409, "Esta cola está configurada para asignación manual")
		return
	}
	_, _ = s.db.Exec(r.Context(), `UPDATE conversations SET queue_id=$1,assigned_staff_id=$2,assignment_updated_at=now(),updated_at=now() WHERE id=$3`, in.QueueID, pick.id, id)
	s.logConversationEvent(r.Context(), storeID, id, c.UserID, "auto_assigned", map[string]any{"queue_id": in.QueueID, "staff_id": pick.id, "strategy": strategy})
	s.publishStoreEvent(r.Context(), storeID, "conversation_workflow", map[string]any{"conversation_id": id})
	jsonOut(w, 200, map[string]any{"ok": true, "staff_id": pick.id, "staff_name": pick.name, "routing_strategy": strategy})
}

func (s *Server) addConversationTag(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	storeID, _, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	var in struct {
		TagID string `json:"tag_id"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.TagID) == "" {
		jsonErr(w, 400, "Etiqueta inválida")
		return
	}
	var tagStore, tagName string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text,name FROM conversation_tags WHERE id=$1 AND is_active=true`, in.TagID).Scan(&tagStore, &tagName) != nil || tagStore != storeID {
		jsonErr(w, 400, "Etiqueta inválida")
		return
	}
	_, _ = s.db.Exec(r.Context(), `INSERT INTO conversation_tag_links(conversation_id,tag_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, id, in.TagID)
	s.logConversationEvent(r.Context(), storeID, id, c.UserID, "tag_added", map[string]any{"tag_id": in.TagID, "tag_name": tagName})
	s.publishStoreEvent(r.Context(), storeID, "conversation_workflow", map[string]any{"conversation_id": id})
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) removeConversationTag(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	storeID, _, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	tagID := chi.URLParam(r, "tagID")
	_, _ = s.db.Exec(r.Context(), `DELETE FROM conversation_tag_links WHERE conversation_id=$1 AND tag_id=$2`, id, tagID)
	s.logConversationEvent(r.Context(), storeID, id, c.UserID, "tag_removed", map[string]any{"tag_id": tagID})
	s.publishStoreEvent(r.Context(), storeID, "conversation_workflow", map[string]any{"conversation_id": id})
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) sendConversationPoll(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	storeID, jid, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	if s.conversationIsBlocked(r.Context(), id) {
		jsonErr(w, 409, "El contacto está bloqueado")
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
	out, err := s.bridgeReq(r.Context(), "POST", "/sessions/"+storeID+"/polls", map[string]any{
		"to": jid, "question": in.Question, "options": options, "max_selections": in.MaxSelections,
	})
	if err != nil {
		jsonErr(w, 502, "No se pudo enviar la encuesta. Verifica la conexión de WhatsApp")
		return
	}
	msgID := strings.TrimSpace(fmt.Sprint(out["id"]))
	if msgID == "" || msgID == "<nil>" {
		msgID = "poll-" + fmt.Sprint(time.Now().UnixNano())
	}
	visible := in.Question + "\n" + strings.Join(options, "\n")
	now := time.Now()
	_, _ = s.db.Exec(r.Context(), `INSERT INTO messages(conversation_id,message_id,direction,type,body,status,occurred_at) VALUES($1,$2,'out','poll',$3,'sent',$4) ON CONFLICT(conversation_id,message_id) DO NOTHING`, id, msgID, visible, now)
	_, _ = s.db.Exec(r.Context(), `UPDATE conversations SET last_message=$1,last_message_at=$2,last_outbound_at=$2,first_response_at=coalesce(first_response_at,$2),updated_at=now() WHERE id=$3`, "Encuesta: "+in.Question, now, id)
	s.logConversationEvent(r.Context(), storeID, id, c.UserID, "poll_sent", map[string]any{"message_id": msgID, "question": in.Question, "options": options})
	s.publishStoreEvent(r.Context(), storeID, "message", map[string]any{"conversation_id": id, "direction": "out", "type": "poll"})
	jsonOut(w, 200, map[string]any{"ok": true, "id": msgID, "type": "poll", "body": visible, "occurred_at": now})
}

func (s *Server) listScheduledConversationMessages(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	_, _, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id::text,body,scheduled_for,cancel_on_reply,status,coalesce(error,''),created_at,sent_at,cancelled_at FROM scheduled_conversation_messages WHERE conversation_id=$1 ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,scheduled_for DESC LIMIT 100`, id)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los seguimientos")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var sid, body, status, runErr string
		var when, created time.Time
		var cancel bool
		var sent, cancelled *time.Time
		if rows.Scan(&sid, &body, &when, &cancel, &status, &runErr, &created, &sent, &cancelled) == nil {
			out = append(out, map[string]any{"id": sid, "body": body, "scheduled_for": when, "cancel_on_reply": cancel, "status": status, "error": runErr, "created_at": created, "sent_at": sent, "cancelled_at": cancelled})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) scheduleConversationMessage(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	storeID, _, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	if s.conversationIsBlocked(r.Context(), id) {
		jsonErr(w, 409, "El contacto está bloqueado")
		return
	}
	var in struct {
		Body          string    `json:"body"`
		ScheduledFor  time.Time `json:"scheduled_for"`
		CancelOnReply bool      `json:"cancel_on_reply"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Body) == "" || in.ScheduledFor.IsZero() {
		jsonErr(w, 400, "Completa el mensaje y la fecha")
		return
	}
	if in.ScheduledFor.Before(time.Now().Add(-30 * time.Second)) {
		jsonErr(w, 400, "La fecha programada debe estar en el futuro")
		return
	}
	if in.ScheduledFor.After(time.Now().AddDate(1, 0, 0)) {
		jsonErr(w, 400, "Puedes programar seguimientos hasta un año")
		return
	}
	var scheduledID string
	if err := s.db.QueryRow(r.Context(), `INSERT INTO scheduled_conversation_messages(store_id,conversation_id,created_by,body,scheduled_for,cancel_on_reply) VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text`, storeID, id, c.UserID, strings.TrimSpace(in.Body), in.ScheduledFor, in.CancelOnReply).Scan(&scheduledID); err != nil {
		jsonErr(w, 500, "No se pudo programar el seguimiento")
		return
	}
	s.logConversationEvent(r.Context(), storeID, id, c.UserID, "message_scheduled", map[string]any{"scheduled_id": scheduledID, "scheduled_for": in.ScheduledFor, "cancel_on_reply": in.CancelOnReply})
	jsonOut(w, 201, map[string]any{"id": scheduledID, "ok": true})
}

func (s *Server) cancelScheduledConversationMessage(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	storeID, _, ok := s.conversationOwned(r.Context(), c, id)
	if !ok {
		jsonErr(w, 404, "Conversación no encontrada")
		return
	}
	scheduledID := chi.URLParam(r, "scheduledID")
	res, _ := s.db.Exec(r.Context(), `UPDATE scheduled_conversation_messages SET status='cancelled',cancelled_at=now(),updated_at=now() WHERE id=$1 AND conversation_id=$2 AND status='pending'`, scheduledID, id)
	if res.RowsAffected() == 0 {
		jsonErr(w, 409, "El seguimiento ya no se puede cancelar")
		return
	}
	s.logConversationEvent(r.Context(), storeID, id, c.UserID, "message_schedule_cancelled", map[string]any{"scheduled_id": scheduledID})
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) cancelReplySensitiveFollowups(ctx context.Context, conversationID string, inboundAt time.Time) {
	_, _ = s.db.Exec(ctx, `UPDATE scheduled_conversation_messages SET status='cancelled',cancelled_at=now(),updated_at=now(),error='Cancelado automáticamente: el cliente respondió' WHERE conversation_id=$1 AND status='pending' AND cancel_on_reply=true AND created_at<=$2`, conversationID, inboundAt)
}

func (s *Server) maybeAutoAssignIncomingConversation(ctx context.Context, storeID, conversationID string) {
	var assigned, queueID string
	_ = s.db.QueryRow(ctx, `SELECT coalesce(assigned_staff_id::text,''),coalesce(queue_id::text,'') FROM conversations WHERE id=$1 AND store_id=$2`, conversationID, storeID).Scan(&assigned, &queueID)
	if assigned != "" {
		return
	}
	_, _ = s.db.Exec(ctx, `INSERT INTO conversation_queues(store_id,name,routing_strategy,sla_minutes,sort_order) VALUES($1,'General','manual',30,10) ON CONFLICT(store_id,name) DO NOTHING`, storeID)
	if queueID == "" {
		_ = s.db.QueryRow(ctx, `SELECT id::text FROM conversation_queues WHERE store_id=$1 AND is_active=true ORDER BY sort_order,name LIMIT 1`, storeID).Scan(&queueID)
		if queueID != "" {
			_, _ = s.db.Exec(ctx, `UPDATE conversations SET queue_id=$1,updated_at=now() WHERE id=$2 AND queue_id IS NULL`, queueID, conversationID)
		}
	}
	var strategy string
	if queueID == "" || s.db.QueryRow(ctx, `SELECT routing_strategy FROM conversation_queues WHERE id=$1 AND store_id=$2 AND is_active=true`, queueID, storeID).Scan(&strategy) != nil || strategy == "manual" {
		return
	}
	rows, err := s.db.Query(ctx, `SELECT ss.id::text,ss.name,count(c.id) FILTER (WHERE c.status<>'closed')::int,max(c.assignment_updated_at) FROM store_staff ss LEFT JOIN conversations c ON c.assigned_staff_id=ss.id WHERE ss.store_id=$1 AND ss.status='active' AND ss.role<>'delivery' AND (NOT EXISTS (SELECT 1 FROM conversation_queue_members qm WHERE qm.queue_id=$2) OR EXISTS (SELECT 1 FROM conversation_queue_members qm WHERE qm.queue_id=$2 AND qm.staff_id=ss.id)) GROUP BY ss.id,ss.name`, storeID, queueID)
	if err != nil {
		return
	}
	defer rows.Close()
	type candidate struct {
		id, name string
		open     int
		last     *time.Time
	}
	items := []candidate{}
	for rows.Next() {
		var x candidate
		if rows.Scan(&x.id, &x.name, &x.open, &x.last) == nil {
			items = append(items, x)
		}
	}
	if len(items) == 0 {
		return
	}
	pick := items[0]
	switch strategy {
	case "random":
		pick = items[rand.IntN(len(items))]
	case "round_robin":
		for _, x := range items[1:] {
			if pick.last != nil && (x.last == nil || x.last.Before(*pick.last)) {
				pick = x
			}
		}
	case "least_load":
		for _, x := range items[1:] {
			if x.open < pick.open || (x.open == pick.open && pick.last != nil && (x.last == nil || x.last.Before(*pick.last))) {
				pick = x
			}
		}
	default:
		return
	}
	res, _ := s.db.Exec(ctx, `UPDATE conversations SET queue_id=$1,assigned_staff_id=$2,assignment_updated_at=now(),updated_at=now() WHERE id=$3 AND assigned_staff_id IS NULL`, queueID, pick.id, conversationID)
	if res.RowsAffected() > 0 {
		s.logConversationEvent(ctx, storeID, conversationID, "", "auto_assigned", map[string]any{"queue_id": queueID, "staff_id": pick.id, "strategy": strategy})
	}
}

func (s *Server) conversationWorkflowLoop() {
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		s.dispatchDueConversationMessages(context.Background())
	}
}

func (s *Server) dispatchDueConversationMessages(ctx context.Context) {
	_, _ = s.db.Exec(ctx, `UPDATE scheduled_conversation_messages SET status='pending',error=coalesce(error,'')||' · reintentado tras interrupción',updated_at=now() WHERE status='processing' AND updated_at<now()-interval '5 minutes'`)
	rows, err := s.db.Query(ctx, `SELECT id::text FROM scheduled_conversation_messages WHERE status='pending' AND scheduled_for<=now() ORDER BY scheduled_for LIMIT 50`)
	if err != nil {
		return
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	for _, id := range ids {
		go s.dispatchConversationMessage(id)
	}
}

func (s *Server) dispatchConversationMessage(id string) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	res, err := s.db.Exec(ctx, `UPDATE scheduled_conversation_messages SET status='processing',updated_at=now() WHERE id=$1 AND status='pending' AND scheduled_for<=now()`, id)
	if err != nil || res.RowsAffected() == 0 {
		return
	}
	var storeID, conversationID, jid, body string
	var cancelOnReply bool
	var createdAt time.Time
	var lastInbound *time.Time
	err = s.db.QueryRow(ctx, `
		SELECT scm.store_id::text,scm.conversation_id::text,c.remote_jid,scm.body,scm.cancel_on_reply,scm.created_at,c.last_inbound_at
		FROM scheduled_conversation_messages scm JOIN conversations c ON c.id=scm.conversation_id WHERE scm.id=$1`, id).Scan(&storeID, &conversationID, &jid, &body, &cancelOnReply, &createdAt, &lastInbound)
	if err != nil {
		_, _ = s.db.Exec(ctx, `UPDATE scheduled_conversation_messages SET status='failed',error=$2,updated_at=now() WHERE id=$1`, id, "No se pudo resolver la conversación")
		return
	}
	if cancelOnReply && lastInbound != nil && lastInbound.After(createdAt) {
		_, _ = s.db.Exec(ctx, `UPDATE scheduled_conversation_messages SET status='cancelled',cancelled_at=now(),error='Cancelado automáticamente: el cliente respondió',updated_at=now() WHERE id=$1`, id)
		return
	}
	var blocked bool
	_ = s.db.QueryRow(ctx, `SELECT coalesce(contact_status,'active')='blocked' FROM conversations WHERE id=$1`, conversationID).Scan(&blocked)
	if blocked {
		_, _ = s.db.Exec(ctx, `UPDATE scheduled_conversation_messages SET status='failed',error='Contacto bloqueado',updated_at=now() WHERE id=$1`, id)
		return
	}
	out, err := s.bridgeReq(ctx, "POST", "/sessions/"+storeID+"/messages", map[string]any{"to": jid, "text": body})
	if err != nil {
		_, _ = s.db.Exec(ctx, `UPDATE scheduled_conversation_messages SET status='failed',error=$2,updated_at=now() WHERE id=$1`, id, err.Error())
		return
	}
	msgID := strings.TrimSpace(fmt.Sprint(out["id"]))
	now := time.Now()
	_, _ = s.db.Exec(ctx, `INSERT INTO messages(conversation_id,message_id,direction,type,body,status,occurred_at) VALUES($1,$2,'out','text',$3,'sent',$4) ON CONFLICT(conversation_id,message_id) DO NOTHING`, conversationID, msgID, body, now)
	_, _ = s.db.Exec(ctx, `UPDATE conversations SET last_message=$1,last_message_at=$2,last_outbound_at=$2,first_response_at=coalesce(first_response_at,$2),updated_at=now() WHERE id=$3`, body, now, conversationID)
	_, _ = s.db.Exec(ctx, `UPDATE scheduled_conversation_messages SET status='sent',sent_message_id=$2,sent_at=$3,error=NULL,updated_at=now() WHERE id=$1`, id, msgID, now)
	s.logConversationEvent(ctx, storeID, conversationID, "", "scheduled_message_sent", map[string]any{"scheduled_id": id, "message_id": msgID})
	s.publishStoreEvent(ctx, storeID, "message", map[string]any{"conversation_id": conversationID, "direction": "out", "type": "text"})
}
