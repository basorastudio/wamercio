'use client'
import {useEffect,useState} from 'react'
import {useSearchParams} from 'next/navigation'
import {api} from '@/lib/api'
import {LoaderCircle} from 'lucide-react'
export default function CustomerCallback(){const q=useSearchParams(),[error,setError]=useState('');useEffect(()=>{const token=q.get('token')||'';if(!token){setError('Acceso inválido.');return}api('/auth/customer/sso/exchange',{method:'POST',body:JSON.stringify({token})}).then(()=>window.location.replace('/')).catch((e:any)=>setError(e.message||'El acceso ya no es válido.'))},[q]);return <main className="grid min-h-dvh place-items-center bg-[#f7f9fc] p-5"><div className="rounded-3xl bg-white p-8 text-center shadow-xl">{error?<p className="text-sm text-rose-600">{error}</p>:<p className="flex items-center gap-2 text-sm text-emerald-600"><LoaderCircle className="h-4 w-4 animate-spin"/>Abriendo tu cuenta...</p>}</div></main>}
