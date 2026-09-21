from pathlib import Path

root=Path(__file__).resolve().parents[1]
settings=(root/'apps/web/app/settings/store/page.tsx').read_text(encoding='utf-8')
server=(root/'services/api/internal/httpapi/server.go').read_text(encoding='utf-8')
auth=(root/'services/api/internal/httpapi/customer_auth.go').read_text(encoding='utf-8')
portal=(root/'services/api/internal/httpapi/customer_portal.go').read_text(encoding='utf-8')
access=(root/'apps/web/components/customer-access-modal.tsx').read_text(encoding='utf-8')
address=(root/'apps/web/components/customer-address-form.tsx').read_text(encoding='utf-8')
helper_path=root/'apps/web/lib/store-service-scope.ts'
up=root/'services/api/migrations/000029_store_service_scope.up.sql'
down=root/'services/api/migrations/000029_store_service_scope.down.sql'
helper=helper_path.read_text(encoding='utf-8') if helper_path.exists() else ''
checks=[
 ('service scope migration up exists', up.exists()),
 ('service scope migration down exists', down.exists()),
 ('migration defines service_scope', up.exists() and 'service_scope' in up.read_text(encoding='utf-8')),
 ('settings offers three scope cards', all(x in settings for x in ['Nacional','Provincial','Municipal','service_scope'])),
 ('settings preview renders business QR', 'QRCodeSVG' in settings and 'Escanea para abrir' in settings),
 ('redundant tables callout removed', 'Gestión de mesas habilitada' not in settings and 'Abrir Gestión de mesas' not in settings),
 ('public/settings API expose service_scope', server.count('service_scope') >= 4),
 ('customer registration applies store scope', 'applyStoreServiceScopeToAddress' in auth),
 ('customer address create/update apply store scope', portal.count('applyStoreServiceScopeToAddress') >= 2),
 ('customer access modal uses scope helper', 'store-service-scope' in access and 'scopeFieldVisibility' in access),
 ('saved address form uses scope helper', 'store-service-scope' in address and 'scopeFieldVisibility' in address),
 ('frontend scope helper exists', helper_path.exists()),
 ('frontend helper defines all scope values', all(x in helper for x in ["'national'","'provincial'","'municipal'"])),
]
failed=[name for name,ok in checks if not ok]
if failed:
 print('FAIL: store scope + QR regressions')
 for name in failed: print(' -',name)
 raise SystemExit(1)
print('PASS: store scope + QR regressions')
