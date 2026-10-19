import {getBusinessCopy} from './business-language'
export type CheckoutFieldType='text'|'number'|'date'|'time'|'textarea'|'select'
export type CheckoutField={
  key:string
  label:string
  type:CheckoutFieldType
  required:boolean
  options:string[]
  placeholder?:string
}

type StoreLike={business_engine?:string;template_config?:Record<string,any>|null}

const allowedFieldTypes=new Set<CheckoutFieldType>(['text','number','date','time','textarea','select'])
const bool=(value:any,fallback=false)=>value===undefined||value===null?fallback:!!value
const text=(value:any,fallback='')=>String(value??fallback).trim()||fallback
const keyify=(value:any)=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'')

export function normalizeCheckoutFields(config:Record<string,any>|null|undefined):CheckoutField[]{
  const raw=Array.isArray(config?.checkout_fields)?config?.checkout_fields:[]
  const seen=new Set<string>()
  const out:CheckoutField[]=[]
  for(const item of raw){
    if(!item||typeof item!=='object')continue
    const type=text(item.type,'text') as CheckoutFieldType
    if(!allowedFieldTypes.has(type))continue
    const key=keyify(item.key||item.label)
    const label=text(item.label||item.key)
    if(!key||!label||seen.has(key))continue
    seen.add(key)
    const options=Array.isArray(item.options)?item.options.map((x:any)=>text(x)).filter(Boolean).slice(0,50):[]
    if(type==='select'&&options.length===0)continue
    out.push({key,label,type,required:!!item.required,options,placeholder:text(item.placeholder,'')||undefined})
    if(out.length>=20)break
  }
  return out
}

export function resolveBusinessCapabilities(store:StoreLike|null|undefined){
  const engine=text(store?.business_engine,'retail').toLowerCase()
  const config=store?.template_config||{}
  const isService=engine==='services'
  const copy=getBusinessCopy(store)
  const quotation=bool(config.quotation,engine==='quotation')
  const wholesale=bool(config.wholesale,engine==='wholesale')
  const personalization=bool(config.personalization,false)
  const appointments=isService&&bool(config.appointments,true)
  const itemLabel=text(config.item_label,copy.catalog_item)
  const itemPlural=text(config.item_label_plural,copy.catalog_items)
  const supportsVariants=bool(config.supports_variants,!isService)
  const supportsExtras=bool(config.supports_extras,engine==='food')
  const supportsDineIn=engine==='food'&&bool(config.supports_dine_in,!bool(config.requires_lead_time,false))
  const checkoutFields=normalizeCheckoutFields(config)
  const configuredAction=text(config.primary_action,appointments?'Solicitar cita':quotation||wholesale?'Solicitar cotización':'Comprar')
  const primaryAction=copy.checkout_action||configuredAction
  const orderNoun=copy.operations_singular
  const orderNounPlural=copy.operations_plural
  const pickupLabel=isService?'En el negocio':'Recoger'
  const pickupDetail=isService?'Atención en el negocio':'Retiro en el negocio'
  const heroLabel=engine==='food'?'MENÚ Y PEDIDOS':engine==='fashion'?'COLECCIÓN':isService?'SERVICIOS':quotation?'CATÁLOGO Y COTIZACIÓN':wholesale?'CATÁLOGO MAYORISTA':'CATÁLOGO'
  const headerSubtitle=engine==='food'?'Menú y pedidos en línea':isService?'Servicios y solicitudes de cita':quotation?'Catálogo y solicitudes':'Catálogo y pedidos en línea'
  return {
    engine,config,isService,quotation,wholesale,personalization,appointments,
    itemLabel,itemPlural,primaryAction,orderNoun,orderNounPlural,copy,requiresPayment:!quotation&&!appointments,
    supportsVariants,supportsExtras,supportsDineIn,
    trackStockDefault:bool(config.track_stock_default,engine==='fashion'||engine==='retail'||engine==='catalog'||engine==='wholesale'),
    supportsDelivery:bool(config.delivery_enabled,!isService),
    supportsPickup:bool(config.pickup_enabled,true),
    requiresLeadTime:bool(config.requires_lead_time,false),
    variantHint:text(config.variant_hint,'Tamaño / Color / Presentación'),
    checkoutFields,pickupLabel,pickupDetail,heroLabel,headerSubtitle,
  }
}
