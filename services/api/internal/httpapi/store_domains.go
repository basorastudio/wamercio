package httpapi

import (
	"fmt"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

var domainLabelPattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`)

func validCustomHostname(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if strings.Contains(raw, "://") || strings.ContainsAny(raw, "/?#") {
		return "", false
	}
	host := normalizeHostname(raw)
	if host == "" || len(host) > 253 || strings.Contains(host, "_") || net.ParseIP(host) != nil {
		return "", false
	}
	parts := strings.Split(host, ".")
	if len(parts) < 2 {
		return "", false
	}
	for _, part := range parts {
		if !domainLabelPattern.MatchString(part) {
			return "", false
		}
	}
	return host, true
}

func (s *Server) listStoreDomains(w http.ResponseWriter, r *http.Request) {
	sid, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id::text,hostname,status,is_primary,verification_token,verified_at,created_at FROM store_domains WHERE store_id=$1 ORDER BY is_primary DESC,created_at DESC`, sid)
	if err != nil {
		jsonErr(w, 500, "No se pudieron cargar los dominios")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, host, status, token string
		var primary bool
		var verified *time.Time
		var created time.Time
		if rows.Scan(&id, &host, &status, &primary, &token, &verified, &created) == nil {
			out = append(out, map[string]any{"id": id, "hostname": host, "status": status, "is_primary": primary, "verification_token": token, "verified_at": verified, "created_at": created})
		}
	}
	var slug string
	_ = s.db.QueryRow(r.Context(), `SELECT slug FROM stores WHERE id=$1`, sid).Scan(&slug)
	jsonOut(w, 200, map[string]any{"default_hostname": s.storePublicHostname(r.Context(), sid, slug), "default_url": "https://" + slug + "." + normalizeHostname(s.cfg.TenantRootDomain), "cname_target": normalizeHostname(s.cfg.CustomDomainCNAMETarget), "domains": out})
}

func (s *Server) createStoreDomain(w http.ResponseWriter, r *http.Request) {
	sid, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	var in struct {
		Hostname string `json:"hostname"`
	}
	if decode(r, &in) != nil {
		jsonErr(w, 400, "Dominio inválido")
		return
	}
	host, valid := validCustomHostname(in.Hostname)
	if !valid {
		jsonErr(w, 400, "Escribe un dominio válido, por ejemplo tienda.com")
		return
	}
	if host == normalizeHostname(s.cfg.PlatformDomain) || host == normalizeHostname(s.cfg.TenantRootDomain) || strings.HasSuffix(host, "."+normalizeHostname(s.cfg.TenantRootDomain)) {
		jsonErr(w, 409, "Ese dominio pertenece a la infraestructura de WAMERCIO")
		return
	}
	var id, token string
	err := s.db.QueryRow(r.Context(), `INSERT INTO store_domains(store_id,hostname) VALUES($1,$2) RETURNING id::text,verification_token`, sid, host).Scan(&id, &token)
	if err != nil {
		jsonErr(w, 409, "Ese dominio ya está registrado")
		return
	}
	jsonOut(w, 201, map[string]any{"id": id, "hostname": host, "status": "pending", "verification_token": token, "cname_target": normalizeHostname(s.cfg.CustomDomainCNAMETarget)})
}

func (s *Server) verifyStoreDomain(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	var sid, host, token string
	if s.db.QueryRow(r.Context(), `SELECT d.store_id::text,d.hostname,d.verification_token FROM store_domains d JOIN stores s ON s.id=d.store_id WHERE d.id=$1 AND ($2='superadmin' OR s.user_id=$3)`, id, c.Role, c.UserID).Scan(&sid, &host, &token) != nil {
		jsonErr(w, 404, "Dominio no encontrado")
		return
	}
	target := normalizeHostname(s.cfg.CustomDomainCNAMETarget)
	verified := false
	method := ""
	if cname, err := net.LookupCNAME(host); err == nil && normalizeHostname(cname) == target {
		verified = true
		method = "cname"
	}
	if !verified {
		if txts, err := net.LookupTXT("_wamercio." + host); err == nil {
			for _, txt := range txts {
				if strings.TrimSpace(txt) == token {
					verified = true
					method = "txt"
					break
				}
			}
		}
	}
	if !verified {
		_, _ = s.db.Exec(r.Context(), `UPDATE store_domains SET status='pending',updated_at=now() WHERE id=$1`, id)
		jsonErr(w, 422, fmt.Sprintf("No encontramos el CNAME hacia %s ni el TXT de verificación", target))
		return
	}
	_, err := s.db.Exec(r.Context(), `UPDATE store_domains SET status='active',verified_at=now(),updated_at=now() WHERE id=$1`, id)
	if err != nil {
		jsonErr(w, 500, "No se pudo activar el dominio")
		return
	}
	jsonOut(w, 200, map[string]any{"ok": true, "status": "active", "method": method})
}

func (s *Server) primaryStoreDomain(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		jsonErr(w, 500, "No se pudo actualizar el dominio")
		return
	}
	defer tx.Rollback(r.Context())
	var sid string
	if tx.QueryRow(r.Context(), `SELECT d.store_id::text FROM store_domains d JOIN stores s ON s.id=d.store_id WHERE d.id=$1 AND d.status='active' AND ($2='superadmin' OR s.user_id=$3)`, id, c.Role, c.UserID).Scan(&sid) != nil {
		jsonErr(w, 404, "Dominio activo no encontrado")
		return
	}
	_, _ = tx.Exec(r.Context(), `UPDATE store_domains SET is_primary=false,updated_at=now() WHERE store_id=$1`, sid)
	if _, err = tx.Exec(r.Context(), `UPDATE store_domains SET is_primary=true,updated_at=now() WHERE id=$1`, id); err != nil || tx.Commit(r.Context()) != nil {
		jsonErr(w, 500, "No se pudo marcar como principal")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}

func (s *Server) deleteStoreDomain(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	id := chi.URLParam(r, "id")
	cmd, err := s.db.Exec(r.Context(), `DELETE FROM store_domains d USING stores s WHERE d.id=$1 AND s.id=d.store_id AND ($2='superadmin' OR s.user_id=$3)`, id, c.Role, c.UserID)
	if err != nil || cmd.RowsAffected() == 0 {
		jsonErr(w, 404, "Dominio no encontrado")
		return
	}
	jsonOut(w, 200, map[string]bool{"ok": true})
}
