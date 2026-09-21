'use client'

import {useEffect,useRef} from 'react'
import type {Map as LeafletMap} from 'leaflet'

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
 const mapElement=useRef<HTMLDivElement|null>(null)
 const mapInstance=useRef<LeafletMap|null>(null)
 const exact=finite(latitude)&&finite(longitude)
 const lat=exact?Number(latitude):null
 const lng=exact?Number(longitude):null

 useEffect(()=>{
  if(!exact||lat===null||lng===null||!mapElement.current)return
  let disposed=false
  let resizeTimer:ReturnType<typeof setTimeout>|undefined
  ;(async()=>{
   const L=await import('leaflet')
   if(disposed||!mapElement.current)return
   if(mapInstance.current){mapInstance.current.remove();mapInstance.current=null}
   const map=L.map(mapElement.current,{
    center:[lat,lng],
    zoom:19,
    zoomControl:true,
    dragging:true,
    scrollWheelZoom:true,
    touchZoom:true,
    doubleClickZoom:true,
    boxZoom:true,
    keyboard:true,
    attributionControl:true,
   })
   mapInstance.current=map
   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:20,
    attribution:'&copy; OpenStreetMap contributors',
   }).addTo(map)

   const markerRoot=document.createElement('div')
   markerRoot.className='customer-map-marker-shell'
   const avatar=document.createElement(profilePictureUrl?'img':'span')
   avatar.className='customer-map-marker-avatar'
   if(profilePictureUrl){
    ;(avatar as HTMLImageElement).src=profilePictureUrl
    ;(avatar as HTMLImageElement).alt=profileName||'Cliente'
   }else{
    avatar.textContent=String(profileName||'C').trim().slice(0,1).toUpperCase()||'C'
   }
   const tip=document.createElement('span')
   tip.className='customer-map-marker-tip'
   markerRoot.append(avatar,tip)
   const icon=L.divIcon({
    className:'customer-map-div-icon',
    html:markerRoot,
    iconSize:[56,66],
    iconAnchor:[28,66],
   })
   L.marker([lat,lng],{icon,title:profileName||'Cliente',keyboard:true}).addTo(map)

   requestAnimationFrame(()=>map.invalidateSize())
   resizeTimer=setTimeout(()=>map.invalidateSize(),180)
  })()
  return()=>{
   disposed=true
   if(resizeTimer)clearTimeout(resizeTimer)
   if(mapInstance.current){mapInstance.current.remove();mapInstance.current=null}
  }
 },[exact,lat,lng,profilePictureUrl,profileName])

 if(!exact){
  return <div className={`grid place-items-center rounded-2xl bg-[#eef2f3] p-6 text-center text-sm text-[#8d92aa] ${compact?'min-h-[180px]':'min-h-[320px]'} ${className}`}>
   <div><div className="font-semibold text-[#596179]">Ubicación exacta no disponible</div>{address&&<div className="mt-1 text-xs">{address}</div>}<div className="mt-1 text-xs">Guarda la ubicación del dispositivo para verla en el mapa.</div></div>
  </div>
 }
 return <div className={`relative overflow-hidden rounded-2xl bg-[#eef2f3] ${compact?'h-[220px]':'min-h-[390px]'} ${className}`}>
  <div ref={mapElement} className="absolute inset-0 h-full w-full" aria-label={`Mapa interactivo de ${profileName||'cliente'}`}/>
 </div>
}
