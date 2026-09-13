ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS customers_gender_check,
  DROP COLUMN IF EXISTS gender,
  DROP COLUMN IF EXISTS birth_date;
