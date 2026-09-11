'use client'
import Link from 'next/link'
import {useEffect,useState} from 'react'
import StoreShell from '@/components/store-shell'
import {api,dateTime,money} from '@/lib/api'
import {Loading,Status} from '@/components/ui'
import {Store,Boxes,ShoppingBag,CircleDollarSign,ArrowUpRight,UsersRound,MessageCircleMore,ChevronRight} from 'lucide-react'

export default function Dashboard(){
 const[d,setD]=useState<any>(null)
 useEffect(()=>{api('/dashboard').then(setD).catch(()=>{})},[])
 const metrics=d?[
  ['Tiendas',d.metrics.stores,Store,'bg-violet-50 text-violet-600'],
  ['Productos',d.metrics.products,Boxes,'bg-sky-50 text-sky-600'],
  ['Pedidos',d.metrics.orders,ShoppingBag,'bg-brand-50 text-brand-600'],
  ['Clientes',d.metrics.customers||0,UsersRound,'bg-fuchsia-50 text-fuchsia-600'],
  ['Ventas',money(d.metrics.revenue),CircleDollarSign,'bg-emerald-50 text-emerald-600']
 ]:[]
 return <StoreShell title="Dashboard" subtitle="Resumen de tus tiendas y ventas">{!d?<Loading/>:<>
  <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">{metrics.map(([label,value,Icon,color]:any,i)=><div key={label} className={`card p-4 sm:p-5 ${i===4?'col-span-2 sm:col-span-1':''}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-semibold text-[#8d92aa] sm:text-sm">{label}</p><p className="mt-1.5 truncate text-xl font-semibold text-ink-900 sm:text-3xl">{value}</p></div><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-11 sm:w-11 sm:rounded-lg ${color}`}><Icon className="h-4 w-4 sm:h-5 sm:w-5"/></div></div></div>)}</section>
  <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_350px]">
   <div className="card overflow-hidden"><div className="flex items-center justify-between border-b border-[#f0f1f5] px-4 py-4 sm:px-5"><div><h2 className="font-bold text-ink-900">Pedidos recientes</h2><p className="text-xs text-[#8d92aa] sm:text-sm">Actividad más reciente de tus tiendas</p></div><Link href="/orders" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 sm:text-sm">Ver todos<ChevronRight className="h-4 w-4"/></Link></div>
    <div className="divide-y divide-slate-100 sm:hidden">{d.recent_orders.length?d.recent_orders.map((o:any)=><Link key={o.id} href="/orders" className="flex items-center gap-3 p-4 active:bg-[#fafbfe]"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600"><ShoppingBag className="h-4 w-4"/></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><strong className="truncate text-sm">#{o.number} · {o.customer}</strong><span className="shrink-0 text-sm font-semibold">{money(o.total)}</span></div><div className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-xs text-[#8d92aa]">{o.store} · {dateTime(o.created_at)}</span><Status value={o.status}/></div></div></Link>):<div className="p-8 text-center text-sm text-[#a2a6b8]">Aún no hay pedidos</div>}</div>
    <div className="hidden overflow-x-auto sm:block"><table className="table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Tienda</th><th>Total</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>{d.recent_orders.length?d.recent_orders.map((o:any)=><tr key={o.id}><td className="font-semibold">#{o.number}</td><td>{o.customer}</td><td>{o.store}</td><td className="font-semibold">{money(o.total)}</td><td><Status value={o.status}/></td><td className="text-[#8d92aa]">{dateTime(o.created_at)}</td></tr>):<tr><td colSpan={6} className="py-12 text-center text-[#a2a6b8]">Aún no hay pedidos</td></tr>}</tbody></table></div>
   </div>
   <div className="space-y-4"><div className="overflow-hidden rounded-lg bg-brand-500 p-5 text-white shadow-soft"><div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[.12em] text-white/75"><MessageCircleMore className="h-4 w-4"/>WhatsApp-first</div><h3 className="mt-3 text-xl font-semibold">Tu tienda vive donde están tus clientes.</h3><p className="mt-2 text-sm leading-6 text-white/75">Conecta WhatsApp, publica tu catálogo y recibe pedidos desde el mismo panel.</p><Link href="/settings/whatsapp" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-white">Conectar WhatsApp <ArrowUpRight className="h-4 w-4"/></Link></div><div className="card p-4"><p className="text-sm font-bold">Empieza en minutos</p><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">{['Crea tu tienda','Agrega productos','Configura delivery','Conecta WhatsApp'].map((x,i)=><div key={x} className="rounded bg-[#fafbfe] p-3"><span className="mb-2 grid h-6 w-6 place-items-center rounded-full bg-brand-100 font-semibold text-brand-700">{i+1}</span>{x}</div>)}</div></div></div>
  </section>
 </>}</StoreShell>
}
