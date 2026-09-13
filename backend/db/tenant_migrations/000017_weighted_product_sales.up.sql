-- Enable exact fractional inventory and flexible sales for products sold by weight.
-- Monetary values use fixed precision; weights keep four decimal places.
ALTER TABLE products
  ALTER COLUMN price TYPE numeric(14,2) USING round(price::numeric, 2),
  ALTER COLUMN cost TYPE numeric(14,2) USING round(cost::numeric, 2),
  ALTER COLUMN stock TYPE numeric(14,4) USING round(stock::numeric, 4);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS weighted_sale_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_weight_sales boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_amount_sales boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS weight_unit text NOT NULL DEFAULT 'lb',
  ADD COLUMN IF NOT EXISTS minimum_weight numeric(14,4) NOT NULL DEFAULT 0.25,
  ADD COLUMN IF NOT EXISTS weight_increment numeric(14,4) NOT NULL DEFAULT 0.25,
  ADD COLUMN IF NOT EXISTS minimum_amount numeric(14,2) NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS weight_precision integer NOT NULL DEFAULT 4;

-- Existing products explicitly marked as Libra become flexible automatically.
UPDATE products
SET weighted_sale_enabled = true
WHERE lower(trim(format)) = 'libra';

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_weighted_sale_modes_check;
ALTER TABLE products
  ADD CONSTRAINT products_weighted_sale_modes_check
  CHECK (NOT weighted_sale_enabled OR allow_weight_sales OR allow_amount_sales);

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_weighted_values_check;
ALTER TABLE products
  ADD CONSTRAINT products_weighted_values_check
  CHECK (
    minimum_weight > 0
    AND weight_increment > 0
    AND minimum_amount > 0
    AND weight_precision BETWEEN 2 AND 6
    AND length(trim(weight_unit)) BETWEEN 1 AND 12
  );

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_stock_nonnegative_check;
ALTER TABLE products
  ADD CONSTRAINT products_stock_nonnegative_check CHECK (stock >= 0);
