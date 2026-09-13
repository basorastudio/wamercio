-- Restaura el orden heredado únicamente cuando todavía conserva el orden
-- aplicado por Fase 3.
UPDATE platform_business_types SET sort_order = 30, updated_at = now() WHERE slug = 'tienda' AND sort_order = 10;
UPDATE platform_business_types SET sort_order = 40, updated_at = now() WHERE slug = 'supermercado' AND sort_order = 20;
UPDATE platform_business_types SET sort_order = 50, updated_at = now() WHERE slug = 'minimarket' AND sort_order = 30;
UPDATE platform_business_types SET sort_order = 10, updated_at = now() WHERE slug = 'provisiones' AND sort_order = 40;
UPDATE platform_business_types SET sort_order = 20, updated_at = now() WHERE slug = 'surtidora' AND sort_order = 50;

-- Reversión conservadora: elimina solo los tipos añadidos por la Fase 3 que
-- no estén asignados a ningún negocio. Nunca rompe tenants existentes.
DELETE FROM platform_business_types bt
WHERE bt.slug IN (
  'ferreteria','farmacia','restaurante','boutique','salon-belleza','barberia',
  'tecnologia-celulares','repuestos','taller-automotriz','panaderia-reposteria',
  'cafeteria','muebles-hogar','distribuidora-mayorista','tienda-variedades',
  'agropecuaria','veterinaria-pet-shop','papeleria-libreria','servicios-profesionales',
  'inmobiliaria','hotel-alojamiento','eventos-decoracion','courier-mensajeria','otro'
)
AND NOT EXISTS (
  SELECT 1 FROM tenants t WHERE t.metadata->>'business_type_id' = bt.id::text
);

UPDATE platform_settings
SET value = jsonb_set(value, '{badge_text}', to_jsonb('SaaS hecho en República Dominicana 🇩🇴'::text), true),
    updated_at = now()
WHERE key = 'landing_page'
  AND COALESCE(value->>'badge_text', '') = 'Comercio conversacional hecho en República Dominicana 🇩🇴';

UPDATE platform_settings
SET value = jsonb_set(value, '{hero_description}', to_jsonb('La plataforma todo en uno para comercios y negocios. Controla inventario, fiado, entregas a domicilio y vende en línea desde cualquier dispositivo.'::text), true),
    updated_at = now()
WHERE key = 'landing_page'
  AND COALESCE(value->>'hero_description', '') = 'La plataforma para negocios dominicanos que venden y atienden por WhatsApp. Organiza catálogo, pedidos, clientes, inventario, cobros y entregas desde un solo lugar.';

UPDATE platform_settings
SET value = jsonb_set(value, '{audience_title}', to_jsonb('Una plataforma para distintos tipos de comercio.'::text), true),
    updated_at = now()
WHERE key = 'landing_page'
  AND COALESCE(value->>'audience_title', '') = 'Comercio conversacional para distintos tipos de negocio.';

UPDATE platform_settings
SET value = jsonb_set(
              value,
              '{business_types}',
              '["Tiendas","Supermercados","Minimarkets","Provisiones","Surtidoras","Bodegas","Pulperías","Negocios con entrega local","Negocios con ventas fiadas","Comercios con cajeros","Comercios con repartidores","Propietarios con varios negocios"]'::jsonb,
              true
            ),
    updated_at = now()
WHERE key = 'landing_page'
  AND value->'business_types' = '["Tiendas","Supermercados","Ferreterías","Farmacias","Restaurantes","Boutiques","Salones y barberías","Tecnología y celulares","Repuestos y talleres","Distribuidoras","Servicios profesionales","Otros negocios"]'::jsonb;

UPDATE platform_settings
SET value = jsonb_set(
              jsonb_set(value, '{faqs,0,question}', to_jsonb('¿WAMERCIO sirve para diferentes tipos de negocio?'::text), true),
              '{faqs,0,answer}', to_jsonb('Sí. WAMERCIO está diseñado para tiendas, supermercados, minimarkets, provisiones, surtidoras, bodegas, pulperías y otros comercios.'::text), true
            ),
    updated_at = now()
WHERE key = 'landing_page'
  AND jsonb_typeof(value->'faqs') = 'array'
  AND jsonb_array_length(value->'faqs') > 0
  AND COALESCE(value#>>'{faqs,0,answer}', '') = 'Sí. WAMERCIO está pensado para comercios y servicios que venden o atienden por WhatsApp: tiendas, supermercados, ferreterías, farmacias, restaurantes, boutiques, salones, tecnología, repuestos, distribuidoras y muchos otros.';

UPDATE platform_settings
SET value = jsonb_set(value, '{hero_stat_value}', to_jsonb('Funda lista'::text), true),
    updated_at = now()
WHERE key = 'landing_page'
  AND COALESCE(value->>'hero_stat_value', '') = 'Pedido listo';

UPDATE platform_settings
SET value = jsonb_set(value, '{modules,1,title}', to_jsonb('Funda de compra'::text), true),
    updated_at = now()
WHERE key = 'landing_page'
  AND jsonb_typeof(value->'modules') = 'array'
  AND jsonb_array_length(value->'modules') > 1
  AND COALESCE(value#>>'{modules,1,title}', '') = 'Carrito de compra';

UPDATE platform_settings
SET value = jsonb_set(value, '{rd_tags}', '["RD$","Cédula","Funda","Fiado","Entrega por barrio","Provincias y municipios","Sectores y zonas de entrega","WhatsApp","Efectivo y transferencia","Comercio local","PWA"]'::jsonb, true),
    updated_at = now()
WHERE key = 'landing_page'
  AND value->'rd_tags' = '["RD$","Cédula","Pedidos por WhatsApp","Fiado","Entrega por barrio","Provincias y municipios","Sectores y zonas de entrega","WhatsApp","Efectivo y transferencia","Comercio local","PWA"]'::jsonb;

UPDATE platform_settings
SET value = jsonb_set(value, '{roles,3,text}', to_jsonb('Consulta productos, arma su funda, hace pedidos, revisa sus compras y puede ver su fiado.'::text), true),
    updated_at = now()
WHERE key = 'landing_page'
  AND jsonb_typeof(value->'roles') = 'array'
  AND jsonb_array_length(value->'roles') > 3
  AND COALESCE(value#>>'{roles,3,text}', '') = 'Consulta productos, arma su pedido, revisa sus compras y puede ver su fiado.';

UPDATE platform_settings
SET value = jsonb_set(value, '{steps,3,text}', to_jsonb('Los clientes agregan productos a la funda y envían pedidos organizados.'::text), true),
    updated_at = now()
WHERE key = 'landing_page'
  AND jsonb_typeof(value->'steps') = 'array'
  AND jsonb_array_length(value->'steps') > 3
  AND COALESCE(value#>>'{steps,3,text}', '') = 'Los clientes agregan productos y envían pedidos organizados.';
