'use client'

import {useEffect,useMemo,useState} from 'react'
import StoreShell,{StoreSelector} from '@/components/store-shell'
import {api} from '@/lib/api'
import {Alert,Loading,PageEmpty} from '@/components/ui'
import {Clock3,Plus,Save,Trash2,UsersRound,UtensilsCrossed} from 'lucide-react'
import {resolveBusinessCapabilities} from '@/lib/business-capabilities'

type TableArea={id:string;name:string;sort_order:number;is_active:boolean;table_count:number;capacity:number;created_at?:string}
type TableRow={id:string;area_id:string;area_name:string;name:string;capacity:number;sort_order:number;is_active:boolean;created_at?:string}

export default function TablesPage(){
 const[store,setStore]=useState('')
 const[config,setConfig]=useState<any>(null)
 const[areas,setAreas]=useState<TableArea[]>([])
 const[tables,setTables]=useState<TableRow[]>([])
 const[newArea,setNewArea]=useState('')
 const[newTable,setNewTable]=useState({area_id:'',name:'',capacity:4})
 const[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[ok,setOk]=useState('')
 const capabilities=useMemo(()=>resolveBusinessCapabilities(config),[config])
 const enabled=!!config?.dine_in_enabled&&capabilities.supportsDineIn
 const activeAreas=useMemo(()=>areas.filter(x=>x.is_active!==false),[areas])
 const activeTables=useMemo(()=>tables.filter(x=>x.is_active!==false),[tables])
 const load=async()=>{
  if(!store){setConfig(null);setAreas([]);setTables([]);return}
  setLoading(true);setErr('')
  try{
   const[cfg,areaRows,tableRows]=await Promise.all([api<any>(`/stores/${store}/settings`),api<TableArea[]>(`/table-areas?store_id=${store}`),api<TableRow[]>(`/tables?store_id=${store}`)])
   setConfig(cfg);setAreas(areaRows||[]);setTables(tableRows||[])
   const first=(areaRows||[]).find(x=>x.is_active!==false)
   setNewTable(v=>({...v,area_id:(areaRows||[]).some(x=>x.id===v.area_id&&x.is_active!==false)?v.area_id:first?.id||''}))
  }catch(e:any){setErr(e.message)}finally{setLoading(false)}
 }
 useEffect(()=>{void load()},[store])
 const reloadManagement=async()=>{
  const[areaRows,tableRows]=await Promise.all([api<TableArea[]>(`/table-areas?store_id=${store}`),api<TableRow[]>(`/tables?store_id=${store}`)])
  setAreas(areaRows||[]);setTables(tableRows||[])
  const first=(areaRows||[]).find(x=>x.is_active!==false)
  setNewTable(v=>({...v,area_id:(areaRows||[]).some(x=>x.id===v.area_id&&x.is_active!==false)?v.area_id:first?.id||''}))
 }
 const addArea=async()=>{if(!newArea.trim()||!enabled)return;setBusy(true);setErr('');setOk('');try{await api('/table-areas',{method:'POST',body:JSON.stringify({store_id:store,name:newArea.trim()})});setNewArea('');await reloadManagement();setOk('Área agregada correctamente.')}catch(e:any){setErr(e.message)}finally{setBusy(false)}}
 const saveArea=async(row:TableArea)=>{setBusy(true);setErr('');setOk('');try{await api(`/table-areas/${row.id}`,{method:'PUT',body:JSON.stringify({store_id:store,name:row.name.trim(),sort_order:Number(row.sort_order)||100,is_active:row.is_active!==false})});await reloadManagement();setOk('Área actualizada.')}catch(e:any){setErr(e.message)}finally{setBusy(false)}}
 const archiveArea=async(row:TableArea)=>{if(!confirm(`¿Archivar el área ${row.name}?`))return;setBusy(true);setErr('');setOk('');try{await api(`/table-areas/${row.id}`,{method:'DELETE'});await reloadManagement();setOk('Área archivada.')}catch(e:any){setErr(e.message)}finally{setBusy(false)}}
 const addTable=async()=>{if(!newTable.area_id||!newTable.name.trim()||!enabled)return;setBusy(true);setErr('');setOk('');try{await api('/tables',{method:'POST',body:JSON.stringify({store_id:store,area_id:newTable.area_id,name:newTable.name.trim(),capacity:Math.max(1,Number(newTable.capacity)||4)})});setNewTable(v=>({...v,name:'',capacity:4}));await reloadManagement();setOk('Mesa agregada correctamente.')}catch(e:any){setErr(e.message)}finally{setBusy(false)}}
 const saveTable=async(row:TableRow)=>{setBusy(true);setErr('');setOk('');try{await api(`/tables/${row.id}`,{method:'PUT',body:JSON.stringify({store_id:store,area_id:row.area_id,name:row.name.trim(),capacity:Math.max(1,Number(row.capacity)||1),sort_order:Number(row.sort_order)||100,is_active:row.is_active!==false})});await reloadManagement();setOk('Mesa actualizada.')}catch(e:any){setErr(e.message)}finally{setBusy(false)}}
 const archiveTable=async(row:TableRow)=>{if(!confirm(`¿Archivar ${row.name}?`))return;setBusy(true);setErr('');setOk('');try{await api(`/tables/${row.id}`,{method:'DELETE'});await reloadManagement();setOk('Mesa archivada.')}catch(e:any){setErr(e.message)}finally{setBusy(false)}}
 const saveDuration=async(value:number)=>{if(!config)return;const next={...config,reservation_duration_minutes:value};setConfig(next);setBusy(true);setErr('');setOk('');try{await api(`/stores/${store}/settings`,{method:'PUT',body:JSON.stringify(next)});if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('wamercio:store-settings-changed',{detail:{store_id:store}}));setOk('Duración de reserva actualizada.')}catch(e:any){setErr(e.message)}finally{setBusy(false)}}
 return <StoreShell title="Gestión de mesas" subtitle="Organiza áreas, mesas, capacidad y duración de las reservas" context={<StoreSelector value={store} onChange={setStore}/> }>
  {!store?<PageEmpty title="Selecciona un negocio" detail="Elige el negocio donde administrarás las mesas."/>:loading?<Loading/>:<div className="space-y-5">
   {err&&<Alert text={err}/>} {ok&&<Alert text={ok} type="success"/>}
   {!enabled?<section className="card p-6"><div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600"><UtensilsCrossed className="h-5 w-5"/></span><div><h2 className="text-lg font-semibold">Mesas y reservas está desactivado</h2><p className="mt-1 text-sm leading-6 text-[#8d92aa]">Activa <strong>Mesas y reservas</strong> en Configuración → Ventas y entrega para administrar áreas y mesas.</p><a className="btn-secondary mt-4 inline-flex" href="/settings/store?tab=sales">Ir a Ventas y entrega</a></div></div></section>:<>
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
     <div className="card p-5 sm:p-6">
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-600"><UtensilsCrossed className="h-5 w-5"/></span><div><p className="section-kicker">Organización</p><h2 className="text-xl font-semibold">Áreas del negocio</h2><p className="mt-1 text-sm text-[#8d92aa]">Crea cada área una sola vez y organiza dentro todas sus mesas.</p></div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]"><div><label className="label">Nombre del área</label><input className="field" placeholder="Ej.: Salón principal, Terraza, VIP" value={newArea} onChange={e=>setNewArea(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void addArea()}}}/></div><div className="flex items-end"><button type="button" disabled={busy||!newArea.trim()} onClick={addArea} className="btn-primary w-full justify-center"><Plus className="h-4 w-4"/>Agregar área</button></div></div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">{activeAreas.length?activeAreas.map(area=><article key={area.id} className="rounded-2xl border border-[#e7ebe9] bg-[#fbfcfc] p-4"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><label className="label">Área</label><input className="field" value={area.name} onChange={e=>setAreas(v=>v.map(x=>x.id===area.id?{...x,name:e.target.value}:x))}/><div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#7f8799]"><span className="rounded-full bg-white px-2.5 py-1">{area.table_count||0} mesas</span><span className="rounded-full bg-white px-2.5 py-1">{area.capacity||0} personas</span></div></div><div className="flex gap-1.5 pt-6"><button type="button" disabled={busy||!area.name.trim()} onClick={()=>saveArea(area)} className="btn-secondary px-2.5" title="Guardar área"><Save className="h-4 w-4"/></button><button type="button" disabled={busy||(area.table_count||0)>0} onClick={()=>archiveArea(area)} className="btn-danger px-2.5" title={(area.table_count||0)>0?'Mueve o archiva sus mesas primero':'Archivar área'}><Trash2 className="h-4 w-4"/></button></div></div></article>):<div className="md:col-span-2 rounded-2xl border border-dashed border-[#dfe4e6] p-6 text-center text-sm text-[#8d92aa]">Crea tu primera área para comenzar a organizar las mesas.</div>}</div>
     </div>
     <aside className="card p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Clock3 className="h-5 w-5"/></span><div><p className="section-kicker">Reservas</p><h3 className="font-semibold">Duración de la reserva</h3></div></div><p className="mt-3 text-xs leading-5 text-[#8d92aa]">Define el tiempo estándar que ocupará una mesa para calcular la disponibilidad.</p><select className="field mt-4" value={config?.reservation_duration_minutes||90} disabled={busy} onChange={e=>void saveDuration(Number(e.target.value))}><option value={60}>60 minutos</option><option value={90}>90 minutos</option><option value={120}>120 minutos</option><option value={180}>180 minutos</option></select></aside>
    </section>

    <section className="card p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="section-kicker">Nueva mesa</p><h2 className="mt-1 text-lg font-semibold">Agregar mesa</h2><p className="mt-1 text-sm text-[#8d92aa]">Selecciona el área y registra la mesa sin repetir el nombre del área.</p></div><span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700"><UsersRound className="h-4 w-4"/>{activeTables.length} mesas · {activeTables.reduce((sum,row)=>sum+Number(row.capacity||0),0)} personas</span></div>
     <div className="mt-5 grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_150px_auto]"><div><label className="label">Área *</label><select className="field" value={newTable.area_id} onChange={e=>setNewTable({...newTable,area_id:e.target.value})}><option value="">Selecciona un área</option>{activeAreas.map(area=><option key={area.id} value={area.id}>{area.name}</option>)}</select></div><div><label className="label">Nombre de la mesa</label><input className="field" placeholder="Ej.: Mesa 1" value={newTable.name} onChange={e=>setNewTable({...newTable,name:e.target.value})}/></div><div><label className="label">Capacidad</label><input className="field" type="number" min="1" max="50" value={newTable.capacity} onChange={e=>setNewTable({...newTable,capacity:Number(e.target.value)})}/></div><div className="flex items-end"><button type="button" disabled={busy||!newTable.area_id||!newTable.name.trim()} onClick={addTable} className="btn-primary w-full justify-center"><Plus className="h-4 w-4"/>Agregar mesa</button></div></div>
    </section>

    <section className="card overflow-hidden"><div className="border-b border-[#edf0f5] p-5"><p className="section-kicker">Mesas activas</p><h2 className="mt-1 text-lg font-semibold">Administrar mesas por área</h2></div>
     <div className="divide-y divide-[#edf0f5]">{activeTables.length?activeAreas.map(area=>{const rows=activeTables.filter(row=>row.area_id===area.id);if(!rows.length)return null;return <div key={area.id} className="p-4 sm:p-5"><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-semibold text-ink-900">{area.name}</h3><p className="text-xs text-[#8d92aa]">{rows.length} {rows.length===1?'mesa':'mesas'} · {rows.reduce((sum,row)=>sum+Number(row.capacity||0),0)} personas</p></div></div><div className="space-y-2">{rows.map(row=><div key={row.id} className="grid items-end gap-3 rounded-2xl border border-[#edf0f5] bg-[#fbfcfc] p-3 md:grid-cols-[200px_minmax(0,1fr)_140px_auto]"><div><label className="label">Área</label><select className="field" value={row.area_id} onChange={e=>setTables(v=>v.map(x=>x.id===row.id?{...x,area_id:e.target.value,area_name:activeAreas.find(a=>a.id===e.target.value)?.name||x.area_name}:x))}>{activeAreas.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div><div><label className="label">Mesa</label><input className="field" value={row.name} onChange={e=>setTables(v=>v.map(x=>x.id===row.id?{...x,name:e.target.value}:x))}/></div><div><label className="label">Capacidad</label><input className="field" type="number" min="1" max="50" value={row.capacity} onChange={e=>setTables(v=>v.map(x=>x.id===row.id?{...x,capacity:Number(e.target.value)}:x))}/></div><div className="flex gap-2"><button type="button" disabled={busy||!row.name.trim()} className="btn-secondary px-3" onClick={()=>saveTable(row)}><Save className="h-4 w-4"/>Guardar</button><button type="button" disabled={busy} className="btn-danger px-3" onClick={()=>archiveTable(row)} title="Archivar mesa"><Trash2 className="h-4 w-4"/></button></div></div>)}</div></div>}):<div className="p-10 text-center text-sm text-[#8d92aa]">Agrega tu primera mesa para aceptar reservas.</div>}</div>
    </section>
   </>}
  </div>}
 </StoreShell>
}
