'use client'

import {MapPin,Ban} from 'lucide-react'
import {money} from '@/lib/api'
import {phoneDisplay} from '@/components/phone-input'
import CustomerLocationMap from '@/components/customer-location-map'

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

function ProfileAvatar({profile}:{profile:any}){
 const name=profile?.full_name||profile?.name||'Cliente'
 return <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-white bg-brand-50 font-bold text-brand-700 shadow-lg">
  {profile?.profile_picture_url?<img src={profile.profile_picture_url} alt={name} className="h-full w-full object-cover"/>:name.slice(0,1).toUpperCase()}
 </span>
}

export default function CustomerDetailView({profile,tenantMode=false}:{profile:any;storePoints?:number;storeOrders?:number;storeSpent?:number;tenantMode?:boolean}){
 if(!profile)return <div className="rounded-2xl border border-dashed border-[#e0e5ec] p-8 text-center text-sm text-[#8d92aa]">No hay información global disponible para este cliente.</div>
 const primary=profile.primary_address||profile.addresses?.[0]
 const name=profile.full_name||profile.name||'Cliente'
 return <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)]">
  <section className="overflow-hidden rounded-[26px] border border-[#e8ebf1] bg-[#f7f9fb]">
   <div className="flex items-center justify-between border-b border-[#e8ebf1] bg-white px-5 py-4"><div><p className="section-kicker">Ubicación</p><h4 className="mt-1 font-semibold text-ink-900">Dirección principal</h4></div><MapPin className="h-5 w-5 text-brand-600"/></div>
   <CustomerLocationMap latitude={primary?.latitude} longitude={primary?.longitude} address={primary?.map_query||primary?.formatted_address||''} profilePictureUrl={profile.profile_picture_url} profileName={name} className="rounded-none"/>
   <div className="border-t border-[#e8ebf1] bg-white p-4"><p className="text-sm font-semibold text-ink-900">{primary?.label||'Principal'}</p><p className="mt-1 text-sm leading-6 text-[#7d849d]">{primary?.formatted_address||'Sin dirección registrada'}</p>{primary?.latitude!==null&&primary?.latitude!==undefined&&primary?.longitude!==null&&primary?.longitude!==undefined&&<p className="mt-1 text-xs font-semibold text-brand-600">Ubicación exacta guardada</p>}</div>
  </section>

  <section className="space-y-4">
   <div className="rounded-[26px] border border-[#e8ebf1] bg-white p-5">
    <div className="flex items-center gap-4"><ProfileAvatar profile={profile}/><div className="min-w-0"><h4 className="truncate text-xl font-semibold text-ink-900">{name}</h4>{profile.whatsapp_name&&profile.whatsapp_name!==name&&<p className="mt-1 truncate text-xs font-semibold text-brand-600">WhatsApp: {profile.whatsapp_name}</p>}<p className="mt-1 text-sm text-[#8d92aa]">{phoneDisplay(profile.phone)}</p></div></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
     <Info label="Cédula" value={cedulaDisplay(profile.national_id)}/><Info label="Fecha de nacimiento" value={dateOnly(profile.birth_date)}/>
     <Info label="Género" value={genderLabel(profile.gender)}/><Info label="Último acceso" value={dateTime(profile.last_login_at)}/>
    </div>
   </div>

   <div className="rounded-[26px] border border-[#e8ebf1] bg-white p-5"><p className="section-kicker">Direcciones</p><div className="mt-3 space-y-3">{profile.addresses?.length?profile.addresses.map((a:any)=><div key={a.id} className="rounded-2xl bg-[#f8fafc] p-3"><div className="flex items-center gap-2 text-sm font-semibold text-ink-900"><MapPin className="h-4 w-4 text-brand-600"/>{a.label||'Dirección'}{a.is_primary&&<span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">PRINCIPAL</span>}</div><p className="mt-1 text-xs leading-5 text-[#7f869e]">{a.formatted_address}</p></div>):<p className="text-sm text-[#9aa0b2]">Sin direcciones registradas.</p>}</div></div>
   {!tenantMode&&profile.blocks?.length>0&&<div className="rounded-[26px] border border-rose-200 bg-rose-50/60 p-5"><div className="flex items-center gap-2"><Ban className="h-4 w-4 text-rose-600"/><p className="section-kicker text-rose-600">Bloqueos por negocio</p></div><div className="mt-3 space-y-2">{profile.blocks.map((b:any)=><div key={`${b.store_id}-${b.blocked_at||''}`} className="rounded-2xl border border-rose-100 bg-white p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-900">{b.store_name}</p><p className="mt-1 text-xs leading-5 text-rose-700">{b.reason||'Sin motivo registrado'}</p></div><span className="shrink-0 rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-bold text-rose-700">BLOQUEADO</span></div>{b.blocked_at&&<p className="mt-2 text-[10px] text-[#9aa0b2]">{dateTime(b.blocked_at)}{b.blocked_by?` · ${b.blocked_by}`:''}</p>}</div>)}</div></div>}
   {!tenantMode&&profile.businesses?.length>0&&<div className="rounded-[26px] border border-[#e8ebf1] bg-white p-5"><p className="section-kicker">Actividad comercial</p><div className="mt-3 space-y-2">{profile.businesses.map((b:any)=><div key={b.store_id} className="flex items-center justify-between gap-4 rounded-2xl bg-[#f8fafc] p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-900">{b.store_name}</p><p className="mt-0.5 text-xs text-[#8d92aa]">{b.orders} pedidos</p></div><div className="text-right"><p className="text-sm font-semibold text-ink-900">{money(Number(b.total_spent||0))}</p><p className="mt-0.5 text-[10px] text-[#9aa0b2]">{dateTime(b.last_order_at)}</p></div></div>)}</div></div>}
   {!tenantMode&&profile.loyalty_accounts?.length>0&&<div className="rounded-[26px] border border-[#e8ebf1] bg-white p-5"><p className="section-kicker">Fidelización</p><div className="mt-3 space-y-2">{profile.loyalty_accounts.map((a:any)=><div key={a.store_id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#f8fafc] p-3"><div><p className="text-sm font-semibold text-ink-900">{a.store_name}</p><p className="text-xs text-[#8d92aa]">Ganados {Number(a.total_earned||0).toLocaleString('es-DO')} · Canjeados {Number(a.total_redeemed||0).toLocaleString('es-DO')}</p></div><strong className="text-brand-700">{Number(a.points_balance||0).toLocaleString('es-DO')} pts</strong></div>)}</div></div>}
  </section>
 </div>
}

function Info({label,value}:{label:string;value:string}){return <div className="rounded-2xl bg-[#f8fafc] p-3"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[#9aa0b2]">{label}</p><p className="mt-1 text-sm font-semibold text-ink-900">{value}</p></div>}
