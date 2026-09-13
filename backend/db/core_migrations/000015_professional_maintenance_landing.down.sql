UPDATE platform_settings
SET value = value || jsonb_build_object(
  'maintenance',
  COALESCE(value->'maintenance', '{}'::jsonb) - 'support_button_url'
)
WHERE key = 'landing_page';
