/** Fuente única de textos y visibilidad de la portada. Configuración persistida en platform_settings('landing'). */
export const landingSections = [
  {id:'hero',name:'Portada principal'},
  {id:'process',name:'Cómo funciona'},
  {id:'templates',name:'Plantillas adaptativas'},
  {id:'features',name:'Funciones y beneficios'},
  {id:'plans',name:'Planes'},
  {id:'demo',name:'Prueba desde tu celular'},
  {id:'closing',name:'Cierre comercial'},
] as const
export type LandingSectionId = typeof landingSections[number]['id']
export const defaultSectionOrder: LandingSectionId[] = landingSections.map(s=>s.id)
export function normalizeLandingSections(candidate:unknown): LandingSectionId[]{
  const allowed = new Set<string>(defaultSectionOrder)
  const list = Array.isArray(candidate) ? candidate.filter((key):key is LandingSectionId=>typeof key==='string'&&allowed.has(key)) : []
  return [...new Set<LandingSectionId>([...list,...defaultSectionOrder])]
}
export const landingDefaults:Record<string,any> = {
  brand_name:'WAMERCIO',brand_subtitle:'Comercio conversacional',brand_logo_url:'',
  nav_features_label:'Cómo funciona',nav_templates_label:'Plantillas',nav_product_label:'Funciones',nav_prices_label:'Precios',nav_demo_label:'Demo',nav_access_label:'Iniciar sesión',nav_register_label:'Crear comercio',nav_terms_label:'Términos',
  hero_badge:'COMERCIO CONVERSACIONAL PARA RD',hero_kicker:'Una tienda. Una conversación. Todo conectado.',
  hero_title:'Toda tu tienda funciona dentro de WhatsApp.',
  hero_subtitle:'Crea tu catálogo una sola vez. Tus clientes navegan, preguntan y piden desde una experiencia conectada, mientras WAMERCIO mantiene tus pedidos, pagos y clientes en orden.',
  access_label:'Crear mi comercio',demo_label:'Ver cómo funciona',
  hero_highlight_1_title:'Un solo enlace',hero_highlight_1_text:'Tu catálogo siempre disponible.',
  hero_highlight_2_title:'Ventas por conversación',hero_highlight_2_text:'Atiende desde WhatsApp.',
  hero_highlight_3_title:'Operación en orden',hero_highlight_3_text:'Pedidos y clientes conectados.',
  hero_mock_store_name:'Mi comercio',hero_mock_catalog_status:'Catálogo activo',hero_mock_orders_label:'Pedidos hoy',hero_mock_orders_value:'24',hero_mock_sales_label:'Ventas del día',hero_mock_sales_value:'RD$ 12,480',hero_mock_customers_label:'Clientes',hero_mock_customers_value:'18',hero_mock_caption:'Vista ilustrativa del panel',hero_mock_side_label:'PANEL DEL COMERCIO',hero_mock_banner_title:'Todo en un mismo lugar',hero_mock_banner_text:'Catálogo, conversaciones y pedidos organizados para que puedas enfocarte en vender.',hero_mock_menu_1:'Pedidos',hero_mock_menu_2:'Productos',hero_mock_menu_3:'Clientes',hero_mock_menu_4:'WhatsApp',hero_mock_action_label:'Ver pedidos',
  process_badge:'CÓMO FUNCIONA',process_title:'Un toque en un enlace. Lo demás es una conversación.',process_subtitle:'Comparte tu catálogo, atiende a tus clientes y gestiona las ventas con un flujo simple, sin cambiar tu manera de trabajar.',
  process_step_1_title:'Comparte tu enlace',process_step_1_text:'Tu catálogo siempre actualizado, listo para compartir en WhatsApp, tus redes o con un QR.',
  process_step_2_title:'El cliente inicia el pedido',process_step_2_text:'Explora productos, pregunta y confirma desde una experiencia conectada a tu comercio.',
  process_step_3_title:'Todo queda organizado',process_step_3_text:'Pedidos, cobros y entregas quedan visibles para tu equipo en el mismo panel.',
  process_customer_title:'Para tus clientes',process_customer_text:'Un recorrido de compra simple y conocido.',process_business_title:'Para tu comercio',process_business_text:'Pedidos y conversaciones en contexto.',
  process_mock_store_title:'Mi comercio',process_mock_status:'En línea · Respuesta rápida',
  process_chat_1:'Hola, vi su catálogo. Quiero hacer un pedido.',process_chat_2:'¡Claro! Te ayudamos a prepararlo. ¿Entrega o retiro?',process_chat_3:'Entrega, por favor.',
  process_mock_order_title:'Resumen del pedido',process_mock_products_title:'Productos seleccionados',process_mock_total_label:'Total',process_mock_total_value:'RD$ 1,380',process_mock_order_label:'Pedido confirmado',process_mock_button_label:'Continuar pedido',
  templates_badge:'PLANTILLAS ADAPTATIVAS',templates_title:'Una experiencia que se adapta a cada negocio.',templates_subtitle:'Elige una plantilla y descubre cómo WAMERCIO prioriza los módulos que realmente necesita cada comercio.',templates_featured_label:'Destacada',templates_selected_label:'Plantilla seleccionada',templates_empty_text:'Estamos preparando nuevas plantillas.',
  templates_preview_badge:'VISTA DEL PANEL',templates_preview_title:'El panel se adapta a tu operación.',templates_preview_text:'Cada plantilla ordena la navegación y los módulos según la forma de vender de tu negocio.',templates_preview_metric_1:'Pedidos hoy',templates_preview_metric_1_value:'24',templates_preview_metric_2:'Ventas del día',templates_preview_metric_2_value:'RD$ 12,480',templates_preview_metric_3:'Clientes atendidos',templates_preview_metric_3_value:'18',
  features_badge:'TODO CONECTADO',features_title:'Las herramientas que necesitas, en un mismo lugar.',features_subtitle:'Gestiona ventas y conversaciones desde una experiencia sencilla diseñada para crecer contigo.',
  feature_1_title:'Tu catálogo siempre listo',feature_1_text:'Organiza productos, precios, variantes e inventario desde un solo panel.',feature_1_details:'Productos, Variantes, Inventario',
  feature_2_title:'WhatsApp y pedidos',feature_2_text:'Conecta tus conversaciones con pedidos reales y el historial del cliente.',feature_2_details:'Chat, Pedidos, Historial',
  feature_3_title:'Cobros sencillos',feature_3_text:'Registra efectivo, transferencias y pagos en terminal según tu operación.',feature_3_details:'Métodos de pago, Caja, Seguimiento',
  feature_4_title:'Entregas coordinadas',feature_4_text:'Gestiona direcciones, zonas, repartidores y estados de cada pedido.',feature_4_details:'Delivery, Direcciones, Estados',
  feature_5_title:'Decisiones con datos',feature_5_text:'Consulta productos populares, movimientos, ventas y pedidos desde una vista clara.',feature_5_details:'Ventas, Informes, Operaciones',
  feature_6_title:'Clientes conectados',feature_6_text:'Conserva compras, direcciones y conversaciones en un mismo historial.',feature_6_details:'CRM, Contactos, Seguimiento',
  features_strip_primary:'Todo tu comercio, una misma conversación.',features_strip_secondary:'Menos herramientas separadas. Más claridad para crecer.',
  plans_badge:'PLANES SENCILLOS',plans_title:'Elige cómo quieres crecer',plans_subtitle:'Comienza con lo esencial y elige el plan que mejor se adapte a tu operación.',plans_button_label:'Empezar ahora',plans_popular_label:'Más popular',plans_empty_text:'Los planes estarán disponibles pronto.',plan_default_description:'Todo lo necesario para operar tu comercio.',plan_whatsapp_feature:'WhatsApp incluido',plan_orders_feature:'Pedidos organizados',plans_store_unit:'tienda',plans_products_unit:'productos',plans_month_unit:'mes',plans_year_unit:'año',
  demo_badge:'PRUÉBALO EN TU CELULAR',demo_title:'Tu comercio también va contigo.',demo_text:'Escanea el QR y conoce WAMERCIO desde tu teléfono. Funciona en el navegador y puedes instalarlo como PWA.',demo_button_label:'Probar en la web',demo_qr_label:'Escanea y prueba',
  closing_badge:'WAMERCIO PARA TU NEGOCIO',closing_title:'Haz que cada venta sea más simple.',closing_subtitle:'Desde el primer mensaje hasta el último pedido, mantén toda tu operación conectada.',closing_1_title:'Tienda siempre disponible',closing_1_text:'Comparte tu catálogo por enlace o QR y mantén tus productos al día.',closing_2_title:'Cobros sin complicaciones',closing_2_text:'Controla los métodos de pago que ya utilizas en tu comercio.',closing_3_title:'Clientes con contexto',closing_3_text:'Consulta pedidos, compras y conversaciones en un solo lugar.',closing_button_label:'Crear mi comercio',
  footer_brand:'WAMERCIO',footer_text:'Tu catálogo, tus pedidos y tus clientes conectados a cada conversación.',footer_product_heading:'Producto',footer_platform_heading:'Plataforma',footer_cta_heading:'Empieza hoy',footer_cta_text:'Crea tu comercio y comienza a vender desde una experiencia conectada.',footer_features_label:'Funciones',footer_templates_label:'Plantillas',footer_process_label:'Cómo funciona',footer_plans_label:'Precios',footer_access_label:'Crear mi comercio',footer_admin_label:'SuperAdmin',footer_privacy_label:'Privacidad',footer_terms_label:'Términos',footer_copyright_label:'Todos los derechos reservados.',footer_bottom_text:'Hecho para comercios que venden conversando.',footer_trust_text:'Creado para comercios dominicanos',
  maintenance_mode:false,maintenance_badge:'Mantenimiento programado',maintenance_title:'Estamos realizando mejoras en la página principal',maintenance_text:'La página principal estará temporalmente en mantenimiento. Los negocios activos continúan operando desde sus enlaces públicos.',maintenance_button_label:'Entrar al panel de administración',
  show_hero:true,show_hero_preview:true,show_hero_highlights:true,show_process:true,show_process_chat:true,show_templates:true,show_template_preview:true,show_features:true,show_features_strip:true,show_plans:true,show_demo:true,show_demo_qr:true,show_closing:true,show_footer:true,show_footer_legal:true,
  section_order:defaultSectionOrder,template_overrides:{},plan_overrides:{},
}
