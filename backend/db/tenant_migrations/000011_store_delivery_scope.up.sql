ALTER TABLE stores
ADD COLUMN IF NOT EXISTS delivery_scope text NOT NULL DEFAULT 'municipal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stores_delivery_scope_check'
  ) THEN
    ALTER TABLE stores
    ADD CONSTRAINT stores_delivery_scope_check CHECK (delivery_scope IN ('provincial', 'municipal'));
  END IF;
END $$;

UPDATE stores
SET delivery_scope = 'municipal'
WHERE delivery_scope IS NULL OR delivery_scope NOT IN ('provincial', 'municipal');
