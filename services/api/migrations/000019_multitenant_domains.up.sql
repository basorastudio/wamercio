-- WAMERCIO 2.5.0: publicación multi-tenant por host y dominios personalizados.

CREATE TABLE IF NOT EXISTS store_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  hostname varchar(253) NOT NULL,
  verification_token varchar(96) NOT NULL DEFAULT encode(gen_random_bytes(24),'hex'),
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','active','failed')),
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(hostname)
);
CREATE INDEX IF NOT EXISTS idx_store_domains_store ON store_domains(store_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_domains_one_primary
  ON store_domains(store_id)
  WHERE is_primary=true AND status='active';

UPDATE platform_settings AS p
SET value = jsonb_build_object(
      'route_mode','host',
      'platform_domain','wamercio.com',
      'tenant_domain','ltd.do',
      'custom_domains_enabled',true,
      'custom_domain_cname_target','domains.ltd.do',
      'force_https',true,
      'reserved_subdomains',(
        SELECT jsonb_agg(name ORDER BY name)
        FROM (
          SELECT value AS name FROM jsonb_array_elements_text(coalesce(p.value->'reserved_subdomains','[]'::jsonb))
          UNION
          SELECT unnest(ARRAY['www','api','admin','proyecto','geo','id','waxum','catalogo','terminos','privacidad','cliente','domains'])
        ) reserved
      )
    ),
    updated_at=now()
WHERE key='domains';

INSERT INTO platform_settings(key,value)
SELECT 'domains','{"route_mode":"host","platform_domain":"wamercio.com","tenant_domain":"ltd.do","custom_domains_enabled":true,"custom_domain_cname_target":"domains.ltd.do","force_https":true,"reserved_subdomains":["www","api","admin","proyecto","geo","id","waxum","catalogo","terminos","privacidad","cliente","domains"]}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE key='domains');

CREATE TABLE IF NOT EXISTS customer_sso_tokens (
  token_hash char(64) PRIMARY KEY,
  global_customer_id uuid NOT NULL REFERENCES global_customers(id) ON DELETE CASCADE,
  target_hostname varchar(253) NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_sso_tokens_expiry ON customer_sso_tokens(expires_at) WHERE used_at IS NULL;
