from pathlib import Path

root = Path(__file__).resolve().parents[1]
server = (root / 'services/api/internal/httpapi/server.go').read_text(encoding='utf-8')
bridge = (root / 'services/whatsapp-bridge/internal/bridge/bridge.go').read_text(encoding='utf-8')
customers = (root / 'apps/web/app/customers/page.tsx').read_text(encoding='utf-8')
conversations = (root / 'apps/web/app/conversations/page.tsx').read_text(encoding='utf-8')
migration = root / 'services/api/migrations/000021_customer_contact_profiles.up.sql'

checks = {
    'contacts route': 'p.Get("/contacts", s.listContacts)' in server,
    'profile internal route': 'api.Post("/internal/whatsapp/profile", s.whatsappProfile)' in server,
    'customer list purchase filter': "status<>'canceled'" in server[server.find('func (s *Server) listCustomers'):server.find('func (s *Server) getCustomer')],
    'whatsapp event does not auto-create customer': 'INSERT INTO customers(store_id,name,phone,status)' not in server[server.find('func (s *Server) whatsappEvent'):server.find('func (s *Server) supportWhatsAppEvent')],
    'conversation API exposes contact type': 'contact_type' in server[server.find('func (s *Server) listConversations'):server.find('func (s *Server) conversationOwned')],
    'conversation API exposes profile picture': 'profile_picture_url' in server[server.find('func (s *Server) listConversations'):server.find('func (s *Server) conversationOwned')],
    'bridge resolves cached WhatsApp names': 'GetContact(ctx' in bridge,
    'bridge fetches profile pictures': 'GetProfilePictureInfo' in bridge,
    'bridge posts profile metadata': '/api/v1/internal/whatsapp/profile' in bridge,
    'customer page has Clientes tab': "setTab('customers')" in customers and 'Clientes <span' in customers,
    'customer page has Contactos tab': "setTab('contacts')" in customers and 'Contactos <span' in customers,
    'conversation has customer chip': "['customer','Clientes']" in conversations,
    'conversation has contact chip': "['contact','Contactos']" in conversations,
    'conversation renders profile image': 'profile_picture_url' in conversations and '<img' in conversations,
    'dashboard only counts buyers': "WHERE s.user_id=$1 AND EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=cu.id AND o.status<>'canceled' AND o.flow_type<>'quote')" in server,
    'customer stats ignore canceled orders': "count(*) FILTER (WHERE status<>'canceled' AND flow_type<>'quote')::int cnt" in server,
    'conversation order uses persisted whatsapp phone': "coalesce(whatsapp_phone,'')" in server[server.find('func (s *Server) createConversationOrder'):server.find('type priceOption', server.find('func (s *Server) createConversationOrder'))],
    'migration recalculates purchase stats': 'Keep customer purchase statistics aligned' in migration.read_text(encoding='utf-8') if migration.exists() else False,
    'conversation details requires purchase for customer status': 'isCustomer := false' in server[server.find('func (s *Server) conversationDetails'):server.find('func (s *Server) saveConversationCustomer')] and "SELECT EXISTS(SELECT 1 FROM orders WHERE customer_id=$1 AND status<>'canceled' AND flow_type<>'quote')" in server[server.find('func (s *Server) conversationDetails'):server.find('func (s *Server) saveConversationCustomer')],
    'whatsapp event resolves platform identity without promotion': 'registeredIdentityForWhatsApp' in server[server.find('func (s *Server) whatsappEvent'):server.find('func (s *Server) whatsappProfile')] and 'purchasedCustomerForWhatsApp' in server[server.find('func (s *Server) whatsappEvent'):server.find('func (s *Server) whatsappProfile')],
    'web checkout links matching conversation': 'Link any pre-existing WhatsApp conversation to the buyer after the first purchase.' in server,
    'migration links purchased customer by phone': 'Link legacy WhatsApp conversations to real customers by phone' in migration.read_text(encoding='utf-8') if migration.exists() else False,
    'profile refresh is bounded': 'profileSem' in bridge and 'make(chan struct{}, 4)' in bridge,
    'migration exists': migration.exists(),
}

failed = [name for name, ok in checks.items() if not ok]
if failed:
    raise SystemExit('FAIL: ' + ', '.join(failed))
print('PASS: customer/contact distinction + WhatsApp profile regressions')
