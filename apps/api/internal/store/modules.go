package store

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type Banner struct {
	ID, Title, DesktopURL, MobileURL, VideoURL, LinkURL string
	Position                                            int
	Active                                              bool
}

func (s *Store) Banners(ctx context.Context, tenantID string) ([]Banner, error) {
	rows, err := s.DB.Query(ctx, `SELECT id::text,coalesce(title,''),coalesce(desktop_url,''),coalesce(mobile_url,''),coalesce(video_url,''),coalesce(link_url,''),position,active FROM banners WHERE tenant_id=$1 ORDER BY position,title`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Banner
	for rows.Next() {
		var x Banner
		if err := rows.Scan(&x.ID, &x.Title, &x.DesktopURL, &x.MobileURL, &x.VideoURL, &x.LinkURL, &x.Position, &x.Active); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}
func (s *Store) CreateBanner(ctx context.Context, tenantID string, b Banner) (Banner, error) {
	ent, entErr := s.Entitlements(ctx, tenantID)
	if entErr == nil && !ent.Banners {
		return b, errors.New("los banners no están incluidos en tu plan")
	}
	err := s.DB.QueryRow(ctx, `INSERT INTO banners(tenant_id,title,desktop_url,mobile_url,video_url,link_url,position,active) VALUES($1,$2,$3,$4,$5,$6,$7,true) RETURNING id::text,coalesce(title,''),coalesce(desktop_url,''),coalesce(mobile_url,''),coalesce(video_url,''),coalesce(link_url,''),position,active`, tenantID, b.Title, b.DesktopURL, b.MobileURL, b.VideoURL, b.LinkURL, b.Position).Scan(&b.ID, &b.Title, &b.DesktopURL, &b.MobileURL, &b.VideoURL, &b.LinkURL, &b.Position, &b.Active)
	return b, err
}
func (s *Store) DeleteBanner(ctx context.Context, tenantID, id string) error {
	tag, err := s.DB.Exec(ctx, `DELETE FROM banners WHERE tenant_id=$1 AND id=$2`, tenantID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("banner no encontrado")
	}
	return nil
}

type CouponRow struct {
	ID, Name, Description, Code, Type string
	Percent, Fixed, MaxDiscount       float64
	Quantity                          int
	ExpiresAt                         string
	Active                            bool
}

func (s *Store) Coupons(ctx context.Context, tenantID string) ([]CouponRow, error) {
	rows, err := s.DB.Query(ctx, `SELECT id::text,name,coalesce(description,''),code,discount_type,percent_amount,fixed_amount,max_discount,quantity,coalesce(to_char(expires_at AT TIME ZONE 'America/Santo_Domingo','YYYY-MM-DD'),''),active FROM coupons WHERE tenant_id=$1 ORDER BY id DESC`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CouponRow
	for rows.Next() {
		var x CouponRow
		if err := rows.Scan(&x.ID, &x.Name, &x.Description, &x.Code, &x.Type, &x.Percent, &x.Fixed, &x.MaxDiscount, &x.Quantity, &x.ExpiresAt, &x.Active); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}
func (s *Store) CreateCoupon(ctx context.Context, tenantID string, c CouponRow) (CouponRow, error) {
	var exp *time.Time
	if strings.TrimSpace(c.ExpiresAt) != "" {
		if t, err := time.Parse("2006-01-02", c.ExpiresAt); err == nil {
			exp = &t
		}
	}
	err := s.DB.QueryRow(ctx, `INSERT INTO coupons(tenant_id,name,description,code,discount_type,percent_amount,fixed_amount,max_discount,quantity,expires_at,active) VALUES($1,$2,$3,upper($4),$5,$6,$7,$8,$9,$10,true) RETURNING id::text,name,coalesce(description,''),code,discount_type,percent_amount,fixed_amount,max_discount,quantity,coalesce(to_char(expires_at,'YYYY-MM-DD'),''),active`, tenantID, c.Name, c.Description, c.Code, c.Type, c.Percent, c.Fixed, c.MaxDiscount, c.Quantity, exp).Scan(&c.ID, &c.Name, &c.Description, &c.Code, &c.Type, &c.Percent, &c.Fixed, &c.MaxDiscount, &c.Quantity, &c.ExpiresAt, &c.Active)
	return c, err
}
func (s *Store) DeleteCoupon(ctx context.Context, tenantID, id string) error {
	_, err := s.DB.Exec(ctx, `DELETE FROM coupons WHERE tenant_id=$1 AND id=$2`, tenantID, id)
	return err
}

type DeliveryZone struct {
	ID, Name, GeoGeofenceID, GeoCategory, ServiceType string
	Fee                                               float64
	Polygon, GeoProperties, GeoGeometry               any
	Priority                                          int
	Active                                            bool
}

func (s *Store) DeliveryZones(ctx context.Context, tenantID string) ([]DeliveryZone, error) {
	rows, err := s.DB.Query(ctx, `SELECT id::text,name,fee,polygon_geojson,coalesce(geo_geofence_id,''),coalesce(geo_category,''),service_type,geo_properties,geo_geometry,priority,active FROM delivery_zones WHERE tenant_id=$1 ORDER BY priority,name`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DeliveryZone
	for rows.Next() {
		var x DeliveryZone
		var polygonRaw, propsRaw, geometryRaw []byte
		if err := rows.Scan(&x.ID, &x.Name, &x.Fee, &polygonRaw, &x.GeoGeofenceID, &x.GeoCategory, &x.ServiceType, &propsRaw, &geometryRaw, &x.Priority, &x.Active); err != nil {
			return nil, err
		}
		if len(polygonRaw) > 0 {
			_ = json.Unmarshal(polygonRaw, &x.Polygon)
		}
		if len(propsRaw) > 0 {
			_ = json.Unmarshal(propsRaw, &x.GeoProperties)
		}
		if len(geometryRaw) > 0 {
			_ = json.Unmarshal(geometryRaw, &x.GeoGeometry)
		}
		out = append(out, x)
	}
	return out, rows.Err()
}
func (s *Store) CreateDeliveryZone(ctx context.Context, tenantID string, z DeliveryZone) (DeliveryZone, error) {
	raw, _ := json.Marshal(z.Polygon)
	if z.ServiceType == "" {
		z.ServiceType = "delivery"
	}
	if z.Priority == 0 {
		z.Priority = 100
	}
	err := s.DB.QueryRow(ctx, `INSERT INTO delivery_zones(tenant_id,name,fee,polygon_geojson,service_type,priority,active) VALUES($1,$2,$3,$4,$5,$6,true) RETURNING id::text,name,fee,service_type,priority,active`, tenantID, z.Name, z.Fee, raw, z.ServiceType, z.Priority).Scan(&z.ID, &z.Name, &z.Fee, &z.ServiceType, &z.Priority, &z.Active)
	return z, err
}
func (s *Store) DeleteDeliveryZone(ctx context.Context, tenantID, id string) error {
	_, err := s.DB.Exec(ctx, `DELETE FROM delivery_zones WHERE tenant_id=$1 AND id=$2`, tenantID, id)
	return err
}

type OpeningHour struct {
	Weekday           int
	OpensAt, ClosesAt string
	Closed            bool
}

func (s *Store) OpeningHours(ctx context.Context, tenantID string) ([]OpeningHour, error) {
	rows, err := s.DB.Query(ctx, `SELECT weekday,coalesce(to_char(opens_at,'HH24:MI'),''),coalesce(to_char(closes_at,'HH24:MI'),''),closed FROM opening_hours WHERE tenant_id=$1 ORDER BY weekday`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []OpeningHour
	for rows.Next() {
		var x OpeningHour
		if err := rows.Scan(&x.Weekday, &x.OpensAt, &x.ClosesAt, &x.Closed); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}
func (s *Store) SaveOpeningHours(ctx context.Context, tenantID string, hours []OpeningHour) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for _, h := range hours {
		var opens, closes any = nil, nil
		if h.OpensAt != "" {
			opens = h.OpensAt
		}
		if h.ClosesAt != "" {
			closes = h.ClosesAt
		}
		_, err = tx.Exec(ctx, `INSERT INTO opening_hours(tenant_id,weekday,opens_at,closes_at,closed) VALUES($1,$2,$3::time,$4::time,$5) ON CONFLICT(tenant_id,weekday) DO UPDATE SET opens_at=excluded.opens_at,closes_at=excluded.closes_at,closed=excluded.closed`, tenantID, h.Weekday, opens, closes, h.Closed)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

type TableRow struct {
	ID, Name string
	Number   int
	Active   bool
}

func (s *Store) Tables(ctx context.Context, tenantID string) ([]TableRow, error) {
	rows, err := s.DB.Query(ctx, `SELECT id::text,coalesce(name,''),number,active FROM service_tables WHERE tenant_id=$1 ORDER BY number`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TableRow
	for rows.Next() {
		var x TableRow
		if err := rows.Scan(&x.ID, &x.Name, &x.Number, &x.Active); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}
func (s *Store) PublicTables(ctx context.Context, tenantID string) ([]TableRow, error) {
	rows, err := s.DB.Query(ctx, `SELECT id::text,coalesce(name,''),number,active FROM service_tables WHERE tenant_id=$1 AND active=true ORDER BY number`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TableRow
	for rows.Next() {
		var x TableRow
		if err := rows.Scan(&x.ID, &x.Name, &x.Number, &x.Active); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

func (s *Store) CreateTable(ctx context.Context, tenantID string, t TableRow) (TableRow, error) {
	err := s.DB.QueryRow(ctx, `INSERT INTO service_tables(tenant_id,number,name,active) VALUES($1,$2,$3,true) RETURNING id::text,coalesce(name,''),number,active`, tenantID, t.Number, t.Name).Scan(&t.ID, &t.Name, &t.Number, &t.Active)
	return t, err
}
func (s *Store) DeleteTable(ctx context.Context, tenantID, id string) error {
	_, err := s.DB.Exec(ctx, `DELETE FROM service_tables WHERE tenant_id=$1 AND id=$2`, tenantID, id)
	return err
}

type TenantSettings struct {
	ID, Name, Slug, Description, LogoURL, CoverURL, Accent, WhatsApp, Email, Instagram, Facebook, Youtube, Address, Reference, BankTransferInfo, PaymentLinkURL         string
	DeliveryLabel, PickupLabel, TableLabel, OtherLabel                                                                                                                  string
	ProvinceID, MunicipalityID, Sector                                                                                                                                  string
	GeoProvinceCode, GeoCityID, GeoNeighborhoodID, GeoID, GeoAddressLabel, GeoAddressSource                                                                             string
	Latitude, Longitude, MinimumOrder, DefaultDeliveryFee                                                                                                               float64
	DeliveryEnabled, PickupEnabled, TableEnabled, OtherEnabled, IsOpen, MarketplaceEnabled, CashEnabled, CardOnDeliveryEnabled, BankTransferEnabled, PaymentLinkEnabled bool
}

func (s *Store) Settings(ctx context.Context, tenantID string) (TenantSettings, error) {
	var x TenantSettings
	err := s.DB.QueryRow(ctx, `SELECT id::text,name,slug,coalesce(description,''),coalesce(logo_url,''),coalesce(cover_url,''),accent_color,coalesce(whatsapp,''),coalesce(email,''),coalesce(instagram,''),coalesce(facebook,''),coalesce(youtube,''),coalesce(address_line,''),coalesce(address_reference,''),coalesce(province_id::text,''),coalesce(municipality_id::text,''),coalesce(sector,''),coalesce(geo_province_code,''),coalesce(geo_city_id,''),coalesce(geo_neighborhood_id,''),coalesce(geo_id,''),coalesce(geo_address_label,''),coalesce(geo_address_source,''),coalesce(latitude::float8,0),coalesce(longitude::float8,0),coalesce(bank_transfer_info,''),coalesce(payment_link_url,''),delivery_label,pickup_label,table_label,other_label,minimum_order,default_delivery_fee,delivery_enabled,pickup_enabled,table_enabled,other_enabled,is_open,marketplace_enabled,cash_enabled,card_on_delivery_enabled,bank_transfer_enabled,payment_link_enabled FROM tenants WHERE id=$1`, tenantID).Scan(&x.ID, &x.Name, &x.Slug, &x.Description, &x.LogoURL, &x.CoverURL, &x.Accent, &x.WhatsApp, &x.Email, &x.Instagram, &x.Facebook, &x.Youtube, &x.Address, &x.Reference, &x.ProvinceID, &x.MunicipalityID, &x.Sector, &x.GeoProvinceCode, &x.GeoCityID, &x.GeoNeighborhoodID, &x.GeoID, &x.GeoAddressLabel, &x.GeoAddressSource, &x.Latitude, &x.Longitude, &x.BankTransferInfo, &x.PaymentLinkURL, &x.DeliveryLabel, &x.PickupLabel, &x.TableLabel, &x.OtherLabel, &x.MinimumOrder, &x.DefaultDeliveryFee, &x.DeliveryEnabled, &x.PickupEnabled, &x.TableEnabled, &x.OtherEnabled, &x.IsOpen, &x.MarketplaceEnabled, &x.CashEnabled, &x.CardOnDeliveryEnabled, &x.BankTransferEnabled, &x.PaymentLinkEnabled)
	return x, err
}
func (s *Store) UpdateSettings(ctx context.Context, tenantID string, x TenantSettings) (TenantSettings, error) {
	if ent, entErr := s.Entitlements(ctx, tenantID); entErr == nil && !ent.Marketplace {
		x.MarketplaceEnabled = false
	}
	_, err := s.DB.Exec(ctx, `UPDATE tenants SET name=$2,description=$3,logo_url=nullif($4,''),cover_url=nullif($5,''),accent_color=$6,whatsapp=$7,email=$8,instagram=$9,facebook=$10,youtube=$11,address_line=$12,address_reference=$13,province_id=nullif($14,'')::uuid,municipality_id=nullif($15,'')::uuid,sector=$16,bank_transfer_info=$17,payment_link_url=$18,delivery_label=$19,pickup_label=$20,table_label=$21,other_label=$22,minimum_order=$23,default_delivery_fee=$24,delivery_enabled=$25,pickup_enabled=$26,table_enabled=$27,other_enabled=$28,is_open=$29,marketplace_enabled=$30,cash_enabled=$31,card_on_delivery_enabled=$32,bank_transfer_enabled=$33,payment_link_enabled=$34,geo_province_code=nullif($35,''),geo_city_id=nullif($36,''),geo_neighborhood_id=nullif($37,''),geo_id=nullif($38,''),geo_address_label=nullif($39,''),geo_address_source=nullif($40,''),latitude=nullif($41,0),longitude=nullif($42,0),updated_at=now() WHERE id=$1`, tenantID, x.Name, x.Description, x.LogoURL, x.CoverURL, x.Accent, x.WhatsApp, x.Email, x.Instagram, x.Facebook, x.Youtube, x.Address, x.Reference, x.ProvinceID, x.MunicipalityID, x.Sector, x.BankTransferInfo, x.PaymentLinkURL, x.DeliveryLabel, x.PickupLabel, x.TableLabel, x.OtherLabel, x.MinimumOrder, x.DefaultDeliveryFee, x.DeliveryEnabled, x.PickupEnabled, x.TableEnabled, x.OtherEnabled, x.IsOpen, x.MarketplaceEnabled, x.CashEnabled, x.CardOnDeliveryEnabled, x.BankTransferEnabled, x.PaymentLinkEnabled, x.GeoProvinceCode, x.GeoCityID, x.GeoNeighborhoodID, x.GeoID, x.GeoAddressLabel, x.GeoAddressSource, x.Latitude, x.Longitude)
	if err != nil {
		return x, err
	}
	return s.Settings(ctx, tenantID)
}

type SubscriptionInfo struct {
	Plan, Description, Status, ExpiresAt                 string
	MonthlyPrice                                         float64
	ProductLimit                                         int
	Marketplace, Variations, Banners, WhatsAppAutomation bool
}

func (s *Store) Subscription(ctx context.Context, tenantID string) (SubscriptionInfo, error) {
	var x SubscriptionInfo
	err := s.DB.QueryRow(ctx, `SELECT p.name,coalesce(p.description,''),su.status,coalesce(to_char(su.expires_at,'DD/MM/YYYY'),'Sin vencimiento'),p.monthly_price,coalesce(p.product_limit,0),p.marketplace_enabled,p.variations_enabled,p.banners_enabled,p.whatsapp_automation_enabled FROM subscriptions su JOIN plans p ON p.id=su.plan_id WHERE su.tenant_id=$1 ORDER BY su.created_at DESC LIMIT 1`, tenantID).Scan(&x.Plan, &x.Description, &x.Status, &x.ExpiresAt, &x.MonthlyPrice, &x.ProductLimit, &x.Marketplace, &x.Variations, &x.Banners, &x.WhatsAppAutomation)
	return x, err
}

type PlanPublic struct {
	ID, Name, Description                                          string
	MonthlyPrice                                                   float64
	ProductLimit                                                   int
	Marketplace, Variations, Banners, WhatsAppAutomation, Featured bool
}

func (s *Store) PublicPlans(ctx context.Context) ([]PlanPublic, error) {
	rows, err := s.DB.Query(ctx, `SELECT id::text,name,coalesce(description,''),monthly_price,coalesce(product_limit,0),marketplace_enabled,variations_enabled,banners_enabled,whatsapp_automation_enabled,featured FROM plans WHERE active=true AND visible=true ORDER BY monthly_price`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PlanPublic
	for rows.Next() {
		var x PlanPublic
		if err := rows.Scan(&x.ID, &x.Name, &x.Description, &x.MonthlyPrice, &x.ProductLimit, &x.Marketplace, &x.Variations, &x.Banners, &x.WhatsAppAutomation, &x.Featured); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

type Marketplace struct{ ID, Name, Slug, Description, CoverURL, Accent string }
type MarketplaceTenant struct{ ID, Name, Slug, Description, LogoURL, Accent, WhatsApp string }

func (s *Store) Marketplace(ctx context.Context, slug string) (Marketplace, []MarketplaceTenant, error) {
	var m Marketplace
	var municipalityID, geoCityID string
	err := s.DB.QueryRow(ctx, `SELECT id::text,name,slug,coalesce(description,''),coalesce(cover_url,''),accent_color,coalesce(municipality_id::text,''),coalesce(geo_city_id,'') FROM marketplaces WHERE slug=$1 AND active=true`, slug).Scan(&m.ID, &m.Name, &m.Slug, &m.Description, &m.CoverURL, &m.Accent, &municipalityID, &geoCityID)
	if err != nil {
		return m, nil, err
	}
	q := `SELECT id::text,name,slug,coalesce(description,''),coalesce(logo_url,''),accent_color,coalesce(whatsapp,'') FROM tenants WHERE active=true AND marketplace_enabled=true`
	args := []any{}
	if geoCityID != "" {
		q += " AND geo_city_id=$1"
		args = append(args, geoCityID)
	} else if municipalityID != "" {
		q += " AND municipality_id=$1"
		args = append(args, municipalityID)
	}
	q += " ORDER BY name"
	rows, err := s.DB.Query(ctx, q, args...)
	if err != nil {
		return m, nil, err
	}
	defer rows.Close()
	var tenants []MarketplaceTenant
	for rows.Next() {
		var t MarketplaceTenant
		if err := rows.Scan(&t.ID, &t.Name, &t.Slug, &t.Description, &t.LogoURL, &t.Accent, &t.WhatsApp); err != nil {
			return m, nil, err
		}
		tenants = append(tenants, t)
	}
	return m, tenants, rows.Err()
}

type RegisterInput struct {
	Name, Slug, OwnerName, OwnerCedula, Email, Password, WhatsApp, PlanID, ProvinceID, MunicipalityID, Sector, VoucherCode string
	LegalSubjectType, RNC                                                                                                  string
	GeoProvinceCode, GeoCityID, GeoNeighborhoodID, GeoID, GeoAddressLabel, GeoAddressSource                                string
	Address, AddressReference, GeoProvinceName, GeoCityName, GeoNeighborhoodName                                           string
	Latitude, Longitude                                                                                                    float64
}

func (s *Store) RegisterTenant(ctx context.Context, in RegisterInput, passwordHash string, person VerifiedPerson, company *VerifiedCompany) (string, error) {
	if len(in.Slug) < 3 {
		return "", errors.New("el subdominio debe tener al menos 3 caracteres")
	}
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	var planID, affiliateID, voucherID string
	if in.PlanID != "" {
		planID = in.PlanID
	} else {
		if err = tx.QueryRow(ctx, `SELECT id::text FROM plans WHERE active=true AND visible=true ORDER BY monthly_price LIMIT 1`).Scan(&planID); err != nil {
			return "", err
		}
	}
	if strings.TrimSpace(in.VoucherCode) != "" {
		var voucherPlan string
		err = tx.QueryRow(ctx, `SELECT id::text,coalesce(plan_id::text,''),coalesce(affiliate_id::text,'') FROM vouchers WHERE upper(code)=upper($1) AND active=true AND used_at IS NULL FOR UPDATE`, in.VoucherCode).Scan(&voucherID, &voucherPlan, &affiliateID)
		if err != nil {
			return "", errors.New("voucher inválido o ya utilizado")
		}
		if voucherPlan != "" {
			planID = voucherPlan
		}
	}
	var province, municipality, affiliate any = nil, nil, nil
	if in.ProvinceID != "" {
		province = in.ProvinceID
	}
	if in.MunicipalityID != "" {
		municipality = in.MunicipalityID
	}
	if affiliateID != "" {
		affiliate = affiliateID
	}
	personID, err := s.UpsertIdentityPerson(ctx, tx, person)
	if err != nil {
		return "", err
	}
	legalType := strings.TrimSpace(in.LegalSubjectType)
	if legalType == "" {
		legalType = "persona"
	}
	var companyID any = nil
	legalName := person.FullName
	tradeName := in.Name
	if legalType == "empresa" {
		if company == nil {
			return "", errors.New("el RNC del negocio debe estar verificado")
		}
		id, upErr := s.UpsertIdentityCompany(ctx, tx, *company)
		if upErr != nil {
			return "", upErr
		}
		companyID = id
		legalName = company.LegalName
		if strings.TrimSpace(company.TradeName) != "" {
			tradeName = company.TradeName
		}
	}
	var tenantID, userID string
	err = tx.QueryRow(ctx, `INSERT INTO tenants(name,slug,whatsapp,email,accent_color,province_id,municipality_id,sector,address_line,address_reference,latitude,longitude,geo_province_code,geo_city_id,geo_neighborhood_id,geo_id,geo_address_label,geo_address_source,affiliate_id,legal_subject_type,identity_company_id,legal_name,trade_name,identity_verified_at) VALUES($1,lower($2),$3,$4,'#ff5400',$5,$6,$7,$8,$9,nullif($10,0),nullif($11,0),nullif($12,''),nullif($13,''),nullif($14,''),nullif($15,''),nullif($16,''),nullif($17,''),$18,$19,$20,$21,$22,now()) RETURNING id::text`, in.Name, in.Slug, in.WhatsApp, in.Email, province, municipality, firstNonEmptyStore(in.GeoNeighborhoodName, in.Sector), in.Address, in.AddressReference, in.Latitude, in.Longitude, in.GeoProvinceCode, in.GeoCityID, in.GeoNeighborhoodID, in.GeoID, in.GeoAddressLabel, in.GeoAddressSource, affiliate, legalType, companyID, legalName, tradeName).Scan(&tenantID)
	if err != nil {
		return "", err
	}
	err = tx.QueryRow(ctx, `INSERT INTO users(tenant_id,identity_person_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5,'tenant_admin') RETURNING id::text`, tenantID, personID, person.FullName, in.Email, passwordHash).Scan(&userID)
	if err != nil {
		return "", err
	}
	if _, err = tx.Exec(ctx, `UPDATE tenants SET owner_user_id=$2 WHERE id=$1`, tenantID, userID); err != nil {
		return "", err
	}
	var subscriptionID string
	err = tx.QueryRow(ctx, `INSERT INTO subscriptions(tenant_id,plan_id,affiliate_id,price,status,starts_at,expires_at,voucher_code) SELECT $1,id,$3,monthly_price,'active',current_date,current_date+interval '30 days',nullif($4,'') FROM plans WHERE id=$2 AND active=true RETURNING id::text`, tenantID, planID, affiliate, in.VoucherCode).Scan(&subscriptionID)
	if err != nil {
		return "", err
	}
	if voucherID != "" {
		if _, err = tx.Exec(ctx, `UPDATE vouchers SET subscription_id=$2,used_at=now(),active=false WHERE id=$1`, voucherID, subscriptionID); err != nil {
			return "", err
		}
	}
	return tenantID, tx.Commit(ctx)
}

func firstNonEmptyStore(v, fallback string) string {
	if strings.TrimSpace(v) != "" {
		return v
	}
	return fallback
}

type ReportDay struct {
	Day    string
	Orders int
	Sales  float64
}

func (s *Store) Report(ctx context.Context, tenantID string) ([]ReportDay, error) {
	rows, err := s.DB.Query(ctx, `SELECT to_char(d::date,'DD/MM'),count(o.id),coalesce(sum(CASE WHEN o.status='completed' THEN o.total ELSE 0 END),0) FROM generate_series(current_date-interval '13 days',current_date,interval '1 day') d LEFT JOIN orders o ON o.tenant_id=$1 AND o.created_at::date=d::date GROUP BY d ORDER BY d`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ReportDay
	for rows.Next() {
		var x ReportDay
		if err := rows.Scan(&x.Day, &x.Orders, &x.Sales); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

type CustomerRow struct {
	ID, Name, WhatsApp, Email, DocumentMasked, BirthDate, Sex string
	IdentityVerified                                          bool
	TotalOrders                                               int
	Points                                                    float64
	CreatedAt                                                 string
}

func (s *Store) Customers(ctx context.Context, tenantID string) ([]CustomerRow, error) {
	rows, err := s.DB.Query(ctx, `SELECT c.id::text,c.name,c.whatsapp,coalesce(c.email,''),coalesce(ip.document_masked,''),coalesce(to_char(ip.birth_date,'DD/MM/YYYY'),''),coalesce(ip.sex,''),c.identity_person_id IS NOT NULL,c.total_orders,c.points,to_char(c.created_at AT TIME ZONE 'America/Santo_Domingo','DD/MM/YYYY') FROM customers c LEFT JOIN identity_people ip ON ip.id=c.identity_person_id WHERE c.tenant_id=$1 ORDER BY c.created_at DESC LIMIT 500`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CustomerRow
	for rows.Next() {
		var x CustomerRow
		if err := rows.Scan(&x.ID, &x.Name, &x.WhatsApp, &x.Email, &x.DocumentMasked, &x.BirthDate, &x.Sex, &x.IdentityVerified, &x.TotalOrders, &x.Points, &x.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

func (s *Store) UpsertCustomerFromOrder(ctx context.Context, tx pgx.Tx, tenantID, whatsapp, email, province, municipality, sector, address, reference string, person VerifiedPerson, geoAddress GeoAddressInput) (string, error) {
	if strings.TrimSpace(whatsapp) == "" {
		return "", nil
	}
	personID, err := s.UpsertIdentityPerson(ctx, tx, person)
	if err != nil {
		return "", err
	}
	var id string
	err = tx.QueryRow(ctx, `SELECT id::text FROM customers WHERE tenant_id=$1 AND identity_person_id=$2`, tenantID, personID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		var existingID, existingPerson string
		waErr := tx.QueryRow(ctx, `SELECT id::text,coalesce(identity_person_id::text,'') FROM customers WHERE tenant_id=$1 AND whatsapp=$2`, tenantID, whatsapp).Scan(&existingID, &existingPerson)
		if waErr == nil {
			if existingPerson != "" && existingPerson != personID {
				return "", errors.New("este WhatsApp ya está asociado a otra identidad en el negocio")
			}
			id = existingID
			_, err = tx.Exec(ctx, `UPDATE customers SET identity_person_id=$3,identity_verified_at=now(),name=$4,email=nullif($5,''),province=$6,municipality=$7,sector=$8,address_line=$9,reference=$10,total_orders=total_orders+1,active=true WHERE tenant_id=$1 AND id=$2`, tenantID, id, personID, person.FullName, email, province, municipality, sector, address, reference)
		} else if errors.Is(waErr, pgx.ErrNoRows) {
			err = tx.QueryRow(ctx, `INSERT INTO customers(tenant_id,identity_person_id,identity_verified_at,name,whatsapp,email,province,municipality,sector,address_line,reference,total_orders) VALUES($1,$2,now(),$3,$4,nullif($5,''),$6,$7,$8,$9,$10,1) RETURNING id::text`, tenantID, personID, person.FullName, whatsapp, email, province, municipality, sector, address, reference).Scan(&id)
		} else {
			err = waErr
		}
	} else if err == nil {
		_, err = tx.Exec(ctx, `UPDATE customers SET name=$3,whatsapp=$4,email=nullif($5,''),province=$6,municipality=$7,sector=$8,address_line=$9,reference=$10,identity_verified_at=now(),total_orders=total_orders+1,active=true WHERE tenant_id=$1 AND id=$2`, tenantID, id, person.FullName, whatsapp, email, province, municipality, sector, address, reference)
	}
	if err == nil && id != "" && geoAddress.ProvinceCode != "" {
		err = s.UpsertCustomerGeoAddress(ctx, tx, id, geoAddress)
	}
	return id, err
}

type MarketplaceProduct struct {
	ID, TenantName, TenantSlug, Name, Description, ImageURL string
	Price, PromoPrice                                       float64
	OnSale                                                  bool
}

func (s *Store) MarketplaceProducts(ctx context.Context, slug string) ([]MarketplaceProduct, error) {
	var municipalityID, geoCityID string
	if err := s.DB.QueryRow(ctx, `SELECT coalesce(municipality_id::text,''),coalesce(geo_city_id,'') FROM marketplaces WHERE slug=$1 AND active=true`, slug).Scan(&municipalityID, &geoCityID); err != nil {
		return nil, err
	}
	q := `SELECT p.id::text,t.name,t.slug,p.name,coalesce(p.description,''),coalesce((SELECT url FROM product_images i WHERE i.product_id=p.id ORDER BY position LIMIT 1),''),p.price,coalesce(p.promo_price,0),p.on_sale FROM products p JOIN tenants t ON t.id=p.tenant_id WHERE p.active=true AND p.visible=true AND t.active=true AND t.marketplace_enabled=true`
	args := []any{}
	if geoCityID != "" {
		q += " AND t.geo_city_id=$1"
		args = append(args, geoCityID)
	} else if municipalityID != "" {
		q += " AND t.municipality_id=$1"
		args = append(args, municipalityID)
	}
	q += " ORDER BY p.featured DESC,p.updated_at DESC LIMIT 120"
	rows, err := s.DB.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []MarketplaceProduct
	for rows.Next() {
		var x MarketplaceProduct
		if err := rows.Scan(&x.ID, &x.TenantName, &x.TenantSlug, &x.Name, &x.Description, &x.ImageURL, &x.Price, &x.PromoPrice, &x.OnSale); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}
