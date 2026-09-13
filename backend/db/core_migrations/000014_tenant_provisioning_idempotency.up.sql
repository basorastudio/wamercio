CREATE TABLE IF NOT EXISTS tenant_provisioning_requests (
  owner_id uuid NOT NULL REFERENCES platform_owners(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'processing',
  stage text NOT NULL DEFAULT 'requested',
  stage_history jsonb NOT NULL DEFAULT '["requested"]'::jsonb,
  lease_expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, idempotency_key),
  CONSTRAINT tenant_provisioning_key_length CHECK (char_length(idempotency_key) BETWEEN 1 AND 128),
  CONSTRAINT tenant_provisioning_status_check CHECK (status IN ('processing', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_tenant_provisioning_requests_cleanup
  ON tenant_provisioning_requests (status, updated_at);
