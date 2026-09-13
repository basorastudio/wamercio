DROP INDEX IF EXISTS idx_inventory_dispositions_sale;
DROP INDEX IF EXISTS idx_inventory_dispositions_store_date;
DROP TABLE IF EXISTS inventory_dispositions;

ALTER TABLE sale_returns DROP CONSTRAINT IF EXISTS sale_returns_inventory_disposition_check;
ALTER TABLE sale_returns DROP COLUMN IF EXISTS inventory_restocked;
ALTER TABLE sale_returns DROP COLUMN IF EXISTS inventory_disposition;

ALTER TABLE delivery_operations DROP COLUMN IF EXISTS incident_id;
DROP INDEX IF EXISTS idx_delivery_incidents_store_status_date;
DROP INDEX IF EXISTS idx_delivery_incidents_one_open_per_sale;
DROP TABLE IF EXISTS delivery_incidents;

DROP INDEX IF EXISTS idx_delivery_operations_status_updated;
DROP INDEX IF EXISTS idx_delivery_operations_active_driver;
CREATE INDEX idx_delivery_operations_active_driver
  ON delivery_operations (assigned_driver_id, accepted_at, route_started_at)
  WHERE delivered_at IS NULL;
ALTER TABLE delivery_operations DROP CONSTRAINT IF EXISTS delivery_operations_status_check;
ALTER TABLE delivery_operations DROP COLUMN IF EXISTS cancelled_by;
ALTER TABLE delivery_operations DROP COLUMN IF EXISTS cancellation_reason;
ALTER TABLE delivery_operations DROP COLUMN IF EXISTS cancelled_at;
ALTER TABLE delivery_operations DROP COLUMN IF EXISTS status;

DROP INDEX IF EXISTS idx_sales_store_financial_status_date;
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_financial_status_check;
UPDATE sales
SET status = CASE
  WHEN financial_status = 'voided' THEN 'voided'
  WHEN financial_status = 'returned' THEN 'returned'
  WHEN financial_status = 'partially_returned' THEN 'partially_returned'
  ELSE status
END;
ALTER TABLE sales DROP COLUMN IF EXISTS financial_status;
