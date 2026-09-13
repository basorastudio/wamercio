DROP INDEX IF EXISTS idx_delivery_zones_zone_type_active;
DROP INDEX IF EXISTS idx_delivery_zones_geo_geofence_id;
ALTER TABLE delivery_zones DROP CONSTRAINT IF EXISTS delivery_zones_geo_sync_status_check;
ALTER TABLE delivery_zones DROP CONSTRAINT IF EXISTS delivery_zones_zone_type_check;
ALTER TABLE delivery_zones
  DROP COLUMN IF EXISTS geo_synced_at,
  DROP COLUMN IF EXISTS geo_sync_error,
  DROP COLUMN IF EXISTS geo_sync_status,
  DROP COLUMN IF EXISTS geo_polygon,
  DROP COLUMN IF EXISTS geo_service,
  DROP COLUMN IF EXISTS geo_geofence_id,
  DROP COLUMN IF EXISTS zone_type;
