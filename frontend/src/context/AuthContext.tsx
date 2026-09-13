import React, { createContext, useCallback, useEffect, useState, useContext, useRef } from 'react';
import { api } from '../lib/api';
import { nowISO } from '../lib/timezone';
import { DEFAULT_RUNTIME_CONFIG, loadRuntimeConfig } from '../lib/runtimeConfig';

const AuthContext = createContext<any>(null);
export const useAuth = () => useContext(AuthContext);

const notifyDataChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wamercio:data-changed'));
  }
};

const createIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  // Keep the server render and the first browser render deterministic.
  // The session is read from browser storage in loadSession() after mount.
  const [loading, setLoading] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [error, setError] = useState('');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [runtimeConfig, setRuntimeConfig] = useState(DEFAULT_RUNTIME_CONFIG);
  const userRef = useRef(null);
  const pendingOrderRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const openAuthModal = useCallback(() => {
    if (typeof window !== 'undefined' && api.getClientToken() && !sessionChecked) return;
    setIsAuthModalOpen(true);
  }, [sessionChecked]);
  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
    setError('');
  }, []);

  const loadSession = useCallback(async () => {
    if (typeof window === 'undefined') {
      setSessionChecked(true);
      return null;
    }
    const token = api.getClientToken();
    if (!token) {
      setUser(null);
      setClients([]);
      setSessionChecked(true);
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      const response = await api.get('/client/session');
      setUser(response.client);
      setClients(response.client ? [response.client] : []);
      setSessionChecked(true);
      setIsAuthModalOpen(false);
      notifyDataChanged();
      return response.client;
    } catch (_) {
      api.clearClientSession();
      setUser(null);
      setClients([]);
      return null;
    } finally {
      setSessionChecked(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
    loadRuntimeConfig().then(setRuntimeConfig).catch(() => undefined);
  }, [loadSession]);

  const refreshProfile = useCallback(async () => {
    if (typeof window !== 'undefined' && !api.getClientToken()) {
      setUser(null);
      setClients([]);
      setSessionChecked(true);
      return null;
    }
    try {
      const response = await api.get('/client/session');
      setUser(response.client);
      setClients(response.client ? [response.client] : []);
      setSessionChecked(true);
      return response.client;
    } catch (err) {
      api.clearClientSession();
      setUser(null);
      setClients([]);
      setSessionChecked(true);
      return null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let timer: number | null = null;
    const refreshIfAuthenticated = () => {
      if (api.getClientToken() && userRef.current) {
        refreshProfile();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshIfAuthenticated();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'wamercio:data-changed:broadcast') refreshIfAuthenticated();
    };

    timer = window.setInterval(refreshIfAuthenticated, Math.max(8_000, Math.min(runtimeConfig.clientSessionRefreshMs, 15_000)));
    window.addEventListener('focus', refreshIfAuthenticated);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('wamercio:data-changed', refreshIfAuthenticated as EventListener);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (timer) window.clearInterval(timer);
      window.removeEventListener('focus', refreshIfAuthenticated);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('wamercio:data-changed', refreshIfAuthenticated as EventListener);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshProfile, runtimeConfig.clientSessionRefreshMs]);

  useEffect(() => {
    if (typeof window === 'undefined' || !runtimeConfig.enableRealtimeEvents || !api.getClientToken() || !user?.id) return undefined;

    const source = new EventSource(api.eventUrl('/events'));
    const refreshOrders = () => {
      if (api.getClientToken()) refreshProfile();
    };
    const notifyTrackingChanged = () => {
      window.dispatchEvent(new CustomEvent('wamercio:delivery-tracking-updated'));
    };

    const realtimeEvents = [
      'order_created',
      'order_status_changed',
      'order_updated',
      'cart_updated',
      'delivery_assigned',
      'delivery_accepted',
      'delivery_cancelled',
      'delivery_incident_reported',
      'delivery_incident_resolved',
      'delivery_partial_completed',
      'sale_voided',
      'sale_returned',
    ];
    realtimeEvents.forEach((eventName) => {
      source.addEventListener(eventName, refreshOrders);
    });
    source.addEventListener('delivery_tracking_updated', notifyTrackingChanged);

    return () => {
      realtimeEvents.forEach((eventName) => {
        source.removeEventListener(eventName, refreshOrders);
      });
      source.removeEventListener('delivery_tracking_updated', notifyTrackingChanged);
      source.close();
    };
  }, [refreshProfile, runtimeConfig.enableRealtimeEvents, user?.id]);

  const login = async (whatsapp, pin) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/client/login', { whatsapp, pin });
      if (typeof window !== 'undefined') api.setClientToken(response.token);
      setUser(response.client);
      setClients(response.client ? [response.client] : []);
      setSessionChecked(true);
      setIsAuthModalOpen(false);
      notifyDataChanged();
      return response.client;
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const register = async (data) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/client/register', data);
      if (typeof window !== 'undefined') api.setClientToken(response.token);
      setUser(response.client);
      setClients(response.client ? [response.client] : []);
      setSessionChecked(true);
      setIsAuthModalOpen(false);
      notifyDataChanged();
      return response.client;
    } catch (err) {
      setError(err.message || 'No se pudo crear la cuenta');
      return null;
    } finally {
      setLoading(false);
    }
  };



  const updateUser = async (data) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.patch('/client/profile', data);
      setUser(response.client);
      setClients(response.client ? [response.client] : []);
      notifyDataChanged();
      return response.client;
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el perfil');
      setUser(prev => prev ? ({ ...prev, ...data }) : prev);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const addOrder = async (order) => {
    setLoading(true);
    setError('');
    const payload = {
      ...order,
      date: order.date || nowISO(),
    };
    const fingerprint = JSON.stringify(order || {});
    const idempotencyKey = pendingOrderRef.current?.fingerprint === fingerprint
      ? pendingOrderRef.current.key
      : createIdempotencyKey();
    pendingOrderRef.current = { fingerprint, key: idempotencyKey };
    try {
      const response = await api.post('/client/orders', payload, {
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      if (response.profile) {
        setUser(response.profile);
        setClients(response.profile ? [response.profile] : []);
      } else {
        await refreshProfile();
      }
      notifyDataChanged();
      if (pendingOrderRef.current?.key === idempotencyKey) pendingOrderRef.current = null;
      return response.order;
    } catch (err) {
      setError(err.message || 'No se pudo registrar el pedido');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const confirmPickup = useCallback(async (orderId: string) => {
    const id = String(orderId || '').trim();
    if (!id) throw new Error('Pedido no válido');
    setError('');
    try {
      const response = await api.post(`/client/orders/${encodeURIComponent(id)}/pickup`, {});
      await refreshProfile();
      notifyDataChanged();
      return response?.order || null;
    } catch (err: any) {
      const message = err?.message || 'No se pudo confirmar la recogida';
      setError(message);
      throw err;
    }
  }, [refreshProfile]);

  const toggleClientCredit = () => {
    setError('La configuración de crédito se administra desde el panel de Fiados.');
  };

  const logout = () => {
    api.clearClientSession();
    setUser(null);
    setClients([]);
    setSessionChecked(true);
    setIsAuthModalOpen(false);
    notifyDataChanged();
  };

  return (
    <AuthContext.Provider value={{
      user,
      clients,
      loading,
      sessionChecked,
      error,
      login,
      register,
      logout,
      setError,
      updateUser,
      addOrder,
      confirmPickup,
      refreshProfile,
      isAuthModalOpen,
      openAuthModal,
      closeAuthModal,
      toggleClientCredit,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
