export const DEFAULT_WEIGHT_UNIT = 'lb';
export const DEFAULT_MINIMUM_WEIGHT = 0.25;
export const DEFAULT_WEIGHT_INCREMENT = 0.25;
export const DEFAULT_INITIAL_WEIGHT = 1;
export const DEFAULT_MINIMUM_AMOUNT = 20;
export const DEFAULT_WEIGHT_PRECISION = 2;

const asObject = (value: any): Record<string, any> =>
  value && typeof value === 'object' ? value : {};

const num = (value: any, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const bool = (value: any, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'si', 'sí', 'on', 'enabled', 'activo'].includes(
    String(value).toLowerCase().trim(),
  );
};

export const normalizedText = (value: any) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

// Unit prices can retain cents internally. Payable totals are always whole pesos.
export const roundMoney = (value: any) =>
  Math.round((num(value) + Number.EPSILON) * 100) / 100;

// Dominican cash rounding used by WAMERCIO: < .50 goes down, >= .50 goes up.
export const roundPayableAmount = (value: any) =>
  Math.round(num(value) + Number.EPSILON);

export const roundWeight = (
  value: any,
  precision = DEFAULT_WEIGHT_PRECISION,
) => {
  const safe = Math.min(
    DEFAULT_WEIGHT_PRECISION,
    Math.max(0, Math.floor(num(precision, DEFAULT_WEIGHT_PRECISION))),
  );
  const factor = 10 ** safe;
  return Math.round((num(value) + Number.EPSILON) * factor) / factor;
};

const productUnitPrice = (product: any = {}) => {
  const source = asObject(product);
  return roundMoney(source.price ?? source.unitPrice ?? source.unit_price ?? 0);
};

/**
 * The smallest cash amount accepted for a product sold by the pound is the
 * payable equivalent of a quarter pound. Cash amounts remain whole pesos.
 */
export const minimumAmountForProduct = (product: any = {}) => {
  const unitPrice = productUnitPrice(product);
  if (unitPrice <= 0) return DEFAULT_MINIMUM_AMOUNT;
  return Math.max(
    1,
    roundPayableAmount(unitPrice * DEFAULT_MINIMUM_WEIGHT),
  );
};

/**
 * A new amount-mode selection starts at the price of one pound. When the unit
 * price contains cents, the cash amount follows the same whole-peso rule used
 * by the rest of WAMERCIO.
 */
export const defaultAmountForProduct = (product: any = {}) => {
  const unitPrice = productUnitPrice(product);
  const minimumAmount = minimumAmountForProduct(product);
  return Math.max(
    minimumAmount,
    unitPrice > 0 ? roundPayableAmount(unitPrice) : DEFAULT_MINIMUM_AMOUNT,
  );
};

export const getWeightedProductConfig = (product: any = {}) => {
  const source = asObject(product);
  const weighted = bool(
    source.weightedSaleEnabled ?? source.weighted_sale_enabled,
    normalizedText(source.format) === 'libra',
  );

  return {
    weightedSaleEnabled: weighted,
    allowWeightSales: bool(
      source.allowWeightSales ?? source.allow_weight_sales,
      weighted,
    ),
    allowAmountSales: bool(
      source.allowAmountSales ?? source.allow_amount_sales,
      weighted,
    ),
    weightUnit:
      String(source.weightUnit || source.weight_unit || DEFAULT_WEIGHT_UNIT).trim() ||
      DEFAULT_WEIGHT_UNIT,
    minimumWeight: DEFAULT_MINIMUM_WEIGHT,
    weightIncrement: DEFAULT_WEIGHT_INCREMENT,
    defaultWeight: DEFAULT_INITIAL_WEIGHT,
    minimumAmount: minimumAmountForProduct(source),
    defaultAmount: defaultAmountForProduct(source),
    weightPrecision: DEFAULT_WEIGHT_PRECISION,
  };
};

export const isWeightedProduct = (product: any = {}) =>
  getWeightedProductConfig(product).weightedSaleEnabled;

export const normalizeSaleMode = (value: any, product: any = {}) => {
  const config = getWeightedProductConfig(product);
  const mode = normalizedText(value);
  if (['amount', 'monto'].includes(mode)) {
    return config.allowAmountSales ? 'amount' : 'weight';
  }
  if (['weight', 'peso', 'libra'].includes(mode)) {
    return config.allowWeightSales ? 'weight' : 'amount';
  }
  return config.allowWeightSales ? 'weight' : 'amount';
};

export const sanitizeUnitQuantity = (value: any) =>
  Math.min(999, Math.max(1, Math.floor(num(value, 1))));

export const sanitizeWeight = (value: any, product: any = {}) => {
  const config = getWeightedProductConfig(product);
  const raw = Math.max(config.minimumWeight, num(value, config.minimumWeight));
  const steps = Math.round((raw + Number.EPSILON) / config.weightIncrement);
  return roundWeight(
    Math.max(config.minimumWeight, steps * config.weightIncrement),
    config.weightPrecision,
  );
};

export const sanitizeAmount = (value: any, product: any = {}) => {
  const config = getWeightedProductConfig(product);
  return Math.max(
    roundPayableAmount(config.minimumAmount),
    roundPayableAmount(value),
  );
};

/**
 * Converts a whole-peso amount into its commercial weight equivalent.
 *
 * When the requested amount matches the payable price of an exact quarter
 * pound after Dominican cash rounding, the canonical quarter-pound value is
 * returned and can be shown as a common fraction. Otherwise the weight keeps
 * a two-decimal representation so an approximate amount is never presented
 * as though it were an exact fraction.
 *
 * Examples at RD$75/lb:
 *   RD$19 -> 0.25 lb (exact)
 *   RD$38 -> 0.50 lb (exact)
 *   RD$37 -> 0.49 lb (approximate)
 *   RD$55 -> 0.73 lb (approximate)
 */
export const getAmountWeightBreakdown = (
  amount: any,
  product: any = {},
) => {
  const config = getWeightedProductConfig(product);
  const requestedAmount = sanitizeAmount(amount, product);
  const unitPrice = productUnitPrice(product);

  if (unitPrice <= 0) {
    return {
      amount: requestedAmount,
      weight: 0,
      exact: false,
    };
  }

  const rawWeight = Math.max(
    config.minimumWeight,
    requestedAmount / unitPrice,
  );
  const quarterWeight = sanitizeWeight(rawWeight, product);
  const payableForQuarter = roundPayableAmount(unitPrice * quarterWeight);
  const exact = payableForQuarter === requestedAmount;
  const weight = exact
    ? quarterWeight
    : roundWeight(rawWeight, config.weightPrecision);

  return {
    amount: requestedAmount,
    weight,
    exact,
  };
};

export const isExactAmountWeight = (amount: any, product: any = {}) =>
  getAmountWeightBreakdown(amount, product).exact;

export const buildWeightedCartItem = (
  product: any,
  mode: string,
  value: any,
) => {
  const source = asObject(product);
  const config = getWeightedProductConfig(source);
  const saleMode = normalizeSaleMode(mode, source);
  const unitPrice = productUnitPrice(source);

  if (saleMode === 'amount') {
    const breakdown = getAmountWeightBreakdown(value, source);
    return {
      ...source,
      saleMode: 'amount',
      sale_mode: 'amount',
      unit: config.weightUnit,
      unitPrice,
      unit_price: unitPrice,
      requestedAmount: breakdown.amount,
      requested_amount: breakdown.amount,
      requestedWeight: breakdown.weight,
      requested_weight: breakdown.weight,
      estimatedWeight: breakdown.weight,
      estimated_weight: breakdown.weight,
      weightIsExact: breakdown.exact,
      weight_is_exact: breakdown.exact,
      quantity: breakdown.weight,
      lineTotal: breakdown.amount,
      line_total: breakdown.amount,
      cartKey: `${source.id}:amount`,
      cart_key: `${source.id}:amount`,
    };
  }

  const weight = sanitizeWeight(value, source);
  const total = roundPayableAmount(unitPrice * weight);
  return {
    ...source,
    saleMode: 'weight',
    sale_mode: 'weight',
    unit: config.weightUnit,
    unitPrice,
    unit_price: unitPrice,
    requestedAmount: total,
    requested_amount: total,
    requestedWeight: weight,
    requested_weight: weight,
    estimatedWeight: weight,
    estimated_weight: weight,
    weightIsExact: true,
    weight_is_exact: true,
    quantity: weight,
    lineTotal: total,
    line_total: total,
    cartKey: `${source.id}:weight`,
    cart_key: `${source.id}:weight`,
  };
};

export const cartItemKey = (item: any = {}) => {
  const source = asObject(item);
  const mode = isWeightedProduct(source)
    ? normalizeSaleMode(source.saleMode || source.sale_mode, source)
    : 'unit';
  return String(source.cartKey || source.cart_key || `${source.id || ''}:${mode}`);
};

export const cartItemLineTotal = (item: any = {}) => {
  const source = asObject(item);
  const weighted = isWeightedProduct(source);
  const stored = source.lineTotal ?? source.line_total;

  if (weighted && Number.isFinite(Number(stored))) {
    return roundPayableAmount(stored);
  }
  if (
    weighted &&
    normalizeSaleMode(source.saleMode || source.sale_mode, source) === 'amount'
  ) {
    return roundPayableAmount(source.requestedAmount ?? source.requested_amount);
  }
  if (weighted) {
    return roundPayableAmount(
      num(source.unitPrice ?? source.unit_price ?? source.price) *
        num(source.quantity, 1),
    );
  }
  if (Number.isFinite(Number(stored))) return roundMoney(stored);
  return roundMoney(
    num(source.unitPrice ?? source.unit_price ?? source.price) *
      num(source.quantity, 1),
  );
};

export const cartItemInventoryQuantity = (item: any = {}) => {
  const source = asObject(item);
  if (!isWeightedProduct(source)) return sanitizeUnitQuantity(source.quantity);
  const config = getWeightedProductConfig(source);
  return roundWeight(
    source.requestedWeight ??
      source.requested_weight ??
      source.estimatedWeight ??
      source.estimated_weight ??
      source.quantity,
    config.weightPrecision,
  );
};

const COMMON_WEIGHT_FRACTIONS: Record<number, string> = {
  1: '¼',
  2: '½',
  3: '¾',
};

/**
 * Converts the stored decimal weight into the most natural commercial
 * representation for customers. Quarter-pound values are shown as common
 * fractions or mixed numbers; other valid values remain decimal.
 *
 * Examples: 0.25 -> ¼, 1.5 -> 1 ½, 1.51 -> 1.51.
 */
export const formatWeightValue = (
  value: any,
  max = DEFAULT_WEIGHT_PRECISION,
) => {
  const precision = Math.min(
    DEFAULT_WEIGHT_PRECISION,
    Math.max(0, Math.floor(num(max, DEFAULT_WEIGHT_PRECISION))),
  );
  const amount = roundWeight(value, precision);

  // A quarter-pound is represented exactly by an integer after multiplying
  // by four. The tolerance prevents floating-point noise from leaking into
  // the customer-facing label.
  const quarterUnits = Math.round(amount * 4);
  const quarterValue = quarterUnits / 4;
  const isExactQuarter = Math.abs(amount - quarterValue) < 0.000001;

  if (isExactQuarter) {
    const whole = Math.floor(quarterUnits / 4);
    const remainder = ((quarterUnits % 4) + 4) % 4;
    const wholeLabel = whole.toLocaleString('es-DO', {
      maximumFractionDigits: 0,
    });

    if (remainder === 0) return wholeLabel;

    const fractionLabel = COMMON_WEIGHT_FRACTIONS[remainder];
    return whole > 0 ? `${wholeLabel} ${fractionLabel}` : fractionLabel;
  }

  return amount.toLocaleString('es-DO', {
    maximumFractionDigits: precision,
  });
};

export const formatWeight = (
  value: any,
  unit = DEFAULT_WEIGHT_UNIT,
  max = DEFAULT_WEIGHT_PRECISION,
) => `${formatWeightValue(value, max)} ${unit}`;

/**
 * Formats an approximate weight strictly as a decimal. This intentionally
 * bypasses the common-fraction formatter so values that do not correspond to
 * an exact payable quarter pound cannot look exact to the customer.
 */
export const formatDecimalWeight = (
  value: any,
  unit = DEFAULT_WEIGHT_UNIT,
  digits = DEFAULT_WEIGHT_PRECISION,
) => {
  const precision = Math.min(
    DEFAULT_WEIGHT_PRECISION,
    Math.max(0, Math.floor(num(digits, DEFAULT_WEIGHT_PRECISION))),
  );
  const amount = roundWeight(value, precision);
  return `${amount.toLocaleString('es-DO', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })} ${unit}`;
};

export const formatAmountWeight = (
  value: any,
  exact: boolean,
  unit = DEFAULT_WEIGHT_UNIT,
) =>
  exact
    ? formatWeight(value, unit, DEFAULT_WEIGHT_PRECISION)
    : formatDecimalWeight(value, unit, DEFAULT_WEIGHT_PRECISION);

export const formatCartItemMeasure = (item: any = {}) => {
  const source = asObject(item);
  if (!isWeightedProduct(source)) {
    const quantity = sanitizeUnitQuantity(source.quantity);
    return `${quantity} unidad${quantity === 1 ? '' : 'es'}`;
  }
  const config = getWeightedProductConfig(source);
  const weight = cartItemInventoryQuantity(source);
  const mode = normalizeSaleMode(source.saleMode || source.sale_mode, source);
  if (mode !== 'amount') {
    return formatWeight(weight, config.weightUnit, DEFAULT_WEIGHT_PRECISION);
  }

  const requestedAmount = roundPayableAmount(
    source.requestedAmount ??
      source.requested_amount ??
      cartItemLineTotal(source),
  );
  const exact = bool(
    source.weightIsExact ?? source.weight_is_exact,
    isExactAmountWeight(requestedAmount, source),
  );
  const weightLabel = formatAmountWeight(
    weight,
    exact,
    config.weightUnit,
  );

  return exact
    ? `RD$ ${requestedAmount.toLocaleString('es-DO')} · ${weightLabel}`
    : `RD$ ${requestedAmount.toLocaleString('es-DO')} · aprox. ${weightLabel}`;
};

export const formatProductPrice = (product: any = {}) => {
  const source = asObject(product);
  const price = roundMoney(
    source.price ?? source.unitPrice ?? source.unit_price ?? 0,
  ).toLocaleString('es-DO', {
    maximumFractionDigits: 2,
  });
  return `RD$ ${price}${
    isWeightedProduct(source)
      ? ` / ${getWeightedProductConfig(source).weightUnit}`
      : ''
  }`;
};
