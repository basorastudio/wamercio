from pathlib import Path

root=Path(__file__).resolve().parents[1]
cart=(root/'apps/web/lib/storefront-cart.ts').read_text()
store=(root/'apps/web/components/storefront.tsx').read_text()

checks={
    'initial quantity helper exists': 'export function initialProductQuantity' in cart,
    'openProduct uses initial quantity helper': 'setQty(initialProductQuantity(' in store,
    'desktop product modal uses two-column layout': 'data-testid="storefront-product-modal"' in store and 'sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]' in store,
    'product image is isolated in left column': 'data-testid="storefront-product-media"' in store,
    'product details are isolated in right column': 'data-testid="storefront-product-details"' in store,
}
failed=[name for name,ok in checks.items() if not ok]
if failed:
    for name in failed: print('FAIL:',name)
    raise SystemExit(1)
print('PASS: WAMERCIO 2.5.8 product modal regression')
