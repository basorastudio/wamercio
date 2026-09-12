-- WAMERCIO 2.0: prebuilt business templates for WhatsApp-first commerce.
CREATE TABLE IF NOT EXISTS business_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(120) UNIQUE NOT NULL,
  name varchar(160) NOT NULL,
  family varchar(100) NOT NULL,
  description text,
  icon varchar(20),
  engine varchar(40) NOT NULL DEFAULT 'retail',
  recommended_style varchar(40) NOT NULL DEFAULT 'Minimal',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_featured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_business_templates_active ON business_templates(is_active,sort_order,name);
CREATE INDEX IF NOT EXISTS idx_business_templates_family ON business_templates(family,sort_order,name);

CREATE TABLE IF NOT EXISTS template_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES business_templates(id) ON DELETE CASCADE,
  name varchar(140) NOT NULL,
  slug varchar(140) NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE(template_id,slug)
);

CREATE TABLE IF NOT EXISTS template_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES business_templates(id) ON DELETE CASCADE,
  category_slug varchar(140),
  name varchar(180) NOT NULL,
  slug varchar(180) NOT NULL,
  description text,
  image_url text,
  price numeric(12,2) NOT NULL DEFAULT 0,
  track_stock boolean NOT NULL DEFAULT false,
  variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  extras jsonb NOT NULL DEFAULT '[]'::jsonb,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_featured boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE(template_id,slug)
);

CREATE TABLE IF NOT EXISTS template_attribute_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES business_templates(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE(template_id,name)
);

CREATE TABLE IF NOT EXISTS template_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES business_templates(id) ON DELETE CASCADE,
  group_id uuid REFERENCES template_attribute_groups(id) ON DELETE CASCADE,
  key varchar(80) NOT NULL,
  label varchar(120) NOT NULL,
  input_type varchar(20) NOT NULL DEFAULT 'text',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_required boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE(template_id,key)
);

CREATE TABLE IF NOT EXISTS store_attribute_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE(store_id,name)
);

CREATE TABLE IF NOT EXISTS store_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  group_id uuid REFERENCES store_attribute_groups(id) ON DELETE CASCADE,
  key varchar(80) NOT NULL,
  label varchar(120) NOT NULL,
  input_type varchar(20) NOT NULL DEFAULT 'text',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_required boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE(store_id,key)
);
CREATE INDEX IF NOT EXISTS idx_store_attributes_store ON store_attributes(store_id,sort_order,label);

CREATE TABLE IF NOT EXISTS template_quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES business_templates(id) ON DELETE CASCADE,
  shortcut varchar(60) NOT NULL,
  title varchar(120) NOT NULL,
  message text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE(template_id,shortcut)
);

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES business_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS business_engine varchar(40) NOT NULL DEFAULT 'retail',
  ADD COLUMN IF NOT EXISTS template_config jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_stores_template ON stores(template_id);

ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS flow_type varchar(20) NOT NULL DEFAULT 'order',
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;


INSERT INTO business_templates(slug,name,family,description,icon,engine,recommended_style,settings,is_featured,is_active,sort_order)
VALUES('comida-rapida','Comida rápida','Comida','Combos, platos, bebidas y extras con pedidos rápidos por WhatsApp.','🍔','food','Fresh','{"item_label":"plato","item_label_plural":"platos","primary_action":"Pedir","delivery_enabled":true,"pickup_enabled":true,"track_stock_default":false,"supports_extras":true,"supports_variants":true,"order_notice":"Confirma disponibilidad y tiempo de entrega por WhatsApp.","accent":"#36b385"}'::jsonb,true,true,10)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,family=excluded.family,description=excluded.description,icon=excluded.icon,engine=excluded.engine,recommended_style=excluded.recommended_style,settings=excluded.settings,is_featured=excluded.is_featured,sort_order=excluded.sort_order,updated_at=now();

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Combos','combos',10 FROM business_templates WHERE slug='comida-rapida'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Platos','platos',20 FROM business_templates WHERE slug='comida-rapida'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Acompañantes','acompanantes',30 FROM business_templates WHERE slug='comida-rapida'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Bebidas','bebidas',40 FROM business_templates WHERE slug='comida-rapida'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Postres','postres',50 FROM business_templates WHERE slug='comida-rapida'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'combos','Combo personal','combo-personal','Plato principal, acompañante y bebida.',350,false,'[{"name":"Grande","price":100}]'::jsonb,'[{"name":"Extra de queso","price":60},{"name":"Papas extra","price":75}]'::jsonb,true,10
FROM business_templates WHERE slug='comida-rapida'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'platos','Hamburguesa clásica','hamburguesa-clasica','Carne, queso y vegetales.',275,false,'[{"name":"Doble","price":120}]'::jsonb,'[{"name":"Tocineta","price":75}]'::jsonb,false,20
FROM business_templates WHERE slug='comida-rapida'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'acompanantes','Papas fritas','papas-fritas','Porción crujiente.',125,false,'[{"name":"Grande","price":60}]'::jsonb,'[]'::jsonb,false,30
FROM business_templates WHERE slug='comida-rapida'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'bebidas','Refresco','refresco','Bebida fría.',75,false,'[{"name":"16 oz","price":0},{"name":"20 oz","price":25}]'::jsonb,'[]'::jsonb,false,40
FROM business_templates WHERE slug='comida-rapida'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'hola','Bienvenida','¡Hola! 👋 Gracias por escribirnos. ¿Qué te gustaría ordenar hoy?',10 FROM business_templates WHERE slug='comida-rapida'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'confirmado','Pedido confirmado','✅ Tu pedido está confirmado.',20 FROM business_templates WHERE slug='comida-rapida'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'preparando','En preparación','👨‍🍳 Tu pedido ya está en preparación.',30 FROM business_templates WHERE slug='comida-rapida'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'camino','En camino','🛵 Tu pedido está en camino.',40 FROM business_templates WHERE slug='comida-rapida'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO business_templates(slug,name,family,description,icon,engine,recommended_style,settings,is_featured,is_active,sort_order)
VALUES('pizzeria','Pizzería','Comida','Pizzas por tamaño, ingredientes extra, combos y delivery.','🍕','food','Fresh','{"item_label":"pizza","item_label_plural":"pizzas","primary_action":"Pedir","delivery_enabled":true,"pickup_enabled":true,"track_stock_default":false,"supports_extras":true,"supports_variants":true,"accent":"#36b385"}'::jsonb,true,true,20)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,family=excluded.family,description=excluded.description,icon=excluded.icon,engine=excluded.engine,recommended_style=excluded.recommended_style,settings=excluded.settings,is_featured=excluded.is_featured,sort_order=excluded.sort_order,updated_at=now();

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Pizzas','pizzas',10 FROM business_templates WHERE slug='pizzeria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Combos','combos',20 FROM business_templates WHERE slug='pizzeria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Entradas','entradas',30 FROM business_templates WHERE slug='pizzeria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Bebidas','bebidas',40 FROM business_templates WHERE slug='pizzeria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Postres','postres',50 FROM business_templates WHERE slug='pizzeria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'pizzas','Pizza Pepperoni','pizza-pepperoni','Pizza de pepperoni y queso.',450,false,'[{"name":"Mediana","price":200},{"name":"Familiar","price":400}]'::jsonb,'[{"name":"Queso extra","price":75},{"name":"Pepperoni extra","price":100}]'::jsonb,true,10
FROM business_templates WHERE slug='pizzeria'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'pizzas','Pizza Suprema','pizza-suprema','Vegetales, jamón, pepperoni y queso.',525,false,'[{"name":"Mediana","price":225},{"name":"Familiar","price":450}]'::jsonb,'[{"name":"Maíz","price":50},{"name":"Queso extra","price":75}]'::jsonb,false,20
FROM business_templates WHERE slug='pizzeria'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'entradas','Pan de ajo','pan-de-ajo','Pan horneado con ajo y mantequilla.',150,false,'[]'::jsonb,'[{"name":"Queso","price":65}]'::jsonb,false,30
FROM business_templates WHERE slug='pizzeria'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'bebidas','Refresco','refresco','Bebida fría.',75,false,'[{"name":"16 oz","price":0},{"name":"1 litro","price":100}]'::jsonb,'[]'::jsonb,false,40
FROM business_templates WHERE slug='pizzeria'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'hola','Bienvenida','🍕 ¡Hola! ¿Qué pizza te gustaría ordenar?',10 FROM business_templates WHERE slug='pizzeria'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'preparando','En preparación','👨‍🍳 Tu pizza ya está en preparación.',20 FROM business_templates WHERE slug='pizzeria'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'lista','Lista','✅ Tu orden está lista.',30 FROM business_templates WHERE slug='pizzeria'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'camino','En camino','🛵 Tu delivery ya salió.',40 FROM business_templates WHERE slug='pizzeria'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO business_templates(slug,name,family,description,icon,engine,recommended_style,settings,is_featured,is_active,sort_order)
VALUES('reposteria','Repostería','Comida','Bizcochos, postres y pedidos personalizados con fecha de entrega.','🍰','food','Warm','{"item_label":"producto","item_label_plural":"productos","primary_action":"Reservar pedido","delivery_enabled":true,"pickup_enabled":true,"track_stock_default":false,"supports_extras":true,"supports_variants":true,"requires_lead_time":true,"accent":"#d96f87","checkout_fields":[{"key":"fecha_requerida","label":"Fecha requerida","type":"date","required":true},{"key":"porciones","label":"Cantidad aproximada de porciones","type":"number","required":false},{"key":"detalle_personalizado","label":"Texto o detalle personalizado","type":"text","required":false}]}'::jsonb,true,true,30)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,family=excluded.family,description=excluded.description,icon=excluded.icon,engine=excluded.engine,recommended_style=excluded.recommended_style,settings=excluded.settings,is_featured=excluded.is_featured,sort_order=excluded.sort_order,updated_at=now();

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Bizcochos','bizcochos',10 FROM business_templates WHERE slug='reposteria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Cupcakes','cupcakes',20 FROM business_templates WHERE slug='reposteria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Postres','postres',30 FROM business_templates WHERE slug='reposteria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Bandejas','bandejas',40 FROM business_templates WHERE slug='reposteria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Personalizados','personalizados',50 FROM business_templates WHERE slug='reposteria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'bizcochos','Bizcocho de vainilla','bizcocho-de-vainilla','Bizcocho decorado para celebraciones.',1200,false,'[{"name":"15 porciones","price":0},{"name":"25 porciones","price":650},{"name":"40 porciones","price":1400}]'::jsonb,'[{"name":"Relleno de dulce de leche","price":250},{"name":"Topper personalizado","price":300}]'::jsonb,true,10
FROM business_templates WHERE slug='reposteria'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'cupcakes','Cupcakes x6','cupcakes-x6','Seis cupcakes decorados.',450,false,'[{"name":"Vainilla","price":0},{"name":"Chocolate","price":50}]'::jsonb,'[]'::jsonb,false,20
FROM business_templates WHERE slug='reposteria'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'postres','Tres leches','tres-leches','Postre húmedo de tres leches.',650,false,'[{"name":"Mediano","price":0},{"name":"Grande","price":450}]'::jsonb,'[]'::jsonb,false,30
FROM business_templates WHERE slug='reposteria'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'fecha','Fecha del pedido','🎂 ¿Para qué fecha necesitas tu pedido?',10 FROM business_templates WHERE slug='reposteria'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'referencia','Imagen de referencia','🎨 Puedes enviarnos una imagen de referencia.',20 FROM business_templates WHERE slug='reposteria'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'anticipacion','Anticipación','📅 Recomendamos reservar con anticipación para asegurar disponibilidad.',30 FROM business_templates WHERE slug='reposteria'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO business_templates(slug,name,family,description,icon,engine,recommended_style,settings,is_featured,is_active,sort_order)
VALUES('boutique','Boutique','Moda','Prendas, tallas, colores y stock por variante para vender por WhatsApp.','👗','fashion','Elegant','{"item_label":"prenda","item_label_plural":"prendas","primary_action":"Comprar","delivery_enabled":true,"pickup_enabled":true,"track_stock_default":true,"supports_extras":false,"supports_variants":true,"variant_hint":"Talla / Color","accent":"#8b6fb4"}'::jsonb,true,true,40)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,family=excluded.family,description=excluded.description,icon=excluded.icon,engine=excluded.engine,recommended_style=excluded.recommended_style,settings=excluded.settings,is_featured=excluded.is_featured,sort_order=excluded.sort_order,updated_at=now();

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Novedades','novedades',10 FROM business_templates WHERE slug='boutique'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Vestidos','vestidos',20 FROM business_templates WHERE slug='boutique'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Blusas','blusas',30 FROM business_templates WHERE slug='boutique'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Jeans','jeans',40 FROM business_templates WHERE slug='boutique'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Conjuntos','conjuntos',50 FROM business_templates WHERE slug='boutique'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Accesorios','accesorios',60 FROM business_templates WHERE slug='boutique'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'vestidos','Vestido midi','vestido-midi','Vestido elegante de corte midi.',1450,true,'[{"name":"S","price":0},{"name":"M","price":0},{"name":"L","price":0}]'::jsonb,'[]'::jsonb,true,10
FROM business_templates WHERE slug='boutique'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'blusas','Blusa básica','blusa-basica','Blusa ligera para uso diario.',750,true,'[{"name":"S","price":0},{"name":"M","price":0},{"name":"L","price":0}]'::jsonb,'[]'::jsonb,false,20
FROM business_templates WHERE slug='boutique'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'jeans','Jean high waist','jean-high-waist','Jean de cintura alta.',1650,true,'[{"name":"26","price":0},{"name":"28","price":0},{"name":"30","price":0}]'::jsonb,'[]'::jsonb,false,30
FROM business_templates WHERE slug='boutique'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'disponible','Disponibilidad','👗 Sí, esa pieza está disponible.',10 FROM business_templates WHERE slug='boutique'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'talla','Talla','📏 ¿Qué talla necesitas?',20 FROM business_templates WHERE slug='boutique'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'delivery','Delivery','🚚 Sí hacemos delivery. Dime tu sector para confirmarte el costo.',30 FROM business_templates WHERE slug='boutique'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO business_templates(slug,name,family,description,icon,engine,recommended_style,settings,is_featured,is_active,sort_order)
VALUES('cosmeticos','Cosméticos','Belleza','Maquillaje, cuidado personal, tonos y presentaciones.','💄','retail','Elegant','{"item_label":"producto","item_label_plural":"productos","primary_action":"Comprar","delivery_enabled":true,"pickup_enabled":true,"track_stock_default":true,"supports_variants":true,"variant_hint":"Tono / Color / Tamaño","accent":"#c86fa8"}'::jsonb,true,true,50)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,family=excluded.family,description=excluded.description,icon=excluded.icon,engine=excluded.engine,recommended_style=excluded.recommended_style,settings=excluded.settings,is_featured=excluded.is_featured,sort_order=excluded.sort_order,updated_at=now();

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Maquillaje','maquillaje',10 FROM business_templates WHERE slug='cosmeticos'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Labios','labios',20 FROM business_templates WHERE slug='cosmeticos'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Rostro','rostro',30 FROM business_templates WHERE slug='cosmeticos'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Cabello','cabello',40 FROM business_templates WHERE slug='cosmeticos'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Skincare','skincare',50 FROM business_templates WHERE slug='cosmeticos'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Accesorios','accesorios',60 FROM business_templates WHERE slug='cosmeticos'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'labios','Labial mate','labial-mate','Labial de larga duración.',475,true,'[{"name":"Nude","price":0},{"name":"Rojo","price":0},{"name":"Vino","price":0}]'::jsonb,'[]'::jsonb,true,10
FROM business_templates WHERE slug='cosmeticos'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'rostro','Base líquida','base-liquida','Cobertura media y acabado natural.',850,true,'[{"name":"Claro","price":0},{"name":"Medio","price":0},{"name":"Oscuro","price":0}]'::jsonb,'[]'::jsonb,false,20
FROM business_templates WHERE slug='cosmeticos'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'skincare','Serum facial','serum-facial','Serum hidratante de uso diario.',950,true,'[{"name":"30 ml","price":0},{"name":"60 ml","price":450}]'::jsonb,'[]'::jsonb,false,30
FROM business_templates WHERE slug='cosmeticos'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'tono','Tono','💄 ¿Qué tono estás buscando?',10 FROM business_templates WHERE slug='cosmeticos'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'disponible','Disponibilidad','✅ Sí, tenemos disponibilidad.',20 FROM business_templates WHERE slug='cosmeticos'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'delivery','Delivery','🚚 Hacemos delivery. Compártenos tu sector.',30 FROM business_templates WHERE slug='cosmeticos'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO business_templates(slug,name,family,description,icon,engine,recommended_style,settings,is_featured,is_active,sort_order)
VALUES('tecnologia','Celulares y tecnología','Tecnología','Celulares, computadoras, accesorios y fichas técnicas.','📱','catalog','Minimal','{"item_label":"equipo","item_label_plural":"equipos","primary_action":"Consultar / comprar","delivery_enabled":true,"pickup_enabled":true,"track_stock_default":true,"supports_variants":true,"variant_hint":"Capacidad / Color","accent":"#4b86d9"}'::jsonb,true,true,60)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,family=excluded.family,description=excluded.description,icon=excluded.icon,engine=excluded.engine,recommended_style=excluded.recommended_style,settings=excluded.settings,is_featured=excluded.is_featured,sort_order=excluded.sort_order,updated_at=now();

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Celulares','celulares',10 FROM business_templates WHERE slug='tecnologia'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Computadoras','computadoras',20 FROM business_templates WHERE slug='tecnologia'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Audífonos','audifonos',30 FROM business_templates WHERE slug='tecnologia'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Cargadores','cargadores',40 FROM business_templates WHERE slug='tecnologia'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Smartwatch','smartwatch',50 FROM business_templates WHERE slug='tecnologia'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Accesorios','accesorios',60 FROM business_templates WHERE slug='tecnologia'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'celulares','Smartphone 128 GB','smartphone-128-gb','Equipo desbloqueado, 128 GB de almacenamiento.',14900,true,'[{"name":"128 GB","price":0},{"name":"256 GB","price":4500}]'::jsonb,'[]'::jsonb,true,10
FROM business_templates WHERE slug='tecnologia'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'audifonos','Audífonos Bluetooth','audifonos-bluetooth','Audífonos inalámbricos con estuche de carga.',1250,true,'[{"name":"Negro","price":0},{"name":"Blanco","price":0}]'::jsonb,'[]'::jsonb,false,20
FROM business_templates WHERE slug='tecnologia'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'cargadores','Cargador rápido 20W','cargador-rapido-20w','Cargador de pared de carga rápida.',950,true,'[]'::jsonb,'[]'::jsonb,false,30
FROM business_templates WHERE slug='tecnologia'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'modelo','Modelo','📱 ¿Qué marca y modelo estás buscando?',10 FROM business_templates WHERE slug='tecnologia'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'garantia','Garantía','🛡 Te confirmamos garantía y disponibilidad antes de cerrar la compra.',20 FROM business_templates WHERE slug='tecnologia'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'disponible','Disponibilidad','✅ Sí tenemos disponibilidad.',30 FROM business_templates WHERE slug='tecnologia'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO business_templates(slug,name,family,description,icon,engine,recommended_style,settings,is_featured,is_active,sort_order)
VALUES('ferreteria','Ferretería','Ferretería','Herramientas, materiales y pedidos que también pueden convertirse en cotizaciones.','🔧','quotation','Bold','{"item_label":"artículo","item_label_plural":"artículos","primary_action":"Comprar / cotizar","delivery_enabled":true,"pickup_enabled":true,"track_stock_default":true,"quotation":true,"supports_variants":true,"variant_hint":"Medida / Presentación","accent":"#e59b2f"}'::jsonb,true,true,70)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,family=excluded.family,description=excluded.description,icon=excluded.icon,engine=excluded.engine,recommended_style=excluded.recommended_style,settings=excluded.settings,is_featured=excluded.is_featured,sort_order=excluded.sort_order,updated_at=now();

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Herramientas','herramientas',10 FROM business_templates WHERE slug='ferreteria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Electricidad','electricidad',20 FROM business_templates WHERE slug='ferreteria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Plomería','plomeria',30 FROM business_templates WHERE slug='ferreteria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Pintura','pintura',40 FROM business_templates WHERE slug='ferreteria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Construcción','construccion',50 FROM business_templates WHERE slug='ferreteria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Jardinería','jardineria',60 FROM business_templates WHERE slug='ferreteria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'herramientas','Taladro percutor','taladro-percutor','Taladro para trabajos de construcción y mantenimiento.',4850,true,'[]'::jsonb,'[]'::jsonb,true,10
FROM business_templates WHERE slug='ferreteria'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'pintura','Galón de pintura','galon-de-pintura','Pintura de acabado interior.',1850,true,'[{"name":"Mate","price":0},{"name":"Satinado","price":250}]'::jsonb,'[]'::jsonb,false,20
FROM business_templates WHERE slug='ferreteria'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'plomeria','Tubo PVC','tubo-pvc','Tubo PVC para instalaciones.',325,true,'[{"name":"1/2 pulg","price":0},{"name":"3/4 pulg","price":85},{"name":"1 pulg","price":160}]'::jsonb,'[]'::jsonb,false,30
FROM business_templates WHERE slug='ferreteria'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'cantidad','Cantidad','📦 ¿Qué cantidad necesitas?',10 FROM business_templates WHERE slug='ferreteria'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'cotizacion','Cotización','📋 Podemos prepararte una cotización con todos los artículos.',20 FROM business_templates WHERE slug='ferreteria'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'disponible','Disponibilidad','🔧 Sí tenemos disponibilidad.',30 FROM business_templates WHERE slug='ferreteria'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO business_templates(slug,name,family,description,icon,engine,recommended_style,settings,is_featured,is_active,sort_order)
VALUES('repuestos','Repuestos','Automotriz','Repuestos y accesorios con consulta de compatibilidad antes de vender.','🚗','quotation','Bold','{"item_label":"repuesto","item_label_plural":"repuestos","primary_action":"Consultar compatibilidad","delivery_enabled":true,"pickup_enabled":true,"track_stock_default":true,"quotation":true,"supports_variants":true,"variant_hint":"Marca / Modelo","accent":"#4d5968"}'::jsonb,true,true,80)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,family=excluded.family,description=excluded.description,icon=excluded.icon,engine=excluded.engine,recommended_style=excluded.recommended_style,settings=excluded.settings,is_featured=excluded.is_featured,sort_order=excluded.sort_order,updated_at=now();

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Motor','motor',10 FROM business_templates WHERE slug='repuestos'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Frenos','frenos',20 FROM business_templates WHERE slug='repuestos'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Suspensión','suspension',30 FROM business_templates WHERE slug='repuestos'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Electricidad','electricidad',40 FROM business_templates WHERE slug='repuestos'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Lubricantes','lubricantes',50 FROM business_templates WHERE slug='repuestos'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Accesorios','accesorios',60 FROM business_templates WHERE slug='repuestos'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'frenos','Pastillas de freno','pastillas-de-freno','Juego de pastillas de freno.',2200,true,'[{"name":"Delanteras","price":0},{"name":"Traseras","price":-200}]'::jsonb,'[]'::jsonb,true,10
FROM business_templates WHERE slug='repuestos'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'motor','Filtro de aceite','filtro-de-aceite','Filtro para mantenimiento preventivo.',550,true,'[]'::jsonb,'[]'::jsonb,false,20
FROM business_templates WHERE slug='repuestos'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'lubricantes','Aceite de motor','aceite-de-motor','Lubricante para motor.',650,true,'[{"name":"1 cuarto","price":0},{"name":"Galón","price":1800}]'::jsonb,'[]'::jsonb,false,30
FROM business_templates WHERE slug='repuestos'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'vehiculo','Datos del vehículo','🚗 Indícanos marca, modelo, año y motor del vehículo.',10 FROM business_templates WHERE slug='repuestos'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'compatibilidad','Compatibilidad','🔎 Verificaremos compatibilidad antes de confirmar la venta.',20 FROM business_templates WHERE slug='repuestos'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'disponible','Disponibilidad','✅ Te confirmamos disponibilidad de inmediato.',30 FROM business_templates WHERE slug='repuestos'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO business_templates(slug,name,family,description,icon,engine,recommended_style,settings,is_featured,is_active,sort_order)
VALUES('salon-belleza','Salón de belleza','Servicios','Servicios, duración y reservas coordinadas por WhatsApp.','💇‍♀️','services','Elegant','{"item_label":"servicio","item_label_plural":"servicios","primary_action":"Reservar","delivery_enabled":false,"pickup_enabled":true,"appointments":true,"track_stock_default":false,"supports_variants":true,"variant_hint":"Duración / Profesional","accent":"#b66da8","checkout_fields":[{"key":"fecha","label":"Fecha preferida","type":"date","required":true},{"key":"hora","label":"Hora preferida","type":"time","required":true},{"key":"profesional","label":"Profesional de preferencia","type":"text","required":false}]}'::jsonb,true,true,90)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,family=excluded.family,description=excluded.description,icon=excluded.icon,engine=excluded.engine,recommended_style=excluded.recommended_style,settings=excluded.settings,is_featured=excluded.is_featured,sort_order=excluded.sort_order,updated_at=now();

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Cabello','cabello',10 FROM business_templates WHERE slug='salon-belleza'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Color','color',20 FROM business_templates WHERE slug='salon-belleza'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Tratamientos','tratamientos',30 FROM business_templates WHERE slug='salon-belleza'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Peinados','peinados',40 FROM business_templates WHERE slug='salon-belleza'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Maquillaje','maquillaje',50 FROM business_templates WHERE slug='salon-belleza'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'cabello','Lavado y secado','lavado-y-secado','Servicio de lavado y secado.',900,false,'[{"name":"Cabello corto","price":0},{"name":"Cabello largo","price":350}]'::jsonb,'[]'::jsonb,true,10
FROM business_templates WHERE slug='salon-belleza'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'color','Color completo','color-completo','Aplicación de color profesional.',2800,false,'[{"name":"Corto","price":0},{"name":"Largo","price":900}]'::jsonb,'[]'::jsonb,false,20
FROM business_templates WHERE slug='salon-belleza'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'maquillaje','Maquillaje social','maquillaje-social','Maquillaje para eventos.',1800,false,'[]'::jsonb,'[]'::jsonb,false,30
FROM business_templates WHERE slug='salon-belleza'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'cita','Agendar cita','📅 ¿Para qué día deseas reservar?',10 FROM business_templates WHERE slug='salon-belleza'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'hora','Horario','⏰ ¿Qué horario prefieres?',20 FROM business_templates WHERE slug='salon-belleza'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'servicio','Servicio','💇‍♀️ ¿Qué servicio deseas realizarte?',30 FROM business_templates WHERE slug='salon-belleza'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO business_templates(slug,name,family,description,icon,engine,recommended_style,settings,is_featured,is_active,sort_order)
VALUES('barberia','Barbería','Servicios','Cortes, barba y servicios con reserva rápida.','💈','services','Urban','{"item_label":"servicio","item_label_plural":"servicios","primary_action":"Reservar","delivery_enabled":false,"pickup_enabled":true,"appointments":true,"track_stock_default":false,"supports_variants":false,"accent":"#26384a","checkout_fields":[{"key":"fecha","label":"Fecha preferida","type":"date","required":true},{"key":"hora","label":"Hora preferida","type":"time","required":true},{"key":"barbero","label":"Barbero de preferencia","type":"text","required":false}]}'::jsonb,true,true,100)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,family=excluded.family,description=excluded.description,icon=excluded.icon,engine=excluded.engine,recommended_style=excluded.recommended_style,settings=excluded.settings,is_featured=excluded.is_featured,sort_order=excluded.sort_order,updated_at=now();

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Cortes','cortes',10 FROM business_templates WHERE slug='barberia'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Barba','barba',20 FROM business_templates WHERE slug='barberia'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Combos','combos',30 FROM business_templates WHERE slug='barberia'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Tratamientos','tratamientos',40 FROM business_templates WHERE slug='barberia'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'cortes','Corte clásico','corte-clasico','Corte tradicional.',500,false,'[]'::jsonb,'[]'::jsonb,true,10
FROM business_templates WHERE slug='barberia'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'combos','Corte + barba','corte-barba','Corte y arreglo de barba.',800,false,'[]'::jsonb,'[]'::jsonb,false,20
FROM business_templates WHERE slug='barberia'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'barba','Barba','barba','Perfilado y arreglo de barba.',350,false,'[]'::jsonb,'[]'::jsonb,false,30
FROM business_templates WHERE slug='barberia'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'cita','Agendar cita','💈 ¡Hola! Tenemos citas disponibles. ¿Para qué día deseas reservar?',10 FROM business_templates WHERE slug='barberia'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'hora','Horario','⏰ ¿Qué horario prefieres?',20 FROM business_templates WHERE slug='barberia'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'confirmada','Confirmación','✅ Tu cita quedó confirmada.',30 FROM business_templates WHERE slug='barberia'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO business_templates(slug,name,family,description,icon,engine,recommended_style,settings,is_featured,is_active,sort_order)
VALUES('pet-shop','Pet Shop','Mascotas','Alimentos, accesorios e higiene para mascotas.','🐶','retail','Fresh','{"item_label":"producto","item_label_plural":"productos","primary_action":"Comprar","delivery_enabled":true,"pickup_enabled":true,"track_stock_default":true,"supports_variants":true,"variant_hint":"Peso / Tamaño / Sabor","accent":"#4bb99a"}'::jsonb,true,true,110)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,family=excluded.family,description=excluded.description,icon=excluded.icon,engine=excluded.engine,recommended_style=excluded.recommended_style,settings=excluded.settings,is_featured=excluded.is_featured,sort_order=excluded.sort_order,updated_at=now();

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Alimentos','alimentos',10 FROM business_templates WHERE slug='pet-shop'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Snacks','snacks',20 FROM business_templates WHERE slug='pet-shop'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Juguetes','juguetes',30 FROM business_templates WHERE slug='pet-shop'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Higiene','higiene',40 FROM business_templates WHERE slug='pet-shop'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Accesorios','accesorios',50 FROM business_templates WHERE slug='pet-shop'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'alimentos','Alimento premium','alimento-premium','Alimento balanceado para mascotas.',1450,true,'[{"name":"5 lb","price":0},{"name":"15 lb","price":2100}]'::jsonb,'[]'::jsonb,true,10
FROM business_templates WHERE slug='pet-shop'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'accesorios','Correa ajustable','correa-ajustable','Correa resistente y ajustable.',650,true,'[{"name":"S","price":0},{"name":"M","price":100},{"name":"L","price":180}]'::jsonb,'[]'::jsonb,false,20
FROM business_templates WHERE slug='pet-shop'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'higiene','Shampoo para mascotas','shampoo-para-mascotas','Shampoo de uso frecuente.',575,true,'[]'::jsonb,'[]'::jsonb,false,30
FROM business_templates WHERE slug='pet-shop'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'mascota','Tipo de mascota','🐾 ¿Es para perro, gato u otra mascota?',10 FROM business_templates WHERE slug='pet-shop'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'peso','Peso / tamaño','📏 ¿Qué peso o tamaño necesitas?',20 FROM business_templates WHERE slug='pet-shop'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'delivery','Delivery','🚚 Sí tenemos delivery.',30 FROM business_templates WHERE slug='pet-shop'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO business_templates(slug,name,family,description,icon,engine,recommended_style,settings,is_featured,is_active,sort_order)
VALUES('floristeria','Floristería','Regalos','Ramos, arreglos y entregas con mensajes personalizados.','💐','retail','Warm','{"item_label":"arreglo","item_label_plural":"arreglos","primary_action":"Ordenar","delivery_enabled":true,"pickup_enabled":true,"track_stock_default":false,"personalization":true,"supports_extras":true,"accent":"#d36f8c","checkout_fields":[{"key":"destinatario","label":"Nombre del destinatario","type":"text","required":true},{"key":"fecha_entrega","label":"Fecha de entrega","type":"date","required":true},{"key":"mensaje_tarjeta","label":"Mensaje para la tarjeta","type":"textarea","required":false}]}'::jsonb,true,true,120)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,family=excluded.family,description=excluded.description,icon=excluded.icon,engine=excluded.engine,recommended_style=excluded.recommended_style,settings=excluded.settings,is_featured=excluded.is_featured,sort_order=excluded.sort_order,updated_at=now();

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Ramos','ramos',10 FROM business_templates WHERE slug='floristeria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Arreglos','arreglos',20 FROM business_templates WHERE slug='floristeria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Cumpleaños','cumpleanos',30 FROM business_templates WHERE slug='floristeria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Aniversario','aniversario',40 FROM business_templates WHERE slug='floristeria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Condolencias','condolencias',50 FROM business_templates WHERE slug='floristeria'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'ramos','Ramo de rosas','ramo-de-rosas','Ramo de rosas frescas.',1850,false,'[{"name":"12 rosas","price":0},{"name":"24 rosas","price":1450}]'::jsonb,'[{"name":"Tarjeta personalizada","price":150},{"name":"Chocolates","price":450}]'::jsonb,true,10
FROM business_templates WHERE slug='floristeria'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'cumpleanos','Arreglo cumpleaños','arreglo-cumpleanos','Arreglo floral para cumpleaños.',2400,false,'[]'::jsonb,'[{"name":"Globo","price":300},{"name":"Tarjeta","price":150}]'::jsonb,false,20
FROM business_templates WHERE slug='floristeria'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'fecha','Fecha de entrega','📅 ¿Para qué fecha y hora necesitas la entrega?',10 FROM business_templates WHERE slug='floristeria'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'mensaje','Mensaje de tarjeta','💌 Envíanos el mensaje que deseas colocar en la tarjeta.',20 FROM business_templates WHERE slug='floristeria'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'direccion','Dirección','📍 Compártenos la dirección del destinatario.',30 FROM business_templates WHERE slug='floristeria'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO business_templates(slug,name,family,description,icon,engine,recommended_style,settings,is_featured,is_active,sort_order)
VALUES('regalos-personalizados','Regalos personalizados','Regalos','Detalles, tazas, camisetas e impresiones personalizadas.','🎁','quotation','Warm','{"item_label":"producto","item_label_plural":"productos","primary_action":"Personalizar / cotizar","delivery_enabled":true,"pickup_enabled":true,"personalization":true,"quotation":true,"track_stock_default":false,"supports_variants":true,"accent":"#c9804e","checkout_fields":[{"key":"texto_personalizado","label":"Texto o nombre a personalizar","type":"text","required":false},{"key":"fecha_requerida","label":"Fecha requerida","type":"date","required":false}]}'::jsonb,false,true,130)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,family=excluded.family,description=excluded.description,icon=excluded.icon,engine=excluded.engine,recommended_style=excluded.recommended_style,settings=excluded.settings,is_featured=excluded.is_featured,sort_order=excluded.sort_order,updated_at=now();

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Tazas','tazas',10 FROM business_templates WHERE slug='regalos-personalizados'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Camisetas','camisetas',20 FROM business_templates WHERE slug='regalos-personalizados'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Detalles','detalles',30 FROM business_templates WHERE slug='regalos-personalizados'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Impresiones','impresiones',40 FROM business_templates WHERE slug='regalos-personalizados'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Empaques','empaques',50 FROM business_templates WHERE slug='regalos-personalizados'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'tazas','Taza personalizada','taza-personalizada','Taza con diseño o fotografía personalizada.',550,false,'[{"name":"11 oz","price":0},{"name":"15 oz","price":150}]'::jsonb,'[]'::jsonb,true,10
FROM business_templates WHERE slug='regalos-personalizados'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'camisetas','Camiseta personalizada','camiseta-personalizada','Camiseta estampada con tu diseño.',850,false,'[{"name":"S","price":0},{"name":"M","price":0},{"name":"L","price":0}]'::jsonb,'[]'::jsonb,false,20
FROM business_templates WHERE slug='regalos-personalizados'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'detalles','Caja de regalo','caja-de-regalo','Caja con selección personalizada.',1250,false,'[]'::jsonb,'[]'::jsonb,false,30
FROM business_templates WHERE slug='regalos-personalizados'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'referencia','Imagen de referencia','🖼 Envíanos la imagen o diseño de referencia.',10 FROM business_templates WHERE slug='regalos-personalizados'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'cantidad','Cantidad','📦 ¿Cuántas unidades necesitas?',20 FROM business_templates WHERE slug='regalos-personalizados'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'fecha','Fecha','📅 ¿Para qué fecha necesitas el pedido?',30 FROM business_templates WHERE slug='regalos-personalizados'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO business_templates(slug,name,family,description,icon,engine,recommended_style,settings,is_featured,is_active,sort_order)
VALUES('suplementos','Productos naturales y suplementos','Bienestar','Vitaminas, proteínas, suplementos y bienestar.','🌿','retail','Fresh','{"item_label":"producto","item_label_plural":"productos","primary_action":"Comprar / consultar","delivery_enabled":true,"pickup_enabled":true,"track_stock_default":true,"supports_variants":true,"variant_hint":"Sabor / Tamaño / Presentación","accent":"#5aa75b"}'::jsonb,false,true,140)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,family=excluded.family,description=excluded.description,icon=excluded.icon,engine=excluded.engine,recommended_style=excluded.recommended_style,settings=excluded.settings,is_featured=excluded.is_featured,sort_order=excluded.sort_order,updated_at=now();

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Vitaminas','vitaminas',10 FROM business_templates WHERE slug='suplementos'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Proteínas','proteinas',20 FROM business_templates WHERE slug='suplementos'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Deportivos','deportivos',30 FROM business_templates WHERE slug='suplementos'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Bienestar','bienestar',40 FROM business_templates WHERE slug='suplementos'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Cuidado personal','cuidado-personal',50 FROM business_templates WHERE slug='suplementos'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'vitaminas','Multivitamínico','multivitaminico','Suplemento multivitamínico.',950,true,'[{"name":"30 cápsulas","price":0},{"name":"60 cápsulas","price":600}]'::jsonb,'[]'::jsonb,true,10
FROM business_templates WHERE slug='suplementos'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'proteinas','Proteína en polvo','proteina-en-polvo','Suplemento de proteína.',2850,true,'[{"name":"Chocolate","price":0},{"name":"Vainilla","price":0}]'::jsonb,'[]'::jsonb,false,20
FROM business_templates WHERE slug='suplementos'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'deportivos','Creatina','creatina','Creatina monohidratada.',1650,true,'[{"name":"300 g","price":0},{"name":"500 g","price":650}]'::jsonb,'[]'::jsonb,false,30
FROM business_templates WHERE slug='suplementos'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'presentacion','Presentación','🌿 ¿Qué presentación estás buscando?',10 FROM business_templates WHERE slug='suplementos'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'disponible','Disponibilidad','✅ Te confirmamos disponibilidad.',20 FROM business_templates WHERE slug='suplementos'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'consulta','Consulta','ℹ️ Podemos orientarte sobre presentaciones y uso indicado en la etiqueta.',30 FROM business_templates WHERE slug='suplementos'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO business_templates(slug,name,family,description,icon,engine,recommended_style,settings,is_featured,is_active,sort_order)
VALUES('mayorista-distribuidor','Mayorista / distribuidor','Mayoristas','Venta por unidad, docena, caja o volumen con pedido mínimo.','📦','wholesale','Minimal','{"item_label":"producto","item_label_plural":"productos","primary_action":"Cotizar volumen","delivery_enabled":true,"pickup_enabled":true,"track_stock_default":true,"wholesale":true,"quotation":true,"supports_variants":true,"variant_hint":"Unidad / Docena / Caja","minimum_order":1500,"accent":"#466b91","checkout_fields":[{"key":"empresa","label":"Nombre de empresa o negocio","type":"text","required":false},{"key":"rnc","label":"RNC (opcional)","type":"text","required":false}]}'::jsonb,true,true,150)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,family=excluded.family,description=excluded.description,icon=excluded.icon,engine=excluded.engine,recommended_style=excluded.recommended_style,settings=excluded.settings,is_featured=excluded.is_featured,sort_order=excluded.sort_order,updated_at=now();

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Más vendidos','mas-vendidos',10 FROM business_templates WHERE slug='mayorista-distribuidor'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Por unidad','por-unidad',20 FROM business_templates WHERE slug='mayorista-distribuidor'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Por docena','por-docena',30 FROM business_templates WHERE slug='mayorista-distribuidor'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Por caja','por-caja',40 FROM business_templates WHERE slug='mayorista-distribuidor'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Ofertas','ofertas',50 FROM business_templates WHERE slug='mayorista-distribuidor'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'por-unidad','Producto por unidad','producto-por-unidad','Precio de referencia por unidad.',100,true,'[{"name":"Unidad","price":0},{"name":"Docena","price":950},{"name":"Caja","price":2100}]'::jsonb,'[]'::jsonb,true,10
FROM business_templates WHERE slug='mayorista-distribuidor'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'por-caja','Paquete surtido','paquete-surtido','Paquete pensado para negocios.',2500,true,'[{"name":"Caja pequeña","price":0},{"name":"Caja grande","price":2200}]'::jsonb,'[]'::jsonb,false,20
FROM business_templates WHERE slug='mayorista-distribuidor'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'cantidad','Cantidad','📦 ¿Qué cantidad necesitas?',10 FROM business_templates WHERE slug='mayorista-distribuidor'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'volumen','Precio por volumen','💰 Tenemos precios por volumen. Indícanos unidades, docenas o cajas.',20 FROM business_templates WHERE slug='mayorista-distribuidor'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'minimo','Pedido mínimo','📋 Te confirmamos el pedido mínimo y la disponibilidad.',30 FROM business_templates WHERE slug='mayorista-distribuidor'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO business_templates(slug,name,family,description,icon,engine,recommended_style,settings,is_featured,is_active,sort_order)
VALUES('otro-negocio','Otro tipo de negocio','Otros','Una base limpia y flexible para cualquier negocio que venda por WhatsApp.','✨','retail','Minimal','{"item_label":"producto","item_label_plural":"productos","primary_action":"Comprar","delivery_enabled":true,"pickup_enabled":true,"track_stock_default":false,"supports_variants":true,"supports_extras":true,"accent":"#36b385"}'::jsonb,false,true,160)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,family=excluded.family,description=excluded.description,icon=excluded.icon,engine=excluded.engine,recommended_style=excluded.recommended_style,settings=excluded.settings,is_featured=excluded.is_featured,sort_order=excluded.sort_order,updated_at=now();

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Productos','productos',10 FROM business_templates WHERE slug='otro-negocio'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_categories(template_id,name,slug,sort_order)
SELECT id,'Destacados','destacados',20 FROM business_templates WHERE slug='otro-negocio'
ON CONFLICT(template_id,slug) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;

INSERT INTO template_products(template_id,category_slug,name,slug,description,price,track_stock,variants,extras,is_featured,sort_order)
SELECT id,'productos','Producto de ejemplo','producto-de-ejemplo','Edita o elimina este producto y agrega lo que realmente vendes.',100,false,'[]'::jsonb,'[]'::jsonb,true,10
FROM business_templates WHERE slug='otro-negocio'
ON CONFLICT(template_id,slug) DO UPDATE SET category_slug=excluded.category_slug,name=excluded.name,description=excluded.description,price=excluded.price,track_stock=excluded.track_stock,variants=excluded.variants,extras=excluded.extras,is_featured=excluded.is_featured,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'hola','Bienvenida','👋 ¡Hola! Gracias por escribirnos. ¿En qué podemos ayudarte?',10 FROM business_templates WHERE slug='otro-negocio'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'disponible','Disponibilidad','✅ Sí tenemos disponibilidad.',20 FROM business_templates WHERE slug='otro-negocio'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;

INSERT INTO template_quick_replies(template_id,shortcut,title,message,sort_order)
SELECT id,'pedido','Pedido','📦 Podemos ayudarte a completar tu pedido por aquí.',30 FROM business_templates WHERE slug='otro-negocio'
ON CONFLICT(template_id,shortcut) DO UPDATE SET title=excluded.title,message=excluded.message,sort_order=excluded.sort_order;
-- ---------------------------------------------------------------------------
-- Attribute presets: cloned into each store so specialized businesses receive
-- useful product fields without asking the merchant to configure them.
-- ---------------------------------------------------------------------------

-- Boutique
INSERT INTO template_attribute_groups(template_id,name,sort_order)
SELECT id,'Detalles de la prenda',10 FROM business_templates WHERE slug='boutique'
ON CONFLICT(template_id,name) DO UPDATE SET sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'material','Material','text','[]'::jsonb,false,10 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Detalles de la prenda' WHERE bt.slug='boutique'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'genero','Colección','select','["Mujer","Hombre","Unisex","Niños"]'::jsonb,false,20 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Detalles de la prenda' WHERE bt.slug='boutique'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;

-- Tecnología
INSERT INTO template_attribute_groups(template_id,name,sort_order)
SELECT id,'Especificaciones',10 FROM business_templates WHERE slug='tecnologia'
ON CONFLICT(template_id,name) DO UPDATE SET sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'marca','Marca','text','[]'::jsonb,false,10 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Especificaciones' WHERE bt.slug='tecnologia'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'modelo','Modelo','text','[]'::jsonb,false,20 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Especificaciones' WHERE bt.slug='tecnologia'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'capacidad','Capacidad','text','[]'::jsonb,false,30 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Especificaciones' WHERE bt.slug='tecnologia'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'ram','RAM','text','[]'::jsonb,false,40 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Especificaciones' WHERE bt.slug='tecnologia'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'condicion','Condición','select','["Nuevo","Usado como nuevo","Usado"]'::jsonb,false,50 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Especificaciones' WHERE bt.slug='tecnologia'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'garantia','Garantía','text','[]'::jsonb,false,60 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Especificaciones' WHERE bt.slug='tecnologia'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;

-- Ferretería
INSERT INTO template_attribute_groups(template_id,name,sort_order)
SELECT id,'Ficha del artículo',10 FROM business_templates WHERE slug='ferreteria'
ON CONFLICT(template_id,name) DO UPDATE SET sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'marca','Marca','text','[]'::jsonb,false,10 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Ficha del artículo' WHERE bt.slug='ferreteria'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'modelo','Modelo / referencia','text','[]'::jsonb,false,20 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Ficha del artículo' WHERE bt.slug='ferreteria'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'medida','Medida','text','[]'::jsonb,false,30 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Ficha del artículo' WHERE bt.slug='ferreteria'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'presentacion','Presentación / unidad','text','[]'::jsonb,false,40 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Ficha del artículo' WHERE bt.slug='ferreteria'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;

-- Repuestos
INSERT INTO template_attribute_groups(template_id,name,sort_order)
SELECT id,'Compatibilidad',10 FROM business_templates WHERE slug='repuestos'
ON CONFLICT(template_id,name) DO UPDATE SET sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'marca_vehiculo','Marca del vehículo','text','[]'::jsonb,false,10 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Compatibilidad' WHERE bt.slug='repuestos'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'modelo_vehiculo','Modelo del vehículo','text','[]'::jsonb,false,20 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Compatibilidad' WHERE bt.slug='repuestos'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'anio','Año / rango de años','text','[]'::jsonb,false,30 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Compatibilidad' WHERE bt.slug='repuestos'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'motor','Motor','text','[]'::jsonb,false,40 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Compatibilidad' WHERE bt.slug='repuestos'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'numero_pieza','Número de pieza','text','[]'::jsonb,false,50 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Compatibilidad' WHERE bt.slug='repuestos'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'marca_repuesto','Marca del repuesto','text','[]'::jsonb,false,60 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Compatibilidad' WHERE bt.slug='repuestos'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;

-- Pet Shop
INSERT INTO template_attribute_groups(template_id,name,sort_order)
SELECT id,'Detalles del producto',10 FROM business_templates WHERE slug='pet-shop'
ON CONFLICT(template_id,name) DO UPDATE SET sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'tipo_mascota','Para','select','["Perro","Gato","Aves","Otra mascota"]'::jsonb,false,10 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Detalles del producto' WHERE bt.slug='pet-shop'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'marca','Marca','text','[]'::jsonb,false,20 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Detalles del producto' WHERE bt.slug='pet-shop'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'presentacion','Peso / presentación','text','[]'::jsonb,false,30 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Detalles del producto' WHERE bt.slug='pet-shop'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;

-- Suplementos
INSERT INTO template_attribute_groups(template_id,name,sort_order)
SELECT id,'Presentación',10 FROM business_templates WHERE slug='suplementos'
ON CONFLICT(template_id,name) DO UPDATE SET sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'marca','Marca','text','[]'::jsonb,false,10 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Presentación' WHERE bt.slug='suplementos'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'presentacion','Presentación','text','[]'::jsonb,false,20 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Presentación' WHERE bt.slug='suplementos'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'sabor','Sabor','text','[]'::jsonb,false,30 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Presentación' WHERE bt.slug='suplementos'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;

-- Mayorista / distribuidor
INSERT INTO template_attribute_groups(template_id,name,sort_order)
SELECT id,'Venta por volumen',10 FROM business_templates WHERE slug='mayorista-distribuidor'
ON CONFLICT(template_id,name) DO UPDATE SET sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'unidad_venta','Unidad de venta','select','["Unidad","Paquete","Docena","Caja","Fardo"]'::jsonb,false,10 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Venta por volumen' WHERE bt.slug='mayorista-distribuidor'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'contenido','Contenido por presentación','text','[]'::jsonb,false,20 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Venta por volumen' WHERE bt.slug='mayorista-distribuidor'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;
INSERT INTO template_attributes(template_id,group_id,key,label,input_type,options,is_required,sort_order)
SELECT bt.id,g.id,'minimo','Cantidad mínima','number','[]'::jsonb,false,30 FROM business_templates bt JOIN template_attribute_groups g ON g.template_id=bt.id AND g.name='Venta por volumen' WHERE bt.slug='mayorista-distribuidor'
ON CONFLICT(template_id,key) DO UPDATE SET label=excluded.label,input_type=excluded.input_type,options=excluded.options,is_required=excluded.is_required,sort_order=excluded.sort_order;

-- Demo values make the prebuilt catalog look realistic from the first visit.
UPDATE template_products tp SET attributes='{"marca":"WAMERCIO Demo","modelo":"X128","capacidad":"128 GB","ram":"8 GB","condicion":"Nuevo","garantia":"12 meses"}'::jsonb
FROM business_templates bt WHERE tp.template_id=bt.id AND bt.slug='tecnologia' AND tp.slug='smartphone-128-gb';
UPDATE template_products tp SET attributes='{"marca":"INGCO Demo","modelo":"Taladro 1/2\"","presentacion":"Unidad"}'::jsonb
FROM business_templates bt WHERE tp.template_id=bt.id AND bt.slug='ferreteria' AND tp.slug='taladro-percutor';
UPDATE template_products tp SET attributes='{"marca_vehiculo":"Toyota / Honda / Nissan","anio":"Consultar compatibilidad","numero_pieza":"DEMO-PF01"}'::jsonb
FROM business_templates bt WHERE tp.template_id=bt.id AND bt.slug='repuestos' AND tp.slug='pastillas-de-freno';
UPDATE template_products tp SET attributes='{"tipo_mascota":"Perro","presentacion":"2 kg"}'::jsonb
FROM business_templates bt WHERE tp.template_id=bt.id AND bt.slug='pet-shop' AND tp.slug='alimento-premium';
UPDATE template_products tp SET attributes='{"presentacion":"30 porciones"}'::jsonb
FROM business_templates bt WHERE tp.template_id=bt.id AND bt.slug='suplementos' AND tp.slug='proteina-en-polvo';
UPDATE template_products tp SET attributes='{"unidad_venta":"Unidad","minimo":12}'::jsonb
FROM business_templates bt WHERE tp.template_id=bt.id AND bt.slug='mayorista-distribuidor' AND tp.slug='producto-por-unidad';
