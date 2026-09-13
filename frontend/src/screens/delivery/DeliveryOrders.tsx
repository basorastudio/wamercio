import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../../context/StoreContext';
import { formatDateTime } from '../../lib/timezone';
import { getOrderDisplayNumber } from '../../lib/orderNumbers';
import { paymentMethodLabel } from '../../lib/paymentMethods';
import { DELIVERY_PIN_LENGTH, sanitizePin } from '../../lib/pin';
import {
  customerCallUrl,
  customerWhatsAppUrl,
  deliveryAcceptanceRequired,
  deliveryAddress,
  deliveryCoordinates,
  deliveryStatusLabel,
  isAutomaticallyAssignedDelivery,
  isDeliveryAccepted,
  isDeliveryOrder,
  navigationUrl,
} from '../../lib/delivery';
import * as FiIcons from 'react-icons/fi';
import MotorcycleIcon from '../../common/MotorcycleIcon';

const {
  FiCheckCircle, FiClock, FiAlertCircle, FiNavigation, FiInbox, FiMapPin,
  FiPackage, FiPhone, FiMessageCircle, FiShield, FiX, FiUserCheck, FiXCircle,
} = FiIcons;

const filters = [
  { key: 'all', label: 'Todos' },
  { key: 'assigned', label: 'Por aceptar' },
  { key: 'ready_for_delivery', label: 'Listos' },
  { key: 'on_the_way', label: 'En ruta' },
  { key: 'delivered', label: 'Entregados' },
  { key: 'issue', label: 'Problemas' },
  { key: 'cancelled', label: 'Cancelados' },
];

const statusConfig: Record<string, any> = {
  pending: { color: 'bg-amber-100 text-amber-700', accent: 'border-amber-200', icon: FiClock },
  preparing: { color: 'bg-amber-100 text-amber-700', accent: 'border-amber-200', icon: FiClock },
  ready_for_delivery: { color: 'bg-violet-100 text-violet-700', accent: 'border-violet-200', icon: FiPackage },
  on_the_way: { color: 'bg-blue-100 text-blue-700', accent: 'border-blue-200', icon: FiNavigation },
  delivered: { color: 'bg-[#eafaf1] text-[#00a884]', accent: 'border-[#00a884]/20', icon: FiCheckCircle },
  issue: { color: 'bg-red-100 text-red-600', accent: 'border-red-200', icon: FiAlertCircle },
  cancelled: { color: 'bg-gray-100 text-gray-600', accent: 'border-gray-200', icon: FiXCircle },
};

const fmt = (value: unknown) => Number(value || 0).toLocaleString('es-DO');

const Modal = ({ title, children, onClose }: any) => (
  <div className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="font-black text-gray-900">{title}</h3>
        <button onClick={onClose} className="w-9 h-9 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center"><FiX /></button>
      </div>
      <div className="p-5">{children}</div>
    </motion.div>
  </div>
);

export default function DeliveryOrders() {
  const {
    sales = [], acceptDeliveryOrder, startDeliveryOrder, completeDeliveryOrder, reportDeliveryIssue,
  } = useStore();
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [proofOrder, setProofOrder] = useState<any>(null);
  const [proofMode, setProofMode] = useState<'pin' | 'manual'>('pin');
  const [pin, setPin] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [proofNote, setProofNote] = useState('');
  const [issueOrder, setIssueOrder] = useState<any>(null);
  const [issueNote, setIssueNote] = useState('');
  const [issueType, setIssueType] = useState('other');

  const orders = useMemo(() => sales
    .filter((sale) => (sale.orderType || sale.order_type) === 'customer' && isDeliveryOrder(sale))
    .sort((a, b) => {
      const left = Number(a.routePosition || a.route_position || 999999);
      const right = Number(b.routePosition || b.route_position || 999999);
      return left - right || new Date(b.date).getTime() - new Date(a.date).getTime();
    }), [sales]);

  const matchesFilter = (order: any) => {
    if (filter === 'all') return true;
    if (filter === 'assigned') return order.status === 'ready_for_delivery' && deliveryAcceptanceRequired(order);
    if (filter === 'ready_for_delivery') return order.status === 'ready_for_delivery' && !deliveryAcceptanceRequired(order);
    return order.status === filter;
  };
  const filteredOrders = orders.filter(matchesFilter);
  const hasPendingAcceptance = orders.some((order) => (
    order.status === 'ready_for_delivery' && deliveryAcceptanceRequired(order)
  ));
  const visibleFilters = hasPendingAcceptance ? filters : filters.filter((item) => item.key !== 'assigned');
  const counts = Object.fromEntries(filters.map((item) => [item.key, orders.filter((order) => item.key === 'all' ? true : (
    item.key === 'assigned' ? order.status === 'ready_for_delivery' && deliveryAcceptanceRequired(order) :
      item.key === 'ready_for_delivery' ? order.status === 'ready_for_delivery' && !deliveryAcceptanceRequired(order) : order.status === item.key
  )).length]));

  useEffect(() => {
    if (filter === 'assigned' && !hasPendingAcceptance) {
      setFilter('all');
    }
  }, [filter, hasPendingAcceptance]);

  const run = async (orderId: string, action: () => Promise<any>) => {
    setBusyId(orderId);
    setError('');
    try { await action(); } catch (caught: any) { setError(caught?.message || 'No se pudo completar la acción'); }
    finally { setBusyId(''); }
  };

  const submitProof = async () => {
    if (!proofOrder) return;
    await run(proofOrder.id, async () => {
      await completeDeliveryOrder(proofOrder.id, proofMode === 'pin'
        ? { pin: sanitizePin(pin, DELIVERY_PIN_LENGTH) }
        : { proof_type: 'manual', recipient_name: recipientName, proof_note: proofNote });
      setProofOrder(null); setPin(''); setRecipientName(''); setProofNote(''); setProofMode('pin');
    });
  };

  const submitIssue = async () => {
    if (!issueOrder) return;
    await run(issueOrder.id, async () => {
      await reportDeliveryIssue(issueOrder.id, issueNote, issueType);
      setIssueOrder(null); setIssueNote(''); setIssueType('other');
    });
  };

  return (
    <div className="w-full max-w-md lg:max-w-7xl mx-auto p-4 lg:p-8 xl:p-10 space-y-4 lg:space-y-6 pb-24 lg:pb-10">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <p className="hidden lg:block text-xs font-black uppercase tracking-[0.22em] text-[#00a884]">Entregas asignadas a ti</p>
          <h2 className="font-black text-gray-800 text-lg lg:text-3xl mt-1">Mis pedidos</h2>
          <p className="hidden lg:block text-sm text-gray-500 mt-1">Inicia la ruta, navega y confirma cada entrega con PIN o prueba manual.</p>
        </div>
        <div className="hidden lg:flex gap-3">
          <div className="rounded-2xl bg-white border border-gray-100 px-4 py-3 shadow-sm"><p className="text-[10px] uppercase font-black text-gray-400">Asignados</p><p className="font-black text-xl">{orders.length}</p></div>
          <div className="rounded-2xl bg-[#00a884]/10 border border-[#00a884]/20 px-4 py-3 shadow-sm"><p className="text-[10px] uppercase font-black text-[#00a884]">En ruta</p><p className="font-black text-xl text-[#00a884]">{counts.on_the_way || 0}</p></div>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar lg:flex-wrap lg:bg-white lg:border lg:border-gray-100 lg:shadow-sm lg:rounded-3xl lg:p-3">
        {visibleFilters.map((item) => <button key={item.key} onClick={() => setFilter(item.key)} className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 ${filter === item.key ? 'bg-[#00a884] text-white shadow-md' : 'bg-white text-gray-500 border border-gray-200'}`}>{item.label}<span className={`min-w-5 h-5 px-1 rounded-full inline-flex items-center justify-center text-[10px] ${filter === item.key ? 'bg-white/20' : 'bg-gray-100'}`}>{counts[item.key] || 0}</span></button>)}
      </div>

      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm py-16 text-center"><FiInbox className="text-4xl text-gray-300 mx-auto mb-3"/><p className="font-bold text-gray-600">Sin pedidos en este filtro</p><p className="text-xs text-gray-400 mt-1">Solo verás las entregas asignadas a tu usuario.</p></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3 lg:gap-5">
          {filteredOrders.map((order, index) => {
            const config = statusConfig[order.status] || statusConfig.pending;
            const StatusIcon = config.icon;
            const phone = customerCallUrl(order);
            const whatsapp = customerWhatsAppUrl(order);
            const coordinates = deliveryCoordinates(order);
            const isBusy = busyId === order.id;
            const finalStatus = ['delivered', 'cancelled'].includes(order.status);
            const contactAllowed = !finalStatus;
            const orderNumber = getOrderDisplayNumber(order, index);
            const cancellationReason = order.cancellationReason || order.cancellation_reason || order.reversal_reason || '';
            const incident = order.deliveryIncident || order.delivery_incident || null;
            return (
              <motion.article key={order.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .03 }} className={`bg-white rounded-3xl border ${config.accent} shadow-sm p-4 lg:p-5 space-y-3`}>
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${config.color}`}><StatusIcon /></div>
                  <div className="flex-1 min-w-0"><div className="flex justify-between gap-2"><p className="font-black text-gray-900 truncate">{order.customer || 'Cliente'}</p><p className="font-black text-[#00a884]">RD$ {fmt(order.total)}</p></div><div className="flex gap-2 mt-1 items-center flex-wrap"><span className="text-[10px] font-black text-gray-500">{orderNumber}</span><span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${config.color}`}>{deliveryStatusLabel(order.status)}</span>{isDeliveryAccepted(order) && <span className="text-[10px] font-black text-[#00a884] flex items-center gap-1"><FiUserCheck/> {isAutomaticallyAssignedDelivery(order) ? 'Asignado' : 'Aceptado'}</span>}<span className="text-[10px] text-gray-400">{formatDateTime(order.date, { dateStyle: 'short', timeStyle: 'short' })}</span></div></div>
                </div>

                <div className="bg-gray-50 rounded-2xl p-3 space-y-2">
                  <p className="flex gap-2 text-xs text-gray-700 font-semibold"><FiMapPin className="text-[#00a884] mt-0.5 shrink-0"/><span>{deliveryAddress(order)}</span></p>
                  <p className="flex gap-2 items-center text-xs text-gray-500"><FiPackage/>{Array.isArray(order.items) ? order.items.length : 0} producto(s) · {paymentMethodLabel(order.method)}</p>
                  {order.issueNote || order.issue_note ? <p className="text-xs font-bold text-red-600">Problema: {order.issueNote || order.issue_note}</p> : null}
                  {order.status === 'cancelled' && cancellationReason ? <p className="text-xs font-bold text-gray-700">Cancelado: {cancellationReason}</p> : null}
                  {incident?.status === 'resolved' && incident?.resolutionNote ? <p className="text-[11px] font-semibold text-gray-500">Resolución: {incident.resolutionNote}</p> : null}
                </div>

                {contactAllowed ? (
                  <div className="grid grid-cols-3 gap-2">
                    <a href={phone || '#'} aria-disabled={!phone} className={`rounded-xl py-2.5 flex items-center justify-center gap-1.5 text-xs font-black border ${phone ? 'bg-white text-gray-700 border-gray-200' : 'bg-gray-50 text-gray-300 pointer-events-none'}`}><FiPhone/> Llamar</a>
                    <a href={whatsapp || '#'} target="_blank" rel="noreferrer" aria-disabled={!whatsapp} className={`rounded-xl py-2.5 flex items-center justify-center gap-1.5 text-xs font-black border ${whatsapp ? 'bg-[#eafaf1] text-[#00a884] border-[#00a884]/20' : 'bg-gray-50 text-gray-300 pointer-events-none'}`}><FiMessageCircle/> WhatsApp</a>
                    <a href={navigationUrl(order)} target="_blank" rel="noreferrer" className="rounded-xl py-2.5 flex items-center justify-center gap-1.5 text-xs font-black bg-blue-50 text-blue-600 border border-blue-100"><FiNavigation/> {coordinates ? 'Navegar' : 'Mapa'}</a>
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-center text-[11px] font-bold text-gray-500">Entrega finalizada · Contacto y navegación desactivados</div>
                )}

                {order.status === 'ready_for_delivery' && deliveryAcceptanceRequired(order) && <button disabled={isBusy} onClick={() => run(order.id, () => acceptDeliveryOrder(order.id))} className="w-full bg-[#1a2332] text-white rounded-xl py-3 text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50"><FiShield/> {isBusy ? 'Aceptando…' : 'Aceptar entrega'}</button>}
                {order.status === 'ready_for_delivery' && !deliveryAcceptanceRequired(order) && <button disabled={isBusy} onClick={() => run(order.id, () => startDeliveryOrder(order.id))} className="w-full bg-[#00a884] text-white rounded-xl py-3 text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50"><MotorcycleIcon className="w-4 h-4" /> {isBusy ? 'Iniciando…' : 'Iniciar ruta'}</button>}
                {order.status === 'on_the_way' && <button onClick={() => setProofOrder(order)} className="w-full bg-[#00a884] text-white rounded-xl py-3 text-xs font-black flex items-center justify-center gap-2"><FiCheckCircle/> Confirmar entrega</button>}
                {!['delivered', 'issue', 'cancelled'].includes(order.status) && <button onClick={() => { setIssueOrder(order); setIssueNote(''); setIssueType('other'); }} className="w-full rounded-xl py-2.5 text-xs font-black bg-red-50 text-red-600 border border-red-100"><FiAlertCircle className="inline mr-1"/> Reportar problema</button>}
              </motion.article>
            );
          })}
        </div>
      )}

      {proofOrder && <Modal title={`Confirmar entrega a ${proofOrder.customer || 'cliente'}`} onClose={() => setProofOrder(null)}>
        <div className="grid grid-cols-2 bg-gray-100 rounded-xl p-1 mb-4"><button onClick={() => setProofMode('pin')} className={`py-2 rounded-lg text-xs font-black ${proofMode === 'pin' ? 'bg-white shadow-sm text-[#00a884]' : 'text-gray-500'}`}>PIN del cliente</button><button onClick={() => setProofMode('manual')} className={`py-2 rounded-lg text-xs font-black ${proofMode === 'manual' ? 'bg-white shadow-sm text-[#00a884]' : 'text-gray-500'}`}>Prueba manual</button></div>
        {proofMode === 'pin' ? <div><label className="text-xs font-black text-gray-700">PIN de 4 dígitos</label><input value={pin} onChange={(event) => setPin(sanitizePin(event.target.value, DELIVERY_PIN_LENGTH))} inputMode="numeric" maxLength={DELIVERY_PIN_LENGTH} placeholder="••••" className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-2xl tracking-[.5em] font-black outline-none focus:border-[#00a884]"/><p className="text-xs text-gray-400 mt-2">Solicita al cliente el PIN que aparece en su pedido.</p></div> : <div className="space-y-3"><input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Nombre de quien recibió" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#00a884]"/><textarea value={proofNote} onChange={(event) => setProofNote(event.target.value)} placeholder="Ej.: Recibió en la puerta principal" className="w-full min-h-24 rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#00a884]"/><p className="text-xs text-gray-400">Se registrarán el repartidor, la hora y la ubicación disponible.</p></div>}
        <button disabled={busyId === proofOrder.id || (proofMode === 'pin' ? pin.length !== DELIVERY_PIN_LENGTH : recipientName.trim().length < 2 || proofNote.trim().length < 5)} onClick={submitProof} className="mt-5 w-full bg-[#00a884] text-white rounded-xl py-3 font-black text-sm disabled:opacity-40">{busyId === proofOrder.id ? 'Confirmando…' : 'Marcar como entregado'}</button>
      </Modal>}

      {issueOrder && <Modal title="Reportar problema" onClose={() => setIssueOrder(null)}>
        <label className="block text-xs font-black text-gray-700">Tipo de incidencia</label>
        <select value={issueType} onChange={(event) => setIssueType(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold outline-none focus:border-red-400">
          <option value="damaged">Producto dañado</option>
          <option value="lost">Producto perdido</option>
          <option value="customer_unavailable">Cliente no disponible</option>
          <option value="address_problem">Problema con la dirección</option>
          <option value="vehicle_problem">Problema con el vehículo</option>
          <option value="payment_problem">Problema con el pago</option>
          <option value="other">Otro problema</option>
        </select>
        <label className="mt-4 block text-xs font-black text-gray-700">Descripción</label>
        <textarea value={issueNote} onChange={(event) => setIssueNote(event.target.value)} placeholder="Describe qué ocurrió con la entrega" className="mt-2 w-full min-h-28 rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-red-400"/>
        <p className="mt-2 text-xs text-gray-400">El pedido quedará en incidencia. La venta no se anulará hasta que el administrador decida la resolución.</p>
        <button disabled={busyId === issueOrder.id || issueNote.trim().length < 5} onClick={submitIssue} className="mt-4 w-full bg-red-600 text-white rounded-xl py-3 font-black text-sm disabled:opacity-40">{busyId === issueOrder.id ? 'Guardando…' : 'Confirmar problema'}</button>
      </Modal>}
    </div>
  );
}
