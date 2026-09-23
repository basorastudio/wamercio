'use client'

import {useRouter} from 'next/navigation'
import {useEffect,useMemo,useRef,useState} from 'react'
import SuperAdminShell from '@/components/superadmin-shell'
import {api} from '@/lib/api'
import {phoneDisplay} from '@/components/phone-input'
import {WaChatHeader,WaChatListItem,WaComposerAction,WaComposerInput,WaConversationTimeline,WaEmptyChat,WaFilterChip,WaSendButton,WaSidebarSearch} from '@/components/whatsapp-ui/wa-ui'
import {WhatsAppMessageContent,type WhatsAppMessage} from '@/components/whatsapp-message-content'
import {
  ArrowDown,ArrowLeft,ArrowUp,BarChart3,CheckCheck,ChevronRight,Copy,Download,Eraser,
  Info,MessageCircleMore,Mic,MoreVertical,Paperclip,PhoneCall,RefreshCw,Search,Send,
  Store,Trash2,UserRound,X,Zap
} from 'lucide-react'

type Conv={
  id:string;owner_id:string;name:string;whatsapp:string;remote_jid:string;display_name:string;
  unread_count:number;last_message:string;last_message_at?:string|null;owner_status:string;profile_picture_url?:string;
  store_id?:string;store_name?:string;store_logo_url?:string;store_whatsapp?:string;store_slug?:string;store_address?:string;
  store_active?:boolean;store_count?:number;plan_name?:string;owner_created_at?:string
}
type Msg=WhatsAppMessage
type Filter='all'|'unread'|'active'|'inactive'
type QuickReply={title:string;body:string}

const quickReplies:QuickReply[]=[
  {title:'Saludo',body:'Hola 👋 Te atiende el equipo de soporte de WAMERCIO. ¿En qué podemos ayudarte hoy?'},
  {title:'Revisando',body:'Estamos revisando tu caso. En cuanto tengamos el diagnóstico te confirmamos por aquí.'},
  {title:'Captura',body:'¿Puedes enviarnos una captura de pantalla y describir qué estabas haciendo cuando ocurrió el problema?'},
  {title:'Datos del negocio',body:'Para validar el caso, confirma por favor el nombre del negocio y el número de WhatsApp vinculado en WAMERCIO.'},
  {title:'Resuelto',body:'La incidencia quedó corregida. Por favor prueba nuevamente y confírmanos si ya funciona correctamente.'},
]

const time=(v?:string|null)=>v?new Date(v).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'}):''
const dayTime=(v?:string|null)=>v?new Date(v).toLocaleString('es-DO',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—'
const label=(c:Conv)=>c.display_name||c.name||phoneDisplay(c.whatsapp)||'Comerciante'
const digits=(v?:string)=>String(v||'').replace(/\D/g,'')
const avatar=(c:Conv)=>c.profile_picture_url||c.store_logo_url||''
const fmtSeconds=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`

export default function AdminWhatsApp(){
  const router=useRouter()
  const[state,setState]=useState<any>({status:'disconnected',connected:false,linked:false})
  const[convs,setConvs]=useState<Conv[]>([])
  const[selected,setSelected]=useState<Conv|null>(null)
  const[messages,setMessages]=useState<Msg[]>([])
  const[search,setSearch]=useState('')
  const[filter,setFilter]=useState<Filter>('all')
  const[text,setText]=useState('')
  const[sending,setSending]=useState(false)
  const[sendingMedia,setSendingMedia]=useState(false)
  const[detailsOpen,setDetailsOpen]=useState(false)
  const[menuOpen,setMenuOpen]=useState(false)
  const[showQuick,setShowQuick]=useState(false)
  const[showPoll,setShowPoll]=useState(false)
  const[pollQuestion,setPollQuestion]=useState('')
  const[pollOptions,setPollOptions]=useState('Sí\nNo')
  const[sendingPoll,setSendingPoll]=useState(false)
  const[chatSearchOpen,setChatSearchOpen]=useState(false)
  const[chatSearch,setChatSearch]=useState('')
  const[chatSearchIndex,setChatSearchIndex]=useState(0)
  const[recording,setRecording]=useState(false)
  const[recordingSeconds,setRecordingSeconds]=useState(0)
  const[recordingSending,setRecordingSending]=useState(false)

  const fileInput=useRef<HTMLInputElement>(null)
  const bottom=useRef<HTMLDivElement>(null)
  const messageRefs=useRef<Record<string,HTMLDivElement|null>>({})
  const recorderRef=useRef<MediaRecorder|null>(null)
  const streamRef=useRef<MediaStream|null>(null)
  const chunksRef=useRef<Blob[]>([])
  const recordingCancelledRef=useRef(false)
  const recordingTimerRef=useRef<ReturnType<typeof setInterval>|null>(null)

  const refreshStatus=async()=>{try{setState(await api('/admin/whatsapp/status'))}catch{}}
  const refreshConvs=async()=>{try{const rows=await api<Conv[]>('/admin/whatsapp/conversations');setConvs(rows);setSelected(current=>current?({...current,...(rows.find(c=>c.owner_id===current.owner_id)||{})}):current)}catch{}}
  const loadMessages=async(c?:Conv|null)=>{const x=c||selected;if(!x?.id)return;try{const rows=await api<Msg[]>(`/admin/whatsapp/conversations/${x.id}/messages`);setMessages(rows);await api(`/admin/whatsapp/conversations/${x.id}/read`,{method:'PATCH'}).catch(()=>{});setConvs(v=>v.map(q=>q.owner_id===x.owner_id?{...q,unread_count:0}:q))}catch{}}

  useEffect(()=>{void refreshStatus();void refreshConvs();const t=setInterval(()=>{void refreshStatus();void refreshConvs();if(selected?.id)void loadMessages(selected)},3500);return()=>clearInterval(t)},[selected?.id])
  useEffect(()=>{if(!chatSearchOpen)bottom.current?.scrollIntoView({behavior:'smooth'})},[messages.length,chatSearchOpen])
  useEffect(()=>()=>{if(recordingTimerRef.current)clearInterval(recordingTimerRef.current);try{if(recorderRef.current&&recorderRef.current.state!=='inactive')recorderRef.current.stop()}catch{};streamRef.current?.getTracks().forEach(t=>t.stop())},[])

  const choose=async(c:Conv)=>{
    try{
      let x=c
      if(!c.id){const created=await api<any>('/admin/whatsapp/conversations',{method:'POST',body:JSON.stringify({owner_id:c.owner_id})});x={...c,...created,id:created.id}}
      setSelected(x);setMessages([]);setDetailsOpen(false);setMenuOpen(false);setChatSearchOpen(false);setChatSearch('');await loadMessages(x)
    }catch(e:any){alert(e.message)}
  }

  const send=async(e:React.FormEvent)=>{
    e.preventDefault();if(!selected?.id||!text.trim()||!connected)return
    const body=text.trim();setSending(true);setText('')
    try{const out=await api<any>(`/admin/whatsapp/conversations/${selected.id}/send`,{method:'POST',body:JSON.stringify({text:body})});setMessages(v=>[...v,{id:out.id,message_id:out.id,direction:'out',type:'text',body,status:'sent',occurred_at:out.occurred_at}]);setShowQuick(false);void refreshConvs()}catch(e:any){alert(e.message);setText(body)}finally{setSending(false)}
  }

  const sendMedia=async(file?:File)=>{
    if(!file||!selected?.id||!connected)return
    if(file.size>32*1024*1024){alert('El archivo supera el límite de 32 MB.');return}
    setSendingMedia(true)
    try{const form=new FormData();form.append('file',file);if(text.trim())form.append('caption',text.trim());const out=await api<Msg>(`/admin/whatsapp/conversations/${selected.id}/send-media`,{method:'POST',body:form});setText('');setMessages(v=>[...v,{...out,direction:'out',status:'sent'} as Msg]);void refreshConvs()}catch(e:any){alert(e.message)}finally{setSendingMedia(false);if(fileInput.current)fileInput.current.value=''}
  }

  const startRecording=async()=>{
    if(!selected?.id||!connected||recording)return
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){alert('Tu navegador no permite grabar notas de voz.');return}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}})
      const preferred=['audio/ogg;codecs=opus','audio/webm;codecs=opus','audio/webm']
      const mime=preferred.find(v=>typeof MediaRecorder.isTypeSupported!=='function'||MediaRecorder.isTypeSupported(v))||''
      const recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream)
      streamRef.current=stream;recorderRef.current=recorder;chunksRef.current=[];recordingCancelledRef.current=false
      recorder.ondataavailable=e=>{if(e.data?.size)chunksRef.current.push(e.data)}
      recorder.onstop=()=>{const cancelled=recordingCancelledRef.current;const type=recorder.mimeType||mime||'audio/webm';const chunks=[...chunksRef.current];stream.getTracks().forEach(t=>t.stop());streamRef.current=null;recorderRef.current=null;chunksRef.current=[];if(recordingTimerRef.current)clearInterval(recordingTimerRef.current);recordingTimerRef.current=null;setRecording(false);setRecordingSeconds(0);if(cancelled)return;const blob=new Blob(chunks,{type});if(blob.size<800){alert('La nota de voz quedó demasiado corta.');return}const file=new File([blob],`nota-soporte-${Date.now()}.${type.includes('ogg')?'ogg':'webm'}`,{type});setRecordingSending(true);void sendMedia(file).finally(()=>setRecordingSending(false))}
      recorder.start(250);setRecording(true);setRecordingSeconds(0);const started=Date.now();recordingTimerRef.current=setInterval(()=>setRecordingSeconds(Math.floor((Date.now()-started)/1000)),250)
    }catch(e:any){alert(e?.name==='NotAllowedError'?'Permite el acceso al micrófono para grabar notas de voz.':'No se pudo iniciar el micrófono.')}
  }
  const finishRecording=(cancel=false)=>{recordingCancelledRef.current=cancel;try{if(recorderRef.current&&recorderRef.current.state!=='inactive')recorderRef.current.stop()}catch{}}

  const sendPoll=async()=>{
    if(!selected?.id||!connected||!pollQuestion.trim())return
    const options=pollOptions.split(/\r?\n/).map(v=>v.trim()).filter(Boolean)
    if(options.length<2||options.length>12){alert('Agrega entre 2 y 12 opciones, una por línea.');return}
    setSendingPoll(true)
    try{const out=await api<any>(`/admin/whatsapp/conversations/${selected.id}/send-poll`,{method:'POST',body:JSON.stringify({question:pollQuestion.trim(),options,max_selections:1})});setMessages(v=>[...v,{id:out.id,message_id:out.id,direction:'out',type:'poll',body:out.body,status:'sent',occurred_at:out.occurred_at}]);setPollQuestion('');setPollOptions('Sí\nNo');setShowPoll(false);void refreshConvs()}catch(e:any){alert(e.message)}finally{setSendingPoll(false)}
  }

  const callSelected=()=>{if(!selected)return;const phone=digits(selected.store_whatsapp||selected.whatsapp);if(!phone){alert('Este comerciante no tiene un número de WhatsApp disponible para llamar.');return}window.dispatchEvent(new CustomEvent('wamercio:open-admin-softphone',{detail:{phone,display_name:selected.store_name||label(selected),avatar_url:selected.store_logo_url||selected.profile_picture_url||'',remote_jid:selected.remote_jid||'',auto_call:true,picture_in_picture:true}}))}
  const markUnread=async()=>{if(!selected?.id)return;await api(`/admin/whatsapp/conversations/${selected.id}/unread`,{method:'PATCH'}).catch((e:any)=>alert(e.message));setConvs(v=>v.map(c=>c.id===selected.id?{...c,unread_count:1}:c));setMenuOpen(false)}
  const exportChat=()=>{if(!selected)return;const body=messages.map(m=>`[${dayTime(m.occurred_at)}] ${m.direction==='out'?'WAMERCIO':label(selected)}: ${m.body||m.caption||m.file_name||m.type}`).join('\n');const blob=new Blob([body],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`soporte-${label(selected).replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.txt`;a.click();URL.revokeObjectURL(url);setMenuOpen(false)}
  const clearChat=async()=>{if(!selected?.id||!confirm('¿Vaciar el historial local de esta conversación? Los mensajes ya enviados en WhatsApp no se eliminan del teléfono del comerciante.'))return;try{await api(`/admin/whatsapp/conversations/${selected.id}/messages`,{method:'DELETE'});setMessages([]);void refreshConvs();setMenuOpen(false)}catch(e:any){alert(e.message)}}
  const deleteChat=async()=>{if(!selected?.id||!confirm('¿Eliminar esta conversación del centro de soporte? Podrás iniciarla nuevamente desde el listado de comerciantes.'))return;try{await api(`/admin/whatsapp/conversations/${selected.id}`,{method:'DELETE'});setSelected(null);setMessages([]);setMenuOpen(false);void refreshConvs()}catch(e:any){alert(e.message)}}
  const copyPhone=async()=>{const value=digits(selected?.store_whatsapp||selected?.whatsapp);if(value)await navigator.clipboard?.writeText('+'+value).catch(()=>{});}

  const connected=state.connected===true||state.status==='connected'
  const filtered=useMemo(()=>convs.filter(c=>{const statusOK=filter==='all'||(filter==='unread'?c.unread_count>0:filter==='active'?c.owner_status==='active':c.owner_status!=='active');const q=search.trim().toLowerCase();return statusOK&&(!q||`${label(c)} ${c.name} ${c.whatsapp} ${c.store_name||''} ${c.last_message} ${c.plan_name||''}`.toLowerCase().includes(q))}),[convs,search,filter])
  const quickQuery=text.trimStart().startsWith('/')?text.trimStart().slice(1).toLowerCase():''
  const quickVisible=showQuick||text.trimStart().startsWith('/')
  const visibleQuick=useMemo(()=>quickReplies.filter(q=>!quickQuery||q.title.toLowerCase().includes(quickQuery)||q.body.toLowerCase().includes(quickQuery)),[quickQuery])
  const matches=useMemo(()=>{const q=chatSearch.trim().toLowerCase();if(!q)return [] as string[];return messages.filter(m=>`${m.body||''} ${m.caption||''} ${m.file_name||''}`.toLowerCase().includes(q)).map(m=>m.id)},[messages,chatSearch])
  const activeMatch=matches.length?matches[Math.min(chatSearchIndex,matches.length-1)]:''
  useEffect(()=>{setChatSearchIndex(matches.length?matches.length-1:0)},[chatSearch,matches.length])
  useEffect(()=>{if(activeMatch)messageRefs.current[activeMatch]?.scrollIntoView({behavior:'smooth',block:'center'})},[activeMatch])
  const moveMatch=(delta:number)=>{if(matches.length)setChatSearchIndex(i=>(i+delta+matches.length)%matches.length)}

  return <SuperAdminShell title="WhatsApp de soporte" fullHeight hidePageHeader>
    <div className="wamercio-wa-ui relative flex h-full min-h-0 overflow-hidden border-x border-b border-[#dde3e7] bg-white">
      <aside className={`${selected?'hidden md:flex':'flex'} wa-sidebar w-full shrink-0 flex-col border-r md:w-[340px] xl:w-[380px]`}>
        <div className="wa-sidebar-head border-b">
          <div className="wa-sidebar-titlebar"><div><div className="flex items-center gap-2"><p className="wa-sidebar-kicker">WhatsApp</p><span className={`h-2 w-2 rounded-full ${connected?'bg-[#25d366]':'bg-amber-500'}`} title={connected?'Sesión global conectada':'Sesión global desconectada'}/></div><h2 className="wa-sidebar-title">Bandeja de soporte</h2></div><button onClick={()=>{void refreshStatus();void refreshConvs();selected&&void loadMessages(selected)}} className="wa-header-icon" title="Actualizar"><RefreshCw/></button></div>
          <WaSidebarSearch value={search} onChange={setSearch} placeholder="Buscar comercio o conversación"/>
          <div className="wa-filter-row">{([['all','Todos'],['unread','No leídos'],['active','Activos'],['inactive','Inactivos']] as [Filter,string][]).map(([value,caption])=><WaFilterChip key={value} active={filter===value} onClick={()=>setFilter(value)}>{caption}</WaFilterChip>)}</div>
        </div>
        <div className="flex-1 overflow-y-auto bg-white">{filtered.length===0?<div className="p-10 text-center text-sm text-[#8696a0]">Sin conversaciones para este filtro.</div>:filtered.map(c=><WaChatListItem key={c.owner_id} name={label(c)} avatar={avatar(c)} lastMessage={c.last_message||c.store_name||'Comerciante WAMERCIO'} timestamp={time(c.last_message_at)} unreadCount={c.unread_count} isSelected={selected?.owner_id===c.owner_id} onClick={()=>void choose(c)} badges={<span className="wa-mini-badge is-green">Comerciante</span>} workflow={<><span className="wa-mini-badge">{c.store_name||'Sin negocio'}</span>{c.plan_name&&<span className="wa-mini-badge">{c.plan_name}</span>}</>}/>)}</div>
      </aside>

      <section className={`${selected?'flex':'hidden md:flex'} min-w-0 flex-1 flex-col bg-[#efeae2]`}>
        {selected?<>
          <div className="relative">
            <WaChatHeader name={label(selected)} avatar={avatar(selected)} badge={<span className="wa-mini-badge is-green">Comerciante</span>} status={<>{phoneDisplay(selected.whatsapp)}{selected.store_name?` · ${selected.store_name}`:''}</>} onBack={()=>setSelected(null)} onProfile={()=>setDetailsOpen(v=>!v)} actions={<div className="flex items-center gap-1"><button title="Llamar por WhatsApp" onClick={callSelected} className="rounded-full p-2.5 text-[#54656f] transition hover:bg-[#e2e5e7] hover:text-[#111b21]"><PhoneCall className="h-5 w-5"/></button><button title="Información del comerciante" onClick={()=>setDetailsOpen(v=>!v)} className={`rounded-full p-2.5 ${detailsOpen?'bg-[#d9fdd3] text-[#008069]':'text-[#54656f] hover:bg-[#e2e5e7]'}`}><Info className="h-5 w-5"/></button><div className="relative"><button title="Más opciones" onClick={()=>setMenuOpen(v=>!v)} className={`rounded-full p-2.5 ${menuOpen?'bg-[#e2e5e7] text-[#111b21]':'text-[#54656f] hover:bg-[#e2e5e7]'}`}><MoreVertical className="h-5 w-5"/></button>{menuOpen&&<div className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border border-[#dfe3e6] bg-white py-1.5 shadow-[0_14px_38px_rgba(17,27,33,.2)]"><button onClick={()=>{setChatSearchOpen(true);setMenuOpen(false)}} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[#3b4a54] hover:bg-[#f5f6f6]"><Search className="h-4 w-4"/>Buscar</button><button onClick={()=>void markUnread()} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[#3b4a54] hover:bg-[#f5f6f6]"><MessageCircleMore className="h-4 w-4"/>Marcar no leído</button><button onClick={exportChat} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[#3b4a54] hover:bg-[#f5f6f6]"><Download className="h-4 w-4"/>Exportar chat</button><div className="my-1 border-t border-[#eef0f2]"/><button onClick={()=>void clearChat()} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[#3b4a54] hover:bg-[#f5f6f6]"><Eraser className="h-4 w-4"/>Vaciar historial local</button><button onClick={()=>void deleteChat()} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4"/>Eliminar conversación</button></div>}</div></div>}/>
            {chatSearchOpen&&<div className="wa-chat-searchbar"><Search/><input autoFocus value={chatSearch} onChange={e=>setChatSearch(e.target.value)} placeholder="Buscar en esta conversación"/><span>{chatSearch.trim()?`${matches.length?chatSearchIndex+1:0}/${matches.length}`:''}</span><button type="button" disabled={!matches.length} onClick={()=>moveMatch(-1)}><ArrowUp/></button><button type="button" disabled={!matches.length} onClick={()=>moveMatch(1)}><ArrowDown/></button><button type="button" onClick={()=>{setChatSearchOpen(false);setChatSearch('')}}><X/></button></div>}
          </div>

          <div className="wa-wallpaper relative flex-1 overflow-y-auto px-2 py-1 sm:px-4"><WaConversationTimeline messages={messages} renderMessage={m=><WhatsAppMessageContent m={m}/>} formatTime={time} messageRefs={messageRefs} activeId={activeMatch} empty={<WaEmptyChat title="Inicia la conversación de soporte" copy="Los mensajes enviados y recibidos desde el número oficial de WAMERCIO aparecerán aquí."/>}/><div ref={bottom}/></div>

          <div className="relative shrink-0">
            {showPoll&&<div className="absolute bottom-[68px] left-3 z-30 w-[min(380px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-[#dfe3e6] bg-white shadow-[0_14px_40px_rgba(17,27,33,.18)]"><div className="flex items-center justify-between border-b border-[#eef0f2] px-4 py-3"><div><p className="text-sm font-semibold text-[#111b21]">Encuesta de soporte</p><p className="text-[11px] text-[#8696a0]">Pregunta rápida enviada por WhatsApp</p></div><button onClick={()=>setShowPoll(false)} className="rounded-full p-1.5 text-[#667781] hover:bg-[#f0f2f5]"><X className="h-4 w-4"/></button></div><div className="space-y-2 p-3"><input className="field" value={pollQuestion} onChange={e=>setPollQuestion(e.target.value)} placeholder="Pregunta"/><textarea className="field min-h-24 resize-none" value={pollOptions} onChange={e=>setPollOptions(e.target.value)} placeholder={'Opción 1\nOpción 2'}/><p className="text-[10px] text-[#8696a0]">Una opción por línea · mínimo 2, máximo 12</p><button disabled={sendingPoll||!pollQuestion.trim()} onClick={()=>void sendPoll()} className="btn-primary w-full">{sendingPoll?'Enviando...':'Enviar encuesta'}</button></div></div>}
            {quickVisible&&<div className="absolute bottom-[68px] left-3 z-30 w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-[#dfe3e6] bg-white shadow-[0_14px_40px_rgba(17,27,33,.18)]"><div className="flex items-center justify-between border-b border-[#eef0f2] px-4 py-3"><div><p className="text-sm font-semibold text-[#111b21]">Respuestas rápidas</p><p className="text-[11px] text-[#8696a0]">Mensajes frecuentes del equipo de soporte</p></div><button onClick={()=>{setShowQuick(false);if(text.trimStart().startsWith('/'))setText('')}} className="rounded-full p-1.5 text-[#667781] hover:bg-[#f0f2f5]"><X className="h-4 w-4"/></button></div><div className="max-h-72 overflow-y-auto p-2">{visibleQuick.map(q=><button key={q.title} onClick={()=>{setText(q.body);setShowQuick(false)}} className="block w-full rounded-xl px-3 py-2.5 text-left hover:bg-[#f5f6f6]"><span className="block text-xs font-semibold text-[#008069]">/{q.title.toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/g,'-')} · {q.title}</span><span className="mt-1 line-clamp-2 block text-xs leading-5 text-[#667781]">{q.body}</span></button>)}</div></div>}
            <form onSubmit={send} className="wa-composer"><input ref={fileInput} type="file" className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" onChange={e=>void sendMedia(e.target.files?.[0])}/>{recording?<><WaComposerAction title="Cancelar nota" onClick={()=>finishRecording(true)}><X/></WaComposerAction><div className="wa-composer-box wa-recording-box"><span className="wa-recording-dot is-live"/><span className="text-sm font-medium text-[#3b4a54]">Grabando nota de voz · {fmtSeconds(recordingSeconds)}</span></div><button type="button" onClick={()=>finishRecording(false)} className="wa-composer-send" title="Enviar nota"><Send/></button></>:<><div className="wa-composer-box"><WaComposerAction title="Respuestas rápidas" active={showQuick} onClick={()=>setShowQuick(v=>!v)}><Zap/></WaComposerAction><WaComposerAction title="Enviar encuesta" disabled={!connected||sendingPoll} onClick={()=>{setShowPoll(v=>!v);setShowQuick(false)}}><BarChart3/></WaComposerAction><WaComposerAction title="Adjuntar archivo" disabled={!connected||sendingMedia} onClick={()=>fileInput.current?.click()}><Paperclip/></WaComposerAction><WaComposerInput value={text} onChange={setText} disabled={!connected} placeholder={connected?(sendingMedia||recordingSending?'Enviando archivo...':'Escribe un mensaje'):'La sesión global está desconectada'} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(text.trim())(e.currentTarget.form as HTMLFormElement)?.requestSubmit()}}}/></div><WaSendButton hasText={!!text.trim()} onVoice={()=>void startRecording()} disabled={!connected||sending||sendingMedia||recordingSending}/></>}</form>
          </div>
        </>:<div className="wa-wallpaper flex-1"><WaEmptyChat title="WhatsApp de soporte" copy="Selecciona un comerciante para iniciar o continuar una conversación desde el canal oficial de WAMERCIO."/></div>}
      </section>

      {selected&&detailsOpen&&<aside className="absolute inset-y-0 right-0 z-30 w-full overflow-y-auto border-l border-[#dfe3e6] bg-[#f7f8fa] shadow-[-12px_0_32px_rgba(17,27,33,.12)] sm:w-[360px] xl:static xl:z-auto xl:w-[340px] xl:shadow-none"><div className="flex h-[72px] items-center justify-between border-b border-[#dfe3e6] bg-[#f0f2f5] px-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#00a884]">Soporte WAMERCIO</p><h3 className="text-sm font-semibold text-[#111b21]">Información del comerciante</h3></div><button onClick={()=>setDetailsOpen(false)} className="rounded-full p-2 text-[#54656f] hover:bg-white"><X className="h-4 w-4"/></button></div><div className="bg-white p-5 text-center"><div className="mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-[#dfe5e7] text-xl font-semibold text-[#54656f]">{avatar(selected)?<img src={avatar(selected)} alt={label(selected)} className="h-full w-full object-cover"/>:label(selected).slice(0,2).toUpperCase()}</div><h3 className="mt-3 text-lg font-semibold text-[#111b21]">{label(selected)}</h3><button onClick={()=>void copyPhone()} className="mt-1 inline-flex items-center gap-1.5 text-xs text-[#667781] hover:text-[#008069]">{phoneDisplay(selected.whatsapp)}<Copy className="h-3.5 w-3.5"/></button><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={callSelected} className="rounded-xl bg-[#e7fce7] px-3 py-2.5 text-xs font-semibold text-[#008069]"><PhoneCall className="mx-auto mb-1 h-4 w-4"/>Llamar</button><button onClick={()=>router.push('/admin/owners')} className="rounded-xl bg-[#f0f2f5] px-3 py-2.5 text-xs font-semibold text-[#54656f]"><UserRound className="mx-auto mb-1 h-4 w-4"/>Propietario</button></div></div><div className="mt-2 bg-white p-5"><h4 className="text-sm font-semibold text-[#111b21]">Cuenta SaaS</h4><div className="mt-3 space-y-2 text-xs"><div className="flex items-center justify-between gap-3"><span className="text-[#8696a0]">Estado</span><strong className={selected.owner_status==='active'?'text-[#008069]':'text-amber-600'}>{selected.owner_status==='active'?'Activo':'Inactivo'}</strong></div><div className="flex items-center justify-between gap-3"><span className="text-[#8696a0]">Plan</span><strong className="text-right text-[#3b4a54]">{selected.plan_name||'Sin plan'}</strong></div><div className="flex items-center justify-between gap-3"><span className="text-[#8696a0]">Negocios</span><strong className="text-[#3b4a54]">{selected.store_count||0}</strong></div><div className="flex items-center justify-between gap-3"><span className="text-[#8696a0]">Registro</span><strong className="text-right text-[#3b4a54]">{dayTime(selected.owner_created_at)}</strong></div></div></div>{selected.store_name&&<div className="mt-2 bg-white p-5"><div className="flex items-center justify-between"><h4 className="text-sm font-semibold text-[#111b21]">Negocio principal</h4><Store className="h-4 w-4 text-[#008069]"/></div><div className="mt-3 flex items-center gap-3"><div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-[#e7fce7] text-[#008069]">{selected.store_logo_url?<img src={selected.store_logo_url} alt="" className="h-full w-full object-cover"/>:<Store className="h-5 w-5"/>}</div><div className="min-w-0"><div className="truncate text-sm font-semibold text-[#111b21]">{selected.store_name}</div><div className="mt-0.5 text-[11px] text-[#8696a0]">{selected.store_active?'Operando':'Inactivo'}{selected.store_slug?` · /${selected.store_slug}`:''}</div></div></div>{selected.store_address&&<p className="mt-3 text-xs leading-5 text-[#667781]">{selected.store_address}</p>}<button onClick={()=>router.push('/admin/stores')} className="mt-4 flex w-full items-center justify-between rounded-xl border border-[#dfe3e6] px-3 py-2.5 text-xs font-semibold text-[#3b4a54] hover:bg-[#f5f6f6]">Administrar negocios<ChevronRight className="h-4 w-4"/></button></div>}</aside>}
    </div>
  </SuperAdminShell>
}
