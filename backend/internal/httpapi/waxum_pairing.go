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
	waxumPairingStopAttempts = 24
	waxumPairingMaxAttempts  = 2
)

var errWaxumSessionAlreadyLinked = errors.New("waxum session is already linked")

// prepareWaxumSessionForPhonePairing moves an unlinked session to a clean
// disconnected state before calling /pair. This matters because Waxum's
// phone-number flow has a dedicated connection path. Calling /connect first
// leaves the runtime in QR mode and can make pair_with_code fail with an IQ
// request error before WhatsApp receives the push notification.
func prepareWaxumSessionForPhonePairing(
	ctx context.Context,
	client *waxum.Client,
	sessionID string,
	createRequest *waxum.CreateSessionRequest,
	recreate bool,
) error {
	if client == nil || strings.TrimSpace(sessionID) == "" {
		return badRequest("La conexión de WhatsApp no está disponible")
	}

	if recreate {
		_, _, _ = client.Sessions.Disconnect(ctx, sessionID)
		_, _, deleteErr := client.Sessions.Delete(ctx, sessionID)
		if deleteErr != nil && !waxum.IsStatus(deleteErr, http.StatusNotFound) {
			return deleteErr
		}
		if !sleepContext(ctx, 250*time.Millisecond) {
			return ctx.Err()
		}
	}

	status, _, statusErr := client.Sessions.GetStatus(ctx, sessionID)
	if statusErr != nil && waxum.IsStatus(statusErr, http.StatusNotFound) {
		if _, _, createErr := client.Sessions.Create(ctx, createRequest); createErr != nil {
			return createErr
		}
	} else if statusErr == nil && status != nil && (status.IsLoggedIn || status.Status == waxum.SessionStatusLoggedIn) {
		return errWaxumSessionAlreadyLinked
	} else if statusErr != nil {
		return statusErr
	}

	var lastErr error
	for attempt := 0; attempt < waxumPairingStopAttempts; attempt++ {
		status, _, statusErr = client.Sessions.GetStatus(ctx, sessionID)
		if statusErr == nil && status != nil {
			if status.IsLoggedIn || status.Status == waxum.SessionStatusLoggedIn {
				return errWaxumSessionAlreadyLinked
			}
			if status.Status == waxum.SessionStatusDisconnected {
				return nil
			}
		} else if statusErr != nil {
			if waxum.IsStatus(statusErr, http.StatusNotFound) {
				if _, _, createErr := client.Sessions.Create(ctx, createRequest); createErr != nil && !waxum.IsStatus(createErr, http.StatusConflict) {
					lastErr = createErr
				}
			} else {
				lastErr = statusErr
			}
		}

		// Disconnect clears the live client from Waxum's runtime. Once this
		// succeeds, /pair starts connect_client_with_pair_code instead of
		// reusing a QR-mode client.
		if _, _, disconnectErr := client.Sessions.Disconnect(ctx, sessionID); disconnectErr == nil {
			if !sleepContext(ctx, 180*time.Millisecond) {
				return ctx.Err()
			}
			return nil
		} else if !waxum.IsStatus(disconnectErr, http.StatusServiceUnavailable) &&
			!waxum.IsStatus(disconnectErr, http.StatusConflict) &&
			!waxum.IsStatus(disconnectErr, http.StatusNotFound) {
			lastErr = disconnectErr
		}

		if !sleepContext(ctx, time.Duration(180+attempt*35)*time.Millisecond) {
			return ctx.Err()
		}
	}

	if lastErr != nil {
		return lastErr
	}
	return badRequest("La sesión de WhatsApp todavía se está preparando")
}

func requestWaxumPhonePairingCode(
	ctx context.Context,
	client *waxum.Client,
	sessionID string,
	phone string,
	device *waxum.DevicePropsRequest,
	createRequest *waxum.CreateSessionRequest,
) (*waxum.PairCodeResponse, error) {
	var lastErr error
	for attempt := 0; attempt < waxumPairingMaxAttempts; attempt++ {
		if err := prepareWaxumSessionForPhonePairing(ctx, client, sessionID, createRequest, attempt > 0); err != nil {
			if errors.Is(err, errWaxumSessionAlreadyLinked) {
				return nil, err
			}
			lastErr = err
			if attempt+1 < waxumPairingMaxAttempts && isRetryableWaxumPairingError(err) {
				continue
			}
			break
		}

		pair, _, err := client.Sessions.Pair(ctx, sessionID, &waxum.PairCodeRequest{
			PhoneNumber:          "+" + normalizePlatformWhatsAppPhone(phone),
			ShowPushNotification: waxum.Ptr(true),
			Device:               device,
		})
		if err == nil && pair != nil && strings.TrimSpace(pair.Code) != "" {
			return pair, nil
		}
		if err == nil {
			err = errors.New("waxum returned an empty pairing code")
		}
		lastErr = err
		if attempt+1 < waxumPairingMaxAttempts && isRetryableWaxumPairingError(err) {
			if !sleepContext(ctx, 650*time.Millisecond) {
				return nil, ctx.Err()
			}
			continue
		}
		break
	}
	return nil, lastErr
}

func waxumPairingErrorText(err error) string {
	if err == nil {
		return ""
	}
	parts := []string{err.Error()}
	var apiErr *waxum.APIError
	if errors.As(err, &apiErr) {
		parts = append(parts, apiErr.Code, apiErr.Message, waxumMessageFromBody(apiErr.Body))
	}
	return strings.ToLower(strings.Join(parts, " "))
}

func isRetryableWaxumPairingError(err error) bool {
	if err == nil {
		return false
	}
	var apiErr *waxum.APIError
	if errors.As(err, &apiErr) {
		switch apiErr.StatusCode {
		case http.StatusInternalServerError, http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout, http.StatusTooManyRequests:
			return true
		}
	}
	text := waxumPairingErrorText(err)
	for _, fragment := range []string{
		"pair-code iq request failed",
		"pair_with_code failed",
		"iq request failed",
		"empty pairing code",
		"not connected",
		"temporarily unavailable",
		"timeout",
		"connection reset",
		"session is still preparing",
	} {
		if strings.Contains(text, fragment) {
			return true
		}
	}
	return false
}

func friendlyWaxumPairingError(err error) error {
	text := waxumPairingErrorText(err)
	if strings.Contains(text, "pair-code iq request failed") ||
		strings.Contains(text, "pair_with_code failed") ||
		strings.Contains(text, "iq request failed") ||
		strings.Contains(text, "empty pairing code") {
		return badRequest("WhatsApp no pudo iniciar la vinculación por número en este intento. Espera unos segundos y vuelve a generar el código, o utiliza el código QR.")
	}
	return waxumFriendlyError("No se pudo generar el código de emparejamiento", err)
}
