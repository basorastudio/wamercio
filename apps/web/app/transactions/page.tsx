'use client'
import { useEffect, useMemo, useState } from 'react'
import AdminShell,{StoreSelector} from '@/components/store-shell'
import {Loading,PageEmpty,SearchBox,Status} from '@/components/ui'
import {api,dateTime,money} from '@/lib/api'
import type {Transaction} from '@/lib/types'
import {ArrowDownLeft,ArrowUpRight,ReceiptText} from 'lucide-react'

export default function TransactionsPage(){
 const [store,setStore]=useState(''),[rows,setRows]=useState<Transaction[]>([]),[loading,setLoading]=useState(true),[q,setQ]=useState('')
 const load=()=>{setLoading(true);api<Transaction[]>(`/transactions${store?`?store_id=${store}`:''}`).then(setRows).finally(()=>setLoading(false))}
 useEffect(()=>{load()},[store])
 const filtered=useMemo(()=>rows.filter(x=>`${x.reference} ${x.store_name} ${x.description} ${x.status}`.toLowerCase().includes(q.toLowerCase())),[rows,q])
 const paid=rows.filter(x=>x.status==='paid').reduce((a,x)=>a+Number(x.amount),0)
 const refunded=rows.filter(x=>x.status==='refunded').reduce((a,x)=>a+Math.abs(Number(x.amount)),0)
 return <AdminShell title="Movimientos" subtitle="Historial de cobros y reembolsos registrados en WAMERCIO" actions={<StoreSelector value={store} onChange={setStore}/>}> 
  <div className="mb-5 grid gap-4 md:grid-cols-3">
   <div className="card p-5"><p className="text-sm text-[#8d92aa]">Cobrado</p><div className="mt-2 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><ArrowDownLeft className="h-5 w-5"/></span><strong className="text-2xl text-ink-900">{money(paid)}</strong></div></div>
   <div className="card p-5"><p className="text-sm text-[#8d92aa]">Reembolsado</p><div className="mt-2 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-600"><ArrowUpRight className="h-5 w-5"/></span><strong className="text-2xl text-ink-900">{money(refunded)}</strong></div></div>
   <div className="card p-5"><p className="text-sm text-[#8d92aa]">Movimientos</p><div className="mt-2 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><ReceiptText className="h-5 w-5"/></span><strong className="text-2xl text-ink-900">{rows.length}</strong></div></div>
  </div>
  <div className="card overflow-hidden"><div className="flex flex-col gap-3 border-b border-[#f0f1f5] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-ink-900">Historial</h2><p className="text-sm text-[#8d92aa]">Los pagos se registran al cambiar un pedido a Pagado o Reembolsado.</p></div><SearchBox value={q} onChange={setQ} placeholder="Buscar referencia..."/></div>
   {loading?<Loading/>:filtered.length===0?<PageEmpty title="Sin movimientos" detail="Los cobros y reembolsos aparecerán aquí automáticamente."/>:<div className="overflow-x-auto"><table className="table"><thead><tr><th>Fecha</th><th>Referencia</th><th>Tienda</th><th>Descripción</th><th>Estado</th><th className="text-right">Monto</th></tr></thead><tbody>{filtered.map(x=><tr key={x.id}><td className="whitespace-nowrap text-sm text-[#8d92aa]">{dateTime(x.created_at)}</td><td className="font-semibold text-slate-800">{x.reference||'—'}</td><td>{x.store_name||'—'}</td><td className="max-w-xs text-sm text-[#8d92aa]">{x.description||'Movimiento'}</td><td><Status value={x.status}/></td><td className={`text-right font-bold ${Number(x.amount)<0?'text-rose-600':'text-ink-900'}`}>{money(x.amount)}</td></tr>)}</tbody></table></div>}
  </div>
 </AdminShell>
}
