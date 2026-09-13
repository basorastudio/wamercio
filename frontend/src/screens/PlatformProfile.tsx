import React, { useEffect, useState } from 'react';
import * as FiIcons from 'react-icons/fi';
import PhoneInput from '../components/PhoneInput';
import UserAvatar from '../common/UserAvatar';
import { api } from '../lib/api';
import { nationalIdDigits, formatDominicanId, isValidDominicanId } from '../lib/nationalId';
import { sanitizePin } from '../lib/pin';
import { useAccessPolicy } from '../lib/accessPolicy';

const { FiUser, FiSave, FiLock, FiAlertCircle, FiShield } = FiIcons;

const emptyProfile = {
  username: '', name: '', last_name: '', national_id: '', whatsapp: '', whatsappDisplay: '',
  profilePictureUrl: '', profile_picture_url: '', countryCode: 'do', dialCode: '+1',
  role: 'support', permissions: {}, isValid: false,
};

const roleLabels = {
  superadmin: 'Superadministrador',
  administrator: 'Administrador SaaS',
  operations: 'Operaciones',
  support: 'Soporte',
  auditor: 'Auditor',
};

const PlatformProfile = ({ onProfileSaved }: any) => {
  const accessPolicy = useAccessPolicy();
  const [formData, setFormData] = useState<any>(emptyProfile);
  const [passData, setPassData] = useState({ actual: '', nueva: '', confirmar: '' });
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPass, setSavingPass] = useState(false);
  const [savedProfile, setSavedProfile] = useState(false);
  const [savedPass, setSavedPass] = useState(false);
  const [error, setError] = useState('');
  const [passError, setPassError] = useState('');

  const applyProfile = (profile: any, notifyParent = false) => {
    const next = {
      username: profile.username || '', name: profile.name || '', last_name: profile.last_name || '',
      national_id: formatDominicanId(profile.national_id || ''), whatsapp: profile.whatsapp || '',
      whatsappDisplay: profile.whatsapp_display || profile.whatsappDisplay || profile.whatsapp || '',
      profilePictureUrl: profile.profile_picture_url || profile.profilePictureUrl || '',
      profile_picture_url: profile.profile_picture_url || profile.profilePictureUrl || '',
      countryCode: profile.country_code || profile.countryCode || 'do',
      dialCode: profile.dial_code || profile.dialCode || '+1', role: profile.role || 'support',
      permissions: profile.permissions || {}, isValid: Boolean(profile.whatsapp),
    };
    setFormData(next);
    if (notifyParent) onProfileSaved?.(profile);
  };

  useEffect(() => {
    let alive = true;
    api.get('/platform/profile')
      .then((profile) => { if (alive) applyProfile(profile); })
      .catch((err) => { if (alive) setError(err.message || 'No se pudieron cargar tus datos del perfil.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const saveProfile = async () => {
    setError('');
    if (formData.national_id && !isValidDominicanId(formData.national_id)) {
      setError('Ingresa una cédula dominicana válida.');
      return;
    }
    if (formData.whatsapp && !formData.isValid) {
      setError('Ingresa un número de WhatsApp válido.');
      return;
    }
    setSavingProfile(true);
    try {
      const response = await api.patch('/platform/profile', {
        name: formData.name, last_name: formData.last_name,
        national_id: formatDominicanId(formData.national_id), whatsapp: formData.whatsapp,
        whatsapp_display: formData.whatsappDisplay, country_code: formData.countryCode,
        dial_code: formData.dialCode,
      });
      applyProfile(response, true);
      setSavedProfile(true);
      setTimeout(() => setSavedProfile(false), 2500);
    } catch (err) {
      setError(err.message || 'No se pudo guardar el perfil.');
    } finally {
      setSavingProfile(false);
    }
  };

  const savePin = async () => {
    setPassError('');
    if (!passData.actual || passData.nueva.length !== accessPolicy.adminPinLength || passData.confirmar.length !== accessPolicy.adminPinLength) {
      setPassError(`Ingresa tu contraseña o PIN actual y define un nuevo PIN de ${accessPolicy.adminPinLength} dígitos.`);
      return;
    }
    if (passData.nueva !== passData.confirmar) {
      setPassError('Los PIN no coinciden.');
      return;
    }
    setSavingPass(true);
    try {
      await api.post('/platform/profile/password', {
        current_password: passData.actual, new_password: passData.nueva, confirm_password: passData.confirmar,
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

  const inputCls = 'w-full px-4 py-2.5 text-sm font-medium text-gray-800 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 focus:border-[#00a884] transition-all';
  const idDigits = nationalIdDigits(formData.national_id);
  const idValid = Boolean(formData.national_id) && isValidDominicanId(formData.national_id);
  const idInvalid = idDigits.length === 11 && !idValid;
  const accessPath = formData.role === 'superadmin' ? '/#/superadmin' : '/#/admin';

  return (
    <div className="w-full">
      <div className="mb-6 flex items-center gap-3">
        <UserAvatar user={formData} name={`${formData.name} ${formData.last_name}`} className="w-12 h-12 bg-[#00a884]/10 rounded-2xl flex items-center justify-center border border-[#00a884]/20 text-[#00a884]" icon={FiUser} iconClassName="text-[#00a884] text-xl" textClassName="text-sm font-black" />
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-gray-900">Mi Perfil</h1>
          <p className="text-sm text-gray-400 mt-0.5">Gestiona tus datos personales y PIN de acceso a la plataforma</p>
        </div>
        <span className="ml-auto hidden sm:inline-flex items-center gap-2 rounded-full border border-[#00a884]/20 bg-[#eafaf1] px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-[#008f72]"><FiShield /> {roleLabels[formData.role] || 'Usuario SaaS'}</span>
      </div>

      {error && <div className="mb-4 flex items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600"><FiAlertCircle /> {error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <section className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-2"><FiUser className="text-gray-400" /><h2 className="text-sm font-bold text-gray-900">Datos personales</h2></div>
          <div className="p-6 space-y-5">
            {loading ? <div className="py-10 text-center text-sm font-bold text-gray-400">Cargando perfil...</div> : <>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3"><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Ruta de acceso</p><p className="mt-1 text-sm font-black text-gray-900">{accessPath}</p></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <label><span className="block text-xs font-bold text-gray-700 mb-1.5">Nombre</span><input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={inputCls} placeholder="Tu nombre" /></label>
                <label><span className="block text-xs font-bold text-gray-700 mb-1.5">Apellido</span><input value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} className={inputCls} placeholder="Tu apellido" /></label>
                <label className="md:col-span-2"><span className="block text-xs font-bold text-gray-700 mb-1.5">Cédula</span><input value={formData.national_id} onChange={(e) => setFormData({ ...formData, national_id: formatDominicanId(e.target.value) })} inputMode="numeric" maxLength={13} className={`${inputCls} ${idValid ? 'border-[#00a884] bg-[#f0fdf8]' : idInvalid ? 'border-red-300 bg-red-50' : ''}`} placeholder="000-0000000-0" />{idInvalid && <p className="mt-1.5 text-[11px] font-bold text-red-500">Cédula dominicana no válida</p>}{idValid && <p className="mt-1.5 text-[11px] font-bold text-[#00a884]">✓ Cédula válida</p>}</label>
              </div>
              <div><label className="block text-xs font-bold text-gray-700 mb-1.5">WhatsApp</label><PhoneInput value={formData.whatsapp} onChange={(phone) => setFormData((prev) => ({ ...prev, whatsapp: phone.whatsapp, whatsappDisplay: phone.whatsappDisplay, countryCode: phone.countryCode, dialCode: phone.dialCode, isValid: phone.isValid }))} valid={formData.isValid} initialCountry={formData.countryCode || 'do'} placeholder="Número de WhatsApp" /><p className="text-[11px] text-gray-400 mt-1.5">Número para notificaciones internas de la plataforma.</p></div>
              <div className="pt-2 flex items-center gap-3"><button onClick={saveProfile} disabled={savingProfile} className="flex items-center gap-2 px-6 py-2.5 bg-[#00a884] disabled:opacity-60 text-white rounded-xl font-bold text-sm hover:bg-[#009676]"><FiSave /> {savingProfile ? 'Guardando...' : 'Guardar cambios'}</button>{savedProfile && <span className="text-xs text-[#00a884] font-bold">✓ Guardado correctamente</span>}</div>
            </>}
          </div>
        </section>

        <section className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-2"><FiLock className="text-gray-400" /><h2 className="text-sm font-bold text-gray-900">Cambiar PIN de acceso</h2></div>
          <div className="p-6 space-y-5">
            <label className="block"><span className="block text-xs font-bold text-gray-700 mb-1.5">Contraseña o PIN actual</span><input type="password" value={passData.actual} onChange={(e) => setPassData({ ...passData, actual: e.target.value })} className={inputCls} autoComplete="current-password" placeholder="••••••••" /></label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <label><span className="block text-xs font-bold text-gray-700 mb-1.5">Nuevo PIN</span><input type="password" value={passData.nueva} onChange={(e) => setPassData({ ...passData, nueva: sanitizePin(e.target.value, accessPolicy.adminPinLength) })} maxLength={accessPolicy.adminPinLength} inputMode="numeric" className={inputCls} placeholder={"•".repeat(accessPolicy.adminPinLength)} /></label>
              <label><span className="block text-xs font-bold text-gray-700 mb-1.5">Confirmar PIN</span><input type="password" value={passData.confirmar} onChange={(e) => setPassData({ ...passData, confirmar: sanitizePin(e.target.value, accessPolicy.adminPinLength) })} maxLength={accessPolicy.adminPinLength} inputMode="numeric" className={inputCls} placeholder={"•".repeat(accessPolicy.adminPinLength)} /></label>
            </div>
            {passError && <p className="text-xs font-bold text-red-500">{passError}</p>}
            <div className="pt-2 flex items-center gap-3"><button onClick={savePin} disabled={savingPass} className="flex items-center gap-2 px-6 py-2.5 bg-[#1a2332] disabled:opacity-60 text-white rounded-xl font-bold text-sm hover:bg-[#111827]"><FiLock /> {savingPass ? 'Actualizando...' : 'Actualizar PIN'}</button>{savedPass && <span className="text-xs text-[#00a884] font-bold">✓ PIN actualizado</span>}</div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default PlatformProfile;
