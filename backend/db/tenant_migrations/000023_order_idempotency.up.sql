CREATE TABLE IF NOT EXISTS order_idempotency (
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  order_id uuid REFERENCES sales(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, store_id, idempotency_key),
  CONSTRAINT order_idempotency_key_length CHECK (char_length(idempotency_key) BETWEEN 1 AND 128)
);

CREATE INDEX IF NOT EXISTS idx_order_idempotency_created_at
  ON order_idempotency (created_at DESC);
