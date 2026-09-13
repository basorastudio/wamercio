import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import PhoneInput from '../components/PhoneInput';
import PinInput from '../components/PinInput';
import UserAvatar from '../common/UserAvatar';
import { useAccessPolicy } from '../lib/accessPolicy';
import { api } from '../lib/api';
import { formatDate } from '../lib/timezone';
import { nationalIdDigits, formatDominicanId, isValidDominicanId, sameDominicanId } from '../lib/nationalId';
import { verifyPlatformIdentity } from '../lib/identity';
import { normalizePersonName } from '../lib/personNames';

const {
  FiPlus,
  FiSearch,
  FiUsers,
  FiEdit2,
  FiTrash2,
  FiX,
  FiCheck,
  FiUserCheck,
  FiAlertCircle,
  FiRefreshCw,
  FiLock,
} = FiIcons;

const permissionOptions = [
  { key: 'overview.view', label: 'Consultar resumen' },
  { key: 'businesses.manage', label: 'Gestionar negocios y propietarios' },
  { key: 'plans.manage', label: 'Gestionar planes y suscripciones' },
  { key: 'catalog.manage', label: 'Gestionar catálogo global' },
  { key: 'customers.view', label: 'Consultar clientes globales' },
  { key: 'settings.manage', label: 'Gestionar configuración SaaS' },
  { key: 'audit.view', label: 'Consultar auditoría' },
  { key: 'users.manage', label: 'Gestionar usuarios SaaS' },
];

const roleOptions = [
  { value: 'superadmin', label: 'Superadministrador' },
  { value: 'administrator', label: 'Administrador SaaS' },
  { value: 'operations', label: 'Operaciones' },
  { value: 'support', label: 'Soporte' },
  { value: 'auditor', label: 'Auditor' },
];

const defaultsByRole: any = {
  superadmin: permissionOptions.map((item) => item.key),
  administrator: ['overview.view', 'businesses.manage', 'plans.manage', 'catalog.manage', 'customers.view', 'settings.manage', 'audit.view'],
  operations: ['overview.view', 'businesses.manage', 'catalog.manage', 'customers.view', 'audit.view'],
  support: ['overview.view', 'customers.view', 'audit.view'],
  auditor: ['overview.view', 'audit.view'],
};

const defaultPermissionsForRole = (role: string) => Object.fromEntries(permissionOptions.map((item) => [item.key, (defaultsByRole[role] || []).includes(item.key)]));
const roleLabel = (role: string) => roleOptions.find((item) => item.value === role)?.label || 'Usuario SaaS';
const roleBadge = (role: string) => {
  if (role === 'superadmin') return 'bg-purple-50 text-purple-600 border-purple-100';
  if (role === 'administrator') return 'bg-[#eafaf1] text-[#008f72] border-[#00a884]/20';
  if (role === 'operations') return 'bg-blue-50 text-blue-600 border-blue-100';
  if (role === 'auditor') return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-amber-50 text-amber-600 border-amber-100';
};
const accessPathForRole = (role: string) => role === 'superadmin' ? '/#/superadmin' : '/#/admin';

const emptyForm: any = {
  name: '',
  last_name: '',
  national_id: '',
  whatsapp: '',
  whatsapp_display: '',
  country_code: 'do',
  dial_code: '+1',
  isValid: false,
  pin: '',
  role: 'support',
  permissions: defaultPermissionsForRole('support'),
  active: true,
  identity_confirmed: false,
};

const emptyIdentityCheck = {
  document: '',
  status: 'idle',
  message: '',
  source: '',
  requestId: '',
  requiresConfirmation: false,
};

const PlatformUsers = ({ currentUser, onCurrentUserUpdated }: any) => {
  const accessPolicy = useAccessPolicy();
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [touchedID, setTouchedID] = useState(false);
  const [identityCheck, setIdentityCheck] = useState<any>(emptyIdentityCheck);
  const identityValidationSeq = useRef(0);

  const selectableRoles = currentUser?.role === 'superadmin'
    ? roleOptions
    : roleOptions.filter((option) => option.value !== 'superadmin');

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/platform/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'No se pudieron cargar los usuarios de plataforma');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadUsers(); }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => [user.name, user.last_name, user.national_id, user.whatsapp, roleLabel(user.role), accessPathForRole(user.role)].join(' ').toLowerCase().includes(query));
  }, [users, search]);

  const resetIdentityFromUser = (user: any = null) => {
    const status = user?.identity_verification_status === 'verified'
      ? 'verified'
      : user?.identity_verification_status === 'pending_manual'
        ? 'manual'
        : 'idle';
    setIdentityCheck({
      document: nationalIdDigits(user?.national_id || ''),
      status,
      message: status === 'verified' ? 'Cédula verificada.' : status === 'manual' ? 'Pendiente de revisión manual.' : '',
      source: user?.identity_source || '',
      requestId: user?.identity_request_id || '',
      requiresConfirmation: Boolean(user?.identity_requires_confirmation),
    });
  };

  const openCreate = () => {
    ++identityValidationSeq.current;
    setEditing(null);
    setForm({ ...emptyForm, permissions: defaultPermissionsForRole('support') });
    setTouchedID(false);
    setIdentityCheck(emptyIdentityCheck);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (user: any) => {
    ++identityValidationSeq.current;
    setEditing(user);
    setForm({
      ...emptyForm,
      ...user,
      pin: '',
      national_id: formatDominicanId(user.national_id || ''),
      country_code: user.country_code || 'do',
      dial_code: user.dial_code || '+1',
      isValid: Boolean(user.whatsapp),
      permissions: user.permissions || defaultPermissionsForRole(user.role),
      identity_confirmed: Boolean(user.identity_confirmed_by_user),
    });
    resetIdentityFromUser(user);
    setTouchedID(Boolean(user.national_id));
    setError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    ++identityValidationSeq.current;
    setModalOpen(false);
    setEditing(null);
    setError('');
    setTouchedID(false);
    setIdentityCheck(emptyIdentityCheck);
  };

  const idDigits = nationalIdDigits(form.national_id);
  const idValid = isValidDominicanId(form.national_id);
  const idInvalid = touchedID && idDigits.length === 11 && !idValid;
  const identityCheckCurrent = identityCheck.document === idDigits;
  const identityStatus = identityCheckCurrent ? identityCheck.status : 'idle';
  const identityIsChecking = identityStatus === 'checking';
  const identityIsVerified = identityStatus === 'verified';
  const identityIsInvalid = identityStatus === 'invalid';
  const identityAllowsManual = identityStatus === 'manual';
  const identityNeedsConfirmation = identityIsVerified && identityCheck.requiresConfirmation;
  const identityConfirmationMissing = identityNeedsConfirmation && !form.identity_confirmed;
  const identityHint = idDigits.length < 11
    ? 'Completa la cédula para verificarla.'
    : identityCheckCurrent && identityCheck.message
      ? identityCheck.message
      : 'La cédula se verificará automáticamente.';

  const updateIdentityField = (key: string, value: any) => {
    if (identityIsVerified && ['national_id', 'name', 'last_name'].includes(key)) return;
    setForm((current: any) => ({ ...current, [key]: value }));
  };

  const unlockIdentity = () => {
    if (!identityIsVerified) return;
    ++identityValidationSeq.current;
    setIdentityCheck(emptyIdentityCheck);
    setForm((current: any) => ({
      ...current,
      national_id: '',
      name: '',
      last_name: '',
      identity_confirmed: false,
    }));
    setTouchedID(false);
    setError('');
  };

  const verifyNationalId = useCallback(async (value: string) => {
    const formatted = formatDominicanId(value || '');
    const digits = nationalIdDigits(formatted);
    const seq = ++identityValidationSeq.current;

    if (digits.length !== 11 || !isValidDominicanId(formatted)) {
      setIdentityCheck({
        ...emptyIdentityCheck,
        document: digits,
        status: digits.length === 11 ? 'invalid' : 'idle',
        message: digits.length === 11 ? 'Ingresa una cédula dominicana válida.' : '',
      });
      return false;
    }

    setIdentityCheck({
      ...emptyIdentityCheck,
      document: digits,
      status: 'checking',
      message: 'Consultando Identidad',
    });

    try {
      const payload = await verifyPlatformIdentity({
        tipo_sujeto: 'persona',
        documento: digits,
        contexto: 'registro_usuario_saas',
      });
      if (seq !== identityValidationSeq.current) return false;

      if (!payload?.success || !payload?.data) {
        if (payload?.manual_allowed) {
          setIdentityCheck({
            ...emptyIdentityCheck,
            document: digits,
            status: 'manual',
            message: payload?.error?.message || 'La verificación no está disponible; el usuario quedará pendiente de revisión manual.',
            requestId: payload?.error?.request_id || '',
          });
          setForm((current: any) => ({ ...current, identity_confirmed: false }));
          return true;
        }
        setIdentityCheck({
          ...emptyIdentityCheck,
          document: digits,
          status: 'invalid',
          message: payload?.error?.message || 'No se pudo verificar la cédula.',
          requestId: payload?.error?.request_id || '',
        });
        return false;
      }

      const result = payload.data;
      if (!result.valida || !result.encontrada || !result.puede_registrarse || !result.persona) {
        setIdentityCheck({
          ...emptyIdentityCheck,
          document: digits,
          status: 'invalid',
          message: result.motivo || 'La cédula no cumple las condiciones para registrar al usuario SaaS.',
          source: result.fuente || '',
          requestId: payload?.meta?.request_id || '',
          requiresConfirmation: Boolean(result.requiere_confirmacion),
        });
        return false;
      }

      const requiresConfirmation = Boolean(result.requiere_confirmacion);
      setForm((current: any) => ({
        ...current,
        national_id: formatDominicanId(result.persona?.cedula || digits),
        name: result.puede_autocompletar && result.persona?.nombres ? normalizePersonName(result.persona.nombres) : current.name,
        last_name: result.puede_autocompletar && result.persona?.apellidos ? normalizePersonName(result.persona.apellidos) : current.last_name,
        identity_confirmed: !requiresConfirmation,
      }));
      setIdentityCheck({
        ...emptyIdentityCheck,
        document: digits,
        status: 'verified',
        message: requiresConfirmation ? 'Cédula encontrada. Revisa y confirma el nombre antes de guardar.' : 'Cédula verificada.',
        source: result.fuente || payload?.meta?.provider || 'Identidad API',
        requestId: payload?.meta?.request_id || '',
        requiresConfirmation,
      });
      return true;
    } catch (err: any) {
      if (seq !== identityValidationSeq.current) return false;
      setIdentityCheck({
        ...emptyIdentityCheck,
        document: digits,
        status: 'invalid',
        message: err?.message || 'No se pudo verificar la cédula.',
      });
      return false;
    }
  }, []);

  useEffect(() => {
    if (!modalOpen || editing?.is_root || identityIsVerified) return undefined;
    const formatted = formatDominicanId(form.national_id || '');
    const digits = nationalIdDigits(formatted);
    if (digits.length < 11) {
      ++identityValidationSeq.current;
      setIdentityCheck({ ...emptyIdentityCheck, document: digits });
      return undefined;
    }
    if (!isValidDominicanId(formatted)) {
      ++identityValidationSeq.current;
      setIdentityCheck({ ...emptyIdentityCheck, document: digits, status: 'invalid', message: 'Ingresa una cédula dominicana válida.' });
      return undefined;
    }
    if (identityCheck.document === digits && identityCheck.status !== 'idle') return undefined;
    const timeout = window.setTimeout(() => { void verifyNationalId(formatted); }, 650);
    return () => window.clearTimeout(timeout);
  }, [editing?.is_root, form.national_id, identityCheck.document, identityCheck.status, identityIsVerified, modalOpen, verifyNationalId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!isValidDominicanId(form.national_id)) {
      setTouchedID(true);
      setError('Ingresa una cédula dominicana válida');
      return;
    }
    if (!form.isValid) {
      setError('Ingresa un número de WhatsApp válido');
      return;
    }
    if (users.some((user) => (!editing || user.id !== editing.id) && sameDominicanId(user.national_id, form.national_id))) {
      setError('Ya existe un usuario con esa cédula');
      return;
    }
    if (!identityIsVerified && !identityAllowsManual) {
      const verified = await verifyNationalId(form.national_id);
      if (!verified) {
        setError('Verifica correctamente la cédula antes de continuar.');
      } else {
        setError('Identidad verificada. Revisa los datos autocompletados y guarda nuevamente.');
      }
      return;
    }
    if (identityConfirmationMissing) {
      setError('Confirma que el nombre devuelto corresponde al usuario SaaS.');
      return;
    }
    if (!editing && form.pin.length !== accessPolicy.adminPinLength) {
      setError(`Define un PIN de ${accessPolicy.adminPinLength} dígitos`);
      return;
    }
    if (form.pin && form.pin.length !== accessPolicy.adminPinLength) {
      setError(`El PIN debe tener ${accessPolicy.adminPinLength} dígitos`);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: normalizePersonName(form.name),
        last_name: normalizePersonName(form.last_name),
        national_id: formatDominicanId(form.national_id),
        whatsapp: form.whatsapp,
        whatsapp_display: form.whatsapp_display || form.whatsapp,
        country_code: form.country_code || 'do',
        dial_code: form.dial_code || '+1',
        pin: form.pin,
        role: form.role,
        permissions: form.permissions,
        active: form.active,
        identity_confirmed: Boolean(form.identity_confirmed),
      };
      if (editing) {
        const updated = await api.patch(`/platform/users/${editing.id}`, payload);
        setUsers((items) => items.map((item) => item.id === updated.id ? updated : item));
        if (updated.id === currentUser?.id) onCurrentUserUpdated?.(updated);
      } else {
        const created = await api.post('/platform/users', payload);
        setUsers((items) => [...items, created]);
      }
      closeModal();
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar el usuario SaaS');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (user: any) => {
    if (!confirm(`¿Desactivar el usuario ${user.name} ${user.last_name}?`)) return;
    setLoading(true);
    setError('');
    try {
      await api.delete(`/platform/users/${user.id}`);
      setUsers((items) => items.map((item) => item.id === user.id ? { ...item, active: false } : item));
    } catch (err: any) {
      setError(err.message || 'No se pudo desactivar el usuario');
    } finally {
      setLoading(false);
    }
  };

  const submitDisabled = saving || identityIsChecking || identityIsInvalid || identityConfirmationMissing;

  return (
    <div className="w-full">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
        <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Equipo de plataforma</p><h1 className="text-2xl font-black text-gray-900">Usuarios SaaS</h1><p className="text-sm text-gray-500 mt-1">Crea usuarios internos y controla las áreas centrales que pueden administrar.</p></div>
        <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 bg-[#00a884] hover:bg-[#009676] text-white px-5 py-3 rounded-2xl text-sm font-black shadow-lg shadow-[#00a884]/20"><FiPlus /> Agregar usuario</button>
      </div>

      {error && !modalOpen && <div className="mb-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"><FiAlertCircle /> {error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Metric label="Usuarios activos" value={users.filter((user) => user.active).length} color="emerald" />
        <Metric label="Superadmins" value={users.filter((user) => user.role === 'superadmin').length} color="purple" />
        <Metric label="Administradores" value={users.filter((user) => user.role === 'administrator').length} color="emerald" />
        <Metric label="Operaciones" value={users.filter((user) => user.role === 'operations').length} color="blue" />
        <Metric label="Soporte / auditoría" value={users.filter((user) => ['support', 'auditor'].includes(user.role)).length} color="amber" />
      </div>

      <div className="relative max-w-md mb-4"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, cédula, WhatsApp, rol o panel..." className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#00a884]" /></div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-left border-collapse min-w-[980px]">
          <thead className="bg-[#f8fafc] border-b border-gray-100"><tr>{['Usuario', 'Panel', 'Cédula', 'WhatsApp', 'Rol', 'Estado', 'Creado', 'Acciones'].map((label) => <th key={label} className={`px-5 py-4 text-xs font-bold text-gray-500 ${label === 'Acciones' ? 'text-right' : ''}`}>{label}</th>)}</tr></thead>
          <tbody>{filtered.map((user) => <tr key={user.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
            <td className="px-5 py-4"><div className="flex items-center gap-3"><UserAvatar user={user} name={`${user.name} ${user.last_name}`} className="w-10 h-10 bg-[#00a884]/10 rounded-full flex items-center justify-center text-[#00a884] border border-[#00a884]/20" icon={FiUserCheck} /><div><p className="font-bold text-sm text-gray-900">{user.name || 'Sin nombre'} {user.last_name}</p><p className="text-[10px] text-gray-400">{user.is_root ? 'Cuenta raíz protegida' : `Acceso por WhatsApp y PIN de ${accessPolicy.adminPinLength} dígitos`}</p></div></div></td>
            <td className="px-5 py-4 text-xs font-black text-gray-700">{accessPathForRole(user.role)}</td><td className="px-5 py-4 text-xs text-gray-600">{user.national_id || '—'}</td><td className="px-5 py-4 text-xs font-bold text-[#00a884]">{user.whatsapp_display || user.whatsapp || '—'}</td>
            <td className="px-5 py-4"><span className={`px-3 py-1 rounded-full text-[11px] font-black border ${roleBadge(user.role)}`}>{roleLabel(user.role)}</span></td><td className="px-5 py-4"><span className={`px-3 py-1 rounded-full text-[11px] font-black border ${user.active ? 'bg-[#eafaf1] text-[#00a884] border-[#00a884]/20' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>{user.active ? 'Activo' : 'Inactivo'}</span></td><td className="px-5 py-4 text-[11px] text-gray-500">{user.created_at ? formatDate(user.created_at, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
            <td className="px-5 py-4 text-right"><div className="inline-flex gap-2"><button onClick={() => openEdit(user)} disabled={user.is_root} title={user.is_root ? 'Edita la cuenta raíz desde Mi perfil' : 'Editar usuario'} className="w-9 h-9 rounded-xl bg-gray-50 hover:bg-[#00a884]/10 text-gray-500 hover:text-[#00a884] border border-gray-200 inline-flex items-center justify-center disabled:opacity-30 disabled:hover:bg-gray-50 disabled:hover:text-gray-500"><FiEdit2 /></button><button onClick={() => remove(user)} disabled={user.is_root || user.id === currentUser?.id || !user.active} title={user.is_root ? 'La cuenta raíz está protegida' : ''} className="w-9 h-9 rounded-xl bg-red-50 text-red-400 border border-red-100 inline-flex items-center justify-center disabled:opacity-30"><FiTrash2 /></button></div></td>
          </tr>)}{filtered.length === 0 && <tr><td colSpan={8} className="px-5 py-14 text-center text-sm text-gray-500"><FiUsers className="text-3xl text-gray-300 mx-auto mb-3" />{loading ? 'Cargando usuarios...' : 'No se encontraron usuarios SaaS'}</td></tr>}</tbody>
        </table></div>
      </div>

      <AnimatePresence>{modalOpen && <><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={closeModal} /><div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none"><motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }} className="pointer-events-auto w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-start"><div><p className="text-[10px] font-black text-[#00a884] uppercase tracking-widest">Usuarios SaaS</p><h2 className="text-xl font-black text-gray-900">{editing ? 'Editar usuario SaaS' : 'Agregar usuario SaaS'}</h2><p className="text-sm text-gray-500 mt-0.5">Verifica la cédula, autocompleta su identidad y asigna el acceso al panel central.</p></div><button onClick={closeModal} className="w-9 h-9 rounded-xl bg-gray-50 text-gray-400 flex items-center justify-center"><FiX /></button></div>
        <form onSubmit={submit} className="p-6 overflow-y-auto">
          {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Field label="WhatsApp *"><PhoneInput value={form.whatsapp} onChange={(phone) => setForm((prev: any) => ({ ...prev, whatsapp: phone.whatsapp, whatsapp_display: phone.whatsappDisplay, country_code: phone.countryCode, dial_code: phone.dialCode, isValid: phone.isValid }))} valid={form.isValid} initialCountry={form.country_code || 'do'} placeholder="Número de WhatsApp" /><p className={`mt-1 text-[11px] font-bold ${form.isValid ? 'text-[#008f72]' : 'text-gray-400'}`}>{form.isValid ? 'WhatsApp válido para el acceso.' : 'Completa el WhatsApp que utilizará para iniciar sesión.'}</p></Field>
            <IdentityDocumentField
              value={form.national_id}
              onChange={(value: string) => {
                updateIdentityField('national_id', formatDominicanId(value));
                setForm((current: any) => ({ ...current, identity_confirmed: false }));
                setTouchedID(true);
              }}
              valid={idValid}
              invalid={idInvalid || identityIsInvalid}
              checking={identityIsChecking}
              verified={identityIsVerified}
              manual={identityAllowsManual}
              hint={identityHint}
              onUnlock={unlockIdentity}
            />
            <Field label="Nombre *"><input value={form.name} onChange={(event) => updateIdentityField('name', event.target.value)} onBlur={(event) => updateIdentityField('name', normalizePersonName(event.target.value))} required readOnly={identityIsVerified} className={`field ${identityIsVerified ? 'identity-locked' : ''}`} placeholder="Nombre" /></Field>
            <Field label="Apellido *"><input value={form.last_name} onChange={(event) => updateIdentityField('last_name', event.target.value)} onBlur={(event) => updateIdentityField('last_name', normalizePersonName(event.target.value))} required readOnly={identityIsVerified} className={`field ${identityIsVerified ? 'identity-locked' : ''}`} placeholder="Apellido" /></Field>
          </div>

          {identityNeedsConfirmation && <label className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><input type="checkbox" checked={Boolean(form.identity_confirmed)} onChange={(event) => setForm((current: any) => ({ ...current, identity_confirmed: event.target.checked }))} className="mt-0.5 h-5 w-5 accent-[#00a884]" /><span><span className="block text-sm font-black text-amber-900">Confirmar identidad del usuario SaaS</span><span className="mt-1 block text-xs text-amber-700">Revisé el nombre autocompletado y confirmo que corresponde a la persona titular de esta cédula.</span></span></label>}
          {identityAllowsManual && <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800"><div className="flex items-start gap-3"><FiAlertCircle className="mt-0.5 shrink-0" /><div><p className="text-xs font-black">Verificación manual permitida</p><p className="mt-1 text-[11px] opacity-80">{identityCheck.message}</p></div></div></div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <Field label="Rol"><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value, permissions: defaultPermissionsForRole(event.target.value) })} disabled={editing?.is_root} className="field disabled:opacity-60">{selectableRoles.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><p className="mt-1 text-[11px] font-bold text-gray-400">Acceso: {accessPathForRole(form.role)}</p></Field>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4"><PinInput value={form.pin} onChange={(pin) => setForm({ ...form, pin })} length={accessPolicy.adminPinLength} label={editing ? `Nuevo PIN de ${accessPolicy.adminPinLength} dígitos (opcional)` : `PIN de acceso de ${accessPolicy.adminPinLength} dígitos *`} /></div>
          </div>

          {!editing?.is_root && <div className="mb-5 rounded-2xl border border-gray-200 bg-gray-50 p-4"><div className="mb-3"><p className="text-xs font-black uppercase tracking-wide text-gray-600">Permisos de plataforma</p><p className="mt-1 text-[11px] text-gray-500">El servidor valida estos permisos antes de ejecutar operaciones centrales.</p></div><div className="grid gap-2 sm:grid-cols-2">{permissionOptions.map((permission) => { const enabled = Boolean(form.permissions?.[permission.key]); return <button key={permission.key} type="button" onClick={() => setForm({ ...form, permissions: { ...form.permissions, [permission.key]: !enabled } })} className={`flex items-center justify-between rounded-xl border px-3 py-3 text-left text-xs font-bold ${enabled ? 'border-[#00a884]/30 bg-[#eafaf1] text-[#007f65]' : 'border-gray-200 bg-white text-gray-500'}`}><span>{permission.label}</span><span className={`flex h-5 w-5 items-center justify-center rounded-md ${enabled ? 'bg-[#00a884] text-white' : 'bg-gray-100 text-gray-300'}`}>{enabled && <FiCheck />}</span></button>; })}</div></div>}

          {!editing?.is_root && <label className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 mb-6"><div><p className="text-sm font-black text-gray-900">Usuario activo</p><p className="text-xs text-gray-500">Si está inactivo, no podrá iniciar sesión.</p></div><button type="button" onClick={() => setForm({ ...form, active: !form.active })} className={`w-[52px] h-[30px] rounded-full relative flex items-center px-0.5 ${form.active ? 'bg-[#00a884]' : 'bg-gray-300'}`}><span className={`w-[26px] h-[26px] bg-white rounded-full shadow-sm transition-transform ${form.active ? 'translate-x-[22px]' : ''}`} /></button></label>}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100"><button type="button" onClick={closeModal} className="px-6 py-3 border border-gray-200 rounded-2xl text-sm font-black text-gray-600">Cancelar</button><button type="submit" disabled={submitDisabled} className="px-6 py-3 bg-[#00a884] disabled:opacity-60 rounded-2xl text-sm font-black text-white inline-flex items-center gap-2"><FiCheck /> {saving ? 'Guardando...' : identityIsChecking ? 'Consultando Identidad' : editing ? 'Guardar cambios' : 'Guardar usuario'}</button></div>
        </form>
      </motion.div></div></>}</AnimatePresence>
      <style jsx>{`.field{width:100%;border:1px solid #e5e7eb;background:#f9fafb;border-radius:1rem;padding:.75rem 1rem;color:#111827;font-weight:700;outline:none}.field:focus{border-color:#00a884;box-shadow:0 0 0 4px rgba(0,168,132,.1)}.identity-locked{border-color:#00a884;background:#f0fdf8;cursor:not-allowed}`}</style>
    </div>
  );
};

const IdentityDocumentField = ({ value, onChange, valid, invalid, checking, verified, manual, hint, onUnlock }: any) => {
  const borderClass = verified
    ? 'border-[#00a884] bg-[#f0fdf8]'
    : checking
      ? 'border-blue-300 bg-blue-50'
      : manual
        ? 'border-amber-300 bg-amber-50'
        : invalid
          ? 'border-red-300 bg-red-50'
          : valid
            ? 'border-[#00a884]/40 bg-white'
            : 'border-gray-200 bg-gray-50';
  const hintClass = verified ? 'text-[#008f72]' : checking ? 'text-blue-600' : manual ? 'text-amber-700' : invalid ? 'text-red-500' : 'text-gray-400';
  return <label><span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">Cédula *</span><div className="relative"><input value={value} onChange={(event) => onChange(event.target.value)} required readOnly={verified} inputMode="numeric" maxLength={13} className={`w-full rounded-2xl border px-4 py-3 pr-11 font-bold text-gray-900 outline-none transition-all focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10 ${verified ? 'cursor-not-allowed' : ''} ${borderClass}`} placeholder="000-0000000-0" /><span className={`absolute right-4 top-1/2 -translate-y-1/2 font-black ${verified ? 'text-[#00a884]' : checking ? 'text-blue-600' : manual ? 'text-amber-600' : invalid ? 'text-red-500' : 'text-gray-400'}`}>{checking ? <FiRefreshCw className="animate-spin" /> : verified ? <FiLock /> : manual ? '!' : invalid ? '×' : valid ? '•' : ''}</span></div><div className="mt-1 flex items-start justify-between gap-3"><p className={`text-[11px] font-bold ${hintClass}`}>{hint}</p>{verified && <button type="button" onClick={onUnlock} className="inline-flex shrink-0 items-center gap-1 text-[10px] font-black text-gray-400 hover:text-[#00a884]"><FiEdit2 /> Cambiar</button>}</div></label>;
};

const Metric = ({ label, value, color }: any) => { const colors: any = { emerald: 'bg-[#eafaf1] border-[#00a884]/20 text-[#008f72]', purple: 'bg-purple-50 border-purple-100 text-purple-600', blue: 'bg-blue-50 border-blue-100 text-blue-600', amber: 'bg-amber-50 border-amber-100 text-amber-600' }; return <div className={`border rounded-2xl p-4 ${colors[color] || colors.emerald}`}><p className="text-[10px] font-black uppercase tracking-wide">{label}</p><p className="text-2xl font-black text-gray-900 mt-1">{value}</p></div>; };
const Field = ({ label, children }: any) => <label><span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">{label}</span>{children}</label>;

export default PlatformUsers;
