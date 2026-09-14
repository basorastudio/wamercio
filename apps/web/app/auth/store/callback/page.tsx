'use client'

import {Suspense,useEffect,useState} from 'react'
import {useSearchParams} from 'next/navigation'
import {LoaderCircle} from 'lucide-react'
import {api} from '@/lib/api'

function StoreCallbackFallback(){
  return <main className="grid min-h-dvh place-items-center bg-[#f7f9fc] p-5"><div className="rounded-3xl bg-white p-8 text-center shadow-xl"><p className="flex items-center gap-2 text-sm text-emerald-600"><LoaderCircle className="h-4 w-4 animate-spin"/>Abriendo tu panel...</p></div></main>
}

function StoreCallbackContent(){
  const searchParams=useSearchParams()
  const[error,setError]=useState('')
  useEffect(()=>{
    const token=searchParams.get('token')||''
    if(!token){setError('Acceso inválido.');return}
    api<{target?:string}>('/auth/store/sso/exchange',{method:'POST',body:JSON.stringify({token})})
      .then(out=>window.location.replace(out.target||'/dashboard'))
      .catch((err:any)=>setError(err.message||'El acceso ya no es válido.'))
  },[searchParams])
  return <main className="grid min-h-dvh place-items-center bg-[#f7f9fc] p-5"><div className="rounded-3xl bg-white p-8 text-center shadow-xl">{error?<p className="text-sm text-rose-600">{error}</p>:<p className="flex items-center gap-2 text-sm text-emerald-600"><LoaderCircle className="h-4 w-4 animate-spin"/>Abriendo tu panel...</p>}</div></main>
}

export default function StoreCallbackPage(){
  return <Suspense fallback={<StoreCallbackFallback/>}><StoreCallbackContent/></Suspense>
}
