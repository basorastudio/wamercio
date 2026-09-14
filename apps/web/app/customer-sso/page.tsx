'use client'
import {useEffect,useState} from 'react'
import {useSearchParams} from 'next/navigation'
import {api} from '@/lib/api'
import CustomerAccessModal from '@/components/customer-access-modal'
import {LoaderCircle,ShieldCheck} from 'lucide-react'

export default function CustomerSSO(){
  const q=useSearchParams(),target=q.get('target')||'';const[auth,setAuth]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(true)
  const start=async()=>{setBusy(true);setError('');try{const out=await api<any>('/customer/sso/start',{method:'POST',body:JSON.stringify({target})});window.location.replace(out.target)}catch(e:any){if(/sesión/i.test(e.message||'')){setAuth(true)}else setError(e.message||'No se pudo continuar')}finally{setBusy(false)}}
  useEffect(()=>{if(target)void start();else{setError('Falta el dominio de destino.');setBusy(false)}},[target])
  return <main className="grid min-h-dvh place-items-center bg-[#f7f9fc] p-5"><section className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-xl"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600"><ShieldCheck/></div><h1 className="mt-4 text-xl font-semibold">Acceso seguro WAMERCIO</h1><p className="mt-2 text-sm text-slate-500">Conectando tu sesión de cliente con el dominio del negocio.</p>{busy&&<p className="mt-5 flex items-center justify-center gap-2 text-sm text-emerald-600"><LoaderCircle className="h-4 w-4 animate-spin"/>Verificando sesión...</p>}{error&&<p className="mt-4 text-sm text-rose-600">{error}</p>}</section><CustomerAccessModal open={auth} onClose={()=>setAuth(false)} onAuthenticated={()=>{setAuth(false);void start()}}/></main>
}
