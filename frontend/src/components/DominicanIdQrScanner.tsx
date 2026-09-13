import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import { DominicanIdQrData, parseDominicanIdQr } from '../lib/dominicanIdQr';

const { FiCamera, FiX, FiLoader, FiAlertCircle, FiMaximize } = FiIcons;

type DominicanIdQrScannerProps = {
  onScan: (data: DominicanIdQrData) => void;
  disabled?: boolean;
};

const stopStream = (stream?: MediaStream | null) => {
  stream?.getTracks?.().forEach((track) => track.stop());
};

const getQrDetector = async () => {
  if (typeof window === 'undefined') return null;
  const BarcodeDetectorConstructor = (window as any).BarcodeDetector;
  if (!BarcodeDetectorConstructor) return null;

  try {
    const supportedFormats = await BarcodeDetectorConstructor.getSupportedFormats?.();
    if (Array.isArray(supportedFormats) && !supportedFormats.includes('qr_code')) return null;
    return new BarcodeDetectorConstructor({ formats: ['qr_code'] });
  } catch (_) {
    try {
      return new BarcodeDetectorConstructor({ formats: ['qr_code'] });
    } catch (error) {
      return null;
    }
  }
};

const DominicanIdQrScanner = ({ onScan, disabled = false }: DominicanIdQrScannerProps) => {
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [hasCamera, setHasCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);

  const closeScanner = () => {
    if (loopRef.current) {
      window.cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }
    stopStream(streamRef.current);
    streamRef.current = null;
    setStarting(false);
    setHasCamera(false);
    setOpen(false);
  };

  const applyRawValue = (rawValue: string) => {
    const parsed = parseDominicanIdQr(rawValue);
    if (!parsed) {
      setError('QR no válido. Alinea el código y vuelve a intentarlo.');
      return false;
    }

    onScan(parsed);
    closeScanner();
    return true;
  };

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;

    const startCamera = async () => {
      setStarting(true);
      setError('');
      setHasCamera(false);

      const detector = await getQrDetector();
      if (cancelled) return;

      if (!detector) {
        setStarting(false);
        setError('Este navegador no puede leer códigos QR desde la cámara.');
        return;
      }

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('Este dispositivo no permite abrir la cámara desde el navegador.');
          setStarting(false);
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stopStream(stream);
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setHasCamera(true);
        setStarting(false);

        const scan = async () => {
          if (cancelled || !videoRef.current) return;

          try {
            const results = await detector.detect(videoRef.current);
            const rawValue = results?.[0]?.rawValue || results?.[0]?.raw || '';
            if (rawValue && applyRawValue(rawValue)) return;
          } catch (_) {
          }

          loopRef.current = window.requestAnimationFrame(scan);
        };

        loopRef.current = window.requestAnimationFrame(scan);
      } catch (_) {
        if (!cancelled) {
          setStarting(false);
          setHasCamera(false);
          setError('No se pudo abrir la cámara. Revisa los permisos e intenta nuevamente.');
        }
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      if (loopRef.current) {
        window.cancelAnimationFrame(loopRef.current);
        loopRef.current = null;
      }
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(''); setOpen(true); }}
        disabled={disabled}
        className="md:hidden h-[50px] shrink-0 inline-flex items-center justify-center gap-2 rounded-xl border border-[#00a884]/25 bg-[#f0fdf8] px-3 text-[#00a884] font-black text-xs hover:bg-[#e2fbf1] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        title="Escanear cédula"
        aria-label="Escanear cédula"
      >
        <FiCamera size={16} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 backdrop-blur-sm px-4 py-6"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden"
            >
              <button
                type="button"
                onClick={closeScanner}
                className="absolute right-4 top-4 z-20 w-11 h-11 rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-700 flex items-center justify-center transition-all"
                aria-label="Cerrar escáner"
              >
                <FiX size={22} />
              </button>

              <div className="p-5 pb-4 border-b border-gray-100">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#00a884]">Escáner de cédula</p>
                <h3 className="mt-1 text-2xl font-black text-gray-800">Escanear QR</h3>
                <p className="mt-1 text-sm text-gray-400 pr-12">Alinea el código QR del reverso de la cédula dentro del recuadro.</p>
              </div>

              <div className="p-5 space-y-4">
                <div className="relative overflow-hidden rounded-3xl border border-gray-200 bg-gray-950 aspect-[3/4] flex items-center justify-center">
                  <video ref={videoRef} muted playsInline className={`w-full h-full object-cover ${hasCamera ? 'block' : 'hidden'}`} />

                  {!hasCamera && (
                    <div className="text-center px-8">
                      {starting ? (
                        <>
                          <FiLoader className="mx-auto animate-spin text-white/80" size={30} />
                          <p className="mt-3 text-sm font-bold text-white/80">Abriendo cámara...</p>
                        </>
                      ) : (
                        <>
                          <FiCamera className="mx-auto text-white/60" size={34} />
                          <p className="mt-3 text-sm font-bold text-white/70">Cámara no disponible</p>
                        </>
                      )}
                    </div>
                  )}

                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/35" />

                  <div className="pointer-events-none absolute left-5 right-5 top-1/2 -translate-y-1/2 aspect-[1.58/1] rounded-[28px] border-2 border-white/70 shadow-[0_0_0_999px_rgba(0,0,0,0.22)]">
                    <span className="absolute -left-1 -top-1 h-10 w-10 rounded-tl-[30px] border-l-4 border-t-4 border-[#00a884]" />
                    <span className="absolute -right-1 -top-1 h-10 w-10 rounded-tr-[30px] border-r-4 border-t-4 border-[#00a884]" />
                    <span className="absolute -bottom-1 -left-1 h-10 w-10 rounded-bl-[30px] border-b-4 border-l-4 border-[#00a884]" />
                    <span className="absolute -bottom-1 -right-1 h-10 w-10 rounded-br-[30px] border-b-4 border-r-4 border-[#00a884]" />

                    <div className="absolute left-[42%] top-[18%] h-[34%] aspect-square -translate-x-1/2 rounded-2xl border-2 border-white bg-black/15">
                      <span className="absolute -left-1 -top-1 h-6 w-6 rounded-tl-2xl border-l-4 border-t-4 border-[#00a884]" />
                      <span className="absolute -right-1 -top-1 h-6 w-6 rounded-tr-2xl border-r-4 border-t-4 border-[#00a884]" />
                      <span className="absolute -bottom-1 -left-1 h-6 w-6 rounded-bl-2xl border-b-4 border-l-4 border-[#00a884]" />
                      <span className="absolute -bottom-1 -right-1 h-6 w-6 rounded-br-2xl border-b-4 border-r-4 border-[#00a884]" />
                      <FiMaximize className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/85" size={22} />
                    </div>
                  </div>

                  <div className="pointer-events-none absolute bottom-4 left-5 right-5 rounded-2xl bg-black/45 px-4 py-3 text-center backdrop-blur-sm">
                    <p className="text-xs font-black text-white">Coloca el QR dentro del recuadro pequeño</p>
                  </div>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs text-red-600"
                    >
                      <FiAlertCircle className="mt-0.5 shrink-0" />
                      <span className="font-semibold leading-relaxed">{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default DominicanIdQrScanner;
