import React, { useEffect, useRef, useState } from 'react';
import intlTelInput from 'intl-tel-input';
import 'intl-tel-input/build/css/intlTelInput.css';

const FALLBACK_NATIONAL_LENGTHS = {
  do: 10,
  us: 10,
  ca: 10,
  mx: 10,
  co: 10,
  ve: 10,
  ec: 9,
  pe: 9,
  cl: 9,
  ar: 10,
  es: 9,
  pa: 8,
  cr: 8,
  gt: 8,
  hn: 8,
  ni: 8,
  sv: 8,
  pr: 10,
};

const getUtils = () => (typeof window !== 'undefined' ? (window as any).intlTelInputUtils : null);

const countDigits = (value = '') => String(value).replace(/\D/g, '').length;

const PhoneInput = ({
  value = '',
  onChange,
  valid = undefined,
  invalid = false,
  placeholder = 'WhatsApp',
  initialCountry = 'do',
  preferredCountries = ['do'],
  onlyCountries = undefined,
  disabled = false,
  name = undefined,
  required = false,
  autoComplete = 'tel',
}: any) => {
  const inputRef = useRef(null);
  const itiRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const formattingRef = useRef(false);
  const mountedRef = useRef(false);
  const [focused, setFocused] = useState(false);
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const getCountryData = () => {
    const data = itiRef.current?.getSelectedCountryData?.() || {};
    return {
      iso2: data.iso2 || initialCountry || 'do',
      dialCode: data.dialCode || '1',
    };
  };

  const getMaxNationalDigits = () => {
    const { iso2 } = getCountryData();
    const utils = getUtils();

    try {
      const example = utils?.getExampleNumber?.(
        String(iso2).toUpperCase(),
        false,
        utils.numberType?.MOBILE
      );
      const exampleLength = countDigits(example);
      if (exampleLength > 0) return exampleLength;
    } catch (_) {
    }

    const placeholderLength = countDigits(inputRef.current?.placeholder || '');
    if (placeholderLength > 0) return placeholderLength;

    return FALLBACK_NATIONAL_LENGTHS[String(iso2).toLowerCase()] || 15;
  };

  const getNationalDigitsFromInput = () => {
    const { dialCode } = getCountryData();
    let digits = countDigits(inputRef.current?.value || '') ? String(inputRef.current?.value || '').replace(/\D/g, '') : '';

    if (digits.startsWith(dialCode) && digits.length > getMaxNationalDigits()) {
      digits = digits.slice(dialCode.length);
    }

    return digits;
  };

  const buildFullNumber = (digits) => {
    const { dialCode } = getCountryData();
    return digits ? `+${dialCode}${digits}` : '';
  };

  const formatNational = (digits) => {
    if (!digits) return '';
    const utils = getUtils();
    const { iso2 } = getCountryData();
    const fullNumber = buildFullNumber(digits);

    try {
      if (utils?.formatNumber && utils?.numberFormat?.NATIONAL !== undefined) {
        return utils.formatNumber(fullNumber, String(iso2).toUpperCase(), utils.numberFormat.NATIONAL);
      }
    } catch (_) {
    }

    return digits;
  };

  const emitChange = () => {
    if (!inputRef.current || !itiRef.current) return;

    const nationalDigits = getNationalDigitsFromInput();
    const maxLength = getMaxNationalDigits();
    const countryData = itiRef.current.getSelectedCountryData?.() || {};
    const fullNumber = itiRef.current.getNumber?.() || buildFullNumber(nationalDigits);
    const validNumber = Boolean(
      itiRef.current.isValidNumber?.() || (nationalDigits.length > 0 && nationalDigits.length === maxLength)
    );

    setIsValid(validNumber);
    onChangeRef.current?.({
      whatsapp: fullNumber,
      whatsappDisplay: inputRef.current.value,
      countryCode: countryData.iso2 || initialCountry || 'do',
      dialCode: `+${countryData.dialCode || '1'}`,
      nationalNumber: nationalDigits,
      maxLength,
      isValid: validNumber,
    });
  };

  const applyPhoneRules = () => {
    if (!inputRef.current || formattingRef.current) return;

    const maxLength = getMaxNationalDigits();
    const digits = getNationalDigitsFromInput().slice(0, maxLength);
    const formatted = formatNational(digits);

    if (inputRef.current.value !== formatted) {
      formattingRef.current = true;
      inputRef.current.value = formatted;
      formattingRef.current = false;
    }

    emitChange();
  };

  const setInputValue = (nextValue) => {
    if (!inputRef.current || !itiRef.current) return;
    const raw = String(nextValue || '').trim();

    formattingRef.current = true;
    if (raw) {
      if (raw.startsWith('+')) {
        itiRef.current.setNumber?.(raw);
      } else {
        const digits = raw.replace(/\D/g, '').slice(0, getMaxNationalDigits());
        inputRef.current.value = formatNational(digits);
      }
    } else {
      inputRef.current.value = '';
    }
    formattingRef.current = false;
    applyPhoneRules();
  };

  useEffect(() => {
    if (!inputRef.current || mountedRef.current) return;
    mountedRef.current = true;

    const intlTelInputOptions: any = {
      initialCountry: initialCountry || 'do',
      separateDialCode: true,
      nationalMode: false,
      autoPlaceholder: 'aggressive',
      placeholderNumberType: 'MOBILE',
      formatOnDisplay: true,
      utilsScript: 'https://cdn.jsdelivr.net/npm/intl-tel-input@23.1.0/build/js/utils.js',
    };

    if (Array.isArray(preferredCountries) && preferredCountries.length > 0) {
      intlTelInputOptions.preferredCountries = preferredCountries;
    }

    if (Array.isArray(onlyCountries) && onlyCountries.length > 0) {
      intlTelInputOptions.onlyCountries = onlyCountries;
    }

    itiRef.current = intlTelInput(inputRef.current, intlTelInputOptions);

    const input = inputRef.current;
    const handleInput = () => applyPhoneRules();
    const handlePaste = () => window.setTimeout(handleInput, 0);
    const handleCountryChange = () => {
      input.value = '';
      setIsValid(false);
      emitChange();
    };

    input.addEventListener('input', handleInput);
    input.addEventListener('paste', handlePaste);
    input.addEventListener('countrychange', handleCountryChange);

    if (value) setInputValue(value);
    else emitChange();

    itiRef.current.promise?.then?.(() => {
      if (inputRef.current && value) setInputValue(value);
      else emitChange();
    });

    return () => {
      input.removeEventListener('input', handleInput);
      input.removeEventListener('paste', handlePaste);
      input.removeEventListener('countrychange', handleCountryChange);
      if (itiRef.current) {
        itiRef.current.destroy();
        itiRef.current = null;
      }
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!mountedRef.current) return;
    const nextDigits = countDigits(value);
    const currentNumber =
      itiRef.current?.getNumber?.() ||
      buildFullNumber(getNationalDigitsFromInput());
    const currentDigits = countDigits(currentNumber);

    if (nextDigits === currentDigits) return;
    setInputValue(value);
  }, [value]);

  const resolvedValid = typeof valid === 'boolean' ? valid : isValid;
  const resolvedInvalid = Boolean(invalid && !resolvedValid);
  const borderColor = resolvedInvalid ? '#fca5a5' : resolvedValid ? '#00a884' : focused ? '#00a884' : '#e5e7eb';
  const bgColor = resolvedInvalid ? '#fef2f2' : resolvedValid ? '#f0fdf8' : focused ? '#ffffff' : '#f9fafb';

  return (
    <div className="iti-wrapper relative">
      <style>{`
        .iti-wrapper .iti { width: 100%; }
        .iti-wrapper .iti__flag-container { z-index: 20; }
        .iti-wrapper input[type="tel"] {
          width: 100%;
          padding: 13px 40px 13px 92px;
          background: ${bgColor};
          border: 1.5px solid ${borderColor};
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          color: #1f2937;
          outline: none;
          transition: all 0.2s;
          box-sizing: border-box;
        }
        .iti-wrapper input[type="tel"]::placeholder { color: #9ca3af; font-weight: 500; }
        .iti-wrapper input[type="tel"]:disabled { opacity: 0.65; cursor: not-allowed; }
        .iti-wrapper .iti__flag-container { height: 100%; }
        .iti-wrapper .iti__selected-flag {
          background: transparent !important;
          border-right: 1.5px solid #e5e7eb;
          padding: 0 10px;
          height: 100%;
        }
        .iti-wrapper .iti--separate-dial-code .iti__selected-dial-code {
          font-size: 12px;
          color: #374151;
          font-weight: 600;
          margin-left: 4px;
        }
        .iti__country-list {
          border-radius: 12px !important;
          border: 1px solid #e5e7eb !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important;
          max-height: 220px;
          z-index: 9999 !important;
          overflow-y: auto;
        }
        .iti__country.iti__highlight { background: #f0fdf8 !important; }
        .iti__country:hover { background: #f9fafb !important; }
        .iti__dial-code { color: #6b7280; font-size: 12px; }
        .iti__country-name { font-size: 13px; color: #374151; }
      `}</style>
      <input
        ref={inputRef}
        type="tel"
        name={name}
        required={required}
        disabled={disabled}
        inputMode="tel"
        autoComplete={autoComplete}
        autoCorrect="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
        data-form-type="other"
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {resolvedValid && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#00a884] font-bold text-sm pointer-events-none z-10">
          ✓
        </div>
      )}
    </div>
  );
};

export default PhoneInput;
