'use client'

import {useEffect,useMemo,useState} from 'react'
import Link from 'next/link'
import {api,money} from '@/lib/api'
import type {Product,PriceOption,ModifierOption} from '@/lib/types'
import CustomerAccessModal from '@/components/customer-access-modal'
import {resolvedTheme,themeCSSVars,type StoreThemeConfig} from '@/lib/store-themes'
import {Banknote,CalendarClock,Check,ChevronLeft,ChevronRight,Clock3,Gift,Languages,MapPin,MessageCircleMore,Minus,Plus,RefreshCw,Search,ShoppingBag,Star,Store as StoreIcon,Truck,UserRound,UsersRound,UtensilsCrossed,WalletCards,X} from 'lucide-react'
import StorefrontMobileNav from '@/components/storefront-mobile-nav'
import {cartKey,formatCartQuantity,initialProductQuantity,mergeCartItem,normalizeStoredCart,productCartLines,quantityFromAmount,replaceCartItem,roundQuantity,weightedSaleConfig,type StorefrontCartLine} from '@/lib/storefront-cart'
import {resolveBusinessCapabilities} from '@/lib/business-capabilities'

type CartItem=StorefrontCartLine
const payLabel:any={cash_on_delivery:'Tarjeta en terminal',cash:'Efectivo',bank_transfer:'Transferencia electrónica',pending_quote:'Pago por definir'}
const ratioClass:Record<string,string>={'1:1':'aspect-square','4:3':'aspect-[4/3]','3:4':'aspect-[3/4]','16:9':'aspect-video'}
const gridClass:Record<number,string>={1:'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',2:'grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}
type PaymentMethod='cash'|'cash_on_delivery'|'bank_transfer'
type Fulfillment='delivery'|'pickup'|'dine_in'
type LoyaltyState={is_active:boolean;points_per_currency:number;redemption_value:number;min_redeem:number;points_balance:number;total_earned:number;total_redeemed:number}
const paymentMethodOrder:PaymentMethod[]=['cash','cash_on_delivery','bank_transfer']
function paymentMethodsForFulfillment(store:any,fulfillment:string):PaymentMethod[]{
  const globals=store?.payment_methods||{}
  const rules=store?.payment_methods_by_fulfillment||{}
  const mode=rules?.[fulfillment]||{}
  return paymentMethodOrder.filter(method=>!!globals[method]&&mode?.[method]!==false)
}
function buttonStyle(t:StoreThemeConfig,secondary=false):React.CSSProperties{return secondary||t.buttons.variant==='outline'?{background:'transparent',color:t.colors.primary,border:`1px solid ${t.colors.primary}`,borderRadius:t.shape.buttonRadius}:{background:t.buttons.variant==='soft'?t.colors.secondary:t.colors.primary,color:t.buttons.variant==='soft'?t.colors.text:t.colors.buttonText,border:`1px solid ${t.buttons.variant==='soft'?t.colors.secondary:t.colors.primary}`,borderRadius:t.shape.buttonRadius}}
function surfaceStyle(t:StoreThemeConfig):React.CSSProperties{return{background:t.colors.surface,border:`1px solid ${t.colors.border}`,borderRadius:t.shape.radius,boxShadow:'var(--store-shadow)'}}
function productStartingPrice(p:Product){const variants=(p.variants||[]).map(v=>Number(v.price||0)).filter(v=>v>0);return variants.length?Math.min(...variants):Number(p.price||0)}

function reservationInputDefault(){
  const d=new Date(Date.now()+60*60*1000)
  d.setMinutes(Math.ceil(d.getMinutes()/30)*30,0,0)
  const pad=(n:number)=>String(n).padStart(2,'0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function Storefront(){
  const[data,setData]=useState<any>(null)
  const[error,setError]=useState('')
  const[search,setSearch]=useState('')
  const[searchOpen,setSearchOpen]=useState(false)
  const[cat,setCat]=useState('all')
  const[pick,setPick]=useState<Product|null>(null)
  const[variant,setVariant]=useState<PriceOption|null>(null)
  const[extras,setExtras]=useState<PriceOption[]>([])
  const[modifierOptionIDs,setModifierOptionIDs]=useState<string[]>([])
  const[qty,setQty]=useState(1)
  const[purchaseMode,setPurchaseMode]=useState<'weight'|'amount'>('weight')
  const[amountValue,setAmountValue]=useState(0)
  const[editingKey,setEditingKey]=useState('')
  const[productLocale,setProductLocale]=useState('es')
  const[mediaIndex,setMediaIndex]=useState(0)
  const[productReviews,setProductReviews]=useState<any[]>([])
  const[loyalty,setLoyalty]=useState<LoyaltyState|null>(null)
  const[cartNotice,setCartNotice]=useState('')
  const[cart,setCart]=useState<CartItem[]>([])
  const[cartOpen,setCartOpen]=useState(false)
  const[sending,setSending]=useState(false)
  const[done,setDone]=useState<any>(null)
  const[customer,setCustomer]=useState<any>(null)
  const[customerAuthOpen,setCustomerAuthOpen]=useState(false)
  const[form,setForm]=useState({address_id:'',delivery_type:'delivery',shipping_zone_id:'',coupon_code:'',payment_method:'cash_on_delivery',notes:'',needs_change:null as boolean|null,cash_tendered:0,table_id:'',reservation_at:reservationInputDefault(),party_size:2,loyalty_points:0,custom_fields:{} as Record<string,string|number>})
  const[addressPickerOpen,setAddressPickerOpen]=useState(false)
  const[cashOtherOpen,setCashOtherOpen]=useState(false)
  const[perkIndex,setPerkIndex]=useState(0)

  useEffect(()=>{
    api('/public/store').then((x:any)=>{
      setData(x)
      const store=x.store
      const caps=resolveBusinessCapabilities(store)
      const payment=caps.requiresPayment?(paymentMethodsForFulfillment(store,(caps.supportsDelivery&&store.delivery_enabled?'delivery':caps.supportsPickup&&store.pickup_enabled?'pickup':'dine_in'))[0]||''):'pending_quote'
      const delivery=caps.supportsDelivery&&store.delivery_enabled?'delivery':caps.supportsPickup&&store.pickup_enabled?'pickup':caps.supportsDineIn&&store.dine_in_enabled?'dine_in':'pickup'
      setForm(v=>({...v,payment_method:payment,delivery_type:delivery}))
    }).catch(e=>setError(e.message))
  },[])
  useEffect(()=>{if(data?.store?.name)document.title=`${data.store.name} · WAMERCIO`},[data?.store?.name])
  useEffect(()=>{
    if(!data?.store||typeof window==='undefined')return
    const params=new URLSearchParams(window.location.search)
    const tableID=params.get('table')
    if(!tableID)return
    const caps=resolveBusinessCapabilities(data.store)
    const table=(data.tables||[]).find((row:any)=>String(row.id)===String(tableID))
    if(!table||!caps.supportsDineIn||!data.store.dine_in_enabled)return
    setForm(current=>({...current,delivery_type:'dine_in',table_id:String(table.id),party_size:Math.max(1,Math.min(Number(current.party_size||2),Number(table.capacity||1))),reservation_at:current.reservation_at||reservationInputDefault()}))
  },[data])
  useEffect(()=>{
    if(!data?.store)return
    const caps=resolveBusinessCapabilities(data.store)
    if(!caps.requiresPayment)return
    const allowed=paymentMethodsForFulfillment(data.store,form.delivery_type)
    if(!allowed.includes(form.payment_method as PaymentMethod)){
      setForm(v=>({...v,payment_method:allowed[0]||''}))
      setCashOtherOpen(false)
    }
  },[data?.store,form.delivery_type,form.payment_method])
  const applyCustomer=(c:any)=>{setCustomer(c);const primary=Array.isArray(c?.addresses)?(c.addresses.find((a:any)=>a.is_primary)||c.addresses[0]):null;if(primary)setForm(v=>({...v,address_id:primary.id}))}
  const loadCustomer=()=>api<any>('/customer/me').then(applyCustomer).catch(()=>setCustomer(null))
  useEffect(()=>{void loadCustomer()},[])
  useEffect(()=>{
    const storeID=String(data?.store?.id||'')
    if(!customer||!storeID||!data?.loyalty?.is_active){setLoyalty(null);setForm(v=>v.loyalty_points?{...v,loyalty_points:0}:v);return}
    api<LoyaltyState>(`/customer/loyalty?store_id=${storeID}`).then(setLoyalty).catch(()=>setLoyalty(null))
  },[customer?.id,data?.store?.id,data?.loyalty?.is_active])
  useEffect(()=>{
    if(!pick){setProductReviews([]);return}
    api<any[]>(`/public/store/reviews?product_id=${encodeURIComponent(pick.id)}`).then(setProductReviews).catch(()=>setProductReviews([]))
  },[pick?.id])
  useEffect(()=>{try{const v=localStorage.getItem(`wamercio-cart-${window.location.hostname}`);if(v)setCart(normalizeStoredCart(JSON.parse(v)))}catch{}},[])
  useEffect(()=>{if(typeof window!=='undefined')localStorage.setItem(`wamercio-cart-${window.location.hostname}`,JSON.stringify(cart))},[cart])
  useEffect(()=>{if(typeof window!=='undefined'&&window.location.hash==='#pedido')setCartOpen(true)},[])
  useEffect(()=>{
    if(!data?.store)return
    const store=data.store
    const caps=resolveBusinessCapabilities(store)
    const hasFulfillmentPerk=(caps.supportsDelivery&&store.delivery_enabled)||(caps.supportsPickup&&store.pickup_enabled)||(caps.supportsDineIn&&store.dine_in_enabled)
    const count=2+(hasFulfillmentPerk?1:0)+(data?.loyalty?.is_active?1:0)
    setPerkIndex(v=>Math.min(v,count-1))
    if(count<2)return
    const timer=window.setInterval(()=>setPerkIndex(v=>(v+1)%count),3200)
    return()=>window.clearInterval(timer)
  },[data?.store,data?.loyalty?.is_active])
  useEffect(()=>{
    if(typeof document==='undefined')return
    if(!pick&&!done)return
    const previous=document.body.style.overflow
    document.body.style.overflow='hidden'
    return()=>{document.body.style.overflow=previous}
  },[pick,done])

  const products=useMemo(()=>data?.products?.filter((p:Product)=>cat==='all'||p.category_id===cat)||[],[data,cat])
  const categoryById=useMemo(()=>new Map<string,string>((data?.categories||[]).map((c:any)=>[String(c.id),String(c.name)])),[data])
  const searchResults=useMemo(()=>{
    const needle=search.trim().toLowerCase()
    if(!needle||!data?.products)return [] as Product[]
    return (data.products as Product[]).filter(p=>(`${p.name} ${p.description||''} ${p.tag||''} ${categoryById.get(String(p.category_id))||''}`).toLowerCase().includes(needle)).sort((a,b)=>Number(!!b.is_featured)-Number(!!a.is_featured)).slice(0,8)
  },[data,search,categoryById])
  const productMedia=useMemo(()=>{
    if(!pick)return[] as {url:string;alt_text?:string}[]
    const seen=new Set<string>(),out:{url:string;alt_text?:string}[]=[]
    const add=(url?:string,alt_text?:string)=>{const clean=String(url||'').trim();if(clean&&!seen.has(clean)){seen.add(clean);out.push({url:clean,alt_text})}}
    add(pick.image_url,pick.name)
    ;(pick.product_media||[]).forEach(media=>add(media.url,media.alt_text))
    return out
  },[pick])
  const productTranslation=useMemo(()=>pick?.product_translations?.find(item=>item.locale===productLocale)||null,[pick,productLocale])
  const translatedProductName=productTranslation?.name||pick?.name||''
  const translatedProductDescription=productTranslation?.description||pick?.description||''
  const itemCount=cart.reduce((a,x)=>a+((x.sale_mode==='weight'||x.sale_mode==='amount')?1:x.quantity),0)
  const subtotal=cart.reduce((a,x)=>a+x.unit_price*x.quantity,0)
  const zone=data?.shipping_zones?.find((z:any)=>z.id===form.shipping_zone_id)
  const shipping=form.delivery_type==='delivery'?Number(zone?.charge||0):0
  const loyaltyProgram=data?.loyalty||null
  const loyaltyBalance=Number(loyalty?.points_balance||0)
  const loyaltyValue=Number(loyalty?.redemption_value||loyaltyProgram?.redemption_value||0)
  const loyaltyMin=Number(loyalty?.min_redeem||loyaltyProgram?.min_redeem||0)
  const loyaltyRequested=Math.max(0,Math.min(loyaltyBalance,Number(form.loyalty_points||0)))
  const loyaltyDiscount=Math.min(subtotal+shipping,loyaltyRequested*loyaltyValue)
  const loyaltyMaxByOrder=loyaltyValue>0?Math.floor((subtotal+shipping)/loyaltyValue):0
  const loyaltyRedemptionValid=loyaltyRequested===0||(loyaltyRequested>=loyaltyMin&&loyaltyRequested<=loyaltyBalance&&loyaltyRequested<=loyaltyMaxByOrder)
  const total=Math.max(0,subtotal+shipping-loyaltyDiscount)
  const needsCashChangeDecision=form.delivery_type==='delivery'&&form.payment_method==='cash'
  const cashTendered=Number(form.cash_tendered||0)
  const cashChangeValid=!needsCashChangeDecision||form.needs_change===false||(form.needs_change===true&&cashTendered>total)
  const changeSuggestions=[100,200,500,1000,2000].filter(value=>value>total)
  const estimatedChange=Math.max(0,cashTendered-total)
  const selectedAddress=(customer?.addresses||[]).find((a:any)=>a.id===form.address_id)

  const openProduct=(p:Product,line?:CartItem)=>{
    if(p.track_stock&&Number(p.stock||0)<=0)return
    const existing=line?[line]:productCartLines(cart,p.id)
    const current=line||(existing.length===1?existing[0]:undefined)
    const weighted=weightedSaleConfig(p)
    setPick(p)
    setProductLocale('es')
    setMediaIndex(0)
    setEditingKey(current?.key||'')
    setVariant(current?.variant_name?(p.variants||[]).find(v=>v.name===current.variant_name)||p.variants?.[0]||null:p.variants?.[0]||null)
    setExtras(current?.extras||[])
    setModifierOptionIDs(current?.modifier_option_ids||[])
    setPurchaseMode(current?.sale_mode==='amount'?'amount':'weight')
    setQty(initialProductQuantity(p,current))
    setAmountValue(Number(current?.requested_amount||0))
  }
  const closeProduct=()=>{setPick(null);setEditingKey('')}
  const openCartItem=(line:CartItem)=>{
    const product=(data?.products||[]).find((p:Product)=>p.id===line.product_id)
    if(!product)return
    openProduct(product,line)
  }
  const openSearchProduct=(p:Product)=>{
    setSearchOpen(false)
    setSearch('')
    openProduct(p)
  }
  const toggleExtra=(x:PriceOption)=>setExtras(v=>v.some(y=>y.name===x.name)?v.filter(y=>y.name!==x.name):[...v,x])
  const toggleModifier=(group:any,option:ModifierOption)=>setModifierOptionIDs(current=>{const optionIDs=new Set((group.options||[]).map((x:any)=>x.id));const groupSelected=current.filter(id=>optionIDs.has(id));if(current.includes(option.id))return current.filter(id=>id!==option.id);const max=Math.max(1,Number(group.max_select||1));if(groupSelected.length>=max){const remove=new Set(groupSelected.slice(0,groupSelected.length-max+1));return [...current.filter(id=>!remove.has(id)),option.id]}return [...current,option.id]})
  const selectedModifiers=useMemo(()=>{if(!pick)return[] as {id:string;name:string;price:number}[];const selected=new Set(modifierOptionIDs);return (pick.modifier_groups||[]).flatMap(group=>(group.options||[]).filter(o=>selected.has(o.id)).map(o=>({id:o.id,name:`${group.name}: ${o.name}`,price:Number(o.price_delta||0)})))},[pick,modifierOptionIDs])
  const modifierValid=useMemo(()=>!pick||(pick.modifier_groups||[]).every(group=>{const ids=new Set((group.options||[]).map(o=>o.id));const count=modifierOptionIDs.filter(id=>ids.has(id)).length;return count>=Number(group.min_select||0)&&count<=Number(group.max_select||1)}),[pick,modifierOptionIDs])
  const weighted=pick?weightedSaleConfig(pick):{enabled:false,unit:'lb',increment:0.25,minimum:0.25,allowAmount:true}
  const unit=pick?(Number(variant?.price||0)>0?Number(variant?.price):pick.price)+extras.reduce((a,x)=>a+Number(x.price||0),0)+selectedModifiers.reduce((a,x)=>a+Number(x.price||0),0):0
  const selectedQuantity=weighted.enabled&&purchaseMode==='amount'?quantityFromAmount(amountValue||unit,unit):roundQuantity(qty)
  const selectionTotal=weighted.enabled&&purchaseMode==='amount'?Number(amountValue||unit):unit*selectedQuantity
  const resetAsNewCombination=()=>{
    if(!pick)return
    const cfg=weightedSaleConfig(pick)
    setEditingKey('')
    setVariant(pick.variants?.[0]||null)
    setExtras([])
    setModifierOptionIDs([])
    setPurchaseMode('weight')
    setQty(cfg.enabled?cfg.minimum:1)
    setAmountValue(0)
  }
  const saveProductSelection=()=>{
    if(!pick||selectedQuantity<=0)return
    if(!modifierValid){setCartNotice('Completa las opciones obligatorias');window.setTimeout(()=>setCartNotice(''),1800);return}
    const key=cartKey(pick.id,variant?.name||'',extras,modifierOptionIDs)
    const next:CartItem={key,product_id:pick.id,name:pick.name,image_url:pick.image_url,quantity:selectedQuantity,base_price:pick.price,unit_price:unit,variant_name:variant?.name||'',extras,modifier_option_ids:modifierOptionIDs,modifiers:selectedModifiers,sale_mode:weighted.enabled?(purchaseMode==='amount'?'amount':'weight'):'unit',unit_label:weighted.enabled?weighted.unit:undefined,requested_amount:weighted.enabled&&purchaseMode==='amount'?Number(amountValue||selectionTotal):undefined,quantity_step:weighted.enabled?weighted.increment:1}
    setCart(v=>editingKey?replaceCartItem(v,editingKey,next):mergeCartItem(v,next))
    setCartNotice(editingKey?'Compra actualizada':'Agregado a tu compra')
    window.setTimeout(()=>setCartNotice(''),1800)
    setPick(null)
    setEditingKey('')
  }
  const changeQty=(key:string,d:number)=>setCart(v=>v.map(x=>x.key===key?{...x,quantity:roundQuantity(Math.max(0,x.quantity+d*Number(x.quantity_step||1)))}:x).filter(x=>x.quantity>0))
  const closeCart=()=>{setCartOpen(false);setError('')}
  const send=async(e:React.FormEvent)=>{
    e.preventDefault()
    if(!cart.length)return
    if(!customer){setCustomerAuthOpen(true);return}
    const missingField=capabilities.checkoutFields.find(field=>field.required&&String(form.custom_fields[field.key]??'').trim()==='')
    if(missingField){setError(`Completa ${missingField.label} para continuar`);return}
    setSending(true);setError('')
    try{
      const payload={...form,address_id:form.delivery_type==='delivery'?form.address_id:'',shipping_zone_id:form.delivery_type==='delivery'?form.shipping_zone_id:'',table_id:form.delivery_type==='dine_in'?form.table_id:'',reservation_at:form.delivery_type==='dine_in'&&form.reservation_at?new Date(form.reservation_at).toISOString():'',party_size:form.delivery_type==='dine_in'?form.party_size:0,needs_change:needsCashChangeDecision?form.needs_change:false,cash_tendered:needsCashChangeDecision&&form.needs_change?cashTendered:null,items:cart.map(x=>({product_id:x.product_id,quantity:x.quantity,variant_name:x.variant_name,extras:x.extras,modifier_option_ids:x.modifier_option_ids||[]}))}
      const out=await api('/public/store/checkout',{method:'POST',body:JSON.stringify(payload)})
      setDone(out);setCart([]);setCartOpen(false);setCashOtherOpen(false);setForm(v=>({...v,needs_change:null,cash_tendered:0,loyalty_points:0,custom_fields:{},notes:''}));setLoyalty((current:LoyaltyState|null)=>current?{...current,points_balance:Math.max(0,Number(current.points_balance||0)-loyaltyRequested)}:current)
    }catch(e:any){
      const message=e.message||'No pudimos confirmar el pedido'
      setError(message)
      if(/sesión|Inicia sesión/i.test(message)){setCustomer(null);setCustomerAuthOpen(true)}
    }finally{setSending(false)}
  }

  if(error&&!data)return <div className="grid min-h-screen place-items-center bg-[#fafbfe] p-6"><div className="card max-w-md p-8 text-center"><StoreIcon className="mx-auto h-10 w-10 text-slate-300"/><h1 className="mt-4 text-xl font-bold">Tienda no disponible</h1><p className="mt-2 text-sm text-[#8d92aa]">{error}</p></div></div>
  if(!data)return <div className="grid min-h-screen place-items-center text-[#a2a6b8]">Cargando tienda...</div>

  const s=data.store
  const capabilities=resolveBusinessCapabilities(s)
  const minimum=Number(s.minimum_order||0)
  const minimumMissing=Math.max(0,minimum-subtotal)
  const methods=s.payment_methods||{}
  const paymentOptions=capabilities.requiresPayment?paymentMethodsForFulfillment(s,form.delivery_type):[]
  const canOrder=s.accepting_orders!==false&&s.open_now!==false
  const{preset,config:t}=resolvedTheme(s.visual_theme,s.theme_config,s.primary_color)
  const vars=themeCSSVars(t) as React.CSSProperties
  const pageBackground=t.background.type==='gradient'?t.background.value:t.colors.background
  const heroHeight=t.hero.height==='compact'?'min-h-[170px]':t.hero.height==='large'?'min-h-[360px] sm:min-h-[430px]':'min-h-[260px] sm:min-h-[320px]'
  const heroTextDark=t.hero.variant==='editorial'
  const heroBase:React.CSSProperties=t.hero.variant==='editorial'?{background:t.colors.surface,color:t.colors.text,border:`1px solid ${t.colors.border}`}:{background:`linear-gradient(135deg,${t.colors.primary},${t.colors.secondary})`,color:'#fff'}
  const catButton=(active:boolean):React.CSSProperties=>t.categories.variant==='underline'?{color:active?t.colors.primary:t.colors.muted,borderBottom:`2px solid ${active?t.colors.primary:'transparent'}`}:{background:active?t.colors.primary:t.colors.surface,color:active?t.colors.buttonText:t.colors.muted,border:`1px solid ${active?t.colors.primary:t.colors.border}`,borderRadius:t.categories.variant==='cards'?Math.max(8,t.shape.radius/2):999}
  const activeCategory=data.categories.find((c:any)=>c.id===cat)
  const itemPlural=capabilities.itemPlural
  const heroLabel=capabilities.heroLabel
  const headerSubtitle=capabilities.headerSubtitle
  const perks=[
    canOrder?{title:'Recibiendo pedidos',detail:'Puedes ordenar ahora',icon:Check}:{title:'Solo catálogo',detail:'Pedidos no disponibles',icon:Clock3},
    capabilities.supportsDelivery&&s.delivery_enabled?{title:'Delivery',detail:'Entrega a domicilio',icon:Truck}:capabilities.supportsPickup&&s.pickup_enabled?{title:capabilities.pickupLabel,detail:capabilities.pickupDetail,icon:StoreIcon}:capabilities.supportsDineIn&&s.dine_in_enabled?{title:'Mesas',detail:'Reserva y come aquí',icon:UtensilsCrossed}:null,
    minimum>0?{title:`Mínimo ${money(minimum)}`,detail:'Para completar el pedido',icon:ShoppingBag}:{title:'Compra fácil',detail:'Agrega y confirma',icon:ShoppingBag},
    data?.loyalty?.is_active?{title:'Puntos WAMERCIO',detail:customer&&loyalty?`${Number(loyalty.points_balance||0).toLocaleString('es-DO')} puntos disponibles`:'Acumula con tus compras',icon:Gift}:null,
  ].filter(Boolean) as {title:string;detail:string;icon:any}[]

  const searchBox=<div data-testid="storefront-top-search" className="relative col-span-3 row-start-2 min-w-0 md:col-span-1 md:row-start-auto md:w-full md:max-w-xl">
    <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2" style={{color:t.colors.muted}}/>
    <input
      id="storefront-search"
      value={search}
      onChange={e=>{setSearch(e.target.value);setSearchOpen(true)}}
      onFocus={()=>setSearchOpen(true)}
      onBlur={()=>window.setTimeout(()=>setSearchOpen(false),120)}
      onKeyDown={e=>{if(e.key==='Escape'){setSearchOpen(false);(e.currentTarget as HTMLInputElement).blur()}}}
      placeholder={`Buscar ${itemPlural}...`}
      className="w-full rounded-2xl py-2.5 pl-10 pr-4 text-sm outline-none transition focus:ring-4"
      style={{background:t.colors.background,border:`1px solid ${t.colors.border}`,color:t.colors.text}}
      autoComplete="off"
    />
    {searchOpen&&search.trim()&&<div data-testid="storefront-search-results" className="absolute inset-x-0 top-[calc(100%+8px)] z-50 max-h-[min(420px,60vh)] overflow-y-auto rounded-2xl border p-2 shadow-2xl" style={{background:t.colors.surface,borderColor:t.colors.border}}>
      {searchResults.length>0?<div className="space-y-1">{searchResults.map(p=>{
        const category=categoryById.get(String(p.category_id))||capabilities.itemLabel
        return <button key={p.id} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>openSearchProduct(p)} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-black/[.035] focus:outline-none focus-visible:ring-2" style={{color:t.colors.text}}>
          <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl" style={{background:t.colors.background}}>{p.image_url?<img src={p.image_url} alt="" className="h-full w-full object-cover"/>:<StoreIcon className="h-5 w-5 opacity-25"/>}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="mt-0.5 block truncate text-[11px]" style={{color:t.colors.muted}}>{category}</span></span>
          <span className="shrink-0 text-right"><strong className="block text-sm" style={{color:t.colors.primary}}>{p.variants?.length?'Desde ':''}{money(productStartingPrice(p))}</strong><span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold" style={{color:t.colors.muted}}>Ver <ChevronRight className="h-3 w-3"/></span></span>
        </button>
      })}</div>:<div className="px-4 py-6 text-center"><Search className="mx-auto h-6 w-6 opacity-20"/><p className="mt-2 text-sm font-semibold">No encontramos coincidencias</p><p className="mt-1 text-xs" style={{color:t.colors.muted}}>Prueba con otro nombre, categoría o palabra.</p></div>}
    </div>}
  </div>

  const updateCustomField=(key:string,value:string|number)=>setForm(v=>({...v,custom_fields:{...v.custom_fields,[key]:value}}))
  const cartCustomFields=capabilities.checkoutFields.length>0?<section data-testid="storefront-context-fields" className="p-3.5 sm:p-4" style={{...surfaceStyle(t),boxShadow:'none'}}>
    <div className="text-[10px] font-bold uppercase tracking-[.14em]" style={{color:t.colors.primary}}>Datos para tu {capabilities.orderNoun}</div>
    <p className="mt-1 text-xs" style={{color:t.colors.muted}}>Completa únicamente la información que este tipo de negocio necesita.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">{capabilities.checkoutFields.map(field=>{
      const value=form.custom_fields[field.key]??''
      const common={required:field.required,className:'field',value,onChange:(e:any)=>updateCustomField(field.key,field.type==='number'?Number(e.target.value):e.target.value)}
      return <div key={field.key} className={field.type==='textarea'?'sm:col-span-2':''}><label className="label">{field.label}{field.required?' *':''}</label>{field.type==='textarea'?<textarea {...common} className="field min-h-20" placeholder={field.placeholder||''}/>:field.type==='select'?<select {...common}><option value="">Selecciona una opción</option>{field.options.map(option=><option key={option} value={option}>{option}</option>)}</select>:<input {...common} type={field.type} placeholder={field.placeholder||''}/>}</div>
    })}</div>
  </section>:null

  const cartNotes=<section data-testid="storefront-cart-notes" className="p-3.5 sm:p-4" style={{...surfaceStyle(t),boxShadow:'none'}}><div className="text-[10px] font-bold uppercase tracking-[.14em]" style={{color:t.colors.primary}}>Notas</div><label className="label mt-2">Indicaciones para el pedido <span className="font-normal" style={{color:t.colors.muted}}>(opcional)</span></label><textarea className="field min-h-20" placeholder="Ej.: llamar al llegar, sin servilletas..." value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></section>

  const cartProducts=<section data-testid="storefront-cart-products" className="space-y-4">
    <div data-testid="storefront-cart-header" className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" style={surfaceStyle(t)}>
      <div><p className="text-[10px] font-bold uppercase tracking-[.14em]" style={{color:t.colors.primary}}>Mi compra</p><h1 className="mt-1 text-2xl font-semibold sm:text-3xl" style={{fontFamily:'var(--store-heading-font)'}}>Mi compra</h1><p className="mt-1 text-sm" style={{color:t.colors.muted}}>{itemCount} {itemCount===1?`${capabilities.itemLabel} agregado`:`${capabilities.itemPlural} agregados`}</p></div>
      <button data-testid="storefront-cart-back-catalog" type="button" onClick={closeCart} className="inline-flex w-fit items-center gap-2 px-3.5 py-2.5 text-sm font-semibold" style={buttonStyle(t,true)}><StoreIcon className="h-4 w-4"/>Seguir comprando</button>
    </div>
    <div className="space-y-2.5 sm:space-y-3">{cart.map(x=><article data-testid="storefront-cart-item" key={x.key} className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-x-3 p-3 sm:flex sm:gap-3 sm:p-4" style={surfaceStyle(t)}>
      <button type="button" data-testid="edit-cart-item" onClick={()=>openCartItem(x)} className="h-16 w-16 shrink-0 overflow-hidden text-left sm:h-20 sm:w-20" style={{borderRadius:Math.max(8,t.shape.radius-8),background:t.colors.background}}>{x.image_url?<img src={x.image_url} alt="" className="h-full w-full object-cover"/>:<StoreIcon className="m-5 h-6 w-6 opacity-20 sm:m-6 sm:h-7 sm:w-7"/>}</button>
      <div className="min-w-0 flex-1"><button type="button" onClick={()=>openCartItem(x)} className="block max-w-full text-left"><div className="truncate text-sm font-semibold sm:text-base">{x.name}</div>{x.variant_name&&<div className="mt-0.5 truncate text-[11px] sm:text-xs" style={{color:t.colors.muted}}>{x.variant_name}</div>}{(x.extras.length>0||(x.modifiers||[]).length>0)&&<div className="mt-0.5 line-clamp-1 text-[10px] sm:line-clamp-2 sm:text-[11px]" style={{color:t.colors.muted}}>{[...x.extras.map(y=>y.name),...(x.modifiers||[]).map(y=>y.name)].join(', ')}</div>}</button><div className="mt-1.5 flex items-center gap-2 sm:mt-2 sm:gap-3"><span className="text-sm font-bold sm:text-base" style={{color:t.colors.primary}}>{money(x.unit_price*x.quantity)}</span><button type="button" onClick={()=>openCartItem(x)} className="text-[11px] font-semibold sm:text-xs" style={{color:t.colors.primary}}>Editar</button></div></div>
      <div className="flex flex-col items-end gap-1.5 self-center sm:flex-row sm:items-center sm:gap-2">{x.sale_mode==='weight'||x.sale_mode==='amount'?<button type="button" onClick={()=>openCartItem(x)} className="px-2.5 py-1.5 text-[11px] font-bold sm:px-3 sm:py-2 sm:text-xs" style={{background:t.colors.background,color:t.colors.primary,border:`1px solid ${t.colors.border}`,borderRadius:t.shape.buttonRadius}}>{formatCartQuantity(x.quantity,x.unit_label)}</button>:<div className="flex h-9 items-center sm:h-10" style={{border:`1px solid ${t.colors.border}`,borderRadius:t.shape.buttonRadius}}><button type="button" aria-label="Restar cantidad" className="p-2 sm:p-2.5" onClick={()=>changeQty(x.key,-1)}><Minus className="h-3.5 w-3.5"/></button><span className="w-7 text-center text-xs font-bold sm:w-8 sm:text-sm">{formatCartQuantity(x.quantity)}</span><button type="button" aria-label="Sumar cantidad" className="p-2 sm:p-2.5" onClick={()=>changeQty(x.key,1)}><Plus className="h-3.5 w-3.5"/></button></div>}<button type="button" aria-label={`Eliminar ${x.name}`} onClick={()=>setCart(v=>v.filter(line=>line.key!==x.key))} className="grid h-8 w-8 place-items-center sm:h-10 sm:w-10" style={{background:'#fff1f2',color:'#e11d48',borderRadius:Math.max(6,t.shape.buttonRadius-4)}}><X className="h-3.5 w-3.5 sm:h-4 sm:w-4"/></button></div>
    </article>)}</div>
    {cartCustomFields}
    {cartNotes}
  </section>

  const checkoutColumn=<div className="space-y-4">
    {!customer&&<button type="button" onClick={()=>setCustomerAuthOpen(true)} className="flex w-full items-center gap-3 p-4 text-left" style={{...surfaceStyle(t),boxShadow:'none'}}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{background:t.colors.background,color:t.colors.primary}}><UserRound className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold">Identifícate para finalizar</span><span className="mt-0.5 block text-xs" style={{color:t.colors.muted}}>Usaremos tus direcciones guardadas y datos de cliente.</span></span><ChevronRight className="h-4 w-4 shrink-0" style={{color:t.colors.primary}}/></button>}
    <form id="storefront-checkout-form" onSubmit={send} className="space-y-4">
      {error&&<div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {s.checkout_message&&<div className="p-3 text-sm" style={{background:t.colors.background,borderRadius:t.shape.buttonRadius,color:t.colors.text}}>{s.checkout_message}</div>}

      <section data-testid="storefront-cart-step-delivery" className="p-4" style={{...surfaceStyle(t),boxShadow:'none'}}>
        <div className="mb-3"><div className="text-[10px] font-bold uppercase tracking-[.14em]" style={{color:t.colors.primary}}>1 · Modalidad de pedido</div><div className="mt-1 text-sm font-semibold">¿Cómo recibirás tu pedido?</div></div>
        <div className={`grid gap-2 ${capabilities.supportsDineIn&&s.dine_in_enabled?'grid-cols-2 sm:grid-cols-3':'grid-cols-2'}`}>
          {capabilities.supportsDelivery&&s.delivery_enabled&&<button type="button" onClick={()=>setForm({...form,delivery_type:'delivery',needs_change:null,cash_tendered:0})} className="relative p-3 text-left" style={{...surfaceStyle(t),boxShadow:'none',borderColor:form.delivery_type==='delivery'?t.colors.primary:t.colors.border,background:form.delivery_type==='delivery'?t.colors.background:t.colors.surface}}><Truck className="h-4 w-4" style={{color:t.colors.primary}}/><div className="mt-2 text-sm font-bold">Delivery</div><div className="text-[11px]" style={{color:t.colors.muted}}>Entrega a domicilio</div>{form.delivery_type==='delivery'&&<Check className="absolute right-3 top-3 h-4 w-4" style={{color:t.colors.primary}}/>}</button>}
          {capabilities.supportsPickup&&s.pickup_enabled&&<button type="button" onClick={()=>{setForm({...form,delivery_type:'pickup',shipping_zone_id:'',needs_change:null,cash_tendered:0});setCashOtherOpen(false);setAddressPickerOpen(false)}} className="relative p-3 text-left" style={{...surfaceStyle(t),boxShadow:'none',borderColor:form.delivery_type==='pickup'?t.colors.primary:t.colors.border,background:form.delivery_type==='pickup'?t.colors.background:t.colors.surface}}><StoreIcon className="h-4 w-4" style={{color:t.colors.primary}}/><div className="mt-2 text-sm font-bold">{capabilities.pickupLabel}</div><div className="text-[11px]" style={{color:t.colors.muted}}>{capabilities.pickupDetail}</div>{form.delivery_type==='pickup'&&<Check className="absolute right-3 top-3 h-4 w-4" style={{color:t.colors.primary}}/>}</button>}
          {capabilities.supportsDineIn&&s.dine_in_enabled&&<button type="button" onClick={()=>{setForm({...form,delivery_type:'dine_in',shipping_zone_id:'',needs_change:null,cash_tendered:0,reservation_at:form.reservation_at||reservationInputDefault()});setCashOtherOpen(false);setAddressPickerOpen(false)}} className="relative p-3 text-left" style={{...surfaceStyle(t),boxShadow:'none',borderColor:form.delivery_type==='dine_in'?t.colors.primary:t.colors.border,background:form.delivery_type==='dine_in'?t.colors.background:t.colors.surface}}><UtensilsCrossed className="h-4 w-4" style={{color:t.colors.primary}}/><div className="mt-2 text-sm font-bold">Mesa</div><div className="text-[11px]" style={{color:t.colors.muted}}>Reservar y comer aquí</div>{form.delivery_type==='dine_in'&&<Check className="absolute right-3 top-3 h-4 w-4" style={{color:t.colors.primary}}/>}</button>}
        </div>
        {form.delivery_type==='delivery'?customer?<div className="mt-3 space-y-3">
          {selectedAddress&&!addressPickerOpen?<div data-testid="storefront-selected-address" className="flex items-start gap-3 rounded-xl p-3" style={{background:t.colors.background}}><MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{color:t.colors.primary}}/><div className="min-w-0 flex-1"><div className="text-[10px] font-bold uppercase tracking-wide" style={{color:t.colors.muted}}>Dirección de entrega</div><div className="mt-1 truncate text-sm font-semibold">{selectedAddress.label}</div><div className="mt-0.5 line-clamp-2 text-xs" style={{color:t.colors.muted}}>{selectedAddress.formatted}</div></div><button type="button" onClick={()=>setAddressPickerOpen(true)} className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold" style={{background:t.colors.surface,color:t.colors.primary}}>Cambiar</button></div>:<div><div className="mb-1 flex items-center justify-between"><label className="label">Dirección de entrega *</label><Link href="/cliente/perfil" className="text-[11px] font-semibold" style={{color:t.colors.primary}}>Administrar</Link></div><select className="field" required value={form.address_id} onChange={e=>{setForm({...form,address_id:e.target.value});if(e.target.value)setAddressPickerOpen(false)}}><option value="">Selecciona una dirección</option>{(customer?.addresses||[]).map((a:any)=><option key={a.id} value={a.id}>{a.label} · {a.formatted}</option>)}</select></div>}
        </div>:<button type="button" onClick={()=>setCustomerAuthOpen(true)} className="mt-3 flex w-full items-center gap-3 rounded-xl p-3 text-left" style={{background:t.colors.background}}><MapPin className="h-4 w-4 shrink-0" style={{color:t.colors.primary}}/><span className="text-xs font-semibold">Inicia sesión para seleccionar una dirección de entrega.</span><ChevronRight className="ml-auto h-4 w-4"/></button>:form.delivery_type==='dine_in'?<div data-testid="storefront-table-reservation" className="mt-3 space-y-3 rounded-xl p-3" style={{background:t.colors.background}}><div className="flex items-start gap-2"><CalendarClock className="mt-0.5 h-4 w-4 shrink-0" style={{color:t.colors.primary}}/><div><div className="text-[10px] font-bold uppercase tracking-wide" style={{color:t.colors.muted}}>Reservar mesa</div><div className="mt-1 text-xs font-semibold">{s.address||'Reserva para comer en el negocio.'}</div></div></div><div className="grid gap-2 sm:grid-cols-2"><div><label className="label text-[11px]">Fecha y hora *</label><input type="datetime-local" required className="field" value={form.reservation_at} onChange={e=>setForm({...form,reservation_at:e.target.value})}/></div><div><label className="label text-[11px]">Personas *</label><div className="relative"><UsersRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{color:t.colors.primary}}/><input type="number" min="1" max="50" required className="field pl-9" value={form.party_size} onChange={e=>{const n=Math.max(1,Number(e.target.value)||1);setForm({...form,party_size:n,table_id:(data.tables||[]).some((x:any)=>x.id===form.table_id&&Number(x.capacity)>=n)?form.table_id:''})}}/></div></div></div><div><label className="label text-[11px]">Mesa *</label><select required className="field" value={form.table_id} onChange={e=>setForm({...form,table_id:e.target.value})}><option value="">Selecciona una mesa</option>{(data.tables||[]).filter((x:any)=>Number(x.capacity)>=Number(form.party_size||1)).map((table:any)=><option key={table.id} value={table.id}>{table.area_name?`${table.area_name} · `:''}{table.name} · hasta {table.capacity} personas</option>)}</select>{(data.tables||[]).filter((x:any)=>Number(x.capacity)>=Number(form.party_size||1)).length===0&&<p className="mt-1 text-[11px] text-amber-700">No hay una mesa disponible con esa capacidad.</p>}</div></div>:<div className="mt-3 flex items-start gap-3 rounded-xl p-3" style={{background:t.colors.background}}><MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{color:t.colors.primary}}/><div><div className="text-[10px] font-bold uppercase tracking-wide" style={{color:t.colors.muted}}>Dirección de recogida</div><div className="mt-1 text-xs font-semibold">{s.address||'Coordina la recogida directamente con el negocio.'}</div></div></div>}
      </section>

      {capabilities.requiresPayment?<>
      <section data-testid="storefront-cart-step-payment" className="p-4" style={{...surfaceStyle(t),boxShadow:'none'}}>
        <div className="mb-3"><div className="text-[10px] font-bold uppercase tracking-[.14em]" style={{color:t.colors.primary}}>2 · Método de pago</div><div className="mt-1 text-sm font-semibold">Selecciona cómo pagarás</div></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{paymentOptions.map(k=><button data-testid="storefront-payment-option" type="button" key={k} onClick={()=>{setForm({...form,payment_method:k,needs_change:k==='cash'?form.needs_change:null,cash_tendered:k==='cash'?form.cash_tendered:0});if(k!=='cash')setCashOtherOpen(false)}} className="relative flex items-center gap-2.5 p-3 text-left" style={{...surfaceStyle(t),boxShadow:'none',borderColor:form.payment_method===k?t.colors.primary:t.colors.border,background:form.payment_method===k?t.colors.background:t.colors.surface}}><WalletCards className="h-4 w-4 shrink-0" style={{color:t.colors.primary}}/><span className="text-sm font-bold">{payLabel[k]}</span>{form.payment_method===k&&<Check className="ml-auto h-4 w-4" style={{color:t.colors.primary}}/>}</button>)}</div>
        {form.payment_method==='bank_transfer'&&<div className="mt-3 rounded-xl p-3" style={{background:t.colors.background}}><div className="flex items-center gap-2 text-sm font-bold"><WalletCards className="h-4 w-4" style={{color:t.colors.primary}}/>Datos para transferencia</div><div className="mt-2 grid gap-1.5 text-xs"><div><span style={{color:t.colors.muted}}>Banco:</span> {s.bank_transfer?.bank_name||'Consultar al comercio'}</div><div><span style={{color:t.colors.muted}}>Cuenta:</span> {s.bank_transfer?.account_number||'—'}</div><div><span style={{color:t.colors.muted}}>Titular:</span> {s.bank_transfer?.account_name||'—'}</div><div><span style={{color:t.colors.muted}}>Tipo:</span> {s.bank_transfer?.account_type||'—'}</div></div></div>}
        {needsCashChangeDecision&&<div data-testid="storefront-cash-change" className="mt-3 rounded-2xl p-3" style={{background:`color-mix(in srgb, ${t.colors.primary} 7%, ${t.colors.surface})`,border:`1px solid color-mix(in srgb, ${t.colors.primary} 30%, ${t.colors.border})`}}>
          <div className="flex items-start gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl" style={{background:t.colors.surface,color:t.colors.primary}}><RefreshCw className="h-4 w-4"/></span><div><div className="text-sm font-bold">¿Necesita cambio?</div><div className="mt-0.5 text-[11px] leading-4" style={{color:t.colors.muted}}>Ayuda al repartidor a llevar el vuelto correcto antes de salir.</div></div></div>
          <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={()=>{setForm({...form,needs_change:true});if(!cashTendered)setCashOtherOpen(false)}} className="rounded-xl px-3 py-2 text-xs font-bold" style={{background:form.needs_change===true?t.colors.primary:t.colors.surface,color:form.needs_change===true?t.colors.buttonText:t.colors.text,border:`1px solid ${form.needs_change===true?t.colors.primary:t.colors.border}`}}>Sí</button><button type="button" onClick={()=>{setForm({...form,needs_change:false,cash_tendered:0});setCashOtherOpen(false)}} className="rounded-xl px-3 py-2 text-xs font-bold" style={{background:form.needs_change===false?t.colors.primary:t.colors.surface,color:form.needs_change===false?t.colors.buttonText:t.colors.text,border:`1px solid ${form.needs_change===false?t.colors.primary:t.colors.border}`}}>No</button></div>
          {form.needs_change===true&&<><p className="mt-3 text-[11px]" style={{color:t.colors.muted}}>Selecciona una sugerencia o introduce el monto exacto con el que pagarás.</p><div className="mt-2 grid grid-cols-2 gap-2">{changeSuggestions.map(value=><button key={value} type="button" onClick={()=>{setForm({...form,cash_tendered:value});setCashOtherOpen(false)}} className="rounded-xl px-3 py-2 text-xs font-bold" style={{background:cashTendered===value&&!cashOtherOpen?t.colors.primary:t.colors.surface,color:cashTendered===value&&!cashOtherOpen?t.colors.buttonText:t.colors.text,border:`1px solid ${cashTendered===value&&!cashOtherOpen?t.colors.primary:t.colors.border}`}}>{money(value)}</button>)}<button type="button" onClick={()=>{setCashOtherOpen(true);if(changeSuggestions.includes(cashTendered))setForm({...form,cash_tendered:0})}} className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold" style={{background:cashOtherOpen?t.colors.primary:t.colors.surface,color:cashOtherOpen?t.colors.buttonText:t.colors.text,border:`1px solid ${cashOtherOpen?t.colors.primary:t.colors.border}`}}><Banknote className="h-3.5 w-3.5"/>Otro</button></div>{cashOtherOpen&&<div className="mt-2 flex items-center gap-2 rounded-xl px-3" style={{background:t.colors.surface,border:`1px solid ${t.colors.border}`}}><span className="text-xs font-bold" style={{color:t.colors.primary}}>RD$</span><input aria-label="Monto con que pagarás" inputMode="decimal" type="number" min={Math.floor(total)+1} step="1" value={form.cash_tendered||''} onChange={e=>setForm({...form,cash_tendered:Math.max(0,Number(e.target.value))})} className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-sm font-bold outline-none" placeholder="Monto"/></div>}<div className="mt-2 flex items-center justify-between rounded-xl px-3 py-2 text-[11px]" style={{background:t.colors.surface}}><span style={{color:t.colors.muted}}>Vuelto estimado</span><strong style={{color:t.colors.primary}}>{cashTendered>total?money(estimatedChange):'—'}</strong></div></>}
          {form.needs_change===false&&<div className="mt-2 rounded-xl px-3 py-2 text-[11px] font-semibold" style={{background:t.colors.surface,color:t.colors.primary}}>El cliente pagará el monto exacto: {money(total)}.</div>}
        </div>}
      </section>
      </>:<section data-testid="storefront-cart-step-payment" className="p-4" style={{...surfaceStyle(t),boxShadow:'none'}}><div className="text-[10px] font-bold uppercase tracking-[.14em]" style={{color:t.colors.primary}}>2 · Cotización</div><div className="mt-1 text-sm font-semibold">El pago se coordina después</div><p className="mt-1 text-xs leading-5" style={{color:t.colors.muted}}>Envía tu solicitud con los detalles necesarios. El negocio confirmará disponibilidad, precio final y forma de pago por WhatsApp.</p></section>}

      {customer&&loyaltyProgram?.is_active&&<section data-testid="storefront-loyalty" className="p-4" style={{...surfaceStyle(t),boxShadow:'none'}}><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{background:t.colors.background,color:t.colors.primary}}><Gift className="h-4 w-4"/></span><div className="min-w-0 flex-1"><div className="text-[10px] font-bold uppercase tracking-[.14em]" style={{color:t.colors.primary}}>Fidelización</div><div className="mt-1 text-sm font-semibold">Tienes {loyaltyBalance.toLocaleString('es-DO')} puntos</div><p className="mt-0.5 text-[11px] leading-4" style={{color:t.colors.muted}}>Cada punto vale {money(loyaltyValue)}. {loyaltyMin>0?`Canje mínimo: ${loyaltyMin.toLocaleString('es-DO')} puntos.`:''}</p></div></div>{loyaltyBalance>=loyaltyMin&&loyaltyValue>0?<div className="mt-3"><div className="flex items-center justify-between gap-3"><label className="label text-[11px]">Puntos a canjear</label><button type="button" onClick={()=>setForm({...form,loyalty_points:Math.min(loyaltyBalance,loyaltyMaxByOrder)})} className="text-[11px] font-bold" style={{color:t.colors.primary}}>Usar máximo</button></div><div className="flex items-center gap-2"><input aria-label="Puntos a canjear" className="field" type="number" min="0" max={Math.min(loyaltyBalance,loyaltyMaxByOrder)} step="1" value={form.loyalty_points||''} onChange={e=>setForm({...form,loyalty_points:Math.max(0,Math.floor(Number(e.target.value)||0))})} placeholder="0"/>{loyaltyRequested>0&&<button type="button" onClick={()=>setForm({...form,loyalty_points:0})} className="rounded-xl px-3 py-2 text-xs font-bold" style={{background:t.colors.background,color:t.colors.primary}}>Quitar</button>}</div>{loyaltyRequested>0&&<div className={`mt-2 rounded-xl px-3 py-2 text-xs font-semibold ${loyaltyRedemptionValid?'':'text-rose-700'}`} style={{background:loyaltyRedemptionValid?t.colors.background:'#fff1f2',color:loyaltyRedemptionValid?t.colors.primary:undefined}}>{loyaltyRedemptionValid?`Descuento por puntos: ${money(loyaltyDiscount)}`:`El canje debe ser de al menos ${loyaltyMin.toLocaleString('es-DO')} puntos y no superar el total.`}</div>}</div>:<p className="mt-3 rounded-xl p-3 text-xs" style={{background:t.colors.background,color:t.colors.muted}}>Sigue comprando para alcanzar el mínimo de canje.</p>}</section>}

      <section data-testid="storefront-cart-summary" className="p-4" style={{...surfaceStyle(t),boxShadow:'none'}}>
        <div className="rounded-2xl p-3.5 text-sm" style={{background:t.colors.background}}><div className="flex justify-between"><span style={{color:t.colors.muted}}>Subtotal</span><strong>{money(subtotal)}</strong></div>{form.delivery_type==='delivery'&&<div className="mt-2 flex justify-between"><span style={{color:t.colors.muted}}>Delivery</span><strong style={{color:t.colors.primary}}>{money(shipping)}</strong></div>}{loyaltyDiscount>0&&<div className="mt-2 flex justify-between"><span style={{color:t.colors.muted}}>Puntos ({loyaltyRequested.toLocaleString('es-DO')})</span><strong className="text-emerald-600">- {money(loyaltyDiscount)}</strong></div>}<div className="mt-3 flex justify-between pt-3 text-base" style={{borderTop:`1px solid ${t.colors.border}`}}><span>Total estimado</span><strong className="text-lg">{money(total)}</strong></div></div>
        {minimumMissing>0&&<div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-800">Agrega {money(minimumMissing)} para alcanzar el pedido mínimo.</div>}
        <button type="submit" disabled={sending||minimumMissing>0||!canOrder||!cashChangeValid||!loyaltyRedemptionValid} className="mt-3 w-full px-4 py-3 font-semibold disabled:opacity-50" style={buttonStyle(t)}>{sending?`Enviando ${capabilities.orderNoun}...`:needsCashChangeDecision&&!cashChangeValid?'Indica si necesitas cambio':canOrder?(capabilities.quotation?'Enviar solicitud':capabilities.appointments?'Confirmar reserva':'Confirmar pedido'):'No disponible'}</button>
      </section>
    </form>
  </div>

  const cartPage=<main data-testid="storefront-cart-page" className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7">
    {!canOrder&&<div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><Clock3 className="mt-0.5 h-4 w-4 shrink-0"/><div><strong>{s.accepting_orders===false?'Pedidos pausados':'Estamos fuera de horario'}</strong><p className="mt-1 text-amber-800/80">Puedes revisar tu compra ahora y confirmarla cuando el negocio vuelva a estar disponible.</p></div></div>}
    {cart.length===0?<div className="grid min-h-[420px] place-items-center p-8 text-center" style={surfaceStyle(t)}><div><ShoppingBag className="mx-auto h-12 w-12 opacity-25"/><h2 className="mt-4 text-xl font-semibold">Tu compra está vacía</h2><p className="mt-2 text-sm" style={{color:t.colors.muted}}>Agrega {capabilities.itemPlural} del catálogo para comenzar.</p><button type="button" onClick={closeCart} className="mt-5 px-5 py-3 text-sm font-semibold" style={buttonStyle(t)}>Explorar catálogo</button></div></div>:<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start">{cartProducts}<aside data-testid="storefront-cart-summary-column" className="space-y-4 lg:sticky lg:top-24">{checkoutColumn}</aside></div>}
  </main>

  return <div className="storefront min-h-screen pb-[calc(76px+env(safe-area-inset-bottom))] md:pb-0" style={{...vars,background:pageBackground,color:t.colors.text,fontFamily:'var(--store-body-font)'}} data-theme={preset.id}>
    {t.custom_css&&<style>{t.custom_css}</style>}
    <header className={`${t.header.sticky?'sticky top-0':''} z-30 backdrop-blur-xl`} style={{background:t.header.variant==='glass'?'color-mix(in srgb, var(--store-surface) 82%, transparent)':t.colors.surface,borderBottom:`1px solid ${t.colors.border}`}}>
      <div className="mx-auto grid max-w-7xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 sm:px-6 md:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden" style={{borderRadius:t.shape.radius,background:t.colors.background}}>{s.logo_url?<img src={s.logo_url} alt="" className="h-full w-full object-cover"/>:<StoreIcon className="h-5 w-5" style={{color:t.colors.primary}}/>}</div>
          <div className="min-w-0"><h1 className="truncate text-sm font-semibold sm:text-base" style={{fontFamily:'var(--store-heading-font)'}}>{s.name}</h1><p data-testid="storefront-header-subtitle" className="hidden truncate text-[11px] sm:block" style={{color:t.colors.muted}}>{headerSubtitle}</p></div>
        </div>
        {searchBox}
        <div className="flex items-center justify-end gap-2">
          <button data-testid="storefront-desktop-cart" type="button" onClick={()=>setCartOpen(true)} className="relative hidden items-center gap-2 px-3 py-2.5 text-sm font-semibold lg:inline-flex" style={buttonStyle(t,!cartOpen)}><ShoppingBag className="h-4 w-4"/><span>Mi compra</span>{itemCount>0&&<span className="grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold" style={{background:cartOpen?t.colors.surface:t.colors.primary,color:cartOpen?t.colors.primary:t.colors.buttonText,border:`1px solid ${cartOpen?t.colors.border:t.colors.primary}`}}>{itemCount}</span>}</button>
          {customer?<><Link href="/cliente/pedidos" className="hidden px-3 py-2.5 text-sm font-semibold lg:inline-flex" style={buttonStyle(t,true)}>Pedidos</Link><Link href="/cliente/perfil" className="inline-flex items-center gap-2 px-3 py-2.5 text-sm font-semibold" style={buttonStyle(t,true)}><span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full" style={{background:t.colors.background}}>{customer.profile_picture_url?<img src={customer.profile_picture_url} alt={customer.whatsapp_name||customer.name||'Perfil de WhatsApp'} className="h-full w-full object-cover"/>:<UserRound className="h-3.5 w-3.5"/>}</span><span className="hidden xl:inline">{customer.name}</span></Link></>:<button onClick={()=>setCustomerAuthOpen(true)} className="px-3 py-2.5 text-sm font-semibold sm:px-4" style={buttonStyle(t,true)}>Entrar</button>}
        </div>
      </div>
    </header>

    {cartOpen?cartPage:<main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7">
      {!canOrder&&<div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><Clock3 className="mt-0.5 h-4 w-4 shrink-0"/><div><strong>{s.accepting_orders===false?'Pedidos pausados':'Estamos fuera de horario'}</strong><p className="mt-1 text-amber-800/80">Puedes explorar el catálogo ahora y volver a realizar tu pedido cuando la tienda esté disponible.</p></div></div>}
      <section className={`storefront-hero relative overflow-hidden ${heroHeight}`} style={{...heroBase,borderRadius:t.shape.radius,boxShadow:'var(--store-shadow)'}}>
        {(preset.id==='food-bold'||preset.id==='fresh-market'||preset.id==='beauty-soft')&&<><span className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10"/><span className="pointer-events-none absolute -bottom-24 right-[18%] h-52 w-52 rounded-full bg-white/10"/></>}
        {(t.hero.variant==='overlay'||t.hero.variant==='editorial')&&s.banner_url&&<img src={s.banner_url} alt="" className={`absolute inset-0 h-full w-full object-cover ${t.hero.variant==='editorial'?'opacity-20':''}`}/>} {t.hero.variant==='overlay'&&s.banner_url&&<div className="absolute inset-0 bg-gradient-to-r from-slate-950/70 via-slate-950/35 to-transparent"/>}
        {t.hero.variant==='split'&&<div className="absolute inset-y-0 right-0 hidden w-[44%] sm:block">{s.banner_url?<img src={s.banner_url} alt="" className="h-full w-full object-cover"/>:<div className="h-full w-full" style={{background:`linear-gradient(145deg,${t.colors.secondary},${t.colors.accent})`}}/>}<div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--store-primary)] to-transparent"/></div>}
        <div className={`relative flex h-full items-center p-6 sm:p-9 ${t.hero.variant==='editorial'?'justify-center text-center':''}`}><div className={`${t.hero.variant==='editorial'?'max-w-3xl':'max-w-2xl'} ${t.hero.variant==='split'?'sm:max-w-[52%]':''}`}><span className="inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[.14em]" style={{background:heroTextDark?t.colors.background:'rgba(255,255,255,.16)',color:heroTextDark?t.colors.primary:'#fff'}}>{heroLabel}</span><h2 className={`${t.typography.scale==='compact'?'text-3xl':t.typography.scale==='large'?'text-4xl sm:text-6xl':'text-3xl sm:text-5xl'} mt-3 font-semibold tracking-tight`} style={{fontFamily:'var(--store-heading-font)'}}>{s.name}</h2><p className="mt-3 max-w-xl text-sm leading-6 opacity-85 sm:text-base">{s.description||'Elige tus productos favoritos y haz tu pedido en pocos pasos.'}</p><div className={`mt-5 flex flex-wrap gap-2 ${t.hero.variant==='editorial'?'justify-center':''}`}>{s.whatsapp&&<a target="_blank" rel="noreferrer" href={`https://wa.me/${String(s.whatsapp).replace(/\D/g,'')}`} className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium" style={{background:heroTextDark?t.colors.background:'rgba(255,255,255,.16)',color:heroTextDark?t.colors.text:'#fff'}}><MessageCircleMore className="h-4 w-4"/>WhatsApp</a>}{s.address&&<span className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium" style={{background:heroTextDark?t.colors.background:'rgba(255,255,255,.16)',color:heroTextDark?t.colors.text:'#fff'}}><MapPin className="h-4 w-4"/>{s.address}</span>}{minimum>0&&<span className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium" style={{background:heroTextDark?t.colors.background:'rgba(255,255,255,.16)',color:heroTextDark?t.colors.text:'#fff'}}><ShoppingBag className="h-4 w-4"/>Mínimo {money(minimum)}</span>}</div></div></div>
      </section>
      {s.order_notice&&<div className="mt-4 flex items-start gap-3 p-4 text-sm" style={surfaceStyle(t)}><Clock3 className="mt-0.5 h-4 w-4 shrink-0" style={{color:t.colors.primary}}/><span style={{color:t.colors.muted}}>{s.order_notice}</span></div>}
      <div className="mt-4 sm:hidden"><div data-testid="storefront-perk-carousel" className="overflow-hidden"><div className="flex transition-transform duration-500 ease-out" style={{transform:`translateX(-${perkIndex*100}%)`}}>{perks.map((perk:any)=>{const I=perk.icon;return <div key={perk.title} className="w-full shrink-0"><div className="flex min-h-16 items-center gap-3 px-3.5 py-3" style={{...surfaceStyle(t),boxShadow:'none'}}><span className="grid h-9 w-9 shrink-0 place-items-center" style={{borderRadius:Math.max(6,t.shape.buttonRadius-4),background:t.colors.background,color:t.colors.primary}}><I className="h-4 w-4"/></span><div className="min-w-0"><div className="truncate text-xs font-bold">{perk.title}</div><div className="truncate text-[11px]" style={{color:t.colors.muted}}>{perk.detail}</div></div></div></div>})}</div></div><div className="mt-2 flex justify-center gap-1.5">{perks.map((perk:any,index:number)=><button key={perk.title} type="button" aria-label={`Ver ${perk.title}`} onClick={()=>setPerkIndex(index)} className="h-1.5 w-5 transition" style={{background:index===perkIndex?t.colors.primary:t.colors.border,borderRadius:999}}/>)}</div></div>
      <div className="mt-4 hidden gap-2 sm:grid sm:grid-cols-3">{perks.map((perk:any)=>{const I=perk.icon;return <div key={perk.title} className="flex items-center gap-3 px-3.5 py-3" style={{...surfaceStyle(t),boxShadow:'none'}}><span className="grid h-9 w-9 shrink-0 place-items-center" style={{borderRadius:Math.max(6,t.shape.buttonRadius-4),background:t.colors.background,color:t.colors.primary}}><I className="h-4 w-4"/></span><div className="min-w-0"><div className="truncate text-xs font-bold">{perk.title}</div><div className="truncate text-[11px]" style={{color:t.colors.muted}}>{perk.detail}</div></div></div>})}</div>
      {data.categories.length>0&&<div className={`modal-scroll mt-5 flex gap-2 overflow-x-auto pb-2 ${t.categories.variant==='underline'?'border-b':''}`} style={{borderColor:t.colors.border}}><button onClick={()=>setCat('all')} className={`${t.categories.variant==='circles'?'grid h-20 w-20 place-items-center rounded-full text-center':'px-4 py-2.5'} shrink-0 text-sm font-semibold transition`} style={catButton(cat==='all')}>Todos</button>{data.categories.map((c:any)=><button key={c.id} onClick={()=>setCat(c.id)} className={`${t.categories.variant==='circles'?'flex w-20 shrink-0 flex-col items-center gap-1.5 bg-transparent text-center':'flex shrink-0 items-center gap-2 px-3 py-2'} text-sm font-semibold transition`} style={t.categories.variant==='circles'?{color:cat===c.id?t.colors.primary:t.colors.muted}:{...catButton(cat===c.id)}}>{t.categories.variant==='circles'?<span className="grid h-14 w-14 place-items-center overflow-hidden rounded-full" style={{background:t.colors.surface,border:`2px solid ${cat===c.id?t.colors.primary:t.colors.border}`}}>{c.image_url?<img src={c.image_url} alt="" className="h-full w-full object-cover"/>:<span className="text-lg">{c.name.slice(0,1)}</span>}</span>:c.image_url&&<img src={c.image_url} alt="" className="h-7 w-7 rounded-full object-cover"/>}<span>{c.name}</span></button>)}</div>}
      <div className="mt-6 flex items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.14em]" style={{color:t.colors.primary}}>Explora el catálogo</p><h2 className="mt-1 text-xl font-semibold sm:text-2xl" style={{fontFamily:'var(--store-heading-font)'}}>{activeCategory?.name||`Todos los ${itemPlural}`}</h2></div><span className="shrink-0 text-xs" style={{color:t.colors.muted}}>{products.length} {products.length===1?'opción':'opciones'}</span></div>
      <div className={`mt-5 grid items-stretch gap-3 sm:gap-4 ${gridClass[t.products.columnsMobile]}`}>{products.map((p:Product)=>{
        const sold=p.track_stock&&Number(p.stock||0)<=0
        const industrial=t.products.card==='industrial'
        const category=categoryById.get(String(p.category_id))||''
        const cartLines=productCartLines(cart,p.id)
        const cartQty=roundQuantity(cartLines.reduce((sum,line)=>sum+Number(line.quantity||0),0))
        const weightedCfg=weightedSaleConfig(p)
        return <button data-testid="storefront-product-card" disabled={sold} key={p.id} onClick={()=>openProduct(p)} className={`storefront-product-card group h-full overflow-hidden text-left transition duration-200 focus:outline-none focus-visible:ring-4 ${industrial?'flex min-h-36':'flex flex-col'} ${sold?'cursor-not-allowed opacity-60':'hover:-translate-y-1 hover:shadow-xl'}`} style={surfaceStyle(t)}>
          <div className={`${industrial?'h-auto min-h-36 w-[36%] shrink-0':ratioClass[t.products.imageRatio]||'aspect-square'} relative overflow-hidden`} style={{background:`linear-gradient(135deg,${t.colors.primary}12,${t.colors.secondary}40)`}}>
            {p.image_url?<img src={p.image_url} alt={p.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"/>:<div className="grid h-full place-items-center"><StoreIcon className="h-7 w-7 opacity-20"/></div>}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent opacity-0 transition group-hover:opacity-100"/>
            {(p.tag||p.is_featured)&&<span className="absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide shadow-sm" style={{background:t.colors.primary,color:t.colors.buttonText}}>{p.tag||'Destacado'}</span>}
            {sold&&<div className="absolute inset-0 grid place-items-center bg-white/75 text-xs font-bold">Agotado</div>}
          </div>
          <div className={`${industrial?'flex-1':'flex flex-1 flex-col'} min-w-0 p-3.5 sm:p-4`}>
            {category&&<div className="mb-1.5 truncate text-[9px] font-bold uppercase tracking-[.12em]" style={{color:t.colors.primary}}>{category}</div>}
            <h3 className={`${t.products.card==='editorial'||t.products.card==='luxury'?'text-base':'text-sm'} line-clamp-2 font-semibold leading-snug`} style={{fontFamily:t.products.card==='editorial'||t.products.card==='luxury'?'var(--store-heading-font)':'inherit'}}>{p.name}</h3>
            {p.description&&<p className={`mt-1.5 ${industrial?'line-clamp-3':'line-clamp-2'} text-xs leading-5`} style={{color:t.colors.muted}}>{p.description}</p>}
            {Number(p.review_count||0)>0&&<div className="mt-2 flex items-center gap-1 text-[11px] font-semibold" style={{color:t.colors.muted}}><Star className="h-3 w-3 fill-amber-400 text-amber-400"/>{Number(p.rating_average||0).toFixed(1)} <span className="font-normal">({p.review_count})</span></div>}
            <div className="mt-auto grid grid-cols-[minmax(0,1fr)_2.25rem] items-end gap-2 pt-4"><div className="min-w-0 pr-1"><div className="text-[15px] font-bold leading-tight sm:text-base" style={{color:t.colors.primary}}>{p.variants?.length&&<span className="mb-0.5 block text-[9px] font-semibold uppercase tracking-wide sm:mb-0 sm:mr-1 sm:inline" style={{color:t.colors.muted}}>Desde</span>}<span className="whitespace-nowrap">{money(productStartingPrice(p))}</span>{weightedCfg.enabled&&<span className="ml-1 whitespace-nowrap text-[9px] font-semibold sm:text-[10px]" style={{color:t.colors.muted}}>/ {weightedCfg.unit}</span>}</div>{Number(p.compare_price||0)>productStartingPrice(p)&&<div className="text-[10px] line-through" style={{color:t.colors.muted}}>{money(Number(p.compare_price))}</div>}{cartQty>0&&<div data-testid="product-cart-summary" className="mt-1 truncate text-[10px] font-bold" style={{color:t.colors.primary}}>{weightedCfg.enabled?`${formatCartQuantity(cartQty,weightedCfg.unit)} en tu pedido`:`${formatCartQuantity(cartQty)} en tu pedido`}</div>}</div><span className="grid h-9 w-9 shrink-0 place-items-center self-end text-sm font-bold shadow-sm transition group-hover:scale-105" style={{...buttonStyle(t),borderRadius:Math.max(6,t.shape.buttonRadius-4)}}>{cartQty>0&&cartLines.length===1?<Check className="h-4 w-4"/>:<Plus className="h-4 w-4"/>}</span></div>
          </div>
        </button>
      })}</div>
      {products.length===0&&<div className="mt-8 p-10 text-center" style={surfaceStyle(t)}><StoreIcon className="mx-auto h-8 w-8 opacity-25"/><h3 className="mt-3 font-semibold">No hay productos en esta categoría</h3><p className="mt-1 text-sm" style={{color:t.colors.muted}}>Explora otra sección del catálogo.</p></div>}
      <footer className="mt-10 flex flex-col gap-3 border-t py-6 text-xs sm:flex-row sm:items-center sm:justify-between" style={{borderColor:t.colors.border,color:t.colors.muted}}><div><strong style={{color:t.colors.text}}>{s.name}</strong><span className="mx-2 opacity-40">•</span><span>{capabilities.headerSubtitle}</span></div><div className="flex flex-wrap items-center gap-3">{s.whatsapp&&<a href={`https://wa.me/${String(s.whatsapp).replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="font-semibold" style={{color:t.colors.primary}}>Escribir por WhatsApp</a>}<span>Impulsado por WAMERCIO</span></div></footer>
    </main>}

    {pick&&<div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button className="absolute inset-0 bg-slate-950/50" onClick={closeProduct}/>
      <div data-testid="storefront-product-modal" className="relative max-h-[92vh] w-full overflow-hidden sm:max-w-4xl" style={{background:t.colors.surface,color:t.colors.text,borderRadius:0}}>
        <button onClick={closeProduct} className="absolute right-4 top-4 z-20 grid h-9 w-9 place-items-center bg-white/90 shadow"><X className="h-4 w-4"/></button>
        <div className="scroll-clean max-h-[92vh] overflow-y-auto sm:grid sm:max-h-[84vh] sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:overflow-hidden">
          <div data-testid="storefront-product-media" className="relative min-h-0 overflow-hidden sm:flex sm:h-full sm:flex-col" style={{background:t.colors.background}}>
            <div className="relative min-h-0 flex-1">{productMedia.length>0?<img src={productMedia[Math.min(mediaIndex,productMedia.length-1)]?.url} alt={productMedia[Math.min(mediaIndex,productMedia.length-1)]?.alt_text||translatedProductName} className={`h-full w-full object-cover ${ratioClass[t.products.imageRatio]||'aspect-[4/3]'} sm:aspect-auto`}/>:<div className="grid aspect-[4/3] h-full w-full place-items-center sm:aspect-auto"><StoreIcon className="h-12 w-12 opacity-20"/></div>}{productMedia.length>1&&<><button type="button" aria-label="Imagen anterior" onClick={()=>setMediaIndex(index=>(index-1+productMedia.length)%productMedia.length)} className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow"><ChevronLeft className="h-4 w-4"/></button><button type="button" aria-label="Imagen siguiente" onClick={()=>setMediaIndex(index=>(index+1)%productMedia.length)} className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow"><ChevronRight className="h-4 w-4"/></button></>}</div>
            {productMedia.length>1&&<div className="scroll-clean flex shrink-0 gap-2 overflow-x-auto p-3" style={{borderTop:`1px solid ${t.colors.border}`}}>{productMedia.map((media,index)=><button type="button" key={`${media.url}-${index}`} onClick={()=>setMediaIndex(index)} className="h-14 w-14 shrink-0 overflow-hidden rounded-xl" style={{border:`2px solid ${index===mediaIndex?t.colors.primary:t.colors.border}`}}><img src={media.url} alt={media.alt_text||''} className="h-full w-full object-cover"/></button>)}</div>}
          </div>
          <div data-testid="storefront-product-details" className="p-5 sm:min-h-0 sm:overflow-y-auto sm:p-6">
          <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-2xl font-semibold" style={{fontFamily:'var(--store-heading-font)'}}>{translatedProductName}</h3>{(pick.product_translations||[]).length>0&&<label className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{background:t.colors.background,color:t.colors.primary}}><Languages className="h-3.5 w-3.5"/><select aria-label="Idioma del producto" value={productLocale} onChange={e=>setProductLocale(e.target.value)} className="bg-transparent outline-none"><option value="es">ES</option>{(pick.product_translations||[]).map(item=><option key={item.locale} value={item.locale}>{item.locale.toUpperCase()}</option>)}</select></label>}</div><p className="mt-2 text-sm leading-6" style={{color:t.colors.muted}}>{translatedProductDescription}</p>{Number(pick.review_count||0)>0&&<div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold" style={{color:t.colors.muted}}><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400"/><span>{Number(pick.rating_average||0).toFixed(1)}</span><span>· {pick.review_count} reseña(s)</span></div>}</div>{editingKey&&<span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase" style={{background:t.colors.background,color:t.colors.primary}}>En tu pedido</span>}</div>
          <div className="mt-3 flex items-end justify-between gap-3"><div className="text-xl font-bold" style={{color:t.colors.primary}}>{money(unit||pick.price)}{weighted.enabled&&<span className="ml-1 text-xs font-semibold" style={{color:t.colors.muted}}>/ {weighted.unit}</span>}</div>{editingKey&&((capabilities.supportsVariants&&pick.variants?.length>0)||(capabilities.supportsExtras&&pick.extras?.length>0))&&<button type="button" onClick={resetAsNewCombination} className="text-xs font-semibold" style={{color:t.colors.primary}}>Agregar otra combinación</button>}</div>

          {capabilities.supportsVariants&&pick.variants?.length>0&&<div className="mt-5"><p className="font-bold">Opciones</p><div data-testid="storefront-variant-grid" className="mt-2 grid grid-cols-2 gap-2">{pick.variants.map(v=>{const on=variant?.name===v.name;return <button key={v.name} type="button" onClick={()=>setVariant(v)} className="relative min-h-[76px] p-3 text-left transition" style={{...surfaceStyle(t),boxShadow:'none',borderColor:on?t.colors.primary:t.colors.border,background:on?t.colors.background:t.colors.surface}}><span className="block pr-7 text-sm font-semibold leading-5">{v.name}</span><strong className="mt-2 block text-sm" style={{color:on?t.colors.primary:t.colors.text}}>{money(v.price||pick.price)}</strong>{on&&<span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full" style={{background:t.colors.primary,color:t.colors.buttonText}}><Check className="h-3 w-3"/></span>}</button>})}</div></div>}

          {capabilities.supportsExtras&&pick.extras?.length>0&&<div className="mt-5"><p className="font-bold">Adicionales</p><div data-testid="storefront-extra-grid" className="mt-2 grid grid-cols-2 gap-2">{pick.extras.map(x=>{const on=extras.some(e=>e.name===x.name);return <button key={x.name} type="button" onClick={()=>toggleExtra(x)} className="relative min-h-[76px] p-3 text-left transition" style={{...surfaceStyle(t),boxShadow:'none',borderColor:on?t.colors.primary:t.colors.border,background:on?t.colors.background:t.colors.surface}}><span className="block pr-7 text-sm font-semibold leading-5">{x.name}</span><strong className="mt-2 block text-sm" style={{color:on?t.colors.primary:t.colors.text}}>+ {money(x.price)}</strong>{on&&<span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full" style={{background:t.colors.primary,color:t.colors.buttonText}}><Check className="h-3 w-3"/></span>}</button>})}</div></div>}

          {(pick.modifier_groups||[]).map(group=><div className="mt-5" key={group.id}><div className="flex items-center justify-between gap-3"><p className="font-bold">{group.name}</p><span className="text-[11px] font-semibold" style={{color:t.colors.muted}}>{group.min_select>0?`Elige ${group.min_select}${group.max_select!==group.min_select?`–${group.max_select}`:''}`:`Hasta ${group.max_select}`}</span></div>{group.description&&<p className="mt-1 text-xs" style={{color:t.colors.muted}}>{group.description}</p>}<div className="mt-2 grid grid-cols-2 gap-2">{(group.options||[]).map(option=>{const on=modifierOptionIDs.includes(option.id);return <button key={option.id} type="button" onClick={()=>toggleModifier(group,option)} className="relative min-h-[72px] p-3 text-left transition" style={{...surfaceStyle(t),boxShadow:'none',borderColor:on?t.colors.primary:t.colors.border,background:on?t.colors.background:t.colors.surface}}><span className="block pr-7 text-sm font-semibold leading-5">{option.name}</span><strong className="mt-2 block text-sm" style={{color:on?t.colors.primary:t.colors.text}}>{Number(option.price_delta)>0?`+ ${money(option.price_delta)}`:'Incluido'}</strong>{on&&<span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full" style={{background:t.colors.primary,color:t.colors.buttonText}}><Check className="h-3 w-3"/></span>}</button>})}</div>{!modifierValid&&group.min_select>0&&modifierOptionIDs.filter(id=>(group.options||[]).some(o=>o.id===id)).length<group.min_select&&<p className="mt-2 text-xs font-semibold text-rose-600">Debes completar esta opción para continuar.</p>}</div>)}

          {(pick.bundle_components||[]).length>0&&<div className="mt-5 rounded-2xl p-4" style={{background:t.colors.background,border:`1px solid ${t.colors.border}`}}><p className="text-sm font-bold">Este combo incluye</p><div className="mt-2 space-y-1.5">{(pick.bundle_components||[]).map(component=><div key={component.product_id} className="flex items-center justify-between gap-3 text-sm"><span>{component.name||'Producto incluido'}</span><span className="font-semibold" style={{color:t.colors.primary}}>× {Number(component.quantity).toLocaleString('es-DO')}</span></div>)}</div></div>}

          {((pick.allergens||[]).length>0||(pick.dietary_tags||[]).length>0)&&<div className="mt-5"><p className="text-sm font-bold">Información del producto</p><div className="mt-2 flex flex-wrap gap-2">{(pick.allergens||[]).map(a=><span key={a.id} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={{background:'#fff7ed',color:'#9a3412'}}>{a.icon&&<span className="mr-1">{a.icon}</span>}{a.name}</span>)}{(pick.dietary_tags||[]).map(tag=><span key={tag} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={{background:t.colors.background,color:t.colors.primary}}>{{vegetarian:'Vegetariano',vegan:'Vegano',spicy:'Picante',gluten_free:'Sin gluten'}[tag as 'vegetarian'|'vegan'|'spicy'|'gluten_free']||tag}</span>)}</div></div>}

          {(Number(pick.review_count||0)>0||productReviews.length>0)&&<div className="mt-5 rounded-2xl p-4" style={{background:t.colors.background,border:`1px solid ${t.colors.border}`}}><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold">Reseñas</p><p className="mt-0.5 text-xs" style={{color:t.colors.muted}}>Opiniones de compras verificadas y aprobadas por el negocio.</p></div>{Number(pick.review_count||0)>0&&<div className="flex items-center gap-1 text-sm font-bold"><Star className="h-4 w-4 fill-amber-400 text-amber-400"/>{Number(pick.rating_average||0).toFixed(1)}</div>}</div>{productReviews.length>0&&<div className="mt-3 space-y-2">{productReviews.slice(0,3).map(review=><div key={review.id} className="rounded-xl p-3 text-xs" style={{background:t.colors.surface,border:`1px solid ${t.colors.border}`}}><div className="flex items-center justify-between gap-2"><strong>{review.customer_name||'Cliente'}</strong><span className="inline-flex items-center gap-1 font-bold text-amber-600"><Star className="h-3 w-3 fill-amber-400 text-amber-400"/>{review.rating}</span></div>{review.body&&<p className="mt-1.5 leading-5" style={{color:t.colors.muted}}>{review.body}</p>}{review.verified_purchase&&<span className="mt-1.5 inline-flex items-center gap-1 font-semibold" style={{color:t.colors.primary}}><Check className="h-3 w-3"/>Compra verificada</span>}</div>)}</div>}</div>}

          {weighted.enabled?<><div className="mt-5 space-y-3">
            {weighted.allowAmount&&<div className="grid grid-cols-2 gap-1 rounded-2xl p-1" style={{background:t.colors.background,border:`1px solid ${t.colors.border}`}}><button type="button" onClick={()=>setPurchaseMode('weight')} className="rounded-xl px-3 py-2.5 text-sm font-bold" style={{background:purchaseMode==='weight'?t.colors.surface:'transparent',color:purchaseMode==='weight'?t.colors.primary:t.colors.muted}}>Libra</button><button type="button" onClick={()=>{setPurchaseMode('amount');if(!amountValue)setAmountValue(Math.max(1,Math.round(unit)))}} className="rounded-xl px-3 py-2.5 text-sm font-bold" style={{background:purchaseMode==='amount'?t.colors.surface:'transparent',color:purchaseMode==='amount'?t.colors.primary:t.colors.muted}}>Monto</button></div>}
            <div className="p-4" style={{...surfaceStyle(t),boxShadow:'none'}}><div className="flex items-center justify-between gap-3"><div><p className="font-bold">Introduce la cantidad</p><p className="mt-1 text-xs" style={{color:t.colors.muted}}>{purchaseMode==='amount'?`WAMERCIO calcula el peso aproximado según ${money(unit)} / ${weighted.unit}.`:`Compra desde ${formatCartQuantity(weighted.minimum,weighted.unit)}.`}</p></div>{purchaseMode==='amount'?<div className="flex h-11 min-w-36 items-center gap-2 rounded-xl px-3" style={{border:`1px solid ${t.colors.border}`}}><span className="text-sm font-bold" style={{color:t.colors.primary}}>RD$</span><input aria-label="Monto que quieres comprar" inputMode="numeric" type="number" min="1" step="1" value={amountValue||''} onChange={e=>setAmountValue(Math.max(0,Number(e.target.value)))} className="w-24 bg-transparent text-center font-bold outline-none"/></div>:<div className="flex h-11 items-center" style={{border:`1px solid ${t.colors.border}`,borderRadius:t.shape.buttonRadius}}><button type="button" onClick={()=>setQty(roundQuantity(Math.max(weighted.minimum,qty-weighted.increment)))} className="p-3"><Minus className="h-4 w-4"/></button><input aria-label="Cantidad de libras" inputMode="decimal" type="number" min={weighted.minimum} step={weighted.increment} value={qty} onChange={e=>setQty(roundQuantity(Math.max(weighted.minimum,Number(e.target.value)||weighted.minimum)))} className="w-16 bg-transparent text-center font-bold outline-none"/><span className="pr-2 text-xs font-bold" style={{color:t.colors.primary}}>{weighted.unit}</span><button type="button" onClick={()=>setQty(roundQuantity(qty+weighted.increment))} className="p-3"><Plus className="h-4 w-4"/></button></div>}</div><div className="mt-3 flex items-center justify-between rounded-xl px-3 py-2" style={{background:t.colors.background}}><span className="text-[10px] font-bold uppercase tracking-wide" style={{color:t.colors.muted}}>{purchaseMode==='amount'?'Peso aproximado':'Total'}</span><strong style={{color:t.colors.primary}}>{purchaseMode==='amount'?formatCartQuantity(selectedQuantity,weighted.unit):money(selectionTotal)}</strong></div></div>
          </div><button disabled={!canOrder||selectedQuantity<=0||!modifierValid} onClick={saveProductSelection} className="mt-5 w-full px-4 py-3 font-semibold disabled:opacity-50" style={buttonStyle(t)}>{canOrder?`${editingKey?'Actualizar mi compra':capabilities.primaryAction} · ${money(selectionTotal)}`:'Pedidos no disponibles'}</button></>:<div data-testid="storefront-product-actions" className="mt-5 flex items-center gap-3"><div className="flex shrink-0 items-center" style={{border:`1px solid ${t.colors.border}`,borderRadius:t.shape.buttonRadius}}><button type="button" onClick={()=>setQty(Math.max(1,qty-1))} className="p-3"><Minus className="h-4 w-4"/></button><span className="w-10 text-center font-bold">{formatCartQuantity(qty)}</span><button type="button" onClick={()=>setQty(qty+1)} className="p-3"><Plus className="h-4 w-4"/></button></div><button disabled={!canOrder||selectedQuantity<=0||!modifierValid} onClick={saveProductSelection} className="min-w-0 flex-1 px-4 py-3 font-semibold disabled:opacity-50" style={buttonStyle(t)}>{canOrder?`${editingKey?'Actualizar mi compra':capabilities.primaryAction} · ${money(selectionTotal)}`:'Pedidos no disponibles'}</button></div>}
          </div>
        </div>
      </div>
    </div>}

    {cartNotice&&<div className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-1/2 z-[65] -translate-x-1/2 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white shadow-xl lg:bottom-6">{cartNotice}</div>}

    <StorefrontMobileNav active={cartOpen?'cart':'catalog'} itemCount={itemCount} customer={customer} primaryColor={t.colors.primary} storeWhatsapp={s.whatsapp||''} onCatalog={()=>{closeCart();window.scrollTo({top:0,behavior:'smooth'})}} onCart={()=>setCartOpen(true)} onLogin={()=>setCustomerAuthOpen(true)}/>
    <CustomerAccessModal open={customerAuthOpen} onClose={()=>setCustomerAuthOpen(false)} onAuthenticated={c=>{applyCustomer(c);setCustomerAuthOpen(false);if(cart.length)setCartOpen(true)}}/>

    {done&&<div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4"><div className="w-full max-w-md p-7 text-center shadow-2xl" style={{background:t.colors.surface,color:t.colors.text,borderRadius:t.shape.radius}}><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check className="h-8 w-8"/></div><h3 className="mt-4 text-2xl font-semibold" style={{fontFamily:'var(--store-heading-font)'}}>{capabilities.quotation?'¡Solicitud enviada!':capabilities.appointments?'¡Reserva recibida!':'¡Pedido recibido!'}</h3><p className="mt-2" style={{color:t.colors.muted}}>Tu {capabilities.orderNoun} <strong>#{done.number}</strong> fue registrada correctamente.</p><div className="mt-5 p-4" style={{background:t.colors.background,borderRadius:t.shape.radius}}><div className="text-sm" style={{color:t.colors.muted}}>Total</div><div className="text-2xl font-semibold">{money(done.total)}</div><div className="mt-1 text-xs" style={{color:t.colors.muted}}>{payLabel[done.payment_method]||''}</div></div>{done.payment_method==='bank_transfer'&&<p className="mt-3 text-xs leading-5" style={{color:t.colors.muted}}>Realiza la transferencia y sube tu comprobante desde el seguimiento del pedido.</p>}{done.tracking_url&&<a href={done.tracking_url} className="mt-5 inline-flex w-full items-center justify-center px-4 py-3 font-semibold" style={buttonStyle(t,true)}>Ver seguimiento{done.payment_method==='bank_transfer'?' y comprobante':''}</a>}<button onClick={()=>setDone(null)} className="mt-2 w-full px-4 py-3 font-semibold" style={buttonStyle(t)}>Seguir comprando</button></div></div>}
  </div>
}
