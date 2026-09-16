CREATE TABLE IF NOT EXISTS product_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url text NOT NULL,
  alt_text text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_media_product_sort ON product_media(product_id, sort_order, created_at);

CREATE TABLE IF NOT EXISTS product_translations (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  locale varchar(10) NOT NULL,
  name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, locale)
);

CREATE TABLE IF NOT EXISTS product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  global_customer_id uuid NOT NULL REFERENCES global_customers(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL DEFAULT '',
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','hidden')),
  verified_purchase boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, order_id, global_customer_id)
);
CREATE INDEX IF NOT EXISTS idx_product_reviews_store_status ON product_reviews(store_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_reviews_public ON product_reviews(product_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS kds_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, name)
);

CREATE TABLE IF NOT EXISTS kds_station_categories (
  station_id uuid NOT NULL REFERENCES kds_stations(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (station_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_kds_station_categories_category ON kds_station_categories(category_id);

CREATE TABLE IF NOT EXISTS kds_station_products (
  station_id uuid NOT NULL REFERENCES kds_stations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (station_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_kds_station_products_product ON kds_station_products(product_id);

CREATE TABLE IF NOT EXISTS store_qr_styles (
  store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  foreground varchar(7) NOT NULL DEFAULT '#111827',
  background varchar(7) NOT NULL DEFAULT '#FFFFFF',
  show_logo boolean NOT NULL DEFAULT true,
  label text NOT NULL DEFAULT 'Escanea para ordenar',
  frame_style varchar(24) NOT NULL DEFAULT 'rounded' CHECK (frame_style IN ('rounded','minimal','card')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS table_qr_styles (
  table_id uuid PRIMARY KEY REFERENCES store_tables(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  foreground varchar(7) NOT NULL DEFAULT '#111827',
  background varchar(7) NOT NULL DEFAULT '#FFFFFF',
  show_logo boolean NOT NULL DEFAULT true,
  label text NOT NULL DEFAULT 'Escanea para ordenar',
  frame_style varchar(24) NOT NULL DEFAULT 'rounded' CHECK (frame_style IN ('rounded','minimal','card')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_table_qr_styles_store ON table_qr_styles(store_id);

CREATE TABLE IF NOT EXISTS loyalty_programs (
  store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT false,
  points_per_currency numeric(12,6) NOT NULL DEFAULT 0.010000 CHECK (points_per_currency >= 0),
  redemption_value numeric(12,6) NOT NULL DEFAULT 1.000000 CHECK (redemption_value >= 0),
  min_redeem integer NOT NULL DEFAULT 100 CHECK (min_redeem >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  global_customer_id uuid NOT NULL REFERENCES global_customers(id) ON DELETE CASCADE,
  points_balance integer NOT NULL DEFAULT 0,
  total_earned integer NOT NULL DEFAULT 0,
  total_redeemed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, global_customer_id)
);
CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_store_balance ON loyalty_accounts(store_id, points_balance DESC);

CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  entry_type varchar(16) NOT NULL CHECK (entry_type IN ('earn','redeem','adjust')),
  points integer NOT NULL CHECK (points <> 0),
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_account_created ON loyalty_ledger(account_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_loyalty_order_earn ON loyalty_ledger(order_id, entry_type) WHERE order_id IS NOT NULL AND entry_type='earn';
