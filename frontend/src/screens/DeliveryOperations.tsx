'use client';

import React from 'react';
import * as FiIcons from 'react-icons/fi';
import { Link, useLocation } from '@/lib/navigation';
import MotorcycleIcon from '../common/MotorcycleIcon';
import AdminDeliveries from './AdminDeliveries';
import DeliveryZones from './DeliveryZones';

const { FiMap } = FiIcons;

const tabs = [
  {
    key: 'live',
    label: 'Operación en vivo',
    to: '/admin/deliveries',
    icon: MotorcycleIcon,
  },
  {
    key: 'zones',
    label: 'Zonas de entrega',
    to: '/admin/deliveries/zones',
    icon: FiMap,
  },
];

export default function DeliveryOperations() {
  const { pathname } = useLocation();
  const activeTab = pathname === '/admin/deliveries/zones' ? 'zones' : 'live';

  return (
    <div className="p-4 lg:p-8 xl:p-10 min-h-full space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#00a884]">Centro de operaciones</p>
          <h1 className="text-2xl lg:text-3xl font-black text-gray-900 mt-1">Entregas</h1>
          <p className="text-sm text-gray-500 mt-1">
            Supervisa la operación en vivo y administra la cobertura del negocio desde un solo lugar.
          </p>
        </div>

        <nav
          aria-label="Secciones de entregas"
          className="grid w-full grid-cols-2 gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm lg:w-auto lg:min-w-[340px]"
        >
          {tabs.map((tab) => {
            const active = tab.key === activeTab;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.key}
                to={tab.to}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-center text-[10px] font-black transition-all sm:text-[11px] ${
                  active
                    ? 'bg-[#00a884] text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {activeTab === 'zones' ? <DeliveryZones embedded /> : <AdminDeliveries embedded />}
    </div>
  );
}
