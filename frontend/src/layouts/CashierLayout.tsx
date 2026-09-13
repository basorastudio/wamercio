import React from 'react';
import { Link, useLocation } from '@/lib/navigation';
import { motion } from 'framer-motion';
import { useStore } from '../context/StoreContext';
import { useStaffAuth } from '../context/StaffAuthContext';
import UserAvatar from '../common/UserAvatar';
import * as FiIcons from 'react-icons/fi';

const {
  FiShoppingCart, FiList, FiLogOut,
  FiChevronRight, FiUnlock, FiLock, FiUser
} = FiIcons;

const navItems = [
  { icon: FiShoppingCart, label: 'TPV',       to: '/cashier' },
  { icon: FiList,         label: 'Ventas',    to: '/cashier/sales' },
  { icon: FiUnlock,       label: 'Caja',      to: '/cashier/register' },
  { icon: FiUser,         label: 'Mi perfil', to: '/cashier/profile' },
];

const displayName = (user, fallback = 'Cajero') => {
  const name = [user?.name, user?.last_name || user?.lastName].filter(Boolean).join(' ').trim();
  return name || user?.name || fallback;
};

const isNavActive = (pathname: string, to: string) => {
  if (to === '/cashier') {
    return pathname === '/cashier' || pathname === '/cashier/local' || pathname === '/cashier/assisted' || pathname === '/cashier/online';
  }
  return pathname === to;
};

const NavLink = ({ item, active, cashRegisterOpen: cashRegisterOpen, onClick = undefined }: any) => {
  const isCashRegister = item.to === '/cashier/register';
  return (
    <Link
      to={item.to}
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all relative ${
        active
          ? 'bg-[#00a884] text-white shadow-md shadow-[#00a884]/30'
          : 'text-gray-400 hover:bg-white/10 hover:text-white'
      }`}
    >
      <item.icon className="text-lg shrink-0" />
      <span>{item.label}</span>
      {active && <FiChevronRight className="ml-auto text-white/60 text-sm" />}
      {isCashRegister && !active && (
        <span className={`absolute right-3 top-3.5 w-2 h-2 rounded-full ${
          cashRegisterOpen ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
        }`} />
      )}
    </Link>
  );
};

const BottomNavItem = ({ item, active, cashRegisterOpen: cashRegisterOpen, onClick = undefined }: any) => {
  const isCashRegister = item.to === '/cashier/register';
  return (
    <Link
      to={item.to}
      onClick={onClick}
      className={`flex flex-col items-center justify-center flex-1 h-full gap-1 relative transition-colors ${
        active ? 'text-[#00a884]' : 'text-gray-400'
      }`}
    >
      {active && (
        <motion.div
          layoutId="cajero-tab-indicator"
          className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#00a884] rounded-full"
        />
      )}
      <div className="relative">
        <item.icon className={`text-[21px] stroke-[1.5] ${active ? 'text-[#00a884]' : 'text-gray-400'}`} />
        {isCashRegister && (
          <span className={`absolute -top-0.5 -right-1 w-2 h-2 rounded-full border border-white ${
            cashRegisterOpen ? 'bg-emerald-400' : 'bg-red-400'
          }`} />
        )}
      </div>
      <span className={`text-[9px] font-semibold leading-none ${active ? 'text-[#00a884]' : 'text-gray-400'}`}>
        {item.label}
      </span>
    </Link>
  );
};

const CashRegisterStatusBadge = ({ cashRegisterState: cashRegisterState }) => (
  <div className={`mx-3 mt-3 px-3 py-2.5 rounded-xl flex items-center gap-2 border ${
    cashRegisterState.isOpen
      ? 'bg-emerald-500/10 border-emerald-500/20'
      : 'bg-red-500/10 border-red-500/20'
  }`}>
    {cashRegisterState.isOpen
      ? <FiUnlock className="text-emerald-400 text-sm shrink-0" />
      : <FiLock className="text-red-400 text-sm shrink-0" />
    }
    <div>
      <p className={`text-[10px] font-black ${cashRegisterState.isOpen ? 'text-emerald-400' : 'text-red-400'}`}>
        CAJA {cashRegisterState.isOpen ? 'ABIERTA' : 'CERRADA'}
      </p>
      {cashRegisterState.isOpen && (
        <p className="text-[9px] text-gray-400 leading-tight">{cashRegisterState.opening?.cashier}</p>
      )}
    </div>
    {cashRegisterState.isOpen && (
      <span className="ml-auto w-2 h-2 bg-emerald-400 rounded-full animate-pulse shrink-0" />
    )}
  </div>
);

const UserBlock = ({ user, onExit }) => (
  <div className="p-3 border-t border-white/10">
    <Link to="/cashier/profile" className="flex items-center gap-3 mb-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors">
      <UserAvatar user={user} name={displayName(user)} className="w-8 h-8 rounded-full bg-[#00a884]/20 text-[#00a884] flex items-center justify-center shrink-0" icon={FiUser} iconClassName="text-sm" textClassName="text-xs font-black" />
      <div className="flex-1 min-w-0">
        <p className="text-white text-xs font-bold truncate">{displayName(user)}</p>
        <p className="text-gray-400 text-[10px] truncate">Panel de caja</p>
      </div>
    </Link>
    <button onClick={onExit}
      className="w-full flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 transition-colors rounded-lg text-gray-300 text-xs font-bold"
    >
      <FiLogOut className="text-xs" /> Cerrar sesión
    </button>
  </div>
);

const CashierLayout = ({ children, onExit = () => {} }) => {
  const location      = useLocation();
  const { cashRegisterState: cashRegisterState, activeStore } = useStore();
  const { staffUser } = useStaffAuth();
  const currentItem  = navItems.find(n => isNavActive(location.pathname, n.to)) || navItems[0];
  const currentLabel = currentItem.label;
  const storeName = activeStore?.name || 'Mi negocio';
  const cashierName = displayName(staffUser);

  return (
    <div className="app-viewport flex bg-[#f0f4f8] overflow-hidden">

      <aside className="hidden lg:flex flex-col w-60 bg-[#1a2332] shrink-0">
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#00a884] rounded-xl flex items-center justify-center shadow-md">
              <span className="text-xl">🧾</span>
            </div>
            <div>
              <p className="font-black text-white text-sm leading-tight">{storeName}</p>
              <p className="text-[10px] text-gray-400">Panel de caja</p>
            </div>
          </div>
        </div>

        <CashRegisterStatusBadge cashRegisterState={cashRegisterState} />

        <nav className="flex-1 p-3 space-y-1 mt-1">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              item={item}
              active={isNavActive(location.pathname, item.to)}
              cashRegisterOpen={cashRegisterState.isOpen}
            />
          ))}
        </nav>

        <UserBlock user={staffUser} onExit={onExit} />
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">

        <header className="app-fixed-edge bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between lg:hidden shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 bg-[#00a884] rounded-xl flex items-center justify-center shrink-0">
              <span className="text-base">🧾</span>
            </div>
            <div className="min-w-0">
              <p className="font-black text-gray-800 text-sm leading-tight truncate">{cashierName}</p>
              <p className="text-[10px] text-gray-400 leading-tight truncate">{currentLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-black border ${
              cashRegisterState.isOpen
                ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                : 'bg-red-50 border-red-200 text-red-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                cashRegisterState.isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
              }`} />
              {cashRegisterState.isOpen ? 'ABIERTA' : 'CERRADA'}
            </div>
            <button
              onClick={onExit}
              className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center text-red-400 active:bg-red-100 transition-colors"
              title="Cerrar sesión"
            >
              <FiLogOut className="text-sm" />
            </button>
          </div>
        </header>

        <main className="flex-1 min-h-0 app-scroll-area lg:overflow-hidden">
          {children}
        </main>

        <nav className="app-fixed-edge bg-white border-t border-gray-200 lg:hidden safe-bottom">
          <div className="flex items-center h-[60px] px-1">
            {navItems.map(item => (
              <BottomNavItem
                key={item.to}
                item={item}
                active={isNavActive(location.pathname, item.to)}
                cashRegisterOpen={cashRegisterState.isOpen}
              />
            ))}
            <button
              onClick={onExit}
              className="flex flex-col items-center justify-center flex-1 h-full gap-1 text-red-400 active:text-red-500 transition-colors"
            >
              <FiLogOut className="text-[21px] stroke-[1.5]" />
              <span className="text-[9px] font-semibold leading-none">Salir</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
};

export default CashierLayout;
