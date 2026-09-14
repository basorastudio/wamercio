from pathlib import Path
import re, sys
root=Path(__file__).resolve().parents[1]
errors=[]
def need(path, text, msg):
    p=root/path
    if not p.exists(): errors.append(f'{msg}: missing {path}'); return
    s=p.read_text(errors='ignore')
    if text not in s: errors.append(f'{msg}: {text!r} not found in {path}')
def forbid(path, text, msg):
    p=root/path
    if p.exists() and text in p.read_text(errors='ignore'): errors.append(f'{msg}: forbidden {text!r} in {path}')

need(Path('services/api/migrations/000019_multitenant_domains.up.sql'),'CREATE TABLE IF NOT EXISTS store_domains','store_domains migration')
need(Path('services/api/internal/httpapi/store_hosts.go'),'resolveStoreHost','host resolver')
need(Path('services/api/internal/httpapi/server.go'),'api.Get("/public/store", s.publicStore)','host public store route')
need(Path('services/api/internal/httpapi/server.go'),'api.Post("/public/store/checkout", s.checkout)','host checkout route')
forbid(Path('services/api/internal/httpapi/server.go'),'api.Get("/public/stores/{slug}"','legacy slug API route removed')
if (root/'apps/web/app/[slug]/page.tsx').exists(): errors.append('legacy app/[slug]/page.tsx must be removed')
if (root/'apps/web/app/store/[slug]/page.tsx').exists(): errors.append('legacy app/store/[slug]/page.tsx must be removed')
need(Path('apps/web/app/page.tsx'),'headers','root host boundary')
need(Path('apps/web/app/manifest.webmanifest/route.ts'),'manifest','dynamic tenant manifest')
need(Path('apps/web/components/storefront-mobile-nav.tsx'),'safe-area-inset-bottom','mobile storefront safe area')
need(Path('infra/traefik/wamercio.yml'),'HostRegexp','wildcard tenant router')
need(Path('docker-compose.yml'),'domain-router','custom domain router sync service')
need(Path('apps/web/app/admin/settings/page.tsx'),'https://{slug}.ltd.do','host based domain settings')
need(Path('VERSION'),'2.5.1','version 2.5.1')

need(Path('apps/web/components/store-domains-settings.tsx'),'Agregar dominio personalizado','store custom domain UI')
need(Path('apps/web/components/settings-nav.tsx'),"id:'domains'",'store domain settings navigation')
need(Path('services/domain-router/cmd/router/main.go'),'SELECT hostname FROM store_domains','custom domain router sync')
need(Path('services/api/internal/httpapi/customer_sso.go'),'customerSSOStart','custom domain customer SSO')
need(Path('services/api/internal/httpapi/customer_sso.go'),'customerSSOExchange','custom domain customer SSO exchange')
need(Path('apps/web/components/customer-shell.tsx'),'safe-area-inset-bottom','customer mobile safe area')
need(Path('apps/web/components/store-shell.tsx'),'safe-area-inset-bottom','merchant mobile safe area')
forbid(Path('apps/web/app/stores/page.tsx'),'window.location.origin}/${qr.slug','legacy path QR')

if errors:
    print('FAIL: WAMERCIO 2.5.1 multitenant host regression')
    for e in errors: print(' -',e)
    sys.exit(1)
print('PASS: WAMERCIO 2.5.1 multitenant host regression')
