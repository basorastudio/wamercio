'use client'

import {forwardRef,useCallback,useEffect,useImperativeHandle,useMemo,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {Loading,Status} from '@/components/ui'
import {api,dateTime} from '@/lib/api'
import {openWamercioCallAudio,type WamercioBrowserCall} from '@/lib/calls-webrtc'
import {
  ArrowRightLeft,Delete,ExternalLink,FileText,Mic,MicOff,Pause,PhoneCall,PhoneIncoming,PhoneOff,Play,Radio,
  Search,UserRound,UsersRound,X,ContactRound,ShoppingBag,Keyboard,BookUser,RotateCw
} from 'lucide-react'

const terminalStatuses=new Set(['completed','missed','rejected','failed'])
const keypad=['1','2','3','4','5','6','7','8','9','*','0','#']

type DirectoryKind='all'|'contact'|'customer'|'user'
type DialerTab='directory'|'keypad'

export type SoftphoneTarget={phone?:string;display_name?:string;conversation_id?:string;kind?:Exclude<DirectoryKind,'all'>;avatar_url?:string}
export type CallsSoftphoneHandle={
  openPictureInPicture:()=>Promise<boolean>
  startDirectCall:(target:SoftphoneTarget,storeIdOverride?:string)=>Promise<void>
}

type DirectoryItem=SoftphoneTarget&{id:string;kind:Exclude<DirectoryKind,'all'>;name:string;phone:string;subtitle:string;avatar_url?:string}

const pipCss=`
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#10241f}*{box-sizing:border-box}body{margin:0;min-width:320px;min-height:100vh;background:#10241f;color:#fff;overflow:hidden}button,input{font:inherit}.wam-pip{min-height:100vh;padding:12px;background:radial-gradient(circle at top right,rgba(0,168,132,.22),transparent 34%),#10241f}.wam-card{min-height:calc(100vh - 24px);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.08);border-radius:24px;background:#17332c;box-shadow:0 20px 60px rgba(0,0,0,.35)}.wam-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08)}.wam-brand{font-size:10px;font-weight:900;letter-spacing:.16em;color:#77e3c6}.wam-status{margin-top:4px;font-size:11px;font-weight:750;color:rgba(255,255,255,.62)}.wam-icon{display:grid;place-items:center;width:38px;height:38px;border:0;border-radius:13px;background:rgba(255,255,255,.08);color:#fff;cursor:pointer}.wam-tabs{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:10px 12px 8px;border-bottom:1px solid rgba(255,255,255,.06)}.wam-tabs button{display:flex;height:38px;align-items:center;justify-content:center;gap:7px;border:0;border-radius:13px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.52);font-size:11px;font-weight:900;cursor:pointer}.wam-tabs button.active{background:#00a884;color:#fff;box-shadow:0 7px 18px rgba(0,168,132,.18)}.wam-dir{display:flex;min-height:0;flex:1;flex-direction:column;padding:10px 12px 0}.wam-search{display:flex;align-items:center;gap:8px;height:44px;padding:0 12px;border:1px solid rgba(255,255,255,.1);border-radius:15px;background:rgba(255,255,255,.055);color:rgba(255,255,255,.42)}.wam-search input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:#fff;font-size:12px;font-weight:750}.wam-filters{display:flex;gap:6px;padding:8px 0;overflow-x:auto;scrollbar-width:none}.wam-filters button{display:flex;flex:0 0 auto;height:30px;align-items:center;gap:5px;padding:0 9px;border:1px solid rgba(255,255,255,.08);border-radius:999px;background:rgba(255,255,255,.045);color:rgba(255,255,255,.5);font-size:9px;font-weight:900;cursor:pointer}.wam-filters button.active{border-color:rgba(119,227,198,.55);background:rgba(0,168,132,.2);color:#77e3c6}.wam-list{display:flex;min-height:0;flex:1;flex-direction:column;gap:6px;overflow-y:auto;padding:0 1px 9px}.wam-item{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:9px;width:100%;min-height:59px;padding:8px 9px;border:1px solid rgba(255,255,255,.07);border-radius:15px;background:rgba(255,255,255,.04);color:#fff;text-align:left;cursor:pointer}.wam-item:hover,.wam-item.selected{border-color:rgba(119,227,198,.55);background:rgba(0,168,132,.13)}.wam-avatar{display:grid;place-items:center;width:42px;height:42px;align-self:center;border-radius:13px;object-fit:cover;background:#e7fce7;color:#008069;font-size:10px;font-weight:1000}.wam-copy{display:flex;min-width:0;align-self:center;flex-direction:column}.wam-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:950}.wam-copy small{margin-top:2px;overflow:hidden;color:rgba(255,255,255,.43);font-size:9px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}.wam-kind{align-self:start;padding:4px 6px;border-radius:999px;font-size:8px;font-weight:950;background:rgba(119,227,198,.12);color:#9ef0d8}.wam-keypad-panel{display:flex;min-height:0;flex:1;flex-direction:column;padding:12px}.wam-number{display:flex;align-items:center;gap:8px;height:48px;padding:0 8px 0 13px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(255,255,255,.055)}.wam-number input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:#fff;text-align:center;font-size:17px;font-weight:950;letter-spacing:.035em}.wam-keypad{display:grid;flex:1;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(4,1fr);gap:7px;padding-top:10px}.wam-keypad button{min-height:46px;border:0;border-radius:15px;background:rgba(255,255,255,.06);color:#fff;font-size:16px;font-weight:950;cursor:pointer}.wam-keypad button:hover{background:rgba(0,168,132,.2);color:#9ef0d8}.wam-foot{display:flex;flex-direction:column;gap:7px;padding:9px 12px 12px;border-top:1px solid rgba(255,255,255,.08)}.wam-target{display:grid;grid-template-columns:34px minmax(0,1fr) 28px;gap:8px;align-items:center;padding:7px 8px;border:1px solid rgba(119,227,198,.25);border-radius:13px;background:rgba(0,168,132,.1)}.wam-target>span{display:grid;width:34px;height:34px;place-items:center;border-radius:11px;background:#e7fce7;color:#008069;font-size:9px;font-weight:1000}.wam-target>div{display:flex;min-width:0;flex-direction:column}.wam-target strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.wam-target small{margin-top:1px;color:rgba(255,255,255,.4);font-size:8px}.wam-target>button{display:grid;width:28px;height:28px;place-items:center;border:0;border-radius:9px;background:rgba(255,255,255,.07);color:rgba(255,255,255,.55);cursor:pointer}.wam-call{display:flex;height:48px;align-items:center;justify-content:center;gap:8px;border:0;border-radius:15px;background:#00a884;color:#fff;font-size:12px;font-weight:1000;box-shadow:0 8px 20px rgba(0,168,132,.2);cursor:pointer}.wam-call:disabled{opacity:.38;cursor:not-allowed;box-shadow:none}.wam-contact{display:flex;flex:1;min-height:230px;flex-direction:column;align-items:center;justify-content:center;padding:22px 18px;text-align:center}.wam-contact .avatar{display:grid;place-items:center;width:82px;height:82px;border-radius:999px;border:4px solid #fff;background:#e7fce7;color:#008069;font-size:22px;font-weight:1000;box-shadow:0 8px 24px rgba(0,0,0,.22)}.wam-contact h1{max-width:100%;margin:18px 0 0;font-size:22px;line-height:1.15;font-weight:1000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wam-contact p{margin:6px 0 0;color:rgba(255,255,255,.48);font-size:12px;font-weight:750}.wam-timer{margin-top:14px;padding:7px 13px;border-radius:999px;background:rgba(255,255,255,.08);font-size:12px;font-weight:900;letter-spacing:.08em}.wam-controls{display:grid;grid-template-columns:1fr 1fr;gap:9px;padding:12px;border-top:1px solid rgba(255,255,255,.08)}.wam-controls button{min-height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;border:0;border-radius:17px;background:rgba(255,255,255,.08);color:#fff;font-size:11px;font-weight:900;cursor:pointer}.wam-controls button.active{background:#00a884}.wam-controls button.danger{background:#ef4444}.wam-controls button.wide{grid-column:1/-1;min-height:44px;flex-direction:row;background:#00a884}.wam-controls button:disabled{opacity:.38;cursor:not-allowed}.wam-transfer{padding:12px;border-top:1px solid rgba(255,255,255,.08)}.wam-transfer select{width:100%;padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:#21443b;color:white}.wam-transfer .row{display:flex;gap:8px;margin-top:8px}.wam-transfer .row button{flex:1;padding:10px;border:0;border-radius:12px;background:rgba(255,255,255,.08);color:#fff;font-weight:800}.wam-transfer .row button.primary{background:#00a884}.wam-empty{display:flex;min-height:165px;flex:1;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center;color:rgba(255,255,255,.45)}
`

const embeddedCss=pipCss.replace(/:root\{[^}]*\}/,'').replace(/\*\{[^}]*\}/,'').replace(/body\{[^}]*\}/,'').replace(/button,input\{[^}]*\}/,'')

const kindLabel=(kind:Exclude<DirectoryKind,'all'>)=>kind==='customer'?'Cliente':kind==='user'?'Usuario':'Contacto'
const callStatusText=(status:string)=>({ringing:'Timbrando',connecting:'Conectando',active:'Activa',held:'En espera',transferred:'Transferida',completed:'Finalizada',missed:'Perdida',rejected:'Rechazada',failed:'Fallida'} as Record<string,string>)[status]||status

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
  const[muted,setMuted]=useState(false)
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

  const closeAudio=useCallback(()=>{
    browserCall.current?.close()
    browserCall.current=null
    setAudioCallId('')
    setMuted(false)
  },[])

  const load=useCallback((silent=false)=>{
    if(!storeId)return
    if(!silent)setLoading(true)
    const request=silent
      ?Promise.all([api(`/calls/settings?store_id=${storeId}`),api<any[]>(`/calls?store_id=${storeId}`)]).then(([s,c])=>{setSettings(s);setRows(c)})
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

  useEffect(()=>{
    if(!audioCallId)return
    const row=rows.find(x=>x.id===audioCallId)
    if(row&&terminalStatuses.has(row.status))closeAudio()
  },[rows,audioCallId,closeAudio])

  const currentCall=useMemo(()=>rows.find(x=>['ringing','connecting','active','held','transferred'].includes(x.status))||null,[rows])
  useEffect(()=>{
    if(currentCall){previousCallId.current=currentCall.id;return}
    if(previousCallId.current){
      previousCallId.current=''
      setError('')
      setPipTransfer(false)
      setTransferStaff('')
      setTab('directory')
    }
  },[currentCall?.id])
  useEffect(()=>{if(typeof window==='undefined'||!currentCall||currentCall.direction!=='in'||currentCall.status!=='ringing'||lastIncoming.current===currentCall.id)return;lastIncoming.current=currentCall.id;window.dispatchEvent(new CustomEvent('wamercio:incoming-call',{detail:{id:currentCall.id,store_id:storeId,phone:currentCall.phone,display_name:currentCall.display_name,conversation_id:currentCall.conversation_id}}))},[currentCall,storeId])

  const directory=useMemo<DirectoryItem[]>(()=>{
    const customerItems=customers.map((x:any)=>({id:`customer:${x.id}`,kind:'customer' as const,name:x.name||x.whatsapp_name||x.phone||'Cliente',phone:String(x.phone||'').replace(/\D/g,''),subtitle:x.whatsapp_name&&x.whatsapp_name!==x.name?`WhatsApp: ${x.whatsapp_name}`:'Cliente WAMERCIO',avatar_url:x.profile_picture_url,conversation_id:x.conversation_id||''}))
    const customerPhones=new Set(customerItems.map(x=>x.phone).filter(Boolean))
    const contactItems=contacts.map((x:any)=>({id:`contact:${x.id}`,kind:'contact' as const,name:x.name||x.whatsapp_name||x.phone||'Contacto',phone:String(x.phone||'').replace(/\D/g,''),subtitle:x.whatsapp_name&&x.whatsapp_name!==x.name?`WhatsApp: ${x.whatsapp_name}`:'Contacto de WhatsApp',avatar_url:x.profile_picture_url,conversation_id:x.conversation_id||''})).filter(x=>x.phone&&!customerPhones.has(x.phone))
    const userItems=staff.map((x:any)=>({id:`user:${x.id}`,kind:'user' as const,name:[x.name,x.last_name].filter(Boolean).join(' ')||x.phone||'Usuario',phone:String(x.phone||'').replace(/\D/g,''),subtitle:x.role?`Usuario · ${x.role}`:'Usuario operativo',avatar_url:x.profile_picture_url,conversation_id:''}))
    const all=[...contactItems,...customerItems,...userItems].filter(x=>x.phone)
    const q=directorySearch.trim().toLowerCase()
    return all.filter(x=>(directoryKind==='all'||x.kind===directoryKind)&&(!q||(x.name+' '+x.phone+' '+x.subtitle).toLowerCase().includes(q))).slice(0,80)
  },[customers,contacts,staff,directorySearch,directoryKind])

  const connectAudio=async(id:string)=>{
    setAudioBusy(id)
    setError('')
    try{
      if(browserCall.current?.id===id)return
      closeAudio()
      const bc=await openWamercioCallAudio(id)
      browserCall.current=bc
      setAudioCallId(id)
      setMuted(false)
    }catch(e:any){
      setError(e.message||'No se pudo conectar el audio del navegador.')
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
      const created=await api<any>('/calls',{method:'POST',body:JSON.stringify({store_id:targetStore,phone,display_name:chosen.display_name||form.display_name||'',conversation_id:chosen.conversation_id||form.conversation_id||''})})
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

  const startCall=async(e?:React.FormEvent)=>{e?.preventDefault();await performCall()}

  const action=async(x:any,a:string,assigned_staff_id='')=>{
    setError('')
    try{
      const result=await api<any>(`/calls/${x.id}`,{method:'PATCH',body:JSON.stringify({action:a,assigned_staff_id})})
      const fallbackStatus=a==='hangup'?'completed':a==='reject'?'rejected':''
      const nextStatus=String(result?.status||result?.engine?.status||fallbackStatus).trim()
      if(nextStatus)setRows(v=>v.map(row=>row.id===x.id?{...row,status:nextStatus,assigned_staff_id:assigned_staff_id||row.assigned_staff_id}:row))
      if(a==='answer')await connectAudio(x.id)
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
    setPipOpening(true)
    try{
      const win=await manager.requestWindow({width:380,height:640}) as Window
      win.document.title='WAMERCIO Softphone'
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

  const keypadPanel=(dark=false)=>dark?<div className="wam-keypad-panel"><div className="wam-number"><input value={form.phone} onChange={e=>{setSelectedTarget(null);setForm({...form,phone:e.target.value})}} placeholder="Número de WhatsApp"/><button onClick={backspace}><Delete size={14}/></button></div><div className="wam-keypad">{keypad.map(key=><button key={key} onClick={()=>appendDigit(key)}>{key}</button>)}</div></div>:<div className="space-y-3"><div><label className="label">Nombre del contacto</label><input className="field" value={form.display_name} onChange={e=>setForm({...form,display_name:e.target.value})} placeholder="Nombre opcional"/></div><div><label className="label">WhatsApp *</label><div className="flex gap-2"><input required inputMode="tel" className="field text-lg font-semibold tracking-[.02em]" value={form.phone} onChange={e=>{setSelectedTarget(null);setForm({...form,phone:e.target.value})}} placeholder="18091234567"/><button type="button" onClick={backspace} className="btn-secondary px-3"><Delete className="h-4 w-4"/></button></div></div><div className="grid grid-cols-3 gap-2">{keypad.map(key=><button key={key} type="button" onClick={()=>appendDigit(key)} className="rounded-2xl border border-[#e7ebf1] bg-white px-3 py-3 text-center text-lg font-semibold text-[#2d3348] transition hover:border-brand-200 hover:bg-brand-50">{key}</button>)}</div></div>

  const selectedTargetPanel=(dark=false)=>selectedTarget?(dark?<div className="wam-target"><span>{(selectedTarget.display_name||selectedTarget.phone||'?').slice(0,2).toUpperCase()}</span><div><strong>{selectedTarget.display_name||selectedTarget.phone}</strong><small>{selectedTarget.phone}</small></div><button onClick={()=>setSelectedTarget(null)}><X size={13}/></button></div>:<div className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-xs font-bold text-brand-700 shadow-sm">{(selectedTarget.display_name||selectedTarget.phone||'?').slice(0,2).toUpperCase()}</span><div className="min-w-0 flex-1"><strong className="block truncate text-sm text-ink-900">{selectedTarget.display_name||selectedTarget.phone}</strong><small className="block truncate text-[11px] text-[#7d879d]">{selectedTarget.phone}</small></div><button type="button" className="rounded-xl bg-white p-2 text-[#8990a5]" onClick={()=>setSelectedTarget(null)}><X className="h-4 w-4"/></button></div>):null

  const activeControls=(dark=false,inPip=false)=>{
    if(!currentCall)return null
    if(dark)return <>
      <div className="wam-contact"><div className="avatar">{(currentCall.display_name||currentCall.phone||'?').slice(0,2).toUpperCase()}</div><h1>{currentCall.display_name||currentCall.phone||'Contacto WhatsApp'}</h1><p>{currentCall.phone||''} · {currentCall.direction==='out'?'Saliente':'Entrante'}</p><div className="wam-timer">{currentCall.duration_seconds||0}s · {callStatusText(currentCall.status)}</div></div>
      {pipTransfer&&<div className="wam-transfer"><select value={transferStaff} onChange={e=>setTransferStaff(e.target.value)}><option value="">Selecciona un agente</option>{staff.map(x=><option key={x.id} value={x.id}>{x.name} {x.last_name||''}</option>)}</select><div className="row"><button onClick={()=>setPipTransfer(false)}>Cancelar</button><button className="primary" disabled={!transferStaff} onClick={()=>action(currentCall,'transfer',transferStaff)}>Transferir</button></div></div>}
      {!pipTransfer&&<div className="wam-controls">{currentCall.direction==='in'&&currentCall.status==='ringing'&&<><button className="active" onClick={()=>action(currentCall,'answer')}><PhoneIncoming size={18}/>Contestar</button><button className="danger" onClick={()=>action(currentCall,'reject')}><PhoneOff size={18}/>Rechazar</button></>}{(['connecting','active','held','transferred'].includes(currentCall.status)||(currentCall.direction==='out'&&currentCall.status==='ringing'))&&audioCallId!==currentCall.id&&<button className="wide" disabled={audioBusy===currentCall.id} onClick={()=>connectAudio(currentCall.id)}><RotateCw size={16}/>{audioBusy===currentCall.id?'Conectando...':'Conectar audio'}</button>}{audioCallId===currentCall.id&&<button className={muted?'active':''} onClick={toggleMute}>{muted?<MicOff size={18}/>:<Mic size={18}/>} {muted?'Activar':'Silenciar'}</button>}{currentCall.status==='active'&&<button onClick={()=>action(currentCall,'hold')}><Pause size={18}/>Espera</button>}{currentCall.status==='held'&&<button onClick={()=>action(currentCall,'resume')}><Play size={18}/>Reanudar</button>}{['active','held'].includes(currentCall.status)&&<button onClick={()=>setPipTransfer(true)}><ArrowRightLeft size={18}/>Transferir</button>}{inPip&&<button onClick={()=>{window.focus();pipWindow?.close()}}><ExternalLink size={18}/>Aplicación</button>}{['active','held','connecting','ringing','transferred'].includes(currentCall.status)&&<button className="danger" onClick={()=>action(currentCall,'hangup')}><PhoneOff size={18}/>Colgar</button>}</div>}
    </>
    return <div className="rounded-3xl border border-[#dfe5ea] bg-[#f8fafb] p-4"><div className="flex items-start gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600"><PhoneCall className="h-5 w-5"/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-ink-900">{currentCall.display_name||currentCall.phone||'Contacto WhatsApp'}</strong><Status value={currentCall.status}/>{audioCallId===currentCall.id&&<span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Audio conectado</span>}</div><div className="mt-1 text-[11px] text-[#9aa0b4]">{currentCall.direction==='out'?'Saliente':'Entrante'} · {dateTime(currentCall.started_at)} · {currentCall.duration_seconds||0}s{currentCall.assigned_staff_name?` · ${currentCall.assigned_staff_name}`:''}</div>{(currentCall.recording_url||currentCall.transcript)&&<div className="mt-2 flex flex-wrap gap-2">{currentCall.recording_url&&<a href={currentCall.recording_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700"><ExternalLink className="h-3.5 w-3.5"/>Grabación</a>}{currentCall.transcript&&<span title={currentCall.transcript} className="inline-flex max-w-[360px] items-center gap-1 truncate text-[11px] text-[#6f758a]"><FileText className="h-3.5 w-3.5 shrink-0"/>{currentCall.transcript}</span>}</div>}</div></div><div className="mt-4 flex flex-wrap gap-2">{currentCall.direction==='in'&&currentCall.status==='ringing'&&<><button className="btn-primary" onClick={()=>{void openPictureInPicture();void action(currentCall,'answer')}}><PhoneIncoming className="h-4 w-4"/>Contestar</button><button className="btn-secondary text-rose-700" onClick={()=>action(currentCall,'reject')}><PhoneOff className="h-4 w-4"/>Rechazar</button></>}{(['connecting','active','held','transferred'].includes(currentCall.status)||(currentCall.direction==='out'&&currentCall.status==='ringing'))&&audioCallId!==currentCall.id&&<button disabled={audioBusy===currentCall.id} className="btn-secondary" onClick={()=>connectAudio(currentCall.id)}><Mic className="h-4 w-4"/>{audioBusy===currentCall.id?'Conectando...':'Conectar audio'}</button>}{audioCallId===currentCall.id&&<button className={`btn-secondary ${muted?'text-amber-700':''}`} onClick={toggleMute}>{muted?<MicOff className="h-4 w-4"/>:<Mic className="h-4 w-4"/>}{muted?'Activar micrófono':'Silenciar'}</button>}{currentCall.status==='active'&&<button className="btn-secondary" onClick={()=>action(currentCall,'hold')}><Pause className="h-4 w-4"/>Espera</button>}{currentCall.status==='held'&&<button className="btn-secondary" onClick={()=>action(currentCall,'resume')}><Play className="h-4 w-4"/>Reanudar</button>}{['active','held'].includes(currentCall.status)&&<button className="btn-secondary" onClick={()=>setTransferFor(currentCall)}><ArrowRightLeft className="h-4 w-4"/>Transferir</button>}{['active','held','connecting','ringing','transferred'].includes(currentCall.status)&&<button className="btn-secondary text-rose-700" onClick={()=>action(currentCall,'hangup')}><PhoneOff className="h-4 w-4"/>Colgar</button>}</div></div>
  }

  const pipContent=pipWindow&&!pipWindow.closed?createPortal(<div className="wam-pip"><div className="wam-card"><div className="wam-head"><div><div className="wam-brand">WAMERCIO</div><div className="wam-status">{currentCall?'Llamada WhatsApp activa':busy?'Preparando llamada…':'Softphone · disponible'}</div></div><button className="wam-icon" title="Volver a la aplicación" onClick={()=>{window.focus();pipWindow.close()}}><ExternalLink size={17}/></button></div>{error&&<div style={{margin:'10px 12px 0',border:'1px solid rgba(248,113,113,.35)',borderRadius:12,background:'rgba(127,29,29,.35)',padding:'9px 10px',fontSize:10,fontWeight:800,color:'#fecaca'}}>{error}</div>}{currentCall?activeControls(true,true):busy?<div className="wam-contact"><div className="avatar">{(selectedTarget?.display_name||form.display_name||form.phone||'?').slice(0,2).toUpperCase()}</div><h1>{selectedTarget?.display_name||form.display_name||form.phone||'Contacto WhatsApp'}</h1><p>{form.phone||selectedTarget?.phone||''} · Saliente</p><div className="wam-timer">Preparando llamada…</div></div>:<><div className="wam-tabs"><button className={tab==='directory'?'active':''} onClick={()=>setTab('directory')}><BookUser size={15}/>Directorio</button><button className={tab==='keypad'?'active':''} onClick={()=>setTab('keypad')}><Keyboard size={15}/>Teclado</button></div>{tab==='directory'?directoryPanel(true):keypadPanel(true)}<div className="wam-foot">{selectedTargetPanel(true)}<button className="wam-call" disabled={!settings?.is_active||busy||!form.phone.trim()} onClick={()=>void startCall()}><PhoneCall size={16}/>{busy?'Llamando...':'Llamar ahora'}</button></div></>}</div></div>,pipWindow.document.body):null

  const embeddedContent=open&&(!pipWindow||pipWindow.closed)&&!pipOpening?<>
    <style>{embeddedCss}</style>
    <div className="fixed bottom-3 right-3 z-[75] h-[min(700px,calc(100dvh-24px))] w-[min(390px,calc(100vw-24px))] sm:bottom-4 sm:right-4">
      <div className="wam-card" style={{height:'100%',minHeight:0}}>
        <div className="wam-head">
          <div><div className="wam-brand">WAMERCIO</div><div className="wam-status">{currentCall?'Llamada WhatsApp activa':busy?'Preparando llamada…':settings?.engine_ready?'Softphone · disponible':'Softphone · esperando sesión'}</div></div>
          <div style={{display:'flex',gap:7}}>
            <button className="wam-icon" title="Ventana flotante" onClick={()=>void openPictureInPicture()}><ExternalLink size={17}/></button>
            <button className="wam-icon" title="Cerrar softphone" onClick={onClose}><X size={17}/></button>
          </div>
        </div>
        {error&&<div style={{margin:'10px 12px 0',border:'1px solid rgba(248,113,113,.35)',borderRadius:12,background:'rgba(127,29,29,.35)',padding:'9px 10px',fontSize:10,fontWeight:800,color:'#fecaca'}}>{error}</div>}
        {!storeId?<div className="wam-empty"><PhoneOff size={26}/><strong>Selecciona una tienda</strong><small>El softphone necesita un negocio activo.</small></div>:loading&&!settings?<div className="wam-empty"><RotateCw className="animate-spin" size={24}/><strong>Cargando softphone…</strong></div>:currentCall?activeControls(true,false):busy?<div className="wam-contact"><div className="avatar">{(selectedTarget?.display_name||form.display_name||form.phone||'?').slice(0,2).toUpperCase()}</div><h1>{selectedTarget?.display_name||form.display_name||form.phone||'Contacto WhatsApp'}</h1><p>{form.phone||selectedTarget?.phone||''} · Saliente</p><div className="wam-timer">Preparando llamada…</div></div>:<><div className="wam-tabs"><button className={tab==='directory'?'active':''} onClick={()=>setTab('directory')}><BookUser size={15}/>Directorio</button><button className={tab==='keypad'?'active':''} onClick={()=>setTab('keypad')}><Keyboard size={15}/>Teclado</button></div>{tab==='directory'?directoryPanel(true):keypadPanel(true)}<div className="wam-foot">{selectedTargetPanel(true)}<button className="wam-call" disabled={!settings?.is_active||busy||!form.phone.trim()} onClick={()=>void startCall()}><PhoneCall size={16}/>{busy?'Llamando...':'Llamar ahora'}</button></div></>}
      </div>
    </div>
  </>:null

  return <>
    {embeddedContent}
    {pipContent}
  </>
})
CallsSoftphone.displayName='CallsSoftphone'

export default CallsSoftphone
