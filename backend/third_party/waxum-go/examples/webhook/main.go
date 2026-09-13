package main

import (
	"log"
	"net/http"
	"os"

	waxum "github.com/basoradev/waxum-go"
)

func main() {
	secret := os.Getenv("WAXUM_WEBHOOK_SECRET")
	http.HandleFunc("/webhook", func(w http.ResponseWriter, r *http.Request) {
		event, _, err := waxum.ParseWebhookRequest(r, secret, 8<<20)
		if err != nil {
			http.Error(w, "invalid webhook", http.StatusUnauthorized)
			return
		}
		log.Printf("session=%s event=%s timestamp=%d", event.SessionID, event.Event, event.Timestamp)
		w.WriteHeader(http.StatusOK)
	})
	log.Fatal(http.ListenAndServe(":8080", nil))
}
