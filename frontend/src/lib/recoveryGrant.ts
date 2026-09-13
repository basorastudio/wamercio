export type RecoveryGrantScope = 'central' | 'tenant';
export type RecoveryGrantDestination = 'admin' | 'store';

export type RecoveryGrant = {
  challengeId: string;
  resetToken: string;
  scope: RecoveryGrantScope;
  destination: RecoveryGrantDestination;
  expiresAt: number;
};

const STORAGE_KEY = 'colmapro:account-recovery-grant';
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 60 * 60;

const clean = (value: unknown) => String(value ?? '').trim();

export const saveRecoveryGrant = ({
  challengeId,
  resetToken,
  scope,
  destination,
  expiresInSeconds,
}: Omit<RecoveryGrant, 'expiresAt'> & { expiresInSeconds?: number }) => {
  if (typeof window === 'undefined') return;
  const challenge = clean(challengeId);
  const token = clean(resetToken);
  if (!challenge || !token) return;
  const ttl = Math.min(
    MAX_TTL_SECONDS,
    Math.max(MIN_TTL_SECONDS, Number(expiresInSeconds || 600)),
  );
  const payload: RecoveryGrant = {
    challengeId: challenge,
    resetToken: token,
    scope: scope === 'central' ? 'central' : 'tenant',
    destination: destination === 'store' ? 'store' : 'admin',
    expiresAt: Date.now() + ttl * 1000,
  };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

export const readRecoveryGrant = (): RecoveryGrant | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as RecoveryGrant;
    if (
      !clean(payload?.challengeId) ||
      !clean(payload?.resetToken) ||
      !Number.isFinite(Number(payload?.expiresAt)) ||
      Date.now() >= Number(payload.expiresAt)
    ) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      challengeId: clean(payload.challengeId),
      resetToken: clean(payload.resetToken),
      scope: payload.scope === 'central' ? 'central' : 'tenant',
      destination: payload.destination === 'store' ? 'store' : 'admin',
      expiresAt: Number(payload.expiresAt),
    };
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
};

export const clearRecoveryGrant = () => {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(STORAGE_KEY);
};
