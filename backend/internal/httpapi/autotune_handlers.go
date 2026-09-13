package httpapi

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
)

func (s *Server) runtimeConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"bootstrapRefetchMs":     positiveInt(s.cfg.BootstrapRefetchMS, 30000),
		"clientSessionRefreshMs": positiveInt(s.cfg.ClientSessionRefreshMS, 30000),
		"clientCartPullMs":       positiveInt(s.cfg.ClientCartPullMS, 15000),
		"enableRealtimeEvents":   s.cfg.EnableRealtimeEvents,
	})
}

func (s *Server) platformCapacity(w http.ResponseWriter, r *http.Request) {
	poolStats := map[string]any{
		"activeTenantPools":    0,
		"maxActiveTenantPools": s.cfg.MaxActiveTenantPools,
		"tenantMaxConns":       s.cfg.TenantDBMaxConns,
		"tenantMinConns":       s.cfg.TenantDBMinConns,
		"tenantPoolTtlMinutes": s.cfg.TenantPoolTTLMinutes,
	}
	if s.tenantManager != nil {
		stats := s.tenantManager.PoolStats()
		poolStats = map[string]any{
			"activeTenantPools":    stats.ActivePools,
			"maxActiveTenantPools": stats.MaxPools,
			"tenantMaxConns":       stats.TenantMaxConns,
			"tenantMinConns":       stats.TenantMinConns,
			"tenantPoolTtlMinutes": stats.TTLMinutes,
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"autoTuneEnabled":               s.cfg.AutoTuneEnabled,
		"cpuCores":                      firstPositive(s.cfg.AutoTuneCPUCores, runtime.NumCPU()),
		"ramMb":                         firstPositive(s.cfg.AutoTuneRAMMB, detectedRAMMB()),
		"ramGb":                         firstPositive(s.cfg.AutoTuneRAMGB, detectedRAMMB()/1024),
		"diskGb":                        firstPositive(s.cfg.AutoTuneDiskGB, detectedDiskGB(".")),
		"goMaxProcs":                    runtime.GOMAXPROCS(0),
		"postgresMaxConnections":        s.cfg.PGMaxConnections,
		"postgresSharedBuffers":         s.cfg.PGSharedBuffers,
		"postgresEffectiveCacheSize":    s.cfg.PGEffectiveCacheSize,
		"postgresWorkMem":               s.cfg.PGWorkMem,
		"postgresMaintenanceWorkMem":    s.cfg.PGMaintenanceWorkMem,
		"centralDbMaxConns":             s.cfg.CentralDBMaxConns,
		"globalCustomersDbMaxConns":     s.cfg.GlobalCustomersDBMaxConns,
		"redisMaxMemory":                s.cfg.RedisMaxMemory,
		"redisMaxMemoryPolicy":          s.cfg.RedisMaxMemoryPolicy,
		"bootstrapRefetchMs":            positiveInt(s.cfg.BootstrapRefetchMS, 30000),
		"clientSessionRefreshMs":        positiveInt(s.cfg.ClientSessionRefreshMS, 30000),
		"cartPullMs":                    positiveInt(s.cfg.ClientCartPullMS, 15000),
		"maxRequestsPerMinutePerTenant": s.cfg.MaxRequestsPerMinuteTenant,
		"maxRequestsPerMinutePerIp":     s.cfg.MaxRequestsPerMinuteIP,
		"pgBouncerEnabled":              s.cfg.UsePgBouncer,
		"pgBouncerAddr":                 s.cfg.PgBouncerAddr,
		"tenantPools":                   poolStats,
	})
}

func positiveInt(value, fallback int) int {
	if value > 0 {
		return value
	}
	return fallback
}

func firstPositive(values ...int) int {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}

func detectedRAMMB() int {
	file, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "MemTotal:") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			return 0
		}
		kb, err := strconv.Atoi(fields[1])
		if err != nil {
			return 0
		}
		return kb / 1024
	}
	return 0
}

func detectedDiskGB(path string) int {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0
	}
	return int((stat.Blocks * uint64(stat.Bsize)) / 1024 / 1024 / 1024)
}

func (s *Server) bootstrapCacheKey(ctx context.Context, storeID string) string {
	tenantID := tenantIDFromContext(ctx)
	if tenantID == "" || strings.TrimSpace(storeID) == "" {
		return ""
	}
	return "wamercio:tenant:" + tenantID + ":bootstrap:" + strings.TrimSpace(storeID)
}

func (s *Server) redisOperationContext(parent context.Context) (context.Context, context.CancelFunc) {
	timeout := s.cfg.RedisOperationTimeout
	if timeout <= 0 {
		timeout = 300 * time.Millisecond
	}
	return context.WithTimeout(parent, timeout)
}

func (s *Server) writeCachedBootstrap(ctx context.Context, w http.ResponseWriter, storeID string) bool {
	if s.redis == nil {
		return false
	}
	key := s.bootstrapCacheKey(ctx, storeID)
	if key == "" {
		return false
	}
	redisContext, cancel := s.redisOperationContext(ctx)
	defer cancel()
	startedAt := time.Now()
	data, err := s.redis.Get(redisContext, key).Bytes()
	if s.metrics != nil {
		metricsError := err
		if errors.Is(err, redis.Nil) {
			metricsError = nil
		}
		s.metrics.observeRedis(startedAt, metricsError)
	}
	if err != nil || len(data) == 0 {
		if s.metrics != nil {
			s.metrics.cacheMisses.Add(1)
		}
		return false
	}
	if s.metrics != nil {
		s.metrics.cacheHits.Add(1)
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-WAMERCIO-Cache", "HIT")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
	return true
}

func (s *Server) writeJSONWithBootstrapCache(ctx context.Context, w http.ResponseWriter, storeID string, payload any) {
	data, err := json.Marshal(payload)
	if err == nil && s.redis != nil {
		key := s.bootstrapCacheKey(ctx, storeID)
		if key != "" {
			ttl := time.Duration(positiveInt(s.cfg.BootstrapRefetchMS, 30000)*2) * time.Millisecond
			if ttl < 30*time.Second {
				ttl = 30 * time.Second
			}
			redisContext, cancel := s.redisOperationContext(ctx)
			startedAt := time.Now()
			redisErr := s.redis.Set(redisContext, key, data, ttl).Err()
			cancel()
			if s.metrics != nil {
				s.metrics.observeRedis(startedAt, redisErr)
			}
		}
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-WAMERCIO-Cache", "MISS")
	w.WriteHeader(http.StatusOK)
	if data != nil {
		_, _ = w.Write(append(data, '\n'))
		return
	}
	_ = json.NewEncoder(w).Encode(payload)
}

func (s *Server) invalidateTenantCache(ctx context.Context) {
	if s.redis == nil {
		return
	}
	tenantID := tenantIDFromContext(ctx)
	if tenantID == "" {
		return
	}
	redisContext, cancel := s.redisOperationContext(ctx)
	defer cancel()
	startedAt := time.Now()
	pattern := "wamercio:tenant:" + tenantID + ":*"
	iter := s.redis.Scan(redisContext, 0, pattern, 100).Iterator()
	keys := []string{}
	for iter.Next(redisContext) {
		keys = append(keys, iter.Val())
		if len(keys) >= 100 {
			_ = s.redis.Del(redisContext, keys...).Err()
			keys = keys[:0]
		}
	}
	if len(keys) > 0 {
		_ = s.redis.Del(redisContext, keys...).Err()
	}
	if err := iter.Err(); err != nil && err != redis.Nil {
		if s.metrics != nil {
			s.metrics.observeRedis(startedAt, err)
		}
		return
	}
	if s.metrics != nil {
		s.metrics.observeRedis(startedAt, nil)
	}
}
