/**
 * Módulos operativos por tipo de comercio.
 * Siempre visibles: inicio, pedidos/solicitudes, clientes, catálogo,
 * ajustes de tienda y WhatsApp. Lo opcional se administra por plantilla.
 * Ocultar un módulo es una decisión de experiencia, no una autorización API.
 */
export const merchantModuleCatalog = [
  {id:'pos',label:"Punto de venta",group:"Ventas",description:"Ventas presenciales y pedidos por teléfono."},
  {id:'cash',label:"Caja",group:"Ventas",description:"Turnos, movimientos y arqueo de efectivo."},
  {id:'quotes',label:"Cotizaciones",group:"Ventas",description:"Propuestas, presupuestos y seguimiento."},
  {id:'combos',label:"Combos y paquetes",group:"Catálogo",description:"Paquetes de artículos con precio propio."},
  {id:'media',label:"Galería",group:"Catálogo",description:"Imágenes organizadas para productos y tienda."},
  {id:'attributes',label:"Opciones y atributos",group:"Catálogo",description:"Tallas, modelos, medidas y especificaciones."},
  {id:'coupons',label:"Cupones",group:"Marketing",description:"Códigos de descuento para clientes."},
  {id:'promotions',label:"Promociones",group:"Marketing",description:"Ofertas programadas y precios promocionales."},
  {id:'branches',label:"Sucursales",group:"Operación",description:"Gestión de varias ubicaciones."},
  {id:'delivery',label:"Entregas",group:"Operación",description:"Repartidores, rutas y liquidaciones de delivery."},
  {id:'reservations',label:"Reservaciones de mesas",group:"Gastronomía",description:"Reservas de mesas con horario y comensales."},
  {id:'tables',label:"Gestión de mesas",group:"Gastronomía",description:"Áreas, mesas, ocupación y capacidad."},
  {id:'kds',label:"Pantalla de preparación",group:"Gastronomía",description:"Pedidos vivos por estaciones de cocina."},
  {id:'automations',label:"Automatizaciones",group:"Comunicación",description:"Mensajes automáticos y seguimientos."},
  {id:'flows',label:"Flow Builder",group:"Comunicación",description:"Editor avanzado de flujos conversacionales."},
  {id:'voice',label:"Voz y transcripción",group:"Comunicación",description:"Procesamiento de voz y transcripción."},
  {id:'calls',label:"Llamadas WhatsApp",group:"Comunicación",description:"Softphone y llamadas desde el navegador."},
  {id:'social',label:"Publicaciones sociales",group:"Marketing",description:"Publicación y programación en redes."},
  {id:'crm',label:"CRM comercial",group:"Clientes",description:"Oportunidades, historial comercial y seguimiento."},
  {id:'tasks',label:"Tareas",group:"Clientes",description:"Pendientes y responsables del negocio."},
  {id:'evaluations',label:"Evaluaciones",group:"Clientes",description:"Encuestas y evaluaciones de atención."},
  {id:'reviews',label:"Reseñas",group:"Clientes",description:"Opiniones y reputación del comercio."},
  {id:'loyalty',label:"Fidelización",group:"Marketing",description:"Recompensas y fidelización de clientes."},
  {id:'analytics',label:"Analítica",group:"Operación",description:"Indicadores y desempeño comercial."},
  {id:'staff',label:"Equipo y usuarios",group:"Operación",description:"Permisos y acceso del personal."},
  {id:'payments',label:"Métodos de pago",group:"Ventas",description:"Configura efectivo, transferencias y terminales."},
] as const
export type MerchantModuleId=typeof merchantModuleCatalog[number]['id']
export type MerchantModuleFlags=Record<MerchantModuleId,boolean>
const allIds:MerchantModuleId[]=merchantModuleCatalog.map(x=>x.id)
const byEngine:Record<string,readonly MerchantModuleId[]>={
  'retail':['pos','cash','media','attributes','coupons','promotions','delivery','automations','reviews','loyalty','analytics','payments'],
  'fashion':['pos','cash','media','attributes','coupons','promotions','delivery','automations','reviews','loyalty','analytics','payments','social'],
  'food':['pos','cash','combos','media','coupons','promotions','delivery','kds','tables','reservations','automations','reviews','loyalty','analytics','payments'],
  'catalog':['pos','cash','media','attributes','coupons','promotions','delivery','automations','reviews','analytics','payments'],
  'quotation':['quotes','media','attributes','delivery','automations','crm','tasks','analytics','payments'],
  'services':['media','automations','crm','tasks','reviews','analytics','payments'],
  'wholesale':['pos','cash','quotes','media','attributes','branches','delivery','automations','crm','tasks','analytics','payments'],
}
const byTemplate:Record<string,Partial<MerchantModuleFlags>>={
  'comida-rapida':{'pos':true,'cash':true,'combos':true,'kds':true,'delivery':true},
  'pizzeria':{'pos':true,'cash':true,'combos':true,'kds':true,'delivery':true},
  'reposteria':{'kds':false,'combos':false,'quotes':true,'crm':true,'tasks':true,'delivery':true,'loyalty':false},
  'boutique':{'attributes':true,'social':true,'quotes':false},
  'cosmeticos':{'attributes':true,'social':true,'quotes':false},
  'tecnologia':{'attributes':true,'quotes':true,'crm':true,'tasks':true,'loyalty':false},
  'ferreteria':{'pos':true,'cash':true,'quotes':true,'crm':true,'tasks':true,'loyalty':false,'coupons':false},
  'repuestos':{'pos':true,'cash':true,'quotes':true,'crm':true,'tasks':true,'loyalty':false,'coupons':false},
  'salon-belleza':{'pos':false,'cash':false,'quotes':false,'delivery':false,'promotions':true,'social':true,'loyalty':true,'staff':true},
  'barberia':{'pos':false,'cash':false,'quotes':false,'delivery':false,'promotions':true,'social':true,'loyalty':true},
  'pet-shop':{'quotes':false,'social':true},
  'floristeria':{'quotes':true,'crm':true,'tasks':true,'social':true,'combos':true,'attributes':false},
  'regalos-personalizados':{'quotes':true,'crm':true,'tasks':true,'delivery':true,'social':true,'cash':false,'loyalty':false},
  'suplementos':{'quotes':false,'social':true,'loyalty':true,'attributes':true},
  'mayorista-distribuidor':{'pos':true,'cash':true,'quotes':true,'coupons':false,'promotions':false,'loyalty':false,'crm':true,'branches':true,'staff':true},
  'otro-negocio':{'pos':false,'cash':false,'quotes':false,'attributes':false,'coupons':false,'promotions':false,'delivery':true,'automations':false,'loyalty':false,'reviews':false,'media':true,'analytics':true,'payments':true},
}
type ModuleStore={business_engine?:string|null;template_slug?:string|null;template_config?:Record<string,unknown>|null}
export function getMerchantModules(store:ModuleStore|null|undefined):MerchantModuleFlags{
  const engine=String(store?.business_engine||'retail').toLowerCase()
  const slug=String(store?.template_slug||store?.template_config?.module_profile||'')
  const defaults=byEngine[engine]||byEngine.retail
  const flags={} as MerchantModuleFlags
  for(const id of allIds)flags[id]=defaults.includes(id)
  Object.assign(flags,byTemplate[slug]||{})
  const configured=store?.template_config?.module_features
  if(configured&&typeof configured==='object'&&!Array.isArray(configured)){
    for(const id of allIds){const value=(configured as Record<string,unknown>)[id];if(typeof value==='boolean')flags[id]=value}
  }
  // Structural incompatibilities cannot be bypassed by selecting a switch.
  if(engine!=='food') {flags.kds=false;flags.tables=false;flags.reservations=false}
  if(engine==='services') {flags.tables=false;flags.reservations=false;flags.kds=false;flags.combos=false}
  if(store?.template_config?.supports_dine_in===false){flags.tables=false;flags.reservations=false}
  return flags
}

export function isModuleAvailable(store:ModuleStore|null|undefined,id:MerchantModuleId){return getMerchantModules(store)[id]}
export const merchantModuleGroups=Array.from(new Set(merchantModuleCatalog.map(x=>x.group)))
export function profileModuleSummary(store:ModuleStore|null|undefined):string[]{
 const flags=getMerchantModules(store)
 return merchantModuleCatalog.filter(x=>flags[x.id]).map(x=>x.label)
}
