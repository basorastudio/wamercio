'use client'

import {useEffect,useMemo,useRef,useState} from 'react'
import StoreShell,{StoreSelector} from '@/components/store-shell'
import {api,money} from '@/lib/api'
import {resolveBusinessCapabilities,type CheckoutField} from '@/lib/business-capabilities'
import {
  ArrowLeft,Ban,CheckCheck,ClipboardList,Download,Eraser,Info,MessageCircleMore,MoreVertical,Paperclip,RefreshCw,Search,Send,X,ShoppingCart,Plus,Minus,Trash2,Package2,Zap
} from 'lucide-react'
import {WhatsAppMessageContent,type WhatsAppMessage} from '@/components/whatsapp-message-content'

type Conv={
  id:string;remote_jid:string;display_name:string;unread_count:number;last_message:string;
  last_message_at?:string|null;created_at:string;customer_id?:string;status?:string;phone?:string;
  whatsapp_name?:string;profile_picture_url?:string;contact_type?:'customer'|'contact'
}
type Msg=WhatsAppMessage
type Customer={id:string;name:string;phone:string;address:string;notes:string;status:string;order_count:number;total_spent:number;last_order_at?:string|null}
type ContactData={name:string;phone:string;address:string;notes:string;status:string}
type Detail={id:string;remote_jid:string;display_name:string;phone:string;status:string;contact_type:'customer'|'contact';whatsapp_name?:string;profile_picture_url?:string;contact:ContactData;customer:Customer;orders:any[];metrics:{messages:number;incoming:number;outgoing:number;images:number;videos:number;audios:number;documents:number;first_interaction?:string|null;last_interaction?:string|null}}
type Note={id:string;note:string;author?:string;created_at:string}
type Panel='contact'|'records'|'sale'|null
type Product={id:string;name:string;price:number;image_url?:string;description?:string;stock?:number;track_stock?:boolean;variants?:{name:string;price:number}[];extras?:{name:string;price:number}[]}
type Zone={id:string;name:string;charge:number}
type QuickReply={id:string;title:string;body:string}
type CartItem={product:Product;quantity:number;variant_name?:string;extras?:{name:string;price:number}[]}

const label=(c:Conv)=>c.display_name||c.phone||c.remote_jid.split('@')[0]
const time=(v?:string|null)=>v?new Date(v).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'}):''
const dayTime=(v?:string|null)=>v?new Date(v).toLocaleString('es-DO',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—'
const statusLabel=(v?:string)=>v==='closed'?'Cerrada':v==='pending'?'Pendiente':'Abierta'
const kindLabel=(v?:string)=>v==='customer'?'Cliente':'Contacto'
const flowLabel=(v?:string)=>v==='reservation'?'Reserva':v==='quote'?'Solicitud':'Pedido'

function ConversationCheckoutField({field,value,onChange}:{field:CheckoutField;value:string|number;onChange:(value:string|number)=>void}){
  const common={className:'field',value:String(value??''),required:field.required,onChange:(e:any)=>onChange(field.type==='number'?e.target.value:e.target.value)}
  return <label className="block"><span className="mb-1 block text-[11px] font-medium text-[#54656f]">{field.label}{field.required?' *':''}</span>{field.type==='textarea'?<textarea {...common} className="field min-h-16 resize-none" placeholder={field.placeholder}/>:field.type==='select'?<select {...common}><option value="">Selecciona una opción</option>{field.options.map(option=><option key={option} value={option}>{option}</option>)}</select>:<input {...common} type={field.type} placeholder={field.placeholder}/>}</label>
}

export default function Conversations(){
  const[store,setStore]=useState('')
  const[convs,setConvs]=useState<Conv[]>([])
  const[selected,setSelected]=useState<Conv|null>(null)
  const[messages,setMessages]=useState<Msg[]>([])
  const[text,setText]=useState('')
  const[search,setSearch]=useState('')
  const[chatFilter,setChatFilter]=useState<'all'|'customer'|'contact'|'unread'>('all')
  const[sending,setSending]=useState(false)
  const[sendingMedia,setSendingMedia]=useState(false)
  const fileInput=useRef<HTMLInputElement>(null)
  const[panel,setPanel]=useState<Panel>(null)
  const[detail,setDetail]=useState<Detail|null>(null)
  const[notes,setNotes]=useState<Note[]>([])
  const[noteText,setNoteText]=useState('')
  const[savingContact,setSavingContact]=useState(false)
  const[contactForm,setContactForm]=useState({name:'',address:'',notes:'',status:'active'})
  const[catalog,setCatalog]=useState<Product[]>([])
  const[zones,setZones]=useState<Zone[]>([])
  const[quickReplies,setQuickReplies]=useState<QuickReply[]>([])
  const[storeConfig,setStoreConfig]=useState<any>(null)
  const[showQuick,setShowQuick]=useState(false)
  const[chatMenuOpen,setChatMenuOpen]=useState(false)
  const[productSearch,setProductSearch]=useState('')
  const[cart,setCart]=useState<CartItem[]>([])
  const[creatingOrder,setCreatingOrder]=useState(false)
  const[orderMessage,setOrderMessage]=useState('')
  const[orderForm,setOrderForm]=useState({delivery_type:'delivery',shipping_zone_id:'',payment_method:'cash',delivery_address:'',notes:'',custom_fields:{} as Record<string,string|number>})
  const bottom=useRef<HTMLDivElement>(null)
  const capabilities=useMemo(()=>resolveBusinessCapabilities(storeConfig),[storeConfig])
  const deliveryAvailable=!!storeConfig?.delivery_enabled&&capabilities.supportsDelivery
  const pickupAvailable=!!storeConfig?.pickup_enabled&&capabilities.supportsPickup
  const paymentOptions=useMemo(()=>[
    ['cash','Efectivo',!!storeConfig?.cash_enabled],
    ['cash_on_delivery','Tarjeta en terminal',!!storeConfig?.cash_on_delivery_enabled],
    ['bank_transfer','Transferencia electrónica',!!storeConfig?.bank_transfer_enabled],
  ].filter(([, ,enabled])=>enabled) as [string,string,boolean][],[storeConfig])

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
      setContactForm({name:d.contact?.name||d.customer?.name||d.display_name||'',address:d.contact?.address||d.customer?.address||'',notes:d.contact?.notes||d.customer?.notes||'',status:d.contact?.status||d.customer?.status||'active'})
      setOrderForm(v=>({...v,delivery_address:v.delivery_address||d.contact?.address||d.customer?.address||''}))
    }catch{}
  }
  const loadNotes=async(c?:Conv|null)=>{
    const x=c||selected;if(!x)return
    try{setNotes(await api<Note[]>(`/conversations/${x.id}/notes`))}catch{}
  }
  const loadCatalog=async()=>{
    if(!store)return
    try{
      const [p,z,q,cfg]=await Promise.all([api<Product[]>(`/products?store_id=${store}`),api<Zone[]>(`/shipping?store_id=${store}`),api<QuickReply[]>(`/quick-replies?store_id=${store}`),api<any>(`/stores/${store}/settings`)])
      setCatalog(p.filter(x=>(x as any).is_active!==false));setZones(z.filter(x=>(x as any).is_active!==false));setQuickReplies(q);setStoreConfig(cfg)
      const caps=resolveBusinessCapabilities(cfg)
      const delivery=!!cfg?.delivery_enabled&&caps.supportsDelivery
      const pickup=!!cfg?.pickup_enabled&&caps.supportsPickup
      const methods=[['cash',!!cfg?.cash_enabled],['cash_on_delivery',!!cfg?.cash_on_delivery_enabled],['bank_transfer',!!cfg?.bank_transfer_enabled]] as const
      const firstPayment=methods.find(([,enabled])=>enabled)?.[0]||''
      setOrderForm(v=>({...v,delivery_type:delivery?'delivery':pickup?'pickup':'',shipping_zone_id:delivery?v.shipping_zone_id:'',payment_method:caps.requiresPayment?(methods.some(([key,enabled])=>key===v.payment_method&&enabled)?v.payment_method:firstPayment):'pending_quote'}))
    }catch{}
  }

  useEffect(()=>{setSelected(null);setMessages([]);setPanel(null);setDetail(null);setCart([]);loadConvs();loadCatalog()},[store])
  useEffect(()=>{
    if(!store)return
    const refresh=()=>{loadConvs();if(selected){loadMsgs(selected);if(panel)loadDetails(selected);if(panel==='records')loadNotes(selected)}}
    const fallback=setInterval(refresh,30000)
    const stream=new EventSource(`/api/v1/events?store_id=${encodeURIComponent(store)}`)
    stream.onmessage=refresh
    stream.onerror=()=>{}
    return()=>{clearInterval(fallback);stream.close()}
  },[store,selected?.id,panel])
  useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth'})},[messages.length])

  const choose=(c:Conv)=>{setSelected(c);setPanel(null);setDetail(null);setNotes([]);setShowQuick(false);setChatMenuOpen(false);void loadMsgs(c);void loadDetails(c)}
  const openPanel=(mode:Exclude<Panel,null>)=>{setPanel(mode);setOrderMessage('');void loadDetails().then(()=>{});if(mode==='records')void loadNotes();if(mode==='sale'){void loadCatalog();setOrderForm(v=>({...v,delivery_address:detail?.contact?.address||detail?.customer?.address||v.delivery_address}))}}
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
      setConvs(v=>v.map(c=>c.id===selected.id?{...c,display_name:out.name,customer_id:out.customer_id,phone:out.phone,contact_type:out.contact_type}:c))
      setSelected(v=>v?{...v,display_name:out.name,customer_id:out.customer_id,phone:out.phone,contact_type:out.contact_type}:v)
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

  const addProduct=(product:Product)=>setCart(items=>{
    const existing=items.find(x=>x.product.id===product.id)
    if(existing)return items.map(x=>x.product.id===product.id?{...x,quantity:x.quantity+1}:x)
    const firstVariant=capabilities.supportsVariants?(product.variants?.[0]?.name||''):''
    return [...items,{product,quantity:1,variant_name:firstVariant,extras:[]}]
  })
  const changeQty=(id:string,delta:number)=>setCart(items=>items.map(x=>x.product.id===id?{...x,quantity:Math.max(0,x.quantity+delta)}:x).filter(x=>x.quantity>0))
  const setVariant=(id:string,name:string)=>setCart(items=>items.map(x=>x.product.id===id?{...x,variant_name:name}:x))
  const toggleExtra=(id:string,extra:{name:string;price:number})=>setCart(items=>items.map(x=>{if(x.product.id!==id)return x;const has=(x.extras||[]).some(e=>e.name===extra.name);return {...x,extras:has?(x.extras||[]).filter(e=>e.name!==extra.name):[...(x.extras||[]),extra]}}))
  const cartUnit=(item:CartItem)=>{
    const variant=item.product.variants?.find(v=>v.name===item.variant_name)
    const base=variant&&Number(variant.price)>0?Number(variant.price):Number(item.product.price)||0
    return base+(item.extras||[]).reduce((n,e)=>n+(Number(e.price)||0),0)
  }
  const cartSubtotal=useMemo(()=>cart.reduce((sum,item)=>sum+cartUnit(item)*item.quantity,0),[cart])
  const selectedZone=zones.find(z=>z.id===orderForm.shipping_zone_id)
  const orderTotal=cartSubtotal+(orderForm.delivery_type==='delivery'?(selectedZone?.charge||0):0)
  const visibleProducts=useMemo(()=>catalog.filter(p=>(p.name+' '+(p.description||'')).toLowerCase().includes(productSearch.toLowerCase())),[catalog,productSearch])
  const createOrder=async()=>{
    if(!selected||cart.length===0)return
    const missing=capabilities.checkoutFields.find(field=>field.required&&!String(orderForm.custom_fields[field.key]??'').trim())
    if(missing){setOrderMessage(`Completa ${missing.label}`);return}
    setCreatingOrder(true);setOrderMessage('')
    try{
      const out=await api<any>(`/conversations/${selected.id}/orders`,{method:'POST',body:JSON.stringify({customer_name:detail?.contact?.name||detail?.customer?.name||selected.display_name||selected.phone,delivery_address:orderForm.delivery_address,delivery_type:orderForm.delivery_type,shipping_zone_id:orderForm.shipping_zone_id,payment_method:orderForm.payment_method,notes:orderForm.notes,custom_fields:orderForm.custom_fields,items:cart.map(x=>({product_id:x.product.id,quantity:x.quantity,variant_name:capabilities.supportsVariants?(x.variant_name||''):'',extras:capabilities.supportsExtras?(x.extras||[]):[]}))})})
      setCart([]);setOrderForm(v=>({...v,notes:'',custom_fields:{}}));setOrderMessage(`${capabilities.orderNoun[0].toUpperCase()+capabilities.orderNoun.slice(1)} #${out.number} creado y enviado por WhatsApp.`);await loadDetails();await loadConvs();setTimeout(()=>loadMsgs(selected),500)
    }catch(e:any){setOrderMessage(e.message||`No se pudo crear la ${capabilities.orderNoun}`)}finally{setCreatingOrder(false)}
  }

  const deleteConversation=async()=>{
    if(!selected||!confirm(`¿Eliminar el chat con ${label(selected)}? Esta acción elimina el historial local de WAMERCIO.`))return
    try{await api(`/conversations/${selected.id}`,{method:'DELETE'});setChatMenuOpen(false);setSelected(null);setMessages([]);setPanel(null);setDetail(null);await loadConvs()}catch(e:any){alert(e.message)}
  }
  const clearConversation=async()=>{
    if(!selected||!confirm(`¿Vaciar todos los mensajes del chat con ${label(selected)}?`))return
    try{await api(`/conversations/${selected.id}/messages`,{method:'DELETE'});setMessages([]);setChatMenuOpen(false);setConvs(v=>v.map(c=>c.id===selected.id?{...c,last_message:'',last_message_at:null,unread_count:0}:c))}catch(e:any){alert(e.message)}
  }
  const exportConversation=()=>{
    if(!selected)return
    const lines=[`WAMERCIO · Exportación de chat`,`Contacto: ${label(selected)}`,`WhatsApp: ${selected.phone?`+${selected.phone}`:selected.remote_jid.split('@')[0]}`,'',...messages.map(m=>{const author=m.direction==='out'?'WAMERCIO':label(selected);const body=(m.body||m.caption||m.file_name||`[${m.type||'contenido'}]`).replace(/\r?\n/g,' ');return `[${dayTime(m.occurred_at)}] ${author}: ${body}`})]
    const blob=new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`wamercio-chat-${(selected.phone||selected.id).replace(/[^a-zA-Z0-9_-]/g,'')}.txt`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);setChatMenuOpen(false)
  }
  const closeConversation=async()=>{
    if(!selected)return
    try{await api(`/conversations/${selected.id}/status`,{method:'PATCH',body:JSON.stringify({status:'closed'})});setSelected(v=>v?{...v,status:'closed'}:v);setConvs(v=>v.map(c=>c.id===selected.id?{...c,status:'closed'}:c));setDetail(v=>v?{...v,status:'closed'}:v);setChatMenuOpen(false)}catch(e:any){alert(e.message)}
  }
  const blockConversation=async()=>{
    if(!selected)return
    const current=detail||await api<Detail>(`/conversations/${selected.id}/details`).catch(()=>null)
    const blocked=current?.contact?.status==='blocked'
    if(!blocked&&!confirm(`¿Bloquear a ${label(selected)}? Los mensajes nuevos de este contacto no se incorporarán a WAMERCIO hasta que lo desbloquees.`))return
    try{await api(`/conversations/${selected.id}/block`,{method:'PATCH',body:JSON.stringify({blocked:!blocked})});setContactForm(v=>({...v,status:blocked?'active':'blocked'}));setDetail(v=>v?{...v,contact:{...v.contact,status:blocked?'active':'blocked'},customer:{...v.customer,status:blocked?'active':'blocked'},status:blocked?v.status:'closed'}:v);if(!blocked){setSelected(v=>v?{...v,status:'closed'}:v);setConvs(v=>v.map(c=>c.id===selected.id?{...c,status:'closed',unread_count:0}:c))}setChatMenuOpen(false)}catch(e:any){alert(e.message)}
  }

  const filtered=useMemo(()=>convs.filter(c=>{const filterOK=chatFilter==='all'||(chatFilter==='unread'?c.unread_count>0:c.contact_type===chatFilter);return filterOK&&(label(c)+' '+(c.whatsapp_name||'')+' '+c.last_message+' '+(c.phone||'')).toLowerCase().includes(search.toLowerCase())}),[convs,search,chatFilter])
  const paneOpen=!!panel&&!!selected

  return <StoreShell title="WhatsApp" fullHeight hideHeader>
    <div className="relative flex h-full min-h-0 overflow-hidden border border-[#dde3e7] bg-white">
      <aside className={`${selected?'hidden md:flex':'flex'} w-full shrink-0 flex-col border-r border-[#e9edef] bg-white md:w-[340px] xl:w-[380px]`}>
        <div className="border-b border-[#e9edef] bg-[#f0f2f5] px-3 py-3.5">
          <div className="mb-3 flex items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[#00a884]">WhatsApp</p><h2 className="text-[15px] font-semibold text-[#111b21]">Bandeja de conversaciones</h2></div><button onClick={()=>{loadConvs();selected&&loadMsgs(selected)}} className="grid h-9 w-9 place-items-center rounded-full text-[#54656f] hover:bg-white"><RefreshCw className="h-4 w-4"/></button></div>
          <StoreSelector value={store} onChange={setStore} className="mb-3"/>
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667781]"/><input className="h-10 w-full rounded-full border border-transparent bg-white pl-10 pr-4 text-sm outline-none transition focus:border-[#b9e5dc]" placeholder="Buscar o iniciar un chat" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <div className="mt-3 flex flex-wrap gap-2">{([['all','Todos'],['customer','Clientes'],['contact','Contactos'],['unread','No leídos']] as const).map(([value,text])=><button key={value} onClick={()=>setChatFilter(value)} className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${chatFilter===value?'bg-[#d9fdd3] text-[#008069]':'bg-white text-[#667781]'}`}>{text}</button>)}</div>
        </div>
        <div className="flex-1 overflow-y-auto bg-white">{!store?<div className="p-8 text-center text-sm text-[#8696a0]">Selecciona una tienda.</div>:filtered.length===0?<div className="p-10 text-center"><MessageCircleMore className="mx-auto h-9 w-9 text-[#c4cdd1]"/><p className="mt-3 text-sm font-medium text-[#3b4a54]">Sin conversaciones</p><p className="mt-1 text-xs text-[#8696a0]">Los mensajes nuevos aparecerán aquí.</p></div>:filtered.map(c=><button key={c.id} onClick={()=>choose(c)} className={`flex w-full gap-3 border-b border-[#f0f2f5] px-3 py-3 text-left transition hover:bg-[#f5f6f6] ${selected?.id===c.id?'bg-[#f0f2f5]':''}`}>
          <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-[#dfe5e7] text-base font-semibold text-[#54656f]">{c.profile_picture_url?<img src={c.profile_picture_url} alt={label(c)} className="h-full w-full object-cover"/>:label(c).slice(0,1).toUpperCase()}</div>
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-[15px] font-medium text-[#111b21]">{label(c)}</span>{c.last_message_at&&<span className={`ml-auto shrink-0 text-[11px] ${c.unread_count>0?'text-[#00a884]':'text-[#667781]'}`}>{time(c.last_message_at)}</span>}</div><div className="mt-1 flex items-center gap-2"><span className="truncate text-[13px] text-[#667781]">{c.last_message||'Nueva conversación'}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${c.contact_type==='customer'?'bg-[#e7fce7] text-[#008069]':'bg-[#eef2f5] text-[#667781]'}`}>{kindLabel(c.contact_type)}</span>{c.unread_count>0&&<span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-[#25d366] px-1 text-[10px] font-bold text-white">{c.unread_count}</span>}</div></div>
        </button>)}</div>
      </aside>

      <section className={`${selected?'flex':'hidden md:flex'} min-w-0 flex-1 flex-col bg-[#efeae2]`}>
        {selected?<>
          <header className="flex h-[72px] shrink-0 items-center gap-3 border-b border-[#dfe3e6] bg-[#f0f2f5] px-3 sm:px-4">
            <button onClick={()=>setSelected(null)} className="rounded-full p-2 text-[#54656f] hover:bg-white md:hidden"><ArrowLeft className="h-5 w-5"/></button>
            <button onClick={()=>openPanel('contact')} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-[#dfe5e7] font-semibold text-[#54656f]">{selected.profile_picture_url?<img src={selected.profile_picture_url} alt={label(selected)} className="h-full w-full object-cover"/>:label(selected).slice(0,1).toUpperCase()}</div>
              <div className="min-w-0"><div className="flex items-center gap-2"><div className="truncate text-[15px] font-medium text-[#111b21]">{label(selected)}</div><span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${selected.contact_type==='customer'?'bg-[#d9fdd3] text-[#008069]':'bg-[#e2e5e7] text-[#54656f]'}`}>{kindLabel(selected.contact_type)}</span></div><div className="truncate text-xs text-[#667781]">{selected.phone?`+${selected.phone}`:selected.remote_jid.split('@')[0]} · {statusLabel(selected.status)}</div></div>
            </button>
            <div className="flex items-center gap-1"><button title={`${capabilities.primaryAction} por WhatsApp`} onClick={()=>openPanel('sale')} className={`rounded-full p-2.5 ${panel==='sale'?'bg-[#d9fdd3] text-[#008069]':'text-[#54656f] hover:bg-[#e2e5e7]'}`}><ShoppingCart className="h-5 w-5"/></button><button title="Datos del contacto" onClick={()=>openPanel('contact')} className={`hidden rounded-full p-2.5 sm:inline-flex ${panel==='contact'?'bg-[#d9fdd3] text-[#008069]':'text-[#54656f] hover:bg-[#e2e5e7]'}`}><Info className="h-5 w-5"/></button><button title="Registros de atención" onClick={()=>openPanel('records')} className={`hidden rounded-full p-2.5 sm:inline-flex ${panel==='records'?'bg-[#d9fdd3] text-[#008069]':'text-[#54656f] hover:bg-[#e2e5e7]'}`}><ClipboardList className="h-5 w-5"/></button><div className="relative"><button data-testid="chat-context-menu" title="Más opciones" onClick={()=>setChatMenuOpen(v=>!v)} className={`rounded-full p-2.5 ${chatMenuOpen?'bg-[#e2e5e7] text-[#111b21]':'text-[#54656f] hover:bg-[#e2e5e7]'}`}><MoreVertical className="h-5 w-5"/></button>{chatMenuOpen&&<div className="absolute right-0 top-12 z-40 w-52 overflow-hidden rounded-xl border border-[#dfe3e6] bg-white py-1 shadow-[0_12px_34px_rgba(17,27,33,.2)]"><button type="button" onClick={clearConversation} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[#3b4a54] hover:bg-[#f5f6f6]"><Eraser className="h-4 w-4"/>Vaciar chat</button><button type="button" onClick={exportConversation} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[#3b4a54] hover:bg-[#f5f6f6]"><Download className="h-4 w-4"/>Exportar chat</button><button type="button" onClick={closeConversation} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[#3b4a54] hover:bg-[#f5f6f6]"><X className="h-4 w-4"/>Cerrar chat</button><button type="button" onClick={blockConversation} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[#3b4a54] hover:bg-[#f5f6f6]"><Ban className="h-4 w-4"/>{detail?.contact?.status==='blocked'?'Desbloquear':'Bloquear'}</button><div className="my-1 border-t border-[#eef0f2]"/><button type="button" onClick={deleteConversation} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4"/>Eliminar chat</button></div>}</div></div>
          </header>
          <div className="relative flex-1 overflow-y-auto px-3 py-4 sm:px-6" style={{backgroundColor:'#efeae2',backgroundImage:'radial-gradient(circle at 20px 20px,rgba(17,27,33,.025) 1px,transparent 1px)',backgroundSize:'32px 32px'}}>
            <div className="mx-auto max-w-4xl space-y-1.5">{messages.map(m=><div key={m.id} className={`flex ${m.direction==='out'?'justify-end':'justify-start'}`}><div className={`relative max-w-[88%] rounded-[10px] px-2.5 py-1.5 shadow-[0_1px_1px_rgba(11,20,26,.13)] sm:max-w-[72%] ${m.direction==='out'?'bg-[#d9fdd3]':'bg-white'}`}><WhatsAppMessageContent m={m}/><div className="ml-8 mt-0.5 flex items-center justify-end gap-1 text-[10px] leading-none text-[#667781]"><span>{time(m.occurred_at)}</span>{m.direction==='out'&&<CheckCheck className={`h-3.5 w-3.5 ${m.status==='read'?'text-[#53bdeb]':''}`}/>}</div></div></div>)}<div ref={bottom}/></div>
          </div>
          {detail?.contact?.status==='blocked'&&<div className="shrink-0 border-t border-[#f1d6d6] bg-rose-50 px-4 py-2 text-center text-xs font-medium text-rose-700">Contacto bloqueado. Desbloquéalo desde el menú ⋮ para volver a enviar o recibir mensajes en WAMERCIO.</div>}
          <form onSubmit={send} className="relative flex shrink-0 items-end gap-2 border-t border-[#dfe3e6] bg-[#f0f2f5] px-3 py-2.5">
            {showQuick&&<div className="absolute bottom-[66px] left-3 z-30 w-[min(340px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-[#dfe3e6] bg-white shadow-[0_14px_40px_rgba(17,27,33,.18)]"><div className="flex items-center justify-between border-b border-[#eef0f2] px-4 py-3"><div><p className="text-sm font-semibold text-[#111b21]">Respuestas rápidas</p><p className="text-[11px] text-[#8696a0]">Un toque para completar el mensaje</p></div><button type="button" onClick={()=>setShowQuick(false)} className="rounded-full p-1.5 text-[#667781] hover:bg-[#f0f2f5]"><X className="h-4 w-4"/></button></div><div className="max-h-64 overflow-y-auto p-2">{quickReplies.map(q=><button type="button" key={q.id} onClick={()=>{setText(q.body);setShowQuick(false)}} className="block w-full rounded-xl px-3 py-2.5 text-left hover:bg-[#f5f6f6]"><span className="block text-xs font-semibold text-[#008069]">{q.title}</span><span className="mt-1 line-clamp-2 block text-xs leading-5 text-[#667781]">{q.body}</span></button>)}{quickReplies.length===0&&<p className="p-4 text-center text-xs text-[#8696a0]">No hay respuestas guardadas.</p>}</div></div>}
            <input ref={fileInput} type="file" className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" onChange={e=>void sendMedia(e.target.files?.[0])}/>
            <button type="button" onClick={()=>setShowQuick(v=>!v)} title="Respuestas rápidas" className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${showQuick?'bg-[#d9fdd3] text-[#008069]':'text-[#54656f] hover:bg-[#e1e5e7]'}`}><Zap className="h-5 w-5"/></button>
            <button type="button" disabled={sendingMedia||detail?.contact?.status==='blocked'} onClick={()=>fileInput.current?.click()} title="Adjuntar archivo" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#54656f] hover:bg-[#e1e5e7] disabled:opacity-40"><Paperclip className="h-5 w-5"/></button>
            <div className="flex min-w-0 flex-1 items-end rounded-[22px] bg-white px-1.5 py-1"><textarea rows={1} disabled={detail?.contact?.status==='blocked'} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();(e.currentTarget.form as HTMLFormElement)?.requestSubmit()}}} className="max-h-32 min-h-[42px] flex-1 resize-none rounded-[20px] border-0 bg-transparent px-3 py-2.5 text-sm text-[#111b21] outline-none placeholder:text-[#8696a0]" placeholder={sendingMedia?'Enviando archivo...':'Escribe un mensaje'}/></div>
            <button disabled={sending||sendingMedia||!text.trim()||detail?.contact?.status==='blocked'} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#00a884] text-white shadow-sm disabled:opacity-40"><Send className="h-4 w-4"/></button>
          </form>
        </>:<div className="grid h-full place-items-center bg-[#f7f8fa] text-center"><div className="max-w-sm px-6"><div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#d9fdd3] text-[#008069]"><MessageCircleMore className="h-9 w-9"/></div><h3 className="mt-5 text-xl font-medium text-[#3b4a54]">WAMERCIO WhatsApp</h3><p className="mt-2 text-sm leading-6 text-[#667781]">Selecciona una conversación para atender a tu cliente desde un espacio familiar, inspirado en WhatsApp Web.</p></div></div>}
      </section>

      {paneOpen&&selected&&<aside className="absolute inset-0 z-20 flex flex-col border-l border-[#dfe3e6] bg-white md:left-[340px] xl:static xl:w-[390px] xl:shrink-0">
        <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-[#e9edef] bg-[#f0f2f5] px-4"><button onClick={()=>setPanel(null)} className="rounded-full p-2 text-[#54656f] hover:bg-white"><X className="h-5 w-5"/></button><h2 className="text-[16px] font-medium text-[#111b21]">{panel==='contact'?'Datos del contacto':panel==='sale'?`${capabilities.primaryAction} por WhatsApp`:'Registros de atención'}</h2></div>
        {!detail?<div className="grid flex-1 place-items-center text-sm text-[#8696a0]">Cargando...</div>:panel==='contact'?<div className="flex-1 overflow-y-auto bg-[#f0f2f5]">
          <div className="bg-white px-5 py-7 text-center"><div className="mx-auto grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-[#dfe5e7] text-3xl font-medium text-[#54656f]">{detail.profile_picture_url?<img src={detail.profile_picture_url} alt={contactForm.name||label(selected)} className="h-full w-full object-cover"/>:(contactForm.name||label(selected)).slice(0,1).toUpperCase()}</div><div className="mt-4 flex items-center justify-center gap-2"><div className="text-xl font-medium text-[#111b21]">{contactForm.name||label(selected)}</div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${detail.contact_type==='customer'?'bg-[#d9fdd3] text-[#008069]':'bg-[#eef2f5] text-[#667781]'}`}>{kindLabel(detail.contact_type)}</span></div>{detail.whatsapp_name&&detail.whatsapp_name!==(contactForm.name||label(selected))&&<div className="mt-1 text-xs font-medium text-[#00a884]">Perfil de WhatsApp: {detail.whatsapp_name}</div>}<div className="mt-1 text-sm text-[#667781]">{detail.phone?`+${detail.phone}`:'WhatsApp'}</div></div>
          <div className="mt-2 bg-white p-5"><div className="grid grid-cols-2 gap-3"><div className="rounded-lg bg-[#f7f8fa] p-3 text-center"><div className="text-lg font-semibold text-[#111b21]">{detail.customer?.order_count||0}</div><div className="text-[11px] text-[#667781]">Pedidos</div></div><div className="rounded-lg bg-[#f7f8fa] p-3 text-center"><div className="text-lg font-semibold text-[#111b21]">{money(detail.customer?.total_spent||0)}</div><div className="text-[11px] text-[#667781]">Compras</div></div></div></div>
          <div className="mt-2 space-y-4 bg-white p-5"><div><label className="mb-1 block text-xs font-medium text-[#667781]">Nombre</label><input className="field" value={contactForm.name} onChange={e=>setContactForm({...contactForm,name:e.target.value})}/></div><div><label className="mb-1 block text-xs font-medium text-[#667781]">Dirección</label><textarea className="field min-h-20 resize-none" value={contactForm.address} onChange={e=>setContactForm({...contactForm,address:e.target.value})}/></div><div><label className="mb-1 block text-xs font-medium text-[#667781]">Notas del {detail.contact_type==='customer'?'cliente':'contacto'}</label><textarea className="field min-h-24 resize-none" value={contactForm.notes} onChange={e=>setContactForm({...contactForm,notes:e.target.value})}/></div><div><label className="mb-1 block text-xs font-medium text-[#667781]">Estado del {detail.contact_type==='customer'?'cliente':'contacto'}</label><select className="field" value={contactForm.status} onChange={e=>setContactForm({...contactForm,status:e.target.value})}><option value="active">Activo</option><option value="blocked">Bloqueado</option></select></div><button disabled={savingContact||!contactForm.name.trim()} onClick={saveContact} className="btn-primary w-full">{savingContact?'Guardando...':'Guardar cambios'}</button></div>
          <div className="mt-2 bg-white p-5"><h3 className="text-sm font-medium text-[#111b21]">Compras y solicitudes recientes</h3><div className="mt-3 space-y-2">{detail.orders?.length?detail.orders.map(o=><div key={o.id} className="flex items-center justify-between rounded-lg border border-[#e9edef] p-3"><div><div className="text-sm font-medium">{flowLabel(o.flow_type)} #{o.number}</div><div className="mt-0.5 text-[11px] text-[#8696a0]">{dayTime(o.created_at)}</div></div><div className="text-right"><div className="text-sm font-medium">{money(o.total)}</div><div className="text-[10px] capitalize text-[#667781]">{o.status}</div></div></div>):<p className="py-3 text-sm text-[#8696a0]">Todavía no tiene compras ni solicitudes vinculadas.</p>}</div></div>
        </div>:panel==='sale'?<div className="flex-1 overflow-y-auto bg-[#f0f2f5]">
          <div className="bg-white p-4">
            <div className="rounded-xl bg-[#e7fce7] p-3"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[#008069]">Comercio conversacional</p><p className="mt-1 text-sm font-medium text-[#111b21]">{detail.contact?.name||detail.customer?.name||detail.display_name||'Contacto'}</p><p className="mt-0.5 text-xs text-[#667781]">{`Gestiona la ${capabilities.orderNoun} sin salir de la conversación.`}</p></div>
            {orderMessage&&<div className={`mt-3 rounded-xl px-3 py-2.5 text-xs ${orderMessage.includes('creado')?'bg-emerald-50 text-emerald-700':'bg-rose-50 text-rose-700'}`}>{orderMessage}</div>}
          </div>
          <div className="mt-2 bg-white p-4"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8696a0]"/><input value={productSearch} onChange={e=>setProductSearch(e.target.value)} className="field pl-10" placeholder={`Buscar ${capabilities.itemLabel}...`}/></div><div className="mt-3 max-h-56 space-y-2 overflow-y-auto">{visibleProducts.slice(0,30).map(product=><button type="button" key={product.id} onClick={()=>addProduct(product)} className="flex w-full items-center gap-3 rounded-xl border border-[#e9edef] p-2.5 text-left hover:bg-[#f7f9f8]"><div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#eef2f1]">{product.image_url?<img src={product.image_url} className="h-full w-full object-cover"/>:<Package2 className="h-4 w-4 text-[#8696a0]"/>}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-[#111b21]">{product.name}</div><div className="mt-0.5 text-xs text-[#667781]">{money(product.price)}</div></div><Plus className="h-4 w-4 text-[#00a884]"/></button>)}{visibleProducts.length===0&&<p className="py-5 text-center text-xs text-[#8696a0]">No hay {capabilities.itemPlural} para mostrar.</p>}</div></div>
          <div className="mt-2 bg-white p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-medium text-[#111b21]">{capabilities.orderNoun[0].toUpperCase()+capabilities.orderNoun.slice(1)}</h3><span className="text-xs text-[#667781]">{cart.reduce((n,x)=>n+x.quantity,0)} {capabilities.itemPlural}</span></div><div className="mt-3 space-y-2">{cart.length?cart.map(item=><div key={item.product.id} className="rounded-xl bg-[#f7f9f8] p-2.5"><div className="flex items-center gap-2"><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-[#111b21]">{item.product.name}</div><div className="text-xs text-[#667781]">{money(cartUnit(item)*item.quantity)}</div></div><button type="button" onClick={()=>changeQty(item.product.id,-1)} className="grid h-8 w-8 place-items-center rounded-full bg-white text-[#54656f]"><Minus className="h-3.5 w-3.5"/></button><span className="w-6 text-center text-sm font-semibold">{item.quantity}</span><button type="button" onClick={()=>changeQty(item.product.id,1)} className="grid h-8 w-8 place-items-center rounded-full bg-white text-[#008069]"><Plus className="h-3.5 w-3.5"/></button><button type="button" onClick={()=>setCart(v=>v.filter(x=>x.product.id!==item.product.id))} className="grid h-8 w-8 place-items-center rounded-full text-[#8696a0] hover:text-rose-600"><Trash2 className="h-3.5 w-3.5"/></button></div>{capabilities.supportsVariants&&(item.product.variants?.length||0)>0&&<select value={item.variant_name||''} onChange={e=>setVariant(item.product.id,e.target.value)} className="mt-2 w-full rounded-lg border border-[#dfe3e6] bg-white px-2.5 py-2 text-xs text-[#3b4a54] outline-none">{item.product.variants?.map(v=><option key={v.name} value={v.name}>{v.name}{Number(v.price)>0?` · ${money(v.price)}`:''}</option>)}</select>}{capabilities.supportsExtras&&(item.product.extras?.length||0)>0&&<div className="mt-2 flex flex-wrap gap-1.5">{item.product.extras?.map(extra=>{const active=(item.extras||[]).some(e=>e.name===extra.name);return <button type="button" key={extra.name} onClick={()=>toggleExtra(item.product.id,extra)} className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${active?'border-[#00a884] bg-[#e7fce7] text-[#008069]':'border-[#dfe3e6] bg-white text-[#667781]'}`}>{extra.name}{Number(extra.price)>0?` +${money(extra.price)}`:''}</button>})}</div>}</div>):<p className="rounded-xl border border-dashed border-[#dfe3e6] p-4 text-center text-xs text-[#8696a0]">Agrega {capabilities.itemPlural} desde el catálogo.</p>}</div></div>
          <div className="mt-2 space-y-3 bg-white p-4">
            {(deliveryAvailable||pickupAvailable)&&<div className="grid grid-cols-2 gap-2">{deliveryAvailable&&<button type="button" onClick={()=>setOrderForm({...orderForm,delivery_type:'delivery'})} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${orderForm.delivery_type==='delivery'?'border-[#00a884] bg-[#e7fce7] text-[#008069]':'border-[#dfe3e6] text-[#667781]'}`}>Delivery</button>}{pickupAvailable&&<button type="button" onClick={()=>setOrderForm({...orderForm,delivery_type:'pickup',shipping_zone_id:''})} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${orderForm.delivery_type==='pickup'?'border-[#00a884] bg-[#e7fce7] text-[#008069]':'border-[#dfe3e6] text-[#667781]'}`}>{capabilities.pickupLabel}</button>}</div>}
            {orderForm.delivery_type==='delivery'&&<><textarea className="field min-h-20 resize-none" value={orderForm.delivery_address} onChange={e=>setOrderForm({...orderForm,delivery_address:e.target.value})} placeholder="Dirección de entrega"/>{zones.length>0&&<select className="field" value={orderForm.shipping_zone_id} onChange={e=>setOrderForm({...orderForm,shipping_zone_id:e.target.value})}><option value="">Zona de delivery (opcional)</option>{zones.map(z=><option value={z.id} key={z.id}>{z.name} · {money(z.charge)}</option>)}</select>}</>}
            {capabilities.checkoutFields.length>0&&<div className="space-y-2 rounded-xl border border-[#e9edef] bg-[#f7f9f8] p-3"><div className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#008069]">Datos para la {capabilities.orderNoun}</div>{capabilities.checkoutFields.map(field=><ConversationCheckoutField key={field.key} field={field} value={orderForm.custom_fields[field.key]??''} onChange={value=>setOrderForm(v=>({...v,custom_fields:{...v.custom_fields,[field.key]:value}}))}/>)}</div>}
            {capabilities.requiresPayment?<select className="field" value={orderForm.payment_method} onChange={e=>setOrderForm({...orderForm,payment_method:e.target.value})}>{paymentOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>:<div className="rounded-xl border border-[#d9ebe6] bg-[#f2fbf8] p-3 text-xs text-[#45645d]"><strong className="block text-[#008069]">Pago después de cotizar</strong><span className="mt-1 block">Primero envía la solicitud. El método y monto de pago se coordinan cuando el negocio apruebe la cotización.</span></div>}
            <textarea className="field min-h-16 resize-none" value={orderForm.notes} onChange={e=>setOrderForm({...orderForm,notes:e.target.value})} placeholder={`Nota opcional de la ${capabilities.orderNoun}`}/>
          </div>
          <div className="sticky bottom-0 border-t border-[#e9edef] bg-white p-4 shadow-[0_-8px_20px_rgba(17,27,33,.04)]"><div className="mb-3 space-y-1 text-xs text-[#667781]"><div className="flex justify-between"><span>Subtotal</span><strong className="text-[#111b21]">{money(cartSubtotal)}</strong></div>{orderForm.delivery_type==='delivery'&&<div className="flex justify-between"><span>Delivery</span><strong className="text-[#111b21]">{money(selectedZone?.charge||0)}</strong></div>}<div className="flex justify-between border-t border-[#eef0f2] pt-2 text-sm"><span className="font-medium text-[#111b21]">Total</span><strong className="text-[#008069]">{money(orderTotal)}</strong></div></div><button disabled={creatingOrder||cart.length===0||!orderForm.delivery_type||(capabilities.requiresPayment&&!orderForm.payment_method)||(orderForm.delivery_type==='delivery'&&!orderForm.delivery_address.trim())} onClick={createOrder} className="btn-primary w-full"><ShoppingCart className="h-4 w-4"/>{creatingOrder?`Creando ${capabilities.orderNoun}...`:`${capabilities.primaryAction} y enviar por WhatsApp`}</button></div>
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
