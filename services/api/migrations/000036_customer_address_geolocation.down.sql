ALTER TABLE customer_addresses
  DROP CONSTRAINT IF EXISTS customer_addresses_latitude_range,
  DROP CONSTRAINT IF EXISTS customer_addresses_longitude_range,
  DROP COLUMN IF EXISTS latitude,
  DROP COLUMN IF EXISTS longitude;
