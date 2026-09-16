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
need('registeredCustomerForWhatsApp' in server, 'API must resolve registered global customers without requiring an order')
need('contactType := "customer"' in server or "contactType = \"customer\"" in server, 'conversation details must classify linked registered identity as customer')
need('skipOwnPhone' in bridge or 'ownPhone' in bridge and 'directPhone' in bridge, 'bridge must skip the business own phone while resolving remote phone')
need('EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=customers.id' not in server[server.find('func (s *Server) whatsappEvent'):server.find('func (s *Server) whatsappProfile')], 'whatsappEvent must not require a prior purchase to link customer')

if mig.exists():
    sql=mig.read_text(encoding='utf-8').lower()
    need('delete from conversations' in sql and 'whatsapp_sessions' in sql, 'migration must remove existing self conversations')
    need('global_customers' in sql and 'insert into customers' in sql, 'migration must backfill registered identities into store customers')
    need('update conversations' in sql and 'customer_id' in sql, 'migration must link existing conversations to registered customers')

if errors:
    print('FAIL: WAMERCIO 2.8.4 WhatsApp identity contract')
    for e in errors: print(' -',e)
    raise SystemExit(1)
print('PASS: WAMERCIO 2.8.4 WhatsApp identity contract')
