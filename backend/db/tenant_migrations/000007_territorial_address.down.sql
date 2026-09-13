ALTER TABLE stores DROP COLUMN IF EXISTS street_number;
ALTER TABLE stores DROP COLUMN IF EXISTS street;
ALTER TABLE stores DROP COLUMN IF EXISTS neighborhood;
ALTER TABLE stores DROP COLUMN IF EXISTS neighborhood_id;
ALTER TABLE stores DROP COLUMN IF EXISTS district_code;
ALTER TABLE stores DROP COLUMN IF EXISTS municipality;
ALTER TABLE stores DROP COLUMN IF EXISTS municipality_code;
ALTER TABLE stores DROP COLUMN IF EXISTS province;
ALTER TABLE stores DROP COLUMN IF EXISTS province_code;

ALTER TABLE customers DROP COLUMN IF EXISTS street_number;
ALTER TABLE customers DROP COLUMN IF EXISTS neighborhood_id;
ALTER TABLE customers DROP COLUMN IF EXISTS district_code;
ALTER TABLE customers DROP COLUMN IF EXISTS municipality_code;
ALTER TABLE customers DROP COLUMN IF EXISTS province_code;

DROP INDEX IF EXISTS idx_territory_custom_neighborhoods_unique_global;
DROP TABLE IF EXISTS territory_custom_neighborhoods;
