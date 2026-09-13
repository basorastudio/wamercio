import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as FiIcons from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";
import { useStaffAuth } from "../context/StaffAuthContext";
import { useNavigate } from "@/lib/navigation";
import { api, getPlatformHashUrl } from "../lib/api";
import { sanitizePin } from "../lib/pin";
import {
  adminLoginAttemptDelay,
  customerLoginAttemptDelay,
  isAcceptedAdminAccessPinLength,
  isAcceptedCustomerAccessPinLength,
  useAccessPolicy,
} from "../lib/accessPolicy";
import { saveRecoveryContext } from "../lib/recoveryContext";
import PhoneInput from "../components/PhoneInput";
import PinInput from "../components/PinInput";
import DominicanIdQrScanner from "../components/DominicanIdQrScanner";
import TerritoryAddressForm, {
  buildTerritoryAddressLine,
  emptyTerritoryAddress,
  isTerritoryAddressComplete,
} from "../components/TerritoryAddressForm";
import {
  nationalIdDigits,
  formatDominicanId,
  isValidDominicanId,
} from "../lib/nationalId";
import { normalizePersonName } from "../lib/personNames";

const {
  FiUser,
  FiCreditCard,
  FiAlertCircle,
  FiLoader,
  FiCheckCircle,
  FiArrowLeft,
  FiSmartphone,
  FiLock,
  FiEdit2,
  FiCalendar,
  FiUsers,
} = FiIcons;

const normalizeDeliveryScope = (value: any) =>
  String(value || "")
    .toLowerCase()
    .trim() === "provincial"
    ? "provincial"
    : "municipal";

const identityManualMessage = (payload: any) => {
  const code = String(payload?.error?.code || "").trim().toUpperCase();
  if (code === "IDENTITY_DEVICE_LIMIT_REACHED" || code === "IDENTITY_RATE_LIMITED") {
    const retrySeconds = Number(payload?.error?.retry_after_seconds || 0);
    const retryMinutes = Math.max(1, Math.ceil(retrySeconds / 60));
    return `Verificación limitada, inténtalo en ${retryMinutes} ${retryMinutes === 1 ? "minuto" : "minutos"}.`;
  }
  return String(
    payload?.error?.message ||
      "La verificación no está disponible. Completa los datos manualmente.",
  );
};

const storeAddressValue = (store: any, ...keys: string[]) => {
  for (const key of keys) {
    const value = String(store?.[key] || "").trim();
    if (value) return value;
  }
  return "";
};

const initialPhoneData = {
  whatsapp: "",
  whatsappDisplay: "",
  countryCode: "do",
  dialCode: "+1",
  isValid: false,
  nationalNumber: "",
  maxLength: 10,
};

const buildRegisterForm = (phoneData: any = initialPhoneData) => ({
  name: "",
  last_name: "",
  national_id: "",
  birth_date: "",
  gender: "",
  ...initialPhoneData,
  ...phoneData,
  ...emptyTerritoryAddress,
  pin: "",
  terms_accepted: false,
  privacy_accepted: false,
});

const InputField = ({
  icon: Icon,
  placeholder,
  value,
  onChange,
  valid = false,
  invalid = false,
  maxLength,
  inputMode,
  onBlur,
  autoCapitalize,
  type = "text",
  readOnly = false,
  disabled = false,
  locked = false,
}: any) => (
  <div className="relative">
    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 z-10">
      <Icon size={15} />
    </div>
    <input
      type={type}
      inputMode={inputMode || "text"}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      autoCapitalize={autoCapitalize}
      maxLength={maxLength}
      readOnly={readOnly || locked}
      disabled={disabled}
      aria-readonly={readOnly || locked}
      className={`w-full pl-10 pr-10 py-3.5 border rounded-xl text-sm text-gray-800 placeholder-gray-400 outline-none transition-all duration-200
        ${locked ? "border-[#00a884] bg-[#f0fdf8] cursor-not-allowed select-none" : valid ? "border-[#00a884] bg-[#f0fdf8]" : invalid ? "border-red-400 bg-red-50/40" : "border-gray-200 bg-gray-50 focus:border-[#00a884] focus:bg-white"}
        disabled:cursor-not-allowed disabled:opacity-70 read-only:cursor-not-allowed`}
    />
    {(locked || valid) && (
      <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
        {locked ? (
          <FiLock size={15} className="text-[#00a884]" />
        ) : (
          <FiCheckCircle size={15} className="text-[#00a884]" />
        )}
      </div>
    )}
    {invalid && !locked && (
      <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
        <FiAlertCircle size={15} className="text-red-400" />
      </div>
    )}
  </div>
);

const GenderSelect = ({ value, onChange, locked = false }: any) => (
  <div className="relative">
    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 z-10">
      <FiUsers size={15} />
    </div>
    <select
      value={value || ""}
      onChange={(event) => onChange?.(event.target.value)}
      disabled={locked}
      aria-readonly={locked}
      className={`w-full appearance-none pl-10 pr-10 py-3.5 border rounded-xl text-sm text-gray-800 outline-none transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-100 ${locked ? "border-[#00a884] bg-[#f0fdf8]" : "border-gray-200 bg-gray-50 focus:border-[#00a884] focus:bg-white"}`}
    >
      <option value="">Género</option>
      <option value="M">Masculino</option>
      <option value="F">Femenino</option>
    </select>
    {locked && (
      <FiLock size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#00a884]" />
    )}
  </div>
);

const AuthScreen = ({ isModal = false }) => {
  const navigate = useNavigate();
  const accessPolicy = useAccessPolicy();
  const {
    login: loginClient,
    register,
    loading: clientLoading,
    error,
    setError,
    closeAuthModal,
  } = useAuth();
  const {
    login: loginStaff,
    loading: staffLoading,
    setError: setStaffError,
  } = useStaffAuth();
  const storeContext = useStore();
  const activeStore = storeContext?.activeStore || {};
  const deliveryScope = normalizeDeliveryScope(
    activeStore.deliveryScope || activeStore.delivery_scope,
  );
  const lockedProvince = storeAddressValue(
    activeStore,
    "provinceCode",
    "province_code",
  )
    ? {
        code: storeAddressValue(activeStore, "provinceCode", "province_code"),
        name: storeAddressValue(activeStore, "province"),
      }
    : null;
  const lockedMunicipality =
    deliveryScope === "municipal" &&
    storeAddressValue(activeStore, "municipalityCode", "municipality_code")
      ? {
          code: storeAddressValue(
            activeStore,
            "municipalityCode",
            "municipality_code",
          ),
          name: storeAddressValue(activeStore, "municipality"),
          districtCode: storeAddressValue(
            activeStore,
            "districtCode",
            "district_code",
          ),
        }
      : null;
  const addressScopeHint = lockedProvince
    ? deliveryScope === "provincial"
      ? `Este negocio entrega dentro de ${lockedProvince.name || "su provincia"}. Selecciona tu municipio/distrito y barrio.`
      : `Este negocio entrega en ${lockedMunicipality?.name || "su municipio"}, ${lockedProvince.name || "su provincia"}. Solo selecciona tu barrio.`
    : "";

  const [step, setStep] = useState<"phone" | "pin" | "register">("phone");
  const [phoneData, setPhoneData] = useState<any>(initialPhoneData);
  const [pin, setPin] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [autoLoginLoading, setAutoLoginLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const [lookupResult, setLookupResult] = useState<any>(null);
  const pinLookupRole = String(lookupResult?.role || "").toLowerCase().trim();
  const pinUsesAdminPolicy = ["administrator", "cashier", "delivery_driver", "staff"].includes(pinLookupRole);
  const loginPinLength = pinUsesAdminPolicy ? accessPolicy.adminPinLength : accessPolicy.customerPinLength;
  const loginPinMaxLength = pinUsesAdminPolicy ? accessPolicy.maxAdminPinLength : accessPolicy.maxCustomerPinLength;
  const [whatsappCheck, setWhatsappCheck] = useState<any>({
    phone: "",
    status: "idle",
    message: "",
    profileName: "",
    profilePictureUrl: "",
  });
  const [form, setForm] = useState<any>(buildRegisterForm(initialPhoneData));
  const [touched, setTouched] = useState<any>({});
  const [scanSuccess, setScanSuccess] = useState("");
  const [identityCheck, setIdentityCheck] = useState({
    document: "",
    status: "idle",
    message: "",
  });
  const lookupSeq = useRef(0);
  const whatsappValidationSeq = useRef(0);
  const identityValidationSeq = useRef(0);
  const identityAutofilledDocument = useRef("");
  const attemptedPin = useRef("");
  const pinLoginInFlight = useRef(false);

  const loading =
    clientLoading || staffLoading || lookupLoading || autoLoginLoading;
  const resolvedError = localError || error;
  const phoneValidationKey = String(phoneData.whatsapp || "").replace(
    /\D/g,
    "",
  );
  const whatsappCheckCurrent = whatsappCheck.phone === phoneValidationKey;
  const whatsappIsChecking = Boolean(
    phoneData.isValid &&
    whatsappCheckCurrent &&
    whatsappCheck.status === "checking",
  );
  const whatsappIsValid = Boolean(
    phoneData.isValid &&
    whatsappCheckCurrent &&
    whatsappCheck.status === "valid",
  );
  const whatsappIsInvalid = Boolean(
    phoneData.isValid &&
    whatsappCheckCurrent &&
    whatsappCheck.status === "invalid",
  );
  const isRegister = step === "register";
  const maxWidthClass = isRegister ? "max-w-2xl" : "max-w-sm";
  const modalWidthClass = isRegister
    ? "w-[calc(100vw-2rem)] max-w-2xl"
    : "w-[calc(100vw-2rem)] max-w-sm";

  const resetToPhone = () => {
    lookupSeq.current += 1;
    whatsappValidationSeq.current += 1;
    identityValidationSeq.current += 1;
    identityAutofilledDocument.current = "";
    attemptedPin.current = "";
    pinLoginInFlight.current = false;
    setStep("phone");
    setPhoneData({ ...initialPhoneData });
    setForm(buildRegisterForm(initialPhoneData));
    setTouched({});
    setPin("");
    setLookupResult(null);
    setWhatsappCheck({
      phone: "",
      status: "idle",
      message: "",
      profileName: "",
      profilePictureUrl: "",
    });
    setLookupLoading(false);
    setAutoLoginLoading(false);
    setLocalError("");
    setError("");
    setStaffError("");
    setScanSuccess("");
    setIdentityCheck({ document: "", status: "idle", message: "" });
  };

  const handlePhone = (data: any) => {
    setPhoneData((prev: any) => ({ ...prev, ...data }));
    if (step !== "phone") return;
    setLocalError("");
    setError("");
    setStaffError("");
    setLookupResult(null);
    setWhatsappCheck({
      phone: String(data?.whatsapp || "").replace(/\D/g, ""),
      status: "idle",
      message: "",
      profileName: "",
      profilePictureUrl: "",
    });
    setPin("");
  };

  useEffect(() => {
    if (step !== "phone") return;
    const currentPhone = phoneData.whatsapp;
    const currentPhoneKey = String(currentPhone || "").replace(/\D/g, "");

    if (!phoneData.isValid || !currentPhone) {
      lookupSeq.current += 1;
      whatsappValidationSeq.current += 1;
      setLookupLoading(false);
      setLookupResult(null);
      setWhatsappCheck({
        phone: currentPhoneKey,
        status: "idle",
        message: "",
        profileName: "",
        profilePictureUrl: "",
      });
      return;
    }

    const currentSeq = ++lookupSeq.current;
    const validationSeq = ++whatsappValidationSeq.current;
    setLookupLoading(true);
    setLocalError("");
    setLookupResult(null);
    setWhatsappCheck((prev: any) => ({
      phone: currentPhoneKey,
      status:
        prev.phone === currentPhoneKey && prev.status === "valid"
          ? "valid"
          : "checking",
      message:
        prev.phone === currentPhoneKey && prev.status === "valid"
          ? prev.message
          : "",
      profileName: prev.phone === currentPhoneKey ? prev.profileName || "" : "",
      profilePictureUrl:
        prev.phone === currentPhoneKey ? prev.profilePictureUrl || "" : "",
    }));

    const timer = window.setTimeout(async () => {
      try {
        const validation = await api.post("/client/validate-whatsapp", {
          phone: currentPhone,
        });
        if (
          lookupSeq.current !== currentSeq ||
          whatsappValidationSeq.current !== validationSeq ||
          currentPhone !== phoneData.whatsapp
        )
          return;

        const validWhatsApp = Boolean(
          validation?.valid || validation?.has_whatsapp,
        );
        setWhatsappCheck({
          phone: currentPhoneKey,
          status: validWhatsApp ? "valid" : "invalid",
          message:
            validation?.message ||
            (validWhatsApp
              ? "WhatsApp válido. Puedes continuar."
              : "Este número no tiene cuenta de WhatsApp. Cambia el número para continuar."),
          profileName: validation?.profile_name || "",
          profilePictureUrl: validation?.profile_picture_url || "",
        });

        if (!validWhatsApp) {
          setLookupResult(null);
          return;
        }

        const result = await api.post("/client/lookup", {
          whatsapp: currentPhone,
        });
        if (
          lookupSeq.current !== currentSeq ||
          currentPhone !== phoneData.whatsapp
        )
          return;
        setLookupResult(result);
        if (result?.exists) {
          setStep("pin");
          setPin("");
          attemptedPin.current = "";
        } else {
          setForm((prev: any) => ({
            ...buildRegisterForm(phoneData),
            name: normalizePersonName(prev.name || ""),
            last_name: normalizePersonName(prev.last_name || ""),
            national_id: prev.national_id || "",
          }));
          setTouched({ whatsapp: true });
          setStep("register");
        }
      } catch (err: any) {
        if (
          lookupSeq.current === currentSeq &&
          whatsappValidationSeq.current === validationSeq
        ) {
          setLookupResult(null);
          setWhatsappCheck({
            phone: currentPhoneKey,
            status: "invalid",
            message:
              err?.message ||
              "No se pudo validar el WhatsApp. Intenta de nuevo.",
            profileName: "",
            profilePictureUrl: "",
          });
        }
      } finally {
        if (lookupSeq.current === currentSeq) setLookupLoading(false);
      }
    }, 650);

    return () => window.clearTimeout(timer);
  }, [phoneData.whatsapp, phoneData.isValid, step]);

  useEffect(() => {
    const loginPin = sanitizePin(pin, loginPinMaxLength);
    const isAcceptedPin = pinUsesAdminPolicy
      ? isAcceptedAdminAccessPinLength(loginPin.length, accessPolicy)
      : isAcceptedCustomerAccessPinLength(loginPin.length, accessPolicy);
    if (
      step !== "pin" ||
      !isAcceptedPin ||
      !phoneData.isValid ||
      pinLoginInFlight.current
    )
      return;

    const lookupRole = pinLookupRole;
    const attemptKey = `${phoneData.whatsapp}:${lookupRole || "auto"}:${loginPin}`;
    if (attemptedPin.current === attemptKey) return;

    let alive = true;
    let timer = 0;

    const openAdminPanel = async () => {
      const adminResponse = await api.post("/admin/login", {
        username: phoneData.whatsapp,
        password: loginPin,
        whatsapp: phoneData.whatsapp,
        pin: loginPin,
      });
      api.setAdminToken(adminResponse.token);
      api.setAdminUser(phoneData.whatsapp);
      if (
        Array.isArray(adminResponse.tenants) &&
        adminResponse.tenants.length === 1
      ) {
        api.setAdminTenant(adminResponse.tenants[0]);
      }
      closeAuthModal();
      navigate("/admin", { replace: true });
    };

    const openStaffPanel = (role: string) => {
      closeAuthModal();
      navigate(role === "delivery_driver" ? "/delivery" : "/cashier", {
        replace: true,
      });
    };

    const run = async () => {
      attemptedPin.current = attemptKey;
      pinLoginInFlight.current = true;
      setAutoLoginLoading(true);
      setLocalError("");
      setError("");
      setStaffError("");

      try {
        if (lookupRole === "administrator") {
          await openAdminPanel();
          return;
        }

        if (lookupRole === "cashier" || lookupRole === "delivery_driver") {
          const tenantRef =
            lookupResult?.tenant ||
            lookupResult?.tenant_slug ||
            lookupResult?.tenant_id ||
            lookupResult?.tenant?.slug ||
            lookupResult?.tenant?.id ||
            "";
          if (tenantRef) api.setAdminTenant(tenantRef);
          const staff = await loginStaff(lookupRole, phoneData.whatsapp, loginPin);
          if (!alive) return;
          if (staff) {
            openStaffPanel(staff.role || lookupRole);
            return;
          }
          setLocalError(
            `PIN incorrecto. Verifica los ${loginPinLength} dígitos e intenta nuevamente.`,
          );
          return;
        }

        const client = await loginClient(phoneData.whatsapp, loginPin);
        if (!alive) return;
        if (client) return;

        setError("");
        const tenantRef =
          lookupResult?.tenant ||
          lookupResult?.tenant_slug ||
          lookupResult?.tenant_id ||
          lookupResult?.tenant?.slug ||
          lookupResult?.tenant?.id ||
          "";
        if (tenantRef) api.setAdminTenant(tenantRef);
        const staff = await loginStaff("", phoneData.whatsapp, loginPin);
        if (!alive) return;
        if (staff) {
          const role = staff.role || "";
          if (role === "administrator") {
            await openAdminPanel();
            return;
          }
          openStaffPanel(role);
          return;
        }

        setLocalError(
          `PIN incorrecto. Verifica los ${loginPinLength} dígitos e intenta nuevamente.`,
        );
      } catch (err: any) {
        if (alive)
          setLocalError(
            err?.message ||
              "No se pudo iniciar sesión con este WhatsApp y PIN.",
          );
      } finally {
        if (alive) {
          pinLoginInFlight.current = false;
          setAutoLoginLoading(false);
        }
      }
    };

    // Las longitudes anteriores permanecen utilizables para no bloquear cuentas existentes.
    // Esperamos brevemente cuando todavía existe una longitud compatible mayor.
    timer = window.setTimeout(run, pinUsesAdminPolicy ? adminLoginAttemptDelay(loginPin.length, accessPolicy) : customerLoginAttemptDelay(loginPin.length, accessPolicy));
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [
    step,
    pin,
    phoneData.whatsapp,
    phoneData.isValid,
    lookupResult?.role,
    loginClient,
    loginStaff,
    setError,
    setStaffError,
    closeAuthModal,
    navigate,
    accessPolicy,
  ]);

  const setField = (key: string) => (val: any) => {
    if (
      identityIsVerified &&
      (key === "name" ||
        key === "last_name" ||
        key === "national_id" ||
        key === "birth_date" ||
        key === "gender")
    )
      return;
    if (key === "name" || key === "last_name" || key === "national_id")
      setScanSuccess("");
    setForm((f: any) => ({ ...f, [key]: val }));
    setTouched((t: any) => ({ ...t, [key]: true }));
    setLocalError("");
    setError("");
  };

  const handleNationalIdChange = (e: any) => {
    if (identityIsVerified) return;
    setScanSuccess("");
    const formatted = formatDominicanId(e.target.value);
    const digits = nationalIdDigits(formatted);
    const clearAutofilledNames = Boolean(
      identityAutofilledDocument.current &&
        identityAutofilledDocument.current !== digits,
    );
    if (clearAutofilledNames) identityAutofilledDocument.current = "";
    identityValidationSeq.current += 1;
    setIdentityCheck({ document: digits, status: "idle", message: "" });
    setForm((f: any) => ({
      ...f,
      national_id: formatted,
      ...(clearAutofilledNames ? { name: "", last_name: "", birth_date: "", gender: "" } : {}),
    }));
    setTouched((t: any) => ({
      ...t,
      national_id: true,
      ...(clearAutofilledNames ? { name: false, last_name: false } : {}),
    }));
    setLocalError("");
    setError("");
  };

  const handleNationalIdScan = (data: any) => {
    identityValidationSeq.current += 1;
    identityAutofilledDocument.current = "";
    setIdentityCheck({
      document: nationalIdDigits(data.nationalId),
      status: "idle",
      message: "",
    });
    setForm((f: any) => ({
      ...f,
      national_id: formatDominicanId(data.nationalId),
      name: normalizePersonName(data.name),
      last_name: normalizePersonName(data.lastName),
      birth_date: "",
      gender: "",
    }));
    setTouched((t: any) => ({
      ...t,
      national_id: true,
      name: true,
      last_name: true,
    }));
    setScanSuccess("Datos cargados desde la cédula escaneada.");
    setLocalError("");
    setError("");
  };

  const handleAddress = (data: any) => {
    setForm((f: any) => ({
      ...f,
      ...data,
      address: buildTerritoryAddressLine(data),
    }));
    setTouched((t: any) => ({ ...t, address: true }));
    setLocalError("");
    setError("");
  };

  const handleReadonlyPhone = (data: any) => {
    setForm((f: any) => ({ ...f, ...data }));
  };

  const identityDigits = nationalIdDigits(form.national_id);
  const identityCheckCurrent = identityCheck.document === identityDigits;
  const identityStatus = identityCheckCurrent ? identityCheck.status : "idle";
  const identityIsChecking = identityStatus === "checking";
  const identityIsVerified = identityStatus === "verified";
  const identityIsInvalid = identityStatus === "invalid";
  const identityAllowsManual = identityStatus === "manual";

  const unlockVerifiedIdentity = () => {
    if (!identityIsVerified) return;
    identityValidationSeq.current += 1;
    identityAutofilledDocument.current = "";
    setIdentityCheck({ document: "", status: "idle", message: "" });
    setForm((current: any) => ({
      ...current,
      national_id: "",
      name: "",
      last_name: "",
      birth_date: "",
      gender: "",
    }));
    setTouched((current: any) => ({
      ...current,
      national_id: false,
      name: false,
      last_name: false,
    }));
    setScanSuccess("");
    setLocalError("");
    setError("");
  };

  useEffect(() => {
    if (step !== "register") return undefined;

    const formatted = formatDominicanId(form.national_id);
    const digits = nationalIdDigits(formatted);
    if (digits.length !== 11 || !isValidDominicanId(formatted)) {
      identityValidationSeq.current += 1;
      setIdentityCheck({ document: digits, status: "idle", message: "" });
      return undefined;
    }

    const seq = ++identityValidationSeq.current;
    setIdentityCheck({
      document: digits,
      status: "checking",
      message: "Consultando Identidad",
    });

    const timer = window.setTimeout(async () => {
      try {
        const payload = await api.post("/client/verify-identity", {
          documento: digits,
        });
        if (seq !== identityValidationSeq.current) return;

        if (!payload?.success || !payload?.data) {
          if (payload?.manual_allowed) {
            setIdentityCheck({
              document: digits,
              status: "manual",
              message: identityManualMessage(payload),
            });
            return;
          }
          setIdentityCheck({
            document: digits,
            status: "invalid",
            message: payload?.error?.message || "No se pudo verificar la cédula.",
          });
          return;
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
            message: result.motivo || "No se pudo verificar la cédula.",
          });
          return;
        }

        const firstName =
          result.puede_autocompletar && result.persona?.nombres
            ? normalizePersonName(result.persona.nombres)
            : "";
        const lastName =
          result.puede_autocompletar && result.persona?.apellidos
            ? normalizePersonName(result.persona.apellidos)
            : "";
        setForm((current: any) => ({
          ...current,
          national_id: formatDominicanId(result.persona?.cedula || digits),
          name: firstName || current.name,
          last_name: lastName || current.last_name,
          birth_date:
            result.puede_autocompletar && result.persona?.fecha_nacimiento
              ? String(result.persona.fecha_nacimiento)
              : current.birth_date,
          gender:
            result.puede_autocompletar && result.persona?.sexo
              ? String(result.persona.sexo).trim().toUpperCase()
              : current.gender,
        }));
        if (firstName || lastName) {
          identityAutofilledDocument.current = digits;
          setTouched((current: any) => ({
            ...current,
            national_id: true,
            name: Boolean(firstName || current.name),
            last_name: Boolean(lastName || current.last_name),
          }));
        }
        setIdentityCheck({
          document: digits,
          status: "verified",
          message: "Cédula verificada.",
        });
      } catch (err: any) {
        if (seq !== identityValidationSeq.current) return;
        setIdentityCheck({
          document: digits,
          status: "invalid",
          message: err?.message || "No se pudo verificar la cédula.",
        });
      }
    }, 550);

    return () => window.clearTimeout(timer);
  }, [form.national_id, step]);

  const v = {
    name: form.name.trim().length >= 2,
    last_name: form.last_name.trim().length >= 2,
    national_id: isValidDominicanId(form.national_id),
    nationalIdInvalid:
      touched.national_id &&
      nationalIdDigits(form.national_id).length === 11 &&
      !isValidDominicanId(form.national_id),
    whatsapp: Boolean(
      phoneData.isValid &&
      whatsappCheck.phone === phoneValidationKey &&
      whatsappCheck.status === "valid",
    ),
    address: isTerritoryAddressComplete(form),
    pin: form.pin.length === accessPolicy.customerPinLength,
  };

  const handleRegister = async (e: any) => {
    e.preventDefault();
    if (identityIsChecking) {
      setLocalError("Espera a que termine la verificación de la cédula.");
      return;
    }
    if (identityIsInvalid) {
      setLocalError(identityCheck.message || "No se pudo verificar la cédula.");
      return;
    }
    const normalizedFirstName = normalizePersonName(form.name);
    const normalizedLastName = normalizePersonName(form.last_name);
    if (normalizedFirstName.length < 2) {
      setLocalError("Ingresa tu nombre (mínimo 2 letras)");
      return;
    }
    if (normalizedLastName.length < 2) {
      setLocalError("Ingresa tu apellido (mínimo 2 letras)");
      return;
    }
    if (!v.national_id) {
      setLocalError("Ingresa una cédula dominicana válida");
      return;
    }
    if (!v.whatsapp) {
      setLocalError(
        whatsappCheck.message ||
          "Ingresa un número de WhatsApp válido y verificado.",
      );
      return;
    }
    if (!v.address) {
      setLocalError(
        "Completa tu dirección con provincia, municipio/distrito, barrio, calle y número",
      );
      return;
    }
    if (!v.pin) {
      setLocalError(`Define tu PIN de ${accessPolicy.customerPinLength} dígitos`);
      return;
    }
    if (!form.terms_accepted || !form.privacy_accepted) {
      setLocalError("Acepta los términos y la política de privacidad para crear tu cuenta");
      return;
    }

    const address = buildTerritoryAddressLine(form);
    await register({
      ...form,
      ...phoneData,
      name: normalizedFirstName,
      last_name: normalizedLastName,
      national_id: formatDominicanId(form.national_id),
      address,
      neighborhood: form.neighborhood,
      sector: form.neighborhood,
      province_code: form.provinceCode,
      municipality_code: form.municipalityCode,
      district_code: form.districtCode,
      neighborhood_id: form.neighborhoodId,
      custom_neighborhood: Boolean(form.customNeighborhood),
    });
  };

  const renderPhoneStep = () => (
    <motion.div
      key="phone"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.25 }}
      className="w-full"
    >
      <h2 className="text-xl font-black text-gray-800 mb-0.5">
        Acceso automático 👋
      </h2>
      <p className="text-xs text-gray-400 mb-5">
        Ingresa tu WhatsApp. Si existe, pediremos tu PIN; si no existe,
        crearemos tu cuenta.
      </p>

      <div className="space-y-2">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
          Tu WhatsApp
        </p>
        <PhoneInput
          value={phoneData.whatsapp}
          onChange={handlePhone}
          valid={whatsappIsValid}
          invalid={whatsappIsInvalid}
          placeholder="Número de WhatsApp"
        />
        <div className="min-h-[18px] px-1">
          {(lookupLoading || whatsappIsChecking) && (
            <p className="inline-flex items-center gap-1.5 text-[10px] text-[#00a884] font-semibold">
              <FiLoader className="animate-spin" /> Verificando WhatsApp...
            </p>
          )}
          {!lookupLoading && whatsappIsValid && (
            <p className="inline-flex items-center gap-1.5 text-[10px] text-[#00a884] font-semibold">
              <FiCheckCircle />{" "}
              {whatsappCheck.profileName
                ? `WhatsApp válido: ${whatsappCheck.profileName}`
                : "WhatsApp válido. Puedes continuar."}
            </p>
          )}
          {!lookupLoading && whatsappIsInvalid && (
            <p className="inline-flex items-center gap-1.5 text-[10px] text-red-500 font-semibold">
              <FiAlertCircle />{" "}
              {whatsappCheck.message ||
                "Este número no tiene cuenta de WhatsApp. Cambia el número para continuar."}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );

  const renderPinStep = () => (
    <motion.div
      key="pin"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.25 }}
      className="w-full"
    >
      <button
        type="button"
        onClick={resetToPhone}
        className="mb-4 inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-400 hover:text-[#00a884]"
      >
        <FiArrowLeft /> Cambiar WhatsApp
      </button>
      <h2 className="text-xl font-black text-gray-800 mb-0.5">
        Ingresa tu PIN 🔐
      </h2>
      <p className="text-xs text-gray-400 mb-5">
        Este WhatsApp ya existe. Escribe tu PIN de {loginPinLength} dígitos y entraremos
        automáticamente.
      </p>

      <div className="rounded-2xl border border-[#00a884]/20 bg-[#f0fdf8] px-3 py-2.5 mb-4 flex items-center gap-2">
        <FiSmartphone className="text-[#00a884]" />
        <span className="text-xs font-bold text-gray-700">
          WhatsApp verificado
        </span>
        {lookupResult?.accountType && (
          <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-[#00a884]">
            {lookupResult.accountType}
          </span>
        )}
      </div>

      <PinInput
        value={pin}
        onChange={(val: string) => {
          setPin(val);
          setLocalError("");
          setError("");
        }}
        length={loginPinLength} inputMaxLength={loginPinMaxLength}
        label={`Tu PIN de ${loginPinLength} dígitos`}
      />

      {accessPolicy.recoveryEnabled && (
        <button type="button" onClick={() => {
          const role = String(lookupResult?.role || 'customer').toLowerCase();
          const subjectType = role === 'cashier' || role === 'delivery_driver' ? 'staff' : role === 'administrator' ? 'administrator' : 'customer';
          saveRecoveryContext({ whatsapp: phoneData.whatsapp, subjectType, accountLabel: String(lookupResult?.accountType || role || 'Cliente') });
          navigate('/recover-account');
        }} className="mt-3 w-full text-center text-xs font-black text-[#00a884] hover:underline">¿Olvidaste tu PIN?</button>
      )}

      {autoLoginLoading && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[10px] text-[#00a884] font-semibold px-1">
          <FiLoader className="animate-spin" /> Validando PIN...
        </p>
      )}
    </motion.div>
  );

  const renderRegisterStep = () => (
    <motion.div
      key="register"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.25 }}
      className="w-full"
    >
      <button
        type="button"
        onClick={resetToPhone}
        className="mb-4 inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-400 hover:text-[#00a884]"
      >
        <FiArrowLeft /> Cambiar WhatsApp
      </button>
      <h2 className="text-xl font-black text-gray-800 mb-0.5">
        Crear cuenta 👤
      </h2>
      <p className="text-xs text-gray-400 mb-5">
        Completa tus datos para registrarte como cliente.
      </p>

      <form onSubmit={handleRegister} className="space-y-4">
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
            WhatsApp y cédula
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <PhoneInput
                value={phoneData.whatsapp}
                onChange={handleReadonlyPhone}
                valid={whatsappIsValid}
                disabled
              />
              <p className="text-[10px] text-[#00a884] font-semibold px-1">
                WhatsApp verificado.
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <InputField
                    icon={FiCreditCard}
                    placeholder="Cédula (000-0000000-0) *"
                    value={form.national_id}
                    onChange={handleNationalIdChange}
                    valid={touched.national_id && v.national_id}
                    invalid={v.nationalIdInvalid}
                    maxLength={13}
                    inputMode="numeric"
                    readOnly={identityIsVerified}
                    locked={identityIsVerified}
                  />
                </div>
                <DominicanIdQrScanner
                  onScan={handleNationalIdScan}
                  disabled={clientLoading || identityIsVerified}
                />
              </div>
              {v.nationalIdInvalid && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[10px] text-red-500 font-medium px-1"
                >
                  ⚠ Cédula dominicana no válida
                </motion.p>
              )}
              {identityIsChecking && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="inline-flex items-center gap-1.5 text-[10px] text-[#00a884] font-semibold px-1"
                >
                  <FiLoader className="animate-spin" /> Consultando Identidad
                </motion.p>
              )}
              {identityIsVerified && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-between gap-2 px-1"
                >
                  <p className="inline-flex items-center gap-1 text-[10px] text-[#00a884] font-semibold">
                    <FiLock size={11} /> Cédula verificada.
                  </p>
                  <button
                    type="button"
                    onClick={unlockVerifiedIdentity}
                    className="inline-flex items-center gap-1 text-[10px] font-black text-gray-400 hover:text-[#00a884]"
                  >
                    <FiEdit2 size={11} /> Cambiar
                  </button>
                </motion.div>
              )}
              {identityAllowsManual && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[10px] text-amber-600 font-semibold px-1"
                >
                  {identityCheck.message || "Completa los datos manualmente."}
                </motion.p>
              )}
              {identityIsInvalid && !v.nationalIdInvalid && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[10px] text-red-500 font-medium px-1"
                >
                  ⚠ {identityCheck.message || "No se pudo verificar la cédula."}
                </motion.p>
              )}
            </div>
          </div>
          {scanSuccess && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="inline-flex items-center gap-1.5 text-[10px] text-[#00a884] font-semibold px-1"
            >
              <FiCheckCircle /> {scanSuccess}
            </motion.p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
            Datos personales
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <InputField
              icon={FiUser}
              placeholder="Nombre *"
              value={form.name}
              onChange={(e: any) => setField("name")(e.target.value)}
              onBlur={() =>
                setForm((current: any) => ({
                  ...current,
                  name: normalizePersonName(current.name),
                }))
              }
              autoCapitalize="words"
              valid={touched.name && v.name}
              readOnly={identityIsVerified}
              locked={identityIsVerified}
            />
            <InputField
              icon={FiUser}
              placeholder="Apellido *"
              value={form.last_name}
              onChange={(e: any) => setField("last_name")(e.target.value)}
              onBlur={() =>
                setForm((current: any) => ({
                  ...current,
                  last_name: normalizePersonName(current.last_name),
                }))
              }
              autoCapitalize="words"
              valid={touched.last_name && v.last_name}
              readOnly={identityIsVerified}
              locked={identityIsVerified}
            />
            <InputField
              icon={FiCalendar}
              placeholder="Fecha de nacimiento"
              value={form.birth_date}
              onChange={(event: any) => setField("birth_date")(event.target.value)}
              type="date"
              readOnly={identityIsVerified}
              locked={identityIsVerified}
            />
            <GenderSelect
              value={form.gender}
              onChange={(value: string) => setField("gender")(value)}
              locked={identityIsVerified}
            />
          </div>
          {identityIsVerified && (form.birth_date || form.gender) && (
            <p className="inline-flex items-center gap-1.5 text-[10px] text-[#00a884] font-semibold px-1">
              <FiLock size={11} /> Fecha de nacimiento y género verificados por Identidad.
            </p>
          )}
        </div>

        <TerritoryAddressForm
          value={form}
          onChange={handleAddress}
          compact
          lockedProvince={lockedProvince}
          lockedMunicipality={lockedMunicipality}
          hideProvince={Boolean(lockedProvince)}
          hideMunicipality={Boolean(lockedMunicipality)}
          scopeHint={addressScopeHint}
          allowCustomNeighborhood
        />

        <div className="space-y-1">
          <PinInput
            value={form.pin}
            onChange={(val: string) => {
              setField("pin")(val);
            }}
            length={accessPolicy.customerPinLength}
            label={`Crea tu PIN de ${accessPolicy.customerPinLength} dígitos *`}
          />
        </div>

        <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <label className="flex items-start gap-3 text-xs leading-relaxed text-gray-600">
            <input type="checkbox" checked={Boolean(form.terms_accepted)} onChange={(event) => setField("terms_accepted")(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#00a884]" />
            <span>Acepto los <a href={getPlatformHashUrl('/terms')} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="font-black text-[#00a884] hover:underline">términos y condiciones</a>.</span>
          </label>
          <label className="flex items-start gap-3 text-xs leading-relaxed text-gray-600">
            <input type="checkbox" checked={Boolean(form.privacy_accepted)} onChange={(event) => setField("privacy_accepted")(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#00a884]" />
            <span>Acepto la <a href={getPlatformHashUrl('/privacy')} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="font-black text-[#00a884] hover:underline">política de privacidad y tratamiento de datos</a>.</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={clientLoading || !v.whatsapp || identityIsChecking || identityIsInvalid}
          className="w-full bg-[#00a884] hover:bg-[#009676] disabled:opacity-70 active:scale-[0.98] transition-all text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-md shadow-[#00a884]/25"
        >
          {clientLoading ? (
            <>
              <FiLoader size={16} className="animate-spin" />
              <span>Registrando...</span>
            </>
          ) : (
            <span>Crear mi cuenta</span>
          )}
        </button>
      </form>
    </motion.div>
  );

  return (
    <div
      className={
        isModal
          ? `bg-white ${modalWidthClass}`
          : "min-h-[100dvh] bg-[#f0f2f5] flex flex-col justify-center"
      }
    >
      <div className={`flex-1 ${!isModal ? "overflow-y-auto pb-8" : "pb-6"}`}>
        <div
          className={`px-5 ${isModal ? "pt-5" : "pt-6"} mx-auto w-full transition-all duration-300 ${maxWidthClass}`}
        >
          <div
            className={`${isModal ? "" : "bg-white rounded-2xl border border-gray-200 shadow-sm p-5"}`}
          >
            <AnimatePresence mode="wait">
              {step === "phone" && renderPhoneStep()}
              {step === "pin" && renderPinStep()}
              {step === "register" && renderRegisterStep()}
            </AnimatePresence>

            <AnimatePresence>
              {resolvedError && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5"
                >
                  <FiAlertCircle size={14} className="text-red-500 shrink-0" />
                  <span className="text-xs text-red-600 font-medium">
                    {resolvedError}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <p className="text-[10px] text-gray-400 text-center mt-5">
            WAMERCIO · Sistema de Gestión de Colmados
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
