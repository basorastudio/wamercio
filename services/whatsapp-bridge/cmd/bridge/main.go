package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"wamercio/services/whatsapp-bridge/internal/bridge"
)

func main() {
	port := getenv("PORT", "8090")
	db := os.Getenv("DATABASE_URL")
	core := getenv("CORE_WEBHOOK_URL", "http://api:8080")
	secret := os.Getenv("INTERNAL_WEBHOOK_SECRET")
	if db == "" || secret == "" {
		log.Fatal("DATABASE_URL e INTERNAL_WEBHOOK_SECRET son obligatorios")
	}

	ctx := context.Background()
	mgr, err := bridge.New(ctx, db, core, secret)
	if err != nil {
		log.Fatalf("whatsapp bridge: %v", err)
	}
	defer mgr.Close()
	if err := mgr.Restore(ctx); err != nil {
		log.Printf("restore sessions: %v", err)
	}

	srv := &http.Server{Addr: ":" + port, Handler: mgr.Router(), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		log.Printf("WAMERCIO WhatsApp bridge en :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdown)
}
func getenv(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
