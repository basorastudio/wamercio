-- Data-only migration. Self conversations cannot be restored safely and registered
-- customer/store relationships are intentionally preserved on rollback.
SELECT 1;
