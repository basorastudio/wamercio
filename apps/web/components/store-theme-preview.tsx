'use client'
import {Clock4,MapPin,MessageCircleMore,Search,ShoppingBag,Store,Truck} from 'lucide-react'
import {money} from '@/lib/api'
import {resolvedTheme,themeCSSVars} from '@/lib/store-themes'

const ratioClass:Record<string,string>={'1:1':'aspect-square','4:3':'aspect-[4/3]','3:4':'aspect-[3/4]','16:9':'aspect-video'}
export default function StoreThemePreview({form}:{form:any}){
 const {config,preset}=resolvedTheme(form?.visual_theme,form?.theme_config,form?.primary_color)
 const css=themeCSSVars(config) as React.CSSProperties
 const previewImages:Record<string,string[]>={
  'food-bold':['/demo-products/pizzeria/pizza-pepperoni.svg','/demo-products/comida-rapida/hamburguesa-clasica.svg'],
  'fresh-market':['/demo-products/pet-shop/alimento-premium.svg','/demo-products/mayorista-distribuidor/paquete-surtido.svg'],
  'editorial-fashion':['/demo-products/boutique/vestido-midi.svg','/demo-products/boutique/blusa-basica.svg'],
  'beauty-soft':['/demo-products/cosmeticos/labial-mate.svg','/demo-products/cosmeticos/serum-facial.svg'],
  'luxury':['/demo-products/regalos-personalizados/caja-de-regalo.svg','/demo-products/floristeria/ramo-de-rosas.svg'],
  'tech-modern':['/demo-products/tecnologia/smartphone-128-gb.svg','/demo-products/tecnologia/audifonos-bluetooth.svg'],
  'industrial-pro':['/demo-products/ferreteria/taladro-percutor.svg','/demo-products/repuestos/aceite-de-motor.svg'],
  'minimal-shop':['/demo-products/otro-negocio/producto-de-ejemplo.svg','/demo-products/regalos-personalizados/taza-personalizada.svg'],
 }
 const imgs=previewImages[preset.id]||previewImages['minimal-shop']
 const products=[{name:'Producto estrella',price:money(Math.max(180,Number(form?.minimum_order||0))),desc:'Ejemplo de producto destacado.',image:imgs[0]},{name:'Promoción del día',price:money(250),desc:form?.order_notice||'Tu catálogo se verá así.',image:imgs[1]}]
 const heroBg=form?.banner_url?undefined:config.hero.variant==='editorial'?config.colors.surface:`linear-gradient(135deg, ${config.colors.primary}, ${config.colors.secondary})`
 const cardRadius=`${config.shape.radius}px`
 return <div className="mx-auto w-[248px] rounded-[36px] bg-[#111827] p-2.5 shadow-[0_24px_60px_rgba(15,23,42,.24)]" style={css}>
  <div className="relative h-[470px] overflow-hidden rounded-[28px]" style={{background:config.background.type==='gradient'?config.background.value:config.colors.background,color:config.colors.text,fontFamily:'var(--store-body-font)'}}>
   <div className="absolute left-1/2 top-2 z-20 h-6 w-28 -translate-x-1/2 rounded-full bg-[#111827]"/>
   <div className={`px-4 pb-3 pt-10 ${config.header.variant==='centered'?'text-center':''}`} style={{background:config.header.variant==='glass'?'rgba(255,255,255,.82)':config.colors.surface,borderBottom:`1px solid ${config.colors.border}`}}>
    <div className={`flex items-center gap-3 ${config.header.variant==='centered'?'flex-col':''}`}><div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden" style={{borderRadius:cardRadius,background:config.colors.background}}>{form?.logo_url?<img src={form.logo_url} className="h-full w-full object-cover"/>:<Store className="h-4 w-4" style={{color:config.colors.primary}}/>}</div><div className="min-w-0"><h3 className="truncate text-sm font-semibold" style={{fontFamily:'var(--store-heading-font)'}}>{form?.name||'Tu negocio'}</h3><p className="truncate text-[10px]" style={{color:config.colors.muted}}>{form?.address||'Catálogo en línea'}</p></div>{config.header.variant!=='centered'&&<span className="ml-auto rounded-full px-2 py-1 text-[9px] font-semibold" style={{background:config.colors.primary,color:config.colors.buttonText}}>Abierto</span>}</div>
   </div>
   <div className="p-3">
    <section className={`relative overflow-hidden ${config.hero.variant==='compact'?'min-h-20':'min-h-32'}`} style={{borderRadius:cardRadius,background:heroBg,color:config.hero.variant==='editorial'?config.colors.text:'#fff',boxShadow:'var(--store-shadow)'}}>{form?.banner_url&&<><img src={form.banner_url} className="absolute inset-0 h-full w-full object-cover"/><div className="absolute inset-0 bg-slate-950/40"/></>}<div className="relative p-4"><span className="text-[8px] font-bold uppercase tracking-[.16em] opacity-75">Catálogo</span><h4 className="mt-2 text-xl font-semibold leading-tight" style={{fontFamily:'var(--store-heading-font)'}}>{form?.name||'Tu negocio'}</h4><p className="mt-1 line-clamp-2 text-[10px] leading-4 opacity-80">{form?.description||'Personaliza colores, fuentes, diseño y estilo.'}</p></div></section>
    <div className={`mt-3 flex gap-2 overflow-hidden ${config.categories.variant==='underline'?'border-b':''}`} style={{borderColor:config.colors.border}}>{['Todos','Destacados','Novedades'].map((x,i)=><span key={x} className={`${config.categories.variant==='circles'?'grid h-12 min-w-12 place-items-center rounded-full px-1 text-center':'px-3 py-1.5'} text-[9px] font-semibold`} style={config.categories.variant==='underline'?{color:i===0?config.colors.primary:config.colors.muted,borderBottom:i===0?`2px solid ${config.colors.primary}`:'2px solid transparent'}:{borderRadius:config.categories.variant==='cards'?`${Math.max(8,config.shape.radius/2)}px`:'999px',background:i===0?config.colors.primary:config.colors.surface,color:i===0?config.colors.buttonText:config.colors.muted,border:`1px solid ${i===0?config.colors.primary:config.colors.border}`}}>{x}</span>)}</div>
    <div className="relative mt-3"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{color:config.colors.muted}}/><div className="py-2.5 pl-9 pr-3 text-[10px]" style={{borderRadius:cardRadius,background:config.colors.surface,border:`1px solid ${config.colors.border}`,color:config.colors.muted}}>Buscar productos...</div></div>
    <div className={`mt-3 grid gap-2 ${config.products.columnsMobile===1?'grid-cols-1':'grid-cols-2'}`}>{products.map((p,i)=><div key={p.name} className={config.products.card==='industrial'?'flex overflow-hidden':'overflow-hidden'} style={{borderRadius:cardRadius,background:config.colors.surface,border:`1px solid ${config.colors.border}`,boxShadow:'var(--store-shadow)'}}><div className={`${config.products.card==='industrial'?'h-20 w-20 shrink-0':ratioClass[config.products.imageRatio]||'aspect-square'} overflow-hidden`} style={{background:`linear-gradient(135deg, ${config.colors.primary}16, ${config.colors.secondary}55)`}}><img src={p.image} className="h-full w-full object-cover"/></div><div className="min-w-0 p-2.5"><div className="truncate text-[10px] font-semibold">{p.name}</div><div className="mt-1 line-clamp-2 text-[8px] leading-3" style={{color:config.colors.muted}}>{p.desc}</div><div className="mt-1 text-[10px] font-bold" style={{color:config.colors.primary}}>{p.price}</div></div></div>)}</div>
    <div className="mt-3 flex items-center justify-between px-3 py-2 text-[10px] font-semibold" style={{borderRadius:`${config.shape.buttonRadius}px`,background:config.colors.primary,color:config.colors.buttonText}}><span className="inline-flex items-center gap-1"><ShoppingBag className="h-3 w-3"/> Mi pedido</span><span>Listo para pedir</span></div>
   </div>
  </div>
 </div>
}
