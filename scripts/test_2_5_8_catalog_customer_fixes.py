from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
products=(root/'apps/web/app/catalog/products/page.tsx').read_text()
store=(root/'apps/web/components/storefront.tsx').read_text()
address=(root/'apps/web/components/customer-address-form.tsx').read_text()

checks={
    'catalog create CTA is always Nuevo producto': "const newLabel='Nuevo producto'" in products,
    'standard product modal groups quantity and add button in one action row': 'data-testid="storefront-product-actions"' in store,
    'standard add button can share row with quantity control': re.search(r'data-testid="storefront-product-actions"[\s\S]{0,1800}className="[^"]*flex-1[^"]*"[\s\S]{0,500}>\{canOrder\?', store) is not None,
    'customer address form hydrates saved territorial selectors': 'loadAddressTerritory' in address and 'setCities(hydrated.cities)' in address and 'setNeighborhoods(hydrated.neighborhoods)' in address,
}
failed=[name for name,ok in checks.items() if not ok]
if failed:
    for name in failed: print('FAIL:',name)
    raise SystemExit(1)
print('PASS: WAMERCIO 2.5.8 catalog/customer UX regressions')
