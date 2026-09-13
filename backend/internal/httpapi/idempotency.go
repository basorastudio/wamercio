package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"unicode"

	"colmapro/backend/internal/db/sqlc"

	"github.com/jackc/pgx/v5"
)

func orderIdempotencyKey(r *http.Request) (string, error) {
	return requestIdempotencyKey(
		r,
		"La clave de confirmación del pedido supera el tamaño permitido",
		"La clave de confirmación del pedido no tiene un formato válido",
	)
}

func requestIdempotencyKey(r *http.Request, tooLongMessage, invalidMessage string) (string, error) {
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if key == "" {
		return "", nil
	}
	if len(key) > 128 {
		return "", badRequest(tooLongMessage)
	}
	for _, character := range key {
		if unicode.IsControl(character) || unicode.IsSpace(character) {
			return "", badRequest(invalidMessage)
		}
	}
	return key, nil
}

func orderRequestHash(customerID string, payload any) string {
	encoded, _ := json.Marshal(payload)
	hash := sha256.New()
	_, _ = hash.Write([]byte(customerID))
	_, _ = hash.Write([]byte{0})
	_, _ = hash.Write(encoded)
	return hex.EncodeToString(hash.Sum(nil))
}

func lookupCompletedOrderIdempotency(ctx context.Context, db sqlc.DBTX, customerID, storeID, key, requestHash string) (string, bool, error) {
	if key == "" {
		return "", false, nil
	}
	var existingHash, orderID string
	err := db.QueryRow(ctx, `
		SELECT request_hash, COALESCE(order_id::text, '')
		FROM order_idempotency
		WHERE customer_id=$1::uuid AND store_id=$2::uuid AND idempotency_key=$3
	`, customerID, storeID, key).Scan(&existingHash, &orderID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	if existingHash != requestHash {
		return "", false, apiError{status: http.StatusConflict, msg: "Esta clave de confirmación ya fue utilizada para otro pedido"}
	}
	if orderID == "" {
		return "", false, apiError{status: http.StatusConflict, msg: "El pedido todavía se está procesando. Intenta nuevamente en unos segundos"}
	}
	return orderID, true, nil
}

func reserveOrderIdempotency(ctx context.Context, tx sqlc.DBTX, customerID, storeID, key, requestHash string) (string, bool, error) {
	if key == "" {
		return "", true, nil
	}
	var acquired bool
	err := tx.QueryRow(ctx, `
		WITH purged AS (
			DELETE FROM order_idempotency
			WHERE ctid IN (
				SELECT ctid FROM order_idempotency
				WHERE created_at < now() - interval '7 days'
				ORDER BY created_at
				LIMIT 500
			)
		), inserted AS (
			INSERT INTO order_idempotency (customer_id, store_id, idempotency_key, request_hash)
			VALUES ($1::uuid, $2::uuid, $3, $4)
			ON CONFLICT (customer_id, store_id, idempotency_key) DO NOTHING
			RETURNING true AS acquired
		)
		SELECT EXISTS (SELECT 1 FROM inserted)
	`, customerID, storeID, key, requestHash).Scan(&acquired)
	if err != nil || acquired {
		return "", acquired, err
	}

	var existingHash, orderID string
	err = tx.QueryRow(ctx, `
		SELECT request_hash, COALESCE(order_id::text, '')
		FROM order_idempotency
		WHERE customer_id=$1::uuid AND store_id=$2::uuid AND idempotency_key=$3
	`, customerID, storeID, key).Scan(&existingHash, &orderID)
	if err != nil {
		return "", false, err
	}
	if existingHash != requestHash {
		return "", false, apiError{status: http.StatusConflict, msg: "Esta clave de confirmación ya fue utilizada para otro pedido"}
	}
	if orderID == "" {
		return "", false, apiError{status: http.StatusConflict, msg: "El pedido todavía se está procesando. Intenta nuevamente en unos segundos"}
	}
	return orderID, false, nil
}

func completeOrderIdempotency(ctx context.Context, tx sqlc.DBTX, customerID, storeID, key, orderID string) error {
	if key == "" {
		return nil
	}
	result, err := tx.Exec(ctx, `
		UPDATE order_idempotency
		SET order_id=$4::uuid, updated_at=now()
		WHERE customer_id=$1::uuid AND store_id=$2::uuid AND idempotency_key=$3
	`, customerID, storeID, key, orderID)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return fmt.Errorf("order idempotency record was not completed")
	}
	return nil
}

func saleByID(ctx context.Context, db sqlc.DBTX, orderID string) (Sale, error) {
	var sale Sale
	err := db.QueryRow(ctx, `
		SELECT id::text, store_id::text, items, total, method, customer, date,
		       COALESCE(customer_id::text, ''), delivery_address, status, order_type
		FROM sales
		WHERE id=$1::uuid
	`, orderID).Scan(saleScanPtrs(&sale)...)
	return sale, err
}
