'use client'

import {useEffect,useMemo,useState} from 'react'
import Link from 'next/link'
import {api,money} from '@/lib/api'
import type {Product,PriceOption} from '@/lib/types'
import CustomerAccessModal from '@/components/customer-access-modal'
import {resolvedTheme,themeCSSVars,type StoreThemeConfig} from '@/lib/store-themes'
import {ArrowLeft,Check,ChevronRight,Clock3,MapPin,MessageCircleMore,Minus,Plus,Search,ShoppingBag,Store as StoreIcon,Truck,UserRound,WalletCards,X} from 'lucide-react'
import StorefrontMobileNav from '@/components/storefront-mobile-nav'
import {cartKey,formatCartQuantity,initialProductQuantity,mergeCartItem,normalizeStoredCart,productCartLines,quantityFromAmount,replaceCartItem,roundQuantity,weightedSaleConfig,type StorefrontCartLine} from '@/lib/storefront-cart'

type CartItem=StorefrontCartLine
const payLabel:any={cash_on_delivery:'Pago al recibir',cash:'Efectivo',bank_transfer:'Transferencia bancaria'}
const ratioClass:Record<string,string>={'1:1':'aspect-square','4:3':'aspect-[4/3]','3:4':'aspect-[3/4]','16:9':'aspect-video'}
const gridClass:Record<number,string>={1:'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',2:'grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}
function buttonStyle(t:StoreThemeConfig,secondary=false):React.CSSProperties{return secondary||t.buttons.variant==='outline'?{background:'transparent',color:t.colors.primary,border:`1px solid ${t.colors.primary}`,borderRadius:t.shape.buttonRadius}:{background:t.buttons.variant==='soft'?t.colors.secondary:t.colors.primary,color:t.buttons.variant==='soft'?t.colors.text:t.colors.buttonText,border:`1px solid ${t.buttons.variant==='soft'?t.colors.secondary:t.colors.primary}`,borderRadius:t.shape.buttonRadius}}
function surfaceStyle(t:StoreThemeConfig):React.CSSProperties{return{background:t.colors.surface,border:`1px solid ${t.colors.border}`,borderRadius:t.shape.radius,boxShadow:'var(--store-shadow)'}}
function productStartingPrice(p:Product){const variants=(p.variants||[]).map(v=>Number(v.price||0)).filter(v=>v>0);return variants.length?Math.min(...variants):Number(p.price||0)}

export default function Storefront(){
  const[data,setData]=useState<any>(null)
  const[error,setError]=useState('')
  const[search,setSearch]=useState('')
  const[searchOpen,setSearchOpen]=useState(false)
  const[cat,setCat]=useState('all')
  const[pick,setPick]=useState<Product|null>(null)
  const[variant,setVariant]=useState<PriceOption|null>(null)
  const[extras,setExtras]=useState<PriceOption[]>([])
  const[qty,setQty]=useState(1)
  const[purchaseMode,setPurchaseMode]=useState<'weight'|'amount'>('weight')
  const[amountValue,setAmountValue]=useState(0)
  const[editingKey,setEditingKey]=useState('')
  const[returnToCart,setReturnToCart]=useState(false)
  const[cartNotice,setCartNotice]=useState('')
  const[cart,setCart]=useState<CartItem[]>([])
  const[cartOpen,setCartOpen]=useState(false)
  const[checkout,setCheckout]=useState(false)
  const[sending,setSending]=useState(false)
  const[done,setDone]=useState<any>(null)
  const[customer,setCustomer]=useState<any>(null)
  const[customerAuthOpen,setCustomerAuthOpen]=useState(false)
  const[form,setForm]=useState({address_id:'',delivery_type:'delivery',shipping_zone_id:'',coupon_code:'',payment_method:'cash_on_delivery',notes:''})
  const[addressPickerOpen,setAddressPickerOpen]=useState(false)

  useEffect(()=>{
    api('/public/store').then((x:any)=>{
      setData(x)
      const store=x.store
      const methods=store.payment_methods||{}
      const payment=['cash_on_delivery','cash','bank_transfer'].find(k=>methods[k])||''
      const delivery=store.delivery_enabled?'delivery':'pickup'
      setForm(v=>({...v,payment_method:payment,delivery_type:delivery}))
    }).catch(e=>setError(e.message))
  },[])
  useEffect(()=>{if(data?.store?.name)document.title=`${data.store.name} · WAMERCIO`},[data?.store?.name])
  const applyCustomer=(c:any)=>{setCustomer(c);const primary=Array.isArray(c?.addresses)?(c.addresses.find((a:any)=>a.is_primary)||c.addresses[0]):null;if(primary)setForm(v=>({...v,address_id:primary.id}))}
  const loadCustomer=()=>api<any>('/customer/me').then(applyCustomer).catch(()=>setCustomer(null))
  useEffect(()=>{void loadCustomer()},[])
  useEffect(()=>{try{const v=localStorage.getItem(`wamercio-cart-${window.location.hostname}`);if(v)setCart(normalizeStoredCart(JSON.parse(v)))}catch{}},[])
  useEffect(()=>{if(typeof window!=='undefined')localStorage.setItem(`wamercio-cart-${window.location.hostname}`,JSON.stringify(cart))},[cart])
  useEffect(()=>{
    if(typeof document==='undefined'||typeof window==='undefined')return
    const mobileCart=cartOpen&&window.matchMedia('(max-width: 1023px)').matches
    if(!pick&&!done&&!mobileCart)return
    const previous=document.body.style.overflow
    document.body.style.overflow='hidden'
    return()=>{document.body.style.overflow=previous}
  },[cartOpen,pick,done])

  const products=useMemo(()=>data?.products?.filter((p:Product)=>cat==='all'||p.category_id===cat)||[],[data,cat])
  const categoryById=useMemo(()=>new Map<string,string>((data?.categories||[]).map((c:any)=>[String(c.id),String(c.name)])),[data])
  const searchResults=useMemo(()=>{
    const needle=search.trim().toLowerCase()
    if(!needle||!data?.products)return [] as Product[]
    return (data.products as Product[]).filter(p=>(`${p.name} ${p.description||''} ${p.tag||''} ${categoryById.get(String(p.category_id))||''}`).toLowerCase().includes(needle)).sort((a,b)=>Number(!!b.is_featured)-Number(!!a.is_featured)).slice(0,8)
  },[data,search,categoryById])
  const itemCount=cart.reduce((a,x)=>a+((x.sale_mode==='weight'||x.sale_mode==='amount')?1:x.quantity),0)
  const subtotal=cart.reduce((a,x)=>a+x.unit_price*x.quantity,0)
  const zone=data?.shipping_zones?.find((z:any)=>z.id===form.shipping_zone_id)
  const shipping=form.delivery_type==='delivery'?Number(zone?.charge||0):0
  const total=subtotal+shipping
  const selectedAddress=(customer?.addresses||[]).find((a:any)=>a.id===form.address_id)

  const openProduct=(p:Product,line?:CartItem)=>{
    if(p.track_stock&&Number(p.stock||0)<=0)return
    const existing=line?[line]:productCartLines(cart,p.id)
    const current=line||(existing.length===1?existing[0]:undefined)
    const weighted=weightedSaleConfig(p)
    setPick(p)
    setEditingKey(current?.key||'')
    setVariant(current?.variant_name?(p.variants||[]).find(v=>v.name===current.variant_name)||p.variants?.[0]||null:p.variants?.[0]||null)
    setExtras(current?.extras||[])
    setPurchaseMode(current?.sale_mode==='amount'?'amount':'weight')
    setQty(initialProductQuantity(p,current))
    setAmountValue(Number(current?.requested_amount||0))
  }
  const closeProduct=()=>{const reopen=returnToCart;setPick(null);setEditingKey('');setReturnToCart(false);if(reopen)setCartOpen(true)}
  const openCartItem=(line:CartItem)=>{
    const product=(data?.products||[]).find((p:Product)=>p.id===line.product_id)
    if(!product)return
    setReturnToCart(true)
    setCartOpen(false)
    openProduct(product,line)
  }
  const openSearchProduct=(p:Product)=>{
    setSearchOpen(false)
    setSearch('')
    openProduct(p)
  }
  const toggleExtra=(x:PriceOption)=>setExtras(v=>v.some(y=>y.name===x.name)?v.filter(y=>y.name!==x.name):[...v,x])
  const weighted=pick?weightedSaleConfig(pick):{enabled:false,unit:'lb',increment:0.25,minimum:0.25,allowAmount:true}
  const unit=pick?(Number(variant?.price||0)>0?Number(variant?.price):pick.price)+extras.reduce((a,x)=>a+Number(x.price||0),0):0
  const selectedQuantity=weighted.enabled&&purchaseMode==='amount'?quantityFromAmount(amountValue||unit,unit):roundQuantity(qty)
  const selectionTotal=weighted.enabled&&purchaseMode==='amount'?Number(amountValue||unit):unit*selectedQuantity
  const resetAsNewCombination=()=>{
    if(!pick)return
    const cfg=weightedSaleConfig(pick)
    setEditingKey('')
    setVariant(pick.variants?.[0]||null)
    setExtras([])
    setPurchaseMode('weight')
    setQty(cfg.enabled?cfg.minimum:1)
    setAmountValue(0)
  }
  const saveProductSelection=()=>{
    if(!pick||selectedQuantity<=0)return
    const key=cartKey(pick.id,variant?.name||'',extras)
    const next:CartItem={key,product_id:pick.id,name:pick.name,image_url:pick.image_url,quantity:selectedQuantity,base_price:pick.price,unit_price:unit,variant_name:variant?.name||'',extras,sale_mode:weighted.enabled?(purchaseMode==='amount'?'amount':'weight'):'unit',unit_label:weighted.enabled?weighted.unit:undefined,requested_amount:weighted.enabled&&purchaseMode==='amount'?Number(amountValue||selectionTotal):undefined,quantity_step:weighted.enabled?weighted.increment:1}
    setCart(v=>editingKey?replaceCartItem(v,editingKey,next):mergeCartItem(v,next))
    setCartNotice(editingKey?'Pedido actualizado':'Agregado a tu pedido')
    window.setTimeout(()=>setCartNotice(''),1800)
    const reopen=returnToCart
    setPick(null)
    setEditingKey('')
    setReturnToCart(false)
    setCheckout(false)
    if(reopen)setCartOpen(true)
  }
  const changeQty=(key:string,d:number)=>setCart(v=>v.map(x=>x.key===key?{...x,quantity:roundQuantity(Math.max(0,x.quantity+d*Number(x.quantity_step||1)))}:x).filter(x=>x.quantity>0))
  const closeCart=()=>{setCartOpen(false);setCheckout(false);setError('')}
  const beginCheckout=()=>{setError('');if(!customer){setCustomerAuthOpen(true);return}setCheckout(true);setCartOpen(true)}
  const send=async(e:React.FormEvent)=>{
    e.preventDefault()
    if(!cart.length)return
    if(!customer){setCustomerAuthOpen(true);return}
    setSending(true);setError('')
    try{
      const payload={...form,address_id:form.delivery_type==='delivery'?form.address_id:'',shipping_zone_id:form.delivery_type==='delivery'?form.shipping_zone_id:'',items:cart.map(x=>({product_id:x.product_id,quantity:x.quantity,variant_name:x.variant_name,extras:x.extras}))}
      const out=await api('/public/store/checkout',{method:'POST',body:JSON.stringify(payload)})
      setDone(out);setCart([]);setCheckout(false);setCartOpen(false)
    }catch(e:any){
      const message=e.message||'No pudimos confirmar el pedido'
      setError(message)
      if(/sesión|Inicia sesión/i.test(message)){setCheckout(false);setCustomer(null);setCustomerAuthOpen(true)}
    }finally{setSending(false)}
  }

  if(error&&!data)return <div className="grid min-h-screen place-items-center bg-[#fafbfe] p-6"><div className="card max-w-md p-8 text-center"><StoreIcon className="mx-auto h-10 w-10 text-slate-300"/><h1 className="mt-4 text-xl font-bold">Tienda no disponible</h1><p className="mt-2 text-sm text-[#8d92aa]">{error}</p></div></div>
  if(!data)return <div className="grid min-h-screen place-items-center text-[#a2a6b8]">Cargando tienda...</div>

  const s=data.store
  const minimum=Number(s.minimum_order||0)
  const minimumMissing=Math.max(0,minimum-subtotal)
  const methods=s.payment_methods||{}
  const paymentOptions=['cash_on_delivery','cash','bank_transfer'].filter(k=>methods[k])
  const canOrder=s.accepting_orders!==false&&s.open_now!==false
  const{preset,config:t}=resolvedTheme(s.visual_theme,s.theme_config,s.primary_color)
  const vars=themeCSSVars(t) as React.CSSProperties
  const pageBackground=t.background.type==='gradient'?t.background.value:t.colors.background
  const heroHeight=t.hero.height==='compact'?'min-h-[170px]':t.hero.height==='large'?'min-h-[360px] sm:min-h-[430px]':'min-h-[260px] sm:min-h-[320px]'
  const heroTextDark=t.hero.variant==='editorial'
  const heroBase:React.CSSProperties=t.hero.variant==='editorial'?{background:t.colors.surface,color:t.colors.text,border:`1px solid ${t.colors.border}`}:{background:`linear-gradient(135deg,${t.colors.primary},${t.colors.secondary})`,color:'#fff'}
  const catButton=(active:boolean):React.CSSProperties=>t.categories.variant==='underline'?{color:active?t.colors.primary:t.colors.muted,borderBottom:`2px solid ${active?t.colors.primary:'transparent'}`}:{background:active?t.colors.primary:t.colors.surface,color:active?t.colors.buttonText:t.colors.muted,border:`1px solid ${active?t.colors.primary:t.colors.border}`,borderRadius:t.categories.variant==='cards'?Math.max(8,t.shape.radius/2):999}
  const activeCategory=data.categories.find((c:any)=>c.id===cat)
  const itemPlural=String(s.template_config?.item_label_plural||'productos')
  const heroLabel=s.business_engine==='food'?'MENÚ Y PEDIDOS':s.business_engine==='fashion'?'COLECCIÓN':s.business_engine==='services'?'SERVICIOS':s.business_engine==='quotation'?'CATÁLOGO Y COTIZACIÓN':'CATÁLOGO'
  const headerSubtitle=s.business_engine==='food'?'Menú y pedidos en línea':s.business_engine==='services'?'Servicios y solicitudes':s.business_engine==='quotation'?'Catálogo y cotizaciones':'Catálogo y pedidos en línea'
  const perks=[
    canOrder?{title:'Recibiendo pedidos',detail:'Puedes ordenar ahora',icon:Check}:{title:'Solo catálogo',detail:'Pedidos no disponibles',icon:Clock3},
    s.delivery_enabled?{title:'Delivery',detail:'Entrega a domicilio',icon:Truck}:s.pickup_enabled?{title:'Recogida',detail:'Pasa por el negocio',icon:StoreIcon}:null,
    minimum>0?{title:`Mínimo ${money(minimum)}`,detail:'Para completar el pedido',icon:ShoppingBag}:{title:'Compra fácil',detail:'Agrega y confirma',icon:ShoppingBag},
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
        const category=categoryById.get(String(p.category_id))||'Producto'
        return <button key={p.id} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>openSearchProduct(p)} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-black/[.035] focus:outline-none focus-visible:ring-2" style={{color:t.colors.text}}>
          <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl" style={{background:t.colors.background}}>{p.image_url?<img src={p.image_url} alt="" className="h-full w-full object-cover"/>:<StoreIcon className="h-5 w-5 opacity-25"/>}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="mt-0.5 block truncate text-[11px]" style={{color:t.colors.muted}}>{category}</span></span>
          <span className="shrink-0 text-right"><strong className="block text-sm" style={{color:t.colors.primary}}>{p.variants?.length?'Desde ':''}{money(productStartingPrice(p))}</strong><span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold" style={{color:t.colors.muted}}>Ver <ChevronRight className="h-3 w-3"/></span></span>
        </button>
      })}</div>:<div className="px-4 py-6 text-center"><Search className="mx-auto h-6 w-6 opacity-20"/><p className="mt-2 text-sm font-semibold">No encontramos coincidencias</p><p className="mt-1 text-xs" style={{color:t.colors.muted}}>Prueba con otro nombre, categoría o palabra.</p></div>}
    </div>}
  </div>

  const cartPanel=<>
    <div className="flex min-h-20 shrink-0 items-center gap-2 px-4 sm:px-5" style={{borderBottom:`1px solid ${t.colors.border}`}}>
      {checkout&&<button type="button" aria-label="Volver al carrito" className="rounded-xl p-2" onClick={()=>{setCheckout(false);setError('')}}><ArrowLeft className="h-5 w-5"/></button>}
      <div className="min-w-0"><h3 className="truncate text-xl font-semibold" style={{fontFamily:'var(--store-heading-font)'}}>{checkout?'Finalizar pedido':'Mi pedido'}</h3><p className="truncate text-xs" style={{color:t.colors.muted}}>{checkout?'Completa entrega y pago':`${itemCount} producto(s) en tu pedido`}</p></div>
      <button aria-label="Cerrar" className="ml-auto rounded-xl p-2" onClick={closeCart}><X/></button>
    </div>
    {!checkout?<>
      <div className="scroll-clean min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{cart.length===0?<div className="grid h-full place-items-center text-center"><div><ShoppingBag className="mx-auto h-10 w-10 opacity-25"/><h4 className="mt-3 font-bold">Tu pedido está vacío</h4><p className="mt-1 text-sm" style={{color:t.colors.muted}}>Agrega productos del catálogo.</p></div></div>:<div className="space-y-3">{cart.map(x=><div key={x.key} className="flex gap-3 p-3.5" style={{...surfaceStyle(t),boxShadow:'none'}}><button type="button" data-testid="edit-cart-item" onClick={()=>openCartItem(x)} className="h-16 w-16 shrink-0 overflow-hidden text-left" style={{borderRadius:Math.max(10,t.shape.radius-4),background:t.colors.background}}>{x.image_url?<img src={x.image_url} alt="" className="h-full w-full object-cover"/>:<StoreIcon className="m-5 h-6 w-6 opacity-20"/>}</button><div className="min-w-0 flex-1"><button type="button" onClick={()=>openCartItem(x)} className="block max-w-full text-left"><div className="truncate font-semibold">{x.name}</div>{x.variant_name&&<div className="text-xs" style={{color:t.colors.muted}}>{x.variant_name}</div>}{x.extras.length>0&&<div className="line-clamp-1 text-[11px]" style={{color:t.colors.muted}}>{x.extras.map(y=>y.name).join(', ')}</div>}</button><div className="mt-1.5 flex items-center gap-2"><span className="text-sm font-bold" style={{color:t.colors.primary}}>{money(x.unit_price*x.quantity)}</span><button type="button" onClick={()=>openCartItem(x)} className="text-[11px] font-semibold" style={{color:t.colors.primary}}>Editar</button></div></div>{x.sale_mode==='weight'||x.sale_mode==='amount'?<button type="button" onClick={()=>openCartItem(x)} className="self-center rounded-xl px-3 py-2 text-xs font-bold" style={{background:t.colors.background,color:t.colors.primary}}>{formatCartQuantity(x.quantity,x.unit_label)}</button>:<div className="flex h-9 items-center self-center" style={{border:`1px solid ${t.colors.border}`,borderRadius:t.shape.buttonRadius}}><button type="button" aria-label="Restar cantidad" className="p-2" onClick={()=>changeQty(x.key,-1)}><Minus className="h-3 w-3"/></button><span className="w-6 text-center text-xs font-bold">{formatCartQuantity(x.quantity)}</span><button type="button" aria-label="Sumar cantidad" className="p-2" onClick={()=>changeQty(x.key,1)}><Plus className="h-3 w-3"/></button></div>}</div>)}</div>}</div>
      {cart.length>0&&<div className="shrink-0 p-4 sm:p-5" style={{borderTop:`1px solid ${t.colors.border}`}}><div className="mb-3 flex justify-between"><span className="text-sm" style={{color:t.colors.muted}}>Subtotal</span><strong className="text-lg">{money(subtotal)}</strong></div>{minimumMissing>0&&<div className="mb-4 rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-800">Agrega {money(minimumMissing)} para alcanzar el pedido mínimo.</div>}<button disabled={minimumMissing>0||!canOrder} onClick={beginCheckout} className="w-full px-4 py-3 font-semibold disabled:opacity-50" style={buttonStyle(t)}>Continuar con mi pedido</button></div>}
    </>:<>
      <form id="storefront-checkout-form" onSubmit={send} className="scroll-clean min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {error&&<div className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        {s.checkout_message&&<div className="mb-4 p-3 text-sm" style={{background:t.colors.background,borderRadius:t.shape.buttonRadius,color:t.colors.text}}>{s.checkout_message}</div>}
        <div className="space-y-4">
          {customer&&<div className="flex items-center gap-3 rounded-2xl px-3.5 py-3" style={{background:t.colors.background}}><span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full" style={{background:t.colors.surface}}>{customer.profile_picture_url?<img src={customer.profile_picture_url} alt="" className="h-full w-full object-cover"/>:<UserRound className="h-4 w-4"/>}</span><div className="min-w-0 flex-1"><div className="text-[10px] font-bold uppercase tracking-wider" style={{color:t.colors.muted}}>Cliente</div><div className="truncate text-sm font-bold">{customer.name} {customer.last_name}</div><div className="text-xs" style={{color:t.colors.muted}}>+{customer.phone}</div></div></div>}

          <section data-testid="storefront-cart-step-delivery" className="p-4" style={{...surfaceStyle(t),boxShadow:'none'}}>
            <div className="mb-3"><div className="text-[10px] font-bold uppercase tracking-[.14em]" style={{color:t.colors.primary}}>1 · Modalidad de pedido</div><div className="mt-1 text-sm font-semibold">¿Cómo recibirás tu pedido?</div></div>
            <div className="grid grid-cols-2 gap-2">
              {s.delivery_enabled&&<button type="button" onClick={()=>setForm({...form,delivery_type:'delivery'})} className="relative p-3 text-left" style={{...surfaceStyle(t),boxShadow:'none',borderColor:form.delivery_type==='delivery'?t.colors.primary:t.colors.border,background:form.delivery_type==='delivery'?t.colors.background:t.colors.surface}}><Truck className="h-4 w-4" style={{color:t.colors.primary}}/><div className="mt-2 text-sm font-bold">Delivery</div><div className="text-[11px]" style={{color:t.colors.muted}}>Entrega a domicilio</div>{form.delivery_type==='delivery'&&<Check className="absolute right-3 top-3 h-4 w-4" style={{color:t.colors.primary}}/>}</button>}
              {s.pickup_enabled&&<button type="button" onClick={()=>{setForm({...form,delivery_type:'pickup',shipping_zone_id:''});setAddressPickerOpen(false)}} className="relative p-3 text-left" style={{...surfaceStyle(t),boxShadow:'none',borderColor:form.delivery_type==='pickup'?t.colors.primary:t.colors.border,background:form.delivery_type==='pickup'?t.colors.background:t.colors.surface}}><StoreIcon className="h-4 w-4" style={{color:t.colors.primary}}/><div className="mt-2 text-sm font-bold">Recoger</div><div className="text-[11px]" style={{color:t.colors.muted}}>Retiro en el negocio</div>{form.delivery_type==='pickup'&&<Check className="absolute right-3 top-3 h-4 w-4" style={{color:t.colors.primary}}/>}</button>}
            </div>
            {form.delivery_type==='delivery'?<div className="mt-3 space-y-3">
              {selectedAddress&&!addressPickerOpen?<div data-testid="storefront-selected-address" className="flex items-start gap-3 rounded-xl p-3" style={{background:t.colors.background}}><MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{color:t.colors.primary}}/><div className="min-w-0 flex-1"><div className="text-[10px] font-bold uppercase tracking-wide" style={{color:t.colors.muted}}>Dirección de entrega</div><div className="mt-1 truncate text-sm font-semibold">{selectedAddress.label}</div><div className="mt-0.5 line-clamp-2 text-xs" style={{color:t.colors.muted}}>{selectedAddress.formatted}</div></div><button type="button" onClick={()=>setAddressPickerOpen(true)} className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold" style={{background:t.colors.surface,color:t.colors.primary}}>Cambiar</button></div>:<div><div className="mb-1 flex items-center justify-between"><label className="label">Dirección de entrega *</label><Link href="/cliente/perfil" className="text-[11px] font-semibold" style={{color:t.colors.primary}}>Administrar</Link></div><select className="field" required value={form.address_id} onChange={e=>{setForm({...form,address_id:e.target.value});if(e.target.value)setAddressPickerOpen(false)}}><option value="">Selecciona una dirección</option>{(customer?.addresses||[]).map((a:any)=><option key={a.id} value={a.id}>{a.label} · {a.formatted}</option>)}</select></div>}
              <div><label className="label">Zona de delivery *</label><select required className="field" value={form.shipping_zone_id} onChange={e=>setForm({...form,shipping_zone_id:e.target.value})}><option value="">Selecciona una zona</option>{data.shipping_zones.map((z:any)=><option key={z.id} value={z.id}>{z.name} · {money(z.charge)}</option>)}</select></div>
            </div>:<div className="mt-3 flex items-start gap-3 rounded-xl p-3" style={{background:t.colors.background}}><MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{color:t.colors.primary}}/><div><div className="text-[10px] font-bold uppercase tracking-wide" style={{color:t.colors.muted}}>Dirección de recogida</div><div className="mt-1 text-xs font-semibold">{s.address||'Coordina la recogida directamente con el negocio.'}</div></div></div>}
          </section>

          <section data-testid="storefront-cart-step-payment" className="p-4" style={{...surfaceStyle(t),boxShadow:'none'}}>
            <div className="mb-3"><div className="text-[10px] font-bold uppercase tracking-[.14em]" style={{color:t.colors.primary}}>2 · Método de pago</div><div className="mt-1 text-sm font-semibold">Selecciona cómo pagarás</div></div>
            <div className="grid gap-2 sm:grid-cols-2">{paymentOptions.map(k=><button data-testid="storefront-payment-option" type="button" key={k} onClick={()=>setForm({...form,payment_method:k})} className="relative flex items-center gap-2.5 p-3 text-left" style={{...surfaceStyle(t),boxShadow:'none',borderColor:form.payment_method===k?t.colors.primary:t.colors.border,background:form.payment_method===k?t.colors.background:t.colors.surface}}><WalletCards className="h-4 w-4 shrink-0" style={{color:t.colors.primary}}/><span className="text-sm font-bold">{payLabel[k]}</span>{form.payment_method===k&&<Check className="ml-auto h-4 w-4" style={{color:t.colors.primary}}/>}</button>)}</div>
            {form.payment_method==='bank_transfer'&&<div className="mt-3 rounded-xl p-3" style={{background:t.colors.background}}><div className="flex items-center gap-2 text-sm font-bold"><WalletCards className="h-4 w-4" style={{color:t.colors.primary}}/>Datos para transferencia</div><div className="mt-2 grid gap-1.5 text-xs sm:grid-cols-2"><div><span style={{color:t.colors.muted}}>Banco:</span> {s.bank_transfer?.bank_name||'Consultar al comercio'}</div><div><span style={{color:t.colors.muted}}>Cuenta:</span> {s.bank_transfer?.account_number||'—'}</div><div><span style={{color:t.colors.muted}}>Titular:</span> {s.bank_transfer?.account_name||'—'}</div><div><span style={{color:t.colors.muted}}>Tipo:</span> {s.bank_transfer?.account_type||'—'}</div></div></div>}
          </section>

          <section className="p-4" style={{...surfaceStyle(t),boxShadow:'none'}}><div className="text-[10px] font-bold uppercase tracking-[.14em]" style={{color:t.colors.primary}}>3 · Notas</div><label className="label mt-2">Indicaciones para el pedido <span className="font-normal" style={{color:t.colors.muted}}>(opcional)</span></label><textarea className="field min-h-20" placeholder="Ej.: llamar al llegar, sin servilletas..." value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></section>
        </div>
      </form>
      <div data-testid="storefront-cart-summary" className="shrink-0 p-4 sm:p-5" style={{borderTop:`1px solid ${t.colors.border}`,background:t.colors.surface}}>
        <div className="mb-3 rounded-2xl p-3.5 text-sm" style={{background:t.colors.background}}><div className="flex justify-between"><span style={{color:t.colors.muted}}>Subtotal</span><strong>{money(subtotal)}</strong></div>{form.delivery_type==='delivery'&&<div className="mt-2 flex justify-between"><span style={{color:t.colors.muted}}>Delivery</span><strong style={{color:t.colors.primary}}>{money(shipping)}</strong></div>}<div className="mt-3 flex justify-between pt-3 text-base" style={{borderTop:`1px solid ${t.colors.border}`}}><span>Total estimado</span><strong className="text-lg">{money(total)}</strong></div></div>
        <button type="submit" form="storefront-checkout-form" disabled={sending||!canOrder} className="w-full px-4 py-3 font-semibold disabled:opacity-50" style={buttonStyle(t)}>{sending?'Confirmando...':canOrder?'Confirmar pedido':'Pedidos no disponibles'}</button>
      </div>
    </>}
  </>

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
          <button onClick={()=>{setCheckout(false);setCartOpen(true)}} className="relative inline-flex items-center gap-2 px-3 py-2.5 text-sm font-semibold shadow-sm sm:px-4" style={buttonStyle(t)}><ShoppingBag className="h-4 w-4"/><span className="hidden lg:inline">Mi pedido</span>{itemCount>0&&<span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[11px] font-semibold text-slate-900">{itemCount}</span>}</button>
          {customer?<><Link href="/cliente/pedidos" className="hidden px-3 py-2.5 text-sm font-semibold lg:inline-flex" style={buttonStyle(t,true)}>Pedidos</Link><Link href="/cliente/perfil" className="inline-flex items-center gap-2 px-3 py-2.5 text-sm font-semibold" style={buttonStyle(t,true)}><span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full" style={{background:t.colors.background}}>{customer.profile_picture_url?<img src={customer.profile_picture_url} alt={customer.whatsapp_name||customer.name||'Perfil de WhatsApp'} className="h-full w-full object-cover"/>:<UserRound className="h-3.5 w-3.5"/>}</span><span className="hidden xl:inline">{customer.name}</span></Link></>:<button onClick={()=>setCustomerAuthOpen(true)} className="px-3 py-2.5 text-sm font-semibold sm:px-4" style={buttonStyle(t,true)}>Entrar</button>}
        </div>
      </div>
    </header>

    <main className={`mx-auto px-4 py-5 transition-[max-width,padding] duration-300 sm:px-6 sm:py-7 ${cartOpen?'max-w-[1680px] lg:pr-[480px]':'max-w-7xl'}`}>
      {!canOrder&&<div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><Clock3 className="mt-0.5 h-4 w-4 shrink-0"/><div><strong>{s.accepting_orders===false?'Pedidos pausados':'Estamos fuera de horario'}</strong><p className="mt-1 text-amber-800/80">Puedes explorar el catálogo ahora y volver a realizar tu pedido cuando la tienda esté disponible.</p></div></div>}
      <section className={`storefront-hero relative overflow-hidden ${heroHeight}`} style={{...heroBase,borderRadius:t.shape.radius,boxShadow:'var(--store-shadow)'}}>
        {(preset.id==='food-bold'||preset.id==='fresh-market'||preset.id==='beauty-soft')&&<><span className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10"/><span className="pointer-events-none absolute -bottom-24 right-[18%] h-52 w-52 rounded-full bg-white/10"/></>}
        {(t.hero.variant==='overlay'||t.hero.variant==='editorial')&&s.banner_url&&<img src={s.banner_url} alt="" className={`absolute inset-0 h-full w-full object-cover ${t.hero.variant==='editorial'?'opacity-20':''}`}/>} {t.hero.variant==='overlay'&&s.banner_url&&<div className="absolute inset-0 bg-gradient-to-r from-slate-950/70 via-slate-950/35 to-transparent"/>}
        {t.hero.variant==='split'&&<div className="absolute inset-y-0 right-0 hidden w-[44%] sm:block">{s.banner_url?<img src={s.banner_url} alt="" className="h-full w-full object-cover"/>:<div className="h-full w-full" style={{background:`linear-gradient(145deg,${t.colors.secondary},${t.colors.accent})`}}/>}<div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--store-primary)] to-transparent"/></div>}
        <div className={`relative flex h-full items-center p-6 sm:p-9 ${t.hero.variant==='editorial'?'justify-center text-center':''}`}><div className={`${t.hero.variant==='editorial'?'max-w-3xl':'max-w-2xl'} ${t.hero.variant==='split'?'sm:max-w-[52%]':''}`}><span className="inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[.14em]" style={{background:heroTextDark?t.colors.background:'rgba(255,255,255,.16)',color:heroTextDark?t.colors.primary:'#fff'}}>{heroLabel}</span><h2 className={`${t.typography.scale==='compact'?'text-3xl':t.typography.scale==='large'?'text-4xl sm:text-6xl':'text-3xl sm:text-5xl'} mt-3 font-semibold tracking-tight`} style={{fontFamily:'var(--store-heading-font)'}}>{s.name}</h2><p className="mt-3 max-w-xl text-sm leading-6 opacity-85 sm:text-base">{s.description||'Elige tus productos favoritos y haz tu pedido en pocos pasos.'}</p><div className={`mt-5 flex flex-wrap gap-2 ${t.hero.variant==='editorial'?'justify-center':''}`}>{s.whatsapp&&<a target="_blank" rel="noreferrer" href={`https://wa.me/${String(s.whatsapp).replace(/\D/g,'')}`} className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium" style={{background:heroTextDark?t.colors.background:'rgba(255,255,255,.16)',color:heroTextDark?t.colors.text:'#fff'}}><MessageCircleMore className="h-4 w-4"/>WhatsApp</a>}{s.address&&<span className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium" style={{background:heroTextDark?t.colors.background:'rgba(255,255,255,.16)',color:heroTextDark?t.colors.text:'#fff'}}><MapPin className="h-4 w-4"/>{s.address}</span>}{minimum>0&&<span className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium" style={{background:heroTextDark?t.colors.background:'rgba(255,255,255,.16)',color:heroTextDark?t.colors.text:'#fff'}}><ShoppingBag className="h-4 w-4"/>Mínimo {money(minimum)}</span>}</div></div></div>
      </section>
      {s.order_notice&&<div className="mt-4 flex items-start gap-3 p-4 text-sm" style={surfaceStyle(t)}><Clock3 className="mt-0.5 h-4 w-4 shrink-0" style={{color:t.colors.primary}}/><span style={{color:t.colors.muted}}>{s.order_notice}</span></div>}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">{perks.map((perk:any)=>{const I=perk.icon;return <div key={perk.title} className="flex items-center gap-3 px-3.5 py-3" style={{...surfaceStyle(t),boxShadow:'none'}}><span className="grid h-9 w-9 shrink-0 place-items-center" style={{borderRadius:t.shape.buttonRadius,background:t.colors.background,color:t.colors.primary}}><I className="h-4 w-4"/></span><div className="min-w-0"><div className="truncate text-xs font-bold">{perk.title}</div><div className="truncate text-[11px]" style={{color:t.colors.muted}}>{perk.detail}</div></div></div>})}</div>
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
            <div className="mt-auto flex items-end justify-between gap-2 pt-4"><div className="min-w-0"><div className="text-base font-bold" style={{color:t.colors.primary}}>{p.variants?.length&&<span className="mr-1 text-[10px] font-semibold uppercase tracking-wide" style={{color:t.colors.muted}}>Desde</span>}{money(productStartingPrice(p))}{weightedCfg.enabled&&<span className="ml-1 text-[10px] font-semibold" style={{color:t.colors.muted}}>/ {weightedCfg.unit}</span>}</div>{Number(p.compare_price||0)>productStartingPrice(p)&&<div className="text-[10px] line-through" style={{color:t.colors.muted}}>{money(Number(p.compare_price))}</div>}{cartQty>0&&<div data-testid="product-cart-summary" className="mt-1 text-[10px] font-bold" style={{color:t.colors.primary}}>{weightedCfg.enabled?`${formatCartQuantity(cartQty,weightedCfg.unit)} en tu pedido`:`${formatCartQuantity(cartQty)} en tu pedido`}</div>}</div><span className="grid h-9 w-9 shrink-0 place-items-center text-sm font-bold shadow-sm transition group-hover:scale-105" style={{...buttonStyle(t),borderRadius:t.shape.buttonRadius}}>{cartQty>0&&cartLines.length===1?<Check className="h-4 w-4"/>:<Plus className="h-4 w-4"/>}</span></div>
          </div>
        </button>
      })}</div>
      {products.length===0&&<div className="mt-8 p-10 text-center" style={surfaceStyle(t)}><StoreIcon className="mx-auto h-8 w-8 opacity-25"/><h3 className="mt-3 font-semibold">No hay productos en esta categoría</h3><p className="mt-1 text-sm" style={{color:t.colors.muted}}>Explora otra sección del catálogo.</p></div>}
      <footer className="mt-10 flex flex-col gap-3 border-t py-6 text-xs sm:flex-row sm:items-center sm:justify-between" style={{borderColor:t.colors.border,color:t.colors.muted}}><div><strong style={{color:t.colors.text}}>{s.name}</strong><span className="mx-2 opacity-40">•</span><span>Catálogo y pedidos en línea</span></div><div className="flex flex-wrap items-center gap-3">{s.whatsapp&&<a href={`https://wa.me/${String(s.whatsapp).replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="font-semibold" style={{color:t.colors.primary}}>Escribir por WhatsApp</a>}<span>Impulsado por WAMERCIO</span></div></footer>
    </main>

    {pick&&<div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button className="absolute inset-0 bg-slate-950/50" onClick={closeProduct}/>
      <div data-testid="storefront-product-modal" className="relative max-h-[92vh] w-full overflow-hidden rounded-t-[28px] sm:max-w-4xl" style={{background:t.colors.surface,color:t.colors.text,borderRadius:t.shape.radius}}>
        <button onClick={closeProduct} className="absolute right-4 top-4 z-20 grid h-9 w-9 place-items-center rounded-full bg-white/90 shadow"><X className="h-4 w-4"/></button>
        <div className="scroll-clean max-h-[92vh] overflow-y-auto sm:grid sm:max-h-[84vh] sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:overflow-hidden">
          <div data-testid="storefront-product-media" className="relative min-h-0 overflow-hidden" style={{background:t.colors.background}}>
            {pick.image_url?<img src={pick.image_url} alt={pick.name} className={`w-full object-cover ${ratioClass[t.products.imageRatio]||'aspect-[4/3]'} sm:h-full sm:aspect-auto`}/>:<div className="grid aspect-[4/3] w-full place-items-center sm:h-full sm:aspect-auto"><StoreIcon className="h-12 w-12 opacity-20"/></div>}
          </div>
          <div data-testid="storefront-product-details" className="p-5 sm:min-h-0 sm:overflow-y-auto sm:p-6">
          <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><h3 className="text-2xl font-semibold" style={{fontFamily:'var(--store-heading-font)'}}>{pick.name}</h3><p className="mt-2 text-sm leading-6" style={{color:t.colors.muted}}>{pick.description}</p></div>{editingKey&&<span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase" style={{background:t.colors.background,color:t.colors.primary}}>En tu pedido</span>}</div>
          <div className="mt-3 flex items-end justify-between gap-3"><div className="text-xl font-bold" style={{color:t.colors.primary}}>{money(unit||pick.price)}{weighted.enabled&&<span className="ml-1 text-xs font-semibold" style={{color:t.colors.muted}}>/ {weighted.unit}</span>}</div>{editingKey&&(pick.variants?.length>0||pick.extras?.length>0)&&<button type="button" onClick={resetAsNewCombination} className="text-xs font-semibold" style={{color:t.colors.primary}}>Agregar otra combinación</button>}</div>

          {pick.variants?.length>0&&<div className="mt-5"><p className="font-bold">Opciones</p><div className="mt-2 space-y-2">{pick.variants.map(v=><button key={v.name} onClick={()=>setVariant(v)} className="flex w-full items-center p-3 text-left" style={{...surfaceStyle(t),boxShadow:'none',borderColor:variant?.name===v.name?t.colors.primary:t.colors.border}}><span className="mr-3 grid h-5 w-5 place-items-center rounded-full border" style={{borderColor:variant?.name===v.name?t.colors.primary:t.colors.border,background:variant?.name===v.name?t.colors.primary:'transparent',color:'#fff'}}>{variant?.name===v.name&&<Check className="h-3 w-3"/>}</span><span className="font-medium">{v.name}</span><strong className="ml-auto">{money(v.price||pick.price)}</strong></button>)}</div></div>}

          {pick.extras?.length>0&&<div className="mt-5"><p className="font-bold">Adicionales</p><div className="mt-2 space-y-2">{pick.extras.map(x=>{const on=extras.some(e=>e.name===x.name);return <button key={x.name} onClick={()=>toggleExtra(x)} className="flex w-full items-center p-3 text-left" style={{...surfaceStyle(t),boxShadow:'none',borderColor:on?t.colors.primary:t.colors.border}}><span className="mr-3 grid h-5 w-5 place-items-center rounded-md border" style={{borderColor:on?t.colors.primary:t.colors.border,background:on?t.colors.primary:'transparent',color:'#fff'}}>{on&&<Check className="h-3 w-3"/>}</span><span>{x.name}</span><strong className="ml-auto">+ {money(x.price)}</strong></button>})}</div></div>}

          {weighted.enabled?<><div className="mt-5 space-y-3">
            {weighted.allowAmount&&<div className="grid grid-cols-2 gap-1 rounded-2xl p-1" style={{background:t.colors.background,border:`1px solid ${t.colors.border}`}}><button type="button" onClick={()=>setPurchaseMode('weight')} className="rounded-xl px-3 py-2.5 text-sm font-bold" style={{background:purchaseMode==='weight'?t.colors.surface:'transparent',color:purchaseMode==='weight'?t.colors.primary:t.colors.muted}}>Libra</button><button type="button" onClick={()=>{setPurchaseMode('amount');if(!amountValue)setAmountValue(Math.max(1,Math.round(unit)))}} className="rounded-xl px-3 py-2.5 text-sm font-bold" style={{background:purchaseMode==='amount'?t.colors.surface:'transparent',color:purchaseMode==='amount'?t.colors.primary:t.colors.muted}}>Monto</button></div>}
            <div className="p-4" style={{...surfaceStyle(t),boxShadow:'none'}}><div className="flex items-center justify-between gap-3"><div><p className="font-bold">Introduce la cantidad</p><p className="mt-1 text-xs" style={{color:t.colors.muted}}>{purchaseMode==='amount'?`WAMERCIO calcula el peso aproximado según ${money(unit)} / ${weighted.unit}.`:`Compra desde ${formatCartQuantity(weighted.minimum,weighted.unit)}.`}</p></div>{purchaseMode==='amount'?<div className="flex h-11 min-w-36 items-center gap-2 rounded-xl px-3" style={{border:`1px solid ${t.colors.border}`}}><span className="text-sm font-bold" style={{color:t.colors.primary}}>RD$</span><input aria-label="Monto que quieres comprar" inputMode="numeric" type="number" min="1" step="1" value={amountValue||''} onChange={e=>setAmountValue(Math.max(0,Number(e.target.value)))} className="w-24 bg-transparent text-center font-bold outline-none"/></div>:<div className="flex h-11 items-center" style={{border:`1px solid ${t.colors.border}`,borderRadius:t.shape.buttonRadius}}><button type="button" onClick={()=>setQty(roundQuantity(Math.max(weighted.minimum,qty-weighted.increment)))} className="p-3"><Minus className="h-4 w-4"/></button><input aria-label="Cantidad de libras" inputMode="decimal" type="number" min={weighted.minimum} step={weighted.increment} value={qty} onChange={e=>setQty(roundQuantity(Math.max(weighted.minimum,Number(e.target.value)||weighted.minimum)))} className="w-16 bg-transparent text-center font-bold outline-none"/><span className="pr-2 text-xs font-bold" style={{color:t.colors.primary}}>{weighted.unit}</span><button type="button" onClick={()=>setQty(roundQuantity(qty+weighted.increment))} className="p-3"><Plus className="h-4 w-4"/></button></div>}</div><div className="mt-3 flex items-center justify-between rounded-xl px-3 py-2" style={{background:t.colors.background}}><span className="text-[10px] font-bold uppercase tracking-wide" style={{color:t.colors.muted}}>{purchaseMode==='amount'?'Peso aproximado':'Total'}</span><strong style={{color:t.colors.primary}}>{purchaseMode==='amount'?formatCartQuantity(selectedQuantity,weighted.unit):money(selectionTotal)}</strong></div></div>
          </div><button disabled={!canOrder||selectedQuantity<=0} onClick={saveProductSelection} className="mt-5 w-full px-4 py-3 font-semibold disabled:opacity-50" style={buttonStyle(t)}>{canOrder?`${editingKey?'Actualizar mi pedido':'Agregar a mi pedido'} · ${money(selectionTotal)}`:'Pedidos no disponibles'}</button></>:<div data-testid="storefront-product-actions" className="mt-5 flex items-center gap-3"><div className="flex shrink-0 items-center" style={{border:`1px solid ${t.colors.border}`,borderRadius:t.shape.buttonRadius}}><button type="button" onClick={()=>setQty(Math.max(1,qty-1))} className="p-3"><Minus className="h-4 w-4"/></button><span className="w-10 text-center font-bold">{formatCartQuantity(qty)}</span><button type="button" onClick={()=>setQty(qty+1)} className="p-3"><Plus className="h-4 w-4"/></button></div><button disabled={!canOrder||selectedQuantity<=0} onClick={saveProductSelection} className="min-w-0 flex-1 px-4 py-3 font-semibold disabled:opacity-50" style={buttonStyle(t)}>{canOrder?`${editingKey?'Actualizar mi pedido':'Agregar a mi pedido'} · ${money(selectionTotal)}`:'Pedidos no disponibles'}</button></div>}
          </div>
        </div>
      </div>
    </div>}

    {cartOpen&&<>
      <div data-testid="storefront-mobile-cart" className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={closeCart}/>
      <aside data-testid="storefront-desktop-cart" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col overflow-hidden shadow-2xl lg:bottom-0 lg:top-[69px] lg:z-20 lg:w-[460px] lg:border-l lg:shadow-[-16px_0_40px_rgba(15,23,42,.08)]" style={{background:t.colors.surface,color:t.colors.text,borderColor:t.colors.border}}>{cartPanel}</aside>
    </>}

    {cartNotice&&<div className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-1/2 z-[65] -translate-x-1/2 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white shadow-xl lg:bottom-6">{cartNotice}</div>}

    <StorefrontMobileNav itemCount={itemCount} customer={customer} primaryColor={t.colors.primary} onSearch={()=>{window.scrollTo({top:0,behavior:'smooth'});window.setTimeout(()=>{const el=document.getElementById('storefront-search') as HTMLInputElement|null;el?.focus();setSearchOpen(true)},220)}} onCart={()=>{setCartOpen(true);setCheckout(false)}} onLogin={()=>setCustomerAuthOpen(true)}/>
    <CustomerAccessModal open={customerAuthOpen} onClose={()=>setCustomerAuthOpen(false)} onAuthenticated={c=>{applyCustomer(c);setCustomerAuthOpen(false);if(cart.length){setCartOpen(true);setCheckout(true)}}}/>

    {done&&<div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4"><div className="w-full max-w-md p-7 text-center shadow-2xl" style={{background:t.colors.surface,color:t.colors.text,borderRadius:t.shape.radius}}><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check className="h-8 w-8"/></div><h3 className="mt-4 text-2xl font-semibold" style={{fontFamily:'var(--store-heading-font)'}}>¡Pedido recibido!</h3><p className="mt-2" style={{color:t.colors.muted}}>Tu pedido <strong>#{done.number}</strong> fue registrado correctamente.</p><div className="mt-5 p-4" style={{background:t.colors.background,borderRadius:t.shape.radius}}><div className="text-sm" style={{color:t.colors.muted}}>Total</div><div className="text-2xl font-semibold">{money(done.total)}</div><div className="mt-1 text-xs" style={{color:t.colors.muted}}>{payLabel[done.payment_method]||''}</div></div>{done.payment_method==='bank_transfer'&&<p className="mt-3 text-xs leading-5" style={{color:t.colors.muted}}>Realiza la transferencia y sube tu comprobante desde el seguimiento del pedido.</p>}{done.tracking_url&&<a href={done.tracking_url} className="mt-5 inline-flex w-full items-center justify-center px-4 py-3 font-semibold" style={buttonStyle(t,true)}>Ver seguimiento{done.payment_method==='bank_transfer'?' y comprobante':''}</a>}<button onClick={()=>setDone(null)} className="mt-2 w-full px-4 py-3 font-semibold" style={buttonStyle(t)}>Seguir comprando</button></div></div>}
  </div>
}
