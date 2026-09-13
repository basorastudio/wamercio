import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SafeIcon from '../common/SafeIcon';
import StoreAvatar from '../common/StoreAvatar';
import { FiDownload, FiX } from 'react-icons/fi';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useStore } from '../context/StoreContext';

const InstallBanner = () => {
  const { isInstallable, install } = usePWAInstall();
  const { activeStore } = useStore();
  const [dismissed, setDismissed] = useState(false);

  if (!isInstallable || dismissed) return null;

  const storeName = activeStore?.name || 'WAMERCIO';
  const accent = activeStore?.color || '#00a884';
  const hasLogo = Boolean(activeStore?.logoUrl || activeStore?.logo_url);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="overflow-hidden shrink-0 border-b"
        style={{ backgroundColor: `${accent}12`, borderColor: `${accent}30` }}
      >
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center space-x-3 min-w-0">
            {hasLogo ? (
              <StoreAvatar store={activeStore} className="w-9 h-9 rounded-xl" imageClassName="w-full h-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: accent }}>
                <SafeIcon icon={FiDownload} className="text-white text-sm" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: accent }}>¡Instala {storeName}!</p>
              <p className="text-xs truncate" style={{ color: accent }}>Accede rápido desde tu pantalla de inicio</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 ml-2">
            <button
              onClick={install}
              className="text-white text-xs font-bold px-3 py-1.5 rounded-lg whitespace-nowrap"
              style={{ backgroundColor: accent }}
            >
              Instalar
            </button>
            <button onClick={() => setDismissed(true)} className="text-gray-400 p-1">
              <SafeIcon icon={FiX} className="text-base" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default InstallBanner;
