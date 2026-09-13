package database

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// EnsurePlatformOwnerIdentitySchema repairs installations where the identity
// application code was deployed before the corresponding core migration ran,
// or where a migration version was marked as applied without all columns being
// present. The statement is idempotent and safe during rolling deployments.
func EnsurePlatformOwnerIdentitySchema(ctx context.Context, pool *pgxpool.Pool) error {
	if pool == nil {
		return errors.New("central database pool is nil")
	}

	var tableExists bool
	if err := pool.QueryRow(ctx, `SELECT to_regclass('public.platform_owners') IS NOT NULL`).Scan(&tableExists); err != nil {
		return fmt.Errorf("check platform_owners table: %w", err)
	}
	if !tableExists {
		return errors.New("platform_owners table does not exist; run core migrations")
	}

	var existingColumns int
	if err := pool.QueryRow(ctx, `
		SELECT count(*)
		FROM information_schema.columns
		WHERE table_schema='public'
		  AND table_name='platform_owners'
		  AND column_name = ANY($1::text[])
	`, []string{
		"identity_verified_at",
		"identity_verification_status",
		"identity_source",
		"identity_request_id",
		"identity_requires_confirmation",
		"identity_confirmed_by_user",
	}).Scan(&existingColumns); err != nil {
		return fmt.Errorf("check platform owner identity columns: %w", err)
	}
	if existingColumns == 6 {
		return nil
	}

	if _, err := pool.Exec(ctx, `
		ALTER TABLE platform_owners
		  ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz,
		  ADD COLUMN IF NOT EXISTS identity_verification_status varchar(32) NOT NULL DEFAULT 'unverified',
		  ADD COLUMN IF NOT EXISTS identity_source varchar(64) NOT NULL DEFAULT '',
		  ADD COLUMN IF NOT EXISTS identity_request_id varchar(128) NOT NULL DEFAULT '',
		  ADD COLUMN IF NOT EXISTS identity_requires_confirmation boolean NOT NULL DEFAULT false,
		  ADD COLUMN IF NOT EXISTS identity_confirmed_by_user boolean NOT NULL DEFAULT false
	`); err != nil {
		return fmt.Errorf("repair platform owner identity columns: %w", err)
	}
	return nil
}
