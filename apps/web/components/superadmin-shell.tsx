'use client'

import Link from 'next/link'
import {usePathname,useRouter} from 'next/navigation'
import {useEffect,useMemo,useRef,useState} from 'react'
import {api} from '@/lib/api'
import {
  BadgeDollarSign,Bell,ChevronDown,ContactRound,FileText,Globe2,Home,LayoutDashboard,
  LifeBuoy,LogOut,Menu,MessageCircleMore,MonitorCog,PanelLeftClose,PanelLeftOpen,
  ReceiptText,Search,Settings,ShieldCheck,Store,UsersRound,UserRound,X
} from 'lucide-react'

type NavItem={href:string;label:string;key?:string;icon:any}
type NavGroup={label:string;items:NavItem[]}

const navGroups:NavGroup[]=[
  {label:'Plataforma',items:[
    {href:'/admin',label:'Dashboard',icon:LayoutDashboard,key:'dashboard'},
    {href:'/admin/owners',label:'Propietarios',icon:UsersRound,key:'owners'},
    {href:'/admin/stores',label:'Negocios',icon:Store,key:'owners'},
    {href:'/admin/plans',label:'Planes',icon:BadgeDollarSign,key:'plans'},
    {href:'/admin/subscriptions',label:'Suscripciones',icon:ReceiptText,key:'plans'},
  ]},
  {label:'Operación',items:[
    {href:'/admin/global-customers',label:'Clientes globales',icon:ContactRound,key:'customers'},
    {href:'/admin/transactions',label:'Transacciones',icon:BadgeDollarSign},
    {href:'/admin/tickets',label:'Soporte',icon:LifeBuoy},
    {href:'/admin/whatsapp',label:'WhatsApp SaaS',icon:MessageCircleMore},
  ]},
  {label:'Contenido',items:[
    {href:'/admin/landing',label:'Página comercial',icon:MonitorCog,key:'landing'},
    {href:'/admin/templates',label:'Plantillas',icon:FileText,key:'settings'},
  ]},
  {label:'Sistema',items:[
    {href:'/admin/users',label:'Usuarios SaaS',icon:ShieldCheck,key:'users'},
    {href:'/admin/settings',label:'Configuración',icon:Settings,key:'settings'},
  ]},
]

function AdminBrand({collapsed=false}:{collapsed?:boolean}){
  return <Link href="/admin" className={`flex min-w-0 items-center ${collapsed?'justify-center':'gap-3'}`}>
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#0b5d3b] text-[15px] font-black tracking-[-.08em] text-white shadow-sm">W</span>
    {!collapsed&&<span className="min-w-0"><span className="block truncate text-[18px] font-extrabold tracking-[-.035em] text-[#0a3f2a]">WAMERCIO</span><span className="mt-1 block truncate text-[8px] font-bold uppercase tracking-[.18em] text-[#8e99a4]">Administración SaaS</span></span>}
  </Link>
}

export default function SuperAdminShell({children,title,subtitle,actions}:{children:React.ReactNode;title:string;subtitle?:string;actions?:React.ReactNode}){
  const path=usePathname(),router=useRouter()
  const[open,setOpen]=useState(false)
  const[collapsed,setCollapsed]=useState(false)
  const[me,setMe]=useState<any>(null)
  const[query,setQuery]=useState('')
  const[searchOpen,setSearchOpen]=useState(false)
  const searchRef=useRef<HTMLDivElement>(null)
  const searchInputRef=useRef<HTMLInputElement>(null)

  useEffect(()=>{api('/admin/me').then(setMe).catch(()=>router.replace('/admin/login'))},[router])
  useEffect(()=>setOpen(false),[path])
  useEffect(()=>{
    try{setCollapsed(localStorage.getItem('wamercio-admin-sidebar-collapsed')==='1')}catch{}
  },[])
  useEffect(()=>{
    const onClick=(e:MouseEvent)=>{if(searchRef.current&&!searchRef.current.contains(e.target as Node))setSearchOpen(false)}
    const onKey=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();searchInputRef.current?.focus();setSearchOpen(true)}}
    document.addEventListener('mousedown',onClick);document.addEventListener('keydown',onKey);return()=>{document.removeEventListener('mousedown',onClick);document.removeEventListener('keydown',onKey)}
  },[])

  const can=(key?:string)=>!key||!me||me.role==='superadmin'||(Array.isArray(me.access)&&me.access.includes(key))
  const allowedGroups=useMemo(()=>navGroups.map(g=>({...g,items:g.items.filter(i=>can(i.key))})).filter(g=>g.items.length>0),[me])
  const searchable=useMemo(()=>allowedGroups.flatMap(g=>g.items.map(i=>({...i,group:g.label}))),[allowedGroups])
  const results=query.trim()?searchable.filter(i=>`${i.label} ${i.group}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0,7):[]
  const active=(href:string)=>href==='/admin'?path===href:(path===href||path.startsWith(href+'/'))
  const toggleCollapsed=()=>setCollapsed(v=>{const next=!v;try{localStorage.setItem('wamercio-admin-sidebar-collapsed',next?'1':'0')}catch{}return next})
  const logout=async()=>{await api('/auth/admin/logout',{method:'POST'}).catch(()=>{});router.replace('/admin/login')}
  const go=(href:string)=>{setQuery('');setSearchOpen(false);router.push(href)}

  return <div className="min-h-dvh bg-[#f8fafc] text-[#17191c]">
    {open&&<button aria-label="Cerrar navegación" className="fixed inset-0 z-40 bg-[#101214]/25 backdrop-blur-[1px] lg:hidden" onClick={()=>setOpen(false)}/>} 

    <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[#e3e6e8] bg-white transition-[width,transform] duration-300 lg:translate-x-0 ${collapsed?'lg:w-20':'lg:w-72'} ${open?'w-72 translate-x-0':'w-72 -translate-x-full'}`}>
      <div className={`flex h-[82px] shrink-0 items-center border-b border-[#eef0f2] ${collapsed?'lg:justify-center lg:px-2':'px-5'}`}>
        <AdminBrand collapsed={collapsed&&!open}/>
        <button onClick={()=>setOpen(false)} className="ml-auto grid h-9 w-9 place-items-center rounded-xl text-[#717f8e] hover:bg-[#f4f6f7] lg:hidden"><X className="h-5 w-5"/></button>
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto px-4 py-5 ${collapsed?'lg:px-2':''}`}>
        <nav className="space-y-6">{allowedGroups.map(group=><section key={group.label}>
          <div className={`mb-2 px-3 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#aab3bb] ${collapsed?'lg:hidden':''}`}>{group.label}</div>
          <div className="space-y-1">{group.items.map(item=>{const I=item.icon;const isActive=active(item.href);return <Link title={collapsed?item.label:undefined} key={item.href} href={item.href} className={`group flex min-h-11 items-center rounded-xl text-sm font-semibold transition gap-3 px-3 ${collapsed?'lg:justify-center lg:gap-0 lg:px-0':''} ${isActive?'bg-[#0b5d3b] text-white shadow-[0_8px_20px_rgba(11,93,59,.15)]':'text-[#5b6671] hover:bg-[#f1f4f3] hover:text-[#17191c]'}`}><I className={`h-[18px] w-[18px] shrink-0 ${isActive?'text-white':'text-[#717f8e] group-hover:text-[#0b5d3b]'}`}/><span className={`${collapsed?'lg:hidden':''}`}>{item.label}</span></Link>})}</div>
        </section>)}</nav>
      </div>

      <div className={`shrink-0 border-t border-[#eef0f2] p-3 ${collapsed?'lg:px-2':''}`}>
        <div className={`flex items-center gap-3 rounded-xl bg-[#f8faf9] p-2.5 ${collapsed?'lg:justify-center lg:gap-0':''}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e3f6ea] text-[#0b5d3b]"><UserRound className="h-4 w-4"/></span>
          <div className={`min-w-0 flex-1 ${collapsed?'lg:hidden':''}`}><div className="truncate text-[12px] font-bold text-[#17191c]">{me?.name||'Administrador'}</div><div className="truncate text-[10px] text-[#8e99a4]">{me?.role==='superadmin'?'Superadministrador':me?.role||'Usuario SaaS'}</div></div>
          <button title="Cerrar sesión" onClick={logout} className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#8e99a4] transition hover:bg-white hover:text-[#b54129] ${collapsed?'lg:hidden':''}`}><LogOut className="h-4 w-4"/></button>
        </div>
      </div>
    </aside>

    <div className={`min-h-dvh transition-[padding] duration-300 ${collapsed?'lg:pl-20':'lg:pl-72'}`}>
      <header className="sticky top-0 z-30 flex h-[68px] items-center gap-3 border-b border-[#e3e6e8] bg-white/95 px-4 backdrop-blur-xl sm:px-6">
        <button onClick={()=>setOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#e3e6e8] text-[#717f8e] hover:bg-[#f8faf9] lg:hidden"><Menu className="h-5 w-5"/></button>
        <button onClick={toggleCollapsed} title={collapsed?'Expandir menú':'Contraer menú'} className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#e3e6e8] text-[#717f8e] transition hover:border-[#c6ccd2] hover:bg-[#f8faf9] hover:text-[#0b5d3b] lg:grid">{collapsed?<PanelLeftOpen className="h-5 w-5"/>:<PanelLeftClose className="h-5 w-5"/>}</button>

        <div ref={searchRef} className="relative hidden w-full max-w-[420px] md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8e99a4]"/>
          <input ref={searchInputRef} value={query} onFocus={()=>setSearchOpen(true)} onChange={e=>{setQuery(e.target.value);setSearchOpen(true)}} onKeyDown={e=>{if(e.key==='Enter'&&results[0])go(results[0].href)}} placeholder="Buscar en administración..." className="h-10 w-full rounded-xl border border-[#e3e6e8] bg-[#fbfcfc] pl-10 pr-14 text-xs text-[#17191c] outline-none transition placeholder:text-[#aab3bb] focus:border-[#9ac8b6] focus:ring-4 focus:ring-[#0b5d3b]/5"/>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-[#e3e6e8] bg-white px-1.5 py-0.5 text-[9px] font-semibold text-[#8e99a4]">Ctrl K</span>
          {searchOpen&&query.trim()&&<div className="absolute left-0 right-0 top-[46px] overflow-hidden rounded-2xl border border-[#e3e6e8] bg-white p-2 shadow-[0_22px_60px_rgba(23,25,28,.12)]">{results.length?results.map(r=>{const I=r.icon;return <button key={r.href} onClick={()=>go(r.href)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[#f4f6f5]"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e3f6ea] text-[#0b5d3b]"><I className="h-4 w-4"/></span><span><span className="block text-xs font-bold text-[#17191c]">{r.label}</span><span className="block text-[9px] uppercase tracking-wide text-[#8e99a4]">{r.group}</span></span></button>}):<div className="px-3 py-5 text-center text-xs text-[#8e99a4]">No se encontraron secciones.</div>}</div>}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Link href="/" target="_blank" title="Ver sitio" className="hidden h-9 w-9 place-items-center rounded-xl text-[#717f8e] transition hover:bg-[#f4f6f5] hover:text-[#0b5d3b] sm:grid"><Home className="h-4 w-4"/></Link>
          <Link href="/admin/tickets" title="Soporte" className="grid h-9 w-9 place-items-center rounded-xl text-[#717f8e] transition hover:bg-[#f4f6f5] hover:text-[#0b5d3b]"><Bell className="h-4 w-4"/></Link>
          <div className="hidden items-center gap-1.5 px-2 text-[11px] font-semibold text-[#717f8e] sm:flex"><Globe2 className="h-3.5 w-3.5"/>Español<ChevronDown className="h-3 w-3"/></div>
          <div className="ml-1 flex items-center gap-2 border-l border-[#e3e6e8] pl-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#0b5d3b] text-[10px] font-extrabold text-white">{String(me?.name||'SA').split(/\s+/).map((x:string)=>x[0]).join('').slice(0,2).toUpperCase()}</span><div className="hidden xl:block"><div className="max-w-[130px] truncate text-[11px] font-bold text-[#17191c]">{me?.name||'Super Admin'}</div><div className="text-[9px] text-[#8e99a4]">{me?.role==='superadmin'?'Super Admin':'Administrador'}</div></div></div>
        </div>
      </header>

      <main className="mx-auto max-w-[1760px] px-4 py-6 sm:px-6 lg:px-7 lg:py-7">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#0b5d3b]">Panel central de plataforma</div><h1 className="mt-1 text-2xl font-extrabold tracking-[-.025em] text-[#17191c] sm:text-[28px]">{title}</h1>{subtitle&&<p className="mt-1 max-w-3xl text-sm leading-6 text-[#717f8e]">{subtitle}</p>}</div>
          {actions&&<div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </main>
    </div>
  </div>
}
