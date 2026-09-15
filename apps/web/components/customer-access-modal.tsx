'use client'

import {useEffect,useRef,useState} from 'react'
import {api} from '@/lib/api'
import PhoneInput from '@/components/phone-input'
import PinInput from '@/components/pin-input'
import {applyStoreScopeToAddress,normalizeServiceScope,scopeContextLabel,scopeFieldVisibility} from '@/lib/store-service-scope'
import {ArrowLeft,CheckCircle2,IdCard,LoaderCircle,MapPin,MessageCircleMore,ShieldCheck,UserRound,X} from 'lucide-react'

type Step='phone'|'pin'|'register'
type AccountType='customer'|'owner'
type VerifyState='idle'|'checking'|'valid'|'invalid'
type PhoneAutoState='idle'|'waiting'|'checking'|'account'|'new'|'error'
type CustomerForm={
  cedula:string;name:string;last_name:string;birth_date:string;gender:string;
  province_code:string;province:string;city_id:string;municipality:string;neighborhood_id:string;neighborhood:string;street:string;street_number:string;reference:string
}

const emptyForm:CustomerForm={cedula:'',name:'',last_name:'',birth_date:'',gender:'',province_code:'',province:'',city_id:'',municipality:'',neighborhood_id:'',neighborhood:'',street:'',street_number:'',reference:''}
const digits=(value:string)=>String(value||'').replace(/\D/g,'')
const formatCedula=(value:string)=>{const d=digits(value).slice(0,11);return [d.slice(0,3),d.slice(3,10),d.slice(10,11)].filter(Boolean).join('-')}
const unwrapList=(v:any)=>Array.isArray(v)?v:Array.isArray(v?.data)?v.data:Array.isArray(v?.items)?v.items:[]

export default function CustomerAccessModal({open,onClose,onAuthenticated}:{open:boolean;onClose:()=>void;onAuthenticated?:(customer:any)=>void}){
  const[step,setStep]=useState<Step>('phone')
  const[phone,setPhone]=useState('')
  const[phoneValid,setPhoneValid]=useState(false)
  const[phoneAutoState,setPhoneAutoState]=useState<PhoneAutoState>('idle')
  const[accountType,setAccountType]=useState<AccountType>('customer')
  const[pin,setPin]=useState('')
  const[busy,setBusy]=useState(false)
  const[error,setError]=useState('')
  const[form,setForm]=useState<CustomerForm>(emptyForm)
  const[pinLength,setPinLength]=useState(4)
  const[acceptedPinLengths,setAcceptedPinLengths]=useState<number[]>([4])
  const[ownerPinLength,setOwnerPinLength]=useState(4)
  const[acceptedOwnerPinLengths,setAcceptedOwnerPinLengths]=useState<number[]>([4])
  const[identityEnabled,setIdentityEnabled]=useState(false)
  const[cedulaState,setCedulaState]=useState<VerifyState>('idle')
  const[cedulaMessage,setCedulaMessage]=useState('')
  const[lastVerifiedCedula,setLastVerifiedCedula]=useState('')
  const[territoryEnabled,setTerritoryEnabled]=useState(false)
  const[storeTerritory,setStoreTerritory]=useState<any>(null)
  const[territoryAvailable,setTerritoryAvailable]=useState(true)
  const[territoryLoading,setTerritoryLoading]=useState(false)
  const[provinces,setProvinces]=useState<any[]>([])
  const[cities,setCities]=useState<any[]>([])
  const[neighborhoods,setNeighborhoods]=useState<any[]>([])
  const phoneLookupSeq=useRef(0)

  useEffect(()=>{
    if(!open)return
    document.body.style.overflow='hidden'
    api<any>('/public/platform').then(x=>{
      const current=Math.max(4,Math.min(8,Number(x?.access?.customer_pin_length)||4))
      const raw=Array.isArray(x?.access?.accepted_customer_pin_lengths)?x.access.accepted_customer_pin_lengths:[current]
      const accepted=Array.from(new Set<number>(raw.map((v:any)=>Number(v)).filter((v:number)=>v>=4&&v<=8))).sort((a,b)=>a-b)
      setPinLength(current)
      setAcceptedPinLengths(accepted.length?accepted:[current])
      const ownerCurrent=Math.max(4,Math.min(8,Number(x?.access?.owner_pin_length)||4))
      const ownerRaw=Array.isArray(x?.access?.accepted_owner_pin_lengths)?x.access.accepted_owner_pin_lengths:[ownerCurrent]
      const ownerAccepted=Array.from(new Set<number>(ownerRaw.map((v:any)=>Number(v)).filter((v:number)=>v>=4&&v<=8))).sort((a,b)=>a-b)
      setOwnerPinLength(ownerCurrent)
      setAcceptedOwnerPinLengths(ownerAccepted.length?ownerAccepted:[ownerCurrent])
      setIdentityEnabled(!!x?.identity?.enabled)
      setTerritoryEnabled(!!x?.territory?.enabled)
    }).catch(()=>{})
    api<any>('/public/store').then(x=>setStoreTerritory(x?.store||null)).catch(()=>setStoreTerritory(null))
    return()=>{document.body.style.overflow=''}
  },[open])

  useEffect(()=>{
    if(!open||step!=='register'||!territoryEnabled)return
    void prepareScopedTerritory()
  },[open,step,territoryEnabled,storeTerritory?.service_scope,storeTerritory?.province_code,storeTerritory?.city_id])

  useEffect(()=>{
    if(!open||step!=='register'||!identityEnabled)return
    const c=digits(form.cedula)
    if(c.length!==11||c===lastVerifiedCedula)return
    const timer=window.setTimeout(()=>void verifyCedula(true),550)
    return()=>window.clearTimeout(timer)
  },[open,step,form.cedula,identityEnabled,lastVerifiedCedula])

  const tenantRoot=(process.env.NEXT_PUBLIC_TENANT_ROOT_DOMAIN||'ltd.do').toLowerCase()
  const currentHost=typeof window!=='undefined'?window.location.hostname.toLowerCase():''
  const customDomain=!!currentHost&&!currentHost.endsWith('.'+tenantRoot)&&currentHost!==tenantRoot&&currentHost!==(process.env.NEXT_PUBLIC_PLATFORM_DOMAIN||'wamercio.com').toLowerCase()
  const ssoURL=customDomain?`https://cliente.${tenantRoot}/customer-sso?target=${encodeURIComponent(currentHost)}`:''
  const activePinLength=accountType==='owner'?ownerPinLength:pinLength
  const activeAcceptedPinLengths=accountType==='owner'?acceptedOwnerPinLengths:acceptedPinLengths
  const loginPinLength=Math.max(activePinLength,...activeAcceptedPinLengths)
  const hasLegacyPinLengths=activeAcceptedPinLengths.length>1
  const identityLocked=cedulaState==='valid'
  const serviceScope=normalizeServiceScope(storeTerritory?.service_scope)
  const scopeFields=scopeFieldVisibility(serviceScope)

  const finish=async()=>{
    const customer=await api('/customer/me')
    onAuthenticated?.(customer)
    reset()
    onClose()
  }

  const autoResolvePhone=async(expectedPhone:string,seq:number)=>{
    setBusy(true)
    setPhoneAutoState('checking')
    setError('')
    try{
      const out=await api<{exists:boolean;account_type?:AccountType}>('/auth/customer/lookup',{method:'POST',body:JSON.stringify({phone:expectedPhone})})
      if(seq!==phoneLookupSeq.current)return
      const resolvedType:AccountType=out.account_type==='owner'?'owner':'customer'
      setAccountType(resolvedType)
      if(out.exists){
        setPhoneAutoState('account')
        setPin('')
        setStep('pin')
        return
      }
      await api('/auth/customer/validate-whatsapp',{method:'POST',body:JSON.stringify({phone:expectedPhone})})
      if(seq!==phoneLookupSeq.current)return
      setPhoneAutoState('new')
      setStep('register')
    }catch(e:any){
      if(seq!==phoneLookupSeq.current)return
      setPhoneAutoState('error')
      setError(e.message||'No pudimos verificar el WhatsApp.')
    }finally{
      if(seq===phoneLookupSeq.current)setBusy(false)
    }
  }

  useEffect(()=>{
    if(!open||step!=='phone')return
    const seq=++phoneLookupSeq.current
    const normalized=digits(phone)
    if(!phoneValid||normalized.length<10){
      setPhoneAutoState('idle')
      setBusy(false)
      setError('')
      return
    }
    setPhoneAutoState('waiting')
    setError('')
    const timer=window.setTimeout(()=>void autoResolvePhone(phone,seq),450)
    return()=>window.clearTimeout(timer)
  },[open,step,phone,phoneValid])

  if(!open)return null

  const reset=()=>{
    phoneLookupSeq.current++
    setStep('phone')
    setPhone('')
    setPhoneValid(false)
    setPhoneAutoState('idle')
    setAccountType('customer')
    setPin('')
    setForm({...emptyForm})
    setError('')
    setBusy(false)
    setCedulaState('idle')
    setCedulaMessage('')
    setLastVerifiedCedula('')
    setCities([])
    setNeighborhoods([])
    setTerritoryAvailable(true)
  }
  const close=()=>{reset();onClose()}
  const back=()=>{
    phoneLookupSeq.current++
    setError('')
    setPin('')
    setPhone('')
    setPhoneValid(false)
    setPhoneAutoState('idle')
    setAccountType('customer')
    setStep('phone')
  }

  const doLogin=async(value:string)=>{
    if(!activeAcceptedPinLengths.includes(value.length)||busy)return
    setBusy(true)
    setError('')
    try{
      if(accountType==='owner'){
        const out=await api<{redirect_url?:string}>('/auth/store/login',{method:'POST',body:JSON.stringify({phone,pin:value})})
        const platform=(process.env.NEXT_PUBLIC_PLATFORM_DOMAIN||'wamercio.com').toLowerCase()
        window.location.assign(out.redirect_url||`https://${platform}/dashboard`)
        return
      }
      await api('/auth/customer/login',{method:'POST',body:JSON.stringify({phone,pin:value})})
      await finish()
    }catch(e:any){
      setError(e.message||'WhatsApp o PIN incorrecto')
      setPin('')
    }finally{setBusy(false)}
  }

  const setCedula=(value:string)=>{
    if(identityLocked)return
    const c=digits(value).slice(0,11)
    setForm(v=>({...v,cedula:c}))
    if(c!==lastVerifiedCedula){setCedulaState('idle');setCedulaMessage('')}
  }
  const verifyCedula=async(silent=false)=>{
    const c=digits(form.cedula)
    if(c.length!==11){if(!silent)setError('La Cédula debe tener exactamente 11 dígitos.');return false}
    if(!identityEnabled){
      setCedulaState('invalid')
      setCedulaMessage('Identidad Dominicana no está habilitada.')
      if(!silent)setError('La verificación de Identidad Dominicana no está disponible.')
      return false
    }
    setCedulaState('checking')
    if(!silent)setError('')
    try{
      const out=await api<any>('/auth/customer/verify-identity',{method:'POST',body:JSON.stringify({cedula:c})})
      const p=out?.profile||{}
      setForm(v=>({...v,name:String(p.name||v.name||''),last_name:String(p.last_name||v.last_name||''),birth_date:String(p.birth_date||v.birth_date||''),gender:String(p.gender||v.gender||'')}))
      setCedulaState('valid')
      setCedulaMessage('Identidad verificada y datos completados.')
      setLastVerifiedCedula(c)
      return true
    }catch(e:any){
      setCedulaState('invalid')
      setCedulaMessage(e.message||'No pudimos verificar la Cédula.')
      if(!silent)setError(e.message||'No pudimos verificar la Cédula.')
      return false
    }
  }
  const prepareScopedTerritory=async()=>{
    const scope=normalizeServiceScope(storeTerritory?.service_scope)
    setForm(v=>applyStoreScopeToAddress(v,storeTerritory))
    if(!storeTerritory||scope==='national'){
      if(!provinces.length&&!territoryLoading)await loadProvinces()
      return
    }
    setTerritoryLoading(true)
    try{
      if(scope==='provincial'){
        const code=String(storeTerritory?.province_code||'')
        setProvinces([]);setNeighborhoods([])
        setCities(code?unwrapList(await api(`/public/territories/cities?provinceCode=${encodeURIComponent(code)}`)):[])
      }else{
        const city=String(storeTerritory?.city_id||'')
        setProvinces([]);setCities([])
        setNeighborhoods(city?unwrapList(await api(`/public/territories/neighborhoods?cityId=${encodeURIComponent(city)}`)):[])
      }
      setTerritoryAvailable(true)
    }catch{setTerritoryAvailable(false)}finally{setTerritoryLoading(false)}
  }
  const loadProvinces=async()=>{
    setTerritoryLoading(true)
    try{setProvinces(unwrapList(await api('/public/territories/provinces')));setTerritoryAvailable(true)}catch{setTerritoryAvailable(false)}finally{setTerritoryLoading(false)}
  }
  const chooseProvince=async(code:string)=>{
    const p=provinces.find(x=>String(x.code)===code)
    setForm(v=>({...v,province_code:code,province:String(p?.name||''),city_id:'',municipality:'',neighborhood_id:'',neighborhood:''}))
    setCities([]);setNeighborhoods([])
    if(!code)return
    try{setCities(unwrapList(await api(`/public/territories/cities?provinceCode=${encodeURIComponent(code)}`)))}catch{setTerritoryAvailable(false)}
  }
  const chooseCity=async(id:string)=>{
    const c=cities.find(x=>String(x.cityId||x.id)===id)
    setForm(v=>({...v,city_id:id,municipality:String(c?.name||''),neighborhood_id:'',neighborhood:''}))
    setNeighborhoods([])
    if(!id)return
    try{setNeighborhoods(unwrapList(await api(`/public/territories/neighborhoods?cityId=${encodeURIComponent(id)}`)))}catch{setTerritoryAvailable(false)}
  }
  const chooseNeighborhood=(id:string)=>{
    const n=neighborhoods.find(x=>String(x.neighborhoodId||x.id)===id)
    setForm(v=>({...v,neighborhood_id:id,neighborhood:String(n?.name||'')}))
  }
  const register=async(e:React.FormEvent)=>{
    e.preventDefault()
    if(!phoneValid){setError('Revisa el WhatsApp.');return}
    const c=digits(form.cedula)
    if(c.length!==11){setError('Completa una Cédula válida.');return}
    if(cedulaState!=='valid'&&(!await verifyCedula()))return
    if(!form.name.trim()||!form.last_name.trim()){setError('Nombre y apellido son obligatorios.');return}
    if(!form.province.trim()||!form.municipality.trim()||!form.neighborhood.trim()||!form.street.trim()||!form.street_number.trim()){setError('Completa tu dirección principal.');return}
    if(pin.length!==pinLength){setError(`Crea un PIN de ${pinLength} dígitos.`);return}
    setBusy(true);setError('')
    try{
      await api('/auth/customer/register',{method:'POST',body:JSON.stringify({phone,pin,cedula:c,name:form.name,last_name:form.last_name,birth_date:form.birth_date,gender:form.gender,address:{label:'Principal',province_code:form.province_code,province:form.province,city_id:form.city_id,municipality:form.municipality,neighborhood_id:form.neighborhood_id,neighborhood:form.neighborhood,street:form.street,street_number:form.street_number,reference:form.reference,is_primary:true}})})
      await finish()
    }catch(e:any){setError(e.message||'No pudimos crear tu cuenta.')}finally{setBusy(false)}
  }

  return <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/45 p-3 sm:p-6">
    <button className="absolute inset-0" aria-label="Cerrar" onClick={close}/>
    <div className={`relative w-full overflow-hidden rounded-[26px] bg-white shadow-2xl ${step==='register'?'max-w-3xl':'max-w-md'}`}>
      <div className="flex items-center border-b border-slate-100 px-5 py-4">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500 text-sm font-bold text-white">W</div>
        <div className="ml-3"><div className="font-bold text-[#26304f]">WAMERCIO</div><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-emerald-600">{accountType==='owner'&&step==='pin'?'Propietario':'Cliente'}</div></div>
        <button onClick={close} className="ml-auto rounded-full bg-slate-50 p-2 text-slate-400"><X className="h-4 w-4"/></button>
      </div>
      <div className={`scroll-clean max-h-[calc(100vh-9rem)] overflow-y-auto p-5 sm:p-6 ${step==='register'?'sm:p-7':''}`}>
        {step!=='phone'&&<button onClick={back} className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><ArrowLeft className="h-3.5 w-3.5"/>Cambiar WhatsApp</button>}
        {step==='phone'&&<div>
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600"><MessageCircleMore/></div>
          <h2 className="text-2xl font-semibold text-[#26304f]">Tu WhatsApp abre WAMERCIO</h2>
          <p className="mt-2 text-sm leading-6 text-[#8d92aa]">Escríbelo una sola vez. WAMERCIO comprobará automáticamente si ya tienes cuenta y te llevará al siguiente paso.</p>
          <div className="mt-5"><label className="label">Número de WhatsApp</label><PhoneInput value={phone} onChange={setPhone} onValidityChange={setPhoneValid} autoFocus required/></div>
          <div data-testid="customer-phone-auto-status" className="mt-3 min-h-6 text-xs">
            {(phoneAutoState==='waiting'||phoneAutoState==='checking')&&<span className="inline-flex items-center gap-2 font-semibold text-emerald-600"><LoaderCircle className="h-4 w-4 animate-spin"/>Verificando WhatsApp automáticamente...</span>}
            {phoneAutoState==='error'&&<span className="text-rose-600">{error}</span>}
            {phoneAutoState==='idle'&&phone&&<span className="text-slate-400">Completa un número válido para continuar automáticamente.</span>}
          </div>
          {customDomain&&<a href={ssoURL} className="mt-3 block w-full rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-center text-xs font-semibold text-emerald-700">Ya tengo sesión en WAMERCIO</a>}
        </div>}
        {step==='pin'&&<div>
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600"><ShieldCheck/></div>
          <h2 className="text-2xl font-semibold text-[#26304f]">{accountType==='owner'?'Ingresa tu PIN de propietario':'Ingresa tu PIN'}</h2>
          <p className="mt-2 text-sm text-[#8d92aa]">{accountType==='owner'?'Este WhatsApp corresponde al propietario de este negocio. Escribe tu PIN para abrir el panel de administración.':'Este WhatsApp ya está registrado. Escribe tu PIN para continuar.'}</p>
          <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm font-semibold text-emerald-700">WhatsApp verificado · {phone}</div>
          <div className="mt-5"><label className="label">Tu PIN</label><PinInput value={pin} onChange={setPin} onComplete={hasLegacyPinLengths?undefined:doLogin} autoFocus length={loginPinLength}/></div>
          {hasLegacyPinLengths&&<button type="button" disabled={busy||!activeAcceptedPinLengths.includes(pin.length)} onClick={()=>doLogin(pin)} className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-white disabled:opacity-50">Entrar</button>}
          {error&&<p className="mt-3 text-sm text-rose-600">{error}</p>}
          {busy&&<p className="mt-3 flex items-center gap-2 text-xs text-emerald-600"><LoaderCircle className="h-4 w-4 animate-spin"/>Verificando acceso...</p>}
        </div>}
        {step==='register'&&<form onSubmit={register} className="space-y-5">
          <div><div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600"><UserRound/></div><h2 className="text-2xl font-semibold text-[#26304f]">Crea tu cuenta de cliente</h2><p className="mt-1 text-sm text-[#8d92aa]">Tu WhatsApp no tiene cuenta todavía. Completa tus datos una sola vez para comprar en cualquier negocio de WAMERCIO.</p></div>
          <section className="rounded-2xl border border-slate-100 p-4 sm:p-5">
            <div className="mb-4"><div className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-600">Identidad</div><h3 className="font-semibold text-[#26304f]">Datos personales</h3></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label">WhatsApp *</label><PhoneInput value={phone} onChange={setPhone} onValidityChange={setPhoneValid} required disabled/><p className="mt-1 text-xs text-emerald-600">✓ WhatsApp validado</p></div>
              <div><label className="label">Cédula *</label><div className="relative"><IdCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input className="field pl-9 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500" inputMode="numeric" value={formatCedula(form.cedula)} onChange={e=>setCedula(e.target.value)} placeholder="000-0000000-0" disabled={identityLocked}/></div><div className="mt-1 flex items-center gap-2 text-xs">{cedulaState==='checking'&&<><LoaderCircle className="h-3.5 w-3.5 animate-spin text-emerald-600"/><span>Verificando...</span></>}{cedulaState==='valid'&&<><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600"/><span className="text-emerald-600">{cedulaMessage}</span></>}{cedulaState==='invalid'&&<span className="text-rose-600">{cedulaMessage}</span>}</div></div>
              <div><label className="label">Nombre *</label><input className="field disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500" value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} disabled={identityLocked}/></div>
              <div><label className="label">Apellido *</label><input className="field disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500" value={form.last_name} onChange={e=>setForm(v=>({...v,last_name:e.target.value}))} disabled={identityLocked}/></div>
              <div><label className="label">Fecha de nacimiento</label><input type="date" className="field disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500" value={form.birth_date} onChange={e=>setForm(v=>({...v,birth_date:e.target.value}))} disabled={identityLocked}/></div>
              <div><label className="label">Género</label><select className="field disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500" value={form.gender} onChange={e=>setForm(v=>({...v,gender:e.target.value}))} disabled={identityLocked}><option value="">Seleccionar género</option><option value="masculino">Masculino</option><option value="femenino">Femenino</option><option value="otro">Otro</option></select></div>
            </div>
            {identityLocked&&<div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5 text-xs leading-5 text-emerald-700"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/><span>Datos protegidos. La información validada por Identidad Dominicana no puede modificarse manualmente.</span></div>}
          </section>
          <section className="rounded-2xl border border-slate-100 p-4 sm:p-5">
            <div className="mb-4 flex items-start gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><MapPin className="h-4 w-4"/></div><div><div className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-600">Dirección principal</div><h3 className="font-semibold text-[#26304f]">¿Dónde recibirás tus pedidos?</h3></div></div>
            {serviceScope!=='national'&&<div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-xs text-emerald-800"><strong>Alcance {serviceScope==='provincial'?'provincial':'municipal'}:</strong> {scopeContextLabel(storeTerritory,serviceScope)}. WAMERCIO fija automáticamente esta ubicación.</div>}
            {territoryEnabled&&territoryAvailable?<div className={`grid gap-4 ${scopeFields.province?'sm:grid-cols-3':scopeFields.municipality?'sm:grid-cols-2':'sm:grid-cols-1'}`}>{scopeFields.province&&<div><label className="label">Provincia *</label><select className="field" value={form.province_code} onChange={e=>chooseProvince(e.target.value)}><option value="">Selecciona provincia</option>{provinces.map((p:any)=><option key={String(p.code)} value={String(p.code)}>{p.name}</option>)}</select></div>}{scopeFields.municipality&&<div><label className="label">Municipio / Distrito *</label><select className="field" value={form.city_id} disabled={scopeFields.province?!form.province_code:false} onChange={e=>chooseCity(e.target.value)}><option value="">Selecciona municipio</option>{cities.map((c:any)=><option key={String(c.cityId||c.id)} value={String(c.cityId||c.id)}>{c.name}</option>)}</select></div>}<div><label className="label">Barrio *</label><select className="field" value={form.neighborhood_id} disabled={scopeFields.municipality?!form.city_id:false} onChange={e=>chooseNeighborhood(e.target.value)}><option value="">Selecciona barrio</option>{neighborhoods.map((n:any)=><option key={String(n.neighborhoodId||n.id)} value={String(n.neighborhoodId||n.id)}>{n.name}</option>)}</select></div></div>:<div className={`grid gap-4 ${scopeFields.province?'sm:grid-cols-3':scopeFields.municipality?'sm:grid-cols-2':'sm:grid-cols-1'}`}>{scopeFields.province&&<div><label className="label">Provincia *</label><input className="field" value={form.province} onChange={e=>setForm(v=>({...v,province:e.target.value}))}/></div>}{scopeFields.municipality&&<div><label className="label">Municipio / Distrito *</label><input className="field" value={form.municipality} onChange={e=>setForm(v=>({...v,municipality:e.target.value}))}/></div>}<div><label className="label">Barrio *</label><input className="field" value={form.neighborhood} onChange={e=>setForm(v=>({...v,neighborhood:e.target.value}))}/></div></div>}
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_150px]"><div><label className="label">Calle *</label><input className="field" value={form.street} onChange={e=>setForm(v=>({...v,street:e.target.value}))}/></div><div><label className="label">Número *</label><input className="field" value={form.street_number} onChange={e=>setForm(v=>({...v,street_number:e.target.value}))}/></div></div>
            <div className="mt-4"><label className="label">Referencia</label><input className="field" value={form.reference} onChange={e=>setForm(v=>({...v,reference:e.target.value}))} placeholder="Ej.: casa azul, frente al parque"/></div>
          </section>
          <section className="rounded-2xl border border-slate-100 p-4 sm:p-5"><div className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-600">Acceso</div><h3 className="mb-4 font-semibold text-[#26304f]">Crea tu PIN de {pinLength} dígitos</h3><PinInput value={pin} onChange={setPin} length={pinLength} required/></section>
          {error&&<p className="text-sm text-rose-600">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={close} className="rounded-xl border border-slate-200 px-5 py-3 font-semibold text-slate-600">Cancelar</button><button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white disabled:opacity-60">{busy&&<LoaderCircle className="h-4 w-4 animate-spin"/>}Crear cuenta</button></div>
        </form>}
      </div>
    </div>
  </div>
}
