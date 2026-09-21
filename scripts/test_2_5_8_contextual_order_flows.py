from pathlib import Path

def need(text, needle, msg):
    if needle not in text:
        raise SystemExit('FAIL: '+msg)

def forbid(text, needle, msg):
    if needle in text:
        raise SystemExit('FAIL: '+msg)

merchant=Path('apps/web/app/orders/page.tsx').read_text()
dashboard_page=Path('apps/web/app/dashboard/page.tsx').read_text()
customer=Path('apps/web/app/cliente/pedidos/page.tsx').read_text()
conversations=Path('apps/web/app/conversations/page.tsx').read_text()
server=Path('services/api/internal/httpapi/server.go').read_text()
readme=Path('README.md').read_text()
templates_doc=Path('docs/PLANTILLAS_NEGOCIOS_RD.md').read_text()

need(merchant,"pending_quote",'merchant order detail must label payment pending quotation')
need(merchant,"detail.flow_type==='quote'",'merchant quote requests must avoid ordinary payment-state actions')
need(customer,"pending_quote",'customer order detail must label payment pending quotation')
need(customer,"Mis compras y solicitudes",'global customer history must use mixed-flow terminology')
need(customer,"Detalle de {flowLabel(detail?.flow_type||rowForDetail?.flow_type).toLowerCase()}",'customer detail header must adapt to pedido/reserva/solicitud')
forbid(customer,">Detalle del pedido</p>",'customer detail header must not hardcode pedido for every flow')
need(conversations,"flowLabel",'conversation order history must label order/reservation/quote contextually')
need(conversations,"o.flow_type",'conversation order history must receive flow type')
conversation_details=server.split('func (s *Server) conversationDetails',1)[1].split('func (s *Server)',1)[0]
need(conversation_details,"flow_type",'conversation details API must expose flow type for recent orders')
need(readme,"Mi compra",'README current terminology must use Mi compra')
dashboard_block=server.split('func (s *Server) dashboard',1)[1].split('func (s *Server)',1)[0]
need(dashboard_block,'flow_type','dashboard recent activity must expose flow type')
need(dashboard_page,'Actividad reciente','dashboard must use mixed-flow recent activity terminology')
need(dashboard_page,'Operaciones hoy','dashboard metric must cover orders and reservations')
forbid(merchant,"{flowName(o.flow_type)} #{o.number}</div>{o.flow_type&&o.flow_type!=='order'",'merchant order list must not repeat the flow label')
need(templates_doc,"Repuestos",'business template docs must describe Repuestos')
need(templates_doc,"quotation",'Repuestos/quotation engine docs must use canonical engine')
print('PASS: contextual order-flow coherence regressions')
