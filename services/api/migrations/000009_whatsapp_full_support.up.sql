-- WAMERCIO 1.7: full WhatsApp media metadata + SaaS support WhatsApp center.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS mime_type varchar(160),
  ADD COLUMN IF NOT EXISTS file_name varchar(255),
  ADD COLUMN IF NOT EXISTS file_size bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS caption text;

CREATE TABLE IF NOT EXISTS support_whatsapp_session (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  jid varchar(190),
  whatsapp varchar(40),
  status varchar(30) NOT NULL DEFAULT 'disconnected',
  last_seen_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO support_whatsapp_session(singleton) VALUES(true) ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS support_whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  remote_jid varchar(190) NOT NULL UNIQUE,
  whatsapp varchar(40),
  display_name varchar(190),
  unread_count int NOT NULL DEFAULT 0,
  last_message text,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_wa_owner ON support_whatsapp_conversations(owner_id);
CREATE INDEX IF NOT EXISTS idx_support_wa_last ON support_whatsapp_conversations(last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS support_whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES support_whatsapp_conversations(id) ON DELETE CASCADE,
  message_id varchar(190),
  direction varchar(10) NOT NULL CHECK(direction IN ('in','out')),
  type varchar(30) NOT NULL DEFAULT 'text',
  body text,
  media_url text,
  mime_type varchar(160),
  file_name varchar(255),
  file_size bigint NOT NULL DEFAULT 0,
  caption text,
  status varchar(30),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id,message_id)
);
CREATE INDEX IF NOT EXISTS idx_support_wa_messages ON support_whatsapp_messages(conversation_id,occurred_at);

-- Store phone is no longer a separate user-facing concept; WhatsApp is the canonical contact channel.
UPDATE stores SET whatsapp=coalesce(nullif(whatsapp,''),phone), phone=NULL WHERE coalesce(whatsapp,'')='' OR phone IS NOT NULL;
