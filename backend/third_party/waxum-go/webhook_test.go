package waxum

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestWebhookSignature(t *testing.T) {
	t.Parallel()
	payload := []byte(`{"session_id":"main","event":"connected","timestamp":123,"data":{}}`)
	secret := "secret"
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(payload)
	signature := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	if !VerifyWebhookSignature(payload, signature, secret) {
		t.Fatal("valid signature rejected")
	}
	if VerifyWebhookSignature(payload, signature+"00", secret) {
		t.Fatal("invalid signature accepted")
	}
	event, err := ParseWebhook(payload, signature, secret)
	if err != nil {
		t.Fatal(err)
	}
	if event.SessionID != "main" || event.Event != "connected" {
		t.Fatalf("unexpected event: %#v", event)
	}
}
