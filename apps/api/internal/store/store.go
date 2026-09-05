package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"time"
)

type Store struct{ DB *pgxpool.Pool }

func New(db *pgxpool.Pool) *Store { return &Store{DB: db} }

type User struct{ ID, Name, Email, PasswordHash, Role, TenantID string }

func (s *Store) UserByEmail(ctx context.Context, email string) (User, error) {
	var u User
	err := s.DB.QueryRow(ctx, `SELECT id::text,name,email,password_hash,role,coalesce(tenant_id::text,'') FROM users WHERE lower(email)=lower($1) AND active=true`, email).Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.TenantID)
	return u, err
}

type Tenant struct {
	ID, Name, Slug, Description, LogoURL, CoverURL, Accent, WhatsApp, Email, Instagram, Address, Province, Municipality string
	GeoAddressLabel, GeoProvinceCode, GeoCityID                                                                         string
	Latitude, Longitude                                                                                                 float64
	DeliveryLabel, PickupLabel, TableLabel, OtherLabel                                                                  string
	IsOpen                                                                                                              bool
	MinimumOrder                                                                                                        float64
	DeliveryEnabled, PickupEnabled, TableEnabled, OtherEnabled                                                          bool
	CashEnabled, CardOnDeliveryEnabled, BankTransferEnabled, PaymentLinkEnabled                                         bool
	BankTransferInfo, PaymentLinkURL                                                                                    string
}

func (s *Store) PublicTenant(ctx context.Context, slug string) (Tenant, error) {
	var t Tenant
	err := s.DB.QueryRow(ctx, `SELECT t.id::text,t.name,t.slug,coalesce(t.description,''),coalesce(t.logo_url,''),coalesce(t.cover_url,''),coalesce(t.accent_color,'#ff5400'),coalesce(t.whatsapp,''),coalesce(t.email,''),coalesce(t.instagram,''),coalesce(t.address_line,''),coalesce(p.name,''),coalesce(m.name,''),coalesce(t.geo_address_label,''),coalesce(t.geo_province_code,''),coalesce(t.geo_city_id,''),coalesce(t.latitude::float8,0),coalesce(t.longitude::float8,0),CASE WHEN oh.tenant_id IS NULL THEN t.is_open WHEN oh.closed THEN false WHEN oh.opens_at IS NULL OR oh.closes_at IS NULL THEN t.is_open WHEN oh.opens_at<=oh.closes_at THEN (now() AT TIME ZONE 'America/Santo_Domingo')::time>=oh.opens_at AND (now() AT TIME ZONE 'America/Santo_Domingo')::time<oh.closes_at ELSE (now() AT TIME ZONE 'America/Santo_Domingo')::time>=oh.opens_at OR (now() AT TIME ZONE 'America/Santo_Domingo')::time<oh.closes_at END,t.minimum_order,t.delivery_enabled,t.pickup_enabled,t.table_enabled,t.other_enabled,t.cash_enabled,t.card_on_delivery_enabled,t.bank_transfer_enabled,t.payment_link_enabled,coalesce(t.bank_transfer_info,''),coalesce(t.payment_link_url,''),t.delivery_label,t.pickup_label,t.table_label,t.other_label FROM tenants t LEFT JOIN provinces p ON p.id=t.province_id LEFT JOIN municipalities m ON m.id=t.municipality_id LEFT JOIN opening_hours oh ON oh.tenant_id=t.id AND oh.weekday=extract(dow from (now() AT TIME ZONE 'America/Santo_Domingo'))::int WHERE t.slug=$1 AND t.active=true AND EXISTS (SELECT 1 FROM subscriptions su WHERE su.tenant_id=t.id AND su.status='active' AND (su.expires_at IS NULL OR su.expires_at>=current_date))`, slug).Scan(&t.ID, &t.Name, &t.Slug, &t.Description, &t.LogoURL, &t.CoverURL, &t.Accent, &t.WhatsApp, &t.Email, &t.Instagram, &t.Address, &t.Province, &t.Municipality, &t.GeoAddressLabel, &t.GeoProvinceCode, &t.GeoCityID, &t.Latitude, &t.Longitude, &t.IsOpen, &t.MinimumOrder, &t.DeliveryEnabled, &t.PickupEnabled, &t.TableEnabled, &t.OtherEnabled, &t.CashEnabled, &t.CardOnDeliveryEnabled, &t.BankTransferEnabled, &t.PaymentLinkEnabled, &t.BankTransferInfo, &t.PaymentLinkURL, &t.DeliveryLabel, &t.PickupLabel, &t.TableLabel, &t.OtherLabel)
	return t, err
}

type Category struct {
	ID, Name string
	Position int
}

func (s *Store) Categories(ctx context.Context, tenantID string) ([]Category, error) {
	rows, err := s.DB.Query(ctx, `SELECT id::text,name,position FROM categories WHERE tenant_id=$1 AND visible=true ORDER BY position,name`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Category
	for rows.Next() {
		var x Category
		if err := rows.Scan(&x.ID, &x.Name, &x.Position); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

type Product struct {
	ID, CategoryID, Name, Description, Reference, PosCode, VideoURL, ImageURL string
	Price, PromoPrice, WeightKG, HeightCM, WidthCM, LengthCM                  float64
	Featured, OnSale, TrackStock                                              bool
	Stock                                                                     int
}

func (s *Store) Products(ctx context.Context, tenantID, categoryID, q string) ([]Product, error) {
	sql := `SELECT p.id::text,p.category_id::text,p.name,coalesce(p.description,''),coalesce(p.reference,''),coalesce(p.pos_code,''),coalesce(p.video_url,''),coalesce((SELECT url FROM product_images i WHERE i.product_id=p.id ORDER BY position LIMIT 1),''),p.price,coalesce(p.promo_price,0),coalesce(p.weight_kg,0),coalesce(p.height_cm,0),coalesce(p.width_cm,0),coalesce(p.length_cm,0),p.featured,p.on_sale,p.track_stock,p.stock FROM products p WHERE p.tenant_id=$1 AND p.visible=true AND p.active=true`
	args := []any{tenantID}
	n := 2
	if categoryID != "" {
		sql += fmt.Sprintf(" AND p.category_id=$%d", n)
		args = append(args, categoryID)
		n++
	}
	if q != "" {
		sql += fmt.Sprintf(" AND (p.name ILIKE $%d OR p.description ILIKE $%d)", n, n)
		args = append(args, "%"+q+"%")
		n++
	}
	sql += " ORDER BY p.position,p.name"
	rows, err := s.DB.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Product
	for rows.Next() {
		var x Product
		if err := rows.Scan(&x.ID, &x.CategoryID, &x.Name, &x.Description, &x.Reference, &x.PosCode, &x.VideoURL, &x.ImageURL, &x.Price, &x.PromoPrice, &x.WeightKG, &x.HeightCM, &x.WidthCM, &x.LengthCM, &x.Featured, &x.OnSale, &x.TrackStock, &x.Stock); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}
func (s *Store) Product(ctx context.Context, tenantID, id string) (Product, error) {
	var x Product
	err := s.DB.QueryRow(ctx, `SELECT p.id::text,p.category_id::text,p.name,coalesce(p.description,''),coalesce(p.reference,''),coalesce(p.pos_code,''),coalesce(p.video_url,''),coalesce((SELECT url FROM product_images i WHERE i.product_id=p.id ORDER BY position LIMIT 1),''),p.price,coalesce(p.promo_price,0),coalesce(p.weight_kg,0),coalesce(p.height_cm,0),coalesce(p.width_cm,0),coalesce(p.length_cm,0),p.featured,p.on_sale,p.track_stock,p.stock FROM products p WHERE p.tenant_id=$1 AND p.id=$2 AND p.active=true`, tenantID, id).Scan(&x.ID, &x.CategoryID, &x.Name, &x.Description, &x.Reference, &x.PosCode, &x.VideoURL, &x.ImageURL, &x.Price, &x.PromoPrice, &x.WeightKG, &x.HeightCM, &x.WidthCM, &x.LengthCM, &x.Featured, &x.OnSale, &x.TrackStock, &x.Stock)
	return x, err
}

type Coupon struct {
	Code, Type                  string
	Percent, Fixed, MaxDiscount float64
	Quantity                    int
	ExpiresAt                   *time.Time
}

func (s *Store) Coupon(ctx context.Context, tenantID, code string) (Coupon, error) {
	var c Coupon
	err := s.DB.QueryRow(ctx, `SELECT code,discount_type,percent_amount,fixed_amount,max_discount,quantity,expires_at FROM coupons WHERE tenant_id=$1 AND upper(code)=upper($2) AND active=true`, tenantID, code).Scan(&c.Code, &c.Type, &c.Percent, &c.Fixed, &c.MaxDiscount, &c.Quantity, &c.ExpiresAt)
	return c, err
}

type OrderItemInput struct {
	ProductID string   `json:"product_id"`
	Quantity  int      `json:"quantity"`
	Note      string   `json:"note"`
	OptionIDs []string `json:"option_ids"`
}
type CreateOrderInput struct {
	TenantSlug, CustomerName, CustomerEmail, WhatsApp, DeliveryType, DeliveryZoneID, Province, Municipality, Sector, Address, Reference, PaymentMethod, PaymentInfo, CouponCode string           `json:"-"`
	CustomerIdentity                                                                                                                                                            VerifiedPerson   `json:"-"`
	GeoAddress                                                                                                                                                                  GeoAddressInput  `json:"-"`
	RouteDistanceKm                                                                                                                                                             float64          `json:"-"`
	RouteDurationSeconds                                                                                                                                                        int              `json:"-"`
	TableNumber                                                                                                                                                                 int              `json:"table_number"`
	Items                                                                                                                                                                       []OrderItemInput `json:"items"`
}
type CreatedOrder struct {
	ID, PublicCode, WhatsAppText           string
	Subtotal, Discount, DeliveryFee, Total float64
}

func (s *Store) CreateOrder(ctx context.Context, in CreateOrderInput) (CreatedOrder, error) {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return CreatedOrder{}, err
	}
	defer tx.Rollback(ctx)

	var tenantID, tenantName string
	var minimum, defaultDelivery float64
	var deliveryEnabled, pickupEnabled, tableEnabled, otherEnabled bool
	var cashEnabled, cardEnabled, bankEnabled, linkEnabled, isOpen bool
	if err := tx.QueryRow(ctx, `SELECT t.id::text,t.name,t.minimum_order,t.default_delivery_fee,t.delivery_enabled,t.pickup_enabled,t.table_enabled,t.other_enabled,t.cash_enabled,t.card_on_delivery_enabled,t.bank_transfer_enabled,t.payment_link_enabled,CASE WHEN oh.tenant_id IS NULL THEN t.is_open WHEN oh.closed THEN false WHEN oh.opens_at IS NULL OR oh.closes_at IS NULL THEN t.is_open WHEN oh.opens_at<=oh.closes_at THEN (now() AT TIME ZONE 'America/Santo_Domingo')::time>=oh.opens_at AND (now() AT TIME ZONE 'America/Santo_Domingo')::time<oh.closes_at ELSE (now() AT TIME ZONE 'America/Santo_Domingo')::time>=oh.opens_at OR (now() AT TIME ZONE 'America/Santo_Domingo')::time<oh.closes_at END FROM tenants t LEFT JOIN opening_hours oh ON oh.tenant_id=t.id AND oh.weekday=extract(dow from (now() AT TIME ZONE 'America/Santo_Domingo'))::int WHERE t.slug=$1 AND t.active=true AND EXISTS (SELECT 1 FROM subscriptions su WHERE su.tenant_id=t.id AND su.status='active' AND (su.expires_at IS NULL OR su.expires_at>=current_date))`, in.TenantSlug).Scan(&tenantID, &tenantName, &minimum, &defaultDelivery, &deliveryEnabled, &pickupEnabled, &tableEnabled, &otherEnabled, &cashEnabled, &cardEnabled, &bankEnabled, &linkEnabled, &isOpen); err != nil {
		return CreatedOrder{}, errors.New("negocio no disponible o suscripción vencida")
	}
	if !isOpen {
		return CreatedOrder{}, errors.New("el negocio está cerrado en este momento")
	}
	allowedDelivery := map[string]bool{"delivery": deliveryEnabled, "pickup": pickupEnabled, "table": tableEnabled, "other": otherEnabled}
	if !allowedDelivery[in.DeliveryType] {
		return CreatedOrder{}, errors.New("modalidad de pedido no disponible")
	}
	allowedPayment := map[string]bool{"cash": cashEnabled, "card_on_delivery": cardEnabled, "bank_transfer": bankEnabled, "payment_link": linkEnabled}
	if !allowedPayment[in.PaymentMethod] {
		return CreatedOrder{}, errors.New("método de pago no disponible")
	}
	if len(in.Items) == 0 {
		return CreatedOrder{}, errors.New("el carrito está vacío")
	}

	type calcOption struct {
		id, name, groupID string
		price             float64
	}
	type calc struct {
		id, name, note string
		qty            int
		unit, total    float64
		trackStock     bool
		options        []calcOption
	}
	var lines []calc
	subtotal := 0.0
	for _, it := range in.Items {
		if it.Quantity < 1 {
			continue
		}
		var id, name string
		var price, promo float64
		var onSale, trackStock bool
		var stock int
		if err := tx.QueryRow(ctx, `SELECT id::text,name,price,coalesce(promo_price,0),on_sale,track_stock,stock FROM products WHERE tenant_id=$1 AND id=$2 AND active=true AND visible=true FOR UPDATE`, tenantID, it.ProductID).Scan(&id, &name, &price, &promo, &onSale, &trackStock, &stock); err != nil {
			return CreatedOrder{}, err
		}
		if trackStock && stock < it.Quantity {
			return CreatedOrder{}, fmt.Errorf("no hay suficiente existencia de %s", name)
		}
		unit := price
		if onSale && promo > 0 {
			unit = promo
		}
		selected := []calcOption{}
		seen := map[string]bool{}
		counts := map[string]int{}
		for _, optionID := range it.OptionIDs {
			if seen[optionID] {
				return CreatedOrder{}, errors.New("una opción fue enviada más de una vez")
			}
			seen[optionID] = true
			var oid, oname, gid string
			var delta float64
			err := tx.QueryRow(ctx, `SELECT o.id::text,o.name,o.price_delta,g.id::text FROM product_options o JOIN product_option_groups g ON g.id=o.group_id WHERE o.id=$1 AND o.active=true AND g.product_id=$2`, optionID, id).Scan(&oid, &oname, &delta, &gid)
			if err != nil {
				return CreatedOrder{}, errors.New("una opción seleccionada no es válida")
			}
			unit += delta
			counts[gid]++
			selected = append(selected, calcOption{oid, oname, gid, delta})
		}
		gr, err := tx.Query(ctx, `SELECT id::text,name,min_select,max_select,required FROM product_option_groups WHERE product_id=$1`, id)
		if err != nil {
			return CreatedOrder{}, err
		}
		for gr.Next() {
			var gid, gname string
			var min, max int
			var required bool
			if err := gr.Scan(&gid, &gname, &min, &max, &required); err != nil {
				gr.Close()
				return CreatedOrder{}, err
			}
			n := counts[gid]
			requiredMin := min
			if required && requiredMin < 1 {
				requiredMin = 1
			}
			if n < requiredMin {
				gr.Close()
				return CreatedOrder{}, fmt.Errorf("selecciona al menos %d opción(es) en %s", requiredMin, gname)
			}
			if max > 0 && n > max {
				gr.Close()
				return CreatedOrder{}, fmt.Errorf("selecciona como máximo %d opción(es) en %s", max, gname)
			}
		}
		gr.Close()
		total := unit * float64(it.Quantity)
		subtotal += total
		lines = append(lines, calc{id: id, name: name, note: it.Note, qty: it.Quantity, unit: unit, total: total, trackStock: trackStock, options: selected})
	}
	if len(lines) == 0 {
		return CreatedOrder{}, errors.New("el carrito está vacío")
	}
	if subtotal < minimum {
		return CreatedOrder{}, fmt.Errorf("el pedido mínimo es RD$ %.2f", minimum)
	}

	discount := 0.0
	if in.CouponCode != "" {
		var typ string
		var pct, fixed, max float64
		var qty int
		err := tx.QueryRow(ctx, `SELECT discount_type,percent_amount,fixed_amount,max_discount,quantity FROM coupons WHERE tenant_id=$1 AND upper(code)=upper($2) AND active=true AND (expires_at IS NULL OR expires_at>now()) FOR UPDATE`, tenantID, in.CouponCode).Scan(&typ, &pct, &fixed, &max, &qty)
		if err != nil {
			return CreatedOrder{}, errors.New("cupón inválido o vencido")
		}
		if qty == 0 {
			return CreatedOrder{}, errors.New("cupón agotado")
		}
		if typ == "percent" {
			discount = subtotal * pct / 100
		} else {
			discount = fixed
		}
		if max > 0 && discount > max {
			discount = max
		}
		if discount > subtotal {
			discount = subtotal
		}
		if qty > 0 {
			if _, err = tx.Exec(ctx, `UPDATE coupons SET quantity=quantity-1 WHERE tenant_id=$1 AND upper(code)=upper($2)`, tenantID, in.CouponCode); err != nil {
				return CreatedOrder{}, err
			}
		}
	}

	delivery := 0.0
	if in.DeliveryType == "delivery" {
		delivery = defaultDelivery
		if in.DeliveryZoneID != "" {
			if err := tx.QueryRow(ctx, `SELECT fee FROM delivery_zones WHERE tenant_id=$1 AND id=$2 AND active=true`, tenantID, in.DeliveryZoneID).Scan(&delivery); err != nil {
				return CreatedOrder{}, errors.New("zona de delivery inválida")
			}
		}
	}
	total := subtotal - discount + delivery
	var publicCode string
	if err := tx.QueryRow(ctx, `SELECT upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))`).Scan(&publicCode); err != nil {
		return CreatedOrder{}, err
	}
	meta, _ := json.Marshal(map[string]any{"delivery_zone_id": in.DeliveryZoneID, "province": in.Province, "municipality": in.Municipality, "sector": in.Sector, "address": in.Address, "reference": in.Reference, "table": in.TableNumber, "geo_province_code": in.GeoAddress.ProvinceCode, "geo_city_id": in.GeoAddress.CityID, "geo_neighborhood_id": in.GeoAddress.NeighborhoodID, "geo_id": in.GeoAddress.GeoID, "geo_address_label": in.GeoAddress.Label, "lat": in.GeoAddress.Latitude, "lng": in.GeoAddress.Longitude})
	geoMeta, _ := json.Marshal(in.GeoAddress)
	var orderID string
	if err = tx.QueryRow(ctx, `INSERT INTO orders(tenant_id,public_code,customer_name,whatsapp,delivery_type,payment_method,payment_info,coupon_code,subtotal,discount,delivery_fee,total,status,address_json,customer_identity_verified,delivery_zone_id,delivery_latitude,delivery_longitude,route_distance_km,route_duration_seconds,geo_address_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',$13,true,nullif($14,'')::uuid,nullif($15,0),nullif($16,0),nullif($17,0),nullif($18,0),$19) RETURNING id::text`, tenantID, publicCode, in.CustomerName, in.WhatsApp, in.DeliveryType, in.PaymentMethod, in.PaymentInfo, in.CouponCode, subtotal, discount, delivery, total, meta, in.DeliveryZoneID, in.GeoAddress.Latitude, in.GeoAddress.Longitude, in.RouteDistanceKm, in.RouteDurationSeconds, geoMeta).Scan(&orderID); err != nil {
		return CreatedOrder{}, err
	}
	for _, l := range lines {
		var orderItemID string
		if err = tx.QueryRow(ctx, `INSERT INTO order_items(order_id,product_id,product_name,quantity,unit_price,total,note) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id::text`, orderID, l.id, l.name, l.qty, l.unit, l.total, l.note).Scan(&orderItemID); err != nil {
			return CreatedOrder{}, err
		}
		for _, o := range l.options {
			if _, err = tx.Exec(ctx, `INSERT INTO order_item_options(order_item_id,option_name,price_delta) VALUES($1,$2,$3)`, orderItemID, o.name, o.price); err != nil {
				return CreatedOrder{}, err
			}
		}
		if l.trackStock {
			tag, err := tx.Exec(ctx, `UPDATE products SET stock=stock-$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND stock>=$3`, tenantID, l.id, l.qty)
			if err != nil {
				return CreatedOrder{}, err
			}
			if tag.RowsAffected() == 0 {
				return CreatedOrder{}, fmt.Errorf("la existencia de %s cambió mientras realizabas el pedido", l.name)
			}
		}
	}
	msg := fmt.Sprintf("*Pedido #%s - %s*\n", publicCode, tenantName)
	for _, l := range lines {
		msg += fmt.Sprintf("%dx %s — RD$ %.2f\n", l.qty, l.name, l.total)
		for _, o := range l.options {
			msg += fmt.Sprintf("  • %s (+RD$ %.2f)\n", o.name, o.price)
		}
		if l.note != "" {
			msg += fmt.Sprintf("  Nota: %s\n", l.note)
		}
	}
	msg += fmt.Sprintf("\nSubtotal: RD$ %.2f\nDescuento: RD$ %.2f\nDelivery: RD$ %.2f\n*Total: RD$ %.2f*\n\nCliente: %s\nWhatsApp: %s", subtotal, discount, delivery, total, in.CustomerName, in.WhatsApp)
	_, _ = tx.Exec(ctx, `UPDATE orders SET whatsapp_text=$2 WHERE id=$1`, orderID, msg)
	if customerID, upsertErr := s.UpsertCustomerFromOrder(ctx, tx, tenantID, in.WhatsApp, in.CustomerEmail, in.Province, in.Municipality, in.Sector, in.Address, in.Reference, in.CustomerIdentity, in.GeoAddress); upsertErr != nil {
		return CreatedOrder{}, upsertErr
	} else if customerID != "" {
		if _, err := tx.Exec(ctx, `UPDATE orders SET customer_id=$2 WHERE id=$1`, orderID, customerID); err != nil {
			return CreatedOrder{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return CreatedOrder{}, err
	}
	return CreatedOrder{orderID, publicCode, msg, subtotal, discount, delivery, total}, nil
}
func (s *Store) Dashboard(ctx context.Context, tenantID string) (map[string]any, error) {
	out := map[string]any{}
	var products, orders int
	var sales float64
	var pending int
	err := s.DB.QueryRow(ctx, `SELECT (SELECT count(*) FROM products WHERE tenant_id=$1 AND active=true),(SELECT count(*) FROM orders WHERE tenant_id=$1),(SELECT coalesce(sum(total),0) FROM orders WHERE tenant_id=$1 AND status='completed'),(SELECT count(*) FROM orders WHERE tenant_id=$1 AND status='pending')`, tenantID).Scan(&products, &orders, &sales, &pending)
	if err != nil {
		return nil, err
	}
	out["products"] = products
	out["orders"] = orders
	out["sales"] = sales
	out["pending"] = pending
	return out, nil
}

type DashboardOrder struct {
	ID, PublicCode, CustomerName, WhatsApp, DeliveryType, PaymentMethod, Status, CreatedAt string
	Total                                                                                  float64
}

func (s *Store) Orders(ctx context.Context, tenantID string) ([]DashboardOrder, error) {
	rows, err := s.DB.Query(ctx, `SELECT id::text,public_code,customer_name,whatsapp,delivery_type,payment_method,status,to_char(created_at AT TIME ZONE 'America/Santo_Domingo','DD/MM/YYYY HH24:MI'),total FROM orders WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DashboardOrder
	for rows.Next() {
		var x DashboardOrder
		if err := rows.Scan(&x.ID, &x.PublicCode, &x.CustomerName, &x.WhatsApp, &x.DeliveryType, &x.PaymentMethod, &x.Status, &x.CreatedAt, &x.Total); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}
func (s *Store) UpdateOrderStatus(ctx context.Context, tenantID, id, status string) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var current, couponCode string
	if err := tx.QueryRow(ctx, `SELECT status,coalesce(coupon_code,'') FROM orders WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, tenantID, id).Scan(&current, &couponCode); err != nil {
		return errors.New("pedido no encontrado")
	}
	if current == status {
		return tx.Commit(ctx)
	}
	transitions := map[string]map[string]bool{
		"pending":          {"accepted": true, "cancelled": true},
		"accepted":         {"preparing": true, "cancelled": true},
		"preparing":        {"out_for_delivery": true, "completed": true, "cancelled": true},
		"out_for_delivery": {"completed": true, "cancelled": true},
		"completed":        {"refunded": true},
		"cancelled":        {},
		"refunded":         {},
	}
	if !transitions[current][status] {
		return fmt.Errorf("no se puede cambiar un pedido de %s a %s", current, status)
	}

	if status == "cancelled" || status == "refunded" {
		if _, err := tx.Exec(ctx, `UPDATE products p SET stock=p.stock+x.qty,updated_at=now() FROM (SELECT oi.product_id,sum(oi.quantity)::int qty FROM order_items oi JOIN products p2 ON p2.id=oi.product_id WHERE oi.order_id=$1 AND p2.track_stock=true GROUP BY oi.product_id) x WHERE p.id=x.product_id`, id); err != nil {
			return err
		}
		if couponCode != "" {
			if _, err := tx.Exec(ctx, `UPDATE coupons SET quantity=quantity+1 WHERE tenant_id=$1 AND upper(code)=upper($2) AND quantity>=0`, tenantID, couponCode); err != nil {
				return err
			}
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE orders SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2`, tenantID, id, status); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) AdminProducts(ctx context.Context, tenantID string) ([]Product, error) {
	return s.Products(ctx, tenantID, "", "")
}
func (s *Store) CreateProduct(ctx context.Context, tenantID, name, categoryID, description, reference string, price, promo float64, featured, onSale bool) (Product, error) {
	var x Product
	err := s.DB.QueryRow(ctx, `INSERT INTO products(tenant_id,category_id,name,description,reference,price,promo_price,featured,on_sale,visible,active) VALUES($1,$2,$3,$4,$5,$6,nullif($7,0),$8,$9,true,true) RETURNING id::text,category_id::text,name,description,reference,'',price,coalesce(promo_price,0),featured,on_sale,track_stock,stock`, tenantID, categoryID, name, description, reference, price, promo, featured, onSale).Scan(&x.ID, &x.CategoryID, &x.Name, &x.Description, &x.Reference, &x.ImageURL, &x.Price, &x.PromoPrice, &x.Featured, &x.OnSale, &x.TrackStock, &x.Stock)
	return x, err
}
func (s *Store) CreateCategory(ctx context.Context, tenantID, name string) (Category, error) {
	var c Category
	err := s.DB.QueryRow(ctx, `INSERT INTO categories(tenant_id,name,visible,position) VALUES($1,$2,true,coalesce((SELECT max(position)+1 FROM categories WHERE tenant_id=$1),0)) RETURNING id::text,name,position`, tenantID, name).Scan(&c.ID, &c.Name, &c.Position)
	return c, err
}

func (s *Store) SuperSummary(ctx context.Context) (map[string]any, error) {
	out := map[string]any{}
	var tenants, users, orders int
	var gmv float64
	err := s.DB.QueryRow(ctx, `SELECT (SELECT count(*) FROM tenants WHERE active=true),(SELECT count(*) FROM users WHERE active=true),(SELECT count(*) FROM orders),(SELECT coalesce(sum(total),0) FROM orders)`).Scan(&tenants, &users, &orders, &gmv)
	if err != nil {
		return nil, err
	}
	out["tenants"] = tenants
	out["users"] = users
	out["orders"] = orders
	out["gmv"] = gmv
	return out, nil
}

type TenantListItem struct {
	ID, Name, Slug, Province, Plan string
	Active                         bool
}

func (s *Store) Tenants(ctx context.Context) ([]TenantListItem, error) {
	rows, err := s.DB.Query(ctx, `SELECT t.id::text,t.name,t.slug,coalesce(p.name,''),coalesce(pl.name,''),t.active FROM tenants t LEFT JOIN provinces p ON p.id=t.province_id LEFT JOIN subscriptions su ON su.tenant_id=t.id AND su.status='active' LEFT JOIN plans pl ON pl.id=su.plan_id ORDER BY t.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TenantListItem
	for rows.Next() {
		var x TenantListItem
		if err := rows.Scan(&x.ID, &x.Name, &x.Slug, &x.Province, &x.Plan, &x.Active); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}
