from pathlib import Path
root=Path(__file__).resolve().parents[1]

def text(path): return (root/path).read_text(encoding='utf-8')

up=root/'services/api/migrations/000033_phase3_growth_experience.up.sql'
down=root/'services/api/migrations/000033_phase3_growth_experience.down.sql'
assert up.exists() and down.exists(), 'missing phase 3 migration pair'
sql=text(Path('services/api/migrations/000033_phase3_growth_experience.up.sql'))
for table in ['product_media','product_translations','product_reviews','kds_stations','kds_station_categories','store_qr_styles','loyalty_programs','loyalty_accounts','loyalty_ledger']:
    assert f'CREATE TABLE IF NOT EXISTS {table}' in sql, f'missing {table}'

server=text(Path('services/api/internal/httpapi/server.go'))
for route in ['/reviews','/loyalty','/qr-style','/kds/stations','/products/{id}/experience','/public/store/reviews']:
    assert route in server, f'missing route {route}'

for fname,needles in {
 'services/api/internal/httpapi/product_experience.go':['getProductExperience','updateProductExperience','listPublicReviews','createPublicReview'],
 'services/api/internal/httpapi/loyalty.go':['getLoyaltyProgram','updateLoyaltyProgram','listLoyaltyAccounts','awardOrderLoyalty'],
 'services/api/internal/httpapi/kds_stations.go':['listKDSStations','createKDSStation','updateKDSStation','deleteKDSStation','station_id'],
 'services/api/internal/httpapi/qr_styles.go':['getQRStyle','updateQRStyle'],
}.items():
    p=root/fname
    assert p.exists(), f'missing {fname}'
    body=p.read_text(encoding='utf-8')
    for n in needles: assert n in body, f'{fname}: missing {n}'

for page in ['apps/web/app/reviews/page.tsx','apps/web/app/loyalty/page.tsx']:
    assert (root/page).exists(), f'missing {page}'
products=text(Path('apps/web/app/catalog/products/page.tsx'))
for key in ['Galería','Traducciones','product_media','product_translations']:
    assert key in products, f'products UI missing {key}'
kds=text(Path('apps/web/app/kds/page.tsx'))
for key in ['Estaciones','station_id']:
    assert key in kds, f'KDS UI missing {key}'
tables=text(Path('apps/web/app/tables/page.tsx'))
for key in ['Diseñar QR','qr-style','Personalizar esta mesa','Usar diseño general','table_id']:
    assert key in tables, f'table QR designer missing {key}'
storefront=text(Path('apps/web/components/storefront.tsx'))
for key in ['product_media','product_translations','Reseñas','loyalty']:
    assert key in storefront, f'storefront missing {key}'
shell=text(Path('apps/web/components/store-shell.tsx'))
for key in ['Reseñas','Fidelización']:
    assert key in shell, f'navigation missing {key}'
print('PASS: WAMERCIO 2.8.0 phase 3 feature contract')
