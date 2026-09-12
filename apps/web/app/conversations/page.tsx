'use client'

import {useEffect,useMemo,useRef,useState} from 'react'
import StoreShell,{StoreSelector} from '@/components/store-shell'
import {api,money} from '@/lib/api'
import {
  ArrowLeft,CheckCheck,ClipboardList,Info,MessageCircleMore,Paperclip,RefreshCw,Search,Send,X
} from 'lucide-react'
import {WhatsAppMessageContent,type WhatsAppMessage} from '@/components/whatsapp-message-content'

type Conv={
  id:string;remote_jid:string;display_name:string;unread_count:number;last_message:string;
  last_message_at?:string|null;created_at:string;customer_id?:string;status?:string;phone?:string
}
type Msg=WhatsAppMessage
type Customer={id:string;name:string;phone:string;address:string;notes:string;status:string;order_count:number;total_spent:number;last_order_at?:string|null}
type Detail={id:string;remote_jid:string;display_name:string;phone:string;status:string;customer:Customer;orders:any[];metrics:{messages:number;incoming:number;outgoing:number;images:number;videos:number;audios:number;documents:number;first_interaction?:string|null;last_interaction?:string|null}}
type Note={id:string;note:string;author?:string;created_at:string}
type Panel='contact'|'records'|null

const label=(c:Conv)=>c.display_name||c.phone||c.remote_jid.split('@')[0]
const time=(v?:string|null)=>v?new Date(v).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'}):''
const dayTime=(v?:string|null)=>v?new Date(v).toLocaleString('es-DO',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—'
const statusLabel=(v?:string)=>v==='closed'?'Cerrada':v==='pending'?'Pendiente':'Abierta'


export default function Conversations(){
  const[store,setStore]=useState('')
  const[convs,setConvs]=useState<Conv[]>([])
  const[selected,setSelected]=useState<Conv|null>(null)
  const[messages,setMessages]=useState<Msg[]>([])
  const[text,setText]=useState('')
  const[search,setSearch]=useState('')
  const[onlyUnread,setOnlyUnread]=useState(false)
  const[sending,setSending]=useState(false)
  const[sendingMedia,setSendingMedia]=useState(false)
  const fileInput=useRef<HTMLInputElement>(null)
  const[panel,setPanel]=useState<Panel>(null)
  const[detail,setDetail]=useState<Detail|null>(null)
  const[notes,setNotes]=useState<Note[]>([])
  const[noteText,setNoteText]=useState('')
  const[savingContact,setSavingContact]=useState(false)
  const[contactForm,setContactForm]=useState({name:'',address:'',notes:'',status:'active'})
  const bottom=useRef<HTMLDivElement>(null)

  const loadConvs=async()=>{
    if(!store)return
    try{
      const data=await api<Conv[]>(`/conversations?store_id=${store}`)
      setConvs(data)
      if(selected){
        const fresh=data.find(c=>c.id===selected.id)
        if(fresh)setSelected(fresh)
      }
    }catch{}
  }
  const loadMsgs=async(c?:Conv|null)=>{
    const x=c||selected;if(!x)return
    try{
      setMessages(await api<Msg[]>(`/conversations/${x.id}/messages`))
      await api(`/conversations/${x.id}/read`,{method:'PATCH'}).catch(()=>{})
      setConvs(v=>v.map(q=>q.id===x.id?{...q,unread_count:0}:q))
    }catch{}
  }
  const loadDetails=async(c?:Conv|null)=>{
    const x=c||selected;if(!x)return
    try{
      const d=await api<Detail>(`/conversations/${x.id}/details`)
      setDetail(d)
      setContactForm({name:d.customer?.name||d.display_name||'',address:d.customer?.address||'',notes:d.customer?.notes||'',status:d.customer?.status||'active'})
    }catch{}
  }
  const loadNotes=async(c?:Conv|null)=>{
    const x=c||selected;if(!x)return
    try{setNotes(await api<Note[]>(`/conversations/${x.id}/notes`))}catch{}
  }

  useEffect(()=>{setSelected(null);setMessages([]);setPanel(null);setDetail(null);loadConvs()},[store])
  useEffect(()=>{const t=setInterval(()=>{loadConvs();if(selected){loadMsgs(selected);if(panel)loadDetails(selected);if(panel==='records')loadNotes(selected)}},3000);return()=>clearInterval(t)},[store,selected?.id,panel])
  useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth'})},[messages.length])

  const choose=(c:Conv)=>{setSelected(c);setPanel(null);setDetail(null);setNotes([]);void loadMsgs(c)}
  const openPanel=(mode:Exclude<Panel,null>)=>{setPanel(mode);void loadDetails();if(mode==='records')void loadNotes()}
  const send=async(e:React.FormEvent)=>{
    e.preventDefault();if(!selected||!text.trim())return
    const body=text.trim();setSending(true);setText('')
    try{
      const out=await api<any>(`/conversations/${selected.id}/send`,{method:'POST',body:JSON.stringify({text:body})})
      setMessages(v=>[...v,{id:out.id,message_id:out.id,direction:'out',type:'text',body,status:'sent',occurred_at:out.occurred_at}])
      void loadConvs()
    }catch(e:any){alert(e.message);setText(body)}finally{setSending(false)}
  }
  const sendMedia=async(file?:File)=>{
    if(!selected||!file)return
    if(file.size>32*1024*1024){alert('El archivo supera el límite de 32 MB.');return}
    setSendingMedia(true)
    try{
      const form=new FormData();form.append('file',file);if(text.trim())form.append('caption',text.trim())
      const out=await api<Msg>(`/conversations/${selected.id}/send-media`,{method:'POST',body:form})
      setText('')
      setMessages(v=>[...v,{...out,direction:'out',status:'sent'} as Msg])
      void loadConvs()
    }catch(e:any){alert(e.message)}finally{setSendingMedia(false);if(fileInput.current)fileInput.current.value=''}
  }
  const saveContact=async()=>{
    if(!selected||!contactForm.name.trim())return
    setSavingContact(true)
    try{
      const out=await api<any>(`/conversations/${selected.id}/customer`,{method:'PUT',body:JSON.stringify(contactForm)})
      setConvs(v=>v.map(c=>c.id===selected.id?{...c,display_name:out.name,customer_id:out.customer_id,phone:out.phone}:c))
      setSelected(v=>v?{...v,display_name:out.name,customer_id:out.customer_id,phone:out.phone}:v)
      await loadDetails()
    }catch(e:any){alert(e.message)}finally{setSavingContact(false)}
  }
  const setConversationStatus=async(value:string)=>{
    if(!selected)return
    await api(`/conversations/${selected.id}/status`,{method:'PATCH',body:JSON.stringify({status:value})}).catch((e:any)=>alert(e.message))
    setSelected(v=>v?{...v,status:value}:v);setConvs(v=>v.map(c=>c.id===selected.id?{...c,status:value}:c));setDetail(v=>v?{...v,status:value}:v)
  }
  const addNote=async(e:React.FormEvent)=>{
    e.preventDefault();if(!selected||!noteText.trim())return
    const body=noteText.trim();setNoteText('')
    try{const n=await api<Note>(`/conversations/${selected.id}/notes`,{method:'POST',body:JSON.stringify({note:body})});setNotes(v=>[{...n,author:'Tú'},...v])}catch(e:any){alert(e.message);setNoteText(body)}
  }

  const filtered=useMemo(()=>convs.filter(c=>(!onlyUnread||c.unread_count>0)&&(label(c)+' '+c.last_message+' '+(c.phone||'')).toLowerCase().includes(search.toLowerCase())),[convs,search,onlyUnread])
  const paneOpen=!!panel&&!!selected

  return <StoreShell title="Conversaciones" subtitle="Centro de atención de WhatsApp de WAMERCIO" actions={<button className="btn-secondary px-3" title="Actualizar" onClick={()=>{loadConvs();selected&&loadMsgs(selected);paneOpen&&loadDetails()}}><RefreshCw className="h-4 w-4"/></button>}>
    <div className="mb-3"><StoreSelector value={store} onChange={setStore}/></div>
    <div className="relative flex h-[calc(100dvh-172px)] min-h-[620px] overflow-hidden rounded-lg border border-[#dfe3e6] bg-white shadow-sm">
      <aside className={`${selected?'hidden md:flex':'flex'} w-full shrink-0 flex-col border-r border-[#e9edef] bg-white md:w-[330px] xl:w-[360px]`}>
        <div className="border-b border-[#e9edef] bg-[#f0f2f5] p-3">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667781]"/><input className="h-10 w-full rounded-lg border-0 bg-white pl-9 pr-3 text-sm outline-none ring-0 placeholder:text-[#8696a0]" placeholder="Buscar o iniciar un chat" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <div className="mt-2 flex gap-2"><button onClick={()=>setOnlyUnread(false)} className={`rounded-full px-3 py-1 text-xs ${!onlyUnread?'bg-[#d9fdd3] text-[#008069]':'bg-white text-[#667781]'}`}>Todos</button><button onClick={()=>setOnlyUnread(true)} className={`rounded-full px-3 py-1 text-xs ${onlyUnread?'bg-[#d9fdd3] text-[#008069]':'bg-white text-[#667781]'}`}>No leídos</button></div>
        </div>
        <div className="flex-1 overflow-y-auto">{!store?<div className="p-8 text-center text-sm text-[#8696a0]">Selecciona una tienda.</div>:filtered.length===0?<div className="p-10 text-center"><MessageCircleMore className="mx-auto h-9 w-9 text-[#c4cdd1]"/><p className="mt-3 text-sm font-medium text-[#3b4a54]">Sin conversaciones</p><p className="mt-1 text-xs text-[#8696a0]">Los mensajes nuevos aparecerán aquí.</p></div>:filtered.map(c=><button key={c.id} onClick={()=>choose(c)} className={`flex w-full gap-3 border-b border-[#f0f2f5] px-3 py-3 text-left transition hover:bg-[#f5f6f6] ${selected?.id===c.id?'bg-[#f0f2f5]':''}`}>
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#dfe5e7] text-base font-semibold text-[#54656f]">{label(c).slice(0,1).toUpperCase()}</div>
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-[15px] font-medium text-[#111b21]">{label(c)}</span>{c.last_message_at&&<span className={`ml-auto shrink-0 text-[11px] ${c.unread_count>0?'text-[#00a884]':'text-[#667781]'}`}>{time(c.last_message_at)}</span>}</div><div className="mt-1 flex items-center gap-2"><span className="truncate text-[13px] text-[#667781]">{c.last_message||'Nueva conversación'}</span>{c.unread_count>0&&<span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-[#25d366] px-1 text-[10px] font-bold text-white">{c.unread_count}</span>}</div></div>
        </button>)}</div>
      </aside>

      <section className={`${selected?'flex':'hidden md:flex'} min-w-0 flex-1 flex-col bg-[#efeae2]`}>
        {selected?<>
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[#dfe3e6] bg-[#f0f2f5] px-3 sm:px-4">
            <button onClick={()=>setSelected(null)} className="rounded-full p-2 text-[#54656f] md:hidden"><ArrowLeft className="h-5 w-5"/></button>
            <button onClick={()=>openPanel('contact')} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#dfe5e7] font-semibold text-[#54656f]">{label(selected).slice(0,1).toUpperCase()}</div>
              <div className="min-w-0"><div className="truncate text-[15px] font-medium text-[#111b21]">{label(selected)}</div><div className="truncate text-xs text-[#667781]">{selected.phone?`+${selected.phone}`:selected.remote_jid.split('@')[0]} · {statusLabel(selected.status)}</div></div>
            </button>
            <button title="Datos del contacto" onClick={()=>openPanel('contact')} className={`rounded-full p-2.5 ${panel==='contact'?'bg-[#d9fdd3] text-[#008069]':'text-[#54656f] hover:bg-[#e2e5e7]'}`}><Info className="h-5 w-5"/></button>
            <button title="Registros de atención" onClick={()=>openPanel('records')} className={`rounded-full p-2.5 ${panel==='records'?'bg-[#d9fdd3] text-[#008069]':'text-[#54656f] hover:bg-[#e2e5e7]'}`}><ClipboardList className="h-5 w-5"/></button>
          </header>
          <div className="relative flex-1 overflow-y-auto px-3 py-4 sm:px-6" style={{backgroundColor:'#efeae2',backgroundImage:'radial-gradient(circle at 20px 20px,rgba(17,27,33,.025) 1px,transparent 1px)',backgroundSize:'32px 32px'}}>
            <div className="mx-auto max-w-4xl space-y-1.5">{messages.map(m=><div key={m.id} className={`flex ${m.direction==='out'?'justify-end':'justify-start'}`}><div className={`relative max-w-[88%] rounded-[8px] px-2.5 py-1.5 shadow-[0_1px_1px_rgba(11,20,26,.13)] sm:max-w-[70%] ${m.direction==='out'?'bg-[#d9fdd3]':'bg-white'}`}><WhatsAppMessageContent m={m}/><div className="ml-8 mt-0.5 flex items-center justify-end gap-1 text-[10px] leading-none text-[#667781]"><span>{time(m.occurred_at)}</span>{m.direction==='out'&&<CheckCheck className={`h-3.5 w-3.5 ${m.status==='read'?'text-[#53bdeb]':''}`}/>}</div></div></div>)}<div ref={bottom}/></div>
          </div>
          <form onSubmit={send} className="flex shrink-0 items-end gap-2 border-t border-[#dfe3e6] bg-[#f0f2f5] px-3 py-2.5">
            <input ref={fileInput} type="file" className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" onChange={e=>void sendMedia(e.target.files?.[0])}/>
            <button type="button" disabled={sendingMedia} onClick={()=>fileInput.current?.click()} title="Adjuntar archivo" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#54656f] hover:bg-[#e1e5e7] disabled:opacity-40"><Paperclip className="h-5 w-5"/></button>
            <textarea rows={1} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();(e.currentTarget.form as HTMLFormElement)?.requestSubmit()}}} className="max-h-32 min-h-[42px] flex-1 resize-none rounded-lg border-0 bg-white px-4 py-2.5 text-sm text-[#111b21] outline-none placeholder:text-[#8696a0]" placeholder={sendingMedia?'Enviando archivo...':'Escribe un mensaje'}/>
            <button disabled={sending||sendingMedia||!text.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#00a884] text-white disabled:opacity-40"><Send className="h-4 w-4"/></button>
          </form>
        </>:<div className="grid h-full place-items-center bg-[#f7f8fa] text-center"><div className="max-w-sm px-6"><div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#d9fdd3] text-[#008069]"><MessageCircleMore className="h-9 w-9"/></div><h3 className="mt-5 text-xl font-medium text-[#3b4a54]">WAMERCIO Conversaciones</h3><p className="mt-2 text-sm leading-6 text-[#667781]">Selecciona una conversación para atender a tu cliente desde un espacio familiar, inspirado en WhatsApp Web.</p></div></div>}
      </section>

      {paneOpen&&selected&&<aside className="absolute inset-0 z-20 flex flex-col border-l border-[#dfe3e6] bg-white md:left-[330px] xl:static xl:w-[370px] xl:shrink-0">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-[#e9edef] bg-[#f0f2f5] px-4"><button onClick={()=>setPanel(null)} className="rounded-full p-2 text-[#54656f]"><X className="h-5 w-5"/></button><h2 className="text-[16px] font-medium text-[#111b21]">{panel==='contact'?'Datos del contacto':'Registros de atención'}</h2></div>
        {!detail?<div className="grid flex-1 place-items-center text-sm text-[#8696a0]">Cargando...</div>:panel==='contact'?<div className="flex-1 overflow-y-auto bg-[#f0f2f5]">
          <div className="bg-white px-5 py-7 text-center"><div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-[#dfe5e7] text-3xl font-medium text-[#54656f]">{(contactForm.name||label(selected)).slice(0,1).toUpperCase()}</div><div className="mt-4 text-xl font-medium text-[#111b21]">{contactForm.name||label(selected)}</div><div className="mt-1 text-sm text-[#667781]">+{detail.customer?.phone||detail.phone}</div></div>
          <div className="mt-2 bg-white p-5"><div className="grid grid-cols-2 gap-3"><div className="rounded-lg bg-[#f7f8fa] p-3 text-center"><div className="text-lg font-semibold text-[#111b21]">{detail.customer?.order_count||0}</div><div className="text-[11px] text-[#667781]">Pedidos</div></div><div className="rounded-lg bg-[#f7f8fa] p-3 text-center"><div className="text-lg font-semibold text-[#111b21]">{money(detail.customer?.total_spent||0)}</div><div className="text-[11px] text-[#667781]">Compras</div></div></div></div>
          <div className="mt-2 space-y-4 bg-white p-5"><div><label className="mb-1 block text-xs font-medium text-[#667781]">Nombre</label><input className="field" value={contactForm.name} onChange={e=>setContactForm({...contactForm,name:e.target.value})}/></div><div><label className="mb-1 block text-xs font-medium text-[#667781]">Dirección</label><textarea className="field min-h-20 resize-none" value={contactForm.address} onChange={e=>setContactForm({...contactForm,address:e.target.value})}/></div><div><label className="mb-1 block text-xs font-medium text-[#667781]">Notas del cliente</label><textarea className="field min-h-24 resize-none" value={contactForm.notes} onChange={e=>setContactForm({...contactForm,notes:e.target.value})}/></div><div><label className="mb-1 block text-xs font-medium text-[#667781]">Estado del cliente</label><select className="field" value={contactForm.status} onChange={e=>setContactForm({...contactForm,status:e.target.value})}><option value="active">Activo</option><option value="blocked">Bloqueado</option></select></div><button disabled={savingContact||!contactForm.name.trim()} onClick={saveContact} className="btn-primary w-full">{savingContact?'Guardando...':detail.customer?.id?'Guardar cambios':'Guardar contacto'}</button></div>
          <div className="mt-2 bg-white p-5"><h3 className="text-sm font-medium text-[#111b21]">Pedidos recientes</h3><div className="mt-3 space-y-2">{detail.orders?.length?detail.orders.map(o=><div key={o.id} className="flex items-center justify-between rounded-lg border border-[#e9edef] p-3"><div><div className="text-sm font-medium">Pedido #{o.number}</div><div className="mt-0.5 text-[11px] text-[#8696a0]">{dayTime(o.created_at)}</div></div><div className="text-right"><div className="text-sm font-medium">{money(o.total)}</div><div className="text-[10px] capitalize text-[#667781]">{o.status}</div></div></div>):<p className="py-3 text-sm text-[#8696a0]">Todavía no tiene pedidos vinculados.</p>}</div></div>
        </div>:<div className="flex-1 overflow-y-auto bg-[#f0f2f5]">
          <div className="bg-white p-5"><div className="flex items-center justify-between"><span className="text-sm font-medium text-[#111b21]">Estado de atención</span><select value={detail.status||'open'} onChange={e=>setConversationStatus(e.target.value)} className="rounded-lg border border-[#dfe3e6] bg-white px-3 py-2 text-xs outline-none"><option value="open">Abierta</option><option value="pending">Pendiente</option><option value="closed">Cerrada</option></select></div></div>
          <div className="mt-2 bg-white p-5"><h3 className="text-sm font-medium text-[#111b21]">Resumen de la conversación</h3><div className="mt-4 grid grid-cols-2 gap-3">{[['Mensajes',detail.metrics.messages],['Recibidos',detail.metrics.incoming],['Enviados',detail.metrics.outgoing],['Imágenes',detail.metrics.images],['Videos',detail.metrics.videos],['Audios',detail.metrics.audios],['Documentos',detail.metrics.documents]].map(([k,v])=><div key={String(k)} className="rounded-lg bg-[#f7f8fa] p-3"><div className="text-lg font-semibold text-[#111b21]">{v as any}</div><div className="text-[11px] text-[#667781]">{k}</div></div>)}</div><div className="mt-4 border-t border-[#eef0f2] pt-4 text-xs text-[#667781]"><div className="flex justify-between gap-3 py-1"><span>Primera interacción</span><strong className="text-right font-medium text-[#3b4a54]">{dayTime(detail.metrics.first_interaction)}</strong></div><div className="flex justify-between gap-3 py-1"><span>Última interacción</span><strong className="text-right font-medium text-[#3b4a54]">{dayTime(detail.metrics.last_interaction)}</strong></div></div></div>
          <div className="mt-2 bg-white p-5"><h3 className="text-sm font-medium text-[#111b21]">Nuevo registro</h3><form onSubmit={addNote} className="mt-3"><textarea value={noteText} onChange={e=>setNoteText(e.target.value)} className="field min-h-24 resize-none" placeholder="Escribe una nota interna sobre esta atención..."/><button disabled={!noteText.trim()} className="btn-primary mt-2 w-full">Guardar registro</button></form></div>
          <div className="mt-2 bg-white p-5"><h3 className="text-sm font-medium text-[#111b21]">Historial operativo</h3><div className="mt-3 space-y-3">{notes.length?notes.map(n=><div key={n.id} className="border-l-2 border-[#25d366] pl-3"><p className="text-sm leading-5 text-[#3b4a54]">{n.note}</p><div className="mt-1 text-[10px] text-[#8696a0]">{n.author||'WAMERCIO'} · {dayTime(n.created_at)}</div></div>):<p className="py-3 text-sm text-[#8696a0]">No hay registros internos todavía.</p>}</div></div>
        </div>}
      </aside>}
    </div>
  </StoreShell>
}
