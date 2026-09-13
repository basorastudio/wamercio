import React, { useEffect, useState, useMemo } from 'react';
import { Link, useLocation } from '@/lib/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../context/StoreContext';
import { appDateKey, appHour, appMonthKey, formatDate, formatTime } from '../lib/timezone';
import * as FiIcons from 'react-icons/fi';
import Sales from './Sales';
import StoreCredit from './StoreCredit';
import { paymentMethodLabel } from '../lib/paymentMethods';
import { api } from '../lib/api';
import { cartItemInventoryQuantity, cartItemLineTotal, getWeightedProductConfig, isWeightedProduct } from '../lib/weightedProducts';
import { isProductAnalyticsSale, isRevenueSale, saleNetTotal, saleRecognitionRatio } from '../lib/saleFinancials';

const {
  FiTrendingUp, FiTrendingDown, FiDollarSign, FiShoppingCart,
  FiBox, FiUsers, FiCreditCard, FiAlertTriangle, FiChevronRight,
  FiCalendar, FiBarChart2, FiPieChart, FiActivity, FiArrowUp,
  FiArrowDown, FiMinus, FiPackage, FiBookOpen, FiMapPin,
} = FiIcons;

const fmt   = (n) => Number(n || 0).toLocaleString('es-DO');
const fmtK  = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));

const PERIODS = {
  today: { label: 'Hoy', days: 0 },
  last_7_days: { label: '7D', days: 7 },
  last_30_days: { label: '30D', days: 30 },
  last_90_days: { label: '90D', days: 90 },
};

const METHOD_CFG = {
  cash:          { bar: 'bg-emerald-500', light: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  card:          { bar: 'bg-blue-500',    light: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  bank_transfer: { bar: 'bg-violet-500',  light: 'bg-violet-50',  text: 'text-violet-700',  dot: 'bg-violet-500' },
  store_credit:  { bar: 'bg-amber-500',   light: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500' },
};

const TABS = [
  { key: 'summary',   label: 'Resumen',    icon: FiActivity },
  { key: 'sales',    label: 'Ventas',     icon: FiTrendingUp },
  { key: 'products', label: 'Productos',  icon: FiBox },
  { key: 'payments',     label: 'Pagos',      icon: FiCreditCard },
  { key: 'alerts',   label: 'Alertas',    icon: FiAlertTriangle },
];

const KPICard = ({ icon: Icon, label, value, sub, trend = undefined, color = '#00a884', light = '#f0fbf8' }: any) => {
  const TrendIcon = trend > 0 ? FiArrowUp : trend < 0 ? FiArrowDown : FiMinus;
  const trendColor = trend > 0 ? 'text-emerald-500' : trend < 0 ? 'text-red-500' : 'text-gray-400';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: light }}>
          <Icon className="text-base" style={{ color }} />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-0.5 text-[10px] font-bold ${trendColor}`}>
            <TrendIcon className="text-xs" />
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-xl font-black text-gray-800 leading-tight">{value}</p>
      <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{label}</p>
      {sub && <p className="text-[9px] text-gray-300 mt-0.5">{sub}</p>}
    </motion.div>
  );
};

const BarChart = ({ data, color = '#00a884', height = 120 }: any) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1.5 w-full" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1" style={{ height }}>
          <span className="text-[8px] text-gray-400 font-medium leading-none">
            {d.value > 0 ? fmtK(d.value) : ''}
          </span>
          <div className="flex-1 w-full flex items-end">
            <motion.div
              initial={{ height: 0 }} animate={{ height: `${Math.max(4, (d.value / max) * 100)}%` }}
              transition={{ delay: i * 0.04, duration: 0.4 }}
              className="w-full rounded-t-lg"
              style={{ backgroundColor: d.highlight ? color : color + '40' }}
            />
          </div>
          <span className="text-[8px] text-gray-400 font-medium leading-none truncate w-full text-center">
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
};

const LineChart = ({ data, color = '#00a884', height = 100 }: any) => {
  if (data.length < 2) return <div className="h-24 flex items-center justify-center text-xs text-gray-400">Sin datos suficientes</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  const min = Math.min(...data.map(d => d.value), 0);
  const range = max - min || 1;
  const W = 300, H = height;
  const pts = data.map((d, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - ((d.value - min) / range) * (H - 16) - 4,
  }));
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const area = `${path} L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z`;

  return (
    <div className="w-full overflow-hidden" style={{ height: H + 20 }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#grad)" />
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} stroke="white" strokeWidth="1.5" />
        ))}
      </svg>
      <div className="flex justify-between mt-1 px-1">
        {data.filter((_, i) => i % Math.ceil(data.length / 5) === 0 || i === data.length - 1).map((d, i) => (
          <span key={i} className="text-[8px] text-gray-400">{d.label}</span>
        ))}
      </div>
    </div>
  );
};

const HBar = ({ label, value, max, color, sub, barValue = value }: any) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold text-gray-700 truncate max-w-[55%]">{label}</span>
      <div className="text-right">
        <span className="text-xs font-black text-gray-800">{value}</span>
        {sub && <span className="text-[10px] text-gray-400 ml-1">{sub}</span>}
      </div>
    </div>
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }} animate={{ width: `${Math.max(3, (Number(barValue || 0) / Math.max(Number(max || 1), 1)) * 100)}%` }}
        transition={{ duration: 0.5 }}
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
      />
    </div>
  </div>
);

const DonutChart = ({ segments }: any) => {
  const total = segments.reduce((s, d) => s + d.value, 0) || 1;
  const R = 36, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24">
      {segments.map((seg, i) => {
        const pct = seg.value / total;
        const dash = pct * C;
        const el = (
          <circle key={i} cx="50" cy="50" r={R}
            fill="none" stroke={seg.color} strokeWidth="14"
            strokeDasharray={`${dash} ${C - dash}`}
            strokeDashoffset={-offset}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
          />
        );
        offset += dash;
        return el;
      })}
      <circle cx="50" cy="50" r="22" fill="white" />
    </svg>
  );
};

const ReportAnalytics = () => {
  const { sales, products, storeCredits, customers, stores, activeStore, getGlobalMetrics } = useStore();
  const [period, setPeriod]   = useState('last_30_days');
  const [activeTab, setActiveTab] = useState('summary');
  const [serverReport, setServerReport] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');

  useEffect(() => {
    const storeId = String(activeStore?.id || '').trim();
    if (!storeId) {
      setServerReport(null);
      return;
    }
    const controller = new AbortController();
    const loadReport = async () => {
      setReportLoading(true);
      setReportError('');
      try {
        const to = new Date();
        const from = new Date(to);
        const days = PERIODS[period]?.days ?? 30;
        if (days === 0) from.setHours(0, 0, 0, 0);
        else from.setDate(from.getDate() - days);
        const query = new URLSearchParams({
          store_id: storeId,
          from: from.toISOString(),
          to: to.toISOString(),
        });
        const payload = await api.get(`/reports/summary?${query.toString()}`, { signal: controller.signal });
        setServerReport(payload || null);
      } catch (error: any) {
        if (error?.name !== 'AbortError') setReportError(error?.message || 'No se pudo cargar el reporte consolidado.');
      } finally {
        if (!controller.signal.aborted) setReportLoading(false);
      }
    };
    void loadReport();
    return () => controller.abort();
  }, [activeStore?.id, period]);

  const filteredSales = useMemo(() => {
    const days = PERIODS[period]?.days;
    if (days === 0) {
      const today = appDateKey();
      return sales.filter(s => appDateKey(s.date) === today);
    }
    return sales.filter(s => {
      const diff = (Date.now() - new Date(s.date).getTime()) / 86400000;
      return diff <= days;
    });
  }, [sales, period]);

  const prevSales = useMemo(() => {
    const days = PERIODS[period]?.days || 1;
    return sales.filter(s => {
      const diff = (Date.now() - new Date(s.date).getTime()) / 86400000;
      return diff > days && diff <= days * 2;
    });
  }, [sales, period]);

  const revenueSales = useMemo(() => filteredSales.filter(isRevenueSale), [filteredSales]);
  const previousRevenueSales = useMemo(() => prevSales.filter(isRevenueSale), [prevSales]);
  const productAnalyticsSales = useMemo(
    () => filteredSales.filter(isProductAnalyticsSale),
    [filteredSales],
  );

  const localTotalIncome = revenueSales.reduce((sum, sale) => sum + saleNetTotal(sale), 0);
  const localPrevIncome = previousRevenueSales.reduce((sum, sale) => sum + saleNetTotal(sale), 0);
  const localIncomeTrend = localPrevIncome > 0 ? Math.round(((localTotalIncome - localPrevIncome) / localPrevIncome) * 100) : 0;
  const localAvgTicket = revenueSales.length > 0 ? Math.round(localTotalIncome / revenueSales.length) : 0;
  const localPrevAvg = previousRevenueSales.length > 0 ? Math.round(localPrevIncome / previousRevenueSales.length) : 0;
  const localAvgTrend = localPrevAvg > 0 ? Math.round(((localAvgTicket - localPrevAvg) / localPrevAvg) * 100) : 0;
  const totalIncome = Number(serverReport?.net_sales ?? localTotalIncome);
  const incomeTrend = Math.round(Number(serverReport?.sales_trend_percentage ?? localIncomeTrend));
  const avgTicket = Number(serverReport?.average_ticket ?? localAvgTicket);
  const avgTrend = Math.round(Number(serverReport?.ticket_trend_percentage ?? localAvgTrend));
  const reportSalesCount = Number(serverReport?.sales_count ?? revenueSales.length);

  const localDailyData = useMemo(() => {
    const days = Math.max(PERIODS[period]?.days || 1, 1);
    const buckets = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = formatDate(d, { month: 'short', day: 'numeric' });
      buckets[key] = 0;
    }
    revenueSales.forEach(s => {
      const key = formatDate(s.date, { month: 'short', day: 'numeric' });
      if (buckets[key] !== undefined) buckets[key] += saleNetTotal(s);
    });
    return Object.entries(buckets).map(([label, value]) => ({ label, value }));
  }, [revenueSales, period]);

  const dailyData = useMemo(() => {
    const rows = Array.isArray(serverReport?.series) ? serverReport.series : [];
    if (rows.length === 0) return localDailyData;
    return rows.map((row: any) => ({
      label: serverReport?.bucket === 'hour'
        ? formatTime(row.date, { hour: 'numeric' })
        : formatDate(row.date, { month: 'short', day: 'numeric' }),
      value: Number(row.total || 0),
    }));
  }, [localDailyData, serverReport]);

  const hourlyData = useMemo(() => {
    if (period !== 'today') return [];
    const hrs = Array.from({ length: 24 }, (_, h) => ({ label: `${h}h`, value: 0 }));
    revenueSales.forEach(s => {
      const h = appHour(s.date);
      hrs[h].value += saleNetTotal(s);
    });
    return hrs.filter((_, i) => i >= 6 && i <= 22);
  }, [revenueSales, period]);

  const localTopProducts = useMemo(() => {
    const map: Record<string, any> = {};
    productAnalyticsSales.forEach(sale => {
      const recognitionRatio = saleRecognitionRatio(sale);
      (sale.items || []).forEach(item => {
      if (!map[item.name]) {
        const weighted = isWeightedProduct(item);
        map[item.name] = {
          name: item.name,
          qty: 0,
          revenue: 0,
          category: item.category,
          weighted,
          unit: weighted ? getWeightedProductConfig(item).weightUnit : "ud.",
        };
      }
      map[item.name].qty += cartItemInventoryQuantity(item) * recognitionRatio;
      map[item.name].revenue += cartItemLineTotal(item) * recognitionRatio;
      });
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 8);
  }, [productAnalyticsSales]);

  const topProducts = useMemo(() => {
    const rows = Array.isArray(serverReport?.top_products) ? serverReport.top_products : [];
    if (rows.length === 0) return localTopProducts;
    return rows.map((row: any) => ({
      name: row.name || 'Producto',
      category: row.category || 'Sin categoría',
      qty: Number(row.quantity || 0),
      revenue: Number(row.revenue || 0),
      weighted: false,
      unit: 'ud.',
    }));
  }, [localTopProducts, serverReport]);

  const maxQty = Math.max(...topProducts.map(p => p.qty), 1);

  const localMethodStats = useMemo(() => {
    const counts  = { cash: 0, card: 0, bank_transfer: 0, store_credit: 0 };
    const amounts  = { cash: 0, card: 0, bank_transfer: 0, store_credit: 0 };
    revenueSales.forEach(s => {
      if (counts[s.method] !== undefined) { counts[s.method]++; amounts[s.method] += saleNetTotal(s); }
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    return Object.keys(counts).map(m => ({
      method: m, count: counts[m], amount: amounts[m],
      pct: Math.round((counts[m] / total) * 100),
      ...METHOD_CFG[m],
    }));
  }, [revenueSales]);

  const methodStats = useMemo(() => {
    const rows = Array.isArray(serverReport?.payment_methods) ? serverReport.payment_methods : [];
    if (rows.length === 0) return localMethodStats;
    const totalCount = rows.reduce((sum: number, row: any) => sum + Number(row.count || 0), 0) || 1;
    const knownMethods = ['cash', 'card', 'bank_transfer', 'store_credit'];
    return knownMethods.map((method) => {
      const row = rows.find((item: any) => item.method === method) || {};
      return {
        method,
        count: Number(row.count || 0),
        amount: Number(row.total || 0),
        pct: Math.round((Number(row.count || 0) / totalCount) * 100),
        ...(METHOD_CFG[method] || METHOD_CFG.cash),
      };
    });
  }, [localMethodStats, serverReport]);

  const categoryStats = useMemo(() => {
    const map: Record<string, any> = {};
    productAnalyticsSales.forEach(sale => {
      const recognitionRatio = saleRecognitionRatio(sale);
      (sale.items || []).forEach(item => {
        map[item.category] =
          (map[item.category] || 0) + cartItemInventoryQuantity(item) * recognitionRatio;
      });
    });
    return Object.entries(map).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 5);
  }, [productAnalyticsSales]);

  const lowStock   = products.filter(p => p.stock > 0 && p.stock < 5).sort((a, b) => a.stock - b.stock);
  const outOfStock = products.filter(p => p.stock === 0);

  const pendingStoreCredits = storeCredits.filter((credit: any) => {
    if (credit.type !== 'charge' || credit.status === 'reversed') return false;
    const remaining = Number(credit.remaining_amount ?? credit.remainingAmount ?? Math.max(0, Number(credit.amount || 0) - Number(credit.paid_amount ?? credit.paidAmount ?? 0)));
    return remaining > 0.009;
  });
  const localTotalDebt = pendingStoreCredits.reduce((sum: number, credit: any) => {
    const remaining = Number(credit.remaining_amount ?? credit.remainingAmount ?? Math.max(0, Number(credit.amount || 0) - Number(credit.paid_amount ?? credit.paidAmount ?? 0)));
    return sum + remaining;
  }, 0);
  const totalDebt = Number(serverReport?.outstanding_credit ?? localTotalDebt);
  const debtByCustomer = useMemo(() => {
    const map: Record<string, number> = {};
    pendingStoreCredits.forEach((credit: any) => {
      const remaining = Number(credit.remaining_amount ?? credit.remainingAmount ?? Math.max(0, Number(credit.amount || 0) - Number(credit.paid_amount ?? credit.paidAmount ?? 0)));
      map[credit.customer] = (map[credit.customer] || 0) + remaining;
    });
    return Object.entries(map).sort((a, b) => Number(b[1]) - Number(a[1]));
  }, [pendingStoreCredits]);

  const globalMetrics = getGlobalMetrics();

  const monthlyData = useMemo(() => {
    const map: Record<string, any> = {};
    sales.filter(isRevenueSale).forEach(s => {
      const key = appMonthKey(s.date);
      const label = formatDate(s.date, { month: 'short', year: '2-digit' });
      if (!map[key]) map[key] = { label, value: 0, count: 0 };
      map[key].value += saleNetTotal(s); map[key].count++;
    });
    const sorted = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
    const last = sorted.length - 1;
    return sorted.map(([, v], i) => ({ ...v, highlight: i === last }));
  }, [sales]);

  const alertCount = lowStock.length + outOfStock.length + debtByCustomer.length;

  return (
    <div className="flex flex-col h-full bg-[#f8f9fa]">

      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-0 shrink-0 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-black text-gray-800">Analíticas</h2>
            <p className="text-[10px] text-gray-400 font-medium">{activeStore?.name}</p>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {Object.entries(PERIODS).map(([key, item]) => (
              <button key={key} onClick={() => setPeriod(key)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all ${
                  period === key ? 'bg-white text-[#00a884] shadow-sm' : 'text-gray-400'
                }`}
              >{item.label}</button>
            ))}
          </div>
        </div>

        <div className="flex gap-0 overflow-x-auto scrollbar-hide -mx-4 px-4">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all shrink-0 ${
                  isActive ? 'border-[#00a884] text-[#00a884]' : 'border-transparent text-gray-400'
                }`}
              >
                <Icon className="text-sm" />
                {tab.label}
                {tab.key === 'alerts' && alertCount > 0 && (
                  <span className="bg-red-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                    {alertCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide pb-8">
        {reportError && <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">{reportError} Se muestran temporalmente los datos cargados en el panel.</div>}
        {reportLoading && <div className="mx-4 mt-4 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs font-bold text-gray-500">Actualizando reporte consolidado…</div>}
        <AnimatePresence mode="wait">

          {activeTab === 'summary' && (
            <motion.div key="resumen"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="p-4 space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <KPICard icon={FiDollarSign} label="Ingresos" value={`RD$ ${fmt(totalIncome)}`}
                  sub={`${reportSalesCount} ventas`} trend={incomeTrend} />
                <KPICard icon={FiShoppingCart} label="Ticket promedio" value={`RD$ ${fmt(avgTicket)}`}
                  trend={avgTrend} color="#3b82f6" light="#eff6ff" />
                <KPICard icon={FiBookOpen} label="Deuda total" value={`RD$ ${fmt(totalDebt)}`}
                  sub={`${debtByCustomer.length} clientes`} color="#f59e0b" light="#fffbeb" />
                <KPICard icon={FiPackage} label="Sin existencia" value={outOfStock.length}
                  sub={`${lowStock.length} bajo mínimo`} color="#ef4444" light="#fef2f2" />
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-black text-gray-800">Tendencia de ingresos</p>
                    <p className="text-[10px] text-gray-400">{period === 'today' ? 'Por hora' : 'Por día'}</p>
                  </div>
                  <div className={`flex items-center gap-1 text-xs font-black px-2 py-1 rounded-full ${
                    incomeTrend >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                  }`}>
                    {incomeTrend >= 0 ? <FiTrendingUp className="text-sm" /> : <FiTrendingDown className="text-sm" />}
                    {Math.abs(incomeTrend)}%
                  </div>
                </div>
                <LineChart
                  data={period === 'today' ? hourlyData : dailyData}
                  color="#00a884"
                  height={100}
                />
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-black text-gray-800 mb-3">Métodos de pago</p>
                <div className="flex items-center gap-4">
                  <DonutChart segments={methodStats.filter(m => m.count > 0).map(m => ({
                    value: m.count,
                    color: m.dot === 'bg-emerald-500' ? '#10b981'
                         : m.dot === 'bg-blue-500'    ? '#3b82f6'
                         : m.dot === 'bg-violet-500'  ? '#8b5cf6'
                         : '#f59e0b'
                  }))} />
                  <div className="flex-1 space-y-2">
                    {methodStats.map(m => m.count > 0 && (
                      <div key={m.method} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${m.dot}`} />
                          <span className="text-[11px] text-gray-600 font-medium">{m.method}</span>
                        </div>
                        <span className="text-[11px] font-black text-gray-800">{m.pct}%</span>
                      </div>
                    ))}
                    {methodStats.every(m => m.count === 0) && (
                      <p className="text-xs text-gray-400 text-center py-2">Sin ventas en este período</p>
                    )}
                  </div>
                </div>
              </div>

              {stores.length > 1 && (
                <div className="bg-[#1a2332] rounded-2xl p-4 shadow-md">
                  <div className="flex items-center gap-2 mb-3">
                    <FiMapPin className="text-white/50 text-sm" />
                    <p className="text-white/80 text-xs font-black uppercase tracking-widest">Resumen del negocio</p>
                  </div>
                  <div className="space-y-2.5">
                    {globalMetrics.storeMetrics.map(m => {
                      const storeTotal = stores.find(s => s.id === m.id)?.sales
                        .filter(s => {
                          const days = PERIODS[period]?.days || 1;
                          if (period === 'today') return appDateKey(s.date) === appDateKey();
                          return (Date.now() - new Date(s.date).getTime()) / 86400000 <= days;
                        })
                        .reduce((a, s) => a + s.total, 0) || 0;
                      const maxIncome = Math.max(...globalMetrics.storeMetrics.map(x =>
                        stores.find(s => s.id === x.id)?.sales.reduce((a, s) => a + s.total, 0) || 0
                      ), 1);
                      return (
                        <div key={m.id}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm">{m.emoji}</span>
                              <span className="text-white text-[11px] font-bold truncate max-w-[120px]">{m.name.split(' ').slice(-1)[0]}</span>
                              {m.cashRegisterOpen && <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />}
                            </div>
                            <span className="text-white font-black text-xs">RD$ {fmt(storeTotal)}</span>
                          </div>
                          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${(storeTotal / maxIncome) * 100}%` }}
                              transition={{ duration: 0.5 }}
                              className="h-full rounded-full"
                              style={{ backgroundColor: m.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'sales' && (
            <motion.div key="sales"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="p-4 space-y-4"
            >
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Total', value: `RD$ ${fmtK(totalIncome)}`, color: 'text-[#00a884]' },
                  { label: 'Ventas',  value: revenueSales.length,   color: 'text-gray-800' },
                  { label: 'Promedio', value: `RD$ ${fmtK(avgTicket)}`, color: 'text-blue-600' },
                ].map(k => (
                  <div key={k.label} className="bg-white rounded-2xl border border-gray-100 p-3 text-center shadow-sm">
                    <p className={`text-base font-black ${k.color}`}>{k.value}</p>
                    <p className="text-[9px] text-gray-400 mt-0.5">{k.label}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-black text-gray-800 mb-1">Ingresos por mes</p>
                <p className="text-[10px] text-gray-400 mb-4">Últimos 6 meses</p>
                {monthlyData.length === 0
                  ? <p className="text-xs text-gray-400 text-center py-6">Sin datos disponibles</p>
                  : <BarChart data={monthlyData} color="#00a884" height={130} />
                }
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-black text-gray-800 mb-1">Ingresos diarios</p>
                <p className="text-[10px] text-gray-400 mb-3">Período seleccionado</p>
                <LineChart data={dailyData} color="#00a884" height={90} />
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                  <p className="text-xs font-black text-gray-800">Últimas transacciones</p>
                  <span className="text-[10px] text-gray-400 font-medium">{revenueSales.length} total</span>
                </div>
                {revenueSales.length === 0
                  ? <div className="p-8 text-center text-xs text-gray-400">Sin ventas en este período</div>
                  : revenueSales.slice(0, 6).map((s, i) => {
                    const cfg = METHOD_CFG[s.method] || METHOD_CFG.cash;
                    return (
                      <div key={s.id} className={`px-4 py-3 flex items-center gap-3 ${i < revenueSales.slice(0, 6).length - 1 ? 'border-b border-gray-50' : ''}`}>
                        <div className={`w-8 h-8 ${cfg.light} rounded-xl flex items-center justify-center shrink-0`}>
                          <FiShoppingCart className={`text-xs ${cfg.text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-800">{paymentMethodLabel(s.method)}</p>
                          <p className="text-[10px] text-gray-400">{s.items.length} productos · {formatTime(s.date, { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        <span className="text-sm font-black text-[#00a884] shrink-0">RD$ {fmt(saleNetTotal(s))}</span>
                      </div>
                    );
                  })
                }
              </div>
            </motion.div>
          )}

          {activeTab === 'products' && (
            <motion.div key="products"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="p-4 space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <KPICard icon={FiBox}      label="Total productos" value={products.length} color="#3b82f6" light="#eff6ff" />
                <KPICard icon={FiActivity} label="Cantidad vendida"  value={topProducts.reduce((a, p) => a + p.qty, 0)} />
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50">
                  <p className="text-xs font-black text-gray-800">Más vendidos por cantidad</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{PERIODS[period]?.label || period} · {topProducts.length} productos</p>
                </div>
                {topProducts.length === 0
                  ? <div className="p-8 text-center text-xs text-gray-400">Sin ventas en este período</div>
                  : (
                    <div className="p-4 space-y-3">
                      {topProducts.map((p, i) => (
                        <div key={p.name} className="flex items-center gap-3">
                          <span className={`text-xs font-black w-5 text-center shrink-0 ${i < 3 ? 'text-[#00a884]' : 'text-gray-300'}`}>
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-gray-800 truncate max-w-[60%]">{p.name}</span>
                              <span className="text-xs font-black text-gray-700">
                                {Number(p.qty || 0).toLocaleString('es-DO', { maximumFractionDigits: 4 })} {p.unit}
                              </span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(p.qty / maxQty) * 100}%` }}
                                transition={{ delay: i * 0.05, duration: 0.4 }}
                                className="h-full rounded-full"
                                style={{ backgroundColor: i === 0 ? '#00a884' : i === 1 ? '#3b82f6' : i === 2 ? '#8b5cf6' : '#d1d5db' }}
                              />
                            </div>
                            <p className="text-[9px] text-gray-400 mt-0.5">RD$ {fmt(p.revenue)} · {p.category}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                }
              </div>

              {categoryStats.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <p className="text-xs font-black text-gray-800 mb-3">Por categoría</p>
                  <div className="space-y-2.5">
                    {categoryStats.map(([cat, qty], i) => (
                      <HBar key={cat} label={cat} value={qty} max={categoryStats[0][1]}
                        color={['#00a884','#3b82f6','#8b5cf6','#f59e0b','#ef4444'][i]}
                        sub="cant."
                      />
                    ))}
                  </div>
                </div>
              )}

              {topProducts.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <p className="text-xs font-black text-gray-800 mb-3">Mayor ingreso por producto</p>
                  <div className="space-y-2.5">
                    {topProducts.slice(0, 5).sort((a, b) => b.revenue - a.revenue).map((p, i) => (
                      <HBar key={p.name} label={p.name}
                        value={`RD$ ${fmtK(p.revenue)}`}
                        barValue={p.revenue}
                        max={Math.max(...topProducts.map(x => x.revenue), 1)}
                        color={['#00a884','#3b82f6','#8b5cf6','#f59e0b','#ef4444'][i]}
                      />
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'payments' && (
            <motion.div key="payments"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="p-4 space-y-4"
            >
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-black text-gray-800 mb-4">Distribución de pagos</p>
                <div className="flex items-center gap-6 justify-center">
                  <DonutChart segments={methodStats.filter(m => m.count > 0).map(m => ({
                    value: m.count,
                    color: m.dot === 'bg-emerald-500' ? '#10b981'
                         : m.dot === 'bg-blue-500'    ? '#3b82f6'
                         : m.dot === 'bg-violet-500'  ? '#8b5cf6'
                         : '#f59e0b'
                  }))} />
                  <div className="space-y-2.5">
                    {methodStats.map(m => (
                      <div key={m.method} className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${m.dot}`} />
                        <div>
                          <p className="text-xs font-bold text-gray-800">{paymentMethodLabel(m.method)}</p>
                          <p className="text-[9px] text-gray-400">{m.count} ventas · {m.pct}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {methodStats.map(m => (
                  <div key={m.method} className={`${m.light} border border-gray-100 rounded-2xl p-3 shadow-sm`}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className={`w-2 h-2 rounded-full ${m.dot}`} />
                      <p className={`text-[10px] font-black ${m.text}`}>{paymentMethodLabel(m.method)}</p>
                    </div>
                    <p className="text-lg font-black text-gray-800">{m.count}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">RD$ {fmt(m.amount)}</p>
                    <div className="mt-2 h-1 bg-white/60 rounded-full overflow-hidden">
                      <div className={`h-full ${m.bar} rounded-full`} style={{ width: `${m.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-black text-gray-800 mb-3">Ingresos por método</p>
                <div className="space-y-3">
                  {methodStats.filter(m => m.amount > 0).sort((a, b) => b.amount - a.amount).map(m => (
                    <HBar key={m.method} label={paymentMethodLabel(m.method)}
                      value={`RD$ ${fmt(m.amount)}`}
                      barValue={m.amount}
                      max={Math.max(...methodStats.map(x => x.amount), 1)}
                      color={m.dot === 'bg-emerald-500' ? '#10b981' : m.dot === 'bg-blue-500' ? '#3b82f6' : m.dot === 'bg-violet-500' ? '#8b5cf6' : '#f59e0b'}
                    />
                  ))}
                  {methodStats.every(m => m.amount === 0) && (
                    <p className="text-xs text-gray-400 text-center py-4">Sin ingresos en este período</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'alerts' && (
            <motion.div key="alerts"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="p-4 space-y-4"
            >
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Agotados',   value: outOfStock.length,  color: 'text-red-500',    bg: 'bg-red-50',    border: 'border-red-100' },
                  { label: 'Existencia baja', value: lowStock.length,    color: 'text-amber-500',  bg: 'bg-amber-50',  border: 'border-amber-100' },
                  { label: 'Con deuda',  value: debtByCustomer.length, color: 'text-violet-500', bg: 'bg-violet-50', border: 'border-violet-100' },
                ].map(k => (
                  <div key={k.label} className={`${k.bg} border ${k.border} rounded-2xl p-3 text-center`}>
                    <p className={`text-xl font-black ${k.color}`}>{k.value}</p>
                    <p className="text-[9px] text-gray-500 mt-0.5 font-medium">{k.label}</p>
                  </div>
                ))}
              </div>

              {outOfStock.length > 0 && (
                <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
                    <FiAlertTriangle className="text-red-500 text-sm" />
                    <p className="text-xs font-black text-red-700">Productos Agotados</p>
                    <span className="ml-auto bg-red-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full">{outOfStock.length}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {outOfStock.map(p => (
                      <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-gray-800">{p.name}</p>
                          <p className="text-[10px] text-gray-400">{p.category}</p>
                        </div>
                        <span className="text-[10px] font-black bg-red-100 text-red-600 px-2.5 py-1 rounded-full">Agotado</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {lowStock.length > 0 && (
                <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                    <FiBox className="text-amber-500 text-sm" />
                    <p className="text-xs font-black text-amber-700">Existencia baja (&lt;5 unidades)</p>
                    <span className="ml-auto bg-amber-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full">{lowStock.length}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {lowStock.map(p => (
                      <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-gray-800">{p.name}</p>
                          <p className="text-[10px] text-gray-400">{p.category}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-black bg-amber-100 text-amber-600 px-2.5 py-1 rounded-full">
                            {p.stock} ud.
                          </span>
                          <div className="mt-1 w-16 h-1 bg-gray-100 rounded-full overflow-hidden ml-auto">
                            <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(p.stock / 5) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {debtByCustomer.length > 0 && (
                <div className="bg-white rounded-2xl border border-violet-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-violet-50 border-b border-violet-100 flex items-center gap-2">
                    <FiUsers className="text-violet-500 text-sm" />
                    <p className="text-xs font-black text-violet-700">Clientes con Deuda</p>
                    <span className="ml-auto bg-violet-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full">{debtByCustomer.length}</span>
                  </div>
                  <div className="p-4 space-y-3">
                    {debtByCustomer.map(([name, amount], i) => (
                      <HBar key={name} label={name}
                        value={`RD$ ${fmt(amount)}`}
                        barValue={amount}
                        max={debtByCustomer[0][1]}
                        color="#8b5cf6"
                      />
                    ))}
                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-xs font-black text-gray-600">Total deuda</span>
                      <span className="text-sm font-black text-violet-600">RD$ {fmt(totalDebt)}</span>
                    </div>
                  </div>
                </div>
              )}

              {alertCount === 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
                  <div className="w-16 h-16 bg-[#f0fbf8] rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <FiActivity className="text-2xl text-[#00a884]" />
                  </div>
                  <p className="text-sm font-black text-gray-700">¡Todo en orden!</p>
                  <p className="text-xs text-gray-400 mt-1">No hay alertas activas en este momento</p>
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
};


const REPORT_TABS = [
  {
    key: 'reports',
    label: 'REPORTES',
    detail: 'Analíticas del negocio',
    to: '/admin/reports',
    icon: FiBarChart2,
  },
  {
    key: 'sales',
    label: 'VENTAS',
    detail: 'Historial de ventas',
    to: '/admin/reports/sales',
    icon: FiTrendingUp,
  },
  {
    key: 'store_credits',
    label: 'FIADOS',
    detail: 'Créditos de clientes',
    to: '/admin/reports/store-credit',
    icon: FiBookOpen,
  },
];

const Reports = () => {
  const location = useLocation();
  const activeSection = location.pathname === '/admin/reports/sales'
    ? 'sales'
    : location.pathname === '/admin/reports/store-credit'
      ? 'store_credits'
      : 'reports';

  const renderContent = () => {
    if (activeSection === 'sales') return <Sales />;
    if (activeSection === 'store_credits') return <StoreCredit />;
    return <ReportAnalytics />;
  };

  return (
    <div className="flex flex-col h-full bg-[#f8f9fa] overflow-hidden">
      <div className="bg-white px-4 py-4 border-b border-gray-100 shrink-0">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-black text-gray-800">Reportes</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Consulta analíticas, ventas y créditos desde una misma sección.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-2xl w-full lg:w-[520px]">
            {REPORT_TABS.map(tab => {
              const Icon = tab.icon;
              const active = activeSection === tab.key;

              return (
                <Link
                  key={tab.key}
                  to={tab.to}
                  className={`rounded-xl px-3 py-2.5 flex items-center gap-2 transition-all ${
                    active
                      ? 'bg-[#00a884] text-white shadow-md shadow-[#00a884]/25'
                      : 'text-gray-500 hover:bg-white hover:text-gray-700'
                  }`}
                >
                  <Icon className="text-base shrink-0" />
                  <span className="min-w-0 text-left">
                    <span className="block text-[11px] font-black leading-tight">{tab.label}</span>
                    <span className={`block text-[9px] font-semibold truncate leading-tight mt-0.5 ${active ? 'text-white/75' : 'text-gray-400'}`}>
                      {tab.detail}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
};

export default Reports;