package config

import (
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppEnv                           string
	AppName                          string
	AppDomain                        string
	HTTPAddr                         string
	InternalAddr                     string
	HTTPReadHeaderTimeout            time.Duration
	HTTPReadTimeout                  time.Duration
	HTTPWriteTimeout                 time.Duration
	HTTPIdleTimeout                  time.Duration
	HTTPShutdownTimeout              time.Duration
	HTTPRequestTimeout               time.Duration
	HTTPExternalRequestTimeout       time.Duration
	HTTPProvisioningRequestTimeout   time.Duration
	DatabaseMigrationTimeout         time.Duration
	HTTPMaxHeaderBytes               int
	HTTPMaxJSONBodyBytes             int64
	CentralDatabaseURL               string
	GlobalCustomersDatabaseName      string
	GlobalCustomersDatabaseURL       string
	TenantDatabaseURLTemplate        string
	TenantDatabasePrefix             string
	RootDomain                       string
	DefaultTenantSlug                string
	DefaultTenantName                string
	DefaultTenantDomain              string
	RedisAddr                        string
	RedisPassword                    string
	RedisDB                          int
	CORSAllowedOrigins               []string
	RunMigrations                    bool
	CoreMigrationsPath               string
	GlobalCustomerMigrationsPath     string
	TenantMigrationsPath             string
	AdminUsername                    string
	AdminPasswordSHA256              string
	AdminTokenSecret                 string
	PlatformAdminSecret              string
	PlatformAdminUsername            string
	PlatformAdminPasswordSHA256      string
	PlatformTokenSecret              string
	AppTimezone                      string
	TerritoryDataDir                 string
	CatalogDataFile                  string
	CloudflareR2AccountID            string
	CloudflareR2Bucket               string
	CloudflareR2AccessKeyID          string
	CloudflareR2SecretAccessKey      string
	CloudflareR2Endpoint             string
	CloudflareR2PublicBaseURL        string
	AutoTuneEnabled                  bool
	AutoTuneCPUCores                 int
	AutoTuneRAMMB                    int
	AutoTuneRAMGB                    int
	AutoTuneDiskGB                   int
	PGMaxConnections                 int
	PGSharedBuffers                  string
	PGEffectiveCacheSize             string
	PGWorkMem                        string
	PGMaintenanceWorkMem             string
	CentralDBMinConns                int
	CentralDBMaxConns                int
	GlobalCustomersDBMinConns        int
	GlobalCustomersDBMaxConns        int
	TenantDBMinConns                 int
	TenantDBMaxConns                 int
	TenantDBMaxIdleTime              string
	TenantDBMaxLifetime              string
	TenantPoolTTLMinutes             int
	MaxActiveTenantPools             int
	RedisMaxMemory                   string
	RedisMaxMemoryPolicy             string
	BootstrapRefetchMS               int
	ClientSessionRefreshMS           int
	ClientCartPullMS                 int
	EnableRealtimeEvents             bool
	SSEHeartbeatInterval             time.Duration
	SSEWriteTimeout                  time.Duration
	SSEClientQueueSize               int
	SSEReplaySize                    int
	SSEReplayTenantLimit             int
	SSEMaxConnectionsTotal           int
	SSEMaxConnectionsPerTenant       int
	SSEMaxConnectionsPerClient       int
	SSERedisChannel                  string
	MaxRequestsPerMinuteTenant       int
	MaxRequestsPerMinuteIP           int
	MaxLoginAttemptsPerMinute        int
	AuthFailureLimit                 int
	AuthLockout                      time.Duration
	RedisPoolSize                    int
	RedisMinIdleConns                int
	RedisDialTimeout                 time.Duration
	RedisReadTimeout                 time.Duration
	RedisWriteTimeout                time.Duration
	RedisOperationTimeout            time.Duration
	R2HTTPTimeout                    time.Duration
	WaxumHTTPTimeout                 time.Duration
	IdentityAPIEnabled               bool
	IdentityAPIRequired              bool
	IdentityAPIURL                   string
	IdentityAPIKey                   string
	IdentityAPIClientID              string
	IdentityAPITimeout               time.Duration
	GeoRDMapEnabled                  bool
	GeoRDMapURL                      string
	GeoRDMapAPIKey                   string
	GeoRDMapTimeout                  time.Duration
	RoutingServiceURL                string
	RoutingHTTPTimeout               time.Duration
	OrderTransactionTimeout          time.Duration
	UsePgBouncer                     bool
	PgBouncerAddr                    string
	RuntimeTenantDatabaseURLTemplate string
}

func Load() Config {
	appEnv := strings.ToLower(getenv("APP_ENV", "development"))
	databaseHost := "localhost:5432"
	redisDefaultAddr := "localhost:6379"
	if isContainerProduction(appEnv) {
		databaseHost = "postgres:5432"
		redisDefaultAddr = "redis:6379"
	}

	centralURL := getenv("CENTRAL_DATABASE_URL", "postgres://colmapro:colmapro@"+databaseHost+"/colmapro_core?sslmode=disable")
	centralURL = normalizeProductionDatabaseHost(centralURL, appEnv, "postgres:5432")
	globalCustomerDBName := getenv("GLOBAL_CUSTOMERS_DATABASE_NAME", "colmapro_global_customers")
	globalCustomerURL := getenv("GLOBAL_CUSTOMERS_DATABASE_URL", databaseURLWithName(centralURL, globalCustomerDBName))
	globalCustomerURL = normalizeProductionDatabaseHost(globalCustomerURL, appEnv, "postgres:5432")
	tenantURLTemplate := getenv("TENANT_DATABASE_URL_TEMPLATE", "postgres://colmapro:colmapro@"+databaseHost+"/{{database}}?sslmode=disable")
	tenantURLTemplate = normalizeProductionDatabaseHost(tenantURLTemplate, appEnv, "postgres:5432")
	usePgBouncer := getenvBool("USE_PGBOUNCER", true)
	pgBouncerAddr := getenv("PGBOUNCER_ADDR", "pgbouncer:6432")
	runtimeTenantURLTemplate := getenv("RUNTIME_TENANT_DATABASE_URL_TEMPLATE", tenantURLTemplate)
	if usePgBouncer {
		runtimeTenantURLTemplate = databaseURLTemplateWithHost(runtimeTenantURLTemplate, pgBouncerAddr, true)
	}
	return Config{
		AppEnv:                           appEnv,
		AppName:                          getenv("APP_NAME", "WAMERCIO"),
		AppDomain:                        getenv("APP_DOMAIN", "wamercio.com"),
		HTTPAddr:                         getenv("HTTP_ADDR", ":8080"),
		InternalAddr:                     getenv("INTERNAL_ADDR", "127.0.0.1:6060"),
		HTTPReadHeaderTimeout:            getenvDuration("HTTP_READ_HEADER_TIMEOUT", 5*time.Second),
		HTTPReadTimeout:                  getenvDuration("HTTP_READ_TIMEOUT", 15*time.Second),
		HTTPWriteTimeout:                 getenvDuration("HTTP_WRITE_TIMEOUT", 60*time.Second),
		HTTPIdleTimeout:                  getenvDuration("HTTP_IDLE_TIMEOUT", 60*time.Second),
		HTTPShutdownTimeout:              getenvDuration("HTTP_SHUTDOWN_TIMEOUT", 30*time.Second),
		HTTPRequestTimeout:               getenvDuration("HTTP_REQUEST_TIMEOUT", 30*time.Second),
		HTTPExternalRequestTimeout:       getenvDuration("HTTP_EXTERNAL_REQUEST_TIMEOUT", 75*time.Second),
		HTTPProvisioningRequestTimeout:   getenvDuration("HTTP_PROVISIONING_REQUEST_TIMEOUT", 10*time.Minute),
		DatabaseMigrationTimeout:         getenvDuration("DATABASE_MIGRATION_TIMEOUT", 15*time.Minute),
		HTTPMaxHeaderBytes:               getenvInt("HTTP_MAX_HEADER_BYTES", 1<<20),
		HTTPMaxJSONBodyBytes:             getenvInt64("HTTP_MAX_JSON_BODY_BYTES", 2<<20),
		CentralDatabaseURL:               centralURL,
		GlobalCustomersDatabaseName:      globalCustomerDBName,
		GlobalCustomersDatabaseURL:       globalCustomerURL,
		TenantDatabaseURLTemplate:        tenantURLTemplate,
		TenantDatabasePrefix:             getenv("TENANT_DATABASE_PREFIX", "cp_"),
		RootDomain:                       strings.TrimPrefix(getenv("ROOT_DOMAIN", "ltd.do"), "*."),
		DefaultTenantSlug:                getenv("DEFAULT_TENANT_SLUG", ""),
		DefaultTenantName:                getenv("DEFAULT_TENANT_NAME", ""),
		DefaultTenantDomain:              getenv("DEFAULT_TENANT_DOMAIN", ""),
		RedisAddr:                        normalizeProductionServiceAddress(getenv("REDIS_ADDR", redisDefaultAddr), appEnv, "redis:6379"),
		RedisPassword:                    os.Getenv("REDIS_PASSWORD"),
		RedisDB:                          getenvInt("REDIS_DB", 0),
		CORSAllowedOrigins:               splitCSV(getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")),
		RunMigrations:                    getenvBool("RUN_MIGRATIONS", true),
		CoreMigrationsPath:               getenv("CORE_MIGRATIONS_PATH", "file://db/core_migrations"),
		GlobalCustomerMigrationsPath:     getenv("GLOBAL_CUSTOMER_MIGRATIONS_PATH", "file://db/global_customer_migrations"),
		TenantMigrationsPath:             getenv("TENANT_MIGRATIONS_PATH", "file://db/tenant_migrations"),
		AdminUsername:                    getenv("ADMIN_USERNAME", ""),
		AdminPasswordSHA256:              getenv("ADMIN_PASSWORD_SHA256", ""),
		AdminTokenSecret:                 getenv("ADMIN_TOKEN_SECRET", "colmapro-dev-secret-change-me"),
		PlatformAdminSecret:              getenv("PLATFORM_ADMIN_SECRET", getenv("ADMIN_TOKEN_SECRET", "colmapro-dev-secret-change-me")),
		PlatformAdminUsername:            getenv("PLATFORM_ADMIN_USERNAME", "superadmin"),
		PlatformAdminPasswordSHA256:      getenv("PLATFORM_ADMIN_PASSWORD_SHA256", ""),
		PlatformTokenSecret:              getenv("PLATFORM_TOKEN_SECRET", getenv("PLATFORM_ADMIN_SECRET", getenv("ADMIN_TOKEN_SECRET", "colmapro-dev-secret-change-me"))),
		AppTimezone:                      getenv("APP_TIMEZONE", getenv("TZ", "America/Santo_Domingo")),
		TerritoryDataDir:                 getenv("TERRITORY_DATA_DIR", "data"),
		CatalogDataFile:                  getenv("CATALOG_DATA_FILE", "data/catalog.json"),
		CloudflareR2AccountID:            getenv("CLOUDFLARE_R2_ACCOUNT_ID", ""),
		CloudflareR2Bucket:               getenv("CLOUDFLARE_R2_BUCKET", ""),
		CloudflareR2AccessKeyID:          getenv("CLOUDFLARE_R2_ACCESS_KEY_ID", ""),
		CloudflareR2SecretAccessKey:      getenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY", ""),
		CloudflareR2Endpoint:             getenv("CLOUDFLARE_R2_ENDPOINT", ""),
		CloudflareR2PublicBaseURL:        getenv("CLOUDFLARE_R2_PUBLIC_BASE_URL", ""),
		AutoTuneEnabled:                  getenvBool("AUTOTUNE_ENABLED", true),
		AutoTuneCPUCores:                 getenvInt("AUTOTUNE_CPU_CORES", 0),
		AutoTuneRAMMB:                    getenvInt("AUTOTUNE_RAM_MB", 0),
		AutoTuneRAMGB:                    getenvInt("AUTOTUNE_RAM_GB", 0),
		AutoTuneDiskGB:                   getenvInt("AUTOTUNE_DISK_GB", 0),
		PGMaxConnections:                 getenvInt("PG_MAX_CONNECTIONS", 0),
		PGSharedBuffers:                  getenv("PG_SHARED_BUFFERS", ""),
		PGEffectiveCacheSize:             getenv("PG_EFFECTIVE_CACHE_SIZE", ""),
		PGWorkMem:                        getenv("PG_WORK_MEM", ""),
		PGMaintenanceWorkMem:             getenv("PG_MAINTENANCE_WORK_MEM", ""),
		CentralDBMinConns:                getenvInt("CENTRAL_DB_MIN_CONNS", 1),
		CentralDBMaxConns:                getenvInt("CENTRAL_DB_MAX_CONNS", 8),
		GlobalCustomersDBMinConns:        getenvInt("GLOBAL_CUSTOMERS_DB_MIN_CONNS", 1),
		GlobalCustomersDBMaxConns:        getenvInt("GLOBAL_CUSTOMERS_DB_MAX_CONNS", 8),
		TenantDBMinConns:                 getenvInt("TENANT_DB_MIN_CONNS", 0),
		TenantDBMaxConns:                 getenvInt("TENANT_DB_MAX_CONNS", 2),
		TenantDBMaxIdleTime:              getenv("TENANT_DB_MAX_IDLE_TIME", "5m"),
		TenantDBMaxLifetime:              getenv("TENANT_DB_MAX_LIFETIME", "30m"),
		TenantPoolTTLMinutes:             getenvInt("TENANT_POOL_TTL_MINUTES", 5),
		MaxActiveTenantPools:             getenvInt("MAX_ACTIVE_TENANT_POOLS", 20),
		RedisMaxMemory:                   getenv("REDIS_MAXMEMORY", ""),
		RedisMaxMemoryPolicy:             getenv("REDIS_MAXMEMORY_POLICY", "allkeys-lru"),
		BootstrapRefetchMS:               getenvInt("BOOTSTRAP_REFETCH_MS", 30000),
		ClientSessionRefreshMS:           getenvInt("CLIENT_SESSION_REFRESH_MS", 30000),
		ClientCartPullMS:                 getenvInt("CLIENT_CART_PULL_MS", 15000),
		EnableRealtimeEvents:             getenvBool("ENABLE_REALTIME_EVENTS", true),
		SSEHeartbeatInterval:             getenvDuration("SSE_HEARTBEAT_INTERVAL", 25*time.Second),
		SSEWriteTimeout:                  getenvDuration("SSE_WRITE_TIMEOUT", 10*time.Second),
		SSEClientQueueSize:               getenvInt("SSE_CLIENT_QUEUE_SIZE", 32),
		SSEReplaySize:                    getenvInt("SSE_REPLAY_SIZE", 128),
		SSEReplayTenantLimit:             getenvInt("SSE_REPLAY_TENANT_LIMIT", 1000),
		SSEMaxConnectionsTotal:           getenvInt("SSE_MAX_CONNECTIONS_TOTAL", 5000),
		SSEMaxConnectionsPerTenant:       getenvInt("SSE_MAX_CONNECTIONS_PER_TENANT", 1000),
		SSEMaxConnectionsPerClient:       getenvInt("SSE_MAX_CONNECTIONS_PER_CLIENT", 50),
		SSERedisChannel:                  getenv("SSE_REDIS_CHANNEL", "colmapro:realtime:events"),
		MaxRequestsPerMinuteTenant:       getenvInt("MAX_REQUESTS_PER_MINUTE_PER_TENANT", 720),
		MaxRequestsPerMinuteIP:           getenvInt("MAX_REQUESTS_PER_MINUTE_PER_IP", 180),
		MaxLoginAttemptsPerMinute:        getenvInt("MAX_LOGIN_ATTEMPTS_PER_MINUTE", 10),
		AuthFailureLimit:                 getenvInt("AUTH_FAILURE_LIMIT", 5),
		AuthLockout:                      getenvDuration("AUTH_LOCKOUT", 15*time.Minute),
		RedisPoolSize:                    getenvInt("REDIS_POOL_SIZE", 20),
		RedisMinIdleConns:                getenvInt("REDIS_MIN_IDLE_CONNS", 2),
		RedisDialTimeout:                 getenvDuration("REDIS_DIAL_TIMEOUT", 3*time.Second),
		RedisReadTimeout:                 getenvDuration("REDIS_READ_TIMEOUT", time.Second),
		RedisWriteTimeout:                getenvDuration("REDIS_WRITE_TIMEOUT", time.Second),
		RedisOperationTimeout:            getenvDuration("REDIS_OPERATION_TIMEOUT", 300*time.Millisecond),
		R2HTTPTimeout:                    getenvDuration("R2_HTTP_TIMEOUT", 45*time.Second),
		WaxumHTTPTimeout:                 getenvDuration("WAXUM_HTTP_TIMEOUT", 25*time.Second),
		IdentityAPIEnabled:               getenvBool("IDENTIDAD_API_ENABLED", false),
		IdentityAPIRequired:              getenvBool("IDENTIDAD_API_REQUIRED", false),
		IdentityAPIURL:                   strings.TrimRight(getenv("IDENTIDAD_API_URL", "https://id.ltd.do"), "/"),
		IdentityAPIKey:                   strings.TrimSpace(os.Getenv("IDENTIDAD_API_KEY")),
		IdentityAPIClientID:              getenv("IDENTIDAD_API_CLIENT_ID", "colmapro"),
		IdentityAPITimeout:               getenvDuration("IDENTIDAD_API_TIMEOUT", 12*time.Second),
		GeoRDMapEnabled:                  getenvBool("GEO_RD_MAP_ENABLED", false),
		GeoRDMapURL:                      strings.TrimRight(getenv("GEO_RD_MAP_URL", "https://geo.ltd.do"), "/"),
		GeoRDMapAPIKey:                   strings.TrimSpace(os.Getenv("GEO_RD_MAP_API_KEY")),
		GeoRDMapTimeout:                  getenvDuration("GEO_RD_MAP_TIMEOUT", 12*time.Second),
		RoutingServiceURL:                strings.TrimRight(getenv("ROUTING_SERVICE_URL", "https://router.project-osrm.org"), "/"),
		RoutingHTTPTimeout:               getenvDuration("ROUTING_HTTP_TIMEOUT", 6*time.Second),
		OrderTransactionTimeout:          getenvDuration("ORDER_TRANSACTION_TIMEOUT", 5*time.Second),
		UsePgBouncer:                     usePgBouncer,
		PgBouncerAddr:                    pgBouncerAddr,
		RuntimeTenantDatabaseURLTemplate: runtimeTenantURLTemplate,
	}
}

func getenv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func getenvInt(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func getenvInt64(key string, fallback int64) int64 {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func getenvDuration(key string, fallback time.Duration) time.Duration {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	duration, err := time.ParseDuration(v)
	if err != nil || duration <= 0 {
		return fallback
	}
	return duration
}

func getenvBool(key string, fallback bool) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if v == "" {
		return fallback
	}
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func isContainerProduction(appEnv string) bool {
	switch strings.ToLower(strings.TrimSpace(appEnv)) {
	case "production", "prod", "staging":
		return true
	default:
		return false
	}
}

func isLoopbackHost(host string) bool {
	switch strings.ToLower(strings.TrimSpace(host)) {
	case "localhost", "127.0.0.1", "::1":
		return true
	default:
		return false
	}
}

func normalizeProductionDatabaseHost(databaseURL, appEnv, serviceHost string) string {
	if !isContainerProduction(appEnv) {
		return databaseURL
	}
	placeholder := "__COLMAPRO_DATABASE_PLACEHOLDER__"
	working := strings.ReplaceAll(strings.TrimSpace(databaseURL), "{{database}}", placeholder)
	u, err := url.Parse(working)
	if err != nil || u.Scheme == "" || u.Host == "" || !isLoopbackHost(u.Hostname()) {
		return databaseURL
	}
	u.Host = strings.TrimSpace(serviceHost)
	return strings.ReplaceAll(u.String(), placeholder, "{{database}}")
}

func normalizeProductionServiceAddress(address, appEnv, serviceAddress string) string {
	address = strings.TrimSpace(address)
	if !isContainerProduction(appEnv) || address == "" {
		return address
	}
	host := address
	if parsedHost, _, err := net.SplitHostPort(address); err == nil {
		host = parsedHost
	}
	if isLoopbackHost(strings.Trim(host, "[]")) {
		return serviceAddress
	}
	return address
}

func databaseURLTemplateWithHost(databaseURL, hostPort string, simpleProtocol bool) string {
	if strings.TrimSpace(databaseURL) == "" || strings.TrimSpace(hostPort) == "" {
		return databaseURL
	}
	placeholder := "__COLMAPRO_DATABASE_PLACEHOLDER__"
	working := strings.ReplaceAll(databaseURL, "{{database}}", placeholder)
	u, err := url.Parse(strings.TrimSpace(working))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return databaseURL
	}
	u.Host = strings.TrimSpace(hostPort)
	if simpleProtocol {
		q := u.Query()
		if q.Get("default_query_exec_mode") == "" {
			q.Set("default_query_exec_mode", "simple_protocol")
		}
		u.RawQuery = q.Encode()
	}
	return strings.ReplaceAll(u.String(), placeholder, "{{database}}")
}

func databaseURLWithName(databaseURL, databaseName string) string {
	u, err := url.Parse(strings.TrimSpace(databaseURL))
	if err != nil || u.Scheme == "" || u.Host == "" || strings.TrimSpace(databaseName) == "" {
		return databaseURL
	}
	u.Path = "/" + strings.TrimSpace(databaseName)
	return u.String()
}
