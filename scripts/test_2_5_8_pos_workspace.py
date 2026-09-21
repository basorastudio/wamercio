from pathlib import Path

root = Path(__file__).resolve().parents[1]
pos = (root/'apps/web/app/pos/page.tsx').read_text(encoding='utf-8')
verify = (root/'scripts/verify-2.5.8.sh').read_text(encoding='utf-8')

checks = [
    ('POS loads categories', "api<Category[]>(`/categories?store_id=${store}`)" in pos),
    ('POS exposes category chips', 'data-testid="pos-category-chips"' in pos and 'activeCategory' in pos),
    ('POS filters by category and search', 'categoryMatch' in pos and 'searchMatch' in pos),
    ('POS catalog toolbar remains sticky', 'data-testid="pos-catalog-toolbar"' in pos and 'sticky top-[66px]' in pos),
    ('POS sale panel fills desktop viewport', 'data-testid="pos-sale-panel"' in pos and 'xl:fixed' in pos and 'xl:bottom-0' in pos),
    ('POS sale body scrolls internally', 'data-testid="pos-sale-scroll"' in pos and 'overflow-y-auto' in pos),
    ('POS total action remains fixed in panel', 'data-testid="pos-sale-footer"' in pos),
    ('Recent orders section removed', 'Pedidos recientes' not in pos and 'Aún no hay pedidos.' not in pos),
    ('POS no longer fetches orders for activity card', '/orders?store_id=' not in pos and 'setOrders' not in pos),
    ('POS workspace regression hook', 'test_2_5_8_pos_workspace.py' in verify),
]

failed = [name for name, ok in checks if not ok]
if failed:
    print('FAIL: POS sticky workspace regressions')
    for name in failed:
        print(' -', name)
    raise SystemExit(1)
print('PASS: POS sticky workspace regressions')
