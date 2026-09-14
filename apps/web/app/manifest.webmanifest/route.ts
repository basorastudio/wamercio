import {headers} from 'next/headers'
import {NextResponse} from 'next/server'

const clean=(v:string|null)=>String(v||'').split(',')[0].trim().toLowerCase().replace(/:\d+$/,'').replace(/\.$/,'')

export async function GET(){
  const h=headers(); const host=clean(h.get('x-forwarded-host')||h.get('host'))
  const platform=(process.env.NEXT_PUBLIC_PLATFORM_DOMAIN||'wamercio.com').toLowerCase()
  const isPlatform=!host||host===platform||host===`www.${platform}`||host==='localhost'||host==='127.0.0.1'
  let manifest:any={name:'WAMERCIO',short_name:'WAMERCIO',description:'Comercio conversacional para negocios dominicanos.',start_url:'/',scope:'/',display:'standalone',background_color:'#f7f9fc',theme_color:'#36b385',orientation:'any',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any maskable'}]}
  if(!isPlatform){
    try{
      const api=process.env.INTERNAL_API_URL||'http://api:8080'
      const res=await fetch(`${api}/api/v1/public/store`,{headers:{'X-Wamercio-Host':host},cache:'no-store'})
      if(res.ok){const data=await res.json();const s=data.store||{};manifest={...manifest,name:s.name||'Mi negocio',short_name:(s.name||'Mi negocio').slice(0,30),description:s.description||`Compra y realiza pedidos en ${s.name||'este negocio'}.`,theme_color:s.primary_color||'#36b385',background_color:s.theme_config?.colors?.background||'#f7f9fc',icons:s.logo_url?[{src:s.logo_url,sizes:'any',purpose:'any maskable'}]:manifest.icons}}
    }catch{}
  }
  return NextResponse.json(manifest,{headers:{'Cache-Control':'no-store','Content-Type':'application/manifest+json'}})
}
