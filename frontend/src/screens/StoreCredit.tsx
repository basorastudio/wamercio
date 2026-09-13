import React, { useState, useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import UserAvatar from '../common/UserAvatar';
import { formatDateTime } from '../lib/timezone';
import { AnimatePresence, motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';

const {
  FiSearch, FiShoppingCart, FiDollarSign, FiSettings, FiClipboard,
  FiLock, FiUnlock, FiX, FiUser, FiCalendar, FiInbox, FiPlus
} = FiIcons;

const fmt = (n) => Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2 });

const StoreCredit = () => {
  const { storeCredits, globalCustomers, activeStoreId, addStoreCreditCharge, addStoreCreditPayment, updateCustomerCreditConfig } = useStore();
  const [searchTerm, setSearchTerm]   = useState('');
  const [activeModal, setActiveModal] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [txAmount, setTxAmount]       = useState('');
  const [txNote, setTxNote]           = useState('');
  const [txMethod, setTxMethod]       = useState('cash');
  const [savingTx, setSavingTx]       = useState(false);
  const [txError, setTxError]         = useState('');
  const [configData, setConfigData]   = useState({ type: 'unlimited', limit: 0, status: 'active' });
  const [configError, setConfigError] = useState('');

  const currentStoreId = activeStoreId;
  const getCreditConfig = (customer) => {
    const credits = customer.store_credit || customer.storeCredit || {};
    const entry = currentStoreId ? credits[currentStoreId] : null;
    if (entry && typeof entry === 'object') {
      return {
        type: entry.type || 'limited',
        limit: Number(entry.limit || 0),
        status: entry.status || (entry.enabled === false ? 'blocked' : 'active'),
      };
    }
    if (entry === true) return { type: 'unlimited', limit: 0, status: 'active' };
    return { type: 'limited', limit: 0, status: 'blocked' };
  };

  const clientsData = useMemo(() => {
    const map: Record<string, any> = {};

    globalCustomers.forEach(c => {
      map[c.name] = {
        id: c.id,
        name: c.name,
        phone: c.whatsapp || '',
        profilePictureUrl: c.profilePictureUrl || c.profile_picture_url || c.avatar_url || c.avatarUrl || '',
        profile_picture_url: c.profile_picture_url || c.profilePictureUrl || c.avatar_url || c.avatarUrl || '',
        debt: 0,
        creditConfig: getCreditConfig(c),
        history: [],
      };
    });

    storeCredits.forEach(f => {
      if (!map[f.customer]) {
        map[f.customer] = {
          id: f.customer, name: f.customer, phone: '',
          debt: 0,
          creditConfig: { type: 'limited', limit: 0, status: 'active' },
          history: [],
        };
      }
      const client = map[f.customer];
      client.history.push(f);
      if (f.type === 'charge' && f.status !== 'reversed') {
        const paid = Number(f.paid_amount ?? f.paidAmount ?? 0);
        const remaining = Number(f.remaining_amount ?? f.remainingAmount ?? Math.max(0, Number(f.amount || 0) - paid));
        client.debt += Math.max(0, remaining);
      }
    });

    return Object.values(map);
  }, [storeCredits, globalCustomers, currentStoreId]);

  const filteredClients = clientsData.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  const totalDebt        = clientsData.reduce((sum, c) => sum + Math.max(0, c.debt), 0);
  const clientsWithDebt  = clientsData.filter(c => c.debt > 0).length;
  const totalRecords     = storeCredits.length;

  const openModal = (type, client) => {
    setSelectedClient(client);
    setConfigError('');
    if (type === 'charge' || type === 'payment') { setTxAmount(''); setTxNote(''); setTxMethod('cash'); setTxError(''); }
    else if (type === 'config') setConfigData(client.creditConfig);
    setActiveModal(type);
  };

  const closeModal = () => { setActiveModal(null); setSelectedClient(null); setConfigError(''); setTxError(''); };

  const handleSaveTx = async () => {
    const amount = Number(txAmount);
    if (!txAmount || Number.isNaN(amount) || amount <= 0) {
      setTxError('Ingresa un monto mayor que cero.');
      return;
    }
    if (activeModal === 'payment' && amount - Number(selectedClient?.debt || 0) > 0.01) {
      setTxError('El abono no puede superar la deuda pendiente.');
      return;
    }
    setSavingTx(true);
    setTxError('');
    try {
      if (activeModal === 'charge') await addStoreCreditCharge(selectedClient.name, amount, txNote);
      else await addStoreCreditPayment(selectedClient.name, amount, txNote, txMethod);
      closeModal();
    } catch (error: any) {
      setTxError(error?.message || 'No se pudo registrar la operación.');
    } finally {
      setSavingTx(false);
    }
  };

  const handleSaveConfig = () => {
    if (configData.type === 'limited' && Number(configData.limit || 0) <= 0) {
      setConfigError('Define un monto límite mayor que 0 o selecciona crédito ilimitado.');
      return;
    }
    updateCustomerCreditConfig(selectedClient.id || selectedClient.name, { ...configData, status: 'active' });
    closeModal();
  };

  const toggleLock = (client) => {
    const newStatus = client.creditConfig.status === 'active' ? 'blocked' : 'active';
    updateCustomerCreditConfig(client.id || client.name, { ...client.creditConfig, status: newStatus });
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] p-4 md:p-6 w-full">

      <div className="mb-5">
        <h1 className="text-2xl font-black text-gray-900">Crédito (Fiado)</h1>
        <p className="text-sm text-gray-500 mt-1">Gestiona los créditos de tus clientes</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Deuda total',         value: `RD$ ${fmt(totalDebt)}`,   color: 'text-red-600',   bg: 'bg-red-50',       border: 'border-red-100' },
          { label: 'Clientes con deuda',  value: clientsWithDebt,           color: 'text-gray-900',  bg: 'bg-white',        border: 'border-gray-200' },
          { label: 'Registros totales',   value: totalRecords,              color: 'text-gray-900',  bg: 'bg-white',        border: 'border-gray-200' },
          { label: 'Clientes en sistema', value: globalCustomers.length,    color: 'text-[#00a884]', bg: 'bg-[#eafaf1]',   border: 'border-[#00a884]/20' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-4 shadow-sm`}>
            <p className="text-xs font-bold text-gray-500 mb-1">{s.label}</p>
            <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
          <input
            type="text"
            placeholder="Buscar por nombre o WhatsApp..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#00a884] transition-colors"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex-1 overflow-y-auto">
        <table className="w-full text-left border-collapse min-w-[700px]">
          <thead className="bg-[#f8fafc] border-b border-gray-100 sticky top-0 z-10">
            <tr>
              <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Cliente</th>
              <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Deuda total</th>
              <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Estado</th>
              <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map(client => (
              <tr key={client.name} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <UserAvatar user={client} name={client.name} className="w-10 h-10 rounded-full bg-[#00a884]/10 text-[#00a884] flex items-center justify-center border border-[#00a884]/20 shrink-0" icon={FiUser} iconClassName="text-base" />
                    <div>
                      <p className="text-sm font-bold text-gray-900">{client.name}</p>
                      <p className="text-[10px] text-gray-400 font-medium">{client.phone || 'Sin WhatsApp'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <p className={`text-sm font-black ${client.debt > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    RD$ {fmt(Math.max(0, client.debt))}
                  </p>
                </td>
                <td className="px-5 py-3">
                  {client.creditConfig.status === 'active' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#eafaf1] text-[#00a884] border border-[#00a884]/20">
                      <FiUnlock className="text-[10px]" /> Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-600 border border-red-200">
                      <FiLock className="text-[10px]" /> Bloqueado
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => openModal('charge', client)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="Registrar Cargo">
                      <FiShoppingCart className="text-sm" />
                    </button>
                    <button onClick={() => openModal('payment', client)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="Registrar Abono">
                      <FiDollarSign className="text-sm" />
                    </button>
                    <button onClick={() => openModal('config', client)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="Configurar Crédito">
                      <FiSettings className="text-sm" />
                    </button>
                    <button onClick={() => openModal('history', client)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="Historial">
                      <FiClipboard className="text-sm" />
                    </button>
                    <button onClick={() => toggleLock(client)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                      title={client.creditConfig.status === 'active' ? 'Bloquear' : 'Desbloquear'}>
                      {client.creditConfig.status === 'active' ? <FiUnlock className="text-sm" /> : <FiLock className="text-sm" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredClients.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center">
                  <FiInbox className="text-3xl text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 font-medium">No se encontraron clientes</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {activeModal && activeModal !== 'history' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={closeModal} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(activeModal === 'charge' || activeModal === 'payment') && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }}
              className="pointer-events-auto w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)] overflow-y-auto"
            >
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h2 className="text-sm font-bold text-gray-900">
                  {activeModal === 'charge' ? 'Registrar Cargo (Fiado)' : 'Registrar Abono'}
                </h2>
                <p className="text-[11px] text-gray-500 mt-0.5">{selectedClient?.name}</p>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-700 transition-colors">
                <FiX className="text-xl" />
              </button>
            </div>

            <div className="p-6">
              <div className={`flex items-center justify-between p-4 rounded-xl border mb-5 ${
                activeModal === 'charge' ? 'bg-red-50 border-red-100' : 'bg-[#eafaf1] border-[#00a884]/20'
              }`}>
                <div>
                  <p className="text-[10px] text-gray-500 font-bold mb-0.5 uppercase tracking-wider">Deuda actual</p>
                  <p className={`text-sm font-black ${activeModal === 'charge' ? 'text-red-600' : 'text-[#00a884]'}`}>
                    RD$ {fmt(Math.max(0, selectedClient?.debt || 0))}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 font-bold mb-0.5 uppercase tracking-wider">Tipo</p>
                  <p className="text-sm font-black text-gray-700">
                    {selectedClient?.creditConfig.type === 'limited'
                      ? `Límite: RD$ ${fmt(selectedClient.creditConfig.limit)}`
                      : 'Ilimitado'}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                    Monto del {activeModal === 'charge' ? 'cargo' : 'abono'} *
                  </label>
                  <input type="number" value={txAmount} onChange={e => setTxAmount(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:border-[#00a884]"
                    placeholder="RD$ 0.00" />
                </div>
                {activeModal === 'payment' && (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Método recibido *</label>
                    <select value={txMethod} onChange={e => setTxMethod(e.target.value)} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:border-[#00a884]">
                      <option value="cash">Efectivo</option>
                      <option value="bank_transfer">Transferencia manual</option>
                      <option value="card">Tarjeta por terminal externa</option>
                    </select>
                    <p className="mt-1.5 text-[10px] text-gray-400">WAMERCIO solo registra el pago. La transferencia o terminal se confirma fuera de la plataforma.</p>
                  </div>
                )}
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                    Nota (opcional)
                  </label>
                  <input type="text" value={txNote} onChange={e => setTxNote(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-[#00a884]"
                    placeholder={activeModal === 'charge' ? 'Ej: compra de víveres...' : 'Ej: pago quincenal...'} />
                </div>
              </div>

              {txError && <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">{txError}</div>}

              <div className="flex gap-3 mt-6">
                <button onClick={closeModal}
                  className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-xs hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button onClick={() => void handleSaveTx()} disabled={savingTx}
                  className={`flex-[1.5] py-3 text-white rounded-xl font-bold text-xs shadow-sm transition-colors disabled:opacity-50 ${
                    activeModal === 'charge' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#00a884] hover:bg-[#009676]'
                  }`}>
                  {savingTx ? 'Guardando...' : `Registrar ${activeModal === 'charge' ? 'cargo' : 'abono'}`}
                </button>
              </div>
            </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeModal === 'config' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }}
              className="pointer-events-auto w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)] overflow-y-auto"
            >
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h2 className="text-sm font-bold text-gray-900">Configurar Crédito</h2>
                <p className="text-[11px] text-gray-500 mt-0.5">{selectedClient?.name}</p>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-700"><FiX className="text-xl" /></button>
            </div>
            <div className="p-6">
              <p className="text-xs font-bold text-gray-800 mb-3">Tipo de crédito</p>
              <div className="grid grid-cols-2 gap-3 mb-5">
                <button onClick={() => { setConfigData({ ...configData, type: 'unlimited' }); setConfigError(''); }}
                  className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                    configData.type === 'unlimited' ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}>
                  <span className="text-lg font-black text-purple-600">∞</span>
                  <div className="text-center">
                    <p className="text-[11px] font-bold text-gray-900">Ilimitado</p>
                    <p className="text-[9px] text-gray-500">Sin tope definido</p>
                  </div>
                </button>
                <button onClick={() => { setConfigData({ ...configData, type: 'limited' }); setConfigError(''); }}
                  className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                    configData.type === 'limited' ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}>
                  <FiLock className="text-lg text-amber-500" />
                  <div className="text-center">
                    <p className="text-[11px] font-bold text-gray-900">Limitado</p>
                    <p className="text-[9px] text-gray-500">Con monto máximo</p>
                  </div>
                </button>
              </div>

              {configData.type === 'limited' ? (
                <div className="mb-5">
                  <label className="block text-[11px] font-bold text-gray-800 mb-1.5">Monto límite (RD$)</label>
                  <input type="number" value={configData.limit}
                    onChange={e => { setConfigData({ ...configData, limit: Number(e.target.value) }); setConfigError(''); }}
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:border-[#00a884]"
                    placeholder="RD$ 0.00" />
                  {Number(configData.limit || 0) <= 0 && (
                    <p className="mt-1.5 text-[10px] font-bold text-amber-600">El límite debe ser mayor que 0 para que Fiado aparezca como método de pago.</p>
                  )}
                </div>
              ) : (
                <div className="mb-5 bg-purple-50 p-4 rounded-xl border border-purple-100">
                  <p className="text-[11px] text-purple-700 leading-relaxed">
                    <span className="font-bold">Crédito ilimitado:</span> El cliente podrá comprar a crédito sin restricciones. Úsalo solo con clientes de total confianza.
                  </p>
                </div>
              )}

              {configError && (
                <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
                  {configError}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={closeModal}
                  className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-xs hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleSaveConfig}
                  className="flex-1 py-3 bg-[#00a884] text-white rounded-xl font-bold text-xs shadow-sm hover:bg-[#009676] transition-colors">
                  Guardar cambios
                </button>
              </div>
            </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeModal === 'history' && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={closeModal} />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col"
            >
              <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-[#f8fafc]">
                <div>
                  <h2 className="text-sm font-bold text-gray-900">Historial de movimientos</h2>
                  <p className="text-[11px] text-gray-500 mt-0.5">{selectedClient?.name}</p>
                </div>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-700"><FiX className="text-xl" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {!selectedClient?.history.length ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-100">
                      <FiInbox className="text-2xl text-gray-400" />
                    </div>
                    <p className="text-sm font-bold text-gray-800">Sin movimientos</p>
                    <p className="text-xs text-gray-500 mt-1">Este cliente no tiene transacciones.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[...selectedClient.history]
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map(item => (
                        <div key={item.id}
                          className="flex justify-between items-center p-4 border border-gray-100 rounded-xl bg-gray-50/50"
                        >
                          <div>
                            <p className={`text-xs font-bold uppercase tracking-wider ${
                              item.type === 'charge' ? 'text-red-600' : 'text-[#00a884]'
                            }`}>
                              {item.type === 'charge' ? 'Cargo' : 'Abono'}
                            </p>
                            <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-1">
                              <FiCalendar className="text-[10px]" />
                              {formatDateTime(item.date, { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                            {item.note && (
                              <p className="text-[11px] text-gray-600 mt-1 italic">"{item.note}"</p>
                            )}
                          </div>
                          <p className={`text-sm font-black ${item.type === 'charge' ? 'text-red-600' : 'text-[#00a884]'}`}>
                            {item.type === 'charge' ? '+' : '−'}RD$ {fmt(item.amount)}
                          </p>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StoreCredit;