CREATE INDEX IF NOT EXISTS idx_products_store_created_at
  ON products (store_id, created_at);

CREATE INDEX IF NOT EXISTS idx_products_store_global_id
  ON products (store_id, global_id)
  WHERE global_id <> '';

CREATE INDEX IF NOT EXISTS idx_products_store_category
  ON products (store_id, category)
  WHERE category <> '';

CREATE INDEX IF NOT EXISTS idx_products_store_brand
  ON products (store_id, brand)
  WHERE brand <> '';

CREATE INDEX IF NOT EXISTS idx_sales_store_date
  ON sales (store_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_sales_customer_orders_date
  ON sales (customer_id, date DESC)
  WHERE order_type = 'customer';

CREATE INDEX IF NOT EXISTS idx_sales_customer_status_date
  ON sales (order_type, status, date DESC)
  WHERE order_type = 'customer';

CREATE INDEX IF NOT EXISTS idx_store_credits_store_customer_status_date
  ON store_credits (store_id, customer, status, date DESC);
