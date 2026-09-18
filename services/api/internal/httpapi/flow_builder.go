package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

type flowNodeInput struct {
	Key       string         `json:"key"`
	Type      string         `json:"type"`
	Label     string         `json:"label"`
	PositionX int            `json:"position_x"`
	PositionY int            `json:"position_y"`
	Config    map[string]any `json:"config"`
}
type flowEdgeInput struct {
	Source    string `json:"source"`
	Target    string `json:"target"`
	Branch    string `json:"branch"`
	SortOrder int    `json:"sort_order"`
}
type flowInput struct {
	StoreID       string          `json:"store_id"`
	Name          string          `json:"name"`
	Description   string          `json:"description"`
	TriggerType   string          `json:"trigger_type"`
	TriggerConfig map[string]any  `json:"trigger_config"`
	IsActive      bool            `json:"is_active"`
	Nodes         []flowNodeInput `json:"nodes"`
	Edges         []flowEdgeInput `json:"edges"`
}

type flowRuntimeNode struct {
	Key    string
	Type   string
	Label  string
	Config map[string]any
}

type flowRuntimeEdge struct {
	Target string
	Branch string
	Sort   int
}

var flowTypes = map[string]bool{"trigger": true, "condition_contains": true, "send_message": true, "add_tag": true, "assign_queue": true, "create_task": true, "delay": true, "set_priority": true, "end": true}
var flowTriggers = map[string]bool{"manual": true, "message_received": true, "keyword": true, "quote_sent": true, "quote_approved": true, "order_created": true, "order_status": true, "task_due": true}

func (s *Server) listFlows(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT f.id::text,f.name,f.description,f.trigger_type,f.trigger_config,f.is_active,f.version,f.created_at,f.updated_at,count(DISTINCT n.id)::int,count(DISTINCT e.id)::int FROM automation_flows f LEFT JOIN automation_flow_nodes n ON n.flow_id=f.id LEFT JOIN automation_flow_edges e ON e.flow_id=f.id WHERE f.store_id=$1 GROUP BY f.id ORDER BY f.updated_at DESC`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los flujos")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, description, trigger string
		var config []byte
		var active bool
		var version, nodeCount, edgeCount int
		var created, updated time.Time
		if rows.Scan(&id, &name, &description, &trigger, &config, &active, &version, &created, &updated, &nodeCount, &edgeCount) == nil {
			var cfg any = map[string]any{}
			_ = json.Unmarshal(config, &cfg)
			out = append(out, map[string]any{"id": id, "name": name, "description": description, "trigger_type": trigger, "trigger_config": cfg, "is_active": active, "version": version, "node_count": nodeCount, "edge_count": edgeCount, "created_at": created, "updated_at": updated})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) flowDetail(ctx context.Context, id string) (map[string]any, error) {
	var storeID, name, description, trigger string
	var config []byte
	var active bool
	var version int
	var created, updated time.Time
	if err := s.db.QueryRow(ctx, `SELECT store_id::text,name,description,trigger_type,trigger_config,is_active,version,created_at,updated_at FROM automation_flows WHERE id=$1`, id).Scan(&storeID, &name, &description, &trigger, &config, &active, &version, &created, &updated); err != nil {
		return nil, err
	}
	var triggerCfg any = map[string]any{}
	_ = json.Unmarshal(config, &triggerCfg)
	nodes := []map[string]any{}
	if rows, err := s.db.Query(ctx, `SELECT node_key,node_type,label,position_x,position_y,config FROM automation_flow_nodes WHERE flow_id=$1 ORDER BY created_at`, id); err == nil {
		for rows.Next() {
			var key, typ, label string
			var x, y int
			var raw []byte
			if rows.Scan(&key, &typ, &label, &x, &y, &raw) == nil {
				var cfg any = map[string]any{}
				_ = json.Unmarshal(raw, &cfg)
				nodes = append(nodes, map[string]any{"key": key, "type": typ, "label": label, "position_x": x, "position_y": y, "config": cfg})
			}
		}
		rows.Close()
	}
	edges := []map[string]any{}
	if rows, err := s.db.Query(ctx, `SELECT source_key,target_key,branch,sort_order FROM automation_flow_edges WHERE flow_id=$1 ORDER BY source_key,sort_order`, id); err == nil {
		for rows.Next() {
			var source, target, branch string
			var sort int
			if rows.Scan(&source, &target, &branch, &sort) == nil {
				edges = append(edges, map[string]any{"source": source, "target": target, "branch": branch, "sort_order": sort})
			}
		}
		rows.Close()
	}
	return map[string]any{"id": id, "store_id": storeID, "name": name, "description": description, "trigger_type": trigger, "trigger_config": triggerCfg, "is_active": active, "version": version, "nodes": nodes, "edges": edges, "created_at": created, "updated_at": updated}, nil
}

func (s *Server) getFlow(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	f, err := s.flowDetail(r.Context(), id)
	if err != nil {
		jsonErr(w, 404, "Flujo no encontrado")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, str(f["store_id"])) {
		jsonErr(w, 404, "Flujo no encontrado")
		return
	}
	jsonOut(w, 200, f)
}

func normalizeFlowInput(in *flowInput) error {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return fmt.Errorf("el nombre es obligatorio")
	}
	if !flowTriggers[in.TriggerType] {
		in.TriggerType = "manual"
	}
	if in.TriggerConfig == nil {
		in.TriggerConfig = map[string]any{}
	}
	keys := map[string]bool{}
	for i := range in.Nodes {
		n := &in.Nodes[i]
		n.Key = strings.TrimSpace(n.Key)
		if n.Key == "" {
			n.Key = fmt.Sprintf("node_%d", i+1)
		}
		if keys[n.Key] {
			return fmt.Errorf("hay nodos con identificadores repetidos")
		}
		keys[n.Key] = true
		if !flowTypes[n.Type] {
			return fmt.Errorf("tipo de nodo no soportado: %s", n.Type)
		}
		if n.Config == nil {
			n.Config = map[string]any{}
		}
	}
	for i := range in.Edges {
		e := &in.Edges[i]
		if !keys[e.Source] || !keys[e.Target] {
			return fmt.Errorf("una conexión apunta a un nodo inexistente")
		}
		if e.Branch != "true" && e.Branch != "false" {
			e.Branch = "default"
		}
	}
	return nil
}

func (s *Server) saveFlowGraph(ctx context.Context, tx pgx.Tx, flowID string, nodes []flowNodeInput, edges []flowEdgeInput) error {
	if _, err := tx.Exec(ctx, `DELETE FROM automation_flow_edges WHERE flow_id=$1`, flowID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM automation_flow_nodes WHERE flow_id=$1`, flowID); err != nil {
		return err
	}
	for _, n := range nodes {
		raw, _ := json.Marshal(n.Config)
		if _, err := tx.Exec(ctx, `INSERT INTO automation_flow_nodes(flow_id,node_key,node_type,label,position_x,position_y,config) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`, flowID, n.Key, n.Type, n.Label, n.PositionX, n.PositionY, string(raw)); err != nil {
			return err
		}
	}
	for _, e := range edges {
		if _, err := tx.Exec(ctx, `INSERT INTO automation_flow_edges(flow_id,source_key,target_key,branch,sort_order) VALUES($1,$2,$3,$4,$5)`, flowID, e.Source, e.Target, e.Branch, e.SortOrder); err != nil {
			return err
		}
	}
	return nil
}

func defaultFlowGraph() ([]flowNodeInput, []flowEdgeInput) {
	return []flowNodeInput{{Key: "inicio", Type: "trigger", Label: "Inicio", PositionX: 80, PositionY: 120, Config: map[string]any{}}, {Key: "fin", Type: "end", Label: "Fin", PositionX: 440, PositionY: 120, Config: map[string]any{}}}, []flowEdgeInput{{Source: "inicio", Target: "fin", Branch: "default"}}
}

func (s *Server) createFlow(w http.ResponseWriter, r *http.Request) {
	var in flowInput
	if decode(r, &in) != nil || in.StoreID == "" {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	if len(in.Nodes) == 0 {
		in.Nodes, in.Edges = defaultFlowGraph()
	}
	if err := normalizeFlowInput(&in); err != nil {
		jsonErr(w, 400, err.Error())
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo crear el flujo")
		return
	}
	defer tx.Rollback(r.Context())
	cfg, _ := json.Marshal(in.TriggerConfig)
	var id string
	if err = tx.QueryRow(r.Context(), `INSERT INTO automation_flows(store_id,name,description,trigger_type,trigger_config,is_active) VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING id::text`, in.StoreID, in.Name, in.Description, in.TriggerType, string(cfg), in.IsActive).Scan(&id); err != nil {
		jsonErr(w, 500, "No se pudo crear el flujo")
		return
	}
	if err = s.saveFlowGraph(r.Context(), tx, id, in.Nodes, in.Edges); err != nil {
		jsonErr(w, 400, err.Error())
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar el flujo")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id})
}

func (s *Server) updateFlow(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c := claims(r)
	var storeID string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM automation_flows WHERE id=$1`, id).Scan(&storeID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Flujo no encontrado")
		return
	}
	var in flowInput
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	in.StoreID = storeID
	if len(in.Nodes) == 0 {
		jsonErr(w, 400, "El flujo debe contener nodos")
		return
	}
	if err := normalizeFlowInput(&in); err != nil {
		jsonErr(w, 400, err.Error())
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar el flujo")
		return
	}
	defer tx.Rollback(r.Context())
	cfg, _ := json.Marshal(in.TriggerConfig)
	if _, err = tx.Exec(r.Context(), `UPDATE automation_flows SET name=$1,description=$2,trigger_type=$3,trigger_config=$4::jsonb,is_active=$5,version=version+1,updated_at=now() WHERE id=$6`, in.Name, in.Description, in.TriggerType, string(cfg), in.IsActive, id); err != nil {
		jsonErr(w, 500, "No se pudo actualizar el flujo")
		return
	}
	if err = s.saveFlowGraph(r.Context(), tx, id, in.Nodes, in.Edges); err != nil {
		jsonErr(w, 400, err.Error())
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar el flujo")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) deleteFlow(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c := claims(r)
	var storeID string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM automation_flows WHERE id=$1`, id).Scan(&storeID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Flujo no encontrado")
		return
	}
	_, _ = s.db.Exec(r.Context(), `DELETE FROM automation_flows WHERE id=$1`, id)
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) testFlow(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c := claims(r)
	var storeID string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM automation_flows WHERE id=$1`, id).Scan(&storeID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Flujo no encontrado")
		return
	}
	var in struct {
		ConversationID string         `json:"conversation_id"`
		Message        string         `json:"message"`
		Context        map[string]any `json:"context"`
	}
	_ = decode(r, &in)
	if in.Context == nil {
		in.Context = map[string]any{}
	}
	if in.Message != "" {
		in.Context["message"] = in.Message
	}
	in.Context["test"] = true
	runID, err := s.startFlowRun(r.Context(), id, storeID, "manual", "test", in.ConversationID, in.Context)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	jsonOut(w, 200, map[string]any{"ok": true, "run_id": runID})
}

func (s *Server) listFlowRuns(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT r.id::text,coalesce(f.name,'Flujo eliminado'),r.trigger_type,r.entity_id,coalesce(r.conversation_id::text,''),r.status,r.context,r.current_node_key,coalesce(r.error,''),r.started_at,r.completed_at FROM automation_flow_runs r LEFT JOIN automation_flows f ON f.id=r.flow_id WHERE r.store_id=$1 ORDER BY r.started_at DESC LIMIT 150`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudo cargar el historial")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, trigger, entityID, conversationID, status, current, runError string
		var raw []byte
		var started time.Time
		var completed *time.Time
		if rows.Scan(&id, &name, &trigger, &entityID, &conversationID, &status, &raw, &current, &runError, &started, &completed) == nil {
			var ctx any = map[string]any{}
			_ = json.Unmarshal(raw, &ctx)
			out = append(out, map[string]any{"id": id, "flow_name": name, "trigger_type": trigger, "entity_id": entityID, "conversation_id": conversationID, "status": status, "context": ctx, "current_node_key": current, "error": runError, "started_at": started, "completed_at": completed})
		}
	}
	jsonOut(w, 200, out)
}

func flowString(v any) string {
	switch x := v.(type) {
	case string:
		return strings.TrimSpace(x)
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case int:
		return strconv.Itoa(x)
	case bool:
		if x {
			return "true"
		}
		return "false"
	default:
		return strings.TrimSpace(fmt.Sprint(v))
	}
}

func renderFlowText(template string, ctx map[string]any) string {
	values := map[string]string{}
	for k, v := range ctx {
		values[k] = flowString(v)
	}
	return renderAutomationTemplate(template, values)
}

func (s *Server) triggerVisualFlows(ctx context.Context, storeID, trigger, entityID, conversationID string, input map[string]string) {
	data := map[string]any{}
	for k, v := range input {
		data[k] = v
	}
	if conversationID != "" {
		data["conversation_id"] = conversationID
	}
	if entityID != "" {
		data["entity_id"] = entityID
	}
	if storeID == "" || !flowTriggers[trigger] {
		return
	}
	if data == nil {
		data = map[string]any{}
	}
	rows, err := s.db.Query(ctx, `SELECT id::text,trigger_config FROM automation_flows WHERE store_id=$1 AND trigger_type=$2 AND is_active=true ORDER BY created_at`, storeID, trigger)
	if err != nil {
		return
	}
	type candidate struct {
		id     string
		config []byte
	}
	items := []candidate{}
	for rows.Next() {
		var x candidate
		if rows.Scan(&x.id, &x.config) == nil {
			items = append(items, x)
		}
	}
	rows.Close()
	for _, item := range items {
		if trigger == "keyword" {
			var cfg map[string]any
			_ = json.Unmarshal(item.config, &cfg)
			message := strings.ToLower(flowString(data["message"]))
			keyword := strings.ToLower(flowString(cfg["keyword"]))
			if keyword == "" {
				keyword = strings.ToLower(flowString(cfg["value"]))
			}
			if keyword != "" && !strings.Contains(message, keyword) {
				continue
			}
		}
		conversationID := flowString(data["conversation_id"])
		entityID := flowString(data["entity_id"])
		if entityID == "" {
			entityID = conversationID
		}
		_, _ = s.startFlowRun(context.Background(), item.id, storeID, trigger, entityID, conversationID, data)
	}
}

func (s *Server) startFlowRun(ctx context.Context, flowID, storeID, trigger, entityID, conversationID string, data map[string]any) (string, error) {
	raw, _ := json.Marshal(data)
	var conv any
	if conversationID != "" {
		conv = conversationID
	}
	var runID string
	if err := s.db.QueryRow(ctx, `INSERT INTO automation_flow_runs(flow_id,store_id,trigger_type,entity_id,conversation_id,context,status) VALUES($1,$2,$3,$4,$5,$6::jsonb,'running') RETURNING id::text`, flowID, storeID, trigger, entityID, conv, string(raw)).Scan(&runID); err != nil {
		return "", err
	}
	go s.executeVisualFlow(runID)
	return runID, nil
}

func (s *Server) loadRuntimeFlow(ctx context.Context, flowID string) (map[string]flowRuntimeNode, map[string][]flowRuntimeEdge, string, error) {
	nodes := map[string]flowRuntimeNode{}
	rows, err := s.db.Query(ctx, `SELECT node_key,node_type,label,config FROM automation_flow_nodes WHERE flow_id=$1`, flowID)
	if err != nil {
		return nil, nil, "", err
	}
	for rows.Next() {
		var key, typ, label string
		var raw []byte
		if rows.Scan(&key, &typ, &label, &raw) == nil {
			cfg := map[string]any{}
			_ = json.Unmarshal(raw, &cfg)
			nodes[key] = flowRuntimeNode{Key: key, Type: typ, Label: label, Config: cfg}
		}
	}
	rows.Close()
	edges := map[string][]flowRuntimeEdge{}
	erows, err := s.db.Query(ctx, `SELECT source_key,target_key,branch,sort_order FROM automation_flow_edges WHERE flow_id=$1 ORDER BY source_key,sort_order`, flowID)
	if err != nil {
		return nil, nil, "", err
	}
	for erows.Next() {
		var source, target, branch string
		var sort int
		if erows.Scan(&source, &target, &branch, &sort) == nil {
			edges[source] = append(edges[source], flowRuntimeEdge{Target: target, Branch: branch, Sort: sort})
		}
	}
	erows.Close()
	start := ""
	for key, node := range nodes {
		if node.Type == "trigger" {
			start = key
			break
		}
	}
	if start == "" {
		return nodes, edges, "", fmt.Errorf("el flujo no tiene nodo de inicio")
	}
	return nodes, edges, start, nil
}

func nextFlowNode(edges []flowRuntimeEdge, branch string) string {
	for _, e := range edges {
		if e.Branch == branch {
			return e.Target
		}
	}
	for _, e := range edges {
		if e.Branch == "default" {
			return e.Target
		}
	}
	if len(edges) > 0 {
		return edges[0].Target
	}
	return ""
}

func (s *Server) executeVisualFlow(runID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	var flowID, storeID, conversationID string
	var raw []byte
	if err := s.db.QueryRow(ctx, `SELECT coalesce(flow_id::text,''),store_id::text,coalesce(conversation_id::text,''),context FROM automation_flow_runs WHERE id=$1`, runID).Scan(&flowID, &storeID, &conversationID, &raw); err != nil {
		return
	}
	data := map[string]any{}
	_ = json.Unmarshal(raw, &data)
	if conversationID != "" {
		data["conversation_id"] = conversationID
		var phone, customerName string
		_ = s.db.QueryRow(ctx, `SELECT coalesce(whatsapp_phone,''),coalesce(display_name,'') FROM conversations WHERE id=$1`, conversationID).Scan(&phone, &customerName)
		if flowString(data["phone"]) == "" {
			data["phone"] = normalizePhone(phone)
		}
		if flowString(data["cliente"]) == "" {
			data["cliente"] = customerName
		}
	}
	var storeName string
	_ = s.db.QueryRow(ctx, `SELECT name FROM stores WHERE id=$1`, storeID).Scan(&storeName)
	data["negocio"] = storeName
	nodes, edges, current, err := s.loadRuntimeFlow(ctx, flowID)
	if err != nil {
		s.failFlowRun(runID, "", err)
		return
	}
	for step := 0; step < 50 && current != ""; step++ {
		node, ok := nodes[current]
		if !ok {
			s.failFlowRun(runID, current, fmt.Errorf("nodo %s no existe", current))
			return
		}
		_, _ = s.db.Exec(ctx, `UPDATE automation_flow_runs SET current_node_key=$1,updated_at=now() WHERE id=$2`, current, runID)
		output, branch, wait, execErr := s.executeFlowNode(ctx, storeID, conversationID, node, data)
		outRaw, _ := json.Marshal(output)
		status := "done"
		errText := ""
		if execErr != nil {
			status = "failed"
			errText = execErr.Error()
		}
		_, _ = s.db.Exec(ctx, `INSERT INTO automation_flow_steps(run_id,node_key,node_type,status,output,error) VALUES($1,$2,$3,$4,$5::jsonb,nullif($6,''))`, runID, node.Key, node.Type, status, string(outRaw), errText)
		if execErr != nil {
			s.failFlowRun(runID, current, execErr)
			return
		}
		for k, v := range output {
			data[k] = v
		}
		if node.Type == "end" {
			finalRaw, _ := json.Marshal(data)
			_, _ = s.db.Exec(ctx, `UPDATE automation_flow_runs SET status='completed',context=$1::jsonb,current_node_key=$2,completed_at=now(),updated_at=now() WHERE id=$3`, string(finalRaw), current, runID)
			return
		}
		next := nextFlowNode(edges[current], branch)
		if wait {
			finalRaw, _ := json.Marshal(data)
			_, _ = s.db.Exec(ctx, `UPDATE automation_flow_runs SET status='waiting',context=$1::jsonb,current_node_key=$2,updated_at=now() WHERE id=$3`, string(finalRaw), current, runID)
			return
		}
		current = next
	}
	if current == "" {
		finalRaw, _ := json.Marshal(data)
		_, _ = s.db.Exec(ctx, `UPDATE automation_flow_runs SET status='completed',context=$1::jsonb,completed_at=now(),updated_at=now() WHERE id=$2`, string(finalRaw), runID)
		return
	}
	s.failFlowRun(runID, current, fmt.Errorf("el flujo superó el límite de 50 pasos"))
}

func (s *Server) failFlowRun(runID, current string, err error) {
	_, _ = s.db.Exec(context.Background(), `UPDATE automation_flow_runs SET status='failed',current_node_key=$1,error=$2,completed_at=now(),updated_at=now() WHERE id=$3`, current, err.Error(), runID)
}

func (s *Server) executeFlowNode(ctx context.Context, storeID, conversationID string, node flowRuntimeNode, data map[string]any) (map[string]any, string, bool, error) {
	out := map[string]any{}
	switch node.Type {
	case "trigger", "end":
		return out, "default", false, nil
	case "condition_contains":
		sourceKey := flowString(node.Config["source"])
		if sourceKey == "" {
			sourceKey = "message"
		}
		needle := strings.ToLower(flowString(node.Config["value"]))
		haystack := strings.ToLower(flowString(data[sourceKey]))
		if needle != "" && strings.Contains(haystack, needle) {
			return out, "true", false, nil
		}
		return out, "false", false, nil
	case "send_message":
		body := renderFlowText(flowString(node.Config["body"]), data)
		if body == "" {
			return out, "default", false, fmt.Errorf("el nodo de mensaje no tiene contenido")
		}
		destination := normalizePhone(flowString(data["phone"]))
		if destination == "" {
			destination = normalizePhone(flowString(data["telefono"]))
		}
		if destination == "" && conversationID != "" {
			_ = s.db.QueryRow(ctx, `SELECT coalesce(whatsapp_phone,'') FROM conversations WHERE id=$1`, conversationID).Scan(&destination)
			destination = normalizePhone(destination)
		}
		if destination == "" {
			return out, "default", false, fmt.Errorf("no se pudo resolver el WhatsApp del contacto")
		}
		if err := s.queueWhatsApp(ctx, storeID, conversationID, destination, body, "flow"); err != nil {
			return out, "default", false, err
		}
		out["last_message"] = body
		return out, "default", false, nil
	case "add_tag":
		if conversationID == "" {
			return out, "default", false, fmt.Errorf("la acción requiere una conversación")
		}
		tagID := flowString(node.Config["tag_id"])
		tagName := strings.TrimSpace(flowString(node.Config["tag_name"]))
		if tagID == "" && tagName != "" {
			_ = s.db.QueryRow(ctx, `INSERT INTO conversation_tags(store_id,name) VALUES($1,$2) ON CONFLICT(store_id,name) DO UPDATE SET is_active=true RETURNING id::text`, storeID, tagName).Scan(&tagID)
		}
		if tagID == "" {
			return out, "default", false, fmt.Errorf("selecciona una etiqueta")
		}
		_, err := s.db.Exec(ctx, `INSERT INTO conversation_tag_links(conversation_id,tag_id) SELECT $1,id FROM conversation_tags WHERE id=$2 AND store_id=$3 ON CONFLICT DO NOTHING`, conversationID, tagID, storeID)
		return out, "default", false, err
	case "assign_queue":
		if conversationID == "" {
			return out, "default", false, fmt.Errorf("la acción requiere una conversación")
		}
		queueID := flowString(node.Config["queue_id"])
		if queueID == "" {
			name := strings.TrimSpace(flowString(node.Config["queue_name"]))
			if name != "" {
				_ = s.db.QueryRow(ctx, `SELECT id::text FROM conversation_queues WHERE store_id=$1 AND lower(name)=lower($2) AND is_active=true LIMIT 1`, storeID, name).Scan(&queueID)
			}
		}
		if queueID == "" {
			return out, "default", false, fmt.Errorf("selecciona una cola")
		}
		if _, err := s.db.Exec(ctx, `UPDATE conversations SET queue_id=$1,assignment_updated_at=now() WHERE id=$2 AND store_id=$3`, queueID, conversationID, storeID); err != nil {
			return out, "default", false, err
		}
		go s.maybeAutoAssignIncomingConversation(context.Background(), storeID, conversationID)
		return out, "default", false, nil
	case "create_task":
		title := renderFlowText(flowString(node.Config["title"]), data)
		if title == "" {
			title = "Seguimiento desde automatización"
		}
		desc := renderFlowText(flowString(node.Config["description"]), data)
		minutes := 60
		if v := flowString(node.Config["due_minutes"]); v != "" {
			if n, e := strconv.Atoi(v); e == nil && n >= 0 {
				minutes = n
			}
		}
		priority := normalizeConversationPriority(flowString(node.Config["priority"]))
		var conv any
		if conversationID != "" {
			conv = conversationID
		}
		_, err := s.db.Exec(ctx, `INSERT INTO crm_tasks(store_id,conversation_id,title,description,priority,due_at) VALUES($1,$2,$3,$4,$5,now()+($6::text||' minutes')::interval)`, storeID, conv, title, desc, priority, minutes)
		return out, "default", false, err
	case "delay":
		if conversationID == "" {
			return out, "default", false, fmt.Errorf("el retraso requiere una conversación")
		}
		body := renderFlowText(flowString(node.Config["body"]), data)
		minutes := 60
		if v := flowString(node.Config["minutes"]); v != "" {
			if n, e := strconv.Atoi(v); e == nil && n > 0 {
				minutes = n
			}
		}
		if body == "" {
			return out, "default", false, fmt.Errorf("para un retraso persistente indica el mensaje que se enviará")
		}
		_, err := s.db.Exec(ctx, `INSERT INTO scheduled_conversation_messages(store_id,conversation_id,body,scheduled_for,cancel_on_reply,status) VALUES($1,$2,$3,now()+($4::text||' minutes')::interval,$5,'pending')`, storeID, conversationID, body, minutes, true)
		return out, "default", false, err
	case "set_priority":
		if conversationID == "" {
			return out, "default", false, fmt.Errorf("la acción requiere una conversación")
		}
		p := normalizeConversationPriority(flowString(node.Config["priority"]))
		_, err := s.db.Exec(ctx, `UPDATE conversations SET priority=$1 WHERE id=$2 AND store_id=$3`, p, conversationID, storeID)
		return out, "default", false, err
	}
	return out, "default", false, fmt.Errorf("tipo de nodo no soportado: %s", node.Type)
}
