from pathlib import Path
import re

types = Path('apps/web/lib/types.ts').read_text(encoding='utf-8')
server = Path('services/api/internal/httpapi/server.go').read_text(encoding='utf-8')

# The API includes public_url in Store payloads. The shared web Store type must
# model the same field so production type-checking cannot drift from runtime.
if '"public_url": s.storePublicURL' not in server:
    raise SystemExit('FAIL: API store payload no longer exposes public_url')

m = re.search(r'export type Store=\{(.*?)\n\}', types, flags=re.S)
if not m:
    raise SystemExit('FAIL: Store type not found')
store_body = m.group(1)
if not re.search(r'\bpublic_url\s*\??\s*:\s*string\b', store_body):
    raise SystemExit('FAIL: Store type does not declare public_url returned by API')

print('PASS: web Store contract includes public_url')
