'use client'

import {useEffect,useMemo,useState} from 'react'
import CustomerShell from '@/components/customer-shell'
import {api,dateTime,money} from '@/lib/api'
import {MapPin,Package,ReceiptText,WalletCards,X} from 'lucide-react'

const labels:any={pending:'Pendiente',confirmed:'Confirmado',processing:'Preparando',preparing:'Preparando',ready:'Listo',out_for_delivery:'En camino',delivered:'Entregado',completed:'Completado',canceled:'Cancelado',cancelled:'Cancelado'}
const paymentLabels:any={cash:'Efectivo',cash_on_delivery:'Tarjeta en terminal',bank_transfer:'Transferencia electrónica'}
const deliveryLabels:any={delivery:'Delivery',pickup:'Recoger'}

function extrasText(value:any){
 let parsed=value
 if(!parsed)return ''
 if(typeof parsed==='string'){
  try{parsed=JSON.parse(parsed)}catch{return parsed}
 }
 if(!Array.isArray(parsed))return ''
 return parsed.map((x:any)=>typeof x==='string'?x:x?.name).filter(Boolean).join(', ')
}

export default function CustomerOrdersPage(){
 const[orders,setOrders]=useState<any[]>([])
 const[filter,setFilter]=useState('all')
 const[loading,setLoading]=useState(true)
 const[detailId,setDetailId]=useState<string|null>(null)
 const[detail,setDetail]=useState<any|null>(null)
 const[detailLoading,setDetailLoading]=useState(false)
 const[detailError,setDetailError]=useState('')

 useEffect(()=>{api<any[]>('/customer/orders').then(setOrders).finally(()=>setLoading(false))},[])
 useEffect(()=>{
  if(!detailId)return
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setDetailId(null)}
  document.addEventListener('keydown',onKey)
  const previous=document.body.style.overflow
  document.body.style.overflow='hidden'
  return()=>{document.removeEventListener('keydown',onKey);document.body.style.overflow=previous}
 },[detailId])

 const rows=useMemo(()=>filter==='all'?orders:orders.filter(o=>o.status===filter),[orders,filter])
 const completed=orders.filter(o=>['delivered','completed'].includes(o.status)).length
 const active=orders.filter(o=>!['delivered','completed','canceled','cancelled'].includes(o.status)).length
 const canceled=orders.filter(o=>['canceled','cancelled'].includes(o.status)).length

 const openDetail=async(id:string)=>{
  setDetailId(id)
  setDetail(null)
  setDetailError('')
  setDetailLoading(true)
  try{setDetail(await api<any>(`/customer/orders/${id}`))}
  catch(e:any){setDetailError(e?.message||'No se pudo cargar el detalle del pedido')}
  finally{setDetailLoading(false)}
 }
 const closeDetail=()=>{setDetailId(null);setDetail(null);setDetailError('')}
 const rowForDetail=orders.find(o=>o.id===detailId)

 return <CustomerShell active="orders">
  <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
   <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-600">Compras</p><h1 className="mt-1 text-2xl font-semibold">Mis pedidos</h1><p className="mt-1 text-sm text-slate-400">Todos tus pedidos de WAMERCIO en un solo lugar.</p></div>
    <div className="flex flex-wrap gap-2">{[['all','Todos'],['pending','Pendiente'],['preparing','Preparando'],['ready','Listo'],['out_for_delivery','En camino'],['delivered','Entregado'],['canceled','Cancelado']].map(([k,l])=><button key={k} onClick={()=>setFilter(k)} className={`rounded-full px-3 py-2 text-xs font-semibold ${filter===k?'bg-emerald-500 text-white':'border border-slate-200 bg-white text-slate-500'}`}>{l}</button>)}</div>
   </div>
  </section>

  <div className="mt-4 grid gap-3 sm:grid-cols-3">
   <div className="card p-4 text-center"><strong className="text-xl">{orders.length}</strong><div className="text-xs text-slate-400">Total pedidos</div></div>
   <div className="card p-4 text-center"><strong className="text-xl text-emerald-600">{completed}</strong><div className="text-xs text-slate-400">Completados</div></div>
   <div className="card p-4 text-center"><strong className="text-xl text-violet-600">{active}</strong><div className="text-xs text-slate-400">En proceso · {canceled} cancelados</div></div>
  </div>

  <div className="mt-4 space-y-3">
   {loading?<div className="card p-10 text-center text-slate-400">Cargando pedidos...</div>:rows.length===0?<div className="card grid min-h-52 place-items-center p-8 text-center"><div><Package className="mx-auto h-10 w-10 text-slate-200"/><h3 className="mt-3 font-semibold">No hay pedidos en esta vista</h3></div></div>:rows.map(o=><article key={o.id} className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600"><Package className="h-4 w-4"/></div>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong>#{o.number}</strong><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase text-emerald-700">{labels[o.status]||o.status}</span></div><div className="mt-1 text-sm text-slate-500">{o.store_name} · {o.item_count} producto(s)</div><div className="mt-1 text-xs text-slate-400">{dateTime(o.created_at)}</div></div>
    <div className="flex items-center justify-between gap-3 sm:justify-end"><strong className="text-emerald-600">{money(o.total)}</strong><button type="button" onClick={()=>openDetail(o.id)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50">Ver detalles</button></div>
   </article>)}
  </div>

  {detailId&&<div data-testid="customer-order-detail-modal" className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-5" onMouseDown={e=>{if(e.target===e.currentTarget)closeDetail()}}>
   <div className="max-h-[92vh] w-full overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl">
    <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
     <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><ReceiptText className="h-5 w-5"/></div>
     <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-600">Detalle del pedido</p><div className="mt-1 flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">Pedido #{detail?.number||rowForDetail?.number||''}</h2>{(detail?.status||rowForDetail?.status)&&<span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase text-emerald-700">{labels[detail?.status||rowForDetail?.status]||detail?.status||rowForDetail?.status}</span>}</div><p className="mt-1 text-xs text-slate-400">{detail?.store_name||rowForDetail?.store_name||''}{(detail?.created_at||rowForDetail?.created_at)?` · ${dateTime(detail?.created_at||rowForDetail?.created_at)}`:''}</p></div>
     <button type="button" aria-label="Cerrar" onClick={closeDetail} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500"><X className="h-4 w-4"/></button>
    </div>

    <div className="max-h-[calc(92vh-78px)] overflow-y-auto p-5 sm:p-6">
     {detailLoading?<div className="grid min-h-56 place-items-center text-sm text-slate-400">Cargando detalle...</div>:detailError?<div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{detailError}</div>:detail&&<div className="space-y-4">
      <section className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
       <div className="mb-3 flex items-center gap-2"><Package className="h-4 w-4 text-emerald-600"/><h3 className="font-semibold">Productos</h3></div>
       <div className="divide-y divide-slate-100">{(detail.items||[]).map((item:any,index:number)=>{const extras=extrasText(item.extras);return <div key={`${item.name}-${index}`} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0 flex-1"><div className="font-medium">{item.name}</div>{item.variant_name&&<div className="mt-0.5 text-xs text-slate-500">{item.variant_name}</div>}{extras&&<div className="mt-0.5 text-xs text-slate-400">{extras}</div>}<div className="mt-1 text-xs text-slate-400">{item.quantity} × {money(item.unit_price)}</div></div><strong className="shrink-0 text-sm">{money(item.line_total)}</strong></div>})}</div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
       <section className="rounded-2xl border border-slate-100 p-4"><div className="flex items-center gap-2 text-emerald-600"><MapPin className="h-4 w-4"/><span className="text-[10px] font-bold uppercase tracking-wider">Entrega</span></div><div className="mt-2 font-semibold">{deliveryLabels[detail.delivery_type]||detail.delivery_type}</div>{detail.delivery_address&&<p className="mt-1 text-xs leading-5 text-slate-500">{detail.delivery_address}</p>}</section>
       <section className="rounded-2xl border border-slate-100 p-4"><div className="flex items-center gap-2 text-emerald-600"><WalletCards className="h-4 w-4"/><span className="text-[10px] font-bold uppercase tracking-wider">Pago</span></div><div className="mt-2 font-semibold">{paymentLabels[detail.payment_method]||detail.payment_method}</div>{detail.payment_method==='cash'&&<p className="mt-1 text-xs text-slate-500">{detail.cash_change_requested?`Paga con ${money(detail.cash_tendered||0)} · cambio estimado ${money(Math.max(0,Number(detail.cash_tendered||0)-Number(detail.total||0)))}`:'Pago exacto'}</p>}</section>
      </div>

      {detail.notes&&<section className="rounded-2xl border border-slate-100 p-4"><div className="flex items-center gap-2 text-emerald-600"><ReceiptText className="h-4 w-4"/><span className="text-[10px] font-bold uppercase tracking-wider">Indicaciones</span></div><p className="mt-2 text-sm leading-6 text-slate-600">{detail.notes}</p></section>}

      <section className="rounded-2xl bg-slate-50 p-4"><div className="space-y-2 text-sm"><div className="flex justify-between gap-4 text-slate-500"><span>Subtotal</span><span>{money(detail.subtotal)}</span></div>{Number(detail.discount||0)>0&&<div className="flex justify-between gap-4 text-slate-500"><span>Descuento</span><span>- {money(detail.discount)}</span></div>}{Number(detail.shipping||0)>0&&<div className="flex justify-between gap-4 text-slate-500"><span>Delivery</span><span>{money(detail.shipping)}</span></div>}<div className="flex justify-between gap-4 border-t border-slate-200 pt-3 text-base"><strong>Total</strong><strong className="text-emerald-600">{money(detail.total)}</strong></div></div></section>
     </div>}
    </div>
   </div>
  </div>}
 </CustomerShell>
}
