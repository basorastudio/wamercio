DROP TABLE IF EXISTS quick_replies;
UPDATE users SET password_hash=coalesce(pin_hash,'disabled') WHERE password_hash IS NULL;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
DROP TABLE IF EXISTS message_outbox;
DROP INDEX IF EXISTS idx_orders_public_token;
DROP INDEX IF EXISTS idx_orders_conversation;
ALTER TABLE orders DROP COLUMN IF EXISTS public_token;
ALTER TABLE orders DROP COLUMN IF EXISTS conversation_id;
ALTER TABLE stores DROP COLUMN IF EXISTS accepting_orders;
