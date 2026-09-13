(function () {
  'use strict';

  if (typeof window.__COLMAPRO_RECOVER_CHUNK__ === 'function') {
    window.__COLMAPRO_RECOVER_CHUNK__('missing-next-chunk');
    return;
  }

  var attemptKey = 'colmapro:asset-recovery-attempt';
  var now = Date.now();
  var previous = 0;

  try {
    previous = Number(window.sessionStorage.getItem(attemptKey) || 0);
  } catch (_) {
    previous = 0;
  }

  if (previous > 0 && now - previous < 45000) {
    return;
  }

  try {
    window.sessionStorage.setItem(attemptKey, String(now));
  } catch (_) { /* no-op */ }

  var cleanup = [];
  if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
    cleanup.push(
      navigator.serviceWorker.getRegistrations()
        .then(function (registrations) {
          return Promise.all(registrations.map(function (registration) {
            return registration.unregister();
          }));
        })
        .catch(function () { return undefined; }),
    );
  }

  if ('caches' in window && window.caches.keys) {
    cleanup.push(
      window.caches.keys()
        .then(function (keys) {
          return Promise.all(keys
            .filter(function (key) { return key.indexOf('colmapro-spa-pwa-') === 0; })
            .map(function (key) { return window.caches.delete(key); }));
        })
        .catch(function () { return undefined; }),
    );
  }

  Promise.all(cleanup).finally(function () {
    var nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('__colmapro_refresh', String(now));
    window.location.replace(nextUrl.pathname + nextUrl.search + nextUrl.hash);
  });
})();
