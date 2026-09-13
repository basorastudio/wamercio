ALTER TABLE stores ALTER COLUMN primary_color SET DEFAULT '#36b385';
UPDATE stores SET primary_color='#36b385' WHERE lower(primary_color) IN ('#16a34a','#f59e0b','#fbbf24') OR primary_color IS NULL OR primary_color='';
