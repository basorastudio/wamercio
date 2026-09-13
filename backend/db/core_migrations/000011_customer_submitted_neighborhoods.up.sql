ALTER TABLE territory_custom_neighborhoods
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'support',
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS original_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS submitted_tenant_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS submitted_tenant_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS submitted_by text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS submission_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_submitted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by text NOT NULL DEFAULT '';

UPDATE territory_custom_neighborhoods
SET source = COALESCE(NULLIF(source, ''), 'support'),
    review_status = COALESCE(NULLIF(review_status, ''), 'approved'),
    original_name = COALESCE(NULLIF(original_name, ''), name),
    submission_count = GREATEST(COALESCE(submission_count, 1), 1),
    last_submitted_at = COALESCE(last_submitted_at, created_at, now());

CREATE INDEX IF NOT EXISTS idx_core_territory_custom_neighborhoods_review_status
  ON territory_custom_neighborhoods (review_status, last_submitted_at DESC);
