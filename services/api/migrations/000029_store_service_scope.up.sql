-- WAMERCIO 2.5.8: alcance territorial configurable por negocio.
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS service_scope varchar(20) NOT NULL DEFAULT 'national';

UPDATE stores
SET service_scope='national'
WHERE service_scope IS NULL OR service_scope NOT IN ('national','provincial','municipal');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='stores_service_scope_check'
  ) THEN
    ALTER TABLE stores
      ADD CONSTRAINT stores_service_scope_check
      CHECK (service_scope IN ('national','provincial','municipal'));
  END IF;
END $$;
