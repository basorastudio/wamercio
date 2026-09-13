CREATE TABLE IF NOT EXISTS system_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  national_id text NOT NULL DEFAULT '',
  whatsapp text NOT NULL DEFAULT '',
  whatsapp_display text NOT NULL DEFAULT '',
  profile_picture_url text NOT NULL DEFAULT '',
  country_code text NOT NULL DEFAULT 'do',
  dial_code text NOT NULL DEFAULT '+1',
  pin_hash text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'cashier',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_users_role_check CHECK (role IN ('administrator', 'cashier', 'delivery_driver'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_users_national_id_unique_not_blank ON system_users(national_id) WHERE national_id <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_system_users_whatsapp_unique_not_blank ON system_users(whatsapp) WHERE whatsapp <> '';
CREATE INDEX IF NOT EXISTS idx_system_users_role ON system_users(role);
CREATE INDEX IF NOT EXISTS idx_system_users_active ON system_users(active);
