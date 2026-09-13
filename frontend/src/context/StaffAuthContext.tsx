import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';

const StaffAuthContext = createContext<any>(null);
export const useStaffAuth = () => useContext(StaffAuthContext);

export const StaffAuthProvider = ({ children }) => {
  const [staffUser, setStaffUser] = useState(null);
  const [staffRole, setStaffRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');

  const syncLocal = useCallback((token, user, tenant = null) => {
    if (typeof window === 'undefined') return;
    if (token) api.setStaffToken(token);
    if (user) {
      api.setStaffUser(JSON.stringify(user));
      api.setStaffRole(user.role || '');
    }
    if (tenant) {
      api.setAdminTenant(tenant);
    }
  }, []);

  const startSession = useCallback((token, user, role = '', tenant = null) => {
    const resolvedRole = role || user?.role || '';
    const resolvedUser = user ? { ...user, role: resolvedRole } : null;
    syncLocal(token, resolvedUser, tenant);
    setStaffUser(resolvedUser);
    setStaffRole(resolvedRole);
    setChecked(true);
    return resolvedUser;
  }, [syncLocal]);

  const clear = useCallback(() => {
    api.clearStaffSession();
    setStaffUser(null);
    setStaffRole('');
  }, []);

  const refreshSession = useCallback(async () => {
    if (typeof window === 'undefined') return null;
    const token = api.getStaffToken();
    if (!token) {
      setChecked(true);
      return null;
    }
    setLoading(true);
    try {
      const response = await api.get('/staff/session');
      setStaffUser(response.user);
      setStaffRole(response.role || response.user?.role || '');
      syncLocal(null, response.user);
      return response.user;
    } catch (_) {
      clear();
      return null;
    } finally {
      setLoading(false);
      setChecked(true);
    }
  }, [clear, syncLocal]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = useCallback(async (role, whatsapp, pin) => {
    setLoading(true);
    setError('');
    try {
      const payload = role ? { role, whatsapp, pin } : { whatsapp, pin };
      const response = await api.post('/staff/login', payload);
      const resolvedRole = response.role || response.user?.role || role || '';
      const resolvedUser = response.user ? { ...response.user, role: resolvedRole } : response.user;
      const tenant = response.tenant || response.tenant_slug || response.tenant_id || '';
      return startSession(response.token, resolvedUser, resolvedRole, tenant);
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión');
      return null;
    } finally {
      setLoading(false);
      setChecked(true);
    }
  }, [startSession]);

  const logout = () => {
    clear();
    setChecked(true);
  };

  return (
    <StaffAuthContext.Provider value={{
      staffUser,
      staffRole,
      loading,
      checked,
      error,
      setError,
      login,
      logout,
      refreshSession,
      startSession,
    }}>
      {children}
    </StaffAuthContext.Provider>
  );
};
