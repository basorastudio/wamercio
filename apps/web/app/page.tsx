import PlatformLanding from '@/components/platform-landing'
import Storefront from '@/components/storefront'
import {currentRequestHost,isPlatformRequestHost} from '@/lib/server-store-brand'

export default function Home(){
  const host=currentRequestHost()
  return isPlatformRequestHost(host)?<PlatformLanding/>:<Storefront/>
}
