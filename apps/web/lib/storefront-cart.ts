export type StorefrontCartLine={
  key:string
  product_id:string
  name:string
  image_url:string
  quantity:number
  base_price:number
  unit_price:number
  variant_name:string
  extras:Array<{name:string;price:number}>
  modifier_option_ids?:string[]
  modifiers?:Array<{id:string;name:string;price:number}>
  sale_mode?:'unit'|'weight'|'amount'
  unit_label?:string
  requested_amount?:number
  quantity_step?:number
}

export function cartKey(productID:string,variantName:string,extras:Array<{name:string;price?:number}>,modifierOptionIDs:string[]=[]){
  return [productID,variantName||'',...extras.map(x=>String(x.name||'').trim()).filter(Boolean).sort((a,b)=>a.localeCompare(b,'es')),...modifierOptionIDs.map(x=>`m:${x}`).sort()].join('|')
}

export function roundQuantity(value:number){return Math.round((Number(value)||0)*1000)/1000}

export function mergeCartItem(items:StorefrontCartLine[],next:StorefrontCartLine){
  const found=items.find(x=>x.key===next.key)
  if(!found)return[...items,{...next,quantity:roundQuantity(next.quantity)}]
  return items.map(x=>x.key===next.key?{...x,...next,quantity:roundQuantity(x.quantity+next.quantity)}:x)
}

export function replaceCartItem(items:StorefrontCartLine[],previousKey:string,next:StorefrontCartLine){
  const without=items.filter(x=>x.key!==previousKey)
  return mergeCartItem(without,{...next,quantity:roundQuantity(next.quantity)})
}

export function productCartLines(items:StorefrontCartLine[],productID:string){return items.filter(x=>x.product_id===productID)}
export function productCartQuantity(items:StorefrontCartLine[],productID:string){return roundQuantity(productCartLines(items,productID).reduce((sum,x)=>sum+Number(x.quantity||0),0))}

function num(v:any,fallback:number){const n=Number(v);return Number.isFinite(n)&&n>0?n:fallback}
export function initialProductQuantity(product:any,current?:{quantity?:number}|null){
  const existing=roundQuantity(Number(current?.quantity||0))
  if(existing>0)return existing
  const cfg=weightedSaleConfig(product)
  return cfg.enabled?cfg.minimum:1
}

export function normalizeStoredCart(items:StorefrontCartLine[]){
  if(!Array.isArray(items))return[]
  return items.map(line=>{
    const mode=line.sale_mode||'unit'
    if(mode==='unit')return{...line,quantity:Math.max(1,Math.round(Number(line.quantity)||1)),quantity_step:1}
    return{...line,quantity:roundQuantity(Math.max(0,Number(line.quantity)||0)),quantity_step:Number(line.quantity_step)||undefined}
  }).filter(line=>line.quantity>0)
}

export function weightedSaleConfig(product:any){
  const a=product?.attributes||{}
  const raw=a.wamercio_weighted_sale??a.weighted_sale??a.weightedSale??false
  const enabled=raw===true||String(raw).toLowerCase()==='true'||['libra','lb'].includes(String(a.format||a.formato||a.sale_unit||'').trim().toLowerCase())
  return{
    enabled,
    unit:String(a.wamercio_weight_unit||a.weight_unit||'lb').trim()||'lb',
    increment:num(a.wamercio_weight_increment||a.weight_increment,0.25),
    minimum:num(a.wamercio_min_weight||a.minimum_weight,0.25),
    allowAmount:a.wamercio_allow_amount_sale===undefined?true:!(a.wamercio_allow_amount_sale===false||String(a.wamercio_allow_amount_sale).toLowerCase()==='false'),
  }
}

export function quantityFromAmount(amount:number,unitPrice:number){
  const price=Number(unitPrice)||0
  if(price<=0)return 0
  return roundQuantity((Number(amount)||0)/price)
}

export function formatCartQuantity(quantity:number,unitLabel?:string){
  const q=roundQuantity(quantity)
  const text=Number.isInteger(q)?String(q):q.toLocaleString('es-DO',{maximumFractionDigits:3})
  return unitLabel?`${text} ${unitLabel}`:text
}
