-- Roll back WAMERCIO 2.5.8 table areas and per-fulfillment payment rules.
ALTER TABLE stores
  DROP COLUMN IF EXISTS payment_methods_by_fulfillment;

DROP INDEX IF EXISTS idx_store_tables_area_active;
ALTER TABLE store_tables
  DROP CONSTRAINT IF EXISTS store_tables_area_name_key;
ALTER TABLE store_tables
  ADD CONSTRAINT store_tables_store_id_name_key UNIQUE(store_id, name);
ALTER TABLE store_tables
  DROP CONSTRAINT IF EXISTS store_tables_area_id_fkey;
ALTER TABLE store_tables
  DROP COLUMN IF EXISTS area_id;

DROP TABLE IF EXISTS store_table_areas;
