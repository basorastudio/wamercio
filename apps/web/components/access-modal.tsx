'use client'

import {useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
import {api} from '@/lib/api'
import PhoneInput,{phoneDisplay} from '@/components/phone-input'
import PinInput from '@/components/pin-input'
import BusinessTemplatePicker,{type BusinessTemplate} from '@/components/business-template-picker'
import {storeSlugify} from '@/lib/store-slug'
import {ArrowLeft,Building2,CheckCircle2,IdCard,KeyRound,LoaderCircle,MapPin,MessageCircleMore,ShieldCheck,Sparkles,UserRound,X} from 'lucide-react'

type Step='phone'|'pin'|'template'|'register'
type VerifyState='idle'|'checking'|'valid'|'invalid'
type RegisterForm={
  name:string;last_name:string;birth_date:string;gender:string;cedula:string;business_name:string;
  province_code:string;province:string;city_id:string;municipality:string;neighborhood_id:string;neighborhood:string;street:string;street_number:string
}

const emptyForm:RegisterForm={name:'',last_name:'',birth_date:'',gender:'',cedula:'',business_name:'',province_code:'',province:'',city_id:'',municipality:'',neighborhood_id:'',neighborhood:'',street:'',street_number:''}
const digits=(value:string)=>String(value||'').replace(/\D/g,'')
const formatCedula=(value:string)=>{const d=digits(value).slice(0,11);return [d.slice(0,3),d.slice(3,10),d.slice(10,11)].filter(Boolean).join('-')}
const unwrapList=(v:any)=>Array.isArray(v)?v:Array.isArray(v?.data)?v.data:Array.isArray(v?.items)?v.items:[]

export default function AccessModal({open,onClose}:{open:boolean;onClose:()=>void}){
  const router=useRouter()
  const [step,setStep]=useState<Step>('phone')
  const [phone,setPhone]=useState('')
  const [phoneValid,setPhoneValid]=useState(false)
  const [phoneVerified,setPhoneVerified]=useState(false)
  const [pin,setPin]=useState('')
  const [form,setForm]=useState<RegisterForm>(emptyForm)
  const [templateSlug,setTemplateSlug]=useState('')
  const [selectedTemplate,setSelectedTemplate]=useState<BusinessTemplate|undefined>()
  const [templates,setTemplates]=useState<BusinessTemplate[]>([])
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [pinLength,setPinLength]=useState(4)
  const [acceptedPinLengths,setAcceptedPinLengths]=useState<number[]>([4])
  const [identityRequired,setIdentityRequired]=useState(false)
  const [identityEnabled,setIdentityEnabled]=useState(false)
  const [cedulaState,setCedulaState]=useState<VerifyState>('idle')
  const [cedulaMessage,setCedulaMessage]=useState('')
  const [lastVerifiedCedula,setLastVerifiedCedula]=useState('')
  const [territoryEnabled,setTerritoryEnabled]=useState(false)
  const [territoryAvailable,setTerritoryAvailable]=useState(true)
  const [territoryLoading,setTerritoryLoading]=useState(false)
  const [provinces,setProvinces]=useState<any[]>([])
  const [cities,setCities]=useState<any[]>([])
  const [neighborhoods,setNeighborhoods]=useState<any[]>([])

  useEffect(()=>{
    if(open){
      document.body.style.overflow='hidden'
      api<any>('/public/platform').then(x=>{
        const current=Math.max(4,Math.min(8,Number(x?.access?.owner_pin_length)||4))
        const raw=Array.isArray(x?.access?.accepted_owner_pin_lengths)?x.access.accepted_owner_pin_lengths:[current]
        const accepted:number[]=Array.from(new Set<number>(raw.map((v:any)=>Number(v)).filter((v:number)=>v>=4&&v<=8))).sort((a:number,b:number)=>a-b)
        setPinLength(current)
        setAcceptedPinLengths(accepted.length?accepted:[current])
        setIdentityRequired(!!x?.identity?.require_owner_verification)
        setIdentityEnabled(!!x?.identity?.enabled)
        setTerritoryEnabled(!!x?.territory?.enabled)
      }).catch(()=>{setPinLength(4);setAcceptedPinLengths([4]);setIdentityRequired(false);setIdentityEnabled(false);setTerritoryEnabled(false)})
      api<BusinessTemplate[]>('/templates').then(t=>setTemplates(t||[])).catch(()=>setTemplates([]))
    } else document.body.style.overflow=''
    return()=>{document.body.style.overflow=''}
  },[open])

  useEffect(()=>{
    if(!open||step!=='register'||!territoryEnabled||provinces.length||territoryLoading)return
    void loadProvinces()
  },[open,step,territoryEnabled])

  useEffect(()=>{
    if(!open||step!=='register'||!identityEnabled)return
    const cedula=digits(form.cedula)
    if(cedula.length!==11||cedula===lastVerifiedCedula)return
    setCedulaState('idle')
    const timer=window.setTimeout(()=>void verifyRegistrationIdentity(true),600)
    return()=>window.clearTimeout(timer)
  },[open,step,form.cedula,identityEnabled,lastVerifiedCedula])

  if(!open)return null

  const loginPinLength=Math.max(pinLength,...acceptedPinLengths)
  const hasLegacyPinLengths=acceptedPinLengths.some(v=>v!==pinLength)
  const loginLengthLabel=acceptedPinLengths.length>1?`${acceptedPinLengths.slice(0,-1).join(', ')} o ${acceptedPinLengths.at(-1)}`:`${acceptedPinLengths[0]||pinLength}`
  const activeTemplates=templates.length?templates:(selectedTemplate?[selectedTemplate]:[])
  const templateName=String((activeTemplates.find(t=>t.slug===templateSlug)||selectedTemplate)?.name||'').trim()
  const rawBusinessName=form.business_name.trim()
  const finalBusinessName=!rawBusinessName?'':(!templateName||templateSlug==='otro-negocio'||/^otro/i.test(templateName))?rawBusinessName:rawBusinessName.toLowerCase().startsWith((templateName+' ').toLowerCase())?rawBusinessName:`${templateName} ${rawBusinessName}`
  const publicSlug=storeSlugify(finalBusinessName)

  const reset=()=>{
    setStep('phone');setPhone('');setPhoneValid(false);setPhoneVerified(false);setPin('');setForm({...emptyForm});setTemplateSlug('');setSelectedTemplate(undefined);setError('');setBusy(false);setAcceptedPinLengths([pinLength]);setCedulaState('idle');setCedulaMessage('');setLastVerifiedCedula('');setCities([]);setNeighborhoods([]);setTerritoryAvailable(true)
  }
  const close=()=>{reset();onClose()}
  const back=()=>{
    setError('')
    if(step==='pin'||step==='template'){setStep('phone');setPin('');setPhoneVerified(false);return}
    if(step==='register'){setStep('template');setPin('');return}
  }

  const validateRegistrationWhatsApp=async()=>{
    await api('/auth/store/validate-whatsapp',{method:'POST',body:JSON.stringify({phone})})
    setPhoneVerified(true)
  }

  const checkPhone=async(e?:React.FormEvent)=>{
    e?.preventDefault()
    if(!phone||!phoneValid){setError('Ingresa un número de WhatsApp válido.');return}
    setBusy(true);setError('')
    try{
      const out=await api<{exists:boolean}>('/auth/store/lookup',{method:'POST',body:JSON.stringify({phone})})
      setPin('')
      if(out.exists){setPhoneVerified(false);setStep('pin');return}
      await validateRegistrationWhatsApp()
      setStep('template')
    }catch(e:any){setPhoneVerified(false);setError(e.message||'No pudimos verificar el número.')}
    finally{setBusy(false)}
  }

  const doLogin=async(value:string)=>{
    if(!acceptedPinLengths.includes(value.length)||busy)return
    setBusy(true);setError('')
    try{
      await api('/auth/store/login',{method:'POST',body:JSON.stringify({phone,pin:value})})
      close();router.push('/dashboard');router.refresh()
    }catch(e:any){setError(e.message||'No pudimos iniciar sesión.');setPin('')}
    finally{setBusy(false)}
  }

  const continueTemplate=()=>{
    if(!templateSlug){setError('Selecciona el tipo de negocio que más se parece al tuyo.');return}
    setError('');setStep('register')
  }

  const setCedula=(value:string)=>{
    const cedula=digits(value).slice(0,11)
    setForm(v=>({...v,cedula}))
    if(cedula!==lastVerifiedCedula){setCedulaState('idle');setCedulaMessage('')}
  }

  const verifyRegistrationIdentity=async(silent=false)=>{
    const cedula=digits(form.cedula)
    if(cedula.length!==11){if(!silent)setError('La Cédula debe tener exactamente 11 dígitos.');return false}
    if(!identityEnabled){
      setCedulaState(identityRequired?'invalid':'idle')
      if(identityRequired&&!silent)setError('La verificación de identidad está temporalmente no disponible. Contacta soporte.')
      return !identityRequired
    }
    setCedulaState('checking')
    if(!silent)setError('')
    try{
      const out=await api<any>('/auth/store/verify-identity',{method:'POST',body:JSON.stringify({cedula})})
      const p=out?.profile||{}
      setForm(v=>({...v,name:String(p.name||v.name||''),last_name:String(p.last_name||v.last_name||''),birth_date:String(p.birth_date||v.birth_date||''),gender:String(p.gender||v.gender||'')}))
      setCedulaState('valid');setCedulaMessage('Identidad verificada y datos personales completados.');setLastVerifiedCedula(cedula)
      return true
    }catch(e:any){setCedulaState('invalid');setCedulaMessage(e.message||'No pudimos verificar la Cédula.');if(!silent)setError(e.message||'No pudimos verificar la Cédula.');return false}
  }

  const loadProvinces=async()=>{
    if(!territoryEnabled)return
    setTerritoryLoading(true)
    try{const out=await api<any>('/public/territories/provinces');setProvinces(unwrapList(out));setTerritoryAvailable(true)}catch{setTerritoryAvailable(false)}finally{setTerritoryLoading(false)}
  }
  const chooseProvince=async(code:string)=>{
    const p=provinces.find(x=>String(x.code)===code)
    setForm(v=>({...v,province_code:code,province:String(p?.name||''),city_id:'',municipality:'',neighborhood_id:'',neighborhood:''}));setCities([]);setNeighborhoods([])
    if(!code)return
    try{const out=await api<any>(`/public/territories/cities?provinceCode=${encodeURIComponent(code)}`);setCities(unwrapList(out))}catch{setTerritoryAvailable(false)}
  }
  const chooseCity=async(id:string)=>{
    const c=cities.find(x=>String(x.cityId||x.id)===id)
    setForm(v=>({...v,city_id:id,municipality:String(c?.name||''),neighborhood_id:'',neighborhood:''}));setNeighborhoods([])
    if(!id)return
    try{const out=await api<any>(`/public/territories/neighborhoods?cityId=${encodeURIComponent(id)}`);setNeighborhoods(unwrapList(out))}catch{setTerritoryAvailable(false)}
  }
  const chooseNeighborhood=(id:string)=>{const n=neighborhoods.find(x=>String(x.id)===id);setForm(v=>({...v,neighborhood_id:id,neighborhood:String(n?.name||'')}))}

  const register=async(e:React.FormEvent)=>{
    e.preventDefault();setError('')
    if(!phoneVerified){setError('Valida tu WhatsApp antes de registrarte.');setStep('phone');return}
    if(digits(form.cedula).length!==11){setError('Completa una Cédula válida de 11 dígitos.');return}
    if(identityEnabled&&cedulaState!=='valid'){
      const ok=await verifyRegistrationIdentity(false);if(!ok)return
    } else if(identityRequired&&cedulaState!=='valid'){
      setError('La verificación de Cédula es obligatoria y no está disponible. Contacta soporte.');return
    }
    if(!form.name.trim()||!form.last_name.trim()){setError('Completa tu nombre y apellido.');return}
    if(!form.business_name.trim()){setError('Completa el nombre del negocio.');return}
    if(!templateSlug){setError('Selecciona un tipo de negocio.');setStep('template');return}
    if(!new RegExp(`^\\d{${pinLength}}$`).test(pin)){setError(`Completa los ${pinLength} dígitos de tu PIN.`);return}
    setBusy(true)
    try{
      await api('/auth/store/register',{method:'POST',body:JSON.stringify({...form,business_name:finalBusinessName,phone,pin,template_slug:templateSlug})})
      close();router.push('/dashboard');router.refresh()
    }catch(e:any){
      const msg=e.message||'No pudimos crear tu comercio.'
      setError(msg)
      if(msg.toLowerCase().includes('ya existe')&&msg.toLowerCase().includes('whatsapp'))setStep('pin')
    }finally{setBusy(false)}
  }

  const wide=step==='template'||step==='register'
  return <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-5">
    <button aria-label="Cerrar acceso" onClick={close} className="absolute inset-0 bg-[#2e3154]/35 backdrop-blur-[3px]"/>
    <section className={`relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl transition-[max-width] sm:rounded-[28px] ${wide?'sm:max-w-4xl':'sm:max-w-lg'}`}>
      <div className="flex shrink-0 items-center border-b border-[#f0f1f5] bg-white/95 px-5 py-4 backdrop-blur">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-500 font-semibold text-white">W</span><div><div className="font-semibold tracking-tight text-ink-900">WAMERCIO</div><div className="text-[10px] font-medium uppercase tracking-[.15em] text-brand-600">Comercio por WhatsApp</div></div></div>
        <button onClick={close} className="ml-auto rounded-xl p-2 text-[#a2a6b8] hover:bg-[#f1f2f6] hover:text-slate-700"><X className="h-5 w-5"/></button>
      </div>

      <div className="modal-scroll min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
        {step!=='phone'&&<button onClick={back} className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#8d92aa] hover:text-ink-900"><ArrowLeft className="h-4 w-4"/>{step==='register'?'Cambiar tipo de negocio':'Cambiar WhatsApp'}</button>}

        {step==='phone'&&<>
          <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600"><MessageCircleMore className="h-7 w-7"/></div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">Tu WhatsApp abre WAMERCIO</h2>
          <p className="mt-2 text-sm leading-6 text-[#8d92aa]">Si ya tienes cuenta, solo pediremos tu PIN. Si eres nuevo, validaremos tu WhatsApp antes de preparar el negocio.</p>
          {error&&<div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          <form onSubmit={checkPhone} className="mt-6"><label className="label">Número de WhatsApp</label><PhoneInput value={phone} onChange={v=>{setPhone(v);setPhoneVerified(false)}} onValidityChange={setPhoneValid} required autoFocus/><button disabled={busy} className="btn-primary mt-4 h-12 w-full">{busy?<><LoaderCircle className="h-4 w-4 animate-spin"/>Validando WhatsApp...</>:'Continuar'}</button></form>
          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-[#a2a6b8]"><ShieldCheck className="h-4 w-4"/>Sin correo ni contraseña para administrar tu comercio.</div>
        </>}

        {step==='pin'&&<>
          <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600"><KeyRound className="h-7 w-7"/></div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-ink-900">Bienvenido de nuevo</h2>
          <p className="mt-2 text-sm leading-6 text-[#8d92aa]">Encontramos una cuenta asociada a <strong className="text-slate-700">{phoneDisplay(phone)}</strong>. Ingresa tu PIN.</p>
          {error&&<div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          <div className="mt-6"><PinInput value={pin} onChange={setPin} onComplete={hasLegacyPinLengths?undefined:doLogin} autoFocus disabled={busy} required label="PIN de acceso" length={loginPinLength}/><p className="mt-4 text-center text-xs text-[#a2a6b8]">{busy?'Verificando acceso...':hasLegacyPinLengths?`Puedes usar tu PIN actual de ${pinLength} dígitos o un PIN anterior compatible (${loginLengthLabel}).`:`Entrarás automáticamente al completar los ${pinLength} dígitos.`}</p>{hasLegacyPinLengths&&<button type="button" disabled={busy||!acceptedPinLengths.includes(pin.length)} onClick={()=>doLogin(pin)} className="btn-primary mt-4 h-12 w-full">{busy?<><LoaderCircle className="h-4 w-4 animate-spin"/>Verificando...</>:'Entrar'}</button>}</div>
        </>}

        {step==='template'&&<>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600"><Sparkles className="h-7 w-7"/></div><h2 className="mt-5 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">¿Qué tipo de negocio tienes?</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#8d92aa]">Elige el que más se parezca al tuyo. WAMERCIO creará categorías, productos de ejemplo, respuestas rápidas y ajustes iniciales para que no empieces desde cero.</p></div><div className="rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800"><strong>{phoneDisplay(phone)}</strong><br/><span className="text-xs text-brand-700/75">✓ WhatsApp validado</span></div></div>
          {error&&<div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          <div className="mt-6"><BusinessTemplatePicker value={templateSlug} onChange={(slug,t)=>{setTemplateSlug(slug);setSelectedTemplate(t);setError('')}}/></div>
          <div className="sticky bottom-0 mt-6 flex justify-end border-t border-slate-100 bg-white/95 pt-4 backdrop-blur"><button disabled={!templateSlug} onClick={continueTemplate} className="btn-primary min-w-44">Usar esta plantilla</button></div>
        </>}

        {step==='register'&&<>
          <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600"><Building2 className="h-7 w-7"/></div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-ink-900">Personaliza tu comercio</h2>
          <p className="mt-2 text-sm leading-6 text-[#8d92aa]">Completa tus datos personales y la ubicación principal del negocio. WAMERCIO utilizará la Cédula para autocompletar tu perfil cuando Identidad Dominicana esté disponible.</p>
          {error&&<div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

          <form onSubmit={register} className="mt-5 space-y-5">
            <section className="rounded-3xl border border-[#edf0f5] bg-white p-5">
              <div className="mb-4"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-brand-600">Datos del propietario</div><h3 className="mt-1 text-lg font-semibold text-ink-900">Identidad y acceso</h3></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="label">WhatsApp *</label><PhoneInput value={phone} onChange={()=>{}} disabled required/><p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5"/>WhatsApp activo y validado</p></div>
                <div><label className="label">Cédula *</label><div className="relative"><IdCard className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a2a6b8]"/><input className="field pl-10" inputMode="numeric" autoComplete="off" value={formatCedula(form.cedula)} onChange={e=>setCedula(e.target.value)} placeholder="000-0000000-0" maxLength={13}/></div>{cedulaState==='checking'&&<p className="mt-1.5 text-xs text-[#8d92aa]">Verificando Cédula...</p>}{cedulaState==='valid'&&<p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5"/>{cedulaMessage}</p>}{cedulaState==='invalid'&&<p className="mt-1.5 text-xs font-semibold text-rose-600">{cedulaMessage}</p>}{digits(form.cedula).length===11&&identityEnabled&&cedulaState!=='checking'&&cedulaState!=='valid'&&<button type="button" className="mt-2 text-xs font-semibold text-brand-700" onClick={()=>void verifyRegistrationIdentity(false)}>Verificar nuevamente</button>}</div>
                <div><label className="label">Nombre *</label><div className="relative"><UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a2a6b8]"/><input className="field pl-9" required value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} placeholder="Nombre"/></div></div>
                <div><label className="label">Apellido *</label><input className="field" required value={form.last_name} onChange={e=>setForm(v=>({...v,last_name:e.target.value}))} placeholder="Apellido"/></div>
                <div><label className="label">Fecha de nacimiento</label><input type="date" className="field" value={form.birth_date} onChange={e=>setForm(v=>({...v,birth_date:e.target.value}))}/></div>
                <div><label className="label">Género</label><select className="field" value={form.gender} onChange={e=>setForm(v=>({...v,gender:e.target.value}))}><option value="">Seleccionar género</option><option value="masculino">Masculino</option><option value="femenino">Femenino</option></select></div>
              </div>
            </section>

            <section className="rounded-3xl border border-[#edf0f5] bg-white p-5">
              <div className="mb-4"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-brand-600">Negocio</div><h3 className="mt-1 text-lg font-semibold text-ink-900">Datos principales</h3></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="label">Tipo de negocio *</label><select className="field" value={templateSlug} onChange={e=>{const slug=e.target.value;setTemplateSlug(slug);setSelectedTemplate(activeTemplates.find(t=>t.slug===slug))}}>{activeTemplates.map(t=><option key={t.slug} value={t.slug}>{t.name}</option>)}</select></div>
                <div><label className="label">Nombre del negocio *</label><input className="field" required value={form.business_name} onChange={e=>setForm(v=>({...v,business_name:e.target.value}))} placeholder="Ej. La Familia"/></div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-brand-50 p-4"><div className="text-[10px] font-bold uppercase tracking-wide text-brand-700">Nombre final</div><div className="mt-1 font-semibold text-brand-900">{finalBusinessName||'Selecciona el tipo y escribe el nombre'}</div></div><div className="rounded-2xl bg-[#fafbfe] p-4"><div className="text-[10px] font-bold uppercase tracking-wide text-[#8f95a8]">Ruta pública</div><div className="mt-1 truncate font-semibold">{publicSlug?`wamercio.com/${publicSlug}`:'Se generará al escribir el nombre'}</div></div></div>
            </section>

            <section className="rounded-3xl border border-[#edf0f5] bg-white p-5">
              <div className="mb-4"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-brand-600">Ubicación</div><h3 className="mt-1 text-lg font-semibold text-ink-900">Dirección principal</h3><p className="mt-1 text-xs text-[#9298ad]">Se utilizará para pedidos, entregas y referencia comercial.</p></div>
              {territoryLoading&&<p className="mb-3 text-xs text-[#9298ad]">Cargando catálogo territorial...</p>}
              {territoryEnabled&&territoryAvailable&&provinces.length>0?<div className="grid gap-4 sm:grid-cols-3"><div><label className="label">Provincia</label><select className="field" value={form.province_code} onChange={e=>void chooseProvince(e.target.value)}><option value="">Selecciona provincia</option>{provinces.map((p:any)=><option key={p.code} value={p.code}>{p.name}</option>)}</select></div><div><label className="label">Municipio / Distrito</label><select className="field" value={form.city_id} onChange={e=>void chooseCity(e.target.value)} disabled={!form.province_code}><option value="">Selecciona municipio</option>{cities.map((c:any)=><option key={c.cityId||c.id} value={c.cityId||c.id}>{c.name}</option>)}</select></div><div><label className="label">Barrio</label><select className="field" value={form.neighborhood_id} onChange={e=>chooseNeighborhood(e.target.value)} disabled={!form.city_id}><option value="">Selecciona barrio</option>{neighborhoods.map((n:any)=><option key={n.id} value={n.id}>{n.name}</option>)}</select></div></div>:<div className="grid gap-4 sm:grid-cols-3"><div><label className="label">Provincia</label><input className="field" value={form.province} onChange={e=>setForm(v=>({...v,province:e.target.value,province_code:''}))}/></div><div><label className="label">Municipio / Distrito</label><input className="field" value={form.municipality} onChange={e=>setForm(v=>({...v,municipality:e.target.value,city_id:''}))}/></div><div><label className="label">Barrio</label><input className="field" value={form.neighborhood} onChange={e=>setForm(v=>({...v,neighborhood:e.target.value,neighborhood_id:''}))}/></div></div>}
              <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_160px]"><div><label className="label">Calle</label><div className="relative"><MapPin className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a2a6b8]"/><input className="field pl-10" value={form.street} onChange={e=>setForm(v=>({...v,street:e.target.value}))} placeholder="Ej. Calle Principal"/></div></div><div><label className="label">Número</label><input className="field" value={form.street_number} onChange={e=>setForm(v=>({...v,street_number:e.target.value}))} placeholder="Ej. 27"/></div></div>
            </section>

            <section className="rounded-3xl border border-[#edf0f5] bg-[#fafbfe] p-5"><label className="label">Crea tu PIN de {pinLength} dígitos *</label><PinInput value={pin} onChange={setPin} required label="Nuevo PIN de acceso" length={pinLength}/><p className="mt-1.5 text-xs text-[#a2a6b8]">Lo usarás junto con tu WhatsApp para entrar rápidamente.</p>{identityRequired&&!identityEnabled&&<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">La verificación de Cédula es obligatoria y está temporalmente no disponible. Contacta soporte.</div>}</section>

            <button disabled={busy||pin.length!==pinLength||(identityRequired&&!identityEnabled)} className="btn-primary h-12 w-full">{busy?<><LoaderCircle className="h-4 w-4 animate-spin"/>Preparando tu comercio...</>:'Crear mi comercio'}</button>
          </form>
          <div className="mt-5 flex items-start gap-2 rounded-2xl bg-[#fafbfe] p-3 text-xs leading-5 text-[#858aa7]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-500"/>Al terminar encontrarás categorías, ejemplos y respuestas rápidas listas para personalizar. Nada queda bloqueado: puedes cambiarlo todo.</div>
        </>}
      </div>
    </section>
  </div>
}
