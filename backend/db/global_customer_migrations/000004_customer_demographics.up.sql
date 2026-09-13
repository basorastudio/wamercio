ALTER TABLE global_customers
  ADD COLUMN IF NOT EXISTS birth_date text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT '';

ALTER TABLE global_customers
  DROP CONSTRAINT IF EXISTS global_customers_gender_check;

ALTER TABLE global_customers
  ADD CONSTRAINT global_customers_gender_check
  CHECK (gender IN ('', 'M', 'F'));
