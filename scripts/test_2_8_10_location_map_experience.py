from pathlib import Path
root=Path(__file__).resolve().parents[1]

def text(p): return (root/p).read_text(encoding='utf-8')

view=text(Path('apps/web/components/customer-detail-view.tsx'))
mapc=text(Path('apps/web/components/customer-location-map.tsx')) if (root/'apps/web/components/customer-location-map.tsx').exists() else ''
form=text(Path('apps/web/components/customer-address-form.tsx'))
profile=text(Path('apps/web/app/cliente/perfil/page.tsx'))

assert 'function Metric' not in view and '<Metric ' not in view, 'customer detail still shows commercial metric cards'
assert 'Identidad verificada' not in view and 'WhatsApp verificado' not in view, 'customer detail still shows verification badges'
assert "CustomerLocationMap" in view, 'customer detail must use shared location map'
assert 'customer-location-map' in view, 'customer detail missing shared map import'
assert mapc, 'shared customer location map component is missing'
assert 'pointer-events-none' in mapc, 'embedded map must not pan/zoom independently from custom avatar pin'
assert 'www.google.com/maps/search/?api=1&query=' in mapc or 'www.google.com/maps?q=' in mapc, 'map click must open Google Maps coordinates'
assert 'ProfileAvatar' not in mapc, 'shared map should be profile-agnostic and receive avatar data'
assert 'profilePictureUrl' in mapc, 'shared map missing WhatsApp profile image support'
assert 'CustomerLocationMap' in form, 'address form must render map preview after coordinates are captured'
assert 'profilePictureUrl' in form, 'address form must receive customer WhatsApp profile image'
assert 'profilePictureUrl={customer.profile_picture_url}' in profile or 'profilePictureUrl={customer?.profile_picture_url}' in profile, 'profile page must pass WhatsApp image to address form'
print('PASS: WAMERCIO 2.8.10 synchronized customer map experience contract')
