from pathlib import Path

root=Path(__file__).resolve().parents[1]
profile=(root/'apps/web/app/cliente/perfil/page.tsx').read_text()
store=(root/'apps/web/components/storefront.tsx').read_text()

checks={
    'edited saved address is hidden while its inline form is open': 'addresses.filter(a=>!(showForm&&editing?.id===a.id)).map' in profile,
    'cart is rendered as a dedicated full page': 'data-testid="storefront-cart-page"' in store,
    'cart page uses a desktop two-column layout like the ColmaPro reference': 'lg:grid-cols-[minmax(0,1fr)_380px]' in store or 'lg:grid-cols-[minmax(0,1fr)_400px]' in store,
    'cart page has a dedicated products area': 'data-testid="storefront-cart-products"' in store,
    'cart page has an order summary column': 'data-testid="storefront-cart-summary-column"' in store,
    'cart checkout has an explicit delivery step card': 'data-testid="storefront-cart-step-delivery"' in store,
    'cart checkout summarizes the selected delivery address': 'data-testid="storefront-selected-address"' in store,
    'cart checkout has an explicit payment step card': 'data-testid="storefront-cart-step-payment"' in store,
    'payment methods are rendered as direct-choice buttons instead of a select': 'data-testid="storefront-payment-option"' in store and 'value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})' not in store,
    'cart has a dedicated order total summary': 'data-testid="storefront-cart-summary"' in store,
    'legacy lateral cart drawer was removed': 'data-testid="storefront-desktop-cart"' not in store and 'data-testid="storefront-mobile-cart"' not in store,
    'catalog can be restored from the cart page': 'data-testid="storefront-cart-back-catalog"' in store,
}
failed=[name for name,ok in checks.items() if not ok]
if failed:
    for name in failed: print('FAIL:',name)
    raise SystemExit(1)
print('PASS: address edit and full-page ColmaPro-inspired cart regressions')
