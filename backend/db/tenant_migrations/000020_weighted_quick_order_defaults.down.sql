DROP TRIGGER IF EXISTS products_sync_weighted_defaults ON products;
DROP FUNCTION IF EXISTS sync_weighted_product_defaults();

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_weighted_values_check;

ALTER TABLE products
  ALTER COLUMN minimum_amount SET DEFAULT 20;

UPDATE products
SET
  minimum_weight = 0.25,
  weight_increment = 0.25,
  minimum_amount = 20,
  weight_precision = 2,
  weight_unit = 'lb',
  allow_weight_sales = true,
  allow_amount_sales = true;

ALTER TABLE products
  ADD CONSTRAINT products_weighted_values_check
  CHECK (
    minimum_weight = 0.25
    AND weight_increment = 0.25
    AND minimum_amount = 20
    AND weight_precision = 2
    AND length(trim(weight_unit)) BETWEEN 1 AND 12
  );
