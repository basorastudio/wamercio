package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

const (
	automationPromotionStarted    = "promotion_started"
	automationReservationCreated  = "reservation_created"
	automationReservationReminder = "reservation_reminder"
	automationOrderConfirmed      = "order_confirmed"
	automationOrderReady          = "order_ready"
	automationOrderCompleted      = "order_completed"
	automationReviewRequest       = "review_request"
)

var automationEvents = map[string]bool{
	automationPromotionStarted:    true,
	automationReservationCreated:  true,
	automationReservationReminder: true,
	automationOrderConfirmed:      true,
	automationOrderReady:          true,
	automationOrderCompleted:      true,
	automationReviewRequest:       true,
}

type automationRuleInput struct {
	StoreID      string `json:"store_id"`
	Name         string `json:"name"`
	Event        string `json:"event"`
	Audience     string `json:"audience"`
	TemplateText string `json:"template_text"`
	DelayMinutes int    `json:"delay_minutes"`
	IsActive     *bool  `json:"is_active"`
}

func normalizeAutomationInput(in *automationRuleInput) error {
	in.StoreID = strings.TrimSpace(in.StoreID)
	in.Name = strings.TrimSpace(in.Name)
	in.Event = strings.ToLower(strings.TrimSpace(in.Event))
	in.Audience = strings.ToLower(strings.TrimSpace(in.Audience))
	in.TemplateText = strings.TrimSpace(in.TemplateText)
	if in.StoreID == "" || in.Name == "" || in.TemplateText == "" {
		return fmt.Errorf("Completa negocio, nombre y mensaje")
	}
	if !automationEvents[in.Event] {
		return fmt.Errorf("Evento de automatización inválido")
	}
	if in.Audience == "" {
		in.Audience = "event_customer"
	}
	if in.Audience != "event_customer" && in.Audience != "all_customers" {
		return fmt.Errorf("Audiencia inválida")
	}
	if in.DelayMinutes < 0 || in.DelayMinutes > 43200 {
		return fmt.Errorf("El retraso debe estar entre 0 y 43200 minutos")
	}
	return nil
}

func (s *Server) listAutomationRules(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id::text,name,event,audience,template_text,delay_minutes,is_active,created_at,updated_at FROM automation_rules WHERE store_id=$1 ORDER BY created_at DESC`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las automatizaciones")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, event, audience, templateText string
		var delay int
		var active bool
		var created, updated time.Time
		if rows.Scan(&id, &name, &event, &audience, &templateText, &delay, &active, &created, &updated) == nil {
			out = append(out, map[string]any{"id": id, "name": name, "event": event, "audience": audience, "template_text": templateText, "delay_minutes": delay, "is_active": active, "created_at": created, "updated_at": updated})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) createAutomationRule(w http.ResponseWriter, r *http.Request) {
	var in automationRuleInput
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	if err := normalizeAutomationInput(&in); err != nil {
		jsonErr(w, 400, err.Error())
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	active := true
	if in.IsActive != nil {
		active = *in.IsActive
	}
	var id string
	if err := s.db.QueryRow(r.Context(), `INSERT INTO automation_rules(store_id,name,event,audience,template_text,delay_minutes,is_active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id::text`, in.StoreID, in.Name, in.Event, in.Audience, in.TemplateText, in.DelayMinutes, active).Scan(&id); err != nil {
		jsonErr(w, 500, "No se pudo crear la automatización")
		return
	}
	jsonOut(w, 201, map[string]string{"id": id})
}

func (s *Server) updateAutomationRule(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in automationRuleInput
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	if err := normalizeAutomationInput(&in); err != nil {
		jsonErr(w, 400, err.Error())
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	active := true
	if in.IsActive != nil {
		active = *in.IsActive
	}
	res, err := s.db.Exec(r.Context(), `UPDATE automation_rules SET name=$1,event=$2,audience=$3,template_text=$4,delay_minutes=$5,is_active=$6,updated_at=now() WHERE id=$7 AND store_id=$8`, in.Name, in.Event, in.Audience, in.TemplateText, in.DelayMinutes, active, id, in.StoreID)
	if err != nil || res.RowsAffected() == 0 {
		jsonErr(w, 404, "Automatización no encontrada")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) deleteAutomationRule(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c := claims(r)
	var storeID string
	if s.db.QueryRow(r.Context(), `SELECT store_id::text FROM automation_rules WHERE id=$1`, id).Scan(&storeID) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Automatización no encontrada")
		return
	}
	_, _ = s.db.Exec(r.Context(), `DELETE FROM automation_rules WHERE id=$1`, id)
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) listAutomationRuns(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT ar.id::text,coalesce(r.name,'Regla eliminada'),ar.event,coalesce(ar.entity_id,''),coalesce(ar.destination,''),ar.rendered_text,ar.status,coalesce(ar.error,''),ar.scheduled_for,ar.created_at FROM automation_runs ar LEFT JOIN automation_rules r ON r.id=ar.rule_id WHERE ar.store_id=$1 ORDER BY ar.created_at DESC LIMIT 100`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudo cargar el historial")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, ruleName, event, entityID, destination, text, status, runError string
		var scheduled, created time.Time
		if rows.Scan(&id, &ruleName, &event, &entityID, &destination, &text, &status, &runError, &scheduled, &created) == nil {
			out = append(out, map[string]any{"id": id, "rule_name": ruleName, "event": event, "entity_id": entityID, "destination": destination, "rendered_text": text, "status": status, "error": runError, "scheduled_for": scheduled, "created_at": created})
		}
	}
	jsonOut(w, 200, out)
}

func renderAutomationTemplate(template string, values map[string]string) string {
	out := template
	for key, value := range values {
		out = strings.ReplaceAll(out, "{"+key+"}", value)
	}
	return strings.TrimSpace(out)
}

func (s *Server) triggerAutomationEvent(ctx context.Context, storeID, event string, data map[string]string) {
	storeID = strings.TrimSpace(storeID)
	event = strings.TrimSpace(event)
	if storeID == "" || !automationEvents[event] {
		return
	}
	if data == nil {
		data = map[string]string{}
	}
	if strings.TrimSpace(data["negocio"]) == "" {
		var storeName string
		if s.db.QueryRow(ctx, `SELECT name FROM stores WHERE id=$1`, storeID).Scan(&storeName) == nil {
			data["negocio"] = storeName
		}
	}
	rows, err := s.db.Query(ctx, `SELECT id::text,audience,template_text,delay_minutes FROM automation_rules WHERE store_id=$1 AND event=$2 AND is_active=true ORDER BY created_at`, storeID, event)
	if err != nil {
		return
	}
	type rule struct {
		id, audience, template string
		delay                  int
	}
	rules := []rule{}
	for rows.Next() {
		var r rule
		if rows.Scan(&r.id, &r.audience, &r.template, &r.delay) == nil {
			rules = append(rules, r)
		}
	}
	rows.Close()
	entityID := strings.TrimSpace(data["entity_id"])
	for _, rule := range rules {
		destinations := []string{}
		if rule.audience == "all_customers" {
			customerRows, qerr := s.db.Query(ctx, `SELECT DISTINCT regexp_replace(phone,'[^0-9]','','g') FROM customers WHERE store_id=$1 AND status='active' AND coalesce(phone,'')<>'' AND EXISTS(SELECT 1 FROM orders o WHERE o.customer_id=customers.id AND o.status<>'canceled' AND o.flow_type<>'quote') ORDER BY 1`, storeID)
			if qerr == nil {
				for customerRows.Next() {
					var phone string
					if customerRows.Scan(&phone) == nil && phone != "" {
						destinations = append(destinations, phone)
					}
				}
				customerRows.Close()
			}
		} else if phone := normalizePhone(data["telefono"]); phone != "" {
			destinations = append(destinations, phone)
		}
		if len(destinations) == 0 {
			dedupe := fmt.Sprintf("%s:%s:%s:none", rule.id, event, entityID)
			_, _ = s.db.Exec(ctx, `INSERT INTO automation_runs(rule_id,store_id,event,entity_id,status,error,dedupe_key,rendered_text) VALUES($1,$2,$3,nullif($4,''),'skipped','Sin destinatario disponible',$5,$6) ON CONFLICT(dedupe_key) DO NOTHING`, rule.id, storeID, event, entityID, dedupe, renderAutomationTemplate(rule.template, data))
			continue
		}
		for _, destination := range destinations {
			values := map[string]string{}
			for k, v := range data {
				values[k] = v
			}
			values["telefono"] = destination
			text := renderAutomationTemplate(rule.template, values)
			if text == "" {
				continue
			}
			dedupe := fmt.Sprintf("%s:%s:%s:%s", rule.id, event, entityID, destination)
			var runID string
			err := s.db.QueryRow(ctx, `INSERT INTO automation_runs(rule_id,store_id,event,entity_id,destination,rendered_text,status,dedupe_key,scheduled_for) VALUES($1,$2,$3,nullif($4,''),$5,$6,'queued',$7,now()+($8 * interval '1 minute')) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id::text`, rule.id, storeID, event, entityID, destination, text, dedupe, rule.delay).Scan(&runID)
			if err == nil && rule.delay == 0 {
				go s.dispatchAutomationRun(runID)
			}
		}
	}
}

func (s *Server) dispatchAutomationRun(id string) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	var storeID, destination, text string
	if s.db.QueryRow(ctx, `SELECT store_id::text,coalesce(destination,''),rendered_text FROM automation_runs WHERE id=$1 AND status='queued' AND scheduled_for<=now()`, id).Scan(&storeID, &destination, &text) != nil {
		return
	}
	if destination == "" || text == "" {
		_, _ = s.db.Exec(ctx, `UPDATE automation_runs SET status='skipped',error='Sin destino o mensaje',updated_at=now() WHERE id=$1`, id)
		return
	}
	if err := s.queueWhatsApp(ctx, storeID, "", destination, text, "automation"); err != nil {
		_, _ = s.db.Exec(ctx, `UPDATE automation_runs SET status='failed',error=$1,updated_at=now() WHERE id=$2`, err.Error(), id)
		return
	}
	_, _ = s.db.Exec(ctx, `UPDATE automation_runs SET status='sent',error=NULL,updated_at=now() WHERE id=$1`, id)
}

func (s *Server) automationLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		// Scheduled promotions are deduplicated by rule/event/promotion/destination.
		if rows, err := s.db.Query(ctx, `SELECT id::text,store_id::text,name FROM promotions WHERE is_active=true AND starts_at IS NOT NULL AND starts_at<=now() AND (ends_at IS NULL OR ends_at>=now())`); err == nil {
			for rows.Next() {
				var id, storeID, name string
				if rows.Scan(&id, &storeID, &name) == nil {
					s.triggerAutomationEvent(ctx, storeID, automationPromotionStarted, map[string]string{"entity_id": id, "promocion": name})
				}
			}
			rows.Close()
		}
		// Reminder window: once a reservation enters the next hour, dedupe prevents repeats.
		if rows, err := s.db.Query(ctx, `SELECT tr.id::text,tr.store_id::text,coalesce(nullif(tr.guest_phone,''),nullif(o.customer_phone,''),''),coalesce(nullif(tr.guest_name,''),nullif(o.customer_name,''),'Cliente'),to_char(tr.reserved_at AT TIME ZONE coalesce(st.timezone,'America/Santo_Domingo'),'DD/MM/YYYY HH24:MI'),t.name FROM table_reservations tr JOIN stores st ON st.id=tr.store_id JOIN store_tables t ON t.id=tr.table_id LEFT JOIN orders o ON o.id=tr.order_id WHERE tr.status IN ('reserved','confirmed') AND tr.reserved_at>now() AND tr.reserved_at<=now()+interval '60 minutes'`); err == nil {
			for rows.Next() {
				var id, storeID, phone, customer, date, table string
				if rows.Scan(&id, &storeID, &phone, &customer, &date, &table) == nil {
					s.triggerAutomationEvent(ctx, storeID, automationReservationReminder, map[string]string{"entity_id": id, "telefono": phone, "cliente": customer, "fecha": date, "mesa": table})
				}
			}
			rows.Close()
		}
		runIDs := []string{}
		if rows, err := s.db.Query(ctx, `SELECT id::text FROM automation_runs WHERE status='queued' AND scheduled_for<=now() ORDER BY scheduled_for LIMIT 100`); err == nil {
			for rows.Next() {
				var id string
				if rows.Scan(&id) == nil {
					runIDs = append(runIDs, id)
				}
			}
			rows.Close()
		}
		cancel()
		for _, id := range runIDs {
			go s.dispatchAutomationRun(id)
		}
	}
}
