ALTER TABLE platform_users
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
    WHERE conname = 'platform_users_identity_verification_status_check'
      AND conrelid = 'public.platform_users'::regclass
  ) THEN
    ALTER TABLE platform_users
      ADD CONSTRAINT platform_users_identity_verification_status_check
      CHECK (identity_verification_status IN ('unverified','verified','pending_manual','failed'));
  END IF;
END
$$;
