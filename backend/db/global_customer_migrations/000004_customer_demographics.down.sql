ALTER TABLE global_customers
  DROP CONSTRAINT IF EXISTS global_customers_gender_check,
  DROP COLUMN IF EXISTS gender,
  DROP COLUMN IF EXISTS birth_date;
