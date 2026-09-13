package httpapi

import (
	"context"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

var distributedRateLimit = redis.NewScript(`
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`)

type authFailureState struct {
	count       int
	lockedUntil time.Time
}

type authFailureTracker struct {
	mu     sync.Mutex
	states map[string]authFailureState
}

func newAuthFailureTracker() *authFailureTracker {
	return &authFailureTracker{states: map[string]authFailureState{}}
}

func (t *authFailureTracker) locked(key string, limit int, now time.Time) bool {
	if t == nil || strings.TrimSpace(key) == "" || limit <= 0 {
		return false
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	state, exists := t.states[key]
	if !exists {
		return false
	}
	if !state.lockedUntil.After(now) {
		delete(t.states, key)
		return false
	}
	return state.count >= limit
}

func (t *authFailureTracker) record(key string, lockout time.Duration, now time.Time) {
	if t == nil || strings.TrimSpace(key) == "" {
		return
	}
	if lockout <= 0 {
		lockout = 15 * time.Minute
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	state := t.states[key]
	if !state.lockedUntil.After(now) {
		state = authFailureState{}
	}
	state.count++
	state.lockedUntil = now.Add(lockout)
	t.states[key] = state
	if len(t.states) > 10000 {
		for candidate, value := range t.states {
			if !value.lockedUntil.After(now) {
				delete(t.states, candidate)
			}
		}
	}
}

func (t *authFailureTracker) clear(key string) {
	if t == nil || strings.TrimSpace(key) == "" {
		return
	}
	t.mu.Lock()
	delete(t.states, key)
	t.mu.Unlock()
}

type rateBucket struct {
	count       int
	windowStart time.Time
}

type rateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*rateBucket
}

func newRateLimiter() *rateLimiter {
	return &rateLimiter{buckets: map[string]*rateBucket{}}
}

func (l *rateLimiter) allow(key string, limit int, now time.Time) bool {
	return l.allowWindow(key, limit, time.Minute, now)
}

func (l *rateLimiter) allowWindow(key string, limit int, window time.Duration, now time.Time) bool {
	if limit <= 0 || strings.TrimSpace(key) == "" {
		return true
	}
	if window < time.Second {
		window = time.Minute
	}
	windowSeconds := int64(window / time.Second)
	windowStart := time.Unix((now.Unix()/windowSeconds)*windowSeconds, 0).In(now.Location())
	l.mu.Lock()
	defer l.mu.Unlock()
	bucket := l.buckets[key]
	if bucket == nil || !bucket.windowStart.Equal(windowStart) {
		if len(l.buckets) >= 10000 {
			retention := 2 * window
			if retention < 2*time.Minute {
				retention = 2 * time.Minute
			}
			for k, b := range l.buckets {
				if now.Sub(b.windowStart) > retention {
					delete(l.buckets, k)
				}
			}
			for k := range l.buckets {
				if len(l.buckets) < 9000 {
					break
				}
				delete(l.buckets, k)
			}
		}
		l.buckets[key] = &rateBucket{count: 1, windowStart: windowStart}
		return true
	}
	bucket.count++
	return bucket.count <= limit
}

func (s *Server) rateLimitIP(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.rateLimiter == nil {
			next.ServeHTTP(w, r)
			return
		}
		now := time.Now()
		clientIP := requestIP(r)
		if !s.allowRequest(r.Context(), "ip:"+clientIP, s.cfg.MaxRequestsPerMinuteIP, now) {
			s.recordRateLimit(w)
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "Estás enviando demasiadas solicitudes en este momento. Intenta nuevamente en unos segundos."})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) rateLimitTenant(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.rateLimiter == nil {
			next.ServeHTTP(w, r)
			return
		}
		now := time.Now()
		if tenantID := tenantIDFromContext(r.Context()); tenantID != "" {
			if !s.allowRequest(r.Context(), "tenant:"+tenantID, s.cfg.MaxRequestsPerMinuteTenant, now) {
				s.recordRateLimit(w)
				writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "El negocio está recibiendo demasiadas solicitudes en este momento. Intenta nuevamente en unos segundos."})
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) allowRequest(ctx context.Context, key string, limit int, now time.Time) bool {
	return s.allowRequestWindow(ctx, key, limit, time.Minute, now)
}

func (s *Server) allowRequestWindow(ctx context.Context, key string, limit int, window time.Duration, now time.Time) bool {
	if limit <= 0 || strings.TrimSpace(key) == "" {
		return true
	}
	if window < time.Second {
		window = time.Minute
	}
	if s.redis != nil {
		timeout := s.cfg.RedisOperationTimeout
		if timeout <= 0 {
			timeout = 300 * time.Millisecond
		}
		windowSeconds := int64(window / time.Second)
		windowStart := time.Unix((now.Unix()/windowSeconds)*windowSeconds, 0)
		redisContext, cancel := context.WithTimeout(ctx, timeout)
		redisKey := "colmapro:ratelimit:" + key + ":" + strconv.FormatInt(windowStart.Unix(), 10)
		expirySeconds := windowSeconds * 2
		if expirySeconds < 120 {
			expirySeconds = 120
		}
		startedAt := time.Now()
		count, err := distributedRateLimit.Run(redisContext, s.redis, []string{redisKey}, expirySeconds).Int64()
		cancel()
		if s.metrics != nil {
			s.metrics.observeRedis(startedAt, err)
		}
		if err == nil {
			return count <= int64(limit)
		}
	}
	if s.rateLimiter == nil {
		return true
	}
	return s.rateLimiter.allowWindow(key, limit, window, now)
}

func (s *Server) recordRateLimit(w http.ResponseWriter) {
	w.Header().Set("Retry-After", "60")
	if s.metrics != nil {
		s.metrics.rateLimited.Add(1)
	}
}

func requestIP(r *http.Request) string {
	for _, header := range []string{"CF-Connecting-IP", "X-Real-IP", "X-Forwarded-For"} {
		value := strings.TrimSpace(r.Header.Get(header))
		if value == "" {
			continue
		}
		if strings.Contains(value, ",") {
			value = strings.TrimSpace(strings.Split(value, ",")[0])
		}
		if ip := net.ParseIP(value); ip != nil {
			return ip.String()
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

var distributedAuthFailures = redis.NewScript(`
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`)

func (s *Server) rateLimitAuthentication(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		limit := s.cfg.MaxLoginAttemptsPerMinute
		if limit <= 0 {
			limit = 10
		}
		key := "auth-route:" + requestIP(r) + ":" + strings.ToLower(strings.TrimSpace(r.URL.Path))
		if !s.allowRequest(r.Context(), key, limit, time.Now()) {
			s.recordRateLimit(w)
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "Se realizaron demasiados intentos de acceso. Espera un momento antes de volver a intentarlo."})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) authFailureKey(_ *http.Request, scope, identity string) string {
	identity = strings.ToLower(strings.TrimSpace(identity))
	if identity == "" {
		identity = "unknown"
	}
	// Route limiting already protects each source IP. This key intentionally
	// excludes the IP so rotating networks cannot bypass the account lockout.
	return "colmapro:auth-failures:" + strings.ToLower(strings.TrimSpace(scope)) + ":" + safeLogIdentifier(identity)
}

func (s *Server) authLocked(ctx context.Context, key string) bool {
	limit := s.cfg.AuthFailureLimit
	if limit <= 0 {
		limit = 5
	}
	if s.redis != nil {
		redisContext, cancel := context.WithTimeout(ctx, s.cfg.RedisOperationTimeout)
		count, err := s.redis.Get(redisContext, key).Int()
		cancel()
		if err == nil && count >= limit {
			return true
		}
	}
	return s.authFailures != nil && s.authFailures.locked(key, limit, time.Now())
}

func (s *Server) rejectLockedAuthentication(w http.ResponseWriter) {
	w.Header().Set("Retry-After", strconv.Itoa(int(s.cfg.AuthLockout.Seconds())))
	writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "La cuenta fue bloqueada temporalmente por varios intentos fallidos. Intenta nuevamente más tarde."})
}

func (s *Server) recordAuthenticationFailure(ctx context.Context, key string) {
	if strings.TrimSpace(key) == "" {
		return
	}
	lockout := s.cfg.AuthLockout
	if lockout <= 0 {
		lockout = 15 * time.Minute
	}
	if s.authFailures != nil {
		s.authFailures.record(key, lockout, time.Now())
	}
	if s.redis == nil {
		return
	}
	redisContext, cancel := context.WithTimeout(ctx, s.cfg.RedisOperationTimeout)
	defer cancel()
	_, _ = distributedAuthFailures.Run(redisContext, s.redis, []string{key}, int(lockout.Seconds())).Result()
}

func (s *Server) clearAuthenticationFailures(ctx context.Context, key string) {
	if strings.TrimSpace(key) == "" {
		return
	}
	if s.authFailures != nil {
		s.authFailures.clear(key)
	}
	if s.redis == nil {
		return
	}
	redisContext, cancel := context.WithTimeout(ctx, s.cfg.RedisOperationTimeout)
	defer cancel()
	_ = s.redis.Del(redisContext, key).Err()
}
