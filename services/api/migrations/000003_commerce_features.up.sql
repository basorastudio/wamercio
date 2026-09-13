-- WAMERCIO 1.1: commercial settings, customers, subscriptions and admin features.

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS email varchar(190),
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS minimum_order numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pickup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cash_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cash_on_delivery_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bank_transfer_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bank_name varchar(160),
  ADD COLUMN IF NOT EXISTS bank_account_name varchar(190),
  ADD COLUMN IF NOT EXISTS bank_account_number varchar(100),
  ADD COLUMN IF NOT EXISTS bank_account_type varchar(80),
  ADD COLUMN IF NOT EXISTS business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS order_notice text,
  ADD COLUMN IF NOT EXISTS checkout_message text;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tag varchar(80),
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

UPDATE plans SET description = CASE slug
  WHEN 'emprende' THEN 'Para comenzar a vender por catálogo y WhatsApp.'
  WHEN 'negocio' THEN 'Para comercios con mayor volumen de productos y pedidos.'
  WHEN 'pro' THEN 'Para operaciones de varias tiendas y equipos en crecimiento.'
  ELSE coalesce(description,'') END
WHERE description IS NULL OR description='';
UPDATE plans SET is_featured = (slug='negocio');

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  phone varchar(30) NOT NULL,
  email varchar(190),
  address text,
  notes text,
  status varchar(20) NOT NULL DEFAULT 'active',
  order_count int NOT NULL DEFAULT 0,
  total_spent numeric(14,2) NOT NULL DEFAULT 0,
  last_order_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_customers_store_last_order ON customers(store_id, last_order_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_type varchar(20) NOT NULL DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS payment_proof_url text;
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);

-- Populate customers from existing orders without modifying the orders themselves first.
INSERT INTO customers(store_id,name,phone,email,address,order_count,total_spent,last_order_at)
SELECT o.store_id,
       (array_agg(o.customer_name ORDER BY o.created_at DESC))[1],
       o.customer_phone,
       nullif((array_agg(coalesce(o.customer_email,'') ORDER BY o.created_at DESC))[1],''),
       nullif((array_agg(coalesce(o.delivery_address,'') ORDER BY o.created_at DESC))[1],''),
       count(*)::int,
       coalesce(sum(o.total) FILTER (WHERE o.status <> 'canceled'),0),
       max(o.created_at)
FROM orders o
WHERE trim(o.customer_phone) <> ''
GROUP BY o.store_id,o.customer_phone
ON CONFLICT(store_id,phone) DO NOTHING;

UPDATE orders o
SET customer_id=c.id
FROM customers c
WHERE o.customer_id IS NULL AND c.store_id=o.store_id AND c.phone=o.customer_phone;

CREATE TABLE IF NOT EXISTS subscription_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_plan_id uuid REFERENCES plans(id),
  requested_plan_id uuid NOT NULL REFERENCES plans(id),
  note text,
  status varchar(20) NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscription_requests_status ON subscription_requests(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_requests_one_pending ON subscription_requests(user_id) WHERE status='pending';
