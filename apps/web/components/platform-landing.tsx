'use client'

import Link from 'next/link'
import {useEffect,useMemo,useState} from 'react'
import {QRCodeSVG} from 'qrcode.react'
import AccessModal from '@/components/access-modal'
import WamercioLogo from '@/components/wamercio-logo'
import {api,money} from '@/lib/api'
import type {Plan} from '@/lib/types'
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  ChevronRight,
  ClipboardList,
  Clock3,
  CreditCard,
  Link2,
  Menu,
  MessageCircleMore,
  Package,
  QrCode,
  Search,
  Send,
  ShoppingBag,
  Smartphone,
  Star,
  Store,
  Truck,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react'

type LandingTemplate={
  id:string
  slug:string
  name:string
  family:string
  description:string
  icon:string
  engine:string
  settings?:Record<string,any>
  is_featured?:boolean
  sort_order?:number
}

type LandingFeature={
  icon:any
  title:string
  copy:string
  details:string[]
}

function templateSignals(template:LandingTemplate){
  const settings=template.settings||{}
  const signals:string[]=[]
  if(settings.appointments)signals.push('Reservas')
  if(settings.quotation||template.engine==='quotation')signals.push('Cotizaciones')
  if(settings.wholesale||template.engine==='wholesale')signals.push('Mayoreo')
  if(settings.delivery_enabled!==false&&template.engine!=='services')signals.push('Delivery')
  if(settings.supports_dine_in)signals.push('Mesas')
  if(settings.supports_variants)signals.push('Variantes')
  if(settings.track_stock_default)signals.push('Inventario')
  if(signals.length===0)signals.push(template.engine==='services'?'Agenda y CRM':'Pedidos y catálogo')
  return signals.slice(0,4)
}

function templatePrimaryModules(template:LandingTemplate){
  const settings=template.settings||{}
  if(settings.appointments)return ['WhatsApp','Agenda','CRM','Evaluaciones','Reseñas']
  if(settings.quotation||template.engine==='quotation')return ['WhatsApp','Productos','Cotizaciones','CRM','Tareas']
  if(settings.wholesale||template.engine==='wholesale')return ['Productos','Clientes','Pedidos','Cotizaciones','Analítica']
  if(settings.supports_dine_in)return ['Pedidos','Punto de venta','Caja','Entregas','WhatsApp']
  if(template.engine==='food')return ['Pedidos','Productos','Combos','Entregas','WhatsApp']
  if(template.engine==='fashion')return ['Productos','Galería','Promociones','Clientes','WhatsApp']
  return ['Productos','Clientes','Pedidos','Analítica','WhatsApp']
}

function templatePreviewHighlights(template:LandingTemplate){
  const settings=template.settings||{}
  if(settings.appointments)return ['Reserva desde WhatsApp','Agenda visible para el equipo','Seguimiento y reseñas después del servicio']
  if(settings.quotation||template.engine==='quotation')return ['Consulta antes de vender','Ficha técnica + cotización','Seguimiento comercial por cliente']
  if(settings.wholesale||template.engine==='wholesale')return ['Condiciones por volumen','Catálogo mayorista ordenado','Clientes y pedidos recurrentes']
  if(settings.supports_dine_in)return ['Menú y pedidos rápidos','Mesas, delivery y caja','Operación pensada para rotación']
  if(template.engine==='food')return ['Menú con extras y combos','Pedido por chat sin fricción','Entrega conectada a la conversación']
  if(template.engine==='fashion')return ['Colección visual y stock','Variantes por talla y color','Promociones coherentes con la tienda']
  return ['Catálogo ordenado','Pedidos y clientes conectados','Panel simple para operar']
}

function templateFitCopy(template:LandingTemplate){
  const settings=template.settings||{}
  if(settings.appointments)return 'La plataforma prioriza agenda, CRM y seguimiento para que el negocio vea solo lo que necesita para reservar y atender.'
  if(settings.quotation||template.engine==='quotation')return 'La navegación pone al frente catálogo técnico, cotizaciones y seguimiento comercial.'
  if(settings.wholesale||template.engine==='wholesale')return 'La experiencia se orienta a volumen, clientes recurrentes y control comercial sin distraer con módulos irrelevantes.'
  if(settings.supports_dine_in)return 'El panel combina pedidos, punto de venta, caja y mesas para que el flujo completo se sienta coherente.'
  if(template.engine==='food')return 'La operación se enfoca en vender rápido: menú, combos, pedidos, entregas y conversación.'
  if(template.engine==='fashion')return 'La plantilla da más peso a colección, stock, promociones y clientes para vender visualmente sin ruido.'
  return 'El negocio conserva un panel limpio con catálogo, clientes, pedidos y conversación como núcleo operativo.'
}

function templateSectionHeading(template:LandingTemplate|null){
  if(!template)return 'Todo lo que necesitas para operar. Nada de lo que no necesitas.'
  const settings=template.settings||{}
  if(settings.appointments)return `Todo lo que ${template.name.toLowerCase()} necesita para reservar, atender y dar seguimiento.`
  if(settings.quotation||template.engine==='quotation')return `Todo lo que ${template.name.toLowerCase()} necesita para vender por consulta sin desorden.`
  if(settings.wholesale||template.engine==='wholesale')return `Todo lo que ${template.name.toLowerCase()} necesita para vender por volumen con contexto.`
  if(settings.supports_dine_in)return `Todo lo que ${template.name.toLowerCase()} necesita para operar salón, delivery y caja.`
  if(template.engine==='food')return `Todo lo que ${template.name.toLowerCase()} necesita para vender más rápido por WhatsApp.`
  if(template.engine==='fashion')return `Todo lo que ${template.name.toLowerCase()} necesita para vender visualmente y con orden.`
  return `Todo lo que ${template.name.toLowerCase()} necesita para operar con coherencia.`
}

function templateSectionLead(template:LandingTemplate|null){
  if(!template)return 'WAMERCIO conecta catálogo, pedidos, clientes, pagos y WhatsApp en una sola experiencia, con flujos diseñados para negocios dominicanos.'
  const settings=template.settings||{}
  if(settings.appointments)return 'La plantilla concentra agenda, CRM, recordatorios y reseñas para que el servicio fluya sin módulos innecesarios.'
  if(settings.quotation||template.engine==='quotation')return 'La operación se centra en catálogo técnico, consultas, cotizaciones y seguimiento comercial; no en funciones que no aportan a este tipo de venta.'
  if(settings.wholesale||template.engine==='wholesale')return 'La interfaz prioriza clientes, volumen, listas de precios, pedidos recurrentes y control comercial para trabajar con distribuidores y mayoreo.'
  if(settings.supports_dine_in)return 'La experiencia conecta pedidos, mesas, caja y entrega para que el negocio vea un flujo real de operación y no solo una página bonita.'
  if(template.engine==='food')return 'Se priorizan menú, productos, combos, pedidos, entrega y conversación para que el recorrido del cliente se sienta corto y natural.'
  if(template.engine==='fashion')return 'Se resaltan colección, stock, variantes, galería y promociones para vender mejor desde la conversación y conservar una presentación cuidada.'
  return 'Cada plantilla ordena el panel, la landing pública y la conversación para que el negocio vea menos ruido y más acciones útiles.'
}

function templateFeatureCards(template:LandingTemplate|null,fallback:LandingFeature[]):LandingFeature[]{
  if(!template)return fallback
  const settings=template.settings||{}
  if(settings.appointments)return [
    {icon:MessageCircleMore,title:'Reservas desde WhatsApp',copy:'Convierte conversaciones en reservas organizadas con contexto del cliente.',details:['Solicitud desde chat','Confirmación rápida','Seguimiento posterior']},
    {icon:ClipboardList,title:'Agenda operativa',copy:'Tu equipo ve citas, disponibilidad y seguimiento en un mismo lugar.',details:['Vista del día','Reasignación simple','Historial por servicio']},
    {icon:UsersRound,title:'CRM y seguimiento',copy:'Conserva notas, historial y próximas acciones por cliente.',details:['Ficha del cliente','Recordatorios','Observaciones']},
    {icon:Star,title:'Reseñas y fidelización',copy:'Pide evaluación después del servicio y construye recurrencia real.',details:['Feedback post servicio','Satisfacción visible','Clientes recurrentes']},
  ]
  if(settings.quotation||template.engine==='quotation')return [
    {icon:Boxes,title:'Catálogo técnico',copy:'Organiza productos, compatibilidades y datos clave para vender por consulta.',details:['Campos técnicos','Variantes útiles','Inventario opcional']},
    {icon:ClipboardList,title:'Cotizaciones ordenadas',copy:'Prepara propuestas sin perder contexto entre mensajes, productos y precios.',details:['Resumen claro','Edición rápida','Estados comerciales']},
    {icon:MessageCircleMore,title:'Consulta conectada',copy:'La conversación sigue siendo el centro, pero ahora deja estructura comercial.',details:['Chat con contexto','Respuestas rápidas','Notas internas']},
    {icon:BarChart3,title:'Seguimiento comercial',copy:'Visualiza oportunidades abiertas, tareas y cierres sin moverte de la plataforma.',details:['Embudo simple','Pendientes visibles','Historial por cliente']},
  ]
  if(settings.wholesale||template.engine==='wholesale')return [
    {icon:Boxes,title:'Catálogo mayorista',copy:'Presenta productos por volumen, líneas y condiciones comerciales.',details:['Listas por volumen','Precios escalados','Colecciones útiles']},
    {icon:UsersRound,title:'Clientes y cuentas',copy:'Separa compradores frecuentes y conserva historial comercial por contacto.',details:['Clientes recurrentes','Notas comerciales','Relaciones activas']},
    {icon:ClipboardList,title:'Pedidos recurrentes',copy:'Gestiona pedidos grandes con mejor trazabilidad desde el primer mensaje.',details:['Totales claros','Seguimiento operativo','Repetición sencilla']},
    {icon:BarChart3,title:'Analítica comercial',copy:'Entiende ticket, frecuencia y movimiento por cliente o canal.',details:['Ingresos por cliente','Historial de compra','Visión del negocio']},
  ]
  if(settings.supports_dine_in)return [
    {icon:ShoppingBag,title:'Pedidos desde conversación',copy:'El cliente pide por WhatsApp y el negocio conserva estructura comercial.',details:['Pedido por chat','Confirmación rápida','Menos fricción']},
    {icon:Store,title:'Salón + delivery',copy:'El panel se adapta al trabajo mixto entre consumo en mesa y entrega.',details:['Mesas','Delivery','Retiro en tienda']},
    {icon:CreditCard,title:'Caja conectada',copy:'Cobro, pedido y operación quedan alineados dentro del mismo flujo.',details:['Cobros visibles','Cierres simples','Menos pasos']},
    {icon:Truck,title:'Entrega coordinada',copy:'Dirección, zonas y estado operativo se conectan con el pedido.',details:['Zonas','Despacho','Seguimiento']},
  ]
  if(template.engine==='food')return [
    {icon:ShoppingBag,title:'Menú y combos',copy:'Productos, extras y combos preparados para vender rápido y sin explicaciones largas.',details:['Combos','Extras','Categorías claras']},
    {icon:MessageCircleMore,title:'Pedido por WhatsApp',copy:'La conversación se convierte en pedido sin sacar al cliente del canal que ya usa.',details:['Chat con contexto','Menos abandono','Confirmación rápida']},
    {icon:Truck,title:'Entrega y retiro',copy:'Coordina zonas, horarios y estados según el tipo de pedido.',details:['Delivery','Retiro','Estados']},
    {icon:WalletCards,title:'Caja y cobro',copy:'Visualiza cobro y ticket promedio como parte de la operación diaria.',details:['Métodos de pago','Ticket medio','Resumen comercial']},
  ]
  if(template.engine==='fashion')return [
    {icon:ShoppingBag,title:'Colección visual',copy:'La landing y el catálogo destacan imagen, identidad y presentación.',details:['Galería','Colecciones','Presentación cuidada']},
    {icon:Boxes,title:'Tallas y colores',copy:'Variantes y stock se organizan para vender sin confusiones en el chat.',details:['Variantes','Inventario','Opciones claras']},
    {icon:UsersRound,title:'Clientes y estilo',copy:'Conserva preferencias, compras previas y relación con cada comprador.',details:['Historial','CRM simple','Seguimiento']},
    {icon:Star,title:'Promociones activas',copy:'Crea una operación más comercial con promos, lanzamientos y recurrencia.',details:['Promociones','Campañas','Temporadas']},
  ]
  return fallback
}

function splitHeroTitle(title:string){
  const parts=title.split(/(WhatsApp)/gi)
  return parts.map((part,index)=>part.toLowerCase()==='whatsapp'?<span key={index} className="text-[#0e8347]">{part}</span>:<span key={index}>{part}</span>)
}

function HeroPreview({template}:{template:LandingTemplate|null}){
  const modules=template?templatePrimaryModules(template):['Pedidos','Productos','Clientes','WhatsApp','Analítica']
  const highlights=template?templatePreviewHighlights(template):['Catálogo ordenado','Pedidos y clientes conectados','Panel simple para operar']
  return <div className="relative overflow-hidden rounded-[30px] border border-[#e3dcd1] bg-white shadow-[0_28px_80px_rgba(25,22,17,.08)]">
    <div className="flex items-center gap-3 border-b border-[#efe8dc] px-4 py-3 sm:px-5">
      <img src="/brand/wamercio-logo-full.webp" alt="WAMERCIO" className="h-8 w-auto object-contain sm:h-9"/>
      <div className="hidden flex-1 items-center gap-2 rounded-xl border border-[#e7e0d5] px-3 py-2 text-[11px] text-[#8b8375] lg:flex"><Search className="h-4 w-4"/>Buscar pedidos, productos, clientes <span className="ml-auto rounded-md border border-[#e7e0d5] px-2 py-0.5 text-[10px]">Ctrl K</span></div>
      <span className="inline-flex items-center gap-2 rounded-xl bg-[#eef8f3] px-3 py-2 text-[11px] font-bold text-[#0b5d3b]"><Store className="h-4 w-4"/>Pizzería Freddy</span>
    </div>
    <div className="grid lg:grid-cols-[255px_1fr]">
      <aside className="bg-[#0b5d3b] p-5 text-white">
        <WamercioLogo mode="compact" light subtitle="Panel del comercio"/>
        <div className="mt-5 rounded-[22px] border border-white/10 bg-white/10 p-4">
          <div className="text-[10px] font-extrabold uppercase tracking-[.18em] text-white/60">Plantilla activa</div>
          <div className="mt-2 text-xl font-extrabold tracking-[-.03em]">{template?.name||'Comercio general'}</div>
          <p className="mt-2 text-xs leading-5 text-white/72">{template?templateFitCopy(template):'Un panel que habla el mismo idioma que tu negocio.'}</p>
        </div>
        <div className="mt-5 space-y-2">
          {modules.map((module,index)=><div key={module} className={`rounded-xl px-3 py-2 text-[12px] font-semibold ${index===0?'bg-white text-[#0b5d3b]':'bg-white/10 text-white/82'}`}>{module}</div>)}
        </div>
      </aside>
      <div className="bg-[#fbf8f3] p-4 sm:p-5 lg:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {[[template?.settings?.appointments?'Reservas hoy':'Pedidos hoy','24'],['Ventas','RD$ 12,480'],[template?.settings?.quotation?'Cotizaciones':'Clientes','8']].map(([label,value],index)=><div key={String(label)} className={`rounded-2xl border px-4 py-4 ${index===0?'border-[#d6ecdf] bg-[#eef8f3]':'border-[#e8e0d4] bg-white'}`}><div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#7e7a72]">{label}</div><div className="mt-2 text-2xl font-extrabold tracking-[-.03em] text-[#0a3f2a]">{value}</div><div className="mt-1 text-[11px] text-[#718078]">Operación visible y conectada.</div></div>)}
        </div>
        <div className="mt-4 rounded-[24px] border border-[#e8e0d4] bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#0e8347]">Vista pública + operación</div>
              <h3 className="mt-2 text-xl font-extrabold tracking-[-.03em] text-[#0a3f2a]">La landing, el panel y el chat trabajan como un mismo producto.</h3>
            </div>
            <div className="flex flex-wrap gap-2">{highlights.map(item=><span key={item} className="rounded-full border border-[#e6ddd0] bg-[#fbf8f3] px-3 py-1.5 text-[10px] font-bold text-[#0a3f2a]">{item}</span>)}</div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {['Comparte el enlace','Recibe la orden en WhatsApp','Opera desde un panel coherente'].map((step,index)=><div key={step} className="rounded-2xl bg-[#f8f5ef] p-4"><div className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#0e8347]">Paso {index+1}</div><div className="mt-2 text-sm font-bold text-[#0a3f2a]">{step}</div><p className="mt-1 text-[11px] leading-5 text-[#6e6759]">El flujo comercial se siente corto, claro y alineado con el tipo de negocio.</p></div>)}
          </div>
        </div>
      </div>
    </div>
  </div>
}

function ChatCommerceMock(){
  return <div className="overflow-hidden rounded-[28px] border border-[#dfd6ca] bg-white shadow-[0_24px_60px_rgba(25,22,17,.08)]">
    <div className="flex items-center gap-3 bg-[#0b5d3b] px-4 py-3 text-white">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-sm font-extrabold">PF</span>
      <div>
        <div className="text-sm font-bold">Pizzería Freddy</div>
        <div className="text-[10px] text-white/65">Conectado a WAMERCIO</div>
      </div>
      <MessageCircleMore className="ml-auto h-4 w-4"/>
    </div>
    <div className="space-y-3 bg-[#f7f3ec] p-4 sm:p-5" style={{backgroundImage:"linear-gradient(rgba(247,243,236,.96),rgba(247,243,236,.96)),url('/wacatalog-inspired/chat-pattern.png')",backgroundSize:'290px'}}>
      <div className="max-w-[82%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-[13px] leading-6 text-[#46584f] shadow-sm">Hola 👋 Vi el enlace de su tienda. Quiero una pizza pepperoni y una orden de pan de ajo.</div>
      <div className="ml-auto max-w-[82%] rounded-2xl rounded-tr-sm bg-[#dff4e7] px-4 py-3 text-[13px] leading-6 text-[#0a3f2a] shadow-sm">Perfecto. Ya te armé el pedido. ¿Lo quieres para entrega o retiro?</div>
      <div className="max-w-[86%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-[13px] leading-6 text-[#46584f] shadow-sm">Entrega en Bonao, sector Los Jardines.</div>
      <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-sm bg-[#dff4e7] p-4 shadow-sm"><div className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#0e8347]">Resumen del pedido</div><div className="mt-3 space-y-2 text-[13px] text-[#0a3f2a]"><div className="flex items-center justify-between"><span>1 × Pizza Pepperoni</span><strong>RD$ 950</strong></div><div className="flex items-center justify-between"><span>1 × Pan de ajo</span><strong>RD$ 430</strong></div></div><div className="mt-3 border-t border-[#c7e7d2] pt-3 text-right text-lg font-extrabold text-[#0a3f2a]">RD$ 1,380</div></div>
      <div className="ml-auto max-w-[76%] rounded-2xl rounded-tr-sm bg-[#dff4e7] px-4 py-3 text-[13px] font-semibold text-[#0a3f2a] shadow-sm">Listo ✅ Confirmado y visible en el panel.</div>
    </div>
    <div className="flex items-center gap-2 border-t border-[#ece5db] bg-white p-3">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-[#f3eee5] text-[#6e6759]"><Link2 className="h-4 w-4"/></span>
      <div className="h-10 flex-1 rounded-full border border-[#e5ddd2] bg-[#fbfaf8]"/>
      <span className="grid h-10 w-10 place-items-center rounded-full bg-[#0b5d3b] text-white"><Send className="h-4 w-4"/></span>
    </div>
  </div>
}

function TemplatePreview({template}:{template:LandingTemplate|null}){
  const modules=template?templatePrimaryModules(template):['Productos','Clientes','Pedidos','Analítica','WhatsApp']
  const signals=template?templateSignals(template):['Pedidos y catálogo']
  const highlights=template?templatePreviewHighlights(template):['Catálogo ordenado','Pedidos y clientes conectados','Panel simple para operar']
  return <div className="overflow-hidden rounded-[28px] border border-[#e3dcd1] bg-white shadow-[0_24px_60px_rgba(25,22,17,.08)]">
    <div className="grid xl:grid-cols-[280px_1fr]">
      <aside className="bg-[#0b5d3b] p-5 text-white">
        <WamercioLogo mode="compact" light subtitle="Experiencia adaptativa"/>
        <div className="mt-5 rounded-[22px] border border-white/10 bg-white/10 p-4">
          <div className="text-[10px] font-extrabold uppercase tracking-[.16em] text-white/60">Plantilla</div>
          <div className="mt-2 text-xl font-extrabold tracking-[-.03em]">{template?.name||'Comercio general'}</div>
          <div className="mt-2 flex flex-wrap gap-2">{signals.map(signal=><span key={signal} className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white/85">{signal}</span>)}</div>
          <p className="mt-4 text-xs leading-5 text-white/72">{template?templateFitCopy(template):'La plataforma se adapta al flujo de cada negocio.'}</p>
        </div>
        <div className="mt-5 space-y-2">{modules.map((module,index)=><div key={module} className={`rounded-xl px-3 py-2 text-[12px] font-semibold ${index===0?'bg-white text-[#0b5d3b]':'bg-white/10 text-white/82'}`}>{module}</div>)}</div>
      </aside>
      <div className="bg-[#fbf8f3] p-5 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#0e8347]">Panel adaptado al negocio</div>
            <h3 className="mt-2 text-2xl font-extrabold tracking-[-.03em] text-[#0a3f2a]">Tu operación ve lo que sí necesita.</h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5c675f]">La plantilla elegida reorganiza la landing pública, el panel interno y el tipo de conversación que impulsa la venta o el servicio.</p>
          </div>
          <div className="flex flex-wrap gap-2">{highlights.map(item=><span key={item} className="rounded-full border border-[#e5ddd2] bg-white px-3 py-1.5 text-[10px] font-bold text-[#0a3f2a]">{item}</span>)}</div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[[template?.settings?.appointments?'Reservas hoy':'Pedidos hoy','24'],[template?.settings?.quotation?'Cotizaciones activas':'Ventas del día','RD$ 12,480'],['Clientes con contexto','18']].map(([label,value],index)=><div key={String(label)} className={`rounded-[20px] border px-4 py-4 ${index===0?'border-[#d6ecdf] bg-[#eef8f3]':'border-[#e5ddd2] bg-white'}`}><div className="text-[10px] font-bold uppercase tracking-[.14em] text-[#718078]">{label}</div><div className="mt-2 text-2xl font-extrabold tracking-[-.03em] text-[#0a3f2a]">{value}</div><div className="mt-1 text-[11px] text-[#718078]">Flujo real dentro del panel.</div></div>)}
        </div>
      </div>
    </div>
  </div>
}

function FeatureCard({feature}:{feature:LandingFeature}){
  const Icon=feature.icon
  return <article className="rounded-[24px] border border-[#e3dcd1] bg-white p-5 shadow-[0_12px_30px_rgba(25,22,17,.04)]">
    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#eef8f3] text-[#0e8347]"><Icon className="h-5 w-5"/></span>
    <h3 className="mt-4 text-lg font-extrabold tracking-[-.02em] text-[#0a3f2a]">{feature.title}</h3>
    <p className="mt-2 text-sm leading-6 text-[#6e6759]">{feature.copy}</p>
    <div className="mt-4 flex flex-wrap gap-2">{feature.details.map(detail=><span key={detail} className="rounded-full bg-[#f6f2eb] px-2.5 py-1 text-[10px] font-bold text-[#506158]">{detail}</span>)}</div>
  </article>
}

export default function PlatformLanding(){
  const[accessOpen,setAccessOpen]=useState(false)
  const[mobileOpen,setMobileOpen]=useState(false)
  const[plans,setPlans]=useState<Plan[]>([])
  const[templates,setTemplates]=useState<LandingTemplate[]>([])
  const[activeTemplateId,setActiveTemplateId]=useState('')
  const[platform,setPlatform]=useState<any>(null)

  useEffect(()=>{
    api<Plan[]>('/plans').then(setPlans).catch(()=>{})
    api<LandingTemplate[]>('/templates').then(setTemplates).catch(()=>{})
    api('/public/platform').then(setPlatform).catch(()=>{})
    if(typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('access')==='1')setAccessOpen(true)
  },[])

  const landing=platform?.landing||{}
  const domain=typeof window!=='undefined'?window.location.hostname:'wamercio.com'
  const text=(value:any,fallback:string)=>String(value||fallback).replaceAll('{domain}',domain)
  const open=()=>{setMobileOpen(false);setAccessOpen(true)}

  const defaultFeatures=useMemo<LandingFeature[]>(()=>[
    {icon:Boxes,title:text(landing.feature_1_title,'Catálogo listo una sola vez'),copy:text(landing.feature_1_text,'Crea productos, precios, variantes e inventario desde un panel pensado para vender por conversación.'),details:['Variantes e inventario','Colecciones y categorías','Enlace y QR siempre actualizados']},
    {icon:MessageCircleMore,title:text(landing.feature_2_title,'Toma el pedido en el chat'),copy:text(landing.feature_2_text,'Conecta WhatsApp y convierte conversaciones reales en pedidos organizados sin perder contexto.'),details:['Chat conectado al pedido','Respuestas rápidas','Historial por cliente']},
    {icon:WalletCards,title:text(landing.feature_3_title,'Cobra como trabaja tu negocio'),copy:text(landing.feature_3_text,'Efectivo, transferencia, terminal y métodos locales, con el estado del cobro ligado al pedido.'),details:['Efectivo y transferencia','Pagos registrados','Resumen comercial']},
    {icon:Truck,title:text(landing.feature_4_title,'Entrega sin romper la conversación'),copy:text(landing.feature_4_text,'Coordina entrega, dirección, zonas y seguimiento sin obligar al cliente a abandonar WhatsApp.'),details:['Zonas de entrega','Direcciones estructuradas','Seguimiento operativo']},
  ],[landing,domain])

  const templateShowcase=useMemo(()=>[...templates].sort((a,b)=>Number(!!b.is_featured)-Number(!!a.is_featured)||Number(a.sort_order||999)-Number(b.sort_order||999)).slice(0,9),[templates])
  const activeTemplate=useMemo(()=>templateShowcase.find(template=>template.id===activeTemplateId)||templateShowcase[0]||null,[templateShowcase,activeTemplateId])
  useEffect(()=>{
    if(templateShowcase.length&&!templateShowcase.some(template=>template.id===activeTemplateId))setActiveTemplateId(templateShowcase[0].id)
  },[templateShowcase,activeTemplateId])
  const adaptiveFeatures=useMemo(()=>templateFeatureCards(activeTemplate,defaultFeatures),[activeTemplate,defaultFeatures])

  if(landing.maintenance_mode){
    return <main className="grid min-h-dvh place-items-center bg-[#fbf8f3] p-6 text-[#0a3f2a]">
      <AccessModal open={accessOpen} onClose={()=>setAccessOpen(false)}/>
      <div className="w-full max-w-2xl rounded-[28px] border border-[#e6ded1] bg-white p-8 shadow-[0_30px_80px_rgba(25,22,17,.10)] sm:p-12">
        <WamercioLogo/>
        <div className="mt-8 inline-flex rounded-full bg-[#e3f6ea] px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-[#0e8347]">{text(landing.maintenance_badge,'Mantenimiento programado')}</div>
        <h1 className="mt-5 text-3xl font-extrabold tracking-[-.035em] sm:text-4xl">{text(landing.maintenance_title,'Estamos realizando mejoras en la página principal')}</h1>
        <p className="mt-4 text-sm leading-7 text-[#6e6759]">{text(landing.maintenance_text,'La página principal estará temporalmente en mantenimiento. Los negocios activos continúan operando desde sus enlaces públicos.')}</p>
        <button onClick={open} className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-[#bd431e] px-5 py-3 text-sm font-bold text-white">{text(landing.maintenance_button_label,'Entrar al panel de administración')}<ArrowRight className="h-4 w-4"/></button>
      </div>
    </main>
  }

  const heroTitle=text(landing.hero_title,'Toda tu tienda funciona dentro de WhatsApp.')
  const nav=[
    ['#como-funciona',text(landing.nav_features_label,'Cómo funciona')],
    ['#plantillas',text(landing.nav_product_label,'Plantillas')],
    ['#funciones',text(landing.nav_prices_label,'Funciones')],
    ['#precios',text(landing.nav_prices_label,'Precios')],
    ['#demo',text(landing.nav_demo_label,'Demo')],
  ]

  return <main className="min-h-dvh overflow-x-hidden bg-[#fbf8f3] text-[#46584f]">
    <AccessModal open={accessOpen} onClose={()=>setAccessOpen(false)}/>

    <header className="sticky top-0 z-50 border-b border-[#eee7dd]/90 bg-[#fbf8f3]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[78px] max-w-[1320px] items-center px-5 sm:px-8 lg:px-10">
        <Link href="/" aria-label="WAMERCIO" className="shrink-0"><WamercioLogo mode="full"/></Link>
        <nav className="ml-auto hidden items-center gap-7 text-[12px] font-semibold text-[#46584f] lg:flex">
          {nav.map(([href,label])=><a key={href} href={href} className="transition hover:text-[#0b5d3b]">{label}</a>)}
          <Link href="/terminos" className="transition hover:text-[#0b5d3b]">Términos</Link>
        </nav>
        <button onClick={open} className="ml-auto hidden rounded-xl border border-[#0b5d3b] px-4 py-2 text-[11px] font-bold text-[#0b5d3b] transition hover:bg-[#0b5d3b] hover:text-white lg:ml-7 lg:inline-flex">{text(landing.nav_access_label,'Iniciar sesión')}</button>
        <button onClick={open} className="ml-3 hidden rounded-xl bg-[#bd431e] px-4 py-2 text-[11px] font-bold text-white transition hover:bg-[#9c3517] sm:inline-flex">Crear comercio</button>
        <button aria-label="Abrir menú" onClick={()=>setMobileOpen(v=>!v)} className="ml-auto grid h-10 w-10 place-items-center rounded-xl border border-[#e6ded1] text-[#0a3f2a] lg:hidden">{mobileOpen?<X className="h-5 w-5"/>:<Menu className="h-5 w-5"/>}</button>
      </div>
      {mobileOpen&&<div className="border-t border-[#eee7dd] bg-[#fbf8f3] px-5 py-4 lg:hidden"><nav className="mx-auto flex max-w-[1320px] flex-col gap-1">{nav.map(([href,label])=><a key={href} href={href} onClick={()=>setMobileOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold text-[#0a3f2a] hover:bg-[#f3eee5]">{label}</a>)}<button onClick={open} className="mt-2 rounded-xl bg-[#0b5d3b] px-4 py-3 text-sm font-bold text-white">Iniciar sesión</button></nav></div>}
    </header>

    <section className="py-14 sm:py-16 lg:py-20">
      <div className="mx-auto grid max-w-[1320px] gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:px-10">
        <div className="self-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#e4ddd1] bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-[#0e8347]"><Star className="h-3.5 w-3.5 fill-current"/>Comercio conversacional para RD</div>
          <h1 className="mt-6 max-w-[560px] text-4xl font-extrabold leading-[.95] tracking-[-.05em] text-[#0a3f2a] sm:text-5xl lg:text-[64px]">{splitHeroTitle(heroTitle)}</h1>
          <p className="mt-5 max-w-[560px] text-base leading-8 text-[#6e6759]">{text(landing.hero_text,'Crea tu catálogo una sola vez. Tus clientes navegan, preguntan y piden sin salir de la conversación, mientras WAMERCIO mantiene pedidos, pagos y operación en orden.')}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button onClick={open} className="inline-flex items-center gap-2 rounded-2xl bg-[#bd431e] px-5 py-3 text-sm font-bold text-white shadow-[0_14px_28px_rgba(189,67,30,.18)]">Crear mi comercio<ArrowRight className="h-4 w-4"/></button>
            <a href="#demo" className="inline-flex items-center gap-2 rounded-2xl border border-[#d9d0c3] bg-white px-5 py-3 text-sm font-bold text-[#0a3f2a]">Ver demo</a>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[[Link2,'Un enlace','Comparte una sola URL'],[MessageCircleMore,'Una conversación','El pedido vive en WhatsApp'],[BarChart3,'Una operación','Todo queda visible en el panel']].map(([Icon,label,copy]:any)=><div key={label} className="rounded-2xl border border-[#e5ddd2] bg-white p-4"><Icon className="h-4 w-4 text-[#0e8347]"/><div className="mt-3 text-sm font-extrabold text-[#0a3f2a]">{label}</div><p className="mt-1 text-xs leading-5 text-[#6e6759]">{copy}</p></div>)}
          </div>
        </div>
        <HeroPreview template={activeTemplate}/>
      </div>
    </section>

    <section id="como-funciona" className="border-y border-[#e8e0d4] bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[760px] text-center">
          <div className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#0e8347]">Cómo funciona</div>
          <h2 className="mt-3 text-3xl font-extrabold tracking-[-.035em] text-[#0a3f2a] sm:text-4xl">Un toque en un enlace. Lo demás es una conversación.</h2>
          <p className="mt-4 text-sm leading-6 text-[#6e6759]">La experiencia no termina en una landing. El negocio comparte su enlace, el cliente compra por WhatsApp y la operación se registra dentro del panel.</p>
        </div>
        <div className="mt-10 grid items-start gap-6 lg:grid-cols-[.92fr_1.08fr]">
          <div className="grid gap-4">
            {[[Link2,'Comparte tu enlace','Tu catálogo y tu experiencia pública quedan listos para enviarse por WhatsApp, redes o QR.'],[Smartphone,'El cliente compra dentro del chat','Pregunta, confirma y cierra el pedido en la conversación donde ya estaba.'],[ClipboardList,'La operación se organiza sola','Pedido, pago, entrega y cliente quedan visibles dentro del mismo flujo.']].map(([Icon,title,copy]:any,index)=><div key={title} className="rounded-[24px] border border-[#e3dcd1] bg-[#fbf8f3] p-5"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#eef8f3] text-[#0e8347]"><Icon className="h-5 w-5"/></span><div><div className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#0e8347]">Paso {index+1}</div><h3 className="mt-1 text-lg font-extrabold tracking-[-.02em] text-[#0a3f2a]">{title}</h3></div></div><p className="mt-4 text-sm leading-6 text-[#6e6759]">{copy}</p></div>)}
          </div>
          <ChatCommerceMock/>
        </div>
      </div>
    </section>

    <section id="plantillas" className="py-20 sm:py-24">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8 lg:px-10">
        <div className="max-w-[860px]">
          <div className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#0e8347]">Plantillas adaptativas</div>
          <h2 className="mt-3 text-3xl font-extrabold tracking-[-.035em] text-[#0a3f2a] sm:text-4xl">La página comercial y el panel cambian según el tipo de negocio.</h2>
          <p className="mt-4 text-sm leading-6 text-[#6e6759]">WAMERCIO no muestra funciones incoherentes. Cada plantilla reorganiza la navegación y prioriza los módulos que sí hacen sentido para comida, servicios, cotizaciones, mayoreo, moda y más.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templateShowcase.map(template=>{
            const active=template.id===activeTemplate?.id
            return <button key={template.id} onClick={()=>setActiveTemplateId(template.id)} className={`rounded-[24px] border p-5 text-left transition ${active?'border-[#0b5d3b] bg-white shadow-[0_18px_45px_rgba(11,93,59,.10)]':'border-[#e4ddd1] bg-white hover:border-[#d5cab8]'}`}>
              <div className="flex items-start gap-4">
                <span className={`grid h-12 w-12 place-items-center rounded-2xl ${active?'bg-[#eef8f3] text-[#0e8347]':'bg-[#f6f2eb] text-[#6e6759]'}`}><Store className="h-5 w-5"/></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-extrabold tracking-[-.02em] text-[#0a3f2a]">{template.name}</h3>{template.is_featured&&<span className="rounded-full bg-[#eef8f3] px-2 py-1 text-[9px] font-extrabold uppercase tracking-[.14em] text-[#0e8347]">Destacada</span>}</div>
                  <p className="mt-2 text-sm leading-6 text-[#6e6759]">{template.description||templateFitCopy(template)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">{templateSignals(template).map(signal=><span key={signal} className="rounded-full bg-[#f6f2eb] px-2.5 py-1 text-[10px] font-bold text-[#506158]">{signal}</span>)}</div>
                </div>
              </div>
            </button>
          })}
        </div>
        <div className="mt-8"><TemplatePreview template={activeTemplate}/></div>
      </div>
    </section>

    <section id="funciones" className="border-y border-[#e8e0d4] bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8 lg:px-10">
        <div className="max-w-[860px]">
          <div className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#0e8347]">Funciones relevantes</div>
          <h2 className="mt-3 text-3xl font-extrabold tracking-[-.035em] text-[#0a3f2a] sm:text-4xl">{templateSectionHeading(activeTemplate)}</h2>
          <p className="mt-4 text-sm leading-6 text-[#6e6759]">{templateSectionLead(activeTemplate)}</p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">{adaptiveFeatures.slice(0,4).map(feature=><FeatureCard key={feature.title} feature={feature}/>)}</div>
      </div>
    </section>

    <section id="precios" className="py-20 sm:py-24">
      <div className="mx-auto max-w-[1120px] px-5 sm:px-8 lg:px-10">
        <div className="text-center">
          <div className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#0e8347]">Planes simples</div>
          <h2 className="mt-3 text-3xl font-extrabold tracking-[-.035em] text-[#0a3f2a] sm:text-4xl">{text(landing.plans_title,'Planes WAMERCIO')}</h2>
          <p className="mx-auto mt-4 max-w-[560px] text-sm leading-6 text-[#6e6759]">{text(landing.plans_subtitle,'Empieza simple y crece cuando tu comercio lo necesite.')}</p>
        </div>
        <div className={`mx-auto mt-10 grid gap-5 ${plans.length>=3?'lg:grid-cols-3':plans.length===2?'md:grid-cols-2 max-w-3xl':'max-w-sm'}`}>
          {plans.length===0?<div className="rounded-2xl border border-[#e2dbd0] bg-white p-8 text-center text-sm text-[#6e6759]">{text(landing.plans_empty_text,'Los planes estarán disponibles muy pronto.')}</div>:plans.map((p,index)=><article key={p.id} className={`relative rounded-[24px] border bg-white p-6 ${index===1?'border-[#0b5d3b] shadow-[0_22px_55px_rgba(11,93,59,.11)]':'border-[#e2dbd0]'}`}>{index===1&&<span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#0b5d3b] px-3 py-1 text-[9px] font-extrabold uppercase tracking-wide text-white">Más popular</span>}<h3 className="text-lg font-extrabold text-[#0a3f2a]">{p.name}</h3><p className="mt-2 min-h-10 text-xs leading-5 text-[#6e6759]">{p.description||text(landing.plan_default_description,'Todo lo necesario para operar tu comercio.')}</p><div className="mt-5 text-3xl font-extrabold tracking-[-.03em] text-[#0a3f2a]">{p.price?money(p.price):'RD$ 0'}<span className="ml-1 text-[10px] font-semibold tracking-normal text-[#98907f]">/{p.billing_period==='yearly'?'año':'mes'}</span></div><ul className="mt-6 space-y-3 text-xs text-[#5c675f]">{[`${p.max_stores} tienda${p.max_stores===1?'':'s'}`,`${p.max_products.toLocaleString()} productos`,text(landing.plan_whatsapp_feature,'WhatsApp incluido'),text(landing.plan_orders_feature,'Pedidos sin bloqueo')].map(x=><li key={x} className="flex items-center gap-2"><Check className="h-4 w-4 text-[#0e8347]"/>{x}</li>)}</ul><button onClick={open} className={`mt-7 w-full rounded-2xl px-5 py-3 text-sm font-bold ${index===1?'bg-[#0b5d3b] text-white':'border border-[#0b5d3b] text-[#0b5d3b] hover:bg-[#e3f6ea]'}`}>Empezar ahora</button></article>)}
        </div>
      </div>
    </section>

    <section id="demo" className="border-y border-[#e8e0d4] bg-[#f3eee5] py-16 sm:py-20">
      <div className="mx-auto grid max-w-[980px] items-center gap-8 px-5 sm:px-8 md:grid-cols-[1fr_auto] lg:px-10">
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#0e8347]">Demo</div>
          <h2 className="mt-3 text-3xl font-extrabold tracking-[-.035em] text-[#0a3f2a]">{text(landing.demo_title,'Prueba la experiencia desde tu celular')}</h2>
          <p className="mt-4 max-w-[600px] text-sm leading-6 text-[#6e6759]">{text(landing.demo_text,'Escanea el QR para abrir WAMERCIO. No necesitas instalar nada; el panel también funciona como PWA.')}</p>
          <button onClick={open} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#bd431e] px-5 py-3 text-sm font-bold text-white">{text(landing.demo_button_label,'Probar en la web')}<ArrowRight className="h-4 w-4"/></button>
        </div>
        <div className="rounded-[22px] border border-[#d9d0c3] bg-white p-4 shadow-sm"><QRCodeSVG value="https://wamercio.com/?access=1" size={132} fgColor="#0a3f2a" bgColor="#ffffff"/><div className="mt-2 flex items-center justify-center gap-2 text-center text-[9px] font-bold uppercase tracking-wide text-[#98907f]"><QrCode className="h-3.5 w-3.5"/>Escanear</div></div>
      </div>
    </section>

    <footer className="bg-[#0b5d3b] text-white">
      <div className="mx-auto max-w-[1320px] px-5 py-12 sm:px-8 lg:px-10">
        <div className="grid gap-10 md:grid-cols-[1.4fr_.8fr_.8fr_1fr]">
          <div>
            <div className="inline-flex rounded-2xl bg-white px-3 py-2 shadow-[0_10px_24px_rgba(0,0,0,.08)]"><WamercioLogo mode="full"/></div>
            <p className="mt-4 max-w-[340px] text-xs leading-6 text-white/65">{text(landing.footer_text,'Tu comercio, catálogo, pedidos y clientes conectados a la conversación donde ya están tus compradores.')}</p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-[9px] font-bold text-white/75"><Clock3 className="h-3.5 w-3.5"/>Pensado para comercio conversacional en República Dominicana</div>
          </div>
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[.16em] text-white/45">Producto</div>
            <div className="mt-4 space-y-3 text-xs text-white/70"><a className="block hover:text-white" href="#como-funciona">Cómo funciona</a><a className="block hover:text-white" href="#plantillas">Plantillas</a><a className="block hover:text-white" href="#funciones">Funciones</a><a className="block hover:text-white" href="#precios">Precios</a></div>
          </div>
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[.16em] text-white/45">Plataforma</div>
            <div className="mt-4 space-y-3 text-xs text-white/70"><button className="block hover:text-white" onClick={open}>Acceder</button><Link className="block hover:text-white" href="/admin/login">SuperAdmin</Link><Link className="block hover:text-white" href="/privacidad">Privacidad</Link><Link className="block hover:text-white" href="/terminos">Términos</Link></div>
          </div>
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[.16em] text-white/45">Empieza hoy</div>
            <p className="mt-4 text-xs leading-6 text-white/65">Crea tu comercio y empieza a operar con un panel coherente con tu tipo de negocio.</p>
            <button onClick={open} className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[#bd431e] px-4 py-2.5 text-xs font-bold text-white">Crear comercio</button>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-[10px] text-white/45 sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} WAMERCIO. Todos los derechos reservados.</span><span>Landing alineada con la identidad visual de WAMERCIO.</span></div>
      </div>
    </footer>
  </main>
}
