ALTER TABLE products
  ALTER COLUMN minimum_amount SET DEFAULT 25;

UPDATE products
SET minimum_amount = 25
WHERE weighted_sale_enabled = true AND minimum_amount = 20;
