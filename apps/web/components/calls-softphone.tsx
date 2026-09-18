'use client'

import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {Alert,Loading,Modal,Status} from '@/components/ui'
import {api,dateTime} from '@/lib/api'
import {openWamercioCallAudio,type WamercioBrowserCall} from '@/lib/calls-webrtc'
import {
  ArrowRightLeft,Delete,ExternalLink,FileText,Mic,MicOff,Pause,PhoneCall,PhoneIncoming,PhoneOff,Play,Radio,UserRound
} from 'lucide-react'

const terminalStatuses=new Set(['completed','missed','rejected','failed'])
const keypad=['1','2','3','4','5','6','7','8','9','*','0','#']

export type SoftphoneTarget={phone?:string;display_name?:string}

export default function CallsSoftphone({
  open,
  onClose,
  storeId,
  target,
  title='Softphone',
  subtitle='Realiza y administra llamadas WhatsApp directamente desde esta pantalla, siguiendo el mismo flujo operativo de WAMERCIO Calls.'
}:{
  open:boolean
  onClose:()=>void
  storeId:string
  target?:SoftphoneTarget|null
  title?:string
  subtitle?:string
}){
  const[settings,setSettings]=useState<any>(null)
  const[rows,setRows]=useState<any[]>([])
  const[staff,setStaff]=useState<any[]>([])
  const[loading,setLoading]=useState(false)
  const[busy,setBusy]=useState(false)
  const[error,setError]=useState('')
  const[form,setForm]=useState({phone:'',display_name:''})
  const[transferFor,setTransferFor]=useState<any>(null)
  const[transferStaff,setTransferStaff]=useState('')
  const[audioCallId,setAudioCallId]=useState('')
  const[audioBusy,setAudioBusy]=useState('')
  const browserCall=useRef<WamercioBrowserCall|null>(null)

  const closeAudio=useCallback(()=>{
    browserCall.current?.close()
    browserCall.current=null
    setAudioCallId('')
  },[])

  const load=useCallback((silent=false)=>{
    if(!open||!storeId)return
    if(!silent)setLoading(true)
    Promise.all([
      api(`/calls/settings?store_id=${storeId}`),
      api<any[]>(`/calls?store_id=${storeId}`),
      api<any[]>(`/staff?store_id=${storeId}`),
    ]).then(([s,c,u])=>{
      setSettings(s)
      setRows(c)
      setStaff(u.filter((x:any)=>x.status==='active'&&x.role!=='delivery'))
      setError('')
    }).catch((e:any)=>setError(e.message||'No se pudo cargar el softphone.')).finally(()=>{
      if(!silent)setLoading(false)
    })
  },[open,storeId])

  useEffect(()=>{
    if(!open){
      setSettings(null)
      setRows([])
      setTransferFor(null)
      setTransferStaff('')
      closeAudio()
      return
    }
    setForm({phone:target?.phone||'',display_name:target?.display_name||''})
    load()
    const timer=setInterval(()=>load(true),2500)
    return ()=>clearInterval(timer)
  },[open,storeId,target?.phone,target?.display_name,load,closeAudio])

  useEffect(()=>()=>closeAudio(),[closeAudio])

  useEffect(()=>{
    if(!audioCallId)return
    const row=rows.find(x=>x.id===audioCallId)
    if(row&&terminalStatuses.has(row.status))closeAudio()
  },[rows,audioCallId,closeAudio])

  const currentCall=useMemo(()=>rows.find(x=>['ringing','connecting','active','held','transferred'].includes(x.status))||null,[rows])

  const connectAudio=async(id:string)=>{
    setAudioBusy(id)
    setError('')
    try{
      if(browserCall.current?.id===id)return
      closeAudio()
      const bc=await openWamercioCallAudio(id)
      browserCall.current=bc
      setAudioCallId(id)
    }catch(e:any){
      setError(e.message||'No se pudo conectar el audio del navegador.')
    }finally{
      setAudioBusy('')
    }
  }

  const startCall=async(e?:React.FormEvent)=>{
    e?.preventDefault()
    if(!storeId||!form.phone.trim())return
    setBusy(true)
    setError('')
    try{
      const created=await api<any>('/calls',{method:'POST',body:JSON.stringify({store_id:storeId,phone:form.phone.trim(),display_name:form.display_name.trim()})})
      await connectAudio(created.id)
      load(true)
    }catch(e:any){
      setError(e.message||'No se pudo iniciar la llamada.')
    }finally{
      setBusy(false)
    }
  }

  const action=async(x:any,a:string,assigned_staff_id='')=>{
    setError('')
    try{
      await api(`/calls/${x.id}`,{method:'PATCH',body:JSON.stringify({action:a,assigned_staff_id})})
      if(a==='answer')await connectAudio(x.id)
      if(a==='hangup'||a==='reject'||a==='transfer')closeAudio()
      setTransferFor(null)
      setTransferStaff('')
      setTimeout(()=>load(true),350)
    }catch(e:any){
      setError(e.message||'No se pudo ejecutar la acción de llamada.')
    }
  }

  const appendDigit=(digit:string)=>setForm(v=>({
    ...v,
    phone:`${v.phone||''}${digit}`,
  }))

  const backspace=()=>setForm(v=>({
    ...v,
    phone:(v.phone||'').slice(0,-1),
  }))

  return <>
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} wide>
      {!storeId?<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Selecciona primero una tienda para utilizar el softphone.</div>:loading&&!settings?<Loading/>:<div className="space-y-4">
        {error&&<Alert text={error}/>}
        {settings&&<div className="grid gap-3 lg:grid-cols-[1.05fr_.95fr]">
          <section className="rounded-[28px] border border-[#e8ebef] bg-[#fbfcfd] p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.14em] text-brand-600">Softphone</p>
                <h3 className="mt-1 text-lg font-semibold text-ink-900">Marcador y contacto</h3>
                <p className="mt-1 text-xs leading-5 text-[#8d92aa]">Usa el número del chat o de la ficha del cliente y marca sin salir de la pantalla actual.</p>
              </div>
              <a href="/calls" className="inline-flex items-center gap-2 rounded-2xl border border-[#e8ebef] bg-white px-3 py-2 text-xs font-semibold text-[#556078] transition hover:border-brand-200 hover:text-brand-700">
                <ExternalLink className="h-3.5 w-3.5"/>Centro de llamadas
              </a>
            </div>

            {target?.display_name&&<div className="mt-4 flex items-center gap-3 rounded-2xl border border-[#e4efe9] bg-[#f2fbf8] p-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-brand-600 shadow-sm"><UserRound className="h-5 w-5"/></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink-900">{target.display_name}</div>
                <div className="truncate text-xs text-[#778099]">{target.phone||'Sin número visible'}</div>
              </div>
              <button type="button" onClick={()=>setForm({phone:target.phone||'',display_name:target.display_name||''})} className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-brand-700 shadow-sm transition hover:bg-brand-50">Usar</button>
            </div>}

            <form onSubmit={startCall} className="mt-4 space-y-3">
              <div>
                <label className="label">Nombre del contacto</label>
                <input className="field" value={form.display_name} onChange={e=>setForm({...form,display_name:e.target.value})} placeholder="Ej. Alfredo Perez Basora"/>
              </div>
              <div>
                <label className="label">WhatsApp *</label>
                <input required inputMode="tel" className="field text-lg font-semibold tracking-[0.02em]" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="18091234567"/>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                {keypad.map(key=><button key={key} type="button" onClick={()=>appendDigit(key)} className="rounded-2xl border border-[#e7ebf1] bg-white px-3 py-3 text-center text-lg font-semibold text-[#2d3348] transition hover:border-brand-200 hover:bg-brand-50">{key}</button>)}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button type="button" onClick={backspace} className="btn-secondary"><Delete className="h-4 w-4"/>Borrar</button>
                <button disabled={!settings?.is_active||busy||!form.phone.trim()} type="submit" className="btn-primary flex-1 sm:flex-none"><PhoneCall className="h-4 w-4"/>{busy?'Llamando...':'Llamar ahora'}</button>
              </div>
            </form>
          </section>

          <section className="rounded-[28px] border border-[#e8ebef] bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.14em] text-brand-600">Estado</p>
                <h3 className="mt-1 text-lg font-semibold text-ink-900">Llamada activa y recientes</h3>
              </div>
              {audioCallId&&<button className="btn-secondary text-rose-700" onClick={closeAudio}><MicOff className="h-4 w-4"/>Desconectar audio</button>}
            </div>

            <div className="mt-4 space-y-3">
              <div className={`rounded-2xl p-3 text-xs leading-5 ${settings.engine_ready?'bg-emerald-50 text-emerald-800':'bg-amber-50 text-amber-800'}`}>
                <div className="flex items-center gap-2 font-semibold"><Radio className="h-4 w-4"/>{settings.engine_ready?'Motor integrado listo':'Motor integrado esperando sesión'}</div>
                <p className="mt-1">{settings.session_connected===false?'Conecta primero la sesión WhatsApp del negocio para poder llamar.':'El audio del navegador requiere HTTPS y el rango UDP WebRTC configurado en el servidor.'}</p>
                {settings.is_active===false&&<p className="mt-2 font-semibold">Activa WAMERCIO Calls en la configuración del negocio.</p>}
              </div>

              {currentCall?<div className="rounded-3xl border border-[#dfe5ea] bg-[#f8fafb] p-4">
                <div className="flex items-start gap-3">
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${['failed','missed','rejected'].includes(currentCall.status)?'bg-rose-50 text-rose-600':'bg-brand-50 text-brand-600'}`}>
                    {['failed','missed','rejected'].includes(currentCall.status)?<PhoneOff className="h-5 w-5"/>:<PhoneCall className="h-5 w-5"/>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-ink-900">{currentCall.display_name||currentCall.phone||'Contacto WhatsApp'}</strong><Status value={currentCall.status}/>{audioCallId===currentCall.id&&<span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Audio conectado</span>}</div>
                    <div className="mt-1 text-[11px] text-[#9aa0b4]">{currentCall.direction==='out'?'Saliente':'Entrante'} · {dateTime(currentCall.started_at)} · {currentCall.duration_seconds||0}s{currentCall.assigned_staff_name?` · ${currentCall.assigned_staff_name}`:''}</div>
                    {(currentCall.recording_url||currentCall.transcript)&&<div className="mt-2 flex flex-wrap gap-2">{currentCall.recording_url&&<a href={currentCall.recording_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700"><ExternalLink className="h-3.5 w-3.5"/>Grabación</a>}{currentCall.transcript&&<span title={currentCall.transcript} className="inline-flex max-w-[360px] items-center gap-1 truncate text-[11px] text-[#6f758a]"><FileText className="h-3.5 w-3.5 shrink-0"/>{currentCall.transcript}</span>}</div>}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {currentCall.direction==='in'&&currentCall.status==='ringing'&&<>
                    <button className="btn-primary" onClick={()=>action(currentCall,'answer')}><PhoneIncoming className="h-4 w-4"/>Contestar</button>
                    <button className="btn-secondary text-rose-700" onClick={()=>action(currentCall,'reject')}><PhoneOff className="h-4 w-4"/>Rechazar</button>
                  </>}
                  {['ringing','connecting','active','held','transferred'].includes(currentCall.status)&&audioCallId!==currentCall.id&&<button disabled={audioBusy===currentCall.id} className="btn-secondary" onClick={()=>connectAudio(currentCall.id)}><Mic className="h-4 w-4"/>{audioBusy===currentCall.id?'Conectando...':'Conectar audio'}</button>}
                  {currentCall.status==='active'&&<button className="btn-secondary" onClick={()=>action(currentCall,'hold')}><Pause className="h-4 w-4"/>Espera</button>}
                  {currentCall.status==='held'&&<button className="btn-secondary" onClick={()=>action(currentCall,'resume')}><Play className="h-4 w-4"/>Reanudar</button>}
                  {['active','held'].includes(currentCall.status)&&<button className="btn-secondary" onClick={()=>setTransferFor(currentCall)}><ArrowRightLeft className="h-4 w-4"/>Transferir</button>}
                  {['active','held','connecting','ringing','transferred'].includes(currentCall.status)&&<button className="btn-secondary text-rose-700" onClick={()=>action(currentCall,'hangup')}><PhoneOff className="h-4 w-4"/>Colgar</button>}
                </div>
              </div>:<div className="rounded-3xl border border-dashed border-[#dce2e8] bg-[#fafbfc] p-6 text-center"><PhoneCall className="mx-auto h-8 w-8 text-[#b1b8c8]"/><p className="mt-3 text-sm font-semibold text-[#475066]">Sin llamada activa</p><p className="mt-1 text-xs leading-5 text-[#8d92aa]">Inicia una llamada desde este softphone o usa el centro de llamadas completo.</p></div>}

              {rows.length>0&&<div className="rounded-3xl border border-[#edf0f5] bg-white p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[.12em] text-[#9aa0b4]">Recientes</div>
                <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
                  {rows.slice(0,6).map(x=><div key={x.id} className="rounded-2xl border border-[#eef1f4] p-3">
                    <div className="flex items-center gap-2"><strong className="min-w-0 flex-1 truncate text-sm text-ink-900">{x.display_name||x.phone||'Contacto WhatsApp'}</strong><Status value={x.status}/></div>
                    <div className="mt-1 text-[11px] text-[#9aa0b4]">{x.direction==='out'?'Saliente':'Entrante'} · {dateTime(x.started_at)}</div>
                  </div>)}
                </div>
              </div>}
            </div>
          </section>
        </div>}
      </div>}
    </Modal>

    <Modal open={transferFor!=null} onClose={()=>setTransferFor(null)} title="Transferir llamada" subtitle="Entrega la llamada activa a otro agente del mismo negocio sin cortar la llamada de WhatsApp.">
      <div className="space-y-4">
        <div>
          <label className="label">Agente destino</label>
          <select className="field" value={transferStaff} onChange={e=>setTransferStaff(e.target.value)}>
            <option value="">Selecciona un agente</option>
            {staff.map(x=><option key={x.id} value={x.id}>{x.name} {x.last_name||''}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setTransferFor(null)}>Cancelar</button>
          <button disabled={!transferStaff} className="btn-primary" onClick={()=>transferFor&&action(transferFor,'transfer',transferStaff)}><ArrowRightLeft className="h-4 w-4"/>Transferir</button>
        </div>
      </div>
    </Modal>
  </>
}
