from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
store = (root/'apps/web/components/storefront.tsx').read_text()
payments = (root/'apps/web/app/payment-methods/page.tsx').read_text()
api = (root/'services/api/internal/httpapi/server.go').read_text()
web_text = '\n'.join(p.read_text(errors='ignore') for p in (root/'apps/web').rglob('*.tsx'))

checks = {
    'cart checkout promotional heading is removed': 'Finalizar pedido' not in store and 'Entrega y forma de pago' not in store and 'Completa los datos de tu pedido sin salir de esta página.' not in store,
    'cart checkout customer identity card is removed': 'tracking-wider" style={{color:t.colors.muted}}>Cliente</div>' not in store,
    'delivery zone selector is removed from storefront checkout': 'Zona de delivery *' not in store and 'Selecciona una zona' not in store,
    'web checkout no longer requires an explicit delivery zone': 'Selecciona una zona de delivery' not in api,
    'terminal card replaces cash on delivery wording in storefront': "cash_on_delivery:'Tarjeta en terminal'" in store,
    'legacy Pago al recibir label is gone from web UI': 'Pago al recibir' not in web_text,
    'electronic transfer wording replaces manual transfer wording': 'Transferencia electrónica' in payments and 'Transferencia manual' not in payments,
    'account type is a selector': re.search(r'<label className="label">Tipo de cuenta</label><select[^>]*className="field"', payments) is not None,
    'account type offers Ahorros': '<option value="Ahorros">Ahorros</option>' in payments,
    'account type offers Corriente': '<option value="Corriente">Corriente</option>' in payments,
}
failed = [name for name, ok in checks.items() if not ok]
if failed:
    for name in failed:
        print('FAIL:', name)
    raise SystemExit(1)
print('PASS: checkout cleanup and payment terminology regressions')
