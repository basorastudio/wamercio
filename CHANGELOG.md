# WAMERCIO 2.8.11 — Mapa interactivo con marcador geográfico real

## Correcciones

- El mapa de ubicación del cliente vuelve a ser completamente interactivo dentro del modal y del perfil.
- Se eliminó la navegación automática hacia Google Maps al pulsar el mapa o el pin.
- Se sustituyó el `iframe` por Leaflet con teselas de OpenStreetMap, permitiendo zoom, desplazamiento, gestos táctiles y controles nativos sin salir de WAMERCIO.
- La foto de WhatsApp ahora es un marcador geográfico real anclado a `latitude`/`longitude`, por lo que permanece unida a la ubicación al hacer zoom o desplazar el mapa.
- El mismo componente interactivo se reutiliza en Superadmin, ficha del negocio y Mi perfil > Direcciones.
- No hay migraciones nuevas; la última continúa siendo `000036_customer_address_geolocation`.

## Dependencias web

- `leaflet` 1.9.4
- `@types/leaflet` 1.9.16
