from pathlib import Path

root = Path(__file__).resolve().parents[1]
server = (root/'services/api/internal/httpapi/server.go').read_text(encoding='utf-8')
bridge = (root/'services/whatsapp-bridge/internal/bridge/bridge.go').read_text(encoding='utf-8')
mig = root/'services/api/migrations/000034_whatsapp_registered_customer_identity.up.sql'

errors=[]

def need(cond,msg):
    if not cond: errors.append(msg)

need(mig.exists(), 'missing migration 000034')
need('isOwnWhatsAppEvent' in server, 'API must reject self WhatsApp events')
need('registeredIdentityForWhatsApp' in server, 'API must resolve registered global identity names independently from purchases')
need("SELECT EXISTS(SELECT 1 FROM orders WHERE customer_id=$1 AND status<>'canceled' AND flow_type<>'quote')" in server, 'commercial customer classification must still require a purchase')
need('skipOwnPhone' in bridge or 'ownPhone' in bridge and 'directPhone' in bridge, 'bridge must skip the business own phone while resolving remote phone')
need('purchasedCustomerForWhatsApp' in server[server.find('func (s *Server) whatsappEvent'):server.find('func (s *Server) whatsappProfile')], 'whatsappEvent may link a store customer only through purchase-aware resolution')

if mig.exists():
    sql=mig.read_text(encoding='utf-8').lower()
    need('delete from conversations' in sql and 'whatsapp_sessions' in sql, 'migration must remove existing self conversations')
    need('global_customers' in sql, 'migration 000034 must retain registered identity backfill history')
    need('update conversations' in sql and 'customer_id' in sql, 'migration 000034 must retain historical linking step; 000035 corrects zero-purchase links')

if errors:
    print('FAIL: WAMERCIO 2.8.4 WhatsApp identity contract')
    for e in errors: print(' -',e)
    raise SystemExit(1)
print('PASS: WAMERCIO 2.8.4 WhatsApp identity contract')
