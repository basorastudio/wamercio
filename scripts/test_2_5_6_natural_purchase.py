from pathlib import Path
root=Path(__file__).resolve().parents[1]
store=(root/'apps/web/components/storefront.tsx').read_text()
products=(root/'apps/web/app/catalog/products/page.tsx').read_text()
checks={
 'cart helper import': "from '@/lib/storefront-cart'" in store,
 'edit cart line action': 'data-testid="edit-cart-item"' in store and 'openCartItem' in store,
 'update order CTA': 'Actualizar mi pedido' in store,
 'add another configuration': 'Agregar otra combinación' in store,
 'catalog cart summary': 'data-testid="product-cart-summary"' in store,
 'non disruptive save': 'setCartNotice' in store,
 'weighted tabs': '>Libra<' in store and '>Monto<' in store,
 'weighted product editor': 'Vender por libra' in products and 'wamercio_weighted_sale' in products,
 'weighted stock decimal': 'weightedProduct' in products and "step={weightedProduct?'0.01':'1'}" in products,
}
failed=[name for name,ok in checks.items() if not ok]
if failed:
    for name in failed: print('FAIL:',name)
    raise SystemExit(1)
# The save path must not force the cart open after every product selection.
start=store.index('const saveProductSelection=') if 'const saveProductSelection=' in store else -1
if start < 0:
    print('FAIL: saveProductSelection missing'); raise SystemExit(1)
end=store.index('const changeQty=',start)
segment=store[start:end].replace('if(reopen)setCartOpen(true)','')
if 'setCartOpen(true)' in segment:
    print('FAIL: product save still forces cart open'); raise SystemExit(1)
print('PASS: WAMERCIO 2.5.6 natural purchase regression')
