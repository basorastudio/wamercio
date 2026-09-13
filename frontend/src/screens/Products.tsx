import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation, useNavigate } from "@/lib/navigation";
import { api, isPlatformRootHost } from "@/lib/api";
import { catalogImageCandidates, catalogImageUrl } from "@/lib/catalogImages";
import { filterCatalogProducts } from "@/lib/catalogFilters";
import { useStore } from "../context/StoreContext";
import BarcodeScanner, { isBarcodeQuery } from "../components/BarcodeScanner";
import * as FiIcons from "react-icons/fi";

const {
  FiAlertTriangle,
  FiArchive,
  FiCheck,
  FiCamera,
  FiChevronDown,
  FiEdit3,
  FiInfo,
  FiLayers,
  FiList,
  FiPackage,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiSearch,
  FiTag,
  FiTrash2,
  FiX,
} = FiIcons;

const EMPTY_CATALOG = {
  stats: {} as any,
  categories: [],
  groups: [],
  details: [],
  brands: [],
  products: [],
  suggestions: [],
};

const WEIGHTED_SALE_DEFAULTS = {
  allowWeightSales: true,
  allowAmountSales: true,
  weightUnit: "lb",
  minimumWeight: 0.25,
  weightIncrement: 0.25,
  minimumAmount: 1,
  weightPrecision: 2,
};

const weightedMinimumAmount = (price) =>
  Math.max(1, Math.round(Number(price || 0) * WEIGHTED_SALE_DEFAULTS.minimumWeight));

const CATEGORY_ICONS = {
  "carnes y pescados": "🥩",
  congelados: "🧊",
  "cuidado personal": "🧴",
  despensa: "🛒",
  "frutas y vegetales": "🥦",
  "galletas y dulces": "🍪",
  "lacteos y huevos": "🥛",
  "lácteos y huevos": "🥛",
  "limpieza y desechables": "🧹",
  pets: "🐶",
  "panaderia y reposteria": "🍞",
  "panadería y repostería": "🍞",
  picadera: "🥨",
  "quesos y embutidos": "🧀",
  "licores y cervezas": "🍺",
  bebidas: "🥤",
};

const normalizeText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const isLibraFormat = (value) => normalizeText(value) === "libra";

const roundStockToTwoDecimals = (value) =>
  Math.max(0, Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100);

const limitDecimalInput = (value, maxDecimals = 2) => {
  const raw = String(value ?? "");
  if (raw === "") return "";
  const [whole, fraction] = raw.split(".");
  if (fraction === undefined) return whole;
  return `${whole}.${fraction.slice(0, maxDecimals)}`;
};

const stockDraftValue = (value, format) =>
  isLibraFormat(format) ? limitDecimalInput(value, 2) : value;

const stockInputValue = (value, format) =>
  isLibraFormat(format) && value !== "" && value !== null && value !== undefined
    ? roundStockToTwoDecimals(value).toFixed(2)
    : value ?? "";

const normalizedStockValue = (value, format) =>
  isLibraFormat(format)
    ? roundStockToTwoDecimals(value)
    : Math.max(0, Math.floor(Number(value || 0)));

const compactKey = (value) => normalizeText(value).replace(/[^a-z0-9]+/g, "");

const sameName = (a, b) => normalizeText(a) === normalizeText(b);

const uniqueSorted = (values: any[]): string[] =>
  [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))].sort(
    (a, b) => String(a).localeCompare(String(b), "es"),
  );

const safeList = (value: any): any[] => (Array.isArray(value) ? value : []);

const currency = (value, decimals = false) =>
  `RD$ ${Number(value || 0).toLocaleString("es-DO", {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 2,
  })}`;

const formatCatalogNumber = (value) => Number(value || 0).toLocaleString("es-DO");

const catalogValue = (item, ...keys) => {
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
};

const categoryIconFor = (name) => CATEGORY_ICONS[normalizeText(name)] || "📦";

const imageUrl = (item) => catalogImageUrl(item);

const getGlobalId = (product) => String(catalogValue(product, "id", "global_id", "globalId", "source_key") || "").trim();
const getProductName = (product) => String(catalogValue(product, "name") || "Producto sin nombre").trim();
const getCategoryName = (product) => String(catalogValue(product, "category_name", "categoryName", "sourceCategory", "category") || "Sin categoría").trim();
const getCategoryIcon = (product) => String(catalogValue(product, "category_icon", "categoryIcon") || categoryIconFor(getCategoryName(product))).trim();
const getGroupName = (product) => String(catalogValue(product, "group_name", "groupName", "sourceSubCategory", "group") || "").trim();
const getDetailName = (product) => String(catalogValue(product, "detail_name", "detailName", "sourceSubCategory2") || "").trim();
const getBrandName = (product) => String(catalogValue(product, "brand_name", "brandName", "brand") || "").trim();
const getProductFormat = (product) => String(catalogValue(product, "format") || "Unidad").trim() || "Unidad";
const getBarcode = (product) => String(catalogValue(product, "barcode") || "").trim();
const getDescription = (product) => String(catalogValue(product, "description") || "").trim();
const tenantIdOf = (tenant: any = {}) => String(tenant.id || tenant.tenant_id || tenant.tenantId || tenant.slug || '').trim();
const tenantLabel = (tenant: any = {}) => String(tenant.name || tenant.tenant_name || tenant.slug || 'Negocio').trim();

const getProductStatus = (localProduct) => {
  if (!localProduct) return { label: "No agregado", dot: "bg-gray-300", text: "text-gray-400", bg: "bg-gray-100" };
  if (Number(localProduct.stock || 0) <= 0) return { label: "Activo sin existencia", dot: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50" };
  return { label: "Activo en este colmado", dot: "bg-[#00a884]", text: "text-[#008f72]", bg: "bg-[#00a884]/10" };
};

const marginPercent = (price, cost) => {
  const p = Number(price || 0);
  const c = Number(cost || 0);
  if (p <= 0) return "0.0";
  return (((p - c) / p) * 100).toFixed(1);
};

const ModalShell = ({ children, onClose, width = "max-w-5xl" }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-[#020617]/55 backdrop-blur-sm"
      onClick={onClose}
    />
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 24 }}
      transition={{ type: "spring", damping: 26, stiffness: 260 }}
      className={`relative w-full ${width} bg-white rounded-[1.75rem] shadow-2xl overflow-hidden max-h-[calc(100dvh-1.5rem)] flex flex-col`}
    >
      {children}
    </motion.div>
  </div>
);

const CloseButton = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-9 h-9 rounded-2xl bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors flex items-center justify-center shrink-0"
    aria-label="Cerrar"
  >
    <FiX />
  </button>
);

const EmptyState = ({ title, description, actionLabel = "", onAction = null, icon: Icon = FiPackage }) => (
  <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
    <Icon className="text-5xl mx-auto mb-3 opacity-20" />
    <p className="text-sm font-black text-gray-600">{title}</p>
    {description && <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto leading-relaxed">{description}</p>}
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-5 inline-flex items-center gap-2 px-4 py-3 bg-[#00a884] text-white rounded-xl text-xs font-black shadow-md shadow-[#00a884]/20"
      >
        <FiPlus /> {actionLabel}
      </button>
    )}
  </div>
);

const ProductListSkeleton = ({ rows = 8 }) => (
  <div className="border-t border-gray-100 bg-white">
    {Array.from({ length: rows }).map((_, index) => (
      <div key={index} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0 animate-pulse">
        <div className="w-2 h-2 rounded-full bg-gray-200 shrink-0" />
        <div className="w-12 h-12 rounded-xl bg-gray-100 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3 w-44 max-w-[70%] rounded-full bg-gray-100" />
          <div className="h-2 w-full max-w-xl rounded-full bg-gray-100" />
        </div>
        <div className="hidden sm:block w-20 h-8 rounded-xl bg-gray-100" />
        <div className="w-11 h-6 rounded-full bg-gray-100 shrink-0" />
      </div>
    ))}
  </div>
);

const InfoPill = ({ label, value, tone = "gray" }) => {
  const tones = {
    gray: "border-gray-200 bg-white text-gray-800",
    green: "border-[#bce8d1] bg-[#f2fcf7] text-[#008f72]",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    purple: "border-purple-100 bg-purple-50 text-purple-700",
  };
  return (
    <div className={`rounded-2xl border px-3 py-3 ${tones[tone] || tones.gray}`}>
      <p className="text-[9px] font-black uppercase tracking-[0.18em] opacity-60">{label}</p>
      <p className="text-xs font-black mt-1 leading-tight break-words">{value || "—"}</p>
    </div>
  );
};

const Field = ({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
  required = false,
  className = "",
  min = undefined,
  max = undefined,
  step = undefined,
  onBlur = undefined,
}) => (
  <label className={`block ${className}`}>
    <span className="block text-[9px] font-black text-gray-500 uppercase tracking-[0.18em] mb-1.5">{label}</span>
    <input
      type={type}
      required={required}
      min={type === "number" ? (min ?? "0") : undefined}
      max={type === "number" ? max : undefined}
      step={type === "number" ? (step ?? "0.01") : undefined}
      value={value ?? ""}
      onChange={(event) => onChange?.(event.target.value)}
      onBlur={(event) => onBlur?.(event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none transition-all focus:bg-white focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
    />
  </label>
);

const TextAreaField = ({ label, value, onChange, placeholder = "", rows = 4 }) => (
  <label className="block">
    <span className="block text-[9px] font-black text-gray-500 uppercase tracking-[0.18em] mb-1.5">{label}</span>
    <textarea
      rows={rows}
      value={value ?? ""}
      onChange={(event) => onChange?.(event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-800 outline-none transition-all resize-none focus:bg-white focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
    />
  </label>
);

const SelectField = ({ label, value, onChange, children }) => (
  <label className="block">
    <span className="block text-[9px] font-black text-gray-500 uppercase tracking-[0.18em] mb-1.5">{label}</span>
    <select
      value={value ?? ""}
      onChange={(event) => onChange?.(event.target.value)}
      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none transition-all focus:bg-white focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
    >
      {children}
    </select>
  </label>
);

const ProductImage = ({ product, className = "" }) => {
  const candidates = useMemo(() => catalogImageCandidates(product), [product]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const candidateKey = candidates.join("|");

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidateKey]);

  const src = candidates[candidateIndex] || "";
  return (
    <div className={`bg-white flex items-center justify-center overflow-hidden ${className}`}>
      {src ? (
        <img
          key={src}
          src={src}
          alt={getProductName(product)}
          className="w-full h-full object-contain"
          loading="lazy"
          decoding="async"
          onError={() => setCandidateIndex((current) => current + 1)}
        />
      ) : (
        <FiPackage className="text-gray-300 text-4xl" />
      )}
    </div>
  );
};

const SimpleNameModal = ({ type, initialValue = "", onCancel, onSave }) => {
  const isBrand = type === "brand";
  const [value, setValue] = useState(initialValue || "");
  const [saving, setSaving] = useState(false);
  const title = isBrand ? "Agregar marca local" : "Agregar categoría local";
  const eyebrow = isBrand ? "Nueva marca" : "Nueva categoría";
  const placeholder = isBrand ? "Ej. Rica, Induveca, Baldom" : "Ej. Frutas y verduras";

  const submit = async (event) => {
    event.preventDefault();
    const clean = value.trim();
    if (!clean || saving) return;
    setSaving(true);
    try {
      await onSave(clean);
      onCancel();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onCancel} width="max-w-xl">
      <form onSubmit={submit}>
        <div className="p-5 sm:p-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black text-[#00a884] uppercase tracking-[0.25em] mb-1">{eyebrow}</p>
            <h2 className="text-xl font-black text-gray-900">{title}</h2>
            <p className="text-xs text-gray-400 mt-1">Se guardará solo en este negocio y no modificará el catálogo global.</p>
          </div>
          <CloseButton onClick={onCancel} />
        </div>
        <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-4">
          <Field label={`Nombre de la ${isBrand ? "marca" : "categoría"}`} value={value} onChange={setValue} placeholder={placeholder} required />
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 py-4 rounded-2xl bg-gray-100 text-gray-700 font-black">Cancelar</button>
            <button type="submit" disabled={saving || !value.trim()} className="flex-1 py-4 rounded-2xl bg-[#00a884] text-white font-black shadow-lg shadow-[#00a884]/20 disabled:opacity-50">{saving ? "Guardando..." : "Crear"}</button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
};

const WeightedProductSettings = ({ form, update, enabled = true }) => {
  if (!enabled) return null;
  const weightedEnabled = form.weightedSaleEnabled !== false;

  return (
    <div className="rounded-3xl border border-[#bce8d1] bg-[#f2fcf7] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#008f72]">
            Venta por libra o monto
          </p>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-gray-500">
            El cliente podrá escribir directamente las libras o el monto que desea comprar.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`hidden text-xs font-black sm:inline ${weightedEnabled ? "text-[#008f72]" : "text-gray-400"}`}>
            {weightedEnabled ? "Activada" : "Desactivada"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={weightedEnabled}
            aria-label="Activar venta por libra o monto"
            onClick={() => update("weightedSaleEnabled", !weightedEnabled)}
            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${weightedEnabled ? "bg-[#00a884]" : "bg-gray-300"}`}
          >
            <span
              className={`inline-block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${weightedEnabled ? "translate-x-7" : "translate-x-1"}`}
            />
          </button>
        </div>
      </div>
    </div>
  );
};

export const CustomProductModal = ({ product = null, categories, brands, onCancel, onSave, onDelete }) => {
  const editing = Boolean(product?.id);
  const [form, setForm] = useState(() => ({
    name: product?.name || "",
    barcode: product?.barcode || "",
    description: product?.description || "",
    category: product?.category || "",
    brand: product?.brand || "",
    format: product?.format || "Unidad",
    price: product?.price ?? "",
    cost: product?.cost ?? "",
    stock: stockInputValue(product?.stock ?? "", product?.format || "Unidad"),
    image: product?.image || "",
    weightedSaleEnabled: product?.weightedSaleEnabled ?? product?.weighted_sale_enabled ?? String(product?.format || "").toLowerCase() === "libra",
  }));
  const [saving, setSaving] = useState(false);
  const p = Number(form.price || 0);
  const c = Number(form.cost || 0);
  const canSave = form.name.trim() && form.category.trim() && form.price !== "" && form.cost !== "" && form.stock !== "";

  const update = (key, value) => setForm((prev) => {
    const nextFormat = key === "format" ? value : prev.format;
    return {
      ...prev,
      [key]: value,
      ...(key === "format"
        ? {
            stock: stockInputValue(prev.stock, nextFormat),
            ...(isLibraFormat(value) ? { weightedSaleEnabled: true } : {}),
          }
        : {}),
    };
  });

  const submit = async (event) => {
    event.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSave({
        ...(product || {}),
        globalId: product?.globalId || product?.global_id || "",
        global_id: product?.global_id || product?.globalId || "",
        barcode: String(form.barcode || "").trim(),
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category.trim(),
        categoryIcon: product?.categoryIcon || product?.category_icon || categoryIconFor(form.category),
        price: Number(form.price || 0),
        cost: Number(form.cost || 0),
        stock: normalizedStockValue(form.stock, form.format),
        image: form.image.trim(),
        brand: form.brand.trim(),
        format: form.format.trim() || "Unidad",
        group: form.category.trim(),
        detail: product?.detail || product?.detail_name || '',
        detail_name: product?.detail_name || product?.detail || '',
        weightedSaleEnabled: String(form.format).trim().toLowerCase() === "libra" && form.weightedSaleEnabled !== false,
        weighted_sale_enabled: String(form.format).trim().toLowerCase() === "libra" && form.weightedSaleEnabled !== false,
        allowWeightSales: WEIGHTED_SALE_DEFAULTS.allowWeightSales,
        allow_weight_sales: WEIGHTED_SALE_DEFAULTS.allowWeightSales,
        allowAmountSales: WEIGHTED_SALE_DEFAULTS.allowAmountSales,
        allow_amount_sales: WEIGHTED_SALE_DEFAULTS.allowAmountSales,
        weightUnit: WEIGHTED_SALE_DEFAULTS.weightUnit,
        weight_unit: WEIGHTED_SALE_DEFAULTS.weightUnit,
        minimumWeight: WEIGHTED_SALE_DEFAULTS.minimumWeight,
        minimum_weight: WEIGHTED_SALE_DEFAULTS.minimumWeight,
        weightIncrement: WEIGHTED_SALE_DEFAULTS.weightIncrement,
        weight_increment: WEIGHTED_SALE_DEFAULTS.weightIncrement,
        minimumAmount: weightedMinimumAmount(form.price),
        minimum_amount: weightedMinimumAmount(form.price),
        weightPrecision: WEIGHTED_SALE_DEFAULTS.weightPrecision,
        weight_precision: WEIGHTED_SALE_DEFAULTS.weightPrecision,
      }, editing);
      onCancel();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onCancel} width="max-w-4xl">
      <form onSubmit={submit} className="flex flex-col max-h-[calc(100dvh-1.5rem)]">
        <div className="p-5 sm:p-6 border-b border-gray-100 flex items-start justify-between gap-4 shrink-0">
          <div>
            <p className="text-[10px] font-black text-[#00a884] uppercase tracking-[0.25em] mb-1">{editing ? "Producto local" : "Producto propio"}</p>
            <h2 className="text-2xl font-black text-gray-900">{editing ? "Editar producto" : "Agregar producto"}</h2>
            <p className="text-xs text-gray-400 mt-1">Úsalo para productos que no existen todavía en el catálogo global.</p>
          </div>
          <CloseButton onClick={onCancel} />
        </div>
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Nombre del producto" value={form.name} onChange={(v) => update("name", v)} placeholder="Ej. Arroz selecto 5 lb" required />
            <Field label="Código de barras" value={form.barcode} onChange={(v) => update("barcode", v)} placeholder="EAN, UPC o código interno" />
            <SelectField label="Categoría" value={form.category} onChange={(v) => update("category", v)}>
              <option value="">Selecciona categoría</option>
              {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </SelectField>
          </div>
          <TextAreaField label="Descripción" value={form.description} onChange={(v) => update("description", v)} placeholder="Descripción breve para el catálogo del cliente" rows={3} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Precio venta" type="number" value={form.price} onChange={(v) => update("price", v)} placeholder="0.00" />
            <Field label="Costo" type="number" value={form.cost} onChange={(v) => update("cost", v)} placeholder="0.00" />
            <Field
              label={isLibraFormat(form.format) ? "Existencia (lb)" : "Existencia"}
              type="number"
              step={isLibraFormat(form.format) ? "0.01" : "1"}
              value={form.stock}
              onChange={(v) => update("stock", stockDraftValue(v, form.format))}
              onBlur={(v) => update("stock", stockInputValue(v, form.format))}
              placeholder={isLibraFormat(form.format) ? "0.00" : "0"}
            />
            <InfoPill label="Margen" value={`${marginPercent(p, c)}%`} tone={Number(marginPercent(p, c)) >= 20 ? "green" : "amber"} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <SelectField label="Marca" value={form.brand} onChange={(v) => update("brand", v)}>
              <option value="">Sin marca / No aplica</option>
              {brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
            </SelectField>
            <Field label="Formato" value={form.format} onChange={(v) => update("format", v)} placeholder="Unidad, libra, paquete..." />
            <Field label="Imagen URL" value={form.image} onChange={(v) => update("image", v)} placeholder="Opcional" />
          </div>
          <WeightedProductSettings form={form} update={update} enabled={String(form.format).trim().toLowerCase() === "libra"} />
          {p > 0 && Number(marginPercent(p, c)) < 10 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-2xl p-3">
              <FiAlertTriangle className="text-amber-500 text-sm shrink-0 mt-0.5" />
              <p className="text-[11px] font-bold text-amber-700 leading-relaxed">El margen es bajo. Revisa el costo y el precio de venta antes de guardar.</p>
            </div>
          )}
        </div>
        <div className="p-5 sm:p-6 border-t border-gray-100 flex flex-col sm:flex-row gap-3 shrink-0">
          <button type="submit" disabled={!canSave || saving} className="flex-1 py-4 bg-[#00a884] text-white rounded-2xl text-sm font-black shadow-lg shadow-[#00a884]/20 disabled:opacity-50 flex items-center justify-center gap-2"><FiCheck /> {saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear producto"}</button>
          {editing && <button type="button" onClick={() => onDelete(product.id)} className="py-4 px-5 bg-red-50 text-red-500 rounded-2xl text-sm font-black hover:bg-red-100 flex items-center justify-center gap-2"><FiTrash2 /> Eliminar</button>}
          <button type="button" onClick={onCancel} className="py-4 px-5 bg-gray-100 text-gray-600 rounded-2xl text-sm font-black hover:bg-gray-200">Cancelar</button>
        </div>
      </form>
    </ModalShell>
  );
};

export const GlobalProductDetailModal = ({ globalProduct, localProduct, categories, targetTenantIds = [], onCancel, onSave, onReset, onDeactivate, requireActivationValues = false }) => {
  const [editingText, setEditingText] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    name: localProduct?.name || getProductName(globalProduct),
    category: localProduct?.category || getCategoryName(globalProduct),
    description: localProduct?.description || getDescription(globalProduct),
    price: localProduct?.price ?? "",
    cost: localProduct?.cost ?? "",
    stock: stockInputValue(localProduct?.stock ?? "", getProductFormat(globalProduct)),
    weightedSaleEnabled: localProduct?.weightedSaleEnabled ?? localProduct?.weighted_sale_enabled ?? String(getProductFormat(globalProduct)).toLowerCase() === "libra",
  }));
  const selectedTenantIds = useMemo(() => safeList(targetTenantIds).map(String).filter(Boolean), [targetTenantIds]);
  const isActive = Boolean(localProduct?.id);
  const source = String(globalProduct?.metadata?.sourceSiteName || globalProduct?.sourceSiteName || "WAMERCIO");
  const brand = getBrandName(globalProduct) || "Sin marca";
  const group = getGroupName(globalProduct) || "Sin grupo";
  const detail = getDetailName(globalProduct) || "Sin detalle";
  const format = getProductFormat(globalProduct);
  const barcode = getBarcode(globalProduct);
  const margin = marginPercent(form.price, form.cost);
  const activationValuesReady = Number(form.price) > 0 && Number(form.cost) > 0 && Number(form.stock) > 0;
  const canSave = form.name.trim() && form.category.trim() && form.price !== "" && form.cost !== "" && form.stock !== "" && selectedTenantIds.length > 0 && (!requireActivationValues || activationValuesReady);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const globalPayload = () => ({
    id: localProduct?.id,
    globalId: getGlobalId(globalProduct),
    global_id: getGlobalId(globalProduct),
    barcode: getBarcode(globalProduct),
    name: form.name.trim() || getProductName(globalProduct),
    description: form.description.trim() || getDescription(globalProduct),
    category: form.category.trim() || getCategoryName(globalProduct),
    categoryIcon: getCategoryIcon(globalProduct),
    category_icon: getCategoryIcon(globalProduct),
    price: Number(form.price || 0),
    cost: Number(form.cost || 0),
    stock: normalizedStockValue(form.stock, format),
    image: imageUrl(globalProduct),
    brand: getBrandName(globalProduct),
    format,
    group: getGroupName(globalProduct) || getCategoryName(globalProduct),
    detail: getDetailName(globalProduct),
    detail_name: getDetailName(globalProduct),
    targetTenantIds: selectedTenantIds,
    tenant_ids: selectedTenantIds,
    weightedSaleEnabled: normalizeText(format) === "libra" && form.weightedSaleEnabled !== false,
    weighted_sale_enabled: normalizeText(format) === "libra" && form.weightedSaleEnabled !== false,
    allowWeightSales: WEIGHTED_SALE_DEFAULTS.allowWeightSales,
    allow_weight_sales: WEIGHTED_SALE_DEFAULTS.allowWeightSales,
    allowAmountSales: WEIGHTED_SALE_DEFAULTS.allowAmountSales,
    allow_amount_sales: WEIGHTED_SALE_DEFAULTS.allowAmountSales,
    weightUnit: WEIGHTED_SALE_DEFAULTS.weightUnit,
    weight_unit: WEIGHTED_SALE_DEFAULTS.weightUnit,
    minimumWeight: WEIGHTED_SALE_DEFAULTS.minimumWeight,
    minimum_weight: WEIGHTED_SALE_DEFAULTS.minimumWeight,
    weightIncrement: WEIGHTED_SALE_DEFAULTS.weightIncrement,
    weight_increment: WEIGHTED_SALE_DEFAULTS.weightIncrement,
    minimumAmount: weightedMinimumAmount(form.price),
    minimum_amount: weightedMinimumAmount(form.price),
    weightPrecision: WEIGHTED_SALE_DEFAULTS.weightPrecision,
    weight_precision: WEIGHTED_SALE_DEFAULTS.weightPrecision,
  });

  const submit = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSave(globalPayload(), isActive);
      onCancel();
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!localProduct?.id || saving) return;
    setSaving(true);
    try {
      await onReset(localProduct.id, {
        ...globalPayload(),
        name: getProductName(globalProduct),
        description: getDescription(globalProduct),
        category: getCategoryName(globalProduct),
        price: Number(form.price || localProduct.price || 0),
        cost: Number(form.cost || localProduct.cost || 0),
        stock: normalizedStockValue(form.stock || localProduct.stock || 0, format),
      });
      onCancel();
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!localProduct?.id || saving) return;
    setSaving(true);
    try {
      await onDeactivate(localProduct.id);
      onCancel();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onCancel} width="max-w-6xl">
      <div className="flex-1 overflow-y-auto catalog-scrollbar">
        <div className="grid grid-cols-1 lg:grid-cols-[45%_55%] min-h-full">
          <div className="bg-white p-6 sm:p-8 lg:p-10 flex items-center justify-center border-b lg:border-b-0 lg:border-r border-gray-100">
            <ProductImage product={globalProduct} className="w-full h-[260px] sm:h-[360px] lg:h-[520px] rounded-3xl" />
          </div>
          <div className="p-5 sm:p-6 lg:p-8 space-y-5 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="rounded-full bg-[#eafaf1] text-[#008f72] text-[9px] font-black px-3 py-1 uppercase tracking-[0.22em]">Detalle del producto</span>
                  {isActive && <span className="rounded-full bg-[#00a884]/10 text-[#008f72] text-[9px] font-black px-3 py-1">Versión personalizada del colmado</span>}
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-gray-900 leading-tight">{getProductName(globalProduct)}</h2>
                <p className="text-xs sm:text-sm text-gray-500 mt-2 leading-relaxed line-clamp-3">{getDescription(globalProduct) || "Sin descripción comercial registrada."}</p>
              </div>
              <CloseButton onClick={onCancel} />
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-gray-400">Contenido local del colmado</p>
                  <p className="text-xs text-gray-500 mt-1">Edita nombre, categoría y descripción sin alterar el catálogo global.</p>
                </div>
                <button type="button" onClick={() => setEditingText((value) => !value)} className="h-9 px-3 rounded-xl bg-white border border-gray-200 text-[#008f72] text-[10px] font-black flex items-center gap-1.5"><FiEdit3 /> {editingText ? "Cerrar" : "Editar texto"}</button>
              </div>
              {editingText ? (
                <div className="space-y-3">
                  <Field label="Nombre local" value={form.name} onChange={(v) => update("name", v)} />
                  <SelectField label="Categoría local" value={form.category} onChange={(v) => update("category", v)}>
                    <option value={getCategoryName(globalProduct)}>{getCategoryName(globalProduct)}</option>
                    {categories.filter((cat) => !sameName(cat, getCategoryName(globalProduct))).map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </SelectField>
                  <TextAreaField label="Descripción local" value={form.description} onChange={(v) => update("description", v)} rows={4} />
                </div>
              ) : (
                <p className="text-sm font-semibold text-gray-600 line-clamp-2">{form.description || getDescription(globalProduct) || "Usando descripción global."}</p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <InfoPill label="Categoría" value={getCategoryName(globalProduct)} />
              <InfoPill label="Grupo" value={group} />
              <InfoPill label="Detalle" value={detail} />
              <InfoPill label="Marca" value={brand} tone="purple" />
              <InfoPill label="Formato" value={format} />
            </div>


            <div className="rounded-3xl border border-[#bce8d1] bg-gradient-to-br from-[#f2fcf7] to-indigo-50 p-4 sm:p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#008f72]/70">Precio de venta</p>
                  <p className="text-2xl font-black text-[#008f72] mt-1">{currency(form.price || 0, true)}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[10px] font-black ${getProductStatus(localProduct).bg} ${getProductStatus(localProduct).text}`}>{getProductStatus(localProduct).label}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Precio de venta" type="number" value={form.price} onChange={(v) => update("price", v)} placeholder="0.00" />
                <Field label="Precio de compra" type="number" value={form.cost} onChange={(v) => update("cost", v)} placeholder="0.00" />
                <Field
                  label={isLibraFormat(format) ? "Existencia disponible (lb)" : "Existencia disponible"}
                  type="number"
                  step={isLibraFormat(format) ? "0.01" : "1"}
                  value={form.stock}
                  onChange={(v) => update("stock", stockDraftValue(v, format))}
                  onBlur={(v) => update("stock", stockInputValue(v, format))}
                  placeholder={isLibraFormat(format) ? "0.00" : "0"}
                />
              </div>
              {requireActivationValues && !activationValuesReady && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold leading-relaxed text-amber-700">
                  Completa el precio de venta, el precio de compra y una existencia disponible mayor que cero para guardar y activar este producto.
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <InfoPill label="Margen" value={`${margin}%`} tone={Number(margin) >= 20 ? "green" : "amber"} />
                <InfoPill label="Ganancia" value={currency(Number(form.price || 0) - Number(form.cost || 0), true)} tone="green" />
                <InfoPill label="Código" value={barcode || "Interno"} tone="blue" />
                <InfoPill label="Origen" value={source} tone="gray" />
              </div>
              <WeightedProductSettings form={form} update={update} enabled={normalizeText(format) === "libra"} />
              {normalizeText(format) !== "libra" && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold text-amber-700 leading-relaxed">
                  La venta al detalle solo se puede activar en productos cuyo formato de venta sea Libra. Cambia el formato global desde el panel central si este producto debe venderse al detalle.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="shrink-0 p-4 sm:p-5 border-t border-gray-100 bg-white flex flex-col lg:flex-row gap-3 justify-between">
        <div className="flex flex-col sm:flex-row gap-3">
          {isActive && (
            <button type="button" disabled={saving} onClick={reset} className="px-4 py-3 rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 text-xs font-black flex items-center justify-center gap-2 disabled:opacity-60"><FiRefreshCw /> Restaurar versión global</button>
          )}
          {isActive && (
            <button type="button" disabled={saving} onClick={deactivate} className="px-4 py-3 rounded-2xl border border-red-100 bg-red-50 text-red-600 text-xs font-black flex items-center justify-center gap-2 disabled:opacity-60"><FiTrash2 /> Desactivar en este colmado</button>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={onCancel} className="px-5 py-3 rounded-2xl bg-gray-100 text-gray-600 text-xs font-black">Cancelar</button>
          <button type="button" disabled={!canSave || saving} onClick={submit} className="px-6 py-3 rounded-2xl bg-[#00a884] text-white text-xs font-black shadow-lg shadow-[#00a884]/20 disabled:opacity-50 flex items-center justify-center gap-2"><FiSave /> {saving ? "Guardando..." : isActive ? "Guardar" : "Guardar y activar"}</button>
        </div>
      </div>
    </ModalShell>
  );
};

const CatalogInfoModal = ({ type, item, products, onClose }) => {
  const isBrand = type === "brand";
  const title = item?.name || (isBrand ? "Marca" : "Categoría");
  const icon = item?.icon || (isBrand ? "🏷️" : categoryIconFor(title));
  return (
    <ModalShell onClose={onClose} width="max-w-2xl">
      <div className="p-5 sm:p-6 flex items-start justify-between gap-4 border-b border-gray-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-[#00a884]/10 flex items-center justify-center text-2xl shrink-0">{isBrand && item?.logo ? <img src={item.logo} alt="" className="w-full h-full object-contain" /> : icon}</div>
          <div className="min-w-0">
            <p className="text-[10px] font-black text-[#00a884] uppercase tracking-[0.25em]">{isBrand ? "Detalle de marca" : "Detalle de categoría"}</p>
            <h2 className="text-xl font-black text-gray-900 truncate">{title}</h2>
          </div>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
        {item?.description && <p className="text-sm text-gray-500 leading-relaxed">{item.description}</p>}
        <div className="grid grid-cols-2 gap-3">
          <InfoPill label="Productos globales" value={products.length} tone="green" />
          <InfoPill label="Estado" value={item?.active === false ? "Inactiva" : "Activa"} tone={item?.active === false ? "amber" : "green"} />
        </div>
        <div className="rounded-2xl border border-gray-100 overflow-hidden">
          {products.slice(0, 12).map((product) => (
            <div key={getGlobalId(product)} className="flex items-center gap-3 p-3 border-b last:border-b-0 border-gray-100">
              <ProductImage product={product} className="w-10 h-10 rounded-xl border border-gray-100 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-gray-800 truncate">{getProductName(product)}</p>
                <p className="text-[10px] text-gray-400 font-bold truncate">{getGroupName(product) || getCategoryName(product)} · {getBrandName(product) || "Sin marca"}</p>
              </div>
            </div>
          ))}
          {products.length === 0 && <p className="p-4 text-sm text-gray-400 font-bold text-center">No hay productos asociados.</p>}
        </div>
      </div>
    </ModalShell>
  );
};

const CatalogTabs = ({ tabs, section, navigate }) => (
  <div className="grid grid-cols-3 gap-2">
    {tabs.map((tab) => (
      <button
        key={tab.key}
        type="button"
        onClick={() => navigate(tab.to)}
        className={`${tab.bg} rounded-2xl p-3 text-center border transition-all ${section === tab.key ? "border-[#00a884]/40 ring-2 ring-[#00a884]/20 shadow-sm" : "border-white hover:border-gray-200 hover:shadow-sm"}`}
      >
        <p className={`text-xl font-black ${tab.color}`}>{tab.value}</p>
        <p className="text-[9px] font-black text-gray-500 mt-0.5 leading-tight"><span className="mr-1">{tab.icon}</span>{tab.label}</p>
      </button>
    ))}
  </div>
);

const ProductRow = ({ product, localProduct, onOpen, onToggle }) => {
  const status = getProductStatus(localProduct);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3 border-t border-gray-100 first:border-t-0"
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${status.dot}`} />
      <ProductImage product={product} className="w-12 h-12 rounded-xl border border-gray-100 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-sm font-black text-gray-900 truncate max-w-full">{localProduct?.name || getProductName(product)}</h4>
          {getBrandName(product) && <span className="text-[9px] font-black text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">{getBrandName(product)}</span>}
          {getGroupName(product) && <span className="text-[9px] font-black text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">{getGroupName(product)}</span>}
          {getDetailName(product) && <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">{getDetailName(product)}</span>}
          {localProduct && <span className="text-[9px] font-black text-[#008f72] bg-[#00a884]/10 px-1.5 py-0.5 rounded-full">Personalizado</span>}
        </div>
        <p className="text-[10px] text-gray-400 mt-1 line-clamp-2 leading-relaxed">{localProduct?.description || getDescription(product) || "Sin descripción."}</p>
      </div>
      <div className="shrink-0 flex items-center gap-3">
        <span className={`hidden sm:inline-flex h-8 px-3 rounded-xl items-center font-black text-xs ${localProduct ? "bg-[#00a884]/10 text-[#008f72]" : "bg-gray-50 text-gray-400"}`}>{currency(localProduct?.price || 0, true)}</span>
        <span
          role="switch"
          aria-checked={Boolean(localProduct)}
          title={localProduct ? "Desactivar producto" : "Activar producto"}
          onClick={(event) => { event.stopPropagation(); onToggle(); }}
          className={`w-11 h-6 rounded-full p-1 transition-colors cursor-pointer ${localProduct ? "bg-[#00a884]" : "bg-gray-300"}`}
        >
          <span className={`block w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${localProduct ? "translate-x-5" : "translate-x-0"}`} />
        </span>
      </div>
    </button>
  );
};


const Products = () => {
  const {
    activeStore,
    products,
    categories,
    brands,
    addProduct,
    updateProduct,
    deleteProduct,
    addCategory,
    addBrand,
  } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [catalogView, setCatalogView] = useState("local");
  const [catalog, setCatalog] = useState(EMPTY_CATALOG);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [globalProductsPage, setGlobalProductsPage] = useState([]);
  const [globalProductsLoading, setGlobalProductsLoading] = useState(false);
  const [globalProductsError, setGlobalProductsError] = useState("");
  const globalProductsCacheRef = useRef(new Map());
  const globalProductsInFlightRef = useRef(new Map());
  const globalProductsRequestRef = useRef(0);
  const [selectedGlobalCategory, setSelectedGlobalCategory] = useState("");
  const [selectedGlobalBrand, setSelectedGlobalBrand] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedDetail, setSelectedDetail] = useState("");
  const [expandedCategoryId, setExpandedCategoryId] = useState("");
  const [groupFilter, setGroupFilter] = useState({});
  const [detailFilter, setDetailFilter] = useState({});
  const [selectedGlobal, setSelectedGlobal] = useState(null);
  const [customProduct, setCustomProduct] = useState(null);
  const [nameModal, setNameModal] = useState(null);
  const [infoModal, setInfoModal] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [ownerTenants, setOwnerTenants] = useState<any[]>([]);
  const [catalogTargetTenantIds, setCatalogTargetTenantIds] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isPlatformRootHost()) return undefined;
    let alive = true;
    const load = () => api.get('/admin/businesses')
      .then((items) => { if (alive) setOwnerTenants(Array.isArray(items) ? items : []); })
      .catch(() => { if (alive) setOwnerTenants([]); });
    load();
    window.addEventListener('colmapro:tenant-changed', load);
    return () => {
      alive = false;
      window.removeEventListener('colmapro:tenant-changed', load);
    };
  }, []);

  const currentTenantId = String(api.getAdminTenant?.() || '').trim();
  const currentTenantOption = useMemo(() => (
    ownerTenants.find((tenant) => tenant.slug === currentTenantId || tenant.id === currentTenantId) || ownerTenants[0]
  ), [ownerTenants, currentTenantId]);
  const currentTenantKey = tenantIdOf(currentTenantOption) || currentTenantId || String(activeStore?.tenant_id || activeStore?.tenantId || '').trim();

  useEffect(() => {
    if (ownerTenants.length === 0) return;
    setCatalogTargetTenantIds((prev) => {
      const validIds = ownerTenants.map(tenantIdOf).filter(Boolean);
      const kept = prev.map(String).filter((id) => validIds.includes(id));
      if (kept.length > 0) return kept;
      return currentTenantKey ? [currentTenantKey] : validIds.slice(0, 1);
    });
  }, [ownerTenants, currentTenantKey]);

  const toggleCatalogTargetTenant = useCallback((tenant: any) => {
    const id = tenantIdOf(tenant);
    if (!id) return;
    setCatalogTargetTenantIds((prev) => {
      const exists = prev.includes(id);
      if (exists && prev.length <= 1) return prev;
      return exists ? prev.filter((item) => item !== id) : [...prev, id];
    });
  }, []);

  const section = location.pathname.includes("/categories")
    ? "categorias"
    : location.pathname.includes("/brands")
      ? "marcas"
      : "productos";

  const catalogQuery = useMemo(() => search.trim(), [search]);

  const loadCatalogSummary = useCallback(async () => {
    globalProductsCacheRef.current.clear();
    globalProductsInFlightRef.current.clear();
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const payload = await api.get("/catalog/global?view=summary");
      setCatalog({ ...EMPTY_CATALOG, ...(payload || {}), products: [] });
    } catch (err) {
      setCatalogError(err?.message || "No se pudo cargar el resumen del catálogo global");
      setCatalog(EMPTY_CATALOG);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const loadGlobalProducts = useCallback(async ({ q = "", category = "", brand = "", group = "", detail = "", limit = 80 } = {}) => {
    const params = new URLSearchParams({ view: "products", active: "true", limit: String(limit) });
    const clean = {
      q: String(q || "").trim(),
      category: String(category || "").trim(),
      brand: String(brand || "").trim(),
      group: String(group || "").trim(),
      detail: String(detail || "").trim(),
      limit: Number(limit || 80),
    };
    if (clean.q) params.set("q", clean.q);
    if (clean.category) params.set("category", clean.category);
    if (clean.brand) params.set("brand", clean.brand);
    if (clean.group) params.set("group", clean.group);
    if (clean.detail) params.set("detail", clean.detail);

    const cacheKey = JSON.stringify({
      q: normalizeText(clean.q),
      category: normalizeText(clean.category),
      brand: normalizeText(clean.brand),
      group: normalizeText(clean.group),
      detail: normalizeText(clean.detail),
      limit: clean.limit,
    });
    const requestId = globalProductsRequestRef.current + 1;
    globalProductsRequestRef.current = requestId;

    if (globalProductsCacheRef.current.has(cacheKey)) {
      setGlobalProductsPage(globalProductsCacheRef.current.get(cacheKey));
      setGlobalProductsError("");
      setGlobalProductsLoading(false);
      return;
    }

    setGlobalProductsLoading(true);
    setGlobalProductsError("");

    try {
      let request = globalProductsInFlightRef.current.get(cacheKey);
      if (!request) {
        request = api.get(`/catalog/global?${params.toString()}`);
        globalProductsInFlightRef.current.set(cacheKey, request);
      }
      const payload = await request;
      const rawPage = safeList(payload?.products);
      const page = clean.q
        ? filterCatalogProducts(rawPage, { search: clean.q })
        : rawPage;
      globalProductsCacheRef.current.set(cacheKey, page);
      if (globalProductsRequestRef.current === requestId) {
        setGlobalProductsPage(page);
      }
    } catch (err) {
      if (globalProductsRequestRef.current === requestId) {
        setGlobalProductsError(err?.message || "No se pudo cargar la selección del catálogo global");
        setGlobalProductsPage([]);
      }
    } finally {
      globalProductsInFlightRef.current.delete(cacheKey);
      if (globalProductsRequestRef.current === requestId) {
        setGlobalProductsLoading(false);
      }
    }
  }, []);

  useEffect(() => { loadCatalogSummary(); }, [loadCatalogSummary]);

  useEffect(() => {
    if (catalogView !== "global" || section !== "productos") return undefined;
    if (!selectedGlobalCategory && !selectedGlobalBrand && !catalogQuery) {
      setGlobalProductsPage([]);
      setGlobalProductsError("");
      return undefined;
    }
    const timer = window.setTimeout(() => {
      loadGlobalProducts({
        q: catalogQuery,
        category: selectedGlobalCategory,
        brand: selectedGlobalBrand,
        group: selectedGroup,
        detail: selectedDetail,
        limit: catalogQuery ? 120 : 80,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [catalogView, section, catalogQuery, selectedGlobalCategory, selectedGlobalBrand, selectedGroup, selectedDetail, loadGlobalProducts]);

  useEffect(() => {
    setSearch("");
    setSelectedGroup("");
    setSelectedDetail("");
    setSelectedGlobalCategory("");
    setSelectedGlobalBrand("");
    setExpandedCategoryId("");
    setGroupFilter({});
    setDetailFilter({});
  }, [section, catalogView]);

  const globalCategories = useMemo(() => safeList(catalog.categories).filter((item) => item?.active !== false), [catalog.categories]);
  const globalBrands = useMemo(() => safeList(catalog.brands).filter((item) => item?.active !== false), [catalog.brands]);
  const globalGroups = useMemo(() => safeList(catalog.groups).filter((item) => item?.active !== false), [catalog.groups]);
  const globalDetails = useMemo(() => safeList(catalog.details).filter((item) => item?.active !== false), [catalog.details]);

  const localCategoryNames = useMemo(
    () => uniqueSorted([...(categories || []), ...products.map((p) => p.category)]),
    [categories, products],
  );
  const localBrandNames = useMemo(
    () => uniqueSorted([...(brands || []), ...products.map((p) => p.brand)]),
    [brands, products],
  );
  const productCategories = useMemo(
    () => uniqueSorted([...localCategoryNames, ...globalCategories.map((c) => c.name)]),
    [localCategoryNames, globalCategories],
  );
  const productBrands = useMemo(
    () => uniqueSorted([...localBrandNames, ...globalBrands.map((b) => b.name)]),
    [localBrandNames, globalBrands],
  );

  const localByGlobal = useMemo(() => {
    const map = new Map();
    products.forEach((product) => {
      const globalId = String(product.globalId || product.global_id || "").trim();
      if (globalId) map.set(globalId, product);
    });
    return map;
  }, [products]);

  const findLocalProduct = useCallback((globalProduct) => {
    const keys = [
      globalProduct?.id,
      globalProduct?.source_key,
      globalProduct?.sourceKey,
      globalProduct?.global_id,
      globalProduct?.globalId,
    ].map((value) => String(value || "").trim()).filter(Boolean);
    for (const key of keys) {
      const found = localByGlobal.get(key);
      if (found) return found;
    }
    return null;
  }, [localByGlobal]);

  const getLocalGlobalId = (product) => String(product?.globalId || product?.global_id || "").trim();

  const openLocalProduct = useCallback(async (localProduct) => {
    const globalId = getLocalGlobalId(localProduct);
    if (!globalId) {
      setCustomProduct(localProduct);
      return;
    }
    try {
      const payload = await api.get(`/catalog/global?view=products&active=true&limit=1&id=${encodeURIComponent(globalId)}`);
      const globalProduct = safeList(payload?.products)[0];
      if (globalProduct) {
        setSelectedGlobal({ globalProduct, localProduct, canRestoreGlobal: true });
        return;
      }
    } catch (_) {
    }
    setCustomProduct(localProduct);
  }, []);

  const localProductsFiltered = useMemo(
    () => filterCatalogProducts(products, { search }),
    [products, search],
  );

  const localProductsByCategory = useMemo(() => {
    const buckets = new Map();
    localProductsFiltered.forEach((product) => {
      const categoryName = product.category || "Sin categoría";
      const key = compactKey(categoryName) || "sin-categoria";
      if (!buckets.has(key)) {
        buckets.set(key, {
          id: key,
          name: categoryName,
          icon: product.categoryIcon || product.category_icon || categoryIconFor(categoryName),
          products: [],
        });
      }
      buckets.get(key).products.push(product);
    });
    localCategoryNames.forEach((name) => {
      const key = compactKey(name) || "sin-categoria";
      if (!buckets.has(key) && !search.trim()) {
        buckets.set(key, { id: key, name, icon: categoryIconFor(name), products: [] });
      }
    });
    return [...buckets.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [localProductsFiltered, localCategoryNames, search]);

  const localStats = useMemo(() => ({
    products: products.length,
    categories: localCategoryNames.length,
    brands: localBrandNames.length,
  }), [products.length, localCategoryNames.length, localBrandNames.length]);

  const globalStats = useMemo(() => ({
    products: Number(catalog.stats?.products_active || catalog.stats?.products_total || 0),
    categories: globalCategories.length,
    brands: globalBrands.length,
  }), [catalog.stats, globalCategories.length, globalBrands.length]);

  const statsForView = catalogView === "global" ? globalStats : localStats;
  const primaryActionLabel = section === "categorias" ? "Categoría local" : section === "marcas" ? "Marca local" : "Producto propio";

  const tabs = [
    { key: "products", label: "Productos", icon: "📦", value: statsForView.products, to: "/admin/catalog/products", color: "text-[#00a884]", bg: "bg-[#eafaf1]" },
    { key: "categories", label: "Categorías", icon: "🏷️", value: statsForView.categories, to: "/admin/catalog/categories", color: "text-rose-600", bg: "bg-rose-50" },
    { key: "brands", label: "Marcas", icon: "🧱", value: statsForView.brands, to: "/admin/catalog/brands", color: "text-indigo-600", bg: "bg-indigo-50" },
  ];

  const saveProduct = async (data, isUpdate) => {
    const selectedTargets = Array.isArray(data?.targetTenantIds) ? data.targetTenantIds : [];
    const currentTenant = api.getAdminTenant?.() || '';
    const currentTenantOption = ownerTenants.find((tenant) => tenant.slug === currentTenant || tenant.id === currentTenant);
    const currentRefs = [currentTenant, currentTenantOption?.id, currentTenantOption?.slug, activeStore?.tenant_id, activeStore?.tenantId].filter(Boolean).map(String);
    const selectedCurrentOnly = selectedTargets.length <= 1 && (selectedTargets.length === 0 || currentRefs.includes(String(selectedTargets[0])));
    if (!selectedCurrentOnly) {
      const payload = { ...data };
      delete payload.targetTenantIds;
      delete payload.tenant_ids;
      const response = await api.post('/admin/catalog/global/activate-multi', { tenant_ids: selectedTargets, product: payload });
      if (selectedTargets.some((target) => currentRefs.includes(String(target)))) {
        window.dispatchEvent(new CustomEvent('colmapro:data-changed'));
      }
      return response;
    }
    if (isUpdate) return updateProduct(data.id, data);
    return addProduct(data);
  };

  const deleteLocalProduct = async (id) => {
    await deleteProduct(id);
  };

  const saveName = async (type, value) => {
    if (type === "brand") return addBrand(value);
    return addCategory(value);
  };

  const handleBarcodeDetected = useCallback(async (barcode: string) => {
    setScannerBusy(true);
    try {
      const payload = await api.get(`/catalog/barcode/${encodeURIComponent(barcode)}`);
      setScannerOpen(false);
      if (payload?.local_found && payload?.local_product) {
        setCatalogView("local");
        setSearch(barcode);
        await openLocalProduct(payload.local_product);
        return;
      }
      if (payload?.global_found && payload?.global_product) {
        setCatalogView("global");
        setSearch(barcode);
        setSelectedGlobal({ globalProduct: payload.global_product, localProduct: null });
        return;
      }
      setCatalogView("local");
      setSearch(barcode);
      setCustomProduct({ barcode });
    } finally {
      setScannerBusy(false);
    }
  }, [openLocalProduct]);

  const handlePrimaryAction = () => {
    if (section === "categorias") return setNameModal({ type: "category" });
    if (section === "marcas") return setNameModal({ type: "brand" });
    return setCustomProduct({});
  };

  const openInfo = useCallback(async (type, item) => {
    if (catalogView === "local") {
      const related = type === "brand"
        ? products.filter((product) => sameName(product.brand, item.name))
        : products.filter((product) => sameName(product.category, item.name));
      setInfoModal({ type, item, products: related });
      return;
    }
    try {
      const params = new URLSearchParams({ view: "products", active: "true", limit: "30" });
      params.set(type === "brand" ? "brand" : "category", item.name);
      const payload = await api.get(`/catalog/global?${params.toString()}`);
      setInfoModal({ type, item, products: safeList(payload?.products) });
    } catch (_) {
      setInfoModal({ type, item, products: [] });
    }
  }, [catalogView, products]);

  const renderLocalProducts = () => {
    if (products.length === 0) {
      return (
        <EmptyState
          title="Tu catálogo local todavía está vacío"
          description="Activa productos desde el catálogo global o crea productos propios. Aquí solo aparecerán los productos reales de este negocio."
          actionLabel="Explorar catálogo global"
          onAction={() => setCatalogView("global")}
        />
      );
    }
    if (localProductsByCategory.length === 0) {
      return <EmptyState title={`Sin resultados para "${search}"`} description="Busca por nombre, categoría, marca o código." />;
    }
    return (
      <div className="space-y-3">
        {localProductsByCategory.map((category) => {
          const isOpen = expandedCategoryId === category.id || Boolean(search.trim());
          const groups = uniqueSorted(category.products.map((product) => getGroupName(product)));
          const selectedLocalGroup = groupFilter[category.id] || "";
          const selectedLocalDetail = detailFilter[category.id] || "";
          const productsInLocalGroup = selectedLocalGroup ? category.products.filter((product) => sameName(getGroupName(product), selectedLocalGroup)) : category.products;
          const details = uniqueSorted(productsInLocalGroup.map((product) => getDetailName(product)));
          const visibleProducts = selectedLocalDetail ? productsInLocalGroup.filter((product) => sameName(getDetailName(product), selectedLocalDetail)) : productsInLocalGroup;
          const selectedLocalGroupData = selectedLocalGroup || "Todos";
          return (
            <div key={category.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedCategoryId(isOpen && !search.trim() ? "" : category.id)}
                className="w-full p-4 flex items-center justify-between gap-4 text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-xl shrink-0">{category.icon || categoryIconFor(category.name)}</div>
                  <div className="min-w-0">
                    <h3 className="font-black text-gray-900 truncate">{category.name}</h3>
                    <p className="text-xs text-gray-400 font-bold">{category.products.length} activos en este colmado</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {category.products.length > 0 && <span className="rounded-full bg-[#00a884]/10 text-[#008f72] px-3 py-1 text-xs font-black">{category.products.length}</span>}
                  <FiChevronDown className={`text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </div>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    {groups.length > 0 && (
                      <div className="border-t border-gray-100">
                        {!selectedLocalGroup ? (
                          <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/30">
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <p className="text-xs font-black text-amber-700">{category.name}</p>
                              <span className="text-[10px] font-black text-amber-700 bg-white border border-amber-100 rounded-full px-2 py-1">{formatCatalogNumber(groups.length)}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {groups.map((group) => (
                                <button key={group} type="button" onClick={() => { setGroupFilter((prev) => ({ ...prev, [category.id]: sameName(prev[category.id], group) ? "" : group })); setDetailFilter((prev) => ({ ...prev, [category.id]: "" })); }} className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[10px] font-black transition-colors ${sameName(selectedLocalGroup, group) ? "bg-amber-100 border-amber-500 text-amber-800" : "bg-white border-amber-200 text-amber-700 hover:bg-amber-50"}`}>
                                  {group}
                                  <span className="text-[9px] opacity-70">{formatCatalogNumber(category.products.filter((product) => sameName(getGroupName(product), group)).length)}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="px-4 py-3 border-b border-orange-100 bg-orange-50/30">
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <p className="text-xs font-black text-orange-700">{selectedLocalGroupData}</p>
                              <button type="button" onClick={() => { setGroupFilter((prev) => ({ ...prev, [category.id]: "" })); setDetailFilter((prev) => ({ ...prev, [category.id]: "" })); }} className="rounded-full bg-white border border-orange-100 px-3 py-1 text-[10px] font-black text-orange-700 hover:bg-orange-50">← Atrás</button>
                            </div>
                            {details.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => setDetailFilter((prev) => ({ ...prev, [category.id]: "" }))} className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[10px] font-black transition-colors ${!selectedLocalDetail ? "bg-orange-100 border-orange-500 text-orange-800" : "bg-white border-orange-200 text-orange-700 hover:bg-orange-50"}`}>Todos</button>
                                {details.map((detail) => (
                                  <button key={detail} type="button" onClick={() => setDetailFilter((prev) => ({ ...prev, [category.id]: sameName(prev[category.id], detail) ? "" : detail }))} className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[10px] font-black transition-colors ${sameName(selectedLocalDetail, detail) ? "bg-orange-100 border-orange-500 text-orange-800" : "bg-white border-orange-200 text-orange-700 hover:bg-orange-50"}`}>
                                    {detail}
                                    <span className="text-[9px] opacity-70">{formatCatalogNumber(productsInLocalGroup.filter((product) => sameName(getDetailName(product), detail)).length)}</span>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs font-bold text-orange-700/70">Esta opción no tiene subopciones configuradas. Se muestran sus productos activos.</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <div>
                      {visibleProducts.map((product) => (
                        <ProductRow
                          key={product.id}
                          product={product}
                          localProduct={product}
                          onOpen={() => openLocalProduct(product)}
                          onToggle={() => deleteLocalProduct(product.id)}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    );
  };

  const renderGlobalProducts = () => {
    if (catalogLoading) {
      return <EmptyState icon={FiRefreshCw} title="Cargando catálogo global" description="Estamos preparando categorías, marcas y filtros sin cargar todos los productos del negocio." />;
    }
    if (catalogError) {
      return (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="flex items-start gap-3">
            <FiAlertTriangle className="text-amber-500 text-xl shrink-0" />
            <div>
              <p className="text-sm font-black text-amber-800">No se pudo cargar el catálogo global</p>
              <p className="text-xs font-bold text-amber-700 mt-1">{catalogError}</p>
            </div>
          </div>
          <button type="button" onClick={loadCatalogSummary} className="h-11 px-4 rounded-xl bg-white text-amber-700 text-xs font-black border border-amber-200">Reintentar</button>
        </div>
      );
    }

    const isSearching = Boolean(search.trim() || selectedGlobalBrand);
    const categoryGroups = selectedGlobalCategory
      ? globalGroups.filter((group) => sameName(group.category_name || group.categoryName, selectedGlobalCategory))
      : [];

    if (!isSearching) {
      return (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#bce8d1] bg-[#f2fcf7] p-4 flex items-start gap-3">
            <FiInfo className="text-[#00a884] shrink-0 mt-0.5" />
            <p className="text-xs font-bold text-[#008f72] leading-relaxed">
              El catálogo global funciona como biblioteca. Despliega una categoría y activa únicamente los productos que el negocio tenga en existencia; el catálogo local se llenará solo al guardar y activar.
            </p>
          </div>

          <div className="space-y-3">
            {globalCategories.map((category) => {
              const isOpen = sameName(selectedGlobalCategory, category.name);
              const active = products.filter((product) => sameName(product.category, category.name)).length;
              return (
                <div key={category.id || category.name} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      const nextOpen = !isOpen;
                      setSelectedGlobalCategory(nextOpen ? category.name : "");
                      setSelectedGlobalBrand("");
                      setSelectedGroup("");
                      setSelectedDetail("");
                      setGlobalProductsPage([]);
                      if (nextOpen) loadGlobalProducts({ category: category.name, limit: 80 });
                    }}
                    className="w-full p-4 flex items-center justify-between gap-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-xl shrink-0">{category.icon || categoryIconFor(category.name)}</div>
                      <div className="min-w-0">
                        <h3 className="font-black text-gray-900 truncate">{category.name}</h3>
                        <p className="text-xs text-gray-400 font-bold">{category.products_count || category.productsCount || 0} productos globales · {active} activos</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {active > 0 && <span className="rounded-full bg-[#00a884]/10 text-[#008f72] px-3 py-1 text-xs font-black">{active}</span>}
                      <FiChevronDown className={`text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        {categoryGroups.length > 0 && (() => {
                          const selectedGroupData = categoryGroups.find((group) => sameName(group.name, selectedGroup));
                          const categoryDetails = selectedGroup
                            ? globalDetails.filter((detail) => sameName(detail.category_name || detail.categoryName, category.name) && sameName(detail.group_name || detail.groupName, selectedGroup))
                            : [];
                          const selectedDetailData = selectedDetail ? categoryDetails.find((detail) => sameName(detail.name, selectedDetail)) : null;
                          return (
                            <div className="border-t border-gray-100">
                              <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/30">
                                <div className="flex items-center justify-between gap-3 mb-2">
                                  <p className="text-xs font-black text-amber-700">{category.name}</p>
                                  <span className="text-[10px] font-black text-amber-700 bg-white border border-amber-100 rounded-full px-2 py-1">{formatCatalogNumber(categoryGroups.length)}</span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <button type="button" onClick={() => { setSelectedGroup(""); setSelectedDetail(""); }} className={`h-8 px-3 rounded-full border text-[10px] font-black ${!selectedGroup ? "bg-white border-gray-200 text-gray-700" : "bg-gray-100 border-gray-200 text-gray-400 hover:text-gray-700"}`}>Todos</button>
                                  {categoryGroups.map((group) => (
                                    <button key={group.id || group.name} type="button" onClick={() => { setSelectedGroup((current) => sameName(current, group.name) ? "" : group.name); setSelectedDetail(""); }} className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[10px] font-black transition-colors ${sameName(selectedGroup, group.name) ? "bg-amber-100 border-amber-500 text-amber-800" : "bg-white border-amber-200 text-amber-700 hover:bg-amber-50"}`}>{group.name}<span className="text-[9px] opacity-70">{formatCatalogNumber(group.products_count ?? group.productsCount)}</span></button>
                                  ))}
                                </div>
                              </div>

                              {selectedGroup && (
                                <div className="px-4 py-3 border-b border-orange-100 bg-orange-50/30">
                                  <div className="flex items-center justify-between gap-3 mb-2">
                                    <p className="text-xs font-black text-orange-700">{selectedGroupData?.name || selectedGroup}</p>
                                    <span className="text-[10px] font-black text-orange-700 bg-white border border-orange-100 rounded-full px-2 py-1">{formatCatalogNumber(categoryDetails.length)}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {categoryDetails.map((detail) => (
                                      <button key={detail.id || detail.name} type="button" onClick={() => setSelectedDetail((current) => sameName(current, detail.name) ? "" : detail.name)} className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[10px] font-black transition-colors ${sameName(selectedDetail, detail.name) ? "bg-orange-100 border-orange-500 text-orange-800" : "bg-white border-orange-200 text-orange-700 hover:bg-orange-50"}`}>{detail.name}<span className="text-[9px] opacity-70">{formatCatalogNumber(detail.products_count ?? detail.productsCount)}</span></button>
                                    ))}
                                    {categoryDetails.length === 0 && <span className="text-xs font-bold text-gray-400">Sin subopciones todavía para esta selección.</span>}
                                  </div>
                                </div>
                              )}

                              {(selectedGroup || selectedDetail) && (
                                <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex flex-wrap items-center gap-2 text-[11px] font-bold text-gray-500">
                                  <span>Selección:</span>
                                  {selectedGroup && <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-1">{selectedGroupData?.name || selectedGroup}</span>}
                                  {selectedDetail && <span className="rounded-full bg-orange-100 text-orange-800 px-2 py-1">{selectedDetailData?.name || selectedDetail}</span>}
                                  <button type="button" onClick={() => { setSelectedGroup(""); setSelectedDetail(""); }} className="rounded-full bg-white border border-gray-200 px-2 py-1 text-gray-500 hover:text-gray-900">Limpiar filtro</button>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        {globalProductsLoading && <ProductListSkeleton rows={6} />}
                        {globalProductsError && !globalProductsLoading && (
                          <div className="border-t border-gray-100 p-4 text-sm font-bold text-amber-700 bg-amber-50">{globalProductsError}</div>
                        )}
                        {!globalProductsLoading && !globalProductsError && globalProductsPage.length === 0 && (
                          <div className="border-t border-gray-100"><EmptyState title="No hay productos en esta categoría" description="Prueba otro grupo o actualiza el catálogo global." /></div>
                        )}
                        {!globalProductsLoading && !globalProductsError && globalProductsPage.length > 0 && (
                          <div>
                            {globalProductsPage.map((product) => {
                              const localProduct = findLocalProduct(product);
                              return (
                                <ProductRow
                                  key={getGlobalId(product) || product.source_key || product.name}
                                  product={product}
                                  localProduct={localProduct}
                                  onOpen={() => setSelectedGlobal({ globalProduct: product, localProduct, canRestoreGlobal: true })}
                                  onToggle={() => localProduct ? deleteLocalProduct(localProduct.id) : setSelectedGlobal({ globalProduct: product, localProduct: null, canRestoreGlobal: true })}
                                />
                              );
                            })}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
          <div>
            <p className="text-[10px] font-black text-[#00a884] uppercase tracking-[0.22em]">Catálogo global</p>
            <h3 className="text-lg font-black text-gray-900">{selectedGlobalBrand || (search.trim() ? `Resultados para “${search.trim()}”` : "Productos globales")}</h3>
            <p className="text-xs text-gray-400 font-bold mt-1">Mostrando una selección ligera en una sola columna. Activa solo los productos que realmente tenga el negocio.</p>
          </div>
          <button type="button" onClick={() => { setSelectedGlobalCategory(""); setSelectedGlobalBrand(""); setSelectedGroup(""); setSelectedDetail(""); setGlobalProductsPage([]); setSearch(""); }} className="h-10 px-4 rounded-xl bg-gray-100 text-gray-600 text-xs font-black">Limpiar búsqueda</button>
        </div>

        {globalProductsLoading && <ProductListSkeleton rows={8} />}
        {globalProductsError && !globalProductsLoading && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-700">{globalProductsError}</div>
        )}
        {!globalProductsLoading && !globalProductsError && globalProductsPage.length === 0 && (
          <EmptyState title="No hay productos en esta selección" description="Prueba otra categoría, marca, grupo o búsqueda." />
        )}
        {!globalProductsLoading && globalProductsPage.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {globalProductsPage.map((product) => {
              const localProduct = findLocalProduct(product);
              return (
                <ProductRow
                  key={getGlobalId(product) || product.source_key || product.name}
                  product={product}
                  localProduct={localProduct}
                  onOpen={() => setSelectedGlobal({ globalProduct: product, localProduct, canRestoreGlobal: true })}
                  onToggle={() => localProduct ? deleteLocalProduct(localProduct.id) : setSelectedGlobal({ globalProduct: product, localProduct: null, canRestoreGlobal: true })}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderCategories = () => {
    const q = normalizeText(search);
    if (catalogView === "global") {
      const items = globalCategories.filter((item) => !q || normalizeText(item.name).includes(q));
      if (items.length === 0) return <EmptyState icon={FiList} title="No hay categorías globales" description="Importa el catálogo global desde el panel central." />;
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((category) => {
            const active = products.filter((product) => sameName(product.category, category.name)).length;
            return (
              <button key={category.id || category.name} type="button" onClick={() => openInfo("category", category)} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm text-left hover:border-[#00a884]/40 hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-rose-50 flex items-center justify-center text-xl shrink-0">{category.icon || categoryIconFor(category.name)}</div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-black text-gray-900 truncate">{category.name}</h3>
                      <p className="text-xs text-gray-400 font-bold mt-0.5">{category.products_count || category.productsCount || 0} globales · {active} activos</p>
                    </div>
                  </div>
                  <FiInfo className="text-gray-300 shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      );
    }

    const items = localCategoryNames.filter((name) => !q || normalizeText(name).includes(q));
    if (items.length === 0) return <EmptyState icon={FiList} title="No hay categorías locales" description="Las categorías locales se crean manualmente o aparecen al activar productos globales." actionLabel="Agregar categoría local" onAction={() => setNameModal({ type: "category" })} />;
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {items.map((name) => {
          const related = products.filter((product) => sameName(product.category, name));
          return (
            <button key={name} type="button" onClick={() => openInfo("category", { id: name, name, icon: categoryIconFor(name), active: true })} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm text-left hover:border-[#00a884]/40 hover:shadow-md transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-[#00a884]/10 flex items-center justify-center text-xl shrink-0">{categoryIconFor(name)}</div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-gray-900 truncate">{name}</h3>
                    <p className="text-xs text-gray-400 font-bold mt-0.5">{related.length} productos locales</p>
                  </div>
                </div>
                <FiInfo className="text-gray-300 shrink-0" />
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const renderBrands = () => {
    const q = normalizeText(search);
    if (catalogView === "global") {
      const items = globalBrands.filter((item) => !q || normalizeText(item.name).includes(q));
      if (items.length === 0) return <EmptyState icon={FiLayers} title="No hay marcas globales" description="Importa el catálogo global desde el panel central." />;
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          {items.map((brand) => {
            const active = products.filter((product) => sameName(product.brand, brand.name)).length;
            return (
              <button key={brand.id || brand.name} type="button" onClick={() => openInfo("brand", brand)} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm text-left hover:border-[#00a884]/40 hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-black shrink-0 overflow-hidden">{brand.logo ? <img src={brand.logo} alt="" className="w-full h-full object-contain" /> : String(brand.name || "M").slice(0, 2)}</div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-black text-gray-900 truncate">{brand.name}</h3>
                      <p className="text-xs text-gray-400 font-bold mt-0.5">{brand.products_count || brand.productsCount || 0} globales · {active} activos</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[9px] font-black ${brand.active === false ? "bg-red-50 text-red-500" : "bg-[#00a884]/10 text-[#008f72]"}`}>{brand.active === false ? "Inactiva" : "Activa"}</span>
                </div>
              </button>
            );
          })}
        </div>
      );
    }

    const items = localBrandNames.filter((name) => !q || normalizeText(name).includes(q));
    if (items.length === 0) return <EmptyState icon={FiLayers} title="No hay marcas locales" description="Las marcas locales se crean manualmente o aparecen al activar productos globales." actionLabel="Agregar marca local" onAction={() => setNameModal({ type: "brand" })} />;
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {items.map((name) => {
          const related = products.filter((product) => sameName(product.brand, name));
          return (
            <button key={name} type="button" onClick={() => openInfo("brand", { id: name, name, active: true })} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm text-left hover:border-[#00a884]/40 hover:shadow-md transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-black shrink-0">{String(name || "M").slice(0, 2)}</div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-gray-900 truncate">{name}</h3>
                    <p className="text-xs text-gray-400 font-bold mt-0.5">{related.length} productos locales</p>
                  </div>
                </div>
                <span className="rounded-full px-2 py-1 text-[9px] font-black bg-[#00a884]/10 text-[#008f72]">Local</span>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#f8f9fa]">
      <div className="flex-1 overflow-y-auto catalog-scrollbar overscroll-contain">
        <div className="bg-white border-b border-gray-100 px-4 md:px-6 pt-5 pb-4 space-y-4 shrink-0">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
              <h1 className="text-xl md:text-2xl font-black text-gray-900">Catálogo de Productos</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {catalogView === "local"
                  ? <>Solo productos activados o creados para <b>{activeStore?.name || "este negocio"}</b>.</>
                  : <>Biblioteca global para activar productos en <b>{activeStore?.name || "este negocio"}</b>.</>}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="button" onClick={() => { loadCatalogSummary(); if (catalogView === "global" && section === "productos") loadGlobalProducts({ q: catalogQuery, category: selectedGlobalCategory, brand: selectedGlobalBrand, group: selectedGroup, detail: selectedDetail }); }} disabled={catalogLoading || globalProductsLoading} className="inline-flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-3 rounded-xl text-xs font-black hover:bg-gray-50 disabled:opacity-60"><FiRefreshCw className={catalogLoading || globalProductsLoading ? "animate-spin" : ""} /> Actualizar</button>
              <button type="button" onClick={handlePrimaryAction} className="inline-flex items-center justify-center gap-2 bg-[#00a884] text-white px-4 py-3 rounded-xl text-xs font-black shadow-md shadow-[#00a884]/20"><FiPlus /> {primaryActionLabel}</button>
            </div>
          </div>

          <div className="rounded-2xl border border-[#bce8d1] bg-[#eafaf1] px-4 py-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-[#00a884] text-white flex items-center justify-center text-sm font-black shrink-0">{String(activeStore?.name || "CO").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0">
                  <p className="font-black text-indigo-700 truncate">{activeStore?.name || "Negocio activo"}</p>
                  <p className="text-[11px] font-bold text-[#008f72] truncate">{activeStore?.address || activeStore?.slug || activeStore?.domain || "Catálogo del colmado"}</p>
                </div>
              </div>
              <p className="text-xs font-black text-[#008f72] shrink-0">{products.length} productos en este colmado</p>
            </div>

            {catalogView === "global" && section === "productos" && ownerTenants.length > 1 && (
              <div className="rounded-2xl border border-[#bce8d1] bg-white/80 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#008f72]/70">Activar en negocios</p>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">Selecciona aquí uno o varios negocios. El producto que abras del catálogo global se guardará y activará en esos negocios.</p>
                  </div>
                  <span className="rounded-full bg-[#00a884]/10 text-[#008f72] px-3 py-1 text-[10px] font-black shrink-0">{catalogTargetTenantIds.length} seleccionado(s)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {ownerTenants.map((tenant) => {
                    const id = tenantIdOf(tenant);
                    const checked = catalogTargetTenantIds.includes(id);
                    const current = id === currentTenantKey || tenant.slug === currentTenantId || tenant.id === currentTenantId;
                    return (
                      <button
                        key={id || tenant.slug}
                        type="button"
                        onClick={() => toggleCatalogTargetTenant(tenant)}
                        className={`rounded-2xl border-2 px-3 py-3 text-left transition-all ${checked ? 'border-[#bce8d1] bg-[#f0fbf8] text-[#008f72]' : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${checked ? 'bg-[#00a884] text-white' : 'bg-white text-gray-400 border border-gray-200'}`}>🏪</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black truncate">{tenantLabel(tenant)} {current ? '· actual' : ''}</p>
                            <p className="text-[10px] font-semibold opacity-70 truncate">{tenant.slug || tenant.domain || 'negocio'}</p>
                          </div>
                          {checked && <FiCheck className="text-sm shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
            <div className="flex flex-wrap items-center gap-4 text-[11px] font-bold text-gray-500">
              <span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-[#00a884]" /> Activo en este colmado</span>
              <span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-gray-300" /> Disponible en global / inactivo</span>
              <span className="inline-flex items-center gap-2"><FiEdit3 className="text-[#00a884]" /> El local se llena solo al activar</span>
            </div>
            <div className="bg-gray-100 p-1 rounded-2xl grid grid-cols-2 gap-1 w-full sm:w-auto">
              <button type="button" onClick={() => setCatalogView("local")} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${catalogView === "local" ? "bg-white text-[#008f72] shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>Catálogo local</button>
              <button type="button" onClick={() => setCatalogView("global")} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${catalogView === "global" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>Catálogo global</button>
            </div>
          </div>

          <CatalogTabs tabs={tabs} section={section} navigate={navigate} />
        </div>

        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-100 px-4 md:px-6 py-3 shadow-sm">
          <div className="relative">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={catalogView === "local"
                ? section === "productos" ? "Buscar producto local por nombre, marca o código..." : section === "categorias" ? "Buscar categoría local..." : "Buscar marca local..."
                : section === "productos" ? "Buscar producto global por nombre, marca o código..." : section === "categorias" ? "Buscar categoría global..." : "Buscar marca global..."}
              className={`w-full pl-10 ${section === "productos" ? "pr-24" : "pr-10"} py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#00a884]/30 focus:border-[#00a884] text-sm font-semibold transition-all`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && section === "productos" && isBarcodeQuery(search)) {
                  event.preventDefault();
                  void handleBarcodeDetected(search);
                }
              }}
            />
            {section === "productos" && (
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-xl bg-[#00a884] text-white flex items-center justify-center shadow-sm hover:bg-[#009676]"
                title="Escanear código de barras"
                aria-label="Escanear código de barras"
              >
                <FiCamera />
              </button>
            )}
            {search && section === "productos" && <button type="button" onClick={() => setSearch("")} className="absolute right-12 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 flex items-center justify-center" aria-label="Limpiar búsqueda"><FiX className="text-sm" /></button>}
            {search && section !== "productos" && <button type="button" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><FiX className="text-sm" /></button>}
          </div>
        </div>

        <div className="p-4 md:p-6 space-y-3 pb-8">
          {section === "productos" && (catalogView === "local" ? renderLocalProducts() : renderGlobalProducts())}
          {section === "categorias" && renderCategories()}
          {section === "marcas" && renderBrands()}
        </div>
      </div>

      <AnimatePresence>
        {selectedGlobal && (
          <GlobalProductDetailModal
            globalProduct={selectedGlobal.globalProduct}
            localProduct={findLocalProduct(selectedGlobal.globalProduct) || selectedGlobal.localProduct}
            categories={productCategories}
            targetTenantIds={catalogTargetTenantIds.length > 0 ? catalogTargetTenantIds : [currentTenantKey].filter(Boolean)}
            onCancel={() => setSelectedGlobal(null)}
            onSave={saveProduct}
            onReset={updateProduct}
            onDeactivate={deleteLocalProduct}
          />
        )}
        {customProduct && (
          <CustomProductModal
            product={customProduct}
            categories={productCategories}
            brands={productBrands}
            onCancel={() => setCustomProduct(null)}
            onSave={saveProduct}
            onDelete={async (id) => { await deleteLocalProduct(id); setCustomProduct(null); }}
          />
        )}
        {nameModal && (
          <SimpleNameModal
            type={nameModal.type}
            onCancel={() => setNameModal(null)}
            onSave={(value) => saveName(nameModal.type, value)}
          />
        )}
        {infoModal && (
          <CatalogInfoModal
            type={infoModal.type}
            item={infoModal.item}
            products={infoModal.products}
            onClose={() => setInfoModal(null)}
          />
        )}
      </AnimatePresence>
      <BarcodeScanner
        open={scannerOpen}
        busy={scannerBusy}
        onClose={() => setScannerOpen(false)}
        onDetected={handleBarcodeDetected}
      />
    </div>
  );
};

export default Products;
