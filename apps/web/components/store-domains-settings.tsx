'use client'

import {useCallback,useEffect,useState} from 'react'
import {CheckCircle2,Copy,Globe2,RefreshCw,ShieldCheck,Star,Trash2} from 'lucide-react'
import {api} from '@/lib/api'
import {Alert,Loading} from '@/components/ui'

type StoreDomain={
  id:string
  hostname:string
  status:'pending'|'verified'|'active'|'failed'|string
  is_primary:boolean
  verification_token:string
}

type DomainResponse={
  default_hostname:string
  default_url:string
  cname_target:string
  domains:StoreDomain[]
}

export default function StoreDomainsSettings({storeId,slug}:{storeId:string;slug:string}){
  const[data,setData]=useState<DomainResponse|null>(null)
  const[hostname,setHostname]=useState('')
  const[loading,setLoading]=useState(true)
  const[busy,setBusy]=useState('')
  const[error,setError]=useState('')
  const[notice,setNotice]=useState('')

  const load=useCallback(async()=>{
    if(!storeId)return
    setLoading(true);setError('')
    try{setData(await api<DomainResponse>(`/store-domains?store_id=${encodeURIComponent(storeId)}`))}
    catch(e:any){setError(e.message)}finally{setLoading(false)}
  },[storeId])

  useEffect(()=>{load()},[load])

  const run=async(id:string,fn:()=>Promise<any>,message:string)=>{
    setBusy(id);setError('');setNotice('')
    try{await fn();setNotice(message);await load()}catch(e:any){setError(e.message)}finally{setBusy('')}
  }
  const add=()=>run('add',()=>api(`/store-domains?store_id=${encodeURIComponent(storeId)}`,{method:'POST',body:JSON.stringify({hostname})}),'Dominio registrado. Configura el DNS y luego presiona Verificar.').then(()=>setHostname(''))
  const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);setNotice('Valor copiado.')}catch{}}

  if(loading&&!data)return <Loading/>
  const defaultUrl=data?.default_url||`https://${slug}.${process.env.NEXT_PUBLIC_TENANT_ROOT_DOMAIN||'ltd.do'}`
  const cname=data?.cname_target||'domains.ltd.do'
  return <div>
    <p className="section-kicker">Publicación</p>
    <h2 className="section-title">Dominios del negocio</h2>
    <p className="section-copy">Tu subdominio de WAMERCIO funciona siempre. También puedes vincular un dominio propio sin mover la administración fuera de wamercio.com.</p>
    {error&&<div className="mt-4"><Alert text={error}/></div>}{notice&&<div className="mt-4"><Alert text={notice} type="success"/></div>}

    <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-brand-600"><Globe2 className="h-5 w-5"/></span>
        <div className="min-w-0 flex-1"><div className="text-[10px] font-bold uppercase tracking-[.14em] text-brand-600">Dominio WAMERCIO</div><div className="mt-1 truncate text-sm font-semibold text-ink-900">{defaultUrl}</div><p className="mt-1 text-xs text-emerald-800/70">Activo automáticamente para este negocio.</p></div>
        <a href={defaultUrl} target="_blank" rel="noreferrer" className="btn-secondary">Abrir tienda</a>
      </div>
    </div>

    <div className="mt-5 rounded-2xl border border-[#edf0f4] p-5">
      <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-brand-600"/><div><h3 className="font-semibold text-ink-900">Agregar dominio personalizado</h3><p className="mt-1 text-xs leading-5 text-[#8d92aa]">Escribe únicamente el dominio, sin https:// ni rutas. Luego apunta su CNAME hacia WAMERCIO.</p></div></div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input className="field flex-1" value={hostname} onChange={e=>setHostname(e.target.value.toLowerCase().replace(/^https?:\/\//,'').split('/')[0])} placeholder="mitienda.com"/><button type="button" disabled={!hostname.trim()||busy==='add'} onClick={add} className="btn-primary sm:min-w-32">{busy==='add'?'Agregando...':'Agregar'}</button></div>
      <div className="mt-4 grid gap-3 rounded-2xl bg-[#fafbfe] p-4 sm:grid-cols-2"><div><div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#a0a5b8]">Tipo</div><div className="mt-1 text-sm font-semibold">CNAME</div></div><div><div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#a0a5b8]">Destino</div><button type="button" onClick={()=>copy(cname)} className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-brand-700">{cname}<Copy className="h-3.5 w-3.5"/></button></div></div>
    </div>

    <div className="mt-5 space-y-3">
      {(data?.domains||[]).length===0?<div className="rounded-2xl border border-dashed border-[#dfe3ea] p-7 text-center text-sm text-[#8d92aa]">Todavía no has agregado dominios personalizados.</div>:(data?.domains||[]).map(domain=>{
        const active=domain.status==='active'
        return <div key={domain.id} className="rounded-2xl border border-[#edf0f4] p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-ink-900">{domain.hostname}</strong>{domain.is_primary&&<span className="rounded-full bg-brand-50 px-2 py-1 text-[10px] font-bold text-brand-700">PRINCIPAL</span>}<span className={`rounded-full px-2 py-1 text-[10px] font-bold ${active?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>{active?'ACTIVO':'PENDIENTE DNS'}</span></div>{!active&&<div className="mt-3 rounded-xl bg-[#fafbfe] p-3 text-xs leading-5 text-[#747a92]">Configura <strong>CNAME {domain.hostname}</strong> → <strong>{cname}</strong>. Como alternativa, crea TXT <strong>_wamercio.{domain.hostname}</strong> con el token <button type="button" onClick={()=>copy(domain.verification_token)} className="font-semibold text-brand-700">{domain.verification_token}<Copy className="ml-1 inline h-3 w-3"/></button>.</div>}</div>
            <div className="flex flex-wrap gap-2">
              {!active&&<button type="button" disabled={busy===domain.id+'verify'} onClick={()=>run(domain.id+'verify',()=>api(`/store-domains/${domain.id}/verify`,{method:'POST'}),'Dominio verificado y publicado.')} className="btn-secondary"><RefreshCw className="h-4 w-4"/>Verificar</button>}
              {active&&!domain.is_primary&&<button type="button" disabled={busy===domain.id+'primary'} onClick={()=>run(domain.id+'primary',()=>api(`/store-domains/${domain.id}/primary`,{method:'POST'}),'Dominio marcado como principal.')} className="btn-secondary"><Star className="h-4 w-4"/>Hacer principal</button>}
              {active&&domain.is_primary&&<span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4"/>Dominio principal</span>}
              <button type="button" disabled={busy===domain.id+'delete'} onClick={()=>{if(confirm(`¿Eliminar ${domain.hostname}?`))run(domain.id+'delete',()=>api(`/store-domains/${domain.id}`,{method:'DELETE'}),'Dominio eliminado.')}} className="btn-danger px-3"><Trash2 className="h-4 w-4"/></button>
            </div>
          </div>
        </div>
      })}
    </div>
  </div>
}
