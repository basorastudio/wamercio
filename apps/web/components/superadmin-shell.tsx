'use client'

import Link from 'next/link'
import {usePathname,useRouter} from 'next/navigation'
import {useEffect,useMemo,useRef,useState} from 'react'
import {api} from '@/lib/api'
import SuperAdminSupportSoftphone from '@/components/superadmin-support-softphone'
import {
  BadgeDollarSign,Bell,ChevronDown,ContactRound,FileText,Globe2,Home,LayoutDashboard,
  LifeBuoy,LogOut,Menu,MessageCircleMore,MonitorCog,PanelLeftClose,PanelLeftOpen,PhoneCall,
  ReceiptText,Search,Settings,ShieldCheck,Store,UsersRound,UserRound,X
} from 'lucide-react'

type NavItem={href:string;label:string;key?:string;icon:any}
type NavGroup={label:string;items:NavItem[]}

type AdminMe={name?:string;role?:string;access?:string[]}

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
    {href:'/admin/whatsapp',label:'WhatsApp de soporte',icon:MessageCircleMore},
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
  return <Link href="/admin" className={`flex min-w-0 items-center ${collapsed?'justify-center':'gap-2.5'}`} aria-label="Ir al Dashboard de WAMERCIO">
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-white/90 text-[14px] font-black tracking-[-.08em] text-white">W</span>
    {!collapsed&&<span className="min-w-0"><span className="block truncate text-[18px] font-extrabold tracking-[-.035em] text-white">WAMERCIO</span><span className="mt-0.5 block truncate text-[8px] font-bold uppercase tracking-[.18em] text-white/55">Administración SaaS</span></span>}
  </Link>
}

export default function SuperAdminShell({children,title,subtitle,actions}:{children:React.ReactNode;title:string;subtitle?:string;actions?:React.ReactNode}){
  const path=usePathname(),router=useRouter()
  const[open,setOpen]=useState(false)
  const[collapsed,setCollapsed]=useState(false)
  const[me,setMe]=useState<AdminMe|null>(null)
  const[query,setQuery]=useState('')
  const[searchOpen,setSearchOpen]=useState(false)
  const[accountOpen,setAccountOpen]=useState(false)
  const[languageOpen,setLanguageOpen]=useState(false)
  const searchRef=useRef<HTMLDivElement>(null)
  const accountRef=useRef<HTMLDivElement>(null)
  const languageRef=useRef<HTMLDivElement>(null)
  const searchInputRef=useRef<HTMLInputElement>(null)

  useEffect(()=>{
    const loadMe=()=>api<AdminMe>('/admin/me').then(setMe).catch(()=>router.replace('/admin/login'))
    void loadMe()
    window.addEventListener('wamercio:admin-profile-updated',loadMe)
    return()=>window.removeEventListener('wamercio:admin-profile-updated',loadMe)
  },[router])
  useEffect(()=>{setOpen(false);setAccountOpen(false);setLanguageOpen(false)},[path])
  useEffect(()=>{try{setCollapsed(localStorage.getItem('wamercio-admin-sidebar-collapsed')==='1')}catch{}},[])
  useEffect(()=>{
    const onClick=(e:MouseEvent)=>{
      const node=e.target as Node
      if(searchRef.current&&!searchRef.current.contains(node))setSearchOpen(false)
      if(accountRef.current&&!accountRef.current.contains(node))setAccountOpen(false)
      if(languageRef.current&&!languageRef.current.contains(node))setLanguageOpen(false)
    }
    const onKey=(e:KeyboardEvent)=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
        e.preventDefault();searchInputRef.current?.focus();setSearchOpen(true)
      }
      if(e.key==='Escape'){setSearchOpen(false);setAccountOpen(false);setLanguageOpen(false)}
    }
    document.addEventListener('mousedown',onClick);document.addEventListener('keydown',onKey)
    return()=>{document.removeEventListener('mousedown',onClick);document.removeEventListener('keydown',onKey)}
  },[])

  const can=(key?:string)=>!key||!me||me.role==='superadmin'||(Array.isArray(me.access)&&me.access.includes(key))
  const allowedGroups=useMemo(()=>navGroups.map(g=>({...g,items:g.items.filter(i=>can(i.key))})).filter(g=>g.items.length>0),[me])
  const searchable=useMemo(()=>allowedGroups.flatMap(g=>g.items.map(i=>({...i,group:g.label}))),[allowedGroups])
  const results=query.trim()?searchable.filter(i=>`${i.label} ${i.group}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0,8):searchable.slice(0,6)
  const active=(href:string)=>href==='/admin'?path===href:(path===href||path.startsWith(href+'/'))
  const toggleCollapsed=()=>setCollapsed(v=>{const next=!v;try{localStorage.setItem('wamercio-admin-sidebar-collapsed',next?'1':'0')}catch{}return next})
  const logout=async()=>{await api('/auth/admin/logout',{method:'POST'}).catch(()=>{});router.replace('/admin/login')}
  const go=(href:string)=>{setQuery('');setSearchOpen(false);router.push(href)}
  const initials=String(me?.name||'SA').split(/\s+/).filter(Boolean).map(x=>x[0]).join('').slice(0,2).toUpperCase()

  return <div className="admin-ui min-h-dvh text-[#0a3f2a]">
    {open&&<button aria-label="Cerrar navegación" className="fixed inset-0 z-40 bg-[#101214]/50 backdrop-blur-[1px] lg:hidden" onClick={()=>setOpen(false)}/>} 

    <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-[#0b5d3b] transition-[width,transform] duration-300 lg:translate-x-0 ${collapsed?'lg:w-[78px]':'lg:w-[260px]'} ${open?'w-[260px] translate-x-0':'w-[260px] -translate-x-full'}`}>
      <div className={`flex h-16 shrink-0 items-center ${collapsed?'lg:justify-center lg:px-2':'px-5'}`}>
        <AdminBrand collapsed={collapsed&&!open}/>
        <button onClick={()=>setOpen(false)} className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Cerrar menú"><X className="h-5 w-5"/></button>
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto px-3 py-3 ${collapsed?'lg:px-2':''}`}>
        <nav className="space-y-4">{allowedGroups.map(group=><section key={group.label}>
          <div className={`mb-1.5 px-2 text-[10px] font-extrabold uppercase tracking-[.15em] text-white/45 ${collapsed?'lg:hidden':''}`}>{group.label}</div>
          <div className="space-y-1">{group.items.map(item=>{const I=item.icon;const isActive=active(item.href);return <Link title={collapsed?item.label:undefined} key={item.href} href={item.href} className={`group relative flex min-h-10 items-center rounded-lg px-2.5 text-[13px] font-medium transition gap-2.5 ${collapsed?'lg:justify-center lg:gap-0 lg:px-0':''} ${isActive?'bg-white/10 font-semibold text-white':'text-white/80 hover:bg-white/10 hover:text-white'}`}>{isActive&&<span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r bg-[#bd431e]"/>}<I className="h-[17px] w-[17px] shrink-0"/><span className={`${collapsed?'lg:hidden':''}`}>{item.label}</span></Link>})}</div>
        </section>)}</nav>
      </div>

      <div className={`shrink-0 border-t border-white/10 p-3 ${collapsed?'lg:px-2':''}`}>
        <button onClick={()=>window.dispatchEvent(new CustomEvent('wamercio:open-admin-softphone'))} title="Abrir softphone" className={`flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2.5 text-left text-[13px] font-semibold text-white transition hover:bg-white/10 ${collapsed?'lg:justify-center lg:gap-0 lg:px-0':''}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#00a884] text-white"><PhoneCall className="h-[16px] w-[16px]"/></span><span className={`${collapsed?'lg:hidden':''}`}><span className="block">Abrir softphone</span><span className="mt-0.5 block text-[9px] font-medium text-white/50">Sesión global de soporte</span></span></button>
      </div>
    </aside>

    <div className={`min-h-dvh transition-[padding] duration-300 ${collapsed?'lg:pl-[78px]':'lg:pl-[260px]'}`}>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-[#e6ded1] bg-[#fbf8f3]/94 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <button onClick={()=>setOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#46584f] hover:bg-[#f3eee5] lg:hidden" aria-label="Abrir menú"><Menu className="h-5 w-5"/></button>
        <button onClick={toggleCollapsed} title={collapsed?'Expandir menú':'Contraer menú'} className="hidden h-10 w-10 shrink-0 place-items-center rounded-lg text-[#46584f] transition hover:bg-[#f3eee5] hover:text-[#0b5d3b] lg:grid">{collapsed?<PanelLeftOpen className="h-5 w-5"/>:<PanelLeftClose className="h-5 w-5"/>}</button>
        <div className="min-w-0"><div className="truncate font-[Bricolage_Grotesque] text-[17px] font-bold text-[#0a3f2a]">{title}</div></div>

        <div ref={searchRef} className="relative ml-2 hidden w-full max-w-[390px] md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8a84]"/>
          <input ref={searchInputRef} value={query} onFocus={()=>setSearchOpen(true)} onChange={e=>{setQuery(e.target.value);setSearchOpen(true)}} onKeyDown={e=>{if(e.key==='Enter'&&results[0])go(results[0].href)}} placeholder="Buscar en administración..." className="h-9 w-full rounded-lg border border-[#e6ded1] bg-white/70 pl-9 pr-14 text-xs text-[#0a3f2a] outline-none transition placeholder:text-[#9aa39e] focus:border-[#0b5d3b] focus:ring-2 focus:ring-[#0b5d3b]/10"/>
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-[#e6ded1] bg-white px-1.5 py-0.5 text-[9px] font-semibold text-[#7f8a84]">Ctrl K</span>
          {searchOpen&&<div className="absolute left-0 right-0 top-[42px] overflow-hidden rounded-xl border border-[#e6ded1] bg-white p-2 shadow-[0_18px_50px_rgba(55,43,30,.14)]">{results.length?results.map(r=>{const I=r.icon;return <button key={r.href} onClick={()=>go(r.href)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[#f3eee5]"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e3f6ea] text-[#0b5d3b]"><I className="h-4 w-4"/></span><span><span className="block text-xs font-bold text-[#0a3f2a]">{r.label}</span><span className="block text-[9px] uppercase tracking-wide text-[#7f8a84]">{r.group}</span></span></button>}):<div className="px-3 py-5 text-center text-xs text-[#7f8a84]">No se encontraron secciones.</div>}</div>}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Link href="/" target="_blank" title="Ver sitio público" className="hidden h-9 items-center gap-2 rounded-lg border border-[#0b5d3b] px-3 text-[11px] font-semibold text-[#0b5d3b] transition hover:bg-[#0b5d3b]/5 sm:flex"><Home className="h-3.5 w-3.5"/>Ver sitio</Link>
          <Link href="/admin/tickets" title="Soporte y tickets" className="grid h-9 w-9 place-items-center rounded-lg text-[#46584f] transition hover:bg-[#f3eee5] hover:text-[#0b5d3b]"><Bell className="h-4 w-4"/></Link>

          <div ref={languageRef} className="relative hidden sm:block">
            <button type="button" onClick={()=>setLanguageOpen(v=>!v)} className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-[#46584f] transition hover:bg-[#f3eee5]" aria-expanded={languageOpen}><Globe2 className="h-3.5 w-3.5"/>Español<ChevronDown className={`h-3 w-3 transition ${languageOpen?'rotate-180':''}`}/></button>
            {languageOpen&&<div className="absolute right-0 top-11 w-52 rounded-xl border border-[#e6ded1] bg-white p-2 shadow-[0_18px_45px_rgba(55,43,30,.13)]"><div className="rounded-lg bg-[#e3f6ea] px-3 py-2.5"><div className="text-xs font-bold text-[#0a3f2a]">Español</div><div className="mt-0.5 text-[10px] leading-4 text-[#718078]">Idioma operativo de WAMERCIO.</div></div></div>}
          </div>

          <div ref={accountRef} className="relative ml-1 border-l border-[#e6ded1] pl-2">
            <button type="button" onClick={()=>setAccountOpen(v=>!v)} className="flex h-10 items-center gap-2 rounded-lg px-1.5 pr-2 transition hover:bg-[#f3eee5]" aria-expanded={accountOpen}>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#0b5d3b] text-[10px] font-extrabold text-white">{initials}</span>
              <span className="hidden max-w-[150px] text-left xl:block"><span className="block truncate text-[11px] font-bold text-[#0a3f2a]">{me?.name||'Administrador'}</span><span className="block text-[9px] text-[#7f8a84]">{me?.role==='superadmin'?'Super Admin':'Administrador'}</span></span>
              <ChevronDown className={`hidden h-3 w-3 text-[#7f8a84] transition xl:block ${accountOpen?'rotate-180':''}`}/>
            </button>
            {accountOpen&&<div className="absolute right-0 top-12 w-60 rounded-xl border border-[#e6ded1] bg-white p-2 shadow-[0_18px_50px_rgba(55,43,30,.14)]"><div className="border-b border-[#f0eae1] px-3 py-2.5"><div className="truncate text-xs font-bold text-[#0a3f2a]">{me?.name||'Administrador'}</div><div className="mt-0.5 text-[10px] text-[#7f8a84]">{me?.role==='superadmin'?'Superadministrador':'Usuario de plataforma'}</div></div><Link href="/admin/profile" className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[#46584f] hover:bg-[#f3eee5]"><UserRound className="h-4 w-4"/>Mi perfil</Link><Link href="/admin/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[#46584f] hover:bg-[#f3eee5]"><Settings className="h-4 w-4"/>Configuración</Link><button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#a63a23] hover:bg-[#fff2ef]"><LogOut className="h-4 w-4"/>Cerrar sesión</button></div>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1760px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="text-[9px] font-extrabold uppercase tracking-[.17em] text-[#0b5d3b]">Panel central de plataforma</div><h1 className="mt-1 text-2xl font-extrabold tracking-[-.025em] text-[#0a3f2a] sm:text-[28px]">{title}</h1>{subtitle&&<p className="mt-1 max-w-3xl text-sm leading-6 text-[#718078]">{subtitle}</p>}</div>
          {actions&&<div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </main>
    </div>
    <SuperAdminSupportSoftphone/>
  </div>
}
