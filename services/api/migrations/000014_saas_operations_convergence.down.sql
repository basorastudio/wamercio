DROP TRIGGER IF EXISTS trg_customers_global_identity ON customers;
DROP FUNCTION IF EXISTS wamercio_sync_global_customer();
ALTER TABLE customers DROP COLUMN IF EXISTS global_customer_id;
DROP TABLE IF EXISTS global_customers;
DROP TABLE IF EXISTS platform_audit_log;
DROP TABLE IF EXISTS store_staff;
DROP TABLE IF EXISTS platform_banks;
DROP TABLE IF EXISTS platform_settings;
ALTER TABLE users DROP COLUMN IF EXISTS admin_access;
