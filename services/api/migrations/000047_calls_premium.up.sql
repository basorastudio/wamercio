-- WAMERCIO 4.0 / WAMERCIO Calls: capa SaaS y registro operativo.
-- El transporte WebRTC/WACalls vive en el whatsapp-bridge; esta migración
-- mantiene el modelo multi-tenant y la trazabilidad independiente del motor.
CREATE TABLE IF NOT EXISTS store_call_settings (
  store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT false,
  record_calls boolean NOT NULL DEFAULT false,
  transcribe_calls boolean NOT NULL DEFAULT false,
  ring_seconds int NOT NULL DEFAULT 30 CHECK (ring_seconds BETWEEN 5 AND 120),
  routing_strategy varchar(24) NOT NULL DEFAULT 'least_load' CHECK (routing_strategy IN ('manual','round_robin','least_load','random')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  remote_jid varchar(190) NOT NULL DEFAULT '',
  phone varchar(40) NOT NULL DEFAULT '',
  display_name varchar(190) NOT NULL DEFAULT '',
  direction varchar(8) NOT NULL CHECK (direction IN ('in','out')),
  status varchar(24) NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','connecting','active','held','transferred','completed','missed','rejected','failed')),
  assigned_staff_id uuid REFERENCES store_staff(id) ON DELETE SET NULL,
  external_call_id varchar(190) NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds int NOT NULL DEFAULT 0,
  recording_url text NOT NULL DEFAULT '',
  transcript text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_calls_store ON whatsapp_calls(store_id,started_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_calls_staff ON whatsapp_calls(assigned_staff_id,status,started_at DESC);

CREATE TABLE IF NOT EXISTS call_events (
  id bigserial PRIMARY KEY,
  call_id uuid NOT NULL REFERENCES whatsapp_calls(id) ON DELETE CASCADE,
  event_type varchar(40) NOT NULL,
  actor_staff_id uuid REFERENCES store_staff(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_call_events_call ON call_events(call_id,created_at);

INSERT INTO store_call_settings(store_id)
SELECT id FROM stores ON CONFLICT(store_id) DO NOTHING;
