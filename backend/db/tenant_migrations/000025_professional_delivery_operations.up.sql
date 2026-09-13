CREATE TABLE IF NOT EXISTS delivery_operations (
  sale_id uuid PRIMARY KEY REFERENCES sales(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  delivery_zone_id uuid REFERENCES delivery_zones(id) ON DELETE SET NULL,
  assigned_driver_id uuid REFERENCES system_users(id) ON DELETE SET NULL,
  assigned_driver_name text NOT NULL DEFAULT '',
  assigned_by text NOT NULL DEFAULT '',
  assigned_at timestamptz,
  accepted_at timestamptz,
  ready_at timestamptz,
  route_started_at timestamptz,
  delivered_at timestamptz,
  delivered_by uuid REFERENCES system_users(id) ON DELETE SET NULL,
  delivered_by_name text NOT NULL DEFAULT '',
  pin_verified_at timestamptz,
  proof_type text NOT NULL DEFAULT '' CHECK (proof_type IN ('', 'pin', 'manual')),
  proof_note text NOT NULL DEFAULT '',
  recipient_name text NOT NULL DEFAULT '',
  proof_lat double precision,
  proof_lng double precision,
  customer_lat double precision,
  customer_lng double precision,
  route_position integer NOT NULL DEFAULT 0,
  issue_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_driver_locations (
  driver_id uuid PRIMARY KEY REFERENCES system_users(id) ON DELETE CASCADE,
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy double precision NOT NULL DEFAULT 0,
  heading double precision,
  speed double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_operations_store_status
  ON delivery_operations (store_id, route_position, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_operations_driver
  ON delivery_operations (assigned_driver_id, route_position, updated_at DESC)
  WHERE assigned_driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_operations_active_driver
  ON delivery_operations (assigned_driver_id, accepted_at, route_started_at)
  WHERE delivered_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_driver_locations_updated_at
  ON delivery_driver_locations (updated_at DESC);

-- Prepare operational records for delivery orders created before this migration.
INSERT INTO delivery_operations (
  sale_id,
  store_id,
  customer_lat,
  customer_lng,
  ready_at,
  route_started_at,
  delivered_at,
  created_at,
  updated_at
)
SELECT
  s.id,
  s.store_id,
  CASE WHEN COALESCE(c.lat, '') ~ '^-?[0-9]+([.][0-9]+)?$' THEN c.lat::double precision END,
  CASE WHEN COALESCE(c.lng, '') ~ '^-?[0-9]+([.][0-9]+)?$' THEN c.lng::double precision END,
  CASE WHEN s.status IN ('ready_for_delivery', 'on_the_way', 'delivered') THEN s.date END,
  CASE WHEN s.status IN ('on_the_way', 'delivered') THEN s.date END,
  CASE WHEN s.status = 'delivered' THEN s.date END,
  s.date,
  now()
FROM sales s
LEFT JOIN customers c ON c.id = s.customer_id
WHERE s.order_type = 'customer'
  AND NOT (
    lower(s.delivery_address) LIKE '%modalidad: recogida%'
    OR lower(s.delivery_address) LIKE '%retirar en:%'
  )
ON CONFLICT (sale_id) DO NOTHING;
