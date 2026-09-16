'use client'

import {useEffect,useState} from 'react'
import AdminShell,{StoreSelector} from '@/components/store-shell'
import {api,dateTime,money} from '@/lib/api'
import {Alert,Loading,Modal,PageEmpty} from '@/components/ui'
import type {Coupon} from '@/lib/types'
import {CalendarClock,Pencil,Plus,TicketPercent,Trash2} from 'lucide-react'

const blank={code:'',discount_type:'percentage',discount_value:10,min_order:0,usage_limit:null as number|null,starts_at:'',ends_at:'',is_active:true}

function toLocalInput(value?:string|null){
 if(!value)return ''
 const d=new Date(value)
 if(Number.isNaN(d.getTime()))return ''
 const pad=(n:number)=>String(n).padStart(2,'0')
 return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function toISO(value?:string|null){return value?new Date(value).toISOString():null}
function temporalState(c:Coupon){
 if(!c.is_active)return {label:'Inactivo',className:'bg-slate-100 text-slate-600'}
 const now=Date.now(),start=c.starts_at?new Date(c.starts_at).getTime():0,end=c.ends_at?new Date(c.ends_at).getTime():0
 if(start&&start>now)return {label:'Programado',className:'bg-cyan-50 text-cyan-700'}
 if(end&&end<now)return {label:'Finalizado',className:'bg-slate-100 text-slate-600'}
 return {label:'Activo',className:'bg-emerald-50 text-emerald-700'}
}

export default function Coupons(){
 const[store,setStore]=useState(''),[rows,setRows]=useState<Coupon[]>([]),[loading,setLoading]=useState(false),[open,setOpen]=useState(false),[edit,setEdit]=useState<Coupon|null>(null),[form,setForm]=useState<any>(blank),[err,setErr]=useState('')
 const load=()=>{if(!store){setRows([]);return};setLoading(true);api<Coupon[]>(`/coupons?store_id=${store}`).then(setRows).finally(()=>setLoading(false))}
 useEffect(load,[store])
 const start=(x?:Coupon)=>{setEdit(x||null);setForm(x?{...x,starts_at:toLocalInput(x.starts_at),ends_at:toLocalInput(x.ends_at)}:{...blank});setErr('');setOpen(true)}
 const save=async(e:React.FormEvent)=>{e.preventDefault();setErr('');try{const body={...form,store_id:store,starts_at:toISO(form.starts_at),ends_at:toISO(form.ends_at)};if(body.starts_at&&body.ends_at&&new Date(body.ends_at)<=new Date(body.starts_at))throw new Error('La fecha de fin debe ser posterior al inicio.');if(edit)await api(`/coupons/${edit.id}`,{method:'PUT',body:JSON.stringify(body)});else await api('/coupons',{method:'POST',body:JSON.stringify(body)});setOpen(false);load()}catch(e:any){setErr(e.message)}}
 const del=async(x:Coupon)=>{if(!confirm(`¿Eliminar cupón ${x.code}?`))return;await api(`/coupons/${x.id}`,{method:'DELETE'});load()}
 return <AdminShell title="Cupones" subtitle="Códigos de descuento con vigencia, mínimo y límite de uso" context={<StoreSelector value={store} onChange={setStore}/>} actions={<button disabled={!store} onClick={()=>start()} className="btn-primary"><Plus className="h-4 w-4"/>Nuevo cupón</button>}>
  {!store?<PageEmpty title="Selecciona una tienda" detail="Elige una tienda para administrar sus cupones."/>:loading?<Loading/>:rows.length===0?<PageEmpty title="No hay cupones" detail="Crea un código promocional y decide cuándo estará disponible." action={<button className="btn-primary" onClick={()=>start()}><Plus className="h-4 w-4"/>Crear cupón</button>}/>:<div className="table-wrap overflow-x-auto"><table className="table"><thead><tr><th>Código</th><th>Descuento</th><th>Compra mínima</th><th>Vigencia</th><th>Usos</th><th>Estado</th><th></th></tr></thead><tbody>{rows.map(x=>{const state=temporalState(x);return <tr key={x.id}><td><span className="inline-flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-1.5 font-mono font-bold text-brand-700"><TicketPercent className="h-4 w-4"/>{x.code}</span></td><td className="font-semibold">{x.discount_type==='percentage'?`${x.discount_value}%`:money(x.discount_value)}</td><td>{money(x.min_order)}</td><td><div className="min-w-[180px] text-xs text-[#737a91]"><div className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-brand-600"/><span>{x.starts_at?dateTime(x.starts_at):'Inicio inmediato'}</span></div><div className="mt-1 pl-5">{x.ends_at?`Hasta ${dateTime(x.ends_at)}`:'Sin vencimiento'}</div></div></td><td>{x.used_count}{x.usage_limit?` / ${x.usage_limit}`:''}</td><td><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${state.className}`}>{state.label}</span></td><td><div className="flex justify-end gap-2"><button className="btn-secondary px-3" onClick={()=>start(x)}><Pencil className="h-4 w-4"/></button><button className="btn-danger px-3" onClick={()=>del(x)}><Trash2 className="h-4 w-4"/></button></div></td></tr>})}</tbody></table></div>}
  <Modal open={open} onClose={()=>setOpen(false)} title={edit?'Editar cupón':'Nuevo cupón'} subtitle="El cupón puede comenzar de inmediato, programarse y tener una fecha de vencimiento.">
   <form onSubmit={save}>{err&&<Alert text={err}/>}<div className="space-y-4">
    <div><label className="label">Código *</label><input className="field uppercase" required value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} placeholder="WAMERCIO10"/></div>
    <div className="grid grid-cols-2 gap-3"><div><label className="label">Tipo</label><select className="field" value={form.discount_type} onChange={e=>setForm({...form,discount_type:e.target.value})}><option value="percentage">Porcentaje</option><option value="flat">Monto fijo</option></select></div><div><label className="label">Valor</label><input className="field" type="number" min="0.01" max={form.discount_type==='percentage'?100:undefined} step="0.01" value={form.discount_value} onChange={e=>setForm({...form,discount_value:Number(e.target.value)})}/></div></div>
    <div className="grid gap-3 sm:grid-cols-2"><div><label className="label">Inicio</label><input className="field" type="datetime-local" value={form.starts_at||''} onChange={e=>setForm({...form,starts_at:e.target.value})}/><p className="mt-1 text-[11px] text-[#9aa0b2]">Vacío = disponible de inmediato.</p></div><div><label className="label">Fin</label><input className="field" type="datetime-local" value={form.ends_at||''} onChange={e=>setForm({...form,ends_at:e.target.value})}/><p className="mt-1 text-[11px] text-[#9aa0b2]">Vacío = sin vencimiento.</p></div></div>
    <div className="grid gap-3 sm:grid-cols-2"><div><label className="label">Compra mínima</label><input className="field" type="number" min="0" step="0.01" value={form.min_order} onChange={e=>setForm({...form,min_order:Number(e.target.value)})}/></div><div><label className="label">Límite de usos</label><input className="field" type="number" min="1" value={form.usage_limit??''} onChange={e=>setForm({...form,usage_limit:e.target.value===''?null:Number(e.target.value)})} placeholder="Sin límite"/></div></div>
    {edit&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/> Activo</label>}
   </div><div className="mt-6 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={()=>setOpen(false)}>Cancelar</button><button className="btn-primary">Guardar</button></div></form>
  </Modal>
 </AdminShell>
}
