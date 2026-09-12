'use client'
import {useEffect,useMemo,useState} from 'react'
import AdminShell,{StoreSelector} from '@/components/store-shell'
import {api,dateTime,money} from '@/lib/api'
import {Loading,Modal,PageEmpty,SearchBox,Status,Alert} from '@/components/ui'
import type {Customer} from '@/lib/types'
import {phoneDisplay} from '@/components/phone-input'
import {Eye,MapPin,ShoppingBag,WalletCards,Pencil,MessageCircleMore,ArrowLeft} from 'lucide-react'

type ModalView='detail'|'edit'|null

export default function Customers(){
 const[store,setStore]=useState(''),[rows,setRows]=useState<Customer[]>([]),[loading,setLoading]=useState(false),[search,setSearch]=useState(''),[detail,setDetail]=useState<any>(null),[edit,setEdit]=useState<any>(null),[err,setErr]=useState(''),[view,setView]=useState<ModalView>(null)
 const load=()=>{if(!store){setRows([]);return};setLoading(true);api<Customer[]>(`/customers?store_id=${store}`).then(setRows).finally(()=>setLoading(false))}
 useEffect(load,[store])
 const filtered=useMemo(()=>rows.filter(x=>(x.name+' '+x.phone).toLowerCase().includes(search.toLowerCase())),[rows,search])
 const open=async(id:string)=>{const data=await api(`/customers/${id}`);setDetail(data);setEdit(null);setErr('');setView('detail')}
 const startEdit=(c:any)=>{setEdit({id:c.id,name:c.name,address:c.address||'',notes:c.notes||'',status:c.status||'active'});setErr('');setView('edit')}
 const closeModal=()=>{setView(null);setDetail(null);setEdit(null);setErr('')}
 const backToDetail=async()=>{if(edit?.id){try{setDetail(await api(`/customers/${edit.id}`))}catch{}}setView('detail');setErr('')}
 const save=async(e:React.FormEvent)=>{e.preventDefault();setErr('');try{await api(`/customers/${edit.id}`,{method:'PUT',body:JSON.stringify(edit)});load();const updated=await api(`/customers/${edit.id}`);setDetail(updated);setEdit({id:updated.id,name:updated.name,address:updated.address||'',notes:updated.notes||'',status:updated.status||'active'});setView('detail')}catch(e:any){setErr(e.message)}}
 const modalTitle=view==='edit'?'Editar cliente':detail?.name||'Cliente'

 return <AdminShell title="Clientes" subtitle="CRM comercial creado automáticamente desde pedidos y WhatsApp" context={<StoreSelector value={store} onChange={setStore}/>}>
  <div className="mb-5"><SearchBox value={search} onChange={setSearch} placeholder="Buscar por nombre o WhatsApp..."/></div>
  {!store?<PageEmpty title="Selecciona una tienda" detail="Los clientes pertenecen a cada tienda y se consolidan por número de WhatsApp."/>:loading?<Loading/>:filtered.length===0?<PageEmpty title="Aún no hay clientes" detail="Los clientes aparecerán automáticamente cuando realicen su primer pedido."/>:<div className="table-wrap overflow-x-auto"><table className="table"><thead><tr><th>Cliente</th><th>Pedidos</th><th>Total comprado</th><th>Último pedido</th><th>Estado</th><th></th></tr></thead><tbody>{filtered.map(c=><tr key={c.id}><td><div className="min-w-[220px]"><div className="font-semibold text-ink-900">{c.name}</div><div className="mt-0.5 text-xs text-[#a2a6b8]">{phoneDisplay(c.phone)}</div></div></td><td className="font-semibold">{c.order_count}</td><td className="font-semibold">{money(c.total_spent)}</td><td className="text-[#8d92aa]">{c.last_order_at?dateTime(c.last_order_at):'—'}</td><td><Status value={c.status}/></td><td><div className="flex justify-end gap-2"><button onClick={()=>open(c.id)} className="btn-secondary px-3"><Eye className="h-4 w-4"/></button><button onClick={()=>startEdit(c)} className="btn-secondary px-3"><Pencil className="h-4 w-4"/></button></div></td></tr>)}</tbody></table></div>}

  <Modal open={!!view} onClose={closeModal} title={modalTitle} subtitle={view==='edit'?'Edita la ficha sin salir del flujo actual.':'Ficha comercial consolidada automáticamente.'} wide>
   <div key={view||'closed'} className="transition-all duration-200 ease-out">
    {view==='detail'&&detail&&<div>
      <div className="grid gap-4 sm:grid-cols-3"><div className="rounded-2xl bg-[#fafbfe] p-4"><MessageCircleMore className="h-4 w-4 text-brand-600"/><p className="mt-2 text-sm font-semibold">{phoneDisplay(detail.phone)}</p><p className="mt-1 text-xs text-[#8d92aa]">Cliente vinculado por WhatsApp</p></div><div className="rounded-2xl bg-[#fafbfe] p-4"><ShoppingBag className="h-4 w-4 text-brand-600"/><p className="mt-2 text-2xl font-semibold">{detail.order_count}</p><p className="text-xs text-[#8d92aa]">pedidos registrados</p></div><div className="rounded-2xl bg-[#fafbfe] p-4"><WalletCards className="h-4 w-4 text-brand-600"/><p className="mt-2 text-2xl font-semibold">{money(detail.total_spent)}</p><p className="text-xs text-[#8d92aa]">compras acumuladas</p></div></div>
      {detail.address&&<div className="mt-4 rounded-2xl border border-[#e9ebf2] p-4"><p className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-[#a2a6b8]"/> Dirección</p><p className="mt-2 text-sm text-[#8d92aa]">{detail.address}</p></div>}
      <div className="mt-5 flex flex-wrap gap-2"><a className="btn-primary" target="_blank" href={`https://wa.me/${String(detail.phone).replace(/\D/g,'')}`}><MessageCircleMore className="h-4 w-4"/> Abrir WhatsApp</a><button className="btn-secondary" onClick={()=>startEdit(detail)}><Pencil className="h-4 w-4"/> Editar cliente</button></div>
      <div className="mt-6 overflow-hidden rounded-2xl border border-[#e9ebf2]"><table className="table"><thead><tr><th>Pedido</th><th>Total</th><th>Estado</th><th>Pago</th><th>Fecha</th></tr></thead><tbody>{detail.orders?.length?detail.orders.map((o:any)=><tr key={o.id}><td className="font-bold">#{o.number}</td><td>{money(o.total)}</td><td><Status value={o.status}/></td><td><Status value={o.payment_status}/></td><td className="text-[#8d92aa]">{dateTime(o.created_at)}</td></tr>):<tr><td colSpan={5} className="py-8 text-center text-[#a2a6b8]">Sin pedidos</td></tr>}</tbody></table></div>
    </div>}

    {view==='edit'&&edit&&<form onSubmit={save} className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-[#e9ebf2] bg-[#fafbfe] px-4 py-3"><div><p className="text-sm font-semibold text-ink-900">Edición rápida</p><p className="text-xs text-[#8d92aa]">La vista cambia sin abrir un segundo modal.</p></div>{detail&&<button type="button" className="inline-flex items-center gap-2 rounded-xl border border-[#dfe4ee] bg-white px-3 py-2 text-sm font-medium text-[#6c7290] hover:border-brand-200 hover:text-brand-700" onClick={backToDetail}><ArrowLeft className="h-4 w-4"/>Volver al resumen</button>}</div>
      {err&&<Alert text={err}/>}<div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><label className="label">Nombre *</label><input className="field" required value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})}/></div><div className="sm:col-span-2"><label className="label">Dirección</label><textarea className="field min-h-24 resize-none" value={edit.address} onChange={e=>setEdit({...edit,address:e.target.value})}/></div><div className="sm:col-span-2"><label className="label">Notas internas</label><textarea className="field min-h-28 resize-none" value={edit.notes} onChange={e=>setEdit({...edit,notes:e.target.value})}/></div><div><label className="label">Estado</label><select className="field" value={edit.status} onChange={e=>setEdit({...edit,status:e.target.value})}><option value="active">Activo</option><option value="blocked">Bloqueado</option></select></div></div><div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end"><button type="button" className="btn-secondary" onClick={detail?backToDetail:closeModal}>Cancelar</button><button className="btn-primary">Guardar</button></div>
    </form>}
   </div>
  </Modal>
 </AdminShell>
}
