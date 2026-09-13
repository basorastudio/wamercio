import React, { useEffect, useState } from 'react';
import * as FiIcons from 'react-icons/fi';
import PhoneInput from '../components/PhoneInput';
import UserAvatar from '../common/UserAvatar';
import { api } from '../lib/api';
import { nationalIdDigits, formatDominicanId, isValidDominicanId } from '../lib/nationalId';
import { sanitizePin } from '../lib/pin';
import { isAcceptedAccessPinLength, useAccessPolicy } from '../lib/accessPolicy';

const { FiUser, FiSave, FiLock, FiAlertCircle } = FiIcons;

const emptyProfile = {
  username: '',
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

const AdminProfile = () => {
  const accessPolicy = useAccessPolicy();
  const [formData, setFormData] = useState(emptyProfile);
  const [passData, setPassData] = useState({ actual: '', nueva: '', confirmar: '' });
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPass, setSavingPass] = useState(false);
  const [savedProfile, setSavedProfile] = useState(false);
  const [savedPass, setSavedPass] = useState(false);
  const [error, setError] = useState('');
  const [passError, setPassError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get('/admin/profile')
      .then((profile) => {
        if (!alive) return;
        setFormData({
          username: profile.username || '',
          name: profile.name || '',
          last_name: profile.last_name || '',
          national_id: formatDominicanId(profile.national_id || ''),
          whatsapp: profile.whatsapp || '',
          whatsappDisplay: profile.whatsapp_display || profile.whatsappDisplay || profile.whatsapp || '',
          profilePictureUrl: profile.profile_picture_url || profile.profilePictureUrl || profile.avatar_url || profile.avatarUrl || '',
          profile_picture_url: profile.profile_picture_url || profile.profilePictureUrl || profile.avatar_url || profile.avatarUrl || '',
          countryCode: profile.country_code || profile.countryCode || 'do',
          dialCode: profile.dial_code || profile.dialCode || '+1',
          isValid: Boolean(profile.whatsapp),
        });
        setError('');
      })
      .catch((err) => {
        if (alive) setError(err.message || 'No se pudieron cargar tus datos del perfil.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const handleFormChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
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
  const handlePassChange = (e) => {
    const maxLength = e.target.name === 'actual' ? accessPolicy.maxAdminPinLength : accessPolicy.adminPinLength;
    setPassData({ ...passData, [e.target.name]: sanitizePin(e.target.value, maxLength) });
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setError('');
    if (formData.national_id && !isValidDominicanId(formData.national_id)) {
      setError('Ingresa una cédula dominicana válida.');
      setSavingProfile(false);
      return;
    }
    try {
      const response = await api.patch('/admin/profile', {
        name: formData.name,
        last_name: formData.last_name,
        national_id: formatDominicanId(formData.national_id),
        whatsapp: formData.whatsapp,
        whatsapp_display: formData.whatsappDisplay,
        country_code: formData.countryCode,
        dial_code: formData.dialCode,
      });
      setFormData(prev => ({
        ...prev,
        username: response.username || prev.username,
        name: response.name || prev.name,
        last_name: response.last_name || prev.last_name,
        national_id: formatDominicanId(response.national_id || ''),
        whatsapp: response.whatsapp || '',
        whatsappDisplay: response.whatsapp_display || response.whatsappDisplay || response.whatsapp || '',
        profilePictureUrl: response.profile_picture_url || response.profilePictureUrl || response.avatar_url || response.avatarUrl || '',
        profile_picture_url: response.profile_picture_url || response.profilePictureUrl || response.avatar_url || response.avatarUrl || '',
        countryCode: response.country_code || response.countryCode || 'do',
        dialCode: response.dial_code || response.dialCode || '+1',
        isValid: Boolean(response.whatsapp),
      }));
      setSavedProfile(true);
      setTimeout(() => setSavedProfile(false), 2500);
    } catch (err) {
      setError(err.message || 'No se pudo guardar el perfil.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async () => {
    setPassError('');
    const currentPinLengthValid = isAcceptedAccessPinLength(passData.actual.length, accessPolicy);
    if (!currentPinLengthValid || passData.nueva.length !== accessPolicy.adminPinLength || passData.confirmar.length !== accessPolicy.adminPinLength) {
      setPassError(`Completa el PIN actual y define un nuevo PIN de ${accessPolicy.adminPinLength} dígitos.`);
      return;
    }
    if (passData.nueva !== passData.confirmar) {
      setPassError('Los PIN no coinciden.');
      return;
    }
    setSavingPass(true);
    try {
      await api.post('/admin/password', {
        current_password: passData.actual,
        new_password: passData.nueva,
        confirm_password: passData.confirmar,
      });
      setSavedPass(true);
      setPassData({ actual: '', nueva: '', confirmar: '' });
      setTimeout(() => setSavedPass(false), 2500);
    } catch (err) {
      setPassError(err.message || 'No se pudo actualizar el PIN.');
    } finally {
      setSavingPass(false);
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
          </div>
          <div className="p-6 space-y-5">
            {loading ? (
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
                  <p className="text-[11px] text-gray-400 mt-1.5">Número de WhatsApp para notificaciones.</p>
                </div>
                <div className="pt-2 flex items-center gap-3">
                  <button onClick={handleSaveProfile} disabled={savingProfile}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[#00a884] disabled:opacity-60 text-white rounded-xl font-bold text-sm hover:bg-[#009676] transition-colors shadow-sm"
                  >
                    <FiSave className="text-sm" /> {savingProfile ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                  {savedProfile && (
                    <span className="text-xs text-[#00a884] font-bold animate-pulse">✓ Guardado correctamente</span>
                  )}
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
              <input type="password" name="actual" value={passData.actual}
                onChange={handlePassChange} placeholder={"•".repeat(accessPolicy.maxAdminPinLength)} maxLength={accessPolicy.maxAdminPinLength} inputMode="numeric" autoComplete="off" className={inputCls} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Nuevo PIN</label>
                <input type="password" name="nueva" value={passData.nueva}
                  onChange={handlePassChange} placeholder={"•".repeat(accessPolicy.adminPinLength)} maxLength={accessPolicy.adminPinLength} inputMode="numeric" autoComplete="off" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Confirmar PIN</label>
                <input type="password" name="confirmar" value={passData.confirmar}
                  onChange={handlePassChange} placeholder={"•".repeat(accessPolicy.adminPinLength)} maxLength={accessPolicy.adminPinLength} inputMode="numeric" autoComplete="off" className={inputCls} />
              </div>
            </div>
            {passError && (
              <p className="text-xs text-red-500 font-medium">{passError}</p>
            )}
            <div className="pt-2 flex items-center gap-3">
              <button onClick={handleSavePassword} disabled={savingPass}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#1a2332] disabled:opacity-60 text-white rounded-xl font-bold text-sm hover:bg-[#111827] transition-colors shadow-sm"
              >
                <FiLock className="text-sm" /> {savingPass ? 'Actualizando...' : 'Actualizar PIN'}
              </button>
              {savedPass && (
                <span className="text-xs text-[#00a884] font-bold animate-pulse">✓ PIN actualizado</span>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AdminProfile;
