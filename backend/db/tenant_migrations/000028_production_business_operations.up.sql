CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS reference_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversal_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reversed_by text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS original_sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_reference_number_unique_not_blank
  ON sales(reference_number) WHERE reference_number <> '';
CREATE INDEX IF NOT EXISTS idx_sales_store_status_date
  ON sales(store_id, status, date DESC);

ALTER TABLE store_credits
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS paid_amount double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reference_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reference_id uuid,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE store_credits
SET paid_amount = CASE WHEN status = 'paid' THEN amount ELSE 0 END
WHERE paid_amount = 0;

CREATE INDEX IF NOT EXISTS idx_store_credits_store_status_due
  ON store_credits(store_id, status, due_date, date DESC);
CREATE INDEX IF NOT EXISTS idx_store_credits_customer_id_date
  ON store_credits(customer_id, date DESC) WHERE customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sale_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  amount double precision NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  resolution text NOT NULL DEFAULT 'refund' CHECK (resolution IN ('refund', 'store_credit', 'exchange')),
  payment_method text NOT NULL DEFAULT 'cash',
  created_by text NOT NULL DEFAULT '',
  created_by_role text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sale_returns_sale_id ON sale_returns(sale_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_returns_store_date ON sale_returns(store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  movement_type text NOT NULL CHECK (movement_type IN ('initial', 'sale', 'return', 'adjustment', 'void', 'purchase', 'count', 'correction')),
  quantity_delta double precision NOT NULL CHECK (quantity_delta <> 0),
  stock_before double precision NOT NULL,
  stock_after double precision NOT NULL CHECK (stock_after >= 0),
  reason text NOT NULL DEFAULT '',
  reference_type text NOT NULL DEFAULT '',
  reference_id uuid,
  actor_id text NOT NULL DEFAULT '',
  actor_role text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_store_date
  ON inventory_movements(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_date
  ON inventory_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_reference
  ON inventory_movements(reference_type, reference_id) WHERE reference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  opened_by text NOT NULL DEFAULT '',
  opened_by_role text NOT NULL DEFAULT '',
  opening_amount double precision NOT NULL DEFAULT 0 CHECK (opening_amount >= 0),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_by text NOT NULL DEFAULT '',
  closed_by_role text NOT NULL DEFAULT '',
  closing_amount double precision,
  expected_amount double precision,
  difference_amount double precision,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opening_note text NOT NULL DEFAULT '',
  closing_note text NOT NULL DEFAULT '',
  closed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_sessions_one_open_per_store
  ON cash_sessions(store_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_cash_sessions_store_opened
  ON cash_sessions(store_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES cash_sessions(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('sale', 'deposit', 'withdrawal', 'expense', 'refund', 'credit_payment', 'adjustment')),
  amount double precision NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL DEFAULT 'cash',
  note text NOT NULL DEFAULT '',
  reference_type text NOT NULL DEFAULT '',
  reference_id uuid,
  created_by text NOT NULL DEFAULT '',
  created_by_role text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cash_movements_session_date
  ON cash_movements(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_movements_store_date
  ON cash_movements(store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS business_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  actor_id text NOT NULL DEFAULT '',
  actor_role text NOT NULL DEFAULT '',
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL DEFAULT '',
  request_id text NOT NULL DEFAULT '',
  ip_address inet,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_business_audit_logs_store_date
  ON business_audit_logs(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_audit_logs_entity
  ON business_audit_logs(entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  deduplication_key text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'published', 'failed', 'dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_deduplication_key_unique_not_blank
  ON outbox_events(deduplication_key) WHERE deduplication_key <> '';
CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON outbox_events(status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'processing', 'failed');

CREATE TABLE IF NOT EXISTS business_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  recipient_type text NOT NULL CHECK (recipient_type IN ('administrator', 'staff', 'customer', 'driver')),
  recipient_id text NOT NULL DEFAULT '',
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'whatsapp')),
  event_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'read', 'failed', 'dead')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text NOT NULL DEFAULT '',
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_business_notifications_recipient
  ON business_notifications(recipient_type, recipient_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_notifications_store_date
  ON business_notifications(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_notifications_whatsapp_pending
  ON business_notifications(status, updated_at, created_at)
  WHERE channel='whatsapp' AND status IN ('pending', 'processing', 'failed');

ALTER TABLE system_users
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

CREATE TABLE IF NOT EXISTS account_recovery_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('administrator', 'staff', 'customer')),
  subject_id text NOT NULL,
  whatsapp_digits text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  used_at timestamptz,
  requested_ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recovery_challenges_subject
  ON account_recovery_challenges(subject_type, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_challenges_expiration
  ON account_recovery_challenges(expires_at) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('administrator', 'staff', 'customer')),
  subject_id text NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('terms', 'privacy', 'data_processing')),
  document_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address inet,
  user_agent text NOT NULL DEFAULT '',
  UNIQUE(subject_type, subject_id, document_type, document_version)
);
