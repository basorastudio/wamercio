DROP INDEX IF EXISTS idx_users_owner_document_unique;
ALTER TABLE users
  DROP COLUMN IF EXISTS identity_verified_at,
  DROP COLUMN IF EXISTS gender,
  DROP COLUMN IF EXISTS birth_date,
  DROP COLUMN IF EXISTS document_number,
  DROP COLUMN IF EXISTS document_type,
  DROP COLUMN IF EXISTS last_name;
