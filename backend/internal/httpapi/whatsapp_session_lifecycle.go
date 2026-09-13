package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	waxum "github.com/basoradev/waxum-go"
)

const (
	whatsappLinkingWindow  = 5 * time.Minute
	whatsappReconnectGrace = 2 * time.Minute
)

func whatsappLinkingExpiresAt(now time.Time, timeoutSeconds int64) string {
	duration := whatsappLinkingWindow
	if timeoutSeconds > 0 {
		candidate := time.Duration(timeoutSeconds) * time.Second
		if candidate > duration {
			duration = candidate
		}
	}
	return now.UTC().Add(duration).Format(time.RFC3339)
}

func whatsappLinkingIsActive(expiresAt string, now time.Time) bool {
	expiresAt = strings.TrimSpace(expiresAt)
	if expiresAt == "" {
		return false
	}
	expires, err := time.Parse(time.RFC3339, expiresAt)
	return err == nil && now.UTC().Before(expires)
}

func whatsappReconnectGraceActive(detectedAt string, now time.Time) bool {
	detectedAt = strings.TrimSpace(detectedAt)
	if detectedAt == "" {
		return true
	}
	detected, err := time.Parse(time.RFC3339, detectedAt)
	return err == nil && now.UTC().Before(detected.Add(whatsappReconnectGrace))
}

// deleteWaxumSessionCompletely uses WAXUM's DELETE contract as the source of
// truth. According to the Sessions API, DELETE disconnects the WhatsApp client,
// removes the database rows and deletes the on-disk device store. A preliminary
// disconnect is attempted only as a compatibility aid for older WAXUM builds.
func deleteWaxumSessionCompletely(ctx context.Context, client *waxum.Client, sessionID string) error {
	if client == nil || strings.TrimSpace(sessionID) == "" {
		return nil
	}

	_, _, _ = client.Sessions.Disconnect(ctx, sessionID)
	_, _, err := client.Sessions.Delete(ctx, sessionID)
	if err == nil || waxum.IsStatus(err, http.StatusNotFound) {
		return nil
	}

	// Older runtimes can briefly keep the client registered after disconnect.
	// Retry once so an explicit unlink never reports success while leaving an
	// orphaned remote session behind.
	if !sleepContext(ctx, 250*time.Millisecond) {
		return ctx.Err()
	}
	_, _, retryErr := client.Sessions.Delete(ctx, sessionID)
	if retryErr == nil || waxum.IsStatus(retryErr, http.StatusNotFound) {
		return nil
	}
	return errors.Join(err, retryErr)
}
