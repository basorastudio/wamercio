import React from 'react';
import { motion } from 'framer-motion';
import { api, isPlatformRootHost } from '../lib/api';
import {
  brandingFromManifest,
  brandingFromStore,
  darkenStoreAccent,
  FALLBACK_STORE_ACCENT,
  persistStoreBranding,
  readCachedStoreBranding,
  type StoreBranding,
} from '../lib/storeBranding';

const PLATFORM_BRANDING: StoreBranding = {
  name: 'WAMERCIO',
  color: FALLBACK_STORE_ACCENT,
  logoUrl: '/brand/colmapro-app-icon.png',
  icon: '',
};

const TENANT_PENDING_BRANDING: StoreBranding = {
  name: 'Tu negocio',
  color: '#0f172a',
  logoUrl: '',
  icon: '🏪',
};

const looksLikeImage = (value: string) => /^(https?:|data:|blob:|\/)/i.test(value);

const LoadingScreen = ({ store = null }: { store?: any }) => {
  const storeBranding = brandingFromStore(store);
  const [browserBranding, setBrowserBranding] = React.useState<StoreBranding | null>(null);

  // The server and the browser must render exactly the same initial markup.
  // Browser-dependent host and localStorage branding is loaded only after mount.
  const branding = storeBranding || browserBranding || PLATFORM_BRANDING;
  const accent = branding.color || FALLBACK_STORE_ACCENT;
  const accentDark = darkenStoreAccent(accent, 0.28);
  const visual = branding.logoUrl || branding.icon;
  const visualIsImage = Boolean(visual && looksLikeImage(visual));

  React.useEffect(() => {
    if (storeBranding) return undefined;

    if (isPlatformRootHost()) {
      setBrowserBranding(PLATFORM_BRANDING);
      return undefined;
    }

    const cachedBranding = readCachedStoreBranding();
    setBrowserBranding(cachedBranding || TENANT_PENDING_BRANDING);

    let active = true;
    api.get('/pwa/manifest.json')
      .then((manifest) => {
        if (!active) return;
        const resolved = brandingFromManifest(manifest);
        if (!resolved) return;
        setBrowserBranding(resolved);
        persistStoreBranding(resolved);
        document.title = `${resolved.name} | WAMERCIO`;
        document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', resolved.color);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [storeBranding?.name, storeBranding?.color, storeBranding?.logoUrl]);

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center p-6"
      style={{
        backgroundColor: accent,
        backgroundImage: `linear-gradient(135deg, ${accent} 0%, ${accentDark} 100%)`,
      }}
      aria-label={`Cargando ${branding.name}`}
      aria-busy="true"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center gap-6"
      >
        <div className="w-24 h-24 bg-white/90 rounded-3xl flex items-center justify-center shadow-2xl overflow-hidden p-1">
          {visualIsImage ? (
            <img src={visual} alt={branding.name} className="w-full h-full object-cover rounded-[1.25rem]" />
          ) : (
            <span className="text-5xl" role="img" aria-label={`Icono de ${branding.name}`}>
              {visual || '🏪'}
            </span>
          )}
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-black text-white">{branding.name}</h1>
          <p className="text-white/70 text-sm mt-1">Preparando {branding.name}...</p>
        </div>
        <div className="flex gap-2 mt-2">
          {[0, 1, 2].map((index) => (
            <motion.div
              key={index}
              className="w-2.5 h-2.5 bg-white rounded-full"
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1, repeat: Infinity, delay: index * 0.2 }}
            />
          ))}
        </div>
        <p className="text-white/50 text-xs">Conectando con el servidor...</p>
      </motion.div>
    </div>
  );
};

export default LoadingScreen;
