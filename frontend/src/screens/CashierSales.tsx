import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useStore } from "../context/StoreContext";
import { formatDate, formatTime, isTodayInAppTimezone } from "../lib/timezone";
import { PAYMENT_METHODS, paymentMethodLabel } from "../lib/paymentMethods";
import { cartItemLineTotal, formatCartItemMeasure } from "../lib/weightedProducts";
import {
  isRevenueSale,
  normalizeSaleFinancialStatus,
  saleFinancialLabel,
  saleNetTotal,
  saleReturnedAmount,
} from "../lib/saleFinancials";
import * as FiIcons from "react-icons/fi";

const {
  FiList,
  FiDollarSign,
  FiCreditCard,
  FiSend,
  FiBookOpen,
  FiChevronDown,
  FiChevronUp,
  FiCalendar,
  FiTrendingUp,
} = FiIcons;

const fmt = (n) => Number(n).toLocaleString("es-DO");

const financialStatusColor = {
  completed: "bg-emerald-50 text-emerald-700 border-emerald-100",
  partially_returned: "bg-amber-50 text-amber-700 border-amber-100",
  returned: "bg-orange-50 text-orange-700 border-orange-100",
  voided: "bg-red-50 text-red-700 border-red-100",
};

const methodIcon = {
  cash: FiDollarSign,
  card: FiCreditCard,
  bank_transfer: FiSend,
  store_credit: FiBookOpen,
};
const methodColor = {
  cash: "bg-emerald-100 text-emerald-700",
  card: "bg-blue-100 text-blue-700",
  bank_transfer: "bg-purple-100 text-purple-700",
  store_credit: "bg-amber-100 text-amber-700",
};
const PAYMENT_FILTERS = [{ key: "all", label: "Todos" }, ...PAYMENT_METHODS];

const SaleCard = ({ sale, index }: any) => {
  const [open, setOpen] = useState(false);
  const Icon = methodIcon[sale.method] || FiDollarSign;
  const colorCls = methodColor[sale.method] || "bg-gray-100 text-gray-600";
  const timeStr = formatTime(sale.date, { hour: "2-digit", minute: "2-digit" });
  const dateStr = formatDate(sale.date, { day: "2-digit", month: "short" });
  const financialStatus = normalizeSaleFinancialStatus(sale);
  const netTotal = saleNetTotal(sale);
  const returnedAmount = saleReturnedAmount(sale);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
    >
      <button
        className="w-full p-4 flex items-center gap-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colorCls}`}
        >
          <Icon className="text-base" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold text-gray-800 text-sm">
              {sale.customer
                ? sale.customer
                : `Venta #${String(sale.id).slice(-4)}`}
            </p>
            <span className="font-black text-[#00a884] text-sm shrink-0">
              RD$ {fmt(netTotal)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colorCls}`}
            >
              {paymentMethodLabel(sale.method)}
            </span>
            {financialStatus !== "completed" && (
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${financialStatusColor[financialStatus] || financialStatusColor.completed}`}>
                {saleFinancialLabel(sale)}
              </span>
            )}
            <span className="text-[10px] text-gray-400">
              {dateStr} · {timeStr}
            </span>
            <span className="text-[10px] text-gray-300">
              {sale.items.length} producto(s)
            </span>
          </div>
        </div>
        {open ? (
          <FiChevronUp className="text-gray-300 text-sm shrink-0" />
        ) : (
          <FiChevronDown className="text-gray-300 text-sm shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-1.5">
          {sale.items.map((item, i) => (
            <div key={i} className="flex justify-between text-xs text-gray-600">
              <span>
                {item.name} · {formatCartItemMeasure(item)}
              </span>
              <span className="font-semibold text-gray-700">
                RD$ {fmt(cartItemLineTotal(item))}
              </span>
            </div>
          ))}
          {sale.method === "bank_transfer" && sale.deliveryAddress && (
            <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-[11px] font-bold text-violet-700">
              {sale.deliveryAddress}
            </div>
          )}
          {returnedAmount > 0 && (
            <div className="flex justify-between text-[11px] text-amber-700">
              <span>Devuelto o ajustado</span>
              <span className="font-bold">- RD$ {fmt(returnedAmount)}</span>
            </div>
          )}
          <div className="pt-2 border-t border-gray-100 flex justify-between">
            <span className="text-xs font-black text-gray-700">
              {financialStatus === "voided" ? "Total anulado" : "Total neto"}
            </span>
            <span className={`text-sm font-black ${financialStatus === "voided" ? "text-red-600" : "text-[#00a884]"}`}>
              RD$ {fmt(netTotal)}
            </span>
          </div>
        </div>
      )}
    </motion.div>
  );
};

const CashierSales = () => {
  const { sales } = useStore();
  const [filter, setFilter] = useState("all");

  const todaySales = useMemo(() => {
    return sales.filter((s) => isTodayInAppTimezone(s.date));
  }, [sales]);

  const filtered = useMemo(() => {
    if (filter === "all") return todaySales;
    return todaySales.filter((s) => s.method === filter);
  }, [todaySales, filter]);

  const revenueSales = useMemo(() => todaySales.filter(isRevenueSale), [todaySales]);
  const todayTotal = revenueSales.reduce((a, s) => a + saleNetTotal(s), 0);
  const totalCash = revenueSales
    .filter((s) => s.method === "cash")
    .reduce((a, s) => a + saleNetTotal(s), 0);

  return (
    <div className="h-full overflow-y-auto bg-[#f8f9fa] scrollbar-hide">
      <div className="max-w-6xl mx-auto p-4 md:p-8 xl:p-10 space-y-5">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-[#00a884] to-[#007a60] rounded-3xl p-5 md:p-7 text-white shadow-lg shadow-[#00a884]/20"
        >
          <div className="flex items-center gap-2 mb-5">
            <FiTrendingUp className="text-white/80" />
            <p className="font-black text-lg md:text-xl">Mis ventas de hoy</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
            {[
              { label: "Total vendido", value: `RD$ ${fmt(todayTotal)}` },
              { label: "Transacciones", value: revenueSales.length },
              { label: "En efectivo", value: `RD$ ${fmt(totalCash)}` },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-white/20 rounded-2xl p-4 md:p-5 text-center"
              >
                <p className="font-black text-white text-xl md:text-2xl leading-tight">
                  {s.value}
                </p>
                <p className="text-white/75 text-[10px] md:text-xs mt-1">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="flex flex-wrap gap-2 pb-1">
          {PAYMENT_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-5 py-2 rounded-full text-xs font-bold whitespace-nowrap border transition-all ${
                filter === key
                  ? "bg-[#00a884] border-[#00a884] text-white shadow-sm"
                  : "bg-white border-gray-200 text-gray-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 md:py-32 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
              <FiList className="text-2xl text-gray-300" />
            </div>
            <p className="text-sm text-gray-400 font-medium">
              {todaySales.length === 0
                ? "Aún no hay ventas hoy"
                : "Sin ventas con ese filtro"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {filtered.map((sale, i) => (
              <SaleCard key={sale.id} sale={sale} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CashierSales;
