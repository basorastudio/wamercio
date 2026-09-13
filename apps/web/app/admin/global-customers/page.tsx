'use client'
import {useEffect,useMemo,useState} from 'react'
import SuperAdminShell from '@/components/superadmin-shell'
import {api,dateTime,money} from '@/lib/api'
import {Loading,SearchBox} from '@/components/ui'
import {phoneDisplay} from '@/components/phone-input'
import {UsersRound,Store,ShoppingBag} from 'lucide-react'
export default function GlobalCustomers(){
 const[rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[search,setSearch]=useState('')
 useEffect(()=>{api<any[]>('/admin/global-customers').then(setRows).finally(()=>setLoading(false))},[])
 const filtered=useMemo(()=>rows.filter(x=>(x.name+' '+x.phone).toLowerCase().includes(search.toLowerCase())),[rows,search])
 return <SuperAdminShell title="Clientes globales" subtitle="Identidad compartida entre negocios">
  <section className="card p-5 sm:p-6"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-brand-600">Clientes globales</div><h2 className="mt-1 text-xl font-semibold">Identidad compartida entre negocios</h2><p className="mt-1 text-sm text-[#8d92aa]">El cliente se registra una sola vez por su WhatsApp y puede relacionarse con varios negocios sin perder su historial comercial.</p></section>
  <div className="mt-5"><SearchBox value={search} onChange={setSearch} placeholder="Buscar por nombre o WhatsApp..."/></div>
  <div className="mt-4">{loading?<Loading/>:<div className="table-wrap overflow-x-auto"><table className="table"><thead><tr><th>Cliente</th><th>WhatsApp</th><th>Negocios vinculados</th><th>Pedidos</th><th>Total comprado</th><th>Última actividad</th></tr></thead><tbody>{filtered.map(x=><tr key={x.phone}><td><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-brand-700"><UsersRound className="h-4 w-4"/></span><span className="font-semibold">{x.name}</span></div></td><td>{phoneDisplay(x.phone)}</td><td><span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700"><Store className="h-3.5 w-3.5"/>{x.businesses}</span></td><td><span className="inline-flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-[#a0a5b8]"/>{x.orders}</span></td><td className="font-semibold">{money(x.total_spent)}</td><td className="text-[#8d92aa]">{x.last_order_at?dateTime(x.last_order_at):'—'}</td></tr>)}</tbody></table></div>}</div>
 </SuperAdminShell>
}
