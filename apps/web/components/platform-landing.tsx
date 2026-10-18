'use client'

import {profileModuleSummary} from '@/lib/merchant-modules'
import Link from 'next/link'
import {useEffect,useMemo,useState,type ReactNode} from 'react'
import {QRCodeSVG} from 'qrcode.react'
import AccessModal from '@/components/access-modal'
import WamercioLogo from '@/components/wamercio-logo'
import {api,money} from '@/lib/api'
import type {Plan} from '@/lib/types'
import {landingDefaults,normalizeLandingSections,type LandingSectionId} from '@/lib/landing-config'
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Link2,
  Menu,
  MessageCircleMore,
  Send,
  ShoppingBag,
  Smartphone,
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
  if(settings.appointments)signals.push('Solicitudes de cita')
  if(settings.quotation||template.engine==='quotation')signals.push('Cotizaciones')
  if(settings.wholesale||template.engine==='wholesale')signals.push('Mayoreo')
  if(settings.delivery_enabled!==false&&template.engine!=='services')signals.push('Delivery')
  if(settings.supports_dine_in)signals.push('Mesas')
  if(settings.supports_variants)signals.push('Variantes')
  if(settings.track_stock_default)signals.push('Inventario')
  if(signals.length===0)signals.push(template.engine==='services'?'Servicios por WhatsApp':'Pedidos y catálogo')
  return signals.slice(0,4)
}

function templatePrimaryModules(template:LandingTemplate){
  const modules=profileModuleSummary({business_engine:template.engine,template_slug:template.slug,template_config:template.settings})
  // Vista de producto real: solo se anuncian módulos habilitados en la plantilla.
  return ['WhatsApp','Pedidos','Catálogo',...modules].slice(0,5)
}

function templateFitCopy(template:LandingTemplate){
  const settings=template.settings||{}
  if(settings.appointments)return 'El cliente solicita un turno con fecha y hora. El negocio organiza sus pedidos, clientes y conversaciones sin funciones de mesas.'
  if(settings.quotation||template.engine==='quotation')return 'La navegación pone al frente catálogo técnico, cotizaciones y seguimiento comercial.'
  if(settings.wholesale||template.engine==='wholesale')return 'La experiencia se orienta a volumen, clientes recurrentes y control comercial sin distraer con módulos irrelevantes.'
  if(settings.supports_dine_in)return 'Pedidos, caja y cocina forman el núcleo. Si el negocio atiende en salón, puede activar mesas y reservaciones.'
  if(template.engine==='food')return 'La operación se enfoca en vender rápido: menú, combos, pedidos, entregas y conversación.'
  if(template.engine==='fashion')return 'La plantilla da más peso a colección, stock, promociones y clientes para vender visualmente sin ruido.'
  return 'El negocio conserva un panel limpio con catálogo, clientes, pedidos y conversación como núcleo operativo.'
}

function BrandIdentity({landing}:{landing:Record<string,any>}){
  const logo=String(landing.brand_logo_url||'').trim()
  return logo?<img src={logo} alt={String(landing.brand_name||'WAMERCIO')} className="h-9 max-w-[175px] object-contain"/>:<WamercioLogo mode="full"/>
}

function splitHeroTitle(title:string){
  return title.split(/(WhatsApp)/gi).map((part,index)=>part.toLowerCase()==='whatsapp'?<span key={index} className="text-[#16865a]">{part}</span>:<span key={index}>{part}</span>)
}

function HeroPreview({landing}:{landing:Record<string,any>}){
  const t=(key:string)=>String(landing[key]??landingDefaults[key]??'')
  const metrics=[
    [t('hero_mock_orders_label'),t('hero_mock_orders_value'),ClipboardList],
    [t('hero_mock_sales_label'),t('hero_mock_sales_value'),BarChart3],
    [t('hero_mock_customers_label'),t('hero_mock_customers_value'),UsersRound],
  ] as const
  return <div className="relative mx-auto w-full min-w-0 max-w-[620px] lg:ml-auto" aria-label={t('hero_mock_caption')}>
    <div className="overflow-hidden rounded-[26px] border border-[#dce8df] bg-white shadow-[0_24px_65px_rgba(4,52,32,.10)] sm:rounded-[30px]">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[#e8eee9] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#0b5d3b] text-white"><Store className="h-5 w-5"/></span><div className="min-w-0"><p className="truncate text-xs font-extrabold text-[#073e29]">{t('hero_mock_store_name')}</p><p className="mt-0.5 text-[10px] font-medium text-[#698273]">{t('hero_mock_side_label')}</p></div></div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#e5f5ec] px-2.5 py-1.5 text-[10px] font-bold text-[#0b6941]"><span className="h-1.5 w-1.5 rounded-full bg-[#1eaa65]"/>{t('hero_mock_catalog_status')}</div>
      </div>
      <div className="grid min-w-0 sm:grid-cols-[148px_minmax(0,1fr)]">
        <div className="hidden bg-[#075b3a] p-4 text-white sm:block">
          <div className="rounded-xl bg-white/10 px-3 py-3"><div className="text-[10px] font-bold uppercase tracking-[.1em] text-white/70">{t('hero_mock_side_label')}</div><div className="mt-2 text-sm font-bold leading-5">{t('hero_mock_banner_title')}</div></div>
          <div className="mt-5 space-y-2">{[t('hero_mock_menu_1'),t('hero_mock_menu_2'),t('hero_mock_menu_3'),t('hero_mock_menu_4')].map((item,index)=><div key={index} className={`rounded-lg px-3 py-2 text-[11px] font-semibold ${index===0?'bg-white text-[#075b3a]':'bg-white/10 text-white/80'}`}>{item}</div>)}</div>
        </div>
        <div className="min-w-0 bg-[#f8fbf8] p-3.5 sm:p-5">
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5">{metrics.map(([label,value,Icon],index)=><div key={index} className="min-w-0 rounded-2xl border border-[#e1ebe3] bg-white p-2.5 sm:p-3"><Icon className="h-4 w-4 text-[#128153]"/><p className="mt-2 text-[9px] font-semibold leading-4 text-[#597366] sm:text-[10px]">{label}</p><p className="mt-1 break-words text-[14px] font-extrabold tracking-tight text-[#08462f] sm:text-[17px]">{value}</p></div>)}</div>
          <div className="mt-3.5 rounded-2xl border border-[#dce9de] bg-white p-4 sm:p-5">
            <span className="text-[10px] font-bold uppercase tracking-[.14em] text-[#16865a]">{t('hero_mock_caption')}</span>
            <h3 className="mt-2 text-lg font-extrabold leading-6 tracking-[-.025em] text-[#073e29] sm:text-xl">{t('hero_mock_banner_title')}</h3>
            <p className="mt-2 text-xs leading-5 text-[#587466] sm:text-[13px]">{t('hero_mock_banner_text')}</p>
            <div className="mt-4 grid grid-cols-3 gap-1.5 text-center">{[t('hero_mock_menu_2'),t('hero_mock_menu_4'),t('hero_mock_menu_1')].map((label,index)=><div key={index} className="min-w-0 rounded-xl bg-[#ecf7ef] px-1.5 py-3"><span className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-white text-[#0b7046]">{index===0?<Boxes className="h-3.5 w-3.5"/>:index===1?<MessageCircleMore className="h-3.5 w-3.5"/>:<ShoppingBag className="h-3.5 w-3.5"/>}</span><span className="mt-1.5 block break-words text-[10px] font-semibold leading-4 text-[#0a5439]">{label}</span></div>)}</div>
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#0b5d3b] px-3 py-2 text-[11px] font-bold text-white">{t('hero_mock_action_label')}<ChevronRight className="h-3.5 w-3.5"/></div>
          </div>
        </div>
      </div>
    </div>
  </div>
}

function ChatCommerceMock({landing}:{landing:Record<string,any>}){
  const t=(key:string)=>String(landing[key]??landingDefaults[key]??'')
  return <div className="mx-auto w-full min-w-0 max-w-[590px] overflow-hidden rounded-[26px] border border-[#d8e6db] bg-white shadow-[0_16px_46px_rgba(5,62,36,.08)]">
    <div className="flex items-center gap-3 bg-[#075b3a] px-4 py-3.5 text-white sm:px-5"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15"><Store className="h-5 w-5"/></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{t('process_mock_store_title')}</div><div className="mt-0.5 truncate text-[11px] text-white/75">{t('process_mock_status')}</div></div><MessageCircleMore className="h-5 w-5 shrink-0 text-white/85"/></div>
    <div className="space-y-3 bg-[#f4f8f3] p-4 sm:p-5">
      <div className="mr-auto max-w-[86%] rounded-2xl rounded-tl-sm border border-[#ecf0e9] bg-white px-3.5 py-3 text-[13px] leading-[1.55] text-[#345a48] shadow-sm">{t('process_chat_1')}</div>
      <div className="ml-auto max-w-[86%] rounded-2xl rounded-tr-sm bg-[#daf4e5] px-3.5 py-3 text-[13px] leading-[1.55] text-[#145638] shadow-sm">{t('process_chat_2')}</div>
      <div className="mr-auto max-w-[80%] rounded-2xl rounded-tl-sm border border-[#ecf0e9] bg-white px-3.5 py-3 text-[13px] leading-[1.55] text-[#345a48] shadow-sm">{t('process_chat_3')}</div>
      <div className="ml-auto w-[88%] max-w-[370px] rounded-2xl rounded-tr-sm bg-[#daf4e5] p-4 text-[#0b5034] shadow-sm"><div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#0d7c4d]">{t('process_mock_order_title')}</div><div className="mt-2 text-[13px] font-semibold">{t('process_mock_products_title')}</div><div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#bee5cd] pt-3"><span className="text-[12px]">{t('process_mock_total_label')}</span><strong className="text-base">{t('process_mock_total_value')}</strong></div><p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold"><Check className="h-3.5 w-3.5"/>{t('process_mock_order_label')}</p></div>
    </div>
    <div className="flex items-center gap-3 border-t border-[#e6eee7] bg-white p-3.5"><div className="flex h-10 min-w-0 flex-1 items-center rounded-full bg-[#f2f7f3] px-4 text-[11px] font-medium text-[#7f9889]">{t('process_mock_button_label')}</div><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#0b5d3b] text-white"><Send className="h-4 w-4"/></span></div>
  </div>
}

function TemplatePreview({template,landing}:{template:LandingTemplate|null;landing:Record<string,any>}){
  const t=(key:string)=>String(landing[key]??landingDefaults[key]??'')
  const modules=template?templatePrimaryModules(template):['Productos','Clientes','Pedidos','Analítica','WhatsApp']
  const signals=template?templateSignals(template):['Catálogo','Pedidos']
  return <div className="grid overflow-hidden rounded-[25px] border border-[#dfebe1] bg-white shadow-[0_16px_44px_rgba(4,52,32,.05)] md:grid-cols-[210px_minmax(0,1fr)]">
    <div className="bg-[#0b5d3b] p-5 text-white"><div className="text-[10px] font-extrabold uppercase tracking-[.14em] text-white/65">{t('templates_selected_label')}</div><h3 className="mt-2 text-xl font-bold leading-tight">{template?.name||t('hero_mock_store_name')}</h3><p className="mt-3 text-[12px] leading-5 text-white/80">{template?.description||t('templates_preview_text')}</p><div className="mt-4 flex flex-wrap gap-1.5">{signals.slice(0,3).map(signal=><span key={signal} className="rounded-full border border-white/25 px-2 py-1 text-[10px] text-white/85">{signal}</span>)}</div></div>
    <div className="min-w-0 bg-[#f7fbf8] p-4 sm:p-6"><div className="text-[10px] font-bold uppercase tracking-[.14em] text-[#16865a]">{t('templates_preview_badge')}</div><h3 className="mt-2 text-xl font-extrabold tracking-[-.025em] text-[#073e29] sm:text-2xl">{t('templates_preview_title')}</h3><p className="mt-2 max-w-xl text-sm leading-6 text-[#62766a]">{t('templates_preview_text')}</p><div className="mt-4 flex flex-wrap gap-2">{modules.map(module=><span key={module} className="rounded-full border border-[#dce9de] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#195f3f]">{module}</span>)}</div><div className="mt-5 grid grid-cols-3 gap-2">{[1,2,3].map(n=><div key={n} className="min-w-0 rounded-xl border border-[#e1ebe3] bg-white px-3 py-3"><div className="text-[10px] leading-4 text-[#60796a]">{t(`templates_preview_metric_${n}`)}</div><strong className="mt-1 block break-words text-[14px] text-[#0b5135] sm:text-lg">{t(`templates_preview_metric_${n}_value`)}</strong></div>)}</div></div>
  </div>
}

function FeatureCard({feature}:{feature:LandingFeature}){
  const Icon=feature.icon
  return <article className="flex h-full min-w-0 flex-col rounded-[22px] border border-[#e1eae3] bg-white p-5 shadow-[0_10px_28px_rgba(5,54,33,.035)] transition hover:-translate-y-0.5 hover:border-[#bcdac6] hover:shadow-[0_14px_36px_rgba(5,54,33,.07)] sm:p-6"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e7f6ed] text-[#0d7b4d]"><Icon className="h-5 w-5"/></span><h3 className="mt-5 text-lg font-bold leading-snug tracking-[-.02em] text-[#073e29]">{feature.title}</h3><p className="mt-2 flex-1 text-sm leading-6 text-[#62766a]">{feature.copy}</p><div className="mt-4 flex flex-wrap gap-1.5">{feature.details.map(detail=><span key={detail} className="rounded-full bg-[#f0f7f1] px-2.5 py-1 text-[10px] font-semibold text-[#3e7156]">{detail}</span>)}</div></article>
}

export default function PlatformLanding(){
  const[accessOpen,setAccessOpen]=useState(false)
  const[mobileOpen,setMobileOpen]=useState(false)
  const[plans,setPlans]=useState<Plan[]>([])
  const[templates,setTemplates]=useState<LandingTemplate[]>([])
  const[activeTemplateId,setActiveTemplateId]=useState('')
  const[platform,setPlatform]=useState<any>(null)
  const[origin,setOrigin]=useState('https://wamercio.com')
  useEffect(()=>{
    api<Plan[]>('/plans').then(setPlans).catch(()=>{})
    api<LandingTemplate[]>('/templates').then(setTemplates).catch(()=>{})
    api('/public/platform').then(setPlatform).catch(()=>{})
    if(typeof window!=='undefined'){
      setOrigin(window.location.origin)
      if(new URLSearchParams(window.location.search).get('access')==='1')setAccessOpen(true)
    }
  },[])
  const landing:Record<string,any>={...landingDefaults,...(platform?.landing||{})}
  const t=(key:string)=>String(landing[key]??landingDefaults[key]??'').replaceAll('{domain}',origin.replace(/^https?:\/\//,''))
  const visible=(id:string)=>landing[`show_${id}`]!==false
  const open=()=>{setMobileOpen(false);setAccessOpen(true)}
  const showcase=useMemo(()=>[...templates].sort((a,b)=>Number(!!b.is_featured)-Number(!!a.is_featured)||Number(a.sort_order||999)-Number(b.sort_order||999)).slice(0,9),[templates])
  const activeTemplate=showcase.find(x=>x.id===activeTemplateId)||showcase[0]||null
  const templateOverrides=landing.template_overrides||{}
  const planOverrides=landing.plan_overrides||{}
  const displayTemplate=(item:LandingTemplate)=>({ ...item, name:templateOverrides[item.id]?.title??item.name, description:templateOverrides[item.id]?.description??item.description })
  const shownTemplate=activeTemplate?displayTemplate(activeTemplate):null
  // Keep template labels strictly typed even when overrides arrive from JSON settings.
  // Otherwise the result becomes `any` and Next.js strict build fails at `.map(signal => ...)`.
  const templateTags=(item:LandingTemplate):string[]=>{
    const customTags:unknown=templateOverrides[item.id]?.tags
    if(typeof customTags==='string'&&customTags.trim().length>0){
      const tags=customTags.split(',').map(tag=>tag.trim()).filter(Boolean)
      if(tags.length>0)return tags
    }
    return templateSignals(item)
  }
  const features:LandingFeature[]=[
    {icon:Boxes,title:t('feature_1_title'),copy:t('feature_1_text'),details:t('feature_1_details').split(',').map(s=>s.trim()).filter(Boolean)},
    {icon:MessageCircleMore,title:t('feature_2_title'),copy:t('feature_2_text'),details:t('feature_2_details').split(',').map(s=>s.trim()).filter(Boolean)},
    {icon:WalletCards,title:t('feature_3_title'),copy:t('feature_3_text'),details:t('feature_3_details').split(',').map(s=>s.trim()).filter(Boolean)},
    {icon:Truck,title:t('feature_4_title'),copy:t('feature_4_text'),details:t('feature_4_details').split(',').map(s=>s.trim()).filter(Boolean)},
    {icon:BarChart3,title:t('feature_5_title'),copy:t('feature_5_text'),details:t('feature_5_details').split(',').map(s=>s.trim()).filter(Boolean)},
    {icon:UsersRound,title:t('feature_6_title'),copy:t('feature_6_text'),details:t('feature_6_details').split(',').map(s=>s.trim()).filter(Boolean)},
  ]
  const navigation:[string,string,boolean][]=[
    ['#como-funciona',t('nav_features_label'),visible('process')],
    ['#plantillas',t('nav_templates_label'),visible('templates')],
    ['#funciones',t('nav_product_label'),visible('features')],
    ['#precios',t('nav_prices_label'),visible('plans')],
    ['#demo',t('nav_demo_label'),visible('demo')],
  ]
  const badge='text-[11px] font-extrabold uppercase tracking-[.16em] text-[#148253]'
  const heading='mt-3 max-w-[760px] text-[clamp(1.9rem,3.4vw,3rem)] font-extrabold leading-[1.11] tracking-[-.04em] text-[#073e29]'
  const lead='mt-4 max-w-[680px] text-[15px] leading-7 text-[#5d7768]'
  const wrap='mx-auto w-full max-w-[1200px] px-5 sm:px-8 lg:px-10'

  if(landing.maintenance_mode)return <main className="marketing-shell grid min-h-dvh place-items-center bg-[#f7faf6] p-6"><AccessModal open={accessOpen} onClose={()=>setAccessOpen(false)}/><div className="w-full max-w-2xl rounded-3xl border border-[#e0e9e1] bg-white p-8 shadow-xl sm:p-12"><WamercioLogo mode="full"/><div className={`mt-8 ${badge}`}>{t('maintenance_badge')}</div><h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[#073e29] sm:text-4xl">{t('maintenance_title')}</h1><p className="mt-4 text-base leading-7 text-[#5d7768]">{t('maintenance_text')}</p><button onClick={open} className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#0b5d3b] px-6 py-3 text-sm font-bold text-white">{t('maintenance_button_label')}<ArrowRight className="h-4 w-4"/></button></div></main>

  const sections:Record<LandingSectionId,ReactNode>={
    hero:<section id="inicio" className="scroll-mt-24 border-b border-[#e5ece4] bg-[#f7faf6] py-14 sm:py-20 lg:py-24"><div className={`${wrap} grid items-center gap-10 lg:grid-cols-[minmax(0,1.03fr)_minmax(0,.97fr)] lg:gap-12`}><div className="min-w-0"><div className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#d6e9dc] bg-white px-3.5 py-2 text-[10px] font-extrabold uppercase tracking-[.13em] text-[#13794e]"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#21aa67]"/>{t('hero_badge')}</div><p className="mt-6 text-[11px] font-bold uppercase tracking-[.12em] text-[#54866a]">{t('hero_kicker')}</p><h1 className="mt-3 max-w-[680px] break-words text-[clamp(2.45rem,4.7vw,4.45rem)] font-extrabold leading-[1.04] tracking-[-.055em] text-[#073e29]">{splitHeroTitle(t('hero_title'))}</h1><p className="mt-6 max-w-[550px] text-[15px] leading-7 text-[#5d7768] sm:text-base sm:leading-8">{t('hero_subtitle')}</p><div className="mt-7 flex flex-wrap gap-3"><button onClick={open} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#0b5d3b] px-6 py-3 text-sm font-bold text-white shadow-[0_12px_24px_rgba(11,93,59,.15)] transition hover:bg-[#07492e]">{t('access_label')}<ArrowRight className="h-4 w-4"/></button><a href={visible('process')?'#como-funciona':visible('demo')?'#demo':'#precios'} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#bdd6c5] bg-white px-6 py-3 text-sm font-bold text-[#0b5d3b] transition hover:bg-[#eaf5ed]">{t('demo_label')}</a></div>{visible('hero_highlights')&&<div className="mt-10 grid gap-3 sm:grid-cols-3">{[Link2,MessageCircleMore,BarChart3].map((Icon,index)=><div key={index} className="rounded-2xl border border-[#e1ebe3] bg-white p-4"><Icon className="h-5 w-5 text-[#16865a]"/><h3 className="mt-3 text-[13px] font-bold text-[#0b5135]">{t(`hero_highlight_${index+1}_title`)}</h3><p className="mt-1 text-xs leading-5 text-[#698174]">{t(`hero_highlight_${index+1}_text`)}</p></div>)}</div>}</div>{visible('hero_preview')&&<HeroPreview landing={landing}/>}</div></section>,
    process:<section id="como-funciona" className="scroll-mt-24 bg-white py-16 sm:py-24"><div className={wrap}><div className="mx-auto max-w-[790px] text-center"><div className={badge}>{t('process_badge')}</div><h2 className={`${heading} mx-auto`}>{t('process_title')}</h2><p className={`${lead} mx-auto`}>{t('process_subtitle')}</p></div><div className={`mt-12 grid min-w-0 gap-8 ${visible('process_chat')?'lg:grid-cols-[minmax(0,.82fr)_minmax(0,1.18fr)] lg:items-center':''}`}><div className="grid gap-3">{[Link2,Smartphone,ClipboardList].map((Icon,index)=><article key={index} className="flex min-w-0 items-start gap-4 rounded-2xl border border-[#e3ece4] bg-[#f9fbf8] p-4 sm:p-5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e5f6ea] text-[#148253]"><Icon className="h-5 w-5"/></span><div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-[.14em] text-[#148253]">Paso {index+1}</div><h3 className="mt-1 text-base font-bold text-[#073e29]">{t(`process_step_${index+1}_title`)}</h3><p className="mt-2 text-[13px] leading-6 text-[#647c6e]">{t(`process_step_${index+1}_text`)}</p></div></article>)}<div className="grid gap-3 sm:grid-cols-2">{[['process_customer_title','process_customer_text'],['process_business_title','process_business_text']].map(([key,copy])=><div key={key} className="rounded-2xl bg-[#eaf7ee] p-4"><h3 className="text-[13px] font-bold text-[#0a6b42]">{t(key)}</h3><p className="mt-1.5 text-xs leading-5 text-[#547363]">{t(copy)}</p></div>)}</div></div>{visible('process_chat')&&<ChatCommerceMock landing={landing}/>}</div></div></section>,
    templates:<section id="plantillas" className="scroll-mt-24 border-y border-[#e8efe7] bg-[#f7faf6] py-16 sm:py-24"><div className={wrap}><div className={badge}>{t('templates_badge')}</div><h2 className={heading}>{t('templates_title')}</h2><p className={lead}>{t('templates_subtitle')}</p>{showcase.length===0?<div className="mt-9 rounded-2xl border border-[#dfe9e1] bg-white p-6 text-sm text-[#587466]">{t('templates_empty_text')}</div>:<><div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{showcase.map(template=>{const active=template.id===activeTemplate?.id;return <button type="button" key={template.id} aria-pressed={active} onClick={()=>setActiveTemplateId(template.id)} className={`group min-w-0 rounded-[20px] border bg-white p-4 text-left transition sm:p-5 ${active?'border-[#0b7b4b] shadow-[0_10px_28px_rgba(5,82,48,.09)] ring-1 ring-[#0b7b4b]/30':'border-[#e0e9e2] hover:border-[#92caa5]'}`}><div className="flex items-start gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active?'bg-[#e4f5eb] text-[#0b7b4b]':'bg-[#f1f7f1] text-[#6a8373]'}`}><Store className="h-4 w-4"/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><h3 className="text-[15px] font-bold leading-5 text-[#073e29]">{displayTemplate(template).name}</h3>{template.is_featured&&<span className="rounded-full bg-[#e5f5eb] px-2 py-1 text-[9px] font-bold text-[#0b784a]">{t('templates_featured_label')}</span>}</div><p className="mt-1.5 line-clamp-3 text-[12px] leading-5 text-[#667d6e]">{displayTemplate(template).description||templateFitCopy(template)}</p></div></div><div className="mt-3 flex flex-wrap gap-1.5">{templateTags(template).slice(0,3).map(signal=><span key={signal} className="rounded-full bg-[#f1f7f1] px-2 py-1 text-[10px] font-medium text-[#507660]">{signal}</span>)}</div></button>})}</div>{visible('template_preview')&&<div className="mt-7"><TemplatePreview template={shownTemplate} landing={landing}/></div>}</>}</div></section>,
    features:<section id="funciones" className="scroll-mt-24 bg-white py-16 sm:py-24"><div className={wrap}><div className={badge}>{t('features_badge')}</div><h2 className={heading}>{t('features_title')}</h2><p className={lead}>{t('features_subtitle')}</p><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{features.map((feature,index)=><FeatureCard key={index} feature={feature}/>)}</div>{visible('features_strip')&&<div className="mt-8 flex flex-col gap-2 rounded-2xl bg-[#eaf6ed] px-6 py-6 text-[#0c5536] sm:flex-row sm:items-center sm:justify-between sm:gap-6"><p className="text-base font-bold">{t('features_strip_primary')}</p><p className="text-[13px] leading-5 text-[#507964]">{t('features_strip_secondary')}</p></div>}</div></section>,
    plans:<section id="precios" className="scroll-mt-24 border-y border-[#e4ece5] bg-[#f7faf6] py-16 sm:py-24"><div className={wrap}><div className="mx-auto max-w-[720px] text-center"><div className={badge}>{t('plans_badge')}</div><h2 className={`${heading} mx-auto`}>{t('plans_title')}</h2><p className={`${lead} mx-auto`}>{t('plans_subtitle')}</p></div><div className={`mx-auto mt-12 grid max-w-[1070px] gap-5 ${plans.length>=3?'lg:grid-cols-3':plans.length===2?'md:max-w-[720px] md:grid-cols-2':'max-w-[370px]'}`}>{plans.length===0?<div className="rounded-2xl border border-[#e3ebe4] bg-white p-7 text-center text-sm text-[#607768]">{t('plans_empty_text')}</div>:plans.map((plan,index)=><article key={plan.id} className={`relative flex min-w-0 flex-col rounded-3xl border bg-white p-6 ${index===1?'border-[#0b7c4e] shadow-[0_16px_42px_rgba(10,105,65,.11)]':'border-[#e0e9e2]'}`}>{index===1&&<span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#0b5d3b] px-3 py-1 text-[10px] font-bold text-white">{t('plans_popular_label')}</span>}<h3 className="text-lg font-bold text-[#073e29]">{planOverrides[plan.id]?.title??plan.name}</h3><p className="mt-2 min-h-10 text-[13px] leading-6 text-[#617a6b]">{planOverrides[plan.id]?.description??plan.description??t('plan_default_description')}</p><div className="mt-5 break-words text-[clamp(1.4rem,2.4vw,2rem)] font-extrabold tracking-[-.04em] text-[#07482f]">{plan.price?money(plan.price):'RD$ 0'}<span className="ml-1 text-xs font-semibold tracking-normal text-[#839588]">/{plan.billing_period==='yearly'?t('plans_year_unit'):t('plans_month_unit')}</span></div><ul className="my-6 flex-1 space-y-3 text-[13px] text-[#587361]">{[`${plan.max_stores} ${t('plans_store_unit')}${plan.max_stores===1?'':'s'}`,`${plan.max_products.toLocaleString()} ${t('plans_products_unit')}`,t('plan_whatsapp_feature'),t('plan_orders_feature')].map((line,n)=><li key={n} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#128357]"/>{line}</li>)}</ul><button onClick={open} className={`min-h-11 rounded-full px-5 py-3 text-sm font-bold transition ${index===1?'bg-[#0b5d3b] text-white hover:bg-[#07492e]':'border border-[#0b5d3b] text-[#0b5d3b] hover:bg-[#eaf6ed]'}`}>{t('plans_button_label')}</button></article>)}</div></div></section>,
    demo:<section id="demo" className="scroll-mt-24 bg-white py-14 sm:py-20"><div className={`${wrap} grid items-center gap-9 md:grid-cols-[minmax(0,1fr)_auto]`}><div><div className={badge}>{t('demo_badge')}</div><h2 className={heading}>{t('demo_title')}</h2><p className={lead}>{t('demo_text')}</p><button onClick={open} className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#0b5d3b] px-6 py-3 text-sm font-bold text-white hover:bg-[#07492e]">{t('demo_button_label')}<ArrowRight className="h-4 w-4"/></button></div>{visible('demo_qr')&&<div className="mx-auto rounded-[24px] border border-[#dce8dd] bg-[#f7faf6] p-5 text-center shadow-sm"><div className="rounded-xl bg-white p-3"><QRCodeSVG value={`${origin}/?access=1`} size={140} fgColor="#075b3a" bgColor="#ffffff"/></div><div className="mt-3 text-[11px] font-bold text-[#557d67]">{t('demo_qr_label')}</div></div>}</div></section>,
    closing:<section id="empieza" className="scroll-mt-24 border-t border-[#e2ebe4] bg-[#e9f5ed] py-16 sm:py-20"><div className={wrap}><div className="mx-auto max-w-[750px] text-center"><div className={badge}>{t('closing_badge')}</div><h2 className={`${heading} mx-auto`}>{t('closing_title')}</h2><p className={`${lead} mx-auto`}>{t('closing_subtitle')}</p></div><div className="mt-9 grid gap-4 md:grid-cols-3">{[1,2,3].map((n)=><article key={n} className="rounded-2xl border border-[#d7e9dd] bg-white p-5 sm:p-6"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e5f5ea] text-[#0b8050]">{n===1?<Store className="h-5 w-5"/>:n===2?<CreditCard className="h-5 w-5"/>:<UsersRound className="h-5 w-5"/>}</div><h3 className="mt-4 text-base font-bold text-[#073e29]">{t(`closing_${n}_title`)}</h3><p className="mt-2 text-sm leading-6 text-[#607768]">{t(`closing_${n}_text`)}</p></article>)}</div><div className="mt-8 text-center"><button onClick={open} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#0b5d3b] px-7 py-3 text-sm font-bold text-white hover:bg-[#07492e]">{t('closing_button_label')}<ArrowRight className="h-4 w-4"/></button></div></div></section>,
  }
  return <main className="marketing-shell min-h-dvh overflow-x-clip bg-[#f7faf6] text-[#365b47]">
    <AccessModal open={accessOpen} onClose={()=>setAccessOpen(false)}/>
    <header className="sticky top-0 z-50 border-b border-[#e4ece4] bg-white/95 backdrop-blur-xl"><div className={`${wrap} flex h-[72px] items-center gap-4`}><Link href="/" aria-label={t('brand_name')} className="flex min-w-0 shrink-0 items-center gap-2.5"><BrandIdentity landing={landing}/><span className="hidden max-w-32 text-[10px] font-medium leading-4 text-[#698675] xl:inline">{t('brand_subtitle')}</span></Link><nav className="ml-auto hidden items-center gap-5 xl:flex">{navigation.filter(x=>x[2]).map(([href,label])=><a key={href} href={href} className="whitespace-nowrap text-[12px] font-semibold text-[#476c55] transition hover:text-[#0b5d3b]">{label}</a>)}<Link href="/terminos" className="whitespace-nowrap text-[12px] font-semibold text-[#476c55] hover:text-[#0b5d3b]">{t('nav_terms_label')}</Link></nav><div className="ml-auto hidden items-center gap-2 sm:flex xl:ml-3"><button onClick={open} className="min-h-9 whitespace-nowrap rounded-full border border-[#a8d4b8] px-4 py-2 text-xs font-bold text-[#0b5d3b] hover:bg-[#eaf6ee]">{t('nav_access_label')}</button><button onClick={open} className="min-h-9 whitespace-nowrap rounded-full bg-[#0b5d3b] px-4 py-2 text-xs font-bold text-white hover:bg-[#07492e]">{t('nav_register_label')}</button></div><button type="button" aria-expanded={mobileOpen} aria-controls="landing-mobile-menu" aria-label={mobileOpen?'Cerrar menú':'Abrir menú'} onClick={()=>setMobileOpen(v=>!v)} className="ml-auto grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#dce8df] text-[#0b5d3b] xl:hidden sm:ml-1">{mobileOpen?<X className="h-5 w-5"/>:<Menu className="h-5 w-5"/>}</button></div>{mobileOpen&&<nav id="landing-mobile-menu" className="border-t border-[#e5eee6] bg-white px-5 py-3 shadow-lg xl:hidden"><div className="mx-auto flex max-w-[1200px] flex-col gap-1">{navigation.filter(x=>x[2]).map(([href,label])=><a key={href} href={href} onClick={()=>setMobileOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold text-[#0c5436] hover:bg-[#eef7ef]">{label}</a>)}<Link href="/terminos" onClick={()=>setMobileOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold text-[#0c5436]">{t('nav_terms_label')}</Link><button onClick={open} className="mt-2 rounded-full bg-[#0b5d3b] px-4 py-3 text-sm font-bold text-white">{t('nav_register_label')}</button></div></nav>}</header>
    {normalizeLandingSections(landing.section_order).map(section=>visible(section)?<div key={section}>{sections[section]}</div>:null)}
    {visible('footer')&&<footer className="bg-[#075b3a] text-white"><div className={`${wrap} py-12 sm:py-16`}><div className="grid gap-9 sm:grid-cols-2 lg:grid-cols-[1.45fr_.8fr_.8fr_1fr]"><div><div className="inline-flex rounded-xl bg-white px-3 py-2"><BrandIdentity landing={landing}/></div><p className="mt-4 max-w-[310px] text-sm leading-6 text-white/75">{t('footer_text')}</p><div className="mt-4 inline-flex rounded-full border border-white/20 px-3 py-1.5 text-[10px] text-white/80">{t('footer_trust_text')}</div></div><div><h3 className="text-[11px] font-bold uppercase tracking-[.15em] text-white/60">{t('footer_product_heading')}</h3><div className="mt-4 space-y-3 text-sm text-white/80">{visible('process')&&<a className="block hover:text-white" href="#como-funciona">{t('footer_process_label')}</a>}{visible('templates')&&<a className="block hover:text-white" href="#plantillas">{t('footer_templates_label')}</a>}{visible('features')&&<a className="block hover:text-white" href="#funciones">{t('footer_features_label')}</a>}{visible('plans')&&<a className="block hover:text-white" href="#precios">{t('footer_plans_label')}</a>}</div></div><div><h3 className="text-[11px] font-bold uppercase tracking-[.15em] text-white/60">{t('footer_platform_heading')}</h3><div className="mt-4 space-y-3 text-sm text-white/80"><button className="block hover:text-white" onClick={open}>{t('nav_access_label')}</button><Link className="block hover:text-white" href="/admin/login">{t('footer_admin_label')}</Link><Link className="block hover:text-white" href="/privacidad">{t('footer_privacy_label')}</Link><Link className="block hover:text-white" href="/terminos">{t('footer_terms_label')}</Link></div></div><div><h3 className="text-[11px] font-bold uppercase tracking-[.15em] text-white/60">{t('footer_cta_heading')}</h3><p className="mt-4 text-sm leading-6 text-white/75">{t('footer_cta_text')}</p><button onClick={open} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-bold text-[#075b3a] transition hover:bg-[#e4f6eb]">{t('footer_access_label')}</button></div></div>{visible('footer_legal')&&<div className="mt-10 flex flex-col gap-2 border-t border-white/20 pt-6 text-[11px] text-white/60 sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} {t('footer_brand')}. {t('footer_copyright_label')}</span><span>{t('footer_bottom_text')}</span></div>}</div></footer>}
  </main>
}
