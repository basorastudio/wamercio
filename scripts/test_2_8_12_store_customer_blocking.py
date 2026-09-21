from pathlib import Path
root=Path(__file__).resolve().parents[1]

def text(p): return (root/p).read_text(encoding='utf-8')

up=root/'services/api/migrations/000037_store_customer_blocking.up.sql'
down=root/'services/api/migrations/000037_store_customer_blocking.down.sql'
assert up.exists() and down.exists(), 'missing 000037 customer blocking migration pair'
uptext=up.read_text(encoding='utf-8')
for token in ['blocked_reason','blocked_at','blocked_by_user_id','customer_block_events']:
    assert token in uptext, f'blocking migration missing {token}'

server=text(Path('services/api/internal/httpapi/server.go'))
blocking=text(Path('services/api/internal/httpapi/customer_blocking.go'))
backend=server+'\n'+blocking
for token in ['/customers/{id}/block','blockCustomer','unblockCustomer','customerBlockedInStore','Este cliente está bloqueado en este negocio']:
    assert token in backend, f'API missing customer block contract: {token}'
assert 'blocked_reason' in server and 'blocked_at' in server, 'customer detail/list must expose block metadata'
assert 'delete(profile, "blocks")' in server and 'delete(profile, "blocked_businesses")' in server, 'tenant customer detail must not expose blocks from other businesses'
assert "status=$4" not in server[server.find('func (s *Server) updateCustomer'):server.find('func (s *Server) refreshCustomerStats')], 'legacy updateCustomer must not bypass justified block/unblock endpoints'

reviews=text(Path('services/api/internal/httpapi/product_experience.go'))
assert 'customerBlockedInStore' in reviews, 'review creation must reject blocked customers'
phase1=text(Path('services/api/internal/httpapi/phase1_commerce.go'))
assert 'customerBlockedInStore' in phase1, 'manual reservations must reject blocked customers'
assert server.count('customerBlockedInStore') >= 3, 'checkout, conversation order and POS must enforce store block'

customers=text(Path('apps/web/app/customers/page.tsx'))
for token in ['Bloquear','Desbloquear','Motivo del bloqueo','/block']:
    assert token in customers, f'customer UI missing blocking flow: {token}'
assert 'Editar cliente' not in customers, 'legacy edit modal must be removed'
assert 'Pencil' not in customers, 'legacy edit action must be removed'

admin=text(Path('apps/web/app/admin/global-customers/page.tsx'))
assert 'blocked_businesses' in admin or 'Bloqueado en' in admin, 'superadmin list must show per-business blocks'

detail=text(Path('apps/web/components/customer-detail-view.tsx'))
assert 'blocks' in detail and 'Bloqueos' in detail, 'superadmin detail must show blocking businesses/reasons'

print('PASS: WAMERCIO 2.8.12 per-store customer blocking contract')
