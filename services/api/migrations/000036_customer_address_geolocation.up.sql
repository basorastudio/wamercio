-- WAMERCIO 2.8.9: coordenadas exactas para direcciones globales de clientes.

ALTER TABLE customer_addresses
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

ALTER TABLE customer_addresses
  DROP CONSTRAINT IF EXISTS customer_addresses_latitude_range,
  DROP CONSTRAINT IF EXISTS customer_addresses_longitude_range;

ALTER TABLE customer_addresses
  ADD CONSTRAINT customer_addresses_latitude_range CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT customer_addresses_longitude_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
