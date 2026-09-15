export type StoreServiceScope='national'|'provincial'|'municipal'

export type StoreTerritoryAnchor={
  service_scope?:string
  province_code?:string
  province?:string
  city_id?:string
  municipality?:string
}

export type ScopedAddress={
  province_code?:string
  province?:string
  city_id?:string
  municipality?:string
  neighborhood_id?:string
  neighborhood?:string
  [key:string]:any
}

export function normalizeServiceScope(value?:string):StoreServiceScope{
  return value==='provincial'||value==='municipal'?value:'national'
}

export function scopeFieldVisibility(value?:string){
  const scope=normalizeServiceScope(value)
  return {
    province:scope==='national',
    municipality:scope!=='municipal',
    neighborhood:true,
  }
}

export function applyStoreScopeToAddress<T extends ScopedAddress>(address:T,store?:StoreTerritoryAnchor|null):T{
  const scope=normalizeServiceScope(store?.service_scope)
  const next={...address} as T
  if(scope==='provincial'||scope==='municipal'){
    next.province_code=String(store?.province_code||'')
    next.province=String(store?.province||'')
  }
  if(scope==='municipal'){
    next.city_id=String(store?.city_id||'')
    next.municipality=String(store?.municipality||'')
  }
  return next
}

export function scopeAnchorReady(store?:StoreTerritoryAnchor|null,scopeValue?:string){
  const scope=normalizeServiceScope(scopeValue??store?.service_scope)
  if(scope==='national')return true
  const provinceReady=!!String(store?.province_code||store?.province||'').trim()
  if(scope==='provincial')return provinceReady
  const cityReady=!!String(store?.city_id||store?.municipality||'').trim()
  return provinceReady&&cityReady
}

export function scopeContextLabel(store?:StoreTerritoryAnchor|null,scopeValue?:string){
  const scope=normalizeServiceScope(scopeValue??store?.service_scope)
  if(scope==='national')return 'Todo el territorio nacional'
  if(scope==='provincial')return String(store?.province||'Provincia del negocio')
  const city=String(store?.municipality||'Municipio / Distrito del negocio')
  const province=String(store?.province||'').trim()
  return province?`${city}, ${province}`:city
}
