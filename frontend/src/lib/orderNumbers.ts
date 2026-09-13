const cleanOrderId = (value: any) => String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

const toSixCharacterOrderCode = (value: any, fallbackIndex?: number) => {
  const clean = cleanOrderId(value);
  if (clean) return clean.length > 6 ? clean.slice(-6) : clean.padStart(6, '0');
  return String((fallbackIndex ?? 0) + 1).padStart(6, '0');
};

export const getOrderDisplayNumber = (order: any = {}, index?: number) => {
  const explicit =
    order.orderNumber ||
    order.order_number ||
    order.code ||
    '';

  if (explicit) return `#${toSixCharacterOrderCode(explicit, index)}`;

  return `#${toSixCharacterOrderCode(order.id || order.saleId || order.sale_id || '', index)}`;
};

export default getOrderDisplayNumber;
