ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_display text NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'do';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS dial_code text NOT NULL DEFAULT '+1';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pin_hash text NOT NULL DEFAULT '';

ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_address text NOT NULL DEFAULT '';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'delivered';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'pos';

UPDATE sales SET status = 'delivered' WHERE status IS NULL OR status = '';
UPDATE sales SET order_type = 'pos' WHERE order_type IS NULL OR order_type = '';

UPDATE stores
SET name = 'Mi Negocio',
    slogan = 'Tu negocio listo para vender',
    address = 'Configura la dirección de tu negocio',
    whatsapp = '+18090000000',
    whatsapp_display = '(809) 000-0000',
    country_code = 'do',
    dial_code = '+1'
WHERE name = 'Negocio Demo';

DELETE FROM products
WHERE global_id IN ('demo-arroz-5lb', 'demo-aceite-1lt', 'demo-leche-1lt');

CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_type ON sales(order_type);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_national_id_unique_not_blank ON customers(national_id) WHERE national_id <> '';
