'use client'
import {useEffect,useMemo,useState} from 'react'
import SuperAdminShell from '@/components/superadmin-shell'
import {api,dateTime,money} from '@/lib/api'
import {Loading,SearchBox} from '@/components/ui'
import {phoneDisplay} from '@/components/phone-input'
import {UsersRound,Store,ShoppingBag,ShieldCheck,MapPin} from 'lucide-react'

function cedulaDisplay(v:string){
 const d=(v||'').replace(/\D/g,'')
 if(d.length!==11)return v||'—'
 return `${d.slice(0,3)}-${d.slice(3,10)}-${d.slice(10)}`
}
function statusLabel(v:string){return v==='blocked'?'Bloqueado':v==='inactive'?'Inactivo':'Activo'}

export default function GlobalCustomers(){
 const[rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[search,setSearch]=useState('')
 useEffect(()=>{api<any[]>('/admin/global-customers').then(setRows).finally(()=>setLoading(false))},[])
 const filtered=useMemo(()=>{
  const q=search.trim().toLowerCase()
  if(!q)return rows
  return rows.filter(x=>`${x.full_name||x.name||''} ${x.phone||''} ${x.national_id||''}`.toLowerCase().includes(q))
 },[rows,search])
 return <SuperAdminShell title="Clientes globales" subtitle="Identidad compartida entre negocios">
  <section className="card p-5 sm:p-6"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-brand-600">Clientes globales</div><h2 className="mt-1 text-xl font-semibold">Identidad compartida entre negocios</h2><p className="mt-1 text-sm text-[#8d92aa]">Cada cliente se registra una sola vez con WhatsApp, Cédula y PIN. Su identidad permanece global mientras cada negocio conserva únicamente su propia relación comercial.</p></section>
  <div className="mt-5"><SearchBox value={search} onChange={setSearch} placeholder="Buscar por nombre, WhatsApp o Cédula..."/></div>
  <div className="mt-4">{loading?<Loading/>:<div className="table-wrap overflow-x-auto"><table className="table"><thead><tr><th>Cliente</th><th>WhatsApp</th><th>Cédula</th><th>Identidad</th><th>Estado</th><th>Negocios</th><th>Pedidos</th><th>Total comprado</th><th>Última actividad</th></tr></thead><tbody>{filtered.map(x=><tr key={x.id||x.phone}><td><div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"><UsersRound className="h-4 w-4"/></span><div><div className="font-semibold">{x.full_name||x.name}</div>{x.address_count>0&&<div className="mt-0.5 flex items-center gap-1 text-[11px] text-[#9aa0b2]"><MapPin className="h-3 w-3"/>{x.address_count} {x.address_count===1?'dirección':'direcciones'}</div>}</div></div></td><td><div className="font-medium">{phoneDisplay(x.phone)}</div>{x.whatsapp_verified&&<div className="mt-1 text-[11px] font-semibold text-emerald-600">WhatsApp verificado</div>}</td><td className="font-medium">{cedulaDisplay(x.national_id)}</td><td>{x.identity_verified?<span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5"/>Verificada</span>:<span className="text-xs text-[#9aa0b2]">Pendiente</span>}</td><td><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${x.status==='active'?'bg-emerald-50 text-emerald-700':x.status==='blocked'?'bg-rose-50 text-rose-700':'bg-slate-100 text-slate-600'}`}>{statusLabel(x.status)}</span></td><td><span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700"><Store className="h-3.5 w-3.5"/>{x.businesses}</span></td><td><span className="inline-flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-[#a0a5b8]"/>{x.orders}</span></td><td className="font-semibold">{money(x.total_spent)}</td><td className="text-[#8d92aa]">{x.last_order_at?dateTime(x.last_order_at):'—'}</td></tr>)}{filtered.length===0&&<tr><td colSpan={9} className="py-12 text-center text-sm text-[#9aa0b2]">No se encontraron clientes globales.</td></tr>}</tbody></table></div>}</div>
 </SuperAdminShell>
}
