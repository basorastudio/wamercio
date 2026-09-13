import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import PhoneInput from '@/components/PhoneInput';
import PinInput from '@/components/PinInput';
import { useNavigate } from '@/lib/navigation';
import { useStaffAuth } from '@/context/StaffAuthContext';
import { sanitizePin } from '@/lib/pin';
import { isAcceptedAdminAccessPinLength, adminLoginAttemptDelay, useAccessPolicy } from '@/lib/accessPolicy';
import { saveRecoveryContext } from '@/lib/recoveryContext';

const onlyDigits = (value = '') => String(value || '').replace(/\D/g, '');
const normalizeWhatsapp = (value = '') => {
  let digits = onlyDigits(value).slice(0, 15);
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits;
};

const phonePayloadToDigits = (payload: any) => {
  if (!payload) return '';
  if (typeof payload === 'string') return normalizeWhatsapp(payload);
  return normalizeWhatsapp(payload.nationalNumber || payload.whatsapp || payload.whatsappDisplay || '');
};

const formatWhatsappLabel = (value = '') => {
  const digits = normalizeWhatsapp(value);
  if (!digits) return '—';
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
};

const AdminLogin = ({ onSuccess, onBack }) => {
  const navigate = useNavigate();
  const { login: loginStaff, startSession: startStaffSession } = useStaffAuth();
  const accessPolicy = useAccessPolicy();
  const [whatsapp, setWhatsapp] = useState(() => normalizeWhatsapp(typeof window !== 'undefined' ? api.getAdminUser() : ''));
  const [verifiedWhatsapp, setVerifiedWhatsapp] = useState('');
  const [pin, setPin] = useState('');
  const [step, setStep] = useState<'whatsapp' | 'pin'>('whatsapp');
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accessInfo, setAccessInfo] = useState<any>(null);
  const lastLookupRef = useRef('');
  const lastLoginPinRef = useRef('');

  const lookupWhatsapp = async (rawWhatsapp = whatsapp, silent = false) => {
    const loginWhatsapp = normalizeWhatsapp(rawWhatsapp);
    if (loginWhatsapp.length !== 10) {
      if (!silent) setError('Ingresa un WhatsApp válido de 10 dígitos');
      return false;
    }
    setChecking(true);
    if (!silent) setError('');
    try {
      const response = await api.post('/admin/lookup', { whatsapp: loginWhatsapp });
      if (!response?.exists) {
        throw new Error('Este WhatsApp no tiene acceso asignado en ningún negocio');
      }
      setAccessInfo(response);
      const tenantRef = response?.tenant || response?.tenant_slug || response?.tenant_id;
      if (tenantRef) api.setAdminTenant(tenantRef);
      setVerifiedWhatsapp(loginWhatsapp);
      setStep('pin');
      setPin('');
      setError('');
      return true;
    } catch (err) {
      setVerifiedWhatsapp('');
      setAccessInfo(null);
      setStep('whatsapp');
      setError(err.message || 'No se pudo verificar este WhatsApp');
      return false;
    } finally {
      setChecking(false);
    }
  };

  const loginWithPin = async (rawPin = pin) => {
    const loginWhatsapp = normalizeWhatsapp(verifiedWhatsapp || whatsapp);
    const loginPin = sanitizePin(rawPin, accessPolicy.maxAdminPinLength);
    if (!loginWhatsapp || !isAcceptedAdminAccessPinLength(loginPin.length, accessPolicy)) return false;
    setLoading(true);
    setError('');
    try {
      const role = String(accessInfo?.role || '').toLowerCase().trim();
      const isOperationalStaff = role === 'cashier' || role === 'delivery_driver';

      if (isOperationalStaff) {
        const tenantRef = accessInfo?.tenant_slug || accessInfo?.tenant?.slug || accessInfo?.tenant_id || accessInfo?.tenant?.id || '';
        api.clearAdminSession();
        if (tenantRef) api.setAdminTenant(accessInfo?.tenant || tenantRef);

        let staff = await loginStaff(role, loginWhatsapp, loginPin);
        let resolvedRole = staff?.role || role;

        if (!staff) {
          const response = await api.post('/admin/staff-login', {
            role,
            whatsapp: loginWhatsapp,
            pin: loginPin,
            tenant_id: accessInfo?.tenant_id || accessInfo?.tenant?.id || '',
            tenant: accessInfo?.tenant_slug || accessInfo?.tenant?.slug || tenantRef,
          });
          resolvedRole = response.role || response.user?.role || role;
          const resolvedUser = response.user ? { ...response.user, role: resolvedRole } : response.user;
          staff = startStaffSession(
            response.token,
            resolvedUser,
            resolvedRole,
            response.tenant || response.tenant_slug || response.tenant_id || accessInfo?.tenant || tenantRef,
          );
        }

        if (!staff) {
          throw new Error('No se pudo iniciar sesión con este rol. Verifica el PIN e intenta nuevamente.');
        }

        navigate(resolvedRole === 'delivery_driver' ? '/delivery' : '/cashier', { replace: true });
        return true;
      }

      const response = await api.post('/admin/login', { username: loginWhatsapp, password: loginPin, whatsapp: loginWhatsapp, pin: loginPin });
      if (response?.scope === 'platform') {
        api.clearAdminSession();
        api.setPlatformToken(response.token);
        api.setPlatformUser(response.user?.username || response.user?.whatsapp || loginWhatsapp);
        navigate(response.panel_path || '/superadmin', { replace: true });
        return true;
      }
      api.setAdminToken(response.token);
      api.setAdminUser(loginWhatsapp);
      onSuccess?.(response.user || loginWhatsapp);
      return true;
    } catch (err) {
      if (isAcceptedAdminAccessPinLength(loginPin.length, accessPolicy)) setPin('');
      lastLoginPinRef.current = '';
      setError(err.message || 'PIN incorrecto. Verifica e intenta nuevamente.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step !== 'whatsapp') return undefined;
    const loginWhatsapp = normalizeWhatsapp(whatsapp);
    if (loginWhatsapp.length < 10) {
      setError('');
      lastLookupRef.current = '';
      return undefined;
    }
    if (loginWhatsapp.length !== 10 || lastLookupRef.current === loginWhatsapp) return undefined;
    const timer = window.setTimeout(() => {
      lastLookupRef.current = loginWhatsapp;
      lookupWhatsapp(loginWhatsapp, true);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [whatsapp, step]);

  useEffect(() => {
    const loginPin = sanitizePin(pin, accessPolicy.maxAdminPinLength);
    const isAcceptedPin = isAcceptedAdminAccessPinLength(loginPin.length, accessPolicy);
    if (step !== 'pin' || !isAcceptedPin || loading) return undefined;
    if (lastLoginPinRef.current === loginPin) return undefined;
    const timer = window.setTimeout(() => {
      lastLoginPinRef.current = loginPin;
      loginWithPin(loginPin);
    }, adminLoginAttemptDelay(loginPin.length, accessPolicy));
    return () => window.clearTimeout(timer);
  }, [pin, step, loading, accessPolicy]);

  const submit = async (event) => {
    event.preventDefault();
    if (step === 'whatsapp') {
      lastLookupRef.current = '';
      await lookupWhatsapp(whatsapp, false);
      return;
    }
    await loginWithPin(pin);
  };

  const changeWhatsapp = () => {
    setStep('whatsapp');
    setVerifiedWhatsapp('');
    setAccessInfo(null);
    setPin('');
    setError('');
    lastLookupRef.current = '';
    lastLoginPinRef.current = '';
  };

  return (
    <div className="min-h-[100dvh] bg-[#0f1a28] flex">
      <div className="hidden lg:flex flex-col justify-between w-[42%] bg-gradient-to-br from-[#00a884] via-[#007a60] to-[#004d3d] p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-80 h-80 bg-white rounded-full translate-x-1/3 translate-y-1/3" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-12">
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/30 overflow-hidden p-0.5"><img src="/brand/colmapro-app-icon.png" alt="WAMERCIO" className="w-full h-full object-cover" /></div>
            <div>
              <h1 className="text-white font-black text-2xl leading-none">WAMERCIO</h1>
              <p className="text-white/60 text-sm font-medium">Panel protegido</p>
            </div>
          </div>
          <div className="space-y-6">
            <h2 className="text-white font-black text-4xl leading-tight">Acceso de administración</h2>
            <p className="text-white/70 text-base leading-relaxed">
              Ingresa tu WhatsApp. Si pertenece a un usuario SaaS, propietario, administrador, cajero o repartidor, te pediremos el PIN de {accessPolicy.adminPinLength} dígitos.
            </p>
          </div>
        </div>
        <div className="relative z-10 space-y-3 text-white/80 text-sm">
          <div>🔐 Sesión segura del sistema</div>
          <div>🧾 Credenciales creadas por propietario</div>
          <div>☁️ Compatible con dominio en Cloudflare Flexible</div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-16">
        <form onSubmit={submit} autoComplete="off" className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-7 lg:p-9">
          <div className="mb-7">
            <button type="button" onClick={onBack} className="text-xs font-black text-[#00a884] mb-5 hover:underline">
              ← Volver a la aplicación
            </button>
            <div className="w-14 h-14 rounded-2xl bg-[#00a884]/10 flex items-center justify-center text-3xl mb-4">🖥️</div>
            <h1 className="text-2xl font-black text-gray-900">Panel administrativo</h1>
            <p className="text-sm text-gray-500 mt-1">
              {step === 'pin'
                ? 'WhatsApp verificado. Ingresa tu PIN para entrar automáticamente.'
                : 'Ingresa tu WhatsApp para verificar tu acceso al panel correspondiente.'}
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          {step === 'whatsapp' && (
            <label className="block mb-6">
              <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">WhatsApp</span>
              <PhoneInput
                value={whatsapp}
                onChange={(phone) => setWhatsapp(phonePayloadToDigits(phone))}
                placeholder="809 302 4075"
                name="colmapro_admin_whatsapp"
                autoComplete="off"
                required
              />
              {checking && <p className="text-[11px] text-[#008f72] font-bold mt-2">Verificando WhatsApp...</p>}
            </label>
          )}

          {step === 'pin' && (
            <div className="space-y-4 mb-6">
              <div className="rounded-2xl border border-[#00a884]/20 bg-[#f0fdf8] px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black text-[#008f72] uppercase tracking-widest">WhatsApp verificado</p>
                  <p className="text-sm font-black text-gray-900 mt-1">{formatWhatsappLabel(verifiedWhatsapp)}</p>
                </div>
                <span className="text-[10px] font-black text-[#008f72] bg-white rounded-full px-3 py-1">{String(accessInfo?.account_type || accessInfo?.role || 'ADMIN').toUpperCase()}</span>
              </div>
              <button type="button" onClick={changeWhatsapp} className="text-xs font-bold text-gray-500 hover:text-[#00a884]">← Cambiar WhatsApp</button>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
                <PinInput value={pin} onChange={(value) => setPin(value)} length={accessPolicy.adminPinLength} inputMaxLength={accessPolicy.maxAdminPinLength} label={`Tu PIN de ${accessPolicy.adminPinLength} dígitos *`} />
              </div>
              {accessPolicy.recoveryEnabled && (
                <button type="button" onClick={() => {
                  const role = String(accessInfo?.role || '').toLowerCase();
                  const scope = String(accessInfo?.scope || '').toLowerCase();
                  const subjectType = scope === 'platform'
                    ? 'platform'
                    : scope === 'owner'
                      ? 'owner'
                      : role === 'cashier' || role === 'delivery_driver'
                        ? 'staff'
                        : 'administrator';
                  saveRecoveryContext({ whatsapp: verifiedWhatsapp || whatsapp, subjectType, accountLabel: String(accessInfo?.account_type || role || 'Administrador') });
                  navigate('/recover-account');
                }} className="w-full text-center text-xs font-black text-[#00a884] hover:underline">¿Olvidaste tu PIN?</button>
              )}
            </div>
          )}

          {step === 'pin' && loading && (
            <div className="rounded-2xl border border-[#00a884]/15 bg-[#f0fdf8] px-4 py-3 text-center text-sm font-black text-[#008f72]">
              Validando PIN y entrando al panel...
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-gray-400 mt-5 text-center">
            {step === 'pin'
              ? 'Al completar el PIN correcto, entrarás automáticamente al panel.'
              : 'Escribe tu WhatsApp. Si tiene acceso asignado, pasaremos al PIN automáticamente.'}
          </p>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;
