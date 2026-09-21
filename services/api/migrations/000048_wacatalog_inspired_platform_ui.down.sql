UPDATE platform_settings
SET value = value || '{
  "nav_features_label":"Funciones",
  "nav_product_label":"Producto",
  "nav_prices_label":"Precios",
  "nav_demo_label":"Demo",
  "nav_access_label":"Acceso",
  "hero_badge":"Comercio conversacional hecho en República Dominicana 🇩🇴",
  "hero_kicker":"Simple y amigable",
  "hero_title":"Tu comercio y tus pedidos más fáciles con WhatsApp.",
  "hero_subtitle":"Crea tu tienda digital, comparte tu catálogo, recibe pedidos y administra clientes desde WAMERCIO. Sin complicaciones y pensado para vender desde el celular.",
  "access_label":"Acceder",
  "demo_label":"Ver demo",
  "feature_1_title":"Crea tu tienda",
  "feature_2_title":"Pedidos por WhatsApp",
  "feature_3_title":"Métodos de pago simples",
  "feature_4_title":"Empieza a vender rápido",
  "feature_5_title":"Ventas y pedidos",
  "feature_6_title":"Conoce a tus clientes",
  "process_title":"No existe un proceso más simple",
  "process_subtitle":"Administrar pedidos puede sentirse tan fácil como conversar con un cliente.",
  "footer_text":"Comercio y pedidos por WhatsApp, simplificados."
}'::jsonb,
updated_at = now()
WHERE key='landing';
