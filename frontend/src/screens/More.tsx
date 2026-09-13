import React from 'react';
import { Link } from '@/lib/navigation';
import * as FiIcons from 'react-icons/fi';
import { useStore } from '../context/StoreContext';
import MotorcycleIcon from '../common/MotorcycleIcon';

const {
  FiPackage, FiBarChart2, FiSettings,
  FiChevronRight, FiUsers, FiBookOpen,
} = FiIcons;

const MenuItem = ({ icon: Icon, label, to, badge, color = 'text-gray-600', bg = 'bg-gray-100' }: any) => (
  <Link to={to}
    className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm active:scale-[0.98] transition-transform"
  >
    <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center shrink-0`}>
      <Icon className={`text-lg ${color}`} />
    </div>
    <span className="flex-1 font-semibold text-gray-800 text-sm">{label}</span>
    {badge !== undefined && (
      <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">{badge}</span>
    )}
    <FiChevronRight className="text-gray-300 text-sm shrink-0" />
  </Link>
);

const More = () => {
  const { storeCredits } = useStore();
  const pendingStoreCredits = storeCredits.filter(f => f.status === 'pending').length;

  return (
    <div className="p-4 space-y-3 pb-6 max-w-md mx-auto">
      <h2 className="text-lg font-black text-gray-800 mb-4">Más opciones</h2>
      <MenuItem icon={FiPackage}  label="Catálogo"    to="/admin/catalog" bg="bg-emerald-50" color="text-emerald-500" />
      <MenuItem icon={FiUsers}    label="Clientes"    to="/admin/customers"   bg="bg-blue-50"   color="text-blue-500" />
      <MenuItem icon={MotorcycleIcon} label="Entregas" to="/admin/deliveries" bg="bg-emerald-50" color="text-emerald-600" />
      <MenuItem icon={FiBarChart2} label="Reportes"  to="/admin/reports"   bg="bg-sky-50"    color="text-sky-500" badge={pendingStoreCredits || undefined} />
      <MenuItem icon={FiBookOpen} label="Contabilidad" to="/admin/accounting" bg="bg-violet-50" color="text-violet-600" />
      <MenuItem icon={FiSettings} label="Configuración" to="/admin/settings" bg="bg-gray-100" color="text-gray-500" />
    </div>
  );
};

export default More;