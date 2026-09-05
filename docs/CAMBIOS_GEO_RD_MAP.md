# Cambios — integración GEO RD MAP

## Backend Go

- Cliente nativo `internal/geord` con `X-API-Key`.
- Selectores Provincia → Ciudad → Barrio.
- Search/autocomplete/reverse geocoding.
- Confirmación de selecciones externas.
- Validación territorial de direcciones.
- Sugerencias de barrios personalizados con `X-Tenant-ID`.
- Consulta y detalle de geocercas.
- Importación/vinculación de geocercas a zonas de delivery.
- Comprobación `contains` en checkout.
- Routing y resumen distancia/ETA.
- Proxy de configuración, GeoJSON y MVT de mapa.
- Rate limiting público en Redis.

## PostgreSQL

Migración `006_geo_rd_map.sql`:

- IDs GEO en negocios y clientes;
- coordenadas de clientes;
- `geo_geofence_id` + snapshot GeoJSON en zonas;
- zona, coordenadas, distancia y ETA en pedidos;
- `geo_city_id` en marketplaces.

## Frontend

- `GeoAddressPicker` reutilizable.
- búsqueda/autocomplete;
- “Mi ubicación”;
- selectores progresivos;
- sugerencia de barrio faltante;
- dirección y referencia;
- indicador de coordenadas verificadas;
- cotización de delivery con tarifa, distancia, ETA y zona;
- panel de delivery con catálogo de geocercas y previsualización de cobertura;
- marketplaces administrados por territorio GEO.

## Reglas de seguridad

- API key solo en backend/Dokploy.
- El navegador nunca decide la tarifa final.
- El checkout revalida ubicación, zona y ruta.
- wamercio no crea/edit geocercas porque ese endpoint no forma parte del OpenAPI público recibido.
