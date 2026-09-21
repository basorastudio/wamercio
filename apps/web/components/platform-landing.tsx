'use client'

import Link from 'next/link'
import {useEffect,useMemo,useState} from 'react'
import {QRCodeSVG} from 'qrcode.react'
import AccessModal from '@/components/access-modal'
import {api,money} from '@/lib/api'
import type {Plan} from '@/lib/types'
import {
  ArrowRight,BarChart3,Bell,Boxes,Check,ChevronRight,ClipboardList,CreditCard,
  Eye,Globe2,Headphones,Link2,MessageCircleMore,Package,Play,QrCode,ReceiptText,
  Search,ShieldCheck,ShoppingBag,Smartphone,Store,Truck,UsersRound,WalletCards,
  X,Menu,Star,Send,Plus,Minus,Clock3,MapPin,MousePointerClick
} from 'lucide-react'

function Brand({light=false,subtitle=true}:{light?:boolean;subtitle?:boolean}){
  return <span className="inline-flex items-center gap-2.5">
    <span className={`grid h-9 w-9 place-items-center rounded-xl ${light?'bg-white text-[#0b5d3b]':'bg-[#0b5d3b] text-white'} shadow-sm`}>
      <span className="text-[15px] font-black tracking-[-.08em]">W</span>
    </span>
    <span className="leading-none">
      <span className={`block text-[17px] font-extrabold tracking-[-.035em] ${light?'text-white':'text-[#0a3f2a]'}`}>WAMERCIO</span>
      {subtitle&&<span className={`mt-1 block text-[8px] font-bold uppercase tracking-[.18em] ${light?'text-white/60':'text-[#6e6759]'}`}>Comercio conversacional</span>}
    </span>
  </span>
}

function HeroDashboardMock({landing,text}:{landing:any;text:(v:any,f:string)=>string}){
  const rows=[
    {name:'Combo desayuno',sku:'COM-021',stock:'18 disponibles',price:'RD$ 385'},
    {name:'Café premium',sku:'CAF-104',stock:'8 disponibles',price:'RD$ 295'},
    {name:'Brownie artesanal',sku:'BRO-009',stock:'4 disponibles',price:'RD$ 175'},
  ]
  return <div className="relative mx-auto mt-11 max-w-[1180px] px-4 sm:px-6 lg:px-8">
    <div className="overflow-hidden rounded-t-[24px] border border-[#e6ded1] border-b-0 bg-white p-1.5 shadow-[0_-8px_42px_-12px_rgba(11,93,59,.18)] sm:p-2">
      <div className="overflow-hidden rounded-t-[18px] border border-[#f0ebe3] bg-[#f8faf9]">
        <div className="flex h-11 items-center gap-2 border-b border-[#ece6dc] bg-white px-3 sm:gap-3 sm:px-4">
          <div className="hidden rounded-lg border border-[#e7e1d7] px-3 py-1.5 text-[10px] text-[#6e6759] sm:block">wamercio.com/mi-tienda</div>
          <div className="hidden items-center gap-1.5 rounded-lg bg-[#f3eee5] px-2.5 py-1.5 text-[10px] font-semibold text-[#0a3f2a] md:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#3dbe6b]"/>Tienda</div>
          <div className="mx-auto hidden max-w-[320px] flex-1 items-center gap-2 rounded-lg border border-[#e7e1d7] px-3 py-1.5 text-[10px] text-[#98907f] lg:flex"><Search className="h-3.5 w-3.5"/>Buscar pedidos, productos <span className="ml-auto rounded border border-[#e7e1d7] px-1 text-[9px]">Ctrl K</span></div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden rounded-lg border border-[#e7e1d7] p-1.5 text-[#6e6759] sm:grid"><Bell className="h-3.5 w-3.5"/></span>
            <span className="hidden items-center gap-1.5 rounded-lg border border-[#e7e1d7] px-2.5 py-1.5 text-[10px] font-semibold text-[#46584f] md:flex"><Eye className="h-3.5 w-3.5"/>Vista previa</span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b5d3b] px-2.5 py-1.5 text-[10px] font-bold text-white"><MessageCircleMore className="h-3.5 w-3.5"/>Publicar</span>
            <span className="h-6 w-6 rounded-full bg-[#e6ded1]"/>
          </div>
        </div>
        <div className="flex min-h-[280px] sm:min-h-[360px] lg:min-h-[430px]">
          <div className="hidden w-12 shrink-0 flex-col items-center gap-2 rounded-tr-2xl bg-[#17191c] py-3 sm:flex">
            <span className="mb-1 grid h-7 w-7 place-items-center rounded-lg bg-[#3dbe6b] text-[#084429]"><Store className="h-3.5 w-3.5"/></span>
            {[Boxes,ReceiptText,MessageCircleMore,BarChart3].map((I,index)=><span key={index} className={`grid h-7 w-7 place-items-center rounded-lg ${index===0?'bg-white/10 text-white':'text-white/35'}`}><I className="h-3.5 w-3.5"/></span>)}
          </div>
          <div className="min-w-0 flex-1 p-2.5 sm:p-4">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                [text(landing.hero_mock_orders_label,'Pedidos hoy'),'24','+12%'],
                [text(landing.hero_mock_sales_label,'Ventas'),'RD$ 12,480','+8%'],
                ['Ticket promedio','RD$ 520','+3%']
              ].map(([label,value,delta])=><div key={label} className="rounded-xl border border-[#e7e1d7] bg-white px-2.5 py-2 sm:px-3 sm:py-3"><div className="truncate text-[8px] font-bold uppercase tracking-wide text-[#98907f] sm:text-[10px]">{label}</div><div className="mt-1 flex items-baseline gap-1.5"><span className="truncate text-xs font-extrabold text-[#0a3f2a] sm:text-lg">{value}</span><span className="hidden text-[9px] font-bold text-[#0e8347] md:inline">{delta}</span></div></div>)}
            </div>
            <div className="mt-2.5 overflow-hidden rounded-xl border border-[#e7e1d7] bg-white sm:mt-3">
              <div className="flex items-center border-b border-[#f0ebe3] px-3 py-2.5"><div className="text-[11px] font-bold text-[#0a3f2a] sm:text-sm">Productos</div><span className="ml-auto rounded-md bg-[#0b5d3b] px-2 py-1 text-[9px] font-bold text-white">Agregar producto</span></div>
              <div className="divide-y divide-[#f3eee5]">
                {rows.map((row,index)=><div key={row.sku} className="flex items-center gap-2.5 px-3 py-2.5 sm:py-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f3eee5] text-[#6e6759]"><Package className="h-4 w-4"/></span><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-semibold text-[#0a3f2a] sm:text-sm">{row.name}</div><div className="truncate text-[9px] text-[#98907f] sm:text-[11px]">{row.sku} · <span className={index===2?'font-semibold text-[#bd431e]':'font-semibold text-[#0e8347]'}>{row.stock}</span></div></div><div className="shrink-0 text-[10px] font-bold text-[#0a3f2a] sm:text-sm">{row.price}</div></div>)}
              </div>
            </div>
          </div>
          <aside className="hidden w-[238px] shrink-0 border-l border-[#e7e1d7] bg-white p-3 lg:block">
            <div className="flex items-center justify-between text-[11px] font-bold text-[#0a3f2a]">Pedido #1042 <ChevronRight className="h-3.5 w-3.5 rotate-90"/></div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[["Cliente","Sarah M."],["Canal","WhatsApp"],["Estado","Nuevo"],["Total","RD$ 1,245"]].map(([a,b])=><div key={a} className="rounded-lg border border-[#e7e1d7] px-2 py-1.5"><div className="text-[8px] font-bold uppercase tracking-wide text-[#98907f]">{a}</div><div className="mt-0.5 text-[10px] font-semibold text-[#0a3f2a]">{b}</div></div>)}
            </div>
            <div className="mt-4 border-t border-[#f0ebe3] pt-3"><div className="text-[9px] font-bold uppercase tracking-wide text-[#98907f]">Entrega</div><div className="mt-2 flex items-start gap-2 text-[10px] leading-4 text-[#46584f]"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0e8347]"/>Bonao, Monseñor Nouel<br/>Entrega estimada 35 min</div></div>
          </aside>
        </div>
      </div>
    </div>
    <div className="absolute -bottom-5 left-[3%] hidden w-[220px] rounded-2xl border border-[#e6ded1] bg-white p-3 shadow-[0_18px_45px_rgba(25,22,17,.13)] md:block">
      <div className="text-[9px] font-bold uppercase tracking-wide text-[#98907f]">Nuevo chat</div>
      <div className="mt-2 text-[11px] font-semibold text-[#0a3f2a]">Hola 👋 ¿Tienen el combo disponible?</div>
      <div className="mt-2 inline-flex rounded-lg bg-[#e3f6ea] px-2 py-1.5 text-[10px] font-semibold text-[#0e8347]">Sí, te lo preparo ahora mismo.</div>
    </div>
  </div>
}

function ChatOrderMock(){
  return <div className="overflow-hidden rounded-[22px] border border-[#d9d0c3] bg-white shadow-[0_18px_50px_rgba(25,22,17,.08)]">
    <div className="flex items-center gap-3 bg-[#0b5d3b] px-4 py-3 text-white"><span className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-sm font-bold">SM</span><div><div className="text-xs font-bold">Sarah M.</div><div className="text-[9px] text-white/65">en línea</div></div><MessageCircleMore className="ml-auto h-4 w-4"/></div>
    <div className="min-h-[330px] bg-[#f7f3ec] p-4" style={{backgroundImage:"linear-gradient(rgba(247,243,236,.94),rgba(247,243,236,.94)),url('/wacatalog-inspired/chat-pattern.png')",backgroundSize:'310px'}}>
      <div className="max-w-[78%] rounded-xl rounded-tl-sm bg-white px-3 py-2 text-[11px] leading-5 text-[#46584f] shadow-sm">Hola, ¿tienen disponible el combo desayuno?</div>
      <div className="ml-auto mt-3 max-w-[82%] rounded-xl rounded-tr-sm bg-[#dff4e7] px-3 py-2 text-[11px] leading-5 text-[#0a3f2a]">Sí. Te lo puedo enviar hoy. ¿A qué dirección?</div>
      <div className="mt-3 max-w-[86%] rounded-xl rounded-tl-sm bg-white px-3 py-2 text-[11px] leading-5 text-[#46584f] shadow-sm">Bonao, sector Los Jardines. Cerca del parque.</div>
      <div className="ml-auto mt-3 max-w-[88%] rounded-xl rounded-tr-sm bg-[#dff4e7] p-3 shadow-sm"><div className="text-[9px] font-bold uppercase tracking-wide text-[#0e8347]">Resumen del pedido</div><div className="mt-2 flex items-center justify-between text-[11px]"><span>1 × Combo desayuno</span><strong>RD$ 385</strong></div><div className="mt-2 border-t border-[#bfe6ce] pt-2 text-right text-sm font-extrabold text-[#0a3f2a]">RD$ 385</div></div>
      <div className="ml-auto mt-3 max-w-[82%] rounded-xl rounded-tr-sm bg-[#dff4e7] px-3 py-2 text-[11px] font-semibold text-[#0a3f2a]">¿Confirmamos? ✅</div>
    </div>
    <div className="flex items-center gap-2 border-t border-[#ece6dc] bg-white p-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#f3eee5] text-[#6e6759]"><Plus className="h-3.5 w-3.5"/></span><div className="h-9 flex-1 rounded-full border border-[#e7e1d7] bg-[#fbfaf8]"/><span className="grid h-9 w-9 place-items-center rounded-full bg-[#0b5d3b] text-white"><Send className="h-3.5 w-3.5"/></span></div>
  </div>
}

function NormalCheckoutMock(){
  return <div className="relative overflow-hidden rounded-[22px] border border-[#e2dbd0] bg-white p-5 opacity-70 grayscale-[.15]">
    <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#e6ded1]"/><span className="h-2.5 w-2.5 rounded-full bg-[#e6ded1]"/><span className="h-2.5 w-2.5 rounded-full bg-[#e6ded1]"/></div>
    <div className="mt-5 grid grid-cols-4 gap-3">{[1,2,3,4].map(n=><div key={n} className="rounded-xl bg-[#f3eee5] p-3"><div className="aspect-square rounded-lg bg-[#e6ded1]"/><div className="mt-3 h-2 rounded bg-[#d6cbbb]"/><div className="mt-2 h-2 w-2/3 rounded bg-[#e1d8ca]"/></div>)}</div>
    <div className="mt-5 h-3 w-1/3 rounded bg-[#e6ded1]"/><div className="mt-3 h-2 rounded bg-[#f0ebe3]"/><div className="mt-2 h-2 rounded bg-[#f0ebe3]"/><div className="mt-2 h-2 w-3/4 rounded bg-[#f0ebe3]"/>
    <div className="mt-5 grid grid-cols-2 gap-3"><div className="h-10 rounded-xl border border-[#e6ded1]"/><div className="h-10 rounded-xl border border-[#e6ded1]"/></div>
    <div className="mt-3 h-11 rounded-xl bg-[#e6ded1]"/>
    <div className="absolute right-4 top-4 rounded-full bg-white px-2.5 py-1 text-[9px] font-bold text-[#98907f] shadow">Muchos pasos</div>
  </div>
}

function MiniArticle({image,badge,title}:{image:string;badge:string;title:string}){
  return <article className="overflow-hidden rounded-2xl border border-[#e2dbd0] bg-white transition hover:-translate-y-0.5 hover:shadow-[0_16px_42px_rgba(25,22,17,.08)]">
    <div className="aspect-[16/9] overflow-hidden bg-[#e6ded1]"><img src={image} alt="" className="h-full w-full object-cover"/></div>
    <div className="p-4"><span className="inline-flex rounded-full bg-[#e3f6ea] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[#0e8347]">{badge}</span><h3 className="mt-3 text-[15px] font-bold leading-5 text-[#0a3f2a]">{title}</h3><p className="mt-2 text-xs leading-5 text-[#6e6759]">Ideas prácticas para vender mejor por conversación sin complicar la operación diaria.</p></div>
  </article>
}

export default function Landing(){
  const[accessOpen,setAccessOpen]=useState(false)
  const[mobileOpen,setMobileOpen]=useState(false)
  const[plans,setPlans]=useState<Plan[]>([])
  const[platform,setPlatform]=useState<any>(null)
  useEffect(()=>{
    api<Plan[]>('/plans').then(setPlans).catch(()=>{})
    api('/public/platform').then(setPlatform).catch(()=>{})
    if(typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('access')==='1')setAccessOpen(true)
  },[])
  const open=()=>{setMobileOpen(false);setAccessOpen(true)}
  const landing=platform?.landing||{}
  const domain=typeof window!=='undefined'?window.location.hostname:'wamercio.com'
  const text=(value:any,fallback:string)=>String(value||fallback).replaceAll('{domain}',domain)
  const features=useMemo(()=>[
    {icon:Boxes,title:text(landing.feature_1_title,'Catálogo listo una sola vez'),copy:text(landing.feature_1_text,'Crea productos, precios, variantes e inventario desde un panel pensado para vender por conversación.'),details:['Variantes e inventario','Colecciones y categorías','Enlace y QR siempre actualizados']},
    {icon:MessageCircleMore,title:text(landing.feature_2_title,'Toma el pedido en el chat'),copy:text(landing.feature_2_text,'Conecta WhatsApp y convierte conversaciones reales en pedidos organizados sin perder contexto.'),details:['Chat conectado al pedido','Respuestas rápidas','Historial por cliente']},
    {icon:WalletCards,title:text(landing.feature_3_title,'Cobra como trabaja tu negocio'),copy:text(landing.feature_3_text,'Efectivo, transferencia, terminal y métodos locales, con el estado del cobro ligado al pedido.'),details:['Efectivo y transferencia','Pagos registrados','Resumen comercial']},
    {icon:Truck,title:text(landing.feature_4_title,'Devuélvelo a la calle'),copy:text(landing.feature_4_text,'Coordina entrega, dirección, zonas y seguimiento sin obligar al cliente a abandonar WhatsApp.'),details:['Zonas de entrega','Direcciones estructuradas','Seguimiento operativo']},
    {icon:BarChart3,title:text(landing.feature_5_title,'Ventas que sí puedes medir'),copy:text(landing.feature_5_text,'Consulta pedidos, ingresos, productos y movimientos con una lectura clara de lo que está pasando.'),details:['Indicadores comerciales','Historial de pedidos','Visibilidad de la operación']},
    {icon:UsersRound,title:text(landing.feature_6_title,'Conoce a cada cliente'),copy:text(landing.feature_6_text,'Une el contacto de WhatsApp con compras, notas, direcciones y conversaciones anteriores.'),details:['CRM por WhatsApp','Historial de compras','Datos de entrega']},
  ],[landing])

  if(landing.maintenance_mode)return <main className="grid min-h-dvh place-items-center bg-[#fbf8f3] p-6 text-[#0a3f2a]"><AccessModal open={accessOpen} onClose={()=>setAccessOpen(false)}/><div className="w-full max-w-2xl rounded-[28px] border border-[#e6ded1] bg-white p-8 shadow-[0_30px_80px_rgba(25,22,17,.10)] sm:p-12"><Brand/><div className="mt-8 inline-flex rounded-full bg-[#e3f6ea] px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-[#0e8347]">{text(landing.maintenance_badge,'Mantenimiento programado')}</div><h1 className="mt-5 text-3xl font-extrabold tracking-[-.035em] sm:text-4xl">{text(landing.maintenance_title,'Estamos realizando mejoras en la página principal')}</h1><p className="mt-4 text-sm leading-7 text-[#6e6759]">{text(landing.maintenance_text,'La página principal estará temporalmente en mantenimiento. Los negocios activos continúan operando desde sus enlaces públicos.')}</p><button onClick={open} className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-[#bd431e] px-5 py-3 text-sm font-bold text-white">{text(landing.maintenance_button_label,'Entrar al panel de administración')}<ArrowRight className="h-4 w-4"/></button></div></main>

  const heroTitle=text(landing.hero_title,'Toda tu tienda funciona dentro de WhatsApp.')
  const heroTitleParts=heroTitle.split(/(WhatsApp)/gi)
  const nav=[
    ['#como-funciona',text(landing.nav_features_label,'Cómo funciona')],
    ['#funciones',text(landing.nav_product_label,'Funciones')],
    ['#precios',text(landing.nav_prices_label,'Precios')],
    ['#demo',text(landing.nav_demo_label,'Demo')],
  ]

  return <main className="marketing-shell min-h-dvh overflow-x-hidden bg-[#fbf8f3] text-[#46584f]">
    <AccessModal open={accessOpen} onClose={()=>setAccessOpen(false)}/>

    <header className="sticky top-0 z-50 border-b border-[#eee7dd]/90 bg-[#fbf8f3]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1320px] items-center px-5 sm:px-8 lg:px-10">
        <Link href="/" aria-label="WAMERCIO"><Brand/></Link>
        <nav className="ml-auto hidden items-center gap-7 text-[12px] font-semibold text-[#46584f] lg:flex">
          {nav.map(([href,label])=><a key={href} href={href} className="transition hover:text-[#0b5d3b]">{label}</a>)}
          <Link href="/terminos" className="transition hover:text-[#0b5d3b]">Términos</Link>
        </nav>
        <button onClick={open} className="ml-auto hidden rounded-xl border border-[#0b5d3b] px-4 py-2 text-[11px] font-bold text-[#0b5d3b] transition hover:bg-[#0b5d3b] hover:text-white lg:ml-7 lg:inline-flex">{text(landing.nav_access_label,'Iniciar sesión')}</button>
        <button onClick={open} className="ml-3 hidden rounded-xl bg-[#bd431e] px-4 py-2 text-[11px] font-bold text-white transition hover:bg-[#9c3517] sm:inline-flex">Comenzar</button>
        <button aria-label="Abrir menú" onClick={()=>setMobileOpen(v=>!v)} className="ml-auto grid h-10 w-10 place-items-center rounded-xl border border-[#e6ded1] text-[#0a3f2a] lg:hidden">{mobileOpen?<X className="h-5 w-5"/>:<Menu className="h-5 w-5"/>}</button>
      </div>
      {mobileOpen&&<div className="border-t border-[#eee7dd] bg-[#fbf8f3] px-5 py-4 lg:hidden"><nav className="mx-auto flex max-w-[1320px] flex-col gap-1">{nav.map(([href,label])=><a key={href} href={href} onClick={()=>setMobileOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold text-[#0a3f2a] hover:bg-[#f3eee5]">{label}</a>)}<button onClick={open} className="mt-2 rounded-xl bg-[#0b5d3b] px-4 py-3 text-sm font-bold text-white">Acceder a WAMERCIO</button></nav></div>}
    </header>

    <section className="relative overflow-hidden border-b border-[#ede5da]">
      <div className="pointer-events-none absolute inset-0 opacity-[.11]" style={{backgroundImage:"url('/wacatalog-inspired/chat-pattern.png')",backgroundSize:'480px'}}/>
      <div className="relative mx-auto max-w-[1320px] px-5 pt-16 text-center sm:px-8 sm:pt-20 lg:px-10 lg:pt-24">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[#e6ded1] bg-white px-2 py-1.5 pr-4 shadow-sm">
          <span className="flex -space-x-2">{['LM','JR','AP'].map((v,i)=><span key={v} className={`grid h-7 w-7 place-items-center rounded-full border-2 border-white text-[8px] font-extrabold text-white ${i===0?'bg-[#0b5d3b]':i===1?'bg-[#bd431e]':'bg-[#367184]'}`}>{v}</span>)}</span>
          <span className="flex gap-0.5 text-[#bd431e]">{[1,2,3,4,5].map(n=><Star key={n} className="h-3 w-3 fill-current"/>)}</span>
          <span className="hidden max-w-[240px] truncate text-[10px] font-semibold text-[#0a3f2a] sm:inline">{text(landing.hero_badge,'Comercios dominicanos')}</span>
          <span className="hidden h-4 w-px bg-[#e6ded1] sm:block"/>
          <span className="hidden text-[10px] text-[#6e6759] sm:inline">{text(landing.hero_kicker,'WhatsApp-first')}</span>
        </div>
        <h1 className="mx-auto mt-6 max-w-[850px] text-[44px] font-extrabold leading-[.96] tracking-[-.045em] text-[#0a3f2a] sm:text-[58px] lg:text-[74px]">{heroTitleParts.map((part,index)=>part.toLowerCase()==='whatsapp'?<span key={index} className="relative inline-block whitespace-nowrap"><span className="relative z-10">{part}</span><span className="absolute inset-x-[-.04em] bottom-[.03em] h-[.26em] -rotate-1 rounded-full bg-[#4ecb7a]/55"/></span>:<span key={index}>{part}</span>)}</h1>
        <p className="mx-auto mt-6 max-w-[660px] text-base leading-7 text-[#5c675f] sm:text-lg">{text(landing.hero_subtitle,'Crea tu catálogo una sola vez. Tus clientes navegan, preguntan y piden sin salir de la conversación, mientras WAMERCIO mantiene pedidos, inventario y clientes organizados.')}</p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button onClick={open} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#bd431e] px-6 text-sm font-bold text-white shadow-[0_10px_28px_rgba(189,67,30,.18)] transition hover:-translate-y-0.5 hover:bg-[#9c3517]">{text(landing.access_label,'Crear mi comercio')}<ArrowRight className="h-4 w-4"/></button>
          <a href="#precios" className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#0b5d3b] px-6 text-sm font-bold text-[#0b5d3b] transition hover:bg-[#0b5d3b] hover:text-white">{text(landing.demo_label,'Ver precios')}</a>
        </div>
      </div>
      <HeroDashboardMock landing={landing} text={text}/>
    </section>

    <section id="como-funciona" className="py-20 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-[1180px] px-5 sm:px-8 lg:px-10">
        <div className="text-center"><div className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#0e8347]">Cómo ocurre una venta</div><h2 className="mx-auto mt-3 max-w-[720px] text-3xl font-extrabold leading-[1.02] tracking-[-.035em] text-[#0a3f2a] sm:text-4xl lg:text-5xl">{text(landing.process_title,'Un toque en un enlace. Lo demás es una conversación.')}</h2><p className="mx-auto mt-4 max-w-[600px] text-sm leading-6 text-[#6e6759]">{text(landing.process_subtitle,'Sin carrito complicado, sin formularios eternos y sin obligar al cliente a instalar otra aplicación.')}</p></div>
        <div className="mt-12 grid gap-6 lg:grid-cols-[.88fr_1.12fr]">
          <div className="rounded-[24px] border border-[#e2dbd0] bg-white p-5 sm:p-6"><div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.15em] text-[#0e8347]"><MousePointerClick className="h-4 w-4"/>El recorrido del pedido</div><div className="mt-6 space-y-5">{[
            ['01','Comparte tu enlace','Tu tienda vive en una URL corta, QR o CTA enviado por WhatsApp.'],
            ['02','El cliente navega','Ve productos, precios y disponibilidad desde el navegador del teléfono.'],
            ['03','La conversación continúa','Las dudas, variantes, dirección y confirmación ocurren en WhatsApp.'],
            ['04','WAMERCIO ordena todo','El pedido, el cliente y el historial quedan registrados en el panel.'],
          ].map(([n,t,c],i)=><div key={n} className="relative flex gap-4">{i<3&&<span className="absolute left-[15px] top-8 h-[calc(100%+12px)] w-px bg-[#e6ded1]"/>}<span className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e3f6ea] text-[9px] font-extrabold text-[#0e8347]">{n}</span><div><div className="text-sm font-bold text-[#0a3f2a]">{t}</div><p className="mt-1 text-xs leading-5 text-[#6e6759]">{c}</p></div></div>)}</div><div className="mt-6 grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-[#e8e0d4] bg-[#fffdf9] p-3"><div className="text-[10px] font-bold text-[#0a3f2a]">{text(landing.process_customer_title,'Para tus clientes')}</div><p className="mt-1 text-[10px] leading-4 text-[#6e6759]">{text(landing.process_customer_text,'Abren el catálogo, eligen y continúan el pedido desde la conversación que ya conocen.')}</p></div><div className="rounded-xl border border-[#e8e0d4] bg-[#fffdf9] p-3"><div className="text-[10px] font-bold text-[#0a3f2a]">{text(landing.process_business_title,'Para tu comercio')}</div><p className="mt-1 text-[10px] leading-4 text-[#6e6759]">{text(landing.process_business_text,'Recibes el pedido estructurado, atiendes WhatsApp y conservas todo el historial comercial.')}</p></div></div><div className="mt-3 rounded-xl bg-[#e3f6ea] px-4 py-3 text-[11px] font-semibold leading-5 text-[#0e8347]">Tu equipo sigue atendiendo desde WhatsApp, pero ahora cada conversación tiene estructura comercial.</div></div>
          <ChatOrderMock/>
        </div>
      </div>
    </section>

    <section id="funciones" className="border-y border-[#e8e0d4] bg-[#f3eee5] py-20 sm:py-24 lg:py-28">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-5 sm:px-8 lg:grid-cols-[.75fr_1.25fr] lg:px-10">
        <div className="lg:pt-4"><div className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#6e6759]">El centro de control</div><h2 className="mt-3 text-3xl font-extrabold leading-[1.02] tracking-[-.035em] text-[#0a3f2a] sm:text-4xl">Todo lo que necesitas para operar. Nada de lo que no necesitas.</h2><p className="mt-5 max-w-md text-sm leading-7 text-[#5c675f]">WAMERCIO conecta catálogo, pedidos, clientes, pagos y WhatsApp en una sola experiencia, con flujos diseñados para negocios dominicanos.</p><button onClick={open} className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-[#bd431e] px-5 py-3 text-sm font-bold text-white">Crear mi comercio<ArrowRight className="h-4 w-4"/></button></div>
        <div><div className="grid gap-4 sm:grid-cols-2">{features.map(({icon:I,title,copy,details},index)=><article key={title} className="rounded-[22px] border border-[#dfd6c9] bg-white p-5 sm:p-6"><span className={`grid h-9 w-9 place-items-center rounded-xl ${index===0?'bg-[#e3f6ea] text-[#0e8347]':index===1?'bg-[#f6e6df] text-[#bd431e]':'bg-[#f3eee5] text-[#0a3f2a]'}`}><I className="h-[18px] w-[18px]"/></span><h3 className="mt-4 text-base font-bold text-[#0a3f2a]">{title}</h3><p className="mt-2 text-xs leading-5 text-[#6e6759]">{copy}</p><ul className="mt-4 space-y-2 text-[11px] text-[#5c675f]">{details.map(x=><li key={x} className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#0e8347]"/>{x}</li>)}</ul></article>)}</div><div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="rounded-xl bg-[#0b5d3b] px-4 py-3 text-center text-[10px] font-bold text-white">{text(landing.features_strip_primary,'WAMERCIO organiza catálogo, pedidos, clientes y WhatsApp en un solo lugar.')}</div><div className="rounded-xl bg-[#bd431e] px-4 py-3 text-center text-[10px] font-bold text-white">{text(landing.features_strip_secondary,'Tu operación sigue siendo simple aunque tu negocio crezca.')}</div></div></div>
      </div>
    </section>

    <section className="py-20 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-[1180px] px-5 sm:px-8 lg:px-10">
        <div className="text-center"><div className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#0e8347]">Por qué no una tienda normal</div><h2 className="mx-auto mt-3 max-w-[740px] text-3xl font-extrabold leading-[1.02] tracking-[-.035em] text-[#0a3f2a] sm:text-4xl lg:text-5xl">Siete clics para terminar una compra. O un mensaje.</h2><p className="mt-4 text-sm text-[#6e6759]">Encuentra al cliente donde ya conversa y convierte la conversación en una orden real.</p></div>
        <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-2"><div><div className="mb-3 flex items-center gap-2 text-[11px] font-bold text-[#6e6759]"><Globe2 className="h-4 w-4"/>Una tienda web tradicional</div><NormalCheckoutMock/></div><div><div className="mb-3 flex items-center gap-2 text-[11px] font-bold text-[#0e8347]"><MessageCircleMore className="h-4 w-4"/>Tu tienda dentro de la conversación</div><ChatOrderMock/></div></div>
        <div className="mt-6 grid overflow-hidden rounded-2xl border border-[#e2dbd0] bg-white sm:grid-cols-2 lg:grid-cols-5">{[
          [MousePointerClick,'Menos clics','Menos fricción para comprar.'],[UsersRound,'Contexto personal','El cliente no empieza de cero.'],[MessageCircleMore,'Más conversación','Resuelve dudas donde aparecen.'],[Clock3,'Seguimiento real','Pedido y chat comparten historia.'],[Truck,'Entrega coordinada','Dirección y estado en el mismo flujo.']
        ].map(([I,t,c]:any,i)=><div key={t} className={`p-4 ${i?'border-t border-[#e8e0d4] sm:border-l sm:border-t-0':''}`}><I className="h-4 w-4 text-[#0e8347]"/><div className="mt-2 text-[11px] font-bold text-[#0a3f2a]">{t}</div><p className="mt-1 text-[10px] leading-4 text-[#6e6759]">{c}</p></div>)}</div>
      </div>
    </section>

    <section className="border-y border-[#e8e0d4] bg-[#fffdf9] py-20 sm:py-24">
      <div className="mx-auto max-w-[1320px] px-5 sm:px-8 lg:px-10"><div className="max-w-[610px]"><div className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#6e6759]">Historias de comercios</div><h2 className="mt-3 text-3xl font-extrabold leading-[1.04] tracking-[-.035em] text-[#0a3f2a] sm:text-4xl">Las mejores reseñas llegan igual que los pedidos.</h2><p className="mt-4 text-sm leading-6 text-[#6e6759]">Cuando la experiencia es simple, el cliente recuerda la conversación completa, no solamente el checkout.</p></div><div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[
          'Mandé el enlace por WhatsApp y el cliente terminó el pedido sin preguntarme cómo usar la tienda.',
          'Ahora sé qué compró cada persona y puedo continuar la conversación sin buscar mensajes viejos.',
          'Los pedidos llegan ordenados y el equipo no tiene que copiar datos manualmente desde el chat.',
          'La dirección y el estado de entrega quedan conectados al pedido, así que todos vemos lo mismo.'
        ].map((q,i)=><article key={i} className="rounded-2xl border border-[#e2dbd0] bg-white p-5"><div className="text-2xl leading-none text-[#c9b8a7]">“</div><p className="mt-3 text-[13px] leading-6 text-[#46584f]">{q}</p><div className="mt-5 flex items-center gap-3"><span className={`grid h-8 w-8 place-items-center rounded-full text-[9px] font-extrabold text-white ${i%2?'bg-[#bd431e]':'bg-[#0b5d3b]'}`}>{['MN','JL','CR','AP'][i]}</span><div><div className="text-[10px] font-bold text-[#0a3f2a]">Comercio WAMERCIO</div><div className="text-[9px] text-[#98907f]">República Dominicana</div></div></div></article>)}</div></div>
    </section>

    <section id="precios" className="py-20 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-[1120px] px-5 sm:px-8 lg:px-10"><div className="text-center"><div className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#0e8347]">Planes simples</div><h2 className="mt-3 text-3xl font-extrabold tracking-[-.035em] text-[#0a3f2a] sm:text-4xl">{text(landing.plans_title,'Planes WAMERCIO')}</h2><p className="mx-auto mt-4 max-w-[560px] text-sm leading-6 text-[#6e6759]">{text(landing.plans_subtitle,'Empieza simple y crece cuando tu comercio lo necesite.')}</p></div>
        <div className={`mx-auto mt-10 grid gap-5 ${plans.length>=3?'lg:grid-cols-3':plans.length===2?'md:grid-cols-2 max-w-3xl':'max-w-sm'}`}>{plans.length===0?<div className="rounded-2xl border border-[#e2dbd0] bg-white p-8 text-center text-sm text-[#6e6759]">{text(landing.plans_empty_text,'Los planes estarán disponibles muy pronto.')}</div>:plans.map((p,index)=><article key={p.id} className={`relative rounded-[24px] border bg-white p-6 ${index===1?'border-[#0b5d3b] shadow-[0_22px_55px_rgba(11,93,59,.11)]':'border-[#e2dbd0]'}`}>{index===1&&<span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#0b5d3b] px-3 py-1 text-[9px] font-extrabold uppercase tracking-wide text-white">Más popular</span>}<h3 className="text-lg font-extrabold text-[#0a3f2a]">{p.name}</h3><p className="mt-2 min-h-10 text-xs leading-5 text-[#6e6759]">{p.description||text(landing.plan_default_description,'Todo lo necesario para operar tu comercio.')}</p><div className="mt-5 text-3xl font-extrabold tracking-[-.03em] text-[#0a3f2a]">{p.price?money(p.price):'RD$ 0'}<span className="ml-1 text-[10px] font-semibold tracking-normal text-[#98907f]">/{p.billing_period==='yearly'?'año':'mes'}</span></div><ul className="mt-6 space-y-3 text-xs text-[#5c675f]">{[`${p.max_stores} tienda${p.max_stores===1?'':'s'}`,`${p.max_products.toLocaleString()} productos`,text(landing.plan_whatsapp_feature,'WhatsApp incluido'),text(landing.plan_orders_feature,'Pedidos sin bloqueo')].map(x=><li key={x} className="flex items-center gap-2"><Check className="h-4 w-4 text-[#0e8347]"/>{x}</li>)}</ul><button onClick={open} className={`mt-7 w-full rounded-2xl px-5 py-3 text-sm font-bold ${index===1?'bg-[#0b5d3b] text-white':'border border-[#0b5d3b] text-[#0b5d3b] hover:bg-[#e3f6ea]'}`}>{text(landing.plans_button_label,'Empezar ahora')}</button></article>)}</div>
      </div>
    </section>

    <section id="demo" className="border-y border-[#e8e0d4] bg-[#f3eee5] py-16 sm:py-20">
      <div className="mx-auto grid max-w-[980px] items-center gap-8 px-5 sm:px-8 md:grid-cols-[1fr_auto] lg:px-10"><div><div className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#0e8347]">{text(landing.demo_badge,'Demo')}</div><h2 className="mt-3 text-3xl font-extrabold tracking-[-.035em] text-[#0a3f2a]">{text(landing.demo_title,'Prueba la experiencia desde tu celular')}</h2><p className="mt-4 max-w-[600px] text-sm leading-6 text-[#6e6759]">{text(landing.demo_text,'Escanea el QR para abrir WAMERCIO. No necesitas instalar nada; el panel también funciona como PWA.')}</p><button onClick={open} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#bd431e] px-5 py-3 text-sm font-bold text-white">{text(landing.demo_button_label,'Probar en la web')}<ArrowRight className="h-4 w-4"/></button></div><div className="rounded-[22px] border border-[#d9d0c3] bg-white p-4 shadow-sm"><QRCodeSVG value="https://wamercio.com/?access=1" size={132} fgColor="#0a3f2a" bgColor="#ffffff"/><div className="mt-2 text-center text-[9px] font-bold uppercase tracking-wide text-[#98907f]">Escanear</div></div></div>
    </section>

    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-[1180px] px-5 sm:px-8 lg:px-10"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#6e6759]">Aprende y vende mejor</div><h2 className="mt-3 max-w-[560px] text-3xl font-extrabold tracking-[-.035em] text-[#0a3f2a] sm:text-4xl">Operar un comercio por WhatsApp, un paso a la vez.</h2></div><a href="#como-funciona" className="inline-flex items-center gap-2 text-xs font-bold text-[#0b5d3b]">Ver cómo funciona<ArrowRight className="h-4 w-4"/></a></div><div className="mt-9 grid gap-5 md:grid-cols-3"><MiniArticle image="/wacatalog-inspired/commerce-guide-1.jpg" badge="Catálogo" title="Cómo compartir tu tienda sin sacar al cliente de la conversación"/><MiniArticle image="/wacatalog-inspired/commerce-guide-2.jpg" badge="WhatsApp" title="De mensaje a pedido: una operación comercial con contexto"/><MiniArticle image="/wacatalog-inspired/commerce-guide-3.jpg" badge="Operación" title="Pagos, entrega e historial conectados al mismo cliente"/></div></div>
    </section>

    <footer className="bg-[#0b5d3b] text-white">
      <div className="mx-auto max-w-[1320px] px-5 py-12 sm:px-8 lg:px-10"><div className="grid gap-10 md:grid-cols-[1.3fr_.7fr_.7fr_1fr]"><div><Brand light/><p className="mt-4 max-w-[310px] text-xs leading-6 text-white/65">{text(landing.footer_text,'Tu comercio, catálogo, pedidos y clientes conectados a la conversación donde ya están tus compradores.')}</p><div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-[9px] font-bold text-white/75"><ShieldCheck className="h-3.5 w-3.5"/>Pensado para República Dominicana</div></div><div><div className="text-[10px] font-extrabold uppercase tracking-[.16em] text-white/45">Producto</div><div className="mt-4 space-y-3 text-xs text-white/70"><a className="block hover:text-white" href="#como-funciona">Cómo funciona</a><a className="block hover:text-white" href="#funciones">Funciones</a><a className="block hover:text-white" href="#precios">Precios</a><a className="block hover:text-white" href="#demo">Demo</a></div></div><div><div className="text-[10px] font-extrabold uppercase tracking-[.16em] text-white/45">Plataforma</div><div className="mt-4 space-y-3 text-xs text-white/70"><button className="block hover:text-white" onClick={open}>Acceder</button><Link className="block hover:text-white" href="/admin/login">SuperAdmin</Link><Link className="block hover:text-white" href="/privacidad">Privacidad</Link><Link className="block hover:text-white" href="/terminos">Términos</Link></div></div><div><div className="text-[10px] font-extrabold uppercase tracking-[.16em] text-white/45">Comercio conversacional</div><p className="mt-4 text-xs leading-6 text-white/65">Recibe novedades de producto directamente desde tu panel WAMERCIO.</p><button onClick={open} className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[#bd431e] px-4 py-2.5 text-xs font-bold text-white">Crear comercio</button></div></div><div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-[10px] text-white/45 sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} WAMERCIO. Todos los derechos reservados.</span><span>Comercio conversacional para República Dominicana.</span></div></div>
    </footer>
  </main>
}
