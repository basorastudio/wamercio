'use client'

import {useEffect,useRef,useState} from 'react'
import {useRouter} from 'next/navigation'
import {api} from '@/lib/api'
import {ArrowLeft,Building2,CheckCircle2,LoaderCircle,KeyRound,MessageCircleMore,ShieldCheck,Smartphone,UserRound,X} from 'lucide-react'

type Step='phone'|'pin'|'register'

const digitsOnly=(v:string)=>v.replace(/\D/g,'').slice(0,11)

export default function AccessModal({open,onClose}:{open:boolean;onClose:()=>void}){
  const router=useRouter()
  const [step,setStep]=useState<Step>('phone')
  const [phone,setPhone]=useState('')
  const [pin,setPin]=useState('')
  const [confirmPin,setConfirmPin]=useState('')
  const [form,setForm]=useState({name:'',business_name:'',email:''})
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const pinRef=useRef<HTMLInputElement>(null)

  useEffect(()=>{
    if(open){
      document.body.style.overflow='hidden'
      setTimeout(()=>{ if(step==='pin') pinRef.current?.focus() },80)
    } else {
      document.body.style.overflow=''
    }
    return()=>{document.body.style.overflow=''}
  },[open,step])

  useEffect(()=>{
    if(step==='pin') setTimeout(()=>pinRef.current?.focus(),80)
  },[step])

  if(!open)return null

  const reset=()=>{
    setStep('phone');setPin('');setConfirmPin('');setError('');setBusy(false)
  }
  const close=()=>{reset();onClose()}

  const checkPhone=async(e?:React.FormEvent)=>{
    e?.preventDefault()
    const normalized=digitsOnly(phone)
    if(normalized.length<10){setError('Ingresa un número de WhatsApp válido.');return}
    setPhone(normalized);setBusy(true);setError('')
    try{
      const out=await api<{exists:boolean}>('/auth/store/lookup',{method:'POST',body:JSON.stringify({phone:normalized})})
      if(out.exists){setStep('pin')}else{setStep('register')}
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

  const changePin=(v:string)=>{
    const x=v.replace(/\D/g,'').slice(0,4)
    setPin(x)
    if(x.length===4)void doLogin(x)
  }

  const register=async(e:React.FormEvent)=>{
    e.preventDefault();setError('')
    if(!form.name.trim()||!form.business_name.trim()){setError('Completa tu nombre y el nombre del negocio.');return}
    if(!/^\d{4}$/.test(pin)){setError('El PIN debe tener exactamente 4 dígitos.');return}
    if(pin!==confirmPin){setError('Los PIN no coinciden.');return}
    setBusy(true)
    try{
      await api('/auth/store/register',{method:'POST',body:JSON.stringify({...form,phone,pin})})
      close();router.push('/dashboard');router.refresh()
    }catch(e:any){
      const msg=e.message||'No pudimos crear tu comercio.'
      setError(msg)
      if(msg.toLowerCase().includes('ya existe'))setStep('pin')
    }finally{setBusy(false)}
  }

  return <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-5">
    <button aria-label="Cerrar acceso" onClick={close} className="absolute inset-0 bg-[#2e3154]/35 backdrop-blur-[3px]"/>
    <section className="relative max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-lg sm:rounded-lg">
      <div className="sticky top-0 z-10 flex items-center border-b border-[#f0f1f5] bg-white/95 px-5 py-4 backdrop-blur">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-brand-500 font-semibold text-white">W</span><div><div className="font-semibold tracking-tight text-ink-900">WAMERCIO</div><div className="text-[10px] font-medium uppercase tracking-[.15em] text-brand-600">Acceso a comercios</div></div></div>
        <button onClick={close} className="ml-auto rounded-xl p-2 text-[#a2a6b8] hover:bg-[#f1f2f6] hover:text-slate-700"><X className="h-5 w-5"/></button>
      </div>

      <div className="p-5 sm:p-7">
        {step!=='phone'&&<button onClick={()=>{setStep('phone');setPin('');setConfirmPin('');setError('')}} className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#8d92aa] hover:text-ink-900"><ArrowLeft className="h-4 w-4"/>Cambiar WhatsApp</button>}

        {step==='phone'&&<>
          <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600"><MessageCircleMore className="h-7 w-7"/></div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">Tu WhatsApp abre WAMERCIO</h2>
          <p className="mt-2 text-sm leading-6 text-[#8d92aa]">Escribe tu número una sola vez. Si ya tienes cuenta, te pediremos tu PIN. Si eres nuevo, continuaremos con un registro corto.</p>
          {error&&<div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          <form onSubmit={checkPhone} className="mt-6">
            <label className="label">Número de WhatsApp</label>
            <div className="relative"><Smartphone className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#a2a6b8]"/><input autoFocus className="field h-14 pl-11 text-lg font-semibold" inputMode="tel" autoComplete="tel" placeholder="809 555 1234" value={phone} onChange={e=>setPhone(e.target.value)}/></div>
            <button disabled={busy} className="btn-primary mt-4 h-12 w-full">{busy?<><LoaderCircle className="h-4 w-4 animate-spin"/>Verificando...</>:'Continuar'}</button>
          </form>
          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-[#a2a6b8]"><ShieldCheck className="h-4 w-4"/>Sin correo ni contraseña para administrar tu tienda.</div>
        </>}

        {step==='pin'&&<>
          <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600"><KeyRound className="h-7 w-7"/></div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-ink-900">Bienvenido de nuevo</h2>
          <p className="mt-2 text-sm leading-6 text-[#8d92aa]">Encontramos una cuenta asociada a <strong className="text-slate-700">+{phone}</strong>. Ingresa tu PIN de 4 dígitos.</p>
          {error&&<div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          <div className="mt-6">
            <input ref={pinRef} aria-label="PIN de 4 dígitos" className="h-16 w-full rounded-lg border border-[#e9ebf2] bg-[#fafbfe] text-center text-3xl font-semibold tracking-[.55em] outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10" inputMode="numeric" type="password" maxLength={4} autoComplete="one-time-code" value={pin} onChange={e=>changePin(e.target.value)}/>
            <div className="mt-4 grid grid-cols-4 gap-2">{[0,1,2,3].map(i=><span key={i} className={`h-1.5 rounded-full transition ${pin.length>i?'bg-brand-500':'bg-slate-200'}`}/>)}</div>
            <p className="mt-4 text-center text-xs text-[#a2a6b8]">{busy?'Verificando acceso...':'Entrarás automáticamente al completar los 4 dígitos.'}</p>
          </div>
        </>}

        {step==='register'&&<>
          <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600"><Building2 className="h-7 w-7"/></div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-ink-900">Crea tu comercio</h2>
          <p className="mt-2 text-sm leading-6 text-[#8d92aa]">Este WhatsApp todavía no está registrado. Completa estos datos y tu panel quedará listo.</p>
          <div className="mt-4 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700">WhatsApp: +{phone}</div>
          {error&&<div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          <form onSubmit={register} className="mt-5 space-y-4">
            <div><label className="label">Tu nombre *</label><div className="relative"><UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a2a6b8]"/><input autoFocus className="field pl-9" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Responsable del comercio"/></div></div>
            <div><label className="label">Nombre del negocio *</label><div className="relative"><Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a2a6b8]"/><input className="field pl-9" required value={form.business_name} onChange={e=>setForm({...form,business_name:e.target.value})} placeholder="Mi negocio"/></div></div>
            <div><label className="label">Correo <span className="font-normal text-[#a2a6b8]">(opcional)</span></label><input className="field" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="Para avisos de la cuenta"/></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="label">PIN *</label><input className="field text-center text-lg font-semibold tracking-[.28em]" inputMode="numeric" type="password" maxLength={4} required value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,4))}/></div><div><label className="label">Repetir PIN *</label><input className="field text-center text-lg font-semibold tracking-[.28em]" inputMode="numeric" type="password" maxLength={4} required value={confirmPin} onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,4))}/></div></div>
            <button disabled={busy} className="btn-primary h-12 w-full">{busy?<><LoaderCircle className="h-4 w-4 animate-spin"/>Creando...</>:'Crear mi comercio'}</button>
          </form>
          <div className="mt-5 flex items-start gap-2 rounded-lg bg-[#fafbfe] p-3 text-xs leading-5 text-[#858aa7]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-500"/>Tu primera tienda se crea automáticamente y podrás empezar a cargar productos desde el celular.</div>
        </>}
      </div>
    </section>
  </div>
}
