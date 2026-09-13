package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/http/pprof"
	"os"
	"os/signal"
	"runtime"
	"sync"
	"syscall"
	"time"

	"colmapro/backend/internal/config"
	"colmapro/backend/internal/httpapi"
	"colmapro/backend/internal/platform/cache"
	"colmapro/backend/internal/platform/database"
	"colmapro/backend/internal/platform/tenancy"
)

var (
	version   = "development"
	commit    = "unknown"
	buildTime = "unknown"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{})))
	if err := run(); err != nil {
		slog.Error("application stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg := config.Load()
	if !isPrivateListenerAddress(cfg.InternalAddr) {
		return fmt.Errorf("INTERNAL_ADDR must bind to a loopback address, got %q", cfg.InternalAddr)
	}
	if location, err := time.LoadLocation(cfg.AppTimezone); err == nil {
		time.Local = location
	} else {
		slog.Warn("timezone could not be loaded", "timezone", cfg.AppTimezone, "error", err)
	}

	slog.Info("application starting",
		"app", cfg.AppName,
		"environment", cfg.AppEnv,
		"version", version,
		"commit", commit,
		"build_time", buildTime,
		"go_version", runtime.Version(),
		"gomaxprocs", runtime.GOMAXPROCS(0),
		"cpu_count", runtime.NumCPU(),
		"gomemlimit", os.Getenv("GOMEMLIMIT"),
		"gogc", os.Getenv("GOGC"),
	)

	signalContext, stopSignals := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stopSignals()
	appContext, cancelApp := context.WithCancel(signalContext)
	defer cancelApp()

	if cfg.RunMigrations {
		if err := prepareDatabase(appContext, cfg.DatabaseMigrationTimeout, cfg.CentralDatabaseURL, cfg.CoreMigrationsPath); err != nil {
			return fmt.Errorf("prepare central database: %w", err)
		}
		slog.Info("core migrations applied")
	}

	corePool, err := database.Connect(appContext, cfg.CentralDatabaseURL, database.EnvPoolOptions("CENTRAL_DB", 1, 8))
	if err != nil {
		return fmt.Errorf("central postgres: %w", err)
	}
	defer corePool.Close()

	// Keep the platform usable even when an existing deployment skipped the
	// identity migration or recorded its version without creating the columns.
	// This repair is idempotent and runs before any owner query can execute.
	if err := database.EnsurePlatformOwnerIdentitySchema(appContext, corePool); err != nil {
		return fmt.Errorf("ensure platform owner identity schema: %w", err)
	}

	if cfg.RunMigrations {
		if err := prepareDatabase(appContext, cfg.DatabaseMigrationTimeout, cfg.GlobalCustomersDatabaseURL, cfg.GlobalCustomerMigrationsPath); err != nil {
			return fmt.Errorf("prepare global customers database: %w", err)
		}
		slog.Info("global customer migrations applied")
	}

	globalCustomersPool, err := database.Connect(appContext, cfg.GlobalCustomersDatabaseURL, database.EnvPoolOptions("GLOBAL_CUSTOMERS_DB", 1, 8))
	if err != nil {
		return fmt.Errorf("global customers postgres: %w", err)
	}
	defer globalCustomersPool.Close()

	if err := database.SyncExistingGlobalCustomers(appContext, corePool, globalCustomersPool); err != nil {
		slog.Warn("global customer synchronization failed", "error", err)
	}

	tenantManager := tenancy.NewManager(cfg, corePool)
	tenantManager.StartPoolCleaner(appContext)
	defer tenantManager.Close()

	if err := tenantManager.RepairGeneratedSubdomains(appContext); err != nil {
		slog.Warn("tenant subdomain synchronization failed", "error", err)
	}
	repairContext, cancelRepair := context.WithTimeout(appContext, positiveDuration(cfg.DatabaseMigrationTimeout, 15*time.Minute))
	if err := tenantManager.RepairGeneratedDatabaseNames(repairContext); err != nil {
		slog.Warn("tenant database naming synchronization failed", "error", err)
	}
	cancelRepair()
	if err := tenantManager.EnsureProvisioningAuditBackfill(appContext); err != nil {
		slog.Warn("tenant audit backfill failed", "error", err)
	}

	redisClient, err := cache.Connect(appContext, cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB, cache.Options{
		PoolSize:     cfg.RedisPoolSize,
		MinIdleConns: cfg.RedisMinIdleConns,
		DialTimeout:  cfg.RedisDialTimeout,
		ReadTimeout:  cfg.RedisReadTimeout,
		WriteTimeout: cfg.RedisWriteTimeout,
	})
	if err != nil {
		slog.Warn("redis unavailable; cache and cross-replica realtime events are degraded", "error", err)
		redisClient = nil
	} else {
		defer redisClient.Close()
	}

	databaseRouter := tenancy.NewDBRouter(corePool)
	api := httpapi.NewServer(cfg, databaseRouter, redisClient, tenantManager, globalCustomersPool)
	api.StartRealtime(appContext)
	api.StartBusinessWorkers(appContext)
	defer api.StopRealtime()
	defer api.StopBusinessWorkers()

	// Streaming endpoints enforce their own per-write deadline. A server-wide
	// WriteTimeout would terminate healthy SSE connections at a fixed age.
	publicWriteTimeout := cfg.HTTPWriteTimeout
	if cfg.EnableRealtimeEvents {
		publicWriteTimeout = 0
	}
	publicServer := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           api.Routes(),
		ReadHeaderTimeout: cfg.HTTPReadHeaderTimeout,
		ReadTimeout:       cfg.HTTPReadTimeout,
		WriteTimeout:      publicWriteTimeout,
		IdleTimeout:       cfg.HTTPIdleTimeout,
		MaxHeaderBytes:    cfg.HTTPMaxHeaderBytes,
	}

	internalMux := http.NewServeMux()
	internalMux.Handle("/metrics", api.MetricsHandler())
	internalMux.HandleFunc("/debug/pprof/", pprof.Index)
	internalMux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
	internalMux.HandleFunc("/debug/pprof/profile", pprof.Profile)
	internalMux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
	internalMux.HandleFunc("/debug/pprof/trace", pprof.Trace)
	for _, profile := range []string{"allocs", "block", "goroutine", "heap", "mutex", "threadcreate"} {
		internalMux.Handle("/debug/pprof/"+profile, pprof.Handler(profile))
	}
	internalServer := &http.Server{
		Addr:              cfg.InternalAddr,
		Handler:           internalMux,
		ReadHeaderTimeout: cfg.HTTPReadHeaderTimeout,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      45 * time.Second,
		IdleTimeout:       cfg.HTTPIdleTimeout,
		MaxHeaderBytes:    cfg.HTTPMaxHeaderBytes,
	}

	serverErrors := make(chan error, 2)
	var serverWG sync.WaitGroup
	serve := func(name string, server *http.Server) {
		serverWG.Add(1)
		go func() {
			defer serverWG.Done()
			slog.Info("http server listening", "server", name, "address", server.Addr)
			if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				serverErrors <- fmt.Errorf("%s server: %w", name, err)
			}
		}()
	}
	serve("public", publicServer)
	serve("internal", internalServer)

	var serveError error
	select {
	case <-signalContext.Done():
		slog.Info("shutdown signal received")
	case serveError = <-serverErrors:
		slog.Error("http server failed", "error", serveError)
	}

	api.SetReady(false)
	cancelApp()
	api.StopBusinessWorkers()
	api.StopRealtime()
	shutdownTimeout := cfg.HTTPShutdownTimeout
	if shutdownTimeout <= 0 {
		shutdownTimeout = 30 * time.Second
	}
	shutdownContext, cancelShutdown := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancelShutdown()
	if err := publicServer.Shutdown(shutdownContext); err != nil {
		_ = publicServer.Close()
		if serveError == nil {
			serveError = fmt.Errorf("public server shutdown: %w", err)
		}
	}
	if err := internalServer.Shutdown(shutdownContext); err != nil {
		_ = internalServer.Close()
		if serveError == nil {
			serveError = fmt.Errorf("internal server shutdown: %w", err)
		}
	}
	serverWG.Wait()
	slog.Info("application shutdown complete")
	return serveError
}

func prepareDatabase(ctx context.Context, timeout time.Duration, databaseURL, migrationsPath string) error {
	operationContext, cancel := context.WithTimeout(ctx, positiveDuration(timeout, 15*time.Minute))
	defer cancel()
	if err := database.EnsureDatabaseForURL(operationContext, databaseURL); err != nil {
		return fmt.Errorf("ensure database: %w", err)
	}
	if err := database.RunMigrations(operationContext, migrationsPath, databaseURL); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}
	return nil
}

func positiveDuration(value, fallback time.Duration) time.Duration {
	if value > 0 {
		return value
	}
	return fallback
}

func isPrivateListenerAddress(address string) bool {
	host, _, err := net.SplitHostPort(address)
	if err != nil || host == "" {
		return false
	}
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
