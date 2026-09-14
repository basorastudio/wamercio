package httpapi

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	authpkg "wamercio/services/api/internal/auth"
)

func ssoTokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
func randomSSOToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return ""
	}
	return hex.EncodeToString(b)
}

func (s *Server) customerSSOStart(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	var in struct {
		Target string `json:"target"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Destino inválido")
		return
	}
	target, ok := validCustomHostname(in.Target)
	if !ok {
		jsonErr(w, 400, "Destino inválido")
		return
	}
	var active bool
	_ = s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM store_domains WHERE hostname=$1 AND status='active')`, target).Scan(&active)
	if !active {
		jsonErr(w, 404, "Dominio de negocio no encontrado")
		return
	}
	token := randomSSOToken()
	if token == "" {
		jsonErr(w, 500, "No se pudo iniciar el acceso")
		return
	}
	_, _ = s.db.Exec(r.Context(), `DELETE FROM customer_sso_tokens WHERE expires_at<now() OR used_at IS NOT NULL`)
	_, err := s.db.Exec(r.Context(), `INSERT INTO customer_sso_tokens(token_hash,global_customer_id,target_hostname,expires_at) VALUES($1,$2,$3,now()+interval '2 minutes')`, ssoTokenHash(token), c.UserID, target)
	if err != nil {
		jsonErr(w, 500, "No se pudo preparar el acceso")
		return
	}
	jsonOut(w, 200, map[string]any{"token": token, "target": "https://" + target + "/auth/customer/callback?token=" + token})
}

func (s *Server) customerSSOExchange(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token string `json:"token"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Token) == "" {
		jsonErr(w, 400, "Token inválido")
		return
	}
	host := s.requestHostname(r)
	hash := ssoTokenHash(strings.TrimSpace(in.Token))
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo validar el acceso")
		return
	}
	defer tx.Rollback(r.Context())
	var customerID, target string
	err = tx.QueryRow(r.Context(), `SELECT global_customer_id::text,target_hostname FROM customer_sso_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE`, hash).Scan(&customerID, &target)
	if err != nil || normalizeHostname(target) != normalizeHostname(host) {
		jsonErr(w, 401, "El acceso ya no es válido")
		return
	}
	if _, err = tx.Exec(r.Context(), `UPDATE customer_sso_tokens SET used_at=now() WHERE token_hash=$1`, hash); err != nil {
		jsonErr(w, 500, "No se pudo consumir el acceso")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		jsonErr(w, 500, "No se pudo confirmar el acceso")
		return
	}
	tok, err := authpkg.Sign(s.cfg.JWTSecret, customerID, "customer")
	if err != nil {
		jsonErr(w, 500, "No se pudo crear la sesión")
		return
	}
	s.setCustomerSessionCookie(w, r, tok, 7*24*3600)
	jsonOut(w, 200, map[string]bool{"ok": true})
}
