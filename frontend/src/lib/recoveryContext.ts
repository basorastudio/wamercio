export type RecoverySubjectType = 'customer' | 'administrator' | 'staff' | 'platform' | 'owner';

type RecoveryContext = {
  whatsapp: string;
  subjectType: RecoverySubjectType;
  accountLabel?: string;
  createdAt: number;
};

const STORAGE_KEY = 'colmapro:account-recovery-context';
const MAX_AGE_MS = 15 * 60 * 1000;

const onlyDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

export const saveRecoveryContext = ({ whatsapp, subjectType, accountLabel = '' }: Omit<RecoveryContext, 'createdAt'>) => {
  if (typeof window === 'undefined') return;
  const digits = onlyDigits(whatsapp);
  if (digits.length < 10) return;
  const payload: RecoveryContext = { whatsapp: digits, subjectType, accountLabel, createdAt: Date.now() };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

export const readRecoveryContext = (): RecoveryContext | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as RecoveryContext;
    if (!payload?.whatsapp || !payload?.subjectType || Date.now() - Number(payload.createdAt || 0) > MAX_AGE_MS) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};

export const clearRecoveryContext = () => {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(STORAGE_KEY);
};

export const maskRecoveryWhatsapp = (value: string) => {
  const digits = onlyDigits(value);
  if (digits.length < 4) return 'WhatsApp verificado';
  return `••• ••• ${digits.slice(-4)}`;
};
