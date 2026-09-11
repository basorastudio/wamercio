'use client'
import {useEffect,useRef,useState} from 'react'
import {useRouter} from 'next/navigation'
import Link from 'next/link'
import {api} from '@/lib/api'
import {ArrowLeft,MessageCircleMore,ShieldCheck,Smartphone} from 'lucide-react'

const digitsOnly=(v:string)=>v.replace(/\D/g,'').slice(0,11)
export default function StoreLogin(){
 const router=useRouter();const[step,setStep]=useState<1|2>(1),[phone,setPhone]=useState(''),[pin,setPin]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);const pinRef=useRef<HTMLInputElement>(null)
 useEffect(()=>{if(step===2)setTimeout(()=>pinRef.current?.focus(),80)},[step])
 const next=(e:React.FormEvent)=>{e.preventDefault();setError('');const p=digitsOnly(phone);if(p.length<10){setError('Ingresa un número de WhatsApp válido.');return}setPhone(p);setStep(2)}
 const login=async(value:string)=>{if(value.length!==4||busy)return;setBusy(true);setError('');try{await api('/auth/store/login',{method:'POST',body:JSON.stringify({phone,pin:value})});router.replace('/dashboard')}catch(e:any){setError(e.message);setPin('')}finally{setBusy(false)}}
 const changePin=(v:string)=>{const x=v.replace(/\D/g,'').slice(0,4);setPin(x);if(x.length===4)login(x)}
 return <main className="min-h-dvh bg-[#f6f8fb] px-4 py-6 sm:grid sm:place-items-center">
  <div className="mx-auto w-full max-w-md">
   <div className="mb-8 flex items-center justify-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-400 text-xl font-black text-slate-950 shadow-sm">W</span><div><div className="text-xl font-black text-slate-900">WAMERCIO</div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-amber-600">Panel de tienda</div></div></div>
   <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-soft sm:p-7">
    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><MessageCircleMore className="h-7 w-7"/></div>
    <div className="mt-4 text-center"><h1 className="text-2xl font-black text-slate-900">{step===1?'Tu WhatsApp es tu usuario':'Ingresa tu PIN'}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{step===1?'Accede rápido a la administración de tu comercio.':'PIN de 4 dígitos para '+(phone?`+${phone}`:'tu cuenta')}</p></div>
    {error&&<div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-center text-sm text-rose-700">{error}</div>}
    {step===1?<form onSubmit={next} className="mt-6"><label className="label">Número de WhatsApp</label><div className="relative"><Smartphone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"/><input autoFocus className="field h-14 pl-11 text-lg font-semibold" inputMode="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="809 555 1234"/></div><button className="btn-primary mt-4 h-13 w-full bg-amber-400 text-slate-950 hover:bg-amber-500">Continuar</button></form>:<div className="mt-6"><button onClick={()=>{setStep(1);setPin('');setError('')}} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-500"><ArrowLeft className="h-4 w-4"/>Cambiar número</button><input ref={pinRef} aria-label="PIN de 4 dígitos" className="h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 text-center text-3xl font-black tracking-[.55em] outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-400/10" inputMode="numeric" type="password" maxLength={4} autoComplete="one-time-code" value={pin} onChange={e=>changePin(e.target.value)}/><div className="mt-4 grid grid-cols-4 gap-2">{[0,1,2,3].map(i=><span key={i} className={`h-1.5 rounded-full ${pin.length>i?'bg-amber-400':'bg-slate-200'}`}/>)}</div><p className="mt-4 text-center text-xs text-slate-400">{busy?'Verificando acceso...':'Al completar los 4 dígitos entrarás automáticamente.'}</p></div>}
   </section>
   <p className="mt-5 text-center text-sm text-slate-500">¿Nuevo en WAMERCIO? <Link href="/register" className="font-bold text-amber-600">Crear comercio</Link></p>
   <p className="mt-7 flex items-center justify-center gap-1 text-center text-[11px] text-slate-400"><ShieldCheck className="h-3.5 w-3.5"/>Acceso independiente del panel SaaS</p>
  </div>
 </main>
}
