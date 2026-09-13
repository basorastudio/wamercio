package httpapi

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net"
	"net/http"
	"strings"
	"time"

	waxum "github.com/basoradev/waxum-go"

	"github.com/jackc/pgx/v5"
)

type recoveryTokenPayload struct {
	ChallengeID string `json:"challenge_id"`
	SubjectType string `json:"subject_type"`
	SubjectID   string `json:"subject_id"`
	ExpiresAt   int64  `json:"expires_at"`
}

func generateRecoveryCode() (string, error) {
	maximum := big.NewInt(1000000)
	value, err := rand.Int(rand.Reader, maximum)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", value.Int64()), nil
}

func generateRecoveryLinkToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func recoveryLinkHashInput(token string) string {
	return "link:" + strings.TrimSpace(token)
}

func recoveryLinkURL(r *http.Request, challengeID, linkToken, scope, destination string) string {
	base := strings.TrimSuffix(publicURLFromRequest(r), "/")
	return fmt.Sprintf("%s/#/recover-account?mode=link&scope=%s&challenge_id=%s&link_token=%s&destination=%s", base, scope, challengeID, linkToken, destination)
}

func recoveryCTAConfiguredText(value string, ttlMinutes int) string {
	return strings.ReplaceAll(strings.TrimSpace(value), "{minutos}", fmt.Sprintf("%d", ttlMinutes))
}

func (s *Server) recoveryCodeHash(challengeID, code string) string {
	mac := hmac.New(sha256.New, []byte("recovery-code:"+s.cfg.AdminTokenSecret))
	mac.Write([]byte(strings.TrimSpace(challengeID)))
	mac.Write([]byte{0})
	mac.Write([]byte(strings.TrimSpace(code)))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s *Server) issueRecoveryToken(payload recoveryTokenPayload) (string, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	body := base64.RawURLEncoding.EncodeToString(raw)
	mac := hmac.New(sha256.New, []byte("recovery-token:"+s.cfg.AdminTokenSecret))
	mac.Write([]byte(body))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return body + "." + signature, nil
}

func (s *Server) validateRecoveryToken(token string) (recoveryTokenPayload, error) {
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 2 {
		return recoveryTokenPayload{}, errors.New("invalid recovery token")
	}
	mac := hmac.New(sha256.New, []byte("recovery-token:"+s.cfg.AdminTokenSecret))
	mac.Write([]byte(parts[0]))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if subtle.ConstantTimeCompare([]byte(expected), []byte(parts[1])) != 1 {
		return recoveryTokenPayload{}, errors.New("invalid recovery token signature")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return recoveryTokenPayload{}, err
	}
	var payload recoveryTokenPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return recoveryTokenPayload{}, err
	}
	if payload.ChallengeID == "" || payload.SubjectID == "" || time.Now().Unix() > payload.ExpiresAt {
		return recoveryTokenPayload{}, errors.New("expired recovery token")
	}
	return payload, nil
}

func normalizeRecoverySubject(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "admin", "administrator", "administrador":
		return "administrator"
	case "staff", "cashier", "delivery_driver", "empleado", "cajero", "repartidor":
		return "staff"
	case "customer", "client", "cliente", "":
		return "customer"
	default:
		return ""
	}
}

func (s *Server) findRecoverySubject(ctx context.Context, subjectType, phoneDigits string) (string, string, error) {
	phoneDigits = onlyDigits(phoneDigits)
	switch subjectType {
	case "customer":
		var id, whatsapp string
		err := s.db.QueryRow(ctx, `
			SELECT id::text,whatsapp FROM customers
			WHERE regexp_replace(whatsapp,'\D','','g')=$1
			   OR right(regexp_replace(whatsapp,'\D','','g'),10)=right($1,10)
			ORDER BY registered_at DESC LIMIT 1
		`, phoneDigits).Scan(&id, &whatsapp)
		return id, whatsapp, err
	case "staff":
		var id, whatsapp string
		err := s.db.QueryRow(ctx, `
			SELECT id::text,whatsapp FROM system_users
			WHERE active=true AND (regexp_replace(whatsapp,'\D','','g')=$1 OR right(regexp_replace(whatsapp,'\D','','g'),10)=right($1,10))
			ORDER BY updated_at DESC LIMIT 1
		`, phoneDigits).Scan(&id, &whatsapp)
		return id, whatsapp, err
	case "administrator":
		var username, whatsapp string
		err := s.db.QueryRow(ctx, `
			SELECT username,whatsapp FROM admin_profiles
			WHERE regexp_replace(whatsapp,'\D','','g')=$1 OR right(regexp_replace(whatsapp,'\D','','g'),10)=right($1,10)
			ORDER BY updated_at DESC LIMIT 1
		`, phoneDigits).Scan(&username, &whatsapp)
		return username, whatsapp, err
	default:
		return "", "", badRequest("El tipo de cuenta no es válido")
	}
}

func (s *Server) sendRecoveryCode(ctx context.Context, phone, code string, ttlMinutes int) error {
	client, whatsapp, err := s.platformWaxumClient(ctx)
	if err != nil {
		return err
	}
	whatsapp = s.refreshPlatformWhatsAppFromWaxum(ctx, whatsapp)
	if !whatsapp.LoggedIn {
		return apiError{status: http.StatusServiceUnavailable, msg: "La recuperación por WhatsApp no está disponible temporalmente"}
	}
	phone = normalizePlatformWhatsAppPhone(phone)
	if phone == "" {
		return badRequest("El número de WhatsApp no es válido")
	}
	_, _, err = client.Messages.SendText(ctx, whatsapp.SessionID, &waxum.SendTextRequest{
		To:   phone,
		Text: fmt.Sprintf("Tu código de recuperación de WAMERCIO es: %s. Vence en %d minutos. No lo compartas con nadie.", code, ttlMinutes),
	})
	if err != nil {
		return waxumFriendlyError("No se pudo enviar el código de recuperación", err)
	}
	return nil
}

func recoveryRequestMessage(method string, generic bool) string {
	if method == recoveryMethodLink {
		if generic {
			return "Si la cuenta existe, recibirás un enlace seguro por WhatsApp."
		}
		return "Enviamos un enlace seguro de recuperación a tu WhatsApp."
	}
	if generic {
		return "Si la cuenta existe, recibirás un código por WhatsApp."
	}
	return "Enviamos un código de recuperación a tu WhatsApp."
}

func (s *Server) sendRecoveryLink(ctx context.Context, phone, recoveryURL string, policy accessPolicyConfig) error {
	client, whatsapp, err := s.platformWaxumClient(ctx)
	if err != nil {
		return err
	}
	whatsapp = s.refreshPlatformWhatsAppFromWaxum(ctx, whatsapp)
	if !whatsapp.LoggedIn {
		return apiError{status: http.StatusServiceUnavailable, msg: "La recuperación por WhatsApp no está disponible temporalmente"}
	}
	phone = normalizePlatformWhatsAppPhone(phone)
	if phone == "" {
		return badRequest("El número de WhatsApp no es válido")
	}
	header := recoveryCTAConfiguredText(policy.RecoveryCTAHeader, policy.RecoveryTTLMinutes)
	body := recoveryCTAConfiguredText(policy.RecoveryCTABody, policy.RecoveryTTLMinutes)
	footer := recoveryCTAConfiguredText(policy.RecoveryCTAFooter, policy.RecoveryTTLMinutes)
	buttonLabel := recoveryCTAConfiguredText(policy.RecoveryCTAButtonLabel, policy.RecoveryTTLMinutes)
	merchantURL := strings.SplitN(recoveryURL, "/#/", 2)[0]
	request := &waxum.SendCtaUrlRequest{
		To:          phone,
		URL:         recoveryURL,
		MerchantURL: &merchantURL,
		DisplayText: buttonLabel,
		HeaderText:  &header,
		BodyText:    &body,
		FooterText:  &footer,
	}
	if imageURL := strings.TrimSpace(policy.RecoveryCTAImageURL); imageURL != "" {
		request.Image = &waxum.MediaData{URL: &imageURL}
	}
	_, _, err = client.Messages.SendCtaURL(ctx, whatsapp.SessionID, request)
	if err != nil {
		return waxumFriendlyError("No se pudo enviar el enlace de recuperación", err)
	}
	return nil
}

func (s *Server) requestAccountRecovery(w http.ResponseWriter, r *http.Request) {
	policy := s.accessPolicy(r.Context())
	if !policy.RecoveryEnabled {
		writeError(w, apiError{status: http.StatusForbidden, msg: "La recuperación de acceso por WhatsApp está deshabilitada"})
		return
	}
	var input struct {
		SubjectType string `json:"subject_type"`
		Whatsapp    string `json:"whatsapp"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	subjectType := normalizeRecoverySubject(input.SubjectType)
	phoneDigits := onlyDigits(input.Whatsapp)
	if subjectType == "" || len(phoneDigits) < 10 {
		writeError(w, badRequest("Completa un número de WhatsApp válido"))
		return
	}
	subjectID, storedPhone, err := s.findRecoverySubject(r.Context(), subjectType, phoneDigits)
	if errors.Is(err, pgx.ErrNoRows) {
		// Do not reveal whether the account exists.
		writeJSON(w, http.StatusAccepted, map[string]any{"requested": true, "method": policy.RecoveryMethod, "message": recoveryRequestMessage(policy.RecoveryMethod, true)})
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	var secret string
	if policy.RecoveryMethod == recoveryMethodLink {
		secret, err = generateRecoveryLinkToken()
	} else {
		secret, err = generateRecoveryCode()
	}
	if err != nil {
		writeError(w, err)
		return
	}
	var challengeID string
	err = s.db.QueryRow(r.Context(), `
		INSERT INTO account_recovery_challenges (subject_type,subject_id,whatsapp_digits,code_hash,expires_at,max_attempts,requested_ip)
		VALUES ($1,$2,$3,'',now()+($4 * interval '1 minute'),$5,NULLIF($6,'')::inet)
		RETURNING id::text
	`, subjectType, subjectID, phoneDigits, policy.RecoveryTTLMinutes, policy.RecoveryMaxAttempts, requestIPAddress(r)).Scan(&challengeID)
	if err != nil {
		writeError(w, err)
		return
	}
	hashInput := secret
	if policy.RecoveryMethod == recoveryMethodLink {
		hashInput = recoveryLinkHashInput(secret)
	}
	hash := s.recoveryCodeHash(challengeID, hashInput)
	if _, err := s.db.Exec(r.Context(), `UPDATE account_recovery_challenges SET code_hash=$2 WHERE id=$1::uuid`, challengeID, hash); err != nil {
		writeError(w, err)
		return
	}
	sendContext, cancel := context.WithTimeout(r.Context(), s.waxumTimeout())
	if policy.RecoveryMethod == recoveryMethodLink {
		destination := "admin"
		if subjectType == "customer" {
			destination = "store"
		}
		link := recoveryLinkURL(r, challengeID, secret, "tenant", destination)
		err = s.sendRecoveryLink(sendContext, storedPhone, link, policy)
	} else {
		err = s.sendRecoveryCode(sendContext, storedPhone, secret, policy.RecoveryTTLMinutes)
	}
	cancel()
	if err != nil {
		_, _ = s.db.Exec(r.Context(), `UPDATE account_recovery_challenges SET used_at=now() WHERE id=$1::uuid`, challengeID)
		writeError(w, err)
		return
	}
	s.auditBusiness(r.Context(), "account.recovery.requested", subjectType, subjectID, map[string]any{"challenge_id": challengeID, "method": policy.RecoveryMethod})
	payload := map[string]any{
		"requested":          true,
		"challenge_id":       challengeID,
		"method":             policy.RecoveryMethod,
		"expires_in_seconds": policy.RecoveryTTLMinutes * 60,
		"message":            recoveryRequestMessage(policy.RecoveryMethod, false),
	}
	if policy.RecoveryMethod == recoveryMethodOTP {
		payload["code_length"] = recoveryCodeLength
	}
	writeJSON(w, http.StatusAccepted, payload)
}

func (s *Server) verifyAccountRecovery(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ChallengeID string `json:"challenge_id"`
		Code        string `json:"code"`
		LinkToken   string `json:"link_token"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	input.ChallengeID = strings.TrimSpace(input.ChallengeID)
	input.Code = strings.TrimSpace(input.Code)
	input.LinkToken = strings.TrimSpace(input.LinkToken)
	isLink := input.LinkToken != ""
	if input.ChallengeID == "" || (!isLink && (len(input.Code) != recoveryCodeLength || onlyDigits(input.Code) != input.Code)) {
		writeError(w, badRequest("La autorización de recuperación no es válida"))
		return
	}
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var subjectType, subjectID, storedHash string
	var attempts, maxAttempts int
	var expiresAt time.Time
	var verifiedAt, usedAt sql.NullTime
	err = tx.QueryRow(r.Context(), `
		SELECT subject_type,subject_id,code_hash,attempts,max_attempts,expires_at,verified_at,used_at
		FROM account_recovery_challenges WHERE id=$1::uuid FOR UPDATE
	`, input.ChallengeID).Scan(&subjectType, &subjectID, &storedHash, &attempts, &maxAttempts, &expiresAt, &verifiedAt, &usedAt)
	if err != nil {
		writeError(w, apiError{status: http.StatusBadRequest, msg: "La autorización de recuperación no es válida"})
		return
	}
	if usedAt.Valid || time.Now().After(expiresAt) || attempts >= maxAttempts || (verifiedAt.Valid && !isLink) {
		writeError(w, apiError{status: http.StatusBadRequest, msg: "La autorización expiró o ya fue utilizada"})
		return
	}
	hashInput := input.Code
	if isLink {
		hashInput = recoveryLinkHashInput(input.LinkToken)
	}
	expected := s.recoveryCodeHash(input.ChallengeID, hashInput)
	if subtle.ConstantTimeCompare([]byte(expected), []byte(storedHash)) != 1 {
		_, _ = tx.Exec(r.Context(), `UPDATE account_recovery_challenges SET attempts=attempts+1 WHERE id=$1::uuid`, input.ChallengeID)
		_ = tx.Commit(r.Context())
		writeError(w, apiError{status: http.StatusBadRequest, msg: "La autorización de recuperación no es válida"})
		return
	}
	if !verifiedAt.Valid {
		_, err = tx.Exec(r.Context(), `UPDATE account_recovery_challenges SET verified_at=now() WHERE id=$1::uuid`, input.ChallengeID)
		if err != nil {
			writeError(w, err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	policy := s.accessPolicy(r.Context())
	token, err := s.issueRecoveryToken(recoveryTokenPayload{ChallengeID: input.ChallengeID, SubjectType: subjectType, SubjectID: subjectID, ExpiresAt: time.Now().Add(time.Duration(policy.RecoveryTTLMinutes) * time.Minute).Unix()})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"verified": true, "reset_token": token, "expires_in_seconds": policy.RecoveryTTLMinutes * 60})
}

func (s *Server) resetAccountSecret(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ResetToken string `json:"reset_token"`
		NewPIN     string `json:"new_pin"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	payload, err := s.validateRecoveryToken(input.ResetToken)
	if err != nil {
		writeError(w, apiError{status: http.StatusUnauthorized, msg: "La autorización de recuperación expiró"})
		return
	}
	if payload.SubjectType == "customer" {
		if err := s.validateNewCustomerAccessPIN(r.Context(), input.NewPIN); err != nil {
			writeError(w, badRequest(accessPINLengthMessage(s.customerAccessPINLength(r.Context()))))
			return
		}
	} else {
		if err := s.validateNewAdminAccessPIN(r.Context(), input.NewPIN); err != nil {
			writeError(w, badRequest(accessPINLengthMessage(s.adminAccessPINLength(r.Context()))))
			return
		}
	}
	newHash, err := hashAccessSecret(input.NewPIN)
	if err != nil {
		writeError(w, err)
		return
	}
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var verifiedAt sql.NullTime
	var usedAt sql.NullTime
	err = tx.QueryRow(r.Context(), `
		SELECT verified_at,used_at FROM account_recovery_challenges
		WHERE id=$1::uuid AND subject_type=$2 AND subject_id=$3 AND expires_at>now()
		FOR UPDATE
	`, payload.ChallengeID, payload.SubjectType, payload.SubjectID).Scan(&verifiedAt, &usedAt)
	if err != nil || !verifiedAt.Valid || usedAt.Valid {
		writeError(w, apiError{status: http.StatusUnauthorized, msg: "La autorización de recuperación expiró"})
		return
	}
	switch payload.SubjectType {
	case "customer":
		_, err = tx.Exec(r.Context(), `UPDATE customers SET pin_hash=$2 WHERE id=$1::uuid`, payload.SubjectID, newHash)
	case "staff":
		_, err = tx.Exec(r.Context(), `UPDATE system_users SET pin_hash=$2,failed_login_attempts=0,locked_until=NULL,updated_at=now() WHERE id=$1::uuid`, payload.SubjectID, newHash)
	case "administrator":
		_, err = tx.Exec(r.Context(), `UPDATE admin_profiles SET password_hash=$2,updated_at=now() WHERE username=$1`, payload.SubjectID, newHash)
	default:
		err = badRequest("El tipo de cuenta no es válido")
	}
	if err != nil {
		writeError(w, err)
		return
	}
	_, err = tx.Exec(r.Context(), `UPDATE account_recovery_challenges SET used_at=now() WHERE id=$1::uuid`, payload.ChallengeID)
	if err != nil {
		writeError(w, err)
		return
	}
	if err := insertAuditTx(r.Context(), tx, "", businessActor{ID: payload.SubjectID, Role: payload.SubjectType}, "account.recovery.completed", payload.SubjectType, payload.SubjectID, map[string]any{"challenge_id": payload.ChallengeID}); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	if payload.SubjectType == "customer" {
		var whatsapp string
		if err := s.db.QueryRow(r.Context(), `SELECT whatsapp FROM customers WHERE id=$1::uuid`, payload.SubjectID).Scan(&whatsapp); err == nil {
			_, _ = s.globalDB().Exec(r.Context(), `UPDATE global_customers SET pin_hash=$2,updated_at=now() WHERE right(whatsapp_digits,10)=right($1,10)`, onlyDigits(whatsapp), newHash)
			s.propagateCustomerPINAcrossTenants(r.Context(), whatsapp, newHash)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"updated": true, "message": "Tu clave de acceso fue actualizada correctamente."})
}

func requestIPAddress(r *http.Request) string {
	value := strings.TrimSpace(r.RemoteAddr)
	if host, _, err := net.SplitHostPort(value); err == nil {
		return strings.Trim(host, "[]")
	}
	return strings.Trim(value, "[]")
}
