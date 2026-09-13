CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT '📦',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_store_name_unique UNIQUE (store_id, name)
);

CREATE INDEX IF NOT EXISTS idx_categories_store_id ON categories(store_id);

