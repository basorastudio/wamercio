from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
server = (root / 'services/api/internal/httpapi/server.go').read_text(encoding='utf-8')
proxy = (root / 'services/api/internal/httpapi/social_proxy.go').read_text(encoding='utf-8')
commerce = (root / 'services/api/internal/httpapi/social_commerce.go').read_text(encoding='utf-8')
ci = (root / '.github/workflows/ci.yml').read_text(encoding='utf-8')


def function_body(source: str, name: str) -> str:
    marker = f'func (s *Server) {name}('
    start = source.find(marker)
    assert start >= 0, f'missing function {name}'
    brace = source.find('{', start)
    assert brace >= 0
    depth = 0
    for i in range(brace, len(source)):
        ch = source[i]
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return source[brace + 1:i]
    raise AssertionError(f'unclosed function {name}')

conversation = function_body(server, 'conversationDetails')
customers = function_body(server, 'listCustomers')

# The production failure declared chequeEnabled in conversationContext where it was unused.
assert 'var chequeEnabled bool' not in conversation, 'chequeEnabled must not be declared in conversationContext'
# The same variable is required in listCustomers because the SQL row scans cu.cheque_enabled.
assert 'var chequeEnabled bool' in customers, 'listCustomers must declare chequeEnabled'
assert re.search(r'rows\.Scan\([^\n]*&chequeEnabled', customers), 'listCustomers must scan chequeEnabled'

# Social publishing/proxy code calls this helper with two and three candidate values.
assert proxy.count('func firstNonBlank(') == 1, 'firstNonBlank must be declared exactly once in httpapi'
assert 'func firstNonBlank(values ...string) string' in proxy, 'firstNonBlank must be variadic'
for body in (proxy, commerce):
    assert 'firstNonBlank(' in body, 'social code should use firstNonBlank'

# CI must use the same major runtimes as the production Dockerfiles and compile exact entrypoints.
for required in [
    "go-version: '1.27.1'",
    "node-version: '20'",
    'go build -mod=readonly -trimpath -ldflags="-s -w" -o /tmp/wamercio-api ./cmd/api',
    'go build -mod=readonly -trimpath -ldflags="-s -w" -o /tmp/wamercio-whatsapp ./cmd/bridge',
    'go build -mod=readonly -trimpath -ldflags="-s -w" -o /tmp/domain-router ./cmd/router',
    'npm run build',
    'docker compose config',
]:
    assert required in ci, f'CI missing production-equivalent gate: {required}'

print('PASS: WAMERCIO 2.9.1 API production compile hotfix contract')
