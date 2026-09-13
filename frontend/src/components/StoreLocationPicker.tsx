import React, { useEffect, useMemo, useState } from "react";
import * as FiIcons from "react-icons/fi";
import { api } from "../lib/api";

const {
  FiCheckCircle,
  FiCrosshair,
  FiExternalLink,
  FiLoader,
  FiMap,
  FiMapPin,
  FiNavigation,
  FiTrash2,
  FiSearch,
} = FiIcons;

const coordinateValue = (value: any, ...keys: string[]) => {
  for (const key of keys) {
    const raw = value?.[key];
    if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
      return String(raw);
    }
  }
  return "";
};

const numericCoordinate = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const validCoordinates = (latitude: number | null, longitude: number | null) => (
  latitude !== null
  && longitude !== null
  && latitude >= -90
  && latitude <= 90
  && longitude >= -180
  && longitude <= 180
);

export const isStoreLocationPairValid = (value: any = {}) => {
  const latitudeText = coordinateValue(value, "latitude", "lat");
  const longitudeText = coordinateValue(value, "longitude", "lng", "lon");
  if (!latitudeText && !longitudeText) return true;
  return validCoordinates(numericCoordinate(latitudeText), numericCoordinate(longitudeText));
};

const osmEmbedURL = (latitude: number, longitude: number) => {
  const delta = 0.006;
  const bbox = [longitude - delta, latitude - delta, longitude + delta, latitude + delta]
    .map((item) => item.toFixed(6))
    .join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude}%2C${longitude}`;
};

const mapsURL = (latitude: number, longitude: number) => (
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`
);

const locationErrorMessage = (error: GeolocationPositionError) => {
  if (error.code === error.PERMISSION_DENIED) {
    return "Permite el acceso a la ubicación en el navegador para detectar el negocio.";
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "El dispositivo no pudo determinar la ubicación. Inténtalo cerca del negocio o escribe las coordenadas.";
  }
  if (error.code === error.TIMEOUT) {
    return "La ubicación tardó demasiado. Inténtalo nuevamente en un lugar con mejor señal.";
  }
  return "No se pudo obtener la ubicación del negocio.";
};

const inputClass = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-bold text-gray-700 outline-none transition focus:border-[#00a884] focus:ring-2 focus:ring-[#00a884]/20";

export default function StoreLocationPicker({ value = {}, onChange }: any) {
  const latitudeText = coordinateValue(value, "latitude", "lat");
  const longitudeText = coordinateValue(value, "longitude", "lng", "lon");
  const latitude = numericCoordinate(latitudeText);
  const longitude = numericCoordinate(longitudeText);
  const configured = validCoordinates(latitude, longitude);
  const hasCoordinateInput = Boolean(latitudeText || longitudeText);
  const incompleteCoordinates = hasCoordinateInput && !configured;
  const [locating, setLocating] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [message, setMessage] = useState("");

  const mapURL = useMemo(
    () => configured ? osmEmbedURL(latitude as number, longitude as number) : "",
    [configured, latitude, longitude],
  );

  useEffect(() => {
    if (configured && message.startsWith("No se")) setMessage("");
  }, [configured, message]);

  const emit = (patch: any) => onChange?.({
    ...patch,
    latitude: patch.latitude,
    longitude: patch.longitude,
    lat: patch.latitude,
    lng: patch.longitude,
  });

  const addressQuery = [
    value.street_number || value.streetNumber,
    value.street,
    value.neighborhood || value.sector,
    value.municipality,
    value.province,
    "República Dominicana",
  ].filter(Boolean).join(", ");

  const enrichWithGeoRDMap = async (lat: number, lng: number) => {
    try {
      const result = await api.post("/geo/reverse", { lat, lng });
      const label = String(result?.label || result?.address || "").trim();
      if (label) setMessage(`✓ Ubicación confirmada por GEO RD MAP: ${label}`);
    } catch {
      // GPS remains authoritative; GEO RD MAP reverse geocoding is a best-effort enhancement.
    }
  };

  const locateByAddress = async () => {
    if (!addressQuery || addressQuery === "República Dominicana") {
      setMessage("Completa primero la dirección del negocio para ubicarla con GEO RD MAP.");
      return;
    }
    setGeocoding(true);
    setMessage("");
    try {
      const result = await api.post("/geo/geocode", { query: addressQuery });
      const nextLatitude = Number(result?.lat ?? result?.latitude);
      const nextLongitude = Number(result?.lng ?? result?.longitude);
      if (!validCoordinates(nextLatitude, nextLongitude)) throw new Error("GEO RD MAP no devolvió coordenadas válidas.");
      emit({
        latitude: Number(nextLatitude.toFixed(6)),
        longitude: Number(nextLongitude.toFixed(6)),
        locationAccuracy: null,
        location_accuracy: null,
        locationSource: "geo_rd_map",
        location_source: "geo_rd_map",
        locationUpdatedAt: new Date().toISOString(),
        location_updated_at: new Date().toISOString(),
      });
      setMessage(`✓ Dirección localizada con GEO RD MAP${result?.label ? `: ${result.label}` : "."}`);
    } catch (error: any) {
      setMessage(error?.message || "GEO RD MAP no pudo localizar esa dirección. Usa el GPS o ajusta las coordenadas.");
    } finally {
      setGeocoding(false);
    }
  };

  const useCurrentLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setMessage("Este navegador no permite obtener la ubicación automáticamente.");
      return;
    }
    setLocating(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLatitude = Number(position.coords.latitude.toFixed(6));
        const nextLongitude = Number(position.coords.longitude.toFixed(6));
        const updatedAt = new Date().toISOString();
        const accuracy = Math.round(position.coords.accuracy || 0);
        emit({
          latitude: nextLatitude,
          longitude: nextLongitude,
          locationAccuracy: accuracy,
          location_accuracy: accuracy,
          locationSource: "device",
          location_source: "device",
          locationUpdatedAt: updatedAt,
          location_updated_at: updatedAt,
        });
        setMessage("✓ Ubicación detectada. GEO RD MAP está confirmando el punto…");
        setLocating(false);
        void enrichWithGeoRDMap(nextLatitude, nextLongitude);
      },
      (error) => {
        setMessage(locationErrorMessage(error));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 18000, maximumAge: 0 },
    );
  };

  const updateCoordinate = (field: "latitude" | "longitude", raw: string) => {
    const cleaned = raw.replace(/[^0-9.-]/g, "").replace(/(?!^)-/g, "");
    const [whole = "", ...decimals] = cleaned.split(".");
    const sanitized = decimals.length ? `${whole}.${decimals.join("")}` : whole;
    const nextLatitude = field === "latitude" ? sanitized : latitudeText;
    const nextLongitude = field === "longitude" ? sanitized : longitudeText;
    emit({
      latitude: nextLatitude,
      longitude: nextLongitude,
      locationAccuracy: null,
      location_accuracy: null,
      locationSource: "manual",
      location_source: "manual",
      locationUpdatedAt: new Date().toISOString(),
      location_updated_at: new Date().toISOString(),
    });
    setMessage("");
  };

  const clearLocation = () => {
    emit({
      latitude: "",
      longitude: "",
      locationAccuracy: null,
      location_accuracy: null,
      locationSource: "",
      location_source: "",
      locationUpdatedAt: null,
      location_updated_at: null,
    });
    setMessage("Ubicación eliminada. Guarda los cambios para confirmar.");
  };

  const accuracy = Number(value.locationAccuracy ?? value.location_accuracy ?? 0);
  const locationSource = String(value.locationSource || value.location_source || "").trim();
  const sourceLabel = locationSource === "device" ? "Detectada por GPS" : locationSource === "geo_rd_map" ? "GEO RD MAP" : "Coordenadas configuradas";

  return (
    <div className="rounded-2xl border border-[#00a884]/20 bg-[#f0fbf8] p-3.5 sm:p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-white border border-[#00a884]/15 text-[#00a884] flex items-center justify-center shrink-0">
            <FiMapPin />
          </span>
          <div>
            <p className="text-xs font-black text-gray-800">Ubicación GPS del negocio</p>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
              Se utiliza como punto inicial de las rutas, para calcular cercanía y mejorar el sistema de entregas.
            </p>
          </div>
        </div>
        <span className={`self-start rounded-full px-2.5 py-1 text-[9px] font-black flex items-center gap-1 ${configured ? "bg-white text-[#00a884] border border-[#00a884]/20" : "bg-amber-50 text-amber-600 border border-amber-100"}`}>
          {configured ? <FiCheckCircle /> : <FiMap />}
          {configured ? sourceLabel : "Sin configurar"}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button type="button" onClick={useCurrentLocation} disabled={locating || geocoding}
          className="rounded-xl bg-[#00a884] text-white px-4 py-3 text-xs font-black flex items-center justify-center gap-2 shadow-sm disabled:opacity-60">
          {locating ? <FiLoader className="animate-spin" /> : <FiCrosshair />}
          {locating ? "Detectando…" : "Usar GPS actual"}
        </button>
        <button type="button" onClick={locateByAddress} disabled={locating || geocoding}
          className="rounded-xl bg-white border border-[#00a884]/20 text-[#00a884] px-4 py-3 text-xs font-black flex items-center justify-center gap-2 disabled:opacity-60">
          {geocoding ? <FiLoader className="animate-spin" /> : <FiSearch />}
          {geocoding ? "Localizando…" : "Ubicar con GEO RD MAP"}
        </button>
        {configured ? (
          <a href={mapsURL(latitude as number, longitude as number)} target="_blank" rel="noreferrer"
            className="rounded-xl bg-white border border-gray-200 text-gray-700 px-4 py-3 text-xs font-black flex items-center justify-center gap-2">
            <FiExternalLink /> Ver punto exacto
          </a>
        ) : (
          <div className="rounded-xl bg-white/70 border border-dashed border-[#00a884]/20 text-gray-400 px-4 py-3 text-[10px] font-bold flex items-center justify-center gap-2 text-center">
            <FiNavigation /> GPS o geocodificación central
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label>
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Latitud</span>
          <input
            type="text"
            inputMode="decimal"
            value={latitudeText}
            onChange={(event) => updateCoordinate("latitude", event.target.value)}
            placeholder="Ej. 18.486100"
            className={inputClass}
          />
        </label>
        <label>
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Longitud</span>
          <input
            type="text"
            inputMode="decimal"
            value={longitudeText}
            onChange={(event) => updateCoordinate("longitude", event.target.value)}
            placeholder="Ej. -69.931200"
            className={inputClass}
          />
        </label>
      </div>

      {configured && (
        <div className="overflow-hidden rounded-2xl border border-white bg-white shadow-sm">
          <div className="h-44 sm:h-52 bg-gray-100">
            <iframe
              title="Ubicación del negocio"
              src={mapURL}
              className="w-full h-full border-0"
              loading="lazy"
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2.5 border-t border-gray-100">
            <div>
              <p className="text-[10px] font-black text-gray-700">{Number(latitude).toFixed(6)}, {Number(longitude).toFixed(6)}</p>
              <p className="text-[9px] text-gray-400">
                {accuracy > 0 ? `Precisión aproximada: ${Math.round(accuracy)} m` : "Punto configurado manualmente"}
              </p>
            </div>
            <button
              type="button"
              onClick={clearLocation}
              className="text-[10px] font-black text-red-500 flex items-center justify-center gap-1 rounded-lg bg-red-50 px-3 py-2"
            >
              <FiTrash2 /> Quitar ubicación
            </button>
          </div>
        </div>
      )}

      {incompleteCoordinates && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-[10px] font-bold text-amber-700">
          Completa una latitud y una longitud válidas, o elimina ambos valores.
        </div>
      )}

      {message && (
        <div className={`rounded-xl px-3 py-2 text-[10px] font-bold ${message.startsWith("✓") ? "bg-white text-[#008f72] border border-[#00a884]/15" : "bg-amber-50 text-amber-700 border border-amber-100"}`}>
          {message}
        </div>
      )}

      <p className="text-[9px] text-gray-400 leading-relaxed">
        Las coordenadas quedan guardadas únicamente para este negocio y se utilizan para calcular rutas, distancias y puntos de salida.
      </p>
    </div>
  );
}
