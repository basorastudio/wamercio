import React, { useEffect, useState } from 'react';
import * as FiIcons from 'react-icons/fi';
import PhoneInput from '../components/PhoneInput';
import UserAvatar from '../common/UserAvatar';
import { api } from '../lib/api';
import { useStaffAuth } from '../context/StaffAuthContext';
import { nationalIdDigits, formatDominicanId, isValidDominicanId } from '../lib/nationalId';
import { sanitizePin } from '../lib/pin';
import { isAcceptedAccessPinLength, useAccessPolicy } from '../lib/accessPolicy';

const { FiUser, FiSave, FiLock, FiAlertCircle } = FiIcons;

const emptyProfile = {
  name: '',
  last_name: '',
  national_id: '',
  whatsapp: '',
  whatsappDisplay: '',
  profilePictureUrl: '',
  profile_picture_url: '',
  countryCode: 'do',
  dialCode: '+1',
  isValid: false,
};

const profileFromUser = (user) => ({
  name: user?.name || user?.name || '',
  last_name: user?.last_name || user?.lastName || user?.last_name || '',
  national_id: formatDominicanId(user?.national_id || ''),
  whatsapp: user?.whatsapp || '',
  whatsappDisplay: user?.whatsapp_display || user?.whatsappDisplay || user?.whatsapp || '',
  profilePictureUrl: user?.profile_picture_url || user?.profilePictureUrl || user?.avatar_url || user?.avatarUrl || '',
  profile_picture_url: user?.profile_picture_url || user?.profilePictureUrl || user?.avatar_url || user?.avatarUrl || '',
  countryCode: user?.country_code || user?.countryCode || 'do',
  dialCode: user?.dial_code || user?.dialCode || '+1',
  isValid: Boolean(user?.whatsapp),
});

const StaffProfile = () => {
  const accessPolicy = useAccessPolicy();
  const { staffUser, staffRole, refreshSession } = useStaffAuth();
  const [formData, setFormData] = useState(emptyProfile);
  const [pinData, setPinData] = useState({ actual: '', nuevo: '', confirmar: '' });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [savedProfile, setSavedProfile] = useState(false);
  const [savedPin, setSavedPin] = useState(false);
  const [error, setError] = useState('');
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    let alive = true;

    if (staffUser) {
      setFormData(profileFromUser(staffUser));
    }

    setLoadingProfile(true);
    api.get('/staff/profile')
      .then((response) => {
        if (!alive) return;
        const profile = response?.user || response;
        setFormData(profileFromUser(profile));
        setError('');
      })
      .catch((err) => {
        if (!alive) return;
        if (!staffUser) {
          setError(err.message || 'No se pudieron cargar tus datos del perfil.');
        }
      })
      .finally(() => {
        if (alive) setLoadingProfile(false);
      });

    return () => { alive = false; };
  }, [staffUser?.id]);

  const roleLabel = staffRole === 'administrator' ? 'Administrador' : staffRole === 'delivery_driver' ? 'Repartidor' : 'Cajero';
  const handleFormChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const handleNationalIdChange = (e) => {
    setFormData(prev => ({ ...prev, national_id: formatDominicanId(e.target.value) }));
    setError('');
  };
  const handleWhatsAppChange = (phone) => setFormData(prev => ({
    ...prev,
    whatsapp: phone.whatsapp,
    whatsappDisplay: phone.whatsappDisplay,
    countryCode: phone.countryCode,
    dialCode: phone.dialCode,
    isValid: phone.isValid,
  }));
  const handlePinChange = (e) => {
    const maxLength = e.target.name === 'actual' ? accessPolicy.maxAdminPinLength : accessPolicy.adminPinLength;
    setPinData(prev => ({ ...prev, [e.target.name]: sanitizePin(e.target.value, maxLength) }));
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setError('');
    if (!isValidDominicanId(formData.national_id)) {
      setError('Ingresa una cédula dominicana válida.');
      setSavingProfile(false);
      return;
    }
    try {
      const response = await api.patch('/staff/profile', {
        name: formData.name,
        last_name: formData.last_name,
        national_id: formatDominicanId(formData.national_id),
        whatsapp: formData.whatsapp,
        whatsapp_display: formData.whatsappDisplay,
        country_code: formData.countryCode,
        dial_code: formData.dialCode,
      });
      const updated = response?.user || response;
      if (updated) setFormData(profileFromUser(updated));
      await refreshSession?.();
      setSavedProfile(true);
      setTimeout(() => setSavedProfile(false), 2500);
    } catch (err) {
      setError(err.message || 'No se pudo guardar el perfil.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePin = async () => {
    setPinError('');
    const currentPinLengthValid = isAcceptedAccessPinLength(pinData.actual.length, accessPolicy);
    if (!currentPinLengthValid || pinData.nuevo.length !== accessPolicy.adminPinLength || pinData.confirmar.length !== accessPolicy.adminPinLength) {
      setPinError(`El nuevo PIN debe tener ${accessPolicy.adminPinLength} dígitos.`);
      return;
    }
    if (pinData.nuevo !== pinData.confirmar) {
      setPinError('Los PIN no coinciden.');
      return;
    }
    setSavingPin(true);
    try {
      await api.post('/staff/pin', {
        current_pin: pinData.actual,
        new_pin: pinData.nuevo,
        confirm_pin: pinData.confirmar,
      });
      setSavedPin(true);
      setPinData({ actual: '', nuevo: '', confirmar: '' });
      setTimeout(() => setSavedPin(false), 2500);
    } catch (err) {
      setPinError(err.message || 'No se pudo actualizar el PIN.');
    } finally {
      setSavingPin(false);
    }
  };

  const inputCls = "w-full px-4 py-2.5 text-sm font-medium text-gray-800 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 focus:border-[#00a884] transition-all";
  const nationalIdValueDigits = nationalIdDigits(formData.national_id);
  const nationalIdValid = Boolean(formData.national_id) && isValidDominicanId(formData.national_id);
  const nationalIdInvalid = nationalIdValueDigits.length === 11 && !nationalIdValid;
  const nationalIdClassName = `${inputCls} ${nationalIdValid ? 'border-[#00a884] bg-[#f0fdf8]' : nationalIdInvalid ? 'border-red-300 bg-red-50' : ''}`;

  return (
    <div className="p-4 md:p-8 xl:p-10 w-full">
      <div className="mb-6 flex items-center gap-3">
        <UserAvatar user={formData} name={`${formData.name || ''} ${formData.last_name || ''}`} className="w-12 h-12 bg-[#00a884]/10 rounded-2xl flex items-center justify-center border border-[#00a884]/20 text-[#00a884]" icon={FiUser} iconClassName="text-[#00a884] text-xl" textClassName="text-sm font-black" />
        <div>
          <h1 className="text-2xl font-black text-gray-900">Mi Perfil</h1>
          <p className="text-sm text-gray-400 mt-0.5">Gestiona tus datos personales y PIN de acceso</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          <FiAlertCircle className="shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-2">
            <FiUser className="text-gray-400 text-sm" />
            <h2 className="text-sm font-bold text-gray-900">Datos personales</h2>
            <span className="ml-auto rounded-full bg-[#00a884]/10 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#00a884]">{roleLabel}</span>
          </div>
          <div className="p-6 space-y-5">
            {loadingProfile ? (
              <div className="py-10 text-center text-sm font-bold text-gray-400">Cargando perfil...</div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Nombre</label>
                    <input type="text" name="name" value={formData.name}
                      onChange={handleFormChange} placeholder="Tu nombre" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Apellido</label>
                    <input type="text" name="last_name" value={formData.last_name}
                      onChange={handleFormChange} placeholder="Tu apellido" className={inputCls} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Cédula</label>
                    <input
                      type="text"
                      name="national_id"
                      value={formData.national_id}
                      onChange={handleNationalIdChange}
                      inputMode="numeric"
                      maxLength={13}
                      placeholder="000-0000000-0"
                      className={nationalIdClassName}
                    />
                    {nationalIdInvalid && <p className="mt-1.5 text-[11px] font-bold text-red-500">Cédula dominicana no válida</p>}
                    {nationalIdValid && <p className="mt-1.5 text-[11px] font-bold text-[#00a884]">✓ Cédula válida</p>}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">WhatsApp</label>
                  <PhoneInput
                    value={formData.whatsapp}
                    onChange={handleWhatsAppChange}
                    valid={formData.isValid}
                    placeholder="Número de WhatsApp"
                    initialCountry={formData.countryCode || 'do'}
                  />
                  <p className="text-[11px] text-gray-400 mt-1.5">Número de WhatsApp usado para iniciar sesión y recibir avisos.</p>
                </div>
                <div className="pt-2 flex items-center gap-3">
                  <button onClick={handleSaveProfile} disabled={savingProfile}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[#00a884] disabled:opacity-60 text-white rounded-xl font-bold text-sm hover:bg-[#009676] transition-colors shadow-sm"
                  >
                    <FiSave className="text-sm" /> {savingProfile ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                  {savedProfile && <span className="text-xs text-[#00a884] font-bold animate-pulse">✓ Guardado correctamente</span>}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-2">
            <FiLock className="text-gray-400 text-sm" />
            <h2 className="text-sm font-bold text-gray-900">Cambiar PIN de acceso</h2>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">PIN actual</label>
              <input type="password" name="actual" value={pinData.actual}
                onChange={handlePinChange} placeholder={"•".repeat(accessPolicy.maxAdminPinLength)} maxLength={accessPolicy.maxAdminPinLength} inputMode="numeric" className={inputCls} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Nuevo PIN</label>
                <input type="password" name="nuevo" value={pinData.nuevo}
                  onChange={handlePinChange} placeholder={"•".repeat(accessPolicy.adminPinLength)} maxLength={accessPolicy.adminPinLength} inputMode="numeric" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Confirmar PIN</label>
                <input type="password" name="confirmar" value={pinData.confirmar}
                  onChange={handlePinChange} placeholder={"•".repeat(accessPolicy.adminPinLength)} maxLength={accessPolicy.adminPinLength} inputMode="numeric" className={inputCls} />
              </div>
            </div>
            {pinError && <p className="text-xs text-red-500 font-medium">{pinError}</p>}
            <div className="pt-2 flex items-center gap-3">
              <button onClick={handleSavePin} disabled={savingPin}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#1a2332] disabled:opacity-60 text-white rounded-xl font-bold text-sm hover:bg-[#111827] transition-colors shadow-sm"
              >
                <FiLock className="text-sm" /> {savingPin ? 'Actualizando...' : 'Actualizar PIN'}
              </button>
              {savedPin && <span className="text-xs text-[#00a884] font-bold animate-pulse">✓ PIN actualizado</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffProfile;
