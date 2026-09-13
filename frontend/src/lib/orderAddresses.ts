const normalizeAddressSegment = (value: unknown): string => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/#/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const uniqueAddressSegments = (segments: string[]): string[] => {
  const seen = new Set<string>();
  const unique: string[] = [];

  segments.forEach((segment) => {
    const cleaned = segment.trim().replace(/\s+/g, ' ');
    const normalized = normalizeAddressSegment(cleaned);
    if (!cleaned || !normalized || seen.has(normalized)) return;
    seen.add(normalized);
    unique.push(cleaned);
  });

  return unique;
};

const orderMetadataPatterns = [
  /^Modalidad\s*:/i,
  /^Entrega\s*:\s*RD\$?/i,
  /^GPS\s*:/i,
  /^Cambio\s*:/i,
  /^Transferencia\s*:/i,
  /^Cuenta\s+/i,
  /^Titular\s+/i,
  /^Origen\s*:/i,
  /^Canal\s*:/i,
  /^Nota\s*:/i,
];

const extractAddressCandidate = (value: unknown): { address: string; pickup: boolean } => {
  const text = String(value || '').trim();
  if (!text) return { address: '', pickup: false };

  const parts = text.split(/\s*·\s*/).map((part) => part.trim()).filter(Boolean);
  const pickupPart = parts.find((part) => /^Retirar en\s*:/i.test(part));
  if (pickupPart) {
    return {
      address: pickupPart.replace(/^Retirar en\s*:\s*/i, '').trim(),
      pickup: true,
    };
  }

  const candidate = parts.find((part) => !orderMetadataPatterns.some((pattern) => pattern.test(part))) || '';
  return {
    address: candidate.trim(),
    pickup: /modalidad\s*:\s*recogida/i.test(text),
  };
};

export const compactPickupAddress = (value: unknown): string => {
  const { address } = extractAddressCandidate(value);
  if (!address) return '';

  const unique = uniqueAddressSegments(address.split(',').map((part) => part.trim()));
  if (unique.length <= 3) return unique.join(', ');

  // Pickup cards only need street/number, neighborhood and municipality/district.
  return unique.slice(0, 3).join(', ');
};

export const cleanOrderAddress = (value: unknown, mode?: 'delivery' | 'pickup' | ''): string => {
  const extracted = extractAddressCandidate(value);
  if (!extracted.address) return '';
  if (mode === 'pickup' || extracted.pickup) return compactPickupAddress(value);

  return uniqueAddressSegments(
    extracted.address.split(',').map((part) => part.trim()),
  ).join(', ');
};
