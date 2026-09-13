import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { api } from '../lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';

const { FiPlus, FiCopy, FiX, FiCheck } = FiIcons;

const FALLBACK_BANKS = [
  { id: 'banco-de-reservas', name: 'Banco de Reservas', logo: '', active: true },
  { id: 'banco-popular', name: 'Banco Popular', logo: '', active: true },
  { id: 'banco-bhd', name: 'Banco BHD', logo: '', active: true },
  { id: 'asociacion-cibao', name: 'Asociación Cibao', logo: '', active: true },
  { id: 'scotiabank', name: 'Scotiabank', logo: '', active: true },
  { id: 'promerica', name: 'Promerica', logo: '', active: true },
  { id: 'banco-santa-cruz', name: 'Banco Santa Cruz', logo: '', active: true },
];

const BankLogo = ({ bank, className = 'w-9 h-9 rounded-xl' }) => {
  if (bank?.logo) {
    return <img src={bank.logo} alt={bank.name || 'Banco'} className={`${className} object-contain bg-white border border-gray-100 p-1`} />;
  }
  return <span className={`${className} bg-[#eafaf1] text-[#00a884] border border-[#bce8d1] flex items-center justify-center text-base`}>🏦</span>;
};

const BankAccounts = ({ embedded = false }) => {
  const { bankAccounts, addBankAccount, updateBankAccount, deleteBankAccount, toggleBankAccount } = useStore();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [bankCatalog, setBankCatalog] = useState(FALLBACK_BANKS);
  const [formError, setFormError] = useState('');

  const [formData, setFormData] = useState({
    bank: '',
    type: 'Corriente',
    active: true,
    number: '',
    holder: ''
  });

  useEffect(() => {
    let alive = true;
    api.get('/banks')
      .then((data) => {
        const list = Array.isArray(data) ? data.filter((item) => item?.active !== false) : [];
        if (alive && list.length > 0) setBankCatalog(list);
      })
      .catch(() => {
        if (alive) setBankCatalog(FALLBACK_BANKS);
      });
    return () => { alive = false; };
  }, []);

  const bankByName = useMemo(() => Object.fromEntries(bankCatalog.map((bank) => [bank.name, bank])), [bankCatalog]);
  const selectedBank = bankByName[formData.bank];

  const handleOpenModal = (account = null) => {
    if (account) {
      setEditingAccount(account);
      setFormData(account);
    } else {
      setEditingAccount(null);
      setFormData({ bank: '', type: 'Corriente', active: true, number: '', holder: '' });
    }
    setFormError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingAccount(null);
    setFormError('');
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = () => {
    if (!formData.bank || !formData.number || !formData.holder) {
      setFormError('Completa banco, número y titular antes de guardar.');
      return;
    }
    if (editingAccount) {
      updateBankAccount(editingAccount.id, formData);
    } else {
      addBankAccount(formData);
    }
    handleCloseModal();
  };

  const handleDelete = (id) => {
    if (window.confirm('¿Estás seguro de eliminar esta cuenta bancaria?')) {
      deleteBankAccount(id);
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className={embedded ? "w-full" : "p-4 md:p-8 xl:p-10 w-full"}>
      
      <div className={`${embedded ? 'mb-5' : 'mb-8'} flex flex-col md:flex-row md:items-center justify-between gap-4`}>
        <div>
          <h1 className={`${embedded ? 'text-lg' : 'text-2xl'} font-black text-gray-900`}>Cuentas Bancarias</h1>
          <p className="text-sm text-gray-500 mt-1">Configura tus cuentas para recibir pagos por transferencia en tus negocios.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()} 
          className="px-5 py-2.5 bg-[#00a884] text-white rounded-xl font-bold text-sm shadow-sm hover:bg-[#009676] transition-colors flex items-center justify-center gap-2"
        >
          <FiPlus className="text-lg" /> Registrar cuenta
        </button>
      </div>

      {bankAccounts.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-100 rounded-3xl shadow-sm">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">🏦</div>
          <p className="text-gray-500 font-medium">No tienes cuentas bancarias registradas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
          {bankAccounts.map((account) => (
            <div key={account.id} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex flex-col">
              
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <BankLogo bank={bankByName[account.bank]} className="w-8 h-8 rounded-xl" />
                  <span className="font-bold text-gray-800 text-[13px] truncate">{account.bank}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 ${account.type.toLowerCase() === 'corriente' ? 'bg-[#eafaf1] text-[#00a884]' : 'bg-blue-50 text-blue-600'} text-[10px] font-bold rounded-full uppercase tracking-wider`}>
                    {account.type}
                  </span>
                  <button 
                    onClick={() => toggleBankAccount(account.id)}
                    className="focus:outline-none"
                  >
                    <div className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center transition-colors ${account.active ? 'bg-[#00a884] border-[#00a884]' : 'bg-white border-gray-300'}`}>
                      {account.active && <div className="w-1.5 h-1.5 bg-white rounded-full shadow-sm" />}
                    </div>
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-4 flex-1">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">NÚMERO DE CUENTA</p>
                  <div className="flex items-center justify-between">
                    <p className="text-base font-black text-gray-900 tracking-wide">{account.number}</p>
                    <button 
                      onClick={() => copyToClipboard(account.number, account.id)}
                      className="w-7 h-7 bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
                      title="Copiar número"
                    >
                      {copiedId === account.id ? <FiCheck className="text-xs text-[#00a884]" /> : <FiCopy className="text-xs" />}
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">TITULAR</p>
                  <p className="text-xs font-bold text-gray-800 uppercase">{account.holder}</p>
                </div>
              </div>

              <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex gap-3">
                <button 
                  onClick={() => handleOpenModal(account)}
                  className="flex-1 py-2.5 bg-white border border-gray-200 rounded-xl text-[11px] font-bold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                >
                  EDITAR
                </button>
                <button 
                  onClick={() => handleDelete(account.id)}
                  className="flex-1 py-2.5 bg-red-50 border border-red-100 rounded-xl text-[11px] font-bold text-red-600 hover:bg-red-100 transition-colors shadow-sm"
                >
                  ELIMINAR
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {isModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
              onClick={handleCloseModal}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 16 }}
                className="pointer-events-auto w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col"
              >
              <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-sm font-bold tracking-wide text-gray-900 uppercase">
                  {editingAccount ? 'EDITAR CUENTA' : 'NUEVA CUENTA'}
                </h2>
                <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <FiX className="text-xl" />
                </button>
              </div>

              <div className="p-6 space-y-5 overflow-y-auto">
                {formError && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                    {formError}
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Banco</label>
                  <select 
                    name="bank"
                    value={formData.bank}
                    onChange={handleChange}
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23131313%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:10px_10px] bg-no-repeat bg-[position:right_15px_center]"
                  >
                    <option value="" disabled>Selecciona un banco del catálogo</option>
                    {bankCatalog.map((bank) => (
                      <option key={bank.id || bank.name} value={bank.name}>{bank.name}</option>
                    ))}
                  </select>
                  {selectedBank && (
                    <div className="mt-2 rounded-2xl border border-[#bce8d1] bg-[#f0fbf8] px-3 py-2 flex items-center gap-3">
                      <BankLogo bank={selectedBank} className="w-9 h-9 rounded-xl" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#008f72]">Banco seleccionado</p>
                        <p className="text-xs font-black text-gray-800 truncate">{selectedBank.name}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Tipo de cuenta</label>
                    <select 
                      name="type"
                      value={formData.type}
                      onChange={handleChange}
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23131313%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:10px_10px] bg-no-repeat bg-[position:right_10px_center]"
                    >
                      <option value="Ahorros">Ahorros</option>
                      <option value="Corriente">Corriente</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Estado</label>
                    <label className="flex items-center gap-2 h-[42px] px-4 bg-gray-50 border border-gray-100 rounded-xl cursor-pointer">
                      <div className={`w-[16px] h-[16px] rounded-[4px] border-[1.5px] flex items-center justify-center transition-colors ${formData.active ? 'bg-[#00a884] border-[#00a884]' : 'bg-white border-gray-300'}`}>
                        {formData.active && <FiCheck className="text-white text-[10px]" />}
                      </div>
                      <input 
                        type="checkbox" 
                        name="active"
                        checked={formData.active}
                        onChange={handleChange}
                        className="hidden"
                      />
                      <span className="text-sm font-bold text-gray-700">Activa</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Número de cuenta</label>
                  <input 
                    type="text" 
                    name="number"
                    value={formData.number}
                    onChange={handleChange}
                    placeholder="Ej: 000-000000-0"
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#00a884]/20"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Titular de la cuenta</label>
                  <input 
                    type="text" 
                    name="holder"
                    value={formData.holder}
                    onChange={handleChange}
                    placeholder="Nombre como aparece en el banco"
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 uppercase"
                  />
                </div>

                <div className="flex gap-3 pt-3">
                  <button 
                    onClick={handleCloseModal} 
                    className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-xs tracking-wider shadow-sm hover:bg-gray-50 transition-colors uppercase"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleSave} 
                    className="flex-1 py-3 bg-[#00a884] text-white rounded-xl font-bold text-xs tracking-wider shadow-sm hover:bg-[#009676] transition-colors uppercase"
                  >
                    {editingAccount ? 'Guardar cambios' : 'Registrar cuenta'}
                  </button>
                </div>

              </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
};

export default BankAccounts;