package config

import "testing"

func TestLoadNormalizesLoopbackServicesInProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("CENTRAL_DATABASE_URL", "postgres://user:pass@localhost:5432/colmapro_core?sslmode=disable")
	t.Setenv("GLOBAL_CUSTOMERS_DATABASE_URL", "postgres://user:pass@127.0.0.1:5432/colmapro_global_customers?sslmode=disable")
	t.Setenv("TENANT_DATABASE_URL_TEMPLATE", "postgres://user:pass@[::1]:5432/{{database}}?sslmode=disable")
	t.Setenv("REDIS_ADDR", "localhost:6379")
	t.Setenv("USE_PGBOUNCER", "false")

	cfg := Load()
	if got, want := cfg.CentralDatabaseURL, "postgres://user:pass@postgres:5432/colmapro_core?sslmode=disable"; got != want {
		t.Fatalf("CentralDatabaseURL = %q, want %q", got, want)
	}
	if got, want := cfg.GlobalCustomersDatabaseURL, "postgres://user:pass@postgres:5432/colmapro_global_customers?sslmode=disable"; got != want {
		t.Fatalf("GlobalCustomersDatabaseURL = %q, want %q", got, want)
	}
	if got, want := cfg.TenantDatabaseURLTemplate, "postgres://user:pass@postgres:5432/{{database}}?sslmode=disable"; got != want {
		t.Fatalf("TenantDatabaseURLTemplate = %q, want %q", got, want)
	}
	if got, want := cfg.RedisAddr, "redis:6379"; got != want {
		t.Fatalf("RedisAddr = %q, want %q", got, want)
	}
}

func TestLoadPreservesLoopbackServicesInDevelopment(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("CENTRAL_DATABASE_URL", "postgres://user:pass@localhost:5432/colmapro_core?sslmode=disable")
	t.Setenv("REDIS_ADDR", "localhost:6379")
	t.Setenv("USE_PGBOUNCER", "false")

	cfg := Load()
	if got, want := cfg.CentralDatabaseURL, "postgres://user:pass@localhost:5432/colmapro_core?sslmode=disable"; got != want {
		t.Fatalf("CentralDatabaseURL = %q, want %q", got, want)
	}
	if got, want := cfg.RedisAddr, "localhost:6379"; got != want {
		t.Fatalf("RedisAddr = %q, want %q", got, want)
	}
}

func TestLoadIdentityAPIConfig(t *testing.T) {
	t.Setenv("APP_DOMAIN", "wamercio.com")
	t.Setenv("IDENTIDAD_API_ENABLED", "true")
	t.Setenv("IDENTIDAD_API_REQUIRED", "true")
	t.Setenv("IDENTIDAD_API_URL", "https://id.ltd.do/")
	t.Setenv("IDENTIDAD_API_KEY", " secret-key ")
	t.Setenv("IDENTIDAD_API_CLIENT_ID", "colmapro-production")
	t.Setenv("IDENTIDAD_API_TIMEOUT", "9s")

	cfg := Load()
	if got, want := cfg.AppDomain, "wamercio.com"; got != want {
		t.Fatalf("AppDomain = %q, want %q", got, want)
	}
	if !cfg.IdentityAPIEnabled || !cfg.IdentityAPIRequired {
		t.Fatalf("identity flags were not loaded")
	}
	if got, want := cfg.IdentityAPIURL, "https://id.ltd.do"; got != want {
		t.Fatalf("IdentityAPIURL = %q, want %q", got, want)
	}
	if got, want := cfg.IdentityAPIKey, "secret-key"; got != want {
		t.Fatalf("IdentityAPIKey = %q, want %q", got, want)
	}
	if got, want := cfg.IdentityAPITimeout.String(), "9s"; got != want {
		t.Fatalf("IdentityAPITimeout = %q, want %q", got, want)
	}
}
