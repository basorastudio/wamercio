import { isPlatformRootHost } from './api';

export const FALLBACK_STORE_ACCENT = '#00a884';

const STORAGE_KEY = 'wamercio_store_branding';

export type StoreBranding = {
  name: string;
  color: string;
  logoUrl: string;
  icon: string;
};

export const normalizeStoreAccent = (value: unknown) => {
  const raw = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const chars = raw.slice(1).split('');
    return `#${chars.map((char) => `${char}${char}`).join('')}`.toLowerCase();
  }
  return FALLBACK_STORE_ACCENT;
};

export const storeAccentRgb = (value: unknown) => {
  const clean = normalizeStoreAccent(value).replace('#', '');
  const color = Number.parseInt(clean, 16);
  return `${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}`;
};

export const darkenStoreAccent = (value: unknown, amount = 0.16) => {
  const clean = normalizeStoreAccent(value).replace('#', '');
  const color = Number.parseInt(clean, 16);
  const channels = [
    (color >> 16) & 255,
    (color >> 8) & 255,
    color & 255,
  ].map((channel) => Math.max(0, Math.round(channel * (1 - amount))));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

export const brandingFromStore = (store: any): StoreBranding | null => {
  if (!store) return null;
  const name = String(store.name || store.business_name || store.businessName || '').trim();
  if (!name) return null;
  return {
    name,
    color: normalizeStoreAccent(store.color || store.accent_color || store.accentColor),
    logoUrl: String(store.logoUrl || store.logo_url || '').trim(),
    icon: String(store.icon || store.business_icon || store.businessIcon || '🏪').trim() || '🏪',
  };
};

export const brandingFromManifest = (manifest: any): StoreBranding | null => {
  if (!manifest) return null;
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  return brandingFromStore({
    name: manifest.name || manifest.short_name,
    color: manifest.theme_color,
    logoUrl: icons.find((icon) => String(icon?.src || '').trim())?.src || '',
    icon: '🏪',
  });
};

export const readCachedStoreBranding = (): StoreBranding | null => {
  if (typeof window === 'undefined' || isPlatformRootHost()) return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    return brandingFromStore(value);
  } catch (_) {
    return null;
  }
};

export const persistStoreBranding = (store: any) => {
  if (typeof window === 'undefined' || isPlatformRootHost()) return;
  const branding = brandingFromStore(store);
  if (!branding) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(branding));
  } catch (_) {
    // El almacenamiento puede estar deshabilitado; el tema activo sigue funcionando en memoria.
  }
};
