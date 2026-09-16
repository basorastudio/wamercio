'use client'

import {ExternalLink} from 'lucide-react'

type CustomerLocationMapProps={
 latitude?:number|string|null
 longitude?:number|string|null
 address?:string
 profilePictureUrl?:string|null
 profileName?:string
 className?:string
 compact?:boolean
}

const finite=(value:unknown)=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))

export default function CustomerLocationMap({latitude,longitude,address='',profilePictureUrl,profileName='Cliente',className='',compact=false}:CustomerLocationMapProps){
 const exact=finite(latitude)&&finite(longitude)
 const lat=exact?Number(latitude):null
 const lng=exact?Number(longitude):null
 const query=exact?`${lat},${lng}`:String(address||'').trim()
 if(!query)return <div className={`grid place-items-center rounded-2xl bg-[#eef2f3] p-6 text-center text-sm text-[#8d92aa] ${compact?'min-h-[180px]':'min-h-[320px]'} ${className}`}>Guarda la ubicación exacta para verla en el mapa.</div>
 const embed=exact
  ?`https://maps.google.com/maps?ll=${encodeURIComponent(`${lat},${lng}`)}&z=19&output=embed`
  :`https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=17&output=embed`
 const external=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
 return <a href={external} target="_blank" rel="noreferrer" aria-label="Abrir ubicación en Google Maps" className={`group relative block overflow-hidden rounded-2xl bg-[#eef2f3] ${compact?'h-[220px]':'min-h-[390px]'} ${className}`}>
  <iframe title="Google Maps - ubicación del cliente" src={embed} className="pointer-events-none absolute inset-0 h-full w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" tabIndex={-1}/>
  <div className="pointer-events-none absolute inset-0 bg-transparent transition group-hover:bg-black/[.02]"/>
  <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full">
   <div className="relative">
    <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-full border-[4px] border-white bg-brand-50 font-bold text-brand-700 shadow-xl">
     {profilePictureUrl?<img src={profilePictureUrl} alt={profileName} className="h-full w-full object-cover"/>:String(profileName||'C').slice(0,1).toUpperCase()}
    </span>
    <span className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b-4 border-r-4 border-white bg-brand-500 shadow-sm"/>
   </div>
  </div>
  <span className="pointer-events-none absolute right-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-[#596179] shadow-sm backdrop-blur"><ExternalLink className="h-3.5 w-3.5"/>Abrir en Maps</span>
 </a>
}
