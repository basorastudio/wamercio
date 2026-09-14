'use client'
import Link from 'next/link'
import {Grid2X2,MessageCircleMore,Package,ShoppingBag} from 'lucide-react'

type Props={
  active:'catalog'|'cart'
  itemCount:number
  customer:any
  primaryColor:string
  storeWhatsapp:string
  onCatalog:()=>void
  onCart:()=>void
  onLogin:()=>void
}

export default function StorefrontMobileNav({active,itemCount,customer,primaryColor,storeWhatsapp,onCatalog,onCart,onLogin}:Props){
  const item='relative flex min-h-[62px] flex-col items-center justify-center gap-1 text-[10px] font-semibold'
  const muted='#7b8495'
  const whatsappDigits=String(storeWhatsapp||'').replace(/\D/g,'')
  const navColor=(key:'catalog'|'cart'|'orders'|'whatsapp')=>active===key?primaryColor:muted
  return <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(15,23,42,.08)] backdrop-blur-xl md:hidden">
    <div className="mx-auto grid max-w-lg grid-cols-4">
      <button type="button" className={item} onClick={onCatalog} style={{color:navColor('catalog')}}><Grid2X2 className="h-5 w-5"/><span>Catálogo</span></button>
      <button type="button" className={item} onClick={onCart} style={{color:navColor('cart')}}><ShoppingBag className="h-5 w-5"/>{itemCount>0&&<span className="absolute left-1/2 top-1 ml-2 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] text-white" style={{background:primaryColor}}>{itemCount}</span>}<span>Mi pedido</span></button>
      {customer?<Link className={item} href="/cliente/pedidos" style={{color:muted}}><span className="relative"><Package className="h-5 w-5"/>{customer.profile_picture_url&&<span className="absolute -right-2 -top-1 h-4 w-4 overflow-hidden rounded-full border-2 border-white bg-white"><img src={customer.profile_picture_url} alt={customer.whatsapp_name||customer.name||'Perfil de WhatsApp'} className="h-full w-full object-cover"/></span>}</span><span>Pedidos</span></Link>:<button type="button" className={item} onClick={onLogin} style={{color:muted}}><Package className="h-5 w-5"/><span>Pedidos</span></button>}
      {whatsappDigits?<a className={item} href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noreferrer" style={{color:muted}}><MessageCircleMore className="h-5 w-5"/><span>WhatsApp</span></a>:<span className={`${item} opacity-40`} style={{color:muted}}><MessageCircleMore className="h-5 w-5"/><span>WhatsApp</span></span>}
    </div>
  </nav>
}
