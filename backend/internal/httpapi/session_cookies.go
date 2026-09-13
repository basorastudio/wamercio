package httpapi

import (
	"net/http"
	"strings"
	"time"
)

const (
	platformSessionCookie = "wamercio_platform_session"
	adminSessionCookie    = "wamercio_admin_session"
	staffSessionCookie    = "wamercio_staff_session"
	clientSessionCookie   = "wamercio_client_session"
)

func (s *Server) secureCookies() bool {
	return strings.EqualFold(strings.TrimSpace(s.cfg.AppEnv), "production")
}

func (s *Server) setSessionCookie(w http.ResponseWriter, name, token string, lifetime time.Duration) {
	if lifetime <= 0 {
		lifetime = 12 * time.Hour
	}
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    token,
		Path:     "/api",
		MaxAge:   int(lifetime.Seconds()),
		Expires:  time.Now().Add(lifetime),
		HttpOnly: true,
		Secure:   s.secureCookies(),
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Server) clearSessionCookie(w http.ResponseWriter, name string) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/api",
		MaxAge:   -1,
		Expires:  time.Unix(1, 0),
		HttpOnly: true,
		Secure:   s.secureCookies(),
		SameSite: http.SameSiteLaxMode,
	})
}

func cookieToken(r *http.Request, name string) string {
	cookie, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(cookie.Value)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	scope := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("scope")))
	switch scope {
	case "platform":
		s.clearSessionCookie(w, platformSessionCookie)
	case "admin":
		s.clearSessionCookie(w, adminSessionCookie)
	case "staff":
		s.clearSessionCookie(w, staffSessionCookie)
	case "client", "customer":
		s.clearSessionCookie(w, clientSessionCookie)
	default:
		s.clearSessionCookie(w, platformSessionCookie)
		s.clearSessionCookie(w, adminSessionCookie)
		s.clearSessionCookie(w, staffSessionCookie)
		s.clearSessionCookie(w, clientSessionCookie)
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]bool{"logged_out": true})
}

// bearerTokenFromRequest is kept as the central token resolver so all existing
// authorization middleware transparently accepts secure cookie sessions.
func bearerOrCookieToken(r *http.Request, cookieNames ...string) string {
	if token := bearerTokenFromAuthorizationHeader(r); token != "" {
		return token
	}
	for _, name := range cookieNames {
		if token := cookieToken(r, name); token != "" {
			return token
		}
	}
	return ""
}

func sessionTokenCandidates(r *http.Request, cookieNames ...string) []string {
	candidates := make([]string, 0, len(cookieNames)+1)
	seen := map[string]bool{}
	appendToken := func(token string) {
		token = strings.TrimSpace(token)
		if token == "" || seen[token] {
			return
		}
		seen[token] = true
		candidates = append(candidates, token)
	}
	appendToken(bearerTokenFromAuthorizationHeader(r))
	for _, name := range cookieNames {
		appendToken(cookieToken(r, name))
	}
	return candidates
}

func bearerTokenFromAuthorizationHeader(r *http.Request) string {
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(strings.ToLower(auth), "bearer ") {
		return ""
	}
	return strings.TrimSpace(auth[7:])
}
