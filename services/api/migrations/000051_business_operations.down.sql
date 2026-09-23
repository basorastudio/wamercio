DROP INDEX IF EXISTS idx_delivery_remittance_items_assignment;
DROP TABLE IF EXISTS delivery_remittance_items;
DROP INDEX IF EXISTS idx_delivery_remittances_courier_created;
DROP INDEX IF EXISTS idx_delivery_remittances_store_created;
DROP TABLE IF EXISTS delivery_remittances;

ALTER TABLE delivery_assignments
  DROP COLUMN IF EXISTS cash_remitted_at,
  DROP COLUMN IF EXISTS cash_remitted_amount,
  DROP COLUMN IF EXISTS cash_collected_at,
  DROP COLUMN IF EXISTS cash_collected_method,
  DROP COLUMN IF EXISTS cash_collected_amount;

ALTER TABLE orders
  DROP COLUMN IF EXISTS payment_collected_at,
  DROP COLUMN IF EXISTS collected_payment_method,
  DROP COLUMN IF EXISTS cash_session_id,
  DROP COLUMN IF EXISTS branch_id;

DROP INDEX IF EXISTS idx_cash_movements_store_created;
DROP INDEX IF EXISTS idx_cash_movements_session_created;
DROP TABLE IF EXISTS cash_movements;
DROP INDEX IF EXISTS idx_cash_sessions_store_opened;
DROP INDEX IF EXISTS uq_cash_sessions_open_branch;
DROP TABLE IF EXISTS cash_sessions;
DROP INDEX IF EXISTS idx_store_branch_products_product;
DROP TABLE IF EXISTS store_branch_products;
DROP TRIGGER IF EXISTS trg_wamercio_create_primary_branch ON stores;
DROP FUNCTION IF EXISTS wamercio_create_primary_branch();
DROP INDEX IF EXISTS uq_store_branches_primary;
DROP INDEX IF EXISTS uq_store_branches_code;
DROP INDEX IF EXISTS idx_store_branches_store;
DROP TABLE IF EXISTS store_branches;
