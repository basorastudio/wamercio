import "./globals.css";
import { Providers } from "@/components/providers";
import {PWARegister} from "@/components/pwa-register";
export const metadata={title:"wamercio",description:"Comercio local y pedidos por WhatsApp"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body><Providers><PWARegister/>{children}</Providers></body></html>}
