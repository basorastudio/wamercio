package httpapi

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"
)

func (s *Server) refreshUserWhatsAppProfile(ctx context.Context, userID, phone, preferredStoreID string) bool {
	phone = normalizePhone(phone)
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(phone) == "" {
		return false
	}
	var updatedAt *time.Time
	var currentURL string
	if err := s.db.QueryRow(ctx, `SELECT coalesce(profile_picture_url,''),profile_picture_updated_at FROM users WHERE id=$1`, userID).Scan(&currentURL, &updatedAt); err == nil && updatedAt != nil && time.Since(*updatedAt) < 6*time.Hour {
		return false
	}

	profileCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	out, err := s.bridgeReq(profileCtx, http.MethodPost, "/sessions/support/profile", map[string]any{"phone": phone})
	if err != nil {
		storeID := strings.TrimSpace(preferredStoreID)
		if storeID == "" {
			_ = s.db.QueryRow(profileCtx, `SELECT id::text FROM stores WHERE user_id=$1 ORDER BY created_at LIMIT 1`, userID).Scan(&storeID)
		}
		if storeID != "" {
			out, err = s.bridgeReq(profileCtx, http.MethodPost, "/sessions/"+storeID+"/profile", map[string]any{"phone": phone})
		}
	}
	if err != nil || out == nil {
		return false
	}
	name := strings.TrimSpace(str(out["whatsapp_name"]))
	pictureURL := strings.TrimSpace(str(out["profile_picture_url"]))
	pictureID := strings.TrimSpace(str(out["profile_picture_id"]))
	if name == "" && pictureURL == "" && pictureID == "" {
		return false
	}
	_, err = s.db.Exec(ctx, `UPDATE users SET whatsapp_name=coalesce(nullif($1,''),whatsapp_name),profile_picture_url=coalesce(nullif($2,''),profile_picture_url),profile_picture_id=coalesce(nullif($3,''),profile_picture_id),profile_picture_updated_at=now(),updated_at=now() WHERE id=$4`, name, pictureURL, pictureID, userID)
	return err == nil
}

func (s *Server) refreshStoreStaffWhatsAppProfile(ctx context.Context, staffID, storeID, phone string) bool {
	phone = normalizePhone(phone)
	if staffID == "" || storeID == "" || phone == "" {
		return false
	}
	var updatedAt *time.Time
	if err := s.db.QueryRow(ctx, `SELECT profile_picture_updated_at FROM store_staff WHERE id=$1`, staffID).Scan(&updatedAt); err == nil && updatedAt != nil && time.Since(*updatedAt) < 6*time.Hour {
		return false
	}
	profileCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	out, err := s.bridgeReq(profileCtx, http.MethodPost, "/sessions/support/profile", map[string]any{"phone": phone})
	if err != nil {
		out, err = s.bridgeReq(profileCtx, http.MethodPost, "/sessions/"+storeID+"/profile", map[string]any{"phone": phone})
	}
	if err != nil || out == nil {
		return false
	}
	name := strings.TrimSpace(str(out["whatsapp_name"]))
	pictureURL := strings.TrimSpace(str(out["profile_picture_url"]))
	pictureID := strings.TrimSpace(str(out["profile_picture_id"]))
	_, err = s.db.Exec(ctx, `UPDATE store_staff SET whatsapp_name=coalesce(nullif($1,''),whatsapp_name),profile_picture_url=coalesce(nullif($2,''),profile_picture_url),profile_picture_id=coalesce(nullif($3,''),profile_picture_id),profile_picture_updated_at=now(),updated_at=now() WHERE id=$4`, name, pictureURL, pictureID, staffID)
	return err == nil
}

func (s *Server) adminRefreshOwnerWhatsAppProfiles(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT id::text,coalesce(phone,'') FROM users WHERE role='owner' AND coalesce(phone,'')<>'' AND (profile_picture_updated_at IS NULL OR profile_picture_updated_at < now()-interval '6 hours') ORDER BY created_at DESC LIMIT 24`)
	if err != nil {
		jsonErr(w, 500, "No se pudieron preparar los perfiles")
		return
	}
	defer rows.Close()
	type item struct{ id, phone string }
	items := []item{}
	for rows.Next() {
		var it item
		if rows.Scan(&it.id, &it.phone) == nil {
			items = append(items, it)
		}
	}
	sem := make(chan struct{}, 4)
	var wg sync.WaitGroup
	var mu sync.Mutex
	updated := 0
	for _, it := range items {
		it := it
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			if s.refreshUserWhatsAppProfile(r.Context(), it.id, it.phone, "") {
				mu.Lock()
				updated++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	jsonOut(w, 200, map[string]any{"ok": true, "updated": updated})
}
