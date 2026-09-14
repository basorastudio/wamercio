import {headers} from 'next/headers'
import PlatformLanding from '@/components/platform-landing'
import Storefront from '@/components/storefront'

function normalizeHost(value:string|null){return String(value||'').split(',')[0].trim().toLowerCase().replace(/:\d+$/,'').replace(/\.$/,'')}

export default function Home(){
  const host=normalizeHost(headers().get('x-forwarded-host')||headers().get('host'))
  const platform=(process.env.NEXT_PUBLIC_PLATFORM_DOMAIN||'wamercio.com').toLowerCase()
  const isPlatform=host===''||host===platform||host===`www.${platform}`||host==='localhost'||host==='127.0.0.1'
  return isPlatform?<PlatformLanding/>:<Storefront/>
}
