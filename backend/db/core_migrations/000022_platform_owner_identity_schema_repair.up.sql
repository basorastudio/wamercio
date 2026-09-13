-- Repair installations where migration version 21 was recorded but the
-- identity columns were not actually created, and keep upgrades idempotent.
ALTER TABLE platform_owners
  ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_verification_status varchar(32) NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS identity_source varchar(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS identity_request_id varchar(128) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS identity_requires_confirmation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS identity_confirmed_by_user boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'platform_owners_identity_verification_status_check'
      AND conrelid = 'public.platform_owners'::regclass
  ) THEN
    ALTER TABLE platform_owners
      ADD CONSTRAINT platform_owners_identity_verification_status_check
      CHECK (identity_verification_status IN ('unverified','verified','pending_manual','failed'));
  END IF;
END
$$;
