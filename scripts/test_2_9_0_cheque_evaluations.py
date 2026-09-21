from pathlib import Path

root = Path(__file__).resolve().parents[1]
server = (root/'services/api/internal/httpapi/server.go').read_text()
portal = (root/'services/api/internal/httpapi/customer_portal.go').read_text()
customers = (root/'apps/web/app/customers/page.tsx').read_text()
storefront = (root/'apps/web/components/storefront.tsx').read_text()
evaluations = (root/'apps/web/app/evaluations/page.tsx').read_text()
up = root/'services/api/migrations/000040_customer_cheque_authorization.up.sql'
down = root/'services/api/migrations/000040_customer_cheque_authorization.down.sql'

assert up.exists() and down.exists(), 'missing customer cheque authorization migration pair'
assert 'cheque_enabled' in up.read_text().lower(), 'migration does not add cheque_enabled to customers'
assert '/customers/{id}/cheque-authorization' in server, 'missing tenant cheque authorization endpoint'
assert 'updateCustomerChequeAuthorization' in server, 'missing cheque authorization handler registration'
assert 'cheque_enabled' in customers and 'Autorizar pago mediante cheque' in customers, 'customer UI missing cheque authorization control'
assert 'cheque_authorized' in portal, 'customer/me does not expose store-specific cheque authorization'
assert 'cheque_authorized' in storefront, 'storefront does not filter cheque using customer authorization'
assert 'paymentMethod == "cheque"' in server or 'PaymentMethod == "cheque"' in server, 'server is not enforcing cheque authorization in order flows'

for token in ['Todos los agentes', 'Todos los canales', 'Imprimir', 'Excel', '/staff?store_id=']:
    assert token in evaluations, f'evaluations UI missing {token}'
assert "q.set('agent_id'" in evaluations, 'evaluations UI missing agent filter query'
assert "q.set('source'" in evaluations, 'evaluations UI missing channel/source filter query'
assert 'source :=' in (root/'services/api/internal/httpapi/evaluations.go').read_text() or 'source :=' in (root/'services/api/internal/httpapi/evaluations.go').read_text(), 'evaluations API missing source filter'

print('PASS: WAMERCIO 2.9.0 cheque authorization and evaluation reporting contract')
