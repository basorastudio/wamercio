import React, { useState } from 'react';
import * as FiIcons from 'react-icons/fi';
import { Link, useNavigate } from '@/lib/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { formatTime } from '../lib/timezone';
import AddressModal from '../components/AddressModal';
import { formatDominicanId } from '../lib/nationalId';
import UserAvatar from '../common/UserAvatar';

const { FiEdit3, FiPhone, FiCreditCard, FiMapPin, FiUser, FiMonitor } = FiIcons;

const Profile = () => {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const openModal = (addr = null) => {
    setEditingAddress(addr);
    setModalOpen(true);
  };

  const handleSaveAddress = (addrData) => {
    let newAddresses = [...(user.addresses || [])];
    if (addrData.isPrincipal) {
      newAddresses = newAddresses.map(d => ({ ...d, isPrincipal: false }));
    }
    if (addrData.id) {
      const idx = newAddresses.findIndex(d => d.id === addrData.id);
      if (idx >= 0) newAddresses[idx] = addrData;
    } else {
      if (newAddresses.length === 0) addrData.isPrincipal = true;
      newAddresses.push({ ...addrData, id: Date.now() });
    }
    updateUser({ addresses: newAddresses });
  };

  const handleDeleteDir = (id) => {
    const newAddresses = (user.addresses || []).filter(d => d.id !== id);
    updateUser({ addresses: newAddresses });
  };

  const principalAddr = user?.addresses?.find(d => d.isPrincipal) || user?.addresses?.[0];

  const getDeviceInfo = () => {
    const ua = navigator.userAgent;
    let browser = 'Navegador';
    let os = 'Dispositivo';
    if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
    else if (ua.includes('Edg')) browser = 'Edge';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    else if (ua.includes('Linux')) os = 'Linux';
    return `${browser} en ${os}`;
  };

  const deviceInfo = getDeviceInfo();
  const lastActivity = formatTime(null, { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div className="flex flex-col bg-[#f8f9fa] min-h-full pb-6 lg:bg-[#f5f7f8] lg:px-5 lg:pb-10">

      <div className="bg-white px-4 py-3 border-b border-gray-100 flex justify-between items-center shadow-sm sticky top-0 z-10 lg:static lg:mx-auto lg:mt-5 lg:w-full lg:max-w-[1440px] lg:rounded-[1.75rem] lg:border lg:border-gray-200 lg:px-6 lg:py-5">
        <h1 className="text-lg font-black text-gray-800 lg:text-3xl">Mi Perfil</h1>
        <Link to="/profile/edit" className="text-[#00a884] bg-[#00a884]/10 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors hover:bg-[#00a884]/20">
          <FiEdit3 size={13} /> Editar
        </Link>
      </div>

      <div className="flex flex-col items-center pt-8 pb-6 bg-white border-b border-gray-100 lg:mx-auto lg:mt-5 lg:w-full lg:max-w-[1440px] lg:rounded-[1.75rem] lg:border lg:border-gray-200 lg:py-10 lg:shadow-sm">
        <UserAvatar user={user} name={`${user?.name || user?.name || ''} ${user?.last_name || ''}`} className="w-20 h-20 bg-gradient-to-br from-[#f1c40f] to-[#f39c12] rounded-full flex items-center justify-center border-4 border-white shadow-md text-white lg:w-28 lg:h-28" icon={FiUser} iconClassName="text-white text-3xl" textClassName="text-2xl font-black text-white" />
        <h2 className="text-lg font-black text-gray-800 mt-3 lg:text-2xl">
          {user?.name || user?.name || 'Usuario'}{user?.last_name ? ` ${user.last_name}` : ''}
        </h2>
        <p className="text-xs text-gray-500 font-medium">{user?.whatsappDisplay || user?.whatsapp_display || user?.whatsapp || ''}</p>
      </div>

      <div className="px-4 mt-4 space-y-3 lg:mx-auto lg:w-full lg:max-w-[1440px] lg:px-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0">
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4 shadow-sm lg:rounded-2xl lg:border-gray-200 lg:p-5">
          <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center text-gray-500 shrink-0"><FiPhone /></div>
          <div>
            <p className="text-[10px] font-bold text-gray-400">WHATSAPP</p>
            <p className="text-sm font-bold text-gray-800">{user?.whatsappDisplay || user?.whatsapp_display || user?.whatsapp || 'No registrado'}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4 shadow-sm lg:rounded-2xl lg:border-gray-200 lg:p-5">
          <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center text-gray-500 shrink-0"><FiCreditCard /></div>
          <div>
            <p className="text-[10px] font-bold text-gray-400">CÉDULA</p>
            <p className="text-sm font-bold text-gray-800">{user?.national_id ? formatDominicanId(user.national_id) : 'No registrada'}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4 shadow-sm lg:rounded-2xl lg:border-gray-200 lg:p-5">
          <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center text-orange-500 shrink-0"><FiMapPin /></div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-gray-400 uppercase">Dirección de entrega</p>
            <p className="text-sm font-bold text-gray-800 truncate">
              {principalAddr
                ? `${principalAddr.municipality}, ${principalAddr.neighborhood}, ${principalAddr.street} ${principalAddr.street_number}`
                : 'Sin definir'}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 mt-6 lg:mx-auto lg:w-full lg:max-w-[1440px] lg:px-0">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h3 className="text-sm font-bold text-gray-800">Direcciones guardadas</h3>
            <p className="text-[10px] text-gray-400">Selecciona tu dirección principal.</p>
          </div>
          <button onClick={() => openModal()} className="bg-[#00a884] text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-sm hover:bg-[#009676] transition-colors">
            Nueva
          </button>
        </div>

        <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
          {(user?.addresses || []).map(dir => (
            <div key={dir.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm relative lg:rounded-2xl lg:border-gray-200 lg:p-5">
              <div className="flex justify-between items-start mb-2">
                <div className="pr-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h4 className="text-sm font-bold text-gray-800">{dir.name}</h4>
                    {dir.isPrincipal && <span className="bg-gray-100 text-gray-600 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">Principal</span>}
                  </div>
                  <p className="text-xs text-gray-600 leading-tight">{[dir.street && `${dir.street}${dir.street_number ? ` #${dir.street_number}` : ''}`, dir.neighborhood || dir.sector, dir.municipality, dir.province].filter(Boolean).join(', ')}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openModal(dir)} className="px-2 py-1 bg-white text-gray-600 text-[10px] font-bold border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">Editar</button>
                  <button onClick={() => handleDeleteDir(dir.id)} className="px-2 py-1 bg-white text-red-500 text-[10px] font-bold border border-red-100 rounded-md hover:bg-red-50 transition-colors">Eliminar</button>
                </div>
              </div>
              <button className="text-[10px] font-bold text-[#00a884] border border-[#00a884]/30 rounded-full px-3 py-1 mt-2 hover:bg-[#00a884]/5 transition-colors">
                Usar en mi funda
              </button>
            </div>
          ))}
          {(!user?.addresses || user.addresses.length === 0) && (
            <div className="bg-white border border-gray-100 border-dashed rounded-xl p-6 text-center shadow-sm">
              <p className="text-xs text-gray-400">No tienes direcciones guardadas.</p>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 mt-6 mb-6 lg:mx-auto lg:w-full lg:max-w-[1440px] lg:px-0">
        <h3 className="text-sm font-bold text-gray-800 mb-3">Seguridad de inicio de sesión</h3>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50 lg:rounded-2xl lg:border-gray-200">
          <div className="p-4 flex justify-between items-center">
            <div className="flex-1 pr-4">
              <p className="text-xs font-bold text-gray-800">Alertas de nuevos accesos</p>
              <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
                Te avisamos por WhatsApp cuando tu cuenta se abre desde un dispositivo distinto.
              </p>
            </div>
            <div className="w-10 h-6 bg-[#00a884] rounded-full relative shrink-0">
              <div className="w-4 h-4 bg-white rounded-full absolute right-1 top-1 shadow-sm" />
            </div>
          </div>
          <div className="p-4">
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs font-bold text-gray-800">Dispositivo actual</p>
            </div>
            <p className="text-[10px] text-gray-400 mb-3 leading-tight">
              Sesión activa en este dispositivo.
            </p>
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex items-center gap-3">
              <FiMonitor className="text-gray-400 text-base shrink-0" />
              <div>
                <p className="text-xs font-bold text-gray-800 flex items-center gap-2">
                  {deviceInfo}
                  <span className="bg-[#00a884]/10 text-[#00a884] text-[8px] px-1.5 py-0.5 rounded uppercase font-black">Actual</span>
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">Última actividad: Hoy, {lastActivity}</p>
              </div>
            </div>
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleLogout}
          className="w-full mt-4 py-3.5 bg-red-50 text-red-500 font-bold text-sm rounded-xl border border-red-100 hover:bg-red-100 transition-colors lg:rounded-2xl"
        >
          Cerrar sesión
        </motion.button>
      </div>

      <AddressModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveAddress}
        editingAddress={editingAddress}
      />
    </div>
  );
};

export default Profile;