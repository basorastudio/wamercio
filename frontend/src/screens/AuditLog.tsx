import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiActivity, FiChevronLeft, FiChevronRight, FiFilter, FiRefreshCw, FiSearch, FiShield } from 'react-icons/fi';
import { useStore } from '@/context/StoreContext';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/timezone';

type AuditEntry = {
  id: string;
  actor_id?: string;
  actor_role?: string;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  request_id?: string;
  details?: Record<string, unknown> | string;
  created_at?: string;
};

const actionLabels: Record<string, string> = {
  'sale.created': 'Venta registrada',
  'sale.voided': 'Venta anulada',
  'sale.returned': 'Devolución registrada',
  'order.status.changed': 'Estado de pedido actualizado',
  'delivery.incident.reported': 'Incidencia de entrega reportada',
  'delivery.incident.resolved': 'Incidencia de entrega resuelta',
  'inventory.disposition.recorded': 'Destino de mercancía registrado',
  'inventory.adjusted': 'Inventario ajustado',
  'cash.session.opened': 'Caja abierta',
  'cash.session.closed': 'Caja cerrada',
  'cash.movement.created': 'Movimiento de caja',
  'store_credit.payment.recorded': 'Abono de fiado registrado',
  'account.recovery.completed': 'Cuenta recuperada',
};

const roleLabels: Record<string, string> = {
  administrator: 'Administrador',
  cashier: 'Cajero',
  delivery_driver: 'Repartidor',
  customer: 'Cliente',
  system: 'Sistema',
};

const entityLabels: Record<string, string> = {
  sale: 'Venta',
  sale_return: 'Devolución',
  product: 'Producto',
  inventory: 'Inventario',
  cash_session: 'Sesión de caja',
  cash_movement: 'Movimiento de caja',
  store_credit: 'Fiado',
  account: 'Cuenta',
  delivery_incident: 'Incidencia de entrega',
};

const detailsText = (details: AuditEntry['details']) => {
  if (!details) return 'Sin información adicional';
  if (typeof details === 'string') {
    try {
      return detailsText(JSON.parse(details));
    } catch (_) {
      return details;
    }
  }
  const entries = Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 6)
    .map(([key, value]) => `${key.replaceAll('_', ' ')}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
  return entries.join(' · ') || 'Sin información adicional';
};

const AuditLog = () => {
  const { activeStoreId } = useStore();
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const pageSize = 50;

  const load = useCallback(async () => {
    if (!activeStoreId) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/audit-logs?store_id=${encodeURIComponent(activeStoreId)}&limit=${pageSize}&offset=${page * pageSize}`);
      setItems(Array.isArray(response?.items) ? response.items : []);
      setHasMore(Boolean(response?.has_more));
    } catch (requestError: any) {
      setError(requestError?.message || 'No se pudo cargar la auditoría.');
    } finally {
      setLoading(false);
    }
  }, [activeStoreId, page]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(0); }, [activeStoreId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (role && item.actor_role !== role) return false;
      if (!term) return true;
      return [item.action, actionLabels[item.action || ''], item.entity_type, item.entity_id, item.actor_role, detailsText(item.details)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [items, role, search]);

  return (
    <div className="min-h-full bg-[#f8fafc] p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#00a884]"><FiShield /><span className="text-[10px] font-black uppercase tracking-[0.2em]">Control interno</span></div>
            <h1 className="mt-1 text-2xl font-black text-gray-900">Auditoría operativa</h1>
            <p className="mt-1 text-sm text-gray-500">Consulta quién realizó cada operación sensible dentro del negocio.</p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-black text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50">
            <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>

        <div className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_220px]">
          <label className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar acción, entidad o detalle..." className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-4 text-sm outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10" />
          </label>
          <label className="relative">
            <FiFilter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select value={role} onChange={(event) => setRole(event.target.value)} className="w-full appearance-none rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm font-bold text-gray-700 outline-none focus:border-[#00a884]">
              <option value="">Todos los responsables</option>
              <option value="administrator">Administradores</option>
              <option value="cashier">Cajeros</option>
              <option value="delivery_driver">Repartidores</option>
              <option value="customer">Clientes</option>
              <option value="system">Sistema</option>
            </select>
          </label>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {error && <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-bold text-red-700">{error}</div>}
          {loading ? (
            <div className="flex min-h-72 items-center justify-center text-sm font-bold text-gray-400"><FiRefreshCw className="mr-2 animate-spin" /> Cargando auditoría...</div>
          ) : filtered.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center text-center"><FiActivity className="mb-3 text-4xl text-gray-300" /><p className="font-black text-gray-700">No hay registros para mostrar</p><p className="mt-1 text-xs text-gray-400">Los cambios sensibles aparecerán aquí automáticamente.</p></div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map((item) => (
                <article key={item.id} className="p-4 transition-colors hover:bg-gray-50 md:p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#00a884]/10 px-2.5 py-1 text-[10px] font-black text-[#008f70]">{actionLabels[item.action || ''] || item.action || 'Operación'}</span>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold text-gray-600">{roleLabels[item.actor_role || ''] || item.actor_role || 'Usuario'}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{entityLabels[item.entity_type || ''] || item.entity_type || 'Registro'}</span>
                      </div>
                      <p className="mt-3 break-words text-xs leading-5 text-gray-600">{detailsText(item.details)}</p>
                      {item.entity_id && <p className="mt-2 truncate font-mono text-[10px] text-gray-400">Referencia: {item.entity_id}</p>}
                    </div>
                    <time className="shrink-0 text-xs font-bold text-gray-500">{item.created_at ? formatDateTime(item.created_at) : 'Fecha no disponible'}</time>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs font-bold text-gray-500">Página {page + 1}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0 || loading} className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 disabled:opacity-30"><FiChevronLeft /></button>
              <button onClick={() => setPage((current) => current + 1)} disabled={!hasMore || loading} className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 disabled:opacity-30"><FiChevronRight /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditLog;
