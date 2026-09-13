import { nationalIdDigits, formatDominicanId } from './nationalId';

export type DominicanIdQrData = {
  nationalId: string;
  name: string;
  lastName: string;
  raw: string;
};

export const normalizeDominicanName = (value = '') => String(value || '')
  .trim()
  .toLocaleLowerCase('es-DO')
  .split(/\s+/)
  .filter(Boolean)
  .map((word) => word
    .split('-')
    .map((part) => part ? `${part.charAt(0).toLocaleUpperCase('es-DO')}${part.slice(1)}` : '')
    .join('-'))
  .join(' ');

export const parseDominicanIdQr = (rawValue = ''): DominicanIdQrData | null => {
  const raw = String(rawValue || '').trim();
  if (!raw) return null;

  const parts = raw.split('|').map((part) => String(part || '').trim()).filter((part) => part.length > 0);
  if (parts.length < 4) return null;

  const digits = nationalIdDigits(parts[0]);
  if (digits.length !== 11) return null;

  const name = normalizeDominicanName(parts[1]);
  const firstLastName = normalizeDominicanName(parts[2]);
  const secondLastName = normalizeDominicanName(parts[3]);
  const lastName = [firstLastName, secondLastName].filter(Boolean).join(' ').trim();

  if (!name || !lastName) return null;

  return {
    nationalId: formatDominicanId(digits),
    name,
    lastName,
    raw,
  };
};
