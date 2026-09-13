-- Retira únicamente las imágenes demo locales agregadas por 2.1.2.
UPDATE template_products SET image_url=NULL WHERE image_url LIKE '/demo-products/%';
UPDATE products SET image_url='' WHERE image_url LIKE '/demo-products/%';

UPDATE categories SET image_url='' WHERE image_url LIKE '/demo-products/%';
