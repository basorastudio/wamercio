import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from '@/lib/navigation';
import { motion } from 'framer-motion';
import { useStaffAuth } from '../context/StaffAuthContext';
import { useStore } from '../context/StoreContext';
import { isDeliveryAccepted, isDeliveryOrder, storeCoordinates } from '../lib/delivery';
import UserAvatar from '../common/UserAvatar';
import MotorcycleIcon from '../common/MotorcycleIcon';
import * as FiIcons from 'react-icons/fi';

const { FiHome, FiPackage, FiMap, FiClock, FiLogOut, FiBell, FiUser, FiChevronRight } = FiIcons;

const navItems = [
  { icon: FiHome,    label: 'Inicio',    to: '/delivery' },
  { icon: FiPackage, label: 'Pedidos',   to: '/delivery/orders' },
  { icon: FiMap,     label: 'Mi Ruta',   to: '/delivery/route' },
  { icon: FiClock,   label: 'Historial', to: '/delivery/history' },
  { icon: FiUser,    label: 'Mi perfil', to: '/delivery/profile' },
];

const displayName = (user) => {
  const name = [user?.name, user?.last_name || user?.lastName].filter(Boolean).join(' ').trim();
  return name || user?.name || 'Repartidor';
};

const SidebarItem = ({ item, active }: any) => (
  <Link
    to={item.to}
    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-semibold ${
      active
        ? 'bg-[#00a884] text-white shadow-md shadow-[#00a884]/30'
        : 'text-gray-400 hover:bg-white/10 hover:text-white'
    }`}
  >
    <item.icon className="text-lg shrink-0" />
    <span>{item.label}</span>
    {active && <FiChevronRight className="ml-auto text-white/60 text-sm" />}
  </Link>
);

const UserBlock = ({ user, onExit = undefined }: any) => (
  <div className="p-3 border-t border-white/10">
    <Link to="/delivery/profile" className="flex items-center gap-3 mb-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors">
      <UserAvatar user={user} name={displayName(user)} className="w-8 h-8 rounded-full bg-[#00a884]/20 text-[#00a884] flex items-center justify-center shrink-0" icon={FiUser} iconClassName="text-sm" textClassName="text-xs font-black" />
      <div className="flex-1 min-w-0">
        <p className="text-white text-xs font-bold truncate">{displayName(user)}</p>
        <p className="text-gray-400 text-[10px] truncate">Panel de repartidor</p>
      </div>
    </Link>
    {onExit && (
      <button
        onClick={onExit}
        className="w-full flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 transition-colors rounded-lg text-gray-300 text-xs font-bold"
      >
        <FiLogOut className="text-xs" /> Cerrar sesión
      </button>
    )}
  </div>
);

const DeliveryDriverLayout = ({ children, onExit = undefined }: any) => {
  const location = useLocation();
  const { staffUser } = useStaffAuth();
  const { sales = [], updateDriverLocation, activeStore } = useStore();
  const currentItem = navItems.find(item => item.to === location.pathname) || navItems[0];
  const name = displayName(staffUser);
  const [trackingState, setTrackingState] = useState<'idle' | 'active' | 'blocked' | 'error'>('idle');
  const hasStoreLocation = Boolean(storeCoordinates(activeStore));
  const hasTrackableDelivery = useMemo(() => sales.some((sale) => {
    if (!isDeliveryOrder(sale)) return false;
    return isDeliveryAccepted(sale) && ['ready_for_delivery', 'on_the_way'].includes(sale.status);
  }), [sales]);

  useEffect(() => {
    if (!hasTrackableDelivery) {
      setTrackingState('idle');
      return undefined;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setTrackingState('error');
      return undefined;
    }
    let lastSentAt = 0;
    let disposed = false;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (disposed) return;
        setTrackingState('active');
        const now = Date.now();
        if (now - lastSentAt < 12000) return;
        lastSentAt = now;
        const locationPayload = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy || 0,
          heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
          speed: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
        };
        updateDriverLocation(locationPayload)
          .then((response) => {
            window.dispatchEvent(new CustomEvent('colmapro:driver-location', {
              detail: { ...locationPayload, updatedAt: response?.updated_at || new Date().toISOString() },
            }));
          })
          .catch(() => setTrackingState('error'));
      },
      (error) => setTrackingState(error.code === error.PERMISSION_DENIED ? 'blocked' : 'error'),
      { enableHighAccuracy: true, maximumAge: 8000, timeout: 15000 },
    );
    return () => {
      disposed = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [hasTrackableDelivery, updateDriverLocation]);

  const trackingLabel = trackingState === 'active'
    ? 'Ubicación en vivo activa'
    : trackingState === 'blocked'
      ? 'Permite la ubicación'
      : trackingState === 'error'
        ? hasStoreLocation ? 'Ruta desde el negocio' : 'Ubicación no disponible'
        : 'Se activa con una entrega lista';

  return (
    <div className="app-viewport flex bg-[#f0f4f8] overflow-hidden relative">
      <aside className="hidden lg:flex flex-col w-60 bg-[#1a2332] shrink-0">
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#00a884] rounded-xl flex items-center justify-center shadow-md">
              <MotorcycleIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-black text-white text-sm leading-tight">{name}</p>
              <p className="text-[10px] text-gray-400">Panel de repartidor</p>
            </div>
          </div>
        </div>

        <div className={`mx-3 mt-3 px-3 py-2.5 rounded-xl flex items-center gap-2 border ${trackingState === 'active' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-white/5 border-white/10'}`}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${trackingState === 'active' ? 'bg-emerald-400 animate-pulse' : trackingState === 'blocked' || trackingState === 'error' ? 'bg-amber-400' : 'bg-gray-500'}`} />
          <div>
            <p className={`text-[10px] font-black ${trackingState === 'active' ? 'text-emerald-400' : 'text-gray-300'}`}>EN SERVICIO</p>
            <p className="text-[9px] text-gray-400 leading-tight">{trackingLabel}</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 mt-1">
          {navItems.map(item => (
            <SidebarItem key={item.to} item={item} active={location.pathname === item.to} />
          ))}
        </nav>

        <UserBlock user={staffUser} onExit={onExit} />
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <header className="app-fixed-edge bg-white text-gray-800 shadow-sm border-b border-gray-100 lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">

            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 bg-[#00a884]/10 rounded-xl flex items-center justify-center border border-[#00a884]/20 shrink-0">
                <MotorcycleIcon className="w-5 h-5 text-[#00a884]" />
              </div>
              <div className="min-w-0">
                <h1 className="font-black text-[14px] leading-tight text-gray-800 truncate">{name}</h1>
                <p className="text-[11px] text-[#00a884] font-semibold mt-0.5 truncate">● {currentItem.label} · {trackingLabel}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button className="relative w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                <FiBell className="text-lg" />
              </button>
              {onExit && (
                <button
                  onClick={onExit}
                  className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center text-red-400 hover:bg-red-100 transition-colors"
                  title="Cerrar sesión"
                >
                  <FiLogOut className="text-sm" />
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 min-h-0 app-scroll-area scrollbar-hide bg-[#f0f4f8] relative">
          {children}
        </main>

        <nav className="app-fixed-edge bg-white border-t border-gray-200 safe-bottom lg:hidden">
          <div className="flex justify-around items-center h-[60px] px-1 max-w-md mx-auto">
            {navItems.map(item => {
              const isActive = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex flex-col items-center justify-center flex-1 h-full space-y-1 transition-colors relative ${
                    isActive ? 'text-[#00a884]' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="delivery-driver-indicator"
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#00a884] rounded-full"
                    />
                  )}
                  <item.icon className="text-[21px] stroke-[1.5]" />
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

export default DeliveryDriverLayout;
