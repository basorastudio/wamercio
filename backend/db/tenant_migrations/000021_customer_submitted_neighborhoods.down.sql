DROP INDEX IF EXISTS idx_territory_custom_neighborhoods_review_status;
ALTER TABLE territory_custom_neighborhoods
  DROP COLUMN IF EXISTS reviewed_by,
  DROP COLUMN IF EXISTS reviewed_at,
  DROP COLUMN IF EXISTS last_submitted_at,
  DROP COLUMN IF EXISTS submission_count,
  DROP COLUMN IF EXISTS submitted_by,
  DROP COLUMN IF EXISTS submitted_tenant_name,
  DROP COLUMN IF EXISTS submitted_tenant_id,
  DROP COLUMN IF EXISTS original_name,
  DROP COLUMN IF EXISTS review_status,
  DROP COLUMN IF EXISTS source;
