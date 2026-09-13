"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as FiIcons from "react-icons/fi";
import type { IScannerControls } from "@zxing/browser";

const { FiAlertCircle, FiCamera, FiLoader, FiX } = FiIcons;

const DEFAULT_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "itf",
  "qr_code",
  "data_matrix",
  "aztec",
  "pdf417",
];

export const normalizeBarcode = (value: unknown) =>
  String(value ?? "")
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, "")
    .trim()
    .toUpperCase();

export const isBarcodeQuery = (value: unknown) => {
  const barcode = normalizeBarcode(value);
  return (
    barcode.length >= 6 &&
    barcode.length <= 64 &&
    /\d/.test(barcode) &&
    /^[A-Z0-9._\-/]+$/.test(barcode)
  );
};

type DetectorResult = {
  rawValue?: string;
  format?: string;
};

type DetectorInstance = {
  detect: (source: ImageBitmapSource) => Promise<DetectorResult[]>;
};

type DetectorConstructor = {
  new (options?: { formats?: string[] }): DetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
};

const getDetectorConstructor = (): DetectorConstructor | null => {
  if (typeof window === "undefined") return null;
  const barcodeWindow = window as typeof window & { BarcodeDetector?: DetectorConstructor };
  return barcodeWindow.BarcodeDetector || null;
};

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export type BarcodeScannerProps = {
  open: boolean;
  onClose: () => void;
  onDetected: (barcode: string, format?: string) => void | Promise<void>;
  busy?: boolean;
};

export const BarcodeScanner = ({
  open,
  onClose,
  onDetected,
  busy = false,
}: BarcodeScannerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const nativeStreamRef = useRef<MediaStream | null>(null);
  const nativeDetectorRef = useRef<DetectorInstance | null>(null);
  const fallbackControlsRef = useRef<IScannerControls | null>(null);
  const loopRef = useRef<number | null>(null);
  const lockedRef = useRef(false);
  const mountedOpenRef = useRef(false);
  const startSequenceRef = useRef(0);
  const lastScanRef = useRef({ value: "", at: 0 });
  const [status, setStatus] = useState("Iniciando cámara...");
  const [error, setError] = useState("");
  const [cameraActive, setCameraActive] = useState(false);

  const secureContext = typeof window === "undefined" ? true : window.isSecureContext;

  const stopCamera = useCallback(() => {
    startSequenceRef.current += 1;
    if (loopRef.current !== null) window.cancelAnimationFrame(loopRef.current);
    loopRef.current = null;
    fallbackControlsRef.current?.stop();
    fallbackControlsRef.current = null;
    nativeStreamRef.current?.getTracks().forEach((track) => track.stop());
    nativeStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const emit = useCallback(
    async (rawValue: string, format = "") => {
      const barcode = normalizeBarcode(rawValue);
      if (!barcode || lockedRef.current) return;

      const now = Date.now();
      if (lastScanRef.current.value === barcode && now - lastScanRef.current.at < 1800) return;
      lastScanRef.current = { value: barcode, at: now };
      lockedRef.current = true;
      setStatus("Producto detectado. Buscando...");
      setError("");
      stopCamera();

      try {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(80);
        await onDetected(barcode, format);
      } catch (error: unknown) {
        setError(errorMessage(error, "No fue posible procesar el código detectado."));
        setStatus("No se pudo completar la búsqueda.");
      } finally {
        window.setTimeout(() => {
          lockedRef.current = false;
        }, 500);
      }
    },
    [onDetected, stopCamera],
  );

  const buildNativeDetector = useCallback(async () => {
    const Detector = getDetectorConstructor();
    if (!Detector) return null;

    try {
      let formats = DEFAULT_FORMATS;
      if (typeof Detector.getSupportedFormats === "function") {
        const available = await Detector.getSupportedFormats();
        const compatible = DEFAULT_FORMATS.filter((format) => available.includes(format));
        if (compatible.length) formats = compatible;
      }
      const detector = new Detector({ formats });
      nativeDetectorRef.current = detector;
      return detector;
    } catch (_) {
      return null;
    }
  }, []);

  const scanNativeFrame = useCallback(async () => {
    const video = videoRef.current;
    const detector = nativeDetectorRef.current;
    if (!video || !detector || !nativeStreamRef.current || lockedRef.current) return;

    try {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const results = await detector.detect(video);
        const result = results.find((item) => normalizeBarcode(item.rawValue));
        if (result?.rawValue) {
          await emit(result.rawValue, result.format || "");
          return;
        }
      }
    } catch (_) {
      // Algunos navegadores rechazan fotogramas mientras el video termina de estabilizarse.
    }

    if (mountedOpenRef.current && nativeStreamRef.current && !lockedRef.current) {
      loopRef.current = window.requestAnimationFrame(scanNativeFrame);
    }
  }, [emit]);

  const startNativeCamera = useCallback(
    async (detector: DetectorInstance, sequence: number) => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      if (sequence !== startSequenceRef.current || !mountedOpenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      nativeDetectorRef.current = detector;
      nativeStreamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraActive(true);
      setStatus("Coloca el código dentro del recuadro");
      loopRef.current = window.requestAnimationFrame(scanNativeFrame);
    },
    [scanNativeFrame],
  );

  const startFallbackCamera = useCallback(
    async (sequence: number) => {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);

      if (sequence !== startSequenceRef.current || !mountedOpenRef.current || !videoRef.current) return;

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_93,
        BarcodeFormat.CODABAR,
        BarcodeFormat.ITF,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.DATA_MATRIX,
        BarcodeFormat.AZTEC,
        BarcodeFormat.PDF_417,
      ]);

      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 80,
        delayBetweenScanSuccess: 500,
        tryPlayVideoTimeout: 5000,
      });

      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current,
        (result) => {
          if (!result || lockedRef.current) return;
          void emit(result.getText(), String(result.getBarcodeFormat()));
        },
      );

      if (sequence !== startSequenceRef.current || !mountedOpenRef.current) {
        controls.stop();
        return;
      }

      fallbackControlsRef.current = controls;
      setCameraActive(true);
      setStatus("Coloca el código dentro del recuadro");
    },
    [emit],
  );

  const startCamera = useCallback(async () => {
    setError("");
    setStatus("Iniciando cámara...");
    setCameraActive(false);

    if (!secureContext) {
      setError("La cámara necesita una conexión segura HTTPS.");
      setStatus("No fue posible iniciar la cámara");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador no permite acceder a la cámara.");
      setStatus("No fue posible iniciar la cámara");
      return;
    }

    stopCamera();
    const sequence = startSequenceRef.current;

    try {
      const nativeDetector = await buildNativeDetector();
      if (sequence !== startSequenceRef.current || !mountedOpenRef.current) return;

      if (nativeDetector) {
        await startNativeCamera(nativeDetector, sequence);
      } else {
        await startFallbackCamera(sequence);
      }
    } catch (error: unknown) {
      if (sequence !== startSequenceRef.current || !mountedOpenRef.current) return;
      stopCamera();
      const name = error instanceof DOMException ? error.name : "";
      setError(
        name === "NotAllowedError"
          ? "Permiso de cámara denegado. Habilítalo en la configuración del navegador e inténtalo nuevamente."
          : errorMessage(error, "No fue posible abrir la cámara."),
      );
      setStatus("No fue posible iniciar la cámara");
    }
  }, [buildNativeDetector, secureContext, startFallbackCamera, startNativeCamera, stopCamera]);

  useEffect(() => {
    mountedOpenRef.current = open;
    if (!open) {
      stopCamera();
      return undefined;
    }

    lockedRef.current = false;
    lastScanRef.current = { value: "", at: 0 };
    const frame = window.requestAnimationFrame(() => {
      void startCamera();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      mountedOpenRef.current = false;
      stopCamera();
    };
  }, [open, startCamera, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020617] sm:bg-transparent sm:p-6">
          <motion.button
            type="button"
            aria-label="Cerrar lector"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 hidden bg-[#020617]/75 backdrop-blur-sm sm:block"
            onClick={busy ? undefined : onClose}
          />

          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label="Escanear código de barras"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            className="relative h-[100dvh] w-full overflow-hidden bg-[#081120] shadow-2xl sm:h-[min(78vh,720px)] sm:max-w-lg sm:rounded-[2rem]"
          >
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              className="absolute inset-0 h-full w-full object-cover"
            />

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/60" />

            <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:p-5">
              <div className="inline-flex items-center gap-2 rounded-full bg-black/45 px-4 py-2 text-xs font-black text-white backdrop-blur-md">
                <FiCamera className="text-[#35d6b4]" />
                Escanear código
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-xl text-white backdrop-blur-md transition hover:bg-black/60 disabled:opacity-50"
                aria-label="Cerrar"
              >
                <FiX />
              </button>
            </div>

            <div className="pointer-events-none absolute inset-x-[8%] top-1/2 z-10 h-44 -translate-y-1/2 rounded-[1.75rem] border-2 border-[#35d6b4] shadow-[0_0_0_999px_rgba(2,6,23,0.38)] sm:inset-x-[10%] sm:h-48">
              <span className="absolute -left-0.5 -top-0.5 h-8 w-8 rounded-tl-[1.6rem] border-l-4 border-t-4 border-white" />
              <span className="absolute -right-0.5 -top-0.5 h-8 w-8 rounded-tr-[1.6rem] border-r-4 border-t-4 border-white" />
              <span className="absolute -bottom-0.5 -left-0.5 h-8 w-8 rounded-bl-[1.6rem] border-b-4 border-l-4 border-white" />
              <span className="absolute -bottom-0.5 -right-0.5 h-8 w-8 rounded-br-[1.6rem] border-b-4 border-r-4 border-white" />
              {cameraActive && <span className="absolute left-4 right-4 top-1/2 h-0.5 animate-pulse bg-[#35d6b4] shadow-[0_0_16px_#35d6b4]" />}
            </div>

            <div className="absolute inset-x-0 bottom-0 z-20 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center sm:p-6">
              {error ? (
                <div className="mx-auto flex max-w-sm items-start justify-center gap-2 rounded-2xl border border-red-400/30 bg-red-950/75 px-4 py-3 text-left text-xs font-bold leading-relaxed text-white backdrop-blur-md">
                  <FiAlertCircle className="mt-0.5 shrink-0 text-red-300" />
                  <span>{error}</span>
                </div>
              ) : (
                <div className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-black/50 px-5 py-3 text-xs font-black text-white backdrop-blur-md">
                  {(!cameraActive || busy) && <FiLoader className="animate-spin text-[#35d6b4]" />}
                  {busy ? "Buscando producto..." : status}
                </div>
              )}
            </div>
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  );
};

export default BarcodeScanner;
