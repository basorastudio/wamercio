from pathlib import Path

server = Path('services/api/internal/httpapi/server.go').read_text(encoding='utf-8')
migration = Path('services/api/migrations/000035_global_identity_contact_semantics.up.sql')
customers = Path('apps/web/app/customers/page.tsx').read_text(encoding='utf-8')
conversations = Path('apps/web/app/conversations/page.tsx').read_text(encoding='utf-8')

def need(ok, msg):
    if not ok:
        raise SystemExit('FAIL: ' + msg)

list_convs = server[server.find('func (s *Server) listConversations'):server.find('func (s *Server) conversationOwned')]
list_contacts = server[server.find('func (s *Server) listContacts'):server.find('func (s *Server) getCustomer')]
event = server[server.find('func (s *Server) whatsappEvent'):server.find('func (s *Server) whatsappProfile')]
details = server[server.find('func (s *Server) conversationDetails'):server.find('func (s *Server) saveConversationCustomer')]
save = server[server.find('func (s *Server) saveConversationCustomer'):server.find('func (s *Server) updateConversationStatus')]
global_admin = server[server.find('func (s *Server) adminGlobalCustomers'):server.find('func (s *Server) adminPlatformUsers')]

need('registeredIdentityForWhatsApp' in server, 'registered platform identity must be resolved independently from store customer status')
need('INSERT INTO customers' not in server[server.find('func registeredIdentityForWhatsApp'):server.find('func (s *Server) listMessages')], 'identity lookup must not create store customers')
need("EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=c.customer_id AND o.status<>'canceled' AND o.flow_type<>'quote')" in list_convs, 'conversation customer/contact classification must depend on a real purchase')
need('global_customers' in list_convs and 'global_name' in list_convs, 'conversation list must prefer registered global name')
need('global_customers' in list_contacts and 'global_name' in list_contacts, 'contacts list must prefer registered global name')
need('registeredIdentityForWhatsApp' in event, 'WhatsApp event must resolve the global identity name')
profile = server[server.find('func (s *Server) whatsappProfile'):server.find('func (s *Server) supportWhatsAppEvent')]
need('registeredName' in profile and 'global_customers' in profile, 'profile refresh must preserve registered global name instead of replacing it with WhatsApp profile name')
need('purchasedCustomerForWhatsApp' in event, 'WhatsApp event may link only a purchased store customer')
need('isCustomer := false' in details and "SELECT EXISTS(SELECT 1 FROM orders WHERE customer_id=$1 AND status<>'canceled' AND flow_type<>'quote')" in details, 'conversation details must classify by purchase history')
need('isCustomer := false' in save and "SELECT EXISTS(SELECT 1 FROM orders WHERE customer_id=$1 AND status<>'canceled' AND flow_type<>'quote')" in save, 'contact editor must not treat a zero-purchase link as customer')
need('count(DISTINCT o.store_id)::int FROM orders o' in global_admin and "o.status<>'canceled'" in global_admin and "o.flow_type<>'quote'" in global_admin, 'global customer business count must reflect businesses actually purchased from')
need("count(c.id)::int FROM customers c WHERE c.global_customer_id=g.id AND EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=c.id AND o.status<>'canceled' AND o.flow_type<>'quote')" in global_admin, 'global customer local-record count must also reflect commercial relationships only')
need(migration.exists(), '2.8.5 corrective migration is required')
if migration.exists():
    m = migration.read_text(encoding='utf-8')
    need('UPDATE conversations c' in m and 'SET customer_id=NULL' in m and "flow_type<>'quote'" in m, 'migration must unlink zero-purchase customer relationships from conversations')
need('Perfil de WhatsApp:' in conversations, 'conversation detail must retain WhatsApp profile name as secondary identity')
need('Perfil:' in customers, 'contacts table must retain WhatsApp profile name as secondary identity')
print('PASS: WAMERCIO 2.8.5 global identity/contact semantics')
