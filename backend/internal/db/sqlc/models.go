package sqlc

import (
	"database/sql"
	"encoding/json"
	"time"
)

type Store struct {
	ID                string          `json:"id"`
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
	Latitude          sql.NullFloat64 `json:"-"`
	Longitude         sql.NullFloat64 `json:"-"`
	LocationAccuracy  sql.NullFloat64 `json:"-"`
	LocationSource    string          `json:"location_source"`
	LocationUpdatedAt sql.NullTime    `json:"-"`
	CreatedAt         time.Time       `json:"created_at"`
}

func nullableFloatValue(value sql.NullFloat64) any {
	if !value.Valid {
		return nil
	}
	return value.Float64
}

func nullableTimeValue(value sql.NullTime) any {
	if !value.Valid {
		return nil
	}
	return value.Time
}

func (store Store) MarshalJSON() ([]byte, error) {
	type storeAlias Store
	return json.Marshal(struct {
		storeAlias
		Latitude           any  `json:"latitude"`
		Longitude          any  `json:"longitude"`
		LocationAccuracy   any  `json:"location_accuracy"`
		LocationUpdatedAt  any  `json:"location_updated_at"`
		LocationConfigured bool `json:"location_configured"`
	}{
		storeAlias:         storeAlias(store),
		Latitude:           nullableFloatValue(store.Latitude),
		Longitude:          nullableFloatValue(store.Longitude),
		LocationAccuracy:   nullableFloatValue(store.LocationAccuracy),
		LocationUpdatedAt:  nullableTimeValue(store.LocationUpdatedAt),
		LocationConfigured: store.Latitude.Valid && store.Longitude.Valid,
	})
}

type Product struct {
	ID                  string    `json:"id"`
	StoreID             string    `json:"store_id"`
	GlobalID            string    `json:"global_id"`
	Barcode             string    `json:"barcode"`
	Name                string    `json:"name"`
	Description         string    `json:"description"`
	Category            string    `json:"category"`
	CategoryIcon        string    `json:"category_icon"`
	Price               float64   `json:"price"`
	Cost                float64   `json:"cost"`
	Stock               float64   `json:"stock"`
	Image               string    `json:"image"`
	Brand               string    `json:"brand"`
	Format              string    `json:"format"`
	Group               string    `json:"group"`
	Detail              string    `json:"detail"`
	WeightedSaleEnabled bool      `json:"weighted_sale_enabled"`
	AllowWeightSales    bool      `json:"allow_weight_sales"`
	AllowAmountSales    bool      `json:"allow_amount_sales"`
	WeightUnit          string    `json:"weight_unit"`
	MinimumWeight       float64   `json:"minimum_weight"`
	WeightIncrement     float64   `json:"weight_increment"`
	MinimumAmount       float64   `json:"minimum_amount"`
	WeightPrecision     int       `json:"weight_precision"`
	TrackBatches        bool      `json:"track_batches"`
	ReorderPoint        float64   `json:"reorder_point"`
	ReorderTarget       float64   `json:"reorder_target"`
	SafetyStock         float64   `json:"safety_stock"`
	LeadTimeDays        int       `json:"lead_time_days"`
	PreferredSupplierID string    `json:"preferred_supplier_id"`
	CreatedAt           time.Time `json:"created_at"`
}

type Sale struct {
	ID              string          `json:"id"`
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

type StoreCredit struct {
	ID              string     `json:"id"`
	StoreID         string     `json:"store_id"`
	Customer        string     `json:"customer"`
	Amount          float64    `json:"amount"`
	Note            string     `json:"note"`
	Date            time.Time  `json:"date"`
	Status          string     `json:"status"`
	Type            string     `json:"type"`
	CustomerID      string     `json:"customer_id"`
	DueDate         string     `json:"due_date"`
	PaidAmount      float64    `json:"paid_amount"`
	RemainingAmount float64    `json:"remaining_amount"`
	ReferenceType   string     `json:"reference_type"`
	ReferenceID     string     `json:"reference_id"`
	ReversedAt      *time.Time `json:"reversed_at,omitempty"`
	CreatedBy       string     `json:"created_by"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

type Customer struct {
	ID                string          `json:"id"`
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
	RegisteredAt      time.Time       `json:"registered_at"`
}

type BankAccount struct {
	ID        string    `json:"id"`
	Bank      string    `json:"bank"`
	Type      string    `json:"type"`
	Number    string    `json:"number"`
	Holder    string    `json:"holder"`
	Active    bool      `json:"active"`
	CreatedAt time.Time `json:"created_at"`
}

type CashHistory struct {
	ID        string          `json:"id"`
	StoreID   string          `json:"store_id"`
	Opening   json.RawMessage `json:"opening"`
	Closing   json.RawMessage `json:"closing"`
	Summary   json.RawMessage `json:"summary"`
	CreatedAt time.Time       `json:"created_at"`
}
