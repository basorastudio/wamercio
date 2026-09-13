DROP INDEX IF EXISTS idx_users_owner_phone;
ALTER TABLE users
  DROP COLUMN IF EXISTS last_login_at,
  DROP COLUMN IF EXISTS pin_changed_at,
  DROP COLUMN IF EXISTS pin_hash;
-- email intentionally remains nullable on rollback to avoid failing if merchant accounts have no email.
