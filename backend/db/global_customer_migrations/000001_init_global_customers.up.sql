CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS global_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  national_id text NOT NULL DEFAULT '',
  whatsapp text NOT NULL DEFAULT '',
  whatsapp_display text NOT NULL DEFAULT '',
  profile_picture_url text NOT NULL DEFAULT '',
  national_id_digits text NOT NULL DEFAULT '',
  whatsapp_digits text NOT NULL DEFAULT '',
  country_code text NOT NULL DEFAULT 'do',
  dial_code text NOT NULL DEFAULT '+1',
  pin_hash text NOT NULL DEFAULT '',
  province text NOT NULL DEFAULT '',
  province_code text NOT NULL DEFAULT '',
  municipality text NOT NULL DEFAULT '',
  municipality_code text NOT NULL DEFAULT '',
  district_code text NOT NULL DEFAULT '',
  neighborhood_id text NOT NULL DEFAULT '',
  sector text NOT NULL DEFAULT '',
  street text NOT NULL DEFAULT '',
  street_number text NOT NULL DEFAULT '',
  address_reference text NOT NULL DEFAULT '',
  lat text NOT NULL DEFAULT '',
  lng text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_global_customers_national_id_unique_not_blank
  ON global_customers (national_id_digits) WHERE national_id_digits <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_global_customers_whatsapp_unique_not_blank
  ON global_customers (whatsapp_digits) WHERE whatsapp_digits <> '';

CREATE INDEX IF NOT EXISTS idx_global_customers_created_at
  ON global_customers (created_at DESC);
