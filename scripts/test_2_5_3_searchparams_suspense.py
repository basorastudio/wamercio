from pathlib import Path

FILES = [
    Path('apps/web/app/auth/customer/callback/page.tsx'),
    Path('apps/web/app/customer-sso/page.tsx'),
]

errors = []
for path in FILES:
    text = path.read_text(encoding='utf-8')
    if 'useSearchParams' not in text:
        errors.append(f'{path}: expected useSearchParams')
        continue
    if 'Suspense' not in text or '<Suspense' not in text or '</Suspense>' not in text:
        errors.append(f'{path}: useSearchParams must be rendered under React Suspense')
    if 'fallback=' not in text:
        errors.append(f'{path}: Suspense boundary needs an explicit fallback')

if errors:
    print('FAIL: Next.js search params Suspense regression')
    for error in errors:
        print(' -', error)
    raise SystemExit(1)

print('PASS: Next.js search params Suspense regression')
