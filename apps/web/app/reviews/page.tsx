'use client'
import {useEffect,useMemo,useState} from 'react'
import StoreShell,{StoreSelector} from '@/components/store-shell'
import {api,dateTime} from '@/lib/api'
import {Alert,Loading,PageEmpty,Status} from '@/components/ui'
import {Check,EyeOff,MessageSquareText,ShieldCheck,Star} from 'lucide-react'

type Review={id:string;product_id:string;product_name:string;order_id:string;rating:number;body:string;status:'pending'|'published'|'hidden';verified_purchase:boolean;customer_name:string;customer_phone:string;created_at:string}
const Stars=({value}:{value:number})=><span className="inline-flex gap-0.5" aria-label={`${value} de 5 estrellas`}>{[1,2,3,4,5].map(n=><Star key={n} className={`h-4 w-4 ${n<=value?'fill-amber-400 text-amber-400':'text-slate-200'}`}/>)}</span>

export default function Reviews(){
 const[store,setStore]=useState(''),[rows,setRows]=useState<Review[]>([]),[loading,setLoading]=useState(false),[err,setErr]=useState(''),[filter,setFilter]=useState<'all'|'pending'|'published'|'hidden'>('all'),[busy,setBusy]=useState('')
 const load=()=>{if(!store){setRows([]);return};setLoading(true);setErr('');api<Review[]>(`/reviews?store_id=${store}`).then(setRows).catch((e:any)=>setErr(e.message)).finally(()=>setLoading(false))}
 useEffect(load,[store])
 const visible=useMemo(()=>filter==='all'?rows:rows.filter(x=>x.status===filter),[rows,filter])
 const pending=rows.filter(x=>x.status==='pending').length,published=rows.filter(x=>x.status==='published').length
 const avg=published?rows.filter(x=>x.status==='published').reduce((s,x)=>s+x.rating,0)/published:0
 const moderate=async(row:Review,status:Review['status'])=>{setBusy(row.id);setErr('');try{await api(`/reviews/${row.id}`,{method:'PATCH',body:JSON.stringify({status})});setRows(v=>v.map(x=>x.id===row.id?{...x,status}:x))}catch(e:any){setErr(e.message)}finally{setBusy('')}}
 return <StoreShell title="Reseñas" subtitle="Opiniones verificadas de clientes que realmente completaron una compra" context={<StoreSelector value={store} onChange={setStore}/> }>
  {!store?<PageEmpty title="Selecciona una tienda" detail="Elige el negocio cuyas reseñas quieres moderar."/>:loading?<Loading/>:<div className="space-y-5">
   {err&&<Alert text={err}/>}<div className="grid gap-3 sm:grid-cols-3"><div className="card p-4"><p className="section-kicker">Pendientes</p><p className="mt-1 text-2xl font-semibold">{pending}</p><p className="mt-1 text-xs text-[#969caf]">Esperan revisión</p></div><div className="card p-4"><p className="section-kicker">Publicadas</p><p className="mt-1 text-2xl font-semibold">{published}</p><p className="mt-1 text-xs text-[#969caf]">Visibles en la tienda</p></div><div className="card p-4"><p className="section-kicker">Promedio</p><div className="mt-1 flex items-center gap-2"><p className="text-2xl font-semibold">{avg.toFixed(1)}</p><Star className="h-5 w-5 fill-amber-400 text-amber-400"/></div><p className="mt-1 text-xs text-[#969caf]">Solo reseñas publicadas</p></div></div>
   <section className="card overflow-hidden"><div className="flex flex-col gap-3 border-b border-[#edf0f4] p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="section-kicker">Moderación</p><h2 className="mt-1 text-lg font-semibold">Reseñas verificadas</h2></div><div className="flex flex-wrap gap-2">{[['all','Todas'],['pending','Pendientes'],['published','Publicadas'],['hidden','Ocultas']].map(([key,label])=><button key={key} onClick={()=>setFilter(key as any)} className={`rounded-full px-3 py-2 text-xs font-semibold ${filter===key?'bg-brand-50 text-brand-700':'bg-[#f5f6f8] text-[#777e94]'}`}>{label}</button>)}</div></div>
    {visible.length?<div className="divide-y divide-[#edf0f4]">{visible.map(row=><article key={row.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Stars value={row.rating}/><Status value={row.status}/>{row.verified_purchase&&<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700"><ShieldCheck className="h-3 w-3"/>Compra verificada</span>}</div><h3 className="mt-3 font-semibold">{row.product_name}</h3><p className="mt-1 text-sm leading-6 text-[#71788e]">{row.body||'El cliente calificó el producto sin comentario.'}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#969caf]"><span>{row.customer_name||'Cliente'}</span><span>Pedido {row.order_id.slice(0,8)}</span><span>{dateTime(row.created_at)}</span></div></div><div className="flex shrink-0 gap-2">{row.status!=='published'&&<button disabled={busy===row.id} onClick={()=>void moderate(row,'published')} className="btn-primary"><Check className="h-4 w-4"/>Publicar</button>}{row.status!=='hidden'&&<button disabled={busy===row.id} onClick={()=>void moderate(row,'hidden')} className="btn-secondary"><EyeOff className="h-4 w-4"/>Ocultar</button>}</div></div></article>)}</div>:<div className="p-12 text-center"><MessageSquareText className="mx-auto h-9 w-9 text-slate-300"/><p className="mt-3 font-semibold">No hay reseñas en esta vista</p><p className="mt-1 text-sm text-[#969caf]">Las reseñas solo pueden originarse desde pedidos completados.</p></div>}
   </section>
  </div>}
 </StoreShell>
}
