CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brands_store_name_unique UNIQUE (store_id, name)
);

CREATE INDEX IF NOT EXISTS idx_brands_store_id ON brands(store_id);

INSERT INTO brands (store_id, name)
SELECT DISTINCT store_id, brand
FROM products
WHERE brand <> ''
ON CONFLICT (store_id, name) DO NOTHING;
