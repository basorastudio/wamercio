-- WAMERCIO 1.5: merchant/customer flows are WhatsApp-first.
-- Email remains only on users for the SuperAdmin account.

UPDATE users SET email=NULL WHERE role<>'superadmin';

ALTER TABLE stores DROP COLUMN IF EXISTS email;
ALTER TABLE customers DROP COLUMN IF EXISTS email;
ALTER TABLE orders DROP COLUMN IF EXISTS customer_email;
