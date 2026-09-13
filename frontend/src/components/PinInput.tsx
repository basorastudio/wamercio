import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ACCESS_PIN_LENGTH, sanitizePin } from '../lib/pin';

type PinInputProps = {
  value?: string;
  onChange: (value: string) => void;
  label?: string;
  length?: number;
  inputMaxLength?: number;
  disabled?: boolean;
  autoComplete?: string;
  name?: string;
};

const PinInput = ({
  value = '',
  onChange,
  label = `PIN de ${ACCESS_PIN_LENGTH} dígitos *`,
  length = ACCESS_PIN_LENGTH,
  inputMaxLength = length,
  disabled = false,
  autoComplete = 'off',
  name = 'pin',
}: PinInputProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);
  const effectiveMaxLength = Math.max(length, inputMaxLength || length);
  const normalizedValue = sanitizePin(value, effectiveMaxLength);
  const visualLength = Math.min(effectiveMaxLength, Math.max(length, normalizedValue.length));
  const digits = useMemo(
    () => normalizedValue.split('').concat(Array(visualLength).fill('')).slice(0, visualLength),
    [normalizedValue, visualLength],
  );
  const filled = normalizedValue.length;

  const focusInput = () => {
    if (disabled) return;
    const input = inputRef.current;
    input?.focus({ preventScroll: true });
    window.requestAnimationFrame(() => {
      const end = input?.value.length ?? 0;
      input?.setSelectionRange?.(end, end);
    });
  };

  const updateValue = (rawValue: string) => {
    onChange(sanitizePin(rawValue, effectiveMaxLength));
  };

  return (
    <div>
      {label ? (
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-3">
          {label}
        </p>
      ) : null}

      <div
        className={`relative grid w-full max-w-sm mx-auto gap-1.5 sm:gap-3 ${disabled ? 'opacity-60' : ''}`}
        style={{ gridTemplateColumns: `repeat(${visualLength}, minmax(0, 1fr))` }}
        onClick={focusInput}
      >
        <input
          ref={inputRef}
          name={name}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="done"
          value={normalizedValue}
          maxLength={effectiveMaxLength}
          disabled={disabled}
          aria-label={label || `PIN de ${length} dígitos`}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => updateValue(event.currentTarget.value)}
          onPaste={(event) => {
            event.preventDefault();
            updateValue(event.clipboardData.getData('text'));
            window.requestAnimationFrame(focusInput);
          }}
          className="absolute inset-0 z-20 h-full w-full cursor-text opacity-[0.01] text-base caret-transparent"
        />

        {digits.map((digit, index) => {
          const active = focused && index === Math.min(filled, visualLength - 1);
          return (
            <motion.div
              key={index}
              whileTap={disabled ? undefined : { scale: 0.94 }}
              aria-hidden="true"
              className={`relative z-10 min-w-0 h-12 sm:h-14 rounded-2xl border-2 flex items-center justify-center transition-all duration-200
                ${digit ? 'border-[#00a884] bg-[#00a884]/5 shadow-sm shadow-[#00a884]/20' : active ? 'border-[#00a884] bg-white ring-4 ring-[#00a884]/10' : 'border-gray-200 bg-gray-50'}`}
            >
              {digit ? (
                <div className="w-3 h-3 rounded-full bg-[#00a884]" />
              ) : (
                <div className={`w-2 h-2 rounded-full transition-all ${active ? 'bg-[#00a884]/55 animate-pulse' : 'bg-gray-300'}`} />
              )}
            </motion.div>
          );
        })}
      </div>

      {filled === length ? (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[10px] text-[#00a884] font-semibold text-center mt-2"
        >
          ✓ PIN completo
        </motion.p>
      ) : null}
    </div>
  );
};

export default PinInput;
