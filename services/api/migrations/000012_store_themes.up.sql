-- WAMERCIO 2.1: visual themes are independent from business templates.
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS visual_theme varchar(40) NOT NULL DEFAULT 'minimal-shop',
  ADD COLUMN IF NOT EXISTS theme_config jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE business_templates SET settings=jsonb_set(settings,'{visual_theme}',to_jsonb(CASE slug
  WHEN 'comida-rapida' THEN 'food-bold'
  WHEN 'pizzeria' THEN 'food-bold'
  WHEN 'reposteria' THEN 'food-bold'
  WHEN 'boutique' THEN 'editorial-fashion'
  WHEN 'cosmeticos' THEN 'beauty-soft'
  WHEN 'salon-belleza' THEN 'beauty-soft'
  WHEN 'barberia' THEN 'beauty-soft'
  WHEN 'floristeria' THEN 'beauty-soft'
  WHEN 'regalos-personalizados' THEN 'luxury'
  WHEN 'tecnologia' THEN 'tech-modern'
  WHEN 'suplementos' THEN 'tech-modern'
  WHEN 'ferreteria' THEN 'industrial-pro'
  WHEN 'repuestos' THEN 'industrial-pro'
  WHEN 'mayorista-distribuidor' THEN 'industrial-pro'
  WHEN 'pet-shop' THEN 'fresh-market'
  ELSE 'minimal-shop' END),true);

UPDATE stores st SET visual_theme=coalesce(nullif(bt.settings->>'visual_theme',''),'minimal-shop')
FROM business_templates bt WHERE st.template_id=bt.id;

-- Keep each existing merchant's current primary color as an explicit override.
UPDATE stores SET theme_config=jsonb_build_object('colors',jsonb_build_object('primary',primary_color))
WHERE theme_config='{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_stores_visual_theme ON stores(visual_theme);
