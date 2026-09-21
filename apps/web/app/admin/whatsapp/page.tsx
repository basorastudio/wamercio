'use client'

import {useEffect,useMemo,useRef,useState} from 'react'
import {QRCodeSVG} from 'qrcode.react'
import SuperAdminShell from '@/components/superadmin-shell'
import {api} from '@/lib/api'
import {phoneDisplay} from '@/components/phone-input'
import {WhatsAppMessageContent,type WhatsAppMessage} from '@/components/whatsapp-message-content'
import {Alert} from '@/components/ui'
import {CheckCheck,MessageCircleMore,Paperclip,RefreshCw,Search,Send,Smartphone,Unplug} from 'lucide-react'

type Conv={
  id:string;owner_id:string;name:string;whatsapp:string;remote_jid:string;display_name:string;
  unread_count:number;last_message:string;last_message_at?:string|null;owner_status:string
}
type Msg=WhatsAppMessage
const time=(v?:string|null)=>v?new Date(v).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'}):''
const label=(c:Conv)=>c.display_name||c.name||phoneDisplay(c.whatsapp)||'Comerciante'

export default function AdminWhatsApp(){
  const[state,setState]=useState<any>({status:'disconnected',connected:false})
  const[convs,setConvs]=useState<Conv[]>([])
  const[selected,setSelected]=useState<Conv|null>(null)
  const[messages,setMessages]=useState<Msg[]>([])
  const[search,setSearch]=useState('')
  const[text,setText]=useState('')
  const[busy,setBusy]=useState(false)
  const[sending,setSending]=useState(false)
  const[sendingMedia,setSendingMedia]=useState(false)
  const[error,setError]=useState('')
  const fileInput=useRef<HTMLInputElement>(null)
  const bottom=useRef<HTMLDivElement>(null)

  const refreshStatus=async()=>{try{setState(await api('/admin/whatsapp/status'));setError('')}catch(e:any){setError(e.message)}}
  const refreshConvs=async()=>{try{const rows=await api<Conv[]>('/admin/whatsapp/conversations');setConvs(rows);if(selected){const x=rows.find(c=>c.owner_id===selected.owner_id);if(x)setSelected(v=>v?{...v,...x}:x)}}catch{}}
  const loadMessages=async(c?:Conv|null)=>{const x=c||selected;if(!x?.id)return;try{setMessages(await api<Msg[]>(`/admin/whatsapp/conversations/${x.id}/messages`));await api(`/admin/whatsapp/conversations/${x.id}/read`,{method:'PATCH'}).catch(()=>{});setConvs(v=>v.map(q=>q.owner_id===x.owner_id?{...q,unread_count:0}:q))}catch{}}

  useEffect(()=>{void refreshStatus();void refreshConvs();const t=setInterval(()=>{void refreshStatus();void refreshConvs();if(selected?.id)void loadMessages(selected)},3000);return()=>clearInterval(t)},[selected?.id])
  useEffect(()=>bottom.current?.scrollIntoView({behavior:'smooth'}),[messages.length])

  const connect=async()=>{setBusy(true);setError('');try{await api('/admin/whatsapp/connect',{method:'POST'});setTimeout(()=>void refreshStatus(),500)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  const disconnect=async()=>{if(!confirm('¿Desvincular el número de WhatsApp usado por soporte?'))return;setBusy(true);try{await api('/admin/whatsapp/disconnect',{method:'POST'});setSelected(null);setMessages([]);await refreshStatus()}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  const choose=async(c:Conv)=>{
    try{
      let x=c
      if(!c.id){const created=await api<any>('/admin/whatsapp/conversations',{method:'POST',body:JSON.stringify({owner_id:c.owner_id})});x={...c,...created,id:created.id}}
      setSelected(x);setMessages([]);await loadMessages(x)
    }catch(e:any){alert(e.message)}
  }
  const send=async(e:React.FormEvent)=>{
    e.preventDefault();if(!selected?.id||!text.trim())return
    const body=text.trim();setSending(true);setText('')
    try{const out=await api<any>(`/admin/whatsapp/conversations/${selected.id}/send`,{method:'POST',body:JSON.stringify({text:body})});setMessages(v=>[...v,{id:out.id,message_id:out.id,direction:'out',type:'text',body,status:'sent',occurred_at:out.occurred_at}]);void refreshConvs()}catch(e:any){alert(e.message);setText(body)}finally{setSending(false)}
  }
  const sendMedia=async(file?:File)=>{
    if(!file||!selected?.id)return
    if(file.size>32*1024*1024){alert('El archivo supera el límite de 32 MB.');return}
    setSendingMedia(true)
    try{const form=new FormData();form.append('file',file);if(text.trim())form.append('caption',text.trim());const out=await api<Msg>(`/admin/whatsapp/conversations/${selected.id}/send-media`,{method:'POST',body:form});setText('');setMessages(v=>[...v,{...out,direction:'out',status:'sent'} as Msg]);void refreshConvs()}catch(e:any){alert(e.message)}finally{setSendingMedia(false);if(fileInput.current)fileInput.current.value=''}
  }
  const filtered=useMemo(()=>convs.filter(c=>`${c.name} ${c.display_name} ${c.whatsapp} ${c.last_message}`.toLowerCase().includes(search.toLowerCase())),[convs,search])
  const connected=state.connected===true||state.status==='connected'
  const linked=state.linked===true||connected
  const reconnecting=linked&&!connected

  return <SuperAdminShell title="WhatsApp de soporte" subtitle="Atiende directamente a los comercios desde el número oficial de soporte WAMERCIO" actions={<button onClick={()=>{void refreshStatus();void refreshConvs();selected&&void loadMessages(selected)}} className="btn-secondary px-3" title="Actualizar"><RefreshCw className="h-4 w-4"/></button>}>
    {error&&<div className="mb-4"><Alert text={error}/></div>}
    {!linked&&<div className="mb-5 grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="card flex min-h-[330px] flex-col items-center justify-center p-6 text-center"><div className="grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand-600"><MessageCircleMore className="h-8 w-8"/></div><h2 className="mt-4 text-xl font-semibold">Conecta el WhatsApp de soporte</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#8d92aa]">Este número es independiente de los WhatsApp de las tiendas y será utilizado por el SuperAdmin para atender a los comerciantes.</p>{state.qr&&<div className="mt-5 rounded-lg border border-[#e9edef] bg-white p-4"><QRCodeSVG value={state.qr} size={230} level="M" includeMargin/></div>}<button disabled={busy||state.status==='starting'} onClick={connect} className="btn-primary mt-5"><Smartphone className="h-4 w-4"/>{state.status==='qr'?'Renovar QR':'Vincular WhatsApp de soporte'}</button></div>
      <div className="card p-5"><h3 className="font-semibold text-ink-900">Canal oficial de soporte</h3><p className="mt-2 text-sm leading-6 text-[#8d92aa]">Una vez vinculado, el listado mostrará todos los comerciantes. Puedes iniciar una conversación aunque todavía no hayan escrito al número de soporte.</p><div className="mt-4 rounded-lg bg-brand-50 p-4 text-sm text-brand-800">El WhatsApp del comerciante en WAMERCIO es su usuario de acceso; el SuperAdmin lo utiliza para abrir la conversación correcta.</div></div>
    </div>}

    {linked&&<div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#dfe3e6] bg-white px-4 py-3"><span className="inline-flex items-center gap-2 text-sm font-medium text-[#111b21]"><span className={`h-2.5 w-2.5 rounded-full ${connected?'bg-[#25d366]':'bg-amber-500'}`}/> {connected?'WhatsApp de soporte conectado':'WhatsApp de soporte vinculado · reconectando'} {state.phone?`· ${phoneDisplay(state.phone)}`:''}</span><button onClick={disconnect} className="btn-danger ml-auto"><Unplug className="h-4 w-4"/>Desvincular</button></div>}

    <div className={`relative flex h-[calc(100dvh-220px)] min-h-[600px] overflow-hidden rounded-lg border border-[#dfe3e6] bg-white shadow-sm ${!linked?'opacity-60 pointer-events-none':''}`}>
      <aside className={`${selected?'hidden md:flex':'flex'} w-full shrink-0 flex-col border-r border-[#e9edef] bg-white md:w-[350px]`}>
        <div className="border-b border-[#e9edef] bg-[#f0f2f5] p-3"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667781]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar comercio" className="h-10 w-full rounded-lg border-0 bg-white pl-9 pr-3 text-sm outline-none placeholder:text-[#8696a0]"/></div></div>
        <div className="flex-1 overflow-y-auto">{filtered.map(c=><button key={c.owner_id} onClick={()=>void choose(c)} className={`flex w-full gap-3 border-b border-[#f0f2f5] px-3 py-3 text-left hover:bg-[#f5f6f6] ${selected?.owner_id===c.owner_id?'bg-[#f0f2f5]':''}`}><div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#dfe5e7] font-semibold text-[#54656f]">{label(c).slice(0,1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-[15px] font-medium text-[#111b21]">{label(c)}</span>{c.last_message_at&&<span className={`ml-auto text-[11px] ${c.unread_count?'text-[#00a884]':'text-[#667781]'}`}>{time(c.last_message_at)}</span>}</div><div className="mt-1 flex items-center gap-2"><span className="truncate text-[13px] text-[#667781]">{c.last_message||phoneDisplay(c.whatsapp)||'Iniciar conversación'}</span>{c.unread_count>0&&<span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-[#25d366] px-1 text-[10px] font-bold text-white">{c.unread_count}</span>}</div></div></button>)}{filtered.length===0&&<div className="p-10 text-center text-sm text-[#8696a0]">No hay comerciantes para este filtro.</div>}</div>
      </aside>

      <section className={`${selected?'flex':'hidden md:flex'} min-w-0 flex-1 flex-col bg-[#efeae2]`}>
        {selected?<><header className="flex h-16 shrink-0 items-center gap-3 border-b border-[#dfe3e6] bg-[#f0f2f5] px-4"><button onClick={()=>setSelected(null)} className="md:hidden text-[#54656f]">←</button><div className="grid h-10 w-10 place-items-center rounded-full bg-[#dfe5e7] font-semibold text-[#54656f]">{label(selected).slice(0,1).toUpperCase()}</div><div className="min-w-0"><div className="truncate text-[15px] font-medium text-[#111b21]">{label(selected)}</div><div className="truncate text-xs text-[#667781]">{phoneDisplay(selected.whatsapp)} · Soporte WAMERCIO</div></div></header>
          <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6" style={{backgroundImage:'radial-gradient(circle at 20px 20px,rgba(17,27,33,.025) 1px,transparent 1px)',backgroundSize:'32px 32px'}}><div className="mx-auto max-w-4xl space-y-1.5">{messages.map(m=><div key={m.id} className={`flex ${m.direction==='out'?'justify-end':'justify-start'}`}><div className={`max-w-[88%] rounded-[8px] px-2.5 py-1.5 shadow-[0_1px_1px_rgba(11,20,26,.13)] sm:max-w-[70%] ${m.direction==='out'?'bg-[#d9fdd3]':'bg-white'}`}><WhatsAppMessageContent m={m}/><div className="ml-8 mt-0.5 flex items-center justify-end gap-1 text-[10px] text-[#667781]"><span>{time(m.occurred_at)}</span>{m.direction==='out'&&<CheckCheck className={`h-3.5 w-3.5 ${m.status==='read'?'text-[#53bdeb]':''}`}/>}</div></div></div>)}<div ref={bottom}/></div></div>
          <form onSubmit={send} className="flex shrink-0 items-end gap-2 border-t border-[#dfe3e6] bg-[#f0f2f5] px-3 py-2.5"><input ref={fileInput} type="file" className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" onChange={e=>void sendMedia(e.target.files?.[0])}/><button type="button" disabled={sendingMedia} onClick={()=>fileInput.current?.click()} className="grid h-10 w-10 place-items-center rounded-full text-[#54656f] hover:bg-[#e1e5e7]"><Paperclip className="h-5 w-5"/></button><textarea rows={1} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();(e.currentTarget.form as HTMLFormElement)?.requestSubmit()}}} className="max-h-32 min-h-[42px] flex-1 resize-none rounded-lg border-0 bg-white px-4 py-2.5 text-sm outline-none" placeholder={sendingMedia?'Enviando archivo...':'Escribe un mensaje'}/><button disabled={sending||sendingMedia||!text.trim()} className="grid h-10 w-10 place-items-center rounded-full bg-[#00a884] text-white disabled:opacity-40"><Send className="h-4 w-4"/></button></form>
        </>:<div className="grid h-full place-items-center bg-[#f7f8fa] text-center"><div className="max-w-sm px-6"><div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#d9fdd3] text-[#008069]"><MessageCircleMore className="h-9 w-9"/></div><h3 className="mt-5 text-xl font-medium text-[#3b4a54]">Soporte por WhatsApp</h3><p className="mt-2 text-sm leading-6 text-[#667781]">Selecciona un comercio para iniciar o continuar una conversación desde el número oficial de WAMERCIO.</p></div></div>}
      </section>
    </div>
  </SuperAdminShell>
}
