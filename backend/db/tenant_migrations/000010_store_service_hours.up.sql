ALTER TABLE stores
ADD COLUMN IF NOT EXISTS service_hours jsonb NOT NULL DEFAULT '{
  "monday": {"enabled": true, "open": "08:00", "close": "22:00"},
  "tuesday": {"enabled": true, "open": "08:00", "close": "22:00"},
  "wednesday": {"enabled": true, "open": "08:00", "close": "22:00"},
  "thursday": {"enabled": true, "open": "08:00", "close": "22:00"},
  "friday": {"enabled": true, "open": "08:00", "close": "22:00"},
  "saturday": {"enabled": true, "open": "08:00", "close": "22:00"},
  "sunday": {"enabled": false, "open": "08:00", "close": "22:00"}
}'::jsonb;
