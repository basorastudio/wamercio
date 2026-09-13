-- Ready orders assigned to the only active delivery driver no longer require manual acceptance.
UPDATE delivery_operations operation
SET accepted_at = COALESCE(operation.accepted_at, operation.assigned_at, operation.ready_at, now()),
    assigned_by = CASE
      WHEN operation.assigned_by LIKE 'automatic:single_active_driver:%' THEN operation.assigned_by
      ELSE 'automatic:single_active_driver:reconciled:' || COALESCE(operation.assigned_by, '')
    END,
    updated_at = now()
FROM sales sale
WHERE operation.sale_id = sale.id
  AND sale.status = 'ready_for_delivery'
  AND operation.assigned_driver_id IS NOT NULL
  AND operation.accepted_at IS NULL
  AND (
    SELECT COUNT(*)
    FROM system_users
    WHERE active = true
      AND lower(trim(role)) = 'delivery_driver'
  ) = 1
  AND operation.assigned_driver_id = (
    SELECT id
    FROM system_users
    WHERE active = true
      AND lower(trim(role)) = 'delivery_driver'
    ORDER BY created_at, id
    LIMIT 1
  );
