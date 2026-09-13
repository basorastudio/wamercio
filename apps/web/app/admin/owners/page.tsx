'use client'

import {useEffect,useMemo,useState} from 'react'
import SuperAdminShell from '@/components/superadmin-shell'
import {api,dateTime} from '@/lib/api'
import {Alert,Loading,Modal,SearchBox,Status} from '@/components/ui'
import type {Plan} from '@/lib/types'
import PhoneInput,{phoneDisplay} from '@/components/phone-input'
import PinInput from '@/components/pin-input'
import {
  Building2,CheckCircle2,ChevronDown,ChevronUp,ExternalLink,IdCard,Layers3,
  Pencil,Plus,ShieldBan,ShieldCheck,Store,Trash2,UserRound,UsersRound
} from 'lucide-react'

type OwnerForm={
  name:string
  last_name:string
  phone:string
  pin:string
  document_type:'persona'|'empresa'
  document_number:string
  birth_date:string
  gender:string
  status:'active'|'blocked'
}

type BusinessForm={
  name:string
  template_slug:string
  whatsapp:string
  status:'active'|'inactive'
}

type OwnerDetail=OwnerForm&{
  id:string
  plan_id:string
  plan_name:string
  identity_verified:boolean
  stores:any[]
}

const emptyOwner:OwnerForm={
  name:'',last_name:'',phone:'',pin:'',document_type:'persona',document_number:'',birth_date:'',gender:'',status:'active'
}
const emptyBusiness:BusinessForm={name:'',template_slug:'otro-negocio',whatsapp:'',status:'active'}

export default function OwnersPage(){
 const[owners,setOwners]=useState<any[]>([]),[stores,setStores]=useState<any[]>([]),[plans,setPlans]=useState<Plan[]>([]),[templates,setTemplates]=useState<any[]>([])
 const[loading,setLoading]=useState(true),[search,setSearch]=useState(''),[expanded,setExpanded]=useState<string>(''),[ownerPinLength,setOwnerPinLength]=useState(4)
 const[identityEnabled,setIdentityEnabled]=useState(false),[identityRequired,setIdentityRequired]=useState(false)
 const[err,setErr]=useState(''),[deleteTarget,setDeleteTarget]=useState<any>(null),[deleting,setDeleting]=useState(false)
 const[modalOpen,setModalOpen]=useState(false),[modalMode,setModalMode]=useState<'create'|'edit'>('create'),[modalTab,setModalTab]=useState<'owner'|'business'>('owner')
 const[modalLoading,setModalLoading]=useState(false),[saving,setSaving]=useState(false),[verifying,setVerifying]=useState(false),[identityVerified,setIdentityVerified]=useState(false)
 const[editingOwnerID,setEditingOwnerID]=useState(''),[ownerForm,setOwnerForm]=useState<OwnerForm>(emptyOwner),[businessForm,setBusinessForm]=useState<BusinessForm>(emptyBusiness)
 const[ownerBusinesses,setOwnerBusinesses]=useState<any[]>([]),[selectedBusinessID,setSelectedBusinessID]=useState('new'),[planID,setPlanID]=useState('')

 const load=()=>{
  setLoading(true)
  Promise.all([api<any[]>('/admin/users'),api<any[]>('/admin/stores'),api<Plan[]>('/plans'),api<any[]>('/templates'),api<any>('/admin/platform/settings')])
   .then(([u,s,p,t,cfg])=>{
    setOwners(u);setStores(s);setPlans(p);setTemplates(t)
    setOwnerPinLength(Math.max(4,Math.min(8,Number(cfg?.access?.owner_pin_length)||4)))
    setIdentityEnabled(!!cfg?.identity?.enabled)
    setIdentityRequired(!!cfg?.identity?.require_owner_verification)
   }).finally(()=>setLoading(false))
 }
 useEffect(load,[])

 const filtered=useMemo(()=>owners.filter(x=>{
  const full=x.full_name||[x.name,x.last_name].filter(Boolean).join(' ')
  return (full+' '+(x.phone||'')+' '+stores.filter(s=>s.owner_id===x.id).map(s=>s.name).join(' ')).toLowerCase().includes(search.toLowerCase())
 }),[owners,stores,search])
 const ownerStores=(id:string)=>stores.filter(s=>s.owner_id===id)
 const activeTemplates=templates.filter(t=>t.is_active!==false)
 const activePlans=plans.filter((p:any)=>p.is_active!==false)

 const resetModal=()=>{
  setErr('');setModalTab('owner');setModalLoading(false);setSaving(false);setVerifying(false);setIdentityVerified(false)
  setEditingOwnerID('');setOwnerForm({...emptyOwner});setBusinessForm({...emptyBusiness});setOwnerBusinesses([]);setSelectedBusinessID('new');setPlanID(activePlans[0]?.id||'')
 }
 const openCreate=()=>{resetModal();setModalMode('create');setModalOpen(true)}
 const openEdit=async(owner:any)=>{
  resetModal();setModalMode('edit');setEditingOwnerID(owner.id);setModalOpen(true);setModalLoading(true)
  try{
   const d=await api<OwnerDetail>(`/admin/owners/${owner.id}`)
   setOwnerForm({name:d.name||'',last_name:d.last_name||'',phone:d.phone||'',pin:'',document_type:(d.document_type==='empresa'?'empresa':'persona'),document_number:d.document_number||'',birth_date:d.birth_date||'',gender:d.gender||'',status:d.status==='blocked'?'blocked':'active'})
   setIdentityVerified(!!d.identity_verified);setPlanID(d.plan_id||activePlans[0]?.id||'');setOwnerBusinesses(d.stores||[])
   if(d.stores?.length){const st=d.stores[0];setSelectedBusinessID(st.id);setBusinessForm({name:st.name||'',template_slug:st.template_slug||'otro-negocio',whatsapp:st.whatsapp||'',status:st.is_active?'active':'inactive'})}
  }catch(e:any){setErr(e.message)}finally{setModalLoading(false)}
 }
 const selectBusiness=(id:string)=>{
  setSelectedBusinessID(id);setErr('')
  if(id==='new'){setBusinessForm({...emptyBusiness});return}
  const st=ownerBusinesses.find(x=>x.id===id)
  if(st)setBusinessForm({name:st.name||'',template_slug:st.template_slug||'otro-negocio',whatsapp:st.whatsapp||'',status:st.is_active?'active':'inactive'})
 }
 const setDocument=(value:string)=>{
  const max=ownerForm.document_type==='empresa'?11:11
  setOwnerForm(v=>({...v,document_number:value.replace(/\D/g,'').slice(0,max)}));setIdentityVerified(false)
 }
 const verifyIdentity=async()=>{
  setErr('')
  if(!ownerForm.document_number){setErr('Indica una Cédula o RNC para verificar.');return}
  if(!identityEnabled){setErr('La integración de Identidad Dominicana no está habilitada en Centro SaaS.');return}
  setVerifying(true)
  try{await api('/admin/owners/verify-identity',{method:'POST',body:JSON.stringify({subject_type:ownerForm.document_type,document:ownerForm.document_number})});setIdentityVerified(true)}catch(e:any){setIdentityVerified(false);setErr(e.message)}finally{setVerifying(false)}
 }
 const validateOwner=()=>{
  if(!ownerForm.name.trim())return 'El nombre del propietario es obligatorio.'
  if(!ownerForm.phone.trim())return 'El WhatsApp del propietario es obligatorio.'
  if(modalMode==='create'&&!new RegExp(`^\\d{${ownerPinLength}}$`).test(ownerForm.pin))return `El PIN debe tener exactamente ${ownerPinLength} dígitos.`
  if(modalMode==='edit'&&ownerForm.pin&&!new RegExp(`^\\d{${ownerPinLength}}$`).test(ownerForm.pin))return `El nuevo PIN debe tener exactamente ${ownerPinLength} dígitos.`
  if(identityRequired&&!ownerForm.document_number)return 'La Cédula o RNC es obligatoria por la política de Identidad.'
  if(ownerForm.document_number){
   if(ownerForm.document_type==='persona'&&ownerForm.document_number.length!==11)return 'La Cédula debe tener exactamente 11 dígitos.'
   if(ownerForm.document_type==='empresa'&&![9,11].includes(ownerForm.document_number.length))return 'El RNC debe tener 9 u 11 dígitos.'
  }
  return ''
 }
 const ownerPayload=()=>({...ownerForm,plan_id:planID})

 const createOwner=async()=>{
  setErr('');const invalid=validateOwner();if(invalid){setErr(invalid);setModalTab('owner');return}
  setSaving(true)
  try{
   await api('/admin/owners',{method:'POST',body:JSON.stringify({...ownerPayload(),business_name:businessForm.name.trim(),template_slug:businessForm.template_slug,business_whatsapp:businessForm.whatsapp,business_status:businessForm.status})})
   setModalOpen(false);resetModal();load()
  }catch(e:any){setErr(e.message)}finally{setSaving(false)}
 }
 const saveOwner=async()=>{
  setErr('');const invalid=validateOwner();if(invalid){setErr(invalid);return}
  setSaving(true)
  try{await api(`/admin/owners/${editingOwnerID}`,{method:'PUT',body:JSON.stringify(ownerPayload())});await refreshOwnerDetail();load()}catch(e:any){setErr(e.message)}finally{setSaving(false)}
 }
 const refreshOwnerDetail=async()=>{
  if(!editingOwnerID)return
  const d=await api<OwnerDetail>(`/admin/owners/${editingOwnerID}`)
  setOwnerBusinesses(d.stores||[]);setIdentityVerified(!!d.identity_verified);setPlanID(d.plan_id||planID)
 }
 const saveBusiness=async()=>{
  setErr('')
  if(!businessForm.name.trim()){setErr(selectedBusinessID==='new'?'Escribe el nombre del negocio o deja esta pestaña sin guardar.':'El nombre del negocio es obligatorio.');return}
  setSaving(true)
  try{
   await api(`/admin/owners/${editingOwnerID}`,{method:'PUT',body:JSON.stringify(ownerPayload())})
   if(selectedBusinessID==='new')await api(`/admin/owners/${editingOwnerID}/stores`,{method:'POST',body:JSON.stringify(businessForm)})
   else await api(`/admin/stores/${selectedBusinessID}`,{method:'PUT',body:JSON.stringify(businessForm)})
   await refreshOwnerDetail();load();setModalOpen(false)
  }catch(e:any){setErr(e.message)}finally{setSaving(false)}
 }

 const status=async(u:any)=>{const next=u.status==='active'?'blocked':'active';if(!confirm(`${next==='blocked'?'Bloquear':'Activar'} a ${u.full_name||u.name}?`))return;await api(`/admin/users/${u.id}/status`,{method:'PATCH',body:JSON.stringify({status:next})});load()}
 const remove=async()=>{if(!deleteTarget)return;setDeleting(true);setErr('');try{await api(`/admin/users/${deleteTarget.id}`,{method:'DELETE'});setDeleteTarget(null);load()}catch(e:any){setErr(e.message)}finally{setDeleting(false)}}

 return <SuperAdminShell title="Propietarios" subtitle="Gestión de propietarios y negocios" actions={<button className="btn-primary" onClick={openCreate}><Plus className="h-4 w-4"/>Nuevo propietario</button>}>
  <section className="card p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-brand-600">Propietarios</div><h2 className="mt-1 text-xl font-semibold">Gestión de propietarios y negocios</h2><p className="mt-1 text-sm text-[#8d92aa]">Administra los propietarios y los negocios asociados desde una sola sección.</p></div><div className="ml-auto grid grid-cols-2 gap-2"><div className="rounded-2xl bg-brand-50 px-5 py-3 text-center"><div className="text-xl font-semibold text-brand-700">{owners.length}</div><div className="text-[10px] text-brand-700/70">propietarios</div></div><div className="rounded-2xl bg-[#fafbfe] px-5 py-3 text-center"><div className="text-xl font-semibold">{stores.length}</div><div className="text-[10px] text-[#8d92aa]">negocios</div></div></div></div></section>
  <div className="mt-5"><SearchBox value={search} onChange={setSearch} placeholder="Buscar por nombre, WhatsApp o negocio..."/></div>
  <div className="mt-4">{loading?<Loading/>:<div className="space-y-3">{filtered.map(u=>{const owned=ownerStores(u.id),open=expanded===u.id;const display=u.full_name||[u.name,u.last_name].filter(Boolean).join(' ');return <article key={u.id} className="card overflow-hidden"><div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center"><div className="flex min-w-[230px] items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-700"><UsersRound className="h-5 w-5"/></div><div><div className="font-semibold">{display}</div><div className="text-xs text-[#9ba0b4]">{phoneDisplay(u.phone)||'Sin WhatsApp'} · {u.identity_verified?'Identidad verificada':u.document_number?'Documento registrado':'Sin documento'}</div></div></div><div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4"><div><div className="text-[10px] uppercase tracking-wide text-[#a0a5b8]">Plan</div><div className="mt-1 text-sm font-semibold">{u.plan_name}</div></div><div><div className="text-[10px] uppercase tracking-wide text-[#a0a5b8]">Negocios</div><div className="mt-1 text-sm font-semibold">{owned.length}</div></div><div><div className="text-[10px] uppercase tracking-wide text-[#a0a5b8]">Estado</div><div className="mt-1"><Status value={u.status}/></div></div><div><div className="text-[10px] uppercase tracking-wide text-[#a0a5b8]">Registro</div><div className="mt-1 text-sm text-[#7f859d]">{dateTime(u.created_at)}</div></div></div><div className="flex flex-wrap justify-end gap-2"><button title="Editar propietario y negocios" className="btn-secondary px-3" onClick={()=>openEdit(u)}><Pencil className="h-4 w-4"/></button><button title={u.status==='active'?'Bloquear':'Activar'} className={u.status==='active'?'btn-danger px-3':'btn-secondary px-3'} onClick={()=>status(u)}>{u.status==='active'?<ShieldBan className="h-4 w-4"/>:<ShieldCheck className="h-4 w-4"/>}</button><button title="Eliminar" className="btn-danger px-3" onClick={()=>{setErr('');setDeleteTarget(u)}}><Trash2 className="h-4 w-4"/></button><button className="btn-secondary px-3" onClick={()=>setExpanded(open?'':u.id)}>{open?<ChevronUp className="h-4 w-4"/>:<ChevronDown className="h-4 w-4"/>}</button></div></div>{open&&<div className="border-t border-[#edf0f5] bg-[#fafbfe] p-4"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4 text-brand-600"/>Negocios asociados</div>{owned.length?<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{owned.map(s=><div key={s.id} className="rounded-2xl border border-[#edf0f5] bg-white p-4"><div className="flex items-start gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700"><Store className="h-4 w-4"/></span><div className="min-w-0 flex-1"><div className="truncate font-semibold">{s.name}</div><div className="mt-1 text-xs text-[#9ba0b4]">/{s.slug} · {s.products} productos · {s.orders} pedidos</div></div><a href={`/${s.slug}`} target="_blank" className="icon-action"><ExternalLink className="h-4 w-4"/></a></div></div>)}</div>:<div className="rounded-2xl border border-dashed border-[#dfe4ee] p-6 text-center text-sm text-[#9ba0b4]">Este propietario aún no tiene negocios.</div>}</div>}</article>})}</div>}</div>

  <Modal open={modalOpen} onClose={()=>!saving&&setModalOpen(false)} title={modalMode==='create'?'Nuevo propietario':'Editar propietario'} subtitle={modalMode==='create'?'Registra el propietario y, si lo necesitas, crea su primer negocio en el mismo flujo.':'Mantén separados los datos personales y la configuración de sus negocios.'} wide>
   {modalLoading?<Loading/>:<div>
    <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-[#f6f8fb] p-1.5">
     <button type="button" onClick={()=>{setErr('');setModalTab('owner')}} className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${modalTab==='owner'?'bg-white text-brand-700 shadow-sm':'text-[#858ba0] hover:text-ink-900'}`}><UserRound className="h-4 w-4"/>Propietario</button>
     <button type="button" onClick={()=>{setErr('');setModalTab('business')}} className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${modalTab==='business'?'bg-white text-brand-700 shadow-sm':'text-[#858ba0] hover:text-ink-900'}`}><Store className="h-4 w-4"/>Negocio</button>
    </div>
    {err&&<Alert text={err}/>} 

    {modalTab==='owner'&&<div className="space-y-5">
     <section className="rounded-3xl border border-[#edf0f5] bg-white p-5 sm:p-6"><div className="mb-5"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-brand-600">Datos del propietario</div><h4 className="mt-1 text-lg font-semibold">Identidad y acceso</h4><p className="mt-1 text-sm text-[#9298ad]">WhatsApp, documento, datos personales y PIN de administración.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
       <div><label className="label">WhatsApp *</label><PhoneInput required value={ownerForm.phone} onChange={phone=>setOwnerForm(v=>({...v,phone}))}/></div>
       <div><label className="label">Estado</label><select className="field" value={ownerForm.status} onChange={e=>setOwnerForm(v=>({...v,status:e.target.value==='blocked'?'blocked':'active'}))}><option value="active">Activo</option><option value="blocked">Bloqueado</option></select></div>
       <div><label className="label">Nombre *</label><input className="field" autoFocus value={ownerForm.name} onChange={e=>setOwnerForm(v=>({...v,name:e.target.value}))} placeholder="Rafael"/></div>
       <div><label className="label">Apellido</label><input className="field" value={ownerForm.last_name} onChange={e=>setOwnerForm(v=>({...v,last_name:e.target.value}))} placeholder="Pérez"/></div>
       <div><label className="label">Fecha de nacimiento</label><input type="date" className="field" value={ownerForm.birth_date} onChange={e=>setOwnerForm(v=>({...v,birth_date:e.target.value}))}/></div>
       <div><label className="label">Género</label><select className="field" value={ownerForm.gender} onChange={e=>setOwnerForm(v=>({...v,gender:e.target.value}))}><option value="">Seleccionar género</option><option value="masculino">Masculino</option><option value="femenino">Femenino</option><option value="otro">Otro / no especificar</option></select></div>
      </div>
     </section>

     <section className="rounded-3xl border border-[#edf0f5] bg-[#fafbfe] p-5 sm:p-6"><div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-brand-600">Verificación</div><h4 className="mt-1 text-base font-semibold">Cédula / RNC {identityRequired&&<span className="text-rose-500">*</span>}</h4></div>{identityVerified&&<span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5"/>Identidad verificada</span>}</div>
      <div className="grid gap-3 sm:grid-cols-[170px_1fr_auto]"><select className="field" value={ownerForm.document_type} onChange={e=>{setOwnerForm(v=>({...v,document_type:e.target.value==='empresa'?'empresa':'persona',document_number:''}));setIdentityVerified(false)}}><option value="persona">Cédula</option><option value="empresa">RNC</option></select><div className="relative"><IdCard className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a2a6b8]"/><input inputMode="numeric" className="field pl-10" value={ownerForm.document_number} onChange={e=>setDocument(e.target.value)} placeholder={ownerForm.document_type==='persona'?'000-0000000-0':'000000000'}/></div><button type="button" className="btn-secondary" disabled={verifying||!ownerForm.document_number} onClick={verifyIdentity}>{verifying?'Verificando...':'Verificar'}</button></div>
      <p className="mt-2 text-xs leading-5 text-[#9298ad]">{identityEnabled?'La verificación se realiza de forma segura con Identidad Dominicana.':'La integración de Identidad Dominicana está deshabilitada; puedes registrar el documento sin verificarlo salvo que la política central lo exija.'}</p>
     </section>

     <section className="rounded-3xl border border-[#edf0f5] bg-white p-5 sm:p-6"><div className="mb-4"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-brand-600">Acceso</div><h4 className="mt-1 text-base font-semibold">PIN de {ownerPinLength} dígitos {modalMode==='create'&&'*'}</h4><p className="mt-1 text-xs text-[#9298ad]">{modalMode==='edit'?'Déjalo vacío para conservar el PIN actual.':'El propietario utilizará este PIN junto con su WhatsApp para entrar.'}</p></div><div className="max-w-md"><PinInput value={ownerForm.pin} onChange={pin=>setOwnerForm(v=>({...v,pin}))} label={`PIN de ${ownerPinLength} dígitos`} length={ownerPinLength}/></div></section>

     <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn-secondary" disabled={saving} onClick={()=>setModalOpen(false)}>Cancelar</button>{modalMode==='edit'&&<button type="button" className="btn-primary" disabled={saving} onClick={saveOwner}>{saving?'Guardando...':'Guardar propietario'}</button>}<button type="button" className={modalMode==='create'?'btn-primary':'btn-secondary'} disabled={saving} onClick={()=>{const invalid=validateOwner();if(invalid){setErr(invalid);return}setErr('');setModalTab('business')}}>{modalMode==='create'?'Continuar a negocio':'Ir a negocios'}</button></div>
    </div>}

    {modalTab==='business'&&<div className="space-y-5">
     {modalMode==='edit'&&<section className="rounded-3xl border border-[#edf0f5] bg-[#fafbfe] p-4"><div className="mb-3 flex items-center justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-brand-600">Negocios asociados</div><div className="mt-1 text-sm font-semibold">Selecciona cuál deseas editar</div></div><button type="button" className="btn-secondary px-3" onClick={()=>selectBusiness('new')}><Plus className="h-4 w-4"/>Nuevo negocio</button></div><div className="flex gap-2 overflow-x-auto pb-1">{ownerBusinesses.map(st=><button key={st.id} type="button" onClick={()=>selectBusiness(st.id)} className={`min-w-[180px] rounded-2xl border p-3 text-left transition ${selectedBusinessID===st.id?'border-brand-300 bg-brand-50':'border-[#e8ebf1] bg-white hover:border-brand-200'}`}><div className="truncate text-sm font-semibold">{st.name}</div><div className="mt-1 truncate text-xs text-[#9298ad]">/{st.slug}</div></button>)}{selectedBusinessID==='new'&&<div className="min-w-[180px] rounded-2xl border border-dashed border-brand-300 bg-brand-50/50 p-3"><div className="text-sm font-semibold text-brand-700">Nuevo negocio</div><div className="mt-1 text-xs text-brand-700/70">Crear para este propietario</div></div>}</div></section>}

     <section className="rounded-3xl border border-[#edf0f5] bg-white p-5 sm:p-6"><div className="mb-5"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-brand-600">Negocio</div><h4 className="mt-1 text-lg font-semibold">{modalMode==='create'?'Primer negocio (opcional)':selectedBusinessID==='new'?'Crear nuevo negocio':'Editar negocio'}</h4><p className="mt-1 text-sm text-[#9298ad]">Los datos comerciales se mantienen separados de la identidad del propietario.</p></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><label className="label">Nombre del negocio {modalMode==='edit'&&'*'}</label><input className="field" value={businessForm.name} onChange={e=>setBusinessForm(v=>({...v,name:e.target.value}))} placeholder="Ej.: Ferretería La Familia"/></div><div><label className="label">Tipo de negocio</label><select className="field" value={businessForm.template_slug} onChange={e=>setBusinessForm(v=>({...v,template_slug:e.target.value}))}>{activeTemplates.map(t=><option key={t.slug} value={t.slug}>{t.name}</option>)}</select></div><div><label className="label">Plan SaaS</label><select className="field" value={planID} onChange={e=>setPlanID(e.target.value)}>{activePlans.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select><p className="mt-1 text-[11px] text-[#9da2b5]">El plan pertenece al propietario y cubre sus negocios según sus límites.</p></div><div><label className="label">WhatsApp comercial</label><PhoneInput value={businessForm.whatsapp} onChange={whatsapp=>setBusinessForm(v=>({...v,whatsapp}))}/><p className="mt-1 text-[11px] text-[#9da2b5]">Si lo dejas vacío se utilizará el WhatsApp del propietario al crear.</p></div><div><label className="label">Estado</label><select className="field" value={businessForm.status} onChange={e=>setBusinessForm(v=>({...v,status:e.target.value==='inactive'?'inactive':'active'}))}><option value="active">Activo</option><option value="inactive">Inactivo</option></select></div></div>
     </section>

     <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><button type="button" className="btn-secondary" disabled={saving} onClick={()=>{setErr('');setModalTab('owner')}}>Volver a propietario</button><div className="flex flex-col-reverse gap-2 sm:flex-row"><button type="button" className="btn-secondary" disabled={saving} onClick={()=>setModalOpen(false)}>Cancelar</button>{modalMode==='create'?<button type="button" className="btn-primary" disabled={saving} onClick={createOwner}>{saving?'Creando...':businessForm.name.trim()?'Crear propietario y negocio':'Crear solo propietario'}</button>:<button type="button" className="btn-primary" disabled={saving||!businessForm.name.trim()} onClick={saveBusiness}>{saving?'Guardando...':selectedBusinessID==='new'?'Crear negocio':'Guardar negocio'}</button>}</div></div>
    </div>}
   </div>}
  </Modal>

  <Modal open={!!deleteTarget} onClose={()=>!deleting&&setDeleteTarget(null)} title="Eliminar propietario" subtitle="Esta acción es permanente y elimina también sus negocios.">
   {deleteTarget&&<div>{err&&<Alert text={err}/>}<div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm leading-6 text-rose-800">Vas a eliminar a <strong>{deleteTarget.full_name||deleteTarget.name}</strong> y todos sus negocios asociados. Los pedidos históricos vinculados se eliminarán según la política actual de WAMERCIO.</div><div className="mt-6 flex justify-end gap-2"><button type="button" className="btn-secondary" disabled={deleting} onClick={()=>setDeleteTarget(null)}>Cancelar</button><button type="button" className="btn-danger" disabled={deleting} onClick={remove}><Trash2 className="h-4 w-4"/>{deleting?'Eliminando...':'Eliminar definitivamente'}</button></div></div>}
  </Modal>
 </SuperAdminShell>
}
