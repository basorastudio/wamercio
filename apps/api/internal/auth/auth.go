package auth

import (
	"context"
	"errors"
	"github.com/golang-jwt/jwt/v5"
	"net/http"
	"strings"
	"time"
)

type Claims struct {
	UserID, Role, TenantID string
	jwt.RegisteredClaims
}
type key string

const claimsKey key = "claims"

type Manager struct {
	secret []byte
	ttl    time.Duration
}

func New(secret string, ttl time.Duration) *Manager { return &Manager{[]byte(secret), ttl} }
func (m *Manager) Sign(userID, role, tenantID string) (string, error) {
	now := time.Now()
	c := Claims{UserID: userID, Role: role, TenantID: tenantID, RegisteredClaims: jwt.RegisteredClaims{IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(m.ttl))}}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(m.secret)
}
func (m *Manager) Parse(token string) (*Claims, error) {
	t, err := jwt.ParseWithClaims(token, &Claims{}, func(t *jwt.Token) (any, error) {
		if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, errors.New("algoritmo inválido")
		}
		return m.secret, nil
	})
	if err != nil || !t.Valid {
		return nil, errors.New("sesión inválida")
	}
	c, ok := t.Claims.(*Claims)
	if !ok {
		return nil, errors.New("sesión inválida")
	}
	return c, nil
}
func (m *Manager) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := r.Header.Get("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			http.Error(w, "no autorizado", http.StatusUnauthorized)
			return
		}
		c, err := m.Parse(strings.TrimPrefix(h, "Bearer "))
		if err != nil {
			http.Error(w, "no autorizado", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), claimsKey, c)))
	})
}
func From(r *http.Request) *Claims { c, _ := r.Context().Value(claimsKey).(*Claims); return c }
func RequireRoles(roles ...string) func(http.Handler) http.Handler {
	allowed := map[string]bool{}
	for _, r := range roles {
		allowed[r] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c := From(r)
			if c == nil || !allowed[c.Role] {
				http.Error(w, "prohibido", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
