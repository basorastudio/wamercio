'use client'
import Link from 'next/link'
import {useEffect,useState} from 'react'
import {api} from '@/lib/api'
import {Loading} from '@/components/ui'

export default function LegalPublicPage({kind}:{kind:'terms'|'privacy'}){
 const[data,setData]=useState<any>(null)
 useEffect(()=>{api('/public/legal').then(setData).catch(()=>setData({}))},[])
 if(!data)return <div className="mx-auto max-w-4xl p-8"><Loading/></div>
 const title=kind==='terms'?'Términos y condiciones':'Política de privacidad'
 const body=kind==='terms'?data.terms_text:data.privacy_text
 return <main className="min-h-screen bg-[#f7f8fb] px-4 py-8 sm:py-12"><section className="mx-auto max-w-4xl rounded-[28px] border border-[#edf0f4] bg-white p-6 shadow-sm sm:p-10"><div className="flex items-center justify-between gap-4 border-b border-[#edf0f4] pb-6"><div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-brand-600">WAMERCIO</div><h1 className="mt-2 text-3xl font-semibold text-ink-900">{title}</h1><p className="mt-2 text-sm text-[#8d92aa]">Versión {data.version||'1.0'}{data.effective_date?` · Vigente desde ${data.effective_date}`:''}</p></div><Link href="/" className="btn-secondary">Volver</Link></div><div className="mt-7 whitespace-pre-wrap text-sm leading-7 text-[#555d72]">{body||`El contenido de ${title.toLowerCase()} todavía no ha sido publicado por el administrador de WAMERCIO.`}</div><div className="mt-8 rounded-2xl bg-[#fafbfe] p-4 text-xs leading-5 text-[#8d92aa]"><strong className="text-ink-900">Responsable:</strong> {data.responsible_entity||'WAMERCIO'} · {data.jurisdiction||'República Dominicana'}{data.contact_email?` · ${data.contact_email}`:''}</div></section></main>
}
