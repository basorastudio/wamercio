import React, { useEffect, useMemo, useState } from "react";
import * as FiIcons from "react-icons/fi";
import { useStore } from "../context/StoreContext";
import { motion, AnimatePresence } from "framer-motion";
import { catalogImageCandidates } from "../lib/catalogImages";
import { api } from "../lib/api";
import { PAYMENT_METHODS } from "../lib/paymentMethods";
import AssistedOrderModal from "./AssistedOrderModal";
import BarcodeScanner, { normalizeBarcode } from "../components/BarcodeScanner";
import PosProductSaleModal from "../components/PosProductSaleModal";
import { cartItemKey, cartItemLineTotal, formatCartItemMeasure, formatProductPrice, getWeightedProductConfig, isWeightedProduct, normalizeSaleMode } from "../lib/weightedProducts";
import {
  filterCatalogProducts,
  getCatalogBarcode,
  getCatalogCategory,
  getCatalogDetail,
  getCatalogGroup,
  sameCatalogName,
  uniqueSortedCatalogValues,
} from "../lib/catalogFilters";

const {
  FiSearch,
  FiCamera,
  FiShoppingCart,
  FiPlus,
  FiMinus,
  FiTrash2,
  FiUser,
  FiChevronDown,
  FiX,
  FiCheck,
  FiImage,
  FiSend,
  FiCheckCircle,
  FiAlertTriangle,
  FiLoader,
  FiEdit3,
} = FiIcons;

const DEFAULT_PRODUCT_SURFACE = "#ffffff";

const formatPosCartItemMeasure = (item: any) => {
  const label = formatCartItemMeasure(item);
  if (!isWeightedProduct(item)) return label;

  const saleMode = normalizeSaleMode(
    item?.saleMode || item?.sale_mode,
    item,
  );
  return saleMode === "amount"
    ? label.replace(/^RD\$\s*[\d.,]+\s*·\s*/i, "")
    : label;
};

const sampleImageBackground = (imageElement: HTMLImageElement) => {
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
    const samples: number[][] = [];
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
        (acc, color) => [
          acc[0] + color[0],
          acc[1] + color[1],
          acc[2] + color[2],
        ],
        [0, 0, 0],
      )
      .map((value) => Math.round(value / samples.length));

    return `rgb(${red}, ${green}, ${blue})`;
  } catch (_) {
    return DEFAULT_PRODUCT_SURFACE;
  }
};

const ProductImage = ({ product }: any) => {
  const candidates = useMemo(() => catalogImageCandidates(product), [product]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [surfaceColor, setSurfaceColor] = useState(DEFAULT_PRODUCT_SURFACE);
  const candidateKey = candidates.join("|");
  useEffect(() => {
    setCandidateIndex(0);
    setSurfaceColor(DEFAULT_PRODUCT_SURFACE);
  }, [candidateKey]);
  const src = candidates[candidateIndex] || "";

  if (!src) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 bg-gray-50">
        <span className="text-2xl leading-none">
          {product?.categoryIcon || product?.category_icon || "📦"}
        </span>
        <FiImage className="text-xs mt-1 opacity-60" />
      </div>
    );
  }

  return (
    <div
      className="w-full h-full flex items-center justify-center transition-colors duration-300"
      style={{ backgroundColor: surfaceColor }}
    >
      <img
        key={src}
        src={src}
        alt={product?.name || "Producto"}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-contain"
        onLoad={(event) =>
          setSurfaceColor(sampleImageBackground(event.currentTarget))
        }
        onError={() => {
          setSurfaceColor(DEFAULT_PRODUCT_SURFACE);
          setCandidateIndex((current) => current + 1);
        }}
      />
    </div>
  );
};

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

const normalizeBankName = (value: any = "") =>
  String(value || "")
    .trim()
    .toLowerCase();

const bankAccountKey = (account: any = {}) =>
  String(
    account.id ||
      `${normalizeBankName(account.bank)}:${account.number || ""}:${account.holder || ""}`,
  );

const normalizeCustomerSearchText = (value: any = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const customerSearchDigits = (value: any = "") =>
  String(value || "").replace(/\D/g, "");

const customerDisplayName = (customer: any = {}) => {
  const primaryName = String(customer.name || "").trim();
  const lastName = String(
    customer.last_name || customer.lastName || customer.last_name || "",
  ).trim();
  if (!lastName) return primaryName;
  const normalizedPrimaryName = normalizeCustomerSearchText(primaryName);
  const normalizedLastName = normalizeCustomerSearchText(lastName);
  if (
    normalizedPrimaryName === normalizedLastName ||
    normalizedPrimaryName.endsWith(` ${normalizedLastName}`)
  ) {
    return primaryName;
  }
  return `${primaryName} ${lastName}`.trim();
};

const customerWhatsapp = (customer: any = {}) =>
  String(
    customer.whatsappDisplay ||
      customer.whatsapp_display ||
      customer.whatsapp ||
      "",
  ).trim();

const customerMatchesSearch = (customer: any, query: string) => {
  const normalizedQuery = normalizeCustomerSearchText(query);
  const queryDigits = customerSearchDigits(query);
  if (!normalizedQuery && !queryDigits) return true;

  const searchableText = normalizeCustomerSearchText(
    [
      customerDisplayName(customer),
      customer.name,
      customer.name,
      customer.last_name,
      customer.lastName,
      customer.last_name,
      customer.whatsapp,
      customer.whatsappDisplay,
      customer.whatsapp_display,
      customer.national_id,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const searchableDigitValues = [
    customer.whatsapp,
    customer.whatsappDisplay,
    customer.whatsapp_display,
    customer.national_id,
  ]
    .map(customerSearchDigits)
    .filter(Boolean);

  return (
    (normalizedQuery && searchableText.includes(normalizedQuery)) ||
    (queryDigits.length >= 3 &&
      searchableDigitValues.some((value) => value.includes(queryDigits)))
  );
};

const buildTransferSaleNote = (account: any = {}) => {
  if (!account?.bank && !account?.number) return "";
  return [
    `Transferencia: ${account.bank || "Banco"}`,
    account.number ? `Cuenta ${account.number}` : "",
    account.holder ? `Titular ${account.holder}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
};

const BankLogo = ({ bank, className = "w-9 h-9 rounded-xl" }: any) => {
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

const TransferBankAccountSelector = ({
  accounts,
  selectedId,
  onSelect,
  bankByName,
}: any) => {
  const selectedAccount = accounts.find(
    (account: any) => bankAccountKey(account) === selectedId,
  );
  const visibleAccounts = selectedAccount ? [selectedAccount] : accounts;

  if (!accounts.length) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700"
      >
        No hay cuentas bancarias activas para aplicar pagos por transferencia.
        Registra una cuenta en Métodos de pago.
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
            Selecciona la cuenta donde se recibirá la transferencia de esta
            venta.
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
        {visibleAccounts.map((account: any) => {
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
                {active ? (
                  <FiCheckCircle className="text-[#00a884] text-base shrink-0" />
                ) : (
                  <FiSend className="text-violet-300 text-base shrink-0" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
};

const CartPanel = ({
  cart,
  updateQuantity,
  removeFromCart,
  onEditItem,
  getCartTotal,
  onCheckout,
  onClose = () => {},
  isDesktop,
  assisted = false,
}: any) => {
  const total = getCartTotal();
  return (
    <div
      className={`flex flex-col bg-white ${isDesktop ? "h-full border-l border-gray-100" : "rounded-t-3xl shadow-2xl max-h-[80vh]"}`}
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
        <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
          <FiShoppingCart className="text-[#00a884]" /> {assisted ? "Pedido actual" : "Venta actual"}
          <span className="bg-[#00a884] text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
            {cart.length}
          </span>
        </h2>
        {!isDesktop && (
          <button onClick={onClose} className="p-2 rounded-xl bg-gray-100">
            <FiChevronDown className="text-gray-600" />
          </button>
        )}
      </div>

      {cart.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
          <FiShoppingCart className="text-4xl text-gray-200 mb-3" />
          <p className="text-sm text-gray-400 font-medium">Carrito vacío</p>
          <p className="text-xs text-gray-300 mt-1">
            Toca un producto para agregarlo
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide">
          {cart.map((item) => {
            const weighted = isWeightedProduct(item);
            const saleMode = weighted
              ? normalizeSaleMode(item?.saleMode || item?.sale_mode, item)
              : "unit";
            const showQuickQuantityControls = !weighted || saleMode === "weight";

            return (
            <div
              key={cartItemKey(item)}
              role="button"
              tabIndex={0}
              onClick={() => onEditItem(item)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onEditItem(item);
                }
              }}
              className="flex min-h-[92px] cursor-pointer items-start gap-3 rounded-xl bg-gray-50 p-3.5 transition-colors hover:bg-[#f0fbf8] focus:outline-none focus:ring-2 focus:ring-[#00a884]/20"
              aria-label={`Editar ${item.name || "producto"}`}
            >
              <div className="w-12 h-12 rounded-xl bg-white border border-gray-100 overflow-hidden shrink-0">
                <ProductImage product={item} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 text-xs leading-snug line-clamp-2 break-words">
                  {item.name}
                </p>
                {weighted && (
                  <p className="mt-1 text-[9px] font-black text-gray-400">
                    Precio: {formatProductPrice(item)}
                  </p>
                )}
                <p className="mt-1 flex items-center gap-1 text-[9px] font-bold text-[#00a884]">
                  <FiEdit3 className="text-[10px]" />
                  Toca para cambiar cantidad
                </p>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[#00a884] text-xs font-bold whitespace-nowrap">
                    RD$ {cartItemLineTotal(item).toLocaleString("es-DO", {
                      minimumFractionDigits: isWeightedProduct(item) ? 0 : 2,
                      maximumFractionDigits: isWeightedProduct(item) ? 0 : 2,
                    })}
                  </p>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {showQuickQuantityControls && (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          updateQuantity(cartItemKey(item), -1);
                        }}
                        className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center shadow-sm"
                        aria-label={weighted ? "Reducir 0.50 lb" : "Reducir cantidad"}
                      >
                        <FiMinus className="text-xs text-gray-600" />
                      </button>
                    )}
                    <span className={`${showQuickQuantityControls ? "min-w-[4rem]" : "min-w-[5.5rem]"} text-center font-bold text-[10px] leading-tight`}>
                      {formatPosCartItemMeasure(item)}
                    </span>
                    {showQuickQuantityControls && (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          updateQuantity(cartItemKey(item), 1);
                        }}
                        className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center shadow-sm"
                        aria-label={weighted ? "Aumentar 0.50 lb" : "Aumentar cantidad"}
                      >
                        <FiPlus className="text-xs text-gray-600" />
                      </button>
                    )}
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        removeFromCart(cartItemKey(item));
                      }}
                      className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center ml-1"
                    >
                      <FiTrash2 className="text-xs text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      <div className="p-4 border-t border-gray-100 shrink-0">
        <div className="flex justify-between items-center mb-3">
          <span className="text-gray-600 font-medium text-sm">Total:</span>
          <span className="text-xl font-black text-gray-900">
            RD$ {total.toLocaleString()}
          </span>
        </div>
        <button
          onClick={onCheckout}
          disabled={cart.length === 0}
          className="w-full bg-[#00a884] text-white font-bold py-3.5 rounded-2xl text-sm shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {assisted ? "Continuar pedido" : "Cobrar"} RD$ {total.toLocaleString()}
        </button>
      </div>
    </div>
  );
};

const CheckoutModal = ({
  total,
  onConfirm,
  onClose,
  transferAccounts = [],
  bankByName = {},
  customers = [],
}: any) => {
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [transferAccountId, setTransferAccountId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const selectedTransferAccount = transferAccounts.find(
    (account: any) => bankAccountKey(account) === transferAccountId,
  );
  const needsTransferAccount = paymentMethod === "bank_transfer";
  const customerSelectionPending =
    Boolean(customerQuery.trim()) && !selectedCustomer;
  const canConfirmCustomer =
    paymentMethod !== "store_credit"
      ? !customerSelectionPending
      : Boolean(selectedCustomer?.id);
  const canConfirmTransfer =
    !needsTransferAccount || Boolean(selectedTransferAccount);

  const filteredCustomers = useMemo(() => {
    const source = Array.isArray(customers) ? customers : [];
    return source
      .filter((customer: any) => customerMatchesSearch(customer, customerQuery))
      .sort((a: any, b: any) =>
        customerDisplayName(a).localeCompare(customerDisplayName(b), "es"),
      )
      .slice(0, 8);
  }, [customers, customerQuery]);

  useEffect(() => {
    if (paymentMethod !== "bank_transfer") setTransferAccountId("");
    setSubmitError("");
  }, [paymentMethod]);

  useEffect(() => {
    if (
      transferAccountId &&
      !transferAccounts.some(
        (account: any) => bankAccountKey(account) === transferAccountId,
      )
    ) {
      setTransferAccountId("");
    }
  }, [transferAccounts, transferAccountId]);

  const updateCustomerQuery = (value: string) => {
    setCustomerQuery(value);
    setSubmitError("");
    if (
      selectedCustomer &&
      normalizeCustomerSearchText(value) !==
        normalizeCustomerSearchText(customerDisplayName(selectedCustomer))
    ) {
      setSelectedCustomer(null);
    }
    setShowCustomerResults(true);
  };

  const chooseCustomer = (customer: any) => {
    setSelectedCustomer(customer);
    setCustomerQuery(customerDisplayName(customer));
    setShowCustomerResults(false);
    setSubmitError("");
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerQuery("");
    setShowCustomerResults(true);
    setSubmitError("");
  };

  const submitSale = async () => {
    if (paymentMethod === "store_credit" && !selectedCustomer?.id) {
      setSubmitError(
        "Para vender fiado debes buscar y seleccionar un cliente registrado.",
      );
      return;
    }
    if (customerSelectionPending) {
      setSubmitError(
        "Selecciona un cliente de los resultados o limpia el campo para continuar sin asignarlo.",
      );
      return;
    }
    if (needsTransferAccount && !selectedTransferAccount) {
      setSubmitError(
        "Selecciona la cuenta donde se recibirá la transferencia.",
      );
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    try {
      await onConfirm(
        paymentMethod,
        selectedCustomer,
        selectedTransferAccount,
      );
    } catch (error: any) {
      setSubmitError(
        error?.message ||
          "No fue posible registrar la venta. Inténtalo de nuevo.",
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
        className="fixed inset-0 bg-black/50 z-50"
      />
      <motion.div
        initial={{ y: "100%", x: "-50%" }}
        animate={{ y: "-50%", x: "-50%" }}
        exit={{ y: "100%", x: "-50%" }}
        className="fixed top-1/2 left-1/2 w-full max-w-md bg-white rounded-3xl z-50 shadow-2xl overflow-hidden"
        style={{ maxHeight: "90vh" }}
      >
        <div className="p-5 overflow-y-auto max-h-[90vh] scrollbar-hide space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800">Completar Venta</h2>
            <button
              onClick={onClose}
              disabled={submitting}
              className="p-2 rounded-xl bg-gray-100 disabled:opacity-50"
            >
              <FiX className="text-gray-600" />
            </button>
          </div>
          <div className="bg-[#f0fbf8] border border-[#c0ece1] p-4 rounded-2xl text-center">
            <p className="text-sm text-[#00a884] font-medium">Total a cobrar</p>
            <p className="text-4xl font-black text-[#00a884] mt-1">
              RD$ {total.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-600 mb-2">
              Método de Pago
            </p>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method.key}
                  type="button"
                  onClick={() => setPaymentMethod(method.key)}
                  disabled={submitting}
                  className={`py-3 px-4 rounded-xl border font-semibold text-sm transition-all disabled:opacity-60 ${
                    paymentMethod === method.key
                      ? "bg-[#00a884] border-[#00a884] text-white shadow-md"
                      : "bg-white border-gray-200 text-gray-600"
                  }`}
                >
                  {method.label}
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence>
            {needsTransferAccount && (
              <TransferBankAccountSelector
                accounts={transferAccounts}
                selectedId={transferAccountId}
                onSelect={setTransferAccountId}
                bankByName={bankByName}
              />
            )}
          </AnimatePresence>

          <div className="relative">
            <div className="flex items-center justify-between gap-3 mb-2">
              <label className="block text-sm font-semibold text-gray-600">
                Nombre del Cliente
              </label>
              <span
                className={`text-[10px] font-black uppercase tracking-wide ${
                  paymentMethod === "store_credit"
                    ? "text-amber-600"
                    : "text-gray-400"
                }`}
              >
                {paymentMethod === "store_credit" ? "Requerido" : "Opcional"}
              </span>
            </div>
            <div className="relative">
              <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={customerQuery}
                onChange={(event) => updateCustomerQuery(event.target.value)}
                onFocus={() => setShowCustomerResults(true)}
                onBlur={() =>
                  window.setTimeout(() => setShowCustomerResults(false), 150)
                }
                placeholder="Buscar por nombre, apellido, WhatsApp o cédula"
                autoComplete="off"
                disabled={submitting}
                className={`w-full pl-10 ${
                  customerQuery ? "pr-11" : "pr-4"
                } py-3 border rounded-xl focus:outline-none transition-colors disabled:bg-gray-50 ${
                  selectedCustomer
                    ? "border-[#00a884] bg-[#f7fffc] focus:border-[#00a884]"
                    : customerSelectionPending
                      ? "border-amber-300 focus:border-amber-400"
                      : "border-gray-200 focus:border-[#00a884]"
                }`}
              />
              {customerQuery && (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={clearCustomer}
                  disabled={submitting}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200"
                  aria-label="Limpiar cliente"
                >
                  <FiX className="text-sm" />
                </button>
              )}
            </div>
            <p
              className={`mt-1.5 text-[10px] ${
                customerSelectionPending ? "font-bold text-amber-600" : "text-gray-400"
              }`}
            >
              {customerSelectionPending
                ? "Selecciona un cliente de la lista o limpia el campo para continuar."
                : "Busca por nombre, apellido, WhatsApp o cédula para vincular la venta a su historial."}
            </p>

            <AnimatePresence>
              {showCustomerResults && !selectedCustomer && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute left-0 right-0 top-[82px] z-30 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
                >
                  <div className="max-h-56 overflow-y-auto p-1.5 scrollbar-hide">
                    {filteredCustomers.length > 0 ? (
                      filteredCustomers.map((customer: any) => {
                        const name = customerDisplayName(customer);
                        const whatsapp = customerWhatsapp(customer);
                        return (
                          <button
                            key={customer.id}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => chooseCustomer(customer)}
                            className="w-full rounded-xl px-3 py-2.5 text-left hover:bg-[#f0fbf8] transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eafaf1] text-[#00a884]">
                                <FiUser />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-black text-gray-800">
                                  {name || "Cliente sin nombre"}
                                </p>
                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-semibold text-gray-500">
                                  {whatsapp && <span>WhatsApp: {whatsapp}</span>}
                                  {customer.national_id && (
                                    <span>Cédula: {customer.national_id}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-4 py-5 text-center">
                        <p className="text-xs font-bold text-gray-600">
                          No se encontraron clientes
                        </p>
                        <p className="mt-1 text-[10px] text-gray-400">
                          Revisa el nombre, apellido, WhatsApp o cédula.
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {selectedCustomer && (
              <div className="mt-2 rounded-2xl border border-[#bce8d1] bg-[#f0fbf8] px-3 py-2.5">
                <div className="flex items-start gap-2.5">
                  <FiCheckCircle className="mt-0.5 shrink-0 text-[#00a884]" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-gray-800">
                      {customerDisplayName(selectedCustomer)}
                    </p>
                    <p className="mt-0.5 text-[10px] font-semibold text-gray-500">
                      {[
                        customerWhatsapp(selectedCustomer),
                        selectedCustomer.national_id
                          ? `Cédula ${selectedCustomer.national_id}`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {needsTransferAccount &&
            !selectedTransferAccount &&
            transferAccounts.length > 0 && (
              <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-[11px] font-bold text-violet-700 flex items-start gap-2">
                <FiAlertTriangle className="mt-0.5 shrink-0" />
                <span>
                  Selecciona la cuenta donde el cliente hará la transferencia
                  antes de confirmar la venta.
                </span>
              </div>
            )}

          {submitError && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-[11px] font-bold text-red-700 flex items-start gap-2">
              <FiAlertTriangle className="mt-0.5 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-3.5 bg-gray-100 text-gray-700 rounded-2xl font-bold text-sm disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submitSale}
              disabled={
                submitting || !canConfirmCustomer || !canConfirmTransfer
              }
              className="flex-1 py-3.5 bg-[#00a884] text-white rounded-2xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed shadow-lg flex items-center justify-center gap-2"
            >
              {submitting && <FiLoader className="animate-spin" />}
              {submitting ? "Registrando..." : "Confirmar"}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
};

const CashRegister = ({ mode = "local" }: any) => {
  const {
    products,
    cart,
    addToCart,
    setCartItem,
    removeFromCart,
    updateQuantity,
    getCartTotal,
    processSale,
    processAssistedOrder,
    categories,
    bankAccounts = [],
    globalCustomers = [],
    activeStore = {},
    activeStoreId = "",
    deliveryZones = [],
  } = useStore();
  const isAssistedMode = mode === "assisted";
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("");
  const [detailFilter, setDetailFilter] = useState("");
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successDetail, setSuccessDetail] = useState("Pago registrado correctamente");
  const [bankCatalog, setBankCatalog] = useState(FALLBACK_BANKS);
  const [saleSelection, setSaleSelection] = useState<any>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [scannerMessage, setScannerMessage] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .get("/banks")
      .then((data) => {
        const list = Array.isArray(data)
          ? data.filter((bank: any) => bank?.active !== false)
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

  const activeTransferAccounts = useMemo(
    () =>
      (Array.isArray(bankAccounts) ? bankAccounts : [])
        .filter(
          (account: any) =>
            account &&
            account.active !== false &&
            account.bank &&
            account.number,
        )
        .map((account: any) => ({ ...account, id: bankAccountKey(account) })),
    [bankAccounts],
  );
  const bankByName = useMemo(
    () =>
      Object.fromEntries(
        (bankCatalog || []).map((bank: any) => [
          normalizeBankName(bank.name),
          bank,
        ]),
      ),
    [bankCatalog],
  );

  const normalizedCategoryFilter = catFilter === "all" ? "" : catFilter;
  const categoryOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    (Array.isArray(products) ? products : []).forEach((product: any) => {
      const key = getCatalogCategory(product);
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) =>
      a[0].localeCompare(b[0], "es"),
    );
  }, [products]);
  const filtered = useMemo(
    () =>
      filterCatalogProducts(products, {
        search,
        category: normalizedCategoryFilter,
        group: groupFilter,
        detail: detailFilter,
      }),
    [products, search, normalizedCategoryFilter, groupFilter, detailFilter],
  );

  const productsInSelectedCategory = useMemo(
    () =>
      normalizedCategoryFilter
        ? products.filter((product: any) =>
            sameCatalogName(
              getCatalogCategory(product),
              normalizedCategoryFilter,
            ),
          )
        : products,
    [products, normalizedCategoryFilter],
  );
  const groupOptions = useMemo(
    () =>
      uniqueSortedCatalogValues(
        productsInSelectedCategory.map((product: any) =>
          getCatalogGroup(product),
        ),
      ),
    [productsInSelectedCategory],
  );
  const productsInSelectedGroup = useMemo(
    () =>
      groupFilter
        ? productsInSelectedCategory.filter((product: any) =>
            sameCatalogName(getCatalogGroup(product), groupFilter),
          )
        : productsInSelectedCategory,
    [productsInSelectedCategory, groupFilter],
  );
  const detailOptions = useMemo(
    () =>
      uniqueSortedCatalogValues(
        productsInSelectedGroup.map((product: any) =>
          getCatalogDetail(product),
        ),
      ),
    [productsInSelectedGroup],
  );

  const changeCategoryFilter = (category: string) => {
    setCatFilter(category);
    setGroupFilter("");
    setDetailFilter("");
  };

  const changeGroupFilter = (group: string) => {
    setGroupFilter((current) => (sameCatalogName(current, group) ? "" : group));
    setDetailFilter("");
  };

  const changeDetailFilter = (detail: string) => {
    setDetailFilter((current) =>
      sameCatalogName(current, detail) ? "" : detail,
    );
  };

  const openSaleCard = React.useCallback((product: any, initialItem: any = null, source = "catalog") => {
    if (!product) return;
    if (Number(product.stock || 0) <= 0) {
      setScannerMessage("Producto agotado.");
      return;
    }
    setScannerMessage("");
    setSaleSelection({ product, initialItem, source });
  }, []);

  const handleLocalBarcodeDetected = React.useCallback(async (rawBarcode: string) => {
    const barcode = normalizeBarcode(rawBarcode);
    if (!barcode) return;

    setScannerBusy(true);
    setScannerMessage("");
    try {
      const localProduct = (Array.isArray(products) ? products : []).find(
        (product: any) => normalizeBarcode(getCatalogBarcode(product)) === barcode,
      );

      setScannerOpen(false);
      setCatFilter("all");
      setGroupFilter("");
      setDetailFilter("");
      setSearch("");

      if (!localProduct) {
        setScannerMessage("Producto no disponible en este negocio.");
        return;
      }

      if (Number(localProduct.stock || 0) <= 0) {
        setScannerMessage("Producto agotado.");
        return;
      }

      // Escanear abre la misma tarjeta de venta utilizada por el catálogo.
      // El usuario confirma la cantidad antes de agregar el producto.
      openSaleCard(localProduct, null, "scanner");
    } finally {
      setScannerBusy(false);
    }
  }, [openSaleCard, products]);

  const renderProgressiveCatalogFilters = () => {
    const rowClass = "flex gap-2 overflow-x-auto scrollbar-hide pb-1";
    const categoryChipClass = (active: boolean) =>
      `inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
        active
          ? "border-[#00a884] bg-[#00a884] text-white"
          : "border-gray-200 bg-white text-gray-600 hover:border-[#00a884]/40 hover:text-gray-800"
      }`;
    const groupChipClass = (active: boolean) =>
      `inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black transition-colors ${
        active
          ? "border-amber-500 bg-amber-100 text-amber-800"
          : "border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
      }`;
    const detailChipClass = (active: boolean) =>
      `inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black transition-colors ${
        active
          ? "border-orange-500 bg-orange-100 text-orange-800"
          : "border-orange-200 bg-white text-orange-700 hover:bg-orange-50"
      }`;

    if (!normalizedCategoryFilter) {
      return (
        <div className={rowClass}>
          <button
            type="button"
            onClick={() => changeCategoryFilter("all")}
            className={categoryChipClass(catFilter === "all")}
          >
            Todos{" "}
            <span
              className={
                catFilter === "all" ? "text-white/70" : "text-gray-400"
              }
            >
              {products.length}
            </span>
          </button>
          {categoryOptions.map(([cat, count]) => (
            <button
              key={cat}
              type="button"
              onClick={() => changeCategoryFilter(cat)}
              className={categoryChipClass(catFilter === cat)}
            >
              {cat}{" "}
              <span
                className={
                  catFilter === cat ? "text-white/70" : "text-gray-400"
                }
              >
                {count}
              </span>
            </button>
          ))}
        </div>
      );
    }

    if (!groupFilter) {
      return (
        <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-2">
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <p className="text-xs font-black text-amber-700">
              {normalizedCategoryFilter}
            </p>
            <button
              type="button"
              onClick={() => changeCategoryFilter("all")}
              className="shrink-0 rounded-full border border-amber-100 bg-white px-2.5 py-1 text-[10px] font-black text-amber-700"
            >
              ← Volver
            </button>
          </div>
          {groupOptions.length > 0 ? (
            <div className={rowClass}>
              {groupOptions.map((group) => (
                <button
                  key={group}
                  type="button"
                  onClick={() => changeGroupFilter(group)}
                  className={groupChipClass(
                    sameCatalogName(groupFilter, group),
                  )}
                >
                  {group}
                  <span className="text-[9px] opacity-70">
                    {
                      productsInSelectedCategory.filter((product: any) =>
                        sameCatalogName(getCatalogGroup(product), group),
                      ).length
                    }
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="px-1 pb-1 text-xs font-bold text-amber-700/70">
              Esta sección no tiene opciones configuradas.
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-2">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <p className="text-xs font-black text-orange-700">{groupFilter}</p>
          <button
            type="button"
            onClick={() => {
              setGroupFilter("");
              setDetailFilter("");
            }}
            className="shrink-0 rounded-full border border-orange-100 bg-white px-2.5 py-1 text-[10px] font-black text-orange-700"
          >
            ← Atrás
          </button>
        </div>
        {detailOptions.length > 0 ? (
          <div className={rowClass}>
            <button
              type="button"
              onClick={() => setDetailFilter("")}
              className={detailChipClass(!detailFilter)}
            >
              Todos
            </button>
            {detailOptions.map((detail) => (
              <button
                key={detail}
                type="button"
                onClick={() => changeDetailFilter(detail)}
                className={detailChipClass(
                  sameCatalogName(detailFilter, detail),
                )}
              >
                {detail}
                <span className="text-[9px] opacity-70">
                  {
                    productsInSelectedGroup.filter((product: any) =>
                      sameCatalogName(getCatalogDetail(product), detail),
                    ).length
                  }
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="px-1 pb-1 text-xs font-bold text-orange-700/70">
            Esta opción no tiene subopciones configuradas.
          </p>
        )}
      </div>
    );
  };

  const handleConfirm = async (method, customer, transferAccount = null) => {
    const transferNote =
      method === "bank_transfer" && transferAccount
        ? buildTransferSaleNote(transferAccount)
        : "";
    const sale = await processSale(method, customerDisplayName(customer), {
      customerId: customer?.id || "",
      deliveryAddress: transferNote,
      transferAccount,
    });
    if (!sale) {
      throw new Error("No fue posible registrar la venta.");
    }
    setShowCheckout(false);
    setShowCart(false);
    setSuccessDetail("Pago registrado correctamente");
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2500);
  };

  const handleAssistedConfirm = async (payload: any) => {
    const result = await processAssistedOrder(payload);
    if (!result?.sale) {
      throw new Error("No fue posible crear el pedido asistido.");
    }
    setShowCheckout(false);
    setShowCart(false);
    setSuccessDetail(
      result.customerCreated
        ? "Pedido creado y cliente parcial registrado"
        : "Pedido enviado al panel de preparación",
    );
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const ProductGrid = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
      {filtered.map((product) => (
        <motion.button
          whileTap={{ scale: 0.96 }}
          key={product.id}
          data-pos-product-id={product.id}
          onClick={() => product.stock > 0 && openSaleCard(product, null, "catalog")}
          disabled={product.stock === 0}
          className={`p-2.5 lg:p-3 rounded-2xl border text-left flex flex-col h-[205px] lg:h-[286px] transition-all overflow-hidden ${
            product.stock === 0
              ? "bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed"
              : "bg-white border-gray-200 hover:border-[#00a884] hover:shadow-md shadow-sm"
          }`}
        >
          <div className="h-20 sm:h-24 lg:h-36 xl:h-40 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center mb-2 shrink-0">
            <ProductImage product={product} />
          </div>
          <div className="flex-1 min-h-[3.25rem] lg:min-h-[4.25rem]">
            <p className="font-semibold text-gray-800 text-xs sm:text-sm leading-tight line-clamp-2">
              {product.name}
            </p>
            <p className="text-[10px] text-gray-400 mt-1 truncate">
              {product.category}
            </p>
          </div>
          <div className="flex justify-between items-end gap-2 pt-3 mt-auto">
            <span className="font-bold text-[#00a884] text-sm">
              {formatProductPrice(product)}
            </span>
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${product.stock < 5 ? "bg-red-100 text-red-500" : "bg-gray-100 text-gray-400"}`}
            >
              {Number(product.stock).toLocaleString("es-DO", {
                minimumFractionDigits: isWeightedProduct(product) ? 2 : 0,
                maximumFractionDigits: isWeightedProduct(product) ? 2 : 0,
              })}{isWeightedProduct(product) ? getWeightedProductConfig(product).weightUnit : "u"}
            </span>
          </div>
        </motion.button>
      ))}
    </div>
  );

  return (
    <div className="flex bg-[#f8f9fa] overflow-visible lg:h-full lg:overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 overflow-visible lg:overflow-hidden">
        <div className="sticky top-0 z-20 bg-white px-4 py-3 border-b border-gray-100 shrink-0 space-y-3 shadow-sm lg:static lg:z-auto lg:shadow-none">
          <div className="relative flex items-center">
            <FiSearch className="pointer-events-none absolute left-4 text-gray-400 text-lg" />
            <input
              type="text"
              placeholder="Buscar producto por nombre, marca o código..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setScannerMessage("");
              }}
              className="w-full pl-11 pr-24 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#00a884] focus:ring-2 focus:ring-[#00a884]/15 text-sm shadow-sm transition-all"
              aria-label="Buscar productos del catálogo local"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setScannerMessage("");
                }}
                className="absolute right-12 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Limpiar búsqueda"
              >
                <FiX className="text-sm" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setScannerMessage("");
                setScannerOpen(true);
              }}
              className="absolute right-2 flex h-9 w-9 items-center justify-center rounded-xl bg-[#00a884] text-white shadow-sm transition-colors hover:bg-[#009676]"
              aria-label="Escanear código de barras"
              title="Escanear producto del catálogo local"
            >
              <FiCamera className="text-base" />
            </button>
          </div>
          {scannerMessage && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
              <FiAlertTriangle className="shrink-0" />
              <span>{scannerMessage}</span>
            </div>
          )}
          {renderProgressiveCatalogFilters()}
        </div>

        <div className="flex-1 p-3 scrollbar-hide pb-24 lg:pb-4 overflow-visible lg:overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FiShoppingCart className="text-4xl text-gray-300 mb-3" />
              <p className="text-sm text-gray-400 font-medium">
                {products.length === 0
                  ? "No hay productos. Agrégalos desde Catálogo"
                  : "Sin resultados"}
              </p>
            </div>
          ) : (
            <ProductGrid />
          )}
        </div>

        {cart.length > 0 && !showCart && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCart(true)}
            className="fixed bottom-20 right-4 bg-[#00a884] text-white rounded-2xl px-5 py-3.5 shadow-xl flex items-center gap-3 z-20 lg:hidden"
          >
            <FiShoppingCart className="text-lg" />
            <div className="text-left">
              <p className="text-xs font-medium text-white/80">
                {cart.length} items
              </p>
              <p className="text-base font-bold leading-tight">
                RD$ {getCartTotal().toLocaleString()}
              </p>
            </div>
          </motion.button>
        )}
      </div>

      <div className="hidden lg:flex lg:w-80 xl:w-96 shrink-0">
        <div className="w-full flex flex-col">
          <CartPanel
            cart={cart}
            updateQuantity={updateQuantity}
            removeFromCart={removeFromCart}
            onEditItem={(item: any) => openSaleCard(item, item, "cart")}
            getCartTotal={getCartTotal}
            onCheckout={() => setShowCheckout(true)}
            isDesktop={true}
            assisted={isAssistedMode}
          />
        </div>
      </div>

      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-[#00a884] text-white rounded-2xl p-4 shadow-xl flex items-center gap-3 min-w-[260px]"
          >
            <FiCheck className="text-2xl shrink-0" />
            <div>
              <p className="font-bold text-sm">
                {isAssistedMode ? "¡Pedido asistido creado!" : "¡Venta completada!"}
              </p>
              <p className="text-xs text-white/80">{successDetail}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCart && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-30 lg:hidden"
              onClick={() => setShowCart(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-40 lg:hidden"
            >
              <CartPanel
                cart={cart}
                updateQuantity={updateQuantity}
                removeFromCart={removeFromCart}
                onEditItem={(item: any) => openSaleCard(item, item, "cart")}
                getCartTotal={getCartTotal}
                onCheckout={() => {
                  setShowCart(false);
                  setShowCheckout(true);
                }}
                onClose={() => setShowCart(false)}
                isDesktop={false}
                assisted={isAssistedMode}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {saleSelection && (
          <PosProductSaleModal
            product={saleSelection.product}
            initialItem={saleSelection.initialItem}
            onCancel={() => setSaleSelection(null)}
            onConfirm={(item) => {
              if (saleSelection.initialItem) {
                setCartItem(cartItemKey(saleSelection.initialItem), item);
              } else if (isWeightedProduct(saleSelection.product)) {
                addToCart(saleSelection.product, 1, {
                  saleMode: item.saleMode,
                  value:
                    item.saleMode === "amount"
                      ? item.requestedAmount
                      : item.requestedWeight,
                });
              } else {
                addToCart(saleSelection.product, item.quantity || 1);
              }

              const source = saleSelection.source;
              setSaleSelection(null);
              if (source !== "cart") setShowCart(true);
            }}
            confirmLabel={
              saleSelection.initialItem
                ? "Actualizar producto"
                : isAssistedMode
                  ? "Agregar al pedido"
                  : "Agregar a la venta"
            }
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCheckout &&
          (isAssistedMode ? (
            <AssistedOrderModal
              subtotal={getCartTotal()}
              customers={globalCustomers}
              activeStore={activeStore}
              activeStoreId={activeStoreId}
              deliveryZones={
                Array.isArray(deliveryZones) && deliveryZones.length
                  ? deliveryZones
                  : deliveryZones
              }
              transferAccounts={activeTransferAccounts}
              bankByName={bankByName}
              onConfirm={handleAssistedConfirm}
              onClose={() => setShowCheckout(false)}
            />
          ) : (
            <CheckoutModal
              total={getCartTotal()}
              onConfirm={handleConfirm}
              onClose={() => setShowCheckout(false)}
              transferAccounts={activeTransferAccounts}
              bankByName={bankByName}
              customers={globalCustomers}
            />
          ))}
      </AnimatePresence>

      <BarcodeScanner
        open={scannerOpen}
        busy={scannerBusy}
        onClose={() => setScannerOpen(false)}
        onDetected={handleLocalBarcodeDetected}
      />
    </div>
  );
};

export default CashRegister;
