-- WAMERCIO 4.3.4: one persisted row per WhatsApp call and stable live identity.
-- Older builds could POST the same incoming ringing event concurrently through
-- OnIncoming + OnStateChange, creating duplicate "Perdida" rows for one call.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY store_id, external_call_id
           ORDER BY updated_at DESC, started_at DESC, id DESC
         ) AS rn
  FROM whatsapp_calls
  WHERE external_call_id <> ''
)
DELETE FROM whatsapp_calls c
USING ranked r
WHERE c.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_calls_store_external
  ON whatsapp_calls(store_id, external_call_id)
  WHERE external_call_id <> '';
