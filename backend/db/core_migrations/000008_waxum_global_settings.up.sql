INSERT INTO platform_settings (key, value, updated_at)
VALUES ('waxum', '{
  "enabled": true,
  "public_url": "https://waxum.ltd.do",
  "dashboard_url": "https://waxum.ltd.do",
  "docs_url": "https://waxum.ltd.do/swagger-ui/",
  "admin_token": ""
}'::jsonb, now())
ON CONFLICT (key) DO UPDATE SET
  value = platform_settings.value || (EXCLUDED.value - 'admin_token'),
  updated_at = now();
