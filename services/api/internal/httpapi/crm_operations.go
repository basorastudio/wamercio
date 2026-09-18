package httpapi

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

func crmSlug(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	v = strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ñ", "n").Replace(v)
	v = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(v, "-")
	v = strings.Trim(v, "-")
	if v == "" {
		return "etapa"
	}
	return v
}

func (s *Server) listCRMStages(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id::text,name,slug,color,sort_order,is_won,is_lost,is_active,created_at,updated_at FROM crm_stages WHERE store_id=$1 ORDER BY sort_order,name`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las etapas")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, slug, color string
		var sort int
		var won, lost, active bool
		var created, updated time.Time
		if rows.Scan(&id, &name, &slug, &color, &sort, &won, &lost, &active, &created, &updated) == nil {
			out = append(out, map[string]any{"id": id, "name": name, "slug": slug, "color": color, "sort_order": sort, "is_won": won, "is_lost": lost, "is_active": active, "created_at": created, "updated_at": updated})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) createCRMStage(w http.ResponseWriter, r *http.Request) {
	var in struct {
		StoreID   string `json:"store_id"`
		Name      string `json:"name"`
		Slug      string `json:"slug"`
		Color     string `json:"color"`
		SortOrder int    `json:"sort_order"`
		IsWon     bool   `json:"is_won"`
		IsLost    bool   `json:"is_lost"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.StoreID) == "" || strings.TrimSpace(in.Name) == "" {
		jsonErr(w, 400, "Datos incompletos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	if in.Slug == "" {
		in.Slug = crmSlug(in.Name)
	}
	if in.Color == "" {
		in.Color = "#D9FDD3"
	}
	var id string
	if err := s.db.QueryRow(r.Context(), `INSERT INTO crm_stages(store_id,name,slug,color,sort_order,is_won,is_lost) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id::text`, in.StoreID, in.Name, in.Slug, in.Color, in.SortOrder, in.IsWon, in.IsLost).Scan(&id); err != nil {
		jsonErr(w, 409, "Ya existe una etapa con ese identificador")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id})
}

func (s *Server) updateCRMStage(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		StoreID   string `json:"store_id"`
		Name      string `json:"name"`
		Slug      string `json:"slug"`
		Color     string `json:"color"`
		SortOrder int    `json:"sort_order"`
		IsWon     bool   `json:"is_won"`
		IsLost    bool   `json:"is_lost"`
		IsActive  bool   `json:"is_active"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	if in.Slug == "" {
		in.Slug = crmSlug(in.Name)
	}
	res, err := s.db.Exec(r.Context(), `UPDATE crm_stages SET name=$1,slug=$2,color=$3,sort_order=$4,is_won=$5,is_lost=$6,is_active=$7,updated_at=now() WHERE id=$8 AND store_id=$9`, in.Name, in.Slug, in.Color, in.SortOrder, in.IsWon, in.IsLost, in.IsActive, id, in.StoreID)
	if err != nil || res.RowsAffected() == 0 {
		jsonErr(w, 404, "Etapa no encontrada")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

type crmOpportunityInput struct {
	StoreID         string     `json:"store_id"`
	StageID         string     `json:"stage_id"`
	CustomerID      string     `json:"customer_id"`
	ConversationID  string     `json:"conversation_id"`
	QuoteID         string     `json:"quote_id"`
	AssignedStaffID string     `json:"assigned_staff_id"`
	Title           string     `json:"title"`
	Value           float64    `json:"value"`
	Probability     int        `json:"probability"`
	Notes           string     `json:"notes"`
	NextActionAt    *time.Time `json:"next_action_at"`
	Status          string     `json:"status"`
}

func (s *Server) listCRMOpportunities(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT o.id::text,o.stage_id::text,st.name,st.slug,st.color,o.title,o.value,o.probability,o.status,o.notes,o.next_action_at,o.closed_at,coalesce(o.customer_id::text,''),coalesce(c.name,''),coalesce(c.phone,''),coalesce(o.conversation_id::text,''),coalesce(o.quote_id::text,''),coalesce(o.assigned_staff_id::text,''),coalesce(sf.name,''),o.created_at,o.updated_at FROM crm_opportunities o JOIN crm_stages st ON st.id=o.stage_id LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN store_staff sf ON sf.id=o.assigned_staff_id WHERE o.store_id=$1 ORDER BY st.sort_order,o.updated_at DESC`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las oportunidades")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, stageID, stageName, stageSlug, color, title, status, notes, customerID, customerName, phone, conversationID, quoteID, staffID, staffName string
		var value float64
		var prob int
		var next, closed *time.Time
		var created, updated time.Time
		if rows.Scan(&id, &stageID, &stageName, &stageSlug, &color, &title, &value, &prob, &status, &notes, &next, &closed, &customerID, &customerName, &phone, &conversationID, &quoteID, &staffID, &staffName, &created, &updated) == nil {
			out = append(out, map[string]any{"id": id, "stage_id": stageID, "stage_name": stageName, "stage_slug": stageSlug, "stage_color": color, "title": title, "value": value, "probability": prob, "status": status, "notes": notes, "next_action_at": next, "closed_at": closed, "customer_id": customerID, "customer_name": customerName, "customer_phone": phone, "conversation_id": conversationID, "quote_id": quoteID, "assigned_staff_id": staffID, "assigned_staff_name": staffName, "created_at": created, "updated_at": updated})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) createCRMOpportunity(w http.ResponseWriter, r *http.Request) {
	var in crmOpportunityInput
	if decode(r, &in) != nil || in.StoreID == "" || in.StageID == "" || strings.TrimSpace(in.Title) == "" {
		jsonErr(w, 400, "Tienda, etapa y título son obligatorios")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	if in.Probability < 0 || in.Probability > 100 {
		in.Probability = 50
	}
	if in.Value < 0 {
		in.Value = 0
	}
	var globalID string
	if in.CustomerID != "" {
		_ = s.db.QueryRow(r.Context(), `SELECT coalesce(global_customer_id::text,'') FROM customers WHERE id=$1 AND store_id=$2`, in.CustomerID, in.StoreID).Scan(&globalID)
	}
	var id string
	err := s.db.QueryRow(r.Context(), `INSERT INTO crm_opportunities(store_id,stage_id,customer_id,global_customer_id,conversation_id,quote_id,assigned_staff_id,title,value,probability,notes,next_action_at) VALUES($1,$2,NULLIF($3,'')::uuid,NULLIF($4,'')::uuid,NULLIF($5,'')::uuid,NULLIF($6,'')::uuid,NULLIF($7,'')::uuid,$8,$9,$10,$11,$12) RETURNING id::text`, in.StoreID, in.StageID, in.CustomerID, globalID, in.ConversationID, in.QuoteID, in.AssignedStaffID, in.Title, in.Value, in.Probability, in.Notes, in.NextActionAt).Scan(&id)
	if err != nil {
		jsonErr(w, 500, "No se pudo crear la oportunidad")
		return
	}
	_, _ = s.db.Exec(r.Context(), `INSERT INTO crm_activity(store_id,opportunity_id,event_type,description,actor_user_id) VALUES($1,$2,'created','Oportunidad creada',$3)`, in.StoreID, id, c.UserID)
	jsonOut(w, 201, map[string]any{"id": id})
}

func (s *Server) updateCRMOpportunity(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in crmOpportunityInput
	if decode(r, &in) != nil || in.StoreID == "" {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	if in.Probability < 0 || in.Probability > 100 {
		in.Probability = 50
	}
	var stageWon, stageLost bool
	if s.db.QueryRow(r.Context(), `SELECT is_won,is_lost FROM crm_stages WHERE id=$1 AND store_id=$2`, in.StageID, in.StoreID).Scan(&stageWon, &stageLost) != nil {
		jsonErr(w, 400, "Etapa inválida")
		return
	}
	status := "open"
	if stageWon {
		status = "won"
	} else if stageLost {
		status = "lost"
	} else if in.Status == "archived" {
		status = "archived"
	}
	res, err := s.db.Exec(r.Context(), `UPDATE crm_opportunities SET stage_id=$1,customer_id=NULLIF($2,'')::uuid,conversation_id=NULLIF($3,'')::uuid,quote_id=NULLIF($4,'')::uuid,assigned_staff_id=NULLIF($5,'')::uuid,title=$6,value=$7,probability=$8,notes=$9,next_action_at=$10,status=$11,closed_at=CASE WHEN $11 IN ('won','lost') THEN coalesce(closed_at,now()) ELSE NULL END,updated_at=now() WHERE id=$12 AND store_id=$13`, in.StageID, in.CustomerID, in.ConversationID, in.QuoteID, in.AssignedStaffID, in.Title, in.Value, in.Probability, in.Notes, in.NextActionAt, status, id, in.StoreID)
	if err != nil || res.RowsAffected() == 0 {
		jsonErr(w, 404, "Oportunidad no encontrada")
		return
	}
	_, _ = s.db.Exec(r.Context(), `INSERT INTO crm_activity(store_id,opportunity_id,event_type,description,actor_user_id,metadata) VALUES($1,$2,'updated','Oportunidad actualizada',$3,jsonb_build_object('stage_id',$4,'status',$5))`, in.StoreID, id, c.UserID, in.StageID, status)
	jsonOut(w, 200, map[string]any{"ok": true, "status": status})
}

func (s *Server) deleteCRMOpportunity(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	storeID := r.URL.Query().Get("store_id")
	c := claims(r)
	if storeID == "" || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	res, _ := s.db.Exec(r.Context(), `UPDATE crm_opportunities SET status='archived',updated_at=now() WHERE id=$1 AND store_id=$2`, id, storeID)
	if res.RowsAffected() == 0 {
		jsonErr(w, 404, "Oportunidad no encontrada")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

type crmTaskInput struct {
	StoreID         string     `json:"store_id"`
	OpportunityID   string     `json:"opportunity_id"`
	ConversationID  string     `json:"conversation_id"`
	CustomerID      string     `json:"customer_id"`
	QuoteID         string     `json:"quote_id"`
	OrderID         string     `json:"order_id"`
	AssignedStaffID string     `json:"assigned_staff_id"`
	Title           string     `json:"title"`
	Description     string     `json:"description"`
	Priority        string     `json:"priority"`
	Status          string     `json:"status"`
	DueAt           *time.Time `json:"due_at"`
}

func (s *Server) listCRMTasks(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT t.id::text,t.title,t.description,t.priority,t.status,t.due_at,t.completed_at,coalesce(t.opportunity_id::text,''),coalesce(t.conversation_id::text,''),coalesce(t.customer_id::text,''),coalesce(c.name,''),coalesce(t.quote_id::text,''),coalesce(t.order_id::text,''),coalesce(t.assigned_staff_id::text,''),coalesce(sf.name,''),t.created_at,t.updated_at FROM crm_tasks t LEFT JOIN customers c ON c.id=t.customer_id LEFT JOIN store_staff sf ON sf.id=t.assigned_staff_id WHERE t.store_id=$1 ORDER BY CASE WHEN t.status='completed' THEN 1 ELSE 0 END,t.due_at NULLS LAST,t.created_at DESC`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las tareas")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, title, description, priority, status, opportunityID, conversationID, customerID, customerName, quoteID, orderID, staffID, staffName string
		var due, completed *time.Time
		var created, updated time.Time
		if rows.Scan(&id, &title, &description, &priority, &status, &due, &completed, &opportunityID, &conversationID, &customerID, &customerName, &quoteID, &orderID, &staffID, &staffName, &created, &updated) == nil {
			out = append(out, map[string]any{"id": id, "title": title, "description": description, "priority": priority, "status": status, "due_at": due, "completed_at": completed, "opportunity_id": opportunityID, "conversation_id": conversationID, "customer_id": customerID, "customer_name": customerName, "quote_id": quoteID, "order_id": orderID, "assigned_staff_id": staffID, "assigned_staff_name": staffName, "created_at": created, "updated_at": updated})
		}
	}
	jsonOut(w, 200, out)
}

func normalizeTaskInput(in *crmTaskInput) {
	if !map[string]bool{"low": true, "normal": true, "high": true, "urgent": true}[in.Priority] {
		in.Priority = "normal"
	}
	if !map[string]bool{"pending": true, "in_progress": true, "completed": true, "cancelled": true}[in.Status] {
		in.Status = "pending"
	}
}
func (s *Server) createCRMTask(w http.ResponseWriter, r *http.Request) {
	var in crmTaskInput
	if decode(r, &in) != nil || in.StoreID == "" || strings.TrimSpace(in.Title) == "" {
		jsonErr(w, 400, "Tienda y título son obligatorios")
		return
	}
	normalizeTaskInput(&in)
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	var id string
	err := s.db.QueryRow(r.Context(), `INSERT INTO crm_tasks(store_id,opportunity_id,conversation_id,customer_id,quote_id,order_id,assigned_staff_id,created_by_user_id,title,description,priority,status,due_at,completed_at) VALUES($1,NULLIF($2,'')::uuid,NULLIF($3,'')::uuid,NULLIF($4,'')::uuid,NULLIF($5,'')::uuid,NULLIF($6,'')::uuid,NULLIF($7,'')::uuid,NULLIF($8,'')::uuid,$9,$10,$11,$12,$13,CASE WHEN $12='completed' THEN now() ELSE NULL END) RETURNING id::text`, in.StoreID, in.OpportunityID, in.ConversationID, in.CustomerID, in.QuoteID, in.OrderID, in.AssignedStaffID, c.UserID, in.Title, in.Description, in.Priority, in.Status, in.DueAt).Scan(&id)
	if err != nil {
		jsonErr(w, 500, "No se pudo crear la tarea")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id})
}
func (s *Server) updateCRMTask(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in crmTaskInput
	if decode(r, &in) != nil || in.StoreID == "" {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	normalizeTaskInput(&in)
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	res, err := s.db.Exec(r.Context(), `UPDATE crm_tasks SET opportunity_id=NULLIF($1,'')::uuid,conversation_id=NULLIF($2,'')::uuid,customer_id=NULLIF($3,'')::uuid,quote_id=NULLIF($4,'')::uuid,order_id=NULLIF($5,'')::uuid,assigned_staff_id=NULLIF($6,'')::uuid,title=$7,description=$8,priority=$9,status=$10,due_at=$11,automation_due_notified_at=CASE WHEN due_at IS DISTINCT FROM $11 OR status IS DISTINCT FROM $10 THEN NULL ELSE automation_due_notified_at END,completed_at=CASE WHEN $10='completed' THEN coalesce(completed_at,now()) ELSE NULL END,updated_at=now() WHERE id=$12 AND store_id=$13`, in.OpportunityID, in.ConversationID, in.CustomerID, in.QuoteID, in.OrderID, in.AssignedStaffID, in.Title, in.Description, in.Priority, in.Status, in.DueAt, id, in.StoreID)
	if err != nil || res.RowsAffected() == 0 {
		jsonErr(w, 404, "Tarea no encontrada")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}
func (s *Server) deleteCRMTask(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	storeID := r.URL.Query().Get("store_id")
	c := claims(r)
	if storeID == "" || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	res, _ := s.db.Exec(r.Context(), `DELETE FROM crm_tasks WHERE id=$1 AND store_id=$2`, id, storeID)
	if res.RowsAffected() == 0 {
		jsonErr(w, 404, "Tarea no encontrada")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

// syncQuoteCRM keeps the commercial pipeline aligned with the quote lifecycle without
// duplicating customer/conversation data. The opportunity remains store-scoped.
func (s *Server) syncQuoteCRM(ctx context.Context, quoteID, stageSlug string) {
	var storeID, customerID, conversationID, assignedStaffID, title, customerName string
	var value float64
	if err := s.db.QueryRow(ctx, `SELECT store_id::text,coalesce(customer_id::text,''),coalesce(conversation_id::text,''),coalesce(assigned_staff_id::text,''),title,customer_name,total FROM quotes WHERE id=$1`, quoteID).Scan(&storeID, &customerID, &conversationID, &assignedStaffID, &title, &customerName, &value); err != nil {
		return
	}
	var stageID string
	var won, lost bool
	if err := s.db.QueryRow(ctx, `SELECT id::text,is_won,is_lost FROM crm_stages WHERE store_id=$1 AND slug=$2 AND is_active=true LIMIT 1`, storeID, stageSlug).Scan(&stageID, &won, &lost); err != nil {
		return
	}
	if strings.TrimSpace(title) == "" {
		title = "Cotización"
	}
	if strings.TrimSpace(customerName) != "" {
		title = title + " · " + customerName
	}
	status := "open"
	if won {
		status = "won"
	} else if lost {
		status = "lost"
	}
	var opportunityID string
	if s.db.QueryRow(ctx, `SELECT id::text FROM crm_opportunities WHERE store_id=$1 AND quote_id=$2 AND status<>'archived' ORDER BY created_at LIMIT 1`, storeID, quoteID).Scan(&opportunityID) == nil {
		_, _ = s.db.Exec(ctx, `UPDATE crm_opportunities SET stage_id=$1,customer_id=NULLIF($2,'')::uuid,conversation_id=NULLIF($3,'')::uuid,assigned_staff_id=NULLIF($4,'')::uuid,title=$5,value=$6,status=$7,closed_at=CASE WHEN $7 IN ('won','lost') THEN coalesce(closed_at,now()) ELSE NULL END,updated_at=now() WHERE id=$8`, stageID, customerID, conversationID, assignedStaffID, title, value, status, opportunityID)
		_, _ = s.db.Exec(ctx, `INSERT INTO crm_activity(store_id,opportunity_id,event_type,description,metadata) VALUES($1,$2,'quote_sync','Cotización sincronizada con el embudo',jsonb_build_object('quote_id',$3,'stage',$4))`, storeID, opportunityID, quoteID, stageSlug)
		return
	}
	if err := s.db.QueryRow(ctx, `INSERT INTO crm_opportunities(store_id,stage_id,customer_id,conversation_id,quote_id,assigned_staff_id,title,value,probability,status,closed_at) VALUES($1,$2,NULLIF($3,'')::uuid,NULLIF($4,'')::uuid,$5,NULLIF($6,'')::uuid,$7,$8,$9,$10,CASE WHEN $10 IN ('won','lost') THEN now() ELSE NULL END) RETURNING id::text`, storeID, stageID, customerID, conversationID, quoteID, assignedStaffID, title, value, 65, status).Scan(&opportunityID); err == nil {
		_, _ = s.db.Exec(ctx, `INSERT INTO crm_activity(store_id,opportunity_id,event_type,description,metadata) VALUES($1,$2,'quote_sync','Oportunidad creada desde cotización',jsonb_build_object('quote_id',$3,'stage',$4))`, storeID, opportunityID, quoteID, stageSlug)
	}
}

// taskDueLoop emits each due task once into the visual automation engine.
func (s *Server) taskDueLoop() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		rows, err := s.db.Query(ctx, `UPDATE crm_tasks SET automation_due_notified_at=now(),updated_at=now() WHERE id IN (SELECT id FROM crm_tasks WHERE status IN ('pending','in_progress') AND due_at IS NOT NULL AND due_at<=now() AND automation_due_notified_at IS NULL ORDER BY due_at LIMIT 100 FOR UPDATE SKIP LOCKED) RETURNING id::text,store_id::text,coalesce(conversation_id::text,''),title,priority`)
		if err != nil {
			cancel()
			continue
		}
		type dueTask struct{ id, storeID, conversationID, title, priority string }
		list := []dueTask{}
		for rows.Next() {
			var x dueTask
			if rows.Scan(&x.id, &x.storeID, &x.conversationID, &x.title, &x.priority) == nil {
				list = append(list, x)
			}
		}
		rows.Close()
		cancel()
		for _, x := range list {
			go s.triggerVisualFlows(context.Background(), x.storeID, "task_due", x.id, x.conversationID, map[string]string{"task_id": x.id, "task_title": x.title, "priority": x.priority})
		}
	}
}
