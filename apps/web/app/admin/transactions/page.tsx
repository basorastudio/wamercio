'use client'
import {useEffect,useMemo,useState} from 'react'
import SuperAdminShell from '@/components/superadmin-shell'
import {Loading,PageEmpty,SearchBox,Status} from '@/components/ui'
import {api,dateTime,money} from '@/lib/api'
import type {Transaction} from '@/lib/types'
import {phoneDisplay} from '@/components/phone-input'
export default function AdminTransactions(){
 const [rows,setRows]=useState<Transaction[]>([]),[loading,setLoading]=useState(true),[q,setQ]=useState('')
 useEffect(()=>{api<Transaction[]>('/admin/transactions').then(setRows).finally(()=>setLoading(false))},[])
 const filtered=useMemo(()=>rows.filter(x=>`${x.user_name} ${x.user_phone} ${x.store_name} ${x.reference} ${x.description}`.toLowerCase().includes(q.toLowerCase())),[rows,q])
 return <SuperAdminShell title="Movimientos SaaS" subtitle="Registro comercial global de pagos manuales y reembolsos"><div className="card overflow-hidden"><div className="flex flex-col gap-3 border-b border-[#f0f1f5] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-ink-900">Movimientos registrados</h2><p className="text-sm text-[#8d92aa]">Vista global para auditoría del SuperAdmin.</p></div><SearchBox value={q} onChange={setQ}/></div>{loading?<Loading/>:filtered.length===0?<PageEmpty title="Sin movimientos" detail="Todavía no hay movimientos registrados."/>:<div className="overflow-x-auto"><table className="table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Tienda</th><th>Referencia</th><th>Estado</th><th className="text-right">Monto</th></tr></thead><tbody>{filtered.map(x=><tr key={x.id}><td className="whitespace-nowrap text-sm text-[#8d92aa]">{dateTime(x.created_at)}</td><td><strong className="block text-slate-800">{x.user_name}</strong><span className="text-xs text-[#8d92aa]">{phoneDisplay(x.user_phone)||'Sin WhatsApp'}</span></td><td>{x.store_name||'—'}</td><td><strong>{x.reference||'—'}</strong><div className="max-w-xs text-xs text-[#8d92aa]">{x.description}</div></td><td><Status value={x.status}/></td><td className={`text-right font-bold ${Number(x.amount)<0?'text-rose-600':'text-ink-900'}`}>{money(x.amount)}</td></tr>)}</tbody></table></div>}</div></SuperAdminShell>
}
