CREATE TABLE IF NOT EXISTS admin_profiles (
  username text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  national_id text NOT NULL DEFAULT '',
  whatsapp text NOT NULL DEFAULT '',
  whatsapp_display text NOT NULL DEFAULT '',
  profile_picture_url text NOT NULL DEFAULT '',
  country_code text NOT NULL DEFAULT 'do',
  dial_code text NOT NULL DEFAULT '+1',
  password_hash text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_profiles_whatsapp ON admin_profiles(whatsapp) WHERE whatsapp <> '';
