CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  slogan text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  whatsapp text NOT NULL DEFAULT '',
  whatsapp_display text NOT NULL DEFAULT '',
  country_code text NOT NULL DEFAULT 'do',
  dial_code text NOT NULL DEFAULT '+1',
  emoji text NOT NULL DEFAULT '🏪',
  logo_url text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#00a884',
  active boolean NOT NULL DEFAULT true,
  store_status text NOT NULL DEFAULT 'CERRADA',
  payment_settings jsonb NOT NULL DEFAULT '{
    "cash": true,
    "bankTransfer": true,
    "credit": true,
    "card": true,
    "transferAccount": "",
    "terminalAccount": "",
    "terminalCommission": 0,
    "terminalFixedFee": 0,
    "orderModes": {"delivery": true, "pickup": true}
  }'::jsonb,
  service_hours jsonb NOT NULL DEFAULT '{
    "monday": {"enabled": true, "open": "08:00", "close": "22:00"},
    "tuesday": {"enabled": true, "open": "08:00", "close": "22:00"},
    "wednesday": {"enabled": true, "open": "08:00", "close": "22:00"},
    "thursday": {"enabled": true, "open": "08:00", "close": "22:00"},
    "friday": {"enabled": true, "open": "08:00", "close": "22:00"},
    "saturday": {"enabled": true, "open": "08:00", "close": "22:00"},
    "sunday": {"enabled": false, "open": "08:00", "close": "22:00"}
  }'::jsonb,
  delivery_scope text NOT NULL DEFAULT 'municipal' CHECK (delivery_scope IN ('provincial', 'municipal')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  global_id text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  category_icon text NOT NULL DEFAULT '📦',
  price double precision NOT NULL DEFAULT 0,
  cost double precision NOT NULL DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  image text NOT NULL DEFAULT '',
  brand text NOT NULL DEFAULT '',
  format text NOT NULL DEFAULT 'Unidad',
  "group" text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  national_id text NOT NULL DEFAULT '',
  whatsapp text NOT NULL DEFAULT '',
  whatsapp_display text NOT NULL DEFAULT '',
  profile_picture_url text NOT NULL DEFAULT '',
  country_code text NOT NULL DEFAULT 'do',
  dial_code text NOT NULL DEFAULT '+1',
  pin_hash text NOT NULL DEFAULT '',
  province text NOT NULL DEFAULT '',
  municipality text NOT NULL DEFAULT '',
  sector text NOT NULL DEFAULT '',
  street text NOT NULL DEFAULT '',
  address_reference text NOT NULL DEFAULT '',
  lat text NOT NULL DEFAULT '',
  lng text NOT NULL DEFAULT '',
  store_credit jsonb NOT NULL DEFAULT '{}'::jsonb,
  registered_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total double precision NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'cash',
  customer text NOT NULL DEFAULT '',
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  delivery_address text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'delivered',
  order_type text NOT NULL DEFAULT 'pos',
  date timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer text NOT NULL DEFAULT '',
  amount double precision NOT NULL DEFAULT 0,
  note text NOT NULL DEFAULT '',
  date timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  type text NOT NULL DEFAULT 'charge'
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'Corriente',
  number text NOT NULL DEFAULT '',
  holder text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cash_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  opening jsonb NOT NULL DEFAULT '{}'::jsonb,
  closing jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_sales_store_id ON sales(store_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_type ON sales(order_type);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date DESC);
CREATE INDEX IF NOT EXISTS idx_store_credits_store_id ON store_credits(store_id);
CREATE INDEX IF NOT EXISTS idx_store_credits_customer ON store_credits(customer);
CREATE INDEX IF NOT EXISTS idx_cash_history_store_id ON cash_history(store_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_active ON bank_accounts(active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_national_id_unique_not_blank ON customers(national_id) WHERE national_id <> '';

INSERT INTO stores (name, slogan, address, whatsapp, whatsapp_display, country_code, dial_code, emoji, color, active, store_status)
SELECT 'Mi Negocio', 'Tu negocio listo para vender', 'Configura la dirección de tu negocio', '+18090000000', '(809) 000-0000', 'do', '+1', '🏪', '#00a884', true, 'CERRADA'
WHERE NOT EXISTS (SELECT 1 FROM stores);
