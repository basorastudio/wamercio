-- WAMERCIO 4.0 / fase 3.2: Delivery territorial y rutas.
ALTER TABLE shipping_zones
  ADD COLUMN IF NOT EXISTS coverage_type varchar(20) NOT NULL DEFAULT 'manual' CHECK (coverage_type IN ('manual','territory','radius')),
  ADD COLUMN IF NOT EXISTS province_code varchar(32),
  ADD COLUMN IF NOT EXISTS province varchar(120),
  ADD COLUMN IF NOT EXISTS municipality_id varchar(96),
  ADD COLUMN IF NOT EXISTS municipality varchar(160),
  ADD COLUMN IF NOT EXISTS neighborhood_id varchar(96),
  ADD COLUMN IF NOT EXISTS neighborhood varchar(180),
  ADD COLUMN IF NOT EXISTS center_latitude double precision,
  ADD COLUMN IF NOT EXISTS center_longitude double precision,
  ADD COLUMN IF NOT EXISTS radius_km numeric(9,3),
  ADD COLUMN IF NOT EXISTS auto_created boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_shipping_zones_territory ON shipping_zones(store_id,province_code,municipality_id,neighborhood_id,is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shipping_zones_territory ON shipping_zones(store_id,coalesce(province_code,''),coalesce(municipality_id,''),coalesce(neighborhood_id,'')) WHERE coverage_type='territory' AND is_active=true;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_latitude double precision,
  ADD COLUMN IF NOT EXISTS delivery_longitude double precision,
  ADD COLUMN IF NOT EXISTS delivery_reference text;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS structured_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

CREATE TABLE IF NOT EXISTS delivery_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  courier_staff_id uuid REFERENCES store_staff(id) ON DELETE SET NULL,
  route_id uuid,
  status varchar(24) NOT NULL DEFAULT 'unassigned' CHECK (status IN ('unassigned','assigned','accepted','picked_up','on_route','arrived','delivered','failed','cancelled')),
  delivery_address text NOT NULL DEFAULT '',
  latitude double precision,
  longitude double precision,
  reference text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  assigned_at timestamptz,
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id)
);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_store ON delivery_assignments(store_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_courier ON delivery_assignments(courier_staff_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  courier_staff_id uuid REFERENCES store_staff(id) ON DELETE SET NULL,
  name varchar(160) NOT NULL,
  route_date date NOT NULL DEFAULT CURRENT_DATE,
  status varchar(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','completed','cancelled')),
  total_distance_km numeric(12,3) NOT NULL DEFAULT 0,
  estimated_minutes int NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_delivery_routes_store_date ON delivery_routes(store_id,route_date DESC,status);

ALTER TABLE delivery_assignments
  DROP CONSTRAINT IF EXISTS delivery_assignments_route_id_fkey,
  ADD CONSTRAINT delivery_assignments_route_id_fkey FOREIGN KEY(route_id) REFERENCES delivery_routes(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS delivery_route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES delivery_routes(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES delivery_assignments(id) ON DELETE CASCADE,
  stop_order int NOT NULL DEFAULT 1 CHECK (stop_order > 0),
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','arrived','completed','skipped')),
  arrived_at timestamptz,
  completed_at timestamptz,
  UNIQUE(route_id,assignment_id),
  UNIQUE(route_id,stop_order)
);

CREATE TABLE IF NOT EXISTS courier_location_events (
  id bigserial PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  courier_staff_id uuid NOT NULL REFERENCES store_staff(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES delivery_assignments(id) ON DELETE SET NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_courier_location_recent ON courier_location_events(courier_staff_id,created_at DESC);
