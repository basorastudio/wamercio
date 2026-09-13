'use client'
import {useState} from 'react'
import {useRouter} from 'next/navigation'
import {api} from '@/lib/api'
import {Eye,EyeOff,LockKeyhole,ShieldCheck} from 'lucide-react'

export default function AdminLogin(){
 const router=useRouter();const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[show,setShow]=useState(false);const[error,setError]=useState('');const[busy,setBusy]=useState(false)
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{await api('/auth/admin/login',{method:'POST',body:JSON.stringify({email,password})});router.replace('/admin')}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 return <main className="grid min-h-dvh bg-brand-500 lg:grid-cols-[1.02fr_.98fr]">
  <section className="hidden flex-col justify-between p-12 text-white lg:flex">
   <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-full border-2 border-white font-semibold">W</div><div><div className="text-2xl font-semibold">wamercio</div><div className="text-[10px] font-medium uppercase tracking-[.18em] text-white/70">Administración SaaS</div></div></div>
   <div className="max-w-xl"><span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white"><ShieldCheck className="h-4 w-4"/>Acceso restringido</span><h1 className="mt-6 text-4xl font-semibold leading-tight">Control central de la plataforma.</h1><p className="mt-5 max-w-lg text-lg leading-8 text-white/75">Usuarios, tiendas, planes, suscripciones, soporte y métricas globales en un panel separado de la operación comercial.</p></div>
   <p className="text-sm text-white/55">WAMERCIO · SuperAdmin</p>
  </section>
  <section className="flex items-center justify-center bg-[#fafbfe] p-5 sm:p-8"><form onSubmit={submit} className="w-full max-w-md bg-white p-7 shadow-float sm:p-9">
   <div className="mb-8 lg:hidden"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-brand-500 font-semibold text-white">W</span><div><div className="text-xl font-semibold text-ink-900">wamercio</div><div className="text-[10px] font-medium uppercase tracking-wider text-brand-600">SuperAdmin SaaS</div></div></div></div>
   <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600"><LockKeyhole className="h-6 w-6"/></div><p className="mt-5 text-[10px] font-semibold uppercase tracking-[.16em] text-brand-600">Administración central</p><h2 className="mt-1 text-3xl font-semibold text-ink-900">Iniciar sesión</h2><p className="mt-2 text-sm leading-6 text-[#969bb0]">Este acceso es exclusivo para el administrador SaaS.</p>
   {error&&<div className="mt-5 border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
   <div className="mt-7"><label className="label">Correo administrativo</label><input className="field h-12" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@wamercio.com"/></div>
   <div className="mt-4"><label className="label">Contraseña</label><div className="relative"><input className="field h-12 pr-12" type={show?'text':'password'} autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" onClick={()=>setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9da2b5]">{show?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}</button></div></div>
   <button disabled={busy} className="btn-primary mt-6 h-12 w-full">{busy?'Validando...':'Entrar al SuperAdmin'}</button>
  </form></section>
 </main>
}
