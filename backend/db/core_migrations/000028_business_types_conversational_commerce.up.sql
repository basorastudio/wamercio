-- WAMERCIO Fase 3: amplía el catálogo de tipos de negocio sin convertirlo en
-- una taxonomía compleja. Los slugs existentes se preservan para mantener
-- compatibilidad con negocios ya creados.

-- Ordena de forma más intuitiva los siete tipos heredados, pero solo si
-- conservan el orden estándar anterior; así no se pisan personalizaciones.
UPDATE platform_business_types SET sort_order = 10, updated_at = now() WHERE slug = 'tienda' AND sort_order = 30;
UPDATE platform_business_types SET sort_order = 20, updated_at = now() WHERE slug = 'supermercado' AND sort_order = 40;
UPDATE platform_business_types SET sort_order = 30, updated_at = now() WHERE slug = 'minimarket' AND sort_order = 50;
UPDATE platform_business_types SET sort_order = 40, updated_at = now() WHERE slug = 'provisiones' AND sort_order = 10;
UPDATE platform_business_types SET sort_order = 50, updated_at = now() WHERE slug = 'surtidora' AND sort_order = 20;

INSERT INTO platform_business_types (name, slug, domain_suffix, emoji, sort_order, active)
VALUES
  ('Ferretería', 'ferreteria', '.ltd.do', '🔨', 80, true),
  ('Farmacia', 'farmacia', '.ltd.do', '💊', 90, true),
  ('Restaurante', 'restaurante', '.ltd.do', '🍽️', 100, true),
  ('Boutique / Moda', 'boutique', '.ltd.do', '👗', 110, true),
  ('Salón de belleza', 'salon-belleza', '.ltd.do', '💇', 120, true),
  ('Barbería', 'barberia', '.ltd.do', '💈', 130, true),
  ('Tecnología y celulares', 'tecnologia-celulares', '.ltd.do', '📱', 140, true),
  ('Repuestos', 'repuestos', '.ltd.do', '⚙️', 150, true),
  ('Taller automotriz', 'taller-automotriz', '.ltd.do', '🔧', 160, true),
  ('Panadería / Repostería', 'panaderia-reposteria', '.ltd.do', '🥖', 170, true),
  ('Cafetería', 'cafeteria', '.ltd.do', '☕', 180, true),
  ('Muebles y hogar', 'muebles-hogar', '.ltd.do', '🛋️', 190, true),
  ('Distribuidora / Mayorista', 'distribuidora-mayorista', '.ltd.do', '📦', 200, true),
  ('Tienda de variedades', 'tienda-variedades', '.ltd.do', '🎁', 210, true),
  ('Agropecuaria', 'agropecuaria', '.ltd.do', '🌱', 220, true),
  ('Veterinaria / Pet shop', 'veterinaria-pet-shop', '.ltd.do', '🐾', 230, true),
  ('Papelería / Librería', 'papeleria-libreria', '.ltd.do', '📚', 240, true),
  ('Servicios profesionales', 'servicios-profesionales', '.ltd.do', '💼', 250, true),
  ('Inmobiliaria', 'inmobiliaria', '.ltd.do', '🏢', 260, true),
  ('Hotel / Alojamiento', 'hotel-alojamiento', '.ltd.do', '🏨', 270, true),
  ('Eventos / Decoración', 'eventos-decoracion', '.ltd.do', '🎉', 280, true),
  ('Courier / Mensajería', 'courier-mensajeria', '.ltd.do', '🚚', 290, true),
  ('Otro tipo de negocio', 'otro', '.ltd.do', '🏪', 999, true)
ON CONFLICT (slug) DO UPDATE
SET domain_suffix = EXCLUDED.domain_suffix,
    emoji = EXCLUDED.emoji,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

-- La landing debe mostrar tipos de negocio, no capacidades operativas como
-- delivery, fiado, cajeros o repartidores. Se actualizan solo valores que
-- todavía conservan el copy estándar de la fase anterior, para no pisar
-- personalizaciones realizadas por el administrador.
UPDATE platform_settings
SET value = jsonb_set(value, '{badge_text}', to_jsonb('Comercio conversacional hecho en República Dominicana 🇩🇴'::text), true),
    updated_at = now()
WHERE key = 'landing_page'
  AND COALESCE(value->>'badge_text', '') = 'SaaS hecho en República Dominicana 🇩🇴';

UPDATE platform_settings
SET value = jsonb_set(value, '{hero_description}', to_jsonb('La plataforma para negocios dominicanos que venden y atienden por WhatsApp. Organiza catálogo, pedidos, clientes, inventario, cobros y entregas desde un solo lugar.'::text), true),
    updated_at = now()
WHERE key = 'landing_page'
  AND COALESCE(value->>'hero_description', '') = 'La plataforma todo en uno para comercios y negocios. Controla inventario, fiado, entregas a domicilio y vende en línea desde cualquier dispositivo.';

UPDATE platform_settings
SET value = jsonb_set(value, '{audience_title}', to_jsonb('Comercio conversacional para distintos tipos de negocio.'::text), true),
    updated_at = now()
WHERE key = 'landing_page'
  AND COALESCE(value->>'audience_title', '') = 'Una plataforma para distintos tipos de comercio.';

UPDATE platform_settings
SET value = jsonb_set(
              value,
              '{business_types}',
              '["Tiendas","Supermercados","Ferreterías","Farmacias","Restaurantes","Boutiques","Salones y barberías","Tecnología y celulares","Repuestos y talleres","Distribuidoras","Servicios profesionales","Otros negocios"]'::jsonb,
              true
            ),
    updated_at = now()
WHERE key = 'landing_page'
  AND value->'business_types' = '["Tiendas","Supermercados","Minimarkets","Provisiones","Surtidoras","Bodegas","Pulperías","Negocios con entrega local","Negocios con ventas fiadas","Comercios con cajeros","Comercios con repartidores","Propietarios con varios negocios"]'::jsonb;

UPDATE platform_settings
SET value = jsonb_set(
              jsonb_set(value, '{faqs,0,question}', to_jsonb('¿WAMERCIO sirve para diferentes tipos de negocio?'::text), true),
              '{faqs,0,answer}', to_jsonb('Sí. WAMERCIO está pensado para comercios y servicios que venden o atienden por WhatsApp: tiendas, supermercados, ferreterías, farmacias, restaurantes, boutiques, salones, tecnología, repuestos, distribuidoras y muchos otros.'::text), true
            ),
    updated_at = now()
WHERE key = 'landing_page'
  AND jsonb_typeof(value->'faqs') = 'array'
  AND jsonb_array_length(value->'faqs') > 0
  AND COALESCE(value#>>'{faqs,0,question}', '') = '¿WAMERCIO sirve para diferentes tipos de negocio?'
  AND COALESCE(value#>>'{faqs,0,answer}', '') = 'Sí. WAMERCIO está diseñado para tiendas, supermercados, minimarkets, provisiones, surtidoras, bodegas, pulperías y otros comercios.';

-- Ajustes de copy visibles para que la landing no parezca limitada a compras de
-- comestibles. Se preservan los modismos funcionales dentro de la aplicación;
-- aquí solo se generaliza la presentación comercial.
UPDATE platform_settings
SET value = jsonb_set(value, '{hero_stat_value}', to_jsonb('Pedido listo'::text), true),
    updated_at = now()
WHERE key = 'landing_page'
  AND COALESCE(value->>'hero_stat_value', '') = 'Funda lista';

UPDATE platform_settings
SET value = jsonb_set(
              jsonb_set(value, '{modules,1,title}', to_jsonb('Carrito de compra'::text), true),
              '{modules,1,text}', to_jsonb('Experiencia intuitiva para armar pedidos y enviarlos por WhatsApp.'::text), true
            ),
    updated_at = now()
WHERE key = 'landing_page'
  AND jsonb_typeof(value->'modules') = 'array'
  AND jsonb_array_length(value->'modules') > 1
  AND COALESCE(value#>>'{modules,1,title}', '') = 'Funda de compra';

UPDATE platform_settings
SET value = jsonb_set(value, '{rd_tags}', '["RD$","Cédula","Pedidos por WhatsApp","Fiado","Entrega por barrio","Provincias y municipios","Sectores y zonas de entrega","WhatsApp","Efectivo y transferencia","Comercio local","PWA"]'::jsonb, true),
    updated_at = now()
WHERE key = 'landing_page'
  AND value->'rd_tags' = '["RD$","Cédula","Funda","Fiado","Entrega por barrio","Provincias y municipios","Sectores y zonas de entrega","WhatsApp","Efectivo y transferencia","Comercio local","PWA"]'::jsonb;

UPDATE platform_settings
SET value = jsonb_set(value, '{roles,3,text}', to_jsonb('Consulta productos, arma su pedido, revisa sus compras y puede ver su fiado.'::text), true),
    updated_at = now()
WHERE key = 'landing_page'
  AND jsonb_typeof(value->'roles') = 'array'
  AND jsonb_array_length(value->'roles') > 3
  AND COALESCE(value#>>'{roles,3,text}', '') = 'Consulta productos, arma su funda, hace pedidos, revisa sus compras y puede ver su fiado.';

UPDATE platform_settings
SET value = jsonb_set(value, '{steps,3,text}', to_jsonb('Los clientes agregan productos y envían pedidos organizados.'::text), true),
    updated_at = now()
WHERE key = 'landing_page'
  AND jsonb_typeof(value->'steps') = 'array'
  AND jsonb_array_length(value->'steps') > 3
  AND COALESCE(value#>>'{steps,3,text}', '') = 'Los clientes agregan productos a la funda y envían pedidos organizados.';
