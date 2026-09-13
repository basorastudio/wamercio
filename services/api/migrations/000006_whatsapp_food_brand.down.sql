ALTER TABLE stores ALTER COLUMN primary_color SET DEFAULT '#16a34a';
UPDATE stores SET primary_color='#16a34a' WHERE lower(primary_color)='#36b385';
