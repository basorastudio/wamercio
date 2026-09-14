
UPDATE platform_settings
SET value = jsonb_set(
      value,
      '{reserved_subdomains}',
      coalesce((SELECT jsonb_agg(item) FROM jsonb_array_elements(coalesce(value->'reserved_subdomains','[]'::jsonb)) item WHERE item <> '"cliente"'::jsonb),'[]'::jsonb),
      true
    ),
    updated_at = now()
WHERE key='domains';

-- Restaurar el sincronizador compatible con el esquema anterior antes de
-- retirar pin_hash.
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

DROP INDEX IF EXISTS idx_orders_global_customer;
ALTER TABLE orders DROP COLUMN IF EXISTS global_customer_id;

DROP INDEX IF EXISTS idx_customer_addresses_one_primary;
DROP INDEX IF EXISTS idx_customer_addresses_customer;
DROP TABLE IF EXISTS customer_addresses;

DROP INDEX IF EXISTS idx_global_customers_national_id_unique;
ALTER TABLE global_customers
  DROP COLUMN IF EXISTS last_login_at,
  DROP COLUMN IF EXISTS identity_verified_at,
  DROP COLUMN IF EXISTS whatsapp_verified_at,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS pin_changed_at,
  DROP COLUMN IF EXISTS pin_hash,
  DROP COLUMN IF EXISTS gender,
  DROP COLUMN IF EXISTS birth_date,
  DROP COLUMN IF EXISTS national_id,
  DROP COLUMN IF EXISTS last_name;

UPDATE platform_settings
SET value = value - 'customer_pin_length' - 'legacy_customer_pin_lengths', updated_at=now()
WHERE key='access';
