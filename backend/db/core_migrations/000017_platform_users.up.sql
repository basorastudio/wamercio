CREATE TABLE IF NOT EXISTS platform_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  national_id text NOT NULL DEFAULT '',
  whatsapp text NOT NULL DEFAULT '',
  whatsapp_display text NOT NULL DEFAULT '',
  profile_picture_url text NOT NULL DEFAULT '',
  country_code text NOT NULL DEFAULT 'do',
  dial_code text NOT NULL DEFAULT '+1',
  password_hash text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'support',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  is_root boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_users_role_check CHECK (role IN ('superadmin', 'administrator', 'operations', 'support', 'auditor'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_users_username_unique
  ON platform_users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_users_national_id_unique_not_blank
  ON platform_users (regexp_replace(national_id, '\D', '', 'g'))
  WHERE regexp_replace(national_id, '\D', '', 'g') <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_users_whatsapp_unique_not_blank
  ON platform_users (regexp_replace(whatsapp, '\D', '', 'g'))
  WHERE regexp_replace(whatsapp, '\D', '', 'g') <> '';
CREATE INDEX IF NOT EXISTS idx_platform_users_role ON platform_users(role);
CREATE INDEX IF NOT EXISTS idx_platform_users_active ON platform_users(active);
