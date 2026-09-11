-- Recreate legacy nullable fields for rollback compatibility.
-- Previous email values are intentionally not restored.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS email varchar(190);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email varchar(190);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email varchar(190);
