ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS location_accuracy double precision,
  ADD COLUMN IF NOT EXISTS location_source text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;

ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_latitude_check;
ALTER TABLE stores ADD CONSTRAINT stores_latitude_check
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90);

ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_longitude_check;
ALTER TABLE stores ADD CONSTRAINT stores_longitude_check
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);

ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_location_accuracy_check;
ALTER TABLE stores ADD CONSTRAINT stores_location_accuracy_check
  CHECK (location_accuracy IS NULL OR location_accuracy >= 0);

ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_location_source_check;
ALTER TABLE stores ADD CONSTRAINT stores_location_source_check
  CHECK (location_source IN ('', 'device', 'manual', 'map', 'imported'));
