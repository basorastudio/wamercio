ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS customer_block_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  global_customer_id uuid REFERENCES global_customers(id) ON DELETE SET NULL,
  action varchar(20) NOT NULL CHECK (action IN ('blocked','unblocked')),
  reason text,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_block_events_customer ON customer_block_events(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_block_events_global ON customer_block_events(global_customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_store_status ON customers(store_id, status);

UPDATE customers
SET blocked_reason=coalesce(nullif(trim(blocked_reason),''),'Bloqueo anterior sin motivo registrado'),
    blocked_at=coalesce(blocked_at,updated_at,now())
WHERE status='blocked';

INSERT INTO customer_block_events(customer_id,store_id,global_customer_id,action,reason,actor_user_id,created_at)
SELECT c.id,c.store_id,c.global_customer_id,'blocked',c.blocked_reason,c.blocked_by_user_id,coalesce(c.blocked_at,c.updated_at,now())
FROM customers c
WHERE c.status='blocked'
  AND NOT EXISTS (
    SELECT 1 FROM customer_block_events e
    WHERE e.customer_id=c.id AND e.action='blocked'
  );
