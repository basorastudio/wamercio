-- WAMERCIO 4.4.0: operación diaria del negocio.
-- Sucursales, caja/turnos, catálogo por sucursal y liquidaciones de delivery.

CREATE TABLE IF NOT EXISTS store_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  code varchar(40) NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  street varchar(180) NOT NULL DEFAULT '',
  street_number varchar(40) NOT NULL DEFAULT '',
  province_code varchar(32) NOT NULL DEFAULT '',
  province varchar(120) NOT NULL DEFAULT '',
  municipality_id varchar(96) NOT NULL DEFAULT '',
  municipality varchar(160) NOT NULL DEFAULT '',
  neighborhood_id varchar(96) NOT NULL DEFAULT '',
  neighborhood varchar(180) NOT NULL DEFAULT '',
  phone varchar(40) NOT NULL DEFAULT '',
  whatsapp varchar(40) NOT NULL DEFAULT '',
  latitude double precision,
  longitude double precision,
  delivery_radius_km numeric(9,3) NOT NULL DEFAULT 5,
  opens_at time NOT NULL DEFAULT '08:00',
  closes_at time NOT NULL DEFAULT '22:00',
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_branches_store ON store_branches(store_id,is_active,is_primary DESC,name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_store_branches_code ON store_branches(store_id,lower(code)) WHERE trim(code)<>'';
CREATE UNIQUE INDEX IF NOT EXISTS uq_store_branches_primary ON store_branches(store_id) WHERE is_primary=true;

INSERT INTO store_branches(store_id,name,code,address,street,street_number,province_code,province,municipality_id,municipality,neighborhood_id,neighborhood,phone,whatsapp,is_primary,is_active)
SELECT s.id,'Principal','PRINCIPAL',coalesce(s.address,''),coalesce(s.street,''),coalesce(s.street_number,''),coalesce(s.province_code,''),coalesce(s.province,''),coalesce(s.city_id,''),coalesce(s.municipality,''),coalesce(s.neighborhood_id,''),coalesce(s.neighborhood,''),coalesce(s.whatsapp,''),coalesce(s.whatsapp,''),true,s.is_active
FROM stores s
WHERE NOT EXISTS (SELECT 1 FROM store_branches b WHERE b.store_id=s.id);

-- Toda tienda nueva nace con una sucursal principal para que TPV, caja y
-- delivery estén listos desde el onboarding sin pasos manuales adicionales.
CREATE OR REPLACE FUNCTION wamercio_create_primary_branch() RETURNS trigger AS $$
BEGIN
  INSERT INTO store_branches(store_id,name,code,address,street,street_number,province_code,province,municipality_id,municipality,neighborhood_id,neighborhood,phone,whatsapp,is_primary,is_active)
  VALUES(NEW.id,'Principal','PRINCIPAL',coalesce(NEW.address,''),coalesce(NEW.street,''),coalesce(NEW.street_number,''),coalesce(NEW.province_code,''),coalesce(NEW.province,''),coalesce(NEW.city_id,''),coalesce(NEW.municipality,''),coalesce(NEW.neighborhood_id,''),coalesce(NEW.neighborhood,''),coalesce(NEW.whatsapp,''),coalesce(NEW.whatsapp,''),true,NEW.is_active)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wamercio_create_primary_branch ON stores;
CREATE TRIGGER trg_wamercio_create_primary_branch
AFTER INSERT ON stores
FOR EACH ROW EXECUTE FUNCTION wamercio_create_primary_branch();

CREATE TABLE IF NOT EXISTS store_branch_products (
  branch_id uuid NOT NULL REFERENCES store_branches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_override numeric(12,2),
  is_available boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(branch_id,product_id)
);
CREATE INDEX IF NOT EXISTS idx_store_branch_products_product ON store_branch_products(product_id,branch_id);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES store_branches(id) ON DELETE RESTRICT,
  opened_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  closed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  opening_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (opening_amount >= 0),
  closing_amount numeric(12,2),
  expected_amount numeric(12,2),
  difference numeric(12,2),
  status varchar(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  notes text NOT NULL DEFAULT '',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_sessions_open_branch ON cash_sessions(branch_id) WHERE status='open';
CREATE INDEX IF NOT EXISTS idx_cash_sessions_store_opened ON cash_sessions(store_id,opened_at DESC);

CREATE TABLE IF NOT EXISTS cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_session_id uuid NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  type varchar(30) NOT NULL CHECK (type IN ('sale_cash','cash_in','cash_out','expense','delivery_remittance','refund')),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  description varchar(255) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cash_movements_session_created ON cash_movements(cash_session_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_movements_store_created ON cash_movements(store_id,created_at DESC);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES store_branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cash_session_id uuid REFERENCES cash_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS collected_payment_method varchar(30),
  ADD COLUMN IF NOT EXISTS payment_collected_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_orders_branch_created ON orders(branch_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_cash_session ON orders(cash_session_id,created_at DESC);

UPDATE orders o SET branch_id=b.id
FROM store_branches b
WHERE o.branch_id IS NULL AND b.store_id=o.store_id AND b.is_primary=true;

ALTER TABLE delivery_assignments
  ADD COLUMN IF NOT EXISTS cash_collected_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_collected_method varchar(30),
  ADD COLUMN IF NOT EXISTS cash_collected_at timestamptz,
  ADD COLUMN IF NOT EXISTS cash_remitted_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_remitted_at timestamptz;

CREATE TABLE IF NOT EXISTS delivery_remittances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES store_branches(id) ON DELETE RESTRICT,
  courier_staff_id uuid NOT NULL REFERENCES store_staff(id) ON DELETE RESTRICT,
  cash_session_id uuid NOT NULL REFERENCES cash_sessions(id) ON DELETE RESTRICT,
  received_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_delivery_remittances_store_created ON delivery_remittances(store_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_remittances_courier_created ON delivery_remittances(courier_staff_id,created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_remittance_items (
  remittance_id uuid NOT NULL REFERENCES delivery_remittances(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES delivery_assignments(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  PRIMARY KEY(remittance_id,assignment_id)
);
CREATE INDEX IF NOT EXISTS idx_delivery_remittance_items_assignment ON delivery_remittance_items(assignment_id);
