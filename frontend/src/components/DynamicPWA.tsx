'use client';

import { useEffect } from 'react';
import { api, isPlatformRootHost, isTenantStoreHost } from '@/lib/api';

const PLATFORM_CACHE_PREFIX = 'wamercio-spa-pwa-';
const PLATFORM_CACHE_RESET_VERSION = 'cta-recovery-refresh-v47';

const setMetaThemeColor = (color: string) => {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = color;
};

const removePlatformServiceWorkerCache = async () => {
  if (!('serviceWorker' in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(PLATFORM_CACHE_PREFIX))
        .map((key) => caches.delete(key)),
    );
  }

  // A worker that controlled this tab remains active until the next navigation.
  // Reload exactly once so the SaaS panel is no longer served by a tenant PWA
  // cache left behind by an earlier version of WAMERCIO.
  if (
    navigator.serviceWorker.controller
    && window.sessionStorage.getItem('wamercio:platform-cache-reset') !== PLATFORM_CACHE_RESET_VERSION
  ) {
    window.sessionStorage.setItem('wamercio:platform-cache-reset', PLATFORM_CACHE_RESET_VERSION);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('__wamercio_refresh', String(Date.now()));
    window.location.replace(nextUrl.pathname + nextUrl.search + nextUrl.hash);
  }
};

const registerTenantServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
    .then((registration) => {
      const activateWaitingWorker = () => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      };

      activateWaitingWorker();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            worker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
      registration.update().catch(() => undefined);
    })
    .catch((error) => {
      console.warn('No se pudo registrar el service worker de WAMERCIO:', error);
    });
};

const DynamicPWA = () => {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    setMetaThemeColor('#00a884');

    const controller = new AbortController();
    const tenantStoreExperience = isTenantStoreHost();
    const platformExperience = isPlatformRootHost() || !tenantStoreExperience;

    if (platformExperience) {
      document.title = 'WAMERCIO SaaS';
      void removePlatformServiceWorkerCache().catch((error) => {
        console.warn('No se pudo limpiar la caché anterior del panel SaaS:', error);
      });

      return () => {
        controller.abort();
      };
    }

    api.get('/bootstrap', { signal: controller.signal })
      .then((payload) => {
        const store = payload?.stores?.[0];
        if (store?.color) setMetaThemeColor(store.color);
        if (store?.name) document.title = store.name;
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return undefined;
        // StoreProvider presents connection errors in the tenant UI.
        // DynamicPWA only enriches title/theme and must stay silent.
        return undefined;
      });

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      registerTenantServiceWorker();
      return () => {
        controller.abort();
      };
    }

    window.addEventListener('load', registerTenantServiceWorker);
    return () => {
      controller.abort();
      window.removeEventListener('load', registerTenantServiceWorker);
    };
  }, []);

  return null;
};

export default DynamicPWA;
