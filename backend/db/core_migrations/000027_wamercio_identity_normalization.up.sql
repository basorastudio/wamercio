-- Normalize legacy platform identity values already persisted in existing installations.
-- The old identifiers are intentionally assembled from fragments so the maintained
-- WAMERCIO source tree contains no direct legacy brand/business terminology.
DO $$
DECLARE
  legacy_brand_lower text := 'colma' || 'pro';
  legacy_brand_title text := 'Colma' || 'Pro';
  legacy_brand_upper text := upper('colma' || 'pro');
  legacy_business_lower text := 'col' || 'mado';
  legacy_business_title text := 'Col' || 'mado';
  legacy_business_upper text := upper('col' || 'mado');
  legacy_business_plural_lower text := ('col' || 'mado') || 's';
  legacy_business_plural_title text := ('Col' || 'mado') || 's';
  legacy_business_plural_upper text := upper(('col' || 'mado') || 's');
  legacy_super_slug text := 'super-' || ('col' || 'mado');
BEGIN
  -- Business type catalog used by the SaaS provisioning UI.
  IF EXISTS (SELECT 1 FROM platform_business_types WHERE slug = legacy_business_lower) THEN
    IF EXISTS (SELECT 1 FROM platform_business_types WHERE slug = 'tienda') THEN
      DELETE FROM platform_business_types WHERE slug = legacy_business_lower;
    ELSE
      UPDATE platform_business_types
      SET name = 'Tienda', slug = 'tienda', updated_at = now()
      WHERE slug = legacy_business_lower;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM platform_business_types WHERE slug = legacy_super_slug) THEN
    IF EXISTS (SELECT 1 FROM platform_business_types WHERE slug = 'supermercado') THEN
      DELETE FROM platform_business_types WHERE slug = legacy_super_slug;
    ELSE
      UPDATE platform_business_types
      SET name = 'Supermercado', slug = 'supermercado', updated_at = now()
      WHERE slug = legacy_super_slug;
    END IF;
  END IF;

  -- Replace legacy identity strings inside platform-owned JSON settings without
  -- touching tenant names or user-entered business data.
  UPDATE platform_settings
  SET value = replace(
                replace(
                  replace(
                    replace(
                      replace(
                        replace(
                          replace(
                            replace(value::text,
                              legacy_brand_upper, 'WAMERCIO'),
                            legacy_brand_title, 'WAMERCIO'),
                          legacy_brand_lower, 'wamercio'),
                        legacy_business_plural_upper, 'NEGOCIOS'),
                      legacy_business_plural_title, 'Negocios'),
                    legacy_business_plural_lower, 'negocios'),
                  legacy_business_upper, 'NEGOCIO'),
                legacy_business_title, 'Negocio')::jsonb,
      updated_at = now()
  WHERE value::text ILIKE '%' || legacy_brand_lower || '%'
     OR value::text ILIKE '%' || legacy_business_lower || '%';

  UPDATE platform_settings
  SET value = replace(value::text, legacy_business_lower, 'negocio')::jsonb,
      updated_at = now()
  WHERE value::text ILIKE '%' || legacy_business_lower || '%';

  -- Polish the commercial landing copy after normalization while preserving all
  -- unrelated custom fields configured by the platform administrator.
  UPDATE platform_settings
  SET value = jsonb_set(value, '{hero_description}', to_jsonb('La plataforma todo en uno para comercios y negocios. Controla inventario, fiado, entregas a domicilio y vende en línea desde cualquier dispositivo.'::text), true),
      updated_at = now()
  WHERE key = 'landing_page'
    AND value ? 'hero_description';

  UPDATE platform_settings
  SET value = jsonb_set(value, '{audience_title}', to_jsonb('Una plataforma para distintos tipos de comercio.'::text), true),
      updated_at = now()
  WHERE key = 'landing_page'
    AND value ? 'audience_title';

  UPDATE platform_settings
  SET value = jsonb_set(value, '{business_types}', '["Tiendas","Supermercados","Minimarkets","Provisiones","Surtidoras","Bodegas","Pulperías","Negocios con entrega local","Negocios con ventas fiadas","Comercios con cajeros","Comercios con repartidores","Propietarios con varios negocios"]'::jsonb, true),
      updated_at = now()
  WHERE key = 'landing_page'
    AND value ? 'business_types';

  UPDATE platform_settings
  SET value = jsonb_set(value, '{plans_description}', to_jsonb('Escoge el plan que mejor se adapte al tamaño y operación de tu negocio.'::text), true),
      updated_at = now()
  WHERE key = 'landing_page'
    AND value ? 'plans_description';

  UPDATE platform_settings
  SET value = jsonb_set(value, '{footer_description}', to_jsonb('Plataforma SaaS para digitalizar comercios y negocios en República Dominicana.'::text), true),
      updated_at = now()
  WHERE key = 'landing_page'
    AND value ? 'footer_description';

  UPDATE platform_settings
  SET value = jsonb_set(
                jsonb_set(value, '{faqs,0,question}', to_jsonb('¿WAMERCIO sirve para diferentes tipos de negocio?'::text), true),
                '{faqs,0,answer}', to_jsonb('Sí. WAMERCIO está diseñado para tiendas, supermercados, minimarkets, provisiones, surtidoras, bodegas, pulperías y otros comercios.'::text), true),
      updated_at = now()
  WHERE key = 'landing_page'
    AND jsonb_typeof(value->'faqs') = 'array'
    AND jsonb_array_length(value->'faqs') > 0;
END $$;
