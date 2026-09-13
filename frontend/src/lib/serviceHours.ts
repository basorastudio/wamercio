import { APP_TIMEZONE } from './timezone';

export const SERVICE_DAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type ServiceDayKey = typeof SERVICE_DAY_KEYS[number];

const WEEKDAY_TO_KEY: Record<string, ServiceDayKey> = {
  monday: 'monday',
  tuesday: 'tuesday',
  wednesday: 'wednesday',
  thursday: 'thursday',
  friday: 'friday',
  saturday: 'saturday',
  sunday: 'sunday',
};

const DEFAULT_SERVICE_HOURS: Record<ServiceDayKey, { enabled: boolean; open: string; close: string }> = {
  monday: { enabled: true, open: '08:00', close: '22:00' },
  tuesday: { enabled: true, open: '08:00', close: '22:00' },
  wednesday: { enabled: true, open: '08:00', close: '22:00' },
  thursday: { enabled: true, open: '08:00', close: '22:00' },
  friday: { enabled: true, open: '08:00', close: '22:00' },
  saturday: { enabled: true, open: '08:00', close: '22:00' },
  sunday: { enabled: false, open: '08:00', close: '22:00' },
};

const parseJSONField = (value: any, fallback: any = {}) => {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }
  return value;
};

const parseTimeToMinutes = (value: any, fallback = 0): number => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return fallback;

  const match = raw.match(/(\d{1,2})(?::(\d{2}))?/);
  if (!match) return fallback;

  let hour = Number(match[1]);
  const minute = Number(match[2] || '0');
  const isPM = /p\.?\s*m\.?|pm/.test(raw);
  const isAM = /a\.?\s*m\.?|am/.test(raw);

  if (isPM && hour < 12) hour += 12;
  if (isAM && hour === 12) hour = 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallback;

  hour = Math.max(0, Math.min(23, hour));
  const safeMinute = Math.max(0, Math.min(59, minute));
  return hour * 60 + safeMinute;
};

const currentDayKeyAndMinute = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const weekday = String(parts.find((part) => part.type === 'weekday')?.value || '').toLowerCase();
  const hourText = parts.find((part) => part.type === 'hour')?.value || '0';
  const minuteText = parts.find((part) => part.type === 'minute')?.value || '0';
  const hour = Number(hourText === '24' ? '0' : hourText);
  const minute = Number(minuteText);

  return {
    dayKey: WEEKDAY_TO_KEY[weekday] || 'monday',
    minuteOfDay: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
  };
};

export const normalizeServiceHours = (value: any = {}) => {
  const source = parseJSONField(value, {});
  return SERVICE_DAY_KEYS.reduce((acc, day) => {
    const item = source?.[day] || {};
    const defaults = DEFAULT_SERVICE_HOURS[day];
    acc[day] = {
      enabled: typeof item.enabled === 'boolean' ? item.enabled : defaults.enabled,
      open: item.open || defaults.open,
      close: item.close || defaults.close,
    };
    return acc;
  }, {} as Record<ServiceDayKey, { enabled: boolean; open: string; close: string }>);
};

export const getStoreServiceStatus = (
  serviceHours: any = {},
  options: { active?: boolean; now?: Date } = {},
) => {
  if (options.active === false) {
    return { isOpen: false, status: 'CERRADA', label: 'Cerrado ahora', reason: 'inactive' };
  }

  const hours = normalizeServiceHours(serviceHours);
  const { dayKey, minuteOfDay } = currentDayKeyAndMinute(options.now || new Date());
  const todayIndex = SERVICE_DAY_KEYS.indexOf(dayKey);
  const today = hours[dayKey];
  const previousKey = SERVICE_DAY_KEYS[(todayIndex + SERVICE_DAY_KEYS.length - 1) % SERVICE_DAY_KEYS.length];
  const previous = hours[previousKey];

  const isWithin = (item: { enabled: boolean; open: string; close: string } | undefined, fromPreviousDay = false) => {
    if (!item?.enabled) return false;
    const open = parseTimeToMinutes(item.open, 0);
    const close = parseTimeToMinutes(item.close, 0);
    if (open === close) return true;
    if (close > open) return !fromPreviousDay && minuteOfDay >= open && minuteOfDay < close;
    return fromPreviousDay ? minuteOfDay < close : minuteOfDay >= open;
  };

  const isOpen = isWithin(today) || isWithin(previous, true);
  return {
    isOpen,
    status: isOpen ? 'ABIERTA' : 'CERRADA',
    label: isOpen ? 'Abierto ahora' : 'Cerrado ahora',
    reason: isOpen ? 'service_hours' : 'outside_service_hours',
  };
};
