'use client'
import Link from 'next/link'
import {Home,Search,ShoppingBag,UserRound} from 'lucide-react'

export default function StorefrontMobileNav({itemCount,customer,primaryColor,onSearch,onCart,onLogin}:{itemCount:number;customer:any;primaryColor:string;onSearch:()=>void;onCart:()=>void;onLogin:()=>void}){
  const item='flex min-h-[58px] flex-col items-center justify-center gap-1 text-[10px] font-semibold'
  return <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(15,23,42,.08)] backdrop-blur-xl md:hidden">
    <div className="mx-auto grid max-w-lg grid-cols-4">
      <button type="button" className={item} onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}><Home className="h-5 w-5" style={{color:primaryColor}}/><span>Inicio</span></button>
      <button type="button" className={item} onClick={onSearch}><Search className="h-5 w-5"/><span>Buscar</span></button>
      <button type="button" className={`${item} relative`} onClick={onCart}><ShoppingBag className="h-5 w-5"/>{itemCount>0&&<span className="absolute left-1/2 top-1 ml-2 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] text-white" style={{background:primaryColor}}>{itemCount}</span>}<span>Pedido</span></button>
      {customer?<Link className={item} href="/cliente/perfil"><UserRound className="h-5 w-5"/><span>Cuenta</span></Link>:<button type="button" className={item} onClick={onLogin}><UserRound className="h-5 w-5"/><span>Entrar</span></button>}
    </div>
  </nav>
}
