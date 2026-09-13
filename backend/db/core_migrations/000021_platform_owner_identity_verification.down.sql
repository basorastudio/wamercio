ALTER TABLE platform_owners
  DROP CONSTRAINT IF EXISTS platform_owners_identity_verification_status_check,
  DROP COLUMN IF EXISTS identity_confirmed_by_user,
  DROP COLUMN IF EXISTS identity_requires_confirmation,
  DROP COLUMN IF EXISTS identity_request_id,
  DROP COLUMN IF EXISTS identity_source,
  DROP COLUMN IF EXISTS identity_verification_status,
  DROP COLUMN IF EXISTS identity_verified_at;
