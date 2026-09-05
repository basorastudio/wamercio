CREATE TABLE IF NOT EXISTS system_settings(
  key varchar(120) PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO system_settings(key,value) VALUES
('platform_name','wamercio'),
('support_whatsapp',''),
('support_email',''),
('default_accent','#ff5400'),
('terms_url',''),
('privacy_url','')
ON CONFLICT(key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_users_tenant_role ON users(tenant_id,role);
CREATE INDEX IF NOT EXISTS idx_tenants_affiliate ON tenants(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_expires ON subscriptions(status,expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_print ON orders(tenant_id,print_status,created_at);
