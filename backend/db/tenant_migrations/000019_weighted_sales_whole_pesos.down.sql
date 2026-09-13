ALTER TABLE products DROP CONSTRAINT IF EXISTS products_stock_format_precision_check;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_weighted_values_check;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_weighted_only_libra_check;

ALTER TABLE products
  ALTER COLUMN stock TYPE numeric(14,4) USING round(stock::numeric, 4),
  ALTER COLUMN minimum_weight TYPE numeric(14,4) USING round(minimum_weight::numeric, 4),
  ALTER COLUMN weight_increment TYPE numeric(14,4) USING round(weight_increment::numeric, 4),
  ALTER COLUMN minimum_amount TYPE numeric(14,2) USING round(minimum_amount::numeric, 2);

ALTER TABLE products
  ALTER COLUMN weight_precision SET DEFAULT 4;

UPDATE products
SET weight_precision = 4
WHERE weighted_sale_enabled = true;

ALTER TABLE products
  ADD CONSTRAINT products_weighted_values_check
  CHECK (
    minimum_weight > 0
    AND weight_increment > 0
    AND minimum_amount > 0
    AND weight_precision BETWEEN 2 AND 6
    AND length(trim(weight_unit)) BETWEEN 1 AND 12
  );
