import React, { useCallback, useEffect, useRef, useState } from "react";
import * as FiIcons from "react-icons/fi";
import { useStore } from "../context/StoreContext";
import { formatDateTime, formatTime } from "../lib/timezone";
import { getOrderDisplayNumber } from "../lib/orderNumbers";
import { paymentMethodLabel } from "../lib/paymentMethods";
import { cartItemLineTotal, formatCartItemMeasure } from "../lib/weightedProducts";
import { api } from "../lib/api";
import { motion, AnimatePresence } from "framer-motion";
import MotorcycleIcon from "../common/MotorcycleIcon";
import { cleanOrderAddress } from "../lib/orderAddresses";

const {
  FiClipboard,
  FiPackage,
  FiClock,
  FiLoader,
  FiCheckCircle,
  FiAlertCircle,
  FiShoppingBag,
  FiCreditCard,
  FiMapPin,
  FiExternalLink,
  FiX,
  FiRefreshCw,
  FiSend,
  FiMessageCircle,
  FiPhoneCall,
  FiUserPlus,
  FiUserCheck,
  FiEye,
  FiUser,
  FiHash,
  FiCalendar,
  FiInfo,
} = FiIcons;

const STATUS_LABELS = {
  pending: "Pendiente",
  preparing: "En proceso",
  ready_for_delivery: "Listo para entregar",
  on_the_way: "En camino",
  delivered: "Completado",
  issue: "Problema",
};

const STATUS_COLORS = {
  pending: "bg-amber-100 text-amber-700",
  preparing: "bg-blue-100 text-blue-700",
  ready_for_delivery: "bg-violet-100 text-violet-700",
  on_the_way: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  issue: "bg-red-100 text-red-700",
};

const STATUS_DOT_COLORS = {
  pending: "bg-amber-400",
  preparing: "bg-blue-500",
  ready_for_delivery: "bg-violet-500",
  on_the_way: "bg-purple-500",
  delivered: "bg-green-500",
  issue: "bg-red-500",
};

const KANBAN_COLUMNS = [
  {
    key: "pending",
    label: "Pendiente",
    detail: "Pedidos nuevos",
    icon: FiClock,
  },
  {
    key: "preparing",
    label: "En proceso",
    detail: "Preparación activa",
    icon: FiLoader,
  },
  {
    key: "ready_for_delivery",
    label: "Listo para entregar",
    detail: "Preparado para despacho o recogida",
    icon: FiPackage,
  },
  {
    key: "on_the_way",
    label: "En camino",
    detail: "Entregas en ruta",
    icon: MotorcycleIcon,
  },
  {
    key: "delivered",
    label: "Completado",
    detail: "Pedidos cerrados",
    icon: FiCheckCircle,
  },
  {
    key: "issue",
    label: "Problema",
    detail: "Requieren atención",
    icon: FiAlertCircle,
  },
];

const safeText = (value: any) => String(value || "").trim();

const normalizeStatus = (status: any) => {
  const value = String(status || "pending").toLowerCase();
  if (!KANBAN_COLUMNS.some((column) => column.key === value))
    return "pending";
  return value;
};

const normalizeTextValue = (value: any) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const normalizeOrderMode = (order: any) => {
  const explicit = normalizeTextValue(
    order?.orderMode ||
      order?.order_mode ||
      order?.fulfillmentMode ||
      order?.orderModeLabel ||
      order?.order_mode_label,
  );
  if (explicit === "delivery") return "delivery";
  if (explicit === "pickup") return "pickup";

  const address = normalizeTextValue(
    order?.deliveryAddress ||
      order?.delivery_address ||
      order?.address ||
      order?.address,
  );
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

const orderModeMeta = (order: any) => {
  const mode = normalizeOrderMode(order);
  if (mode === "pickup")
    return {
      key: "pickup",
      label: "Recogida local",
      shortLabel: "Recogida",
      icon: FiShoppingBag,
      tone: "bg-violet-50 text-violet-700 border-violet-100",
    };
  if (mode === "delivery")
    return {
      key: "delivery",
      label: "Entrega a domicilio",
      shortLabel: "Entrega",
      icon: MotorcycleIcon,
      tone: "bg-[#f0fbf8] text-[#00a884] border-[#c0ece1]",
    };
  return {
    key: "",
    label: "Modalidad pendiente",
    shortLabel: "Modalidad",
    icon: FiClipboard,
    tone: "bg-gray-50 text-gray-500 border-gray-100",
  };
};

const orderSourceMeta = (order: any) => {
  const explicit = normalizeTextValue(
    order?.orderSource || order?.order_source || order?.sourceChannel || order?.source_channel,
  );
  const raw = normalizeTextValue(
    order?.deliveryAddress || order?.delivery_address || order?.address || "",
  );
  const assisted =
    explicit === "assisted" ||
    explicit === "whatsapp" ||
    explicit === "phone" ||
    explicit === "other" ||
    raw.includes("origen: pedido asistido");
  if (!assisted) return null;
  const isPhone = explicit === "phone" || raw.includes("canal: llamada");
  const isOther = explicit === "other" || raw.includes("canal: otro");
  return {
    key: isPhone ? "phone" : isOther ? "other" : "whatsapp",
    label: isPhone ? "Pedido por llamada" : isOther ? "Pedido asistido" : "Pedido por WhatsApp",
    icon: isPhone ? FiPhoneCall : isOther ? FiClipboard : FiMessageCircle,
    tone: isPhone
      ? "bg-blue-50 text-blue-700 border-blue-100"
      : isOther
        ? "bg-gray-50 text-gray-600 border-gray-200"
        : "bg-emerald-50 text-emerald-700 border-emerald-100",
  };
};

const assistedOrderNote = (order: any) => {
  const raw = String(
    order?.deliveryAddress || order?.delivery_address || order?.address || "",
  );
  const match = raw.match(/(?:^|\s·\s)Nota\s*:\s*(.*)$/i);
  return match ? safeText(match[1]) : "";
};

const isDeliveryOrder = (order: any) =>
  normalizeOrderMode(order) === "delivery";
const isPickupOrder = (order: any) => normalizeOrderMode(order) === "pickup";

const orderStatusLabel = (order: any, status = normalizeStatus(order?.status)) => {
  if (status === "ready_for_delivery" && isPickupOrder(order)) return "Listo";
  return STATUS_LABELS[status] || "Pendiente";
};

const nextStatusAction = (order: any) => {
  const normalized = normalizeStatus(order?.status || order);
  if (normalized === "pending")
    return { label: "Pasar a proceso", status: "preparing" };
  if (normalized === "preparing") {
    return isPickupOrder(order)
      ? { label: "Marcar listo", status: "ready_for_delivery" }
      : { label: "Marcar listo para entregar", status: "ready_for_delivery" };
  }
  return null;
};

const canMoveOrderToStatus = (order: any, status: any) => {
  const current = normalizeStatus(order?.status);
  const target = normalizeStatus(status);
  if (current === target) return true;
  if (current === "issue") return false;
  if (target === "issue") return current !== "delivered";
  if (target === "pending") return current === "pending";
  if (target === "preparing") return ["pending", "preparing"].includes(current);
  if (target === "ready_for_delivery") {
    return ["delivery", "pickup"].includes(normalizeOrderMode(order)) && ["preparing", "ready_for_delivery"].includes(current);
  }
  if (target === "delivered") {
    return current === "delivered";
  }
  return false;
};

const customerAddressLine = (client: any) =>
  [
    client?.province,
    client?.municipality,
    client?.sector || client?.neighborhood,
    client?.street
      ? `${client.street}${client.street_number ? ` #${client.street_number}` : ""}`
      : "",
    client?.address_reference,
  ]
    .filter(Boolean)
    .join(", ");

const findOrderCustomer = (sale: any, customerList: any[]) => {
  const saleCustomerId = safeText(sale?.customerId || sale?.customer_id);
  const saleCustomerName = safeText(sale?.customer).toLowerCase();

  return (
    customerList.find((client) => safeText(client?.id) === saleCustomerId) ||
    customerList.find(
      (client) =>
        saleCustomerName &&
        safeText(client?.name).toLowerCase() === saleCustomerName,
    ) ||
    null
  );
};

const extractGpsCoordinates = (value: any) => {
  const match = String(value || "").match(
    /GPS\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i,
  );
  return match ? { lat: match[1], lng: match[2] } : null;
};

const extractDeliveryCost = (value: any) => {
  const match = String(value || "").match(/Entrega\s*:\s*RD\$?\s*([0-9.,]+)/i);
  if (!match) return 0;
  const parsed = Number(String(match[1]).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const orderRawAddress = (order: any) =>
  safeText(
    order?.deliveryAddress ||
      order?.delivery_address ||
      order?.address ||
      order?.address,
  );

const orderAddressLine = (order: any) => {
  const explicitAddress = cleanOrderAddress(orderRawAddress(order));
  const customerAddress = customerAddressLine(order?.customerRecord);
  return explicitAddress || customerAddress;
};

const orderCoordinates = (order: any) => {
  const explicitCoords = extractGpsCoordinates(orderRawAddress(order));
  if (explicitCoords) return explicitCoords;
  const customer = order?.customerRecord || {};
  const lat = safeText(
    order?.lat || order?.latitude || customer?.lat || customer?.latitude,
  );
  const lng = safeText(
    order?.lng || order?.longitude || customer?.lng || customer?.longitude,
  );
  return lat && lng ? { lat, lng } : null;
};

const orderMapQuery = (order: any) => {
  const coords = orderCoordinates(order);
  if (coords) return `${coords.lat},${coords.lng}`;
  return orderAddressLine(order);
};

const orderLocationLabel = (order: any) => {
  const coords = orderCoordinates(order);
  if (coords) return `${coords.lat}, ${coords.lng}`;
  return orderAddressLine(order);
};

const canOpenOrderMap = (order: any) =>
  isDeliveryOrder(order) && Boolean(orderMapQuery(order));

const numberFromAny = (value: any) => {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const transferInfo = (order: any) => {
  const raw = orderRawAddress(order);
  const match = raw.match(
    /Transferencia\s*:\s*([^·]+?)\s*·\s*Cuenta\s*([^·]+?)\s*·\s*Titular\s*([^·]+?)(?=\s*·|$)/i,
  );
  if (!match) return null;
  return {
    bank: safeText(match[1]),
    number: safeText(match[2]),
    holder: safeText(match[3]),
  };
};

const cashChangeInfo = (order: any) => {
  const raw = orderRawAddress(order);
  const explicitAnswered =
    order.cashChangeAnswered ??
    order.cash_change_answered ??
    order.cashChangeAnswered;
  const answered =
    explicitAnswered === true ||
    explicitAnswered === "true" ||
    /Cambio\s*:/i.test(raw);
  if (!answered) return { answered: false, needed: false, from: 0, amount: 0 };

  const explicitNeeded = order.cashChangeNeeded ?? order.cash_change_needed;
  const needed =
    explicitNeeded === true ||
    explicitNeeded === "true" ||
    /requiere vuelto/i.test(raw);
  const fromMatch = raw.match(
    /Cambio\s*:\s*requiere vuelto de RD\$?\s*([0-9.,]+)/i,
  );
  const amountMatch = raw.match(/vuelto RD\$?\s*([0-9.,]+)/i);
  const from = numberFromAny(
    order.cashChangeFrom ?? order.cash_change_from ?? fromMatch?.[1] ?? 0,
  );
  const amount = numberFromAny(
    order.cashChangeAmount ??
      order.cash_change_amount ??
      amountMatch?.[1] ??
      0,
  );
  return { answered: true, needed, from, amount };
};

const orderCustomerRecord = (order: any = {}) => order.customerRecord || order.customer_record || {};

const orderCustomerName = (order: any = {}) => {
  const customer = orderCustomerRecord(order);
  return safeText(
    order.customer ||
      customer.name ||
      `${customer.first_name || customer.firstName || ""} ${customer.last_name || customer.lastName || ""}`,
  ) || "Cliente";
};

const orderCustomerPhone = (order: any = {}) => {
  const customer = orderCustomerRecord(order);
  return safeText(
    order.customerPhone ||
      order.customer_phone ||
      order.customerWhatsapp ||
      order.customer_whatsapp ||
      customer.whatsappDisplay ||
      customer.whatsapp_display ||
      customer.whatsapp ||
      customer.phone,
  );
};

const orderCustomerNationalID = (order: any = {}) => {
  const customer = orderCustomerRecord(order);
  return safeText(
    order.customerNationalId ||
      order.customer_national_id ||
      customer.national_id ||
      customer.nationalId ||
      customer.cedula,
  );
};

const orderAssignedDriverName = (order: any = {}) => {
  const driver = order.assignedDriver || order.assigned_driver || {};
  return safeText(driver.full_name || driver.name || order.assignedDriverName || order.assigned_driver_name);
};

const phoneDigits = (value: any) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) return `1${digits}`;
  return digits;
};

const DetailItem = ({ icon: Icon, label, value, children }: any) => (
  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-gray-400">
      {Icon && <Icon className="text-[#00a884]" />}
      <span>{label}</span>
    </div>
    {children || <p className="mt-1.5 break-words text-xs font-bold text-gray-800">{value || "No disponible"}</p>}
  </div>
);

const OrderSummary = ({ order: order, onOpenLocation, onOpenDetails, onAssign, automaticAssignment = false, allowManualAssignment = true }: any) => {
  const items = Array.isArray(order.items) ? order.items : [];
  const previewItems = items.slice(0, 2);
  const hasLocation = canOpenOrderMap(order);
  const paymentMethod = order.method || order.paymentMethod || "Pago";
  const change = cashChangeInfo(order);
  const transfer = transferInfo(order);
  const isTransferPayment =
    normalizeTextValue(paymentMethod).includes("transfer");
  const orderNumber = getOrderDisplayNumber(order);
  const showChangeInfo =
    isDeliveryOrder(order) &&
    paymentMethod === "cash" &&
    change.answered;

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-black text-gray-800 truncate">
              {order.customer || order.method || "Cliente"}
            </p>
            <span className="shrink-0 rounded-full bg-[#f0fbf8] border border-[#c0ece1] px-2 py-0.5 text-[9px] font-black text-[#00a884]">
              {orderNumber}
            </span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {order.displayDate} · {items.length} producto(s)
          </p>
        </div>
        <span
          className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-600"}`}
        >
          {order.statusLabel}
        </span>
      </div>

      {previewItems.length > 0 && (
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-2 space-y-1">
          {previewItems.map((item, index) => (
            <div
              key={`${order.id}-${item.id || item.name || index}`}
              className="flex items-center justify-between gap-2 text-[10px] text-gray-500"
            >
              <span className="truncate">{item.name || "Producto"}</span>
              <span className="font-black text-gray-600 shrink-0">
                {formatCartItemMeasure(item)}
              </span>
            </div>
          ))}
          {items.length > previewItems.length && (
            <p className="text-[10px] font-bold text-gray-400">
              +{items.length - previewItems.length} producto(s) más
            </p>
          )}
        </div>
      )}

      {(() => {
        const mode = orderModeMeta(order);
        const ModeIcon = mode.icon;
        const deliveryCost = Number(
          order.deliveryCost ||
            order.delivery_cost ||
            extractDeliveryCost(orderRawAddress(order)) ||
            0,
        );
        return (
          <div
            className={`inline-flex max-w-full items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[10px] font-black ${mode.tone}`}
          >
            <ModeIcon className="text-xs shrink-0" />
            <span className="truncate">{mode.label}</span>
            {mode.key === "delivery" && deliveryCost > 0 && (
              <span className="shrink-0 opacity-80">
                · RD$ {Number(deliveryCost).toLocaleString()}
              </span>
            )}
          </div>
        );
      })()}

      {(() => {
        const source = orderSourceMeta(order);
        if (!source) return null;
        const SourceIcon = source.icon;
        return (
          <div className={`inline-flex max-w-full items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[10px] font-black ${source.tone}`}>
            <SourceIcon className="shrink-0 text-xs" />
            <span className="truncate">{source.label}</span>
          </div>
        );
      })()}

      {assistedOrderNote(order) && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-2.5 py-2 text-[10px] font-bold text-amber-700">
          Nota: {assistedOrderNote(order)}
        </div>
      )}

      {isDeliveryOrder(order) && order.status === "ready_for_delivery" && (
        <div className="rounded-xl border border-violet-100 bg-violet-50 px-2.5 py-2">
          {order.assignedDriver || order.assigned_driver ? (
            <div className="flex items-center justify-between gap-2 text-[10px] font-black text-violet-700">
              <span className="inline-flex items-center gap-1.5"><FiUserCheck /> Asignado a {(order.assignedDriver || order.assigned_driver)?.full_name || (order.assignedDriver || order.assigned_driver)?.name || "Repartidor"}</span>
              {allowManualAssignment && (
                <button type="button" onClick={(event) => { event.stopPropagation(); onAssign?.(order); }} className="underline">Cambiar</button>
              )}
            </div>
          ) : automaticAssignment ? (
            <div className="w-full inline-flex items-center justify-center gap-1.5 text-[10px] font-black text-violet-700">
              <FiLoader className="animate-spin" /> Asignando automáticamente
            </div>
          ) : (
            <button type="button" onClick={(event) => { event.stopPropagation(); onAssign?.(order); }} className="w-full inline-flex items-center justify-center gap-1.5 text-[10px] font-black text-violet-700">
              <FiUserPlus /> Asignar repartidor
            </button>
          )}
        </div>
      )}

      <div className={`grid gap-2 ${hasLocation ? "grid-cols-2" : "grid-cols-1"}`}>
        <button
          type="button"
          draggable={false}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenDetails?.(order);
          }}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-[11px] font-black text-gray-600 hover:bg-gray-100 transition-colors"
          title="Ver detalles del pedido"
        >
          <FiEye className="text-xs" /> Ver detalles
        </button>
        {hasLocation && (
          <button
            type="button"
            draggable={false}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenLocation?.(order);
            }}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 border border-blue-100 px-3 py-2 text-[11px] font-black text-blue-600 hover:bg-blue-100 transition-colors"
            title="Ver ubicación del cliente"
          >
            <FiMapPin className="text-xs" /> Ver ubicación
          </button>
        )}
      </div>

      <div className="space-y-1 pt-1">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 font-semibold">
            <FiCreditCard className="text-gray-400" /> {paymentMethodLabel(paymentMethod)}
          </span>
          <span className="text-sm font-black text-[#00a884]">
            RD$ {Number(order.total || 0).toLocaleString()}
          </span>
        </div>
        {isTransferPayment && transfer && (
          <div className="w-full rounded-xl border border-violet-100 bg-violet-50 px-2.5 py-2 text-[10px] font-black leading-tight text-violet-700">
            <div className="flex items-start gap-1.5">
              <FiSend className="mt-0.5 text-xs shrink-0" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="whitespace-normal break-words">{transfer.bank}</p>
                <p className="whitespace-normal break-words text-[9px] font-extrabold opacity-90">
                  Cuenta {transfer.number} · {transfer.holder}
                </p>
              </div>
            </div>
          </div>
        )}
        {showChangeInfo && (
          <div
            className={`w-full rounded-xl border px-2.5 py-2 text-[10px] font-black leading-tight ${
              change.needed
                ? "bg-amber-50 text-amber-700 border-amber-100"
                : "bg-emerald-50 text-[#00a884] border-emerald-100"
            }`}
          >
            <div className="flex items-start gap-1.5">
              <FiRefreshCw className="mt-0.5 text-xs shrink-0" />
              <div className="min-w-0 flex-1 space-y-0.5">
                {change.needed ? (
                  <>
                    <p className="whitespace-normal break-words">
                      Requiere vuelto · pagará con RD${" "}
                      {Number(change.from).toLocaleString()}
                    </p>
                    <p className="whitespace-normal break-words text-[9px] font-extrabold opacity-90">
                      Cambio a preparar RD${" "}
                      {Number(change.amount).toLocaleString()}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="whitespace-normal break-words">
                      No necesita vuelto
                    </p>
                    <p className="whitespace-normal break-words text-[9px] font-extrabold opacity-90">
                      Pagará el monto exacto
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const MobileOrderCard = ({
  order: order,
  updateOrderStatus,
  onOpenLocation,
  onOpenDetails,
  onAssign,
  automaticAssignment,
  allowManualAssignment,
}: any) => {
  const action = nextStatusAction(order);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <OrderSummary order={order} onOpenLocation={onOpenLocation} onOpenDetails={onOpenDetails} onAssign={onAssign} automaticAssignment={automaticAssignment} allowManualAssignment={allowManualAssignment} />
      {normalizeStatus(order.status) !== "delivered" && (
        <div className="flex gap-2 pt-3 mt-3 border-t border-gray-100">
          {action && (
            <button
              onClick={() => updateOrderStatus(order.id, action.status)}
              className="flex-1 py-2 rounded-xl bg-[#00a884] text-white text-[11px] font-bold"
            >
              {action.label}
            </button>
          )}
          {normalizeStatus(order.status) !== "issue" ? (
            <button
              onClick={() => updateOrderStatus(order.id, "issue")}
              className="px-3 py-2 rounded-xl bg-red-50 text-red-600 text-[11px] font-bold"
            >
              Problema
            </button>
          ) : (
            <div className="flex-1 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-center text-[10px] font-bold text-red-600">
              Resuelve la incidencia desde Ventas y devoluciones
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const KanbanOrderCard = ({
  order: order,
  onDragStart,
  onDragEnd,
  onOpenLocation,
  onOpenDetails,
  onAssign,
  automaticAssignment,
  allowManualAssignment,
}: any) => (
  <div
    draggable
    onDragStart={(event) => onDragStart(event, order.id)}
    onDragEnd={onDragEnd}
    className="bg-white rounded-2xl border border-gray-200 p-3 shadow-sm hover:border-[#00a884]/50 hover:shadow-md transition-all cursor-grab active:cursor-grabbing"
  >
    <OrderSummary order={order} onOpenLocation={onOpenLocation} onOpenDetails={onOpenDetails} onAssign={onAssign} automaticAssignment={automaticAssignment} allowManualAssignment={allowManualAssignment} />
  </div>
);

const EmptyColumn = () => (
  <div className="flex flex-1 min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white/55 text-center px-4">
    <div>
      <FiClipboard className="mx-auto text-2xl text-gray-300 mb-2" />
      <p className="text-[11px] font-bold text-gray-400">No hay pedidos aquí</p>
    </div>
  </div>
);

const OrderLocationModal = ({ order: order, onClose }: any) => {
  if (!order) return null;
  const query = orderMapQuery(order);
  const address = orderAddressLine(order) || "Dirección no disponible";
  const locationLabel = orderLocationLabel(order) || address;

  return (
    <AnimatePresence>
      {order && (
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
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="pointer-events-auto w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[min(75vh,calc(100vh-2rem))]"
            >
              <div className="p-4 border-b border-gray-100 flex justify-between items-start shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center shrink-0">
                    <FiMapPin />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-black text-gray-900 truncate">
                      {order.customer || "Cliente"}
                    </h2>
                    <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                      {address}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-700 p-1 shrink-0"
                >
                  <FiX className="text-xl" />
                </button>
              </div>

              <div className="flex-1 bg-gray-100 relative w-full">
                <iframe
                  title={`Ubicación de ${order.customer || "cliente"}`}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  loading="lazy"
                  allowFullScreen
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(query)}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
                />
              </div>

              <div className="p-4 bg-white border-t border-gray-100 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 shrink-0">
                <div className="flex items-center gap-2 text-[11px] text-gray-500 font-medium min-w-0">
                  <FiMapPin className="text-blue-500 shrink-0" />
                  <span className="truncate">{locationLabel}</span>
                </div>
                <a
                  href={`https://www.google.com/maps?q=${encodeURIComponent(query)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#1a73e8] text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-[#1557b0] transition-colors shadow-sm shrink-0"
                >
                  <FiExternalLink className="text-sm" /> Abrir en Google Maps
                </a>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

const OrderDetailsModal = ({ order, onClose }: any) => {
  if (!order) return null;

  const items = Array.isArray(order.items) ? order.items : [];
  const mode = orderModeMeta(order);
  const ModeIcon = mode.icon;
  const source = orderSourceMeta(order);
  const SourceIcon = source?.icon;
  const customerName = orderCustomerName(order);
  const customerPhone = orderCustomerPhone(order);
  const customerNationalID = orderCustomerNationalID(order);
  const contactDigits = phoneDigits(customerPhone);
  const address = orderAddressLine(order) || (mode.key === "pickup" ? "Dirección del negocio no disponible" : "Dirección del cliente no disponible");
  const paymentMethod = order.method || order.paymentMethod || "";
  const change = cashChangeInfo(order);
  const transfer = transferInfo(order);
  const note = assistedOrderNote(order);
  const assignedDriver = orderAssignedDriverName(order);
  const deliveryCost = Number(order.deliveryCost || order.delivery_cost || extractDeliveryCost(orderRawAddress(order)) || 0);
  const subtotal = Math.max(0, Number(order.subtotal || order.sub_total || Number(order.total || 0) - deliveryCost));
  const orderNumber = getOrderDisplayNumber(order);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 18 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="pointer-events-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eafaf1] text-[#00a884]">
                <FiInfo className="text-lg" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-black text-gray-900">Detalles del pedido</h2>
                  <span className="rounded-full border border-[#c0ece1] bg-[#f0fbf8] px-2 py-0.5 text-[10px] font-black text-[#00a884]">{orderNumber}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-500">{customerName} · {order.statusLabel || orderStatusLabel(order)}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200">
              <FiX />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            <section>
              <h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Cliente</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <DetailItem icon={FiUser} label="Nombre" value={customerName} />
                <DetailItem icon={FiHash} label="Cédula" value={customerNationalID} />
                <DetailItem icon={FiPhoneCall} label="WhatsApp / teléfono">
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 break-words text-xs font-bold text-gray-800">{customerPhone || "No disponible"}</p>
                    {contactDigits && (
                      <div className="flex gap-1.5">
                        <a href={`tel:+${contactDigits}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600" title="Llamar al cliente"><FiPhoneCall /></a>
                        <a href={`https://wa.me/${contactDigits}`} target="_blank" rel="noopener noreferrer" className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-[#00a884]" title="Escribir por WhatsApp"><FiMessageCircle /></a>
                      </div>
                    )}
                  </div>
                </DetailItem>
                <DetailItem icon={FiCalendar} label="Fecha y hora" value={formatDateTime(order.date)} />
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Pedido</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <DetailItem icon={ModeIcon} label="Modalidad de pedido" value={mode.label} />
                <DetailItem icon={FiCreditCard} label="Método de pago" value={paymentMethodLabel(paymentMethod)} />
                <div className="sm:col-span-2">
                  <DetailItem icon={FiMapPin} label={mode.key === "pickup" ? "Dirección de recogida" : "Dirección de entrega"} value={address} />
                </div>
                {source && SourceIcon && <DetailItem icon={SourceIcon} label="Origen del pedido" value={source.label} />}
                {assignedDriver && <DetailItem icon={MotorcycleIcon} label="Repartidor asignado" value={assignedDriver} />}
              </div>
            </section>

            {(transfer || change.answered || note) && (
              <section>
                <h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Indicaciones</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {transfer && (
                    <DetailItem icon={FiSend} label="Transferencia">
                      <div className="mt-1.5 space-y-1 text-xs font-bold text-gray-800">
                        <p>{transfer.bank}</p>
                        <p className="text-[11px] text-gray-500">Cuenta {transfer.number}</p>
                        <p className="text-[11px] text-gray-500">Titular {transfer.holder}</p>
                      </div>
                    </DetailItem>
                  )}
                  {change.answered && (
                    <DetailItem icon={FiRefreshCw} label="Cambio en efectivo">
                      <div className="mt-1.5 text-xs font-bold text-gray-800">
                        {change.needed ? (
                          <>
                            <p>Pagará con RD$ {Number(change.from).toLocaleString()}</p>
                            <p className="mt-1 text-[11px] text-amber-700">Preparar RD$ {Number(change.amount).toLocaleString()} de vuelto</p>
                          </>
                        ) : <p>Pagará el monto exacto</p>}
                      </div>
                    </DetailItem>
                  )}
                  {note && <div className="sm:col-span-2"><DetailItem icon={FiClipboard} label="Nota del pedido" value={note} /></div>}
                </div>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Productos</h3>
              <div className="overflow-hidden rounded-2xl border border-gray-100">
                <div className="divide-y divide-gray-100">
                  {items.map((item: any, index: number) => (
                    <div key={`${item.id || item.name || index}`} className="flex items-center justify-between gap-3 bg-white px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-gray-800">{item.name || "Producto"}</p>
                        <p className="mt-0.5 text-[10px] font-semibold text-gray-400">{formatCartItemMeasure(item)}</p>
                      </div>
                      <p className="shrink-0 text-xs font-black text-gray-800">RD$ {Number(cartItemLineTotal(item)).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-1 border-t border-gray-100 bg-gray-50 px-3 py-3 text-xs">
                  <div className="flex justify-between text-gray-500"><span>Subtotal</span><span className="font-bold">RD$ {subtotal.toLocaleString()}</span></div>
                  {mode.key === "delivery" && <div className="flex justify-between text-gray-500"><span>Entrega</span><span className="font-bold">RD$ {deliveryCost.toLocaleString()}</span></div>}
                  <div className="flex justify-between border-t border-gray-200 pt-2 font-black text-gray-900"><span>Total</span><span className="text-[#00a884]">RD$ {Number(order.total || 0).toLocaleString()}</span></div>
                </div>
              </div>
            </section>
          </div>

          <div className="shrink-0 border-t border-gray-100 bg-white p-4">
            <button type="button" onClick={onClose} className="w-full rounded-xl bg-[#00a884] py-3 text-sm font-black text-white">Cerrar</button>
          </div>
        </motion.div>
      </div>
    </>
  );
};

const Orders = ({ embedded = false }) => {
  const {
    sales,
    updateOrderStatus,
    assignDeliveryOrder,
    customers = [],
    globalCustomers = [],
  } = useStore();
  const [activeTab, setActiveTab] = useState("all");
  const [draggedOrderId, setDraggedOrderId] = useState("");
  const [dropTarget, setDropTarget] = useState("");
  const [locationModalOrder, setLocationModalOrder] = useState(null);
  const [detailsModalOrder, setDetailsModalOrder] = useState(null);
  const [statusNotice, setStatusNotice] = useState("");
  const [deliveryDrivers, setDeliveryDrivers] = useState<any[]>([]);
  const [assignmentOrder, setAssignmentOrder] = useState<any>(null);
  const [assignmentDriverId, setAssignmentDriverId] = useState("");
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const automaticAssignmentInFlight = useRef(new Set<string>());

  const loadDeliveryDrivers = useCallback(async () => {
    try {
      const items = await api.get("/delivery/drivers");
      setDeliveryDrivers(Array.isArray(items) ? items : []);
    } catch (_) {
      setDeliveryDrivers([]);
    }
  }, []);

  useEffect(() => {
    loadDeliveryDrivers();
  }, [loadDeliveryDrivers]);

  const openAssignment = async (order: any) => {
    setAssignmentOrder(order);
    setAssignmentDriverId(order?.assignedDriverId || order?.assigned_driver_id || "");
    await loadDeliveryDrivers();
  };

  const confirmAssignment = async () => {
    if (!assignmentOrder || !assignmentDriverId) return;
    setAssignmentBusy(true);
    setStatusNotice("");
    try {
      await assignDeliveryOrder(assignmentOrder.id, assignmentDriverId);
      await loadDeliveryDrivers();
      setAssignmentOrder(null);
      setAssignmentDriverId("");
    } catch (error: any) {
      setStatusNotice(error?.message || "No se pudo asignar el repartidor");
    } finally {
      setAssignmentBusy(false);
    }
  };
  const tabs = [
    { key: "all", label: "Todos" },
    ...KANBAN_COLUMNS.map(({ key, label }) => ({ key, label })),
  ];
  const customerList =
    Array.isArray(customers) && customers.length
      ? customers
      : Array.isArray(globalCustomers)
        ? globalCustomers
        : [];

  const orders = sales
    .filter((s) => (
      (s.orderType || s.order_type) === "customer" &&
      String(s.status || "").trim().toLowerCase() !== "cancelled"
    ))
    .map((s) => {
      const status = normalizeStatus(s.status);
      const customerRecord = findOrderCustomer(s, customerList);
      return {
        ...s,
        status,
        customerRecord,
        statusLabel: orderStatusLabel(s, status),
        displayDate: formatTime(s.date, {
          hour: "2-digit",
          minute: "2-digit",
        }),
        method: s.method || s.paymentMethod,
        deliveryAddress:
          s.deliveryAddress || s.delivery_address || s.address || "",
        orderMode: s.orderMode || s.order_mode || normalizeOrderMode(s),
        order_mode: s.order_mode || s.orderMode || normalizeOrderMode(s),
        deliveryCost: Number(
          s.deliveryCost ||
            s.delivery_cost ||
            extractDeliveryCost(
              s.deliveryAddress || s.delivery_address || s.address,
            ) ||
            0,
        ),
        delivery_cost: Number(
          s.delivery_cost ||
            s.deliveryCost ||
            extractDeliveryCost(
              s.deliveryAddress || s.delivery_address || s.address,
            ) ||
            0,
        ),
        cashChangeAnswered: s.cashChangeAnswered ?? s.cash_change_answered,
        cash_change_answered: s.cash_change_answered ?? s.cashChangeAnswered,
        cashChangeNeeded: s.cashChangeNeeded ?? s.cash_change_needed,
        cash_change_needed: s.cash_change_needed ?? s.cashChangeNeeded,
        cashChangeFrom: s.cashChangeFrom ?? s.cash_change_from,
        cash_change_from: s.cash_change_from ?? s.cashChangeFrom,
        cashChangeAmount: s.cashChangeAmount ?? s.cash_change_amount,
        cash_change_amount: s.cash_change_amount ?? s.cashChangeAmount,
        items: Array.isArray(s.items) ? s.items : [],
      };
    });

  const activeDeliveryDrivers = deliveryDrivers.filter((driver) => driver.active);

  useEffect(() => {
    const activeDrivers = deliveryDrivers.filter((driver) => driver.active);
    if (activeDrivers.length !== 1) return;

    const driverId = String(activeDrivers[0]?.id || "").trim();
    if (!driverId) return;

    const candidates = (Array.isArray(sales) ? sales : []).filter((sale: any) => {
      const isCustomerOrder = (sale.orderType || sale.order_type) === "customer";
      const isReady = normalizeStatus(sale.status) === "ready_for_delivery";
      const isUnassigned = !(sale.assignedDriverId || sale.assigned_driver_id || sale.assignedDriver || sale.assigned_driver);
      return isCustomerOrder && isReady && isDeliveryOrder(sale) && isUnassigned;
    });

    candidates.forEach((sale: any) => {
      const orderId = String(sale.id || "").trim();
      if (!orderId || automaticAssignmentInFlight.current.has(orderId)) return;
      automaticAssignmentInFlight.current.add(orderId);
      assignDeliveryOrder(orderId, driverId)
        .catch((error: any) => {
          setStatusNotice(error?.message || "No se pudo realizar la asignación automática");
        })
        .finally(() => {
          automaticAssignmentInFlight.current.delete(orderId);
        });
    });
  }, [assignDeliveryOrder, deliveryDrivers, sales]);

  const filtered =
    activeTab === "all"
      ? orders
      : orders.filter((order) => order.status === activeTab);

  const handleDragStart = (event, orderId) => {
    setStatusNotice("");
    setDraggedOrderId(orderId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", orderId);
  };

  const handleDragEnd = () => {
    setDraggedOrderId("");
    setDropTarget("");
  };

  const handleDrop = async (event, status) => {
    event.preventDefault();
    const orderId = draggedOrderId || event.dataTransfer.getData("text/plain");
    setDropTarget("");
    setDraggedOrderId("");
    if (!orderId) return;

    const order = orders.find((item) => item.id === orderId);
    if (!order || normalizeStatus(order.status) === status) return;
    if (!canMoveOrderToStatus(order, status)) {
      if (normalizeStatus(order.status) === "issue") {
        setStatusNotice("Este pedido tiene una incidencia abierta. Resuélvela desde Ventas y devoluciones para retomar, reasignar, reemplazar o cancelar el pedido de forma segura.");
      } else {
        setStatusNotice(isDeliveryOrder(order)
          ? "Las entregas deben pasar por Listo para entregar. Si existe un solo repartidor activo, se asignará automáticamente; con varios repartidores, selecciónalo antes de completar la entrega desde su panel."
          : "Los pedidos de recogida pasan por Listo. El cliente confirma la recogida desde su pedido cuando lo recibe en el negocio.");
      }
      return;
    }
    setStatusNotice("");
    try {
      await updateOrderStatus(orderId, status);
    } catch (caught: any) {
      setStatusNotice(caught?.message || "No se pudo cambiar el estado del pedido");
    }
  };

  return (
    <div className="flex flex-col min-h-full bg-[#f8f9fa] lg:h-full lg:min-h-0">
      <div className="bg-white px-4 py-4 border-b border-gray-100 lg:hidden">
        {!embedded && (
          <h2 className="text-lg font-bold text-gray-800 mb-4">Pedidos</h2>
        )}
        <div className="flex space-x-2 overflow-x-auto scrollbar-hide pb-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
                activeTab === key
                  ? "bg-[#00a884] border-[#00a884] text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {statusNotice && (
        <div className="mx-4 mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
          {statusNotice}
        </div>
      )}

      <div className="flex-1 min-h-0 p-4 space-y-3 pb-4 overflow-visible lg:overflow-hidden lg:space-y-0">
        <div className="lg:hidden space-y-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4 border border-gray-200">
                <FiClipboard className="text-3xl text-gray-400" />
              </div>
              <p className="text-sm text-gray-400 font-medium">
                No hay pedidos aquí
              </p>
            </div>
          ) : (
            filtered.map((order) => (
              <MobileOrderCard
                key={order.id}
                order={order}
                updateOrderStatus={updateOrderStatus}
                onOpenLocation={setLocationModalOrder}
                onOpenDetails={setDetailsModalOrder}
                onAssign={openAssignment}
                automaticAssignment={activeDeliveryDrivers.length === 1}
                allowManualAssignment={activeDeliveryDrivers.length > 1}
              />
            ))
          )}
        </div>

        <div className="hidden lg:grid grid-cols-6 gap-3 h-full min-h-0">
          {KANBAN_COLUMNS.map((column) => {
            const Icon = column.icon;
            const columnOrders = orders.filter(
              (order) => normalizeStatus(order.status) === column.key,
            );
            const activeDrop = dropTarget === column.key;

            return (
              <section
                key={column.key}
                onDragOver={(event) => event.preventDefault()}
                onDragEnter={() => setDropTarget(column.key)}
                onDrop={(event) => handleDrop(event, column.key)}
                className={`min-w-0 rounded-3xl border flex flex-col min-h-0 transition-all ${
                  activeDrop
                    ? "border-[#00a884] bg-[#00a884]/5 shadow-sm shadow-[#00a884]/10"
                    : "border-gray-200 bg-white/70"
                }`}
              >
                <div className="p-3 border-b border-gray-100 shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-9 h-9 rounded-2xl bg-white border border-gray-100 flex items-center justify-center shadow-sm shrink-0">
                        <Icon className="text-[#00a884]" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xs font-black text-gray-800 truncate">
                          {column.label}
                        </h3>
                        <p className="text-[10px] text-gray-400 truncate">
                          {column.detail}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`w-6 h-6 rounded-full text-[10px] font-black flex items-center justify-center text-white shrink-0 ${STATUS_DOT_COLORS[column.key]}`}
                    >
                      {columnOrders.length}
                    </span>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-3 space-y-3">
                  {columnOrders.length === 0 ? (
                    <EmptyColumn />
                  ) : (
                    columnOrders.map((order) => (
                      <KanbanOrderCard
                        key={order.id}
                        order={order}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onOpenLocation={setLocationModalOrder}
                        onOpenDetails={setDetailsModalOrder}
                        onAssign={openAssignment}
                        automaticAssignment={activeDeliveryDrivers.length === 1}
                        allowManualAssignment={activeDeliveryDrivers.length > 1}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <div className="hidden lg:block fixed bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="inline-flex items-center gap-2 rounded-full bg-white border border-gray-200 shadow-sm px-4 py-2 text-[11px] font-black text-gray-500">
            <FiShoppingBag className="text-[#00a884]" /> Todos: {orders.length}{" "}
            pedido(s)
          </div>
        </div>
      </div>

      <AnimatePresence>
        {assignmentOrder && (
          <div className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 18 }} className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <div><p className="font-black text-gray-900">Asignar repartidor</p><p className="text-xs text-gray-400 mt-0.5">Pedido de {assignmentOrder.customer || "cliente"}</p></div>
                <button onClick={() => setAssignmentOrder(null)} className="w-9 h-9 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center"><FiX /></button>
              </div>
              <div className="p-5 space-y-3">
                {deliveryDrivers.filter((driver) => driver.active).map((driver) => (
                  <button key={driver.id} onClick={() => setAssignmentDriverId(driver.id)} className={`w-full rounded-2xl border p-4 text-left flex items-center justify-between gap-3 ${assignmentDriverId === driver.id ? "border-[#00a884] bg-[#eafaf1]" : "border-gray-200"}`}>
                    <div><p className="font-black text-gray-900">{driver.full_name || `${driver.name || ""} ${driver.last_name || ""}`.trim()}</p><p className="text-[11px] text-gray-400 mt-1">{driver.active_orders || 0} entrega(s) activa(s)</p></div>
                    <span className={`w-5 h-5 rounded-full border-2 ${assignmentDriverId === driver.id ? "border-[#00a884] bg-[#00a884] ring-4 ring-[#00a884]/10" : "border-gray-300"}`} />
                  </button>
                ))}
                {!deliveryDrivers.some((driver) => driver.active) && <p className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-sm font-bold text-amber-700">No hay repartidores activos disponibles.</p>}
                <button disabled={!assignmentDriverId || assignmentBusy} onClick={confirmAssignment} className="w-full rounded-xl bg-[#00a884] text-white py-3 text-sm font-black disabled:opacity-40">{assignmentBusy ? "Asignando…" : "Confirmar asignación"}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {locationModalOrder && (
          <OrderLocationModal
            order={locationModalOrder}
            onClose={() => setLocationModalOrder(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detailsModalOrder && (
          <OrderDetailsModal
            order={detailsModalOrder}
            onClose={() => setDetailsModalOrder(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Orders;
