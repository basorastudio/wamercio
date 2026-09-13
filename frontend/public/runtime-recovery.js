(function () {
  'use strict';

  var RECOVERY_ATTEMPT_KEY = 'colmapro:asset-recovery-attempt';
  var RECOVERY_QUERY_KEY = '__colmapro_refresh';
  var CACHE_PREFIX = 'colmapro-spa-pwa-';
  var currentScript = document.currentScript;
  var configuredPlatformDomain = currentScript && currentScript.dataset
    ? String(currentScript.dataset.platformDomain || '').trim().toLowerCase()
    : '';

  function normalizeHost(value) {
    return String(value || '').trim().toLowerCase().replace(/^www\./, '');
  }

  function isPlatformHost() {
    var currentHost = normalizeHost(window.location.hostname);
    var platformHost = normalizeHost(configuredPlatformDomain || 'wamercio.com');
    return currentHost === platformHost;
  }

  function isNextStaticAsset(value) {
    if (!value) return false;
    try {
      var assetUrl = new URL(String(value), window.location.href);
      return assetUrl.origin === window.location.origin && assetUrl.pathname.indexOf('/_next/static/') === 0;
    } catch (_) {
      return String(value).indexOf('/_next/static/') !== -1;
    }
  }

  function isChunkFailureMessage(value) {
    var message = String(value || '');
    return /ChunkLoadError|Loading chunk [^ ]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(message);
  }

  function removePlatformServiceWorkersAndCaches() {
    var operations = [];

    if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
      operations.push(
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
      operations.push(
        window.caches.keys()
          .then(function (keys) {
            return Promise.all(keys
              .filter(function (key) { return key.indexOf(CACHE_PREFIX) === 0; })
              .map(function (key) { return window.caches.delete(key); }));
          })
          .catch(function () { return undefined; }),
      );
    }

    return Promise.all(operations);
  }

  function showRecoveryScreen(repeatedFailure) {
    var existing = document.getElementById('colmapro-runtime-recovery');
    if (existing) return;

    var overlay = document.createElement('div');
    overlay.id = 'colmapro-runtime-recovery';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483647',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:24px',
      'background:#eef3f7',
      'font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'color:#102033',
    ].join(';');

    var title = repeatedFailure ? 'No se pudo actualizar WAMERCIO' : 'Actualizando WAMERCIO';
    var description = repeatedFailure
      ? 'El navegador conserva archivos de una versión anterior. Presiona el botón para cargar nuevamente la versión vigente.'
      : 'Estamos limpiando archivos anteriores y cargando la versión más reciente de forma segura.';
    var action = repeatedFailure
      ? '<button type="button" id="colmapro-runtime-retry" style="margin-top:18px;border:0;border-radius:12px;background:#00a884;color:#fff;font-weight:800;padding:12px 18px;cursor:pointer">Volver a cargar</button>'
      : '<div style="margin:20px auto 0;width:34px;height:34px;border:4px solid rgba(0,168,132,.18);border-top-color:#00a884;border-radius:999px;animation:colmapro-runtime-spin .8s linear infinite"></div>';

    overlay.innerHTML = [
      '<style>@keyframes colmapro-runtime-spin{to{transform:rotate(360deg)}}</style>',
      '<div style="width:min(100%,440px);background:#fff;border:1px solid #dce5eb;border-radius:24px;box-shadow:0 24px 70px rgba(15,26,40,.15);padding:30px;text-align:center">',
      '<div style="width:58px;height:58px;margin:0 auto 16px;border-radius:18px;background:rgba(0,168,132,.12);display:flex;align-items:center;justify-content:center;color:#00a884;font-size:28px;font-weight:900">C</div>',
      '<h1 style="margin:0;font-size:22px;line-height:1.2;font-weight:900">' + title + '</h1>',
      '<p style="margin:10px 0 0;color:#66768a;font-size:14px;line-height:1.6">' + description + '</p>',
      action,
      '</div>',
    ].join('');

    (document.body || document.documentElement).appendChild(overlay);

    var retryButton = document.getElementById('colmapro-runtime-retry');
    if (retryButton) {
      retryButton.addEventListener('click', function () {
        try { window.sessionStorage.removeItem(RECOVERY_ATTEMPT_KEY); } catch (_) { /* no-op */ }
        reloadWithCacheBust();
      });
    }
  }

  function reloadWithCacheBust() {
    var nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set(RECOVERY_QUERY_KEY, String(Date.now()));
    window.location.replace(nextUrl.pathname + nextUrl.search + nextUrl.hash);
  }

  function recoverFromAssetMismatch(reason) {
    if (window.__COLMAPRO_ASSET_RECOVERY_RUNNING__) return;
    window.__COLMAPRO_ASSET_RECOVERY_RUNNING__ = true;

    var now = Date.now();
    var previousAttempt = 0;
    try {
      previousAttempt = Number(window.sessionStorage.getItem(RECOVERY_ATTEMPT_KEY) || 0);
    } catch (_) {
      previousAttempt = 0;
    }

    var repeatedFailure = previousAttempt > 0 && now - previousAttempt < 45000;
    showRecoveryScreen(repeatedFailure);

    if (repeatedFailure) {
      window.__COLMAPRO_ASSET_RECOVERY_RUNNING__ = false;
      return;
    }

    try {
      window.sessionStorage.setItem(RECOVERY_ATTEMPT_KEY, String(now));
      window.sessionStorage.setItem('colmapro:last-asset-recovery-reason', String(reason || 'chunk-load-error'));
    } catch (_) { /* no-op */ }

    removePlatformServiceWorkersAndCaches()
      .catch(function () { return undefined; })
      .then(function () {
        window.setTimeout(reloadWithCacheBust, 120);
      });
  }

  window.__COLMAPRO_RECOVER_CHUNK__ = recoverFromAssetMismatch;

  window.addEventListener('error', function (event) {
    var target = event && event.target;
    if (target && target !== window) {
      var source = target.src || target.href || '';
      if (isNextStaticAsset(source)) {
        recoverFromAssetMismatch('next-static-resource-error');
        return;
      }
    }

    if (isChunkFailureMessage(event && (event.message || (event.error && event.error.message)))) {
      recoverFromAssetMismatch('chunk-load-error');
    }
  }, true);

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    var message = reason && reason.message ? reason.message : reason;
    if (isChunkFailureMessage(message)) {
      recoverFromAssetMismatch('chunk-load-rejection');
    }
  });

  // The SaaS domain must never be controlled by the tenant PWA service worker.
  // Cleaning it before React starts prevents a stale cached document from
  // referencing chunks that no longer exist after a deployment.
  if (isPlatformHost()) {
    removePlatformServiceWorkersAndCaches().catch(function () { return undefined; });
  }

  window.addEventListener('load', function () {
    window.setTimeout(function () {
      try { window.sessionStorage.removeItem(RECOVERY_ATTEMPT_KEY); } catch (_) { /* no-op */ }

      var currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.has(RECOVERY_QUERY_KEY)) {
        currentUrl.searchParams.delete(RECOVERY_QUERY_KEY);
        window.history.replaceState(null, document.title, currentUrl.pathname + currentUrl.search + currentUrl.hash);
      }
    }, 3000);
  });
})();
