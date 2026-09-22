-- WAMERCIO 4.3.3: Calls is part of the core WhatsApp experience.
-- Existing stores created while the feature defaulted to false are activated
-- so inbound/outbound calls work immediately after deployment.
ALTER TABLE store_call_settings
  ALTER COLUMN is_active SET DEFAULT true;

UPDATE store_call_settings
SET is_active = true,
    updated_at = now()
WHERE is_active = false;
