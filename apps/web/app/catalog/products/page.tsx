'use client'
import {useEffect,useMemo,useState} from 'react'
import StoreShell,{StoreSelector} from '@/components/store-shell'
import CatalogNav from '@/components/catalog-nav'
import {api,money,upload} from '@/lib/api'
import {Alert,ImagePicker,Loading,Modal,OptionEditor,PageEmpty,SearchBox,Status,Switch} from '@/components/ui'
import type {Category,PriceOption,Product} from '@/lib/types'
import {Plus,Boxes,Pencil,Trash2,ChevronDown,Sparkles,Package2,Image as ImageIcon} from 'lucide-react'

const blank={name:'',slug:'',sku:'',tag:'',description:'',image_url:'',category_id:'',price:0,compare_price:null as number|null,stock:null as number|null,track_stock:false,variants:[] as PriceOption[],extras:[] as PriceOption[],is_featured:false,sort_order:0,is_active:true}

export default function Products(){
 const[store,setStore]=useState(''),[rows,setRows]=useState<Product[]>([]),[cats,setCats]=useState<Category[]>([]),[loading,setLoading]=useState(false),[open,setOpen]=useState(false),[edit,setEdit]=useState<Product|null>(null),[form,setForm]=useState<any>(blank),[err,setErr]=useState(''),[search,setSearch]=useState(''),[up,setUp]=useState(false),[advanced,setAdvanced]=useState(false)
 const load=()=>{if(!store){setRows([]);setCats([]);return};setLoading(true);Promise.all([api<Product[]>(`/products?store_id=${store}`),api<Category[]>(`/categories?store_id=${store}`)]).then(([p,c])=>{setRows(p);setCats(c)}).finally(()=>setLoading(false))}
 useEffect(load,[store])
 const filtered=useMemo(()=>rows.filter(x=>(x.name+' '+(x.description||'')).toLowerCase().includes(search.toLowerCase())),[rows,search])
 const start=(x?:Product)=>{setEdit(x||null);setForm(x?{...x,variants:x.variants||[],extras:x.extras||[]}:{...blank,sort_order:(rows.length+1)*10});setAdvanced(!!(x&&(x.track_stock||x.variants?.length||x.extras?.length||!x.is_active)));setErr('');setOpen(true)}
 const save=async(e:React.FormEvent)=>{e.preventDefault();setErr('');try{const body={...form,store_id:store,slug:form.slug||'',sku:form.sku||'',tag:form.tag||'',compare_price:form.compare_price||null,is_featured:!!form.is_featured,sort_order:Number(form.sort_order||0)};if(edit)await api(`/products/${edit.id}`,{method:'PUT',body:JSON.stringify(body)});else await api('/products',{method:'POST',body:JSON.stringify(body)});setOpen(false);load()}catch(e:any){setErr(e.message)}}
 const del=async(x:Product)=>{if(!confirm(`¿Eliminar ${x.name}?`))return;await api(`/products/${x.id}`,{method:'DELETE'}).catch(e=>alert(e.message));load()}
 const pick=async(f:File)=>{setUp(true);try{const url=await upload(f);setForm((v:any)=>({...v,image_url:url}))}catch(e:any){setErr(e.message)}finally{setUp(false)}}
 const categoryName=cats.find(c=>c.id===form.category_id)?.name||'Sin categoría'

 return <StoreShell title="Productos" subtitle="Tu catálogo, sin configuraciones técnicas" context={<StoreSelector value={store} onChange={setStore}/>} actions={<button disabled={!store} onClick={()=>start()} className="btn-primary"><Plus className="h-4 w-4"/> Nuevo producto</button>}>
  <CatalogNav/>
  <div className="mb-5"><SearchBox value={search} onChange={setSearch} placeholder="Buscar productos..."/></div>
  {!store?<PageEmpty title="Selecciona una tienda" detail="Elige la tienda cuyo catálogo quieres administrar."/>:loading?<Loading/>:filtered.length===0?<PageEmpty title="Tu catálogo está listo para crecer" detail="Agrega tu primer producto. WAMERCIO se ocupa del identificador, orden y demás datos técnicos." action={<button className="btn-primary" onClick={()=>start()}>Agregar producto</button>}/>:<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{filtered.map(x=>{
   const cat=cats.find(c=>c.id===x.category_id)?.name||'Sin categoría'
   return <article key={x.id} className="merchant-grid-card group"><button onClick={()=>start(x)} className="block w-full text-left"><div className="relative aspect-[4/3] overflow-hidden bg-[#f4f6f8]">{x.image_url?<img src={x.image_url} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"/>:<div className="grid h-full place-items-center text-slate-300"><Boxes className="h-10 w-10"/></div>}{x.track_stock&&Number(x.stock||0)<=0&&<span className="absolute left-3 top-3 rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-bold uppercase text-white">Agotado</span>}</div><div className="p-4"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><h3 className="truncate font-semibold text-ink-900">{x.name}</h3><p className="mt-1 truncate text-xs text-[#989db0]">{cat}</p></div><strong className="shrink-0 text-brand-700">{money(x.price)}</strong></div><p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-[#858ba3]">{x.description||'Listo para vender.'}</p><div className="mt-4 flex items-center justify-between"><Status value={x.is_active?'active':'inactive'}/><span className="text-xs text-[#9ca1b3]">{x.variants?.length||0} variantes · {x.extras?.length||0} extras</span></div></div></button><div className="flex border-t border-slate-100"><button onClick={()=>start(x)} className="flex flex-1 items-center justify-center gap-2 py-3 text-xs font-semibold text-[#71778e] hover:bg-[#fafbfc] hover:text-brand-700"><Pencil className="h-3.5 w-3.5"/>Editar</button><button onClick={()=>del(x)} className="grid w-12 place-items-center border-l border-slate-100 text-[#a3a8b8] hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4"/></button></div></article>
  })}</div>}

  <Modal open={open} onClose={()=>setOpen(false)} title={edit?'Editar producto':'Nuevo producto'} subtitle="Formulario simplificado en dos columnas: imagen a la izquierda y datos a la derecha." wide>
   <form onSubmit={save}>
    {err&&<Alert text={err}/>}<div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="space-y-4 xl:sticky xl:top-0 xl:self-start">
        <div className="rounded-[28px] border border-[#edf0f4] bg-[#fbfcfd] p-4"><ImagePicker value={form.image_url} onPick={pick} onClear={()=>setForm({...form,image_url:''})} label="Agregar foto" busy={up}/><div className="mt-4 rounded-2xl bg-white p-4"><p className="text-sm font-semibold text-ink-900">Vista rápida</p><div className="mt-3 flex items-center gap-3 rounded-2xl border border-[#edf0f4] p-3"><div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#f3f5f7]">{form.image_url?<img src={form.image_url} className="h-full w-full object-cover"/>:<ImageIcon className="h-5 w-5 text-[#b1b6c5]"/>}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-900">{form.name||'Nombre del producto'}</p><p className="mt-1 truncate text-xs text-[#9aa0b4]">{categoryName}</p><p className="mt-2 text-sm font-semibold text-brand-700">{money(Number(form.price||0))}</p></div></div><p className="mt-3 text-xs leading-5 text-[#9ca1b3]">Usa una imagen clara. El cliente verá primero la foto, el nombre y el precio.</p></div></div>
      </aside>

      <div className="space-y-5">
        <section className="rounded-[28px] border border-[#edf0f4] bg-white p-5">
          <div className="mb-4 flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Package2 className="h-5 w-5"/></span><div><h3 className="text-base font-semibold text-ink-900">Información principal</h3><p className="text-sm text-[#8d92aa]">Solo completa lo que el cliente necesita ver en el catálogo.</p></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><label className="label">Nombre del producto *</label><input autoFocus className="field" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ej.: Pizza familiar"/></div><div><label className="label">Categoría</label><select className="field" value={form.category_id||''} onChange={e=>setForm({...form,category_id:e.target.value})}><option value="">Sin categoría</option>{cats.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></div><div><label className="label">Precio *</label><div className="relative"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#8f95aa]">RD$</span><input className="field pl-12" type="number" min="0" step="0.01" required value={form.price} onChange={e=>setForm({...form,price:Number(e.target.value)})}/></div></div><div className="sm:col-span-2"><label className="label">Descripción</label><textarea className="field min-h-28 resize-none" value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Describe brevemente lo que hace especial este producto."/></div></div>
        </section>

        <section className="rounded-[28px] border border-[#edf0f4] bg-white p-5">
          <button type="button" onClick={()=>setAdvanced(!advanced)} className="flex w-full items-center gap-3 text-left"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Sparkles className="h-5 w-5"/></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink-900">Opciones del producto</span><span className="mt-0.5 block text-xs text-[#9298ad]">Inventario, tamaños, sabores o adicionales.</span></span><ChevronDown className={`h-4 w-4 text-[#9298ad] transition ${advanced?'rotate-180':''}`}/></button>
          {advanced&&<div className="mt-5 space-y-4 border-t border-slate-100 pt-5">{edit&&<Switch checked={!!form.is_active} onChange={v=>setForm({...form,is_active:v})} label="Disponible para vender" detail="Desactívalo temporalmente si no quieres mostrarlo en el catálogo."/>}<Switch checked={!!form.track_stock} onChange={v=>setForm({...form,track_stock:v,stock:v?(form.stock??0):null})} label="Controlar inventario" detail="Actívalo solo si quieres limitar la cantidad disponible."/>{form.track_stock&&<div className="max-w-xs"><label className="label">Cantidad disponible</label><input className="field" type="number" min="0" step="1" value={form.stock??0} onChange={e=>setForm({...form,stock:Number(e.target.value)})}/></div>}<div className="grid gap-4 md:grid-cols-2"><OptionEditor label="Variantes" value={form.variants||[]} onChange={v=>setForm({...form,variants:v})}/><OptionEditor label="Adicionales / extras" value={form.extras||[]} onChange={v=>setForm({...form,extras:v})}/></div></div>}
        </section>
      </div>
    </div>

    <div className="mt-7 flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end"><button type="button" className="btn-secondary" onClick={()=>setOpen(false)}>Cancelar</button><button className="btn-primary">{edit?'Guardar cambios':'Crear producto'}</button></div>
   </form>
  </Modal>
 </StoreShell>
}
