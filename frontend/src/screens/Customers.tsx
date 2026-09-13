import React, { useCallback, useEffect, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { formatDate } from '../lib/timezone';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import { nationalIdDigits, formatDominicanId } from '../lib/nationalId';
import UserAvatar from '../common/UserAvatar';
import { api } from '../lib/api';

const {
  FiCheck, FiUser, FiMapPin, FiHome, FiX, FiUsers, FiExternalLink, FiSearch, FiBookOpen, FiDollarSign, FiAlertTriangle, FiLock, FiChevronLeft, FiChevronRight, FiRefreshCw
} = FiIcons;


const customerAddressLine = (client: any) => [
  client?.province,
  client?.municipality,
  client?.sector || client?.neighborhood,
  client?.street ? `${client.street}${client.street_number ? ` #${client.street_number}` : ''}` : '',
  client?.address_reference,
].filter(Boolean).join(', ');

const customerMapQuery = (client: any) => {
  if (client?.lat && client?.lng) return `${client.lat},${client.lng}`;
  return customerAddressLine(client);
};

const canOpenCustomerMap = (client: any) => Boolean(customerMapQuery(client));


const normalizeCreditEntry = (entry: any) => {
  if (entry === true) {
    return { enabled: true, type: 'unlimited', limit: 0, status: 'active' };
  }
  if (entry && typeof entry === 'object') {
    const type = String(entry.type || 'limited');
    const status = String(entry.status || (entry.enabled === false ? 'blocked' : 'active'));
    return {
      enabled: entry.enabled !== false && status !== 'blocked',
      type: type === 'unlimited' ? 'unlimited' : 'limited',
      limit: Number(entry.limit || 0),
      status,
    };
  }
  return { enabled: false, type: 'limited', limit: 0, status: 'blocked' };
};

const isCreditConfigured = (entry: any) => {
  const cfg = normalizeCreditEntry(entry);
  return cfg.enabled && cfg.status !== 'blocked' && (cfg.type === 'unlimited' || cfg.limit > 0);
};

const isCreditEnabled = (entry: any) => {
  const cfg = normalizeCreditEntry(entry);
  return cfg.enabled && cfg.status !== 'blocked';
};

const defaultCreditConfig = () => ({ enabled: true, type: 'limited', limit: 0, status: 'active' });

const creditSummary = (entry: any) => {
  const cfg = normalizeCreditEntry(entry);
  if (!cfg.enabled || cfg.status === 'blocked') return 'Sin acceso';
  if (cfg.type === 'unlimited') return 'Ilimitado';
  if (cfg.limit > 0) return `Límite RD$ ${Number(cfg.limit).toLocaleString('es-DO')}`;
  return 'Define el límite';
};

const Customers = () => {
  const { stores, globalCustomers, updateCustomerStoreCredit } = useStore();
  const [searchTerm, setSearchTerm]               = useState('');
  const [modalClient, setModalClient]             = useState(null);
  const [locationModalClient, setLocationModalClient] = useState(null);
  const [localCredits, setLocalCredits]           = useState({});
  const [creditError, setCreditError]             = useState('');
  const [customers, setCustomers]                   = useState<any[]>(globalCustomers.slice(0, 50));
  const [totalCustomers, setTotalCustomers]         = useState(globalCustomers.length);
  const [page, setPage]                             = useState(0);
  const [hasMore, setHasMore]                       = useState(false);
  const [loadingCustomers, setLoadingCustomers]     = useState(false);
  const pageSize = 50;

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      const response = await api.get(`/customers?${params.toString()}`);
      setCustomers(Array.isArray(response?.items) ? response.items : []);
      setTotalCustomers(Number(response?.total || 0));
      setHasMore(Boolean(response?.has_more));
    } finally {
      setLoadingCustomers(false);
    }
  }, [page, searchTerm]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadCustomers(); }, 250);
    return () => window.clearTimeout(timer);
  }, [loadCustomers]);

  useEffect(() => { setPage(0); }, [searchTerm]);

  const activeStoresCount = stores.filter(store =>
    customers.some(customer => isCreditConfigured((customer.store_credit || customer.storeCredit || {})[store.id]))
  ).length;

  const filteredCustomers = customers;

  const openModal = (client) => {
    setModalClient(client);
    setLocalCredits(client.store_credit || client.storeCredit || {});
    setCreditError('');
  };

  const closeModal = () => { setModalClient(null); setLocalCredits({}); setCreditError(''); };

  const updateStoreCredit = (storeId, patch) => {
    setLocalCredits(prev => {
      const current = normalizeCreditEntry(prev[storeId]);
      return { ...prev, [storeId]: { ...current, ...patch } };
    });
  };

  const toggleStore  = (storeId) => {
    setLocalCredits(prev => {
      const current = normalizeCreditEntry(prev[storeId]);
      const next = isCreditEnabled(current)
        ? { ...current, enabled: false, status: 'blocked' }
        : defaultCreditConfig();
      return { ...prev, [storeId]: next };
    });
  };
  const activateAll  = () => {
    const all = {};
    stores.forEach(store => { all[store.id] = normalizeCreditEntry(localCredits[store.id] || defaultCreditConfig()); all[store.id].enabled = true; all[store.id].status = 'active'; });
    setLocalCredits(all);
    setCreditError('Define el tipo de fiado y el límite de cada negocio activado antes de guardar.');
  };
  const deactivateAll = () => {
    const none = {};
    stores.forEach(store => { none[store.id] = { ...normalizeCreditEntry(localCredits[store.id]), enabled: false, status: 'blocked' }; });
    setLocalCredits(none);
    setCreditError('');
  };

  const saveChanges = async () => {
    const normalized = {};
    for (const store of stores) {
      const cfg = normalizeCreditEntry(localCredits[store.id]);
      normalized[store.id] = cfg;
      if (cfg.enabled && cfg.status !== 'blocked' && cfg.type === 'limited' && Number(cfg.limit || 0) <= 0) {
        setCreditError(`Define un límite mayor que 0 para ${store.name} o selecciona crédito ilimitado.`);
        return;
      }
    }
    await updateCustomerStoreCredit(modalClient.id, normalized);
    await loadCustomers();
    closeModal();
  };

  return (
    <div className="flex flex-col h-full bg-white md:p-8 p-4 w-full overflow-y-auto">

      <div className="flex justify-end mb-2">
        <div className="bg-[#eafaf1] text-[#00a884] px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 border border-[#00a884]/20 shadow-sm">
          <FiCheck className="text-sm" /> Crédito activo en {activeStoresCount} negocio(s)
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-1">Clientes registrados en la plataforma</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
            <input
              type="text"
              placeholder="Buscar por nombre, cédula o WhatsApp..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#00a884] transition-colors"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="inline-flex items-center gap-1.5 bg-[#eafaf1] text-[#00a884] px-3 py-1.5 rounded-full text-[11px] font-bold border border-[#00a884]/20">
          <FiUsers className="text-sm" /> {totalCustomers} cliente{totalCustomers !== 1 ? 's' : ''} registrado{totalCustomers !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex-1">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="bg-[#f8fafc] border-b border-gray-100">
              <tr>
                <th className="px-5 py-4 text-xs font-bold text-gray-500">Cliente</th>
                <th className="px-5 py-4 text-xs font-bold text-gray-500">Cédula</th>
                <th className="px-5 py-4 text-xs font-bold text-gray-500">WhatsApp</th>
                <th className="px-5 py-4 text-xs font-bold text-gray-500">Dirección</th>
                <th className="px-5 py-4 text-xs font-bold text-gray-500">Calle</th>
                <th className="px-5 py-4 text-xs font-bold text-gray-500">Ubicación</th>
                <th className="px-5 py-4 text-xs font-bold text-gray-500 text-center">Crédito (Fiado)</th>
                <th className="px-5 py-4 text-xs font-bold text-gray-500">Registrado</th>
              </tr>
            </thead>
            <tbody>
              {loadingCustomers ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-sm font-bold text-gray-400"><FiRefreshCw className="mx-auto mb-2 animate-spin text-xl" /> Cargando clientes...</td></tr>
              ) : filteredCustomers.map(client => {
                const storeCredit  = client.store_credit || client.storeCredit || {};
                const activeCount  = stores.filter(s => isCreditConfigured(storeCredit[s.id])).length;
                const totalCount   = stores.length;
                const isActive     = activeCount > 0;
                const registeredAt = client.registered_at
                  ? formatDate(client.registered_at, { day: '2-digit', month: 'short', year: 'numeric' })
                  : '—';

                return (
                  <tr key={client.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <UserAvatar user={client} name={client.name} className="w-10 h-10 bg-[#00a884]/10 rounded-full flex items-center justify-center text-[#00a884] shrink-0 border border-[#00a884]/20" icon={FiUser} />
                        <span className="font-bold text-gray-900 text-sm">{client.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-gray-600 font-medium">{formatDominicanId(client.national_id)}</td>
                    <td className="px-5 py-4 text-xs font-bold text-[#00a884]">{client.whatsappDisplay || client.whatsapp_display || client.whatsapp}</td>
                    <td className="px-5 py-4">
                      <div className="text-[11px] text-gray-500 leading-snug">
                        <p className="font-bold text-gray-700">{client.province}</p>
                        <p>{client.municipality}</p>
                        <p>{client.sector || client.neighborhood}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-[11px] text-gray-500 leading-snug">
                        <p>{client.street}{client.street_number ? ` #${client.street_number}` : ''}</p>
                        {client.address_reference && (
                          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md mt-1 inline-block text-[9px] font-bold tracking-wide uppercase">
                            {client.address_reference}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {canOpenCustomerMap(client) ? (
                        <button
                          onClick={() => setLocationModalClient(client)}
                          className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 w-max border border-blue-100 hover:bg-blue-100 transition-colors"
                          title="Ver ubicación del cliente"
                        >
                          <FiMapPin className="text-xs" /> {client.lat && client.lng ? `${client.lat}, ${client.lng}` : 'Ver por dirección'}
                        </button>
                      ) : (
                        <span className="text-[10px] text-gray-400">Sin ubicación</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <button
                          onClick={() => openModal(client)}
                          className={`px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 border transition-all ${
                            isActive
                              ? 'bg-[#eafaf1] text-[#00a884] border-[#00a884]/30 hover:bg-[#dcfce7]'
                              : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {isActive && <FiCheck className="text-xs" />}
                          {activeCount}/{totalCount} {isActive ? 'activo' : 'inactivo'}
                        </button>
                        <button onClick={() => openModal(client)}
                          className="text-[10px] text-gray-400 font-medium hover:text-gray-700 transition-colors underline decoration-gray-300 underline-offset-2"
                        >
                          Gestionar
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[11px] text-gray-500 font-medium">{registeredAt}</td>
                  </tr>
                );
              })}
              {!loadingCustomers && filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-500 font-medium">
                    {totalCustomers === 0
                      ? 'No hay clientes registrados aún'
                      : 'No se encontraron clientes con ese criterio'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-xs font-bold text-gray-500">Mostrando {customers.length} de {totalCustomers} · Página {page + 1}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage(current => Math.max(0, current - 1))} disabled={page === 0 || loadingCustomers} className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 disabled:opacity-30"><FiChevronLeft /></button>
            <button type="button" onClick={() => setPage(current => current + 1)} disabled={!hasMore || loadingCustomers} className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 disabled:opacity-30"><FiChevronRight /></button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {modalClient && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
              onClick={closeModal}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 16 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="pointer-events-auto w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)]"
              >
              <div className="p-6 border-b border-gray-100 flex justify-between items-start shrink-0">
                <div>
                  <h2 className="text-lg font-black text-gray-900">Crédito (Fiado) por negocio</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{modalClient.name}</p>
                </div>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-700 transition-colors p-1">
                  <FiX className="text-xl" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto">
                <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                  Activa el fiado solo para clientes específicos. Al habilitarlo debes definir si será limitado o ilimitado para evitar confusiones al momento de pagar.
                </p>

                <div className="space-y-3 mb-6">
                  {stores.map(store => {
                    const cfg = normalizeCreditEntry(localCredits[store.id]);
                    const isAct = isCreditEnabled(cfg);
                    const isConfigured = isCreditConfigured(cfg);
                    return (
                      <div key={store.id}
                        className={`border rounded-2xl p-4 bg-white shadow-sm transition-colors ${
                          isAct ? 'border-[#00a884]/25' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex items-center gap-4 min-w-0">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 border ${
                              isAct ? 'bg-[#f0fbf8] border-[#00a884]/20' : 'bg-gray-50 border-gray-100'
                            }`}>
                              <FiHome className={isAct ? 'text-[#00a884]' : 'text-gray-400'} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900 truncate">{store.name}</p>
                              <p className={`text-[11px] font-bold mt-0.5 ${isConfigured ? 'text-[#00a884]' : isAct ? 'text-amber-600' : 'text-gray-400'}`}>
                                {creditSummary(cfg)}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => toggleStore(store.id)}
                            className={`w-[46px] h-[26px] rounded-full transition-colors relative flex items-center px-0.5 shrink-0 ${
                              isAct ? 'bg-[#00a884]' : 'bg-gray-200'
                            }`}
                            title={isAct ? 'Desactivar fiado' : 'Activar fiado'}
                          >
                            <div className={`w-[22px] h-[22px] bg-white rounded-full shadow-sm transition-transform ${
                              isAct ? 'translate-x-[20px]' : 'translate-x-0'
                            }`} />
                          </button>
                        </div>

                        {isAct && (
                          <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Tipo de fiado</p>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => updateStoreCredit(store.id, { type: 'limited', status: 'active', enabled: true })}
                                  className={`rounded-xl border px-3 py-2.5 text-xs font-black transition-colors flex items-center justify-center gap-2 ${
                                    cfg.type === 'limited' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-gray-200 text-gray-500 hover:border-amber-200'
                                  }`}
                                >
                                  <FiLock className="text-sm" /> Limitado
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateStoreCredit(store.id, { type: 'unlimited', limit: 0, status: 'active', enabled: true })}
                                  className={`rounded-xl border px-3 py-2.5 text-xs font-black transition-colors flex items-center justify-center gap-2 ${
                                    cfg.type === 'unlimited' ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-white border-gray-200 text-gray-500 hover:border-purple-200'
                                  }`}
                                >
                                  <FiBookOpen className="text-sm" /> Ilimitado
                                </button>
                              </div>
                            </div>

                            {cfg.type === 'limited' && (
                              <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Límite disponible RD$</label>
                                <div className="relative">
                                  <FiDollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                                  <input
                                    type="number"
                                    min="0"
                                    value={cfg.limit || ''}
                                    onChange={(e) => updateStoreCredit(store.id, { limit: Number(e.target.value || 0), status: 'active', enabled: true })}
                                    placeholder="Ej: 5000"
                                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm font-bold text-gray-800 outline-none transition-colors focus:border-[#00a884] focus:ring-2 focus:ring-[#00a884]/15"
                                  />
                                </div>
                                {Number(cfg.limit || 0) <= 0 && (
                                  <p className="mt-1.5 text-[10px] font-bold text-amber-600">Define un límite mayor que 0 para que el cliente pueda pagar con fiado.</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {creditError && (
                  <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700 flex items-start gap-2">
                    <FiAlertTriangle className="text-sm shrink-0 mt-0.5" />
                    <span>{creditError}</span>
                  </div>
                )}

                <div className="flex gap-3 mb-6">
                  <button onClick={activateAll}
                    className="flex-1 py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-[#00a884] hover:bg-[#f0fbf8] hover:border-[#00a884]/30 transition-all"
                  >
                    Activar todos
                  </button>
                  <button onClick={deactivateAll}
                    className="flex-1 py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-50 transition-all"
                  >
                    Desactivar todos
                  </button>
                </div>

                <div className="flex justify-center gap-3 pt-4 border-t border-gray-100">
                  <button onClick={closeModal}
                    className="px-8 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button onClick={saveChanges}
                    className="px-8 py-2.5 bg-[#00a884] rounded-xl text-sm font-bold text-white hover:bg-[#009676] transition-colors shadow-sm"
                  >
                    Guardar cambios
                  </button>
                </div>
              </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {locationModalClient && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
              onClick={() => setLocationModalClient(null)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 16 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="pointer-events-auto w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[min(75vh,calc(100vh-2rem))]"
              >
              <div className="p-4 border-b border-gray-100 flex justify-between items-start shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center shrink-0">
                    <FiMapPin />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-gray-900">{locationModalClient.name}</h2>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {customerAddressLine(locationModalClient) || 'Dirección no disponible'}
                    </p>
                  </div>
                </div>
                <button onClick={() => setLocationModalClient(null)} className="text-gray-400 hover:text-gray-700 p-1">
                  <FiX className="text-xl" />
                </button>
              </div>

              <div className="flex-1 bg-gray-100 relative w-full">
                <iframe
                  width="100%" height="100%"
                  style={{ border: 0 }} loading="lazy" allowFullScreen
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(customerMapQuery(locationModalClient))}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
                />
              </div>

              <div className="p-4 bg-white border-t border-gray-100 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2 text-[11px] text-gray-500 font-medium">
                  <FiMapPin className="text-blue-500" /> {locationModalClient.lat && locationModalClient.lng ? `${locationModalClient.lat}, ${locationModalClient.lng}` : customerAddressLine(locationModalClient)}
                </div>
                <a
                  href={`https://www.google.com/maps?q=${encodeURIComponent(customerMapQuery(locationModalClient))}`}
                  target="_blank" rel="noopener noreferrer"
                  className="bg-[#1a73e8] text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-[#1557b0] transition-colors shadow-sm"
                >
                  <FiExternalLink className="text-sm" /> Abrir en Google Maps
                </a>
              </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Customers;