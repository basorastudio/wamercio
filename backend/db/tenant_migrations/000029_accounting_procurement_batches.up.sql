CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (movement_type IN ('initial','sale','return','adjustment','void','purchase','count','correction','expiration','quarantine','reactivation','recall'));

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS track_batches boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reorder_point numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_target numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS safety_stock numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_time_days integer NOT NULL DEFAULT 7 CHECK (lead_time_days BETWEEN 0 AND 365);

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  tax_id text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  whatsapp text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_store_name_unique ON suppliers(store_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_suppliers_store_active ON suppliers(store_id, active, name);

ALTER TABLE products ADD COLUMN IF NOT EXISTS preferred_supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_preferred_supplier ON products(preferred_supplier_id) WHERE preferred_supplier_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  order_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','partially_received','received','cancelled')),
  expected_date date,
  notes text NOT NULL DEFAULT '',
  payment_method text NOT NULL DEFAULT 'accounts_payable' CHECK (payment_method IN ('accounts_payable','cash','bank_transfer','card')),
  subtotal numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  created_by text NOT NULL DEFAULT '',
  approved_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  received_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_orders_store_number ON purchase_orders(store_id, order_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_store_status ON purchase_orders(store_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_ordered numeric(14,4) NOT NULL CHECK (quantity_ordered > 0),
  quantity_received numeric(14,4) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  line_total numeric(14,2) GENERATED ALWAYS AS (round(quantity_ordered * unit_cost, 2)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_order_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product ON purchase_order_items(product_id, purchase_order_id);

CREATE TABLE IF NOT EXISTS purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  receipt_number text NOT NULL,
  invoice_number text NOT NULL DEFAULT '',
  payment_method text NOT NULL CHECK (payment_method IN ('accounts_payable','cash','bank_transfer','card')),
  total numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  notes text NOT NULL DEFAULT '',
  received_by text NOT NULL DEFAULT '',
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_receipts_store_number ON purchase_receipts(store_id, receipt_number);
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_order ON purchase_receipts(purchase_order_id, received_at DESC);


CREATE TABLE IF NOT EXISTS supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('cash','bank_transfer','card')),
  reference text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_store_supplier ON supplier_payments(store_id, supplier_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS purchase_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES purchase_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id uuid NOT NULL REFERENCES purchase_order_items(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity numeric(14,4) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(14,2) NOT NULL CHECK (unit_cost >= 0),
  lot_number text NOT NULL DEFAULT '',
  expiry_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchase_receipt_items_receipt ON purchase_receipt_items(receipt_id);

CREATE TABLE IF NOT EXISTS product_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  purchase_receipt_item_id uuid REFERENCES purchase_receipt_items(id) ON DELETE SET NULL,
  lot_number text NOT NULL,
  expiry_date date,
  received_at timestamptz NOT NULL DEFAULT now(),
  initial_quantity numeric(14,4) NOT NULL CHECK (initial_quantity > 0),
  available_quantity numeric(14,4) NOT NULL CHECK (available_quantity >= 0),
  unit_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','quarantined','depleted','expired','recalled')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, product_id, lot_number)
);
CREATE INDEX IF NOT EXISTS idx_product_batches_fefo ON product_batches(store_id, product_id, status, expiry_date NULLS LAST, received_at);
CREATE INDEX IF NOT EXISTS idx_product_batches_expiry ON product_batches(store_id, expiry_date, status) WHERE expiry_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS product_batch_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES product_batches(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  movement_type text NOT NULL CHECK (movement_type IN ('initial','receipt','sale','return','adjustment','expiration','quarantine','reactivation','recall')),
  quantity_delta numeric(14,4) NOT NULL DEFAULT 0,
  reference_type text NOT NULL DEFAULT '',
  reference_id text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  actor_id text NOT NULL DEFAULT '',
  actor_role text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_batch_movements_batch ON product_batch_movements(batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_batch_movements_product ON product_batch_movements(store_id, product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sale_batch_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES product_batches(id) ON DELETE RESTRICT,
  quantity numeric(14,4) NOT NULL CHECK (quantity > 0),
  restored_quantity numeric(14,4) NOT NULL DEFAULT 0 CHECK (restored_quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sale_batch_allocations_sale ON sale_batch_allocations(sale_id, product_id);

CREATE TABLE IF NOT EXISTS purchase_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  current_stock numeric(14,4) NOT NULL DEFAULT 0,
  on_order_quantity numeric(14,4) NOT NULL DEFAULT 0,
  average_daily_sales numeric(14,4) NOT NULL DEFAULT 0,
  reorder_point numeric(14,4) NOT NULL DEFAULT 0,
  target_stock numeric(14,4) NOT NULL DEFAULT 0,
  suggested_quantity numeric(14,4) NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ordered','dismissed')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  dismissed_until date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_purchase_suggestions_store_status ON purchase_suggestions(store_id, status, suggested_quantity DESC);

CREATE TABLE IF NOT EXISTS accounting_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  normal_balance text NOT NULL CHECK (normal_balance IN ('debit','credit')),
  system_key text NOT NULL DEFAULT '',
  parent_id uuid REFERENCES accounting_accounts(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, code)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_accounts_system_key ON accounting_accounts(store_id, system_key) WHERE system_key <> '';
CREATE INDEX IF NOT EXISTS idx_accounting_accounts_store_type ON accounting_accounts(store_id, account_type, code);

CREATE TABLE IF NOT EXISTS accounting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_by text NOT NULL DEFAULT '',
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  UNIQUE (store_id, starts_on, ends_on)
);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_store_dates ON accounting_periods(store_id, starts_on, ends_on);

CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  entry_number text NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  source_type text NOT NULL DEFAULT 'manual',
  source_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','voided')),
  reversal_of uuid REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by text NOT NULL DEFAULT '',
  posted_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  voided_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, entry_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_source_unique ON journal_entries(store_id, source_type, source_id) WHERE source_id <> '' AND status <> 'voided';
CREATE INDEX IF NOT EXISTS idx_journal_entries_store_date ON journal_entries(store_id, entry_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounting_accounts(id) ON DELETE RESTRICT,
  description text NOT NULL DEFAULT '',
  debit numeric(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id, journal_entry_id);

CREATE OR REPLACE FUNCTION seed_default_accounting_accounts(target_store uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO accounting_accounts (store_id, code, name, account_type, normal_balance, system_key)
  VALUES
    (target_store,'1101','Efectivo en caja','asset','debit','cash'),
    (target_store,'1102','Bancos','asset','debit','bank'),
    (target_store,'1103','Tarjetas por conciliar','asset','debit','card_clearing'),
    (target_store,'1201','Cuentas por cobrar','asset','debit','accounts_receivable'),
    (target_store,'1301','Inventario de mercancías','asset','debit','inventory'),
    (target_store,'2101','Cuentas por pagar','liability','credit','accounts_payable'),
    (target_store,'3101','Capital del propietario','equity','credit','owner_equity'),
    (target_store,'4101','Ingresos por ventas','revenue','credit','sales_revenue'),
    (target_store,'4102','Devoluciones y descuentos','revenue','debit','sales_returns'),
    (target_store,'5101','Costo de mercancía vendida','expense','debit','cost_of_goods_sold'),
    (target_store,'5201','Gastos operativos','expense','debit','operating_expense'),
    (target_store,'5202','Pérdidas y ajustes de inventario','expense','debit','inventory_adjustment'),
    (target_store,'5203','Diferencias de caja','expense','debit','cash_over_short')
  ON CONFLICT (store_id, code) DO NOTHING;
END;
$$;

SELECT seed_default_accounting_accounts(id) FROM stores;

CREATE OR REPLACE FUNCTION seed_accounting_after_store_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM seed_default_accounting_accounts(NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS stores_seed_accounting_accounts ON stores;
CREATE TRIGGER stores_seed_accounting_accounts
AFTER INSERT ON stores FOR EACH ROW EXECUTE FUNCTION seed_accounting_after_store_insert();
