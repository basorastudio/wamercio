INSERT INTO platform_settings (key, value, updated_at)
VALUES (
  'backups',
  '{
    "enabled": true,
    "schedule": "15 3 * * *",
    "timezone": "America/Santo_Domingo",
    "retention_daily": 7,
    "retention_weekly": 4,
    "retention_monthly": 12,
    "encryption": "restic",
    "restic_password": "",
    "primary": {
      "enabled": true,
      "provider": "contabo",
      "endpoint": "",
      "region": "default",
      "bucket": "",
      "access_key": "",
      "secret_key": "",
      "prefix": "colmapro/primary"
    },
    "secondary": {
      "enabled": true,
      "provider": "cloudflare_r2",
      "endpoint": "",
      "account_id": "",
      "region": "auto",
      "bucket": "",
      "access_key": "",
      "secret_key": "",
      "prefix": "colmapro/critical"
    }
  }'::jsonb,
  now()
)
ON CONFLICT (key) DO NOTHING;
