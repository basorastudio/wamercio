ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cash_change_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cash_tendered numeric(12,2);
