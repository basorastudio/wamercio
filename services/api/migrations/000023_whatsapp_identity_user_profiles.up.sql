-- WAMERCIO 2.5.8: perfiles WhatsApp visibles, identidad completa de usuarios internos
-- y datos de la cuenta vinculada en sesiones de WhatsApp.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS whatsapp_name varchar(190),
  ADD COLUMN IF NOT EXISTS profile_picture_url text,
  ADD COLUMN IF NOT EXISTS profile_picture_id varchar(190),
  ADD COLUMN IF NOT EXISTS profile_picture_updated_at timestamptz;

ALTER TABLE store_staff
  ADD COLUMN IF NOT EXISTS last_name varchar(160),
  ADD COLUMN IF NOT EXISTS document_number varchar(30),
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS gender varchar(20),
  ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_name varchar(190),
  ADD COLUMN IF NOT EXISTS profile_picture_url text,
  ADD COLUMN IF NOT EXISTS profile_picture_id varchar(190),
  ADD COLUMN IF NOT EXISTS profile_picture_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_store_staff_document
  ON store_staff(store_id, document_number)
  WHERE coalesce(document_number,'')<>'';

ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS whatsapp_name varchar(190),
  ADD COLUMN IF NOT EXISTS profile_picture_url text,
  ADD COLUMN IF NOT EXISTS profile_picture_id varchar(190),
  ADD COLUMN IF NOT EXISTS profile_picture_updated_at timestamptz;

ALTER TABLE support_whatsapp_session
  ADD COLUMN IF NOT EXISTS whatsapp_name varchar(190),
  ADD COLUMN IF NOT EXISTS profile_picture_url text,
  ADD COLUMN IF NOT EXISTS profile_picture_id varchar(190),
  ADD COLUMN IF NOT EXISTS profile_picture_updated_at timestamptz;
