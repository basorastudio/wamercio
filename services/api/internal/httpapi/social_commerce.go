package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type storeSocialConnection struct {
	ID               string         `json:"id"`
	StoreID          string         `json:"store_id,omitempty"`
	Provider         string         `json:"provider"`
	ProviderUserID   string         `json:"provider_user_id"`
	DisplayName      string         `json:"display_name"`
	AccountType      string         `json:"account_type"`
	AvatarURL        string         `json:"avatar_url"`
	ProfileURL       string         `json:"profile_url"`
	Metadata         map[string]any `json:"metadata"`
	GrantedScopes    string         `json:"granted_scopes"`
	Status           string         `json:"status"`
	TokenExpiresAt   *time.Time     `json:"token_expires_at,omitempty"`
	ConnectedAt      time.Time      `json:"connected_at"`
	AccessEncrypted  string         `json:"-"`
	RefreshEncrypted string         `json:"-"`
}

type socialPostRecord struct {
	ID              string            `json:"id"`
	StoreID         string            `json:"store_id,omitempty"`
	Status          string            `json:"status"`
	BaseText        string            `json:"base_text"`
	LinkURL         string            `json:"link_url"`
	ProviderContent map[string]string `json:"provider_content"`
	TargetIDs       []string          `json:"target_ids"`
	MediaIDs        []string          `json:"media_ids"`
	ScheduledAt     *time.Time        `json:"scheduled_at,omitempty"`
	Timezone        string            `json:"timezone"`
	PromotionID     string            `json:"promotion_id,omitempty"`
	CreatedAt       time.Time         `json:"created_at"`
	UpdatedAt       time.Time         `json:"updated_at"`
	Deliveries      []map[string]any  `json:"deliveries,omitempty"`
}

type socialAsset struct {
	ID           string         `json:"id"`
	StoreID      string         `json:"store_id,omitempty"`
	Kind         string         `json:"kind"`
	Name         string         `json:"name"`
	URL          string         `json:"url"`
	ThumbnailURL string         `json:"thumbnail_url"`
	MimeType     string         `json:"mime_type"`
	FileSize     int64          `json:"file_size"`
	Source       string         `json:"source"`
	Metadata     map[string]any `json:"metadata"`
	CreatedAt    time.Time      `json:"created_at"`
}

type providerPublishResult struct {
	ProviderPostID string
	ProviderURL    string
}

func (s *Server) listSocialProviders(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.assertStore(w, r); !ok {
		return
	}
	items := []map[string]any{}
	for _, cfg := range socialProviders() {
		creds, err := s.resolveSocialCredentials(r.Context(), cfg.Provider)
		available := err == nil && strings.TrimSpace(creds.ClientID) != "" && strings.TrimSpace(creds.ClientSecret) != ""
		message := "Servicio de conexión temporalmente no disponible"
		mode := ""
		if available {
			mode = creds.Source
			if mode == "proxy" {
				message = "Conexión rápida disponible"
			} else {
				message = "Conexión administrada por la plataforma"
			}
		}
		items = append(items, map[string]any{"provider": cfg.Provider, "name": cfg.Name, "connect_available": available, "connect_mode": mode, "message": message})
	}
	jsonOut(w, 200, map[string]any{"items": items, "proxy_enabled": socialProxyEnabled()})
}

func scanSocialConnection(rows interface{ Scan(...any) error }) (storeSocialConnection, error) {
	var row storeSocialConnection
	var metaRaw []byte
	err := rows.Scan(&row.ID, &row.StoreID, &row.Provider, &row.ProviderUserID, &row.DisplayName, &row.AccountType, &row.AvatarURL, &row.ProfileURL, &metaRaw, &row.AccessEncrypted, &row.RefreshEncrypted, &row.TokenExpiresAt, &row.GrantedScopes, &row.Status, &row.ConnectedAt)
	if err != nil {
		return row, err
	}
	row.Metadata = map[string]any{}
	_ = json.Unmarshal(metaRaw, &row.Metadata)
	return row, nil
}

func (s *Server) socialConnectionByID(ctx context.Context, id string, includeSecret bool) (storeSocialConnection, error) {
	row, err := scanSocialConnection(s.db.QueryRow(ctx, `SELECT id::text,store_id::text,provider,provider_user_id,display_name,account_type,avatar_url,profile_url,metadata,access_token_encrypted,refresh_token_encrypted,token_expires_at,granted_scopes,status,connected_at FROM store_social_connections WHERE id=$1`, id))
	if err != nil {
		return row, err
	}
	if !includeSecret {
		row.AccessEncrypted, row.RefreshEncrypted = "", ""
	}
	return row, nil
}

func (s *Server) listSocialConnections(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id::text,store_id::text,provider,provider_user_id,display_name,account_type,avatar_url,profile_url,metadata,access_token_encrypted,refresh_token_encrypted,token_expires_at,granted_scopes,status,connected_at FROM store_social_connections WHERE store_id=$1 AND status<>'revoked' ORDER BY provider,display_name`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las conexiones")
		return
	}
	defer rows.Close()
	out := []storeSocialConnection{}
	for rows.Next() {
		row, scanErr := scanSocialConnection(rows)
		if scanErr == nil {
			row.AccessEncrypted, row.RefreshEncrypted = "", ""
			out = append(out, row)
		}
	}
	jsonOut(w, 200, out)
}

func (s *Server) deleteSocialConnection(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	result, err := s.db.Exec(r.Context(), `UPDATE store_social_connections SET status='revoked',updated_at=now() WHERE id=$1 AND store_id=$2`, id, storeID)
	if err != nil || result.RowsAffected() == 0 {
		jsonErr(w, 404, "Conexión no encontrada")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) listMediaAssets(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id::text,store_id::text,kind,name,url,thumbnail_url,mime_type,file_size,source,metadata,created_at FROM store_media_assets WHERE store_id=$1 ORDER BY created_at DESC`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudo cargar Multimedia")
		return
	}
	defer rows.Close()
	out := []socialAsset{}
	for rows.Next() {
		var a socialAsset
		var meta []byte
		if rows.Scan(&a.ID, &a.StoreID, &a.Kind, &a.Name, &a.URL, &a.ThumbnailURL, &a.MimeType, &a.FileSize, &a.Source, &meta, &a.CreatedAt) == nil {
			a.Metadata = map[string]any{}
			_ = json.Unmarshal(meta, &a.Metadata)
			out = append(out, a)
		}
	}
	jsonOut(w, 200, out)
}

func normalizeMediaKind(kind, mime string) string {
	kind = strings.ToLower(strings.TrimSpace(kind))
	if kind == "image" || kind == "video" || kind == "document" {
		return kind
	}
	if strings.HasPrefix(mime, "video/") {
		return "video"
	}
	if strings.HasPrefix(mime, "image/") {
		return "image"
	}
	return "document"
}

func (s *Server) createMediaAsset(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	var in struct {
		Kind         string         `json:"kind"`
		Name         string         `json:"name"`
		URL          string         `json:"url"`
		ThumbnailURL string         `json:"thumbnail_url"`
		MimeType     string         `json:"mime_type"`
		FileSize     int64          `json:"file_size"`
		Source       string         `json:"source"`
		Metadata     map[string]any `json:"metadata"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.URL) == "" {
		jsonErr(w, 400, "El recurso multimedia necesita una URL")
		return
	}
	kind := normalizeMediaKind(in.Kind, in.MimeType)
	if in.Source == "" {
		in.Source = "upload"
	}
	meta, _ := json.Marshal(in.Metadata)
	actor := claims(r)
	var id string
	err := s.db.QueryRow(r.Context(), `INSERT INTO store_media_assets(store_id,kind,name,url,thumbnail_url,mime_type,file_size,source,metadata,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) RETURNING id::text`, storeID, kind, strings.TrimSpace(in.Name), strings.TrimSpace(in.URL), strings.TrimSpace(in.ThumbnailURL), strings.TrimSpace(in.MimeType), in.FileSize, in.Source, string(meta), actor.UserID).Scan(&id)
	if err != nil {
		jsonErr(w, 500, "No se pudo guardar el recurso")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id, "store_id": storeID, "kind": kind, "name": in.Name, "url": in.URL, "thumbnail_url": in.ThumbnailURL, "mime_type": in.MimeType, "file_size": in.FileSize, "source": in.Source})
}

func (s *Server) deleteMediaAsset(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	result, _ := s.db.Exec(r.Context(), `DELETE FROM store_media_assets WHERE id=$1 AND store_id=$2`, chi.URLParam(r, "id"), storeID)
	if result.RowsAffected() == 0 {
		jsonErr(w, 404, "Recurso no encontrado")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) readSocialPost(ctx context.Context, storeID, id string) (socialPostRecord, error) {
	var row socialPostRecord
	var providerRaw, targetRaw, mediaRaw []byte
	var promotion *string
	err := s.db.QueryRow(ctx, `SELECT id::text,store_id::text,status,base_text,link_url,provider_content,target_ids,media_ids,scheduled_at,timezone,promotion_id::text,created_at,updated_at FROM store_social_posts WHERE id=$1 AND store_id=$2`, id, storeID).Scan(&row.ID, &row.StoreID, &row.Status, &row.BaseText, &row.LinkURL, &providerRaw, &targetRaw, &mediaRaw, &row.ScheduledAt, &row.Timezone, &promotion, &row.CreatedAt, &row.UpdatedAt)
	if err != nil {
		return row, err
	}
	if promotion != nil {
		row.PromotionID = *promotion
	}
	row.ProviderContent = map[string]string{}
	_ = json.Unmarshal(providerRaw, &row.ProviderContent)
	_ = json.Unmarshal(targetRaw, &row.TargetIDs)
	_ = json.Unmarshal(mediaRaw, &row.MediaIDs)
	rows, qerr := s.db.Query(ctx, `SELECT id::text,connection_id::text,provider,status,provider_post_id,provider_url,error_message,attempt_count,published_at,updated_at FROM store_social_post_deliveries WHERE post_id=$1 ORDER BY updated_at`, id)
	if qerr == nil {
		defer rows.Close()
		for rows.Next() {
			var did, cid, provider, status, pid, purl, emsg string
			var attempts int
			var published *time.Time
			var updated time.Time
			_ = rows.Scan(&did, &cid, &provider, &status, &pid, &purl, &emsg, &attempts, &published, &updated)
			row.Deliveries = append(row.Deliveries, map[string]any{"id": did, "connection_id": cid, "provider": provider, "status": status, "provider_post_id": pid, "provider_url": purl, "error_message": emsg, "attempt_count": attempts, "published_at": published, "updated_at": updated})
		}
	}
	return row, nil
}

func (s *Server) listSocialPosts(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id::text FROM store_social_posts WHERE store_id=$1 ORDER BY updated_at DESC LIMIT 300`, storeID)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar las publicaciones")
		return
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		_ = rows.Scan(&id)
		ids = append(ids, id)
	}
	out := []socialPostRecord{}
	for _, id := range ids {
		if row, err := s.readSocialPost(r.Context(), storeID, id); err == nil {
			out = append(out, row)
		}
	}
	jsonOut(w, 200, out)
}

func normalizeSocialPostStatus(status string, scheduled *time.Time) string {
	status = strings.ToLower(strings.TrimSpace(status))
	allowed := map[string]bool{"draft": true, "approved": true, "scheduled": true}
	if !allowed[status] {
		status = "draft"
	}
	if status == "scheduled" && scheduled == nil {
		status = "draft"
	}
	return status
}

func (s *Server) verifySocialTargets(ctx context.Context, storeID string, ids []string) error {
	seen := map[string]bool{}
	for _, id := range ids {
		if seen[id] {
			continue
		}
		seen[id] = true
		var n int
		_ = s.db.QueryRow(ctx, `SELECT count(*) FROM store_social_connections WHERE id=$1 AND store_id=$2 AND status='active'`, id, storeID).Scan(&n)
		if n == 0 {
			return fmt.Errorf("uno de los destinos no pertenece al negocio o está desconectado")
		}
	}
	return nil
}

func (s *Server) saveSocialPost(w http.ResponseWriter, r *http.Request, updating bool) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	var in struct {
		Status          string            `json:"status"`
		BaseText        string            `json:"base_text"`
		LinkURL         string            `json:"link_url"`
		ProviderContent map[string]string `json:"provider_content"`
		TargetIDs       []string          `json:"target_ids"`
		MediaIDs        []string          `json:"media_ids"`
		ScheduledAt     *time.Time        `json:"scheduled_at"`
		Timezone        string            `json:"timezone"`
		PromotionID     string            `json:"promotion_id"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Publicación inválida")
		return
	}
	if err := s.verifySocialTargets(r.Context(), storeID, in.TargetIDs); err != nil && len(in.TargetIDs) > 0 {
		jsonErr(w, 400, err.Error())
		return
	}
	if in.Timezone == "" {
		in.Timezone = "America/Santo_Domingo"
	}
	in.Status = normalizeSocialPostStatus(in.Status, in.ScheduledAt)
	provider, _ := json.Marshal(in.ProviderContent)
	targets, _ := json.Marshal(in.TargetIDs)
	media, _ := json.Marshal(in.MediaIDs)
	actor := claims(r)
	id := chi.URLParam(r, "id")
	if !updating {
		id = uuid.NewString()
		_, err := s.db.Exec(r.Context(), `INSERT INTO store_social_posts(id,store_id,status,base_text,link_url,provider_content,target_ids,media_ids,scheduled_at,timezone,promotion_id,created_by,approved_by) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,nullif($11,'')::uuid,$12,CASE WHEN $3 IN ('approved','scheduled') THEN $12 ELSE NULL END)`, id, storeID, in.Status, strings.TrimSpace(in.BaseText), strings.TrimSpace(in.LinkURL), string(provider), string(targets), string(media), in.ScheduledAt, in.Timezone, in.PromotionID, actor.UserID)
		if err != nil {
			jsonErr(w, 500, "No se pudo crear la publicación")
			return
		}
	} else {
		result, err := s.db.Exec(r.Context(), `UPDATE store_social_posts SET status=$1,base_text=$2,link_url=$3,provider_content=$4::jsonb,target_ids=$5::jsonb,media_ids=$6::jsonb,scheduled_at=$7,timezone=$8,promotion_id=nullif($9,'')::uuid,approved_by=CASE WHEN $1 IN ('approved','scheduled') THEN $10 ELSE approved_by END,updated_at=now() WHERE id=$11 AND store_id=$12 AND status NOT IN ('publishing','published')`, in.Status, strings.TrimSpace(in.BaseText), strings.TrimSpace(in.LinkURL), string(provider), string(targets), string(media), in.ScheduledAt, in.Timezone, in.PromotionID, actor.UserID, id, storeID)
		if err != nil || result.RowsAffected() == 0 {
			jsonErr(w, 400, "La publicación no se puede editar en su estado actual")
			return
		}
	}
	row, _ := s.readSocialPost(r.Context(), storeID, id)
	jsonOut(w, map[bool]int{false: 201, true: 200}[updating], row)
}

func (s *Server) createSocialPost(w http.ResponseWriter, r *http.Request) {
	s.saveSocialPost(w, r, false)
}
func (s *Server) updateSocialPost(w http.ResponseWriter, r *http.Request) {
	s.saveSocialPost(w, r, true)
}

func (s *Server) deleteSocialPost(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	result, _ := s.db.Exec(r.Context(), `DELETE FROM store_social_posts WHERE id=$1 AND store_id=$2 AND status NOT IN ('publishing','published')`, chi.URLParam(r, "id"), storeID)
	if result.RowsAffected() == 0 {
		jsonErr(w, 400, "La publicación no se puede eliminar")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) publishSocialPostHandler(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if err := s.publishSocialPost(r.Context(), storeID, id, false); err != nil {
		jsonErr(w, 400, err.Error())
		return
	}
	row, _ := s.readSocialPost(r.Context(), storeID, id)
	jsonOut(w, 200, row)
}

func socialPollInterval() time.Duration {
	n, _ := strconv.Atoi(strings.TrimSpace(os.Getenv("WAMERCIO_SOCIAL_PUBLISH_POLL_SECONDS")))
	if n <= 0 {
		n = 20
	}
	return time.Duration(n) * time.Second
}

func (s *Server) socialPublishLoop() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	_, _ = s.db.Exec(ctx, `UPDATE store_social_posts SET status=CASE WHEN scheduled_at IS NOT NULL THEN 'scheduled' ELSE 'approved' END,updated_at=now() WHERE status='publishing' AND updated_at<now()-interval '10 minutes'`)
	cancel()
	ticker := time.NewTicker(socialPollInterval())
	defer ticker.Stop()
	for range ticker.C {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		rows, err := s.db.Query(ctx, `SELECT id::text,store_id::text FROM store_social_posts WHERE status='scheduled' AND scheduled_at<=now() ORDER BY scheduled_at LIMIT 20`)
		pairs := [][2]string{}
		if err == nil {
			for rows.Next() {
				var id, storeID string
				if rows.Scan(&id, &storeID) == nil {
					pairs = append(pairs, [2]string{id, storeID})
				}
			}
			rows.Close()
		}
		cancel()
		for _, pair := range pairs {
			go s.publishSocialPost(context.Background(), pair[1], pair[0], true)
		}
	}
}

func (s *Server) socialAccessToken(connection storeSocialConnection) (string, error) {
	if connection.AccessEncrypted == "" {
		return "", fmt.Errorf("la conexión no contiene credenciales")
	}
	return s.decryptPlatformSecret(connection.AccessEncrypted)
}

func (s *Server) socialAssets(ctx context.Context, storeID string, ids []string) ([]socialAsset, error) {
	out := []socialAsset{}
	for _, id := range ids {
		var a socialAsset
		var meta []byte
		err := s.db.QueryRow(ctx, `SELECT id::text,store_id::text,kind,name,url,thumbnail_url,mime_type,file_size,source,metadata,created_at FROM store_media_assets WHERE id=$1 AND store_id=$2`, id, storeID).Scan(&a.ID, &a.StoreID, &a.Kind, &a.Name, &a.URL, &a.ThumbnailURL, &a.MimeType, &a.FileSize, &a.Source, &meta, &a.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("uno de los recursos multimedia no está disponible")
		}
		_ = json.Unmarshal(meta, &a.Metadata)
		out = append(out, a)
	}
	return out, nil
}

func (s *Server) publicMediaURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "https://") || strings.HasPrefix(raw, "http://") {
		return raw, nil
	}
	base := strings.TrimRight(strings.TrimSpace(s.cfg.AppURL), "/")
	if base == "" || !strings.HasPrefix(raw, "/") {
		return "", fmt.Errorf("el proveedor necesita una URL pública HTTPS para el recurso")
	}
	return base + raw, nil
}

func socialText(post socialPostRecord, provider string) string {
	if v := strings.TrimSpace(post.ProviderContent[provider]); v != "" {
		return v
	}
	return strings.TrimSpace(post.BaseText)
}

func (s *Server) socialJSONBody(ctx context.Context, method, endpoint, bearer string, headers map[string]string, payload any, target any) error {
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := s.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("el proveedor respondió %d: %s", resp.StatusCode, strings.TrimSpace(string(data)))
	}
	if target != nil && len(data) > 0 {
		if err := json.Unmarshal(data, target); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) publishFacebook(ctx context.Context, post socialPostRecord, connection storeSocialConnection, assets []socialAsset) (providerPublishResult, error) {
	token, err := s.socialAccessToken(connection)
	if err != nil {
		return providerPublishResult{}, err
	}
	base := "https://graph.facebook.com/v26.0/" + url.PathEscape(connection.ProviderUserID)
	text := socialText(post, "facebook")
	if len(assets) > 0 && assets[0].Kind == "image" {
		mediaURL, err := s.publicMediaURL(assets[0].URL)
		if err != nil {
			return providerPublishResult{}, err
		}
		form := url.Values{"access_token": {token}, "url": {mediaURL}, "caption": {text}}
		var result struct{ ID, PostID string }
		if err := s.socialJSON(ctx, http.MethodPost, base+"/photos", "", form, &result); err != nil {
			return providerPublishResult{}, err
		}
		return providerPublishResult{ProviderPostID: firstNonBlank(result.PostID, result.ID), ProviderURL: connection.ProfileURL}, nil
	}
	form := url.Values{"access_token": {token}, "message": {text}}
	if strings.TrimSpace(post.LinkURL) != "" {
		form.Set("link", strings.TrimSpace(post.LinkURL))
	}
	var result struct {
		ID string `json:"id"`
	}
	if err := s.socialJSON(ctx, http.MethodPost, base+"/feed", "", form, &result); err != nil {
		return providerPublishResult{}, err
	}
	return providerPublishResult{ProviderPostID: result.ID, ProviderURL: connection.ProfileURL}, nil
}

func (s *Server) publishInstagram(ctx context.Context, post socialPostRecord, connection storeSocialConnection, assets []socialAsset) (providerPublishResult, error) {
	if len(assets) == 0 || (assets[0].Kind != "image" && assets[0].Kind != "video") {
		return providerPublishResult{}, fmt.Errorf("Instagram requiere una imagen o video")
	}
	token, err := s.socialAccessToken(connection)
	if err != nil {
		return providerPublishResult{}, err
	}
	mediaURL, err := s.publicMediaURL(assets[0].URL)
	if err != nil {
		return providerPublishResult{}, err
	}
	form := url.Values{"access_token": {token}, "caption": {socialText(post, "instagram")}}
	if assets[0].Kind == "video" {
		form.Set("media_type", "REELS")
		form.Set("video_url", mediaURL)
	} else {
		form.Set("image_url", mediaURL)
	}
	var container struct {
		ID string `json:"id"`
	}
	endpoint := "https://graph.facebook.com/v26.0/" + url.PathEscape(connection.ProviderUserID)
	if err := s.socialJSON(ctx, http.MethodPost, endpoint+"/media", "", form, &container); err != nil {
		return providerPublishResult{}, err
	}
	if assets[0].Kind == "video" {
		for i := 0; i < 12; i++ {
			q := url.Values{"fields": {"status_code"}, "access_token": {token}}
			var status struct {
				StatusCode string `json:"status_code"`
			}
			if s.socialJSON(ctx, http.MethodGet, "https://graph.facebook.com/v26.0/"+url.PathEscape(container.ID)+"?"+q.Encode(), "", nil, &status) == nil && strings.EqualFold(status.StatusCode, "FINISHED") {
				break
			}
			time.Sleep(2 * time.Second)
		}
	}
	publishForm := url.Values{"access_token": {token}, "creation_id": {container.ID}}
	var result struct {
		ID string `json:"id"`
	}
	if err := s.socialJSON(ctx, http.MethodPost, endpoint+"/media_publish", "", publishForm, &result); err != nil {
		return providerPublishResult{}, err
	}
	return providerPublishResult{ProviderPostID: result.ID, ProviderURL: connection.ProfileURL}, nil
}

func (s *Server) publishLinkedIn(ctx context.Context, post socialPostRecord, connection storeSocialConnection, assets []socialAsset) (providerPublishResult, error) {
	token, err := s.socialAccessToken(connection)
	if err != nil {
		return providerPublishResult{}, err
	}
	payload := map[string]any{"author": "urn:li:person:" + connection.ProviderUserID, "commentary": socialText(post, "linkedin"), "visibility": "PUBLIC", "distribution": map[string]any{"feedDistribution": "MAIN_FEED", "targetEntities": []any{}, "thirdPartyDistributionChannels": []any{}}, "lifecycleState": "PUBLISHED", "isReshareDisabledByAuthor": false}
	if post.LinkURL != "" {
		payload["content"] = map[string]any{"article": map[string]any{"source": post.LinkURL, "title": socialText(post, "linkedin")}}
	}
	var result map[string]any
	headers := map[string]string{"LinkedIn-Version": "202607", "X-Restli-Protocol-Version": "2.0.0"}
	if err := s.socialJSONBody(ctx, http.MethodPost, "https://api.linkedin.com/rest/posts", token, headers, payload, &result); err != nil {
		return providerPublishResult{}, err
	}
	id := fmt.Sprint(result["id"])
	return providerPublishResult{ProviderPostID: id, ProviderURL: connection.ProfileURL}, nil
}

func (s *Server) publishGoogleBusiness(ctx context.Context, post socialPostRecord, connection storeSocialConnection, assets []socialAsset) (providerPublishResult, error) {
	token, err := s.socialAccessToken(connection)
	if err != nil {
		return providerPublishResult{}, err
	}
	parent := googleReviewParent(connection)
	if !strings.Contains(parent, "accounts/") {
		return providerPublishResult{}, fmt.Errorf("la conexión de Google no contiene la ubicación completa")
	}
	payload := map[string]any{"languageCode": "es", "summary": socialText(post, "google_business"), "topicType": "STANDARD"}
	if post.LinkURL != "" {
		payload["callToAction"] = map[string]any{"actionType": "LEARN_MORE", "url": post.LinkURL}
	}
	if len(assets) > 0 && assets[0].Kind == "image" {
		mediaURL, err := s.publicMediaURL(assets[0].URL)
		if err == nil {
			payload["media"] = []any{map[string]any{"mediaFormat": "PHOTO", "sourceUrl": mediaURL}}
		}
	}
	var result map[string]any
	if err := s.socialJSONBody(ctx, http.MethodPost, "https://mybusiness.googleapis.com/v4/"+parent+"/localPosts", token, nil, payload, &result); err != nil {
		return providerPublishResult{}, err
	}
	return providerPublishResult{ProviderPostID: fmt.Sprint(result["name"]), ProviderURL: fmt.Sprint(result["searchUrl"])}, nil
}

func (s *Server) publishSocialPost(ctx context.Context, storeID, postID string, scheduled bool) error {
	allowed := []string{"approved", "failed", "partial"}
	if scheduled {
		allowed = []string{"scheduled"}
	}
	result, err := s.db.Exec(ctx, `UPDATE store_social_posts SET status='publishing',updated_at=now() WHERE id=$1 AND store_id=$2 AND status=ANY($3)`, postID, storeID, allowed)
	if err != nil || result.RowsAffected() == 0 {
		return fmt.Errorf("la publicación no está lista para publicar")
	}
	post, err := s.readSocialPost(ctx, storeID, postID)
	if err != nil {
		return err
	}
	assets, err := s.socialAssets(ctx, storeID, post.MediaIDs)
	if err != nil {
		_, _ = s.db.Exec(ctx, `UPDATE store_social_posts SET status='failed',updated_at=now() WHERE id=$1`, postID)
		return err
	}
	publishedBefore := map[string]bool{}
	for _, d := range post.Deliveries {
		if fmt.Sprint(d["status"]) == "published" {
			publishedBefore[fmt.Sprint(d["connection_id"])] = true
		}
	}
	succeeded, failed := 0, 0
	for _, connectionID := range post.TargetIDs {
		if publishedBefore[connectionID] {
			succeeded++
			continue
		}
		connection, loadErr := s.socialConnectionByID(ctx, connectionID, true)
		if loadErr != nil || connection.StoreID != storeID || connection.Status != "active" {
			failed++
			_, _ = s.db.Exec(ctx, `INSERT INTO store_social_post_deliveries(post_id,store_id,connection_id,provider,status,error_message,attempt_count,updated_at) VALUES($1,$2,$3,'unknown','failed','Destino no disponible',1,now()) ON CONFLICT(post_id,connection_id) DO UPDATE SET status='failed',error_message=excluded.error_message,attempt_count=store_social_post_deliveries.attempt_count+1,updated_at=now()`, postID, storeID, connectionID)
			continue
		}
		var pub providerPublishResult
		var pubErr error
		switch connection.Provider {
		case "facebook":
			pub, pubErr = s.publishFacebook(ctx, post, connection, assets)
		case "instagram":
			pub, pubErr = s.publishInstagram(ctx, post, connection, assets)
		case "linkedin":
			pub, pubErr = s.publishLinkedIn(ctx, post, connection, assets)
		case "google_business":
			pub, pubErr = s.publishGoogleBusiness(ctx, post, connection, assets)
		default:
			pubErr = fmt.Errorf("proveedor no compatible")
		}
		if pubErr != nil {
			failed++
			_, _ = s.db.Exec(ctx, `INSERT INTO store_social_post_deliveries(post_id,store_id,connection_id,provider,status,error_message,attempt_count,updated_at) VALUES($1,$2,$3,$4,'failed',$5,1,now()) ON CONFLICT(post_id,connection_id) DO UPDATE SET status='failed',error_message=excluded.error_message,attempt_count=store_social_post_deliveries.attempt_count+1,updated_at=now()`, postID, storeID, connectionID, connection.Provider, pubErr.Error())
			continue
		}
		succeeded++
		_, _ = s.db.Exec(ctx, `INSERT INTO store_social_post_deliveries(post_id,store_id,connection_id,provider,status,provider_post_id,provider_url,error_message,attempt_count,published_at,updated_at) VALUES($1,$2,$3,$4,'published',$5,$6,'',1,now(),now()) ON CONFLICT(post_id,connection_id) DO UPDATE SET status='published',provider_post_id=excluded.provider_post_id,provider_url=excluded.provider_url,error_message='',attempt_count=store_social_post_deliveries.attempt_count+1,published_at=now(),updated_at=now()`, postID, storeID, connectionID, connection.Provider, pub.ProviderPostID, pub.ProviderURL)
	}
	status := "failed"
	if succeeded > 0 && failed == 0 {
		status = "published"
	} else if succeeded > 0 {
		status = "partial"
	}
	_, _ = s.db.Exec(ctx, `UPDATE store_social_posts SET status=$1,updated_at=now() WHERE id=$2 AND store_id=$3`, status, postID, storeID)
	if failed > 0 {
		return fmt.Errorf("publicación completada: %d destino(s) correctos y %d con error", succeeded, failed)
	}
	return nil
}
