-- Restaura el comportamiento anterior, donde cualquier flujo no cancelado
-- contribuía a las métricas del cliente.
UPDATE customers c
SET order_count = COALESCE((
      SELECT count(*)::int FROM orders o
      WHERE o.customer_id=c.id AND o.status<>'canceled'
    ),0),
    total_spent = COALESCE((
      SELECT sum(o.total) FROM orders o
      WHERE o.customer_id=c.id AND o.status<>'canceled'
    ),0),
    last_order_at = (
      SELECT max(o.created_at) FROM orders o
      WHERE o.customer_id=c.id AND o.status<>'canceled'
    ),
    updated_at = now();
