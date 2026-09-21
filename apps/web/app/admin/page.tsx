'use client'

import {useCallback,useEffect,useMemo,useState} from 'react'
import Link from 'next/link'
import SuperAdminShell from '@/components/superadmin-shell'
import {api,dateTime,money} from '@/lib/api'
import {Alert,Loading} from '@/components/ui'
import {
  ArrowUpRight,BadgeDollarSign,CheckCircle2,Clock3,LifeBuoy,RefreshCw,
  ShoppingBag,Store,TrendingUp,UsersRound,WalletCards
} from 'lucide-react'

type TrendPoint={month:string;label:string;orders:number;revenue:number;merchants:number;stores:number}
type Activity={action:string;entity_type:string;entity_id:string;created_at:string}
type DashboardData={
  users:number;stores:number;products:number;orders:number;revenue:number;
  pending_plan_requests:number;open_tickets:number;urgent_tickets?:number;period_months?:number;
  trend?:TrendPoint[];order_health?:{paid:number;unpaid:number;canceled:number};recent_activity?:Activity[]
}

const monthEs:Record<string,string>={Jan:'Ene',Feb:'Feb',Mar:'Mar',Apr:'Abr',May:'May',Jun:'Jun',Jul:'Jul',Aug:'Ago',Sep:'Sep',Oct:'Oct',Nov:'Nov',Dec:'Dic'}
const labelMonth=(v:string)=>monthEs[v]||v

function curve(values:number[],width=720,height=230,padX=28,padY=24){
  const max=Math.max(1,...values),usableW=width-padX*2,usableH=height-padY*2
  return values.map((v,i)=>({x:padX+(values.length===1?usableW/2:(i/(values.length-1))*usableW),y:height-padY-(v/max)*usableH}))
}

function RevenueChart({trend}:{trend:TrendPoint[]}){
  const[hover,setHover]=useState<number|null>(null)
  const values=trend.map(x=>Number(x.revenue||0)),points=curve(values)
  const line=points.map((p,i)=>`${i?'L':'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const area=points.length?`M ${points[0].x} 206 ${points.map(p=>`L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')} L ${points[points.length-1].x} 206 Z`:''
  const active=hover===null?null:trend[hover]
  const activePoint=hover===null?null:points[hover]
  return <div className="relative mt-4 overflow-x-auto">
    <div className="min-w-[560px]"><svg viewBox="0 0 720 250" className="h-[250px] w-full overflow-visible" role="img" aria-label="Tendencia de ventas">
      <defs><linearGradient id="revenueArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#0b5d3b" stopOpacity=".18"/><stop offset="100%" stopColor="#0b5d3b" stopOpacity="0"/></linearGradient></defs>
      {[42,83,124,165,206].map(y=><line key={y} x1="28" y1={y} x2="692" y2={y} stroke="#eee8df" strokeDasharray="3 5"/>)}
      {area&&<path d={area} fill="url(#revenueArea)"/>}
      {line&&<path d={line} fill="none" stroke="#0b5d3b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>}
      {points.map((p,i)=><g key={i} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)} className="cursor-pointer"><circle cx={p.x} cy={p.y} r={hover===i?6:4} fill="#fff" stroke="#0b5d3b" strokeWidth="3"/><circle cx={p.x} cy={p.y} r="16" fill="transparent"/><text x={p.x} y="238" textAnchor="middle" fontSize="11" fill="#7f8a84">{labelMonth(trend[i]?.label||'')}</text></g>)}
    </svg></div>
    {active&&activePoint&&<div className="admin-chart-tooltip hidden sm:block" style={{left:`${Math.min(82,Math.max(4,(activePoint.x/720)*100))}%`,top:`${Math.max(6,(activePoint.y/250)*100-4)}%`,transform:'translate(-50%,-100%)'}}><div className="font-bold text-[#0a3f2a]">{labelMonth(active.label)} {active.month?.slice(0,4)}</div><div className="mt-1">Ventas: <strong>{money(active.revenue)}</strong></div><div>Pedidos: <strong>{active.orders}</strong></div></div>}
  </div>
}

function GrowthLine({trend}:{trend:TrendPoint[]}){
  const values=trend.map(x=>Number(x.merchants||0)),points=curve(values,560,170,20,20)
  const line=points.map((p,i)=>`${i?'L':'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  return <div className="overflow-x-auto"><svg viewBox="0 0 560 190" className="mt-3 h-[190px] min-w-[480px] w-full"><line x1="20" y1="150" x2="540" y2="150" stroke="#eee8df"/>{line&&<path d={line} fill="none" stroke="#0b5d3b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>}{points.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r="3" fill="#0b5d3b"/><text x={p.x} y="176" textAnchor="middle" fontSize="10" fill="#7f8a84">{labelMonth(trend[i]?.label||'')}</text><title>{`${trend[i]?.merchants||0} propietarios`}</title></g>)}</svg></div>
}

function OrderBars({trend}:{trend:TrendPoint[]}){
  const max=Math.max(1,...trend.map(x=>Number(x.orders||0)))
  return <div className="overflow-x-auto"><div className="mt-5 flex h-[185px] min-w-[480px] items-end gap-3 border-b border-[#eee8df] px-2 pb-7">{trend.map((x,i)=><div key={x.month||i} className="relative flex h-full flex-1 items-end justify-center"><div title={`${x.orders} pedidos`} className="w-full max-w-9 rounded-t-md bg-[#3dbe6b] transition hover:bg-[#0e8347]" style={{height:`${Math.max(4,(Number(x.orders||0)/max)*100)}%`}}/><span className="absolute -bottom-6 text-[10px] text-[#7f8a84]">{labelMonth(x.label)}</span></div>)}</div></div>
}

function formatAction(action:string){
  const clean=String(action||'actividad').replaceAll('.',' · ').replaceAll('_',' ')
  return clean.charAt(0).toUpperCase()+clean.slice(1)
}

export default function AdminDashboard(){
  const[d,setD]=useState<DashboardData|null>(null)
  const[months,setMonths]=useState(6)
  const[busy,setBusy]=useState(false)
  const[err,setErr]=useState('')
  const load=useCallback(async(m=months)=>{
    setBusy(true);setErr('')
    try{setD(await api<DashboardData>(`/admin/dashboard?months=${m}`))}catch(e:any){setErr(e.message||'No se pudo cargar el dashboard')}finally{setBusy(false)}
  },[months])
  useEffect(()=>{void load(months)},[months])
  const trend=useMemo<TrendPoint[]>(()=>d?.trend?.length?d.trend:Array.from({length:months},(_,i)=>({month:String(i),label:'—',orders:0,revenue:0,merchants:0,stores:0})),[d,months])

  const actions=<div className="flex items-center gap-2"><select className="field h-10 w-auto min-w-[150px] py-1.5 text-xs" value={months} onChange={e=>setMonths(Number(e.target.value))} aria-label="Periodo de gráficos"><option value={3}>Últimos 3 meses</option><option value={6}>Últimos 6 meses</option><option value={12}>Últimos 12 meses</option></select><button type="button" className="btn-secondary px-3" disabled={busy} onClick={()=>void load(months)} title="Actualizar datos"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`}/><span className="hidden sm:inline">Actualizar</span></button></div>
  if(!d)return <SuperAdminShell title="Dashboard" subtitle="Ventas, comercios, pedidos y actividad operativa desde una sola vista." actions={actions}>{err?<Alert text={err}/>:<Loading/>}</SuperAdminShell>

  const health=d.order_health||{paid:0,unpaid:0,canceled:0}
  const healthTotal=Math.max(1,health.paid+health.unpaid+health.canceled)
  const paidPct=Math.round((health.paid/healthTotal)*100),unpaidPct=Math.round((health.unpaid/healthTotal)*100),canceledPct=Math.round((health.canceled/healthTotal)*100)
  const kpis=[
    {href:'/admin/transactions',label:'Ventas registradas',value:money(d.revenue),note:`${d.orders} pedidos`,icon:TrendingUp,badge:'Ingresos'},
    {href:'/admin/stores',label:'Negocios activos',value:d.stores.toLocaleString('es-DO'),note:`${d.products} productos`,icon:Store,badge:'Comercios'},
    {href:'/admin/owners',label:'Propietarios',value:d.users.toLocaleString('es-DO'),note:'Cuentas comerciales',icon:UsersRound,badge:'Usuarios'},
    {href:'/admin/tickets',label:'Soporte abierto',value:d.open_tickets.toLocaleString('es-DO'),note:`${d.urgent_tickets||0} prioritarios`,icon:LifeBuoy,badge:'Atención'},
  ]

  return <SuperAdminShell title="Dashboard" subtitle="Ventas, comercios, pedidos y actividad operativa desde una sola vista." actions={actions}>
    {err&&<Alert text={err}/>}<div className={`space-y-5 transition-opacity ${busy?'opacity-60':'opacity-100'}`}>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{kpis.map(({href,label,value,note,icon:I,badge})=><Link key={label} href={href} className="admin-kpi group"><div className="flex items-start justify-between gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e3f6ea] text-[#0b5d3b]"><I className="h-5 w-5"/></span><span className="rounded-full bg-[#f3eee5] px-2.5 py-1 text-[9px] font-bold text-[#718078]">{badge}</span></div><div className="mt-4 text-[10px] font-extrabold uppercase tracking-[.12em] text-[#7f8a84]">{label}</div><div className="mt-1 text-2xl font-extrabold tracking-[-.025em] text-[#0a3f2a]">{value}</div><div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold text-[#718078]"><span>{note}</span><ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100"/></div></Link>)}</section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="admin-form-card xl:col-span-2"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="admin-form-title">Resumen de ventas</h2><p className="admin-form-hint">Ingresos registrados durante los últimos {months} meses.</p></div><div className="flex items-center gap-2 text-[10px] font-semibold text-[#718078]"><span className="h-2 w-2 rounded-full bg-[#0b5d3b]"/>Ventas</div></div><RevenueChart trend={trend}/></article>
        <article className="admin-form-card"><div className="flex items-center justify-between"><h2 className="admin-form-title">Salud de pedidos</h2><span className="rounded-full bg-[#e3f6ea] px-2.5 py-1 text-[9px] font-extrabold text-[#0b5d3b]">En vivo</span></div><div className="mt-5 text-center"><div className="text-4xl font-extrabold tracking-[-.04em] text-[#0a3f2a]">{paidPct}%</div><div className="mt-1 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#7f8a84]">Pagados</div></div><div className="mt-5 grid grid-cols-2 gap-2">{[
          ['Pagados',health.paid,`${paidPct}%`,'text-[#0b5d3b]'],['Pendientes',health.unpaid,`${unpaidPct}%`,'text-[#d9932b]'],['Cancelados',health.canceled,`${canceledPct}%`,'text-[#b54129]'],['Productos',d.products,'Catálogo','text-[#367184]']
        ].map(([label,value,meta,tone]:any)=><div key={label} className="rounded-xl border border-[#eee8df] p-3"><div className="text-[9px] font-extrabold uppercase tracking-[.12em] text-[#7f8a84]">{label}</div><div className="mt-1 flex items-end justify-between gap-2"><span className="text-base font-extrabold text-[#0a3f2a]">{value}</span><span className={`text-[9px] font-bold ${tone}`}>{meta}</span></div></div>)}</div><div className="mt-5 border-t border-[#eee8df] pt-4"><div className="mb-2 flex justify-between text-[9px] font-bold text-[#718078]"><span>Composición</span><span>{healthTotal} pedidos</span></div><div className="flex h-2 overflow-hidden rounded-full bg-[#f3eee5]"><span className="bg-[#22a455]" style={{width:`${paidPct}%`}}/><span className="bg-[#d9932b]" style={{width:`${unpaidPct}%`}}/><span className="bg-[#b54129]" style={{width:`${canceledPct}%`}}/></div></div></article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="admin-form-card"><div className="flex items-center justify-between"><div><h2 className="admin-form-title">Crecimiento de comerciantes</h2><p className="admin-form-hint">Nuevos propietarios registrados por mes.</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e3f6ea] text-[#0b5d3b]"><UsersRound className="h-4 w-4"/></span></div><GrowthLine trend={trend}/></article>
        <article className="admin-form-card"><div className="flex items-center justify-between"><div><h2 className="admin-form-title">Crecimiento de pedidos</h2><p className="admin-form-hint">Volumen mensual de pedidos creados.</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e3f6ea] text-[#0b5d3b]"><ShoppingBag className="h-4 w-4"/></span></div><OrderBars trend={trend}/></article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="admin-form-card"><div className="flex items-center justify-between"><h2 className="admin-form-title">Actividad reciente</h2><Link href="/admin/settings" className="text-[10px] font-bold text-[#0b5d3b] hover:underline">Ver auditoría</Link></div><div className="mt-4 space-y-2">{d.recent_activity?.length?d.recent_activity.map((a,i)=><div key={`${a.created_at}-${i}`} className="flex items-center gap-3 rounded-xl border border-[#eee8df] p-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#e3f6ea] text-[#0b5d3b]"><Clock3 className="h-3.5 w-3.5"/></span><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-bold text-[#0a3f2a]">{formatAction(a.action)}</div><div className="mt-0.5 truncate text-[9px] text-[#7f8a84]">{a.entity_type||'plataforma'} · {dateTime(a.created_at)}</div></div></div>):<div className="rounded-xl bg-[#f8f4ed] px-4 py-6 text-center text-xs text-[#7f8a84]">Todavía no hay actividad de auditoría registrada.</div>}</div></article>
        <article className="admin-form-card"><div className="flex items-center justify-between"><h2 className="admin-form-title">Centro de operación</h2><Link href="/admin/tickets" className="text-[10px] font-bold text-[#0b5d3b] hover:underline">Ver soporte</Link></div><div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-xl bg-[#eaf5f2] p-3 text-center"><div className="text-lg font-extrabold text-[#0b5d3b]">{d.open_tickets}</div><div className="text-[8px] font-bold uppercase tracking-wide text-[#0b5d3b]">Tickets</div></div><div className="rounded-xl bg-[#fff3dd] p-3 text-center"><div className="text-lg font-extrabold text-[#c47d12]">{d.pending_plan_requests}</div><div className="text-[8px] font-bold uppercase tracking-wide text-[#c47d12]">Solicitudes</div></div><div className="rounded-xl bg-[#fde8e5] p-3 text-center"><div className="text-lg font-extrabold text-[#b54129]">{d.urgent_tickets||0}</div><div className="text-[8px] font-bold uppercase tracking-wide text-[#b54129]">Prioridad</div></div></div><div className="mt-4 space-y-2">{[
          ['/admin/owners','Propietarios',`${d.users} cuentas comerciales`,UsersRound],['/admin/stores','Negocios',`${d.stores} tiendas en plataforma`,Store],['/admin/transactions','Transacciones','Revisa cobros y movimientos',WalletCards],['/admin/plans','Planes y suscripciones','Oferta comercial y solicitudes',BadgeDollarSign]
        ].map(([href,title,copy,I]:any)=><Link key={href} href={href} className="flex items-center gap-3 rounded-xl border border-[#eee8df] p-3 transition hover:border-[#cdbfad] hover:bg-[#fcfaf6]"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e3f6ea] text-[#0b5d3b]"><I className="h-3.5 w-3.5"/></span><div className="min-w-0 flex-1"><div className="text-[11px] font-bold text-[#0a3f2a]">{title}</div><div className="text-[9px] text-[#718078]">{copy}</div></div><ArrowUpRight className="h-4 w-4 text-[#7f8a84]"/></Link>)}</div></article>
      </section>
    </div>
  </SuperAdminShell>
}
