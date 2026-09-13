import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../context/StoreContext';
import { api } from '../lib/api';
import LiveDeliveryMap, { type MapPoint } from '../components/LiveDeliveryMap';
import * as FiIcons from 'react-icons/fi';

const {
  FiMap, FiMapPin, FiPlus, FiX, FiDollarSign, FiCheck, FiEdit2,
  FiTrash2, FiToggleLeft, FiToggleRight, FiSearch, FiLoader,
  FiAlertCircle, FiCheckCircle, FiNavigation, FiLayers, FiCornerUpLeft,
  FiRefreshCw, FiActivity, FiCrosshair,
} = FiIcons;

const fmt = (n: any) => Number(n || 0).toLocaleString('es-DO');
const normalizeDeliveryScope = (value: any) => String(value || '').toLowerCase().trim() === 'provincial' ? 'provincial' : 'municipal';
const storeAddressValue = (store: any, ...keys: string[]) => {
  for (const key of keys) {
    const value = String(store?.[key] || '').trim();
    if (value) return value;
  }
  return '';
};
const inputClass = 'w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00a884]/40 focus:border-[#00a884] bg-white disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed transition-all';
const labelClass = 'text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5';

const normalizeItems = (items: any) => Array.isArray(items) ? items : [];
const districtOptionValue = (item: any) => String(
  item?.identifier || [item?.provinceCode, item?.municipalityCode, item?.code].filter(Boolean).join(':') || item?.code || item?.municipalityCode || item?.name || '',
);
const findSelectedDistrict = (items: any[], municipalityCode = '', districtCode = '') => {
  const normalizedMunicipalityCode = String(municipalityCode || '').trim();
  const normalizedDistrictCode = String(districtCode || '').trim();
  if (!normalizedMunicipalityCode && !normalizedDistrictCode) return undefined;

  const exactIdentifier = normalizedDistrictCode
    ? items.find((item) => String(item?.identifier || '') === normalizedDistrictCode)
    : undefined;
  if (exactIdentifier) return exactIdentifier;

  const exactPair = normalizedMunicipalityCode
    ? items.find((item) => (
      String(item?.municipalityCode || '') === normalizedMunicipalityCode &&
      String(item?.code || '') === (normalizedDistrictCode || '01')
    ))
    : undefined;
  if (exactPair) return exactPair;

  if (normalizedDistrictCode) {
    const byCode = items.find((item) => String(item?.code || '') === normalizedDistrictCode);
    if (byCode) return byCode;
  }

  return items.find((item) => String(item?.municipalityCode || '') === normalizedMunicipalityCode);
};
const normalizeSearch = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const SearchSelect = ({ label, value, options, onChange, placeholder, disabled = false, icon: Icon = FiMapPin }: any) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const normalizedOptions = useMemo(() => normalizeItems(options).map((option: any) => ({
    ...option,
    value: String(option.value || option.code || option.id || option.identifier || option.name || ''),
    label: String(option.label || option.name || ''),
  })), [options]);

  const selected = normalizedOptions.find((option: any) => String(option.value) === String(value));
  const search = normalizeSearch(query);
  const filtered = search
    ? normalizedOptions.filter((option: any) => normalizeSearch(`${option.label} ${option.value}`).includes(search))
    : normalizedOptions;

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setQuery('');
    }
  }, [disabled]);

  const choose = (option: any) => {
    onChange(option);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none z-10" />
        <input
          type="text"
          value={open ? query : (selected?.label || '')}
          onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => { if (!disabled) { setOpen(true); setQuery(''); } }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setOpen(false); setQuery(''); }
            if (e.key === 'Enter' && filtered.length > 0) { e.preventDefault(); choose(filtered[0]); }
          }}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          className={`${inputClass} pl-9 pr-10`}
        />
        <FiSearch className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none text-sm" />
      </div>
      {open && !disabled && (
        <div className="absolute z-[9999] mt-2 w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-900/15">
          <div className="max-h-64 overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-gray-300">
            {filtered.length > 0 ? filtered.map((option: any) => {
              const active = String(option.value) === String(value);
              return (
                <button
                  key={option.id || option.identifier || option.code || option.value || option.label}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(option)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    active ? 'bg-[#00a884] text-white' : 'text-gray-700 hover:bg-[#f0fdf8] hover:text-[#00a884]'
                  }`}
                >
                  {option.label}
                </button>
              );
            }) : (
              <div className="px-3 py-3 text-xs text-gray-400 font-medium">No hay coincidencias. Escribe otra búsqueda.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const emptyZone = {
  zoneType: 'territorial',
  geoGeofenceId: '',
  geoService: 'delivery',
  geoPolygon: [] as MapPoint[],
  provinceCode: '',
  provinceName: '',
  municipalityCode: '',
  municipalityName: '',
  districtCode: '',
  neighborhoodId: '',
  neighborhoodName: '',
  deliveryCost: '',
  active: true,
};

const normalizeInitialZone = (zone: any) => zone ? {
  id: zone.id,
  zoneType: String(zone.zoneType || zone.zone_type || 'territorial') === 'geofence' ? 'geofence' : 'territorial',
  geoGeofenceId: zone.geoGeofenceId || zone.geo_geofence_id || '',
  geoService: zone.geoService || zone.geo_service || 'delivery',
  geoPolygon: Array.isArray(zone.geoPolygon || zone.geo_polygon) ? (zone.geoPolygon || zone.geo_polygon) : [],
  provinceCode: zone.provinceCode || zone.province_code || '',
  provinceName: zone.provinceName || zone.province_name || '',
  municipalityCode: zone.municipalityCode || zone.municipality_code || '',
  municipalityName: zone.municipalityName || zone.municipality_name || '',
  districtCode: zone.districtCode || zone.district_code || '',
  neighborhoodId: zone.neighborhoodId || zone.neighborhood_id || '',
  neighborhoodName: zone.neighborhoodName || zone.neighborhood_name || '',
  deliveryCost: String(zone.deliveryCost ?? zone.delivery_cost ?? ''),
  active: zone.active !== false,
} : emptyZone;

const ZoneModal = ({ initial, onClose, onSave, activeStore }: any) => {
  const [form, setForm] = useState<any>(() => normalizeInitialZone(initial));
  const [districts, setDistricts] = useState<any[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState('');
  const [drawMode, setDrawMode] = useState(false);
  const isEdit = Boolean(initial?.id);
  const isGeofence = form.zoneType === 'geofence';
  const deliveryScope = normalizeDeliveryScope(activeStore?.deliveryScope || activeStore?.delivery_scope);
  const isMunicipalScope = deliveryScope === 'municipal';
  const storeProvinceCode = storeAddressValue(activeStore, 'provinceCode', 'province_code');
  const storeProvinceName = storeAddressValue(activeStore, 'province');
  const storeMunicipalityCode = storeAddressValue(activeStore, 'municipalityCode', 'municipality_code');
  const storeMunicipalityName = storeAddressValue(activeStore, 'municipality');
  const storeDistrictCode = storeAddressValue(activeStore, 'districtCode', 'district_code');
  const storeLatRaw = activeStore?.latitude ?? activeStore?.lat;
  const storeLngRaw = activeStore?.longitude ?? activeStore?.lng ?? activeStore?.lon;
  const storeLat = Number(storeLatRaw);
  const storeLng = Number(storeLngRaw);
  const hasStoreGPS = storeLatRaw !== '' && storeLatRaw !== null && storeLatRaw !== undefined
    && storeLngRaw !== '' && storeLngRaw !== null && storeLngRaw !== undefined
    && Number.isFinite(storeLat) && Number.isFinite(storeLng) && Math.abs(storeLat) <= 90 && Math.abs(storeLng) <= 180;
  const hasStoreBaseLocation = Boolean(storeProvinceCode && storeProvinceName && (!isMunicipalScope || (storeMunicipalityCode && storeMunicipalityName)));

  const district = findSelectedDistrict(districts, form.municipalityCode, form.districtCode);
  const districtValue = district ? districtOptionValue(district) : '';
  const costNumber = Number(form.deliveryCost || 0);
  const polygon = Array.isArray(form.geoPolygon) ? form.geoPolygon.filter((point: any) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng))) : [];
  const territorialValid = Boolean(hasStoreBaseLocation && form.provinceCode && form.provinceName && form.municipalityCode && form.municipalityName && form.neighborhoodName);
  const geofenceValid = Boolean(hasStoreGPS && String(form.neighborhoodName || '').trim() && polygon.length >= 3);
  const valid = Boolean((isGeofence ? geofenceValid : territorialValid) && String(form.deliveryCost).trim() !== '' && costNumber >= 0);

  const neighborhoodOptions = [
    ...neighborhoods.map((item) => ({ ...item, value: item.id || item.identifier || item.code || item.name })),
    { id: '__custom__', value: '__custom__', name: '+ Agregar barrio / sector personalizado' },
  ];

  useEffect(() => {
    setForm((prev: any) => {
      const next = { ...prev };
      let changed = false;
      if (storeProvinceCode && (next.provinceCode !== storeProvinceCode || next.provinceName !== storeProvinceName)) {
        const provinceChanged = next.provinceCode && next.provinceCode !== storeProvinceCode;
        next.provinceCode = storeProvinceCode;
        next.provinceName = storeProvinceName;
        if (provinceChanged && next.zoneType !== 'geofence') {
          next.municipalityCode = '';
          next.municipalityName = '';
          next.districtCode = '';
          next.neighborhoodId = '';
          next.neighborhoodName = '';
        }
        changed = true;
      }
      if (isMunicipalScope && storeMunicipalityCode && (next.municipalityCode !== storeMunicipalityCode || next.municipalityName !== storeMunicipalityName || next.districtCode !== storeDistrictCode)) {
        const municipalityChanged = next.municipalityCode && next.municipalityCode !== storeMunicipalityCode;
        next.municipalityCode = storeMunicipalityCode;
        next.municipalityName = storeMunicipalityName;
        next.districtCode = storeDistrictCode;
        if (municipalityChanged && next.zoneType !== 'geofence') {
          next.neighborhoodId = '';
          next.neighborhoodName = '';
        }
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [storeProvinceCode, storeProvinceName, storeMunicipalityCode, storeMunicipalityName, storeDistrictCode, isMunicipalScope]);

  useEffect(() => {
    let mounted = true;
    if (!form.provinceCode || isGeofence) {
      if (!form.provinceCode) setDistricts([]);
      return () => { mounted = false; };
    }
    setLoading(true);
    api.get(`/territories/districts?provinceCode=${encodeURIComponent(form.provinceCode)}`)
      .then((items) => mounted && setDistricts(normalizeItems(items)))
      .catch(() => mounted && setMessage('No se pudieron cargar los municipios/distritos desde GEO RD MAP.'))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [form.provinceCode, isGeofence]);

  useEffect(() => {
    let mounted = true;
    if (!form.provinceCode || !form.municipalityCode || isGeofence) {
      if (!form.municipalityCode) setNeighborhoods([]);
      return () => { mounted = false; };
    }
    setLoading(true);
    const params = new URLSearchParams({
      provinceCode: form.provinceCode,
      municipalityCode: form.municipalityCode,
      districtCode: form.districtCode || '',
    });
    api.get(`/territories/neighborhoods?${params.toString()}`)
      .then((items) => mounted && setNeighborhoods(normalizeItems(items)))
      .catch(() => mounted && setNeighborhoods([]))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [form.provinceCode, form.municipalityCode, form.districtCode, isGeofence]);

  const handleDistrict = (option: any) => {
    setCustomMode(false);
    setCustomName('');
    setForm((prev: any) => ({
      ...prev,
      municipalityCode: option.municipalityCode || option.code || option.value || '',
      municipalityName: option.name || option.label || '',
      districtCode: option.code || '',
      neighborhoodId: '',
      neighborhoodName: '',
    }));
  };

  const handleNeighborhood = (option: any) => {
    if (option.value === '__custom__' || option.id === '__custom__') {
      setCustomMode(true);
      setForm((prev: any) => ({ ...prev, neighborhoodId: '', neighborhoodName: '' }));
      return;
    }
    setCustomMode(false);
    setCustomName('');
    setForm((prev: any) => ({
      ...prev,
      neighborhoodId: option.id || option.identifier || option.code || option.value || option.name || '',
      neighborhoodName: option.name || option.label || '',
    }));
  };

  const saveCustomNeighborhood = async () => {
    const name = customName.trim();
    if (!name || !form.provinceCode || !form.municipalityCode) {
      setMessage('Escribe el nombre del barrio o sector personalizado.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const created = await api.post('/territories/neighborhoods/custom', {
        name,
        provinceCode: form.provinceCode,
        provinceName: form.provinceName,
        municipalityCode: form.municipalityCode,
        municipalityName: form.municipalityName,
        districtCode: form.districtCode || '',
      });
      const item = { ...created, name: created?.name || name, custom: true };
      setNeighborhoods((prev) => {
        const exists = prev.some((current) => String(current.name).toLowerCase() === String(item.name).toLowerCase());
        return exists ? prev : [...prev, item].sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
      });
      setCustomMode(false);
      setCustomName('');
      setForm((prev: any) => ({ ...prev, neighborhoodId: item.id || item.identifier || item.code || item.name, neighborhoodName: item.name }));
      setMessage('✓ Barrio enviado a GEO RD MAP para revisión. Puedes usarlo localmente mientras queda pendiente de aprobación global.');
    } catch (err: any) {
      setMessage(err?.message || 'No se pudo guardar el barrio personalizado.');
    } finally {
      setLoading(false);
    }
  };

  const selectMode = (zoneType: 'territorial' | 'geofence') => {
    setCustomMode(false);
    setMessage('');
    setDrawMode(zoneType === 'geofence');
    setForm((prev: any) => ({
      ...prev,
      zoneType,
      geoService: 'delivery',
      neighborhoodId: zoneType === 'geofence' ? '' : prev.neighborhoodId,
      neighborhoodName: zoneType === 'geofence' && prev.zoneType !== 'geofence' ? '' : prev.neighborhoodName,
    }));
  };

  const addPolygonPoint = (point: MapPoint) => {
    setForm((prev: any) => {
      const current = Array.isArray(prev.geoPolygon) ? prev.geoPolygon : [];
      if (current.length >= 120) return prev;
      return { ...prev, geoPolygon: [...current, { lat: Number(point.lat.toFixed(6)), lng: Number(point.lng.toFixed(6)) }] };
    });
  };

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setMessage('');
    try {
      const zoneType = isGeofence ? 'geofence' : 'territorial';
      const geoPolygon = zoneType === 'geofence' ? polygon : [];
      await onSave({
        ...form,
        zoneType,
        zone_type: zoneType,
        geoService: 'delivery',
        geo_service: 'delivery',
        geoPolygon,
        geo_polygon: geoPolygon,
        deliveryCost: costNumber,
        delivery_cost: costNumber,
        province_code: form.provinceCode,
        province_name: form.provinceName,
        municipality_code: form.municipalityCode,
        municipality_name: form.municipalityName,
        district_code: form.districtCode,
        neighborhood_id: zoneType === 'geofence' ? '' : form.neighborhoodId,
        neighborhood_name: form.neighborhoodName,
      });
      onClose();
    } catch (err: any) {
      setMessage(err?.message || 'No se pudo guardar la zona de entrega.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="pointer-events-auto w-full max-w-4xl max-h-[calc(100vh-1.5rem)] bg-white rounded-3xl shadow-2xl overflow-y-auto overscroll-contain"
        >
          <div className="p-5 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-black text-gray-800 text-xl">{isEdit ? 'Editar zona de entrega' : 'Nueva zona de entrega'}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Configura cobertura y precio por territorio o dibuja una geocerca con GEO RD MAP.</p>
              </div>
              <button onClick={onClose} className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
                <FiX className="text-gray-500 text-sm" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => selectMode('territorial')}
                className={`rounded-2xl border p-4 text-left transition-all ${!isGeofence ? 'border-[#00a884] bg-[#f0fdf8] shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}
              >
                <div className="flex items-start gap-3">
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${!isGeofence ? 'bg-[#00a884] text-white' : 'bg-gray-100 text-gray-500'}`}><FiMapPin /></span>
                  <div><p className="font-black text-gray-800 text-sm">Barrio / sector</p><p className="text-[10px] text-gray-500 mt-1 leading-relaxed">Usa el catálogo territorial y barrios personalizados de GEO RD MAP.</p></div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => selectMode('geofence')}
                className={`rounded-2xl border p-4 text-left transition-all ${isGeofence ? 'border-[#00a884] bg-[#f0fdf8] shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}
              >
                <div className="flex items-start gap-3">
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isGeofence ? 'bg-[#00a884] text-white' : 'bg-gray-100 text-gray-500'}`}><FiLayers /></span>
                  <div><p className="font-black text-gray-800 text-sm">Geocerca · GEO RD MAP</p><p className="text-[10px] text-gray-500 mt-1 leading-relaxed">Dibuja una zona exacta de servicio para calcular cobertura y costo de delivery.</p></div>
                </div>
              </button>
            </div>

            {!isGeofence ? (
              <>
                <div className={`rounded-2xl border px-3 py-2 ${hasStoreBaseLocation ? 'bg-[#f0fdf8] border-[#00a884]/20' : 'bg-amber-50 border-amber-100'}`}>
                  <div className="flex items-start gap-2">
                    <FiNavigation className={`${hasStoreBaseLocation ? 'text-[#00a884]' : 'text-amber-500'} text-sm mt-0.5 shrink-0`} />
                    <p className="text-[11px] text-gray-600 font-medium leading-relaxed">
                      {hasStoreBaseLocation
                        ? (isMunicipalScope
                          ? `Alcance municipal: se usará automáticamente ${storeMunicipalityName}, ${storeProvinceName}. Solo selecciona el barrio o sector.`
                          : `Alcance provincial: se usará automáticamente ${storeProvinceName}. Selecciona municipio/distrito y barrio dentro de esa provincia.`)
                        : 'Completa la provincia y municipio/distrito del negocio activo en Configuración para poder crear zonas territoriales.'}
                    </p>
                  </div>
                </div>

                <div className={isMunicipalScope ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 md:grid-cols-2 gap-3'}>
                  {!isMunicipalScope && (
                    <SearchSelect label="Municipio / Distrito *" value={districtValue}
                      options={districts.map((item) => ({ ...item, value: districtOptionValue(item) }))}
                      onChange={handleDistrict} placeholder="Selecciona municipio" disabled={!form.provinceCode || !hasStoreBaseLocation} />
                  )}
                  <SearchSelect label="Barrio / Sector *" value={customMode ? '__custom__' : form.neighborhoodId || form.neighborhoodName}
                    options={neighborhoodOptions} onChange={handleNeighborhood} placeholder="Selecciona barrio"
                    disabled={!form.municipalityCode || !hasStoreBaseLocation} />
                </div>

                {customMode && (
                  <div className="rounded-2xl border border-[#00a884]/20 bg-[#f0fdf8] p-3">
                    <label className={labelClass}>Barrio / sector personalizado</label>
                    <div className="flex gap-2">
                      <input type="text" value={customName} onChange={(e) => setCustomName(e.target.value)}
                        placeholder="Escribe el nombre del barrio o sector" className={`${inputClass} flex-1`} />
                      <button type="button" onClick={saveCustomNeighborhood} disabled={loading}
                        className="px-4 py-3 rounded-xl bg-[#00a884] text-white font-black text-xs flex items-center justify-center gap-1.5 disabled:opacity-60">
                        {loading ? <FiLoader className="animate-spin" /> : <FiPlus />} Agregar
                      </button>
                    </div>
                    <p className="text-[10px] text-[#00a884] font-semibold mt-2">La sugerencia se envía a GEO RD MAP y queda utilizable localmente mientras se revisa.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div className={`rounded-2xl border px-3 py-2 ${hasStoreGPS ? 'bg-[#f0fdf8] border-[#00a884]/20' : 'bg-amber-50 border-amber-100'}`}>
                  <div className="flex items-start gap-2">
                    <FiCrosshair className={`${hasStoreGPS ? 'text-[#00a884]' : 'text-amber-500'} text-sm mt-0.5 shrink-0`} />
                    <p className="text-[11px] text-gray-600 font-medium leading-relaxed">
                      {hasStoreGPS
                        ? `Punto de salida: ${activeStore?.name || 'Negocio'} · ${storeLat.toFixed(6)}, ${storeLng.toFixed(6)}. Marca sucesivamente los vértices de la cobertura.`
                        : 'Configura primero la ubicación GPS del negocio. Ese punto se usa para rutas, cercanía y seguimiento de deliveries.'}
                    </p>
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Nombre de la zona *</label>
                  <input type="text" value={form.neighborhoodName || ''}
                    onChange={(e) => setForm((prev: any) => ({ ...prev, neighborhoodName: e.target.value, neighborhoodId: '' }))}
                    placeholder="Ej. Cobertura Centro de Bonao" className={inputClass} />
                </div>

                <div className="rounded-2xl border border-gray-200 overflow-hidden bg-gray-50">
                  <LiveDeliveryMap
                    className="h-[280px] sm:h-[340px]"
                    store={hasStoreGPS ? { lat: storeLat, lng: storeLng, label: activeStore?.name || 'Negocio' } : null}
                    polygon={polygon}
                    drawPolygon={drawMode && hasStoreGPS}
                    onPolygonPoint={addPolygonPoint}
                    showLegend={false}
                    emptyMessage="Configura el GPS del negocio para dibujar la cobertura."
                  />
                  <div className="p-3 bg-white border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button type="button" disabled={!hasStoreGPS} onClick={() => setDrawMode((value) => !value)}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black flex items-center gap-1.5 disabled:opacity-50 ${drawMode ? 'bg-[#00a884] text-white' : 'bg-gray-100 text-gray-700'}`}>
                        <FiCrosshair /> {drawMode ? 'Dibujando' : 'Dibujar / editar'}
                      </button>
                      <button type="button" disabled={polygon.length === 0} onClick={() => setForm((prev: any) => ({ ...prev, geoPolygon: (prev.geoPolygon || []).slice(0, -1) }))}
                        className="px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-[10px] font-black flex items-center gap-1.5 disabled:opacity-40"><FiCornerUpLeft /> Deshacer</button>
                      <button type="button" disabled={polygon.length === 0} onClick={() => setForm((prev: any) => ({ ...prev, geoPolygon: [] }))}
                        className="px-3 py-2 rounded-xl bg-red-50 text-red-500 text-[10px] font-black flex items-center gap-1.5 disabled:opacity-40"><FiTrash2 /> Limpiar</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-black rounded-full px-2.5 py-1 ${polygon.length >= 3 ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>{polygon.length} vértices</span>
                      <span className="text-[9px] font-black rounded-full px-2.5 py-1 bg-blue-50 text-blue-600 flex items-center gap-1"><FiActivity /> GEO RD MAP</span>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400">La cobertura se conserva en WAMERCIO y se sincroniza con GEO RD MAP. Si el servicio central está temporalmente indisponible, la zona local sigue operativa.</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className={labelClass}>Costo de entrega (RD$) *</label>
                <div className="relative">
                  <FiDollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                  <input type="text" inputMode="decimal" value={form.deliveryCost}
                    onChange={(e) => setForm((prev: any) => ({ ...prev, deliveryCost: e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1') }))}
                    placeholder="Ej. 100" className={`${inputClass} pl-9 font-bold`} />
                </div>
              </div>
              <div className="min-w-[220px] rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 flex items-center justify-between gap-3">
                <div><p className="font-black text-gray-800 text-sm">Zona activa</p><p className="text-[10px] text-gray-400">Los clientes podrán seleccionarla</p></div>
                <button type="button" onClick={() => setForm((prev: any) => ({ ...prev, active: !prev.active }))}
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors ${form.active ? 'bg-[#00a884]' : 'bg-gray-300'}`}>
                  <span className={`block w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${form.active ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            {form.neighborhoodName && (
              <div className="flex items-start gap-2 rounded-xl bg-[#f0fdf8] border border-[#00a884]/20 px-3 py-2">
                {isGeofence ? <FiLayers className="text-[#00a884] text-sm mt-0.5 shrink-0" /> : <FiMapPin className="text-[#00a884] text-sm mt-0.5 shrink-0" />}
                <p className="text-[11px] text-gray-600 font-medium leading-relaxed">
                  {isGeofence ? `${form.neighborhoodName} · ${polygon.length} vértices` : `${form.neighborhoodName}, ${form.municipalityName}, ${form.provinceName}`} · RD$ {fmt(costNumber)}
                </p>
                {valid && <FiCheckCircle className="text-[#00a884] text-sm ml-auto shrink-0" />}
              </div>
            )}

            {message && (
              <div className={`flex items-center gap-2 text-[11px] font-semibold px-1 ${message.startsWith('✓') ? 'text-[#00a884]' : 'text-amber-600'}`}>
                {message.startsWith('✓') ? <FiCheckCircle /> : <FiAlertCircle />}<span>{message}</span>
              </div>
            )}

            <div className="pt-3 border-t border-gray-100 flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-black text-sm">Cancelar</button>
              <button onClick={submit} disabled={!valid || saving}
                className="flex-1 py-3 bg-[#00a884] text-white rounded-xl font-black text-sm shadow-lg shadow-[#00a884]/25 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none flex items-center justify-center gap-2">
                {saving ? <FiLoader className="animate-spin" /> : <FiCheck />} {isEdit ? 'Guardar cambios' : 'Agregar zona'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
};

const ZoneCard = ({ zone, onEdit, onDelete, onToggle, onSync }: any) => {
  const isGeofence = String(zone.zoneType || zone.zone_type || 'territorial') === 'geofence';
  const polygon = Array.isArray(zone.geoPolygon || zone.geo_polygon) ? (zone.geoPolygon || zone.geo_polygon) : [];
  const syncStatus = String(zone.geoSyncStatus || zone.geo_sync_status || 'not_applicable');
  const syncError = String(zone.geoSyncError || zone.geo_sync_error || '');
  const syncBadge = syncStatus === 'synced'
    ? { label: 'GEO sincronizada', cls: 'bg-blue-50 text-blue-600' }
    : syncStatus === 'error'
      ? { label: 'Local · reintentar GEO', cls: 'bg-amber-50 text-amber-600' }
      : { label: 'Pendiente GEO', cls: 'bg-gray-100 text-gray-500' };
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4 flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-[#00a884]/10 text-[#00a884] flex items-center justify-center shrink-0">
          {isGeofence ? <FiLayers className="text-lg" /> : <FiMapPin className="text-lg" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-black text-gray-800 text-sm truncate">{zone.neighborhoodName || zone.neighborhood_name || 'Zona de entrega'}</p>
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${zone.active ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>{zone.active ? 'Activa' : 'Inactiva'}</span>
            {isGeofence && <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-[#00a884]/10 text-[#00a884]">Geocerca</span>}
            {isGeofence && <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${syncBadge.cls}`}>{syncBadge.label}</span>}
          </div>
          <p className="text-[11px] text-gray-400 mt-1 truncate">
            {isGeofence
              ? `Cobertura dibujada · ${polygon.length} vértices${zone.geoGeofenceId || zone.geo_geofence_id ? ' · GEO RD MAP' : ''}`
              : [zone.municipalityName || zone.municipality_name, zone.provinceName || zone.province_name].filter(Boolean).join(', ')}
          </p>
          {isGeofence && syncStatus === 'error' && syncError && <p className="text-[10px] text-amber-600 mt-1 line-clamp-1" title={syncError}>{syncError}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-black text-[#00a884]">RD$ {fmt(zone.deliveryCost || zone.delivery_cost)}</p>
          <p className="text-[9px] text-gray-400 font-semibold">Costo entrega</p>
        </div>
      </div>
      <div className="px-4 pb-4 flex gap-2 justify-end">
        {isGeofence && syncStatus !== 'synced' && (
          <button onClick={onSync} className="px-3 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center gap-1.5 text-[10px] font-black" title="Sincronizar con GEO RD MAP">
            <FiRefreshCw /> Sincronizar
          </button>
        )}
        <button onClick={onToggle} className={`w-10 h-10 rounded-xl flex items-center justify-center ${zone.active ? 'bg-amber-50 text-amber-500' : 'bg-emerald-50 text-emerald-500'}`} title={zone.active ? 'Desactivar' : 'Activar'}>
          {zone.active ? <FiToggleRight className="text-lg" /> : <FiToggleLeft className="text-lg" />}
        </button>
        <button onClick={onEdit} className="w-10 h-10 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center"><FiEdit2 className="text-sm" /></button>
        <button onClick={onDelete} className="w-10 h-10 bg-red-50 text-red-400 rounded-xl flex items-center justify-center"><FiTrash2 className="text-sm" /></button>
      </div>
    </motion.div>
  );
};

const DeliveryZones = ({ embedded = false }: { embedded?: boolean }) => {
  const { deliveryZones = [], addDeliveryZone, updateDeliveryZone, deleteDeliveryZone, toggleDeliveryZone, activeStore } = useStore();
  const [modal, setModal] = useState<any>(null);
  const [geoStatus, setGeoStatus] = useState<any>(null);
  const zones = deliveryZones || [];

  useEffect(() => {
    let alive = true;
    api.get('/geo/status').then((data) => { if (alive) setGeoStatus(data); }).catch(() => { if (alive) setGeoStatus({ ready: false }); });
    return () => { alive = false; };
  }, []);
  const activeZones = zones.filter((zone: any) => zone.active).length;

  const saveZone = async (payload: any) => {
    if (payload.id) return updateDeliveryZone(payload.id, payload);
    return addDeliveryZone(payload);
  };

  return (
    <div className={embedded ? 'space-y-6' : 'p-4 lg:p-8 space-y-6'}>
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${embedded ? 'sm:justify-end' : ''}`}>
        {!embedded && (
          <div>
            <h1 className="text-2xl font-black text-gray-800">Zonas de entrega</h1>
            <p className="text-sm text-gray-500 mt-1">Configura precios por barrio, sector o geocerca de servicio con GEO RD MAP.</p>
          </div>
        )}
        <button
          onClick={() => setModal({ type: 'create' })}
          className="px-5 py-3 bg-[#00a884] text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#00a884]/25 active:scale-[0.98] transition-transform"
        >
          <FiPlus /> Agregar zona
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest font-black text-[#00a884]">Zonas activas</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{activeZones}</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest font-black text-blue-600">Zonas registradas</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{zones.length}</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest font-black text-amber-600">Negocio activo</p>
          <p className="text-lg font-black text-gray-900 mt-1 truncate">{activeStore?.name || 'Mi Negocio'}</p>
          <p className="text-[10px] text-amber-600 font-bold mt-0.5">Alcance {normalizeDeliveryScope(activeStore?.deliveryScope || activeStore?.delivery_scope) === 'provincial' ? 'provincial' : 'municipal'}</p>
        </div>
        <div className={`border rounded-2xl p-4 ${geoStatus?.ready !== false ? 'bg-[#f0fdf8] border-[#00a884]/20' : 'bg-gray-50 border-gray-100'}`}>
          <p className={`text-[10px] uppercase tracking-widest font-black ${geoStatus?.ready !== false ? 'text-[#00a884]' : 'text-gray-500'}`}>GEO RD MAP</p>
          <p className="text-lg font-black text-gray-900 mt-1">{geoStatus?.ready === false ? 'Contingencia local' : 'Servicios activos'}</p>
          <p className="text-[10px] text-gray-500 font-bold mt-0.5">Territorios · routing · geocercas</p>
        </div>
      </div>

      {zones.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-3xl shadow-sm min-h-[420px] flex items-center justify-center text-center p-8">
          <div>
            <div className="w-16 h-16 bg-gray-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <FiMap className="text-3xl text-gray-300" />
            </div>
            <h3 className="font-black text-gray-800">No hay zonas de entrega configuradas</h3>
            <p className="text-sm text-gray-400 mt-1">Crea una zona territorial o dibuja una geocerca para definir cobertura y costos personalizados.</p>
            <button onClick={() => setModal({ type: 'create' })} className="mt-5 px-5 py-3 bg-[#00a884] text-white rounded-2xl font-black text-sm inline-flex items-center gap-2 shadow-lg shadow-[#00a884]/25">
              <FiPlus /> Crear primera zona
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {zones.map((zone: any) => (
            <ZoneCard
              key={zone.id}
              zone={zone}
              onEdit={() => setModal({ type: 'edit', zone })}
              onToggle={() => toggleDeliveryZone(zone.id)}
              onSync={async () => {
                try { await api.post(`/delivery-zones/${zone.id}/geo-sync`, {}); window.location.reload(); } catch (err: any) { window.alert(err?.message || 'No se pudo sincronizar con GEO RD MAP.'); }
              }}
              onDelete={() => {
                if (window.confirm('¿Quieres eliminar esta zona de entrega?')) deleteDeliveryZone(zone.id);
              }}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {modal && (
          <ZoneModal
            initial={modal.type === 'edit' ? modal.zone : null}
            onClose={() => setModal(null)}
            onSave={saveZone}
            activeStore={activeStore}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default DeliveryZones;
