DROP TABLE IF EXISTS courier_location_events;
DROP TABLE IF EXISTS delivery_route_stops;
DROP TABLE IF EXISTS delivery_routes CASCADE;
DROP TABLE IF EXISTS delivery_assignments;
ALTER TABLE messages DROP COLUMN IF EXISTS structured_payload, DROP COLUMN IF EXISTS latitude, DROP COLUMN IF EXISTS longitude;
ALTER TABLE orders DROP COLUMN IF EXISTS delivery_latitude, DROP COLUMN IF EXISTS delivery_longitude, DROP COLUMN IF EXISTS delivery_reference;
ALTER TABLE shipping_zones DROP COLUMN IF EXISTS coverage_type, DROP COLUMN IF EXISTS province_code, DROP COLUMN IF EXISTS province, DROP COLUMN IF EXISTS municipality_id, DROP COLUMN IF EXISTS municipality, DROP COLUMN IF EXISTS neighborhood_id, DROP COLUMN IF EXISTS neighborhood, DROP COLUMN IF EXISTS center_latitude, DROP COLUMN IF EXISTS center_longitude, DROP COLUMN IF EXISTS radius_km, DROP COLUMN IF EXISTS auto_created, DROP COLUMN IF EXISTS updated_at;
