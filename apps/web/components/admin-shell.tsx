'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import {
  LayoutDashboard, Store, Boxes, Tags, ShoppingBag, TicketPercent, Truck, MessageCircleMore, MessagesSquare,
  Layers3, Settings, LogOut, Menu, X, ChevronDown, UserRound, UsersRound, SlidersHorizontal, ShieldCheck,
  Building2, BadgeDollarSign, ReceiptText, LifeBuoy
} from 'lucide-react'

const ownerNav=[
  {href:'/dashboard',label:'Dashboard',icon:LayoutDashboard},
  {href:'/conversations',label:'Conversaciones',icon:MessagesSquare},
  {href:'/stores',label:'Tiendas',icon:Store},
  {href:'/customers',label:'Clientes',icon:UsersRound},
  {href:'/catalog/categories',label:'Categorías',icon:Tags},
  {href:'/catalog/products',label:'Productos',icon:Boxes},
  {href:'/orders',label:'Pedidos',icon:ShoppingBag},
  {href:'/coupons',label:'Cupones',icon:TicketPercent},
  {href:'/delivery',label:'Delivery',icon:Truck},
  {href:'/settings/store',label:'Ajustes de tienda',icon:SlidersHorizontal},
  {href:'/settings/whatsapp',label:'WhatsApp',icon:MessageCircleMore},
  {href:'/transactions',label:'Movimientos',icon:ReceiptText},
  {href:'/support',label:'Soporte',icon:LifeBuoy},
  {href:'/plans',label:'Plan y suscripción',icon:Layers3},
  {href:'/settings/profile',label:'Mi cuenta',icon:Settings},
]
const adminNav=[
  {href:'/admin',label:'Resumen SaaS',icon:ShieldCheck},
  {href:'/admin/users',label:'Usuarios',icon:UsersRound},
  {href:'/admin/stores',label:'Tiendas SaaS',icon:Building2},
  {href:'/admin/plans',label:'Planes SaaS',icon:BadgeDollarSign},
  {href:'/admin/subscriptions',label:'Solicitudes',icon:Layers3},
  {href:'/admin/transactions',label:'Movimientos SaaS',icon:ReceiptText},
  {href:'/admin/tickets',label:'Tickets',icon:LifeBuoy},
]

export default function AdminShell({children,title,subtitle,actions}:{children:React.ReactNode;title:string;subtitle?:string;actions?:React.ReactNode}){
 const path=usePathname(), router=useRouter(); const [open,setOpen]=useState(false); const [me,setMe]=useState<any>(null)
 useEffect(()=>{api('/me').then(setMe).catch(()=>router.replace('/login'))},[router])
 const logout=async()=>{await api('/auth/logout',{method:'POST'}).catch(()=>{});router.replace('/login')}
 const nav=useMemo(()=>me?.role==='superadmin'?[...ownerNav,...adminNav]:ownerNav,[me?.role])
 return <div className="min-h-screen bg-slate-50">
  {open&&<button aria-label="Cerrar" onClick={()=>setOpen(false)} className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden"/>}
  <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${open?'translate-x-0':'-translate-x-full'}`}>
   <div className="flex h-20 items-center gap-3 border-b border-slate-100 px-6">
    <div className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-600 text-xl font-black text-white">W</div>
    <div><div className="text-xl font-extrabold tracking-tight text-slate-900">WAMERCIO</div><div className="text-[11px] font-medium uppercase tracking-[.18em] text-brand-600">Comercio conversacional</div></div>
    <button className="ml-auto lg:hidden" onClick={()=>setOpen(false)}><X className="h-5 w-5"/></button>
   </div>
   <nav className="flex-1 space-y-1 overflow-y-auto p-4">
    <p className="px-3 pb-2 pt-2 text-[11px] font-bold uppercase tracking-[.14em] text-slate-400">Gestión comercial</p>
    {nav.map((n,i)=>{const Icon=n.icon;const active=n.href==='/admin'?path===n.href:(path===n.href||path.startsWith(n.href+'/'));const showDivider=me?.role==='superadmin'&&i===ownerNav.length;return <div key={n.href}>{showDivider&&<p className="mb-2 mt-5 border-t border-slate-100 px-3 pb-2 pt-5 text-[11px] font-bold uppercase tracking-[.14em] text-slate-400">SuperAdmin</p>}<Link href={n.href} onClick={()=>setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active?'bg-brand-50 text-brand-700':'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}><Icon className="h-[18px] w-[18px]"/><span>{n.label}</span></Link></div>})}
   </nav>
   <div className="border-t border-slate-100 p-4">
    <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-500"><UserRound className="h-4 w-4"/></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{me?.name||'Cargando...'}</div><div className="truncate text-xs text-slate-500">{me?.role==='superadmin'?'SuperAdmin · ':''}{me?.email||''}</div></div><button title="Cerrar sesión" onClick={logout} className="text-slate-400 hover:text-rose-600"><LogOut className="h-4 w-4"/></button></div>
   </div>
  </aside>
  <div className="lg:pl-72">
   <header className="sticky top-0 z-30 flex h-20 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8"><button className="mr-3 lg:hidden" onClick={()=>setOpen(true)}><Menu className="h-6 w-6"/></button><div className="min-w-0"><h1 className="truncate text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>{subtitle&&<p className="hidden text-sm text-slate-500 sm:block">{subtitle}</p>}</div><div className="ml-auto flex items-center gap-2">{actions}</div></header>
   <main className="p-4 sm:p-6 lg:p-8">{children}</main>
  </div>
 </div>
}

export function StoreSelector({value,onChange,className=''}:{value:string;onChange:(id:string)=>void;className?:string}){
 const [stores,setStores]=useState<any[]>([])
 useEffect(()=>{api<any[]>('/stores').then(x=>{setStores(x);if(!value&&x[0])onChange(x[0].id)}).catch(()=>{})},[])
 return <div className={`relative ${className}`}><select className="field min-w-[210px] appearance-none pr-9" value={value} onChange={e=>onChange(e.target.value)}><option value="">Selecciona una tienda</option>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/></div>
}
