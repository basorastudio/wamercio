CREATE INDEX IF NOT EXISTS idx_tenants_status_created_at
  ON tenants (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_created_at
  ON subscriptions (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status_next_billing
  ON subscriptions (status, next_billing_at)
  WHERE next_billing_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_tenant_created_at
  ON platform_audit_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_action_created_at
  ON platform_audit_logs (action, created_at DESC);
