-- Preserve every duplicate value in metadata, but keep only one canonical barcode
-- so exact scanner lookups can be protected by a database-level unique index.
WITH ranked_barcodes AS (
    SELECT
        id,
        row_number() OVER (
            PARTITION BY upper(regexp_replace(barcode, '[[:space:]]+', '', 'g'))
            ORDER BY active DESC, updated_at DESC, created_at DESC, id
        ) AS position
    FROM platform_catalog_products
    WHERE upper(regexp_replace(barcode, '[[:space:]]+', '', 'g')) <> ''
)
UPDATE platform_catalog_products AS product
SET
    metadata = jsonb_set(
        COALESCE(product.metadata, '{}'::jsonb),
        '{deduplicated_barcode}',
        to_jsonb(product.barcode),
        true
    ),
    barcode = '',
    updated_at = now()
FROM ranked_barcodes AS ranked
WHERE product.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS platform_catalog_products_normalized_barcode_unique
    ON platform_catalog_products (
        upper(regexp_replace(barcode, '[[:space:]]+', '', 'g'))
    )
    WHERE upper(regexp_replace(barcode, '[[:space:]]+', '', 'g')) <> '';
