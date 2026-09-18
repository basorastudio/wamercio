'use client'

import {useEffect,useMemo,useState} from 'react'
import {api} from '@/lib/api'
import {AlarmClock,Check,Clock3,Plus,RefreshCw,Tag,UserRoundCheck,UsersRound,X} from 'lucide-react'

type Queue={id:string;name:string;routing_strategy:'manual'|'round_robin'|'least_load'|'random';sla_minutes:number;is_active:boolean;member_count?:number;open_count?:number}
type Staff={id:string;name:string;role?:string;status?:string;selected?:boolean}
type TagDef={id:string;name:string;color:string;is_active?:boolean}
type Workflow={queue_id:string;queue_name:string;sla_minutes:number;staff_id:string;staff_name:string;priority:'low'|'normal'|'high'|'urgent';waiting_minutes:number;sla_breached:boolean;tags:TagDef[];pending_scheduled:number;last_inbound_at?:string|null}
type Scheduled={id:string;body:string;scheduled_for:string;cancel_on_reply:boolean;status:string;error?:string;created_at:string}

const strategyLabel=(v:string)=>v==='round_robin'?'Round-robin':v==='least_load'?'Menor carga':v==='random'?'Aleatoria':'Manual'
const priorityLabel=(v:string)=>v==='urgent'?'Urgente':v==='high'?'Alta':v==='low'?'Baja':'Normal'
const scheduleStatus=(v:string)=>v==='sent'?'Enviado':v==='cancelled'?'Cancelado':v==='failed'?'Falló':v==='processing'?'Procesando':'Programado'
const datetimeLocal=(date:Date)=>{const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);return local.toISOString().slice(0,16)}

export default function ConversationProControls({store,conversationId,onChanged}:{store:string;conversationId:string;onChanged?:()=>void}){
  const[queues,setQueues]=useState<Queue[]>([])
  const[staff,setStaff]=useState<Staff[]>([])
  const[tagDefs,setTagDefs]=useState<TagDef[]>([])
  const[workflow,setWorkflow]=useState<Workflow|null>(null)
  const[scheduled,setScheduled]=useState<Scheduled[]>([])
  const[queueID,setQueueID]=useState('')
  const[staffID,setStaffID]=useState('')
  const[priority,setPriority]=useState('normal')
  const[saving,setSaving]=useState(false)
  const[autoAssigning,setAutoAssigning]=useState(false)
  const[tagName,setTagName]=useState('')
  const[newQueueName,setNewQueueName]=useState('')
  const[scheduleBody,setScheduleBody]=useState('')
  const[scheduleAt,setScheduleAt]=useState(()=>datetimeLocal(new Date(Date.now()+60*60*1000)))
  const[cancelOnReply,setCancelOnReply]=useState(true)
  const[scheduling,setScheduling]=useState(false)
  const[queueSaving,setQueueSaving]=useState(false)
  const[queueMemberIDs,setQueueMemberIDs]=useState<string[]>([])
  const[membersSaving,setMembersSaving]=useState(false)
  const[queueDraft,setQueueDraft]=useState<{name:string;routing_strategy:string;sla_minutes:number}>({name:'',routing_strategy:'manual',sla_minutes:30})

  const load=async()=>{
    if(!store||!conversationId)return
    try{
      const[q,s,t,w,m]=await Promise.all([
        api<Queue[]>(`/conversation-queues?store_id=${store}`),
        api<Staff[]>(`/staff?store_id=${store}`),
        api<TagDef[]>(`/conversation-tags?store_id=${store}`),
        api<Workflow>(`/conversations/${conversationId}/workflow`),
        api<Scheduled[]>(`/conversations/${conversationId}/scheduled`),
      ])
      setQueues(q);setStaff(s.filter(x=>x.status!=='inactive'&&x.role!=='delivery'));setTagDefs(t.filter(x=>x.is_active!==false));setWorkflow(w);setScheduled(m)
      setQueueID(w.queue_id||q.find(x=>x.is_active)?.id||'');setStaffID(w.staff_id||'');setPriority(w.priority||'normal')
    }catch{}
  }
  useEffect(()=>{void load()},[store,conversationId])

  const selectedQueue=useMemo(()=>queues.find(q=>q.id===queueID),[queues,queueID])
  useEffect(()=>{if(selectedQueue)setQueueDraft({name:selectedQueue.name,routing_strategy:selectedQueue.routing_strategy,sla_minutes:selectedQueue.sla_minutes})},[selectedQueue?.id,selectedQueue?.routing_strategy,selectedQueue?.sla_minutes])
  useEffect(()=>{
    if(!selectedQueue){setQueueMemberIDs([]);return}
    api<Staff[]>(`/conversation-queues/${selectedQueue.id}/members`).then(rows=>setQueueMemberIDs(rows.filter(x=>x.selected).map(x=>x.id))).catch(()=>setQueueMemberIDs([]))
  },[selectedQueue?.id])

  const saveWorkflow=async()=>{
    setSaving(true)
    try{await api(`/conversations/${conversationId}/workflow`,{method:'PATCH',body:JSON.stringify({queue_id:queueID,staff_id:staffID,priority})});await load();onChanged?.()}catch(e:any){alert(e.message)}finally{setSaving(false)}
  }
  const autoAssign=async()=>{
    setAutoAssigning(true)
    try{await api(`/conversations/${conversationId}/auto-assign`,{method:'POST',body:JSON.stringify({queue_id:queueID})});await load();onChanged?.()}catch(e:any){alert(e.message)}finally{setAutoAssigning(false)}
  }
  const saveQueue=async()=>{
    if(!selectedQueue)return
    setQueueSaving(true)
    try{await api(`/conversation-queues/${selectedQueue.id}`,{method:'PUT',body:JSON.stringify({...queueDraft,is_active:true})});await load()}catch(e:any){alert(e.message)}finally{setQueueSaving(false)}
  }
  const saveMembers=async()=>{
    if(!selectedQueue)return
    setMembersSaving(true)
    try{await api(`/conversation-queues/${selectedQueue.id}/members`,{method:'PUT',body:JSON.stringify({staff_ids:queueMemberIDs})});await load()}catch(e:any){alert(e.message)}finally{setMembersSaving(false)}
  }
  const createQueue=async()=>{
    if(!newQueueName.trim())return
    try{const out=await api<{id:string}>('/conversation-queues',{method:'POST',body:JSON.stringify({store_id:store,name:newQueueName.trim(),routing_strategy:'manual',sla_minutes:30})});setNewQueueName('');await load();setQueueID(out.id)}catch(e:any){alert(e.message)}
  }
  const createTag=async()=>{
    if(!tagName.trim())return
    try{await api('/conversation-tags',{method:'POST',body:JSON.stringify({store_id:store,name:tagName.trim(),color:'#D9FDD3'})});setTagName('');await load()}catch(e:any){alert(e.message)}
  }
  const toggleTag=async(tag:TagDef)=>{
    const active=!!workflow?.tags?.some(x=>x.id===tag.id)
    try{await api(`/conversations/${conversationId}/tags${active?`/${tag.id}`:''}`,{method:active?'DELETE':'POST',body:active?undefined:JSON.stringify({tag_id:tag.id})});await load();onChanged?.()}catch(e:any){alert(e.message)}
  }
  const preset=(minutes:number)=>setScheduleAt(datetimeLocal(new Date(Date.now()+minutes*60000)))
  const schedule=async()=>{
    if(!scheduleBody.trim()||!scheduleAt)return
    const at=new Date(scheduleAt)
    if(Number.isNaN(at.getTime()))return
    setScheduling(true)
    try{await api(`/conversations/${conversationId}/scheduled`,{method:'POST',body:JSON.stringify({body:scheduleBody.trim(),scheduled_for:at.toISOString(),cancel_on_reply:cancelOnReply})});setScheduleBody('');preset(60);await load();onChanged?.()}catch(e:any){alert(e.message)}finally{setScheduling(false)}
  }
  const cancelSchedule=async(id:string)=>{try{await api(`/conversations/${conversationId}/scheduled/${id}`,{method:'DELETE'});await load();onChanged?.()}catch(e:any){alert(e.message)}}

  return <div className="space-y-2">
    <section className="bg-white p-5">
      <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-semibold text-[#111b21]"><UsersRound className="h-4 w-4 text-[#008069]"/>Gestión de atención</div><p className="mt-1 text-[11px] leading-4 text-[#667781]">Organiza la conversación por cola, agente y prioridad sin salir del chat.</p></div><button onClick={()=>void load()} className="rounded-full p-2 text-[#667781] hover:bg-[#f0f2f5]" title="Actualizar"><RefreshCw className="h-4 w-4"/></button></div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <label className="col-span-2 block"><span className="mb-1 block text-[11px] font-medium text-[#54656f]">Cola</span><select className="field" value={queueID} onChange={e=>setQueueID(e.target.value)}><option value="">Sin cola</option>{queues.filter(q=>q.is_active).map(q=><option key={q.id} value={q.id}>{q.name}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-[11px] font-medium text-[#54656f]">Agente</span><select className="field" value={staffID} onChange={e=>setStaffID(e.target.value)}><option value="">Sin asignar</option>{staff.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-[11px] font-medium text-[#54656f]">Prioridad</span><select className="field" value={priority} onChange={e=>setPriority(e.target.value)}><option value="low">Baja</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label>
      </div>
      <div className="mt-3 flex gap-2"><button disabled={saving} onClick={saveWorkflow} className="btn-primary flex-1">{saving?'Guardando...':'Guardar atención'}</button><button disabled={autoAssigning||!selectedQueue||selectedQueue.routing_strategy==='manual'} onClick={autoAssign} className="btn-secondary flex items-center justify-center gap-2" title={selectedQueue?.routing_strategy==='manual'?'Configura una estrategia automática para esta cola':'Asignar automáticamente'}><UserRoundCheck className="h-4 w-4"/>{autoAssigning?'Asignando...':'Autoasignar'}</button></div>
      {workflow&&<div className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${workflow.sla_breached?'bg-rose-50 text-rose-700':'bg-[#f3faf7] text-[#54656f]'}`}><AlarmClock className="h-4 w-4"/><span>{workflow.last_inbound_at?`${workflow.waiting_minutes} min desde el último mensaje del cliente · SLA ${workflow.sla_minutes} min`:`SLA de la cola: ${workflow.sla_minutes} min`}</span>{workflow.sla_breached&&<strong className="ml-auto">Vencido</strong>}</div>}
    </section>

    <section className="bg-white p-5">{selectedQueue&&<><div className="text-sm font-semibold text-[#111b21]">Configuración de {selectedQueue.name}</div><div className="mt-3 grid grid-cols-[1fr_95px] gap-2"><select className="field" value={queueDraft.routing_strategy} onChange={e=>setQueueDraft(v=>({...v,routing_strategy:e.target.value}))}><option value="manual">Manual</option><option value="round_robin">Round-robin</option><option value="least_load">Menor carga</option><option value="random">Aleatoria</option></select><input className="field" type="number" min={1} max={10080} value={queueDraft.sla_minutes} onChange={e=>setQueueDraft(v=>({...v,sla_minutes:Number(e.target.value)||30}))} title="SLA en minutos"/></div><div className="mt-2 flex items-center justify-between text-[11px] text-[#667781]"><span>{strategyLabel(queueDraft.routing_strategy)} · SLA en minutos</span><button disabled={queueSaving} onClick={saveQueue} className="font-semibold text-[#008069] hover:underline">{queueSaving?'Guardando...':'Guardar configuración'}</button></div><div className="mt-4 border-t border-[#eef0f2] pt-3"><div className="flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-[.1em] text-[#667781]">Agentes de la cola</span><button disabled={membersSaving} onClick={saveMembers} className="text-[11px] font-semibold text-[#008069] hover:underline">{membersSaving?'Guardando...':'Guardar agentes'}</button></div><p className="mt-1 text-[10px] leading-4 text-[#8696a0]">Sin selección, la cola puede usar todos los usuarios activos excepto repartidores.</p><div className="mt-2 flex flex-wrap gap-1.5">{staff.map(agent=>{const active=queueMemberIDs.includes(agent.id);return <button key={agent.id} type="button" onClick={()=>setQueueMemberIDs(ids=>active?ids.filter(id=>id!==agent.id):[...ids,agent.id])} className={`rounded-full border px-2.5 py-1.5 text-[10px] font-semibold ${active?'border-[#9ed6c9] bg-[#d9fdd3] text-[#008069]':'border-[#e3e8eb] text-[#667781]'}`}>{active?'✓ ':''}{agent.name}</button>})}</div></div></>}<div className={`${selectedQueue?'mt-4 border-t border-[#eef0f2] pt-4':''}`}><div className="text-[11px] font-semibold uppercase tracking-[.1em] text-[#667781]">Nueva cola</div><div className="mt-2 flex gap-2"><input className="field" value={newQueueName} onChange={e=>setNewQueueName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void createQueue()}}} placeholder="Ej.: Ventas, Soporte, Cotizaciones"/><button onClick={createQueue} disabled={!newQueueName.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#d9fdd3] text-[#008069] disabled:opacity-40"><Plus className="h-4 w-4"/></button></div></div></section>

    <section className="bg-white p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#111b21]"><Tag className="h-4 w-4 text-[#008069]"/>Etiquetas</div>
      <div className="mt-3 flex flex-wrap gap-2">{tagDefs.map(tag=>{const active=workflow?.tags?.some(x=>x.id===tag.id);return <button key={tag.id} onClick={()=>toggleTag(tag)} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${active?'border-[#9ed6c9] text-[#008069]':'border-[#e3e8eb] text-[#667781] hover:bg-[#f7f8fa]'}`} style={active?{backgroundColor:tag.color}:undefined}>{active&&<Check className="h-3 w-3"/>}{tag.name}</button>})}</div>
      <div className="mt-3 flex gap-2"><input className="field" value={tagName} onChange={e=>setTagName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void createTag()}}} placeholder="Nueva etiqueta"/><button onClick={createTag} disabled={!tagName.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#d9fdd3] text-[#008069] disabled:opacity-40"><Plus className="h-4 w-4"/></button></div>
    </section>

    <section className="bg-white p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#111b21]"><Clock3 className="h-4 w-4 text-[#008069]"/>Programar seguimiento</div>
      <p className="mt-1 text-[11px] leading-4 text-[#667781]">Programa un mensaje y, si lo deseas, cancélalo automáticamente cuando el cliente responda antes.</p>
      <textarea className="field mt-3 min-h-20 resize-none" value={scheduleBody} onChange={e=>setScheduleBody(e.target.value)} placeholder="Ej.: Hola, solo paso a confirmar si pudiste revisar la cotización..."/>
      <div className="mt-2 flex flex-wrap gap-1.5">{[[30,'30 min'],[60,'1 h'],[120,'2 h'],[1440,'Mañana']] .map(([m,l])=><button key={String(m)} type="button" onClick={()=>preset(Number(m))} className="rounded-full bg-[#f0f2f5] px-3 py-1.5 text-[11px] font-medium text-[#54656f] hover:bg-[#e5e9eb]">{String(l)}</button>)}</div>
      <input className="field mt-2" type="datetime-local" value={scheduleAt} onChange={e=>setScheduleAt(e.target.value)}/>
      <label className="mt-3 flex items-start gap-2 rounded-xl bg-[#f7f9f8] p-3 text-xs text-[#54656f]"><input type="checkbox" checked={cancelOnReply} onChange={e=>setCancelOnReply(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#00a884]"/><span><strong className="text-[#111b21]">Cancelar si el cliente responde</strong><span className="mt-0.5 block text-[11px] text-[#667781]">Evita enviar seguimientos innecesarios cuando la conversación ya continuó.</span></span></label>
      <button disabled={scheduling||!scheduleBody.trim()||!scheduleAt} onClick={schedule} className="btn-primary mt-3 w-full">{scheduling?'Programando...':'Programar seguimiento'}</button>
      {scheduled.length>0&&<div className="mt-4 space-y-2 border-t border-[#eef0f2] pt-4"><div className="text-[11px] font-semibold uppercase tracking-[.1em] text-[#667781]">Seguimientos</div>{scheduled.slice(0,6).map(item=><div key={item.id} className="rounded-xl border border-[#e9edef] p-3"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="line-clamp-2 text-xs leading-5 text-[#111b21]">{item.body}</div><div className="mt-1 text-[10px] text-[#8696a0]">{new Date(item.scheduled_for).toLocaleString('es-DO')} · {scheduleStatus(item.status)}{item.cancel_on_reply?' · cancela al responder':''}</div>{item.error&&<div className="mt-1 text-[10px] text-rose-600">{item.error}</div>}</div>{item.status==='pending'&&<button onClick={()=>cancelSchedule(item.id)} className="rounded-full p-1.5 text-[#8696a0] hover:bg-rose-50 hover:text-rose-600" title="Cancelar"><X className="h-4 w-4"/></button>}</div></div>)}</div>}
    </section>
  </div>
}

export function ConversationWorkflowPills({queue,agent,priority,slaBreached}:{queue?:string;agent?:string;priority?:string;slaBreached?:boolean}){
  return <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px]">{queue&&<span className="max-w-[120px] truncate rounded-full bg-[#e9edef] px-2 py-0.5 text-[#54656f]">{queue}</span>}{agent&&<span className="max-w-[130px] truncate rounded-full bg-[#d9fdd3] px-2 py-0.5 font-medium text-[#008069]">{agent}</span>}{priority&&priority!=='normal'&&<span className={`rounded-full px-2 py-0.5 font-semibold ${priority==='urgent'?'bg-rose-100 text-rose-700':priority==='high'?'bg-amber-100 text-amber-700':'bg-slate-100 text-slate-600'}`}>{priorityLabel(priority)}</span>}{slaBreached&&<span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">SLA vencido</span>}</div>
}
