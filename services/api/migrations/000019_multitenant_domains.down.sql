DROP TABLE IF EXISTS customer_sso_tokens;
DROP TABLE IF EXISTS store_domains;
UPDATE platform_settings
SET value = jsonb_build_object(
      'route_mode','path',
      'reserved_subdomains',coalesce(value->'reserved_subdomains','[]'::jsonb)
    ),
    updated_at=now()
WHERE key='domains';
