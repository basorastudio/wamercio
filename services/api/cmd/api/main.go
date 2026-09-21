package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"wamercio/services/api/internal/config"
	"wamercio/services/api/internal/database"
	"wamercio/services/api/internal/httpapi"
)

func main() {
	cfg := config.Load()
	if cfg.DatabaseURL == "" || cfg.JWTSecret == "" {
		log.Fatal("DATABASE_URL y JWT_SECRET son obligatorios")
	}
	ctx := context.Background()
	if err := database.Migrate(cfg.DatabaseURL); err != nil {
		log.Fatalf("migraciones: %v", err)
	}
	db, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer db.Close()
	if err := database.EnsureAdmin(ctx, db, cfg.AdminName, cfg.AdminEmail, cfg.AdminPassword); err != nil {
		log.Fatalf("admin inicial: %v", err)
	}

	server := httpapi.New(cfg, db)
	httpServer := &http.Server{Addr: ":" + cfg.Port, Handler: server.Router(), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		log.Printf("WAMERCIO API escuchando en :%s", cfg.Port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(shutdown)
}
