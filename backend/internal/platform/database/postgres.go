package database

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PoolOptions struct {
	MinConns          int32
	MaxConns          int32
	MaxConnLifetime   time.Duration
	MaxConnIdleTime   time.Duration
	HealthCheckPeriod time.Duration
	StatementTimeout  time.Duration
	LockTimeout       time.Duration
	IdleInTxTimeout   time.Duration
}

type QueryMetricsSnapshot struct {
	TotalQueries  uint64
	FailedQueries uint64
	SlowQueries   uint64
	TotalDuration time.Duration
}

type queryMetrics struct {
	totalQueries  atomic.Uint64
	failedQueries atomic.Uint64
	slowQueries   atomic.Uint64
	totalNanos    atomic.Uint64
}

var postgresQueryMetrics queryMetrics

type queryTraceContextKey struct{}

type queryTraceStart struct {
	startedAt   time.Time
	operation   string
	fingerprint string
}

type queryTracer struct {
	slowThreshold time.Duration
}

func (t queryTracer) TraceQueryStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	query := strings.TrimSpace(data.SQL)
	operation := "UNKNOWN"
	if fields := strings.Fields(query); len(fields) > 0 {
		operation = strings.ToUpper(fields[0])
	}
	digest := sha256.Sum256([]byte(query))
	return context.WithValue(ctx, queryTraceContextKey{}, queryTraceStart{
		startedAt:   time.Now(),
		operation:   operation,
		fingerprint: hex.EncodeToString(digest[:6]),
	})
}

func (t queryTracer) TraceQueryEnd(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryEndData) {
	trace, ok := ctx.Value(queryTraceContextKey{}).(queryTraceStart)
	if !ok {
		return
	}
	duration := time.Since(trace.startedAt)
	postgresQueryMetrics.totalQueries.Add(1)
	postgresQueryMetrics.totalNanos.Add(uint64(duration))
	if data.Err != nil {
		postgresQueryMetrics.failedQueries.Add(1)
	}
	if duration >= t.slowThreshold {
		postgresQueryMetrics.slowQueries.Add(1)
		slog.WarnContext(ctx, "slow postgres query",
			"operation", trace.operation,
			"query_fingerprint", trace.fingerprint,
			"duration_ms", duration.Milliseconds(),
			"error", data.Err,
		)
	}
}

func QueryMetrics() QueryMetricsSnapshot {
	return QueryMetricsSnapshot{
		TotalQueries:  postgresQueryMetrics.totalQueries.Load(),
		FailedQueries: postgresQueryMetrics.failedQueries.Load(),
		SlowQueries:   postgresQueryMetrics.slowQueries.Load(),
		TotalDuration: time.Duration(postgresQueryMetrics.totalNanos.Load()),
	}
}

func Connect(ctx context.Context, databaseURL string, opts ...PoolOptions) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}

	poolOptions := defaultPoolOptions()
	if len(opts) > 0 {
		poolOptions = normalizePoolOptions(opts[0])
	}

	cfg.MinConns = poolOptions.MinConns
	cfg.MaxConns = poolOptions.MaxConns
	cfg.MaxConnLifetime = poolOptions.MaxConnLifetime
	cfg.MaxConnIdleTime = poolOptions.MaxConnIdleTime
	cfg.HealthCheckPeriod = poolOptions.HealthCheckPeriod
	cfg.ConnConfig.Tracer = queryTracer{slowThreshold: envDuration("DB_SLOW_QUERY_THRESHOLD", 500*time.Millisecond)}
	// PgBouncer transaction pooling rejects arbitrary PostgreSQL startup
	// parameters. Direct pools can safely apply these session safeguards.
	if !strings.Contains(databaseURL, "default_query_exec_mode=simple_protocol") {
		if cfg.ConnConfig.RuntimeParams == nil {
			cfg.ConnConfig.RuntimeParams = make(map[string]string)
		}
		setRuntimeDuration(cfg.ConnConfig.RuntimeParams, "statement_timeout", poolOptions.StatementTimeout)
		setRuntimeDuration(cfg.ConnConfig.RuntimeParams, "lock_timeout", poolOptions.LockTimeout)
		setRuntimeDuration(cfg.ConnConfig.RuntimeParams, "idle_in_transaction_session_timeout", poolOptions.IdleInTxTimeout)
	}

	connectTimeout := envDuration("DB_CONNECT_TIMEOUT", 5*time.Second)
	connectContext, cancel := context.WithTimeout(ctx, connectTimeout)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(connectContext, cfg)
	if err != nil {
		return nil, fmt.Errorf("create pgx pool: %w", err)
	}
	if err := pool.Ping(connectContext); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return pool, nil
}

func EnvPoolOptions(prefix string, fallbackMin int32, fallbackMax int32) PoolOptions {
	return PoolOptions{
		MinConns:          int32(envInt(prefix+"_MIN_CONNS", int(fallbackMin))),
		MaxConns:          int32(envInt(prefix+"_MAX_CONNS", int(fallbackMax))),
		MaxConnLifetime:   envDuration(prefix+"_MAX_LIFETIME", 30*time.Minute),
		MaxConnIdleTime:   envDuration(prefix+"_MAX_IDLE_TIME", 5*time.Minute),
		HealthCheckPeriod: time.Minute,
		StatementTimeout:  envDuration(prefix+"_STATEMENT_TIMEOUT", 30*time.Second),
		LockTimeout:       envDuration(prefix+"_LOCK_TIMEOUT", 5*time.Second),
		IdleInTxTimeout:   envDuration(prefix+"_IDLE_IN_TRANSACTION_TIMEOUT", 15*time.Second),
	}
}

func defaultPoolOptions() PoolOptions {
	return EnvPoolOptions("DB", 1, 10)
}

func normalizePoolOptions(opts PoolOptions) PoolOptions {
	if opts.MaxConns <= 0 {
		opts.MaxConns = 10
	}
	if opts.MinConns < 0 {
		opts.MinConns = 0
	}
	if opts.MinConns > opts.MaxConns {
		opts.MinConns = opts.MaxConns
	}
	if opts.MaxConnLifetime <= 0 {
		opts.MaxConnLifetime = 30 * time.Minute
	}
	if opts.MaxConnIdleTime <= 0 {
		opts.MaxConnIdleTime = 5 * time.Minute
	}
	if opts.HealthCheckPeriod <= 0 {
		opts.HealthCheckPeriod = time.Minute
	}
	if opts.StatementTimeout <= 0 {
		opts.StatementTimeout = 30 * time.Second
	}
	if opts.LockTimeout <= 0 {
		opts.LockTimeout = 5 * time.Second
	}
	if opts.IdleInTxTimeout <= 0 {
		opts.IdleInTxTimeout = 15 * time.Second
	}
	return opts
}

func setRuntimeDuration(runtimeParams map[string]string, key string, duration time.Duration) {
	if duration <= 0 {
		return
	}
	milliseconds := duration.Milliseconds()
	if milliseconds < 1 {
		milliseconds = 1
	}
	runtimeParams[key] = strconv.FormatInt(milliseconds, 10)
}

func envInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func envDuration(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}
	return parsed
}
