ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS cheque_enabled boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_customers_store_cheque_enabled
  ON customers(store_id,cheque_enabled)
  WHERE cheque_enabled=true;
