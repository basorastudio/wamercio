package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

func (s *Server) getVoiceSettings(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	_, _ = s.db.Exec(r.Context(), `INSERT INTO store_transcription_settings(store_id) VALUES($1) ON CONFLICT(store_id) DO NOTHING`, storeID)
	var active, auto bool
	var language, provider string
	_ = s.db.QueryRow(r.Context(), `SELECT is_active,auto_transcribe_voice_notes,language,provider FROM store_transcription_settings WHERE store_id=$1`, storeID).Scan(&active, &auto, &language, &provider)
	jsonOut(w, 200, map[string]any{"store_id": storeID, "is_active": active, "auto_transcribe_voice_notes": auto, "language": language, "provider": provider, "provider_configured": strings.TrimSpace(os.Getenv("STT_API_URL")) != ""})
}

func (s *Server) updateVoiceSettings(w http.ResponseWriter, r *http.Request) {
	var in struct {
		StoreID                  string `json:"store_id"`
		IsActive                 bool   `json:"is_active"`
		AutoTranscribeVoiceNotes bool   `json:"auto_transcribe_voice_notes"`
		Language                 string `json:"language"`
		Provider                 string `json:"provider"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.StoreID) == "" {
		jsonErr(w, 400, "Datos inválidos")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, in.StoreID) {
		jsonErr(w, 404, "Tienda no encontrada")
		return
	}
	in.Language = strings.TrimSpace(strings.ToLower(in.Language))
	if in.Language == "" {
		in.Language = "es"
	}
	if len(in.Language) > 16 {
		in.Language = in.Language[:16]
	}
	if strings.TrimSpace(in.Provider) == "" {
		in.Provider = "openai_compatible"
	}
	_, err := s.db.Exec(r.Context(), `INSERT INTO store_transcription_settings(store_id,is_active,auto_transcribe_voice_notes,language,provider,updated_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(store_id) DO UPDATE SET is_active=excluded.is_active,auto_transcribe_voice_notes=excluded.auto_transcribe_voice_notes,language=excluded.language,provider=excluded.provider,updated_at=now()`, in.StoreID, in.IsActive, in.AutoTranscribeVoiceNotes, in.Language, in.Provider)
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar la configuración")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) listVoiceTranscripts(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	conversationID := strings.TrimSpace(r.URL.Query().Get("conversation_id"))
	rows, err := s.db.Query(r.Context(), `SELECT t.id::text,t.conversation_id::text,t.message_id::text,t.text,t.language,t.engine,t.status,coalesce(t.error,''),t.attempts,t.created_at,t.updated_at,coalesce(c.display_name,''),coalesce(c.whatsapp_phone,''),coalesce(m.media_url,'') FROM message_transcripts t JOIN conversations c ON c.id=t.conversation_id JOIN messages m ON m.id=t.message_id WHERE t.store_id=$1 AND ($2='' OR t.conversation_id::text=$2) AND ($3='' OR t.text ILIKE '%'||$3||'%' OR c.display_name ILIKE '%'||$3||'%' OR c.whatsapp_phone ILIKE '%'||$3||'%') ORDER BY t.created_at DESC LIMIT 250`, storeID, conversationID, q)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las transcripciones")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, convID, messageID, textValue, language, engine, status, errText, displayName, phone, mediaURL string
		var attempts int
		var created, updated time.Time
		if rows.Scan(&id, &convID, &messageID, &textValue, &language, &engine, &status, &errText, &attempts, &created, &updated, &displayName, &phone, &mediaURL) == nil {
			out = append(out, map[string]any{"id": id, "conversation_id": convID, "message_id": messageID, "text": textValue, "language": language, "engine": engine, "status": status, "error": errText, "attempts": attempts, "created_at": created, "updated_at": updated, "contact_name": displayName, "phone": phone, "media_url": mediaURL})
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) requestVoiceTranscript(w http.ResponseWriter, r *http.Request) {
	messageID := chi.URLParam(r, "messageID")
	c := claims(r)
	var storeID, conversationID, typ string
	if s.db.QueryRow(r.Context(), `SELECT c.store_id::text,m.conversation_id::text,m.type FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=$1`, messageID).Scan(&storeID, &conversationID, &typ) != nil || !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, storeID) {
		jsonErr(w, 404, "Nota de voz no encontrada")
		return
	}
	if typ != "audio" && typ != "ptt" && typ != "view_once_audio" && typ != "view_once_ptt" {
		jsonErr(w, 400, "El mensaje no es una nota de voz")
		return
	}
	_, _ = s.db.Exec(r.Context(), `INSERT INTO message_transcripts(store_id,conversation_id,message_id,status) VALUES($1,$2,$3,'pending') ON CONFLICT(message_id) DO UPDATE SET status=CASE WHEN message_transcripts.status='done' THEN 'done' ELSE 'pending' END,error=NULL,updated_at=now()`, storeID, conversationID, messageID)
	go s.processTranscript(messageID)
	jsonOut(w, 202, map[string]any{"ok": true, "message_id": messageID})
}

func (s *Server) enqueueAutomaticTranscript(ctx context.Context, storeID, conversationID, whatsappMessageID string) {
	var active, auto bool
	if s.db.QueryRow(ctx, `SELECT is_active,auto_transcribe_voice_notes FROM store_transcription_settings WHERE store_id=$1`, storeID).Scan(&active, &auto) != nil || !active || !auto {
		return
	}
	var id string
	if s.db.QueryRow(ctx, `SELECT id::text FROM messages WHERE conversation_id=$1 AND message_id=$2 LIMIT 1`, conversationID, whatsappMessageID).Scan(&id) != nil {
		return
	}
	_, _ = s.db.Exec(ctx, `INSERT INTO message_transcripts(store_id,conversation_id,message_id,status) VALUES($1,$2,$3,'pending') ON CONFLICT(message_id) DO NOTHING`, storeID, conversationID, id)
}

func (s *Server) transcriptionLoop() {
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		_, _ = s.db.Exec(ctx, `UPDATE message_transcripts SET status='pending',error=coalesce(error,'')||' · reintentado tras interrupción',updated_at=now() WHERE status='processing' AND updated_at<now()-interval '10 minutes'`)
		rows, err := s.db.Query(ctx, `SELECT message_id::text FROM message_transcripts WHERE status='pending' AND attempts<4 ORDER BY created_at LIMIT 10`)
		ids := []string{}
		if err == nil {
			for rows.Next() {
				var id string
				if rows.Scan(&id) == nil {
					ids = append(ids, id)
				}
			}
			rows.Close()
		}
		cancel()
		for _, id := range ids {
			go s.processTranscript(id)
		}
	}
}

func (s *Server) processTranscript(messageID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	res, err := s.db.Exec(ctx, `UPDATE message_transcripts SET status='processing',attempts=attempts+1,updated_at=now() WHERE message_id=$1 AND status='pending'`, messageID)
	if err != nil || res.RowsAffected() == 0 {
		return
	}
	var storeID, mediaURL, language string
	if err = s.db.QueryRow(ctx, `SELECT t.store_id::text,coalesce(m.media_url,''),s.language FROM message_transcripts t JOIN messages m ON m.id=t.message_id JOIN store_transcription_settings s ON s.store_id=t.store_id WHERE t.message_id=$1`, messageID).Scan(&storeID, &mediaURL, &language); err != nil {
		s.transcriptFailed(ctx, messageID, err)
		return
	}
	endpoint := strings.TrimSpace(os.Getenv("STT_API_URL"))
	if endpoint == "" {
		s.transcriptSkipped(ctx, messageID, "STT_API_URL no configurado")
		return
	}
	localPath, err := s.mediaLocalPath(mediaURL)
	if err != nil {
		s.transcriptFailed(ctx, messageID, err)
		return
	}
	textValue, detected, engine, err := callTranscriptionAPI(ctx, endpoint, os.Getenv("STT_API_KEY"), envSTTModel(), language, localPath)
	if err != nil {
		s.transcriptFailed(ctx, messageID, err)
		return
	}
	if strings.TrimSpace(detected) == "" {
		detected = language
	}
	_, _ = s.db.Exec(ctx, `UPDATE message_transcripts SET text=$1,language=$2,engine=$3,status='done',error=NULL,updated_at=now() WHERE message_id=$4`, strings.TrimSpace(textValue), detected, engine, messageID)
	s.publishStoreEvent(ctx, storeID, "transcript", map[string]any{"message_id": messageID})
}

func (s *Server) mediaLocalPath(mediaURL string) (string, error) {
	mediaURL = strings.TrimSpace(mediaURL)
	if mediaURL == "" {
		return "", fmt.Errorf("la nota de voz no tiene archivo multimedia")
	}
	if u, err := url.Parse(mediaURL); err == nil && u.Path != "" {
		mediaURL = u.Path
	}
	rel := strings.TrimPrefix(mediaURL, "/media/")
	rel = strings.TrimPrefix(rel, "media/")
	rel = filepath.Clean(rel)
	if rel == "." || strings.HasPrefix(rel, "..") {
		return "", fmt.Errorf("ruta multimedia inválida")
	}
	path := filepath.Join(s.cfg.UploadDir, rel)
	if _, err := os.Stat(path); err != nil {
		return "", fmt.Errorf("no se encontró el audio descargado: %w", err)
	}
	return path, nil
}

func envSTTModel() string {
	if v := strings.TrimSpace(os.Getenv("STT_MODEL")); v != "" {
		return v
	}
	return "whisper-1"
}

func callTranscriptionAPI(ctx context.Context, endpoint, apiKey, model, language, path string) (string, string, string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", "", "", err
	}
	defer file.Close()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	part, err := mw.CreateFormFile("file", filepath.Base(path))
	if err != nil {
		return "", "", "", err
	}
	if _, err = io.Copy(part, file); err != nil {
		return "", "", "", err
	}
	_ = mw.WriteField("model", model)
	if language != "" && language != "auto" {
		_ = mw.WriteField("language", language)
	}
	_ = mw.Close()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &body)
	if err != nil {
		return "", "", "", err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if strings.TrimSpace(apiKey) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(apiKey))
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", "", err
	}
	defer resp.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", "", "", fmt.Errorf("STT respondió %d: %s", resp.StatusCode, strings.TrimSpace(string(payload)))
	}
	var out struct {
		Text     string `json:"text"`
		Language string `json:"language"`
		Model    string `json:"model"`
	}
	if err = json.Unmarshal(payload, &out); err != nil {
		return "", "", "", fmt.Errorf("respuesta STT inválida: %w", err)
	}
	if strings.TrimSpace(out.Text) == "" {
		return "", "", "", fmt.Errorf("el proveedor STT no devolvió texto")
	}
	engine := strings.TrimSpace(out.Model)
	if engine == "" {
		engine = model
	}
	return out.Text, out.Language, engine, nil
}

func (s *Server) transcriptFailed(ctx context.Context, messageID string, err error) {
	_, _ = s.db.Exec(ctx, `UPDATE message_transcripts SET status=CASE WHEN attempts>=4 THEN 'failed' ELSE 'pending' END,error=$1,updated_at=now() WHERE message_id=$2`, err.Error(), messageID)
}
func (s *Server) transcriptSkipped(ctx context.Context, messageID, reason string) {
	_, _ = s.db.Exec(ctx, `UPDATE message_transcripts SET status='skipped',error=$1,updated_at=now() WHERE message_id=$2`, reason, messageID)
}
