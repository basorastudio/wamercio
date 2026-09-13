import React, { useEffect, useMemo, useState } from 'react';
import { FiCheck, FiMinus, FiPlus, FiX } from 'react-icons/fi';
import {
  cartItemLineTotal,
  formatProductPrice,
  isWeightedProduct,
  roundMoney,
  sanitizeUnitQuantity,
} from '../lib/weightedProducts';
import {
  WeightedProductImage,
  WeightedSaleSelector,
} from './WeightedSaleSelector';

type Props = {
  product: any;
  initialItem?: any;
  onConfirm: (item: any) => void;
  onCancel: () => void;
  confirmLabel?: string;
};

const money = (value: any) =>
  roundMoney(value).toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const clampUnitQuantity = (value: any, availableStock: number) => {
  const normalized = sanitizeUnitQuantity(value);
  return availableStock > 0
    ? Math.min(normalized, availableStock)
    : normalized;
};

const UnitSaleSelector = ({
  product,
  initialItem,
  onConfirm,
  onCancel,
  confirmLabel,
}: Props) => {
  const availableStock = Math.max(0, Math.floor(Number(product?.stock || 0)));
  const initialQuantity = clampUnitQuantity(
    initialItem?.quantity || 1,
    availableStock,
  );
  const [quantityInput, setQuantityInput] = useState(String(initialQuantity));
  const quantity = quantityInput === '' ? 0 : Number(quantityInput);
  const hasValidQuantity =
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= 999 &&
    (availableStock <= 0 || quantity <= availableStock);

  useEffect(() => {
    setQuantityInput(
      String(clampUnitQuantity(initialItem?.quantity || 1, availableStock)),
    );
  }, [
    product?.id,
    initialItem?.cartKey,
    initialItem?.cart_key,
    initialItem?.quantity,
    availableStock,
  ]);

  const unitPrice = Number(
    product?.price || product?.unitPrice || product?.unit_price || 0,
  );
  const nextItem = useMemo(
    () => ({
      ...product,
      quantity,
      saleMode: 'unit',
      sale_mode: 'unit',
      unit: product?.unit || 'unidad',
      unitPrice,
      unit_price: unitPrice,
      lineTotal: unitPrice * quantity,
      line_total: unitPrice * quantity,
      cartKey: `${product?.id || ''}:unit`,
      cart_key: `${product?.id || ''}:unit`,
    }),
    [product, quantity, unitPrice],
  );

  const updateQuantity = (next: number) => {
    setQuantityInput(String(clampUnitQuantity(next, availableStock)));
  };

  const handleQuantityInput = (rawValue: string) => {
    const digitsOnly = rawValue.replace(/\D/g, '');
    if (digitsOnly === '') {
      setQuantityInput('');
      return;
    }

    const numericValue = Math.min(999, Number(digitsOnly));
    const cappedValue =
      availableStock > 0
        ? Math.min(numericValue, availableStock)
        : numericValue;
    setQuantityInput(String(cappedValue));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate pt-1 text-sm font-black text-gray-900 lg:text-base">
            {product?.name || 'Producto'}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-gray-400">
            {product?.category || 'Producto del negocio'}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
          aria-label="Cerrar"
        >
          <FiX />
        </button>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#00a884]/15 bg-[#eafaf1] px-4 py-3">
        <p className="text-[9px] font-black uppercase tracking-[.16em] text-[#008f72]/70">
          Precio
        </p>
        <p className="shrink-0 text-lg font-black text-[#00a884] lg:text-2xl">
          {formatProductPrice(product)}
        </p>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-gray-50/80 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-base font-black leading-tight text-gray-900 lg:text-lg">
              Selecciona la cantidad
            </h4>
            <p className="mt-1 text-[11px] font-semibold text-gray-400">
              {availableStock.toLocaleString('es-DO')} unidades disponibles
            </p>
          </div>

          <div className="flex h-12 shrink-0 items-center overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm focus-within:border-[#00a884] focus-within:ring-2 focus-within:ring-[#00a884]/10">
            <button
              type="button"
              onClick={() => updateQuantity(quantity - 1)}
              disabled={quantity <= 1}
              className="flex h-full w-11 items-center justify-center border-r border-gray-100 text-gray-500 transition-colors hover:bg-gray-50 hover:text-[#00a884] active:scale-95 disabled:cursor-not-allowed disabled:text-gray-300"
              aria-label="Quitar una unidad"
            >
              <FiMinus />
            </button>
            <div className="flex h-full items-center gap-1.5 px-2">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={availableStock || undefined}
                step={1}
                value={quantityInput}
                onChange={(event) => handleQuantityInput(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => {
                  if (['.', ',', 'e', 'E', '+', '-'].includes(event.key)) {
                    event.preventDefault();
                  }
                }}
                onWheel={(event) => event.currentTarget.blur()}
                className="w-14 bg-transparent text-center text-lg font-black text-gray-900 outline-none"
                aria-label="Cantidad de unidades"
              />
              <span className="text-xs font-black text-[#00a884]">u</span>
            </div>
            <button
              type="button"
              onClick={() => updateQuantity(quantity + 1)}
              disabled={availableStock > 0 && quantity >= availableStock}
              className="flex h-full w-11 items-center justify-center border-l border-gray-100 bg-[#eafaf1] text-[#00a884] transition-colors hover:bg-[#ddf7e9] active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-300"
              aria-label="Agregar una unidad"
            >
              <FiPlus />
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[#bce8d1] bg-[#f2fcf7] px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[.12em] text-[#008f72]/70">
            Total
          </p>
          <p className="text-base font-black text-[#008f72]">
            RD$ {money(cartItemLineTotal(nextItem))}
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-2xl bg-gray-100 px-4 py-3.5 text-sm font-black"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onConfirm(nextItem)}
          disabled={availableStock <= 0 || !hasValidQuantity}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#00a884] px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-[#00a884]/20 transition-colors hover:bg-[#009676] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FiCheck />
          {confirmLabel || 'Agregar a la venta'}
        </button>
      </div>
    </div>
  );
};

const PosProductSaleModal = ({
  product,
  initialItem = null,
  onConfirm,
  onCancel,
  confirmLabel = 'Agregar a la venta',
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
          {isWeightedProduct(product) ? (
            <WeightedSaleSelector
              product={product}
              initialItem={initialItem}
              onConfirm={onConfirm}
              onCancel={onCancel}
              confirmLabel={confirmLabel}
            />
          ) : (
            <UnitSaleSelector
              product={product}
              initialItem={initialItem}
              onConfirm={onConfirm}
              onCancel={onCancel}
              confirmLabel={confirmLabel}
            />
          )}
        </div>
      </div>
    </div>
  </div>
);

export default PosProductSaleModal;
