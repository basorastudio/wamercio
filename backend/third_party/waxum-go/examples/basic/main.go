package main

import (
	"context"
	"fmt"
	"log"
	"os"

	waxum "github.com/basoradev/waxum-go"
)

func main() {
	baseURL := envOr("WAXUM_URL", waxum.DefaultBaseURL)
	token := os.Getenv("WAXUM_TOKEN")
	if token == "" {
		log.Fatal("WAXUM_TOKEN is required")
	}

	client, err := waxum.NewClient(token, waxum.WithBaseURL(baseURL))
	if err != nil {
		log.Fatal(err)
	}

	sessions, _, err := client.Sessions.List(context.Background())
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Waxum sessions: %d\n", sessions.Total)
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
