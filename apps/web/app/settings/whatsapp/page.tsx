'use client'

import {useEffect,useRef,useState} from 'react'
import StoreShell,{StoreSelector} from '@/components/store-shell'
import SettingsNav from '@/components/settings-nav'
import {api} from '@/lib/api'
import {phoneDisplay} from '@/components/phone-input'
import {Alert,PageEmpty} from '@/components/ui'
import {QRCodeSVG} from 'qrcode.react'
import {CalendarRange,CheckCircle2,Clock3,Download,Link2,RefreshCw,Save,ShieldCheck,Smartphone,Unplug,UserRound} from 'lucide-react'

export default function Connection(){
  const[store,setStore]=useState('')
  const[state,setState]=useState<any>({status:'disconnected'})
  const[error,setError]=useState('')
  const[busy,setBusy]=useState(false)
  const[sync,setSync]=useState<any>({mode:'manual',from:'',to:'',status:'idle',last_synced_at:null,error:''})
  const[syncBusy,setSyncBusy]=useState(false)
  const[syncMsg,setSyncMsg]=useState('')
  const timer=useRef<any>(null)
  const refresh=async()=>{if(!store)return;try{setState(await api(`/whatsapp/${store}/status`));setError('')}catch(e:any){setError(e.message)}}
  const loadSync=async()=>{if(!store)return;try{setSync(await api(`/whatsapp/${store}/sync-settings`))}catch(e:any){setError(e.message)}}
  useEffect(()=>{if(!store)return;refresh();loadSync();timer.current=setInterval(()=>{refresh();loadSync()},4000);return()=>clearInterval(timer.current)},[store])
  const saveSync=async()=>{if(!store)return;setSyncBusy(true);setSyncMsg('');setError('');try{const out:any=await api(`/whatsapp/${store}/sync-settings`,{method:'PUT',body:JSON.stringify({mode:sync.mode,from:sync.from,to:sync.to})});setSync((v:any)=>({...v,...out}));setSyncMsg('Configuración de sincronización guardada.')}catch(e:any){setError(e.message)}finally{setSyncBusy(false)}}
  const syncNow=async()=>{if(!store)return;setSyncBusy(true);setSyncMsg('');setError('');try{await api(`/whatsapp/${store}/sync`,{method:'POST',body:JSON.stringify({from:sync.from,to:sync.to})});setSync((v:any)=>({...v,status:'running',error:''}));setSyncMsg('Sincronización solicitada. Los mensajes del rango aparecerán progresivamente.')}catch(e:any){setError(e.message)}finally{setSyncBusy(false)}}
  const connect=async()=>{setBusy(true);setError('');try{await api(`/whatsapp/${store}/connect`,{method:'POST'});setTimeout(refresh,500)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  const disconnect=async()=>{if(!confirm('¿Desvincular esta conexión? Tendrás que vincular el dispositivo nuevamente.'))return;setBusy(true);try{await api(`/whatsapp/${store}/disconnect`,{method:'POST'});await refresh()}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  const connected=state.connected===true||state.status==='connected'
  const linked=state.linked===true||connected
  const reconnecting=linked&&!connected

  return <StoreShell title="Ajustes" subtitle="Configura tu comercio sin opciones innecesarias" context={<StoreSelector value={store} onChange={setStore}/>}> 
    {!store?<PageEmpty title="Selecciona una tienda" detail="Cada tienda mantiene su propia conexión de mensajería."/>:<div className="grid gap-5 xl:grid-cols-[190px_minmax(0,1fr)_330px]">
      <SettingsNav active="connection"/>
      <div className="space-y-5">
      <section className="card p-6 sm:p-8">{error&&<Alert text={error}/>}<div className="flex min-h-[390px] flex-col items-center justify-center text-center">
        <div className={`grid h-16 w-16 place-items-center overflow-hidden rounded-3xl ${connected?'bg-emerald-50 text-emerald-600':reconnecting?'bg-amber-50 text-amber-600':'bg-[#f1f2f6] text-[#8d92aa]'}`}>{linked&&state.profile_picture_url?<img src={state.profile_picture_url} alt={state.whatsapp_name||'Perfil de WhatsApp'} className="h-full w-full object-cover"/>:linked?<UserRound className="h-8 w-8"/>:<Link2 className="h-8 w-8"/>}</div>
        <p className="section-kicker mt-5">Conexión</p>
        <h2 className="mt-1 text-2xl font-semibold text-ink-900">{linked?(state.whatsapp_name||'WhatsApp vinculado'):'Conecta tu cuenta'}</h2>
        {linked&&state.phone?<div className="mt-1 text-sm font-semibold text-brand-700">{phoneDisplay(state.phone)}</div>:null}
        <p className="mt-2 max-w-lg text-sm leading-6 text-[#8d92aa]">{connected?'Dispositivo WAMERCIO activo. Ya puedes atender mensajes desde la sección WhatsApp.':reconnecting?'El dispositivo continúa vinculado. WAMERCIO está restableciendo la conexión automáticamente; no necesitas escanear otro código QR.':'Abre WhatsApp → Dispositivos vinculados → Vincular un dispositivo y escanea el código QR.'}</p>
        {state.qr&&!linked?<div className="mt-6 rounded-3xl border border-[#e9ebf2] bg-white p-5 shadow-soft"><QRCodeSVG value={state.qr} size={250} level="M" includeMargin/><p className="mt-3 text-xs text-[#a2a6b8]">El código se renueva automáticamente mientras esperas la vinculación.</p></div>:null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">{linked?<><button disabled={busy} className="btn-secondary" onClick={refresh}><RefreshCw className="h-4 w-4"/> Actualizar</button><button disabled={busy} className="btn-danger" onClick={disconnect}><Unplug className="h-4 w-4"/> Desvincular</button></>:<button disabled={busy||state.status==='starting'} className="btn-primary" onClick={connect}><Smartphone className="h-4 w-4"/>{busy?'Iniciando...':state.status==='qr'?'Renovar código':'Generar QR'}</button>}</div>
        {linked&&<div className={`mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${connected?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}><CheckCircle2 className="h-4 w-4"/> {connected?'Sesión lista':'Vinculado · Reconectando'}</div>}
      </div></section>
      <section className="card p-6 sm:p-7">
        <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600"><CalendarRange className="h-5 w-5"/></span><div><p className="section-kicker">Historial</p><h2 className="section-title">Sincronización de mensajes</h2><p className="section-copy">Controla cuánto historial se importa. Los mensajes nuevos continúan llegando en tiempo real sin importar esta configuración.</p></div></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><button type="button" onClick={()=>setSync((v:any)=>({...v,mode:'manual'}))} className={`rounded-2xl border p-4 text-left ${sync.mode==='manual'?'border-brand-400 bg-brand-50':'border-slate-200 bg-white'}`}><strong className="text-sm">Manual</strong><p className="mt-1 text-xs leading-5 text-[#8d92aa]">No importa mensajes pasados al vincular. Tú eliges cuándo sincronizar.</p></button><button type="button" onClick={()=>setSync((v:any)=>({...v,mode:'auto'}))} className={`rounded-2xl border p-4 text-left ${sync.mode==='auto'||sync.mode==='automatic'?'border-brand-400 bg-brand-50':'border-slate-200 bg-white'}`}><strong className="text-sm">Automática</strong><p className="mt-1 text-xs leading-5 text-[#8d92aa]">Importa únicamente historial comprendido dentro del rango configurado.</p></button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><label className="label">Fecha desde</label><input type="date" className="field" value={sync.from||''} onChange={e=>setSync((v:any)=>({...v,from:e.target.value}))}/></div><div><label className="label">Fecha hasta</label><input type="date" className="field" value={sync.to||''} onChange={e=>setSync((v:any)=>({...v,to:e.target.value}))}/></div></div>
        {sync.error?<div className="mt-4"><Alert text={sync.error}/></div>:null}{syncMsg?<div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700">{syncMsg}</div>:null}
        <div className="mt-5 flex flex-wrap items-center gap-2"><button type="button" disabled={syncBusy} className="btn-secondary" onClick={saveSync}><Save className="h-4 w-4"/> Guardar</button><button type="button" disabled={syncBusy||!linked} className="btn-primary" onClick={syncNow}><Download className="h-4 w-4"/> {sync.status==='running'?'Sincronizando...':'Sincronizar ahora'}</button><span className="ml-auto text-xs text-[#8d92aa]">{sync.last_synced_at?`Última sincronización: ${new Date(sync.last_synced_at).toLocaleString('es-DO')}`:'Sin sincronización manual previa'}</span></div>
      </section>
      </div>
      <aside className="space-y-4 xl:sticky xl:top-[82px] xl:self-start"><div className="card p-5"><ShieldCheck className="h-6 w-6 text-brand-600"/><h3 className="mt-3 font-semibold">Dispositivo WAMERCIO</h3><p className="mt-2 text-sm leading-6 text-[#8d92aa]">Las nuevas vinculaciones se registran con el nombre <strong className="text-[#3b4a54]">WAMERCIO</strong> y se mantienen supervisadas mientras el servicio esté en línea.</p></div><div className="card p-5"><Clock3 className="h-6 w-6 text-brand-600"/><h3 className="mt-3 font-semibold">Estado de la conexión</h3><div className="mt-3 space-y-2 text-sm">{linked&&<><div className="flex justify-between gap-4"><span className="text-[#8d92aa]">Nombre</span><strong className="truncate text-right">{state.whatsapp_name||'WhatsApp'}</strong></div><div className="flex justify-between gap-4"><span className="text-[#8d92aa]">WhatsApp</span><strong>{state.phone?phoneDisplay(state.phone):'—'}</strong></div></>}<div className="flex justify-between"><span className="text-[#8d92aa]">Dispositivo</span><strong>WAMERCIO</strong></div><div className="flex justify-between"><span className="text-[#8d92aa]">Conexión</span><strong className="capitalize">{connected?'Conectado':reconnecting?'Reconectando':state.status||'desconectado'}</strong></div><div className="flex justify-between"><span className="text-[#8d92aa]">Actividad</span><strong className={connected?'text-emerald-600':linked?'text-amber-600':'text-[#8d92aa]'}>{connected?'Supervisada':linked?'Vinculado':'Sin sesión'}</strong></div></div></div></aside>
    </div>}
  </StoreShell>
}
