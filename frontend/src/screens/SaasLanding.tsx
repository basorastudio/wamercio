import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import { api, getPlatformHashUrl, getRootDomain } from '@/lib/api';
import { useLocation } from '@/lib/navigation';

const {
  FiAlertCircle, FiArrowRight, FiBook, FiBriefcase, FiCheck, FiCheckCircle, FiChevronDown, FiClock, FiCreditCard,
  FiDatabase, FiDollarSign, FiFacebook, FiFileText, FiGlobe, FiGrid, FiHelpCircle, FiHome, FiInstagram, FiLayers, FiLock, FiMap,
  FiMapPin, FiMenu, FiMessageCircle, FiMessageSquare, FiMonitor, FiNavigation, FiPackage, FiPieChart, FiPlayCircle,
  FiSearch, FiSettings, FiShield, FiShoppingBag, FiSmartphone, FiTruck, FiTwitter, FiUser, FiUserCheck, FiUserX,
  FiUsers, FiX,
} = FiIcons;

const rootDomain = () => getRootDomain() || (typeof window !== 'undefined' ? window.location.hostname : 'ltd.do');

const defaultLandingPage = (domain = 'ltd.do') => ({
  brand_name: 'WAMERCIO',
  brand_subtitle: '',
  brand_icon: '',
  logo_url: '/brand/wamercio-app-icon.png',
  nav_links: [
    { label: 'Inicio', url: '#inicio' },
    { label: 'Solución', url: '#solucion' },
    { label: 'Módulos', url: '#modulos' },
    { label: 'Planes', url: '#planes' },
    { label: 'Preguntas', url: '#faq' },
  ],
  access_button_text: 'Acceso',
  access_button_url: '#/admin',
  demo_button_text: 'Demo gratis',
  demo_button_url: '#contacto',
  badge_text: 'Comercio conversacional hecho en República Dominicana 🇩🇴',
  hero_title: 'Digitaliza tu negocio',
  hero_highlight: 'sin complicaciones.',
  hero_description: 'La plataforma para negocios dominicanos que venden y atienden por WhatsApp. Organiza catálogo, pedidos, clientes, inventario, cobros y entregas desde un solo lugar.',
  primary_button_text: 'Solicitar demo gratis',
  primary_button_url: '#contacto',
  secondary_button_text: 'Ver video',
  secondary_button_url: '#solucion',
  hero_image_url: 'https://images.unsplash.com/photo-1556742044-3c52d6e88c62?q=80&w=1200&auto=format&fit=crop',
  hero_stat_label: 'Nuevos pedidos',
  hero_stat_value: 'Pedido listo',
  trust_items: ['PWA Instalable', 'RD$', 'Control de fiado'],
  problems_title: 'Tu negocio no necesita más desorden.',
  problems_highlight: 'Necesita más control.',
  problems_description: 'Administrar un negocio con métodos tradicionales es agotador. WAMERCIO elimina estos dolores de cabeza.',
  problems: [
    { icon: 'message', title: 'WhatsApp desordenado', text: 'Mensajes perdidos, audios confusos y errores al tomar notas.' },
    { icon: 'book', title: 'Fiado en libretas', text: 'Cálculos manuales, cuadernos perdidos y deudas difíciles de cobrar.' },
    { icon: 'package', title: 'Inventario ciego', text: 'Vendes productos que ya no tienes o no sabes qué falta comprar.' },
    { icon: 'map', title: 'Entregas sin zonas', text: 'Problemas para cobrar el envío correcto según el barrio.' },
    { icon: 'dollar', title: 'Caja sin control', text: 'Cierres de caja al ojo sin saber realmente cuánto se vendió.' },
    { icon: 'users', title: 'Sin historial', text: 'No sabes quién compra más ni cuáles son sus favoritos.' },
    { icon: 'search', title: 'Precios ocultos', text: 'Clientes preguntando precios a cada rato por falta de catálogo.' },
    { icon: 'userx', title: 'Dueño dependiente', text: 'Si no estás en el negocio, todo se vuelve un caos.' },
  ],
  modules_title: 'Todo tu negocio en una mano.',
  modules_description: 'Módulos conectados entre sí diseñados específicamente para la realidad del comercio dominicano.',
  modules: [
    { icon: 'smartphone', title: 'Tienda PWA', text: 'Enlace propio para que tus clientes pidan desde su celular sin descargar aplicaciones.' },
    { icon: 'shoppingbag', title: 'Carrito de compra', text: 'Experiencia intuitiva para armar pedidos y enviarlos por WhatsApp.' },
    { icon: 'monitor', title: 'Punto de Venta', text: 'Cobra en el local, controla caja y agiliza la atención al cliente.' },
    { icon: 'filetext', title: 'Fiado digital', text: 'Adiós a la libreta. Controla deudas, abonos y balances por cliente.' },
    { icon: 'layers', title: 'Inventario Real', text: 'Gestiona existencias, categorías y precios de forma masiva.' },
    { icon: 'truck', title: 'Entrega por barrio', text: 'Zonas de entrega dinámicas con costos de envío configurables.' },
    { icon: 'piechart', title: 'Reportes Diarios', text: 'Ventas, ganancias y movimientos de caja en tiempo real.' },
    { icon: 'users', title: 'Base de Clientes', text: 'Conoce a tus clientes, sus gustos y frecuencia de compra.' },
  ],
  rd_title: 'Diseñado para vender en RD, no adaptado a medias.',
  rd_description: 'WAMERCIO entiende cómo se vende en República Dominicana: pedidos rápidos, clientes locales, entrega cercana, pagos mixtos, fiado, transferencias, efectivo y negocios que necesitan operar desde el celular.',
  rd_tags: ['RD$', 'Cédula', 'Pedidos por WhatsApp', 'Fiado', 'Entrega por barrio', 'Provincias y municipios', 'Sectores y zonas de entrega', 'WhatsApp', 'Efectivo y transferencia', 'Comercio local', 'PWA'],
  rd_card_title: 'Comienza más rápido con una base pensada para negocios dominicanos.',
  rd_card_text: 'No tienes que empezar desde cero. WAMERCIO está preparado para ayudarte a configurar productos, categorías y zonas de entrega adaptadas al mercado dominicano.',
  rd_card_items: ['Catálogo base de productos y marcas', 'Territorio dominicano completo (Provincias, Municipios)', 'Sectores, barrios y zonas de entrega predefinidas'],
  audience_title: 'Comercio conversacional para distintos tipos de negocio.',
  business_types: ['Tiendas', 'Supermercados', 'Ferreterías', 'Farmacias', 'Restaurantes', 'Boutiques', 'Salones y barberías', 'Tecnología y celulares', 'Repuestos y talleres', 'Distribuidoras', 'Servicios profesionales', 'Otros negocios'],
  roles_title: 'Cada persona trabaja desde su propio panel.',
  roles: [
    { icon: 'usercheck', title: 'Dueño o administrador', text: 'Controla productos, inventario, usuarios, clientes, reportes, zonas de entrega, métodos de pago y configuración del negocio.' },
    { icon: 'monitor', title: 'Cajero', text: 'Registra ventas, consulta sus movimientos y gestiona caja desde un panel simple.' },
    { icon: 'navigation', title: 'Repartidor', text: 'Recibe pedidos asignados, revisa rutas y actualiza el estado de las entregas.' },
    { icon: 'smartphone', title: 'Cliente', text: 'Consulta productos, arma su pedido, revisa sus compras y puede ver su fiado.' },
    { icon: 'settings', title: 'Administración SaaS', text: 'Administra negocios, planes, dominios, catálogo global, territorio, bancos y configuración general de la plataforma.' },
  ],
  steps_title: 'Empieza a digitalizar tu negocio en pocos pasos.',
  steps: [
    { title: 'Crea tu negocio', text: 'Registra el nombre, logo, horarios, zona y datos principales.' },
    { title: 'Activa tu catálogo', text: 'Agrega productos manualmente o parte de un catálogo base para avanzar más rápido.' },
    { title: 'Comparte tu enlace', text: 'Envía tu tienda a tus clientes para que entren desde el celular.' },
    { title: 'Recibe pedidos', text: 'Los clientes agregan productos y envían pedidos organizados.' },
    { title: 'Despacha y entrega', text: 'Administra estados, caja, entregas y repartidores.' },
    { title: 'Controla y crece', text: 'Consulta reportes, clientes, ventas, fiados e inventario.' },
  ],
  benefits_title: 'Más ventas, más orden y más control.',
  benefits: ['Reduce pedidos perdidos.', 'Evita confusiones por WhatsApp.', 'Controla el inventario de forma real.', 'Organiza el fiado sin libretas.', 'Mejora la atención al cliente.', 'Acelera ventas en caja.', 'Coordina entregas por sector o barrio.', 'Controla cajeros y repartidores.', 'Consulta reportes del día.', 'Administra el negocio desde celular, tablet o PC.'],
  plans_title: 'Planes a tu medida',
  plans_description: 'Escoge el plan que mejor se adapte al tamaño y operación de tu negocio.',
  pricing_plans: [
    { name: 'Inicial', price: 'Consultar', description: 'Perfecto para comenzar a vender en línea.', features: ['Tienda en línea (PWA)', 'Catálogo básico', 'Gestión de pedidos', 'Base de clientes', 'Soporte básico'], popular: false, button_text: 'Solicitar información', button_url: '#contacto' },
    { name: 'Pro', price: 'Recomendado', description: 'La solución completa para tu operación diaria.', features: ['Todo lo del plan Inicial', 'Punto de venta (POS)', 'Inventario avanzado', 'Control de fiado', 'Aplicación para repartidores', 'Reportes de caja'], popular: true, button_text: 'Solicitar información', button_url: '#contacto' },
    { name: 'Empresarial', price: 'Cotizar', description: 'Para propietarios que administran varios negocios independientes.', features: ['Multi-negocio', 'Usuarios ilimitados', 'Capacidad masiva', 'Soporte 24/7 prioritario', 'Configuración avanzada'], popular: false, button_text: 'Solicitar información', button_url: '#contacto' },
  ],
  faq_title: 'Preguntas frecuentes',
  faq_description: 'Resolvemos tus dudas principales sobre WAMERCIO.',
  faqs: [
    { question: '¿WAMERCIO sirve para diferentes tipos de negocio?', answer: 'Sí. WAMERCIO está pensado para comercios y servicios que venden o atienden por WhatsApp: tiendas, supermercados, ferreterías, farmacias, restaurantes, boutiques, salones, tecnología, repuestos, distribuidoras y muchos otros.' },
    { question: '¿Mis clientes tienen que descargar una aplicación?', answer: 'No necesariamente. La tienda funciona como PWA, por lo que el cliente puede abrirla desde el navegador y guardarla en su celular.' },
    { question: '¿Puedo manejar entregas a domicilio?', answer: 'Sí. Puedes configurar zonas de entrega, sectores, barrios, cobertura y costos.' },
    { question: '¿Puedo manejar fiado?', answer: 'Sí. La plataforma permite controlar clientes con crédito, balances pendientes, pagos y reportes.' },
    { question: '¿Puedo tener cajeros y repartidores?', answer: 'Sí. El sistema incluye roles y paneles separados para administrador, cajero y repartidor.' },
    { question: '¿Puedo vender desde mi propio enlace?', answer: 'Sí. Cada negocio puede tener su propio enlace para compartirlo con sus clientes.' },
    { question: '¿Sirve para varios negocios?', answer: 'Sí. La plataforma está diseñada para administrar uno o varios negocios desde un entorno SaaS.' },
    { question: '¿Puedo controlar mis productos?', answer: 'Sí. Puedes gestionar productos, categorías, marcas, precios, disponibilidad e inventario.' },
    { question: '¿Acepta pagos?', answer: 'La plataforma registra efectivo, transferencia manual, tarjeta cobrada en una terminal física externa y fiado. WAMERCIO no procesa ni confirma pagos electrónicos dentro de los negocios.' },
  ],
  cta_title: 'Tu negocio puede vender mejor desde hoy.',
  cta_description: 'Organiza tu negocio, atiende más rápido y dale a tus clientes una experiencia moderna sin perder la cercanía de siempre.',
  cta_primary_text: 'Solicitar demo',
  cta_primary_url: '#contacto',
  cta_secondary_text: 'Hablar por WhatsApp',
  cta_secondary_url: 'https://wa.me/',
  cta_tertiary_text: 'Ver planes',
  cta_tertiary_url: '#planes',
  footer_description: 'Plataforma SaaS para digitalizar comercios y negocios en República Dominicana.',
  footer_email: 'hola@wamercio.com',
  footer_status_text: 'Sistemas operativos',
  maintenance: {
    enabled: false,
    badge_text: 'Mantenimiento programado',
    title: 'Estamos realizando mejoras en la página principal',
    description: 'La página principal estará temporalmente en mantenimiento mientras optimizamos la experiencia de WAMERCIO. Los negocios activos continúan operando desde sus subdominios.',
    status_label: 'Estado del servicio',
    status_value: 'Mantenimiento activo',
    notice_title: 'Página principal pausada temporalmente',
    notice_text: 'El acceso administrativo y las tiendas existentes siguen disponibles. Esta pantalla solo afecta el dominio principal.',
    support_button_text: 'Entrar al panel de administración',
    support_button_url: '#/admin',
  },
  domain,
});

const iconMap: Record<string, any> = {
  message: FiMessageSquare,
  book: FiBook,
  package: FiPackage,
  map: FiMap,
  dollar: FiDollarSign,
  users: FiUsers,
  search: FiSearch,
  userx: FiUserX,
  smartphone: FiSmartphone,
  shoppingbag: FiShoppingBag,
  monitor: FiMonitor,
  layers: FiLayers,
  filetext: FiFileText,
  truck: FiTruck,
  piechart: FiPieChart,
  shield: FiShield,
  creditcard: FiCreditCard,
  briefcase: FiBriefcase,
  usercheck: FiUserCheck,
  navigation: FiNavigation,
  settings: FiSettings,
  check: FiCheckCircle,
  database: FiDatabase,
  mappin: FiMapPin,
  globe: FiGlobe,
  lock: FiLock,
  grid: FiGrid,
};

const textWithDomain = (value: any, domain: string) => String(value || '').replace(/\{domain\}/g, domain);
const asArray = (value: any, fallback: any[] = []) => (Array.isArray(value) && value.length > 0 ? value : fallback);

const normalizeLandingPage = (raw: any, domain: string) => {
  const defaults = defaultLandingPage(domain);
  const saved = raw || {};
  const next: any = { ...defaults, ...saved };
  const arrayKeys = ['nav_links', 'trust_items', 'problems', 'modules', 'rd_tags', 'rd_card_items', 'business_types', 'roles', 'steps', 'benefits', 'pricing_plans', 'faqs'];
  arrayKeys.forEach((key) => {
    next[key] = asArray(next[key], (defaults as any)[key]);
  });
  next.maintenance = { ...(defaults.maintenance || {}), ...(next.maintenance || {}) };
  next.maintenance.support_button_url = '#/admin';
  delete next.maintenance.estimated_return;
  return next;
};

const Icon = ({ name, className = '' }: any) => {
  const Cmp = iconMap[String(name || '').toLowerCase()] || FiGrid;
  return <Cmp className={className} />;
};

const LogoMark = ({ landing, dark = false }: any) => {
  const logo = landing.logo_url || landing.logoUrl || '/brand/wamercio-app-icon.png';
  if (logo) {
    return (
      <span className={`w-10 h-10 rounded-2xl flex items-center justify-center overflow-hidden shadow-sm ${dark ? 'bg-white' : 'bg-white ring-1 ring-emerald-100'}`}>
        <img src={logo} alt={landing.brand_name || 'WAMERCIO'} className="w-full h-full object-cover" />
      </span>
    );
  }
  return (
    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl shadow-sm ${dark ? 'bg-white text-slate-900' : 'bg-emerald-500 text-white'}`}>
      {landing.brand_icon || '🛒'}
    </div>
  );
};

const LinkButton = ({ href, children, className = '' }: any) => <a href={href || '#'} className={className}>{children}</a>;

const getNavIcon = (link: any) => {
  const text = `${link?.label || ''} ${link?.url || ''}`.toLowerCase();
  if (text.includes('inicio')) return FiHome;
  if (text.includes('solución') || text.includes('solucion')) return FiCheckCircle;
  if (text.includes('módulo') || text.includes('modulo')) return FiGrid;
  if (text.includes('plan')) return FiCreditCard;
  if (text.includes('faq') || text.includes('pregunta')) return FiHelpCircle;
  if (text.includes('contact')) return FiMessageCircle;
  return FiArrowRight;
};

const LandingBootstrap = ({ landing }: any) => (
  <main
    className="min-h-[100dvh] bg-[#07111f] text-white overflow-hidden relative flex items-center justify-center"
    aria-label="Cargando WAMERCIO"
    aria-busy="true"
  >
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute -top-40 -left-32 w-[30rem] h-[30rem] rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="absolute -bottom-52 -right-28 w-[34rem] h-[34rem] rounded-full bg-sky-400/10 blur-3xl" />
    </div>
    <div className="relative flex flex-col items-center gap-5">
      <div className="relative">
        <span className="absolute -inset-3 rounded-[1.75rem] border border-emerald-300/20 animate-pulse" />
        <LogoMark landing={landing} dark />
      </div>
      <span className="w-8 h-1 rounded-full bg-emerald-400/70 animate-pulse" />
    </div>
  </main>
);

const MaintenanceLanding = ({ landing, domain }: any) => {
  const maintenance = landing.maintenance || {};
  const brandName = textWithDomain(landing.brand_name, domain) || 'WAMERCIO';
  const adminButtonText = textWithDomain(maintenance.support_button_text, domain) || 'Entrar al panel de administración';
  const availabilityItems = [
    'El panel administrativo continúa disponible.',
    'Las tiendas y los pedidos siguen operando normalmente.',
    'El mantenimiento afecta únicamente la página principal.',
  ];

  return (
    <main className="h-[100dvh] min-h-0 bg-[#07111f] text-white overflow-y-auto overflow-x-hidden overscroll-y-contain landing-scrollbar touch-pan-y relative selection:bg-emerald-300 selection:text-slate-950">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)', backgroundSize: '54px 54px' }} />
        <div className="absolute -top-56 -left-40 w-[42rem] h-[42rem] rounded-full bg-emerald-400/[0.12] blur-3xl" />
        <div className="absolute top-1/3 right-[-18rem] w-[44rem] h-[44rem] rounded-full bg-sky-400/10 blur-3xl" />
        <div className="absolute -bottom-72 left-1/3 w-[40rem] h-[40rem] rounded-full bg-teal-400/[0.08] blur-3xl" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-7 lg:px-10 min-h-[100dvh] flex flex-col">
        <header className="h-24 md:h-28 flex items-center justify-between border-b border-white/[0.07]">
          <div className="flex items-center gap-3.5">
            <LogoMark landing={landing} dark />
            <div>
              <p className="text-lg md:text-xl font-black tracking-tight leading-none">{brandName}</p>
              <p className="mt-1.5 text-[10px] md:text-xs uppercase tracking-[0.2em] font-bold text-white/45">Gestión inteligente para negocios</p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-amber-100">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-50" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-300" />
            </span>
            Mantenimiento en curso
          </span>
        </header>

        <section className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,.92fr)] gap-10 lg:gap-16 items-center py-12 md:py-16 lg:py-20">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <p className="inline-flex items-center gap-2.5 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-100">
              <FiAlertCircle className="text-base" /> {textWithDomain(maintenance.badge_text, domain)}
            </p>
            <h1 className="mt-7 max-w-3xl text-4xl sm:text-5xl md:text-6xl xl:text-7xl font-black tracking-[-0.045em] leading-[0.98]">
              {textWithDomain(maintenance.title, domain)}
            </h1>
            <p className="mt-7 max-w-2xl text-base md:text-lg leading-8 text-white/66">
              {textWithDomain(maintenance.description, domain)}
            </p>

            <div className="mt-9 flex flex-col sm:flex-row sm:items-center gap-4">
              <a
                href="#/admin"
                className="group min-h-14 px-6 rounded-2xl bg-emerald-400 text-slate-950 font-black flex items-center justify-center gap-3 shadow-[0_18px_50px_rgba(52,211,153,.18)] transition-all hover:bg-emerald-300 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/30"
              >
                <FiShield className="text-lg" />
                {adminButtonText}
                <FiArrowRight className="transition-transform group-hover:translate-x-1" />
              </a>
              <p className="flex items-center gap-2 text-sm font-bold text-white/48">
                <FiCheckCircle className="text-emerald-300 text-lg shrink-0" />
                Acceso seguro para los negocios registrados
              </p>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.08 }} className="relative">
            <div className="absolute -inset-5 rounded-[2.5rem] bg-gradient-to-br from-emerald-300/10 via-transparent to-sky-300/10 blur-2xl" />
            <div className="relative rounded-[2rem] border border-white/10 bg-white/[0.065] p-3 sm:p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
              <div className="rounded-[1.55rem] bg-white text-slate-900 p-5 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">{textWithDomain(maintenance.status_label, domain)}</p>
                    <h2 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight">{textWithDomain(maintenance.status_value, domain)}</h2>
                  </div>
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 14, ease: 'linear' }} className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
                    <FiSettings className="text-2xl" />
                  </motion.div>
                </div>

                <div className="mt-7 space-y-3">
                  {availabilityItems.map((item) => (
                    <div key={item} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3.5">
                      <span className="mt-0.5 w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"><FiCheck className="text-sm" /></span>
                      <p className="text-sm leading-6 font-bold text-slate-600">{item}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">{textWithDomain(maintenance.notice_title, domain)}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{textWithDomain(maintenance.notice_text, domain)}</p>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        <footer className="min-h-20 py-5 border-t border-white/[0.07] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-bold text-white/35">
          <p>© {new Date().getFullYear()} {brandName}. Todos los derechos reservados.</p>
          <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-300" /> Servicios de los negocios operando</p>
        </footer>
      </div>
    </main>
  );
};

const Navbar = ({ landing, domain, scrollRootId = 'saas-landing-scroll' }: any) => {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const scrollRoot = typeof document !== 'undefined' ? document.getElementById(scrollRootId) : null;
    const onScroll = () => setScrolled((scrollRoot?.scrollTop || window.scrollY || 0) > 20);
    onScroll();
    scrollRoot?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scrollRoot?.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
    };
  }, [scrollRootId]);
  const links = asArray(landing.nav_links, []).slice(0, 6);
  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-md shadow-sm py-3' : 'bg-transparent py-5'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
        <a href="#inicio" className="flex items-center gap-3">
          <LogoMark landing={landing} />
          <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{textWithDomain(landing.brand_name, domain)}</span>
        </a>
        <div className="hidden lg:flex items-center gap-8">
          {links.map((link: any, index: number) => <a key={index} href={link.url || '#'} className="text-sm font-bold text-slate-600 hover:text-emerald-600 transition-colors">{textWithDomain(link.label, domain)}</a>)}
          <div className="h-6 w-px bg-slate-200 mx-1" />
          <a href={landing.access_button_url || '#/admin'} className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-emerald-600 transition-colors"><FiUser /> {textWithDomain(landing.access_button_text, domain)}</a>
          <a href={landing.demo_button_url || '#contacto'} className="px-6 py-2.5 bg-emerald-500 text-white text-sm font-black rounded-full hover:bg-emerald-600 transition-all shadow-md shadow-emerald-100">{textWithDomain(landing.demo_button_text, domain)}</a>
        </div>
        <button type="button" className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors" onClick={() => setOpen(true)}><FiMenu className="text-2xl" /></button>
      </div>
      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm lg:hidden" />
            <motion.div initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="fixed top-0 left-0 bottom-0 w-[84%] max-w-sm bg-white shadow-2xl lg:hidden p-6 flex flex-col rounded-r-[2rem]">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <LogoMark landing={landing} />
                  <div>
                    <span className="block text-lg font-black text-slate-900 leading-none">Menú</span>
                    <span className="block text-xs font-bold text-slate-400 mt-1">{textWithDomain(landing.brand_name, domain)}</span>
                  </div>
                </div>
                <button onClick={() => setOpen(false)} className="w-10 h-10 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-100 hover:text-slate-700 transition-colors"><FiX className="text-2xl" /></button>
              </div>
              <div className="flex flex-col gap-2">
                {links.map((link: any, index: number) => {
                  const NavIcon = getNavIcon(link);
                  return (
                    <a key={index} href={link.url || '#'} onClick={() => setOpen(false)} className="flex items-center justify-between p-4 text-slate-700 font-bold hover:bg-emerald-50 hover:text-emerald-600 rounded-2xl transition-all group">
                      <span className="flex items-center gap-3 min-w-0">
                        <span className="w-10 h-10 rounded-2xl bg-slate-50 text-slate-500 flex items-center justify-center group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors"><NavIcon /></span>
                        <span className="truncate">{textWithDomain(link.label, domain)}</span>
                      </span>
                      <FiArrowRight className="opacity-40 group-hover:translate-x-1 transition-transform" />
                    </a>
                  );
                })}
              </div>
              <div className="mt-auto pt-6 space-y-3">
                <a href={landing.access_button_url || '#/admin'} className="w-full py-4 px-6 border border-slate-200 text-slate-700 font-black rounded-2xl flex items-center justify-center gap-2"><FiUser /> {textWithDomain(landing.access_button_text, domain)}</a>
                <a href={landing.demo_button_url || '#contacto'} className="w-full py-4 px-6 bg-emerald-500 text-white font-black rounded-2xl shadow-lg shadow-emerald-200 flex items-center justify-center gap-2"><FiMessageCircle /> {textWithDomain(landing.demo_button_text, domain)}</a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </nav>
  );
};

const Hero = ({ landing, domain }: any) => (
  <section id="inicio" className="relative pt-28 pb-16 md:pt-48 md:pb-32 overflow-hidden bg-slate-50">
    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full overflow-hidden pointer-events-none"><div className="absolute top-0 right-0 w-[300px] md:w-[800px] h-[300px] md:h-[800px] bg-emerald-100 rounded-full blur-3xl opacity-40 translate-x-1/2 -translate-y-1/4" /></div>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
      <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center lg:text-left order-2 lg:order-1">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-100/80 text-emerald-700 text-xs sm:text-sm font-black mb-6 border border-emerald-200"><span className="flex h-2 w-2 rounded-full bg-emerald-500 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /></span>{textWithDomain(landing.badge_text, domain)}</div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-slate-900 leading-[1.05] mb-6 tracking-tight">{textWithDomain(landing.hero_title, domain)} <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-600">{textWithDomain(landing.hero_highlight, domain)}</span></h1>
          <p className="text-base sm:text-lg md:text-xl text-slate-600 mb-8 md:mb-10 leading-relaxed max-w-xl mx-auto lg:mx-0">{textWithDomain(landing.hero_description, domain)}</p>
          <div className="flex flex-col sm:flex-row gap-4 mb-10"><a href={landing.primary_button_url || '#contacto'} className="w-full sm:w-auto px-8 py-4 bg-emerald-500 text-white font-black rounded-2xl hover:bg-emerald-600 transition-all hover:shadow-xl hover:shadow-emerald-200 flex items-center justify-center gap-2 group">{textWithDomain(landing.primary_button_text, domain)}<FiArrowRight className="group-hover:translate-x-1 transition-transform" /></a><a href={landing.secondary_button_url || '#solucion'} className="w-full sm:w-auto px-8 py-4 bg-white border border-slate-200 text-slate-700 font-black rounded-2xl hover:bg-slate-50 transition-all flex items-center justify-center gap-2 shadow-sm"><FiPlayCircle className="text-xl text-emerald-500" />{textWithDomain(landing.secondary_button_text, domain)}</a></div>
          <div className="flex flex-wrap justify-center lg:justify-start gap-x-6 gap-y-3">{asArray(landing.trust_items, []).slice(0, 5).map((item: any, index: number) => <div key={index} className="flex items-center gap-2 text-slate-500 text-sm font-bold"><FiCheck className="text-emerald-500" />{textWithDomain(item, domain)}</div>)}</div>
        </motion.div>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.2 }} className="relative order-1 lg:order-2">
          <div className="absolute inset-0 bg-gradient-to-tr from-emerald-200 to-teal-100 rounded-[2rem] rotate-3 scale-105 -z-10 opacity-70" />
          <div className="relative w-full rounded-[1.5rem] md:rounded-[2rem] shadow-2xl border border-white/50 overflow-hidden aspect-[4/3] sm:aspect-video lg:aspect-square lg:h-[500px]"><img src={landing.hero_image_url || defaultLandingPage(domain).hero_image_url} alt="Administración moderna de negocio" className="w-full h-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" /></div>
          <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }} className="absolute -bottom-4 -left-4 sm:-left-8 bg-white p-3 sm:p-4 rounded-2xl shadow-xl flex items-center gap-3 border border-slate-100"><div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-xl sm:text-2xl font-black">+</div><div><p className="text-[10px] sm:text-xs text-slate-500 font-black uppercase tracking-wider">{textWithDomain(landing.hero_stat_label, domain)}</p><p className="text-base sm:text-xl font-black text-slate-900 leading-none">{textWithDomain(landing.hero_stat_value, domain)}</p></div></motion.div>
        </motion.div>
      </div>
    </div>
  </section>
);

const CardGrid = ({ items, color = 'emerald' }: any) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
    {asArray(items, []).map((item: any, index: number) => (
      <motion.div key={index} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.05 }} className={`bg-white border border-slate-100 p-6 rounded-2xl hover:shadow-xl transition-all group ${color === 'red' ? 'hover:border-red-100' : 'hover:border-emerald-300'}`}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${color === 'red' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white'}`}><Icon name={item.icon} className="text-xl" /></div>
        <h3 className="font-black text-slate-900 mb-2">{item.title}</h3><p className="text-sm text-slate-600 leading-relaxed">{item.text}</p>
      </motion.div>
    ))}
  </div>
);

const SaasLanding = () => {
  const [remoteLanding, setRemoteLanding] = useState<any>(null);
  const [remoteDomain, setRemoteDomain] = useState('');
  const [landingResolved, setLandingResolved] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const { pathname } = useLocation();
  const domain = remoteDomain || rootDomain();
  const landing = useMemo(() => normalizeLandingPage(remoteLanding, domain), [remoteLanding, domain]);

  useEffect(() => {
    let alive = true;
    api.get('/landing').then((response) => {
      if (!alive) return;
      setRemoteDomain(response?.domain || '');
      setRemoteLanding(response?.landing_page || response?.landingPage || null);
      setLandingResolved(true);
    }).catch(() => {
      if (!alive) return;
      setRemoteLanding(null);
      setLandingResolved(true);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!landingResolved || landing.maintenance?.enabled) return undefined;
    if (typeof window === 'undefined') return undefined;
    const routeToSection: Record<string, string> = {
      '/': 'inicio',
      '/home': 'inicio',
      '/solution': 'solucion',
      '/modules': 'modulos',
      '/plans': 'planes',
      '/faq': 'faq',
      '/contact': 'contacto',
    };
    const sectionId = routeToSection[pathname] || pathname.replace(/^\//, '') || 'inicio';
    const timer = window.setTimeout(() => {
      const scrollRoot = document.getElementById('saas-landing-scroll');
      const section = document.getElementById(sectionId);
      if (!scrollRoot) return;
      if (!section || sectionId === 'inicio') {
        scrollRoot.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const top = Math.max(section.offsetTop - 88, 0);
      scrollRoot.scrollTo({ top, behavior: 'smooth' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [pathname, landing, landingResolved]);

  if (!landingResolved) return <LandingBootstrap landing={landing} />;
  if (landing.maintenance?.enabled) return <MaintenanceLanding landing={landing} domain={domain} />;

  return (
    <div id="saas-landing-scroll" className="h-screen h-[100dvh] bg-white font-sans selection:bg-emerald-100 selection:text-emerald-900 scroll-smooth overflow-y-auto overflow-x-hidden landing-scrollbar">
      <Navbar landing={landing} domain={domain} scrollRootId="saas-landing-scroll" />
      <main>
        <Hero landing={landing} domain={domain} />

        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6"><div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16"><h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4 tracking-tight">{textWithDomain(landing.problems_title, domain)}<br className="hidden sm:block" /><span className="text-emerald-600"> {textWithDomain(landing.problems_highlight, domain)}</span></h2><p className="text-base sm:text-lg text-slate-600">{textWithDomain(landing.problems_description, domain)}</p></div><CardGrid items={landing.problems} color="red" /></div>
        </section>

        <section id="solucion" className="py-20 bg-slate-50 border-y border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6"><div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16"><h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4 tracking-tight">{textWithDomain(landing.modules_title, domain)}</h2><p className="text-base sm:text-lg text-slate-600">{textWithDomain(landing.modules_description, domain)}</p></div><div id="modulos"><CardGrid items={landing.modules} /></div></div>
        </section>

        <section className="py-24 bg-white overflow-hidden">
          <div className="max-w-7xl mx-auto px-6"><div className="grid lg:grid-cols-2 gap-16 items-center"><motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}><h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-6 tracking-tight">{textWithDomain(landing.rd_title, domain)}</h2><p className="text-lg text-slate-600 mb-8 leading-relaxed">{textWithDomain(landing.rd_description, domain)}</p><div className="flex flex-wrap gap-3">{asArray(landing.rd_tags, []).map((tag: any, i: number) => <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-sm font-bold border border-emerald-100"><FiCheckCircle className="text-emerald-500" />{textWithDomain(tag, domain)}</span>)}</div></motion.div><motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="bg-slate-50 rounded-3xl p-8 border border-slate-100"><div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-6"><FiDatabase className="text-3xl" /></div><h3 className="text-2xl font-black text-slate-900 mb-4">{textWithDomain(landing.rd_card_title, domain)}</h3><p className="text-slate-600 mb-6">{textWithDomain(landing.rd_card_text, domain)}</p><ul className="space-y-3">{asArray(landing.rd_card_items, []).map((item: any, i: number) => <li key={i} className="flex items-start gap-3 text-slate-700 font-bold"><FiMapPin className="text-emerald-500 mt-1 shrink-0" /><span>{textWithDomain(item, domain)}</span></li>)}</ul></motion.div></div></div>
        </section>

        <section id="para-quien-es" className="py-24 bg-slate-900 text-white">
          <div className="max-w-7xl mx-auto px-6"><div className="text-center max-w-3xl mx-auto mb-16"><h2 className="text-3xl md:text-4xl font-black mb-4 tracking-tight">{textWithDomain(landing.audience_title, domain)}</h2><div className="flex flex-wrap justify-center gap-3 mt-8">{asArray(landing.business_types, []).map((type: any, i: number) => <span key={i} className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-bold text-slate-300 flex items-center gap-2"><FiBriefcase className="text-emerald-400" />{textWithDomain(type, domain)}</span>)}</div></div><hr className="border-slate-800 my-16" /><div className="text-center max-w-3xl mx-auto mb-12"><h2 className="text-3xl md:text-4xl font-black mb-4 tracking-tight">{textWithDomain(landing.roles_title, domain)}</h2></div><div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">{asArray(landing.roles, []).map((role: any, i: number) => <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} className="bg-slate-800 p-6 rounded-2xl border border-slate-700"><div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center mb-4"><Icon name={role.icon} className="text-2xl" /></div><h3 className="text-lg font-black mb-2">{textWithDomain(role.title, domain)}</h3><p className="text-slate-400 text-sm leading-relaxed">{textWithDomain(role.text, domain)}</p></motion.div>)}</div></div>
        </section>

        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-6"><div className="text-center max-w-3xl mx-auto mb-16"><h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4 tracking-tight">{textWithDomain(landing.steps_title, domain)}</h2></div><div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">{asArray(landing.steps, []).map((step: any, index: number) => <motion.div key={index} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.08 }} className="relative p-6 bg-slate-50 rounded-2xl border border-slate-100"><div className="absolute -top-4 -left-4 w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center font-black text-lg shadow-lg">{index + 1}</div><h3 className="text-xl font-black text-slate-900 mb-3 mt-2">{textWithDomain(step.title, domain)}</h3><p className="text-slate-600">{textWithDomain(step.text, domain)}</p></motion.div>)}</div></div>
        </section>

        <section className="py-20 bg-slate-900 text-white">
          <div className="max-w-7xl mx-auto px-6 text-center"><h2 className="text-3xl md:text-4xl font-black mb-12 tracking-tight">{textWithDomain(landing.benefits_title, domain)}</h2><div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 text-left">{asArray(landing.benefits, []).map((benefit: any, i: number) => <motion.div key={i} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }} className="flex items-start gap-3 bg-slate-800 p-4 rounded-xl border border-slate-700/50"><FiCheckCircle className="text-emerald-400 text-xl shrink-0 mt-0.5" /><span className="text-sm font-bold text-slate-300">{textWithDomain(benefit, domain)}</span></motion.div>)}</div></div>
        </section>

        <section id="planes" className="py-20 bg-slate-50 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6"><div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16"><h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">{textWithDomain(landing.plans_title, domain)}</h2><p className="text-slate-600">{textWithDomain(landing.plans_description, domain)}</p></div><div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">{asArray(landing.pricing_plans, []).slice(0, 3).map((plan: any, index: number) => <motion.div key={index} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.08 }} className={`relative bg-white rounded-3xl p-8 border-2 transition-all ${plan.popular ? 'border-emerald-500 shadow-xl md:scale-105 z-10' : 'border-slate-100'}`}>{plan.popular && <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest">Más Elegido</div>}<h3 className="text-xl font-black text-slate-900 mb-2">{textWithDomain(plan.name, domain)}</h3><p className="text-emerald-600 font-black mb-4">{textWithDomain(plan.price, domain)}</p><p className="text-sm text-slate-500 mb-8 leading-relaxed">{textWithDomain(plan.description, domain)}</p><a href={plan.button_url || '#contacto'} className={`block text-center w-full py-4 rounded-2xl font-black transition-all mb-8 ${plan.popular ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{textWithDomain(plan.button_text || 'Solicitar información', domain)}</a><ul className="space-y-4">{asArray(plan.features, []).map((feature: any, i: number) => <li key={i} className="flex items-start gap-3 text-sm text-slate-700"><div className="mt-0.5 w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0"><FiCheck className="text-xs" /></div>{textWithDomain(feature, domain)}</li>)}</ul></motion.div>)}</div></div>
        </section>

        <section id="faq" className="py-24 bg-white">
          <div className="max-w-4xl mx-auto px-6"><div className="text-center mb-16"><h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4 tracking-tight">{textWithDomain(landing.faq_title, domain)}</h2><p className="text-lg text-slate-600">{textWithDomain(landing.faq_description, domain)}</p></div><div className="space-y-4">{asArray(landing.faqs, []).map((item: any, index: number) => <div key={index} className="border border-slate-200 rounded-2xl overflow-hidden"><button className="w-full px-6 py-4 text-left flex justify-between items-center bg-slate-50 hover:bg-slate-100 transition-colors focus:outline-none" onClick={() => setActiveFaq(activeFaq === index ? null : index)}><span className="font-black text-slate-900">{textWithDomain(item.question, domain)}</span><motion.div animate={{ rotate: activeFaq === index ? 180 : 0 }} transition={{ duration: 0.2 }}><FiChevronDown className="text-slate-500 text-xl" /></motion.div></button><AnimatePresence>{activeFaq === index && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}><div className="px-6 py-4 bg-white text-slate-600 border-t border-slate-200 leading-relaxed">{textWithDomain(item.answer, domain)}</div></motion.div>}</AnimatePresence></div>)}</div></div>
        </section>

        <section id="contacto" className="py-24 bg-white relative overflow-hidden">
          <div className="absolute inset-0 bg-emerald-500/5 pointer-events-none" /><div className="max-w-4xl mx-auto px-6 relative z-10 text-center"><motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.6 }}><h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-6 tracking-tight">{textWithDomain(landing.cta_title, domain)}</h2><p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto">{textWithDomain(landing.cta_description, domain)}</p><div className="flex flex-col sm:flex-row gap-4 justify-center"><a href={landing.cta_primary_url || '#contacto'} className="px-8 py-4 bg-emerald-500 text-white font-black rounded-full hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200">{textWithDomain(landing.cta_primary_text, domain)}</a><a href={landing.cta_secondary_url || 'https://wa.me/'} className="px-8 py-4 bg-white border border-slate-200 text-slate-700 font-black rounded-full hover:bg-slate-50 transition-all flex items-center justify-center gap-2"><FiMessageCircle className="text-emerald-500 text-xl" />{textWithDomain(landing.cta_secondary_text, domain)}</a><a href={landing.cta_tertiary_url || '#planes'} className="px-8 py-4 bg-transparent text-emerald-600 font-black rounded-full hover:bg-emerald-50 transition-all">{textWithDomain(landing.cta_tertiary_text, domain)}</a></div></motion.div></div>
        </section>
      </main>
      <footer className="bg-slate-900 border-t border-slate-800 pt-16 pb-8 text-slate-300"><div className="max-w-7xl mx-auto px-6"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 mb-16"><div className="col-span-1 lg:col-span-2"><div className="flex items-center gap-3 mb-6"><LogoMark landing={landing} /><span className="text-2xl font-black text-white tracking-tight">{textWithDomain(landing.brand_name, domain)}</span></div><p className="text-slate-400 text-sm mb-8 max-w-sm leading-relaxed">{textWithDomain(landing.footer_description, domain)}</p><div className="flex gap-4"><a href="#" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-emerald-500 hover:text-white transition-all"><FiInstagram /></a><a href="#" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-emerald-500 hover:text-white transition-all"><FiFacebook /></a><a href="#" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-emerald-500 hover:text-white transition-all"><FiTwitter /></a></div></div><div><h4 className="font-black text-white mb-6">Plataforma</h4><ul className="space-y-4">{['Inicio', 'Solución', 'Módulos', 'Planes', 'Preguntas frecuentes'].map((item) => <li key={item}><a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">{item}</a></li>)}</ul></div><div><h4 className="font-black text-white mb-6">Accesos</h4><ul className="space-y-4"><li><a href={landing.access_button_url || '#/admin'} className="text-sm text-slate-400 hover:text-white transition-colors">Iniciar sesión</a></li><li><a href={landing.demo_button_url || '#contacto'} className="text-sm text-emerald-400 hover:text-emerald-300 font-bold transition-colors">Solicitar demo</a></li><li><a href={landing.cta_secondary_url || '#'} className="text-sm text-slate-400 hover:text-white transition-colors">Soporte por WhatsApp</a></li><li><a href={`mailto:${landing.footer_email || 'hola@wamercio.com'}`} className="text-sm text-slate-400 hover:text-white transition-colors">{landing.footer_email || 'hola@wamercio.com'}</a></li></ul></div><div><h4 className="font-black text-white mb-6">Legal</h4><ul className="space-y-4"><li><a href={getPlatformHashUrl('/terms')} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 hover:text-white transition-colors">Términos y condiciones</a></li><li><a href={getPlatformHashUrl('/privacy')} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 hover:text-white transition-colors">Privacidad y datos</a></li></ul></div></div><div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4"><p className="text-sm text-slate-500">© {new Date().getFullYear()} {textWithDomain(landing.brand_name, domain)}. Todos los derechos reservados.</p><div className="flex items-center gap-2 text-sm text-slate-500"><span className="flex items-center gap-1.5 text-emerald-500 font-bold bg-emerald-500/10 px-3 py-1 rounded-full"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> {textWithDomain(landing.footer_status_text, domain)}</span></div></div></div></footer>
    </div>
  );
};

export default SaasLanding;
