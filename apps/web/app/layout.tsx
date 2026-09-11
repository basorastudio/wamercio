import './globals.css'
import type { Metadata } from 'next'
import PWARegister from '@/components/pwa-register'

export const metadata: Metadata = {
  title: 'WAMERCIO',
  description: 'Comercio conversacional para República Dominicana',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '64x64' },
      { url: '/icon.svg', type: 'image/svg+xml' }
    ],
    shortcut: '/favicon.ico'
  }
}
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="es"><body>{children}<PWARegister/></body></html>
}
