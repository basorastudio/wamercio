from pathlib import Path

root=Path(__file__).resolve().parents[1]
server=(root/'services/api/internal/httpapi/server.go').read_text(encoding='utf-8')
bulk=(root/'services/api/internal/httpapi/tables_bulk.go')
tables=(root/'apps/web/app/tables/page.tsx').read_text(encoding='utf-8')

def need(ok,msg):
    if not ok:
        raise SystemExit('FAIL: '+msg)

need('p.Post("/tables/bulk", s.createStoreTablesBulk)' in server, 'bulk tables route must exist')
need(bulk.exists(), 'bulk table handler file must exist')
if bulk.exists():
    text=bulk.read_text(encoding='utf-8')
    need('func (s *Server) createStoreTablesBulk' in text, 'bulk handler must exist')
    need('quantity > 500' in text, 'bulk creation must cap each operation at 500 tables')
    need('Begin(r.Context())' in text, 'bulk creation must be transactional')
    need('tx.Rollback' in text and 'tx.Commit' in text, 'bulk creation must roll back atomically on conflict')
    need('suffixType' in text and 'alphabeticSuffix' in text, 'bulk creation must support numeric/alphabetic/mixed suffixes')
    need('No se creó ninguna mesa' in text, 'duplicate conflicts must explain that the batch was not partially created')

need("'individual'|'automatic'" in tables, 'tables UI must expose individual/automatic mode state')
need('Creación automática' in tables, 'tables UI must expose automatic creation mode')
need('Nombre base' in tables, 'tables UI must expose configurable base name')
need('Numérico' in tables and 'Alfabético' in tables and 'Mixto' in tables, 'tables UI must expose all suffix strategies')
need('Cantidad' in tables and 'Crear ' in tables and ' mesas' in tables, 'tables UI must expose quantity and batch CTA')
need('/tables/bulk' in tables, 'tables UI must use the bulk endpoint')
need('Vista previa' in tables, 'tables UI must preview generated table names')
need('500' in tables, 'tables UI must enforce the 500-table operation limit')
print('PASS: WAMERCIO 2.8.6 bulk table creation contract')
