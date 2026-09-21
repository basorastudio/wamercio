from pathlib import Path

root = Path(__file__).resolve().parents[1]
owners = (root/'apps/web/app/admin/owners/page.tsx').read_text(encoding='utf-8')
settings = (root/'apps/web/app/admin/settings/page.tsx').read_text(encoding='utf-8')
bridge = (root/'services/whatsapp-bridge/internal/bridge/bridge.go').read_text(encoding='utf-8')
server = (root/'services/api/internal/httpapi/server.go').read_text(encoding='utf-8')
profile = (root/'services/api/internal/httpapi/admin_owners_profile.go').read_text(encoding='utf-8')
route_section = server[server.find('/admin/owners'):server.find('/admin/owners')+1400]

assert 'action == "check"' in bridge, 'bridge must expose session check endpoint'
assert 'IsOnWhatsApp' in bridge, 'bridge must validate numbers with whatsmeow IsOnWhatsApp'
assert '/admin/owners/validate-whatsapp' in route_section, 'API must expose owner WhatsApp validation endpoint'
assert 'adminValidateOwnerWhatsApp' in server or 'adminValidateOwnerWhatsApp' in profile, 'API handler missing'
assert 'validateOwnerWhatsAppForSave' in server or 'validateOwnerWhatsAppForSave' in profile, 'server-side WhatsApp guard missing'
assert 'formatCedula' in owners, 'owner UI needs Dominican cedula formatting'
assert 'whatsappVerified' in owners, 'owner UI needs WhatsApp validation state'
assert 'identityProfile' in owners or 'applyIdentityProfile' in owners, 'owner UI needs identity autofill'
assert "rnc:string" in owners.replace(' ',''), 'business form must own the RNC field'
assert 'legal_name' in owners, 'business identity autofill field missing'
assert 'province' in owners and 'municipality' in owners and 'neighborhood' in owners, 'business location fields missing'
assert 'document_type' not in owners, 'owner UI must no longer mix Cedula/RNC selector'
assert 'setInterval' in settings and 'loadWa' in settings, 'settings WhatsApp QR must poll status automatically'
assert "wa.connected" in settings, 'settings WhatsApp UI must react to connected state'

up = root/'services/api/migrations/000017_owner_whatsapp_business_identity.up.sql'
down = root/'services/api/migrations/000017_owner_whatsapp_business_identity.down.sql'
assert up.exists() and down.exists(), 'migration 000017 missing'
sql = up.read_text(encoding='utf-8')
for col in ['rnc','legal_name','commercial_name','province','municipality','neighborhood','street','street_number','rnc_verified_at']:
    assert col in sql, f'missing store field {col}'
print('OK: WAMERCIO 2.3.2 owner/business regression checks')
