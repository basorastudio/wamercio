UPDATE platform_settings
SET value = value || jsonb_build_object(
  'dashboard_url', rtrim(value->>'public_url', '/') || '/dashboard',
  'docs_url', rtrim(value->>'public_url', '/') || '/swagger-ui/'
),
updated_at = now()
WHERE key = 'waxum'
  AND COALESCE(btrim(value->>'public_url'), '') <> '';
