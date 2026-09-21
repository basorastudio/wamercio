from pathlib import Path

root = Path(__file__).resolve().parents[1]
page_path = root / 'apps/web/app/admin/settings/page.tsx'
page = page_path.read_text(encoding='utf-8')

checks = {
    'desktop settings workspace is viewport bounded': 'lg:h-[calc(100dvh-9rem)]' in page and 'lg:min-h-0' in page,
    'settings menu owns its vertical scroll': 'lg:overflow-y-auto' in page[page.find('<aside className='):page.find('</aside>')],
    'settings menu fills bounded workspace': 'lg:h-full' in page[page.find('<aside className='):page.find('</aside>')],
    'settings canvas owns overflow only when needed': 'lg:overflow-y-auto' in page[page.find('<section className='):page.find('</section>')],
    'settings canvas fills bounded workspace': 'lg:h-full' in page[page.find('<section className='):page.find('</section>')],
    'mobile keeps natural document flow': 'grid gap-5 lg:grid-cols-[250px_1fr]' in page,
}

failed = [name for name, ok in checks.items() if not ok]
if failed:
    raise SystemExit('FAIL: ' + ', '.join(failed))
print('PASS: admin settings menu/canvas independent scrolling')
