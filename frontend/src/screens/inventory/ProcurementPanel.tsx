import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import * as FiIcons from 'react-icons/fi';

const { FiDollarSign, FiEdit3, FiRefreshCw, FiPlus, FiTruck, FiCheck, FiX, FiSettings, FiUserPlus, FiSend } = FiIcons;
const money = (value: any) => `RD$ ${Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (value: any) => Number(value || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 });

const ProcurementPanel = ({ storeId, products = [] }: { storeId: string; products: any[] }) => {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [payables, setPayables] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [supplierModal, setSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [payingSupplier, setPayingSupplier] = useState<any>(null);
  const [orderModal, setOrderModal] = useState(false);
  const [receiveOrder, setReceiveOrder] = useState<any>(null);
  const [policyProduct, setPolicyProduct] = useState<any>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError('');
    try {
      const [suggestionPayload, orderPayload, supplierPayload, payablePayload] = await Promise.all([
        api.get(`/inventory/purchase-suggestions?store_id=${encodeURIComponent(storeId)}`),
        api.get(`/purchase-orders?store_id=${encodeURIComponent(storeId)}`),
        api.get(`/suppliers?store_id=${encodeURIComponent(storeId)}`),
        api.get(`/suppliers/payables?store_id=${encodeURIComponent(storeId)}`),
      ]);
      setSuggestions(Array.isArray(suggestionPayload?.items) ? suggestionPayload.items : []);
      setOrders(Array.isArray(orderPayload?.items) ? orderPayload.items : []);
      setSuppliers(Array.isArray(supplierPayload?.items) ? supplierPayload.items : []);
      setPayables(Array.isArray(payablePayload?.items) ? payablePayload.items : []);
    } catch (err: any) {
      setError(err?.message || 'No se pudieron cargar las compras');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      try { await api.post('/inventory/purchase-suggestions/generate', { store_id: storeId }); } catch { /* The existing suggestions remain available if recalculation fails. */ }
      if (active) await load();
    };
    if (storeId) void bootstrap();
    return () => { active = false; };
  }, [storeId, load]);

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      await api.post('/inventory/purchase-suggestions/generate', { store_id: storeId });
      await load();
    } catch (err: any) {
      setError(err?.message || 'No se pudieron generar las sugerencias');
      setLoading(false);
    }
  };

  const selectedSuggestions = useMemo(
    () => suggestions.filter((item) => selected[item.id] && item.status === 'pending'),
    [suggestions, selected],
  );
  const pendingCount = suggestions.filter((item) => item.status === 'pending').length;

  const openReceive = async (order: any) => {
    try {
      setReceiveOrder(await api.get(`/purchase-orders/${order.id}`));
    } catch (err: any) {
      setError(err?.message || 'No se pudo abrir la orden');
    }
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="font-black text-gray-900">Compras y reposición</h3>
          <p className="mt-1 text-xs text-gray-500">Sugerencias basadas en rotación, existencias, tiempo de reposición y mercancía pendiente de recibir.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSupplierModal(true)} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-black text-gray-600"><FiUserPlus className="mr-2 inline" />Proveedor</button>
          <button onClick={generate} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-black text-emerald-700"><FiRefreshCw className={`mr-2 inline ${loading ? 'animate-spin' : ''}`} />Calcular sugerencias</button>
          <button disabled={selectedSuggestions.length === 0} onClick={() => setOrderModal(true)} className="rounded-xl bg-[#00a884] px-4 py-2.5 text-xs font-black text-white disabled:opacity-40"><FiPlus className="mr-2 inline" />Crear orden ({selectedSuggestions.length})</button>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs font-bold text-red-700">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Sugerencias pendientes" value={pendingCount} />
        <Metric label="Órdenes abiertas" value={orders.filter((o) => ['draft', 'submitted', 'partially_received'].includes(o.status)).length} />
        <Metric label="Proveedores activos" value={suppliers.filter((supplier) => supplier.active).length} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b bg-gray-50 px-4 py-3"><h4 className="font-black text-gray-800">Sugerencias de compra</h4></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase text-gray-500"><tr><th className="px-4 py-3"></th><th className="px-4 py-3 text-left">Producto</th><th className="px-4 py-3 text-right">Disponible</th><th className="px-4 py-3 text-right">En camino</th><th className="px-4 py-3 text-right">Venta diaria</th><th className="px-4 py-3 text-right">Sugerido</th><th className="px-4 py-3">Proveedor</th><th className="px-4 py-3"></th></tr></thead>
            <tbody>
              {suggestions.map((item) => (
                <tr key={item.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3"><input type="checkbox" disabled={item.status !== 'pending'} checked={Boolean(selected[item.id])} onChange={(event) => setSelected((value) => ({ ...value, [item.id]: event.target.checked }))} /></td>
                  <td className="px-4 py-3"><b className="text-gray-800">{item.product_name}</b><p className="text-[10px] text-gray-400">{item.reason}</p></td>
                  <td className="px-4 py-3 text-right">{qty(item.current_stock)}</td><td className="px-4 py-3 text-right">{qty(item.on_order_quantity)}</td><td className="px-4 py-3 text-right">{qty(item.average_daily_sales)}</td><td className="px-4 py-3 text-right font-black text-[#00a884]">{qty(item.suggested_quantity)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{item.supplier_name || 'Sin asignar'}</td>
                  <td className="px-4 py-3"><button onClick={() => setPolicyProduct(products.find((product) => String(product.id) === String(item.product_id)) || { id: item.product_id, name: item.product_name })} className="rounded-lg bg-gray-100 p-2 text-gray-600"><FiSettings /></button>{item.status === 'pending' && <button onClick={async () => { await api.patch(`/inventory/purchase-suggestions/${item.id}`, { action: 'dismiss', days: 7 }); await load(); }} className="ml-2 text-[10px] font-black text-gray-400">Pausar</button>}</td>
                </tr>
              ))}
              {suggestions.length === 0 && <tr><td colSpan={8} className="p-12 text-center text-gray-400">Calcula las sugerencias para analizar la reposición.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-3"><div><h4 className="font-black text-gray-800">Proveedores y cuentas por pagar</h4><p className="mt-1 text-[10px] text-gray-400">Compras a crédito y pagos manuales registrados en contabilidad.</p></div><button onClick={() => setSupplierModal(true)} className="rounded-lg bg-white px-3 py-2 text-xs font-black text-[#00a884] shadow-sm"><FiUserPlus className="mr-1 inline" />Nuevo</button></div>
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          {suppliers.map((supplier) => {
            const payable = payables.find((item) => String(item.supplier_id) === String(supplier.id));
            const outstanding = Number(payable?.outstanding || 0);
            return <article key={supplier.id} className="rounded-2xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3"><div><h5 className="font-black text-gray-900">{supplier.name}</h5><p className="text-xs text-gray-500">{supplier.contact_name || 'Sin contacto'}{supplier.whatsapp ? ` · ${supplier.whatsapp}` : ''}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-black ${supplier.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{supplier.active ? 'Activo' : 'Inactivo'}</span></div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-gray-50 p-2"><span className="block text-[9px] uppercase text-gray-400">Crédito</span><b>{money(payable?.credit_purchases)}</b></div><div className="rounded-xl bg-gray-50 p-2"><span className="block text-[9px] uppercase text-gray-400">Pagado</span><b>{money(payable?.paid)}</b></div><div className={`rounded-xl p-2 ${outstanding > 0 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}><span className="block text-[9px] uppercase opacity-60">Pendiente</span><b>{money(outstanding)}</b></div></div>
              <div className="mt-4 flex gap-2"><button onClick={() => setEditingSupplier(supplier)} className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-black text-gray-600"><FiEdit3 className="mr-1 inline" />Editar</button>{outstanding > 0 && <button onClick={() => setPayingSupplier({ ...supplier, outstanding })} className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700"><FiDollarSign className="mr-1 inline" />Registrar pago</button>}</div>
            </article>;
          })}
          {suppliers.length === 0 && <p className="col-span-full p-8 text-center text-sm text-gray-400">Registra tus proveedores para asignarlos a productos y órdenes de compra.</p>}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b bg-gray-50 px-4 py-3"><h4 className="font-black text-gray-800">Órdenes de compra</h4></div>
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          {orders.map((order) => (
            <article key={order.id} className="rounded-2xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase text-gray-400">{order.order_number}</p><h5 className="font-black text-gray-900">{order.supplier_name || 'Proveedor no asignado'}</h5><p className="text-xs text-gray-500">Creada {new Date(order.created_at).toLocaleDateString('es-DO')}</p></div><Status status={order.status} /></div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-gray-50 p-2"><span className="block text-[9px] uppercase text-gray-400">Total</span><b>{money(order.subtotal)}</b></div><div className="rounded-xl bg-gray-50 p-2"><span className="block text-[9px] uppercase text-gray-400">Pedido</span><b>{qty(order.quantity_ordered)}</b></div><div className="rounded-xl bg-gray-50 p-2"><span className="block text-[9px] uppercase text-gray-400">Recibido</span><b>{qty(order.quantity_received)}</b></div></div>
              <div className="mt-4 flex flex-wrap gap-2">
                {order.status === 'draft' && <button onClick={async () => { await api.post(`/purchase-orders/${order.id}/submit`, {}); await load(); }} className="rounded-xl bg-[#00a884] px-3 py-2 text-xs font-black text-white"><FiSend className="mr-1 inline" />Enviar orden</button>}
                {['submitted', 'partially_received'].includes(order.status) && <button onClick={() => void openReceive(order)} className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700"><FiTruck className="mr-1 inline" />Recibir mercancía</button>}
                {['draft', 'submitted'].includes(order.status) && <button onClick={async () => { if (!confirm('¿Cancelar esta orden de compra?')) return; await api.post(`/purchase-orders/${order.id}/cancel`, {}); await load(); }} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700">Cancelar</button>}
              </div>
            </article>
          ))}
          {orders.length === 0 && <p className="col-span-full p-8 text-center text-sm text-gray-400">Todavía no hay órdenes de compra.</p>}
        </div>
      </section>

      {supplierModal && <SupplierModal storeId={storeId} onClose={() => setSupplierModal(false)} onSaved={async () => { setSupplierModal(false); await load(); }} />}
      {editingSupplier && <SupplierModal storeId={storeId} supplier={editingSupplier} onClose={() => setEditingSupplier(null)} onSaved={async () => { setEditingSupplier(null); await load(); }} />}
      {payingSupplier && <SupplierPaymentModal storeId={storeId} supplier={payingSupplier} onClose={() => setPayingSupplier(null)} onSaved={async () => { setPayingSupplier(null); await load(); }} />}
      {orderModal && <OrderModal storeId={storeId} suggestions={selectedSuggestions} suppliers={suppliers} products={products} onClose={() => setOrderModal(false)} onSaved={async () => { setOrderModal(false); setSelected({}); await load(); }} />}
      {receiveOrder && <ReceiveModal order={receiveOrder} onClose={() => setReceiveOrder(null)} onSaved={async () => { setReceiveOrder(null); await load(); window.dispatchEvent(new CustomEvent('colmapro:data-changed')); }} />}
      {policyProduct && <PolicyModal product={policyProduct} suppliers={suppliers} onClose={() => setPolicyProduct(null)} onSaved={async () => { setPolicyProduct(null); await generate(); }} />}
    </div>
  );
};

const Metric = ({ label, value }: any) => <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</p><p className="mt-1 text-2xl font-black text-gray-900">{value}</p></div>;
const Status = ({ status }: any) => { const labels: any = { draft: 'Borrador', submitted: 'Enviada', partially_received: 'Parcial', received: 'Recibida', cancelled: 'Cancelada' }; const classes = status === 'received' ? 'bg-emerald-50 text-emerald-700' : status === 'cancelled' ? 'bg-red-50 text-red-700' : status === 'draft' ? 'bg-gray-100 text-gray-600' : 'bg-blue-50 text-blue-700'; return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${classes}`}>{labels[status] || status}</span>; };
const Modal = ({ title, onClose, children }: any) => <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"><div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-5"><h3 className="font-black text-gray-900">{title}</h3><button onClick={onClose} className="rounded-xl bg-gray-100 p-2 text-gray-500"><FiX /></button></div><div className="p-5">{children}</div></div></div>;

const SupplierModal = ({ storeId, supplier, onClose, onSaved }: any) => {
  const [form, setForm] = useState({
    name: supplier?.name || '', tax_id: supplier?.tax_id || '', contact_name: supplier?.contact_name || '',
    whatsapp: supplier?.whatsapp || '', email: supplier?.email || '', address: supplier?.address || '',
    notes: supplier?.notes || '', active: supplier?.active ?? true,
  });
  const [error, setError] = useState('');
  const save = async () => {
    try {
      if (supplier?.id) await api.patch(`/suppliers/${supplier.id}`, form);
      else await api.post('/suppliers', { store_id: storeId, ...form });
      await onSaved();
    } catch (err: any) { setError(err?.message || 'No se pudo guardar el proveedor'); }
  };
  return <Modal title={supplier ? 'Editar proveedor' : 'Nuevo proveedor'} onClose={onClose}><div className="grid gap-3 sm:grid-cols-2"><input placeholder="Nombre comercial" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="rounded-xl border p-3" /><input placeholder="RNC o cédula" value={form.tax_id} onChange={(event) => setForm({ ...form, tax_id: event.target.value })} className="rounded-xl border p-3" /><input placeholder="Persona de contacto" value={form.contact_name} onChange={(event) => setForm({ ...form, contact_name: event.target.value })} className="rounded-xl border p-3" /><input placeholder="WhatsApp" value={form.whatsapp} onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} className="rounded-xl border p-3" /><input placeholder="Correo" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="rounded-xl border p-3" /><input placeholder="Dirección" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="rounded-xl border p-3" /><textarea placeholder="Notas" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="rounded-xl border p-3 sm:col-span-2" />{supplier && <label className="flex items-center gap-2 rounded-xl bg-gray-50 p-3 text-sm font-bold text-gray-700 sm:col-span-2"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />Proveedor activo</label>}{error && <p className="text-xs font-bold text-red-600 sm:col-span-2">{error}</p>}<button onClick={save} disabled={!form.name.trim()} className="rounded-xl bg-[#00a884] py-3 font-black text-white disabled:opacity-40 sm:col-span-2">Guardar proveedor</button></div></Modal>;
};

const SupplierPaymentModal = ({ storeId, supplier, onClose, onSaved }: any) => {
  const [form, setForm] = useState({ amount: Number(supplier.outstanding || 0), payment_method: 'cash', reference: '', notes: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true); setError('');
    try { await api.post(`/suppliers/${supplier.id}/payments`, { store_id: storeId, ...form }); await onSaved(); }
    catch (err: any) { setError(err?.message || 'No se pudo registrar el pago'); }
    finally { setSaving(false); }
  };
  return <Modal title={`Pago a ${supplier.name}`} onClose={onClose}><div className="space-y-4"><div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Saldo pendiente: <b>{money(supplier.outstanding)}</b></div><label className="block text-xs font-black text-gray-600">Monto<input type="number" min="0.01" max={supplier.outstanding} step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} className="mt-1 w-full rounded-xl border p-3" /></label><label className="block text-xs font-black text-gray-600">Método manual<select value={form.payment_method} onChange={(event) => setForm({ ...form, payment_method: event.target.value })} className="mt-1 w-full rounded-xl border p-3"><option value="cash">Efectivo</option><option value="bank_transfer">Transferencia manual</option><option value="card">Tarjeta en terminal externa</option></select></label><input placeholder="Referencia o comprobante" value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} className="w-full rounded-xl border p-3" /><textarea placeholder="Observaciones" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="w-full rounded-xl border p-3" />{error && <p className="text-xs font-bold text-red-600">{error}</p>}<button disabled={saving || form.amount <= 0 || form.amount > Number(supplier.outstanding)} onClick={save} className="w-full rounded-xl bg-[#00a884] py-3 font-black text-white disabled:opacity-40">{saving ? 'Guardando...' : 'Registrar pago'}</button></div></Modal>;
};

const OrderModal = ({ storeId, suggestions, suppliers, products, onClose, onSaved }: any) => {
  const [supplierId, setSupplierId] = useState(suggestions[0]?.supplier_id || '');
  const [paymentMethod, setPaymentMethod] = useState('accounts_payable');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState(suggestions.map((suggestion: any) => ({ product_id: suggestion.product_id, product_name: suggestion.product_name, quantity: Number(suggestion.suggested_quantity || 0), unit_cost: Number(products.find((product: any) => String(product.id) === String(suggestion.product_id))?.cost || 0) })));
  const [error, setError] = useState('');
  const save = async () => { try { await api.post('/purchase-orders', { store_id: storeId, supplier_id: supplierId, payment_method: paymentMethod, expected_date: expectedDate, notes, items }); await onSaved(); } catch (err: any) { setError(err?.message || 'No se pudo crear la orden'); } };
  return <Modal title="Crear orden de compra" onClose={onClose}><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="rounded-xl border p-3"><option value="">Proveedor no asignado</option>{suppliers.filter((supplier: any) => supplier.active).map((supplier: any) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="rounded-xl border p-3"><option value="accounts_payable">Crédito con proveedor</option><option value="cash">Efectivo</option><option value="bank_transfer">Transferencia manual</option><option value="card">Tarjeta en terminal externa</option></select><input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} className="rounded-xl border p-3" /><input placeholder="Notas de la orden" value={notes} onChange={(event) => setNotes(event.target.value)} className="rounded-xl border p-3" /></div><div className="divide-y rounded-xl border">{items.map((item: any, index: number) => <div key={item.product_id} className="grid grid-cols-[1fr_110px_120px] gap-2 p-3"><div className="font-bold text-gray-700">{item.product_name}</div><input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => setItems((value: any[]) => value.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, quantity: Number(event.target.value) } : candidate))} className="rounded-lg border p-2 text-right" /><input type="number" min="0" step="0.01" value={item.unit_cost} onChange={(event) => setItems((value: any[]) => value.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, unit_cost: Number(event.target.value) } : candidate))} className="rounded-lg border p-2 text-right" /></div>)}</div><p className="text-right font-black">Total estimado: {money(items.reduce((sum: number, item: any) => sum + item.quantity * item.unit_cost, 0))}</p>{error && <p className="text-xs font-bold text-red-600">{error}</p>}<button onClick={save} className="w-full rounded-xl bg-[#00a884] py-3 font-black text-white">Crear orden</button></div></Modal>;
};

const ReceiveModal = ({ order, onClose, onSaved }: any) => {
  const [paymentMethod, setPaymentMethod] = useState(order.payment_method || 'accounts_payable');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState((order.items || []).filter((item: any) => item.remaining_quantity > 0).map((item: any) => ({ purchase_order_item_id: item.id, product_name: item.product_name, track_batches: item.track_batches, quantity: item.remaining_quantity, unit_cost: item.unit_cost, lot_number: '', expiry_date: '' })));
  const [error, setError] = useState('');
  const save = async () => { try { await api.post(`/purchase-orders/${order.id}/receive`, { payment_method: paymentMethod, invoice_number: invoiceNumber, notes, items }); await onSaved(); } catch (err: any) { setError(err?.message || 'No se pudo registrar la recepción'); } };
  return <Modal title={`Recibir ${order.order_number}`} onClose={onClose}><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="rounded-xl border p-3"><option value="accounts_payable">Crédito con proveedor</option><option value="cash">Efectivo</option><option value="bank_transfer">Transferencia manual</option><option value="card">Tarjeta en terminal externa</option></select><input placeholder="Número de factura" value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} className="rounded-xl border p-3" /></div><div className="space-y-3">{items.map((item: any, index: number) => <div key={item.purchase_order_item_id} className="rounded-2xl border p-4"><div className="mb-3 flex justify-between"><b>{item.product_name}</b>{item.track_batches && <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700">Requiere lote</span>}</div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><input type="number" min="0" step="0.01" value={item.quantity} onChange={(event) => setItems((value: any[]) => value.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, quantity: Number(event.target.value) } : candidate))} placeholder="Cantidad" className="rounded-xl border p-3" /><input type="number" min="0" step="0.01" value={item.unit_cost} onChange={(event) => setItems((value: any[]) => value.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, unit_cost: Number(event.target.value) } : candidate))} placeholder="Costo" className="rounded-xl border p-3" /><input value={item.lot_number} onChange={(event) => setItems((value: any[]) => value.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, lot_number: event.target.value } : candidate))} placeholder="Número de lote" className="rounded-xl border p-3" /><input type="date" value={item.expiry_date} onChange={(event) => setItems((value: any[]) => value.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, expiry_date: event.target.value } : candidate))} className="rounded-xl border p-3" /></div></div>)}</div><textarea placeholder="Observaciones de la recepción" value={notes} onChange={(event) => setNotes(event.target.value)} className="w-full rounded-xl border p-3" />{error && <p className="text-xs font-bold text-red-600">{error}</p>}<button onClick={save} className="w-full rounded-xl bg-[#00a884] py-3 font-black text-white"><FiCheck className="mr-2 inline" />Confirmar recepción</button></div></Modal>;
};

const PolicyModal = ({ product, suppliers, onClose, onSaved }: any) => {
  const [form, setForm] = useState({ reorder_point: Number(product.reorder_point || 0), reorder_target: Number(product.reorder_target || 0), safety_stock: Number(product.safety_stock || 0), lead_time_days: Number(product.lead_time_days || 7), preferred_supplier_id: product.preferred_supplier_id || '', track_batches: Boolean(product.track_batches) });
  const [error, setError] = useState('');
  const save = async () => { try { await api.patch(`/products/${product.id}/reorder-policy`, form); window.dispatchEvent(new CustomEvent('colmapro:data-changed')); await onSaved(); } catch (err: any) { setError(err?.message || 'No se pudo guardar la política'); } };
  return <Modal title={`Reposición de ${product.name}`} onClose={onClose}><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-black text-gray-600">Punto de reposición<input type="number" min="0" step="0.01" value={form.reorder_point} onChange={(event) => setForm({ ...form, reorder_point: Number(event.target.value) })} className="mt-1 w-full rounded-xl border p-3" /></label><label className="text-xs font-black text-gray-600">Existencia objetivo<input type="number" min="0" step="0.01" value={form.reorder_target} onChange={(event) => setForm({ ...form, reorder_target: Number(event.target.value) })} className="mt-1 w-full rounded-xl border p-3" /></label><label className="text-xs font-black text-gray-600">Existencia de seguridad<input type="number" min="0" step="0.01" value={form.safety_stock} onChange={(event) => setForm({ ...form, safety_stock: Number(event.target.value) })} className="mt-1 w-full rounded-xl border p-3" /></label><label className="text-xs font-black text-gray-600">Días de reposición<input type="number" min="0" max="365" value={form.lead_time_days} onChange={(event) => setForm({ ...form, lead_time_days: Number(event.target.value) })} className="mt-1 w-full rounded-xl border p-3" /></label><select value={form.preferred_supplier_id} onChange={(event) => setForm({ ...form, preferred_supplier_id: event.target.value })} className="rounded-xl border p-3 sm:col-span-2"><option value="">Proveedor preferido no asignado</option>{suppliers.filter((supplier: any) => supplier.active).map((supplier: any) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select><label className="flex items-center gap-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800 sm:col-span-2"><input type="checkbox" checked={form.track_batches} onChange={(event) => setForm({ ...form, track_batches: event.target.checked })} />Controlar este producto por lotes y vencimiento</label>{error && <p className="text-xs font-bold text-red-600 sm:col-span-2">{error}</p>}<button onClick={save} className="rounded-xl bg-[#00a884] py-3 font-black text-white sm:col-span-2">Guardar política</button></div></Modal>;
};

export default ProcurementPanel;
