'use client'
import Link from 'next/link'
import {usePathname,useRouter} from 'next/navigation'
import {useEffect,useMemo,useState} from 'react'
import {api} from '@/lib/api'
import {
  LayoutDashboard,Store,Boxes,Tags,ShoppingBag,TicketPercent,Truck,MessagesSquare,Layers3,Settings,LogOut,
  Menu,X,ChevronDown,UserRound,UsersRound,SlidersHorizontal,MessageCircleMore,ReceiptText,LifeBuoy,Grid2X2,MoreHorizontal
} from 'lucide-react'

const commerce=[
  {href:'/dashboard',label:'Inicio',icon:LayoutDashboard},
  {href:'/orders',label:'Pedidos',icon:ShoppingBag},
  {href:'/conversations',label:'Conversaciones',icon:MessagesSquare},
  {href:'/customers',label:'Clientes',icon:UsersRound},
]
const catalog=[
  {href:'/catalog/products',label:'Productos',icon:Boxes},
  {href:'/catalog/categories',label:'Categorías',icon:Tags},
  {href:'/coupons',label:'Cupones',icon:TicketPercent},
]
const storeTools=[
  {href:'/stores',label:'Mis tiendas',icon:Store},
  {href:'/delivery',label:'Delivery',icon:Truck},
  {href:'/settings/store',label:'Ajustes de tienda',icon:SlidersHorizontal},
  {href:'/settings/whatsapp',label:'WhatsApp',icon:MessageCircleMore},
]
const account=[
  {href:'/transactions',label:'Movimientos',icon:ReceiptText},
  {href:'/plans',label:'Plan y suscripción',icon:Layers3},
  {href:'/support',label:'Soporte',icon:LifeBuoy},
  {href:'/settings/profile',label:'Mi cuenta',icon:Settings},
]
const all=[...commerce,...catalog,...storeTools,...account]
const bottom=[commerce[0],commerce[1],commerce[2],catalog[0]]

function NavLink({n,onClick}:{n:any;onClick?:()=>void}){const path=usePathname();const I=n.icon;const active=path===n.href||path.startsWith(n.href+'/');return <Link href={n.href} onClick={onClick} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active?'bg-amber-50 text-amber-700':'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}><I className="h-[18px] w-[18px]"/><span>{n.label}</span></Link>}

export default function StoreShell({children,title,subtitle,actions}:{children:React.ReactNode;title:string;subtitle?:string;actions?:React.ReactNode}){
 const path=usePathname(),router=useRouter();const[drawer,setDrawer]=useState(false),[more,setMore]=useState(false),[me,setMe]=useState<any>(null)
 useEffect(()=>{api('/me').then((x:any)=>{if(x.role!=='owner')throw new Error('role');setMe(x)}).catch(()=>router.replace('/login'))},[router])
 useEffect(()=>{setMore(false);setDrawer(false)},[path])
 const logout=async()=>{await api('/auth/store/logout',{method:'POST'}).catch(()=>{});router.replace('/login')}
 const groups=useMemo(()=>[
  ['Operación',commerce],['Catálogo',catalog],['Tienda',storeTools],['Cuenta',account]
 ],[])
 return <div className="min-h-dvh bg-[#f6f8fb] pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-0">
  {drawer&&<button aria-label="Cerrar menú" onClick={()=>setDrawer(false)} className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden"/>}
  <aside className={`fixed inset-y-0 left-0 z-50 flex w-[268px] flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:translate-x-0 ${drawer?'translate-x-0':'-translate-x-full'}`}>
   <div className="flex h-[72px] items-center gap-3 border-b border-slate-100 px-5">
    <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400 text-xl font-black text-slate-950">W</div>
    <div className="min-w-0"><div className="truncate text-lg font-extrabold tracking-tight text-slate-900">WAMERCIO</div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-amber-600">Panel de tienda</div></div>
    <button className="ml-auto rounded-lg p-2 text-slate-400 lg:hidden" onClick={()=>setDrawer(false)}><X className="h-5 w-5"/></button>
   </div>
   <nav className="flex-1 overflow-y-auto px-3 py-3">
    {groups.map(([label,items]:any)=><div key={label} className="mb-4"><p className="px-3 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">{label}</p>{items.map((n:any)=><NavLink key={n.href} n={n} onClick={()=>setDrawer(false)}/>)}</div>)}
   </nav>
   <div className="border-t border-slate-100 p-3">
    <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-slate-500 shadow-sm"><UserRound className="h-4 w-4"/></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-800">{me?.name||'Cargando...'}</div><div className="truncate text-xs text-slate-500">{me?.phone?`WhatsApp +${me.phone}`:'Cuenta de tienda'}</div></div><button onClick={logout} title="Cerrar sesión" className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-rose-600"><LogOut className="h-4 w-4"/></button></div>
   </div>
  </aside>

  <div className="lg:pl-[268px]">
   <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
    <div className="flex min-h-[64px] items-center gap-3 px-3 sm:px-5 lg:px-7"><button className="rounded-xl p-2 text-slate-600 lg:hidden" onClick={()=>setDrawer(true)}><Menu className="h-5 w-5"/></button><div className="min-w-0 flex-1"><h1 className="truncate text-lg font-extrabold text-slate-900 sm:text-xl">{title}</h1>{subtitle&&<p className="hidden truncate text-xs text-slate-500 sm:block">{subtitle}</p>}</div><div className="flex shrink-0 items-center gap-2">{actions}</div></div>
   </header>
   <main className="mx-auto w-full max-w-[1600px] p-3 sm:p-5 lg:p-7">{children}</main>
  </div>

  <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"><div className="grid h-[68px] grid-cols-5">{bottom.map(n=>{const I=n.icon;const active=path===n.href||path.startsWith(n.href+'/');return <Link key={n.href} href={n.href} className={`flex flex-col items-center justify-center gap-1 text-[10px] font-semibold ${active?'text-amber-600':'text-slate-500'}`}><I className="h-5 w-5"/><span>{n.label==='Conversaciones'?'Chat':n.label}</span></Link>})}<button onClick={()=>setMore(true)} className={`flex flex-col items-center justify-center gap-1 text-[10px] font-semibold ${more?'text-amber-600':'text-slate-500'}`}><MoreHorizontal className="h-5 w-5"/><span>Más</span></button></div></nav>

  {more&&<div className="fixed inset-0 z-[60] lg:hidden"><button className="absolute inset-0 bg-slate-950/35" onClick={()=>setMore(false)}/><section className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-[28px] bg-white pb-[calc(20px+env(safe-area-inset-bottom))] shadow-2xl"><div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-200"/><div className="flex items-center justify-between px-5 pb-3 pt-4"><div><h2 className="text-lg font-extrabold">Más opciones</h2><p className="text-xs text-slate-500">Administra tu comercio</p></div><button onClick={()=>setMore(false)} className="rounded-xl bg-slate-100 p-2"><X className="h-5 w-5"/></button></div><div className="grid grid-cols-3 gap-2 px-4">{all.filter(n=>!bottom.some(b=>b.href===n.href)).map(n=>{const I=n.icon;return <Link href={n.href} key={n.href} onClick={()=>setMore(false)} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-center text-xs font-semibold text-slate-700"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-amber-600 shadow-sm"><I className="h-5 w-5"/></span>{n.label}</Link>})}</div><button onClick={logout} className="mx-4 mt-4 flex w-[calc(100%-2rem)] items-center justify-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700"><LogOut className="h-4 w-4"/>Cerrar sesión</button></section></div>}
 </div>
}

export function StoreSelector({value,onChange,className=''}:{value:string;onChange:(id:string)=>void;className?:string}){
 const[stores,setStores]=useState<any[]>([])
 useEffect(()=>{api<any[]>('/stores').then(x=>{setStores(x);if(!value&&x[0]){const remembered=typeof window!=='undefined'?localStorage.getItem('wamercio_store_id'):'';const selected=x.some(s=>s.id===remembered)?remembered!:x[0].id;onChange(selected)}}).catch(()=>{})},[])
 const change=(id:string)=>{if(typeof window!=='undefined'){if(id)localStorage.setItem('wamercio_store_id',id);else localStorage.removeItem('wamercio_store_id')}onChange(id)}
 return <div className={`relative ${className}`}><select className="field min-w-[200px] appearance-none pr-9" value={value} onChange={e=>change(e.target.value)}><option value="">Selecciona una tienda</option>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/></div>
}
