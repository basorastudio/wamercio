import React, { useEffect, useMemo, useRef, useState } from "react";
import * as FiIcons from "react-icons/fi";
import { api } from "../lib/api";

const {
  FiMapPin,
  FiHome,
  FiCheckCircle,
  FiAlertCircle,
  FiLoader,
  FiEdit3,
} = FiIcons;

export const emptyTerritoryAddress = {
  province: "",
  provinceCode: "",
  municipality: "",
  municipalityCode: "",
  districtCode: "",
  neighborhood: "",
  neighborhoodId: "",
  customNeighborhood: false,
  street: "",
  street_number: "",
};

const valueOf = (value: any, ...keys: string[]) => {
  for (const key of keys) {
    const current = String(value?.[key] || "").trim();
    if (current) return current;
  }
  return "";
};

const textValueOf = (value: any, key: string) =>
  String(value?.[key] || "").replace(/\s+/g, " ");

// Preserve the text exactly while the user is typing. Trimming here would
// remove a trailing space on every render and prevent writing multi-word
// neighborhood names naturally (for example, "María Auxiliadora").
const editableTextValueOf = (value: any, ...keys: string[]) => {
  for (const key of keys) {
    if (value?.[key] !== undefined && value?.[key] !== null) {
      return String(value[key]);
    }
  }
  return "";
};

const booleanValueOf = (value: any, ...keys: string[]) => {
  for (const key of keys) {
    if (value?.[key] === true) return true;
    const normalized = String(value?.[key] ?? "")
      .toLowerCase()
      .trim();
    if (["true", "1", "yes", "si", "sí", "on"].includes(normalized))
      return true;
  }
  return false;
};

export const normalizeTerritoryAddress = (value: any = {}) => {
  const customNeighborhood = booleanValueOf(
    value,
    "customNeighborhood",
    "custom_neighborhood",
    "neighborhoodCustom",
    "neighborhood_custom",
  );
  const neighborhood = customNeighborhood
    ? editableTextValueOf(value, "neighborhood", "sector")
    : valueOf(value, "neighborhood", "sector");

  return {
    province: valueOf(value, "province"),
    provinceCode: valueOf(value, "provinceCode", "province_code"),
    province_code: valueOf(value, "provinceCode", "province_code"),
    municipality: valueOf(value, "municipality"),
    municipalityCode: valueOf(value, "municipalityCode", "municipality_code"),
    municipality_code: valueOf(value, "municipalityCode", "municipality_code"),
    districtCode: valueOf(value, "districtCode", "district_code"),
    district_code: valueOf(value, "districtCode", "district_code"),
    neighborhood,
    sector: neighborhood,
    neighborhoodId: valueOf(value, "neighborhoodId", "neighborhood_id"),
    neighborhood_id: valueOf(value, "neighborhoodId", "neighborhood_id"),
    customNeighborhood,
    custom_neighborhood: customNeighborhood,
    street: textValueOf(value, "street"),
    street_number: valueOf(value, "street_number").replace(/\D/g, ""),
  };
};

export const isTerritoryAddressComplete = (value: any = {}) => {
  const normalized = normalizeTerritoryAddress(value);
  return Boolean(
    normalized.province &&
    normalized.municipality &&
    normalized.neighborhood.trim() &&
    normalized.street.trim() &&
    normalized.street_number,
  );
};

export const buildTerritoryAddressLine = (value: any = {}) => {
  const normalized = normalizeTerritoryAddress(value);
  const street = normalized.street.trim();
  const line1 = [
    street,
    normalized.street_number ? `#${normalized.street_number}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return [
    line1,
    normalized.neighborhood.trim(),
    normalized.municipality,
    normalized.province,
  ]
    .filter(Boolean)
    .join(", ");
};

const inputClass =
  "w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00a884]/40 focus:border-[#00a884] bg-white disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed transition-all";
const labelClass =
  "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5";

const normalizeSearch = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const SelectField = ({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  icon: Icon = FiMapPin,
  emptyStateActionLabel = "",
  onEmptyStateAction,
}: any) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const normalizedOptions = useMemo(
    () =>
      normalizeItems(options).map((option: any) => ({
        ...option,
        value: String(
          option.value ||
            option.code ||
            option.id ||
            option.identifier ||
            option.name ||
            "",
        ),
        label: String(option.name || option.label || ""),
      })),
    [options],
  );

  const selected = normalizedOptions.find(
    (option: any) => String(option.value) === String(value),
  );
  const selectedLabel = selected?.label || "";
  const search = normalizeSearch(query);
  const filtered = search
    ? normalizedOptions.filter((option: any) =>
        normalizeSearch(`${option.label} ${option.value}`).includes(search),
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
    onChange(option.value);
    setOpen(false);
    setQuery("");
  };

  const chooseEmptyStateAction = () => {
    if (typeof onEmptyStateAction !== "function") return;
    onEmptyStateAction(query.trim());
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none z-10" />
        <input
          type="text"
          value={open ? query : selectedLabel}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
              setQuery("");
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
            if (e.key === "Enter" && filtered.length > 0) {
              e.preventDefault();
              choose(filtered[0]);
            }
            if (
              e.key === "Enter" &&
              filtered.length === 0 &&
              emptyStateActionLabel &&
              typeof onEmptyStateAction === "function"
            ) {
              e.preventDefault();
              chooseEmptyStateAction();
            }
          }}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          className={`${inputClass} pl-9 pr-10`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none">
          ▾
        </span>
      </div>

      {open && !disabled && (
        <div className="absolute z-[9999] mt-2 w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-900/15">
          <div className="max-h-64 overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-gray-300">
            {filtered.length > 0 ? (
              filtered.map((option: any) => {
                const active = String(option.value) === String(value);
                return (
                  <button
                    key={
                      option.id ||
                      option.identifier ||
                      option.code ||
                      option.value ||
                      option.label
                    }
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
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
              <>
                {emptyStateActionLabel &&
                typeof onEmptyStateAction === "function" ? (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={chooseEmptyStateAction}
                    className="w-full flex items-center gap-2 rounded-xl px-3 py-3 text-left text-xs font-black text-[#00a884] transition-colors hover:bg-[#f0fdf8] hover:text-[#008f72]"
                  >
                    <FiEdit3 className="shrink-0 text-sm" />
                    <span>{emptyStateActionLabel}</span>
                  </button>
                ) : (
                  <div className="px-3 py-3 text-xs text-gray-400 font-medium">
                    No hay coincidencias. Escribe otra búsqueda.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const TextField = ({
  label,
  value,
  onChange,
  placeholder,
  numeric = false,
  disabled = false,
  icon: Icon = FiHome,
}: any) => (
  <div>
    <label className={labelClass}>{label}</label>
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none" />
      <input
        type="text"
        inputMode={numeric ? "numeric" : "text"}
        value={value || ""}
        onChange={(e) =>
          onChange(numeric ? e.target.value.replace(/\D/g, "") : e.target.value)
        }
        disabled={disabled}
        placeholder={placeholder}
        className={`${inputClass} pl-9`}
      />
    </div>
  </div>
);

const normalizeItems = (items: any) => (Array.isArray(items) ? items : []);

const districtOptionValue = (item: any) =>
  String(
    item?.identifier ||
      [item?.provinceCode, item?.municipalityCode, item?.code]
        .filter(Boolean)
        .join(":") ||
      item?.code ||
      item?.municipalityCode ||
      item?.name ||
      "",
  );

const findSelectedDistrict = (
  items: any[],
  municipalityCode = "",
  districtCode = "",
) => {
  const normalizedMunicipalityCode = String(municipalityCode || "").trim();
  const normalizedDistrictCode = String(districtCode || "").trim();
  if (!normalizedMunicipalityCode && !normalizedDistrictCode) return undefined;

  const exactIdentifier = normalizedDistrictCode
    ? items.find(
        (item) => String(item?.identifier || "") === normalizedDistrictCode,
      )
    : undefined;
  if (exactIdentifier) return exactIdentifier;

  const exactPair = normalizedMunicipalityCode
    ? items.find(
        (item) =>
          String(item?.municipalityCode || "") === normalizedMunicipalityCode &&
          String(item?.code || "") === (normalizedDistrictCode || "01"),
      )
    : undefined;
  if (exactPair) return exactPair;

  if (normalizedDistrictCode) {
    const byCode = items.find(
      (item) => String(item?.code || "") === normalizedDistrictCode,
    );
    if (byCode) return byCode;
  }

  return items.find(
    (item) =>
      String(item?.municipalityCode || "") === normalizedMunicipalityCode,
  );
};

const TerritoryAddressForm = ({
  value = {},
  onChange,
  title = "Dirección",
  description = "Selecciona provincia, municipio/distrito y barrio. Luego completa calle y número.",
  compact = false,
  apiPrefix = "",
  lockedProvince = null,
  lockedMunicipality = null,
  lockedNeighborhood = null,
  hideProvince = false,
  hideMunicipality = false,
  hideNeighborhood = false,
  scopeHint = "",
  missingNeighborhoodMessage = "",
  allowCustomNeighborhood = false,
  children = null,
}: any) => {
  const current = useMemo(() => normalizeTerritoryAddress(value), [value]);
  const lockedProvinceCode = valueOf(
    lockedProvince,
    "code",
    "provinceCode",
    "province_code",
  );
  const lockedProvinceName = valueOf(
    lockedProvince,
    "name",
    "province",
    "provinceName",
    "province_name",
  );
  const lockedMunicipalityCode = valueOf(
    lockedMunicipality,
    "code",
    "municipalityCode",
    "municipality_code",
  );
  const lockedMunicipalityName = valueOf(
    lockedMunicipality,
    "name",
    "municipality",
    "municipalityName",
    "municipality_name",
  );
  const lockedDistrictCode = valueOf(
    lockedMunicipality,
    "districtCode",
    "district_code",
  );
  const lockedNeighborhoodId = valueOf(
    lockedNeighborhood,
    "id",
    "identifier",
    "code",
    "neighborhoodId",
    "neighborhood_id",
  );
  const lockedNeighborhoodName = valueOf(
    lockedNeighborhood,
    "name",
    "neighborhood",
    "sector",
    "neighborhoodName",
    "neighborhood_name",
  );
  const showProvince = !hideProvince;
  const showMunicipality = !hideMunicipality;
  const showNeighborhood = !hideNeighborhood;
  const visibleLocationFields = [
    showProvince,
    showMunicipality,
    showNeighborhood,
  ].filter(Boolean).length;
  const locationGridClass =
    visibleLocationFields >= 3
      ? "grid grid-cols-1 sm:grid-cols-3 gap-3"
      : visibleLocationFields === 2
        ? "grid grid-cols-1 sm:grid-cols-2 gap-3"
        : "grid grid-cols-1 gap-3";
  const [provinces, setProvinces] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const district = findSelectedDistrict(
    districts,
    current.municipalityCode,
    current.districtCode,
  );
  const districtValue = district ? districtOptionValue(district) : "";

  const emit = (patch: any) => {
    const next = normalizeTerritoryAddress({ ...current, ...patch });
    onChange?.({
      ...next,
      address: buildTerritoryAddressLine(next),
    });
  };

  useEffect(() => {
    const patch: any = {};
    const provinceChanged =
      Boolean(lockedProvinceCode) &&
      current.provinceCode !== lockedProvinceCode;
    const municipalityChanged =
      Boolean(lockedMunicipalityCode) &&
      current.municipalityCode !== lockedMunicipalityCode;

    if (
      lockedProvinceCode &&
      (provinceChanged || current.province !== lockedProvinceName)
    ) {
      patch.provinceCode = lockedProvinceCode;
      patch.province = lockedProvinceName;
      if (provinceChanged && !lockedMunicipalityCode) {
        patch.municipality = "";
        patch.municipalityCode = "";
        patch.districtCode = "";
        patch.neighborhood = "";
        patch.neighborhoodId = "";
        patch.customNeighborhood = false;
      }
    }

    if (
      lockedMunicipalityCode &&
      (municipalityChanged ||
        current.municipality !== lockedMunicipalityName ||
        current.districtCode !== lockedDistrictCode)
    ) {
      patch.municipality = lockedMunicipalityName;
      patch.municipalityCode = lockedMunicipalityCode;
      patch.districtCode = lockedDistrictCode;
      if (
        municipalityChanged &&
        !lockedNeighborhoodId &&
        !lockedNeighborhoodName
      ) {
        patch.neighborhood = "";
        patch.neighborhoodId = "";
        patch.customNeighborhood = false;
      }
    }

    if (
      (lockedNeighborhoodId || lockedNeighborhoodName) &&
      (current.neighborhoodId !== lockedNeighborhoodId ||
        current.neighborhood !== lockedNeighborhoodName)
    ) {
      patch.neighborhoodId = lockedNeighborhoodId;
      patch.neighborhood = lockedNeighborhoodName;
      patch.customNeighborhood = false;
    }

    if (Object.keys(patch).length > 0) {
      emit(patch);
    }
  }, [
    lockedProvinceCode,
    lockedProvinceName,
    lockedMunicipalityCode,
    lockedMunicipalityName,
    lockedDistrictCode,
    lockedNeighborhoodId,
    lockedNeighborhoodName,
    current.provinceCode,
    current.province,
    current.municipalityCode,
    current.municipality,
    current.districtCode,
    current.neighborhoodId,
    current.neighborhood,
  ]);

  useEffect(() => {
    let mounted = true;
    api
      .get(`${apiPrefix}/territories/provinces`)
      .then((items) => mounted && setProvinces(normalizeItems(items)))
      .catch(
        () => mounted && setMessage("No se pudieron cargar las provincias."),
      );
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!current.provinceCode) {
      setDistricts([]);
      return () => {
        mounted = false;
      };
    }
    setLoading(true);
    api
      .get(
        `${apiPrefix}/territories/districts?provinceCode=${encodeURIComponent(current.provinceCode)}`,
      )
      .then((items) => mounted && setDistricts(normalizeItems(items)))
      .catch(
        () =>
          mounted &&
          setMessage("No se pudieron cargar los municipios/distritos."),
      )
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [current.provinceCode]);

  useEffect(() => {
    let mounted = true;
    if (!current.provinceCode || !current.municipalityCode) {
      setNeighborhoods([]);
      return () => {
        mounted = false;
      };
    }
    setLoading(true);
    const params = new URLSearchParams({
      provinceCode: current.provinceCode,
      municipalityCode: current.municipalityCode,
      districtCode: current.districtCode || "",
    });
    api
      .get(`${apiPrefix}/territories/neighborhoods?${params.toString()}`)
      .then((items) => mounted && setNeighborhoods(normalizeItems(items)))
      .catch(() => mounted && setNeighborhoods([]))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [current.provinceCode, current.municipalityCode, current.districtCode]);

  const handleProvince = (code: string) => {
    const selected = provinces.find((item) => item.code === code);
    emit({
      provinceCode: code,
      province: selected?.name || "",
      municipality: "",
      municipalityCode: "",
      districtCode: "",
      neighborhood: "",
      neighborhoodId: "",
      customNeighborhood: false,
    });
  };

  const handleDistrict = (identifier: string) => {
    const selected = districts.find(
      (item) => districtOptionValue(item) === String(identifier),
    );
    emit({
      municipality: selected?.name || "",
      municipalityCode: selected?.municipalityCode || selected?.code || "",
      districtCode: selected?.code || "",
      neighborhood: "",
      neighborhoodId: "",
      customNeighborhood: false,
    });
  };

  const handleNeighborhood = (id: string) => {
    const selected = neighborhoods.find(
      (item) =>
        item.id === id ||
        item.identifier === id ||
        item.code === id ||
        item.name === id,
    );
    emit({
      neighborhood: selected?.name || "",
      neighborhoodId:
        selected?.id || selected?.identifier || selected?.code || "",
      customNeighborhood: false,
    });
  };

  const neighborhoodOptions = neighborhoods.map((item) => ({
    ...item,
    value: item.id || item.identifier || item.code || item.name,
  }));

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
            {title}
          </p>
          {!compact && (
            <p className="text-[11px] text-gray-400 px-1 mt-0.5">
              {description}
            </p>
          )}
        </div>
        {loading && (
          <FiLoader className="text-[#00a884] animate-spin text-sm mt-0.5" />
        )}
      </div>

      {(scopeHint || hideProvince || hideMunicipality || hideNeighborhood) && (
        <div className="flex items-start gap-2 rounded-xl bg-[#f0fdf8] border border-[#00a884]/20 px-3 py-2">
          <FiMapPin className="text-[#00a884] text-sm mt-0.5 shrink-0" />
          <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
            {scopeHint ||
              "La ubicación se limita automáticamente según el alcance configurado para este negocio."}
          </p>
        </div>
      )}

      <div className={locationGridClass}>
        {showProvince && (
          <SelectField
            label="Provincia"
            value={current.provinceCode}
            onChange={handleProvince}
            options={provinces}
            placeholder="Selecciona provincia"
          />
        )}
        {showMunicipality && (
          <SelectField
            label="Municipio / Distrito"
            value={districtValue}
            onChange={handleDistrict}
            options={districts.map((item) => ({
              ...item,
              value: districtOptionValue(item),
            }))}
            placeholder="Selecciona municipio"
            disabled={!current.provinceCode}
          />
        )}
        {showNeighborhood &&
          (allowCustomNeighborhood && current.customNeighborhood ? (
            <TextField
              label="Barrio o residencial"
              value={current.neighborhood}
              onChange={(neighborhood: string) =>
                emit({
                  neighborhood,
                  neighborhoodId: "",
                  customNeighborhood: true,
                })
              }
              placeholder="Escribe tu barrio o residencial"
              disabled={!current.municipalityCode}
              icon={FiEdit3}
            />
          ) : (
            <SelectField
              label="Barrio"
              value={current.neighborhoodId || current.neighborhood}
              onChange={handleNeighborhood}
              options={neighborhoodOptions}
              placeholder="Selecciona barrio"
              disabled={!current.municipalityCode}
              emptyStateActionLabel={
                allowCustomNeighborhood &&
                current.municipalityCode &&
                !lockedNeighborhoodId &&
                !lockedNeighborhoodName
                  ? "Mi barrio o residencial no aparece; escribirlo"
                  : ""
              }
              onEmptyStateAction={
                allowCustomNeighborhood &&
                current.municipalityCode &&
                !lockedNeighborhoodId &&
                !lockedNeighborhoodName
                  ? (neighborhood: string) =>
                      emit({
                        neighborhood,
                        neighborhoodId: "",
                        customNeighborhood: true,
                      })
                  : undefined
              }
            />
          ))}
      </div>

      {missingNeighborhoodMessage && current.municipalityCode && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
          <FiAlertCircle className="text-amber-500 text-sm mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-700 font-semibold leading-relaxed">
            {missingNeighborhoodMessage}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <TextField
            label="Calle"
            value={current.street}
            onChange={(street: string) => emit({ street })}
            placeholder="Ej. Calle Principal"
          />
        </div>
        <TextField
          label="Número"
          value={current.street_number}
          onChange={(street_number: string) => emit({ street_number })}
          placeholder="Ej. 27"
          numeric
        />
      </div>

      {buildTerritoryAddressLine(current) && (
        <div className="flex items-start gap-2 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
          <FiMapPin className="text-[#00a884] text-sm mt-0.5 shrink-0" />
          <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
            {buildTerritoryAddressLine(current)}
          </p>
          {isTerritoryAddressComplete(current) && (
            <FiCheckCircle className="text-[#00a884] text-sm ml-auto shrink-0" />
          )}
        </div>
      )}

      {children}

      {message && (
        <div
          className={`flex items-center gap-2 text-[10px] font-semibold px-1 ${message.startsWith("✓") ? "text-[#00a884]" : "text-amber-600"}`}
        >
          {message.startsWith("✓") ? <FiCheckCircle /> : <FiAlertCircle />}
          <span>{message}</span>
        </div>
      )}
    </div>
  );
};

export default TerritoryAddressForm;
