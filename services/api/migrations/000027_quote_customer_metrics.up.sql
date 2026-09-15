-- Cotizaciones son oportunidades comerciales, no compras realizadas.
-- Recalcula métricas históricas para que Clientes/Contactos y facturación
-- no interpreten una solicitud de cotización como una compra.
UPDATE customers c
SET order_count = COALESCE((
      SELECT count(*)::int
      FROM orders o
      WHERE o.customer_id=c.id
        AND o.status<>'canceled'
        AND o.flow_type<>'quote'
    ),0),
    total_spent = COALESCE((
      SELECT sum(o.total)
      FROM orders o
      WHERE o.customer_id=c.id
        AND o.status<>'canceled'
        AND o.flow_type<>'quote'
    ),0),
    last_order_at = (
      SELECT max(o.created_at)
      FROM orders o
      WHERE o.customer_id=c.id
        AND o.status<>'canceled'
        AND o.flow_type<>'quote'
    ),
    updated_at = now();
