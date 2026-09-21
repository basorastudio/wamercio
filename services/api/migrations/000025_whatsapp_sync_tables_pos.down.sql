DROP INDEX IF EXISTS idx_table_reservations_availability;
DROP TABLE IF EXISTS table_reservations;

ALTER TABLE orders
  DROP COLUMN IF EXISTS party_size,
  DROP COLUMN IF EXISTS reservation_at,
  DROP COLUMN IF EXISTS table_id;

DROP INDEX IF EXISTS idx_store_tables_store_active;
DROP TABLE IF EXISTS store_tables;

ALTER TABLE stores
  DROP COLUMN IF EXISTS reservation_duration_minutes,
  DROP COLUMN IF EXISTS dine_in_enabled;

DROP INDEX IF EXISTS idx_whatsapp_history_anchors_session_time;
DROP TABLE IF EXISTS whatsapp_history_anchors;

ALTER TABLE whatsapp_sessions
  DROP COLUMN IF EXISTS history_sync_error,
  DROP COLUMN IF EXISTS history_sync_status,
  DROP COLUMN IF EXISTS history_sync_last_at,
  DROP COLUMN IF EXISTS history_sync_to,
  DROP COLUMN IF EXISTS history_sync_from,
  DROP COLUMN IF EXISTS history_sync_mode;
