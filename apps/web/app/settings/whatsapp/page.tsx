'use client'

import {useEffect,useRef,useState} from 'react'
import StoreShell,{StoreSelector} from '@/components/store-shell'
import {api} from '@/lib/api'
import {Alert,PageEmpty} from '@/components/ui'
import {QRCodeSVG} from 'qrcode.react'
import {CheckCircle2,Clock3,MessageCircleMore,RefreshCw,ShieldCheck,Smartphone,Unplug} from 'lucide-react'

export default function WhatsApp(){
  const[store,setStore]=useState('')
  const[state,setState]=useState<any>({status:'disconnected'})
  const[error,setError]=useState('')
  const[busy,setBusy]=useState(false)
  const timer=useRef<any>(null)
  const refresh=async()=>{if(!store)return;try{setState(await api(`/whatsapp/${store}/status`));setError('')}catch(e:any){setError(e.message)}}
  useEffect(()=>{if(!store)return;refresh();timer.current=setInterval(refresh,2500);return()=>clearInterval(timer.current)},[store])
  const connect=async()=>{setBusy(true);setError('');try{await api(`/whatsapp/${store}/connect`,{method:'POST'});setTimeout(refresh,500)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  const disconnect=async()=>{if(!confirm('¿Desvincular WhatsApp de esta tienda? Tendrás que vincular el dispositivo nuevamente.'))return;setBusy(true);try{await api(`/whatsapp/${store}/disconnect`,{method:'POST'});await refresh()}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  const connected=state.connected||state.status==='connected'
  return <StoreShell title="WhatsApp" subtitle="Conexión directa de tu comercio con WAMERCIO">
    <div className="mb-5"><StoreSelector value={store} onChange={setStore}/></div>
    {!store?<PageEmpty title="Selecciona una tienda" detail="Cada tienda mantiene su propio dispositivo vinculado."/>:<div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="card p-6">{error&&<Alert text={error}/>}<div className="flex flex-col items-center py-4 text-center">
        <div className={`grid h-16 w-16 place-items-center rounded-xl ${connected?'bg-emerald-50 text-emerald-600':'bg-[#f1f2f6] text-[#8d92aa]'}`}><MessageCircleMore className="h-8 w-8"/></div>
        <h2 className="mt-4 text-xl font-bold">{connected?'WhatsApp conectado':'Conecta WhatsApp'}</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-[#8d92aa]">{connected?`Dispositivo WAMERCIO activo${state.phone?` con +${state.phone}`:''}. Ya puedes recibir y responder conversaciones desde el panel.`:'Abre WhatsApp → Dispositivos vinculados → Vincular un dispositivo y escanea este código QR.'}</p>
        {state.qr&&!connected?<div className="mt-6 rounded-lg border border-[#e9ebf2] bg-white p-5"><QRCodeSVG value={state.qr} size={260} level="M" includeMargin/><p className="mt-3 text-xs text-[#a2a6b8]">El código se renueva automáticamente mientras esperas la vinculación.</p></div>:null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">{connected?<><button disabled={busy} className="btn-secondary" onClick={refresh}><RefreshCw className="h-4 w-4"/> Actualizar</button><button disabled={busy} className="btn-danger" onClick={disconnect}><Unplug className="h-4 w-4"/> Desvincular</button></>:<button disabled={busy||state.status==='starting'} className="btn-primary" onClick={connect}><Smartphone className="h-4 w-4"/>{busy?'Iniciando...':state.status==='qr'?'Renovar código':'Generar QR'}</button>}</div>
        {connected&&<div className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4"/> Sesión lista</div>}
        {connected&&<p className="mt-4 max-w-lg text-xs leading-5 text-[#8696a0]">Si el teléfono todavía muestra un nombre anterior para este dispositivo, desvincúlalo y vuelve a vincularlo una sola vez para aplicar la identidad <strong className="text-[#3b4a54]">WAMERCIO</strong>.</p>}
      </div></div>
      <div className="space-y-5">
        <div className="card p-5"><ShieldCheck className="h-6 w-6 text-brand-600"/><h3 className="mt-3 font-bold">Dispositivo WAMERCIO</h3><p className="mt-2 text-sm leading-6 text-[#8d92aa]">Las nuevas vinculaciones se registran en WhatsApp con el nombre <strong className="text-[#3b4a54]">WAMERCIO</strong>. La sesión se mantiene activa automáticamente mientras tu servicio esté en línea.</p></div>
        <div className="card p-5"><Clock3 className="h-6 w-6 text-brand-600"/><h3 className="mt-3 font-bold">Actividad de sesión</h3><p className="mt-2 text-sm leading-6 text-[#8d92aa]">WAMERCIO mantiene la conexión, supervisa el keep-alive y actualiza la actividad del dispositivo sin mostrar tu cuenta permanentemente “en línea”.</p></div>
        <div className="card p-5"><h3 className="font-bold">Estado</h3><div className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><span className="text-[#8d92aa]">Dispositivo</span><strong>WAMERCIO</strong></div><div className="flex justify-between"><span className="text-[#8d92aa]">Conexión</span><strong className="capitalize">{connected?'Conectado':state.status||'desconectado'}</strong></div><div className="flex justify-between"><span className="text-[#8d92aa]">Actividad</span><strong className={connected?'text-emerald-600':'text-[#8d92aa]'}>{connected?'Supervisada':'Sin sesión'}</strong></div></div></div>
      </div>
    </div>}
  </StoreShell>
}
