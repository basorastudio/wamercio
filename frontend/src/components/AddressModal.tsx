import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as FiIcons from "react-icons/fi";
import { api } from "../lib/api";
import TerritoryAddressForm, {
  buildTerritoryAddressLine,
  emptyTerritoryAddress,
  isTerritoryAddressComplete,
} from "./TerritoryAddressForm";

const { FiX, FiMapPin, FiAlertTriangle, FiCheckCircle } = FiIcons;

const Field = ({
  label,
  value,
  onChange = () => {},
  placeholder,
  type = "text",
  readOnly = false,
}: any) => (
  <div className="mb-3">
    <label className="block text-[11px] font-bold text-gray-500 mb-1 ml-1">
      {label}
    </label>
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`w-full px-3 py-2.5 border rounded-xl text-sm outline-none transition-all ${
        readOnly
          ? "bg-gray-50 border-gray-200 text-gray-500 cursor-not-allowed"
          : "bg-white border-gray-200 text-gray-800 focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884]/20"
      }`}
    />
  </div>
);

const AddressModal = ({ isOpen, onClose, onSave, editingAddress }) => {
  const [locationError, setLocationError] = useState("");
  const [locationNotice, setLocationNotice] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    ...emptyTerritoryAddress,
    lat: "",
    lng: "",
    isPrincipal: false,
  });

  useEffect(() => {
    setLocationError("");
    setLocationNotice("");
    if (editingAddress) {
      setFormData(editingAddress);
    } else {
      setFormData({
        name: "",
        ...emptyTerritoryAddress,
        lat: "",
        lng: "",
        isPrincipal: false,
      });
    }
  }, [editingAddress, isOpen]);

  const hasMapCoordinates = Boolean(formData.lat && formData.lng);
  const mapQuery = hasMapCoordinates
    ? `${formData.lat},${formData.lng}`
    : buildTerritoryAddressLine(formData);

  if (!isOpen) return null;

  const handleUseCurrentLocation = () => {
    setLocationError("");
    setLocationNotice("");
    if (!navigator.geolocation) {
      setLocationNotice(
        "Tu navegador no permite obtener la ubicación automáticamente. Puedes continuar con la dirección manual.",
      );
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const lat = Number(coords.latitude.toFixed(6));
        const lng = Number(coords.longitude.toFixed(6));
        setFormData((data) => ({ ...data, lat: lat.toFixed(6), lng: lng.toFixed(6), location_source: "gps" }));
        setLocationNotice("Ubicación GPS guardada. GEO RD MAP está confirmando el punto…");
        setIsLocating(false);
        void api.post("/client/geo/reverse", { lat, lng }).then((result) => {
          const label = String(result?.label || result?.address || "").trim();
          if (label) setLocationNotice(`✓ Ubicación confirmada por GEO RD MAP: ${label}`);
          else setLocationNotice("✓ Ubicación GPS guardada correctamente.");
        }).catch(() => setLocationNotice("✓ Ubicación GPS guardada correctamente."));
      },
      () => {
        setLocationNotice(
          "No pudimos detectar tu ubicación automáticamente. Puedes continuar escribiendo una dirección clara.",
        );
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const handleSave = async () => {
    if (!isTerritoryAddressComplete(formData)) {
      setLocationError(
        "Completa provincia, municipio/distrito, barrio, calle y número.",
      );
      return;
    }
    const address = buildTerritoryAddressLine(formData);
    setIsSaving(true);
    setLocationError("");
    try {
      await Promise.resolve(
        onSave({
          ...formData,
          address,
          sector: formData.neighborhood,
          province_code: formData.provinceCode,
          municipality_code: formData.municipalityCode,
          district_code: formData.districtCode,
          neighborhood_id: formData.neighborhoodId,
          custom_neighborhood: Boolean(formData.customNeighborhood),
          location_source: hasMapCoordinates ? "gps" : "manual",
        }),
      );
      onClose();
    } catch (error: any) {
      setLocationError(
        error?.message ||
          "No se pudo guardar la dirección. Intenta nuevamente.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="pointer-events-auto w-full max-w-lg bg-white rounded-3xl max-h-[calc(100vh-2rem)] flex flex-col shadow-2xl lg:max-w-[1180px] lg:max-h-[calc(100vh-3rem)]"
            >
              <div className="flex justify-between items-start gap-4 p-5 border-b border-gray-100 lg:px-7 lg:py-6">
                <div>
                  <h3 className="text-lg font-black text-gray-800 lg:text-[28px] lg:leading-none">
                    {editingAddress ? "Editar dirección" : "Nueva dirección"}
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-1 lg:text-sm lg:max-w-2xl">
                    La ubicación GPS ayuda al repartidor, pero puedes continuar
                    con una dirección completa.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 bg-gray-100 hover:bg-gray-200 transition-colors rounded-full flex items-center justify-center text-gray-600 shrink-0 lg:w-10 lg:h-10 lg:text-base"
                >
                  <FiX />
                </button>
              </div>

              <div className="p-5 overflow-y-auto flex-1 lg:px-7 lg:py-6">
                <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:items-start lg:gap-6">
                  <div className="order-2 lg:order-1 lg:sticky lg:top-0">
                    <div className="border border-gray-100 rounded-2xl bg-white shadow-sm p-4 lg:rounded-[1.75rem] lg:border-gray-200 lg:p-5">
                      <div className="flex justify-between items-center gap-3 mb-3 lg:mb-4">
                        <div>
                          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">
                            Ubicación en mapa
                          </span>
                          <p className="text-[11px] text-gray-500 mt-1 lg:text-xs">
                            Usa GPS y GEO RD MAP para confirmar el punto exacto y ayudar al repartidor a llegar más rápido.
                          </p>
                        </div>
                        <button
                          onClick={handleUseCurrentLocation}
                          disabled={isLocating}
                          className={`text-[10px] bg-[#00a884] text-white px-3 py-1.5 rounded-lg font-bold shadow-sm hover:bg-[#009676] transition-colors whitespace-nowrap lg:px-4 lg:py-2 ${isLocating ? "opacity-70 cursor-wait" : ""}`}
                        >
                          {isLocating
                            ? "Buscando ubicación..."
                            : "Usar mi ubicación"}
                        </button>
                      </div>

                      {!hasMapCoordinates && (
                        <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 lg:mb-4 lg:px-4 lg:py-3">
                          <FiAlertTriangle className="text-amber-500 text-sm shrink-0 mt-0.5" />
                          <p className="text-[10px] text-amber-700 font-semibold leading-snug lg:text-[11px]">
                            Si no puedes usar GPS, completa la dirección manual.
                            El pedido podrá continuar con una referencia clara.
                          </p>
                        </div>
                      )}

                      <div className="h-40 bg-[#eafaf1] rounded-xl mb-3 relative overflow-hidden border border-[#00a884]/20 lg:h-[430px] lg:rounded-2xl lg:mb-4">
                        {hasMapCoordinates ? (
                          <iframe
                            title="Ubicación exacta de entrega"
                            width="100%"
                            height="100%"
                            style={{ border: 0 }}
                            loading="lazy"
                            allowFullScreen
                            src={`https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div
                              className="absolute inset-0 opacity-40"
                              style={{
                                backgroundImage:
                                  "linear-gradient(90deg, #00a88422 1px, transparent 1px), linear-gradient(#00a88422 1px, transparent 1px)",
                                backgroundSize: "24px 24px",
                              }}
                            />
                            <div className="absolute left-0 right-0 top-1/2 h-px bg-[#00a884]/30" />
                            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[#00a884]/30" />
                            <div className="relative z-10 w-10 h-10 rounded-full bg-white/80 flex items-center justify-center backdrop-blur-sm shadow-sm border border-[#00a884]/20 lg:w-14 lg:h-14">
                              <FiMapPin className="text-[#00a884] text-2xl drop-shadow-md lg:text-3xl" />
                            </div>
                          </div>
                        )}
                      </div>

                      {locationNotice && (
                        <div
                          className={`flex items-start gap-2 rounded-xl px-3 py-2 -mt-1 mb-3 text-[10px] font-semibold lg:text-[11px] lg:mb-4 ${hasMapCoordinates ? "bg-[#eafaf1] border border-[#00a884]/20 text-[#00a884]" : "bg-amber-50 border border-amber-100 text-amber-700"}`}
                        >
                          {hasMapCoordinates ? (
                            <FiCheckCircle className="shrink-0 mt-0.5" />
                          ) : (
                            <FiAlertTriangle className="shrink-0 mt-0.5" />
                          )}
                          <span>{locationNotice}</span>
                        </div>
                      )}
                      {locationError && (
                        <p className="text-[10px] text-red-500 font-semibold -mt-1 mb-3 lg:text-[11px] lg:mb-4">
                          {locationError}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="order-1 lg:order-2">
                    <div className="border border-gray-100 rounded-2xl bg-white shadow-sm p-4 lg:rounded-[1.75rem] lg:border-gray-200 lg:p-5">
                      <div className="mb-4 lg:mb-5">
                        <Field
                          label="Nombre de la dirección"
                          value={formData.name}
                          onChange={(e) =>
                            setFormData({ ...formData, name: e.target.value })
                          }
                          placeholder="Casa, Trabajo, Mamá..."
                        />
                      </div>

                      <div className="mb-4 lg:mb-5">
                        <TerritoryAddressForm
                          value={formData}
                          onChange={(data) =>
                            setFormData((current) => {
                              const addressChanged = [
                                "province",
                                "provinceCode",
                                "municipality",
                                "municipalityCode",
                                "districtCode",
                                "neighborhood",
                                "neighborhoodId",
                                "street",
                                "street_number",
                              ].some(
                                (key) =>
                                  String(data?.[key] || "") !==
                                  String(current?.[key] || ""),
                              );
                              return {
                                ...current,
                                ...data,
                                address: buildTerritoryAddressLine(data),
                                ...(addressChanged ? { lat: "", lng: "" } : {}),
                              };
                            })
                          }
                          title="Dirección de entrega"
                          description="Selecciona provincia, municipio/distrito y barrio para completar tu dirección."
                          allowCustomNeighborhood
                        />
                      </div>

                      <label className="flex items-center gap-2 mb-5 p-3 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer lg:mb-6">
                        <input
                          type="checkbox"
                          checked={formData.isPrincipal}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              isPrincipal: e.target.checked,
                            })
                          }
                          className="w-4 h-4 text-[#00a884] rounded border-gray-300 focus:ring-[#00a884]"
                        />
                        <span className="text-xs font-semibold text-gray-700">
                          Guardar como dirección principal
                        </span>
                      </label>

                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={handleSave}
                        disabled={isSaving}
                        className={`w-full bg-[#00a884] text-white py-3.5 rounded-xl font-bold text-sm shadow-md shadow-[#00a884]/25 hover:bg-[#009676] transition-colors lg:rounded-2xl lg:text-base ${isSaving ? "opacity-70 cursor-wait" : ""}`}
                      >
                        {isSaving ? "Guardando..." : "Guardar dirección"}
                      </motion.button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};
export default AddressModal;
