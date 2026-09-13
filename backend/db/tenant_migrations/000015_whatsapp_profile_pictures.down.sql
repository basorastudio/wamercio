ALTER TABLE customers DROP COLUMN IF EXISTS profile_picture_url;
ALTER TABLE admin_profiles DROP COLUMN IF EXISTS profile_picture_url;
ALTER TABLE system_users DROP COLUMN IF EXISTS profile_picture_url;
