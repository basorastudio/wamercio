ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_service_scope_check;
ALTER TABLE stores DROP COLUMN IF EXISTS service_scope;
