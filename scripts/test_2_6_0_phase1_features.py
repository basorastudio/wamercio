from pathlib import Path

root = Path(__file__).resolve().parents[1]

def read(path):
    return (root / path).read_text(encoding='utf-8')

def require(path, needle, label):
    text = read(path)
    assert needle in text, f"{label}: falta {needle!r} en {path}"

# Version / migration contract
assert (root / 'services/api/migrations/000031_promotions_phase1.up.sql').exists(), 'falta migración de promociones'
assert (root / 'services/api/migrations/000031_promotions_phase1.down.sql').exists(), 'falta rollback de promociones'

server = '\n'.join(p.read_text(encoding='utf-8') for p in (root/'services/api/internal/httpapi').glob('*.go'))
for route in (
    'p.Get("/promotions", s.listPromotions)',
    'p.Post("/promotions", s.createPromotion)',
    'p.Put("/promotions/{id}", s.updatePromotion)',
    'p.Delete("/promotions/{id}", s.deletePromotion)',
    'p.Get("/analytics", s.storeAnalytics)',
    'p.Get("/reservations", s.listReservations)',
    'p.Post("/reservations", s.createReservation)',
    'p.Patch("/reservations/{id}/status", s.updateReservationStatus)',
    'p.Get("/kds", s.kitchenDisplay)',
):
    assert route in server, f'falta ruta {route}'

for handler in (
    'func (s *Server) listPromotions',
    'func (s *Server) createPromotion',
    'func (s *Server) updatePromotion',
    'func (s *Server) storeAnalytics',
    'func (s *Server) listReservations',
    'func (s *Server) createReservation',
    'func (s *Server) updateReservationStatus',
    'func (s *Server) kitchenDisplay',
):
    assert handler in server, f'falta handler {handler}'

# Coupon scheduling must be writable, not only readable.
require('services/api/internal/httpapi/server.go', 'StartsAt', 'cupones programados')
require('services/api/internal/httpapi/server.go', 'EndsAt', 'cupones programados')
require('apps/web/app/coupons/page.tsx', 'Inicio', 'UI de inicio de cupón')
require('apps/web/app/coupons/page.tsx', 'Fin', 'UI de fin de cupón')

# Frontend pages
for path in ('apps/web/app/promotions/page.tsx','apps/web/app/analytics/page.tsx','apps/web/app/reservations/page.tsx','apps/web/app/kds/page.tsx'):
    assert (root / path).exists(), f'falta {path}'

shell = read('apps/web/components/store-shell.tsx')
for label in ('Promociones','Analítica','Reservaciones','KDS'):
    assert label in shell, f'falta navegación {label}'

# QR table + storefront table context
require('apps/web/app/tables/page.tsx', 'QRCodeSVG', 'QR por mesa')
require('apps/web/app/tables/page.tsx', '?table=', 'URL contextual de mesa')
require('apps/web/components/storefront.tsx', 'URLSearchParams', 'preselección de mesa')
require('apps/web/components/storefront.tsx', "params.get('table')", 'lectura de mesa pública')

# Promotion application must leave an audit trail.
migration = read('services/api/migrations/000031_promotions_phase1.up.sql')
for needle in ('CREATE TABLE IF NOT EXISTS promotions','promotion_products','promotion_categories','promotion_id','promotion_name'):
    assert needle in migration, f'migración incompleta: {needle}'
assert 'bestPromotion' in server, 'checkout no calcula promoción automática'
assert 'promotion_name' in server, 'pedido no guarda nombre de promoción'

print('PASS: WAMERCIO 2.6.0 phase 1 feature contract')
