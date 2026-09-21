ALTER TABLE users
  ADD COLUMN IF NOT EXISTS whatsapp_verified_at timestamptz;

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS rnc varchar(20),
  ADD COLUMN IF NOT EXISTS legal_name varchar(220),
  ADD COLUMN IF NOT EXISTS commercial_name varchar(220),
  ADD COLUMN IF NOT EXISTS rnc_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS province_code varchar(32),
  ADD COLUMN IF NOT EXISTS province varchar(120),
  ADD COLUMN IF NOT EXISTS city_id varchar(96),
  ADD COLUMN IF NOT EXISTS municipality varchar(160),
  ADD COLUMN IF NOT EXISTS neighborhood_id varchar(96),
  ADD COLUMN IF NOT EXISTS neighborhood varchar(180),
  ADD COLUMN IF NOT EXISTS street varchar(220),
  ADD COLUMN IF NOT EXISTS street_number varchar(60);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_rnc_unique
  ON stores(rnc)
  WHERE coalesce(rnc, '') <> '';
