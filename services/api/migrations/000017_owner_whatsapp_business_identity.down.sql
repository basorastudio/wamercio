DROP INDEX IF EXISTS idx_stores_rnc_unique;

ALTER TABLE stores
  DROP COLUMN IF EXISTS street_number,
  DROP COLUMN IF EXISTS street,
  DROP COLUMN IF EXISTS neighborhood,
  DROP COLUMN IF EXISTS neighborhood_id,
  DROP COLUMN IF EXISTS municipality,
  DROP COLUMN IF EXISTS city_id,
  DROP COLUMN IF EXISTS province,
  DROP COLUMN IF EXISTS province_code,
  DROP COLUMN IF EXISTS rnc_verified_at,
  DROP COLUMN IF EXISTS commercial_name,
  DROP COLUMN IF EXISTS legal_name,
  DROP COLUMN IF EXISTS rnc;

ALTER TABLE users
  DROP COLUMN IF EXISTS whatsapp_verified_at;
