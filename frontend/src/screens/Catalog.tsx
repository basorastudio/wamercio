import React, { useMemo, useRef, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import BarcodeScanner, { isBarcodeQuery } from '../components/BarcodeScanner';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import { useDesktopHeader } from '../layouts/DesktopHeaderContext';
import ShareAppModal from '../components/ShareAppModal';
import { catalogImageCandidates } from '../lib/catalogImages';
import { WeightedSaleSelector } from '../components/WeightedSaleSelector';
import {
  cartItemInventoryQuantity,
  cartItemKey,
  formatCartItemMeasure,
  formatProductPrice,
  formatWeight,
  isWeightedProduct,
} from '../lib/weightedProducts';
import {
  filterCatalogProducts,
  getCatalogCategory,
  getCatalogDetail,
  getCatalogGroup,
  sameCatalogName,
  uniqueSortedCatalogValues,
} from '../lib/catalogFilters';

const {
  FiShare2, FiList, FiGrid, FiSearch, FiX, FiCamera, FiSend,
  FiShoppingBag, FiPlus, FiMinus, FiCheck
} = FiIcons;

const DEFAULT_PRODUCT_SURFACE = '#ffffff';

const sampleImageBackground = (imageElement) => {
  try {
    if (!imageElement?.naturalWidth || !imageElement?.naturalHeight) return DEFAULT_PRODUCT_SURFACE;

    const size = 16;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return DEFAULT_PRODUCT_SURFACE;

    context.drawImage(imageElement, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    const samples = [];
    const positions = [
      [0, 0], [1, 0], [size - 2, 0], [size - 1, 0],
      [0, 1], [size - 1, 1],
      [0, size - 2], [size - 1, size - 2],
      [0, size - 1], [1, size - 1], [size - 2, size - 1], [size - 1, size - 1],
    ];

    positions.forEach(([x, y]) => {
      const index = (y * size + x) * 4;
      const alpha = pixels[index + 3];
      if (alpha > 24) {
        samples.push([pixels[index], pixels[index + 1], pixels[index + 2]]);
      }
    });

    if (!samples.length) return DEFAULT_PRODUCT_SURFACE;

    const [red, green, blue] = samples.reduce(
      (acc, color) => [acc[0] + color[0], acc[1] + color[1], acc[2] + color[2]],
      [0, 0, 0],
    ).map((value) => Math.round(value / samples.length));

    return `rgb(${red}, ${green}, ${blue})`;
  } catch (_) {
    return DEFAULT_PRODUCT_SURFACE;
  }
};

const ProductImageSurface = ({ product, className = '', imageClassName = '', fallbackClassName = 'text-4xl', children = null }) => {
  const candidates = useMemo(() => catalogImageCandidates(product), [product]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [surfaceColor, setSurfaceColor] = useState(DEFAULT_PRODUCT_SURFACE);
  const candidateKey = candidates.join('|');

  React.useEffect(() => {
    setCandidateIndex(0);
    setSurfaceColor(DEFAULT_PRODUCT_SURFACE);
  }, [candidateKey]);

  const source = candidates[candidateIndex] || '';
  const handleImageLoad = (event) => {
    setSurfaceColor(sampleImageBackground(event.currentTarget));
  };

  return (
    <div
      className={`flex items-center justify-center overflow-hidden transition-colors duration-300 ${className}`}
      style={{ backgroundColor: surfaceColor }}
    >
      {children}
      {source
        ? (
          <img
            key={source}
            src={source}
            alt={product?.name || 'Producto'}
            onLoad={handleImageLoad}
            onError={() => {
              setSurfaceColor(DEFAULT_PRODUCT_SURFACE);
              setCandidateIndex((current) => current + 1);
            }}
            className={imageClassName}
            decoding="async"
          />
        )
        : <span className={fallbackClassName}>📦</span>
      }
    </div>
  );
};

const Catalog = () => {
  const { products, cart = [], addToCart, setCartItem, updateQuantity, activeStore } = useStore();
  const { user } = useAuth();
  const {
    setHeaderCenter,
    setMobileHeaderAction,
    setMobileHeaderPanel,
  } = useDesktopHeader();
  const [view, setView] = useState('grid');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('');
  const [detailFilter, setDetailFilter] = useState('');
  const [addedIds, setAddedIds] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [modalQuantity, setModalQuantity] = useState(1);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [scanSuggestion, setScanSuggestion] = useState<any>(null);
  const [suggestionBusy, setSuggestionBusy] = useState(false);
  const [suggestionMessage, setSuggestionMessage] = useState("");
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  const cartQuantityByProductId = useMemo(() => {
    const quantities = new Map();
    (Array.isArray(cart) ? cart : []).forEach((item) => {
      if (!item?.id) return;
      const current = Number(quantities.get(item.id) || 0);
      const quantity = isWeightedProduct(item)
        ? cartItemInventoryQuantity(item)
        : Math.max(1, Math.floor(Number(item.quantity || 1)));
      quantities.set(item.id, current + quantity);
    });
    return quantities;
  }, [cart]);

  const normalizedCategoryFilter = categoryFilter === 'all' ? '' : categoryFilter;
  const availableProducts = useMemo(
    () => products.filter((product) => Number(product?.stock || 0) > 0),
    [products],
  );

  const filtered = useMemo(() => filterCatalogProducts(availableProducts, {
    search,
    category: normalizedCategoryFilter,
    group: groupFilter,
    detail: detailFilter,
  }), [availableProducts, search, normalizedCategoryFilter, groupFilter, detailFilter]);

  const categoryOptions = useMemo(() => {
    const counts = availableProducts.reduce((acc, item) => {
      const key = getCatalogCategory(item);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es'));
  }, [availableProducts]);

  const categoryCount = useMemo(() => categoryOptions.length, [categoryOptions]);
  const visibleCategoryCount = useMemo(() => new Set(filtered.map((item) => getCatalogCategory(item)).filter(Boolean)).size, [filtered]);
  const productsInSelectedCategory = useMemo(() => (normalizedCategoryFilter
    ? availableProducts.filter((item) => sameCatalogName(getCatalogCategory(item), normalizedCategoryFilter))
    : availableProducts
  ), [availableProducts, normalizedCategoryFilter]);

  const groupOptions = useMemo(() => uniqueSortedCatalogValues(productsInSelectedCategory.map((item) => getCatalogGroup(item))), [productsInSelectedCategory]);
  const productsInSelectedGroup = useMemo(() => (groupFilter
    ? productsInSelectedCategory.filter((item) => sameCatalogName(getCatalogGroup(item), groupFilter))
    : productsInSelectedCategory
  ), [productsInSelectedCategory, groupFilter]);
  const detailOptions = useMemo(() => uniqueSortedCatalogValues(productsInSelectedGroup.map((item) => getCatalogDetail(item))), [productsInSelectedGroup]);

  const changeCategoryFilter = (category) => {
    setCategoryFilter(category);
    setGroupFilter('');
    setDetailFilter('');
  };

  const changeGroupFilter = (group) => {
    setGroupFilter((current) => sameCatalogName(current, group) ? '' : group);
    setDetailFilter('');
  };

  const changeDetailFilter = (detail) => {
    setDetailFilter((current) => sameCatalogName(current, detail) ? '' : detail);
  };

  const handleBarcodeDetected = React.useCallback(async (barcode: string) => {
    if (!user) return;
    setScannerBusy(true);
    setSuggestionMessage("");
    try {
      const payload = await api.get(`/client/catalog/barcode/${encodeURIComponent(barcode)}`);
      setScannerOpen(false);
      if (payload?.local_found && payload?.local_product) {
        setSearch(barcode);
        setCategoryFilter('all');
        setGroupFilter('');
        setDetailFilter('');
        setSelectedProduct(payload.local_product);
        return;
      }
      if (payload?.local_out_of_stock) {
        setScanSuggestion({
          barcode,
          globalProduct: payload?.global_product || payload?.local_product || null,
          globalFound: Boolean(payload?.global_found),
          outOfStock: true,
        });
        return;
      }
      setScanSuggestion({
        barcode,
        globalProduct: payload?.global_product || null,
        globalFound: Boolean(payload?.global_found),
        outOfStock: false,
      });
    } catch (err: any) {
      setSuggestionMessage(err?.message || "No se pudo buscar el producto");
    } finally {
      setScannerBusy(false);
    }
  }, [user]);

  const desktopSearchControl = React.useMemo(() => (
    <div className="relative hidden lg:flex items-center">
      <FiSearch className="pointer-events-none absolute left-5 text-gray-400 text-lg z-10" />
      <input
        type="text"
        placeholder="Buscar producto por nombre, marca o código..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && user && isBarcodeQuery(search)) {
            event.preventDefault();
            void handleBarcodeDetected(search);
          }
        }}
        className={`h-12 w-full rounded-2xl border border-gray-200 bg-[#f9fbfb] pl-12 ${user ? 'pr-24' : 'pr-12'} text-sm font-medium text-gray-700 shadow-sm transition-all focus:outline-none focus:border-[#00a884] focus:ring-2 focus:ring-[#00a884]/20`}
      />
      {user && (
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="absolute right-2 z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-[#00a884] text-white shadow-sm transition-colors hover:bg-[#009676]"
          aria-label="Escanear código de barras"
          title="Escanear producto"
        >
          <FiCamera className="text-base" />
        </button>
      )}
      {search && user && (
        <button
          type="button"
          onClick={() => setSearch('')}
          className="absolute right-12 z-10 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          aria-label="Limpiar búsqueda"
        >
          <FiX className="text-base" />
        </button>
      )}
      {search && !user && (
        <button
          type="button"
          onClick={() => setSearch('')}
          className="absolute right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          aria-label="Limpiar búsqueda"
        >
          <FiX className="text-base" />
        </button>
      )}
    </div>
  ), [handleBarcodeDetected, search, user]);

  React.useEffect(() => {
    setHeaderCenter(desktopSearchControl);
    return () => setHeaderCenter(null);
  }, [desktopSearchControl, setHeaderCenter]);

  React.useEffect(() => {
    if (!mobileSearchOpen) return;
    const frame = window.requestAnimationFrame(() => mobileSearchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [mobileSearchOpen]);

  const mobileSearchAction = React.useMemo(() => (
    <button
      type="button"
      onClick={() => setMobileSearchOpen((current) => !current)}
      className={`relative flex flex-col items-center justify-center gap-0.5 transition-colors ${
        mobileSearchOpen ? 'text-[#00a884]' : 'text-gray-500 hover:text-[#00a884]'
      }`}
      title={mobileSearchOpen ? 'Ocultar búsqueda' : 'Buscar productos'}
      aria-label={mobileSearchOpen ? 'Ocultar búsqueda de productos' : 'Mostrar búsqueda de productos'}
      aria-expanded={mobileSearchOpen}
      aria-controls="mobile-catalog-search"
    >
      <span className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
        mobileSearchOpen
          ? 'border-[#00a884] bg-[#00a884] text-white shadow-sm shadow-[#00a884]/20'
          : 'border-[#00a884]/30 bg-[#00a884]/10 text-[#00a884]'
      }`}>
        <FiSearch className="text-sm" />
        {!mobileSearchOpen && search.trim() && (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-500" />
        )}
      </span>
      <span className="text-[9px] font-medium leading-none">Buscar</span>
    </button>
  ), [mobileSearchOpen, search]);

  const mobileSearchPanel = React.useMemo(() => (
    mobileSearchOpen ? (
      <motion.div
        id="mobile-catalog-search"
        key="mobile-catalog-search"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="overflow-hidden border-t border-gray-100 bg-white"
      >
        <div className="px-4 pb-3 pt-2">
          <div className="relative flex items-center">
            <FiSearch className="pointer-events-none absolute left-3.5 z-10 text-base text-gray-400" />
            <input
              ref={mobileSearchInputRef}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder="Buscar producto por nombre, marca o código..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setMobileSearchOpen(false);
                  return;
                }
                if (event.key === 'Enter' && user && isBarcodeQuery(search)) {
                  event.preventDefault();
                  void handleBarcodeDetected(search);
                }
              }}
              className={`h-11 w-full rounded-2xl border border-gray-200 bg-[#f9fbfb] pl-10 ${user ? 'pr-20' : 'pr-12'} text-sm font-medium text-gray-700 shadow-sm transition-all outline-none focus:border-[#00a884] focus:bg-white focus:ring-2 focus:ring-[#00a884]/20`}
              aria-label="Buscar productos en el catálogo"
            />
            {user && (
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-xl bg-[#00a884] text-white"
                aria-label="Escanear código de barras"
              >
                <FiCamera className="text-sm" />
              </button>
            )}
            {search && user && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  mobileSearchInputRef.current?.focus();
                }}
                className="absolute right-11 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Limpiar búsqueda"
              >
                <FiX className="text-base" />
              </button>
            )}
            {search && !user && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  mobileSearchInputRef.current?.focus();
                }}
                className="absolute right-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Limpiar búsqueda"
              >
                <FiX className="text-base" />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    ) : null
  ), [handleBarcodeDetected, mobileSearchOpen, search, user]);

  React.useEffect(() => {
    setMobileHeaderAction(mobileSearchAction);
    return () => setMobileHeaderAction(null);
  }, [mobileSearchAction, setMobileHeaderAction]);

  React.useEffect(() => {
    setMobileHeaderPanel(mobileSearchPanel);
    return () => setMobileHeaderPanel(null);
  }, [mobileSearchPanel, setMobileHeaderPanel]);

  const submitProductSuggestion = React.useCallback(async () => {
    if (!scanSuggestion?.barcode || !user) return;
    setSuggestionBusy(true);
    setSuggestionMessage("");
    try {
      const response = await api.post('/client/product-suggestions', { barcode: scanSuggestion.barcode });
      if (response?.status === 'already_available' && response?.product) {
        setScanSuggestion(null);
        setSelectedProduct(response.product);
        return;
      }
      setSuggestionMessage(
        response?.global_available
          ? "Sugerencia enviada al negocio. Podrán revisar el producto y ponerlo disponible."
          : "Sugerencia enviada al negocio para su revisión."
      );
    } catch (err: any) {
      setSuggestionMessage(err?.message || "No se pudo enviar la sugerencia");
    } finally {
      setSuggestionBusy(false);
    }
  }, [scanSuggestion, user]);

  const handleShare = () => {
    setShareModalOpen(true);
  };

  const openProductDetail = (product) => {
    const currentQuantity = cartQuantityByProductId.get(product.id) || 0;
    setSelectedProduct(product);
    setModalQuantity(currentQuantity > 0 ? currentQuantity : 1);
  };

  const sanitizeQuantity = (value) => {
    const next = Math.max(1, Math.floor(Number(value) || 1));
    return Math.min(next, 999);
  };

  const handleAddToFunda = (product, event = null, quantity = 1, replaceExisting = false) => {
    event?.stopPropagation?.();
    if (isWeightedProduct(product)) {
      // Quick add for products sold by the pound: one tap always adds one
      // full pound. The customer can fine-tune the weight or switch to an
      // amount later from the product detail or from Mi Funda.
      addToCart(product, 1, { saleMode: 'weight', value: 1 });
      setAddedIds((prev) => [...prev, product.id]);
      setTimeout(
        () => setAddedIds((prev) => prev.filter((id) => id !== product.id)),
        1500,
      );
      return;
    }
    const amount = sanitizeQuantity(quantity);
    const currentQuantity = cartQuantityByProductId.get(product.id) || 0;
    if (replaceExisting && currentQuantity > 0) {
      const delta = amount - currentQuantity;
      if (delta !== 0) updateQuantity(product.id, delta);
    } else {
      addToCart(product, amount);
    }
    setAddedIds(prev => [...prev, product.id]);
    setTimeout(() => setAddedIds(prev => prev.filter(x => x !== product.id)), 1500);
  };

  const confirmWeightedSelection = (item) => {
    const existing = cart.find((entry) => entry.id === item.id && cartItemKey(entry) === cartItemKey(item));
    if (existing && setCartItem) {
      setCartItem(cartItemKey(existing), item);
    } else {
      addToCart(selectedProduct, 1, {
        saleMode: item.saleMode,
        value: item.saleMode === 'amount' ? item.requestedAmount : item.requestedWeight,
      });
    }
    setAddedIds((prev) => [...prev, item.id]);
    setTimeout(() => setAddedIds((prev) => prev.filter((id) => id !== item.id)), 1500);
    setSelectedProduct(null);
  };

  const selectedProductCartItem = selectedProduct ? cart.find((item) => item.id === selectedProduct.id) : null;
  const selectedProductCartQuantity = selectedProduct ? (cartQuantityByProductId.get(selectedProduct.id) || 0) : 0;
  const selectedProductModalQuantity = sanitizeQuantity(modalQuantity);
  const selectedProductQuantityDelta = selectedProduct ? selectedProductModalQuantity - selectedProductCartQuantity : 0;
  const selectedProductInCart = selectedProductCartQuantity > 0;
  const selectedProductActionLabel = selectedProductInCart
    ? selectedProductQuantityDelta === 0
      ? `Agregado · ${selectedProductCartQuantity} en mi funda`
      : selectedProductQuantityDelta > 0
        ? `Agregar +${selectedProductQuantityDelta} a mi funda`
        : `Actualizar a ${selectedProductModalQuantity} en mi funda`
    : `Agregar ${selectedProductModalQuantity} a mi funda`;
  const selectedProductStatusLabel = selectedProductInCart
    ? (isWeightedProduct(selectedProduct) && selectedProductCartItem
      ? formatCartItemMeasure(selectedProductCartItem)
      : `${selectedProductCartQuantity} producto${selectedProductCartQuantity > 1 ? 's' : ''} agregado${selectedProductCartQuantity > 1 ? 's' : ''}`)
    : 'Disponible para agregar';

  const renderCatalogViewToggle = ({ compact = false, inline = false } = {}) => (
    <div className={compact ? 'flex bg-gray-100 rounded-xl p-0.5 gap-0.5 border border-gray-200' : `${inline ? 'min-w-[260px]' : 'mt-3'} rounded-2xl border border-gray-200 bg-[#f5f7f8] p-1.5`}>
      {!compact && (
        <span className="mb-1.5 block px-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
          Vista del catálogo
        </span>
      )}
      <div className={compact ? 'flex gap-0.5' : 'grid grid-cols-2 gap-1'}>
        <button
          type="button"
          onClick={() => setView('list')}
          className={`${compact ? 'p-1.5 rounded-lg' : 'px-4 py-2.5 rounded-xl'} transition-colors flex items-center justify-center gap-2 text-xs font-black ${
            view === 'list' ? 'bg-white shadow-sm text-[#00a884]' : 'text-gray-400 hover:text-gray-600'
          }`}
          title="Vista de lista"
        >
          <FiList className="text-sm" />
          {!compact && <span>Lista</span>}
        </button>
        <button
          type="button"
          onClick={() => setView('grid')}
          className={`${compact ? 'p-1.5 rounded-lg' : 'px-4 py-2.5 rounded-xl'} transition-colors flex items-center justify-center gap-2 text-xs font-black ${
            view === 'grid' ? 'bg-white shadow-sm text-[#00a884]' : 'text-gray-400 hover:text-gray-600'
          }`}
          title="Vista de cuadrícula"
        >
          <FiGrid className="text-sm" />
          {!compact && <span>Cuadrícula</span>}
        </button>
      </div>
    </div>
  );

  const renderProgressiveCatalogFilters = ({ mobile = false } = {}) => {
    const rowClass = mobile ? 'flex gap-2 overflow-x-auto pb-1 scrollbar-hide' : 'flex flex-wrap gap-2.5';
    const categoryChipClass = (active) => `inline-flex items-center gap-2 ${mobile ? 'shrink-0 px-3 py-2' : 'px-4 py-2.5'} rounded-full border text-xs font-bold transition-colors ${
      active ? 'border-[#00a884] bg-[#00a884] text-white shadow-sm shadow-[#00a884]/15' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-[#00a884]/40 hover:text-gray-800'
    }`;
    const groupChipClass = (active) => `inline-flex items-center gap-2 ${mobile ? 'shrink-0 px-3 py-1.5' : 'px-3 py-2'} rounded-full border text-[11px] font-black transition-colors ${
      active ? 'border-amber-500 bg-amber-100 text-amber-800' : 'border-amber-200 bg-white text-amber-700 hover:bg-amber-50'
    }`;
    const detailChipClass = (active) => `inline-flex items-center gap-2 ${mobile ? 'shrink-0 px-3 py-1.5' : 'px-3 py-2'} rounded-full border text-[11px] font-black transition-colors ${
      active ? 'border-orange-500 bg-orange-100 text-orange-800' : 'border-orange-200 bg-white text-orange-700 hover:bg-orange-50'
    }`;
    const wrapperClass = mobile ? 'rounded-2xl border border-gray-100 bg-white p-3 shadow-sm' : 'mt-5 rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-3';

    if (!normalizedCategoryFilter) {
      return (
        <div className={wrapperClass}>
          <div className={rowClass}>
            <button type="button" onClick={() => changeCategoryFilter('all')} className={categoryChipClass(categoryFilter === 'all')}>
              <span className={`h-2 w-2 rounded-full ${categoryFilter === 'all' ? 'bg-white' : 'bg-[#00a884]'}`} />
              Todos
              <span className={categoryFilter === 'all' ? 'text-white/70' : 'text-gray-400'}>{availableProducts.length}</span>
            </button>
            {categoryOptions.length > 0 ? categoryOptions.map(([category, count]) => (
              <button type="button" key={category} onClick={() => changeCategoryFilter(category)} className={categoryChipClass(categoryFilter === category)}>
                <span className={`h-2 w-2 rounded-full ${categoryFilter === category ? 'bg-white' : 'bg-[#00a884]'}`} />
                {category}
                <span className={categoryFilter === category ? 'text-white/70' : 'text-gray-400'}>{Number(count || 0)}</span>
              </button>
            )) : (
              <p className="text-sm text-gray-400">Las categorías aparecerán aquí cuando existan productos activos.</p>
            )}
          </div>
        </div>
      );
    }

    if (!groupFilter) {
      return (
        <div className={`${wrapperClass} border-amber-100 bg-amber-50/40`}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-black text-amber-700">{normalizedCategoryFilter}</p>
            <button type="button" onClick={() => changeCategoryFilter('all')} className="shrink-0 rounded-full border border-amber-100 bg-white px-3 py-1 text-[10px] font-black text-amber-700 hover:bg-amber-50">← Volver</button>
          </div>
          {groupOptions.length > 0 ? (
            <div className={rowClass}>
              {groupOptions.map((group) => (
                <button key={group} type="button" onClick={() => changeGroupFilter(group)} className={groupChipClass(sameCatalogName(groupFilter, group))}>
                  {group}
                  <span className="text-[9px] opacity-70">{productsInSelectedCategory.filter((item) => sameCatalogName(getCatalogGroup(item), group)).length}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs font-bold text-amber-700/70">Esta sección no tiene opciones configuradas. Se muestran sus productos activos.</p>
          )}
        </div>
      );
    }

    return (
      <div className={`${wrapperClass} border-orange-100 bg-orange-50/40`}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-black text-orange-700">{groupFilter}</p>
          <button type="button" onClick={() => { setGroupFilter(''); setDetailFilter(''); }} className="shrink-0 rounded-full border border-orange-100 bg-white px-3 py-1 text-[10px] font-black text-orange-700 hover:bg-orange-50">← Atrás</button>
        </div>
        {detailOptions.length > 0 ? (
          <div className={rowClass}>
            <button type="button" onClick={() => setDetailFilter('')} className={detailChipClass(!detailFilter)}>Todos</button>
            {detailOptions.map((detail) => (
              <button key={detail} type="button" onClick={() => changeDetailFilter(detail)} className={detailChipClass(sameCatalogName(detailFilter, detail))}>
                {detail}
                <span className="text-[9px] opacity-70">{productsInSelectedGroup.filter((item) => sameCatalogName(getCatalogDetail(item), detail)).length}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs font-bold text-orange-700/70">Esta opción no tiene subopciones configuradas. Se muestran sus productos activos.</p>
        )}
      </div>
    );
  };

  return (
    <div className="relative flex min-h-full flex-col bg-gray-50 pb-6 lg:bg-[#f5f7f8] lg:px-5 lg:pb-10">
      <div className="lg:mx-auto lg:w-full lg:max-w-[1580px] lg:pt-5">
        <div className="mx-4 mt-4 relative overflow-hidden rounded-2xl bg-[#1a2332] p-5 shadow-lg shrink-0 lg:mx-0 lg:mt-0 lg:rounded-[1.75rem] lg:p-7">
          <div className="absolute inset-y-0 right-0 w-40 bg-gradient-to-l from-[#00a884]/12 via-transparent to-transparent pointer-events-none" />
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div>
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-white/50 lg:text-[11px]">🎁 Oferta especial</p>
              <h2 className="text-lg font-black leading-tight text-white lg:text-[2rem]">Entrega gratis</h2>
              <p className="mt-0.5 text-xs text-white/60 lg:text-sm">En tu primer pedido · Código: <span className="font-black text-[#00a884]">COLMA1</span></p>
            </div>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#00a884]/20 lg:h-20 lg:w-20 lg:rounded-[1.5rem]">
              <span className="text-3xl lg:text-4xl">🛵</span>
            </div>
          </div>
        </div>

        <div className="mt-3 px-4 shrink-0 lg:hidden">
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-gray-100 bg-white p-2 shadow-sm">
            <button
              type="button"
              onClick={handleShare}
              className="flex items-center gap-1.5 text-[#00a884] bg-[#eafaf1] px-3 py-1.5 rounded-full text-xs font-bold border border-[#00a884]/20 hover:bg-[#d4f5e9] transition-colors"
            >
              <FiShare2 className="text-sm" /> Compartir
            </button>
            {renderCatalogViewToggle({ compact: true })}
          </div>
        </div>

        <div className="mt-3 px-4 shrink-0 lg:hidden">
          {renderProgressiveCatalogFilters({ mobile: true })}
        </div>

        <div className="hidden lg:block lg:mt-5">
          <div className="rounded-[1.75rem] border border-gray-200 bg-white px-6 py-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-gray-400">Categorías</p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <h4 className="text-xl font-black text-gray-900">Explora más rápido</h4>
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#ffd9a6] bg-[#fff6e8] px-3 py-1.5 text-xs font-black text-[#d97706]">
                    <span className="h-2 w-2 rounded-full bg-[#d97706]" />
                    {visibleCategoryCount || categoryCount || 0} activas
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-gray-500">Filtra tu compra por sección sin salir del catálogo y encuentra tus productos más rápido.</p>
              </div>

              <div className="w-full sm:w-auto lg:w-auto">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:justify-end">
                  <button
                    type="button"
                    onClick={handleShare}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#00a884]/20 bg-[#eafaf1] px-4 py-3 text-sm font-black text-[#00a884] transition-colors hover:bg-[#d4f5e9] lg:min-w-[240px]"
                  >
                    <FiShare2 className="text-base" /> Compartir catálogo
                  </button>
                  <div className="hidden w-px shrink-0 bg-gray-200 lg:block" aria-hidden="true" />
                  {renderCatalogViewToggle({ inline: true })}
                </div>
              </div>
            </div>

            {renderProgressiveCatalogFilters()}
          </div>
        </div>


        <div className="mt-4 px-4 flex-1 lg:mt-5 lg:px-0">
          {filtered.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 flex flex-col items-center justify-center text-center bg-white lg:rounded-[1.75rem] lg:min-h-[420px] lg:shadow-sm">
              <span className="text-4xl mb-3">{search.trim() ? '🔎' : '📦'}</span>
              <p className="text-sm font-bold text-gray-500">
                {search.trim() ? `No encontramos productos para “${search.trim()}”` : 'No hay productos disponibles'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {search.trim()
                  ? 'Prueba con las primeras letras del nombre, la marca o el código del producto.'
                  : 'El catálogo aparecerá aquí cuando el administrador active productos'}
              </p>
            </div>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 lg:gap-5">
              {filtered.map((p, i) => {
                const cartQuantity = cartQuantityByProductId.get(p.id) || 0;
                const added = addedIds.includes(p.id) || cartQuantity > 0;
                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => openProductDetail(p)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => event.key === 'Enter' && openProductDetail(p)}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden cursor-pointer active:scale-[0.99] transition-transform lg:rounded-[1.75rem] lg:border-gray-200 lg:hover:border-[#00a884]/20 lg:hover:shadow-lg"
                  >
                    <ProductImageSurface
                      product={p}
                      className="relative w-full h-32 lg:h-56"
                      imageClassName="w-full h-full object-cover lg:object-contain lg:p-4"
                      fallbackClassName="text-4xl lg:text-5xl"
                    />
                    <div className="p-3 lg:p-4 lg:pt-3">
                      <p className="font-bold text-gray-800 text-xs leading-tight line-clamp-2 lg:text-[15px] lg:min-h-[2.6rem]">{p.name}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 lg:text-xs lg:mt-1">{p.category}</p>
                      <div className="flex items-center justify-between mt-2 lg:mt-4">
                        <div>
                          <span className="font-black text-[#00a884] text-sm lg:text-2xl">{formatProductPrice(p)}</span>
                          <p className={`hidden lg:block text-[11px] mt-0.5 ${cartQuantity > 0 ? 'font-bold text-[#00a884]' : 'text-gray-400'}`}>
                            {cartQuantity > 0
                              ? isWeightedProduct(p)
                                ? `${formatWeight(cartQuantity)} en tu funda`
                                : `${cartQuantity} agregado${cartQuantity > 1 ? 's' : ''} en tu funda`
                              : 'Disponible para agregar a tu funda'}
                          </p>
                        </div>
                        <button onClick={(event) => handleAddToFunda(p, event)}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all lg:w-11 lg:h-11 lg:rounded-2xl ${
                            added ? 'bg-[#00a884] text-white' : 'bg-[#00a884]/10 text-[#00a884] hover:bg-[#00a884] hover:text-white'
                          }`}
                        >
                          {isWeightedProduct(p)
                            ? <FiPlus className="text-xs lg:text-sm" />
                            : added
                              ? <FiCheck className="text-xs lg:text-sm" />
                              : <FiPlus className="text-xs lg:text-sm" />}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3 lg:space-y-4">
              {filtered.map((p, i) => {
                const cartQuantity = cartQuantityByProductId.get(p.id) || 0;
                const added = addedIds.includes(p.id) || cartQuantity > 0;
                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => openProductDetail(p)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => event.key === 'Enter' && openProductDetail(p)}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-transform lg:rounded-[1.75rem] lg:p-4 lg:gap-5 lg:border-gray-200 lg:hover:border-[#00a884]/20 lg:hover:shadow-md"
                  >
                    <ProductImageSurface
                      product={p}
                      className="w-16 h-16 rounded-xl shrink-0 border border-gray-100 lg:w-28 lg:h-28 lg:rounded-2xl"
                      imageClassName="w-full h-full object-cover lg:object-contain lg:p-3"
                      fallbackClassName="text-2xl lg:text-4xl"
                    />
                    <div className="flex-1 min-w-0 flex items-center justify-between gap-3 lg:gap-6">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-gray-800 text-sm truncate lg:text-lg">{p.name}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 lg:text-xs lg:mt-1">{p.category}</p>
                        <p className="font-black text-[#00a884] text-lg leading-none mt-1.5 lg:text-2xl lg:mt-2">{formatProductPrice(p)}</p>
                      </div>

                      <div className="flex shrink-0 flex-col items-center gap-1.5 lg:w-[190px]">
                        <button onClick={(event) => handleAddToFunda(p, event)}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shrink-0 lg:w-full lg:h-auto lg:min-h-11 lg:px-5 lg:py-3 lg:rounded-2xl lg:gap-2 lg:text-sm lg:font-black ${
                            added ? 'bg-[#00a884] text-white' : 'bg-[#00a884]/10 text-[#00a884] hover:bg-[#00a884] hover:text-white'
                          }`}
                        >
                          {isWeightedProduct(p)
                            ? <FiPlus className="text-sm" />
                            : added
                              ? <FiCheck className="text-sm" />
                              : <FiShoppingBag className="text-sm" />}
                          <span className="hidden lg:inline">
                            {isWeightedProduct(p)
                              ? 'Agregar 1 lb'
                              : cartQuantity > 0
                                ? `Agregado (${cartQuantity})`
                                : 'Agregar a mi funda'}
                          </span>
                        </button>

                        {cartQuantity > 0 && (
                          <p className="hidden lg:block text-center text-xs font-bold leading-tight text-[#00a884]">
                            {isWeightedProduct(p)
                              ? `${formatWeight(cartQuantity)} en tu funda`
                              : `${cartQuantity} agregado${cartQuantity > 1 ? 's' : ''} en tu funda`}
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedProduct && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center lg:items-center lg:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSelectedProduct(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
              className="relative w-full max-w-md bg-white rounded-t-[1.75rem] rounded-b-none shadow-2xl overflow-hidden max-h-[94dvh] flex flex-col pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:max-w-5xl lg:rounded-[2rem] lg:pb-0 lg:max-h-[90vh]"
            >
              <div className="flex justify-center pt-3 pb-1 lg:hidden">
                <div className="w-10 h-1 bg-gray-200 rounded-full" />
              </div>

              <div className="flex items-start justify-between gap-3 px-5 pt-2 pb-3 border-b border-gray-100 lg:px-7 lg:pt-6 lg:pb-5">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#00a884]">Detalle del producto</p>
                  <h3 className="text-lg font-black text-gray-900 leading-tight mt-1 lg:text-3xl">{selectedProduct.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold text-gray-400 lg:text-sm">{selectedProduct.category || 'Sin categoría'}</p>
                    {selectedProductInCart && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00a884]/20 bg-[#eafaf1] px-2.5 py-1 text-[10px] font-black text-[#00a884] lg:text-xs">
                        <FiCheck className="text-xs" /> {selectedProductStatusLabel}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="w-9 h-9 rounded-2xl bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors flex items-center justify-center shrink-0 lg:w-11 lg:h-11"
                  aria-label="Cerrar detalle del producto"
                >
                  <FiX />
                </button>
              </div>

              <div className="overflow-y-auto px-5 py-4 space-y-4 lg:grid lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)] lg:gap-7 lg:space-y-0 lg:px-7 lg:py-6">
                <div>
                  <ProductImageSurface
                    product={selectedProduct}
                    className="w-full h-56 rounded-3xl border border-gray-100 lg:h-[420px] lg:rounded-[2rem]"
                    imageClassName="w-full h-full object-contain p-3 lg:p-6"
                    fallbackClassName="text-6xl"
                  />
                </div>

                <div className="space-y-4 lg:flex lg:flex-col lg:justify-between">
                  <div className={`grid gap-3 ${isWeightedProduct(selectedProduct) ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-2'}`}>
                    <div className="rounded-2xl bg-[#eafaf1] border border-[#00a884]/15 px-4 py-3 lg:p-5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#008f72]/70">Precio</p>
                      <p className="text-lg font-black text-[#00a884] mt-0.5 lg:text-3xl">{formatProductPrice(selectedProduct)}</p>
                    </div>
                    {!isWeightedProduct(selectedProduct) && <div className="rounded-2xl bg-gray-50 border border-gray-100 px-3 py-3 lg:p-5">
                      <label htmlFor="product-detail-quantity" className="text-[9px] font-black uppercase tracking-widest text-gray-400">Cantidad</label>
                      <div className="flex items-center gap-2 mt-1.5 lg:mt-3">
                        <button
                          type="button"
                          onClick={() => setModalQuantity(q => Math.max(1, Number(q || 1) - 1))}
                          className="w-8 h-8 rounded-xl bg-white border border-gray-200 text-gray-500 flex items-center justify-center active:scale-95 transition-transform lg:w-11 lg:h-11"
                          aria-label="Reducir cantidad"
                        >
                          <FiMinus className="text-xs lg:text-sm" />
                        </button>
                        <input
                          id="product-detail-quantity"
                          type="number"
                          min="1"
                          max="999"
                          inputMode="numeric"
                          value={modalQuantity}
                          onChange={(event) => setModalQuantity(sanitizeQuantity(event.target.value))}
                          className="min-w-0 flex-1 h-8 rounded-xl border border-gray-200 bg-white text-center text-sm font-black text-gray-800 focus:outline-none focus:border-[#00a884] focus:ring-2 focus:ring-[#00a884]/20 lg:h-11 lg:text-base"
                        />
                        <button
                          type="button"
                          onClick={() => setModalQuantity(q => sanitizeQuantity(Number(q || 1) + 1))}
                          className="w-8 h-8 rounded-xl bg-[#00a884]/10 text-[#00a884] flex items-center justify-center active:scale-95 transition-transform lg:w-11 lg:h-11"
                          aria-label="Aumentar cantidad"
                        >
                          <FiPlus className="text-xs lg:text-sm" />
                        </button>
                      </div>
                    </div>}
                  </div>

                  <div className="rounded-3xl bg-gray-50 border border-gray-100 p-4 lg:p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400 mb-2">Descripción</p>
                    <p className="text-sm text-gray-600 font-medium leading-relaxed whitespace-pre-line lg:text-base">
                      {selectedProduct.description || 'Este producto todavía no tiene una descripción registrada.'}
                    </p>
                  </div>

                  {isWeightedProduct(selectedProduct) && (
                    <div className="rounded-3xl border border-gray-100 bg-white p-1 lg:p-2">
                      <WeightedSaleSelector
                        product={selectedProduct}
                        initialItem={selectedProductCartItem}
                        onConfirm={confirmWeightedSelection}
                        showHeader
                        confirmLabel={selectedProductCartItem ? 'Actualizar mi pedido' : 'Agregar a mi funda'}
                      />
                    </div>
                  )}

                  {!isWeightedProduct(selectedProduct) && <div className="hidden lg:flex items-center justify-between gap-4 rounded-3xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">Total seleccionado</p>
                      <p className="text-3xl font-black text-[#00a884] mt-1">RD$ {(Number(selectedProduct.price || 0) * modalQuantity).toLocaleString()}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => handleAddToFunda(selectedProduct, event, modalQuantity, true)}
                      className={`min-w-[260px] py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-md transition-all ${
                        selectedProductInCart && selectedProductQuantityDelta === 0
                          ? 'bg-[#00a884] text-white shadow-[#00a884]/25'
                          : 'bg-[#00a884] text-white shadow-[#00a884]/25 hover:bg-[#009676]'
                      }`}
                    >
                      {selectedProductInCart && selectedProductQuantityDelta === 0 ? <FiCheck /> : <FiShoppingBag />}
                      {selectedProductActionLabel}
                    </button>
                  </div>}
                </div>
              </div>

              {!isWeightedProduct(selectedProduct) && <div className="px-5 py-4 bg-white border-t border-gray-100 lg:hidden">
                <button
                  type="button"
                  onClick={(event) => handleAddToFunda(selectedProduct, event, modalQuantity, true)}
                  className={`w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-md transition-all ${
                    selectedProductInCart && selectedProductQuantityDelta === 0
                      ? 'bg-[#00a884] text-white shadow-[#00a884]/25'
                      : 'bg-[#00a884] text-white shadow-[#00a884]/25 hover:bg-[#009676]'
                  }`}
                >
                  {selectedProductInCart && selectedProductQuantityDelta === 0 ? <FiCheck /> : <FiShoppingBag />}
                  {selectedProductActionLabel}
                </button>
              </div>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <BarcodeScanner
        open={Boolean(user) && scannerOpen}
        busy={scannerBusy}
        onClose={() => setScannerOpen(false)}
        onDetected={handleBarcodeDetected}
      />

      <AnimatePresence>
        {scanSuggestion && (
          <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-6">
            <motion.button type="button" aria-label="Cerrar sugerencia" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setScanSuggestion(null)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }} className="relative w-full max-w-md rounded-t-[1.75rem] bg-white p-5 shadow-2xl sm:rounded-[1.75rem] sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#00a884]">Producto no disponible</p>
                  <h3 className="mt-1 text-xl font-black text-gray-900">{scanSuggestion.outOfStock ? "Producto agotado" : "Sugerir al negocio"}</h3>
                  {scanSuggestion.outOfStock ? (
                    <p className="mt-2 text-sm leading-relaxed text-gray-500">
                      Este producto no tiene existencia disponible en este momento.
                    </p>
                  ) : !scanSuggestion.globalFound ? (
                    <p className="mt-2 text-sm leading-relaxed text-gray-500">
                      Este producto no está disponible en el negocio. Puedes sugerirlo para que lo revisen.
                    </p>
                  ) : null}
                </div>
                <button type="button" onClick={() => setScanSuggestion(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500"><FiX /></button>
              </div>
              {scanSuggestion.globalFound && scanSuggestion.globalProduct && (
                <div className="mt-4 flex items-center gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-3">
                  <ProductImageSurface
                    product={scanSuggestion.globalProduct}
                    className="h-20 w-20 shrink-0 rounded-2xl border border-gray-100 bg-white"
                    imageClassName="h-full w-full object-contain p-2"
                    fallbackClassName="text-3xl"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Producto solicitado</p>
                    <p className="mt-1 text-base font-black leading-tight text-gray-900">
                      {scanSuggestion.globalProduct?.name || 'Producto'}
                    </p>
                  </div>
                </div>
              )}
              <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Código escaneado</p>
                <p className="mt-1 break-all font-black text-gray-900">{scanSuggestion.barcode}</p>
              </div>
              {suggestionMessage && <div className="mt-4 rounded-2xl border border-[#00a884]/15 bg-[#eafaf1] px-4 py-3 text-xs font-bold leading-relaxed text-[#008f72]">{suggestionMessage}</div>}
              {scanSuggestion.outOfStock ? (
                <button type="button" onClick={() => setScanSuggestion(null)} className="mt-4 flex w-full items-center justify-center rounded-2xl bg-gray-100 py-4 text-sm font-black text-gray-600 hover:bg-gray-200">
                  Entendido
                </button>
              ) : (
                <button type="button" disabled={suggestionBusy || Boolean(suggestionMessage)} onClick={submitProductSuggestion} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#00a884] py-4 text-sm font-black text-white shadow-lg shadow-[#00a884]/20 disabled:opacity-50">
                  <FiSend /> {suggestionBusy ? 'Enviando...' : suggestionMessage ? 'Sugerencia enviada' : 'Enviar sugerencia'}
                </button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ShareAppModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        storeName={activeStore?.name}
        appUrl={typeof window !== 'undefined' ? window.location.origin : ''}
        title="Compartir catálogo"
        description={
          <>
            Comparte este código para que otras personas puedan abrir el catálogo de{' '}
            <span className="font-bold text-gray-700">{activeStore?.name || 'este negocio'}</span> directamente desde su celular.
          </>
        }
        whatsappText={`¡Hola! Te comparto el catálogo de ${activeStore?.name || 'este negocio'}: ${typeof window !== 'undefined' ? window.location.origin : ''}`}
        nativeShareText={`Mira el catálogo de ${activeStore?.name || 'este negocio'}`}
      />
    </div>
  );
};

export default Catalog;
