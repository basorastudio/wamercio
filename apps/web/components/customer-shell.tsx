'use client'

import {useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
import {api} from '@/lib/api'
import {LogOut,Package,UserRound} from 'lucide-react'

export default function CustomerShell({active,children}:{active:'orders'|'profile';children:React.ReactNode}){
  const router=useRouter(),[customer,setCustomer]=useState<any>(null),[loading,setLoading]=useState(true)
  useEffect(()=>{api('/customer/me').then(setCustomer).catch(()=>router.replace('/')).finally(()=>setLoading(false))},[router])
  const logout=async()=>{try{await api('/auth/customer/logout',{method:'POST'})}catch{}router.push('/');router.refresh()}
  if(loading)return <div className="grid min-h-screen place-items-center bg-[#f7f9fc] text-sm text-slate-400">Cargando tu cuenta...</div>
  if(!customer)return null
  return <div className="min-h-screen bg-[#f7f9fc] text-[#222b45]">
    <header className="border-b border-slate-100 bg-white"><div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6"><a href="/" className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-500 font-bold text-white">W</span><span><strong className="block leading-none">WAMERCIO</strong><small className="mt-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-emerald-600">Mi cuenta</small></span></a><nav className="ml-auto flex items-center gap-2"><a href="/cliente/pedidos" className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${active==='orders'?'bg-emerald-50 text-emerald-700':'text-slate-500 hover:bg-slate-50'}`}><Package className="h-4 w-4"/><span className="hidden sm:inline">Mis pedidos</span></a><a href="/cliente/perfil" className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${active==='profile'?'bg-emerald-50 text-emerald-700':'text-slate-500 hover:bg-slate-50'}`}><UserRound className="h-4 w-4"/><span className="hidden sm:inline">Mi perfil</span></a><button onClick={logout} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500"><LogOut className="h-4 w-4"/><span className="hidden md:inline">Cerrar sesión</span></button></nav></div></header>
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8"><div className="mb-6 flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><div className="grid h-11 w-11 place-items-center rounded-full bg-emerald-50 font-bold text-emerald-700">{String(customer.name||'C').slice(0,1).toUpperCase()}</div><div><div className="font-semibold">{customer.name} {customer.last_name}</div><div className="text-xs text-slate-400">WhatsApp +{customer.phone}</div></div></div>{children}</main>
  </div>
}
