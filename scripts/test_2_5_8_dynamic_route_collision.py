from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
app = root / 'apps/web/app'
root_dynamic_dirs = sorted(p for p in app.iterdir() if p.is_dir() and re.fullmatch(r'\[[^/]+\]', p.name))

if len(root_dynamic_dirs) != 1:
    names = ', '.join(p.name for p in root_dynamic_dirs) or '(none)'
    raise SystemExit(f'FAIL: expected exactly one root dynamic App Router segment, found: {names}')

route = root_dynamic_dirs[0]
if route.name != '[slug]':
    raise SystemExit(f'FAIL: canonical root dynamic segment must be [slug], got {route.name}')

page = route / 'page.tsx'
if not page.exists():
    raise SystemExit('FAIL: canonical [slug]/page.tsx is missing')

text = page.read_text(encoding='utf-8')
required = ['params:{slug:string}', 'params.slug', "redirect(`https://${slug}.${root}`)"]
for token in required:
    if token not in text:
        raise SystemExit(f'FAIL: canonical shortcut route missing {token!r}')

for forbidden in ('storeSlug', '[storeSlug]'):
    if forbidden in text:
        raise SystemExit(f'FAIL: canonical shortcut route still references {forbidden!r}')

print('PASS: Next.js root dynamic route collision guard')
