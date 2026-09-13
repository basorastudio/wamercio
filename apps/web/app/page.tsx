'use client'

import Link from 'next/link'
import {useEffect,useState} from 'react'
import {QRCodeSVG} from 'qrcode.react'
import AccessModal from '@/components/access-modal'
import {api,money} from '@/lib/api'
import type {Plan} from '@/lib/types'
import {
  ArrowRight,BarChart3,Boxes,Check,ChevronRight,ClipboardList,CreditCard,
  MessageCircleMore,Play,ShoppingBag,Smartphone,Store,Truck,UsersRound,WalletCards
} from 'lucide-react'

const features=[
  {icon:Smartphone,title:'Crea tu tienda',text:'Configura tu comercio, catálogo, horarios y forma de entrega desde un panel simple.'},
  {icon:MessageCircleMore,title:'Pedidos por WhatsApp',text:'Conecta WhatsApp, conversa con clientes y lleva cada pedido al panel de WAMERCIO.'},
  {icon:WalletCards,title:'Métodos de pago simples',text:'Efectivo, transferencia o pago al recibir, sin obligarte a contratar una pasarela.'},
  {icon:ShoppingBag,title:'Empieza a vender rápido',text:'Comparte tu tienda por enlace o QR y comienza a recibir pedidos desde cualquier teléfono.'},
  {icon:BarChart3,title:'Ventas y pedidos',text:'Consulta pedidos, clientes, movimientos e inventario con una vista clara de tu operación.'},
  {icon:UsersRound,title:'Conoce a tus clientes',text:'Historial, teléfonos, compras, notas y datos de entrega organizados en un solo lugar.'},
]

export default function Landing(){
  const[accessOpen,setAccessOpen]=useState(false)
  const[plans,setPlans]=useState<Plan[]>([])
  useEffect(()=>{
    api<Plan[]>('/plans').then(setPlans).catch(()=>{})
    if(typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('access')==='1')setAccessOpen(true)
  },[])
  const open=()=>setAccessOpen(true)
  return <main className="min-h-dvh overflow-x-hidden bg-white text-ink-900">
    <AccessModal open={accessOpen} onClose={()=>setAccessOpen(false)}/>

    <section className="relative overflow-hidden bg-brand-500 text-white">
      <header className="relative z-20 mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-white text-sm font-black">W</span>
          <div><div className="text-base font-semibold leading-none">wamercio</div><div className="mt-1 text-[8px] font-medium uppercase tracking-[.18em] text-white/70">Comercio por WhatsApp</div></div>
        </Link>
        <nav className="ml-auto hidden items-center gap-7 text-[11px] font-medium text-white/90 lg:flex">
          <a href="#funciones" className="hover:text-white">Funciones</a>
          <a href="#como-funciona" className="hover:text-white">Producto</a>
          <a href="#planes" className="hover:text-white">Precios</a>
          <a href="#demo" className="hover:text-white">Demo</a>
        </nav>
        <button onClick={open} className="ml-auto rounded border border-white bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-600 shadow-sm lg:ml-7">Acceder</button>
        <button onClick={open} className="ml-2 hidden rounded border border-white/70 bg-transparent px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white sm:inline-flex">Registrarme</button>
      </header>

      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-28 pt-14 sm:px-6 sm:pb-36 lg:grid-cols-[1fr_1.05fr] lg:px-8 lg:pt-20">
        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#32394f] px-3 py-1.5 text-[10px] font-medium shadow"><span className="rounded bg-rose-500 px-1.5 py-0.5 text-[8px] font-bold">NUEVO</span> Tu comercio puede vender desde WhatsApp</div>
          <p className="mt-6 text-lg font-light text-white/80">Simple y amigable</p>
          <h1 className="mt-1 text-3xl font-semibold leading-tight sm:text-4xl lg:text-[44px]">Tu comercio y tus pedidos<br/><span className="font-light">más fáciles con WhatsApp.</span></h1>
          <p className="mt-5 max-w-lg text-sm leading-6 text-white/80">Crea tu tienda digital, comparte tu catálogo, recibe pedidos y administra clientes desde WAMERCIO. Sin complicaciones y pensado para vender desde el celular.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button onClick={open} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-900 shadow-lg">Empezar ahora <ArrowRight className="h-3.5 w-3.5"/></button>
            <a href="#demo" className="inline-flex items-center gap-2 rounded-full border border-white bg-transparent px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-white"><Play className="h-3.5 w-3.5"/> Ver demo</a>
          </div>
        </div>

        <div className="relative mx-auto min-h-[320px] w-full max-w-[560px] sm:min-h-[390px]">
          <div className="absolute left-[7%] top-[18%] h-64 w-64 rounded-[45%] bg-[#8edbc0]/70 sm:h-72 sm:w-72"/>
          <div className="absolute right-[8%] top-[9%] h-56 w-56 rounded-[46%] bg-[#79cfb1]/65 sm:h-64 sm:w-64"/>
          <div className="absolute left-[32%] top-[8%] grid h-20 w-20 place-items-center rounded-full bg-white shadow-xl sm:h-24 sm:w-24"><MessageCircleMore className="h-10 w-10 text-brand-500 sm:h-12 sm:w-12"/></div>
          <div className="absolute bottom-[12%] left-[12%] w-[43%] rounded-xl bg-[#7c68df] p-4 text-white shadow-2xl sm:p-5">
            <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-white/20"><Store className="h-4 w-4"/></span><div><p className="text-[9px] text-white/70">Mi tienda</p><p className="text-sm font-semibold">Catálogo activo</p></div></div>
            <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded bg-white/10 p-2"><p className="text-[9px] text-white/70">Pedidos</p><p className="text-lg font-semibold">18</p></div><div className="rounded bg-white/10 p-2"><p className="text-[9px] text-white/70">Ventas</p><p className="text-sm font-semibold">RD$24,850</p></div></div>
          </div>
          <div className="absolute bottom-[8%] right-[8%] w-[43%] rounded-[26px] bg-[#f6f6fb] p-3 shadow-2xl">
            <div className="rounded-[20px] bg-white p-4"><div className="flex items-center gap-2"><div className="h-8 w-8 rounded-full bg-brand-100"/><div><div className="h-2 w-20 rounded bg-[#e8e8f2]"/><div className="mt-2 h-2 w-12 rounded bg-[#eeeeF5]"/></div></div><div className="mt-4 h-24 rounded-lg bg-[#f4f4fb] p-3"><div className="h-2 w-2/3 rounded bg-[#d6d7e9]"/><div className="mt-2 h-2 w-1/2 rounded bg-[#e2e3ef]"/><div className="mt-6 h-7 rounded bg-brand-500"/></div></div>
          </div>
          <span className="absolute left-1 top-10 h-5 w-5 rounded-full bg-purple-700"/><span className="absolute right-3 top-1/2 h-4 w-4 bg-white/90"/><span className="absolute bottom-10 left-1/2 h-5 w-5 rounded-full bg-amber-300"/>
        </div>
      </div>
      <div className="absolute -bottom-10 left-[-4%] h-24 w-[108%] -rotate-[5deg] bg-[#fafbfe]"/>
    </section>

    <section id="funciones" className="bg-[#fafbfe] pb-20 pt-20 sm:pb-24 sm:pt-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{features.map(({icon:I,title,text})=><article key={title} className="border border-[#eef0f5] bg-white p-5 shadow-[0_4px_18px_rgba(46,49,84,.04)]"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#f1f2f7] text-brand-500"><I className="h-7 w-7"/></div><h3 className="mt-5 text-center text-sm font-medium text-ink-900">{title}</h3><p className="mt-2 text-center text-xs leading-5 text-[#9a9eb5]">{text}</p></article>)}</div>
        <div className="mx-auto mt-8 max-w-xl space-y-3"><div className="bg-[#4fd9a8] px-4 py-2 text-center text-[11px] font-medium text-white">WAMERCIO organiza catálogo, pedidos, clientes y WhatsApp en un solo lugar.</div><div className="bg-[#7587e8] px-4 py-2 text-center text-[11px] font-medium text-white">Tu operación sigue siendo simple aunque tu negocio crezca.</div></div>
      </div>
    </section>

    <section id="como-funciona" className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center"><h2 className="text-2xl font-semibold text-ink-900 sm:text-3xl">No existe un proceso más simple</h2><p className="mt-3 text-sm text-[#9a9eb5]">Administrar pedidos puede sentirse tan fácil como conversar con un cliente.</p></div>
        <div className="mt-14 grid items-center gap-10 md:grid-cols-2">
          <div className="space-y-7 text-sm leading-6 text-[#8e93ad]"><div><h3 className="font-medium text-ink-900">Para tus clientes</h3><p className="mt-2">Tus clientes abren tu catálogo desde un enlace o QR, eligen sus productos y envían el pedido sin instalar aplicaciones.</p></div><div><h3 className="font-medium text-ink-900">Para tu comercio</h3><p className="mt-2">Recibes pedidos en WAMERCIO, actualizas estados, atiendes WhatsApp, controlas clientes y mantienes todo el historial organizado.</p></div></div>
          <div className="mx-auto w-full max-w-[280px] rounded-[34px] bg-[#2e3154] p-2 shadow-[0_24px_60px_rgba(46,49,84,.22)]"><div className="overflow-hidden rounded-[28px] bg-white"><div className="bg-brand-500 px-4 py-3 text-center text-xs font-medium text-white">Mi Comercio</div><div className="p-4"><div className="rounded-lg bg-[#fafbfe] p-3"><p className="text-xs font-medium text-ink-900">Productos destacados</p><div className="mt-3 grid grid-cols-2 gap-2"><div className="h-20 rounded bg-[#eef0f5]"/><div className="h-20 rounded bg-[#eef0f5]"/></div></div><div className="mt-3 rounded-lg border border-[#eef0f5] p-3"><p className="text-xs font-medium text-ink-900">Tu pedido</p><div className="mt-2 h-2 w-2/3 rounded bg-[#e5e7ef]"/><div className="mt-2 h-2 w-1/2 rounded bg-[#eceef5]"/><button className="mt-4 w-full rounded bg-brand-500 py-2 text-[10px] font-medium text-white">Enviar pedido</button></div></div></div></div>
        </div>
      </div>
    </section>

    <section id="planes" className="bg-brand-500 py-20 text-white sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6"><div className="text-center"><h2 className="text-2xl font-semibold sm:text-3xl">Planes WAMERCIO</h2><p className="mt-3 text-sm text-white/75">Empieza simple y crece cuando tu comercio lo necesite.</p></div><div className={`mx-auto mt-10 grid gap-5 ${plans.length>=3?'lg:grid-cols-3':plans.length===2?'md:grid-cols-2':'max-w-sm'}`}>{plans.length===0?<div className="bg-white p-8 text-center text-sm text-[#8e93ad]">Los planes estarán disponibles muy pronto.</div>:plans.map(p=><article key={p.id} className="relative bg-white p-7 text-center text-ink-900 shadow-lg"><h3 className="text-xl font-light text-[#777c9d]">{p.name}</h3><p className="mt-3 min-h-10 text-xs leading-5 text-[#a1a5ba]">{p.description||'Todo lo necesario para operar tu comercio.'}</p><div className="mt-5 text-4xl font-light text-ink-900">{p.price?money(p.price):'RD$ 0'}<span className="ml-1 text-xs text-[#9a9eb5]">/{p.billing_period==='yearly'?'año':'mes'}</span></div><div className="mt-6 space-y-3 text-xs text-[#878ca7]">{[`${p.max_stores} tienda${p.max_stores===1?'':'s'}`,`${p.max_products.toLocaleString()} productos`,'WhatsApp incluido','Pedidos sin bloqueo'].map(x=><div key={x} className="flex items-center justify-center gap-2"><Check className="h-3.5 w-3.5 text-brand-500"/>{x}</div>)}</div><button onClick={open} className="mt-7 rounded border border-brand-500 px-5 py-2 text-[10px] font-semibold uppercase tracking-wide text-brand-600 hover:bg-brand-50">Empezar ahora</button></article>)}</div></div>
    </section>

    <section id="demo" className="bg-white py-20 sm:py-24"><div className="mx-auto max-w-4xl px-4 text-center sm:px-6"><span className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-[9px] font-semibold uppercase tracking-wide text-brand-600">Demo</span><h2 className="mt-4 text-2xl font-semibold text-ink-900 sm:text-3xl">Prueba la experiencia desde tu celular</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#9a9eb5]">Escanea el QR para abrir WAMERCIO. No necesitas instalar nada; el panel también funciona como PWA.</p><div className="mx-auto mt-8 w-fit border border-[#eef0f5] bg-white p-4 shadow-soft"><QRCodeSVG value="https://wamercio.com/?access=1" size={150} fgColor="#2e3154" bgColor="#ffffff"/></div><button onClick={open} className="mt-5 rounded border border-brand-500 px-5 py-2 text-[10px] font-semibold uppercase tracking-wide text-brand-600">Probar en la web</button></div></section>

    <section className="bg-brand-500 py-16 text-white"><div className="mx-auto max-w-5xl px-4 sm:px-6"><div className="text-center"><span className="rounded-full bg-white px-2 py-1 text-[8px] font-semibold uppercase text-brand-600">WAMERCIO</span><h2 className="mt-4 text-2xl font-semibold sm:text-3xl">Todo tu comercio, más cerca de tus clientes</h2></div><div className="mt-10 grid gap-4 md:grid-cols-3">{[[Store,'Tienda online','Comparte tu catálogo con enlace o QR y mantenlo actualizado desde cualquier dispositivo.'],[CreditCard,'Cobros sencillos','Configura efectivo, transferencia o pago al recibir según tu forma de operar.'],[ClipboardList,'Historial completo','Pedidos, clientes, conversaciones y movimientos conectados en un mismo flujo.']].map(([I,t,d]:any)=><article key={t} className="bg-white p-5 text-ink-900"><I className="h-5 w-5 text-brand-500"/><h3 className="mt-3 text-sm font-medium">{t}</h3><p className="mt-2 text-xs leading-5 text-[#999eb5]">{d}</p></article>)}</div></div></section>

    <footer className="bg-[#f7f8fb]"><div className="mx-auto max-w-5xl px-4 py-10 sm:px-6"><div className="flex flex-col gap-6 border-b border-[#e9ebf2] pb-8 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-lg font-light text-[#7884e8]">WAMERCIO</div><p className="mt-1 text-sm text-[#8d92aa]">Comercio y pedidos por WhatsApp, simplificados.</p></div><div className="flex flex-wrap gap-5 text-xs text-[#969bb3]"><a href="#funciones">Funciones</a><a href="#planes">Planes</a><button onClick={open}>Acceder</button><Link href="/admin/login">SuperAdmin</Link></div></div><div className="pt-6 text-[10px] text-[#a4a8ba]">© {new Date().getFullYear()} WAMERCIO.</div></div></footer>
  </main>
}
