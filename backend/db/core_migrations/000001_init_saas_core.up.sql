CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_monthly double precision NOT NULL DEFAULT 0,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);



CREATE TABLE IF NOT EXISTS platform_business_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  domain_suffix text NOT NULL DEFAULT '.ltd.do',
  emoji text NOT NULL DEFAULT '🏪',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  whatsapp text NOT NULL DEFAULT '',
  whatsapp_digits text NOT NULL DEFAULT '',
  profile_picture_url text NOT NULL DEFAULT '',
  national_id text NOT NULL DEFAULT '',
  national_id_digits text NOT NULL DEFAULT '',
  province text NOT NULL DEFAULT '',
  municipality text NOT NULL DEFAULT '',
  neighborhood text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  password_hash text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_owners_status_check CHECK (status IN ('active','disabled'))
);

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  plan_slug text NOT NULL DEFAULT 'starter',
  owner_id uuid REFERENCES platform_owners(id) ON DELETE SET NULL,
  owner_name text NOT NULL DEFAULT '',
  owner_whatsapp text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_status_check CHECK (status IN ('active','trial','suspended','disabled','provisioning'))
);

CREATE TABLE IF NOT EXISTS tenant_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain text NOT NULL UNIQUE,
  type text NOT NULL DEFAULT 'subdomain',
  is_primary boolean NOT NULL DEFAULT true,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_domains_type_check CHECK (type IN ('root','subdomain','custom_domain'))
);

CREATE TABLE IF NOT EXISTS tenant_databases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  database_name text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'ready',
  migration_version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_databases_status_check CHECK (status IN ('creating','ready','migrating','error','disabled'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_slug text NOT NULL DEFAULT 'starter',
  status text NOT NULL DEFAULT 'trial',
  billing_period text NOT NULL DEFAULT 'monthly',
  starts_at timestamptz NOT NULL DEFAULT now(),
  next_billing_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_customer_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  global_customer_id uuid NOT NULL,
  local_customer_id uuid NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, global_customer_id),
  UNIQUE (tenant_id, local_customer_id)
);

CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  actor text NOT NULL DEFAULT '',
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS territory_custom_neighborhoods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  province_code text NOT NULL,
  province_name text NOT NULL DEFAULT '',
  municipality_code text NOT NULL,
  municipality_name text NOT NULL DEFAULT '',
  district_code text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_core_territory_custom_neighborhoods_unique
  ON territory_custom_neighborhoods (lower(name), province_code, municipality_code, district_code);


INSERT INTO platform_business_types (name, slug, domain_suffix, emoji, sort_order)
VALUES
  ('Provisiones', 'provisiones', '.ltd.do', '🏠', 10),
  ('Surtidora', 'surtidora', '.ltd.do', '🏠', 20),
  ('Tienda', 'tienda', '.ltd.do', '🏪', 30),
  ('Supermercado', 'supermercado', '.ltd.do', '🏪', 40),
  ('Minimarket', 'minimarket', '.ltd.do', '🏬', 50),
  ('Pulpería', 'pulperia', '.ltd.do', '🏪', 60),
  ('Bodega', 'bodega', '.ltd.do', '🏪', 70)
ON CONFLICT (slug) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_owners_whatsapp_unique_not_blank ON platform_owners (whatsapp_digits) WHERE whatsapp_digits <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_owners_national_id_unique_not_blank ON platform_owners (national_id_digits) WHERE national_id_digits <> '';
CREATE INDEX IF NOT EXISTS idx_tenants_owner_id ON tenants(owner_id);
CREATE INDEX IF NOT EXISTS idx_tenant_domains_tenant_id ON tenant_domains(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_databases_tenant_id ON tenant_databases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_customer_links_global_customer_id ON tenant_customer_links(global_customer_id);

INSERT INTO plans (slug, name, description, price_monthly, limits)
VALUES ('starter', 'Inicial', 'Plan base para negocios nuevos en WAMERCIO.', 0, '{"stores":1,"products":1000,"users":10}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO plans (slug, name, description, price_monthly, limits)
VALUES
  ('pro', 'Pro', 'Plan para negocios con mayor volumen de productos, usuarios y operación diaria.', 1495, '{"stores":2,"products":5000,"users":25}'::jsonb),
  ('enterprise', 'Empresarial', 'Plan avanzado para cadenas de negocios, dominios propios y operación extendida.', 3995, '{"stores":10,"products":20000,"users":100}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO platform_settings (key, value)
VALUES
  ('default_plan', '"starter"'::jsonb),
  ('allow_public_signup', 'false'::jsonb),
  ('billing_grace_days', '5'::jsonb),
  ('support_whatsapp', '""'::jsonb),
  ('support_email', '""'::jsonb),
  ('waxum', '{
    "enabled": true,
    "public_url": "https://waxum.ltd.do",
    "dashboard_url": "https://waxum.ltd.do",
    "docs_url": "https://waxum.ltd.do/swagger-ui/",
    "admin_token": ""
  }'::jsonb),
  ('whatsapp_platform', '{
    "enabled": true,
    "session_id": "",
    "session_name": "WAMERCIO",
    "status": "pending",
    "connected": false,
    "logged_in": false,
    "jid": "",
    "phone": "",
    "profile_name": "",
    "profile_picture_url": ""
  }'::jsonb),
  ('landing_page', '{
    "brand_name": "WAMERCIO",
    "brand_subtitle": "Plataforma SaaS",
    "brand_icon": "🛡️",
    "badge_text": "Dominio central: {domain}",
    "hero_title": "La página principal de tu red de negocios SaaS.",
    "hero_description": "Este dominio principal pertenece a WAMERCIO como plataforma. Cada negocio opera públicamente desde su subdominio comodín, mientras el administrador gestiona múltiples negocios desde un único panel central.",
    "primary_button_text": "Entrar al panel central",
    "primary_button_url": "#/superadmin",
    "secondary_button_text": "Panel administrador",
    "secondary_button_url": "#/admin",
    "info_kicker": "Resolución correcta",
    "info_title": "Raíz para SaaS · Subdominio para negocio",
    "info_rows": [
      {"label": "Landing SaaS", "value": "{domain}"},
      {"label": "Nuevo negocio", "value": "slug.{domain}", "accent": true},
      {"label": "Panel administrador", "value": "{domain}/#/admin", "accent": true}
    ],
    "features": [
      {"icon": "globe", "title": "Subdominio comodín", "text": "Cada negocio se crea como slug.{domain}, sin usar el dominio raíz como tienda."},
      {"icon": "database", "title": "BD por negocio", "text": "Cada negocio mantiene su propia base PostgreSQL operativa separada."},
      {"icon": "users", "title": "Clientes globales", "text": "La identidad del cliente puede compartirse mientras cada negocio conserva su operación."},
      {"icon": "lock", "title": "Control central", "text": "La superadministración gestiona negocios, planes, dominios, suscripciones y auditoría."}
    ],
    "maintenance": {
      "enabled": false,
      "badge_text": "Mantenimiento programado",
      "title": "Estamos realizando mejoras en la página principal",
      "description": "La página principal estará temporalmente en mantenimiento mientras optimizamos la experiencia de WAMERCIO. Los negocios activos continúan operando desde sus subdominios.",
      "estimated_return": "Volvemos pronto",
      "status_label": "Estado del servicio",
      "status_value": "Mantenimiento activo",
      "notice_title": "Página principal pausada temporalmente",
      "notice_text": "El acceso administrativo y las tiendas existentes siguen disponibles. Esta pantalla solo afecta el dominio principal.",
      "support_button_text": "Entrar al panel central",
      "support_button_url": "#/superadmin"
    }
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;
