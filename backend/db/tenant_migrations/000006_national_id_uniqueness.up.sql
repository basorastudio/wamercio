CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_national_id_digits_unique_not_blank
  ON customers ((replace(national_id, '-', '')))
  WHERE replace(national_id, '-', '') <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_users_national_id_digits_unique_not_blank
  ON system_users ((replace(national_id, '-', '')))
  WHERE replace(national_id, '-', '') <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_profiles_national_id_unique_not_blank
  ON admin_profiles(national_id)
  WHERE national_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_profiles_national_id_digits_unique_not_blank
  ON admin_profiles ((replace(national_id, '-', '')))
  WHERE replace(national_id, '-', '') <> '';
