from pathlib import Path

root = Path(__file__).resolve().parents[1]
store = (root/'apps/web/components/storefront.tsx').read_text(encoding='utf-8')
mobile = (root/'apps/web/components/storefront-mobile-nav.tsx').read_text(encoding='utf-8')
customer = (root/'apps/web/components/customer-shell.tsx').read_text(encoding='utf-8')
payments = (root/'apps/web/app/payment-methods/page.tsx').read_text(encoding='utf-8')

# Mobile benefit cards must behave as a horizontal, automatic carousel.
assert 'data-testid="storefront-perk-carousel"' in store
assert 'setPerkIndex' in store and 'setInterval' in store

# The legacy desktop label Mi pedido stays removed; mobile navigation calls the cart Mi compra.
assert '<span className="hidden lg:inline">Mi pedido</span>' not in store
assert '<span>Mi compra</span>' in mobile
assert '<span>Mi compra</span>' in customer

# Checkout payment order is cash, terminal card, transfer.
assert "const paymentMethodOrder:PaymentMethod[]=['cash','cash_on_delivery','bank_transfer']" in store
assert payments.index('>Efectivo<') < payments.index('>Tarjeta en terminal<') < payments.index('>Transferencia electrónica<')

# Notes belong under the cart products, not the checkout column.
assert 'data-testid="storefront-cart-notes"' in store
assert store.index('data-testid="storefront-cart-notes"') < store.index('const checkoutColumn=')

# Mobile cart items use the compact layout marker.
assert 'data-testid="storefront-cart-item"' in store
assert 'grid-cols-[64px_minmax(0,1fr)_auto]' in store

# Product cards reserve a dedicated action column so +/check cannot cover the price.
assert 'grid-cols-[minmax(0,1fr)_2.25rem]' in store

# Carousel count must follow the visible fulfillment cards; some business types only render two.
assert 'const hasFulfillmentPerk=' in store and 'const count=2+(hasFulfillmentPerk?1:0)' in store, 'carousel count follows visible perks'
assert 'const count=3' not in store, 'carousel must not assume three cards'

# Product modal no longer has rounded outer corners.
assert 'data-testid="storefront-product-modal"' in store
modal = store[store.index('data-testid="storefront-product-modal"'):]
assert 'borderRadius:0' in modal[:500]

print('PASS: mobile storefront polish regressions')
