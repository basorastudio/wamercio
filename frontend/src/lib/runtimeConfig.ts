import { api } from './api';

export type RuntimeConfig = {
  bootstrapRefetchMs: number;
  clientSessionRefreshMs: number;
  clientCartPullMs: number;
  enableRealtimeEvents: boolean;
};

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  bootstrapRefetchMs: 30_000,
  clientSessionRefreshMs: 30_000,
  clientCartPullMs: 15_000,
  enableRealtimeEvents: true,
};

let cachedConfig: RuntimeConfig | null = null;

const positiveNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeRuntimeConfig = (payload: any): RuntimeConfig => ({
  bootstrapRefetchMs: positiveNumber(payload?.bootstrapRefetchMs, DEFAULT_RUNTIME_CONFIG.bootstrapRefetchMs),
  clientSessionRefreshMs: positiveNumber(payload?.clientSessionRefreshMs, DEFAULT_RUNTIME_CONFIG.clientSessionRefreshMs),
  clientCartPullMs: positiveNumber(payload?.clientCartPullMs, DEFAULT_RUNTIME_CONFIG.clientCartPullMs),
  enableRealtimeEvents: payload?.enableRealtimeEvents !== false,
});

export const getRuntimeConfigSync = () => cachedConfig || DEFAULT_RUNTIME_CONFIG;

export const loadRuntimeConfig = async (force = false): Promise<RuntimeConfig> => {
  if (cachedConfig && !force) return cachedConfig;
  try {
    const payload = await api.get('/runtime-config');
    cachedConfig = normalizeRuntimeConfig(payload);
    return cachedConfig;
  } catch (_) {
    cachedConfig = DEFAULT_RUNTIME_CONFIG;
    return cachedConfig;
  }
};
