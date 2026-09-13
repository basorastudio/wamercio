package sqlc

import (
	"context"
	"encoding/json"
	"time"
)

const listStores = `-- name: ListStores :many
SELECT id::text, name, slogan, address, province_code, province, municipality_code, municipality, district_code, neighborhood_id, neighborhood, street, street_number, whatsapp, whatsapp_display, country_code, dial_code, emoji, logo_url, color, active, store_status, payment_settings, service_hours, delivery_scope, latitude, longitude, location_accuracy, location_source, location_updated_at, created_at
FROM stores
ORDER BY created_at
LIMIT 1
`

func (q *Queries) ListStores(ctx context.Context) ([]Store, error) {
	rows, err := q.db.Query(ctx, listStores)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Store{}
	for rows.Next() {
		var item Store
		if err := rows.Scan(&item.ID, &item.Name, &item.Slogan, &item.Address, &item.ProvinceCode, &item.Province, &item.MunicipalityCode, &item.Municipality, &item.DistrictCode, &item.NeighborhoodID, &item.Neighborhood, &item.Street, &item.StreetNumber, &item.Whatsapp, &item.WhatsappDisplay, &item.CountryCode, &item.DialCode, &item.Emoji, &item.LogoURL, &item.Color, &item.Active, &item.StoreStatus, &item.PaymentSettings, &item.ServiceHours, &item.DeliveryScope, &item.Latitude, &item.Longitude, &item.LocationAccuracy, &item.LocationSource, &item.LocationUpdatedAt, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

const getStore = `-- name: GetStore :one
SELECT id::text, name, slogan, address, province_code, province, municipality_code, municipality, district_code, neighborhood_id, neighborhood, street, street_number, whatsapp, whatsapp_display, country_code, dial_code, emoji, logo_url, color, active, store_status, payment_settings, service_hours, delivery_scope, latitude, longitude, location_accuracy, location_source, location_updated_at, created_at
FROM stores
WHERE id = $1
`

func (q *Queries) GetStore(ctx context.Context, id string) (Store, error) {
	row := q.db.QueryRow(ctx, getStore, id)
	var item Store
	err := row.Scan(&item.ID, &item.Name, &item.Slogan, &item.Address, &item.ProvinceCode, &item.Province, &item.MunicipalityCode, &item.Municipality, &item.DistrictCode, &item.NeighborhoodID, &item.Neighborhood, &item.Street, &item.StreetNumber, &item.Whatsapp, &item.WhatsappDisplay, &item.CountryCode, &item.DialCode, &item.Emoji, &item.LogoURL, &item.Color, &item.Active, &item.StoreStatus, &item.PaymentSettings, &item.ServiceHours, &item.DeliveryScope, &item.Latitude, &item.Longitude, &item.LocationAccuracy, &item.LocationSource, &item.LocationUpdatedAt, &item.CreatedAt)
	return item, err
}

type CreateStoreParams struct {
	Name              string          `json:"name"`
	Slogan            string          `json:"slogan"`
	Address           string          `json:"address"`
	ProvinceCode      string          `json:"province_code"`
	Province          string          `json:"province"`
	MunicipalityCode  string          `json:"municipality_code"`
	Municipality      string          `json:"municipality"`
	DistrictCode      string          `json:"district_code"`
	NeighborhoodID    string          `json:"neighborhood_id"`
	Neighborhood      string          `json:"neighborhood"`
	Street            string          `json:"street"`
	StreetNumber      string          `json:"street_number"`
	Whatsapp          string          `json:"whatsapp"`
	WhatsappDisplay   string          `json:"whatsapp_display"`
	CountryCode       string          `json:"country_code"`
	DialCode          string          `json:"dial_code"`
	Emoji             string          `json:"emoji"`
	LogoURL           string          `json:"logo_url"`
	Color             string          `json:"color"`
	Active            bool            `json:"active"`
	StoreStatus       string          `json:"store_status"`
	PaymentSettings   json.RawMessage `json:"payment_settings"`
	ServiceHours      json.RawMessage `json:"service_hours"`
	DeliveryScope     string          `json:"delivery_scope"`
	Latitude          any             `json:"latitude"`
	Longitude         any             `json:"longitude"`
	LocationAccuracy  any             `json:"location_accuracy"`
	LocationSource    string          `json:"location_source"`
	LocationUpdatedAt any             `json:"location_updated_at"`
}

const createStore = `-- name: CreateStore :one
INSERT INTO stores (name, slogan, address, province_code, province, municipality_code, municipality, district_code, neighborhood_id, neighborhood, street, street_number, whatsapp, whatsapp_display, country_code, dial_code, emoji, logo_url, color, active, store_status, payment_settings, service_hours, delivery_scope, latitude, longitude, location_accuracy, location_source, location_updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23::jsonb,$24,$25,$26,$27,$28,$29)
RETURNING id::text, name, slogan, address, province_code, province, municipality_code, municipality, district_code, neighborhood_id, neighborhood, street, street_number, whatsapp, whatsapp_display, country_code, dial_code, emoji, logo_url, color, active, store_status, payment_settings, service_hours, delivery_scope, latitude, longitude, location_accuracy, location_source, location_updated_at, created_at
`

func (q *Queries) CreateStore(ctx context.Context, arg CreateStoreParams) (Store, error) {
	row := q.db.QueryRow(ctx, createStore, arg.Name, arg.Slogan, arg.Address, arg.ProvinceCode, arg.Province, arg.MunicipalityCode, arg.Municipality, arg.DistrictCode, arg.NeighborhoodID, arg.Neighborhood, arg.Street, arg.StreetNumber, arg.Whatsapp, arg.WhatsappDisplay, arg.CountryCode, arg.DialCode, arg.Emoji, arg.LogoURL, arg.Color, arg.Active, arg.StoreStatus, string(arg.PaymentSettings), string(arg.ServiceHours), arg.DeliveryScope, arg.Latitude, arg.Longitude, arg.LocationAccuracy, arg.LocationSource, arg.LocationUpdatedAt)
	var item Store
	err := row.Scan(&item.ID, &item.Name, &item.Slogan, &item.Address, &item.ProvinceCode, &item.Province, &item.MunicipalityCode, &item.Municipality, &item.DistrictCode, &item.NeighborhoodID, &item.Neighborhood, &item.Street, &item.StreetNumber, &item.Whatsapp, &item.WhatsappDisplay, &item.CountryCode, &item.DialCode, &item.Emoji, &item.LogoURL, &item.Color, &item.Active, &item.StoreStatus, &item.PaymentSettings, &item.ServiceHours, &item.DeliveryScope, &item.Latitude, &item.Longitude, &item.LocationAccuracy, &item.LocationSource, &item.LocationUpdatedAt, &item.CreatedAt)
	return item, err
}

const deleteStore = `-- name: DeleteStore :exec
DELETE FROM stores WHERE id = $1
`

func (q *Queries) DeleteStore(ctx context.Context, id string) error {
	_, err := q.db.Exec(ctx, deleteStore, id)
	return err
}

const listProductsByStore = `-- name: ListProductsByStore :many
SELECT id::text, store_id::text, global_id, name, description, category, category_icon, price, cost, stock, image, brand, format, "group", detail, weighted_sale_enabled, allow_weight_sales, allow_amount_sales, weight_unit, minimum_weight, weight_increment, minimum_amount, weight_precision, created_at
FROM products
WHERE store_id = $1
ORDER BY created_at
`

func (q *Queries) ListProductsByStore(ctx context.Context, storeID string) ([]Product, error) {
	rows, err := q.db.Query(ctx, listProductsByStore, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Product{}
	for rows.Next() {
		var item Product
		if err := rows.Scan(&item.ID, &item.StoreID, &item.GlobalID, &item.Name, &item.Description, &item.Category, &item.CategoryIcon, &item.Price, &item.Cost, &item.Stock, &item.Image, &item.Brand, &item.Format, &item.Group, &item.Detail, &item.WeightedSaleEnabled, &item.AllowWeightSales, &item.AllowAmountSales, &item.WeightUnit, &item.MinimumWeight, &item.WeightIncrement, &item.MinimumAmount, &item.WeightPrecision, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

const getProduct = `-- name: GetProduct :one
SELECT id::text, store_id::text, global_id, name, description, category, category_icon, price, cost, stock, image, brand, format, "group", detail, weighted_sale_enabled, allow_weight_sales, allow_amount_sales, weight_unit, minimum_weight, weight_increment, minimum_amount, weight_precision, created_at
FROM products
WHERE id = $1
`

func (q *Queries) GetProduct(ctx context.Context, id string) (Product, error) {
	row := q.db.QueryRow(ctx, getProduct, id)
	var item Product
	err := row.Scan(&item.ID, &item.StoreID, &item.GlobalID, &item.Name, &item.Description, &item.Category, &item.CategoryIcon, &item.Price, &item.Cost, &item.Stock, &item.Image, &item.Brand, &item.Format, &item.Group, &item.Detail, &item.WeightedSaleEnabled, &item.AllowWeightSales, &item.AllowAmountSales, &item.WeightUnit, &item.MinimumWeight, &item.WeightIncrement, &item.MinimumAmount, &item.WeightPrecision, &item.CreatedAt)
	return item, err
}

type CreateProductParams struct {
	StoreID             string  `json:"store_id"`
	GlobalID            string  `json:"global_id"`
	Name                string  `json:"name"`
	Description         string  `json:"description"`
	Category            string  `json:"category"`
	CategoryIcon        string  `json:"category_icon"`
	Price               float64 `json:"price"`
	Cost                float64 `json:"cost"`
	Stock               float64 `json:"stock"`
	Image               string  `json:"image"`
	Brand               string  `json:"brand"`
	Format              string  `json:"format"`
	Group               string  `json:"group"`
	Detail              string  `json:"detail"`
	WeightedSaleEnabled bool    `json:"weighted_sale_enabled"`
	AllowWeightSales    bool    `json:"allow_weight_sales"`
	AllowAmountSales    bool    `json:"allow_amount_sales"`
	WeightUnit          string  `json:"weight_unit"`
	MinimumWeight       float64 `json:"minimum_weight"`
	WeightIncrement     float64 `json:"weight_increment"`
	MinimumAmount       float64 `json:"minimum_amount"`
	WeightPrecision     int     `json:"weight_precision"`
}

const createProduct = `-- name: CreateProduct :one
INSERT INTO products (store_id, global_id, name, description, category, category_icon, price, cost, stock, image, brand, format, "group", detail, weighted_sale_enabled, allow_weight_sales, allow_amount_sales, weight_unit, minimum_weight, weight_increment, minimum_amount, weight_precision)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
RETURNING id::text, store_id::text, global_id, name, description, category, category_icon, price, cost, stock, image, brand, format, "group", detail, weighted_sale_enabled, allow_weight_sales, allow_amount_sales, weight_unit, minimum_weight, weight_increment, minimum_amount, weight_precision, created_at
`

func (q *Queries) CreateProduct(ctx context.Context, arg CreateProductParams) (Product, error) {
	row := q.db.QueryRow(ctx, createProduct, arg.StoreID, arg.GlobalID, arg.Name, arg.Description, arg.Category, arg.CategoryIcon, arg.Price, arg.Cost, arg.Stock, arg.Image, arg.Brand, arg.Format, arg.Group, arg.Detail, arg.WeightedSaleEnabled, arg.AllowWeightSales, arg.AllowAmountSales, arg.WeightUnit, arg.MinimumWeight, arg.WeightIncrement, arg.MinimumAmount, arg.WeightPrecision)
	var item Product
	err := row.Scan(&item.ID, &item.StoreID, &item.GlobalID, &item.Name, &item.Description, &item.Category, &item.CategoryIcon, &item.Price, &item.Cost, &item.Stock, &item.Image, &item.Brand, &item.Format, &item.Group, &item.Detail, &item.WeightedSaleEnabled, &item.AllowWeightSales, &item.AllowAmountSales, &item.WeightUnit, &item.MinimumWeight, &item.WeightIncrement, &item.MinimumAmount, &item.WeightPrecision, &item.CreatedAt)
	return item, err
}

const deleteProduct = `-- name: DeleteProduct :exec
DELETE FROM products WHERE id = $1
`

func (q *Queries) DeleteProduct(ctx context.Context, id string) error {
	_, err := q.db.Exec(ctx, deleteProduct, id)
	return err
}

type SetProductStockParams struct {
	ID    string  `json:"id"`
	Stock float64 `json:"stock"`
}

const setProductStock = `-- name: SetProductStock :one
UPDATE products
SET stock = GREATEST(0, $2), created_at = created_at
WHERE id = $1
RETURNING id::text, store_id::text, global_id, name, description, category, category_icon, price, cost, stock, image, brand, format, "group", detail, weighted_sale_enabled, allow_weight_sales, allow_amount_sales, weight_unit, minimum_weight, weight_increment, minimum_amount, weight_precision, created_at
`

func (q *Queries) SetProductStock(ctx context.Context, arg SetProductStockParams) (Product, error) {
	row := q.db.QueryRow(ctx, setProductStock, arg.ID, arg.Stock)
	var item Product
	err := row.Scan(&item.ID, &item.StoreID, &item.GlobalID, &item.Name, &item.Description, &item.Category, &item.CategoryIcon, &item.Price, &item.Cost, &item.Stock, &item.Image, &item.Brand, &item.Format, &item.Group, &item.Detail, &item.WeightedSaleEnabled, &item.AllowWeightSales, &item.AllowAmountSales, &item.WeightUnit, &item.MinimumWeight, &item.WeightIncrement, &item.MinimumAmount, &item.WeightPrecision, &item.CreatedAt)
	return item, err
}

type AdjustProductStockParams struct {
	ID    string  `json:"id"`
	Delta float64 `json:"delta"`
}

const adjustProductStock = `-- name: AdjustProductStock :one
UPDATE products
SET stock = GREATEST(0, stock + $2), created_at = created_at
WHERE id = $1
RETURNING id::text, store_id::text, global_id, name, description, category, category_icon, price, cost, stock, image, brand, format, "group", detail, weighted_sale_enabled, allow_weight_sales, allow_amount_sales, weight_unit, minimum_weight, weight_increment, minimum_amount, weight_precision, created_at
`

func (q *Queries) AdjustProductStock(ctx context.Context, arg AdjustProductStockParams) (Product, error) {
	row := q.db.QueryRow(ctx, adjustProductStock, arg.ID, arg.Delta)
	var item Product
	err := row.Scan(&item.ID, &item.StoreID, &item.GlobalID, &item.Name, &item.Description, &item.Category, &item.CategoryIcon, &item.Price, &item.Cost, &item.Stock, &item.Image, &item.Brand, &item.Format, &item.Group, &item.Detail, &item.WeightedSaleEnabled, &item.AllowWeightSales, &item.AllowAmountSales, &item.WeightUnit, &item.MinimumWeight, &item.WeightIncrement, &item.MinimumAmount, &item.WeightPrecision, &item.CreatedAt)
	return item, err
}

type DecreaseProductStockParams struct {
	ID       string  `json:"id"`
	Quantity float64 `json:"quantity"`
	StoreID  string  `json:"store_id"`
}

const decreaseProductStock = `-- name: DecreaseProductStock :exec
UPDATE products SET stock = stock - $2
WHERE id = $1 AND store_id = $3 AND stock >= $2
`

func (q *Queries) DecreaseProductStock(ctx context.Context, arg DecreaseProductStockParams) error {
	_, err := q.db.Exec(ctx, decreaseProductStock, arg.ID, arg.Quantity, arg.StoreID)
	return err
}

const listSalesByStore = `-- name: ListSalesByStore :many
SELECT id::text, store_id::text, items, total, method, customer, date, COALESCE(customer_id::text, '') AS customer_id, delivery_address, status, order_type
FROM sales
WHERE store_id = $1
ORDER BY date DESC
`

func (q *Queries) ListSalesByStore(ctx context.Context, storeID string) ([]Sale, error) {
	rows, err := q.db.Query(ctx, listSalesByStore, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Sale{}
	for rows.Next() {
		var item Sale
		if err := rows.Scan(&item.ID, &item.StoreID, &item.Items, &item.Total, &item.Method, &item.Customer, &item.Date, &item.CustomerID, &item.DeliveryAddress, &item.Status, &item.OrderType); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

type CreateSaleParams struct {
	StoreID         string          `json:"store_id"`
	Items           json.RawMessage `json:"items"`
	Total           float64         `json:"total"`
	Method          string          `json:"method"`
	Customer        string          `json:"customer"`
	Date            time.Time       `json:"date"`
	CustomerID      string          `json:"customer_id"`
	DeliveryAddress string          `json:"delivery_address"`
	Status          string          `json:"status"`
	OrderType       string          `json:"order_type"`
}

const createSale = `-- name: CreateSale :one
INSERT INTO sales (store_id, items, total, method, customer, date, customer_id, delivery_address, status, order_type)
VALUES ($1,$2::jsonb,$3,$4,$5,$6,NULLIF($7, '')::uuid,$8,$9,$10)
RETURNING id::text, store_id::text, items, total, method, customer, date, COALESCE(customer_id::text, '') AS customer_id, delivery_address, status, order_type
`

func (q *Queries) CreateSale(ctx context.Context, arg CreateSaleParams) (Sale, error) {
	row := q.db.QueryRow(ctx, createSale, arg.StoreID, string(arg.Items), arg.Total, arg.Method, arg.Customer, arg.Date, arg.CustomerID, arg.DeliveryAddress, arg.Status, arg.OrderType)
	var item Sale
	err := row.Scan(&item.ID, &item.StoreID, &item.Items, &item.Total, &item.Method, &item.Customer, &item.Date, &item.CustomerID, &item.DeliveryAddress, &item.Status, &item.OrderType)
	return item, err
}

const listStoreCreditsByStore = `-- name: ListStoreCreditsByStore :many
SELECT id::text, store_id::text, customer, amount, note, date, status, type
FROM store_credits
WHERE store_id = $1
ORDER BY date DESC
`

func (q *Queries) ListStoreCreditsByStore(ctx context.Context, storeID string) ([]StoreCredit, error) {
	rows, err := q.db.Query(ctx, listStoreCreditsByStore, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []StoreCredit{}
	for rows.Next() {
		var item StoreCredit
		if err := rows.Scan(&item.ID, &item.StoreID, &item.Customer, &item.Amount, &item.Note, &item.Date, &item.Status, &item.Type); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

type CreateStoreCreditParams struct {
	StoreID  string    `json:"store_id"`
	Customer string    `json:"customer"`
	Amount   float64   `json:"amount"`
	Note     string    `json:"note"`
	Status   string    `json:"status"`
	Type     string    `json:"type"`
	Date     time.Time `json:"date"`
}

const createStoreCredit = `-- name: CreateStoreCredit :one
INSERT INTO store_credits (store_id, customer, amount, note, status, type, date)
VALUES ($1,$2,$3,$4,$5,$6,$7)
RETURNING id::text, store_id::text, customer, amount, note, date, status, type
`

func (q *Queries) CreateStoreCredit(ctx context.Context, arg CreateStoreCreditParams) (StoreCredit, error) {
	row := q.db.QueryRow(ctx, createStoreCredit, arg.StoreID, arg.Customer, arg.Amount, arg.Note, arg.Status, arg.Type, arg.Date)
	var item StoreCredit
	err := row.Scan(&item.ID, &item.StoreID, &item.Customer, &item.Amount, &item.Note, &item.Date, &item.Status, &item.Type)
	return item, err
}

const recordStoreCreditPayment = `-- name: RecordStoreCreditPayment :one
UPDATE store_credits
SET status='paid'
WHERE id=$1
RETURNING id::text, store_id::text, customer, amount, note, date, status, type
`

func (q *Queries) RecordStoreCreditPayment(ctx context.Context, id string) (StoreCredit, error) {
	row := q.db.QueryRow(ctx, recordStoreCreditPayment, id)
	var item StoreCredit
	err := row.Scan(&item.ID, &item.StoreID, &item.Customer, &item.Amount, &item.Note, &item.Date, &item.Status, &item.Type)
	return item, err
}

const listCustomers = `-- name: ListCustomers :many
SELECT id::text, name, national_id, birth_date, gender, whatsapp, whatsapp_display, profile_picture_url, country_code, dial_code, pin_hash, province, province_code, municipality, municipality_code, district_code, neighborhood_id, sector, street, street_number, address_reference, lat, lng, store_credit, registered_at
FROM customers
ORDER BY registered_at
`

func (q *Queries) ListCustomers(ctx context.Context) ([]Customer, error) {
	rows, err := q.db.Query(ctx, listCustomers)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Customer{}
	for rows.Next() {
		var item Customer
		if err := rows.Scan(&item.ID, &item.Name, &item.NationalID, &item.BirthDate, &item.Gender, &item.Whatsapp, &item.WhatsappDisplay, &item.ProfilePictureURL, &item.CountryCode, &item.DialCode, &item.PinHash, &item.Province, &item.ProvinceCode, &item.Municipality, &item.MunicipalityCode, &item.DistrictCode, &item.NeighborhoodID, &item.Sector, &item.Street, &item.StreetNumber, &item.AddressReference, &item.Lat, &item.Lng, &item.StoreCredit, &item.RegisteredAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

const getCustomer = `-- name: GetCustomer :one
SELECT id::text, name, national_id, birth_date, gender, whatsapp, whatsapp_display, profile_picture_url, country_code, dial_code, pin_hash, province, province_code, municipality, municipality_code, district_code, neighborhood_id, sector, street, street_number, address_reference, lat, lng, store_credit, registered_at
FROM customers
WHERE id = $1
`

func (q *Queries) GetCustomer(ctx context.Context, id string) (Customer, error) {
	row := q.db.QueryRow(ctx, getCustomer, id)
	var item Customer
	err := row.Scan(&item.ID, &item.Name, &item.NationalID, &item.BirthDate, &item.Gender, &item.Whatsapp, &item.WhatsappDisplay, &item.ProfilePictureURL, &item.CountryCode, &item.DialCode, &item.PinHash, &item.Province, &item.ProvinceCode, &item.Municipality, &item.MunicipalityCode, &item.DistrictCode, &item.NeighborhoodID, &item.Sector, &item.Street, &item.StreetNumber, &item.AddressReference, &item.Lat, &item.Lng, &item.StoreCredit, &item.RegisteredAt)
	return item, err
}

type CreateCustomerParams struct {
	Name              string          `json:"name"`
	NationalID        string          `json:"national_id"`
	BirthDate         string          `json:"birth_date"`
	Gender            string          `json:"gender"`
	Whatsapp          string          `json:"whatsapp"`
	WhatsappDisplay   string          `json:"whatsapp_display"`
	ProfilePictureURL string          `json:"profile_picture_url"`
	CountryCode       string          `json:"country_code"`
	DialCode          string          `json:"dial_code"`
	PinHash           string          `json:"-"`
	Province          string          `json:"province"`
	ProvinceCode      string          `json:"province_code"`
	Municipality      string          `json:"municipality"`
	MunicipalityCode  string          `json:"municipality_code"`
	DistrictCode      string          `json:"district_code"`
	NeighborhoodID    string          `json:"neighborhood_id"`
	Sector            string          `json:"sector"`
	Street            string          `json:"street"`
	StreetNumber      string          `json:"street_number"`
	AddressReference  string          `json:"address_reference"`
	Lat               string          `json:"lat"`
	Lng               string          `json:"lng"`
	StoreCredit       json.RawMessage `json:"store_credit"`
}

const createCustomer = `-- name: CreateCustomer :one
INSERT INTO customers (name, national_id, birth_date, gender, whatsapp, whatsapp_display, profile_picture_url, country_code, dial_code, pin_hash, province, province_code, municipality, municipality_code, district_code, neighborhood_id, sector, street, street_number, address_reference, lat, lng, store_credit)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb)
RETURNING id::text, name, national_id, birth_date, gender, whatsapp, whatsapp_display, profile_picture_url, country_code, dial_code, pin_hash, province, province_code, municipality, municipality_code, district_code, neighborhood_id, sector, street, street_number, address_reference, lat, lng, store_credit, registered_at
`

func (q *Queries) CreateCustomer(ctx context.Context, arg CreateCustomerParams) (Customer, error) {
	row := q.db.QueryRow(ctx, createCustomer, arg.Name, arg.NationalID, arg.BirthDate, arg.Gender, arg.Whatsapp, arg.WhatsappDisplay, arg.ProfilePictureURL, arg.CountryCode, arg.DialCode, arg.PinHash, arg.Province, arg.ProvinceCode, arg.Municipality, arg.MunicipalityCode, arg.DistrictCode, arg.NeighborhoodID, arg.Sector, arg.Street, arg.StreetNumber, arg.AddressReference, arg.Lat, arg.Lng, string(arg.StoreCredit))
	var item Customer
	err := row.Scan(&item.ID, &item.Name, &item.NationalID, &item.BirthDate, &item.Gender, &item.Whatsapp, &item.WhatsappDisplay, &item.ProfilePictureURL, &item.CountryCode, &item.DialCode, &item.PinHash, &item.Province, &item.ProvinceCode, &item.Municipality, &item.MunicipalityCode, &item.DistrictCode, &item.NeighborhoodID, &item.Sector, &item.Street, &item.StreetNumber, &item.AddressReference, &item.Lat, &item.Lng, &item.StoreCredit, &item.RegisteredAt)
	return item, err
}

const deleteCustomer = `-- name: DeleteCustomer :exec
DELETE FROM customers WHERE id = $1
`

func (q *Queries) DeleteCustomer(ctx context.Context, id string) error {
	_, err := q.db.Exec(ctx, deleteCustomer, id)
	return err
}

const listBankAccounts = `-- name: ListBankAccounts :many
SELECT id::text, bank, type, number, holder, active, created_at
FROM bank_accounts
ORDER BY created_at
`

func (q *Queries) ListBankAccounts(ctx context.Context) ([]BankAccount, error) {
	rows, err := q.db.Query(ctx, listBankAccounts)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []BankAccount{}
	for rows.Next() {
		var item BankAccount
		if err := rows.Scan(&item.ID, &item.Bank, &item.Type, &item.Number, &item.Holder, &item.Active, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

const getBankAccount = `-- name: GetBankAccount :one
SELECT id::text, bank, type, number, holder, active, created_at
FROM bank_accounts
WHERE id = $1
`

func (q *Queries) GetBankAccount(ctx context.Context, id string) (BankAccount, error) {
	row := q.db.QueryRow(ctx, getBankAccount, id)
	var item BankAccount
	err := row.Scan(&item.ID, &item.Bank, &item.Type, &item.Number, &item.Holder, &item.Active, &item.CreatedAt)
	return item, err
}

type CreateBankAccountParams struct {
	Bank   string `json:"bank"`
	Type   string `json:"type"`
	Number string `json:"number"`
	Holder string `json:"holder"`
	Active bool   `json:"active"`
}

const createBankAccount = `-- name: CreateBankAccount :one
INSERT INTO bank_accounts (bank, type, number, holder, active)
VALUES ($1,$2,$3,$4,$5)
RETURNING id::text, bank, type, number, holder, active, created_at
`

func (q *Queries) CreateBankAccount(ctx context.Context, arg CreateBankAccountParams) (BankAccount, error) {
	row := q.db.QueryRow(ctx, createBankAccount, arg.Bank, arg.Type, arg.Number, arg.Holder, arg.Active)
	var item BankAccount
	err := row.Scan(&item.ID, &item.Bank, &item.Type, &item.Number, &item.Holder, &item.Active, &item.CreatedAt)
	return item, err
}

const deleteBankAccount = `-- name: DeleteBankAccount :exec
DELETE FROM bank_accounts WHERE id = $1
`

func (q *Queries) DeleteBankAccount(ctx context.Context, id string) error {
	_, err := q.db.Exec(ctx, deleteBankAccount, id)
	return err
}

const listCashHistoryByStore = `-- name: ListCashHistoryByStore :many
SELECT id::text, store_id::text, opening, closing, summary, created_at
FROM cash_history
WHERE store_id = $1
ORDER BY created_at DESC
`

func (q *Queries) ListCashHistoryByStore(ctx context.Context, storeID string) ([]CashHistory, error) {
	rows, err := q.db.Query(ctx, listCashHistoryByStore, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []CashHistory{}
	for rows.Next() {
		var item CashHistory
		if err := rows.Scan(&item.ID, &item.StoreID, &item.Opening, &item.Closing, &item.Summary, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

type CreateCashHistoryParams struct {
	StoreID string          `json:"store_id"`
	Opening json.RawMessage `json:"opening"`
	Closing json.RawMessage `json:"closing"`
	Summary json.RawMessage `json:"summary"`
}

const createCashHistory = `-- name: CreateCashHistory :one
INSERT INTO cash_history (store_id, opening, closing, summary)
VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb)
RETURNING id::text, store_id::text, opening, closing, summary, created_at
`

func (q *Queries) CreateCashHistory(ctx context.Context, arg CreateCashHistoryParams) (CashHistory, error) {
	row := q.db.QueryRow(ctx, createCashHistory, arg.StoreID, string(arg.Opening), string(arg.Closing), string(arg.Summary))
	var item CashHistory
	err := row.Scan(&item.ID, &item.StoreID, &item.Opening, &item.Closing, &item.Summary, &item.CreatedAt)
	return item, err
}
