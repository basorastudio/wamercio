-- WAMERCIO 2.5.8: áreas de mesas y métodos de pago por modalidad.

CREATE TABLE IF NOT EXISTS store_table_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  sort_order int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, name)
);
CREATE INDEX IF NOT EXISTS idx_store_table_areas_store_active
  ON store_table_areas(store_id, is_active, sort_order, name);

ALTER TABLE store_tables
  ADD COLUMN IF NOT EXISTS area_id uuid;

-- Preserve every existing table by assigning it to one deterministic default area.
INSERT INTO store_table_areas(store_id, name, sort_order)
SELECT DISTINCT st.store_id, 'Área principal', 10
FROM store_tables st
WHERE NOT EXISTS (
  SELECT 1 FROM store_table_areas a
  WHERE a.store_id=st.store_id AND lower(a.name)=lower('Área principal')
);

UPDATE store_tables st
SET area_id=a.id
FROM store_table_areas a
WHERE st.area_id IS NULL
  AND a.store_id=st.store_id
  AND lower(a.name)=lower('Área principal');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='store_tables_area_id_fkey'
  ) THEN
    ALTER TABLE store_tables
      ADD CONSTRAINT store_tables_area_id_fkey
      FOREIGN KEY (area_id) REFERENCES store_table_areas(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- At this point all historical rows have been backfilled.
ALTER TABLE store_tables
  ALTER COLUMN area_id SET NOT NULL;

-- The same table label can exist in different areas (e.g. Mesa 1 in Salón and Terraza).
ALTER TABLE store_tables
  DROP CONSTRAINT IF EXISTS store_tables_store_id_name_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='store_tables_area_name_key'
  ) THEN
    ALTER TABLE store_tables
      ADD CONSTRAINT store_tables_area_name_key UNIQUE(store_id, area_id, name);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_store_tables_area_active
  ON store_tables(store_id, area_id, is_active, sort_order, name);

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS payment_methods_by_fulfillment jsonb NOT NULL DEFAULT
  '{"delivery":{"cash":true,"cash_on_delivery":true,"bank_transfer":true},"pickup":{"cash":true,"cash_on_delivery":true,"bank_transfer":true},"dine_in":{"cash":true,"cash_on_delivery":true,"bank_transfer":true}}'::jsonb;

-- Preserve existing global payment configuration as the initial per-mode policy.
UPDATE stores
SET payment_methods_by_fulfillment = jsonb_build_object(
  'delivery', jsonb_build_object(
    'cash', cash_enabled,
    'cash_on_delivery', cash_on_delivery_enabled,
    'bank_transfer', bank_transfer_enabled
  ),
  'pickup', jsonb_build_object(
    'cash', cash_enabled,
    'cash_on_delivery', cash_on_delivery_enabled,
    'bank_transfer', bank_transfer_enabled
  ),
  'dine_in', jsonb_build_object(
    'cash', cash_enabled,
    'cash_on_delivery', cash_on_delivery_enabled,
    'bank_transfer', bank_transfer_enabled
  )
);
