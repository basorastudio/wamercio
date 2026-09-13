import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../context/StoreContext";
import { formatDate, formatTime } from "../lib/timezone";
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
  FiCreditCard,
  FiChevronDown,
  FiChevronUp,
  FiDollarSign,
  FiSend,
  FiBookOpen,
  FiSearch,
  FiX,
} = FiIcons;

const METHOD_COLORS = {
  cash: "bg-emerald-100 text-emerald-700",
  card: "bg-blue-100 text-blue-700",
  bank_transfer: "bg-purple-100 text-purple-700",
  store_credit: "bg-amber-100 text-amber-700",
};
const METHOD_ICONS = {
  cash: FiDollarSign,
  card: FiCreditCard,
  bank_transfer: FiSend,
  store_credit: FiBookOpen,
};
const fmt = (n) => Number(n).toLocaleString("es-DO");

const FINANCIAL_STATUS_COLORS = {
  completed: "bg-emerald-50 text-emerald-700 border-emerald-100",
  partially_returned: "bg-amber-50 text-amber-700 border-amber-100",
  returned: "bg-orange-50 text-orange-700 border-orange-100",
  voided: "bg-red-50 text-red-700 border-red-100",
};

const Sales = () => {
  const { sales } = useStore();
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return sales
      .filter((s) => filter === "all" || s.method === filter)
      .filter(
        (s) =>
          !search ||
          s.customer?.toLowerCase().includes(search.toLowerCase()) ||
          paymentMethodLabel(s.method).toLowerCase().includes(search.toLowerCase()),
      );
  }, [sales, filter, search]);

  const total = filtered.filter(isRevenueSale).reduce((sum, s) => sum + saleNetTotal(s), 0);

  const methodStats = useMemo(() => {
    const map = {};
    sales.filter(isRevenueSale).forEach((s) => {
      map[s.method] = (map[s.method] || 0) + saleNetTotal(s);
    });
    return map;
  }, [sales]);

  return (
    <div className="flex flex-col h-full bg-[#f8f9fa]">
      <div className="bg-white border-b border-gray-100 px-4 md:px-6 pt-5 pb-4 shrink-0 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-black text-gray-800">
              Historial de Ventas
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {sales.length} ventas registradas
            </p>
          </div>
          <div className="bg-[#eafaf1] border border-[#00a884]/20 rounded-xl px-3 py-2 text-right">
            <p className="text-[10px] text-[#00a884] font-bold">
              Total filtrado
            </p>
            <p className="text-sm font-black text-[#00a884]">
              RD$ {fmt(total)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {PAYMENT_METHODS.map(({ key, label }) => {
            const Icon = METHOD_ICONS[key];
            const v = methodStats[key] || 0;
            return (
              <button
                key={key}
                onClick={() => setFilter((prev) => (prev === key ? "all" : key))}
                className={`flex flex-col items-center gap-1 p-2 md:p-3 rounded-xl border text-center transition-all ${
                  filter === key
                    ? "bg-[#00a884] border-[#00a884] text-white shadow-md"
                    : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                }`}
              >
                <Icon className="text-sm md:text-base" />
                <span className="text-[9px] md:text-[10px] font-bold leading-tight">
                  {label}
                </span>
                <span className="text-[9px] md:text-[10px] font-black">
                  {v > 0 ? `RD$ ${(v / 1000).toFixed(1)}k` : "—"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
          <input
            type="text"
            placeholder="Buscar por cliente o método..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00a884]/30 focus:border-[#00a884] transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <FiX className="text-sm" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide pb-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4 border border-gray-200">
              <FiCreditCard className="text-3xl text-gray-300" />
            </div>
            <p className="text-sm text-gray-500 font-bold">
              {sales.length === 0
                ? "No hay ventas registradas"
                : "Sin resultados para este filtro"}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden md:block px-4 md:px-6 pt-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#f8fafc] border-b border-gray-100">
                    <tr>
                      <th className="px-5 py-3 text-xs font-bold text-gray-500">
                        Método
                      </th>
                      <th className="px-5 py-3 text-xs font-bold text-gray-500">
                        Cliente
                      </th>
                      <th className="px-5 py-3 text-xs font-bold text-gray-500">
                        Productos
                      </th>
                      <th className="px-5 py-3 text-xs font-bold text-gray-500">
                        Fecha
                      </th>
                      <th className="px-5 py-3 text-xs font-bold text-gray-500 text-right">
                        Total
                      </th>
                      <th className="px-5 py-3 text-xs font-bold text-gray-500 text-center">
                        Detalle
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((sale, i) => {
                      const Icon = METHOD_ICONS[sale.method] || FiCreditCard;
                      const financialStatus = normalizeSaleFinancialStatus(sale);
                      const netTotal = saleNetTotal(sale);
                      const returnedAmount = saleReturnedAmount(sale);
                      return (
                        <React.Fragment key={sale.id}>
                          <tr
                            className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors ${expanded === sale.id ? "bg-[#f8fafc]" : ""}`}
                          >
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${METHOD_COLORS[sale.method] || "bg-gray-100 text-gray-600"}`}
                                >
                                  <Icon className="text-sm" />
                                </div>
                                <span
                                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${METHOD_COLORS[sale.method] || "bg-gray-100 text-gray-600"}`}
                                >
                                  {paymentMethodLabel(sale.method)}
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-xs text-gray-600 font-medium">
                              <div>{sale.customer || "—"}</div>
                              {financialStatus !== "completed" && (
                                <span className={`inline-flex mt-1 text-[9px] font-black px-2 py-0.5 rounded-full border ${FINANCIAL_STATUS_COLORS[financialStatus] || FINANCIAL_STATUS_COLORS.completed}`}>
                                  {saleFinancialLabel(sale)}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-xs text-gray-500">
                              {sale.items?.length || 0} ítem(s)
                            </td>
                            <td className="px-5 py-3 text-xs text-gray-400">
                              {formatDate(sale.date, {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                              })}{" "}
                              ·{" "}
                              {formatTime(sale.date, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <span className="text-sm font-black text-[#00a884]">
                                RD$ {fmt(netTotal)}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-center">
                              <button
                                onClick={() =>
                                  setExpanded(
                                    expanded === sale.id ? null : sale.id,
                                  )
                                }
                                className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center mx-auto hover:bg-gray-200 transition-colors"
                              >
                                {expanded === sale.id ? (
                                  <FiChevronUp className="text-gray-500 text-xs" />
                                ) : (
                                  <FiChevronDown className="text-gray-500 text-xs" />
                                )}
                              </button>
                            </td>
                          </tr>
                          {expanded === sale.id && (
                            <tr>
                              <td
                                colSpan={6}
                                className="px-5 py-3 bg-[#f8fafc] border-b border-gray-100"
                              >
                                <div className="space-y-1.5">
                                  {sale.items?.map((item, j) => (
                                    <div
                                      key={j}
                                      className="flex justify-between items-center text-xs"
                                    >
                                      <span className="text-gray-700">
                                        {item.name}{" "}
                                        <span className="text-gray-400">
                                          {formatCartItemMeasure(item)}
                                        </span>
                                      </span>
                                      <span className="font-bold text-gray-800">
                                        RD$ {fmt(cartItemLineTotal(item))}
                                      </span>
                                    </div>
                                  ))}
                                  {sale.method === "bank_transfer" &&
                                    sale.deliveryAddress && (
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
                                  <div className="pt-2 border-t border-gray-200 flex justify-between">
                                    <span className="text-xs font-black text-gray-600">
                                      {financialStatus === "voided" ? "Total anulado" : "Total neto"}
                                    </span>
                                    <span className={`text-sm font-black ${financialStatus === "voided" ? "text-red-600" : "text-[#00a884]"}`}>
                                      RD$ {fmt(netTotal)}
                                    </span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="md:hidden p-4 space-y-3">
              {filtered.map((sale, i) => {
                const Icon = METHOD_ICONS[sale.method] || FiCreditCard;
                const financialStatus = normalizeSaleFinancialStatus(sale);
                const netTotal = saleNetTotal(sale);
                const returnedAmount = saleReturnedAmount(sale);
                return (
                  <motion.div
                    key={sale.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                  >
                    <button
                      onClick={() =>
                        setExpanded(expanded === sale.id ? null : sale.id)
                      }
                      className="w-full p-4 flex items-center gap-3 text-left"
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${METHOD_COLORS[sale.method] || "bg-gray-100 text-gray-600"}`}
                      >
                        <Icon className="text-base" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${METHOD_COLORS[sale.method] || "bg-gray-100 text-gray-600"}`}
                          >
                            {paymentMethodLabel(sale.method)}
                          </span>
                          {financialStatus !== "completed" && (
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${FINANCIAL_STATUS_COLORS[financialStatus] || FINANCIAL_STATUS_COLORS.completed}`}>
                              {saleFinancialLabel(sale)}
                            </span>
                          )}
                          {sale.customer && (
                            <span className="text-[10px] text-gray-500 font-medium truncate">
                              {sale.customer}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400">
                          {formatDate(sale.date, {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}{" "}
                          · {sale.items?.length} prod.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-black text-[#00a884]">
                          RD$ {fmt(netTotal)}
                        </span>
                        {expanded === sale.id ? (
                          <FiChevronUp className="text-gray-400 text-sm" />
                        ) : (
                          <FiChevronDown className="text-gray-400 text-sm" />
                        )}
                      </div>
                    </button>
                    <AnimatePresence>
                      {expanded === sale.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden border-t border-gray-50"
                        >
                          <div className="p-4 bg-gray-50/50 space-y-2">
                            {sale.items?.map((item, j) => (
                              <div
                                key={j}
                                className="flex justify-between items-center text-sm"
                              >
                                <span className="text-gray-700">
                                  {item.name}{" "}
                                  <span className="text-gray-400 text-xs">
                                    {formatCartItemMeasure(item)}
                                  </span>
                                </span>
                                <span className="font-bold text-gray-800">
                                  RD$ {fmt(cartItemLineTotal(item))}
                                </span>
                              </div>
                            ))}
                            {sale.method === "bank_transfer" &&
                              sale.deliveryAddress && (
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
                            <div className="pt-2 border-t border-gray-200 flex justify-between">
                              <span className="text-xs font-black text-gray-600">
                                {financialStatus === "voided" ? "Total anulado" : "Total neto"}
                              </span>
                              <span className={`text-sm font-black ${financialStatus === "voided" ? "text-red-600" : "text-[#00a884]"}`}>
                                RD$ {fmt(netTotal)}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Sales;
