ALTER TABLE customers ADD COLUMN IF NOT EXISTS profile_picture_url text NOT NULL DEFAULT '';
ALTER TABLE admin_profiles ADD COLUMN IF NOT EXISTS profile_picture_url text NOT NULL DEFAULT '';
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS profile_picture_url text NOT NULL DEFAULT '';
