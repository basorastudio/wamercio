UPDATE platform_settings
SET value = (
  CASE
    WHEN value->>'brand_subtitle' = 'Plataforma SaaS'
      THEN jsonb_set(value, '{brand_subtitle}', '""'::jsonb, true)
    ELSE value
  END
) || jsonb_build_object(
  'maintenance',
  (COALESCE(value->'maintenance', '{}'::jsonb) - 'estimated_return') || jsonb_build_object(
    'support_button_text', 'Entrar al panel de administración',
    'support_button_url', '#/admin'
  )
)
WHERE key = 'landing_page';
