'use client'

import {useEffect,useMemo,useState} from 'react'
import {api} from '@/lib/api'
import {Check,ChevronRight,LoaderCircle,Search,Sparkles} from 'lucide-react'

export type BusinessTemplate={
  id:string;slug:string;name:string;family:string;description:string;icon:string;engine:string;
  recommended_style:string;settings:Record<string,any>;is_featured:boolean;sort_order:number;categories:string[]
}

export default function BusinessTemplatePicker({value,onChange,compact=false}:{value:string;onChange:(slug:string,template?:BusinessTemplate)=>void;compact?:boolean}){
  const[rows,setRows]=useState<BusinessTemplate[]>([])
  const[loading,setLoading]=useState(true)
  const[family,setFamily]=useState('Todos')
  const[search,setSearch]=useState('')

  useEffect(()=>{api<BusinessTemplate[]>('/templates').then(setRows).finally(()=>setLoading(false))},[])
  const families=useMemo(()=>['Todos',...Array.from(new Set(rows.filter(x=>x.slug!=='otro-negocio').map(x=>x.family)))],[rows])
  const filtered=useMemo(()=>rows.filter(x=>{
    const familyOK=family==='Todos'||x.family===family
    const text=(x.name+' '+x.family+' '+x.description+' '+(x.categories||[]).join(' ')).toLowerCase()
    return familyOK&&text.includes(search.trim().toLowerCase())
  }),[rows,family,search])
  const selected=rows.find(x=>x.slug===value)

  if(loading)return <div className="flex min-h-40 items-center justify-center text-sm text-[#9298ad]"><LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>Preparando tipos de negocio...</div>

  return <div>
    {!compact&&<div className="mb-4"><div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a1a6b8]"/><input className="field pl-10" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Busca tu tipo de negocio..."/></div><div className="modal-scroll mt-3 flex gap-2 overflow-x-auto pb-1">{families.map(f=><button type="button" key={f} onClick={()=>setFamily(f)} className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition ${family===f?'bg-brand-500 text-white':'border border-[#e8ebf1] bg-white text-[#727990] hover:border-brand-200 hover:text-brand-700'}`}>{f}</button>)}</div></div>}

    <div className={`grid gap-3 ${compact?'sm:grid-cols-2':'sm:grid-cols-2 lg:grid-cols-3'}`}>{filtered.map(t=>{
      const active=value===t.slug
      return <button type="button" key={t.id} onClick={()=>onChange(t.slug,t)} className={`group relative overflow-hidden rounded-[22px] border p-4 text-left transition ${active?'border-brand-400 bg-brand-50/65 shadow-[0_8px_24px_rgba(54,179,133,.12)]':'border-[#e9ebf1] bg-white hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md'}`}>
        <div className="flex items-start gap-3"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl ${active?'bg-white':'bg-[#f7f8fb]'}`}>{t.icon||'✨'}</span><div className="min-w-0 flex-1"><div className="flex items-start gap-2"><h3 className="font-semibold text-ink-900">{t.name}</h3>{t.is_featured&&<span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">Popular</span>}</div><p className="mt-1 line-clamp-2 text-xs leading-5 text-[#8d92aa]">{t.description}</p></div>{active?<span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-500 text-white"><Check className="h-4 w-4"/></span>:<ChevronRight className="h-4 w-4 shrink-0 text-[#c0c4d0] transition group-hover:translate-x-0.5 group-hover:text-brand-600"/>}</div>
        {!compact&&t.categories?.length>0&&<div className="mt-3 flex flex-wrap gap-1.5">{t.categories.slice(0,4).map(c=><span key={c} className="rounded-full bg-[#f7f8fa] px-2.5 py-1 text-[10px] font-medium text-[#7d8399]">{c}</span>)}</div>}
      </button>
    })}</div>

    {filtered.length===0&&<div className="rounded-[22px] border border-dashed border-[#e3e6ed] bg-[#fafbfc] p-8 text-center"><Sparkles className="mx-auto h-6 w-6 text-brand-500"/><p className="mt-3 text-sm font-semibold text-ink-900">No encontramos ese negocio</p><p className="mt-1 text-xs leading-5 text-[#9298ad]">Selecciona “Otro tipo de negocio” y WAMERCIO te prepara una base flexible.</p></div>}

    {selected&&<div className="mt-4 flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-xl">{selected.icon}</span><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-[.12em] text-brand-700">Plantilla seleccionada</p><p className="truncate text-sm font-semibold text-ink-900">{selected.name} · {selected.recommended_style}</p></div></div>}
  </div>
}
