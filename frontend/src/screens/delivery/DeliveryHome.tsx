import React, { useMemo } from 'react';
import { Link } from '@/lib/navigation';
import { motion } from 'framer-motion';
import { useStore } from '../../context/StoreContext';
import { useStaffAuth } from '../../context/StaffAuthContext';
import { appDateKey } from '../../lib/timezone';
import {
  deliveryAcceptanceRequired,
  deliveryAddress,
  deliveryStatusLabel,
  isAutomaticallyAssignedDelivery,
  isDeliveryAccepted,
  isDeliveryOrder,
} from '../../lib/delivery';
import * as FiIcons from 'react-icons/fi';
import MotorcycleIcon from '../../common/MotorcycleIcon';

const { FiClock, FiNavigation, FiCheckCircle, FiAlertCircle, FiPackage, FiMap, FiMapPin, FiChevronRight, FiUserCheck } = FiIcons;
const fmt = (value: unknown) => Number(value || 0).toLocaleString('es-DO');

export default function DeliveryHome() {
  const { sales = [] } = useStore();
  const { staffUser } = useStaffAuth();
  const name = staffUser?.name || 'Repartidor';
  const orders = useMemo(() => sales.filter((sale) => (sale.orderType || sale.order_type) === 'customer' && isDeliveryOrder(sale)), [sales]);
  const awaiting = orders.filter((order) => order.status === 'ready_for_delivery' && deliveryAcceptanceRequired(order));
  const ready = orders.filter((order) => order.status === 'ready_for_delivery' && !deliveryAcceptanceRequired(order));
  const onRoute = orders.filter((order) => order.status === 'on_the_way');
  const todayKey = appDateKey(new Date().toISOString());
  const delivered = orders.filter((order) => order.status === 'delivered'
    && appDateKey(order.deliveredAt || order.delivered_at || order.date) === todayKey);
  const issues = orders.filter((order) => order.status === 'issue');
  const activeOrders = [...awaiting, ...ready, ...onRoute];
  const upcoming = [...onRoute, ...ready, ...awaiting].slice(0, 5);

  return (
    <div className="w-full max-w-md lg:max-w-7xl mx-auto p-4 lg:p-8 xl:p-10 pb-24 lg:pb-10 space-y-5 lg:space-y-7">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
        <div className="lg:col-span-7 xl:col-span-8 space-y-4 lg:space-y-6">
          <motion.section initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="bg-[#1a2332] rounded-3xl p-5 lg:p-7 text-white shadow-lg">
            <p className="text-[11px] text-white/60 font-bold">Bienvenido 👋</p>
            <h1 className="text-xl lg:text-3xl font-black mt-1">Panel de repartidor</h1>
            <p className="text-xs lg:text-sm text-white/60 mt-1">{name}, administra únicamente los pedidos asignados a ti.</p>
            <div className="grid grid-cols-3 gap-2 mt-5">
              {(awaiting.length > 0
                ? [{ label: 'Por aceptar', value: awaiting.length }, { label: 'Listos', value: ready.length }, { label: 'En ruta', value: onRoute.length }]
                : [{ label: 'Listos', value: ready.length }, { label: 'En ruta', value: onRoute.length }, { label: 'Entregados hoy', value: delivered.length }]
              ).map((item) => <div key={item.label} className="bg-white/10 rounded-2xl p-3 text-center"><p className="text-2xl font-black">{item.value}</p><p className="text-[10px] text-white/60 mt-1">{item.label}</p></div>)}
            </div>
          </motion.section>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            {(awaiting.length > 0
              ? [{ label: 'Por aceptar', value: awaiting.length, icon: FiClock, style: 'bg-amber-50 text-amber-600' }, { label: 'En ruta', value: onRoute.length, icon: FiNavigation, style: 'bg-blue-50 text-blue-600' }, { label: 'Entregados hoy', value: delivered.length, icon: FiCheckCircle, style: 'bg-[#eafaf1] text-[#00a884]' }, { label: 'Problemas', value: issues.length, icon: FiAlertCircle, style: 'bg-red-50 text-red-600' }]
              : [{ label: 'Listos', value: ready.length, icon: FiPackage, style: 'bg-violet-50 text-violet-600' }, { label: 'En ruta', value: onRoute.length, icon: FiNavigation, style: 'bg-blue-50 text-blue-600' }, { label: 'Entregados hoy', value: delivered.length, icon: FiCheckCircle, style: 'bg-[#eafaf1] text-[#00a884]' }, { label: 'Problemas', value: issues.length, icon: FiAlertCircle, style: 'bg-red-50 text-red-600' }]
            ).map((item) => <div key={item.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3"><div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.style}`}><item.icon/></div><div><p className="font-black text-xl text-gray-900">{item.value}</p><p className="text-[10px] text-gray-400">{item.label}</p></div></div>)}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:gap-4">
            <Link to="/delivery/orders" className="bg-[#00a884] rounded-2xl lg:rounded-3xl p-4 lg:p-6 flex flex-col items-center gap-2 shadow-md shadow-[#00a884]/20"><FiPackage className="text-white text-2xl lg:text-3xl"/><span className="text-white font-bold text-sm lg:text-base">Gestionar pedidos</span></Link>
            <Link to="/delivery/route" className="bg-[#1a2332] rounded-2xl lg:rounded-3xl p-4 lg:p-6 flex flex-col items-center gap-2 shadow-md"><FiMap className="text-[#00a884] text-2xl lg:text-3xl"/><span className="text-white font-bold text-sm lg:text-base">Ver mi ruta</span></Link>
          </div>

          <div className="hidden lg:grid grid-cols-3 gap-4">
            <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm"><p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Monto asignado</p><p className="mt-2 text-2xl font-black text-gray-900">RD$ {fmt(activeOrders.reduce((sum, order) => sum + Number(order.total || 0), 0))}</p></div>
            <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm"><p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Listos para salir</p><p className="mt-2 text-2xl font-black text-[#00a884]">{ready.length + onRoute.length}</p></div>
            <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm"><p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Completados</p><p className="mt-2 text-2xl font-black text-gray-900">{delivered.length}</p></div>
          </div>
        </div>

        <aside className="lg:col-span-5 xl:col-span-4">
          <div className="flex items-center justify-between mb-3"><h2 className="font-black text-gray-800">Próximas entregas</h2><Link to="/delivery/orders" className="text-[#00a884] text-xs font-bold flex items-center gap-1">Ver todas <FiChevronRight/></Link></div>
          {!upcoming.length ? <div className="bg-white rounded-3xl border border-gray-100 shadow-sm py-14 text-center"><MotorcycleIcon className="w-10 h-10 text-gray-300 mx-auto"/><p className="font-bold text-gray-600 mt-3">Sin entregas asignadas</p><p className="text-xs text-gray-400 mt-1">Los pedidos aparecerán aquí después de ser asignados.</p></div> : <div className="space-y-3">{upcoming.map((order) => <Link key={order.id} to="/delivery/orders" className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><div className="flex justify-between gap-3"><div className="min-w-0"><p className="font-black text-gray-900 truncate">{order.customer || 'Cliente'}</p><p className="text-[11px] text-gray-400 line-clamp-2 flex gap-1 mt-1"><FiMapPin className="mt-0.5 shrink-0"/>{deliveryAddress(order)}</p></div><p className="font-black text-[#00a884] text-sm shrink-0">RD$ {fmt(order.total)}</p></div><div className="flex items-center gap-2 mt-3"><span className="text-[10px] font-black rounded-full bg-gray-100 text-gray-600 px-2 py-1">{deliveryStatusLabel(order.status)}</span>{isDeliveryAccepted(order) && <span className="text-[10px] font-black text-[#00a884] flex items-center gap-1"><FiUserCheck/> {isAutomaticallyAssignedDelivery(order) ? 'Asignado' : 'Aceptado'}</span>}</div></Link>)}</div>}
        </aside>
      </div>
    </div>
  );
}
