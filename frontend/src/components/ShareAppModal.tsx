import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiShare2, FiCopy, FiCheck } from 'react-icons/fi';
import { FaWhatsapp, FaFacebookF, FaInstagram, FaTiktok } from 'react-icons/fa';

const QRCodeSVG = () => (
  <svg viewBox="0 0 100 100" className="w-full h-full text-[#00a884]" fill="currentColor">
    <path d="M5,5 h25 v25 h-25 z" fill="none" stroke="currentColor" strokeWidth="6" rx="3" />
    <rect x="12" y="12" width="11" height="11" rx="2" />
    <path d="M70,5 h25 v25 h-25 z" fill="none" stroke="currentColor" strokeWidth="6" rx="3" />
    <rect x="77" y="12" width="11" height="11" rx="2" />
    <path d="M5,70 h25 v25 h-25 z" fill="none" stroke="currentColor" strokeWidth="6" rx="3" />
    <rect x="12" y="77" width="11" height="11" rx="2" />
    <rect x="40" y="5" width="8" height="8" rx="1.5" />
    <rect x="52" y="5" width="8" height="8" rx="1.5" />
    <rect x="40" y="17" width="14" height="8" rx="1.5" />
    <rect x="58" y="17" width="8" height="14" rx="1.5" />
    <rect x="5" y="40" width="8" height="8" rx="1.5" />
    <rect x="17" y="40" width="14" height="8" rx="1.5" />
    <rect x="35" y="35" width="8" height="14" rx="1.5" />
    <rect x="47" y="35" width="14" height="8" rx="1.5" />
    <rect x="65" y="35" width="8" height="8" rx="1.5" />
    <rect x="77" y="35" width="18" height="8" rx="1.5" />
    <rect x="40" y="47" width="14" height="14" rx="1.5" />
    <rect x="58" y="47" width="8" height="8" rx="1.5" />
    <rect x="70" y="47" width="8" height="14" rx="1.5" />
    <rect x="82" y="47" width="13" height="8" rx="1.5" />
    <rect x="5" y="52" width="14" height="8" rx="1.5" />
    <rect x="23" y="52" width="8" height="14" rx="1.5" />
    <rect x="35" y="65" width="8" height="8" rx="1.5" />
    <rect x="47" y="65" width="20" height="8" rx="1.5" />
    <rect x="71" y="65" width="8" height="8" rx="1.5" />
    <rect x="83" y="65" width="12" height="14" rx="1.5" />
    <rect x="40" y="77" width="8" height="18" rx="1.5" />
    <rect x="52" y="77" width="14" height="8" rx="1.5" />
    <rect x="70" y="77" width="8" height="8" rx="1.5" />
    <rect x="52" y="89" width="8" height="6" rx="1.5" />
    <rect x="64" y="89" width="18" height="6" rx="1.5" />
    <rect x="86" y="83" width="9" height="12" rx="1.5" />
  </svg>
);

const ShareAppModal = ({ isOpen, onClose, storeName, appUrl, title = 'Compartir Aplicación', description, whatsappText, nativeShareText }) => {
  const [copied, setCopied] = React.useState(false);
  if (!isOpen) return null;

  const displayUrl = appUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const displayName = storeName || 'nuestra tienda';
  const displayDescription = description || (
    <>
      Comparte este código para que otras personas puedan acceder a la aplicación de{' '}
      <span className="font-bold text-gray-700">{displayName}</span> directamente desde su celular.
    </>
  );

  const handleCopyLink = () => {
    if (!displayUrl) return;
    navigator.clipboard.writeText(displayUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const openExternal = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleWhatsApp = () => {
    const msg = encodeURIComponent(whatsappText || `¡Hola! Te comparto el catálogo de ${displayName}: ${displayUrl}`);
    openExternal(`https://wa.me/?text=${msg}`);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: displayName, text: nativeShareText || `Mira el catálogo de ${displayName}`, url: displayUrl }).catch(() => {});
    } else {
      handleCopyLink();
    }
  };

  const handleFacebook = () => {
    openExternal(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(displayUrl)}`);
  };

  const handleInstagram = () => {
    handleCopyLink();
    openExternal('https://www.instagram.com/');
  };

  const handleTikTok = () => {
    handleCopyLink();
    openExternal('https://www.tiktok.com/upload');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-[#0f1a28]/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-[24px] shadow-2xl w-full max-w-[380px] overflow-hidden flex flex-col lg:max-w-[760px] lg:rounded-[2rem]"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 lg:px-6 lg:py-5">
              <div className="flex items-center gap-2">
                <span className="text-base">📱</span>
                <h2 className="text-sm font-bold text-gray-900 lg:text-base">{title}</h2>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
                aria-label="Cerrar modal de compartir"
              >
                <FiX className="text-lg" />
              </button>
            </div>

            <div className="p-6 flex flex-col items-center text-center lg:grid lg:grid-cols-[minmax(240px,0.92fr)_minmax(280px,1fr)] lg:items-center lg:gap-7 lg:p-7 lg:text-left">
              <div className="flex w-full flex-col items-center text-center lg:border-r lg:border-gray-100 lg:pr-7">
                <div className="w-48 h-48 bg-white border border-gray-100 rounded-3xl p-3 shadow-sm mb-4 flex items-center justify-center overflow-hidden lg:w-56 lg:h-56">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(displayUrl)}&color=0f172a`}
                    alt="QR Code"
                    className="w-full h-full object-contain"
                    onError={(event) => {
                      const image = event.currentTarget;
                      const fallback = image.nextElementSibling;
                      image.style.display = 'none';
                      if (fallback instanceof HTMLElement) fallback.style.display = 'flex';
                    }}
                  />
                  <div className="hidden w-full h-full items-center justify-center">
                    <QRCodeSVG />
                  </div>
                </div>

                <button
                  onClick={handleCopyLink}
                  className="w-full max-w-[260px] flex items-center justify-center gap-2 py-3.5 px-4 bg-white border border-gray-200 hover:bg-gray-50 transition-colors rounded-2xl shadow-sm"
                >
                  {copied
                    ? <FiCheck className="text-[#00a884] text-sm" />
                    : <FiCopy className="text-gray-500 text-sm" />}
                  <span className={`text-xs font-bold ${copied ? 'text-[#00a884]' : 'text-gray-700'}`}>
                    {copied ? '¡Enlace copiado!' : 'Copiar enlace directo'}
                  </span>
                </button>
              </div>

              <div className="w-full mt-6 lg:mt-0">
                <h3 className="text-lg font-black text-gray-900 mb-1.5 lg:text-2xl">Escanea para abrir</h3>
                <p className="text-[13px] text-gray-500 mb-6 leading-relaxed px-2 lg:px-0 lg:text-sm">
                  {displayDescription}
                </p>

                <div className="grid grid-cols-2 gap-3 w-full mb-3">
                  <button
                    onClick={handleWhatsApp}
                    className="flex flex-col items-center justify-center gap-2 bg-[#eafaf1] hover:bg-[#dcfce7] transition-colors rounded-2xl py-3.5 px-2 border border-[#bbf7d0]/50 shadow-sm"
                  >
                    <FaWhatsapp className="text-[24px] text-[#00a884]" />
                    <span className="text-[11px] font-bold text-[#00a884]">WhatsApp</span>
                  </button>

                  <button
                    onClick={handleShare}
                    className="flex flex-col items-center justify-center gap-2 bg-[#f0f9ff] hover:bg-[#e0f2fe] transition-colors rounded-2xl py-3.5 px-2 border border-[#bae6fd]/50 shadow-sm lg:hidden"
                  >
                    <FiShare2 className="text-[24px] text-[#0ea5e9]" />
                    <span className="text-[11px] font-bold text-[#0ea5e9]">Más opciones</span>
                  </button>

                  <button
                    onClick={handleFacebook}
                    className="hidden lg:flex flex-col items-center justify-center gap-2 bg-[#eef4ff] hover:bg-[#e0ebff] transition-colors rounded-2xl py-3.5 px-2 border border-[#bfd4ff]/60 shadow-sm"
                  >
                    <FaFacebookF className="text-[22px] text-[#1877f2]" />
                    <span className="text-[11px] font-bold text-[#1877f2]">Facebook</span>
                  </button>

                  <button
                    onClick={handleInstagram}
                    className="hidden lg:flex flex-col items-center justify-center gap-2 bg-[#fff1f7] hover:bg-[#ffe4ef] transition-colors rounded-2xl py-3.5 px-2 border border-[#ffc7dc]/60 shadow-sm"
                  >
                    <FaInstagram className="text-[24px] text-[#d62976]" />
                    <span className="text-[11px] font-bold text-[#d62976]">Instagram</span>
                  </button>

                  <button
                    onClick={handleTikTok}
                    className="hidden lg:flex flex-col items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 transition-colors rounded-2xl py-3.5 px-2 border border-gray-200 shadow-sm"
                  >
                    <FaTiktok className="text-[22px] text-gray-900" />
                    <span className="text-[11px] font-bold text-gray-900">TikTok</span>
                  </button>
                </div>

              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ShareAppModal;
