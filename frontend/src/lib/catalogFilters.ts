export const normalizeCatalogText = (value: any = ''): string =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const catalogSearchWords = (value: any = ''): string[] =>
  normalizeCatalogText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

const compactCatalogSearchValue = (value: any = ''): string =>
  normalizeCatalogText(value).replace(/[^a-z0-9]+/g, '');

const tokenMatches = (queryWord: string, fieldWord: string): boolean => {
  if (!queryWord || !fieldWord) return false;
  // Numeric quantities must match the complete token. This prevents a search
  // such as "5 lb" from returning products marked as "50 lb".
  if (/^\d+$/.test(queryWord)) return fieldWord === queryWord;
  return fieldWord.startsWith(queryWord);
};

const allWordsMatch = (queryWords: string[], fieldWords: string[]): boolean =>
  queryWords.length > 0 &&
  queryWords.every((queryWord) =>
    fieldWords.some((fieldWord) => tokenMatches(queryWord, fieldWord)),
  );

const sameWordSet = (left: string[], right: string[]): boolean => {
  const normalizedLeft = [...new Set(left)].sort();
  const normalizedRight = [...new Set(right)].sort();
  return normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((word, index) => word === normalizedRight[index]);
};

export const sameCatalogName = (a: any, b: any): boolean => normalizeCatalogText(a) === normalizeCatalogText(b);

export const catalogValue = (item: any, ...keys: string[]): string => {
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  for (const key of keys) {
    const value = metadata?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
};

export const getCatalogCategory = (product: any, fallback = 'Sin categoría'): string =>
  catalogValue(product, 'category', 'category_name', 'categoryName', 'sourceCategory') || fallback;

export const getCatalogGroup = (product: any): string =>
  catalogValue(product, 'group', 'group_name', 'groupName', 'sourceSubCategory');

export const getCatalogDetail = (product: any): string =>
  catalogValue(product, 'detail', 'detail_name', 'detailName', 'sourceSubCategory2');

export const getCatalogBrand = (product: any): string =>
  catalogValue(product, 'brand', 'brand_name', 'brandName');

export const getCatalogBarcode = (product: any): string =>
  catalogValue(product, 'barcode', 'code', 'sku');

export const getCatalogDescription = (product: any): string =>
  catalogValue(product, 'description', 'descripcion');

export const uniqueSortedCatalogValues = (values: any[]): string[] =>
  [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));

/**
 * Scores direct product identity matches.
 *
 * Product search intentionally uses only name, brand and identifying codes.
 * Category, group, detail and description are excluded because those fields
 * make sibling or merely related products appear when the user is looking for
 * one specific item.
 */
export const getCatalogProductSearchScore = (product: any, query: string): number => {
  const queryWords = catalogSearchWords(query);
  if (queryWords.length === 0) return 0;

  const name = catalogValue(product, 'name', 'product_name', 'productName');
  const brand = getCatalogBrand(product);
  const barcode = getCatalogBarcode(product);
  const sku = catalogValue(product, 'sku', 'code');

  const nameWords = catalogSearchWords(name);
  const brandWords = catalogSearchWords(brand);
  const identityWords = [...nameWords, ...brandWords];
  const normalizedQuery = queryWords.join(' ');
  const normalizedName = nameWords.join(' ');
  const normalizedBrand = brandWords.join(' ');
  const normalizedNameBrand = [...nameWords, ...brandWords].join(' ');
  const normalizedBrandName = [...brandWords, ...nameWords].join(' ');

  const compactQuery = compactCatalogSearchValue(query);
  const codeValues = [barcode, sku]
    .map(compactCatalogSearchValue)
    .filter(Boolean);

  if (compactQuery && codeValues.some((value) => value === compactQuery)) return 2200;
  if (normalizedName === normalizedQuery) return 2100;
  if (
    normalizedNameBrand === normalizedQuery ||
    normalizedBrandName === normalizedQuery ||
    sameWordSet(queryWords, identityWords)
  ) return 2050;

  if (compactQuery.length >= 4 && codeValues.some((value) => value.startsWith(compactQuery))) return 1900;
  if (normalizedName.startsWith(normalizedQuery)) return 1800;
  if (normalizedName.includes(` ${normalizedQuery}`)) return 1750;
  if (allWordsMatch(queryWords, nameWords)) return 1650 + Math.min(queryWords.length, 25);

  if (normalizedBrand === normalizedQuery) return 1550;
  if (allWordsMatch(queryWords, identityWords)) return 1500 + Math.min(queryWords.length, 25);

  return -1;
};

export const matchesCatalogProductSearch = (product: any, query: string): boolean =>
  getCatalogProductSearchScore(product, query) >= 0;

export const filterCatalogProducts = (
  products: any[] = [],
  {
    search = '',
    category = '',
    group = '',
    detail = '',
  }: { search?: string; category?: string; group?: string; detail?: string } = {},
): any[] => {
  const cleanSearch = String(search || '').trim();
  const filtered = (Array.isArray(products) ? products : []).filter((product) => {
    if (category && !sameCatalogName(getCatalogCategory(product), category)) return false;
    if (group && !sameCatalogName(getCatalogGroup(product), group)) return false;
    if (detail && !sameCatalogName(getCatalogDetail(product), detail)) return false;
    if (cleanSearch && !matchesCatalogProductSearch(product, cleanSearch)) return false;
    return true;
  });

  if (!cleanSearch) return filtered;

  const ranked = filtered
    .map((product, originalIndex) => ({
      product,
      originalIndex,
      score: getCatalogProductSearchScore(product, cleanSearch),
      name: normalizeCatalogText(catalogValue(product, 'name', 'product_name', 'productName')),
    }))
    .sort((a, b) =>
      b.score - a.score ||
      a.name.localeCompare(b.name, 'es') ||
      a.originalIndex - b.originalIndex,
    );

  // When the entered value identifies an exact product or exact code, do not
  // keep looser partial matches in the result set. This is what makes a search
  // for a complete product name return only that product.
  const bestScore = ranked[0]?.score ?? -1;
  const exactMatches = bestScore >= 2050
    ? ranked.filter(({ score }) => score === bestScore)
    : [];
  return (exactMatches.length > 0 ? exactMatches : ranked).map(({ product }) => product);
};

export const countCatalogProducts = (products: any[] = [], predicate: (product: any) => boolean): number =>
  (Array.isArray(products) ? products : []).filter(predicate).length;
