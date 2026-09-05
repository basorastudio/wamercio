package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	AppName, Env, DatabaseURL, RedisURL, JWTSecret, MediaDir                                   string
	SeedDemo                                                                                   bool
	JWTDuration                                                                                time.Duration
	SuperAdminEmail, SuperAdminPassword                                                        string
	DemoAdminEmail, DemoAdminPassword                                                          string
	WaxumBaseURL, WaxumToken, WaxumWebhookBaseURL                                              string
	IdentityBaseURL, IdentityAPIKey, IdentityClientID, IdentityApplicationDomain               string
	IdentityHashSecret, IdentityOwnerContext, IdentityBusinessContext, IdentityCustomerContext string
	IdentityPublicRateLimit                                                                    int
	GeoBaseURL, GeoAPIKey                                                                      string
	GeoPublicRateLimit                                                                         int
}

func Load() Config {
	ttl, _ := strconv.Atoi(get("JWT_TTL_MINUTES", "480"))
	// Backwards compatibility with the first reconstruction variables.
	waxumBase := get("WAXUM_BASE_URL", os.Getenv("WHATSAPP_BASE_URL"))
	waxumToken := get("WAXUM_SUPERADMIN_TOKEN", os.Getenv("WHATSAPP_TOKEN"))
	return Config{
		AppName: get("APP_NAME", "wamercio"), Env: get("APP_ENV", "development"),
		DatabaseURL: os.Getenv("DATABASE_URL"), RedisURL: get("REDIS_URL", "redis://localhost:6379/0"),
		JWTSecret: os.Getenv("JWT_SECRET"), MediaDir: get("MEDIA_DIR", "/data/uploads"),
		SeedDemo: get("SEED_DEMO", "false") == "true", JWTDuration: time.Duration(ttl) * time.Minute,
		SuperAdminEmail: get("SUPERADMIN_EMAIL", "admin@wamercio.local"), SuperAdminPassword: os.Getenv("SUPERADMIN_PASSWORD"),
		DemoAdminEmail: get("DEMO_ADMIN_EMAIL", "demo@wamercio.local"), DemoAdminPassword: os.Getenv("DEMO_ADMIN_PASSWORD"),
		WaxumBaseURL: waxumBase, WaxumToken: waxumToken, WaxumWebhookBaseURL: stringsTrimRightSlash(os.Getenv("WAXUM_WEBHOOK_BASE_URL")),
		IdentityBaseURL: get("IDENTITY_BASE_URL", "https://id.ltd.do"), IdentityAPIKey: os.Getenv("IDENTITY_API_KEY"), IdentityClientID: os.Getenv("IDENTITY_CLIENT_ID"), IdentityApplicationDomain: os.Getenv("IDENTITY_APPLICATION_DOMAIN"),
		IdentityHashSecret: get("IDENTITY_HASH_SECRET", os.Getenv("JWT_SECRET")), IdentityOwnerContext: get("IDENTITY_OWNER_CONTEXT", "registro_propietario"), IdentityBusinessContext: get("IDENTITY_BUSINESS_CONTEXT", "registro_negocio"), IdentityCustomerContext: get("IDENTITY_CUSTOMER_CONTEXT", "registro_cliente"),
		IdentityPublicRateLimit: intEnv("IDENTITY_PUBLIC_RATE_LIMIT", 8),
		GeoBaseURL:              get("GEO_RD_MAP_BASE_URL", "https://geo.ltd.do"), GeoAPIKey: os.Getenv("GEO_RD_MAP_API_KEY"), GeoPublicRateLimit: intEnv("GEO_RD_MAP_PUBLIC_RATE_LIMIT", 60),
	}
}

func intEnv(k string, d int) int {
	v, err := strconv.Atoi(os.Getenv(k))
	if err != nil || v < 1 {
		return d
	}
	return v
}

func get(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func stringsTrimRightSlash(v string) string {
	for len(v) > 0 && v[len(v)-1] == '/' {
		v = v[:len(v)-1]
	}
	return v
}
