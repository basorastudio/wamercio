UPDATE platform_settings
SET value = jsonb_set(
  jsonb_set(
    COALESCE(value, '{}'::jsonb),
    '{logo_url}',
    '""'::jsonb,
    true
  ),
  '{brand_icon}',
  '"🛡️"'::jsonb,
  true
), updated_at = now()
WHERE key = 'landing_page';
