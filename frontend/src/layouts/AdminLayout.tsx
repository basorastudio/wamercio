import React, { useEffect, useState } from 'react';
import { Link, useLocation } from '@/lib/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../context/StoreContext';
import { api } from '../lib/api';
import * as FiIcons from 'react-icons/fi';
import StoreAvatar from '../common/StoreAvatar';
import UserAvatar from '../common/UserAvatar';
import MotorcycleIcon from '../common/MotorcycleIcon';

const {
  FiHome, FiShoppingCart, FiBox, FiUsers,
  FiBarChart2, FiMenu, FiX,
  FiChevronRight, FiGrid, FiChevronDown, FiClipboard, FiCreditCard,
  FiUser, FiLogOut, FiLayers, FiUserCheck, FiSettings, FiRotateCcw, FiShield, FiBell, FiBookOpen,
} = FiIcons;

const navItems = [
  { icon: FiHome,         label: 'Inicio',            to: '/admin' },
  { icon: FiShoppingCart, label: 'Punto de Venta',    to: '/admin/point-of-sale' },
  { icon: FiRotateCcw,    label: 'Ventas y devoluciones', to: '/admin/sales' },
  { icon: FiBox,          label: 'Catálogo',          to: '/admin/catalog' },
  { icon: FiClipboard,    label: 'Inventario',        to: '/admin/inventory' },
  { icon: FiUsers,        label: 'Clientes',          to: '/admin/customers' },
  { icon: FiUserCheck,    label: 'Usuarios',          to: '/admin/users' },
  { icon: FiBarChart2,    label: 'Reportes',          to: '/admin/reports' },
  { icon: FiBookOpen,     label: 'Contabilidad',      to: '/admin/accounting' },
  { icon: FiBell,         label: 'Notificaciones',    to: '/admin/notifications' },
  { icon: FiShield,       label: 'Auditoría',         to: '/admin/audit' },
  { icon: MotorcycleIcon, label: 'Entregas',          to: '/admin/deliveries' },
  { icon: FiCreditCard,   label: 'Métodos de pago',   to: '/admin/payment-methods' },
  { icon: FiSettings,     label: 'Configuración',      to: '/admin/settings' },
];

const bottomNav = [
  { icon: FiHome,         label: 'Inicio',     to: '/admin' },
  { icon: FiShoppingCart, label: 'Venta',      to: '/admin/point-of-sale' },
  { icon: FiBox,          label: 'Catálogo',  to: '/admin/catalog' },
  { icon: FiClipboard,    label: 'Inventario', to: '/admin/inventory' },
  { icon: FiGrid,         label: 'Más',        to: '/admin/more' },
];

const isRouteActive = (pathname, to) => {
  if (to === '/admin') return pathname === '/admin';
  return pathname === to || pathname.startsWith(`${to}/`);
};

const TenantSwitcher = ({ tenants = [], selectedTenant, onSelect }) => {
  const [open, setOpen] = useState(false);
  const active = tenants.find(t => t.slug === selectedTenant || t.id === selectedTenant) || tenants[0];
  if (!Array.isArray(tenants) || tenants.length <= 1) return null;

  return (
    <div className="mx-3 mb-2 relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-[#00a884]/15 hover:bg-[#00a884]/20 rounded-xl border border-[#00a884]/20 transition-colors"
      >
        <span className="text-base shrink-0">🏬</span>
        <div className="flex-1 text-left min-w-0">
          <p className="text-white text-xs font-black truncate leading-tight">{active?.name || 'Seleccionar negocio'}</p>
          <p className="text-[#b7efe2] text-[9px] truncate">{active?.slug || 'negocio'} · {active?.domain || 'subdominio comodín'}</p>
        </div>
        <FiChevronDown className={`text-[#b7efe2] text-xs shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="absolute top-full left-0 right-0 mt-1 bg-[#0f1a28] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="p-1 max-h-72 overflow-y-auto scrollbar-hide">
              {tenants.map(t => (
                <button key={t.id || t.slug}
                  onClick={() => { onSelect?.(t); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-white/10 ${(t.slug === selectedTenant || t.id === selectedTenant) ? 'bg-white/10' : ''}`}
                >
                  <span className="text-base shrink-0">🏪</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-bold truncate">{t.name}</p>
                    <p className="text-gray-400 text-[9px] truncate">{t.slug} · {t.status}</p>
                  </div>
                  {(t.slug === selectedTenant || t.id === selectedTenant) && <div className="w-1.5 h-1.5 bg-[#00a884] rounded-full shrink-0" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const SidebarItem = ({ icon: Icon, label, to, active, onClick = undefined }: any) => {
  const base = `flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-semibold ${
    active
      ? 'bg-[#00a884] text-white shadow-md shadow-[#00a884]/30'
      : 'text-gray-400 hover:bg-white/10 hover:text-white'
  }`;
  return (
    <Link to={to} onClick={onClick} className={base}>
      <Icon className="text-lg shrink-0" />
      <span>{label}</span>
      {active && <FiChevronRight className="ml-auto text-white/60 text-sm" />}
    </Link>
  );
};

const MobileBusinessSwitcher = ({ stores, activeStoreId, onSwitch }) => {
  const [open, setOpen] = useState(false);
  const active = stores.find(s => s.id === activeStoreId) || stores[0];

  if (stores.length <= 1) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 rounded-xl border border-gray-200 active:bg-gray-200 transition-colors"
      >
        <StoreAvatar store={active} className="w-7 h-7 rounded-lg" textClassName="text-sm" />
        <span className="text-xs font-black text-gray-700 max-w-[80px] truncate">
          {active?.name?.split(' ').slice(-1)[0] || 'Negocio'}
        </span>
        <FiChevronDown className={`text-gray-400 text-xs transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40" onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 overflow-hidden min-w-[200px]"
            >
              <div className="p-1.5 space-y-0.5">
                {stores.map(s => (
                  <button key={s.id}
                    onClick={() => { onSwitch(s.id); setOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${
                      s.id === activeStoreId ? 'bg-[#00a884]/10' : 'hover:bg-gray-50'
                    }`}
                  >
                    <StoreAvatar store={s} className="w-8 h-8 rounded-lg" textClassName="text-base" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold truncate ${s.id === activeStoreId ? 'text-[#00a884]' : 'text-gray-700'}`}>
                        {s.name}
                      </p>
                      <p className="text-[9px] text-gray-400 truncate">{s.address}</p>
                    </div>
                    {s.id === activeStoreId && <div className="w-1.5 h-1.5 bg-[#00a884] rounded-full shrink-0" />}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const adminDisplayName = (profile) => {
  const name = [profile?.name, profile?.last_name || profile?.lastName].filter(Boolean).join(' ').trim();
  return name || 'Administrador';
};

const UserBlock = ({ onExit, profile, active, onProfileClick = undefined }) => (
  <div className="p-4 border-t border-white/10">
    <Link
      to="/admin/profile"
      onClick={onProfileClick}
      className={`mb-3 flex items-center gap-3 rounded-xl px-2 py-2 transition-all ${
        active
          ? 'bg-[#00a884] text-white shadow-md shadow-[#00a884]/30'
          : 'hover:bg-white/10 text-white'
      }`}
    >
      <UserAvatar user={profile} name={adminDisplayName(profile)} className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
        active ? 'bg-white/20 text-white border border-white/20' : 'bg-[#00a884]/20 text-[#00a884] border border-[#00a884]/20'
      }`} icon={FiUser} iconClassName="text-sm" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold truncate">{adminDisplayName(profile)}</p>
        <p className={`text-[10px] truncate ${active ? 'text-white/75' : 'text-gray-400'}`}>Panel administrativo</p>
      </div>
      {active && <FiChevronRight className="text-white/60 text-sm shrink-0" />}
    </Link>
    <button
      onClick={onExit}
      className="w-full flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 transition-colors rounded-lg text-gray-300 text-xs font-bold"
    >
      <FiLogOut className="text-xs" /> Cerrar sesión
    </button>
  </div>
);

const AdminLayout = ({ children, onExit = () => {}, tenants = [], selectedTenant = '', onTenantSelect = undefined }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const location = useLocation();
  const { stores, activeStoreId, switchStore } = useStore();

  const currentLabel = location.pathname === '/admin/profile'
    ? 'Mi Perfil'
    : location.pathname.startsWith('/admin/settings')
      ? 'Configuración'
      : navItems.find(n => isRouteActive(location.pathname, n.to))?.label || 'Panel administrativo';

  useEffect(() => {
    let alive = true;
    api.get('/admin/profile')
      .then(data => { if (alive) setProfile(data); })
      .catch(() => {});
    return () => { alive = false; };
  }, [location.pathname, selectedTenant]);

  return (
    <div className="app-viewport flex bg-[#f0f4f8] overflow-hidden">

      <aside className="hidden lg:flex flex-col w-64 bg-[#1a2332] shrink-0">
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-md overflow-hidden p-0.5">
              <img src="/brand/wamercio-app-icon.png" alt="WAMERCIO" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="font-black text-white text-sm leading-tight">WAMERCIO</p>
              <p className="text-[10px] text-gray-400">Panel administrativo</p>
            </div>
          </div>
        </div>

        {tenants.length > 1 && (
          <div className="pt-3 pb-1">
            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest px-4 mb-2">Negocio activo</p>
            <TenantSwitcher tenants={tenants} selectedTenant={selectedTenant} onSelect={onTenantSelect} />
          </div>
        )}


        <nav className="flex-1 p-3 space-y-1 overflow-y-auto border-t border-white/10 pt-3 scrollbar-hide">
          {navItems.map(item => (
            <SidebarItem
              key={item.label} {...item}
              active={isRouteActive(location.pathname, item.to)}
            />
          ))}
        </nav>

        <UserBlock onExit={onExit} profile={profile} active={location.pathname === '/admin/profile'} />
      </aside>

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed inset-y-0 left-0 w-72 bg-[#1a2332] z-50 flex flex-col lg:hidden shadow-2xl"
            >
              <div className="p-5 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center overflow-hidden p-0.5">
                    <img src="/brand/wamercio-app-icon.png" alt="WAMERCIO" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <p className="font-black text-white text-sm">WAMERCIO</p>
                    <p className="text-[10px] text-gray-400">Panel administrativo</p>
                  </div>
                </div>
                <button onClick={() => setDrawerOpen(false)}
                  className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center text-gray-400"
                >
                  <FiX />
                </button>
              </div>

              {tenants.length > 1 && (
                <div className="pt-3 pb-1">
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest px-4 mb-2">Negocio activo</p>
                  <TenantSwitcher tenants={tenants} selectedTenant={selectedTenant}
                    onSelect={(tenant) => { onTenantSelect?.(tenant); setDrawerOpen(false); }}
                  />
                </div>
              )}


              <nav className="flex-1 p-3 space-y-1 overflow-y-auto border-t border-white/10 pt-3 scrollbar-hide">
                {navItems.map(item => (
                  <SidebarItem
                    key={item.label} {...item}
                    active={isRouteActive(location.pathname, item.to)}
                    onClick={() => setDrawerOpen(false)}
                  />
                ))}
              </nav>

              <UserBlock
                onExit={onExit}
                profile={profile}
                active={location.pathname === '/admin/profile'}
                onProfileClick={() => setDrawerOpen(false)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <header className="app-fixed-edge bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between lg:hidden shadow-sm">
          <button onClick={() => setDrawerOpen(true)}
            className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600"
          >
            <FiMenu />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-white rounded-lg flex items-center justify-center overflow-hidden ring-1 ring-emerald-100">
              <img src="/brand/wamercio-app-icon.png" alt="WAMERCIO" className="w-full h-full object-cover" />
            </div>
            <span className="font-black text-gray-800 text-sm">{currentLabel}</span>
          </div>
          <MobileBusinessSwitcher stores={stores} activeStoreId={activeStoreId} onSwitch={switchStore} />
        </header>

        <main className="flex-1 min-h-0 app-scroll-area scrollbar-hide relative">
          {children}
        </main>

        <nav className="app-fixed-edge bg-white border-t border-gray-200 lg:hidden print:hidden">
          <div className="flex justify-around items-center h-[60px] px-2">
            {bottomNav.map(item => {
              const isActive = isRouteActive(location.pathname, item.to);
              return (
                <Link key={item.to} to={item.to}
                  className={`flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors ${
                    isActive ? 'text-[#00a884]' : 'text-gray-400'
                  }`}
                >
                  <item.icon className="text-[20px]" />
                  <span className="text-[9px] font-semibold">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
};

export default AdminLayout;