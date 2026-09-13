CREATE TABLE IF NOT EXISTS client_carts (
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_client_carts_updated_at ON client_carts(updated_at DESC);
