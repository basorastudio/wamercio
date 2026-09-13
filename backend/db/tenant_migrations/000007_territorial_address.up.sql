CREATE TABLE IF NOT EXISTS territory_custom_neighborhoods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  province_code text NOT NULL,
  province_name text NOT NULL DEFAULT '',
  municipality_code text NOT NULL,
  municipality_name text NOT NULL DEFAULT '',
  district_code text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_territory_custom_neighborhoods_unique_global
  ON territory_custom_neighborhoods (lower(name), province_code, municipality_code, district_code);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS province_code text NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS municipality_code text NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS district_code text NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS neighborhood_id text NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS street_number text NOT NULL DEFAULT '';

ALTER TABLE stores ADD COLUMN IF NOT EXISTS province_code text NOT NULL DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS province text NOT NULL DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS municipality_code text NOT NULL DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS municipality text NOT NULL DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS district_code text NOT NULL DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS neighborhood_id text NOT NULL DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS neighborhood text NOT NULL DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS street text NOT NULL DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS street_number text NOT NULL DEFAULT '';

UPDATE customers
SET province_code = COALESCE(NULLIF(province_code, ''), ''),
    municipality_code = COALESCE(NULLIF(municipality_code, ''), ''),
    district_code = COALESCE(NULLIF(district_code, ''), ''),
    neighborhood_id = COALESCE(NULLIF(neighborhood_id, ''), ''),
    street_number = COALESCE(NULLIF(street_number, ''), '')
WHERE true;
