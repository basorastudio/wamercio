import './globals.css'
import 'intl-tel-input/styles'
import 'leaflet/dist/leaflet.css'
import type {Metadata,Viewport} from 'next'
import PWARegister from '@/components/pwa-register'
import CallsSoftphoneHost from '@/components/calls-softphone-host'
import {currentRequestHost,currentTenantStore,isPlatformRequestHost} from '@/lib/server-store-brand'

const platformMetadata:Metadata={
  title:{default:'WAMERCIO',template:'%s · WAMERCIO'},
  description:'Tu comercio, catálogo, pedidos y WhatsApp en un solo lugar.',
  manifest:'/manifest.webmanifest',
  appleWebApp:{capable:true,title:'WAMERCIO',statusBarStyle:'default'},
  icons:{icon:[{url:'/favicon.ico',sizes:'64x64'},{url:'/icon.svg',type:'image/svg+xml'}],shortcut:'/favicon.ico'}
}

export async function generateMetadata():Promise<Metadata>{
  const host=currentRequestHost()
  if(isPlatformRequestHost(host))return platformMetadata
  const store=await currentTenantStore()
  if(!store?.name)return{title:{absolute:'Mi tienda'},description:'Catálogo y pedidos en línea.',applicationName:'Mi tienda',manifest:`/manifest.webmanifest?tenant=${encodeURIComponent(host)}&v=2.8.3`,icons:{icon:[{url:`/tenant-icon.svg?tenant=${encodeURIComponent(host)}&v=2.8.3`}],shortcut:`/tenant-icon.svg?tenant=${encodeURIComponent(host)}&v=2.8.3`}}
  return{
    title:{absolute:store.name},
    description:store.description||`Compra y realiza pedidos en ${store.name}.`,
    applicationName:store.name,
    manifest:`/manifest.webmanifest?tenant=${encodeURIComponent(host)}&v=2.8.3`,
    appleWebApp:{capable:true,title:store.name,statusBarStyle:'default'},
    icons:{icon:[{url:store.logo_url||`/tenant-icon.svg?tenant=${encodeURIComponent(host)}&v=2.8.3`}],shortcut:store.logo_url||`/tenant-icon.svg?tenant=${encodeURIComponent(host)}&v=2.8.3`,apple:[{url:store.logo_url||`/tenant-icon.svg?tenant=${encodeURIComponent(host)}&v=2.8.3`}]},
  }
}
export async function generateViewport():Promise<Viewport>{
  const store=await currentTenantStore()
  return{width:'device-width',initialScale:1,maximumScale:1,viewportFit:'cover',themeColor:store?.theme_config?.colors?.primary||store?.primary_color||'#36b385'}
}
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}<CallsSoftphoneHost/><PWARegister/></body></html>}
