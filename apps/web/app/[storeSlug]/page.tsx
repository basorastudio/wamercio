import {headers} from 'next/headers'
import {notFound,redirect} from 'next/navigation'

function normalizeHost(value:string|null){
  return String(value||'').split(',')[0].trim().toLowerCase().replace(/:\d+$/,'').replace(/\.$/,'')
}

export default function StoreShortcut({params}:{params:{storeSlug:string}}){
  const host=normalizeHost(headers().get('x-forwarded-host')||headers().get('host'))
  const platform=(process.env.NEXT_PUBLIC_PLATFORM_DOMAIN||'wamercio.com').toLowerCase()
  const isPlatform=host===''||host===platform||host===`www.${platform}`||host==='localhost'||host==='127.0.0.1'
  if(!isPlatform)notFound()

  const slug=String(params.storeSlug||'').trim().toLowerCase()
  if(!/^[a-z0-9]{2,80}$/.test(slug))notFound()

  const root=(process.env.NEXT_PUBLIC_TENANT_ROOT_DOMAIN||'ltd.do').toLowerCase()
  redirect(`https://${slug}.${root}`)
}
