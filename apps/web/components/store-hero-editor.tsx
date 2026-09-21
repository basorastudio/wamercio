'use client'
import {useMemo,useRef,useState} from 'react'
import {GripVertical,MapPin,MessageCircleMore,ShoppingBag} from 'lucide-react'
import {Switch} from '@/components/ui'
import {heroElementStyle,resolvedHeroContent,type StoreHeroContentConfig,type StoreHeroElementConfig} from '@/lib/store-themes'

type Key='label'|'title'|'description'|'whatsapp'|'address'|'minimum'
type Props={
  form:any
  heroLabel:string
  onElementChange:(key:Key,value:StoreHeroElementConfig)=>void
  onFreePositionChange:(value:boolean)=>void
}

const labels:Record<Key,{label:string;detail:string}>={
  label:{label:'Etiqueta superior',detail:'Ej.: MENÚ Y PEDIDOS.'},
  title:{label:'Nombre del negocio',detail:'Muestra el nombre sobre la portada.'},
  description:{label:'Descripción',detail:'Texto corto debajo del nombre.'},
  whatsapp:{label:'Botón de WhatsApp',detail:'Acceso directo al WhatsApp del negocio.'},
  address:{label:'Dirección',detail:'Muestra la dirección o referencia.'},
  minimum:{label:'Pedido mínimo',detail:'Se muestra solo cuando existe un mínimo configurado.'},
}

export default function StoreHeroEditor({form,heroLabel,onElementChange,onFreePositionChange}:Props){
  const host=useRef<HTMLDivElement|null>(null)
  const[dragging,setDragging]=useState<Key|null>(null)
  const hero=useMemo(()=>resolvedHeroContent(form?.theme_config?.hero),[form?.theme_config?.hero])
  const primary=form?.theme_config?.colors?.primary||form?.primary_color||'#36b385'
  const secondary=form?.theme_config?.colors?.secondary||'#82d6b7'
  const text='#fff'

  const move=(event:React.PointerEvent<HTMLButtonElement>)=>{
    if(!dragging||!host.current)return
    const rect=host.current.getBoundingClientRect()
    const x=Math.max(1,Math.min(94,((event.clientX-rect.left)/rect.width)*100))
    const y=Math.max(4,Math.min(92,((event.clientY-rect.top)/rect.height)*100))
    onFreePositionChange(true)
    onElementChange(dragging,{...hero[dragging],x:Number(x.toFixed(1)),y:Number(y.toFixed(1))})
  }
  const start=(key:Key,event:React.PointerEvent<HTMLButtonElement>)=>{setDragging(key);event.currentTarget.setPointerCapture(event.pointerId)}
  const stop=(event:React.PointerEvent<HTMLButtonElement>)=>{setDragging(null);try{event.currentTarget.releasePointerCapture(event.pointerId)}catch{}}
  const chip=(key:Key,child:React.ReactNode)=>hero[key].visible?<button type="button" aria-label={`Mover ${labels[key].label}`} onPointerDown={e=>start(key,e)} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} className={`absolute z-10 inline-flex max-w-[88%] touch-none items-center gap-1.5 text-left text-white ${dragging===key?'cursor-grabbing ring-2 ring-white/80':'cursor-grab'}`} style={{...heroElementStyle(hero[key]),transform:'translateY(-50%)'}}><GripVertical className="h-3.5 w-3.5 shrink-0 opacity-75"/>{child}</button>:null

  return <div className="rounded-[26px] border border-[#e8ebf0] bg-[#fbfcfd] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="section-kicker">Contenido sobre portada</p><h3 className="mt-1 font-semibold text-ink-900">Elige qué mostrar y colócalo donde quieras</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-[#8d92aa]">Activa solo la información que necesites. Arrastra cada elemento directamente sobre la portada; esa posición se conservará en la tienda.</p></div><span className="rounded-full bg-brand-50 px-3 py-1.5 text-[11px] font-semibold text-brand-700">Arrastrar y soltar</span></div>
    <div ref={host} data-testid="store-hero-drag-editor" className="relative mt-4 aspect-[16/7] overflow-hidden rounded-[24px] border border-white/70 shadow-sm" style={{background:`linear-gradient(135deg,${primary},${secondary})`}}>
      {form?.banner_url&&<><img src={form.banner_url} alt="Vista de la portada" className="absolute inset-0 h-full w-full object-cover"/><div className="absolute inset-0 bg-gradient-to-r from-slate-950/65 via-slate-950/30 to-slate-950/10"/></>}
      {chip('label',<span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.14em] backdrop-blur-sm">{heroLabel}</span>)}
      {chip('title',<span className="text-xl font-bold leading-none sm:text-3xl">{form?.name||'Tu negocio'}</span>)}
      {chip('description',<span className="max-w-md text-xs leading-5 opacity-90 sm:text-sm">{form?.description||'Elige tus productos favoritos y haz tu pedido en pocos pasos.'}</span>)}
      {chip('whatsapp',<span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1.5 text-[11px] font-semibold backdrop-blur-sm"><MessageCircleMore className="h-3.5 w-3.5"/>WhatsApp</span>)}
      {chip('address',<span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1.5 text-[11px] font-semibold backdrop-blur-sm"><MapPin className="h-3.5 w-3.5"/>{form?.address||'Dirección del negocio'}</span>)}
      {Number(form?.minimum_order||0)>0&&chip('minimum',<span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1.5 text-[11px] font-semibold backdrop-blur-sm"><ShoppingBag className="h-3.5 w-3.5"/>Pedido mínimo</span>)}
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{(Object.keys(labels) as Key[]).map(key=><Switch key={key} checked={hero[key].visible} onChange={visible=>{onFreePositionChange(true);onElementChange(key,{...hero[key],visible})}} label={labels[key].label} detail={labels[key].detail}/>)}</div>
  </div>
}
