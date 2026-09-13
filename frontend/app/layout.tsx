import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

const metadataBaseUrl = new URL(process.env.NEXT_PUBLIC_PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://ltd.do');

export const metadata: Metadata = {
  metadataBase: metadataBaseUrl,
  title: 'WAMERCIO',
  description: 'Sistema de gestión para negocios, ventas, inventario, pedidos y reportes.',
  manifest: '/api/pwa/manifest.json',
  applicationName: 'WAMERCIO',
  appleWebApp: {
    capable: true,
    title: 'WAMERCIO',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    title: 'WAMERCIO',
    description: 'Sistema de gestión para negocios, ventas, inventario, pedidos y reportes.',
    url: '/',
    siteName: 'WAMERCIO',
    locale: 'es_DO',
    type: 'website',
    images: [
      {
        url: '/og-store.png',
        width: 1200,
        height: 630,
        alt: 'WAMERCIO SaaS para negocios',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WAMERCIO',
    description: 'Sistema de gestión para negocios, ventas, inventario, pedidos y reportes.',
    images: ['/og-store.png'],
  },
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-title': 'WAMERCIO',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'format-detection': 'telephone=no',
    'msapplication-TileColor': '#00a884',
    'msapplication-tap-highlight': 'no',
  },
};

export const viewport: Viewport = {
  themeColor: '#00a884',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'wamercio.com';

  return (
    <html lang="es-DO">
      <head>
        <script
          src="/runtime-recovery.js"
          data-platform-domain={platformDomain}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
