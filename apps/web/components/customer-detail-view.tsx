'use client'

import type {ReactNode} from 'react'
import {Gift,MapPin,MessageCircleMore,ShieldCheck,ShoppingBag,Store,WalletCards} from 'lucide-react'
import {money} from '@/lib/api'
import {phoneDisplay} from '@/components/phone-input'

const dateOnly=(value?:string|null)=>{
 if(!value)return '—'
 const d=new Date(value)
 return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('es-DO',{day:'2-digit',month:'2-digit',year:'numeric'})
}
const dateTime=(value?:string|null)=>{
 if(!value)return '—'
 const d=new Date(value)
 return Number.isNaN(d.getTime())?String(value):d.toLocaleString('es-DO',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})
}
const cedulaDisplay=(value?:string)=>{
 const d=String(value||'').replace(/\D/g,'')
 return d.length===11?`${d.slice(0,3)}-${d.slice(3,10)}-${d.slice(10)}`:(value||'—')
}
const genderLabel=(value?:string)=>value==='male'||value==='masculino'?'Masculino':value==='female'||value==='femenino'?'Femenino':value?value:'—'

function ProfileAvatar({profile,size='lg'}:{profile:any;size?:'lg'|'pin'}){
 const name=profile?.full_name||profile?.name||'Cliente'
 const cls=size==='pin'?'h-14 w-14 border-[4px]':'h-16 w-16 border-4'
 return <span className={`grid shrink-0 place-items-center overflow-hidden rounded-full border-white bg-brand-50 font-bold text-brand-700 shadow-lg ${cls}`}>
  {profile?.profile_picture_url?<img src={profile.profile_picture_url} alt={name} className="h-full w-full object-cover"/>:name.slice(0,1).toUpperCase()}
 </span>
}

export default function CustomerDetailView({profile,storePoints,storeOrders,storeSpent,tenantMode=false}:{profile:any;storePoints?:number;storeOrders?:number;storeSpent?:number;tenantMode?:boolean}){
 if(!profile)return <div className="rounded-2xl border border-dashed border-[#e0e5ec] p-8 text-center text-sm text-[#8d92aa]">No hay información global disponible para este cliente.</div>
 const primary=profile.primary_address||profile.addresses?.[0]
 const mapQuery=primary?.map_query||primary?.formatted_address||''
 const mapURL=mapQuery?`https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=17&output=embed`:''
 const name=profile.full_name||profile.name||'Cliente'
 return <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)]">
  <section className="overflow-hidden rounded-[26px] border border-[#e8ebf1] bg-[#f7f9fb]">
   <div className="flex items-center justify-between border-b border-[#e8ebf1] bg-white px-5 py-4"><div><p className="section-kicker">Ubicación</p><h4 className="mt-1 font-semibold text-ink-900">Dirección principal</h4></div><MapPin className="h-5 w-5 text-brand-600"/></div>
   <div className="relative min-h-[390px] bg-[#eef2f3]">
    {mapURL?<iframe title="Google Maps - ubicación principal" src={mapURL} className="absolute inset-0 h-full w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade"/>:<div className="absolute inset-0 grid place-items-center p-8 text-center text-sm text-[#8d92aa]">Este cliente todavía no tiene una dirección guardada para mostrar en el mapa.</div>}
    {mapURL&&<div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full"><div className="relative"><ProfileAvatar profile={profile} size="pin"/><span className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b-4 border-r-4 border-white bg-brand-500 shadow-sm"/></div></div>}
   </div>
   <div className="border-t border-[#e8ebf1] bg-white p-4"><p className="text-sm font-semibold text-ink-900">{primary?.label||'Principal'}</p><p className="mt-1 text-sm leading-6 text-[#7d849d]">{primary?.formatted_address||'Sin dirección registrada'}</p>{primary?.reference&&<p className="mt-1 text-xs text-[#9aa0b2]">Referencia: {primary.reference}</p>}</div>
  </section>

  <section className="space-y-4">
   <div className="rounded-[26px] border border-[#e8ebf1] bg-white p-5">
    <div className="flex items-center gap-4"><ProfileAvatar profile={profile}/><div className="min-w-0"><h4 className="truncate text-xl font-semibold text-ink-900">{name}</h4>{profile.whatsapp_name&&profile.whatsapp_name!==name&&<p className="mt-1 truncate text-xs font-semibold text-brand-600">WhatsApp: {profile.whatsapp_name}</p>}<p className="mt-1 text-sm text-[#8d92aa]">{phoneDisplay(profile.phone)}</p></div></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
     <Info label="Cédula" value={cedulaDisplay(profile.national_id)}/><Info label="Fecha de nacimiento" value={dateOnly(profile.birth_date)}/>
     <Info label="Género" value={genderLabel(profile.gender)}/><Info label="Último acceso" value={dateTime(profile.last_login_at)}/>
    </div>
    <div className="mt-4 flex flex-wrap gap-2">{profile.identity_verified&&<span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5"/>Identidad verificada</span>}{profile.whatsapp_verified&&<span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700"><MessageCircleMore className="h-3.5 w-3.5"/>WhatsApp verificado</span>}</div>
   </div>

   <div className={`grid gap-3 ${tenantMode?'sm:grid-cols-3':'grid-cols-2 sm:grid-cols-4 lg:grid-cols-2'}`}>
    {!tenantMode&&<Metric icon={<Store className="h-4 w-4"/>} value={profile.business_count||0} label="Negocios"/>}
    <Metric icon={<ShoppingBag className="h-4 w-4"/>} value={tenantMode?Number(storeOrders||0):(profile.order_count||0)} label="Pedidos"/>
    <Metric icon={<WalletCards className="h-4 w-4"/>} value={money(tenantMode?Number(storeSpent||0):Number(profile.total_spent||0))} label="Comprado"/>
    <Metric icon={<Gift className="h-4 w-4"/>} value={`${Number(storePoints??profile.loyalty_accounts?.reduce((n:number,x:any)=>n+Number(x.points_balance||0),0)??0).toLocaleString('es-DO')} pts`} label={tenantMode?'Puntos':'Puntos totales'}/>
   </div>

   <div className="rounded-[26px] border border-[#e8ebf1] bg-white p-5"><p className="section-kicker">Direcciones</p><div className="mt-3 space-y-3">{profile.addresses?.length?profile.addresses.map((a:any)=><div key={a.id} className="rounded-2xl bg-[#f8fafc] p-3"><div className="flex items-center gap-2 text-sm font-semibold text-ink-900"><MapPin className="h-4 w-4 text-brand-600"/>{a.label||'Dirección'}{a.is_primary&&<span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">PRINCIPAL</span>}</div><p className="mt-1 text-xs leading-5 text-[#7f869e]">{a.formatted_address}</p></div>):<p className="text-sm text-[#9aa0b2]">Sin direcciones registradas.</p>}</div></div>
   {!tenantMode&&profile.businesses?.length>0&&<div className="rounded-[26px] border border-[#e8ebf1] bg-white p-5"><p className="section-kicker">Actividad comercial</p><div className="mt-3 space-y-2">{profile.businesses.map((b:any)=><div key={b.store_id} className="flex items-center justify-between gap-4 rounded-2xl bg-[#f8fafc] p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-900">{b.store_name}</p><p className="mt-0.5 text-xs text-[#8d92aa]">{b.orders} pedidos</p></div><div className="text-right"><p className="text-sm font-semibold text-ink-900">{money(Number(b.total_spent||0))}</p><p className="mt-0.5 text-[10px] text-[#9aa0b2]">{dateTime(b.last_order_at)}</p></div></div>)}</div></div>}
   {!tenantMode&&profile.loyalty_accounts?.length>0&&<div className="rounded-[26px] border border-[#e8ebf1] bg-white p-5"><p className="section-kicker">Fidelización</p><div className="mt-3 space-y-2">{profile.loyalty_accounts.map((a:any)=><div key={a.store_id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#f8fafc] p-3"><div><p className="text-sm font-semibold text-ink-900">{a.store_name}</p><p className="text-xs text-[#8d92aa]">Ganados {Number(a.total_earned||0).toLocaleString('es-DO')} · Canjeados {Number(a.total_redeemed||0).toLocaleString('es-DO')}</p></div><strong className="text-brand-700">{Number(a.points_balance||0).toLocaleString('es-DO')} pts</strong></div>)}</div></div>}
  </section>
 </div>
}

function Info({label,value}:{label:string;value:string}){return <div className="rounded-2xl bg-[#f8fafc] p-3"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[#9aa0b2]">{label}</p><p className="mt-1 text-sm font-semibold text-ink-900">{value}</p></div>}
function Metric({icon,value,label}:{icon:ReactNode;value:ReactNode;label:string}){return <div className="rounded-2xl border border-[#edf0f4] bg-white p-4"><span className="text-brand-600">{icon}</span><div className="mt-2 text-lg font-semibold text-ink-900">{value}</div><div className="mt-0.5 text-xs text-[#8d92aa]">{label}</div></div>}
