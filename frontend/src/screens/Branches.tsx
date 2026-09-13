import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../context/StoreContext";
import { api, getRootDomain, isPlatformRootHost } from "../lib/api";
import { useAccessPolicy } from '../lib/accessPolicy';
import PhoneInput from "../components/PhoneInput";
import TerritoryAddressForm, {
  buildTerritoryAddressLine,
  emptyTerritoryAddress,
  isTerritoryAddressComplete,
} from "../components/TerritoryAddressForm";
import * as FiIcons from "react-icons/fi";
import StoreAvatar from "../common/StoreAvatar";
import StoreLocationPicker, { isStoreLocationPairValid } from "../components/StoreLocationPicker";

const {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiMapPin,
  FiNavigation,
  FiX,
  FiPhone,
  FiCheck,
  FiActivity,
  FiUnlock,
  FiLock,
  FiClock,
  FiAlertTriangle,
  FiToggleLeft,
  FiToggleRight,
  FiTruck,
  FiPackage,
  FiUploadCloud,
  FiImage,
  FiRotateCcw,
  FiMessageCircle,
  FiLink,
  FiWifi,
  FiRefreshCw,
  FiCopy,
  FiLogOut,
  FiSearch,
  FiSmartphone,
  FiCheckCircle,
  FiGrid,
} = FiIcons;

const fmt = (n) => Number(n).toLocaleString("es-DO");

const COLORS = [
  "#00a884",
  "#7c3aed",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

const SERVICE_DAYS = [
  { key: "monday", label: "Lunes", short: "Lun" },
  { key: "tuesday", label: "Martes", short: "Mar" },
  { key: "wednesday", label: "Miércoles", short: "Mié" },
  { key: "thursday", label: "Jueves", short: "Jue" },
  { key: "friday", label: "Viernes", short: "Vie" },
  { key: "saturday", label: "Sábado", short: "Sáb" },
  { key: "sunday", label: "Domingo", short: "Dom" },
];

const DEFAULT_SERVICE_HOURS = SERVICE_DAYS.reduce(
  (acc, day, index) => ({
    ...acc,
    [day.key]: {
      enabled: index < 6,
      open: "08:00",
      close: "22:00",
    },
  }),
  {},
);

const safeList = (value: any) => (Array.isArray(value) ? value : []);
const DEFAULT_ORDER_MODES = { delivery: true, pickup: true };

const parseJSONField = (value: any, fallback: any = {}) => {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
};


const normalizeOrderModes = (value: any = {}) => {
  const source = parseJSONField(value, {});
  const delivery = source.delivery ?? source.allowDelivery ?? source.allow_delivery;
  const pickup = source.pickup ?? source.allowPickup ?? source.allow_pickup;
  const normalized = {
    delivery: delivery === undefined ? DEFAULT_ORDER_MODES.delivery : delivery !== false && String(delivery).toLowerCase() !== 'false',
    pickup: pickup === undefined ? DEFAULT_ORDER_MODES.pickup : pickup !== false && String(pickup).toLowerCase() !== 'false',
  };
  if (!normalized.delivery && !normalized.pickup) return { ...DEFAULT_ORDER_MODES };
  return normalized;
};

const normalizePaymentSettings = (value: any = {}) => {
  const settings = parseJSONField(value, {});
  const orderModes = normalizeOrderModes(settings.orderModes || settings.order_modes);
  return { ...settings, orderModes, order_modes: orderModes };
};

const tenantRef = (metric: any = {}) => String(metric.tenantSlug || metric.tenant_slug || metric.tenantId || metric.tenant_id || '').trim();
const tenantID = (metric: any = {}) => String(metric.tenantId || metric.tenant_id || '').trim();
const isCrossTenantMetric = (metric: any = {}) => Boolean(tenantID(metric));

const normalizeBusinessWhatsApp = (value: any = {}) => {
  const raw = value && typeof value === "object" ? value : {};
  const phone = String(raw.phone || "").replace(/\D/g, "");
  return {
    enabled: raw.enabled !== false,
    session_id: String(raw.session_id || raw.sessionId || ""),
    session_name: String(raw.session_name || raw.sessionName || ""),
    status: String(raw.status || "pending"),
    connected: Boolean(raw.connected),
    logged_in: Boolean(raw.logged_in || raw.loggedIn),
    jid: String(raw.jid || ""),
    phone,
    display_phone: String(raw.display_phone || raw.displayPhone || (phone ? `+${phone}` : "")),
    profile_name: String(raw.profile_name || raw.profileName || ""),
    profile_picture_url: String(raw.profile_picture_url || raw.profilePictureUrl || ""),
    updated_at: String(raw.updated_at || raw.updatedAt || ""),
  };
};

const businessWhatsAppIsLinked = (value: any = {}) => {
  const state = normalizeBusinessWhatsApp(value);
  return state.logged_in || state.status === "linked";
};

const businessQRImageSource = (value = "") => {
  const clean = String(value || "").trim();
  if (!clean) return "";
  if (/^(data:image\/|https?:\/\/|blob:)/i.test(clean)) return clean;
  if (/^[A-Za-z0-9+/=]+$/.test(clean) && clean.length > 80)
    return `data:image/png;base64,${clean}`;
  if (clean.length > 8)
    return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(clean)}`;
  return "";
};

const formatPairingCode = (value = "") =>
  String(value || "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .match(/.{1,4}/g)
    ?.join(" ") || "";

const normalizeBusinessConfigMetric = (metric: any = {}) => ({
  ...metric,
  id: metric.id || metric.store_id || metric.storeId || metric.tenant_id || metric.tenantId,
  store_id: metric.store_id || metric.storeId || '',
  storeId: metric.storeId || metric.store_id || '',
  tenant_id: metric.tenant_id || metric.tenantId || '',
  tenantId: metric.tenantId || metric.tenant_id || '',
  tenant_slug: metric.tenant_slug || metric.tenantSlug || '',
  tenantSlug: metric.tenantSlug || metric.tenant_slug || '',
  paymentSettings: normalizePaymentSettings(metric.paymentSettings || metric.payment_settings || {}),
  payment_settings: normalizePaymentSettings(metric.payment_settings || metric.paymentSettings || {}),
  serviceHours: parseJSONField(metric.serviceHours || metric.service_hours, {}),
  service_hours: parseJSONField(metric.service_hours || metric.serviceHours, {}),
  deliveryScope: normalizeDeliveryScope(metric.deliveryScope || metric.delivery_scope),
  delivery_scope: normalizeDeliveryScope(metric.delivery_scope || metric.deliveryScope),
  latitude: metric.latitude ?? metric.lat ?? "",
  lat: metric.lat ?? metric.latitude ?? "",
  longitude: metric.longitude ?? metric.lng ?? metric.lon ?? "",
  lng: metric.lng ?? metric.longitude ?? metric.lon ?? "",
  locationAccuracy: metric.locationAccuracy ?? metric.location_accuracy ?? null,
  location_accuracy: metric.location_accuracy ?? metric.locationAccuracy ?? null,
  locationSource: metric.locationSource || metric.location_source || "",
  location_source: metric.location_source || metric.locationSource || "",
  locationUpdatedAt: metric.locationUpdatedAt || metric.location_updated_at || null,
  location_updated_at: metric.location_updated_at || metric.locationUpdatedAt || null,
  locationConfigured: Boolean(metric.locationConfigured || metric.location_configured || ((metric.latitude ?? metric.lat) !== null && (metric.latitude ?? metric.lat) !== "" && (metric.longitude ?? metric.lng ?? metric.lon) !== null && (metric.longitude ?? metric.lng ?? metric.lon) !== "")),
  salesToday: Number(metric.salesToday || metric.sales_today || 0),
  incomeToday: Number(metric.incomeToday || metric.income_today || 0),
  products: Number(metric.products || 0),
  cashRegisterOpen: Boolean(metric.cashRegisterOpen || metric.store_status === 'ABIERTA' || metric.storeStatus === 'ABIERTA'),
  businessWhatsApp: normalizeBusinessWhatsApp(metric.businessWhatsApp || metric.business_whatsapp || {}),
  business_whatsapp: normalizeBusinessWhatsApp(metric.business_whatsapp || metric.businessWhatsApp || {}),
});

const normalizeSlug = (value = '') => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 48);

const compactSlug = (value = '') => normalizeSlug(value).replace(/-/g, '');

const initialsFromWords = (value = '') => normalizeSlug(value)
  .split('-')
  .filter(Boolean)
  .map((word) => word.charAt(0))
  .join('');

const buildBusinessDisplayName = (typeName = '', businessName = '') => {
  const type = String(typeName || '').trim();
  const name = String(businessName || '').trim();
  if (!type) return name;
  if (type.toLowerCase() === "otro tipo de negocio") return name;
  if (!name) return type;
  if (name.toLowerCase().startsWith(type.toLowerCase())) return name;
  return `${type} ${name}`.replace(/\s+/g, ' ').trim();
};

const buildAutoTenantSlug = (form: any = {}) => {
  const finalName = buildBusinessDisplayName(form.business_type_name, form.business_name || form.name);
  let base = compactSlug(finalName);
  const locationCode = compactSlug([
    initialsFromWords(form.province),
    initialsFromWords(form.municipality),
    initialsFromWords(form.neighborhood),
  ].join(''));
  if (!base) return '';
  if (!locationCode) return base.slice(0, 48);
  const maxBaseLength = Math.max(8, 48 - locationCode.length - 1);
  if (base.length > maxBaseLength) base = base.slice(0, maxBaseLength);
  return `${base}-${locationCode}`.slice(0, 48).replace(/-+$/, '');
};

const inferRootDomain = () => {
  const configured = getRootDomain();
  if (configured) return configured;
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname || '';
  if (!host || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return '';
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
};

const buildAutoTenantDomain = (form: any = {}, rootDomain = '') => {
  const slug = buildAutoTenantSlug(form);
  if (!slug) return '';
  return rootDomain ? `${slug}.${rootDomain}` : slug;
};

const buildAddressLine = (form: any = {}) => buildTerritoryAddressLine(form);

const ownerTenantEmptyForm = {
  name: '',
  business_name: '',
  business_type_id: '',
  business_type_name: '',
  business_type_slug: '',
  slug: '',
  domain: '',
  plan_slug: 'starter',
  ...emptyTerritoryAddress,
  address: '',
  latitude: '',
  longitude: '',
  locationAccuracy: null,
  location_accuracy: null,
  locationSource: '',
  location_source: '',
  locationUpdatedAt: null,
  location_updated_at: null,
};

const normalizeDeliveryScope = (value = 'municipal') => {
  const raw = String(value || '').toLowerCase().trim();
  return raw === 'provincial' ? 'provincial' : 'municipal';
};


const normalizeServiceHours = (value = {}) => {
  const source = parseJSONField(value, {});
  return SERVICE_DAYS.reduce((acc, day) => {
    const item = source?.[day.key] || {};
    acc[day.key] = {
      enabled:
        typeof item.enabled === "boolean"
          ? item.enabled
          : DEFAULT_SERVICE_HOURS[day.key].enabled,
      open: item.open || DEFAULT_SERVICE_HOURS[day.key].open,
      close: item.close || DEFAULT_SERVICE_HOURS[day.key].close,
    };
    return acc;
  }, {});
};

const serviceHoursSummary = (hours = {}) => {
  const normalized: any = normalizeServiceHours(hours);
  const openDays = SERVICE_DAYS.filter((day) => normalized[day.key]?.enabled);
  if (openDays.length === 0) return "Horario no configurado";
  const first = normalized[openDays[0].key];
  const sameHours = openDays.every(
    (day) =>
      normalized[day.key].open === first.open &&
      normalized[day.key].close === first.close,
  );
  if (openDays.length === 7 && sameHours)
    return `Todos los días · ${first.open} - ${first.close}`;
  if (openDays.length === 6 && !normalized.sunday?.enabled && sameHours)
    return `Lun - Sáb · ${first.open} - ${first.close}`;
  return `${openDays.map((day) => day.short).join(", ")}${sameHours ? ` · ${first.open} - ${first.close}` : ""}`;
};

const emptyForm = {
  name: "",
  slogan: "",
  address: "",
  ...emptyTerritoryAddress,
  latitude: "",
  longitude: "",
  locationAccuracy: null,
  location_accuracy: null,
  locationSource: "",
  location_source: "",
  locationUpdatedAt: null,
  location_updated_at: null,
  whatsapp: "",
  whatsappDisplay: "",
  countryCode: "do",
  dialCode: "+1",
  isValid: false,
  emoji: "🏪",
  logoUrl: "",
  logo_url: "",
  color: "#00a884",
  serviceHours: normalizeServiceHours(),
  deliveryScope: 'municipal',
};

const storeLocationDraft = (value: any = {}) => ({
  latitude: value.latitude ?? value.lat ?? "",
  lat: value.lat ?? value.latitude ?? "",
  longitude: value.longitude ?? value.lng ?? value.lon ?? "",
  lng: value.lng ?? value.longitude ?? value.lon ?? "",
  locationAccuracy: value.locationAccuracy ?? value.location_accuracy ?? null,
  location_accuracy: value.location_accuracy ?? value.locationAccuracy ?? null,
  locationSource: value.locationSource || value.location_source || "",
  location_source: value.location_source || value.locationSource || "",
  locationUpdatedAt: value.locationUpdatedAt || value.location_updated_at || null,
  location_updated_at: value.location_updated_at || value.locationUpdatedAt || null,
});

const locationDraftSignature = (value: any = {}) => {
  const location = storeLocationDraft(value);
  return JSON.stringify({
    latitude: String(location.latitude ?? "").trim(),
    longitude: String(location.longitude ?? "").trim(),
    accuracy: location.locationAccuracy ?? null,
    source: String(location.locationSource || ""),
    updatedAt: location.locationUpdatedAt || null,
  });
};

const BusinessCard = ({
  metric,
  isActive,
  onSwitch,
  onEdit,
  onDelete,
  onToggle,
  onScopeChange,
  onOrderModeChange,
  onLocationSave,
  onWhatsApp,
  scopeSaving,
  scopeError,
  orderModeSaving,
  orderModeError,
  locationSaving,
  locationError,
}: any) => {
  const currentScope = normalizeDeliveryScope(metric.deliveryScope || metric.delivery_scope);
  const businessWhatsApp = normalizeBusinessWhatsApp(metric.businessWhatsApp || metric.business_whatsapp || {});
  const businessWhatsAppLinked = businessWhatsAppIsLinked(businessWhatsApp);
  const paymentSettings = normalizePaymentSettings(metric.paymentSettings || metric.payment_settings || {});
  const orderModes = normalizeOrderModes(metric.orderModes || metric.order_modes || paymentSettings.orderModes || paymentSettings.order_modes);
  const [locationDraft, setLocationDraft] = useState(() => storeLocationDraft(metric));
  const metricLocationSignature = locationDraftSignature(metric);
  const draftLocationSignature = locationDraftSignature(locationDraft);
  const locationHasChanges = metricLocationSignature !== draftLocationSignature;
  const locationIsValid = isStoreLocationPairValid(locationDraft);
  const scopeOptions = [
    { value: 'provincial', label: 'Provincial' },
    { value: 'municipal', label: 'Municipal' },
  ];
  const orderModeOptions = [
    { key: 'delivery', label: 'Entrega', description: 'Entrega al cliente', icon: FiTruck },
    { key: 'pickup', label: 'Recogida', description: 'Retiro en el negocio', icon: FiPackage },
  ];
  const toggleOrderMode = (key: string) => {
    const next = { ...orderModes, [key]: !orderModes[key] };
    if (!next.delivery && !next.pickup) return;
    onOrderModeChange?.(next);
  };

  useEffect(() => {
    setLocationDraft(storeLocationDraft(metric));
  }, [metric.id, metricLocationSignature]);

  return (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
      isActive ? "shadow-md" : "border-gray-100"
    }`}
    style={isActive ? { borderColor: metric.color || "#00a884" } : undefined}
  >
    <div className="p-4 flex items-start gap-3">
      <StoreAvatar
        store={metric}
        className="w-14 h-14 rounded-2xl shadow-sm"
        textClassName="text-2xl"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-black text-gray-800 text-sm truncate">
            {metric.name}
          </p>
          {isActive && (
            <span
              className="text-[9px] font-black text-white px-2 py-0.5 rounded-full shrink-0"
              style={{ backgroundColor: metric.color || "#00a884" }}
            >
              ACTIVO
            </span>
          )}
          <span
            className={`text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 ${
              metric.active
                ? "bg-emerald-100 text-emerald-600"
                : "bg-gray-100 text-gray-400"
            }`}
          >
            {metric.active ? "Habilitado" : "Deshabilitado"}
          </span>
        </div>
        {metric.slogan && (
          <p className="text-[11px] text-gray-500 italic mt-0.5 truncate">
            "{metric.slogan}"
          </p>
        )}
        <div className="flex items-center gap-1 mt-1">
          <FiMapPin className="text-gray-400 text-[10px] shrink-0" />
          <p className="text-[11px] text-gray-400 truncate">
            {metric.address || "Sin dirección"}
          </p>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <FiNavigation className={`text-[10px] shrink-0 ${metric.locationConfigured || metric.location_configured ? "text-[#00a884]" : "text-amber-400"}`} />
          <p className={`text-[10px] font-bold ${metric.locationConfigured || metric.location_configured ? "text-[#00a884]" : "text-amber-500"}`}>
            {metric.locationConfigured || metric.location_configured ? "Ubicación GPS configurada" : "Ubicación GPS pendiente"}
          </p>
        </div>
        {metric.whatsapp && (
          <div className="flex items-center gap-1 mt-0.5">
            <FiPhone className="text-gray-400 text-[10px] shrink-0" />
            <p className="text-[11px] text-gray-400">
              {metric.whatsappDisplay || metric.whatsapp}
            </p>
          </div>
        )}
        <div className="flex items-center gap-1 mt-0.5">
          <FiClock className="text-gray-400 text-[10px] shrink-0" />
          <p className="text-[11px] text-gray-400 truncate">
            {serviceHoursSummary(metric.serviceHours || metric.service_hours || {})}
          </p>
        </div>
      </div>
    </div>

    <div className="grid grid-cols-3 border-t border-gray-50 divide-x divide-gray-50">
      {[
        { label: "Ventas hoy", value: metric.salesToday },
        { label: "Ingresos", value: `RD$ ${fmt(metric.incomeToday)}` },
        { label: "Productos", value: metric.products },
      ].map((s) => (
        <div key={s.label} className="py-3 text-center">
          <p className="font-black text-gray-800 text-sm">{s.value}</p>
          <p className="text-[9px] text-gray-400 mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>

    <div
      className={`mx-4 mb-3 mt-1 px-3 py-2 rounded-xl flex items-center gap-2 ${
        metric.cashRegisterOpen
          ? "bg-emerald-50 border border-emerald-100"
          : "bg-gray-50 border border-gray-100"
      }`}
    >
      {metric.cashRegisterOpen ? (
        <FiUnlock className="text-emerald-500 text-xs shrink-0" />
      ) : (
        <FiLock className="text-gray-400 text-xs shrink-0" />
      )}
      <span
        className={`text-[10px] font-black ${metric.cashRegisterOpen ? "text-emerald-600" : "text-gray-400"}`}
      >
        Caja {metric.cashRegisterOpen ? "ABIERTA" : "CERRADA"}
      </span>
      {metric.cashRegisterOpen && (
        <span className="ml-auto w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
      )}
    </div>

    <div className={`mx-4 mb-3 rounded-2xl border p-3 ${businessWhatsAppLinked ? "border-[#00a884]/20 bg-[#f0fbf8]" : "border-gray-100 bg-gray-50"}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center overflow-hidden shrink-0 ${businessWhatsAppLinked ? "bg-white border border-[#00a884]/20" : "bg-white border border-gray-200"}`}>
            {businessWhatsAppLinked && businessWhatsApp.profile_picture_url ? (
              <img src={businessWhatsApp.profile_picture_url} alt="WhatsApp del negocio" className="w-full h-full object-cover" />
            ) : (
              <FiMessageCircle className={`text-lg ${businessWhatsAppLinked ? "text-[#00a884]" : "text-gray-400"}`} />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">WhatsApp de notificaciones</p>
            <p className={`text-xs font-black truncate ${businessWhatsAppLinked ? "text-[#008f72]" : "text-gray-700"}`}>
              {businessWhatsAppLinked
                ? businessWhatsApp.profile_name || businessWhatsApp.display_phone || "WhatsApp vinculado"
                : "Sin vincular"}
            </p>
            {!businessWhatsAppLinked && (
              <p className="text-[10px] text-gray-400 truncate mt-0.5">
                Vincúlalo para enviar pedidos y avisos desde este negocio.
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onWhatsApp}
          className={`rounded-xl px-4 py-2.5 text-xs font-black flex items-center justify-center gap-2 shrink-0 transition-colors ${businessWhatsAppLinked ? "bg-white border border-[#00a884]/20 text-[#008f72] hover:bg-[#eafaf1]" : "bg-[#00a884] text-white shadow-sm shadow-[#00a884]/20 hover:bg-[#008f72]"}`}
        >
          {businessWhatsAppLinked ? <FiWifi className="text-sm" /> : <FiLink className="text-sm" />}
          {businessWhatsAppLinked ? "Gestionar WhatsApp" : "Vincular WhatsApp"}
        </button>
      </div>
    </div>

    <div className="mx-4 mb-3 space-y-2">
      <StoreLocationPicker
        value={locationDraft}
        onChange={(location) => setLocationDraft((current) => ({ ...current, ...location }))}
      />
      {(locationHasChanges || locationSaving || locationError) && (
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-2.5">
          {locationError && (
            <p className="mb-2 px-1 text-[11px] font-bold text-red-500">{locationError}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={locationSaving || !locationHasChanges}
              onClick={() => setLocationDraft(storeLocationDraft(metric))}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-black text-gray-500 transition-colors hover:bg-gray-100 disabled:cursor-default disabled:opacity-50"
            >
              Descartar cambios
            </button>
            <button
              type="button"
              disabled={locationSaving || !locationHasChanges || !locationIsValid}
              onClick={() => onLocationSave?.(locationDraft)}
              className="rounded-xl bg-[#00a884] px-4 py-2.5 text-xs font-black text-white shadow-sm shadow-[#00a884]/20 transition-colors hover:bg-[#008f72] disabled:cursor-default disabled:opacity-60"
            >
              {locationSaving ? "Guardando ubicación..." : "Guardar ubicación"}
            </button>
          </div>
        </div>
      )}
    </div>

    <div className="mx-4 mb-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
            Alcance
          </label>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Define hasta dónde puede configurar zonas de entrega este negocio.
          </p>
        </div>
        <div className="inline-flex items-center rounded-2xl bg-white border border-gray-200 p-1 shadow-sm self-start sm:self-auto">
          {scopeOptions.map((option) => {
            const active = currentScope === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={scopeSaving || active}
                onClick={() => onScopeChange?.(option.value)}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${active ? 'bg-[#00a884] text-white shadow-md shadow-[#00a884]/20' : 'text-gray-400 hover:text-gray-700'} disabled:cursor-default disabled:opacity-80`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="bg-white border border-gray-100 rounded-xl px-3 py-2">
        <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
          {currentScope === 'provincial'
            ? 'Provincial: las zonas y clientes usarán automáticamente la provincia del negocio y podrán elegir municipios/distritos y barrios dentro de esa provincia.'
            : 'Municipal: las zonas y clientes usarán automáticamente la provincia y el municipio/distrito del negocio; solo seleccionarán el barrio o sector.'}
        </p>
      </div>
      {scopeSaving && (
        <p className="text-[11px] font-bold text-[#00a884]">Guardando alcance...</p>
      )}
      {scopeError && (
        <p className="text-[11px] font-bold text-red-500">{scopeError}</p>
      )}
    </div>

    <div className="mx-4 mb-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
            Modalidad de pedidos
          </label>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Habilita entrega y/o recogida. Siempre debe quedar al menos una modalidad disponible.
          </p>
        </div>
        {orderModeSaving && (
          <span className="text-[10px] font-black text-[#00a884] bg-[#eafaf1] px-3 py-1.5 rounded-xl self-start">
            Guardando...
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {orderModeOptions.map((option) => {
          const Icon = option.icon;
          const enabled = Boolean(orderModes[option.key]);
          const isLastEnabled = enabled && !orderModeOptions.some((other) => other.key !== option.key && orderModes[other.key]);
          return (
            <button
              key={option.key}
              type="button"
              disabled={orderModeSaving || isLastEnabled}
              onClick={() => toggleOrderMode(option.key)}
              className={`rounded-2xl border-2 px-3 py-3 text-left transition-all ${enabled ? 'bg-[#f0fbf8] border-[#bce8d1] text-[#00a884]' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'} disabled:cursor-default disabled:opacity-90`}
              title={isLastEnabled ? 'Debe quedar al menos una modalidad habilitada' : undefined}
            >
              <div className="flex items-center gap-2">
                <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${enabled ? 'bg-[#00a884] text-white' : 'bg-gray-100 text-gray-400'}`}>
                  <Icon className="text-sm" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black truncate">{option.label}</p>
                  <p className="text-[10px] font-semibold opacity-70 truncate">{enabled ? 'Habilitada' : 'Deshabilitada'} · {option.description}</p>
                </div>
                {enabled && <FiCheck className="text-sm shrink-0" />}
              </div>
            </button>
          );
        })}
      </div>
      <div className="bg-white border border-gray-100 rounded-xl px-3 py-2">
        <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
          En la funda, el cliente debe elegir una sola modalidad por pedido. Si elige entrega, se calcula el costo de entrega según su zona.
        </p>
      </div>
      {orderModeError && (
        <p className="text-[11px] font-bold text-red-500">{orderModeError}</p>
      )}
    </div>

    <div className="flex gap-2 px-4 pb-4">
      {!isActive && metric.active && (
        <button
          onClick={onSwitch}
          className="flex-1 py-2.5 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-transform"
          style={{ backgroundColor: metric.color || "#00a884" }}
        >
          <FiActivity className="text-sm" /> Gestionar este
        </button>
      )}
      {isActive && (
        <div
          className="flex-1 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
          style={{
            color: metric.color || "#00a884",
            backgroundColor: `${metric.color || "#00a884"}18`,
          }}
        >
          <FiCheck className="text-sm" /> Negocio activo
        </div>
      )}
      <button
        onClick={onToggle}
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
          metric.active
            ? "bg-amber-50 text-amber-500"
            : "bg-emerald-50 text-emerald-500"
        }`}
        title={metric.active ? "Deshabilitar" : "Habilitar"}
      >
        {metric.active ? (
          <FiToggleRight className="text-lg" />
        ) : (
          <FiToggleLeft className="text-lg" />
        )}
      </button>
      <button
        onClick={onEdit}
        className="w-10 h-10 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center"
      >
        <FiEdit2 className="text-sm" />
      </button>
      <button
        onClick={onDelete}
        className="w-10 h-10 bg-red-50 text-red-400 rounded-xl flex items-center justify-center"
      >
        <FiTrash2 className="text-sm" />
      </button>
    </div>
  </motion.div>
  );
};

const businessPairingErrorMessage = (error: any) => {
  const message = String(error?.message || "").trim();
  if (/pair[-_ ]?code.*iq|pair_with_code|iq request failed|internal error/i.test(message)) {
    return "WhatsApp no pudo iniciar la vinculación por número en este intento. Espera unos segundos y vuelve a generar el código, o utiliza el código QR.";
  }
  return message || "No se pudo generar el código de emparejamiento.";
};

const BusinessWhatsAppModal = ({ business, onClose, onUpdated }: any) => {
  const targetTenantID = tenantID(business);
  const initialWhatsApp = normalizeBusinessWhatsApp(business?.businessWhatsApp || business?.business_whatsapp || {});
  const [state, setState] = useState(initialWhatsApp);
  const [mode, setMode] = useState<"qr" | "pairing">("qr");
  const [qrCode, setQrCode] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [linkAttemptStarted, setLinkAttemptStarted] = useState(false);
  const [phoneState, setPhoneState] = useState(() => ({
    whatsapp: business?.whatsapp || initialWhatsApp.phone || "",
    whatsappDisplay: business?.whatsappDisplay || business?.whatsapp_display || initialWhatsApp.display_phone || "",
    countryCode: business?.countryCode || business?.country_code || "do",
    dialCode: business?.dialCode || business?.dial_code || "+1",
    isValid: Boolean(business?.whatsapp || initialWhatsApp.phone),
  }));

  const linked = businessWhatsAppIsLinked(state);
  const qrSrc = businessQRImageSource(qrCode);
  const endpoint = `/admin/businesses/${encodeURIComponent(targetTenantID)}/whatsapp`;

  const applyPayload = (payload: any) => {
    const next = normalizeBusinessWhatsApp(payload?.whatsapp || payload?.business_whatsapp || payload || {});
    setState(next);
    if (businessWhatsAppIsLinked(next)) {
      setQrCode("");
      setPairingCode("");
      setLinkAttemptStarted(false);
      setNotice("");
    }
    onUpdated?.(next);
    return next;
  };

  const loadState = async (silent = false) => {
    if (!targetTenantID) return;
    if (!silent) setLoading("state");
    try {
      const payload = await api.get(endpoint);
      applyPayload(payload);
      if (!silent) setError("");
    } catch (err: any) {
      if (!silent) setError(err?.message || "No se pudo consultar el WhatsApp del negocio.");
    } finally {
      if (!silent) setLoading("");
    }
  };

  useEffect(() => {
    loadState();
  }, [targetTenantID]);

  useEffect(() => {
    if (linked || (!qrCode && !pairingCode && !state.connected)) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const payload = await api.get(`${endpoint}/status`);
        applyPayload(payload);
      } catch (_) {
        // La vinculación puede tardar unos segundos; el estado visible se conserva.
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [endpoint, linked, qrCode, pairingCode, state.connected]);

  const generateQR = async () => {
    if (loading) return;
    setMode("qr");
    setLoading("qr");
    setError("");
    setNotice("");
    setPairingCode("");
    setLinkAttemptStarted(true);
    try {
      const payload = await api.get(`${endpoint}/qr`);
      const next = applyPayload(payload);
      if (!businessWhatsAppIsLinked(next)) {
        const code = String(payload?.qr_code || payload?.qrCode || payload?.qr || "").trim();
        if (!code) throw new Error("WAMERCIO no pudo obtener un código QR válido. Vuelve a intentarlo.");
        setQrCode(code);
        setNotice("Escanea el código desde WhatsApp > Dispositivos vinculados.");
      }
    } catch (err: any) {
      setError(err?.message || "No se pudo generar el código QR.");
    } finally {
      setLoading("");
    }
  };

  const generatePairingCode = async () => {
    if (loading) return;
    if (!phoneState.whatsapp || phoneState.isValid === false) {
      setError("Completa un número de WhatsApp válido para generar el código.");
      return;
    }
    setMode("pairing");
    setLoading("pairing");
    setError("");
    setNotice("");
    setQrCode("");
    setLinkAttemptStarted(true);
    try {
      const payload = await api.post(`${endpoint}/pairing-code`, { phone: phoneState.whatsapp });
      const next = applyPayload(payload);
      if (!businessWhatsAppIsLinked(next)) {
        const code = String(payload?.pairing_code || payload?.linking_code || payload?.pairingCode || "").trim();
        if (!code) throw new Error("WAMERCIO no pudo obtener un código de emparejamiento válido.");
        setPairingCode(code);
        setNotice(
          payload?.push_notification_requested
            ? "Revisa la notificación de WhatsApp en tu teléfono y tócala para continuar. Si no aparece, abre Dispositivos vinculados → Vincular con número de teléfono e introduce el código."
            : "En WhatsApp abre Dispositivos vinculados → Vincular con número de teléfono e introduce este código.",
        );
      }
    } catch (err: any) {
      setError(businessPairingErrorMessage(err));
    } finally {
      setLoading("");
    }
  };

  const disconnect = async () => {
    if (loading || !window.confirm("¿Desvincular el WhatsApp de este negocio? La sesión también se eliminará de WAMERCIO.")) return;
    setLoading("disconnect");
    setError("");
    try {
      const payload = await api.post(`${endpoint}/disconnect`, {});
      applyPayload(payload);
      setQrCode("");
      setPairingCode("");
      setLinkAttemptStarted(false);
      setNotice("WhatsApp desvinculado. Puedes iniciar una nueva vinculación.");
    } catch (err: any) {
      setError(err?.message || "No se pudo desvincular el WhatsApp del negocio.");
    } finally {
      setLoading("");
    }
  };

  const closeModal = async () => {
    if (loading) return;
    const status = String(state?.status || "").toLowerCase();
    const hasPendingLink = !linked && Boolean(
      linkAttemptStarted
      || qrCode
      || pairingCode
      || state?.connected
      || ["connecting", "qr_ready", "pairing_code_ready", "waiting_for_qr", "waiting_for_pair_code"].includes(status),
    );
    if (!hasPendingLink) {
      onClose?.();
      return;
    }

    setLoading("cancel");
    setError("");
    try {
      const payload = await api.post(`${endpoint}/disconnect`, {});
      applyPayload(payload);
      onClose?.();
    } catch (err: any) {
      setError(err?.message || "No se pudo cancelar la vinculación. Vuelve a intentarlo para evitar una sesión pendiente.");
    } finally {
      setLoading("");
    }
  };

  const copyPairingCode = async () => {
    try {
      await navigator.clipboard.writeText(String(pairingCode || "").replace(/\s/g, ""));
      setNotice("Código copiado.");
    } catch (_) {
      setNotice("Selecciona y copia el código manualmente.");
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/55 backdrop-blur-sm z-[70]"
        onClick={closeModal}
      />
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 18 }}
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
          className="pointer-events-auto w-full max-w-2xl max-h-[calc(100dvh-1.5rem)] overflow-y-auto bg-white rounded-3xl shadow-2xl"
        >
          <div className="p-5 sm:p-6 border-b border-gray-100 flex items-start justify-between gap-4 sticky top-0 bg-white z-10">
            <div>
              <p className="text-[10px] font-black text-[#00a884] uppercase tracking-widest">WhatsApp del negocio</p>
              <h2 className="text-xl font-black text-gray-900 mt-1">{linked ? "WhatsApp vinculado" : "Vincular WhatsApp"}</h2>
            </div>
            <button type="button" onClick={closeModal} disabled={Boolean(loading)} className="w-9 h-9 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center shrink-0 disabled:opacity-50">
              <FiX />
            </button>
          </div>

          <div className="p-5 sm:p-6 space-y-5">
            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-600">
                {error}
              </div>
            )}
            {notice && !error && (
              <div className="rounded-2xl border border-[#00a884]/20 bg-[#f0fbf8] px-4 py-3 text-xs font-bold text-[#008f72]">
                {notice}
              </div>
            )}

            {linked ? (
              <div className="rounded-3xl border border-[#00a884]/20 bg-[#f0fbf8] p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="w-20 h-20 rounded-3xl bg-white border border-[#00a884]/20 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                    {state.profile_picture_url ? (
                      <img src={state.profile_picture_url} alt="Perfil de WhatsApp" className="w-full h-full object-cover" />
                    ) : (
                      <FiMessageCircle className="text-3xl text-[#00a884]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00a884]/20 bg-white px-3 py-1 text-[10px] font-black text-[#008f72]">
                      <FiCheckCircle /> Vinculado correctamente
                    </span>
                    <p className="text-xl font-black text-gray-900 mt-3 truncate">{state.profile_name || business?.name || "WhatsApp del negocio"}</p>
                    <p className="text-sm font-black text-[#00a884] mt-1">{state.display_phone || (state.phone ? `+${state.phone}` : "Número vinculado")}</p>
                    <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                      Esta cuenta se utilizará para enviar las notificaciones, pedidos y avisos de este negocio.
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl bg-white border border-[#00a884]/15 px-4 py-3 mt-5">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Dispositivo en WhatsApp</p>
                  <p className="text-xs font-black text-gray-800 mt-1">WAMERCIO</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 mt-5">
                  <button type="button" disabled={Boolean(loading)} onClick={() => loadState()} className="flex-1 rounded-2xl bg-white border border-[#00a884]/20 text-[#008f72] px-4 py-3 text-xs font-black flex items-center justify-center gap-2 disabled:opacity-60">
                    <FiRefreshCw className={loading === "state" ? "animate-spin" : ""} /> Actualizar estado
                  </button>
                  <button type="button" disabled={Boolean(loading)} onClick={disconnect} className="flex-1 rounded-2xl bg-red-50 border border-red-100 text-red-500 px-4 py-3 text-xs font-black flex items-center justify-center gap-2 disabled:opacity-60">
                    <FiLogOut /> {loading === "disconnect" ? "Desvinculando..." : "Desvincular"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-gray-100 p-1.5">
                  <button
                    type="button"
                    disabled={Boolean(loading)}
                    onClick={generateQR}
                    className={`rounded-xl px-3 py-3 text-xs font-black flex items-center justify-center gap-2 transition-all ${mode === "qr" ? "bg-white text-[#00a884] shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
                  >
                    <FiGrid /> {loading === "qr" ? "Generando..." : "Código QR"}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(loading)}
                    onClick={() => {
                      setMode("pairing");
                      setQrCode("");
                      setError("");
                      setNotice("");
                    }}
                    className={`rounded-xl px-3 py-3 text-xs font-black flex items-center justify-center gap-2 transition-all ${mode === "pairing" ? "bg-white text-[#00a884] shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
                  >
                    <FiSmartphone /> Emparejamiento
                  </button>
                </div>

                {mode === "qr" ? (
                  <div className="rounded-3xl border border-gray-100 bg-gray-50 p-5 text-center">
                    {qrCode && qrSrc ? (
                      <>
                        <div className="w-fit mx-auto rounded-3xl bg-white border border-gray-200 p-4 shadow-sm">
                          <img src={qrSrc} alt="Código QR de WhatsApp" className="w-64 h-64 max-w-full object-contain" />
                        </div>
                        <p className="text-xs font-black text-gray-800 mt-4">Escanea desde tu teléfono</p>
                        <p className="text-[11px] text-gray-500 mt-1">WhatsApp → Dispositivos vinculados → Vincular un dispositivo.</p>
                      </>
                    ) : (
                      <div className="py-8">
                        <div className="w-16 h-16 rounded-2xl bg-white border border-gray-200 flex items-center justify-center mx-auto text-[#00a884]">
                          <FiGrid className="text-2xl" />
                        </div>
                        <p className="text-sm font-black text-gray-800 mt-4">Vinculación mediante código QR</p>
                        <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">Genera un código QR seguro para vincular el WhatsApp del negocio.</p>
                        <button type="button" disabled={Boolean(loading)} onClick={generateQR} className="mt-5 rounded-2xl bg-[#00a884] text-white px-6 py-3 text-xs font-black shadow-md shadow-[#00a884]/20 disabled:opacity-60">
                          {loading === "qr" ? "Generando código..." : "Generar código QR"}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-gray-100 bg-gray-50 p-5 space-y-4">
                    <div>
                      <p className="text-sm font-black text-gray-800">Vinculación con número de teléfono</p>
                      <p className="text-[11px] text-gray-400 mt-1">Introduce el WhatsApp del negocio y luego escribe el código en la aplicación.</p>
                    </div>
                    <PhoneInput
                      value={phoneState.whatsapp}
                      placeholder="WhatsApp del negocio"
                      required
                      valid={phoneState.isValid}
                      onChange={(phone) => setPhoneState(phone)}
                    />
                    {pairingCode ? (
                      <div className="rounded-2xl border border-[#00a884]/20 bg-white p-5 text-center">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Código de emparejamiento</p>
                        <p className="text-3xl sm:text-4xl font-black tracking-[0.18em] text-gray-900 mt-3">{formatPairingCode(pairingCode)}</p>
                        <button type="button" onClick={copyPairingCode} className="mt-4 rounded-xl bg-[#eafaf1] text-[#008f72] px-4 py-2.5 text-xs font-black inline-flex items-center gap-2">
                          <FiCopy /> Copiar código
                        </button>
                      </div>
                    ) : (
                      <button type="button" disabled={Boolean(loading) || phoneState.isValid === false} onClick={generatePairingCode} className="w-full rounded-2xl bg-[#00a884] text-white px-5 py-3.5 text-xs font-black shadow-md shadow-[#00a884]/20 disabled:opacity-60">
                        {loading === "pairing" ? "Generando código..." : "Generar código de emparejamiento"}
                      </button>
                    )}
                    <p className="text-[10px] text-gray-400 leading-relaxed">
                      En WhatsApp abre Dispositivos vinculados, selecciona Vincular un dispositivo y luego Vincular con número de teléfono.
                    </p>
                  </div>
                )}
              </>
            )}

          </div>
        </motion.div>
      </div>
    </>
  );
};

const BusinessModal = ({ initial, onSave, onClose }: any) => {
  const [form, setForm] = useState(() => {
    const source = initial || emptyForm;
    const scope = normalizeDeliveryScope(source.deliveryScope || source.delivery_scope);
    return {
      ...source,
      serviceHours: normalizeServiceHours(source.serviceHours || source.service_hours),
      deliveryScope: scope,
      delivery_scope: scope,
      latitude: source.latitude ?? source.lat ?? "",
      longitude: source.longitude ?? source.lng ?? source.lon ?? "",
      locationAccuracy: source.locationAccuracy ?? source.location_accuracy ?? null,
      location_accuracy: source.location_accuracy ?? source.locationAccuracy ?? null,
      locationSource: source.locationSource || source.location_source || "",
      location_source: source.location_source || source.locationSource || "",
      locationUpdatedAt: source.locationUpdatedAt || source.location_updated_at || null,
      location_updated_at: source.location_updated_at || source.locationUpdatedAt || null,
    };
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const hasName = Boolean(String(form.name || '').trim());
  const hasWhatsapp = Boolean(form.whatsapp) && form.isValid !== false;
  const locationPairValid = isStoreLocationPairValid(form);
  const valid = (initial
    ? hasName && hasWhatsapp
    : hasName && hasWhatsapp && isTerritoryAddressComplete(form))
    && locationPairValid;
  const previewAddress =
    buildTerritoryAddressLine(form) || form.address || "Dirección";
  const handleAddress = (data) =>
    setForm((f) => ({
      ...f,
      ...data,
      address: buildTerritoryAddressLine(data),
    }));
  const updateServiceDay = (dayKey, patch) =>
    setForm((f) => ({
      ...f,
      serviceHours: {
        ...normalizeServiceHours(f.serviceHours),
        [dayKey]: {
          ...normalizeServiceHours(f.serviceHours)[dayKey],
          ...patch,
        },
      },
    }));

  const logoUrl = String(form.logoUrl || form.logo_url || '').trim();

  const handleLogoFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSaveError('Selecciona una imagen válida para el logo del negocio.');
      event.target.value = '';
      return;
    }
    if (file.size > 1024 * 1024) {
      setSaveError('El logo no debe superar 1 MB para mantener rápida la PWA.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      setForm((f) => ({ ...f, logoUrl: value, logo_url: value }));
      setSaveError('');
    };
    reader.onerror = () => setSaveError('No se pudo leer la imagen seleccionada.');
    reader.readAsDataURL(file);
  };

  const clearLogo = () => {
    setForm((f) => ({ ...f, logoUrl: '', logo_url: '' }));
  };

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await onSave(form);
    } catch (err: any) {
      setSaveError(err?.message || 'No se pudieron guardar los cambios del negocio.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
          className="pointer-events-auto w-full max-w-5xl bg-white rounded-3xl shadow-2xl max-h-[calc(100vh-2rem)] overflow-y-auto"
        >
          <div className="p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-gray-800 text-xl">
                {initial ? "Editar Negocio" : "Nuevo Negocio"}
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center"
              >
                <FiX className="text-gray-500 text-sm" />
              </button>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-gray-50">
              <StoreAvatar
                store={form}
                className="w-14 h-14 rounded-2xl"
                textClassName="text-2xl"
              />
              <div>
                <p className="font-black text-gray-800 text-sm">
                  {form.name || "Nombre del negocio"}
                </p>
                {form.slogan && (
                  <p className="text-xs text-gray-400 italic">
                    "{form.slogan}"
                  </p>
                )}
                <p className="text-xs text-gray-400">{previewAddress}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                  Nombre del negocio *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Ej. Negocio El Progreso"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00a884]/40 focus:border-[#00a884] bg-white font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                  WhatsApp de contacto *
                </label>
                <PhoneInput
                  value={form.whatsapp}
                  placeholder="Número de WhatsApp"
                  required
                  onChange={(phone) =>
                    setForm((f) => ({
                      ...f,
                      whatsapp: phone.whatsapp,
                      whatsappDisplay: phone.whatsappDisplay,
                      countryCode: phone.countryCode,
                      dialCode: phone.dialCode,
                      isValid: phone.isValid,
                    }))
                  }
                  valid={form.isValid}
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                Slogan o descripción breve
              </label>
              <input
                type="text"
                value={form.slogan}
                onChange={(e) =>
                  setForm((f) => ({ ...f, slogan: e.target.value }))
                }
                placeholder="Ej. Lo mejor del barrio"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00a884]/40 focus:border-[#00a884] bg-white"
              />
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                    Logo / icono del negocio
                  </label>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Este logo se usará en la tienda, el banner de instalación y el icono dinámico de la PWA.
                  </p>
                </div>
                <StoreAvatar store={form} className="w-14 h-14 rounded-2xl" textClassName="text-2xl" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                <label className="cursor-pointer rounded-2xl border border-dashed border-[#00a884]/30 bg-[#eafaf1] hover:bg-[#dff7ef] px-4 py-3 text-[#008f72] text-xs font-black flex items-center justify-center gap-2 transition-colors">
                  <FiUploadCloud className="text-base" /> Subir logo del negocio
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoFile} className="hidden" />
                </label>
                {logoUrl ? (
                  <button
                    type="button"
                    onClick={clearLogo}
                    className="rounded-2xl bg-white border border-gray-200 px-4 py-3 text-xs font-black text-gray-500 hover:text-red-500 hover:border-red-100 transition-colors flex items-center justify-center gap-2"
                  >
                    <FiRotateCcw className="text-sm" /> Usar icono base
                  </button>
                ) : (
                  <div className="rounded-2xl bg-white border border-gray-200 px-4 py-3 text-xs font-bold text-gray-400 flex items-center justify-center gap-2">
                    <FiImage className="text-sm" /> Sin logo personalizado
                  </div>
                )}
              </div>
              <div className="rounded-xl bg-white border border-gray-100 px-3 py-2 text-[11px] text-gray-500 leading-relaxed">
                Recomendado: imagen cuadrada PNG, JPG o WebP, hasta 1 MB. Si no subes logo, se usará el icono predeterminado.
              </div>
            </div>

            <TerritoryAddressForm
              value={form}
              onChange={handleAddress}
              title="Dirección del negocio"
              description="Selecciona la ubicación territorial del negocio y completa la calle y el número."
            />

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">
                Color de acento
              </label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={`w-9 h-9 rounded-xl border-2 transition-all flex items-center justify-center ${
                      form.color === c
                        ? "border-gray-800 scale-110"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  >
                    {form.color === c && (
                      <FiCheck className="text-white text-xs" />
                    )}
                  </button>
                ))}
                <label className="w-9 h-9 rounded-xl border-2 border-gray-200 bg-white flex items-center justify-center overflow-hidden cursor-pointer" title="Color personalizado">
                  <input
                    type="color"
                    value={form.color || '#00a884'}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    className="w-12 h-12 cursor-pointer border-0 bg-transparent"
                  />
                </label>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">Este color se aplicará al botón de instalación, manifest PWA, encabezados y acentos del negocio.</p>
            </div>

            <div>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                    Horario de servicio
                  </label>
                  <p className="text-xs text-gray-400">
                    Configura los días y horas en que tu negocio atiende
                    clientes.
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold text-[#00a884] bg-[#eafaf1] px-3 py-2 rounded-xl">
                  <FiClock className="text-sm" />{" "}
                  {serviceHoursSummary(form.serviceHours)}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SERVICE_DAYS.map((day) => {
                  const item = normalizeServiceHours(form.serviceHours)[
                    day.key
                  ];
                  return (
                    <div
                      key={day.key}
                      className={`rounded-2xl border p-3 transition-all ${item.enabled ? "bg-[#f0fbf8] border-[#bce8d1]" : "bg-gray-50 border-gray-100"}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateServiceDay(day.key, {
                              enabled: !item.enabled,
                            })
                          }
                          className={`text-xs font-black ${item.enabled ? "text-[#00a884]" : "text-gray-400"}`}
                        >
                          {day.label}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateServiceDay(day.key, {
                              enabled: !item.enabled,
                            })
                          }
                          className={`w-10 h-6 rounded-full p-0.5 transition-colors ${item.enabled ? "bg-[#00a884]" : "bg-gray-300"}`}
                          aria-label={
                            item.enabled
                              ? `Cerrar ${day.label}`
                              : `Abrir ${day.label}`
                          }
                        >
                          <span
                            className={`block w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${item.enabled ? "translate-x-4" : "translate-x-0"}`}
                          />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">
                            Apertura
                          </span>
                          <input
                            type="time"
                            value={item.open}
                            disabled={!item.enabled}
                            onChange={(e) =>
                              updateServiceDay(day.key, {
                                open: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold bg-white disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00a884]/40 focus:border-[#00a884]"
                          />
                        </div>
                        <div>
                          <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">
                            Cierre
                          </span>
                          <input
                            type="time"
                            value={item.close}
                            disabled={!item.enabled}
                            onChange={(e) =>
                              updateServiceDay(day.key, {
                                close: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold bg-white disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00a884]/40 focus:border-[#00a884]"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-[#eafaf1] border border-[#bce8d1] rounded-xl p-4">
              <p className="text-[11px] text-[#00a884] font-medium leading-relaxed">
                <span className="font-black">💡 Configuración del negocio:</span> Los cambios se aplican solo al negocio activo y mantienen separada su operación, inventario, ventas, fiados, caja y configuración.
              </p>
            </div>

            {saveError && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                <p className="text-[11px] text-amber-600 font-semibold leading-relaxed">{saveError}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2 pb-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="flex-1 py-3.5 bg-gray-100 text-gray-700 rounded-2xl font-bold text-sm disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={submit}
                disabled={!valid || saving}
                style={
                  valid && !saving
                    ? { backgroundColor: form.color || "#00a884" }
                    : undefined
                }
                className={`flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                  valid && !saving
                    ? "text-white shadow-lg"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                <FiCheck className="text-base" />
                {saving ? "Guardando..." : initial ? "Guardar cambios" : "Guardar configuración"}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
};


const OwnerTenantModal = ({ onClose }: any) => {
  const accessPolicy = useAccessPolicy();
  const [form, setForm] = useState(() => ({ ...ownerTenantEmptyForm }));
  const [plans, setPlans] = useState<any[]>([]);
  const [businessTypes, setBusinessTypes] = useState<any[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [businessTypeSearch, setBusinessTypeSearch] = useState('');
  const rootDomain = useMemo(inferRootDomain, []);

  const activePlans = useMemo(() => safeList(plans).filter((plan) => plan.active !== false), [plans]);
  const activeBusinessTypes = useMemo(() => safeList(businessTypes).filter((item) => item.active !== false), [businessTypes]);
  const filteredBusinessTypes = useMemo(() => {
    const q = normalizeSlug(businessTypeSearch);
    if (!q) return activeBusinessTypes;
    return activeBusinessTypes.filter((item) =>
      normalizeSlug(`${item.name || ''} ${item.slug || ''}`).includes(q),
    );
  }, [activeBusinessTypes, businessTypeSearch]);
  const generatedSlug = useMemo(() => buildAutoTenantSlug(form), [form.business_type_name, form.business_name, form.name, form.province, form.municipality, form.neighborhood]);
  const generatedDomain = useMemo(() => buildAutoTenantDomain(form, rootDomain), [generatedSlug, rootDomain]);

  useEffect(() => {
    let mounted = true;
    setLoadingCatalogs(true);
    Promise.allSettled([
      api.get('/admin/plans'),
      api.get('/admin/business-types'),
    ]).then(([plansResult, typesResult]) => {
      if (!mounted) return;
      const nextPlans = plansResult.status === 'fulfilled' ? safeList(plansResult.value) : [];
      const nextTypes = typesResult.status === 'fulfilled' ? safeList(typesResult.value) : [];
      setPlans(nextPlans);
      setBusinessTypes(nextTypes);
      setForm((prev) => ({
        ...prev,
        plan_slug: prev.plan_slug || nextPlans.find((plan) => plan.active !== false)?.slug || 'starter',
        business_type_id: prev.business_type_id || nextTypes.find((item) => item.active !== false)?.id || '',
        business_type_name: prev.business_type_name || nextTypes.find((item) => item.active !== false)?.name || '',
        business_type_slug: prev.business_type_slug || nextTypes.find((item) => item.active !== false)?.slug || '',
      }));
    }).catch((err) => {
      if (mounted) setError(err?.message || 'No se pudieron cargar los datos para crear el negocio.');
    }).finally(() => mounted && setLoadingCatalogs(false));
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    setForm((prev) => {
      const slug = buildAutoTenantSlug(prev);
      const domain = slug && rootDomain ? `${slug}.${rootDomain}` : slug;
      const name = buildBusinessDisplayName(prev.business_type_name, prev.business_name || prev.name);
      if (prev.slug === slug && prev.domain === domain && prev.name === name) return prev;
      return { ...prev, slug, domain, name };
    });
  }, [rootDomain, form.business_type_name, form.business_name, form.name, form.province, form.municipality, form.neighborhood]);

  const update = (key, value) => {
    setForm((prev) => {
      const next: any = { ...prev, [key]: value };
      if (key === 'business_type_id') {
        const type = activeBusinessTypes.find((item) => item.id === value);
        next.business_type_id = value;
        next.business_type_name = type?.name || '';
        next.business_type_slug = type?.slug || '';
        next.name = buildBusinessDisplayName(type?.name || '', prev.business_name || prev.name);
      }
      if (key === 'business_name' || key === 'name') {
        const businessName = String(value || '');
        next.business_name = businessName;
        next.name = buildBusinessDisplayName(prev.business_type_name, businessName);
      }
      return next;
    });
  };

  const updateAddress = (address) => {
    setForm((prev) => ({ ...prev, ...address, address: buildAddressLine(address) }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.business_type_id) {
      setError('Selecciona el tipo de negocio.');
      return;
    }
    if (!String(form.business_name || '').trim()) {
      setError('Completa el nombre del negocio.');
      return;
    }
    if (!form.province || !form.municipality || !form.neighborhood) {
      setError('Selecciona provincia, municipio/distrito y barrio para generar el subdominio correctamente.');
      return;
    }
    if (!String(form.street || '').trim() || !String(form.street_number || '').trim()) {
      setError('Completa calle y número del negocio.');
      return;
    }
    if (!isStoreLocationPairValid(form)) {
      setError('Completa una latitud y una longitud válidas, o elimina ambos valores.');
      return;
    }

    setSaving(true);
    try {
      const selectedType = activeBusinessTypes.find((item) => item.id === form.business_type_id);
      const fullName = buildBusinessDisplayName(form.business_type_name || selectedType?.name || '', form.business_name || form.name);
      const payload = {
        ...form,
        name: fullName,
        slug: buildAutoTenantSlug(form),
        domain: generatedDomain,
        business_type_id: selectedType?.id || form.business_type_id,
        business_type_name: selectedType?.name || form.business_type_name,
        business_type_slug: selectedType?.slug || form.business_type_slug,
        business_name: form.business_name || form.name,
        address: buildAddressLine(form),
        latitude: form.latitude === '' || form.latitude == null ? null : Number(form.latitude),
        longitude: form.longitude === '' || form.longitude == null ? null : Number(form.longitude),
        location_accuracy: form.locationAccuracy ?? form.location_accuracy ?? null,
        location_source: form.locationSource || form.location_source || '',
      };
      const response = await api.post('/admin/businesses', payload);
      if (response?.token) api.setAdminToken(response.token);
      const tenant = response?.tenant || response;
      if (tenant?.slug) api.setAdminTenant(tenant);
      onClose?.();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wamercio:data-changed'));
        window.location.hash = '/admin';
      }
    } catch (err) {
      setError(err?.message || 'No se pudo crear el negocio desde el panel administrativo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <motion.form
          onSubmit={submit}
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
          className="pointer-events-auto w-full max-w-5xl bg-white rounded-3xl shadow-2xl max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col"
        >
          <div className="p-5 sm:p-6 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0">
            <div>
              <p className="text-[10px] font-black text-[#00a884] uppercase tracking-widest">Nuevo negocio</p>
              <h2 className="text-xl font-black text-gray-900">Crear negocio</h2>
              <p className="text-xs text-gray-400 mt-1">Registra otro negocio bajo tu propiedad y crea su subdominio automáticamente.</p>
            </div>
            <button type="button" onClick={onClose} className="w-10 h-10 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200">
              <FiX className="text-gray-500 text-sm" />
            </button>
          </div>

          <div className="p-5 sm:p-6 overflow-y-auto scrollbar-hide space-y-5">
            {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
            {loadingCatalogs && <div className="rounded-2xl border border-[#00a884]/15 bg-[#f0fdf8] px-4 py-3 text-sm font-bold text-[#008f72]">Cargando planes y tipos de negocio...</div>}
            {!loadingCatalogs && activeBusinessTypes.length === 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">Primero crea al menos un tipo de negocio desde el panel de superadministración.</div>}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <label className="md:col-span-2 block">
                <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">Tipo y nombre del negocio *</span>
                <div className="relative mb-2">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={businessTypeSearch}
                    onChange={(event) => setBusinessTypeSearch(event.target.value)}
                    placeholder="Buscar tipo de negocio..."
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 py-2.5 text-xs font-bold text-gray-800 outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-1 focus-within:border-[#00a884] focus-within:ring-4 focus-within:ring-[#00a884]/10 transition-all">
                  <select
                    value={form.business_type_id}
                    onChange={(e) => { update('business_type_id', e.target.value); setBusinessTypeSearch(''); }}
                    required
                    className="sm:w-64 rounded-xl border border-transparent bg-white sm:bg-transparent px-4 py-3 text-gray-900 font-black outline-none cursor-pointer"
                  >
                    <option value="">Tipo de negocio</option>
                    {filteredBusinessTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                    {businessTypeSearch && filteredBusinessTypes.length === 0 && <option value="" disabled>No encontramos ese tipo</option>}
                  </select>
                  <div className="hidden sm:block w-px bg-gray-200 my-2" />
                  <input
                    value={form.business_name ?? ''}
                    onChange={(e) => update('business_name', e.target.value)}
                    required
                    className="flex-1 rounded-xl border border-transparent bg-white sm:bg-transparent px-4 py-3 text-gray-900 font-bold outline-none"
                    placeholder="Nombre comercial, ej. La Esquina"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-2">Busca la actividad más cercana. Si no aparece, selecciona “Otro tipo de negocio”.</p>
              </label>

              <label className="block">
                <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">Plan</span>
                <select value={form.plan_slug} onChange={(e) => update('plan_slug', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10">
                  {(activePlans.length ? activePlans : [{ slug: 'starter', name: 'Inicial' }]).map((plan) => <option key={plan.slug} value={plan.slug}>{plan.name || plan.slug}</option>)}
                </select>
              </label>

              <div className="md:col-span-2 rounded-2xl border border-[#00a884]/20 bg-[#f0fdf8] px-4 py-3">
                <p className="text-[10px] font-black text-[#008f72] uppercase tracking-widest">Nombre final</p>
                <p className="text-sm font-black text-gray-900">{buildBusinessDisplayName(form.business_type_name, form.business_name) || 'Selecciona nombre y completa el negocio'}</p>
                <p className="text-[11px] text-[#008f72] mt-1">{generatedDomain ? `Subdominio: ${generatedDomain}` : 'Selecciona la ubicación para generar el subdominio.'}</p>
              </div>

              <div className="md:col-span-2 xl:col-span-3 border-t border-gray-100 pt-4 mt-1">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ubicación</p>
                <p className="text-xs text-gray-400 mt-1">Configura la dirección inicial del negocio.</p>
              </div>
              <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <TerritoryAddressForm
                  value={form}
                  title="Ubicación del negocio"
                  description="Selecciona provincia, municipio/distrito y barrio. Luego completa la calle y el número."
                  compact
                  onChange={updateAddress}
                />
              </div>

              <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-[#00a884]/15 bg-[#f0fdf8] px-4 py-3">
                <p className="text-[10px] font-black text-[#008f72] uppercase tracking-widest">Acceso administrativo</p>
                <p className="text-xs font-bold text-gray-700 mt-1">Tú serás el propietario y administrador de este negocio.</p>
                <p className="text-[11px] text-[#008f72] mt-1">Entrarás al panel usando el mismo WhatsApp y PIN de {accessPolicy.adminPinLength} dígitos de tu cuenta actual.</p>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-6 border-t border-gray-100 bg-white flex flex-col sm:flex-row gap-3 shrink-0">
            <button type="submit" disabled={saving || loadingCatalogs || activeBusinessTypes.length === 0} className="flex-1 rounded-2xl bg-[#00a884] hover:bg-[#008f72] disabled:opacity-70 text-white font-black py-4 shadow-lg shadow-[#00a884]/20 transition-colors">
              {saving ? 'Creando negocio...' : 'Crear negocio y base'}
            </button>
            <button type="button" onClick={onClose} className="sm:w-40 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-black py-4 transition-colors">Cancelar</button>
          </div>
        </motion.form>
      </div>
    </>
  );
};

const DeleteConfirm = ({ name, onConfirm, onCancel }: any) => (
  <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-40"
      onClick={onCancel}
    />
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 16 }}
        className="pointer-events-auto w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6"
      >
        <div className="text-center mb-5">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <FiAlertTriangle className="text-red-500 text-2xl" />
          </div>
          <p className="font-black text-gray-800 text-lg">¿Eliminar negocio?</p>
          <p className="text-gray-400 text-sm mt-1">
            Se eliminará{" "}
            <span className="font-bold text-gray-700">"{name}"</span> junto con
            su inventario, ventas y fiados de forma permanente.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3.5 bg-gray-100 text-gray-700 rounded-2xl font-bold text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3.5 bg-red-500 text-white rounded-2xl font-bold text-sm shadow-md"
          >
            Eliminar
          </button>
        </div>
      </motion.div>
    </div>
  </>
);

const Branches = () => {
  const {
    stores,
    activeStoreId,
    switchStore,
    addStore,
    updateStore,
    deleteStore,
    getGlobalMetrics,
  } = useStore();
  const [showModal, setShowModal] = useState(false);
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [editingStore, setEditingStore] = useState(null);
  const [deletingStore, setDeletingStore] = useState(null);
  const [scopeSavingId, setScopeSavingId] = useState(null);
  const [scopeErrors, setScopeErrors] = useState({});
  const [orderModeSavingId, setOrderModeSavingId] = useState(null);
  const [orderModeErrors, setOrderModeErrors] = useState({});
  const [locationSavingId, setLocationSavingId] = useState(null);
  const [locationErrors, setLocationErrors] = useState({});
  const [ownerBusinessMetrics, setOwnerBusinessMetrics] = useState<any[]>([]);
  const [ownerBusinessLoading, setOwnerBusinessLoading] = useState(false);
  const [ownerBusinessError, setOwnerBusinessError] = useState('');
  const [whatsappBusiness, setWhatsappBusiness] = useState<any>(null);

  const metrics = getGlobalMetrics();
  const useOwnerBusinessConfig = typeof window !== 'undefined' && isPlatformRootHost();

  const loadOwnerBusinessConfig = async () => {
    if (!useOwnerBusinessConfig) return;
    setOwnerBusinessLoading(true);
    setOwnerBusinessError('');
    try {
      const payload = await api.get('/admin/businesses/settings');
      setOwnerBusinessMetrics(Array.isArray(payload) ? payload.map(normalizeBusinessConfigMetric) : []);
    } catch (err: any) {
      setOwnerBusinessError(err?.message || 'No se pudieron cargar todos los negocios del propietario.');
    } finally {
      setOwnerBusinessLoading(false);
    }
  };

  useEffect(() => {
    loadOwnerBusinessConfig();
    if (typeof window === 'undefined' || !useOwnerBusinessConfig) return undefined;
    const refresh = () => loadOwnerBusinessConfig();
    window.addEventListener('wamercio:tenant-changed', refresh);
    window.addEventListener('wamercio:data-changed', refresh);
    return () => {
      window.removeEventListener('wamercio:tenant-changed', refresh);
      window.removeEventListener('wamercio:data-changed', refresh);
    };
  }, [useOwnerBusinessConfig]);

  const displayMetrics = useOwnerBusinessConfig && ownerBusinessMetrics.length > 0 ? ownerBusinessMetrics : metrics.storeMetrics;
  const summaryMetrics = {
    totalStores: displayMetrics.length || metrics.totalStores,
    totalSalesToday: displayMetrics.reduce((sum, item) => sum + Number(item.salesToday || 0), 0),
    totalIncomeToday: displayMetrics.reduce((sum, item) => sum + Number(item.incomeToday || 0), 0),
  };

  const updateTenantStoreConfig = async (targetTenantId: string, updates: any) => {
    const updated = await api.patch(`/admin/businesses/${encodeURIComponent(targetTenantId)}/store`, updates);
    const normalized = normalizeBusinessConfigMetric(updated || {});
    setOwnerBusinessMetrics((prev) => prev.map((item) => tenantID(item) === targetTenantId ? { ...item, ...normalized } : item));
    await loadOwnerBusinessConfig();
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('wamercio:data-changed'));
    return normalized;
  };

  const switchTenantFromCard = (metric: any) => {
    const ref = tenantRef(metric);
    if (!ref) return switchStore(metric.id);
    api.setAdminTenant({
      id: metric.tenantId || metric.tenant_id,
      slug: metric.tenantSlug || metric.tenant_slug,
      name: metric.tenantName || metric.tenant_name || metric.name,
      domain: metric.domain || '',
      status: metric.status || 'active',
    });
  };

  const handleSave = async (form) => {
    const deliveryScope = normalizeDeliveryScope(form.deliveryScope || form.delivery_scope);
    const addressPayload = {
      ...form,
      deliveryScope,
      delivery_scope: deliveryScope,
      address: buildTerritoryAddressLine(form),
      province_code: form.provinceCode,
      municipality_code: form.municipalityCode,
      district_code: form.districtCode,
      neighborhood_id: form.neighborhoodId,
      neighborhood: form.neighborhood,
      sector: form.neighborhood,
      whatsapp_display: form.whatsappDisplay,
      country_code: form.countryCode,
      dial_code: form.dialCode,
      service_hours: normalizeServiceHours(form.serviceHours),
      serviceHours: normalizeServiceHours(form.serviceHours),
      latitude: form.latitude === "" ? null : form.latitude,
      lat: form.latitude === "" ? null : form.latitude,
      longitude: form.longitude === "" ? null : form.longitude,
      lng: form.longitude === "" ? null : form.longitude,
      location_accuracy: form.locationAccuracy ?? form.location_accuracy ?? null,
      locationAccuracy: form.locationAccuracy ?? form.location_accuracy ?? null,
      location_source: form.locationSource || form.location_source || "",
      locationSource: form.locationSource || form.location_source || "",
      location_updated_at: form.locationUpdatedAt || form.location_updated_at || null,
      locationUpdatedAt: form.locationUpdatedAt || form.location_updated_at || null,
    };
    if (editingStore) {
      const targetTenantId = tenantID(editingStore);
      const saveUpdates = {
        name: form.name,
        slogan: form.slogan,
        address: addressPayload.address,
        province: form.province,
        province_code: form.provinceCode,
        provinceCode: form.provinceCode,
        municipality: form.municipality,
        municipality_code: form.municipalityCode,
        municipalityCode: form.municipalityCode,
        district_code: form.districtCode,
        districtCode: form.districtCode,
        neighborhood_id: form.neighborhoodId,
        neighborhoodId: form.neighborhoodId,
        neighborhood: form.neighborhood,
        street: form.street,
        street_number: form.street_number,
        whatsapp: form.whatsapp,
        whatsapp_display: form.whatsappDisplay,
        whatsappDisplay: form.whatsappDisplay,
        country_code: form.countryCode,
        countryCode: form.countryCode,
        dial_code: form.dialCode,
        dialCode: form.dialCode,
        service_hours: normalizeServiceHours(form.serviceHours),
        serviceHours: normalizeServiceHours(form.serviceHours),
        emoji: form.emoji,
        logo_url: form.logoUrl || form.logo_url || '',
        logoUrl: form.logoUrl || form.logo_url || '',
        color: form.color,
        latitude: addressPayload.latitude,
        lat: addressPayload.latitude,
        longitude: addressPayload.longitude,
        lng: addressPayload.longitude,
        location_accuracy: addressPayload.location_accuracy,
        locationAccuracy: addressPayload.location_accuracy,
        location_source: addressPayload.location_source,
        locationSource: addressPayload.location_source,
        location_updated_at: addressPayload.location_updated_at,
        locationUpdatedAt: addressPayload.location_updated_at,
        delivery_scope: deliveryScope,
        deliveryScope,
      };
      if (targetTenantId) {
        await updateTenantStoreConfig(targetTenantId, saveUpdates);
      } else {
        await updateStore(editingStore.id, saveUpdates);
      }
    } else {
      await addStore(addressPayload);
    }
    setShowModal(false);
    setEditingStore(null);
  };

  const handleScopeChange = async (metricOrId, nextScope) => {
    const metric = typeof metricOrId === 'object' ? metricOrId : null;
    const storeId = metric?.id || metricOrId;
    const targetTenantId = metric ? tenantID(metric) : '';
    const scope = normalizeDeliveryScope(nextScope);
    setScopeSavingId(storeId);
    setScopeErrors((prev) => ({ ...prev, [storeId]: '' }));
    try {
      if (targetTenantId) await updateTenantStoreConfig(targetTenantId, { deliveryScope: scope, delivery_scope: scope });
      else await updateStore(storeId, { deliveryScope: scope, delivery_scope: scope });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wamercio:data-changed'));
      }
    } catch (err: any) {
      setScopeErrors((prev) => ({
        ...prev,
        [storeId]: err?.message || 'No se pudo actualizar el alcance del negocio.',
      }));
    } finally {
      setScopeSavingId(null);
    }
  };


  const handleOrderModeChange = async (store, nextModes) => {
    if (!store?.id) return;
    const modes = normalizeOrderModes(nextModes);
    const paymentSettings = normalizePaymentSettings(store.paymentSettings || store.payment_settings || {});
    const nextPaymentSettings = {
      ...paymentSettings,
      orderModes: modes,
      order_modes: modes,
    };
    setOrderModeSavingId(store.id);
    setOrderModeErrors((prev) => ({ ...prev, [store.id]: '' }));
    try {
      if (tenantID(store)) {
        await updateTenantStoreConfig(tenantID(store), { payment_settings: nextPaymentSettings, paymentSettings: nextPaymentSettings });
      } else {
        await updateStore(store.id, { payment_settings: nextPaymentSettings, paymentSettings: nextPaymentSettings });
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wamercio:data-changed'));
      }
    } catch (err: any) {
      setOrderModeErrors((prev) => ({
        ...prev,
        [store.id]: err?.message || 'No se pudo actualizar la modalidad de pedidos.',
      }));
    } finally {
      setOrderModeSavingId(null);
    }
  };

  const handleLocationSave = async (store: any, location: any) => {
    if (!store?.id || !isStoreLocationPairValid(location)) return;
    const latitudeText = String(location.latitude ?? location.lat ?? "").trim();
    const longitudeText = String(location.longitude ?? location.lng ?? location.lon ?? "").trim();
    const latitude = latitudeText === "" ? null : Number(latitudeText);
    const longitude = longitudeText === "" ? null : Number(longitudeText);
    const payload = {
      latitude,
      lat: latitude,
      longitude,
      lng: longitude,
      location_accuracy: location.locationAccuracy ?? location.location_accuracy ?? null,
      locationAccuracy: location.locationAccuracy ?? location.location_accuracy ?? null,
      location_source: location.locationSource || location.location_source || "",
      locationSource: location.locationSource || location.location_source || "",
      location_updated_at: location.locationUpdatedAt || location.location_updated_at || null,
      locationUpdatedAt: location.locationUpdatedAt || location.location_updated_at || null,
    };

    setLocationSavingId(store.id);
    setLocationErrors((prev) => ({ ...prev, [store.id]: "" }));
    try {
      if (tenantID(store)) await updateTenantStoreConfig(tenantID(store), payload);
      else await updateStore(store.id, payload);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("wamercio:data-changed"));
      }
    } catch (err: any) {
      setLocationErrors((prev) => ({
        ...prev,
        [store.id]: err?.message || "No se pudo guardar la ubicación GPS del negocio.",
      }));
    } finally {
      setLocationSavingId(null);
    }
  };

  const handleEdit = (store) => {
    setEditingStore(store);
    setShowModal(true);
  };

  const handleDelete = (id) => {
    deleteStore(id);
    setDeletingStore(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#f8f9fa]">
      <div className="bg-white border-b border-gray-100 px-4 pt-5 pb-4 shrink-0 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-black text-gray-800">Configuración</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {useOwnerBusinessConfig ? 'Configuración de los negocios del propietario' : 'Configuración principal del negocio activo'}
            </p>
          </div>
          <button
            onClick={() => {
              setEditingStore(null);
              setShowTenantModal(true);
            }}
            className="bg-[#00a884] text-white px-4 py-2.5 rounded-xl flex items-center gap-1.5 text-sm font-bold shadow-sm shadow-[#00a884]/30"
          >
            <FiPlus className="text-base" /> Crear otro negocio
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Negocio", value: summaryMetrics.totalStores },
            { label: "Ventas hoy", value: summaryMetrics.totalSalesToday },
            {
              label: "Ingresos hoy",
              value: `RD$ ${fmt(summaryMetrics.totalIncomeToday)}`,
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-[#f0fbf8] border border-[#c0ece1] rounded-xl p-2.5 text-center"
            >
              <p className="font-black text-[#00a884] text-sm">{s.value}</p>
              <p className="text-[9px] text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide pb-6">
        {ownerBusinessLoading && (
          <div className="rounded-2xl border border-[#00a884]/15 bg-[#eafaf1] px-4 py-3 text-xs font-black text-[#008f72]">
            Actualizando negocios del propietario...
          </div>
        )}
        {ownerBusinessError && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700">
            {ownerBusinessError}
          </div>
        )}
        {displayMetrics.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="w-20 h-20 bg-[#eafaf1] rounded-3xl flex items-center justify-center text-4xl mb-4 mx-auto">
              🏪
            </div>
            <p className="font-black text-gray-700 text-lg">
              Negocio no configurado
            </p>
            <p className="text-sm text-gray-400 mt-2 max-w-xs leading-relaxed">
              Configura el negocio activo para comenzar a gestionar ventas, inventario
              y fiados.
            </p>
            <button
              onClick={() => {
                setEditingStore(null);
                setShowTenantModal(true);
              }}
              className="mt-6 bg-[#00a884] text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md shadow-[#00a884]/30 flex items-center gap-2"
            >
              <FiPlus /> Crear negocio
            </button>
          </div>
        ) : (
          displayMetrics.map((metric) => (
            <BusinessCard
              key={metric.id}
              metric={metric}
              isActive={(metric.id === activeStoreId) || metric.isCurrentTenant || metric.is_current_tenant}
              onSwitch={() => switchTenantFromCard(metric)}
              onEdit={() => handleEdit(isCrossTenantMetric(metric) ? metric : stores.find((s) => s.id === metric.id))}
              onDelete={() =>
                setDeletingStore(stores.find((s) => s.id === metric.id))
              }
              onToggle={() => {
                const targetTenantId = tenantID(metric);
                if (targetTenantId) updateTenantStoreConfig(targetTenantId, { active: !(metric.storeActive ?? metric.store_active ?? metric.active) });
                else updateStore(metric.id, { active: !metric.active });
              }}
              onScopeChange={(scope) => handleScopeChange(metric, scope)}
              onOrderModeChange={(modes) => handleOrderModeChange(metric, modes)}
              onLocationSave={(location) => handleLocationSave(metric, location)}
              onWhatsApp={() => setWhatsappBusiness(metric)}
              scopeSaving={scopeSavingId === metric.id}
              scopeError={scopeErrors[metric.id]}
              orderModeSaving={orderModeSavingId === metric.id}
              orderModeError={orderModeErrors[metric.id]}
              locationSaving={locationSavingId === metric.id}
              locationError={locationErrors[metric.id]}
            />
          ))
        )}
      </div>

      <AnimatePresence>
        {showTenantModal && (
          <OwnerTenantModal onClose={() => setShowTenantModal(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {whatsappBusiness && (
          <BusinessWhatsAppModal
            business={whatsappBusiness}
            onClose={() => setWhatsappBusiness(null)}
            onUpdated={(next) => {
              const target = tenantID(whatsappBusiness);
              setWhatsappBusiness((current) => current ? { ...current, businessWhatsApp: next, business_whatsapp: next } : current);
              setOwnerBusinessMetrics((current) => current.map((item) =>
                tenantID(item) === target
                  ? { ...item, businessWhatsApp: next, business_whatsapp: next }
                  : item,
              ));
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showModal && (
          <BusinessModal
            initial={
              editingStore
                ? {
                    name: editingStore.name,
                    slogan: editingStore.slogan || "",
                    address: editingStore.address,
                    province: editingStore.province || "",
                    provinceCode:
                      editingStore.provinceCode ||
                      editingStore.province_code ||
                      "",
                    municipality: editingStore.municipality || "",
                    municipalityCode:
                      editingStore.municipalityCode ||
                      editingStore.municipality_code ||
                      "",
                    districtCode:
                      editingStore.districtCode ||
                      editingStore.district_code ||
                      "",
                    neighborhood: editingStore.neighborhood || editingStore.sector || "",
                    neighborhoodId:
                      editingStore.neighborhoodId || editingStore.neighborhood_id || "",
                    street: editingStore.street || "",
                    street_number: editingStore.street_number || "",
                    whatsapp: editingStore.whatsapp || editingStore.phone || "",
                    whatsappDisplay:
                      editingStore.whatsappDisplay ||
                      editingStore.whatsapp_display ||
                      editingStore.phone ||
                      "",
                    countryCode:
                      editingStore.countryCode ||
                      editingStore.country_code ||
                      "do",
                    dialCode:
                      editingStore.dialCode || editingStore.dial_code || "+1",
                    isValid: Boolean(
                      editingStore.whatsapp || editingStore.phone,
                    ),
                    emoji: editingStore.emoji,
                    logoUrl: editingStore.logoUrl || editingStore.logo_url || '',
                    logo_url: editingStore.logo_url || editingStore.logoUrl || '',
                    color: editingStore.color,
                    latitude: editingStore.latitude ?? editingStore.lat ?? "",
                    longitude: editingStore.longitude ?? editingStore.lng ?? editingStore.lon ?? "",
                    locationAccuracy: editingStore.locationAccuracy ?? editingStore.location_accuracy ?? null,
                    location_accuracy: editingStore.location_accuracy ?? editingStore.locationAccuracy ?? null,
                    locationSource: editingStore.locationSource || editingStore.location_source || "",
                    location_source: editingStore.location_source || editingStore.locationSource || "",
                    locationUpdatedAt: editingStore.locationUpdatedAt || editingStore.location_updated_at || null,
                    location_updated_at: editingStore.location_updated_at || editingStore.locationUpdatedAt || null,
                    serviceHours: normalizeServiceHours(
                      editingStore.serviceHours || editingStore.service_hours,
                    ),
                    deliveryScope: normalizeDeliveryScope(
                      editingStore.deliveryScope || editingStore.delivery_scope,
                    ),
                    delivery_scope: normalizeDeliveryScope(
                      editingStore.deliveryScope || editingStore.delivery_scope,
                    ),
                  }
                : null
            }
            onSave={handleSave}
            onClose={() => {
              setShowModal(false);
              setEditingStore(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deletingStore && (
          <DeleteConfirm
            name={deletingStore.name}
            onConfirm={() => handleDelete(deletingStore.id)}
            onCancel={() => setDeletingStore(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Branches;
