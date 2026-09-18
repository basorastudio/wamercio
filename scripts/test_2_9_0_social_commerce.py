from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
server=(root/'services/api/internal/httpapi/server.go').read_text()
proxy=(root/'services/api/internal/httpapi/social_proxy.go')
social=(root/'services/api/internal/httpapi/social_commerce.go')
evals=(root/'services/api/internal/httpapi/evaluations.go')
banks=(root/'services/api/internal/httpapi/bank_accounts.go')
up38=root/'services/api/migrations/000038_social_google_evaluations.up.sql'
down38=root/'services/api/migrations/000038_social_google_evaluations.down.sql'
up39=root/'services/api/migrations/000039_store_bank_accounts.up.sql'
down39=root/'services/api/migrations/000039_store_bank_accounts.down.sql'
for p in [proxy,social,evals,banks,up38,down38,up39,down39]:
    assert p.exists(), f'missing {p.relative_to(root)}'

m38=up38.read_text().lower()
for table in ['store_social_connections','social_oauth_transactions','store_social_posts','store_social_post_deliveries','store_media_assets','store_google_business_settings','store_evaluation_settings','store_customer_evaluations','store_evaluation_pending']:
    assert f'create table if not exists {table}' in m38, table
m39=up39.read_text().lower()
assert 'create table if not exists store_bank_accounts' in m39
assert 'terminal_account_id' in m39 and 'transfer_account_id' in m39

for route in [
 '/social/providers','/social/connect/{provider}','/social/connections','/social/posts','/social/posts/{id}/publish',
 '/media-assets','/google-business/settings','/google-business/connections/{id}/profile','/evaluations/settings','/evaluations',
 '/bank-accounts']:
    assert route in server, route

px=proxy.read_text()
assert 'https://auth-apps.bitapps.pro/apps' in px
assert 'https://auth-apps.bitapps.pro/redirect/v2' in px
assert 'google_business' in px and 'code_challenge' in px

sc=social.read_text()
assert 'socialPublishLoop' in sc
assert 'publishFacebook' in sc and 'publishInstagram' in sc and 'publishLinkedIn' in sc and 'publishGoogleBusiness' in sc
assert 'partial' in sc and 'scheduled' in sc

ev=evals.read_text()
assert 'maybeQueueEvaluationAfterClose' in ev
assert 'store_customer_evaluations' in ev
assert 'google_review_enabled' in ev

ba=banks.read_text()
assert 'store_bank_accounts' in ba and 'platform_banks' in ba

for page in ['apps/web/app/social-publishing/page.tsx','apps/web/app/media/page.tsx','apps/web/app/settings/social/page.tsx','apps/web/app/evaluations/page.tsx']:
    assert (root/page).exists(), page

nav=(root/'apps/web/components/store-shell.tsx').read_text()
for href in ['/social-publishing','/media','/evaluations']:
    assert href in nav, href
settings=(root/'apps/web/components/settings-nav.tsx').read_text()
assert '/settings/social' in settings
payment=(root/'apps/web/app/payment-methods/page.tsx').read_text()
assert 'Cuentas bancarias' in payment and '/bank-accounts' in payment

print('PASS: WAMERCIO 2.9.0 social, Google, evaluations and payment expansion contract')
