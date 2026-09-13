import React, { useCallback, useEffect, useState, useMemo } from "react";
import { useStore } from "../context/StoreContext";
import { api } from "../lib/api";
import { CustomProductModal, GlobalProductDetailModal } from "./Products";
import { formatDateTime } from "../lib/timezone";
import BarcodeScanner, { isBarcodeQuery } from "../components/BarcodeScanner";
import { filterCatalogProducts } from "../lib/catalogFilters";
import {
  cartItemInventoryQuantity,
  cartItemLineTotal,
  isWeightedProduct,
} from "../lib/weightedProducts";
import {
  isProductAnalyticsSale,
  saleRecognitionRatio,
} from "../lib/saleFinancials";
import * as FiIcons from "react-icons/fi";
import ProcurementPanel from "./inventory/ProcurementPanel";
import ProductBatchesPanel from "./inventory/ProductBatchesPanel";

const {
  FiBox,
  FiAlertTriangle,
  FiSlash,
  FiDollarSign,
  FiSearch,
  FiClipboard,
  FiBarChart2,
  FiZap,
  FiPrinter,
  FiPackage,
  FiX,
  FiCheck,
  FiCamera,
  FiPlus,
  FiMinus,
  FiEdit3,
  FiLoader,
  FiTruck,
  FiCalendar,
} = FiIcons;


const uniqueSortedValues = (values) =>
  [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort(
    (a, b) => String(a).localeCompare(String(b), "es"),
  );

const productGlobalId = (product) =>
  String(product?.globalId || product?.global_id || "").trim();

const ProductNameButton = ({ product, onOpen, loading = false, className = "" }) => (
  <button
    type="button"
    onClick={() => onOpen(product)}
    disabled={loading}
    aria-haspopup="dialog"
    aria-label={`Abrir y editar ${product?.name || "producto"}`}
    title="Abrir y editar producto"
    className={`group inline-flex max-w-full items-center gap-1.5 text-left font-semibold text-gray-800 transition-colors hover:text-[#00a884] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884]/30 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 print:text-gray-800 ${className}`}
  >
    <span className="truncate border-b border-dashed border-transparent group-hover:border-[#00a884]/40">
      {product?.name || "Producto"}
    </span>
    {loading ? (
      <FiLoader className="shrink-0 animate-spin text-[#00a884] print:hidden" aria-hidden="true" />
    ) : (
      <FiEdit3 className="shrink-0 text-[11px] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 print:hidden" aria-hidden="true" />
    )}
  </button>
);

const normalizeStockValue = (product, value) => {
  const number = Math.max(0, Number(value || 0));
  return isWeightedProduct(product)
    ? Math.round((number + Number.EPSILON) * 100) / 100
    : Math.floor(number);
};

const limitStockDraft = (product, value) => {
  const raw = String(value ?? "");
  if (!isWeightedProduct(product) || raw === "") return raw;
  const [whole, fraction] = raw.split(".");
  if (fraction === undefined) return whole;
  return `${whole}.${fraction.slice(0, 2)}`;
};

const formatStockValue = (product) =>
  Number(product?.stock || 0).toLocaleString("es-DO", {
    minimumFractionDigits: isWeightedProduct(product) ? 2 : 0,
    maximumFractionDigits: isWeightedProduct(product) ? 2 : 0,
  });

const stockUnitLabel = (product) => (isWeightedProduct(product) ? "lb" : "uds.");

const StockAdjustModal = ({ product, onClose, onSave }) => {
  const [mode, setMode] = useState("set");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("Conteo físico");

  const preview = () => {
    const amount = Number(value) || 0;
    const current = Number(product.stock || 0);
    if (mode === "set") return normalizeStockValue(product, amount);
    if (mode === "add") return normalizeStockValue(product, current + amount);
    if (mode === "remove") return normalizeStockValue(product, current - amount);
    return normalizeStockValue(product, current);
  };

  const handleSave = async () => {
    if (value === "") return;
    await onSave(product.id, preview(), reason.trim() || "Ajuste manual");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)]">
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <div className="p-5 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black text-[#00a884] uppercase tracking-widest mb-1">
                Ajuste de existencia
              </p>
              <h2 className="text-lg font-black text-gray-900 leading-tight">
                {product.name}
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                Existencia actual: <b>{formatStockValue(product)}</b> {stockUnitLabel(product)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 bg-gray-100 text-gray-500 hover:bg-gray-200 rounded-xl flex items-center justify-center shrink-0"
            >
              <FiX />
            </button>
          </div>

          <div>
            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">
              Tipo de ajuste
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "set", label: "Establecer", icon: "🎯" },
                { key: "add", label: "Agregar", icon: "➕" },
                { key: "remove", label: "Reducir", icon: "➖" },
              ].map((option) => (
                <button
                  key={option.key}
                  onClick={() => {
                    setMode(option.key);
                    setValue("");
                  }}
                  className={`py-3 rounded-xl text-xs font-bold transition-all border ${mode === option.key ? "bg-[#00a884] text-white border-[#00a884] shadow-md shadow-[#00a884]/20" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"}`}
                >
                  <span className="block text-base mb-0.5">{option.icon}</span>
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">
              Cantidad
            </label>
            <input
              autoFocus
              type="number"
              min="0"
              step={isWeightedProduct(product) ? "0.01" : "1"}
              inputMode={isWeightedProduct(product) ? "decimal" : "numeric"}
              value={value}
              onChange={(e) => setValue(limitStockDraft(product, e.target.value))}
              onKeyDown={(event) => {
                const blocked = isWeightedProduct(product)
                  ? ["e", "E", "+", "-"]
                  : [".", ",", "e", "E", "+", "-"];
                if (blocked.includes(event.key)) event.preventDefault();
              }}
              onBlur={() => {
                if (value === "") return;
                const normalized = normalizeStockValue(product, value);
                setValue(isWeightedProduct(product) ? normalized.toFixed(2) : String(normalized));
              }}
              placeholder={isWeightedProduct(product) ? "0.00" : "0"}
              className="w-full p-4 text-center text-2xl font-black bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#00a884]/30 focus:border-[#00a884] outline-none"
            />
          </div>

          <div>
            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">
              Motivo del ajuste
            </label>
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 focus:ring-2 focus:ring-[#00a884]/30 focus:border-[#00a884] outline-none"
            >
              <option value="Conteo físico">Conteo físico</option>
              <option value="Recepción manual de mercancía">Recepción manual de mercancía</option>
              <option value="Producto dañado o perdido">Producto dañado o perdido</option>
              <option value="Corrección de existencia">Corrección de existencia</option>
              <option value="Otro ajuste autorizado">Otro ajuste autorizado</option>
            </select>
          </div>

          {value !== "" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[9px] text-gray-400 font-black uppercase">
                  Actual
                </p>
                <p className="text-xl font-black text-gray-700">
                  {formatStockValue(product)}
                </p>
              </div>
              <div className="bg-[#eafaf1] rounded-xl p-3 text-center">
                <p className="text-[9px] text-[#00a884] font-black uppercase">
                  Nueva
                </p>
                <p className="text-xl font-black text-[#00a884]">
                  {Number(preview()).toLocaleString("es-DO", {
                    minimumFractionDigits: isWeightedProduct(product) ? 2 : 0,
                    maximumFractionDigits: isWeightedProduct(product) ? 2 : 0,
                  })}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 safe-bottom">
            <button
              onClick={handleSave}
              disabled={value === ""}
              className="flex-1 py-3.5 bg-[#00a884] text-white rounded-xl font-bold text-sm shadow-md shadow-[#00a884]/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <FiCheck /> Confirmar ajuste
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3.5 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-200"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Inventory = () => {
  const {
    products,
    sales,
    activeStore,
    adjustStock,
    setStock,
    categories,
    brands,
    addProduct,
    updateProduct,
    deleteProduct,
  } = useStore();

  const [activeTab, setActiveTab] = useState("productos");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showReport, setShowReport] = useState(false);
  const [stockAdjustProduct, setStockAdjustProduct] = useState(null);
  const [productEditor, setProductEditor] = useState(null);
  const [openingProductId, setOpeningProductId] = useState("");
  const [openingSuggestionId, setOpeningSuggestionId] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");
  const [movements, setMovements] = useState<any[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementError, setMovementError] = useState("");

  const productCategories = useMemo(
    () => uniqueSortedValues([...(categories || []), ...products.map((product) => product.category)]),
    [categories, products],
  );
  const productBrands = useMemo(
    () => uniqueSortedValues([...(brands || []), ...products.map((product) => product.brand)]),
    [brands, products],
  );
  const currentTenantKey = String(
    api.getAdminTenant?.() ||
      activeStore?.tenant_id ||
      activeStore?.tenantId ||
      activeStore?.slug ||
      "current",
  ).trim();

  const activeStoreId = String(activeStore?.id || "").trim();

  const loadMovements = useCallback(async () => {
    if (!activeStoreId) {
      setMovements([]);
      return;
    }
    setMovementsLoading(true);
    setMovementError("");
    try {
      const payload = await api.get(
        `/inventory/movements?store_id=${encodeURIComponent(activeStoreId)}&limit=100`,
      );
      setMovements(Array.isArray(payload?.items) ? payload.items : []);
    } catch (error: any) {
      setMovementError(error?.message || "No se pudieron cargar los movimientos de inventario");
    } finally {
      setMovementsLoading(false);
    }
  }, [activeStoreId]);

  const resolveInventoryProduct = useCallback(
    (candidate) =>
      products.find((product) => String(product.id) === String(candidate?.id)) || null,
    [products],
  );

  const openProductEditor = useCallback(
    async (candidate) => {
      const localProduct = resolveInventoryProduct(candidate);
      if (!localProduct?.id) return;

      const productId = String(localProduct.id);
      setOpeningProductId(productId);
      const globalId = productGlobalId(localProduct);

      if (!globalId) {
        setProductEditor({ kind: "custom", localProduct });
        setOpeningProductId("");
        return;
      }

      try {
        const payload = await api.get(
          `/catalog/global?view=products&active=true&limit=1&id=${encodeURIComponent(globalId)}`,
        );
        const globalProduct = Array.isArray(payload?.products) ? payload.products[0] : null;
        if (globalProduct) {
          setProductEditor({ kind: "global", globalProduct, localProduct });
        } else {
          setProductEditor({ kind: "custom", localProduct });
        }
      } catch (_) {
        setProductEditor({ kind: "custom", localProduct });
      } finally {
        setOpeningProductId("");
      }
    },
    [resolveInventoryProduct],
  );

  const closeProductEditor = useCallback(() => setProductEditor(null), []);

  const deleteInventoryProduct = useCallback(
    async (id) => {
      await deleteProduct(id);
      setProductEditor(null);
    },
    [deleteProduct],
  );

  const loadSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    setSuggestionError("");
    try {
      const payload = await api.get("/inventory/suggestions?status=all");
      setSuggestions(Array.isArray(payload?.suggestions) ? payload.suggestions : []);
    } catch (err: any) {
      setSuggestionError(err?.message || "No se pudieron cargar las sugerencias");
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  useEffect(() => {
    if (activeTab === "sugeridos") loadSuggestions();
    if (activeTab === "movements" || showReport) loadMovements();
  }, [activeTab, loadMovements, loadSuggestions, showReport]);

  const actOnSuggestion = useCallback(async (id: string, action: "accept" | "dismiss" | "pending") => {
    setSuggestionError("");
    try {
      await api.patch(`/inventory/suggestions/${encodeURIComponent(id)}`, { action });
      await loadSuggestions();
      if (action === "accept") window.dispatchEvent(new CustomEvent("wamercio:data-changed"));
    } catch (err: any) {
      setSuggestionError(err?.message || "No se pudo actualizar la sugerencia");
    }
  }, [loadSuggestions]);

  const openSuggestedGlobalProduct = useCallback(async (item) => {
    const suggestionId = String(item?.id || "").trim();
    const globalId = String(item?.global_product_id || item?.product_snapshot?.id || "").trim();
    if (!suggestionId || !globalId) return;

    setSuggestionError("");
    setOpeningSuggestionId(suggestionId);
    try {
      let globalProduct = item?.product_snapshot && Object.keys(item.product_snapshot).length > 0
        ? item.product_snapshot
        : null;
      if (!globalProduct) {
        const payload = await api.get(
          `/catalog/global?view=products&active=true&limit=1&id=${encodeURIComponent(globalId)}`,
        );
        globalProduct = Array.isArray(payload?.products) ? payload.products[0] : null;
      }
      if (!globalProduct) {
        throw new Error("No se pudo cargar la información del producto solicitado");
      }

      const localProduct = products.find((product) =>
        productGlobalId(product) === globalId ||
        String(product?.barcode || "").trim() === String(item?.barcode || "").trim(),
      ) || null;

      setProductEditor({
        kind: "global",
        globalProduct,
        localProduct,
        suggestionId,
      });
    } catch (err: any) {
      setSuggestionError(err?.message || "No se pudo abrir el producto solicitado");
    } finally {
      setOpeningSuggestionId("");
    }
  }, [products]);

  const saveInventoryProduct = useCallback(
    async (data) => {
      const saved = data?.id ? await updateProduct(data.id, data) : await addProduct(data);
      const suggestionId = String(productEditor?.suggestionId || "").trim();
      if (suggestionId) {
        await api.patch(`/inventory/suggestions/${encodeURIComponent(suggestionId)}`, { action: "accept" });
        await loadSuggestions();
        window.dispatchEvent(new CustomEvent("wamercio:data-changed"));
      }
      return saved;
    },
    [addProduct, loadSuggestions, productEditor?.suggestionId, updateProduct],
  );

  const handleBarcodeDetected = useCallback(async (barcode: string) => {
    setScannerBusy(true);
    try {
      const payload = await api.get(`/catalog/barcode/${encodeURIComponent(barcode)}`);
      setScannerOpen(false);
      if (payload?.local_found && payload?.local_product) {
        setSearch(barcode);
        setActiveTab("productos");
        await openProductEditor(payload.local_product);
        return;
      }
      if (payload?.global_found && payload?.global_product) {
        setSearch(barcode);
        setActiveTab("productos");
        setProductEditor({ kind: "global", globalProduct: payload.global_product, localProduct: null });
        return;
      }
      setProductEditor({ kind: "custom", localProduct: { barcode } });
    } finally {
      setScannerBusy(false);
    }
  }, [openProductEditor]);

  const minStockDefault = 15;
  const activeProducts = products.length;
  const lowStock = products.filter(
    (p) => p.stock > 0 && p.stock < minStockDefault,
  ).length;
  const outOfStock = products.filter((p) => p.stock === 0).length;
  const inventoryValue = products.reduce(
    (acc, p) => acc + p.stock * (p.price || 0),
    0,
  );
  const inventoryCost = products.reduce(
    (acc, p) => acc + p.stock * (p.cost || 0),
    0,
  );
  const estimatedProfit = inventoryValue - inventoryCost;
  const productsNoCost = products.filter((p) => Number(p.cost || 0) <= 0).length;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentSales = sales.filter(
    (sale) =>
      new Date(sale.date) >= thirtyDaysAgo && isProductAnalyticsSale(sale),
  );
  const realProfit30Days = recentSales.reduce((acc, sale) => {
    const recognitionRatio = saleRecognitionRatio(sale);
    return (
      acc +
      (sale.items?.reduce(
        (sum, item) =>
          sum +
          (cartItemLineTotal(item) -
            Number(item.cost || 0) * cartItemInventoryQuantity(item)) *
            recognitionRatio,
        0,
      ) || 0)
    );
  }, 0);

  const soldProducts30d = useMemo(() => {
    const map: Record<string, any> = {};
    recentSales.forEach((sale) => {
      const recognitionRatio = saleRecognitionRatio(sale);
      sale.items?.forEach((item) => {
        if (!map[item.id]) map[item.id] = { ...item, qtySold: 0 };
        map[item.id].qtySold +=
          cartItemInventoryQuantity(item) * recognitionRatio;
      });
    });
    return Object.values(map).sort((a, b) => b.qtySold - a.qtySold);
  }, [recentSales]);

  const deadInventory = products.filter(
    (p) => p.stock > 0 && !soldProducts30d.find((sp) => sp.id === p.id),
  );
  const highRotationRisk = soldProducts30d.filter((sp) => {
    const p = products.find((prod) => prod.id === sp.id);
    return p && p.stock < minStockDefault && sp.qtySold > 10;
  });

  const categoryValorization = useMemo(() => {
    const map: Record<string, any> = {};
    products.forEach((p) => {
      const cat = p.category || "Otros";
      if (!map[cat])
        map[cat] = { category: cat, count: 0, saleValue: 0, costValue: 0 };
      map[cat].count += 1;
      map[cat].saleValue += p.stock * (p.price || 0);
      map[cat].costValue += p.stock * (p.cost || 0);
    });
    return Object.values(map).map((c) => ({
      ...c,
      profit: c.saleValue - c.costValue,
    }));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const searchResults = filterCatalogProducts(products, { search });
    return searchResults.filter((product) =>
      filter === "all"
        ? true
        : filter === "low"
          ? product.stock > 0 && product.stock < minStockDefault
          : filter === "out"
            ? product.stock === 0
            : true,
    );
  }, [products, search, filter, minStockDefault]);

  const tabs = [
    { id: "productos", label: "Existencia", icon: FiBox },
    { id: "movements", label: "Movimientos recientes", icon: FiClipboard },
    { id: "purchases", label: "Compras y reposición", icon: FiTruck },
    { id: "batches", label: "Lotes y vencimientos", icon: FiCalendar },
    { id: "rentabilidad", label: "Rentabilidad", icon: FiBarChart2 },
    { id: "sugeridos", label: "Solicitudes de clientes", icon: FiZap },
  ];

  const currentDate = formatDateTime(null, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).replace(",", "");

  const businessName = activeStore?.name || "Mi Negocio";

  return (
    <div
      className={`h-full overflow-y-auto ${showReport ? "bg-[#f4f7f9] print:bg-white" : "bg-[#f8fafc] print:bg-white"}`}
    >
      {showReport && (
        <div className="p-4 md:p-8 font-sans print:p-0">
          <div className="max-w-[1000px] mx-auto bg-white border border-gray-200 rounded-2xl p-4 md:p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 shadow-sm print:hidden">
            <div>
              <h2 className="text-[17px] font-black text-gray-900">
                Reporte de inventario listo para imprimir
              </h2>
              <p className="text-[13px] text-gray-500 mt-0.5">
                Incluye el inventario completo filtrado, alertas y movimientos
                recientes.
              </p>
            </div>
            <div className="flex gap-3 shrink-0">
              <button
                onClick={() => setShowReport(false)}
                className="px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-[13px] font-bold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Volver al inventario
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2.5 bg-[#4f46e5] rounded-xl text-[13px] font-bold text-white hover:bg-indigo-700 transition-colors shadow-sm"
              >
                Imprimir ahora
              </button>
            </div>
          </div>

          <div className="max-w-[1000px] mx-auto bg-white border border-gray-200 rounded-3xl p-8 md:p-12 shadow-sm print:shadow-none print:border-none print:p-0 print:m-0">
            <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-6">
              <div>
                <span className="px-3 py-1 bg-[#eef2ff] text-[#4f46e5] text-[10px] font-black rounded-full uppercase tracking-widest mb-4 inline-block">
                  REPORTE DE INVENTARIO
                </span>
                <h1 className="text-3xl md:text-4xl font-black text-[#0f172a] mb-2 tracking-tight">
                  {businessName}
                </h1>
                <p className="text-[13px] text-gray-500 mb-4">
                  Resumen general del inventario activo, alertas de reposición y
                  movimientos recientes.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="text-[11px] border border-gray-100 px-3 py-1.5 rounded-lg text-gray-500 font-medium bg-white">
                    Sucursal: {activeStore?.name || "Todas"}
                  </span>
                  <span className="text-[11px] border border-gray-100 px-3 py-1.5 rounded-lg text-gray-500 font-medium bg-white">
                    Filtro:{" "}
                    {filter === "all"
                      ? "Toda la existencia"
                      : filter === "low"
                        ? "Existencia baja"
                        : "Sin existencia"}
                  </span>
                  {search && (
                    <span className="text-[11px] border border-gray-100 px-3 py-1.5 rounded-lg text-gray-500 font-medium bg-white">
                      Búsqueda: {search}
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-[#f8fafc] border border-gray-100 rounded-2xl p-5 text-[11px] min-w-[240px] shrink-0">
                {activeStore?.name && (
                  <div className="flex justify-between gap-4 mb-3">
                    <span className="text-gray-500">Sucursal</span>
                    <span className="font-black text-gray-800">
                      {activeStore.name}
                    </span>
                  </div>
                )}
                {activeStore?.address && (
                  <div className="flex justify-between gap-4 mb-3">
                    <span className="text-gray-500">Dirección</span>
                    <span className="font-black text-gray-800 text-right max-w-[140px]">
                      {activeStore.address}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-4 mb-3">
                  <span className="text-gray-500">Fecha de generación</span>
                  <span className="font-black text-gray-800">
                    {currentDate}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">Productos en reporte</span>
                  <span className="font-black text-gray-800">
                    {filteredProducts.length}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
              {[
                {
                  label: "Productos activos",
                  value: activeProducts,
                  color: "text-gray-900",
                },
                {
                  label: "Existencia baja",
                  value: lowStock,
                  color: "text-[#d97706]",
                },
                {
                  label: "Sin existencia",
                  value: outOfStock,
                  color: "text-[#dc2626]",
                },
                {
                  label: "Valor en existencia",
                  value: `RD$ ${inventoryValue.toLocaleString()}`,
                  color: "text-[#059669]",
                },
                {
                  label: "Costo en existencia",
                  value: `RD$ ${inventoryCost.toLocaleString()}`,
                  color: "text-[#7c3aed]",
                },
                {
                  label: "Ganancia estimada",
                  value: `RD$ ${estimatedProfit.toLocaleString()}`,
                  color: "text-[#059669]",
                },
                {
                  label: "Ganancia real 30 días",
                  value: `RD$ ${realProfit30Days.toLocaleString()}`,
                  color: "text-[#059669]",
                },
                {
                  label: "Productos sin costo",
                  value: productsNoCost,
                  color: "text-[#d97706]",
                },
              ].map((m) => (
                <div
                  key={m.label}
                  className="border border-gray-100 rounded-2xl p-5 shadow-sm bg-white"
                >
                  <p className="text-[12px] text-gray-500 font-medium mb-3">
                    {m.label}
                  </p>
                  <p className={`text-2xl font-black ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-8">
              <section>
                <h3 className="font-black text-gray-900 text-lg mb-4">
                  Inventario completo
                </h3>
                {filteredProducts.length === 0 ? (
                  <div className="border border-dashed border-gray-200 bg-[#f8fafc]/50 rounded-2xl p-7 text-center">
                    <p className="text-[13px] text-gray-500 font-medium">
                      No hay productos con los filtros seleccionados.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left text-[13px] mb-4">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-3 font-bold text-gray-500">
                          Producto
                        </th>
                        <th className="py-3 font-bold text-gray-500">
                          Categoría
                        </th>
                        <th className="py-3 text-right font-bold text-gray-500">
                          Existencia
                        </th>
                        <th className="py-3 text-right font-bold text-gray-500">
                          Costo
                        </th>
                        <th className="py-3 text-right font-bold text-gray-500">
                          Venta
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredProducts.map((p) => (
                        <tr key={p.id}>
                          <td className="py-3 font-bold text-gray-800">
                            <ProductNameButton
                              product={p}
                              onOpen={openProductEditor}
                              loading={openingProductId === String(p.id)}
                            />
                          </td>
                          <td className="py-3 text-gray-500 font-medium">
                            {p.category}
                          </td>
                          <td className="py-3 text-right font-black text-gray-800">
                            {formatStockValue(p)}
                          </td>
                          <td className="py-3 text-right text-gray-500 font-medium">
                            RD$ {p.cost || 0}
                          </td>
                          <td className="py-3 text-right font-bold text-gray-800">
                            RD$ {p.price || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section>
                <h3 className="font-black text-gray-900 text-lg mb-4">
                  Alertas de reposición
                </h3>
                {lowStock === 0 ? (
                  <div className="border border-dashed border-gray-200 bg-[#f8fafc]/50 rounded-2xl p-7 text-center">
                    <p className="text-[13px] text-gray-500 font-medium">
                      No hay alertas de reposición.
                    </p>
                  </div>
                ) : (
                  <ul className="text-[13px] divide-y divide-gray-100 border-t border-b border-gray-100">
                    {products
                      .filter((p) => p.stock > 0 && p.stock < minStockDefault)
                      .map((p) => (
                        <li key={p.id} className="py-3.5 flex justify-between">
                          <ProductNameButton
                            product={p}
                            onOpen={openProductEditor}
                            loading={openingProductId === String(p.id)}
                            className="min-w-0 flex-1 font-bold"
                          />
                          <span className="font-black text-[#d97706]">
                            Existencia: {formatStockValue(p)} (Mín: {minStockDefault})
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="font-black text-gray-900 text-lg mb-4">Movimientos recientes</h3>
                {movements.length === 0 ? (
                  <div className="border border-dashed border-gray-200 bg-[#f8fafc]/50 rounded-2xl p-7 text-center">
                    <p className="text-[13px] text-gray-500 font-medium">No hay movimientos recientes para incluir.</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-gray-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Cambio</th><th className="px-3 py-2">Motivo</th></tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {movements.slice(0, 10).map((movement) => (
                          <tr key={movement.id}>
                            <td className="px-3 py-2 text-gray-500">{formatDateTime(movement.created_at)}</td>
                            <td className="px-3 py-2 font-bold text-gray-800">{movement.product_name}</td>
                            <td className={`px-3 py-2 text-right font-black ${Number(movement.quantity_delta) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{Number(movement.quantity_delta) >= 0 ? "+" : ""}{Number(movement.quantity_delta).toLocaleString("es-DO", { maximumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2 text-gray-500">{movement.reason || "Sin observación"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>

            <div className="mt-16 pt-6 text-center border-t border-gray-100">
              <p className="text-[11px] text-gray-400 font-medium">
                Reporte generado el {currentDate} · {businessName}
              </p>
            </div>
          </div>
        </div>
      )}

      {!showReport && (
        <div className="p-4 md:p-8 xl:p-10 w-full space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Control de Inventario
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Monitorea existencia, alertas de bajo inventario y ajustes de
                mercancía
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowReport(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-sm shadow-sm"
              >
                <FiPrinter /> Imprimir reporte
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center text-xl shrink-0">
                <FiBox />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500">
                  Productos activos
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {activeProducts}
                </p>
              </div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center text-xl shrink-0">
                <FiAlertTriangle />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500">
                  Existencia baja
                </p>
                <p className="text-2xl font-bold text-amber-600">{lowStock}</p>
              </div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-red-50 text-red-500 flex items-center justify-center text-xl shrink-0">
                <FiSlash />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500">
                  Sin existencia
                </p>
                <p className="text-2xl font-bold text-red-600">{outOfStock}</p>
              </div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center text-xl shrink-0">
                <FiDollarSign />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500">
                  Valor en existencia
                </p>
                <p className="text-2xl font-bold text-emerald-600">
                  RD$ {inventoryValue.toLocaleString()}
                </p>
              </div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 mb-1">
                Costo de existencia
              </p>
              <p className="text-xl font-bold text-purple-600">
                RD$ {inventoryCost.toLocaleString()}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                Basado en precio de compra
              </p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 mb-1">
                Ganancia estimada
              </p>
              <p className="text-xl font-bold text-emerald-600">
                RD$ {estimatedProfit.toLocaleString()}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                Valor venta menos costo
              </p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 mb-1">
                Ganancia real 30 días
              </p>
              <p className="text-xl font-bold text-emerald-600">
                RD$ {realProfit30Days.toLocaleString()}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                Ventas con costo congelado
              </p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 mb-1">
                Productos sin costo
              </p>
              <p className="text-xl font-bold text-amber-600">
                {productsNoCost}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                Completar para margen real
              </p>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
            <div className="flex gap-2 p-1 bg-gray-100 rounded-lg overflow-x-auto w-full lg:w-auto scrollbar-hide">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all whitespace-nowrap ${activeTab === t.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  <t.icon
                    className={activeTab === t.id ? "text-emerald-600" : ""}
                  />
                  {t.label}
                  {t.id === "sugeridos" && suggestions.filter((item) => item.status === "pending").length > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">
                      {suggestions.filter((item) => item.status === "pending").length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {activeTab === "productos" && (
              <div className="flex w-full lg:w-auto gap-2">
                <div className="relative flex-1 lg:w-80">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar producto por nombre, marca o código..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && isBarcodeQuery(search)) {
                        event.preventDefault();
                        void handleBarcodeDetected(search);
                      }
                    }}
                    className="w-full pl-9 pr-20 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="absolute right-10 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 flex items-center justify-center"
                      aria-label="Limpiar búsqueda"
                    >
                      <FiX />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600"
                    title="Escanear código de barras"
                    aria-label="Escanear código de barras"
                  >
                    <FiCamera />
                  </button>
                </div>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">Toda la existencia</option>
                  <option value="low">Existencia baja</option>
                  <option value="out">Sin existencia</option>
                </select>
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden min-h-[400px]">
            {activeTab === "productos" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      <th className="px-4 py-3">Producto</th>
                      <th className="px-4 py-3">Marca</th>
                      <th className="px-4 py-3">Categoría</th>
                      <th className="px-4 py-3 text-right">Existencia</th>
                      <th className="px-4 py-3">Formato</th>
                      <th className="px-4 py-3 text-right">Mín.</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">P. Venta</th>
                      <th className="px-4 py-3 text-right">P. Compra</th>
                      <th className="px-4 py-3 text-right">Margen</th>
                      <th className="px-4 py-3 text-right">Ajuste</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredProducts.length > 0 ? (
                      filteredProducts.map((p) => {
                        const isOut = p.stock === 0;
                        const isLow = p.stock > 0 && p.stock < minStockDefault;
                        const margin =
                          p.price > 0
                            ? (
                                ((p.price - (p.cost || 0)) / p.price) *
                                100
                              ).toFixed(1)
                            : 0;
                        return (
                          <tr
                            key={p.id}
                            className="hover:bg-gray-50 text-sm text-gray-700"
                          >
                            <td className="px-4 py-3 font-semibold">
                              <ProductNameButton
                                product={p}
                                onOpen={openProductEditor}
                                loading={openingProductId === String(p.id)}
                              />
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {p.brand || "-"}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {p.category}
                            </td>
                            <td className="px-4 py-3 text-right font-bold">
                              {formatStockValue(p)}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {p.format || "Unidad"}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500">
                              {minStockDefault}
                            </td>
                            <td className="px-4 py-3">
                              {isOut ? (
                                <span className="px-2 py-1 bg-red-50 text-red-600 text-xs font-bold rounded-md">
                                  Agotado
                                </span>
                              ) : isLow ? (
                                <span className="px-2 py-1 bg-amber-50 text-amber-600 text-xs font-bold rounded-md">
                                  Bajo
                                </span>
                              ) : (
                                <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-md">
                                  Normal
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              RD$ {p.price?.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500">
                              RD$ {p.cost?.toLocaleString() || "0"}
                            </td>
                            <td className="px-4 py-3 text-right font-medium">
                              {margin}%
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() =>
                                    p.stock > 0 && adjustStock(p.id, isWeightedProduct(p) ? -0.25 : -1, "Ajuste rápido desde inventario")
                                  }
                                  disabled={p.stock <= 0}
                                  className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                                  title={isWeightedProduct(p) ? "Reducir 0.25 lb" : "Reducir una unidad"}
                                >
                                  <FiMinus className="text-xs" />
                                </button>
                                <button
                                  onClick={() => adjustStock(p.id, isWeightedProduct(p) ? 0.25 : 1, "Ajuste rápido desde inventario")}
                                  className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"
                                  title={isWeightedProduct(p) ? "Agregar 0.25 lb" : "Agregar una unidad"}
                                >
                                  <FiPlus className="text-xs" />
                                </button>
                                <button
                                  onClick={() => setStockAdjustProduct(p)}
                                  className="px-3 h-8 rounded-lg bg-gray-100 text-gray-600 text-[10px] font-black hover:bg-gray-200"
                                >
                                  Ajustar
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={11} className="px-4 py-16 text-center">
                          <FiPackage className="text-5xl mx-auto text-gray-300 mb-3" />
                          <p className="text-gray-800 font-bold">
                            No se encontraron productos
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Los productos aparecerán aquí con su estado de
                            existencia.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === "movements" && (
              <div className="p-4 md:p-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="font-black text-gray-900">Kardex de inventario</h3>
                    <p className="text-xs text-gray-500 mt-1">Entradas, ventas, devoluciones, anulaciones y ajustes registrados.</p>
                  </div>
                  <button
                    type="button"
                    onClick={loadMovements}
                    disabled={movementsLoading}
                    className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-black text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {movementsLoading ? "Actualizando…" : "Actualizar"}
                  </button>
                </div>
                {movementError && (
                  <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{movementError}</div>
                )}
                {movementsLoading && movements.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500"><FiLoader className="animate-spin" /> Cargando movimientos…</div>
                ) : movements.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-16 text-center">
                    <FiClipboard className="text-5xl text-gray-300 mb-3" />
                    <p className="text-gray-800 font-bold">Sin movimientos de inventario</p>
                    <p className="text-xs text-gray-500 mt-1">Los movimientos aparecerán cuando se registren ventas, devoluciones o ajustes.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-gray-200">
                    <table className="w-full min-w-[860px] text-left text-sm">
                      <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-wider text-gray-500">
                        <tr>
                          <th className="px-4 py-3">Fecha</th>
                          <th className="px-4 py-3">Producto</th>
                          <th className="px-4 py-3">Tipo</th>
                          <th className="px-4 py-3 text-right">Cambio</th>
                          <th className="px-4 py-3 text-right">Anterior</th>
                          <th className="px-4 py-3 text-right">Nueva</th>
                          <th className="px-4 py-3">Motivo</th>
                          <th className="px-4 py-3">Responsable</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {movements.map((movement) => {
                          const delta = Number(movement.quantity_delta || 0);
                          const typeLabels: Record<string, string> = { sale: "Venta", adjustment: "Ajuste", return: "Devolución", void: "Anulación", receipt: "Entrada", correction: "Corrección" };
                          const roleLabels: Record<string, string> = { administrator: "Administrador", cashier: "Cajero", delivery_driver: "Repartidor", system: "Sistema" };
                          return (
                            <tr key={movement.id} className="hover:bg-gray-50/70">
                              <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{formatDateTime(movement.created_at)}</td>
                              <td className="px-4 py-3 font-bold text-gray-800">{movement.product_name}</td>
                              <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-black text-gray-600">{typeLabels[movement.movement_type] || movement.movement_type}</span></td>
                              <td className={`px-4 py-3 text-right font-black ${delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>{delta >= 0 ? "+" : ""}{Number(delta).toLocaleString("es-DO", { maximumFractionDigits: 2 })}</td>
                              <td className="px-4 py-3 text-right text-gray-500">{Number(movement.stock_before || 0).toLocaleString("es-DO", { maximumFractionDigits: 2 })}</td>
                              <td className="px-4 py-3 text-right font-bold text-gray-800">{Number(movement.stock_after || 0).toLocaleString("es-DO", { maximumFractionDigits: 2 })}</td>
                              <td className="px-4 py-3 text-xs text-gray-600">{movement.reason || "Sin observación"}</td>
                              <td className="px-4 py-3 text-xs text-gray-500">{roleLabels[movement.actor_role] || movement.actor_role || "Sistema"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === "rentabilidad" && (
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-gray-200 rounded-xl p-4">
                    <h3 className="font-bold text-gray-900 text-sm mb-1">
                      Alta rotación en riesgo
                    </h3>
                    <p className="text-xs text-gray-500 mb-4">
                      {highRotationRisk.length} producto(s) podrían agotarse
                      pronto
                    </p>
                    {highRotationRisk.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">
                        Sin riesgo inmediato.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {highRotationRisk.slice(0, 3).map((p) => (
                          <li
                            key={p.id}
                            className="text-xs flex justify-between"
                          >
                            <ProductNameButton
                              product={resolveInventoryProduct(p) || p}
                              onOpen={openProductEditor}
                              loading={openingProductId === String(p.id)}
                              className="min-w-0 flex-1 truncate pr-2 text-xs"
                            />
                            <span className="font-bold text-amber-600">
                              Quedan{" "}
                              {formatStockValue(products.find((prod) => prod.id === p.id))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="border border-gray-200 rounded-xl p-4">
                    <h3 className="font-bold text-gray-900 text-sm mb-1">
                      Inventario muerto
                    </h3>
                    <p className="text-xs text-gray-500 mb-4">
                      Sin ventas en 30 días
                    </p>
                    {deadInventory.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">
                        No hay inventario detenido.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {deadInventory.slice(0, 3).map((p) => (
                          <li
                            key={p.id}
                            className="text-xs flex justify-between"
                          >
                            <ProductNameButton
                              product={p}
                              onOpen={openProductEditor}
                              loading={openingProductId === String(p.id)}
                              className="min-w-0 flex-1 truncate pr-2 text-xs"
                            />
                            <span className="text-gray-500">
                              {formatStockValue(p)} {stockUnitLabel(p)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                </div>
                <div className="grid grid-cols-1 gap-6">
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-gray-200 bg-gray-50">
                      <h3 className="font-bold text-gray-900 text-sm">
                        Más vendidos
                      </h3>
                      <p className="text-xs text-gray-500">Últimos 30 días</p>
                    </div>
                    <div className="p-4">
                      {soldProducts30d.length === 0 ? (
                        <p className="text-center py-8 text-gray-400 text-xs">
                          Aún no hay ventas suficientes.
                        </p>
                      ) : (
                        <ul className="space-y-3">
                          {soldProducts30d.slice(0, 5).map((p, i) => (
                            <li
                              key={p.id}
                              className="flex justify-between items-center text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[10px] font-bold">
                                  {i + 1}
                                </span>
                                <ProductNameButton
                                  product={resolveInventoryProduct(p) || p}
                                  onOpen={openProductEditor}
                                  loading={openingProductId === String(p.id)}
                                  className="font-medium text-sm"
                                />
                              </div>
                              <span className="font-bold text-emerald-600">
                                {p.qtySold} uds.
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-gray-200 bg-gray-50">
                    <h3 className="font-bold text-gray-900 text-sm">
                      Valorización por categoría
                    </h3>
                    <p className="text-xs text-gray-500">
                      Venta, costo y utilidad en existencia
                    </p>
                  </div>
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-white border-b border-gray-100 text-xs text-gray-500">
                        <th className="px-4 py-2">Categoría</th>
                        <th className="px-4 py-2 text-center">Productos</th>
                        <th className="px-4 py-2 text-right">Valor venta</th>
                        <th className="px-4 py-2 text-right">Costo</th>
                        <th className="px-4 py-2 text-right">Utilidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryValorization.map((cat) => (
                        <tr
                          key={cat.category}
                          className="border-b border-gray-50 hover:bg-gray-50"
                        >
                          <td className="px-4 py-3 font-semibold text-gray-700">
                            {cat.category}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-500">
                            {cat.count}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            RD$ {cat.saleValue.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-purple-600">
                            RD$ {cat.costValue.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-emerald-600">
                            RD$ {cat.profit.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "purchases" && (
              <ProcurementPanel storeId={activeStoreId} products={products} />
            )}

            {activeTab === "batches" && (
              <ProductBatchesPanel storeId={activeStoreId} products={products} />
            )}

            {activeTab === "sugeridos" && (
              <div className="p-4 md:p-6">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-black text-gray-900">Productos solicitados por clientes</h3>
                    <p className="mt-1 text-xs text-gray-500">Las solicitudes se agrupan por código para evitar duplicaciones. Cuando el producto existe globalmente puedes activarlo en el negocio.</p>
                  </div>
                  <button type="button" onClick={loadSuggestions} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-black text-gray-600 hover:bg-gray-50">Actualizar</button>
                </div>
                {suggestionError && <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{suggestionError}</div>}
                {suggestionsLoading ? (
                  <div className="flex items-center justify-center gap-2 p-16 text-sm font-bold text-gray-500"><FiLoader className="animate-spin" /> Cargando sugerencias...</div>
                ) : suggestions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-16 text-center">
                    <span className="text-4xl mb-3">🎉</span>
                    <p className="text-gray-800 font-bold">¡Todo al día!</p>
                    <p className="text-xs text-gray-500 mt-1">No hay sugerencias de productos pendientes.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {suggestions.map((item) => {
                      const pending = item.status === "pending";
                      const globalAvailable = Boolean(item.global_product_id || item.product_snapshot?.id);
                      return (
                        <article key={item.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Código de barras</p>
                              <p className="mt-1 break-all font-black text-gray-900">{item.barcode}</p>
                              <p className="mt-2 text-sm font-bold text-gray-700">{item.product_name || "Producto todavía no identificado"}</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-[10px] font-black ${pending ? "bg-amber-50 text-amber-700" : item.status === "accepted" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                              {pending ? "Pendiente" : item.status === "accepted" ? "Aceptado" : "Descartado"}
                            </span>
                          </div>
                          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-xl bg-gray-50 p-3"><span className="block text-[9px] font-black uppercase text-gray-400">Peticiones</span><b>{item.requests_count || 1}</b></div>
                            <div className="rounded-xl bg-gray-50 p-3"><span className="block text-[9px] font-black uppercase text-gray-400">Solicitante</span><b className="truncate block">{item.customer_name || "Cliente"}</b></div>
                          </div>
                          {pending && (
                            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                              <button
                                type="button"
                                disabled={!globalAvailable || openingSuggestionId === String(item.id)}
                                onClick={() => void openSuggestedGlobalProduct(item)}
                                className="flex-1 rounded-xl bg-[#00a884] px-4 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2"
                              >
                                {openingSuggestionId === String(item.id) && <FiLoader className="animate-spin" />}
                                {globalAvailable ? (openingSuggestionId === String(item.id) ? "Abriendo producto..." : "Activar en inventario") : "Esperando catálogo global"}
                              </button>
                              <button type="button" onClick={() => actOnSuggestion(item.id, "dismiss")} className="rounded-xl bg-gray-100 px-4 py-2.5 text-xs font-black text-gray-600 hover:bg-gray-200">Descartar</button>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {productEditor?.kind === "global" && (
        <GlobalProductDetailModal
          key={`inventory-global-${productEditor.localProduct?.id || productEditor.globalProduct?.id || "new"}`}
          globalProduct={productEditor.globalProduct}
          localProduct={
            productEditor.localProduct ? (resolveInventoryProduct(productEditor.localProduct) || productEditor.localProduct) : null
          }
          categories={productCategories}
          targetTenantIds={[currentTenantKey || "current"]}
          onCancel={closeProductEditor}
          onSave={saveInventoryProduct}
          onReset={(id, data) => updateProduct(id, data)}
          onDeactivate={deleteInventoryProduct}
          requireActivationValues={Boolean(productEditor.suggestionId)}
        />
      )}

      {productEditor?.kind === "custom" && (
        <CustomProductModal
          key={`inventory-custom-${productEditor.localProduct?.id || productEditor.localProduct?.barcode || "new"}`}
          product={
            productEditor.localProduct?.id ? (resolveInventoryProduct(productEditor.localProduct) || productEditor.localProduct) : productEditor.localProduct
          }
          categories={productCategories}
          brands={productBrands}
          onCancel={closeProductEditor}
          onSave={saveInventoryProduct}
          onDelete={deleteInventoryProduct}
        />
      )}

      {stockAdjustProduct && (
        <StockAdjustModal
          product={stockAdjustProduct}
          onClose={() => setStockAdjustProduct(null)}
          onSave={async (id, newStock, reason) => {
            await setStock(id, newStock, reason);
            await loadMovements();
          }}
        />
      )}
      <BarcodeScanner
        open={scannerOpen}
        busy={scannerBusy}
        onClose={() => setScannerOpen(false)}
        onDetected={handleBarcodeDetected}
      />
    </div>
  );
};

export default Inventory;
