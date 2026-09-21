from pathlib import Path

root = Path(__file__).resolve().parents[1]

order = (root/'apps/web/app/order/[token]/page.tsx').read_text()
promotions = (root/'apps/web/app/promotions/page.tsx').read_text()
social_settings = (root/'apps/web/app/settings/social/page.tsx').read_text()
social_publishing = (root/'apps/web/app/social-publishing/page.tsx').read_text()
google_go = (root/'services/api/internal/httpapi/google_business.go').read_text()
env = (root/'.env.example').read_text()
version = (root/'VERSION').read_text().strip()
package = (root/'apps/web/package.json').read_text()

# Public/order payment expansion must expose cheque and selected bank account.
assert "cheque:'Cheque'" in order or "cheque: 'Cheque'" in order, 'order tracking missing Cheque label'
assert 'payment_account' in order, 'order tracking missing selected payment account details'

# Promotions must open the social composer with prefill context.
assert '/social-publishing?' in promotions and 'promotion_id=' in promotions, 'promotions missing social publishing CTA'
assert 'useSearchParams' in social_publishing and 'promotion_id' in social_publishing, 'social composer missing promotion prefill'

# Google Business workspace must actually expose profile/reviews/performance/media operations.
for endpoint in ['/profile', '/reviews', '/performance', '/media']:
    assert endpoint in social_settings, f'Google Business workspace missing {endpoint} usage'
assert 'reply' in social_settings.lower(), 'Google review reply workflow missing'
assert 'Rendimiento' in social_settings, 'Google performance UI missing'

# Google hours sync must normalize both directions instead of storing raw provider payloads.
assert 'googleHoursToStoreHours' in google_go, 'missing Google -> WAMERCIO hours normalizer'
assert 'storeHoursToGoogleHours' in google_go, 'missing WAMERCIO -> Google hours normalizer'

# Broker/proxy settings must be documented for deployment.
for key in [
    'WAMERCIO_SOCIAL_AUTH_PROXY_ENABLED',
    'WAMERCIO_SOCIAL_AUTH_PROXY_BASE_URL',
    'WAMERCIO_SOCIAL_AUTH_PROXY_REDIRECT_URI',
    'WAMERCIO_SOCIAL_PUBLISH_POLL_SECONDS',
]:
    assert key in env, f'missing {key} in .env.example'

assert version.startswith('2.9.'), f'expected VERSION 2.9.x, got {version}'
assert f'\"version\": \"{version}\"' in package, f'web package version not {version}'

print('PASS: WAMERCIO 2.9.0 release integration contract')
