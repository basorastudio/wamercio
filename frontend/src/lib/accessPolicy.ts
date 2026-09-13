import { useEffect, useMemo, useState } from 'react';
import { api } from './api';

export type AccessPolicy = {
  adminPinLength: number;
  customerPinLength: number;
  acceptedAdminPinLengths: number[];
  acceptedCustomerPinLengths: number[];
  maxAdminPinLength: number;
  maxCustomerPinLength: number;
  // Backward-compatible administration aliases used by a few legacy components.
  pinLength: number;
  acceptedPinLengths: number[];
  maxPinLength: number;
  recoveryEnabled: boolean;
  recoveryMethod: 'otp' | 'link';
  recoveryCodeLength: number;
  recoveryTtlMinutes: number;
  recoveryMaxAttempts: number;
};

export const DEFAULT_ACCESS_POLICY: AccessPolicy = {
  adminPinLength: 6,
  customerPinLength: 4,
  acceptedAdminPinLengths: [4, 6],
  acceptedCustomerPinLengths: [4, 6],
  maxAdminPinLength: 6,
  maxCustomerPinLength: 6,
  pinLength: 6,
  acceptedPinLengths: [4, 6],
  maxPinLength: 6,
  recoveryEnabled: true,
  recoveryMethod: 'otp',
  recoveryCodeLength: 6,
  recoveryTtlMinutes: 10,
  recoveryMaxAttempts: 5,
};

let cachedPolicy: AccessPolicy | null = null;
let pendingPolicy: Promise<AccessPolicy> | null = null;

const asInteger = (value: unknown, fallback: number) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeLengths = (current: number, raw: unknown, fallback: number[]) => {
  const values = Array.isArray(raw) ? raw : fallback;
  return Array.from(new Set(
    [current, ...values.map((value: unknown) => asInteger(value, 0))]
      .filter((value) => value >= 4 && value <= 8),
  )).sort((a, b) => a - b);
};

export const normalizeAccessPolicy = (raw: any): AccessPolicy => {
  const legacyPinLength = asInteger(raw?.pin_length ?? raw?.pinLength, DEFAULT_ACCESS_POLICY.adminPinLength);
  const adminPinLength = Math.min(8, Math.max(4, asInteger(
    raw?.admin_pin_length ?? raw?.adminPinLength ?? legacyPinLength,
    DEFAULT_ACCESS_POLICY.adminPinLength,
  )));
  const customerPinLength = Math.min(8, Math.max(4, asInteger(
    raw?.customer_pin_length ?? raw?.customerPinLength,
    DEFAULT_ACCESS_POLICY.customerPinLength,
  )));

  const acceptedAdminPinLengths = normalizeLengths(
    adminPinLength,
    raw?.accepted_admin_pin_lengths ?? raw?.acceptedAdminPinLengths ?? raw?.accepted_pin_lengths ?? raw?.acceptedPinLengths,
    DEFAULT_ACCESS_POLICY.acceptedAdminPinLengths,
  );
  const acceptedCustomerPinLengths = normalizeLengths(
    customerPinLength,
    raw?.accepted_customer_pin_lengths ?? raw?.acceptedCustomerPinLengths,
    DEFAULT_ACCESS_POLICY.acceptedCustomerPinLengths,
  );

  return {
    adminPinLength,
    customerPinLength,
    acceptedAdminPinLengths,
    acceptedCustomerPinLengths,
    maxAdminPinLength: Math.max(adminPinLength, ...acceptedAdminPinLengths),
    maxCustomerPinLength: Math.max(customerPinLength, ...acceptedCustomerPinLengths),
    pinLength: adminPinLength,
    acceptedPinLengths: acceptedAdminPinLengths,
    maxPinLength: Math.max(adminPinLength, ...acceptedAdminPinLengths),
    recoveryEnabled: raw?.recovery_enabled ?? raw?.recoveryEnabled ?? DEFAULT_ACCESS_POLICY.recoveryEnabled,
    recoveryMethod: (raw?.recovery_method ?? raw?.recoveryMethod) === 'link' ? 'link' : 'otp',
    recoveryCodeLength: Math.min(8, Math.max(4, asInteger(raw?.recovery_code_length ?? raw?.recoveryCodeLength, DEFAULT_ACCESS_POLICY.recoveryCodeLength))),
    recoveryTtlMinutes: Math.min(60, Math.max(3, asInteger(raw?.recovery_ttl_minutes ?? raw?.recoveryTtlMinutes, DEFAULT_ACCESS_POLICY.recoveryTtlMinutes))),
    recoveryMaxAttempts: Math.min(10, Math.max(3, asInteger(raw?.recovery_max_attempts ?? raw?.recoveryMaxAttempts, DEFAULT_ACCESS_POLICY.recoveryMaxAttempts))),
  };
};

export const loadAccessPolicy = async (force = false): Promise<AccessPolicy> => {
  if (!force && cachedPolicy) return cachedPolicy;
  if (!force && pendingPolicy) return pendingPolicy;

  pendingPolicy = api.get('/access-policy')
    .then((response: any) => {
      cachedPolicy = normalizeAccessPolicy(response);
      return cachedPolicy;
    })
    .catch(() => cachedPolicy || DEFAULT_ACCESS_POLICY)
    .finally(() => {
      pendingPolicy = null;
    });

  return pendingPolicy;
};

export const setCachedAccessPolicy = (raw: any) => {
  cachedPolicy = normalizeAccessPolicy(raw);
  return cachedPolicy;
};

export const useAccessPolicy = () => {
  const [policy, setPolicy] = useState<AccessPolicy>(() => cachedPolicy || DEFAULT_ACCESS_POLICY);

  useEffect(() => {
    let alive = true;
    loadAccessPolicy().then((next) => {
      if (alive) setPolicy(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  return useMemo(() => policy, [policy]);
};

export const isAcceptedAdminAccessPinLength = (length: number, policy: AccessPolicy) =>
  policy.acceptedAdminPinLengths.includes(length);

export const isAcceptedCustomerAccessPinLength = (length: number, policy: AccessPolicy) =>
  policy.acceptedCustomerPinLengths.includes(length);

export const adminLoginAttemptDelay = (length: number, policy: AccessPolicy) =>
  policy.acceptedAdminPinLengths.some((candidate) => candidate > length) ? 900 : 0;

export const customerLoginAttemptDelay = (length: number, policy: AccessPolicy) =>
  policy.acceptedCustomerPinLengths.some((candidate) => candidate > length) ? 900 : 0;

// Compatibility exports for administration-only legacy imports.
export const isAcceptedAccessPinLength = isAcceptedAdminAccessPinLength;
export const loginAttemptDelay = adminLoginAttemptDelay;
