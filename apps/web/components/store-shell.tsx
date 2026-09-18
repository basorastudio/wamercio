'use client'
import Link from 'next/link'
import {usePathname,useRouter} from 'next/navigation'
import {useEffect,useLayoutEffect,useMemo,useState} from 'react'
import {api} from '@/lib/api'
import {
  LayoutDashboard,Store,Boxes,Tags,ShoppingBag,Truck,LogOut,ShoppingCart,CreditCard,UserCog,
  Menu,X,ChevronDown,UserRound,UsersRound,SlidersHorizontal,MessageCircleMore,LifeBuoy,MoreHorizontal,
  ChevronLeft,ChevronRight,ExternalLink,UtensilsCrossed,BarChart3,TicketPercent,CalendarClock,ChefHat,WandSparkles,TriangleAlert,Star,Gift,Image as ImageIcon,Share2,FileText,BriefcaseBusiness,ListTodo,Workflow,AudioLines,PhoneCall
} from 'lucide-react'

const SIDEBAR_KEY='wamercio_sidebar_collapsed'

function WhatsAppIcon({className=''}:{className?:string}){
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.4 11.8a8.3 8.3 0 0 1-12.2 7.3L4 20.2l1.1-4a8.3 8.3 0 1 1 15.3-4.4Z"/><path d="M8.5 8.1c.2-.5.4-.5.7-.5h.5c.2 0 .4.1.5.4l.7 1.7c.1.3.1.5-.1.7l-.6.7c-.2.2-.2.4 0 .7.7 1.2 1.7 2.1 2.9 2.7.3.2.5.1.7-.1l.8-.9c.2-.2.4-.3.7-.1l1.6.8c.3.1.4.3.4.5 0 .4-.2 1.2-.7 1.7-.5.5-1.3.8-2.1.6-1.1-.2-2.8-.9-4.4-2.3-1.8-1.5-3-3.5-3.3-4.7-.2-.8 0-1.4.2-1.9Z"/></svg>
}
const commerce=[
  {href:'/dashboard',label:'Inicio',icon:LayoutDashboard},
  {href:'/pos',label:'Punto de Venta',icon:ShoppingCart},
  {href:'/orders',label:'Pedidos',icon:ShoppingBag},
  {href:'/quotes',label:'Cotizaciones',icon:FileText},
  {href:'/conversations',label:'WhatsApp',icon:WhatsAppIcon},
  {href:'/customers',label:'Clientes',icon:UsersRound},
  {href:'/crm',label:'CRM',icon:BriefcaseBusiness},
  {href:'/tasks',label:'Tareas',icon:ListTodo},
  {href:'/evaluations',label:'Evaluaciones',icon:MessageCircleMore},
  {href:'/reviews',label:'Reseñas',icon:Star},
  {href:'/loyalty',label:'Fidelización',icon:Gift},
  {href:'/analytics',label:'Analítica',icon:BarChart3},
]
const catalog=[
  {href:'/catalog/products',label:'Catálogo',icon:Boxes},
  {href:'/coupons',label:'Cupones',icon:TicketPercent},
  {href:'/promotions',label:'Promociones',icon:Tags},
  {href:'/media',label:'Multimedia',icon:ImageIcon},
  {href:'/social-publishing',label:'Publicaciones',icon:Share2},
  {href:'/product-attributes',label:'Atributos',icon:TriangleAlert},
]
const baseStoreTools=[
  {href:'/automations',label:'Automatizaciones',icon:WandSparkles},
  {href:'/flows',label:'Flow Builder',icon:Workflow},
  {href:'/voice',label:'Voz y transcripción',icon:AudioLines},
  {href:'/calls',label:'Calls',icon:PhoneCall},
  {href:'/staff',label:'Usuarios',icon:UserCog},
  {href:'/delivery',label:'Entregas',icon:Truck},
  {href:'/payment-methods',label:'Métodos de pago',icon:CreditCard},
  {href:'/settings/store',label:'Configuración',icon:SlidersHorizontal},
]
const reservationsNav={href:'/reservations',label:'Reservaciones',icon:CalendarClock}
const kdsNav={href:'/kds',label:'KDS',icon:ChefHat}
const tablesNav={href:'/tables',label:'Gestión de mesas',icon:UtensilsCrossed}
const storesNav={href:'/stores',label:'Mis tiendas',icon:Store}
const bottom=[commerce[0],commerce[2],commerce[3],catalog[0]]

function NavLink({n,onClick,collapsed}:{n:any;onClick?:()=>void;collapsed?:boolean}){
  const path=usePathname()
  const I=n.icon
  const active=path===n.href||path.startsWith(n.href+'/')
  return <Link href={n.href} title={n.label} onClick={onClick} className={`group relative mx-2 flex items-center text-sm transition ${collapsed?'justify-center rounded-2xl px-0 py-3':'gap-3 rounded-r-2xl px-4 py-2.5'} ${active?'bg-brand-50 font-medium text-brand-700':'text-[#777c96] hover:bg-[#fafbfe] hover:text-ink-900'}`}>
    {active&&<span className={`absolute inset-y-1 left-0 rounded-r bg-brand-500 ${collapsed?'w-1.5':'w-[3px]'}`}/>}<I className={`h-[18px] w-[18px] shrink-0 ${active?'text-brand-500':'text-[#a1a5b8] group-hover:text-brand-500'}`}/>{!collapsed&&<span className="truncate">{n.label}</span>}
  </Link>
}

export default function StoreShell({children,title,subtitle,actions,context,fullHeight=false,hideHeader=false,structuralRightRail=false}:{children:React.ReactNode;title:string;subtitle?:string;actions?:React.ReactNode;context?:React.ReactNode;fullHeight?:boolean;hideHeader?:boolean;structuralRightRail?:boolean}){
 const path=usePathname(),router=useRouter()
 const[drawer,setDrawer]=useState(false)
 const[more,setMore]=useState(false)
 const[me,setMe]=useState<any>(null)
 const[stores,setStores]=useState<any[]|null>(null)
 const[collapsed,setCollapsed]=useState(false)
 const[dineInNav,setDineInNav]=useState(false)
 const[activeStoreId,setActiveStoreId]=useState('')
 useEffect(()=>{api('/me').then((x:any)=>{if(x.role!=='owner')throw new Error('role');setMe(x)}).catch(()=>router.replace('/login'))},[router])
 useLayoutEffect(()=>{if(typeof window==='undefined')return;const remembered=localStorage.getItem('wamercio_store_id')||'';if(remembered){setActiveStoreId(remembered);const cached=localStorage.getItem(`wamercio_store_dine_in_${remembered}`);if(cached!==null)setDineInNav(cached==='1')}},[])
 useEffect(()=>{const refresh=()=>api<any[]>('/stores').then(rows=>{setStores(rows);if(typeof window!=='undefined'){const remembered=localStorage.getItem('wamercio_store_id')||rows.find((x:any)=>x.is_active!==false)?.id||rows[0]?.id||'';const selected=rows.find((x:any)=>x.id===remembered)??rows.find((x:any)=>x.is_active!==false)??rows[0];if(selected?.id)setActiveStoreId(selected.id);const enabled=!!selected?.dine_in_enabled;setDineInNav(enabled);if(remembered)localStorage.setItem(`wamercio_store_dine_in_${remembered}`,enabled?'1':'0')}}).catch(()=>setStores([]));refresh();if(typeof window==='undefined')return;const onActive=(event:any)=>{const id=String(event?.detail?.store_id||localStorage.getItem('wamercio_store_id')||'');setActiveStoreId(id);const cached=id?localStorage.getItem(`wamercio_store_dine_in_${id}`):null;if(cached!==null)setDineInNav(cached==='1');void refresh()};const onSettings=()=>void refresh();window.addEventListener('wamercio:stores-changed',refresh);window.addEventListener('wamercio:active-store-changed',onActive);window.addEventListener('wamercio:store-settings-changed',onSettings);return()=>{window.removeEventListener('wamercio:stores-changed',refresh);window.removeEventListener('wamercio:active-store-changed',onActive);window.removeEventListener('wamercio:store-settings-changed',onSettings)}},[])
 useEffect(()=>{if(typeof window==='undefined')return;setCollapsed(localStorage.getItem(SIDEBAR_KEY)==='1')},[])
 useEffect(()=>{if(typeof window==='undefined'||!activeStoreId)return;localStorage.setItem('wamercio_store_id',activeStoreId);window.dispatchEvent(new CustomEvent('wamercio:active-store-changed',{detail:{store_id:activeStoreId}}))},[activeStoreId])



 useEffect(()=>{setMore(false);setDrawer(false)},[path])
 const toggleCollapsed=()=>setCollapsed(v=>{const next=!v;if(typeof window!=='undefined')localStorage.setItem(SIDEBAR_KEY,next?'1':'0');return next})
 const logout=async()=>{await api('/auth/store/logout',{method:'POST'}).catch(()=>{});router.replace('/login')}
 const storeCount=stores?.length??null
 const primaryStore=useMemo(()=>stores?.find((store:any)=>store.is_active!==false)??stores?.[0]??null,[stores])
 const launchSoftphone=()=>{const id=activeStoreId||((typeof window!=='undefined'&&localStorage.getItem('wamercio_store_id'))||'')||primaryStore?.id||'';if(id)setActiveStoreId(id);if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('wamercio:open-softphone',{detail:{store_id:id,picture_in_picture:true}}))}
 const storeTools=useMemo(()=>{const tools=dineInNav?[...baseStoreTools.slice(0,2),reservationsNav,kdsNav,tablesNav,...baseStoreTools.slice(2)]:baseStoreTools;return storeCount!==null&&storeCount>1?[...tools,storesNav]:tools},[storeCount,dineInNav])
 const groups=useMemo(()=>[['Operación',commerce],['Catálogo',catalog],['Gestión',storeTools]],[storeTools])
 const all=useMemo(()=>[...commerce,...catalog,...storeTools],[storeTools])
 return <div data-sidebar-collapsed={collapsed?'true':'false'} className="group/shell min-h-dvh bg-[#f7f9fc] pb-[calc(72px+env(safe-area-inset-bottom))] text-ink-900 lg:pb-0">
  {drawer&&<button aria-label="Cerrar menú" onClick={()=>setDrawer(false)} className="fixed inset-0 z-40 bg-[#2e3154]/25 lg:hidden"/>}
  <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[#eceef4] bg-white transition-[width,transform] duration-200 lg:translate-x-0 ${collapsed?'w-[88px]':'w-[258px]'} ${drawer?'translate-x-0':'-translate-x-full'}`}>
   <div className={`flex h-[70px] items-center border-b border-[#f0f1f5] ${collapsed?'justify-center px-3':'gap-2.5 px-5'}`}>
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-brand-500 text-sm font-semibold text-white shadow-sm">W</div>
    {!collapsed&&<div className="min-w-0"><div className="truncate text-base font-semibold tracking-tight text-ink-900">wamercio</div><div className="text-[8px] font-medium uppercase tracking-[.16em] text-brand-600">Panel de comercio</div></div>}
    <button className="ml-auto rounded-xl p-2 text-[#a0a5b8] hover:bg-[#f5f6f9] lg:hidden" onClick={()=>setDrawer(false)}><X className="h-5 w-5"/></button>
   </div>


   <nav className="flex-1 overflow-y-auto py-3">
    {groups.map(([label,items]:any)=><div key={label} className="mb-3">{collapsed?<div className="mx-5 mb-2 mt-3 h-px bg-[#edf0f5]"/>:<p className="px-4 pb-1.5 pt-2 text-[9px] font-semibold uppercase tracking-[.14em] text-[#b0b4c4]">{label}</p>}{items.map((n:any)=><NavLink key={n.href} n={n} collapsed={collapsed} onClick={()=>setDrawer(false)}/>)}</div>)}
   </nav>

   <div className="border-t border-[#f0f1f5] p-3">
    <button type="button" onClick={launchSoftphone} title="Abrir softphone" aria-label="Abrir softphone" className={`mb-2 flex w-full items-center rounded-2xl border border-brand-100 bg-brand-50/70 text-brand-700 transition hover:border-brand-200 hover:bg-brand-50 ${collapsed?'justify-center p-2.5':'gap-3 px-3 py-2.5'}`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500 text-white shadow-sm"><PhoneCall className="h-4 w-4"/></span>{!collapsed&&<span className="min-w-0 flex-1 text-left"><span className="block text-xs font-semibold">Abrir softphone</span><span className="mt-0.5 block truncate text-[10px] font-medium text-brand-600/70">Llamadas WhatsApp</span></span>}</button>
    <div className={`bg-[#fafbfe] ${collapsed?'space-y-2 rounded-3xl p-2.5 text-center':'flex items-center gap-1 rounded-3xl p-1.5'}`}>
      <Link href="/settings/profile" title="Mi cuenta" aria-label="Abrir mi cuenta" onClick={()=>setDrawer(false)} className={`group/profile min-w-0 rounded-[20px] transition hover:bg-white ${collapsed?'mx-auto grid h-11 w-11 place-items-center':'flex flex-1 items-center gap-3 px-1.5 py-1.5'}`}>
        <div className="mx-auto grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-2xl bg-brand-50 text-brand-600 transition group-hover/profile:bg-brand-100">{me?.profile_picture_url?<img src={me.profile_picture_url} alt={me?.name||'Perfil'} className="h-full w-full object-cover"/>:<UserRound className="h-4 w-4"/>}</div>
        {!collapsed&&<div className="min-w-0 flex-1 text-left"><div className="truncate text-sm font-medium text-ink-900 group-hover/profile:text-brand-700">{me?.name||'Cargando...'}</div><div className="truncate text-[11px] text-[#999eb4]">{me?.phone?`WhatsApp +${String(me.phone).replace(/^\+/, '')}`:'Cuenta de tienda'}</div></div>}
      </Link>
      <button onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión" className={`rounded-xl p-2 text-[#a6aabc] transition hover:bg-white hover:text-rose-600 ${collapsed?'mx-auto':'mr-0.5'}`}><LogOut className="h-4 w-4"/></button>
    </div>
    {storeCount===1&&!collapsed&&<Link href="/stores?new=1" className="mt-2 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-200 px-3 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"><Store className="h-3.5 w-3.5"/>Agregar otra tienda</Link>}
   </div>
  </aside>

  <div className={`transition-[padding] duration-200 ${collapsed?'lg:pl-[88px]':'lg:pl-[258px]'}`}>
   {!hideHeader&&<header className="sticky top-0 z-30 border-b border-[#eceef4] bg-white/95 backdrop-blur">
    <div className={`flex min-h-[66px] flex-wrap items-center gap-3 px-3 py-2 sm:px-5 md:flex-nowrap md:py-0 lg:px-6 xl:px-7 ${structuralRightRail?'xl:pr-[430px]':''}`}>
      <button className="rounded-xl p-2 text-[#777c96] hover:bg-[#f5f6f9] lg:hidden" onClick={()=>setDrawer(true)}><Menu className="h-5 w-5"/></button>
      <button className="hidden rounded-xl p-2 text-[#777c96] hover:bg-[#f5f6f9] lg:inline-flex" onClick={toggleCollapsed} title={collapsed?'Expandir menú':'Contraer menú'}>{collapsed?<ChevronRight className="h-5 w-5"/>:<ChevronLeft className="h-5 w-5"/>}</button>
      <div className="min-w-0 flex-1"><h1 className="truncate text-lg font-semibold tracking-tight text-ink-900 sm:text-xl">{title}</h1>{subtitle&&<p className="hidden truncate text-xs text-[#9a9fb5] sm:block">{subtitle}</p>}</div>{context&&<div className="order-3 w-full md:order-none md:min-w-[210px] md:max-w-[300px] md:flex-1">{context}</div>}<div className="flex shrink-0 items-center gap-2">{primaryStore&&<a href={storeCount===1?(primaryStore.public_url||`https://${primaryStore.slug}.${process.env.NEXT_PUBLIC_TENANT_ROOT_DOMAIN||'ltd.do'}`):'/stores'} target={storeCount===1?'_blank':undefined} rel={storeCount===1?'noreferrer':undefined} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-brand-200 bg-white px-3 text-xs font-semibold text-brand-700 transition hover:bg-brand-50 sm:px-3.5 sm:text-sm" title={storeCount===1?'Abrir tienda pública':'Elegir tienda'}><Store className="h-4 w-4"/><span>Ver tienda</span>{storeCount===1&&<ExternalLink className="hidden h-3.5 w-3.5 opacity-70 sm:block"/>}</a>}{actions}</div>
    </div>
   </header>}
   <main className={`mx-auto w-full max-w-[1700px] ${fullHeight?(hideHeader?'h-[calc(100dvh-72px)] overflow-hidden p-0 lg:h-dvh':'h-[calc(100dvh-188px)] overflow-hidden p-3 sm:p-4 md:h-[calc(100dvh-132px)] lg:h-[calc(100dvh-66px)] lg:p-4 xl:p-4'):'p-3 sm:p-5 lg:p-6 xl:p-7'}`}>{children}</main>
  </div>

  <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e9ebf1] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"><div className="grid h-[66px] grid-cols-5">{bottom.map(n=>{const I=n.icon;const active=path===n.href||path.startsWith(n.href+'/');return <Link key={n.href} href={n.href} className={`flex flex-col items-center justify-center gap-1 text-[10px] font-medium ${active?'text-brand-600':'text-[#8d92a9]'}`}><I className="h-5 w-5"/><span>{n.label}</span></Link>})}<button onClick={()=>setMore(true)} className={`flex flex-col items-center justify-center gap-1 text-[10px] font-medium ${more?'text-brand-600':'text-[#8d92a9]'}`}><MoreHorizontal className="h-5 w-5"/><span>Más</span></button></div></nav>

  {more&&<div className="fixed inset-0 z-[60] lg:hidden"><button className="absolute inset-0 bg-[#2e3154]/25" onClick={()=>setMore(false)}/><section className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-2xl bg-white pb-[calc(20px+env(safe-area-inset-bottom))] shadow-2xl"><div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[#dfe2eb]"/><div className="flex items-center justify-between px-5 pb-3 pt-4"><div><h2 className="text-lg font-medium text-ink-900">Más opciones</h2><p className="text-xs text-[#989db3]">Administra tu comercio</p></div><button onClick={()=>setMore(false)} className="rounded bg-[#f5f6f9] p-2"><X className="h-5 w-5"/></button></div><div className="grid grid-cols-3 gap-2 px-4">{all.filter(n=>!bottom.some(b=>b.href===n.href)).map(n=>{const I=n.icon;return <Link href={n.href} key={n.href} onClick={()=>setMore(false)} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-[#eef0f4] bg-[#fafbfe] p-3 text-center text-xs font-medium text-[#6f748f]"><span className="grid h-10 w-10 place-items-center rounded-full bg-white text-brand-600 shadow-sm"><I className="h-5 w-5"/></span>{n.label}</Link>})}</div><button onClick={logout} className="mx-4 mt-4 flex w-[calc(100%-2rem)] items-center justify-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"><LogOut className="h-4 w-4"/>Cerrar sesión</button></section></div>}

 </div>
}

export function StoreSelector({value,onChange,onStoreChange,className=''}:{value:string;onChange:(id:string)=>void;onStoreChange?:(store:any|null)=>void;className?:string}){
 const[stores,setStores]=useState<any[]>([])
 useEffect(()=>{api<any[]>('/stores').then(x=>{setStores(x);if(!value&&x[0]){const remembered=typeof window!=='undefined'?localStorage.getItem('wamercio_store_id'):'';const selected=x.some(s=>s.id===remembered)?remembered!:x[0].id;onChange(selected);window.dispatchEvent(new CustomEvent('wamercio:active-store-changed',{detail:{store_id:selected}}));onStoreChange?.(x.find(s=>s.id===selected)||null)}else if(value){onStoreChange?.(x.find(s=>s.id===value)||null)}}).catch(()=>{})},[])
 useEffect(()=>{if(stores.length)onStoreChange?.(stores.find(s=>s.id===value)||null)},[value,stores])
 const change=(id:string)=>{if(typeof window!=='undefined'){if(id)localStorage.setItem('wamercio_store_id',id);else localStorage.removeItem('wamercio_store_id');window.dispatchEvent(new CustomEvent('wamercio:active-store-changed',{detail:{store_id:id}}))}onChange(id);onStoreChange?.(stores.find(s=>s.id===id)||null)}
 if(stores.length===1)return <div className={`hidden md:flex items-center gap-2 rounded-xl border border-[#e8ebf2] bg-[#fafbfe] px-3 py-2 text-sm font-medium text-[#6f758d] ${className}`}><Store className="h-4 w-4 text-brand-600"/><span className="truncate">{stores[0].name}</span></div>
 return <div className={`relative ${className}`}><select className="field w-full min-w-0 appearance-none pr-9" value={value} onChange={e=>change(e.target.value)}><option value="">Selecciona una tienda</option>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a0a5b8]"/></div>
}
