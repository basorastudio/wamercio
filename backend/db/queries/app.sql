-- Central sqlc query definitions.
-- Run `sqlc generate` from the backend directory after changing these queries.

-- name: ListStores :many
SELECT id::text, name, slogan, address, province_code, province, municipality_code, municipality, district_code, neighborhood_id, neighborhood, street, street_number, whatsapp, whatsapp_display, country_code, dial_code, emoji, logo_url, color, active, store_status, payment_settings, service_hours, delivery_scope, latitude, longitude, location_accuracy, location_source, location_updated_at, created_at
FROM stores
ORDER BY created_at
LIMIT 1;

-- name: GetStore :one
SELECT id::text, name, slogan, address, province_code, province, municipality_code, municipality, district_code, neighborhood_id, neighborhood, street, street_number, whatsapp, whatsapp_display, country_code, dial_code, emoji, logo_url, color, active, store_status, payment_settings, service_hours, delivery_scope, latitude, longitude, location_accuracy, location_source, location_updated_at, created_at
FROM stores
WHERE id = $1;

-- name: CreateStore :one
INSERT INTO stores (name, slogan, address, province_code, province, municipality_code, municipality, district_code, neighborhood_id, neighborhood, street, street_number, whatsapp, whatsapp_display, country_code, dial_code, emoji, logo_url, color, active, store_status, payment_settings, service_hours, delivery_scope, latitude, longitude, location_accuracy, location_source, location_updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23::jsonb,$24,$25,$26,$27,$28,$29)
RETURNING id::text, name, slogan, address, province_code, province, municipality_code, municipality, district_code, neighborhood_id, neighborhood, street, street_number, whatsapp, whatsapp_display, country_code, dial_code, emoji, logo_url, color, active, store_status, payment_settings, service_hours, delivery_scope, latitude, longitude, location_accuracy, location_source, location_updated_at, created_at;

-- name: DeleteStore :exec
DELETE FROM stores WHERE id = $1;

-- name: ListProductsByStore :many
SELECT id::text, store_id::text, global_id, name, description, category, category_icon, price, cost, stock, image, brand, format, "group", detail, weighted_sale_enabled, allow_weight_sales, allow_amount_sales, weight_unit, minimum_weight, weight_increment, minimum_amount, weight_precision, created_at
FROM products
WHERE store_id = $1
ORDER BY created_at;

-- name: GetProduct :one
SELECT id::text, store_id::text, global_id, name, description, category, category_icon, price, cost, stock, image, brand, format, "group", detail, weighted_sale_enabled, allow_weight_sales, allow_amount_sales, weight_unit, minimum_weight, weight_increment, minimum_amount, weight_precision, created_at
FROM products
WHERE id = $1;

-- name: CreateProduct :one
INSERT INTO products (store_id, global_id, name, description, category, category_icon, price, cost, stock, image, brand, format, "group", detail, weighted_sale_enabled, allow_weight_sales, allow_amount_sales, weight_unit, minimum_weight, weight_increment, minimum_amount, weight_precision)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
RETURNING id::text, store_id::text, global_id, name, description, category, category_icon, price, cost, stock, image, brand, format, "group", detail, weighted_sale_enabled, allow_weight_sales, allow_amount_sales, weight_unit, minimum_weight, weight_increment, minimum_amount, weight_precision, created_at;

-- name: DeleteProduct :exec
DELETE FROM products WHERE id = $1;

-- name: SetProductStock :one
UPDATE products
SET stock = GREATEST(0, $2), created_at = created_at
WHERE id = $1
RETURNING id::text, store_id::text, global_id, name, description, category, category_icon, price, cost, stock, image, brand, format, "group", detail, weighted_sale_enabled, allow_weight_sales, allow_amount_sales, weight_unit, minimum_weight, weight_increment, minimum_amount, weight_precision, created_at;

-- name: AdjustProductStock :one
UPDATE products
SET stock = GREATEST(0, stock + $2), created_at = created_at
WHERE id = $1
RETURNING id::text, store_id::text, global_id, name, description, category, category_icon, price, cost, stock, image, brand, format, "group", detail, weighted_sale_enabled, allow_weight_sales, allow_amount_sales, weight_unit, minimum_weight, weight_increment, minimum_amount, weight_precision, created_at;

-- name: DecreaseProductStock :exec
UPDATE products SET stock = stock - $2
WHERE id = $1 AND store_id = $3 AND stock >= $2;

-- name: ListSalesByStore :many
SELECT id::text, store_id::text, items, total, method, customer, date, COALESCE(customer_id::text, '') AS customer_id, delivery_address, status, order_type
FROM sales
WHERE store_id = $1
ORDER BY date DESC;

-- name: CreateSale :one
INSERT INTO sales (store_id, items, total, method, customer, date, customer_id, delivery_address, status, order_type)
VALUES ($1,$2::jsonb,$3,$4,$5,$6,NULLIF($7, '')::uuid,$8,$9,$10)
RETURNING id::text, store_id::text, items, total, method, customer, date, COALESCE(customer_id::text, '') AS customer_id, delivery_address, status, order_type;

-- name: ListStoreCreditsByStore :many
SELECT id::text, store_id::text, customer, amount, note, date, status, type
FROM store_credits
WHERE store_id = $1
ORDER BY date DESC;

-- name: CreateStoreCredit :one
INSERT INTO store_credits (store_id, customer, amount, note, status, type, date)
VALUES ($1,$2,$3,$4,$5,$6,$7)
RETURNING id::text, store_id::text, customer, amount, note, date, status, type;

-- name: RecordStoreCreditPayment :one
UPDATE store_credits
SET status='paid'
WHERE id=$1
RETURNING id::text, store_id::text, customer, amount, note, date, status, type;

-- name: ListCustomers :many
SELECT id::text, name, national_id, birth_date, gender, whatsapp, whatsapp_display, profile_picture_url, country_code, dial_code, pin_hash, province, province_code, municipality, municipality_code, district_code, neighborhood_id, sector, street, street_number, address_reference, lat, lng, store_credit, registered_at
FROM customers
ORDER BY registered_at;

-- name: GetCustomer :one
SELECT id::text, name, national_id, birth_date, gender, whatsapp, whatsapp_display, profile_picture_url, country_code, dial_code, pin_hash, province, province_code, municipality, municipality_code, district_code, neighborhood_id, sector, street, street_number, address_reference, lat, lng, store_credit, registered_at
FROM customers
WHERE id = $1;

-- name: CreateCustomer :one
INSERT INTO customers (name, national_id, birth_date, gender, whatsapp, whatsapp_display, profile_picture_url, country_code, dial_code, pin_hash, province, province_code, municipality, municipality_code, district_code, neighborhood_id, sector, street, street_number, address_reference, lat, lng, store_credit)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb)
RETURNING id::text, name, national_id, birth_date, gender, whatsapp, whatsapp_display, profile_picture_url, country_code, dial_code, pin_hash, province, province_code, municipality, municipality_code, district_code, neighborhood_id, sector, street, street_number, address_reference, lat, lng, store_credit, registered_at;

-- name: DeleteCustomer :exec
DELETE FROM customers WHERE id = $1;

-- name: ListBankAccounts :many
SELECT id::text, bank, type, number, holder, active, created_at
FROM bank_accounts
ORDER BY created_at;

-- name: GetBankAccount :one
SELECT id::text, bank, type, number, holder, active, created_at
FROM bank_accounts
WHERE id = $1;

-- name: CreateBankAccount :one
INSERT INTO bank_accounts (bank, type, number, holder, active)
VALUES ($1,$2,$3,$4,$5)
RETURNING id::text, bank, type, number, holder, active, created_at;

-- name: DeleteBankAccount :exec
DELETE FROM bank_accounts WHERE id = $1;

-- name: ListCashHistoryByStore :many
SELECT id::text, store_id::text, opening, closing, summary, created_at
FROM cash_history
WHERE store_id = $1
ORDER BY created_at DESC;

-- name: CreateCashHistory :one
INSERT INTO cash_history (store_id, opening, closing, summary)
VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb)
RETURNING id::text, store_id::text, opening, closing, summary, created_at;
