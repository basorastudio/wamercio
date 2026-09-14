-- WAMERCIO 2.4.0: identidad global y acceso de clientes.

ALTER TABLE global_customers
  ADD COLUMN IF NOT EXISTS last_name varchar(160),
  ADD COLUMN IF NOT EXISTS national_id varchar(20),
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS gender varchar(20),
  ADD COLUMN IF NOT EXISTS pin_hash text,
  ADD COLUMN IF NOT EXISTS pin_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS whatsapp_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_global_customers_national_id_unique
  ON global_customers(national_id)
  WHERE coalesce(national_id,'') <> '';


-- Una identidad global ya registrada (con PIN) es autoritativa. La relación
-- comercial de una tienda puede crear/enlazar clientes históricos, pero no
-- debe sobrescribir el nombre verificado del perfil global.
CREATE OR REPLACE FUNCTION wamercio_sync_global_customer() RETURNS trigger AS $$
DECLARE normalized varchar(30); gid uuid;
BEGIN
  normalized := regexp_replace(coalesce(NEW.phone,''),'[^0-9]','','g');
  IF normalized='' THEN RETURN NEW; END IF;
  INSERT INTO global_customers(phone,name,updated_at) VALUES(normalized,NEW.name,now())
  ON CONFLICT(phone) DO UPDATE SET
    name=CASE
      WHEN global_customers.pin_hash IS NULL AND EXCLUDED.name<>'' THEN EXCLUDED.name
      ELSE global_customers.name
    END,
    updated_at=now()
  RETURNING id INTO gid;
  NEW.global_customer_id := gid;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  global_customer_id uuid NOT NULL REFERENCES global_customers(id) ON DELETE CASCADE,
  label varchar(80) NOT NULL DEFAULT 'Principal',
  province_code varchar(32),
  province varchar(120),
  city_id varchar(96),
  municipality varchar(160),
  neighborhood_id varchar(96),
  neighborhood varchar(180),
  street varchar(220) NOT NULL,
  street_number varchar(60),
  reference text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(global_customer_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_addresses_one_primary
  ON customer_addresses(global_customer_id)
  WHERE is_primary=true;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS global_customer_id uuid REFERENCES global_customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_global_customer ON orders(global_customer_id, created_at DESC);

UPDATE orders o
SET global_customer_id = c.global_customer_id
FROM customers c
WHERE o.customer_id=c.id
  AND o.global_customer_id IS NULL
  AND c.global_customer_id IS NOT NULL;

-- La política de acceso conserva 4 dígitos por defecto para clientes y
-- mantiene una lista de longitudes históricas igual que propietarios.
UPDATE platform_settings
SET value = jsonb_set(
              jsonb_set(value, '{customer_pin_length}', coalesce(value->'customer_pin_length','4'::jsonb), true),
              '{legacy_customer_pin_lengths}', coalesce(value->'legacy_customer_pin_lengths','[]'::jsonb), true
            ),
    updated_at = now()
WHERE key='access';

-- Reservar la ruta global del portal de clientes para que ningún negocio
-- pueda capturar /cliente como slug público.
UPDATE platform_settings
SET value = jsonb_set(
      value,
      '{reserved_subdomains}',
      coalesce(value->'reserved_subdomains','[]'::jsonb) || '["cliente"]'::jsonb,
      true
    ),
    updated_at = now()
WHERE key='domains'
  AND NOT coalesce(value->'reserved_subdomains','[]'::jsonb) @> '["cliente"]'::jsonb;
