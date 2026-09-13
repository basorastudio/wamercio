package httpapi

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func normalizeCentralRecoverySubject(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "platform", "saas", "superadmin":
		return "platform"
	case "owner", "propietario":
		return "owner"
	default:
		return ""
	}
}

func (s *Server) findCentralRecoverySubject(ctx context.Context, subjectType, phoneDigits string) (string, string, error) {
	phoneDigits = onlyDigits(phoneDigits)
	switch subjectType {
	case "platform":
		var id, whatsapp string
		err := s.platformDB().QueryRow(ctx, `
			SELECT id::text, whatsapp
			FROM platform_users
			WHERE active=true
			  AND regexp_replace(whatsapp,'\D','','g') <> ''
			  AND (
			    regexp_replace(whatsapp,'\D','','g')=$1
			    OR right(regexp_replace(whatsapp,'\D','','g'),10)=right($1,10)
			  )
			ORDER BY is_root DESC, updated_at DESC
			LIMIT 1
		`, phoneDigits).Scan(&id, &whatsapp)
		return id, whatsapp, err
	case "owner":
		var id, whatsapp string
		err := s.platformDB().QueryRow(ctx, `
			SELECT id::text, whatsapp
			FROM platform_owners
			WHERE status='active'
			  AND whatsapp_digits <> ''
			  AND (whatsapp_digits=$1 OR right(whatsapp_digits,10)=right($1,10))
			ORDER BY updated_at DESC
			LIMIT 1
		`, phoneDigits).Scan(&id, &whatsapp)
		return id, whatsapp, err
	default:
		return "", "", badRequest("El tipo de cuenta no es válido")
	}
}

func (s *Server) requestCentralAccountRecovery(w http.ResponseWriter, r *http.Request) {
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
	subjectType := normalizeCentralRecoverySubject(input.SubjectType)
	phoneDigits := onlyDigits(input.Whatsapp)
	if subjectType == "" || len(phoneDigits) < 10 {
		writeError(w, badRequest("Completa un número de WhatsApp válido"))
		return
	}
	subjectID, storedPhone, err := s.findCentralRecoverySubject(r.Context(), subjectType, phoneDigits)
	if errors.Is(err, pgx.ErrNoRows) {
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
	err = s.platformDB().QueryRow(r.Context(), `
		INSERT INTO platform_account_recovery_challenges
		  (subject_type,subject_id,whatsapp_digits,code_hash,expires_at,max_attempts,requested_ip)
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
	if _, err := s.platformDB().Exec(r.Context(), `UPDATE platform_account_recovery_challenges SET code_hash=$2 WHERE id=$1::uuid`, challengeID, hash); err != nil {
		writeError(w, err)
		return
	}
	sendContext, cancel := context.WithTimeout(r.Context(), s.waxumTimeout())
	if policy.RecoveryMethod == recoveryMethodLink {
		link := recoveryLinkURL(r, challengeID, secret, "central", "admin")
		err = s.sendRecoveryLink(sendContext, storedPhone, link, policy)
	} else {
		err = s.sendRecoveryCode(sendContext, storedPhone, secret, policy.RecoveryTTLMinutes)
	}
	cancel()
	if err != nil {
		_, _ = s.platformDB().Exec(r.Context(), `UPDATE platform_account_recovery_challenges SET used_at=now() WHERE id=$1::uuid`, challengeID)
		writeError(w, err)
		return
	}
	s.auditPlatform(r.Context(), "recuperacion-acceso", "", "platform.account_recovery.requested", map[string]any{"subject_type": subjectType, "subject_id": subjectID, "challenge_id": challengeID, "method": policy.RecoveryMethod})
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

func (s *Server) verifyCentralAccountRecovery(w http.ResponseWriter, r *http.Request) {
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
	tx, err := s.platformDB().BeginTx(r.Context(), pgx.TxOptions{})
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
		FROM platform_account_recovery_challenges
		WHERE id=$1::uuid
		FOR UPDATE
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
		_, _ = tx.Exec(r.Context(), `UPDATE platform_account_recovery_challenges SET attempts=attempts+1 WHERE id=$1::uuid`, input.ChallengeID)
		_ = tx.Commit(r.Context())
		writeError(w, apiError{status: http.StatusBadRequest, msg: "La autorización de recuperación no es válida"})
		return
	}
	if !verifiedAt.Valid {
		if _, err = tx.Exec(r.Context(), `UPDATE platform_account_recovery_challenges SET verified_at=now() WHERE id=$1::uuid`, input.ChallengeID); err != nil {
			writeError(w, err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	policy := s.accessPolicy(r.Context())
	token, err := s.issueRecoveryToken(recoveryTokenPayload{
		ChallengeID: input.ChallengeID,
		SubjectType: subjectType,
		SubjectID:   subjectID,
		ExpiresAt:   time.Now().Add(time.Duration(policy.RecoveryTTLMinutes) * time.Minute).Unix(),
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"verified": true, "reset_token": token, "expires_in_seconds": policy.RecoveryTTLMinutes * 60})
}

func (s *Server) resetCentralAccountSecret(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ResetToken string `json:"reset_token"`
		NewPIN     string `json:"new_pin"`
	}
	if err := readJSON(r, &input); err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	if err := s.validateNewAccessPIN(r.Context(), input.NewPIN); err != nil {
		writeError(w, err)
		return
	}
	payload, err := s.validateRecoveryToken(input.ResetToken)
	if err != nil || (payload.SubjectType != "platform" && payload.SubjectType != "owner") {
		writeError(w, apiError{status: http.StatusUnauthorized, msg: "La autorización de recuperación expiró"})
		return
	}
	newHash, err := hashAccessSecret(input.NewPIN)
	if err != nil {
		writeError(w, err)
		return
	}
	tx, err := s.platformDB().BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback(r.Context())

	var verifiedAt, usedAt sql.NullTime
	err = tx.QueryRow(r.Context(), `
		SELECT verified_at,used_at
		FROM platform_account_recovery_challenges
		WHERE id=$1::uuid AND subject_type=$2 AND subject_id=$3 AND expires_at>now()
		FOR UPDATE
	`, payload.ChallengeID, payload.SubjectType, payload.SubjectID).Scan(&verifiedAt, &usedAt)
	if err != nil || !verifiedAt.Valid || usedAt.Valid {
		writeError(w, apiError{status: http.StatusUnauthorized, msg: "La autorización de recuperación expiró"})
		return
	}

	switch payload.SubjectType {
	case "platform":
		_, err = tx.Exec(r.Context(), `UPDATE platform_users SET password_hash=$2,updated_at=now() WHERE id=$1::uuid AND active=true`, payload.SubjectID, newHash)
	case "owner":
		_, err = tx.Exec(r.Context(), `UPDATE platform_owners SET password_hash=$2,updated_at=now() WHERE id=$1::uuid AND status='active'`, payload.SubjectID, newHash)
	}
	if err != nil {
		writeError(w, err)
		return
	}
	if _, err = tx.Exec(r.Context(), `UPDATE platform_account_recovery_challenges SET used_at=now() WHERE id=$1::uuid`, payload.ChallengeID); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, err)
		return
	}

	if payload.SubjectType == "owner" {
		s.propagateOwnerRecoveredPIN(r.Context(), payload.SubjectID, newHash)
	}
	s.auditPlatform(r.Context(), "recuperacion-acceso", "", "platform.account_recovery.completed", map[string]any{"subject_type": payload.SubjectType, "subject_id": payload.SubjectID, "challenge_id": payload.ChallengeID})
	writeJSON(w, http.StatusOK, map[string]any{"updated": true, "message": "Tu PIN de acceso fue actualizado correctamente."})
}

func (s *Server) propagateOwnerRecoveredPIN(ctx context.Context, ownerID, passwordHash string) {
	if s.tenantManager == nil || strings.TrimSpace(ownerID) == "" || strings.TrimSpace(passwordHash) == "" {
		return
	}
	var phoneDigits string
	if err := s.platformDB().QueryRow(ctx, `SELECT whatsapp_digits FROM platform_owners WHERE id=$1::uuid`, ownerID).Scan(&phoneDigits); err != nil {
		return
	}
	tenants, err := s.tenantManager.ListTenants(ctx)
	if err != nil {
		return
	}
	for _, tenant := range tenants {
		if tenant.Status != "active" && tenant.Status != "trial" {
			continue
		}
		var linked bool
		if err := s.platformDB().QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM tenants WHERE id=$1::uuid AND owner_id=$2::uuid)`, tenant.ID, ownerID).Scan(&linked); err != nil || !linked {
			continue
		}
		pool, err := s.tenantManager.Pool(ctx, tenant)
		if err != nil {
			continue
		}
		_, _ = pool.Exec(ctx, `
			UPDATE admin_profiles
			SET password_hash=$2,updated_at=now()
			WHERE regexp_replace(whatsapp,'\D','','g')=$1
			   OR right(regexp_replace(whatsapp,'\D','','g'),10)=right($1,10)
			   OR regexp_replace(username,'\D','','g')=$1
			   OR right(regexp_replace(username,'\D','','g'),10)=right($1,10)
		`, phoneDigits, passwordHash)
	}
}
