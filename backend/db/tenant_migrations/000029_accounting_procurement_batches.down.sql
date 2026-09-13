DROP TRIGGER IF EXISTS stores_seed_accounting_accounts ON stores;
DROP FUNCTION IF EXISTS seed_accounting_after_store_insert();
DROP FUNCTION IF EXISTS seed_default_accounting_accounts(uuid);
DROP TABLE IF EXISTS journal_lines;
DROP TABLE IF EXISTS journal_entries;
DROP TABLE IF EXISTS accounting_periods;
DROP TABLE IF EXISTS accounting_accounts;
DROP TABLE IF EXISTS purchase_suggestions;
DROP TABLE IF EXISTS sale_batch_allocations;
DROP TABLE IF EXISTS product_batch_movements;
DROP TABLE IF EXISTS product_batches;
DROP TABLE IF EXISTS supplier_payments;
DROP TABLE IF EXISTS purchase_receipt_items;
DROP TABLE IF EXISTS purchase_receipts;
DROP TABLE IF EXISTS purchase_order_items;
DROP TABLE IF EXISTS purchase_orders;
ALTER TABLE products DROP COLUMN IF EXISTS preferred_supplier_id;
DROP TABLE IF EXISTS suppliers;
ALTER TABLE products
  DROP COLUMN IF EXISTS track_batches,
  DROP COLUMN IF EXISTS reorder_point,
  DROP COLUMN IF EXISTS reorder_target,
  DROP COLUMN IF EXISTS safety_stock,
  DROP COLUMN IF EXISTS lead_time_days;

ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (movement_type IN ('initial','sale','return','adjustment','void','purchase','count','correction'));
