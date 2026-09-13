ALTER TABLE delivery_zones
  ADD COLUMN IF NOT EXISTS zone_type text NOT NULL DEFAULT 'territorial',
  ADD COLUMN IF NOT EXISTS geo_geofence_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS geo_service text NOT NULL DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS geo_polygon jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS geo_sync_status text NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS geo_sync_error text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS geo_synced_at timestamptz;

ALTER TABLE delivery_zones DROP CONSTRAINT IF EXISTS delivery_zones_zone_type_check;
ALTER TABLE delivery_zones ADD CONSTRAINT delivery_zones_zone_type_check
  CHECK (zone_type IN ('territorial','geofence'));

ALTER TABLE delivery_zones DROP CONSTRAINT IF EXISTS delivery_zones_geo_sync_status_check;
ALTER TABLE delivery_zones ADD CONSTRAINT delivery_zones_geo_sync_status_check
  CHECK (geo_sync_status IN ('not_applicable','pending','synced','error'));

CREATE INDEX IF NOT EXISTS idx_delivery_zones_geo_geofence_id
  ON delivery_zones (geo_geofence_id)
  WHERE geo_geofence_id <> '';

CREATE INDEX IF NOT EXISTS idx_delivery_zones_zone_type_active
  ON delivery_zones (store_id, zone_type, active);
