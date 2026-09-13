import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as FiIcons from "react-icons/fi";
import { api } from "../lib/api";
import { PAYMENT_METHODS } from "../lib/paymentMethods";
import PhoneInput from "../components/PhoneInput";
import TerritoryAddressForm, {
  buildTerritoryAddressLine,
  emptyTerritoryAddress,
  isTerritoryAddressComplete,
  normalizeTerritoryAddress,
} from "../components/TerritoryAddressForm";

const {
  FiAlertTriangle,
  FiCheck,
  FiCheckCircle,
  FiCreditCard,
  FiDollarSign,
  FiLoader,
  FiMapPin,
  FiMessageCircle,
  FiPackage,
  FiPhone,
  FiRefreshCw,
  FiSend,
  FiTruck,
  FiUser,
  FiX,
} = FiIcons;

const CASH_DENOMINATIONS = [100, 200, 500, 1000, 2000];
const INITIAL_PHONE_DATA = {
  whatsapp: "",
  whatsappDisplay: "",
  countryCode: "do",
  dialCode: "+1",
  nationalNumber: "",
  maxLength: 10,
  isValid: false,
};
const fmt = (value: any) => Number(value || 0).toLocaleString("es-DO");
const onlyDigits = (value: any) => String(value || "").replace(/\D/g, "");
const normalizeText = (value: any) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeDeliveryScope = (value: any) =>
  String(value || "").toLowerCase().trim() === "provincial"
    ? "provincial"
    : "municipal";

const storeAddressValue = (store: any, ...keys: string[]) => {
  for (const key of keys) {
    const value = String(store?.[key] || "").trim();
    if (value) return value;
  }
  return "";
};

const normalizeBankName = (value: any = "") =>
  String(value || "").trim().toLowerCase();

const normalizeObject = (value: any) => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }
  return {};
};

const boolSetting = (value: any, fallback = true) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = normalizeText(value);
  if (["false", "0", "no", "off", "deshabilitado", "inactivo"].includes(normalized)) return false;
  if (["true", "1", "si", "on", "habilitado", "activo"].includes(normalized)) return true;
  return fallback;
};

const phoneMatches = (left: any, right: any) => {
  const a = onlyDigits(left);
  const b = onlyDigits(right);
  if (!a || !b || Math.min(a.length, b.length) < 10) return false;
  return a === b || a.endsWith(b) || b.endsWith(a);
};

const customerName = (customer: any = {}) => {
  const primary = String(customer.name || "").trim();
  const lastName = String(
    customer.last_name || customer.lastName || customer.last_name || "",
  ).trim();
  if (!lastName || normalizeText(primary).endsWith(normalizeText(lastName))) {
    return primary;
  }
  return `${primary} ${lastName}`.trim();
};

const splitCustomerName = (value: any) => {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: parts[0] || "", lastName: "" };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
};

const customerWhatsapp = (customer: any = {}) =>
  String(
    customer.whatsappDisplay ||
      customer.whatsapp_display ||
      customer.whatsapp ||
      "",
  ).trim();

const customerTerritoryAddress = (customer: any = {}) =>
  normalizeTerritoryAddress({
    province: customer.province,
    provinceCode: customer.provinceCode || customer.province_code,
    municipality: customer.municipality,
    municipalityCode: customer.municipalityCode || customer.municipality_code,
    districtCode: customer.districtCode || customer.district_code,
    neighborhood: customer.neighborhood || customer.sector,
    neighborhoodId: customer.neighborhoodId || customer.neighborhood_id,
    street: customer.street,
    street_number: customer.street_number,
  });

const storeProvince = (store: any = {}) => ({
  code: String(
    store.provinceCode ||
      store.province_code ||
      store.provinceCode ||
      store.province_code ||
      "",
  ).trim(),
  name: String(
    store.province || store.provinceName || store.province_name || "",
  ).trim(),
});

const storeMunicipality = (store: any = {}) => ({
  code: storeAddressValue(
    store,
    "municipalityCode",
    "municipality_code",
    "municipalityCode",
    "municipality_code",
  ),
  name: storeAddressValue(
    store,
    "municipality",
    "municipalityName",
    "municipality_name",
  ),
  districtCode: storeAddressValue(
    store,
    "districtCode",
    "district_code",
    "districtCode",
    "district_code",
  ),
});

const zoneTerritoryAddress = (zone: any = {}, previous: any = {}) =>
  normalizeTerritoryAddress({
    ...previous,
    province: zone.provinceName || zone.province_name || zone.province || "",
    provinceCode:
      zone.provinceCode ||
      zone.province_code ||
      zone.provinceCode ||
      zone.province_code ||
      "",
    municipality:
      zone.municipalityName ||
      zone.municipality_name ||
      zone.municipality ||
      "",
    municipalityCode:
      zone.municipalityCode ||
      zone.municipality_code ||
      zone.municipalityCode ||
      zone.municipality_code ||
      "",
    districtCode:
      zone.districtCode ||
      zone.district_code ||
      zone.districtCode ||
      zone.district_code ||
      "",
    neighborhood:
      zone.neighborhoodName ||
      zone.neighborhood_name ||
      zone.neighborhood ||
      zone.sector ||
      "",
    neighborhoodId:
      zone.neighborhoodId ||
      zone.neighborhood_id ||
      zone.neighborhoodId ||
      zone.neighborhood_id ||
      "",
  });

const zoneLocationLabel = (zone: any = {}) =>
  [
    zone.neighborhoodName || zone.neighborhood_name || zone.neighborhood || zone.sector,
    zone.municipalityName || zone.municipality_name || zone.municipality,
    zone.provinceName || zone.province_name || zone.province,
  ]
    .filter(Boolean)
    .join(", ");

const storeAddress = (store: any = {}) =>
  [
    store.address,
    store.neighborhood || store.sector,
    store.street
      ? `${store.street}${store.street_number ? ` #${store.street_number}` : ""}`
      : "",
    store.municipality,
    store.province,
  ]
    .filter(Boolean)
    .join(", ") || "Dirección del negocio";

const accountKey = (account: any = {}) =>
  String(account.id || `${account.bank || ""}:${account.number || ""}`);

const BankLogo = ({ bank, className = "h-10 w-10 rounded-2xl" }: any) => {
  const logo = String(
    bank?.logo ||
      bank?.logoUrl ||
      bank?.logo_url ||
      bank?.bankLogo ||
      bank?.bank_logo ||
      "",
  ).trim();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logo]);

  if (logo && !failed) {
    return (
      <img
        src={logo}
        alt={bank?.name || "Banco"}
        className={`${className} shrink-0 border border-gray-100 bg-white object-contain p-1`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center border border-violet-100 bg-violet-50 text-base`}
      aria-hidden="true"
    >
      🏦
    </span>
  );
};

const orderModesFromStore = (store: any = {}) => {
  const settings = normalizeObject(store.paymentSettings || store.payment_settings);
  const modes = normalizeObject(
    store.orderModes ||
      store.order_modes ||
      settings.orderModes ||
      settings.order_modes,
  );
  const delivery = boolSetting(
    modes.delivery ?? modes.deliveryEnabled ?? modes.delivery_enabled,
    true,
  );
  const pickup = boolSetting(
    modes.pickup ?? modes.pickupEnabled ?? modes.pickup_enabled,
    true,
  );
  return !delivery && !pickup ? { delivery: true, pickup: true } : { delivery, pickup };
};

const creditConfigForCustomer = (customer: any, storeId: string) => {
  if (!customer || !storeId) return null;
  const credits = customer.storeCredit || customer.store_credit || {};
  return credits?.[storeId] || null;
};

const deliveryZoneLabel = (zone: any = {}) =>
  zone.neighborhoodName ||
  zone.neighborhood_name ||
  zone.neighborhood ||
  zone.sector ||
  zone.name ||
  "Zona de entrega";

const pointInsideZonePolygon = (point: any, polygon: any[] = []) => {
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

const zoneMatchesCustomer = (zone: any, customer: any) => {
  if (!zone || !customer) return false;
  if (String(zone.zoneType || zone.zone_type || '').toLowerCase() === 'geofence') {
    const lat = Number(customer.lat ?? customer.latitude ?? customer.location?.lat ?? customer.location?.latitude);
    const lng = Number(customer.lng ?? customer.lon ?? customer.longitude ?? customer.location?.lng ?? customer.location?.lon ?? customer.location?.longitude);
    const polygon = (Array.isArray(zone.geoPolygon || zone.geo_polygon) ? (zone.geoPolygon || zone.geo_polygon) : [])
      .map((point: any) => ({ lat: Number(point?.lat), lng: Number(point?.lng ?? point?.lon) }))
      .filter((point: any) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    return pointInsideZonePolygon({ lat, lng }, polygon);
  }
  const zoneId = String(
    zone.neighborhoodId || zone.neighborhood_id || zone.neighborhoodId || zone.neighborhood_id || "",
  );
  const customerId = String(customer.neighborhoodId || customer.neighborhood_id || "");
  if (zoneId && customerId && zoneId === customerId) return true;
  const zoneName = normalizeText(deliveryZoneLabel(zone));
  const customerNameValue = normalizeText(customer.sector || customer.neighborhood || "");
  return Boolean(zoneName && customerNameValue && zoneName === customerNameValue);
};

const cashTenderOptions = (total: number) => {
  const numericTotal = Number(total || 0);
  if (numericTotal <= 0) return [];
  const direct = CASH_DENOMINATIONS.filter((amount) => amount >= numericTotal);
  if (direct.length) return direct.slice(0, 4);
  return Array.from(
    new Set(
      [100, 200, 500, 1000, 2000].map(
        (step) => Math.ceil(numericTotal / step) * step,
      ),
    ),
  )
    .filter((amount) => amount >= numericTotal)
    .sort((a, b) => a - b)
    .slice(0, 4);
};

const paymentSettingsFromStore = (store: any = {}) =>
  normalizeObject(store.paymentSettings || store.payment_settings);

const firstSetting = (settings: any, keys: string[]) => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) return settings[key];
  }
  return undefined;
};

const paymentEnabled = (settings: any, key: string) => {
  if (key === "cash")
    return boolSetting(firstSetting(settings, ["cash"]), true);
  if (key === "card")
    return boolSetting(firstSetting(settings, ["card"]), true);
  if (key === "bank_transfer")
    return boolSetting(firstSetting(settings, ["bankTransfer"]), true);
  if (key === "store_credit")
    return boolSetting(firstSetting(settings, ["credit"]), true);
  return true;
};

type AssistedOrderModalProps = {
  subtotal: number;
  customers?: any[];
  activeStore?: any;
  activeStoreId?: string;
  deliveryZones?: any[];
  transferAccounts?: any[];
  bankByName?: Record<string, any>;
  onClose: () => void;
  onConfirm: (payload: any) => Promise<any>;
};

const AssistedOrderModal = ({
  subtotal,
  customers = [],
  activeStore = {},
  activeStoreId = "",
  deliveryZones = [],
  transferAccounts = [],
  bankByName = {},
  onClose,
  onConfirm,
}: AssistedOrderModalProps) => {
  const [orderSource, setOrderSource] = useState("whatsapp");
  const [phoneData, setPhoneData] = useState<any>(INITIAL_PHONE_DATA);
  const [whatsappCheck, setWhatsappCheck] = useState<any>({
    phone: "",
    status: "idle",
    message: "",
  });
  const [remoteCustomer, setRemoteCustomer] = useState<any>(null);
  const [customerLookupLoading, setCustomerLookupLoading] = useState(false);
  const [customerLookupComplete, setCustomerLookupComplete] = useState(false);
  const [newCustomerFirstName, setNewCustomerFirstName] = useState("");
  const [newCustomerLastName, setNewCustomerLastName] = useState("");
  const [orderMode, setOrderMode] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState<any>({
    ...emptyTerritoryAddress,
  });
  const [deliveryZoneId, setDeliveryZoneId] = useState("");
  const [transferAccountId, setTransferAccountId] = useState("");
  const [cashChangeAnswer, setCashChangeAnswer] = useState("");
  const [cashChangeFrom, setCashChangeFrom] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const whatsapp = String(phoneData.whatsapp || "").trim();
  const phoneDigits = onlyDigits(whatsapp);
  const whatsappFormatValid = Boolean(phoneData.isValid && whatsapp);
  const whatsappCheckCurrent = whatsappCheck.phone === phoneDigits;
  const whatsappValidationLoading = Boolean(
    whatsappFormatValid &&
      whatsappCheckCurrent &&
      whatsappCheck.status === "checking",
  );
  const whatsappVerified = Boolean(
    whatsappFormatValid &&
      whatsappCheckCurrent &&
      whatsappCheck.status === "valid",
  );
  const whatsappRejected = Boolean(
    phoneDigits &&
      (
        !phoneData.isValid ||
        (whatsappCheckCurrent && whatsappCheck.status === "invalid")
      ),
  );

  const localMatchedCustomer = useMemo(
    () =>
      whatsappVerified
        ? customers.find((customer) =>
            phoneMatches(customerWhatsapp(customer) || customer.whatsapp, whatsapp),
          ) || null
        : null,
    [customers, whatsapp, whatsappVerified],
  );

  useEffect(() => {
    setError("");
    setRemoteCustomer(null);
    setCustomerLookupLoading(false);
    setCustomerLookupComplete(false);

    if (!whatsappFormatValid) {
      setWhatsappCheck({
        phone: phoneDigits,
        status: "idle",
        message: phoneDigits
          ? "Completa un número válido según el país seleccionado."
          : "",
      });
      return;
    }

    let active = true;
    setWhatsappCheck((previous: any) => ({
      phone: phoneDigits,
      status:
        previous.phone === phoneDigits && previous.status === "valid"
          ? "valid"
          : "checking",
      message:
        previous.phone === phoneDigits && previous.status === "valid"
          ? previous.message
          : "Validando que el número tenga WhatsApp…",
    }));

    const timer = window.setTimeout(async () => {
      try {
        const validation = await api.post("/client/validate-whatsapp", {
          phone: whatsapp,
        });
        if (!active) return;
        const valid = Boolean(validation?.valid || validation?.has_whatsapp);
        setWhatsappCheck({
          phone: phoneDigits,
          status: valid ? "valid" : "invalid",
          message: valid
            ? "WhatsApp verificado correctamente."
            : validation?.message ||
              "Este número no tiene una cuenta de WhatsApp activa.",
        });
      } catch (validationError: any) {
        if (!active) return;
        setWhatsappCheck({
          phone: phoneDigits,
          status: "invalid",
          message:
            validationError?.message ||
            "No fue posible validar este WhatsApp. Inténtalo nuevamente.",
        });
      }
    }, 500);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [whatsapp, whatsappFormatValid, phoneDigits]);

  useEffect(() => {
    if (!whatsappVerified) {
      setRemoteCustomer(null);
      setCustomerLookupLoading(false);
      setCustomerLookupComplete(false);
      return;
    }
    if (localMatchedCustomer) {
      setRemoteCustomer(null);
      setCustomerLookupLoading(false);
      setCustomerLookupComplete(true);
      return;
    }

    let active = true;
    setRemoteCustomer(null);
    setCustomerLookupLoading(true);
    setCustomerLookupComplete(false);
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.post("/assisted-orders/customer-lookup", {
          whatsapp,
        });
        if (!active) return;
        const foundCustomer =
          response?.found && response?.customer
            ? {
                ...response.customer,
                _lookupScope: response.scope || "global",
                _registrationComplete:
                  response.registration_complete !== false,
              }
            : null;
        setRemoteCustomer(foundCustomer);
      } catch {
        if (active) setRemoteCustomer(null);
      } finally {
        if (active) {
          setCustomerLookupLoading(false);
          setCustomerLookupComplete(true);
        }
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [localMatchedCustomer, whatsapp, whatsappVerified]);

  const selectedCustomer = localMatchedCustomer || remoteCustomer;

  useEffect(() => {
    setError("");
    if (selectedCustomer) {
      const names = splitCustomerName(customerName(selectedCustomer));
      setNewCustomerFirstName(names.firstName);
      setNewCustomerLastName(names.lastName);
      const customerAddress = customerTerritoryAddress(selectedCustomer);
      setDeliveryAddress(customerAddress);
      const matchedZone = deliveryZones.find((zone) =>
        zoneMatchesCustomer(zone, selectedCustomer),
      );
      if (matchedZone) {
        setDeliveryZoneId(accountKey(matchedZone));
        setDeliveryAddress((previous: any) =>
          zoneTerritoryAddress(matchedZone, {
            ...customerAddress,
            street: customerAddress.street || previous.street,
            street_number: customerAddress.street_number || previous.street_number,
          }),
        );
      } else {
        setDeliveryZoneId("");
      }
    } else {
      setNewCustomerFirstName("");
      setNewCustomerLastName("");
      setDeliveryAddress({ ...emptyTerritoryAddress });
      setDeliveryZoneId("");
      if (paymentMethod === "store_credit") setPaymentMethod("");
    }
  }, [selectedCustomer, deliveryZones]);

  const availableZones = useMemo(
    () =>
      (Array.isArray(deliveryZones) ? deliveryZones : []).filter(
        (zone) => zone && zone.active !== false,
      ),
    [deliveryZones],
  );
  const selectedZone = availableZones.find(
    (zone) => accountKey(zone) === deliveryZoneId,
  );
  const configuredDeliveryScope = normalizeDeliveryScope(
    activeStore.deliveryScope || activeStore.delivery_scope,
  );
  const configuredStoreProvince = storeProvince(activeStore);
  const configuredStoreMunicipality = storeMunicipality(activeStore);
  const municipalScope =
    configuredDeliveryScope === "municipal" &&
    Boolean(configuredStoreMunicipality.code);
  const deliveryAddressLine = buildTerritoryAddressLine(deliveryAddress);
  const deliveryAddressComplete = isTerritoryAddressComplete(deliveryAddress);

  const handleDeliveryZoneChange = (nextZoneId: string) => {
    setDeliveryZoneId(nextZoneId);
    const nextZone = availableZones.find(
      (zone) => accountKey(zone) === nextZoneId,
    );
    if (nextZone) {
      setDeliveryAddress((previous: any) =>
        zoneTerritoryAddress(nextZone, previous),
      );
      return;
    }
    setDeliveryAddress((previous: any) => {
      const normalized = normalizeTerritoryAddress(previous);
      const provinceChanged = Boolean(
        configuredStoreProvince.code &&
          normalized.provinceCode !== configuredStoreProvince.code,
      );
      const municipalityChanged = Boolean(
        municipalScope &&
          normalized.municipalityCode !== configuredStoreMunicipality.code,
      );
      return normalizeTerritoryAddress({
        ...normalized,
        province: configuredStoreProvince.code
          ? configuredStoreProvince.name
          : normalized.province,
        provinceCode: configuredStoreProvince.code || normalized.provinceCode,
        municipality: municipalScope
          ? configuredStoreMunicipality.name
          : provinceChanged
            ? ""
            : normalized.municipality,
        municipalityCode: municipalScope
          ? configuredStoreMunicipality.code
          : provinceChanged
            ? ""
            : normalized.municipalityCode,
        districtCode: municipalScope
          ? configuredStoreMunicipality.districtCode
          : provinceChanged
            ? ""
            : normalized.districtCode,
        neighborhood: provinceChanged || municipalityChanged ? "" : normalized.neighborhood,
        neighborhoodId:
          provinceChanged || municipalityChanged ? "" : normalized.neighborhoodId,
      });
    });
  };

  const handleDeliveryAddressChange = (nextAddress: any) => {
    setDeliveryAddress(normalizeTerritoryAddress(nextAddress));
    setError("");
  };

  const deliveryCost =
    orderMode === "delivery"
      ? Number(
          selectedZone?.deliveryCost ||
            selectedZone?.delivery_cost ||
            selectedZone?.cost ||
            0,
        )
      : 0;
  const total = Number(subtotal || 0) + deliveryCost;
  const selectedTransferAccount = transferAccounts.find(
    (account) => accountKey(account) === transferAccountId,
  );
  const orderModes = orderModesFromStore(activeStore);
  const settings = paymentSettingsFromStore(activeStore);
  const credit = creditConfigForCustomer(selectedCustomer, activeStoreId);
  const customerCanUseCredit = Boolean(
    selectedCustomer &&
      credit?.enabled !== false &&
      normalizeText(credit?.status) !== "blocked" &&
      (normalizeText(credit?.type) === "unlimited" || Number(credit?.limit || 0) > 0),
  );
  const paymentMethods = PAYMENT_METHODS.filter(
    (method) => paymentEnabled(settings, method.key),
  );
  const changeOptions = cashTenderOptions(total);
  const changeFromNumber = Number(cashChangeFrom || 0);
  const changeValid =
    cashChangeAnswer === "no" ||
    (cashChangeAnswer === "yes" && changeFromNumber >= total);
  const isNewPartialCustomer =
    whatsappVerified &&
    customerLookupComplete &&
    !customerLookupLoading &&
    !selectedCustomer;

  useEffect(() => {
    if (paymentMethod !== "bank_transfer") setTransferAccountId("");
    if (!(orderMode === "delivery" && paymentMethod === "cash")) {
      setCashChangeAnswer("");
      setCashChangeFrom("");
    }
    setError("");
  }, [paymentMethod, orderMode]);

  const validate = () => {
    if (!whatsappFormatValid) {
      return "Ingresa un número válido según el país seleccionado.";
    }
    if (whatsappValidationLoading) {
      return "Espera mientras validamos el número de WhatsApp.";
    }
    if (!whatsappVerified) {
      return whatsappCheck.message || "El número ingresado no pudo validarse como WhatsApp.";
    }
    if (customerLookupLoading || !customerLookupComplete) {
      return "Espera mientras verificamos si el cliente ya existe.";
    }
    if (
      isNewPartialCustomer &&
      (!newCustomerFirstName.trim() || !newCustomerLastName.trim())
    ) {
      return "Completa el nombre y el apellido para crear el registro parcial.";
    }
    if (!orderMode) return "Selecciona si el pedido será entrega o recogida.";
    if (orderMode === "delivery" && !deliveryAddressComplete) {
      return municipalScope
        ? "Selecciona el barrio y completa la calle y el número para la entrega."
        : "Completa municipio o distrito, barrio, calle y número para la entrega.";
    }
    if (!paymentMethod) return "Selecciona el método de pago.";
    if (paymentMethod === "bank_transfer" && !selectedTransferAccount) {
      return "Selecciona la cuenta donde se recibirá la transferencia.";
    }
    if (paymentMethod === "store_credit" && !customerCanUseCredit) {
      return "El fiado requiere un cliente registrado con crédito disponible.";
    }
    if (
      orderMode === "delivery" &&
      paymentMethod === "cash" &&
      !changeValid
    ) {
      return "Indica si el cliente necesitará cambio y con cuánto pagará.";
    }
    return "";
  };

  const submit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onConfirm({
        method: paymentMethod,
        order_mode: orderMode,
        order_source: orderSource,
        customer_id:
          selectedCustomer?._lookupScope === "global"
            ? ""
            : selectedCustomer?.id || "",
        customer_name: selectedCustomer
          ? customerName(selectedCustomer)
          : `${newCustomerFirstName.trim()} ${newCustomerLastName.trim()}`.trim(),
        customer_first_name: selectedCustomer
          ? splitCustomerName(customerName(selectedCustomer)).firstName
          : newCustomerFirstName.trim(),
        customer_last_name: selectedCustomer
          ? splitCustomerName(customerName(selectedCustomer)).lastName
          : newCustomerLastName.trim(),
        customer_whatsapp: whatsapp,
        whatsapp_display: phoneData.whatsappDisplay || whatsapp,
        country_code: phoneData.countryCode || "do",
        dial_code: phoneData.dialCode || "+1",
        delivery_address:
          orderMode === "delivery" ? deliveryAddressLine : "",
        delivery_zone_id: selectedZone?.id || "",
        province:
          orderMode === "delivery" ? deliveryAddress.province : "",
        province_code:
          orderMode === "delivery" ? deliveryAddress.provinceCode : "",
        municipality:
          orderMode === "delivery" ? deliveryAddress.municipality : "",
        municipality_code:
          orderMode === "delivery" ? deliveryAddress.municipalityCode : "",
        district_code:
          orderMode === "delivery" ? deliveryAddress.districtCode : "",
        neighborhood:
          orderMode === "delivery" ? deliveryAddress.neighborhood : "",
        neighborhood_id:
          orderMode === "delivery" ? deliveryAddress.neighborhoodId : "",
        street:
          orderMode === "delivery" ? deliveryAddress.street : "",
        street_number:
          orderMode === "delivery" ? deliveryAddress.street_number : "",
        delivery_cost: deliveryCost,
        payment_bank_account_id: selectedTransferAccount?.id || "",
        cash_change_answered:
          orderMode === "delivery" && paymentMethod === "cash",
        cash_change_needed: cashChangeAnswer === "yes",
        cash_change_from:
          cashChangeAnswer === "yes" ? Number(cashChangeFrom || 0) : 0,
        notes: notes.trim(),
      });
    } catch (submitError: any) {
      setError(
        submitError?.message ||
          "No fue posible crear el pedido asistido. Inténtalo de nuevo.",
      );
      setSubmitting(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px]"
        onClick={() => !submitting && onClose()}
      />
      <div className="pointer-events-none fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-3 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          className="pointer-events-auto flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#00a884]">
                Punto de venta
              </p>
              <h2 className="mt-1 text-xl font-black text-gray-900">
                Crear pedido asistido
              </h2>
              <p className="mt-1 text-xs font-medium text-gray-400">
                Registra pedidos recibidos por WhatsApp, llamada u otro canal.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 disabled:opacity-50"
              aria-label="Cerrar"
            >
              <FiX />
            </button>
          </div>

          <div className="overflow-y-auto px-5 py-5 sm:px-6 scrollbar-hide">
            <div className="space-y-5">
              <section className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Canal de origen
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: "whatsapp", label: "WhatsApp", icon: FiMessageCircle },
                    { key: "phone", label: "Llamada", icon: FiPhone },
                    { key: "other", label: "Otro", icon: FiPackage },
                  ].map((option) => {
                    const Icon = option.icon;
                    const active = orderSource === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setOrderSource(option.key)}
                        className={`flex items-center justify-center gap-2 rounded-xl border-2 px-2 py-2.5 text-xs font-black transition-all ${
                          active
                            ? "border-[#8ee8c4] bg-[#f0fbf8] text-[#00a884]"
                            : "border-gray-200 bg-white text-gray-500"
                        }`}
                      >
                        <Icon className="shrink-0" />
                        <span className="truncate">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    Cliente
                  </p>
                  <span className="text-[9px] font-black uppercase text-amber-600">
                    WhatsApp requerido
                  </span>
                </div>
                <PhoneInput
                  value={phoneData.whatsapp}
                  onChange={(nextPhone: any) => {
                    setPhoneData((previous: any) => ({
                      ...previous,
                      ...nextPhone,
                    }));
                    setError("");
                  }}
                  valid={whatsappVerified}
                  invalid={whatsappRejected}
                  placeholder="809-234-5678"
                  initialCountry={phoneData.countryCode || "do"}
                  preferredCountries={["do"]}
                  disabled={submitting}
                  required
                  autoComplete="tel"
                />

                <div className="min-h-[18px]">
                  {whatsappValidationLoading || customerLookupLoading ? (
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400">
                      <FiLoader className="animate-spin text-[#00a884]" />
                      {whatsappValidationLoading
                        ? "Validando el número de WhatsApp…"
                        : "Buscando el cliente en este negocio y en WAMERCIO…"}
                    </p>
                  ) : whatsappCheckCurrent && whatsappCheck.message ? (
                    <p
                      className={`flex items-start gap-1.5 text-[10px] font-semibold ${
                        whatsappVerified
                          ? "text-[#00a884]"
                          : whatsappRejected
                            ? "text-red-500"
                            : "text-gray-400"
                      }`}
                    >
                      {whatsappVerified ? (
                        <FiCheckCircle className="mt-0.5 shrink-0" />
                      ) : whatsappRejected ? (
                        <FiAlertTriangle className="mt-0.5 shrink-0" />
                      ) : null}
                      <span>{whatsappCheck.message}</span>
                    </p>
                  ) : null}
                </div>

                {selectedCustomer && (
                  <div className="flex items-start gap-3 rounded-2xl border border-[#bce8d1] bg-[#f0fbf8] p-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#00a884]">
                      <FiCheckCircle />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-gray-800">
                        {customerName(selectedCustomer)}
                      </p>
                      <p className="mt-0.5 text-[10px] font-bold text-gray-500">
                        {selectedCustomer._lookupScope === "global"
                          ? "Cliente existente en WAMERCIO"
                          : "Cliente existente en el negocio"} · {customerWhatsapp(selectedCustomer)}
                      </p>
                      {selectedCustomer.national_id && (
                        <p className="mt-0.5 text-[10px] text-gray-400">
                          Cédula: {selectedCustomer.national_id}
                        </p>
                      )}
                      {selectedCustomer._registrationComplete === false && (
                        <p className="mt-1 text-[9px] font-black uppercase text-amber-600">
                          Registro parcial pendiente de completar
                        </p>
                      )}
                    </div>
                    <FiCheck className="mt-1 shrink-0 text-[#00a884]" />
                  </div>
                )}

                {isNewPartialCustomer && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2 rounded-2xl border border-amber-100 bg-amber-50/60 p-3"
                  >
                    <div className="flex items-start gap-2">
                      <FiAlertTriangle className="mt-0.5 shrink-0 text-amber-500" />
                      <div>
                        <p className="text-xs font-black text-amber-800">
                          Cliente no registrado
                        </p>
                        <p className="mt-0.5 text-[10px] font-semibold leading-snug text-amber-700">
                          Se creará un perfil parcial con nombre, apellido, WhatsApp y la dirección usada en el pedido. Más adelante el cliente podrá completar cédula, PIN y demás datos usando el mismo número.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="relative">
                        <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500" />
                        <input
                          type="text"
                          value={newCustomerFirstName}
                          onChange={(event) =>
                            setNewCustomerFirstName(
                              event.target.value.replace(/[0-9]/g, "").slice(0, 80),
                            )
                          }
                          placeholder="Nombre *"
                          maxLength={80}
                          disabled={submitting}
                          className="w-full rounded-xl border border-amber-200 bg-white py-3 pl-10 pr-4 text-sm font-semibold outline-none focus:border-amber-400"
                        />
                      </div>
                      <div className="relative">
                        <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500" />
                        <input
                          type="text"
                          value={newCustomerLastName}
                          onChange={(event) =>
                            setNewCustomerLastName(
                              event.target.value.replace(/[0-9]/g, "").slice(0, 80),
                            )
                          }
                          placeholder="Apellido *"
                          maxLength={80}
                          disabled={submitting}
                          className="w-full rounded-xl border border-amber-200 bg-white py-3 pl-10 pr-4 text-sm font-semibold outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </section>

              <section className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Modalidad de pedido
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      key: "delivery",
                      label: "Entrega",
                      detail: `Delivery RD$ ${fmt(deliveryCost)}`,
                      icon: FiTruck,
                      enabled: orderModes.delivery,
                    },
                    {
                      key: "pickup",
                      label: "Recogida",
                      detail: "En negocio",
                      icon: FiPackage,
                      enabled: orderModes.pickup,
                    },
                  ].map((option) => {
                    const Icon = option.icon;
                    const active = orderMode === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        disabled={!option.enabled || submitting}
                        onClick={() => setOrderMode(option.key)}
                        className={`rounded-xl border-2 px-3 py-2.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                          active
                            ? "border-[#8ee8c4] bg-[#f0fbf8] text-[#00a884] shadow-sm"
                            : "border-gray-200 bg-white text-gray-500"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="shrink-0 text-sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-black">
                              {option.label}
                            </p>
                            <p className="truncate text-[9px] font-bold opacity-70">
                              {option.detail}
                            </p>
                          </div>
                          {active && <FiCheckCircle className="shrink-0 text-sm" />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {orderMode === "pickup" && (
                  <div className="flex items-start gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                    <FiMapPin className="mt-0.5 shrink-0 text-[#00a884]" />
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                        Dirección de recogida
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-gray-600">
                        {storeAddress(activeStore)}
                      </p>
                    </div>
                  </div>
                )}

                {orderMode === "delivery" && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2 rounded-2xl border border-[#c0ece1] bg-[#f8fffc] p-3"
                  >
                    {availableZones.length > 0 && (
                      <label className="block">
                        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-gray-400">
                          Zona de entrega
                        </span>
                        <select
                          value={deliveryZoneId}
                          onChange={(event) =>
                            handleDeliveryZoneChange(event.target.value)
                          }
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-xs font-bold text-gray-700 outline-none focus:border-[#00a884]"
                        >
                          <option value="">Sin zona / entrega RD$ 0</option>
                          {availableZones.map((zone) => (
                            <option key={accountKey(zone)} value={accountKey(zone)}>
                              {deliveryZoneLabel(zone)} · RD$ {fmt(zone.deliveryCost || zone.delivery_cost || zone.cost)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div className="rounded-2xl border border-emerald-100 bg-white p-3">
                      <TerritoryAddressForm
                        value={deliveryAddress}
                        onChange={handleDeliveryAddressChange}
                        compact
                        title="Dirección de entrega"
                        lockedProvince={
                          selectedZone
                            ? {
                                code:
                                  selectedZone.provinceCode ||
                                  selectedZone.province_code,
                                name:
                                  selectedZone.provinceName ||
                                  selectedZone.province_name,
                              }
                            : configuredStoreProvince.code
                              ? configuredStoreProvince
                              : null
                        }
                        lockedMunicipality={
                          selectedZone
                            ? {
                                code:
                                  selectedZone.municipalityCode ||
                                  selectedZone.municipality_code,
                                name:
                                  selectedZone.municipalityName ||
                                  selectedZone.municipality_name,
                                districtCode:
                                  selectedZone.districtCode ||
                                  selectedZone.district_code,
                              }
                            : municipalScope
                              ? configuredStoreMunicipality
                              : null
                        }
                        lockedNeighborhood={
                          selectedZone
                            ? {
                                id:
                                  selectedZone.neighborhoodId ||
                                  selectedZone.neighborhood_id,
                                name:
                                  selectedZone.neighborhoodName ||
                                  selectedZone.neighborhood_name,
                              }
                            : null
                        }
                        hideProvince={Boolean(
                          selectedZone || configuredStoreProvince.code,
                        )}
                        hideMunicipality={Boolean(selectedZone || municipalScope)}
                        hideNeighborhood={Boolean(selectedZone)}
                        scopeHint={
                          selectedZone
                            ? `Ubicación deducida por la zona seleccionada: ${
                                zoneLocationLabel(selectedZone) ||
                                deliveryZoneLabel(selectedZone)
                              }. Completa únicamente calle y número.`
                            : municipalScope
                              ? `Sin zona tarifada. Se usarán automáticamente ${configuredStoreMunicipality.name}, ${configuredStoreProvince.name}. Selecciona el barrio y luego completa calle y número.`
                              : configuredStoreProvince.name
                                ? `Sin zona tarifada. Selecciona municipio/distrito y barrio dentro de ${configuredStoreProvince.name}; luego completa calle y número.`
                              : "Sin zona tarifada. Selecciona la ubicación completa y luego completa calle y número."
                        }
                        missingNeighborhoodMessage="Si el barrio no aparece, agrégalo primero desde Zonas de entrega o selecciona otra ubicación disponible."
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-white px-3 py-2">
                      <span className="text-[10px] font-bold text-gray-500">
                        Costo de entrega
                      </span>
                      <span className="text-xs font-black text-[#00a884]">
                        RD$ {fmt(deliveryCost)}
                      </span>
                    </div>
                  </motion.div>
                )}
              </section>

              <section className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Método de pago
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {paymentMethods.map((method) => {
                    const active = paymentMethod === method.key;
                    const disabled =
                      submitting ||
                      !orderMode ||
                      (method.key === "bank_transfer" && transferAccounts.length === 0) ||
                      (method.key === "store_credit" && !customerCanUseCredit);
                    const Icon =
                      method.key === "cash"
                        ? FiDollarSign
                        : method.key === "bank_transfer"
                          ? FiSend
                          : method.key === "store_credit"
                            ? FiUser
                            : FiCreditCard;
                    return (
                      <button
                        key={method.key}
                        type="button"
                        disabled={disabled}
                        onClick={() => setPaymentMethod(method.key)}
                        className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-xs font-black transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                          active
                            ? "border-[#8ee8c4] bg-[#f0fbf8] text-[#00a884] shadow-sm"
                            : "border-gray-200 bg-white text-gray-500"
                        }`}
                      >
                        <Icon className="shrink-0" />
                        <span>{method.label}</span>
                        {active && <FiCheckCircle className="ml-auto shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                {!orderMode && (
                  <p className="text-[10px] font-semibold text-gray-400">
                    Primero selecciona la modalidad del pedido.
                  </p>
                )}
                {paymentEnabled(settings, "store_credit") && !customerCanUseCredit && (
                  <p className="text-[10px] font-semibold text-amber-600">
                    Fiado solo se habilita al reconocer un cliente registrado con crédito disponible.
                  </p>
                )}
              </section>

              <AnimatePresence>
                {paymentMethod === "bank_transfer" && (
                  <motion.section
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="space-y-2 rounded-2xl border border-violet-100 bg-violet-50/50 p-3"
                  >
                    <p className="text-[10px] font-black uppercase tracking-widest text-violet-500">
                      Cuenta de transferencia
                    </p>
                    {transferAccounts.length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {transferAccounts.map((account) => {
                          const key = accountKey(account);
                          const active = transferAccountId === key;
                          const catalogBank =
                            bankByName[normalizeBankName(account.bank)] || {};
                          const bank = {
                            ...catalogBank,
                            name: account.bank || catalogBank.name || "Banco",
                            logo:
                              account.logo ||
                              account.logoUrl ||
                              account.logo_url ||
                              account.bankLogo ||
                              account.bank_logo ||
                              catalogBank.logo ||
                              catalogBank.logoUrl ||
                              catalogBank.logo_url ||
                              "",
                          };
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setTransferAccountId(key)}
                              className={`rounded-xl border-2 bg-white p-3 text-left transition-all ${
                                active
                                  ? "border-violet-300 text-violet-700 shadow-sm"
                                  : "border-gray-200 text-gray-600"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <BankLogo bank={bank} />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-black text-gray-800">
                                    {account.bank || bank.name}
                                  </p>
                                  <p className="mt-0.5 truncate text-[9px] font-semibold text-gray-400">
                                    {account.holder || "Titular no configurado"}
                                  </p>
                                  <p className="mt-1 text-[10px] font-black text-violet-700">
                                    {account.number}
                                  </p>
                                </div>
                                {active ? (
                                  <FiCheckCircle className="shrink-0 text-base text-[#00a884]" />
                                ) : (
                                  <FiSend className="shrink-0 text-base text-violet-300" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs font-bold text-amber-700">
                        No hay cuentas activas configuradas.
                      </p>
                    )}
                  </motion.section>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {orderMode === "delivery" && paymentMethod === "cash" && (
                  <motion.section
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="space-y-2 rounded-2xl border border-emerald-100 bg-[#f0fbf8] p-3"
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-white text-[#00a884]">
                        <FiRefreshCw />
                      </span>
                      <div>
                        <p className="text-xs font-black text-gray-800">
                          ¿Necesita cambio?
                        </p>
                        <p className="text-[10px] font-medium text-gray-500">
                          Indica con cuánto pagará para preparar el vuelto.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setCashChangeAnswer("yes")}
                        className={`rounded-xl border-2 px-3 py-2 text-xs font-black ${
                          cashChangeAnswer === "yes"
                            ? "border-[#8ee8c4] bg-white text-[#00a884]"
                            : "border-gray-200 bg-white/70 text-gray-500"
                        }`}
                      >
                        Sí
                      </button>
                      <button
                        type="button"
                        onClick={() => setCashChangeAnswer("no")}
                        className={`rounded-xl border-2 px-3 py-2 text-xs font-black ${
                          cashChangeAnswer === "no"
                            ? "border-[#8ee8c4] bg-white text-[#00a884]"
                            : "border-gray-200 bg-white/70 text-gray-500"
                        }`}
                      >
                        No
                      </button>
                    </div>
                    {cashChangeAnswer === "yes" && (
                      <div className="grid grid-cols-2 gap-2">
                        {changeOptions.map((amount) => (
                          <button
                            key={amount}
                            type="button"
                            onClick={() => setCashChangeFrom(String(amount))}
                            className={`rounded-xl border-2 px-2 py-2 text-xs font-black ${
                              changeFromNumber === amount
                                ? "border-[#00a884] bg-[#00a884] text-white"
                                : "border-gray-200 bg-white text-gray-600"
                            }`}
                          >
                            RD$ {fmt(amount)}
                          </button>
                        ))}
                      </div>
                    )}
                    {cashChangeAnswer === "yes" && changeFromNumber >= total && (
                      <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-white/80 px-3 py-2">
                        <span className="text-[10px] font-bold text-gray-500">
                          Vuelto estimado
                        </span>
                        <span className="text-xs font-black text-[#00a884]">
                          RD$ {fmt(changeFromNumber - total)}
                        </span>
                      </div>
                    )}
                    {cashChangeAnswer === "no" && (
                      <div className="rounded-xl border border-emerald-100 bg-white/80 px-3 py-2 text-[10px] font-bold text-[#00a884]">
                        El cliente pagará el monto exacto: RD$ {fmt(total)}.
                      </div>
                    )}
                  </motion.section>
                )}
              </AnimatePresence>

              <section>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-gray-400">
                    Nota del pedido <span className="text-gray-300">(opcional)</span>
                  </span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={2}
                    placeholder="Ej.: llamar al llegar, preparar para las 6:00 p. m."
                    className="w-full resize-none rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-[#00a884]"
                  />
                </label>
              </section>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-[11px] font-bold text-red-700">
                  <FiAlertTriangle className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-gray-100 bg-white px-5 py-4 sm:px-6">
            <div className="mb-3 rounded-2xl border border-[#00a884]/15 bg-[#f8fffc] p-3">
              {orderMode === "delivery" && (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-gray-400">Subtotal</span>
                    <span className="font-black text-gray-500">RD$ {fmt(subtotal)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="font-semibold text-gray-400">Entrega</span>
                    <span className="font-black text-[#00a884]">RD$ {fmt(deliveryCost)}</span>
                  </div>
                </>
              )}
              <div className="mt-1 flex items-center justify-between border-t border-[#00a884]/10 pt-2">
                <span className="text-sm font-bold text-gray-600">Total</span>
                <span className="text-xl font-black text-gray-900">RD$ {fmt(total)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-xl bg-gray-100 py-3 text-sm font-black text-gray-600 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#00a884] py-3 text-sm font-black text-white shadow-md shadow-[#00a884]/20 disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <FiLoader className="animate-spin" /> Creando...
                  </>
                ) : (
                  <>
                    <FiCheckCircle /> Crear pedido
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
};

export default AssistedOrderModal;
