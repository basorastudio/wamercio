import React, { useMemo, useRef, useState } from 'react';

const onlyDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

type CodeInputProps = {
  value?: string;
  onChange: (value: string) => void;
  length?: number;
  label?: string;
  disabled?: boolean;
};

const CodeInput = ({ value = '', onChange, length = 6, label = 'Código de verificación', disabled = false }: CodeInputProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);
  const normalized = onlyDigits(value).slice(0, length);
  const digits = useMemo(() => normalized.split('').concat(Array(length).fill('')).slice(0, length), [normalized, length]);

  const focusInput = () => {
    if (disabled) return;
    inputRef.current?.focus({ preventScroll: true });
  };

  return (
    <div>
      {label ? <p className="mb-3 px-1 text-[10px] font-black uppercase tracking-wider text-gray-500">{label}</p> : null}
      <div
        className="relative mx-auto grid w-full max-w-sm gap-1.5 sm:gap-2.5"
        style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}
        onClick={focusInput}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          value={normalized}
          maxLength={length}
          disabled={disabled}
          aria-label={label}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => onChange(onlyDigits(event.currentTarget.value).slice(0, length))}
          onPaste={(event) => {
            event.preventDefault();
            onChange(onlyDigits(event.clipboardData.getData('text')).slice(0, length));
          }}
          className="absolute inset-0 z-20 h-full w-full cursor-text opacity-[0.01] text-base caret-transparent"
        />
        {digits.map((digit, index) => {
          const active = focused && index === Math.min(normalized.length, length - 1);
          return (
            <div
              key={index}
              aria-hidden="true"
              className={`relative z-10 flex h-12 min-w-0 items-center justify-center rounded-2xl border-2 text-xl font-black transition-all sm:h-14 ${digit ? 'border-[#00a884] bg-[#00a884]/5 text-gray-900' : active ? 'border-[#00a884] bg-white ring-4 ring-[#00a884]/10' : 'border-gray-200 bg-gray-50 text-gray-300'}`}
            >
              {digit || '•'}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CodeInput;
