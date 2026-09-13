'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as FiIcons from 'react-icons/fi';
import LiveDeliveryMap, { MapPoint } from '../components/LiveDeliveryMap';
import MotorcycleIcon from '../common/MotorcycleIcon';
import { useStore } from '../context/StoreContext';
import { api } from '../lib/api';
import {
  customerCallUrl,
  customerWhatsAppUrl,
  deliveryAddress,
  deliveryCoordinates,
  deliveryStatusLabel,
  navigationUrl,
} from '../lib/delivery';

const {
  FiActivity, FiPackage, FiClock, FiAlertCircle, FiRefreshCw,
  FiPhone, FiMessageCircle, FiNavigation, FiMapPin, FiWifi, FiWifiOff,
  FiUser, FiHome,
} = FiIcons;

const numberValue = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const pointFrom = (value: any): MapPoint | null => {
  const lat = numberValue(value?.lat ?? value?.latitude);
  const lng = numberValue(value?.lng ?? value?.longitude);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};

const routePoints = (delivery: any): MapPoint[] => (
  Array.isArray(delivery?.route?.coordinates)
    ? delivery.route.coordinates.map(pointFrom).filter(Boolean) as MapPoint[]
    : []
);

const timeAgo = (value: any) => {
  if (!value) return 'Sin actualización';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin actualización';
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 10) return 'Ahora mismo';
  if (seconds < 60) return `Hace ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Hace ${minutes} min`;
  return date.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
};

const assignedDriverName = (delivery: any) => (
  delivery?.assignedDriver?.full_name
  || delivery?.assigned_driver?.full_name
  || delivery?.assignedDriver?.name
  || delivery?.assigned_driver?.name
  || 'Sin repartidor'
);

const statusTone = (status: string) => ({
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  preparing: 'bg-blue-50 text-blue-700 border-blue-200',
  ready_for_delivery: 'bg-violet-50 text-violet-700 border-violet-200',
  on_the_way: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  issue: 'bg-red-50 text-red-700 border-red-200',
}[status] || 'bg-gray-50 text-gray-700 border-gray-200');

export default function AdminDeliveries({ embedded = false }: { embedded?: boolean }) {
  const { activeStoreId } = useStore();
  const [snapshot, setSnapshot] = useState<any>({ deliveries: [], drivers: [], summary: {} });
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [routeDetail, setRouteDetail] = useState<any>(null);
  const refreshTimer = useRef<number | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!activeStoreId) return;
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const data = await api.get(`/delivery/live?store_id=${encodeURIComponent(activeStoreId)}`);
      setSnapshot(data || { deliveries: [], drivers: [], summary: {} });
      setError('');
      const deliveries = Array.isArray(data?.deliveries) ? data.deliveries : [];
      setSelectedId((current) => deliveries.some((item: any) => item.id === current) ? current : (deliveries[0]?.id || ''));
    } catch (caught: any) {
      setError(caught?.message || 'No se pudo cargar la operación de entrega');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeStoreId]);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(() => refresh(true), 8000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const tenant = api.getAdminTenant();
    const source = new EventSource(api.eventUrl('/events', tenant ? { tenant } : {}));
    const scheduleRefresh = () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => refresh(true), 350);
    };
    const events = [
      'delivery_tracking_updated', 'delivery_assigned', 'delivery_accepted',
      'delivery_route_optimized', 'order_status_changed', 'order_created',
    ];
    events.forEach((eventName) => source.addEventListener(eventName, scheduleRefresh));
    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      events.forEach((eventName) => source.removeEventListener(eventName, scheduleRefresh));
      source.close();
    };
  }, [refresh]);


  useEffect(() => {
    let alive = true;
    if (!selectedId) {
      setRouteDetail(null);
      return undefined;
    }
    api.get(`/delivery/orders/${selectedId}/route`)
      .then((data) => { if (alive) setRouteDetail(data); })
      .catch(() => { if (alive) setRouteDetail(null); });
    return () => { alive = false; };
  }, [selectedId]);

  const deliveries = Array.isArray(snapshot?.deliveries) ? snapshot.deliveries : [];
  const selected = deliveries.find((delivery: any) => delivery.id === selectedId) || deliveries[0] || null;
  const summary = snapshot?.summary || {};
  const storePoint = pointFrom(routeDetail?.store) || pointFrom(selected?.storeLocation || selected?.store_location);
  const destinationPoint = pointFrom(routeDetail?.destination) || (selected ? deliveryCoordinates(selected) : null);
  const driverRaw = selected?.driverLocation || selected?.driver_location;
  const driverPoint = pointFrom(driverRaw);
  const selectedRoute = routePoints(routeDetail || selected);
  const serviceArea = selected?.serviceArea || selected?.service_area || null;
  const serviceAreaPolygon = Array.isArray(serviceArea?.polygon)
    ? serviceArea.polygon.map(pointFrom).filter(Boolean) as MapPoint[]
    : [];
  const driverInsideServiceArea = serviceArea?.driver_inside;
  const driverUpdatedAt = driverRaw?.updated_at || driverRaw?.updatedAt;
  const isLive = Boolean(driverPoint) && selected?.tracking_state !== 'offline';

  const stats = useMemo(() => [
    { label: 'Pendientes', value: Number(summary.pending || 0) + Number(summary.preparing || 0), icon: FiPackage, tone: 'bg-amber-50 text-amber-600' },
    { label: 'Listas', value: Number(summary.ready_for_delivery || 0), icon: FiClock, tone: 'bg-violet-50 text-violet-600' },
    { label: 'En ruta', value: Number(summary.on_the_way || 0), icon: MotorcycleIcon, tone: 'bg-emerald-50 text-emerald-600' },
    { label: 'Repartidores en línea', value: Number(summary.drivers_online || 0), icon: FiActivity, tone: 'bg-blue-50 text-blue-600' },
  ], [summary]);

  return (
    <div className={embedded ? 'space-y-5 min-h-full' : 'p-4 lg:p-8 xl:p-10 space-y-5 min-h-full'}>
      {embedded ? (
        <div className="flex justify-end">
          <button onClick={() => refresh(true)} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#00a884] text-white px-4 py-3 text-xs font-black shadow-sm disabled:opacity-60">
            <FiRefreshCw className={refreshing ? 'animate-spin' : ''} /> Actualizar operación
          </button>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#00a884]">Centro de operaciones</p>
            <h1 className="text-2xl lg:text-3xl font-black text-gray-900 mt-1">Entregas en vivo</h1>
            <p className="text-sm text-gray-500 mt-1">Supervisa la ruta, el estado y la ubicación actual de cada repartidor.</p>
          </div>
          <button onClick={() => refresh(true)} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#00a884] text-white px-4 py-3 text-xs font-black shadow-sm disabled:opacity-60">
            <FiRefreshCw className={refreshing ? 'animate-spin' : ''} /> Actualizar operación
          </button>
        </div>
      )}

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {stats.map((item) => <div key={item.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${item.tone}`}><item.icon className="text-xl" /></span>
          <div><p className="text-2xl font-black text-gray-900 leading-none">{item.value}</p><p className="text-[10px] font-bold text-gray-500 mt-1">{item.label}</p></div>
        </div>)}
      </div>

      {loading ? (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm min-h-[520px] flex items-center justify-center">
          <FiRefreshCw className="text-3xl text-[#00a884] animate-spin" />
        </div>
      ) : !deliveries.length ? (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm py-20 text-center">
          <MotorcycleIcon className="w-12 h-12 text-gray-200 mx-auto" />
          <h2 className="font-black text-gray-700 mt-4">No hay entregas activas</h2>
          <p className="text-sm text-gray-400 mt-1">Los pedidos pendientes, listos y en ruta aparecerán aquí automáticamente.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          <aside className="xl:col-span-4 space-y-3 xl:max-h-[690px] xl:overflow-y-auto scrollbar-hide pr-0 xl:pr-1">
            {deliveries.map((delivery: any) => {
              const status = String(delivery.status || 'pending');
              const active = selected?.id === delivery.id;
              const live = Boolean(delivery?.driverLocation || delivery?.driver_location) && delivery.tracking_state !== 'offline';
              return <button key={delivery.id} onClick={() => setSelectedId(delivery.id)} className={`w-full text-left bg-white rounded-2xl border p-4 shadow-sm transition ${active ? 'border-[#00a884] ring-2 ring-[#00a884]/10' : 'border-gray-100 hover:border-gray-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="font-black text-gray-900 truncate">{delivery.customer || 'Cliente'}</p><p className="text-[10px] text-gray-400 mt-0.5">#{delivery.orderNumber || delivery.order_number || String(delivery.id).slice(0, 6).toUpperCase()}</p></div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black ${statusTone(status)}`}>{deliveryStatusLabel(status)}</span>
                </div>
                <p className="text-xs text-gray-500 mt-3 line-clamp-2 flex items-start gap-1.5"><FiMapPin className="text-[#00a884] mt-0.5 shrink-0" /> {deliveryAddress(delivery)}</p>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
                  <span className="text-[10px] font-bold text-gray-600 flex items-center gap-1.5"><FiUser /> {assignedDriverName(delivery)}</span>
                  <span className={`text-[9px] font-black flex items-center gap-1 ${live ? 'text-emerald-600' : 'text-gray-400'}`}>{live ? <FiWifi /> : <FiWifiOff />}{live ? 'En vivo' : 'Sin señal'}</span>
                </div>
              </button>;
            })}
          </aside>

          <section className="xl:col-span-8 bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-black text-gray-900 text-lg">{selected?.customer || 'Cliente'}</h2>
                  <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${statusTone(String(selected?.status || ''))}`}>{deliveryStatusLabel(String(selected?.status || ''))}</span>
                  <span className={`rounded-full px-2 py-1 text-[9px] font-black flex items-center gap-1 ${isLive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{isLive ? <FiWifi /> : <FiWifiOff />}{isLive ? 'Seguimiento activo' : 'Ubicación no disponible'}</span>
                  {serviceArea && <span className={`rounded-full px-2 py-1 text-[9px] font-black ${driverInsideServiceArea === false ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{driverInsideServiceArea === false ? 'Fuera de geocerca' : 'Geocerca activa'}</span>}
                </div>
                <p className="text-xs text-gray-500 mt-1">{assignedDriverName(selected)} · {timeAgo(driverUpdatedAt)}</p>
              </div>
              <div className="flex gap-2">
                {customerCallUrl(selected) && <a href={customerCallUrl(selected)} className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center text-gray-600" title="Llamar"><FiPhone /></a>}
                {customerWhatsAppUrl(selected) && <a href={customerWhatsAppUrl(selected)} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600" title="WhatsApp"><FiMessageCircle /></a>}
                <a href={navigationUrl(selected)} target="_blank" rel="noreferrer" className="h-10 rounded-xl bg-blue-50 border border-blue-200 px-3 flex items-center gap-2 text-xs font-black text-blue-600"><FiNavigation /> Navegar</a>
              </div>
            </div>

            <LiveDeliveryMap
              className="h-[390px] lg:h-[520px]"
              route={selectedRoute}
              polygon={serviceAreaPolygon}
              store={storePoint ? { ...storePoint, label: selected?.storeLocation?.name || selected?.store_location?.name || 'Negocio' } : null}
              destination={destinationPoint ? { ...destinationPoint, label: selected?.customer || 'Cliente' } : null}
              driver={driverPoint ? {
                ...driverPoint,
                heading: numberValue(driverRaw?.heading),
                accuracy: numberValue(driverRaw?.accuracy),
                updatedAt: driverUpdatedAt,
                label: assignedDriverName(selected),
              } : null}
              emptyMessage="Configura la ubicación del negocio y la ubicación GPS del cliente para activar el mapa operativo."
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-gray-50 border-t border-gray-100">
              <div className="bg-white rounded-2xl border border-gray-100 p-3 flex gap-3"><span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center"><FiHome /></span><div><p className="text-[9px] uppercase tracking-wide font-black text-gray-500">{routeDetail?.store?.name || selected?.storeLocation?.name || selected?.store_location?.name || 'Negocio'}</p><p className="text-xs font-bold text-gray-700 mt-1 line-clamp-2">{routeDetail?.store?.address || selected?.storeLocation?.address || selected?.store_location?.address || 'Ubicación del negocio'}</p></div></div>
              <div className="bg-white rounded-2xl border border-gray-100 p-3 flex gap-3"><span className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><FiNavigation /></span><div><p className="text-[9px] uppercase tracking-wide font-black text-gray-400">Ruta estimada</p><p className="text-xs font-bold text-gray-700 mt-1">{routeDetail?.route?.distance_km || selected?.route?.distance_km || 0} km · {routeDetail?.route?.duration_minutes || selected?.route?.duration_minutes || 0} min</p><p className="text-[9px] text-gray-400 mt-0.5">{routeDetail?.route?.source === 'geo_rd_map' ? 'Routing · GEO RD MAP' : routeDetail?.route?.source === 'road' ? 'Trazado por calles' : 'Trazado aproximado'}</p></div></div>
              <div className="bg-white rounded-2xl border border-gray-100 p-3 flex gap-3"><span className={`w-9 h-9 rounded-xl flex items-center justify-center ${isLive ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{isLive ? <FiActivity /> : <FiAlertCircle />}</span><div><p className="text-[9px] uppercase tracking-wide font-black text-gray-400">Repartidor</p><p className="text-xs font-bold text-gray-700 mt-1">{isLive ? 'Transmitiendo ubicación' : 'Esperando señal GPS'}</p><p className="text-[9px] text-gray-400 mt-0.5">Precisión: {driverRaw?.accuracy ? `${Math.round(Number(driverRaw.accuracy))} m` : 'No disponible'}</p></div></div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
