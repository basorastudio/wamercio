'use client'

import {useEffect,useMemo,useState,type ReactNode} from 'react'
import SuperAdminShell from '@/components/superadmin-shell'
import {api} from '@/lib/api'
import {Alert,Loading} from '@/components/ui'
import {Eye,RotateCcw,Save,ShieldCheck} from 'lucide-react'

const landingDefaults={
 brand_name:'WAMERCIO',
 brand_subtitle:'Comercio conversacional',
 nav_features_label:'Funciones',
 nav_product_label:'Producto',
 nav_prices_label:'Precios',
 nav_demo_label:'Demo',
 nav_access_label:'Acceder',
 nav_register_label:'Registrarme',
 hero_badge:'Comercio conversacional hecho en República Dominicana 🇩🇴',
 hero_kicker:'Simple y amigable',
 hero_title:'Tu comercio y tus pedidos más fáciles con WhatsApp.',
 hero_subtitle:'Crea tu tienda digital, comparte tu catálogo, recibe pedidos y administra clientes desde WAMERCIO. Sin complicaciones y pensado para vender desde el celular.',
 access_label:'Acceder',
 demo_label:'Ver demo',
 hero_mock_store_name:'Mi tienda',
 hero_mock_catalog_status:'Catálogo activo',
 hero_mock_orders_label:'Pedidos',
 hero_mock_sales_label:'Ventas',
 feature_1_title:'Crea tu tienda',
 feature_1_text:'Configura tu comercio, catálogo, horarios y forma de entrega desde un panel simple.',
 feature_2_title:'Pedidos por WhatsApp',
 feature_2_text:'Conecta WhatsApp, conversa con clientes y lleva cada pedido al panel de WAMERCIO.',
 feature_3_title:'Métodos de pago simples',
 feature_3_text:'Efectivo, transferencia electrónica o tarjeta en terminal, sin obligarte a contratar una pasarela.',
 feature_4_title:'Empieza a vender rápido',
 feature_4_text:'Comparte tu tienda por enlace o QR y comienza a recibir pedidos desde cualquier teléfono.',
 feature_5_title:'Ventas y pedidos',
 feature_5_text:'Consulta pedidos, clientes, movimientos e inventario con una vista clara de tu operación.',
 feature_6_title:'Conoce a tus clientes',
 feature_6_text:'Historial, teléfonos, compras, notas y datos de entrega organizados en un solo lugar.',
 features_strip_primary:'WAMERCIO organiza catálogo, pedidos, clientes y WhatsApp en un solo lugar.',
 features_strip_secondary:'Tu operación sigue siendo simple aunque tu negocio crezca.',
 process_title:'No existe un proceso más simple',
 process_subtitle:'Administrar pedidos puede sentirse tan fácil como conversar con un cliente.',
 process_customer_title:'Para tus clientes',
 process_customer_text:'Tus clientes abren tu catálogo desde un enlace o QR, eligen sus productos y envían el pedido sin instalar aplicaciones.',
 process_business_title:'Para tu comercio',
 process_business_text:'Recibes pedidos en WAMERCIO, actualizas estados, atiendes WhatsApp, controlas clientes y mantienes todo el historial organizado.',
 process_mock_store_title:'Mi Comercio',
 process_mock_products_title:'Productos destacados',
 process_mock_order_title:'Tu pedido',
 process_mock_button_label:'Enviar pedido',
 plans_title:'Planes WAMERCIO',
 plans_subtitle:'Empieza simple y crece cuando tu comercio lo necesite.',
 plans_button_label:'Empezar ahora',
 plans_empty_text:'Los planes estarán disponibles muy pronto.',
 plan_default_description:'Todo lo necesario para operar tu comercio.',
 plan_whatsapp_feature:'WhatsApp incluido',
 plan_orders_feature:'Pedidos sin bloqueo',
 demo_badge:'Demo',
 demo_title:'Prueba la experiencia desde tu celular',
 demo_text:'Escanea el QR para abrir WAMERCIO. No necesitas instalar nada; el panel también funciona como PWA.',
 demo_button_label:'Probar en la web',
 closing_badge:'WAMERCIO',
 closing_title:'Todo tu comercio, más cerca de tus clientes',
 closing_1_title:'Tienda online',
 closing_1_text:'Comparte tu catálogo con enlace o QR y mantenlo actualizado desde cualquier dispositivo.',
 closing_2_title:'Cobros sencillos',
 closing_2_text:'Configura efectivo, transferencia electrónica o tarjeta en terminal según tu forma de operar.',
 closing_3_title:'Historial completo',
 closing_3_text:'Pedidos, clientes, conversaciones y movimientos conectados en un mismo flujo.',
 footer_brand:'WAMERCIO',
 footer_text:'Comercio y pedidos por WhatsApp, simplificados.',
 footer_features_label:'Funciones',
 footer_plans_label:'Planes',
 footer_access_label:'Acceder',
 footer_admin_label:'SuperAdmin',
 maintenance_mode:false,
 maintenance_badge:'Mantenimiento programado',
 maintenance_title:'Estamos realizando mejoras en la página principal',
 maintenance_text:'La página principal estará temporalmente en mantenimiento. Los negocios activos continúan operando desde sus enlaces públicos.',
 maintenance_button_label:'Entrar al panel de administración',
}

function EditorSection({eyebrow,title,description,children}:{eyebrow:string;title:string;description?:string;children:ReactNode}){
 return <section className="rounded-3xl border border-[#edf0f5] bg-white p-5 sm:p-6">
  <div className="mb-5"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-brand-600">{eyebrow}</div><h3 className="mt-1 text-base font-semibold text-ink-900">{title}</h3>{description&&<p className="mt-1 text-xs leading-5 text-[#9298ad]">{description}</p>}</div>
  {children}
 </section>
}

export default function LandingSettings(){
 const[data,setData]=useState<any>(null),[err,setErr]=useState(''),[saved,setSaved]=useState(false)
 useEffect(()=>{api('/admin/platform/landing').then(x=>setData({...landingDefaults,...x})).catch(e=>setErr(e.message))},[])
 const domain=typeof window!=='undefined'?window.location.hostname:'wamercio.com'
 const replace=(v:string)=>String(v||'').replaceAll('{domain}',domain)
 const update=(key:string,value:any)=>setData((current:any)=>({...current,[key]:value}))
 const save=async()=>{setErr('');setSaved(false);try{await api('/admin/platform/landing',{method:'PUT',body:JSON.stringify(data)});setSaved(true)}catch(e:any){setErr(e.message)}}
 const preview=useMemo(()=>data?{title:replace(data.hero_title),subtitle:replace(data.hero_subtitle),badge:replace(data.hero_badge),kicker:replace(data.hero_kicker)}:null,[data,domain])
 if(!data)return <SuperAdminShell title="Página comercial" subtitle="Personalización de la página comercial"><Loading/></SuperAdminShell>
 const textInput=(label:string,key:string)=><div><label className="label">{label}</label><input className="field" value={data[key]||''} onChange={e=>update(key,e.target.value)}/></div>
 const textArea=(label:string,key:string,min='min-h-24')=><div><label className="label">{label}</label><textarea className={`field ${min} resize-y`} value={data[key]||''} onChange={e=>update(key,e.target.value)}/></div>
 return <SuperAdminShell title="Página comercial" subtitle="Personalización de la página comercial" actions={<><a href="/" target="_blank" className="btn-secondary"><Eye className="h-4 w-4"/>Vista pública</a><button className="btn-primary" onClick={save}><Save className="h-4 w-4"/>Guardar</button></>}>
  <div className="grid gap-5 xl:h-[calc(100dvh-9rem)] xl:min-h-0 xl:grid-cols-[1.35fr_.65fr] xl:items-stretch">
   <section className="card min-h-0 overflow-hidden xl:flex xl:h-full xl:flex-col">
    <div className="border-b border-[#edf0f5] p-5 sm:p-6"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-brand-600">Página comercial</div><h2 className="mt-1 text-xl font-semibold">Personalización de la página comercial</h2><p className="mt-1 text-sm text-[#8d92aa]">Edita el contenido visible de la landing de WAMERCIO. Puedes usar <strong>{'{domain}'}</strong> en cualquier texto.</p></div>
    <div className="space-y-5 p-5 sm:p-6 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain">
     {err&&<Alert text={err}/>} {saved&&<div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">Cambios guardados correctamente.</div>}

     <EditorSection eyebrow="Identidad" title="Marca y navegación" description="Textos de cabecera que aparecen antes del contenido principal.">
      <div className="grid gap-4 sm:grid-cols-2">{textInput('Nombre visible','brand_name')}{textInput('Subtítulo','brand_subtitle')}{textInput('Menú · Funciones','nav_features_label')}{textInput('Menú · Producto','nav_product_label')}{textInput('Menú · Precios','nav_prices_label')}{textInput('Menú · Demo','nav_demo_label')}{textInput('Botón cabecera · Acceder','nav_access_label')}{textInput('Botón cabecera · Registrarme','nav_register_label')}</div>
     </EditorSection>

     <EditorSection eyebrow="Hero" title="Bloque principal" description="Primer mensaje que ve el visitante al abrir la página.">
      <div className="space-y-4">{textInput('Insignia principal','hero_badge')}{textInput('Línea introductoria','hero_kicker')}{textArea('Título principal','hero_title')}{textArea('Texto principal','hero_subtitle','min-h-28')}<div className="grid gap-4 sm:grid-cols-2">{textInput('Botón acceso','access_label')}{textInput('Botón demo','demo_label')}</div><div className="rounded-2xl border border-[#edf0f5] bg-[#fafbfe] p-4"><div className="mb-3 text-[10px] font-bold uppercase tracking-[.14em] text-[#9aa0b2]">Ilustración del hero</div><div className="grid gap-4 sm:grid-cols-2">{textInput('Nombre de tienda','hero_mock_store_name')}{textInput('Estado del catálogo','hero_mock_catalog_status')}{textInput('Etiqueta pedidos','hero_mock_orders_label')}{textInput('Etiqueta ventas','hero_mock_sales_label')}</div></div></div>
     </EditorSection>

     <EditorSection eyebrow="Beneficios" title="Tarjetas de funciones" description="Las seis tarjetas que explican lo que WAMERCIO hace por el comercio.">
      <div className="grid gap-4 lg:grid-cols-2">{[1,2,3,4,5,6].map(n=><div key={n} className="rounded-2xl border border-[#edf0f5] bg-[#fafbfe] p-4"><div className="mb-3 text-[10px] font-bold uppercase tracking-[.14em] text-[#9aa0b2]">Tarjeta {n}</div><div className="space-y-3">{textInput('Título',`feature_${n}_title`)}{textArea('Descripción',`feature_${n}_text`,'min-h-20')}</div></div>)}</div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{textArea('Franja destacada 1','features_strip_primary','min-h-20')}{textArea('Franja destacada 2','features_strip_secondary','min-h-20')}</div>
     </EditorSection>

     <EditorSection eyebrow="Producto" title="Cómo funciona" description="Explica el flujo tanto desde la perspectiva del cliente como del comercio.">
      <div className="space-y-4">{textInput('Título de sección','process_title')}{textArea('Subtítulo de sección','process_subtitle','min-h-20')}<div className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-[#edf0f5] p-4"><div className="space-y-3">{textInput('Título · Clientes','process_customer_title')}{textArea('Texto · Clientes','process_customer_text')}</div></div><div className="rounded-2xl border border-[#edf0f5] p-4"><div className="space-y-3">{textInput('Título · Comercio','process_business_title')}{textArea('Texto · Comercio','process_business_text')}</div></div></div><div className="rounded-2xl border border-[#edf0f5] bg-[#fafbfe] p-4"><div className="mb-3 text-[10px] font-bold uppercase tracking-[.14em] text-[#9aa0b2]">Simulación del teléfono</div><div className="grid gap-4 sm:grid-cols-2">{textInput('Nombre del comercio','process_mock_store_title')}{textInput('Productos','process_mock_products_title')}{textInput('Pedido','process_mock_order_title')}{textInput('Botón','process_mock_button_label')}</div></div></div>
     </EditorSection>

     <EditorSection eyebrow="Planes" title="Encabezado de precios" description="Los datos de cada plan continúan administrándose desde la sección Planes.">
      <div className="grid gap-4 sm:grid-cols-2">{textInput('Título','plans_title')}{textInput('Botón de plan','plans_button_label')}</div><div className="mt-4">{textArea('Subtítulo','plans_subtitle','min-h-20')}</div><div className="mt-4 grid gap-4 sm:grid-cols-2">{textInput('Descripción por defecto','plan_default_description')}{textInput('Texto sin planes','plans_empty_text')}{textInput('Beneficio · WhatsApp','plan_whatsapp_feature')}{textInput('Beneficio · Pedidos','plan_orders_feature')}</div>
     </EditorSection>

     <EditorSection eyebrow="Demo" title="Prueba desde el celular">
      <div className="grid gap-4 sm:grid-cols-2">{textInput('Insignia','demo_badge')}{textInput('Botón','demo_button_label')}</div><div className="mt-4 space-y-4">{textInput('Título','demo_title')}{textArea('Descripción','demo_text')}</div>
     </EditorSection>

     <EditorSection eyebrow="Cierre" title="Último bloque comercial">
      <div className="grid gap-4 sm:grid-cols-2">{textInput('Insignia','closing_badge')}{textInput('Título','closing_title')}</div><div className="mt-4 grid gap-4 lg:grid-cols-3">{[1,2,3].map(n=><div key={n} className="rounded-2xl border border-[#edf0f5] bg-[#fafbfe] p-4"><div className="space-y-3">{textInput(`Tarjeta ${n} · Título`,`closing_${n}_title`)}{textArea(`Tarjeta ${n} · Texto`,`closing_${n}_text`,'min-h-20')}</div></div>)}</div>
     </EditorSection>

     <EditorSection eyebrow="Pie de página" title="Footer">
      <div className="grid gap-4 sm:grid-cols-2">{textInput('Marca','footer_brand')}{textInput('Texto descriptivo','footer_text')}{textInput('Enlace · Funciones','footer_features_label')}{textInput('Enlace · Planes','footer_plans_label')}{textInput('Enlace · Acceder','footer_access_label')}{textInput('Enlace · SuperAdmin','footer_admin_label')}</div>
     </EditorSection>

     <EditorSection eyebrow="Disponibilidad" title="Modo mantenimiento">
      <label className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><input type="checkbox" checked={!!data.maintenance_mode} onChange={e=>update('maintenance_mode',e.target.checked)}/><div><div className="font-semibold text-amber-900">Modo mantenimiento</div><div className="text-xs text-amber-700">Pausa únicamente la página principal; las tiendas y paneles siguen operando.</div></div></label>
      {data.maintenance_mode&&<div className="mt-4 space-y-4">{textInput('Insignia de mantenimiento','maintenance_badge')}{textInput('Título de mantenimiento','maintenance_title')}{textArea('Mensaje de mantenimiento','maintenance_text')}{textInput('Botón de mantenimiento','maintenance_button_label')}</div>}
     </EditorSection>

     <button className="btn-secondary" onClick={()=>setData({...landingDefaults})}><RotateCcw className="h-4 w-4"/>Restaurar valores base</button>
    </div>
   </section>

   <aside className="card h-fit p-5 sm:p-6 xl:h-full xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain">
    <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-brand-600"/>Vista previa</div>
    <div className="rounded-[28px] bg-brand-500 p-6 text-white shadow-lg"><div className="text-[10px] font-bold uppercase tracking-[.15em] text-white/70">{preview?.badge}</div><div className="mt-5 text-sm text-white/80">{preview?.kicker}</div><h3 className="mt-1 text-3xl font-semibold leading-tight">{preview?.title}</h3><p className="mt-4 text-sm leading-6 text-white/80">{preview?.subtitle}</p><div className="mt-6 flex gap-2"><span className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-brand-700">{data.access_label}</span><span className="rounded-full border border-white/50 px-4 py-2 text-xs font-semibold">{data.demo_label}</span></div></div>
    <div className="mt-4 rounded-2xl bg-[#fafbfe] p-4 text-xs leading-5 text-[#8d92aa]">Dominio detectado: <strong className="text-ink-900">{domain}</strong>. El marcador <strong>{'{domain}'}</strong> se reemplaza automáticamente.</div>
    <div className="mt-4 rounded-2xl border border-brand-100 bg-brand-50 p-4 text-xs leading-5 text-brand-800"><strong>Vista fija:</strong> este panel se desplaza de forma independiente. Al editar el lienzo de la izquierda, la vista previa permanece en su lugar.</div>
   </aside>
  </div>
 </SuperAdminShell>
}
