from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
component = (root/'apps/web/components/customer-location-map.tsx').read_text(encoding='utf-8')
layout = (root/'apps/web/app/layout.tsx').read_text(encoding='utf-8')
package = json.loads((root/'apps/web/package.json').read_text(encoding='utf-8'))
address_form = (root/'apps/web/components/customer-address-form.tsx').read_text(encoding='utf-8')

def require(cond, msg):
    if not cond:
        raise AssertionError(msg)

require('leaflet' in package.get('dependencies', {}), 'leaflet dependency is required for the embedded interactive map')
require('@types/leaflet' in package.get('dependencies', {}), '@types/leaflet dependency is required for strict TypeScript builds')
require("leaflet/dist/leaflet.css" in layout, 'Leaflet CSS must be loaded globally')
require("from 'leaflet'" in component or 'import(\'leaflet\')' in component or 'import("leaflet")' in component, 'customer map must use Leaflet')
require('L.map(' in component or '.map(' in component and 'leaflet' in component.lower(), 'customer map must instantiate an interactive map')
require('L.marker(' in component or '.marker(' in component, 'customer map must attach the customer marker to geographic coordinates')
require('dragging' in component or 'scrollWheelZoom' in component or 'zoomControl' in component, 'interactive map controls must be explicitly enabled')
require('<iframe' not in component, 'Google Maps iframe must be removed from the interactive customer map')
require('google.com/maps/search' not in component and 'Abrir en Maps' not in component, 'map clicks must not navigate to Google Maps')
require('CustomerLocationMap' in address_form, 'customer address form must keep using the shared customer map component')
print('PASS: WAMERCIO 2.8.11 interactive customer map contract')
