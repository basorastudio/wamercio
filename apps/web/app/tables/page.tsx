'use client'

import {useEffect,useMemo,useState} from 'react'
import StoreShell,{StoreSelector} from '@/components/store-shell'
import {api} from '@/lib/api'
import {Alert,Loading,PageEmpty} from '@/components/ui'
import {Clock3,Plus,Save,Trash2,UsersRound,UtensilsCrossed} from 'lucide-react'
import {resolveBusinessCapabilities} from '@/lib/business-capabilities'

type TableRow={id:string;name:string;capacity:number;sort_order:number;is_active:boolean;created_at?:string}

export default function TablesPage(){
 const[store,setStore]=useState('')
 const[config,setConfig]=useState<any>(null)
 const[tables,setTables]=useState<TableRow[]>([])
 const[newTable,setNewTable]=useState({name:'',capacity:4})
 const[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[ok,setOk]=useState('')
 const capabilities=useMemo(()=>resolveBusinessCapabilities(config),[config])
 const enabled=!!config?.dine_in_enabled&&capabilities.supportsDineIn
 const load=async()=>{
  if(!store){setConfig(null);setTables([]);return}
  setLoading(true);setErr('')
  try{const[cfg,rows]=await Promise.all([api<any>(`/stores/${store}/settings`),api<TableRow[]>(`/tables?store_id=${store}`)]);setConfig(cfg);setTables(rows||[])}catch(e:any){setErr(e.message)}finally{setLoading(false)}
 }
 useEffect(()=>{void load()},[store])
 const reloadTables=async()=>setTables(await api<TableRow[]>(`/tables?store_id=${store}`))
 const addTable=async()=>{if(!newTable.name.trim()||!enabled)return;setBusy(true);setErr('');setOk('');try{await api('/tables',{method:'POST',body:JSON.stringify({store_id:store,name:newTable.name.trim(),capacity:Math.max(1,Number(newTable.capacity)||4)})});setNewTable({name:'',capacity:4});await reloadTables();setOk('Mesa agregada correctamente.')}catch(e:any){setErr(e.message)}finally{setBusy(false)}}
 const saveTable=async(row:TableRow)=>{setBusy(true);setErr('');setOk('');try{await api(`/tables/${row.id}`,{method:'PUT',body:JSON.stringify({store_id:store,name:row.name.trim(),capacity:Math.max(1,Number(row.capacity)||1),sort_order:Number(row.sort_order)||100,is_active:row.is_active!==false})});await reloadTables();setOk('Mesa actualizada.')}catch(e:any){setErr(e.message)}finally{setBusy(false)}}
 const archiveTable=async(row:TableRow)=>{if(!confirm(`¿Archivar ${row.name}?`))return;setBusy(true);setErr('');setOk('');try{await api(`/tables/${row.id}`,{method:'DELETE'});await reloadTables();setOk('Mesa archivada.')}catch(e:any){setErr(e.message)}finally{setBusy(false)}}
 const saveDuration=async(value:number)=>{if(!config)return;const next={...config,reservation_duration_minutes:value};setConfig(next);setBusy(true);setErr('');setOk('');try{await api(`/stores/${store}/settings`,{method:'PUT',body:JSON.stringify(next)});if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('wamercio:store-settings-changed',{detail:{store_id:store}}));setOk('Duración de reserva actualizada.')}catch(e:any){setErr(e.message)}finally{setBusy(false)}}
 const active=tables.filter(row=>row.is_active!==false)
 return <StoreShell title="Gestión de mesas" subtitle="Administra mesas, capacidad y duración de las reservas" context={<StoreSelector value={store} onChange={setStore}/> }>
  {!store?<PageEmpty title="Selecciona un negocio" detail="Elige el negocio donde administrarás las mesas."/>:loading?<Loading/>:<div className="space-y-5">
   {err&&<Alert text={err}/>} {ok&&<Alert text={ok} type="success"/>}
   {!enabled?<section className="card p-6"><div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600"><UtensilsCrossed className="h-5 w-5"/></span><div><h2 className="text-lg font-semibold">Mesas y reservas está desactivado</h2><p className="mt-1 text-sm leading-6 text-[#8d92aa]">Activa <strong>Mesas y reservas</strong> en Configuración → Ventas y entrega para administrar mesas en este negocio.</p><a className="btn-secondary mt-4 inline-flex" href="/settings/store?tab=sales">Ir a Ventas y entrega</a></div></div></section>:<>
    <section className="grid gap-4 lg:grid-cols-[1fr_300px]">
     <div className="card p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-600"><UtensilsCrossed className="h-5 w-5"/></span><div><p className="section-kicker">Disponibilidad</p><h2 className="text-xl font-semibold">Administrar mesas</h2><p className="mt-1 text-sm text-[#8d92aa]">Define las mesas disponibles y su capacidad para las reservas.</p></div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_150px_auto]"><div><label className="label">Nombre de la mesa</label><input className="field" placeholder="Ej.: Mesa 1, Terraza A" value={newTable.name} onChange={e=>setNewTable({...newTable,name:e.target.value})}/></div><div><label className="label">Capacidad</label><input className="field" type="number" min="1" max="50" value={newTable.capacity} onChange={e=>setNewTable({...newTable,capacity:Number(e.target.value)})}/></div><div className="flex items-end"><button type="button" disabled={busy||!newTable.name.trim()} onClick={addTable} className="btn-primary w-full justify-center"><Plus className="h-4 w-4"/>Agregar mesa</button></div></div>
     </div>
     <aside className="card p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Clock3 className="h-5 w-5"/></span><div><p className="section-kicker">Reservas</p><h3 className="font-semibold">Duración de la reserva</h3></div></div><p className="mt-3 text-xs leading-5 text-[#8d92aa]">Define el tiempo estándar que ocupará una mesa para calcular la disponibilidad.</p><select className="field mt-4" value={config?.reservation_duration_minutes||90} disabled={busy} onChange={e=>void saveDuration(Number(e.target.value))}><option value={60}>60 minutos</option><option value={90}>90 minutos</option><option value={120}>120 minutos</option><option value={180}>180 minutos</option></select></aside>
    </section>
    <section className="card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f5] p-5"><div><p className="section-kicker">Mesas activas</p><h2 className="mt-1 text-lg font-semibold">{active.length} {active.length===1?'mesa disponible':'mesas disponibles'}</h2></div><span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700"><UsersRound className="h-4 w-4"/>{active.reduce((sum,row)=>sum+Number(row.capacity||0),0)} personas de capacidad total</span></div>
     <div className="divide-y divide-[#edf0f5]">{active.length?active.map(row=><div key={row.id} className="grid items-center gap-3 p-4 sm:grid-cols-[1fr_160px_auto]"><div><label className="label">Mesa</label><input className="field" value={row.name} onChange={e=>setTables(v=>v.map(x=>x.id===row.id?{...x,name:e.target.value}:x))}/></div><div><label className="label">Capacidad</label><div className="relative"><input className="field pr-14" type="number" min="1" max="50" value={row.capacity} onChange={e=>setTables(v=>v.map(x=>x.id===row.id?{...x,capacity:Number(e.target.value)}:x))}/><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8d92aa]">pers.</span></div></div><div className="flex items-end gap-2 sm:pt-6"><button type="button" disabled={busy||!row.name.trim()} className="btn-secondary px-3" onClick={()=>saveTable(row)} title="Guardar mesa"><Save className="h-4 w-4"/>Guardar</button><button type="button" disabled={busy} className="btn-danger px-3" onClick={()=>archiveTable(row)} title="Archivar mesa"><Trash2 className="h-4 w-4"/>Archivar</button></div></div>):<div className="p-10 text-center text-sm text-[#8d92aa]">Agrega tu primera mesa para aceptar reservas.</div>}</div>
    </section>
   </>}
  </div>}
 </StoreShell>
}
