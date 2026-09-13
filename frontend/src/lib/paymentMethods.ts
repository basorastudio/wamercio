export const PAYMENT_METHODS = [
  { key: "cash", label: "Efectivo" },
  { key: "card", label: "Tarjeta en terminal" },
  { key: "bank_transfer", label: "Transferencia manual" },
  { key: "store_credit", label: "Fiado" },
] as const;

export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number]["key"];

const PAYMENT_METHOD_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map(({ key, label }) => [key, label]),
);

export const paymentMethodLabel = (method: unknown): string => {
  const key = String(method || "").trim();
  return PAYMENT_METHOD_LABELS[key] || key || "Pago";
};
