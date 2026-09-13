-- Keep inventory weights at two decimals and cash totals in whole Dominican pesos.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_weighted_values_check;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_stock_format_precision_check;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_weighted_only_libra_check;

ALTER TABLE products
  ALTER COLUMN stock TYPE numeric(14,2) USING round(stock::numeric, 2),
  ALTER COLUMN minimum_weight TYPE numeric(14,2) USING round(minimum_weight::numeric, 2),
  ALTER COLUMN weight_increment TYPE numeric(14,2) USING round(weight_increment::numeric, 2),
  ALTER COLUMN minimum_amount TYPE numeric(14,0) USING round(minimum_amount::numeric, 0);

ALTER TABLE products
  ALTER COLUMN minimum_weight SET DEFAULT 0.25,
  ALTER COLUMN weight_increment SET DEFAULT 0.25,
  ALTER COLUMN minimum_amount SET DEFAULT 20,
  ALTER COLUMN weight_precision SET DEFAULT 2;

UPDATE products
SET
  stock = CASE
    WHEN lower(trim(format)) = 'libra' THEN round(stock::numeric, 2)
    ELSE floor(stock::numeric)
  END,
  minimum_weight = 0.25,
  weight_increment = 0.25,
  minimum_amount = 20,
  weight_precision = 2,
  weight_unit = 'lb',
  weighted_sale_enabled = weighted_sale_enabled AND lower(trim(format)) = 'libra',
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

ALTER TABLE products
  ADD CONSTRAINT products_stock_format_precision_check
  CHECK (coalesce(lower(trim(format)), '') = 'libra' OR stock = trunc(stock));

ALTER TABLE products
  ADD CONSTRAINT products_weighted_only_libra_check
  CHECK (weighted_sale_enabled = false OR coalesce(lower(trim(format)), '') = 'libra');
