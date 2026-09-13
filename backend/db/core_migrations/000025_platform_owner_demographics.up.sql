ALTER TABLE platform_owners
  ADD COLUMN IF NOT EXISTS birth_date text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT '';

ALTER TABLE platform_owners
  DROP CONSTRAINT IF EXISTS platform_owners_gender_check;

ALTER TABLE platform_owners
  ADD CONSTRAINT platform_owners_gender_check
  CHECK (gender IN ('', 'M', 'F'));
