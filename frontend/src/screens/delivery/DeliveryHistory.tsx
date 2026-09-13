import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../../context/StoreContext';
import { appDateKey, formatDateTime } from '../../lib/timezone';
import { deliveryAddress, isDeliveryOrder } from '../../lib/delivery';
import * as FiIcons from 'react-icons/fi';

const { FiCheckCircle, FiAlertCircle, FiTrendingUp, FiCalendar, FiMapPin, FiShield, FiUserCheck } = FiIcons;
const fmt = (value: unknown) => Number(value || 0).toLocaleString('es-DO');
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export default function DeliveryHistory() {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const { sales = [] } = useStore();
  const orders = useMemo(() => sales.filter((sale) => (sale.orderType || sale.order_type) === 'customer' && isDeliveryOrder(sale)), [sales]);
  const delivered = orders.filter((order) => order.status === 'delivered');
  const issues = orders.filter((order) => order.status === 'issue');
  const now = new Date();
  const days = period === 'week' ? 7 : 30;
  const chartData = Array.from({ length: days }, (_, index) => {
    const date = new Date(startOfDay(now));
    date.setDate(date.getDate() - (days - 1 - index));
    const key = appDateKey(date.toISOString());
    return { key, label: period === 'week' ? ['D', 'L', 'M', 'X', 'J', 'V', 'S'][date.getDay()] : String(date.getDate()), count: delivered.filter((order) => appDateKey(order.deliveredAt || order.delivered_at || order.date) === key).length };
  });
  const maxCount = Math.max(1, ...chartData.map((item) => item.count));
  const periodDelivered = chartData.reduce((sum, item) => sum + item.count, 0);
  const deliveredTotal = delivered.reduce((sum, order) => sum + Number(order.total || 0), 0);

  return (
    <div className="w-full max-w-md lg:max-w-7xl mx-auto p-4 lg:p-8 xl:p-10 space-y-5 lg:space-y-6 pb-24 lg:pb-10">
      <div><p className="hidden lg:block text-xs font-black uppercase tracking-[0.22em] text-[#00a884]">Rendimiento</p><h2 className="font-black text-gray-800 text-lg lg:text-3xl mt-1">Historial</h2><p className="hidden lg:block text-sm text-gray-500 mt-1">Registro real de entregas, prueba utilizada y repartidor responsable.</p></div>
      <div className="grid grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-5">
        {[{ label: 'Entregados', value: delivered.length, icon: FiCheckCircle, style: 'bg-[#eafaf1] text-[#00a884]' }, { label: 'Problemas', value: issues.length, icon: FiAlertCircle, style: 'bg-red-50 text-red-500' }, { label: period === 'week' ? 'Esta semana' : 'Este período', value: periodDelivered, icon: FiTrendingUp, style: 'bg-blue-50 text-blue-500' }, { label: 'Monto entregado', value: `RD$ ${fmt(deliveredTotal)}`, icon: FiCheckCircle, style: 'bg-violet-50 text-violet-600', desktop: true }].map((item) => <div key={item.label} className={`bg-white rounded-2xl lg:rounded-3xl p-3 lg:p-5 border border-gray-100 shadow-sm text-center ${item.desktop ? 'hidden lg:block' : ''}`}><div className={`w-9 h-9 lg:w-11 lg:h-11 rounded-xl flex items-center justify-center mx-auto mb-2 ${item.style}`}><item.icon/></div><p className="font-black text-gray-900 text-lg lg:text-2xl">{item.value}</p><p className="text-[10px] lg:text-xs text-gray-400">{item.label}</p></div>)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
        <section className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 lg:p-6 lg:col-span-7 xl:col-span-8">
          <div className="flex items-center justify-between mb-6"><h3 className="font-black text-gray-900">Entregas por día</h3><div className="flex bg-gray-100 rounded-xl p-1"><button onClick={() => setPeriod('week')} className={`px-3 py-1.5 rounded-lg text-xs font-black ${period === 'week' ? 'bg-white shadow-sm' : 'text-gray-400'}`}>Semana</button><button onClick={() => setPeriod('month')} className={`px-3 py-1.5 rounded-lg text-xs font-black ${period === 'month' ? 'bg-white shadow-sm' : 'text-gray-400'}`}>Mes</button></div></div>
          <div className={`flex items-end gap-1.5 lg:gap-2 h-44 lg:h-60 ${period === 'month' ? 'overflow-x-auto pb-2' : ''}`}>{chartData.map((item) => <div key={item.key} className={`flex flex-col items-center justify-end gap-1 h-full ${period === 'month' ? 'min-w-[18px]' : 'flex-1'}`}><span className="text-[9px] font-black text-gray-400">{item.count || ''}</span><div className="w-full rounded-t-lg bg-[#00a884]/35 min-h-1" style={{ height: `${Math.max(4, (item.count / maxCount) * 170)}px` }}/><span className="text-[8px] lg:text-[10px] font-bold text-gray-400">{item.label}</span></div>)}</div>
          {!periodDelivered && <p className="text-center text-xs text-gray-400 mt-4">Sin entregas completadas en este período.</p>}
        </section>

        <section className="lg:col-span-5 xl:col-span-4">
          {!delivered.length ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-3xl border border-gray-100 shadow-sm py-16 text-center"><FiCalendar className="text-4xl text-gray-300 mx-auto"/><p className="font-bold text-gray-600 mt-3">Sin historial de entregas</p></motion.div> : <div className="space-y-3"><h3 className="font-black text-gray-900">Últimas entregas</h3>{delivered.map((order) => <article key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><div className="flex justify-between gap-2"><div className="min-w-0"><p className="font-black text-gray-900 truncate">{order.customer || 'Cliente'}</p><p className="text-[10px] text-gray-400">{formatDateTime(order.deliveredAt || order.delivered_at || order.date, { dateStyle: 'short', timeStyle: 'short' })}</p></div><p className="font-black text-[#00a884] text-sm">RD$ {fmt(order.total)}</p></div><p className="text-[11px] text-gray-500 mt-2 flex gap-1"><FiMapPin className="mt-0.5 shrink-0"/>{deliveryAddress(order)}</p><div className="flex flex-wrap gap-2 mt-3"><span className="text-[10px] font-black px-2 py-1 rounded-full bg-[#eafaf1] text-[#00a884] flex items-center gap-1"><FiShield/>{order.deliveryPinVerified || order.delivery_pin_verified ? 'PIN verificado' : 'Prueba manual'}</span>{order.deliveredByName || order.delivered_by_name ? <span className="text-[10px] font-black px-2 py-1 rounded-full bg-gray-100 text-gray-600 flex items-center gap-1"><FiUserCheck/>{order.deliveredByName || order.delivered_by_name}</span> : null}</div>{order.recipientName || order.recipient_name ? <p className="text-[11px] text-gray-500 mt-2">Recibió: <strong>{order.recipientName || order.recipient_name}</strong></p> : null}</article>)}</div>}
        </section>
      </div>
    </div>
  );
}
