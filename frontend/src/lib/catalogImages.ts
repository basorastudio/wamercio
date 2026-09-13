const DEFAULT_CATALOG_IMAGE_BASE_URL = process.env.NEXT_PUBLIC_CATALOG_IMAGE_BASE_URL || 'https://catalogo.ltd.do/';

const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, '');

const normalizeTextForPath = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const slugifyCatalogSegment = (value: unknown) =>
  normalizeTextForPath(value)
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const catalogValue = (item: any, ...keys: string[]) => {
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
};

const CATALOG_IMAGE_PATH_ALIASES: Array<[string, string]> = [
  ['/quesos-y-embutidos/complementos-deli/', '/quesos-y-embutidos/delicateces/'],
  ['/quesos-y-embutidos/complementos/', '/quesos-y-embutidos/delicateces/'],
  ['/despensa/conservas-enlatados-y-aceitunas/conservas-de-pescado-marisco/', '/despensa/conservas-enlatados-y-aceitunas/conservas-de-pescado-y-marisco/'],
  ['/despensa/conservas-enlatados-y-aceitunas/conserva-vegetales-legumbres/', '/despensa/conservas-enlatados-y-aceitunas/conserva-vegetales-y-legumbres/'],
  ['/bebidas/refrescos-y-energizantes/mixers-soda-tonica2c-entre-otros/', '/bebidas/refrescos-y-energizantes/mixers-soda-tonicas-entre-otros/'],
];

const normalizeCatalogPath = (value: string) => {
  let normalized = String(value || '').trim().replace(/\\/g, '/');

  normalized = normalized.replace(/^\/?catalogo\//i, '');
  normalized = normalized.replace(/^\/?images\//i, '');
  normalized = normalized.replace(/\/+/g, '/');

  for (const [from, to] of CATALOG_IMAGE_PATH_ALIASES) {
    if (normalized.includes(from)) normalized = normalized.replace(from, to);
    const fromWithoutLeading = from.replace(/^\//, '');
    const toWithoutLeading = to.replace(/^\//, '');
    if (normalized.includes(fromWithoutLeading)) normalized = normalized.replace(fromWithoutLeading, toWithoutLeading);
  }

  return normalized;
};

export const normalizeCatalogImageUrl = (value: unknown, baseUrl = DEFAULT_CATALOG_IMAGE_BASE_URL) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;

  if (raw.startsWith('//')) return normalizeCatalogImageUrl(`https:${raw}`, baseUrl);

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.hostname === 'catalogo.ltd.do') {
        const cleanPath = normalizeCatalogPath(decodeURIComponent(url.pathname));
        return `${url.protocol}//${url.host}/${trimSlashes(cleanPath)}`;
      }
      return raw;
    } catch (_) {
      return raw;
    }
  }

  if (raw.startsWith('/')) {
    const cleanPath = normalizeCatalogPath(raw);
    return `${baseUrl.replace(/\/+$/, '')}/${trimSlashes(cleanPath)}`;
  }

  const cleanPath = normalizeCatalogPath(raw);
  return `${baseUrl.replace(/\/+$/, '')}/${trimSlashes(cleanPath)}`;
};

const addExtensionFallbacks = (url: string) => {
  if (!url || !url.includes('catalogo.ltd.do')) return [];
  const match = url.match(/^(.*)\.(jpg|jpeg|png|webp)$/i);
  if (!match) return [];
  const [, base, ext] = match;
  return ['jpg', 'jpeg', 'png', 'webp']
    .filter((candidateExt) => candidateExt.toLowerCase() !== ext.toLowerCase())
    .map((candidateExt) => `${base}.${candidateExt}`);
};

const folderAliasFallbacks = (url: string) => {
  if (!url || !url.includes('catalogo.ltd.do')) return [];
  const fallbacks: string[] = [];
  for (const [from, to] of CATALOG_IMAGE_PATH_ALIASES) {
    if (url.includes(from)) fallbacks.push(url.replace(from, to));
  }
  return fallbacks;
};

const inferredCatalogImageFromProduct = (item: any) => {
  const filenameSource = catalogValue(item, 'image', 'image_source_url', 'imageSourceUrl', 'metadata.image', 'metadata.imageSourceUrl');
  const filename = String(filenameSource || '').split('/').pop()?.trim();
  if (!filename) return '';

  const category = slugifyCatalogSegment(catalogValue(item, 'sourceCategory', 'category_name', 'categoryName', 'category'));
  let group = slugifyCatalogSegment(catalogValue(item, 'sourceSubCategory', 'group_name', 'groupName', 'group'));

  if (category === 'quesos-y-embutidos' && normalizeTextForPath(group).includes('complementos')) {
    group = 'delicateces';
  }

  if (!category || !group) return '';
  return `${category}/${group}/${filename}`;
};

export const catalogImageCandidates = (item: any, baseUrl = DEFAULT_CATALOG_IMAGE_BASE_URL) => {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const add = (value: unknown, withExtensionFallbacks = true) => {
    const normalized = normalizeCatalogImageUrl(value, baseUrl);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);

    for (const fallback of folderAliasFallbacks(normalized)) {
      if (!seen.has(fallback)) {
        seen.add(fallback);
        candidates.push(fallback);
      }
    }

    if (withExtensionFallbacks) {
      for (const fallback of addExtensionFallbacks(normalized)) {
        if (!seen.has(fallback)) {
          seen.add(fallback);
          candidates.push(fallback);
        }
      }
    }
  };

  add(catalogValue(item, 'image'));
  add(catalogValue(item, 'image_source_url', 'imageSourceUrl'));
  add(item?.metadata?.image);
  add(item?.metadata?.imageSourceUrl);
  add(inferredCatalogImageFromProduct(item));

  return candidates;
};

export const catalogImageUrl = (item: any, baseUrl = DEFAULT_CATALOG_IMAGE_BASE_URL) =>
  catalogImageCandidates(item, baseUrl)[0] || '';
