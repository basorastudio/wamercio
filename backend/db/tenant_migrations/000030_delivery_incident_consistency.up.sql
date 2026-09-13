-- Separate the commercial result of a sale from the operational lifecycle of an order.
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS financial_status text NOT NULL DEFAULT 'completed';

UPDATE sales
SET financial_status = CASE
  WHEN status IN ('cancelled','voided') THEN 'voided'
  WHEN status = 'returned' THEN 'returned'
  WHEN status = 'partially_returned' THEN 'partially_returned'
  ELSE 'completed'
END
WHERE financial_status = 'completed';

-- Historic financial outcomes were stored in the operational order status.
-- Keep the financial result above and restore a valid order lifecycle for every existing record.
UPDATE sales
SET status = CASE
  WHEN status IN ('voided','cancelled') THEN 'cancelled'
  WHEN status IN ('returned','partially_returned') THEN 'delivered'
  ELSE status
END
WHERE status IN ('voided','cancelled','returned','partially_returned');

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_financial_status_check;
ALTER TABLE sales
  ADD CONSTRAINT sales_financial_status_check
  CHECK (financial_status IN ('completed','voided','partially_returned','returned'));

CREATE INDEX IF NOT EXISTS idx_sales_store_financial_status_date
  ON sales(store_id, financial_status, date DESC);

ALTER TABLE delivery_operations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cancelled_by text NOT NULL DEFAULT '';

ALTER TABLE delivery_operations DROP CONSTRAINT IF EXISTS delivery_operations_status_check;
ALTER TABLE delivery_operations
  ADD CONSTRAINT delivery_operations_status_check
  CHECK (status IN ('pending','preparing','ready_for_delivery','assigned','accepted','on_the_way','issue','delivered','cancelled'));

UPDATE delivery_operations operation
SET status = CASE
  WHEN operation.cancelled_at IS NOT NULL OR sale.status IN ('cancelled','voided') THEN 'cancelled'
  WHEN operation.delivered_at IS NOT NULL OR sale.status = 'delivered' THEN 'delivered'
  WHEN sale.status = 'issue' THEN 'issue'
  WHEN operation.route_started_at IS NOT NULL OR sale.status = 'on_the_way' THEN 'on_the_way'
  WHEN operation.accepted_at IS NOT NULL THEN 'accepted'
  WHEN operation.assigned_driver_id IS NOT NULL THEN 'assigned'
  WHEN operation.ready_at IS NOT NULL OR sale.status = 'ready_for_delivery' THEN 'ready_for_delivery'
  WHEN sale.status = 'preparing' THEN 'preparing'
  ELSE 'pending'
END
FROM sales sale
WHERE sale.id = operation.sale_id;

UPDATE delivery_operations operation
SET cancelled_at = COALESCE(operation.cancelled_at, sale.reversed_at, sale.updated_at, now()),
    cancellation_reason = COALESCE(NULLIF(operation.cancellation_reason,''), NULLIF(sale.reversal_reason,''), 'Operación cancelada'),
    cancelled_by = COALESCE(NULLIF(operation.cancelled_by,''), NULLIF(sale.reversed_by,''), 'system'),
    updated_at = now()
FROM sales sale
WHERE sale.id = operation.sale_id
  AND operation.status = 'cancelled';

CREATE INDEX IF NOT EXISTS idx_delivery_operations_status_updated
  ON delivery_operations(store_id, status, updated_at DESC);

DROP INDEX IF EXISTS idx_delivery_operations_active_driver;
CREATE INDEX idx_delivery_operations_active_driver
  ON delivery_operations (assigned_driver_id, accepted_at, route_started_at)
  WHERE delivered_at IS NULL AND status <> 'cancelled';

CREATE TABLE IF NOT EXISTS delivery_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES system_users(id) ON DELETE SET NULL,
  previous_order_status text NOT NULL DEFAULT 'on_the_way',
  issue_type text NOT NULL DEFAULT 'other'
    CHECK (issue_type IN ('damaged','lost','customer_unavailable','address_problem','vehicle_problem','payment_problem','other')),
  note text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolution text NOT NULL DEFAULT ''
    CHECK (resolution IN ('','resume','reassign','replace_and_continue','partial_delivery','cancelled')),
  inventory_disposition text NOT NULL DEFAULT 'none'
    CHECK (inventory_disposition IN ('none','restock','damaged','lost','quarantine')),
  resolution_note text NOT NULL DEFAULT '',
  reported_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_incidents_one_open_per_sale
  ON delivery_incidents(sale_id) WHERE status='open';
CREATE INDEX IF NOT EXISTS idx_delivery_incidents_store_status_date
  ON delivery_incidents(store_id, status, reported_at DESC);

ALTER TABLE delivery_operations
  ADD COLUMN IF NOT EXISTS incident_id uuid REFERENCES delivery_incidents(id) ON DELETE SET NULL;

-- Preserve unresolved legacy problems so they can be resolved from the administrative workflow.
INSERT INTO delivery_incidents (
  sale_id,store_id,driver_id,previous_order_status,issue_type,note,status,reported_at,created_at,updated_at
)
SELECT
  sale.id,
  sale.store_id,
  operation.assigned_driver_id,
  CASE
    WHEN operation.route_started_at IS NOT NULL THEN 'on_the_way'
    WHEN operation.ready_at IS NOT NULL OR operation.assigned_driver_id IS NOT NULL THEN 'ready_for_delivery'
    ELSE 'pending'
  END,
  'other',
  COALESCE(NULLIF(trim(operation.issue_note),''),'Incidencia pendiente de revisión'),
  'open',
  COALESCE(operation.updated_at,sale.updated_at,sale.date,now()),
  now(),
  now()
FROM sales sale
JOIN delivery_operations operation ON operation.sale_id=sale.id
WHERE sale.status='issue'
  AND sale.financial_status='completed'
  AND NOT EXISTS (
    SELECT 1 FROM delivery_incidents incident
    WHERE incident.sale_id=sale.id AND incident.status='open'
  )
ON CONFLICT DO NOTHING;

UPDATE delivery_operations operation
SET incident_id=incident.id,
    status='issue',
    updated_at=now()
FROM delivery_incidents incident
WHERE incident.sale_id=operation.sale_id
  AND incident.status='open'
  AND operation.incident_id IS NULL;

ALTER TABLE sale_returns
  ADD COLUMN IF NOT EXISTS inventory_disposition text NOT NULL DEFAULT 'restock',
  ADD COLUMN IF NOT EXISTS inventory_restocked boolean NOT NULL DEFAULT true;

ALTER TABLE sale_returns DROP CONSTRAINT IF EXISTS sale_returns_inventory_disposition_check;
ALTER TABLE sale_returns
  ADD CONSTRAINT sale_returns_inventory_disposition_check
  CHECK (inventory_disposition IN ('restock','damaged','lost','quarantine'));

CREATE TABLE IF NOT EXISTS inventory_dispositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
  incident_id uuid REFERENCES delivery_incidents(id) ON DELETE SET NULL,
  disposition text NOT NULL CHECK (disposition IN ('restock','damaged','lost','quarantine')),
  quantity double precision NOT NULL CHECK (quantity > 0),
  unit_cost numeric(14,4) NOT NULL DEFAULT 0,
  total_cost numeric(14,2) NOT NULL DEFAULT 0,
  restocked boolean NOT NULL DEFAULT false,
  reason text NOT NULL DEFAULT '',
  actor_id text NOT NULL DEFAULT '',
  actor_role text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventory_dispositions_store_date
  ON inventory_dispositions(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_dispositions_sale
  ON inventory_dispositions(sale_id, created_at DESC) WHERE sale_id IS NOT NULL;
