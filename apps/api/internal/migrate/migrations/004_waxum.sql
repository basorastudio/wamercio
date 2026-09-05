CREATE TABLE IF NOT EXISTS whatsapp_events(
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id varchar(160) NOT NULL,
  event varchar(100) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_tenant_created ON whatsapp_events(tenant_id,created_at DESC);
