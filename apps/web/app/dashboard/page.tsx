'use client'

import Link from 'next/link'
import {useEffect,useMemo,useState} from 'react'
import StoreShell,{StoreSelector} from '@/components/store-shell'
import {getMerchantModules} from '@/lib/merchant-modules'
import {getBusinessCopy} from '@/lib/business-language'
import {api,money} from '@/lib/api'
import {Alert,Loading,Status} from '@/components/ui'
import {ArrowRight,Banknote,Building2,CalendarDays,CircleDollarSign,Eye,PackageCheck,ReceiptText,ShoppingBag,Store,UsersRound,WalletCards} from 'lucide-react'

type RangeKey='7d'|'30d'|'90d'
type Analytics={
  range:string
  metrics:{orders:number;revenue:number;average_ticket:number;customers:number;repeat_customer_rate?:number;cancellation_rate?:number}
  daily:{date:string;orders:number;revenue:number}[]
  source_breakdown:{name:string;orders:number;revenue:number}[]
  top_products:{product_id?:string;name:string;quantity:number;revenue:number;image_url?:string}[]
}
type Order={id:string;number:number;customer_name:string;total:number;status:string;payment_status:string;source:string;flow_type:string;created_at:string}

const RANGE_OPTIONS:{value:RangeKey;label:string}[]=[
  {value:'7d',label:'Últimos 7 días'},
  {value:'30d',label:'Últimos 30 días'},
  {value:'90d',label:'Últimos 90 días'},
]
const openStatuses=new Set(['pending','confirmed','processing','preparing','ready','out_for_delivery'])
const sourceLabel=(v:string)=>({whatsapp:'WhatsApp',storefront:'Tienda online',web:'Tienda online',pos:'Punto de venta',quote:'Cotización',manual:'Manual'} as Record<string,string>)[String(v||'').toLowerCase()]||v||'Otros'

function shortDay(value:string,range:RangeKey){
  const d=new Date(`${value}T12:00:00`)
  return new Intl.DateTimeFormat('es-DO',range==='7d'?{weekday:'short'}:{day:'2-digit',month:'short'}).format(d).replace('.','')
}

function RevenueChart({rows,range}:{rows:Analytics['daily'];range:RangeKey}){
  const width=760,height=220,padX=30,padTop=18,padBottom=34
  const values=rows.map(x=>Number(x.revenue||0)),max=Math.max(1,...values)
  const usableW=width-padX*2,usableH=height-padTop-padBottom
  const points=rows.map((row,i)=>({x:padX+(rows.length<=1?usableW/2:i/(rows.length-1)*usableW),y:padTop+usableH-(Number(row.revenue||0)/max)*usableH,row}))
  const line=points.map((p,i)=>`${i?'L':'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const area=points.length?`M ${points[0].x} ${padTop+usableH} ${points.map(p=>`L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')} L ${points[points.length-1].x} ${padTop+usableH} Z`:''
  const step=range==='7d'?1:range==='30d'?Math.max(1,Math.ceil(rows.length/7)):Math.max(1,Math.ceil(rows.length/8))
  return <div className="overflow-x-auto px-2 pb-2">
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] min-w-[620px] w-full" role="img" aria-label="Importes de operaciones no canceladas por día">
      <defs><linearGradient id="merchantRevenueArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#0b6843" stopOpacity=".15"/><stop offset="100%" stopColor="#0b6843" stopOpacity="0"/></linearGradient></defs>
      {[0,.25,.5,.75,1].map((ratio,i)=>{const y=padTop+usableH-ratio*usableH;return <line key={i} x1={padX} y1={y} x2={width-padX} y2={y} stroke="#ebe4da" strokeWidth="1"/>})}
      {area&&<path d={area} fill="url(#merchantRevenueArea)"/>}
      {line&&<path d={line} fill="none" stroke="#0b6843" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>}
      {points.map((p,i)=><g key={p.row.date}><circle cx={p.x} cy={p.y} r="3" fill="#fff" stroke="#0b6843" strokeWidth="2"><title>{`${shortDay(p.row.date,range)} · ${money(p.row.revenue)} · ${p.row.orders} operaciones`}</title></circle>{(i%step===0||i===points.length-1)&&<text x={p.x} y={height-9} textAnchor="middle" fontSize="10" fill="#7c8983">{shortDay(p.row.date,range)}</text>}</g>)}
    </svg>
  </div>
}

function SourceDonut({rows}:{rows:Analytics['source_breakdown']}){
  const clean=rows.filter(x=>Number(x.orders||0)>0)
  const total=clean.reduce((sum,x)=>sum+Number(x.orders||0),0)
  const palette=['#0b6843','#35a46f','#d18b2c','#4c7c9d','#8a6ca8','#b45b45']
  let at=0
  const stops=clean.map((row,i)=>{const start=at;at+=total?Number(row.orders||0)/total*100:0;return `${palette[i%palette.length]} ${start}% ${at}%`})
  const bg=total?`conic-gradient(${stops.join(',')})`:'#eee8df'
  return <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-5 p-5 sm:flex-row xl:flex-col">
    <div className="relative h-32 w-32 shrink-0 rounded-full" style={{background:bg}}><div className="absolute inset-[18px] grid place-items-center rounded-full bg-white text-center"><span><strong className="block text-xl text-[#083d2b]">{total}</strong><span className="text-[10px] text-[#7c8983]">pedidos</span></span></div></div>
    <div className="w-full max-w-xs space-y-2">{clean.length?clean.slice(0,6).map((row,i)=><div key={`${row.name}-${i}`} className="flex items-center gap-2 text-xs"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{background:palette[i%palette.length]}}/><span className="min-w-0 flex-1 truncate text-[#5d6d65]">{sourceLabel(row.name)}</span><strong className="text-[#083d2b]">{row.orders}</strong></div>):<div className="py-4 text-center text-xs text-[#7c8983]">Aún no hay operaciones registradas en este período.</div>}</div>
  </div>
}

export default function Dashboard(){
  const[storeID,setStoreID]=useState('')
  const[store,setStore]=useState<any>(null)
  const[me,setMe]=useState<any>(null)
  const[range,setRange]=useState<RangeKey>('7d')
  const[analytics,setAnalytics]=useState<Analytics|null>(null)
  const[orders,setOrders]=useState<Order[]>([])
  const[branches,setBranches]=useState<any[]>([])
  const[cashSessions,setCashSessions]=useState<any[]>([])
  const[courierBalances,setCourierBalances]=useState<any[]>([])
  const[busy,setBusy]=useState(false)
  const[err,setErr]=useState('')
  const modules=getMerchantModules(store)
  const copy=getBusinessCopy(store)
  const quotationBusiness=!!store?.template_config?.quotation||store?.business_engine==='quotation'
  const metricOperationLabel=quotationBusiness?'Pedidos de venta':copy.operations_plural

  useEffect(()=>{api('/me').then(setMe).catch(()=>{})},[])
  useEffect(()=>{
    if(!storeID){setAnalytics(null);setOrders([]);setBranches([]);setCashSessions([]);setCourierBalances([]);return}
    let active=true
    setBusy(true);setErr('')
    Promise.all([
      api<Analytics>(`/analytics?store_id=${encodeURIComponent(storeID)}&range=${range}`),
      api<Order[]>(`/orders?store_id=${encodeURIComponent(storeID)}`),
      modules.branches||modules.cash?api<any[]>(`/branches?store_id=${encodeURIComponent(storeID)}`):Promise.resolve([]),
      modules.cash?api<any[]>(`/cash/sessions?store_id=${encodeURIComponent(storeID)}`):Promise.resolve([]),
      modules.delivery?api<any[]>(`/delivery/courier-balances?store_id=${encodeURIComponent(storeID)}`).catch(()=>[]):Promise.resolve([]),
    ]).then(([a,o,b,cash,balances])=>{if(active){setAnalytics(a);setOrders(o);setBranches(b);setCashSessions(cash);setCourierBalances(balances)}}).catch((e:any)=>{if(active)setErr(e.message||'No se pudo cargar el dashboard')}).finally(()=>{if(active)setBusy(false)})
    return()=>{active=false}
  },[storeID,range,store])

  const recent=useMemo(()=>orders.slice(0,5),[orders])
  const pending=useMemo(()=>orders.filter(o=>openStatuses.has(o.status)).length,[orders])
  const first=String(me?.name||'').trim().split(/\s+/)[0]||'Hola'
  const periodLabel=RANGE_OPTIONS.find(x=>x.value===range)?.label||'Últimos 7 días'
  const openCashCount=cashSessions.filter(x=>x.status==='open').length
  const pendingCourierCash=courierBalances.reduce((sum,x)=>sum+Number(x.pending_cash||0),0)
  const context=<StoreSelector value={storeID} onChange={setStoreID} onStoreChange={setStore}/>

  return <StoreShell title="Dashboard" subtitle={copy.dashboard_hint} context={context}>
    <div className="mx-auto max-w-[1480px]">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-2xl font-extrabold tracking-[-.03em] text-[#083d2b] sm:text-3xl">Buenos días, {first}</h2><p className="mt-1 text-sm text-[#64766d]">Así está {store?.name||'tu negocio'}.</p></div>
        <label className="relative inline-flex w-fit items-center"><CalendarDays className="pointer-events-none absolute left-3 h-4 w-4 text-[#0b6843]"/><select value={range} onChange={e=>setRange(e.target.value as RangeKey)} className="field min-w-[170px] appearance-none py-2.5 pl-9 pr-8 text-xs font-semibold sm:text-sm" aria-label="Período del dashboard">{RANGE_OPTIONS.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
      </div>

      {err&&<Alert text={err}/>} {!storeID?<Loading/>:!analytics?<Loading/>:<div className={`space-y-5 transition-opacity ${busy?'opacity-60':'opacity-100'}`}>
        {Number(analytics.metrics.orders||0)===0&&<section className="merchant-dashboard-panel p-4 sm:p-5"><h3 className="text-sm font-bold text-[#083d2b]">{quotationBusiness?'Aún no hay ventas registradas en este período':`Aún no hay ${copy.operations_plural} en este período`}</h3><p className="mt-1 text-sm text-[#6f7e77]">{quotationBusiness?`Las cotizaciones se consultan en ${copy.operations_title.toLowerCase()} y no se contabilizan como ventas hasta convertirse en una operación comercial.`:`El dashboard se completará a medida que tus clientes registren ${copy.operations_plural} durante ${periodLabel.toLowerCase()}.`}</p></section>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="merchant-kpi"><div className="flex items-start justify-between gap-3"><span className="merchant-kpi-label">{metricOperationLabel}</span><span className="merchant-kpi-icon"><ShoppingBag className="h-4 w-4"/></span></div><div className="merchant-kpi-value">{Number(analytics.metrics.orders||0).toLocaleString('es-DO')}</div><div className="merchant-kpi-note">Operaciones registradas · {periodLabel.toLowerCase()}</div></article>
          <article className="merchant-kpi"><div className="flex items-start justify-between gap-3"><span className="merchant-kpi-label">Importe solicitado</span><span className="merchant-kpi-icon"><CircleDollarSign className="h-4 w-4"/></span></div><div className="merchant-kpi-value">{money(analytics.metrics.revenue||0)}</div><div className="merchant-kpi-note">Suma de solicitudes no canceladas; no implica pago confirmado</div></article>
          <article className="merchant-kpi"><div className="flex items-start justify-between gap-3"><span className="merchant-kpi-label">Por completar</span><span className="merchant-kpi-icon"><PackageCheck className="h-4 w-4"/></span></div><div className="merchant-kpi-value">{pending.toLocaleString('es-DO')}</div><div className="merchant-kpi-note">Operaciones pendientes en este momento</div></article>
          <article className="merchant-kpi"><div className="flex items-start justify-between gap-3"><span className="merchant-kpi-label">Clientes</span><span className="merchant-kpi-icon"><UsersRound className="h-4 w-4"/></span></div><div className="merchant-kpi-value">{Number(analytics.metrics.customers||0).toLocaleString('es-DO')}</div><div className="merchant-kpi-note">Clientes únicos durante el período</div></article>
        </section>

        {(modules.cash||modules.branches||modules.delivery||modules.pos)&&<section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {modules.cash&&<Link href="/cash" className="merchant-dashboard-panel flex items-center gap-3 p-4 transition hover:border-brand-200"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><WalletCards className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-[10px] font-bold uppercase tracking-[.12em] text-[#8b968f]">Caja</span><strong className="mt-0.5 block text-lg text-[#083d2b]">{openCashCount} abierta{openCashCount===1?'':'s'}</strong><span className="block truncate text-[11px] text-[#7c8983]">Turnos activos ahora</span></span><ArrowRight className="h-4 w-4 text-[#8fa098]"/></Link>}
          {modules.branches&&<Link href="/branches" className="merchant-dashboard-panel flex items-center gap-3 p-4 transition hover:border-brand-200"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Building2 className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-[10px] font-bold uppercase tracking-[.12em] text-[#8b968f]">Sucursales</span><strong className="mt-0.5 block text-lg text-[#083d2b]">{branches.filter(x=>x.is_active!==false).length}</strong><span className="block truncate text-[11px] text-[#7c8983]">Operativas en este negocio</span></span><ArrowRight className="h-4 w-4 text-[#8fa098]"/></Link>}
          {modules.delivery&&<Link href="/delivery" className="merchant-dashboard-panel flex items-center gap-3 p-4 transition hover:border-brand-200"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Banknote className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-[10px] font-bold uppercase tracking-[.12em] text-[#8b968f]">Efectivo en calle</span><strong className="mt-0.5 block text-lg text-[#083d2b]">{money(pendingCourierCash)}</strong><span className="block truncate text-[11px] text-[#7c8983]">Pendiente de liquidación</span></span><ArrowRight className="h-4 w-4 text-[#8fa098]"/></Link>}
          {modules.pos&&<Link href="/pos" className="merchant-dashboard-panel flex items-center gap-3 p-4 transition hover:border-brand-200"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><ReceiptText className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-[10px] font-bold uppercase tracking-[.12em] text-[#8b968f]">Importe promedio</span><strong className="mt-0.5 block text-lg text-[#083d2b]">{money(analytics.metrics.average_ticket||0)}</strong><span className="block truncate text-[11px] text-[#7c8983]">{periodLabel}</span></span><ArrowRight className="h-4 w-4 text-[#8fa098]"/></Link>}
        </section>}

        <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(310px,.78fr)]">
          <article className="merchant-dashboard-panel overflow-hidden"><header className="merchant-dashboard-head"><h3 className="merchant-dashboard-title">Importe de operaciones</h3>{modules.analytics&&<Link href={`/analytics?store_id=${encodeURIComponent(storeID)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[#0b6843]">Detalles <ArrowRight className="h-3.5 w-3.5"/></Link>}</header><div className="p-3"><RevenueChart rows={analytics.daily||[]} range={range}/></div></article>
          <article className="merchant-dashboard-panel overflow-hidden"><header className="merchant-dashboard-head"><h3 className="merchant-dashboard-title">{quotationBusiness?'Origen de las ventas':'Origen de las operaciones'}</h3></header><SourceDonut rows={analytics.source_breakdown||[]}/></article>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(310px,.78fr)]">
          <article className="merchant-dashboard-panel overflow-hidden"><header className="merchant-dashboard-head"><h3 className="merchant-dashboard-title">{copy.operations_plural.charAt(0).toUpperCase()+copy.operations_plural.slice(1)} recientes</h3><Link href="/orders" className="inline-flex items-center gap-1 text-xs font-semibold text-[#0b6843]">Ver todas <ArrowRight className="h-3.5 w-3.5"/></Link></header>
            {recent.length?<div className="overflow-x-auto"><table className="table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Total</th><th>Estado</th></tr></thead><tbody>{recent.map(o=><tr key={o.id}><td><Link href={`/orders?id=${o.id}`} className="font-bold text-[#0b6843]">#{o.number}</Link></td><td className="whitespace-nowrap">{o.customer_name||'Cliente'}</td><td className="whitespace-nowrap font-semibold">{money(o.total)}</td><td><Status value={o.status}/></td></tr>)}</tbody></table></div>:<div className="grid min-h-[220px] place-items-center p-6 text-center"><div><ShoppingBag className="mx-auto h-8 w-8 text-[#b5c0ba]"/><p className="mt-3 text-sm font-semibold text-[#083d2b]">Aún no hay {copy.operations_plural} recientes</p><p className="mt-1 text-xs text-[#7c8983]">Los registros aparecerán aquí cuando lleguen desde tu tienda o WhatsApp.</p></div></div>}
          </article>
          <article className="merchant-dashboard-panel overflow-hidden"><header className="merchant-dashboard-head"><h3 className="merchant-dashboard-title">{copy.catalog_items.charAt(0).toUpperCase()+copy.catalog_items.slice(1)} principales</h3>{modules.analytics&&<Link href="/analytics" className="inline-flex items-center gap-1 text-xs font-semibold text-[#0b6843]">Detalles <ArrowRight className="h-3.5 w-3.5"/></Link>}</header><div className="p-4">{analytics.top_products?.length?<div className="space-y-3">{analytics.top_products.slice(0,5).map((p,i)=><div key={`${p.product_id||p.name}-${i}`} className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#f2eee7] text-[#0b6843]">{p.image_url?<img src={p.image_url} alt="" className="h-full w-full object-cover"/>:<Store className="h-4 w-4"/>}</span><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-[#083d2b]">{p.name}</div><div className="mt-0.5 text-[11px] text-[#7c8983]">{Number(p.quantity||0).toLocaleString('es-DO')} unidad(es)</div></div><strong className="whitespace-nowrap text-xs text-[#083d2b]">{money(p.revenue)}</strong></div>)}</div>:<div className="grid min-h-[190px] place-items-center text-center"><div><Eye className="mx-auto h-7 w-7 text-[#b5c0ba]"/><p className="mt-3 text-xs text-[#7c8983]">Aún no hay registros de {copy.catalog_items} en este período.</p></div></div>}</div></article>
        </section>
      </div>}
    </div>
  </StoreShell>
}
