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

const featureIcons=[Smartphone,MessageCircleMore,WalletCards,ShoppingBag,BarChart3,UsersRound]


export default function Landing(){
  const[accessOpen,setAccessOpen]=useState(false)
  const[plans,setPlans]=useState<Plan[]>([])
  const[platform,setPlatform]=useState<any>(null)
  useEffect(()=>{
    api<Plan[]>('/plans').then(setPlans).catch(()=>{})
    api('/public/platform').then(setPlatform).catch(()=>{})
    if(typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('access')==='1')setAccessOpen(true)
  },[])
  const open=()=>setAccessOpen(true)
  const landing=platform?.landing||{}
  const domain=typeof window!=='undefined'?window.location.hostname:'wamercio.com'
  const text=(value:any,fallback:string)=>String(value||fallback).replaceAll('{domain}',domain)
  const features=[
    {icon:featureIcons[0],title:text(landing.feature_1_title,'Crea tu tienda'),text:text(landing.feature_1_text,'Configura tu comercio, catálogo, horarios y forma de entrega desde un panel simple.')},
    {icon:featureIcons[1],title:text(landing.feature_2_title,'Pedidos por WhatsApp'),text:text(landing.feature_2_text,'Conecta WhatsApp, conversa con clientes y lleva cada pedido al panel de WAMERCIO.')},
    {icon:featureIcons[2],title:text(landing.feature_3_title,'Métodos de pago simples'),text:text(landing.feature_3_text,'Efectivo, transferencia o pago al recibir, sin obligarte a contratar una pasarela.')},
    {icon:featureIcons[3],title:text(landing.feature_4_title,'Empieza a vender rápido'),text:text(landing.feature_4_text,'Comparte tu tienda por enlace o QR y comienza a recibir pedidos desde cualquier teléfono.')},
    {icon:featureIcons[4],title:text(landing.feature_5_title,'Ventas y pedidos'),text:text(landing.feature_5_text,'Consulta pedidos, clientes, movimientos e inventario con una vista clara de tu operación.')},
    {icon:featureIcons[5],title:text(landing.feature_6_title,'Conoce a tus clientes'),text:text(landing.feature_6_text,'Historial, teléfonos, compras, notas y datos de entrega organizados en un solo lugar.')},
  ]
  if(landing.maintenance_mode)return <main className="grid min-h-dvh place-items-center bg-[#f7f9fc] p-6 text-ink-900"><div className="w-full max-w-2xl rounded-[32px] bg-[#182235] p-8 text-white shadow-2xl sm:p-12"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-500 font-bold">W</span><div><div className="text-xl font-semibold">{text(landing.brand_name,'WAMERCIO')}</div><div className="text-xs uppercase tracking-[.14em] text-white/55">{text(landing.brand_subtitle,'Comercio conversacional')}</div></div></div><div className="mt-8 inline-flex rounded-full bg-brand-500/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-brand-200">{text(landing.maintenance_badge,'Mantenimiento programado')}</div><h1 className="mt-5 text-3xl font-semibold sm:text-4xl">{text(landing.maintenance_title,'Estamos realizando mejoras en la página principal')}</h1><p className="mt-4 text-sm leading-7 text-white/70">{text(landing.maintenance_text,'La página principal estará temporalmente en mantenimiento. Los negocios activos continúan operando desde sus enlaces públicos.')}</p><button onClick={open} className="mt-7 rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold">{text(landing.maintenance_button_label,'Entrar al panel de administración')}</button><AccessModal open={accessOpen} onClose={()=>setAccessOpen(false)}/></div></main>
  return <main className="min-h-dvh overflow-x-hidden bg-white text-ink-900">
    <AccessModal open={accessOpen} onClose={()=>setAccessOpen(false)}/>

    <section className="relative overflow-hidden bg-brand-500 text-white">
      <header className="relative z-20 mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-white text-sm font-black">W</span>
          <div><div className="text-base font-semibold leading-none">{text(landing.brand_name,'wamercio')}</div><div className="mt-1 text-[8px] font-medium uppercase tracking-[.18em] text-white/70">{text(landing.brand_subtitle,'Comercio por WhatsApp')}</div></div>
        </Link>
        <nav className="ml-auto hidden items-center gap-7 text-[11px] font-medium text-white/90 lg:flex">
          <a href="#funciones" className="hover:text-white">{text(landing.nav_features_label,'Funciones')}</a>
          <a href="#como-funciona" className="hover:text-white">{text(landing.nav_product_label,'Producto')}</a>
          <a href="#planes" className="hover:text-white">{text(landing.nav_prices_label,'Precios')}</a>
          <a href="#demo" className="hover:text-white">{text(landing.nav_demo_label,'Demo')}</a>
        </nav>
        <button onClick={open} className="ml-auto rounded border border-white bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-600 shadow-sm lg:ml-7">{text(landing.nav_access_label,'Acceder')}</button>
        <button onClick={open} className="ml-2 hidden rounded border border-white/70 bg-transparent px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white sm:inline-flex">{text(landing.nav_register_label,'Registrarme')}</button>
      </header>

      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-28 pt-14 sm:px-6 sm:pb-36 lg:grid-cols-[1fr_1.05fr] lg:px-8 lg:pt-20">
        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#32394f] px-3 py-1.5 text-[10px] font-medium shadow"><span className="rounded bg-rose-500 px-1.5 py-0.5 text-[8px] font-bold">NUEVO</span> {text(landing.hero_badge,'Tu comercio puede vender desde WhatsApp')}</div>
          <p className="mt-6 text-lg font-light text-white/80">{text(landing.hero_kicker,'Simple y amigable')}</p>
          <h1 className="mt-1 text-3xl font-semibold leading-tight sm:text-4xl lg:text-[44px]">{text(landing.hero_title,'Tu comercio y tus pedidos más fáciles con WhatsApp.')}</h1>
          <p className="mt-5 max-w-lg text-sm leading-6 text-white/80">{text(landing.hero_subtitle,'Crea tu tienda digital, comparte tu catálogo, recibe pedidos y administra clientes desde WAMERCIO. Sin complicaciones y pensado para vender desde el celular.')}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button onClick={open} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-900 shadow-lg">{text(landing.access_label,'Empezar ahora')} <ArrowRight className="h-3.5 w-3.5"/></button>
            <a href="#demo" className="inline-flex items-center gap-2 rounded-full border border-white bg-transparent px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-white"><Play className="h-3.5 w-3.5"/> {text(landing.demo_label,'Ver demo')}</a>
          </div>
        </div>

        <div className="relative mx-auto min-h-[320px] w-full max-w-[560px] sm:min-h-[390px]">
          <div className="absolute left-[7%] top-[18%] h-64 w-64 rounded-[45%] bg-[#8edbc0]/70 sm:h-72 sm:w-72"/>
          <div className="absolute right-[8%] top-[9%] h-56 w-56 rounded-[46%] bg-[#79cfb1]/65 sm:h-64 sm:w-64"/>
          <div className="absolute left-[32%] top-[8%] grid h-20 w-20 place-items-center rounded-full bg-white shadow-xl sm:h-24 sm:w-24"><MessageCircleMore className="h-10 w-10 text-brand-500 sm:h-12 sm:w-12"/></div>
          <div className="absolute bottom-[12%] left-[12%] w-[43%] rounded-xl bg-[#7c68df] p-4 text-white shadow-2xl sm:p-5">
            <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-white/20"><Store className="h-4 w-4"/></span><div><p className="text-[9px] text-white/70">{text(landing.hero_mock_store_name,'Mi tienda')}</p><p className="text-sm font-semibold">{text(landing.hero_mock_catalog_status,'Catálogo activo')}</p></div></div>
            <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded bg-white/10 p-2"><p className="text-[9px] text-white/70">{text(landing.hero_mock_orders_label,'Pedidos')}</p><p className="text-lg font-semibold">18</p></div><div className="rounded bg-white/10 p-2"><p className="text-[9px] text-white/70">{text(landing.hero_mock_sales_label,'Ventas')}</p><p className="text-sm font-semibold">RD$24,850</p></div></div>
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
        <div className="mx-auto mt-8 max-w-xl space-y-3"><div className="bg-[#4fd9a8] px-4 py-2 text-center text-[11px] font-medium text-white">{text(landing.features_strip_primary,'WAMERCIO organiza catálogo, pedidos, clientes y WhatsApp en un solo lugar.')}</div><div className="bg-[#7587e8] px-4 py-2 text-center text-[11px] font-medium text-white">{text(landing.features_strip_secondary,'Tu operación sigue siendo simple aunque tu negocio crezca.')}</div></div>
      </div>
    </section>

    <section id="como-funciona" className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center"><h2 className="text-2xl font-semibold text-ink-900 sm:text-3xl">{text(landing.process_title,'No existe un proceso más simple')}</h2><p className="mt-3 text-sm text-[#9a9eb5]">{text(landing.process_subtitle,'Administrar pedidos puede sentirse tan fácil como conversar con un cliente.')}</p></div>
        <div className="mt-14 grid items-center gap-10 md:grid-cols-2">
          <div className="space-y-7 text-sm leading-6 text-[#8e93ad]"><div><h3 className="font-medium text-ink-900">{text(landing.process_customer_title,'Para tus clientes')}</h3><p className="mt-2">{text(landing.process_customer_text,'Tus clientes abren tu catálogo desde un enlace o QR, eligen sus productos y envían el pedido sin instalar aplicaciones.')}</p></div><div><h3 className="font-medium text-ink-900">{text(landing.process_business_title,'Para tu comercio')}</h3><p className="mt-2">{text(landing.process_business_text,'Recibes pedidos en WAMERCIO, actualizas estados, atiendes WhatsApp, controlas clientes y mantienes todo el historial organizado.')}</p></div></div>
          <div className="mx-auto w-full max-w-[280px] rounded-[34px] bg-[#2e3154] p-2 shadow-[0_24px_60px_rgba(46,49,84,.22)]"><div className="overflow-hidden rounded-[28px] bg-white"><div className="bg-brand-500 px-4 py-3 text-center text-xs font-medium text-white">{text(landing.process_mock_store_title,'Mi Comercio')}</div><div className="p-4"><div className="rounded-lg bg-[#fafbfe] p-3"><p className="text-xs font-medium text-ink-900">{text(landing.process_mock_products_title,'Productos destacados')}</p><div className="mt-3 grid grid-cols-2 gap-2"><div className="h-20 rounded bg-[#eef0f5]"/><div className="h-20 rounded bg-[#eef0f5]"/></div></div><div className="mt-3 rounded-lg border border-[#eef0f5] p-3"><p className="text-xs font-medium text-ink-900">{text(landing.process_mock_order_title,'Tu pedido')}</p><div className="mt-2 h-2 w-2/3 rounded bg-[#e5e7ef]"/><div className="mt-2 h-2 w-1/2 rounded bg-[#eceef5]"/><button className="mt-4 w-full rounded bg-brand-500 py-2 text-[10px] font-medium text-white">{text(landing.process_mock_button_label,'Enviar pedido')}</button></div></div></div></div>
        </div>
      </div>
    </section>

    <section id="planes" className="bg-brand-500 py-20 text-white sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6"><div className="text-center"><h2 className="text-2xl font-semibold sm:text-3xl">{text(landing.plans_title,'Planes WAMERCIO')}</h2><p className="mt-3 text-sm text-white/75">{text(landing.plans_subtitle,'Empieza simple y crece cuando tu comercio lo necesite.')}</p></div><div className={`mx-auto mt-10 grid gap-5 ${plans.length>=3?'lg:grid-cols-3':plans.length===2?'md:grid-cols-2':'max-w-sm'}`}>{plans.length===0?<div className="bg-white p-8 text-center text-sm text-[#8e93ad]">{text(landing.plans_empty_text,'Los planes estarán disponibles muy pronto.')}</div>:plans.map(p=><article key={p.id} className="relative bg-white p-7 text-center text-ink-900 shadow-lg"><h3 className="text-xl font-light text-[#777c9d]">{p.name}</h3><p className="mt-3 min-h-10 text-xs leading-5 text-[#a1a5ba]">{p.description||text(landing.plan_default_description,'Todo lo necesario para operar tu comercio.')}</p><div className="mt-5 text-4xl font-light text-ink-900">{p.price?money(p.price):'RD$ 0'}<span className="ml-1 text-xs text-[#9a9eb5]">/{p.billing_period==='yearly'?'año':'mes'}</span></div><div className="mt-6 space-y-3 text-xs text-[#878ca7]">{[`${p.max_stores} tienda${p.max_stores===1?'':'s'}`,`${p.max_products.toLocaleString()} productos`,text(landing.plan_whatsapp_feature,'WhatsApp incluido'),text(landing.plan_orders_feature,'Pedidos sin bloqueo')].map(x=><div key={x} className="flex items-center justify-center gap-2"><Check className="h-3.5 w-3.5 text-brand-500"/>{x}</div>)}</div><button onClick={open} className="mt-7 rounded border border-brand-500 px-5 py-2 text-[10px] font-semibold uppercase tracking-wide text-brand-600 hover:bg-brand-50">{text(landing.plans_button_label,'Empezar ahora')}</button></article>)}</div></div>
    </section>

    <section id="demo" className="bg-white py-20 sm:py-24"><div className="mx-auto max-w-4xl px-4 text-center sm:px-6"><span className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-[9px] font-semibold uppercase tracking-wide text-brand-600">{text(landing.demo_badge,'Demo')}</span><h2 className="mt-4 text-2xl font-semibold text-ink-900 sm:text-3xl">{text(landing.demo_title,'Prueba la experiencia desde tu celular')}</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#9a9eb5]">{text(landing.demo_text,'Escanea el QR para abrir WAMERCIO. No necesitas instalar nada; el panel también funciona como PWA.')}</p><div className="mx-auto mt-8 w-fit border border-[#eef0f5] bg-white p-4 shadow-soft"><QRCodeSVG value="https://wamercio.com/?access=1" size={150} fgColor="#2e3154" bgColor="#ffffff"/></div><button onClick={open} className="mt-5 rounded border border-brand-500 px-5 py-2 text-[10px] font-semibold uppercase tracking-wide text-brand-600">{text(landing.demo_button_label,'Probar en la web')}</button></div></section>

    <section className="bg-brand-500 py-16 text-white"><div className="mx-auto max-w-5xl px-4 sm:px-6"><div className="text-center"><span className="rounded-full bg-white px-2 py-1 text-[8px] font-semibold uppercase text-brand-600">{text(landing.closing_badge,'WAMERCIO')}</span><h2 className="mt-4 text-2xl font-semibold sm:text-3xl">{text(landing.closing_title,'Todo tu comercio, más cerca de tus clientes')}</h2></div><div className="mt-10 grid gap-4 md:grid-cols-3">{[[Store,text(landing.closing_1_title,'Tienda online'),text(landing.closing_1_text,'Comparte tu catálogo con enlace o QR y mantenlo actualizado desde cualquier dispositivo.')],[CreditCard,text(landing.closing_2_title,'Cobros sencillos'),text(landing.closing_2_text,'Configura efectivo, transferencia o pago al recibir según tu forma de operar.')],[ClipboardList,text(landing.closing_3_title,'Historial completo'),text(landing.closing_3_text,'Pedidos, clientes, conversaciones y movimientos conectados en un mismo flujo.')]].map(([I,t,d]:any)=><article key={t} className="bg-white p-5 text-ink-900"><I className="h-5 w-5 text-brand-500"/><h3 className="mt-3 text-sm font-medium">{t}</h3><p className="mt-2 text-xs leading-5 text-[#999eb5]">{d}</p></article>)}</div></div></section>

    <footer className="bg-[#f7f8fb]"><div className="mx-auto max-w-5xl px-4 py-10 sm:px-6"><div className="flex flex-col gap-6 border-b border-[#e9ebf2] pb-8 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-lg font-light text-[#7884e8]">{text(landing.footer_brand,'WAMERCIO')}</div><p className="mt-1 text-sm text-[#8d92aa]">{text(landing.footer_text,'Comercio y pedidos por WhatsApp, simplificados.')}</p></div><div className="flex flex-wrap gap-5 text-xs text-[#969bb3]"><a href="#funciones">{text(landing.footer_features_label,'Funciones')}</a><a href="#planes">{text(landing.footer_plans_label,'Planes')}</a><button onClick={open}>{text(landing.footer_access_label,'Acceder')}</button><Link href="/admin/login">{text(landing.footer_admin_label,'SuperAdmin')}</Link></div></div><div className="pt-6 text-[10px] text-[#a4a8ba]">© {new Date().getFullYear()} WAMERCIO.</div></div></footer>
  </main>
}
