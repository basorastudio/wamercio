from pathlib import Path

root = Path(__file__).resolve().parents[1]
storefront = (root/'apps/web/components/storefront.tsx').read_text(encoding='utf-8')
orders = (root/'apps/web/app/cliente/pedidos/page.tsx').read_text(encoding='utf-8')

checks = [
    ('desktop Mi compra header access', 'data-testid="storefront-desktop-cart"' in storefront and '>Mi compra<' in storefront),
    ('new purchase CTA says Comprar', "editingKey?'Actualizar mi compra':capabilities.primaryAction" in storefront),
    ('variant choices use card grid', 'data-testid="storefront-variant-grid"' in storefront and 'grid-cols-2' in storefront),
    ('extra choices use card grid', 'data-testid="storefront-extra-grid"' in storefront),
    ('orders button says Ver detalles', '>Ver detalles<' in orders and 'Ver negocio' not in orders),
    ('order details endpoint is used', "/customer/orders/${" in orders),
    ('order details modal exists', 'data-testid="customer-order-detail-modal"' in orders),
]

failed = [name for name, ok in checks if not ok]
if failed:
    print('FAIL: storefront purchase/order-details regressions')
    for name in failed:
        print(' -', name)
    raise SystemExit(1)
print('PASS: storefront purchase/order-details regressions')
