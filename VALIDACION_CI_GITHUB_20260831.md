# Validación CI GitHub — 31/08/2026

## Incidencia

El commit de integración GEO RD MAP hacía fallar simultáneamente:

- `Frontend quality / verify (push)`
- `Publicar imágenes de WAMERCIO en GHCR / publish (push)`

Los checks de backend y de integridad de fuente sí pasaban.

## Causa raíz

La incorporación de geocercas añadió helpers en `frontend/src/screens/MyCart.tsx` con parámetros por defecto `{}` sin tipado explícito:

- `geoPointFromAddress(address = {})`
- `geoPolygonFromZone(zone = {})`

TypeScript infiere esos parámetros como `{}`. Por ello `npm run typecheck` rechaza accesos como `address.lat`, `address.location`, `zone.geoPolygon` y `zone.geo_polygon` con `TS2339`.

El workflow de publicación de imágenes ejecuta el mismo `npm run typecheck` dentro del Dockerfile del frontend, por lo que el mismo error detenía también la construcción/publicación de `wamercio-frontend` en GHCR. No era un fallo independiente de GHCR.

## Corrección

Se tiparon explícitamente los datos flexibles de dirección/zona usados por la capa de compatibilidad del checkout y se tipó el polígono como una lista de puntos `{lat,lng}`.

Esto conserva compatibilidad con los modelos camelCase/snake_case recibidos desde API y elimina la inferencia incorrecta de `{}`.

## Verificaciones locales posibles en este entorno

- `node frontend/scripts/verify-production-surface.mjs`: correcto.
- Revisión de `frontend-quality.yml`: el fallo relevante ocurre en `npm run typecheck` antes de `npm run build`.
- Revisión de `frontend/Dockerfile`: la imagen GHCR ejecuta `npm run typecheck && npm run build`, confirmando que ambas fallas tenían la misma causa de frontend.
- Análisis incremental de TypeScript: los `TS2339` introducidos por la integración GEO RD MAP estaban concentrados en `MyCart.tsx` y quedan corregidos.

La instalación completa de `node_modules` no puede reproducirse en este sandbox por falta de acceso directo al registro npm; GitHub Actions sí dispone de red para ejecutar `npm ci`.
