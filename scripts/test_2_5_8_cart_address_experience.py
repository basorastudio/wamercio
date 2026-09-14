from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
profile=(root/'apps/web/app/cliente/perfil/page.tsx').read_text()
store=(root/'apps/web/components/storefront.tsx').read_text()

open_item_match=re.search(r"const openCartItem=\(line:CartItem\)=>\{(?P<body>.*?)\n  \}", store, re.S)
open_item_body=open_item_match.group('body') if open_item_match else ''

checks={
    'edited saved address is hidden while its inline form is open': 'addresses.filter(a=>!(showForm&&editing?.id===a.id)).map' in profile,
    'cart is rendered as a dedicated full page': 'data-testid="storefront-cart-page"' in store,
    'cart page uses a desktop two-column layout like the ColmaPro reference': 'lg:grid-cols-[minmax(0,1fr)_390px]' in store or 'lg:grid-cols-[minmax(0,1fr)_400px]' in store or 'lg:grid-cols-[minmax(0,1fr)_420px]' in store,
    'cart page has a dedicated products area': 'data-testid="storefront-cart-products"' in store,
    'cart page has an order summary column': 'data-testid="storefront-cart-summary-column"' in store,
    'editing a cart item keeps the full cart page mounted': bool(open_item_match) and 'setCartOpen(false)' not in open_item_body,
    'cart product edit modal can open directly over the cart page': 'data-testid="edit-cart-item"' in store and 'openProduct(product,line)' in open_item_body,
    'checkout choices are visible immediately without an extra continue step': 'Continuar con mi pedido' not in store and 'const checkoutColumn=checkout?' not in store,
    'duplicate top-level back-to-catalog action is removed': 'Volver al catálogo' not in store,
    'the single catalog return action remains in the order header': 'Seguir comprando' in store,
    'cart checkout has an explicit delivery step card': 'data-testid="storefront-cart-step-delivery"' in store,
    'cart checkout summarizes the selected delivery address': 'data-testid="storefront-selected-address"' in store,
    'cart checkout has an explicit payment step card': 'data-testid="storefront-cart-step-payment"' in store,
    'payment methods are rendered as direct-choice buttons instead of a select': 'data-testid="storefront-payment-option"' in store and 'value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})' not in store,
    'cart has a dedicated order total summary': 'data-testid="storefront-cart-summary"' in store,
    'legacy lateral cart drawer was removed': 'data-testid="storefront-desktop-cart"' not in store and 'data-testid="storefront-mobile-cart"' not in store,
    'ColmaPro-like cart header exists': 'data-testid="storefront-cart-header"' in store,
}
failed=[name for name,ok in checks.items() if not ok]
if failed:
    for name in failed: print('FAIL:',name)
    raise SystemExit(1)
print('PASS: address edit and streamlined full-page ColmaPro-inspired cart regressions')
