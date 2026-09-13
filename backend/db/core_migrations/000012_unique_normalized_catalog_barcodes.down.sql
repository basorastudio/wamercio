DROP INDEX IF EXISTS platform_catalog_products_normalized_barcode_unique;

UPDATE platform_catalog_products
SET
    barcode = metadata->>'deduplicated_barcode',
    metadata = metadata - 'deduplicated_barcode',
    updated_at = now()
WHERE barcode = ''
  AND metadata ? 'deduplicated_barcode';
