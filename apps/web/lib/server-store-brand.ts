import {headers} from 'next/headers'

export function normalizeRequestHost(value:string|null){return String(value||'').split(',')[0].trim().toLowerCase().replace(/:\d+$/,'').replace(/\.$/,'')}
export function currentRequestHost(){return normalizeRequestHost(headers().get('x-forwarded-host')||headers().get('host'))}
export function isPlatformRequestHost(host=currentRequestHost()){
  const platform=(process.env.NEXT_PUBLIC_PLATFORM_DOMAIN||'wamercio.com').toLowerCase()
  return host===''||host===platform||host===`www.${platform}`||host==='localhost'||host==='127.0.0.1'
}
export async function currentTenantStore(){
  const host=currentRequestHost();if(isPlatformRequestHost(host))return null
  try{
    const api=process.env.INTERNAL_API_URL||'http://api:8080'
    const res=await fetch(`${api}/api/v1/public/store`,{headers:{'X-Wamercio-Host':host},cache:'no-store'})
    if(!res.ok)return null
    const data=await res.json()
    return data?.store||null
  }catch{return null}
}
