DROP INDEX IF EXISTS idx_stores_visual_theme;
ALTER TABLE stores DROP COLUMN IF EXISTS theme_config;
ALTER TABLE stores DROP COLUMN IF EXISTS visual_theme;
