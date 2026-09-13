const DEFAULT_ROOT_DOMAIN = 'ltd.do';
const DEFAULT_PLATFORM_DOMAIN = 'wamercio.com';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/$/, '');
const ROOT_DOMAIN = String(process.env.NEXT_PUBLIC_ROOT_DOMAIN || DEFAULT_ROOT_DOMAIN).toLowerCase().replace(/^https?:\/\//, '').replace(/:\d+$/, '').replace(/^\*\./, '').replace(/\/$/, '').trim();
const PLATFORM_DOMAIN = String(process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || DEFAULT_PLATFORM_DOMAIN).toLowerCase().replace(/^https?:\/\//, '').replace(/:\d+$/, '').replace(/^\*\./, '').replace(/\/$/, '').trim();

const cleanHost = (value) => String(value || '')
  .toLowerCase()
  .replace(/^https?:\/\//, '')
  .replace(/:\d+$/, '')
  .replace(/^\*\./, '')
  .replace(/\/$/, '')
  .trim();

const PLATFORM_HOST_ALIASES = String(process.env.NEXT_PUBLIC_PLATFORM_HOST_ALIASES || '')
  .split(',')
  .map(cleanHost)
  .filter(Boolean);

const PLATFORM_HOSTS = new Set([
  PLATFORM_DOMAIN,
  PLATFORM_DOMAIN ? `www.${PLATFORM_DOMAIN}` : '',
  ...PLATFORM_HOST_ALIASES,
].filter(Boolean));

export const getRootDomain = () => ROOT_DOMAIN;
export const getPlatformDomain = () => PLATFORM_DOMAIN;

export const isPlatformRootHost = () => {
  if (typeof window === 'undefined') return false;
  const host = cleanHost(window.location.hostname || window.location.host || '');
  if (PLATFORM_HOSTS.size > 0) return PLATFORM_HOSTS.has(host);
  // Backward compatibility for older single-domain installations.
  return Boolean(ROOT_DOMAIN && host === ROOT_DOMAIN);
};

export const isTenantRootHost = () => {
  if (typeof window === 'undefined') return false;
  const host = cleanHost(window.location.hostname || window.location.host || '');
  return Boolean(ROOT_DOMAIN && PLATFORM_DOMAIN && ROOT_DOMAIN !== PLATFORM_DOMAIN && host === ROOT_DOMAIN);
};

const isLocalDevelopmentHost = (host: string) =>
  host === 'localhost' ||
  host === '127.0.0.1' ||
  host === '::1' ||
  host === '[::1]';

// Only real tenant subdomains (for example negocio.ltd.do) should request the
// tenant bootstrap automatically. The SaaS landing and /#/superadmin run on
// wamercio.com and must never hit /api/bootstrap without an explicit tenant.
export const isTenantStoreHost = () => {
  if (typeof window === 'undefined') return false;
  const host = cleanHost(window.location.hostname || window.location.host || '');
  if (!host || isPlatformRootHost() || isTenantRootHost()) return false;
  if (isLocalDevelopmentHost(host)) return true;
  if (!ROOT_DOMAIN) return true;
  return host.endsWith(`.${ROOT_DOMAIN}`);
};

export const getPlatformRedirectUrl = () => {
  if (typeof window === 'undefined' || !PLATFORM_DOMAIN) return '';
  const { pathname, search, hash } = window.location;
  return `https://${PLATFORM_DOMAIN}${pathname || '/'}${search || ''}${hash || ''}`;
};

export const getPlatformHashUrl = (path = '/') => {
  const cleanPath = `/${String(path || '/').replace(/^#?\/?/, '').replace(/^\/+/, '')}`;
  if (typeof window !== 'undefined' && isPlatformRootHost()) {
    return `${window.location.origin}/#${cleanPath}`;
  }
  const domain = PLATFORM_DOMAIN || DEFAULT_PLATFORM_DOMAIN;
  return `https://${domain}/#${cleanPath}`;
};

export const currentHashPath = () => {
  if (typeof window === 'undefined') return '/';
  return String(window.location.hash || '').replace(/^#/, '') || '/';
};

export const isSuperAdminPath = () => {
  const hashPath = currentHashPath();
  return hashPath === '/superadmin' || hashPath.startsWith('/superadmin/');
};

export const isAdminPath = () => {
  const hashPath = currentHashPath();
  return hashPath === '/admin' || hashPath.startsWith('/admin/');
};

const cleanTenantKey = (value) => String(value || 'local')
  .toLowerCase()
  .replace(/^https?:\/\//, '')
  .replace(/:\d+$/, '')
  .replace(/[^a-z0-9.-]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'local';

export const getTenantScope = () => {
  if (typeof window === 'undefined') return 'server';
  return cleanTenantKey(window.location.hostname || window.location.host || 'local');
};

const scopedKey = (key) => `${key}:${getTenantScope()}`;
const COOKIE_SESSION_MARKER = 'cookie-session';
const DEVICE_ID_STORAGE_KEY = 'colmapro_identity_device_id_v1';

const createDeviceId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
};

export const getIdentityDeviceId = () => {
  if (typeof window === 'undefined') return '';
  try {
    const existing = String(window.localStorage.getItem(DEVICE_ID_STORAGE_KEY) || '').trim();
    if (/^[a-zA-Z0-9._:-]{12,160}$/.test(existing)) return existing;
    const created = createDeviceId();
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
    return created;
  } catch (_) {
    return createDeviceId();
  }
};

const identityProtectedPath = (path) => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized === '/client/verify-identity'
    || normalized === '/client/register'
    || normalized === '/platform/identity/verify'
    || normalized === '/platform/businesses'
    || normalized === '/admin/businesses'
    || normalized === '/platform/owners'
    || normalized.startsWith('/platform/owners/');
};

const identityDeviceHeader = (path) => {
  if (!identityProtectedPath(path)) return {};
  const deviceId = getIdentityDeviceId();
  return deviceId ? { 'X-WAMERCIO-Device-ID': deviceId } : {};
};
const usableBearerToken = (value) => {
  const token = String(value || '').trim();
  return token && token !== 'cookie' && token !== COOKIE_SESSION_MARKER ? token : '';
};

const getStored = (key) => {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(scopedKey(key)) || window.localStorage.getItem(key) || '';
};

const setStored = (key, value) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(scopedKey(key), value || '');
  window.localStorage.removeItem(key);
};

const removeStored = (key) => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(scopedKey(key));
  window.localStorage.removeItem(key);
};

const pendingProvisioningKeys = new Map<string, string>();

const requestIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const isTenantProvisioningPath = (path) => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized === '/platform/businesses' || normalized === '/admin/businesses';
};

const getPlatformToken = () => getStored('colmapro_platform_token');
const getAdminToken = () => getStored('colmapro_admin_token');
const getClientToken = () => getStored('colmapro_client_token');
const getStaffToken = () => getStored('colmapro_staff_token');
const getAdminTenant = () => getStored('colmapro_admin_tenant');
const getAdminTenantName = () => getStored('colmapro_admin_tenant_name');

const setAdminTenant = (tenant) => {
  const slug = typeof tenant === 'string' ? tenant : (tenant?.slug || tenant?.id || '');
  const name = typeof tenant === 'string' ? tenant : (tenant?.name || tenant?.slug || '');
  setStored('colmapro_admin_tenant', slug);
  setStored('colmapro_admin_tenant_name', name);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('colmapro:tenant-changed', { detail: { slug, name, tenant } }));
    window.dispatchEvent(new CustomEvent('colmapro:data-changed'));
  }
};

const cleanText = (value) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const tokenForPath = (path) => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const hashPath = currentHashPath();
  const isCashierPanel = hashPath.startsWith('/cashier');
  const isDeliveryPanel = hashPath.startsWith('/delivery');

  if (normalized.startsWith('/platform')) return usableBearerToken(getPlatformToken());
  if (normalized.startsWith('/client')) return usableBearerToken(getClientToken());
  if (normalized.startsWith('/staff')) return usableBearerToken(getStaffToken());

  if ((isCashierPanel || isDeliveryPanel) && (
    normalized === '/bootstrap' ||
    /^\/stores\/[^/]+\/data$/.test(normalized)
  )) {
    return usableBearerToken(getStaffToken()) || usableBearerToken(getAdminToken());
  }

  if (normalized === '/delivery' || normalized.startsWith('/delivery/')) {
    if (isDeliveryPanel) return usableBearerToken(getStaffToken()) || usableBearerToken(getAdminToken());
    return usableBearerToken(getAdminToken()) || usableBearerToken(getStaffToken());
  }

  if (/^\/orders\/[^/]+\/status$/.test(normalized)) {
    if (isDeliveryPanel) return usableBearerToken(getStaffToken());
    return usableBearerToken(getAdminToken()) || usableBearerToken(getStaffToken());
  }

  if (isCashierPanel && (normalized === '/sales' || normalized.startsWith('/assisted-orders') || normalized === '/cash-history')) {
    return usableBearerToken(getStaffToken()) || usableBearerToken(getAdminToken());
  }

  return usableBearerToken(getAdminToken());
};

const adminTenantHeader = (path) => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized.startsWith('/platform')) return {};
  const tenant = getAdminTenant();
  if (!tenant) return {};

  const hashPath = currentHashPath();
  const isTenantAdminPanel = hashPath === '/admin' || hashPath.startsWith('/admin/');
  const isStaffPanel = hashPath.startsWith('/cashier') || hashPath.startsWith('/delivery');
  const requiresExplicitTenant =
    isPlatformRootHost() ||
    isTenantAdminPanel ||
    isStaffPanel ||
    normalized.startsWith('/staff') ||
    normalized.startsWith('/delivery') ||
    normalized === '/bootstrap';

  return requiresExplicitTenant ? { 'X-WAMERCIO-Tenant': tenant } : {};
};

async function request(path, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const token = tokenForPath(path);
  const hasBody = Object.prototype.hasOwnProperty.call(options, 'body') && options.body != null;
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  let response;

  try {
    response = await fetch(url, {
      ...options,
      cache: 'no-store',
      credentials: 'include',
      headers: {
        ...(hasBody && !isFormData ? { 'Content-Type': 'application/json' } : {}),
        ...adminTenantHeader(path),
        ...identityDeviceHeader(path),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new Error(`No se pudo conectar con el servidor (${url}). Verifica que el contenedor del servidor y Nginx estén activos.`);
  }

  const contentType = response.headers.get('content-type') || '';
  let payload = null;

  try {
    payload = contentType.includes('application/json') ? await response.json() : await response.text();
  } catch (_) {
    payload = null;
  }

  if (!response.ok) {
    if (typeof payload === 'object' && payload?.error) {
      const apiError = payload.error;
      const message = typeof apiError === 'string'
        ? apiError
        : String(apiError?.message || apiError?.detail || apiError?.code || 'No se pudo completar la solicitud.');
      throw new Error(message);
    }

    if ([502, 503, 504].includes(response.status)) {
      throw new Error('El servidor de WAMERCIO no está disponible. Verifica que el servicio backend esté activo y que /health/ready responda correctamente en el VPS.');
    }

    const text = cleanText(payload);
    if (text) {
      throw new Error(`Error ${response.status}: ${text.slice(0, 180)}`);
    }

    throw new Error(`Error ${response.status} en ${url}. No se pudo completar la solicitud.`);
  }

  return payload;
}

const logoutScope = (scope) => {
  if (typeof window === 'undefined') return;
  fetch(`${API_BASE_URL}/session/logout?scope=${encodeURIComponent(scope)}`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
  }).catch(() => undefined);
};

const queryString = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const api = {
  getRootDomain,
  get: (path, options: RequestInit = {}) => request(path, options),
  eventUrl: (path, params = {}) => `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}${queryString(params)}`,
  post: async (path, data = {}, options: RequestInit = {}) => {
    const body = JSON.stringify(data || {});
    const headers = { ...((options.headers || {}) as Record<string, string>) };
    let provisioningFingerprint = '';
    let provisioningKey = '';
    if (isTenantProvisioningPath(path) && !Object.keys(headers).some((key) => key.toLowerCase() === 'idempotency-key')) {
      provisioningFingerprint = `${path}:${body}`;
      provisioningKey = pendingProvisioningKeys.get(provisioningFingerprint) || requestIdempotencyKey();
      if (!pendingProvisioningKeys.has(provisioningFingerprint) && pendingProvisioningKeys.size >= 50) {
        const oldestFingerprint = pendingProvisioningKeys.keys().next().value;
        if (oldestFingerprint) pendingProvisioningKeys.delete(oldestFingerprint);
      }
      pendingProvisioningKeys.set(provisioningFingerprint, provisioningKey);
      headers['Idempotency-Key'] = provisioningKey;
    }
    const response = await request(path, { ...options, headers, method: 'POST', body });
    if (provisioningFingerprint && pendingProvisioningKeys.get(provisioningFingerprint) === provisioningKey) {
      pendingProvisioningKeys.delete(provisioningFingerprint);
    }
    return response;
  },
  patch: (path, data = {}) => request(path, { method: 'PATCH', body: JSON.stringify(data || {}) }),
  upload: (path, formData, method = 'POST') => request(path, { method, body: formData }),
  delete: (path) => request(path, { method: 'DELETE' }),
  getPlatformToken,
  getAdminToken,
  getClientToken,
  getStaffToken,
  getAdminTenant,
  getAdminTenantName,
  setAdminTenant,
  setPlatformToken: (_token = '') => setStored('colmapro_platform_token', COOKIE_SESSION_MARKER),
  setAdminToken: (_token = '') => setStored('colmapro_admin_token', COOKIE_SESSION_MARKER),
  setClientToken: (_token = '') => setStored('colmapro_client_token', COOKIE_SESSION_MARKER),
  setStaffToken: (_token = '') => setStored('colmapro_staff_token', COOKIE_SESSION_MARKER),
  setPlatformUser: (user) => setStored('colmapro_platform_user', user),
  setAdminUser: (user) => setStored('colmapro_admin_user', user),
  setStaffUser: (user) => setStored('colmapro_staff_user', user),
  setStaffRole: (role) => setStored('colmapro_staff_role', role),
  getPlatformUser: () => getStored('colmapro_platform_user'),
  getAdminUser: () => getStored('colmapro_admin_user'),
  getStaffUser: () => getStored('colmapro_staff_user'),
  getStaffRole: () => getStored('colmapro_staff_role'),
  clearPlatformSession: () => {
    logoutScope('platform');
    removeStored('colmapro_platform_token');
    removeStored('colmapro_platform_user');
  },
  clearAdminSession: () => {
    logoutScope('admin');
    removeStored('colmapro_admin_token');
    removeStored('colmapro_admin_user');
    removeStored('colmapro_admin_tenant');
    removeStored('colmapro_admin_tenant_name');
  },
  clearClientSession: () => {
    logoutScope('client');
    removeStored('colmapro_client_token');
  },
  clearStaffSession: () => {
    logoutScope('staff');
    removeStored('colmapro_staff_token');
    removeStored('colmapro_staff_user');
    removeStored('colmapro_staff_role');
  },
};
