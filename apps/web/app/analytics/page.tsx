'use client'

import {useEffect,useMemo,useState} from 'react'
import StoreShell,{StoreSelector} from '@/components/store-shell'
import {api,money} from '@/lib/api'
import {Alert,Loading,PageEmpty} from '@/components/ui'
import {Ban,BarChart3,CalendarDays,RadioTower,ReceiptText,Repeat2,ShoppingBag,Tag,TrendingUp,Trophy,UsersRound,WalletCards} from 'lucide-react'

type AnalyticsData={
 range:string;from:string;
 metrics:{orders:number;revenue:number;average_ticket:number;customers:number;repeat_customer_rate:number;cancellation_rate:number};
 previous_period:{orders:number;revenue:number;average_ticket:number;customers:number};
 daily:{date:string;orders:number;revenue:number}[];
 fulfillment:{name:string;orders:number;revenue:number}[];
 payments:{name:string;orders:number;revenue:number}[];
 source_breakdown:{name:string;orders:number;revenue:number}[];
 top_products:{name:string;quantity:number;revenue:number}[];
 promotions:{name:string;orders:number;discount:number;revenue:number}[];
 promotion_conversion:{orders:number;rate:number;total_orders:number};
}
const fulfillmentLabels:Record<string,string>={delivery:'Delivery',pickup:'Recoger',dine_in:'Mesa'}
const paymentLabels:Record<string,string>={cash:'Efectivo',cash_on_delivery:'Tarjeta en terminal',bank_transfer:'Transferencia electrónica'}
const sourceLabels:Record<string,string>={storefront:'Tienda web',pos:'Punto de venta',whatsapp:'WhatsApp',conversation:'WhatsApp',admin:'Panel'}
function shortDay(value:string){const d=new Date(`${value}T12:00:00`);return new Intl.DateTimeFormat('es-DO',{day:'2-digit',month:'short'}).format(d)}
function delta(current:number,previous:number){if(!previous)return current>0?100:0;return ((current-previous)/Math.abs(previous))*100}
function deltaText(value:number){const sign=value>0?'+':'';return `${sign}${value.toFixed(1)}% vs. período anterior`}

export default function Analytics(){
 const[store,setStore]=useState(''),[range,setRange]=useState('30d'),[data,setData]=useState<AnalyticsData|null>(null),[loading,setLoading]=useState(false),[err,setErr]=useState('')
 useEffect(()=>{if(!store){setData(null);return};setLoading(true);setErr('');api<AnalyticsData>(`/analytics?store_id=${store}&range=${range}`).then(setData).catch((e:any)=>setErr(e.message)).finally(()=>setLoading(false))},[store,range])
 const maxRevenue=useMemo(()=>Math.max(1,...(data?.daily||[]).map(x=>Number(x.revenue||0))),[data])
 return <StoreShell title="Analítica" subtitle="Ventas, clientes y rendimiento comercial en un solo lugar" context={<StoreSelector value={store} onChange={setStore}/>} actions={<div className="inline-flex rounded-2xl border border-[#e8ebf1] bg-white p-1">{[['7d','7 días'],['30d','30 días'],['90d','90 días']].map(([value,label])=><button key={value} disabled={!store} onClick={()=>setRange(value)} className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${range===value?'bg-brand-50 text-brand-700':'text-[#7f859b] hover:text-ink-900'}`}>{label}</button>)}</div>}>
  {!store?<PageEmpty title="Selecciona una tienda" detail="Elige una tienda para consultar su rendimiento."/>:loading?<Loading/>:<div className="space-y-5">{err&&<Alert text={err}/>} {data&&<>
   <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
    {label:'Ventas',value:money(data.metrics.revenue),detail:deltaText(delta(data.metrics.revenue,data.previous_period?.revenue||0)),icon:WalletCards},
    {label:'Pedidos',value:String(data.metrics.orders),detail:deltaText(delta(data.metrics.orders,data.previous_period?.orders||0)),icon:ShoppingBag},
    {label:'Ticket promedio',value:money(data.metrics.average_ticket),detail:deltaText(delta(data.metrics.average_ticket,data.previous_period?.average_ticket||0)),icon:ReceiptText},
    {label:'Clientes',value:String(data.metrics.customers),detail:deltaText(delta(data.metrics.customers,data.previous_period?.customers||0)),icon:UsersRound},
   ].map(card=>{const I=card.icon;return <article className="card p-5" key={card.label}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.1em] text-[#9aa0b4]">{card.label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">{card.value}</p><p className="mt-1 text-xs text-[#8f95a9]">{card.detail}</p></div><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600"><I className="h-5 w-5"/></span></div></article>})}</section>

   <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
    {label:'Recompra',value:`${Number(data.metrics.repeat_customer_rate||0).toFixed(1)}%`,detail:'Clientes con más de un pedido',icon:Repeat2},
    {label:'Cancelación',value:`${Number(data.metrics.cancellation_rate||0).toFixed(1)}%`,detail:'Pedidos cancelados del período',icon:Ban},
    {label:'Ventas con promoción',value:`${Number(data.promotion_conversion?.rate||0).toFixed(1)}%`,detail:`${data.promotion_conversion?.orders||0} pedidos promocionados`,icon:TrendingUp},
    {label:'Período anterior',value:money(data.previous_period?.revenue||0),detail:`${data.previous_period?.orders||0} pedidos`,icon:BarChart3},
   ].map(card=>{const I=card.icon;return <article className="card p-5" key={card.label}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.1em] text-[#9aa0b4]">{card.label}</p><p className="mt-2 text-xl font-semibold tracking-tight text-ink-900">{card.value}</p><p className="mt-1 text-xs text-[#8f95a9]">{card.detail}</p></div><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#f5f7fa] text-[#747b92]"><I className="h-4 w-4"/></span></div></article>})}</section>

   <section className="card p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="section-kicker">Tendencia</p><h2 className="mt-1 text-lg font-semibold">Ventas por día</h2></div><CalendarDays className="h-5 w-5 text-brand-600"/></div>{data.daily.length?<div className="mt-6 space-y-3">{data.daily.map(row=><div key={row.date} className="grid items-center gap-3 sm:grid-cols-[90px_minmax(0,1fr)_125px_80px]"><span className="text-xs font-medium text-[#7f8599]">{shortDay(row.date)}</span><div className="h-8 overflow-hidden rounded-xl bg-[#f1f3f7]"><div className="h-full rounded-xl bg-brand-500/80" style={{width:`${Math.max(3,(Number(row.revenue||0)/maxRevenue)*100)}%`}}/></div><span className="text-right text-sm font-semibold text-ink-900">{money(row.revenue)}</span><span className="text-right text-xs text-[#9096aa]">{row.orders} pedidos</span></div>)}</div>:<p className="mt-6 rounded-2xl border border-dashed border-[#dfe4e6] p-8 text-center text-sm text-[#8d92aa]">Todavía no hay ventas en este período.</p>}</section>

   <div className="grid gap-5 xl:grid-cols-2"><section className="card p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-50 text-brand-600"><BarChart3 className="h-5 w-5"/></span><div><p className="section-kicker">Modalidad</p><h2 className="font-semibold">Ventas por entrega</h2></div></div><div className="mt-5 space-y-3">{data.fulfillment.length?data.fulfillment.map(row=><div key={row.name} className="flex items-center justify-between gap-4 rounded-2xl border border-[#edf0f5] p-4"><div><p className="text-sm font-semibold">{fulfillmentLabels[row.name]||row.name||'Sin definir'}</p><p className="mt-1 text-xs text-[#9399ad]">{row.orders} pedidos</p></div><span className="text-sm font-semibold text-brand-700">{money(row.revenue)}</span></div>):<p className="text-sm text-[#8d92aa]">Sin datos.</p>}</div></section>
    <section className="card p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-50 text-brand-600"><WalletCards className="h-5 w-5"/></span><div><p className="section-kicker">Cobro</p><h2 className="font-semibold">Métodos de pago</h2></div></div><div className="mt-5 space-y-3">{data.payments.length?data.payments.map(row=><div key={row.name} className="flex items-center justify-between gap-4 rounded-2xl border border-[#edf0f5] p-4"><div><p className="text-sm font-semibold">{paymentLabels[row.name]||row.name||'Sin definir'}</p><p className="mt-1 text-xs text-[#9399ad]">{row.orders} pedidos</p></div><span className="text-sm font-semibold text-brand-700">{money(row.revenue)}</span></div>):<p className="text-sm text-[#8d92aa]">Sin datos.</p>}</div></section></div>

   <section className="card p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-50 text-violet-600"><RadioTower className="h-5 w-5"/></span><div><p className="section-kicker">Origen</p><h2 className="font-semibold">Canales de venta</h2></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.source_breakdown?.length?data.source_breakdown.map(row=><div key={row.name} className="rounded-2xl border border-[#edf0f5] p-4"><p className="text-sm font-semibold">{sourceLabels[row.name]||row.name||'Sin definir'}</p><p className="mt-1 text-xs text-[#9399ad]">{row.orders} pedidos</p><p className="mt-3 text-sm font-semibold text-brand-700">{money(row.revenue)}</p></div>):<p className="text-sm text-[#8d92aa]">Sin datos de origen.</p>}</div></section>

   <div className="grid gap-5 xl:grid-cols-2"><section className="card overflow-hidden"><div className="flex items-center gap-3 border-b border-[#edf0f5] p-5"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-50 text-amber-600"><Trophy className="h-5 w-5"/></span><div><p className="section-kicker">Ranking</p><h2 className="font-semibold">Productos con mayor facturación</h2></div></div><div className="divide-y divide-[#edf0f5]">{data.top_products.length?data.top_products.map((row,index)=><div key={`${row.name}-${index}`} className="flex items-center gap-4 p-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#f4f6f9] text-xs font-bold text-[#7f859b]">{index+1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{row.name}</p><p className="mt-0.5 text-xs text-[#9399ad]">{Number(row.quantity).toLocaleString('es-DO')} unidades</p></div><span className="text-sm font-semibold text-brand-700">{money(row.revenue)}</span></div>):<p className="p-6 text-sm text-[#8d92aa]">Sin productos vendidos en el período.</p>}</div></section>
    <section className="card overflow-hidden"><div className="flex items-center gap-3 border-b border-[#edf0f5] p-5"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-50 text-cyan-600"><Tag className="h-5 w-5"/></span><div><p className="section-kicker">Promociones</p><h2 className="font-semibold">Rendimiento de descuentos automáticos</h2></div></div><div className="divide-y divide-[#edf0f5]">{data.promotions.length?data.promotions.map((row,index)=><div key={`${row.name}-${index}`} className="p-4"><div className="flex items-center justify-between gap-4"><div className="min-w-0"><p className="truncate text-sm font-semibold">{row.name}</p><p className="mt-0.5 text-xs text-[#9399ad]">{row.orders} pedidos · descuento {money(row.discount)}</p></div><span className="text-sm font-semibold text-brand-700">{money(row.revenue)}</span></div></div>):<p className="p-6 text-sm text-[#8d92aa]">Aún no hay ventas atribuidas a promociones.</p>}</div></section></div>
  </>}</div>}
 </StoreShell>
}
