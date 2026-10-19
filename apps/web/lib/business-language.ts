/**
 * Lenguaje operativo por plantilla. No cambia estados ni autorización del servidor.
 * La solicitud de cita NO equivale a una reserva confirmada o agenda con cupos.
 * La cotización NO equivale a venta cobrada.
 */
export const businessCopyFields = [
  {key:'operations_title',label:'Título de operaciones'},
  {key:'operations_singular',label:'Operación (singular)'},
  {key:'operations_plural',label:'Operaciones (plural)'},
  {key:'catalog_title',label:'Nombre del catálogo'},
  {key:'catalog_item',label:'Artículo o servicio (singular)'},
  {key:'catalog_items',label:'Artículos o servicios (plural)'},
  {key:'checkout_action',label:'Botón para enviar solicitud'},
  {key:'checkout_success',label:'Confirmación tras enviar'},
  {key:'checkout_explanation',label:'Aviso después de enviar'},
  {key:'instructions_label',label:'Título de instrucciones'},
  {key:'instructions_placeholder',label:'Ejemplo de instrucciones'},
  {key:'fulfillment_question',label:'Pregunta de modalidad'},
  {key:'dashboard_hint',label:'Descripción de inicio'},
  {key:'notification_pending',label:'Notificación de recepción'},
  {key:'notification_confirmed',label:'Notificación después de confirmar'},
] as const
export type BusinessCopyKey=typeof businessCopyFields[number]['key']
export type BusinessCopy=Record<BusinessCopyKey,string>
type BusinessSource={business_engine?:string|null;template_slug?:string|null;template_config?:Record<string,any>|null}

const core:BusinessCopy={
  operations_title:'Pedidos y operaciones',operations_singular:'pedido',operations_plural:'pedidos',
  catalog_title:'Productos',catalog_item:'producto',catalog_items:'productos',
  checkout_action:'Confirmar pedido',checkout_success:'¡Pedido recibido!',
  checkout_explanation:'El negocio revisará tu pedido y confirmará los detalles por WhatsApp.',
  instructions_label:'Indicaciones para el pedido',instructions_placeholder:'Ej.: especificaciones, entrega u otras indicaciones...',
  fulfillment_question:'¿Cómo recibirás tu pedido?',dashboard_hint:'Tus pedidos, clientes e ingresos en un solo lugar.',
  notification_pending:'Recibimos tu pedido. En breve verificaremos los detalles.',
  notification_confirmed:'Tu pedido fue confirmado por el negocio.',
}
const profiles:Record<string,Partial<BusinessCopy>>={
 'comida-rapida':{operations_title:'Pedidos de comida',catalog_title:'Menú',catalog_item:'plato',catalog_items:'platos',checkout_action:'Enviar pedido',instructions_placeholder:'Ej.: sin cebolla, sin hielo, salsa aparte...',dashboard_hint:'Controla pedidos, cocina, caja y entregas.',notification_confirmed:'Tu pedido de comida está confirmado. Te avisaremos cuando avance.'},
 'pizzeria':{operations_title:'Pedidos de pizzas',catalog_title:'Menú de pizzas',catalog_item:'pizza',catalog_items:'pizzas',checkout_action:'Pedir pizzas',instructions_placeholder:'Ej.: mitad de un sabor, ingredientes aparte...',dashboard_hint:'Controla pedidos, preparación y delivery de pizzas.'},
 'reposteria':{operations_title:'Encargos de repostería',operations_singular:'encargo',operations_plural:'encargos',catalog_title:'Postres y encargos',catalog_item:'postre',catalog_items:'postres',checkout_action:'Solicitar encargo',checkout_success:'¡Encargo recibido!',checkout_explanation:'La fecha, el diseño y la disponibilidad se confirman con el negocio; el envío no garantiza su aceptación.',instructions_label:'Detalles del encargo',instructions_placeholder:'Ej.: tema, colores, mensaje, porciones y decoración...',fulfillment_question:'¿Cómo quieres recibir tu encargo?',dashboard_hint:'Consulta encargos, fechas solicitadas y clientes.',notification_pending:'Recibimos tu solicitud de encargo. Confirmaremos disponibilidad y fecha.'},
 'boutique':{operations_title:'Ventas y pedidos de moda',catalog_title:'Colección',catalog_item:'prenda',catalog_items:'prendas',checkout_action:'Enviar compra',instructions_placeholder:'Ej.: talla, preferencia de color o detalles...',dashboard_hint:'Monitorea prendas, pedidos, inventario y clientes.'},
 'cosmeticos':{operations_title:'Pedidos de cosméticos',catalog_title:'Cosméticos',checkout_action:'Enviar compra',instructions_placeholder:'Ej.: tono, presentación o referencia...',dashboard_hint:'Gestiona tonos, presentaciones, inventario y ventas.'},
 'tecnologia':{operations_title:'Ventas y consultas técnicas',catalog_title:'Equipos y accesorios',catalog_item:'equipo',catalog_items:'equipos',checkout_action:'Enviar pedido',instructions_placeholder:'Ej.: modelo, almacenamiento, color, compatibilidad...',dashboard_hint:'Consulta disponibilidad, equipos y solicitudes comerciales.'},
 'ferreteria':{operations_title:'Solicitudes y presupuestos',operations_singular:'solicitud',operations_plural:'solicitudes',catalog_title:'Materiales y herramientas',catalog_item:'artículo',catalog_items:'artículos',checkout_action:'Solicitar cotización',checkout_success:'¡Solicitud de presupuesto recibida!',checkout_explanation:'El comercio revisará cantidades, disponibilidad y presupuesto antes de acordar el pago.',instructions_label:'Medidas y especificaciones',instructions_placeholder:'Ej.: largo, diámetro, unidades, obra y marcas preferidas...',dashboard_hint:'Controla materiales, cotizaciones y ventas.',notification_pending:'Recibimos tu solicitud de materiales. Revisaremos precios y disponibilidad.'},
 'repuestos':{operations_title:'Consultas de repuestos',operations_singular:'consulta',operations_plural:'consultas',catalog_title:'Repuestos y accesorios',catalog_item:'repuesto',catalog_items:'repuestos',checkout_action:'Consultar compatibilidad',checkout_success:'¡Consulta recibida!',checkout_explanation:'El comercio verificará compatibilidad y disponibilidad antes de confirmar la venta.',instructions_label:'Datos del vehículo',instructions_placeholder:'Ej.: marca, modelo, año, motor y referencia de la pieza...',dashboard_hint:'Gestiona repuestos, compatibilidad y cotizaciones.',notification_pending:'Recibimos tu consulta de repuestos. Verificaremos la compatibilidad antes de cotizar.'},
 'salon-belleza':{operations_title:'Solicitudes de citas',operations_singular:'solicitud de cita',operations_plural:'solicitudes de cita',catalog_title:'Servicios de belleza',catalog_item:'servicio',catalog_items:'servicios',checkout_action:'Solicitar cita',checkout_success:'¡Solicitud de cita recibida!',checkout_explanation:'La fecha y hora solicitadas están pendientes de confirmación por el salón. Este envío no reserva un cupo automáticamente.',instructions_label:'Preferencias del servicio',instructions_placeholder:'Ej.: estilista preferido, cabello, tratamiento o disponibilidad...',fulfillment_question:'¿Dónde deseas recibir el servicio?',dashboard_hint:'Revisa solicitudes de citas, servicios y clientes.',notification_pending:'Recibimos tu solicitud de cita. El salón confirmará fecha y hora.',notification_confirmed:'El salón confirmó tu solicitud. Verifica fecha y hora acordadas.'},
 'barberia':{operations_title:'Solicitudes de turnos',operations_singular:'solicitud de turno',operations_plural:'solicitudes de turno',catalog_title:'Cortes y servicios',catalog_item:'servicio',catalog_items:'servicios',checkout_action:'Solicitar turno',checkout_success:'¡Solicitud de turno recibida!',checkout_explanation:'La barbería debe confirmar tu horario. La solicitud no bloquea automáticamente un turno.',instructions_label:'Preferencias del corte',instructions_placeholder:'Ej.: estilo, barbero preferido o tiempo disponible...',fulfillment_question:'¿Dónde deseas tu servicio?',dashboard_hint:'Gestiona solicitudes de turno y atención al cliente.',notification_pending:'Recibimos tu solicitud de turno. Te confirmaremos disponibilidad.',notification_confirmed:'Tu turno fue confirmado por la barbería. Comprueba la hora acordada.'},
 'pet-shop':{operations_title:'Pedidos para mascotas',catalog_title:'Tienda para mascotas',checkout_action:'Enviar pedido',instructions_placeholder:'Ej.: edad de tu mascota, talla, sabor o indicaciones...',dashboard_hint:'Administra alimentación, accesorios y pedidos.'},
 'floristeria':{operations_title:'Encargos florales',operations_singular:'encargo',operations_plural:'encargos',catalog_title:'Arreglos florales',catalog_item:'arreglo',catalog_items:'arreglos',checkout_action:'Solicitar arreglo',checkout_success:'¡Solicitud de arreglo recibida!',checkout_explanation:'La floristería verificará flores, personalización y fecha solicitada antes de confirmar.',instructions_label:'Dedicatoria e indicaciones',instructions_placeholder:'Ej.: tarjeta, colores, destinatario e instrucciones de entrega...',fulfillment_question:'¿Cómo deseas recibir el arreglo?',dashboard_hint:'Organiza arreglos, dedicatorias y entregas.',notification_pending:'Recibimos tu solicitud floral. Confirmaremos flores y fecha de entrega.'},
 'regalos-personalizados':{operations_title:'Pedidos personalizados',operations_singular:'solicitud',operations_plural:'solicitudes',catalog_title:'Regalos personalizados',checkout_action:'Solicitar personalización',checkout_success:'¡Solicitud de personalización recibida!',checkout_explanation:'El negocio revisará diseño, costos y fecha de producción antes de confirmar.',instructions_label:'Detalles del diseño',instructions_placeholder:'Ej.: nombre, tipografía, frase, colores y referencias...',dashboard_hint:'Gestiona diseños, presupuestos y producción.',notification_pending:'Recibimos tu solicitud de personalización. Revisaremos diseño y presupuesto.'},
 'suplementos':{operations_title:'Pedidos de productos naturales',catalog_title:'Productos naturales',checkout_action:'Enviar pedido',instructions_placeholder:'Ej.: presentación o sabor elegido...',dashboard_hint:'Controla productos, variantes y existencias.'},
 'mayorista-distribuidor':{operations_title:'Cotizaciones mayoristas',operations_singular:'cotización',operations_plural:'cotizaciones',catalog_title:'Catálogo por volumen',checkout_action:'Solicitar precio por volumen',checkout_success:'¡Cotización mayorista recibida!',checkout_explanation:'Se revisarán unidades, precios por volumen y condiciones comerciales antes de confirmar.',instructions_label:'Detalle de abastecimiento',instructions_placeholder:'Ej.: cantidades, unidades por caja, frecuencia y datos comerciales...',dashboard_hint:'Controla clientes empresariales y propuestas por volumen.',notification_pending:'Recibimos tu solicitud mayorista. Te enviaremos las condiciones comerciales.'},
 'otro-negocio':{dashboard_hint:'Catálogo, solicitudes, clientes y conversaciones en un solo lugar.'},
}
export const businessCopyProfileSlugs=Object.keys(profiles)
const FALLBACK_BY_ENGINE:Record<string,string>={food:'comida-rapida',services:'salon-belleza',quotation:'ferreteria',wholesale:'mayorista-distribuidor',fashion:'boutique',catalog:'tecnologia'}
export function getBusinessCopy(store?:BusinessSource|null):BusinessCopy{
  const slug=String(store?.template_slug||store?.template_config?.module_profile||'').trim()
  const config=store?.template_config||{}
  const base:BusinessCopy={...core,...(profiles[slug]||profiles[FALLBACK_BY_ENGINE[String(store?.business_engine||'')]||'otro-negocio'])}
  // Maintain a single vocabulary if the traditional item_label fields were customized.
  if(typeof config.item_label==='string'&&config.item_label.trim())base.catalog_item=config.item_label.trim().slice(0,100)
  if(typeof config.item_label_plural==='string'&&config.item_label_plural.trim())base.catalog_items=config.item_label_plural.trim().slice(0,100)
  // Customization lives in each template's settings and is copied to new stores.
  const overrides=config.interface_copy
  if(overrides&&typeof overrides==='object'&&!Array.isArray(overrides)){
    for(const field of businessCopyFields){
      const value=(overrides as Record<string,unknown>)[field.key]
      if(typeof value==='string'&&value.trim().length>0&&value.length<=350)base[field.key]=value.trim()
    }
  }
  return base
}
export function operationDisplayName(flowType:string|undefined,store?:BusinessSource|null){
  if(flowType==='reservation')return store?.business_engine==='services'?getBusinessCopy(store).operations_singular:'Reserva de mesa'
  if(flowType==='quote')return getBusinessCopy(store).operations_singular
  return getBusinessCopy(store).operations_singular
}
export function availableOrderStatuses(flowType?:string,store?:BusinessSource|null,deliveryType?:string):Array<[string,string]>{
  if(flowType==='quote')return [['pending','Recibida'],['confirmed','En revisión'],['preparing','En gestión'],['ready','Propuesta lista'],['canceled','Cancelada']]
  if(store?.business_engine==='services')return [['pending','Solicitada'],['confirmed','Confirmada con cliente'],['preparing','En atención'],['ready','Servicio terminado'],['picked_up','Finalizada'],['canceled','Cancelada']]
  if(deliveryType==='dine_in')return [['pending','Pendiente'],['confirmed','Confirmada'],['preparing','En preparación'],['ready','Lista'],['delivered','Servida'],['canceled','Cancelada']]
  if(deliveryType==='pickup'||deliveryType==='local')return [['pending','Pendiente'],['confirmed','Confirmada'],['preparing','Preparando'],['ready','Lista'],['picked_up','Entregada'],['canceled','Cancelada']]
  if(deliveryType==='phone')return [['pending','Pendiente'],['confirmed','Confirmada'],['preparing','Preparando'],['ready','Lista'],['picked_up','Recogida'],['delivered','Entregada'],['canceled','Cancelada']]
  return [['pending','Pendiente'],['confirmed','Confirmada'],['preparing','Preparando'],['ready','Lista'],['out_for_delivery','En camino'],['delivered','Entregada'],['canceled','Cancelada']]
}
