import React, { createContext, useContext, useEffect } from 'react';
import { useApiStore } from '../hooks/useApiStore';
import {
  darkenStoreAccent,
  FALLBACK_STORE_ACCENT,
  normalizeStoreAccent,
  persistStoreBranding,
  storeAccentRgb,
} from '../lib/storeBranding';

const StoreContext = createContext<any>(null);
export const useStore = () => useContext(StoreContext);

const applyStoreTheme = (color: string) => {
  if (typeof document === 'undefined') return;
  const accent = normalizeStoreAccent(color);
  const root = document.documentElement;
  root.style.setProperty('--store-accent', accent);
  root.style.setProperty('--store-accent-rgb', storeAccentRgb(accent));
  root.style.setProperty('--store-accent-dark', darkenStoreAccent(accent));
  root.setAttribute('data-wamercio-store-theme', 'true');
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = accent;
};

export const StoreProvider = ({ children }) => {
  const store = useApiStore();
  const activeStore = store?.activeStore;
  const activeColor = store?.activeStore?.color;

  useEffect(() => {
    if (activeStore) {
      applyStoreTheme(activeColor || FALLBACK_STORE_ACCENT);
      persistStoreBranding(activeStore);
      return undefined;
    }
    if (typeof document !== 'undefined') {
      document.documentElement.removeAttribute('data-wamercio-store-theme');
      document.documentElement.style.removeProperty('--store-accent');
      document.documentElement.style.removeProperty('--store-accent-rgb');
      document.documentElement.style.removeProperty('--store-accent-dark');
    }
    return undefined;
  }, [activeStore?.id, activeStore?.name, activeStore?.logoUrl, activeStore?.logo_url, activeStore?.icon, activeColor]);

  return (
    <StoreContext.Provider value={store}>
      {children}
    </StoreContext.Provider>
  );
};
