DROP INDEX IF EXISTS idx_subscription_requests_one_pending;
DROP INDEX IF EXISTS idx_subscription_requests_status;
DROP TABLE IF EXISTS subscription_requests;

ALTER TABLE orders
  DROP COLUMN IF EXISTS payment_proof_url,
  DROP COLUMN IF EXISTS delivery_type,
  DROP COLUMN IF EXISTS customer_id;
DROP TABLE IF EXISTS customers;

ALTER TABLE plans
  DROP COLUMN IF EXISTS is_featured,
  DROP COLUMN IF EXISTS description;

ALTER TABLE products
  DROP COLUMN IF EXISTS sort_order,
  DROP COLUMN IF EXISTS is_featured,
  DROP COLUMN IF EXISTS tag;

ALTER TABLE stores
  DROP COLUMN IF EXISTS checkout_message,
  DROP COLUMN IF EXISTS order_notice,
  DROP COLUMN IF EXISTS business_hours,
  DROP COLUMN IF EXISTS bank_account_type,
  DROP COLUMN IF EXISTS bank_account_number,
  DROP COLUMN IF EXISTS bank_account_name,
  DROP COLUMN IF EXISTS bank_name,
  DROP COLUMN IF EXISTS bank_transfer_enabled,
  DROP COLUMN IF EXISTS cash_on_delivery_enabled,
  DROP COLUMN IF EXISTS cash_enabled,
  DROP COLUMN IF EXISTS delivery_enabled,
  DROP COLUMN IF EXISTS pickup_enabled,
  DROP COLUMN IF EXISTS minimum_order,
  DROP COLUMN IF EXISTS banner_url,
  DROP COLUMN IF EXISTS email;
