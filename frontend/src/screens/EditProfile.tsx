import React, { useState } from "react";
import * as FiIcons from "react-icons/fi";
import { Link, useNavigate } from "@/lib/navigation";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import PinInput from "../components/PinInput";
import { useAccessPolicy } from '../lib/accessPolicy';
import TerritoryAddressForm, {
  buildTerritoryAddressLine,
  emptyTerritoryAddress,
  isTerritoryAddressComplete,
} from "../components/TerritoryAddressForm";
import { formatDominicanId } from "../lib/nationalId";

const { FiArrowLeft, FiCheckCircle, FiMapPin } = FiIcons;

const Field = ({
  label,
  value,
  onChange = () => {},
  disabled = false,
  placeholder = "",
  required = false,
}: any) => (
  <div className="mb-3">
    <label className="block text-[11px] font-bold text-gray-500 mb-1 ml-1">
      {label} {required && <span className="text-orange-500">*</span>}
    </label>
    <input
      type="text"
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      className={`w-full px-3 py-2.5 border rounded-xl text-sm outline-none transition-all
        ${
          disabled
            ? "bg-gray-50 border-gray-200 text-gray-500 cursor-not-allowed"
            : "bg-white border-gray-200 text-gray-800 focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884]/20"
        }`}
    />
    {disabled && label === "WhatsApp" && (
      <p className="text-[10px] text-[#00a884] font-semibold mt-1 ml-1 flex items-center gap-1">
        <FiCheckCircle size={10} /> WhatsApp verificado
      </p>
    )}
  </div>
);

const EditProfile = () => {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const accessPolicy = useAccessPolicy();
  const [saved, setSaved] = useState(false);

  const principalAddr =
    user?.addresses?.find((d) => d.isPrincipal) || user?.addresses?.[0] || {};

  const [formData, setFormData] = useState({
    name: user?.name || "",
    last_name: user?.last_name || "",
    national_id: formatDominicanId(user?.national_id || ""),
    whatsapp:
      user?.whatsappDisplay || user?.whatsapp_display || user?.whatsapp || "",
    ...emptyTerritoryAddress,
    province: principalAddr.province || user?.province || "",
    provinceCode:
      principalAddr.provinceCode ||
      principalAddr.province_code ||
      user?.provinceCode ||
      user?.province_code ||
      "",
    municipality: principalAddr.municipality || user?.municipality || "",
    municipalityCode:
      principalAddr.municipalityCode ||
      principalAddr.municipality_code ||
      user?.municipalityCode ||
      user?.municipality_code ||
      "",
    districtCode:
      principalAddr.districtCode ||
      principalAddr.district_code ||
      user?.districtCode ||
      user?.district_code ||
      "",
    neighborhood:
      principalAddr.neighborhood ||
      principalAddr.sector ||
      user?.neighborhood ||
      user?.sector ||
      "",
    neighborhoodId:
      principalAddr.neighborhoodId ||
      principalAddr.neighborhood_id ||
      user?.neighborhoodId ||
      user?.neighborhood_id ||
      "",
    customNeighborhood: Boolean(
      principalAddr.customNeighborhood ??
      principalAddr.custom_neighborhood ??
      user?.customNeighborhood ??
      user?.custom_neighborhood,
    ),
    street: principalAddr.street || user?.street || "",
    street_number: principalAddr.street_number || user?.street_number || "",
    pin: "",
  });

  const set = (key) => (e) =>
    setFormData((f) => ({ ...f, [key]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();

    const updatedUser: any = {
      name: formData.name,
      last_name: formData.last_name,
    };
    if (formData.pin.length === accessPolicy.customerPinLength) {
      updatedUser.pin = formData.pin;
    }

    let newAddresses = [...(user.addresses || [])];
    const principalIndex = newAddresses.findIndex((d) => d.isPrincipal);

    const addressPayload = {
      province: formData.province,
      provinceCode: formData.provinceCode,
      province_code: formData.provinceCode,
      municipality: formData.municipality,
      municipalityCode: formData.municipalityCode,
      municipality_code: formData.municipalityCode,
      districtCode: formData.districtCode,
      district_code: formData.districtCode,
      neighborhood: formData.neighborhood,
      sector: formData.neighborhood,
      neighborhoodId: formData.neighborhoodId,
      neighborhood_id: formData.neighborhoodId,
      customNeighborhood: Boolean(formData.customNeighborhood),
      custom_neighborhood: Boolean(formData.customNeighborhood),
      street: formData.street,
      street_number: String(formData.street_number || "").replace(/\D/g, ""),
      address: buildTerritoryAddressLine(formData),
    };

    if (principalIndex >= 0) {
      newAddresses[principalIndex] = {
        ...newAddresses[principalIndex],
        ...addressPayload,
      };
    } else if (isTerritoryAddressComplete(formData)) {
      newAddresses.push({
        id: Date.now(),
        name: "Principal",
        isPrincipal: true,
        ...addressPayload,
      });
    }

    updatedUser.addresses = newAddresses;

    try {
      await updateUser(updatedUser);
      setSaved(true);
      setTimeout(() => navigate("/profile"), 1200);
    } catch (_) {
      setSaved(false);
    }
  };

  return (
    <div className="flex flex-col bg-white min-h-full pb-6">
      <div className="px-4 py-4 border-b border-gray-100 flex items-center gap-3 bg-white sticky top-0 z-10 shadow-sm">
        <Link
          to="/profile"
          className="text-[#00a884] font-bold text-sm flex items-center gap-1.5 transition-colors hover:text-[#009676]"
        >
          <FiArrowLeft strokeWidth={3} /> Volver
        </Link>
      </div>

      <form onSubmit={handleSave} className="px-4 pt-5 overflow-y-auto">
        <h2 className="text-xl font-black text-gray-800 mb-1">Editar perfil</h2>
        <p className="text-xs text-gray-500 mb-6">
          Actualiza tus datos personales
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Nombre"
            value={formData.name}
            onChange={set("name")}
            required
          />
          <Field
            label="Apellido"
            value={formData.last_name}
            onChange={set("last_name")}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 mt-1">
          <Field label="Cédula" value={formData.national_id} disabled />
          <Field label="WhatsApp" value={formData.whatsapp} disabled />
        </div>

        <div className="mt-8 mb-6 flex items-center justify-center relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-100"></div>
          </div>
          <div className="relative bg-white px-3 text-[10px] font-bold text-gray-400 flex items-center gap-1.5 uppercase tracking-wider">
            <FiMapPin /> DIRECCIÓN DE ENTREGA
          </div>
        </div>

        <TerritoryAddressForm
          value={formData}
          onChange={(data) =>
            setFormData((current) => ({
              ...current,
              ...data,
              address: buildTerritoryAddressLine(data),
            }))
          }
          title="Dirección de entrega"
          description="Selecciona provincia, municipio/distrito y barrio para completar tu dirección principal."
          allowCustomNeighborhood
        />

        <div className="mt-8">
          <p className="text-xs font-bold text-gray-800 mb-1">
            Cambiar PIN{" "}
            <span className="text-gray-400 font-normal">(opcional)</span>
          </p>
          <p className="text-[10px] text-gray-400 mb-4">
            Déjalo vacío para conservar tu PIN actual. Si lo cambias, debe tener {accessPolicy.customerPinLength} dígitos.
          </p>
          <div className="transform scale-[0.85] origin-left -ml-2">
            <PinInput
              value={formData.pin}
              onChange={(val) => setFormData((f) => ({ ...f, pin: val }))}
              label=""
              length={accessPolicy.customerPinLength}
            />
          </div>
        </div>

        <motion.button
          type="submit"
          whileTap={{ scale: 0.97 }}
          className={`w-full py-3.5 mt-8 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
            saved
              ? "bg-green-500 text-white shadow-md shadow-green-200"
              : "bg-[#00a884] text-white shadow-md shadow-[#00a884]/25 hover:bg-[#009676]"
          }`}
        >
          {saved ? (
            <>
              <FiCheckCircle size={16} /> ¡Guardado con éxito!
            </>
          ) : (
            "Guardar cambios"
          )}
        </motion.button>
      </form>
    </div>
  );
};

export default EditProfile;
