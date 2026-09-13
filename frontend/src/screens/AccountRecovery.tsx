import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@/lib/navigation';
import { api } from '@/lib/api';
import PinInput from '@/components/PinInput';
import CodeInput from '@/components/CodeInput';
import { useAccessPolicy } from '@/lib/accessPolicy';
import { clearRecoveryContext, maskRecoveryWhatsapp, readRecoveryContext } from '@/lib/recoveryContext';
import { clearRecoveryGrant, readRecoveryGrant, saveRecoveryGrant } from '@/lib/recoveryGrant';
import * as FiIcons from 'react-icons/fi';

const { FiAlertTriangle, FiArrowLeft, FiCheckCircle, FiLink, FiLoader, FiMessageCircle, FiShield } = FiIcons;

const onlyDigits = (value = '') => String(value || '').replace(/\D/g, '');

type RecoveryStep = 'request' | 'verify' | 'link-sent' | 'validating-link' | 'invalid-link' | 'reset' | 'complete';

type MagicRecoveryLink = {
  challengeId: string;
  linkToken: string;
  scope: 'central' | 'tenant';
  destination: 'admin' | 'store';
};

const readMagicRecoveryLink = (): MagicRecoveryLink | null => {
  if (typeof window === 'undefined') return null;
  const hash = String(window.location.hash || '');
  const queryIndex = hash.indexOf('?');
  if (queryIndex < 0) return null;
  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  if (params.get('mode') !== 'link') return null;
  const challengeId = String(params.get('challenge_id') || '').trim();
  const linkToken = String(params.get('link_token') || '').trim();
  if (!challengeId || !linkToken) return null;
  return {
    challengeId,
    linkToken,
    scope: params.get('scope') === 'central' ? 'central' : 'tenant',
    destination: params.get('destination') === 'store' ? 'store' : 'admin',
  };
};

const AccountRecovery = () => {
  const navigate = useNavigate();
  const policy = useAccessPolicy();
  const recoveryContext = useMemo(() => readRecoveryContext(), []);
  const magicLink = useMemo(() => readMagicRecoveryLink(), []);
  const recoveryGrant = useMemo(() => readRecoveryGrant(), []);
  const [challengeId, setChallengeId] = useState(recoveryGrant?.challengeId || '');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState(recoveryGrant?.resetToken || '');
  const [newPin, setNewPin] = useState('');
  const [step, setStep] = useState<RecoveryStep>(magicLink ? 'validating-link' : recoveryGrant ? 'reset' : 'request');
  const [message, setMessage] = useState(recoveryGrant ? 'Recuperación verificada. Define tu nuevo PIN.' : '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(magicLink));

  const isCustomerRecovery = magicLink
    ? magicLink.destination === 'store'
    : recoveryGrant
      ? recoveryGrant.destination === 'store'
      : recoveryContext?.subjectType === 'customer';
  const recoveryPinLength = isCustomerRecovery ? policy.customerPinLength : policy.adminPinLength;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  const recoveryBase = magicLink
    ? (magicLink.scope === 'central' ? '/central-account-recovery' : '/account-recovery')
    : recoveryGrant
      ? (recoveryGrant.scope === 'central' ? '/central-account-recovery' : '/account-recovery')
      : (recoveryContext?.subjectType === 'platform' || recoveryContext?.subjectType === 'owner'
        ? '/central-account-recovery'
        : '/account-recovery');

  useEffect(() => {
    if (!magicLink) return;
    let alive = true;
    const verifyMagicLink = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.post(`${recoveryBase}/verify`, {
          challenge_id: magicLink.challengeId,
          link_token: magicLink.linkToken,
        });
        if (!alive) return;
        const verifiedResetToken = String(response?.reset_token || '').trim();
        setChallengeId(magicLink.challengeId);
        setResetToken(verifiedResetToken);
        saveRecoveryGrant({
          challengeId: magicLink.challengeId,
          resetToken: verifiedResetToken,
          scope: magicLink.scope,
          destination: magicLink.destination,
          expiresInSeconds: Number(response?.expires_in_seconds || policy.recoveryTtlMinutes * 60),
        });
        setMessage('Enlace verificado correctamente. Define tu nuevo PIN.');
        setStep('reset');
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/recover-account`);
        }
      } catch (verifyError: any) {
        if (!alive) return;
        setError(verifyError?.message || 'El enlace de recuperación no es válido, ya fue utilizado o venció.');
        setStep('invalid-link');
      } finally {
        if (alive) setLoading(false);
      }
    };
    verifyMagicLink();
    return () => {
      alive = false;
    };
  }, [magicLink, recoveryBase, policy.recoveryTtlMinutes]);

  const goBackToAccess = () => {
    clearRecoveryContext();
    clearRecoveryGrant();
    if (magicLink) {
      navigate(magicLink.destination === 'store' ? '/' : '/admin', { replace: true });
      return;
    }
    navigate(-1);
  };

  const requestRecovery = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!recoveryContext) {
      setError('Vuelve al formulario de acceso e introduce primero tu WhatsApp.');
      return;
    }
    if (!policy.recoveryEnabled) {
      setError('La recuperación de acceso por WhatsApp está deshabilitada temporalmente.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await api.post(`${recoveryBase}/request`, {
        subject_type: recoveryContext.subjectType,
        whatsapp: recoveryContext.whatsapp,
      });
      const method = response?.method === 'link' ? 'link' : 'otp';
      setMessage(response?.message || (method === 'link'
        ? 'Enviamos un enlace seguro de recuperación a tu WhatsApp.'
        : 'Enviamos un código de recuperación a tu WhatsApp.'));
      if (method === 'link') {
        setChallengeId(response?.challenge_id || '');
        setStep('link-sent');
      } else if (response?.challenge_id) {
        setChallengeId(response.challenge_id);
        setStep('verify');
      }
    } catch (requestError: any) {
      setError(requestError?.message || 'No se pudo iniciar la recuperación por WhatsApp.');
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (onlyDigits(code).length !== policy.recoveryCodeLength) {
      setError(`Escribe el código de ${policy.recoveryCodeLength} dígitos recibido por WhatsApp.`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await api.post(`${recoveryBase}/verify`, {
        challenge_id: challengeId,
        code: onlyDigits(code),
      });
      const verifiedResetToken = String(response?.reset_token || '').trim();
      const scope = recoveryBase === '/central-account-recovery' ? 'central' : 'tenant';
      const recoveryDestination = recoveryContext?.subjectType === 'customer' ? 'store' : 'admin';
      setResetToken(verifiedResetToken);
      saveRecoveryGrant({
        challengeId,
        resetToken: verifiedResetToken,
        scope,
        destination: recoveryDestination,
        expiresInSeconds: Number(response?.expires_in_seconds || policy.recoveryTtlMinutes * 60),
      });
      setMessage('Código verificado correctamente. Define tu nuevo PIN.');
      setStep('reset');
    } catch (verifyError: any) {
      setError(verifyError?.message || 'El código no es válido o ya venció.');
    } finally {
      setLoading(false);
    }
  };

  const resetPin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPin.length !== recoveryPinLength || !new RegExp(`^\\d{${recoveryPinLength}}$`).test(newPin)) {
      setError(`El nuevo PIN debe tener exactamente ${recoveryPinLength} dígitos.`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await api.post(`${recoveryBase}/reset`, {
        reset_token: resetToken,
        new_pin: newPin,
      });
      setMessage(response?.message || 'Tu PIN fue actualizado correctamente.');
      setStep('complete');
      clearRecoveryContext();
      clearRecoveryGrant();
    } catch (resetError: any) {
      const resetMessage = resetError?.message || 'No se pudo actualizar el PIN.';
      if (/expir|autorizaci|token/i.test(resetMessage)) {
        clearRecoveryGrant();
      }
      setError(resetMessage);
    } finally {
      setLoading(false);
    }
  };

  const restart = () => {
    clearRecoveryGrant();
    setChallengeId('');
    setCode('');
    setResetToken('');
    setNewPin('');
    setError('');
    setMessage('');
    setStep('request');
  };

  const configuredForLink = policy.recoveryMethod === 'link';
  const destination = magicLink
    ? (magicLink.destination === 'store' ? '/' : '/admin')
    : recoveryGrant
      ? (recoveryGrant.destination === 'store' ? '/' : '/admin')
      : (recoveryContext?.subjectType === 'customer' ? '/' : '/admin');

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-hidden overscroll-none bg-[#0f1a28] p-4 sm:p-5">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="bg-gradient-to-br from-[#00a884] to-[#006b56] p-6 text-white">
          <button type="button" onClick={goBackToAccess} className="inline-flex items-center gap-2 text-xs font-black text-white/80 hover:text-white">
            <FiArrowLeft /> Volver
          </button>
          <div className="mt-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-2xl"><FiShield /></div>
            <div>
              <h1 className="text-2xl font-black">Recuperar acceso</h1>
              <p className="text-sm text-white/75 mt-1">
                {magicLink || configuredForLink
                  ? `Recibe un enlace seguro por WhatsApp y define un nuevo PIN de ${recoveryPinLength} dígitos.`
                  : `Recibe un código por WhatsApp y define un nuevo PIN de ${recoveryPinLength} dígitos.`}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8">
          {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
          {message && step !== 'complete' && step !== 'reset' && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div>}

          {step === 'request' && (
            <form onSubmit={requestRecovery} className="space-y-5">
              {recoveryContext ? (
                <div className="rounded-2xl border border-[#00a884]/20 bg-[#f0fdf8] px-4 py-3 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#00a884]"><FiMessageCircle /></div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#008f72]">WhatsApp verificado</p>
                    <p className="mt-0.5 text-sm font-black text-gray-900">{maskRecoveryWhatsapp(recoveryContext.whatsapp)}</p>
                  </div>
                  {recoveryContext.accountLabel ? <span className="ml-auto rounded-full bg-white px-3 py-1 text-[9px] font-black uppercase tracking-wider text-[#008f72]">{recoveryContext.accountLabel}</span> : null}
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                  Para recuperar el acceso, vuelve al formulario de inicio, introduce tu WhatsApp y pulsa “¿Olvidaste tu PIN?”.
                </div>
              )}
              <button disabled={loading || !recoveryContext || !policy.recoveryEnabled} className="w-full rounded-xl bg-[#00a884] py-3.5 text-sm font-black text-white shadow-md shadow-[#00a884]/20 disabled:opacity-60">
                {loading
                  ? <span className="inline-flex items-center gap-2"><FiLoader className="animate-spin" /> {configuredForLink ? 'Enviando enlace…' : 'Enviando código…'}</span>
                  : (configuredForLink ? 'Enviar enlace por WhatsApp' : 'Enviar código por WhatsApp')}
              </button>
            </form>
          )}

          {step === 'verify' && (
            <form onSubmit={verifyCode} className="space-y-5">
              <CodeInput value={code} onChange={setCode} length={policy.recoveryCodeLength} label="Código de verificación" />
              <p className="text-xs text-gray-500">El código vence en {policy.recoveryTtlMinutes} minutos y solo puede utilizarse una vez.</p>
              <button disabled={loading || code.length !== policy.recoveryCodeLength} className="w-full rounded-xl bg-[#00a884] py-3.5 text-sm font-black text-white disabled:opacity-60">
                {loading ? <span className="inline-flex items-center gap-2"><FiLoader className="animate-spin" /> Verificando…</span> : 'Verificar código'}
              </button>
              <button type="button" onClick={restart} className="w-full text-xs font-bold text-gray-500 hover:text-[#00a884]">Solicitar otro código</button>
            </form>
          )}

          {step === 'link-sent' && (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-3xl text-emerald-600"><FiLink /></div>
              <div>
                <h2 className="text-lg font-black text-gray-900">Revisa tu WhatsApp</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">Pulsa el botón del mensaje de WAMERCIO. El enlace abrirá esta pantalla y validará automáticamente la recuperación.</p>
              </div>
              <div className="rounded-2xl border border-[#00a884]/15 bg-[#f0fbf8] px-4 py-3 text-left text-xs leading-relaxed text-[#007c65]">
                El enlace vence en {policy.recoveryTtlMinutes} minutos y solo puede utilizarse una vez. No lo compartas con nadie.
              </div>
              <button type="button" onClick={restart} className="w-full rounded-xl border border-gray-200 bg-white py-3 text-xs font-black text-gray-600 hover:border-[#00a884] hover:text-[#008f72]">Enviar otro enlace</button>
            </div>
          )}

          {step === 'validating-link' && (
            <div className="py-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600"><FiLoader className="animate-spin" /></div>
              <h2 className="mt-4 text-lg font-black text-gray-900">Validando enlace seguro</h2>
              <p className="mt-2 text-sm text-gray-500">Estamos verificando que el enlace pertenezca a tu solicitud y siga vigente.</p>
            </div>
          )}

          {step === 'invalid-link' && (
            <div className="py-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-3xl text-red-500"><FiAlertTriangle /></div>
              <h2 className="mt-4 text-lg font-black text-gray-900">Enlace no disponible</h2>
              <p className="mt-2 text-sm text-gray-500">Solicita un nuevo enlace desde el formulario de acceso. Los enlaces utilizados o vencidos no pueden reutilizarse.</p>
              <button type="button" onClick={() => navigate(destination, { replace: true })} className="mt-6 w-full rounded-xl bg-[#00a884] py-3.5 text-sm font-black text-white">Volver al acceso</button>
            </div>
          )}

          {step === 'reset' && (
            <form onSubmit={resetPin} className="space-y-5">
              {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div>}
              <PinInput value={newPin} onChange={setNewPin} length={recoveryPinLength} label={`Nuevo PIN de ${recoveryPinLength} dígitos`} autoComplete="new-password" />
              <p className="text-xs text-gray-500">El nuevo PIN se guardará al completar los {recoveryPinLength} dígitos. No es necesario repetirlo.</p>
              <button disabled={loading || newPin.length !== recoveryPinLength} className="w-full rounded-xl bg-[#00a884] py-3.5 text-sm font-black text-white disabled:opacity-60">
                {loading ? <span className="inline-flex items-center gap-2"><FiLoader className="animate-spin" /> Actualizando…</span> : 'Actualizar PIN'}
              </button>
            </form>
          )}

          {step === 'complete' && (
            <div className="text-center py-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-3xl"><FiCheckCircle /></div>
              <h2 className="mt-4 text-xl font-black text-gray-900">Acceso recuperado</h2>
              <p className="mt-2 text-sm text-gray-500">{message}</p>
              <button type="button" onClick={() => navigate(destination, { replace: true })} className="mt-6 w-full rounded-xl bg-[#00a884] py-3.5 text-sm font-black text-white">Volver a iniciar sesión</button>
            </div>
          )}

          <div className="mt-7 border-t border-gray-100 pt-5 text-center text-[11px] leading-relaxed text-gray-400">
            Nunca compartas el código, el enlace de recuperación ni tu PIN. WAMERCIO no solicita claves por llamadas o mensajes externos.
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountRecovery;
