'use client'
import {useEffect,useMemo,useState} from 'react'
import SuperAdminShell from '@/components/superadmin-shell'
import {api,dateTime} from '@/lib/api'
import {phoneDisplay} from '@/components/phone-input'
import {Alert,Loading,Modal,SearchBox,Status} from '@/components/ui'
import {ExternalLink,Trash2} from 'lucide-react'

export default function AdminStores(){
 const[rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[search,setSearch]=useState('')
 const[deleteTarget,setDeleteTarget]=useState<any>(null),[deleting,setDeleting]=useState(false),[err,setErr]=useState('')
 const load=()=>{setLoading(true);api<any[]>('/admin/stores').then(setRows).finally(()=>setLoading(false))}
 useEffect(load,[])
 const filtered=useMemo(()=>rows.filter(x=>(x.name+' '+x.slug+' '+x.owner+' '+x.owner_phone).toLowerCase().includes(search.toLowerCase())),[rows,search])
 const remove=async()=>{if(!deleteTarget)return;setDeleting(true);setErr('');try{await api(`/admin/stores/${deleteTarget.id}`,{method:'DELETE'});setRows(v=>v.filter(x=>x.id!==deleteTarget.id));setDeleteTarget(null)}catch(e:any){setErr(e.message)}finally{setDeleting(false)}}
 return <SuperAdminShell title="Tiendas SaaS" subtitle="Todas las tiendas creadas dentro de WAMERCIO">
  <div className="mb-5"><SearchBox value={search} onChange={setSearch} placeholder="Buscar tienda o propietario..."/></div>
  {loading?<Loading/>:<div className="table-wrap overflow-x-auto"><table className="table"><thead><tr><th>Tienda</th><th>Propietario</th><th>Productos</th><th>Pedidos</th><th>Estado</th><th>Creada</th><th></th></tr></thead><tbody>{filtered.map(s=><tr key={s.id}><td><div className="font-semibold">{s.name}</div><div className="text-xs text-[#a2a6b8]">/{s.slug}</div></td><td><div>{s.owner}</div><div className="text-xs text-[#a2a6b8]">{phoneDisplay(s.owner_phone)||'Sin WhatsApp'}</div></td><td>{s.products}</td><td>{s.orders}</td><td><Status value={s.is_active?'active':'inactive'}/></td><td className="text-[#8d92aa]">{dateTime(s.created_at)}</td><td><div className="flex justify-end gap-2"><a title="Abrir tienda" target="_blank" href={`/store/${s.slug}`} className="btn-secondary px-3"><ExternalLink className="h-4 w-4"/></a><button type="button" title="Eliminar tienda" className="btn-danger px-3" onClick={()=>{setErr('');setDeleteTarget(s)}}><Trash2 className="h-4 w-4"/></button></div></td></tr>)}</tbody></table></div>}
  <Modal open={!!deleteTarget} onClose={()=>!deleting&&setDeleteTarget(null)} title="Eliminar tienda" subtitle="Esta acción es permanente y no se puede deshacer.">
   {deleteTarget&&<div>{err&&<Alert text={err}/>}<div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm leading-6 text-rose-800">Vas a eliminar <strong>{deleteTarget.name}</strong>. También se eliminarán definitivamente sus productos, categorías, pedidos, clientes, conversaciones y demás datos asociados a esta tienda.</div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-[#edf0f4] bg-[#fbfcfd] p-4"><div className="text-xs text-[#9298ad]">Productos</div><div className="mt-1 text-xl font-semibold text-ink-900">{deleteTarget.products}</div></div><div className="rounded-2xl border border-[#edf0f4] bg-[#fbfcfd] p-4"><div className="text-xs text-[#9298ad]">Pedidos</div><div className="mt-1 text-xl font-semibold text-ink-900">{deleteTarget.orders}</div></div></div><div className="mt-6 flex justify-end gap-2"><button type="button" className="btn-secondary" disabled={deleting} onClick={()=>setDeleteTarget(null)}>Cancelar</button><button type="button" className="btn-danger" disabled={deleting} onClick={remove}><Trash2 className="h-4 w-4"/>{deleting?'Eliminando...':'Eliminar definitivamente'}</button></div></div>}
  </Modal>
 </SuperAdminShell>
}
