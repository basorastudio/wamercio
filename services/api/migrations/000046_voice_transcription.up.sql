-- WAMERCIO 4.0 / fase 3.5: transcripción de notas de voz.
CREATE TABLE IF NOT EXISTS store_transcription_settings (
  store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT false,
  auto_transcribe_voice_notes boolean NOT NULL DEFAULT true,
  language varchar(16) NOT NULL DEFAULT 'es',
  provider varchar(30) NOT NULL DEFAULT 'openai_compatible',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  text text NOT NULL DEFAULT '',
  language varchar(16) NOT NULL DEFAULT 'es',
  engine varchar(80) NOT NULL DEFAULT '',
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed','skipped')),
  error text,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id)
);
CREATE INDEX IF NOT EXISTS idx_message_transcripts_conversation ON message_transcripts(conversation_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_transcripts_search ON message_transcripts(store_id,status,created_at DESC);

INSERT INTO store_transcription_settings(store_id)
SELECT id FROM stores ON CONFLICT(store_id) DO NOTHING;
