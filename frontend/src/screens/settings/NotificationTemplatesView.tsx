"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiAlertCircle,
  FiBell,
  FiCheckCircle,
  FiEdit3,
  FiFilter,
  FiInfo,
  FiMessageCircle,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSend,
  FiShield,
  FiTag,
  FiTrash2,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { api } from "@/lib/api";

export type NotificationTemplate = {
  id: string;
  scope: "platform" | "business";
  tenant_id?: string;
  tenant_name?: string;
  channel: "whatsapp";
  category: string;
  event_key: string;
  name: string;
  body: string;
  variables?: string[];
  enabled: boolean;
  allow_business_override: boolean;
  updated_at?: string;
};

type TenantOption = {
  id: string;
  name?: string;
  slug?: string;
  status?: string;
};

type TemplateForm = {
  scope: "platform" | "business";
  tenant_id: string;
  category: string;
  event_key: string;
  name: string;
  body: string;
  enabled: boolean;
  allow_business_override: boolean;
};

const categoryOptions = [
  { value: "system", label: "Sistema" },
  { value: "registration", label: "Registro" },
  { value: "orders", label: "Pedidos" },
  { value: "payments", label: "Pagos y fiado" },
  { value: "security", label: "Seguridad" },
  { value: "marketing", label: "Comercial" },
  { value: "custom", label: "Personalizada" },
];

const eventOptions = [
  { value: "system.welcome", label: "Bienvenida general" },
  { value: "registration.client.completed", label: "Registro de cliente" },
  { value: "registration.owner.created", label: "Registro de propietario" },
  { value: "order.created", label: "Pedido recibido" },
  { value: "order.status.changed", label: "Cambio de estado del pedido" },
  { value: "order.ready", label: "Pedido listo" },
  { value: "order.delivered", label: "Pedido entregado" },
  { value: "store_credit.payment.recorded", label: "Abono de fiado" },
  { value: "security.access.changed", label: "Cambio de acceso" },
];

const availableVariables = [
  { key: "cliente", label: "Cliente" },
  { key: "negocio", label: "Negocio" },
  { key: "pedido_id", label: "Pedido" },
  { key: "total", label: "Total" },
  { key: "estado", label: "Estado" },
  { key: "monto", label: "Monto" },
  { key: "saldo", label: "Saldo" },
  { key: "metodo", label: "Método" },
  { key: "titulo", label: "Título interno" },
  { key: "mensaje", label: "Mensaje interno" },
];

const emptyForm = (): TemplateForm => ({
  scope: "platform",
  tenant_id: "",
  category: "system",
  event_key: "",
  name: "",
  body: "",
  enabled: true,
  allow_business_override: true,
});

const categoryLabel = (value: string) =>
  categoryOptions.find((item) => item.value === value)?.label || value || "Sistema";

const formatDate = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-DO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const previewMessage = (body: string) => {
  const values: Record<string, string> = {
    cliente: "María Pérez",
    negocio: "Colmado Central",
    pedido_id: "#1048",
    total: "1,285.00",
    estado: "Listo para entregar",
    monto: "500.00",
    saldo: "750.00",
    metodo: "Efectivo",
    titulo: "Actualización",
    mensaje: "Te mantendremos informado.",
    plataforma: "WAMERCIO",
  };
  return String(body || "Escribe el contenido para ver una vista previa.")
    .replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => values[String(key).toLowerCase()] || `{{${key}}}`)
    .trim();
};

const TemplateModal = ({
  template,
  tenants,
  onClose,
  onSaved,
}: {
  template: NotificationTemplate | null;
  tenants: TenantOption[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) => {
  const [form, setForm] = useState<TemplateForm>(() =>
    template
      ? {
          scope: template.scope,
          tenant_id: template.tenant_id || "",
          category: template.category || "system",
          event_key: template.event_key || "",
          name: template.name || "",
          body: template.body || "",
          enabled: template.enabled !== false,
          allow_business_override: template.allow_business_override !== false,
        }
      : emptyForm(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = <K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const insertVariable = (key: string) => {
    const token = `{{${key}}}`;
    setForm((current) => ({
      ...current,
      body: `${current.body}${current.body && !current.body.endsWith(" ") ? " " : ""}${token}`,
    }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        tenant_id: form.scope === "business" ? form.tenant_id : "",
        allow_business_override:
          form.scope === "platform" ? form.allow_business_override : false,
      };
      if (template?.id) {
        await api.patch(`/platform/notification-templates/${template.id}`, payload);
      } else {
        await api.post("/platform/notification-templates", payload);
      }
      await onSaved();
      onClose();
    } catch (cause: any) {
      setError(cause?.message || "No se pudo guardar la plantilla");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0f172a]/55 p-3 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-[26px] border border-white/60 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#00a884]">
              WhatsApp · Plantillas
            </p>
            <h3 className="mt-1 text-xl font-black text-gray-900">
              {template ? "Editar plantilla" : "Nueva plantilla"}
            </h3>
            <p className="mt-1 text-xs text-gray-400">
              Define el alcance, el evento y el mensaje que utilizará WAMERCIO.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200"
            aria-label="Cerrar"
          >
            <FiX />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-6">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              <FiAlertCircle /> {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Alcance del mensaje
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => update("scope", "platform")}
                    className={`rounded-2xl border p-4 text-left transition ${form.scope === "platform" ? "border-[#00a884] bg-[#e9fbf5] text-[#007c65]" : "border-gray-200 bg-white text-gray-600"}`}
                  >
                    <span className="flex items-center gap-2 text-sm font-black">
                      <FiShield /> Plataforma
                    </span>
                    <span className="mt-1 block text-[11px] opacity-70">
                      Plantilla predeterminada para todos los negocios.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => update("scope", "business")}
                    className={`rounded-2xl border p-4 text-left transition ${form.scope === "business" ? "border-[#00a884] bg-[#e9fbf5] text-[#007c65]" : "border-gray-200 bg-white text-gray-600"}`}
                  >
                    <span className="flex items-center gap-2 text-sm font-black">
                      <FiUsers /> Negocio
                    </span>
                    <span className="mt-1 block text-[11px] opacity-70">
                      Personalización exclusiva para un negocio.
                    </span>
                  </button>
                </div>
                {form.scope === "business" && (
                  <label className="mt-4 block">
                    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-gray-500">
                      Negocio
                    </span>
                    <select
                      value={form.tenant_id}
                      onChange={(event) => update("tenant_id", event.target.value)}
                      className="h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 outline-none focus:border-[#00a884] focus:ring-2 focus:ring-[#00a884]/15"
                      required
                    >
                      <option value="">Selecciona un negocio</option>
                      {tenants.map((tenant) => (
                        <option key={tenant.id} value={tenant.id}>
                          {tenant.name || tenant.slug || tenant.id}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-gray-500">
                    Nombre de la plantilla
                  </span>
                  <input
                    value={form.name}
                    onChange={(event) => update("name", event.target.value)}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-800 outline-none focus:border-[#00a884] focus:ring-2 focus:ring-[#00a884]/15"
                    placeholder="Pedido recibido"
                    required
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-gray-500">
                    Categoría
                  </span>
                  <select
                    value={form.category}
                    onChange={(event) => update("category", event.target.value)}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 outline-none focus:border-[#00a884] focus:ring-2 focus:ring-[#00a884]/15"
                  >
                    {categoryOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-gray-500">
                  Evento del sistema
                </span>
                <input
                  list="notification-event-options"
                  value={form.event_key}
                  onChange={(event) => update("event_key", event.target.value.toLowerCase())}
                  className="h-12 w-full rounded-xl border border-gray-200 bg-white px-3 font-mono text-sm font-bold text-gray-800 outline-none focus:border-[#00a884] focus:ring-2 focus:ring-[#00a884]/15"
                  placeholder="order.created"
                  required
                />
                <datalist id="notification-event-options">
                  {eventOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </datalist>
                <span className="mt-1 block text-[10px] text-gray-400">
                  Usa un identificador estable, por ejemplo: order.created.
                </span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-gray-500">
                  Mensaje de WhatsApp
                </span>
                <textarea
                  value={form.body}
                  onChange={(event) => update("body", event.target.value)}
                  rows={8}
                  className="w-full resize-y rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium leading-relaxed text-gray-800 outline-none focus:border-[#00a884] focus:ring-2 focus:ring-[#00a884]/15"
                  placeholder="Hola {{cliente}}, recibimos tu pedido {{pedido_id}} en {{negocio}}."
                  required
                />
              </label>

              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                  Variables disponibles
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableVariables.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => insertVariable(item.key)}
                      className="rounded-full border border-[#00a884]/20 bg-[#e9fbf5] px-3 py-1.5 text-[10px] font-black text-[#008f72] hover:bg-[#d9f7ef]"
                      title={`Insertar {{${item.key}}}`}
                    >
                      + {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(event) => update("enabled", event.target.checked)}
                    className="mt-0.5 h-5 w-5 accent-[#00a884]"
                  />
                  <span>
                    <span className="block text-sm font-black text-gray-900">Plantilla activa</span>
                    <span className="mt-1 block text-[11px] text-gray-400">
                      Si se desactiva, WAMERCIO conserva el mensaje interno del evento.
                    </span>
                  </span>
                </label>
                {form.scope === "platform" && (
                  <label className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <input
                      type="checkbox"
                      checked={form.allow_business_override}
                      onChange={(event) => update("allow_business_override", event.target.checked)}
                      className="mt-0.5 h-5 w-5 accent-[#00a884]"
                    />
                    <span>
                      <span className="block text-sm font-black text-gray-900">Permitir personalización</span>
                      <span className="mt-1 block text-[11px] text-gray-400">
                        Un negocio podrá tener una plantilla propia para este evento.
                      </span>
                    </span>
                  </label>
                )}
              </div>
            </div>

            <aside className="space-y-4 xl:sticky xl:top-0 xl:self-start">
              <div className="rounded-2xl border border-[#00a884]/20 bg-[#e9fbf5] p-4">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#008f72]">
                  <FiMessageCircle /> Vista previa
                </div>
                <div className="mt-4 rounded-2xl rounded-tl-md bg-white p-4 text-sm leading-relaxed text-gray-700 shadow-sm">
                  <p className="whitespace-pre-wrap">{previewMessage(form.body)}</p>
                  <p className="mt-3 text-right text-[9px] font-bold text-gray-400">WAMERCIO · ahora</p>
                </div>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-relaxed text-blue-700">
                <div className="flex items-center gap-2 font-black">
                  <FiInfo /> Prioridad inteligente
                </div>
                <p className="mt-2">
                  La plantilla del negocio tiene prioridad sobre la de plataforma cuando la personalización está permitida.
                </p>
              </div>
            </aside>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl bg-white px-5 text-sm font-black text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            disabled={saving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#00a884] px-6 text-sm font-black text-white shadow-md shadow-[#00a884]/20 hover:bg-[#008f72] disabled:opacity-60"
          >
            <FiCheckCircle /> {saving ? "Guardando…" : "Guardar plantilla"}
          </button>
        </div>
      </form>
    </div>
  );
};

const NotificationTemplatesView = ({ tenants = [] }: { tenants?: TenantOption[] }) => {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [summary, setSummary] = useState({ total: 0, platform: 0, business: 0, enabled: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("all");
  const [category, setCategory] = useState("all");
  const [tenantID, setTenantID] = useState("all");
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await api.get("/platform/notification-templates");
      setTemplates(Array.isArray(payload?.items) ? payload.items : []);
      setSummary(payload?.summary || { total: 0, platform: 0, business: 0, enabled: 0 });
    } catch (cause: any) {
      setError(cause?.message || "No se pudieron cargar las plantillas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return templates.filter((template) => {
      if (scope !== "all" && template.scope !== scope) return false;
      if (category !== "all" && template.category !== category) return false;
      if (tenantID !== "all" && template.tenant_id !== tenantID) return false;
      if (!needle) return true;
      return [template.name, template.event_key, template.body, template.tenant_name, categoryLabel(template.category)]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [category, scope, search, templates, tenantID]);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const remove = async (template: NotificationTemplate) => {
    if (!window.confirm(`¿Eliminar la plantilla “${template.name}”?`)) return;
    try {
      await api.delete(`/platform/notification-templates/${template.id}`);
      await load();
    } catch (cause: any) {
      setError(cause?.message || "No se pudo eliminar la plantilla");
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#00a884]">Mensajería de plataforma</p>
            <h2 className="mt-1 text-xl font-black text-gray-900">Plantillas de notificaciones</h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-400">
              Administra los mensajes de WhatsApp de WAMERCIO y las personalizaciones específicas de cada negocio.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 text-xs font-black text-gray-600 hover:bg-gray-200 disabled:opacity-60"
            >
              <FiRefreshCw className={loading ? "animate-spin" : ""} /> Actualizar
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#00a884] px-5 text-xs font-black text-white shadow-md shadow-[#00a884]/20 hover:bg-[#008f72]"
            >
              <FiPlus /> Nueva plantilla
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          <FiAlertCircle /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Plantillas", value: summary.total, icon: FiBell },
          { label: "De plataforma", value: summary.platform, icon: FiShield },
          { label: "Por negocio", value: summary.business, icon: FiUsers },
          { label: "Activas", value: summary.enabled, icon: FiCheckCircle },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{item.label}</p>
                  <p className="mt-1 text-2xl font-black text-gray-900">{item.value || 0}</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e9fbf5] text-[#00a884]">
                  <Icon />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_190px_220px]">
            <label className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nombre, evento o contenido…"
                className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 text-xs font-bold text-gray-700 outline-none focus:border-[#00a884] focus:bg-white"
              />
            </label>
            <label className="relative">
              <FiFilter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                className="h-11 w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 text-xs font-black text-gray-600 outline-none focus:border-[#00a884]"
              >
                <option value="all">Todos los alcances</option>
                <option value="platform">Plataforma</option>
                <option value="business">Negocio</option>
              </select>
            </label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-black text-gray-600 outline-none focus:border-[#00a884]"
            >
              <option value="all">Todas las categorías</option>
              {categoryOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <select
              value={tenantID}
              onChange={(event) => setTenantID(event.target.value)}
              className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-black text-gray-600 outline-none focus:border-[#00a884]"
            >
              <option value="all">Todos los negocios</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.slug || tenant.id}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center text-sm font-bold text-gray-400">
            <FiRefreshCw className="mr-2 animate-spin" /> Cargando plantillas…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-xl text-gray-400">
              <FiMessageCircle />
            </span>
            <h3 className="mt-4 text-base font-black text-gray-800">Sin plantillas para mostrar</h3>
            <p className="mt-1 max-w-md text-xs text-gray-400">Ajusta los filtros o crea una plantilla para un nuevo evento del sistema.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-4 2xl:grid-cols-2">
            {filtered.map((template) => (
              <article key={template.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 transition hover:border-[#00a884]/25 hover:bg-white hover:shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${template.scope === "platform" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>
                        {template.scope === "platform" ? "Plataforma" : "Negocio"}
                      </span>
                      <span className="rounded-full bg-[#e9fbf5] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#008f72]">
                        {categoryLabel(template.category)}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${template.enabled ? "bg-emerald-50 text-emerald-700" : "bg-gray-200 text-gray-500"}`}>
                        {template.enabled ? "Activa" : "Inactiva"}
                      </span>
                    </div>
                    <h3 className="mt-3 truncate text-base font-black text-gray-900">{template.name}</h3>
                    <p className="mt-1 font-mono text-[10px] font-bold text-gray-400">{template.event_key}</p>
                    {template.tenant_name && (
                      <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-purple-700"><FiUsers /> {template.tenant_name}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => { setEditing(template); setModalOpen(true); }}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100"
                      aria-label="Editar plantilla"
                    >
                      <FiEdit3 />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(template)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100"
                      aria-label="Eliminar plantilla"
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
                <div className="mt-4 rounded-xl border border-gray-100 bg-white px-3 py-3 text-xs leading-relaxed text-gray-600">
                  <p className="line-clamp-3 whitespace-pre-wrap">{template.body}</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-400">
                  <span className="flex items-center gap-1.5 font-bold"><FiSend /> WhatsApp</span>
                  <span>{formatDate(template.updated_at)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <TemplateModal
          template={editing}
          tenants={tenants}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={load}
        />
      )}
    </section>
  );
};

export default NotificationTemplatesView;
