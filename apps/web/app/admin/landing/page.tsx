'use client'

import {useEffect,useMemo,useState,type ReactNode} from 'react'
import SuperAdminShell from '@/components/superadmin-shell'
import {api} from '@/lib/api'
import {Alert,Loading} from '@/components/ui'
import {Check,Copy,Eye,Globe2,RotateCcw,Save,ShieldCheck,Store} from 'lucide-react'

const landingDefaults={
 brand_name:'WAMERCIO',brand_subtitle:'Comercio conversacional',nav_features_label:'Cómo funciona',nav_product_label:'Funciones',nav_prices_label:'Precios',nav_demo_label:'Demo',nav_access_label:'Acceso',
 hero_badge:'Comercios dominicanos',hero_kicker:'WhatsApp-first',hero_title:'Toda tu tienda funciona dentro de WhatsApp.',hero_subtitle:'Crea tu catálogo una sola vez. Tus clientes navegan, preguntan y piden sin salir de la conversación, mientras WAMERCIO mantiene pedidos, inventario y clientes organizados.',access_label:'Crear mi comercio',demo_label:'Ver precios',
 hero_mock_store_name:'Mi tienda',hero_mock_catalog_status:'Catálogo activo',hero_mock_orders_label:'Pedidos',hero_mock_sales_label:'Ventas',
 feature_1_title:'Catálogo listo una sola vez',feature_1_text:'Crea productos, precios, variantes e inventario desde un panel pensado para vender por conversación.',feature_2_title:'Toma el pedido en el chat',feature_2_text:'Conecta WhatsApp y convierte conversaciones reales en pedidos organizados sin perder contexto.',feature_3_title:'Cobra como trabaja tu negocio',feature_3_text:'Efectivo, transferencia, terminal y métodos locales, con el estado del cobro ligado al pedido.',feature_4_title:'Entrega sin romper la conversación',feature_4_text:'Coordina entrega, dirección, zonas y seguimiento sin obligar al cliente a abandonar WhatsApp.',feature_5_title:'Ventas que sí puedes medir',feature_5_text:'Consulta pedidos, ingresos, productos y movimientos con una lectura clara de lo que está pasando.',feature_6_title:'Conoce a cada cliente',feature_6_text:'Une el contacto de WhatsApp con compras, notas, direcciones y conversaciones anteriores.',features_strip_primary:'WAMERCIO organiza catálogo, pedidos, clientes y WhatsApp en un solo lugar.',features_strip_secondary:'Tu operación sigue siendo simple aunque tu negocio crezca.',
 process_title:'Un toque en un enlace. Lo demás es una conversación.',process_subtitle:'Sin carrito complicado, sin formularios eternos y sin obligar al cliente a instalar otra aplicación.',process_customer_title:'Para tus clientes',process_customer_text:'Abren el catálogo, eligen y continúan el pedido desde la conversación que ya conocen.',process_business_title:'Para tu comercio',process_business_text:'Recibes el pedido estructurado, atiendes WhatsApp y conservas todo el historial comercial.',process_mock_store_title:'Mi Comercio',process_mock_products_title:'Productos destacados',process_mock_order_title:'Tu pedido',process_mock_button_label:'Enviar pedido',
 plans_title:'Planes WAMERCIO',plans_subtitle:'Empieza simple y crece cuando tu comercio lo necesite.',plans_button_label:'Empezar ahora',plans_empty_text:'Los planes estarán disponibles muy pronto.',plan_default_description:'Todo lo necesario para operar tu comercio.',plan_whatsapp_feature:'WhatsApp incluido',plan_orders_feature:'Pedidos sin bloqueo',
 demo_badge:'Demo',demo_title:'Prueba la experiencia desde tu celular',demo_text:'Escanea el QR para abrir WAMERCIO. No necesitas instalar nada; el panel también funciona como PWA.',demo_button_label:'Probar en la web',
 closing_badge:'WAMERCIO',closing_title:'Todo tu comercio, más cerca de tus clientes',closing_1_title:'Tienda online',closing_1_text:'Comparte tu catálogo con enlace o QR y mantenlo actualizado desde cualquier dispositivo.',closing_2_title:'Cobros sencillos',closing_2_text:'Configura efectivo, transferencia electrónica o tarjeta en terminal según tu forma de operar.',closing_3_title:'Historial completo',closing_3_text:'Pedidos, clientes, conversaciones y movimientos conectados en un mismo flujo.',
 footer_brand:'WAMERCIO',footer_text:'Comercio y pedidos por WhatsApp, simplificados.',footer_features_label:'Funciones',footer_plans_label:'Planes',footer_access_label:'Crear mi comercio',footer_admin_label:'SuperAdmin',
 maintenance_mode:false,maintenance_badge:'Mantenimiento programado',maintenance_title:'Estamos realizando mejoras en la página principal',maintenance_text:'La página principal estará temporalmente en mantenimiento. Los negocios activos continúan operando desde sus enlaces públicos.',maintenance_button_label:'Entrar al panel de administración',
}

function FormCard({title,hint,children}:{title:string;hint?:string;children:ReactNode}){
 return <section className="admin-form-card"><h2 className="admin-form-title">{title}</h2>{hint&&<p className="admin-form-hint">{hint}</p>}<div className="mt-4">{children}</div></section>
}

export default function LandingSettings(){
 const[data,setData]=useState<any>(null),[initial,setInitial]=useState<any>(null),[err,setErr]=useState(''),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false)
 useEffect(()=>{api('/admin/platform/landing').then(x=>{const merged={...landingDefaults,...x};setData(merged);setInitial(merged)}).catch(e=>setErr(e.message))},[])
 const domain=typeof window!=='undefined'?window.location.hostname:'wamercio.com'
 const publicURL=typeof window!=='undefined'?window.location.origin:`https://${domain}`
 const replace=(v:string)=>String(v||'').replaceAll('{domain}',domain)
 const update=(key:string,value:any)=>{setSaved(false);setData((current:any)=>({...current,[key]:value}))}
 const dirty=useMemo(()=>data&&initial?JSON.stringify(data)!==JSON.stringify(initial):false,[data,initial])
 const preview=useMemo(()=>data?{title:replace(data.hero_title),subtitle:replace(data.hero_subtitle),badge:replace(data.hero_badge),kicker:replace(data.hero_kicker)}:null,[data,domain])
 const save=async()=>{if(!data||busy)return;setErr('');setSaved(false);setBusy(true);try{const out=await api('/admin/platform/landing',{method:'PUT',body:JSON.stringify(data)});const merged={...landingDefaults,...out};setData(merged);setInitial(merged);setSaved(true)}catch(e:any){setErr(e.message)}finally{setBusy(false)}}
 const copy=async()=>{try{await navigator.clipboard.writeText(publicURL);setCopied(true);setTimeout(()=>setCopied(false),1600)}catch{setErr('No se pudo copiar la dirección.')}}
 const reset=()=>{if(!window.confirm('¿Restaurar los textos base? Los cambios no se publicarán hasta presionar Guardar.'))return;setData({...landingDefaults});setSaved(false)}
 if(!data)return <SuperAdminShell title="Página comercial" subtitle="Configura la experiencia pública de WAMERCIO."><Loading/></SuperAdminShell>
 const textInput=(label:string,key:string,placeholder='')=><div><label className="label">{label}</label><input className="field" value={data[key]||''} placeholder={placeholder} onChange={e=>update(key,e.target.value)}/></div>
 const textArea=(label:string,key:string,rows=3)=><div><label className="label">{label}</label><textarea rows={rows} className="field resize-y" value={data[key]||''} onChange={e=>update(key,e.target.value)}/></div>
 const actions=<><a href="/" target="_blank" rel="noreferrer" className="btn-secondary"><Eye className="h-4 w-4"/>Vista pública</a><button className="btn-primary" disabled={busy||!dirty} onClick={()=>void save()}><Save className="h-4 w-4"/>{busy?'Guardando...':'Guardar cambios'}</button></>
 return <SuperAdminShell title="Página comercial" subtitle="Tu escaparate público: textos, navegación, planes y estado de publicación." actions={actions}>
  {err&&<Alert text={err}/>} {saved&&<Alert type="success" text="Cambios guardados y publicados correctamente."/>}

  <div className="admin-live-strip mb-4" data-live={!data.maintenance_mode}>
   <div className="flex items-start gap-3"><span className={`grid h-11 w-11 place-items-center rounded-xl ${data.maintenance_mode?'bg-[#e7e1d8] text-[#718078]':'bg-[#dff4e7] text-[#0b5d3b]'}`}><Store className="h-5 w-5"/></span><div><div className="font-[Bricolage_Grotesque] text-base font-bold text-[#0a3f2a]">{data.maintenance_mode?'Página comercial en mantenimiento':'Página comercial publicada'}</div><p className="mt-1 text-[13px] text-[#718078]">{data.maintenance_mode?'Los paneles y tiendas continúan operando; solo se pausa la portada principal.':'Los visitantes pueden abrir la página pública y comenzar el registro comercial.'}</p></div></div>
   <label className="flex cursor-pointer items-center gap-3"><span className="text-sm font-semibold text-[#0a3f2a]">Publicada</span><button type="button" className="admin-switch" data-on={!data.maintenance_mode} onClick={()=>update('maintenance_mode',!data.maintenance_mode)} aria-label="Cambiar estado de publicación" aria-pressed={!data.maintenance_mode}/></label>
  </div>

  <div className="grid gap-4 xl:grid-cols-3">
   <div className="flex flex-col gap-4 xl:col-span-2">
    <FormCard title="Dirección web" hint="Enlace oficial de la página comercial de WAMERCIO.">
     <div><label className="label">Dirección pública</label><div className="flex items-center gap-2 rounded-xl border border-[#e6ded1] bg-[#f8f4ed] px-3 py-2.5"><Globe2 className="h-4 w-4 shrink-0 text-[#0b5d3b]"/><span className="min-w-0 flex-1 truncate text-sm text-[#46584f]">{publicURL}</span><button type="button" onClick={()=>void copy()} className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-[#0b5d3b]">{copied?<Check className="h-4 w-4"/>:<Copy className="h-4 w-4"/>}{copied?'Copiado':'Copiar'}</button></div></div>
    </FormCard>

    <FormCard title="Marca y navegación" hint="Textos de la cabecera principal y accesos de navegación.">
     <div className="grid gap-4 sm:grid-cols-2">{textInput('Nombre visible','brand_name')}{textInput('Subtítulo','brand_subtitle')}{textInput('Menú · Cómo funciona','nav_features_label')}{textInput('Menú · Funciones','nav_product_label')}{textInput('Menú · Precios','nav_prices_label')}{textInput('Menú · Demo','nav_demo_label')}{textInput('Botón de acceso','nav_access_label')}</div>
    </FormCard>

    <FormCard title="Contenido principal" hint="Primer mensaje que ve el visitante al entrar en la landing.">
     <div className="grid gap-4 sm:grid-cols-2">{textInput('Insignia','hero_badge')}{textInput('Línea introductoria','hero_kicker')}</div><div className="mt-4 space-y-4">{textArea('Título principal','hero_title',2)}{textArea('Descripción principal','hero_subtitle',4)}<div className="grid gap-4 sm:grid-cols-2">{textInput('Botón principal','access_label')}{textInput('Botón secundario','demo_label')}</div></div>
    </FormCard>

    <FormCard title="Mockup del producto" hint="Etiquetas que aparecen dentro de la representación visual del panel.">
     <div className="grid gap-4 sm:grid-cols-2">{textInput('Nombre de tienda','hero_mock_store_name')}{textInput('Estado del catálogo','hero_mock_catalog_status')}{textInput('Etiqueta pedidos','hero_mock_orders_label')}{textInput('Etiqueta ventas','hero_mock_sales_label')}</div>
    </FormCard>

    <FormCard title="Beneficios" hint="Seis tarjetas funcionales que explican la propuesta de valor.">
     <div className="grid gap-3 lg:grid-cols-2">{[1,2,3,4,5,6].map(n=><div key={n} className="rounded-xl border border-[#eee8df] bg-[#fcfaf6] p-4"><div className="mb-3 text-[10px] font-bold uppercase tracking-[.13em] text-[#718078]">Tarjeta {n}</div><div className="space-y-3">{textInput('Título',`feature_${n}_title`)}{textArea('Descripción',`feature_${n}_text`,3)}</div></div>)}</div><div className="mt-4 grid gap-4 sm:grid-cols-2">{textArea('Franja destacada 1','features_strip_primary',2)}{textArea('Franja destacada 2','features_strip_secondary',2)}</div>
    </FormCard>

    <FormCard title="Cómo funciona" hint="Explica el flujo de compra desde el punto de vista del cliente y del comercio.">
     <div className="space-y-4">{textInput('Título de sección','process_title')}{textArea('Subtítulo','process_subtitle',2)}<div className="grid gap-4 sm:grid-cols-2"><div className="space-y-3 rounded-xl border border-[#eee8df] p-4">{textInput('Título · Clientes','process_customer_title')}{textArea('Texto · Clientes','process_customer_text',3)}</div><div className="space-y-3 rounded-xl border border-[#eee8df] p-4">{textInput('Título · Comercio','process_business_title')}{textArea('Texto · Comercio','process_business_text',3)}</div></div><div className="grid gap-4 sm:grid-cols-2">{textInput('Mockup · Comercio','process_mock_store_title')}{textInput('Mockup · Productos','process_mock_products_title')}{textInput('Mockup · Pedido','process_mock_order_title')}{textInput('Mockup · Botón','process_mock_button_label')}</div></div>
    </FormCard>

    <FormCard title="Planes" hint="Los precios y límites se administran en Planes; aquí controlas únicamente los textos de la sección.">
     <div className="grid gap-4 sm:grid-cols-2">{textInput('Título','plans_title')}{textInput('Botón','plans_button_label')}</div><div className="mt-4">{textArea('Subtítulo','plans_subtitle',2)}</div><div className="mt-4 grid gap-4 sm:grid-cols-2">{textInput('Descripción por defecto','plan_default_description')}{textInput('Texto sin planes','plans_empty_text')}{textInput('Beneficio WhatsApp','plan_whatsapp_feature')}{textInput('Beneficio pedidos','plan_orders_feature')}</div>
    </FormCard>

    <FormCard title="Demo desde el celular">
     <div className="grid gap-4 sm:grid-cols-2">{textInput('Insignia','demo_badge')}{textInput('Botón','demo_button_label')}</div><div className="mt-4 space-y-4">{textInput('Título','demo_title')}{textArea('Descripción','demo_text',3)}</div>
    </FormCard>

    <FormCard title="Cierre comercial">
     <div className="grid gap-4 sm:grid-cols-2">{textInput('Insignia','closing_badge')}{textInput('Título','closing_title')}</div><div className="mt-4 grid gap-3 lg:grid-cols-3">{[1,2,3].map(n=><div key={n} className="space-y-3 rounded-xl border border-[#eee8df] bg-[#fcfaf6] p-4">{textInput(`Tarjeta ${n} · Título`,`closing_${n}_title`)}{textArea(`Tarjeta ${n} · Texto`,`closing_${n}_text`,3)}</div>)}</div>
    </FormCard>

    <FormCard title="Pie de página">
     <div className="grid gap-4 sm:grid-cols-2">{textInput('Marca','footer_brand')}{textInput('Descripción','footer_text')}{textInput('Enlace · Funciones','footer_features_label')}{textInput('Enlace · Planes','footer_plans_label')}{textInput('Enlace · Crear comercio','footer_access_label')}{textInput('Enlace · SuperAdmin','footer_admin_label')}</div>
    </FormCard>

    <FormCard title="Mantenimiento" hint="Mensaje mostrado únicamente cuando la página comercial está pausada.">
     <div className="admin-setting-row"><div><div className="text-sm font-semibold text-[#0a3f2a]">Modo mantenimiento</div><p className="mt-1 text-[13px] text-[#718078]">No afecta las tiendas públicas ni los paneles de comerciantes.</p></div><button type="button" className="admin-switch" data-on={!!data.maintenance_mode} onClick={()=>update('maintenance_mode',!data.maintenance_mode)} aria-pressed={!!data.maintenance_mode}/></div>
     {data.maintenance_mode&&<div className="mt-4 space-y-4">{textInput('Insignia','maintenance_badge')}{textInput('Título','maintenance_title')}{textArea('Mensaje','maintenance_text',3)}{textInput('Botón','maintenance_button_label')}</div>}
    </FormCard>

    <div className="admin-form-actions"><button type="button" className="btn-secondary mr-auto" onClick={reset}><RotateCcw className="h-4 w-4"/>Restaurar base</button><a href="/" target="_blank" rel="noreferrer" className="btn-secondary"><Eye className="h-4 w-4"/>Vista pública</a><button type="button" className="btn-primary" disabled={busy||!dirty} onClick={()=>void save()}><Save className="h-4 w-4"/>{busy?'Guardando...':'Guardar cambios'}</button></div>
   </div>

   <aside className="flex h-fit flex-col gap-4 xl:sticky xl:top-20">
    <FormCard title="Vista previa" hint="Resumen del hero con los textos que estás editando.">
     <div className="rounded-2xl bg-[#0b5d3b] p-5 text-white shadow-[0_16px_40px_rgba(11,93,59,.17)]"><div className="text-[9px] font-bold uppercase tracking-[.16em] text-white/65">{preview?.badge}</div><div className="mt-4 text-xs font-semibold text-white/75">{preview?.kicker}</div><h3 className="mt-1 text-[26px] font-extrabold leading-[1.08] text-white">{preview?.title}</h3><p className="mt-3 text-[12px] leading-5 text-white/75">{preview?.subtitle}</p><div className="mt-5 flex flex-wrap gap-2"><span className="rounded-full bg-white px-3 py-2 text-[10px] font-bold text-[#0b5d3b]">{data.access_label}</span><span className="rounded-full border border-white/40 px-3 py-2 text-[10px] font-bold text-white">{data.demo_label}</span></div></div>
    </FormCard>
    <FormCard title="Publicación">
     <div className="space-y-3"><div className="flex items-center justify-between rounded-xl border border-[#eee8df] bg-[#fcfaf6] p-3"><span className="text-xs font-semibold text-[#46584f]">Estado</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${data.maintenance_mode?'bg-[#f3eee5] text-[#718078]':'bg-[#e3f6ea] text-[#0b5d3b]'}`}>{data.maintenance_mode?'Mantenimiento':'Publicada'}</span></div><div className="flex items-center justify-between rounded-xl border border-[#eee8df] bg-[#fcfaf6] p-3"><span className="text-xs font-semibold text-[#46584f]">Cambios pendientes</span><span className={`text-xs font-bold ${dirty?'text-[#bd431e]':'text-[#0b5d3b]'}`}>{dirty?'Sí':'No'}</span></div><div className="rounded-xl border border-[#d7eadf] bg-[#eef8f3] p-3 text-[11px] leading-5 text-[#466257]"><ShieldCheck className="mb-2 h-4 w-4 text-[#0b5d3b]"/>Los cambios se guardan en el backend central y la landing pública los consume desde la configuración de plataforma.</div></div>
    </FormCard>
   </aside>
  </div>
 </SuperAdminShell>
}
