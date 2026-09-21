'use client'

import {useEffect,useMemo,useState} from 'react'
import Link from 'next/link'
import SuperAdminShell from '@/components/superadmin-shell'
import {api,dateTime,money} from '@/lib/api'
import {Loading} from '@/components/ui'
import {
  ArrowUpRight,BadgeDollarSign,Boxes,CheckCircle2,Clock3,LifeBuoy,
  ShoppingBag,Store,TrendingUp,UsersRound,WalletCards,XCircle
} from 'lucide-react'

type TrendPoint={month:string;label:string;orders:number;revenue:number;merchants:number;stores:number}
type Activity={action:string;entity_type:string;entity_id:string;created_at:string}
type DashboardData={
  users:number;stores:number;products:number;orders:number;revenue:number;
  pending_plan_requests:number;open_tickets:number;urgent_tickets?:number;
  trend?:TrendPoint[];order_health?:{paid:number;unpaid:number;canceled:number};recent_activity?:Activity[]
}

const monthEs:Record<string,string>={Jan:'Ene',Feb:'Feb',Mar:'Mar',Apr:'Abr',May:'May',Jun:'Jun',Jul:'Jul',Aug:'Ago',Sep:'Sep',Oct:'Oct',Nov:'Nov',Dec:'Dic'}
const labelMonth=(v:string)=>monthEs[v]||v

function curve(values:number[],width=720,height=230,padX=28,padY=24){
  const max=Math.max(1,...values)
  const usableW=width-padX*2,usableH=height-padY*2
  return values.map((v,i)=>({x:padX+(values.length===1?usableW/2:(i/(values.length-1))*usableW),y:height-padY-(v/max)*usableH}))
}

function RevenueChart({trend}:{trend:TrendPoint[]}){
  const values=trend.map(x=>Number(x.revenue||0)),points=curve(values)
  const line=points.map((p,i)=>`${i?'L':'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const area=points.length?`M ${points[0].x} 206 ${points.map(p=>`L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')} L ${points[points.length-1].x} 206 Z`:''
  return <div className="mt-5"><svg viewBox="0 0 720 250" className="h-[250px] w-full overflow-visible" role="img" aria-label="Tendencia de ventas de los últimos seis meses">
    <defs><linearGradient id="revenueArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#0b5d3b" stopOpacity=".16"/><stop offset="100%" stopColor="#0b5d3b" stopOpacity="0"/></linearGradient></defs>
    {[42,83,124,165,206].map(y=><line key={y} x1="28" y1={y} x2="692" y2={y} stroke="#e8ecea" strokeDasharray="3 5"/>) }
    {area&&<path d={area} fill="url(#revenueArea)"/>}
    {line&&<path d={line} fill="none" stroke="#0b5d3b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>}
    {points.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r="4" fill="#fff" stroke="#0b5d3b" strokeWidth="3"/><text x={p.x} y="238" textAnchor="middle" fontSize="11" fill="#8e99a4">{labelMonth(trend[i]?.label||'')}</text></g>)}
  </svg></div>
}

function GrowthLine({trend}:{trend:TrendPoint[]}){
  const values=trend.map(x=>Number(x.merchants||0)),points=curve(values,560,170,20,20)
  const line=points.map((p,i)=>`${i?'L':'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  return <svg viewBox="0 0 560 190" className="mt-3 h-[190px] w-full"><line x1="20" y1="150" x2="540" y2="150" stroke="#edf0ef"/>{line&&<path d={line} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>}{points.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r="3" fill="#2563eb"/><text x={p.x} y="176" textAnchor="middle" fontSize="10" fill="#9aa3ad">{labelMonth(trend[i]?.label||'')}</text></g>)}</svg>
}

function OrderBars({trend}:{trend:TrendPoint[]}){
  const max=Math.max(1,...trend.map(x=>Number(x.orders||0)))
  return <div className="mt-5 flex h-[185px] items-end gap-4 border-b border-[#edf0ef] px-2 pb-7">{trend.map((x,i)=><div key={x.month||i} className="relative flex h-full flex-1 items-end justify-center"><div title={`${x.orders} pedidos`} className="w-full max-w-9 rounded-t-md bg-[#3dbe6b]" style={{height:`${Math.max(4,(Number(x.orders||0)/max)*100)}%`}}/><span className="absolute -bottom-6 text-[10px] text-[#9aa3ad]">{labelMonth(x.label)}</span></div>)}</div>
}

function formatAction(action:string){
  const clean=String(action||'actividad').replaceAll('.',' · ').replaceAll('_',' ')
  return clean.charAt(0).toUpperCase()+clean.slice(1)
}

export default function AdminDashboard(){
  const[d,setD]=useState<DashboardData|null>(null)
  useEffect(()=>{api<DashboardData>('/admin/dashboard').then(setD)},[])
  const trend=useMemo<TrendPoint[]>(()=>d?.trend?.length?d.trend:Array.from({length:6},(_,i)=>({month:String(i),label:['Abr','May','Jun','Jul','Ago','Sep'][i],orders:0,revenue:0,merchants:0,stores:0})),[d])
  if(!d)return <SuperAdminShell title="Dashboard" subtitle="Ventas, comercios, pedidos y actividad operativa desde una sola vista."><Loading/></SuperAdminShell>

  const health=d.order_health||{paid:0,unpaid:0,canceled:0}
  const healthTotal=Math.max(1,health.paid+health.unpaid+health.canceled)
  const paidPct=Math.round((health.paid/healthTotal)*100)
  const unpaidPct=Math.round((health.unpaid/healthTotal)*100)
  const canceledPct=Math.round((health.canceled/healthTotal)*100)

  const kpis=[
    {label:'Ventas registradas',value:money(d.revenue),note:`${d.orders} pedidos`,icon:TrendingUp,tone:'bg-[#e5f2ed] text-[#0b5d3b]',badge:'Ingresos'},
    {label:'Pedidos totales',value:d.orders.toLocaleString('es-DO'),note:`${paidPct}% pagados`,icon:CheckCircle2,tone:'bg-[#e5f7eb] text-[#22a455]',badge:'Operación'},
    {label:'Negocios activos',value:d.stores.toLocaleString('es-DO'),note:`${d.products} productos`,icon:Store,tone:'bg-[#fff2df] text-[#d9932b]',badge:'Comercios'},
    {label:'Soporte abierto',value:d.open_tickets.toLocaleString('es-DO'),note:`${d.urgent_tickets||0} prioritarios`,icon:LifeBuoy,tone:'bg-[#fde8e5] text-[#b54129]',badge:'Atención'},
  ]

  return <SuperAdminShell title="Dashboard" subtitle="Ventas, comercios, pedidos y actividad operativa desde una sola vista.">
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{kpis.map(({label,value,note,icon:I,tone,badge})=><article key={label} className="rounded-[24px] border border-[#e3e6e8] bg-[#fbfcfc] p-5 transition hover:-translate-y-0.5 hover:shadow-[0_14px_35px_rgba(23,25,28,.06)]"><div className="flex items-start justify-between gap-3"><span className={`grid h-11 w-11 place-items-center rounded-2xl ${tone}`}><I className="h-5 w-5"/></span><span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-bold text-[#717f8e] shadow-sm">{badge}</span></div><div className="mt-4 text-[10px] font-extrabold uppercase tracking-[.14em] text-[#8e99a4]">{label}</div><div className="mt-1.5 text-2xl font-extrabold tracking-[-.025em] text-[#17191c]">{value}</div><div className="mt-2 text-[10px] font-semibold text-[#717f8e]">{note}</div></article>)}</section>

      <section className="grid gap-5 xl:grid-cols-3">
        <article className="rounded-[24px] border border-[#e3e6e8] bg-white p-5 sm:p-6 xl:col-span-2"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-extrabold text-[#17191c]">Resumen de ventas</h2><p className="mt-1 text-xs text-[#8e99a4]">Ingresos registrados durante los últimos seis meses.</p></div><div className="flex items-center gap-2 text-[10px] font-semibold text-[#717f8e]"><span className="h-2 w-2 rounded-full bg-[#0b5d3b]"/>Ventas</div></div><RevenueChart trend={trend}/></article>

        <article className="rounded-[24px] border border-[#e3e6e8] bg-white p-5 sm:p-6"><div className="flex items-center justify-between"><h2 className="text-base font-extrabold text-[#17191c]">Salud de pedidos</h2><span className="rounded-full bg-[#e5f7eb] px-2.5 py-1 text-[9px] font-extrabold text-[#0b5d3b]">En vivo</span></div><div className="mt-5 text-center"><div className="text-4xl font-extrabold tracking-[-.04em] text-[#17191c]">{paidPct}%</div><div className="mt-1 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#8e99a4]">Pagados</div></div><div className="mt-6 grid grid-cols-2 gap-2">{[
          ['Pagados',health.paid,`${paidPct}%`,'text-[#0b5d3b]'],['Pendientes',health.unpaid,`${unpaidPct}%`,'text-[#d9932b]'],['Cancelados',health.canceled,`${canceledPct}%`,'text-[#b54129]'],['Productos',d.products,'Catálogo','text-[#2563eb]']
        ].map(([label,value,meta,tone]:any)=><div key={label} className="rounded-xl border border-[#e8ebed] p-3"><div className="text-[9px] font-extrabold uppercase tracking-[.12em] text-[#9aa3ad]">{label}</div><div className="mt-1 flex items-end justify-between gap-2"><span className="text-base font-extrabold text-[#17191c]">{value}</span><span className={`text-[9px] font-bold ${tone}`}>{meta}</span></div></div>)}</div><div className="mt-6 border-t border-[#edf0ef] pt-4"><div className="mb-2 flex justify-between text-[9px] font-bold text-[#717f8e]"><span>Composición</span><span>{healthTotal} pedidos</span></div><div className="flex h-2 overflow-hidden rounded-full bg-[#eef1ef]"><span className="bg-[#22a455]" style={{width:`${paidPct}%`}}/><span className="bg-[#d9932b]" style={{width:`${unpaidPct}%`}}/><span className="bg-[#b54129]" style={{width:`${canceledPct}%`}}/></div></div></article>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-[24px] border border-[#e3e6e8] bg-white p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="text-base font-extrabold text-[#17191c]">Crecimiento de comerciantes</h2><p className="mt-1 text-xs text-[#8e99a4]">Nuevos propietarios registrados por mes.</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eaf1ff] text-[#2563eb]"><UsersRound className="h-4 w-4"/></span></div><GrowthLine trend={trend}/></article>
        <article className="rounded-[24px] border border-[#e3e6e8] bg-white p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="text-base font-extrabold text-[#17191c]">Crecimiento de pedidos</h2><p className="mt-1 text-xs text-[#8e99a4]">Volumen mensual de pedidos creados.</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e5f7eb] text-[#0b5d3b]"><ShoppingBag className="h-4 w-4"/></span></div><OrderBars trend={trend}/></article>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-[24px] border border-[#e3e6e8] bg-white p-5 sm:p-6"><div className="flex items-center justify-between"><h2 className="text-base font-extrabold text-[#17191c]">Actividad reciente</h2><Link href="/admin/settings" className="text-[10px] font-bold text-[#0b5d3b]">Ver auditoría</Link></div><div className="mt-4 space-y-2">{d.recent_activity?.length?d.recent_activity.map((a,i)=><div key={`${a.created_at}-${i}`} className="flex items-center gap-3 rounded-xl border border-[#edf0ef] p-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#eef8f3] text-[#0b5d3b]"><Clock3 className="h-3.5 w-3.5"/></span><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-bold text-[#17191c]">{formatAction(a.action)}</div><div className="mt-0.5 truncate text-[9px] text-[#9aa3ad]">{a.entity_type||'plataforma'} · {dateTime(a.created_at)}</div></div></div>):<div className="rounded-xl bg-[#f8faf9] px-4 py-6 text-center text-xs text-[#8e99a4]">Todavía no hay actividad de auditoría registrada.</div>}</div></article>

        <article className="rounded-[24px] border border-[#e3e6e8] bg-white p-5 sm:p-6"><div className="flex items-center justify-between"><h2 className="text-base font-extrabold text-[#17191c]">Centro de operación</h2><Link href="/admin/tickets" className="text-[10px] font-bold text-[#0b5d3b]">Ver soporte</Link></div><div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-xl bg-[#e8f7fb] p-3 text-center"><div className="text-lg font-extrabold text-[#0e7490]">{d.open_tickets}</div><div className="text-[8px] font-bold uppercase tracking-wide text-[#0e7490]">Tickets</div></div><div className="rounded-xl bg-[#fff3dd] p-3 text-center"><div className="text-lg font-extrabold text-[#c47d12]">{d.pending_plan_requests}</div><div className="text-[8px] font-bold uppercase tracking-wide text-[#c47d12]">Solicitudes</div></div><div className="rounded-xl bg-[#fde8e5] p-3 text-center"><div className="text-lg font-extrabold text-[#b54129]">{d.urgent_tickets||0}</div><div className="text-[8px] font-bold uppercase tracking-wide text-[#b54129]">Prioridad</div></div></div><div className="mt-4 space-y-2">{[
          ['/admin/owners','Propietarios',`${d.users} cuentas comerciales`,UsersRound],['/admin/stores','Negocios',`${d.stores} tiendas en plataforma`,Store],['/admin/transactions','Transacciones','Revisa cobros y movimientos',WalletCards],['/admin/plans','Planes y suscripciones','Oferta comercial y solicitudes',BadgeDollarSign]
        ].map(([href,title,copy,I]:any)=><Link key={href} href={href} className="flex items-center gap-3 rounded-xl border border-[#edf0ef] p-3 transition hover:border-[#b9d6c9] hover:bg-[#f8fbf9]"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#eef8f3] text-[#0b5d3b]"><I className="h-3.5 w-3.5"/></span><div className="min-w-0 flex-1"><div className="text-[11px] font-bold text-[#17191c]">{title}</div><div className="text-[9px] text-[#8e99a4]">{copy}</div></div><ArrowUpRight className="h-4 w-4 text-[#9aa3ad]"/></Link>)}</div></article>
      </section>
    </div>
  </SuperAdminShell>
}
