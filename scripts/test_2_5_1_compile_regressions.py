from pathlib import Path
import re, sys

server = Path('services/api/internal/httpapi/server.go').read_text(encoding='utf-8')
sso = Path('services/api/internal/httpapi/customer_sso.go').read_text(encoding='utf-8')

m = re.search(r'func \(s \*Server\) checkout\(.*?\n}\n', server, flags=re.S)
if not m:
    raise SystemExit('FAIL: checkout function not found')
checkout = m.group(0)

# Go identifiers for variables and types share the same function scope. The
# host-resolution result must not shadow the local resolved item type.
if re.search(r'\bresolved\s*,\s*err\s*:=\s*s\.resolveStoreHost', checkout):
    raise SystemExit('FAIL: checkout shadows local type resolved with host variable resolved')

# customer_sso.go no longer uses the time package. Keep the import clean so
# go build does not fail on an unused import.
if re.search(r'(?m)^\s*"time"\s*$', sso):
    raise SystemExit('FAIL: customer_sso.go imports unused time package')

print('PASS: 2.5.1 compile regressions')
