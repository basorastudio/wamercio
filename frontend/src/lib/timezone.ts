export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || 'America/Santo_Domingo';
export const APP_LOCALE = 'es-DO';

export const nowISO = (): string => new Date().toISOString();

const toDate = (value?: string | number | Date | null): Date => {
  if (!value) return new Date();
  return value instanceof Date ? value : new Date(value);
};

export const formatInAppTimezone = (
  value?: string | number | Date | null,
  options: Intl.DateTimeFormatOptions = {},
): string => new Intl.DateTimeFormat(APP_LOCALE, {
  timeZone: APP_TIMEZONE,
  ...options,
}).format(toDate(value));

export const formatDate = (
  value?: string | number | Date | null,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
): string => formatInAppTimezone(value, options);

export const formatTime = (
  value?: string | number | Date | null,
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' },
): string => formatInAppTimezone(value, options);

export const formatDateTime = (
  value?: string | number | Date | null,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' },
): string => formatInAppTimezone(value, options);

export const appDateKey = (value?: string | number | Date | null): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(toDate(value));
  const year = parts.find(part => part.type === 'year')?.value || '0000';
  const month = parts.find(part => part.type === 'month')?.value || '00';
  const day = parts.find(part => part.type === 'day')?.value || '00';
  return `${year}-${month}-${day}`;
};

export const appMonthKey = (value?: string | number | Date | null): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(toDate(value));
  const year = parts.find(part => part.type === 'year')?.value || '0000';
  const month = parts.find(part => part.type === 'month')?.value || '00';
  return `${year}-${month}`;
};

export const appHour = (value?: string | number | Date | null): number => {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    hour12: false,
  }).format(toDate(value));
  return Number(hour === '24' ? '0' : hour);
};

export const isTodayInAppTimezone = (value?: string | number | Date | null): boolean => (
  appDateKey(value) === appDateKey()
);

export const isSameMonthInAppTimezone = (value?: string | number | Date | null): boolean => (
  appMonthKey(value) === appMonthKey()
);
