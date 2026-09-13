CREATE TABLE IF NOT EXISTS delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  province_code text NOT NULL DEFAULT '',
  province_name text NOT NULL DEFAULT '',
  municipality_code text NOT NULL DEFAULT '',
  municipality_name text NOT NULL DEFAULT '',
  district_code text NOT NULL DEFAULT '',
  neighborhood_id text NOT NULL DEFAULT '',
  neighborhood_name text NOT NULL DEFAULT '',
  delivery_cost double precision NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_zones_store_id ON delivery_zones(store_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_active ON delivery_zones(active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_zones_unique_area
  ON delivery_zones (store_id, province_code, municipality_code, district_code, lower(neighborhood_name));
