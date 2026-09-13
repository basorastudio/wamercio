import React from 'react';
import { Link, useLocation } from '@/lib/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import type { IconType } from 'react-icons';
import { FaWhatsapp } from 'react-icons/fa';
import InstallBanner from '../components/InstallBanner';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { isWeightedProduct } from "../lib/weightedProducts";
import { getStoreServiceStatus } from '../lib/serviceHours';
import AuthScreen from '../screens/AuthScreen';
import StoreAvatar from '../common/StoreAvatar';
import UserAvatar from '../common/UserAvatar';
import { DesktopHeaderProvider, useDesktopHeader } from './DesktopHeaderContext';

const {
  FiShoppingBag, FiClipboard, FiUser, FiX, FiHome,
  FiLogOut, FiBookOpen, FiLogIn
} = FiIcons;

type MobileNavItem = {
  icon: IconType;
  label: string;
  to?: string;
  href?: string;
  external?: boolean;
  badgeCount?: number;
  badge?: boolean;
};

const normalizeWhatsAppNumber = (value: unknown) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';

  // Dominican local numbers are commonly stored with 10 digits.
  // wa.me requires the complete international number without symbols.
  if (digits.length === 10) return `1${digits}`;
  return digits;
};

const DesktopLayoutShell = ({ children, onExit = undefined }: any) => {
  const location = useLocation();
  const [clockTick, setClockTick] = React.useState(0);
  const { user, isAuthModalOpen, closeAuthModal, openAuthModal } = useAuth();
  const { activeStore, cart = [] } = useStore();
  const { headerCenter, mobileHeaderAction, mobileHeaderPanel } = useDesktopHeader();

  const cartUnits = cart.reduce(
    (total, item) =>
      total + (isWeightedProduct(item) ? 1 : Number(item.quantity || 1)),
    0,
  );

  const storeName = activeStore?.name || 'Mi negocio';

  React.useEffect(() => {
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const serviceStatus = React.useMemo(() => getStoreServiceStatus(
    activeStore?.serviceHours || activeStore?.service_hours || {},
    { active: activeStore?.active !== false },
  ), [activeStore?.serviceHours, activeStore?.service_hours, activeStore?.active, clockTick]);
  const isStoreOpen = serviceStatus.isOpen;

  const whatsappNumber = normalizeWhatsAppNumber(
    activeStore?.whatsapp ||
    activeStore?.whatsappDisplay ||
    activeStore?.whatsapp_display ||
    activeStore?.phone,
  );
  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hola, quiero información sobre ${storeName}.`)}`
    : '';

  const mobileNavItems: MobileNavItem[] = [
    { icon: FiHome,        label: 'Catálogo', to: '/' },
    { icon: FiShoppingBag, label: 'Mi Funda', to: '/cart', badgeCount: cartUnits },
    ...(user
      ? [{ icon: FiClipboard, label: 'Pedidos', to: '/orders' }]
      : []),
    ...(user?.creditEnabled
      ? [{ icon: FiBookOpen, label: 'Mi Crédito', to: '/store-credit', badge: true }]
      : []),
    ...(whatsappUrl
      ? [{ icon: FaWhatsapp, label: 'WhatsApp', href: whatsappUrl, external: true }]
      : []),
  ];

  const pendingCredit = user?.creditEnabled && (user?.usedBalance || 0) > 0;

  return (
    <div className="app-viewport flex flex-col bg-[#f8f9fa] overflow-hidden relative">

      <AnimatePresence>
        {isAuthModalOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-fit max-w-[calc(100vw-2rem)] relative"
            >
              <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden modal-viewport flex flex-col">
                <div className="min-h-0 overflow-y-auto no-scrollbar">
                  <div className="flex justify-end px-4 pt-4">
                    <button onClick={closeAuthModal}
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors shrink-0"
                      aria-label="Cerrar modal de acceso"
                    >
                      <FiX className="text-lg" />
                    </button>
                  </div>
                  <AuthScreen isModal={true} />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="app-fixed-edge bg-white text-gray-800 safe-top shadow-sm border-b border-gray-100 lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <StoreAvatar
              store={activeStore}
              className="w-10 h-10 rounded-full"
              textClassName="text-2xl"
            />
            <div className="min-w-0">
              <h1 className="truncate font-bold text-[14px] leading-tight text-gray-800">{storeName}</h1>
              <p className={`text-[11px] font-semibold mt-0.5 ${isStoreOpen ? 'text-[#00a884]' : 'text-red-500'}`}>● {serviceStatus.label}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {mobileHeaderAction}
            {onExit && (
              <button onClick={onExit}
                className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
                title="Cerrar sesión"
              >
                <FiLogOut className="text-sm" />
              </button>
            )}
            {user ? (
              <Link to="/profile"
                className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  location.pathname === '/profile' ? 'text-[#00a884]' : 'text-gray-500'
                }`}
              >
                <UserAvatar user={user} name={`${user?.name || user?.name || ''} ${user?.last_name || ''}`} className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                  location.pathname === '/profile'
                    ? 'bg-[#00a884]/10 border-[#00a884]/40 text-[#00a884]'
                    : 'bg-gray-100 border-gray-300 text-gray-500'
                }`} textClassName="text-xs font-bold" icon={FiUser} iconClassName="text-xs" />
                <span className="text-[9px] font-medium leading-none">{String(user?.name || user?.name || 'Perfil').split(' ')[0]}</span>
              </Link>
            ) : (
              <button
                onClick={openAuthModal}
                className="flex flex-col items-center justify-center gap-0.5 text-gray-600 hover:text-[#00a884] transition-colors"
                title="Entrar a mi perfil"
                aria-label="Entrar a mi perfil"
              >
                <UserAvatar
                  user={null}
                  name=""
                  className="w-8 h-8 rounded-full flex items-center justify-center border-2 bg-[#00a884]/10 border-[#00a884]/30 text-[#00a884]"
                  textClassName="text-xs font-black"
                  icon={FiLogIn}
                  iconClassName="text-sm text-[#00a884]"
                  title="Entrar a mi perfil"
                />
                <span className="text-[9px] font-medium leading-none text-gray-500">Entrar</span>
              </button>
            )}
          </div>
        </div>
        <AnimatePresence initial={false}>
          {mobileHeaderPanel}
        </AnimatePresence>
      </header>

      <header className="hidden lg:block app-fixed-edge bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto flex h-[84px] w-full max-w-[1536px] items-center justify-between gap-6 px-6">
          <Link to="/" className="flex min-w-[240px] items-center gap-3">
            <StoreAvatar
              store={activeStore}
              className="w-12 h-12 rounded-2xl"
              textClassName="text-2xl"
            />
            <div className="min-w-0">
              <h1 className="truncate text-base font-black leading-tight text-gray-900">{storeName}</h1>
              <p className={`mt-0.5 text-xs font-bold ${isStoreOpen ? 'text-[#00a884]' : 'text-red-500'}`}>● {serviceStatus.label}</p>
            </div>
          </Link>

          <div className="flex flex-1 items-center justify-center px-2">
            <div className="w-full max-w-[680px]">{headerCenter}</div>
          </div>

          <div className="flex min-w-[240px] items-center justify-end gap-3">
            {onExit && (
              <button onClick={onExit}
                className="h-11 w-11 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
                title="Cerrar sesión"
              >
                <FiLogOut className="text-base" />
              </button>
            )}

            <Link
              to="/cart"
              className={`relative flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-black transition-colors ${
                location.pathname === '/cart'
                  ? 'bg-[#eafaf1] border-[#00a884]/20 text-[#00a884] hover:bg-[#d4f5e9]'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-[#00a884]/25 hover:bg-[#f8fffc]'
              }`}
            >
              <FiShoppingBag className="text-base" />
              Mi Funda
              {cartUnits > 0 && (
                <span className={`absolute -right-2 -top-2 min-w-[22px] h-[22px] px-1 rounded-full border-2 border-white text-[10px] font-black flex items-center justify-center ${
                  location.pathname === '/cart' ? 'bg-[#00a884] text-white' : 'bg-[#00a884] text-white'
                }`}>
                  {cartUnits > 99 ? '99+' : cartUnits}
                </span>
              )}
            </Link>

            {user && (
              <Link
                to="/orders"
                className={`relative flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-black transition-colors ${
                  location.pathname === '/orders'
                    ? 'bg-[#eafaf1] border-[#00a884]/20 text-[#00a884] hover:bg-[#d4f5e9]'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-[#00a884]/25 hover:bg-[#f8fffc]'
                }`}
              >
                <FiClipboard className="text-base" />
                Pedidos
              </Link>
            )}

            {user?.creditEnabled && (
              <Link
                to="/store-credit"
                className={`relative flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-black transition-colors ${
                  location.pathname === '/store-credit'
                    ? 'bg-[#fff7ed] border-amber-200 text-amber-700 hover:bg-amber-50'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-amber-200 hover:bg-[#fffaf3]'
                }`}
                title="Ver mi crédito disponible y movimientos"
              >
                <FiBookOpen className="text-base" />
                Mi Crédito
                {pendingCredit && (
                  <span className="absolute -right-2 -top-2 min-w-[22px] h-[22px] px-1 rounded-full border-2 border-white bg-amber-500 text-[10px] font-black text-white flex items-center justify-center">
                    !
                  </span>
                )}
              </Link>
            )}

            {user ? (
              <Link to="/profile" className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 hover:border-[#00a884]/30 hover:bg-[#f8fffc] transition-colors">
                <UserAvatar user={user} name={`${user?.name || user?.name || ''} ${user?.last_name || ''}`} className={`w-9 h-9 rounded-full flex items-center justify-center border-2 ${
                  location.pathname === '/profile'
                    ? 'bg-[#00a884]/10 border-[#00a884]/40 text-[#00a884]'
                    : 'bg-gray-100 border-gray-300 text-gray-500'
                }`} textClassName="text-xs font-bold" icon={FiUser} iconClassName="text-xs" />
                <span className="max-w-[110px] truncate text-xs font-black text-gray-700">{String(user?.name || user?.name || 'Perfil').split(' ')[0]}</span>
              </Link>
            ) : (
              <button
                onClick={openAuthModal}
                className="flex h-11 items-center gap-2 rounded-2xl bg-[#00a884] px-4 text-sm font-black text-white shadow-sm shadow-[#00a884]/20 hover:bg-[#009676] transition-colors"
                title="Entrar a mi perfil"
                aria-label="Entrar a mi perfil"
              >
                <FiLogIn className="text-base" />
                Entrar
              </button>
            )}
          </div>
        </div>
      </header>




      <InstallBanner />

      <main className="flex-1 min-h-0 app-scroll-area scrollbar-hide bg-white relative lg:bg-[#f5f7f8]">
        {children}
      </main>

      <nav className="app-fixed-edge bg-white border-t border-gray-200 safe-bottom lg:hidden">
        <div className="flex justify-around items-center h-[60px] px-2 max-w-md mx-auto">
          {mobileNavItems.map(item => {
            const isActive = Boolean(item.to && location.pathname === item.to);
            const itemKey = item.to || item.href || item.label;
            const itemClassName = `flex min-w-0 flex-1 max-w-24 flex-col items-center justify-center h-full gap-1 transition-colors relative ${
              isActive ? 'text-[#00a884]' : item.external ? 'text-[#00a884] hover:text-[#008f72]' : 'text-gray-400 hover:text-gray-600'
            }`;
            const content = (
              <>
                {isActive && (
                  <motion.div
                    layoutId="mobile-tab-indicator"
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#00a884] rounded-full"
                  />
                )}
                <div className="relative">
                  <item.icon className="text-[22px] stroke-[1.5]" />
                  {Number(item.badgeCount || 0) > 0 && (
                    <span className="absolute -top-2.5 -right-2.5 min-w-[18px] h-[18px] px-1 bg-[#00a884] text-white rounded-full border-2 border-white text-[9px] font-black flex items-center justify-center leading-none shadow-sm">
                      {Number(item.badgeCount) > 99 ? '99+' : Number(item.badgeCount)}
                    </span>
                  )}
                  {item.badge && pendingCredit && !item.badgeCount && (
                    <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-amber-500 rounded-full border-2 border-white" />
                  )}
                </div>
                <span className="max-w-full truncate text-[10px] font-semibold">{item.label}</span>
              </>
            );

            if (item.external && item.href) {
              return (
                <a
                  key={itemKey}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={itemClassName}
                  title={`Abrir WhatsApp de ${storeName}`}
                  aria-label={`Abrir WhatsApp de ${storeName}`}
                >
                  {content}
                </a>
              );
            }

            return (
              <Link key={itemKey} to={item.to || '/'} className={itemClassName}>
                {content}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

const MobileLayout = ({ children, onExit = undefined }: any) => (
  <DesktopHeaderProvider>
    <DesktopLayoutShell onExit={onExit}>{children}</DesktopLayoutShell>
  </DesktopHeaderProvider>
);

export default MobileLayout;
