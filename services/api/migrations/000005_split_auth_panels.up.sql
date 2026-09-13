-- WAMERCIO 1.2: separate SaaS SuperAdmin access from merchant/store access.

ALTER TABLE users
  ALTER COLUMN email DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS pin_hash text,
  ADD COLUMN IF NOT EXISTS pin_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;


UPDATE users
SET phone = CASE
  WHEN length(regexp_replace(coalesce(phone,''),'[^0-9]','','g')) = 10 THEN '1' || regexp_replace(phone,'[^0-9]','','g')
  ELSE regexp_replace(coalesce(phone,''),'[^0-9]','','g')
END
WHERE role='owner' AND coalesce(phone,'') <> '';

CREATE INDEX IF NOT EXISTS idx_users_owner_phone ON users(phone) WHERE role='owner';

-- Existing merchant accounts keep working at data level, but must receive a 4-digit
-- PIN from the SuperAdmin before using the new WhatsApp + PIN merchant login.
