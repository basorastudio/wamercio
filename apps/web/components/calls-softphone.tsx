'use client'

import {forwardRef,useCallback,useEffect,useImperativeHandle,useMemo,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {api} from '@/lib/api'
import PhoneInput from '@/components/phone-input'
import {openWamercioCallAudio,type WamercioBrowserCall} from '@/lib/calls-webrtc'
import {
  ArrowRightLeft,Delete,ExternalLink,Mic,MicOff,Pause,PhoneCall,PhoneIncoming,PhoneOff,Play,
  Search,X,Keyboard,BookUser,RotateCw,Camera,CameraOff
} from 'lucide-react'

const terminalStatuses=new Set(['completed','missed','rejected','failed'])
const keypad=['1','2','3','4','5','6','7','8','9','*','0','#']

type DirectoryKind='all'|'contact'|'customer'|'user'
type DialerTab='directory'|'keypad'

const asBool=(value:any)=>value===true||value===1||value==='1'||String(value||'').toLowerCase()==='true'

export type SoftphoneTarget={phone?:string;display_name?:string;conversation_id?:string;kind?:Exclude<DirectoryKind,'all'>;avatar_url?:string}
export type CallsSoftphoneHandle={
  openPictureInPicture:()=>Promise<boolean>
  startDirectCall:(target:SoftphoneTarget,storeIdOverride?:string)=>Promise<void>
}

type DirectoryItem=SoftphoneTarget&{id:string;kind:Exclude<DirectoryKind,'all'>;name:string;phone:string;subtitle:string;avatar_url?:string}

const pipCss=`
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#10241f}*{box-sizing:border-box}body{margin:0;min-width:320px;min-height:100vh;background:#10241f;color:#fff;overflow:hidden}button,input{font:inherit}.wam-pip{min-height:100vh;padding:12px;background:radial-gradient(circle at top right,rgba(0,168,132,.22),transparent 34%),#10241f}.wam-card{min-height:calc(100vh - 24px);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.08);border-radius:24px;background:#17332c;box-shadow:0 20px 60px rgba(0,0,0,.35)}.wam-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08)}.wam-brand{font-size:10px;font-weight:900;letter-spacing:.16em;color:#77e3c6}.wam-status{margin-top:4px;font-size:11px;font-weight:750;color:rgba(255,255,255,.62)}.wam-icon{display:grid;place-items:center;width:38px;height:38px;border:0;border-radius:13px;background:rgba(255,255,255,.08);color:#fff;cursor:pointer}.wam-tabs{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:10px 12px 8px;border-bottom:1px solid rgba(255,255,255,.06)}.wam-tabs button{display:flex;height:38px;align-items:center;justify-content:center;gap:7px;border:0;border-radius:13px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.52);font-size:11px;font-weight:900;cursor:pointer}.wam-tabs button.active{background:#00a884;color:#fff;box-shadow:0 7px 18px rgba(0,168,132,.18)}.wam-dir{display:flex;min-height:0;flex:1;flex-direction:column;padding:10px 12px 0}.wam-search{display:flex;align-items:center;gap:8px;height:44px;padding:0 12px;border:1px solid rgba(255,255,255,.1);border-radius:15px;background:rgba(255,255,255,.055);color:rgba(255,255,255,.42)}.wam-search input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:#fff;font-size:12px;font-weight:750}.wam-filters{display:flex;gap:6px;padding:8px 0;overflow-x:auto;scrollbar-width:none}.wam-filters button{display:flex;flex:0 0 auto;height:30px;align-items:center;gap:5px;padding:0 9px;border:1px solid rgba(255,255,255,.08);border-radius:999px;background:rgba(255,255,255,.045);color:rgba(255,255,255,.5);font-size:9px;font-weight:900;cursor:pointer}.wam-filters button.active{border-color:rgba(119,227,198,.55);background:rgba(0,168,132,.2);color:#77e3c6}.wam-list{display:flex;min-height:0;flex:1;flex-direction:column;gap:6px;overflow-y:auto;padding:0 1px 9px}.wam-item{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:9px;width:100%;min-height:59px;padding:8px 9px;border:1px solid rgba(255,255,255,.07);border-radius:15px;background:rgba(255,255,255,.04);color:#fff;text-align:left;cursor:pointer}.wam-item:hover,.wam-item.selected{border-color:rgba(119,227,198,.55);background:rgba(0,168,132,.13)}.wam-avatar{display:grid;place-items:center;width:42px;height:42px;align-self:center;border-radius:13px;object-fit:cover;background:#e7fce7;color:#008069;font-size:10px;font-weight:1000}.wam-copy{display:flex;min-width:0;align-self:center;flex-direction:column}.wam-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:950}.wam-copy small{margin-top:2px;overflow:hidden;color:rgba(255,255,255,.43);font-size:9px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}.wam-kind{align-self:start;padding:4px 6px;border-radius:999px;font-size:8px;font-weight:950;background:rgba(119,227,198,.12);color:#9ef0d8}.wam-keypad-panel{display:flex;min-height:0;flex:1;flex-direction:column;padding:12px}.wam-number{display:flex;align-items:center;gap:8px;height:48px;padding:0 8px 0 13px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(255,255,255,.055)}.wam-number input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:#fff;text-align:center;font-size:17px;font-weight:950;letter-spacing:.035em}.wam-number .wamercio-phone-input{min-width:0;flex:1}.wam-number .iti{width:100%}.wam-number .wamercio-phone-control-dark{width:100%;height:44px;border:0!important;outline:0;background:transparent!important;color:#fff!important;padding-top:0;padding-bottom:0;font-size:15px;font-weight:900;box-shadow:none!important}.wam-number .iti__selected-country{background:transparent!important;color:#fff}.wam-number .iti__selected-dial-code{color:rgba(255,255,255,.72)}.wam-number .iti__dropdown-content{background:#17332c;border:1px solid rgba(255,255,255,.12);border-radius:12px}.wam-number .iti__search-input{background:#10241f;border:1px solid rgba(255,255,255,.12);border-radius:8px;color:#fff}.wam-number .iti__country-name{color:#fff}.wam-number .iti__dial-code{color:rgba(255,255,255,.52)}.wam-number .iti__country.iti__highlight{background:rgba(0,168,132,.18)}.wam-keypad{display:grid;flex:1;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(4,1fr);gap:7px;padding-top:10px}.wam-keypad button{min-height:46px;border:0;border-radius:15px;background:rgba(255,255,255,.06);color:#fff;font-size:16px;font-weight:950;cursor:pointer}.wam-keypad button:hover{background:rgba(0,168,132,.2);color:#9ef0d8}.wam-foot{display:flex;flex-direction:column;gap:7px;padding:9px 12px 12px;border-top:1px solid rgba(255,255,255,.08)}.wam-target{display:grid;grid-template-columns:34px minmax(0,1fr) 28px;gap:8px;align-items:center;padding:7px 8px;border:1px solid rgba(119,227,198,.25);border-radius:13px;background:rgba(0,168,132,.1)}.wam-target>span{display:grid;width:34px;height:34px;place-items:center;border-radius:11px;background:#e7fce7;color:#008069;font-size:9px;font-weight:1000}.wam-target>div{display:flex;min-width:0;flex-direction:column}.wam-target strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.wam-target small{margin-top:1px;color:rgba(255,255,255,.4);font-size:8px}.wam-target>button{display:grid;width:28px;height:28px;place-items:center;border:0;border-radius:9px;background:rgba(255,255,255,.07);color:rgba(255,255,255,.55);cursor:pointer}.wam-call{display:flex;height:48px;align-items:center;justify-content:center;gap:8px;border:0;border-radius:15px;background:#00a884;color:#fff;font-size:12px;font-weight:1000;box-shadow:0 8px 20px rgba(0,168,132,.2);cursor:pointer}.wam-call:disabled{opacity:.38;cursor:not-allowed;box-shadow:none}.wam-contact{display:flex;flex:1;min-height:230px;flex-direction:column;align-items:center;justify-content:center;padding:22px 18px;text-align:center}.wam-contact .avatar{display:grid;place-items:center;width:82px;height:82px;border-radius:999px;border:4px solid #fff;background:#e7fce7;color:#008069;font-size:22px;font-weight:1000;box-shadow:0 8px 24px rgba(0,0,0,.22)}.wam-contact h1{max-width:100%;margin:18px 0 0;font-size:22px;line-height:1.15;font-weight:1000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wam-contact p{margin:6px 0 0;color:rgba(255,255,255,.48);font-size:12px;font-weight:750}.wam-timer{margin-top:14px;padding:7px 13px;border-radius:999px;background:rgba(255,255,255,.08);font-size:12px;font-weight:900;letter-spacing:.08em}.wam-video-stage{position:relative;display:flex;min-height:300px;flex:1;align-items:center;justify-content:center;overflow:hidden;background:#081a16}.wam-remote-video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#081a16}.wam-local-video{position:absolute;right:14px;bottom:14px;width:112px;aspect-ratio:3/4;object-fit:cover;border:2px solid rgba(255,255,255,.88);border-radius:16px;background:#10241f;box-shadow:0 10px 28px rgba(0,0,0,.35);transform:scaleX(-1)}.wam-video-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:22px;text-align:center;background:radial-gradient(circle at center,rgba(23,51,44,.15),rgba(8,26,22,.35))}.wam-video-overlay img,.wam-video-overlay .avatar{display:grid;place-items:center;width:74px;height:74px;border-radius:999px;border:3px solid #fff;background:#e7fce7;color:#008069;object-fit:cover;font-size:20px;font-weight:1000}.wam-video-overlay strong{margin-top:14px;font-size:18px}.wam-video-overlay small{margin-top:6px;color:rgba(255,255,255,.55);font-size:11px;font-weight:750}.wam-video-pill{margin-top:12px;padding:7px 12px;border-radius:999px;background:rgba(255,255,255,.09);font-size:11px;font-weight:900}.wam-controls{display:grid;grid-template-columns:1fr 1fr;gap:9px;padding:12px;border-top:1px solid rgba(255,255,255,.08)}.wam-controls button{min-height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;border:0;border-radius:17px;background:rgba(255,255,255,.08);color:#fff;font-size:11px;font-weight:900;cursor:pointer}.wam-controls button.active{background:#00a884}.wam-controls button.danger{background:#ef4444}.wam-controls button.wide{grid-column:1/-1;min-height:44px;flex-direction:row;background:#00a884}.wam-controls button:disabled{opacity:.38;cursor:not-allowed}.wam-transfer{padding:12px;border-top:1px solid rgba(255,255,255,.08)}.wam-transfer select{width:100%;padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:#21443b;color:white}.wam-transfer .row{display:flex;gap:8px;margin-top:8px}.wam-transfer .row button{flex:1;padding:10px;border:0;border-radius:12px;background:rgba(255,255,255,.08);color:#fff;font-weight:800}.wam-transfer .row button.primary{background:#00a884}.wam-empty{display:flex;min-height:165px;flex:1;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center;color:rgba(255,255,255,.45)}
`

const softphoneComponentCss=pipCss.slice(pipCss.indexOf('.wam-pip'))
const inlineSoftphoneCss=`
.wam-inline-layer{position:fixed;inset:0;z-index:170;pointer-events:none}
.wam-inline-frame{position:absolute;right:24px;top:88px;width:min(380px,calc(100vw - 32px));height:min(640px,calc(100vh - 112px));pointer-events:auto;filter:drop-shadow(0 24px 60px rgba(15,23,42,.28))}
.wam-inline-frame button,.wam-inline-frame input{font:inherit}
${softphoneComponentCss}
.wam-inline-frame .wam-pip{height:100%;min-height:0;padding:0;background:transparent}
.wam-inline-frame .wam-card{height:100%;min-height:0}
@media(max-width:640px){.wam-inline-frame{left:12px;right:12px;top:76px;width:auto;height:calc(100vh - 88px)}}
`


const kindLabel=(kind:Exclude<DirectoryKind,'all'>)=>kind==='customer'?'Cliente':kind==='user'?'Usuario':'Contacto'
const callStatusText=(status:string)=>({ringing:'Timbrando',connecting:'Conectando',active:'Activa',held:'En espera',transferred:'Transferida',completed:'Finalizada',missed:'Perdida',rejected:'Rechazada',failed:'Fallida'} as Record<string,string>)[status]||status
const durationLabel=(seconds:number)=>{const safe=Math.max(0,Math.floor(Number(seconds)||0));const h=Math.floor(safe/3600),m=Math.floor((safe%3600)/60),r=safe%60;const pair=(v:number)=>String(v).padStart(2,'0');return h?`${pair(h)}:${pair(m)}:${pair(r)}`:`${pair(m)}:${pair(r)}`}

const CallsSoftphone=forwardRef<CallsSoftphoneHandle,{
  open:boolean
  onClose:()=>void
  storeId:string
  target?:SoftphoneTarget|null
  title?:string
  subtitle?:string
}>(({open,onClose,storeId,target,title='Softphone',subtitle='Llamadas WhatsApp directamente desde WAMERCIO.'},ref)=>{
  const[settings,setSettings]=useState<any>(null)
  const[rows,setRows]=useState<any[]>([])
  const[staff,setStaff]=useState<any[]>([])
  const[customers,setCustomers]=useState<any[]>([])
  const[contacts,setContacts]=useState<any[]>([])
  const[loading,setLoading]=useState(false)
  const[busy,setBusy]=useState(false)
  const[error,setError]=useState('')
  const[form,setForm]=useState({phone:'',display_name:'',conversation_id:''})
  const[transferFor,setTransferFor]=useState<any>(null)
  const[transferStaff,setTransferStaff]=useState('')
  const[audioCallId,setAudioCallId]=useState('')
  const[audioBusy,setAudioBusy]=useState('')
  const[mediaActiveCallId,setMediaActiveCallId]=useState('')
  const[muted,setMuted]=useState(false)
  const[videoBusy,setVideoBusy]=useState('')
  const[videoSupported,setVideoSupported]=useState(true)
  const localVideoRef=useRef<HTMLVideoElement|null>(null)
  const remoteVideoRef=useRef<HTMLCanvasElement|null>(null)
  const[tab,setTab]=useState<DialerTab>('directory')
  const[directorySearch,setDirectorySearch]=useState('')
  const[directoryKind,setDirectoryKind]=useState<DirectoryKind>('all')
  const[selectedTarget,setSelectedTarget]=useState<SoftphoneTarget|null>(null)
  const[pipWindow,setPipWindow]=useState<Window|null>(null)
  const[pipOpening,setPipOpening]=useState(false)
  const[pipTransfer,setPipTransfer]=useState(false)
  const browserCall=useRef<WamercioBrowserCall|null>(null)
  const dialingRef=useRef(false)
  const lastIncoming=useRef('')
  const wasOpen=useRef(false)
  const previousStore=useRef('')
  const previousCallId=useRef('')
  const rowsRef=useRef<any[]>([])
  const activeAnchorRef=useRef<{callId:string;at:number}>({callId:'',at:0})
  const[clock,setClock]=useState(()=>Date.now())

  const closeAudio=useCallback(()=>{
    browserCall.current?.close()
    browserCall.current=null
    setAudioCallId('')
    setMuted(false)
    setVideoBusy('')
    setVideoSupported(true)
  },[])

  const load=useCallback((silent=false)=>{
    if(!storeId)return
    if(!silent)setLoading(true)
    const request=silent
      ?api<any[]>(`/calls?store_id=${storeId}`).then(c=>{setRows(c)})
      :Promise.all([api(`/calls/settings?store_id=${storeId}`),api<any[]>(`/calls?store_id=${storeId}`),api<any[]>(`/staff?store_id=${storeId}`),api<any[]>(`/customers?store_id=${storeId}`),api<any[]>(`/contacts?store_id=${storeId}`)]).then(([s,c,u,customerRows,contactRows])=>{setSettings(s);setRows(c);setStaff(u.filter((x:any)=>x.status==='active'&&x.role!=='delivery'));setCustomers(customerRows);setContacts(contactRows)})
    request.then(()=>{if(!silent)setError('')}).catch((e:any)=>{if(!silent)setError(e.message||'No se pudo cargar el softphone.')}).finally(()=>{if(!silent)setLoading(false)})
  },[storeId])

  useEffect(()=>{
    if(previousStore.current===storeId)return
    previousStore.current=storeId
    setRows([])
    setSettings(null)
    setStaff([])
    setCustomers([])
    setContacts([])
    setError('')
    lastIncoming.current=''
  },[storeId])

  useEffect(()=>{
    if(!storeId)return
    load(!(open||pipWindow))
    const timer=setInterval(()=>load(true),2500)
    return()=>clearInterval(timer)
  },[open,pipWindow,storeId,load])

  useEffect(()=>{
    const justOpened=open&&!wasOpen.current
    wasOpen.current=open
    if(target){const next={phone:target.phone||'',display_name:target.display_name||'',conversation_id:target.conversation_id||''};setForm(next);setSelectedTarget(target);return}
    if(justOpened){setForm({phone:'',display_name:'',conversation_id:''});setSelectedTarget(null);setTab('directory')}
  },[target?.phone,target?.display_name,target?.conversation_id,target?.kind,open])

  useEffect(()=>()=>{
    closeAudio()
    if(pipWindow&&!pipWindow.closed)pipWindow.close()
  },[closeAudio])

  useEffect(()=>{rowsRef.current=rows},[rows])
  useEffect(()=>{
    const timer=setInterval(()=>setClock(Date.now()),1000)
    return()=>clearInterval(timer)
  },[])

  useEffect(()=>{
    if(!audioCallId)return
    const row=rows.find(x=>x.id===audioCallId)
    if(row&&terminalStatuses.has(row.status)){setMediaActiveCallId(v=>v===audioCallId?'':v);closeAudio()}
  },[rows,audioCallId,closeAudio])

  const currentCall=useMemo(()=>{const rank:Record<string,number>={active:0,held:1,connecting:2,ringing:3,transferred:4};const live=rows.filter(x=>rank[x.status]!==undefined);live.sort((a,b)=>rank[a.status]-rank[b.status]||new Date(b.started_at).getTime()-new Date(a.started_at).getTime());return live[0]||null},[rows])
  const visualStatus=useMemo(()=>{if(!currentCall)return '';if(['ringing','connecting'].includes(currentCall.status)&&(mediaActiveCallId===currentCall.id||(currentCall.direction==='in'&&audioCallId===currentCall.id)))return 'active';return String(currentCall.status||'')},[currentCall,audioCallId,mediaActiveCallId])
  const currentVideoMeta=currentCall?.metadata||{}
  const videoActive=Boolean(currentCall&&asBool(currentVideoMeta.video_active))
  const videoPending=Boolean(currentCall&&asBool(currentVideoMeta.video_pending))
  const videoLocal=Boolean(currentCall&&asBool(currentVideoMeta.video_local))
  const videoRemote=Boolean(currentCall&&asBool(currentVideoMeta.video_remote))
  useEffect(()=>{
    if(!currentCall||!['active','held','transferred'].includes(visualStatus)){activeAnchorRef.current={callId:'',at:0};return}
    if(activeAnchorRef.current.callId===currentCall.id&&activeAnchorRef.current.at>0)return
    const answered=currentCall.answered_at?new Date(currentCall.answered_at).getTime():0
    activeAnchorRef.current={callId:currentCall.id,at:Number.isFinite(answered)&&answered>0?answered:Date.now()}
  },[currentCall?.id,currentCall?.answered_at,visualStatus])
  const liveDuration=useMemo(()=>{if(!currentCall||!['active','held','transferred'].includes(visualStatus))return 0;const ts=activeAnchorRef.current.callId===currentCall.id&&activeAnchorRef.current.at>0?activeAnchorRef.current.at:clock;return Math.max(0,Math.floor((clock-ts)/1000))},[currentCall,visualStatus,clock])
  useEffect(()=>{
    if(currentCall){previousCallId.current=currentCall.id;return}
    if(previousCallId.current){
      const endedId=previousCallId.current
      previousCallId.current=''
      setMediaActiveCallId('')
      setError('')
      setPipTransfer(false)
      setVideoBusy('')
      setTransferStaff('')
      setTab('directory')
      if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('wamercio:softphone-call-ended',{detail:{id:endedId}}))
    }
  },[currentCall?.id])
  useEffect(()=>{if(typeof window==='undefined'||!currentCall||currentCall.direction!=='in'||currentCall.status!=='ringing'||lastIncoming.current===currentCall.id)return;lastIncoming.current=currentCall.id;window.dispatchEvent(new CustomEvent('wamercio:incoming-call',{detail:{id:currentCall.id,store_id:storeId,phone:currentCall.phone,display_name:currentCall.display_name,conversation_id:currentCall.conversation_id,avatar_url:currentCall.avatar_url||currentCall.profile_picture_url||''}}))},[currentCall,storeId])

  useEffect(()=>{
    const bc=browserCall.current
    if(!currentCall||!bc||bc.id!==currentCall.id||!(videoActive||videoPending))return
    bc.attachVideoElements(localVideoRef.current,remoteVideoRef.current)
  },[currentCall?.id,videoActive,videoPending,pipWindow])

  useEffect(()=>{
    const bc=browserCall.current
    if(!currentCall||!bc||bc.id!==currentCall.id||videoBusy)return
    if(!videoActive&&!videoPending&&bc.cameraStream)void bc.stopVideo()
  },[currentCall?.id,videoActive,videoPending,videoBusy])

  const directory=useMemo<DirectoryItem[]>(()=>{
    const customerItems=customers.map((x:any)=>({id:`customer:${x.id}`,kind:'customer' as const,name:x.name||x.whatsapp_name||x.phone||'Cliente',phone:String(x.phone||'').replace(/\D/g,''),subtitle:x.whatsapp_name&&x.whatsapp_name!==x.name?`WhatsApp: ${x.whatsapp_name}`:'Cliente WAMERCIO',avatar_url:x.profile_picture_url,conversation_id:x.conversation_id||''}))
    const customerPhones=new Set(customerItems.map(x=>x.phone).filter(Boolean))
    const contactItems=contacts.map((x:any)=>({id:`contact:${x.id}`,kind:'contact' as const,name:x.name||x.whatsapp_name||x.phone||'Contacto',phone:String(x.phone||'').replace(/\D/g,''),subtitle:x.whatsapp_name&&x.whatsapp_name!==x.name?`WhatsApp: ${x.whatsapp_name}`:'Contacto de WhatsApp',avatar_url:x.profile_picture_url,conversation_id:x.conversation_id||''})).filter(x=>x.phone&&!customerPhones.has(x.phone))
    const userItems=staff.map((x:any)=>({id:`user:${x.id}`,kind:'user' as const,name:[x.name,x.last_name].filter(Boolean).join(' ')||x.phone||'Usuario',phone:String(x.phone||'').replace(/\D/g,''),subtitle:x.role?`Usuario · ${x.role}`:'Usuario operativo',avatar_url:x.profile_picture_url,conversation_id:''}))
    const all=[...contactItems,...customerItems,...userItems].filter(x=>x.phone)
    const q=directorySearch.trim().toLowerCase()
    return all.filter(x=>(directoryKind==='all'||x.kind===directoryKind)&&(!q||(x.name+' '+x.phone+' '+x.subtitle).toLowerCase().includes(q))).slice(0,80)
  },[customers,contacts,staff,directorySearch,directoryKind])

  const connectAudio=async(id:string):Promise<WamercioBrowserCall|null>=>{
    setAudioBusy(id)
    setError('')
    try{
      if(browserCall.current?.id===id)return browserCall.current
      closeAudio()
      const bc=await openWamercioCallAudio(id,()=>{
        const active=browserCall.current
        if(active?.id===id)browserCall.current=null
        setAudioCallId(v=>v===id?'':v)
        setMuted(false)
        const row=rowsRef.current.find(x=>x.id===id)
        if(row&&['active','held','connecting'].includes(row.status))setError('Se perdió el audio del navegador. Pulsa “Reconectar audio” para continuar escuchando; la llamada de WhatsApp sigue activa mientras el motor la conserve.')
      },()=>{
        const answeredAt=new Date().toISOString()
        setMediaActiveCallId(id)
        setRows(v=>v.map(row=>row.id===id&&['ringing','connecting'].includes(row.status)?{...row,status:'active',answered_at:row.answered_at||answeredAt}:row))
      })
      browserCall.current=bc
      setVideoSupported(bc.videoSupported)
      setAudioCallId(id)
      setMuted(false)
      return bc
    }catch(e:any){
      setError(e.message||'No se pudo conectar el audio del navegador.')
      return null
    }finally{
      setAudioBusy('')
    }
  }

  const toggleMute=()=>{
    const next=!muted
    browserCall.current?.micStream.getAudioTracks().forEach(track=>{track.enabled=!next})
    setMuted(next)
  }

  const performCall=useCallback(async(targetOverride?:SoftphoneTarget,storeIdOverride?:string)=>{
    const chosen=targetOverride||selectedTarget||{phone:form.phone,display_name:form.display_name,conversation_id:form.conversation_id}
    const phone=String(chosen.phone||form.phone||'').replace(/\D/g,'')
    const targetStore=storeIdOverride||storeId
    if(!targetStore||!phone)return
    if(dialingRef.current)return
    if(currentCall){setError('Ya existe una llamada activa. Finalízala o transfiérela antes de iniciar otra.');return}
    dialingRef.current=true
    setBusy(true)
    setError('')
    try{
      const created=await api<any>('/calls',{method:'POST',body:JSON.stringify({store_id:targetStore,phone,display_name:chosen.display_name||form.display_name||'',conversation_id:chosen.conversation_id||form.conversation_id||'',avatar_url:chosen.avatar_url||''})})
      setForm({phone,display_name:chosen.display_name||form.display_name||'',conversation_id:chosen.conversation_id||form.conversation_id||''})
      setSelectedTarget({...chosen,phone})
      await load(true)
      try{
        await connectAudio(created.id)
      }catch{
        // The WhatsApp call can keep ringing even if the local browser audio
        // negotiation fails. connectAudio already exposes the actionable error.
      }
    }catch(e:any){
      setError(e.message||'No se pudo iniciar la llamada.')
    }finally{
      dialingRef.current=false
      setBusy(false)
    }
  },[selectedTarget,form,storeId,load,currentCall])

  const mergeVideoResult=(callId:string,result:any)=>{
    const engine=result?.engine||result||{}
    const patch:any={}
    for(const key of ['video_active','video_pending','video_local','video_remote'])if(engine[key]!==undefined)patch[key]=engine[key]
    if(Object.keys(patch).length)setRows(v=>v.map(row=>row.id===callId?{...row,metadata:{...(row.metadata||{}),...patch}}:row))
  }

  const startVideoUpgrade=async(x:any)=>{
    if(!x||visualStatus!=='active')return
    setVideoBusy('start')
    setError('')
    try{
      let bc=browserCall.current?.id===x.id?browserCall.current:null
      if(!bc)bc=await connectAudio(x.id)
      if(!bc)throw new Error('Conecta primero el audio del softphone.')
      if(!bc.videoSupported)throw new Error('Este navegador no admite WebCodecs H.264 para video.')
      setRows(v=>v.map(row=>row.id===x.id?{...row,metadata:{...(row.metadata||{}),video_pending:true}}:row))
      await bc.startVideo(localVideoRef.current,remoteVideoRef.current)
      const result=await api<any>(`/calls/${x.id}`,{method:'PATCH',body:JSON.stringify({action:'video_start'})})
      mergeVideoResult(x.id,result)
      window.setTimeout(()=>{void load(true)},300)
    }catch(e:any){
      const bc=browserCall.current
      if(bc && bc.id===x.id)await bc.stopVideo().catch(()=>{})
      setRows(v=>v.map(row=>row.id===x.id?{...row,metadata:{...(row.metadata||{}),video_pending:false,video_active:false,video_local:false,video_remote:false}}:row))
      setError(e.message||'No se pudo solicitar el cambio a video.')
    }finally{setVideoBusy('')}
  }

  const stopVideoUpgrade=async(x:any)=>{
    if(!x)return
    setVideoBusy('stop')
    setError('')
    try{
      const result=await api<any>(`/calls/${x.id}`,{method:'PATCH',body:JSON.stringify({action:'video_stop'})})
      mergeVideoResult(x.id,result)
      const bc=browserCall.current
      if(bc && bc.id===x.id)await bc.stopVideo()
      setRows(v=>v.map(row=>row.id===x.id?{...row,metadata:{...(row.metadata||{}),video_pending:false,video_active:false,video_local:false,video_remote:false}}:row))
      window.setTimeout(()=>{void load(true)},250)
    }catch(e:any){setError(e.message||'No se pudo volver al modo voz.')}
    finally{setVideoBusy('')}
  }

  const startCall=async(e?:React.FormEvent)=>{e?.preventDefault();await performCall()}

  const action=async(x:any,a:string,assigned_staff_id='')=>{
    setError('')
    try{
      const result=await api<any>(`/calls/${x.id}`,{method:'PATCH',body:JSON.stringify({action:a,assigned_staff_id})})
      const fallbackStatus=a==='hangup'?'completed':a==='reject'?'rejected':''
      const nextStatus=String(result?.status||result?.engine?.status||fallbackStatus).trim()
      if(nextStatus)setRows(v=>v.map(row=>row.id===x.id?{...row,status:nextStatus,assigned_staff_id:assigned_staff_id||row.assigned_staff_id}:row))
      mergeVideoResult(x.id,result)
      if(a==='answer'){
        await connectAudio(x.id)
        const answeredAt=new Date().toISOString()
        setRows(v=>v.map(row=>row.id===x.id?{...row,status:'active',answered_at:row.answered_at||answeredAt}:row))
      }
      if(a==='hangup'||a==='reject'||a==='transfer')closeAudio()
      if(a==='hangup'||a==='reject'){
        setTab('directory')
        setSelectedTarget({phone:x.phone||'',display_name:x.display_name||'',conversation_id:x.conversation_id||'',kind:'contact'})
      }
      setTransferFor(null)
      setTransferStaff('')
      setPipTransfer(false)
      window.setTimeout(()=>{void load(true)},250)
    }catch(e:any){
      setError(e.message||'No se pudo ejecutar la acción de llamada.')
    }
  }

  const openPictureInPicture=useCallback(async()=>{
    if(typeof window==='undefined')return false
    const manager=(window as any).documentPictureInPicture
    if(!manager?.requestWindow)return false
    if(pipWindow&&!pipWindow.closed){pipWindow.focus();return true}
    const existing=manager.window as Window|undefined
    if(existing&&!existing.closed){
      setPipWindow(existing)
      existing.focus()
      return true
    }
    setPipOpening(true)
    try{
      const win=await manager.requestWindow({width:380,height:640}) as Window
      win.document.title='WAMERCIO Softphone'
      document.querySelectorAll('link[rel="stylesheet"],style').forEach(node=>{
        try{win.document.head.appendChild(node.cloneNode(true))}catch{}
      })
      const style=win.document.createElement('style')
      style.textContent=pipCss
      win.document.head.appendChild(style)
      win.addEventListener('pagehide',()=>{setPipWindow(null);setPipOpening(false);onClose()},{once:true})
      setPipWindow(win)
      return true
    }catch{
      return false
    }finally{
      setPipOpening(false)
    }
  },[pipWindow,onClose])

  const answerIncoming=async(x:any)=>{
    // Mirrors Hierro del Norte: the incoming UI is already visible without a
    // gesture. The Contestar click is then used synchronously to create PiP,
    // after which the same canonical surface continues there.
    const pipPromise=openPictureInPicture()
    await action(x,'answer')
    void pipPromise
  }

  useImperativeHandle(ref,()=>({
    openPictureInPicture,
    startDirectCall:async(nextTarget:SoftphoneTarget,storeIdOverride?:string)=>{
      setForm({phone:nextTarget.phone||'',display_name:nextTarget.display_name||'',conversation_id:nextTarget.conversation_id||''})
      setSelectedTarget(nextTarget)
      await performCall(nextTarget,storeIdOverride)
    },
  }),[openPictureInPicture,performCall])

  const appendDigit=(digit:string)=>{
    setSelectedTarget(null)
    setForm(v=>({...v,phone:`${v.phone||''}${digit}`}))
  }
  const backspace=()=>{setSelectedTarget(null);setForm(v=>({...v,phone:(v.phone||'').slice(0,-1)}))}
  const chooseDirectory=(item:DirectoryItem)=>{
    const next={phone:item.phone,display_name:item.name,conversation_id:item.conversation_id,kind:item.kind,avatar_url:item.avatar_url}
    setSelectedTarget(next)
    setForm({phone:item.phone,display_name:item.name,conversation_id:item.conversation_id||''})
  }

  const directoryPanel=(dark=false)=>dark?<div className="wam-dir">
    <div className="wam-search"><Search size={15}/><input value={directorySearch} onChange={e=>setDirectorySearch(e.target.value)} placeholder="Buscar por nombre o WhatsApp..."/>{directorySearch&&<button onClick={()=>setDirectorySearch('')}><X size={13}/></button>}</div>
    <div className="wam-filters">{([['all','Todos'],['contact','Contactos'],['customer','Clientes'],['user','Usuarios']] as [DirectoryKind,string][]).map(([kind,label])=><button key={kind} className={directoryKind===kind?'active':''} onClick={()=>setDirectoryKind(kind)}>{label}</button>)}</div>
    <div className="wam-list">{directory.length?directory.map(item=><button key={item.id} className={`wam-item ${selectedTarget?.phone===item.phone?'selected':''}`} onClick={()=>chooseDirectory(item)} onDoubleClick={()=>void performCall(item)}>{item.avatar_url?<img src={item.avatar_url} className="wam-avatar" alt=""/>:<span className="wam-avatar">{item.name.slice(0,2).toUpperCase()}</span>}<span className="wam-copy"><strong>{item.name}</strong><small>{item.phone} · {item.subtitle}</small></span><span className="wam-kind">{kindLabel(item.kind)}</span></button>):<div className="wam-empty"><BookUser size={26}/><strong>Sin resultados</strong><small>Prueba otro nombre, número o filtro.</small></div>}</div>
  </div>:<div className="space-y-3">
    <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a2a6b8]"/><input className="field pl-10" value={directorySearch} onChange={e=>setDirectorySearch(e.target.value)} placeholder="Buscar por nombre o WhatsApp..."/></div>
    <div className="flex gap-2 overflow-x-auto pb-1">{([['all','Todos'],['contact','Contactos'],['customer','Clientes'],['user','Usuarios']] as [DirectoryKind,string][]).map(([kind,label])=><button type="button" key={kind} onClick={()=>setDirectoryKind(kind)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${directoryKind===kind?'border-brand-200 bg-brand-50 text-brand-700':'border-[#e7eaf0] bg-white text-[#7a8097]'}`}>{label}</button>)}</div>
    <div className="max-h-[390px] space-y-2 overflow-y-auto pr-1">{directory.length?directory.map(item=><button type="button" key={item.id} onClick={()=>chooseDirectory(item)} onDoubleClick={()=>void performCall(item)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${selectedTarget?.phone===item.phone?'border-brand-300 bg-brand-50':'border-[#edf0f4] bg-white hover:border-brand-200 hover:bg-[#fbfdfc]'}`}>{item.avatar_url?<img src={item.avatar_url} alt="" className="h-11 w-11 shrink-0 rounded-2xl object-cover"/>:<span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#edf8f4] text-xs font-bold text-brand-700">{item.name.slice(0,2).toUpperCase()}</span>}<span className="min-w-0 flex-1"><strong className="block truncate text-sm text-ink-900">{item.name}</strong><small className="mt-0.5 block truncate text-[11px] text-[#9298ad]">{item.phone} · {item.subtitle}</small></span><span className="rounded-full bg-[#f2f7f5] px-2 py-1 text-[9px] font-semibold text-[#60756e]">{kindLabel(item.kind)}</span></button>):<div className="rounded-2xl border border-dashed border-[#dde3ea] p-8 text-center text-sm text-[#9aa0b4]">No hay resultados en el directorio.</div>}</div>
  </div>

  const keypadPanel=(dark=false)=>dark?<div className="wam-keypad-panel"><div className="wam-number"><div style={{minWidth:0,flex:1}}><PhoneInput value={form.phone} onChange={phone=>{setSelectedTarget(null);setForm({...form,phone})}} placeholder="Número de WhatsApp" variant="dark" hideValidationMessage/></div><button onClick={backspace}><Delete size={14}/></button></div><div className="wam-keypad">{keypad.map(key=><button key={key} onClick={()=>appendDigit(key)}>{key}</button>)}</div></div>:<div className="space-y-3"><div><label className="label">Nombre del contacto</label><input className="field" value={form.display_name} onChange={e=>setForm({...form,display_name:e.target.value})} placeholder="Nombre opcional"/></div><div><label className="label">WhatsApp *</label><div className="flex gap-2"><div className="min-w-0 flex-1"><PhoneInput required value={form.phone} onChange={phone=>{setSelectedTarget(null);setForm({...form,phone})}} placeholder="809 555 0000"/></div><button type="button" onClick={backspace} className="btn-secondary px-3"><Delete className="h-4 w-4"/></button></div></div><div className="grid grid-cols-3 gap-2">{keypad.map(key=><button key={key} type="button" onClick={()=>appendDigit(key)} className="rounded-2xl border border-[#e7ebf1] bg-white px-3 py-3 text-center text-lg font-semibold text-[#2d3348] transition hover:border-brand-200 hover:bg-brand-50">{key}</button>)}</div></div>

  const selectedTargetPanel=(dark=false)=>selectedTarget?(dark?<div className="wam-target">{selectedTarget.avatar_url?<img src={selectedTarget.avatar_url} className="wam-avatar" alt=""/>:<span>{(selectedTarget.display_name||selectedTarget.phone||'?').slice(0,2).toUpperCase()}</span>}<div><strong>{selectedTarget.display_name||selectedTarget.phone}</strong><small>{selectedTarget.phone}</small></div><button onClick={()=>setSelectedTarget(null)}><X size={13}/></button></div>:<div className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-xs font-bold text-brand-700 shadow-sm">{(selectedTarget.display_name||selectedTarget.phone||'?').slice(0,2).toUpperCase()}</span><div className="min-w-0 flex-1"><strong className="block truncate text-sm text-ink-900">{selectedTarget.display_name||selectedTarget.phone}</strong><small className="block truncate text-[11px] text-[#7d879d]">{selectedTarget.phone}</small></div><button type="button" className="rounded-xl bg-white p-2 text-[#8990a5]" onClick={()=>setSelectedTarget(null)}><X className="h-4 w-4"/></button></div>):null

  const phaseText=(status:string)=>status==='ringing'?'Timbrando…':status==='connecting'?'Conectando…':status==='active'?'Activa':status==='held'?'En espera':status==='transferred'?'Transferida':callStatusText(status)

  const activeControls=()=>{
    if(!currentCall)return null
    const incomingRinging=currentCall.direction==='in'&&visualStatus==='ringing'
    const outgoingRinging=currentCall.direction==='out'&&visualStatus==='ringing'
    const connecting=visualStatus==='connecting'
    const active=visualStatus==='active'
    const held=visualStatus==='held'
    const transferred=visualStatus==='transferred'
    const connectedPhase=active||held
    const audioConnected=audioCallId===currentCall.id
    const sameTarget=String(selectedTarget?.phone||'').replace(/\D/g,'')===String(currentCall.phone||'').replace(/\D/g,'')
    const callAvatar=String(currentCall?.metadata?.avatar_url||currentCall?.avatar_url||currentCall?.profile_picture_url||(sameTarget?selectedTarget?.avatar_url:'')||'').trim()
    const timerText=connectedPhase||transferred?`${durationLabel(liveDuration)} · ${phaseText(visualStatus)}`:phaseText(visualStatus)
    return <>
      {videoActive||videoPending?<div className="wam-video-stage">
        <canvas ref={remoteVideoRef} className="wam-remote-video"/>
        {(!videoActive||!videoRemote)&&<div className="wam-video-overlay">
          {callAvatar?<img src={callAvatar} alt=""/>:<div className="avatar">{(currentCall.display_name||currentCall.phone||'?').slice(0,2).toUpperCase()}</div>}
          <strong>{currentCall.display_name||currentCall.phone||'Contacto WhatsApp'}</strong>
          <small>{videoPending?'Esperando que el contacto acepte el video…':'Video conectado'}</small>
          <div className="wam-video-pill">{timerText}</div>
        </div>}
        <video ref={localVideoRef} className="wam-local-video" autoPlay muted playsInline/>
      </div>:<div className="wam-contact">
        {callAvatar?<img className="avatar" src={callAvatar} alt=""/>:<div className="avatar">{(currentCall.display_name||currentCall.phone||'?').slice(0,2).toUpperCase()}</div>}
        <h1>{currentCall.display_name||currentCall.phone||'Contacto WhatsApp'}</h1>
        <p>{currentCall.phone||''} · {currentCall.direction==='out'?'Saliente':'Entrante'}</p>
        <div className="wam-timer">{timerText}</div>
      </div>}
      {pipTransfer&&connectedPhase?<div className="wam-transfer"><select value={transferStaff} onChange={e=>setTransferStaff(e.target.value)}><option value="">Selecciona un agente</option>{staff.map(x=><option key={x.id} value={x.id}>{x.name} {x.last_name||''}</option>)}</select><div className="row"><button onClick={()=>setPipTransfer(false)}>Cancelar</button><button className="primary" disabled={!transferStaff} onClick={()=>action(currentCall,'transfer',transferStaff)}>Transferir</button></div></div>:<div className="wam-controls">
        {incomingRinging&&<><button className="active" onClick={()=>void answerIncoming(currentCall)}><PhoneIncoming size={18}/>Contestar</button><button className="danger" onClick={()=>action(currentCall,'reject')}><PhoneOff size={18}/>Rechazar</button></>}
        {outgoingRinging&&<button className="danger wide" onClick={()=>action(currentCall,'hangup')}><PhoneOff size={18}/>Cancelar llamada</button>}
        {connecting&&<><button className="wide" disabled><RotateCw size={16}/>Conectando llamada…</button><button className="danger wide" onClick={()=>action(currentCall,'hangup')}><PhoneOff size={18}/>Colgar</button></>}
        {connectedPhase&&!audioConnected&&<button className="wide" disabled={audioBusy===currentCall.id} onClick={()=>connectAudio(currentCall.id)}><RotateCw size={16}/>{audioBusy===currentCall.id?'Conectando audio…':'Reconectar audio'}</button>}
        {connectedPhase&&audioConnected&&<button className={muted?'active':''} onClick={toggleMute}>{muted?<MicOff size={18}/>:<Mic size={18}/>}<span>{muted?'Activar':'Silenciar'}</span></button>}
        {active&&audioConnected&&!videoActive&&!videoPending&&videoSupported&&<button disabled={Boolean(videoBusy)} onClick={()=>void startVideoUpgrade(currentCall)}><Camera size={18}/><span>{videoBusy==='start'?'Preparando…':'Video'}</span></button>}
        {connectedPhase&&(videoActive||videoPending)&&<button className={videoActive?'active':''} disabled={Boolean(videoBusy)} onClick={()=>void stopVideoUpgrade(currentCall)}><CameraOff size={18}/><span>{videoPending?'Cancelar video':'Volver a voz'}</span></button>}
        {active&&<button onClick={()=>action(currentCall,'hold')}><Pause size={18}/><span>Espera</span></button>}
        {held&&<button onClick={()=>action(currentCall,'resume')}><Play size={18}/><span>Reanudar</span></button>}
        {connectedPhase&&<button onClick={()=>setPipTransfer(true)}><ArrowRightLeft size={18}/><span>Transferir</span></button>}
        {connectedPhase&&<button className="danger wide" onClick={()=>action(currentCall,'hangup')}><PhoneOff size={18}/><span>Colgar</span></button>}
        {transferred&&<div className="wide" style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:44,color:'rgba(255,255,255,.62)',fontSize:11,fontWeight:800}}>La llamada fue transferida a otro agente.</div>}
      </div>}
    </>
  }

  const softphoneSurface=()=><div className="wam-card">
    <div className="wam-head"><div><div className="wam-brand">WAMERCIO</div><div className="wam-status">{currentCall?'Llamada WhatsApp':busy?'Preparando llamada…':settings?.engine_ready?'Softphone · disponible':'Softphone · esperando sesión'}</div></div><div style={{display:'flex',gap:7}}><button className="wam-icon" title="Volver a la aplicación" onClick={()=>{window.focus();pipWindow?.close()}}><ExternalLink size={17}/></button></div></div>
    {error&&<div style={{margin:'10px 12px 0',border:'1px solid rgba(248,113,113,.35)',borderRadius:12,background:'rgba(127,29,29,.35)',padding:'9px 10px',fontSize:10,fontWeight:800,color:'#fecaca'}}>{error}</div>}
    {!storeId?<div className="wam-empty"><PhoneOff size={26}/><strong>Selecciona una tienda</strong><small>El softphone necesita un negocio activo.</small></div>:loading&&!settings?<div className="wam-empty"><RotateCw className="animate-spin" size={24}/><strong>Cargando softphone…</strong></div>:currentCall?activeControls():busy?<div className="wam-contact">{selectedTarget?.avatar_url?<img className="avatar" src={selectedTarget.avatar_url} alt=""/>:<div className="avatar">{(selectedTarget?.display_name||form.display_name||form.phone||'?').slice(0,2).toUpperCase()}</div>}<h1>{selectedTarget?.display_name||form.display_name||form.phone||'Contacto WhatsApp'}</h1><p>{form.phone||selectedTarget?.phone||''} · Saliente</p><div className="wam-timer">Preparando llamada…</div></div>:<><div className="wam-tabs"><button className={tab==='directory'?'active':''} onClick={()=>setTab('directory')}><BookUser size={15}/>Directorio</button><button className={tab==='keypad'?'active':''} onClick={()=>setTab('keypad')}><Keyboard size={15}/>Teclado</button></div>{tab==='directory'?directoryPanel(true):keypadPanel(true)}<div className="wam-foot">{selectedTargetPanel(true)}<button className="wam-call" disabled={!settings?.is_active||busy||!form.phone.trim()} onClick={()=>void startCall()}><PhoneCall size={16}/>{busy?'Llamando...':'Llamar ahora'}</button></div></>}
  </div>

  const pipContent=pipWindow&&!pipWindow.closed?createPortal(<div className="wam-pip">{softphoneSurface()}</div>,pipWindow.document.body):null
  const incomingNeedsFallback=Boolean(open&&currentCall&&currentCall.direction==='in'&&visualStatus==='ringing'&&(!pipWindow||pipWindow.closed))
  const incomingFallback=typeof document!=='undefined'&&incomingNeedsFallback?createPortal(<><style>{inlineSoftphoneCss}</style><div className="wam-inline-layer"><div className="wam-inline-frame"><div className="wam-pip">{softphoneSurface()}</div></div></div></>,document.body):null

  // One canonical React surface is reused in two browser containers. Document
  // PiP is preferred; when Chromium blocks creating a new PiP without a user
  // gesture, the exact same surface is shown immediately in-app (HDN pattern).
  // Contestar consumes the real user gesture to move that surface into PiP.
  return <>{pipContent}{incomingFallback}</>
})
CallsSoftphone.displayName='CallsSoftphone'

export default CallsSoftphone
