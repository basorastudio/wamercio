'use client'

import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {api} from '@/lib/api'
import {openWamercioCallAudio,type WamercioBrowserCall} from '@/lib/calls-webrtc'
import {phoneDisplay} from '@/components/phone-input'
import {BookUser,Delete,ExternalLink,Keyboard,Mic,MicOff,Pause,PhoneCall,PhoneIncoming,PhoneOff,Play,RotateCw,Search,Settings2,X} from 'lucide-react'

type Snapshot={
  external_call_id:string;record_id?:string;status:string;direction:'in'|'out';created_at?:string;media_ready?:boolean;
  remote_jid?:string;phone?:string;display_name?:string;media_type?:string;owner_id?:string;avatar_url?:string;conversation_id?:string
}
type Merchant={id:string;owner_id:string;name:string;display_name:string;whatsapp:string;profile_picture_url?:string;remote_jid?:string}
type Target={phone:string;display_name:string;avatar_url?:string;remote_jid?:string}

const terminal=new Set(['completed','missed','rejected','failed'])
const keys=['1','2','3','4','5','6','7','8','9','*','0','#']
const css=`
.sap-layer,.sap-layer *{box-sizing:border-box}.sap-layer button,.sap-layer input{font:inherit}.sap-wrap{min-height:100vh;padding:12px;background:radial-gradient(circle at top right,rgba(0,168,132,.22),transparent 34%),#10241f}.sap-card{min-height:calc(100vh - 24px);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.08);border-radius:24px;background:#17332c;box-shadow:0 20px 60px rgba(0,0,0,.35)}.sap-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08)}.sap-brand{font-size:10px;font-weight:900;letter-spacing:.16em;color:#77e3c6}.sap-status{margin-top:4px;font-size:11px;font-weight:750;color:rgba(255,255,255,.62)}.sap-actions{display:flex;gap:7px}.sap-icon{display:grid;place-items:center;width:38px;height:38px;border:0;border-radius:13px;background:rgba(255,255,255,.08);color:#fff;cursor:pointer}.sap-icon:disabled{opacity:.35;cursor:not-allowed}.sap-tabs{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:10px 12px 8px;border-bottom:1px solid rgba(255,255,255,.06)}.sap-tabs button{display:flex;height:38px;align-items:center;justify-content:center;gap:7px;border:0;border-radius:13px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.52);font-size:11px;font-weight:900;cursor:pointer}.sap-tabs button.active{background:#00a884;color:#fff}.sap-dir{display:flex;min-height:0;flex:1;flex-direction:column;padding:10px 12px 0}.sap-search{display:flex;align-items:center;gap:8px;height:44px;padding:0 12px;border:1px solid rgba(255,255,255,.1);border-radius:15px;background:rgba(255,255,255,.055);color:rgba(255,255,255,.42)}.sap-search input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:#fff;font-size:12px;font-weight:750}.sap-list{display:flex;min-height:0;flex:1;flex-direction:column;gap:6px;overflow-y:auto;padding:9px 1px}.sap-item{display:grid;grid-template-columns:44px minmax(0,1fr) 34px;gap:10px;align-items:center;width:100%;padding:8px;border:0;border-radius:14px;background:rgba(255,255,255,.045);color:#fff;text-align:left;cursor:pointer}.sap-item:hover{background:rgba(255,255,255,.075)}.sap-avatar{display:grid;width:44px;height:44px;place-items:center;overflow:hidden;border-radius:50%;background:#28483f;color:#77e3c6;font-size:12px;font-weight:900}.sap-avatar img{width:100%;height:100%;object-fit:cover}.sap-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:900}.sap-sub{margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:rgba(255,255,255,.48)}.sap-phone-btn{display:grid;width:34px;height:34px;place-items:center;border:0;border-radius:11px;background:rgba(0,168,132,.18);color:#77e3c6}.sap-keypad{display:grid;grid-template-columns:repeat(3,64px);justify-content:center;gap:10px;padding:18px 12px}.sap-key{height:54px;border:0;border-radius:18px;background:rgba(255,255,255,.07);color:#fff;font-size:18px;font-weight:850;cursor:pointer}.sap-number{padding:20px 18px 4px;text-align:center;font-size:23px;font-weight:900;letter-spacing:.04em;min-height:56px}.sap-foot{padding:12px;border-top:1px solid rgba(255,255,255,.07)}.sap-call{display:flex;width:100%;height:46px;align-items:center;justify-content:center;gap:8px;border:0;border-radius:15px;background:#00a884;color:#fff;font-size:12px;font-weight:900;cursor:pointer}.sap-call:disabled{opacity:.35;cursor:not-allowed}.sap-empty{display:flex;min-height:360px;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:28px;text-align:center;color:rgba(255,255,255,.6)}.sap-empty strong{color:#fff;font-size:15px}.sap-empty small{max-width:260px;line-height:1.55}.sap-contact{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;padding:22px;text-align:center}.sap-contact .sap-avatar{width:84px;height:84px;font-size:24px}.sap-contact h1{margin:15px 0 4px;font-size:21px}.sap-contact p{margin:0;color:rgba(255,255,255,.55);font-size:12px}.sap-timer{margin-top:10px;font-size:12px;font-weight:900;color:#77e3c6}.sap-controls{display:grid;grid-template-columns:repeat(3,58px);justify-content:center;gap:15px;margin-top:24px}.sap-control{display:flex;flex-direction:column;align-items:center;gap:6px;color:rgba(255,255,255,.68);font-size:9px;font-weight:850}.sap-control button{display:grid;width:52px;height:52px;place-items:center;border:0;border-radius:18px;background:rgba(255,255,255,.08);color:#fff;cursor:pointer}.sap-control button.danger{background:#ef4444}.sap-control button.answer{background:#00a884}.sap-alert{margin:10px 12px 0;border:1px solid rgba(248,113,113,.35);border-radius:12px;background:rgba(127,29,29,.35);padding:9px 10px;font-size:10px;font-weight:800;color:#fecaca}.sap-layer{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:end;padding:18px;pointer-events:none}.sap-frame{width:min(390px,calc(100vw - 24px));height:min(650px,calc(100vh - 24px));pointer-events:auto;filter:drop-shadow(0 24px 70px rgba(0,0,0,.35))}.sap-frame .sap-wrap{height:100%;min-height:0}.sap-frame .sap-card{height:100%;min-height:0}
`
const pipCss=`:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#10241f}*{box-sizing:border-box}body{margin:0;min-width:320px;min-height:100vh;background:#10241f;color:#fff;overflow:hidden}button,input{font:inherit}${css}`

const digits=(v:string)=>String(v||'').replace(/\D/g,'')
const fmtDuration=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`

export default function SuperAdminSupportSoftphone(){
  const[open,setOpen]=useState(false)
  const[pipWindow,setPipWindow]=useState<Window|null>(null)
  const[sessionConnected,setSessionConnected]=useState(false)
  const[sessionPhone,setSessionPhone]=useState('')
  const[calls,setCalls]=useState<Snapshot[]>([])
  const[merchants,setMerchants]=useState<Merchant[]>([])
  const[query,setQuery]=useState('')
  const[tab,setTab]=useState<'directory'|'keypad'>('directory')
  const[target,setTarget]=useState<Target|null>(null)
  const[number,setNumber]=useState('')
  const[busy,setBusy]=useState(false)
  const[error,setError]=useState('')
  const[muted,setMuted]=useState(false)
  const[audioCallId,setAudioCallId]=useState('')
  const[clock,setClock]=useState(Date.now())
  const browserCall=useRef<WamercioBrowserCall|null>(null)
  const lastIncoming=useRef('')
  const pipWindowRef=useRef<Window|null>(null)

  const closeAudio=useCallback(()=>{browserCall.current?.close();browserCall.current=null;setAudioCallId('');setMuted(false)},[])
  const current=useMemo(()=>{const rank:Record<string,number>={active:0,held:1,connecting:2,ringing:3};return [...calls].filter(x=>rank[x.status]!==undefined).sort((a,b)=>rank[a.status]-rank[b.status]||new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime())[0]||null},[calls])
  const elapsed=useMemo(()=>{if(!current?.created_at)return 0;return Math.max(0,Math.floor((clock-new Date(current.created_at).getTime())/1000))},[current?.created_at,clock])

  const refresh=useCallback(async()=>{
    try{
      const x=await api<any>('/admin/whatsapp/calls/status')
      setSessionConnected(!!x.session_connected)
      const wa=await api<any>('/admin/whatsapp/status').catch(()=>null)
      if(wa?.phone)setSessionPhone(String(wa.phone))
      const rows=(Array.isArray(x.active_call_snapshots)?x.active_call_snapshots:[]) as Snapshot[]
      setCalls(rows.filter(c=>!terminal.has(c.status)))
      setError('')
    }catch(e:any){setSessionConnected(false);setError(e.message||'No se pudo consultar WAMERCIO Calls.')}
  },[])
  const refreshDirectory=useCallback(async()=>{try{setMerchants(await api<Merchant[]>('/admin/whatsapp/conversations'))}catch{}},[])

  useEffect(()=>{void refresh();void refreshDirectory();const t=setInterval(()=>void refresh(),1800);const d=setInterval(()=>void refreshDirectory(),12000);const c=setInterval(()=>setClock(Date.now()),1000);return()=>{clearInterval(t);clearInterval(d);clearInterval(c)}},[refresh,refreshDirectory])
  useEffect(()=>{pipWindowRef.current=pipWindow},[pipWindow])
  useEffect(()=>()=>{closeAudio();const win=pipWindowRef.current;if(win&&!win.closed)win.close()},[closeAudio])
  useEffect(()=>{if(audioCallId&&!calls.some(c=>c.external_call_id===audioCallId)){closeAudio()}},[calls,audioCallId,closeAudio])

  const setupPip=(win:Window)=>{
    win.document.head.innerHTML=''
    const title=win.document.createElement('title');title.textContent='WAMERCIO · Softphone';win.document.head.appendChild(title)
    const style=win.document.createElement('style');style.textContent=pipCss;win.document.head.appendChild(style)
    win.document.body.innerHTML=''
    win.addEventListener('pagehide',()=>setPipWindow(null),{once:true})
  }
  const openPip=useCallback(async()=>{
    setOpen(true)
    if(pipWindow&&!pipWindow.closed){pipWindow.focus();return true}
    try{
      const dpi=(window as any).documentPictureInPicture
      if(!dpi?.requestWindow)return false
      const win=await dpi.requestWindow({width:390,height:650}) as Window
      setupPip(win);setPipWindow(win);return true
    }catch{return false}
  },[pipWindow])

  useEffect(()=>{
    const onOpen=()=>{void openPip()}
    window.addEventListener('wamercio:open-admin-softphone',onOpen as EventListener)
    return()=>window.removeEventListener('wamercio:open-admin-softphone',onOpen as EventListener)
  },[openPip])

  useEffect(()=>{
    if(!current||current.direction!=='in'||current.status!=='ringing'||lastIncoming.current===current.external_call_id)return
    lastIncoming.current=current.external_call_id;setTarget({phone:digits(current.phone||''),display_name:current.display_name||'Comerciante',avatar_url:current.avatar_url,remote_jid:current.remote_jid});setOpen(true)
    void openPip().then(ok=>{if(ok)return;try{if('Notification'in window&&Notification.permission==='granted'){const n=new Notification('Llamada entrante · WAMERCIO',{body:current.display_name||phoneDisplay(current.phone||'')||'Comerciante',tag:`wamercio-support-call-${current.external_call_id}`,requireInteraction:true});n.onclick=()=>{window.focus();void openPip();n.close()}}}catch{}})
  },[current?.external_call_id,current?.status,current?.direction,openPip])

  const connectAudio=async(id:string)=>{
    try{
      if(browserCall.current?.id===id)return
      closeAudio();setError('')
      const bc=await openWamercioCallAudio(id,()=>{if(browserCall.current?.id===id)browserCall.current=null;setAudioCallId('');setError('Se perdió el audio del navegador. La llamada puede seguir activa; vuelve a conectar desde Contestar/Reanudar.')},undefined,(callId)=>`/api/v1/admin/whatsapp/calls/${encodeURIComponent(callId)}/webrtc`)
      browserCall.current=bc;setAudioCallId(id);setMuted(false)
    }catch(e:any){setError(e.message||'No se pudo conectar el audio del softphone.')}
  }
  const doAction=async(action:string)=>{
    if(!current)return
    setBusy(true);setError('')
    try{
      if(action==='answer'&&(!pipWindow||pipWindow.closed))void openPip()
      await api(`/admin/whatsapp/calls/${encodeURIComponent(current.external_call_id)}/${action}`,{method:'POST'})
      if(action==='answer'){await connectAudio(current.external_call_id)}
      if(action==='hangup'||action==='reject')closeAudio()
      await refresh()
    }catch(e:any){setError(e.message||'No se pudo ejecutar la acción de llamada.')}finally{setBusy(false)}
  }
  const startCall=async(next?:Target)=>{
    const chosen=next||target||{phone:number,display_name:''}
    const phone=digits(chosen.phone||number)
    if(!phone||!sessionConnected)return
    if(current){setError('Ya existe una llamada activa. Finalízala antes de iniciar otra.');return}
    setBusy(true);setError('');setTarget({...chosen,phone});setNumber(phone)
    try{const out=await api<any>('/admin/whatsapp/calls',{method:'POST',body:JSON.stringify({phone,display_name:chosen.display_name||'',remote_jid:chosen.remote_jid||''})});const id=String(out.external_call_id||out.id||'');await refresh();if(id)await connectAudio(id)}catch(e:any){setError(e.message||'No se pudo iniciar la llamada.')}finally{setBusy(false)}
  }
  const toggleMute=()=>{const next=!muted;browserCall.current?.micStream.getAudioTracks().forEach(t=>{t.enabled=!next});setMuted(next)}
  const filtered=useMemo(()=>{const q=query.trim().toLowerCase();return merchants.filter(m=>!q||`${m.display_name} ${m.name} ${m.whatsapp}`.toLowerCase().includes(q)).slice(0,80)},[merchants,query])

  const surface=()=> <div className="sap-card">
    <div className="sap-head"><div><div className="sap-brand">WAMERCIO · SUPERADMIN</div><div className="sap-status">{sessionConnected?`Softphone · ${sessionPhone?phoneDisplay(sessionPhone):'sesión global conectada'}`:'Softphone · sesión global desconectada'}</div></div><div className="sap-actions"><button className="sap-icon" title="Actualizar" onClick={()=>void refresh()}><RotateCw size={17}/></button><button className="sap-icon" title="Volver a WAMERCIO" onClick={()=>{window.focus();pipWindow?.close()}}><ExternalLink size={17}/></button><button className="sap-icon" title="Cerrar" onClick={()=>{pipWindow?.close();setOpen(false)}}><X size={17}/></button></div></div>
    {error&&<div className="sap-alert">{error}</div>}
    {!sessionConnected&&!current?<div className="sap-empty"><Settings2 size={28}/><strong>Conecta la sesión global</strong><small>El softphone del SuperAdmin usa exclusivamente el WhatsApp configurado en Proveedor y sesión global.</small><button className="sap-call" onClick={()=>{window.focus();window.location.href='/admin/settings?section=whatsapp';pipWindow?.close()}}>Abrir Configuración</button></div>:current?<div className="sap-contact">{current.avatar_url?<div className="sap-avatar"><img src={current.avatar_url} alt=""/></div>:<div className="sap-avatar">{(current.display_name||current.phone||'?').slice(0,2).toUpperCase()}</div>}<h1>{current.display_name||phoneDisplay(current.phone||'')||'Comerciante'}</h1><p>{phoneDisplay(current.phone||'')} · {current.direction==='in'?'Entrante':'Saliente'}</p><div className="sap-timer">{current.status==='ringing'?(current.direction==='in'?'Llamada entrante…':'Llamando…'):current.status==='connecting'?'Conectando…':current.status==='held'?'En espera · '+fmtDuration(elapsed):fmtDuration(elapsed)}</div><div className="sap-controls">{current.direction==='in'&&current.status==='ringing'?<><div className="sap-control"><button className="answer" disabled={busy} onClick={()=>void doAction('answer')}><PhoneIncoming size={21}/></button><span>Contestar</span></div><div className="sap-control"><button className="danger" disabled={busy} onClick={()=>void doAction('reject')}><PhoneOff size={21}/></button><span>Rechazar</span></div></>:<><div className="sap-control"><button disabled={!audioCallId} onClick={toggleMute}>{muted?<MicOff size={20}/>:<Mic size={20}/>}</button><span>{muted?'Activar mic':'Silenciar'}</span></div><div className="sap-control"><button disabled={busy} onClick={()=>void doAction(current.status==='held'?'resume':'hold')}>{current.status==='held'?<Play size={20}/>:<Pause size={20}/>}</button><span>{current.status==='held'?'Reanudar':'Pausar'}</span></div><div className="sap-control"><button className="danger" disabled={busy} onClick={()=>void doAction('hangup')}><PhoneOff size={21}/></button><span>Colgar</span></div></>}</div></div>:<><div className="sap-tabs"><button className={tab==='directory'?'active':''} onClick={()=>setTab('directory')}><BookUser size={15}/>Comercios</button><button className={tab==='keypad'?'active':''} onClick={()=>setTab('keypad')}><Keyboard size={15}/>Teclado</button></div>{tab==='directory'?<div className="sap-dir"><div className="sap-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar comercio o WhatsApp"/></div><div className="sap-list">{filtered.map(m=>{const t:Target={phone:digits(m.whatsapp),display_name:m.display_name||m.name,avatar_url:m.profile_picture_url,remote_jid:m.remote_jid};return <button className="sap-item" key={m.owner_id} onClick={()=>{setTarget(t);setNumber(t.phone)}}>{m.profile_picture_url?<div className="sap-avatar"><img src={m.profile_picture_url} alt=""/></div>:<div className="sap-avatar">{(m.display_name||m.name||'?').slice(0,2).toUpperCase()}</div>}<div><div className="sap-name">{m.display_name||m.name}</div><div className="sap-sub">{phoneDisplay(m.whatsapp)} · Comerciante</div></div><span className="sap-phone-btn" onClick={e=>{e.stopPropagation();void startCall(t)}}><PhoneCall size={15}/></span></button>})}{filtered.length===0&&<div className="sap-empty" style={{minHeight:180}}><BookUser size={24}/><strong>Sin comercios</strong><small>No hay coincidencias para esta búsqueda.</small></div>}</div></div>:<><div className="sap-number">{number?phoneDisplay(number):'Marca un número'}</div><div className="sap-keypad">{keys.map(k=><button className="sap-key" key={k} onClick={()=>setNumber(v=>v+k)}>{k}</button>)}</div><div className="sap-foot"><button className="sap-icon" style={{margin:'0 auto 10px'}} onClick={()=>setNumber(v=>v.slice(0,-1))}><Delete size={18}/></button></div></>}<div className="sap-foot"><button className="sap-call" disabled={busy||!sessionConnected||!digits(target?.phone||number)} onClick={()=>void startCall()}><PhoneCall size={17}/>{busy?'Llamando…':'Llamar ahora'}</button></div></>}
  </div>

  const pip=pipWindow&&!pipWindow.closed?createPortal(<div className="sap-wrap">{surface()}</div>,pipWindow.document.body):null
  const fallback=open&&(!pipWindow||pipWindow.closed)&&typeof document!=='undefined'?createPortal(<><style>{css}</style><div className="sap-layer"><div className="sap-frame"><div className="sap-wrap">{surface()}</div></div></div></>,document.body):null
  return <>{pip}{fallback}</>
}
