DROP TABLE IF EXISTS owner_sso_tokens;
ALTER TABLE global_customers
  DROP COLUMN IF EXISTS profile_picture_updated_at,
  DROP COLUMN IF EXISTS profile_picture_id,
  DROP COLUMN IF EXISTS profile_picture_url,
  DROP COLUMN IF EXISTS whatsapp_name;
