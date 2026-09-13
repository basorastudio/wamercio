import React, { useEffect, useMemo, useState } from "react";
import * as FiIcons from "react-icons/fi";
import { Link, useNavigate } from "@/lib/navigation";
import { api } from "../lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import AddressModal from "../components/AddressModal";
import { WeightedSaleSelector } from "../components/WeightedSaleSelector";
import { paymentMethodLabel } from "../lib/paymentMethods";
import {
  cartItemKey,
  cartItemLineTotal,
  formatCartItemMeasure,
  formatProductPrice,
  isWeightedProduct,
  normalizeSaleMode,
  roundPayableAmount,
} from "../lib/weightedProducts";

const {
  FiShoppingBag,
  FiGrid,
  FiTrash2,
  FiPlus,
  FiMinus,
  FiArrowRight,
  FiMapPin,
  FiCheckCircle,
  FiX,
  FiDollarSign,
  FiCreditCard,
  FiSend,
  FiBookOpen,
  FiAlertTriangle,
  FiNavigation,
  FiTruck,
  FiPackage,
  FiRefreshCw,
  FiEdit3,
} = FiIcons;

const fmt = (n) => Number(n || 0).toLocaleString("es-DO");
const formatFundaCartItemMeasure = (item) => {
  const label = formatCartItemMeasure(item);
  if (!isWeightedProduct(item)) return label;

  const mode = normalizeSaleMode(item?.saleMode || item?.sale_mode, item);
  return mode === "amount"
    ? label.replace(/^RD\$\s*[\d.,]+\s*·\s*/i, "")
    : label;
};

const isUnlimitedCredit = (user) =>
  Boolean(
    user?.unlimitedCredit ||
    user?.creditUnlimited ||
    String(user?.creditType || user?.creditType || "").toLowerCase() ===
      "ilimitado",
  );

const DEFAULT_ORDER_MODES = { delivery: true, pickup: true };
const CASH_DENOMINATIONS = [100, 200, 500, 1000, 2000];
const FALLBACK_BANKS = [
  {
    id: "banco-de-reservas",
    name: "Banco de Reservas",
    logo: "",
    active: true,
  },
  { id: "banco-popular", name: "Banco Popular", logo: "", active: true },
  { id: "banco-bhd", name: "Banco BHD", logo: "", active: true },
  { id: "asociacion-cibao", name: "Asociación Cibao", logo: "", active: true },
  { id: "scotiabank", name: "Scotiabank", logo: "", active: true },
  { id: "promerica", name: "Promerica", logo: "", active: true },
  { id: "banco-santa-cruz", name: "Banco Santa Cruz", logo: "", active: true },
];

const normalizeJSONField = (value, fallback = {}) => {
  if (value == null || value === "") return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }
  return value;
};

const normalizeOrderModes = (value = {}) => {
  const source = normalizeJSONField(value, {});
  const delivery =
    source.delivery ??
    source.allowDelivery ??
    source.allow_delivery;
  const pickup =
    source.pickup ??
    source.allowPickup ??
    source.allow_pickup;
  const modes = {
    delivery:
      delivery === undefined
        ? DEFAULT_ORDER_MODES.delivery
        : delivery !== false && String(delivery).toLowerCase() !== "false",
    pickup:
      pickup === undefined
        ? DEFAULT_ORDER_MODES.pickup
        : pickup !== false && String(pickup).toLowerCase() !== "false",
  };
  if (!modes.delivery && !modes.pickup) return { ...DEFAULT_ORDER_MODES };
  return modes;
};

const normalizeText = (value = "") =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeBankName = (value = "") => normalizeText(value);

const boolSetting = (value, fallback = true) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = normalizeText(value);
  if (
    ["false", "0", "no", "off", "deshabilitado", "inactivo"].includes(
      normalized,
    )
  )
    return false;
  if (
    ["true", "1", "si", "sí", "on", "habilitado", "activo"].includes(normalized)
  )
    return true;
  return fallback;
};

const paymentSettingEnabled = (settings = {}, aliases = []) => {
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      return boolSetting(settings[key], true);
    }
  }
  return true;
};

const bankAccountKey = (account) =>
  String(account?.id || account?.number || account?.bank || "");

const normalizeStoreOrderModes = (store) => {
  const paymentSettings = normalizeJSONField(
    store?.paymentSettings || store?.payment_settings || {},
    {},
  );
  return normalizeOrderModes(
    store?.orderModes ||
      store?.order_modes ||
      paymentSettings.orderModes ||
      paymentSettings.order_modes,
  );
};

const businessAddressLine = (store) => {
  if (!store) return "Dirección del negocio no configurada";
  if (hasValue(store.address)) return store.address;
  const streetLine = store.street
    ? `${store.street}${store.street_number ? ` ${store.street_number}` : ""}`
    : "";
  return (
    [streetLine, store.neighborhood || store.sector, store.municipality, store.province]
      .filter(Boolean)
      .join(", ") || "Dirección del negocio no configurada"
  );
};

const locationMatches = (zoneCode, zoneName, addressCode, addressName) => {
  const zc = String(zoneCode || "").trim();
  const zn = normalizeText(zoneName);
  const ac = String(addressCode || "").trim();
  const an = normalizeText(addressName);
  if (!zc && !zn) return true;
  if (!ac && !an) return false;
  if (zc && ac) return zc.toLowerCase() === ac.toLowerCase();
  return Boolean(zn && an && zn === an);
};

const geoPointFromAddress = (address: any = {}) => {
  const lat = Number(address?.lat ?? address?.latitude ?? address?.location?.lat ?? address?.location?.latitude);
  const lng = Number(address?.lng ?? address?.lon ?? address?.longitude ?? address?.location?.lng ?? address?.location?.lon ?? address?.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};

const geoPolygonFromZone = (zone: any = {}) => {
  const raw = zone?.geoPolygon || zone?.geo_polygon || [];
  if (!Array.isArray(raw)) return [];
  return raw.map((point: any) => ({ lat: Number(point?.lat), lng: Number(point?.lng ?? point?.lon) }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180);
};

const pointInsideDeliveryPolygon = (point: any, polygon: Array<{ lat: number; lng: number }> = []) => {
  if (!point || polygon.length < 3) return false;
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current];
    const b = polygon[previous];
    const crosses = (a.lat > point.lat) !== (b.lat > point.lat);
    if (!crosses) continue;
    const crossingLng = ((b.lng - a.lng) * (point.lat - a.lat)) / ((b.lat - a.lat) || Number.EPSILON) + a.lng;
    if (point.lng < crossingLng) inside = !inside;
  }
  return inside;
};

const deliveryZoneSpecificity = (zone: any) => {
  if (String(zone?.zoneType || zone?.zone_type || '').toLowerCase() === 'geofence') return 100;
  let score = 0;
  if (hasValue(zone?.provinceCode || zone?.province_code || zone?.provinceName || zone?.province_name || zone?.province)) score += 1;
  if (hasValue(zone?.municipalityCode || zone?.municipality_code || zone?.municipalityName || zone?.municipality_name || zone?.municipality)) score += 2;
  if (hasValue(zone?.districtCode || zone?.district_code)) score += 4;
  if (hasValue(zone?.neighborhoodId || zone?.neighborhood_id)) score += 8;
  else if (hasValue(zone?.neighborhoodName || zone?.neighborhood_name || zone?.neighborhood || zone?.sector)) score += 6;
  return score;
};

const findDeliveryZoneForAddress = (address: any, zones: any[] = [], storeId = "") => {
  if (!address) return null;
  const addressNeighborhoodId = String(
    address.neighborhoodId || address.neighborhood_id || "",
  ).trim();
  const addressNeighborhood = normalizeText(
    address.neighborhood || address.sector || "",
  );
  const addressMunicipalityCode = String(
    address.municipalityCode || address.municipality_code || "",
  ).trim();
  const addressMunicipality = address.municipality || "";
  const addressProvinceCode = String(
    address.provinceCode || address.province_code || "",
  ).trim();
  const addressProvince = address.province || "";
  const addressDistrictCode = String(
    address.districtCode || address.district_code || "",
  ).trim();

  const matches = (Array.isArray(zones) ? zones : []).filter((zone) => {
    if (!zone || zone.active === false) return false;
    const zoneStoreId = zone.storeId || zone.store_id || "";
    if (storeId && zoneStoreId && String(zoneStoreId) !== String(storeId))
      return false;

    if (String(zone.zoneType || zone.zone_type || '').toLowerCase() === 'geofence') {
      return pointInsideDeliveryPolygon(geoPointFromAddress(address), geoPolygonFromZone(zone));
    }

    if (!locationMatches(
      zone.provinceCode || zone.province_code,
      zone.provinceName || zone.province_name || zone.province,
      addressProvinceCode,
      addressProvince,
    )) return false;

    if (!locationMatches(
      zone.municipalityCode || zone.municipality_code,
      zone.municipalityName || zone.municipality_name || zone.municipality,
      addressMunicipalityCode,
      addressMunicipality,
    )) return false;

    const zoneDistrictCode = String(
      zone.districtCode || zone.district_code || "",
    ).trim();
    if (zoneDistrictCode && (!addressDistrictCode || zoneDistrictCode.toLowerCase() !== addressDistrictCode.toLowerCase())) {
      return false;
    }

    const zoneNeighborhoodId = String(
      zone.neighborhoodId || zone.neighborhood_id || "",
    ).trim();
    const zoneNeighborhood = normalizeText(
      zone.neighborhoodName || zone.neighborhood_name || zone.neighborhood || zone.sector || "",
    );
    if (!zoneNeighborhoodId && !zoneNeighborhood) return true;
    if (zoneNeighborhoodId && addressNeighborhoodId) {
      return zoneNeighborhoodId.toLowerCase() === addressNeighborhoodId.toLowerCase();
    }
    return Boolean(zoneNeighborhood && addressNeighborhood && zoneNeighborhood === addressNeighborhood);
  });

  matches.sort((left, right) => deliveryZoneSpecificity(right) - deliveryZoneSpecificity(left));
  return matches[0] || null;
};

const ORDER_MODE_OPTIONS = [
  { key: "delivery", label: "Entrega", icon: FiTruck },
  { key: "pickup", label: "Recogida", icon: FiPackage },
];

const cashDenominationsForTotal = (total = 0) =>
  CASH_DENOMINATIONS.filter((amount) => amount >= Number(total || 0));

const uniqueNumbers = (values = []) =>
  Array.from(new Set(values.map((value) => Number(value || 0)).filter((value) => value > 0))).sort((a, b) => a - b);

const roundUpTo = (value, step) => Math.ceil(Number(value || 0) / step) * step;

const cashBreakdownForAmount = (amount = 0) => {
  let remaining = Number(amount || 0);
  const parts = [];
  [...CASH_DENOMINATIONS].reverse().forEach((denomination) => {
    const count = Math.floor(remaining / denomination);
    if (count > 0) {
      parts.push({ denomination, count });
      remaining -= denomination * count;
    }
  });
  return parts;
};

const cashBreakdownLabel = (amount = 0) =>
  cashBreakdownForAmount(amount)
    .map(({ denomination, count }) =>
      count > 1 ? `RD$ ${fmt(denomination)} x${count}` : `RD$ ${fmt(denomination)}`,
    )
    .join(' + ');

const cashTenderOptionsForTotal = (total = 0) => {
  const numericTotal = Number(total || 0);
  if (numericTotal <= 0) return [];
  const maxSingleDenomination = Math.max(...CASH_DENOMINATIONS);

  if (numericTotal <= maxSingleDenomination) {
    return cashDenominationsForTotal(numericTotal).map((amount) => ({
      amount,
      breakdown: "",
    }));
  }

  return uniqueNumbers([
    roundUpTo(numericTotal, 100),
    roundUpTo(numericTotal, 200),
    roundUpTo(numericTotal, 500),
    roundUpTo(numericTotal, 1000),
    roundUpTo(numericTotal, 2000),
  ])
    .filter((amount) => amount >= numericTotal)
    .slice(0, 5)
    .map((amount) => ({
      amount,
      breakdown: cashBreakdownLabel(amount),
    }));
};

const sanitizeCashAmountInput = (value) =>
  String(value ?? "")
    .replace(/[^\d]/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, 9);

const hasValue = (value) =>
  value !== undefined &&
  value !== null &&
  String(value).trim() !== "" &&
  String(value).trim() !== "<nil>";

const isValidCoordinate = (value, min, max) => {
  if (!hasValue(value)) return false;
  const numberValue = Number(value);
  return (
    Number.isFinite(numberValue) && numberValue >= min && numberValue <= max
  );
};

const hasGpsCoordinates = (address) =>
  Boolean(address) &&
  isValidCoordinate(address?.lat, -90, 90) &&
  isValidCoordinate(address?.lng, -180, 180);

const addressLine = (address) => {
  if (!address) return "";
  const streetLine = address.street
    ? `${address.street}${address.street_number ? ` ${address.street_number}` : ""}`
    : "";
  return [address.neighborhood || address.sector, streetLine, address.address_reference]
    .filter(Boolean)
    .join(", ");
};

const deliveryAddressForOrder = (address, fallback) => {
  const base = fallback || addressLine(address) || "Dirección de entrega";
  if (!hasGpsCoordinates(address)) return base;
  return `${base} · GPS: ${address.lat}, ${address.lng}`;
};

const cartItemImage = (item) =>
  item?.image ||
  item?.imageUrl ||
  item?.image_source_url ||
  item?.imageSourceUrl ||
  item?.photo ||
  item?.thumbnail ||
  "";

const DEFAULT_PRODUCT_SURFACE = "#ffffff";

const sampleImageBackground = (imageElement) => {
  try {
    if (!imageElement?.naturalWidth || !imageElement?.naturalHeight) {
      return DEFAULT_PRODUCT_SURFACE;
    }

    const size = 16;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return DEFAULT_PRODUCT_SURFACE;

    context.drawImage(imageElement, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    const samples = [];
    const positions = [
      [0, 0],
      [1, 0],
      [size - 2, 0],
      [size - 1, 0],
      [0, 1],
      [size - 1, 1],
      [0, size - 2],
      [size - 1, size - 2],
      [0, size - 1],
      [1, size - 1],
      [size - 2, size - 1],
      [size - 1, size - 1],
    ];

    positions.forEach(([x, y]) => {
      const index = (y * size + x) * 4;
      const alpha = pixels[index + 3];
      if (alpha > 24) {
        samples.push([pixels[index], pixels[index + 1], pixels[index + 2]]);
      }
    });

    if (!samples.length) return DEFAULT_PRODUCT_SURFACE;

    const [red, green, blue] = samples
      .reduce(
        (acc, color) => [acc[0] + color[0], acc[1] + color[1], acc[2] + color[2]],
        [0, 0, 0],
      )
      .map((value) => Math.round(value / samples.length));

    return `rgb(${red}, ${green}, ${blue})`;
  } catch (_) {
    return DEFAULT_PRODUCT_SURFACE;
  }
};

const CartProductImageSurface = ({ item, className = "", imageClassName = "", fallbackClassName = "text-2xl", children = null }) => {
  const [failed, setFailed] = useState(false);
  const [surfaceColor, setSurfaceColor] = useState(DEFAULT_PRODUCT_SURFACE);
  const src = cartItemImage(item);

  return (
    <div
      className={`flex items-center justify-center shrink-0 overflow-hidden border border-gray-100 transition-colors duration-300 ${className}`}
      style={{ backgroundColor: surfaceColor }}
    >
      {children}
      {src && !failed ? (
        <img
          src={src}
          alt={item.name || "Producto"}
          className={imageClassName}
          onLoad={(event) => setSurfaceColor(sampleImageBackground(event.currentTarget))}
          onError={() => {
            setFailed(true);
            setSurfaceColor(DEFAULT_PRODUCT_SURFACE);
          }}
        />
      ) : (
        <span className={fallbackClassName}>{item.emoji || "📦"}</span>
      )}
    </div>
  );
};

const CartProductImage = ({ item }) => (
  <CartProductImageSurface
    item={item}
    className="w-14 h-14 rounded-xl text-2xl lg:w-20 lg:h-20 lg:rounded-2xl"
    imageClassName="w-full h-full object-contain p-1.5 lg:p-2"
    fallbackClassName="text-2xl"
  />
);

const PAYMENT_METHODS = [
  {
    key: "cash",
    settingKeys: ["cash"],
    icon: FiDollarSign,
    label: "Efectivo",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  {
    key: "card",
    settingKeys: ["card"],
    icon: FiCreditCard,
    label: "Tarjeta en terminal",
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  {
    key: "bank_transfer",
    settingKeys: ["bankTransfer"],
    icon: FiSend,
    label: "Transferencia manual",
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-200",
  },
  {
    key: "store_credit",
    settingKeys: ["credit"],
    icon: FiBookOpen,
    label: "Fiado",
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    requiresCredit: true,
  },
];

const EmptyFunda = () => (
  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="w-24 h-24 bg-gray-100 rounded-3xl flex items-center justify-center mb-4"
    >
      <FiShoppingBag className="text-4xl text-gray-300" />
    </motion.div>
    <h3 className="text-gray-800 font-bold text-lg mb-1">
      Tu funda está vacía
    </h3>
    <p className="text-gray-400 text-sm mb-6 max-w-xs">
      Agrega productos del catálogo para comenzar tu pedido
    </p>
    <Link to="/">
      <motion.div
        whileTap={{ scale: 0.97 }}
        className="bg-[#00a884] text-white px-6 py-3 rounded-full font-bold text-sm shadow-md shadow-[#00a884]/25 flex items-center gap-2"
      >
        Explorar catálogo <FiArrowRight size={14} />
      </motion.div>
    </Link>
  </div>
);

const BankLogo = ({ bank, className = "w-9 h-9 rounded-xl" }) => {
  if (bank?.logo) {
    return (
      <img
        src={bank.logo}
        alt={bank.name || "Banco"}
        className={`${className} object-contain bg-white border border-gray-100 p-1`}
      />
    );
  }
  return (
    <span
      className={`${className} bg-[#eafaf1] text-[#00a884] border border-[#bce8d1] flex items-center justify-center text-base`}
    >
      🏦
    </span>
  );
};

const PaymentMethodSelector = ({
  selected,
  onChange,
  creditEnabled: creditEnabled,
  unlimitedCredit: unlimitedCredit,
  availableBalance: availableBalance,
  usedBalance: usedBalance,
  orderTotal: orderTotal,
  methods,
  canSelect,
  hasTransferAccounts,
  onBlocked,
}) => (
  <div className="space-y-2">
    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
      Método de pago
    </p>
    {methods.length === 0 ? (
      <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
        Este negocio no tiene métodos de pago disponibles en este momento.
      </div>
    ) : (
      <div className="grid grid-cols-2 gap-2">
        {methods.map((m) => {
          const Icon = m.icon;
          const isActive = canSelect && selected === m.key;
          const lacksCredit =
            m.key === "store_credit" && !unlimitedCredit && availableBalance <= 0;
          const lacksTransferAccount =
            m.key === "bank_transfer" && !hasTransferAccounts;
          const isDisabled = lacksCredit || lacksTransferAccount;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => {
                if (!canSelect) {
                  onBlocked?.();
                  return;
                }
                if (!isDisabled) onChange(m.key);
              }}
              disabled={isDisabled}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${
                isDisabled
                  ? "bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed"
                  : !canSelect
                    ? "bg-white border-gray-200 text-gray-300 cursor-not-allowed"
                    : isActive
                      ? `${m.bg} ${m.border} ${m.color} shadow-sm`
                      : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              <Icon className="text-sm shrink-0" />
              <span className="truncate">{m.label}</span>
              {(lacksCredit || lacksTransferAccount) && (
                <FiAlertTriangle className="text-xs ml-auto shrink-0 text-gray-300" />
              )}
            </button>
          );
        })}
      </div>
    )}
    {!canSelect && methods.length > 0 && (
      <p className="text-[10px] text-gray-400 font-semibold leading-snug">
        Primero selecciona si el pedido será por entrega o recogida. Luego
        podrás elegir el método de pago.
      </p>
    )}
    {canSelect &&
      methods.some((m) => m.key === "bank_transfer") &&
      !hasTransferAccounts && (
        <p className="text-[10px] text-amber-600 font-bold leading-snug">
          La transferencia está habilitada, pero aún no hay cuentas bancarias
          activas publicadas para mostrar al cliente.
        </p>
      )}
    {canSelect &&
      creditEnabled &&
      methods.some((m) => m.key === "store_credit") &&
      !unlimitedCredit &&
      availableBalance <= 0 && (
        <p className="text-[10px] text-amber-600 font-bold leading-snug">
          Fiado está habilitado para tu cuenta, pero necesitas crédito disponible
          para usarlo como método de pago.
        </p>
      )}
    {selected === "store_credit" && (unlimitedCredit || availableBalance > 0) && (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2"
      >
        {unlimitedCredit ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-amber-700 font-semibold">
                Crédito ilimitado
              </span>
              <span className="text-xs font-black text-amber-700">
                Sin tope
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-amber-600 font-semibold">
                Saldo con este pedido
              </span>
              <span className="text-xs font-black text-amber-700">
                RD$ {fmt(Number(usedBalance || 0) + Number(orderTotal || 0))}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-amber-700 font-semibold">
              Crédito disponible
            </span>
            <span className="text-xs font-black text-amber-700">
              RD$ {fmt(availableBalance)}
            </span>
          </div>
        )}
      </motion.div>
    )}
  </div>
);

const CashChangeSelector = ({
  total,
  selected,
  changeFrom,
  onSelect,
  onChangeFrom,
}) => {
  const tenderOptions = cashTenderOptionsForTotal(total);
  const parsedChangeFrom = Number(changeFrom || 0);
  const estimatedChange = Math.max(0, parsedChangeFrom - Number(total || 0));
  const [customAmountActive, setCustomAmountActive] = useState(false);
  const customAmountInvalid =
    customAmountActive &&
    parsedChangeFrom > 0 &&
    parsedChangeFrom < Number(total || 0);

  useEffect(() => {
    if (selected !== "yes") setCustomAmountActive(false);
  }, [selected]);

  const selectSuggestedAmount = (amount) => {
    setCustomAmountActive(false);
    onChangeFrom(String(amount));
  };

  const activateCustomAmount = () => {
    if (!customAmountActive) onChangeFrom("");
    setCustomAmountActive(true);
  };

  const handleCustomAmountChange = (event) => {
    onChangeFrom(sanitizeCashAmountInput(event.target.value));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2 rounded-2xl border border-emerald-100 bg-[#f0fbf8] p-3"
    >
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-xl bg-white border border-emerald-100 flex items-center justify-center text-[#00a884] shrink-0">
          <FiRefreshCw size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-gray-800">¿Necesita cambio?</p>
          <p className="text-[10px] text-gray-500 leading-snug">
            Ayuda al repartidor a llevar el vuelto correcto antes de salir.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onSelect("yes")}
          className={`rounded-xl border-2 px-3 py-2 text-xs font-black transition-all ${
            selected === "yes"
              ? "bg-white border-[#8ee8c4] text-[#00a884] shadow-sm"
              : "bg-white/70 border-gray-200 text-gray-500"
          }`}
        >
          Sí
        </button>
        <button
          type="button"
          onClick={() => onSelect("no")}
          className={`rounded-xl border-2 px-3 py-2 text-xs font-black transition-all ${
            selected === "no"
              ? "bg-white border-[#8ee8c4] text-[#00a884] shadow-sm"
              : "bg-white/70 border-gray-200 text-gray-500"
          }`}
        >
          No
        </button>
      </div>

      {selected === "no" && (
        <div className="rounded-xl bg-white/75 border border-emerald-100 px-3 py-2 text-[10px] font-bold text-[#00a884]">
          El cliente pagará el monto exacto: RD$ {fmt(total)}.
        </div>
      )}

      {selected === "yes" && (
        <div className="space-y-2">
          <p className="text-[10px] text-gray-500 font-semibold leading-snug">
            Selecciona una sugerencia o introduce el monto exacto con el que
            pagarás.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {tenderOptions.map((option) => {
              const active =
                !customAmountActive && Number(changeFrom) === option.amount;
              return (
                <button
                  key={option.amount}
                  type="button"
                  onClick={() => selectSuggestedAmount(option.amount)}
                  className={`rounded-xl border-2 px-2 py-2 text-xs font-black transition-all ${
                    active
                      ? "bg-[#00a884] border-[#00a884] text-white shadow-sm shadow-[#00a884]/20"
                      : "bg-white border-gray-200 text-gray-600 hover:border-[#8ee8c4]"
                  }`}
                >
                  <span className="block">RD$ {fmt(option.amount)}</span>
                  {option.breakdown && (
                    <span
                      className={`mt-0.5 block text-[8px] leading-tight ${
                        active ? "text-white/80" : "text-gray-400"
                      }`}
                    >
                      {option.breakdown}
                    </span>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={activateCustomAmount}
              aria-expanded={customAmountActive}
              aria-controls="cash-custom-amount"
              className={`rounded-xl border-2 px-2 py-2 text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                customAmountActive
                  ? "bg-[#00a884] border-[#00a884] text-white shadow-sm shadow-[#00a884]/20"
                  : "bg-white border-gray-200 text-gray-600 hover:border-[#8ee8c4]"
              }`}
            >
              <FiEdit3 size={12} />
              Otro
            </button>
          </div>

          <AnimatePresence initial={false}>
            {customAmountActive && (
              <motion.div
                id="cash-custom-amount"
                initial={{ opacity: 0, height: 0, y: -4 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: -4 }}
                className="overflow-hidden"
              >
                <label
                  htmlFor="cash-custom-amount-input"
                  className="mb-1 block text-[10px] font-black text-gray-600"
                >
                  Monto personalizado
                </label>
                <div
                  className={`flex items-center rounded-xl border-2 bg-white transition-all focus-within:ring-2 focus-within:ring-[#00a884]/10 ${
                    customAmountInvalid
                      ? "border-amber-300"
                      : "border-emerald-100 focus-within:border-[#8ee8c4]"
                  }`}
                >
                  <span className="pl-3 text-xs font-black text-[#00a884]">
                    RD$
                  </span>
                  <input
                    id="cash-custom-amount-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    autoFocus
                    value={changeFrom}
                    onChange={handleCustomAmountChange}
                    placeholder={String(Math.ceil(Number(total || 0)))}
                    aria-invalid={customAmountInvalid}
                    aria-describedby="cash-custom-amount-help"
                    className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-sm font-black text-gray-800 outline-none placeholder:text-gray-300"
                  />
                </div>
                <p
                  id="cash-custom-amount-help"
                  className={`mt-1 text-[9px] font-semibold leading-snug ${
                    customAmountInvalid ? "text-amber-600" : "text-gray-400"
                  }`}
                >
                  {customAmountInvalid
                    ? `El monto debe ser igual o mayor que RD$ ${fmt(total)}.`
                    : `Puedes indicar cualquier monto desde RD$ ${fmt(total)}.`}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {parsedChangeFrom >= Number(total || 0) && (
            <div className="rounded-xl bg-white/75 border border-emerald-100 px-3 py-2 flex justify-between items-center">
              <span className="text-[10px] font-bold text-gray-500">
                Vuelto estimado
              </span>
              <span className="text-xs font-black text-[#00a884]">
                RD$ {fmt(estimatedChange)}
              </span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};

const TransferBankAccountSelector = ({
  accounts,
  selectedId,
  onSelect,
  bankByName,
}) => {
  const selectedAccount = accounts.find(
    (account) => bankAccountKey(account) === selectedId,
  );
  const visibleAccounts = selectedAccount ? [selectedAccount] : accounts;

  if (accounts.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700"
      >
        No hay cuentas bancarias activas para recibir transferencias.
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2 rounded-2xl border border-violet-100 bg-violet-50/45 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black text-violet-700 uppercase tracking-widest">
            Cuenta para transferir
          </p>
          <p className="text-[10px] text-gray-500 leading-snug mt-0.5">
            Selecciona la cuenta donde realizarás la transferencia de este
            pedido.
          </p>
        </div>
        {selectedAccount && (
          <button
            type="button"
            onClick={() => onSelect("")}
            className="rounded-full bg-white border border-violet-100 px-3 py-1 text-[10px] font-black text-violet-600 shrink-0"
          >
            Cambiar
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2">
        {visibleAccounts.map((account) => {
          const accountKey = bankAccountKey(account);
          const active = selectedId === accountKey;
          const bank = bankByName[normalizeBankName(account.bank)] || {
            name: account.bank,
          };
          return (
            <button
              key={accountKey}
              type="button"
              onClick={() => onSelect(accountKey)}
              className={`rounded-2xl border-2 px-3 py-3 text-left transition-all ${
                active
                  ? "border-violet-200 bg-white text-violet-700 shadow-sm"
                  : "border-gray-200 bg-white text-gray-600 hover:border-violet-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <BankLogo bank={bank} className="w-10 h-10 rounded-2xl" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-gray-800 truncate">
                    {account.bank || bank.name || "Banco"}
                  </p>
                  <p className="text-[10px] font-bold text-gray-500 truncate">
                    {account.holder || "Titular no configurado"}
                  </p>
                  <p className="text-[11px] font-black text-violet-700 mt-0.5">
                    {account.number}
                  </p>
                </div>
                {active && (
                  <FiCheckCircle className="text-[#00a884] text-base shrink-0" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
};

const ConfirmModal = ({
  cart,
  subtotal,
  total,
  deliveryCost,
  method: method,
  address: address,
  orderMode,
  changeAnswer,
  changeFrom,
  transferAccount,
  bankByName,
  onConfirm,
  onCancel,
  availableBalance: availableBalance,
  unlimitedCredit: unlimitedCredit,
  usedBalance: usedBalance,
}) => {
  const exceedsCredit =
    method === "store_credit" && !unlimitedCredit && total > availableBalance;
  const cartUnits = cart.reduce(
    (acc, item) =>
      acc + (isWeightedProduct(item) ? 1 : Number(item.quantity || 1)),
    0,
  );
  const isDelivery = orderMode === "delivery";
  const modeLabel = isDelivery ? "Entrega" : "Recogida";
  const needsCashChange = isDelivery && method === "cash";
  const transferBank = transferAccount
    ? bankByName[normalizeBankName(transferAccount.bank)] || {
        name: transferAccount.bank,
      }
    : null;
  const changeAmount = Math.max(
    0,
    Number(changeFrom || 0) - Number(total || 0),
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-end justify-center lg:items-center lg:p-6">
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="w-full max-w-md bg-white rounded-t-3xl rounded-b-none shadow-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-4 lg:rounded-3xl lg:pb-5"
      >
        <div className="flex justify-center pt-1 pb-2">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="text-center">
          <div className="w-14 h-14 bg-[#00a884]/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <FiCheckCircle className="text-[#00a884] text-2xl" />
          </div>
          <h3 className="font-black text-gray-800 text-lg">Confirmar pedido</h3>
          <p className="text-gray-400 text-xs mt-1">
            {cartUnits} producto(s) · {modeLabel} · {paymentMethodLabel(method)}
          </p>
        </div>

        <div className="bg-[#f0fbf8] border border-[#c0ece1] rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-gray-500">
            <span>Subtotal</span>
            <span>RD$ {fmt(subtotal)}</span>
          </div>
          {isDelivery && (
            <div className="flex items-center justify-between text-xs font-bold text-[#00a884]">
              <span>Entrega</span>
              <span>RD$ {fmt(deliveryCost)}</span>
            </div>
          )}
          <div className="border-t border-[#c0ece1] pt-2 text-center">
            <p className="text-xs text-[#00a884] font-semibold mb-1">
              Total del pedido
            </p>
            <p className="text-4xl font-black text-[#00a884]">
              RD$ {fmt(total)}
            </p>
          </div>
          {address && (
            <div className="flex items-center justify-center gap-1.5 mt-2">
              <FiMapPin className="text-gray-400 text-xs" />
              <p className="text-[10px] text-gray-500 truncate max-w-[240px]">
                {address}
              </p>
            </div>
          )}
          {method === "bank_transfer" && transferAccount && (
            <div className="mt-2 rounded-xl bg-white/75 border border-violet-100 px-3 py-2 flex items-center gap-2">
              <BankLogo bank={transferBank} className="w-8 h-8 rounded-xl" />
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[10px] font-black text-violet-700 truncate">
                  {transferAccount.bank}
                </p>
                <p className="text-[9px] font-bold text-gray-500 truncate">
                  {transferAccount.holder} · {transferAccount.number}
                </p>
              </div>
            </div>
          )}
          {needsCashChange && (
            <div className="mt-2 rounded-xl bg-white/75 border border-[#c0ece1] px-3 py-2 text-center">
              {changeAnswer === "yes" ? (
                <p className="text-[10px] text-[#00a884] font-black">
                  Requiere vuelto para RD$ {fmt(changeFrom)} · Cambio RD${" "}
                  {fmt(changeAmount)}
                </p>
              ) : (
                <p className="text-[10px] text-[#00a884] font-black">
                  Pagará con monto exacto
                </p>
              )}
            </div>
          )}
          {method === "store_credit" && unlimitedCredit && (
            <div className="mt-2 rounded-xl bg-white/75 border border-amber-100 px-3 py-2 text-center">
              <p className="text-[10px] text-amber-700 font-black">
                Crédito ilimitado · Nuevo saldo RD${" "}
                {fmt(Number(usedBalance || 0) + Number(total || 0))}
              </p>
            </div>
          )}
        </div>

        {exceedsCredit && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-2">
            <FiAlertTriangle className="text-red-500 text-sm shrink-0 mt-0.5" />
            <p className="text-xs text-red-600 font-semibold">
              El pedido supera tu crédito disponible de RD${" "}
              {fmt(availableBalance)}. Elige otro método.
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3.5 bg-gray-100 text-gray-700 rounded-2xl font-bold text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={exceedsCredit}
            className={`flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
              exceedsCredit
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-[#00a884] text-white shadow-md shadow-[#00a884]/30"
            }`}
          >
            <FiCheckCircle className="text-base" />
            Confirmar
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const MyCart = () => {
  const navigate = useNavigate();
  const {
    cart,
    removeFromCart,
    updateQuantity,
    setCartItem,
    clearCart,
    activeStoreId,
    activeStore,
    deliveryZones = [],
    bankAccounts = [],
  } = useStore();
  const {
    user,
    addOrder,
    updateUser,
    loading: authLoading,
    error: authError,
  } = useAuth();

  const [method, setMetodo] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [orderMode, setOrderMode] = useState("");
  const [checkoutNotice, setCheckoutNotice] = useState("");
  const [cashChangeAnswer, setCashChangeAnswer] = useState("");
  const [cashChangeFrom, setCashChangeFrom] = useState("");
  const [transferAccountId, setTransferAccountId] = useState("");
  const [bankCatalog, setBankCatalog] = useState(FALLBACK_BANKS);
  const [publicBankAccounts, setPublicBankAccounts] = useState([]);
  const [selectedCartProduct, setSelectedCartProduct] = useState(null);
  const [cartModalQuantity, setCartModalQuantity] = useState(1);

  const subtotal = roundPayableAmount(
    cart.reduce((acc, item) => acc + cartItemLineTotal(item), 0),
  );
  const cartUnits = cart.reduce(
    (acc, item) =>
      acc + (isWeightedProduct(item) ? 1 : Number(item.quantity || 1)),
    0,
  );
  const creditEnabled = user?.creditEnabled || false;
  const unlimitedCredit = creditEnabled && isUnlimitedCredit(user);
  const usedBalance = Number(user?.usedBalance || user?.accumulatedBalance || 0);
  const creditLimit = Number(user?.creditLimit || 0);
  const availableBalance = creditEnabled
    ? unlimitedCredit
      ? Number.POSITIVE_INFINITY
      : Math.max(0, creditLimit - usedBalance)
    : 0;

  const storePaymentSettings = normalizeJSONField(
    activeStore?.paymentSettings || activeStore?.payment_settings || {},
    {},
  );
  const enabledPaymentMethods = PAYMENT_METHODS.filter((method) => {
    if (
      !paymentSettingEnabled(storePaymentSettings, method.settingKeys || [])
    ) {
      return false;
    }
    if (method.requiresCredit && !creditEnabled) return false;
    return true;
  });
  const activeTransferAccounts = useMemo(() => {
    const byKey = new Map();
    const source = [
      ...(Array.isArray(bankAccounts) ? bankAccounts : []),
      ...(Array.isArray(publicBankAccounts) ? publicBankAccounts : []),
    ];

    source
      .filter(
        (account) =>
          account && account.active !== false && account.bank && account.number,
      )
      .forEach((account) => {
        const key = bankAccountKey(account);
        if (key) byKey.set(key, { ...account, id: key });
      });

    return Array.from(byKey.values());
  }, [bankAccounts, publicBankAccounts]);
  const selectedTransferAccount = activeTransferAccounts.find(
    (account) => bankAccountKey(account) === transferAccountId,
  );
  const bankByName = useMemo(
    () =>
      Object.fromEntries(
        (bankCatalog || []).map((bank) => [normalizeBankName(bank.name), bank]),
      ),
    [bankCatalog],
  );

  const principalAddr =
    user?.addresses?.find((d) => d.isPrincipal) || user?.addresses?.[0];
  const currentStoreId = activeStoreId || activeStoreId;
  const hasDeliveryGps = hasGpsCoordinates(principalAddr);
  const hasDeliveryAddress = Boolean(principalAddr && addressLine(principalAddr));
  const orderModes = normalizeStoreOrderModes(activeStore);
  const availableOrderModes = ORDER_MODE_OPTIONS.filter(
    (option) => orderModes[option.key],
  );
  const isDeliverySelected = orderMode === "delivery";
  const isPickupSelected = orderMode === "pickup";
  const needsDeliveryAddress =
    Boolean(user) && isDeliverySelected && !hasDeliveryAddress;
  const addressText = principalAddr ? addressLine(principalAddr) : null;
  const storeAddressStr = businessAddressLine(activeStore);
  const deliveryZone = findDeliveryZoneForAddress(
    principalAddr,
    deliveryZones,
    currentStoreId,
  );
  const previewDeliveryCost = Number(
    deliveryZone?.deliveryCost || deliveryZone?.delivery_cost || 0,
  );
  const deliveryCost = isDeliverySelected ? previewDeliveryCost : 0;
  const deliveryCovered = !isDeliverySelected || Boolean(deliveryZone);
  const total = roundPayableAmount(subtotal + deliveryCost);
  const selectedAddressLabel = isPickupSelected
    ? storeAddressStr
    : addressText;
  const shouldAskCashChange = isDeliverySelected && method === "cash";
  const cashChangeFromAmount = Number(cashChangeFrom || 0);
  const cashChangeValid =
    !shouldAskCashChange ||
    cashChangeAnswer === "no" ||
    (cashChangeAnswer === "yes" && cashChangeFromAmount >= total);
  useEffect(() => {
    let alive = true;
    api
      .get("/banks")
      .then((data) => {
        const list = Array.isArray(data)
          ? data.filter((bank) => bank?.active !== false)
          : [];
        if (alive && list.length > 0) setBankCatalog(list);
      })
      .catch(() => {
        if (alive) setBankCatalog(FALLBACK_BANKS);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .get("/bank-accounts/public")
      .then((data) => {
        if (!alive) return;
        setPublicBankAccounts(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (alive) setPublicBankAccounts([]);
      });
    return () => {
      alive = false;
    };
  }, [currentStoreId]);

  useEffect(() => {
    if (!orderMode && method) setMetodo("");
  }, [orderMode, method]);

  useEffect(() => {
    if (
      method &&
      !enabledPaymentMethods.some((paymentMethod) => paymentMethod.key === method)
    ) {
      setMetodo("");
    }
  }, [enabledPaymentMethods, method]);

  useEffect(() => {
    if (method !== "bank_transfer") setTransferAccountId("");
  }, [method]);

  useEffect(() => {
    if (
      transferAccountId &&
      !activeTransferAccounts.some(
        (account) => bankAccountKey(account) === transferAccountId,
      )
    ) {
      setTransferAccountId("");
    }
  }, [activeTransferAccounts, transferAccountId]);

  useEffect(() => {
    if (orderMode && !orderModes[orderMode]) setOrderMode("");
  }, [orderMode, orderModes.delivery, orderModes.pickup]);

  useEffect(() => {
    if (checkoutNotice) setCheckoutNotice("");
  }, [orderMode, method, cashChangeAnswer, cashChangeFrom, transferAccountId]);

  useEffect(() => {
    if (!shouldAskCashChange) {
      setCashChangeAnswer("");
      setCashChangeFrom("");
    }
  }, [shouldAskCashChange]);

  useEffect(() => {
    if (cashChangeAnswer !== "yes") setCashChangeFrom("");
  }, [cashChangeAnswer]);

  useEffect(() => {
    if (!selectedCartProduct) return;
    const selectedKey = cartItemKey(selectedCartProduct);
    const refreshed = cart.find((item) => cartItemKey(item) === selectedKey);
    if (!refreshed) {
      setSelectedCartProduct(null);
      return;
    }
    setSelectedCartProduct(refreshed);
  }, [cart, selectedCartProduct?.cartKey, selectedCartProduct?.cart_key, selectedCartProduct?.id]);

  const sanitizeQuantity = (value) => {
    const next = Math.max(1, Math.floor(Number(value) || 1));
    return Math.min(next, 999);
  };

  const selectedCartProductIsWeighted = Boolean(
    selectedCartProduct && isWeightedProduct(selectedCartProduct),
  );
  const selectedCartProductQuantity = selectedCartProduct
    ? sanitizeQuantity(selectedCartProduct.quantity || 1)
    : 0;
  const selectedCartProductModalQuantity = sanitizeQuantity(cartModalQuantity);
  const selectedCartProductQuantityDelta = selectedCartProduct
    ? selectedCartProductModalQuantity - selectedCartProductQuantity
    : 0;
  const selectedCartProductActionLabel = selectedCartProductQuantityDelta === 0
    ? `Agregado · ${selectedCartProductQuantity} en mi funda`
    : selectedCartProductQuantityDelta > 0
      ? `Agregar +${selectedCartProductQuantityDelta} a mi funda`
      : `Actualizar a ${selectedCartProductModalQuantity} en mi funda`;
  const selectedCartProductStatusLabel = selectedCartProductIsWeighted
    ? formatCartItemMeasure(selectedCartProduct)
    : `${selectedCartProductQuantity} producto${selectedCartProductQuantity > 1 ? "s" : ""} agregado${selectedCartProductQuantity > 1 ? "s" : ""}`;

  const openCartProductDetail = (item) => {
    setSelectedCartProduct(item);
    if (!isWeightedProduct(item)) {
      setCartModalQuantity(sanitizeQuantity(item?.quantity || 1));
    }
  };

  const handleConfirmCartProduct = (event = null) => {
    event?.stopPropagation?.();
    if (!selectedCartProduct || selectedCartProductIsWeighted) return;
    const currentQuantity = sanitizeQuantity(selectedCartProduct.quantity || 1);
    const nextQuantity = sanitizeQuantity(cartModalQuantity);
    const delta = nextQuantity - currentQuantity;
    if (delta !== 0) updateQuantity(cartItemKey(selectedCartProduct), delta);
  };

  const handleConfirmWeightedCartProduct = (nextItem) => {
    if (!selectedCartProduct) return;
    setCartItem(cartItemKey(selectedCartProduct), nextItem);
    setSelectedCartProduct(null);
  };

  const handleSaveAddress = async (addrData) => {
    if (!user) return null;

    let newAddresses = [...(user.addresses || [])];
    const addressToSave = { ...addrData, isPrincipal: true };

    newAddresses = newAddresses.map((d) => ({ ...d, isPrincipal: false }));

    if (addressToSave.id) {
      const idx = newAddresses.findIndex((d) => d.id === addressToSave.id);
      if (idx >= 0) newAddresses[idx] = addressToSave;
      else newAddresses.push(addressToSave);
    } else {
      newAddresses.push({ ...addressToSave, id: Date.now() });
    }

    return updateUser({ addresses: newAddresses });
  };

  const handleOpenAddressModal = () => {
    setAddressModalOpen(true);
  };

  const handlePrimaryAction = () => {
    if (!user || authLoading) return;
    if (!orderMode) {
      setCheckoutNotice(
        "Selecciona si deseas entrega o recogida para continuar con el pedido.",
      );
      return;
    }
    if (!method) {
      setCheckoutNotice(
        "Selecciona un método de pago para continuar con el pedido.",
      );
      return;
    }
    if (method === "bank_transfer" && !selectedTransferAccount) {
      setCheckoutNotice(
        "Selecciona la cuenta bancaria donde realizarás la transferencia.",
      );
      return;
    }
    if (shouldAskCashChange && !cashChangeAnswer) {
      setCheckoutNotice(
        "Indica si necesitas cambio para que el repartidor salga preparado.",
      );
      return;
    }
    if (shouldAskCashChange && cashChangeAnswer === "yes" && !cashChangeValid) {
      setCheckoutNotice(
        "Selecciona o introduce un monto que cubra el total del pedido.",
      );
      return;
    }
    if (isDeliverySelected && !hasDeliveryAddress) {
      setCheckoutNotice(
        "Agrega una dirección de entrega completa para continuar con el pedido.",
      );
      handleOpenAddressModal();
      return;
    }
    if (isDeliverySelected && !deliveryCovered) {
      setCheckoutNotice(
        "Esta dirección está fuera de la zona de cobertura. Elige otra dirección o selecciona recogida.",
      );
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirmOrder = async () => {
    if (!user || authLoading) return;
    if (!orderMode) {
      setShowConfirm(false);
      setCheckoutNotice("Selecciona una modalidad de pedido.");
      return;
    }
    if (!method) {
      setShowConfirm(false);
      setCheckoutNotice("Selecciona un método de pago.");
      return;
    }
    if (method === "bank_transfer" && !selectedTransferAccount) {
      setShowConfirm(false);
      setCheckoutNotice(
        "Selecciona una cuenta bancaria para la transferencia.",
      );
      return;
    }
    if (shouldAskCashChange && !cashChangeAnswer) {
      setShowConfirm(false);
      setCheckoutNotice("Indica si necesitas cambio para este pedido.");
      return;
    }
    if (shouldAskCashChange && cashChangeAnswer === "yes" && !cashChangeValid) {
      setShowConfirm(false);
      setCheckoutNotice("Selecciona o introduce un monto válido para el cambio.");
      return;
    }
    if (isDeliverySelected && !hasDeliveryAddress) {
      setShowConfirm(false);
      setCheckoutNotice("Agrega una dirección de entrega completa.");
      handleOpenAddressModal();
      return;
    }
    if (isDeliverySelected && !deliveryCovered) {
      setShowConfirm(false);
      setCheckoutNotice("Esta dirección está fuera de la zona de cobertura. Elige otra dirección o selecciona recogida.");
      return;
    }
    const modeLabel = isDeliverySelected ? "Entrega" : "Recogida";
    const cashChangeDetail = shouldAskCashChange
      ? cashChangeAnswer === "yes"
        ? ` · Cambio: requiere vuelto de RD$ ${fmt(cashChangeFromAmount)} (vuelto RD$ ${fmt(Math.max(0, cashChangeFromAmount - total))})`
        : " · Cambio: no necesita vuelto (pagará exacto)"
      : "";
    const transferPaymentDetail =
      method === "bank_transfer" && selectedTransferAccount
        ? ` · Transferencia: ${selectedTransferAccount.bank} · Cuenta ${selectedTransferAccount.number} · Titular ${selectedTransferAccount.holder}`
        : "";
    const orderAddress = isDeliverySelected
      ? `Modalidad: ${modeLabel} · Entrega: RD$ ${fmt(deliveryCost)} · ${deliveryAddressForOrder(principalAddr, addressText)}${transferPaymentDetail}${cashChangeDetail}`
      : `Modalidad: ${modeLabel} · Retirar en: ${storeAddressStr}${transferPaymentDetail}`;
    const order = {
      store_id: currentStoreId,
      status: "pending",
      items: cart.map((item) => ({ ...item })),
      subtotal,
      delivery_cost: deliveryCost,
      deliveryCost,
      delivery_zone_id: isDeliverySelected ? String(deliveryZone?.id || "") : "",
      deliveryZoneId: isDeliverySelected ? String(deliveryZone?.id || "") : "",
      total,
      method: method,
      paymentMethod: method,
      payment_bank_account_id: selectedTransferAccount
        ? selectedTransferAccount.id
        : "",
      paymentBankAccountId: selectedTransferAccount
        ? selectedTransferAccount.id
        : "",
      payment_bank_account: selectedTransferAccount || null,
      paymentBankAccount: selectedTransferAccount || null,
      order_mode: orderMode,
      orderMode,
      cash_change_needed: shouldAskCashChange
        ? cashChangeAnswer === "yes"
        : false,
      cashChangeNeeded: shouldAskCashChange
        ? cashChangeAnswer === "yes"
        : false,
      cash_change_from:
        shouldAskCashChange && cashChangeAnswer === "yes"
          ? cashChangeFromAmount
          : 0,
      cashChangeFrom:
        shouldAskCashChange && cashChangeAnswer === "yes"
          ? cashChangeFromAmount
          : 0,
      cash_change_answered: shouldAskCashChange,
      cashChangeAnswered: shouldAskCashChange,
      address: orderAddress,
      delivery_lat: isDeliverySelected && hasDeliveryGps ? principalAddr?.lat : "",
      delivery_lng: isDeliverySelected && hasDeliveryGps ? principalAddr?.lng : "",
    };

    try {
      await addOrder(order);
      clearCart();
      setMetodo("");
      setOrderMode("");
      setCashChangeAnswer("");
      setCashChangeFrom("");
      setTransferAccountId("");
      setShowConfirm(false);
      setShowSuccess(true);
      window.setTimeout(() => {
        setShowSuccess(false);
        navigate("/orders");
      }, 900);
    } catch (_) {
    }
  };

  const cartHeader = (
    <div className="bg-white px-5 pt-5 pb-4 border-b border-gray-100 shadow-sm lg:w-full lg:rounded-[1.75rem] lg:border lg:border-gray-200 lg:px-6 lg:py-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-800 lg:text-3xl">Mi Funda</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {cartUnits === 0
              ? "Sin productos"
              : `${cartUnits} producto${cartUnits > 1 ? "s" : ""} agregado${cartUnits > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#00a884]/20 bg-[#eafaf1] px-3 py-2 text-xs font-black text-[#00a884] transition-colors hover:bg-[#d4f5e9] lg:px-4 lg:py-2.5"
          >
            <FiGrid className="text-sm" />
            Catálogo
          </Link>
          {cartUnits > 0 && (
            <span className="bg-[#00a884] text-white text-xs font-black px-3 py-1 rounded-full shadow-sm">
              {cartUnits}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col bg-[#f8f9fa] min-h-full lg:bg-[#f5f7f8] lg:px-5 lg:pb-10">

      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-4 right-4 z-[100] bg-[#00a884] text-white rounded-2xl p-4 shadow-xl flex items-center gap-3"
          >
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-bold text-sm">¡Pedido confirmado!</p>
              <p className="text-xs text-white/80">
                Tu pedido fue registrado correctamente
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {cart.length === 0 ? (
        <>
          <div className="lg:mx-auto lg:mt-5 lg:w-full lg:max-w-[1000px]">
            {cartHeader}
          </div>
          <EmptyFunda />
        </>
      ) : (
        <div className="flex flex-col flex-1 overflow-hidden lg:mx-auto lg:w-full lg:max-w-[1440px] lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-5 lg:overflow-visible lg:pt-5">
          <div className="min-w-0 flex-1 overflow-y-auto lg:overflow-visible">
            {cartHeader}
            <div className="px-4 py-4 space-y-3 lg:px-0 lg:py-5 lg:space-y-4">
            {cart.map((item, i) => {
              const weighted = isWeightedProduct(item);
              const saleMode = weighted
                ? normalizeSaleMode(item?.saleMode || item?.sale_mode, item)
                : "unit";
              const isAmountSale = weighted && saleMode === "amount";

              return (
              <motion.div
                key={cartItemKey(item) || i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => openCartProductDetail(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => event.key === "Enter" && openCartProductDetail(item)}
                className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start gap-3 min-h-[112px] cursor-pointer transition-all active:scale-[0.99] lg:rounded-[1.5rem] lg:border-gray-200 lg:p-5 lg:gap-4 lg:min-h-[132px] lg:hover:border-[#00a884]/20 lg:hover:shadow-md"
              >
                <CartProductImage item={item} />
                <div className="flex-1 min-w-0 self-stretch flex flex-col justify-between gap-3 pr-8 lg:pr-14">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-800 leading-tight break-words lg:text-base">
                      {item.name}
                    </p>
                    {weighted && (
                      <p className="mt-1 text-[10px] font-black text-gray-400 lg:text-xs">
                        Precio: {formatProductPrice(item)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-[#00a884] font-black whitespace-nowrap lg:text-lg">
                      RD${" "}
                      {fmt(cartItemLineTotal(item))}
                    </p>
                    {isAmountSale ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openCartProductDetail(item);
                        }}
                        className="max-w-[210px] rounded-full border border-[#00a884]/20 bg-[#eafaf1] px-3 py-1.5 text-right text-[10px] font-black text-[#008f72] transition-colors hover:bg-[#dcf7ea] lg:text-xs"
                        aria-label="Editar monto"
                      >
                        {formatFundaCartItemMeasure(item)}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(event) => { event.stopPropagation(); updateQuantity(cartItemKey(item), -1); }}
                          className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
                          aria-label={weighted ? "Reducir 0.50 lb" : "Reducir cantidad"}
                        >
                          <FiMinus size={12} />
                        </button>
                        {weighted ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openCartProductDetail(item);
                            }}
                            className="min-w-[4.5rem] rounded-full border border-[#00a884]/20 bg-[#eafaf1] px-2.5 py-1 text-center text-[10px] font-black text-[#008f72] transition-colors hover:bg-[#dcf7ea] lg:text-xs"
                            aria-label="Editar peso"
                          >
                            {formatFundaCartItemMeasure(item)}
                          </button>
                        ) : (
                          <span className="text-sm font-bold text-gray-800 w-5 text-center">
                            {item.quantity || 1}
                          </span>
                        )}
                        <button
                          onClick={(event) => { event.stopPropagation(); updateQuantity(cartItemKey(item), 1); }}
                          className="w-7 h-7 rounded-full bg-[#00a884]/10 flex items-center justify-center text-[#00a884] hover:bg-[#00a884]/20 transition-colors"
                          aria-label={weighted ? "Aumentar 0.50 lb" : "Aumentar cantidad"}
                        >
                          <FiPlus size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={(event) => { event.stopPropagation(); removeFromCart(cartItemKey(item)); }}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-100 transition-colors lg:top-5 lg:right-5 lg:w-9 lg:h-9"
                  aria-label="Eliminar producto de la funda"
                >
                  <FiTrash2 size={12} />
                </button>
              </motion.div>
              );
            })}
            </div>
          </div>

          <div className="bg-white border-t border-gray-100 px-4 py-4 space-y-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] lg:sticky lg:top-5 lg:self-start lg:rounded-[1.75rem] lg:border lg:border-gray-200 lg:p-5 lg:shadow-sm lg:max-h-[calc(100dvh-120px)] lg:overflow-y-auto lg:space-y-4">
            {user && (
              <div className="space-y-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Modalidad de pedido
                </p>
                <div
                  className={`grid gap-2 ${availableOrderModes.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
                >
                  {availableOrderModes.map((option) => {
                    const Icon = option.icon;
                    const active = orderMode === option.key;
                    const isDelivery = option.key === "delivery";
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setOrderMode(option.key)}
                        className={`rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                          active
                            ? "bg-[#f0fbf8] border-[#8ee8c4] text-[#00a884] shadow-sm"
                            : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="text-sm shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black truncate">
                              {option.label}
                            </p>
                            <p className="text-[9px] font-bold opacity-70 truncate">
                              {isDelivery
                                ? `Entrega RD$ ${fmt(previewDeliveryCost)}`
                                : "En negocio"}
                            </p>
                          </div>
                          {active && (
                            <FiCheckCircle className="text-sm shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {!orderMode && (
                  <p className="text-[10px] text-gray-400 font-semibold leading-snug">
                    Elige una modalidad para este pedido. No se selecciona
                    automáticamente porque cada pedido puede ser diferente.
                  </p>
                )}

                {isPickupSelected && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 border bg-gray-50 border-gray-100"
                  >
                    <FiMapPin className="text-[#00a884] text-sm shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
                        Dirección de recogida
                      </p>
                      <p className="text-xs font-medium truncate text-gray-600">
                        {storeAddressStr}
                      </p>
                    </div>
                  </motion.div>
                )}

                {isDeliverySelected && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2.5 border ${
                      !hasDeliveryAddress || !deliveryCovered
                        ? "bg-amber-50 border-amber-100"
                        : "bg-gray-50 border-gray-100"
                    }`}
                  >
                    <FiMapPin
                      className={`${hasDeliveryAddress && deliveryCovered ? "text-[#00a884]" : "text-amber-500"} text-sm shrink-0`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
                        Dirección de entrega
                      </p>
                      <p
                        className={`text-xs font-medium truncate ${hasDeliveryAddress ? "text-gray-600" : "text-amber-800"}`}
                      >
                        {addressText || "Agrega una dirección de entrega"}
                      </p>
                      {deliveryCovered ? (
                        <p className="text-[10px] text-[#00a884] font-black mt-0.5">
                          Entrega RD$ {fmt(deliveryCost)}
                          {deliveryZone?.neighborhoodName || deliveryZone?.neighborhood_name
                            ? ` · ${deliveryZone.neighborhoodName || deliveryZone.neighborhood_name}`
                            : ""}
                        </p>
                      ) : hasDeliveryAddress ? (
                        <p className="text-[10px] text-amber-700 font-black mt-0.5">Fuera de la zona de cobertura</p>
                      ) : null}
                      {!hasDeliveryAddress ? (
                        <p className="text-[10px] text-amber-600 font-bold mt-0.5">
                          Dirección requerida para entrega
                        </p>
                      ) : !deliveryCovered ? (
                        <p className="text-[10px] text-amber-600 font-bold mt-0.5">Cambia la dirección o selecciona recogida</p>
                      ) : !hasDeliveryGps ? (
                        <p className="text-[10px] text-gray-400 font-bold mt-0.5">
                          GPS opcional · dirección manual válida
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenAddressModal}
                      className={`text-[10px] font-black shrink-0 rounded-lg px-3 py-1.5 transition-colors ${
                        hasDeliveryAddress
                          ? "text-[#00a884] hover:bg-[#00a884]/10"
                          : "bg-[#00a884] text-white shadow-sm hover:bg-[#009676]"
                      }`}
                    >
                      {hasDeliveryAddress ? "Cambiar" : "Dirección"}
                    </button>
                  </motion.div>
                )}
              </div>
            )}

            {needsDeliveryAddress && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex items-start gap-2"
              >
                <FiAlertTriangle className="text-amber-500 text-sm shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 font-semibold leading-snug">
                  Completa una dirección de entrega clara. El GPS es opcional y solo ayuda a ubicarte más rápido.
                </p>
              </motion.div>
            )}

            {user && (
              <PaymentMethodSelector
                selected={method}
                onChange={(value) => {
                  setMetodo(value);
                  setTransferAccountId("");
                  setCashChangeAnswer("");
                  setCashChangeFrom("");
                }}
                methods={enabledPaymentMethods}
                canSelect={Boolean(orderMode)}
                hasTransferAccounts={activeTransferAccounts.length > 0}
                onBlocked={() =>
                  setCheckoutNotice(
                    "Selecciona primero si el pedido será por entrega o recogida.",
                  )
                }
                creditEnabled={creditEnabled}
                unlimitedCredit={unlimitedCredit}
                availableBalance={
                  Number.isFinite(availableBalance) ? availableBalance : 0
                }
                usedBalance={usedBalance}
                orderTotal={total}
              />
            )}

            {user && method === "bank_transfer" && orderMode && (
              <TransferBankAccountSelector
                accounts={activeTransferAccounts}
                selectedId={transferAccountId}
                onSelect={setTransferAccountId}
                bankByName={bankByName}
              />
            )}

            {user && shouldAskCashChange && (
              <CashChangeSelector
                total={total}
                selected={cashChangeAnswer}
                changeFrom={cashChangeFrom}
                onSelect={setCashChangeAnswer}
                onChangeFrom={setCashChangeFrom}
              />
            )}

            {checkoutNotice && (
              <div className="bg-amber-50 border border-amber-100 text-amber-700 rounded-xl px-3 py-2 text-xs font-semibold">
                {checkoutNotice}
              </div>
            )}

            {authError && (
              <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl px-3 py-2 text-xs font-semibold">
                {authError}
              </div>
            )}

            <div className="space-y-1 lg:rounded-2xl lg:bg-[#f8fffc] lg:border lg:border-[#00a884]/15 lg:p-4">
              {isDeliverySelected && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400 font-semibold">
                      Subtotal
                    </span>
                    <span className="text-xs font-black text-gray-500">
                      RD$ {fmt(subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400 font-semibold">
                      Entrega
                    </span>
                    <span className="text-xs font-black text-[#00a884]">
                      RD$ {fmt(deliveryCost)}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between items-center pt-1">
                <span className="text-sm text-gray-500 font-medium">Total</span>
                <span className="text-lg font-black text-gray-800">
                  RD$ {fmt(total)}
                </span>
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handlePrimaryAction}
              disabled={!user || authLoading}
              className={`w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all ${
                !user || authLoading
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : !orderMode ||
                      !method ||
                      (method === "bank_transfer" &&
                        !selectedTransferAccount) ||
                      (shouldAskCashChange && !cashChangeValid)
                    ? "bg-[#00a884] text-white shadow-[#00a884]/25 hover:bg-[#009676]"
                    : isDeliverySelected && !hasDeliveryAddress
                      ? "bg-amber-500 text-white shadow-amber-500/25 hover:bg-amber-600"
                      : "bg-[#00a884] text-white shadow-[#00a884]/25 hover:bg-[#009676]"
              }`}
            >
              {user ? (
                <>
                  {!orderMode ? (
                    <FiPackage size={15} />
                  ) : !method ? (
                    <FiCreditCard size={15} />
                  ) : method === "bank_transfer" && !selectedTransferAccount ? (
                    <FiSend size={15} />
                  ) : shouldAskCashChange && !cashChangeValid ? (
                    <FiRefreshCw size={15} />
                  ) : isDeliverySelected && !hasDeliveryAddress ? (
                    <FiNavigation size={15} />
                  ) : (
                    <FiCheckCircle size={15} />
                  )}
                  {authLoading
                    ? "Registrando pedido..."
                    : !orderMode
                      ? "Selecciona modalidad"
                      : !method
                        ? "Selecciona pago"
                        : method === "bank_transfer" && !selectedTransferAccount
                          ? "Selecciona cuenta"
                          : shouldAskCashChange && !cashChangeValid
                            ? "Indica cambio"
                            : isDeliverySelected && !hasDeliveryAddress
                              ? "Completar dirección"
                              : "Confirmar pedido"}
                </>
              ) : (
                <>Inicia sesión para pedir</>
              )}
            </motion.button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedCartProduct && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center lg:items-center lg:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSelectedCartProduct(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{ type: "spring", stiffness: 280, damping: 30 }}
              className="relative w-full max-w-md bg-white rounded-t-[1.75rem] rounded-b-none shadow-2xl overflow-hidden max-h-[94dvh] flex flex-col pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:max-w-4xl lg:rounded-[2rem] lg:pb-0 lg:max-h-[90vh]"
            >
              <div className="flex justify-center pt-3 pb-1 lg:hidden">
                <div className="w-10 h-1 bg-gray-200 rounded-full" />
              </div>

              <div className="flex items-start justify-between gap-3 px-5 pt-2 pb-3 border-b border-gray-100 lg:px-7 lg:pt-6 lg:pb-5">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#00a884]">Detalle del producto</p>
                  <h3 className="text-lg font-black text-gray-900 leading-tight mt-1 lg:text-3xl">{selectedCartProduct.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold text-gray-400 lg:text-sm">{selectedCartProduct.category || "Sin categoría"}</p>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00a884]/20 bg-[#eafaf1] px-2.5 py-1 text-[10px] font-black text-[#00a884] lg:text-xs">
                      <FiCheckCircle className="text-xs" /> {selectedCartProductStatusLabel}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCartProduct(null)}
                  className="w-9 h-9 rounded-2xl bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors flex items-center justify-center shrink-0 lg:w-11 lg:h-11"
                  aria-label="Cerrar detalle del producto"
                >
                  <FiX />
                </button>
              </div>

              <div className="overflow-y-auto px-5 py-4 space-y-4 lg:grid lg:grid-cols-[minmax(260px,360px)_minmax(0,1fr)] lg:gap-7 lg:space-y-0 lg:px-7 lg:py-6">
                <div>
                  <CartProductImageSurface
                    item={selectedCartProduct}
                    className="w-full h-56 rounded-3xl text-6xl lg:h-[360px] lg:rounded-[2rem]"
                    imageClassName="w-full h-full object-contain p-3 lg:p-6"
                    fallbackClassName="text-6xl"
                  />
                </div>

                <div className="space-y-4 lg:flex lg:flex-col lg:justify-between">
                  {selectedCartProductIsWeighted ? (
                    <WeightedSaleSelector
                      product={selectedCartProduct}
                      initialItem={selectedCartProduct}
                      onConfirm={handleConfirmWeightedCartProduct}
                      showHeader={false}
                      confirmLabel="Actualizar mi funda"
                    />
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-[#eafaf1] border border-[#00a884]/15 px-4 py-3 lg:p-5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-[#008f72]/70">Precio</p>
                        <p className="text-lg font-black text-[#00a884] mt-0.5 lg:text-3xl">{formatProductPrice(selectedCartProduct)}</p>
                      </div>
                      <div className="rounded-2xl bg-gray-50 border border-gray-100 px-3 py-3 lg:p-5">
                        <label htmlFor="cart-product-detail-quantity" className="text-[9px] font-black uppercase tracking-widest text-gray-400">Cantidad</label>
                        <div className="flex items-center gap-2 mt-1.5 lg:mt-3">
                          <button
                            type="button"
                            onClick={() => setCartModalQuantity((quantity) => Math.max(1, Number(quantity || 1) - 1))}
                            className="w-8 h-8 rounded-xl bg-white border border-gray-200 text-gray-500 flex items-center justify-center active:scale-95 transition-transform lg:w-11 lg:h-11"
                            aria-label="Reducir cantidad"
                          >
                            <FiMinus className="text-xs lg:text-sm" />
                          </button>
                          <input
                            id="cart-product-detail-quantity"
                            type="number"
                            min="1"
                            max="999"
                            inputMode="numeric"
                            value={cartModalQuantity}
                            onChange={(event) => setCartModalQuantity(sanitizeQuantity(event.target.value))}
                            className="min-w-0 flex-1 h-8 rounded-xl border border-gray-200 bg-white text-center text-sm font-black text-gray-800 focus:outline-none focus:border-[#00a884] focus:ring-2 focus:ring-[#00a884]/20 lg:h-11 lg:text-base"
                          />
                          <button
                            type="button"
                            onClick={() => setCartModalQuantity((quantity) => sanitizeQuantity(Number(quantity || 1) + 1))}
                            className="w-8 h-8 rounded-xl bg-[#00a884]/10 text-[#00a884] flex items-center justify-center active:scale-95 transition-transform lg:w-11 lg:h-11"
                            aria-label="Aumentar cantidad"
                          >
                            <FiPlus className="text-xs lg:text-sm" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="rounded-3xl bg-gray-50 border border-gray-100 p-4 lg:p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400 mb-2">Descripción</p>
                    <p className="text-sm text-gray-600 font-medium leading-relaxed whitespace-pre-line lg:text-base">
                      {selectedCartProduct.description || "Este producto todavía no tiene una descripción registrada."}
                    </p>
                  </div>

                  {!selectedCartProductIsWeighted && (
                  <div className="hidden lg:flex items-center justify-between gap-4 rounded-3xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">Total seleccionado</p>
                      <p className="text-3xl font-black text-[#00a884] mt-1">RD$ {fmt((selectedCartProduct.price || 0) * cartModalQuantity)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleConfirmCartProduct}
                      className="min-w-[230px] py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 bg-[#00a884] text-white shadow-md shadow-[#00a884]/25 hover:bg-[#009676] transition-all"
                    >
                      {selectedCartProductQuantityDelta === 0 ? <FiCheckCircle /> : <FiShoppingBag />}
                      {selectedCartProductActionLabel}
                    </button>
                  </div>
                  )}
                </div>
              </div>

              {!selectedCartProductIsWeighted && (
              <div className="px-5 py-4 bg-white border-t border-gray-100 lg:hidden">
                <button
                  type="button"
                  onClick={handleConfirmCartProduct}
                  className="w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 bg-[#00a884] text-white shadow-md shadow-[#00a884]/25 hover:bg-[#009676] transition-all"
                >
                  {selectedCartProductQuantityDelta === 0 ? <FiCheckCircle /> : <FiShoppingBag />}
                  {selectedCartProductActionLabel}
                </button>
              </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showConfirm && (
          <ConfirmModal
            cart={cart}
            subtotal={subtotal}
            total={total}
            deliveryCost={deliveryCost}
            method={method}
            address={selectedAddressLabel}
            orderMode={orderMode}
            changeAnswer={cashChangeAnswer}
            changeFrom={cashChangeFromAmount}
            transferAccount={selectedTransferAccount}
            bankByName={bankByName}
            availableBalance={
              Number.isFinite(availableBalance) ? availableBalance : 0
            }
            unlimitedCredit={unlimitedCredit}
            usedBalance={usedBalance}
            onConfirm={handleConfirmOrder}
            onCancel={() => setShowConfirm(false)}
          />
        )}
      </AnimatePresence>

      <AddressModal
        isOpen={addressModalOpen}
        onClose={() => setAddressModalOpen(false)}
        onSave={handleSaveAddress}
        editingAddress={principalAddr || null}
      />
    </div>
  );
};

export default MyCart;
