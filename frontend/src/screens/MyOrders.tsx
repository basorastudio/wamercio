import React, { useState, useMemo } from 'react';
import * as FiIcons from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { getOrderDisplayNumber } from '../lib/orderNumbers';
import { formatDate } from '../lib/timezone';
import { paymentMethodLabel } from '../lib/paymentMethods';
import { cartItemLineTotal, formatCartItemMeasure } from '../lib/weightedProducts';
import CustomerDeliveryTracking from '../components/CustomerDeliveryTracking';
import MotorcycleIcon from '../common/MotorcycleIcon';
import { cleanOrderAddress } from '../lib/orderAddresses';

const {
  FiPackage, FiClock, FiCheckCircle, FiAlertTriangle, FiChevronDown,
  FiChevronUp, FiShoppingBag, FiMapPin, FiCreditCard,
  FiDollarSign, FiSend, FiBookOpen, FiStar, FiRepeat, FiRefreshCw,
  FiKey, FiUser, FiNavigation,
  FiXCircle,
} = FiIcons;

const fmt = (n) => Number(n).toLocaleString('es-DO');

const STATUS_CONFIG = {
  pending:  { icon: FiClock,        label: 'Pendiente',  color: 'text-amber-500',   bg: 'bg-amber-50',   border: 'border-amber-200',  dot: 'bg-amber-400'   },
  preparing: { icon: FiPackage,      label: 'Preparando', color: 'text-blue-500',    bg: 'bg-blue-50',    border: 'border-blue-200',   dot: 'bg-blue-400'    },
  ready:  { icon: FiPackage,      label: 'Listo',  color: 'text-indigo-500',  bg: 'bg-indigo-50',  border: 'border-indigo-200', dot: 'bg-indigo-400'  },
  on_the_way:     { icon: MotorcycleIcon, label: 'En camino',  color: 'text-purple-500',  bg: 'bg-purple-50',  border: 'border-purple-200', dot: 'bg-purple-400'  },
  delivered:  { icon: FiCheckCircle,  label: 'Entregado',  color: 'text-[#00a884]',   bg: 'bg-emerald-50', border: 'border-emerald-200',dot: 'bg-[#00a884]'   },
  picked_up:   { icon: FiCheckCircle,  label: 'Recogido',   color: 'text-[#00a884]',   bg: 'bg-emerald-50', border: 'border-emerald-200',dot: 'bg-[#00a884]'   },
  issue:   { icon: FiAlertTriangle, label: 'Problema',   color: 'text-red-500',     bg: 'bg-red-50',     border: 'border-red-200',    dot: 'bg-red-500'     },
  cancelled: { icon: FiXCircle, label: 'Cancelado', color: 'text-gray-500', bg: 'bg-gray-100', border: 'border-gray-200', dot: 'bg-gray-400' },
};

const DELIVERY_STEPS = ['pending', 'preparing', 'on_the_way', 'delivered'];
const PICKUP_STEPS = ['pending', 'preparing', 'ready', 'picked_up'];

const PAYMENT_ICON = {
  cash: FiDollarSign, card: FiCreditCard,
  bank_transfer: FiSend, store_credit: FiBookOpen,
};

const relativeTime = (iso) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 60)  return `Hace ${mins} min`;
  if (hours < 24)  return `Hace ${hours}h`;
  if (days  === 1) return 'Ayer';
  if (days  < 7)   return `Hace ${days} días`;
  return formatDate(iso, { day: '2-digit', month: 'short' });
};

const normalizeText = (value = '') => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

type OrderMode = 'delivery' | 'pickup';

type OrderModeMeta = {
  key: OrderMode;
  label: string;
  detail: string;
  icon: React.ElementType;
  badge: string;
};

const getOrderMode = (order: any = {}): OrderMode => {
  const explicit = normalizeText(order.orderMode || order.order_mode || order.fulfillmentMode || order.orderModeLabel || order.order_mode_label);
  if (explicit === 'delivery') return 'delivery';
  if (explicit === 'pickup') return 'pickup';

  const address = normalizeText(order.address || order.deliveryAddress || order.delivery_address || '');
  if (address.includes('modalidad: recogida') || address.includes('retirar en')) return 'pickup';
  if (address.includes('modalidad: entrega') || address.includes('entrega:') || address.includes('gps:')) return 'delivery';
  return 'delivery';
};

const orderModeMeta = (order: any = {}): OrderModeMeta => {
  const mode = getOrderMode(order);
  if (mode === 'pickup') {
    return {
      key: 'pickup',
      label: 'Recogida',
      detail: 'Retiro en negocio',
      icon: FiShoppingBag,
      badge: 'bg-violet-50 text-violet-700 border-violet-100',
    };
  }
  return {
    key: 'delivery',
    label: 'Entrega',
    detail: 'A domicilio',
    icon: MotorcycleIcon,
    badge: 'bg-emerald-50 text-[#00a884] border-emerald-100',
  };
};

const orderStepsFor = (mode = 'delivery') => (mode === 'pickup' ? PICKUP_STEPS : DELIVERY_STEPS);

const numberFromAny = (value: any) => {
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const cashChangeInfo = (order: any = {}) => {
  const raw = String(order.address || order.deliveryAddress || order.delivery_address || '');
  const explicitAnswered = order.cashChangeAnswered ?? order.cash_change_answered;
  const answered = explicitAnswered === true || explicitAnswered === 'true' || /Cambio\s*:/i.test(raw);
  if (!answered) return { answered: false, needed: false, from: 0, amount: 0 };
  const explicitNeeded = order.cashChangeNeeded ?? order.cash_change_needed;
  const needed = explicitNeeded === true || explicitNeeded === 'true' || /requiere vuelto/i.test(raw);
  const fromMatch = raw.match(/Cambio\s*:\s*requiere vuelto de RD\$?\s*([0-9.,]+)/i);
  const amountMatch = raw.match(/vuelto RD\$?\s*([0-9.,]+)/i);
  return {
    answered: true,
    needed,
    from: numberFromAny(order.cashChangeFrom ?? order.cash_change_from ?? fromMatch?.[1] ?? 0),
    amount: numberFromAny(order.cashChangeAmount ?? order.cash_change_amount ?? amountMatch?.[1] ?? 0),
  };
};

const displayStatusFor = (status = 'pending', mode = 'delivery') => {
  const normalized = normalizeText(status || 'pending').replace(/\s+/g, '_');
  if (mode === 'pickup') {
    if (normalized === 'delivered') return 'picked_up';
    if (normalized === 'on_the_way' || normalized === 'ready_for_delivery') return 'ready';
  }
  if (normalized === 'ready_for_delivery') return 'preparing';
  if (normalized === 'picked_up') return 'delivered';
  return STATUS_CONFIG[normalized] ? normalized : 'pending';
};

const displayOrderStatus = (order: any = {}) => displayStatusFor(order.status, getOrderMode(order));
const isCompletedOrder = (order: any = {}) => ['delivered', 'picked_up'].includes(displayOrderStatus(order));
const isTerminalOrder = (order: any = {}) => ['delivered', 'picked_up', 'cancelled'].includes(displayOrderStatus(order));

const orderReturnRecords = (order: any = {}) => (Array.isArray(order.returns) ? order.returns : []);
const orderNetTotal = (order: any = {}) => Math.max(
  0,
  Number(order.total || 0) - orderReturnRecords(order).reduce((sum: number, record: any) => sum + Number(record?.amount || 0), 0),
);

const OrderTimeline = ({ status: status, mode }) => {
  const steps = orderStepsFor(mode);
  const displayStatus = displayStatusFor(status, mode);
  const current = steps.indexOf(displayStatus);

  return (
    <div className="flex items-center gap-0 mt-3 mb-1">
      {steps.map((step, i) => {
        const cfg   = STATUS_CONFIG[step];
        const done  = current >= 0 && i <= current;
        const active = current >= 0 && i === current;
        return (
          <React.Fragment key={step}>
            <div className="flex flex-col items-center gap-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${
                done
                  ? `${cfg.dot} border-transparent`
                  : 'bg-gray-100 border-gray-200'
              }`}>
                {done && <cfg.icon className="text-white text-[9px]" />}
              </div>
              <span className={`text-[8px] font-bold leading-tight text-center w-12 ${
                active ? cfg.color : done ? 'text-gray-500' : 'text-gray-300'
              }`}>{cfg.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mb-4 transition-all ${
                current >= 0 && i < current ? 'bg-[#00a884]' : 'bg-gray-200'
              }`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

const OrderCard = ({ order: order, index, confirmPickup }: any) => {
  const [open, setOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [pickupConfirmationOpen, setPickupConfirmationOpen] = useState(false);
  const [pickupBusy, setPickupBusy] = useState(false);
  const [pickupError, setPickupError] = useState('');
  const mode = orderModeMeta(order);
  const displayStatus = displayStatusFor(order.status, mode.key);
  const cfg     = STATUS_CONFIG[displayStatus] || STATUS_CONFIG.pending;
  const Icon    = cfg.icon;
  const ModeIcon = mode.icon;
  const PayIcon = PAYMENT_ICON[order.paymentMethod] || FiDollarSign;
  const orderNumber = getOrderDisplayNumber(order, index);
  const change = cashChangeInfo(order);
  const showChangeInfo = mode.key === 'delivery' && order.paymentMethod === 'cash' && change.answered;
  const rawAddress = order.address || order.deliveryAddress || order.delivery_address || '';
  const visibleAddress = cleanOrderAddress(rawAddress, mode.key) || (mode.key === 'pickup' ? 'Dirección del negocio no disponible' : 'Dirección de entrega no disponible');
  const isActive = !['delivered', 'picked_up', 'cancelled'].includes(displayStatus);
  const isCancelled = displayStatus === 'cancelled';
  const financialStatus = String(order.financialStatus || order.financial_status || 'completed').toLowerCase();
  const latestReturn = orderReturnRecords(order)[0] || null;
  const isPartialDelivery = financialStatus === 'partially_returned' && ['delivered', 'picked_up'].includes(displayStatus);
  const netTotal = orderNetTotal(order);
  const cancellationReason = String(
    order.cancellationReason ||
    order.cancellation_reason ||
    order.reversalReason ||
    order.reversal_reason ||
    order.deliveryIncident?.resolutionNote ||
    order.deliveryIncident?.resolution_note ||
    order.delivery_incident?.resolutionNote ||
    order.delivery_incident?.resolution_note ||
    '',
  ).trim();
  const pickupReady = mode.key === 'pickup' && displayStatus === 'ready';

  const completePickup = async () => {
    if (!pickupReady || pickupBusy || typeof confirmPickup !== 'function') return;
    setPickupBusy(true);
    setPickupError('');
    try {
      await confirmPickup(order.id);
      setPickupConfirmationOpen(false);
    } catch (error: any) {
      setPickupError(error?.message || 'No se pudo confirmar la recogida');
    } finally {
      setPickupBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, type: 'spring', stiffness: 260, damping: 24 }}
      className={`bg-white rounded-2xl border shadow-sm overflow-hidden lg:rounded-[1.5rem] lg:border-gray-200 lg:hover:shadow-md ${
        isActive ? 'border-purple-100 ring-1 ring-purple-100' : 'border-gray-100'
      }`}
    >
      {isActive && (
        <div className="h-1 bg-gradient-to-r from-purple-400 to-[#00a884]" />
      )}

      <button
        onClick={() => setOpen(o => !o)}
        className="w-full p-4 flex items-start gap-3 text-left lg:p-5"
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${cfg.bg} ${cfg.border}`}>
          <Icon className={`text-base ${cfg.color}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-black text-gray-800 text-sm">{orderNumber}</span>
              {isActive && (
                <span className="flex items-center gap-1 text-[9px] font-black bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full animate-pulse">
                  <span className="w-1.5 h-1.5 bg-purple-500 rounded-full inline-block" />
                  ACTIVO
                </span>
              )}
            </div>
            <span className="font-black text-[#00a884] text-sm shrink-0">RD$ {fmt(isPartialDelivery ? netTotal : order.total)}</span>
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
              <Icon size={9} /> {cfg.label}
            </span>
            <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${mode.badge}`}>
              <ModeIcon size={9} /> {mode.label}
            </span>
            {isPartialDelivery && <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700"><FiAlertTriangle size={9} /> Entrega parcial</span>}
            <span className="text-[10px] text-gray-400">{relativeTime(order.date)}</span>
            <span className="text-[10px] text-gray-300">·</span>
            <span className="text-[10px] text-gray-400">{order.items.length} producto{order.items.length > 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="shrink-0 mt-1">
          {open
            ? <FiChevronUp className="text-gray-300 text-sm" />
            : <FiChevronDown className="text-gray-300 text-sm" />
          }
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-gray-50 pt-3 lg:px-5 lg:pb-5">

              {!isCancelled ? (
                <OrderTimeline status={order.status} mode={mode.key} />
              ) : (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500">
                      <FiXCircle />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Pedido cancelado</p>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-gray-700">
                        {cancellationReason || 'La operación fue cancelada por el negocio.'}
                      </p>
                      <p className="mt-1.5 text-[10px] text-gray-400">Este pedido ya no forma parte de tus compras activas.</p>
                    </div>
                  </div>
                </div>
              )}

              {isPartialDelivery && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-600"><FiAlertTriangle /></div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Entrega completada parcialmente</p>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-amber-900">{latestReturn?.reason || 'Algunos productos no pudieron entregarse y fueron descontados de la operación.'}</p>
                      {Number(latestReturn?.amount || 0) > 0 && <p className="mt-1.5 text-[10px] font-black text-amber-700">Ajuste registrado: RD$ {fmt(latestReturn.amount)}</p>}
                    </div>
                  </div>
                </div>
              )}

              {!isCancelled && mode.key === 'delivery' && ((order.assignedDriver || order.assigned_driver) || (order.status === 'on_the_way' && (order.deliveryPin || order.delivery_pin))) && (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-white text-[#00a884] flex items-center justify-center border border-emerald-100 shrink-0"><FiUser /></div>
                      <div className="min-w-0">
                        <p className="text-[9px] uppercase tracking-widest font-black text-emerald-600">Tu repartidor</p>
                        <p className="truncate text-xs font-black text-gray-800">{(order.assignedDriver || order.assigned_driver)?.full_name || (order.assignedDriver || order.assigned_driver)?.name || 'Repartidor asignado'}</p>
                      </div>
                    </div>
                    {order.status === 'on_the_way' && (order.deliveryPin || order.delivery_pin) && (
                      <div className="shrink-0 rounded-xl border border-violet-200 bg-white px-3 py-2 text-right">
                        <p className="flex items-center justify-end gap-1 text-[8px] font-black uppercase tracking-widest text-violet-500"><FiKey /> PIN de entrega</p>
                        <p className="mt-0.5 text-lg font-black tracking-[0.2em] text-violet-700">{order.deliveryPin || order.delivery_pin}</p>
                      </div>
                    )}
                  </div>
                  {order.status === 'on_the_way' && (order.deliveryPin || order.delivery_pin) && (
                    <p className="mt-2 text-[10px] font-semibold text-emerald-700">Comparte el PIN únicamente cuando hayas recibido tu pedido.</p>
                  )}
                  {order.status === 'on_the_way' && (
                    <button
                      type="button"
                      onClick={() => setTrackingOpen((value) => !value)}
                      className="mt-3 w-full rounded-xl bg-[#00a884] text-white py-2.5 text-[11px] font-black flex items-center justify-center gap-2"
                    >
                      <FiNavigation /> {trackingOpen ? 'Ocultar seguimiento' : 'Ver ubicación en vivo'}
                    </button>
                  )}
                </div>
              )}

              {!isCancelled && pickupReady && (
                <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-white text-violet-600"><FiShoppingBag /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-violet-600">Listo</p>
                      <p className="mt-1 text-xs font-semibold text-violet-700">Pasa por el negocio y confirma aquí cuando tengas el pedido en tus manos.</p>
                    </div>
                  </div>
                  {!pickupConfirmationOpen ? (
                    <button
                      type="button"
                      onClick={() => { setPickupError(''); setPickupConfirmationOpen(true); }}
                      className="mt-3 w-full rounded-xl bg-violet-600 py-2.5 text-[11px] font-black text-white"
                    >
                      Confirmar que ya recogí mi pedido
                    </button>
                  ) : (
                    <div className="mt-3 rounded-xl border border-violet-200 bg-white p-3">
                      <p className="text-[11px] font-bold text-gray-700">¿Ya recibiste el pedido en el negocio?</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button type="button" disabled={pickupBusy} onClick={() => setPickupConfirmationOpen(false)} className="rounded-lg border border-gray-200 py-2 text-[10px] font-black text-gray-500 disabled:opacity-50">Cancelar</button>
                        <button type="button" disabled={pickupBusy} onClick={completePickup} className="rounded-lg bg-[#00a884] py-2 text-[10px] font-black text-white disabled:opacity-50">{pickupBusy ? 'Confirmando…' : 'Sí, marcar recogido'}</button>
                      </div>
                    </div>
                  )}
                  {pickupError && <p className="mt-2 text-[10px] font-bold text-red-600">{pickupError}</p>}
                </div>
              )}

              {!isCancelled && mode.key === 'delivery' && order.status === 'on_the_way' && trackingOpen && (
                <CustomerDeliveryTracking
                  orderId={String(order.id)}
                  driverName={(order.assignedDriver || order.assigned_driver)?.full_name || (order.assignedDriver || order.assigned_driver)?.name || 'Tu repartidor'}
                />
              )}

              <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Productos</p>
                {order.items.map((item, i) => (
                  <div key={i} className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <span className="min-w-5 h-5 px-1.5 bg-white rounded-lg flex items-center justify-center text-gray-400 border border-gray-200 shrink-0 text-[9px] font-bold">
                        {formatCartItemMeasure(item)}
                      </span>
                      <span className="text-gray-700 font-medium">{item.name}</span>
                    </div>
                    <span className="font-bold text-gray-800 shrink-0 ml-2">
                      RD$ {fmt(cartItemLineTotal(item))}
                    </span>
                  </div>
                ))}
                <div className="pt-2 border-t border-gray-200 flex justify-between">
                  <span className="text-xs font-black text-gray-600">Total</span>
                  <span className="text-sm font-black text-[#00a884]">RD$ {fmt(isPartialDelivery ? netTotal : order.total)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <FiMapPin className="text-[#00a884] text-xs" />
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{mode.key === 'pickup' ? 'Recogida' : 'Entrega'}</p>
                  </div>
                  <p className="text-[10px] text-gray-700 font-medium leading-snug">{visibleAddress}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <PayIcon className="text-[#00a884] text-xs" />
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Pago</p>
                  </div>
                  <p className="text-[10px] text-gray-700 font-semibold">{paymentMethodLabel(order.paymentMethod)}</p>
                  {showChangeInfo && (
                    <div className={`mt-2 rounded-lg border px-2 py-1.5 ${
                      change.needed ? 'bg-amber-50 border-amber-100 text-amber-700' : 'bg-emerald-50 border-emerald-100 text-[#00a884]'
                    }`}>
                      <p className="text-[9px] font-black flex items-center gap-1">
                        <FiRefreshCw size={9} /> {change.needed ? `Vuelto de RD$ ${fmt(change.from)}` : 'Monto exacto'}
                      </p>
                      {change.needed && <p className="text-[8px] font-bold mt-0.5">Cambio RD$ {fmt(change.amount)}</p>}
                    </div>
                  )}
                </div>
              </div>

              {['delivered', 'picked_up', 'cancelled'].includes(displayStatus) && (
                <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#00a884]/8 border border-[#00a884]/20 rounded-xl text-[11px] font-bold text-[#00a884] hover:bg-[#00a884]/15 transition-colors">
                  <FiRepeat size={12} /> Repetir pedido
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const MyOrders = () => {
  const { user, confirmPickup } = useAuth();
  const [filter, setFilter] = useState('all');

  const orders = user?.orders || [];

  const filtered = useMemo(() => {
    if (filter === 'all') return orders;
    return orders.filter((p: any) => {
      const status = displayOrderStatus(p);
      if (filter === 'delivered') return ['delivered', 'picked_up'].includes(status);
      return status === filter;
    });
  }, [orders, filter]);

  const totalSpent = orders
    .filter(isCompletedOrder)
    .reduce((sum: number, order: any) => sum + orderNetTotal(order), 0);

  const activeOrders   = orders.filter((p: any) => !isTerminalOrder(p)).length;
  const delivered = orders.filter(isCompletedOrder).length;
  const cancelled = orders.filter((p: any) => displayOrderStatus(p) === 'cancelled').length;

  return (
    <div className="flex flex-col bg-[#f8f9fa] min-h-full lg:bg-[#f5f7f8] lg:px-5 lg:pb-10">

      <div className="bg-white px-5 pt-5 pb-4 border-b border-gray-100 shadow-sm sticky top-0 z-10 lg:static lg:mx-auto lg:mt-5 lg:w-full lg:max-w-[1440px] lg:rounded-[1.75rem] lg:border lg:border-gray-200 lg:px-6 lg:py-5">
        <h2 className="text-xl font-black text-gray-800 lg:text-3xl">Mis Pedidos</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Historial de compras de <span className="font-bold text-gray-600">{user?.name}</span>
        </p>

        <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar pb-0.5">
          {['all', 'pending', 'preparing', 'ready', 'on_the_way', 'delivered', 'issue', 'cancelled'].map(f => {
            const cfg = STATUS_CONFIG[f];
            return (
              <button key={f} onClick={() => setFilter(f)}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
                  filter === f
                    ? 'bg-[#00a884] text-white border-[#00a884] shadow-sm'
                    : 'bg-white text-gray-500 border-gray-200'
                }`}
              >
                {cfg && <cfg.icon size={10} />}
                {f === 'all' ? 'Todos' : cfg?.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pt-4 pb-2 lg:mx-auto lg:w-full lg:max-w-[1440px] lg:px-0 lg:pt-5">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-4">
          {[
            { label: 'Total pedidos', value: orders.length,              color: 'text-gray-800' },
            { label: 'Completados',   value: delivered,                  color: 'text-[#00a884]' },
            { label: 'En proceso',    value: activeOrders,                     color: 'text-purple-500' },
            { label: 'Cancelados',    value: cancelled,                  color: 'text-gray-500' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-center lg:rounded-2xl lg:border-gray-200 lg:p-5">
              <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-gray-400 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        {totalSpent > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="mt-2 bg-gradient-to-r from-[#00a884] to-[#007a60] rounded-xl p-3.5 flex items-center justify-between shadow-md shadow-[#00a884]/20"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <FiStar className="text-white text-sm" />
              </div>
              <div>
                <p className="text-white text-[10px] font-semibold">Total gastado</p>
                <p className="text-white font-black text-base leading-tight">RD$ {fmt(totalSpent)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-white/70 text-[9px]">Puntos acumulados</p>
              <p className="text-yellow-300 font-black text-base">{user?.puntos || 0} pts</p>
            </div>
          </motion.div>
        )}
      </div>

      <div className="px-4 pb-8 pt-2 space-y-3 lg:mx-auto lg:w-full lg:max-w-[1440px] lg:px-0 lg:pt-4 lg:space-y-4">
        {filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-16 text-center"
          >
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
              <FiShoppingBag className="text-2xl text-gray-300" />
            </div>
            <p className="text-sm text-gray-500 font-bold">
              {orders.length === 0 ? 'Aún no tienes pedidos' : 'Sin pedidos con ese estado'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {orders.length === 0 ? 'Explora el catálogo y haz tu primer pedido' : 'Prueba con otro filtro'}
            </p>
          </motion.div>
        ) : (
          filtered.map((order, i) => (
            <OrderCard key={order.id} order={order} index={i} confirmPickup={confirmPickup} />
          ))
        )}
      </div>
    </div>
  );
};

export default MyOrders;