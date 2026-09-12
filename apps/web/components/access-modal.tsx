'use client'

import {useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
import {api} from '@/lib/api'
import PhoneInput,{phoneDisplay} from '@/components/phone-input'
import PinInput from '@/components/pin-input'
import BusinessTemplatePicker,{type BusinessTemplate} from '@/components/business-template-picker'
import {ArrowLeft,Building2,CheckCircle2,KeyRound,LoaderCircle,MessageCircleMore,ShieldCheck,UserRound,X,Sparkles} from 'lucide-react'

type Step='phone'|'pin'|'template'|'register'

export default function AccessModal({open,onClose}:{open:boolean;onClose:()=>void}){
  const router=useRouter()
  const [step,setStep]=useState<Step>('phone')
  const [phone,setPhone]=useState('')
  const [phoneValid,setPhoneValid]=useState(false)
  const [pin,setPin]=useState('')
  const [form,setForm]=useState({name:'',business_name:''})
  const [templateSlug,setTemplateSlug]=useState('')
  const [selectedTemplate,setSelectedTemplate]=useState<BusinessTemplate|undefined>()
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)

  useEffect(()=>{
    if(open)document.body.style.overflow='hidden'
    else document.body.style.overflow=''
    return()=>{document.body.style.overflow=''}
  },[open])

  if(!open)return null

  const reset=()=>{
    setStep('phone');setPhone('');setPhoneValid(false);setPin('');setForm({name:'',business_name:''});setTemplateSlug('');setSelectedTemplate(undefined);setError('');setBusy(false)
  }
  const close=()=>{reset();onClose()}
  const back=()=>{
    setError('')
    if(step==='pin'||step==='template'){setStep('phone');setPin('');return}
    if(step==='register'){setStep('template');setPin('');return}
  }

  const checkPhone=async(e?:React.FormEvent)=>{
    e?.preventDefault()
    if(!phone||!phoneValid){setError('Ingresa un número de WhatsApp válido.');return}
    setBusy(true);setError('')
    try{
      const out=await api<{exists:boolean}>('/auth/store/lookup',{method:'POST',body:JSON.stringify({phone})})
      setPin('')
      setStep(out.exists?'pin':'template')
    }catch(e:any){setError(e.message||'No pudimos verificar el número.')}
    finally{setBusy(false)}
  }

  const doLogin=async(value:string)=>{
    if(value.length!==4||busy)return
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

  const register=async(e:React.FormEvent)=>{
    e.preventDefault();setError('')
    if(!form.name.trim()||!form.business_name.trim()){setError('Completa tu nombre y el nombre del negocio.');return}
    if(!templateSlug){setError('Selecciona una plantilla de negocio.');setStep('template');return}
    if(!/^\d{4}$/.test(pin)){setError('Completa los 4 dígitos de tu PIN.');return}
    setBusy(true)
    try{
      await api('/auth/store/register',{method:'POST',body:JSON.stringify({...form,phone,pin,template_slug:templateSlug})})
      close();router.push('/dashboard');router.refresh()
    }catch(e:any){
      const msg=e.message||'No pudimos crear tu comercio.'
      setError(msg)
      if(msg.toLowerCase().includes('ya existe'))setStep('pin')
    }finally{setBusy(false)}
  }

  const wide=step==='template'
  return <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-5">
    <button aria-label="Cerrar acceso" onClick={close} className="absolute inset-0 bg-[#2e3154]/35 backdrop-blur-[3px]"/>
    <section className={`relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl transition-[max-width] sm:rounded-[28px] ${wide?'sm:max-w-5xl':'sm:max-w-lg'}`}>
      <div className="flex shrink-0 items-center border-b border-[#f0f1f5] bg-white/95 px-5 py-4 backdrop-blur">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-500 font-semibold text-white">W</span><div><div className="font-semibold tracking-tight text-ink-900">WAMERCIO</div><div className="text-[10px] font-medium uppercase tracking-[.15em] text-brand-600">Comercio por WhatsApp</div></div></div>
        <button onClick={close} className="ml-auto rounded-xl p-2 text-[#a2a6b8] hover:bg-[#f1f2f6] hover:text-slate-700"><X className="h-5 w-5"/></button>
      </div>

      <div className="modal-scroll min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
        {step!=='phone'&&<button onClick={back} className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#8d92aa] hover:text-ink-900"><ArrowLeft className="h-4 w-4"/>{step==='register'?'Cambiar tipo de negocio':'Cambiar WhatsApp'}</button>}

        {step==='phone'&&<>
          <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600"><MessageCircleMore className="h-7 w-7"/></div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">Tu WhatsApp abre WAMERCIO</h2>
          <p className="mt-2 text-sm leading-6 text-[#8d92aa]">Si ya tienes cuenta, solo pediremos tu PIN. Si eres nuevo, WAMERCIO te preguntará qué negocio tienes y lo preparará automáticamente.</p>
          {error&&<div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          <form onSubmit={checkPhone} className="mt-6"><label className="label">Número de WhatsApp</label><PhoneInput value={phone} onChange={setPhone} onValidityChange={setPhoneValid} required autoFocus/><button disabled={busy} className="btn-primary mt-4 h-12 w-full">{busy?<><LoaderCircle className="h-4 w-4 animate-spin"/>Verificando...</>:'Continuar'}</button></form>
          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-[#a2a6b8]"><ShieldCheck className="h-4 w-4"/>Sin correo ni contraseña para administrar tu comercio.</div>
        </>}

        {step==='pin'&&<>
          <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600"><KeyRound className="h-7 w-7"/></div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-ink-900">Bienvenido de nuevo</h2>
          <p className="mt-2 text-sm leading-6 text-[#8d92aa]">Encontramos una cuenta asociada a <strong className="text-slate-700">{phoneDisplay(phone)}</strong>. Ingresa tu PIN.</p>
          {error&&<div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          <div className="mt-6"><PinInput value={pin} onChange={setPin} onComplete={doLogin} autoFocus disabled={busy} required label="PIN de acceso"/><p className="mt-4 text-center text-xs text-[#a2a6b8]">{busy?'Verificando acceso...':'Entrarás automáticamente al completar los 4 dígitos.'}</p></div>
        </>}

        {step==='template'&&<>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600"><Sparkles className="h-7 w-7"/></div><h2 className="mt-5 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">¿Qué tipo de negocio tienes?</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#8d92aa]">Elige el que más se parezca al tuyo. WAMERCIO creará categorías, productos de ejemplo, respuestas rápidas y ajustes iniciales para que no empieces desde cero.</p></div><div className="rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800"><strong>{phoneDisplay(phone)}</strong><br/><span className="text-xs text-brand-700/75">Tu WhatsApp será el acceso al panel</span></div></div>
          {error&&<div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          <div className="mt-6"><BusinessTemplatePicker value={templateSlug} onChange={(slug,t)=>{setTemplateSlug(slug);setSelectedTemplate(t);setError('')}}/></div>
          <div className="sticky bottom-0 mt-6 flex justify-end border-t border-slate-100 bg-white/95 pt-4 backdrop-blur"><button disabled={!templateSlug} onClick={continueTemplate} className="btn-primary min-w-44">Usar esta plantilla</button></div>
        </>}

        {step==='register'&&<>
          <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600"><Building2 className="h-7 w-7"/></div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-ink-900">Personaliza tu comercio</h2>
          <p className="mt-2 text-sm leading-6 text-[#8d92aa]">WAMERCIO ya sabe cómo estructurar tu negocio. Solo necesitamos tus datos básicos.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700">WhatsApp: {phoneDisplay(phone)}</div><button type="button" onClick={()=>setStep('template')} className="flex items-center gap-3 rounded-2xl border border-[#e9ebf1] bg-[#fafbfc] px-4 py-3 text-left"><span className="text-xl">{selectedTemplate?.icon||'✨'}</span><span className="min-w-0"><span className="block truncate text-xs font-semibold uppercase tracking-wide text-[#9298ad]">Plantilla</span><span className="block truncate text-sm font-semibold text-ink-900">{selectedTemplate?.name||templateSlug}</span></span></button></div>
          {error&&<div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          <form onSubmit={register} className="mt-5 space-y-4"><div><label className="label">Tu nombre *</label><div className="relative"><UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a2a6b8]"/><input autoFocus className="field pl-9" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Responsable del comercio"/></div></div><div><label className="label">Nombre del negocio *</label><div className="relative"><Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a2a6b8]"/><input className="field pl-9" required value={form.business_name} onChange={e=>setForm({...form,business_name:e.target.value})} placeholder="Mi negocio"/></div></div><div><label className="label">Crea tu PIN de 4 dígitos *</label><PinInput value={pin} onChange={setPin} required label="Nuevo PIN de acceso"/><p className="mt-1.5 text-xs text-[#a2a6b8]">Lo usarás junto con tu WhatsApp para entrar rápidamente.</p></div><button disabled={busy||pin.length!==4} className="btn-primary h-12 w-full">{busy?<><LoaderCircle className="h-4 w-4 animate-spin"/>Preparando tu comercio...</>:'Crear mi comercio'}</button></form>
          <div className="mt-5 flex items-start gap-2 rounded-2xl bg-[#fafbfe] p-3 text-xs leading-5 text-[#858aa7]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-500"/>Al terminar encontrarás categorías, ejemplos y respuestas rápidas listas para personalizar. Nada queda bloqueado: puedes cambiarlo todo.</div>
        </>}
      </div>
    </section>
  </div>
}
