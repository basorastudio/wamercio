import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import * as FiIcons from 'react-icons/fi';

const { FiActivity, FiAlertTriangle, FiCalendar, FiCheckCircle, FiEdit3, FiPlus, FiRefreshCw, FiShield, FiX } = FiIcons;

const formatQuantity = (value: unknown) => Number(value || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 });
const formatMoney = (value: unknown) => `RD$ ${Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (value: unknown) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('es-DO') : 'Sin vencimiento';

const statusMeta: Record<string, { label: string; className: string }> = {
  active: { label: 'Activo', className: 'bg-emerald-50 text-emerald-700' },
  depleted: { label: 'Agotado', className: 'bg-gray-100 text-gray-500' },
  expired: { label: 'Vencido', className: 'bg-red-50 text-red-700' },
  quarantined: { label: 'En cuarentena', className: 'bg-amber-50 text-amber-700' },
  recalled: { label: 'Retirado', className: 'bg-purple-50 text-purple-700' },
};

const daysUntil = (value: unknown) => {
  if (!value) return null;
  const expiry = new Date(`${String(value).slice(0, 10)}T23:59:59`);
  return Math.ceil((expiry.getTime() - Date.now()) / 86400000);
};

const ProductBatchesPanel = ({ storeId, products = [] }: { storeId: string; products: any[] }) => {
  const [batches, setBatches] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ expired: 0, expiring_7_days: 0, expiring_30_days: 0, value_at_risk: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ store_id: storeId });
      if (status) query.set('status', status);
      const [batchPayload, summaryPayload] = await Promise.all([
        api.get(`/inventory/batches?${query.toString()}`),
        api.get(`/inventory/batches/expiring?store_id=${encodeURIComponent(storeId)}&days=30`),
      ]);
      setBatches(Array.isArray(batchPayload?.items) ? batchPayload.items : []);
      setSummary(summaryPayload || {});
    } catch (err: any) {
      setError(err?.message || 'No se pudieron cargar los lotes');
    } finally {
      setLoading(false);
    }
  }, [status, storeId]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    if (!term) return batches;
    return batches.filter((batch) => `${batch.product_name} ${batch.lot_number}`.toLocaleLowerCase('es').includes(term));
  }, [batches, search]);

  const trackedProducts = useMemo(() => products.filter((product) => Boolean(product.track_batches)), [products]);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="font-black text-gray-900">Lotes y vencimientos</h3>
          <p className="mt-1 text-xs text-gray-500">Control FEFO, trazabilidad de entradas y alertas para retirar mercancía antes de su vencimiento.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-black text-gray-600">
            <FiRefreshCw className={`mr-2 inline ${loading ? 'animate-spin' : ''}`} />Actualizar
          </button>
          <button type="button" onClick={() => setShowCreate(true)} className="rounded-xl bg-[#00a884] px-4 py-2.5 text-xs font-black text-white">
            <FiPlus className="mr-2 inline" />Registrar lote
          </button>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs font-bold text-red-700">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={FiAlertTriangle} label="Vencidos con existencia" value={summary.expired || 0} tone="red" />
        <Metric icon={FiCalendar} label="Vencen en 7 días" value={summary.expiring_7_days || 0} tone="amber" />
        <Metric icon={FiCalendar} label="Vencen en 30 días" value={summary.expiring_30_days || 0} tone="blue" />
        <Metric icon={FiShield} label="Valor en riesgo" value={formatMoney(summary.value_at_risk || 0)} tone="emerald" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="flex flex-col gap-3 border-b bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 gap-2">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto o lote" className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#00a884]" />
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm">
              <option value="">Todos</option><option value="active">Activos</option><option value="expired">Vencidos</option><option value="quarantined">Cuarentena</option><option value="recalled">Retirados</option><option value="depleted">Agotados</option>
            </select>
          </div>
          <p className="text-xs font-bold text-gray-400">{visible.length} lote(s)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3 text-left">Producto</th><th className="px-4 py-3 text-left">Lote</th><th className="px-4 py-3 text-right">Inicial</th><th className="px-4 py-3 text-right">Disponible</th><th className="px-4 py-3 text-right">Costo</th><th className="px-4 py-3 text-left">Vencimiento</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3"></th></tr></thead>
            <tbody>
              {visible.map((batch) => {
                const remainingDays = daysUntil(batch.expiry_date);
                const meta = statusMeta[batch.status] || statusMeta.active;
                return <tr key={batch.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3"><b className="text-gray-800">{batch.product_name}</b><p className="text-[10px] text-gray-400">Recibido {formatDate(batch.received_at)}</p></td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-gray-600">{batch.lot_number}</td>
                  <td className="px-4 py-3 text-right">{formatQuantity(batch.initial_quantity)}</td>
                  <td className="px-4 py-3 text-right font-black text-gray-800">{formatQuantity(batch.available_quantity)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(batch.unit_cost)}</td>
                  <td className="px-4 py-3"><b className={remainingDays !== null && remainingDays < 0 ? 'text-red-700' : remainingDays !== null && remainingDays <= 30 ? 'text-amber-700' : 'text-gray-700'}>{formatDate(batch.expiry_date)}</b>{remainingDays !== null && <p className="text-[10px] text-gray-400">{remainingDays < 0 ? `Venció hace ${Math.abs(remainingDays)} día(s)` : remainingDays === 0 ? 'Vence hoy' : `Faltan ${remainingDays} día(s)`}</p>}</td>
                  <td className="px-4 py-3 text-center"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${meta.className}`}>{meta.label}</span></td>
                  <td className="px-4 py-3 text-right"><button type="button" onClick={() => setEditing(batch)} className="rounded-lg bg-gray-100 p-2 text-gray-600" title="Administrar lote"><FiEdit3 /></button></td>
                </tr>;
              })}
              {visible.length === 0 && <tr><td colSpan={8} className="p-12 text-center text-gray-400">No hay lotes para los filtros seleccionados.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {trackedProducts.length === 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><b>Activa el control por lotes</b> desde la pestaña Compras y reposición, dentro de la política de cada producto que tenga vencimiento.</div>}

      {showCreate && <CreateBatchModal storeId={storeId} products={products} onClose={() => setShowCreate(false)} onSaved={async () => { setShowCreate(false); window.dispatchEvent(new CustomEvent('colmapro:data-changed')); await load(); }} />}
      {editing && <EditBatchModal batch={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />}
    </div>
  );
};

const Metric = ({ icon: Icon, label, value, tone }: any) => {
  const tones: Record<string, string> = { red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-700', blue: 'bg-blue-50 text-blue-700', emerald: 'bg-emerald-50 text-emerald-700' };
  return <div className="rounded-2xl border border-gray-200 bg-white p-4"><div className={`mb-3 inline-flex rounded-xl p-2 ${tones[tone] || tones.emerald}`}><Icon /></div><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</p><p className="mt-1 text-xl font-black text-gray-900">{value}</p></div>;
};

const Modal = ({ title, onClose, children }: any) => <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"><div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-5"><h3 className="font-black text-gray-900">{title}</h3><button type="button" onClick={onClose} className="rounded-full bg-gray-100 p-2 text-gray-500"><FiX /></button></div><div className="p-5">{children}</div></div></div>;

const CreateBatchModal = ({ storeId, products, onClose, onSaved }: any) => {
  const [form, setForm] = useState({ product_id: '', lot_number: '', expiry_date: '', quantity: 0, unit_cost: 0, notes: '', add_to_stock: false });
  const [error, setError] = useState('');
  const product = products.find((item: any) => String(item.id) === form.product_id);
  const save = async () => {
    setError('');
    if (!form.product_id || !form.lot_number.trim() || form.quantity <= 0) { setError('Selecciona el producto, indica el lote y una cantidad válida'); return; }
    try { await api.post('/inventory/batches', { ...form, store_id: storeId }); await onSaved(); } catch (err: any) { setError(err?.message || 'No se pudo registrar el lote'); }
  };
  return <Modal title="Registrar lote existente" onClose={onClose}><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-black text-gray-600 sm:col-span-2">Producto<select value={form.product_id} onChange={(event) => { const selected = products.find((item: any) => String(item.id) === event.target.value); setForm({ ...form, product_id: event.target.value, unit_cost: Number(selected?.cost || 0) }); }} className="mt-1 w-full rounded-xl border p-3"><option value="">Selecciona un producto</option>{products.map((item: any) => <option key={item.id} value={item.id}>{item.name}{item.track_batches ? '' : ' · control por lote desactivado'}</option>)}</select></label><label className="text-xs font-black text-gray-600">Número de lote<input value={form.lot_number} onChange={(event) => setForm({ ...form, lot_number: event.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label><label className="text-xs font-black text-gray-600">Fecha de vencimiento<input type="date" value={form.expiry_date} onChange={(event) => setForm({ ...form, expiry_date: event.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label><label className="text-xs font-black text-gray-600">Cantidad inicial<input type="number" min="0.01" step="0.01" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} className="mt-1 w-full rounded-xl border p-3" /></label><label className="text-xs font-black text-gray-600">Costo unitario<input type="number" min="0" step="0.01" value={form.unit_cost} onChange={(event) => setForm({ ...form, unit_cost: Number(event.target.value) })} className="mt-1 w-full rounded-xl border p-3" /></label><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Notas del lote" className="rounded-xl border p-3 sm:col-span-2" /><label className="flex items-start gap-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-800 sm:col-span-2"><input type="checkbox" checked={form.add_to_stock} onChange={(event) => setForm({ ...form, add_to_stock: event.target.checked })} className="mt-1" /><span><b>Sumar al inventario general</b><br /><span className="text-xs">Actívalo solo cuando esta cantidad todavía no esté incluida en la existencia del producto. Las recepciones de órdenes la suman automáticamente.</span></span></label>{product && !product.track_batches && <p className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800 sm:col-span-2">Al registrar el primer lote se activará el control por lotes para este producto.</p>}{error && <p className="text-xs font-bold text-red-600 sm:col-span-2">{error}</p>}<button type="button" onClick={save} className="rounded-xl bg-[#00a884] py-3 font-black text-white sm:col-span-2"><FiCheckCircle className="mr-2 inline" />Guardar lote</button></div></Modal>;
};

const movementLabels: Record<string, string> = {
  initial: 'Registro inicial', receipt: 'Recepción de compra', sale: 'Salida por venta', return: 'Devolución',
  adjustment: 'Ajuste', expiration: 'Vencimiento', quarantine: 'Cuarentena', reactivation: 'Reactivación', recall: 'Retiro',
};

const EditBatchModal = ({ batch, onClose, onSaved }: any) => {
  const [form, setForm] = useState({
    status: batch.status || 'active',
    notes: batch.notes || '',
    lot_number: batch.lot_number || '',
    expiry_date: batch.expiry_date ? String(batch.expiry_date).slice(0, 10) : '',
  });
  const [movements, setMovements] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoadingHistory(true);
    api.get(`/inventory/batches/${batch.id}/movements`)
      .then((payload) => { if (active) setMovements(Array.isArray(payload?.items) ? payload.items : []); })
      .catch(() => { if (active) setMovements([]); })
      .finally(() => { if (active) setLoadingHistory(false); });
    return () => { active = false; };
  }, [batch.id]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      if (!form.lot_number.trim()) throw new Error('El número de lote es obligatorio');
      await api.patch(`/inventory/batches/${batch.id}`, { ...form, clear_expiry: !form.expiry_date, replace_notes: true });
      await onSaved();
    } catch (err: any) {
      setError(err?.message || 'No se pudo actualizar el lote');
    } finally {
      setSaving(false);
    }
  };

  return <Modal title={`Administrar lote ${batch.lot_number}`} onClose={onClose}>
    <div className="space-y-5">
      <div className="rounded-2xl bg-gray-50 p-4">
        <b className="text-gray-900">{batch.product_name}</b>
        <p className="mt-1 text-xs text-gray-500">Disponible: {formatQuantity(batch.available_quantity)} · Costo: {formatMoney(batch.unit_cost)}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-black text-gray-600">Número de lote
          <input value={form.lot_number} onChange={(event) => setForm({ ...form, lot_number: event.target.value })} className="mt-1 w-full rounded-xl border p-3" />
        </label>
        <label className="text-xs font-black text-gray-600">Fecha de vencimiento
          <input type="date" value={form.expiry_date} onChange={(event) => setForm({ ...form, expiry_date: event.target.value })} className="mt-1 w-full rounded-xl border p-3" />
        </label>
        <label className="text-xs font-black text-gray-600 sm:col-span-2">Estado
          <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="mt-1 w-full rounded-xl border p-3">
            <option value="active">Activo y disponible para venta</option>
            <option value="quarantined">Cuarentena temporal</option>
            <option value="recalled">Retirado del mercado</option>
            <option value="expired">Vencido</option>
            <option value="depleted">Agotado</option>
          </select>
        </label>
        <label className="text-xs font-black text-gray-600 sm:col-span-2">Observaciones
          <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="mt-1 w-full rounded-xl border p-3" />
        </label>
      </div>
      <section className="overflow-hidden rounded-2xl border border-gray-200">
        <div className="flex items-center gap-2 border-b bg-gray-50 px-4 py-3"><FiActivity className="text-[#00a884]" /><h4 className="text-sm font-black text-gray-800">Historial del lote</h4></div>
        <div className="max-h-64 divide-y overflow-y-auto">
          {movements.map((movement) => <div key={movement.id} className="flex items-start justify-between gap-4 p-4 text-xs">
            <div><b className="text-gray-700">{movementLabels[movement.movement_type] || movement.movement_type}</b><p className="mt-1 text-gray-400">{movement.reason || 'Sin observación'} · {movement.actor_id || 'Sistema'}</p></div>
            <div className="text-right"><b className={Number(movement.quantity_delta) < 0 ? 'text-red-600' : Number(movement.quantity_delta) > 0 ? 'text-emerald-600' : 'text-gray-500'}>{Number(movement.quantity_delta) > 0 ? '+' : ''}{formatQuantity(movement.quantity_delta)}</b><p className="mt-1 whitespace-nowrap text-[10px] text-gray-400">{new Date(movement.created_at).toLocaleString('es-DO')}</p></div>
          </div>)}
          {!loadingHistory && movements.length === 0 && <p className="p-6 text-center text-xs text-gray-400">Este lote todavía no tiene movimientos registrados.</p>}
          {loadingHistory && <p className="p-6 text-center text-xs text-gray-400">Cargando historial...</p>}
        </div>
      </section>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
      <button type="button" disabled={saving} onClick={save} className="w-full rounded-xl bg-[#00a884] py-3 font-black text-white disabled:opacity-50"><FiCheckCircle className="mr-2 inline" />{saving ? 'Guardando...' : 'Guardar cambios'}</button>
    </div>
  </Modal>;
};

export default ProductBatchesPanel;
