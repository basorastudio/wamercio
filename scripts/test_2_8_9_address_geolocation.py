from pathlib import Path
root=Path(__file__).resolve().parents[1]

def text(p): return (root/p).read_text(encoding='utf-8')

up=root/'services/api/migrations/000036_customer_address_geolocation.up.sql'
down=root/'services/api/migrations/000036_customer_address_geolocation.down.sql'
assert up.exists() and down.exists(), 'missing 000036 geolocation migration pair'
uptext=up.read_text(encoding='utf-8')
for token in ['latitude','longitude','customer_addresses']:
    assert token in uptext, f'migration missing {token}'

auth=text(Path('services/api/internal/httpapi/customer_auth.go'))
for token in ['Latitude','Longitude','json:"latitude"','json:"longitude"']:
    assert token in auth, f'customerAddressInput missing {token}'

portal=text(Path('services/api/internal/httpapi/customer_portal.go'))
for token in ['latitude','longitude','in.Latitude','in.Longitude']:
    assert token in portal, f'portal missing geolocation persistence: {token}'

form=text(Path('apps/web/components/customer-address-form.tsx'))
assert 'Obtener mi ubicación' in form, 'profile address form missing location CTA'
assert 'navigator.geolocation.getCurrentPosition' in form, 'profile address form missing browser geolocation'
assert 'Referencia' not in form, 'profile address form still exposes Referencia'

access=text(Path('apps/web/components/customer-access-modal.tsx'))
assert 'Obtener mi ubicación' in access, 'registration address step missing location CTA'
assert 'navigator.geolocation.getCurrentPosition' in access, 'registration address step missing geolocation'
assert '<label className="label">Referencia</label>' not in access, 'registration still exposes Referencia'

detail=text(Path('apps/web/components/customer-detail-view.tsx'))
location_map=text(Path('apps/web/components/customer-location-map.tsx'))
assert 'primary?.latitude' in detail and 'primary?.longitude' in detail, 'detail map does not prefer exact coordinates'
assert 'CustomerLocationMap' in detail, 'detail map component missing'
assert "address={primary?.map_query||primary?.formatted_address||''}" in detail, 'detail map fallback removed unexpectedly'
assert 'profilePictureUrl={profile.profile_picture_url}' in detail, 'WhatsApp avatar pin missing'
assert 'profilePictureUrl' in location_map and ('L.marker' in location_map or 'marker(' in location_map), 'shared exact-location map missing coordinate-anchored avatar pin'

print('PASS: WAMERCIO 2.8.9 customer address geolocation contract')
