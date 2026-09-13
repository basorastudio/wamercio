ALTER TABLE products DROP CONSTRAINT IF EXISTS products_stock_nonnegative_check;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_weighted_values_check;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_weighted_sale_modes_check;

ALTER TABLE products
  DROP COLUMN IF EXISTS weight_precision,
  DROP COLUMN IF EXISTS minimum_amount,
  DROP COLUMN IF EXISTS weight_increment,
  DROP COLUMN IF EXISTS minimum_weight,
  DROP COLUMN IF EXISTS weight_unit,
  DROP COLUMN IF EXISTS allow_amount_sales,
  DROP COLUMN IF EXISTS allow_weight_sales,
  DROP COLUMN IF EXISTS weighted_sale_enabled;

ALTER TABLE products
  ALTER COLUMN price TYPE double precision USING price::double precision,
  ALTER COLUMN cost TYPE double precision USING cost::double precision,
  ALTER COLUMN stock TYPE integer USING GREATEST(0, round(stock))::integer;
