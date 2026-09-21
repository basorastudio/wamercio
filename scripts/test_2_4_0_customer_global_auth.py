from pathlib import Path

root = Path(__file__).resolve().parents[1]
up = root/'services/api/migrations/000018_customer_global_auth.up.sql'
down = root/'services/api/migrations/000018_customer_global_auth.down.sql'
assert up.exists(), 'missing migration 000018 up'
assert down.exists(), 'missing migration 000018 down'
sql = up.read_text(encoding='utf-8')
for token in ['last_name','national_id','birth_date','gender','pin_hash','whatsapp_verified_at','identity_verified_at','last_login_at']:
    assert token in sql, f'global customer field missing: {token}'
assert 'CREATE TABLE IF NOT EXISTS customer_addresses' in sql, 'customer_addresses table missing'
for token in ['province_code','municipality','neighborhood','street','street_number','is_primary']:
    assert token in sql, f'customer address field missing: {token}'
assert 'global_customer_id' in sql and 'ALTER TABLE orders' in sql, 'orders global customer relation missing'
assert '["cliente"]' in sql and "key='domains'" in sql, 'migration must reserve /cliente in existing domain settings'
assert 'idx_global_customers_national_id_unique' in sql, 'customer cedula uniqueness missing'
assert 'global_customers.pin_hash IS NULL' in sql, 'store customer sync must not overwrite a registered global identity'
print('OK: migration 000018 customer global identity surface')

server = (root/'services/api/internal/httpapi/server.go').read_text(encoding='utf-8')
customer_auth = root/'services/api/internal/httpapi/customer_auth.go'
assert customer_auth.exists(), 'customer auth handlers missing'
ca = customer_auth.read_text(encoding='utf-8')
for route in ['/auth/customer/lookup','/auth/customer/validate-whatsapp','/auth/customer/verify-identity','/auth/customer/register','/auth/customer/login','/auth/customer/logout']:
    assert route in server, f'missing customer auth route {route}'
for fn in ['customerLookup','customerValidateWhatsApp','customerVerifyIdentity','customerRegister','customerLogin','customerLogout','requireCustomerAuth']:
    assert fn in ca or fn in server, f'missing customer auth function {fn}'
assert 'wamercio_customer_token' in ca or 'wamercio_customer_token' in server, 'customer session cookie missing'
assert 'customer_pin_length' in server, 'customer PIN policy not exposed/handled'
assert 'accepted_customer_pin_lengths' in server, 'accepted customer PIN lengths missing from public platform settings'
print('OK: customer authentication API surface')

customer_portal = root/'services/api/internal/httpapi/customer_portal.go'
assert customer_portal.exists(), 'customer portal handlers missing'
cp = customer_portal.read_text(encoding='utf-8')
for route in ['/customer/me','/customer/addresses','/customer/orders']:
    assert route in server, f'missing authenticated customer route {route}'
for fn in ['customerMe','customerUpdateMe','customerAddresses','customerCreateAddress','customerUpdateAddress','customerDeleteAddress','customerOrders','customerOrder']:
    assert fn in cp, f'missing customer portal handler {fn}'
assert 'global_customer_id' in cp, 'customer order isolation must use global_customer_id'
assert 'customer_addresses' in cp, 'customer address CRUD must use customer_addresses'
print('OK: customer portal API surface')

checkout_start = server.find('func (s *Server) checkout')
checkout_end = server.find('\nfunc (s *Server) listPlans', checkout_start)
checkout = server[checkout_start:checkout_end]
assert 'wamercio_customer_token' in checkout, 'storefront checkout must require customer session'
assert 'global_customer_id' in checkout, 'checkout must persist global customer identity'
assert 'AddressID' in checkout or 'address_id' in checkout, 'checkout must select a saved customer address'
assert 'strings.TrimSpace(in.CustomerName) == ""' not in checkout, 'checkout must not trust browser customer name'
assert 'strings.TrimSpace(in.CustomerPhone) == ""' not in checkout, 'checkout must not trust browser customer phone'
print('OK: authenticated storefront checkout surface')

customer_modal = root/'apps/web/components/customer-access-modal.tsx'
assert customer_modal.exists(), 'customer access modal missing'
cam = customer_modal.read_text(encoding='utf-8')
for token in ['WhatsApp','Cédula','Nombre','Apellido','Fecha de nacimiento','Género','Provincia','Municipio / Distrito','Barrio','Calle','Número','PinInput']:
    assert token in cam, f'customer registration UI missing {token}'
for endpoint in ['/auth/customer/lookup','/auth/customer/validate-whatsapp','/auth/customer/verify-identity','/auth/customer/register','/auth/customer/login']:
    assert endpoint in cam, f'customer modal missing endpoint {endpoint}'
storefront = (root/'apps/web/app/[slug]/page.tsx').read_text(encoding='utf-8')
assert 'CustomerAccessModal' in storefront, 'storefront must integrate customer auth modal'
assert '/customer/me' in storefront, 'storefront must load global customer session'
print('OK: customer access modal and storefront session surface')

customer_shell = root/'apps/web/components/customer-shell.tsx'
orders_page = root/'apps/web/app/cliente/pedidos/page.tsx'
profile_page = root/'apps/web/app/cliente/perfil/page.tsx'
assert customer_shell.exists(), 'customer shell missing'
assert orders_page.exists(), 'customer orders page missing'
assert profile_page.exists(), 'customer profile page missing'
cs = customer_shell.read_text(encoding='utf-8')
op = orders_page.read_text(encoding='utf-8')
pp = profile_page.read_text(encoding='utf-8')
for token in ['Mis pedidos','Mi perfil','Cerrar sesión']:
    assert token in cs, f'customer shell missing {token}'
assert '/customer/orders' in op and 'store_name' in op, 'customer orders page must consume global orders'
for token in ['/customer/me','/customer/addresses','Direcciones guardadas','Cédula','WhatsApp']:
    assert token in pp, f'customer profile page missing {token}'
print('OK: customer panel routes and profile surface')
assert '"cliente"' in server[server.find('var reservedStoreSlugs'):server.find('func safeStoreSlug', server.find('var reservedStoreSlugs'))], 'cliente must be reserved so a store slug cannot shadow the customer portal'

settings_page = (root/'apps/web/app/admin/settings/page.tsx').read_text(encoding='utf-8')
assert 'PIN clientes' in settings_page, 'Centro SaaS Access must expose customer PIN length'
assert "customer_pin_length" in settings_page, 'customer PIN selector must persist customer_pin_length'
assert 'legacy_customer_pin_lengths' in settings_page, 'legacy customer PIN compatibility must be visible'
print('OK: Centro SaaS customer PIN policy surface')

admin_global = server[server.find('func (s *Server) adminGlobalCustomers'):server.find('\nfunc (s *Server) adminPlatformUsers')]
for token in ['last_name','national_id','status','identity_verified','whatsapp_verified','address_count']:
    assert token in admin_global, f'admin global customers missing enriched field {token}'
global_page = (root/'apps/web/app/admin/global-customers/page.tsx').read_text(encoding='utf-8')
for token in ['Cédula','Estado','Identidad','x.national_id','x.status']:
    assert token in global_page, f'global customer UI missing {token}'
print('OK: enriched Superadmin global customers surface')

assert (root/'VERSION').read_text(encoding='utf-8').strip() == '2.4.0', 'VERSION must be 2.4.0'
web_pkg = (root/'apps/web/package.json').read_text(encoding='utf-8')
assert '"version": "2.4.0"' in web_pkg, 'web package version must be 2.4.0'
sw = (root/'apps/web/public/sw.js').read_text(encoding='utf-8')
assert 'wamercio-store-v2.4.0' in sw, 'PWA cache must be 2.4.0'
print('OK: WAMERCIO 2.4.0 version surface')
