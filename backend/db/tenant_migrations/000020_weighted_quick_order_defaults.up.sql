-- Make the customer flow start at 1 lb while allowing amount purchases down
-- to the whole-peso cash equivalent of 1/4 lb. Technical defaults remain
-- automatic and are kept consistent whenever the product price changes.

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_weighted_values_check;

ALTER TABLE products
  ALTER COLUMN minimum_amount SET DEFAULT 1;

UPDATE products
SET
  minimum_weight = 0.25,
  weight_increment = 0.25,
  minimum_amount = GREATEST(1, round(price * 0.25)),
  weight_precision = 2,
  weight_unit = 'lb',
  allow_weight_sales = true,
  allow_amount_sales = true
WHERE lower(trim(format)) = 'libra';

UPDATE products
SET weighted_sale_enabled = false
WHERE coalesce(lower(trim(format)), '') <> 'libra';

CREATE OR REPLACE FUNCTION sync_weighted_product_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(lower(trim(NEW.format)), '') = 'libra' THEN
    NEW.minimum_weight := 0.25;
    NEW.weight_increment := 0.25;
    NEW.minimum_amount := GREATEST(1, round(coalesce(NEW.price, 0) * 0.25));
    NEW.weight_precision := 2;
    NEW.weight_unit := 'lb';
    NEW.allow_weight_sales := true;
    NEW.allow_amount_sales := true;
  ELSE
    NEW.weighted_sale_enabled := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_sync_weighted_defaults ON products;
CREATE TRIGGER products_sync_weighted_defaults
BEFORE INSERT OR UPDATE OF
  format,
  price,
  weighted_sale_enabled,
  minimum_weight,
  weight_increment,
  minimum_amount,
  weight_precision,
  weight_unit,
  allow_weight_sales,
  allow_amount_sales
ON products
FOR EACH ROW
EXECUTE FUNCTION sync_weighted_product_defaults();

ALTER TABLE products
  ADD CONSTRAINT products_weighted_values_check
  CHECK (
    coalesce(lower(trim(format)), '') <> 'libra'
    OR (
      minimum_weight = 0.25
      AND weight_increment = 0.25
      AND minimum_amount = GREATEST(1, round(price * 0.25))
      AND weight_precision = 2
      AND trim(weight_unit) = 'lb'
      AND allow_weight_sales = true
      AND allow_amount_sales = true
    )
  );
