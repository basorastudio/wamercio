import {headers} from 'next/headers'
import {NextRequest,NextResponse} from 'next/server'

const clean=(v:string|null)=>String(v||'').split(',')[0].trim().toLowerCase().replace(/:\d+$/,'').replace(/\.$/,'')
const platformHost=(host:string)=>{const platform=(process.env.NEXT_PUBLIC_PLATFORM_DOMAIN||'wamercio.com').toLowerCase();return !host||host===platform||host===`www.${platform}`||host==='localhost'||host==='127.0.0.1'}

export async function GET(req:NextRequest){
  const h=headers()
  const requestHost=clean(h.get('x-forwarded-host')||h.get('host'))
  const requestedTenant=clean(req.nextUrl.searchParams.get('tenant'))
  const host=platformHost(requestHost)?requestedTenant:requestHost
  let manifest:any={name:'WAMERCIO',short_name:'WAMERCIO',description:'Comercio conversacional para negocios dominicanos.',id:'/',start_url:'/',scope:'/',display:'standalone',background_color:'#f7f9fc',theme_color:'#36b385',orientation:'any',lang:'es-DO',dir:'ltr',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any maskable'}]}
  if(host&&!platformHost(host)){
    manifest={...manifest,name:'Mi tienda',short_name:'Mi tienda',description:'Catálogo y pedidos en línea.',icons:[{src:`/tenant-icon.svg?tenant=${encodeURIComponent(host)}&v=4.3.1`,sizes:'any',type:'image/svg+xml',purpose:'any maskable'}]}
    try{
      const api=process.env.INTERNAL_API_URL||'http://api:8080'
      const res=await fetch(`${api}/api/v1/public/store`,{headers:{'X-Wamercio-Host':host},cache:'no-store'})
      if(res.ok){
        const data=await res.json();const s=data.store||{}
        const primary=s.theme_config?.colors?.primary||s.primary_color||'#36b385'
        const fallbackIcon=`/tenant-icon.svg?tenant=${encodeURIComponent(host)}&v=4.3.1`
        manifest={...manifest,name:s.name||'Mi negocio',short_name:(s.name||'Mi negocio').slice(0,30),description:s.description||`Compra y realiza pedidos en ${s.name||'este negocio'}.`,theme_color:primary,background_color:s.theme_config?.colors?.background||'#f7f9fc',icons:[{src:s.logo_url||fallbackIcon,sizes:'any',purpose:'any maskable'}]}
      }
    }catch{}
  }
  return NextResponse.json(manifest,{headers:{'Cache-Control':'no-store, max-age=0','Content-Type':'application/manifest+json'}})
}
