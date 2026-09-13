DROP TABLE IF EXISTS legal_acceptances;
DROP TABLE IF EXISTS account_recovery_challenges;
ALTER TABLE system_users
  DROP COLUMN IF EXISTS last_login_at,
  DROP COLUMN IF EXISTS locked_until,
  DROP COLUMN IF EXISTS failed_login_attempts,
  DROP COLUMN IF EXISTS permissions;
DROP TABLE IF EXISTS business_notifications;
DROP TABLE IF EXISTS outbox_events;
DROP TABLE IF EXISTS business_audit_logs;
DROP TABLE IF EXISTS cash_movements;
DROP TABLE IF EXISTS cash_sessions;
DROP TABLE IF EXISTS inventory_movements;
DROP TABLE IF EXISTS sale_returns;
DROP INDEX IF EXISTS idx_store_credits_customer_id_date;
DROP INDEX IF EXISTS idx_store_credits_store_status_due;
ALTER TABLE store_credits
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS reversed_at,
  DROP COLUMN IF EXISTS reference_id,
  DROP COLUMN IF EXISTS reference_type,
  DROP COLUMN IF EXISTS paid_amount,
  DROP COLUMN IF EXISTS due_date,
  DROP COLUMN IF EXISTS customer_id;
DROP INDEX IF EXISTS idx_sales_store_status_date;
DROP INDEX IF EXISTS idx_sales_reference_number_unique_not_blank;
ALTER TABLE sales
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS original_sale_id,
  DROP COLUMN IF EXISTS reversed_by,
  DROP COLUMN IF EXISTS reversal_reason,
  DROP COLUMN IF EXISTS reversed_at,
  DROP COLUMN IF EXISTS reference_number;
