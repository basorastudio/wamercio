'use client'

import {useEffect,useMemo,useState} from 'react'
import {api} from '@/lib/api'
import {loadAddressTerritory} from '@/lib/customer-address-territory'
import {applyStoreScopeToAddress,normalizeServiceScope,scopeContextLabel,scopeFieldVisibility} from '@/lib/store-service-scope'
import {LoaderCircle,MapPin} from 'lucide-react'

const blank={id:'',label:'Principal',province_code:'',province:'',city_id:'',municipality:'',neighborhood_id:'',neighborhood:'',street:'',street_number:'',reference:'',is_primary:false}
const unwrap=(v:any)=>Array.isArray(v)?v:Array.isArray(v?.data)?v.data:Array.isArray(v?.items)?v.items:[]
const same=(a:any,b:any)=>String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase()

export default function CustomerAddressForm({initial,onSaved,onCancel}:{initial?:any;onSaved:()=>void;onCancel:()=>void}){
  const[form,setForm]=useState<any>({...blank,...(initial||{})})
  const[territory,setTerritory]=useState(false)
  const[available,setAvailable]=useState(true)
  const[storeTerritory,setStoreTerritory]=useState<any>(null)
  const[provinces,setProvinces]=useState<any[]>([])
  const[cities,setCities]=useState<any[]>([])
  const[neighborhoods,setNeighborhoods]=useState<any[]>([])
  const[busy,setBusy]=useState(false)
  const[error,setError]=useState('')
  const scope=normalizeServiceScope(storeTerritory?.service_scope)
  const fields=useMemo(()=>scopeFieldVisibility(scope),[scope])

  useEffect(()=>{
    let cancelled=false
    const load=async()=>{
      try{
        const [platform,storePayload]=await Promise.all([api<any>('/public/platform'),api<any>('/public/store').catch(()=>null)])
        if(cancelled)return
        const enabled=!!platform?.territory?.enabled
        const store=storePayload?.store||null
        setTerritory(enabled)
        setStoreTerritory(store)
        let seeded=applyStoreScopeToAddress({...blank,...(initial||{})},store)
        const activeScope=normalizeServiceScope(store?.service_scope)
        if(activeScope==='provincial'&&initial){
          const sameProvince=(store?.province_code&&initial?.province_code)?same(store.province_code,initial.province_code):same(store?.province,initial?.province)
          if(!sameProvince)seeded={...seeded,city_id:'',municipality:'',neighborhood_id:'',neighborhood:''}
        }
        if(activeScope==='municipal'&&initial){
          const sameCity=(store?.city_id&&initial?.city_id)?same(store.city_id,initial.city_id):same(store?.municipality,initial?.municipality)
          if(!sameCity)seeded={...seeded,neighborhood_id:'',neighborhood:''}
        }
        setForm(seeded)
        if(!enabled)return
        try{
          if(activeScope==='national'){
            const provinceList=unwrap(await api('/public/territories/provinces'))
            if(cancelled)return
            setProvinces(provinceList)
            const provinceCode=String(seeded.province_code||'')
            const cityId=String(seeded.city_id||'')
            if(provinceCode){
              const hydrated=await loadAddressTerritory(api,provinceCode,cityId)
              if(cancelled)return
              setCities(hydrated.cities)
              setNeighborhoods(hydrated.neighborhoods)
            }
          }else if(activeScope==='provincial'){
            const provinceCode=String(store?.province_code||'')
            const cityId=String(seeded.city_id||'')
            if(provinceCode){
              const hydrated=await loadAddressTerritory(api,provinceCode,cityId)
              if(cancelled)return
              setCities(hydrated.cities)
              setNeighborhoods(hydrated.neighborhoods)
            }
          }else{
            const cityId=String(store?.city_id||'')
            if(cityId){
              setNeighborhoods(unwrap(await api(`/public/territories/neighborhoods?cityId=${encodeURIComponent(cityId)}`)))
            }
          }
          if(!cancelled)setAvailable(true)
        }catch{if(!cancelled)setAvailable(false)}
      }catch{}
    }
    void load()
    return()=>{cancelled=true}
  },[initial?.id,initial?.province_code,initial?.city_id])

  const province=async(code:string)=>{
    const p=provinces.find(x=>String(x.code)===code)
    setForm((v:any)=>({...v,province_code:code,province:String(p?.name||''),city_id:'',municipality:'',neighborhood_id:'',neighborhood:''}))
    setCities([]);setNeighborhoods([])
    if(code)try{setCities(unwrap(await api(`/public/territories/cities?provinceCode=${encodeURIComponent(code)}`)))}catch{setAvailable(false)}
  }
  const city=async(id:string)=>{
    const c=cities.find(x=>String(x.cityId||x.id)===id)
    setForm((v:any)=>({...v,city_id:id,municipality:String(c?.name||''),neighborhood_id:'',neighborhood:''}))
    setNeighborhoods([])
    if(id)try{setNeighborhoods(unwrap(await api(`/public/territories/neighborhoods?cityId=${encodeURIComponent(id)}`)))}catch{setAvailable(false)}
  }
  const neighborhood=(id:string)=>{
    const n=neighborhoods.find(x=>String(x.neighborhoodId||x.id)===id)
    setForm((v:any)=>({...v,neighborhood_id:id,neighborhood:String(n?.name||'')}))
  }
  const save=async(e:React.FormEvent)=>{
    e.preventDefault()
    const payload=applyStoreScopeToAddress(form,storeTerritory)
    if(!payload.province||!payload.municipality||!payload.neighborhood||!payload.street||!payload.street_number){setError('Completa provincia, municipio, barrio, calle y número.');return}
    setBusy(true);setError('')
    try{await api(payload.id?`/customer/addresses/${payload.id}`:'/customer/addresses',{method:payload.id?'PUT':'POST',body:JSON.stringify(payload)});onSaved()}catch(e:any){setError(e.message||'No se pudo guardar la dirección')}finally{setBusy(false)}
  }

  const territoryFields=territory&&available?
    <div className={`mt-4 grid gap-4 ${fields.province?'sm:grid-cols-3':fields.municipality?'sm:grid-cols-2':'sm:grid-cols-1'}`}>
      {fields.province&&<div><label className="label">Provincia</label><select className="field" value={form.province_code} onChange={e=>province(e.target.value)}><option value="">Selecciona provincia</option>{provinces.map((p:any)=><option key={p.code} value={p.code}>{p.name}</option>)}</select></div>}
      {fields.municipality&&<div><label className="label">Municipio / Distrito</label><select className="field" value={form.city_id} disabled={fields.province&&!form.province_code} onChange={e=>city(e.target.value)}><option value="">Selecciona municipio</option>{cities.map((c:any)=><option key={c.cityId||c.id} value={c.cityId||c.id}>{c.name}</option>)}</select></div>}
      <div><label className="label">Barrio</label><select className="field" value={form.neighborhood_id} disabled={fields.municipality&&!form.city_id} onChange={e=>neighborhood(e.target.value)}><option value="">Selecciona barrio</option>{neighborhoods.map((n:any)=><option key={n.neighborhoodId||n.id} value={n.neighborhoodId||n.id}>{n.name}</option>)}</select></div>
    </div>:
    <div className={`mt-4 grid gap-4 ${fields.province?'sm:grid-cols-3':fields.municipality?'sm:grid-cols-2':'sm:grid-cols-1'}`}>
      {fields.province&&<div><label className="label">Provincia</label><input className="field" value={form.province} onChange={e=>setForm((v:any)=>({...v,province:e.target.value}))}/></div>}
      {fields.municipality&&<div><label className="label">Municipio / Distrito</label><input className="field" value={form.municipality} onChange={e=>setForm((v:any)=>({...v,municipality:e.target.value}))}/></div>}
      <div><label className="label">Barrio</label><input className="field" value={form.neighborhood} onChange={e=>setForm((v:any)=>({...v,neighborhood:e.target.value}))}/></div>
    </div>

  return <form onSubmit={save} className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-4 sm:p-5">
    <div className="mb-4 flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-white text-emerald-600"><MapPin className="h-4 w-4"/></div><div><h3 className="font-semibold">{form.id?'Editar dirección':'Nueva dirección'}</h3><p className="text-xs text-slate-400">Guarda tus lugares frecuentes para pedir más rápido.</p></div></div>
    <div className="grid gap-4 sm:grid-cols-2"><div><label className="label">Nombre</label><input className="field" value={form.label} onChange={e=>setForm((v:any)=>({...v,label:e.target.value}))} placeholder="Casa, trabajo..."/></div><label className="flex items-end gap-2 pb-3 text-sm"><input type="checkbox" checked={!!form.is_primary} onChange={e=>setForm((v:any)=>({...v,is_primary:e.target.checked}))}/><span>Usar como principal</span></label></div>
    {scope!=='national'&&<div className="mt-4 rounded-xl border border-emerald-100 bg-white/80 px-3 py-2.5 text-xs text-emerald-800"><strong>Alcance {scope==='provincial'?'provincial':'municipal'}:</strong> {scopeContextLabel(storeTerritory,scope)}. La ubicación base del negocio se aplica automáticamente.</div>}
    {territoryFields}
    <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_150px]"><div><label className="label">Calle</label><input className="field" value={form.street} onChange={e=>setForm((v:any)=>({...v,street:e.target.value}))}/></div><div><label className="label">Número</label><input className="field" value={form.street_number} onChange={e=>setForm((v:any)=>({...v,street_number:e.target.value}))}/></div></div>
    <div className="mt-4"><label className="label">Referencia</label><input className="field" value={form.reference} onChange={e=>setForm((v:any)=>({...v,reference:e.target.value}))}/></div>
    {error&&<p className="mt-3 text-sm text-rose-600">{error}</p>}
    <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancelar</button><button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white">{busy&&<LoaderCircle className="h-4 w-4 animate-spin"/>}Guardar</button></div>
  </form>
}
