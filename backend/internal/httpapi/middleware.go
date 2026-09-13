package httpapi

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"colmapro/backend/internal/platform/tenancy"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type observedResponseWriter struct {
	http.ResponseWriter
	status int
	bytes  int64
}

type requestMetadataKey struct{}

type requestMetadata struct {
	mu       sync.RWMutex
	tenantID string
	userID   string
	role     string
}

type limitTrackingBody struct {
	io.ReadCloser
	metrics *serviceMetrics
	once    sync.Once
}

func (body *limitTrackingBody) Read(buffer []byte) (int, error) {
	read, err := body.ReadCloser.Read(buffer)
	var maxBytesError *http.MaxBytesError
	if errors.As(err, &maxBytesError) {
		body.once.Do(func() {
			if body.metrics != nil {
				body.metrics.bodyRejected.Add(1)
			}
		})
	}
	return read, err
}

func setRequestTenant(ctx context.Context, tenantID string) {
	if metadata, ok := ctx.Value(requestMetadataKey{}).(*requestMetadata); ok {
		metadata.mu.Lock()
		metadata.tenantID = tenantID
		metadata.mu.Unlock()
	}
}

func setRequestActor(ctx context.Context, userID, role string) {
	if metadata, ok := ctx.Value(requestMetadataKey{}).(*requestMetadata); ok {
		metadata.mu.Lock()
		metadata.userID = safeLogIdentifier(userID)
		metadata.role = role
		metadata.mu.Unlock()
	}
}

func safeLogIdentifier(value string) string {
	value = strings.TrimSpace(value)
	if len(value) == 36 && strings.Count(value, "-") == 4 {
		return value
	}
	if value == "" {
		return ""
	}
	digest := sha256.Sum256([]byte(value))
	return "sha256:" + hex.EncodeToString(digest[:6])
}

func (metadata *requestMetadata) snapshot() (string, string, string) {
	metadata.mu.RLock()
	defer metadata.mu.RUnlock()
	return metadata.tenantID, metadata.userID, metadata.role
}

func (w *observedResponseWriter) WriteHeader(status int) {
	if w.status != 0 {
		return
	}
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *observedResponseWriter) Write(data []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	written, err := w.ResponseWriter.Write(data)
	w.bytes += int64(written)
	return written, err
}

func (w *observedResponseWriter) Flush() {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	if flusher, ok := w.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (w *observedResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := w.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("response writer does not support hijacking")
	}
	return hijacker.Hijack()
}

func (w *observedResponseWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

func (s *Server) observeRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		startedAt := time.Now()
		metadata := &requestMetadata{}
		r = r.WithContext(context.WithValue(r.Context(), requestMetadataKey{}, metadata))
		if s.metrics != nil {
			s.metrics.activeRequests.Add(1)
			defer s.metrics.activeRequests.Add(-1)
		}
		observed := &observedResponseWriter{ResponseWriter: w}
		next.ServeHTTP(observed, r)
		if observed.status == 0 {
			observed.status = http.StatusOK
		}
		route := chi.RouteContext(r.Context()).RoutePattern()
		if route == "" {
			route = "unmatched"
		}
		if s.metrics != nil {
			s.metrics.observeRequest(r.Method, route, observed.status, time.Since(startedAt))
			s.metrics.observeBusinessRequest(r.Method, route, observed.status, observed.Header())
		}
		tenantID, userID, role := metadata.snapshot()
		tenantSlug := strings.TrimSpace(observed.Header().Get("X-WAMERCIO-Tenant"))
		if tenantID == "" {
			if tenant, ok := tenancy.FromContext(r.Context()); ok {
				tenantID = tenant.ID
			}
		}
		level := slog.LevelInfo
		if strings.HasPrefix(route, "/health") {
			level = slog.LevelDebug
		} else if observed.status >= http.StatusInternalServerError {
			level = slog.LevelError
		} else if observed.status >= http.StatusBadRequest {
			level = slog.LevelWarn
		}
		slog.Log(r.Context(), level, "http request completed",
			"request_id", middleware.GetReqID(r.Context()),
			"trace_id", requestTraceID(r),
			"tenant_id", tenantID,
			"tenant_slug", tenantSlug,
			"user_id", userID,
			"role", role,
			"method", r.Method,
			"route", route,
			"status", observed.status,
			"error_code", responseErrorCode(observed.status),
			"duration_ms", time.Since(startedAt).Milliseconds(),
			"response_bytes", observed.bytes,
		)
	})
}

func responseErrorCode(status int) string {
	if status < http.StatusBadRequest {
		return ""
	}
	return "http_" + strconv.Itoa(status)
}

func (m *serviceMetrics) observeBusinessRequest(method, route string, status int, header http.Header) {
	if m == nil || method != http.MethodPost {
		return
	}
	succeeded := status >= http.StatusOK && status < http.StatusMultipleChoices
	switch route {
	case "/api/client/orders":
		if !succeeded {
			m.ordersFailed.Add(1)
		} else if strings.EqualFold(header.Get("Idempotency-Replayed"), "true") {
			m.ordersReplayed.Add(1)
		} else {
			m.ordersCreated.Add(1)
		}
	case "/api/platform/businesses", "/api/admin/businesses":
		if succeeded {
			m.tenantsCreated.Add(1)
		} else {
			m.tenantsFailed.Add(1)
		}
	}
}

func requestTraceID(r *http.Request) string {
	traceParent := strings.TrimSpace(r.Header.Get("traceparent"))
	parts := strings.Split(traceParent, "-")
	if len(parts) >= 4 && len(parts[1]) == 32 {
		return parts[1]
	}
	return middleware.GetReqID(r.Context())
}

func (s *Server) limitRequestBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body == nil || r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		contentType := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type")))
		if strings.HasPrefix(contentType, "multipart/") {
			next.ServeHTTP(w, r)
			return
		}
		limit := s.cfg.HTTPMaxJSONBodyBytes
		if limit <= 0 {
			limit = 2 << 20
		}
		if r.ContentLength > limit {
			if s.metrics != nil {
				s.metrics.bodyRejected.Add(1)
			}
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "La solicitud supera el tamaño máximo permitido"})
			return
		}
		r.Body = &limitTrackingBody{ReadCloser: http.MaxBytesReader(w, r.Body, limit), metrics: s.metrics}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) requestDeadline(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/events") {
			next.ServeHTTP(w, r)
			return
		}
		timeout := s.requestTimeout(r)
		if timeout <= 0 {
			timeout = 30 * time.Second
		}
		writeTimeout := s.cfg.HTTPWriteTimeout
		if writeTimeout > 0 {
			if timeout >= writeTimeout {
				writeTimeout = timeout + 5*time.Second
			}
			controller := http.NewResponseController(w)
			_ = controller.SetWriteDeadline(time.Now().Add(writeTimeout))
			defer controller.SetWriteDeadline(time.Time{})
		}
		ctx, cancel := context.WithTimeout(r.Context(), timeout)
		defer cancel()
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) requestTimeout(r *http.Request) time.Duration {
	timeout := s.cfg.HTTPRequestTimeout
	if r.Method == http.MethodPost && (strings.HasSuffix(r.URL.Path, "/platform/businesses") ||
		strings.HasSuffix(r.URL.Path, "/admin/businesses") ||
		strings.HasSuffix(r.URL.Path, "/catalog/import-default")) {
		return s.cfg.HTTPProvisioningRequestTimeout
	}
	if strings.Contains(r.URL.Path, "/whatsapp/") ||
		strings.HasSuffix(r.URL.Path, "/image") {
		return s.cfg.HTTPExternalRequestTimeout
	}
	return timeout
}
