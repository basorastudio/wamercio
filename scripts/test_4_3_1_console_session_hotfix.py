from pathlib import Path

root = Path(__file__).resolve().parents[1]
server = (root/'services/api/internal/httpapi/server.go').read_text(encoding='utf-8')
portal = (root/'services/api/internal/httpapi/customer_portal.go').read_text(encoding='utf-8')
storefront = (root/'apps/web/components/storefront.tsx').read_text(encoding='utf-8')
layout = (root/'apps/web/app/layout.tsx').read_text(encoding='utf-8')

assert 'api.Get("/customer/session", s.customerSession)' in server
assert 'func (s *Server) customerSession' in portal
assert 'http.StatusOK, map[string]any{"authenticated": false}' in portal
assert "api<any>('/customer/session')" in storefront
assert "api<any>('/customer/me').then(applyCustomer)" not in storefront
assert "'mobile-web-app-capable':'yes'" in layout
assert 'appleWebApp' in layout

joined = '\n'.join(p.read_text(encoding='utf-8', errors='ignore') for p in (root/'apps/web').rglob('*') if p.is_file() and 'node_modules' not in p.parts and '.next' not in p.parts)
assert 'static.cloudflareinsights.com' not in joined
assert 'Target website not loaded' not in joined

assert (root/'VERSION').read_text().strip() == '4.3.1'
assert '"version": "4.3.1"' in (root/'apps/web/package.json').read_text()
assert 'wamercio-store-v4.3.1' in (root/'apps/web/public/sw.js').read_text()
print('PASS: WAMERCIO 4.3.1 console/session/PWA hotfix')
