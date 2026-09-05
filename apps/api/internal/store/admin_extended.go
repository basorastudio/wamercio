package store

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type AdminPlan struct {
	ID, Name, Description                                                                                       string
	MonthlyPrice                                                                                                float64
	ProductLimit                                                                                                int
	MarketplaceEnabled, VariationsEnabled, BannersEnabled, WhatsAppAutomationEnabled, Featured, Visible, Active bool
}

func (s *Store) AdminPlans(ctx context.Context) ([]AdminPlan, error) {
	rows, err := s.DB.Query(ctx, `SELECT id::text,name,coalesce(description,''),monthly_price,coalesce(product_limit,0),marketplace_enabled,variations_enabled,banners_enabled,whatsapp_automation_enabled,featured,visible,active FROM plans ORDER BY monthly_price,name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminPlan{}
	for rows.Next() {
		var x AdminPlan
		if err := rows.Scan(&x.ID, &x.Name, &x.Description, &x.MonthlyPrice, &x.ProductLimit, &x.MarketplaceEnabled, &x.VariationsEnabled, &x.BannersEnabled, &x.WhatsAppAutomationEnabled, &x.Featured, &x.Visible, &x.Active); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}
func (s *Store) SaveAdminPlan(ctx context.Context, id string, x AdminPlan) (AdminPlan, error) {
	if strings.TrimSpace(x.Name) == "" {
		return x, errors.New("nombre requerido")
	}
	if id == "" {
		err := s.DB.QueryRow(ctx, `INSERT INTO plans(name,description,monthly_price,product_limit,marketplace_enabled,variations_enabled,banners_enabled,whatsapp_automation_enabled,featured,visible,active) VALUES($1,$2,$3,nullif($4,0),$5,$6,$7,$8,$9,$10,$11) RETURNING id::text`, x.Name, x.Description, x.MonthlyPrice, x.ProductLimit, x.MarketplaceEnabled, x.VariationsEnabled, x.BannersEnabled, x.WhatsAppAutomationEnabled, x.Featured, x.Visible, x.Active).Scan(&x.ID)
		return x, err
	}
	tag, err := s.DB.Exec(ctx, `UPDATE plans SET name=$2,description=$3,monthly_price=$4,product_limit=nullif($5,0),marketplace_enabled=$6,variations_enabled=$7,banners_enabled=$8,whatsapp_automation_enabled=$9,featured=$10,visible=$11,active=$12 WHERE id=$1`, id, x.Name, x.Description, x.MonthlyPrice, x.ProductLimit, x.MarketplaceEnabled, x.VariationsEnabled, x.BannersEnabled, x.WhatsAppAutomationEnabled, x.Featured, x.Visible, x.Active)
	if err != nil {
		return x, err
	}
	if tag.RowsAffected() == 0 {
		return x, errors.New("plan no encontrado")
	}
	x.ID = id
	return x, nil
}

type AdminUser struct {
	ID, TenantID, TenantName, AffiliateID, Name, Email, Role string
	Active                                                   bool
	CreatedAt                                                string
}

func (s *Store) AdminUsers(ctx context.Context) ([]AdminUser, error) {
	rows, err := s.DB.Query(ctx, `SELECT u.id::text,coalesce(u.tenant_id::text,''),coalesce(t.name,''),coalesce(u.affiliate_id::text,''),u.name,u.email,u.role,u.active,to_char(u.created_at AT TIME ZONE 'America/Santo_Domingo','DD/MM/YYYY HH24:MI') FROM users u LEFT JOIN tenants t ON t.id=u.tenant_id ORDER BY u.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminUser{}
	for rows.Next() {
		var x AdminUser
		if err := rows.Scan(&x.ID, &x.TenantID, &x.TenantName, &x.AffiliateID, &x.Name, &x.Email, &x.Role, &x.Active, &x.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}
func (s *Store) CreateAdminUser(ctx context.Context, x AdminUser, passwordHash string) (AdminUser, error) {
	var tenant, affiliate any = nil, nil
	if x.TenantID != "" {
		tenant = x.TenantID
	}
	if x.AffiliateID != "" {
		affiliate = x.AffiliateID
	}
	err := s.DB.QueryRow(ctx, `INSERT INTO users(tenant_id,affiliate_id,name,email,password_hash,role,active) VALUES($1,$2,$3,$4,$5,$6,true) RETURNING id::text,active`, tenant, affiliate, x.Name, strings.ToLower(strings.TrimSpace(x.Email)), passwordHash, x.Role).Scan(&x.ID, &x.Active)
	return x, err
}
func (s *Store) SetUserActive(ctx context.Context, id string, active bool) error {
	tag, err := s.DB.Exec(ctx, `UPDATE users SET active=$2 WHERE id=$1`, id, active)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("usuario no encontrado")
	}
	return nil
}

type AdminSubscription struct {
	ID, TenantID, TenantName, PlanID, PlanName, Status, StartsAt, ExpiresAt string
	Price                                                                   float64
}

func (s *Store) AdminSubscriptions(ctx context.Context) ([]AdminSubscription, error) {
	rows, err := s.DB.Query(ctx, `SELECT s.id::text,s.tenant_id::text,t.name,s.plan_id::text,p.name,s.price,s.status,to_char(s.starts_at,'YYYY-MM-DD'),coalesce(to_char(s.expires_at,'YYYY-MM-DD'),'') FROM subscriptions s JOIN tenants t ON t.id=s.tenant_id JOIN plans p ON p.id=s.plan_id ORDER BY s.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminSubscription{}
	for rows.Next() {
		var x AdminSubscription
		if err := rows.Scan(&x.ID, &x.TenantID, &x.TenantName, &x.PlanID, &x.PlanName, &x.Price, &x.Status, &x.StartsAt, &x.ExpiresAt); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}
func (s *Store) CreateSubscription(ctx context.Context, x AdminSubscription) (AdminSubscription, error) {
	var exp any = nil
	if x.ExpiresAt != "" {
		exp = x.ExpiresAt
	}
	err := s.DB.QueryRow(ctx, `INSERT INTO subscriptions(tenant_id,plan_id,price,status,starts_at,expires_at) SELECT $1,$2,CASE WHEN $3::numeric>0 THEN $3 ELSE p.monthly_price END,$4,current_date,$5::date FROM plans p WHERE p.id=$2 RETURNING id::text,price,to_char(starts_at,'YYYY-MM-DD'),coalesce(to_char(expires_at,'YYYY-MM-DD'),'')`, x.TenantID, x.PlanID, x.Price, x.Status, exp).Scan(&x.ID, &x.Price, &x.StartsAt, &x.ExpiresAt)
	return x, err
}
func (s *Store) UpdateSubscription(ctx context.Context, id, status, expires string) error {
	var exp any = nil
	if expires != "" {
		exp = expires
	}
	tag, err := s.DB.Exec(ctx, `UPDATE subscriptions SET status=$2,expires_at=$3::date WHERE id=$1`, id, status, exp)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("suscripción no encontrada")
	}
	return nil
}

type AdminVoucher struct {
	ID, Code, Description, PlanID, PlanName, AffiliateID, AffiliateName string
	Active                                                              bool
	UsedAt                                                              string
}

func (s *Store) AdminVouchers(ctx context.Context) ([]AdminVoucher, error) {
	rows, err := s.DB.Query(ctx, `SELECT v.id::text,v.code,coalesce(v.description,''),coalesce(v.plan_id::text,''),coalesce(p.name,''),coalesce(v.affiliate_id::text,''),coalesce(a.name,''),v.active,coalesce(to_char(v.used_at AT TIME ZONE 'America/Santo_Domingo','DD/MM/YYYY HH24:MI'),'') FROM vouchers v LEFT JOIN plans p ON p.id=v.plan_id LEFT JOIN affiliates a ON a.id=v.affiliate_id ORDER BY v.id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminVoucher{}
	for rows.Next() {
		var x AdminVoucher
		if err := rows.Scan(&x.ID, &x.Code, &x.Description, &x.PlanID, &x.PlanName, &x.AffiliateID, &x.AffiliateName, &x.Active, &x.UsedAt); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}
func (s *Store) CreateVoucher(ctx context.Context, x AdminVoucher) (AdminVoucher, error) {
	var plan, aff any = nil, nil
	if x.PlanID != "" {
		plan = x.PlanID
	}
	if x.AffiliateID != "" {
		aff = x.AffiliateID
	}
	err := s.DB.QueryRow(ctx, `INSERT INTO vouchers(plan_id,affiliate_id,code,description,active) VALUES($1,$2,upper($3),$4,true) RETURNING id::text,code,active`, plan, aff, x.Code, x.Description).Scan(&x.ID, &x.Code, &x.Active)
	return x, err
}
func (s *Store) DeleteVoucher(ctx context.Context, id string) error {
	_, err := s.DB.Exec(ctx, `DELETE FROM vouchers WHERE id=$1 AND used_at IS NULL`, id)
	return err
}

type AffiliateRow struct {
	ID, Name, Email, Phone string
	CommissionPercent      float64
	Active                 bool
	Tenants                int
}

func (s *Store) Affiliates(ctx context.Context) ([]AffiliateRow, error) {
	rows, err := s.DB.Query(ctx, `SELECT a.id::text,a.name,coalesce(a.email,''),coalesce(a.phone,''),a.commission_percent,a.active,count(t.id) FROM affiliates a LEFT JOIN tenants t ON t.affiliate_id=a.id GROUP BY a.id ORDER BY a.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AffiliateRow{}
	for rows.Next() {
		var x AffiliateRow
		if err := rows.Scan(&x.ID, &x.Name, &x.Email, &x.Phone, &x.CommissionPercent, &x.Active, &x.Tenants); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}
func (s *Store) SaveAffiliate(ctx context.Context, id string, x AffiliateRow) (AffiliateRow, error) {
	if id == "" {
		err := s.DB.QueryRow(ctx, `INSERT INTO affiliates(name,email,phone,commission_percent,active) VALUES($1,nullif($2,''),$3,$4,true) RETURNING id::text,active`, x.Name, x.Email, x.Phone, x.CommissionPercent).Scan(&x.ID, &x.Active)
		return x, err
	}
	tag, err := s.DB.Exec(ctx, `UPDATE affiliates SET name=$2,email=nullif($3,''),phone=$4,commission_percent=$5,active=$6 WHERE id=$1`, id, x.Name, x.Email, x.Phone, x.CommissionPercent, x.Active)
	if err != nil {
		return x, err
	}
	if tag.RowsAffected() == 0 {
		return x, errors.New("afiliado no encontrado")
	}
	x.ID = id
	return x, nil
}

type MarketplaceAdmin struct {
	ID, Name, Slug, Description, CoverURL, Accent, ProvinceID, MunicipalityID string
	GeoProvinceCode, GeoCityID                                                string
	Active                                                                    bool
}

func (s *Store) MarketplacesAdmin(ctx context.Context) ([]MarketplaceAdmin, error) {
	rows, err := s.DB.Query(ctx, `SELECT id::text,name,slug,coalesce(description,''),coalesce(cover_url,''),accent_color,coalesce(province_id::text,''),coalesce(municipality_id::text,''),coalesce(geo_province_code,''),coalesce(geo_city_id,''),active FROM marketplaces ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MarketplaceAdmin{}
	for rows.Next() {
		var x MarketplaceAdmin
		if err := rows.Scan(&x.ID, &x.Name, &x.Slug, &x.Description, &x.CoverURL, &x.Accent, &x.ProvinceID, &x.MunicipalityID, &x.GeoProvinceCode, &x.GeoCityID, &x.Active); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}
func (s *Store) SaveMarketplace(ctx context.Context, id string, x MarketplaceAdmin) (MarketplaceAdmin, error) {
	var province, mun any = nil, nil
	if x.ProvinceID != "" {
		province = x.ProvinceID
	}
	if x.MunicipalityID != "" {
		mun = x.MunicipalityID
	}
	if id == "" {
		err := s.DB.QueryRow(ctx, `INSERT INTO marketplaces(name,slug,province_id,municipality_id,description,cover_url,accent_color,geo_province_code,geo_city_id,active) VALUES($1,lower($2),$3,$4,$5,nullif($6,''),$7,nullif($8,''),nullif($9,''),true) RETURNING id::text,active`, x.Name, x.Slug, province, mun, x.Description, x.CoverURL, x.Accent, x.GeoProvinceCode, x.GeoCityID).Scan(&x.ID, &x.Active)
		return x, err
	}
	tag, err := s.DB.Exec(ctx, `UPDATE marketplaces SET name=$2,slug=lower($3),province_id=$4,municipality_id=$5,description=$6,cover_url=nullif($7,''),accent_color=$8,active=$9,geo_province_code=nullif($10,''),geo_city_id=nullif($11,'') WHERE id=$1`, id, x.Name, x.Slug, province, mun, x.Description, x.CoverURL, x.Accent, x.Active, x.GeoProvinceCode, x.GeoCityID)
	if err != nil {
		return x, err
	}
	if tag.RowsAffected() == 0 {
		return x, errors.New("marketplace no encontrado")
	}
	x.ID = id
	return x, nil
}

type GeographyItem struct{ ID, Name, Code, ProvinceID string }

func (s *Store) Provinces(ctx context.Context) ([]GeographyItem, error) {
	rows, err := s.DB.Query(ctx, `SELECT id::text,name,code,'' FROM provinces ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []GeographyItem{}
	for rows.Next() {
		var x GeographyItem
		if err := rows.Scan(&x.ID, &x.Name, &x.Code, &x.ProvinceID); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}
func (s *Store) Municipalities(ctx context.Context) ([]GeographyItem, error) {
	rows, err := s.DB.Query(ctx, `SELECT id::text,name,code,province_id::text FROM municipalities ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []GeographyItem{}
	for rows.Next() {
		var x GeographyItem
		if err := rows.Scan(&x.ID, &x.Name, &x.Code, &x.ProvinceID); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

func (s *Store) SystemSettings(ctx context.Context) (map[string]string, error) {
	rows, err := s.DB.Query(ctx, `SELECT key,value FROM system_settings ORDER BY key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		out[k] = v
	}
	return out, rows.Err()
}
func (s *Store) SaveSystemSettings(ctx context.Context, values map[string]string) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for k, v := range values {
		if _, err = tx.Exec(ctx, `INSERT INTO system_settings(key,value,updated_at) VALUES($1,$2,now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`, k, v); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

type IntegrationRow struct {
	Provider string
	Enabled  bool
	Config   map[string]any
}

func (s *Store) Integrations(ctx context.Context, tenantID string) ([]IntegrationRow, error) {
	rows, err := s.DB.Query(ctx, `SELECT provider,enabled,config_json FROM tenant_integrations WHERE tenant_id=$1 ORDER BY provider`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []IntegrationRow{}
	for rows.Next() {
		var x IntegrationRow
		var raw []byte
		if err := rows.Scan(&x.Provider, &x.Enabled, &raw); err != nil {
			return nil, err
		}
		x.Config = map[string]any{}
		_ = json.Unmarshal(raw, &x.Config)
		out = append(out, x)
	}
	return out, rows.Err()
}
func (s *Store) SaveIntegration(ctx context.Context, tenantID string, x IntegrationRow) error {
	raw, _ := json.Marshal(x.Config)
	_, err := s.DB.Exec(ctx, `INSERT INTO tenant_integrations(tenant_id,provider,enabled,config_json,updated_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(tenant_id,provider) DO UPDATE SET enabled=excluded.enabled,config_json=excluded.config_json,updated_at=now()`, tenantID, x.Provider, x.Enabled, raw)
	return err
}

type TemplateRow struct {
	Event, Channel, TemplateText string
	Active                       bool
}

func (s *Store) Templates(ctx context.Context, tenantID string) ([]TemplateRow, error) {
	rows, err := s.DB.Query(ctx, `SELECT event,channel,template_text,active FROM notification_templates WHERE tenant_id=$1 ORDER BY event,channel`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TemplateRow{}
	for rows.Next() {
		var x TemplateRow
		if err := rows.Scan(&x.Event, &x.Channel, &x.TemplateText, &x.Active); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}
func (s *Store) SaveTemplate(ctx context.Context, tenantID string, x TemplateRow) error {
	_, err := s.DB.Exec(ctx, `INSERT INTO notification_templates(tenant_id,event,channel,template_text,active) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,event,channel) DO UPDATE SET template_text=excluded.template_text,active=excluded.active`, tenantID, x.Event, x.Channel, x.TemplateText, x.Active)
	return err
}

type AffiliateSummary struct {
	AffiliateID, Name   string
	Tenants             int
	ActiveSubscriptions int
	EstimatedCommission float64
}
type AffiliateTenant struct {
	ID, Name, Slug, Plan, SubscriptionStatus string
	SubscriptionPrice, EstimatedCommission   float64
}

func (s *Store) AffiliateSummaryByUser(ctx context.Context, userID string) (AffiliateSummary, error) {
	var x AffiliateSummary
	err := s.DB.QueryRow(ctx, `SELECT a.id::text,a.name,count(DISTINCT t.id),count(DISTINCT su.id) FILTER(WHERE su.status='active'),coalesce(sum(CASE WHEN su.status='active' THEN su.price*a.commission_percent/100 ELSE 0 END),0) FROM users u JOIN affiliates a ON a.id=u.affiliate_id LEFT JOIN tenants t ON t.affiliate_id=a.id LEFT JOIN subscriptions su ON su.tenant_id=t.id WHERE u.id=$1 GROUP BY a.id`, userID).Scan(&x.AffiliateID, &x.Name, &x.Tenants, &x.ActiveSubscriptions, &x.EstimatedCommission)
	return x, err
}
func (s *Store) AffiliateTenantsByUser(ctx context.Context, userID string) ([]AffiliateTenant, error) {
	rows, err := s.DB.Query(ctx, `SELECT t.id::text,t.name,t.slug,coalesce(p.name,''),coalesce(su.status,''),coalesce(su.price,0),coalesce(su.price*a.commission_percent/100,0) FROM users u JOIN affiliates a ON a.id=u.affiliate_id JOIN tenants t ON t.affiliate_id=a.id LEFT JOIN LATERAL (SELECT * FROM subscriptions WHERE tenant_id=t.id ORDER BY created_at DESC LIMIT 1) su ON true LEFT JOIN plans p ON p.id=su.plan_id WHERE u.id=$1 ORDER BY t.name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AffiliateTenant{}
	for rows.Next() {
		var x AffiliateTenant
		if err := rows.Scan(&x.ID, &x.Name, &x.Slug, &x.Plan, &x.SubscriptionStatus, &x.SubscriptionPrice, &x.EstimatedCommission); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

type PrinterTokenRow struct {
	ID, Name  string
	Active    bool
	CreatedAt string
}

func (s *Store) PrinterTokens(ctx context.Context, tenantID string) ([]PrinterTokenRow, error) {
	rows, err := s.DB.Query(ctx, `SELECT id::text,name,active,to_char(created_at AT TIME ZONE 'America/Santo_Domingo','DD/MM/YYYY HH24:MI') FROM printer_tokens WHERE tenant_id=$1 ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PrinterTokenRow{}
	for rows.Next() {
		var x PrinterTokenRow
		if err := rows.Scan(&x.ID, &x.Name, &x.Active, &x.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}
func (s *Store) CreatePrinterToken(ctx context.Context, tenantID, name, hash string) (PrinterTokenRow, error) {
	var x PrinterTokenRow
	err := s.DB.QueryRow(ctx, `INSERT INTO printer_tokens(tenant_id,token_hash,name) VALUES($1,$2,$3) RETURNING id::text,name,active,to_char(created_at AT TIME ZONE 'America/Santo_Domingo','DD/MM/YYYY HH24:MI')`, tenantID, hash, name).Scan(&x.ID, &x.Name, &x.Active, &x.CreatedAt)
	return x, err
}
func (s *Store) PrinterTenantByHash(ctx context.Context, hash string) (string, error) {
	var id string
	err := s.DB.QueryRow(ctx, `SELECT tenant_id::text FROM printer_tokens WHERE token_hash=$1 AND active=true LIMIT 1`, hash).Scan(&id)
	return id, err
}

type PrintOrder struct {
	ID, PublicCode, CustomerName, DeliveryType, PaymentMethod, CreatedAt, WhatsAppText string
	Total                                                                              float64
}

func (s *Store) PendingPrintOrders(ctx context.Context, tenantID string) ([]PrintOrder, error) {
	rows, err := s.DB.Query(ctx, `SELECT id::text,public_code,customer_name,delivery_type,payment_method,to_char(created_at AT TIME ZONE 'America/Santo_Domingo','DD/MM/YYYY HH24:MI'),coalesce(whatsapp_text,''),total FROM orders WHERE tenant_id=$1 AND print_status='pending' ORDER BY created_at LIMIT 20`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PrintOrder{}
	for rows.Next() {
		var x PrintOrder
		if err := rows.Scan(&x.ID, &x.PublicCode, &x.CustomerName, &x.DeliveryType, &x.PaymentMethod, &x.CreatedAt, &x.WhatsAppText, &x.Total); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}
func (s *Store) MarkPrinted(ctx context.Context, tenantID, id string) error {
	tag, err := s.DB.Exec(ctx, `UPDATE orders SET print_status='printed' WHERE tenant_id=$1 AND id=$2`, tenantID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("pedido no encontrado")
	}
	return nil
}

func parseDateOrNil(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	if _, err := time.Parse("2006-01-02", s); err != nil {
		return nil
	}
	return s
}

type OrderDetailItem struct {
	ID, ProductName, Note string
	Quantity              int
	UnitPrice, Total      float64
	Options               []OrderDetailOption
}
type OrderDetailOption struct {
	Name       string
	PriceDelta float64
}
type OrderDetail struct {
	ID, PublicCode, CustomerName, WhatsApp, DeliveryType, PaymentMethod, PaymentInfo, CouponCode, Status, PaymentStatus, CreatedAt, WhatsAppText string
	DeliveryZoneName                                                                                                                             string
	Subtotal, Discount, DeliveryFee, Total, RouteDistanceKm, DeliveryLatitude, DeliveryLongitude                                                 float64
	RouteDurationSeconds                                                                                                                         int
	Address                                                                                                                                      map[string]any
	Items                                                                                                                                        []OrderDetailItem
}

func (s *Store) OrderDetail(ctx context.Context, tenantID, id string) (OrderDetail, error) {
	var x OrderDetail
	var raw []byte
	err := s.DB.QueryRow(ctx, `SELECT o.id::text,o.public_code,o.customer_name,o.whatsapp,o.delivery_type,o.payment_method,coalesce(o.payment_info,''),coalesce(o.coupon_code,''),o.status,o.payment_status,to_char(o.created_at AT TIME ZONE 'America/Santo_Domingo','DD/MM/YYYY HH24:MI'),coalesce(o.whatsapp_text,''),o.subtotal,o.discount,o.delivery_fee,o.total,o.address_json,coalesce(dz.name,''),coalesce(o.route_distance_km::float8,0),coalesce(o.route_duration_seconds,0),coalesce(o.delivery_latitude::float8,0),coalesce(o.delivery_longitude::float8,0) FROM orders o LEFT JOIN delivery_zones dz ON dz.id=o.delivery_zone_id AND dz.tenant_id=o.tenant_id WHERE o.tenant_id=$1 AND o.id=$2`, tenantID, id).Scan(&x.ID, &x.PublicCode, &x.CustomerName, &x.WhatsApp, &x.DeliveryType, &x.PaymentMethod, &x.PaymentInfo, &x.CouponCode, &x.Status, &x.PaymentStatus, &x.CreatedAt, &x.WhatsAppText, &x.Subtotal, &x.Discount, &x.DeliveryFee, &x.Total, &raw, &x.DeliveryZoneName, &x.RouteDistanceKm, &x.RouteDurationSeconds, &x.DeliveryLatitude, &x.DeliveryLongitude)
	if err != nil {
		return x, err
	}
	x.Address = map[string]any{}
	_ = json.Unmarshal(raw, &x.Address)
	rows, err := s.DB.Query(ctx, `SELECT id::text,product_name,quantity,unit_price,total,coalesce(note,'') FROM order_items WHERE order_id=$1 ORDER BY id`, id)
	if err != nil {
		return x, err
	}
	defer rows.Close()
	for rows.Next() {
		var it OrderDetailItem
		if err := rows.Scan(&it.ID, &it.ProductName, &it.Quantity, &it.UnitPrice, &it.Total, &it.Note); err != nil {
			return x, err
		}
		orows, err := s.DB.Query(ctx, `SELECT option_name,price_delta FROM order_item_options WHERE order_item_id=$1 ORDER BY id`, it.ID)
		if err != nil {
			return x, err
		}
		for orows.Next() {
			var o OrderDetailOption
			if err := orows.Scan(&o.Name, &o.PriceDelta); err != nil {
				orows.Close()
				return x, err
			}
			it.Options = append(it.Options, o)
		}
		orows.Close()
		x.Items = append(x.Items, it)
	}
	return x, rows.Err()
}

func (s *Store) UpdateCategory(ctx context.Context, tenantID, id, name string, position int, visible bool) (Category, error) {
	var x Category
	err := s.DB.QueryRow(ctx, `UPDATE categories SET name=$3,position=$4,visible=$5 WHERE tenant_id=$1 AND id=$2 RETURNING id::text,name,position`, tenantID, id, name, position, visible).Scan(&x.ID, &x.Name, &x.Position)
	return x, err
}
func (s *Store) DeleteCategory(ctx context.Context, tenantID, id string) error {
	var n int
	if err := s.DB.QueryRow(ctx, `SELECT count(*) FROM products WHERE tenant_id=$1 AND category_id=$2 AND active=true`, tenantID, id).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return errors.New("no puedes eliminar una categoría que contiene productos")
	}
	tag, err := s.DB.Exec(ctx, `DELETE FROM categories WHERE tenant_id=$1 AND id=$2`, tenantID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("categoría no encontrada")
	}
	return nil
}
