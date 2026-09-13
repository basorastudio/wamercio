CREATE TABLE IF NOT EXISTS customer_recovery_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES global_customers(id) ON DELETE CASCADE,
  whatsapp_digits text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  used_at timestamptz,
  requested_ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_recovery_customer_date
  ON customer_recovery_challenges(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_recovery_expires
  ON customer_recovery_challenges(expires_at) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS global_customer_legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES global_customers(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('terms', 'privacy', 'data_processing')),
  document_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address inet,
  user_agent text NOT NULL DEFAULT '',
  UNIQUE(customer_id, document_type, document_version)
);
