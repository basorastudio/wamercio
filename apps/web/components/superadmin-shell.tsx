'use client'
import Link from 'next/link'
import {usePathname,useRouter} from 'next/navigation'
import {useEffect,useState} from 'react'
import {api} from '@/lib/api'
import {LayoutDashboard,UsersRound,Building2,BadgeDollarSign,Layers3,ReceiptText,LifeBuoy,ShieldCheck,LogOut,Menu,X,UserRound} from 'lucide-react'

const nav=[
 {href:'/admin',label:'Resumen SaaS',icon:LayoutDashboard},
 {href:'/admin/users',label:'Comerciantes',icon:UsersRound},
 {href:'/admin/stores',label:'Tiendas',icon:Building2},
 {href:'/admin/plans',label:'Planes',icon:BadgeDollarSign},
 {href:'/admin/subscriptions',label:'Solicitudes',icon:Layers3},
 {href:'/admin/transactions',label:'Movimientos',icon:ReceiptText},
 {href:'/admin/tickets',label:'Soporte',icon:LifeBuoy},
]
export default function SuperAdminShell({children,title,subtitle,actions}:{children:React.ReactNode;title:string;subtitle?:string;actions?:React.ReactNode}){
 const path=usePathname(),router=useRouter();const[open,setOpen]=useState(false),[me,setMe]=useState<any>(null)
 useEffect(()=>{api('/admin/me').then(setMe).catch(()=>router.replace('/admin/login'))},[router])
 useEffect(()=>setOpen(false),[path])
 const logout=async()=>{await api('/auth/admin/logout',{method:'POST'}).catch(()=>{});router.replace('/admin/login')}
 return <div className="min-h-dvh bg-slate-100">
  {open&&<button className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" onClick={()=>setOpen(false)}/>}<aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-slate-950 text-white transition-transform lg:translate-x-0 ${open?'translate-x-0':'-translate-x-full'}`}><div className="flex h-20 items-center gap-3 border-b border-white/10 px-6"><div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400 font-black text-slate-950">W</div><div><div className="text-lg font-black">WAMERCIO</div><div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[.14em] text-amber-300"><ShieldCheck className="h-3 w-3"/>SuperAdmin SaaS</div></div><button className="ml-auto lg:hidden" onClick={()=>setOpen(false)}><X className="h-5 w-5"/></button></div><div className="px-4 py-5"><p className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Plataforma</p><nav className="space-y-1">{nav.map(n=>{const I=n.icon;const active=n.href==='/admin'?path===n.href:(path===n.href||path.startsWith(n.href+'/'));return <Link key={n.href} href={n.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active?'bg-white/10 text-white':'text-slate-400 hover:bg-white/5 hover:text-white'}`}><I className="h-[18px] w-[18px]"/>{n.label}</Link>})}</nav></div><div className="mt-auto border-t border-white/10 p-4"><div className="flex items-center gap-3 rounded-xl bg-white/5 p-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-white/10"><UserRound className="h-4 w-4"/></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{me?.name||'SuperAdmin'}</div><div className="truncate text-xs text-slate-500">{me?.email||''}</div></div><button onClick={logout} className="rounded-lg p-2 text-slate-500 hover:bg-white/10 hover:text-rose-300"><LogOut className="h-4 w-4"/></button></div></div></aside>
  <div className="lg:pl-72"><header className="sticky top-0 z-30 flex min-h-20 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8"><button className="mr-3 rounded-xl p-2 text-slate-600 lg:hidden" onClick={()=>setOpen(true)}><Menu className="h-5 w-5"/></button><div className="min-w-0"><div className="mb-1 text-[10px] font-bold uppercase tracking-[.16em] text-amber-600">Administración SaaS</div><h1 className="truncate text-xl font-black text-slate-900 sm:text-2xl">{title}</h1>{subtitle&&<p className="hidden text-sm text-slate-500 sm:block">{subtitle}</p>}</div><div className="ml-auto flex items-center gap-2">{actions}</div></header><main className="mx-auto max-w-[1700px] p-4 sm:p-6 lg:p-8">{children}</main></div>
 </div>
}
