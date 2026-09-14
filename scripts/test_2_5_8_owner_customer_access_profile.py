from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

modal = read('apps/web/components/customer-access-modal.tsx')
storefront = read('apps/web/components/storefront.tsx')
shell = read('apps/web/components/customer-shell.tsx')
portal = read('services/api/internal/httpapi/customer_portal.go')
auth = read('services/api/internal/httpapi/customer_auth.go')
server = read('services/api/internal/httpapi/server.go')
bridge = read('services/whatsapp-bridge/internal/bridge/bridge.go')

# The storefront entry flow must distinguish the owner of the current store from customers.
assert 'account_type' in modal, 'customer access modal does not branch by account type'
assert "accountType==='owner'" in modal or 'accountType === \'owner\'' in modal, 'owner branch missing in customer access modal'
assert "/auth/store/login" in modal, 'owner login is not wired from storefront access modal'
assert 'redirect_url' in modal, 'owner cross-domain handoff redirect is missing'
assert 'account_type' in auth, 'customer lookup does not expose account type'
assert "role='owner'" in auth, 'customer lookup does not detect current store owner'
assert '/auth/store/sso/exchange' in server, 'owner SSO exchange route is missing'
callback = read('apps/web/app/auth/store/callback/page.tsx')
assert '/auth/store/sso/exchange' in callback and '/dashboard' in callback, 'owner storefront SSO callback is missing'

# Identity data from verified Dominican ID must become read-only in customer registration.
assert 'identityLocked' in modal, 'verified customer identity lock state missing'
for field in ['form.cedula', 'form.name', 'form.last_name', 'form.birth_date', 'form.gender']:
    assert field in modal, f'missing expected identity field {field}'
assert 'disabled={identityLocked}' in modal, 'verified identity inputs are not locked'

# WhatsApp profile photo must be explicitly resolvable via the existing whatsmeow session.
assert 'action == "profile"' in bridge, 'bridge profile resolver endpoint missing'
assert 'GetProfilePictureInfo' in bridge, 'whatsmeow profile photo lookup missing'
assert 'profile_picture_url' in portal, 'customer /me does not expose profile picture URL'
assert 'profile_picture_url' in shell, 'customer shell does not render profile image'
assert 'profile_picture_url' in storefront, 'storefront customer button does not render profile image'
assert 'syncGlobalCustomerWhatsAppProfile' in auth, 'customer auth does not synchronize WhatsApp profile after login/registration'
assert '/sessions/support/profile' in auth, 'global customer profile sync must use the platform WhatsApp session when available'
mobile = read('apps/web/components/storefront-mobile-nav.tsx')
assert 'profile_picture_url' in mobile, 'mobile storefront account button does not render WhatsApp profile image'

migration = read('services/api/migrations/000022_owner_access_customer_profiles.up.sql')
assert 'ALTER TABLE global_customers' in migration
assert 'profile_picture_url' in migration
assert 'owner_sso_tokens' in migration

print('PASS: owner storefront access, identity lock and customer WhatsApp profile regressions')
