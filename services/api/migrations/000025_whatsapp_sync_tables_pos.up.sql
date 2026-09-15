-- WAMERCIO 2.5.8: controlled WhatsApp history sync, tables/reservations and richer POS.

ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS history_sync_mode varchar(20) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS history_sync_from date,
  ADD COLUMN IF NOT EXISTS history_sync_to date,
  ADD COLUMN IF NOT EXISTS history_sync_last_at timestamptz,
  ADD COLUMN IF NOT EXISTS history_sync_status varchar(24) NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS history_sync_error text;

CREATE TABLE IF NOT EXISTS whatsapp_history_anchors (
  session_key text NOT NULL,
  chat_jid text NOT NULL,
  message_id text NOT NULL,
  message_timestamp timestamptz NOT NULL,
  from_me boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_key, chat_jid)
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_history_anchors_session_time
  ON whatsapp_history_anchors(session_key, message_timestamp DESC);

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS dine_in_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reservation_duration_minutes int NOT NULL DEFAULT 90;

CREATE TABLE IF NOT EXISTS store_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  capacity int NOT NULL DEFAULT 4 CHECK (capacity > 0 AND capacity <= 50),
  sort_order int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, name)
);
CREATE INDEX IF NOT EXISTS idx_store_tables_store_active
  ON store_tables(store_id, is_active, sort_order);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS table_id uuid REFERENCES store_tables(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reservation_at timestamptz,
  ADD COLUMN IF NOT EXISTS party_size int;

CREATE TABLE IF NOT EXISTS table_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES store_tables(id) ON DELETE RESTRICT,
  global_customer_id uuid REFERENCES global_customers(id) ON DELETE SET NULL,
  order_id uuid UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  reserved_at timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 90 CHECK (duration_minutes BETWEEN 15 AND 480),
  party_size int NOT NULL DEFAULT 1 CHECK (party_size > 0 AND party_size <= 50),
  status varchar(24) NOT NULL DEFAULT 'reserved',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_table_reservations_availability
  ON table_reservations(store_id, table_id, reserved_at)
  WHERE status NOT IN ('canceled','cancelled','completed');
