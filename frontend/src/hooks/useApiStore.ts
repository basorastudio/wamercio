import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  api,
  isPlatformRootHost,
  isSuperAdminPath,
  isAdminPath,
  isTenantStoreHost,
} from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { appDateKey, isSameMonthInAppTimezone, nowISO } from "../lib/timezone";
import {
  DEFAULT_RUNTIME_CONFIG,
  loadRuntimeConfig,
} from "../lib/runtimeConfig";
import { getStoreServiceStatus } from "../lib/serviceHours";
import {
  buildWeightedCartItem,
  cartItemInventoryQuantity,
  cartItemKey,
  cartItemLineTotal,
  getAmountWeightBreakdown,
  getWeightedProductConfig,
  isWeightedProduct,
  minimumAmountForProduct,
  normalizeSaleMode,
  roundMoney,
  roundPayableAmount,
  roundWeight,
  sanitizeAmount,
  sanitizeUnitQuantity,
  sanitizeWeight,
} from "../lib/weightedProducts";

const DEFAULT_CATEGORIES = [];
const DEFAULT_ORDER_MODES = { delivery: true, pickup: true };

const normalizeDeliveryScope = (value) => {
  const raw = String(value || "")
    .toLowerCase()
    .trim();
  return raw === "provincial" ? "provincial" : "municipal";
};

const getTenantScopeSafe = () => {
  if (typeof window === "undefined") return "server";
  return window.location.hostname || window.location.host || "local";
};

const deliveryScopeStorageKey = (storeId) =>
  `colmapro_delivery_scope:${getTenantScopeSafe()}:${storeId || "active"}`;

const cartStorageKey = (storeId, userId = "guest") =>
  `colmapro_cart:${getTenantScopeSafe()}:${storeId || "active"}:${userId || "guest"}`;

const normalizeCartItems = (items) =>
  (Array.isArray(items) ? items : [])
    .filter((item) => item && item.id)
    .map((item) => {
      const weighted = isWeightedProduct(item);
      const config = getWeightedProductConfig(item);
      const saleMode = weighted ? normalizeSaleMode(item.saleMode || item.sale_mode, item) : "unit";
      let quantity = weighted
        ? saleMode === "amount"
          ? roundWeight(
              item.requestedWeight ??
                item.requested_weight ??
                item.estimatedWeight ??
                item.estimated_weight ??
                item.quantity ??
                config.minimumWeight,
              config.weightPrecision,
            )
          : sanitizeWeight(
              item.requestedWeight ??
                item.requested_weight ??
                item.estimatedWeight ??
                item.estimated_weight ??
                item.quantity ??
                config.minimumWeight,
              item,
            )
        : sanitizeUnitQuantity(item.quantity);
      const unitPrice = roundMoney(
        item.unitPrice ?? item.unit_price ?? item.price ?? 0,
      );
      const lineTotal = weighted
        ? saleMode === "amount"
          ? sanitizeAmount(
              item.requestedAmount ??
                item.requested_amount ??
                item.lineTotal ??
                item.line_total ??
                unitPrice * quantity,
              item,
            )
          : roundPayableAmount(unitPrice * quantity)
        : roundMoney(unitPrice * quantity);
      const requestedAmount = weighted
        ? saleMode === "amount"
          ? lineTotal
          : roundPayableAmount(unitPrice * quantity)
        : lineTotal;
      const amountBreakdown =
        weighted && saleMode === "amount"
          ? getAmountWeightBreakdown(lineTotal, {
              ...item,
              price: unitPrice,
              unitPrice,
              unit_price: unitPrice,
            })
          : null;
      if (amountBreakdown) quantity = amountBreakdown.weight;
      const requestedWeight = quantity;
      const weightIsExact = weighted
        ? saleMode === "weight" || Boolean(amountBreakdown?.exact)
        : true;
      const normalized = {
        ...item,
        id: item.id,
        name: item.name || "",
        price: unitPrice,
        unitPrice,
        unit_price: unitPrice,
        quantity,
        saleMode,
        sale_mode: saleMode,
        unit: weighted ? config.weightUnit : item.unit || "unidad",
        requestedAmount,
        requested_amount: requestedAmount,
        requestedWeight,
        requested_weight: requestedWeight,
        estimatedWeight: requestedWeight,
        estimated_weight: requestedWeight,
        weightIsExact,
        weight_is_exact: weightIsExact,
        lineTotal,
        line_total: lineTotal,
        imageSourceUrl: item.imageSourceUrl || item.image_source_url || "",
        image_source_url: item.image_source_url || item.imageSourceUrl || "",
      };
      const key = cartItemKey(normalized);
      return { ...normalized, cartKey: key, cart_key: key };
    });

const cartSignature = (items) =>
  JSON.stringify(
    normalizeCartItems(items)
      .map((item) => ({
        key: cartItemKey(item),
        id: item.id,
        quantity: cartItemInventoryQuantity(item),
        price: Number(item.price || 0),
        lineTotal: cartItemLineTotal(item),
        saleMode: item.saleMode || item.sale_mode || "unit",
        requestedAmount: Number(item.requestedAmount || item.requested_amount || 0),
        requestedWeight: Number(item.requestedWeight || item.requested_weight || 0),
        name: item.name || "",
      }))
      .sort((a, b) => String(a.key).localeCompare(String(b.key))),
  );

const mergeCartItems = (...groups) => {
  const merged = new Map();
  groups.forEach((group) => {
    normalizeCartItems(group).forEach((item) => {
      const key = cartItemKey(item);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, item);
        return;
      }
      merged.set(key, cartItemLineTotal(item) >= cartItemLineTotal(existing) ? item : existing);
    });
  });
  return normalizeCartItems(Array.from(merged.values()));
};

const readLocalCart = (storeId, userId = "guest") => {
  if (typeof window === "undefined" || !storeId) return [];
  try {
    return normalizeCartItems(
      JSON.parse(
        window.localStorage.getItem(cartStorageKey(storeId, userId)) || "[]",
      ),
    );
  } catch (_) {
    return [];
  }
};

const writeLocalCart = (storeId, userId = "guest", items = []) => {
  if (typeof window === "undefined" || !storeId) return;
  window.localStorage.setItem(
    cartStorageKey(storeId, userId),
    JSON.stringify(normalizeCartItems(items)),
  );
};

const copyGuestCartToUserIfNeeded = (storeId, userId) => {
  if (typeof window === "undefined" || !storeId || !userId) return [];
  const userCart = readLocalCart(storeId, userId);
  if (userCart.length > 0) return userCart;
  const guestCart = readLocalCart(storeId, "guest");
  if (guestCart.length > 0) {
    writeLocalCart(storeId, userId, guestCart);
    return guestCart;
  }
  return [];
};

const readPersistedDeliveryScope = (storeId) => {
  if (typeof window === "undefined" || !storeId) return "";
  return window.localStorage.getItem(deliveryScopeStorageKey(storeId)) || "";
};

const persistDeliveryScope = (storeId, value) => {
  if (typeof window === "undefined" || !storeId) return;
  window.localStorage.setItem(
    deliveryScopeStorageKey(storeId),
    normalizeDeliveryScope(value),
  );
};

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

const normalizeOrderModes = (value: any = {}) => {
  const source = normalizeJSONField(value, {});
  const delivery =
    source.delivery ??
    source.allowDelivery ??
    source.allow_delivery;
  const pickup =
    source.pickup ??
    source.allowPickup ??
    source.allow_pickup;
  const normalized = {
    delivery:
      delivery === undefined
        ? DEFAULT_ORDER_MODES.delivery
        : delivery !== false && String(delivery).toLowerCase() !== "false",
    pickup:
      pickup === undefined
        ? DEFAULT_ORDER_MODES.pickup
        : pickup !== false && String(pickup).toLowerCase() !== "false",
  };
  if (!normalized.delivery && !normalized.pickup)
    return { ...DEFAULT_ORDER_MODES };
  return normalized;
};

const normalizePaymentSettings = (value: any = {}) => {
  const settings = normalizeJSONField(value, {});
  const orderModes = normalizeOrderModes(
    settings.orderModes || settings.order_modes,
  );
  return {
    cash: settings.cash !== false,
    bankTransfer: settings.bankTransfer !== false,
    credit: settings.credit !== false,
    card: settings.card !== false,
    transferAccount: settings.transferAccount || "",
    terminalAccount: settings.terminalAccount || "",
    terminalCommission: Number(settings.terminalCommission || 0),
    terminalFixedFee: Number(settings.terminalFixedFee || 0),
    orderModes,
  };
};

const normalizeStore = (store) => {
  if (!store) return null;
  const persistedScope = readPersistedDeliveryScope(store.id);
  const deliveryScope = normalizeDeliveryScope(
    persistedScope || store.deliveryScope || store.delivery_scope,
  );
  const paymentSettings = normalizePaymentSettings(
    store.paymentSettings || store.payment_settings || {},
  );
  const serviceHours = normalizeJSONField(
    store.serviceHours || store.service_hours,
    {},
  );
  const serviceStatus = getStoreServiceStatus(serviceHours, {
    active: store.active !== false,
  });
  return {
    ...store,
    storeStatus: store.store_status || store.storeStatus || "CERRADA",
    paymentSettings,
    payment_settings: paymentSettings,
    orderModes: paymentSettings.orderModes,
    order_modes: paymentSettings.orderModes,
    serviceHours,
    service_hours: serviceHours,
    serviceOpen: serviceStatus.isOpen,
    service_open: serviceStatus.isOpen,
    serviceStatus: serviceStatus.status,
    service_status: serviceStatus.status,
    deliveryScope,
    delivery_scope: deliveryScope,
    whatsapp: store.whatsapp || store.phone || "",
    logoUrl: store.logoUrl || store.logo_url || "",
    logo_url: store.logo_url || store.logoUrl || "",
    whatsappDisplay:
      store.whatsappDisplay ||
      store.whatsapp_display ||
      store.whatsapp ||
      store.phone ||
      "",
    provinceCode: store.provinceCode || store.province_code || "",
    municipalityCode: store.municipalityCode || store.municipality_code || "",
    districtCode: store.districtCode || store.district_code || "",
    neighborhoodId: store.neighborhoodId || store.neighborhood_id || "",
    neighborhood: store.neighborhood || store.sector || "",
    street: store.street || "",
    street_number: store.street_number || "",
    latitude: store.latitude ?? store.lat ?? "",
    lat: store.lat ?? store.latitude ?? "",
    longitude: store.longitude ?? store.lng ?? store.lon ?? "",
    lng: store.lng ?? store.longitude ?? store.lon ?? "",
    locationAccuracy: store.locationAccuracy ?? store.location_accuracy ?? null,
    location_accuracy: store.location_accuracy ?? store.locationAccuracy ?? null,
    locationSource: store.locationSource || store.location_source || "",
    location_source: store.location_source || store.locationSource || "",
    locationUpdatedAt: store.locationUpdatedAt || store.location_updated_at || null,
    location_updated_at: store.location_updated_at || store.locationUpdatedAt || null,
    locationConfigured: Boolean(store.locationConfigured || store.location_configured || ((store.latitude ?? store.lat) !== null && (store.latitude ?? store.lat) !== "" && (store.longitude ?? store.lng ?? store.lon) !== null && (store.longitude ?? store.lng ?? store.lon) !== "")),
  };
};

const normalizeProduct = (product) => {
  if (!product) return product;
  const formatIsLibra = String(product.format || "").trim().toLowerCase() === "libra";
  const weightedSaleEnabled = product.weightedSaleEnabled ?? product.weighted_sale_enabled ?? formatIsLibra;
  const rawStock = Number(product.stock || 0);
  const normalizedPrice = Number(product.price || 0);
  const normalizedMinimumAmount = minimumAmountForProduct({
    ...product,
    price: normalizedPrice,
  });
  const normalizedStock = formatIsLibra
    ? Math.round((rawStock + Number.EPSILON) * 100) / 100
    : rawStock;
  return {
    ...product,
    store_id: product.store_id,
    storeId: product.store_id || product.storeId,
    globalId: product.globalId || product.global_id || "",
    barcode: String(product.barcode || "").trim(),
    categoryIcon: product.categoryIcon || product.category_icon || "📦",
    price: normalizedPrice,
    cost: Number(product.cost || 0),
    stock: normalizedStock,
    weightedSaleEnabled,
    weighted_sale_enabled: weightedSaleEnabled,
    allowWeightSales: product.allowWeightSales ?? product.allow_weight_sales ?? true,
    allow_weight_sales: product.allow_weight_sales ?? product.allowWeightSales ?? true,
    allowAmountSales: product.allowAmountSales ?? product.allow_amount_sales ?? true,
    allow_amount_sales: product.allow_amount_sales ?? product.allowAmountSales ?? true,
    weightUnit: product.weightUnit || product.weight_unit || "lb",
    weight_unit: product.weight_unit || product.weightUnit || "lb",
    minimumWeight: Number(product.minimumWeight ?? product.minimum_weight ?? 0.25),
    minimum_weight: Number(product.minimum_weight ?? product.minimumWeight ?? 0.25),
    weightIncrement: Number(product.weightIncrement ?? product.weight_increment ?? 0.25),
    weight_increment: Number(product.weight_increment ?? product.weightIncrement ?? 0.25),
    minimumAmount: normalizedMinimumAmount,
    minimum_amount: normalizedMinimumAmount,
    weightPrecision: 2,
    weight_precision: 2,
    image_source_url: product.image_source_url || product.imageSourceUrl || "",
    imageSourceUrl: product.imageSourceUrl || product.image_source_url || "",
    group: product.group || product.group_name || product.groupName || "",
    group_name: product.group_name || product.groupName || product.group || "",
    detail: product.detail || product.detail_name || product.detailName || "",
    detail_name: product.detail_name || product.detailName || product.detail || "",
    metadata: normalizeJSONField(product.metadata, {}),
  };
};

const parseDeliveryCostFromAddress = (address = "") => {
  const match = String(address || "").match(
    /Entrega\s*:\s*RD\$?\s*([0-9.,]+)/i,
  );
  if (!match) return 0;
  const parsed = Number(String(match[1]).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseCashChangeFromAddress = (address = "") => {
  const raw = String(address || "");
  const answered =
    /Cambio\s*:/i.test(raw) ||
    /no necesita vuelto/i.test(raw) ||
    /pagará exacto|pagara exacto/i.test(raw);
  const needed = /requiere vuelto/i.test(raw);
  const fromMatch = raw.match(
    /Cambio\s*:\s*requiere vuelto de RD\$?\s*([0-9.,]+)/i,
  );
  const amountMatch = raw.match(/vuelto RD\$?\s*([0-9.,]+)/i);
  const parse = (value) => {
    const parsed = Number(String(value || "").replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    answered,
    needed,
    from: parse(fromMatch?.[1]),
    amount: parse(amountMatch?.[1]),
  };
};

const normalizeOrderModeFromSale = (sale: any = {}) => {
  const explicit =
    sale.orderMode ||
    sale.order_mode ||
    sale.fulfillmentMode ||
    sale.orderModeLabel ||
    sale.order_mode_label;
  const value = String(explicit || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (value === "delivery") return "delivery";
  if (value === "pickup") return "pickup";
  const address = String(
    sale.deliveryAddress || sale.delivery_address || sale.address || "",
  )
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (address.includes("modalidad: recogida") || address.includes("retirar en"))
    return "pickup";
  if (
    address.includes("modalidad: entrega") ||
    address.includes("entrega:") ||
    address.includes("gps:")
  )
    return "delivery";
  return "";
};

const normalizeSale = (sale) => {
  if (!sale) return sale;
  const deliveryAddress =
    sale.deliveryAddress || sale.delivery_address || sale.address || "";
  const orderMode = normalizeOrderModeFromSale({ ...sale, deliveryAddress });
  const deliveryCost = Number(
    sale.deliveryCost ||
      sale.delivery_cost ||
      parseDeliveryCostFromAddress(deliveryAddress) ||
      0,
  );
  const cashChange = parseCashChangeFromAddress(deliveryAddress);
  return {
    ...sale,
    store_id: sale.store_id,
    storeId: sale.store_id || sale.storeId,
    customerId: sale.customerId || sale.customer_id || "",
    deliveryAddress,
    status: sale.status || "delivered",
    orderType: sale.orderType || sale.order_type || "pos",
    orderMode,
    order_mode: orderMode,
    deliveryCost,
    delivery_cost: deliveryCost,
    cashChangeAnswered:
      sale.cashChangeAnswered ??
      sale.cash_change_answered ??
      cashChange.answered,
    cash_change_answered:
      sale.cash_change_answered ??
      sale.cashChangeAnswered ??
      cashChange.answered,
    cashChangeNeeded:
      sale.cashChangeNeeded ?? sale.cash_change_needed ?? cashChange.needed,
    cash_change_needed:
      sale.cash_change_needed ?? sale.cashChangeNeeded ?? cashChange.needed,
    cashChangeFrom: Number(
      sale.cashChangeFrom || sale.cash_change_from || cashChange.from || 0,
    ),
    cash_change_from: Number(
      sale.cash_change_from || sale.cashChangeFrom || cashChange.from || 0,
    ),
    cashChangeAmount: Number(
      sale.cashChangeAmount ||
        sale.cash_change_amount ||
        cashChange.amount ||
        0,
    ),
    cash_change_amount: Number(
      sale.cash_change_amount ||
        sale.cashChangeAmount ||
        cashChange.amount ||
        0,
    ),
    method: sale.method || sale.paymentMethod || sale.payment_method || "",
    date: sale.date,
    total: Number(sale.total || 0),
    financialStatus:
      sale.financialStatus || sale.financial_status || "completed",
    financial_status:
      sale.financial_status || sale.financialStatus || "completed",
    returnedAmount: Number(
      sale.returnedAmount ?? sale.returned_amount ?? 0,
    ),
    returned_amount: Number(
      sale.returned_amount ?? sale.returnedAmount ?? 0,
    ),
    netTotal: Number(
      sale.netTotal ?? sale.net_total ?? sale.total ?? 0,
    ),
    net_total: Number(
      sale.net_total ?? sale.netTotal ?? sale.total ?? 0,
    ),
    items: Array.isArray(sale.items) ? sale.items : [],
  };
};

const normalizeStoreCredit = (storeCredit) =>
  storeCredit
    ? {
        ...storeCredit,
        store_id: storeCredit.store_id,
        storeId: storeCredit.store_id || storeCredit.storeId,
        amount: Number(storeCredit.amount || 0),
        paidAmount: Number(storeCredit.paid_amount ?? storeCredit.paidAmount ?? 0),
        paid_amount: Number(storeCredit.paid_amount ?? storeCredit.paidAmount ?? 0),
        remainingAmount: Number(storeCredit.remaining_amount ?? storeCredit.remainingAmount ?? Math.max(0, Number(storeCredit.amount || 0) - Number(storeCredit.paid_amount ?? storeCredit.paidAmount ?? 0))),
        remaining_amount: Number(storeCredit.remaining_amount ?? storeCredit.remainingAmount ?? Math.max(0, Number(storeCredit.amount || 0) - Number(storeCredit.paid_amount ?? storeCredit.paidAmount ?? 0))),
      }
    : storeCredit;

const normalizeCustomer = (customer) =>
  customer
    ? {
        ...customer,
        storeCredit: customer.storeCredit || customer.store_credit || {},
        profilePictureUrl:
          customer.profilePictureUrl ||
          customer.profile_picture_url ||
          customer.avatar_url ||
          customer.avatarUrl ||
          "",
        profile_picture_url:
          customer.profile_picture_url ||
          customer.profilePictureUrl ||
          customer.avatar_url ||
          customer.avatarUrl ||
          "",
        provinceCode: customer.provinceCode || customer.province_code || "",
        municipalityCode: customer.municipalityCode || customer.municipality_code || "",
        districtCode: customer.districtCode || customer.district_code || "",
        neighborhoodId: customer.neighborhoodId || customer.neighborhood_id || "",
        neighborhood: customer.neighborhood || customer.sector || "",
        sector: customer.sector || customer.neighborhood || "",
        street: customer.street || "",
        street_number: customer.street_number || "",
      }
    : customer;

const normalizeCash = (cash) =>
  cash
    ? {
        ...cash,
        store_id: cash.store_id,
        storeId: cash.store_id || cash.storeId,
      }
    : cash;

const normalizeDeliveryZone = (zone) =>
  zone
    ? {
        ...zone,
        storeId: zone.storeId || zone.store_id,
        store_id: zone.store_id || zone.storeId,
        provinceCode: zone.provinceCode || zone.province_code || "",
        provinceName:
          zone.provinceName || zone.province_name || zone.province || "",
        municipalityCode: zone.municipalityCode || zone.municipality_code || "",
        municipalityName:
          zone.municipalityName ||
          zone.municipality_name ||
          zone.municipality ||
          "",
        districtCode: zone.districtCode || zone.district_code || "",
        neighborhoodId: zone.neighborhoodId || zone.neighborhood_id || "",
        neighborhoodName:
          zone.neighborhoodName ||
          zone.neighborhood_name ||
          zone.neighborhood ||
          zone.sector ||
          "",
        deliveryCost: Number(
          zone.deliveryCost || zone.delivery_cost || zone.cost || 0,
        ),
        delivery_cost: Number(
          zone.delivery_cost || zone.deliveryCost || zone.cost || 0,
        ),
        zoneType: zone.zoneType || zone.zone_type || "territorial",
        zone_type: zone.zone_type || zone.zoneType || "territorial",
        geoGeofenceId: zone.geoGeofenceId || zone.geo_geofence_id || "",
        geo_geofence_id: zone.geo_geofence_id || zone.geoGeofenceId || "",
        geoService: zone.geoService || zone.geo_service || "delivery",
        geo_service: zone.geo_service || zone.geoService || "delivery",
        geoPolygon: zone.geoPolygon || zone.geo_polygon || [],
        geo_polygon: zone.geo_polygon || zone.geoPolygon || [],
        geoSyncStatus: zone.geoSyncStatus || zone.geo_sync_status || "not_applicable",
        geo_sync_status: zone.geo_sync_status || zone.geoSyncStatus || "not_applicable",
        geoSyncError: zone.geoSyncError || zone.geo_sync_error || "",
        geo_sync_error: zone.geo_sync_error || zone.geoSyncError || "",
        active: zone.active !== false,
      }
    : zone;

const normalizePayload = (payload: any = {}) => ({
  stores: (payload.stores || []).map(normalizeStore),
  activeStoreId:
    payload.activeStoreId ||
    payload.active_store_id ||
    payload.stores?.[0]?.id ||
    null,
  products: (payload.products || []).map(normalizeProduct),
  sales: (payload.sales || []).map(normalizeSale),
  storeCredits: (payload.store_credits || payload.storeCredits || []).map(normalizeStoreCredit),
  cashHistory: (payload.cashHistory || payload.cash_history || []).map(
    normalizeCash,
  ),
  customers: (payload.customers || []).map(normalizeCustomer),
  bankAccounts: payload.bankAccounts || payload.bank_accounts || [],
  deliveryZones: (payload.deliveryZones || payload.delivery_zones || []).map(
    normalizeDeliveryZone,
  ),
  tenant: payload.tenant || null,
  multiTenant: Boolean(payload.multiTenant || payload.multi_tenant),
  categories: payload.categories || [],
  brands: payload.brands || [],
});

const toApiProduct = (product, activeStoreId) => ({
  ...product,
  store_id: activeStoreId,
  global_id: product.global_id || product.globalId || "",
  barcode: String(product.barcode || "").trim(),
  category_icon: product.category_icon || product.categoryIcon || "📦",
  group_name: product.group_name || product.groupName || product.group || "",
  detail: product.detail || product.detail_name || product.detailName || "",
  detail_name:
    product.detail_name || product.detailName || product.detail || "",
  weighted_sale_enabled: product.weighted_sale_enabled ?? product.weightedSaleEnabled ?? String(product.format || "").toLowerCase() === "libra",
  allow_weight_sales: product.allow_weight_sales ?? product.allowWeightSales ?? true,
  allow_amount_sales: product.allow_amount_sales ?? product.allowAmountSales ?? true,
  weight_unit: product.weight_unit || product.weightUnit || "lb",
  minimum_weight: Number(product.minimum_weight ?? product.minimumWeight ?? 0.25),
  weight_increment: Number(product.weight_increment ?? product.weightIncrement ?? 0.25),
  minimum_amount: minimumAmountForProduct(product),
  weight_precision: 2,
});

export const useApiStore = () => {
  const auth = useAuth();
  const authUser = auth?.user || null;
  const authReady = auth?.sessionChecked !== false;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stores, setStores] = useState([]);
  const [activeStoreId, setActiveStoreId] = useState(null);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [storeCredits, setStoreCredits] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [deliveryZones, setDeliveryZones] = useState([]);
  const [cashRegisterHistory, setCashRegisterHistory] = useState([]);
  const [cashRegisterState, setCashRegisterState] = useState({
    isOpen: false,
    opening: null,
  });
  const [cart, setCart] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [brands, setBrands] = useState([]);
  const [tenant, setTenant] = useState(null);
  const [multiTenant, setMultiTenant] = useState(false);

  const salesRef = useRef(sales);
  const productsRef = useRef(products);
  const cashRegisterRef = useRef(cashRegisterState);
  const storesRef = useRef(stores);
  const cartRef = useRef(cart);
  const cartSaveTimerRef = useRef<number | null>(null);
  const cartHydrationKeyRef = useRef("");
  const cartRemoteUpdatedAtRef = useRef("");
  const cartSkipNextPersistRef = useRef(false);
  const cartHydratingRef = useRef(false);
  const lastAuthUserIdRef = useRef(authUser?.id || "");

  useEffect(() => {
    salesRef.current = sales;
  }, [sales]);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);
  useEffect(() => {
    cashRegisterRef.current = cashRegisterState;
  }, [cashRegisterState]);
  useEffect(() => {
    storesRef.current = stores;
  }, [stores]);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  const [adminTenantScope, setAdminTenantScope] = useState("");
  const [browserContextReady, setBrowserContextReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncBrowserContext = () => {
      setAdminTenantScope(api.getAdminTenant());
      setBrowserContextReady(true);
    };
    syncBrowserContext();
    window.addEventListener("colmapro:tenant-changed", syncBrowserContext);
    window.addEventListener("hashchange", syncBrowserContext);
    return () => {
      window.removeEventListener("colmapro:tenant-changed", syncBrowserContext);
      window.removeEventListener("hashchange", syncBrowserContext);
    };
  }, []);

  const platformAdminWithTenant =
    browserContextReady &&
    isPlatformRootHost() &&
    isAdminPath() &&
    Boolean(adminTenantScope);
  const tenantBootstrapAllowed =
    browserContextReady &&
    !isSuperAdminPath() &&
    (isTenantStoreHost() || platformAdminWithTenant);
  const skipTenantBootstrap = !tenantBootstrapAllowed;

  const runtimeConfigQuery = useQuery({
    queryKey: ["runtime-config"],
    queryFn: () => loadRuntimeConfig(true),
    staleTime: 60_000,
    refetchInterval: 300_000,
    refetchOnWindowFocus: false,
  });
  const runtimeConfig = runtimeConfigQuery.data || DEFAULT_RUNTIME_CONFIG;

  const bootstrapQuery = useQuery({
    queryKey: [
      "bootstrap",
      skipTenantBootstrap ? "platform" : "tenant",
      adminTenantScope || getTenantScopeSafe(),
    ],
    // `refetch()` bypasses TanStack Query's `enabled` flag. Keep a defensive
    // guard in the query function so no future manual refresh can request the
    // tenant bootstrap from wamercio.com or from /#/superadmin.
    queryFn: () =>
      tenantBootstrapAllowed ? api.get("/bootstrap") : Promise.resolve(null),
    enabled: tenantBootstrapAllowed,
    refetchOnWindowFocus: tenantBootstrapAllowed,
    refetchOnReconnect: tenantBootstrapAllowed,
    refetchInterval: tenantBootstrapAllowed
      ? Math.max(15_000, runtimeConfig.bootstrapRefetchMs)
      : false,
    refetchIntervalInBackground: false,
  });
  const refetchBootstrap = bootstrapQuery.refetch;

  const applyPayload = useCallback((payload) => {
    const data = normalizePayload(payload);
    setStores(data.stores);
    setActiveStoreId(data.activeStoreId);
    setProducts(data.products);
    setSales(data.sales);
    setStoreCredits(data.storeCredits);
    setCashRegisterHistory(data.cashHistory);
    setCustomers(data.customers);
    setAccounts(data.bankAccounts);
    setDeliveryZones(data.deliveryZones);
    setTenant(data.tenant || null);
    setMultiTenant(Boolean(data.multiTenant));

    const dynamicCategories = [
      ...new Set([
        ...DEFAULT_CATEGORIES,
        ...(data.categories || []),
        ...data.products.map((p) => p.category).filter(Boolean),
      ]),
    ]
      .filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b), "es"));
    setCategories(dynamicCategories);

    const dynamicBrands = [
      ...new Set([
        ...(data.brands || []),
        ...data.products.map((p) => p.brand).filter(Boolean),
      ]),
    ]
      .filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b), "es"));
    setBrands(dynamicBrands);
  }, []);

  const loadStoreData = useCallback(
    async (storeId) => {
      if (!storeId) return;
      const payload = await api.get(`/stores/${storeId}/data`);
      applyPayload(payload);
    },
    [applyPayload],
  );

  useEffect(() => {
    // This manual focus/data-change refresh previously called refetch() even
    // while the query was disabled. TanStack Query allows explicit refetches
    // for disabled queries, which caused repeated GET /api/bootstrap requests
    // and 404 responses on the SaaS domain.
    if (typeof window === "undefined" || skipTenantBootstrap) return undefined;

    let refreshTimer: number | null = null;
    const refresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        const id = activeStoreId || storesRef.current[0]?.id;
        if (id) loadStoreData(id);
        else refetchBootstrap();
      }, 150);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("colmapro:data-changed", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      window.removeEventListener("colmapro:data-changed", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [activeStoreId, loadStoreData, refetchBootstrap, skipTenantBootstrap]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      skipTenantBootstrap ||
      !runtimeConfig.enableRealtimeEvents
    )
      return undefined;

    const source = new EventSource(
      api.eventUrl(
        "/events",
        adminTenantScope ? { tenant: adminTenantScope } : {},
      ),
    );
    const refresh = () =>
      window.dispatchEvent(new CustomEvent("colmapro:data-changed"));
    const realtimeEvents = [
      "product_updated",
      "order_created",
      "order_status_changed",
      "store_updated",
      "cart_updated",
      "delivery_assigned",
      "delivery_accepted",
      "delivery_route_optimized",
      "delivery_cancelled",
      "delivery_incident_reported",
      "delivery_incident_resolved",
      "delivery_partial_completed",
      "inventory_disposition_recorded",
      "inventory_replacement_recorded",
      "sale_created",
      "sale_voided",
      "sale_returned",
      "store_credit_updated",
      "cash_session_opened",
      "cash_session_closed",
    ];
    realtimeEvents.forEach((eventName) => {
      source.addEventListener(eventName, refresh);
    });

    return () => {
      realtimeEvents.forEach((eventName) => {
        source.removeEventListener(eventName, refresh);
      });
      source.close();
    };
  }, [
    skipTenantBootstrap,
    adminTenantScope,
    runtimeConfig.enableRealtimeEvents,
  ]);

  useEffect(() => {
    if (skipTenantBootstrap) {
      setLoading(false);
      setError("");
      return;
    }

    if (bootstrapQuery.isPending) {
      setLoading(true);
      return;
    }

    if (bootstrapQuery.isError) {
      setError(
        bootstrapQuery.error?.message || "No se pudo conectar con el servidor",
      );
      setLoading(false);
      return;
    }

    if (bootstrapQuery.data) {
      applyPayload(bootstrapQuery.data);
      setError("");
      setLoading(false);
    }
  }, [
    applyPayload,
    bootstrapQuery.data,
    bootstrapQuery.error,
    bootstrapQuery.isError,
    bootstrapQuery.isPending,
    skipTenantBootstrap,
  ]);

  const activeStore =
    stores.find((c) => c.id === activeStoreId) || stores[0] || null;

  const switchStore = useCallback(
    async (id) => {
      setActiveStoreId(id);
      setCashRegisterState({ isOpen: false, opening: null });
      cartSkipNextPersistRef.current = true;
      setCart([]);
      setProducts([]);
      setSales([]);
      setStoreCredits([]);
      setCashRegisterHistory([]);
      setDeliveryZones([]);
      setBrands([]);
      await loadStoreData(id);
    },
    [loadStoreData],
  );

  const addStore = useCallback(async (data) => {
    if (storesRef.current.length >= 1) return storesRef.current[0];
    const requestedScope = normalizeDeliveryScope(
      data.deliveryScope || data.delivery_scope,
    );
    const created = normalizeStore(
      await api.post("/stores", {
        ...data,
        delivery_scope: requestedScope,
        deliveryScope: requestedScope,
      }),
    );
    if (created?.id) persistDeliveryScope(created.id, requestedScope);
    const normalizedCreated = created
      ? {
          ...created,
          deliveryScope: requestedScope,
          delivery_scope: requestedScope,
        }
      : created;
    setStores((prev) => [...prev, normalizedCreated]);
    setActiveStoreId(normalizedCreated.id);
    return normalizedCreated;
  }, []);

  const updateStore = useCallback(async (id, updates) => {
    const hasScopeUpdate =
      Object.prototype.hasOwnProperty.call(updates, "deliveryScope") ||
      Object.prototype.hasOwnProperty.call(updates, "delivery_scope");
    const requestedScope = hasScopeUpdate
      ? normalizeDeliveryScope(
          Object.prototype.hasOwnProperty.call(updates, "deliveryScope")
            ? updates.deliveryScope
            : updates.delivery_scope,
        )
      : "";
    const payload: any = {
      ...updates,
      store_status: updates.store_status || updates.storeStatus,
      payment_settings: updates.payment_settings || updates.paymentSettings,
      service_hours: updates.service_hours || updates.serviceHours,
    };
    if (hasScopeUpdate) {
      payload.delivery_scope = requestedScope;
      payload.deliveryScope = requestedScope;
      persistDeliveryScope(id, requestedScope);
      setStores((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                deliveryScope: requestedScope,
                delivery_scope: requestedScope,
              }
            : c,
        ),
      );
    }
    const apiUpdated = await api.patch(`/stores/${id}`, payload);
    const updated = normalizeStore(
      hasScopeUpdate
        ? {
            ...apiUpdated,
            deliveryScope: requestedScope,
            delivery_scope: requestedScope,
          }
        : apiUpdated,
    );
    setStores((prev) => prev.map((c) => (c.id === id ? updated : c)));
    return updated;
  }, []);

  const deleteStore = useCallback(
    async (id) => {
      const response = await api.delete(`/stores/${id}`);
      if (response?.deleted) {
        const remaining = storesRef.current.filter((c) => c.id !== id);
        setStores(remaining);
        const nextId = remaining[0]?.id || null;
        setActiveStoreId(nextId);
        if (nextId) await loadStoreData(nextId);
      }
    },
    [loadStoreData],
  );

  const toggleStoreStatus = useCallback(async () => {
    if (!activeStore) return;
    const currentStatus =
      activeStore.storeStatus || activeStore.store_status || "CERRADA";
    const newStatus = currentStatus === "ABIERTA" ? "CERRADA" : "ABIERTA";
    await updateStore(activeStoreId, { store_status: newStatus });
  }, [activeStore, activeStoreId, updateStore]);

  const updatePaymentSettings = useCallback(
    async (settings) => {
      if (!activeStoreId || !activeStore) return;
      const merged = {
        ...(activeStore.payment_settings || activeStore.paymentSettings || {}),
        ...settings,
      };
      await updateStore(activeStoreId, { payment_settings: merged });
    },
    [activeStoreId, activeStore, updateStore],
  );

  const addProduct = useCallback(
    async (product) => {
      if (!activeStoreId) return;
      const created = normalizeProduct(
        await api.post("/products", toApiProduct(product, activeStoreId)),
      );
      setProducts((prev) => [...prev, created]);
      if (created.category)
        setCategories((prev) =>
          [...new Set([...prev, created.category])]
            .filter(Boolean)
            .sort((a, b) => String(a).localeCompare(String(b), "es")),
        );
      if (created.brand)
        setBrands((prev) =>
          [...new Set([...prev, created.brand])]
            .filter(Boolean)
            .sort((a, b) => String(a).localeCompare(String(b), "es")),
        );
      return created;
    },
    [activeStoreId],
  );

  const updateProduct = useCallback(async (id, updates) => {
    const updated = normalizeProduct(
      await api.patch(`/products/${id}`, {
        ...updates,
        global_id: updates.global_id || updates.globalId,
        category_icon: updates.category_icon || updates.categoryIcon,
      }),
    );
    setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
    if (updated.category)
      setCategories((prev) =>
        [...new Set([...prev, updated.category])]
          .filter(Boolean)
          .sort((a, b) => String(a).localeCompare(String(b), "es")),
      );
    if (updated.brand)
      setBrands((prev) =>
        [...new Set([...prev, updated.brand])]
          .filter(Boolean)
          .sort((a, b) => String(a).localeCompare(String(b), "es")),
      );
    return updated;
  }, []);

  const deleteProduct = useCallback(async (id) => {
    await api.delete(`/products/${id}`);
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const adjustStock = useCallback(async (productId, delta, reason = "Ajuste manual") => {
    const updated = normalizeProduct(
      await api.post(`/products/${productId}/stock`, { delta: Number(delta), reason }),
    );
    setProducts((prev) => prev.map((p) => (p.id === productId ? updated : p)));
    return updated;
  }, []);

  const setStock = useCallback(async (productId, newStock, reason = "Conteo físico") => {
    const updated = normalizeProduct(
      await api.post(`/products/${productId}/stock`, {
        stock: Math.max(0, Number(newStock)),
        reason,
      }),
    );
    setProducts((prev) => prev.map((p) => (p.id === productId ? updated : p)));
    return updated;
  }, []);

  const bulkReplenishCategory = useCallback(
    async (categoryName, amount) => {
      const toUpdate = productsRef.current.filter(
        (p) => p.category === categoryName,
      );
      await Promise.all(toUpdate.map((p) => adjustStock(p.id, Number(amount))));
    },
    [adjustStock],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !activeStoreId || !authReady)
      return undefined;

    const userId = authUser?.id || "guest";
    const token = api.getClientToken();
    const hydrationKey = `${activeStoreId}:${userId}:${token ? "auth" : "guest"}`;
    if (cartHydrationKeyRef.current === hydrationKey) return undefined;

    const previousAuthUserId = lastAuthUserIdRef.current;
    lastAuthUserIdRef.current = authUser?.id || "";
    cartHydrationKeyRef.current = hydrationKey;
    let cancelled = false;

    const hydrateCart = async () => {
      cartHydratingRef.current = true;

      try {
        const currentCart = normalizeCartItems(cartRef.current);
        let localCart = [];

        if (authUser?.id) {
          const userCart = readLocalCart(activeStoreId, authUser.id);
          const guestCart = readLocalCart(activeStoreId, "guest");
          localCart = mergeCartItems(userCart, guestCart, currentCart);
          if (localCart.length > 0) {
            writeLocalCart(activeStoreId, authUser.id, localCart);
            writeLocalCart(activeStoreId, "guest", localCart);
          }
        } else {
          if (previousAuthUserId && currentCart.length >= 0) {
            writeLocalCart(activeStoreId, "guest", currentCart);
          }
          localCart = mergeCartItems(
            readLocalCart(activeStoreId, "guest"),
            currentCart,
          );
        }

        cartSkipNextPersistRef.current = true;
        setCart(localCart);

        if (!token || !authUser?.id) return;

        const response = await api.get(
          `/client/cart?store_id=${encodeURIComponent(activeStoreId)}`,
        );
        if (cancelled) return;

        const remoteCart = normalizeCartItems(response?.items || []);
        const localSignature = cartSignature(localCart);
        const remoteSignature = cartSignature(remoteCart);
        const mergedCart =
          localCart.length > 0
            ? mergeCartItems(remoteCart, localCart)
            : remoteCart;
        const mergedSignature = cartSignature(mergedCart);
        cartRemoteUpdatedAtRef.current = response?.updatedAt || "";

        if (mergedSignature !== localSignature) {
          cartSkipNextPersistRef.current = true;
          setCart(mergedCart);
        }

        writeLocalCart(activeStoreId, authUser.id, mergedCart);
        writeLocalCart(activeStoreId, "guest", mergedCart);

        if (mergedSignature !== remoteSignature) {
          const saved = await api.patch("/client/cart", {
            store_id: activeStoreId,
            items: mergedCart,
          });
          cartRemoteUpdatedAtRef.current =
            saved?.updatedAt || cartRemoteUpdatedAtRef.current;
        }
      } catch (_) {
      } finally {
        cartHydratingRef.current = false;
      }
    };

    hydrateCart();

    return () => {
      cancelled = true;
      cartHydratingRef.current = false;
    };
  }, [activeStoreId, authReady, authUser?.id]);

  useEffect(() => {
    if (typeof window === "undefined" || !activeStoreId) return undefined;

    const userId = authUser?.id || "guest";
    const normalizedCart = normalizeCartItems(cart);
    writeLocalCart(activeStoreId, userId, normalizedCart);
    if (authUser?.id) {
      writeLocalCart(activeStoreId, "guest", normalizedCart);
    }

    if (cartSkipNextPersistRef.current) {
      cartSkipNextPersistRef.current = false;
      return undefined;
    }

    if (!api.getClientToken() || !authUser?.id) return undefined;

    if (cartSaveTimerRef.current) window.clearTimeout(cartSaveTimerRef.current);
    cartSaveTimerRef.current = window.setTimeout(async () => {
      try {
        const saved = await api.patch("/client/cart", {
          store_id: activeStoreId,
          items: normalizedCart,
        });
        cartRemoteUpdatedAtRef.current =
          saved?.updatedAt || cartRemoteUpdatedAtRef.current;
      } catch (_) {
      } finally {
        cartSaveTimerRef.current = null;
      }
    }, 450);

    return () => {
      if (cartSaveTimerRef.current)
        window.clearTimeout(cartSaveTimerRef.current);
      cartSaveTimerRef.current = null;
    };
  }, [cart, activeStoreId, authUser?.id]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !activeStoreId ||
      !authUser?.id ||
      !api.getClientToken()
    )
      return undefined;

    let cancelled = false;
    const pullRemoteCart = async () => {
      if (cartHydratingRef.current || cartSaveTimerRef.current) return;
      try {
        const response = await api.get(
          `/client/cart?store_id=${encodeURIComponent(activeStoreId)}`,
        );
        if (cancelled) return;
        const remoteUpdatedAt = response?.updatedAt || "";
        if (
          remoteUpdatedAt &&
          remoteUpdatedAt === cartRemoteUpdatedAtRef.current
        )
          return;

        const remoteCart = normalizeCartItems(response?.items || []);
        const remoteSignature = cartSignature(remoteCart);
        const localSignature = cartSignature(cartRef.current);
        cartRemoteUpdatedAtRef.current = remoteUpdatedAt;

        if (remoteSignature !== localSignature) {
          cartSkipNextPersistRef.current = true;
          setCart(remoteCart);
          writeLocalCart(activeStoreId, authUser.id, remoteCart);
          writeLocalCart(activeStoreId, "guest", remoteCart);
        }
      } catch (_) {
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") pullRemoteCart();
    };

    pullRemoteCart();
    const interval = window.setInterval(
      pullRemoteCart,
      Math.max(10_000, runtimeConfig.clientCartPullMs),
    );
    window.addEventListener("focus", pullRemoteCart);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", pullRemoteCart);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [activeStoreId, authUser?.id, runtimeConfig.clientCartPullMs]);

  useEffect(() => {
    if (typeof window === "undefined" || !activeStoreId) return undefined;
    const userId = authUser?.id || "guest";
    const key = cartStorageKey(activeStoreId, userId);
    const handleStorage = (event) => {
      if (event.key !== key) return;
      const nextCart = readLocalCart(activeStoreId, userId);
      if (cartSignature(nextCart) !== cartSignature(cartRef.current)) {
        cartSkipNextPersistRef.current = true;
        setCart(nextCart);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [activeStoreId, authUser?.id]);

  const addToCart = useCallback((product, quantity = 1, options: any = {}) => {
    const weighted = isWeightedProduct(product);
    const prepared = weighted
      ? buildWeightedCartItem(
          product,
          options.saleMode || options.sale_mode || product.saleMode || product.sale_mode || "weight",
          options.value ?? options.requestedAmount ?? options.requested_amount ?? options.requestedWeight ?? options.requested_weight ?? quantity,
        )
      : { ...product, quantity: sanitizeUnitQuantity(quantity) };
    const normalizedProduct = normalizeCartItems([prepared])[0];
    if (!normalizedProduct) return;
    const key = cartItemKey(normalizedProduct);
    setCart((prev) => {
      const current = normalizeCartItems(prev);
      const existing = current.find((item) => cartItemKey(item) === key);
      if (!existing) return normalizeCartItems([...current, normalizedProduct]);
      if (weighted) {
        const mode = normalizeSaleMode(normalizedProduct.saleMode, normalizedProduct);
        const combinedValue = mode === "amount"
          ? Number(existing.requestedAmount || existing.requested_amount || 0) + Number(normalizedProduct.requestedAmount || normalizedProduct.requested_amount || 0)
          : Number(existing.requestedWeight || existing.requested_weight || existing.quantity || 0) + Number(normalizedProduct.requestedWeight || normalizedProduct.requested_weight || normalizedProduct.quantity || 0);
        const combined = buildWeightedCartItem(normalizedProduct, mode, combinedValue);
        return normalizeCartItems(current.map((item) => (cartItemKey(item) === key ? combined : item)));
      }
      return normalizeCartItems(current.map((item) => cartItemKey(item) === key ? { ...item, quantity: sanitizeUnitQuantity(Number(item.quantity || 0) + Number(normalizedProduct.quantity || 1)) } : item));
    });
  }, []);

  const setCartItem = useCallback((productOrKey, nextItem) => {
    const key = typeof productOrKey === "string" ? productOrKey : cartItemKey(productOrKey);
    const normalized = normalizeCartItems([nextItem])[0];
    if (!normalized) return;

    setCart((prev) => {
      const current = normalizeCartItems(prev);
      const originalIndex = current.findIndex((item) => cartItemKey(item) === key);
      const hadOriginal = originalIndex >= 0;
      const remaining = current.filter((item) => cartItemKey(item) !== key);
      const targetKey = cartItemKey(normalized);
      const collisionIndex = remaining.findIndex(
        (item) => cartItemKey(item) === targetKey,
      );

      if (collisionIndex >= 0) {
        // Al cambiar una línea entre Libra y Monto puede existir otra línea del
        // mismo producto con la modalidad de destino. Se combinan para que el
        // carrito nunca conserve claves duplicadas.
        if (hadOriginal && targetKey !== key) {
          const existing = remaining[collisionIndex];
          if (isWeightedProduct(normalized)) {
            const mode = normalizeSaleMode(
              normalized.saleMode || normalized.sale_mode,
              normalized,
            );
            const combinedValue =
              mode === "amount"
                ? Number(existing.requestedAmount || existing.requested_amount || 0) +
                  Number(normalized.requestedAmount || normalized.requested_amount || 0)
                : Number(
                    existing.requestedWeight ||
                      existing.requested_weight ||
                      existing.quantity ||
                      0,
                  ) +
                  Number(
                    normalized.requestedWeight ||
                      normalized.requested_weight ||
                      normalized.quantity ||
                      0,
                  );
            remaining[collisionIndex] = buildWeightedCartItem(
              normalized,
              mode,
              combinedValue,
            );
          } else {
            remaining[collisionIndex] = {
              ...normalized,
              quantity: sanitizeUnitQuantity(
                Number(existing.quantity || 0) + Number(normalized.quantity || 1),
              ),
            };
          }
        } else {
          remaining[collisionIndex] = normalized;
        }
        return normalizeCartItems(remaining);
      }

      const insertionIndex = hadOriginal
        ? Math.min(originalIndex, remaining.length)
        : remaining.length;
      const next = [...remaining];
      next.splice(insertionIndex, 0, normalized);
      return normalizeCartItems(next);
    });
  }, []);

  const removeFromCart = useCallback((productOrKey) => {
    const key = String(productOrKey || "");
    setCart((prev) => normalizeCartItems(prev.filter((item) => cartItemKey(item) !== key && String(item.id) !== key)));
  }, []);

  const updateQuantity = useCallback((productOrKey, delta) => {
    const key = String(productOrKey || "");
    setCart((prev) => normalizeCartItems(prev.map((item) => {
      if (cartItemKey(item) !== key && String(item.id) !== key) return item;
      if (!isWeightedProduct(item)) return { ...item, quantity: sanitizeUnitQuantity(Number(item.quantity || 1) + Number(delta || 0)) };
      const config = getWeightedProductConfig(item);
      const mode = normalizeSaleMode(item.saleMode || item.sale_mode, item);

      // A line sold by cash amount must be edited from its product card. A
      // one-peso quick adjustment is commercially insignificant and can cause
      // accidental totals, so +/- controls never mutate amount-mode lines.
      if (mode === "amount") return item;

      const current = Number(
        item.requestedWeight ||
          item.requested_weight ||
          item.quantity ||
          config.minimumWeight,
      );
      const quickWeightStep = Math.max(0.5, Number(config.weightIncrement || 0));
      return buildWeightedCartItem(
        item,
        mode,
        Math.max(
          config.minimumWeight,
          current + Number(delta || 0) * quickWeightStep,
        ),
      );
    })));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);
  const getCartTotal = useCallback(
    () => roundPayableAmount(cart.reduce((sum, item) => sum + cartItemLineTotal(item), 0)),
    [cart],
  );

  const processSale = useCallback(
    async (
      paymentMethod = "cash",
      customerName = "",
      options: any = {},
    ) => {
      const currentCart = cart;
      if (currentCart.length === 0 || !activeStoreId) return;
      const total = roundPayableAmount(
        currentCart.reduce((sum, item) => sum + cartItemLineTotal(item), 0),
      );
      const transferAccount = options?.transferAccount || null;
      const transferNote = transferAccount
        ? [
            `Transferencia: ${transferAccount.bank || "Banco"}`,
            transferAccount.number ? `Cuenta ${transferAccount.number}` : "",
            transferAccount.holder ? `Titular ${transferAccount.holder}` : "",
          ]
            .filter(Boolean)
            .join(" · ")
        : "";
      const response = await api.post("/sales", {
        store_id: activeStoreId,
        items: currentCart,
        total,
        method: paymentMethod,
        customer: customerName,
        customer_id: options?.customerId || options?.customer?.id || "",
        delivery_address: options?.deliveryAddress || transferNote || "",
        transfer_account: transferAccount,
        date: nowISO(),
      });

      const newSale = normalizeSale(response.sale);
      if (newSale) setSales((prev) => [newSale, ...prev]);
      if (Array.isArray(response.products))
        setProducts(response.products.map(normalizeProduct));
      if (response.store_credit)
        setStoreCredits((prev) => [normalizeStoreCredit(response.store_credit), ...prev]);
      setCart([]);
      return newSale;
    },
    [cart, activeStoreId],
  );

  const processAssistedOrder = useCallback(
    async (details: any = {}) => {
      const currentCart = cart;
      if (currentCart.length === 0 || !activeStoreId) return null;
      const subtotal = roundPayableAmount(
        currentCart.reduce((sum, item) => sum + cartItemLineTotal(item), 0),
      );
      const deliveryCost = Number(
        details.delivery_cost || details.deliveryCost || 0,
      );
      const response = await api.post("/assisted-orders", {
        ...details,
        store_id: activeStoreId,
        items: currentCart,
        subtotal,
        delivery_cost: deliveryCost,
        total: roundPayableAmount(subtotal + deliveryCost),
        date: nowISO(),
      });

      const newSale = normalizeSale(response?.sale || response?.order);
      if (newSale) setSales((prev) => [newSale, ...prev]);
      if (Array.isArray(response?.products)) {
        setProducts(response.products.map(normalizeProduct));
      }
      if (response?.store_credit) {
        setStoreCredits((prev) => [normalizeStoreCredit(response.store_credit), ...prev]);
      }
      const responseCustomer = response?.customer
        ? normalizeCustomer(response.customer)
        : null;
      if (responseCustomer?.id) {
        setCustomers((prev) => {
          const exists = prev.some((customer) => customer.id === responseCustomer.id);
          return exists
            ? prev.map((customer) =>
                customer.id === responseCustomer.id ? responseCustomer : customer,
              )
            : [...prev, responseCustomer];
        });
      }
      setCart([]);
      return {
        sale: newSale,
        order: response?.order || null,
        customer: responseCustomer,
        customerCreated: Boolean(
          response?.customerCreated || response?.customer_created,
        ),
      };
    },
    [cart, activeStoreId],
  );

  const addStoreCreditCharge = useCallback(
    async (customer, amount, note = "") => {
      if (!activeStoreId) return;
      const data = normalizeStoreCredit(
        await api.post("/store-credits", {
          store_id: activeStoreId,
          customer,
          amount: Number(amount),
          note,
          status: "pending",
          type: "charge",
          date: nowISO(),
        }),
      );
      setStoreCredits((prev) => [data, ...prev]);
      return data;
    },
    [activeStoreId],
  );

  const addStoreCreditPayment = useCallback(
    async (customer, amount, note = "", method = "cash") => {
      if (!activeStoreId) return;
      const data = await api.post("/store-credits/customer-payment", {
        store_id: activeStoreId,
        customer,
        amount: Number(amount),
        note,
        method,
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("colmapro:data-changed"));
      }
      return data;
    },
    [activeStoreId],
  );

  const settleStoreCredit = useCallback(async (id) => {
    const data = normalizeStoreCredit(await api.patch(`/store-credits/${id}/payment`, {}));
    setStoreCredits((prev) => prev.map((f) => (f.id === id ? data : f)));
    return data;
  }, []);

  const mergeDeliveryOrder = useCallback((payload) => {
    const normalized = normalizeSale(payload);
    if (!normalized?.id) return normalized;
    setSales((prev) => {
      const exists = prev.some((sale) => sale.id === normalized.id);
      if (!exists) return [normalized, ...prev];
      return prev.map((sale) =>
        sale.id === normalized.id ? normalizeSale({ ...sale, ...normalized }) : sale,
      );
    });
    return normalized;
  }, []);

  const broadcastOrderChange = useCallback((id, status, type = "order-status") => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("colmapro:data-changed", {
        detail: { type, id, status },
      }),
    );
    try {
      window.localStorage.setItem(
        "colmapro:data-changed:broadcast",
        JSON.stringify({ type, id, status, at: Date.now() }),
      );
    } catch (_) {}
  }, []);

  const updateOrderStatus = useCallback(async (id, status) => {
    const order = await api.patch(`/orders/${id}/status`, { status });
    const normalized = mergeDeliveryOrder(order);
    broadcastOrderChange(id, normalized?.status || status);
    return normalized || order;
  }, [broadcastOrderChange, mergeDeliveryOrder]);

  const assignDeliveryOrder = useCallback(async (id, driverId) => {
    const order = await api.post(`/delivery/orders/${id}/assign`, { driver_id: driverId });
    const normalized = mergeDeliveryOrder(order);
    broadcastOrderChange(id, normalized?.status || "ready_for_delivery", "delivery-assigned");
    return normalized || order;
  }, [broadcastOrderChange, mergeDeliveryOrder]);

  const acceptDeliveryOrder = useCallback(async (id) => {
    const order = await api.post(`/delivery/orders/${id}/accept`, {});
    const normalized = mergeDeliveryOrder(order);
    broadcastOrderChange(id, normalized?.status || "ready_for_delivery", "delivery-accepted");
    return normalized || order;
  }, [broadcastOrderChange, mergeDeliveryOrder]);

  const startDeliveryOrder = useCallback(async (id) => {
    const order = await api.post(`/delivery/orders/${id}/start`, {});
    const normalized = mergeDeliveryOrder(order);
    broadcastOrderChange(id, normalized?.status || "on_the_way", "delivery-started");
    return normalized || order;
  }, [broadcastOrderChange, mergeDeliveryOrder]);

  const completeDeliveryOrder = useCallback(async (id, proof) => {
    const order = await api.post(`/delivery/orders/${id}/complete`, proof || {});
    const normalized = mergeDeliveryOrder(order);
    broadcastOrderChange(id, normalized?.status || "delivered", "delivery-completed");
    return normalized || order;
  }, [broadcastOrderChange, mergeDeliveryOrder]);

  const reportDeliveryIssue = useCallback(async (id, note, issueType = "other") => {
    const order = await api.post(`/delivery/orders/${id}/issue`, { note, issue_type: issueType });
    const normalized = mergeDeliveryOrder(order);
    broadcastOrderChange(id, normalized?.status || "issue", "delivery-issue");
    return normalized || order;
  }, [broadcastOrderChange, mergeDeliveryOrder]);

  const updateDriverLocation = useCallback(async (location) =>
    api.post("/delivery/location", location), []);

  const optimizeDeliveryRoute = useCallback(async (location = {}) => {
    const response = await api.post("/delivery/route/optimize", location);
    if (Array.isArray(response?.orders)) {
      setSales((prev) => {
        const byId = new Map<string, any>(
          response.orders.map((order: any) => [String(order.id), normalizeSale(order)]),
        );
        return prev.map((sale) => {
          const optimizedOrder = byId.get(String(sale.id));
          return optimizedOrder
            ? normalizeSale({ ...sale, ...optimizedOrder })
            : sale;
        });
      });
    }
    return response;
  }, []);


  const updateCustomerCreditConfig = useCallback(
    async (customerRef, config) => {
      const customer = customers.find(
        (c) => c.id === customerRef || c.name === customerRef,
      );
      if (!customer || !activeStoreId) return null;
      const currentCredit = {
        ...(customer.store_credit || customer.storeCredit || {}),
      };
      const isConfigObject =
        config &&
        (Object.prototype.hasOwnProperty.call(config, "type") ||
          Object.prototype.hasOwnProperty.call(config, "limit") ||
          Object.prototype.hasOwnProperty.call(config, "status"));
      const nextCredit = isConfigObject
        ? {
            ...currentCredit,
            [activeStoreId]: {
              enabled: config.status !== "blocked",
              type: config.type || "limited",
              limit: Number(config.limit || 0),
              status: config.status || "active",
            },
          }
        : config || currentCredit;
      const data = normalizeCustomer(
        await api.patch(`/customers/${customer.id}`, {
          store_credit: nextCredit,
        }),
      );
      setCustomers((prev) => prev.map((c) => (c.id === customer.id ? data : c)));
      return data;
    },
    [customers, activeStoreId],
  );

  const addCustomer = useCallback(async (customer) => {
    const data = normalizeCustomer(await api.post("/customers", customer));
    setCustomers((prev) => [...prev, data]);
    return data;
  }, []);

  const deleteCustomer = useCallback(async (id) => {
    await api.delete(`/customers/${id}`);
    setCustomers((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const updateCustomerStoreCredit = useCallback(
    async (customerId, storeCredits) => {
      const data = normalizeCustomer(
        await api.patch(`/customers/${customerId}`, {
          store_credit: storeCredits,
        }),
      );
      setCustomers((prev) => prev.map((c) => (c.id === customerId ? data : c)));
      return data;
    },
    [],
  );

  const addCategory = useCallback(
    async (name) => {
      const cleanName = String(name || "").trim();
      if (!cleanName) return null;
      if (activeStoreId) {
        await api.post("/categories", {
          store_id: activeStoreId,
          name: cleanName,
          icon: "📦",
        });
      }
      setCategories((prev) =>
        [...new Set([...prev, cleanName])]
          .filter(Boolean)
          .sort((a, b) => String(a).localeCompare(String(b), "es")),
      );
      return cleanName;
    },
    [activeStoreId],
  );

  const deleteCategory = useCallback(
    async (name) => {
      const cleanName = String(name || "").trim();
      if (!cleanName) return;
      if (activeStoreId) {
        await api.delete(
          `/categories?store_id=${encodeURIComponent(activeStoreId)}&name=${encodeURIComponent(cleanName)}`,
        );
      }
      setCategories((prev) => prev.filter((c) => c !== cleanName));
    },
    [activeStoreId],
  );

  const addBrand = useCallback(
    async (name) => {
      const cleanName = String(name || "").trim();
      if (!cleanName) return null;
      if (activeStoreId) {
        await api.post("/brands", {
          store_id: activeStoreId,
          name: cleanName,
        });
      }
      setBrands((prev) =>
        [...new Set([...prev, cleanName])]
          .filter(Boolean)
          .sort((a, b) => String(a).localeCompare(String(b), "es")),
      );
      return cleanName;
    },
    [activeStoreId],
  );

  const deleteBrand = useCallback(
    async (name) => {
      const cleanName = String(name || "").trim();
      if (!cleanName) return;
      if (activeStoreId) {
        await api.delete(
          `/brands?store_id=${encodeURIComponent(activeStoreId)}&name=${encodeURIComponent(cleanName)}`,
        );
      }
      setBrands((prev) => prev.filter((b) => b !== cleanName));
    },
    [activeStoreId],
  );

  const addDeliveryZone = useCallback(
    async (zone) => {
      if (!activeStoreId) return null;
      const payload = {
        ...zone,
        store_id: activeStoreId,
        province_code: zone.province_code || zone.provinceCode,
        province_name: zone.province_name || zone.provinceName,
        municipality_code: zone.municipality_code || zone.municipalityCode,
        municipality_name: zone.municipality_name || zone.municipalityName,
        district_code: zone.district_code || zone.districtCode || "",
        neighborhood_id: zone.neighborhood_id || zone.neighborhoodId || "",
        neighborhood_name: zone.neighborhood_name || zone.neighborhoodName,
        delivery_cost: Number(zone.delivery_cost || zone.deliveryCost || 0),
        zone_type: zone.zone_type || zone.zoneType || "territorial",
        geo_geofence_id: zone.geo_geofence_id || zone.geoGeofenceId || "",
        geo_service: zone.geo_service || zone.geoService || "delivery",
        geo_polygon: zone.geo_polygon || zone.geoPolygon || [],
      };
      const data = normalizeDeliveryZone(
        await api.post("/delivery-zones", payload),
      );
      setDeliveryZones((prev) => [data, ...prev]);
      return data;
    },
    [activeStoreId],
  );

  const updateDeliveryZone = useCallback(
    async (id, updates) => {
      const payload: any = {
        ...updates,
        store_id: updates.store_id || updates.storeId || activeStoreId,
        province_code: updates.province_code || updates.provinceCode,
        province_name: updates.province_name || updates.provinceName,
        municipality_code:
          updates.municipality_code || updates.municipalityCode,
        municipality_name:
          updates.municipality_name || updates.municipalityName,
        district_code: updates.district_code || updates.districtCode || "",
        neighborhood_id:
          updates.neighborhood_id || updates.neighborhoodId || "",
        neighborhood_name:
          updates.neighborhood_name || updates.neighborhoodName,
        delivery_cost: Number(
          updates.delivery_cost || updates.deliveryCost || 0,
        ),
        zone_type: updates.zone_type || updates.zoneType || "territorial",
        geo_geofence_id:
          updates.geo_geofence_id || updates.geoGeofenceId || "",
        geo_service: updates.geo_service || updates.geoService || "delivery",
        geo_polygon: updates.geo_polygon || updates.geoPolygon || [],
      };
      const data = normalizeDeliveryZone(
        await api.patch(`/delivery-zones/${id}`, payload),
      );
      setDeliveryZones((prev) => prev.map((z) => (z.id === id ? data : z)));
      return data;
    },
    [activeStoreId],
  );

  const deleteDeliveryZone = useCallback(async (id) => {
    await api.delete(`/delivery-zones/${id}`);
    setDeliveryZones((prev) => prev.filter((z) => z.id !== id));
  }, []);

  const toggleDeliveryZone = useCallback(
    async (id) => {
      const zone = deliveryZones.find((z) => z.id === id);
      if (!zone) return null;
      return updateDeliveryZone(id, { ...zone, active: !zone.active });
    },
    [deliveryZones, updateDeliveryZone],
  );

  const addBankAccount = useCallback(async (account) => {
    const data = await api.post("/bank-accounts", account);
    setAccounts((prev) => [...prev, data]);
    return data;
  }, []);

  const updateBankAccount = useCallback(async (id, updates) => {
    const data = await api.patch(`/bank-accounts/${id}`, updates);
    setAccounts((prev) => prev.map((a) => (a.id === id ? data : a)));
    return data;
  }, []);

  const deleteBankAccount = useCallback(async (id) => {
    await api.delete(`/bank-accounts/${id}`);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const toggleBankAccount = useCallback(
    async (id) => {
      const acc = accounts.find((a) => a.id === id);
      if (!acc) return;
      await updateBankAccount(id, { active: !acc.active });
    },
    [accounts, updateBankAccount],
  );

  const openCashRegister = useCallback(({ amount, cashier: cashier = "Cajero" }) => {
    setCashRegisterState({
      isOpen: true,
      opening: { amount: Number(amount), date: nowISO(), cashier },
    });
  }, []);

  const closeCashRegister = useCallback(
    async ({ amount, cashier: cashier = "Cajero" }) => {
      const today = appDateKey();
      const currentSales = salesRef.current;
      const currentCashRegister = cashRegisterRef.current;
      const shiftSales = currentSales.filter(
        (s) => appDateKey(s.date) === today,
      );
      const totalSales = shiftSales.reduce((a, s) => a + s.total, 0);
      const cashSales = shiftSales
        .filter((s) => s.method === "cash")
        .reduce((a, s) => a + s.total, 0);
      const expectedAmount = (currentCashRegister.opening?.amount || 0) + cashSales;
      const difference = Number(amount) - expectedAmount;

      const shift = {
        store_id: activeStoreId,
        opening: currentCashRegister.opening,
        closing: { amount: Number(amount), date: nowISO(), cashier },
        summary: {
          totalSales,
          salesCount: shiftSales.length,
          cashSales,
          expectedAmount,
          difference,
          surplus: difference > 0 ? difference : 0,
          shortage: difference < 0 ? Math.abs(difference) : 0,
        },
      };

      const saved = normalizeCash(await api.post("/cash-history", shift));
      setCashRegisterHistory((prev) => [saved, ...prev]);
      setCashRegisterState({ isOpen: false, opening: null });
      return saved;
    },
    [activeStoreId],
  );

  const getTodaySales = useCallback(() => {
    const t = appDateKey();
    return sales.filter((s) => appDateKey(s.date) === t);
  }, [sales]);

  const getTodayIncome = useCallback(
    () => getTodaySales().reduce((sum, s) => sum + s.total, 0),
    [getTodaySales],
  );

  const getMonthIncome = useCallback(() => {
    return sales
      .filter((s) => isSameMonthInAppTimezone(s.date))
      .reduce((sum, s) => sum + s.total, 0);
  }, [sales]);

  const getGlobalMetrics = useCallback(() => {
    const today = appDateKey();
    return {
      totalStores: stores.length,
      activeStores: stores.filter((c) => c.active).length,
      totalSalesToday: sales.filter((s) => appDateKey(s.date) === today)
        .length,
      totalIncomeToday: sales
        .filter((s) => appDateKey(s.date) === today)
        .reduce((a, s) => a + s.total, 0),
      totalProducts: products.length,
      storeMetrics: stores.map((col) => {
        const colSalesToday = sales.filter(
          (s) =>
            (s.store_id) === col.id &&
            appDateKey(s.date) === today,
        );
        return {
          id: col.id,
          name: col.name,
          slogan: col.slogan,
          emoji: col.emoji,
          logoUrl: col.logoUrl || col.logo_url || "",
          logo_url: col.logo_url || col.logoUrl || "",
          color: col.color,
          address: col.address,
          whatsapp: col.whatsapp || col.phone || "",
          whatsappDisplay:
            col.whatsappDisplay ||
            col.whatsapp_display ||
            col.whatsapp ||
            col.phone ||
            "",
          serviceHours: col.serviceHours || col.service_hours || {},
          service_hours: col.service_hours || col.serviceHours || {},
          paymentSettings: normalizePaymentSettings(
            col.paymentSettings || col.payment_settings || {},
          ),
          payment_settings: normalizePaymentSettings(
            col.payment_settings || col.paymentSettings || {},
          ),
          orderModes: normalizePaymentSettings(
            col.paymentSettings || col.payment_settings || {},
          ).orderModes,
          order_modes: normalizePaymentSettings(
            col.paymentSettings || col.payment_settings || {},
          ).orderModes,
          deliveryScope: normalizeDeliveryScope(
            readPersistedDeliveryScope(col.id) ||
              col.deliveryScope ||
              col.delivery_scope,
          ),
          delivery_scope: normalizeDeliveryScope(
            readPersistedDeliveryScope(col.id) ||
              col.delivery_scope ||
              col.deliveryScope,
          ),
          active: col.active,
          salesToday: colSalesToday.length,
          incomeToday: colSalesToday.reduce((a, s) => a + s.total, 0),
          products: products.filter(
            (p) => (p.store_id) === col.id,
          ).length,
          cashRegisterOpen: col.id === activeStoreId ? cashRegisterState.isOpen : false,
        };
      }),
    };
  }, [stores, sales, products, activeStoreId, cashRegisterState]);

  const normalizedActiveStore = activeStore
    ? {
        ...activeStore,
        storeStatus:
          activeStore.storeStatus || activeStore.store_status || "CERRADA",
        paymentSettings: normalizePaymentSettings(
          activeStore.paymentSettings || activeStore.payment_settings || {},
        ),
        payment_settings: normalizePaymentSettings(
          activeStore.payment_settings || activeStore.paymentSettings || {},
        ),
        orderModes: normalizePaymentSettings(
          activeStore.paymentSettings || activeStore.payment_settings || {},
        ).orderModes,
        order_modes: normalizePaymentSettings(
          activeStore.paymentSettings || activeStore.payment_settings || {},
        ).orderModes,
        deliveryScope: normalizeDeliveryScope(
          readPersistedDeliveryScope(activeStore.id) ||
            activeStore.deliveryScope ||
            activeStore.delivery_scope,
        ),
        delivery_scope: normalizeDeliveryScope(
          readPersistedDeliveryScope(activeStore.id) ||
            activeStore.delivery_scope ||
            activeStore.deliveryScope,
        ),
        cashRegisterState: { ...cashRegisterState, history: cashRegisterHistory },
      }
    : null;

  return {
    loading,
    error,
    stores,
    activeStore: normalizedActiveStore,
    activeStoreId,
    tenant,
    multiTenant,
    switchStore,
    addStore,
    updateStore,
    deleteStore,
    toggleStoreStatus,
    updatePaymentSettings,
    getGlobalMetrics,
    products: products,
    addProduct,
    updateProduct,
    deleteProduct,
    adjustStock,
    setStock,
    bulkReplenishCategory,
    cart,
    addToCart,
    setCartItem,
    removeFromCart,
    updateQuantity,
    clearCart,
    getCartTotal,
    sales: sales,
    orders: sales.filter((s) => (s.orderType || s.order_type) === "customer"),
    processSale,
    processAssistedOrder,
    updateOrderStatus,
    assignDeliveryOrder,
    acceptDeliveryOrder,
    startDeliveryOrder,
    completeDeliveryOrder,
    reportDeliveryIssue,
    updateDriverLocation,
    optimizeDeliveryRoute,
    getTodaySales,
    getTodayIncome,
    getMonthIncome,
    storeCredits,
    addStoreCreditCharge,
    addStoreCreditPayment,
    settleStoreCredit,
    updateCustomerCreditConfig,
    customers: customers,
    globalCustomers: customers,
    addCustomer,
    deleteCustomer,
    updateCustomerStoreCredit,
    categories,
    addCategory,
    deleteCategory,
    brands,
    addBrand,
    deleteBrand,
    deliveryZones,
    addDeliveryZone,
    updateDeliveryZone,
    deleteDeliveryZone,
    toggleDeliveryZone,
    bankAccounts: accounts,
    addBankAccount,
    updateBankAccount,
    deleteBankAccount,
    toggleBankAccount,
    cashRegisterState: { ...cashRegisterState, history: cashRegisterHistory },
    openCashRegister,
    closeCashRegister,
    storeStatus:
      activeStore?.storeStatus || activeStore?.store_status || "CERRADA",
  };
};
