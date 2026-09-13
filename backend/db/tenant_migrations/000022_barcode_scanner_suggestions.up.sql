CREATE TABLE IF NOT EXISTS product_barcodes (
    product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    barcode text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT product_barcodes_store_barcode_unique UNIQUE (store_id, barcode)
);

CREATE INDEX IF NOT EXISTS idx_product_barcodes_barcode
    ON product_barcodes (barcode);

CREATE TABLE IF NOT EXISTS product_suggestions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    barcode text NOT NULL,
    global_product_id text NOT NULL DEFAULT '',
    product_name text NOT NULL DEFAULT '',
    product_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    requests_count integer NOT NULL DEFAULT 1 CHECK (requests_count > 0),
    customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
    customer_name text NOT NULL DEFAULT '',
    customer_whatsapp text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
    last_requested_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT product_suggestions_store_barcode_unique UNIQUE (store_id, barcode)
);

CREATE INDEX IF NOT EXISTS idx_product_suggestions_store_status
    ON product_suggestions (store_id, status, last_requested_at DESC);
