-- WAMERCIO 4.0 / fase 3.1: Cotizaciones Conversacionales PRO.
CREATE TABLE IF NOT EXISTS store_quote_settings (
  store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  prefix varchar(16) NOT NULL DEFAULT 'COT',
  validity_days int NOT NULL DEFAULT 15 CHECK (validity_days BETWEEN 1 AND 365),
  auto_followup_hours int NOT NULL DEFAULT 24 CHECK (auto_followup_hours BETWEEN 0 AND 2160),
  second_followup_hours int NOT NULL DEFAULT 48 CHECK (second_followup_hours BETWEEN 0 AND 2160),
  allow_public_accept boolean NOT NULL DEFAULT true,
  allow_public_reject boolean NOT NULL DEFAULT true,
  footer_text text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  quote_number bigint GENERATED ALWAYS AS IDENTITY,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  global_customer_id uuid REFERENCES global_customers(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_staff_id uuid REFERENCES store_staff(id) ON DELETE SET NULL,
  status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('requested','draft','sent','viewed','approved','rejected','expired','converted','cancelled')),
  revision int NOT NULL DEFAULT 1 CHECK (revision >= 1),
  customer_name varchar(180) NOT NULL,
  customer_phone varchar(40) NOT NULL DEFAULT '',
  customer_address text NOT NULL DEFAULT '',
  title varchar(220) NOT NULL DEFAULT 'Cotización',
  notes text NOT NULL DEFAULT '',
  terms text NOT NULL DEFAULT '',
  currency varchar(8) NOT NULL DEFAULT 'DOP',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  tax numeric(14,2) NOT NULL DEFAULT 0,
  shipping numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  valid_until timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  converted_at timestamptz,
  converted_order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quotes_store_created ON quotes(store_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_store_status ON quotes(store_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(store_id,customer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_conversation ON quotes(conversation_id,created_at DESC);

CREATE TABLE IF NOT EXISTS quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name varchar(220) NOT NULL,
  variant_name varchar(180) NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  quantity numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id,sort_order,id);

CREATE TABLE IF NOT EXISTS quote_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  revision int NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(quote_id,revision)
);

CREATE TABLE IF NOT EXISTS quote_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_viewed_at timestamptz,
  view_count int NOT NULL DEFAULT 0,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quote_share_quote ON quote_share_links(quote_id,created_at DESC);

CREATE TABLE IF NOT EXISTS quote_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  event_type varchar(50) NOT NULL,
  actor_type varchar(20) NOT NULL DEFAULT 'system',
  actor_id varchar(120) NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quote_events_quote ON quote_events(quote_id,created_at DESC);

CREATE TABLE IF NOT EXISTS quote_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  stage smallint NOT NULL DEFAULT 1 CHECK (stage IN (1,2,3)),
  body text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','cancelled','failed')),
  error text,
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(quote_id,stage)
);
CREATE INDEX IF NOT EXISTS idx_quote_followups_due ON quote_followups(status,scheduled_for) WHERE status='pending';

INSERT INTO store_quote_settings(store_id)
SELECT id FROM stores ON CONFLICT(store_id) DO NOTHING;
