import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import PhoneInput from '../components/PhoneInput';
import PinInput from '../components/PinInput';
import { useAccessPolicy } from '../lib/accessPolicy';
import { api } from '../lib/api';
import { formatDate } from '../lib/timezone';
import { nationalIdDigits, formatDominicanId, isValidDominicanId, sameDominicanId } from '../lib/nationalId';
import UserAvatar from '../common/UserAvatar';

const { FiPlus, FiSearch, FiUsers, FiEdit2, FiTrash2, FiX, FiCheck, FiUserCheck } = FiIcons;


const permissionOptions = [
  { key: 'sales.view', label: 'Consultar ventas', roles: ['cashier'] },
  { key: 'sales.create', label: 'Registrar ventas y pedidos', roles: ['cashier'] },
  { key: 'customers.view', label: 'Consultar clientes', roles: ['cashier'] },
  { key: 'credit.collect', label: 'Registrar abonos de fiado', roles: ['cashier'] },
  { key: 'cash.manage', label: 'Abrir, mover y cerrar caja', roles: ['cashier'] },
  { key: 'delivery.manage', label: 'Gestionar entregas asignadas', roles: ['delivery_driver'] },
];

const defaultPermissionsForRole = (role) => Object.fromEntries(
  permissionOptions.map((permission) => [permission.key, permission.roles.includes(role)]),
);

const emptyForm = {
  name: '',
  last_name: '',
  national_id: '',
  whatsapp: '',
  whatsapp_display: '',
  country_code: 'do',
  dial_code: '+1',
  isValid: false,
  pin: '',
  role: 'cashier',
  permissions: defaultPermissionsForRole('cashier'),
  active: true,
};

const roleOptions = [
  { value: 'administrator', label: 'Administrador' },
  { value: 'cashier', label: 'Cajero' },
  { value: 'delivery_driver', label: 'Repartidor' },
];

const roleLabel = (role) => roleOptions.find((item) => item.value === role)?.label || 'Usuario';
const roleBadge = (role) => {
  if (role === 'administrator') return 'bg-[#eafaf1] text-[#00a884] border-[#00a884]/20';
  if (role === 'delivery_driver') return 'bg-blue-50 text-blue-600 border-blue-100';
  return 'bg-amber-50 text-amber-600 border-amber-100';
};

const Users = () => {
  const accessPolicy = useAccessPolicy();
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState<any>({});

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await api.get('/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => [u.name, u.last_name, u.national_id, u.whatsapp, roleLabel(u.role)]
      .join(' ').toLowerCase().includes(q));
  }, [users, searchTerm]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setTouched({});
    setModalOpen(true);
  };

  const openEdit = (user) => {
    setEditing(user);
    setForm({
      ...emptyForm,
      ...user,
      pin: '',
      country_code: user.country_code || 'do',
      dial_code: user.dial_code || '+1',
      isValid: Boolean(user.whatsapp),
      permissions: user.permissions && typeof user.permissions === 'object' ? user.permissions : defaultPermissionsForRole(user.role),
    });
    setError('');
    setTouched({ national_id: true });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setTouched({});
  };

  const handleNationalIdChange = (value) => {
    setForm(prev => ({ ...prev, national_id: formatDominicanId(value) }));
    setTouched(prev => ({ ...prev, national_id: true }));
    setError('');
  };

  const currentNationalIdDigits = nationalIdDigits(form.national_id);
  const nationalIdCompleted = currentNationalIdDigits.length === 11;
  const nationalIdValid = isValidDominicanId(form.national_id);
  const nationalIdInvalid = Boolean(touched.national_id) && nationalIdCompleted && !nationalIdValid;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const payload = {
      ...form,
      national_id: formatDominicanId(form.national_id),
      whatsapp_display: form.whatsapp_display || form.whatsapp,
      country_code: form.country_code || 'do',
      dial_code: form.dial_code || '+1',
    };
    if (!isValidDominicanId(payload.national_id)) {
      setTouched(prev => ({ ...prev, national_id: true }));
      setError('Ingresa una cédula dominicana válida');
      return;
    }
    const duplicatedNationalId = users.some((user) => (!editing || user.id !== editing.id) && sameDominicanId(user.national_id, payload.national_id));
    if (duplicatedNationalId) {
      setError('Ya existe un usuario registrado con esa cédula');
      return;
    }
    if (!editing && !payload.pin) {
      setError(`Define un PIN de ${accessPolicy.adminPinLength} dígitos para el usuario`);
      return;
    }
    if (payload.pin && payload.pin.length !== accessPolicy.adminPinLength) {
      setError(`El PIN debe tener ${accessPolicy.adminPinLength} dígitos`);
      return;
    }
    setLoading(true);
    try {
      if (editing) {
        const updated = await api.patch(`/users/${editing.id}`, payload);
        setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
      } else {
        const created = await api.post('/users', payload);
        setUsers((prev) => [created, ...prev]);
      }
      closeModal();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el usuario');
    } finally {
      setLoading(false);
    }
  };

  const remove = async (user) => {
    if (!confirm(`¿Eliminar el usuario ${user.name} ${user.last_name}?`)) return;
    setLoading(true);
    try {
      await api.delete(`/users/${user.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el usuario');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white md:p-8 p-4 w-full overflow-y-auto">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Usuarios</h1>
          <p className="text-sm text-gray-500 mt-1">Crea usuarios internos y asigna el panel que podrán usar.</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 bg-[#00a884] hover:bg-[#009676] text-white px-5 py-3 rounded-2xl text-sm font-black shadow-lg shadow-[#00a884]/20 transition-colors">
          <FiPlus /> Agregar usuario
        </button>
      </div>

      {error && !modalOpen && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
        <div className="bg-[#eafaf1] border border-[#00a884]/20 rounded-2xl p-4">
          <p className="text-xs font-black text-[#00a884] uppercase tracking-wide">Usuarios activos</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{users.filter(u => u.active).length}</p>
        </div>
        <div className="bg-[#eafaf1] border border-[#00a884]/20 rounded-2xl p-4">
          <p className="text-xs font-black text-[#00a884] uppercase tracking-wide">Administradores</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{users.filter(u => u.role === 'administrator').length}</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <p className="text-xs font-black text-amber-600 uppercase tracking-wide">Cajeros</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{users.filter(u => u.role === 'cashier').length}</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p className="text-xs font-black text-blue-600 uppercase tracking-wide">Repartidores</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{users.filter(u => u.role === 'delivery_driver').length}</p>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 md:max-w-md">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por nombre, cédula, WhatsApp o rol..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#00a884] transition-colors"
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex-1">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="bg-[#f8fafc] border-b border-gray-100">
              <tr>
                <th className="px-5 py-4 text-xs font-bold text-gray-500">Usuario</th>
                <th className="px-5 py-4 text-xs font-bold text-gray-500">Cédula</th>
                <th className="px-5 py-4 text-xs font-bold text-gray-500">WhatsApp</th>
                <th className="px-5 py-4 text-xs font-bold text-gray-500">Rol</th>
                <th className="px-5 py-4 text-xs font-bold text-gray-500">Estado</th>
                <th className="px-5 py-4 text-xs font-bold text-gray-500">Creado</th>
                <th className="px-5 py-4 text-xs font-bold text-gray-500 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <UserAvatar user={user} name={`${user.name || ''} ${user.last_name || ''}`} className="w-10 h-10 bg-[#00a884]/10 rounded-full flex items-center justify-center text-[#00a884] shrink-0 border border-[#00a884]/20" icon={FiUserCheck} />
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{user.name} {user.last_name}</p>
                        <p className="text-[10px] text-gray-400">Acceso por PIN de {accessPolicy.adminPinLength} dígitos</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-600 font-medium">{user.national_id}</td>
                  <td className="px-5 py-4 text-xs font-bold text-[#00a884]">{user.whatsapp_display || user.whatsapp}</td>
                  <td className="px-5 py-4">
                    <span className={`px-3 py-1 rounded-full text-[11px] font-black border ${roleBadge(user.role)}`}>{roleLabel(user.role)}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-3 py-1 rounded-full text-[11px] font-black border ${user.active ? 'bg-[#eafaf1] text-[#00a884] border-[#00a884]/20' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                      {user.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[11px] text-gray-500 font-medium">{user.created_at ? formatDate(user.created_at, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button onClick={() => openEdit(user)} className="w-9 h-9 rounded-xl bg-gray-50 hover:bg-[#00a884]/10 text-gray-500 hover:text-[#00a884] border border-gray-200 transition-colors inline-flex items-center justify-center">
                        <FiEdit2 />
                      </button>
                      <button onClick={() => remove(user)} className="w-9 h-9 rounded-xl bg-red-50 hover:bg-red-100 text-red-400 border border-red-100 transition-colors inline-flex items-center justify-center">
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-sm text-gray-500 font-medium">
                    <FiUsers className="text-3xl text-gray-300 mx-auto mb-3" />
                    {users.length === 0 ? 'No hay usuarios internos registrados aún' : 'No se encontraron usuarios con ese criterio'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {modalOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={closeModal} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
              <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="pointer-events-auto w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)]">
              <div className="p-6 border-b border-gray-100 flex justify-between items-start shrink-0">
                <div>
                  <h2 className="text-xl font-black text-gray-900">{editing ? 'Editar usuario' : 'Agregar usuario'}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Asigna el rol de administrador, cajero o repartidor. Los clientes se registran solos desde la aplicación móvil.</p>
                </div>
                <button onClick={closeModal} className="w-9 h-9 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center">
                  <FiX />
                </button>
              </div>

              <form onSubmit={submit} className="p-6 overflow-y-auto">
                {error && (
                  <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <label>
                    <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">Nombre</span>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10" placeholder="Nombre" />
                  </label>
                  <label>
                    <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">Apellido</span>
                    <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10" placeholder="Apellido" />
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <label>
                    <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">Cédula</span>
                    <input
                      value={form.national_id}
                      onChange={(e) => handleNationalIdChange(e.target.value)}
                      required
                      inputMode="numeric"
                      maxLength={13}
                      className={`w-full rounded-2xl border px-4 py-3 text-gray-900 font-bold outline-none transition-all ${nationalIdValid ? 'border-[#00a884] bg-[#f0fdf8] focus:ring-4 focus:ring-[#00a884]/10' : nationalIdInvalid ? 'border-red-300 bg-red-50 focus:ring-4 focus:ring-red-100' : 'border-gray-200 bg-gray-50 focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10'}`}
                      placeholder="000-0000000-0"
                    />
                    {nationalIdInvalid && <p className="mt-1.5 text-[11px] font-bold text-red-500">Cédula dominicana no válida</p>}
                    {nationalIdValid && <p className="mt-1.5 text-[11px] font-bold text-[#00a884]">✓ Cédula válida</p>}
                  </label>
                  <label>
                    <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">Rol</span>
                    <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, permissions: defaultPermissionsForRole(e.target.value) })} className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10">
                      {roleOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {form.role !== 'administrator' && (
                  <div className="mb-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-3">
                      <p className="text-xs font-black uppercase tracking-wide text-gray-600">Permisos operativos</p>
                      <p className="mt-1 text-[11px] text-gray-500">El backend verificará estos permisos en cada operación, aunque el usuario intente acceder directamente a una ruta.</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {permissionOptions.filter((permission) => permission.roles.includes(form.role)).map((permission) => {
                        const enabled = Boolean(form.permissions?.[permission.key]);
                        return (
                          <button key={permission.key} type="button" onClick={() => setForm({ ...form, permissions: { ...form.permissions, [permission.key]: !enabled } })} className={`flex items-center justify-between rounded-xl border px-3 py-3 text-left text-xs font-bold transition-colors ${enabled ? 'border-[#00a884]/30 bg-[#eafaf1] text-[#007f65]' : 'border-gray-200 bg-white text-gray-500'}`}>
                            <span>{permission.label}</span>
                            <span className={`flex h-5 w-5 items-center justify-center rounded-md ${enabled ? 'bg-[#00a884] text-white' : 'bg-gray-100 text-gray-300'}`}>{enabled ? <FiCheck /> : null}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mb-4">
                  <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">WhatsApp</span>
                  <PhoneInput
                    value={form.whatsapp}
                    placeholder="Número de WhatsApp"
                    onChange={(phone) => setForm(prev => ({
                      ...prev,
                      whatsapp: phone.whatsapp,
                      whatsapp_display: phone.whatsappDisplay,
                      country_code: phone.countryCode,
                      dial_code: phone.dialCode,
                      isValid: phone.isValid,
                    }))}
                    valid={form.isValid}
                  />
                  {editing && <p className="text-[11px] text-gray-400 mt-2">Actual: {editing.whatsapp_display || editing.whatsapp}</p>}
                </div>

                <div className="mb-5">
                  <PinInput value={form.pin} onChange={(pin) => setForm({ ...form, pin })} length={accessPolicy.adminPinLength} label={editing ? `Nuevo PIN de ${accessPolicy.adminPinLength} dígitos (opcional)` : `PIN de acceso de ${accessPolicy.adminPinLength} dígitos *`} />
                </div>

                <label className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 mb-6">
                  <div>
                    <p className="text-sm font-black text-gray-900">Usuario activo</p>
                    <p className="text-xs text-gray-500">Si está inactivo, no podrá iniciar sesión en su panel.</p>
                  </div>
                  <button type="button" onClick={() => setForm({ ...form, active: !form.active })} className={`w-[52px] h-[30px] rounded-full transition-colors relative flex items-center px-0.5 shrink-0 ${form.active ? 'bg-[#00a884]' : 'bg-gray-300'}`}>
                    <div className={`w-[26px] h-[26px] bg-white rounded-full shadow-sm transition-transform ${form.active ? 'translate-x-[22px]' : 'translate-x-0'}`} />
                  </button>
                </label>

                <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-gray-100">
                  <button type="button" onClick={closeModal} className="px-6 py-3 border border-gray-200 rounded-2xl text-sm font-black text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
                  <button type="submit" disabled={loading} className="px-6 py-3 bg-[#00a884] hover:bg-[#009676] disabled:opacity-70 rounded-2xl text-sm font-black text-white transition-colors shadow-sm inline-flex items-center justify-center gap-2">
                    <FiCheck /> {loading ? 'Guardando...' : 'Guardar usuario'}
                  </button>
                </div>
              </form>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Users;
