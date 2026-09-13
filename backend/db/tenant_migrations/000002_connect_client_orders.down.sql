DROP INDEX IF EXISTS idx_sales_customer_id;
DROP INDEX IF EXISTS idx_sales_order_type;
DROP INDEX IF EXISTS idx_sales_status;
DROP INDEX IF EXISTS idx_customers_national_id_unique_not_blank;

ALTER TABLE sales DROP COLUMN IF EXISTS customer_id;
ALTER TABLE sales DROP COLUMN IF EXISTS delivery_address;
ALTER TABLE sales DROP COLUMN IF EXISTS status;
ALTER TABLE sales DROP COLUMN IF EXISTS order_type;

ALTER TABLE customers DROP COLUMN IF EXISTS whatsapp_display;
ALTER TABLE customers DROP COLUMN IF EXISTS country_code;
ALTER TABLE customers DROP COLUMN IF EXISTS dial_code;
ALTER TABLE customers DROP COLUMN IF EXISTS pin_hash;
