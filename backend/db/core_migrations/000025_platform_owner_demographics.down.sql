ALTER TABLE platform_owners
  DROP CONSTRAINT IF EXISTS platform_owners_gender_check,
  DROP COLUMN IF EXISTS gender,
  DROP COLUMN IF EXISTS birth_date;
