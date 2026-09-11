import './globals.css'
import type {Metadata,Viewport} from 'next'
import PWARegister from '@/components/pwa-register'

export const metadata:Metadata={
  title:{default:'WAMERCIO',template:'%s · WAMERCIO'},
  description:'Tu comercio, catálogo, pedidos y WhatsApp en un solo lugar.',
  manifest:'/manifest.webmanifest',
  appleWebApp:{capable:true,title:'WAMERCIO',statusBarStyle:'default'},
  icons:{icon:[{url:'/favicon.ico',sizes:'64x64'},{url:'/icon.svg',type:'image/svg+xml'}],shortcut:'/favicon.ico'}
}
export const viewport:Viewport={width:'device-width',initialScale:1,maximumScale:1,viewportFit:'cover',themeColor:'#020617'}
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}<PWARegister/></body></html>}
