import React, { useEffect, useMemo, useState } from 'react';
import { FiCheck, FiImage, FiMinus, FiPlus, FiX } from 'react-icons/fi';
import {
  buildWeightedCartItem,
  formatAmountWeight,
  formatProductPrice,
  getWeightedProductConfig,
  normalizeSaleMode,
  sanitizeAmount,
  sanitizeWeight,
  roundPayableAmount,
} from '../lib/weightedProducts';
import { catalogImageCandidates } from '../lib/catalogImages';

type Props = {
  product: any;
  initialItem?: any;
  onConfirm: (item: any) => void;
  onCancel?: () => void;
  showHeader?: boolean;
  confirmLabel?: string;
  className?: string;
};

const money = (value: any) =>
  roundPayableAmount(value).toLocaleString('es-DO', {
    maximumFractionDigits: 0,
  });

export const WeightedProductImage = ({ product }: { product: any }) => {
  const candidates = useMemo(() => catalogImageCandidates(product), [product]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const candidateKey = candidates.join('|');

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidateKey]);

  const src = candidates[candidateIndex] || '';

  if (!src) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gray-50 text-gray-300">
        <span className="text-5xl leading-none">
          {product?.categoryIcon || product?.category_icon || '📦'}
        </span>
        <FiImage className="text-xl opacity-70" />
      </div>
    );
  }

  return (
    <img
      key={src}
      src={src}
      alt={product?.name || 'Producto'}
      className="h-full w-full object-contain"
      loading="eager"
      decoding="async"
      onError={() => setCandidateIndex((current) => current + 1)}
    />
  );
};

export const WeightedSaleSelector = ({
  product,
  initialItem = null,
  onConfirm,
  onCancel,
  showHeader = true,
  confirmLabel = 'Agregar a mi funda',
  className = '',
}: Props) => {
  const config = useMemo(() => getWeightedProductConfig(product), [product]);
  const initialMode = normalizeSaleMode(
    initialItem?.saleMode || initialItem?.sale_mode,
    product,
  );

  const [mode, setMode] = useState(initialMode);
  const [weightValue, setWeightValue] = useState(
    initialItem
      ? initialItem?.requestedWeight ??
          initialItem?.requested_weight ??
          initialItem?.quantity ??
          config.defaultWeight
      : config.defaultWeight,
  );
  const [amountValue, setAmountValue] = useState(
    initialItem
      ? initialItem?.requestedAmount ??
          initialItem?.requested_amount ??
          config.defaultAmount
      : config.defaultAmount,
  );

  useEffect(() => {
    const nextMode = normalizeSaleMode(
      initialItem?.saleMode || initialItem?.sale_mode,
      product,
    );
    setMode(nextMode);
    setWeightValue(
      initialItem
        ? initialItem?.requestedWeight ??
            initialItem?.requested_weight ??
            initialItem?.quantity ??
            config.defaultWeight
        : config.defaultWeight,
    );
    setAmountValue(
      initialItem
        ? initialItem?.requestedAmount ??
            initialItem?.requested_amount ??
            config.defaultAmount
        : config.defaultAmount,
    );
  }, [
    product?.id,
    initialItem?.cartKey,
    initialItem?.cart_key,
    config.defaultAmount,
    config.defaultWeight,
  ]);

  const rawValue = mode === 'amount' ? amountValue : weightValue;
  const normalized =
    mode === 'amount'
      ? sanitizeAmount(rawValue, product)
      : sanitizeWeight(rawValue, product);
  const preview = buildWeightedCartItem(product, mode, normalized);

  const setCurrentValue = (value: string | number) => {
    if (mode === 'amount') setAmountValue(value);
    else setWeightValue(value);
  };

  const handleInputChange = (value: string) => {
    if (value === '') {
      setCurrentValue('');
      return;
    }
    if (mode === 'amount') {
      setAmountValue(roundPayableAmount(value));
      return;
    }
    const [whole, fraction = ''] = String(value).split('.');
    setWeightValue(fraction.length > 2 ? `${whole}.${fraction.slice(0, 2)}` : value);
  };

  const normalizeCurrentValue = () => {
    setCurrentValue(normalized);
  };

  const changeWeightByStep = (direction: -1 | 1) => {
    const currentWeight = sanitizeWeight(weightValue, product);
    const nextWeight = sanitizeWeight(
      currentWeight + direction * config.weightIncrement,
      product,
    );
    setWeightValue(nextWeight);
  };

  const changeMode = (nextMode: 'weight' | 'amount') => {
    if (nextMode === mode) return;
    if (nextMode === 'weight') setWeightValue(config.defaultWeight);
    else setAmountValue(config.defaultAmount);
    setMode(nextMode);
  };

  const availableModes = [
    config.allowWeightSales ? 'weight' : null,
    config.allowAmountSales ? 'amount' : null,
  ].filter(Boolean) as Array<'weight' | 'amount'>;

  return (
    <div className={`space-y-4 ${className}`}>
      {showHeader && onCancel && (
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate pt-1 text-sm font-black text-gray-900">
            {product?.name || 'Producto por libra'}
          </p>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
            aria-label="Cerrar"
          >
            <FiX />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#00a884]/15 bg-[#eafaf1] px-4 py-3">
        <p className="text-[9px] font-black uppercase tracking-[.16em] text-[#008f72]/70">
          Precio
        </p>
        <p className="shrink-0 text-lg font-black text-[#00a884] lg:text-2xl">
          {formatProductPrice(product)}
        </p>
      </div>

      <div
        className="rounded-2xl border border-gray-200 bg-gray-100 p-1"
        role="tablist"
        aria-label="Modalidad de compra"
      >
        <div
          className={`grid gap-1 ${availableModes.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
        >
          {config.allowWeightSales && (
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'weight'}
              onClick={() => changeMode('weight')}
              className={`rounded-xl px-4 py-2.5 text-sm font-black transition-all ${
                mode === 'weight'
                  ? 'bg-white text-[#008f72] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Libra
            </button>
          )}
          {config.allowAmountSales && (
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'amount'}
              onClick={() => changeMode('amount')}
              className={`rounded-xl px-4 py-2.5 text-sm font-black transition-all ${
                mode === 'amount'
                  ? 'bg-white text-[#008f72] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Monto
            </button>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-gray-50/80 p-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="min-w-0 text-base font-black leading-tight text-gray-900 lg:text-lg">
            Introduce la cantidad
          </h4>

          {mode === 'weight' ? (
            <div className="flex h-12 shrink-0 items-center overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm focus-within:border-[#00a884] focus-within:ring-2 focus-within:ring-[#00a884]/10">
              <button
                type="button"
                onClick={() => changeWeightByStep(-1)}
                disabled={normalized <= config.minimumWeight}
                className="flex h-full w-11 items-center justify-center border-r border-gray-100 text-gray-500 transition-colors hover:bg-gray-50 hover:text-[#00a884] active:scale-95 disabled:cursor-not-allowed disabled:text-gray-300"
                aria-label="Quitar un cuarto de libra"
              >
                <FiMinus />
              </button>
              <div className="flex h-full items-center gap-1.5 px-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={config.minimumWeight}
                  step={config.weightIncrement}
                  value={rawValue}
                  onChange={(event) => handleInputChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (['e', 'E', '+', '-'].includes(event.key)) {
                      event.preventDefault();
                    }
                  }}
                  onBlur={normalizeCurrentValue}
                  onWheel={(event) => event.currentTarget.blur()}
                  className="w-14 bg-transparent text-center text-lg font-black text-gray-900 outline-none"
                  aria-label="Cantidad de libras"
                />
                <span className="text-xs font-black text-[#00a884]">
                  {config.weightUnit}
                </span>
              </div>
              <button
                type="button"
                onClick={() => changeWeightByStep(1)}
                className="flex h-full w-11 items-center justify-center border-l border-gray-100 bg-[#eafaf1] text-[#00a884] transition-colors hover:bg-[#ddf7e9] active:scale-95"
                aria-label="Agregar un cuarto de libra"
              >
                <FiPlus />
              </button>
            </div>
          ) : (
            <div className="flex h-12 w-[9.5rem] shrink-0 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 shadow-sm focus-within:border-[#00a884] focus-within:ring-2 focus-within:ring-[#00a884]/10 lg:w-[11rem]">
              <span className="text-sm font-black text-[#00a884]">RD$</span>
              <input
                type="number"
                inputMode="numeric"
                min={config.minimumAmount}
                step="1"
                value={rawValue}
                onChange={(event) => handleInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (['.', ',', 'e', 'E', '+', '-'].includes(event.key)) {
                    event.preventDefault();
                  }
                }}
                onBlur={normalizeCurrentValue}
                onWheel={(event) => event.currentTarget.blur()}
                className="min-w-0 flex-1 bg-transparent text-center text-lg font-black text-gray-900 outline-none"
                aria-label="Monto que quieres comprar"
              />
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[#bce8d1] bg-[#f2fcf7] px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[.12em] text-[#008f72]/70">
            {mode === 'amount'
              ? preview.weightIsExact
                ? 'Peso'
                : 'Peso aproximado'
              : 'Total'}
          </p>
          <p className="text-base font-black text-[#008f72]">
            {mode === 'amount'
              ? formatAmountWeight(
                  preview.estimatedWeight,
                  preview.weightIsExact,
                  config.weightUnit,
                )
              : `RD$ ${money(preview.lineTotal)}`}
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl bg-gray-100 px-4 py-3.5 text-sm font-black"
          >
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={() => onConfirm(preview)}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#00a884] px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-[#00a884]/20 transition-colors hover:bg-[#009676]"
        >
          <FiCheck />
          {confirmLabel}
        </button>
      </div>
    </div>
  );
};

export const WeightedSaleModal = ({
  product,
  initialItem = null,
  onConfirm,
  onCancel,
  confirmLabel = 'Agregar',
}: Props) => (
  <div className="fixed inset-0 z-[120] flex items-end justify-center lg:items-center lg:p-6">
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    />
    <div className="relative max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-[1.75rem] bg-white shadow-2xl scrollbar-hide lg:rounded-[2rem]">
      <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(17rem,0.9fr)_minmax(0,1.35fr)]">
        <div className="border-b border-gray-100 bg-gray-50/70 p-5 lg:border-b-0 lg:border-r lg:p-7">
          <div className="flex h-48 items-center justify-center overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm sm:h-56 lg:sticky lg:top-7 lg:h-[26rem]">
            <WeightedProductImage product={product} />
          </div>
        </div>

        <div className="p-5 lg:p-7">
          <WeightedSaleSelector
            product={product}
            initialItem={initialItem}
            onConfirm={onConfirm}
            onCancel={onCancel}
            confirmLabel={confirmLabel}
          />
        </div>
      </div>
    </div>
  </div>
);

export default WeightedSaleSelector;
