import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../context/StoreContext';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/timezone';
import { paymentMethodLabel } from '../lib/paymentMethods';
import { formatCartItemMeasure } from '../lib/weightedProducts';
import * as FiIcons from 'react-icons/fi';

const {
  FiAlertTriangle, FiCheckCircle, FiChevronDown, FiChevronUp, FiLoader,
  FiRefreshCw, FiRotateCcw, FiSlash, FiTool, FiTruck, FiXCircle,
} = FiIcons;

const money = (value: any) => Number(value || 0).toLocaleString('es-DO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const saleStatusLabel: Record<string, string> = {
  completed: 'Completada',
  voided: 'Anulada',
  returned: 'Devuelta',
  partially_returned: 'Devolución parcial',
};

const orderStatusLabel: Record<string, string> = {
  pending: 'Pedido pendiente',
  preparing: 'En preparación',
  ready_for_delivery: 'Listo para entregar',
  on_the_way: 'En camino',
  delivered: 'Entregado',
  issue: 'Con incidencia',
  cancelled: 'Pedido cancelado',
};

const dispositionCopy: Record<string, { label: string; description: string }> = {
  restock: {
    label: 'Reponer al inventario',
    description: 'La mercancía volvió en buen estado y puede venderse nuevamente.',
  },
  damaged: {
    label: 'Registrar como dañada',
    description: 'No repone existencias; registra la merma y su costo.',
  },
  lost: {
    label: 'Registrar como perdida',
    description: 'No repone existencias; registra la pérdida y su costo.',
  },
  quarantine: {
    label: 'Enviar a cuarentena',
    description: 'No queda disponible para venta hasta una revisión posterior.',
  },
};

const resolutionCopy: Record<string, { label: string; description: string }> = {
  resume: {
    label: 'Retomar la entrega',
    description: 'Conserva el repartidor y vuelve al estado anterior del pedido.',
  },
  reassign: {
    label: 'Reasignar repartidor',
    description: 'Libera la asignación actual y deja el pedido listo para otro repartidor.',
  },
  replace_and_continue: {
    label: 'Preparar productos de reemplazo',
    description: 'Devuelve el pedido a preparación y elimina la asignación actual.',
  },
  partial_delivery: {
    label: 'Completar entrega parcial',
    description: 'Marca como entregado lo recibido y descuenta los productos que no pudieron entregarse.',
  },
  cancelled: {
    label: 'Cancelar pedido y anular venta',
    description: 'Cierra el pedido, la entrega y la operación financiera en una sola acción.',
  },
};

const itemProductId = (item: any) => String(item?.id || item?.product_id || item?.productId || '').trim();
const itemQuantity = (item: any) => Number(
  item?.quantity || item?.requested_weight || item?.requestedWeight || item?.estimated_weight || item?.estimatedWeight || 0,
);

const saleNetTotal = (sale: any = {}) => Math.max(
  0,
  Number(sale.net_total ?? sale.total ?? 0),
);

const saleReturnedAmount = (sale: any = {}) => Math.max(
  0,
  Number(sale.returned_amount || 0),
);

const defaultDispositionForSale = (sale: any) => {
  const incident = sale?.deliveryIncident || sale?.delivery_incident || {};
  const issueType = String(incident.issueType || incident.issue_type || '').toLowerCase();
  if (issueType === 'damaged') return 'damaged';
  if (issueType === 'lost') return 'lost';
  return 'restock';
};

const SalesOperations = () => {
  const { activeStore } = useStore();
  const storeId = String(activeStore?.id || '').trim();
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState('');
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [action, setAction] = useState<'void' | 'return' | ''>('');
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState('refund');
  const [inventoryDisposition, setInventoryDisposition] = useState('restock');
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [working, setWorking] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [issueSale, setIssueSale] = useState<any>(null);
  const [issueResolution, setIssueResolution] = useState('resume');
  const [issueResolutionNote, setIssueResolutionNote] = useState('');
  const [issueDisposition, setIssueDisposition] = useState('restock');
  const [issueReturnResolution, setIssueReturnResolution] = useState('refund');
  const [issueReplacementQuantities, setIssueReplacementQuantities] = useState<Record<string, string>>({});
  const [issueWorking, setIssueWorking] = useState(false);

  const loadSales = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ store_id: storeId, limit: '200' });
      if (status) query.set('status', status);
      const payload = await api.get(`/sales?${query.toString()}`);
      setSales(Array.isArray(payload?.items) ? payload.items : []);
    } catch (loadError: any) {
      setError(loadError?.message || 'No se pudieron cargar las ventas.');
    } finally {
      setLoading(false);
    }
  }, [status, storeId]);

  useEffect(() => { void loadSales(); }, [loadSales]);
  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const openAction = (sale: any, nextAction: 'void' | 'return') => {
    setSelectedSale(sale);
    setAction(nextAction);
    setReason('');
    setResolution('refund');
    setInventoryDisposition(nextAction === 'void' ? defaultDispositionForSale(sale) : 'restock');
    const quantities: Record<string, string> = {};
    (Array.isArray(sale?.items) ? sale.items : []).forEach((item: any) => {
      quantities[itemProductId(item)] = '';
    });
    setReturnQuantities(quantities);
    setError('');
  };

  const closeAction = (force = false) => {
    if (working && !force) return;
    setSelectedSale(null);
    setAction('');
    setReason('');
    setReturnQuantities({});
    setInventoryDisposition('restock');
  };

  const refreshAll = async () => {
    await loadSales();
    window.dispatchEvent(new CustomEvent('colmapro:data-changed'));
  };

  const submitAction = async () => {
    if (!selectedSale || reason.trim().length < 5) {
      setError('Indica un motivo de al menos 5 caracteres.');
      return;
    }
    setWorking(true);
    setError('');
    try {
      if (action === 'void') {
        const result = await api.post(`/sales/${encodeURIComponent(selectedSale.id)}/void`, {
          reason: reason.trim(),
          inventory_disposition: inventoryDisposition,
        });
        setNotice(result?.inventory_restocked
          ? 'El pedido y la venta fueron cancelados; las existencias se repusieron.'
          : `El pedido y la venta fueron cancelados; se registró: ${dispositionCopy[inventoryDisposition]?.label.toLowerCase()}.`);
      } else {
        const items = (Array.isArray(selectedSale.items) ? selectedSale.items : [])
          .map((item: any) => ({
            product_id: itemProductId(item),
            quantity: Number(returnQuantities[itemProductId(item)] || 0),
          }))
          .filter((item: any) => item.product_id && item.quantity > 0);
        if (items.length === 0) {
          throw new Error('Selecciona al menos un producto y una cantidad para devolver.');
        }
        await api.post(`/sales/${encodeURIComponent(selectedSale.id)}/returns`, {
          items,
          reason: reason.trim(),
          resolution,
          inventory_disposition: inventoryDisposition,
        });
        setNotice(inventoryDisposition === 'restock'
          ? 'La devolución fue registrada y las existencias fueron repuestas.'
          : `La devolución fue registrada como ${dispositionCopy[inventoryDisposition]?.label.toLowerCase()}.`);
      }
      closeAction(true);
      await refreshAll();
    } catch (actionError: any) {
      setError(actionError?.message || 'No se pudo completar la operación.');
    } finally {
      setWorking(false);
    }
  };

  const openIssueResolution = (sale: any) => {
    setIssueSale(sale);
    setIssueResolution('resume');
    setIssueResolutionNote('');
    setIssueDisposition(defaultDispositionForSale(sale));
    setIssueReturnResolution('refund');
    const quantities: Record<string, string> = {};
    (Array.isArray(sale?.items) ? sale.items : []).forEach((item: any) => {
      quantities[itemProductId(item)] = '';
    });
    setIssueReplacementQuantities(quantities);
    setError('');
  };

  const closeIssueResolution = (force = false) => {
    if (issueWorking && !force) return;
    setIssueSale(null);
    setIssueResolution('resume');
    setIssueResolutionNote('');
    setIssueDisposition('restock');
    setIssueReturnResolution('refund');
    setIssueReplacementQuantities({});
  };

  const submitIssueResolution = async () => {
    if (!issueSale || issueResolutionNote.trim().length < 5) {
      setError('Describe cómo se resolvió la incidencia.');
      return;
    }
    setIssueWorking(true);
    setError('');
    try {
      if (issueResolution === 'cancelled') {
        await api.post(`/sales/${encodeURIComponent(issueSale.id)}/void`, {
          reason: issueResolutionNote.trim(),
          inventory_disposition: issueDisposition,
        });
        setNotice('La incidencia fue resuelta con la cancelación completa del pedido.');
      } else {
        const requiresItemSelection = ['replace_and_continue', 'partial_delivery'].includes(issueResolution);
        const selectedItems = requiresItemSelection
          ? (Array.isArray(issueSale.items) ? issueSale.items : [])
            .map((item: any) => ({
              product_id: itemProductId(item),
              quantity: Number(issueReplacementQuantities[itemProductId(item)] || 0),
            }))
            .filter((item: any) => item.product_id && item.quantity > 0)
          : [];
        if (requiresItemSelection && selectedItems.length === 0) {
          throw new Error(issueResolution === 'partial_delivery'
            ? 'Selecciona al menos un producto que no pudo entregarse.'
            : 'Selecciona al menos un producto y una cantidad para reemplazar.');
        }
        await api.post(`/delivery/orders/${encodeURIComponent(issueSale.id)}/issue/resolve`, {
          resolution: issueResolution,
          note: issueResolutionNote.trim(),
          inventory_disposition: requiresItemSelection ? issueDisposition : undefined,
          replacement_items: issueResolution === 'replace_and_continue' ? selectedItems : [],
          partial_items: issueResolution === 'partial_delivery' ? selectedItems : [],
          return_resolution: issueResolution === 'partial_delivery' ? issueReturnResolution : undefined,
        });
        setNotice(issueResolution === 'partial_delivery'
          ? 'La entrega parcial fue registrada y el cliente recibió el ajuste correspondiente.'
          : 'La incidencia fue resuelta y el pedido quedó sincronizado.');
      }
      closeIssueResolution(true);
      await refreshAll();
    } catch (resolutionError: any) {
      setError(resolutionError?.message || 'No se pudo resolver la incidencia.');
    } finally {
      setIssueWorking(false);
    }
  };

  const totals = useMemo(() => sales.reduce((summary, sale) => {
    const voided = String(sale.status || '').toLowerCase() === 'voided';
    if (!voided) summary.net += saleNetTotal(sale);
    if (voided) summary.cancelled += Number(sale.total || 0);
    summary.count += 1;
    if ((sale.deliveryIncident || sale.delivery_incident)?.status === 'open') summary.openIncidents += 1;
    return summary;
  }, { net: 0, cancelled: 0, count: 0, openIncidents: 0 }), [sales]);

  return (
    <div className="h-full overflow-y-auto bg-[#f8fafc] p-4 md:p-8 xl:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Ventas, anulaciones y devoluciones</h1>
            <p className="mt-1 text-sm text-gray-500">Corrige operaciones, resuelve incidencias y define el destino real de la mercancía.</p>
          </div>
          <div className="flex gap-2">
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-black text-gray-600 outline-none focus:ring-2 focus:ring-[#00a884]/20">
              <option value="">Todos los estados</option>
              <option value="completed">Completadas</option>
              <option value="partially_returned">Devolución parcial</option>
              <option value="returned">Devueltas</option>
              <option value="voided">Anuladas</option>
            </select>
            <button type="button" onClick={() => void loadSales()} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-black text-gray-600 hover:bg-gray-50"><FiRefreshCw /> Actualizar</button>
          </div>
        </header>

        {error && !selectedSale && !issueSale && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}
        {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{notice}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Summary label="Operaciones cargadas" value={totals.count} />
          <Summary label="Valor no anulado" value={`RD$ ${money(totals.net)}`} />
          <Summary label="Valor anulado" value={`RD$ ${money(totals.cancelled)}`} warning />
          <Summary label="Incidencias abiertas" value={totals.openIncidents} warning={totals.openIncidents > 0} />
        </div>

        {loading ? (
          <div className="rounded-3xl border border-gray-200 bg-white py-20 text-center text-sm font-bold text-gray-500"><FiLoader className="inline animate-spin mr-2" /> Cargando ventas…</div>
        ) : sales.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-white py-20 text-center text-sm text-gray-500">No hay ventas para el filtro seleccionado.</div>
        ) : (
          <div className="space-y-3">
            {sales.map((sale, index) => {
              const isExpanded = Boolean(expanded[sale.id]);
              const terminal = ['voided', 'returned'].includes(String(sale.status || '').toLowerCase());
              const incident = sale.deliveryIncident || sale.delivery_incident || null;
              const openIncident = incident?.status === 'open';
              const orderStatus = String(sale.order_status || '').toLowerCase();
              const orderNumber = sale.order_number || `#${String(sale.id).replace(/-/g, '').slice(-6).toUpperCase()}`;
              const netTotal = saleNetTotal(sale);
              const returnedAmount = saleReturnedAmount(sale);
              return (
                <motion.article key={sale.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 10) * 0.025 }} className={`rounded-2xl border bg-white shadow-sm overflow-hidden ${openIncident ? 'border-amber-300 ring-1 ring-amber-100' : 'border-gray-200'}`}>
                  <button type="button" onClick={() => setExpanded((current) => ({ ...current, [sale.id]: !isExpanded }))} className="w-full p-4 flex items-center gap-4 text-left">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${openIncident ? 'bg-amber-50 text-amber-600' : terminal ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-600'}`}>
                      {openIncident ? <FiAlertTriangle /> : terminal ? <FiSlash /> : <FiCheckCircle />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-gray-900">{sale.customer || `Venta ${orderNumber}`}</p>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-black uppercase text-gray-600">{saleStatusLabel[sale.status] || sale.status || 'Completada'}</span>
                        {sale.order_type === 'customer' && <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${orderStatus === 'cancelled' ? 'bg-red-50 text-red-600' : orderStatus === 'issue' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{orderStatusLabel[orderStatus] || orderStatus}</span>}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">{formatDateTime(sale.date)} · {paymentMethodLabel(sale.method)} · Pedido {orderNumber} · Venta {sale.reference_number || String(sale.id).slice(-8)}</p>
                    </div>
                    <div className="shrink-0 text-right"><p className="font-black text-[#00a884]">RD$ {money(netTotal)}</p>{returnedAmount > 0 && <p className="text-[10px] font-bold text-amber-600">Ajuste: RD$ {money(returnedAmount)}</p>}</div>
                    {isExpanded ? <FiChevronUp className="text-gray-400" /> : <FiChevronDown className="text-gray-400" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 p-4">
                      <div className="space-y-2">
                        {(Array.isArray(sale.items) ? sale.items : []).map((item: any, itemIndex: number) => (
                          <div key={`${itemProductId(item)}-${itemIndex}`} className="flex justify-between gap-3 text-xs text-gray-600">
                            <span>{item.name || 'Producto'} · {formatCartItemMeasure(item)}</span>
                            <span className="font-bold">RD$ {money(item.line_total || item.lineTotal || Number(item.price || 0) * itemQuantity(item))}</span>
                          </div>
                        ))}
                      </div>

                      {incident && (
                        <div className={`mt-4 rounded-2xl border p-4 ${openIncident ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
                          <div className="flex items-start gap-3">
                            <FiTool className={openIncident ? 'mt-0.5 text-amber-600' : 'mt-0.5 text-gray-500'} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-xs font-black text-gray-800">Incidencia de entrega</p>
                                <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${openIncident ? 'bg-amber-200/70 text-amber-800' : 'bg-gray-200 text-gray-600'}`}>{openIncident ? 'Abierta' : 'Resuelta'}</span>
                              </div>
                              <p className="mt-1 text-xs font-semibold text-gray-700">{incident.note}</p>
                              {incident.resolutionNote && <p className="mt-1 text-[11px] text-gray-500">Resolución: {incident.resolutionNote}</p>}
                              {incident.inventoryDisposition && incident.inventoryDisposition !== 'none' && <p className="mt-1 text-[11px] font-bold text-gray-600">Inventario: {dispositionCopy[incident.inventoryDisposition]?.label || incident.inventoryDisposition}</p>}
                            </div>
                          </div>
                          {openIncident && <button type="button" onClick={() => openIssueResolution(sale)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-black text-white hover:bg-amber-700"><FiTool /> Resolver incidencia</button>}
                        </div>
                      )}

                      {returnedAmount > 0 && <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs font-bold text-amber-800">Total original: RD$ {money(sale.total)} · Ajuste registrado: RD$ {money(returnedAmount)} · Total neto: RD$ {money(netTotal)}</div>}
                      {sale.reversal_reason && <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs font-bold text-amber-800">Motivo: {sale.reversal_reason}</div>}

                      {!terminal && !openIncident && (
                        <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-end">
                          <button type="button" onClick={() => openAction(sale, 'return')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-black text-amber-700 hover:bg-amber-100"><FiRotateCcw /> Devolución parcial o total</button>
                          {String(sale.status || '').toLowerCase() !== 'partially_returned' && <button type="button" onClick={() => openAction(sale, 'void')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-black text-red-700 hover:bg-red-100"><FiSlash /> Anular venta completa</button>}
                        </div>
                      )}
                    </div>
                  )}
                </motion.article>
              );
            })}
          </div>
        )}
      </div>

      {selectedSale && action && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${action === 'void' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{action === 'void' ? <FiSlash /> : <FiRotateCcw />}</div>
              <div><h2 className="text-xl font-black text-gray-900">{action === 'void' ? 'Anular venta completa' : 'Registrar devolución'}</h2><p className="mt-1 text-sm text-gray-500">Venta por RD$ {money(selectedSale.total)} · {selectedSale.customer || 'Consumidor final'}</p></div>
            </div>

            {error && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}

            {action === 'return' && (
              <div className="mt-5 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Productos y cantidades</p>
                {(Array.isArray(selectedSale.items) ? selectedSale.items : []).map((item: any, index: number) => {
                  const productId = itemProductId(item);
                  const soldQuantity = itemQuantity(item);
                  return <label key={`${productId}-${index}`} className="flex items-center gap-3 rounded-2xl border border-gray-200 p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-gray-800">{item.name || 'Producto'}</p><p className="text-xs text-gray-500">Vendido: {soldQuantity.toLocaleString('es-DO', { maximumFractionDigits: 2 })}</p></div><input type="number" min="0" max={soldQuantity} step={Number.isInteger(soldQuantity) ? 1 : 0.01} value={returnQuantities[productId] || ''} onChange={(event) => setReturnQuantities((current) => ({ ...current, [productId]: event.target.value }))} className="w-24 rounded-xl border border-gray-200 px-3 py-2 text-right font-black outline-none focus:ring-2 focus:ring-[#00a884]/20" placeholder="0" /></label>;
                })}
                <label className="block"><span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Resolución financiera</span><select value={resolution} onChange={(event) => setResolution(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[#00a884]/20"><option value="refund">Reembolso por el mismo medio manual</option><option value="store_credit">Crédito a favor del cliente</option><option value="exchange">Cambio por otro producto</option></select></label>
              </div>
            )}

            <label className="mt-5 block">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Tratamiento del inventario</span>
              <select value={inventoryDisposition} onChange={(event) => setInventoryDisposition(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[#00a884]/20">
                {Object.entries(dispositionCopy).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
              </select>
              <p className="mt-2 text-xs text-gray-500">{dispositionCopy[inventoryDisposition]?.description}</p>
            </label>

            <div className={`mt-4 rounded-2xl border p-4 text-xs leading-relaxed ${inventoryDisposition === 'restock' ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-red-100 bg-red-50 text-red-800'}`}>
              <FiAlertTriangle className="inline mr-2" />
              {inventoryDisposition === 'restock'
                ? 'Las existencias y los lotes asociados se repondrán automáticamente.'
                : 'Las existencias no se repondrán; se registrará una merma, pérdida o cuarentena con su costo contable.'}
            </div>

            <label className="mt-5 block"><span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Motivo obligatorio</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-2 w-full resize-none rounded-xl border border-gray-200 p-3 text-sm outline-none focus:ring-2 focus:ring-[#00a884]/20" placeholder="Describe el motivo de la operación" /></label>
            <div className="mt-6 flex gap-3"><button type="button" onClick={() => closeAction()} disabled={working} className="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-black text-gray-600">Cancelar</button><button type="button" onClick={() => void submitAction()} disabled={working || reason.trim().length < 5} className={`flex-1 rounded-xl py-3 text-sm font-black text-white disabled:opacity-50 ${action === 'void' ? 'bg-red-600' : 'bg-[#00a884]'}`}>{working ? <><FiLoader className="inline animate-spin mr-2" /> Procesando…</> : action === 'void' ? 'Confirmar anulación' : 'Registrar devolución'}</button></div>
          </div>
        </div>
      )}

      {issueSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><FiTool /></div>
              <div><h2 className="text-xl font-black text-gray-900">Resolver incidencia</h2><p className="mt-1 text-sm text-gray-500">Pedido {issueSale.order_number || `#${String(issueSale.id).replace(/-/g, '').slice(-6).toUpperCase()}`} · {issueSale.customer}</p></div>
            </div>

            {error && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}

            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Problema reportado</p>
              <p className="mt-1 text-sm font-bold text-amber-900">{(issueSale.deliveryIncident || issueSale.delivery_incident)?.note}</p>
            </div>

            <div className="mt-5 grid gap-2">
              {Object.entries(resolutionCopy).map(([key, value]) => (
                <button key={key} type="button" onClick={() => setIssueResolution(key)} className={`rounded-2xl border p-4 text-left transition ${issueResolution === key ? 'border-[#00a884] bg-[#00a884]/5 ring-2 ring-[#00a884]/10' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${key === 'cancelled' ? 'bg-red-50 text-red-600' : key === 'reassign' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-[#00a884]'}`}>{key === 'cancelled' ? <FiXCircle /> : key === 'reassign' ? <FiTruck /> : <FiCheckCircle />}</div>
                    <div><p className="text-sm font-black text-gray-800">{value.label}</p><p className="mt-1 text-xs text-gray-500">{value.description}</p></div>
                  </div>
                </button>
              ))}
            </div>

            {['replace_and_continue', 'partial_delivery'].includes(issueResolution) && (
              <div className="mt-5 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">{issueResolution === 'partial_delivery' ? 'Productos que no pudieron entregarse' : 'Productos que deben prepararse nuevamente'}</p>
                {(Array.isArray(issueSale.items) ? issueSale.items : []).map((item: any, index: number) => {
                  const productId = itemProductId(item);
                  const soldQuantity = itemQuantity(item);
                  return (
                    <label key={`${productId}-replacement-${index}`} className="flex items-center gap-3 rounded-2xl border border-gray-200 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-gray-800">{item.name || 'Producto'}</p>
                        <p className="text-xs text-gray-500">{issueResolution === 'partial_delivery' ? 'Cantidad pedida' : 'Pedido'}: {soldQuantity.toLocaleString('es-DO', { maximumFractionDigits: 2 })}</p>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max={soldQuantity}
                        step={Number.isInteger(soldQuantity) ? 1 : 0.01}
                        value={issueReplacementQuantities[productId] || ''}
                        onChange={(event) => setIssueReplacementQuantities((current) => ({ ...current, [productId]: event.target.value }))}
                        className="w-24 rounded-xl border border-gray-200 px-3 py-2 text-right font-black outline-none focus:ring-2 focus:ring-[#00a884]/20"
                        placeholder="0"
                      />
                    </label>
                  );
                })}
              </div>
            )}

            {['cancelled', 'replace_and_continue', 'partial_delivery'].includes(issueResolution) && (
              <label className="mt-5 block">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Qué ocurrió con la mercancía original</span>
                <select value={issueDisposition} onChange={(event) => setIssueDisposition(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[#00a884]/20">
                  {Object.entries(dispositionCopy).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
                </select>
                <p className="mt-2 text-xs text-gray-500">{dispositionCopy[issueDisposition]?.description}</p>
                {issueResolution === 'replace_and_continue' && (
                  <p className="mt-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-semibold text-blue-700">
                    WAMERCIO registrará el destino de los productos originales y descontará del inventario las unidades preparadas como reemplazo.
                  </p>
                )}
                {issueResolution === 'partial_delivery' && (
                  <p className="mt-2 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs font-semibold text-amber-700">
                    Solo las cantidades seleccionadas se descontarán de la operación. El pedido quedará entregado parcialmente y ya no aparecerá como activo.
                  </p>
                )}
              </label>
            )}

            {issueResolution === 'partial_delivery' && (
              <label className="mt-5 block">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Ajuste para el cliente</span>
                <select value={issueReturnResolution} onChange={(event) => setIssueReturnResolution(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[#00a884]/20">
                  <option value="refund">Reembolso por el mismo medio manual</option>
                  <option value="store_credit">Crédito a favor del cliente</option>
                </select>
              </label>
            )}

            <label className="mt-5 block"><span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Resolución y observación</span><textarea value={issueResolutionNote} onChange={(event) => setIssueResolutionNote(event.target.value)} rows={3} className="mt-2 w-full resize-none rounded-xl border border-gray-200 p-3 text-sm outline-none focus:ring-2 focus:ring-[#00a884]/20" placeholder="Describe la decisión tomada y cualquier instrucción para el cliente o repartidor" /></label>
            <div className="mt-6 flex gap-3"><button type="button" onClick={() => closeIssueResolution()} disabled={issueWorking} className="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-black text-gray-600">Cerrar</button><button type="button" onClick={() => void submitIssueResolution()} disabled={issueWorking || issueResolutionNote.trim().length < 5} className={`flex-1 rounded-xl py-3 text-sm font-black text-white disabled:opacity-50 ${issueResolution === 'cancelled' ? 'bg-red-600' : 'bg-[#00a884]'}`}>{issueWorking ? <><FiLoader className="inline animate-spin mr-2" /> Procesando…</> : 'Confirmar resolución'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

const Summary = ({ label, value, warning = false }: any) => <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</p><p className={`mt-2 text-xl font-black ${warning ? 'text-red-600' : 'text-gray-900'}`}>{value}</p></div>;

export default SalesOperations;
