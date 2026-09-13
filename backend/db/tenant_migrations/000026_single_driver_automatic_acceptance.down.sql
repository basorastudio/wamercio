-- Restore the explicit acceptance step only for automatic assignments that have not started a route.
UPDATE delivery_operations
SET accepted_at = NULL,
    assigned_by = CASE
      WHEN assigned_by LIKE 'automatic:single_active_driver:reconciled:%'
        THEN substr(assigned_by, length('automatic:single_active_driver:reconciled:') + 1)
      ELSE assigned_by
    END,
    updated_at = now()
WHERE assigned_by LIKE 'automatic:single_active_driver:%'
  AND route_started_at IS NULL
  AND delivered_at IS NULL;
