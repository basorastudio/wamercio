package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type evaluationOption struct {
	Score int    `json:"score"`
	Label string `json:"label"`
}
type evaluationSettings struct {
	Enabled              bool               `json:"enabled"`
	Question             string             `json:"question"`
	Options              []evaluationOption `json:"options"`
	FeedbackEnabled      bool               `json:"feedback_enabled"`
	FeedbackMaxScore     int                `json:"feedback_max_score"`
	FeedbackMessage      string             `json:"feedback_message"`
	GoogleReviewEnabled  bool               `json:"google_review_enabled"`
	GoogleReviewMinScore int                `json:"google_review_min_score"`
	GoogleReviewMessage  string             `json:"google_review_message"`
	ThankYouMessage      string             `json:"thank_you_message"`
}

func defaultEvaluationSettings() evaluationSettings {
	return evaluationSettings{Enabled: false, Question: "¿Cómo valoras la atención recibida?", Options: []evaluationOption{{1, "Mala"}, {2, "Regular"}, {3, "Buena"}, {4, "Muy Buena"}, {5, "Excelente"}}, FeedbackEnabled: true, FeedbackMaxScore: 2, FeedbackMessage: "Gracias por tu respuesta. ¿En qué podemos mejorar nuestro servicio?", GoogleReviewEnabled: false, GoogleReviewMinScore: 1, GoogleReviewMessage: "Gracias por compartir tu valoración. Si deseas, también puedes compartir tu experiencia en Google:", ThankYouMessage: "Gracias por evaluar nuestra atención. Tu opinión es muy importante para nosotros."}
}

func (s *Server) loadEvaluationSettings(ctx context.Context, storeID string) evaluationSettings {
	out := defaultEvaluationSettings()
	var raw []byte
	err := s.db.QueryRow(ctx, `SELECT enabled,question,options,feedback_enabled,feedback_max_score,feedback_message,google_review_enabled,google_review_min_score,google_review_message,thank_you_message FROM store_evaluation_settings WHERE store_id=$1`, storeID).Scan(&out.Enabled, &out.Question, &raw, &out.FeedbackEnabled, &out.FeedbackMaxScore, &out.FeedbackMessage, &out.GoogleReviewEnabled, &out.GoogleReviewMinScore, &out.GoogleReviewMessage, &out.ThankYouMessage)
	if err == nil {
		_ = json.Unmarshal(raw, &out.Options)
	}
	if len(out.Options) != 5 {
		out.Options = defaultEvaluationSettings().Options
	}
	return out
}

func (s *Server) getEvaluationSettings(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	jsonOut(w, 200, s.loadEvaluationSettings(r.Context(), storeID))
}

func (s *Server) updateEvaluationSettings(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	in := defaultEvaluationSettings()
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	in.Question = strings.TrimSpace(in.Question)
	in.FeedbackMessage = strings.TrimSpace(in.FeedbackMessage)
	in.GoogleReviewMessage = strings.TrimSpace(in.GoogleReviewMessage)
	in.ThankYouMessage = strings.TrimSpace(in.ThankYouMessage)
	if in.Question == "" || in.ThankYouMessage == "" {
		jsonErr(w, 400, "La pregunta y el agradecimiento son obligatorios")
		return
	}
	if len(in.Options) != 5 {
		jsonErr(w, 400, "Debes configurar cinco respuestas")
		return
	}
	seen := map[int]bool{}
	for i := range in.Options {
		if in.Options[i].Score < 1 || in.Options[i].Score > 5 || seen[in.Options[i].Score] || strings.TrimSpace(in.Options[i].Label) == "" {
			jsonErr(w, 400, "Las respuestas deben representar los valores 1 al 5")
			return
		}
		seen[in.Options[i].Score] = true
		in.Options[i].Label = strings.TrimSpace(in.Options[i].Label)
	}
	if in.FeedbackMaxScore < 1 || in.FeedbackMaxScore > 5 {
		in.FeedbackMaxScore = 2
	}
	if in.GoogleReviewMinScore < 1 || in.GoogleReviewMinScore > 5 {
		in.GoogleReviewMinScore = 1
	}
	raw, _ := json.Marshal(in.Options)
	_, err := s.db.Exec(r.Context(), `INSERT INTO store_evaluation_settings(store_id,enabled,question,options,feedback_enabled,feedback_max_score,feedback_message,google_review_enabled,google_review_min_score,google_review_message,thank_you_message,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) ON CONFLICT(store_id) DO UPDATE SET enabled=excluded.enabled,question=excluded.question,options=excluded.options,feedback_enabled=excluded.feedback_enabled,feedback_max_score=excluded.feedback_max_score,feedback_message=excluded.feedback_message,google_review_enabled=excluded.google_review_enabled,google_review_min_score=excluded.google_review_min_score,google_review_message=excluded.google_review_message,thank_you_message=excluded.thank_you_message,updated_at=now()`, storeID, in.Enabled, in.Question, string(raw), in.FeedbackEnabled, in.FeedbackMaxScore, in.FeedbackMessage, in.GoogleReviewEnabled, in.GoogleReviewMinScore, in.GoogleReviewMessage, in.ThankYouMessage)
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar la configuración")
		return
	}
	jsonOut(w, 200, in)
}

func evaluationLabel(settings evaluationSettings, score int) string {
	for _, o := range settings.Options {
		if o.Score == score {
			return o.Label
		}
	}
	return strconv.Itoa(score)
}
func evaluationQuestion(settings evaluationSettings) string {
	lines := []string{settings.Question}
	for _, o := range settings.Options {
		lines = append(lines, fmt.Sprintf("%d. %s", o.Score, o.Label))
	}
	return strings.Join(lines, "\n")
}

func evaluationPollOptions(settings evaluationSettings) []string {
	out := make([]string, 0, len(settings.Options))
	for _, option := range settings.Options {
		out = append(out, fmt.Sprintf("%d · %s", option.Score, strings.TrimSpace(option.Label)))
	}
	return out
}

func parseEvaluationPollSelection(settings evaluationSettings, selectedHashes []string) int {
	selected := map[string]bool{}
	for _, raw := range selectedHashes {
		if normalized := strings.ToLower(strings.TrimSpace(raw)); normalized != "" {
			selected[normalized] = true
		}
	}
	for i, label := range evaluationPollOptions(settings) {
		hash := sha256.Sum256([]byte(label))
		if selected[hex.EncodeToString(hash[:])] {
			return settings.Options[i].Score
		}
	}
	return 0
}

func (s *Server) queueWhatsAppPoll(ctx context.Context, storeID, conversationID, destination, question string, options []string) error {
	destination = strings.TrimSpace(destination)
	question = strings.TrimSpace(question)
	if storeID == "" || destination == "" || question == "" || len(options) < 2 {
		return nil
	}
	payload, err := json.Marshal(map[string]any{"question": question, "options": options, "max_selections": 1})
	if err != nil {
		return err
	}
	var conv any
	if conversationID != "" {
		conv = conversationID
	}
	var id string
	err = s.db.QueryRow(ctx, `INSERT INTO message_outbox(store_id,conversation_id,destination,body,kind,status) VALUES($1,$2,$3,$4,'evaluation_poll','pending') RETURNING id`, storeID, conv, destination, string(payload)).Scan(&id)
	if err != nil {
		return err
	}
	go s.deliverOutbox(id)
	return nil
}

func (s *Server) maybeQueueEvaluationAfterClose(ctx context.Context, storeID, conversationID, actorID string) {
	settings := s.loadEvaluationSettings(ctx, storeID)
	if !settings.Enabled {
		return
	}
	var customerID, globalID, name, phone string
	err := s.db.QueryRow(ctx, `SELECT coalesce(c.customer_id::text,''),coalesce(cu.global_customer_id::text,''),coalesce(nullif(c.display_name,''),nullif(c.whatsapp_name,''),'Cliente'),coalesce(nullif(c.whatsapp_phone,''),regexp_replace(split_part(c.remote_jid,'@',1),'[^0-9]','','g')) FROM conversations c LEFT JOIN customers cu ON cu.id=c.customer_id WHERE c.id=$1 AND c.store_id=$2`, conversationID, storeID).Scan(&customerID, &globalID, &name, &phone)
	if err != nil || phone == "" {
		return
	}
	snap, _ := json.Marshal(settings)
	var pendingID string
	err = s.db.QueryRow(ctx, `INSERT INTO store_evaluation_pending(store_id,conversation_id,customer_id,global_customer_id,agent_user_id,contact_name,contact_phone,state,settings_snapshot,expires_at,updated_at) VALUES($1,$2,NULLIF($3,'')::uuid,NULLIF($4,'')::uuid,NULLIF($5,'')::uuid,$6,$7,'rating',$8,now()+interval '7 days',now()) ON CONFLICT(store_id,conversation_id) DO UPDATE SET customer_id=excluded.customer_id,global_customer_id=excluded.global_customer_id,agent_user_id=excluded.agent_user_id,contact_name=excluded.contact_name,contact_phone=excluded.contact_phone,state='rating',evaluation_id=NULL,settings_snapshot=excluded.settings_snapshot,expires_at=excluded.expires_at,updated_at=now() RETURNING id::text`, storeID, conversationID, customerID, globalID, actorID, name, phone, string(snap)).Scan(&pendingID)
	if err != nil {
		return
	}
	_ = pendingID
	_ = s.queueWhatsAppPoll(ctx, storeID, conversationID, phone, settings.Question, evaluationPollOptions(settings))
}

func parseEvaluationScore(body string) int {
	body = strings.TrimSpace(body)
	if body == "" {
		return 0
	}
	for _, r := range body {
		if r >= '1' && r <= '5' {
			return int(r - '0')
		}
	}
	return 0
}

func (s *Server) evaluationReviewURL(ctx context.Context, storeID string) string {
	var u string
	_ = s.db.QueryRow(ctx, `SELECT coalesce(nullif(review_url,''),(SELECT coalesce(metadata->>'new_review_uri','') FROM store_social_connections WHERE id=g.connection_id)) FROM store_google_business_settings g WHERE store_id=$1`, storeID).Scan(&u)
	return strings.TrimSpace(u)
}
func (s *Server) completeEvaluation(ctx context.Context, storeID, pendingID, conversationID, phone string, settings evaluationSettings, score int, evaluationID string) {
	messages := []string{settings.ThankYouMessage}
	reviewURL := ""
	requested := false
	if settings.GoogleReviewEnabled && score >= settings.GoogleReviewMinScore {
		reviewURL = s.evaluationReviewURL(ctx, storeID)
		if reviewURL != "" {
			requested = true
			messages = append(messages, strings.TrimSpace(settings.GoogleReviewMessage)+"\n"+reviewURL)
		}
	}
	_, _ = s.db.Exec(ctx, `UPDATE store_customer_evaluations SET google_review_requested=$1,google_review_url=$2 WHERE id=$3`, requested, reviewURL, evaluationID)
	_, _ = s.db.Exec(ctx, `UPDATE store_evaluation_pending SET state='completed',updated_at=now() WHERE id=$1`, pendingID)
	for _, m := range messages {
		if strings.TrimSpace(m) != "" {
			_ = s.queueWhatsApp(ctx, storeID, conversationID, phone, m, "evaluation")
		}
	}
}

func (s *Server) capturePendingEvaluation(ctx context.Context, storeID, conversationID, body string) {
	var id, state, customerID, globalID, agentID, name, phone, evaluationID string
	var raw []byte
	err := s.db.QueryRow(ctx, `SELECT id::text,state,coalesce(customer_id::text,''),coalesce(global_customer_id::text,''),coalesce(agent_user_id::text,''),contact_name,contact_phone,settings_snapshot,coalesce(evaluation_id::text,'') FROM store_evaluation_pending WHERE store_id=$1 AND conversation_id=$2 AND state IN ('rating','feedback') AND expires_at>now()`, storeID, conversationID).Scan(&id, &state, &customerID, &globalID, &agentID, &name, &phone, &raw, &evaluationID)
	if err != nil {
		return
	}
	settings := defaultEvaluationSettings()
	_ = json.Unmarshal(raw, &settings)
	if state == "rating" {
		score := parseEvaluationScore(body)
		if score == 0 {
			return
		}
		label := evaluationLabel(settings, score)
		err = s.db.QueryRow(ctx, `INSERT INTO store_customer_evaluations(store_id,conversation_id,customer_id,global_customer_id,agent_user_id,contact_name,contact_phone,score,label,source) VALUES($1,$2,NULLIF($3,'')::uuid,NULLIF($4,'')::uuid,NULLIF($5,'')::uuid,$6,$7,$8,$9,'whatsapp') RETURNING id::text`, storeID, conversationID, customerID, globalID, agentID, name, phone, score, label).Scan(&evaluationID)
		if err != nil {
			return
		}
		if settings.FeedbackEnabled && score <= settings.FeedbackMaxScore {
			_, _ = s.db.Exec(ctx, `UPDATE store_evaluation_pending SET state='feedback',evaluation_id=$1,updated_at=now() WHERE id=$2`, evaluationID, id)
			_ = s.queueWhatsApp(ctx, storeID, conversationID, phone, settings.FeedbackMessage, "evaluation")
			return
		}
		s.completeEvaluation(ctx, storeID, id, conversationID, phone, settings, score, evaluationID)
		return
	}
	feedback := strings.TrimSpace(body)
	if feedback == "" || evaluationID == "" {
		return
	}
	var score int
	_ = s.db.QueryRow(ctx, `UPDATE store_customer_evaluations SET feedback=$1 WHERE id=$2 RETURNING score`, feedback, evaluationID).Scan(&score)
	s.completeEvaluation(ctx, storeID, id, conversationID, phone, settings, score, evaluationID)
}

func (s *Server) capturePendingEvaluationPoll(ctx context.Context, storeID, conversationID, pollMessageID string, selectedHashes []string) {
	pollMessageID = strings.TrimSpace(pollMessageID)
	if pollMessageID == "" || len(selectedHashes) == 0 {
		return
	}
	var sentMessageID string
	var raw []byte
	err := s.db.QueryRow(ctx, `SELECT coalesce(sent_message_id,''),settings_snapshot FROM store_evaluation_pending WHERE store_id=$1 AND conversation_id=$2 AND state='rating' AND expires_at>now()`, storeID, conversationID).Scan(&sentMessageID, &raw)
	if err != nil || strings.TrimSpace(sentMessageID) == "" || strings.TrimSpace(sentMessageID) != pollMessageID {
		return
	}
	settings := defaultEvaluationSettings()
	_ = json.Unmarshal(raw, &settings)
	score := parseEvaluationPollSelection(settings, selectedHashes)
	if score == 0 {
		return
	}
	s.capturePendingEvaluation(ctx, storeID, conversationID, strconv.Itoa(score))
}

func (s *Server) listEvaluations(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	from := strings.TrimSpace(r.URL.Query().Get("from"))
	to := strings.TrimSpace(r.URL.Query().Get("to"))
	score, _ := strconv.Atoi(r.URL.Query().Get("score"))
	agent := strings.TrimSpace(r.URL.Query().Get("agent_id"))
	source := strings.TrimSpace(r.URL.Query().Get("source"))
	args := []any{storeID}
	where := []string{"e.store_id=$1"}
	if from != "" {
		args = append(args, from)
		where = append(where, fmt.Sprintf("e.created_at >= $%d::date", len(args)))
	}
	if to != "" {
		args = append(args, to)
		where = append(where, fmt.Sprintf("e.created_at < ($%d::date + interval '1 day')", len(args)))
	}
	if score >= 1 && score <= 5 {
		args = append(args, score)
		where = append(where, fmt.Sprintf("e.score=$%d", len(args)))
	}
	if agent != "" {
		args = append(args, agent)
		where = append(where, fmt.Sprintf("e.agent_user_id=$%d", len(args)))
	}
	if source != "" {
		args = append(args, source)
		where = append(where, fmt.Sprintf("e.source=$%d", len(args)))
	}
	query := `SELECT e.id::text,coalesce(e.conversation_id::text,''),coalesce(e.agent_user_id::text,''),coalesce(u.name,''),e.contact_name,e.contact_phone,e.score,e.label,e.feedback,e.source,e.google_review_requested,e.created_at FROM store_customer_evaluations e LEFT JOIN users u ON u.id=e.agent_user_id WHERE ` + strings.Join(where, " AND ") + ` ORDER BY e.created_at DESC LIMIT 1000`
	rows, err := s.db.Query(r.Context(), query, args...)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las evaluaciones")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	counts := map[int]int{1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
	total := 0.0
	for rows.Next() {
		var id, conv, agentID, agentName, name, phone, label, feedback, source string
		var value int
		var requested bool
		var created time.Time
		if rows.Scan(&id, &conv, &agentID, &agentName, &name, &phone, &value, &label, &feedback, &source, &requested, &created) == nil {
			counts[value]++
			total += float64(value)
			items = append(items, map[string]any{"id": id, "conversation_id": conv, "agent_user_id": agentID, "agent_name": agentName, "contact_name": name, "contact_phone": phone, "score": value, "label": label, "feedback": feedback, "source": source, "google_review_requested": requested, "created_at": created})
		}
	}
	avg := 0.0
	if len(items) > 0 {
		avg = total / float64(len(items))
	}
	jsonOut(w, 200, map[string]any{"items": items, "summary": map[string]any{"count": len(items), "average": avg, "counts": counts}})
}
