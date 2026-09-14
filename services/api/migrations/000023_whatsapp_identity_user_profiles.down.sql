DROP INDEX IF EXISTS idx_store_staff_document;

ALTER TABLE support_whatsapp_session
  DROP COLUMN IF EXISTS profile_picture_updated_at,
  DROP COLUMN IF EXISTS profile_picture_id,
  DROP COLUMN IF EXISTS profile_picture_url,
  DROP COLUMN IF EXISTS whatsapp_name;

ALTER TABLE whatsapp_sessions
  DROP COLUMN IF EXISTS profile_picture_updated_at,
  DROP COLUMN IF EXISTS profile_picture_id,
  DROP COLUMN IF EXISTS profile_picture_url,
  DROP COLUMN IF EXISTS whatsapp_name;

ALTER TABLE store_staff
  DROP COLUMN IF EXISTS profile_picture_updated_at,
  DROP COLUMN IF EXISTS profile_picture_id,
  DROP COLUMN IF EXISTS profile_picture_url,
  DROP COLUMN IF EXISTS whatsapp_name,
  DROP COLUMN IF EXISTS whatsapp_verified_at,
  DROP COLUMN IF EXISTS identity_verified_at,
  DROP COLUMN IF EXISTS gender,
  DROP COLUMN IF EXISTS birth_date,
  DROP COLUMN IF EXISTS document_number,
  DROP COLUMN IF EXISTS last_name;

ALTER TABLE users
  DROP COLUMN IF EXISTS profile_picture_updated_at,
  DROP COLUMN IF EXISTS profile_picture_id,
  DROP COLUMN IF EXISTS profile_picture_url,
  DROP COLUMN IF EXISTS whatsapp_name;
