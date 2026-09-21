import {headers} from 'next/headers'
import {NextRequest,NextResponse} from 'next/server'

const clean=(value:string|null)=>String(value||'').split(',')[0].trim().toLowerCase().replace(/:\d+$/,'').replace(/\.$/,'')
const safeColor=(value:any)=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):'#64748b'
const entities:Record<string,string>={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}
const esc=(value:string)=>value.replace(/[&<>"']/g,char=>entities[char]||char)

export async function GET(req:NextRequest){
  const h=headers()
  const host=clean(req.nextUrl.searchParams.get('tenant')||h.get('x-forwarded-host')||h.get('host'))
  let name='Mi tienda',primary='#64748b'
  if(host){
    try{
      const api=process.env.INTERNAL_API_URL||'http://api:8080'
      const res=await fetch(`${api}/api/v1/public/store`,{headers:{'X-Wamercio-Host':host},cache:'no-store'})
      if(res.ok){const data=await res.json();const store=data?.store||{};name=String(store.name||name);primary=safeColor(store.theme_config?.colors?.primary||store.primary_color)}
    }catch{}
  }
  const initial=esc(Array.from(name.trim())[0]?.toUpperCase()||'T')
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="116" fill="${primary}"/><text x="256" y="326" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="260" font-weight="700" fill="white">${initial}</text></svg>`
  return new NextResponse(svg,{status:200,headers:{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'no-store, max-age=0'}})
}
