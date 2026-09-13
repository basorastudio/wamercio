import React from "react";
import * as FiIcons from "react-icons/fi";
import { FaFacebookF, FaInstagram, FaTiktok, FaWhatsapp } from "react-icons/fa";
import { Link } from "@/lib/navigation";
import { api, isPlatformRootHost } from "@/lib/api";
import { useStore } from "../context/StoreContext";
import { motion } from "framer-motion";
import StoreAvatar from "../common/StoreAvatar";

const {
  FiShoppingCart,
  FiChevronRight,
  FiBox,
  FiClock,
  FiDollarSign,
  FiUsers,
  FiMapPin,
  FiTrendingUp,
  FiActivity,
  FiCheckCircle,
  FiAlertCircle,
  FiExternalLink,
  FiShare2,
  FiX,
  FiCopy,
} = FiIcons;

const cleanDomain = (value: any) =>
  String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/^\*\./, "")
    .replace(/^\.+|\.+$/g, "")
    .trim();

const firstText = (...values: any[]) =>
  values.find((value) => String(value || "").trim()) || "";

const buildBusinessUrl = (activeStore: any, tenant: any) => {
  const rootDomain = cleanDomain(api.getRootDomain?.());
  const tenantSlug = cleanDomain(
    firstText(tenant?.slug, activeStore?.slug, api.getAdminTenant?.()),
  );
  let host = cleanDomain(
    firstText(
      activeStore?.public_url,
      activeStore?.publicUrl,
      activeStore?.store_url,
      activeStore?.storeUrl,
      activeStore?.domain,
      tenant?.domain,
      tenantSlug && rootDomain ? `${tenantSlug}.${rootDomain}` : "",
    ),
  );

  if (typeof window !== "undefined") {
    const currentHost = cleanDomain(
      window.location.host || window.location.hostname,
    );
    if (!host || (isPlatformRootHost() && host === rootDomain && tenantSlug)) {
      host =
        isPlatformRootHost() && tenantSlug && rootDomain
          ? `${tenantSlug}.${rootDomain}`
          : currentHost;
    }
    const protocol = window.location.protocol === "http:" ? "http:" : "https:";
    return `${protocol}//${host}/`;
  }

  return host ? `https://${host}/` : "";
};

const buildSharePayload = (
  activeStore: any,
  tenant: any,
  businessUrl: string,
) => {
  const storeName = firstText(activeStore?.name, tenant?.name, "Mi negocio");
  const slogan = firstText(
    activeStore?.slogan,
    "Compra fácil, rápido y seguro desde tu colmado.",
  );
  const address = firstText(activeStore?.address, "Dirección no configurada");
  const whatsapp = firstText(
    activeStore?.whatsappDisplay,
    activeStore?.whatsapp_display,
    activeStore?.whatsapp,
    activeStore?.phone,
  );
  const status =
    activeStore?.active === false
      ? "Temporalmente no disponible"
      : "Disponible para pedidos";
  const title = `${storeName} | WAMERCIO`;
  const lines = [
    `🛒 ${storeName}`,
    slogan,
    `📍 ${address}`,
    whatsapp ? `📲 WhatsApp: ${whatsapp}` : "",
    `✅ ${status}`,
    "Haz tu pedido aquí:",
    businessUrl,
  ].filter(Boolean);
  const text = lines.slice(0, -1).join("\n");
  const fullText = lines.join("\n");
  return {
    title,
    text,
    fullText,
    storeName,
    slogan,
    address,
    whatsapp,
    status,
  };
};

const isDesktopViewport = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return true;
  return window.matchMedia("(min-width: 768px)").matches;
};

const copyTextToClipboard = async (text: string) => {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {
  }
  return false;
};

const openShareWindow = (url: string) => {
  if (typeof window === "undefined" || !url) return;
  window.open(url, "_blank", "noopener,noreferrer,width=760,height=720");
};

const shareBusinessStore = async (
  activeStore: any,
  tenant: any,
  businessUrl: string,
) => {
  const payload = buildSharePayload(activeStore, tenant, businessUrl);
  const shareData = {
    title: payload.title,
    text: payload.text,
    url: businessUrl,
  };

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error: any) {
      if (error?.name === "AbortError") return;
    }
  }

  const fallbackText = payload.fullText || businessUrl;
  const copied = await copyTextToClipboard(fallbackText);
  if (copied && typeof window !== "undefined") {
    window.alert("Enlace de la tienda copiado para compartir.");
    return;
  }

  if (typeof window !== "undefined" && businessUrl) {
    window.open(businessUrl, "_blank", "noopener,noreferrer");
  }
};

const shareToDesktopNetwork = async (
  channel: "facebook" | "instagram" | "whatsapp" | "tiktok",
  payload: ReturnType<typeof buildSharePayload>,
  businessUrl: string,
  onFeedback: (message: string) => void,
) => {
  const encodedUrl = encodeURIComponent(businessUrl);
  const encodedText = encodeURIComponent(payload.fullText || businessUrl);

  if (channel === "whatsapp") {
    openShareWindow(`https://wa.me/?text=${encodedText}`);
    return;
  }

  if (channel === "facebook") {
    openShareWindow(
      `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    );
    return;
  }

  const copied = await copyTextToClipboard(payload.fullText || businessUrl);
  if (channel === "instagram") {
    onFeedback(
      copied
        ? "Tarjeta copiada. Pégala en Instagram para compartirla."
        : "Abriendo Instagram. Copia manualmente el enlace de la tienda si el navegador no lo pegó.",
    );
    openShareWindow("https://www.instagram.com/direct/inbox/");
    return;
  }

  onFeedback(
    copied
      ? "Tarjeta copiada. Pégala en TikTok para compartirla."
      : "Abriendo TikTok. Copia manualmente el enlace de la tienda si el navegador no lo pegó.",
  );
  openShareWindow("https://www.tiktok.com/upload");
};

const SummaryCard = ({
  icon: Icon,
  title,
  value,
  valueColor = "text-gray-900",
  bg = "bg-gray-50",
  iconColor = "text-gray-500",
  delay = 0,
}) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex items-center gap-3"
  >
    <div
      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${bg}`}
    >
      <Icon className={`text-lg ${iconColor}`} />
    </div>
    <div>
      <p className="text-[11px] text-gray-400 font-medium mb-0.5">{title}</p>
      <p className={`text-base font-black ${valueColor}`}>{value}</p>
    </div>
  </motion.div>
);

const RecentSaleRow = ({ sale, i }: any) => (
  <motion.div
    initial={{ opacity: 0, x: -8 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: i * 0.05 }}
    className="bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-between shadow-sm"
  >
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 bg-[#00a884]/10 rounded-lg flex items-center justify-center">
        <FiShoppingCart className="text-[#00a884] text-sm" />
      </div>
      <div>
        <p className="text-xs font-bold text-gray-800">{sale.method}</p>
        <p className="text-[10px] text-gray-400">
          {sale.items?.length || 0} producto(s)
        </p>
      </div>
    </div>
    <span className="text-sm font-black text-[#00a884]">
      RD$ {sale.total.toLocaleString()}
    </span>
  </motion.div>
);

const DesktopShareModal = ({
  isOpen,
  onClose,
  activeStore,
  tenant,
  businessUrl,
}: {
  isOpen: boolean;
  onClose: () => void;
  activeStore: any;
  tenant: any;
  businessUrl: string;
}) => {
  const [feedback, setFeedback] = React.useState("");
  const payload = React.useMemo(
    () => buildSharePayload(activeStore, tenant, businessUrl),
    [activeStore, tenant, businessUrl],
  );

  React.useEffect(() => {
    if (!isOpen) setFeedback("");
  }, [isOpen]);

  if (!isOpen) return null;

  const networkButtons = [
    {
      key: "whatsapp" as const,
      label: "WhatsApp",
      Icon: FaWhatsapp,
      className:
        "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100",
    },
    {
      key: "facebook" as const,
      label: "Facebook",
      Icon: FaFacebookF,
      className: "bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100",
    },
    {
      key: "instagram" as const,
      label: "Instagram",
      Icon: FaInstagram,
      className: "bg-pink-50 text-pink-700 border-pink-100 hover:bg-pink-100",
    },
    {
      key: "tiktok" as const,
      label: "TikTok",
      Icon: FaTiktok,
      className:
        "bg-slate-50 text-slate-800 border-slate-100 hover:bg-slate-100",
    },
  ];

  return (
    <div className="fixed inset-0 z-[90] hidden md:flex items-center justify-center p-4">
      <motion.button
        type="button"
        aria-label="Cerrar modal de compartir tienda"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-[#0f172a]/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-[520px] rounded-[1.7rem] bg-white shadow-2xl border border-white/70 overflow-hidden"
      >
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black text-[#00a884] uppercase tracking-[0.22em]">
              Compartir tienda
            </p>
            <h2 className="text-lg font-black text-gray-900 mt-1">
              Tarjeta profesional del negocio
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Comparte la tienda desde la red social que prefieras.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-gray-50 text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-colors shrink-0"
            aria-label="Cerrar"
          >
            <FiX />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="relative overflow-hidden rounded-3xl bg-[#111827] p-5 text-white shadow-lg">
            <div className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-[#00a884]/35" />
            <div className="absolute -left-12 -bottom-16 h-32 w-32 rounded-full bg-white/10" />
            <div className="relative flex items-start gap-4">
              <StoreAvatar
                store={activeStore}
                className="w-14 h-14 rounded-2xl border border-white/10"
                textClassName="text-2xl"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.22em] font-black text-[#7ee7c5]">
                  Tienda WAMERCIO
                </p>
                <h3 className="text-2xl font-black leading-tight truncate">
                  {payload.storeName}
                </h3>
                <p className="text-sm text-white/75 line-clamp-2">
                  {payload.slogan}
                </p>
              </div>
            </div>

            <div className="relative mt-5 space-y-3 text-sm text-white/85">
              <p className="flex items-start gap-2">
                <FiMapPin className="text-[#7ee7c5] mt-0.5 shrink-0" />
                <span className="line-clamp-2">{payload.address}</span>
              </p>
              {payload.whatsapp ? (
                <p className="flex items-center gap-2">
                  <FaWhatsapp className="text-[#7ee7c5] shrink-0" />
                  <span>{payload.whatsapp}</span>
                </p>
              ) : null}
              <p className="flex items-center gap-2">
                <FiExternalLink className="text-[#7ee7c5] shrink-0" />
                <span className="truncate">{businessUrl}</span>
              </p>
            </div>

            <div className="relative mt-5 rounded-2xl bg-white/10 border border-white/10 px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/45 font-black">
                  Estado
                </p>
                <p className="text-sm font-black">{payload.status}</p>
              </div>
              <a
                href={businessUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-[#00a884]/30 px-4 py-2 text-[11px] font-black text-white hover:bg-[#00a884]/45 transition-colors"
              >
                Abrir tienda
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {networkButtons.map(({ key, label, Icon, className }) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  shareToDesktopNetwork(key, payload, businessUrl, setFeedback)
                }
                className={`h-12 rounded-2xl border px-4 text-sm font-black flex items-center justify-center gap-2 transition-colors ${className}`}
              >
                <Icon />
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <a
              href={businessUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-12 rounded-2xl bg-[#111827] text-white text-sm font-black flex items-center justify-center gap-2 hover:bg-[#0b1220] transition-colors"
            >
              <FiExternalLink />
              Abrir tienda
            </a>
            <button
              type="button"
              onClick={async () => {
                const copied = await copyTextToClipboard(
                  payload.fullText || businessUrl,
                );
                setFeedback(
                  copied
                    ? "Tarjeta copiada correctamente."
                    : "No se pudo copiar automáticamente.",
                );
              }}
              className="h-12 rounded-2xl bg-gray-50 text-gray-700 text-sm font-black flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors"
            >
              <FiCopy />
              Copiar tarjeta
            </button>
          </div>

          {feedback ? (
            <p className="rounded-2xl bg-[#00a884]/10 border border-[#00a884]/15 px-4 py-3 text-xs font-bold text-[#007a62]">
              {feedback}
            </p>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
};

const Dashboard = () => {
  const [sharingStore, setSharingStore] = React.useState(false);
  const [shareModalOpen, setShareModalOpen] = React.useState(false);
  const {
    getTodaySales,
    getTodayIncome,
    getMonthIncome,
    products,
    storeCredits,
    customers,
    activeStore,
    stores,
    tenant,
    getGlobalMetrics,
  } = useStore();

  const todaySales = getTodaySales();
  const pendingStoreCredits = storeCredits.filter((f) => f.status === "pending").length;
  const globalMetrics = getGlobalMetrics();
  const businessUrl = React.useMemo(
    () => buildBusinessUrl(activeStore, tenant),
    [activeStore, tenant],
  );
  const handleShareStore = React.useCallback(async () => {
    if (sharingStore || !businessUrl) return;
    if (isDesktopViewport()) {
      setShareModalOpen(true);
      return;
    }
    setSharingStore(true);
    try {
      await shareBusinessStore(activeStore, tenant, businessUrl);
    } finally {
      setSharingStore(false);
    }
  }, [activeStore, tenant, businessUrl, sharingStore]);

  return (
    <div className="h-full overflow-y-auto scrollbar-hide bg-[#f8fafc]">
      <div className="p-4 md:p-6 xl:p-8 2xl:p-10 pb-8 w-full">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
            <div className="flex items-center gap-4 min-w-0 flex-1 w-full">
              <StoreAvatar
                store={activeStore}
                className="w-14 h-14 rounded-2xl"
                textClassName="text-2xl"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Negocio activo
                </p>
                <h1 className="font-black text-gray-900 text-lg truncate">
                  {activeStore?.name || "Sin negocio"}
                </h1>
                <p className="text-xs text-gray-400 truncate">
                  {activeStore?.address ||
                    "Configura la dirección de tu negocio"}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto shrink-0">
              <a
                href={businessUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 text-[11px] font-black text-[#00a884] bg-[#00a884]/10 px-3 py-2.5 rounded-xl hover:bg-[#00a884]/20 transition-colors"
              >
                <FiExternalLink className="text-xs" />
                Abrir tienda
              </a>
              <button
                type="button"
                onClick={handleShareStore}
                disabled={!businessUrl || sharingStore}
                className="flex items-center justify-center gap-1.5 text-[11px] font-black text-gray-700 bg-gray-50 px-3 py-2.5 rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <FiShare2 className="text-xs" />
                {sharingStore ? "Abriendo..." : "Compartir"}
              </button>
              <Link
                to="/admin/settings"
                className="hidden lg:flex items-center gap-1.5 text-[11px] font-bold text-[#00a884] bg-[#00a884]/10 px-3 py-2.5 rounded-xl hover:bg-[#00a884]/20 transition-colors"
              >
                <FiMapPin className="text-xs" />
                Configuración
              </Link>
            </div>
          </div>

          <div className="bg-[#1a2332] rounded-2xl p-5 shadow-md flex flex-col justify-between gap-4">
            <div>
              <p className="text-white/60 text-xs font-medium mb-1">
                Ingresos este mes
              </p>
              <h2 className="text-white text-3xl font-black">
                RD$ {getMonthIncome().toLocaleString()}
              </h2>
            </div>
            <Link to="/admin/reports">
              <button className="w-full bg-[#00a884]/20 hover:bg-[#00a884]/30 transition-colors text-white text-xs font-bold py-2.5 px-4 rounded-xl border border-[#00a884]/30">
                Ver reportes completos →
              </button>
            </Link>
          </div>
        </div>

        <Link
          to="/admin/point-of-sale"
          className="block active:scale-[0.99] transition-transform mb-6"
        >
          <div className="bg-[#00a884] rounded-2xl p-5 flex items-center justify-between shadow-lg shadow-[#00a884]/20">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <FiShoppingCart className="text-white text-2xl" />
              </div>
              <div className="min-w-0">
                <p className="text-white/70 text-xs font-bold tracking-widest mb-0.5 uppercase">
                  Vender ahora
                </p>
                <h2 className="text-white text-xl font-black truncate">
                  Abrir Punto de Venta
                </h2>
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <FiChevronRight className="text-white text-lg" />
            </div>
          </div>
        </Link>

        <section className="mb-6">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
            Resumen de hoy
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <SummaryCard
              icon={FiTrendingUp}
              title="Ventas hoy"
              value={todaySales.length}
              bg="bg-blue-50"
              iconColor="text-blue-500"
              delay={0.05}
            />
            <SummaryCard
              icon={FiDollarSign}
              title="Ingresos hoy"
              value={`RD$ ${getTodayIncome().toLocaleString()}`}
              bg="bg-[#eafaf1]"
              iconColor="text-[#00a884]"
              valueColor="text-[#00a884]"
              delay={0.1}
            />
            <SummaryCard
              icon={FiBox}
              title="Productos activos"
              value={products.length}
              bg="bg-purple-50"
              iconColor="text-purple-500"
              delay={0.15}
            />
            <SummaryCard
              icon={FiClock}
              title="Fiados pendientes"
              value={pendingStoreCredits}
              bg="bg-amber-50"
              iconColor="text-amber-500"
              valueColor="text-amber-600"
              delay={0.2}
            />
          </div>
        </section>

        <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
          <section className="min-w-0">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                Últimas ventas
              </h3>
              <Link
                to="/admin/reports/sales"
                className="text-xs font-bold text-[#00a884] hover:underline"
              >
                Ver todas →
              </Link>
            </div>

            {todaySales.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl min-h-[360px] flex flex-col items-center justify-center text-center shadow-sm">
                <FiShoppingCart className="text-5xl text-gray-200 mb-3" />
                <p className="text-sm text-gray-500 font-bold">
                  No hay ventas hoy
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Cuando se registren ventas en caja aparecerán en esta sección.
                </p>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {todaySales.slice(0, 8).map((sale, i) => (
                    <RecentSaleRow key={sale.id} sale={sale} i={i} />
                  ))}
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-black text-gray-700">
                    Clientes registrados
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Clientes creados desde la aplicación móvil
                  </p>
                </div>
                <Link
                  to="/admin/customers"
                  className="text-[10px] font-bold text-[#00a884]"
                >
                  Ver todos →
                </Link>
              </div>

              {customers.length === 0 ? (
                <div className="py-10 flex flex-col items-center text-center">
                  <FiUsers className="text-3xl text-gray-200 mb-2" />
                  <p className="text-xs text-gray-400">Sin clientes aún</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {customers.slice(0, 6).map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-8 h-8 bg-[#00a884]/10 rounded-full flex items-center justify-center shrink-0">
                        <FiUsers className="text-[#00a884] text-xs" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-800 truncate">
                          {c.name}
                        </p>
                        <p className="text-[10px] text-gray-400 truncate">
                          {c.whatsappDisplay ||
                            c.whatsapp_display ||
                            c.whatsapp}
                        </p>
                      </div>
                    </div>
                  ))}
                  {customers.length > 6 && (
                    <p className="text-[10px] text-gray-400 text-center pt-1">
                      +{customers.length - 6} más
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-black text-gray-700 mb-4">
                Estado operativo
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FiCheckCircle className="text-[#00a884] shrink-0" />
                    <span className="text-xs text-gray-500 font-medium">
                      Base de datos
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-[#00a884] bg-[#00a884]/10 px-2 py-1 rounded-full">
                    Conectada
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FiActivity className="text-blue-500 shrink-0" />
                    <span className="text-xs text-gray-500 font-medium">
                      Negocio configurado
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                    {stores.length}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FiAlertCircle className="text-amber-500 shrink-0" />
                    <span className="text-xs text-gray-500 font-medium">
                      Pendientes fiados
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
                    {pendingStoreCredits}
                  </span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <DesktopShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        activeStore={activeStore}
        tenant={tenant}
        businessUrl={businessUrl}
      />
    </div>
  );
};

export default Dashboard;
