import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import * as FiIcons from "react-icons/fi";
import { api, getPlatformHashUrl, getRootDomain } from "@/lib/api";
import { catalogImageCandidates } from "@/lib/catalogImages";
import { filterCatalogProducts } from "@/lib/catalogFilters";
import { useLocation, useNavigate } from "@/lib/navigation";
import LoadingScreen from "@/components/LoadingScreen";
import TerritoryAddressForm from "@/components/TerritoryAddressForm";
import PhoneInput from "@/components/PhoneInput";
import PinInput from "@/components/PinInput";
import BarcodeScanner, { isBarcodeQuery } from "@/components/BarcodeScanner";
import { formatDominicanId, isValidDominicanId } from "@/lib/nationalId";
import { setCachedAccessPolicy, useAccessPolicy } from "@/lib/accessPolicy";
import { saveRecoveryContext } from "@/lib/recoveryContext";
import { verifyPlatformIdentity, type IdentitySubjectType } from "@/lib/identity";
import { normalizePersonName } from "@/lib/personNames";
import UserAvatar from "../common/UserAvatar";
import PlatformProfile from "./PlatformProfile";
import PlatformUsers from "./PlatformUsers";
import NotificationTemplatesView from "./settings/NotificationTemplatesView";

const {
  FiActivity,
  FiAlertCircle,
  FiArchive,
  FiBookOpen,
  FiArrowRight,
  FiCheckCircle,
  FiCamera,
  FiClock,
  FiCopy,
  FiCreditCard,
  FiDatabase,
  FiEdit3,
  FiExternalLink,
  FiFileText,
  FiGlobe,
  FiGrid,
  FiHash,
  FiHome,
  FiImage,
  FiKey,
  FiLayers,
  FiLink,
  FiLock,
  FiLogOut,
  FiMapPin,
  FiMessageCircle,
  FiBell,
  FiMonitor,
  FiPlus,
  FiChevronDown,
  FiEye,
  FiRefreshCw,
  FiSave,
  FiSearch,
  FiSettings,
  FiShield,
  FiSmartphone,
  FiTrash2,
  FiTrendingUp,
  FiUserCheck,
  FiUsers,
  FiWifi,
  FiX,
  FiZap,
} = FiIcons;

const DEFAULT_PLATFORM_USERNAME =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_USERNAME || "superadmin";

const normalizePlatformUser = (user: any) => {
  if (user && typeof user === "object") {
    return {
      ...user,
      username: String(user.username || DEFAULT_PLATFORM_USERNAME),
      first_name: String(user.first_name || user.name || ""),
      last_name: String(user.last_name || ""),
      avatar_url: String(
        user.avatar_url || user.profile_picture_url || user.profilePictureUrl || "",
      ),
      role: String(user.role || "superadmin"),
      permissions:
        user.permissions && typeof user.permissions === "object"
          ? user.permissions
          : {},
    };
  }
  return {
    username: String(user || DEFAULT_PLATFORM_USERNAME),
    first_name: "",
    last_name: "",
    avatar_url: "",
    role: "superadmin",
    permissions: {},
  };
};

const emptyTenantForm = {
  name: "",
  business_name: "",
  business_type_id: "",
  business_type_name: "",
  business_type_slug: "",
  rnc: "",
  legal_name: "",
  commercial_name: "",
  identity_confirmed: false,
  slug: "",
  domain: "",
  plan_slug: "starter",
  province: "",
  province_code: "",
  municipality: "",
  municipality_code: "",
  district_code: "",
  neighborhood: "",
  neighborhood_id: "",
  street: "",
  street_number: "",
  address: "",
  latitude: "",
  longitude: "",
  locationAccuracy: null,
  location_accuracy: null,
  locationSource: "",
  location_source: "",
  locationUpdatedAt: null,
  location_updated_at: null,
  owner_id: "",
  owner_name: "",
  owner_whatsapp: "",
};

const emptyPlanForm = {
  slug: "",
  name: "",
  description: "",
  price_monthly: "0",
  products: "1000",
  users: "10",
  stores: "1",
  active: true,
};

const planFormFromPlan = (plan: any = null) => {
  const limits = plan?.limits && typeof plan.limits === "object" ? plan.limits : {};
  return {
    slug: String(plan?.slug || ""),
    name: String(plan?.name || ""),
    description: String(plan?.description || ""),
    price_monthly: String(plan?.price_monthly ?? "0"),
    products: String(limits.products ?? "1000"),
    users: String(limits.users ?? "10"),
    stores: String(limits.stores ?? "1"),
    active: plan?.active !== false,
  };
};

const emptyOwnerForm = {
  first_name: "",
  last_name: "",
  name: "",
  whatsapp: "",
  national_id: "",
  birth_date: "",
  gender: "",
  province: "",
  municipality: "",
  neighborhood: "",
  status: "active",
  pin: "",
  identity_confirmed: false,
};

const statusLabels = {
  active: "Activo",
  trial: "Prueba",
  suspended: "Suspendido",
  disabled: "Deshabilitado",
  provisioning: "Provisionando",
};

const subscriptionLabels = {
  active: "Activa",
  trial: "Prueba",
  past_due: "Vencida",
  cancelled: "Cancelada",
  paused: "Pausada",
};

const statusStyles = {
  active: "bg-[#00a884]/10 text-[#008f72]",
  trial: "bg-blue-50 text-blue-700",
  suspended: "bg-amber-50 text-amber-700",
  disabled: "bg-red-50 text-red-700",
  provisioning: "bg-purple-50 text-purple-700",
  past_due: "bg-red-50 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
  paused: "bg-amber-50 text-amber-700",
};

const tabPaths = {
  dashboard: "/superadmin",
  landing: "/superadmin/landing",
  owners: "/superadmin/businesses/owners",
  plans: "/superadmin/plans",
  customers: "/superadmin/global-customers",
  catalog: "/superadmin/catalog",
  users: "/superadmin/users",
  profile: "/superadmin/profile",
  settings: "/superadmin/settings",
};

const ownerSectionPaths = {
  tenants: "/superadmin/businesses",
  owners: "/superadmin/businesses/owners",
};

const planSectionPaths = {
  plans: "/superadmin/plans",
  subscriptions: "/superadmin/plans/subscriptions",
};

const configTabPaths = {
  general: "/superadmin/settings",
  types: "/superadmin/settings/business-types",
  territory: "/superadmin/settings/territory",
  domains: "/superadmin/settings/domains",
  databases: "/superadmin/settings/databases",
  banks: "/superadmin/settings/banks",
  whatsapp: "/superadmin/settings/whatsapp",
  access: "/superadmin/settings/access",
  identity: "/superadmin/settings/identity",
  legal: "/superadmin/settings/legal",
  notifications: "/superadmin/settings/notifications",
  backups: "/superadmin/settings/backups",
  audit: "/superadmin/settings/audit",
};

const pathTabs = Object.fromEntries(
  Object.entries(tabPaths).map(([key, path]) => [path, key]),
);
Object.keys(ownerSectionPaths).forEach((key) => {
  pathTabs[ownerSectionPaths[key]] = "owners";
});
Object.keys(planSectionPaths).forEach((key) => {
  pathTabs[planSectionPaths[key]] = "plans";
});
Object.keys(configTabPaths).forEach((key) => {
  pathTabs[configTabPaths[key]] = "settings";
});

const cleanPath = (pathname = "/superadmin") =>
  String(pathname || "/superadmin").replace(/\/+$/, "") || "/superadmin";

const tabFromPath = (pathname = "/superadmin") => {
  const clean = cleanPath(pathname);
  if (clean.startsWith("/superadmin/landing")) return "landing";
  if (clean.startsWith("/superadmin/businesses")) return "owners";
  if (clean.startsWith("/superadmin/plans")) return "plans";
  if (clean.startsWith("/superadmin/catalog")) return "catalog";
  if (clean.startsWith("/superadmin/users")) return "users";
  if (clean.startsWith("/superadmin/profile")) return "profile";
  if (clean.startsWith("/superadmin/settings/")) return "settings";
  return pathTabs[clean] || "dashboard";
};

const ownerSectionFromPath = (pathname = "/superadmin/businesses/owners") => {
  const clean = cleanPath(pathname);
  if (clean === ownerSectionPaths.tenants) return "tenants";
  if (clean === ownerSectionPaths.owners) return "owners";
  return "owners";
};

const planSectionFromPath = (pathname = "/superadmin/plans") => {
  const clean = cleanPath(pathname);
  if (clean === planSectionPaths.subscriptions) return "subscriptions";
  return "plans";
};

const configTabFromPath = (pathname = "/superadmin/settings") => {
  const clean = cleanPath(pathname);
  if (clean === configTabPaths.types) return "types";
  if (clean === configTabPaths.territory) return "territory";
  if (clean === configTabPaths.domains) return "domains";
  if (clean === configTabPaths.databases) return "databases";
  if (clean === configTabPaths.banks) return "banks";
  // Keep the former WAXUM URL working, but render the unified WhatsApp section.
  if (clean === "/superadmin/settings/waxum") return "whatsapp";
  if (clean === configTabPaths.whatsapp) return "whatsapp";
  if (clean === configTabPaths.access) return "access";
  if (clean === configTabPaths.identity) return "identity";
  if (clean === configTabPaths.legal) return "legal";
  if (clean === configTabPaths.notifications) return "notifications";
  if (clean === configTabPaths.backups) return "backups";
  if (clean === configTabPaths.audit) return "audit";
  return "general";
};

const pathForTab = (tab) => {
  if (tab === "tenants") return ownerSectionPaths.tenants;
  if (tab === "subscriptions") return planSectionPaths.subscriptions;
  return tabPaths[tab] || "/superadmin";
};
const pathForOwnerSection = (section) =>
  ownerSectionPaths[section] || ownerSectionPaths.owners;
const pathForPlanSection = (section) =>
  planSectionPaths[section] || planSectionPaths.plans;
const pathForConfigTab = (section) =>
  configTabPaths[section] || configTabPaths.general;

const configurationNavigationGroups = [
  {
    label: "Plataforma",
    items: [
      { key: "general", label: "General", hint: "Ajustes globales", icon: FiSettings },
    ],
  },
  {
    label: "Estructura SaaS",
    items: [
      { key: "territory", label: "Territorio", hint: "División territorial", icon: FiMapPin },
      { key: "types", label: "Tipos de negocio", hint: "Clasificación y dominios", icon: FiHome },
      { key: "domains", label: "Dominios", hint: "Subdominios y dominios propios", icon: FiGlobe },
      { key: "databases", label: "Bases de datos", hint: "PostgreSQL por negocio", icon: FiDatabase },
      { key: "banks", label: "Bancos", hint: "Catálogo bancario", icon: FiCreditCard },
    ],
  },
  {
    label: "Comunicaciones",
    items: [
      { key: "whatsapp", label: "WhatsApp", hint: "Proveedor y sesión global", icon: FiSmartphone },
      { key: "notifications", label: "Notificaciones", hint: "Plantillas de mensajes", icon: FiBell },
    ],
  },
  {
    label: "Seguridad y cumplimiento",
    items: [
      { key: "access", label: "Acceso", hint: "PIN y recuperación", icon: FiKey },
      { key: "identity", label: "Identidad", hint: "Cédulas, RNC y límites", icon: FiUserCheck },
      { key: "legal", label: "Legal", hint: "Términos y privacidad", icon: FiBookOpen },
      { key: "backups", label: "Backups", hint: "Contabo y Cloudflare R2", icon: FiArchive },
      { key: "audit", label: "Auditoría", hint: "Historial de acciones", icon: FiFileText, auditOnly: true },
    ],
  },
];

const configurationItems = configurationNavigationGroups.flatMap((group) => group.items);

const normalizeSlug = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

const compactSlug = (value) => normalizeSlug(value).replace(/-/g, "");

const initialsFromWords = (value) =>
  normalizeSlug(value)
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0))
    .join("");

const buildAutoTenantSlug = (form: any = {}) => {
  const finalName = buildBusinessDisplayName(
    form.business_type_name,
    form.business_name || form.name,
  );
  let base = compactSlug(finalName);
  const locationCode = compactSlug(
    [
      initialsFromWords(form.province),
      initialsFromWords(form.municipality),
      initialsFromWords(form.neighborhood),
    ].join(""),
  );
  if (!base) return "";
  if (!locationCode) return base.slice(0, 48);
  const maxBaseLength = Math.max(8, 48 - locationCode.length - 1);
  if (base.length > maxBaseLength) base = base.slice(0, maxBaseLength);
  return `${base}-${locationCode}`.slice(0, 48).replace(/-+$/, "");
};

const buildAutoTenantDomain = (form: any = {}, rootDomain = "") => {
  const slug = buildAutoTenantSlug(form);
  if (!slug) return "";
  return rootDomain ? `${slug}.${rootDomain}` : slug;
};

const inferRootDomain = () => {
  const configured = getRootDomain();
  if (configured) return configured;
  if (typeof window === "undefined") return "";
  const host = window.location.hostname || "";
  if (!host || host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host))
    return "";
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  return parts.slice(-2).join(".");
};

const tenantUrl = (tenant, path = "") => {
  if (!tenant?.domain) return "";
  const protocol =
    typeof window !== "undefined" ? window.location.protocol : "https:";
  return `${protocol}//${tenant.domain}${path}`;
};

const formatNumber = (value) => Number(value || 0).toLocaleString("es-DO");
const formatMoney = (value) =>
  `RD$ ${Number(value || 0).toLocaleString("es-DO")}`;
const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-DO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatDateOnly = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-DO");
};

const safeList = (value: any): any[] => (Array.isArray(value) ? value : []);

const normalizeFilterText = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const searchableSelectLabelClass =
  "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5";

const SearchableTerritorySelect = ({
  label = "",
  value = "",
  onChange,
  options = [],
  placeholder = "Selecciona una opción",
  allLabel = "",
  disabled = false,
  loading = false,
  icon: Icon = FiMapPin,
  inputClassName = "",
}: any) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const normalizedOptions = useMemo(() => {
    const list = safeList(options)
      .map((option: any) => ({
        ...option,
        value: String(
          option.value ??
            option.key ??
            option.code ??
            option.id ??
            option.identifier ??
            option.name ??
            "",
        ),
        label: String(
          option.label ??
            option.name ??
            option.value ??
            option.key ??
            option.code ??
            "",
        ),
      }))
      .filter((option: any) => option.label || option.value);
    return allLabel
      ? [{ value: "", label: allLabel, id: "__all__" }, ...list]
      : list;
  }, [options, allLabel]);

  const selected = normalizedOptions.find(
    (option: any) => String(option.value) === String(value || ""),
  );
  const selectedLabel = selected?.label || "";
  const search = normalizeFilterText(query);
  const filteredOptions = search
    ? normalizedOptions.filter((option: any) =>
        normalizeFilterText(`${option.label} ${option.value}`).includes(search),
      )
    : normalizedOptions;

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setQuery("");
    }
  }, [disabled]);

  const choose = (option: any) => {
    onChange?.(option.value);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={wrapperRef} className="relative min-w-0">
      {label && <label className={searchableSelectLabelClass}>{label}</label>}
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none z-10" />
        <input
          type="text"
          value={open ? query : selectedLabel}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
              setQuery("");
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
            if (event.key === "Enter" && filteredOptions.length > 0) {
              event.preventDefault();
              choose(filteredOptions[0]);
            }
          }}
          disabled={disabled}
          placeholder={loading ? "Cargando..." : placeholder}
          autoComplete="off"
          className={`${inputClassName || "w-full h-11 rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-10 text-sm font-bold text-gray-700 outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10 disabled:opacity-60 disabled:cursor-not-allowed transition-all"}`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none">
          ▾
        </span>
      </div>

      {open && !disabled && (
        <div className="absolute z-[9999] mt-2 w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-900/15">
          <div className="max-h-64 overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-gray-300">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option: any) => {
                const active = String(option.value) === String(value || "");
                return (
                  <button
                    key={
                      option.id ||
                      option.identifier ||
                      option.code ||
                      option.key ||
                      option.value ||
                      option.label
                    }
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(option)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                      active
                        ? "bg-[#00a884] text-white"
                        : "text-gray-700 hover:bg-[#f0fdf8] hover:text-[#00a884]"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-3 text-xs text-gray-400 font-medium">
                No hay coincidencias. Escribe otra búsqueda.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const tenantLocationLine = (tenant: any = {}) =>
  [tenant.neighborhood, tenant.municipality, tenant.province]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(", ");

const customerAddressLine = (customer: any = {}) =>
  [
    customer.province,
    customer.municipality,
    customer.sector || customer.neighborhood,
    customer.street
      ? `${customer.street}${customer.street_number ? ` #${customer.street_number}` : ""}`
      : "",
    customer.address_reference,
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(", ");

const customerMapQuery = (customer: any = {}) => {
  if (customer?.lat && customer?.lng) return `${customer.lat},${customer.lng}`;
  return customerAddressLine(customer);
};

const canOpenCustomerMap = (customer: any = {}) =>
  Boolean(customerMapQuery(customer));

const uniqueTenantLocationOptions = (
  tenants: any[] = [],
  field = "",
  filters: any = {},
) => {
  const seen = new Set();
  return safeList(tenants)
    .filter((tenant) => {
      if (
        field !== "province" &&
        filters.province &&
        normalizeFilterText(tenant.province) !==
          normalizeFilterText(filters.province)
      )
        return false;
      if (
        field === "neighborhood" &&
        filters.municipality &&
        normalizeFilterText(tenant.municipality) !==
          normalizeFilterText(filters.municipality)
      )
        return false;
      return true;
    })
    .map((tenant) => String(tenant?.[field] || "").trim())
    .filter(Boolean)
    .filter((value) => {
      const key = normalizeFilterText(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.localeCompare(b, "es"));
};

const tenantMatchesLocationFilters = (tenant: any = {}, filters: any = {}) => {
  if (
    filters.province &&
    normalizeFilterText(tenant.province) !==
      normalizeFilterText(filters.province)
  )
    return false;
  if (
    filters.municipality &&
    normalizeFilterText(tenant.municipality) !==
      normalizeFilterText(filters.municipality)
  )
    return false;
  if (
    filters.neighborhood &&
    normalizeFilterText(tenant.neighborhood) !==
      normalizeFilterText(filters.neighborhood)
  )
    return false;
  return true;
};

const onlyDigits = (value = "") => String(value || "").replace(/\D/g, "");

const normalizeWhatsapp = (value = "") => {
  let digits = onlyDigits(value).slice(0, 15);
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits;
};

const formatWhatsappLabel = (value = "") => {
  const digits = normalizeWhatsapp(value);
  if (!digits) return "—";
  if (digits.length === 10)
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
};

const normalizeUrlValue = (value = "") =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

const normalizeWaxumPublicUrl = (value = "") => {
  const clean = normalizeUrlValue(value);
  if (!clean) return "";
  const normalized = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
  return normalized.replace(
    /\/(?:dashboard|swagger-ui(?:\/index\.html)?|api-docs\/openapi\.json)\/?$/i,
    "",
  );
};

const buildWaxumDashboardUrl = (publicUrl = "") =>
  normalizeWaxumPublicUrl(publicUrl);

const buildWaxumDocsUrl = (publicUrl = "") => {
  const baseUrl = normalizeWaxumPublicUrl(publicUrl);
  return baseUrl ? `${baseUrl}/swagger-ui/` : "";
};

const waxumConfigIsReady = (raw: any = {}) =>
  Boolean(
    raw?.ready === true ||
      (raw?.enabled !== false &&
        String(raw?.public_url || "").trim() &&
        (String(raw?.admin_token || "").trim() ||
          raw?.admin_token_configured === true)),
  );

const waxumInitialConfig = (settings: any = {}) => {
  const raw =
    settings?.waxum && typeof settings.waxum === "object"
      ? settings.waxum
      : {};
  const rawPublicUrl = raw.public_url || "";
  const rawDashboardUrl = raw.dashboard_url || "";
  const publicUrlFromDashboard = String(rawDashboardUrl || "").replace(
    /\/dashboard\/?$/i,
    "",
  );
  const publicUrl = normalizeWaxumPublicUrl(
    rawPublicUrl || publicUrlFromDashboard,
  );
  const adminToken = String(raw.admin_token || "");
  const enabled = raw.enabled !== false;
  return {
    enabled,
    public_url: publicUrl,
    dashboard_url: buildWaxumDashboardUrl(publicUrl),
    docs_url: buildWaxumDocsUrl(publicUrl),
    admin_token: adminToken,
    admin_token_configured: Boolean(raw.admin_token_configured || adminToken),
    ready: waxumConfigIsReady({
      ...raw,
      enabled,
      public_url: publicUrl,
      admin_token: adminToken,
    }),
  };
};

const whatsappInitialConfig = (settings: any = {}) => {
  const raw =
    settings?.whatsapp_platform &&
    typeof settings.whatsapp_platform === "object"
      ? settings.whatsapp_platform
      : {};
  return {
    enabled: raw.enabled !== false,
    session_id: String(raw.session_id || raw.sessionId || "WAMERCIO"),
    session_name: "WAMERCIO",
    status: String(raw.status || "pending"),
    connected: Boolean(raw.connected),
    logged_in: Boolean(raw.logged_in || raw.loggedIn),
    jid: String(raw.jid || ""),
    phone: String(raw.phone || ""),
    last_pairing_phone: String(
      raw.last_pairing_phone || raw.lastPairingPhone || "",
    ),
    profile_name: String(
      raw.profile_name ||
        raw.profileName ||
        raw.display_name ||
        raw.displayName ||
        "",
    ),
    profile_picture_url: String(
      raw.profile_picture_url ||
        raw.profilePictureUrl ||
        raw.profile_picture ||
        raw.profilePicture ||
        raw.avatar_url ||
        raw.avatarUrl ||
        "",
    ),
    updated_at: String(raw.updated_at || raw.updatedAt || ""),
  };
};

const whatsappStatusLabel = (state: any = {}) => {
  if (state.logged_in) return "WhatsApp vinculado";
  if (state.connected) return "Conectado, pendiente de vincular";
  if (state.session_id) return "Sesión creada";
  return "Sin sesión";
};

const whatsappStatusClass = (state: any = {}) => {
  if (state.logged_in) return "bg-[#00a884]/10 text-[#008f72]";
  if (state.connected) return "bg-blue-50 text-blue-700";
  if (state.session_id) return "bg-amber-50 text-amber-700";
  return "bg-gray-100 text-gray-500";
};

const normalizePairingPhone = (value = "") => {
  let digits = onlyDigits(value).slice(0, 15);
  if (digits.length === 10) digits = `1${digits}`;
  return digits;
};

const formatPairingCode = (value = "") =>
  String(value || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .replace(/(.{4})/g, "$1 ")
    .trim() || "—";

const qrImageSource = (value = "") => {
  const clean = String(value || "").trim();
  if (!clean) return "";
  if (/^(data:image|https?:\/\/)/i.test(clean)) return clean;
  if (/^[A-Za-z0-9+/=]+$/.test(clean) && clean.length > 80)
    return `data:image/png;base64,${clean}`;
  if (clean.length > 8)
    return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(clean)}`;
  return "";
};

const whatsappPayloadWasAutoUnlinked = (payload: any = {}) =>
  Boolean(payload?.auto_unlinked || payload?.autoUnlinked);

const responseKey = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");

const parseMaybeJSON = (value = ""): any => {
  const text = String(value || "").trim();
  if (!text || !/^[{[]/.test(text)) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
};

const findResponseText = (value: any, keys: string[] = []): string => {
  const lookup = new Set(keys.map(responseKey));
  const seen = new WeakSet<object>();

  const extractMatchedValue = (item: any): string => {
    if (item == null) return "";
    if (typeof item === "string") {
      const nested = parseMaybeJSON(item);
      if (nested) {
        const found = walk(nested, false);
        if (found) return found;
      }
      return item.trim();
    }
    if (typeof item === "number") return String(item).trim();
    if (Array.isArray(item)) {
      for (const entry of item) {
        const found = extractMatchedValue(entry);
        if (found) return found;
      }
      return "";
    }
    if (typeof item === "object") return walk(item, false);
    return "";
  };

  const walk = (item: any, allowDirectScalar = true): string => {
    if (item == null) return "";
    if (typeof item === "string" || typeof item === "number") {
      if (!allowDirectScalar) return "";
      return extractMatchedValue(item);
    }
    if (Array.isArray(item)) {
      for (const entry of item) {
        const found = walk(entry, false);
        if (found) return found;
      }
      return "";
    }
    if (typeof item === "object") {
      if (seen.has(item)) return "";
      seen.add(item);
      for (const [key, entry] of Object.entries(item)) {
        if (lookup.has(responseKey(key))) {
          const found = extractMatchedValue(entry);
          if (
            found &&
            !["true", "false", "200", "201"].includes(found.toLowerCase())
          )
            return found;
        }
      }
      for (const [key, entry] of Object.entries(item)) {
        const normalized = responseKey(key);
        if (["code", "success", "status", "phone"].includes(normalized))
          continue;
        const found = walk(entry, false);
        if (found) return found;
      }
    }
    return "";
  };

  return walk(value, true);
};

const pairingCodeFromResponse = (payload: any = {}) =>
  findResponseText(payload, [
    "linking_code",
    "LinkingCode",
    "linkingCode",
    "pairing_code",
    "PairingCode",
    "pairingCode",
    "pair_code",
    "PairCode",
  ]);

const qrCodeFromResponse = (payload: any = {}) =>
  findResponseText(payload, [
    "qr_code",
    "QRCode",
    "qrCode",
    "qrcode",
    "qr",
    "qr_image",
    "qrImage",
    "QRCodeImage",
    "qrcode_image",
    "image",
    "base64",
  ]);

const phoneFromWhatsAppJid = (value = "") => {
  const clean = String(value || "").trim();
  if (!clean) return "";
  const main = clean.split("@")[0]?.split(":")[0] || clean;
  return onlyDigits(main);
};

const whatsappLinkedPhone = (state: any = {}, fallback = "") => {
  const phone = onlyDigits(
    state.phone ||
      phoneFromWhatsAppJid(state.jid) ||
      state.last_pairing_phone ||
      fallback,
  );
  if (!phone) return "Número no disponible";
  return phone.startsWith("1") && phone.length === 11 ? `+${phone}` : phone;
};

const whatsappLinkedName = (state: any = {}) =>
  String(
    state.profile_name ||
      state.profileName ||
      state.display_name ||
      state.displayName ||
      state.session_name ||
      state.sessionName ||
      "WhatsApp de WAMERCIO",
  );
const whatsappLinkedImage = (state: any = {}) =>
  String(
    state.profile_picture_url ||
      state.profilePictureUrl ||
      state.profile_picture ||
      state.profilePicture ||
      state.avatar_url ||
      state.avatarUrl ||
      "",
  );

const maskSecret = (value = "") => {
  const text = String(value || "");
  if (!text) return "Sin configurar";
  if (text.length <= 8) return "••••••••";
  return `${text.slice(0, 4)}••••••••••••${text.slice(-4)}`;
};

const normalizeNationalIdValue = (value = "") => formatDominicanId(value || "");
const nationalIdIsComplete = (value = "") => onlyDigits(value).length === 11;
const nationalIdIsInvalid = (value = "") =>
  Boolean(
    onlyDigits(value).length > 0 &&
    nationalIdIsComplete(value) &&
    !isValidDominicanId(value),
  );

const Badge = ({ value, labels = statusLabels }: any) => (
  <span
    className={`text-[10px] font-black px-2 py-1 rounded-full ${statusStyles[value] || "bg-gray-100 text-gray-600"}`}
  >
    {labels[value] || value || "—"}
  </span>
);

const IconButton = ({
  children = null,
  title,
  onClick = undefined,
  className = "",
  disabled = false,
}: any) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    disabled={disabled}
    className={`w-10 h-10 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200 disabled:opacity-50 ${className}`}
  >
    {children}
  </button>
);

const StatCard = ({
  icon: Icon,
  title,
  value,
  hint,
  accent = "green",
  delay = 0,
}: any) => {
  const classes =
    accent === "dark"
      ? "bg-[#1a2332] text-white border-[#1a2332]"
      : "bg-white text-gray-900 border-gray-100";
  const iconClass =
    accent === "dark"
      ? "bg-white/10 text-white"
      : "bg-[#00a884]/10 text-[#00a884]";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`${classes} rounded-2xl border p-5 shadow-sm min-w-0`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}
        >
          <Icon className="text-lg" />
        </div>
        <div className="min-w-0">
          <p
            className={`text-[11px] font-black uppercase tracking-widest ${accent === "dark" ? "text-white/55" : "text-gray-400"}`}
          >
            {title}
          </p>
          <p className="text-2xl font-black truncate">{value}</p>
        </div>
      </div>
      {hint && (
        <p
          className={`mt-3 text-xs ${accent === "dark" ? "text-white/55" : "text-gray-400"}`}
        >
          {hint}
        </p>
      )}
    </motion.div>
  );
};

const ModalShell = ({ children, onClose, width = "max-w-5xl" }: any) => (
  <div className="fixed inset-0 z-[70] bg-[#0f172a]/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
    <button
      type="button"
      aria-label="Cerrar"
      className="absolute inset-0 cursor-default"
      onClick={onClose}
    />
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 18 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 18 }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className={`relative w-full ${width} bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col`}
    >
      {children}
    </motion.div>
  </div>
);

const PlatformLogin = ({ onSuccess }: any) => {
  const accessPolicy = useAccessPolicy();
  const [username, setUsername] = useState(
    () =>
      (typeof window !== "undefined" ? api.getPlatformUser() : "") ||
      DEFAULT_PLATFORM_USERNAME,
  );
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const usernameWhatsapp = normalizeWhatsapp(username);
  const usesWhatsappPIN = usernameWhatsapp.length === 10;

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await api.post("/platform/login", {
        username,
        password: usesWhatsappPIN ? password.replace(/\D/g, "").slice(0, accessPolicy.maxAdminPinLength) : password,
      });
      api.setPlatformToken(response.token);
      const authenticatedUser = normalizePlatformUser(
        response.user || { username },
      );
      api.setPlatformUser(authenticatedUser.username);
      onSuccess?.(authenticatedUser);
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0f1a28] flex">
      <div className="hidden lg:flex flex-col justify-between w-[42%] bg-gradient-to-br from-[#00a884] via-[#007a60] to-[#004d3d] p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-80 h-80 bg-white rounded-full translate-x-1/3 translate-y-1/3" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-12">
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/30 overflow-hidden p-0.5">
              <img
                src="/brand/colmapro-app-icon.png"
                alt="WAMERCIO"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h1 className="text-white font-black text-2xl leading-none">
                WAMERCIO
              </h1>
              <p className="text-white/60 text-sm font-medium">
                Plataforma SaaS
              </p>
            </div>
          </div>
          <div className="space-y-6">
            <h2 className="text-white font-black text-4xl leading-tight">
              Acceso de superadministración
            </h2>
            <p className="text-white/70 text-base leading-relaxed">
              Gestiona negocios, propietarios, planes, dominios, suscripciones,
              bases de datos, clientes globales, auditoría y configuración
              central.
            </p>
          </div>
        </div>
        <div className="relative z-10 space-y-3 text-white/80 text-sm">
          <div>🌐 Subdominio comodín para cada negocio</div>
          <div>🗄️ Base de datos separada por negocio</div>
          <div>🔐 Control protegido de plataforma SaaS</div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-16">
        <form
          onSubmit={submit}
          className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-7 lg:p-9"
        >
          <div className="mb-7">
            <div className="w-14 h-14 rounded-2xl bg-[#00a884]/10 flex items-center justify-center mb-4 overflow-hidden p-0.5">
              <img
                src="/brand/colmapro-app-icon.png"
                alt="WAMERCIO"
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-2xl font-black text-gray-900">
              Panel de superadministración
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              La cuenta raíz puede usar sus credenciales de instalación. Los demás superadministradores pueden ingresar con su WhatsApp y PIN.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          <label className="block mb-4">
            <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
              Usuario o WhatsApp de superadministración
            </span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
              placeholder="Usuario o WhatsApp"
              autoComplete="username"
            />
          </label>

          <div className="mb-6">
            {usesWhatsappPIN ? (
              <>
                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
                  <PinInput
                    value={password}
                    onChange={setPassword}
                    length={accessPolicy.adminPinLength}
                    inputMaxLength={accessPolicy.maxAdminPinLength}
                    label={`PIN de ${accessPolicy.adminPinLength} dígitos *`}
                    autoComplete="current-password"
                    name="platform_pin"
                  />
                </div>
                {accessPolicy.recoveryEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      saveRecoveryContext({ whatsapp: usernameWhatsapp, subjectType: "platform", accountLabel: "Usuario SaaS" });
                      window.location.hash = "#/recover-account";
                    }}
                    className="mt-3 w-full text-center text-xs font-black text-[#00a884] hover:underline"
                  >
                    ¿Olvidaste tu PIN?
                  </button>
                )}
              </>
            ) : (
              <label className="block">
                <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                  Contraseña de instalación
                </span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
                  placeholder="••••••••••••"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-[#00a884] hover:bg-[#008f72] disabled:opacity-70 text-white font-black py-4 shadow-lg shadow-[#00a884]/20 transition-colors"
          >
            {loading ? "Validando..." : "Entrar al panel central"}
          </button>

          <p className="text-[11px] leading-relaxed text-gray-400 mt-5 text-center">
            Puedes ver las credenciales en el servidor con
            CREDENCIALES_SUPERADMIN.txt o show-credentials.sh.
          </p>
        </form>
      </div>
    </div>
  );
};

const buildBusinessDisplayName = (typeName = "", businessName = "") => {
  const type = String(typeName || "").trim();
  const name = String(businessName || "").trim();
  if (!type) return name;
  if (!name) return type;
  if (name.toLowerCase().startsWith(type.toLowerCase())) return name;
  return `${type} ${name}`.replace(/\s+/g, " ").trim();
};

const buildAddressLine = (form: any = {}) => {
  const line1 = [
    String(form.street || "").trim(),
    String(form.street_number || "").trim()
      ? `#${String(form.street_number || "").trim()}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  return [line1, form.neighborhood, form.municipality, form.province]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(", ");
};

const TenantForm = ({
  plans,
  owners = [],
  businessTypes = [],
  onCreated,
  onCancel,
}: any) => {
  const [form, setForm] = useState(() => ({ ...emptyTenantForm }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [businessIdentityCheck, setBusinessIdentityCheck] = useState({
    document: "",
    status: "idle",
    message: "",
    source: "",
    requestId: "",
    requiresConfirmation: false,
  });
  const rootDomain = useMemo(inferRootDomain, []);
  const activeOwners = useMemo(
    () => safeList(owners).filter((owner) => owner.status !== "disabled"),
    [owners],
  );
  const activeBusinessTypes = useMemo(
    () => safeList(businessTypes).filter((item) => item.active !== false),
    [businessTypes],
  );

  const verifyBusinessRNC = async (values = form) => {
    const digits = onlyDigits(values.rnc);
    if (digits.length !== 9 && digits.length !== 11) {
      setBusinessIdentityCheck({
        document: digits,
        status: "invalid",
        message: "El RNC debe contener 9 u 11 dígitos.",
        source: "",
        requestId: "",
        requiresConfirmation: false,
      });
      return { ok: false, requiresConfirmation: false, updates: {} };
    }
    setBusinessIdentityCheck({
      document: digits,
      status: "checking",
      message: "Consultando Identidad",
      source: "",
      requestId: "",
      requiresConfirmation: false,
    });
    try {
      const response = await verifyPlatformIdentity({
        tipo_sujeto: "empresa",
        documento: digits,
        contexto: "registro_colmado",
      });
      if (response?.manual_allowed) {
        setBusinessIdentityCheck({
          document: digits,
          status: "manual",
          message:
            response?.error?.message ||
            "La verificación no está disponible; el negocio quedará pendiente de revisión manual.",
          source: "",
          requestId: response?.error?.request_id || "",
          requiresConfirmation: false,
        });
        const updates = { rnc: digits, identity_confirmed: false };
        setForm((current) => ({ ...current, ...updates }));
        return { ok: true, requiresConfirmation: false, updates };
      }
      const result = response?.data;
      if (
        !response?.success ||
        !result?.valida ||
        !result?.encontrada ||
        !result?.puede_registrarse ||
        !result?.empresa
      ) {
        setBusinessIdentityCheck({
          document: digits,
          status: "invalid",
          message:
            result?.motivo ||
            response?.error?.message ||
            "El RNC no cumple las condiciones para registrar el negocio.",
          source: result?.fuente || "",
          requestId: response?.meta?.request_id || "",
          requiresConfirmation: Boolean(result?.requiere_confirmacion),
        });
        return { ok: false, requiresConfirmation: false, updates: {} };
      }
      const requiresConfirmation = Boolean(result.requiere_confirmacion);
      const updates = {
        rnc: result.empresa?.rnc || digits,
        legal_name:
          result.puede_autocompletar && result.empresa?.razon_social
            ? result.empresa.razon_social
            : values.legal_name,
        commercial_name:
          result.puede_autocompletar && result.empresa?.nombre_comercial
            ? result.empresa.nombre_comercial
            : values.commercial_name,
        business_name:
          !String(values.business_name || "").trim() &&
          result.puede_autocompletar &&
          result.empresa?.nombre_comercial
            ? result.empresa.nombre_comercial
            : values.business_name,
        identity_confirmed: !requiresConfirmation,
      };
      setForm((current) => ({ ...current, ...updates }));
      setBusinessIdentityCheck({
        document: digits,
        status: "verified",
        message: requiresConfirmation
          ? "Revisa y confirma los datos fiscales devueltos."
          : "La información fiscal fue validada correctamente.",
        source: result.fuente || response?.meta?.provider || "Identidad API",
        requestId: response?.meta?.request_id || "",
        requiresConfirmation,
      });
      return { ok: true, requiresConfirmation, updates };
    } catch (err) {
      setBusinessIdentityCheck({
        document: digits,
        status: "invalid",
        message: err?.message || "No se pudo verificar el RNC.",
        source: "",
        requestId: "",
        requiresConfirmation: false,
      });
      return { ok: false, requiresConfirmation: false, updates: {} };
    }
  };

  const update = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "business_type_id") {
        const type = activeBusinessTypes.find((item) => item.id === value);
        next.business_type_id = value;
        next.business_type_name = type?.name || "";
        next.business_type_slug = type?.slug || "";
        next.name = buildBusinessDisplayName(
          type?.name || "",
          prev.business_name || prev.name,
        );
      }
      if (key === "business_name" || key === "name") {
        const businessName = String(value || "");
        next.business_name = businessName;
        next.name = buildBusinessDisplayName(
          prev.business_type_name,
          businessName,
        );
      }
      if (key === "owner_id") {
        const owner = activeOwners.find((item) => item.id === value);
        next.owner_id = value;
        next.owner_name = owner?.name || "";
        next.owner_whatsapp = normalizeWhatsapp(owner?.whatsapp || "");
      }
      return next;
    });
  };

  const generatedSlug = useMemo(
    () => buildAutoTenantSlug(form),
    [
      form.business_type_name,
      form.business_name,
      form.name,
      form.province,
      form.municipality,
      form.neighborhood,
    ],
  );
  const generatedDomain = useMemo(
    () => buildAutoTenantDomain(form, rootDomain),
    [generatedSlug, rootDomain],
  );

  useEffect(() => {
    setForm((prev) => {
      const slug = buildAutoTenantSlug(prev);
      const domain = slug && rootDomain ? `${slug}.${rootDomain}` : slug;
      if (prev.slug === slug && prev.domain === domain) return prev;
      return { ...prev, slug, domain };
    });
  }, [
    rootDomain,
    form.business_type_name,
    form.business_name,
    form.name,
    form.province,
    form.municipality,
    form.neighborhood,
  ]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    let submissionForm = { ...form };
    if (!submissionForm.business_type_id) {
      setError("Selecciona el nombre/prefijo del negocio.");
      return;
    }
    if (!String(submissionForm.business_name || "").trim()) {
      setError("Completa el nombre del negocio.");
      return;
    }
    const rncDigits = onlyDigits(submissionForm.rnc);
    if (rncDigits) {
      const identityCurrent =
        businessIdentityCheck.document === rncDigits &&
        (businessIdentityCheck.status === "verified" ||
          businessIdentityCheck.status === "manual");
      let requiresConfirmation = businessIdentityCheck.requiresConfirmation;
      if (!identityCurrent) {
        const verification = await verifyBusinessRNC(submissionForm);
        if (!verification.ok) {
          setError("Verifica correctamente el RNC antes de continuar.");
          return;
        }
        submissionForm = {
          ...submissionForm,
          ...(verification.updates || {}),
        };
        requiresConfirmation = verification.requiresConfirmation;
      }
      if (requiresConfirmation && !submissionForm.identity_confirmed) {
        setError("Confirma que los datos legales devueltos corresponden al negocio.");
        return;
      }
    }
    if (!submissionForm.province || !submissionForm.municipality || !submissionForm.neighborhood) {
      setError(
        "Selecciona provincia, municipio/distrito y barrio para generar el subdominio correctamente.",
      );
      return;
    }
    if (
      !String(submissionForm.street || "").trim() ||
      !String(submissionForm.street_number || "").trim()
    ) {
      setError("Completa calle y número del negocio.");
      return;
    }
    if (!submissionForm.owner_id) {
      setError(
        "Selecciona un propietario registrado antes de crear el negocio.",
      );
      return;
    }
    setSaving(true);
    try {
      const owner = activeOwners.find((item) => item.id === submissionForm.owner_id);
      const slug = buildAutoTenantSlug(submissionForm);
      const selectedType = activeBusinessTypes.find(
        (item) => item.id === submissionForm.business_type_id,
      );
      const fullName = buildBusinessDisplayName(
        submissionForm.business_type_name || selectedType?.name || "",
        submissionForm.business_name || submissionForm.name,
      );
      const payload = {
        ...submissionForm,
        name: fullName,
        slug,
        domain: rootDomain ? `${slug}.${rootDomain}` : slug,
        business_type_id: selectedType?.id || submissionForm.business_type_id,
        business_type_name: selectedType?.name || submissionForm.business_type_name,
        business_type_slug: selectedType?.slug || submissionForm.business_type_slug,
        business_name: submissionForm.business_name || submissionForm.name,
        address: buildAddressLine(submissionForm),
        owner_name: owner?.name || submissionForm.owner_name,
        owner_whatsapp: normalizeWhatsapp(
          owner?.whatsapp || submissionForm.owner_whatsapp,
        ),
        latitude: submissionForm.latitude === "" || submissionForm.latitude == null ? null : Number(submissionForm.latitude),
        longitude: submissionForm.longitude === "" || submissionForm.longitude == null ? null : Number(submissionForm.longitude),
        location_accuracy: submissionForm.locationAccuracy ?? submissionForm.location_accuracy ?? null,
        location_source: submissionForm.locationSource || submissionForm.location_source || "",
      };
      const created = await api.post("/platform/businesses", payload);
      setForm({ ...emptyTenantForm });
      setBusinessIdentityCheck({
        document: "",
        status: "idle",
        message: "",
        source: "",
        requestId: "",
        requiresConfirmation: false,
      });
      onCreated?.(created);
    } catch (err) {
      setError(err.message || "No se pudo crear el negocio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onCancel} width="max-w-4xl">
      <form
        onSubmit={submit}
        className="flex flex-col max-h-[calc(100vh-2rem)]"
      >
        <div className="p-5 sm:p-6 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0">
          <div>
            <p className="text-[10px] font-black text-[#00a884] uppercase tracking-widest">
              Nuevo negocio
            </p>
            <h2 className="text-xl font-black text-gray-900">
              Crear negocio SaaS
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Registra el negocio, asigna propietario y crea su subdominio
              automáticamente.
            </p>
          </div>
          {onCancel && (
            <IconButton onClick={onCancel} title="Cerrar">
              <FiX />
            </IconButton>
          )}
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto scrollbar-hide space-y-5">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}
          {activeOwners.length === 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
              Primero registra un propietario desde la sección Propietarios para
              poder asignarlo al negocio.
            </div>
          )}
          {activeBusinessTypes.length === 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
              Primero crea al menos un tipo de negocio en Configuración → Tipos.
            </div>
          )}

          <div className="space-y-5">
            <section className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="w-8 h-8 rounded-xl bg-[#00a884] text-white text-xs font-black flex items-center justify-center shrink-0">
                  1
                </span>
                <div>
                  <p className="text-sm font-black text-gray-900">Datos principales</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Define el nombre público del negocio y el plan con el que iniciará.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
                <label className="md:col-span-2 block">
                  <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                    Nombre del negocio *
                  </span>
                  <div className="flex flex-col sm:flex-row gap-2 rounded-2xl border border-gray-200 bg-white p-1 focus-within:border-[#00a884] focus-within:ring-4 focus-within:ring-[#00a884]/10 transition-all">
                    <select
                      value={form.business_type_id}
                      onChange={(e) => update("business_type_id", e.target.value)}
                      required
                      className="sm:w-56 rounded-xl border border-transparent bg-gray-50 sm:bg-transparent px-4 py-3 text-gray-900 font-black outline-none cursor-pointer"
                    >
                      <option value="">Tipo de negocio</option>
                      {activeBusinessTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                    <div className="hidden sm:block w-px bg-gray-200 my-2" />
                    <input
                      value={form.business_name ?? ""}
                      onChange={(e) => update("business_name", e.target.value)}
                      required
                      className="flex-1 rounded-xl border border-transparent bg-gray-50 sm:bg-transparent px-4 py-3 text-gray-900 font-bold outline-none"
                      placeholder="Ej. La Esquina"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">
                    El tipo se usa como prefijo y WAMERCIO genera el nombre final automáticamente.
                  </p>
                </label>

                <label className="block">
                  <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                    Plan
                  </span>
                  <select
                    value={form.plan_slug}
                    onChange={(e) => update("plan_slug", e.target.value)}
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
                  >
                    {(plans.length
                      ? plans
                      : [{ slug: "starter", name: "Inicial" }]
                    ).map((plan) => (
                      <option key={plan.slug} value={plan.slug}>
                        {plan.name || plan.slug}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-[#00a884]/20 bg-[#f0fdf8] px-4 py-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-6">
                    <div>
                      <p className="text-[10px] font-black text-[#008f72] uppercase tracking-widest">
                        Nombre final
                      </p>
                      <p className="text-sm font-black text-gray-900 mt-0.5">
                        {buildBusinessDisplayName(
                          form.business_type_name,
                          form.business_name,
                        ) || "Selecciona el tipo y escribe el nombre"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-[#008f72] uppercase tracking-widest">
                        Dominio
                      </p>
                      <p className="text-[11px] font-bold text-[#008f72] mt-1 break-all">
                        {generatedDomain || "Se generará al completar la ubicación"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="w-8 h-8 rounded-xl bg-[#00a884] text-white text-xs font-black flex items-center justify-center shrink-0">
                  2
                </span>
                <div>
                  <p className="text-sm font-black text-gray-900">Propietario y acceso</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Asigna la persona responsable que administrará este negocio.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <label className="md:col-span-2 block">
                  <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                    Propietario *
                  </span>
                  <select
                    value={form.owner_id}
                    onChange={(e) => update("owner_id", e.target.value)}
                    required
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
                  >
                    <option value="">— Selecciona propietario —</option>
                    {activeOwners.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.name} ·{" "}
                        {owner.national_id
                          ? formatDominicanId(owner.national_id)
                          : "sin cédula"}
                      </option>
                    ))}
                  </select>
                </label>
                <PhoneField
                  label="WhatsApp propietario"
                  value={form.owner_whatsapp}
                  onChange={(value) => update("owner_whatsapp", value)}
                />

                <div className="md:col-span-3 rounded-2xl border border-[#00a884]/15 bg-[#f0fdf8] px-4 py-3">
                  <p className="text-[10px] font-black text-[#008f72] uppercase tracking-widest">
                    Acceso administrativo
                  </p>
                  <p className="text-xs font-bold text-gray-700 mt-1">
                    El propietario seleccionado entrará a /#/admin con su WhatsApp y el PIN definido por la política de acceso.
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="w-8 h-8 rounded-xl bg-[#00a884] text-white text-xs font-black flex items-center justify-center shrink-0">
                  3
                </span>
                <div>
                  <p className="text-sm font-black text-gray-900">Ubicación del negocio</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Completa la dirección utilizada para el subdominio y la operación inicial.
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <TerritoryAddressForm
                  value={form}
                  apiPrefix="/platform"
                  title="Dirección principal"
                  description="Selecciona provincia, municipio/distrito y barrio; luego completa calle y número."
                  compact
                  onChange={(address) =>
                    setForm((prev) => ({ ...prev, ...address }))
                  }
                />
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 rounded-xl bg-gray-900 text-white text-xs font-black flex items-center justify-center shrink-0">
                    4
                  </span>
                  <div>
                    <p className="text-sm font-black text-gray-900">Datos fiscales</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Agrega el RNC únicamente cuando el negocio disponga de uno.
                    </p>
                  </div>
                </div>
                <span className="self-start rounded-full border border-gray-200 bg-white px-3 py-1 text-[10px] font-black text-gray-500">
                  Opcional
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div className="md:col-span-3 flex flex-col sm:flex-row gap-2 items-end">
                  <div className="flex-1 w-full">
                    <Field
                      label="RNC"
                      value={form.rnc}
                      onChange={(value) => {
                        setForm((current) => ({
                          ...current,
                          rnc: value,
                          legal_name: "",
                          commercial_name: "",
                          identity_confirmed: false,
                        }));
                        setBusinessIdentityCheck({
                          document: onlyDigits(value),
                          status: "idle",
                          message: "",
                          source: "",
                          requestId: "",
                          requiresConfirmation: false,
                        });
                      }}
                      placeholder="000-00000-0"
                      hint="Déjalo vacío si el negocio no posee RNC. Si lo completas, WAMERCIO lo verificará antes de guardar."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void verifyBusinessRNC()}
                    disabled={
                      businessIdentityCheck.status === "checking" ||
                      ![9, 11].includes(onlyDigits(form.rnc).length)
                    }
                    className="h-[46px] px-5 rounded-xl bg-gray-900 text-white font-black text-sm hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
                  >
                    <FiShield />
                    {businessIdentityCheck.status === "checking"
                      ? "Verificando…"
                      : "Verificar RNC"}
                  </button>
                </div>

                {businessIdentityCheck.status === "verified" && (
                  <div className="md:col-span-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
                    <div className="flex items-start gap-3">
                      <FiCheckCircle className="mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black">RNC verificado</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                          {form.legal_name && (
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-widest opacity-60">Razón social</p>
                              <p className="text-[11px] font-bold mt-0.5 break-words">{form.legal_name}</p>
                            </div>
                          )}
                          {form.commercial_name && (
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-widest opacity-60">Nombre comercial</p>
                              <p className="text-[11px] font-bold mt-0.5 break-words">{form.commercial_name}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {businessIdentityCheck.status !== "idle" &&
                  businessIdentityCheck.status !== "verified" && (
                    <div
                      className={`md:col-span-3 rounded-2xl border px-4 py-3 ${
                        businessIdentityCheck.status === "manual"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : businessIdentityCheck.status === "checking"
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-red-200 bg-red-50 text-red-700"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <FiAlertCircle className="mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-black">
                            {businessIdentityCheck.status === "manual"
                              ? "RNC pendiente de revisión"
                              : businessIdentityCheck.status === "checking"
                                ? "Verificando RNC"
                                : "No se pudo verificar el RNC"}
                          </p>
                          <p className="text-[11px] mt-1 opacity-80">
                            {businessIdentityCheck.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                {businessIdentityCheck.status === "verified" &&
                  businessIdentityCheck.requiresConfirmation && (
                    <label className="md:col-span-3 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <input
                        type="checkbox"
                        checked={Boolean(form.identity_confirmed)}
                        onChange={(event) =>
                          update("identity_confirmed", event.target.checked)
                        }
                        className="mt-0.5 w-5 h-5 accent-[#00a884]"
                      />
                      <span>
                        <span className="block text-sm font-black text-amber-900">
                          Confirmar datos fiscales
                        </span>
                        <span className="block text-xs text-amber-700 mt-1">
                          Revisé la información devuelta y confirmo que corresponde al negocio.
                        </span>
                      </span>
                    </label>
                  )}
              </div>
            </section>
          </div>
        </div>

        <div className="p-5 sm:p-6 border-t border-gray-100 bg-white flex flex-col sm:flex-row gap-3 shrink-0">
          <button
            type="submit"
            disabled={
              saving ||
              activeOwners.length === 0 ||
              activeBusinessTypes.length === 0
            }
            className="flex-1 rounded-2xl bg-[#00a884] hover:bg-[#008f72] disabled:opacity-70 text-white font-black py-4 shadow-lg shadow-[#00a884]/20 transition-colors"
          >
            {saving ? "Creando negocio..." : "Crear negocio y base"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="sm:w-40 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-black py-4 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

const Field = ({
  label,
  value,
  onChange,
  placeholder = "",
  required = false,
  type = "text",
  disabled = false,
  readOnly = false,
  locked = false,
  hint = "",
  onBlur,
  autoCapitalize,
}: any) => (
  <label className="block">
    <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
      {label}
    </span>
    <div className="relative">
      <input
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        onBlur={(e) => onBlur?.(e.target.value)}
        autoCapitalize={autoCapitalize}
        required={required}
        type={type}
        disabled={disabled}
        readOnly={readOnly || locked}
        aria-readonly={readOnly || locked}
        className={`w-full rounded-2xl border px-4 py-3 text-gray-900 font-bold outline-none transition focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10 disabled:cursor-not-allowed disabled:opacity-60 read-only:cursor-not-allowed ${locked ? "border-[#00a884] bg-[#f0fdf8] pr-11" : "border-gray-200 bg-gray-50"}`}
        placeholder={placeholder}
      />
      {locked && (
        <FiLock className="absolute right-4 top-1/2 -translate-y-1/2 text-[#00a884]" />
      )}
    </div>
    {hint && <p className="mt-1 text-[11px] font-bold text-gray-400">{hint}</p>}
  </label>
);

const GenderField = ({
  label = "Género",
  value,
  onChange,
  required = false,
  locked = false,
}: any) => (
  <label className="block">
    <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
      {label}
    </span>
    <div className="relative">
      <select
        value={value || ""}
        onChange={(event) => onChange?.(event.target.value)}
        required={required}
        disabled={locked}
        aria-readonly={locked}
        className={`w-full appearance-none rounded-2xl border px-4 py-3 pr-11 text-gray-900 font-bold outline-none transition focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10 disabled:cursor-not-allowed disabled:opacity-100 ${locked ? "border-[#00a884] bg-[#f0fdf8]" : "border-gray-200 bg-gray-50"}`}
      >
        <option value="">Seleccionar género</option>
        <option value="M">Masculino</option>
        <option value="F">Femenino</option>
      </select>
      {locked && (
        <FiLock className="absolute right-4 top-1/2 -translate-y-1/2 text-[#00a884]" />
      )}
    </div>
  </label>
);

const PhoneField = ({
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  valid = undefined,
  invalid = false,
  hint = "",
  hintTone = "muted",
}: any) => (
  <label className="block">
    <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
      {label}
    </span>
    <PhoneInput
      value={value || ""}
      required={required}
      disabled={disabled}
      initialCountry="do"
      preferredCountries={["do"]}
      valid={valid}
      invalid={invalid}
      onChange={(phone) =>
        onChange?.(
          phone?.nationalNumber || normalizeWhatsapp(phone?.whatsapp || ""),
        )
      }
    />
    {hint && (
      <p
        className={`text-[11px] font-bold mt-1 ${hintTone === "success" ? "text-[#00a884]" : hintTone === "danger" ? "text-red-500" : hintTone === "info" ? "text-blue-600" : "text-gray-400"}`}
      >
        {hint}
      </p>
    )}
  </label>
);

const NationalIdField = ({
  label,
  value,
  onChange,
  onBlur,
  required = false,
  disabled = false,
  readOnly = false,
  locked = false,
  onUnlock,
  verificationStatus = "idle",
  hint = "",
}: any) => {
  const formatted = normalizeNationalIdValue(value || "");
  const locallyValid =
    nationalIdIsComplete(formatted) && isValidDominicanId(formatted);
  const locallyInvalid = nationalIdIsInvalid(formatted);
  const verified = verificationStatus === "verified";
  const checking = verificationStatus === "checking";
  const manual = verificationStatus === "manual";
  const remoteInvalid = verificationStatus === "invalid";
  const borderClass = verified
    ? "border-[#00a884] bg-[#f0fdf8]"
    : checking
      ? "border-blue-300 bg-blue-50"
      : manual
        ? "border-amber-300 bg-amber-50"
        : locallyInvalid || remoteInvalid
          ? "border-red-300 bg-red-50"
          : "border-gray-200 bg-gray-50";
  const hintClass = verified
    ? "text-[#008f72]"
    : checking
      ? "text-blue-600"
      : manual
        ? "text-amber-700"
        : locallyInvalid || remoteInvalid
          ? "text-red-500"
          : "text-gray-400";

  return (
    <label className="block">
      <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
        {label}
      </span>
      <div className="relative">
        <input
          value={formatted}
          onChange={(e) => onChange?.(normalizeNationalIdValue(e.target.value))}
          onBlur={onBlur}
          required={required}
          disabled={disabled}
          readOnly={readOnly || locked}
          aria-readonly={readOnly || locked}
          inputMode="numeric"
          autoComplete="off"
          className={`w-full rounded-2xl border ${borderClass} px-4 py-3 pr-11 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10 disabled:cursor-not-allowed disabled:opacity-70 read-only:cursor-not-allowed`}
          placeholder="000-0000000-0"
        />
        {(locallyValid || checking || manual || remoteInvalid) && (
          <span
            className={`absolute right-4 top-1/2 -translate-y-1/2 font-black ${verified ? "text-[#00a884]" : checking ? "text-blue-600" : manual ? "text-amber-600" : remoteInvalid ? "text-red-500" : "text-gray-400"}`}
          >
            {checking ? <FiRefreshCw className="animate-spin" /> : locked ? <FiLock /> : verified ? "✓" : manual ? "!" : remoteInvalid ? "×" : "•"}
          </span>
        )}
      </div>
      {(hint || locallyInvalid || (locked && onUnlock)) && (
        <div className="mt-1 flex items-start justify-between gap-3">
          <p className={`text-[11px] font-bold ${hintClass}`}>
            {hint || (locallyInvalid ? "Cédula inválida" : "")}
          </p>
          {locked && onUnlock && (
            <button
              type="button"
              onClick={onUnlock}
              className="inline-flex shrink-0 items-center gap-1 text-[10px] font-black text-gray-400 hover:text-[#00a884]"
            >
              <FiEdit3 /> Cambiar
            </button>
          )}
        </div>
      )}
    </label>
  );
};

const OwnerForm = ({ owner = null, onCancel, onSaved }: any) => {
  const accessPolicy = useAccessPolicy();
  const normalizedOwnerName = normalizePersonName(owner?.name || "");
  const ownerNameParts = normalizedOwnerName
    .split(/\s+/)
    .filter(Boolean);
  const [form, setForm] = useState(() =>
    owner
      ? {
          ...emptyOwnerForm,
          ...owner,
          first_name: normalizePersonName(
            owner.first_name || ownerNameParts[0] || "",
          ),
          last_name: normalizePersonName(
            owner.last_name || ownerNameParts.slice(1).join(" ") || "",
          ),
          name: normalizedOwnerName,
          pin: "",
          identity_confirmed: Boolean(owner.identity_confirmed_by_user),
        }
      : { ...emptyOwnerForm },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [whatsappCheck, setWhatsappCheck] = useState({
    phone: "",
    status: "idle",
    message: "",
    profileName: "",
    profilePictureUrl: "",
  });
  const [identityCheck, setIdentityCheck] = useState(() => ({
    document: onlyDigits(owner?.national_id || ""),
    status:
      owner?.identity_verification_status === "verified"
        ? "verified"
        : owner?.identity_verification_status === "pending_manual"
          ? "manual"
          : "idle",
    message:
      owner?.identity_verification_status === "verified"
        ? "Cédula verificada."
        : owner?.identity_verification_status === "pending_manual"
          ? "Pendiente de revisión manual."
          : "",
    source: owner?.identity_source || "",
    requestId: owner?.identity_request_id || "",
    requiresConfirmation: Boolean(owner?.identity_requires_confirmation),
  }));
  const whatsappValidationSeq = useRef(0);
  const identityValidationSeq = useRef(0);
  const isEdit = Boolean(owner?.id);
  const update = (key, value) => {
    if (
      identityIsVerified &&
      (key === "national_id" || key === "first_name" || key === "last_name" || key === "birth_date" || key === "gender")
    )
      return;
    setForm((prev) => ({ ...prev, [key]: value }));
  };
  const currentWhatsappDigits = normalizeWhatsapp(form.whatsapp);
  const whatsappCheckCurrent = whatsappCheck.phone === currentWhatsappDigits;
  const whatsappIsValid =
    currentWhatsappDigits.length === 10 &&
    whatsappCheckCurrent &&
    whatsappCheck.status === "valid";
  const whatsappIsChecking =
    currentWhatsappDigits.length === 10 &&
    whatsappCheckCurrent &&
    whatsappCheck.status === "checking";
  const whatsappIsInvalid =
    currentWhatsappDigits.length === 10 &&
    whatsappCheckCurrent &&
    whatsappCheck.status === "invalid";
  const whatsappHint =
    currentWhatsappDigits.length < 10
      ? "Completa el WhatsApp para validarlo con WAXUM."
      : whatsappIsChecking
        ? "Validando si el número tiene cuenta de WhatsApp..."
        : whatsappIsValid
          ? whatsappCheck.profileName
            ? `WhatsApp válido: ${whatsappCheck.profileName}`
            : "WhatsApp válido. Puedes continuar."
          : whatsappIsInvalid
            ? whatsappCheck.message ||
              "Este número no tiene cuenta de WhatsApp. Cambia el número para continuar."
            : "Esperando validación de WhatsApp...";
  const whatsappHintTone = whatsappIsValid
    ? "success"
    : whatsappIsInvalid
      ? "danger"
      : whatsappIsChecking
        ? "info"
        : "muted";

  const identityDigits = onlyDigits(form.national_id);
  const identityCheckCurrent = identityCheck.document === identityDigits;
  const identityStatus = identityCheckCurrent ? identityCheck.status : "idle";
  const identityIsChecking = identityStatus === "checking";
  const identityIsVerified = identityStatus === "verified";
  const identityIsInvalid = identityStatus === "invalid";
  const identityAllowsManual = identityStatus === "manual";
  const identityNeedsConfirmation =
    identityIsVerified && identityCheck.requiresConfirmation;
  const identityConfirmationMissing =
    identityNeedsConfirmation && !form.identity_confirmed;
  const unlockVerifiedOwnerIdentity = () => {
    if (!identityIsVerified) return;
    ++identityValidationSeq.current;
    setIdentityCheck({
      document: "",
      status: "idle",
      message: "",
      source: "",
      requestId: "",
      requiresConfirmation: false,
    });
    setForm((current) => ({
      ...current,
      national_id: "",
      first_name: "",
      last_name: "",
      birth_date: "",
      gender: "",
      name: "",
      identity_confirmed: false,
    }));
    setError("");
  };
  const identityHint =
    identityDigits.length < 11
      ? "Completa la cédula para verificarla."
      : identityCheckCurrent && identityCheck.message
        ? identityCheck.message
        : "La cédula se verificará automáticamente.";

  const verifyNationalId = useCallback(async (value) => {
    const formatted = normalizeNationalIdValue(value || "");
    const digits = onlyDigits(formatted);
    const seq = ++identityValidationSeq.current;

    if (digits.length !== 11 || !isValidDominicanId(formatted)) {
      setIdentityCheck({
        document: digits,
        status: digits.length === 11 ? "invalid" : "idle",
        message:
          digits.length === 11
            ? "Ingresa una cédula dominicana válida."
            : "",
        source: "",
        requestId: "",
        requiresConfirmation: false,
      });
      return false;
    }

    setIdentityCheck({
      document: digits,
      status: "checking",
      message: "Consultando Identidad",
      source: "",
      requestId: "",
      requiresConfirmation: false,
    });

    try {
      const payload = await verifyPlatformIdentity({
        tipo_sujeto: "persona",
        documento: digits,
        contexto: "registro_propietario",
      });
      if (seq !== identityValidationSeq.current) return false;

      if (!payload?.success || !payload?.data) {
        if (payload?.manual_allowed) {
          setIdentityCheck({
            document: digits,
            status: "manual",
            message:
              payload?.error?.message ||
              "La verificación no está disponible; el registro quedará pendiente de revisión manual.",
            source: "",
            requestId: payload?.error?.request_id || "",
            requiresConfirmation: false,
          });
          setForm((current) => ({ ...current, identity_confirmed: false }));
          return true;
        }
        setIdentityCheck({
          document: digits,
          status: "invalid",
          message:
            payload?.error?.message || "No se pudo verificar la cédula.",
          source: "",
          requestId: payload?.error?.request_id || "",
          requiresConfirmation: false,
        });
        return false;
      }

      const result = payload.data;
      if (
        !result.valida ||
        !result.encontrada ||
        !result.puede_registrarse ||
        !result.persona
      ) {
        setIdentityCheck({
          document: digits,
          status: "invalid",
          message:
            result.motivo ||
            "La cédula no cumple las condiciones para registrar al propietario.",
          source: result.fuente || "",
          requestId: payload?.meta?.request_id || "",
          requiresConfirmation: Boolean(result.requiere_confirmacion),
        });
        return false;
      }

      const requiresConfirmation = Boolean(result.requiere_confirmacion);
      setForm((current) => ({
        ...current,
        national_id: normalizeNationalIdValue(result.persona?.cedula || digits),
        first_name:
          result.puede_autocompletar && result.persona?.nombres
            ? normalizePersonName(result.persona.nombres)
            : current.first_name,
        last_name:
          result.puede_autocompletar && result.persona?.apellidos
            ? normalizePersonName(result.persona.apellidos)
            : current.last_name,
        birth_date:
          result.puede_autocompletar && result.persona?.fecha_nacimiento
            ? String(result.persona.fecha_nacimiento)
            : current.birth_date,
        gender:
          result.puede_autocompletar && result.persona?.sexo
            ? String(result.persona.sexo).trim().toUpperCase()
            : current.gender,
        identity_confirmed: !requiresConfirmation,
      }));
      setIdentityCheck({
        document: digits,
        status: "verified",
        message: requiresConfirmation
          ? "Cédula encontrada. Revisa y confirma el nombre antes de guardar."
          : "Cédula verificada.",
        source: result.fuente || payload?.meta?.provider || "Identidad API",
        requestId: payload?.meta?.request_id || "",
        requiresConfirmation,
      });
      return true;
    } catch (err) {
      if (seq !== identityValidationSeq.current) return false;
      setIdentityCheck({
        document: digits,
        status: "invalid",
        message: err?.message || "No se pudo verificar la cédula.",
        source: "",
        requestId: "",
        requiresConfirmation: false,
      });
      return false;
    }
  }, []);

  useEffect(() => {
    const formatted = normalizeNationalIdValue(form.national_id || "");
    const digits = onlyDigits(formatted);
    if (digits.length < 11) {
      ++identityValidationSeq.current;
      setIdentityCheck({
        document: digits,
        status: "idle",
        message: "",
        source: "",
        requestId: "",
        requiresConfirmation: false,
      });
      return undefined;
    }
    if (!isValidDominicanId(formatted)) {
      ++identityValidationSeq.current;
      setIdentityCheck({
        document: digits,
        status: "invalid",
        message: "Ingresa una cédula dominicana válida.",
        source: "",
        requestId: "",
        requiresConfirmation: false,
      });
      return undefined;
    }
    if (
      identityCheck.document === digits &&
      identityCheck.status !== "idle"
    ) {
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      void verifyNationalId(formatted);
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [form.national_id, identityCheck.document, identityCheck.status, verifyNationalId]);

  useEffect(() => {
    const digits = normalizeWhatsapp(form.whatsapp);
    const seq = ++whatsappValidationSeq.current;

    if (digits.length < 10) {
      setWhatsappCheck({
        phone: digits,
        status: "idle",
        message: "",
        profileName: "",
        profilePictureUrl: "",
      });
      return undefined;
    }

    setWhatsappCheck((prev) => ({
      ...prev,
      phone: digits,
      status:
        prev.phone === digits && prev.status === "valid" ? "valid" : "checking",
      message:
        prev.phone === digits && prev.status === "valid" ? prev.message : "",
    }));

    const timeout = window.setTimeout(async () => {
      try {
        const payload = await api.post("/platform/whatsapp/validate-number", {
          phone: digits,
        });
        if (seq !== whatsappValidationSeq.current) return;
        const valid = Boolean(payload?.valid || payload?.has_whatsapp);
        setWhatsappCheck({
          phone: digits,
          status: valid ? "valid" : "invalid",
          message:
            payload?.message ||
            (valid
              ? "WhatsApp válido. Puedes continuar."
              : "Este número no tiene cuenta de WhatsApp. Cambia el número para continuar."),
          profileName: payload?.profile_name || "",
          profilePictureUrl: payload?.profile_picture_url || "",
        });
      } catch (err) {
        if (seq !== whatsappValidationSeq.current) return;
        setWhatsappCheck({
          phone: digits,
          status: "invalid",
          message: err?.message || "No se pudo validar el número con WAXUM.",
          profileName: "",
          profilePictureUrl: "",
        });
      }
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [form.whatsapp]);

  const validateWhatsappBeforeSave = async () => {
    const digits = normalizeWhatsapp(form.whatsapp);
    if (digits.length !== 10) {
      throw new Error("Completa un WhatsApp válido para el propietario.");
    }
    if (whatsappCheck.phone === digits && whatsappCheck.status === "valid") {
      return true;
    }
    setWhatsappCheck((prev) => ({
      ...prev,
      phone: digits,
      status: "checking",
      message: "",
    }));
    const payload = await api.post("/platform/whatsapp/validate-number", {
      phone: digits,
    });
    const valid = Boolean(payload?.valid || payload?.has_whatsapp);
    setWhatsappCheck({
      phone: digits,
      status: valid ? "valid" : "invalid",
      message:
        payload?.message ||
        (valid
          ? "WhatsApp válido. Puedes continuar."
          : "Este número no tiene cuenta de WhatsApp. Cambia el número para continuar."),
      profileName: payload?.profile_name || "",
      profilePictureUrl: payload?.profile_picture_url || "",
    });
    if (!valid) {
      throw new Error(
        payload?.message ||
          "Este número no tiene cuenta de WhatsApp. Cambia el número para continuar.",
      );
    }
    return true;
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const formattedNationalId = normalizeNationalIdValue(form.national_id);
    if (!nationalIdIsComplete(formattedNationalId)) {
      setError("La cédula del propietario es obligatoria.");
      return;
    }
    if (!isValidDominicanId(formattedNationalId)) {
      setError("La cédula no es válida.");
      return;
    }
    setSaving(true);
    try {
      if (!identityIsVerified && !identityAllowsManual) {
        const verified = await verifyNationalId(formattedNationalId);
        if (!verified) {
          throw new Error("Verifica correctamente la cédula antes de continuar.");
        }
      }
      if (identityConfirmationMissing) {
        throw new Error(
          "Confirma que el nombre devuelto corresponde al propietario.",
        );
      }
      await validateWhatsappBeforeSave();
      const pin = onlyDigits(form.pin).slice(0, accessPolicy.adminPinLength);
      if (!isEdit && pin.length !== accessPolicy.adminPinLength) {
        throw new Error(
          `Debes definir un PIN de ${accessPolicy.adminPinLength} dígitos para el propietario`,
        );
      }
      if (isEdit && pin && pin.length !== accessPolicy.adminPinLength) {
        throw new Error(`El PIN debe tener ${accessPolicy.adminPinLength} dígitos`);
      }
      const normalizedFirstName = normalizePersonName(form.first_name);
      const normalizedLastName = normalizePersonName(form.last_name);
      const payload = {
        first_name: normalizedFirstName,
        last_name: normalizedLastName,
        name: normalizePersonName(
          `${normalizedFirstName} ${normalizedLastName}`,
        ),
        whatsapp: normalizeWhatsapp(form.whatsapp),
        national_id: formattedNationalId,
        birth_date: String(form.birth_date || "").trim(),
        gender: String(form.gender || "").trim().toUpperCase(),
        status: form.status || "active",
        identity_confirmed: Boolean(form.identity_confirmed),
        ...(pin ? { pin } : {}),
      };
      const saved = isEdit
        ? await api.patch(`/platform/owners/${owner.id}`, payload)
        : await api.post("/platform/owners", payload);
      onSaved?.(saved);
    } catch (err) {
      setError(err.message || "No se pudo guardar el propietario");
    } finally {
      setSaving(false);
    }
  };

  const submitDisabled =
    saving ||
    whatsappIsChecking ||
    !whatsappIsValid ||
    identityIsChecking ||
    identityIsInvalid ||
    identityConfirmationMissing;

  return (
    <ModalShell onClose={onCancel} width="max-w-xl">
      <form
        onSubmit={submit}
        className="flex flex-col max-h-[calc(100vh-2rem)]"
      >
        <div className="p-5 sm:p-6 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0">
          <div>
            <p className="text-[10px] font-black text-[#00a884] uppercase tracking-widest">
              Propietarios
            </p>
            <h2 className="text-xl font-black text-gray-900">
              {isEdit ? "Editar propietario" : "Nuevo propietario"}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Verifica la cédula, valida el WhatsApp y registra el acceso.
            </p>
          </div>
          <IconButton onClick={onCancel} title="Cerrar">
            <FiX />
          </IconButton>
        </div>
        <div className="p-5 sm:p-6 overflow-y-auto scrollbar-hide space-y-4">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PhoneField
              label="WhatsApp *"
              value={form.whatsapp}
              onChange={(value) => update("whatsapp", value)}
              required
              valid={whatsappIsValid}
              invalid={whatsappIsInvalid}
              hint={whatsappHint}
              hintTone={whatsappHintTone}
            />
            <NationalIdField
              label="Cédula *"
              value={form.national_id}
              onChange={(value) => {
                update("national_id", value);
                update("identity_confirmed", false);
              }}
              required
              readOnly={identityIsVerified}
              locked={identityIsVerified}
              onUnlock={unlockVerifiedOwnerIdentity}
              verificationStatus={identityStatus}
              hint={identityIsVerified ? "Cédula verificada." : identityHint}
            />
            <Field
              label="Nombre *"
              value={form.first_name}
              onChange={(value) => update("first_name", value)}
              onBlur={(value) =>
                update("first_name", normalizePersonName(value))
              }
              autoCapitalize="words"
              required
              readOnly={identityIsVerified}
              locked={identityIsVerified}
              placeholder="Rafael"
            />
            <Field
              label="Apellido"
              value={form.last_name}
              onChange={(value) => update("last_name", value)}
              onBlur={(value) =>
                update("last_name", normalizePersonName(value))
              }
              autoCapitalize="words"
              readOnly={identityIsVerified}
              locked={identityIsVerified}
              placeholder="Pérez"
            />
            <Field
              label="Fecha de nacimiento"
              value={form.birth_date}
              onChange={(value) => update("birth_date", value)}
              type="date"
              readOnly={identityIsVerified}
              locked={identityIsVerified}
            />
            <GenderField
              label="Género"
              value={form.gender}
              onChange={(value) => update("gender", value)}
              locked={identityIsVerified}
            />
            {identityNeedsConfirmation && (
              <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <input
                  type="checkbox"
                  checked={Boolean(form.identity_confirmed)}
                  onChange={(event) =>
                    update("identity_confirmed", event.target.checked)
                  }
                  className="mt-0.5 w-5 h-5 accent-[#00a884]"
                />
                <span>
                  <span className="block text-sm font-black text-amber-900">
                    Confirmar identidad del propietario
                  </span>
                  <span className="block text-xs text-amber-700 mt-1">
                    Revisé el nombre autocompletado y confirmo que corresponde a
                    la persona titular de esta cédula.
                  </span>
                </span>
              </label>
            )}
            {identityAllowsManual && (
              <div className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                <div className="flex items-start gap-3">
                  <FiAlertCircle className="mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-black">
                      Verificación manual permitida
                    </p>
                    <p className="text-[11px] mt-1 opacity-80">
                      {identityCheck.message}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
              <PinInput
                value={form.pin}
                onChange={(value) => update("pin", value)}
                length={accessPolicy.adminPinLength}
                label={
                  isEdit
                    ? `Nuevo PIN de ${accessPolicy.adminPinLength} dígitos (opcional)`
                    : `PIN de ${accessPolicy.adminPinLength} dígitos *`
                }
              />
            </div>
            <label className="block">
              <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                Estado
              </span>
              <select
                value={form.status}
                onChange={(e) => update("status", e.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
              >
                <option value="active">Activo</option>
                <option value="disabled">Inactivo</option>
              </select>
            </label>
          </div>
        </div>
        <div className="p-5 sm:p-6 border-t border-gray-100 bg-white flex flex-col sm:flex-row gap-3 shrink-0">
          <button
            type="submit"
            disabled={submitDisabled}
            className="flex-1 rounded-2xl bg-[#00a884] hover:bg-[#008f72] disabled:opacity-70 text-white font-black py-4 shadow-lg shadow-[#00a884]/20 transition-colors"
          >
            {saving
              ? "Guardando..."
              : identityIsChecking
                ? "Consultando Identidad"
                : whatsappIsChecking
                  ? "Validando WhatsApp..."
                  : isEdit
                    ? "Guardar cambios"
                    : "Crear propietario"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="sm:w-36 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-black py-4 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

const OwnerRow = ({ owner, onEdit, onDelete }: any) => {
  const initials = String(owner.name || "P")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors">
      <td className="px-4 py-4 min-w-[260px]">
        <div className="flex items-center gap-3 min-w-0">
          <UserAvatar
            user={owner}
            name={owner.name}
            initials={initials}
            className="w-10 h-10 rounded-2xl bg-[#00a884]/10 text-[#00a884] flex items-center justify-center font-black text-xs shrink-0 border border-[#00a884]/20"
          />
          <div className="min-w-0">
            <h3 className="text-sm font-black text-gray-900 truncate">
              {owner.name || "Sin nombre"}
            </h3>
            <p className="text-xs text-gray-400 truncate">
              Desde {formatDateOnly(owner.created_at)}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 text-sm font-bold text-gray-600 whitespace-nowrap">
        {formatWhatsappLabel(owner.whatsapp)}
      </td>
      <td className="px-4 py-4 whitespace-nowrap">
        <p className="text-sm font-bold text-gray-600">
          {owner.national_id ? formatDominicanId(owner.national_id) : "—"}
        </p>
        {owner.national_id && owner.identity_verification_status !== "pending_manual" && (
          <span
            className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black ${
              owner.identity_verification_status === "verified"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {owner.identity_verification_status === "verified" ? (
              <FiCheckCircle />
            ) : (
              <FiShield />
            )}
            {owner.identity_verification_status === "verified"
              ? "Identidad verificada"
              : "Sin verificar"}
          </span>
        )}
      </td>
      <td className="px-4 py-4 whitespace-nowrap">
        <span className="inline-flex min-w-8 h-7 px-2 items-center justify-center rounded-full bg-[#00a884]/10 text-[#008f72] text-xs font-black">
          {owner.tenants_count || 0}
        </span>
      </td>
      <td className="px-4 py-4 whitespace-nowrap">
        <Badge
          value={owner.status || "active"}
          labels={{ active: "Activo", disabled: "Inactivo" }}
        />
      </td>
      <td className="px-4 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <IconButton
            onClick={() => onEdit?.(owner)}
            title="Editar propietario"
            className="bg-blue-50 text-blue-600 hover:bg-blue-100"
          >
            <FiEdit3 />
          </IconButton>
          <IconButton
            onClick={() => onDelete?.(owner)}
            title="Eliminar propietario"
            disabled={(owner.tenants_count || 0) > 0}
            className="bg-red-50 text-red-500 hover:bg-red-100"
          >
            <FiTrash2 />
          </IconButton>
        </div>
      </td>
    </tr>
  );
};

const OwnersView = ({
  owners,
  search,
  setSearch,
  onNew,
  onEdit,
  onDelete,
  showHeader = true,
}: any) => {
  const [status, setStatus] = useState("all");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return safeList(owners).filter((owner) => {
      const matchesStatus = status === "all" || owner.status === status;
      const matchesText =
        !q ||
        [
          owner.name,
          owner.first_name,
          owner.last_name,
          owner.whatsapp,
          owner.national_id,
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(q),
        );
      return matchesStatus && matchesText;
    });
  }, [owners, search, status]);

  return (
    <section className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
        {showHeader && (
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Propietarios
              </p>
              <h2 className="text-lg font-black text-gray-900">
                Gestión de propietarios
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                Registra propietarios y asígnalos al crear o editar negocios.
              </p>
            </div>
            <button
              type="button"
              onClick={onNew}
              className="h-11 px-4 rounded-xl bg-[#00a884] text-white hover:bg-[#008f72] flex items-center justify-center gap-2 text-xs font-black shadow-md shadow-[#00a884]/20"
            >
              <FiPlus />
              Nuevo propietario
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_180px] gap-3">
          <div className="relative">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 pl-11 pr-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
              placeholder="Buscar por nombre, WhatsApp o cédula..."
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
          >
            <option value="all">Estado: todos</option>
            <option value="active">Activos</option>
            <option value="disabled">Inactivos</option>
          </select>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-[11px] font-black text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">WhatsApp</th>
                  <th className="px-4 py-3">Cédula</th>
                  <th className="px-4 py-3">Negocios</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((owner) => (
                  <OwnerRow
                    key={owner.id}
                    owner={owner}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={FiUserCheck}
            title="No hay propietarios"
            text="Crea propietarios para asignarlos a los negocios SaaS."
          />
        )}
      </div>
    </section>
  );
};

const TenantRow = ({
  tenant,
  onStatusChange,
  onSelect,
  onBlock,
  onDelete,
  onAdminAccess,
}: any) => {
  const [copied, setCopied] = useState(false);
  const [openingAdmin, setOpeningAdmin] = useState(false);
  const publicUrl = tenantUrl(tenant);
  const locationLine = tenantLocationLine(tenant);
  const currentStatus = String(tenant?.status || "active").toLowerCase();
  const isBlocked =
    currentStatus === "suspended" || currentStatus === "disabled";
  const adminEnabled =
    Boolean(onAdminAccess) &&
    currentStatus !== "suspended" &&
    currentStatus !== "disabled" &&
    currentStatus !== "provisioning";
  const copyDomain = async () => {
    if (!tenant.domain || typeof navigator === "undefined") return;
    await navigator.clipboard?.writeText(tenant.domain);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1300);
  };

  const openAdmin = async () => {
    if (!onAdminAccess || !adminEnabled || openingAdmin) return;
    setOpeningAdmin(true);
    try {
      await onAdminAccess(tenant);
    } finally {
      setOpeningAdmin(false);
    }
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-4">
        <button
          type="button"
          onClick={() => onSelect?.(tenant)}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#00a884]/10 text-[#00a884] flex items-center justify-center shrink-0">
            <FiHome className="text-xl" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-gray-900 truncate">
                {tenant.name}
              </h3>
              <Badge value={tenant.status} />
            </div>
            <p className="text-xs text-gray-400 truncate">
              {tenant.slug} · Plan {tenant.plan_slug || "starter"} ·{" "}
              {tenant.subscription_status || "sin suscripción"}
            </p>
            {locationLine && (
              <p className="text-[11px] text-gray-400 truncate mt-0.5">
                {locationLine}
              </p>
            )}
          </div>
        </button>

        <div className="grid grid-cols-1 md:grid-cols-3 2xl:grid-cols-[220px_240px_150px] gap-3 flex-1">
          <InfoBox
            label="Dominio"
            value={copied ? "Copiado" : tenant.domain || "Sin dominio"}
            onClick={copyDomain}
          />
          <InfoBox
            label="Base de datos"
            value={tenant.database_name || "Pendiente"}
          />
          <label className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 min-w-0">
            <span className="text-[9px] uppercase tracking-widest font-black text-gray-400 block">
              Estado
            </span>
            <select
              value={tenant.status || "active"}
              onChange={(e) => onStatusChange(tenant, e.target.value)}
              className="w-full bg-transparent text-xs font-black text-gray-800 outline-none"
            >
              {Object.keys(statusLabels).map((key) => (
                <option key={key} value={key}>
                  {statusLabels[key]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <IconButton
            onClick={() => onSelect?.(tenant)}
            title="Gestionar negocio"
            className="bg-[#00a884]/10 text-[#00a884] hover:bg-[#00a884]/20"
          >
            <FiSettings />
          </IconButton>
          <IconButton onClick={copyDomain} title="Copiar dominio">
            <FiCopy />
          </IconButton>
          {publicUrl && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="w-10 h-10 rounded-xl bg-[#00a884]/10 text-[#00a884] flex items-center justify-center hover:bg-[#00a884]/20"
              title="Abrir tienda"
            >
              <FiExternalLink />
            </a>
          )}
          <button
            type="button"
            onClick={openAdmin}
            disabled={!adminEnabled || openingAdmin}
            title={
              adminEnabled
                ? "Entrar al panel administrativo con sesión iniciada en una ventana nueva"
                : "El negocio debe estar activo para entrar al panel"
            }
            className="px-3 h-10 rounded-xl bg-[#1a2332] text-white text-xs font-black flex items-center justify-center hover:bg-[#111827] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {openingAdmin ? "Entrando..." : "Administrar"}
          </button>
          <IconButton
            onClick={() => onBlock?.(tenant)}
            title={isBlocked ? "Desbloquear negocio" : "Bloquear negocio"}
            className={
              isBlocked
                ? "bg-[#00a884]/10 text-[#00a884] hover:bg-[#00a884]/20"
                : "bg-amber-50 text-amber-700 hover:bg-amber-100"
            }
          >
            <FiLock />
          </IconButton>
          <IconButton
            onClick={() => onDelete?.(tenant)}
            title="Eliminar negocio"
            className="bg-red-50 text-red-600 hover:bg-red-100"
          >
            <FiTrash2 />
          </IconButton>
        </div>
      </div>
    </div>
  );
};

const TenantLocationFilter = ({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
}: any) => (
  <label className="block">
    <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
      {label}
    </span>
    <select
      value={value || ""}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled || safeList(options).length === 0}
      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10 disabled:cursor-not-allowed disabled:text-gray-400 disabled:bg-gray-100"
    >
      <option value="">{placeholder}</option>
      {safeList(options).map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </label>
);

const OwnersTenantsView = ({
  tenants,
  filteredTenants,
  search,
  setSearch,
  onSelect,
  onStatusChange,
  onBlock,
  onDelete,
  onAdminAccess,
}: any) => {
  const [locationFilters, setLocationFilters] = useState({
    province: "",
    municipality: "",
    neighborhood: "",
  });
  const provinceOptions = useMemo(
    () => uniqueTenantLocationOptions(tenants, "province"),
    [tenants],
  );
  const municipalityOptions = useMemo(
    () => uniqueTenantLocationOptions(tenants, "municipality", locationFilters),
    [tenants, locationFilters.province],
  );
  const neighborhoodOptions = useMemo(
    () => uniqueTenantLocationOptions(tenants, "neighborhood", locationFilters),
    [tenants, locationFilters.province, locationFilters.municipality],
  );
  const visibleTenants = useMemo(
    () =>
      safeList(filteredTenants).filter((tenant) =>
        tenantMatchesLocationFilters(tenant, locationFilters),
      ),
    [
      filteredTenants,
      locationFilters.province,
      locationFilters.municipality,
      locationFilters.neighborhood,
    ],
  );
  const hasLocationFilters = Boolean(
    locationFilters.province ||
    locationFilters.municipality ||
    locationFilters.neighborhood,
  );

  useEffect(() => {
    setLocationFilters((current) => {
      const next = { ...current };
      if (
        next.province &&
        !provinceOptions.some(
          (option) =>
            normalizeFilterText(option) === normalizeFilterText(next.province),
        )
      ) {
        next.province = "";
        next.municipality = "";
        next.neighborhood = "";
      }
      if (
        next.municipality &&
        !municipalityOptions.some(
          (option) =>
            normalizeFilterText(option) ===
            normalizeFilterText(next.municipality),
        )
      ) {
        next.municipality = "";
        next.neighborhood = "";
      }
      if (
        next.neighborhood &&
        !neighborhoodOptions.some(
          (option) =>
            normalizeFilterText(option) ===
            normalizeFilterText(next.neighborhood),
        )
      ) {
        next.neighborhood = "";
      }
      return next.province === current.province &&
        next.municipality === current.municipality &&
        next.neighborhood === current.neighborhood
        ? current
        : next;
    });
  }, [provinceOptions, municipalityOptions, neighborhoodOptions]);

  const updateLocationFilter = (key, value) => {
    setLocationFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === "province") {
        next.municipality = "";
        next.neighborhood = "";
      }
      if (key === "municipality") {
        next.neighborhood = "";
      }
      return next;
    });
  };

  const clearLocationFilters = () =>
    setLocationFilters({ province: "", municipality: "", neighborhood: "" });

  return (
    <section className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Negocios SaaS
            </p>
            <h2 className="text-lg font-black text-gray-900">
              Negocios asignados a propietarios
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Consulta los negocios creados, su propietario, dominio, ubicación,
              base de datos y estado operativo.
            </p>
          </div>
          <div className="rounded-2xl bg-[#f0fdf8] border border-[#00a884]/15 px-4 py-3 text-right">
            <p className="text-[10px] font-black text-[#008f72] uppercase tracking-widest">
              Resultado
            </p>
            <p className="text-sm font-black text-gray-900">
              {visibleTenants.length} de {safeList(tenants).length} negocios
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(260px,1.6fr)_minmax(170px,1fr)_minmax(190px,1fr)_minmax(170px,1fr)_auto] gap-3 items-end">
          <label className="block">
            <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
              Búsqueda
            </span>
            <div className="relative">
              <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 pl-11 pr-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
                placeholder="Buscar negocio, propietario, dominio, plan, base de datos o ubicación..."
              />
            </div>
          </label>
          <TenantLocationFilter
            label="Provincia"
            value={locationFilters.province}
            onChange={(value) => updateLocationFilter("province", value)}
            options={provinceOptions}
            placeholder="Todas las provincias"
          />
          <TenantLocationFilter
            label="Municipio / Distrito"
            value={locationFilters.municipality}
            onChange={(value) => updateLocationFilter("municipality", value)}
            options={municipalityOptions}
            placeholder={
              locationFilters.province
                ? "Todos los municipios"
                : "Selecciona provincia"
            }
            disabled={!locationFilters.province}
          />
          <TenantLocationFilter
            label="Barrio"
            value={locationFilters.neighborhood}
            onChange={(value) => updateLocationFilter("neighborhood", value)}
            options={neighborhoodOptions}
            placeholder={
              locationFilters.municipality
                ? "Todos los barrios"
                : "Selecciona municipio"
            }
            disabled={!locationFilters.municipality}
          />
          {hasLocationFilters && (
            <button
              type="button"
              onClick={clearLocationFilters}
              className="h-12 px-4 rounded-2xl bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-black whitespace-nowrap"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>
      <div className="space-y-3">
        {visibleTenants.map((tenant) => (
          <TenantRow
            key={tenant.id}
            tenant={tenant}
            onSelect={onSelect}
            onStatusChange={onStatusChange}
            onBlock={onBlock}
            onDelete={onDelete}
            onAdminAccess={onAdminAccess}
          />
        ))}
        {visibleTenants.length === 0 && (
          <EmptyState
            icon={FiHome}
            title={
              safeList(tenants).length === 0
                ? "Sin negocios"
                : "No hay resultados"
            }
            text={
              safeList(tenants).length === 0
                ? "Crea tu primer negocio y asígnalo a un propietario registrado."
                : "Ajusta la búsqueda o los filtros de ubicación."
            }
          />
        )}
      </div>
    </section>
  );
};

const OwnersHubTab = ({ active, icon: Icon, label, count, onClick }: any) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex-1 min-w-[160px] rounded-2xl border px-4 py-3 text-left transition-all ${active ? "border-[#00a884] bg-[#00a884]/10 text-[#008f72] shadow-sm" : "border-gray-100 bg-gray-50 text-gray-500 hover:bg-white hover:border-gray-200"}`}
  >
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${active ? "bg-[#00a884] text-white" : "bg-white text-gray-500"}`}
        >
          <Icon />
        </span>
        <span className="text-sm font-black truncate">{label}</span>
      </div>
      <span
        className={`min-w-7 h-7 px-2 rounded-full flex items-center justify-center text-[11px] font-black ${active ? "bg-white text-[#008f72]" : "bg-gray-100 text-gray-500"}`}
      >
        {count}
      </span>
    </div>
  </button>
);

const OwnersHubView = ({
  activeSection,
  onSectionChange,
  owners,
  tenants,
  filteredTenants,
  search,
  setSearch,
  onNewOwner,
  onEditOwner,
  onDeleteOwner,
  onNewTenant,
  onTenantSelect,
  onTenantStatusChange,
  onTenantBlock,
  onTenantDelete,
  onTenantAdminAccess,
}: any) => {
  const ownerCount = safeList(owners).length;
  const tenantCount = safeList(tenants).length;
  const showingTenants = activeSection === "tenants";

  return (
    <section className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {showingTenants ? "Negocios" : "Propietarios"}
            </p>
            <h2 className="text-lg font-black text-gray-900">
              Gestión de propietarios y negocios
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Administra los propietarios y los negocios asociados desde una
              sola sección.
            </p>
          </div>
          <button
            type="button"
            onClick={showingTenants ? onNewTenant : onNewOwner}
            className="h-11 px-4 rounded-xl bg-[#00a884] text-white hover:bg-[#008f72] flex items-center justify-center gap-2 text-xs font-black shadow-md shadow-[#00a884]/20"
          >
            <FiPlus />
            {showingTenants ? "Nuevo negocio" : "Nuevo propietario"}
          </button>
        </div>
        <div className="flex flex-col md:flex-row gap-3">
          <OwnersHubTab
            active={showingTenants}
            icon={FiHome}
            label="Negocios"
            count={tenantCount}
            onClick={() => onSectionChange("tenants")}
          />
          <OwnersHubTab
            active={!showingTenants}
            icon={FiUsers}
            label="Propietarios"
            count={ownerCount}
            onClick={() => onSectionChange("owners")}
          />
        </div>
      </div>

      {showingTenants ? (
        <OwnersTenantsView
          tenants={tenants}
          filteredTenants={filteredTenants}
          search={search}
          setSearch={setSearch}
          onNew={onNewTenant}
          onSelect={onTenantSelect}
          onStatusChange={onTenantStatusChange}
          onBlock={onTenantBlock}
          onDelete={onTenantDelete}
          onAdminAccess={onTenantAdminAccess}
        />
      ) : (
        <OwnersView
          owners={owners}
          search={search}
          setSearch={setSearch}
          onNew={onNewOwner}
          onEdit={onEditOwner}
          onDelete={onDeleteOwner}
          showHeader={false}
        />
      )}
    </section>
  );
};

const InfoBox = ({ label, value, onClick = undefined }: any) => {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 min-w-0 text-left"
    >
      <p className="text-[9px] uppercase tracking-widest font-black text-gray-400">
        {label}
      </p>
      <p className="text-xs font-bold text-gray-700 truncate">{value || "—"}</p>
    </Tag>
  );
};

const TenantDetail = ({
  tenant,
  plans,
  owners = [],
  domains,
  databases,
  subscriptions,
  onClose,
  onReload,
}: any) => {
  const [edit, setEdit] = useState(() => ({
    name: tenant?.name || "",
    plan_slug: tenant?.plan_slug || "starter",
    owner_id: tenant?.owner_id || "",
    owner_name: tenant?.owner_name || "",
    owner_whatsapp: normalizeWhatsapp(tenant?.owner_whatsapp || ""),
  }));
  const [domainForm, setDomainForm] = useState({
    domain: "",
    type: "subdomain",
    is_primary: false,
  });
  const [showDomainForm, setShowDomainForm] = useState(false);
  const [subForm, setSubForm] = useState({
    plan_slug: tenant?.plan_slug || "starter",
    status: tenant?.subscription_status || "trial",
    billing_period: tenant?.billing_period || "monthly",
    next_billing_at: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!tenant) return null;
  const activeOwners = safeList(owners).filter(
    (owner) => owner.status !== "disabled",
  );
  const tenantDomains = domains.filter(
    (domain) => domain.tenant_id === tenant.id,
  );
  const tenantDb = databases.find((db) => db.tenant_id === tenant.id) || {};
  const tenantSubs = subscriptions.filter((sub) => sub.tenant_id === tenant.id);

  const saveTenant = async () => {
    setSaving(true);
    setError("");
    try {
      await api.patch(`/platform/businesses/${tenant.id}`, {
        ...edit,
        owner_whatsapp: normalizeWhatsapp(edit.owner_whatsapp),
      });
      await onReload?.();
    } catch (err) {
      setError(err.message || "No se pudo actualizar el negocio");
    } finally {
      setSaving(false);
    }
  };

  const addDomain = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post(`/platform/businesses/${tenant.id}/domains`, domainForm);
      setDomainForm({ domain: "", type: "subdomain", is_primary: false });
      setShowDomainForm(false);
      await onReload?.();
    } catch (err) {
      setError(err.message || "No se pudo agregar el dominio");
    } finally {
      setSaving(false);
    }
  };

  const setPrimary = async (domain) => {
    setSaving(true);
    setError("");
    try {
      await api.patch(`/platform/domains/${domain.id}/primary`, {});
      await onReload?.();
    } catch (err) {
      setError(err.message || "No se pudo marcar el dominio principal");
    } finally {
      setSaving(false);
    }
  };

  const deleteDomain = async (domain) => {
    if (!confirm(`¿Eliminar el dominio ${domain.domain}?`)) return;
    setSaving(true);
    setError("");
    try {
      await api.delete(`/platform/domains/${domain.id}`);
      await onReload?.();
    } catch (err) {
      setError(err.message || "No se pudo eliminar el dominio");
    } finally {
      setSaving(false);
    }
  };

  const saveSubscription = async () => {
    setSaving(true);
    setError("");
    try {
      await api.patch(
        `/platform/businesses/${tenant.id}/subscription`,
        subForm,
      );
      await onReload?.();
    } catch (err) {
      setError(err.message || "No se pudo actualizar la suscripción");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0f172a]/60 backdrop-blur-sm flex items-stretch justify-end p-0 md:p-4">
      <motion.div
        initial={{ x: 520, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-full md:max-w-3xl bg-[#f0f4f8] md:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
      >
        <header className="bg-white border-b border-gray-100 p-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Gestión del negocio
            </p>
            <h2 className="text-2xl font-black text-gray-900">{tenant.name}</h2>
            <p className="text-sm text-gray-400">
              {tenant.slug} · {tenant.domain}
            </p>
          </div>
          <IconButton onClick={onClose} title="Cerrar">
            <FiX />
          </IconButton>
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-hide p-5 space-y-5">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          <PanelCard
            icon={FiEdit3}
            title="Datos del negocio"
            subtitle="Nombre, propietario y plan asignado."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label="Nombre"
                value={edit.name}
                onChange={(value) =>
                  setEdit((prev) => ({ ...prev, name: value }))
                }
              />
              <label className="block">
                <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                  Plan
                </span>
                <select
                  value={edit.plan_slug}
                  onChange={(e) =>
                    setEdit((prev) => ({ ...prev, plan_slug: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
                >
                  {plans.map((plan) => (
                    <option key={plan.slug} value={plan.slug}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                  Propietario
                </span>
                <select
                  value={edit.owner_id}
                  onChange={(e) => {
                    const owner = activeOwners.find(
                      (item) => item.id === e.target.value,
                    );
                    setEdit((prev) => ({
                      ...prev,
                      owner_id: e.target.value,
                      owner_name: owner?.name || "",
                      owner_whatsapp: normalizeWhatsapp(owner?.whatsapp || ""),
                    }));
                  }}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
                >
                  <option value="">— Sin propietario —</option>
                  {activeOwners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name} ·{" "}
                      {owner.national_id
                        ? formatDominicanId(owner.national_id)
                        : "sin cédula"}
                    </option>
                  ))}
                </select>
              </label>
              <PhoneField
                label="WhatsApp propietario"
                value={edit.owner_whatsapp}
                onChange={(value) =>
                  setEdit((prev) => ({ ...prev, owner_whatsapp: value }))
                }
              />
            </div>
            <button
              onClick={saveTenant}
              disabled={saving}
              className="mt-4 h-11 px-5 rounded-xl bg-[#00a884] text-white font-black text-sm hover:bg-[#008f72] disabled:opacity-60"
            >
              <FiSave className="inline mr-2" />
              Guardar cambios
            </button>
          </PanelCard>

          <PanelCard
            icon={FiLink}
            title="Dominios del negocio"
            subtitle="Subdominios y dominios personalizados asociados."
          >
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl bg-gray-50 border border-gray-100 p-4">
              <div>
                <p className="text-sm font-black text-gray-900">
                  Agregar dominios desde modal
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Mantiene el lienzo limpio y reduce errores al asociar dominios
                  personalizados.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDomainForm(true)}
                className="h-11 px-4 rounded-xl bg-[#1a2332] text-white font-black text-sm hover:bg-[#111827] flex items-center justify-center gap-2"
              >
                <FiPlus />
                Agregar dominio
              </button>
            </div>
            <div className="space-y-2">
              {tenantDomains.map((domain) => (
                <div
                  key={domain.id}
                  className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-black text-gray-800 truncate">
                      {domain.domain}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {domain.type} ·{" "}
                      {domain.is_primary ? "Principal" : "Secundario"} ·
                      verificado {formatDate(domain.verified_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!domain.is_primary && (
                      <button
                        onClick={() => setPrimary(domain)}
                        className="h-9 px-3 rounded-xl bg-[#00a884]/10 text-[#00a884] text-xs font-black"
                      >
                        Principal
                      </button>
                    )}
                    <IconButton
                      onClick={() => deleteDomain(domain)}
                      title="Eliminar dominio"
                      className="text-red-500"
                    >
                      <FiTrash2 />
                    </IconButton>
                  </div>
                </div>
              ))}
              {tenantDomains.length === 0 && (
                <EmptyState
                  icon={FiGlobe}
                  title="Sin dominios"
                  text="Agrega un dominio o subdominio para este negocio."
                  compact
                />
              )}
            </div>
          </PanelCard>

          <PanelCard
            icon={FiCreditCard}
            title="Suscripción"
            subtitle="Plan, estado comercial y próximo corte."
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <label className="block">
                <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                  Plan
                </span>
                <select
                  value={subForm.plan_slug}
                  onChange={(e) =>
                    setSubForm((prev) => ({
                      ...prev,
                      plan_slug: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
                >
                  {plans.map((plan) => (
                    <option key={plan.slug} value={plan.slug}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                  Estado
                </span>
                <select
                  value={subForm.status}
                  onChange={(e) =>
                    setSubForm((prev) => ({ ...prev, status: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
                >
                  {Object.keys(subscriptionLabels).map((key) => (
                    <option key={key} value={key}>
                      {subscriptionLabels[key]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                  Periodo
                </span>
                <select
                  value={subForm.billing_period}
                  onChange={(e) =>
                    setSubForm((prev) => ({
                      ...prev,
                      billing_period: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
                >
                  <option value="monthly">Mensual</option>
                  <option value="quarterly">Trimestral</option>
                  <option value="yearly">Anual</option>
                </select>
              </label>
              <Field
                label="Próximo corte"
                type="datetime-local"
                value={subForm.next_billing_at}
                onChange={(value) =>
                  setSubForm((prev) => ({ ...prev, next_billing_at: value }))
                }
              />
            </div>
            <button
              onClick={saveSubscription}
              disabled={saving}
              className="mt-4 h-11 px-5 rounded-xl bg-[#00a884] text-white font-black text-sm hover:bg-[#008f72] disabled:opacity-60"
            >
              <FiSave className="inline mr-2" />
              Actualizar suscripción
            </button>
            <div className="mt-4 space-y-2">
              {tenantSubs.slice(0, 3).map((sub) => (
                <MiniLine
                  key={sub.id}
                  title={`${sub.plan_slug} · ${subscriptionLabels[sub.status] || sub.status}`}
                  subtitle={`Periodo ${sub.billing_period} · próximo corte ${formatDate(sub.next_billing_at)}`}
                />
              ))}
            </div>
          </PanelCard>

          <PanelCard
            icon={FiDatabase}
            title="Base de datos"
            subtitle="Aislamiento operativo del negocio."
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <InfoBox
                label="Base"
                value={tenantDb.database_name || tenant.database_name}
              />
              <InfoBox
                label="Estado"
                value={tenantDb.status || tenant.database_status || "Pendiente"}
              />
              <InfoBox
                label="Migración"
                value={tenantDb.migration_version ?? 0}
              />
            </div>
          </PanelCard>
        </main>

        {showDomainForm && (
          <ModalShell
            onClose={() => setShowDomainForm(false)}
            width="max-w-2xl"
          >
            <form
              onSubmit={addDomain}
              className="flex flex-col max-h-[calc(100vh-2rem)]"
            >
              <div className="p-5 sm:p-6 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0">
                <div>
                  <p className="text-[10px] font-black text-[#00a884] uppercase tracking-widest">
                    Dominio del negocio
                  </p>
                  <h2 className="text-xl font-black text-gray-900">
                    Agregar dominio
                  </h2>
                  <p className="text-xs text-gray-400 mt-1">
                    Asocia un subdominio o dominio propio al negocio
                    seleccionado.
                  </p>
                </div>
                <IconButton
                  onClick={() => setShowDomainForm(false)}
                  title="Cerrar"
                >
                  <FiX />
                </IconButton>
              </div>

              <div className="p-5 sm:p-6 overflow-y-auto scrollbar-hide space-y-4">
                <Field
                  label="Dominio"
                  value={domainForm.domain}
                  onChange={(value) =>
                    setDomainForm((prev) => ({ ...prev, domain: value }))
                  }
                  required
                  placeholder="nuevo.ltd.do"
                />
                <label className="block">
                  <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                    Tipo
                  </span>
                  <select
                    value={domainForm.type}
                    onChange={(e) =>
                      setDomainForm((prev) => ({
                        ...prev,
                        type: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
                  >
                    <option value="subdomain">Subdominio</option>
                    <option value="custom_domain">Dominio propio</option>
                  </select>
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <input
                    type="checkbox"
                    checked={Boolean(domainForm.is_primary)}
                    onChange={(e) =>
                      setDomainForm((prev) => ({
                        ...prev,
                        is_primary: e.target.checked,
                      }))
                    }
                    className="w-5 h-5 accent-[#00a884]"
                  />
                  <span>
                    <span className="block text-sm font-black text-gray-900">
                      Marcar como dominio principal
                    </span>
                    <span className="block text-xs text-gray-400">
                      Usa este dominio como referencia principal del negocio.
                    </span>
                  </span>
                </label>
              </div>

              <div className="p-5 sm:p-6 border-t border-gray-100 bg-white flex flex-col sm:flex-row gap-3 shrink-0">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 h-12 rounded-2xl bg-[#00a884] text-white font-black text-sm hover:bg-[#008f72] disabled:opacity-60"
                >
                  <FiPlus className="inline mr-2" />
                  {saving ? "Agregando..." : "Agregar dominio"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDomainForm(false)}
                  className="sm:w-40 h-12 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-black text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </ModalShell>
        )}
      </motion.div>
    </div>
  );
};

const PanelCard = ({ icon: Icon, title, subtitle, children = null }: any) => (
  <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
    <div className="flex items-center gap-3 mb-5">
      <div className="w-11 h-11 rounded-xl bg-[#00a884]/10 text-[#00a884] flex items-center justify-center">
        <Icon className="text-lg" />
      </div>
      <div>
        <h3 className="text-lg font-black text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
      </div>
    </div>
    {children}
  </section>
);

const MiniLine = ({ title, subtitle }: any) => (
  <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-3">
    <p className="text-xs font-black text-gray-800">{title}</p>
    <p className="text-[10px] text-gray-400 mt-0.5">{subtitle}</p>
  </div>
);

const PlanForm = ({ plan = null, onSaved, onCancel }: any) => {
  const editing = Boolean(plan?.slug);
  const [form, setForm] = useState(() => planFormFromPlan(plan));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(planFormFromPlan(plan));
    setError("");
  }, [plan]);

  const update = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (!editing && key === "name" && !prev.slug) {
        next.slug = normalizeSlug(value);
      }
      if (!editing && key === "slug") next.slug = normalizeSlug(value);
      return next;
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        description: form.description,
        price_monthly: Number(form.price_monthly || 0),
        limits: {
          stores: Number(form.stores || 0),
          products: Number(form.products || 0),
          users: Number(form.users || 0),
        },
        active: Boolean(form.active),
      };
      if (editing) {
        await api.patch(`/platform/plans/${plan.slug}`, payload);
      } else {
        await api.post("/platform/plans", { ...payload, slug: form.slug });
      }
      onSaved?.();
    } catch (err) {
      setError(
        err?.message ||
          (editing ? "No se pudo actualizar el plan" : "No se pudo crear el plan"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onCancel} width="max-w-4xl">
      <form
        onSubmit={submit}
        className="flex flex-col max-h-[calc(100vh-2rem)]"
      >
        <div className="p-5 sm:p-6 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0">
          <div>
            <p className="text-[10px] font-black text-[#00a884] uppercase tracking-widest">
              Planes SaaS
            </p>
            <h2 className="text-xl font-black text-gray-900">
              {editing ? "Editar plan" : "Crear nuevo plan"}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              {editing
                ? "Actualiza el precio, los límites y la información comercial del plan."
                : "Define límites comerciales para nuevos negocios sin ocupar el lienzo principal."}
            </p>
          </div>
          {onCancel && (
            <IconButton onClick={onCancel} title="Cerrar">
              <FiX />
            </IconButton>
          )}
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto scrollbar-hide space-y-5">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <Field
              label="Nombre *"
              value={form.name}
              onChange={(value) => update("name", value)}
              required
              placeholder="Pro"
            />
            <Field
              label="Identificador URL *"
              value={form.slug}
              onChange={(value) => update("slug", value)}
              required
              readOnly={editing}
              hint={
                editing
                  ? "El identificador se mantiene fijo para no afectar suscripciones existentes."
                  : "Se utiliza internamente para identificar el plan."
              }
              placeholder="pro"
            />
            <Field
              label="Precio mensual"
              type="number"
              value={form.price_monthly}
              onChange={(value) => update("price_monthly", value)}
            />
            <Field
              label="Productos"
              type="number"
              value={form.products}
              onChange={(value) => update("products", value)}
            />
            <Field
              label="Usuarios"
              type="number"
              value={form.users}
              onChange={(value) => update("users", value)}
            />
            <Field
              label="Sucursales"
              type="number"
              value={form.stores}
              onChange={(value) => update("stores", value)}
            />
            <div className="md:col-span-2 xl:col-span-3">
              <Field
                label="Descripción"
                value={form.description}
                onChange={(value) => update("description", value)}
                placeholder="Plan para negocios en crecimiento"
              />
            </div>
            <label className="md:col-span-2 xl:col-span-3 flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <input
                type="checkbox"
                checked={Boolean(form.active)}
                onChange={(event) => update("active", event.target.checked)}
                className="h-5 w-5 accent-[#00a884]"
              />
              <span>
                <span className="block text-sm font-black text-gray-900">
                  Plan activo
                </span>
                <span className="block text-xs text-gray-400">
                  Los planes inactivos se conservan, pero no estarán disponibles para nuevas suscripciones.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="p-5 sm:p-6 border-t border-gray-100 bg-white flex flex-col sm:flex-row gap-3 shrink-0">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 h-12 rounded-2xl bg-[#00a884] text-white font-black text-sm hover:bg-[#008f72] disabled:opacity-60"
          >
            {editing ? (
              <FiSave className="inline mr-2" />
            ) : (
              <FiPlus className="inline mr-2" />
            )}
            {saving
              ? editing
                ? "Guardando cambios..."
                : "Creando plan..."
              : editing
                ? "Guardar cambios"
                : "Crear plan"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="sm:w-40 h-12 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-black text-sm"
          >
            Cancelar
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

const PlanCard = ({ plan, tenantCount, onReload, onEdit }: any) => {
  const [saving, setSaving] = useState(false);
  const limits = plan.limits || {};
  const toggle = async () => {
    setSaving(true);
    try {
      await api.patch(`/platform/plans/${plan.slug}`, {
        active: !plan.active,
        price_monthly: Number(plan.price_monthly || 0),
      });
      await onReload?.();
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!confirm(`¿Eliminar el plan ${plan.name}?`)) return;
    setSaving(true);
    try {
      await api.delete(`/platform/plans/${plan.slug}`);
      await onReload?.();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="w-12 h-12 rounded-2xl bg-[#00a884]/10 text-[#00a884] flex items-center justify-center">
          <FiCreditCard className="text-xl" />
        </div>
        <Badge value={plan.active ? "active" : "disabled"} />
      </div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
        {plan.slug}
      </p>
      <h3 className="text-lg font-black text-gray-900">{plan.name}</h3>
      <p className="text-sm text-gray-400 mt-1 min-h-[42px]">
        {plan.description || "Plan SaaS de WAMERCIO"}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <InfoBox label="Precio" value={formatMoney(plan.price_monthly)} />
        <InfoBox label="Negocios" value={tenantCount} />
        <InfoBox label="Productos" value={limits.products ?? "—"} />
        <InfoBox label="Usuarios" value={limits.users ?? "—"} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onEdit?.(plan)}
          disabled={saving}
          className="h-10 px-3 rounded-xl bg-[#00a884]/10 text-[#008f72] text-xs font-black hover:bg-[#00a884]/15 flex items-center gap-2"
        >
          <FiEdit3 />
          Editar
        </button>
        <button
          type="button"
          onClick={toggle}
          disabled={saving}
          className="h-10 px-3 rounded-xl bg-gray-100 text-gray-700 text-xs font-black hover:bg-gray-200"
        >
          {plan.active ? "Desactivar" : "Activar"}
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={saving || tenantCount > 0}
          className="h-10 px-3 rounded-xl bg-red-50 text-red-600 text-xs font-black hover:bg-red-100 disabled:opacity-40"
        >
          Eliminar
        </button>
      </div>
    </div>
  );
};

const PlansCatalogView = ({
  plans,
  tenants,
  onNew,
  onEdit,
  onReload,
  showHeader = true,
}: any) => (
  <section className="space-y-5">
    {showHeader && (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            Planes SaaS
          </p>
          <h2 className="text-lg font-black text-gray-900">
            Planes disponibles
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            La creación de planes se realiza en modal para evitar formularios
            embebidos en el lienzo.
          </p>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="h-11 px-4 rounded-xl bg-[#00a884] text-white hover:bg-[#008f72] flex items-center justify-center gap-2 text-xs font-black shadow-md shadow-[#00a884]/20"
        >
          <FiPlus />
          Nuevo plan
        </button>
      </div>
    )}
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {safeList(plans).map((plan) => (
        <PlanCard
          key={plan.id || plan.slug}
          plan={plan}
          tenantCount={
            safeList(tenants).filter((tenant) => tenant.plan_slug === plan.slug)
              .length
          }
          onReload={onReload}
          onEdit={onEdit}
        />
      ))}
      {safeList(plans).length === 0 && (
        <div className="md:col-span-2 xl:col-span-3">
          <EmptyState
            icon={FiCreditCard}
            title="Sin planes"
            text="La base central todavía no tiene planes configurados."
          />
        </div>
      )}
    </div>
  </section>
);

const PlansHubView = ({
  activeSection,
  onSectionChange,
  plans,
  subscriptions,
  tenants,
  onNewPlan,
  onEditPlan,
  onNewTenant,
  onPlanReload,
  onSelectTenant,
}: any) => {
  const planCount = safeList(plans).length;
  const subscriptionCount = safeList(subscriptions).length;
  const showingSubscriptions = activeSection === "subscriptions";

  return (
    <section className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Comercial SaaS
            </p>
            <h2 className="text-lg font-black text-gray-900">
              Gestión de planes y suscripciones
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Administra los planes comerciales y las suscripciones de los
              negocios desde una sola sección.
            </p>
          </div>
          <button
            type="button"
            onClick={showingSubscriptions ? onNewTenant : onNewPlan}
            className="h-11 px-4 rounded-xl bg-[#00a884] text-white hover:bg-[#008f72] flex items-center justify-center gap-2 text-xs font-black shadow-md shadow-[#00a884]/20"
          >
            <FiPlus />
            {showingSubscriptions ? "Nuevo negocio" : "Nuevo plan"}
          </button>
        </div>
        <div className="flex flex-col md:flex-row gap-3">
          <OwnersHubTab
            active={!showingSubscriptions}
            icon={FiCreditCard}
            label="Planes"
            count={planCount}
            onClick={() => onSectionChange("plans")}
          />
          <OwnersHubTab
            active={showingSubscriptions}
            icon={FiTrendingUp}
            label="Suscripciones"
            count={subscriptionCount}
            onClick={() => onSectionChange("subscriptions")}
          />
        </div>
      </div>

      {showingSubscriptions ? (
        <SubscriptionsView
          subscriptions={subscriptions}
          tenants={tenants}
          onSelectTenant={onSelectTenant}
          showHeader={false}
        />
      ) : (
        <PlansCatalogView
          plans={plans}
          tenants={tenants}
          onNew={onNewPlan}
          onEdit={onEditPlan}
          onReload={onPlanReload}
          showHeader={false}
        />
      )}
    </section>
  );
};

const emptyCatalogCategoryForm = {
  name: "",
  icon: "📦",
  description: "",
  sort_order: "0",
  active: true,
};
const emptyCatalogGroupForm = {
  category_id: "",
  name: "",
  description: "",
  sort_order: "0",
  active: true,
};
const emptyCatalogDetailForm = {
  category_id: "",
  group_id: "",
  name: "",
  description: "",
  sort_order: "0",
  active: true,
};
const emptyCatalogBrandForm = {
  name: "",
  logo: "",
  origin_country: "",
  description: "",
  sort_order: "0",
  active: true,
};
const emptyCatalogProductForm = {
  name: "",
  description: "",
  barcode: "",
  image: "",
  image_source_url: "",
  category_id: "",
  group_id: "",
  detail_id: "",
  brand_id: "",
  format: "Unidad",
  sort_order: "0",
  active: true,
};

const formatCatalogDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-DO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const buildInternalBarcode = () => {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const tail = Math.floor(Math.random() * 90 + 10).toString();
  return `${stamp}${tail}`;
};

const catalogList = (catalog, key) => safeList(catalog?.[key]);
const catalogStats = (catalog) => catalog?.stats || {};

const CatalogImage = ({
  item,
  alt = "",
  className = "",
  imgClassName = "w-full h-full object-cover",
  fallback = "📦",
}: any) => {
  const candidates = useMemo(() => catalogImageCandidates(item), [item]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const candidateKey = candidates.join("|");

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidateKey]);

  const src = candidates[candidateIndex] || "";
  return (
    <div className={className}>
      {src ? (
        <img
          key={src}
          src={src}
          alt={alt}
          className={imgClassName}
          loading="lazy"
          decoding="async"
          onError={() => setCandidateIndex((current) => current + 1)}
        />
      ) : (
        fallback
      )}
    </div>
  );
};

const CatalogSelect = ({
  label,
  value,
  onChange,
  children,
  disabled = false,
}: any) => (
  <label className="block">
    <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
      {label}
    </span>
    <select
      value={value || ""}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10 disabled:opacity-60"
    >
      {children}
    </select>
  </label>
);

const CatalogTextarea = ({
  label,
  value,
  onChange,
  placeholder = "",
  rows = 4,
  right = null,
}: any) => (
  <label className="block relative">
    <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
      {label}
    </span>
    {right && <div className="absolute right-2 top-7 z-10">{right}</div>}
    <textarea
      value={value || ""}
      rows={rows}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 font-semibold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10 resize-none"
    />
  </label>
);

const CatalogStatusSelect = ({ value, onChange }: any) => (
  <CatalogSelect
    label="Estado"
    value={value ? "active" : "inactive"}
    onChange={(v) => onChange?.(v === "active")}
  >
    <option value="active">Activa</option>
    <option value="inactive">Inactiva</option>
  </CatalogSelect>
);

const CatalogCategoryModal = ({ item = null, onCancel, onSaved }: any) => {
  const [form, setForm] = useState(() =>
    item
      ? {
          name: item.name || "",
          icon: item.icon || "📦",
          description: item.description || "",
          sort_order: String(item.sort_order ?? 0),
          active: item.active !== false,
        }
      : { ...emptyCatalogCategoryForm },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, sort_order: Number(form.sort_order || 0) };
      if (item?.id)
        await api.patch(`/platform/catalog/categories/${item.id}`, payload);
      else await api.post("/platform/catalog/categories", payload);
      onSaved?.();
    } catch (err) {
      setError(err.message || "No se pudo guardar la categoría");
    } finally {
      setSaving(false);
    }
  };
  return (
    <ModalShell onClose={onCancel} width="max-w-2xl">
      <form onSubmit={submit}>
        <div className="p-5 sm:p-6 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-gray-900">
              {item?.id ? "Editar Categoría" : "Nueva Categoría"}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Clasificación principal del catálogo global.
            </p>
          </div>
          <IconButton onClick={onCancel} title="Cerrar">
            <FiX />
          </IconButton>
        </div>
        <div className="p-5 sm:p-6 space-y-4">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-[72px_1fr] gap-3">
            <Field
              label="Ícono"
              value={form.icon}
              onChange={(v) => update("icon", v)}
              placeholder="🥩"
            />
            <Field
              label="Nombre *"
              value={form.name}
              onChange={(v) => update("name", v)}
              required
              placeholder="Ej: Carnes y Pescados"
            />
          </div>
          <CatalogTextarea
            label="Descripción"
            value={form.description}
            onChange={(v) => update("description", v)}
            placeholder="Descripción opcional..."
            right={
              <span className="rounded-lg bg-[#00a884] text-white text-[10px] font-black px-2 py-1">
                ✦ IA
              </span>
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field
              label="Orden"
              type="number"
              value={form.sort_order}
              onChange={(v) => update("sort_order", v)}
            />
            <CatalogStatusSelect
              value={form.active}
              onChange={(v) => update("active", v)}
            />
          </div>
        </div>
        <div className="p-5 sm:p-6 border-t border-gray-100 bg-white flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-gray-200 text-gray-600 font-black py-4"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-2xl bg-[#00a884] text-white font-black py-4 shadow-lg shadow-[#00a884]/20"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

const CatalogGroupModal = ({
  item = null,
  categories = [],
  categoryId = "",
  onCancel,
  onSaved,
}: any) => {
  const [form, setForm] = useState(() =>
    item
      ? {
          category_id: item.category_id || categoryId || "",
          name: item.name || "",
          description: item.description || "",
          sort_order: String(item.sort_order ?? 0),
          active: item.active !== false,
        }
      : { ...emptyCatalogGroupForm, category_id: categoryId || "" },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, sort_order: Number(form.sort_order || 0) };
      if (item?.id)
        await api.patch(`/platform/catalog/groups/${item.id}`, payload);
      else await api.post("/platform/catalog/groups", payload);
      onSaved?.();
    } catch (err) {
      setError(err.message || "No se pudo guardar el grupo");
    } finally {
      setSaving(false);
    }
  };
  return (
    <ModalShell onClose={onCancel} width="max-w-2xl">
      <form onSubmit={submit}>
        <div className="p-5 sm:p-6 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-gray-900">
              {item?.id ? "Editar Grupo" : "Nuevo Grupo"}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Agrupación de productos dentro de la categoría.
            </p>
          </div>
          <IconButton onClick={onCancel} title="Cerrar">
            <FiX />
          </IconButton>
        </div>
        <div className="p-5 sm:p-6 space-y-4">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}
          <CatalogSelect
            label="Categoría *"
            value={form.category_id}
            onChange={(v) => update("category_id", v)}
          >
            <option value="">Selecciona categoría</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.icon} {cat.name}
              </option>
            ))}
          </CatalogSelect>
          <Field
            label="Nombre *"
            value={form.name}
            onChange={(v) => update("name", v)}
            required
            placeholder="Ej: Carnes, Mariscos..."
          />
          <CatalogTextarea
            label="Descripción"
            value={form.description}
            onChange={(v) => update("description", v)}
            placeholder="Descripción opcional..."
            right={
              <span className="rounded-lg bg-[#00a884] text-white text-[10px] font-black px-2 py-1">
                ✦ IA
              </span>
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field
              label="Orden"
              type="number"
              value={form.sort_order}
              onChange={(v) => update("sort_order", v)}
            />
            <CatalogStatusSelect
              value={form.active}
              onChange={(v) => update("active", v)}
            />
          </div>
        </div>
        <div className="p-5 sm:p-6 border-t border-gray-100 bg-white flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-gray-200 text-gray-600 font-black py-4"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-2xl bg-[#00a884] text-white font-black py-4 shadow-lg shadow-[#00a884]/20"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

const CatalogDetailModal = ({
  item = null,
  categories = [],
  groups = [],
  categoryId = "",
  groupId = "",
  onCancel,
  onSaved,
}: any) => {
  const [form, setForm] = useState(() =>
    item
      ? {
          category_id: item.category_id || categoryId || "",
          group_id: item.group_id || groupId || "",
          name: item.name || "",
          description: item.description || "",
          sort_order: String(item.sort_order ?? 0),
          active: item.active !== false,
        }
      : {
          ...emptyCatalogDetailForm,
          category_id: categoryId || "",
          group_id: groupId || "",
        },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const categoryGroups = groups.filter(
    (group) => !form.category_id || group.category_id === form.category_id,
  );
  const update = (key, value) =>
    setForm((prev) => ({
      ...prev,
      [key]: value,
      ...(key === "category_id" ? { group_id: "" } : {}),
    }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, sort_order: Number(form.sort_order || 0) };
      if (item?.id)
        await api.patch(`/platform/catalog/details/${item.id}`, payload);
      else await api.post("/platform/catalog/details", payload);
      onSaved?.();
    } catch (err) {
      setError(err.message || "No se pudo guardar el detalle");
    } finally {
      setSaving(false);
    }
  };
  return (
    <ModalShell onClose={onCancel} width="max-w-2xl">
      <form onSubmit={submit}>
        <div className="p-5 sm:p-6 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-gray-900">
              {item?.id ? "Editar Detalle" : "Nuevo Detalle"}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Segmenta los productos dentro de un grupo para filtrar el catálogo
              con mayor precisión.
            </p>
          </div>
          <IconButton onClick={onCancel} title="Cerrar">
            <FiX />
          </IconButton>
        </div>
        <div className="p-5 sm:p-6 space-y-4">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}
          <CatalogSelect
            label="Categoría *"
            value={form.category_id}
            onChange={(v) => update("category_id", v)}
          >
            <option value="">Selecciona categoría</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.icon} {cat.name}
              </option>
            ))}
          </CatalogSelect>
          <CatalogSelect
            label="Grupo"
            value={form.group_id}
            onChange={(v) => update("group_id", v)}
          >
            <option value="">Sin grupo específico</option>
            {categoryGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </CatalogSelect>
          <Field
            label="Nombre *"
            value={form.name}
            onChange={(v) => update("name", v)}
            required
            placeholder="Ej: Pollo, Mariscos, Botellas..."
          />
          <CatalogTextarea
            label="Descripción"
            value={form.description}
            onChange={(v) => update("description", v)}
            placeholder="Descripción opcional..."
            right={
              <span className="rounded-lg bg-[#00a884] text-white text-[10px] font-black px-2 py-1">
                ✦ IA
              </span>
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field
              label="Orden"
              type="number"
              value={form.sort_order}
              onChange={(v) => update("sort_order", v)}
            />
            <CatalogStatusSelect
              value={form.active}
              onChange={(v) => update("active", v)}
            />
          </div>
        </div>
        <div className="p-5 sm:p-6 border-t border-gray-100 bg-white flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-gray-200 text-gray-600 font-black py-4"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-2xl bg-orange-500 text-white font-black py-4 shadow-lg shadow-orange-500/20"
          >
            {saving ? "Guardando..." : "Guardar Detalle"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

const CatalogBrandModal = ({ item = null, onCancel, onSaved }: any) => {
  const [form, setForm] = useState(() =>
    item
      ? {
          name: item.name || "",
          logo: item.logo || "",
          origin_country: item.origin_country || "",
          description: item.description || "",
          sort_order: String(item.sort_order ?? 0),
          active: item.active !== false,
        }
      : { ...emptyCatalogBrandForm },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, sort_order: Number(form.sort_order || 0) };
      if (item?.id)
        await api.patch(`/platform/catalog/brands/${item.id}`, payload);
      else await api.post("/platform/catalog/brands", payload);
      onSaved?.();
    } catch (err) {
      setError(err.message || "No se pudo guardar la marca");
    } finally {
      setSaving(false);
    }
  };
  return (
    <ModalShell onClose={onCancel} width="max-w-xl">
      <form onSubmit={submit}>
        <div className="p-5 sm:p-6 border-b border-gray-100 flex items-start justify-between gap-3">
          <h2 className="text-xl font-black text-gray-900">
            {item?.id ? "Editar Marca" : "Nueva Marca"}
          </h2>
          <IconButton onClick={onCancel} title="Cerrar">
            <FiX />
          </IconButton>
        </div>
        <div className="p-5 sm:p-6 space-y-4">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}
          <Field
            label="Nombre de la Marca *"
            value={form.name}
            onChange={(v) => update("name", v)}
            required
            placeholder="Ej: Nestlé, Coca-Cola, Goya..."
          />
          <Field
            label="Logo de la Marca"
            value={form.logo}
            onChange={(v) => update("logo", v)}
            placeholder="URL o ruta de biblioteca de medios"
          />
          <CatalogTextarea
            label="Descripción"
            value={form.description}
            onChange={(v) => update("description", v)}
            placeholder="Descripción opcional..."
            right={
              <span className="rounded-lg bg-[#00a884] text-white text-[10px] font-black px-2 py-1">
                ✦ IA
              </span>
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field
              label="País de Origen"
              value={form.origin_country}
              onChange={(v) => update("origin_country", v)}
              placeholder="Ej: República Dominicana"
            />
            <Field
              label="Orden"
              type="number"
              value={form.sort_order}
              onChange={(v) => update("sort_order", v)}
            />
          </div>
          <CatalogStatusSelect
            value={form.active}
            onChange={(v) => update("active", v)}
          />
        </div>
        <div className="p-5 sm:p-6 border-t border-gray-100 bg-white flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-gray-200 text-gray-600 font-black py-4"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-2xl bg-purple-600 text-white font-black py-4 shadow-lg shadow-purple-600/20"
          >
            {saving ? "Guardando..." : "Guardar Marca"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

const CatalogProductModal = ({
  item = null,
  catalog,
  initialCategoryId = "",
  initialBarcode = "",
  onCancel,
  onSaved,
}: any) => {
  const categories = catalogList(catalog, "categories");
  const groups = catalogList(catalog, "groups");
  const details = catalogList(catalog, "details");
  const brands = catalogList(catalog, "brands");
  const [form, setForm] = useState(() =>
    item
      ? {
          name: item.name || "",
          description: item.description || "",
          barcode: item.barcode || "",
          image: item.image || "",
          image_source_url: item.image_source_url || "",
          category_id: item.category_id || "",
          group_id: item.group_id || "",
          detail_id: item.detail_id || "",
          brand_id: item.brand_id || "",
          format: item.format || "Unidad",
          sort_order: String(item.sort_order ?? 0),
          active: item.active !== false,
        }
      : {
          ...emptyCatalogProductForm,
          barcode: initialBarcode || buildInternalBarcode(),
          category_id: initialCategoryId || "",
        },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [imageNotice, setImageNotice] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<any>(null);
  useEffect(() => {
    if (!imagePreview) return undefined;
    return () => URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);
  const categoryGroups = groups.filter(
    (group) => !form.category_id || group.category_id === form.category_id,
  );
  const groupDetails = details.filter(
    (detail) =>
      (!form.category_id || detail.category_id === form.category_id) &&
      (!form.group_id || detail.group_id === form.group_id),
  );
  const update = (key, value) =>
    setForm((prev) => ({
      ...prev,
      [key]: value,
      ...(key === "category_id" ? { group_id: "", detail_id: "" } : {}),
      ...(key === "group_id" ? { detail_id: "" } : {}),
    }));
  const autoDescription = () => {
    const category =
      categories.find((cat) => cat.id === form.category_id)?.name || "catálogo";
    const brand = brands.find((item) => item.id === form.brand_id)?.name || "";
    update(
      "description",
      `${form.name || "Producto"} ${brand ? `de ${brand}` : ""} disponible para el catálogo global de WAMERCIO. Ideal para que los colmados puedan agregarlo rápidamente a su inventario con una descripción clara y comercial.`
        .replace(/\s+/g, " ")
        .trim(),
    );
  };
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, sort_order: Number(form.sort_order || 0) };
      if (item?.id)
        await api.patch(`/platform/catalog/products/${item.id}`, payload);
      else await api.post("/platform/catalog/products", payload);
      onSaved?.();
    } catch (err) {
      setError(err.message || "No se pudo guardar el producto");
    } finally {
      setSaving(false);
    }
  };
  const replaceProductImage = async (file) => {
    setError("");
    setImageNotice("");
    if (!file) return;
    if (!item?.id) {
      setError(
        "Primero guarda el producto para poder reemplazar su imagen manteniendo la misma URL en R2.",
      );
      return;
    }
    const currentImageUrl = form.image_source_url || form.image;
    if (!currentImageUrl) {
      setError(
        "Este producto no tiene una imagen existente para reemplazar manteniendo el mismo nombre y URL.",
      );
      return;
    }
    const localPreview = URL.createObjectURL(file);
    setImagePreview(localPreview);
    setUploadingImage(true);
    try {
      const body = new FormData();
      body.append("image", file);
      const response = await api.upload(
        `/platform/catalog/products/${item.id}/image`,
        body,
        "PATCH",
      );
      update("image", response.image || currentImageUrl);
      update("image_source_url", response.image_source_url || currentImageUrl);
      setImageNotice(
        "Imagen reemplazada correctamente en R2 manteniendo el mismo nombre, directorio y URL.",
      );
    } catch (err) {
      setImagePreview("");
      setError(err.message || "No se pudo reemplazar la imagen en R2");
    } finally {
      setUploadingImage(false);
    }
  };
  const selectedImage = imagePreview || form.image_source_url || form.image;
  return (
    <ModalShell onClose={onCancel} width="max-w-7xl">
      <form
        onSubmit={submit}
        className="flex flex-col max-h-[calc(100vh-2rem)]"
      >
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="grid grid-cols-1 xl:grid-cols-[430px_1fr] min-h-full">
            <div className="bg-gray-50 p-6 lg:p-8 xl:p-10 border-r border-gray-100 space-y-5">
              <div className="relative rounded-3xl border border-gray-200 bg-white min-h-[340px] lg:min-h-[420px] flex flex-col items-center justify-center overflow-hidden p-6 group">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    replaceProductImage(file);
                  }}
                />
                {selectedImage ? (
                  <CatalogImage
                    item={{
                      image: imagePreview || form.image,
                      image_source_url: imagePreview
                        ? ""
                        : form.image_source_url,
                    }}
                    alt="Producto"
                    className="w-full h-full flex items-center justify-center"
                    imgClassName="w-full max-h-[320px] lg:max-h-[420px] object-contain"
                    fallback={
                      <div className="text-center">
                        <div className="w-16 h-16 rounded-2xl bg-[#00a884]/10 flex items-center justify-center text-3xl mx-auto mb-4">
                          🖼️
                        </div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">
                          Imagen no disponible
                        </p>
                      </div>
                    }
                  />
                ) : (
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-2xl bg-[#00a884]/10 flex items-center justify-center text-3xl mx-auto mb-4">
                      🖼️
                    </div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">
                      Cargar fotografía
                    </p>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-2 px-4">
                  <button
                    type="button"
                    disabled={uploadingImage}
                    onClick={() => imageInputRef.current?.click()}
                    className="h-10 px-4 rounded-xl bg-white text-[#0f172a] text-[10px] font-black shadow-lg border border-gray-100 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {uploadingImage ? "SUBIENDO..." : "CAMBIAR IMAGEN"}
                  </button>
                  {imagePreview && (
                    <button
                      type="button"
                      disabled={uploadingImage}
                      onClick={() => setImagePreview("")}
                      className="h-10 px-4 rounded-xl bg-red-500 text-white text-[10px] font-black shadow-lg hover:bg-red-600 disabled:opacity-60"
                    >
                      RESTAURAR VISTA
                    </button>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400 mb-1">
                  Vista previa del producto
                </p>
                <p className="text-xs text-gray-500">
                  La nueva imagen reemplaza el objeto actual en Cloudflare R2
                  usando el mismo nombre, directorio y URL para no romper
                  compatibilidad.
                </p>
                {imageNotice && (
                  <p className="mt-2 rounded-xl bg-[#00a884]/10 text-[#008f72] px-3 py-2 text-[11px] font-black">
                    {imageNotice}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InfoBox label="Posición" value={form.sort_order || 0} />
                <InfoBox
                  label="Visibilidad"
                  value={form.active ? "ACTIVO" : "OCULTO"}
                />
              </div>
            </div>
            <div className="p-6 lg:p-8 xl:p-10 space-y-6 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-4">
                    <span className="rounded-full bg-purple-600 text-white text-[10px] font-black px-4 py-1 uppercase tracking-widest">
                      Producto Maestro
                    </span>
                    <span className="rounded-full bg-gray-100 text-gray-500 text-[10px] font-black px-4 py-1 uppercase tracking-widest">
                      Administración global
                    </span>
                  </div>
                  <h2 className="text-3xl font-black text-gray-900 leading-tight">
                    {item?.id
                      ? form.name || "Editar Producto Global"
                      : "Nuevo Producto Global"}
                  </h2>
                  <p className="text-sm text-gray-400 mt-2">
                    El contenido del modal ahora admite desplazamiento vertical
                    para recorrer la información más rápido sin perder el patrón
                    visual del catálogo.
                  </p>
                </div>
                <IconButton onClick={onCancel} title="Cerrar">
                  <FiX />
                </IconButton>
              </div>
              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                  {error}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_100px] gap-4 items-end">
                <Field
                  label="Nombre comercial"
                  value={form.name}
                  onChange={(v) => update("name", v)}
                  required
                  placeholder="Ej: Café Santo Domingo Molido..."
                />
                <Field
                  label="Código de barras (SKU/EAN)"
                  value={form.barcode}
                  onChange={(v) => update("barcode", v)}
                  placeholder="Opcional pero recomendado"
                />
                <button
                  type="button"
                  onClick={() => update("barcode", buildInternalBarcode())}
                  className="h-[50px] rounded-2xl bg-[#0f172a] text-white text-xs font-black"
                >
                  INTERNO
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <CatalogSelect
                  label="Categoría"
                  value={form.category_id}
                  onChange={(v) => update("category_id", v)}
                >
                  <option value="">Elegir...</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.name}
                    </option>
                  ))}
                </CatalogSelect>
                <CatalogSelect
                  label="Grupo"
                  value={form.group_id}
                  onChange={(v) => update("group_id", v)}
                >
                  <option value="">Elegir...</option>
                  {categoryGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </CatalogSelect>
                <CatalogSelect
                  label="Detalle"
                  value={form.detail_id}
                  onChange={(v) => update("detail_id", v)}
                >
                  <option value="">Elegir...</option>
                  {groupDetails.map((detail) => (
                    <option key={detail.id} value={detail.id}>
                      {detail.name}
                    </option>
                  ))}
                </CatalogSelect>
                <CatalogSelect
                  label="Marca"
                  value={form.brand_id}
                  onChange={(v) => update("brand_id", v)}
                >
                  <option value="">Sin marca</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </CatalogSelect>
                <CatalogSelect
                  label="Formato"
                  value={form.format}
                  onChange={(v) => update("format", v)}
                >
                  {[
                    "Unidad",
                    "Libra",
                    "Funda",
                    "Botella",
                    "Paquete",
                    "Caja",
                    "Cajetilla",
                    "Cartón",
                    "Galón",
                    "Lata",
                    "Saco",
                    "Sobre",
                  ].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </CatalogSelect>
              </div>
              <CatalogTextarea
                label="Descripción comercial"
                value={form.description}
                onChange={(v) => update("description", v)}
                rows={6}
                placeholder="Describe las características principales del producto para el catálogo..."
                right={
                  <button
                    type="button"
                    onClick={autoDescription}
                    className="rounded-xl bg-[#0f172a] text-white text-[10px] font-black px-3 py-2"
                  >
                    IA ✨ AUTO-REDACTAR
                  </button>
                }
              />
            </div>
          </div>
        </div>
        <div className="p-5 sm:p-6 border-t border-gray-100 bg-white flex flex-col sm:flex-row gap-3 justify-between shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="sm:w-56 rounded-2xl text-gray-400 font-black py-4 tracking-[0.35em] text-[10px]"
          >
            IGNORAR CAMBIOS
          </button>
          <button
            type="submit"
            disabled={saving}
            className="sm:w-80 rounded-2xl bg-[#0f172a] text-white font-black py-4 tracking-[0.25em] text-xs shadow-xl shadow-gray-900/10"
          >
            {saving ? "PUBLICANDO..." : "PUBLICAR CAMBIOS"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

const CatalogGlobalView = ({ catalog, onReload, onCatalogReload }: any) => {
  const [section, setSection] = useState("categories");
  const [searchText, setSearchText] = useState("");
  const [modal, setModal] = useState<any>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionTone, setActionTone] = useState("success");
  const [importProgress, setImportProgress] = useState({
    active: false,
    percent: 0,
    processed: 0,
    total: 0,
    imported: 0,
  });
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({});
  const [selectedGroupByCategory, setSelectedGroupByCategory] = useState<
    Record<string, string>
  >({});
  const [selectedDetailByCategory, setSelectedDetailByCategory] = useState<
    Record<string, string>
  >({});
  const [updatingBrandId, setUpdatingBrandId] = useState("");
  const [remoteProducts, setRemoteProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [productsHasMore, setProductsHasMore] = useState(false);
  const [productsTotal, setProductsTotal] = useState(0);
  const [productsRefreshKey, setProductsRefreshKey] = useState(0);
  const productRequestRef = useRef(0);
  const actionTimerRef = useRef<any>(null);
  const stats = catalogStats(catalog);
  const categories = catalogList(catalog, "categories");
  const groups = catalogList(catalog, "groups");
  const details = catalogList(catalog, "details");
  const brands = catalogList(catalog, "brands");
  const products = remoteProducts;
  const suggestions = catalogList(catalog, "suggestions");
  const q = normalizeFilterText(searchText);
  const productPageSize = 120;

  useEffect(
    () => () => {
      if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    },
    [],
  );

  const showActionMessage = useCallback(
    (message, autoClear = true, tone = "success") => {
      if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
      setActionTone(tone);
      setActionMessage(message || "");
      if (message && autoClear) {
        actionTimerRef.current = setTimeout(() => setActionMessage(""), 4500);
      }
    },
    [],
  );

  const reloadCatalog = useCallback(async () => {
    const result = onCatalogReload ? await onCatalogReload() : await onReload?.();
    setProductsRefreshKey((current) => current + 1);
    return result;
  }, [onCatalogReload, onReload]);

  const reloadAndClose = async () => {
    setModal(null);
    await reloadCatalog();
  };
  const actionMessageClass =
    actionTone === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : actionTone === "info"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-[#00a884]/20 bg-[#f0fdf8] text-[#008f72]";

  const handleBarcodeDetected = useCallback(async (barcode: string) => {
    setScannerBusy(true);
    try {
      const response = await api.get(`/platform/catalog/barcode/${encodeURIComponent(barcode)}`);
      setScannerOpen(false);
      setSection("categories");
      setSearchText(barcode);
      if (response?.found && response?.product) {
        setModal({ type: "product", item: response.product, categoryId: response.product.category_id });
        showActionMessage(`Producto encontrado: ${response.product.name}`, true, "success");
        return;
      }
      setModal({ type: "product", barcode });
      showActionMessage("El código no existe en el catálogo global. Completa los datos para crear el producto maestro.", false, "info");
    } catch (err: any) {
      showActionMessage(err?.message || "No se pudo buscar el código", false, "error");
    } finally {
      setScannerBusy(false);
    }
  }, [showActionMessage]);

  const importCatalog = async () => {
    if (importProgress.active) return;
    if (
      !confirm(
        "Se importarán categorías, grupos, detalles, marcas y productos desde el catálogo predeterminado incluido en la instalación.\n\nLa acción crea registros nuevos y actualiza coincidencias existentes sin vaciar el catálogo. ¿Deseas continuar?",
      )
    )
      return;
    const batchSize = 100;
    let nextOffset = 0;
    let totalImported = 0;
    setImportProgress({
      active: true,
      percent: 0,
      processed: 0,
      total: 0,
      imported: 0,
    });
    showActionMessage("Importando catálogo global... 0%", false, "info");
    try {
      for (;;) {
        const response = await api.post("/platform/catalog/import-default", {
          offset: nextOffset,
          limit: batchSize,
        });
        totalImported += Number(response.imported || 0);
        const total = Number(response.total || 0);
        const processed = Number(
          response.processed ?? response.next_offset ?? totalImported,
        );
        const percent = Math.min(
          100,
          Math.max(
            0,
            Number(
              response.percent ||
                (total ? Math.round((processed / total) * 100) : 100),
            ),
          ),
        );
        setImportProgress({
          active: true,
          percent,
          processed,
          total,
          imported: totalImported,
        });
        showActionMessage(
          `Importando catálogo global... ${percent}% (${formatNumber(processed)} de ${formatNumber(total)} productos)`,
          false,
          "info",
        );
        if (response.done || processed >= total) break;
        nextOffset = Number(response.next_offset || processed);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      await reloadCatalog();
      setExpandedCategories({});
      setSelectedGroupByCategory({});
      setSelectedDetailByCategory({});
      setImportProgress({
        active: false,
        percent: 100,
        processed: totalImported,
        total: totalImported,
        imported: totalImported,
      });
      showActionMessage(
        `Catálogo importado correctamente: ${formatNumber(totalImported)} productos procesados.`,
      );
    } catch (err) {
      setImportProgress({
        active: false,
        percent: 0,
        processed: 0,
        total: 0,
        imported: 0,
      });
      showActionMessage(
        err.message || "No se pudo importar el catálogo",
        false,
        "error",
      );
      try {
        await reloadCatalog();
      } catch (_) {}
    }
  };

  const clearCatalog = async () => {
    if (
      !confirm(
        "Esta acción vaciará el catálogo global dentro de la aplicación (categorías, grupos, detalles, marcas y productos).\n\nNo eliminará imágenes ni archivos almacenados en el bucket R2 de Cloudflare.\n\n¿Deseas continuar?",
      )
    )
      return;
    showActionMessage(
      "Vaciando catálogo global en la aplicación...",
      false,
      "info",
    );
    try {
      const response = await api.delete("/platform/catalog");
      await reloadCatalog();
      setExpandedCategories({});
      setSelectedGroupByCategory({});
      setSelectedDetailByCategory({});
      showActionMessage(
        response?.preserved_assets
          ? "Catálogo global vaciado correctamente. Las imágenes del bucket R2 se conservaron."
          : "Catálogo global vaciado correctamente.",
      );
    } catch (err) {
      showActionMessage(
        err.message || "No se pudo vaciar el catálogo",
        false,
        "error",
      );
    }
  };

  const clearSuggestions = async () => {
    if (!confirm("¿Limpiar todas las sugerencias pendientes del catálogo?"))
      return;
    showActionMessage("Limpiando sugerencias...", false, "info");
    try {
      await api.delete("/platform/catalog/suggestions");
      await reloadCatalog();
      showActionMessage("Sugerencias limpiadas correctamente.");
    } catch (err) {
      showActionMessage(
        err.message || "No se pudieron limpiar las sugerencias",
        false,
        "error",
      );
    }
  };

  const remove = async (kind, item) => {
    if (!confirm(`¿Eliminar ${item.name || item.barcode}?`)) return;
    await api.delete(`/platform/catalog/${kind}/${item.id}`);
    await reloadCatalog();
  };

  const toggleCategoryStatus = async (category) => {
    await api.patch(`/platform/catalog/categories/${category.id}`, {
      ...category,
      active: !category.active,
    });
    await reloadCatalog();
  };

  const expandedCategoryId =
    Object.keys(expandedCategories).find((key) => expandedCategories[key]) ||
    "";
  const selectedGroupId = expandedCategoryId
    ? selectedGroupByCategory[expandedCategoryId] || ""
    : "";
  const selectedDetailId = expandedCategoryId
    ? selectedDetailByCategory[expandedCategoryId] || ""
    : "";

  const loadProducts = useCallback(
    async (offset = 0, append = false) => {
      if (section !== "categories" || (!q && !expandedCategoryId)) {
        setRemoteProducts([]);
        setProductsTotal(0);
        setProductsHasMore(false);
        setProductsError("");
        return;
      }

      const requestID = productRequestRef.current + 1;
      productRequestRef.current = requestID;
      setProductsLoading(true);
      setProductsError("");
      if (!append) setRemoteProducts([]);

      const params = new URLSearchParams({
        view: "products",
        include_inactive: "1",
        limit: String(productPageSize),
        offset: String(offset),
      });
      if (q) params.set("q", searchText.trim());
      if (!q && expandedCategoryId) params.set("category_id", expandedCategoryId);
      if (!q && selectedGroupId) params.set("group_id", selectedGroupId);
      if (!q && selectedDetailId) params.set("detail_id", selectedDetailId);

      try {
        const payload = await api.get(`/platform/catalog?${params.toString()}`);
        if (productRequestRef.current !== requestID) return;
        const nextProducts = catalogList(payload, "products");
        const filteredTotal = Number(
          payload?.stats?.products_filtered_total ?? nextProducts.length,
        );
        setRemoteProducts((current) => {
          if (!append) return nextProducts;
          const byID = new Map(current.map((item) => [String(item.id), item]));
          nextProducts.forEach((item) => byID.set(String(item.id), item));
          return Array.from(byID.values());
        });
        setProductsTotal(filteredTotal);
        setProductsHasMore(offset + nextProducts.length < filteredTotal);
      } catch (err: any) {
        if (productRequestRef.current !== requestID) return;
        setProductsError(err?.message || "No se pudieron cargar los productos del catálogo");
        if (!append) setRemoteProducts([]);
      } finally {
        if (productRequestRef.current === requestID) setProductsLoading(false);
      }
    },
    [
      expandedCategoryId,
      productPageSize,
      q,
      searchText,
      section,
      selectedDetailId,
      selectedGroupId,
    ],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProducts(0, false);
    }, q ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [loadProducts, productsRefreshKey, q]);

  const filteredProducts = filterCatalogProducts(products, {
    search: searchText,
  });
  const filteredBrands = brands.filter(
    (brand) =>
      !q ||
      normalizeFilterText(`${brand.name} ${brand.origin_country}`).includes(q),
  );
  const filteredSuggestions = suggestions.filter(
    (item) =>
      !q ||
      normalizeFilterText(
        `${item.barcode} ${item.owner_name} ${item.owner_whatsapp} ${item.tenant_name}`,
      ).includes(q),
  );

  const firstMatchingCategoryId =
    q && !expandedCategoryId
      ? categories.find((category) =>
          filteredProducts.some(
            (product) => product.category_id === category.id,
          ),
        )?.id || ""
      : "";

  const toggleCategory = (categoryId) =>
    setExpandedCategories((current) =>
      current[categoryId] ? {} : { [categoryId]: true },
    );
  const stop = (event) => event.stopPropagation();
  const productCountForGroup = (categoryId, groupId) => {
    const group = groups.find(
      (item) => item.category_id === categoryId && item.id === groupId,
    );
    return Number(
      group?.products_count ??
        products.filter(
          (product) =>
            product.category_id === categoryId && product.group_id === groupId,
        ).length,
    );
  };
  const productCountForDetail = (categoryId, detailId) => {
    const detail = details.find(
      (item) => item.category_id === categoryId && item.id === detailId,
    );
    return Number(
      detail?.products_count ??
        products.filter(
          (product) =>
            product.category_id === categoryId && product.detail_id === detailId,
        ).length,
    );
  };

  const selectGroup = (categoryId, groupId) => {
    setSelectedGroupByCategory((current) => ({
      ...current,
      [categoryId]: current[categoryId] === groupId ? "" : groupId,
    }));
    setSelectedDetailByCategory((current) => ({
      ...current,
      [categoryId]: "",
    }));
    setExpandedCategories({ [categoryId]: true });
  };

  const selectDetail = (categoryId, detailId) => {
    setSelectedDetailByCategory((current) => ({
      ...current,
      [categoryId]: current[categoryId] === detailId ? "" : detailId,
    }));
    setExpandedCategories({ [categoryId]: true });
  };

  const toggleBrand = async (brand) => {
    const nextActive = !brand.active;
    const verb = nextActive ? "activar" : "desactivar";
    const consequence = nextActive ? "activados" : "desactivados";
    if (
      !confirm(
        `¿${verb.charAt(0).toUpperCase()}${verb.slice(1)} la marca "${brand.name}"? Todos sus productos globales asociados también serán ${consequence}.`,
      )
    )
      return;
    setUpdatingBrandId(brand.id);
    showActionMessage(
      nextActive
        ? `Activando marca ${brand.name}...`
        : `Desactivando marca ${brand.name}...`,
      false,
      "info",
    );
    try {
      const response = await api.patch(`/platform/catalog/brands/${brand.id}`, {
        ...brand,
        active: nextActive,
      });
      const updated = response.products_updated ?? brand.products_count ?? 0;
      await reloadCatalog();
      showActionMessage(
        `Marca ${nextActive ? "activada" : "desactivada"}. Se ${nextActive ? "activaron" : "desactivaron"} ${formatNumber(updated)} producto(s) asociados.`,
      );
    } catch (err) {
      showActionMessage(
        err.message || "No se pudo actualizar la marca",
        false,
        "error",
      );
    } finally {
      setUpdatingBrandId("");
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900">Catálogo Global</h2>
          <p className="text-sm text-gray-500 max-w-3xl">
            Gestiona categorías y marcas disponibles para todos los colmados, y
            agrega productos directamente desde cada categoría.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={importProgress.active}
            onClick={importCatalog}
            className={`h-11 px-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-xs font-black flex items-center gap-2 ${importProgress.active ? "opacity-70 cursor-wait" : ""}`}
          >
            {importProgress.active ? (
              <FiRefreshCw className="animate-spin" />
            ) : (
              <FiArchive />
            )}{" "}
            {importProgress.active ? "Importando..." : "Importar JSON"}
          </button>
          <button
            type="button"
            disabled={importProgress.active}
            onClick={clearCatalog}
            className={`h-11 px-4 rounded-xl border border-red-200 bg-red-50 text-red-600 text-xs font-black flex items-center gap-2 ${importProgress.active ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <FiTrash2 /> Vaciar Catálogo
          </button>
          <button
            type="button"
            disabled={importProgress.active}
            onClick={clearSuggestions}
            className={`h-11 px-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-xs font-black flex items-center gap-2 ${importProgress.active ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <FiTrash2 /> Limpiar Sugerencias
          </button>
          <button
            type="button"
            disabled={importProgress.active}
            onClick={() =>
              section === "brands"
                ? setModal({ type: "brand" })
                : setModal({ type: "category" })
            }
            className={`h-11 px-4 rounded-xl text-white text-xs font-black flex items-center gap-2 shadow-md ${section === "brands" ? "bg-purple-600 shadow-purple-600/20" : "bg-[#0f172a] shadow-gray-900/10"} ${importProgress.active ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <FiPlus />{" "}
            {section === "brands" ? "Nueva Marca" : "Nueva Categoría"}
          </button>
        </div>
      </div>
      {actionMessage && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-bold ${actionMessageClass}`}
        >
          <div className="flex items-center justify-between gap-3">
            <span>{actionMessage}</span>
            {importProgress.active && <span>{importProgress.percent}%</span>}
          </div>
          {importProgress.active && (
            <div className="mt-3 h-3 rounded-full bg-white/70 border border-white overflow-hidden">
              <div
                className="h-full rounded-full bg-[#00a884] transition-all duration-300"
                style={{ width: `${importProgress.percent}%` }}
              />
            </div>
          )}
          {importProgress.active && (
            <p className="mt-2 text-[11px] font-black opacity-80">
              Procesados {formatNumber(importProgress.processed)} de{" "}
              {formatNumber(importProgress.total)} productos. El catálogo se
              actualizará automáticamente al finalizar.
            </p>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {[
          ["Categorías", stats.categories_total, "text-gray-900"],
          ["Cat. activas", stats.categories_active, "text-[#00a884]"],
          ["Grupos", stats.groups_total, "text-amber-600"],
          ["Detalles", stats.details_total, "text-orange-600"],
          ["Marcas", stats.brands_total, "text-gray-900"],
          ["Marcas activas", stats.brands_active, "text-purple-600"],
          ["Productos activos", stats.products_active, "text-[#00a884]"],
          ["Productos inactivos", stats.products_inactive, "text-red-500"],
        ].map(([label, value, color]) => (
          <div
            key={label}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"
          >
            <p className={`text-2xl font-black ${color}`}>
              {formatNumber(value)}
            </p>
            <p className="text-xs text-gray-400 mt-1">{label}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="inline-flex rounded-2xl bg-gray-100 p-1 gap-1 w-full md:w-auto">
          {[
            {
              key: "categories",
              label: "Categorías",
              icon: FiGrid,
              count: categories.length,
            },
            {
              key: "brands",
              label: "Marcas",
              icon: FiArchive,
              count: brands.length,
            },
            {
              key: "suggestions",
              label: "Sugerencias",
              icon: FiZap,
              count: stats.suggestions_pending || suggestions.length,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setSection(tab.key);
                  setSearchText("");
                }}
                className={`flex-1 md:flex-none h-11 px-5 rounded-xl text-sm font-black flex items-center justify-center gap-2 ${section === tab.key ? "bg-white text-[#00a884] shadow-sm" : "text-gray-500 hover:text-gray-900"}`}
              >
                <Icon />
                {tab.label}
                <span className="rounded-full bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5">
                  {formatNumber(tab.count)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-100 px-1 py-3 shadow-sm -mx-1">
        <div className="relative">
          <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && section === "categories" && isBarcodeQuery(searchText)) {
                event.preventDefault();
                void handleBarcodeDetected(searchText);
              }
            }}
            placeholder={
              section === "categories"
                ? "Buscar producto global por nombre, marca o código..."
                : section === "brands"
                  ? "Buscar marca global..."
                  : "Buscar sugerencia por código, propietario o colmado..."
            }
            className={`w-full h-12 rounded-2xl border border-gray-200 bg-gray-50 pl-11 ${section === "categories" ? "pr-24" : "pr-10"} text-sm font-bold outline-none transition-all focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10`}
          />
          {section === "categories" && (
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-[#0f172a] text-white hover:bg-[#1e293b] flex items-center justify-center shadow-sm"
              title="Escanear código de barras"
              aria-label="Escanear código de barras"
            >
              <FiCamera />
            </button>
          )}
          {searchText && section === "categories" && (
            <button
              type="button"
              onClick={() => setSearchText("")}
              className="absolute right-12 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 flex items-center justify-center"
              aria-label="Limpiar búsqueda"
            >
              <FiX />
            </button>
          )}
          {searchText && section !== "categories" && (
            <button
              type="button"
              onClick={() => setSearchText("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 flex items-center justify-center"
            >
              <FiX />
            </button>
          )}
        </div>
      </div>

      {section === "categories" && (
        <div className="space-y-4">
          {!q && !expandedCategoryId && (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-6 text-center shadow-sm">
              <p className="text-sm font-black text-gray-700">Selecciona una categoría</p>
              <p className="mt-1 text-xs font-semibold text-gray-400">
                Los productos se cargan por categoría para mantener el panel rápido incluso con catálogos grandes.
              </p>
            </div>
          )}
          {productsError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {productsError}
            </div>
          )}
          {productsLoading && remoteProducts.length === 0 && (
            <div className="rounded-2xl border border-gray-100 bg-white px-6 py-8 text-center shadow-sm">
              <FiRefreshCw className="mx-auto mb-3 animate-spin text-2xl text-[#00a884]" />
              <p className="text-xs font-black text-gray-500">Cargando productos...</p>
            </div>
          )}
          {q && !productsLoading && filteredProducts.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
              <FiSearch className="mx-auto mb-3 text-4xl text-gray-200" />
              <p className="text-sm font-black text-gray-700">No se encontraron productos</p>
              <p className="mt-1 text-xs font-semibold text-gray-400">
                Busca por el nombre exacto, la marca o el código del producto.
              </p>
            </div>
          )}
          {(q && filteredProducts.length === 0 ? [] : categories).map((category) => {
            const catProducts = filteredProducts.filter(
              (product) => product.category_id === category.id,
            );
            if (q && catProducts.length === 0) return null;
            const catGroups = groups.filter(
              (group) => group.category_id === category.id,
            );
            const selectedGroupId = selectedGroupByCategory[category.id] || "";
            const selectedDetailId =
              selectedDetailByCategory[category.id] || "";
            const selectedGroup = selectedGroupId
              ? catGroups.find((group) => group.id === selectedGroupId)
              : null;
            const groupScopedProducts = selectedGroupId
              ? catProducts.filter(
                  (product) => product.group_id === selectedGroupId,
                )
              : catProducts;
            const categoryDetails = details.filter(
              (detail) =>
                detail.category_id === category.id &&
                (!selectedGroupId || detail.group_id === selectedGroupId),
            );
            const filteredCategoryProducts = selectedDetailId
              ? groupScopedProducts.filter(
                  (product) => product.detail_id === selectedDetailId,
                )
              : groupScopedProducts;
            const isExpanded =
              Boolean(expandedCategories[category.id]) ||
              Boolean(firstMatchingCategoryId === category.id);
            const visibleProducts = filteredCategoryProducts;
            return (
              <div
                key={category.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleCategory(category.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ")
                      toggleCategory(category.id);
                  }}
                  className="px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 cursor-pointer hover:bg-gray-50/70 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-xl shrink-0">
                      {category.icon || "📦"}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-black text-gray-900 truncate">
                        {category.name}
                      </h3>
                      <p className="text-xs text-gray-400">
                        {formatNumber(category.products_count)} productos ·{" "}
                        {formatNumber(category.groups_count)} grupos
                      </p>
                    </div>
                  </div>
                  <div
                    className="flex flex-wrap items-center gap-2"
                    onClick={stop}
                  >
                    <button
                      onClick={() =>
                        setModal({ type: "product", categoryId: category.id })
                      }
                      className="h-9 px-3 rounded-xl bg-[#00a884]/10 text-[#00a884] text-xs font-black"
                    >
                      + Producto
                    </button>
                    <button
                      onClick={() =>
                        setModal({ type: "group", categoryId: category.id })
                      }
                      className="h-9 px-3 rounded-xl bg-amber-50 text-amber-700 text-xs font-black"
                    >
                      + Grupo
                    </button>
                    <button
                      onClick={() =>
                        setModal({ type: "category", item: category })
                      }
                      className="h-9 px-3 rounded-xl bg-blue-50 text-blue-600 text-xs font-black"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => toggleCategoryStatus(category)}
                      className={`w-12 h-7 rounded-full p-1 ${category.active ? "bg-[#00a884]" : "bg-gray-300"}`}
                      title={
                        category.active
                          ? "Desactivar categoría"
                          : "Activar categoría"
                      }
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white transition-transform ${category.active ? "translate-x-5" : ""}`}
                      />
                    </button>
                    <button
                      onClick={() => remove("categories", category)}
                      className="h-9 px-3 rounded-xl bg-red-50 text-red-600 text-xs font-black"
                    >
                      Eliminar
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleCategory(category.id)}
                      className="h-9 w-9 rounded-xl text-gray-400 hover:bg-gray-100 flex items-center justify-center"
                      title={
                        isExpanded ? "Plegar categoría" : "Desplegar categoría"
                      }
                    >
                      <FiChevronDown
                        className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <>
                    <div className="px-5 py-3 border-y border-amber-100 bg-amber-50/30">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">
                          Grupos
                        </p>
                        <button
                          onClick={() =>
                            setModal({ type: "group", categoryId: category.id })
                          }
                          className="h-7 px-3 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-black"
                        >
                          + Grupo
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {catGroups.map((group) => {
                          const selected = selectedGroupId === group.id;
                          return (
                            <div
                              key={group.id}
                              className="inline-flex items-center gap-1"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  selectGroup(category.id, group.id)
                                }
                                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black transition-colors ${selected ? "border-amber-500 bg-amber-100 text-amber-800" : "border-amber-200 bg-white text-amber-700 hover:bg-amber-50"}`}
                              >
                                {group.name}
                                <span className="text-[9px] opacity-70">
                                  {formatNumber(
                                    productCountForGroup(category.id, group.id),
                                  )}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setModal({ type: "group", item: group })
                                }
                                className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center"
                                title="Editar grupo"
                              >
                                <FiEdit3 />
                              </button>
                              <button
                                type="button"
                                onClick={() => remove("groups", group)}
                                className="w-7 h-7 rounded-full bg-red-50 text-red-500 flex items-center justify-center"
                                title="Eliminar grupo"
                              >
                                <FiTrash2 />
                              </button>
                            </div>
                          );
                        })}
                        {catGroups.length === 0 && (
                          <span className="text-xs text-gray-400">
                            Sin grupos todavía
                          </span>
                        )}
                      </div>
                    </div>

                    {selectedGroupId && (
                      <div className="px-5 py-3 border-b border-orange-100 bg-orange-50/30">
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest">
                            Detalles de{" "}
                            <span className="normal-case tracking-normal">
                              {selectedGroup?.name || "grupo"}
                            </span>
                          </p>
                          <button
                            onClick={() =>
                              setModal({
                                type: "detail",
                                categoryId: category.id,
                                groupId: selectedGroupId,
                              })
                            }
                            className="h-7 px-3 rounded-lg bg-orange-100 text-orange-700 text-[10px] font-black"
                          >
                            + Detalle
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {categoryDetails.map((detail) => {
                            const selected = selectedDetailId === detail.id;
                            return (
                              <div
                                key={detail.id}
                                className="inline-flex items-center gap-1"
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    selectDetail(category.id, detail.id)
                                  }
                                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black transition-colors ${selected ? "border-orange-500 bg-orange-100 text-orange-800" : "border-orange-200 bg-white text-orange-700 hover:bg-orange-50"}`}
                                >
                                  {detail.name}
                                  <span className="text-[9px] opacity-70">
                                    {formatNumber(
                                      productCountForDetail(
                                        category.id,
                                        detail.id,
                                      ),
                                    )}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setModal({ type: "detail", item: detail })
                                  }
                                  className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center"
                                  title="Editar detalle"
                                >
                                  <FiEdit3 />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => remove("details", detail)}
                                  className="w-7 h-7 rounded-full bg-red-50 text-red-500 flex items-center justify-center"
                                  title="Eliminar detalle"
                                >
                                  <FiTrash2 />
                                </button>
                              </div>
                            );
                          })}
                          {categoryDetails.length === 0 && (
                            <span className="text-xs text-gray-400">
                              Sin detalles todavía para este grupo.
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {(selectedGroupId || selectedDetailId) && (
                      <div className="px-5 py-2 border-b border-gray-100 bg-gray-50 flex flex-wrap items-center gap-2 text-[11px] font-bold text-gray-500">
                        <span>Filtro activo:</span>
                        {selectedGroup && (
                          <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-1">
                            Grupo: {selectedGroup.name}
                          </span>
                        )}
                        {selectedDetailId && (
                          <span className="rounded-full bg-orange-100 text-orange-800 px-2 py-1">
                            Detalle:{" "}
                            {
                              categoryDetails.find(
                                (detail) => detail.id === selectedDetailId,
                              )?.name
                            }
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedGroupByCategory((current) => ({
                              ...current,
                              [category.id]: "",
                            }));
                            setSelectedDetailByCategory((current) => ({
                              ...current,
                              [category.id]: "",
                            }));
                          }}
                          className="rounded-full bg-white border border-gray-200 px-2 py-1 text-gray-500 hover:text-gray-900"
                        >
                          Limpiar filtro
                        </button>
                      </div>
                    )}

                    <div className="divide-y divide-gray-50">
                      {visibleProducts.map((product) => (
                        <div
                          key={product.id}
                          role="button"
                          tabIndex={0}
                          onClick={() =>
                            setModal({ type: "product", item: product })
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ")
                              setModal({ type: "product", item: product });
                          }}
                          className={`px-5 py-3 flex items-center justify-between gap-4 cursor-pointer hover:bg-gray-50/80 transition-colors ${product.active ? "" : "opacity-70"}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <CatalogImage
                              item={product}
                              alt={product.name || ""}
                              className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden shrink-0"
                              imgClassName="w-full h-full object-cover"
                              fallback="📦"
                            />
                            <div className="min-w-0">
                              <h4 className="text-sm font-black text-gray-900 truncate">
                                {product.name}
                              </h4>
                              <p className="text-[11px] text-gray-400 truncate">
                                {product.format} ·{" "}
                                {product.barcode || "sin código"} ·{" "}
                                {product.group_name || "Sin grupo"}{" "}
                                {product.detail_name
                                  ? `· ${product.detail_name}`
                                  : ""}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <span className="rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-[10px] font-black">
                                  Grupo: {product.group_name || "Sin grupo"}
                                </span>
                                {product.detail_name && (
                                  <span className="rounded-full bg-orange-50 text-orange-600 px-2 py-0.5 text-[10px] font-black">
                                    Detalle: {product.detail_name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div
                            className="flex items-center gap-2 shrink-0"
                            onClick={stop}
                          >
                            <span className="rounded-full bg-purple-50 text-purple-600 px-2 py-1 text-[10px] font-black">
                              {product.brand_name || "Sin marca"}
                            </span>
                            {!product.active && (
                              <span className="rounded-full bg-red-50 text-red-500 px-2 py-1 text-[10px] font-black">
                                Oculto
                              </span>
                            )}
                            <button
                              onClick={() =>
                                setModal({ type: "product", item: product })
                              }
                              className="h-8 px-3 rounded-lg bg-blue-50 text-blue-600 text-xs font-black"
                            >
                              Editar
                            </button>
                          </div>
                        </div>
                      ))}
                      {filteredCategoryProducts.length === 0 && (
                        <p className="px-5 py-8 text-xs text-gray-400 text-center">
                          Sin productos visibles para este filtro.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {(productsHasMore || (productsLoading && remoteProducts.length > 0)) && (
            <div className="flex flex-col items-center gap-2 py-2">
              <p className="text-[11px] font-bold text-gray-400">
                Mostrando {formatNumber(remoteProducts.length)} de {formatNumber(productsTotal)} productos
              </p>
              <button
                type="button"
                disabled={productsLoading || !productsHasMore}
                onClick={() => void loadProducts(remoteProducts.length, true)}
                className="h-10 px-5 rounded-xl border border-gray-200 bg-white text-xs font-black text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {productsLoading ? "Cargando..." : "Cargar más productos"}
              </button>
            </div>
          )}
        </div>
      )}

      {section === "brands" && (
        <div className="space-y-3">
          {filteredBrands.map((brand) => (
            <div
              key={brand.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-black overflow-hidden">
                  {brand.logo ? (
                    <img
                      src={brand.logo}
                      alt=""
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    brand.name.slice(0, 2)
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-black text-gray-900 truncate">
                    {brand.name}{" "}
                    <span
                      className={`rounded-full text-[10px] px-2 py-1 ${brand.active ? "bg-purple-50 text-purple-600" : "bg-red-50 text-red-500"}`}
                    >
                      {brand.active ? "Activa" : "Inactiva"}
                    </span>
                  </h3>
                  <p className="text-xs text-gray-400">
                    {formatNumber(brand.products_count)} productos asociados{" "}
                    {brand.origin_country ? `· ${brand.origin_country}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setModal({ type: "brand", item: brand })}
                  className="h-9 px-3 rounded-xl bg-blue-50 text-blue-600 text-xs font-black"
                >
                  Editar
                </button>
                <button
                  onClick={() => remove("brands", brand)}
                  className="h-9 px-3 rounded-xl bg-red-50 text-red-600 text-xs font-black"
                >
                  Eliminar
                </button>
                <button
                  disabled={updatingBrandId === brand.id}
                  onClick={() => toggleBrand(brand)}
                  className={`w-12 h-7 rounded-full p-1 transition-colors ${brand.active ? "bg-purple-600" : "bg-gray-300"} ${updatingBrandId === brand.id ? "opacity-60 cursor-wait" : ""}`}
                  title={
                    brand.active
                      ? "Desactivar marca y productos asociados"
                      : "Activar marca y productos asociados"
                  }
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white transition-transform ${brand.active ? "translate-x-5" : ""}`}
                  />
                </button>
              </div>
            </div>
          ))}
          {filteredBrands.length === 0 && (
            <EmptyState
              icon={FiArchive}
              title="Sin marcas"
              text="Importa el JSON o crea una marca para organizar los productos del catálogo."
            />
          )}
        </div>
      )}

      {section === "suggestions" && (
        <div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="grid grid-cols-[1fr_120px_180px_1fr_150px_150px] gap-3 px-5 py-3 bg-gray-50 text-xs font-black text-gray-900">
              <span>Código de Barras</span>
              <span>Peticiones</span>
              <span>Última Petición</span>
              <span>Propietario</span>
              <span>Teléfono</span>
              <span>Acciones</span>
            </div>
            {filteredSuggestions.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[1fr_120px_180px_1fr_150px_150px] gap-3 px-5 py-4 border-t border-gray-100 items-center text-sm"
              >
                <span className="font-black text-gray-900">{item.barcode}</span>
                <span>
                  <span className="rounded-full bg-amber-50 text-amber-700 px-3 py-1 font-black">
                    {item.requests_count}
                  </span>
                </span>
                <span className="text-gray-500">
                  {formatCatalogDate(item.last_requested_at)}
                </span>
                <span className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                  <b>{item.owner_name || "—"}</b>
                  <br />
                  <small className="text-gray-400 font-black uppercase tracking-widest">
                    {item.tenant_name || "Colmado"}
                  </small>
                </span>
                <span className="rounded-xl bg-[#00a884]/10 text-[#008f72] font-black px-3 py-2">
                  {item.owner_whatsapp || "—"}
                </span>
                <button
                  onClick={() =>
                    setModal({ type: "product", barcode: item.barcode })
                  }
                  className="h-10 rounded-xl bg-[#00a884] text-white text-xs font-black"
                >
                  Crear Producto
                </button>
              </div>
            ))}
            {filteredSuggestions.length === 0 && (
              <EmptyState
                icon={FiZap}
                title="Sin sugerencias"
                text="Cuando un colmado solicite un producto no encontrado, aparecerá aquí para convertirlo en producto maestro."
                compact
              />
            )}
          </div>
        </div>
      )}

      {modal?.type === "category" && (
        <CatalogCategoryModal
          item={modal.item}
          onCancel={() => setModal(null)}
          onSaved={reloadAndClose}
        />
      )}
      {modal?.type === "group" && (
        <CatalogGroupModal
          item={modal.item}
          categoryId={modal.categoryId}
          categories={categories}
          onCancel={() => setModal(null)}
          onSaved={reloadAndClose}
        />
      )}
      {modal?.type === "detail" && (
        <CatalogDetailModal
          item={modal.item}
          categoryId={modal.categoryId}
          groupId={modal.groupId}
          categories={categories}
          groups={groups}
          onCancel={() => setModal(null)}
          onSaved={reloadAndClose}
        />
      )}
      {modal?.type === "brand" && (
        <CatalogBrandModal
          item={modal.item}
          onCancel={() => setModal(null)}
          onSaved={reloadAndClose}
        />
      )}
      {modal?.type === "product" && (
        <CatalogProductModal
          item={modal.item}
          initialCategoryId={modal.categoryId}
          initialBarcode={modal.barcode}
          catalog={catalog}
          onCancel={() => setModal(null)}
          onSaved={reloadAndClose}
        />
      )}
      <BarcodeScanner
        open={scannerOpen}
        busy={scannerBusy}
        onClose={() => setScannerOpen(false)}
        onDetected={handleBarcodeDetected}
      />
    </section>
  );
};

const buildDefaultLandingConfig = (domain = "ltd.do") => ({
  brand_name: "WAMERCIO",
  brand_subtitle: "",
  brand_icon: "",
  logo_url: "/brand/colmapro-app-icon.png",
  nav_links: [
    { label: "Inicio", url: "#inicio" },
    { label: "Solución", url: "#solucion" },
    { label: "Módulos", url: "#modulos" },
    { label: "Planes", url: "#planes" },
    { label: "Preguntas", url: "#faq" },
  ],
  access_button_text: "Acceso",
  access_button_url: "#/admin",
  demo_button_text: "Demo gratis",
  demo_button_url: "#contacto",
  badge_text: "SaaS hecho en República Dominicana 🇩🇴",
  hero_title: "Digitaliza tu colmado",
  hero_highlight: "sin complicaciones.",
  hero_description:
    "La plataforma todo en uno para colmados y minimarkets. Controla inventario, fiado, entregas a domicilio y vende en línea desde cualquier dispositivo.",
  primary_button_text: "Solicitar demo gratis",
  primary_button_url: "#contacto",
  secondary_button_text: "Ver video",
  secondary_button_url: "#solucion",
  hero_image_url:
    "https://images.unsplash.com/photo-1556742044-3c52d6e88c62?q=80&w=1200&auto=format&fit=crop",
  hero_stat_label: "Nuevos pedidos",
  hero_stat_value: "Funda lista",
  trust_items: ["PWA Instalable", "RD$", "Control de fiado"],
  problems_title: "Tu negocio no necesita más desorden.",
  problems_highlight: "Necesita más control.",
  problems_description:
    "Administrar un colmado con métodos tradicionales es agotador. WAMERCIO elimina estos dolores de cabeza.",
  problems: [
    {
      icon: "message",
      title: "WhatsApp desordenado",
      text: "Mensajes perdidos, audios confusos y errores al tomar notas.",
    },
    {
      icon: "book",
      title: "Fiado en libretas",
      text: "Cálculos manuales, cuadernos perdidos y deudas difíciles de cobrar.",
    },
    {
      icon: "package",
      title: "Inventario ciego",
      text: "Vendes productos que ya no tienes o no sabes qué falta comprar.",
    },
    {
      icon: "map",
      title: "Entregas sin zonas",
      text: "Problemas para cobrar el envío correcto según el barrio.",
    },
    {
      icon: "dollar",
      title: "Caja sin control",
      text: "Cierres de caja al ojo sin saber realmente cuánto se vendió.",
    },
    {
      icon: "users",
      title: "Sin historial",
      text: "No sabes quién compra más ni cuáles son sus favoritos.",
    },
    {
      icon: "search",
      title: "Precios ocultos",
      text: "Clientes preguntando precios a cada rato por falta de catálogo.",
    },
    {
      icon: "userx",
      title: "Dueño dependiente",
      text: "Si no estás en el colmado, todo se vuelve un caos.",
    },
  ],
  modules_title: "Todo tu negocio en una mano.",
  modules_description:
    "Módulos conectados entre sí diseñados específicamente para la realidad del comercio dominicano.",
  modules: [
    {
      icon: "smartphone",
      title: "Tienda PWA",
      text: "Enlace propio para que tus clientes pidan desde su celular sin descargar aplicaciones.",
    },
    {
      icon: "shoppingbag",
      title: "Funda de compra",
      text: "Experiencia intuitiva para armar pedidos y enviarlos por WhatsApp.",
    },
    {
      icon: "monitor",
      title: "Punto de Venta",
      text: "Cobra en el local, controla caja y agiliza la atención al cliente.",
    },
    {
      icon: "filetext",
      title: "Fiado digital",
      text: "Adiós a la libreta. Controla deudas, abonos y balances por cliente.",
    },
    {
      icon: "layers",
      title: "Inventario Real",
      text: "Gestiona existencias, categorías y precios de forma masiva.",
    },
    {
      icon: "truck",
      title: "Entrega por barrio",
      text: "Zonas de entrega dinámicas con costos de envío configurables.",
    },
    {
      icon: "piechart",
      title: "Reportes Diarios",
      text: "Ventas, ganancias y movimientos de caja en tiempo real.",
    },
    {
      icon: "users",
      title: "Base de Clientes",
      text: "Conoce a tus clientes, sus gustos y frecuencia de compra.",
    },
  ],
  rd_title: "Diseñado para vender en RD, no adaptado a medias.",
  rd_description:
    "WAMERCIO entiende cómo se vende en República Dominicana: pedidos rápidos, clientes del barrio, entrega cercana, pagos mixtos, fiado, transferencias, efectivo y negocios que necesitan operar desde el celular.",
  rd_tags: [
    "RD$",
    "Cédula",
    "Funda",
    "Fiado",
    "Entrega por barrio",
    "Provincias y municipios",
    "Sectores y zonas de entrega",
    "WhatsApp",
    "Efectivo y transferencia",
    "Negocios de barrio",
    "PWA",
  ],
  rd_card_title:
    "Comienza más rápido con una base pensada para negocios dominicanos.",
  rd_card_text:
    "No tienes que empezar desde cero. WAMERCIO está preparado para ayudarte a configurar productos, categorías y zonas de entrega adaptadas al mercado dominicano.",
  rd_card_items: [
    "Catálogo base de productos y marcas",
    "Territorio dominicano completo (Provincias, Municipios)",
    "Sectores, barrios y zonas de entrega predefinidas",
  ],
  audience_title: "Una plataforma para cada tipo de negocio de barrio.",
  business_types: [
    "Colmados",
    "Super colmados",
    "Minimarkets",
    "Provisiones",
    "Surtidoras",
    "Bodegas",
    "Pulperías",
    "Negocios con entrega local",
    "Negocios con ventas fiadas",
    "Comercios con cajeros",
    "Comercios con repartidores",
    "Propietarios con varios negocios",
  ],
  roles_title: "Cada persona trabaja desde su propio panel.",
  roles: [
    {
      icon: "usercheck",
      title: "Dueño o administrador",
      text: "Controla productos, inventario, usuarios, clientes, reportes, zonas de entrega, métodos de pago y configuración del negocio.",
    },
    {
      icon: "monitor",
      title: "Cajero",
      text: "Registra ventas, consulta sus movimientos y gestiona caja desde un panel simple.",
    },
    {
      icon: "navigation",
      title: "Repartidor",
      text: "Recibe pedidos asignados, revisa rutas y actualiza el estado de las entregas.",
    },
    {
      icon: "smartphone",
      title: "Cliente",
      text: "Consulta productos, arma su funda, hace pedidos, revisa sus compras y puede ver su fiado.",
    },
    {
      icon: "settings",
      title: "Administración SaaS",
      text: "Administra negocios, planes, dominios, catálogo global, territorio, bancos y configuración general de la plataforma.",
    },
  ],
  steps_title: "Empieza a digitalizar tu negocio en pocos pasos.",
  steps: [
    {
      title: "Crea tu negocio",
      text: "Registra el nombre, logo, horarios, zona y datos principales.",
    },
    {
      title: "Activa tu catálogo",
      text: "Agrega productos manualmente o parte de un catálogo base para avanzar más rápido.",
    },
    {
      title: "Comparte tu enlace",
      text: "Envía tu tienda a tus clientes para que entren desde el celular.",
    },
    {
      title: "Recibe pedidos",
      text: "Los clientes agregan productos a la funda y envían pedidos organizados.",
    },
    {
      title: "Despacha y entrega",
      text: "Administra estados, caja, entregas y repartidores.",
    },
    {
      title: "Controla y crece",
      text: "Consulta reportes, clientes, ventas, fiados e inventario.",
    },
  ],
  benefits_title: "Más ventas, más orden y más control.",
  benefits: [
    "Reduce pedidos perdidos.",
    "Evita confusiones por WhatsApp.",
    "Controla el inventario de forma real.",
    "Organiza el fiado sin libretas.",
    "Mejora la atención al cliente.",
    "Acelera ventas en caja.",
    "Coordina entregas por sector o barrio.",
    "Controla cajeros y repartidores.",
    "Consulta reportes del día.",
    "Administra el negocio desde celular, tablet o PC.",
  ],
  plans_title: "Planes a tu medida",
  plans_description:
    "Escoge el plan que mejor se adapte al tamaño de tu colmado o minimarket.",
  pricing_plans: [
    {
      name: "Inicial",
      price: "Consultar",
      description: "Perfecto para comenzar a vender en línea.",
      features: [
        "Tienda en línea (PWA)",
        "Catálogo básico",
        "Gestión de pedidos",
        "Base de clientes",
        "Soporte básico",
      ],
      popular: false,
      button_text: "Solicitar información",
      button_url: "#contacto",
    },
    {
      name: "Pro",
      price: "Recomendado",
      description: "La solución completa para tu operación diaria.",
      features: [
        "Todo lo del plan Inicial",
        "Punto de venta (POS)",
        "Inventario avanzado",
        "Control de fiado",
        "Aplicación para repartidores",
        "Reportes de caja",
      ],
      popular: true,
      button_text: "Solicitar información",
      button_url: "#contacto",
    },
    {
      name: "Empresarial",
      price: "Cotizar",
      description: "Para dueños con múltiples sucursales.",
      features: [
        "Multi-negocio",
        "Usuarios ilimitados",
        "Capacidad masiva",
        "Soporte 24/7 prioritario",
        "Configuración avanzada",
      ],
      popular: false,
      button_text: "Solicitar información",
      button_url: "#contacto",
    },
  ],
  faq_title: "Preguntas frecuentes",
  faq_description: "Resolvemos tus dudas principales sobre WAMERCIO.",
  faqs: [
    {
      question: "¿WAMERCIO es solo para colmados?",
      answer:
        "No. También sirve para minimarkets, provisiones, surtidoras, bodegas, pulperías y otros negocios de barrio.",
    },
    {
      question: "¿Mis clientes tienen que descargar una aplicación?",
      answer:
        "No necesariamente. La tienda funciona como PWA, por lo que el cliente puede abrirla desde el navegador y guardarla en su celular.",
    },
    {
      question: "¿Puedo manejar entregas a domicilio?",
      answer:
        "Sí. Puedes configurar zonas de entrega, sectores, barrios, cobertura y costos.",
    },
    {
      question: "¿Puedo manejar fiado?",
      answer:
        "Sí. La plataforma permite controlar clientes con crédito, balances pendientes, pagos y reportes.",
    },
    {
      question: "¿Puedo tener cajeros y repartidores?",
      answer:
        "Sí. El sistema incluye roles y paneles separados para administrador, cajero y repartidor.",
    },
    {
      question: "¿Puedo vender desde mi propio enlace?",
      answer:
        "Sí. Cada negocio puede tener su propio enlace para compartirlo con sus clientes.",
    },
    {
      question: "¿Sirve para varios negocios?",
      answer:
        "Sí. La plataforma está diseñada para administrar uno o varios negocios desde un entorno SaaS.",
    },
    {
      question: "¿Puedo controlar mis productos?",
      answer:
        "Sí. Puedes gestionar productos, categorías, marcas, precios, disponibilidad e inventario.",
    },
    {
      question: "¿Acepta pagos?",
      answer:
        "La plataforma registra efectivo, transferencia manual, tarjeta cobrada en una terminal física externa y fiado. WAMERCIO no procesa ni confirma pagos electrónicos dentro de los negocios.",
    },
  ],
  cta_title: "Tu colmado puede vender mejor desde hoy.",
  cta_description:
    "Organiza tu negocio, atiende más rápido y dale a tus clientes una experiencia moderna sin perder la cercanía de siempre.",
  cta_primary_text: "Solicitar demo",
  cta_primary_url: "#contacto",
  cta_secondary_text: "Hablar por WhatsApp",
  cta_secondary_url: "https://wa.me/",
  cta_tertiary_text: "Ver planes",
  cta_tertiary_url: "#planes",
  footer_description:
    "Plataforma SaaS para digitalizar colmados, minimarkets y negocios de barrio en República Dominicana.",
  footer_email: "hola@wamercio.com",
  footer_status_text: "Sistemas operativos",
  maintenance: {
    enabled: false,
    badge_text: "Mantenimiento programado",
    title: "Estamos realizando mejoras en la página principal",
    description:
      "La página principal estará temporalmente en mantenimiento mientras optimizamos la experiencia de WAMERCIO. Los negocios activos continúan operando desde sus subdominios.",
    status_label: "Estado del servicio",
    status_value: "Mantenimiento activo",
    notice_title: "Página principal pausada temporalmente",
    notice_text:
      "El acceso administrativo y las tiendas existentes siguen disponibles. Esta pantalla solo afecta el dominio principal.",
    support_button_text: "Entrar al panel de administración",
    support_button_url: "#/admin",
  },
  domain,
});

const landingText = (value, domain) =>
  String(value || "").replace(/\{domain\}/g, domain || "ltd.do");
const landingArray = (value, fallback = []) =>
  Array.isArray(value) && value.length ? value : fallback;

const normalizeLandingConfig = (settings: any = {}, domain = "ltd.do") => {
  const defaults = buildDefaultLandingConfig(domain);
  const saved = settings?.landing_page || settings?.landingPage || {};
  const next = { ...defaults, ...(saved || {}) };
  [
    "nav_links",
    "trust_items",
    "problems",
    "modules",
    "rd_tags",
    "rd_card_items",
    "business_types",
    "roles",
    "steps",
    "benefits",
    "pricing_plans",
    "faqs",
  ].forEach((key) => {
    next[key] = landingArray(next[key], defaults[key]);
  });
  next.maintenance = {
    ...(defaults.maintenance || {}),
    ...(next.maintenance || {}),
    support_button_url: '#/admin',
  };
  delete next.maintenance.estimated_return;
  return next;
};

const landingIconOptions = [
  { value: "message", label: "Mensaje" },
  { value: "book", label: "Libreta" },
  { value: "package", label: "Paquete" },
  { value: "map", label: "Mapa" },
  { value: "dollar", label: "Dinero" },
  { value: "users", label: "Usuarios" },
  { value: "search", label: "Búsqueda" },
  { value: "userx", label: "Usuario alerta" },
  { value: "smartphone", label: "Móvil" },
  { value: "shoppingbag", label: "Funda" },
  { value: "monitor", label: "Pantalla" },
  { value: "filetext", label: "Documento" },
  { value: "layers", label: "Capas" },
  { value: "truck", label: "Entrega" },
  { value: "piechart", label: "Reportes" },
  { value: "database", label: "Base de datos" },
  { value: "briefcase", label: "Negocio" },
  { value: "usercheck", label: "Usuario verificado" },
  { value: "navigation", label: "Navegación" },
  { value: "settings", label: "Configuración" },
  { value: "globe", label: "Globo" },
  { value: "lock", label: "Candado" },
  { value: "shield", label: "Escudo" },
  { value: "grid", label: "Cuadrícula" },
];

const landingIconMap = {
  message: FiIcons.FiMessageSquare,
  book: FiIcons.FiBook,
  package: FiIcons.FiPackage,
  map: FiIcons.FiMap,
  dollar: FiIcons.FiDollarSign,
  users: FiUsers,
  search: FiSearch,
  userx: FiIcons.FiUserX,
  smartphone: FiIcons.FiSmartphone,
  shoppingbag: FiIcons.FiShoppingBag,
  monitor: FiMonitor,
  filetext: FiFileText,
  layers: FiLayers,
  truck: FiIcons.FiTruck,
  piechart: FiIcons.FiPieChart,
  database: FiDatabase,
  briefcase: FiIcons.FiBriefcase,
  usercheck: FiUserCheck,
  navigation: FiIcons.FiNavigation,
  settings: FiSettings,
  globe: FiGlobe,
  lock: FiLock,
  shield: FiShield,
  grid: FiGrid,
};

const LandingIcon = ({ name, className = "" }: any) => {
  const IconComponent =
    landingIconMap[String(name || "").toLowerCase()] || FiGrid;
  return <IconComponent className={className} />;
};

const landingLogo = (form, className = "w-10 h-10") => {
  const logo = form.logo_url || "/brand/colmapro-app-icon.png";
  if (logo)
    return (
      <img
        src={logo}
        alt="WAMERCIO"
        className={`${className} rounded-2xl object-cover bg-white ring-1 ring-emerald-100 shadow-sm`}
      />
    );
  return (
    <div
      className={`${className} rounded-2xl bg-[#00a884] text-white flex items-center justify-center shadow-md text-xl`}
    >
      {form.brand_icon || "🛒"}
    </div>
  );
};

const LandingPagePreview = ({ form, domain }: any) => (
  <div className="rounded-[2rem] overflow-hidden border border-gray-100 bg-white shadow-sm max-h-[calc(100vh-150px)] overflow-y-auto">
    <div className="bg-slate-50 p-4">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2 min-w-0">
          {landingLogo(form, "w-9 h-9")}
          <span className="font-black text-gray-900 truncate">
            {landingText(form.brand_name, domain)}
          </span>
        </div>
        <span className="rounded-full bg-[#00a884] text-white px-3 py-1.5 text-[10px] font-black">
          {landingText(form.demo_button_text, domain)}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4">
        <div>
          <p className="inline-flex rounded-full bg-[#00a884]/10 text-[#008f72] px-3 py-1 text-[10px] font-black uppercase">
            {landingText(form.badge_text, domain)}
          </p>
          <h3 className="text-3xl font-black text-gray-900 leading-tight mt-4">
            {landingText(form.hero_title, domain)}{" "}
            <span className="text-[#00a884]">
              {landingText(form.hero_highlight, domain)}
            </span>
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed mt-3">
            {landingText(form.hero_description, domain)}
          </p>
          <div className="flex gap-2 mt-4">
            <span className="rounded-2xl bg-[#00a884] text-white text-xs font-black px-3 py-2">
              {landingText(form.primary_button_text, domain)}
            </span>
            <span className="rounded-2xl bg-white border text-gray-700 text-xs font-black px-3 py-2">
              {landingText(form.secondary_button_text, domain)}
            </span>
          </div>
        </div>
        <div className="rounded-3xl overflow-hidden border border-white shadow-sm aspect-video bg-gray-100">
          {form.hero_image_url ? (
            <img
              src={form.hero_image_url}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs font-bold">
              Imagen principal
            </div>
          )}
        </div>
      </div>
    </div>
    <div className="p-4 space-y-4">
      <div className="text-center">
        <h4 className="font-black text-gray-900">
          {landingText(form.problems_title, domain)}
        </h4>
        <p className="text-[#00a884] font-black text-sm">
          {landingText(form.problems_highlight, domain)}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(form.problems || []).slice(0, 4).map((item, index) => (
          <div
            key={index}
            className="rounded-2xl border border-gray-100 bg-gray-50 p-3"
          >
            <div className="w-8 h-8 rounded-xl bg-red-50 text-red-500 flex items-center justify-center mb-2">
              <LandingIcon name={item.icon} />
            </div>
            <p className="text-xs font-black text-gray-900">
              {landingText(item.title, domain)}
            </p>
          </div>
        ))}
      </div>
      <div className="text-center">
        <h4 className="font-black text-gray-900">
          {landingText(form.modules_title, domain)}
        </h4>
        <p className="text-xs text-gray-500 mt-1">
          {landingText(form.modules_description, domain)}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(form.modules || []).slice(0, 4).map((item, index) => (
          <div
            key={index}
            className="rounded-2xl border border-gray-100 bg-white p-3"
          >
            <div className="w-8 h-8 rounded-xl bg-[#00a884]/10 text-[#00a884] flex items-center justify-center mb-2">
              <LandingIcon name={item.icon} />
            </div>
            <p className="text-xs font-black text-gray-900">
              {landingText(item.title, domain)}
            </p>
          </div>
        ))}
      </div>
      <div className="rounded-3xl bg-slate-900 text-white p-4">
        <h4 className="font-black">
          {landingText(form.audience_title, domain)}
        </h4>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {(form.business_types || []).slice(0, 6).map((item, index) => (
            <span
              key={index}
              className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold"
            >
              {landingText(item, domain)}
            </span>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        {(form.pricing_plans || []).slice(0, 3).map((plan, index) => (
          <div
            key={index}
            className={`rounded-2xl border p-3 ${plan.popular ? "border-[#00a884] shadow-sm" : "border-gray-100 bg-gray-50"}`}
          >
            <div className="flex justify-between gap-2">
              <p className="font-black text-gray-900 text-sm">
                {landingText(plan.name, domain)}
              </p>
              <span className="text-[#00a884] font-black text-xs">
                {landingText(plan.price, domain)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const LandingMaintenancePreview = ({ form, domain }: any) => {
  const maintenance = form.maintenance || {};
  return (
    <div className="rounded-[2rem] overflow-hidden border border-slate-800 bg-[#07111f] shadow-sm">
      <div className="relative overflow-hidden text-white p-6">
        <div className="absolute -top-24 -left-20 w-64 h-64 rounded-full bg-emerald-400/10 blur-2xl" />
        <div className="absolute -bottom-28 -right-20 w-72 h-72 rounded-full bg-sky-400/10 blur-2xl" />
        <div className="relative z-10">
          <div className="flex items-center justify-between gap-3 mb-8">
            <div className="flex items-center gap-3 min-w-0">
              {landingLogo(form, "w-11 h-11")}
              <div className="min-w-0">
                <p className="font-black text-white truncate">{landingText(form.brand_name, domain)}</p>
                <p className="text-white/45 text-[10px] font-bold uppercase tracking-widest truncate">Gestión inteligente para negocios</p>
              </div>
            </div>
            <span className="inline-flex h-9 px-3 rounded-2xl bg-amber-400/10 border border-amber-300/20 text-amber-100 text-[10px] font-black items-center gap-2 uppercase tracking-widest">
              <span className="w-2 h-2 rounded-full bg-amber-300" /> Activo
            </span>
          </div>
          <p className="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 border border-emerald-300/20 px-3 py-2 text-emerald-100 text-[10px] font-black uppercase tracking-widest mb-4">
            <FiAlertCircle /> {landingText(maintenance.badge_text, domain)}
          </p>
          <h3 className="text-3xl font-black tracking-tight leading-tight">{landingText(maintenance.title, domain)}</h3>
          <p className="text-white/65 text-sm leading-relaxed mt-4">{landingText(maintenance.description, domain)}</p>
          <div className="mt-5 inline-flex min-h-11 px-4 rounded-xl bg-emerald-400 text-slate-950 text-xs font-black items-center gap-2">
            <FiShield /> {landingText(maintenance.support_button_text, domain)} <FiArrowRight />
          </div>
          <div className="mt-5 rounded-2xl bg-white/[0.07] border border-white/10 p-4">
            <p className="text-[10px] uppercase tracking-widest font-black text-emerald-200">{landingText(maintenance.status_label, domain)}</p>
            <p className="text-base font-black text-white mt-1">{landingText(maintenance.status_value, domain)}</p>
            <div className="mt-3 grid gap-2 text-[11px] font-bold text-white/60">
              {['Panel administrativo disponible', 'Tiendas y pedidos operando', 'Solo la página principal está pausada'].map((item) => (
                <p key={item} className="flex items-center gap-2"><FiCheckCircle className="text-emerald-300" /> {item}</p>
              ))}
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-white text-slate-900 p-4">
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">{landingText(maintenance.notice_title, domain)}</p>
            <p className="text-xs text-slate-500 leading-relaxed mt-2">{landingText(maintenance.notice_text, domain)}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const LandingMaintenanceModal = ({ value, domain, onClose, onApply }: any) => {
  const [draft, setDraft] = useState(value || {});
  const update = (key, nextValue) =>
    setDraft((prev) => ({ ...prev, [key]: nextValue }));
  const apply = () => {
    onApply?.(draft);
    onClose?.();
  };
  return (
    <ModalShell onClose={onClose} width="max-w-4xl">
      <div className="p-5 sm:p-6 border-b border-gray-100 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">
            Mantenimiento
          </p>
          <h2 className="text-xl font-black text-gray-900">
            Aviso de mantenimiento de la página principal
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Configura el mensaje que verá el usuario mientras la página principal
            se encuentra temporalmente en mantenimiento.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center shrink-0"
        >
          <FiX />
        </button>
      </div>
      <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
        <div
          className={`rounded-3xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${draft.enabled ? "border-amber-200 bg-amber-50" : "border-gray-100 bg-gray-50"}`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center ${draft.enabled ? "bg-amber-100 text-amber-700" : "bg-white text-gray-400"}`}
            >
              <FiClock />
            </div>
            <div>
              <h3 className="font-black text-gray-900">
                Mostrar la página principal en mantenimiento
              </h3>
              <p className="text-xs text-gray-500">
                Al activarlo, el dominio raíz mostrará una pantalla temporal de
                mantenimiento.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => update("enabled", !draft.enabled)}
            className={`w-14 h-8 rounded-full p-1 transition-colors ${draft.enabled ? "bg-amber-500" : "bg-gray-300"}`}
            aria-pressed={Boolean(draft.enabled)}
          >
            <span
              className={`block w-6 h-6 rounded-full bg-white shadow transition-transform ${draft.enabled ? "translate-x-6" : ""}`}
            />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Etiqueta superior"
            value={draft.badge_text}
            onChange={(v) => update("badge_text", v)}
            placeholder="Mantenimiento programado"
          />
          <div className="md:col-span-2">
            <Field
              label="Título principal"
              value={draft.title}
              onChange={(v) => update("title", v)}
              placeholder="Estamos realizando mejoras"
            />
          </div>
          <div className="md:col-span-2">
            <CatalogTextarea
              label="Descripción"
              value={draft.description}
              rows={4}
              onChange={(v) => update("description", v)}
            />
          </div>
          <Field
            label="Etiqueta de estado"
            value={draft.status_label}
            onChange={(v) => update("status_label", v)}
            placeholder="Estado del servicio"
          />
          <Field
            label="Valor de estado"
            value={draft.status_value}
            onChange={(v) => update("status_value", v)}
            placeholder="Mantenimiento activo"
          />
          <Field
            label="Texto del botón"
            value={draft.support_button_text}
            onChange={(v) => update("support_button_text", v)}
            placeholder="Entrar al panel de administración"
          />
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Destino protegido</p>
            <p className="mt-1 text-xs font-bold text-emerald-900">El botón abre directamente el panel de administración del negocio.</p>
          </div>
          <Field
            label="Título del aviso"
            value={draft.notice_title}
            onChange={(v) => update("notice_title", v)}
            placeholder="Página principal pausada temporalmente"
          />
          <div className="md:col-span-2">
            <CatalogTextarea
              label="Texto del aviso"
              value={draft.notice_text}
              rows={3}
              onChange={(v) => update("notice_text", v)}
            />
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-6 border-t border-gray-100 bg-white flex flex-col sm:flex-row gap-3 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="h-12 px-5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-black"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={apply}
          className="h-12 px-5 rounded-2xl bg-[#00a884] hover:bg-[#008f72] text-white font-black shadow-lg shadow-[#00a884]/20"
        >
          Aplicar configuración
        </button>
      </div>
    </ModalShell>
  );
};

const LandingSectionBox = ({ eyebrow, title, children }: any) => (
  <div className="rounded-3xl border border-gray-100 bg-gray-50 p-4 space-y-4">
    <div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
        {eyebrow}
      </p>
      <h3 className="font-black text-gray-900">{title}</h3>
    </div>
    {children}
  </div>
);

const StringListEditor = ({
  title,
  items,
  onChange,
  placeholder = "Texto",
}: any) => {
  const list = Array.isArray(items) ? items : [];
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-black text-gray-900">{title}</h4>
        <button
          type="button"
          onClick={() => onChange([...list, ""])}
          className="h-8 px-3 rounded-xl bg-[#00a884]/10 text-[#008f72] text-xs font-black"
        >
          Agregar
        </button>
      </div>
      {list.map((item, index) => (
        <div key={index} className="grid grid-cols-[1fr_auto] gap-2">
          <Field
            label={`${placeholder} ${index + 1}`}
            value={item}
            onChange={(value) =>
              onChange(list.map((entry, i) => (i === index ? value : entry)))
            }
          />
          <button
            type="button"
            onClick={() => onChange(list.filter((_, i) => i !== index))}
            className="mt-7 h-11 w-11 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center"
          >
            <FiTrash2 />
          </button>
        </div>
      ))}
    </div>
  );
};

const CardItemsEditor = ({ title, items, onChange, withIcon = true }: any) => {
  const list = Array.isArray(items) ? items : [];
  const update = (index, key, value) =>
    onChange(
      list.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
    );
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-black text-gray-900">{title}</h4>
        <button
          type="button"
          onClick={() =>
            onChange([
              ...list,
              withIcon
                ? { icon: "grid", title: "", text: "" }
                : { title: "", text: "" },
            ])
          }
          className="h-8 px-3 rounded-xl bg-[#00a884]/10 text-[#008f72] text-xs font-black"
        >
          Agregar
        </button>
      </div>
      {list.map((item, index) => (
        <div
          key={index}
          className="rounded-2xl bg-gray-50 border border-gray-100 p-3 space-y-3"
        >
          <div
            className={`grid grid-cols-1 ${withIcon ? "md:grid-cols-[150px_1fr_auto]" : "md:grid-cols-[1fr_auto]"} gap-3 items-start`}
          >
            {withIcon && (
              <label className="block">
                <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                  Icono
                </span>
                <select
                  value={item.icon || "grid"}
                  onChange={(event) =>
                    update(index, "icon", event.target.value)
                  }
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
                >
                  {landingIconOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Field
              label={`Título ${index + 1}`}
              value={item.title}
              onChange={(value) => update(index, "title", value)}
            />
            <button
              type="button"
              onClick={() => onChange(list.filter((_, i) => i !== index))}
              className="mt-7 h-11 w-11 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center"
            >
              <FiTrash2 />
            </button>
          </div>
          <CatalogTextarea
            label="Texto"
            value={item.text}
            rows={2}
            onChange={(value) => update(index, "text", value)}
          />
        </div>
      ))}
    </div>
  );
};

const NavLinksEditor = ({ items, onChange }: any) => {
  const list = Array.isArray(items) ? items : [];
  const update = (index, key, value) =>
    onChange(
      list.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
    );
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-black text-gray-900">Menú superior</h4>
        <button
          type="button"
          onClick={() => onChange([...list, { label: "", url: "#" }])}
          className="h-8 px-3 rounded-xl bg-[#00a884]/10 text-[#008f72] text-xs font-black"
        >
          Agregar
        </button>
      </div>
      {list.map((item, index) => (
        <div
          key={index}
          className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 rounded-2xl bg-gray-50 border border-gray-100 p-3"
        >
          <Field
            label={`Etiqueta ${index + 1}`}
            value={item.label}
            onChange={(value) => update(index, "label", value)}
          />
          <Field
            label={`URL ${index + 1}`}
            value={item.url}
            onChange={(value) => update(index, "url", value)}
          />
          <button
            type="button"
            onClick={() => onChange(list.filter((_, i) => i !== index))}
            className="mt-7 h-11 w-11 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center"
          >
            <FiTrash2 />
          </button>
        </div>
      ))}
    </div>
  );
};

const PricingPlansEditor = ({ items, onChange }: any) => {
  const list = Array.isArray(items) ? items : [];
  const update = (index, key, value) =>
    onChange(
      list.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
    );
  const updateFeature = (planIndex, featureIndex, value) =>
    update(
      planIndex,
      "features",
      (list[planIndex].features || []).map((feature, i) =>
        i === featureIndex ? value : feature,
      ),
    );
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-black text-gray-900">Planes comerciales</h4>
        <button
          type="button"
          onClick={() =>
            onChange([
              ...list,
              {
                name: "",
                price: "",
                description: "",
                button_text: "Solicitar información",
                button_url: "#contacto",
                popular: false,
                features: [""],
              },
            ])
          }
          className="h-8 px-3 rounded-xl bg-[#00a884]/10 text-[#008f72] text-xs font-black"
        >
          Agregar
        </button>
      </div>
      {list.map((plan, index) => (
        <div
          key={index}
          className="rounded-2xl bg-gray-50 border border-gray-100 p-3 space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
            <Field
              label="Nombre"
              value={plan.name}
              onChange={(value) => update(index, "name", value)}
            />
            <Field
              label="Precio / etiqueta"
              value={plan.price}
              onChange={(value) => update(index, "price", value)}
            />
            <button
              type="button"
              onClick={() => onChange(list.filter((_, i) => i !== index))}
              className="mt-7 h-11 w-11 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center"
            >
              <FiTrash2 />
            </button>
          </div>
          <CatalogTextarea
            label="Descripción"
            value={plan.description}
            rows={2}
            onChange={(value) => update(index, "description", value)}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field
              label="Texto botón"
              value={plan.button_text}
              onChange={(value) => update(index, "button_text", value)}
            />
            <Field
              label="URL botón"
              value={plan.button_url}
              onChange={(value) => update(index, "button_url", value)}
            />
          </div>
          <label className="inline-flex items-center gap-2 rounded-2xl bg-white border border-gray-100 px-3 py-2">
            <input
              type="checkbox"
              checked={Boolean(plan.popular)}
              onChange={(event) =>
                update(index, "popular", event.target.checked)
              }
              className="w-4 h-4 accent-[#00a884]"
            />
            <span className="text-xs font-black text-gray-600">
              Plan recomendado
            </span>
          </label>
          <StringListEditor
            title="Características"
            items={plan.features || []}
            onChange={(features) => update(index, "features", features)}
            placeholder="Característica"
          />
        </div>
      ))}
    </div>
  );
};

const FaqEditor = ({ items, onChange }: any) => {
  const list = Array.isArray(items) ? items : [];
  const update = (index, key, value) =>
    onChange(
      list.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
    );
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-black text-gray-900">
          Preguntas frecuentes
        </h4>
        <button
          type="button"
          onClick={() => onChange([...list, { question: "", answer: "" }])}
          className="h-8 px-3 rounded-xl bg-[#00a884]/10 text-[#008f72] text-xs font-black"
        >
          Agregar
        </button>
      </div>
      {list.map((item, index) => (
        <div
          key={index}
          className="rounded-2xl bg-gray-50 border border-gray-100 p-3 space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
            <Field
              label={`Pregunta ${index + 1}`}
              value={item.question}
              onChange={(value) => update(index, "question", value)}
            />
            <button
              type="button"
              onClick={() => onChange(list.filter((_, i) => i !== index))}
              className="mt-7 h-11 w-11 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center"
            >
              <FiTrash2 />
            </button>
          </div>
          <CatalogTextarea
            label="Respuesta"
            value={item.answer}
            rows={2}
            onChange={(value) => update(index, "answer", value)}
          />
        </div>
      ))}
    </div>
  );
};

const sanitizeLandingPayload = (form: any) => ({
  ...form,
  nav_links: (form.nav_links || []).map((item) => ({
    label: item.label || "",
    url: item.url || "#",
  })),
  trust_items: (form.trust_items || []).map((item) => String(item || "")),
  problems: (form.problems || []).map((item) => ({
    icon: item.icon || "grid",
    title: item.title || "",
    text: item.text || "",
  })),
  modules: (form.modules || []).map((item) => ({
    icon: item.icon || "grid",
    title: item.title || "",
    text: item.text || "",
  })),
  rd_tags: (form.rd_tags || []).map((item) => String(item || "")),
  rd_card_items: (form.rd_card_items || []).map((item) => String(item || "")),
  business_types: (form.business_types || []).map((item) => String(item || "")),
  roles: (form.roles || []).map((item) => ({
    icon: item.icon || "grid",
    title: item.title || "",
    text: item.text || "",
  })),
  steps: (form.steps || []).map((item) => ({
    title: item.title || "",
    text: item.text || "",
  })),
  benefits: (form.benefits || []).map((item) => String(item || "")),
  pricing_plans: (form.pricing_plans || []).map((plan) => ({
    name: plan.name || "",
    price: plan.price || "",
    description: plan.description || "",
    button_text: plan.button_text || "Solicitar información",
    button_url: plan.button_url || "#contacto",
    popular: Boolean(plan.popular),
    features: (plan.features || []).map((feature) => String(feature || "")),
  })),
  faqs: (form.faqs || []).map((item) => ({
    question: item.question || "",
    answer: item.answer || "",
  })),
  maintenance: {
    enabled: Boolean(form.maintenance?.enabled),
    badge_text: form.maintenance?.badge_text || "",
    title: form.maintenance?.title || "",
    description: form.maintenance?.description || "",
    status_label: form.maintenance?.status_label || "",
    status_value: form.maintenance?.status_value || "",
    notice_title: form.maintenance?.notice_title || "",
    notice_text: form.maintenance?.notice_text || "",
    support_button_text: form.maintenance?.support_button_text || "",
    support_button_url: "#/admin",
  },
});

const LandingPageView = ({ settings = {}, onSaved }: any) => {
  const domain = inferRootDomain() || "ltd.do";
  const [form, setForm] = useState(() =>
    normalizeLandingConfig(settings, domain),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);

  useEffect(() => {
    setForm(normalizeLandingConfig(settings, domain));
  }, [settings, domain]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.patch("/platform/settings", {
        landing_page: sanitizeLandingPayload(form),
      });
      setMessage("Página comercial actualizada correctamente.");
      await onSaved?.();
    } catch (err) {
      setError(err.message || "No se pudo guardar la página comercial");
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    if (
      !confirm(
        "¿Restaurar el contenido base de la nueva página comercial? Podrás revisarlo antes de guardarlo.",
      )
    )
      return;
    setForm(buildDefaultLandingConfig(domain));
    setMessage(
      "Contenido base restaurado. Presiona Guardar para aplicarlo públicamente.",
    );
  };
  const openLanding = () => {
    if (typeof window !== "undefined")
      window.open(
        `${window.location.origin}/`,
        "_blank",
        "noopener,noreferrer",
      );
  };

  return (
    <>
      <section className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_520px] gap-5 items-start">
        <form
          onSubmit={save}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
        >
          <div className="p-5 border-b border-gray-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black text-[#00a884] uppercase tracking-widest">
                Página comercial
              </p>
              <h2 className="text-lg font-black text-gray-900">
                Personalización de la página comercial
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                Personaliza la página principal con el diseño comercial
                completo. Puedes usar <strong>{"{domain}"}</strong> en cualquier
                texto.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openLanding}
                className="h-10 px-4 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center gap-2 text-xs font-black"
              >
                <FiEye /> Vista pública
              </button>
              <button
                type="button"
                onClick={resetDefaults}
                className="h-10 px-4 rounded-xl bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100 flex items-center gap-2 text-xs font-black"
              >
                <FiRefreshCw /> Restaurar
              </button>
              <button
                type="button"
                onClick={() => setMaintenanceOpen(true)}
                className={`h-10 px-4 rounded-xl border flex items-center gap-2 text-xs font-black ${form.maintenance?.enabled ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" : "bg-gray-100 text-gray-700 border-gray-100 hover:bg-gray-200"}`}
              >
                <FiClock /> Mantenimiento
              </button>
              <button
                disabled={saving}
                className="h-10 px-4 rounded-xl bg-[#00a884] text-white hover:bg-[#008f72] flex items-center gap-2 text-xs font-black shadow-md shadow-[#00a884]/20 disabled:opacity-60"
              >
                <FiSave /> {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
          <div className="p-5 space-y-6">
            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 flex items-center gap-2">
                <FiAlertCircle /> {error}
              </div>
            )}
            {message && (
              <div className="rounded-2xl border border-[#00a884]/20 bg-[#00a884]/10 px-4 py-3 text-sm font-bold text-[#008f72] flex items-center gap-2">
                <FiCheckCircle /> {message}
              </div>
            )}
            {form.maintenance?.enabled && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 flex items-center gap-2">
                <FiClock /> La página pública está configurada para mostrarse en
                mantenimiento cuando guardes los cambios.
              </div>
            )}

            <LandingSectionBox
              eyebrow="Marca y navegación"
              title="Identidad, menú y accesos superiores"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Field
                  label="Icono / emoji"
                  value={form.brand_icon}
                  onChange={(value) => update("brand_icon", value)}
                />
                <Field
                  label="Nombre visible"
                  value={form.brand_name}
                  onChange={(value) => update("brand_name", value)}
                />
                <Field
                  label="Subtítulo"
                  value={form.brand_subtitle}
                  onChange={(value) => update("brand_subtitle", value)}
                />
                <Field
                  label="URL del logo"
                  value={form.logo_url}
                  onChange={(value) => update("logo_url", value)}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Botón acceso"
                  value={form.access_button_text}
                  onChange={(value) => update("access_button_text", value)}
                />
                <Field
                  label="URL botón acceso"
                  value={form.access_button_url}
                  onChange={(value) => update("access_button_url", value)}
                />
                <Field
                  label="Botón demo"
                  value={form.demo_button_text}
                  onChange={(value) => update("demo_button_text", value)}
                />
                <Field
                  label="URL botón demo"
                  value={form.demo_button_url}
                  onChange={(value) => update("demo_button_url", value)}
                />
              </div>
              <NavLinksEditor
                items={form.nav_links}
                onChange={(items) => update("nav_links", items)}
              />
            </LandingSectionBox>

            <LandingSectionBox
              eyebrow="Sección principal"
              title="Encabezado, imagen y llamadas a la acción"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Etiqueta superior"
                  value={form.badge_text}
                  onChange={(value) => update("badge_text", value)}
                />
                <Field
                  label="Título"
                  value={form.hero_title}
                  onChange={(value) => update("hero_title", value)}
                />
                <Field
                  label="Texto destacado"
                  value={form.hero_highlight}
                  onChange={(value) => update("hero_highlight", value)}
                />
                <Field
                  label="Imagen principal"
                  value={form.hero_image_url}
                  onChange={(value) => update("hero_image_url", value)}
                />
                <div className="md:col-span-2">
                  <CatalogTextarea
                    label="Descripción"
                    value={form.hero_description}
                    rows={4}
                    onChange={(value) => update("hero_description", value)}
                  />
                </div>
                <Field
                  label="Botón principal"
                  value={form.primary_button_text}
                  onChange={(value) => update("primary_button_text", value)}
                />
                <Field
                  label="URL botón principal"
                  value={form.primary_button_url}
                  onChange={(value) => update("primary_button_url", value)}
                />
                <Field
                  label="Botón secundario"
                  value={form.secondary_button_text}
                  onChange={(value) => update("secondary_button_text", value)}
                />
                <Field
                  label="URL botón secundario"
                  value={form.secondary_button_url}
                  onChange={(value) => update("secondary_button_url", value)}
                />
                <Field
                  label="Etiqueta flotante"
                  value={form.hero_stat_label}
                  onChange={(value) => update("hero_stat_label", value)}
                />
                <Field
                  label="Valor flotante"
                  value={form.hero_stat_value}
                  onChange={(value) => update("hero_stat_value", value)}
                />
              </div>
              <StringListEditor
                title="Indicadores de confianza"
                items={form.trust_items}
                onChange={(items) => update("trust_items", items)}
                placeholder="Indicador"
              />
            </LandingSectionBox>

            <LandingSectionBox
              eyebrow="Dolores del negocio"
              title="Sección de problemas"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Título"
                  value={form.problems_title}
                  onChange={(value) => update("problems_title", value)}
                />
                <Field
                  label="Texto destacado"
                  value={form.problems_highlight}
                  onChange={(value) => update("problems_highlight", value)}
                />
                <div className="md:col-span-2">
                  <CatalogTextarea
                    label="Descripción"
                    value={form.problems_description}
                    rows={3}
                    onChange={(value) => update("problems_description", value)}
                  />
                </div>
              </div>
              <CardItemsEditor
                title="Tarjetas de problemas"
                items={form.problems}
                onChange={(items) => update("problems", items)}
              />
            </LandingSectionBox>

            <LandingSectionBox
              eyebrow="Solución y módulos"
              title="Módulos principales de WAMERCIO"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Título"
                  value={form.modules_title}
                  onChange={(value) => update("modules_title", value)}
                />
                <Field
                  label="Descripción"
                  value={form.modules_description}
                  onChange={(value) => update("modules_description", value)}
                />
              </div>
              <CardItemsEditor
                title="Módulos"
                items={form.modules}
                onChange={(items) => update("modules", items)}
              />
            </LandingSectionBox>

            <LandingSectionBox
              eyebrow="Mercado dominicano"
              title="Diseño para RD"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Título"
                  value={form.rd_title}
                  onChange={(value) => update("rd_title", value)}
                />
                <Field
                  label="Título tarjeta"
                  value={form.rd_card_title}
                  onChange={(value) => update("rd_card_title", value)}
                />
                <div className="md:col-span-2">
                  <CatalogTextarea
                    label="Descripción"
                    value={form.rd_description}
                    rows={3}
                    onChange={(value) => update("rd_description", value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <CatalogTextarea
                    label="Texto tarjeta"
                    value={form.rd_card_text}
                    rows={3}
                    onChange={(value) => update("rd_card_text", value)}
                  />
                </div>
              </div>
              <StringListEditor
                title="Etiquetas RD"
                items={form.rd_tags}
                onChange={(items) => update("rd_tags", items)}
                placeholder="Etiqueta"
              />
              <StringListEditor
                title="Puntos de la tarjeta"
                items={form.rd_card_items}
                onChange={(items) => update("rd_card_items", items)}
                placeholder="Punto"
              />
            </LandingSectionBox>

            <LandingSectionBox
              eyebrow="Audiencia y roles"
              title="Tipos de negocio y paneles por persona"
            >
              <Field
                label="Título tipos de negocio"
                value={form.audience_title}
                onChange={(value) => update("audience_title", value)}
              />
              <StringListEditor
                title="Tipos de negocio"
                items={form.business_types}
                onChange={(items) => update("business_types", items)}
                placeholder="Tipo"
              />
              <Field
                label="Título roles"
                value={form.roles_title}
                onChange={(value) => update("roles_title", value)}
              />
              <CardItemsEditor
                title="Roles / paneles"
                items={form.roles}
                onChange={(items) => update("roles", items)}
              />
            </LandingSectionBox>

            <LandingSectionBox
              eyebrow="Proceso y beneficios"
              title="Pasos de activación y promesas de valor"
            >
              <Field
                label="Título de pasos"
                value={form.steps_title}
                onChange={(value) => update("steps_title", value)}
              />
              <CardItemsEditor
                title="Pasos"
                items={form.steps}
                onChange={(items) => update("steps", items)}
                withIcon={false}
              />
              <Field
                label="Título beneficios"
                value={form.benefits_title}
                onChange={(value) => update("benefits_title", value)}
              />
              <StringListEditor
                title="Beneficios"
                items={form.benefits}
                onChange={(items) => update("benefits", items)}
                placeholder="Beneficio"
              />
            </LandingSectionBox>

            <LandingSectionBox
              eyebrow="Planes y preguntas frecuentes"
              title="Precios, preguntas frecuentes y cierre comercial"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Título planes"
                  value={form.plans_title}
                  onChange={(value) => update("plans_title", value)}
                />
                <Field
                  label="Descripción planes"
                  value={form.plans_description}
                  onChange={(value) => update("plans_description", value)}
                />
              </div>
              <PricingPlansEditor
                items={form.pricing_plans}
                onChange={(items) => update("pricing_plans", items)}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Título de preguntas frecuentes"
                  value={form.faq_title}
                  onChange={(value) => update("faq_title", value)}
                />
                <Field
                  label="Descripción de preguntas frecuentes"
                  value={form.faq_description}
                  onChange={(value) => update("faq_description", value)}
                />
              </div>
              <FaqEditor
                items={form.faqs}
                onChange={(items) => update("faqs", items)}
              />
            </LandingSectionBox>

            <LandingSectionBox
              eyebrow="Llamado a la acción y pie de página"
              title="Llamada final y datos inferiores"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Título CTA"
                  value={form.cta_title}
                  onChange={(value) => update("cta_title", value)}
                />
                <Field
                  label="Descripción CTA"
                  value={form.cta_description}
                  onChange={(value) => update("cta_description", value)}
                />
                <Field
                  label="Botón CTA principal"
                  value={form.cta_primary_text}
                  onChange={(value) => update("cta_primary_text", value)}
                />
                <Field
                  label="URL CTA principal"
                  value={form.cta_primary_url}
                  onChange={(value) => update("cta_primary_url", value)}
                />
                <Field
                  label="Botón WhatsApp"
                  value={form.cta_secondary_text}
                  onChange={(value) => update("cta_secondary_text", value)}
                />
                <Field
                  label="URL WhatsApp"
                  value={form.cta_secondary_url}
                  onChange={(value) => update("cta_secondary_url", value)}
                />
                <Field
                  label="Botón ver planes"
                  value={form.cta_tertiary_text}
                  onChange={(value) => update("cta_tertiary_text", value)}
                />
                <Field
                  label="URL ver planes"
                  value={form.cta_tertiary_url}
                  onChange={(value) => update("cta_tertiary_url", value)}
                />
                <div className="md:col-span-2">
                  <CatalogTextarea
                    label="Descripción del pie de página"
                    value={form.footer_description}
                    rows={3}
                    onChange={(value) => update("footer_description", value)}
                  />
                </div>
                <Field
                  label="Correo del pie de página"
                  value={form.footer_email}
                  onChange={(value) => update("footer_email", value)}
                />
                <Field
                  label="Estado del pie de página"
                  value={form.footer_status_text}
                  onChange={(value) => update("footer_status_text", value)}
                />
              </div>
            </LandingSectionBox>
          </div>
        </form>
        <aside className="2xl:sticky 2xl:top-6 space-y-4">
          <div className="rounded-2xl border border-[#00a884]/20 bg-[#e9fbf5] px-4 py-3 text-xs text-[#008f72] font-bold">
            Dominio detectado: <span className="font-black">{domain}</span>
          </div>
          {form.maintenance?.enabled ? (
            <LandingMaintenancePreview form={form} domain={domain} />
          ) : (
            <LandingPagePreview form={form} domain={domain} />
          )}
        </aside>
      </section>
      {maintenanceOpen && (
        <LandingMaintenanceModal
          value={form.maintenance}
          domain={domain}
          onClose={() => setMaintenanceOpen(false)}
          onApply={(maintenance) =>
            setForm((prev) => ({
              ...prev,
              maintenance: {
                ...(prev.maintenance || {}),
                ...(maintenance || {}),
              },
            }))
          }
        />
      )}
    </>
  );
};

const ConfigurationSidebar = ({
  activeSection,
  onSectionChange,
  canViewAudit = false,
}: any) => (
  <aside className="hidden xl:flex w-72 shrink-0 flex-col border-r border-gray-200 bg-white">
    <div className="border-b border-gray-100 px-5 py-5">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#00a884]">
        Configuración
      </p>
      <h2 className="mt-1 text-lg font-black text-gray-900">Centro SaaS</h2>
      <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
        Administra la estructura, las integraciones y las políticas de la plataforma.
      </p>
    </div>
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 scrollbar-hide">
      {configurationNavigationGroups.map((group) => {
        const items = group.items.filter(
          (item) => !(item as any).auditOnly || canViewAudit,
        );
        if (items.length === 0) return null;
        return (
          <div key={group.label}>
            <p className="mb-2 px-3 text-[9px] font-black uppercase tracking-[0.16em] text-gray-400">
              {group.label}
            </p>
            <div className="space-y-1">
              {items.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onSectionChange?.(item.key)}
                    className={`w-full rounded-xl px-3 py-3 text-left transition-all ${
                      active
                        ? "bg-[#e9fbf5] text-[#007c65] shadow-sm ring-1 ring-[#00a884]/15"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          active
                            ? "bg-[#00a884] text-white"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        <Icon />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black">
                          {item.label}
                        </span>
                        <span
                          className={`mt-0.5 block truncate text-[10px] ${
                            active ? "text-[#008f72]/70" : "text-gray-400"
                          }`}
                        >
                          {item.hint}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
    <div className="border-t border-gray-100 p-4">
      <div className="rounded-2xl border border-[#00a884]/15 bg-[#f0fbf8] p-3 text-[10px] leading-relaxed text-[#008f72]">
        <strong className="block text-xs">Configuración centralizada</strong>
        Los cambios se aplican desde la base SaaS y se auditan por usuario.
      </div>
    </div>
  </aside>
);

const SuperAdminPanel = ({ user, onUserUpdated, onLogout }: any) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<any>({});
  const [tenants, setTenants] = useState([]);
  const [owners, setOwners] = useState([]);
  const [businessTypes, setBusinessTypes] = useState([]);
  const [plans, setPlans] = useState([]);
  const [domains, setDomains] = useState([]);
  const [databases, setDatabases] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [platformBanks, setPlatformBanks] = useState([]);
  const [catalog, setCatalog] = useState<any>({
    stats: {},
    categories: [],
    groups: [],
    details: [],
    brands: [],
    products: [],
    suggestions: [],
  });
  const [auditLogs, setAuditLogs] = useState([]);
  const [settings, setSettings] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [showOwnerForm, setShowOwnerForm] = useState(false);
  const [editingOwner, setEditingOwner] = useState(null);
  const [showBusinessTypeForm, setShowBusinessTypeForm] = useState(false);
  const [editingBusinessType, setEditingBusinessType] = useState(null);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [search, setSearch] = useState("");
  const platformUser = useMemo(() => normalizePlatformUser(user), [user]);
  const platformRole = platformUser.role;
  const platformPermissionsKey = Object.entries(platformUser.permissions || {})
    .filter(([, enabled]) => Boolean(enabled))
    .map(([permission]) => permission)
    .sort()
    .join("|");
  const platformPermissionSet = useMemo(
    () =>
      new Set(
        platformPermissionsKey ? platformPermissionsKey.split("|") : [],
      ),
    [platformPermissionsKey],
  );
  const hasPermission = useCallback(
    (permission) =>
      platformRole === "superadmin" || platformPermissionSet.has(permission),
    [platformPermissionSet, platformRole],
  );
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const tab = tabFromPath(pathname);
  const ownerSection = useMemo(
    () => ownerSectionFromPath(pathname),
    [pathname],
  );
  const planSection = useMemo(() => planSectionFromPath(pathname), [pathname]);
  const goTab = useCallback(
    (nextTab) => navigate(pathForTab(nextTab)),
    [navigate],
  );
  const goOwnerSection = useCallback(
    (nextSection) => {
      setSearch("");
      navigate(pathForOwnerSection(nextSection));
    },
    [navigate],
  );
  const goPlanSection = useCallback(
    (nextSection) => navigate(pathForPlanSection(nextSection)),
    [navigate],
  );
  const configTab = useMemo(() => configTabFromPath(pathname), [pathname]);
  const goConfigTab = useCallback(
    (nextSection) => navigate(pathForConfigTab(nextSection)),
    [navigate],
  );

  useEffect(() => {
    if (cleanPath(pathname) === "/superadmin/settings/waxum") {
      navigate(configTabPaths.whatsapp, { replace: true });
    }
  }, [navigate, pathname]);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [
        overviewData,
        ownersData,
        businessTypesData,
        tenantsData,
        plansData,
        domainsData,
        databasesData,
        subscriptionsData,
        catalogData,
        customersData,
        banksData,
        settingsData,
        auditData,
      ] = await Promise.all([
        hasPermission("overview.view")
          ? api.get("/platform/overview")
          : Promise.resolve({}),
        hasPermission("businesses.manage")
          ? api.get("/platform/owners")
          : Promise.resolve([]),
        hasPermission("businesses.manage")
          ? api.get("/platform/business-types")
          : Promise.resolve([]),
        hasPermission("businesses.manage")
          ? api.get("/platform/businesses")
          : Promise.resolve([]),
        hasPermission("plans.manage")
          ? api.get("/platform/plans")
          : Promise.resolve([]),
        hasPermission("businesses.manage")
          ? api.get("/platform/domains")
          : Promise.resolve([]),
        hasPermission("businesses.manage")
          ? api.get("/platform/databases")
          : Promise.resolve([]),
        hasPermission("plans.manage")
          ? api.get("/platform/subscriptions")
          : Promise.resolve([]),
        hasPermission("catalog.manage")
          ? api.get("/platform/catalog?view=summary")
          : Promise.resolve(null),
        hasPermission("customers.view")
          ? api.get("/platform/customers")
          : Promise.resolve([]),
        hasPermission("settings.manage")
          ? api.get("/platform/banks")
          : Promise.resolve([]),
        hasPermission("settings.manage")
          ? api.get("/platform/settings")
          : Promise.resolve({ settings: {} }),
        hasPermission("audit.view")
          ? api.get("/platform/audit-logs")
          : Promise.resolve([]),
      ]);
      setOverview(overviewData || {});
      setOwners(safeList(ownersData));
      setBusinessTypes(safeList(businessTypesData));
      setTenants(safeList(tenantsData));
      setPlans(safeList(plansData));
      setDomains(safeList(domainsData));
      setDatabases(safeList(databasesData));
      setSubscriptions(safeList(subscriptionsData));
      setCatalog(
        catalogData || {
          stats: {},
          categories: [],
          groups: [],
          details: [],
          brands: [],
          products: [],
          suggestions: [],
        },
      );
      setCustomers(safeList(customersData));
      setPlatformBanks(safeList(banksData));
      setSettings(settingsData?.settings || {});
      setAuditLogs(safeList(auditData));
      setSelectedTenant((current) =>
        current
          ? safeList(tenantsData).find((item) => item.id === current.id) ||
            current
          : current,
      );
    } catch (err) {
      setError(
        err.message || "No se pudieron cargar los datos de la plataforma",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hasPermission]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const requiredPermissions = {
      dashboard: "overview.view",
      landing: "settings.manage",
      owners: "businesses.manage",
      plans: "plans.manage",
      catalog: "catalog.manage",
      customers: "customers.view",
      users: "users.manage",
    };
    const required =
      tab === "settings"
        ? configTab === "audit"
          ? "audit.view"
          : "settings.manage"
        : requiredPermissions[tab];
    if (required && !hasPermission(required)) {
      if (tab === "settings" && hasPermission("settings.manage")) {
        goConfigTab("general");
      } else {
        goTab("profile");
      }
    }
  }, [configTab, goConfigTab, goTab, hasPermission, tab]);

  const filteredTenants = useMemo(() => {
    const q = normalizeFilterText(search);
    if (!q) return tenants;
    return tenants.filter((tenant) =>
      [
        tenant.name,
        tenant.slug,
        tenant.domain,
        tenant.database_name,
        tenant.plan_slug,
        tenant.status,
        tenant.owner_name,
        tenant.owner_whatsapp,
        tenant.province,
        tenant.municipality,
        tenant.neighborhood,
      ].some((value) => normalizeFilterText(value).includes(q)),
    );
  }, [search, tenants]);

  const updateTenantStatus = async (tenant, status) => {
    const previous = tenants;
    setTenants((items) =>
      items.map((item) => (item.id === tenant.id ? { ...item, status } : item)),
    );
    try {
      await api.patch(`/platform/businesses/${tenant.id}/status`, { status });
      await load(true);
    } catch (err) {
      setTenants(previous);
      setError(err.message || "No se pudo actualizar el estado del negocio");
    }
  };

  const blockTenant = async (tenant) => {
    const currentStatus = String(tenant?.status || "active").toLowerCase();
    const shouldUnblock =
      currentStatus === "suspended" || currentStatus === "disabled";
    const nextStatus = shouldUnblock ? "active" : "suspended";
    const message = shouldUnblock
      ? `¿Desbloquear el negocio ${tenant.name}? El negocio volverá a estar disponible para clientes y administradores.`
      : `¿Bloquear el negocio ${tenant.name}? El acceso público y administrativo quedará suspendido hasta que lo desbloquees.`;
    if (!confirm(message)) return;
    await updateTenantStatus(tenant, nextStatus);
  };

  const deleteTenant = async (tenant) => {
    if (
      !confirm(
        `¿Eliminar definitivamente el negocio ${tenant.name}? Esta acción quitará el negocio del panel, sus dominios, suscripción, enlaces centrales y eliminará su base de datos operativa para que al crearlo nuevamente inicie desde cero. Esta acción no se puede deshacer desde la interfaz.`,
      )
    )
      return;
    const previous = tenants;
    setTenants((items) => items.filter((item) => item.id !== tenant.id));
    if (selectedTenant?.id === tenant.id) setSelectedTenant(null);
    try {
      await api.delete(`/platform/businesses/${tenant.id}`);
      await load(true);
    } catch (err) {
      setTenants(previous);
      setError(err.message || "No se pudo eliminar el negocio");
    }
  };

  const openTenantAdmin = async (tenant) => {
    let adminWindow = null;
    if (typeof window !== "undefined") {
      adminWindow = window.open("about:blank", "_blank");
      if (adminWindow) {
        adminWindow.document.title = "Abriendo panel administrativo...";
        adminWindow.document.body.innerHTML =
          '<div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; min-height: 100vh; display: grid; place-items: center; margin: 0; background: #f3f6f8; color: #111827;"><div style="background: white; border-radius: 24px; padding: 28px 32px; box-shadow: 0 20px 45px rgba(15, 23, 42, .12); text-align: center;"><strong style="display:block; font-size: 16px; margin-bottom: 8px;">Abriendo panel administrativo</strong><span style="font-size: 13px; color: #667085;">Preparando sesión segura del negocio...</span></div></div>';
      }
    }

    try {
      const response = await api.post(
        `/platform/businesses/${tenant.id}/admin-session`,
        {},
      );
      const nextTenant = response?.tenant || tenant;
      api.setAdminTenant(nextTenant);
      api.setAdminToken();
      api.setAdminUser(response?.user || DEFAULT_PLATFORM_USERNAME);
      await api.get('/admin/session');
      if (typeof window !== "undefined") {
        const adminUrl = `${window.location.origin}/#/admin`;
        if (adminWindow && !adminWindow.closed) {
          adminWindow.location.replace(adminUrl);
        } else {
          const opened = window.open(adminUrl, "_blank");
          if (!opened)
            setError(
              "El navegador bloqueó la nueva ventana. Permite ventanas emergentes para abrir el panel administrativo en otra ventana.",
            );
        }
      }
    } catch (err) {
      api.clearAdminSession();
      if (adminWindow && !adminWindow.closed) adminWindow.close();
      setError(
        err.message ||
          "No se pudo abrir el panel administrativo con sesión iniciada",
      );
    }
  };

  const deleteOwner = async (owner) => {
    if (!confirm(`¿Eliminar el propietario ${owner.name}?`)) return;
    try {
      await api.delete(`/platform/owners/${owner.id}`);
      await load(true);
    } catch (err) {
      setError(err.message || "No se pudo eliminar el propietario");
    }
  };

  const deleteBusinessType = async (type) => {
    if (!confirm(`¿Eliminar el tipo de negocio ${type.name}?`)) return;
    try {
      await api.delete(`/platform/business-types/${type.id}`);
      await load(true);
    } catch (err) {
      setError(err.message || "No se pudo eliminar el tipo de negocio");
    }
  };

  const setDomainPrimary = async (domain) => {
    try {
      await api.patch(`/platform/domains/${domain.id}/primary`, {});
      await load(true);
    } catch (err) {
      setError(err.message || "No se pudo cambiar el dominio principal");
    }
  };

  const deleteDomain = async (domain) => {
    if (!confirm(`¿Eliminar el dominio ${domain.domain}?`)) return;
    try {
      await api.delete(`/platform/domains/${domain.id}`);
      await load(true);
    } catch (err) {
      setError(err.message || "No se pudo eliminar el dominio");
    }
  };

  const reloadCatalogOnly = useCallback(async () => {
    const catalogData = await api.get("/platform/catalog?view=summary");
    setCatalog(
      catalogData || {
        stats: {},
        categories: [],
        groups: [],
        details: [],
        brands: [],
        products: [],
        suggestions: [],
      },
    );
    return catalogData;
  }, []);

  if (loading) return <LoadingScreen />;

  const navItems = [
    {
      key: "dashboard",
      label: "Resumen",
      icon: FiGrid,
      permission: "overview.view",
    },
    {
      key: "landing",
      label: "Página comercial",
      icon: FiMonitor,
      permission: "settings.manage",
    },
    {
      key: "owners",
      label: "Propietarios",
      icon: FiUsers,
      permission: "businesses.manage",
    },
    {
      key: "plans",
      label: "Planes",
      icon: FiCreditCard,
      permission: "plans.manage",
    },
    {
      key: "catalog",
      label: "Catálogo global",
      icon: FiArchive,
      permission: "catalog.manage",
    },
    {
      key: "customers",
      label: "Clientes globales",
      icon: FiUserCheck,
      permission: "customers.view",
    },
    {
      key: "users",
      label: "Usuarios SaaS",
      icon: FiUserCheck,
      permission: "users.manage",
    },
    hasPermission("settings.manage")
      ? {
          key: "settings",
          label: "Configuración",
          icon: FiSettings,
          permission: "settings.manage",
        }
      : {
          key: "settings",
          label: "Auditoría",
          icon: FiFileText,
          permission: "audit.view",
          path: configTabPaths.audit,
        },
  ].filter((item) => hasPermission(item.permission));

  return (
    <div className="app-viewport flex bg-[#f0f4f8] overflow-hidden">
      <aside className="hidden lg:flex flex-col w-64 bg-[#1a2332] shrink-0">
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-md overflow-hidden p-0.5">
              <img
                src="/brand/colmapro-app-icon.png"
                alt="WAMERCIO"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <p className="font-black text-white text-sm leading-tight">
                WAMERCIO
              </p>
              <p className="text-[10px] text-gray-400">Administración SaaS</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-hide">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              tab === item.key &&
              (!item.path || cleanPath(pathname) === cleanPath(item.path));
            return (
              <button
                key={item.key}
                onClick={() =>
                  item.path ? navigate(item.path) : goTab(item.key)
                }
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${active ? "bg-[#00a884] text-white shadow-lg shadow-[#00a884]/20" : "text-gray-300 hover:bg-white/10 hover:text-white"}`}
              >
                <Icon className="text-lg" /> {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <button
            type="button"
            onClick={() => goTab("profile")}
            className="mb-2 w-full h-10 rounded-xl bg-white/5 hover:bg-white/10 text-gray-200 text-xs font-black flex items-center justify-center gap-2"
          >
            <FiUserCheck /> Mi perfil
          </button>
          <button
            onClick={onLogout}
            className="w-full h-10 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-black flex items-center justify-center gap-2"
          >
            <FiLogOut /> Cerrar sesión
          </button>
        </div>
      </aside>

      {tab === "settings" && hasPermission("settings.manage") && (
        <ConfigurationSidebar
          activeSection={configTab}
          onSectionChange={goConfigTab}
          canViewAudit={hasPermission("audit.view")}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-100 px-4 md:px-6 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Panel central de plataforma
            </p>
            <h1 className="text-xl md:text-2xl font-black text-gray-900 truncate">
              Superadministración de WAMERCIO
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="h-10 px-3 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center gap-2 text-xs font-black"
            >
              <FiRefreshCw className={refreshing ? "animate-spin" : ""} />{" "}
              Actualizar
            </button>
            {hasPermission("businesses.manage") &&
              tab !== "owners" &&
              tab !== "plans" &&
              tab !== "catalog" &&
              tab !== "landing" &&
              tab !== "users" &&
              tab !== "profile" && (
                <button
                  onClick={() => {
                    setShowForm(true);
                    goTab("tenants");
                  }}
                  className="h-10 px-4 rounded-xl bg-[#00a884] text-white hover:bg-[#008f72] flex items-center gap-2 text-xs font-black shadow-md shadow-[#00a884]/20"
                >
                  <FiPlus /> Nuevo negocio
                </button>
              )}
          </div>
        </header>

        <main
          className={`flex-1 min-h-0 overflow-y-auto ${tab === "catalog" || tab === "landing" ? "landing-scrollbar" : "scrollbar-hide"}`}
        >
          <div className={`${tab === "settings" ? "p-4 md:p-5 xl:p-6" : "p-4 md:p-6 xl:p-8"} pb-10 space-y-6`}>
            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 flex items-center gap-2">
                <FiAlertCircle /> {error}
              </div>
            )}

            {tab === "dashboard" && (
              <>
                <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  <StatCard
                    icon={FiUsers}
                    title="Negocios"
                    value={formatNumber(overview.tenants_total)}
                    hint="Negocios registrados"
                    delay={0.05}
                  />
                  <StatCard
                    icon={FiCheckCircle}
                    title="Activos"
                    value={formatNumber(overview.tenants_active)}
                    hint={`${formatNumber(overview.tenants_trial)} en prueba · ${formatNumber(overview.tenants_suspended)} suspendidos`}
                    delay={0.1}
                  />
                  <StatCard
                    icon={FiDatabase}
                    title="Bases listas"
                    value={formatNumber(overview.databases_ready)}
                    hint={`${formatNumber(overview.database_errors)} con error`}
                    delay={0.15}
                  />
                  <StatCard
                    icon={FiCreditCard}
                    title="Suscripciones"
                    value={formatNumber(overview.subscriptions_active)}
                    hint={`${formatNumber(overview.plans_active)} planes activos`}
                    accent="dark"
                    delay={0.2}
                  />
                </section>

                <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <SmallMetric
                    icon={FiGlobe}
                    label="Dominios"
                    value={overview.domains_total}
                  />
                  <SmallMetric
                    icon={FiLink}
                    label="Dominios propios"
                    value={overview.custom_domains}
                  />
                  <SmallMetric
                    icon={FiUsers}
                    label="Propietarios"
                    value={overview.owners_total}
                  />
                  <SmallMetric
                    icon={FiShield}
                    label="Incidencias de BD"
                    value={overview.database_errors}
                  />
                </section>
              </>
            )}

            {showForm && (
              <TenantForm
                plans={plans}
                owners={owners}
                businessTypes={businessTypes}
                onCancel={() => setShowForm(false)}
                onCreated={() => {
                  setShowForm(false);
                  load(true);
                  goTab("tenants");
                }}
              />
            )}

            {tab === "landing" && (
              <LandingPageView settings={settings} onSaved={() => load(true)} />
            )}

            {tab === "dashboard" && (
              <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        Actividad SaaS
                      </p>
                      <h2 className="text-lg font-black text-gray-900">
                        Últimos negocios creados
                      </h2>
                    </div>
                    <button
                      onClick={() => goTab("tenants")}
                      className="text-xs font-black text-[#00a884]"
                    >
                      Ver todos →
                    </button>
                  </div>
                  <div className="space-y-3">
                    {tenants.slice(0, 5).map((tenant) => (
                      <TenantRow
                        key={tenant.id}
                        tenant={tenant}
                        onSelect={setSelectedTenant}
                        onStatusChange={updateTenantStatus}
                        onBlock={blockTenant}
                        onDelete={deleteTenant}
                        onAdminAccess={openTenantAdmin}
                      />
                    ))}
                    {tenants.length === 0 && (
                      <EmptyState
                        icon={FiUsers}
                        title="Sin negocios"
                        text="Crea tu primer negocio SaaS desde el botón Nuevo negocio."
                      />
                    )}
                  </div>
                </div>
                <div className="space-y-5">
                  <div className="bg-[#1a2332] rounded-2xl shadow-sm p-5 text-white">
                    <div className="w-12 h-12 rounded-2xl bg-[#00a884]/20 text-[#00a884] flex items-center justify-center mb-4">
                      <FiZap />
                    </div>
                    <h2 className="text-xl font-black">Arquitectura activa</h2>
                    <p className="text-sm text-white/60 mt-2 leading-relaxed">
                      Cada negocio se resuelve por dominio o subdominio y usa su
                      propia base PostgreSQL. El panel central administra
                      propietarios, negocios y planes.
                    </p>
                    <div className="mt-5 space-y-3 text-sm">
                      <InfoLine
                        icon={FiGlobe}
                        label="Dominio comodín"
                        value="*.dominio"
                      />
                      <InfoLine
                        icon={FiDatabase}
                        label="Aislamiento"
                        value="BD por negocio"
                      />
                      <InfoLine
                        icon={FiShield}
                        label="Acceso"
                        value="Superadministración"
                      />
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      Últimas acciones
                    </p>
                    <h2 className="text-lg font-black text-gray-900 mb-4">
                      Auditoría reciente
                    </h2>
                    <div className="space-y-2">
                      {auditLogs.slice(0, 4).map((log) => (
                        <MiniLine
                          key={log.id}
                          title={log.action}
                          subtitle={`${log.actor} · ${log.tenant_name || "Plataforma"} · ${formatDate(log.created_at)}`}
                        />
                      ))}
                      {auditLogs.length === 0 && (
                        <p className="text-xs text-gray-400 py-8 text-center">
                          Sin registros todavía
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {tab === "owners" && (
              <OwnersHubView
                activeSection={ownerSection}
                onSectionChange={goOwnerSection}
                owners={owners}
                tenants={tenants}
                filteredTenants={filteredTenants}
                search={search}
                setSearch={setSearch}
                onNewOwner={() => {
                  setEditingOwner(null);
                  setShowOwnerForm(true);
                }}
                onEditOwner={(owner) => {
                  setEditingOwner(owner);
                  setShowOwnerForm(true);
                }}
                onDeleteOwner={deleteOwner}
                onNewTenant={() => {
                  setShowForm(true);
                  goOwnerSection("tenants");
                }}
                onTenantSelect={setSelectedTenant}
                onTenantStatusChange={updateTenantStatus}
                onTenantBlock={blockTenant}
                onTenantDelete={deleteTenant}
                onTenantAdminAccess={openTenantAdmin}
              />
            )}

            {tab === "plans" && (
              <PlansHubView
                activeSection={planSection}
                onSectionChange={goPlanSection}
                plans={plans}
                subscriptions={subscriptions}
                tenants={tenants}
                onNewPlan={() => {
                  setEditingPlan(null);
                  setShowPlanForm(true);
                }}
                onEditPlan={(plan) => {
                  setEditingPlan(plan);
                  setShowPlanForm(true);
                }}
                onNewTenant={() => {
                  setShowForm(true);
                  goPlanSection("subscriptions");
                }}
                onPlanReload={() => load(true)}
                onSelectTenant={setSelectedTenant}
              />
            )}
            {tab === "catalog" && (
              <CatalogGlobalView
                catalog={catalog}
                onReload={() => load(true)}
                onCatalogReload={reloadCatalogOnly}
              />
            )}
            {tab === "customers" && <CustomersView customers={customers} />}
            {tab === "users" && (
              <PlatformUsers
                currentUser={platformUser}
                onCurrentUserUpdated={(nextUser) =>
                  onUserUpdated?.(normalizePlatformUser(nextUser))
                }
              />
            )}
            {tab === "profile" && (
              <PlatformProfile
                onProfileSaved={(nextUser) =>
                  onUserUpdated?.(normalizePlatformUser(nextUser))
                }
              />
            )}
            {tab === "settings" && (
              hasPermission("settings.manage") ? (
                <SettingsView
                  settings={settings}
                  businessTypes={businessTypes}
                  domains={domains}
                  databases={databases}
                  auditLogs={auditLogs}
                  banks={platformBanks}
                  tenants={tenants}
                  canViewAudit={hasPermission("audit.view")}
                  activeSection={configTab}
                  onSectionChange={goConfigTab}
                  onTypeNew={() => {
                    setEditingBusinessType(null);
                    setShowBusinessTypeForm(true);
                  }}
                  onTypeEdit={(type) => {
                    setEditingBusinessType(type);
                    setShowBusinessTypeForm(true);
                  }}
                  onTypeDelete={deleteBusinessType}
                  onDomainPrimary={setDomainPrimary}
                  onDomainDelete={deleteDomain}
                  onSaved={() => load(true)}
                />
              ) : (
                <AuditView auditLogs={auditLogs} />
              )
            )}
          </div>
        </main>
      </div>

      {showPlanForm && (
        <PlanForm
          plan={editingPlan}
          onCancel={() => {
            setShowPlanForm(false);
            setEditingPlan(null);
          }}
          onSaved={async () => {
            setShowPlanForm(false);
            setEditingPlan(null);
            await load(true);
            goPlanSection("plans");
          }}
        />
      )}

      {showOwnerForm && (
        <OwnerForm
          owner={editingOwner}
          onCancel={() => {
            setShowOwnerForm(false);
            setEditingOwner(null);
          }}
          onSaved={async () => {
            setShowOwnerForm(false);
            setEditingOwner(null);
            await load(true);
            goTab("owners");
          }}
        />
      )}

      {showBusinessTypeForm && (
        <BusinessTypeForm
          item={editingBusinessType}
          onCancel={() => {
            setShowBusinessTypeForm(false);
            setEditingBusinessType(null);
          }}
          onSaved={async () => {
            setShowBusinessTypeForm(false);
            setEditingBusinessType(null);
            await load(true);
            goConfigTab("types");
          }}
        />
      )}

      {selectedTenant && (
        <TenantDetail
          tenant={selectedTenant}
          plans={plans}
          owners={owners}
          domains={domains}
          databases={databases}
          subscriptions={subscriptions}
          onClose={() => setSelectedTenant(null)}
          onReload={() => load(true)}
        />
      )}
    </div>
  );
};

const SmallMetric = ({ icon: Icon, label, value }: any) => (
  <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
    <div className="w-9 h-9 rounded-xl bg-[#00a884]/10 text-[#00a884] flex items-center justify-center">
      <Icon />
    </div>
    <div>
      <p className="text-[10px] text-gray-400 font-black uppercase tracking-wide">
        {label}
      </p>
      <p className="text-lg font-black text-gray-900">{formatNumber(value)}</p>
    </div>
  </div>
);

const InfoLine = ({ icon: Icon, label, value }: any) => (
  <div className="flex items-center justify-between gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
    <span className="flex items-center gap-2 text-white/70">
      <Icon className="text-[#00a884]" /> {label}
    </span>
    <span className="font-black text-white">{value}</span>
  </div>
);

const EmptyState = ({ icon: Icon, title, text, compact = false }: any) => (
  <div
    className={`bg-white border border-gray-100 rounded-2xl ${compact ? "min-h-[120px]" : "min-h-[240px]"} flex flex-col items-center justify-center text-center shadow-sm p-6`}
  >
    <Icon
      className={`${compact ? "text-3xl" : "text-5xl"} text-gray-200 mb-3`}
    />
    <p className="text-sm text-gray-500 font-bold">{title}</p>
    <p className="text-xs text-gray-400 mt-1 max-w-sm">{text}</p>
  </div>
);

const SubscriptionsView = ({
  subscriptions,
  tenants,
  onSelectTenant,
  showHeader = true,
}: any) => (
  <section className="space-y-4">
    {showHeader && (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
          Comercial
        </p>
        <h2 className="text-lg font-black text-gray-900">
          Suscripciones por negocio
        </h2>
      </div>
    )}
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {subscriptions.map((sub) => {
        const tenant = tenants.find((item) => item.id === sub.tenant_id);
        return (
          <div
            key={sub.id}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  {sub.tenant_slug}
                </p>
                <h3 className="text-lg font-black text-gray-900">
                  {sub.tenant_name}
                </h3>
                <p className="text-xs text-gray-400">
                  Plan {sub.plan_slug} · periodo {sub.billing_period}
                </p>
              </div>
              <Badge value={sub.status} labels={subscriptionLabels} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <InfoBox label="Inicio" value={formatDate(sub.starts_at)} />
              <InfoBox
                label="Próximo corte"
                value={formatDate(sub.next_billing_at)}
              />
            </div>
            {tenant && (
              <button
                onClick={() => onSelectTenant(tenant)}
                className="mt-4 h-10 px-3 rounded-xl bg-[#00a884]/10 text-[#00a884] text-xs font-black hover:bg-[#00a884]/20"
              >
                Gestionar suscripción
              </button>
            )}
          </div>
        );
      })}
      {subscriptions.length === 0 && (
        <div className="xl:col-span-2">
          <EmptyState
            icon={FiCreditCard}
            title="Sin suscripciones"
            text="Las suscripciones aparecerán al crear o actualizar negocios."
          />
        </div>
      )}
    </div>
  </section>
);

const DomainsView = ({ domains, onPrimary, onDelete }: any) => (
  <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
    {domains.map((domain) => (
      <div
        key={domain.id}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {domain.tenant_name || domain.tenant_id}
            </p>
            <h3 className="text-lg font-black text-gray-900 truncate">
              {domain.domain}
            </h3>
            <p className="text-xs text-gray-400">
              {domain.type} · creado {formatDate(domain.created_at)}
            </p>
          </div>
          <Badge value={domain.is_primary ? "active" : "disabled"} />
        </div>
        <div className="mt-4 flex items-center gap-2">
          {!domain.is_primary && (
            <button
              onClick={() => onPrimary(domain)}
              className="h-10 px-3 rounded-xl bg-[#00a884]/10 text-[#00a884] text-xs font-black"
            >
              Marcar principal
            </button>
          )}
          <button
            onClick={() => onDelete(domain)}
            className="h-10 px-3 rounded-xl bg-red-50 text-red-600 text-xs font-black"
          >
            Eliminar
          </button>
        </div>
      </div>
    ))}
    {domains.length === 0 && (
      <div className="xl:col-span-2">
        <EmptyState
          icon={FiGlobe}
          title="Sin dominios"
          text="Los dominios aparecerán cuando crees negocios o agregues dominios personalizados."
        />
      </div>
    )}
  </section>
);

const DatabasesView = ({ databases }: any) => (
  <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
    {databases.map((db) => (
      <div
        key={db.id}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {db.tenant_slug}
            </p>
            <h3 className="text-lg font-black text-gray-900 truncate">
              {db.database_name}
            </h3>
            <p className="text-xs text-gray-400">{db.tenant_name}</p>
          </div>
          <Badge
            value={
              db.status === "ready"
                ? "active"
                : db.status === "error"
                  ? "suspended"
                  : "trial"
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <InfoBox label="Migración" value={db.migration_version} />
          <InfoBox label="Actualizada" value={formatDate(db.updated_at)} />
        </div>
      </div>
    ))}
    {databases.length === 0 && (
      <div className="xl:col-span-2">
        <EmptyState
          icon={FiDatabase}
          title="Sin bases"
          text="Las bases de datos se crean durante el provisionamiento del negocio."
        />
      </div>
    )}
  </section>
);

const CustomersView = ({ customers }: any) => {
  const [locationModalCustomer, setLocationModalCustomer] = useState<any>(null);
  const selectedMapQuery = customerMapQuery(locationModalCustomer || {});

  return (
    <>
      <section className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            Clientes globales
          </p>
          <h2 className="text-lg font-black text-gray-900">
            Identidad compartida entre negocios
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            El cliente se registra una sola vez y puede entrar en cualquier
            negocio sin duplicar sus datos.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left border-collapse">
              <thead className="bg-[#f8fafc] border-b border-gray-100">
                <tr>
                  <th className="px-5 py-4 text-xs font-bold text-gray-500">
                    Cliente
                  </th>
                  <th className="px-5 py-4 text-xs font-bold text-gray-500">
                    Cédula
                  </th>
                  <th className="px-5 py-4 text-xs font-bold text-gray-500">
                    WhatsApp
                  </th>
                  <th className="px-5 py-4 text-xs font-bold text-gray-500">
                    Dirección
                  </th>
                  <th className="px-5 py-4 text-xs font-bold text-gray-500">
                    Calle
                  </th>
                  <th className="px-5 py-4 text-xs font-bold text-gray-500">
                    Ubicación
                  </th>
                  <th className="px-5 py-4 text-xs font-bold text-gray-500 text-center">
                    Crédito (Fiado)
                  </th>
                  <th className="px-5 py-4 text-xs font-bold text-gray-500">
                    Registrado
                  </th>
                  <th className="px-5 py-4 text-xs font-bold text-gray-500 text-center">
                    Negocios vinculados
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => {
                  const creditActive = Number(customer.credit_active || 0);
                  const creditTotal = Number(
                    customer.credit_total || customer.tenant_links || 0,
                  );
                  const creditEnabled = creditActive > 0;
                  const locationText =
                    customer.lat && customer.lng
                      ? `${customer.lat}, ${customer.lng}`
                      : "";
                  const hasMap = canOpenCustomerMap(customer);
                  return (
                    <tr
                      key={customer.id}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            user={customer}
                            name={customer.name}
                            className="w-10 h-10 bg-[#00a884]/10 rounded-full flex items-center justify-center text-[#00a884] shrink-0 border border-[#00a884]/20"
                            icon={FiUserCheck}
                          />
                          <span className="font-bold text-gray-900 text-sm">
                            {customer.name || "Cliente sin nombre"}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs text-gray-600 font-medium">
                        {customer.national_id
                          ? formatDominicanId(customer.national_id)
                          : "—"}
                      </td>
                      <td className="px-5 py-4 text-xs font-bold text-[#00a884]">
                        {customer.whatsapp_display ||
                          formatWhatsappLabel(customer.whatsapp)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-[11px] text-gray-500 leading-snug">
                          <p className="font-bold text-gray-700">
                            {customer.province || "—"}
                          </p>
                          <p>{customer.municipality || "—"}</p>
                          <p>
                            {customer.sector || customer.neighborhood || "—"}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-[11px] text-gray-500 leading-snug">
                          <p>
                            {customer.street
                              ? `${customer.street}${customer.street_number ? ` #${customer.street_number}` : ""}`
                              : "—"}
                          </p>
                          {customer.address_reference && (
                            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md mt-1 inline-block text-[9px] font-bold tracking-wide uppercase">
                              {customer.address_reference}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {hasMap ? (
                          <button
                            onClick={() => setLocationModalCustomer(customer)}
                            className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-[10px] font-bold inline-flex items-center gap-1.5 border border-blue-100 hover:bg-blue-100 transition-colors"
                            title="Ver ubicación del cliente"
                          >
                            <FiMapPin className="text-xs" />{" "}
                            {locationText || "Ver por dirección"}
                          </button>
                        ) : (
                          <span className="text-[10px] text-gray-400">
                            Sin ubicación
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span
                          className={`px-3 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1.5 border ${creditEnabled ? "bg-[#eafaf1] text-[#00a884] border-[#00a884]/30" : "bg-gray-50 text-gray-500 border-gray-200"}`}
                        >
                          {creditEnabled && (
                            <FiCheckCircle className="text-xs" />
                          )}
                          {creditTotal > 0
                            ? `${creditActive}/${creditTotal} ${creditEnabled ? "activo" : "inactivo"}`
                            : "Sin crédito"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-[11px] text-gray-500 font-medium">
                        {formatDateOnly(customer.created_at)}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex items-center justify-center min-w-8 h-8 px-2 rounded-full bg-[#00a884]/10 text-[#00a884] text-xs font-black border border-[#00a884]/20">
                          {customer.tenant_links || 0}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {customers.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-14 text-center">
                      <EmptyState
                        icon={FiUserCheck}
                        title="Sin clientes globales"
                        text="Aparecerán cuando los clientes se registren en los negocios."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {locationModalCustomer && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={() => setLocationModalCustomer(null)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="pointer-events-auto w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[min(75vh,calc(100vh-2rem))]"
            >
              <div className="p-4 border-b border-gray-100 flex justify-between items-start shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center shrink-0">
                    <FiMapPin />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-black text-gray-900 truncate">
                      {locationModalCustomer.name || "Cliente sin nombre"}
                    </h2>
                    <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">
                      {customerAddressLine(locationModalCustomer) ||
                        "Dirección no disponible"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setLocationModalCustomer(null)}
                  className="text-gray-400 hover:text-gray-700 p-1"
                >
                  <FiX className="text-xl" />
                </button>
              </div>

              <div className="flex-1 bg-gray-100 relative w-full">
                <iframe
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  loading="lazy"
                  allowFullScreen
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(selectedMapQuery)}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
                />
              </div>

              <div className="p-4 bg-white border-t border-gray-100 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 shrink-0">
                <div className="flex items-center gap-2 text-[11px] text-gray-500 font-medium min-w-0">
                  <FiMapPin className="text-blue-500 shrink-0" />
                  <span className="truncate">
                    {locationModalCustomer.lat && locationModalCustomer.lng
                      ? `${locationModalCustomer.lat}, ${locationModalCustomer.lng}`
                      : customerAddressLine(locationModalCustomer)}
                  </span>
                </div>
                <a
                  href={`https://www.google.com/maps?q=${encodeURIComponent(selectedMapQuery)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#1a73e8] text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-[#1557b0] transition-colors shadow-sm"
                >
                  <FiExternalLink className="text-sm" /> Abrir en Google Maps
                </a>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </>
  );
};

const AuditView = ({ auditLogs }: any) => (
  <section className="space-y-3">
    {auditLogs.map((log) => (
      <div
        key={log.id}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col xl:flex-row xl:items-center gap-3"
      >
        <div className="w-11 h-11 rounded-xl bg-[#00a884]/10 text-[#00a884] flex items-center justify-center shrink-0">
          <FiFileText />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-black text-gray-900">{log.action}</h3>
            {log.tenant_name && (
              <Badge value="active" labels={{ active: log.tenant_name }} />
            )}
          </div>
          <p className="text-xs text-gray-400">
            {log.actor} · {formatDate(log.created_at)}
          </p>
          <pre className="mt-2 text-[10px] text-gray-500 bg-gray-50 rounded-xl border border-gray-100 p-3 overflow-x-auto">
            {JSON.stringify(log.details || {}, null, 2)}
          </pre>
        </div>
      </div>
    ))}
    {auditLogs.length === 0 && (
      <EmptyState
        icon={FiFileText}
        title="Sin auditoría"
        text="Las acciones de superadministración se registrarán aquí."
      />
    )}
  </section>
);

const emptyBusinessTypeForm = {
  name: "",
  slug: "",
  domain_suffix: ".ltd.do",
  emoji: "🏪",
  sort_order: "0",
  active: true,
};

const BusinessTypeForm = ({ item = null, onCancel, onSaved }: any) => {
  const [form, setForm] = useState(() =>
    item
      ? {
          name: item.name || "",
          slug: item.slug || "",
          domain_suffix: item.domain_suffix || ".ltd.do",
          emoji: item.emoji || "🏪",
          sort_order: String(item.sort_order ?? 0),
          active: item.active !== false,
        }
      : { ...emptyBusinessTypeForm },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isEdit = Boolean(item?.id);
  const update = (key, value) =>
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "name" && !prev.slug) next.slug = normalizeSlug(value);
      if (key === "slug") next.slug = normalizeSlug(value);
      return next;
    });
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        slug: normalizeSlug(form.slug || form.name),
        sort_order: Number(form.sort_order || 0),
      };
      const saved = isEdit
        ? await api.patch(`/platform/business-types/${item.id}`, payload)
        : await api.post("/platform/business-types", payload);
      onSaved?.(saved);
    } catch (err) {
      setError(err.message || "No se pudo guardar el tipo de negocio");
    } finally {
      setSaving(false);
    }
  };
  return (
    <ModalShell onClose={onCancel} width="max-w-2xl">
      <form onSubmit={submit}>
        <div className="p-5 sm:p-6 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black text-[#00a884] uppercase tracking-widest">
              Tipos
            </p>
            <h2 className="text-xl font-black text-gray-900">
              {isEdit ? "Editar tipo de negocio" : "Nuevo tipo de negocio"}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Define el prefijo que aparecerá al crear un negocio.
            </p>
          </div>
          <IconButton onClick={onCancel} title="Cerrar">
            <FiX />
          </IconButton>
        </div>
        <div className="p-5 sm:p-6 space-y-4">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Nombre *"
              value={form.name}
              onChange={(value) => update("name", value)}
              required
              placeholder="Colmado"
            />
            <Field
              label="Identificador URL *"
              value={form.slug}
              onChange={(value) => update("slug", value)}
              required
              placeholder="colmado"
            />
            <Field
              label="Dominio / Sufijo"
              value={form.domain_suffix}
              onChange={(value) => update("domain_suffix", value)}
              placeholder=".ltd.do"
            />
            <Field
              label="Orden"
              type="number"
              value={form.sort_order}
              onChange={(value) => update("sort_order", value)}
              placeholder="0"
            />
            <Field
              label="Icono"
              value={form.emoji}
              onChange={(value) => update("emoji", value)}
              placeholder="🏪"
            />
            <label className="block">
              <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                Estado
              </span>
              <select
                value={form.active ? "active" : "disabled"}
                onChange={(e) => update("active", e.target.value === "active")}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
              >
                <option value="active">Activo</option>
                <option value="disabled">Inactivo</option>
              </select>
            </label>
          </div>
        </div>
        <div className="p-5 sm:p-6 border-t border-gray-100 bg-white flex flex-col sm:flex-row gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-2xl bg-[#00a884] hover:bg-[#008f72] disabled:opacity-70 text-white font-black py-4 shadow-lg shadow-[#00a884]/20 transition-colors"
          >
            {saving
              ? "Guardando..."
              : isEdit
                ? "Guardar cambios"
                : "Crear tipo"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="sm:w-36 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-black py-4 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

const BusinessTypesView = ({ types, onNew, onEdit, onDelete }: any) => (
  <section className="space-y-4">
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-2xl">
          🏠
        </div>
        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            Catálogo
          </p>
          <h2 className="text-lg font-black text-gray-900">Tipos de negocio</h2>
          <p className="text-xs text-gray-400 mt-1">
            El tipo se usa como prefijo al crear un negocio y mejora la
            clasificación del SaaS.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onNew}
        className="h-11 px-4 rounded-xl bg-[#00a884] text-white hover:bg-[#008f72] flex items-center justify-center gap-2 text-xs font-black shadow-md shadow-[#00a884]/20"
      >
        <FiPlus />
        Nuevo tipo
      </button>
    </div>
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-black text-gray-900">Tipos registrados</h3>
        <span className="text-xs text-gray-400 font-bold">
          {types.length} tipo(s)
        </span>
      </div>
      {types.length > 0 ? (
        types.map((type) => (
          <div
            key={type.id || type.slug}
            className="px-5 py-4 border-b border-gray-50 last:border-b-0 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-lg shrink-0">
                {type.emoji || "🏪"}
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-black text-gray-900 truncate">
                  {type.name}
                </h4>
                <p className="text-xs text-gray-400 truncate">
                  {type.domain_suffix || ".ltd.do"} · {type.tenants_count || 0}{" "}
                  negocios
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                value={type.active === false ? "disabled" : "active"}
                labels={{ active: "Activo", disabled: "Inactivo" }}
              />
              <IconButton
                onClick={() => onEdit?.(type)}
                title="Editar tipo"
                className="bg-blue-50 text-blue-600 hover:bg-blue-100"
              >
                <FiEdit3 />
              </IconButton>
              <IconButton
                onClick={() => onDelete?.(type)}
                title="Eliminar tipo"
                disabled={(type.tenants_count || 0) > 0}
                className="bg-red-50 text-red-500 hover:bg-red-100"
              >
                <FiTrash2 />
              </IconButton>
            </div>
          </div>
        ))
      ) : (
        <EmptyState
          icon={FiHome}
          title="Sin tipos de negocio"
          text="Crea tipos como Colmado, Minimarket, Provisiones o Surtidora."
          compact
        />
      )}
    </div>
  </section>
);

const defaultGeoRDMapForm = {
  enabled: false,
  base_url: "https://geo.ltd.do",
  timeout_seconds: 12,
  cache_minutes: 15,
  api_key: "",
  api_key_configured: false,
  ready: false,
};

const normalizeGeoRDMapForm = (payload: any = {}) => {
  const config = payload?.geo_rd_map || payload || {};
  return {
    enabled: Boolean(config.enabled),
    base_url: String(config.base_url || "https://geo.ltd.do"),
    timeout_seconds: Number(config.timeout_seconds || 12),
    cache_minutes: Number(config.cache_minutes || 15),
    api_key: "",
    api_key_configured: Boolean(config.api_key_configured),
    ready: Boolean(config.ready),
  };
};

const TerritoryConfigView = () => {
  const [form, setForm] = useState(defaultGeoRDMapForm);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningAction, setRunningAction] = useState<"verify" | "refresh" | "">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [provinces, setProvinces] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<any[]>([]);
  const [selectedProvinceCode, setSelectedProvinceCode] = useState("");
  const [selectedCityId, setSelectedCityId] = useState("");
  const [selectedNeighborhoodId, setSelectedNeighborhoodId] = useState("");
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingNeighborhoods, setLoadingNeighborhoods] = useState(false);

  const [suggestionName, setSuggestionName] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionNotice, setSuggestionNotice] = useState("");

  const update = (key: string, value: any) =>
    setForm((current) => ({ ...current, [key]: value }));

  const loadProvinces = useCallback(async () => {
    setLoadingProvinces(true);
    try {
      const data = await api.get("/platform/territories/provinces");
      setProvinces(safeList(data));
    } catch (err: any) {
      setProvinces([]);
      throw err;
    } finally {
      setLoadingProvinces(false);
    }
  }, []);

  const loadTerritoryState = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [integration, summaryData] = await Promise.all([
        api.get("/platform/territories/integration"),
        api.get("/platform/territories/summary"),
      ]);
      const normalized = normalizeGeoRDMapForm(integration);
      setForm(normalized);
      setSummary(summaryData || {});
      if (normalized.ready) {
        try {
          await loadProvinces();
        } catch (err: any) {
          setError(err?.message || "No se pudieron cargar las provincias desde GEO RD MAP.");
        }
      } else {
        setProvinces([]);
        setCities([]);
        setNeighborhoods([]);
      }
    } catch (err: any) {
      setError(err?.message || "No se pudo cargar la integración territorial.");
    } finally {
      setLoading(false);
    }
  }, [loadProvinces]);

  useEffect(() => {
    loadTerritoryState();
  }, [loadTerritoryState]);

  const saveIntegration = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        enabled: Boolean(form.enabled),
        base_url: String(form.base_url || "").trim(),
        timeout_seconds: Number(form.timeout_seconds || 12),
        cache_minutes: Number(form.cache_minutes || 15),
        ...(String(form.api_key || "").trim()
          ? { api_key: String(form.api_key).trim() }
          : {}),
      };
      const response = await api.patch("/platform/territories/integration", payload);
      const normalized = normalizeGeoRDMapForm(response);
      setForm(normalized);
      setMessage("Configuración de GEO RD MAP guardada correctamente.");
      const summaryData = await api.get("/platform/territories/summary");
      setSummary(summaryData || {});
      setSelectedProvinceCode("");
      setSelectedCityId("");
      setSelectedNeighborhoodId("");
      setCities([]);
      setNeighborhoods([]);
      if (normalized.ready) await loadProvinces();
      else setProvinces([]);
    } catch (err: any) {
      setError(err?.message || "No se pudo guardar la configuración de GEO RD MAP.");
    } finally {
      setSaving(false);
    }
  };

  const runTerritoryAction = async (action: "verify" | "refresh") => {
    setRunningAction(action);
    setError("");
    setMessage("");
    try {
      const endpoint = action === "verify" ? "verify" : "sync";
      const result = await api.post(`/platform/territories/${endpoint}`, {});
      setSummary(result || {});
      setMessage(
        result?.message ||
          (action === "verify"
            ? "Conexión verificada correctamente con GEO RD MAP."
            : "Caché territorial actualizada desde GEO RD MAP."),
      );
      await loadProvinces();
      setSelectedProvinceCode("");
      setSelectedCityId("");
      setSelectedNeighborhoodId("");
      setCities([]);
      setNeighborhoods([]);
    } catch (err: any) {
      setError(err?.message || "No se pudo completar la operación con GEO RD MAP.");
    } finally {
      setRunningAction("");
    }
  };

  const handleProvinceChange = async (provinceCode: string) => {
    setSelectedProvinceCode(provinceCode);
    setSelectedCityId("");
    setSelectedNeighborhoodId("");
    setNeighborhoods([]);
    setSuggestionNotice("");
    if (!provinceCode) {
      setCities([]);
      return;
    }
    setLoadingCities(true);
    setError("");
    try {
      const data = await api.get(
        `/platform/territories/districts?provinceCode=${encodeURIComponent(provinceCode)}`,
      );
      setCities(safeList(data));
    } catch (err: any) {
      setCities([]);
      setError(err?.message || "No se pudieron cargar las ciudades desde GEO RD MAP.");
    } finally {
      setLoadingCities(false);
    }
  };

  const handleCityChange = async (cityId: string) => {
    setSelectedCityId(cityId);
    setSelectedNeighborhoodId("");
    setSuggestionNotice("");
    if (!cityId) {
      setNeighborhoods([]);
      return;
    }
    const city = cities.find(
      (item) => String(item.identifier || item.cityId || "") === String(cityId),
    );
    setLoadingNeighborhoods(true);
    setError("");
    try {
      const params = new URLSearchParams({
        cityId,
        provinceCode: String(city?.provinceCode || selectedProvinceCode || ""),
        municipalityCode: String(city?.municipalityCode || ""),
        districtCode: String(city?.districtCode || city?.code || ""),
      });
      const data = await api.get(`/platform/territories/neighborhoods?${params.toString()}`);
      setNeighborhoods(safeList(data));
    } catch (err: any) {
      setNeighborhoods([]);
      setError(err?.message || "No se pudieron cargar los barrios desde GEO RD MAP.");
    } finally {
      setLoadingNeighborhoods(false);
    }
  };

  const submitSuggestion = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = String(suggestionName || "").trim();
    const city = cities.find(
      (item) => String(item.identifier || item.cityId || "") === String(selectedCityId),
    );
    const province = provinces.find(
      (item) => String(item.code || "") === String(selectedProvinceCode),
    );
    if (!name || !city || !selectedCityId) {
      setSuggestionNotice("Selecciona provincia y ciudad, y escribe el barrio o residencial faltante.");
      return;
    }
    setSuggesting(true);
    setSuggestionNotice("");
    try {
      await api.post("/platform/territories/neighborhoods/custom", {
        name,
        cityId: selectedCityId,
        provinceCode: city.provinceCode || selectedProvinceCode,
        provinceName: province?.name || "",
        municipalityCode: city.municipalityCode || "",
        municipalityName: city.name || "",
        districtCode: city.districtCode || city.code || "",
      });
      setSuggestionName("");
      setSuggestionNotice(
        "Sugerencia enviada a GEO RD MAP. Queda pendiente de revisión central y aparecerá automáticamente en los selectores cuando sea aprobada.",
      );
    } catch (err: any) {
      setSuggestionNotice(err?.message || "No se pudo enviar la sugerencia a GEO RD MAP.");
    } finally {
      setSuggesting(false);
    }
  };

  const selectedCity = useMemo(
    () =>
      cities.find(
        (item) => String(item.identifier || item.cityId || "") === String(selectedCityId),
      ),
    [cities, selectedCityId],
  );
  const selectedNeighborhood = useMemo(
    () =>
      neighborhoods.find(
        (item) => String(item.id || item.identifier || item.name || "") === String(selectedNeighborhoodId),
      ),
    [neighborhoods, selectedNeighborhoodId],
  );

  const integrationStatus = form.ready
    ? {
        label: summary?.ready === false ? "Configurada" : "GEO RD MAP operativo",
        className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      }
    : form.enabled
      ? {
          label: "Configuración incompleta",
          className: "bg-amber-50 text-amber-700 border-amber-200",
        }
      : {
          label: "Integración desactivada",
          className: "bg-gray-50 text-gray-500 border-gray-200",
        };

  const metrics = [
    { label: "Regiones", value: summary?.regionCount ?? 0 },
    { label: "Provincias", value: summary?.provinceCount ?? 0 },
    { label: "Ciudades", value: summary?.districtCount ?? 0 },
    { label: "Barrios oficiales", value: summary?.neighborhoodCount ?? 0 },
    {
      label: "Barrios personalizados aprobados",
      value: summary?.customNeighborhoodCount ?? 0,
    },
  ];

  return (
    <div className="space-y-4">
      <form
        onSubmit={saveIntegration}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
      >
        <div className="p-5 border-b border-gray-100 flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-[#00a884]/10 text-[#00a884] flex items-center justify-center text-xl shrink-0">
              <FiMapPin />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black text-gray-900">División Territorial</h2>
                <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-600">
                  República Dominicana
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1 max-w-3xl">
                GEO RD MAP es la capa geográfica central de WAMERCIO: catálogo territorial, barrios personalizados, geolocalización, routing y geocercas para todos los negocios. La clave privada nunca se expone al navegador.
              </p>
            </div>
          </div>
          <span
            className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black ${integrationStatus.className}`}
          >
            <FiActivity /> {loading ? "Consultando estado…" : integrationStatus.label}
          </span>
        </div>

        <div className="p-5 space-y-5">
          {(error || message) && (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm font-bold flex items-start gap-2 ${
                error
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {error ? (
                <FiAlertCircle className="mt-0.5 shrink-0" />
              ) : (
                <FiCheckCircle className="mt-0.5 shrink-0" />
              )}
              <span>{error || message}</span>
            </div>
          )}

          <label className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => update("enabled", event.target.checked)}
              className="w-5 h-5 accent-[#00a884]"
            />
            <span>
              <span className="block text-sm font-black text-gray-900">Activar GEO RD MAP</span>
              <span className="block text-[11px] text-gray-400 mt-0.5">
                Sustituye completamente el catálogo territorial local y usa la API central servidor a servidor.
              </span>
            </span>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Field
                label="URL de GEO RD MAP"
                value={form.base_url}
                onChange={(value) => update("base_url", value)}
                placeholder="https://geo.ltd.do"
                required
                hint="Puedes pegar la URL base o una ruta de /api/v1; WAMERCIO normaliza el destino automáticamente."
              />
            </div>
            <Field
              label="Timeout (segundos)"
              type="number"
              value={form.timeout_seconds}
              onChange={(value) => update("timeout_seconds", value)}
              required
              hint="Valor permitido: 2 a 60 segundos."
            />
            <Field
              label="Caché territorial (minutos)"
              type="number"
              value={form.cache_minutes}
              onChange={(value) => update("cache_minutes", value)}
              required
              hint="Reduce llamadas repetidas y protege el límite de la API. Valor permitido: 1 a 1440."
            />
            <div className="md:col-span-2">
              <Field
                label="API Key privada"
                type="password"
                value={form.api_key}
                onChange={(value) => update("api_key", value)}
                placeholder={
                  form.api_key_configured
                    ? "Clave guardada ••••••••"
                    : "Pega la clave geo_live_… del cliente WAMERCIO"
                }
                hint={
                  form.api_key_configured
                    ? "Déjalo vacío para conservar la clave actual. La clave no se devuelve después de guardarla."
                    : "Se guarda en la configuración protegida del backend y se envía únicamente como X-API-Key a GEO RD MAP."
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#00a884]/10 text-[#00a884] flex items-center justify-center shrink-0">
                <FiKey />
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Credencial</p>
                <p className="text-sm font-black text-gray-900 mt-1">
                  {form.api_key_configured ? "Configurada" : "Pendiente"}
                </p>
                <p className="text-[11px] text-gray-400">Solo backend · X-API-Key.</p>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <FiGlobe />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Destino</p>
                <p className="text-sm font-black text-gray-900 mt-1 truncate">{form.base_url || "Sin URL"}</p>
                <p className="text-[11px] text-gray-400">Contrato /api/v1/territories/*.</p>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <FiDatabase />
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Arquitectura</p>
                <p className="text-sm font-black text-gray-900 mt-1">Fuente central</p>
                <p className="text-[11px] text-gray-400">Sin copias territoriales locales en WAMERCIO.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 bg-gray-50/60 flex flex-col sm:flex-row gap-3">
          <button
            type="submit"
            disabled={saving || loading}
            className="h-11 px-5 rounded-xl bg-[#00a884] text-white font-black text-sm hover:bg-[#008f72] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <FiSave /> {saving ? "Guardando…" : "Guardar configuración"}
          </button>
          <button
            type="button"
            onClick={() => runTerritoryAction("verify")}
            disabled={!form.ready || Boolean(runningAction) || saving}
            className="h-11 px-5 rounded-xl bg-white border border-gray-200 text-gray-700 font-black text-sm hover:bg-gray-100 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <FiCheckCircle />
            {runningAction === "verify" ? "Verificando…" : "Verificar conexión"}
          </button>
          <button
            type="button"
            onClick={() => runTerritoryAction("refresh")}
            disabled={!form.ready || Boolean(runningAction) || saving}
            className="h-11 px-5 rounded-xl bg-white border border-gray-200 text-gray-700 font-black text-sm hover:bg-gray-100 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <FiRefreshCw className={runningAction === "refresh" ? "animate-spin" : ""} />
            {runningAction === "refresh" ? "Actualizando…" : "Actualizar desde GEO RD MAP"}
          </button>
        </div>
      </form>

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Estado de los datos</p>
            <h3 className="text-base font-black text-gray-900">Catálogo central de GEO RD MAP</h3>
            <p className="text-xs text-gray-400 mt-1">
              WAMERCIO consulta el catálogo por demanda y conserva una caché temporal para máxima velocidad.
            </p>
          </div>
          <span
            className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black ${
              summary?.ready
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            <FiDatabase /> {summary?.statusLabel || "Configuración requerida"}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-4 text-center">
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-wide">{metric.label}</p>
              <p className="text-xl font-black text-gray-900 mt-1">
                {Number(metric.value || 0).toLocaleString("es-DO")}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Catálogo territorial", detail: "Provincia · ciudad · barrio", icon: FiLayers },
            { label: "Geolocalización", detail: "Geocode y reverse", icon: FiMapPin },
            { label: "Mapa", detail: "Cobertura operativa", icon: FiGlobe },
            { label: "Routing", detail: "Rutas de delivery", icon: FiZap },
            { label: "Geocercas", detail: "Zonas de servicio", icon: FiActivity },
          ].map((capability) => (
            <div key={capability.label} className="rounded-2xl border border-[#00a884]/15 bg-[#f0fdf8] p-3">
              <capability.icon className="text-[#00a884]" />
              <p className="text-[11px] font-black text-gray-900 mt-2">{capability.label}</p>
              <p className="text-[9px] text-gray-500 mt-0.5">{capability.detail}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">PostgreSQL GEO</p>
            <p className="text-sm font-black text-gray-900 mt-1">{summary?.postgres || (summary?.ready ? "Disponible" : "—")}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Redis GEO</p>
            <p className="text-sm font-black text-gray-900 mt-1">{summary?.redis || (summary?.ready ? "Disponible" : "—")}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sincronización</p>
            <p className="text-sm font-black text-gray-900 mt-1">Administrada por GEO RD MAP</p>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Prueba del contrato territorial</p>
            <h3 className="text-base font-black text-gray-900">Provincia → Ciudad → Barrio</h3>
            <p className="text-xs text-gray-400 mt-1">
              Usa exactamente los mismos endpoints internos que los formularios de registro, direcciones y zonas de entrega.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#00a884]/10 text-[#008f72] px-3 py-1.5 text-[11px] font-black">
            <FiLayers /> GEO RD MAP centralizado
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SearchableTerritorySelect
            label="Provincia"
            value={selectedProvinceCode}
            onChange={handleProvinceChange}
            options={provinces.map((item) => ({ ...item, value: item.code, label: item.name }))}
            placeholder={form.ready ? "Selecciona una provincia" : "Configura GEO RD MAP primero"}
            disabled={!form.ready || loadingProvinces}
            loading={loadingProvinces}
          />
          <SearchableTerritorySelect
            label="Ciudad / Municipio / D.M."
            value={selectedCityId}
            onChange={handleCityChange}
            options={cities.map((item) => ({
              ...item,
              value: item.identifier || item.cityId,
              label: item.name,
            }))}
            placeholder={selectedProvinceCode ? "Selecciona una ciudad" : "Selecciona provincia primero"}
            disabled={!selectedProvinceCode || loadingCities}
            loading={loadingCities}
          />
          <SearchableTerritorySelect
            label="Barrio / Sector / Paraje"
            value={selectedNeighborhoodId}
            onChange={setSelectedNeighborhoodId}
            options={neighborhoods.map((item) => ({
              ...item,
              value: item.id || item.identifier || item.name,
              label: item.custom ? `${item.name} · Personalizado` : item.name,
            }))}
            placeholder={selectedCityId ? "Selecciona un barrio" : "Selecciona ciudad primero"}
            disabled={!selectedCityId || loadingNeighborhoods}
            loading={loadingNeighborhoods}
          />
        </div>

        {selectedNeighborhood && (
          <div className="rounded-2xl border border-[#00a884]/20 bg-[#f0fdf8] px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-black text-gray-900">{selectedNeighborhood.name}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {selectedCity?.name || "Ciudad"} · Fuente: GEO RD MAP{selectedNeighborhood.custom ? " · Personalizado aprobado" : ""}
              </p>
            </div>
            <FiCheckCircle className="text-[#00a884] shrink-0" />
          </div>
        )}

        <form onSubmit={submitSuggestion} className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-white text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
              <FiPlus />
            </div>
            <div>
              <p className="text-sm font-black text-gray-900">¿Falta un barrio o residencial?</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                WAMERCIO ya no crea barrios globales localmente. La sugerencia se envía a GEO RD MAP y queda pendiente de aprobación central.
              </p>
            </div>
          </div>
          <div className="flex flex-col lg:flex-row gap-3">
            <input
              value={suggestionName}
              onChange={(event) => setSuggestionName(event.target.value)}
              placeholder={selectedCityId ? "Ej. Residencial Los Pinos" : "Selecciona provincia y ciudad primero"}
              disabled={!selectedCityId || suggesting}
              className="flex-1 h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-900 outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!selectedCityId || !suggestionName.trim() || suggesting}
              className="h-11 px-5 rounded-xl bg-gray-900 text-white font-black text-sm hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <FiArrowRight /> {suggesting ? "Enviando…" : "Enviar sugerencia"}
            </button>
          </div>
          {suggestionNotice && (
            <p className="text-[11px] font-bold text-amber-800">{suggestionNotice}</p>
          )}
        </form>
      </section>

      <div className="rounded-2xl border border-[#00a884]/15 bg-[#f0fdf8] p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-white text-[#00a884] border border-[#00a884]/10 flex items-center justify-center shrink-0">
          <FiLock />
        </div>
        <div>
          <p className="text-sm font-black text-gray-900">Arquitectura servidor a servidor</p>
          <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
            El navegador llama a WAMERCIO y el backend Go consume GEO RD MAP con X-API-Key. La misma integración central sirve a la plataforma y a cada tenant: territorios, barrios personalizados, geocodificación, routing y sincronización de geocercas. El seguimiento GPS de repartidores permanece en WAMERCIO/Redis y se cruza con las zonas de servicio sin exponer ninguna credencial en NEXT_PUBLIC_* ni en el navegador.
          </p>
        </div>
      </div>
    </div>
  );
};

const emptyBankForm = {
  name: "",
  logo: "",
  active: true,
  sort_order: 10,
};

const BankLogoPreview = ({ bank, size = "w-12 h-12" }: any) => {
  if (bank?.logo) {
    return (
      <img
        src={bank.logo}
        alt={bank.name || "Banco"}
        className={`${size} rounded-2xl object-contain bg-white border border-gray-100 p-1.5`}
      />
    );
  }
  return (
    <div
      className={`${size} rounded-2xl bg-[#eafaf1] border border-[#bce8d1] text-[#00a884] flex items-center justify-center text-xl`}
    >
      🏦
    </div>
  );
};

const BanksConfigView = ({ banks = [], onSaved }: any) => {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyBankForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const openModal = (bank = null) => {
    setError("");
    setModal(bank || { type: "new" });
    setForm(
      bank
        ? {
            name: bank.name || "",
            logo: bank.logo || "",
            active: bank.active !== false,
            sort_order: Number(bank.sort_order || bank.sortOrder || 10),
          }
        : emptyBankForm,
    );
  };

  const closeModal = () => {
    setModal(null);
    setError("");
    setForm(emptyBankForm);
  };

  const readLogoFile = (file) => {
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      setError("Selecciona una imagen válida para el logo del banco.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setForm((prev) => ({ ...prev, logo: String(reader.result || "") }));
    reader.onerror = () => setError("No se pudo leer la imagen seleccionada.");
    reader.readAsDataURL(file);
  };

  const saveBank = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("El nombre del banco es obligatorio.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name.trim(),
        logo: String(form.logo || "").trim(),
        active: Boolean(form.active),
        sort_order: Number(form.sort_order || 0),
      };
      if (modal?.id) {
        await api.patch(`/platform/banks/${modal.id}`, payload);
      } else {
        await api.post("/platform/banks", payload);
      }
      closeModal();
      await onSaved?.();
    } catch (err) {
      setError(err.message || "No se pudo guardar el banco.");
    } finally {
      setSaving(false);
    }
  };

  const deleteBank = async (bank) => {
    if (!confirm(`¿Eliminar ${bank.name} del catálogo de bancos?`)) return;
    setSaving(true);
    setError("");
    try {
      await api.delete(`/platform/banks/${bank.id}`);
      await onSaved?.();
    } catch (err) {
      setError(err.message || "No se pudo eliminar el banco.");
    } finally {
      setSaving(false);
    }
  };

  const orderedBanks = [...banks].sort(
    (a, b) =>
      Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
      String(a.name || "").localeCompare(String(b.name || "")),
  );

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Catálogo bancario
            </p>
            <h2 className="text-lg font-black text-gray-900">
              Bancos disponibles
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Estos bancos se usan en el modal Nueva / Editar cuenta del panel
              de administración de cada negocio.
            </p>
          </div>
          <button
            onClick={() => openModal()}
            className="h-11 px-5 rounded-xl bg-[#00a884] text-white font-black text-sm hover:bg-[#008f72] flex items-center justify-center gap-2 shadow-sm"
          >
            <FiPlus /> Agregar banco
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        {orderedBanks.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 py-14 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white border border-gray-100 mx-auto flex items-center justify-center text-2xl mb-3">
              🏦
            </div>
            <p className="text-sm font-black text-gray-800">
              No hay bancos registrados
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Agrega bancos para que los negocios puedan configurar cuentas
              bancarias.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {orderedBanks.map((bank) => (
              <div
                key={bank.id || bank.name}
                className="rounded-3xl border border-gray-100 bg-gray-50/70 p-4 flex items-center gap-3"
              >
                <BankLogoPreview bank={bank} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-gray-900 truncate">
                    {bank.name}
                  </p>
                  <p
                    className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${bank.active !== false ? "bg-[#00a884]/10 text-[#008f72]" : "bg-gray-200 text-gray-500"}`}
                  >
                    {bank.active !== false ? "Activo" : "Inactivo"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openModal(bank)}
                    className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center"
                    title="Editar banco"
                  >
                    <FiEdit3 />
                  </button>
                  <button
                    onClick={() => deleteBank(bank)}
                    className="w-9 h-9 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center"
                    title="Eliminar banco"
                  >
                    <FiTrash2 />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeModal}
          />
          <form
            onSubmit={saveBank}
            className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  {modal?.id ? "Editar banco" : "Nuevo banco"}
                </p>
                <h3 className="text-base font-black text-gray-900">
                  Catálogo de bancos
                </h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="w-9 h-9 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center"
              >
                <FiX />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                  {error}
                </div>
              )}
              <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <BankLogoPreview bank={form} size="w-16 h-16" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-gray-900">
                    Logo del banco
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Puedes cargar una imagen o pegar una URL pública.
                  </p>
                  <label className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 cursor-pointer hover:bg-gray-50">
                    <FiImage /> Cargar imagen
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) =>
                        readLogoFile(event.target.files?.[0])
                      }
                    />
                  </label>
                </div>
              </div>
              <Field
                label="Nombre del banco"
                value={form.name}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, name: value }))
                }
                placeholder="Ej. Banco de Reservas"
              />
              <Field
                label="Logo / URL de imagen"
                value={form.logo}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, logo: value }))
                }
                placeholder="https://... o imagen cargada"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Orden"
                  type="number"
                  value={form.sort_order}
                  onChange={(value) =>
                    setForm((prev) => ({ ...prev, sort_order: value }))
                  }
                />
                <label className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 mt-5">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        active: event.target.checked,
                      }))
                    }
                    className="w-5 h-5 accent-[#00a884]"
                  />
                  <span>
                    <span className="block text-sm font-black text-gray-900">
                      Banco activo
                    </span>
                    <span className="block text-xs text-gray-400">
                      Visible en cuentas bancarias
                    </span>
                  </span>
                </label>
              </div>
            </div>
            <div className="px-6 py-5 border-t border-gray-100 bg-gray-50 flex gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 h-11 rounded-xl bg-white border border-gray-200 text-gray-700 font-black text-sm hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                disabled={saving}
                className="flex-1 h-11 rounded-xl bg-[#00a884] text-white font-black text-sm hover:bg-[#008f72] disabled:opacity-60"
              >
                <FiSave className="inline mr-2" />
                Guardar banco
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const PlatformWhatsAppView = ({ settings = {}, onSaved }: any) => {
  const [state, setState] = useState(() => whatsappInitialConfig(settings));
  const [waxumState, setWaxumState] = useState(() =>
    waxumInitialConfig(settings),
  );
  const [mode, setMode] = useState("qr");
  const [phone, setPhone] = useState(
    () =>
      whatsappInitialConfig(settings).phone ||
      whatsappInitialConfig(settings).last_pairing_phone ||
      normalizePairingPhone(settings.support_whatsapp || "") ||
      "",
  );
  const [qrCode, setQrCode] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const transientSessionRef = useRef(state.session_id || "");
  const [copied, setCopied] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [providerChecked, setProviderChecked] = useState(false);

  const waxumReady = waxumConfigIsReady(waxumState);
  const supportPairingPhone = normalizePairingPhone(
    settings.support_whatsapp || "",
  );
  const supportPairingLabel = supportPairingPhone
    ? whatsappLinkedPhone({ phone: supportPairingPhone })
    : "No configurado";
  const statusText = whatsappStatusLabel(state);
  const statusClass = whatsappStatusClass(state);
  const qrSrc = qrImageSource(qrCode);
  const isLinked = Boolean(
    state.logged_in || (state as any).loggedIn || state.status === "linked",
  );
  const linkedName = whatsappLinkedName(state);
  const linkedPhone = whatsappLinkedPhone(state, phone);
  const linkedImage = whatsappLinkedImage(state);

  const applyPayload = (payload: any = {}) => {
    const nextWaxum =
      payload?.waxum && typeof payload.waxum === "object"
        ? payload.waxum
        : null;
    if (nextWaxum) {
      setWaxumState((prev) => {
        const merged = { ...prev, ...nextWaxum };
        return { ...merged, ready: waxumConfigIsReady(merged) };
      });
      setProviderChecked(true);
    }
    const next =
      payload?.whatsapp && typeof payload.whatsapp === "object"
        ? payload.whatsapp
        : payload;
    if (!next || typeof next !== "object") return;
    setState((prev) => {
      const nextSessionId = String(
        next.session_id || next.sessionId || prev.session_id || "",
      );
      if (
        prev.session_id &&
        nextSessionId &&
        prev.session_id !== nextSessionId
      ) {
        setQrCode("");
        setPairingCode("");
      }
      transientSessionRef.current =
        nextSessionId || transientSessionRef.current;
      return { ...prev, ...next };
    });
    if (next.phone && !phone) setPhone(next.phone);
    const nextLinked = Boolean(
      next.logged_in || next.loggedIn || next.status === "linked",
    );
    const nextDisconnected =
      next.status === "disconnected" ||
      (next.connected === false && nextLinked === false);
    if (nextLinked) {
      setQrCode("");
      setPairingCode("");
      if (!state.logged_in && state.status !== "linked")
        setMessage("WhatsApp vinculado exitosamente.");
    } else if (nextDisconnected) {
      setQrCode("");
      setPairingCode("");
      if (state.logged_in || state.status === "linked") {
        setMessage(
          "WhatsApp fue desvinculado desde el móvil. La sesión se eliminó automáticamente.",
        );
      }
    }
  };

  const copyValue = async (key, value) => {
    if (!value || typeof navigator === "undefined") return;
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(""), 1600);
    } catch (_) {
      setCopied("");
    }
  };

  const loadState = useCallback(async () => {
    setLoading("refresh");
    setError("");
    try {
      const data = await api.get("/platform/whatsapp");
      applyPayload(data);
      setProviderChecked(true);
    } catch (err) {
      setProviderChecked(true);
      setError(err.message || "No se pudo cargar el estado de WhatsApp");
    } finally {
      setLoading("");
    }
  }, []);

  useEffect(() => {
    const initial = whatsappInitialConfig(settings);
    const previousSessionId = transientSessionRef.current;
    setState(initial);
    setWaxumState(waxumInitialConfig(settings));
    setPhone(
      initial.phone ||
        initial.last_pairing_phone ||
        normalizePairingPhone(settings.support_whatsapp || "") ||
        "",
    );
    if (
      previousSessionId &&
      initial.session_id &&
      previousSessionId !== initial.session_id
    ) {
      setQrCode("");
      setPairingCode("");
    }
    transientSessionRef.current =
      initial.session_id || previousSessionId || "";
    setError("");
    setMessage("");
    setProviderChecked(waxumConfigIsReady(waxumInitialConfig(settings)));
  }, [settings]);

  useEffect(() => {
    loadState();
  }, [loadState]);

  useEffect(() => {
    if (!isLinked) return;
    setQrCode("");
    setPairingCode("");
  }, [isLinked]);

  useEffect(() => {
    if (!isLinked || !state.session_id) return undefined;
    let cancelled = false;
    const checkExternalUnlink = async () => {
      try {
        const data = await api.get("/platform/whatsapp/status");
        if (cancelled) return;
        applyPayload(data);
        if (whatsappPayloadWasAutoUnlinked(data)) {
          setQrCode("");
          setPairingCode("");
          setMessage(
            "WhatsApp fue desvinculado desde el móvil. La sesión se eliminó automáticamente.",
          );
        }
      } catch (_) {}
    };
    const interval = setInterval(checkExternalUnlink, 7000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isLinked, state.session_id]);

  useEffect(() => {
    if (
      !state.session_id ||
      !state.connected ||
      isLinked ||
      (!qrCode && !pairingCode)
    )
      return undefined;
    let cancelled = false;
    let attempts = 0;
    let interval: any = null;
    let initialTimeout: any = null;

    const checkLinkedStatus = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const data = await api.get("/platform/whatsapp/status");
        if (cancelled) return;
        applyPayload(data);
        const next =
          data?.whatsapp && typeof data.whatsapp === "object"
            ? data.whatsapp
            : data;
        if (next?.logged_in || next?.loggedIn || next?.status === "linked") {
          setQrCode("");
          setPairingCode("");
          setMessage("WhatsApp vinculado exitosamente.");
          await onSaved?.();
          if (interval) clearInterval(interval);
          if (initialTimeout) clearTimeout(initialTimeout);
        }
      } catch (_) {}
      if (attempts >= 48 && interval) clearInterval(interval);
    };

    initialTimeout = setTimeout(checkLinkedStatus, 1500);
    interval = setInterval(checkLinkedStatus, 2500);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      if (initialTimeout) clearTimeout(initialTimeout);
    };
  }, [state.session_id, state.connected, isLinked, qrCode, pairingCode]);

  const runAction = async (action, label, successText, options: any = {}) => {
    const shouldSyncSettings = options.sync !== false;
    setLoading(label);
    setError("");
    setMessage("");
    try {
      const data = await action();
      applyPayload(data);
      if (shouldSyncSettings) await onSaved?.();
      setMessage(
        whatsappPayloadWasAutoUnlinked(data)
          ? "WhatsApp fue desvinculado desde el móvil. La sesión se eliminó automáticamente."
          : successText,
      );
      return data;
    } catch (err) {
      setError(err.message || "No se pudo completar la acción solicitada");
      return null;
    } finally {
      setLoading("");
    }
  };

  const refreshStatus = () =>
    runAction(
      () => api.get("/platform/whatsapp/status"),
      "refresh",
      "Estado de WhatsApp actualizado.",
    );

  const disconnectSession = async () => {
    setQrCode("");
    setPairingCode("");
    return runAction(
      () => api.post("/platform/whatsapp/disconnect", { clear: true }),
      "disconnect",
      "WhatsApp desvinculado y la sesión fue eliminada correctamente.",
    );
  };

  const generateQR = async () => {
    setLoading("qr");
    setError("");
    setMessage("");
    setPairingCode("");
    try {
      // The QR endpoint creates the remote session only after this explicit
      // linking action, so opening or saving settings cannot leave orphans.
      const data = await api.get("/platform/whatsapp/qr");
      applyPayload(data);
      const nextQRCode = qrCodeFromResponse(data);
      if (nextQRCode) {
        setQrCode(nextQRCode);
        setMessage(
          "Sesión creada en WAXUM. Escanea el código QR desde WhatsApp para vincularla.",
        );
        return;
      }
      if (
        data?.already_linked ||
        data?.whatsapp?.logged_in ||
        data?.whatsapp?.loggedIn
      ) {
        setQrCode("");
        setPairingCode("");
        setMessage("WhatsApp vinculado exitosamente.");
        await onSaved?.();
        return;
      }
      setError(
        "WAXUM respondió correctamente, pero no devolvió un código QR válido. Presiona Actualizar estado y vuelve a intentarlo.",
      );
    } catch (err) {
      setError(
        err?.message ||
          "No se pudo crear la sesión ni obtener el código QR desde WAXUM.",
      );
    } finally {
      setProviderChecked(true);
      setLoading("");
    }
  };

  const requestPairingCode = async () => {
    const normalizedPhone = normalizePairingPhone(
      settings.support_whatsapp || phone,
    );
    if (!normalizedPhone) {
      setError(
        "Configura primero el WhatsApp soporte en Ajustes generales para generar el código de emparejamiento automáticamente.",
      );
      return;
    }
    setLoading("pairing");
    setError("");
    setMessage("");
    setPhone(normalizedPhone);
    setQrCode("");
    try {
      const data = await api.post("/platform/whatsapp/pairing-code", {
        phone: normalizedPhone,
      });
      applyPayload(data);
      const nextPairingCode = pairingCodeFromResponse(data);
      if (nextPairingCode) {
        setPairingCode(nextPairingCode);
        setMessage("Código de emparejamiento generado correctamente.");
      } else if (
        data?.already_linked ||
        data?.whatsapp?.logged_in ||
        data?.whatsapp?.loggedIn
      ) {
        setQrCode("");
        setPairingCode("");
        setMessage("WhatsApp vinculado exitosamente.");
        await onSaved?.();
      } else {
        setError(
          "WAXUM aceptó la solicitud, pero no devolvió el código de emparejamiento.",
        );
      }
      if (data?.phone) setPhone(data.phone);
    } catch (err) {
      setError(
        err?.message ||
          "No se pudo crear la sesión ni generar el código de emparejamiento en WAXUM.",
      );
    } finally {
      setProviderChecked(true);
      setLoading("");
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden w-full">
      <div className="p-5 border-b border-gray-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            WhatsApp de plataforma
          </p>
          <h2 className="text-lg font-black text-gray-900">
            Sesión WAMERCIO
          </h2>
          <p className="text-xs text-gray-400 mt-1 max-w-4xl">
            Vincula el WhatsApp global de WAMERCIO en un solo paso. Al elegir QR
            o emparejamiento, WAMERCIO crea y prepara la sesión, luego
            muestra el código automáticamente.
          </p>
        </div>
        <span
          className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-black ${statusClass}`}
        >
          <FiActivity /> {statusText}
        </span>
      </div>

      <div className="p-5 space-y-5">
        {providerChecked && !waxumReady && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700 flex items-start gap-2">
            <FiAlertCircle className="mt-0.5 shrink-0" /> Configura y activa
            primero la conexión WAXUM dentro de esta misma sección con la URL
            pública y el token de superadministración.
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 flex items-center gap-2">
            <FiAlertCircle /> {error}
          </div>
        )}
        {(message || isLinked) && (
          <div className="rounded-2xl border border-[#00a884]/20 bg-[#00a884]/10 px-4 py-3 text-sm font-bold text-[#008f72] flex items-center gap-2">
            <FiCheckCircle />{" "}
            {isLinked ? "WhatsApp vinculado exitosamente." : message}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.95fr)_minmax(520px,1.05fr)] gap-5 items-start">
          <div className="space-y-5">
            <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    Estado de la sesión
                  </p>
                  <h3 className="text-base font-black text-gray-900">
                    Conexión global de WAMERCIO
                  </h3>
                </div>
                <span
                  className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-black ${statusClass}`}
                >
                  <FiActivity /> {statusText}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 min-w-0">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-[#00a884]/10 text-[#00a884] flex items-center justify-center shrink-0">
                      <FiMessageCircle />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        Sesión
                      </p>
                      <p className="mt-1 text-sm font-black text-gray-900 break-all">
                        WAMERCIO
                      </p>
                      <p className="text-[11px] text-gray-400 break-all">
                        {state.session_id || "Pendiente de crear"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 min-w-0">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <FiWifi />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        Sesión
                      </p>
                      <p className="mt-1 text-sm font-black text-gray-900">
                        {state.connected ? "Conectada" : "Desconectada"}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {state.logged_in
                          ? "Vinculada a WhatsApp"
                          : "Pendiente de vincular"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 min-w-0 sm:col-span-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                      <FiSmartphone />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        WhatsApp vinculado
                      </p>
                      <p className="mt-1 text-sm font-black text-gray-900 break-all">
                        {state.phone ||
                          state.jid ||
                          "Aún no hay número vinculado"}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        Esta cuenta será usada por los módulos centrales del
                        panel SaaS.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-[#00a884]/15 bg-[#f0fdf8] p-5 flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white text-[#00a884] flex items-center justify-center border border-[#00a884]/10 shrink-0">
                <FiShield />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-gray-900">
                  Uso global y seguro
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  La sesión queda registrada en{" "}
                  <strong>platform_settings.whatsapp_platform</strong>. El
                  servidor usa el token de superadministración de WAXUM
                  internamente para crear la sesión, solicitar el QR, generar el
                  código de emparejamiento, consultar el estado y habilitar
                  futuras funciones sin exponerlo al cliente público.
                </p>
              </div>
            </div>
          </div>

          {isLinked ? (
            <div className="rounded-3xl border border-[#00a884]/20 bg-[#f0fdf8] p-6 shadow-sm min-h-[360px] flex items-center justify-center">
              <div className="w-full max-w-xl text-center">
                <div className="mx-auto mb-5 h-24 w-24 overflow-hidden rounded-3xl border border-[#00a884]/20 bg-white shadow-sm flex items-center justify-center">
                  {linkedImage ? (
                    <img
                      src={linkedImage}
                      alt={linkedName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-[#00a884]/10 text-[#00a884] flex items-center justify-center text-4xl">
                      <FiCheckCircle />
                    </div>
                  )}
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-[#00a884]/10 px-4 py-2 text-xs font-black text-[#008f72] border border-[#00a884]/20">
                  <FiCheckCircle /> Vinculado exitosamente
                </div>
                <h3 className="mt-4 text-2xl font-black text-gray-900 break-words">
                  {linkedName}
                </h3>
                <p className="mt-1 text-sm font-black text-[#008f72] break-all">
                  {linkedPhone}
                </p>
                <p className="mt-3 text-xs text-gray-500 leading-relaxed">
                  Esta cuenta de WhatsApp queda activa para los módulos
                  centrales del panel SaaS y futuras integraciones globales de
                  WAMERCIO.
                </p>
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                  <div className="rounded-2xl border border-[#00a884]/15 bg-white p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Sesión
                    </p>
                    <p className="mt-1 text-sm font-black text-gray-900">
                      Conectada y vinculada
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#00a884]/15 bg-white p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Sesión
                    </p>
                    <p className="mt-1 text-sm font-black text-gray-900 break-all">
                      WAMERCIO
                    </p>
                  </div>
                </div>
                <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    type="button"
                    onClick={refreshStatus}
                    disabled={Boolean(loading) || !state.session_id}
                    className="h-11 px-5 rounded-2xl bg-white border border-[#00a884]/20 text-[#008f72] font-black text-xs hover:bg-[#00a884]/10 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    <FiRefreshCw
                      className={loading === "refresh" ? "animate-spin" : ""}
                    />{" "}
                    Actualizar estado
                  </button>
                  <button
                    type="button"
                    onClick={disconnectSession}
                    disabled={Boolean(loading) || !state.session_id}
                    className="h-11 px-5 rounded-2xl bg-red-50 border border-red-100 text-red-600 font-black text-xs hover:bg-red-100 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    <FiX /> Desvincular
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-gray-100 bg-gray-50 p-5 shadow-sm">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-5">
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    Vinculación rápida
                  </p>
                  <h3 className="text-base font-black text-gray-900">
                    Vincular WhatsApp
                  </h3>
                  <p className="mt-1 text-xs text-gray-400">
                    Elige un método. WAMERCIO usa el SDK de WAXUM para
                    crear o reparar la sesión y generar el código
                    automáticamente.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-full sm:min-w-[420px]">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("qr");
                      void generateQR();
                    }}
                    disabled={Boolean(loading)}
                    className={`h-12 px-4 rounded-2xl text-xs font-black flex items-center justify-center gap-2 border transition ${mode === "qr" ? "bg-[#00a884] text-white border-[#00a884] shadow-md shadow-[#00a884]/20" : "bg-white text-gray-600 border-gray-100 hover:bg-gray-50"} disabled:opacity-60`}
                  >
                    <FiGrid />{" "}
                    {loading === "qr" ? "Generando QR..." : "Código QR"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("pairing");
                      void requestPairingCode();
                    }}
                    disabled={Boolean(loading) || !supportPairingPhone}
                    className={`h-12 px-4 rounded-2xl text-xs font-black flex items-center justify-center gap-2 border transition ${mode === "pairing" ? "bg-[#00a884] text-white border-[#00a884] shadow-md shadow-[#00a884]/20" : "bg-white text-gray-600 border-gray-100 hover:bg-gray-50"} disabled:opacity-60`}
                  >
                    <FiHash />{" "}
                    {loading === "pairing"
                      ? "Generando código..."
                      : "Emparejamiento"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-stretch">
                <div className="rounded-3xl bg-white border border-gray-100 p-5 min-h-[320px] flex items-center justify-center text-center">
                  {mode === "qr" ? (
                    qrCode ? (
                      qrSrc ? (
                        <img
                          src={qrSrc}
                          alt="Código QR de WhatsApp"
                          className="w-64 h-64 object-contain mx-auto"
                        />
                      ) : (
                        <div className="w-full rounded-2xl bg-gray-50 border border-gray-100 p-4">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                            QR recibido
                          </p>
                          <p className="text-xs font-bold text-gray-700 break-all">
                            {qrCode}
                          </p>
                        </div>
                      )
                    ) : (
                      <div>
                        <div className="w-20 h-20 rounded-3xl bg-[#00a884]/10 text-[#00a884] mx-auto flex items-center justify-center text-3xl mb-4">
                          <FiGrid />
                        </div>
                        <p className="text-sm font-black text-gray-900">
                          Presiona Código QR
                        </p>
                        <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                          Se creará la sesión y aparecerá el QR para escanear
                          desde WhatsApp.
                        </p>
                      </div>
                    )
                  ) : pairingCode ? (
                    <div className="w-full">
                      <div className="w-14 h-14 rounded-2xl bg-[#00a884]/10 text-[#00a884] mx-auto flex items-center justify-center text-2xl mb-4">
                        <FiHash />
                      </div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        Código de emparejamiento
                      </p>
                      <p className="mt-2 text-3xl font-black text-gray-900 tracking-widest break-all">
                        {formatPairingCode(pairingCode)}
                      </p>
                      <p className="mt-2 text-xs text-gray-400">
                        Número soporte: {supportPairingLabel}
                      </p>
                      <button
                        type="button"
                        onClick={() => copyValue("pairing", pairingCode)}
                        className="mt-4 h-10 px-4 rounded-xl bg-gray-100 text-gray-700 text-xs font-black hover:bg-gray-200 inline-flex items-center gap-2"
                      >
                        <FiCopy /> {copied === "pairing" ? "Copiado" : "Copiar"}
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="w-20 h-20 rounded-3xl bg-blue-50 text-blue-600 mx-auto flex items-center justify-center text-3xl mb-4">
                        <FiHash />
                      </div>
                      <p className="text-sm font-black text-gray-900">
                        Presiona Emparejamiento
                      </p>
                      <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                        Se usará automáticamente el WhatsApp soporte:{" "}
                        <strong className="text-gray-700">
                          {supportPairingLabel}
                        </strong>
                        .
                      </p>
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-gray-100 bg-white p-5 flex flex-col justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      Proceso automático
                    </p>
                    <h4 className="mt-1 text-base font-black text-gray-900">
                      Sin pasos manuales
                    </h4>
                    <p className="mt-2 text-xs text-gray-400 leading-relaxed">
                      La sesión se crea al solicitar el QR o el código.
                      Cuando WhatsApp quede vinculado, el panel limpiará el
                      código y mostrará la cuenta conectada.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#00a884]/10 text-[#00a884] flex items-center justify-center shrink-0">
                        <FiZap />
                      </div>
                      <div>
                        <p className="text-xs font-black text-gray-900">
                          Sesión automática
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          No necesitas crear ni preparar la sesión manualmente.
                        </p>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <FiSmartphone />
                      </div>
                      <div>
                        <p className="text-xs font-black text-gray-900">
                          WhatsApp soporte
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1 break-all">
                          {supportPairingPhone
                            ? supportPairingLabel
                            : "Configúralo en General para usar emparejamiento."}
                        </p>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={refreshStatus}
                    disabled={Boolean(loading) || !state.session_id}
                    className="w-full h-11 rounded-2xl bg-gray-100 text-gray-700 font-black text-xs hover:bg-gray-200 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    <FiRefreshCw
                      className={loading === "refresh" ? "animate-spin" : ""}
                    />{" "}
                    Actualizar estado
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const WaxumIntegrationView = ({ settings = {}, onSaved, onConfigured }: any) => {
  const [form, setForm] = useState(() => waxumInitialConfig(settings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    setForm(waxumInitialConfig(settings));
    setMessage("");
    setError("");
    setCopied("");
  }, [settings]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const copyValue = async (key, value) => {
    if (!value || typeof navigator === "undefined") return;
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(""), 1600);
    } catch (_) {
      setCopied("");
    }
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const publicURL = normalizeWaxumPublicUrl(form.public_url);
      const dashboardURL = buildWaxumDashboardUrl(publicURL);
      const docsURL = buildWaxumDocsUrl(publicURL);
      const adminToken = String(form.admin_token || "").trim();
      if (!publicURL || !adminToken) {
        throw new Error(
          "Completa la URL pública y el token de superadministración de WAXUM. El panel se genera automáticamente.",
        );
      }
      if (!/^https?:\/\//i.test(publicURL)) {
        throw new Error(
          "La URL pública de WAXUM debe iniciar con http:// o https://.",
        );
      }
      const waxumConfig = {
        enabled: Boolean(form.enabled),
        public_url: publicURL,
        dashboard_url: dashboardURL,
        docs_url: docsURL,
        admin_token: adminToken,
      };

      // The dedicated endpoint validates the provider and removes sessions
      // from the previous provider when it is disabled or replaced. Saving
      // credentials never creates a WhatsApp session.
      const configured = await api.post("/platform/waxum/configure", waxumConfig);

      setForm((prev) => ({
        ...prev,
        ...waxumConfig,
        ...(configured?.waxum || {}),
        admin_token: adminToken,
      }));
      setMessage(
        waxumConfig.enabled
          ? "Integración WAXUM guardada. La sesión se creará únicamente cuando inicies la vinculación."
          : "Integración WAXUM desactivada y sesiones administradas eliminadas.",
      );
      await onSaved?.();
      onConfigured?.();
    } catch (err) {
      setError(err.message || "No se pudo guardar la integración WAXUM");
    } finally {
      setSaving(false);
    }
  };

  const publicLink = normalizeWaxumPublicUrl(form.public_url);
  const dashboardLink = buildWaxumDashboardUrl(form.public_url);
  const docsLink = buildWaxumDocsUrl(form.public_url);
  const isReady = Boolean(publicLink && form.admin_token);

  return (
    <form
      onSubmit={save}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden w-full"
    >
      <div className="p-5 border-b border-gray-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            Integración WhatsApp
          </p>
          <h2 className="text-lg font-black text-gray-900">Conexión WAXUM</h2>
          <p className="text-xs text-gray-400 mt-1 max-w-3xl">
            Configura únicamente el dominio público y el token de superadministración.
            WAMERCIO genera el panel automáticamente para que el SDK del
            servidor use WAXUM sin exponer credenciales.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {docsLink && (
            <button
              type="button"
              onClick={() =>
                window.open(docsLink, "_blank", "noopener,noreferrer")
              }
              className="h-10 px-4 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center gap-2 text-xs font-black"
            >
              <FiExternalLink /> Abrir API
            </button>
          )}
          {dashboardLink && (
            <button
              type="button"
              onClick={() => {
                window.open(dashboardLink, "_blank", "noopener,noreferrer");
                setMessage(
                  "Panel de WAXUM abierto. Inicia sesión con el mismo token de superadministración cuando el panel lo solicite.",
                );
              }}
              className="h-10 px-4 rounded-xl bg-[#00a884]/10 text-[#008f72] border border-[#00a884]/20 hover:bg-[#00a884]/15 flex items-center gap-2 text-xs font-black"
            >
              <FiMonitor /> Panel
            </button>
          )}
          <button
            disabled={saving}
            className="h-10 px-4 rounded-xl bg-[#00a884] text-white hover:bg-[#008f72] flex items-center gap-2 text-xs font-black shadow-md shadow-[#00a884]/20 disabled:opacity-60"
          >
            <FiSave /> {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 flex items-center gap-2">
            <FiAlertCircle /> {error}
          </div>
        )}
        {message && (
          <div className="rounded-2xl border border-[#00a884]/20 bg-[#00a884]/10 px-4 py-3 text-sm font-bold text-[#008f72] flex items-center gap-2">
            <FiCheckCircle /> {message}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.55fr)] gap-5 items-start">
          <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Configuración principal
                </p>
                <h3 className="text-base font-black text-gray-900">
                  Credenciales centrales de WAXUM
                </h3>
              </div>
              <span
                className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-black ${isReady && form.enabled ? "bg-[#00a884]/10 text-[#008f72]" : "bg-gray-100 text-gray-500"}`}
              >
                <FiActivity />{" "}
                {isReady && form.enabled
                  ? "Integración activa"
                  : "Pendiente de configuración"}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                  URL pública de WAXUM
                </span>
                <div className="relative">
                  <FiGlobe className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={form.public_url ?? ""}
                    onChange={(event) =>
                      update("public_url", event.target.value)
                    }
                    required
                    type="text"
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 pl-11 pr-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
                    placeholder="waxum.ltd.do"
                    autoComplete="off"
                  />
                </div>
                <span className="block text-[11px] text-gray-400 mt-2">
                  Puedes escribir solo el dominio. Se guardará como URL segura y
                  el panel se calculará automáticamente.
                </span>
              </label>

              <label className="block">
                <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                  Token de administración
                </span>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1 min-w-0">
                    <FiKey className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={form.admin_token ?? ""}
                      onChange={(event) =>
                        update("admin_token", event.target.value)
                      }
                      required
                      type={showToken ? "text" : "password"}
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 pl-11 pr-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
                      placeholder="Token de superadministración de WAXUM"
                      autoComplete="off"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowToken((prev) => !prev)}
                    className="h-12 px-4 rounded-2xl bg-gray-100 text-gray-700 hover:bg-gray-200 text-xs font-black flex items-center justify-center gap-2"
                  >
                    <FiEye /> {showToken ? "Ocultar" : "Ver"}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyValue("token", form.admin_token)}
                    className="h-12 px-4 rounded-2xl bg-gray-100 text-gray-700 hover:bg-gray-200 text-xs font-black flex items-center justify-center gap-2"
                  >
                    <FiCopy /> {copied === "token" ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <span className="block text-[11px] text-gray-400 mt-2">
                  Este token queda guardado como configuración global del SaaS.
                </span>
              </label>

              <label className="lg:col-span-2 flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) => update("enabled", event.target.checked)}
                  className="w-5 h-5 accent-[#00a884]"
                />
                <span>
                  <span className="block text-sm font-black text-gray-900">
                    Activar WAXUM como integración global
                  </span>
                  <span className="block text-xs text-gray-400">
                    Cuando esté activo, los módulos de WhatsApp usarán estos
                    parámetros centrales.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-100 bg-gray-50 p-5 space-y-4">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Resumen de conexión
              </p>
              <h3 className="text-base font-black text-gray-900">
                Salida global del SDK
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
              <div className="rounded-2xl border border-gray-100 bg-white p-4 min-w-0">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-[#00a884]/10 text-[#00a884] flex items-center justify-center shrink-0">
                    <FiMessageCircle />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      URL pública
                    </p>
                    <p className="mt-1 text-sm font-black text-gray-900 break-all">
                      {publicLink || "Sin configurar"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-4 min-w-0">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <FiMonitor />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      Panel automático
                    </p>
                    <p className="mt-1 text-sm font-black text-gray-900 break-all">
                      {dashboardLink || "Sin configurar"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-4 min-w-0 sm:col-span-2 xl:col-span-1">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <FiKey />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      Token de administración
                    </p>
                    <p className="mt-1 text-sm font-black text-gray-900 break-all">
                      {maskSecret(form.admin_token)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#00a884]/15 bg-[#f0fdf8] p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white text-[#00a884] flex items-center justify-center border border-[#00a884]/10 shrink-0">
                <FiShield />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-gray-900">
                  Preparado para el SDK del servidor
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  La configuración queda disponible en{" "}
                  <strong>platform_settings.waxum</strong> para que Go cree
                  clientes WAXUM seguros sin exponer credenciales a tiendas o
                  clientes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
};


const defaultBackupConfig = (settings: any = {}) => {
  const raw = settings?.backups && typeof settings.backups === "object" ? settings.backups : {};
  const primary = raw?.primary && typeof raw.primary === "object" ? raw.primary : {};
  const secondary = raw?.secondary && typeof raw.secondary === "object" ? raw.secondary : {};
  return {
    enabled: raw.enabled !== false,
    schedule: raw.schedule || "15 3 * * *",
    timezone: raw.timezone || "America/Santo_Domingo",
    retention_daily: String(raw.retention_daily ?? 7),
    retention_weekly: String(raw.retention_weekly ?? 4),
    retention_monthly: String(raw.retention_monthly ?? 12),
    encryption: raw.encryption || "restic",
    restic_password: raw.restic_password || "",
    primary: {
      enabled: primary.enabled !== false,
      provider: "contabo",
      endpoint: primary.endpoint || "",
      region: primary.region || "default",
      bucket: primary.bucket || "",
      access_key: primary.access_key || "",
      secret_key: primary.secret_key || "",
      prefix: primary.prefix || "colmapro/primary",
    },
    secondary: {
      enabled: secondary.enabled !== false,
      provider: "cloudflare_r2",
      endpoint: secondary.endpoint || "",
      account_id: secondary.account_id || "",
      region: secondary.region || "auto",
      bucket: secondary.bucket || "",
      access_key: secondary.access_key || "",
      secret_key: secondary.secret_key || "",
      prefix: secondary.prefix || "colmapro/critical",
    },
  };
};

const BackupConfigView = ({ settings, onSaved }: any) => {
  const [form, setForm] = useState(() => defaultBackupConfig(settings));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => setForm(defaultBackupConfig(settings)), [settings]);

  const updateRoot = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const updateProvider = (provider, key, value) => setForm((prev) => ({
    ...prev,
    [provider]: { ...prev[provider], [key]: value },
  }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.patch("/platform/settings", {
        backups: {
          ...form,
          retention_daily: Number(form.retention_daily || 0),
          retention_weekly: Number(form.retention_weekly || 0),
          retention_monthly: Number(form.retention_monthly || 0),
        },
      });
      setMessage("Configuración de copias de seguridad guardada correctamente.");
      await onSaved?.();
    } catch (err) {
      setError(err.message || "No se pudo guardar la configuración de respaldos");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Protección de datos</p>
            <h2 className="text-lg font-black text-gray-900">Copias de seguridad externas</h2>
            <p className="text-xs text-gray-400 mt-1 max-w-2xl">
              PostgreSQL se exporta en formato personalizado, se comprime con Zstandard y se cifra con Restic antes de enviarse a Contabo Object Storage y Cloudflare R2.
            </p>
          </div>
          <label className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
            <input type="checkbox" checked={form.enabled} onChange={(e) => updateRoot("enabled", e.target.checked)} className="w-5 h-5 accent-[#00a884]" />
            <span><span className="block text-sm font-black text-gray-900">Respaldos automáticos</span><span className="block text-[10px] text-gray-400">Programación activa</span></span>
          </label>
        </div>

        <div className="mt-5 rounded-2xl border border-[#00a884]/15 bg-[#f0fdf8] p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-center text-xs font-black text-gray-700">
            {["Bases PostgreSQL", "pg_dump personalizado", "Zstandard", "Cifrado Restic", "Contabo + R2"].map((step, index) => (
              <div key={step} className="relative rounded-xl bg-white border border-[#00a884]/10 px-3 py-3">
                {step}{index < 4 && <span className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 text-[#00a884]">→</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {(error || message) && <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{error || message}</div>}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-base font-black text-gray-900">Programación y retención</h3>
        <p className="text-xs text-gray-400 mt-1">La ejecución se realiza en horario de República Dominicana y conserva copias diarias, semanales y mensuales.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          <Field label="Expresión cron" value={form.schedule} onChange={(value) => updateRoot("schedule", value)} placeholder="15 3 * * *" />
          <Field label="Zona horaria" value={form.timezone} onChange={(value) => updateRoot("timezone", value)} placeholder="America/Santo_Domingo" />
          <Field label="Copias diarias" type="number" value={form.retention_daily} onChange={(value) => updateRoot("retention_daily", value)} />
          <Field label="Copias semanales" type="number" value={form.retention_weekly} onChange={(value) => updateRoot("retention_weekly", value)} />
          <Field label="Copias mensuales" type="number" value={form.retention_monthly} onChange={(value) => updateRoot("retention_monthly", value)} />
          <Field label="Contraseña de Restic" type="password" value={form.restic_password} onChange={(value) => updateRoot("restic_password", value)} placeholder="Clave fuerte de cifrado" />
        </div>
        <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          Guarda la contraseña de Restic también en un gestor externo. Sin esa clave no será posible restaurar las copias cifradas.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-[10px] font-black text-[#00a884] uppercase tracking-widest">Copia principal</p><h3 className="text-base font-black text-gray-900">Contabo Object Storage</h3></div>
            <input type="checkbox" checked={form.primary.enabled} onChange={(e) => updateProvider("primary", "enabled", e.target.checked)} className="w-5 h-5 accent-[#00a884]" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="md:col-span-2"><Field label="Endpoint S3" value={form.primary.endpoint} onChange={(value) => updateProvider("primary", "endpoint", value)} placeholder="https://...contabostorage.com" /></div>
            <Field label="Región" value={form.primary.region} onChange={(value) => updateProvider("primary", "region", value)} placeholder="default" />
            <Field label="Bucket" value={form.primary.bucket} onChange={(value) => updateProvider("primary", "bucket", value)} placeholder="colmapro-backups" />
            <Field label="Access Key" value={form.primary.access_key} onChange={(value) => updateProvider("primary", "access_key", value)} />
            <Field label="Secret Key" type="password" value={form.primary.secret_key} onChange={(value) => updateProvider("primary", "secret_key", value)} />
            <div className="md:col-span-2"><Field label="Prefijo" value={form.primary.prefix} onChange={(value) => updateProvider("primary", "prefix", value)} placeholder="colmapro/primary" /></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Copia crítica secundaria</p><h3 className="text-base font-black text-gray-900">Cloudflare R2</h3></div>
            <input type="checkbox" checked={form.secondary.enabled} onChange={(e) => updateProvider("secondary", "enabled", e.target.checked)} className="w-5 h-5 accent-[#00a884]" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <Field label="Account ID" value={form.secondary.account_id} onChange={(value) => updateProvider("secondary", "account_id", value)} />
            <Field label="Bucket" value={form.secondary.bucket} onChange={(value) => updateProvider("secondary", "bucket", value)} placeholder="colmapro-critical" />
            <div className="md:col-span-2"><Field label="Endpoint S3" value={form.secondary.endpoint} onChange={(value) => updateProvider("secondary", "endpoint", value)} placeholder="https://ACCOUNT_ID.r2.cloudflarestorage.com" /></div>
            <Field label="Access Key ID" value={form.secondary.access_key} onChange={(value) => updateProvider("secondary", "access_key", value)} />
            <Field label="Secret Access Key" type="password" value={form.secondary.secret_key} onChange={(value) => updateProvider("secondary", "secret_key", value)} />
            <div className="md:col-span-2"><Field label="Prefijo" value={form.secondary.prefix} onChange={(value) => updateProvider("secondary", "prefix", value)} placeholder="colmapro/critical" /></div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-base font-black text-gray-900">Política de restauración</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-xs">
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4"><strong className="block text-gray-900 mb-1">Verificación obligatoria</strong><span className="text-gray-500">SHA-256, lectura de manifiesto y validación de cada archivo con pg_restore.</span></div>
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4"><strong className="block text-gray-900 mb-1">Restauración controlada</strong><span className="text-gray-500">Detiene escrituras, restaura una base o toda la plataforma y registra el resultado.</span></div>
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4"><strong className="block text-gray-900 mb-1">Simulacro trimestral</strong><span className="text-gray-500">Las copias no se consideran confiables hasta superar una restauración en staging.</span></div>
        </div>
      </div>

      <button disabled={saving} className="h-11 px-5 rounded-xl bg-[#00a884] text-white font-black text-sm hover:bg-[#008f72] disabled:opacity-60"><FiSave className="inline mr-2" />{saving ? "Guardando…" : "Guardar configuración de backups"}</button>
    </form>
  );
};

const WhatsAppConfigurationView = ({ settings = {}, onSaved }: any) => {
  const providerReady = waxumConfigIsReady(waxumInitialConfig(settings));
  const [panel, setPanel] = useState(providerReady ? "session" : "provider");

  useEffect(() => {
    if (!providerReady) setPanel("provider");
  }, [providerReady]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="px-3 py-2 min-w-0">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            WhatsApp de plataforma
          </p>
          <p className="text-sm font-black text-gray-900">
            Configuración unificada
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Administra el proveedor WAXUM y la sesión WAMERCIO sin cambiar de sección.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full lg:w-auto lg:min-w-[430px]">
          <button
            type="button"
            onClick={() => setPanel("provider")}
            className={`rounded-xl border px-4 py-3 text-left transition-all ${
              panel === "provider"
                ? "border-[#00a884] bg-[#00a884] text-white shadow-md shadow-[#00a884]/20"
                : "border-gray-100 bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span className="flex items-center gap-2 text-xs font-black">
              <FiKey /> Conexión WAXUM
            </span>
            <span
              className={`block text-[10px] mt-1 ${
                panel === "provider" ? "text-white/70" : "text-gray-400"
              }`}
            >
              URL y credenciales
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPanel("session")}
            disabled={!providerReady}
            className={`rounded-xl border px-4 py-3 text-left transition-all disabled:cursor-not-allowed ${
              panel === "session"
                ? "border-[#00a884] bg-[#00a884] text-white shadow-md shadow-[#00a884]/20"
                : "border-gray-100 bg-gray-50 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            }`}
          >
            <span className="flex items-center gap-2 text-xs font-black">
              <FiSmartphone /> Sesión WAMERCIO
            </span>
            <span
              className={`block text-[10px] mt-1 ${
                panel === "session" ? "text-white/70" : "text-gray-400"
              }`}
            >
              Vinculación y estado
            </span>
          </button>
        </div>
      </div>

      {panel === "provider" ? (
        <WaxumIntegrationView
          settings={settings}
          onSaved={onSaved}
          onConfigured={() => setPanel("session")}
        />
      ) : (
        <PlatformWhatsAppView settings={settings} onSaved={onSaved} />
      )}
    </div>
  );
};

const defaultPlatformIdentityForm = {
  enabled: false,
  required: false,
  base_url: "https://id.ltd.do",
  client_id: "colmapro",
  timeout_seconds: 12,
  device_limit_enabled: true,
  device_limit_max: 20,
  device_limit_window_minutes: 60,
  api_key: "",
  api_key_configured: false,
  ready: false,
};

const normalizePlatformIdentityForm = (payload: any = {}) => {
  const identity = payload?.identity || payload || {};
  return {
    enabled: Boolean(identity.enabled),
    required: Boolean(identity.required),
    base_url: String(identity.base_url || "https://id.ltd.do"),
    client_id: String(identity.client_id || "colmapro"),
    timeout_seconds: Number(identity.timeout_seconds || 12),
    device_limit_enabled: identity.device_limit_enabled !== false,
    device_limit_max: Number(identity.device_limit_max || 20),
    device_limit_window_minutes: Number(identity.device_limit_window_minutes || 60),
    api_key: "",
    api_key_configured: Boolean(identity.api_key_configured),
    ready: Boolean(identity.ready),
  };
};

const IdentityConfigurationView = ({ onSaved }: any) => {
  const [form, setForm] = useState(defaultPlatformIdentityForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [testForm, setTestForm] = useState<{
    tipo_sujeto: IdentitySubjectType;
    documento: string;
  }>({
    tipo_sujeto: "persona",
    documento: "",
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const loadIdentityState = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await api.get("/platform/identity");
      setForm(normalizePlatformIdentityForm(payload));
    } catch (err) {
      setError(err?.message || "No se pudo cargar la configuración de identidad.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIdentityState();
  }, [loadIdentityState]);

  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        enabled: Boolean(form.enabled),
        required: Boolean(form.required),
        base_url: String(form.base_url || "").trim(),
        client_id: String(form.client_id || "").trim(),
        timeout_seconds: Number(form.timeout_seconds || 12),
        device_limit_enabled: Boolean(form.device_limit_enabled),
        device_limit_max: Number(form.device_limit_max || 20),
        device_limit_window_minutes: Number(form.device_limit_window_minutes || 60),
        ...(String(form.api_key || "").trim()
          ? { api_key: String(form.api_key).trim() }
          : {}),
      };
      const response = await api.patch("/platform/identity/configure", payload);
      setForm(normalizePlatformIdentityForm(response));
      setMessage("Configuración de Identidad API guardada correctamente.");
      await onSaved?.();
    } catch (err) {
      setError(err?.message || "No se pudo guardar la configuración de identidad.");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async (event) => {
    event.preventDefault();
    const subjectType = testForm.tipo_sujeto;
    const digits = onlyDigits(testForm.documento);
    const validLength =
      subjectType === "persona"
        ? digits.length === 11
        : digits.length === 9 || digits.length === 11;
    if (!validLength) {
      setTestResult({
        tone: "error",
        title: subjectType === "persona" ? "Cédula incompleta" : "RNC incompleto",
        message:
          subjectType === "persona"
            ? "La cédula debe contener 11 dígitos."
            : "El RNC debe contener 9 u 11 dígitos.",
      });
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const response = await verifyPlatformIdentity({
        tipo_sujeto: subjectType,
        documento: digits,
        contexto: "prueba_conexion",
      });
      if (response?.manual_allowed) {
        setTestResult({
          tone: "warning",
          title: "Revisión manual permitida",
          message:
            response?.error?.message ||
            "La API no está disponible, pero la política actual permite continuar con revisión manual.",
          requestId: response?.error?.request_id || "",
        });
        return;
      }

      const result = response?.data;
      const personName = result?.persona?.nombre_completo;
      const companyName =
        result?.empresa?.nombre_comercial || result?.empresa?.razon_social;
      const accepted = Boolean(
        response?.success &&
          result?.valida &&
          result?.encontrada &&
          result?.puede_registrarse,
      );
      setTestResult({
        tone: accepted ? "success" : "error",
        title: accepted ? "Documento verificado" : "Documento no autorizado",
        message:
          personName ||
          companyName ||
          result?.motivo ||
          (accepted
            ? "Identidad API respondió correctamente."
            : "El documento no cumple las condiciones para registrarse."),
        source: result?.fuente || response?.meta?.provider || "",
        requestId: response?.meta?.request_id || "",
      });
    } catch (err) {
      setTestResult({
        tone: "error",
        title:
          subjectType === "empresa"
            ? "No se pudo verificar el RNC"
            : "No se pudo verificar la cédula",
        message: err?.message || "Identidad API no respondió correctamente.",
      });
    } finally {
      setTesting(false);
    }
  };

  const integrationStatus = form.ready
    ? { label: "Lista para verificar", className: "bg-emerald-50 text-emerald-700 border-emerald-200" }
    : form.enabled
      ? { label: "Configuración incompleta", className: "bg-amber-50 text-amber-700 border-amber-200" }
      : { label: "Integración desactivada", className: "bg-gray-100 text-gray-600 border-gray-200" };

  const testTone = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    error: "border-red-200 bg-red-50 text-red-700",
  };

  return (
    <div className="space-y-4">
      <form onSubmit={save} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black text-[#00a884] uppercase tracking-widest">
              Identidad de plataforma
            </p>
            <h2 className="text-lg font-black text-gray-900">
              Verificación de cédulas y RNC
            </h2>
            <p className="text-xs text-gray-400 mt-1 max-w-3xl">
              WAMERCIO consulta Identidad API exclusivamente desde el backend. La clave privada nunca se envía al navegador ni se muestra después de guardarla.
            </p>
          </div>
          <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black ${integrationStatus.className}`}>
            <FiActivity /> {loading ? "Consultando estado…" : integrationStatus.label}
          </span>
        </div>

        <div className="p-5 space-y-5">
          {(error || message) && (
            <div className={`rounded-2xl border px-4 py-3 text-sm font-bold flex items-start gap-2 ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
              {error ? <FiAlertCircle className="mt-0.5 shrink-0" /> : <FiCheckCircle className="mt-0.5 shrink-0" />}
              <span>{error || message}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => update("enabled", event.target.checked)}
                className="w-5 h-5 accent-[#00a884]"
              />
              <span>
                <span className="block text-sm font-black text-gray-900">Activar Identidad API</span>
                <span className="block text-[11px] text-gray-400">Habilita la consulta servidor a servidor para cédulas y RNC.</span>
              </span>
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <input
                type="checkbox"
                checked={form.required}
                onChange={(event) => update("required", event.target.checked)}
                className="w-5 h-5 accent-[#00a884]"
              />
              <span>
                <span className="block text-sm font-black text-gray-900">Verificación obligatoria</span>
                <span className="block text-[11px] text-gray-400">Exige que el documento sea válido cuando Identidad responde. Si el servicio falla, el registro continúa con revisión manual.</span>
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Field
                label="URL de Identidad API"
                value={form.base_url}
                onChange={(value) => update("base_url", value)}
                placeholder="https://id.ltd.do"
                required
                hint="Puedes pegar la URL base o la ruta completa; WAMERCIO normaliza el endpoint automáticamente."
              />
            </div>
            <Field
              label="Client ID"
              value={form.client_id}
              onChange={(value) => update("client_id", value)}
              placeholder="colmapro"
              required
            />
            <Field
              label="Timeout (segundos)"
              type="number"
              value={form.timeout_seconds}
              onChange={(value) => update("timeout_seconds", value)}
              required
              hint="Valor permitido: 2 a 60 segundos."
            />
            <div className="md:col-span-2">
              <Field
                label="API Key privada"
                type="password"
                value={form.api_key}
                onChange={(value) => update("api_key", value)}
                placeholder={form.api_key_configured ? "Clave guardada ••••••••" : "Pega la clave privada"}
                hint={form.api_key_configured ? "Déjalo vacío para conservar la clave actual." : "La clave se envía por HTTPS y queda guardada en la configuración protegida del backend."}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[#00a884]/15 bg-[#f0fdf8] p-4 space-y-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={Boolean(form.device_limit_enabled)}
                onChange={(event) => update("device_limit_enabled", event.target.checked)}
                className="mt-0.5 w-5 h-5 accent-[#00a884]"
              />
              <span>
                <span className="block text-sm font-black text-gray-900">Límite de verificación por dispositivo</span>
                <span className="block text-[11px] text-gray-500 mt-1">Protege la API contra consultas repetitivas. Cuando se alcanza el límite, WAMERCIO permite continuar con revisión manual sin consultar al proveedor.</span>
              </span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label="Máximo de verificaciones"
                type="number"
                value={form.device_limit_max}
                onChange={(value) => update("device_limit_max", value)}
                disabled={!form.device_limit_enabled}
                required
                hint="Valor permitido: 1 a 500 por dispositivo."
              />
              <Field
                label="Ventana de control (minutos)"
                type="number"
                value={form.device_limit_window_minutes}
                onChange={(value) => update("device_limit_window_minutes", value)}
                disabled={!form.device_limit_enabled}
                required
                hint="Valor permitido: 1 a 1440 minutos."
              />
            </div>
            <p className="text-[11px] font-bold text-[#008f72]">
              Política actual: {form.device_limit_enabled ? `${form.device_limit_max || 20} verificaciones cada ${form.device_limit_window_minutes || 60} minutos por dispositivo.` : "control por dispositivo desactivado."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#00a884]/10 text-[#00a884] flex items-center justify-center shrink-0"><FiKey /></div>
              <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Credencial</p><p className="text-sm font-black text-gray-900 mt-1">{form.api_key_configured ? "Configurada" : "Pendiente"}</p><p className="text-[11px] text-gray-400">No se devuelve después de guardarla.</p></div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><FiGlobe /></div>
              <div className="min-w-0"><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Destino</p><p className="text-sm font-black text-gray-900 mt-1 truncate">{form.base_url || "Sin URL"}</p><p className="text-[11px] text-gray-400">HTTPS desde el backend Go.</p></div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0"><FiShield /></div>
              <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Contingencia</p><p className="text-sm font-black text-gray-900 mt-1">Revisión manual</p><p className="text-[11px] text-gray-400">El registro continúa si el proveedor falla.</p></div>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 bg-gray-50/60 flex flex-col sm:flex-row gap-3">
          <button
            type="submit"
            disabled={saving || loading}
            className="h-11 px-5 rounded-xl bg-[#00a884] text-white font-black text-sm hover:bg-[#008f72] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <FiSave /> {saving ? "Guardando…" : "Guardar configuración"}
          </button>
          <button
            type="button"
            onClick={loadIdentityState}
            disabled={loading || saving}
            className="h-11 px-5 rounded-xl bg-white border border-gray-200 text-gray-700 font-black text-sm hover:bg-gray-100 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <FiRefreshCw className={loading ? "animate-spin" : ""} /> Actualizar estado
          </button>
        </div>
      </form>

      <form onSubmit={runTest} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Prueba segura</p>
            <h3 className="text-base font-black text-gray-900">Verificar conexión y respuesta</h3>
            <p className="text-xs text-gray-400 mt-1">La prueba usa el mismo endpoint interno protegido que los formularios de WAMERCIO.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#00a884]/10 text-[#008f72] px-3 py-1.5 text-[11px] font-black"><FiUserCheck /> Contexto: prueba_conexion</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)_auto] gap-4 mt-5 items-end">
          <label className="block">
            <span className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">Tipo de documento</span>
            <select
              value={testForm.tipo_sujeto}
              onChange={(event) => {
                const tipoSujeto: IdentitySubjectType =
                  event.target.value === "empresa" ? "empresa" : "persona";
                setTestForm({ tipo_sujeto: tipoSujeto, documento: "" });
                setTestResult(null);
              }}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 font-bold outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/10"
            >
              <option value="persona">Cédula / Persona</option>
              <option value="empresa">RNC / Empresa</option>
            </select>
          </label>
          <Field
            label={testForm.tipo_sujeto === "persona" ? "Cédula" : "RNC"}
            value={testForm.documento}
            onChange={(value) => {
              setTestForm((current) => ({ ...current, documento: value }));
              setTestResult(null);
            }}
            placeholder={testForm.tipo_sujeto === "persona" ? "000-0000000-0" : "000-00000-0"}
            required
          />
          <button
            type="submit"
            disabled={testing || !form.ready}
            className="h-[46px] px-5 rounded-xl bg-gray-900 text-white font-black text-sm hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <FiShield /> {testing ? "Verificando…" : "Probar verificación"}
          </button>
        </div>

        {!form.ready && (
          <p className="mt-3 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            Activa, completa y guarda la integración antes de ejecutar la prueba.
          </p>
        )}

        {testResult && (
          <div className={`mt-4 rounded-2xl border px-4 py-4 flex items-start gap-3 ${testTone[testResult.tone] || testTone.error}`}>
            {testResult.tone === "success" ? <FiCheckCircle className="mt-0.5 shrink-0" /> : <FiAlertCircle className="mt-0.5 shrink-0" />}
            <div className="min-w-0">
              <p className="text-sm font-black">{testResult.title}</p>
              <p className="text-xs font-bold mt-1 break-words">{testResult.message}</p>
              {(testResult.source || testResult.requestId) && (
                <p className="text-[10px] mt-2 opacity-75 break-all">
                  {testResult.source ? `Fuente: ${testResult.source}` : ""}
                  {testResult.source && testResult.requestId ? " · " : ""}
                  {testResult.requestId ? `Solicitud: ${testResult.requestId}` : ""}
                </p>
              )}
            </div>
          </div>
        )}
      </form>

      <div className="rounded-2xl border border-[#00a884]/15 bg-[#f0fdf8] p-5 flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-white text-[#00a884] flex items-center justify-center border border-[#00a884]/10 shrink-0"><FiLock /></div>
        <div>
          <p className="text-sm font-black text-gray-900">Arquitectura servidor a servidor</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            El navegador llama a <strong>/api/platform/identity/verify</strong>; el backend valida sesión, permisos y contexto, y luego consulta <strong>id.ltd.do</strong> con X-API-Key, X-Client-ID, X-Application-Domain, X-Usage-Context y X-Request-ID.
          </p>
        </div>
      </div>
    </div>
  );
};


const legalSectionDefaults = {
  terms: [
    { title: "Uso de la plataforma", body: "WAMERCIO facilita la gestión de catálogos, ventas, inventario, clientes, fiado, caja, pedidos y entregas. Cada negocio es responsable de la información, precios, productos y servicios que publica." },
    { title: "Pagos fuera de línea", body: "Los pagos de los negocios se realizan en efectivo, por transferencia manual, mediante una terminal fiscal externa o por fiado autorizado. WAMERCIO no procesa, autoriza ni garantiza pagos electrónicos dentro del negocio." },
    { title: "Cuentas y seguridad", body: "El usuario debe proteger su PIN, verificar sus datos y notificar cualquier acceso no autorizado. Las acciones realizadas desde una cuenta autenticada pueden registrarse para fines de seguridad y auditoría." },
    { title: "Ventas, devoluciones y fiado", body: "Cada negocio define sus políticas comerciales. Las anulaciones, devoluciones, abonos y cierres de caja deben ser registrados por personal autorizado y pueden conservarse como historial operativo." },
    { title: "Disponibilidad", body: "La plataforma puede requerir mantenimiento, actualizaciones o interrupciones controladas. Se aplican respaldos y medidas de recuperación, pero ningún sistema puede garantizar disponibilidad absoluta." },
  ],
  privacy: [
    { title: "Datos recopilados", body: "Podemos tratar nombre, WhatsApp, cédula, direcciones, historial de pedidos, movimientos de fiado y datos técnicos necesarios para operar y proteger la plataforma." },
    { title: "Finalidad del tratamiento", body: "Los datos se utilizan para identificar usuarios, procesar pedidos, coordinar entregas, prevenir fraude, recuperar cuentas, generar reportes y cumplir obligaciones operativas o legales." },
    { title: "Separación de negocios", body: "Los datos operativos se aíslan por negocio. La identidad global del cliente permite utilizar WAMERCIO en distintos negocios sin crear cuentas duplicadas, manteniendo controles de acceso." },
    { title: "Conservación y seguridad", body: "Se aplican cifrado de transporte, controles de acceso, registros de auditoría y respaldos. Los datos se conservan durante el tiempo necesario para la operación, seguridad y cumplimiento aplicable." },
    { title: "Derechos del titular", body: "El usuario puede solicitar acceso, corrección, actualización o revisión de sus datos mediante los canales oficiales de soporte de WAMERCIO." },
  ],
};

const legalSectionsToText = (sections: any, fallback: any[]) => {
  const source = Array.isArray(sections) && sections.length ? sections : fallback;
  return source
    .map((section: any) => `${String(section?.title || "").trim()}\n${String(section?.body || "").trim()}`.trim())
    .filter(Boolean)
    .join("\n\n---\n\n");
};

const legalTextToSections = (value: any, fallback: any[]) => {
  const sections = String(value || "")
    .split(/^\s*---\s*$/m)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [title, ...bodyLines] = block.split("\n");
      return {
        title: String(title || "").trim(),
        body: bodyLines.join("\n").trim(),
      };
    })
    .filter((section) => section.title && section.body);
  return sections.length ? sections : fallback;
};

const defaultLegalConfig = (settings: any = {}) => {
  const raw = settings?.legal && typeof settings.legal === "object" ? settings.legal : {};
  const terms = raw?.terms && typeof raw.terms === "object" ? raw.terms : {};
  const privacy = raw?.privacy && typeof raw.privacy === "object" ? raw.privacy : {};
  return {
    version: String(raw.version || "1.0"),
    effective_date: String(raw.effective_date || "16 de julio de 2026"),
    responsible_entity: String(raw.responsible_entity || "WAMERCIO"),
    jurisdiction: String(raw.jurisdiction || "República Dominicana"),
    contact_email: String(raw.contact_email || settings.support_email || "soporte@wamercio.com"),
    contact_whatsapp: String(raw.contact_whatsapp || settings.support_whatsapp || ""),
    additional_title: String(raw.additional_title || "Información legal y contacto"),
    additional_text: String(raw.additional_text || "Para solicitudes relacionadas con estos documentos, corrección de datos o ejercicio de derechos, utiliza los canales oficiales de soporte de WAMERCIO."),
    terms_title: String(terms.title || "Términos y condiciones"),
    terms_intro: String(terms.intro || "Al crear o utilizar una cuenta, aceptas estas reglas de operación y seguridad."),
    terms_sections: legalSectionsToText(terms.sections, legalSectionDefaults.terms),
    privacy_title: String(privacy.title || "Política de privacidad y tratamiento de datos"),
    privacy_intro: String(privacy.intro || "Esta política explica cómo se recopilan, utilizan, protegen y conservan los datos personales dentro de WAMERCIO."),
    privacy_sections: legalSectionsToText(privacy.sections, legalSectionDefaults.privacy),
  };
};

const LegalConfigurationView = ({ settings, onSaved }: any) => {
  const [form, setForm] = useState(() => defaultLegalConfig(settings));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => setForm(defaultLegalConfig(settings)), [settings]);

  const update = (key: string, value: any) => setForm((current: any) => ({ ...current, [key]: value }));

  const save = async (event: any) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await api.patch("/platform/settings", {
        legal: {
          version: form.version.trim(),
          effective_date: form.effective_date.trim(),
          responsible_entity: form.responsible_entity.trim(),
          jurisdiction: form.jurisdiction.trim(),
          contact_email: form.contact_email.trim(),
          contact_whatsapp: normalizeWhatsapp(form.contact_whatsapp),
          additional_title: form.additional_title.trim(),
          additional_text: form.additional_text.trim(),
          terms: {
            title: form.terms_title.trim(),
            intro: form.terms_intro.trim(),
            sections: legalTextToSections(form.terms_sections, legalSectionDefaults.terms),
          },
          privacy: {
            title: form.privacy_title.trim(),
            intro: form.privacy_intro.trim(),
            sections: legalTextToSections(form.privacy_sections, legalSectionDefaults.privacy),
          },
        },
      });
      setMessage("Información legal guardada correctamente.");
      await onSaved?.();
    } catch (err: any) {
      setError(err?.message || "No se pudo guardar la información legal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#00a884]">Cumplimiento de plataforma</p>
            <h2 className="text-lg font-black text-gray-900">Información legal de WAMERCIO</h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-400">
              Administra los documentos que se publican en el dominio principal y que deben aceptar los clientes durante su registro.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={getPlatformHashUrl('/terms')} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-xs font-black text-gray-700 hover:border-[#00a884]/40 hover:text-[#00a884]"><FiExternalLink /> Ver términos</a>
            <a href={getPlatformHashUrl('/privacy')} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-xs font-black text-gray-700 hover:border-[#00a884]/40 hover:text-[#00a884]"><FiExternalLink /> Ver privacidad</a>
          </div>
        </div>
      </div>

      {(message || error) && (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error || message}
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h3 className="text-base font-black text-gray-900">Datos generales</h3>
        <p className="mt-1 text-xs text-gray-400">Estos datos se muestran en la cabecera y el bloque de contacto de todos los documentos.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Entidad responsable" value={form.responsible_entity} onChange={(value) => update("responsible_entity", value)} required />
          <Field label="Versión" value={form.version} onChange={(value) => update("version", value)} required />
          <Field label="Fecha de vigencia" value={form.effective_date} onChange={(value) => update("effective_date", value)} required />
          <Field label="Jurisdicción" value={form.jurisdiction} onChange={(value) => update("jurisdiction", value)} required />
          <Field label="Correo legal" type="email" value={form.contact_email} onChange={(value) => update("contact_email", value)} required />
          <PhoneField label="WhatsApp legal" value={form.contact_whatsapp} onChange={(value) => update("contact_whatsapp", value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#00a884]">Documento 1</p>
          <h3 className="text-base font-black text-gray-900">Términos y condiciones</h3>
          <div className="mt-4 space-y-4">
            <Field label="Título" value={form.terms_title} onChange={(value) => update("terms_title", value)} required />
            <CatalogTextarea label="Introducción" value={form.terms_intro} onChange={(value) => update("terms_intro", value)} rows={3} />
            <CatalogTextarea label="Secciones" value={form.terms_sections} onChange={(value) => update("terms_sections", value)} rows={18} placeholder={"Título de la sección\nContenido de la sección\n\n---\n\nSiguiente título\nSiguiente contenido"} />
            <p className="text-[11px] font-bold text-gray-400">Escribe el título en la primera línea y el contenido debajo. Separa cada sección con una línea que contenga <strong>---</strong>.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#00a884]">Documento 2</p>
          <h3 className="text-base font-black text-gray-900">Privacidad y tratamiento de datos</h3>
          <div className="mt-4 space-y-4">
            <Field label="Título" value={form.privacy_title} onChange={(value) => update("privacy_title", value)} required />
            <CatalogTextarea label="Introducción" value={form.privacy_intro} onChange={(value) => update("privacy_intro", value)} rows={3} />
            <CatalogTextarea label="Secciones" value={form.privacy_sections} onChange={(value) => update("privacy_sections", value)} rows={18} placeholder={"Título de la sección\nContenido de la sección\n\n---\n\nSiguiente título\nSiguiente contenido"} />
            <p className="text-[11px] font-bold text-gray-400">Incluye recopilación, finalidad, conservación, seguridad, derechos y cualquier tratamiento adicional aplicable.</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h3 className="text-base font-black text-gray-900">Otras informaciones legales</h3>
        <p className="mt-1 text-xs text-gray-400">Este bloque aparece al final de ambos documentos y puede incluir contacto, derechos, jurisdicción o avisos adicionales.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Título del bloque" value={form.additional_title} onChange={(value) => update("additional_title", value)} />
          <div className="md:col-span-2">
            <CatalogTextarea label="Contenido adicional" value={form.additional_text} onChange={(value) => update("additional_text", value)} rows={5} />
          </div>
        </div>
      </div>

      <button disabled={saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#00a884] px-5 text-sm font-black text-white hover:bg-[#008f72] disabled:opacity-60">
        <FiSave /> {saving ? "Guardando…" : "Guardar información legal"}
      </button>
    </form>
  );
};


const AccessConfigurationView = () => {
  const [tab, setTab] = useState<"pin" | "recovery">("pin");
  const [policy, setPolicy] = useState<any>({
    admin_pin_length: 6,
    customer_pin_length: 4,
    accepted_admin_pin_lengths: [4, 6],
    accepted_customer_pin_lengths: [4, 6],
    recovery_enabled: true,
    recovery_method: "otp",
    recovery_code_length: 6,
    recovery_ttl_minutes: 10,
    recovery_max_attempts: 5,
    recovery_cta_header: "Recuperar acceso",
    recovery_cta_body: "Pulsa el botón para crear un nuevo PIN de acceso a WAMERCIO.",
    recovery_cta_footer: "Enlace seguro de un solo uso. Vence en {minutos} minutos.",
    recovery_cta_button_label: "Recuperar acceso",
    recovery_cta_image_url: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [uploadingCTAImage, setUploadingCTAImage] = useState(false);
  const [ctaImageFileName, setCTAImageFileName] = useState("");
  const ctaImageInputRef = useRef<HTMLInputElement | null>(null);

  const loadPolicy = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/platform/access-policy");
      setPolicy(response || {});
      setCachedAccessPolicy(response || {});
    } catch (err: any) {
      setError(err?.message || "No se pudo cargar la política de acceso");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPolicy();
  }, [loadPolicy]);

  const savePolicy = async () => {
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const response = await api.patch("/platform/access-policy", {
        admin_pin_length: Number(policy.admin_pin_length || policy.pin_length || 6),
        customer_pin_length: Number(policy.customer_pin_length || 4),
        recovery_enabled: Boolean(policy.recovery_enabled),
        recovery_method: policy.recovery_method === "link" ? "link" : "otp",
        recovery_ttl_minutes: Number(policy.recovery_ttl_minutes || 10),
        recovery_max_attempts: Number(policy.recovery_max_attempts || 5),
        recovery_cta_header: String(policy.recovery_cta_header || ""),
        recovery_cta_body: String(policy.recovery_cta_body || ""),
        recovery_cta_footer: String(policy.recovery_cta_footer || ""),
        recovery_cta_button_label: String(policy.recovery_cta_button_label || ""),
        recovery_cta_image_url: String(policy.recovery_cta_image_url || ""),
      });
      setPolicy(response || policy);
      setCachedAccessPolicy(response || policy);
      setSaved("Configuración de acceso guardada correctamente.");
    } catch (err: any) {
      setError(err?.message || "No se pudo guardar la configuración de acceso");
    } finally {
      setSaving(false);
    }
  };

  const uploadRecoveryCTAImage = async (file?: File) => {
    if (!file) return;
    setError("");
    setSaved("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Selecciona una imagen JPG, PNG o WEBP.");
      return;
    }
    if (file.size <= 0 || file.size > 8 * 1024 * 1024) {
      setError("La imagen del CTA debe pesar menos de 8 MB.");
      return;
    }
    setUploadingCTAImage(true);
    try {
      const body = new FormData();
      body.append("image", file);
      const response = await api.upload("/platform/access-policy/cta-image", body);
      const imageURL = String(response?.url || "").trim();
      if (!imageURL) throw new Error("El servidor no devolvió la URL pública de la imagen.");
      setPolicy((prev: any) => ({ ...prev, recovery_cta_image_url: imageURL }));
      setCTAImageFileName(file.name);
      setSaved("Imagen cargada correctamente. Pulsa “Guardar recuperación” para aplicarla al CTA.");
    } catch (err: any) {
      setError(err?.message || "No se pudo cargar la imagen del CTA.");
    } finally {
      setUploadingCTAImage(false);
    }
  };

  const currentAdminPINLength = Number(policy.admin_pin_length || policy.pin_length || 6);
  const currentCustomerPINLength = Number(policy.customer_pin_length || 4);
  const acceptedAdminRaw = Array.isArray(policy.accepted_admin_pin_lengths)
    ? policy.accepted_admin_pin_lengths
    : Array.isArray(policy.accepted_pin_lengths)
      ? policy.accepted_pin_lengths
      : [];
  const acceptedCustomerRaw = Array.isArray(policy.accepted_customer_pin_lengths)
    ? policy.accepted_customer_pin_lengths
    : [];
  const acceptedAdmin = Array.from(new Set([currentAdminPINLength, ...acceptedAdminRaw.map(Number)])).filter((value) => value >= 4 && value <= 8).sort((a, b) => a - b);
  const acceptedCustomer = Array.from(new Set([currentCustomerPINLength, ...acceptedCustomerRaw.map(Number)])).filter((value) => value >= 4 && value <= 8).sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#00a884]">Seguridad y cumplimiento</p>
            <h2 className="mt-1 text-lg font-black text-gray-900">Acceso</h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-400">
              Configura de forma independiente el PIN administrativo y el PIN de clientes. Propietarios, usuarios SaaS, administradores, cajeros y repartidores usan la política administrativa; los clientes usan una política propia más ágil.
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
            <button type="button" onClick={() => setTab("pin")} className={`rounded-lg px-4 py-2 text-xs font-black transition ${tab === "pin" ? "bg-white text-[#008f72] shadow-sm" : "text-gray-500"}`}>
              PIN de acceso
            </button>
            <button type="button" onClick={() => setTab("recovery")} className={`rounded-lg px-4 py-2 text-xs font-black transition ${tab === "recovery" ? "bg-white text-[#008f72] shadow-sm" : "text-gray-500"}`}>
              Recuperación
            </button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
      {saved && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{saved}</div>}

      {loading ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm font-bold text-gray-400">Cargando política de acceso…</div>
      ) : tab === "pin" ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {[
              {
                key: "admin",
                eyebrow: "Panel de administración",
                title: "PIN administrativo",
                description: "Para propietarios, usuarios SaaS, administradores, cajeros y repartidores. Recomendamos 6 dígitos o más.",
                value: currentAdminPINLength,
                accepted: acceptedAdmin,
                icon: FiShield,
              },
              {
                key: "customer",
                eyebrow: "Panel del cliente",
                title: "PIN de clientes",
                description: "Para compradores de los negocios. Puede ser más corto para agilizar el acceso; 4 dígitos es el valor recomendado.",
                value: currentCustomerPINLength,
                accepted: acceptedCustomer,
                icon: FiUserCheck,
              },
            ].map((config: any) => {
              const Icon = config.icon;
              const field = config.key === "admin" ? "admin_pin_length" : "customer_pin_length";
              return (
                <section key={config.key} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 md:p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#00a884] shadow-sm"><Icon /></span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#00a884]">{config.eyebrow}</p>
                      <h3 className="mt-1 text-base font-black text-gray-900">{config.title}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-gray-500">{config.description}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-5 gap-2">
                    {[4, 5, 6, 7, 8].map((length) => (
                      <button
                        key={length}
                        type="button"
                        onClick={() => setPolicy((prev: any) => ({ ...prev, [field]: length }))}
                        className={`h-12 rounded-xl border text-sm font-black transition ${config.value === length ? "border-[#00a884] bg-[#e9fbf5] text-[#007c65] ring-2 ring-[#00a884]/10" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
                      >
                        {length}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 rounded-xl border border-[#00a884]/15 bg-[#f0fbf8] px-4 py-3">
                    <p className="text-sm font-black text-gray-900">PIN actual: {config.value} dígitos</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#008f72]">Los nuevos registros, cambios y recuperaciones de este tipo de cuenta utilizarán exactamente {config.value} dígitos.</p>
                  </div>

                  <div className="mt-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Compatibilidad de cuentas existentes</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {config.accepted.map((length: number) => (
                        <span key={length} className={`rounded-full px-3 py-1.5 text-[10px] font-black ${Number(length) === config.value ? "bg-[#00a884] text-white" : "border border-gray-200 bg-white text-gray-500"}`}>
                          {length} dígitos{Number(length) === config.value ? " · actual" : " · existente"}
                        </span>
                      ))}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>

          <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-700">
            <strong>Políticas independientes:</strong> cambiar una longitud no modifica la otra. WAMERCIO conserva temporalmente las longitudes antiguas únicamente para que las cuentas existentes puedan iniciar sesión; al crear o actualizar un PIN se aplica la longitud actual correspondiente.
          </div>

          <button type="button" onClick={savePolicy} disabled={saving} className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#00a884] px-5 text-sm font-black text-white hover:bg-[#008f72] disabled:opacity-60">
            <FiSave /> {saving ? "Guardando…" : "Guardar políticas de PIN"}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Recuperación</p>
            <h3 className="mt-1 text-base font-black text-gray-900">Recuperación de acceso por WhatsApp</h3>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
              El usuario inicia la recuperación desde el mismo formulario donde ya verificó su WhatsApp. WAMERCIO no vuelve a pedir tipo de cuenta ni número.
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <input type="checkbox" checked={Boolean(policy.recovery_enabled)} onChange={(event) => setPolicy((prev: any) => ({ ...prev, recovery_enabled: event.target.checked }))} className="mt-0.5 h-5 w-5 accent-[#00a884]" />
            <span>
              <span className="block text-sm font-black text-gray-900">Permitir recuperación por WhatsApp</span>
              <span className="mt-1 block text-xs text-gray-400">Utiliza la sesión global de Waxum configurada en WAMERCIO y aplica el método seleccionado a toda la plataforma.</span>
            </span>
          </label>

          <div className="mt-5">
            <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Método de recuperación</p>
            <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <button type="button" onClick={() => setPolicy((prev: any) => ({ ...prev, recovery_method: "otp" }))} className={`rounded-2xl border p-4 text-left transition ${policy.recovery_method !== "link" ? "border-[#00a884] bg-[#f0fbf8] ring-2 ring-[#00a884]/10" : "border-gray-200 bg-gray-50 hover:border-gray-300"}`}>
                <div className="flex items-start gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${policy.recovery_method !== "link" ? "bg-white text-[#00a884]" : "bg-white text-gray-400"}`}><FiHash /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-gray-900">Código OTP por WhatsApp</span>
                    <span className="mt-1 block text-xs leading-relaxed text-gray-500">Envía un código de 6 dígitos. El usuario lo introduce en casillas independientes antes de definir el nuevo PIN.</span>
                  </span>
                </div>
              </button>

              <button type="button" onClick={() => setPolicy((prev: any) => ({ ...prev, recovery_method: "link" }))} className={`rounded-2xl border p-4 text-left transition ${policy.recovery_method === "link" ? "border-[#00a884] bg-[#f0fbf8] ring-2 ring-[#00a884]/10" : "border-gray-200 bg-gray-50 hover:border-gray-300"}`}>
                <div className="flex items-start gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${policy.recovery_method === "link" ? "bg-white text-[#00a884]" : "bg-white text-gray-400"}`}><FiLink /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-gray-900">Enlace seguro · CTA URL</span>
                    <span className="mt-1 block text-xs leading-relaxed text-gray-500">Waxum envía un mensaje CTA con botón. Al pulsarlo, WAMERCIO valida un enlace de un solo uso y abre directamente el formulario del nuevo PIN.</span>
                  </span>
                </div>
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            {policy.recovery_method !== "link" ? (
              <label className="block">
                <span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-gray-500">Código de recuperación</span>
                <div className="flex h-12 items-center rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-black text-gray-700">{policy.recovery_code_length || 6} dígitos</div>
                <span className="mt-1 block text-[10px] text-gray-400">Fijo por seguridad.</span>
              </label>
            ) : (
              <label className="block">
                <span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-gray-500">Tipo de enlace</span>
                <div className="flex h-12 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-black text-gray-700"><FiShield className="text-[#00a884]" /> Un solo uso</div>
                <span className="mt-1 block text-[10px] text-gray-400">Token aleatorio de 256 bits.</span>
              </label>
            )}
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-gray-500">Vigencia {policy.recovery_method === "link" ? "del enlace" : "del código"}</span>
              <div className="relative">
                <input type="number" min="3" max="60" value={policy.recovery_ttl_minutes ?? 10} onChange={(event) => setPolicy((prev: any) => ({ ...prev, recovery_ttl_minutes: Number(event.target.value) }))} className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 pr-20 text-sm font-black text-gray-800 outline-none focus:border-[#00a884]" />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">minutos</span>
              </div>
            </label>
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-gray-500">Intentos máximos</span>
              <input type="number" min="3" max="10" value={policy.recovery_max_attempts ?? 5} onChange={(event) => setPolicy((prev: any) => ({ ...prev, recovery_max_attempts: Number(event.target.value) }))} className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-black text-gray-800 outline-none focus:border-[#00a884]" />
            </label>
          </div>

          {policy.recovery_method === "link" && (
            <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#00a884]"><FiMessageCircle /></span>
                <div>
                  <p className="text-sm font-black text-gray-900">Contenido del mensaje CTA de Waxum</p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-400">El destino del botón se genera automáticamente para cada solicitud. Puedes personalizar el contenido visible y subir una imagen opcional directamente desde tu PC.</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-gray-500">Título</span>
                  <input value={policy.recovery_cta_header || ""} maxLength={80} onChange={(event) => setPolicy((prev: any) => ({ ...prev, recovery_cta_header: event.target.value }))} className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-800 outline-none focus:border-[#00a884]" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-gray-500">Texto del botón</span>
                  <input value={policy.recovery_cta_button_label || ""} maxLength={30} onChange={(event) => setPolicy((prev: any) => ({ ...prev, recovery_cta_button_label: event.target.value }))} className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-800 outline-none focus:border-[#00a884]" />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-gray-500">Mensaje</span>
                  <textarea value={policy.recovery_cta_body || ""} maxLength={500} rows={3} onChange={(event) => setPolicy((prev: any) => ({ ...prev, recovery_cta_body: event.target.value }))} className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-800 outline-none focus:border-[#00a884]" />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-gray-500">Pie del mensaje</span>
                  <input value={policy.recovery_cta_footer || ""} maxLength={160} onChange={(event) => setPolicy((prev: any) => ({ ...prev, recovery_cta_footer: event.target.value }))} className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 outline-none focus:border-[#00a884]" />
                  <span className="mt-1 block text-[10px] text-gray-400">Puedes utilizar <strong>{"{minutos}"}</strong> para insertar automáticamente la vigencia configurada.</span>
                </label>
                <div className="md:col-span-2">
                  <span className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-gray-500"><FiImage /> Imagen opcional</span>
                  <input
                    ref={ctaImageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      uploadRecoveryCTAImage(file);
                    }}
                  />
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div className="flex h-24 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-gray-50 sm:w-32">
                        {policy.recovery_cta_image_url ? (
                          <img src={policy.recovery_cta_image_url} alt="Vista previa del CTA" className="h-full w-full object-cover" />
                        ) : (
                          <FiImage className="text-3xl text-gray-300" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-gray-900">{policy.recovery_cta_image_url ? "Imagen CTA cargada" : "Subir imagen desde tu PC"}</p>
                        <p className="mt-1 text-xs leading-relaxed text-gray-400">JPG, PNG o WEBP · máximo 8 MB. WAMERCIO la publica en R2 para que Waxum pueda incluirla en el mensaje.</p>
                        {ctaImageFileName ? <p className="mt-1 truncate text-[10px] font-bold text-[#008f72]">{ctaImageFileName}</p> : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" disabled={uploadingCTAImage} onClick={() => ctaImageInputRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#00a884] px-3 text-xs font-black text-white hover:bg-[#008f72] disabled:opacity-60">
                            <FiCamera /> {uploadingCTAImage ? "Subiendo…" : policy.recovery_cta_image_url ? "Reemplazar imagen" : "Seleccionar imagen"}
                          </button>
                          {policy.recovery_cta_image_url ? (
                            <button type="button" disabled={uploadingCTAImage} onClick={() => { setPolicy((prev: any) => ({ ...prev, recovery_cta_image_url: "" })); setCTAImageFileName(""); setSaved("La imagen se quitará del CTA al guardar la recuperación."); }} className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-black text-gray-500 hover:border-red-200 hover:text-red-600 disabled:opacity-60">
                              <FiTrash2 /> Quitar
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-[#00a884]/15 bg-white p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#008f72]">Vista lógica del CTA</p>
                <p className="mt-2 text-sm font-black text-gray-900">{policy.recovery_cta_header || "Recuperar acceso"}</p>
                {policy.recovery_cta_image_url ? <img src={policy.recovery_cta_image_url} alt="Imagen configurada para el CTA" className="mt-3 max-h-44 w-full rounded-xl border border-gray-100 object-cover" /> : null}
                <p className="mt-1 text-xs leading-relaxed text-gray-500">{policy.recovery_cta_body || "Pulsa el botón para crear un nuevo PIN de acceso a WAMERCIO."}</p>
                <div className="mt-3 flex h-10 items-center justify-center rounded-xl border border-[#00a884]/20 bg-[#f0fbf8] text-xs font-black text-[#008f72]"><FiExternalLink className="mr-2" /> {policy.recovery_cta_button_label || "Recuperar acceso"}</div>
                <p className="mt-2 text-[10px] text-gray-400">{String(policy.recovery_cta_footer || "Enlace seguro de un solo uso. Vence en {minutos} minutos.").replace("{minutos}", String(policy.recovery_ttl_minutes || 10))}</p>
              </div>
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-[#00a884]/15 bg-[#f0fbf8] p-4 text-[11px] leading-relaxed text-[#007c65]">
            <strong className="block text-xs">Flujo activo</strong>
            {policy.recovery_method === "link"
              ? <>WhatsApp ya verificado → Enviar CTA URL → Pulsar enlace seguro → Validación automática → Definir el PIN correspondiente ({policy.admin_pin_length || policy.pin_length || 6} dígitos administración / {policy.customer_pin_length || 4} cliente) → Acceso recuperado.</>
              : <>WhatsApp ya verificado → Enviar código → Introducir código en casillas independientes → Definir el PIN correspondiente ({policy.admin_pin_length || policy.pin_length || 6} dígitos administración / {policy.customer_pin_length || 4} cliente) → Acceso recuperado.</>}
          </div>

          <button type="button" onClick={savePolicy} disabled={saving} className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#00a884] px-5 text-sm font-black text-white hover:bg-[#008f72] disabled:opacity-60">
            <FiSave /> {saving ? "Guardando…" : "Guardar recuperación"}
          </button>
        </div>
      )}
    </div>
  );
};

const SettingsView = ({
  settings,
  businessTypes = [],
  domains = [],
  databases = [],
  auditLogs = [],
  banks = [],
  tenants = [],
  canViewAudit = false,
  activeSection = "general",
  onSectionChange,
  onTypeNew,
  onTypeEdit,
  onTypeDelete,
  onDomainPrimary,
  onDomainDelete,
  onSaved,
}: any) => {
  const [form, setForm] = useState(() => ({
    support_whatsapp: settings.support_whatsapp || "",
    support_email: settings.support_email || "",
    default_plan: settings.default_plan || "starter",
    allow_public_signup: Boolean(settings.allow_public_signup),
    billing_grace_days: String(settings.billing_grace_days ?? 5),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm({
      support_whatsapp: settings.support_whatsapp || "",
      support_email: settings.support_email || "",
      default_plan: settings.default_plan || "starter",
      allow_public_signup: Boolean(settings.allow_public_signup),
      billing_grace_days: String(settings.billing_grace_days ?? 5),
    });
  }, [settings]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.patch("/platform/settings", {
        support_whatsapp: normalizeWhatsapp(form.support_whatsapp),
        support_email: form.support_email,
        default_plan: form.default_plan,
        allow_public_signup: form.allow_public_signup,
        billing_grace_days: Number(form.billing_grace_days || 0),
      });
      await onSaved?.();
    } catch (err) {
      setError(err.message || "No se pudo guardar la configuración");
    } finally {
      setSaving(false);
    }
  };

  const availableSections = configurationItems.filter(
    (item) => !(item as any).auditOnly || canViewAudit,
  );
  const activeConfig =
    availableSections.find((item) => item.key === activeSection) ||
    availableSections[0];

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm xl:hidden">
        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            Sección de configuración
          </span>
          <select
            value={activeSection}
            onChange={(event) => onSectionChange?.(event.target.value)}
            className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-700 outline-none focus:border-[#00a884]"
          >
            {availableSections.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label} · {item.hint}
              </option>
            ))}
          </select>
        </label>
        {activeConfig && (
          <p className="mt-2 text-xs text-gray-400">
            {activeConfig.hint}
          </p>
        )}
      </div>

      {activeSection === "general" && (
        <form
          onSubmit={save}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
        >
          <div className="mb-5">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Ajustes generales
            </p>
            <h2 className="text-lg font-black text-gray-900">
              Ajustes de plataforma SaaS
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Estos valores viven en la base central y aplican al panel SaaS.
            </p>
          </div>
          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PhoneField
              label="WhatsApp soporte"
              value={form.support_whatsapp}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, support_whatsapp: value }))
              }
            />
            <Field
              label="Correo soporte"
              value={form.support_email}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, support_email: value }))
              }
              placeholder="soporte@wamercio.com"
            />
            <Field
              label="Plan por defecto"
              value={form.default_plan}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, default_plan: value }))
              }
              placeholder="starter"
            />
            <Field
              label="Días de gracia"
              type="number"
              value={form.billing_grace_days}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, billing_grace_days: value }))
              }
            />
            <label className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <input
                type="checkbox"
                checked={form.allow_public_signup}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    allow_public_signup: e.target.checked,
                  }))
                }
                className="w-5 h-5 accent-[#00a884]"
              />
              <span>
                <span className="block text-sm font-black text-gray-900">
                  Permitir registro público de negocios
                </span>
                <span className="block text-xs text-gray-400">
                  Actívalo cuando quieras abrir el alta automática desde la
                  página principal.
                </span>
              </span>
            </label>
          </div>
          <button
            disabled={saving}
            className="mt-5 h-11 px-5 rounded-xl bg-[#00a884] text-white font-black text-sm hover:bg-[#008f72] disabled:opacity-60"
          >
            <FiSave className="inline mr-2" />
            Guardar configuración
          </button>
        </form>
      )}

      {activeSection === "territory" && <TerritoryConfigView />}
      {activeSection === "types" && (
        <BusinessTypesView
          types={businessTypes}
          onNew={onTypeNew}
          onEdit={onTypeEdit}
          onDelete={onTypeDelete}
        />
      )}
      {activeSection === "domains" && (
        <DomainsView
          domains={domains}
          onPrimary={onDomainPrimary}
          onDelete={onDomainDelete}
        />
      )}
      {activeSection === "databases" && <DatabasesView databases={databases} />}
      {activeSection === "banks" && (
        <BanksConfigView banks={banks} onSaved={onSaved} />
      )}
      {activeSection === "whatsapp" && (
        <WhatsAppConfigurationView settings={settings} onSaved={onSaved} />
      )}
      {activeSection === "access" && (
        <AccessConfigurationView />
      )}
      {activeSection === "identity" && (
        <IdentityConfigurationView onSaved={onSaved} />
      )}
      {activeSection === "legal" && (
        <LegalConfigurationView settings={settings} onSaved={onSaved} />
      )}
      {activeSection === "notifications" && (
        <NotificationTemplatesView tenants={tenants} />
      )}
      {activeSection === "backups" && (
        <BackupConfigView settings={settings} onSaved={onSaved} />
      )}
      {activeSection === "audit" && canViewAudit && (
        <AuditView auditLogs={auditLogs} />
      )}
    </section>
  );
};

const SuperAdmin = () => {
  const [checked, setChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState(() =>
    normalizePlatformUser(
      (typeof window !== "undefined" ? api.getPlatformUser() : "") ||
        DEFAULT_PLATFORM_USERNAME,
    ),
  );

  useEffect(() => {
    let alive = true;
    const token = typeof window !== "undefined" ? api.getPlatformToken() : "";
    if (!token) {
      setChecked(true);
      setAuthenticated(false);
      return;
    }
    api
      .get("/platform/session")
      .then((data) => {
        if (!alive) return;
        const sessionUser = normalizePlatformUser(
          data.user || DEFAULT_PLATFORM_USERNAME,
        );
        setUser(sessionUser);
        api.setPlatformUser(sessionUser.username);
        setAuthenticated(true);
        setChecked(true);
      })
      .catch(() => {
        api.clearPlatformSession();
        if (!alive) return;
        setAuthenticated(false);
        setChecked(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!checked) return <LoadingScreen />;
  if (!authenticated)
    return (
      <PlatformLogin
        onSuccess={(nextUser) => {
          setUser(nextUser);
          setAuthenticated(true);
        }}
      />
    );
  return (
    <SuperAdminPanel
      user={user}
      onUserUpdated={(nextUser) => {
        const normalizedUser = normalizePlatformUser(nextUser);
        setUser(normalizedUser);
        api.setPlatformUser(normalizedUser.username);
      }}
      onLogout={() => {
        api.clearPlatformSession();
        setAuthenticated(false);
      }}
    />
  );
};

export default SuperAdmin;
