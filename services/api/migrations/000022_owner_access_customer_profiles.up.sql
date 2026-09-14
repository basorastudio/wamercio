-- WAMERCIO 2.5.8: owner storefront handoff + global customer WhatsApp profile.
ALTER TABLE global_customers
  ADD COLUMN IF NOT EXISTS whatsapp_name varchar(190),
  ADD COLUMN IF NOT EXISTS profile_picture_url text,
  ADD COLUMN IF NOT EXISTS profile_picture_id varchar(190),
  ADD COLUMN IF NOT EXISTS profile_picture_updated_at timestamptz;

CREATE TABLE IF NOT EXISTS owner_sso_tokens (
  token_hash char(64) PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_hostname varchar(253) NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_owner_sso_tokens_expiry
  ON owner_sso_tokens(expires_at)
  WHERE used_at IS NULL;

-- Reuse the most recent WhatsApp profile already learned by a tenant conversation
-- when the global customer phone matches, so existing customers get an avatar
-- immediately after this migration when possible.
UPDATE global_customers gc
SET whatsapp_name = coalesce(nullif(gc.whatsapp_name,''), (
      SELECT nullif(c.whatsapp_name,'')
      FROM conversations c
      WHERE regexp_replace(coalesce(c.whatsapp_phone,''),'[^0-9]','','g') = gc.phone
        AND coalesce(c.whatsapp_name,'') <> ''
      ORDER BY c.profile_picture_updated_at DESC NULLS LAST, c.updated_at DESC
      LIMIT 1
    )),
    profile_picture_url = coalesce(nullif(gc.profile_picture_url,''), (
      SELECT nullif(c.profile_picture_url,'')
      FROM conversations c
      WHERE regexp_replace(coalesce(c.whatsapp_phone,''),'[^0-9]','','g') = gc.phone
        AND coalesce(c.profile_picture_url,'') <> ''
      ORDER BY c.profile_picture_updated_at DESC NULLS LAST, c.updated_at DESC
      LIMIT 1
    )),
    profile_picture_id = coalesce(nullif(gc.profile_picture_id,''), (
      SELECT nullif(c.profile_picture_id,'')
      FROM conversations c
      WHERE regexp_replace(coalesce(c.whatsapp_phone,''),'[^0-9]','','g') = gc.phone
        AND coalesce(c.profile_picture_id,'') <> ''
      ORDER BY c.profile_picture_updated_at DESC NULLS LAST, c.updated_at DESC
      LIMIT 1
    )),
    profile_picture_updated_at = coalesce(gc.profile_picture_updated_at, (
      SELECT c.profile_picture_updated_at
      FROM conversations c
      WHERE regexp_replace(coalesce(c.whatsapp_phone,''),'[^0-9]','','g') = gc.phone
        AND c.profile_picture_updated_at IS NOT NULL
      ORDER BY c.profile_picture_updated_at DESC
      LIMIT 1
    ));
