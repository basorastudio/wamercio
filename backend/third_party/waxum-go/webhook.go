package waxum

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const WebhookSignatureHeader = "X-Webhook-Signature"

// WebhookEnvelope is the common payload shape documented by Waxum.
type WebhookEnvelope struct {
	SessionID string          `json:"session_id"`
	Event     string          `json:"event"`
	Timestamp int64           `json:"timestamp"`
	Data      json.RawMessage `json:"data"`
}

// VerifyWebhookSignature verifies Waxum's sha256=<hex> HMAC signature using a
// constant-time comparison.
func VerifyWebhookSignature(payload []byte, signature, secret string) bool {
	if len(payload) == 0 || signature == "" || secret == "" {
		return false
	}
	prefix := "sha256="
	if !strings.HasPrefix(strings.ToLower(signature), prefix) {
		return false
	}
	provided, err := hex.DecodeString(signature[len(prefix):])
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(payload)
	return hmac.Equal(provided, mac.Sum(nil))
}

// ParseWebhook verifies and decodes a webhook payload. Pass an empty secret to
// skip signature verification in local development.
func ParseWebhook(payload []byte, signature, secret string) (*WebhookEnvelope, error) {
	if secret != "" && !VerifyWebhookSignature(payload, signature, secret) {
		return nil, errors.New("waxum: invalid webhook signature")
	}
	var event WebhookEnvelope
	if err := json.Unmarshal(payload, &event); err != nil {
		return nil, fmt.Errorf("waxum: decode webhook: %w", err)
	}
	return &event, nil
}

// ParseWebhookRequest reads, verifies and decodes an HTTP webhook request.
func ParseWebhookRequest(r *http.Request, secret string, maxBodyBytes int64) (*WebhookEnvelope, []byte, error) {
	if r == nil {
		return nil, nil, errors.New("waxum: webhook request cannot be nil")
	}
	if maxBodyBytes <= 0 {
		maxBodyBytes = 8 << 20
	}
	payload, err := io.ReadAll(io.LimitReader(r.Body, maxBodyBytes+1))
	if err != nil {
		return nil, nil, fmt.Errorf("waxum: read webhook body: %w", err)
	}
	if int64(len(payload)) > maxBodyBytes {
		return nil, nil, fmt.Errorf("waxum: webhook body exceeds %d bytes", maxBodyBytes)
	}
	event, err := ParseWebhook(payload, r.Header.Get(WebhookSignatureHeader), secret)
	return event, payload, err
}
