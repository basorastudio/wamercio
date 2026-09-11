'use client'

import Link from 'next/link'
import {useEffect,useState} from 'react'
import {QRCodeSVG} from 'qrcode.react'
import AccessModal from '@/components/access-modal'
import {api,money} from '@/lib/api'
import type {Plan} from '@/lib/types'
import {
  ArrowRight,BarChart3,Boxes,Check,CheckCircle2,ChevronRight,ClipboardList,MessageCircleMore,
  PanelTop,PlayCircle,ReceiptText,ShoppingBag,Smartphone,Store,Truck,UsersRound,
  WalletCards,Zap
} from 'lucide-react'

const features=[
  {icon:Boxes,title:'Catálogo listo para vender',text:'Organiza categorías, productos, variantes y extras desde un panel simple.'},
  {icon:MessageCircleMore,title:'WhatsApp conectado',text:'Conversa con tus clientes y gestiona mensajes desde WAMERCIO.'},
  {icon:ClipboardList,title:'Pedidos en un solo lugar',text:'Recibe, confirma y cambia estados sin perder el historial del cliente.'},
  {icon:Truck,title:'Delivery y recogida',text:'Configura zonas, tarifas y tiempos estimados según tu operación.'},
  {icon:UsersRound,title:'Conoce a tus clientes',text:'Historial de compras, total gastado, notas y datos de contacto organizados.'},
  {icon:BarChart3,title:'Control de tu negocio',text:'Dashboard, movimientos, inventario y métricas comerciales en tiempo real.'},
]

const steps=[
  {n:'01',title:'Crea tu comercio',text:'Usa tu WhatsApp como usuario y define un PIN de 4 dígitos.',icon:Smartphone},
  {n:'02',title:'Carga tu catálogo',text:'Agrega categorías, productos, precios, variantes e imágenes.',icon:Boxes},
  {n:'03',title:'Comparte y vende',text:'Envía tu tienda, recibe pedidos y atiende conversaciones.',icon:ShoppingBag},
]

export default function Landing(){
  const[accessOpen,setAccessOpen]=useState(false)
  const[plans,setPlans]=useState<Plan[]>([])
  useEffect(()=>{
    api<Plan[]>('/plans').then(setPlans).catch(()=>{})
    if(typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('access')==='1')setAccessOpen(true)
  },[])
  const open=()=>setAccessOpen(true)
  return <main className="min-h-dvh overflow-x-hidden bg-white text-slate-900">
    <AccessModal open={accessOpen} onClose={()=>setAccessOpen(false)}/>

    <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-slate-950/90 text-white backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:h-18 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400 font-black text-slate-950">W</span><div><div className="text-base font-black tracking-tight">WAMERCIO</div><div className="hidden text-[9px] font-bold uppercase tracking-[.16em] text-amber-300 sm:block">Comercio por WhatsApp</div></div></Link>
        <nav className="ml-auto hidden items-center gap-7 text-sm font-semibold text-slate-300 lg:flex"><a href="#funciones" className="hover:text-white">Funciones</a><a href="#como-funciona" className="hover:text-white">Cómo funciona</a><a href="#planes" className="hover:text-white">Planes</a><a href="#experiencia" className="hover:text-white">Experiencia</a></nav>
        <button onClick={open} className="ml-auto rounded-xl border border-white/15 px-3 py-2 text-xs font-bold text-white lg:ml-3">Entrar</button>
        <button onClick={open} className="hidden rounded-xl bg-amber-400 px-4 py-2 text-xs font-black text-slate-950 shadow-lg shadow-amber-400/10 sm:inline-flex">Empezar ahora</button>
      </div>
    </header>

    <section className="relative overflow-hidden bg-slate-950 pb-24 pt-28 text-white sm:pb-32 sm:pt-36">
      <div className="absolute -left-24 top-20 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl"/><div className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-amber-300/10 blur-3xl"/>
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.02fr_.98fr] lg:px-8">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-300"><Zap className="h-3.5 w-3.5"/>Hecho para vender fácil desde República Dominicana</div>
          <h1 className="mt-6 text-4xl font-black leading-[1.02] tracking-[-.04em] sm:text-5xl lg:text-6xl">Tu comercio, tus pedidos y tu WhatsApp <span className="text-amber-400">en un solo lugar.</span></h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">Crea tu tienda online, recibe pedidos, administra clientes y conversa por WhatsApp desde una plataforma diseñada para pequeños y medianos comercios.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><button onClick={open} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-400 px-6 font-black text-slate-950 shadow-xl shadow-amber-500/10 hover:bg-amber-300">Crear o acceder <ArrowRight className="h-4 w-4"/></button><a href="#como-funciona" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/15 px-6 font-bold text-white hover:bg-white/5"><PlayCircle className="h-4 w-4"/>Ver cómo funciona</a></div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-400"><span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400"/>WhatsApp + PIN</span><span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400"/>PWA instalable</span><span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400"/>Sin pasarelas obligatorias</span></div>
        </div>

        <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
          <div className="absolute inset-10 rounded-full bg-amber-400/20 blur-3xl"/>
          <div className="relative rounded-[34px] border border-white/10 bg-white/[.06] p-3 shadow-2xl backdrop-blur sm:p-5">
            <div className="rounded-[27px] bg-[#f6f8fb] p-4 text-slate-900 sm:p-5">
              <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400 font-black">W</div><div><div className="font-black">Mi Comercio</div><div className="text-xs text-slate-500">Panel móvil WAMERCIO</div></div><span className="ml-auto rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">En línea</span></div>
              <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-xs text-slate-400">Pedidos hoy</div><div className="mt-1 text-2xl font-black">18</div><div className="mt-2 text-[11px] font-semibold text-emerald-600">+12% esta semana</div></div><div className="rounded-2xl bg-slate-950 p-4 text-white shadow-sm"><div className="text-xs text-slate-400">Ventas</div><div className="mt-1 text-2xl font-black">RD$ 24,850</div><div className="mt-2 text-[11px] font-semibold text-amber-300">Actualizado ahora</div></div></div>
              <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-center"><div><div className="text-xs text-slate-400">Pedido #1048</div><div className="mt-1 font-bold">Carlos M. · 3 productos</div></div><span className="ml-auto rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">En proceso</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-[68%] rounded-full bg-amber-400"/></div></div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[10px] font-bold text-slate-500">{[[PanelTop,'Inicio'],[ShoppingBag,'Pedidos'],[MessageCircleMore,'Chat'],[Boxes,'Productos']].map(([I,t]:any)=><div key={t} className="rounded-xl bg-white p-2.5 shadow-sm"><I className="mx-auto mb-1 h-4 w-4 text-amber-500"/>{t}</div>)}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-1 left-0 h-16 w-full origin-bottom-left -skew-y-2 bg-[#f6f8fb] sm:h-24"/>
    </section>

    <section id="funciones" className="bg-[#f6f8fb] pb-20 pt-8 sm:pb-28 sm:pt-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"><div className="mx-auto max-w-2xl text-center"><span className="text-xs font-black uppercase tracking-[.18em] text-amber-600">Todo lo esencial</span><h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Menos complejidad. Más control.</h2><p className="mt-3 text-sm leading-6 text-slate-500 sm:text-base">WAMERCIO reúne las tareas que un comercio necesita cada día sin convertir el panel en un sistema complicado.</p></div><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{features.map(({icon:I,title,text})=><article key={title} className="group rounded-[24px] border border-slate-200 bg-white p-5 shadow-soft transition hover:-translate-y-1 hover:shadow-xl"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-600 transition group-hover:bg-amber-400 group-hover:text-slate-950"><I className="h-5 w-5"/></div><h3 className="mt-5 text-lg font-black text-slate-950">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></article>)}</div></div>
    </section>

    <section id="como-funciona" className="bg-white py-20 sm:py-28"><div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"><div className="grid gap-12 lg:grid-cols-[.92fr_1.08fr] lg:items-center"><div><span className="text-xs font-black uppercase tracking-[.18em] text-amber-600">Proceso simple</span><h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Empieza a vender sin aprender un sistema complicado.</h2><p className="mt-4 max-w-xl text-sm leading-7 text-slate-500 sm:text-base">La experiencia está pensada para operar desde el teléfono: crear productos, atender pedidos, responder mensajes y revisar clientes.</p><button onClick={open} className="btn-primary mt-7">Comenzar ahora <ArrowRight className="h-4 w-4"/></button></div><div className="space-y-4">{steps.map(({n,title,text,icon:I})=><div key={n} className="flex gap-4 rounded-[24px] border border-slate-200 bg-[#f8fafc] p-5"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-950 text-amber-300"><I className="h-5 w-5"/></div><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-amber-600">Paso {n}</div><h3 className="mt-1 font-black text-slate-950">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-500">{text}</p></div></div>)}</div></div></div></section>

    <section id="planes" className="bg-slate-950 py-20 text-white sm:py-28"><div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"><div className="mx-auto max-w-2xl text-center"><span className="text-xs font-black uppercase tracking-[.18em] text-amber-300">Planes WAMERCIO</span><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Empieza pequeño. Crece cuando lo necesites.</h2><p className="mt-3 text-sm leading-6 text-slate-400">Los planes publicados en el panel SaaS aparecen aquí automáticamente.</p></div><div className={`mx-auto mt-10 grid max-w-5xl gap-4 ${plans.length>=3?'lg:grid-cols-3':plans.length===2?'md:grid-cols-2':'max-w-md'}`}>{plans.length===0?<div className="rounded-[28px] border border-white/10 bg-white/5 p-8 text-center text-slate-400">Los planes estarán disponibles muy pronto.</div>:plans.map(p=><article key={p.id} className={`relative rounded-[28px] border p-6 ${p.is_featured?'border-amber-400 bg-amber-400 text-slate-950 shadow-2xl shadow-amber-500/10':'border-white/10 bg-white/[.05]'}`}>{p.is_featured&&<span className="absolute right-5 top-5 rounded-full bg-slate-950 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300">Popular</span>}<h3 className="text-xl font-black">{p.name}</h3><p className={`mt-2 min-h-10 text-sm ${p.is_featured?'text-slate-700':'text-slate-400'}`}>{p.description||'Todo lo necesario para operar tu comercio.'}</p><div className="mt-6 flex items-end gap-2"><span className="text-4xl font-black">{p.price?money(p.price):'Gratis'}</span>{p.price>0&&<span className={`pb-1 text-xs ${p.is_featured?'text-slate-600':'text-slate-400'}`}>/{p.billing_period==='yearly'?'año':'mes'}</span>}</div><div className={`my-6 h-px ${p.is_featured?'bg-slate-950/10':'bg-white/10'}`}/><div className="space-y-3 text-sm">{[`${p.max_stores} tienda${p.max_stores===1?'':'s'}`,`${p.max_products.toLocaleString()} productos`,`${p.max_orders.toLocaleString()} pedidos/mes`,p.whatsapp_enabled?'WhatsApp conectado':'Gestión comercial'].map(x=><div key={x} className="flex items-center gap-2"><Check className={`h-4 w-4 ${p.is_featured?'text-slate-950':'text-amber-300'}`}/>{x}</div>)}</div><button onClick={open} className={`mt-7 flex h-12 w-full items-center justify-center rounded-2xl font-black ${p.is_featured?'bg-slate-950 text-white':'bg-amber-400 text-slate-950'}`}>Empezar <ChevronRight className="h-4 w-4"/></button></article>)}</div></div></section>

    <section id="experiencia" className="bg-white py-20 sm:py-28"><div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8"><div><span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-[.16em] text-amber-700">PWA · Mobile first</span><h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Tu panel se siente como una app, sin obligarte a instalar nada.</h2><p className="mt-4 max-w-xl text-sm leading-7 text-slate-500 sm:text-base">WAMERCIO funciona desde el navegador y puede instalarse como PWA. El panel de tienda usa navegación móvil, accesos rápidos y sesiones persistentes.</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{['Acceso con WhatsApp + PIN','Panel separado del SuperAdmin','Catálogo público responsive','Conversaciones y pedidos centralizados'].map(x=><div key={x} className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-700"><CheckCircle2 className="h-4 w-4 text-emerald-500"/>{x}</div>)}</div></div><div className="mx-auto flex w-full max-w-md flex-col items-center rounded-[30px] border border-slate-200 bg-[#f8fafc] p-7 text-center shadow-soft"><div className="rounded-3xl bg-white p-4 shadow-sm"><QRCodeSVG value="https://wamercio.com" size={156} fgColor="#020617" bgColor="#ffffff"/></div><h3 className="mt-5 text-xl font-black text-slate-950">Abre WAMERCIO desde tu celular</h3><p className="mt-2 text-sm leading-6 text-slate-500">Escanea el QR y entra a la experiencia mobile-first.</p><button onClick={open} className="btn-primary mt-5 w-full">Acceder o registrarme</button></div></div></section>

    <section className="bg-[#f6f8fb] py-20"><div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"><div className="text-center"><span className="text-xs font-black uppercase tracking-[.18em] text-amber-600">Pensado para operar</span><h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Un flujo comercial completo y sencillo.</h2></div><div className="mt-10 grid gap-4 md:grid-cols-3">{[
      [Store,'Tu tienda siempre disponible','Comparte un catálogo público y mantén el control desde tu panel.'],
      [WalletCards,'Cobros simples','Efectivo, transferencia o pago al recibir sin forzarte a usar una pasarela.'],
      [ReceiptText,'Historial organizado','Pedidos, movimientos y clientes conectados en un mismo flujo.'],
    ].map(([I,t,d]:any)=><div key={t} className="rounded-[24px] border border-slate-200 bg-white p-6"><I className="h-6 w-6 text-amber-500"/><h3 className="mt-4 font-black text-slate-950">{t}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{d}</p></div>)}</div></div></section>

    <footer className="bg-slate-950 text-slate-400"><div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"><div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400 font-black text-slate-950">W</span><span className="font-black text-white">WAMERCIO</span></div><p className="mt-3 max-w-md text-sm leading-6">Comercio conversacional, catálogo, pedidos y clientes en una plataforma creada para simplificar la operación diaria.</p></div><div className="flex flex-wrap gap-5 text-sm"><a href="#funciones" className="hover:text-white">Funciones</a><a href="#planes" className="hover:text-white">Planes</a><button onClick={open} className="hover:text-white">Acceder</button><Link href="/admin/login" className="hover:text-white">SuperAdmin</Link></div></div><div className="mt-8 border-t border-white/10 pt-5 text-xs">© {new Date().getFullYear()} WAMERCIO.</div></div></footer>
  </main>
}
