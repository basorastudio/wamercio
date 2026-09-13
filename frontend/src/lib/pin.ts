export const ACCESS_PIN_LENGTH = 6;
export const LEGACY_ACCESS_PIN_LENGTH = 4;
export const DELIVERY_PIN_LENGTH = 4;

export const sanitizePin = (value: unknown, length = ACCESS_PIN_LENGTH) =>
  String(value ?? '').replace(/\D/g, '').slice(0, length);

export const isCompleteAccessPin = (value: unknown) =>
  sanitizePin(value).length === ACCESS_PIN_LENGTH;

export const isLegacyAccessPin = (value: unknown) =>
  String(value ?? '').replace(/\D/g, '').length === LEGACY_ACCESS_PIN_LENGTH;
