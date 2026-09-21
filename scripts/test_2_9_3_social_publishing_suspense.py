from pathlib import Path

root=Path('apps/web/app')
social=root/'social-publishing/page.tsx'
s=social.read_text(encoding='utf-8')
assert 'Suspense' in s, 'Suspense import missing'
assert 'function SocialPublishingContent' in s, 'search-param consumer must be moved into child component'
assert '<Suspense' in s and '<SocialPublishingContent' in s, 'page must wrap search-param consumer in Suspense'
outer=s[s.find('export default function SocialPublishing'):s.find('function SocialPublishingContent')]
assert 'useSearchParams(' not in outer, 'default page still calls useSearchParams outside Suspense'

for p in root.rglob('page.tsx'):
    text=p.read_text(encoding='utf-8')
    if 'useSearchParams(' not in text:
        continue
    assert 'Suspense' in text and '<Suspense' in text, f'{p}: useSearchParams without Suspense boundary'

print('PASS: WAMERCIO 2.9.3 social-publishing Suspense contract')
