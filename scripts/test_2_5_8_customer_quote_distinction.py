from pathlib import Path

server=Path('services/api/internal/httpapi/server.go').read_text()

def need(block, needle, msg):
    if needle not in block:
        raise SystemExit('FAIL: '+msg)

list_convs=server.split('func (s *Server) listConversations',1)[1].split('func (s *Server)',1)[0]
list_customers=server.split('func (s *Server) listCustomers',1)[1].split('func (s *Server) listContacts',1)[0]
list_contacts=server.split('func (s *Server) listContacts',1)[1].split('func (s *Server)',1)[0]
refresh=server.split('func (s *Server) refreshCustomerStats',1)[1].split('func (s *Server)',1)[0]
dashboard=server.split('func (s *Server) dashboard',1)[1].split('func slugify',1)[0]
admin_dashboard=server.split('func (s *Server) adminDashboard',1)[1].split('func (s *Server) adminUsers',1)[0]

for block,name in [(list_convs,'conversation classification'),(list_customers,'customer list'),(list_contacts,'contact list'),(refresh,'customer statistics'),(dashboard,'merchant dashboard'),(admin_dashboard,'platform dashboard')]:
    need(block,"flow_type<>'quote'",f'{name} must exclude quotations from purchase metrics')

migration=Path('services/api/migrations/000027_quote_customer_metrics.up.sql')
if not migration.exists():
    raise SystemExit('FAIL: quote customer metrics reconciliation migration missing')
need(migration.read_text(),"flow_type<>'quote'",'migration must recalculate customer purchase metrics without quotations')
print('PASS: quote/contact/customer metric regressions')
