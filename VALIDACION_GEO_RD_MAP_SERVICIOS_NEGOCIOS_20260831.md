# Validación — GEO RD MAP como capa geoespacial de WAMERCIO

Fecha: 2026-08-31

## Alcance implementado

- GEO RD MAP central disponible desde SuperAdmin y todos los tenants.
- Catálogo territorial y barrios personalizados centralizados.
- Geocodificación/reversa para negocio y cliente.
- Routing GEO RD MAP como primera opción para deliveries.
- Fallback operativo a routing compatible con OSRM y estimación directa.
- Zonas de entrega territoriales y por geocerca.
- Dibujo de polígonos desde el mapa del negocio.
- Costo independiente por geocerca.
- Copia local resiliente del polígono por tenant.
- Sincronización y reintento con GEO RD MAP.
- Point-in-polygon en selección de cobertura.
- Validación de la zona también en backend.
- Polígono mostrado en Centro de Operaciones, ruta del repartidor y seguimiento del cliente.
- Indicador `driver_inside` para detectar repartidor dentro/fuera de la geocerca durante una entrega activa.
- API Key únicamente en backend.

## Validaciones realizadas

- `gofmt` sobre los archivos Go modificados.
- Parser Go: sintaxis y nombres de paquete sin duplicados en `internal/httpapi` e `internal/integrations/geordmap`.
- Transpilación sintáctica TypeScript/TSX sobre los archivos frontend modificados.
- `frontend/scripts/verify-production-surface.mjs`: superficie de producción verificada correctamente.
- Revisión de migración `000032_geo_rd_map_delivery_areas`.

## Limitaciones del entorno de validación

El repositorio declara Go 1.26 y este entorno dispone de Go 1.23.2. Además, no hay acceso de red para descargar el toolchain/dependencias faltantes. Por esa razón no se ejecutó una compilación Go completa.

El directorio `frontend/node_modules` tampoco está disponible en este entorno, por lo que no se ejecutó el typecheck completo de dependencias React/Next. Se realizó validación sintáctica de los archivos modificados y la verificación de superficie de producción incluida en el propio proyecto.

## Resiliencia

Los servicios territoriales documentados se consumen directamente. Los servicios espaciales quedan detrás del adaptador Go de GEO RD MAP. Una indisponibilidad temporal de geocercas/routing no elimina las zonas locales ni interrumpe una entrega ya configurada: WAMERCIO conserva el polígono local y los fallbacks operativos.
