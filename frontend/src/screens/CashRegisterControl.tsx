import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../context/StoreContext';
import { useStaffAuth } from '../context/StaffAuthContext';
import { api } from '../lib/api';
import { formatDate, formatDateTime, formatTime } from '../lib/timezone';
import * as FiIcons from 'react-icons/fi';

const {
  FiActivity,
  FiAlertTriangle,
  FiArrowDownCircle,
  FiArrowUpCircle,
  FiCheckCircle,
  FiClock,
  FiDollarSign,
  FiLoader,
  FiLock,
  FiRefreshCw,
  FiUnlock,
  FiUser,
} = FiIcons;

const money = (value: any) => Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const movementLabel: Record<string, string> = {
  sale: 'Ventas en efectivo',
  deposit: 'Depósitos',
  withdrawal: 'Retiros',
  expense: 'Gastos',
  refund: 'Reembolsos',
  credit_payment: 'Abonos de fiado',
  adjustment: 'Ajustes positivos',
};

const expectedCash = (session: any) => {
  if (!session) return 0;
  const movements = session.movements || {};
  const income = Number(movements.sale || 0) + Number(movements.deposit || 0) + Number(movements.credit_payment || 0) + Number(movements.adjustment || 0);
  const outflow = Number(movements.withdrawal || 0) + Number(movements.expense || 0) + Number(movements.refund || 0);
  return Number(session.opening_amount || 0) + income - outflow;
};

const CashRegisterControl = () => {
  const { activeStore } = useStore();
  const { staffUser } = useStaffAuth();
  const storeId = String(activeStore?.id || '').trim();
  const [session, setSession] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState<'open' | 'movement' | 'close' | ''>('');
  const [openingAmount, setOpeningAmount] = useState('');
  const [closingAmount, setClosingAmount] = useState('');
  const [note, setNote] = useState('');
  const [movementType, setMovementType] = useState('deposit');
  const [movementAmount, setMovementAmount] = useState('');

  const loadData = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const [current, sessions] = await Promise.all([
        api.get(`/cash/sessions/current?store_id=${encodeURIComponent(storeId)}`),
        api.get(`/cash/sessions?store_id=${encodeURIComponent(storeId)}&limit=30`),
      ]);
      setSession(current?.session || null);
      setHistory(Array.isArray(sessions?.items) ? sessions.items : []);
    } catch (loadError: any) {
      setError(loadError?.message || 'No se pudo cargar el control de caja.');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const run = async (action: () => Promise<any>, successMessage: string) => {
    setWorking(true);
    setError('');
    try {
      await action();
      setModal('');
      setOpeningAmount('');
      setClosingAmount('');
      setMovementAmount('');
      setNote('');
      setNotice(successMessage);
      await loadData();
    } catch (actionError: any) {
      setError(actionError?.message || 'No se pudo completar la operación.');
    } finally {
      setWorking(false);
    }
  };

  const openCash = () => run(
    () => api.post('/cash/sessions', { store_id: storeId, opening_amount: Number(openingAmount || 0), note }),
    'La caja fue abierta correctamente.',
  );

  const createMovement = () => run(
    () => api.post('/cash/movements', { store_id: storeId, type: movementType, amount: Number(movementAmount || 0), note }),
    'El movimiento de caja fue registrado.',
  );

  const closeCash = () => run(
    () => api.post(`/cash/sessions/${encodeURIComponent(session?.id || '')}/close`, { closing_amount: Number(closingAmount || 0), note }),
    'La caja fue cerrada y auditada correctamente.',
  );

  const expected = useMemo(() => expectedCash(session), [session]);
  const cashierName = String(staffUser?.name || staffUser?.username || 'Usuario autorizado');

  if (loading) {
    return <div className="min-h-full flex items-center justify-center bg-[#f8fafc] text-sm font-bold text-gray-500"><FiLoader className="animate-spin mr-2" /> Cargando control de caja…</div>;
  }

  return (
    <div className="min-h-full bg-[#f8fafc] p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Control de caja</h1>
            <p className="text-sm text-gray-500 mt-1">Apertura, movimientos, arqueo y cierre por jornada.</p>
          </div>
          <button type="button" onClick={loadData} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-black text-gray-600 hover:bg-gray-50"><FiRefreshCw /> Actualizar</button>
        </header>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}
        {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{notice}</div>}

        {session ? (
          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl bg-gradient-to-br from-[#00a884] to-[#006b56] p-6 text-white shadow-xl shadow-[#00a884]/15">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[10px] font-black tracking-wider"><FiActivity className="animate-pulse" /> CAJA ABIERTA</div>
                <h2 className="mt-4 text-2xl font-black">Jornada activa</h2>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/75">
                  <span className="inline-flex items-center gap-1.5"><FiClock /> {formatDateTime(session.opened_at)}</span>
                  <span className="inline-flex items-center gap-1.5"><FiUser /> {cashierName}</span>
                </div>
              </div>
              <div className="rounded-2xl bg-white/15 px-5 py-4 text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/65">Efectivo esperado</p>
                <p className="mt-1 text-2xl font-black">RD$ {money(expected)}</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Metric label="Fondo inicial" value={`RD$ ${money(session.opening_amount)}`} />
              <Metric label="Ventas en efectivo" value={`RD$ ${money(session.movements?.sale)}`} />
              <Metric label="Entradas adicionales" value={`RD$ ${money(Number(session.movements?.deposit || 0) + Number(session.movements?.credit_payment || 0))}`} />
              <Metric label="Salidas y reembolsos" value={`RD$ ${money(Number(session.movements?.withdrawal || 0) + Number(session.movements?.expense || 0) + Number(session.movements?.refund || 0))}`} />
            </div>

            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <button type="button" onClick={() => setModal('movement')} className="flex-1 rounded-xl bg-white/15 py-3 text-sm font-black hover:bg-white/20"><FiDollarSign className="inline mr-2" /> Registrar entrada o salida</button>
              <button type="button" onClick={() => { setClosingAmount(String(Math.max(0, expected).toFixed(2))); setModal('close'); }} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-black shadow-lg shadow-red-900/10 hover:bg-red-600"><FiLock className="inline mr-2" /> Cerrar y arquear caja</button>
            </div>
          </motion.section>
        ) : (
          <section className="rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl"><FiUnlock /></div>
            <h2 className="mt-4 text-xl font-black text-gray-900">La caja está cerrada</h2>
            <p className="mt-2 text-sm text-gray-500">Abre una jornada antes de registrar ventas en efectivo, movimientos o abonos.</p>
            <button type="button" onClick={() => setModal('open')} className="mt-6 rounded-xl bg-[#00a884] px-6 py-3 text-sm font-black text-white shadow-md shadow-[#00a884]/20">Abrir caja</button>
          </section>
        )}

        {session && Object.keys(session.movements || {}).length > 0 && (
          <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="font-black text-gray-900">Movimientos acumulados de la jornada</h2>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(session.movements || {}).map(([type, amount]) => (
                <div key={type} className="rounded-2xl bg-gray-50 p-4 flex items-center justify-between gap-3">
                  <span className="text-xs font-bold text-gray-600">{movementLabel[type] || type}</span>
                  <span className="text-sm font-black text-gray-900">RD$ {money(amount)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 font-black text-gray-900">Historial de jornadas</h2>
          {history.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">Todavía no hay jornadas registradas.</div>
          ) : (
            <div className="grid gap-3">
              {history.map((item) => <SessionCard key={item.id} session={item} />)}
            </div>
          )}
        </section>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            {modal === 'open' && <CashForm title="Abrir caja" description="Registra el fondo inicial contado antes de iniciar la jornada." amount={openingAmount} setAmount={setOpeningAmount} note={note} setNote={setNote} action="Abrir caja" icon={<FiUnlock />} working={working} onCancel={() => setModal('')} onSubmit={openCash} />}
            {modal === 'close' && <CloseForm expected={expected} amount={closingAmount} setAmount={setClosingAmount} note={note} setNote={setNote} working={working} onCancel={() => setModal('')} onSubmit={closeCash} />}
            {modal === 'movement' && <MovementForm type={movementType} setType={setMovementType} amount={movementAmount} setAmount={setMovementAmount} note={note} setNote={setNote} working={working} onCancel={() => setModal('')} onSubmit={createMovement} />}
          </div>
        </div>
      )}
    </div>
  );
};

const Metric = ({ label, value }: any) => <div className="rounded-2xl bg-white/15 p-3 text-center"><p className="text-lg font-black">{value}</p><p className="mt-1 text-[9px] font-bold text-white/65">{label}</p></div>;

const SessionCard = ({ session }: any) => {
  const difference = Number(session.difference_amount || 0);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${session.status === 'open' ? 'bg-emerald-50 text-emerald-600' : difference === 0 ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
        {session.status === 'open' ? <FiActivity /> : difference === 0 ? <FiCheckCircle /> : <FiAlertTriangle />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-black text-gray-900">{formatDate(session.opened_at, { day: '2-digit', month: 'long', year: 'numeric' })}</p>
        <p className="mt-1 text-xs text-gray-500">{formatTime(session.opened_at)} {session.closed_at ? `→ ${formatTime(session.closed_at)}` : '· En curso'}</p>
      </div>
      <div className="grid grid-cols-3 gap-4 text-right text-xs">
        <div><p className="text-gray-400">Apertura</p><p className="font-black text-gray-800">RD$ {money(session.opening_amount)}</p></div>
        <div><p className="text-gray-400">Esperado</p><p className="font-black text-gray-800">RD$ {money(session.expected_amount ?? expectedCash(session))}</p></div>
        <div><p className="text-gray-400">Diferencia</p><p className={`font-black ${difference === 0 ? 'text-emerald-600' : difference < 0 ? 'text-red-600' : 'text-amber-600'}`}>{difference > 0 ? '+' : ''}RD$ {money(difference)}</p></div>
      </div>
    </div>
  );
};

const CashForm = ({ title, description, amount, setAmount, note, setNote, action, icon, working, onCancel, onSubmit }: any) => (
  <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    <h2 className="text-xl font-black text-gray-900">{title}</h2><p className="mt-1 text-sm text-gray-500">{description}</p>
    <AmountInput value={amount} onChange={setAmount} label="Monto en efectivo" />
    <NoteInput value={note} onChange={setNote} />
    <FormActions working={working} valid={amount !== '' && Number(amount) >= 0} onCancel={onCancel} action={action} icon={icon} />
  </form>
);

const CloseForm = ({ expected, amount, setAmount, note, setNote, working, onCancel, onSubmit }: any) => {
  const difference = Number(amount || 0) - Number(expected || 0);
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    <h2 className="text-xl font-black text-gray-900">Cerrar y arquear caja</h2><p className="mt-1 text-sm text-gray-500">Cuenta físicamente el efectivo y registra el total real.</p>
    <div className="mt-5 grid grid-cols-2 gap-3"><SummaryBox label="Esperado" value={expected} /><SummaryBox label="Diferencia" value={difference} highlight /></div>
    <AmountInput value={amount} onChange={setAmount} label="Efectivo contado" />
    <NoteInput value={note} onChange={setNote} placeholder="Observación del arqueo" />
    <FormActions working={working} valid={amount !== '' && Number(amount) >= 0} onCancel={onCancel} action="Cerrar caja" icon={<FiLock />} />
  </form>;
};

const MovementForm = ({ type, setType, amount, setAmount, note, setNote, working, onCancel, onSubmit }: any) => (
  <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    <h2 className="text-xl font-black text-gray-900">Movimiento manual</h2><p className="mt-1 text-sm text-gray-500">Registra entradas, retiros, gastos o ajustes autorizados.</p>
    <label className="mt-5 block text-[10px] font-black uppercase tracking-wider text-gray-500">Tipo</label>
    <select value={type} onChange={(event) => setType(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[#00a884]/20"><option value="deposit">Depósito de efectivo</option><option value="withdrawal">Retiro de efectivo</option><option value="expense">Gasto pagado desde caja</option><option value="adjustment">Ajuste positivo autorizado</option></select>
    <AmountInput value={amount} onChange={setAmount} label="Monto" />
    <NoteInput value={note} onChange={setNote} placeholder="Motivo obligatorio" />
    <FormActions working={working} valid={Number(amount) > 0 && note.trim().length >= 3} onCancel={onCancel} action="Registrar movimiento" icon={type === 'deposit' || type === 'adjustment' ? <FiArrowDownCircle /> : <FiArrowUpCircle />} />
  </form>
);

const AmountInput = ({ value, onChange, label }: any) => <label className="mt-5 block"><span className="text-[10px] font-black uppercase tracking-wider text-gray-500">{label}</span><div className="relative mt-2"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-gray-400">RD$</span><input type="number" min="0" step="0.01" value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-gray-200 py-3 pl-12 pr-4 text-lg font-black outline-none focus:ring-2 focus:ring-[#00a884]/20" placeholder="0.00" /></div></label>;
const NoteInput = ({ value, onChange, placeholder = 'Nota opcional' }: any) => <label className="mt-4 block"><span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Observación</span><textarea value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full resize-none rounded-xl border border-gray-200 p-3 text-sm outline-none focus:ring-2 focus:ring-[#00a884]/20" rows={3} placeholder={placeholder} /></label>;
const SummaryBox = ({ label, value, highlight = false }: any) => <div className={`rounded-2xl p-4 ${highlight ? Number(value) === 0 ? 'bg-emerald-50' : 'bg-amber-50' : 'bg-gray-50'}`}><p className="text-[9px] font-black uppercase tracking-wider text-gray-400">{label}</p><p className="mt-1 text-lg font-black text-gray-900">{Number(value) > 0 && highlight ? '+' : ''}RD$ {money(value)}</p></div>;
const FormActions = ({ working, valid, onCancel, action, icon }: any) => <div className="mt-6 flex gap-3"><button type="button" onClick={onCancel} disabled={working} className="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-black text-gray-600">Cancelar</button><button type="submit" disabled={working || !valid} className="flex-1 rounded-xl bg-[#00a884] py-3 text-sm font-black text-white disabled:opacity-50">{working ? <FiLoader className="inline animate-spin mr-2" /> : icon}<span className="ml-2">{action}</span></button></div>;

export default CashRegisterControl;
