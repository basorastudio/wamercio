from pathlib import Path

root=Path(__file__).resolve().parents[1]
store=(root/'apps/web/components/storefront.tsx').read_text()
auth=(root/'apps/web/components/customer-access-modal.tsx').read_text()

checks={
    'automatic customer phone resolution': 'autoResolvePhone' in auth and 'phoneAutoState' in auth,
    'phone stage has no continue submit': 'data-testid="customer-phone-auto-status"' in auth and '>Continuar</button>' not in auth,
    'topbar storefront search': 'data-testid="storefront-top-search"' in store,
    'contextual search result menu': 'data-testid="storefront-search-results"' in store and 'openSearchProduct' in store,
    'search does not filter catalog canvas': 'const products=useMemo(()=>data?.products?.filter((p:Product)=>(cat===' not in store,
    'header address removed': 'data-testid="storefront-header-subtitle"' in store and "s.address||'Catálogo en línea'" not in store,
    'cart is now a dedicated full-page experience': 'data-testid="storefront-cart-page"' in store and 'fixed inset-y-0 right-0' not in store,
    'full-page cart remains responsive on mobile': ('lg:grid-cols-[minmax(0,1fr)_390px]' in store or 'lg:grid-cols-[minmax(0,1fr)_400px]' in store or 'lg:grid-cols-[minmax(0,1fr)_420px]' in store) and ('!cartOpen&&<StorefrontMobileNav' in store or "active={cartOpen?'cart':'catalog'}" in store),
    'refined product card': 'data-testid="storefront-product-card"' in store and 'h-full' in store and 'focus-visible:ring' in store,
}
failed=[name for name,ok in checks.items() if not ok]
if failed:
    for name in failed: print('FAIL:',name)
    raise SystemExit(1)
print('PASS: WAMERCIO 2.5.5 storefront UX regression')
