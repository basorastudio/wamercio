'use client'

import {useEffect,useRef,useState} from 'react'
import StoreShell,{StoreSelector} from '@/components/store-shell'
import SettingsNav from '@/components/settings-nav'
import {api} from '@/lib/api'
import {Alert,PageEmpty} from '@/components/ui'
import {QRCodeSVG} from 'qrcode.react'
import {CheckCircle2,Clock3,Link2,RefreshCw,ShieldCheck,Smartphone,Unplug} from 'lucide-react'

export default function Connection(){
  const[store,setStore]=useState('')
  const[state,setState]=useState<any>({status:'disconnected'})
  const[error,setError]=useState('')
  const[busy,setBusy]=useState(false)
  const timer=useRef<any>(null)
  const refresh=async()=>{if(!store)return;try{setState(await api(`/whatsapp/${store}/status`));setError('')}catch(e:any){setError(e.message)}}
  useEffect(()=>{if(!store)return;refresh();timer.current=setInterval(refresh,2500);return()=>clearInterval(timer.current)},[store])
  const connect=async()=>{setBusy(true);setError('');try{await api(`/whatsapp/${store}/connect`,{method:'POST'});setTimeout(refresh,500)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  const disconnect=async()=>{if(!confirm('¿Desvincular esta conexión? Tendrás que vincular el dispositivo nuevamente.'))return;setBusy(true);try{await api(`/whatsapp/${store}/disconnect`,{method:'POST'});await refresh()}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  const connected=state.connected===true||state.status==='connected'
  const linked=state.linked===true||connected
  const reconnecting=linked&&!connected

  return <StoreShell title="Ajustes" subtitle="Configura tu comercio sin opciones innecesarias" context={<StoreSelector value={store} onChange={setStore}/>}> 
    {!store?<PageEmpty title="Selecciona una tienda" detail="Cada tienda mantiene su propia conexión de mensajería."/>:<div className="grid gap-5 xl:grid-cols-[190px_minmax(0,1fr)_330px]">
      <SettingsNav active="connection"/>
      <section className="card p-6 sm:p-8">{error&&<Alert text={error}/>}<div className="flex min-h-[440px] flex-col items-center justify-center text-center">
        <div className={`grid h-16 w-16 place-items-center rounded-3xl ${connected?'bg-emerald-50 text-emerald-600':reconnecting?'bg-amber-50 text-amber-600':'bg-[#f1f2f6] text-[#8d92aa]'}`}><Link2 className="h-8 w-8"/></div>
        <p className="section-kicker mt-5">Conexión</p>
        <h2 className="mt-1 text-2xl font-semibold text-ink-900">{connected?'Conexión activa':reconnecting?'WhatsApp vinculado':'Conecta tu cuenta'}</h2>
        <p className="mt-2 max-w-lg text-sm leading-6 text-[#8d92aa]">{connected?`Dispositivo WAMERCIO activo${state.phone?` con +${state.phone}`:''}. Ya puedes atender mensajes desde la sección WhatsApp.`:reconnecting?'El dispositivo continúa vinculado. WAMERCIO está restableciendo la conexión automáticamente; no necesitas escanear otro código QR.':'Abre WhatsApp → Dispositivos vinculados → Vincular un dispositivo y escanea el código QR.'}</p>
        {state.qr&&!linked?<div className="mt-6 rounded-3xl border border-[#e9ebf2] bg-white p-5 shadow-soft"><QRCodeSVG value={state.qr} size={250} level="M" includeMargin/><p className="mt-3 text-xs text-[#a2a6b8]">El código se renueva automáticamente mientras esperas la vinculación.</p></div>:null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">{linked?<><button disabled={busy} className="btn-secondary" onClick={refresh}><RefreshCw className="h-4 w-4"/> Actualizar</button><button disabled={busy} className="btn-danger" onClick={disconnect}><Unplug className="h-4 w-4"/> Desvincular</button></>:<button disabled={busy||state.status==='starting'} className="btn-primary" onClick={connect}><Smartphone className="h-4 w-4"/>{busy?'Iniciando...':state.status==='qr'?'Renovar código':'Generar QR'}</button>}</div>
        {linked&&<div className={`mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${connected?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}><CheckCircle2 className="h-4 w-4"/> {connected?'Sesión lista':'Vinculado · Reconectando'}</div>}
      </div></section>
      <aside className="space-y-4 xl:sticky xl:top-[82px] xl:self-start"><div className="card p-5"><ShieldCheck className="h-6 w-6 text-brand-600"/><h3 className="mt-3 font-semibold">Dispositivo WAMERCIO</h3><p className="mt-2 text-sm leading-6 text-[#8d92aa]">Las nuevas vinculaciones se registran con el nombre <strong className="text-[#3b4a54]">WAMERCIO</strong> y se mantienen supervisadas mientras el servicio esté en línea.</p></div><div className="card p-5"><Clock3 className="h-6 w-6 text-brand-600"/><h3 className="mt-3 font-semibold">Estado de la conexión</h3><div className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><span className="text-[#8d92aa]">Dispositivo</span><strong>WAMERCIO</strong></div><div className="flex justify-between"><span className="text-[#8d92aa]">Conexión</span><strong className="capitalize">{connected?'Conectado':reconnecting?'Reconectando':state.status||'desconectado'}</strong></div><div className="flex justify-between"><span className="text-[#8d92aa]">Actividad</span><strong className={connected?'text-emerald-600':linked?'text-amber-600':'text-[#8d92aa]'}>{connected?'Supervisada':linked?'Vinculado':'Sin sesión'}</strong></div></div></div></aside>
    </div>}
  </StoreShell>
}
