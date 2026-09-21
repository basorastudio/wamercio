-- WAMERCIO 2.2: central SaaS operations inspired by proven platform workflows.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS admin_access jsonb NOT NULL DEFAULT '[]'::jsonb;


CREATE TABLE IF NOT EXISTS global_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone varchar(30) UNIQUE NOT NULL,
  name varchar(160) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS global_customer_id uuid REFERENCES global_customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customers_global_customer ON customers(global_customer_id);

INSERT INTO global_customers(phone,name)
SELECT normalized_phone,(array_agg(name ORDER BY updated_at DESC))[1]
FROM (
  SELECT regexp_replace(phone,'[^0-9]','','g') AS normalized_phone,name,updated_at
  FROM customers WHERE trim(coalesce(phone,''))<>''
) c
WHERE normalized_phone<>''
GROUP BY normalized_phone
ON CONFLICT(phone) DO UPDATE SET name=EXCLUDED.name,updated_at=now();

UPDATE customers c SET global_customer_id=g.id
FROM global_customers g
WHERE regexp_replace(c.phone,'[^0-9]','','g')=g.phone AND c.global_customer_id IS NULL;

CREATE OR REPLACE FUNCTION wamercio_sync_global_customer() RETURNS trigger AS $$
DECLARE normalized varchar(30); gid uuid;
BEGIN
  normalized := regexp_replace(coalesce(NEW.phone,''),'[^0-9]','','g');
  IF normalized='' THEN RETURN NEW; END IF;
  INSERT INTO global_customers(phone,name,updated_at) VALUES(normalized,NEW.name,now())
  ON CONFLICT(phone) DO UPDATE SET name=CASE WHEN EXCLUDED.name<>'' THEN EXCLUDED.name ELSE global_customers.name END,updated_at=now()
  RETURNING id INTO gid;
  NEW.global_customer_id := gid;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_customers_global_identity ON customers;
CREATE TRIGGER trg_customers_global_identity BEFORE INSERT OR UPDATE OF phone,name ON customers FOR EACH ROW EXECUTE FUNCTION wamercio_sync_global_customer();

CREATE TABLE IF NOT EXISTS platform_settings (
  key varchar(100) PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_settings(key,value) VALUES
('landing', '{"brand_name":"WAMERCIO","brand_subtitle":"Comercio conversacional","hero_badge":"Comercio conversacional hecho en República Dominicana 🇩🇴","hero_title":"Tu comercio y tus pedidos más fáciles con WhatsApp.","hero_subtitle":"Crea tu tienda digital, comparte tu catálogo, recibe pedidos y administra clientes desde WAMERCIO. Sin complicaciones y pensado para vender desde el celular.","access_label":"Acceder","demo_label":"Ver demo","maintenance_mode":false,"maintenance_title":"Estamos realizando mejoras en la página principal","maintenance_text":"La página principal estará temporalmente en mantenimiento. Los negocios activos continúan operando desde sus subdominios."}'::jsonb),
('general', '{"support_whatsapp":"","support_email":"soporte@wamercio.com","default_plan":"emprende","grace_days":5,"public_registration":true,"tenant_domain":"ltd.do"}'::jsonb),
('identity', '{"enabled":false,"provider":"IDENTIDAD DOMINICANA","require_owner_verification":false}'::jsonb),
('territory', '{"provider":"GEO RD MAP","enabled":false,"country":"DO"}'::jsonb),
('business_types', '{"source":"business_templates","allow_custom":true}'::jsonb),
('domains', '{"tenant_domain":"ltd.do","custom_domains_enabled":true}'::jsonb),
('database', '{"engine":"PostgreSQL","isolation":"logical_per_business"}'::jsonb),
('whatsapp', '{"provider":"WhatsApp Bridge","global_support_session":true}'::jsonb),
('notifications', '{"order_new":"Nuevo pedido #{order}","order_ready":"Tu pedido #{order} está listo"}'::jsonb),
('access', '{"owner_pin_length":4,"staff_pin_length":4,"recovery_enabled":true}'::jsonb),
('legal', '{"terms_url":"/terminos","privacy_url":"/privacidad"}'::jsonb),
('backups', '{"provider":"Cloudflare R2","enabled":false,"schedule":"daily"}'::jsonb)
ON CONFLICT(key) DO NOTHING;

CREATE TABLE IF NOT EXISTS platform_banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  short_name varchar(80),
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(name)
);

INSERT INTO platform_banks(name,short_name,sort_order) VALUES
('Banco de Reservas de la República Dominicana','Banreservas',10),
('Banco Popular Dominicano','Popular',20),
('Banco BHD','BHD',30),
('Asociación Popular de Ahorros y Préstamos','APAP',40),
('Asociación Cibao de Ahorros y Préstamos','ACAP',50),
('Banco Santa Cruz','Santa Cruz',60),
('Banco Caribe','Caribe',70),
('Banco Promerica','Promerica',80)
ON CONFLICT(name) DO NOTHING;

CREATE TABLE IF NOT EXISTS store_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  phone varchar(30),
  role varchar(30) NOT NULL DEFAULT 'operator',
  panel varchar(30) NOT NULL DEFAULT 'operations',
  status varchar(20) NOT NULL DEFAULT 'active',
  pin_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_staff_store ON store_staff(store_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS platform_audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action varchar(160) NOT NULL,
  entity_type varchar(80),
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit_log(created_at DESC);
