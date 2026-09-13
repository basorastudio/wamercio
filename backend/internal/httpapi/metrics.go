package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"runtime/metrics"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"colmapro/backend/internal/platform/database"

	"github.com/jackc/pgx/v5/pgxpool"
)

var httpDurationBuckets = [...]float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600}

type routeMetricKey struct {
	method string
	route  string
}

type statusMetricKey struct {
	method string
	route  string
	status int
}

type routeMetric struct {
	count   uint64
	sum     float64
	buckets [len(httpDurationBuckets)]uint64
}

type serviceMetrics struct {
	mu              sync.RWMutex
	routes          map[routeMetricKey]*routeMetric
	statuses        map[statusMetricKey]uint64
	activeRequests  atomic.Int64
	bodyRejected    atomic.Uint64
	rateLimited     atomic.Uint64
	redisOperations atomic.Uint64
	redisErrors     atomic.Uint64
	redisTimeouts   atomic.Uint64
	redisNanos      atomic.Uint64
	cacheHits       atomic.Uint64
	cacheMisses     atomic.Uint64
	ordersCreated   atomic.Uint64
	ordersReplayed  atomic.Uint64
	ordersFailed    atomic.Uint64
	tenantsCreated  atomic.Uint64
	tenantsFailed   atomic.Uint64
	ready           atomic.Bool
}

func newServiceMetrics() *serviceMetrics {
	result := &serviceMetrics{
		routes:   make(map[routeMetricKey]*routeMetric),
		statuses: make(map[statusMetricKey]uint64),
	}
	result.ready.Store(true)
	return result
}

func (m *serviceMetrics) observeRequest(method, route string, status int, duration time.Duration) {
	if m == nil {
		return
	}
	if route == "" {
		route = "unmatched"
	}
	key := routeMetricKey{method: method, route: route}
	seconds := duration.Seconds()
	m.mu.Lock()
	metric := m.routes[key]
	if metric == nil {
		metric = &routeMetric{}
		m.routes[key] = metric
	}
	metric.count++
	metric.sum += seconds
	for index, upperBound := range httpDurationBuckets {
		if seconds <= upperBound {
			metric.buckets[index]++
			break
		}
	}
	m.statuses[statusMetricKey{method: method, route: route, status: status}]++
	m.mu.Unlock()
}

func (m *serviceMetrics) handler(server *Server) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		m.writeHTTPMetrics(w)
		m.writeRuntimeMetrics(w)
		m.writeDependencyMetrics(r.Context(), w, server)
	})
}

func (m *serviceMetrics) writeHTTPMetrics(w http.ResponseWriter) {
	fmt.Fprintln(w, "# HELP colmapro_http_requests_active Requests currently being processed.")
	fmt.Fprintln(w, "# TYPE colmapro_http_requests_active gauge")
	fmt.Fprintf(w, "colmapro_http_requests_active %d\n", m.activeRequests.Load())
	fmt.Fprintln(w, "# HELP colmapro_http_request_body_rejected_total Request bodies rejected because they exceeded the configured limit.")
	fmt.Fprintln(w, "# TYPE colmapro_http_request_body_rejected_total counter")
	fmt.Fprintf(w, "colmapro_http_request_body_rejected_total %d\n", m.bodyRejected.Load())
	fmt.Fprintln(w, "# HELP colmapro_http_rate_limited_total Requests rejected by rate limiting.")
	fmt.Fprintln(w, "# TYPE colmapro_http_rate_limited_total counter")
	fmt.Fprintf(w, "colmapro_http_rate_limited_total %d\n", m.rateLimited.Load())

	m.mu.RLock()
	routeKeys := make([]routeMetricKey, 0, len(m.routes))
	for key := range m.routes {
		routeKeys = append(routeKeys, key)
	}
	sort.Slice(routeKeys, func(i, j int) bool {
		if routeKeys[i].route == routeKeys[j].route {
			return routeKeys[i].method < routeKeys[j].method
		}
		return routeKeys[i].route < routeKeys[j].route
	})

	fmt.Fprintln(w, "# HELP colmapro_http_request_duration_seconds HTTP request duration histogram.")
	fmt.Fprintln(w, "# TYPE colmapro_http_request_duration_seconds histogram")
	fmt.Fprintln(w, "# HELP colmapro_http_request_duration_quantile_seconds Approximate p50, p95 and p99 request latency from bounded histogram buckets.")
	fmt.Fprintln(w, "# TYPE colmapro_http_request_duration_quantile_seconds gauge")
	for _, key := range routeKeys {
		metric := m.routes[key]
		labels := fmt.Sprintf("method=%q,route=%q", escapeMetricLabel(key.method), escapeMetricLabel(key.route))
		cumulative := uint64(0)
		for index, upperBound := range httpDurationBuckets {
			cumulative += metric.buckets[index]
			fmt.Fprintf(w, "colmapro_http_request_duration_seconds_bucket{%s,le=%q} %d\n", labels, strconv.FormatFloat(upperBound, 'f', -1, 64), cumulative)
		}
		fmt.Fprintf(w, "colmapro_http_request_duration_seconds_bucket{%s,le=\"+Inf\"} %d\n", labels, metric.count)
		fmt.Fprintf(w, "colmapro_http_request_duration_seconds_sum{%s} %g\n", labels, metric.sum)
		fmt.Fprintf(w, "colmapro_http_request_duration_seconds_count{%s} %d\n", labels, metric.count)
		for _, quantile := range []float64{0.5, 0.95, 0.99} {
			fmt.Fprintf(w, "colmapro_http_request_duration_quantile_seconds{%s,quantile=%q} %g\n", labels, strconv.FormatFloat(quantile, 'f', 2, 64), approximateQuantile(metric, quantile))
		}
	}

	statusKeys := make([]statusMetricKey, 0, len(m.statuses))
	for key := range m.statuses {
		statusKeys = append(statusKeys, key)
	}
	sort.Slice(statusKeys, func(i, j int) bool {
		if statusKeys[i].route != statusKeys[j].route {
			return statusKeys[i].route < statusKeys[j].route
		}
		if statusKeys[i].method != statusKeys[j].method {
			return statusKeys[i].method < statusKeys[j].method
		}
		return statusKeys[i].status < statusKeys[j].status
	})
	fmt.Fprintln(w, "# HELP colmapro_http_responses_total HTTP responses by route and status.")
	fmt.Fprintln(w, "# TYPE colmapro_http_responses_total counter")
	for _, key := range statusKeys {
		fmt.Fprintf(w, "colmapro_http_responses_total{method=%q,route=%q,status=%q} %d\n", escapeMetricLabel(key.method), escapeMetricLabel(key.route), strconv.Itoa(key.status), m.statuses[key])
	}
	m.mu.RUnlock()
}

func approximateQuantile(metric *routeMetric, quantile float64) float64 {
	if metric == nil || metric.count == 0 {
		return 0
	}
	target := uint64(float64(metric.count-1)*quantile) + 1
	cumulative := uint64(0)
	for index, count := range metric.buckets {
		cumulative += count
		if cumulative >= target {
			return httpDurationBuckets[index]
		}
	}
	return httpDurationBuckets[len(httpDurationBuckets)-1]
}

func (m *serviceMetrics) writeRuntimeMetrics(w http.ResponseWriter) {
	samples := []metrics.Sample{
		{Name: "/sched/goroutines:goroutines"},
		{Name: "/sched/gomaxprocs:threads"},
		{Name: "/gc/gomemlimit:bytes"},
		{Name: "/gc/heap/live:bytes"},
		{Name: "/gc/heap/objects:objects"},
		{Name: "/gc/cycles/total:gc-cycles"},
		{Name: "/gc/heap/allocs:bytes"},
		{Name: "/gc/heap/frees:bytes"},
		{Name: "/memory/classes/heap/released:bytes"},
		{Name: "/cpu/classes/gc/total:cpu-seconds"},
		{Name: "/cpu/classes/gc/pause:cpu-seconds"},
	}
	metrics.Read(samples)
	fmt.Fprintln(w, "# HELP colmapro_go_runtime_value Go runtime metric exposed through runtime/metrics.")
	fmt.Fprintln(w, "# TYPE colmapro_go_runtime_value gauge")
	for _, sample := range samples {
		name := escapeMetricLabel(sample.Name)
		switch sample.Value.Kind() {
		case metrics.KindUint64:
			fmt.Fprintf(w, "colmapro_go_runtime_value{name=%q} %d\n", name, sample.Value.Uint64())
		case metrics.KindFloat64:
			fmt.Fprintf(w, "colmapro_go_runtime_value{name=%q} %g\n", name, sample.Value.Float64())
		}
	}
	fmt.Fprintln(w, "# HELP colmapro_ready Whether the instance currently accepts traffic.")
	fmt.Fprintln(w, "# TYPE colmapro_ready gauge")
	if m.ready.Load() {
		fmt.Fprintln(w, "colmapro_ready 1")
	} else {
		fmt.Fprintln(w, "colmapro_ready 0")
	}
}

type poolStatsProvider interface {
	Stat() *pgxpool.Stat
}

func (m *serviceMetrics) writeDependencyMetrics(ctx context.Context, w http.ResponseWriter, server *Server) {
	if server == nil {
		return
	}
	if server.tenantManager != nil {
		writePoolMetrics(w, "saas", server.tenantManager.CoreDB())
	}
	if pool, ok := server.globalCustomersDB.(poolStatsProvider); ok {
		writePoolMetrics(w, "global_customers", pool)
	}
	if server.tenantManager != nil {
		stats := server.tenantManager.PoolStats()
		fmt.Fprintf(w, "colmapro_tenant_pools_active %d\n", stats.ActivePools)
		fmt.Fprintf(w, "colmapro_tenant_pools_limit %d\n", stats.MaxPools)
		fmt.Fprintf(w, "colmapro_tenant_pool_connections{state=\"total\"} %d\n", stats.TotalConns)
		fmt.Fprintf(w, "colmapro_tenant_pool_connections{state=\"acquired\"} %d\n", stats.AcquiredConns)
		fmt.Fprintf(w, "colmapro_tenant_pool_connections{state=\"idle\"} %d\n", stats.IdleConns)
		fmt.Fprintf(w, "colmapro_tenant_pool_empty_acquire_total %d\n", stats.EmptyAcquireCount)
		fmt.Fprintf(w, "colmapro_tenant_pool_acquire_duration_seconds %g\n", stats.AcquireDuration.Seconds())
	}
	if server.redis != nil {
		stats := server.redis.PoolStats()
		fmt.Fprintf(w, "colmapro_redis_pool_connections{state=\"total\"} %d\n", stats.TotalConns)
		fmt.Fprintf(w, "colmapro_redis_pool_connections{state=\"idle\"} %d\n", stats.IdleConns)
		fmt.Fprintf(w, "colmapro_redis_pool_hits_total %d\n", stats.Hits)
		fmt.Fprintf(w, "colmapro_redis_pool_misses_total %d\n", stats.Misses)
		fmt.Fprintf(w, "colmapro_redis_pool_stale_total %d\n", stats.StaleConns)
		redisTimeout := server.cfg.RedisOperationTimeout
		if redisTimeout <= 0 {
			redisTimeout = 300 * time.Millisecond
		}
		redisContext, cancel := context.WithTimeout(ctx, redisTimeout)
		startedAt := time.Now()
		info, err := server.redis.Info(redisContext, "memory", "stats").Result()
		cancel()
		m.observeRedis(startedAt, err)
		if err == nil {
			fmt.Fprintf(w, "colmapro_redis_memory_used_bytes %d\n", redisInfoUint(info, "used_memory"))
			fmt.Fprintf(w, "colmapro_redis_evicted_keys_total %d\n", redisInfoUint(info, "evicted_keys"))
		}
	}
	redisOperations := m.redisOperations.Load()
	fmt.Fprintf(w, "colmapro_redis_operations_total %d\n", redisOperations)
	fmt.Fprintf(w, "colmapro_redis_operation_errors_total %d\n", m.redisErrors.Load())
	fmt.Fprintf(w, "colmapro_redis_operation_timeouts_total %d\n", m.redisTimeouts.Load())
	fmt.Fprintf(w, "colmapro_cache_requests_total{result=\"hit\"} %d\n", m.cacheHits.Load())
	fmt.Fprintf(w, "colmapro_cache_requests_total{result=\"miss\"} %d\n", m.cacheMisses.Load())
	if redisOperations > 0 {
		fmt.Fprintf(w, "colmapro_redis_operation_duration_seconds_average %g\n", time.Duration(m.redisNanos.Load()/redisOperations).Seconds())
	} else {
		fmt.Fprintln(w, "colmapro_redis_operation_duration_seconds_average 0")
	}
	if server.events != nil {
		stats := server.events.Stats()
		fmt.Fprintf(w, "colmapro_sse_connections_active %d\n", stats.ActiveConnections)
		fmt.Fprintf(w, "colmapro_sse_events_published_total %d\n", stats.PublishedEvents)
		fmt.Fprintf(w, "colmapro_sse_events_dropped_total %d\n", stats.DroppedEvents)
		fmt.Fprintf(w, "colmapro_sse_slow_clients_total %d\n", stats.SlowClients)
		fmt.Fprintf(w, "colmapro_sse_reconnections_total %d\n", stats.Reconnections)
	}
	queryStats := database.QueryMetrics()
	fmt.Fprintf(w, "colmapro_postgres_queries_total %d\n", queryStats.TotalQueries)
	fmt.Fprintf(w, "colmapro_postgres_query_errors_total %d\n", queryStats.FailedQueries)
	fmt.Fprintf(w, "colmapro_postgres_slow_queries_total %d\n", queryStats.SlowQueries)
	fmt.Fprintf(w, "colmapro_postgres_query_duration_seconds_total %g\n", queryStats.TotalDuration.Seconds())
	fmt.Fprintf(w, "colmapro_business_orders_total{result=\"created\"} %d\n", m.ordersCreated.Load())
	fmt.Fprintf(w, "colmapro_business_orders_total{result=\"replayed\"} %d\n", m.ordersReplayed.Load())
	fmt.Fprintf(w, "colmapro_business_orders_total{result=\"failed\"} %d\n", m.ordersFailed.Load())
	fmt.Fprintf(w, "colmapro_business_tenant_provisioning_total{result=\"created\"} %d\n", m.tenantsCreated.Load())
	fmt.Fprintf(w, "colmapro_business_tenant_provisioning_total{result=\"failed\"} %d\n", m.tenantsFailed.Load())
}

func (m *serviceMetrics) observeRedis(startedAt time.Time, err error) {
	if m == nil {
		return
	}
	m.redisOperations.Add(1)
	m.redisNanos.Add(uint64(time.Since(startedAt)))
	if err != nil {
		m.redisErrors.Add(1)
		if errors.Is(err, context.DeadlineExceeded) {
			m.redisTimeouts.Add(1)
		}
	}
}

func redisInfoUint(info, key string) uint64 {
	prefix := key + ":"
	for _, line := range strings.Split(info, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, prefix) {
			continue
		}
		value, _ := strconv.ParseUint(strings.TrimSpace(strings.TrimPrefix(line, prefix)), 10, 64)
		return value
	}
	return 0
}

func writePoolMetrics(w http.ResponseWriter, poolName string, provider poolStatsProvider) {
	if provider == nil {
		return
	}
	stats := provider.Stat()
	labels := fmt.Sprintf("pool=%q", escapeMetricLabel(poolName))
	fmt.Fprintf(w, "colmapro_postgres_pool_connections{%s,state=\"total\"} %d\n", labels, stats.TotalConns())
	fmt.Fprintf(w, "colmapro_postgres_pool_connections{%s,state=\"acquired\"} %d\n", labels, stats.AcquiredConns())
	fmt.Fprintf(w, "colmapro_postgres_pool_connections{%s,state=\"idle\"} %d\n", labels, stats.IdleConns())
	fmt.Fprintf(w, "colmapro_postgres_pool_empty_acquire_total{%s} %d\n", labels, stats.EmptyAcquireCount())
	fmt.Fprintf(w, "colmapro_postgres_pool_acquire_duration_seconds{%s} %g\n", labels, stats.AcquireDuration().Seconds())
}

func escapeMetricLabel(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, "\n", `\n`)
	return strings.ReplaceAll(value, `"`, `\"`)
}
