ALTER TABLE orders
  DROP COLUMN IF EXISTS cash_tendered,
  DROP COLUMN IF EXISTS cash_change_requested;
