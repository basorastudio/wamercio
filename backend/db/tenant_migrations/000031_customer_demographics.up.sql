ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS birth_date text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT '';

ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS customers_gender_check;

ALTER TABLE customers
  ADD CONSTRAINT customers_gender_check
  CHECK (gender IN ('', 'M', 'F'));
