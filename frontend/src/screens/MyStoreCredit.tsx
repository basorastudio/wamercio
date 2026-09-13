import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../lib/timezone";
import { useStore } from "../context/StoreContext";
import { cartItemLineTotal, formatCartItemMeasure } from "../lib/weightedProducts";
import * as FiIcons from "react-icons/fi";

const {
  FiBookOpen,
  FiClock,
  FiCheckCircle,
  FiAlertTriangle,
  FiChevronDown,
  FiChevronUp,
  FiDollarSign,
  FiCalendar,
  FiTrendingUp,
  FiShield,
  FiInfo,
} = FiIcons;

const fmt = (n) => Number(n || 0).toLocaleString("es-DO");
const isUnlimitedCredit = (user) =>
  Boolean(
    user?.unlimitedCredit ||
    user?.creditUnlimited ||
    String(user?.creditType || "").toLowerCase() === "unlimited",
  );

const relativeDate = (iso) => {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
  return formatDate(iso, { day: "2-digit", month: "short", year: "numeric" });
};

const StoreCreditCard = ({ order: order, index }: any) => {
  const [open, setOpen] = useState(false);
  const isPending = order.status === "pending";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
        isPending ? "border-amber-100" : "border-gray-100"
      }`}
    >
      <button
        className="w-full p-4 flex items-center gap-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            isPending ? "bg-amber-50" : "bg-emerald-50"
          }`}
        >
          {isPending ? (
            <FiClock className="text-amber-500 text-base" />
          ) : (
            <FiCheckCircle className="text-emerald-500 text-base" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold text-gray-800 text-sm">{order.id}</p>
            <span
              className={`font-black text-sm shrink-0 ${
                isPending ? "text-amber-600" : "text-emerald-600"
              }`}
            >
              RD$ {fmt(order.total)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isPending
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {isPending ? "Pendiente" : "Pagado"}
            </span>
            <span className="text-[10px] text-gray-400">
              {relativeDate(order.date)}
            </span>
            <span className="text-[10px] text-gray-300">·</span>
            <span className="text-[10px] text-gray-400">
              {order.items?.length} producto(s)
            </span>
          </div>
        </div>
        {open ? (
          <FiChevronUp className="text-gray-300 text-sm shrink-0" />
        ) : (
          <FiChevronDown className="text-gray-300 text-sm shrink-0" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-1.5">
              {order.items?.map((item, i) => (
                <div
                  key={i}
                  className="flex justify-between text-xs text-gray-600"
                >
                  <span className="truncate pr-2">
                    {item.name} · {formatCartItemMeasure(item)}
                  </span>
                  <span className="font-semibold text-gray-700 shrink-0">
                    RD$ {fmt(cartItemLineTotal(item))}
                  </span>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-100 flex justify-between">
                <span className="text-xs font-black text-gray-700">Total</span>
                <span
                  className={`text-sm font-black ${
                    isPending ? "text-amber-600" : "text-emerald-600"
                  }`}
                >
                  RD$ {fmt(order.total)}
                </span>
              </div>
              {!isPending && order.paymentDate && (
                <div className="flex items-center gap-1.5 mt-2 text-[10px] text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
                  <FiCheckCircle className="text-xs shrink-0" />
                  <span>
                    Pagado el{" "}
                    {formatDate(order.paymentDate, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const MyStoreCredit = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const [activeTab, setActiveTab] = useState("pending");

  const storeCreditOrders = user?.storeCreditOrders || [];

  const pendingOrders = useMemo(
    () => storeCreditOrders.filter((p) => p.status === "pending"),
    [storeCreditOrders],
  );
  const paidOrders = useMemo(
    () => storeCreditOrders.filter((p) => p.status === "paid"),
    [storeCreditOrders],
  );

  const usedBalance = Number(user?.usedBalance || user?.accumulatedBalance || 0);
  const unlimitedCredit = isUnlimitedCredit(user);
  const creditLimit = unlimitedCredit ? 0 : Number(user?.creditLimit || 0);
  const availableBalance = unlimitedCredit
    ? 0
    : Math.max(0, creditLimit - usedBalance);
  const pctUsado =
    !unlimitedCredit && creditLimit > 0
      ? Math.min(100, (usedBalance / creditLimit) * 100)
      : 0;

  const barColor =
    pctUsado >= 90 ? "#ef4444" : pctUsado >= 60 ? "#f59e0b" : "#00a884";

  const displayed = activeTab === "pending" ? pendingOrders : paidOrders;

  return (
    <div className="flex flex-col bg-[#f8f9fa] min-h-full pb-6">
      <div className="bg-gradient-to-br from-[#1a2332] to-[#0f1a28] px-5 pt-6 pb-8 relative overflow-hidden">
        <div className="absolute -top-6 -right-6 w-32 h-32 bg-white/5 rounded-full" />
        <div className="absolute -bottom-8 -left-4 w-24 h-24 bg-[#00a884]/10 rounded-full" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-9 h-9 bg-[#00a884]/20 rounded-xl flex items-center justify-center">
              <FiBookOpen className="text-[#00a884] text-base" />
            </div>
            <div>
              <h2 className="font-black text-white text-base leading-tight">
                Mi Crédito
              </h2>
              <p className="text-white/50 text-[10px]">
                {activeStore?.name || "Mi negocio"}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1.5 bg-[#00a884]/20 border border-[#00a884]/30 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 bg-[#00a884] rounded-full animate-pulse" />
              <span className="text-[#00a884] text-[10px] font-black">
                Activo
              </span>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl p-4 mb-3">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-1">
                  Saldo pendiente
                </p>
                <p className="text-3xl font-black text-white leading-none">
                  RD$ {fmt(usedBalance)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-1">
                  {unlimitedCredit ? "Tipo de crédito" : "Disponible"}
                </p>
                <p className="text-xl font-black text-[#00a884] leading-none">
                  {unlimitedCredit
                    ? "Ilimitado"
                    : `RD$ ${fmt(availableBalance)}`}
                </p>
              </div>
            </div>

            {unlimitedCredit ? (
              <div className="rounded-xl bg-white/10 border border-white/10 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-white/50 text-[9px] font-bold uppercase tracking-widest">
                    Crédito sin tope
                  </span>
                  <span className="text-[#00a884] text-[9px] font-black">
                    Acumula saldo
                  </span>
                </div>
                <p className="text-white/55 text-[10px] leading-relaxed mt-1">
                  En crédito ilimitado no se resta disponibilidad: cada pedido
                  fiado suma al saldo pendiente hasta que realices abonos.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-white/50 text-[9px]">Usado</span>
                  <span className="text-white/50 text-[9px]">
                    Límite: RD$ {fmt(creditLimit)}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pctUsado}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: barColor }}
                  />
                </div>
                <div className="flex justify-between">
                  <span
                    style={{ color: barColor }}
                    className="text-[9px] font-black"
                  >
                    {Math.round(pctUsado)}% usado
                  </span>
                  {pctUsado >= 90 && (
                    <span className="text-red-400 text-[9px] font-bold flex items-center gap-1">
                      <FiAlertTriangle className="text-xs" /> Límite casi
                      alcanzado
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              {
                label: "Pedidos fiado",
                value: storeCreditOrders.length,
                icon: FiBookOpen,
              },
              { label: "Pendientes", value: pendingOrders.length, icon: FiClock },
              { label: "Pagados", value: paidOrders.length, icon: FiCheckCircle },
            ].map((k) => (
              <div
                key={k.label}
                className="bg-white/10 border border-white/10 rounded-xl p-2.5 text-center"
              >
                <k.icon className="text-white/60 text-sm mx-auto mb-1" />
                <p className="text-white font-black text-base leading-none">
                  {k.value}
                </p>
                <p className="text-white/50 text-[9px] mt-0.5 leading-tight">
                  {k.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {usedBalance > 0 && (
        <div className="mx-4 mt-4">
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3.5 flex items-start gap-3">
            <FiInfo className="text-amber-500 text-base shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-black text-amber-700">
                Tienes deuda pendiente
              </p>
              <p className="text-[10px] text-amber-600 mt-0.5 leading-relaxed">
                Pasa por el negocio para saldar tu cuenta de{" "}
                <span className="font-black">RD$ {fmt(usedBalance)}</span> y
                seguir comprando a crédito.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mx-4 mt-4 bg-gray-100 rounded-2xl p-1 flex gap-1">
        {[
          {
            key: "pending",
            label: "Pendientes",
            count: pendingOrders.length,
            color: "text-amber-600",
          },
          {
            key: "paid",
            label: "Pagados",
            count: paidOrders.length,
            color: "text-emerald-600",
          },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all ${
              activeTab === tab.key
                ? "bg-white shadow-sm text-gray-800"
                : "text-gray-400"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key
                    ? tab.key === "pending"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-emerald-100 text-emerald-700"
                    : "bg-gray-200 text-gray-400"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="px-4 mt-4 space-y-3">
        <AnimatePresence mode="wait">
          {displayed.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center"
            >
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                {activeTab === "pending" ? (
                  <FiClock className="text-2xl text-gray-300" />
                ) : (
                  <FiCheckCircle className="text-2xl text-gray-300" />
                )}
              </div>
              <p className="text-sm font-black text-gray-500">
                {activeTab === "pending"
                  ? "¡Sin deudas pendientes!"
                  : "Aún no hay pagos"}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {activeTab === "pending"
                  ? "Tu crédito está al día"
                  : "Tus pedidos pagados aparecerán aquí"}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {displayed.map((p, i) => (
                <StoreCreditCard key={p.id} order={p} index={i} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mx-4 mt-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <FiShield className="text-[#00a884] text-sm" />
            <p className="text-xs font-black text-gray-800">Sobre tu crédito</p>
          </div>
          <div className="space-y-2">
            {[
              {
                label: "Tipo de crédito",
                value: unlimitedCredit ? "Ilimitado" : "Limitado",
              },
              {
                label: "Límite de crédito",
                value: unlimitedCredit
                  ? "Sin tope definido"
                  : `RD$ ${fmt(creditLimit)}`,
              },
              {
                label: unlimitedCredit ? "Saldo acumulado" : "Saldo usado",
                value: `RD$ ${fmt(usedBalance)}`,
              },
              ...(!unlimitedCredit
                ? [
                    {
                      label: "Saldo disponible",
                      value: `RD$ ${fmt(availableBalance)}`,
                    },
                  ]
                : []),
              { label: "Pedidos a crédito", value: storeCreditOrders.length },
            ].map((d) => (
              <div key={d.label} className="flex justify-between items-center">
                <span className="text-xs text-gray-500">{d.label}</span>
                <span className="text-xs font-black text-gray-800">
                  {d.value}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-[10px] text-gray-400 leading-relaxed">
              {unlimitedCredit
                ? "Tu crédito fue otorgado por el negocio sin tope definido. Cada pedido fiado suma al saldo pendiente y los abonos reducen la deuda."
                : "Tu crédito fue otorgado por el negocio. Para aumentar tu límite o saldar tu deuda, visítanos personalmente."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MyStoreCredit;
