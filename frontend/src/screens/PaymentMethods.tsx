import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from '@/lib/navigation';
import { useStore } from '../context/StoreContext';
import BankAccounts from './BankAccounts';
import * as FiIcons from 'react-icons/fi';

const { FiArrowRight, FiCreditCard, FiBriefcase, FiInfo } = FiIcons;

const tabs = [
  {
    key: 'methods',
    label: 'MÉTODOS',
    detail: 'Formas de pago',
    to: '/admin/payment-methods',
    icon: FiCreditCard,
  },
  {
    key: 'accounts',
    label: 'CUENTAS',
    detail: 'Cuentas bancarias',
    to: '/admin/payment-methods/accounts',
    icon: FiBriefcase,
  },
];

const accountLabel = (account: any) => {
  const number = String(account?.number || '').replace(/\s+/g, '');
  const ending = number ? ` •••• ${number.slice(-4)}` : '';
  return `${account?.bank || 'Cuenta bancaria'}${ending}`;
};

const PaymentMethods = () => {
  const { activeStore, updatePaymentSettings, bankAccounts = [] } = useStore();
  const [settings, setSettings] = useState(activeStore?.paymentSettings || {});
  const [saved, setSaved] = useState(false);
  const location = useLocation();
  const activeTab = location.pathname === '/admin/payment-methods/accounts' ? 'accounts' : 'methods';

  const activeAccounts = useMemo(
    () => (Array.isArray(bankAccounts) ? bankAccounts : []).filter(
      (account: any) => account?.active !== false && account?.id && account?.bank && account?.number,
    ),
    [bankAccounts],
  );

  useEffect(() => {
    if (activeStore?.paymentSettings) setSettings(activeStore.paymentSettings);
  }, [activeStore]);

  useEffect(() => {
    if (!saved) return undefined;
    const timeout = window.setTimeout(() => setSaved(false), 2500);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  const toggleSetting = (key: string) => setSettings((current: any) => ({ ...current, [key]: !current[key] }));
  const handleChange = (key: string, value: string) => setSettings((current: any) => ({ ...current, [key]: value }));

  const handleSave = async () => {
    await updatePaymentSettings(settings);
    setSaved(true);
  };

  const renderTabHeader = () => (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Métodos de pago</h1>
        <p className="text-sm text-gray-500 mt-1">Configura únicamente las formas de pago manuales aceptadas por el negocio.</p>
      </div>

      <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-2xl w-full lg:w-[360px]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <Link
              key={tab.key}
              to={tab.to}
              className={`rounded-xl px-3 py-2.5 flex items-center gap-2 transition-all ${active ? 'bg-[#00a884] text-white shadow-md shadow-[#00a884]/25' : 'text-gray-500 hover:bg-white hover:text-gray-700'}`}
            >
              <Icon className="text-base shrink-0" />
              <span className="min-w-0 text-left">
                <span className="block text-[11px] font-black leading-tight">{tab.label}</span>
                <span className={`block text-[9px] font-semibold truncate leading-tight mt-0.5 ${active ? 'text-white/75' : 'text-gray-400'}`}>{tab.detail}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );

  const renderMethods = () => (
    <div className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden">
      <div className="p-5 border-b border-gray-100 flex items-center gap-4 bg-white">
        <div className="w-11 h-11 bg-[#00a884] text-white rounded-xl flex items-center justify-center font-bold text-sm tracking-widest shrink-0 shadow-sm">CO</div>
        <div>
          <h2 className="text-sm font-bold text-gray-900">Configuración de pagos fuera de línea</h2>
          <p className="text-xs text-gray-500 mt-0.5">{activeStore?.name || 'Negocio'} • {activeStore?.whatsappDisplay || activeStore?.whatsapp || activeStore?.phone || 'Sin WhatsApp configurado'}</p>
        </div>
      </div>

      <div className="p-6 md:p-8 space-y-8">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 flex items-start gap-3 text-blue-900">
          <FiInfo className="mt-0.5 shrink-0" />
          <p className="text-xs leading-relaxed font-semibold">
            WAMERCIO registra el método informado, pero no cobra, autoriza ni confirma transacciones electrónicas. Las transferencias se verifican manualmente y las tarjetas se procesan en una terminal física externa.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PaymentCard icon="💵" title="Efectivo" description="El cliente paga al recibir o retirar el pedido." checked={settings.cash !== false} onChange={() => toggleSetting('cash')} />
          <PaymentCard icon="🏦" title="Transferencia manual" description="El cliente transfiere fuera de WAMERCIO y el negocio valida el comprobante." checked={settings.bankTransfer !== false} onChange={() => toggleSetting('bankTransfer')} />
          <PaymentCard icon="📝" title="Fiado" description="Registra crédito autorizado para clientes conocidos, con saldo y abonos." checked={settings.credit !== false} onChange={() => toggleSetting('credit')} />
          <PaymentCard icon="💳" title="Tarjeta por terminal externo" description="La tarjeta se cobra físicamente en un Verifone u otra terminal del negocio." checked={settings.card !== false} onChange={() => toggleSetting('card')} />
        </div>

        <div className="bg-[#f8fafc] border border-gray-100 rounded-2xl p-5 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <div>
              <h3 className="font-black text-gray-900 text-[13px]">Cuentas de referencia</h3>
              <p className="text-[11px] text-gray-500 leading-relaxed mt-0.5 font-medium">Selecciona cuentas registradas por el negocio; no se realiza conciliación bancaria automática.</p>
            </div>
            <Link to="/admin/payment-methods/accounts" className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-[11px] font-bold text-[#00a884] shadow-sm hover:bg-gray-50 transition-colors text-center">Administrar cuentas</Link>
          </div>

          {activeAccounts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center">
              <p className="text-sm font-bold text-gray-700">No hay cuentas bancarias activas</p>
              <p className="text-xs text-gray-500 mt-1">Registra una cuenta antes de habilitar transferencias manuales.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <AccountSelect label="Cuenta para transferencias" value={settings.transferAccount || ''} accounts={activeAccounts} onChange={(value) => handleChange('transferAccount', value)} />
              <AccountSelect label="Cuenta asociada al terminal externo" value={settings.terminalAccount || ''} accounts={activeAccounts} onChange={(value) => handleChange('terminalAccount', value)} />
            </div>
          )}
        </div>
      </div>

      <div className="px-6 md:px-8 pb-6 md:pb-8 pt-0 bg-white flex flex-col sm:flex-row items-center justify-end gap-3">
        {saved && <span className="text-xs font-bold text-emerald-600">Configuración guardada correctamente.</span>}
        <button onClick={handleSave} className="w-full sm:w-auto px-5 py-2.5 bg-[#00a884] text-white rounded-xl font-black text-[12px] flex items-center justify-center gap-2 hover:bg-[#009676] transition-colors shadow-md shadow-[#00a884]/20">
          Guardar cambios <FiArrowRight className="text-base" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-8 xl:p-10 w-full">
      {renderTabHeader()}
      {activeTab === 'methods' ? renderMethods() : <BankAccounts embedded />}
    </div>
  );
};

const PaymentCard = ({ icon, title, description, checked, onChange }: any) => (
  <div className="border border-gray-100 rounded-2xl p-5 flex flex-col hover:border-gray-200 transition-colors bg-white shadow-sm">
    <div className="flex justify-between items-start mb-4">
      <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-100 text-lg shadow-sm">{icon}</div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
    <h3 className="font-black text-gray-900 text-[13px] mb-1">{title}</h3>
    <p className="text-[11px] text-gray-500 leading-relaxed font-medium">{description}</p>
  </div>
);

const AccountSelect = ({ label, value, accounts, onChange }: any) => (
  <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
    <label className="block text-[11px] font-bold text-gray-700 mb-2">{label}</label>
    <select
      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#00a884]/20"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Sin cuenta seleccionada</option>
      {accounts.map((account: any) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}
    </select>
  </div>
);

const Toggle = ({ checked, onChange }: any) => (
  <button
    type="button"
    role="switch"
    aria-checked={Boolean(checked)}
    onClick={onChange}
    className={`w-12 h-6 rounded-full relative transition-colors duration-300 ease-in-out shrink-0 focus:outline-none shadow-inner ${checked ? 'bg-[#00a884]' : 'bg-gray-200'}`}
  >
    <span className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm transition-transform duration-300 ease-in-out ${checked ? 'translate-x-6' : 'translate-x-0.5'}`} />
  </button>
);

export default PaymentMethods;
