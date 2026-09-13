CREATE TABLE IF NOT EXISTS platform_account_recovery_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('platform','owner')),
  subject_id text NOT NULL,
  whatsapp_digits text NOT NULL,
  code_hash text NOT NULL DEFAULT '',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  used_at timestamptz,
  requested_ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_account_recovery_subject_date
  ON platform_account_recovery_challenges(subject_type, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_account_recovery_expires
  ON platform_account_recovery_challenges(expires_at)
  WHERE used_at IS NULL;
