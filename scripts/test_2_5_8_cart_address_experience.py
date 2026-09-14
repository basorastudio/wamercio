from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
profile=(root/'apps/web/app/cliente/perfil/page.tsx').read_text()
store=(root/'apps/web/components/storefront.tsx').read_text()

checks={
    'edited saved address is hidden while its inline form is open': 'addresses.filter(a=>!(showForm&&editing?.id===a.id)).map' in profile,
    'cart checkout has an explicit delivery step card': 'data-testid="storefront-cart-step-delivery"' in store,
    'cart checkout summarizes the selected delivery address': 'data-testid="storefront-selected-address"' in store,
    'cart checkout has an explicit payment step card': 'data-testid="storefront-cart-step-payment"' in store,
    'payment methods are rendered as direct-choice buttons instead of a select': 'data-testid="storefront-payment-option"' in store and 'value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})' not in store,
    'cart has a dedicated sticky order summary': 'data-testid="storefront-cart-summary"' in store,
    'desktop cart is widened for the structured checkout': 'lg:w-[460px]' in store and "lg:pr-[480px]" in store,
}
failed=[name for name,ok in checks.items() if not ok]
if failed:
    for name in failed: print('FAIL:',name)
    raise SystemExit(1)
print('PASS: address edit and ColmaPro-inspired cart regressions')
