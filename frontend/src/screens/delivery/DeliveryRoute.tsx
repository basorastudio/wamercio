'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from '@/lib/navigation';
import LiveDeliveryMap, { MapPoint } from '../../components/LiveDeliveryMap';
import MotorcycleIcon from '../../common/MotorcycleIcon';
import { useStore } from '../../context/StoreContext';
import { api } from '../../lib/api';
import { appDateKey } from '../../lib/timezone';
import {
  customerCallUrl, customerWhatsAppUrl, deliveryAddress, deliveryCoordinates,
  isDeliveryAccepted, isDeliveryOrder, multiStopNavigationUrl, navigationUrl, storeCoordinates,
} from '../../lib/delivery';
import * as FiIcons from 'react-icons/fi';

const { FiMap, FiNavigation, FiClock, FiPackage, FiZap, FiPhone, FiMessageCircle, FiRefreshCw, FiActivity } = FiIcons;
const fmt = (value: unknown) => Number(value || 0).toLocaleString('es-DO');

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

const currentPosition = () => new Promise<any>((resolve) => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({});
  navigator.geolocation.getCurrentPosition(
    (position) => resolve({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy || 0,
      heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
      updatedAt: new Date().toISOString(),
    }),
    () => resolve({}),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 },
  );
});

export default function DeliveryRoute() {
  const { sales = [], optimizeDeliveryRoute, activeStore } = useStore();
  const [selectedId, setSelectedId] = useState('');
  const [routeStats, setRouteStats] = useState({ distance: 0, minutes: 0, startSource: '' });
  const [routePlan, setRoutePlan] = useState<any>(null);
  const [liveLocation, setLiveLocation] = useState<any>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState('');

  const stops = useMemo(() => sales
    .filter((sale) => (sale.orderType || sale.order_type) === 'customer' && isDeliveryOrder(sale))
    .filter((sale) => sale.status === 'on_the_way' || (sale.status === 'ready_for_delivery' && isDeliveryAccepted(sale)))
    .sort((a, b) => Number(a.routePosition || a.route_position || 999999) - Number(b.routePosition || b.route_position || 999999)), [sales]);
  const selected = stops.find((stop) => stop.id === selectedId) || stops[0] || null;

  useEffect(() => {
    const handler = (event: Event) => setLiveLocation((event as CustomEvent).detail || null);
    window.addEventListener('colmapro:driver-location', handler);
    currentPosition().then((position) => {
      if (pointFrom(position)) setLiveLocation(position);
    });
    return () => window.removeEventListener('colmapro:driver-location', handler);
  }, []);

  useEffect(() => {
    let alive = true;
    if (!selected?.id) {
      setRoutePlan(null);
      return undefined;
    }
    api.get(`/delivery/orders/${selected.id}/route`)
      .then((response) => {
        if (!alive) return;
        setRoutePlan(response);
        const backendLocation = response?.driver_location || response?.driverLocation;
        if (!liveLocation && pointFrom(backendLocation)) setLiveLocation(backendLocation);
      })
      .catch(() => { if (alive) setRoutePlan(null); });
    return () => { alive = false; };
  }, [selected?.id]);

  const deliveredToday = useMemo(() => {
    const today = appDateKey(new Date().toISOString());
    return sales.filter((sale) => isDeliveryOrder(sale) && sale.status === 'delivered'
      && appDateKey(sale.deliveredAt || sale.delivered_at || sale.date) === today).length;
  }, [sales]);
  const total = deliveredToday + stops.length;
  const progress = total ? Math.round((deliveredToday / total) * 100) : 0;
  const routeStartsAtStore = stops.length > 0 && stops.every((stop) => stop.status === 'ready_for_delivery');
  const routeUrl = multiStopNavigationUrl(stops, routeStartsAtStore ? storeCoordinates(activeStore) : pointFrom(liveLocation));

  const selectedRoute = useMemo(() => (
    Array.isArray(routePlan?.route?.coordinates)
      ? routePlan.route.coordinates.map(pointFrom).filter(Boolean) as MapPoint[]
      : []
  ), [routePlan]);
  const mapStore = pointFrom(routePlan?.store) || storeCoordinates(activeStore);
  const mapDestination = pointFrom(routePlan?.destination) || (selected ? deliveryCoordinates(selected) : null);
  const serviceArea = routePlan?.service_area || routePlan?.serviceArea || null;
  const serviceAreaPolygon = Array.isArray(serviceArea?.polygon)
    ? serviceArea.polygon.map(pointFrom).filter(Boolean) as MapPoint[]
    : [];
  const mapDriver = pointFrom(liveLocation);
  const shownDistance = routeStats.distance || Number(routePlan?.route?.distance_km || 0);
  const shownMinutes = routeStats.minutes || Number(routePlan?.route?.duration_minutes || 0);

  const optimize = async () => {
    if (!stops.length) return;
    setOptimizing(true);
    setError('');
    try {
      const location = pointFrom(liveLocation) ? liveLocation : await currentPosition();
      const response = await optimizeDeliveryRoute(location);
      setRouteStats({
        distance: Number(response?.distance_km || 0),
        minutes: Number(response?.estimated_minutes || 0),
        startSource: String(response?.start_source || ''),
      });
      if (Array.isArray(response?.orders) && response.orders[0]?.id) setSelectedId(response.orders[0].id);
    } catch (caught: any) {
      setError(caught?.message || 'No se pudo optimizar la ruta');
    } finally {
      setOptimizing(false);
    }
  };

  return (
    <div className="w-full max-w-md lg:max-w-7xl mx-auto p-4 lg:p-8 xl:p-10 space-y-4 lg:space-y-6 pb-24 lg:pb-10">
      <div className="flex items-center justify-between mt-1 gap-3">
        <div><p className="hidden lg:block text-xs font-black uppercase tracking-[0.22em] text-[#00a884]">Ruta de entrega</p><h2 className="font-black text-gray-800 text-lg lg:text-3xl mt-1">Mi ruta de hoy</h2><p className="hidden lg:block text-sm text-gray-500 mt-1">Sigue la ruta trazada y comparte tu posición en tiempo real con el negocio.</p></div>
        <button onClick={optimize} disabled={!stops.length || optimizing} className="flex items-center gap-2 px-3 py-2 lg:px-4 rounded-xl text-xs font-black bg-[#00a884] text-white disabled:bg-gray-200 disabled:text-gray-400 shadow-sm"><FiZap />{optimizing ? 'Optimizando…' : 'Optimizar'}</button>
      </div>
      {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="bg-[#1a2332] rounded-3xl p-5 lg:p-6 text-white shadow-lg lg:col-span-5 xl:col-span-4">
          <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><MotorcycleIcon className="w-5 h-5 text-[#00a884]" /><p className="font-black text-base lg:text-lg">Resumen de ruta</p></div><span className="text-[10px] bg-white/10 px-2 py-1 rounded-full font-bold">{stops.length} parada(s)</span></div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[{ label: 'Distancia', value: shownDistance ? `${shownDistance} km` : 'Calcular', icon: FiNavigation }, { label: 'Tiempo est.', value: shownMinutes ? `${shownMinutes} min` : 'Calcular', icon: FiClock }, { label: 'Pendientes', value: stops.length, icon: FiPackage }].map((item) => <div key={item.label} className="bg-white/10 rounded-xl p-2.5 text-center"><item.icon className="text-white/60 text-sm mx-auto mb-1" /><p className="font-black text-sm lg:text-base">{item.value}</p><p className="text-white/60 text-[9px]">{item.label}</p></div>)}
          </div>
          <div className="flex justify-between text-[10px] text-white/60 mb-1"><span>Progreso</span><strong className="text-white">{deliveredToday}/{total}</strong></div><div className="h-2 bg-white/20 rounded-full overflow-hidden"><div className="h-full bg-[#00a884]" style={{ width: `${progress}%` }} /></div><p className="text-white/40 text-[9px] text-right mt-1">{progress}% completado</p>
          <div className={`mt-3 rounded-xl px-3 py-2 flex items-center justify-center gap-2 text-[10px] font-black ${mapDriver ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}><FiActivity className={mapDriver ? 'animate-pulse' : ''} />{mapDriver ? 'Tu ubicación se está mostrando en el mapa' : 'Esperando señal GPS del dispositivo'}</div>
          {routeStats.startSource && routeStats.startSource !== 'none' && <p className="mt-3 text-[9px] text-white/55 text-center">Punto inicial: {routeStats.startSource === 'store' ? 'ubicación del negocio' : routeStats.startSource === 'driver' ? 'última ubicación del repartidor' : 'ubicación actual del dispositivo'}</p>}
          {routeUrl && <a href={routeUrl} target="_blank" rel="noreferrer" className="mt-4 w-full rounded-xl bg-[#00a884] text-white py-3 text-xs font-black flex items-center justify-center gap-2"><FiNavigation /> Abrir ruta completa</a>}
        </motion.div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden lg:col-span-7 xl:col-span-8">
          <div className="bg-[#1a2332] px-4 py-3 flex items-center justify-between"><div className="flex items-center gap-2"><FiMap className="text-[#00a884]" /><span className="text-white font-bold text-sm">Mapa operativo en vivo</span></div>{selected && <a href={navigationUrl(selected)} target="_blank" rel="noreferrer" className="text-[10px] font-black text-[#00a884] flex items-center gap-1"><FiNavigation /> Navegar</a>}</div>
          <LiveDeliveryMap
            className="h-64 lg:h-[420px]"
            route={selectedRoute}
            polygon={serviceAreaPolygon}
            store={mapStore ? { ...mapStore, label: routePlan?.store?.name || activeStore?.name || 'Negocio' } : null}
            destination={mapDestination ? { ...mapDestination, label: selected?.customer || 'Cliente' } : null}
            driver={mapDriver ? {
              ...mapDriver,
              heading: numberValue(liveLocation?.heading),
              accuracy: numberValue(liveLocation?.accuracy),
              updatedAt: liveLocation?.updatedAt || liveLocation?.updated_at,
              label: 'Mi ubicación',
            } : null}
            emptyMessage={selected ? 'Configura las coordenadas del negocio y del cliente para mostrar la ruta.' : 'Inicia o recibe una entrega para activar el mapa.'}
            showLegend={false}
          />
          {selected && <div className="p-4 border-t border-gray-100 flex items-start justify-between gap-3"><div><p className="font-black text-gray-900">{selected.customer || 'Cliente'}</p><p className="text-xs text-gray-500 mt-1">{deliveryAddress(selected)}</p></div><span className="text-[9px] font-black text-blue-600 bg-blue-50 rounded-full px-2 py-1">{routePlan?.route?.source === 'geo_rd_map' ? 'Ruta GEO RD MAP' : routePlan?.route?.source === 'road' ? 'Ruta por calles' : 'Ruta aproximada'}</span></div>}
        </div>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3"><h3 className="font-black text-gray-800">Paradas en orden</h3><button onClick={optimize} disabled={!stops.length || optimizing} className="lg:hidden text-xs font-black text-[#00a884] flex items-center gap-1"><FiRefreshCw className={optimizing ? 'animate-spin' : ''} /> Reordenar</button></div>
        {!stops.length ? <div className="bg-white rounded-3xl border border-gray-100 py-14 text-center"><MotorcycleIcon className="w-10 h-10 text-gray-300 mx-auto" /><p className="font-bold text-gray-600 mt-3">Sin paradas pendientes</p><p className="text-xs text-gray-400 mt-1">Los pedidos listos o en ruta aparecerán aquí automáticamente.</p></div> : <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {stops.map((stop, index) => {
            const coordinates = deliveryCoordinates(stop);
            const callUrl = customerCallUrl(stop);
            const whatsappUrl = customerWhatsAppUrl(stop);
            return <article key={stop.id} role="button" tabIndex={0} onClick={() => setSelectedId(stop.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedId(stop.id); }} className={`text-left bg-white rounded-2xl border p-4 shadow-sm transition cursor-pointer ${selected?.id === stop.id ? 'border-[#00a884] ring-2 ring-[#00a884]/10' : 'border-gray-100'}`}>
              <div className="flex gap-3"><span className="w-8 h-8 rounded-xl bg-[#eafaf1] text-[#00a884] font-black flex items-center justify-center shrink-0">{stop.routePosition || stop.route_position || index + 1}</span><div className="flex-1 min-w-0"><div className="flex justify-between gap-2"><p className="font-black text-gray-900 truncate">{stop.customer || 'Cliente'}</p><p className="font-black text-[#00a884] text-sm">RD$ {fmt(stop.total)}</p></div><p className="text-xs text-gray-500 mt-1 line-clamp-2">{deliveryAddress(stop)}</p><p className={`text-[10px] font-black mt-1 ${coordinates ? 'text-blue-500' : 'text-amber-500'}`}>{coordinates ? 'Ubicación GPS disponible' : 'Navegación por dirección'}</p></div></div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {callUrl ? <a onClick={(event) => event.stopPropagation()} href={callUrl} className="rounded-lg border border-gray-200 py-2 text-[10px] font-black text-gray-600 flex items-center justify-center gap-1"><FiPhone /> Llamar</a> : <span className="rounded-lg border border-gray-100 bg-gray-50 py-2 text-[10px] font-black text-gray-300 flex items-center justify-center gap-1 cursor-not-allowed"><FiPhone /> Sin teléfono</span>}
                {whatsappUrl ? <a onClick={(event) => event.stopPropagation()} href={whatsappUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-[#00a884]/20 bg-[#eafaf1] py-2 text-[10px] font-black text-[#00a884] flex items-center justify-center gap-1"><FiMessageCircle /> WhatsApp</a> : <span className="rounded-lg border border-gray-100 bg-gray-50 py-2 text-[10px] font-black text-gray-300 flex items-center justify-center gap-1 cursor-not-allowed"><FiMessageCircle /> Sin WhatsApp</span>}
                <a onClick={(event) => event.stopPropagation()} href={navigationUrl(stop)} target="_blank" rel="noreferrer" className="rounded-lg border border-blue-100 bg-blue-50 py-2 text-[10px] font-black text-blue-600 flex items-center justify-center gap-1"><FiNavigation /> Navegar</a>
              </div>
            </article>;
          })}
        </div>}
        {stops.length > 0 && <div className="mt-4 text-center"><Link to="/delivery/orders" className="inline-flex items-center gap-2 rounded-xl bg-[#1a2332] text-white px-5 py-3 text-xs font-black"><FiPackage /> Gestionar entregas</Link></div>}
      </section>
    </div>
  );
}
