-- WAMERCIO 2.6.0: promociones automáticas, trazabilidad y agenda administrativa.

CREATE TABLE IF NOT EXISTS promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  discount_type varchar(20) NOT NULL CHECK (discount_type IN ('flat','percentage')),
  discount_value numeric(12,2) NOT NULL CHECK (discount_value >= 0),
  scope varchar(20) NOT NULL DEFAULT 'all' CHECK (scope IN ('all','products','categories')),
  min_order numeric(12,2) NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit int,
  used_count int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_promotions_store_active
  ON promotions(store_id,is_active,starts_at,ends_at);

CREATE TABLE IF NOT EXISTS promotion_products (
  promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (promotion_id,product_id)
);
CREATE INDEX IF NOT EXISTS idx_promotion_products_product ON promotion_products(product_id,promotion_id);

CREATE TABLE IF NOT EXISTS promotion_categories (
  promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (promotion_id,category_id)
);
CREATE INDEX IF NOT EXISTS idx_promotion_categories_category ON promotion_categories(category_id,promotion_id);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS promotion_id uuid REFERENCES promotions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promotion_name varchar(160);

ALTER TABLE table_reservations
  ADD COLUMN IF NOT EXISTS guest_name varchar(180),
  ADD COLUMN IF NOT EXISTS guest_phone varchar(32),
  ADD COLUMN IF NOT EXISTS notes text;
