package config

import "os"

type Config struct {
	Port                  string
	DatabaseURL           string
	RedisURL              string
	JWTSecret             string
	InternalWebhookSecret string
	AdminEmail            string
	AdminPassword         string
	AdminName             string
	AppURL                string
	WhatsAppBridgeURL     string
	UploadDir             string
}

func Load() Config {
	return Config{
		Port:                  env("PORT", "8080"),
		DatabaseURL:           os.Getenv("DATABASE_URL"),
		RedisURL:              env("REDIS_URL", "redis://redis:6379/0"),
		JWTSecret:             os.Getenv("JWT_SECRET"),
		InternalWebhookSecret: os.Getenv("INTERNAL_WEBHOOK_SECRET"),
		AdminEmail:            env("ADMIN_EMAIL", "admin@wamercio.local"),
		AdminPassword:         env("ADMIN_PASSWORD", "ChangeMe123!"),
		AdminName:             env("ADMIN_NAME", "Administrador WAMERCIO"),
		AppURL:                env("APP_URL", "http://localhost:3000"),
		WhatsAppBridgeURL:     env("WHATSAPP_BRIDGE_URL", "http://whatsapp:8090"),
		UploadDir:             env("UPLOAD_DIR", "/app/data/uploads"),
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
