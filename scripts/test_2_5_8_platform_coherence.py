from pathlib import Path

def need(text,needle,msg):
    if needle not in text:
        raise SystemExit('FAIL: '+msg)

def forbid(text,needle,msg):
    if needle in text:
        raise SystemExit('FAIL: '+msg)

storefront=Path('apps/web/components/storefront.tsx').read_text()
products=Path('apps/web/app/catalog/products/page.tsx').read_text()
settings=Path('apps/web/app/settings/store/page.tsx').read_text()
templates=Path('apps/web/app/admin/templates/page.tsx').read_text()
server=Path('services/api/internal/httpapi/server.go').read_text()
portal=Path('services/api/internal/httpapi/customer_portal.go').read_text()
landing=Path('apps/web/app/admin/landing/page.tsx').read_text()+Path('apps/web/components/platform-landing.tsx').read_text()
pos=Path('apps/web/app/pos/page.tsx').read_text()
delivery=Path('apps/web/app/delivery/page.tsx').read_text()
admin_settings=Path('apps/web/app/admin/settings/page.tsx').read_text()
conversations=Path('apps/web/app/conversations/page.tsx').read_text()

need(products,"resolveBusinessCapabilities",'product editor must use business capabilities')
need(products,"capabilities.trackStockDefault",'new products must use template stock default')
need(products,"capabilities.supportsVariants",'variant editor must be capability-aware')
need(products,"capabilities.supportsExtras",'extras editor must be capability-aware')
need(settings,"capabilities.supportsDineIn",'tables must be conditioned by business type')
need(pos,"resolveBusinessCapabilities",'POS must be business-capability aware')
need(pos,"capabilities.supportsVariants",'POS variants must follow business capabilities')
need(pos,"paymentOptions",'POS payment methods must follow store configuration')
need(delivery,'resolveBusinessCapabilities','delivery page must respect business capabilities')
need(delivery,'supportsDelivery','delivery page must hide unsupported delivery configuration')
need(admin_settings,'supports_variants','quick business template defaults must include capability flags')
need(conversations,"resolveBusinessCapabilities",'WhatsApp assisted sales must use business capabilities')
need(conversations,"capabilities.checkoutFields",'WhatsApp assisted sales must render contextual checkout fields')
need(conversations,"custom_fields",'WhatsApp assisted orders must submit contextual fields')
need(conversations,"paymentOptions",'WhatsApp assisted sales must respect enabled payment methods')
need(conversations,'capabilities.requiresPayment','WhatsApp quote flows must not require payment up front')
need(conversations,'pending_quote','WhatsApp quote flows need a non-payment state')
need(server,'createConversationOrder','conversation order endpoint missing')
conversation_order=server.split('func (s *Server) createConversationOrder',1)[1].split('func (s *Server) checkout',1)[0]
need(conversation_order,'CustomFields','conversation order endpoint must accept contextual fields')
need(conversation_order,'contextualCheckoutData(templateConfigRaw, in.CustomFields, in.DeliveryType)','conversation order API must validate contextual checkout fields')
need(conversation_order,'custom_fields,flow_type','conversation orders must persist contextual fields and flow type')
need(conversation_order,'businessCapabilityFlagsFromRaw','conversation orders must enforce template capabilities')
checkout_block=server.split('func (s *Server) checkout',1)[1].split('func (s *Server) listTables',1)[0] if 'func (s *Server) listTables' in server.split('func (s *Server) checkout',1)[1] else server.split('func (s *Server) checkout',1)[1]
need(checkout_block,'businessCapabilityFlagsFromRaw','public checkout must enforce template capabilities')
need(checkout_block,'pending_quote','public checkout must accept quote requests without collecting payment')
need(storefront,"custom_fields",'storefront must send dynamic checkout fields')
need(storefront,"capabilities.checkoutFields",'storefront must render configured checkout fields')
need(storefront,'capabilities.requiresPayment','quotation storefronts must skip premature payment selection')
need(storefront,'pending_quote','quotation storefronts need a non-payment state')
need(storefront,"Mi compra",'cart terminology must be Mi compra')
need(server,'CustomFields','checkout API must accept custom fields')
need(server,'json:"custom_fields"','checkout API must bind custom fields')
need(server,'custom_fields,flow_type','orders must persist contextual fields and flow type')
need(server,'businessCapabilityFlagsFromRaw','API must centralize business capability enforcement')
create_product=server.split('func (s *Server) createProduct',1)[1].split('func (s *Server) updateProduct',1)[0]
update_product=server.split('func (s *Server) updateProduct',1)[1].split('func (s *Server) deleteProduct',1)[0]
update_settings=server.split('func (s *Server) updateStoreSettings',1)[1].split('func (s *Server) listCustomers',1)[0]
pos_sale=server.split('func (s *Server) createPOSSale',1)[1]
need(create_product,'businessCapabilityFlagsForStore','product creation must enforce store capabilities')
need(update_product,'businessCapabilityFlagsForStore','product updates must enforce store capabilities')
need(update_settings,'businessCapabilityFlagsForStore','store settings must enforce template modalities')
need(pos_sale,'businessCapabilityFlagsForStore','POS must enforce store product capabilities server-side')

need(portal,'custom_fields','customer order details must expose custom fields')
need(templates,'supports_variants','template editor must expose variant capability')
need(templates,'checkout_fields','template editor must expose checkout fields')
forbid(landing,'pago al recibir','landing must not use legacy payment wording')
migration26=Path('services/api/migrations/000026_business_capabilities_coherence.up.sql').read_text() if Path('services/api/migrations/000026_business_capabilities_coherence.up.sql').exists() else ''
need(migration26,"supports_dine_in",'capability migration missing')
need(migration26,"engine='food'",'migration must infer dine-in from engine')
need(migration26,"? 'supports_dine_in'",'migration must preserve explicit capability overrides')
print('PASS: platform coherence regressions')
