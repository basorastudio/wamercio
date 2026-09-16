'use client'
import {useEffect,useMemo,useState} from 'react'
import AdminShell,{StoreSelector} from '@/components/store-shell'
import CustomerDetailView from '@/components/customer-detail-view'
import {api,dateTime,money} from '@/lib/api'
import {Loading,Modal,PageEmpty,SearchBox,Status,Alert} from '@/components/ui'
import type {Customer} from '@/lib/types'
import {phoneDisplay} from '@/components/phone-input'
import {Eye,MapPin,ShoppingBag,WalletCards,Pencil,MessageCircleMore,ArrowLeft,UsersRound,Gift} from 'lucide-react'

type ModalView='detail'|'profile'|'edit'|null
type DirectoryTab='customers'|'contacts'
type Contact={
 id:string;conversation_id:string;name:string;phone:string;whatsapp_name?:string;profile_picture_url?:string;
 unread_count:number;last_message:string;last_message_at?:string|null;status:string;created_at:string;
 address?:string;notes?:string;contact_status?:string;contact_type:'contact'
}

function Avatar({name,url,size='md'}:{name:string;url?:string;size?:'md'|'lg'}){
 const cls=size==='lg'?'h-14 w-14 text-lg':'h-10 w-10 text-sm'
 return <div className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#edf2f1] font-semibold text-[#54656f] ${cls}`}>
  {url?<img src={url} alt={name||'Contacto'} className="h-full w-full object-cover"/>:(name||'?').slice(0,1).toUpperCase()}
 </div>
}

export default function Customers(){
 const[store,setStore]=useState(''),[rows,setRows]=useState<Customer[]>([]),[contacts,setContacts]=useState<Contact[]>([]),[loading,setLoading]=useState(false),[search,setSearch]=useState(''),[tab,setTab]=useState<DirectoryTab>('customers'),[detail,setDetail]=useState<any>(null),[edit,setEdit]=useState<any>(null),[err,setErr]=useState(''),[view,setView]=useState<ModalView>(null)
 const load=()=>{if(!store){setRows([]);setContacts([]);return};setLoading(true);Promise.all([api<Customer[]>(`/customers?store_id=${store}`),api<Contact[]>(`/contacts?store_id=${store}`)]).then(([customers,contactRows])=>{setRows(customers);setContacts(contactRows)}).finally(()=>setLoading(false))}
 useEffect(load,[store])
 const filteredCustomers=useMemo(()=>rows.filter(x=>(x.name+' '+x.phone+' '+(x.whatsapp_name||'')).toLowerCase().includes(search.toLowerCase())),[rows,search])
 const filteredContacts=useMemo(()=>contacts.filter(x=>(x.name+' '+x.phone+' '+(x.whatsapp_name||'')+' '+(x.last_message||'')).toLowerCase().includes(search.toLowerCase())),[contacts,search])
 const open=async(id:string)=>{const data=await api(`/customers/${id}`);setDetail(data);setEdit(null);setErr('');setView('detail')}
 const startEdit=(c:any)=>{setEdit({id:c.id,name:c.name,address:c.address||'',notes:c.notes||'',status:c.status||'active'});setErr('');setView('edit')}
 const closeModal=()=>{setView(null);setDetail(null);setEdit(null);setErr('')}
 const backToDetail=async()=>{if(edit?.id){try{setDetail(await api(`/customers/${edit.id}`))}catch{}}setView('detail');setErr('')}
 const save=async(e:React.FormEvent)=>{e.preventDefault();setErr('');try{await api(`/customers/${edit.id}`,{method:'PUT',body:JSON.stringify(edit)});load();const updated=await api(`/customers/${edit.id}`);setDetail(updated);setEdit({id:updated.id,name:updated.name,address:updated.address||'',notes:updated.notes||'',status:updated.status||'active'});setView('detail')}catch(e:any){setErr(e.message)}}
 const modalTitle=view==='edit'?'Editar cliente':view==='profile'?'Detalles del cliente':detail?.name||'Cliente'
 const openWhatsApp=(phone:string)=>{const digits=String(phone||'').replace(/\D/g,'');if(digits)window.open(`https://wa.me/${digits}`,'_blank','noopener,noreferrer')}
 const openBusinessWhatsApp=()=>{if(!detail)return;const params=new URLSearchParams({store_id:store});if(detail.conversation_id)params.set('conversation_id',detail.conversation_id);else if(detail.phone)params.set('phone',String(detail.phone).replace(/\D/g,''));window.location.href=`/conversations?${params.toString()}`}
 const openProfile=()=>{if(detail?.global_profile)setView('profile')}

 return <AdminShell title="Clientes" subtitle="Distingue compradores de los contactos que llegan por WhatsApp" context={<StoreSelector value={store} onChange={setStore}/>}> 
  <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
   <div className="inline-flex w-fit rounded-2xl border border-[#e5e9ef] bg-white p-1 shadow-sm">
    <button onClick={()=>setTab('customers')} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${tab==='customers'?'bg-[#e8f8f2] text-[#08785f]':'text-[#7a8097] hover:text-[#26324b]'}`}><ShoppingBag className="h-4 w-4"/>Clientes <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px]">{rows.length}</span></button>
    <button onClick={()=>setTab('contacts')} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${tab==='contacts'?'bg-[#e8f8f2] text-[#08785f]':'text-[#7a8097] hover:text-[#26324b]'}`}><UsersRound className="h-4 w-4"/>Contactos <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px]">{contacts.length}</span></button>
   </div>
   <div className="w-full sm:max-w-md"><SearchBox value={search} onChange={setSearch} placeholder={tab==='customers'?'Buscar clientes por nombre o WhatsApp...':'Buscar contactos por nombre, WhatsApp o mensaje...'}/></div>
  </div>

  {!store?<PageEmpty title="Selecciona una tienda" detail="Los clientes y contactos pertenecen a cada tienda."/>:loading?<Loading/>:tab==='customers'?(filteredCustomers.length===0?<PageEmpty title="Aún no hay clientes" detail="Un contacto pasa a Cliente cuando registra su primera compra no cancelada."/>:<div className="table-wrap overflow-x-auto"><table className="table"><thead><tr><th>Cliente</th><th>Pedidos</th><th>Total comprado</th><th>Último pedido</th><th>Estado</th><th></th></tr></thead><tbody>{filteredCustomers.map(c=><tr key={c.id}><td><div className="flex min-w-[240px] items-center gap-3"><Avatar name={c.name} url={c.profile_picture_url}/><div className="min-w-0"><div className="truncate font-semibold text-ink-900">{c.name}</div><div className="mt-0.5 text-xs text-[#a2a6b8]">{phoneDisplay(c.phone)}</div>{c.whatsapp_name&&c.whatsapp_name!==c.name&&<div className="mt-0.5 truncate text-[11px] text-[#00a884]">WhatsApp: {c.whatsapp_name}</div>}</div></div></td><td className="font-semibold">{c.order_count}</td><td className="font-semibold">{money(c.total_spent)}</td><td className="text-[#8d92aa]">{c.last_order_at?dateTime(c.last_order_at):'—'}</td><td><Status value={c.status}/></td><td><div className="flex justify-end gap-2"><button onClick={()=>open(c.id)} className="btn-secondary px-3"><Eye className="h-4 w-4"/></button><button onClick={()=>startEdit(c)} className="btn-secondary px-3"><Pencil className="h-4 w-4"/></button></div></td></tr>)}</tbody></table></div>):(filteredContacts.length===0?<PageEmpty title="Aún no hay contactos" detail="Los chats individuales de WhatsApp que todavía no han comprado aparecerán aquí."/>:<div className="table-wrap overflow-x-auto"><table className="table"><thead><tr><th>Contacto</th><th>Último mensaje</th><th>No leídos</th><th>Última interacción</th><th>Estado</th><th></th></tr></thead><tbody>{filteredContacts.map(c=><tr key={c.id}><td><div className="flex min-w-[240px] items-center gap-3"><Avatar name={c.name} url={c.profile_picture_url}/><div className="min-w-0"><div className="truncate font-semibold text-ink-900">{c.name}</div><div className="mt-0.5 text-xs text-[#a2a6b8]">{c.phone?phoneDisplay(c.phone):'WhatsApp'}</div>{c.whatsapp_name&&c.whatsapp_name!==c.name&&<div className="mt-0.5 truncate text-[11px] text-[#00a884]">Perfil: {c.whatsapp_name}</div>}</div></div></td><td className="max-w-[320px]"><div className="truncate text-sm text-[#6c7290]">{c.last_message||'Nueva conversación'}</div></td><td>{c.unread_count>0?<span className="inline-grid h-6 min-w-6 place-items-center rounded-full bg-[#25d366] px-1.5 text-[11px] font-bold text-white">{c.unread_count}</span>:<span className="text-[#a2a6b8]">—</span>}</td><td className="text-[#8d92aa]">{c.last_message_at?dateTime(c.last_message_at):'—'}</td><td><span className="inline-flex rounded-full bg-[#eef8f4] px-2.5 py-1 text-xs font-semibold text-[#08785f]">Contacto</span></td><td><div className="flex justify-end"><button onClick={()=>openWhatsApp(c.phone)} disabled={!c.phone} className="btn-secondary px-3" title="Abrir WhatsApp"><MessageCircleMore className="h-4 w-4"/></button></div></td></tr>)}</tbody></table></div>)}

  <Modal open={!!view} onClose={closeModal} title={modalTitle} subtitle={view==='edit'?'Edita la ficha sin salir del flujo actual.':undefined} wide>
   <div key={view||'closed'} className="transition-all duration-200 ease-out">
    {view==='detail'&&detail&&<div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl bg-[#fafbfe] p-4"><MessageCircleMore className="h-4 w-4 text-brand-600"/><p className="mt-2 text-sm font-semibold">{phoneDisplay(detail.phone)}</p><p className="mt-1 text-xs text-[#8d92aa]">Cliente vinculado por WhatsApp</p></div><div className="rounded-2xl bg-[#fafbfe] p-4"><ShoppingBag className="h-4 w-4 text-brand-600"/><p className="mt-2 text-2xl font-semibold">{detail.order_count}</p><p className="text-xs text-[#8d92aa]">pedidos registrados</p></div><div className="rounded-2xl bg-[#fafbfe] p-4"><WalletCards className="h-4 w-4 text-brand-600"/><p className="mt-2 text-2xl font-semibold">{money(detail.total_spent)}</p><p className="text-xs text-[#8d92aa]">compras acumuladas</p></div><div className="rounded-2xl bg-[#fafbfe] p-4"><Gift className="h-4 w-4 text-brand-600"/><p className="mt-2 text-2xl font-semibold">{Number(detail.loyalty_points||0).toLocaleString('es-DO')}</p><p className="text-xs text-[#8d92aa]">Puntos de fidelización</p></div></div>
      {detail.address&&<div className="mt-4 rounded-2xl border border-[#e9ebf2] p-4"><p className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-[#a2a6b8]"/> Dirección</p><p className="mt-2 text-sm text-[#8d92aa]">{detail.address}</p></div>}
      <div className="mt-5 flex flex-wrap gap-2"><button type="button" className="btn-primary" onClick={openBusinessWhatsApp}><MessageCircleMore className="h-4 w-4"/> Abrir WhatsApp</button><button type="button" className="btn-secondary" onClick={openProfile} disabled={!detail.global_profile}><Eye className="h-4 w-4"/> Detalles del cliente</button></div>
      <div className="mt-6 overflow-hidden rounded-2xl border border-[#e9ebf2]"><table className="table"><thead><tr><th>Pedido</th><th>Total</th><th>Estado</th><th>Pago</th><th>Fecha</th></tr></thead><tbody>{detail.orders?.length?detail.orders.map((o:any)=><tr key={o.id}><td className="font-bold">#{o.number}</td><td>{money(o.total)}</td><td><Status value={o.status}/></td><td><Status value={o.payment_status}/></td><td className="text-[#8d92aa]">{dateTime(o.created_at)}</td></tr>):<tr><td colSpan={5} className="py-8 text-center text-[#a2a6b8]">Sin pedidos</td></tr>}</tbody></table></div>
    </div>}

    {view==='profile'&&detail&&<div><div className="mb-4"><button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700" onClick={()=>setView('detail')}><ArrowLeft className="h-4 w-4"/>Volver a la ficha comercial</button></div><CustomerDetailView profile={detail.global_profile} storePoints={Number(detail.loyalty_points||0)} storeOrders={Number(detail.order_count||0)} storeSpent={Number(detail.total_spent||0)} tenantMode/></div>}

    {view==='edit'&&edit&&<form onSubmit={save} className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-[#e9ebf2] bg-[#fafbfe] px-4 py-3"><div><p className="text-sm font-semibold text-ink-900">Edición rápida</p><p className="text-xs text-[#8d92aa]">La vista cambia sin abrir un segundo modal.</p></div>{detail&&<button type="button" className="inline-flex items-center gap-2 rounded-xl border border-[#dfe4ee] bg-white px-3 py-2 text-sm font-medium text-[#6c7290] hover:border-brand-200 hover:text-brand-700" onClick={backToDetail}><ArrowLeft className="h-4 w-4"/>Volver al resumen</button>}</div>
      {err&&<Alert text={err}/>}<div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><label className="label">Nombre *</label><input className="field" required value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})}/></div><div className="sm:col-span-2"><label className="label">Dirección</label><textarea className="field min-h-24 resize-none" value={edit.address} onChange={e=>setEdit({...edit,address:e.target.value})}/></div><div className="sm:col-span-2"><label className="label">Notas internas</label><textarea className="field min-h-28 resize-none" value={edit.notes} onChange={e=>setEdit({...edit,notes:e.target.value})}/></div><div><label className="label">Estado</label><select className="field" value={edit.status} onChange={e=>setEdit({...edit,status:e.target.value})}><option value="active">Activo</option><option value="blocked">Bloqueado</option></select></div></div><div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end"><button type="button" className="btn-secondary" onClick={detail?backToDetail:closeModal}>Cancelar</button><button className="btn-primary">Guardar</button></div>
    </form>}
   </div>
  </Modal>
 </AdminShell>
}
