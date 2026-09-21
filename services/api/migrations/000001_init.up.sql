CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  email varchar(190) UNIQUE NOT NULL,
  phone varchar(30),
  password_hash text NOT NULL,
  role varchar(30) NOT NULL DEFAULT 'owner',
  status varchar(20) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  slug varchar(100) UNIQUE NOT NULL,
  price numeric(12,2) NOT NULL DEFAULT 0,
  billing_period varchar(20) NOT NULL DEFAULT 'monthly',
  max_stores int NOT NULL DEFAULT 1,
  max_products int NOT NULL DEFAULT 100,
  max_orders int NOT NULL DEFAULT 500,
  whatsapp_enabled boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id),
  status varchar(20) NOT NULL DEFAULT 'active',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  slug varchar(120) UNIQUE NOT NULL,
  description text,
  logo_url text,
  phone varchar(30),
  whatsapp varchar(30),
  address text,
  currency varchar(10) NOT NULL DEFAULT 'DOP',
  timezone varchar(64) NOT NULL DEFAULT 'America/Santo_Domingo',
  primary_color varchar(20) NOT NULL DEFAULT '#16a34a',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stores_user ON stores(user_id);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name varchar(140) NOT NULL,
  slug varchar(140) NOT NULL,
  description text,
  image_url text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, slug)
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  name varchar(180) NOT NULL,
  slug varchar(180) NOT NULL,
  sku varchar(100),
  description text,
  image_url text,
  price numeric(12,2) NOT NULL DEFAULT 0,
  compare_price numeric(12,2),
  stock numeric(12,3),
  track_stock boolean NOT NULL DEFAULT false,
  variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  extras jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code varchar(60) NOT NULL,
  discount_type varchar(20) NOT NULL CHECK (discount_type IN ('flat','percentage')),
  discount_value numeric(12,2) NOT NULL,
  min_order numeric(12,2) NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit int,
  used_count int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, code)
);

CREATE TABLE IF NOT EXISTS shipping_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  charge numeric(12,2) NOT NULL DEFAULT 0,
  estimated_minutes int NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  order_number bigint GENERATED ALWAYS AS IDENTITY,
  customer_name varchar(160) NOT NULL,
  customer_phone varchar(30) NOT NULL,
  customer_email varchar(190),
  delivery_address text,
  shipping_zone_id uuid REFERENCES shipping_zones(id) ON DELETE SET NULL,
  coupon_code varchar(60),
  subtotal numeric(12,2) NOT NULL,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  shipping numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL,
  payment_method varchar(30) NOT NULL DEFAULT 'cash',
  payment_status varchar(20) NOT NULL DEFAULT 'pending',
  status varchar(30) NOT NULL DEFAULT 'pending',
  notes text,
  source varchar(30) NOT NULL DEFAULT 'web',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_store_created ON orders(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name varchar(180) NOT NULL,
  variant_name varchar(180),
  extras jsonb NOT NULL DEFAULT '[]'::jsonb,
  unit_price numeric(12,2) NOT NULL,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  line_total numeric(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  jid varchar(190),
  phone varchar(40),
  status varchar(30) NOT NULL DEFAULT 'disconnected',
  last_seen_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  remote_jid varchar(190) NOT NULL,
  display_name varchar(190),
  unread_count int NOT NULL DEFAULT 0,
  last_message text,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, remote_jid)
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id varchar(190),
  direction varchar(10) NOT NULL CHECK(direction IN ('in','out')),
  type varchar(30) NOT NULL DEFAULT 'text',
  body text,
  status varchar(30),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, message_id)
);
