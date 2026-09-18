DROP INDEX IF EXISTS idx_orders_payment_account;
ALTER TABLE orders DROP COLUMN IF EXISTS payment_account_id;
ALTER TABLE stores
  DROP COLUMN IF EXISTS terminal_fixed_fee,
  DROP COLUMN IF EXISTS terminal_percentage_fee,
  DROP COLUMN IF EXISTS terminal_account_id,
  DROP COLUMN IF EXISTS transfer_account_id,
  DROP COLUMN IF EXISTS cheque_enabled;
DROP TABLE IF EXISTS store_bank_accounts;
