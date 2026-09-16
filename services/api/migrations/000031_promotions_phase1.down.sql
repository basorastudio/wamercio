ALTER TABLE table_reservations
  DROP COLUMN IF EXISTS notes,
  DROP COLUMN IF EXISTS guest_phone,
  DROP COLUMN IF EXISTS guest_name;

ALTER TABLE orders
  DROP COLUMN IF EXISTS promotion_name,
  DROP COLUMN IF EXISTS promotion_id;

DROP TABLE IF EXISTS promotion_categories;
DROP TABLE IF EXISTS promotion_products;
DROP INDEX IF EXISTS idx_promotions_store_active;
DROP TABLE IF EXISTS promotions;
