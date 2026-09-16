from pathlib import Path
root=Path(__file__).resolve().parents[1]
customers=(root/'apps/web/app/customers/page.tsx').read_text(encoding='utf-8')
global_page=(root/'apps/web/app/admin/global-customers/page.tsx').read_text(encoding='utf-8')
server=(root/'services/api/internal/httpapi/server.go').read_text(encoding='utf-8')
detail_view=(root/'apps/web/components/customer-detail-view.tsx').read_text(encoding='utf-8')
location_map=(root/'apps/web/components/customer-location-map.tsx').read_text(encoding='utf-8')
assert 'Puntos' in customers and 'loyalty_points' in customers, 'commercial loyalty card missing'
assert 'Ficha comercial consolidada automáticamente.' not in customers, 'legacy subtitle still present'
assert "new URLSearchParams({store_id:store})" in customers and "params.set('conversation_id'" in customers and "window.location.href=`/conversations?" in customers, 'internal conversation navigation missing'
assert 'Detalles del cliente' in customers, 'customer details button missing'
assert 'CustomerLocationMap' in detail_view and 'profilePictureUrl' in location_map and ('L.marker' in location_map or 'marker(' in location_map), 'global customer map/avatar pin missing'
assert 'onClick={()=>openDetail' in global_page or 'onClick={() => openDetail' in global_page, 'row detail interaction missing'
assert '/admin/global-customers/{id}' in server and 'adminGlobalCustomerDetail' in server, 'admin detail endpoint missing'
assert 'points_balance' in server and 'loyalty_points' in server, 'loyalty points not exposed in customer detail'
print('PASS: WAMERCIO 2.8.7 customer detail experience contract')
