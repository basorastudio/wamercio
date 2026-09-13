import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { formatDateTime } from '../lib/timezone';
import * as FiIcons from 'react-icons/fi';

const { FiBookOpen, FiDollarSign, FiTrendingUp, FiTrendingDown, FiPlus, FiRefreshCw, FiCheck, FiX, FiFileText, FiLayers, FiCalendar } = FiIcons;

const money = (value: any) => `RD$ ${Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const date = new Date(); date.setDate(1); return date.toISOString().slice(0, 10); };

const accountTypeLabels: Record<string, string> = {
  asset: 'Activos', liability: 'Pasivos', equity: 'Patrimonio', revenue: 'Ingresos', expense: 'Gastos',
};

const Accounting = () => {
  const { activeStore } = useStore();
  const storeId = String(activeStore?.id || '');
  const [tab, setTab] = useState('summary');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [dashboard, setDashboard] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [trial, setTrial] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [opening, setOpening] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [entryModal, setEntryModal] = useState(false);
  const [accountModal, setAccountModal] = useState(false);
  const [periodModal, setPeriodModal] = useState(false);
  const [openingModal, setOpeningModal] = useState(false);
  const [entryDetail, setEntryDetail] = useState<any>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true); setError('');
    try {
      const [dashboardPayload, accountsPayload, entriesPayload, trialPayload, ledgerPayload, periodsPayload, openingPayload] = await Promise.all([
        api.get(`/accounting/dashboard?store_id=${encodeURIComponent(storeId)}&from=${from}&to=${to}`),
        api.get(`/accounting/accounts?store_id=${encodeURIComponent(storeId)}`),
        api.get(`/accounting/journal-entries?store_id=${encodeURIComponent(storeId)}&limit=100`),
        api.get(`/accounting/trial-balance?store_id=${encodeURIComponent(storeId)}&to=${to}`),
        api.get(`/accounting/ledger?store_id=${encodeURIComponent(storeId)}&from=${from}&to=${to}&limit=200`),
        api.get(`/accounting/periods?store_id=${encodeURIComponent(storeId)}`),
        api.get(`/accounting/opening-balance?store_id=${encodeURIComponent(storeId)}`),
      ]);
      setDashboard(dashboardPayload || null);
      setAccounts(Array.isArray(accountsPayload?.items) ? accountsPayload.items : []);
      setEntries(Array.isArray(entriesPayload?.items) ? entriesPayload.items : []);
      setTrial(Array.isArray(trialPayload?.items) ? trialPayload.items : []);
      setLedger(Array.isArray(ledgerPayload?.items) ? ledgerPayload.items : []);
      setPeriods(Array.isArray(periodsPayload?.items) ? periodsPayload.items : []);
      setOpening(openingPayload || null);
    } catch (err: any) {
      setError(err?.message || 'No se pudo cargar la contabilidad');
    } finally { setLoading(false); }
  }, [storeId, from, to]);

  useEffect(() => { void load(); }, [load]);

  const totals = dashboard?.totals || {};
  const groupedAccounts = useMemo(() => accounts.reduce((acc: Record<string, any[]>, account) => {
    const key = account.account_type || 'asset';
    if (!acc[key]) acc[key] = [];
    acc[key].push(account);
    return acc;
  }, {}), [accounts]);

  const openDetail = async (id: string) => {
    try { setEntryDetail(await api.get(`/accounting/journal-entries/${encodeURIComponent(id)}`)); }
    catch (err: any) { setError(err?.message || 'No se pudo abrir el asiento'); }
  };

  const postEntry = async (id: string) => { await api.post(`/accounting/journal-entries/${id}/post`, {}); await load(); };
  const voidEntry = async (id: string) => {
    const reason = window.prompt('Indica el motivo de anulación del asiento:');
    if (!reason) return;
    await api.post(`/accounting/journal-entries/${id}/void`, { reason });
    setEntryDetail(null); await load();
  };

  return (
    <div className="h-full overflow-y-auto bg-[#f8fafc] p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#00a884]">Gestión financiera</p>
            <h1 className="mt-1 text-2xl font-black text-gray-900">Contabilidad</h1>
            <p className="mt-1 text-sm text-gray-500">Partida doble, libro diario, balance de comprobación y estados financieros.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setAccountModal(true)} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-black text-gray-700"><FiLayers className="mr-2 inline" />Nueva cuenta</button>
            <button onClick={() => setEntryModal(true)} className="rounded-xl bg-[#00a884] px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-200"><FiPlus className="mr-2 inline" />Nuevo asiento</button>
            <button onClick={() => setPeriodModal(true)} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-xs font-black text-violet-700"><FiCalendar className="mr-2 inline" />Período</button>
            <button onClick={() => void load()} className="rounded-xl border border-gray-200 bg-white p-2.5 text-gray-600"><FiRefreshCw className={loading ? 'animate-spin' : ''} /></button>
          </div>
        </div>

        {opening && !opening.initialized && <div className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Configuración inicial pendiente</p><h3 className="mt-1 font-black text-amber-950">Registra el saldo de apertura</h3><p className="mt-1 text-xs text-amber-800">El sistema detectó inventario por {money(opening.suggested?.inventory)} y cuentas por cobrar por {money(opening.suggested?.accounts_receivable)}. Confirma estos valores junto con caja, bancos y deudas a proveedores.</p></div><button onClick={() => setOpeningModal(true)} className="shrink-0 rounded-xl bg-amber-900 px-4 py-3 text-xs font-black text-white">Inicializar contabilidad</button></div>}

        <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-[10px] font-black uppercase tracking-wider text-gray-500">Desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block w-full rounded-xl border border-gray-200 p-2.5 text-sm font-semibold text-gray-700" /></label>
          <label className="flex-1 text-[10px] font-black uppercase tracking-wider text-gray-500">Hasta<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block w-full rounded-xl border border-gray-200 p-2.5 text-sm font-semibold text-gray-700" /></label>
        </div>

        {error && <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}

        <div className="flex gap-2 overflow-x-auto rounded-xl bg-gray-100 p-1">
          {[['summary','Resumen'],['journal','Libro diario'],['ledger','Libro mayor'],['accounts','Plan de cuentas'],['trial','Balance de comprobación'],['periods','Períodos']].map(([id,label]) => (
            <button key={id} onClick={() => setTab(id)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-black ${tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{label}</button>
          ))}
        </div>

        {tab === 'summary' && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[
                ['Activos', totals.assets, FiDollarSign, 'text-blue-600 bg-blue-50'],
                ['Pasivos', totals.liabilities, FiTrendingDown, 'text-amber-600 bg-amber-50'],
                ['Patrimonio', totals.equity, FiBookOpen, 'text-purple-600 bg-purple-50'],
                ['Ingresos', totals.revenue, FiTrendingUp, 'text-emerald-600 bg-emerald-50'],
                ['Resultado neto', totals.net_income, FiFileText, Number(totals.net_income || 0) >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'],
              ].map(([label,value,Icon,classes]: any) => (
                <div key={label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                  <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${classes}`}><Icon /></div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</p>
                  <p className="mt-1 text-lg font-black text-gray-900">{money(value)}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <h3 className="font-black text-gray-900">Estado de resultados</h3>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Ingresos del período</span><b className="text-emerald-600">{money(totals.revenue)}</b></div>
                  <div className="flex justify-between"><span className="text-gray-500">Gastos y costo de ventas</span><b className="text-red-600">{money(totals.expenses)}</b></div>
                  <div className="border-t pt-3 flex justify-between text-base"><span className="font-black">Resultado neto</span><b>{money(totals.net_income)}</b></div>
                </div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <h3 className="font-black text-gray-900">Situación financiera</h3>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Total activos</span><b>{money(totals.assets)}</b></div>
                  <div className="flex justify-between"><span className="text-gray-500">Total pasivos</span><b>{money(totals.liabilities)}</b></div>
                  <div className="flex justify-between"><span className="text-gray-500">Patrimonio registrado</span><b>{money(totals.equity)}</b></div>
                  <div className="border-t pt-3 flex justify-between"><span className="font-black">Pasivos + patrimonio + resultado</span><b>{money(Number(totals.liabilities || 0) + Number(totals.equity || 0) + Number(totals.net_income || 0))}</b></div>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === 'journal' && <JournalTable entries={entries} onOpen={openDetail} onPost={postEntry} />}
        {tab === 'ledger' && <LedgerTable items={ledger} />}
        {tab === 'accounts' && <AccountGroups grouped={groupedAccounts} />}
        {tab === 'trial' && <TrialBalance items={trial} />}
        {tab === 'periods' && <PeriodsPanel periods={periods} onClose={async (id: string) => { if (!window.confirm('¿Cerrar este período? Después no podrán publicarse asientos en sus fechas.')) return; await api.post(`/accounting/periods/${id}/close`, {}); await load(); }} />}
      </div>

      {entryModal && <JournalModal storeId={storeId} accounts={accounts} onClose={() => setEntryModal(false)} onSaved={async () => { setEntryModal(false); await load(); }} />}
      {accountModal && <AccountModal storeId={storeId} onClose={() => setAccountModal(false)} onSaved={async () => { setAccountModal(false); await load(); }} />}
      {periodModal && <PeriodModal storeId={storeId} onClose={() => setPeriodModal(false)} onSaved={async () => { setPeriodModal(false); await load(); }} />}
      {openingModal && <OpeningBalanceModal storeId={storeId} suggested={opening?.suggested || {}} onClose={() => setOpeningModal(false)} onSaved={async () => { setOpeningModal(false); await load(); }} />}
      {entryDetail && <EntryDetailModal entry={entryDetail} onClose={() => setEntryDetail(null)} onPost={postEntry} onVoid={voidEntry} />}
    </div>
  );
};

const JournalTable = ({ entries, onOpen, onPost }: any) => (
  <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-3">Número</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Descripción</th><th className="px-4 py-3">Origen</th><th className="px-4 py-3 text-right">Débito</th><th className="px-4 py-3">Estado</th></tr></thead><tbody>
      {entries.map((entry: any) => <tr key={entry.id} onClick={() => onOpen(entry.id)} className="cursor-pointer border-t hover:bg-gray-50"><td className="px-4 py-3 font-black text-gray-800">{entry.entry_number}</td><td className="px-4 py-3 text-gray-500">{String(entry.entry_date).slice(0,10)}</td><td className="px-4 py-3 font-semibold text-gray-700">{entry.description}</td><td className="px-4 py-3 text-xs text-gray-500">{entry.source_type}</td><td className="px-4 py-3 text-right font-black">{money(entry.debit)}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${entry.status === 'posted' ? 'bg-emerald-50 text-emerald-700' : entry.status === 'voided' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{entry.status === 'posted' ? 'Publicado' : entry.status === 'voided' ? 'Anulado' : 'Borrador'}</span>{entry.status === 'draft' && <button onClick={(e) => { e.stopPropagation(); onPost(entry.id); }} className="ml-2 text-[10px] font-black text-[#00a884]">Publicar</button>}</td></tr>)}
      {entries.length === 0 && <tr><td colSpan={6} className="p-12 text-center text-gray-400">Todavía no hay asientos contables.</td></tr>}
    </tbody></table></div>
  </div>
);

const AccountGroups = ({ grouped }: any) => <div className="grid gap-4 lg:grid-cols-2">{Object.entries(grouped).map(([type, items]: any) => <section key={type} className="rounded-2xl border border-gray-200 bg-white p-5"><h3 className="font-black text-gray-900">{accountTypeLabels[type] || type}</h3><div className="mt-3 divide-y">{items.map((account: any) => <div key={account.id} className="flex items-center justify-between py-3"><div><b className="text-sm text-gray-800">{account.code} · {account.name}</b><p className="text-[10px] uppercase text-gray-400">{account.normal_balance === 'debit' ? 'Naturaleza deudora' : 'Naturaleza acreedora'}{account.system_key ? ' · Cuenta del sistema' : ''}</p></div><span className={`h-2.5 w-2.5 rounded-full ${account.active ? 'bg-emerald-500' : 'bg-gray-300'}`} /></div>)}</div></section>)}</div>;

const TrialBalance = ({ items }: any) => {
  const debit = items.reduce((sum: number, item: any) => sum + Number(item.debit || 0), 0);
  const credit = items.reduce((sum: number, item: any) => sum + Number(item.credit || 0), 0);
  return <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-[10px] uppercase text-gray-500"><tr><th className="px-4 py-3 text-left">Cuenta</th><th className="px-4 py-3 text-right">Débitos</th><th className="px-4 py-3 text-right">Créditos</th><th className="px-4 py-3 text-right">Saldo</th></tr></thead><tbody>{items.map((item: any) => <tr key={item.id} className="border-t"><td className="px-4 py-3 font-bold text-gray-700">{item.code} · {item.name}</td><td className="px-4 py-3 text-right">{money(item.debit)}</td><td className="px-4 py-3 text-right">{money(item.credit)}</td><td className="px-4 py-3 text-right font-black">{money(item.balance)}</td></tr>)}<tr className="border-t-2 bg-gray-50 font-black"><td className="px-4 py-3">Totales</td><td className="px-4 py-3 text-right">{money(debit)}</td><td className="px-4 py-3 text-right">{money(credit)}</td><td className="px-4 py-3 text-right">{Math.abs(debit-credit) < .01 ? 'Cuadrado' : 'Revisar'}</td></tr></tbody></table></div></div>;
};

const LedgerTable = ({ items }: any) => {
  const grouped = items.reduce((result: Record<string, any[]>, item: any) => {
    const key = `${item.account_code} · ${item.account_name}`;
    if (!result[key]) result[key] = [];
    result[key].push(item);
    return result;
  }, {});
  return <div className="space-y-4">{Object.entries(grouped).map(([account, rows]: any) => {
    let running = 0;
    const normal = rows[0]?.normal_balance || 'debit';
    return <section key={account} className="overflow-hidden rounded-2xl border border-gray-200 bg-white"><div className="border-b bg-gray-50 px-4 py-3"><h3 className="font-black text-gray-800">{account}</h3></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="text-[10px] uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3 text-left">Fecha</th><th className="px-4 py-3 text-left">Asiento</th><th className="px-4 py-3 text-left">Descripción</th><th className="px-4 py-3 text-right">Débito</th><th className="px-4 py-3 text-right">Crédito</th><th className="px-4 py-3 text-right">Movimiento</th></tr></thead><tbody>{rows.map((row: any) => { running += normal === 'credit' ? Number(row.credit || 0) - Number(row.debit || 0) : Number(row.debit || 0) - Number(row.credit || 0); return <tr key={row.line_id} className="border-t"><td className="px-4 py-3">{String(row.entry_date).slice(0,10)}</td><td className="px-4 py-3 font-mono text-xs font-bold">{row.entry_number}</td><td className="px-4 py-3"><b className="text-gray-700">{row.entry_description}</b><p className="text-[10px] text-gray-400">{row.line_description || row.source_type}</p></td><td className="px-4 py-3 text-right">{row.debit ? money(row.debit) : ''}</td><td className="px-4 py-3 text-right">{row.credit ? money(row.credit) : ''}</td><td className="px-4 py-3 text-right font-black">{money(running)}</td></tr>; })}</tbody></table></div></section>;
  })}{items.length === 0 && <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center text-sm text-gray-400">No hay movimientos publicados en el período seleccionado.</div>}</div>;
};

const PeriodsPanel = ({ periods, onClose }: any) => <div className="grid gap-3 md:grid-cols-2">{periods.map((period: any) => <article key={period.id} className="rounded-2xl border border-gray-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Período contable</p><h3 className="mt-1 font-black text-gray-900">{period.name}</h3><p className="mt-1 text-xs text-gray-500">{String(period.starts_on).slice(0,10)} al {String(period.ends_on).slice(0,10)}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${period.status === 'closed' ? 'bg-gray-100 text-gray-600' : 'bg-emerald-50 text-emerald-700'}`}>{period.status === 'closed' ? 'Cerrado' : 'Abierto'}</span></div>{period.status === 'open' && <button onClick={() => onClose(period.id)} className="mt-4 rounded-xl bg-red-50 px-4 py-2 text-xs font-black text-red-700">Cerrar período</button>}{period.closed_at && <p className="mt-3 text-[10px] text-gray-400">Cerrado {formatDateTime(period.closed_at)}</p>}</article>)}{periods.length === 0 && <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center text-sm text-gray-400 md:col-span-2">Crea períodos mensuales o anuales para controlar el cierre contable.</div>}</div>;

const OpeningBalanceModal = ({ storeId, suggested, onClose, onSaved }: any) => {
  const [form, setForm] = useState({
    as_of_date: today(), cash: Number(suggested.cash || 0), bank: Number(suggested.bank || 0),
    inventory: Number(suggested.inventory || 0), accounts_receivable: Number(suggested.accounts_receivable || 0),
    accounts_payable: Number(suggested.accounts_payable || 0), notes: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const assets = Number(form.cash || 0) + Number(form.bank || 0) + Number(form.inventory || 0) + Number(form.accounts_receivable || 0);
  const equity = assets - Number(form.accounts_payable || 0);
  const save = async () => {
    setSaving(true); setError('');
    try { await api.post('/accounting/opening-balance', { store_id: storeId, ...form }); await onSaved(); }
    catch (err: any) { setError(err?.message || 'No se pudo registrar el saldo de apertura'); }
    finally { setSaving(false); }
  };
  const field = (key: string, label: string) => <label className="text-xs font-black text-gray-600">{label}<input type="number" min="0" step="0.01" value={(form as any)[key]} onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })} className="mt-1 w-full rounded-xl border p-3" /></label>;
  return <Modal title="Saldo de apertura" onClose={onClose}><div className="space-y-4"><p className="rounded-xl bg-blue-50 p-4 text-xs text-blue-800">Este asiento representa lo que el negocio ya tenía antes de comenzar la contabilidad en WAMERCIO. Solo puede registrarse una vez.</p><label className="block text-xs font-black text-gray-600">Fecha de apertura<input type="date" value={form.as_of_date} onChange={(event) => setForm({ ...form, as_of_date: event.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label><div className="grid gap-3 sm:grid-cols-2">{field('cash','Efectivo disponible')}{field('bank','Saldo en bancos')}{field('inventory','Valor del inventario')}{field('accounts_receivable','Cuentas por cobrar')}{field('accounts_payable','Cuentas por pagar')}</div><textarea placeholder="Observaciones del saldo inicial" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="w-full rounded-xl border p-3" /><div className="grid grid-cols-2 gap-3 rounded-xl bg-gray-900 p-4 text-sm text-white"><div><span className="block text-[10px] uppercase text-gray-400">Activos</span><b>{money(assets)}</b></div><div><span className="block text-[10px] uppercase text-gray-400">Patrimonio resultante</span><b className={equity < 0 ? 'text-red-300' : 'text-emerald-300'}>{money(equity)}</b></div></div>{error && <p className="text-xs font-bold text-red-600">{error}</p>}<button disabled={saving || assets + Number(form.accounts_payable || 0) <= 0} onClick={save} className="w-full rounded-xl bg-[#00a884] py-3 font-black text-white disabled:opacity-40">{saving ? 'Inicializando...' : 'Registrar saldo de apertura'}</button></div></Modal>;
};

const PeriodModal = ({ storeId, onClose, onSaved }: any) => { const [form,setForm]=useState({name:'',starts_on:monthStart(),ends_on:today()});const [error,setError]=useState('');const save=async()=>{try{await api.post('/accounting/periods',{store_id:storeId,...form});await onSaved();}catch(err:any){setError(err?.message||'No se pudo crear el período');}};return <Modal title="Nuevo período contable" onClose={onClose}><div className="grid gap-3 sm:grid-cols-2"><input placeholder="Nombre, por ejemplo Julio 2026" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="rounded-xl border p-3 sm:col-span-2"/><label className="text-xs font-black text-gray-600">Desde<input type="date" value={form.starts_on} onChange={e=>setForm({...form,starts_on:e.target.value})} className="mt-1 w-full rounded-xl border p-3"/></label><label className="text-xs font-black text-gray-600">Hasta<input type="date" value={form.ends_on} onChange={e=>setForm({...form,ends_on:e.target.value})} className="mt-1 w-full rounded-xl border p-3"/></label>{error&&<p className="text-xs font-bold text-red-600 sm:col-span-2">{error}</p>}<button onClick={save} disabled={!form.name.trim()} className="rounded-xl bg-[#00a884] py-3 font-black text-white disabled:opacity-40 sm:col-span-2">Crear período</button></div></Modal>; };

const JournalModal = ({ storeId, accounts, onClose, onSaved }: any) => {
  const [description, setDescription] = useState(''); const [entryDate, setEntryDate] = useState(today()); const [post, setPost] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [lines, setLines] = useState([{ account_id: '', description: '', debit: 0, credit: 0 }, { account_id: '', description: '', debit: 0, credit: 0 }]);
  const totalDebit = lines.reduce((s,l) => s+Number(l.debit||0),0); const totalCredit = lines.reduce((s,l) => s+Number(l.credit||0),0);
  const save = async () => { setBusy(true); setError(''); try { await api.post('/accounting/journal-entries',{ store_id: storeId, entry_date: entryDate, description, post, lines }); await onSaved(); } catch(err:any){setError(err?.message||'No se pudo guardar el asiento');} finally{setBusy(false);} };
  return <Modal title="Nuevo asiento contable" onClose={onClose}><div className="space-y-4"><label className="block text-xs font-black text-gray-600">Descripción<input value={description} onChange={e=>setDescription(e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label><div className="grid grid-cols-2 gap-3"><label className="text-xs font-black text-gray-600">Fecha<input type="date" value={entryDate} onChange={e=>setEntryDate(e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label><label className="flex items-end gap-2 pb-3 text-xs font-black text-gray-600"><input type="checkbox" checked={post} onChange={e=>setPost(e.target.checked)} /> Publicar inmediatamente</label></div><div className="space-y-2">{lines.map((line,index)=><div key={index} className="grid gap-2 rounded-xl border bg-gray-50 p-3 md:grid-cols-[1fr_120px_120px_40px]"><select value={line.account_id} onChange={e=>setLines(v=>v.map((x,i)=>i===index?{...x,account_id:e.target.value}:x))} className="rounded-lg border p-2 text-sm"><option value="">Selecciona cuenta</option>{accounts.filter((a:any)=>a.active).map((a:any)=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select><input type="number" min="0" step="0.01" value={line.debit||''} onChange={e=>setLines(v=>v.map((x,i)=>i===index?{...x,debit:Number(e.target.value),credit:Number(e.target.value)>0?0:x.credit}:x))} placeholder="Débito" className="rounded-lg border p-2 text-right" /><input type="number" min="0" step="0.01" value={line.credit||''} onChange={e=>setLines(v=>v.map((x,i)=>i===index?{...x,credit:Number(e.target.value),debit:Number(e.target.value)>0?0:x.debit}:x))} placeholder="Crédito" className="rounded-lg border p-2 text-right" /><button onClick={()=>setLines(v=>v.filter((_,i)=>i!==index))} className="text-red-500"><FiX /></button></div>)}</div><button onClick={()=>setLines(v=>[...v,{account_id:'',description:'',debit:0,credit:0}])} className="text-xs font-black text-[#00a884]"><FiPlus className="inline" /> Agregar línea</button><div className="flex justify-end gap-6 rounded-xl bg-gray-900 p-3 text-sm text-white"><span>Débito: <b>{money(totalDebit)}</b></span><span>Crédito: <b>{money(totalCredit)}</b></span></div>{error&&<p className="text-xs font-bold text-red-600">{error}</p>}<button disabled={busy||!description||Math.abs(totalDebit-totalCredit)>.009||totalDebit<=0} onClick={save} className="w-full rounded-xl bg-[#00a884] py-3 font-black text-white disabled:opacity-40"><FiCheck className="mr-2 inline" />{busy?'Guardando...':'Guardar asiento'}</button></div></Modal>;
};

const AccountModal = ({ storeId, onClose, onSaved }: any) => { const [form,setForm]=useState({code:'',name:'',account_type:'asset',normal_balance:'debit'});const [error,setError]=useState('');const save=async()=>{try{await api.post('/accounting/accounts',{store_id:storeId,...form});await onSaved();}catch(err:any){setError(err?.message||'No se pudo crear la cuenta');}};return <Modal title="Nueva cuenta contable" onClose={onClose}><div className="space-y-3"><input placeholder="Código, por ejemplo 5203" value={form.code} onChange={e=>setForm({...form,code:e.target.value})} className="w-full rounded-xl border p-3"/><input placeholder="Nombre de la cuenta" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full rounded-xl border p-3"/><select value={form.account_type} onChange={e=>{const type=e.target.value;setForm({...form,account_type:type,normal_balance:type==='asset'||type==='expense'?'debit':'credit'});}} className="w-full rounded-xl border p-3"><option value="asset">Activo</option><option value="liability">Pasivo</option><option value="equity">Patrimonio</option><option value="revenue">Ingreso</option><option value="expense">Gasto</option></select>{error&&<p className="text-xs font-bold text-red-600">{error}</p>}<button onClick={save} className="w-full rounded-xl bg-[#00a884] py-3 font-black text-white">Crear cuenta</button></div></Modal>; };

const EntryDetailModal = ({ entry, onClose, onPost, onVoid }: any) => <Modal title={`${entry.entry_number} · ${entry.description}`} onClose={onClose}><div className="space-y-4"><div className="grid grid-cols-2 gap-3 text-xs"><div className="rounded-xl bg-gray-50 p-3"><span className="block text-gray-400">Fecha</span><b>{String(entry.entry_date).slice(0,10)}</b></div><div className="rounded-xl bg-gray-50 p-3"><span className="block text-gray-400">Estado</span><b>{entry.status}</b></div></div><div className="divide-y rounded-xl border">{entry.lines?.map((line:any)=><div key={line.id} className="grid grid-cols-[1fr_110px_110px] gap-2 p-3 text-sm"><div><b>{line.account_code} · {line.account_name}</b><p className="text-xs text-gray-400">{line.description}</p></div><span className="text-right">{line.debit?money(line.debit):''}</span><span className="text-right">{line.credit?money(line.credit):''}</span></div>)}</div><div className="flex gap-2">{entry.status==='draft'&&<button onClick={()=>onPost(entry.id)} className="flex-1 rounded-xl bg-[#00a884] py-3 font-black text-white">Publicar</button>}{entry.status==='posted'&&<button onClick={()=>onVoid(entry.id)} className="flex-1 rounded-xl bg-red-50 py-3 font-black text-red-700">Anular asiento</button>}</div></div></Modal>;

const Modal = ({ title, onClose, children }: any) => <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"><div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-5"><h2 className="text-lg font-black text-gray-900">{title}</h2><button onClick={onClose} className="rounded-xl bg-gray-100 p-2 text-gray-500"><FiX /></button></div><div className="p-5">{children}</div></div></div>;

export default Accounting;
