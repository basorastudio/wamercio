export const normalizeSaleFinancialStatus = (sale: any): string =>
  String(sale?.financialStatus || sale?.financial_status || "completed")
    .trim()
    .toLowerCase();

export const saleReturnedAmount = (sale: any): number =>
  Math.max(
    0,
    Number(sale?.returnedAmount ?? sale?.returned_amount ?? 0) || 0,
  );

export const saleNetTotal = (sale: any): number => {
  const explicit = Number(sale?.netTotal ?? sale?.net_total);
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  return Math.max(0, Number(sale?.total || 0) - saleReturnedAmount(sale));
};

export const isVoidedSale = (sale: any): boolean =>
  normalizeSaleFinancialStatus(sale) === "voided";

export const isFullyReturnedSale = (sale: any): boolean =>
  normalizeSaleFinancialStatus(sale) === "returned";

export const isRevenueSale = (sale: any): boolean =>
  !isVoidedSale(sale) && saleNetTotal(sale) > 0.009;

export const isProductAnalyticsSale = (sale: any): boolean =>
  !["voided", "returned"].includes(normalizeSaleFinancialStatus(sale));

export const saleFinancialLabel = (sale: any): string => {
  switch (normalizeSaleFinancialStatus(sale)) {
    case "voided":
      return "Anulada";
    case "partially_returned":
      return "Devolución parcial";
    case "returned":
      return "Devuelta";
    default:
      return "Completada";
  }
};

export const saleRecognitionRatio = (sale: any): number => {
  const gross = Math.max(0, Number(sale?.total || 0));
  if (gross <= 0.009) return 0;
  return Math.min(1, Math.max(0, saleNetTotal(sale) / gross));
};
