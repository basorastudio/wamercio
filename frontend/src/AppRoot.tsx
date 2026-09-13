'use client';

import React, { useEffect } from 'react';
import { Navigate, NavigationProvider, useLocation, useNavigate } from '@/lib/navigation';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import { useStaffAuth } from '@/context/StaffAuthContext';
import { api, getPlatformRedirectUrl, isPlatformRootHost, isTenantRootHost } from '@/lib/api';
import LoadingScreen from '@/components/LoadingScreen';
import MobileLayout from '@/layouts/MobileLayout';
import AdminLayout from '@/layouts/AdminLayout';
import DeliveryDriverLayout from '@/layouts/DeliveryDriverLayout';
import CashierLayout from '@/layouts/CashierLayout';

import Catalog from '@/screens/Catalog';
import MyCart from '@/screens/MyCart';
import MyOrders from '@/screens/MyOrders';
import MyStoreCredit from '@/screens/MyStoreCredit';
import Profile from '@/screens/Profile';
import EditProfile from '@/screens/EditProfile';

import Dashboard from '@/screens/Dashboard';
import PointOfSale from '@/screens/PointOfSale';
import Products from '@/screens/Products';
import Inventory from '@/screens/Inventory';
import Customers from '@/screens/Customers';
import Users from '@/screens/Users';
import Reports from '@/screens/Reports';
import SalesOperations from '@/screens/SalesOperations';
import AuditLog from '@/screens/AuditLog';
import Accounting from '@/screens/Accounting';
import Notifications from '@/screens/Notifications';
import DeliveryOperations from '@/screens/DeliveryOperations';
import More from '@/screens/More';
import Settings from '@/screens/Settings';
import PaymentMethods from '@/screens/PaymentMethods';
import AdminProfile from '@/screens/AdminProfile';
import AdminLogin from '@/screens/AdminLogin';
import SuperAdmin from '@/screens/SuperAdmin';
import SaasLanding from '@/screens/SaasLanding';
import AccountRecovery from '@/screens/AccountRecovery';
import LegalDocument from '@/screens/LegalDocument';

import CashierSales from '@/screens/CashierSales';
import CashRegisterControl from '@/screens/CashRegisterControl';
import StaffProfile from '@/screens/StaffProfile';

import DeliveryHome from '@/screens/delivery/DeliveryHome';
import DeliveryOrders from '@/screens/delivery/DeliveryOrders';
import DeliveryRoute from '@/screens/delivery/DeliveryRoute';
import DeliveryHistory from '@/screens/delivery/DeliveryHistory';

const RouteSwitch = ({ routes, fallback = '/' }) => {
  const { pathname } = useLocation();
  return routes[pathname] || <Navigate to={fallback} replace />;
};


const InitialAppScreen = () => <LoadingScreen />;

const ProtectedRoute = ({ children }) => {
  const { user, loading: authLoading, sessionChecked, openAuthModal } = useAuth();

  useEffect(() => {
    if (sessionChecked && !authLoading && !user) openAuthModal();
  }, [sessionChecked, authLoading, user, openAuthModal]);

  if (!sessionChecked || authLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/" replace />;
  return children;
};

const AdminTenantSelector = ({ tenants, selectedTenant, onSelect }) => {
  if (!Array.isArray(tenants) || tenants.length === 0) {
    return (
      <div className="min-h-[100dvh] bg-[#0f1a28] flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#00a884]/10 flex items-center justify-center text-3xl mb-4">🏪</div>
          <h1 className="text-2xl font-black text-gray-900">No hay negocios activos</h1>
          <p className="text-sm text-gray-500 mt-2">Crea un negocio desde el panel de superadministración para empezar a administrarlo desde aquí.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#0f1a28] flex items-center justify-center p-6">
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl p-7 lg:p-9">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Panel administrativo central</p>
            <h1 className="text-2xl font-black text-gray-900 mt-1">Selecciona un negocio</h1>
            <p className="text-sm text-gray-500 mt-1">Desde un solo acceso puedes cambiar entre los negocios asignados y administrar cada uno.</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#00a884]/10 flex items-center justify-center text-2xl shrink-0">🏪</div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {tenants.map((tenant) => {
            const active = selectedTenant === tenant.slug;
            return (
              <button
                key={tenant.id || tenant.slug}
                type="button"
                onClick={() => onSelect(tenant)}
                className={`text-left rounded-2xl border p-4 transition-all ${active ? 'border-[#00a884] bg-[#00a884]/10 shadow-lg shadow-[#00a884]/10' : 'border-gray-200 bg-gray-50 hover:border-[#00a884]/40 hover:bg-white'}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#00a884]/10 flex items-center justify-center text-2xl">🏪</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-black text-gray-900 truncate">{tenant.name}</p>
                      <span className={`text-[10px] font-black rounded-full px-2 py-0.5 ${tenant.status === 'active' ? 'bg-[#00a884]/10 text-[#00a884]' : 'bg-gray-200 text-gray-500'}`}>
                        {tenant.status === 'active' ? 'Activo' : tenant.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{tenant.slug} · {tenant.domain || `${tenant.slug}.${api.getRootDomain?.() || ''}`}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const AdminGate = ({ children }) => {
  const navigate = useNavigate();
  const [checked, setChecked] = React.useState(false);
  const [authenticated, setAuthenticated] = React.useState(false);
  const [tenants, setTenants] = React.useState([]);
  const [selectedTenant, setSelectedTenant] = React.useState(() => (typeof window !== 'undefined' ? api.getAdminTenant() : ''));
  const [tenantReady, setTenantReady] = React.useState(!isPlatformRootHost());

  const loadAdminTenants = React.useCallback(async () => {
    if (!isPlatformRootHost()) {
      setTenantReady(true);
      return;
    }
    const items = await api.get('/admin/businesses');
    setTenants(Array.isArray(items) ? items : []);
    const current = api.getAdminTenant();
    const found = (Array.isArray(items) ? items : []).find(item => item.slug === current || item.id === current);
    const next = found || (Array.isArray(items) ? items : [])[0];
    if (next && !found) {
      api.setAdminTenant(next);
      setSelectedTenant(next.slug || next.id || '');
    } else if (found) {
      setSelectedTenant(found.slug || found.id || '');
    }
    setTenantReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = (event: any) => {
      const slug = event?.detail?.slug || event?.detail?.tenant?.slug || api.getAdminTenant();
      if (slug) {
        setSelectedTenant(slug);
        setTenantReady(true);
      }
    };
    window.addEventListener('wamercio:tenant-changed', handler);
    return () => window.removeEventListener('wamercio:tenant-changed', handler);
  }, []);

  useEffect(() => {
    let alive = true;
    const token = typeof window !== 'undefined' ? api.getAdminToken() : '';
    if (!token) {
      setChecked(true);
      setAuthenticated(false);
      return;
    }
    setChecked(false);
    api.get('/admin/session')
      .then(async () => {
        if (!alive) return;
        setAuthenticated(true);
        try {
          await loadAdminTenants();
        } catch (_) {
          if (isPlatformRootHost()) api.clearAdminSession();
          if (alive) setAuthenticated(false);
        }
        if (alive) setChecked(true);
      })
      .catch(() => {
        api.clearAdminSession();
        if (alive) {
          setAuthenticated(false);
          setChecked(true);
        }
      });
    return () => { alive = false; };
  }, [loadAdminTenants]);

  const handleLoginSuccess = async (user) => {
    setAuthenticated(true);
    setChecked(false);
    try {
      await loadAdminTenants();
    } finally {
      setChecked(true);
    }
  };

  const handleTenantSelect = (tenant) => {
    api.setAdminTenant(tenant);
    setSelectedTenant(tenant.slug || tenant.id || '');
    setTenantReady(true);
  };

  if (!checked) return <LoadingScreen />;
  if (!authenticated) {
    return (
      <AdminLogin
        onSuccess={handleLoginSuccess}
        onBack={() => navigate('/', { replace: true })}
      />
    );
  }
  if (isPlatformRootHost() && !tenantReady) return <LoadingScreen />;
  if (isPlatformRootHost() && !api.getAdminTenant()) {
    return <AdminTenantSelector tenants={tenants} selectedTenant={selectedTenant} onSelect={handleTenantSelect} />;
  }
  return React.cloneElement(children, { tenants, selectedTenant, onTenantSelect: handleTenantSelect });
};

const StaffGate = ({ role, children }) => {
  const navigate = useNavigate();
  const { openAuthModal } = useAuth();
  const { staffUser, staffRole, checked, loading, logout } = useStaffAuth();

  useEffect(() => {
    if (checked && !loading && (!staffUser || staffRole !== role)) {
      openAuthModal();
      navigate('/', { replace: true });
    }
  }, [checked, loading, staffUser, staffRole, role, openAuthModal, navigate]);

  if (!checked || loading) return <LoadingScreen />;
  if (!staffUser || staffRole !== role) return null;

  return React.cloneElement(children, {
    onExit: () => {
      logout();
      navigate('/', { replace: true });
    },
  });
};

const AppContent = () => {
  const { loading, activeStore } = useStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (typeof document === 'undefined' || !activeStore || isPlatformRootHost()) return;
    const storeName = String(activeStore.name || 'WAMERCIO').trim();
    const accent = String(activeStore.color || '#00a884').trim() || '#00a884';
    const logoUrl = String(activeStore.logoUrl || activeStore.logo_url || '').trim();

    document.documentElement.style.setProperty('--wamercio-accent', accent);
    document.title = `${storeName} | WAMERCIO`;

    let theme = document.querySelector('meta[name="theme-color"]');
    if (!theme) {
      theme = document.createElement('meta');
      theme.setAttribute('name', 'theme-color');
      document.head.appendChild(theme);
    }
    theme.setAttribute('content', accent);

    if (logoUrl) {
      let icon = document.querySelector('link[rel="icon"]');
      if (!icon) {
        icon = document.createElement('link');
        icon.setAttribute('rel', 'icon');
        document.head.appendChild(icon);
      }
      icon.setAttribute('href', logoUrl);
    }
  }, [activeStore?.name, activeStore?.color, activeStore?.logoUrl, activeStore?.logo_url]);

  if (pathname === '/recover-account' || pathname.startsWith('/recover-account?')) return <AccountRecovery />;
  if (pathname === '/terms') return <LegalDocument type="terms" />;
  if (pathname === '/privacy') return <LegalDocument type="privacy" />;

  if (pathname.startsWith('/superadmin')) {
    return <SuperAdmin />;
  }

  if (pathname.startsWith('/admin')) {
    return (
      <AdminGate>
        <AdminLayout onExit={() => {
          api.clearAdminSession();
          navigate('/', { replace: true });
        }}>
          <RouteSwitch
            fallback="/admin"
            routes={{
              '/admin': <Dashboard />,
              '/admin/point-of-sale': <PointOfSale />,
              '/admin/point-of-sale/local': <PointOfSale />,
              '/admin/point-of-sale/assisted': <PointOfSale />,
              '/admin/point-of-sale/online': <PointOfSale />,
              '/admin/catalog': <Products />,
              '/admin/catalog/products': <Products />,
              '/admin/catalog/categories': <Products />,
              '/admin/catalog/brands': <Products />,
              '/admin/inventory': <Inventory />,
              '/admin/customers': <Customers />,
              '/admin/users': <Users />,
              '/admin/reports': <Reports />,
              '/admin/sales': <SalesOperations />,
              '/admin/audit': <AuditLog />,
              '/admin/accounting': <Accounting />,
              '/admin/notifications': <Notifications />,
              '/admin/reports/sales': <Reports />,
              '/admin/reports/store-credit': <Reports />,
              '/admin/deliveries': <DeliveryOperations />,
              '/admin/deliveries/zones': <DeliveryOperations />,
              '/admin/delivery-zones': <Navigate to="/admin/deliveries/zones" replace />,
              '/admin/payment-methods': <PaymentMethods />,
              '/admin/payment-methods/accounts': <PaymentMethods />,
              '/admin/more': <More />,
              '/admin/settings': <Settings />,
              '/admin/profile': <AdminProfile />,
            }}
          />
        </AdminLayout>
      </AdminGate>
    );
  }

  if (isPlatformRootHost()) {
    return <SaasLanding />;
  }

  if (loading) return <LoadingScreen store={activeStore} />;

  if (pathname.startsWith('/cashier')) {
    return (
      <StaffGate role="cashier">
        <CashierLayout>
          <RouteSwitch
            fallback="/cashier"
            routes={{
              '/cashier': <PointOfSale basePath="/cashier" />,
              '/cashier/local': <PointOfSale basePath="/cashier" />,
              '/cashier/assisted': <PointOfSale basePath="/cashier" />,
              '/cashier/online': <PointOfSale basePath="/cashier" />,
              '/cashier/sales': <CashierSales />,
              '/cashier/register': <CashRegisterControl />,
              '/cashier/profile': <StaffProfile />,
            }}
          />
        </CashierLayout>
      </StaffGate>
    );
  }

  if (pathname.startsWith('/delivery')) {
    return (
      <StaffGate role="delivery_driver">
        <DeliveryDriverLayout>
          <RouteSwitch
            fallback="/delivery"
            routes={{
              '/delivery': <DeliveryHome />,
              '/delivery/orders': <DeliveryOrders />,
              '/delivery/route': <DeliveryRoute />,
              '/delivery/history': <DeliveryHistory />,
              '/delivery/profile': <StaffProfile />,
            }}
          />
        </DeliveryDriverLayout>
      </StaffGate>
    );
  }

  return (
    <MobileLayout>
      <RouteSwitch
        routes={{
          '/': <Catalog />,
          '/cart': <MyCart />,
          '/orders': <ProtectedRoute><MyOrders /></ProtectedRoute>,
          '/store-credit': <ProtectedRoute><MyStoreCredit /></ProtectedRoute>,
          '/profile': <ProtectedRoute><Profile /></ProtectedRoute>,
          '/profile/edit': <ProtectedRoute><EditProfile /></ProtectedRoute>,
        }}
      />
    </MobileLayout>
  );
};

function AppRoot() {
  const [mounted, setMounted] = React.useState(false);

  useEffect(() => {
    // Defense in depth: Nginx performs this redirect before serving the SPA.
    // This fallback also protects static/CDN deployments that bypass that Nginx configuration.
    if (isTenantRootHost()) {
      const redirectUrl = getPlatformRedirectUrl();
      if (redirectUrl) {
        window.location.replace(redirectUrl);
        return;
      }
    }
    setMounted(true);
  }, []);

  return (
    <NavigationProvider>
      {mounted ? <AppContent /> : <InitialAppScreen />}
    </NavigationProvider>
  );
}

export default AppRoot;
