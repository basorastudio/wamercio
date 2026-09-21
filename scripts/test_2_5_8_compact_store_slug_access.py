from pathlib import Path

root = Path(__file__).resolve().parents[1]
server = (root/'services/api/internal/httpapi/server.go').read_text()
server_test = (root/'services/api/internal/httpapi/server_test.go').read_text()
access = (root/'apps/web/components/access-modal.tsx').read_text()
owners = (root/'apps/web/app/admin/owners/page.tsx').read_text()
landing = (root/'apps/web/components/platform-landing.tsx').read_text()
landing_admin = (root/'apps/web/app/admin/landing/page.tsx').read_text()
dynamic_roots = sorted(p.name for p in (root/'apps/web/app').iterdir() if p.is_dir() and p.name.startswith('[') and p.name.endswith(']'))
shortcut_path = root/'apps/web/app/[slug]/page.tsx'
shortcut = shortcut_path.read_text() if shortcut_path.exists() else ''

checks = [
    ('backend has compact store slug helper', 'func storeSlugify(' in server),
    ('safe store slug uses compact helper', 'slug := storeSlugify(value)' in server),
    ('reserved store checks normalize compact identifiers', 'func isReservedStoreSlug(' in server and 'storeSlugify(key) == slug' in server),
    ('backend regression covers pizzeriademo', '"Pizzería Demo"' in server_test and '"pizzeriademo"' in server_test),
    ('registration preview imports compact store slug', "from '@/lib/store-slug'" in access and 'storeSlugify(finalBusinessName)' in access),
    ('owner preview imports compact store slug', "from '@/lib/store-slug'" in owners and 'storeSlugify(finalBusinessName)' in owners),
    ('landing uses one unified ACCESO header action', "nav_access_label,'Acceso'" in landing and 'nav_register_label' not in landing),
    ('landing editor no longer exposes registration header label', 'nav_register_label' not in landing_admin and "nav_access_label:'Acceso'" in landing_admin),
    ('root dynamic route uses one canonical slug name', dynamic_roots == ['[slug]']),
    ('short public path only redirects from the platform host', "from 'next/headers'" in shortcut and 'isPlatform' in shortcut and 'notFound()' in shortcut and 'params:{slug:string}' in shortcut and 'params.slug' in shortcut),
]
failed = [name for name, ok in checks if not ok]
if failed:
    for name in failed:
        print('FAIL:', name)
    raise SystemExit(1)
print('PASS: compact store slug and unified access regressions')
