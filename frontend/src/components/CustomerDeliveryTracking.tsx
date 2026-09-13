'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as FiIcons from 'react-icons/fi';
import { api } from '../lib/api';
import LiveDeliveryMap, { LiveMapDriver, MapPoint } from './LiveDeliveryMap';
import MotorcycleIcon from '../common/MotorcycleIcon';

const { FiActivity, FiClock, FiMapPin, FiNavigation, FiRefreshCw } = FiIcons;

type TrackingResponse = {
  order_id?: string;
  status?: string;
  tracking_available?: boolean;
  message?: string;
  store?: { name?: string; address?: string; lat?: number | null; lng?: number | null } | null;
  destination?: { lat?: number | null; lng?: number | null } | null;
  driver_location?: {
    lat?: number | null;
    lng?: number | null;
    accuracy?: number | null;
    heading?: number | null;
    speed?: number | null;
    updated_at?: string | null;
  } | null;
  route?: {
    coordinates?: Array<{ lat?: number | null; lng?: number | null }>;
    distance_km?: number | null;
    duration_minutes?: number | null;
    source?: string;
  } | null;
  service_area?: {
    id?: string;
    name?: string;
    type?: string;
    polygon?: Array<{ lat?: number | null; lng?: number | null }>;
    geo_geofence_id?: string;
    driver_inside?: boolean;
  } | null;
};

type Props = {
  orderId: string;
  driverName?: string;
};

const pointFrom = (value: any): MapPoint | null => {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};

const relativeUpdate = (value?: string | null) => {
  if (!value) return 'Esperando señal GPS';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Esperando señal GPS';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 10) return 'Actualizado ahora';
  if (seconds < 60) return `Actualizado hace ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `Actualizado hace ${minutes} min`;
};

export default function CustomerDeliveryTracking({ orderId, driverName = 'Tu repartidor' }: Props) {
  const [data, setData] = useState<TrackingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await api.get(`/client/orders/${encodeURIComponent(orderId)}/tracking`);
      setData(response || null);
      setError('');
    } catch (requestError: any) {
      setError(requestError?.message || 'No se pudo actualizar el seguimiento');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 8_000);
    const refresh = () => load(true);
    window.addEventListener('wamercio:delivery-tracking-updated', refresh);
    window.addEventListener('wamercio:data-changed', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('wamercio:delivery-tracking-updated', refresh);
      window.removeEventListener('wamercio:data-changed', refresh);
    };
  }, [load]);

  const store = useMemo(() => {
    const point = pointFrom(data?.store);
    return point ? { ...point, label: data?.store?.name || 'Negocio' } : null;
  }, [data?.store]);
  const destination = useMemo(() => {
    const point = pointFrom(data?.destination);
    return point ? { ...point, label: 'Tu ubicación' } : null;
  }, [data?.destination]);
  const driver = useMemo<LiveMapDriver | null>(() => {
    const point = pointFrom(data?.driver_location);
    if (!point) return null;
    return {
      ...point,
      accuracy: Number(data?.driver_location?.accuracy || 0) || null,
      heading: Number(data?.driver_location?.heading || 0) || null,
      updatedAt: data?.driver_location?.updated_at || null,
      label: driverName,
    };
  }, [data?.driver_location, driverName]);
  const route = useMemo(() => (data?.route?.coordinates || [])
    .map(pointFrom)
    .filter((point): point is MapPoint => Boolean(point)), [data?.route?.coordinates]);
  const serviceArea = useMemo(() => (data?.service_area?.polygon || [])
    .map(pointFrom)
    .filter((point): point is MapPoint => Boolean(point)), [data?.service_area?.polygon]);
  const routeSourceLabel = String(data?.route?.source || '').toLowerCase() === 'geo_rd_map'
    ? 'GEO RD MAP'
    : String(data?.route?.source || '').toLowerCase() === 'road'
      ? 'Calles'
      : 'Estimación';

  if (loading && !data) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 flex items-center justify-center gap-2 text-xs font-bold text-[#00a884]">
        <FiRefreshCw className="animate-spin" /> Preparando seguimiento en vivo…
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50 px-4 py-3">
        <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-600"><FiActivity /> Seguimiento en vivo</p>
        <button type="button" onClick={() => load()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-white text-[#00a884]" aria-label="Actualizar seguimiento">
          <FiRefreshCw className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && !data ? (
        <div className="p-5 text-center">
          <p className="text-xs font-bold text-red-500">{error}</p>
        </div>
      ) : (
        <>
          <LiveDeliveryMap
            route={route}
            polygon={serviceArea}
            store={store}
            destination={destination}
            driver={driver}
            className="h-[280px] sm:h-[340px] lg:h-[420px]"
            emptyMessage={data?.message || 'La ruta estará disponible cuando el pedido salga a entrega.'}
            showLegend={false}
          />
          <div className="grid grid-cols-1 gap-2 border-t border-gray-100 bg-white p-3 sm:grid-cols-3">
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-gray-500"><FiMapPin /> {data?.store?.name || 'Negocio'}</p>
              <p className="mt-1 text-[11px] font-bold leading-snug text-gray-700">{data?.store?.address || 'Dirección del negocio'}</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3">
              <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-blue-500"><FiNavigation /> Ruta · {routeSourceLabel}</p>
              <p className="mt-1 text-[11px] font-black text-blue-700">
                {Number(data?.route?.distance_km || 0) > 0 ? `${Number(data?.route?.distance_km).toFixed(1)} km` : 'Calculando'}
                {' · '}
                {Number(data?.route?.duration_minutes || 0) > 0 ? `${Number(data?.route?.duration_minutes)} min` : 'Tiempo pendiente'}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-600"><MotorcycleIcon className="w-3.5 h-3.5" /> {driverName}</p>
              <p className="mt-1 text-[11px] font-bold text-emerald-700">{relativeUpdate(data?.driver_location?.updated_at)}</p>
              {Number(data?.driver_location?.accuracy || 0) > 0 && <p className="mt-0.5 text-[9px] font-medium text-emerald-600">Precisión aproximada: {Math.round(Number(data?.driver_location?.accuracy))} m</p>}
            </div>
          </div>
          {serviceArea.length >= 3 && (
            <div className={`border-t px-4 py-3 text-[11px] font-bold flex items-center gap-2 ${data?.service_area?.driver_inside === false ? 'border-amber-100 bg-amber-50 text-amber-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`}>
              <FiMapPin /> {data?.service_area?.driver_inside === false ? 'El repartidor está fuera de la geocerca de esta entrega.' : `Zona de servicio: ${data?.service_area?.name || 'geocerca activa'}.`}
            </div>
          )}
          {!data?.tracking_available && (
            <div className="border-t border-amber-100 bg-amber-50 px-4 py-3 text-[11px] font-bold text-amber-700 flex items-center gap-2">
              <FiClock /> El repartidor está en ruta, pero todavía no ha enviado una ubicación GPS reciente.
            </div>
          )}
        </>
      )}
    </div>
  );
}

