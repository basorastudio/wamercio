import React from 'react';
import { Link, useLocation } from '@/lib/navigation';
import * as FiIcons from 'react-icons/fi';
import CashRegister from './CashRegister';
import Orders from './Orders';

const { FiShoppingCart, FiClipboard, FiPhoneCall } = FiIcons;

type PointOfSaleProps = {
  /**
   * Base route where the point-of-sale module is mounted.
   *
   * Administrators use /admin/point-of-sale and cashiers use /cashier.
   * Both panels share the same component, logic, filters, cart and order view
   * without duplicating screens or breaking URLs.
   */
  basePath?: string;
};

const buildTabs = (basePath: string) => [
  {
    key: 'local',
    label: 'LOCAL',
    detail: 'Ventas dentro del negocio',
    to: basePath,
    icon: FiShoppingCart,
  },
  {
    key: 'assisted',
    label: 'ASISTIDO',
    detail: 'WhatsApp o llamada',
    to: `${basePath}/assisted`,
    icon: FiPhoneCall,
  },
  {
    key: 'online',
    label: 'EN LÍNEA',
    detail: 'Pedidos de la tienda',
    to: `${basePath}/online`,
    icon: FiClipboard,
  },
];

const PointOfSale = ({ basePath = '/admin/point-of-sale' }: PointOfSaleProps) => {
  const location = useLocation();
  const normalizedBasePath = basePath.replace(/\/$/, '') || '/admin/point-of-sale';
  const activeTab = location.pathname === `${normalizedBasePath}/online`
    ? 'online'
    : location.pathname === `${normalizedBasePath}/assisted`
      ? 'assisted'
      : 'local';
  const tabs = buildTabs(normalizedBasePath);

  return (
    <div className="flex flex-col min-h-full bg-[#f8f9fa] overflow-visible lg:h-full lg:min-h-0 lg:overflow-hidden">
      <div className="bg-white px-4 py-4 border-b border-gray-100">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-black text-gray-800">Punto de Venta</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Gestiona ventas locales, pedidos asistidos y pedidos en línea desde una misma sección.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-2xl w-full lg:w-[540px]">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;

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

      <div className="min-h-0 overflow-visible lg:flex-1 lg:overflow-hidden">
        {activeTab === 'online' ? (
          <Orders embedded />
        ) : (
          <CashRegister mode={activeTab === 'assisted' ? 'assisted' : 'local'} />
        )}
      </div>
    </div>
  );
};

export default PointOfSale;
