-- GEO RD MAP integration: stable territorial ids, geocoded addresses, linked service geofences and route metrics.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS geo_province_code varchar(2),
  ADD COLUMN IF NOT EXISTS geo_city_id varchar(32),
  ADD COLUMN IF NOT EXISTS geo_neighborhood_id varchar(160),
  ADD COLUMN IF NOT EXISTS geo_id varchar(255),
  ADD COLUMN IF NOT EXISTS geo_address_label text,
  ADD COLUMN IF NOT EXISTS geo_address_source varchar(40);

CREATE INDEX IF NOT EXISTS idx_tenants_geo_city ON tenants(geo_city_id);
CREATE INDEX IF NOT EXISTS idx_tenants_geo_province ON tenants(geo_province_code);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS geo_province_code varchar(2),
  ADD COLUMN IF NOT EXISTS geo_city_id varchar(32),
  ADD COLUMN IF NOT EXISTS geo_neighborhood_id varchar(160),
  ADD COLUMN IF NOT EXISTS geo_id varchar(255),
  ADD COLUMN IF NOT EXISTS geo_address_label text,
  ADD COLUMN IF NOT EXISTS geo_address_source varchar(40),
  ADD COLUMN IF NOT EXISTS latitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS longitude numeric(10,7);

CREATE INDEX IF NOT EXISTS idx_customers_geo_city ON customers(tenant_id,geo_city_id);

ALTER TABLE delivery_zones
  ADD COLUMN IF NOT EXISTS geo_geofence_id varchar(160),
  ADD COLUMN IF NOT EXISTS geo_category varchar(80),
  ADD COLUMN IF NOT EXISTS service_type varchar(80) NOT NULL DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS geo_properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS geo_geometry jsonb,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100;

CREATE UNIQUE INDEX IF NOT EXISTS ux_delivery_zone_geofence
  ON delivery_zones(tenant_id,geo_geofence_id)
  WHERE geo_geofence_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_zones_geo_service ON delivery_zones(tenant_id,service_type,priority);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_zone_id uuid,
  ADD COLUMN IF NOT EXISTS delivery_latitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS delivery_longitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS route_distance_km numeric(12,3),
  ADD COLUMN IF NOT EXISTS route_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS geo_address_json jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='orders_delivery_zone_fk') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_delivery_zone_fk FOREIGN KEY(delivery_zone_id) REFERENCES delivery_zones(id) ON DELETE SET NULL;
  END IF;
END$$;

ALTER TABLE marketplaces
  ADD COLUMN IF NOT EXISTS geo_province_code varchar(2),
  ADD COLUMN IF NOT EXISTS geo_city_id varchar(32);
CREATE INDEX IF NOT EXISTS idx_marketplaces_geo_city ON marketplaces(geo_city_id);
