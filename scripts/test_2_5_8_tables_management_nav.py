from pathlib import Path
root=Path(__file__).resolve().parents[1]
nav=(root/'apps/web/components/store-shell.tsx').read_text(encoding='utf-8')
settings=(root/'apps/web/app/settings/store/page.tsx').read_text(encoding='utf-8')
tables=root/'apps/web/app/tables/page.tsx'
verify=(root/'scripts/verify-2.5.8.sh').read_text(encoding='utf-8')
page=tables.read_text(encoding='utf-8') if tables.exists() else ''
checks=[
 ('Tables management page exists', tables.exists()),
 ('Sidebar exposes conditional Gestión de mesas', 'Gestión de mesas' in nav and 'dineInNav' in nav),
 ('Store selector broadcasts active store changes', 'wamercio:active-store-changed' in nav),
 ('Settings keeps only dine-in toggle', 'Mesas y reservas' in settings and 'Administrar mesas' not in settings),
 ('Tables page manages duration', 'Duración de la reserva' in page and 'reservation_duration_minutes' in page),
 ('Tables page supports create update archive', '/tables' in page and 'Agregar mesa' in page and 'Archivar' in page),
 ('Tables nav regression hook', 'test_2_5_8_tables_management_nav.py' in verify),
]
failed=[n for n,ok in checks if not ok]
if failed:
 print('FAIL: tables management navigation regressions')
 for n in failed: print(' -',n)
 raise SystemExit(1)
print('PASS: tables management navigation regressions')
