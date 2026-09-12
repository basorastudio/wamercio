'use client'
import { useEffect,useState } from 'react'
import StoreShell,{StoreSelector} from '@/components/store-shell'
import {api,upload} from '@/lib/api'
import {Alert,ImagePicker,Loading,Modal,PageEmpty,Status,Switch} from '@/components/ui'
import type {Category} from '@/lib/types'
import {Plus,Pencil,Trash2,Tags} from 'lucide-react'

const blank={name:'',slug:'',description:'',image_url:'',sort_order:0,is_active:true}
export default function Categories(){
 const [store,setStore]=useState(''),[rows,setRows]=useState<Category[]>([]),[loading,setLoading]=useState(false),[open,setOpen]=useState(false),[edit,setEdit]=useState<Category|null>(null),[form,setForm]=useState<any>(blank),[err,setErr]=useState(''),[up,setUp]=useState(false)
 const load=()=>{if(!store){setRows([]);return};setLoading(true);api<Category[]>(`/categories?store_id=${store}`).then(setRows).finally(()=>setLoading(false))}
 useEffect(load,[store])
 const start=(x?:Category)=>{setEdit(x||null);setForm(x?{...x}:{...blank,sort_order:(rows.length+1)*10});setErr('');setOpen(true)}
 const save=async(e:React.FormEvent)=>{e.preventDefault();setErr('');try{const body={...form,store_id:store,slug:form.slug||'',sort_order:Number(form.sort_order||0)};if(edit)await api(`/categories/${edit.id}`,{method:'PUT',body:JSON.stringify(body)});else await api('/categories',{method:'POST',body:JSON.stringify(body)});setOpen(false);load()}catch(e:any){setErr(e.message)}}
 const del=async(x:Category)=>{if(!confirm(`¿Eliminar ${x.name}?`))return;await api(`/categories/${x.id}`,{method:'DELETE'}).catch((e)=>alert(e.message));load()}
 const pick=async(f:File)=>{setUp(true);try{const url=await upload(f);setForm((v:any)=>({...v,image_url:url}))}catch(e:any){setErr(e.message)}finally{setUp(false)}}
 return <StoreShell title="Categorías" subtitle="Organiza tu catálogo de forma simple" context={<StoreSelector value={store} onChange={setStore}/>} actions={<button disabled={!store} onClick={()=>start()} className="btn-primary"><Plus className="h-4 w-4"/> Nueva categoría</button>}>
  
  {!store?<PageEmpty title="Selecciona una tienda" detail="Elige la tienda cuyo catálogo quieres organizar."/>:loading?<Loading/>:rows.length===0?<PageEmpty title="Crea tu primera categoría" detail="Agrupa tus productos de una forma que tus clientes entiendan fácilmente." action={<button className="btn-primary" onClick={()=>start()}>Crear categoría</button>}/>:<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.map(x=><article key={x.id} className="card flex items-center gap-4 p-4"><div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#f3f5f7]">{x.image_url?<img src={x.image_url} className="h-full w-full object-cover"/>:<Tags className="h-6 w-6 text-[#a7acbb]"/>}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate font-semibold text-ink-900">{x.name}</h3><Status value={x.is_active?'active':'inactive'}/></div><p className="mt-1 line-clamp-2 text-sm leading-5 text-[#8d92aa]">{x.description||'Categoría del catálogo'}</p></div><div className="flex shrink-0 gap-1"><button onClick={()=>start(x)} className="icon-action"><Pencil className="h-4 w-4"/></button><button onClick={()=>del(x)} className="icon-action hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4"/></button></div></article>)}</div>}
  <Modal open={open} onClose={()=>setOpen(false)} title={edit?'Editar categoría':'Nueva categoría'} subtitle="El identificador y el orden se gestionan automáticamente.">
   <form onSubmit={save}>{err&&<Alert text={err}/>}<div className="grid gap-5 sm:grid-cols-[150px_1fr]"><ImagePicker value={form.image_url} onPick={pick} onClear={()=>setForm({...form,image_url:''})} label="Agregar imagen" busy={up}/><div className="space-y-4"><div><label className="label">Nombre *</label><input autoFocus className="field" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ej.: Pizzas"/></div><div><label className="label">Descripción</label><textarea className="field min-h-28 resize-none" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Opcional: una breve descripción para tus clientes."/></div>{edit&&<Switch checked={!!form.is_active} onChange={v=>setForm({...form,is_active:v})} label="Visible en el catálogo"/>}</div></div><div className="mt-7 flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end"><button type="button" className="btn-secondary" onClick={()=>setOpen(false)}>Cancelar</button><button className="btn-primary">{edit?'Guardar cambios':'Crear categoría'}</button></div></form>
  </Modal>
 </StoreShell>
}
