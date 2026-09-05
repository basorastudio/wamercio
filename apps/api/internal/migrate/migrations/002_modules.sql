ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS bank_transfer_info text,
  ADD COLUMN IF NOT EXISTS payment_link_url text,
  ADD COLUMN IF NOT EXISTS cash_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS card_on_delivery_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bank_transfer_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_link_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS settings_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS marketplaces(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name varchar(160) NOT NULL,
 slug varchar(80) UNIQUE NOT NULL,
 province_id uuid REFERENCES provinces(id),
 municipality_id uuid REFERENCES municipalities(id),
 description text,
 cover_url text,
 accent_color varchar(20) NOT NULL DEFAULT '#ff5400',
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_integrations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 provider varchar(80) NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,provider)
);

CREATE TABLE IF NOT EXISTS notification_templates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 event varchar(80) NOT NULL,
 channel varchar(30) NOT NULL DEFAULT 'whatsapp',
 template_text text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 UNIQUE(tenant_id,event,channel)
);

INSERT INTO municipalities(province_id,code,name)
SELECT p.id,'2801','Bonao' FROM provinces p WHERE p.code='28'
ON CONFLICT(code) DO NOTHING;

INSERT INTO marketplaces(name,slug,province_id,municipality_id,description)
SELECT 'Bonao','bonao',p.id,m.id,'Comercios y productos disponibles en Bonao.'
FROM provinces p JOIN municipalities m ON m.province_id=p.id AND m.code='2801'
WHERE p.code='28'
ON CONFLICT(slug) DO NOTHING;
