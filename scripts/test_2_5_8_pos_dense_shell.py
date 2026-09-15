from pathlib import Path
root=Path(__file__).resolve().parents[1]
pos=(root/'apps/web/app/pos/page.tsx').read_text(encoding='utf-8')
shell=(root/'apps/web/components/store-shell.tsx').read_text(encoding='utf-8')
css=(root/'apps/web/app/globals.css').read_text(encoding='utf-8')
verify=(root/'scripts/verify-2.5.8.sh').read_text(encoding='utf-8')
checks=[
 ('POS cart is structural fixed right rail', 'data-testid="pos-sale-panel"' in pos and 'xl:fixed' in pos and 'xl:top-0' in pos and 'structuralRightRail' in pos and 'xl:bottom-0' in pos),
 ('POS catalog reserves fixed cart width', 'pos-catalog-area' in pos and 'xl:pr-[420px]' in pos),
 ('POS product grid is dense', 'pos-product-grid' in pos and 'pos-product-card' in pos),
 ('Expanded sidebar has five desktop columns', '[data-sidebar-collapsed="false"] .pos-product-grid' in css and 'repeat(5' in css),
 ('Collapsed sidebar has six desktop columns', '[data-sidebar-collapsed="true"] .pos-product-grid' in css and 'repeat(6' in css),
 ('Shell exposes sidebar collapsed state', 'data-sidebar-collapsed={collapsed?' in shell),
 ('Dense shell regression hook', 'test_2_5_8_pos_dense_shell.py' in verify),
]
failed=[n for n,ok in checks if not ok]
if failed:
 print('FAIL: POS dense structural shell regressions')
 for n in failed: print(' -',n)
 raise SystemExit(1)
print('PASS: POS dense structural shell regressions')
