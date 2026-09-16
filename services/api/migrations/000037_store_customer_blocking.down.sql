DROP INDEX IF EXISTS idx_customers_store_status;
DROP INDEX IF EXISTS idx_customer_block_events_global;
DROP INDEX IF EXISTS idx_customer_block_events_customer;
DROP TABLE IF EXISTS customer_block_events;
ALTER TABLE customers
  DROP COLUMN IF EXISTS blocked_by_user_id,
  DROP COLUMN IF EXISTS blocked_at,
  DROP COLUMN IF EXISTS blocked_reason;
