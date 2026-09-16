from pathlib import Path

root=Path(__file__).resolve().parents[1]
up=root/'services/api/migrations/000030_table_areas_payment_rules.up.sql'
down=root/'services/api/migrations/000030_table_areas_payment_rules.down.sql'
server=(root/'services/api/internal/httpapi/server.go').read_text(encoding='utf-8')
nav=(root/'apps/web/components/store-shell.tsx').read_text(encoding='utf-8')
tables=(root/'apps/web/app/tables/page.tsx').read_text(encoding='utf-8')
payments=(root/'apps/web/app/payment-methods/page.tsx').read_text(encoding='utf-8')
storefront=(root/'apps/web/components/storefront.tsx').read_text(encoding='utf-8')
verify=(root/'scripts/verify-2.5.8.sh').read_text(encoding='utf-8')
up_text=up.read_text(encoding='utf-8') if up.exists() else ''

checks=[
 ('migration 000030 up exists',up.exists()),
 ('migration 000030 down exists',down.exists()),
 ('migration creates table areas','CREATE TABLE IF NOT EXISTS store_table_areas' in up_text),
 ('migration adds area_id to tables','area_id' in up_text and 'store_tables' in up_text),
 ('migration adds payment rules json','payment_methods_by_fulfillment' in up_text),
 ('api registers table area routes','/table-areas' in server),
 ('api lists area name with tables','area_name' in server and 'store_table_areas' in server),
 ('api exposes dine_in_enabled in stores list','dine_in_enabled' in server[server.find('func (s *Server) listStores'):server.find('func (s *Server) createStore')]),
 ('sidebar does not fetch settings just to show tables nav','api(`/stores/${remembered}/settings`)' not in nav),
 ('sidebar store refresh effect does not depend on stores',"},[stores])" not in nav[nav.find("const[dineInNav"):nav.find("const toggleCollapsed")]),
 ('tables page has area selector','Área' in tables and '/table-areas' in tables),
 ('tables page supports adding areas','Agregar área' in tables),
 ('payment page has fulfillment availability','Disponibilidad por modalidad' in payments),
 ('payment page references fulfillment payment rules','payment_methods_by_fulfillment' in payments),
 ('storefront uses fulfillment payment rules','payment_methods_by_fulfillment' in storefront),
 ('storefront table selector shows area','area_name' in storefront),
 ('backend has fulfillment payment validation helper','paymentMethodAllowedForFulfillment' in server),
 ('verifier runs new regression','test_2_5_8_table_areas_payment_rules.py' in verify),
 ('verifier checks migration 000030','000030_table_areas_payment_rules.up.sql' in verify and '000030_table_areas_payment_rules.down.sql' in verify),
]
failed=[name for name,ok in checks if not ok]
if failed:
 print('FAIL: table areas / fulfillment payment rules regressions')
 for name in failed: print(' -',name)
 raise SystemExit(1)
print('PASS: table areas / fulfillment payment rules regressions')
