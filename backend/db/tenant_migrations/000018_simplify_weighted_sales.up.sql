-- Standardize the internal defaults used by the simplified Libra / Monto interface.
ALTER TABLE products
  ALTER COLUMN minimum_amount SET DEFAULT 20;

UPDATE products
SET
  allow_weight_sales = true,
  allow_amount_sales = true,
  weight_unit = 'lb',
  minimum_weight = 0.25,
  weight_increment = 0.25,
  minimum_amount = 20,
  weight_precision = 4
WHERE weighted_sale_enabled = true OR lower(trim(format)) = 'libra';
