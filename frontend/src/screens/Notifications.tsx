import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiBell, FiCheck, FiCheckCircle, FiRefreshCw } from 'react-icons/fi';
import { useStore } from '@/context/StoreContext';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/timezone';

type BusinessNotification = {
  id: string;
  title?: string;
  message?: string;
  event_type?: string;
  status?: string;
  read_at?: string;
  created_at?: string;
};

const Notifications = () => {
  const { activeStoreId } = useStore();
  const [items, setItems] = useState<BusinessNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUnread, setShowUnread] = useState(false);

  const load = useCallback(async () => {
    if (!activeStoreId) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/notifications?store_id=${encodeURIComponent(activeStoreId)}&limit=100`);
      setItems(Array.isArray(response?.items) ? response.items : []);
    } catch (requestError: any) {
      setError(requestError?.message || 'No se pudieron cargar las notificaciones.');
    } finally {
      setLoading(false);
    }
  }, [activeStoreId]);

  useEffect(() => { void load(); }, [load]);

  const unreadCount = items.filter((item) => item.status !== 'read' && !item.read_at).length;
  const visibleItems = useMemo(() => showUnread ? items.filter((item) => item.status !== 'read' && !item.read_at) : items, [items, showUnread]);

  const markRead = async (notification: BusinessNotification) => {
    if (notification.status === 'read' || notification.read_at) return;
    await api.patch(`/notifications/${notification.id}/read`, {});
    setItems((current) => current.map((item) => item.id === notification.id ? { ...item, status: 'read', read_at: new Date().toISOString() } : item));
  };

  const markAllRead = async () => {
    const unread = items.filter((item) => item.status !== 'read' && !item.read_at);
    await Promise.all(unread.map((item) => api.patch(`/notifications/${item.id}/read`, {}).catch(() => null)));
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, status: 'read', read_at: item.read_at || readAt })));
  };

  return (
    <div className="min-h-full bg-[#f8fafc] p-4 md:p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#00a884]"><FiBell /><span className="text-[10px] font-black uppercase tracking-[0.2em]">Centro operativo</span></div>
            <h1 className="mt-1 text-2xl font-black text-gray-900">Notificaciones</h1>
            <p className="mt-1 text-sm text-gray-500">Eventos importantes del negocio, pedidos, inventario, caja y fiado.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowUnread((current) => !current)} className={`rounded-xl border px-4 py-2.5 text-xs font-black ${showUnread ? 'border-[#00a884] bg-[#00a884]/10 text-[#008f70]' : 'border-gray-200 bg-white text-gray-600'}`}>{showUnread ? 'Mostrando pendientes' : `Pendientes (${unreadCount})`}</button>
            <button onClick={() => void load()} disabled={loading} className="rounded-xl border border-gray-200 bg-white p-3 text-gray-600 disabled:opacity-50"><FiRefreshCw className={loading ? 'animate-spin' : ''} /></button>
          </div>
        </div>

        {unreadCount > 0 && (
          <div className="flex items-center justify-between rounded-2xl border border-[#00a884]/20 bg-[#eafaf1] px-4 py-3">
            <p className="text-xs font-bold text-[#007f65]">Tienes {unreadCount} notificación{unreadCount === 1 ? '' : 'es'} pendiente{unreadCount === 1 ? '' : 's'}.</p>
            <button onClick={() => void markAllRead()} className="inline-flex items-center gap-1.5 text-xs font-black text-[#007f65]"><FiCheckCircle /> Marcar todas</button>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {error && <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-bold text-red-700">{error}</div>}
          {loading ? (
            <div className="flex min-h-72 items-center justify-center text-sm font-bold text-gray-400"><FiRefreshCw className="mr-2 animate-spin" /> Cargando notificaciones...</div>
          ) : visibleItems.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center text-center"><FiBell className="mb-3 text-4xl text-gray-300" /><p className="font-black text-gray-700">No hay notificaciones</p><p className="mt-1 text-xs text-gray-400">Los eventos importantes aparecerán aquí.</p></div>
          ) : (
            <div className="divide-y divide-gray-100">
              {visibleItems.map((item) => {
                const unread = item.status !== 'read' && !item.read_at;
                return (
                  <button key={item.id} onClick={() => void markRead(item)} className={`flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-gray-50 md:p-5 ${unread ? 'bg-[#f2fcf8]' : 'bg-white'}`}>
                    <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${unread ? 'bg-[#00a884] text-white' : 'bg-gray-100 text-gray-400'}`}><FiBell /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-gray-900">{item.title || 'Actualización del negocio'}</strong>{unread && <span className="rounded-full bg-[#00a884]/10 px-2 py-0.5 text-[9px] font-black uppercase text-[#008f70]">Nueva</span>}</span>
                      <span className="mt-1 block text-xs leading-5 text-gray-600">{item.message || 'Se registró una nueva actividad.'}</span>
                      <span className="mt-2 block text-[10px] font-bold text-gray-400">{item.created_at ? formatDateTime(item.created_at) : 'Fecha no disponible'}</span>
                    </span>
                    <span className={`mt-2 text-sm ${unread ? 'text-gray-300' : 'text-[#00a884]'}`}>{unread ? <span className="block h-2.5 w-2.5 rounded-full bg-[#00a884]" /> : <FiCheck />}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Notifications;
