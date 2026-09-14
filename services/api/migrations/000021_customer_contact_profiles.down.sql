DROP INDEX IF EXISTS idx_conversations_whatsapp_phone;
ALTER TABLE conversations
  DROP COLUMN IF EXISTS profile_picture_updated_at,
  DROP COLUMN IF EXISTS profile_picture_id,
  DROP COLUMN IF EXISTS profile_picture_url,
  DROP COLUMN IF EXISTS whatsapp_phone,
  DROP COLUMN IF EXISTS whatsapp_name,
  DROP COLUMN IF EXISTS contact_status,
  DROP COLUMN IF EXISTS contact_notes,
  DROP COLUMN IF EXISTS contact_address,
  DROP COLUMN IF EXISTS contact_name;
