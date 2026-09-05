CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE provinces(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code varchar(4) UNIQUE NOT NULL, name varchar(100) NOT NULL
);
CREATE TABLE municipalities(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), province_id uuid NOT NULL REFERENCES provinces(id) ON DELETE CASCADE, code varchar(8) UNIQUE NOT NULL, name varchar(120) NOT NULL
);
CREATE TABLE segments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(100) NOT NULL, icon varchar(80), active boolean NOT NULL DEFAULT true
);
CREATE TABLE plans(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(120) NOT NULL, description text, monthly_price numeric(12,2) NOT NULL DEFAULT 0,
 product_limit integer, marketplace_enabled boolean NOT NULL DEFAULT false, variations_enabled boolean NOT NULL DEFAULT true,
 banners_enabled boolean NOT NULL DEFAULT true, whatsapp_automation_enabled boolean NOT NULL DEFAULT false, featured boolean NOT NULL DEFAULT false,
 visible boolean NOT NULL DEFAULT true, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE affiliates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(160) NOT NULL, email varchar(200) UNIQUE, phone varchar(30), commission_percent numeric(5,2) NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tenants(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid, affiliate_id uuid REFERENCES affiliates(id), segment_id uuid REFERENCES segments(id),
 name varchar(180) NOT NULL, slug varchar(80) UNIQUE NOT NULL, description text, logo_url text, cover_url text, accent_color varchar(20) NOT NULL DEFAULT '#ff5400',
 province_id uuid REFERENCES provinces(id), municipality_id uuid REFERENCES municipalities(id), sector varchar(180), address_line varchar(255), address_reference varchar(255), latitude numeric(10,7), longitude numeric(10,7),
 whatsapp varchar(30), email varchar(200), instagram varchar(120), facebook varchar(200), youtube varchar(200),
 minimum_order numeric(12,2) NOT NULL DEFAULT 0, default_delivery_fee numeric(12,2) NOT NULL DEFAULT 0,
 delivery_enabled boolean NOT NULL DEFAULT true, pickup_enabled boolean NOT NULL DEFAULT true, table_enabled boolean NOT NULL DEFAULT false, other_enabled boolean NOT NULL DEFAULT false,
 delivery_label varchar(80) NOT NULL DEFAULT 'Delivery', pickup_label varchar(80) NOT NULL DEFAULT 'Recogida', table_label varchar(80) NOT NULL DEFAULT 'Mesa', other_label varchar(80) NOT NULL DEFAULT 'Otro',
 is_open boolean NOT NULL DEFAULT true, marketplace_enabled boolean NOT NULL DEFAULT true, analytics_id varchar(120), meta_pixel_id varchar(120), custom_html text,
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE, affiliate_id uuid REFERENCES affiliates(id),
 name varchar(160) NOT NULL, email varchar(200) UNIQUE NOT NULL, password_hash text NOT NULL, role varchar(30) NOT NULL CHECK(role IN('superadmin','tenant_admin','staff','affiliate')),
 active boolean NOT NULL DEFAULT true, last_login_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tenants ADD CONSTRAINT tenants_owner_fk FOREIGN KEY(owner_user_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE subscriptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, plan_id uuid NOT NULL REFERENCES plans(id),
 affiliate_id uuid REFERENCES affiliates(id), price numeric(12,2) NOT NULL DEFAULT 0, status varchar(30) NOT NULL DEFAULT 'active', starts_at date NOT NULL DEFAULT current_date,
 expires_at date, external_reference varchar(200), voucher_code varchar(80), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE categories(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, name varchar(160) NOT NULL,
 position integer NOT NULL DEFAULT 0, visible boolean NOT NULL DEFAULT true, active boolean NOT NULL DEFAULT true, schedule_json jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_categories_tenant ON categories(tenant_id,position);
CREATE TABLE products(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, category_id uuid NOT NULL REFERENCES categories(id),
 name varchar(200) NOT NULL, description text, reference varchar(120), pos_code varchar(120), video_url text,
 price numeric(12,2) NOT NULL DEFAULT 0, promo_price numeric(12,2), on_sale boolean NOT NULL DEFAULT false, featured boolean NOT NULL DEFAULT false,
 visible boolean NOT NULL DEFAULT true, active boolean NOT NULL DEFAULT true, track_stock boolean NOT NULL DEFAULT false, stock integer NOT NULL DEFAULT 0,
 weight_kg numeric(10,3), height_cm numeric(10,2), width_cm numeric(10,2), length_cm numeric(10,2), position integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_tenant ON products(tenant_id,category_id,position);
CREATE TABLE product_images(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE, url text NOT NULL, position integer NOT NULL DEFAULT 0);
CREATE TABLE product_option_groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE, name varchar(160) NOT NULL, min_select integer NOT NULL DEFAULT 0, max_select integer NOT NULL DEFAULT 1, required boolean NOT NULL DEFAULT false, position integer NOT NULL DEFAULT 0);
CREATE TABLE product_options(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_id uuid NOT NULL REFERENCES product_option_groups(id) ON DELETE CASCADE, name varchar(160) NOT NULL, price_delta numeric(12,2) NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, position integer NOT NULL DEFAULT 0);
CREATE TABLE banners(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, title varchar(180), desktop_url text, mobile_url text, video_url text, link_url text, position integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true);
CREATE TABLE coupons(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, name varchar(160) NOT NULL, description text, code varchar(80) NOT NULL, discount_type varchar(20) NOT NULL CHECK(discount_type IN('percent','fixed')), percent_amount numeric(8,2) NOT NULL DEFAULT 0, fixed_amount numeric(12,2) NOT NULL DEFAULT 0, max_discount numeric(12,2) NOT NULL DEFAULT 0, quantity integer NOT NULL DEFAULT -1, expires_at timestamptz, active boolean NOT NULL DEFAULT true, UNIQUE(tenant_id,code));
CREATE TABLE delivery_zones(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, name varchar(180) NOT NULL, fee numeric(12,2) NOT NULL DEFAULT 0, polygon_geojson jsonb, active boolean NOT NULL DEFAULT true);
CREATE TABLE opening_hours(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, weekday smallint NOT NULL CHECK(weekday BETWEEN 0 AND 6), opens_at time, closes_at time, closed boolean NOT NULL DEFAULT false, UNIQUE(tenant_id,weekday));
CREATE TABLE service_tables(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, number integer NOT NULL, name varchar(100), active boolean NOT NULL DEFAULT true, UNIQUE(tenant_id,number));
CREATE TABLE customers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, name varchar(180) NOT NULL, whatsapp varchar(30) NOT NULL, email varchar(200), province varchar(120), municipality varchar(120), sector varchar(180), address_line varchar(255), reference varchar(255), total_orders integer NOT NULL DEFAULT 0, points numeric(12,2) NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,whatsapp));
CREATE TABLE orders(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, public_code varchar(20) NOT NULL,
 customer_id uuid REFERENCES customers(id), customer_name varchar(180) NOT NULL, whatsapp varchar(30) NOT NULL,
 delivery_type varchar(30) NOT NULL CHECK(delivery_type IN('delivery','pickup','table','other')), payment_method varchar(50) NOT NULL, payment_info varchar(255),
 coupon_code varchar(80), subtotal numeric(12,2) NOT NULL, discount numeric(12,2) NOT NULL DEFAULT 0, delivery_fee numeric(12,2) NOT NULL DEFAULT 0, total numeric(12,2) NOT NULL,
 status varchar(30) NOT NULL CHECK(status IN('pending','accepted','preparing','out_for_delivery','completed','cancelled','refunded')),
 payment_status varchar(30) NOT NULL DEFAULT 'pending', payment_reference varchar(200), payment_link text, address_json jsonb NOT NULL DEFAULT '{}'::jsonb,
 whatsapp_text text, print_status varchar(20) NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,public_code)
);
CREATE INDEX idx_orders_tenant_created ON orders(tenant_id,created_at DESC);
CREATE TABLE order_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id uuid REFERENCES products(id), product_name varchar(200) NOT NULL, quantity integer NOT NULL, unit_price numeric(12,2) NOT NULL, total numeric(12,2) NOT NULL, note text);
CREATE TABLE order_item_options(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE, option_name varchar(180) NOT NULL, price_delta numeric(12,2) NOT NULL DEFAULT 0);
CREATE TABLE payment_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, order_id uuid REFERENCES orders(id), provider varchar(60) NOT NULL, external_reference varchar(200), amount numeric(12,2) NOT NULL, status varchar(30) NOT NULL DEFAULT 'pending', details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE vouchers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid REFERENCES plans(id), subscription_id uuid REFERENCES subscriptions(id), affiliate_id uuid REFERENCES affiliates(id), code varchar(80) UNIQUE NOT NULL, description text, active boolean NOT NULL DEFAULT true, used_at timestamptz);
CREATE TABLE marketplace_banners(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), municipality_id uuid REFERENCES municipalities(id), tenant_id uuid REFERENCES tenants(id), title varchar(180), desktop_url text, mobile_url text, link_url text, active boolean NOT NULL DEFAULT true);
CREATE TABLE printer_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, token_hash text NOT NULL, name varchar(120) NOT NULL DEFAULT 'Impresora', active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE audit_logs(id bigserial PRIMARY KEY, user_id uuid REFERENCES users(id), tenant_id uuid REFERENCES tenants(id), action varchar(100) NOT NULL, entity varchar(100), entity_id uuid, details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());

INSERT INTO provinces(code,name) VALUES
('01','Distrito Nacional'),('02','Azua'),('03','Baoruco'),('04','Barahona'),('05','Dajabón'),('06','Duarte'),('07','Elías Piña'),('08','El Seibo'),('09','Espaillat'),('10','Independencia'),('11','La Altagracia'),('12','La Romana'),('13','La Vega'),('14','María Trinidad Sánchez'),('15','Monte Cristi'),('16','Pedernales'),('17','Peravia'),('18','Puerto Plata'),('19','Hermanas Mirabal'),('20','Samaná'),('21','San Cristóbal'),('22','San Juan'),('23','San Pedro de Macorís'),('24','Sánchez Ramírez'),('25','Santiago'),('26','Santiago Rodríguez'),('27','Valverde'),('28','Monseñor Nouel'),('29','Monte Plata'),('30','Hato Mayor'),('31','San José de Ocoa'),('32','Santo Domingo') ON CONFLICT DO NOTHING;
INSERT INTO segments(name,icon) VALUES ('Colmado','Store'),('Restaurante','Utensils'),('Ferretería','Hammer'),('Farmacia','Cross'),('Supermercado','ShoppingCart'),('Tienda','ShoppingBag') ON CONFLICT DO NOTHING;
INSERT INTO plans(name,description,monthly_price,product_limit,marketplace_enabled,variations_enabled,banners_enabled,whatsapp_automation_enabled,featured) VALUES
('Básico','Catálogo y pedidos para comenzar',590,150,false,true,false,false,false),
('Comercio','Catálogo completo con banners y marketplace',990,1000,true,true,true,false,true),
('Pro','Automatización y límites ampliados',1590,5000,true,true,true,true,false) ON CONFLICT DO NOTHING;
