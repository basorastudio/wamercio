DROP INDEX IF EXISTS idx_customers_store_cheque_enabled;
ALTER TABLE customers DROP COLUMN IF EXISTS cheque_enabled;
