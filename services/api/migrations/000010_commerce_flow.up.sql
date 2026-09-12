-- WAMERCIO 1.9: close the conversational-commerce loop.
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS accepting_orders boolean NOT NULL DEFAULT true;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS public_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_orders_conversation ON orders(conversation_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_public_token ON orders(public_token);

-- WhatsApp is a core capability, not a plan feature.
UPDATE plans SET whatsapp_enabled=true;

-- Merchant owners authenticate only with WhatsApp + PIN. Password remains required only by SuperAdmin.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
UPDATE users SET password_hash=NULL WHERE role='owner';

-- Preserve existing data while making the old separate phone field obsolete.
UPDATE stores SET whatsapp=coalesce(nullif(whatsapp,''),phone), phone=NULL WHERE phone IS NOT NULL;

-- Queue used for reliable outbound system notifications. Failed messages can be retried safely.
CREATE TABLE IF NOT EXISTS message_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  destination varchar(190) NOT NULL,
  body text NOT NULL,
  kind varchar(40) NOT NULL DEFAULT 'system',
  status varchar(20) NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  available_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_message_outbox_pending ON message_outbox(status,available_at) WHERE status IN ('pending','retry');

-- Reusable WhatsApp replies keep common answers one tap away without adding a separate module.
CREATE TABLE IF NOT EXISTS quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  title varchar(80) NOT NULL,
  body text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quick_replies_store ON quick_replies(store_id,sort_order,created_at);
