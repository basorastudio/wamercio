package httpapi

import (
	"context"
	"net/http"
	"net/url"
	"strings"

	authpkg "wamercio/services/api/internal/auth"
)

func (s *Server) createOwnerSSOHandoff(ctx context.Context, ownerID string) (string, error) {
	token := randomSSOToken()
	if token == "" {
		return "", http.ErrAbortHandler
	}
	target := normalizeHostname(s.cfg.PlatformDomain)
	if target == "" {
		target = "wamercio.com"
	}
	_, _ = s.db.Exec(ctx, `DELETE FROM owner_sso_tokens WHERE expires_at<now() OR used_at IS NOT NULL`)
	_, err := s.db.Exec(ctx, `INSERT INTO owner_sso_tokens(token_hash,owner_user_id,target_hostname,expires_at) VALUES($1,$2,$3,now()+interval '2 minutes')`, ssoTokenHash(token), ownerID, target)
	if err != nil {
		return "", err
	}
	return "https://" + target + "/auth/store/callback?token=" + url.QueryEscape(token), nil
}

func (s *Server) ownerSSOExchange(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token string `json:"token"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Token) == "" {
		jsonErr(w, http.StatusBadRequest, "Token inválido")
		return
	}
	host := normalizeHostname(s.requestHostname(r))
	hash := ssoTokenHash(strings.TrimSpace(in.Token))
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo validar el acceso")
		return
	}
	defer tx.Rollback(r.Context())
	var ownerID, target string
	err = tx.QueryRow(r.Context(), `SELECT owner_user_id::text,target_hostname FROM owner_sso_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE`, hash).Scan(&ownerID, &target)
	if err != nil || normalizeHostname(target) != host {
		jsonErr(w, http.StatusUnauthorized, "El acceso ya no es válido")
		return
	}
	var active bool
	_ = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM users WHERE id=$1 AND role='owner' AND status='active')`, ownerID).Scan(&active)
	if !active {
		jsonErr(w, http.StatusUnauthorized, "La cuenta del propietario no está activa")
		return
	}
	if _, err = tx.Exec(r.Context(), `UPDATE owner_sso_tokens SET used_at=now() WHERE token_hash=$1`, hash); err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo consumir el acceso")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo confirmar el acceso")
		return
	}
	tok, err := authpkg.Sign(s.cfg.JWTSecret, ownerID, "owner")
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "No se pudo crear la sesión")
		return
	}
	s.setSessionCookie(w, "wamercio_store_token", tok, 30*24*3600)
	jsonOut(w, http.StatusOK, map[string]any{"ok": true, "target": "/dashboard"})
}
