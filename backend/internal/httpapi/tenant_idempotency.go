package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"

	"colmapro/backend/internal/db/sqlc"
	"colmapro/backend/internal/platform/tenancy"

	"github.com/jackc/pgx/v5"
)

type tenantProvisioningReservation struct {
	TenantID string
	Replay   bool
}

func tenantProvisioningHash(input tenancy.TenantProvisionInput) string {
	encoded, _ := json.Marshal(input)
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:])
}

func reserveTenantProvisioning(ctx context.Context, db sqlc.DBTX, ownerID, key, requestHash string) (tenantProvisioningReservation, error) {
	if key == "" {
		return tenantProvisioningReservation{}, nil
	}
	var inserted bool
	err := db.QueryRow(ctx, `
		WITH purged AS (
			DELETE FROM tenant_provisioning_requests
			WHERE ctid IN (
				SELECT ctid FROM tenant_provisioning_requests
				WHERE status IN ('completed', 'failed') AND updated_at < now() - interval '30 days'
				ORDER BY updated_at LIMIT 100
			)
		), inserted AS (
			INSERT INTO tenant_provisioning_requests (owner_id, idempotency_key, request_hash)
			VALUES ($1::uuid, $2, $3)
			ON CONFLICT (owner_id, idempotency_key) DO NOTHING
			RETURNING true
		)
		SELECT EXISTS (SELECT 1 FROM inserted)
	`, ownerID, key, requestHash).Scan(&inserted)
	if err != nil || inserted {
		return tenantProvisioningReservation{}, err
	}

	var existingHash, tenantID, status string
	err = db.QueryRow(ctx, `
		SELECT request_hash, COALESCE(tenant_id::text, ''), status
		FROM tenant_provisioning_requests
		WHERE owner_id=$1::uuid AND idempotency_key=$2
	`, ownerID, key).Scan(&existingHash, &tenantID, &status)
	if err != nil {
		return tenantProvisioningReservation{}, err
	}
	if existingHash != requestHash {
		return tenantProvisioningReservation{}, apiError{status: http.StatusConflict, msg: "Esta clave de creación ya fue utilizada para otro negocio"}
	}
	if status == "completed" && tenantID != "" {
		return tenantProvisioningReservation{TenantID: tenantID, Replay: true}, nil
	}

	var acquired bool
	err = db.QueryRow(ctx, `
		UPDATE tenant_provisioning_requests
		SET status='processing', stage=CASE WHEN tenant_id IS NULL THEN 'requested' ELSE stage END,
		    lease_expires_at=now() + interval '10 minutes', updated_at=now()
		WHERE owner_id=$1::uuid AND idempotency_key=$2
		  AND (status='failed' OR lease_expires_at <= now())
		RETURNING true
	`, ownerID, key).Scan(&acquired)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return tenantProvisioningReservation{}, apiError{status: http.StatusConflict, msg: "La creación del negocio todavía está en proceso. Intenta nuevamente en unos minutos"}
		}
		return tenantProvisioningReservation{}, err
	}
	if !acquired {
		return tenantProvisioningReservation{}, apiError{status: http.StatusConflict, msg: "La creación del negocio todavía está en proceso. Intenta nuevamente en unos minutos"}
	}
	return tenantProvisioningReservation{TenantID: tenantID}, nil
}

func markTenantProvisioningStage(ctx context.Context, db sqlc.DBTX, ownerID, key, tenantID, status, stage string) error {
	if key == "" {
		return nil
	}
	_, err := db.Exec(ctx, `
		UPDATE tenant_provisioning_requests
		SET tenant_id=COALESCE(NULLIF($3, '')::uuid, tenant_id), status=$4, stage=$5,
		    stage_history=CASE WHEN stage=$5 THEN stage_history ELSE stage_history || jsonb_build_array($5) END,
		    lease_expires_at=CASE WHEN $4='processing' THEN now() + interval '10 minutes' ELSE now() END,
		    updated_at=now()
		WHERE owner_id=$1::uuid AND idempotency_key=$2
	`, ownerID, key, tenantID, status, stage)
	return err
}
