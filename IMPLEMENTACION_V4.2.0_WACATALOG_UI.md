# WAMERCIO 4.2.0 — Rediseño WACatelog-inspired

## Objetivo

Reemplazar el lenguaje visual anterior de la landing de WAMERCIO y acercar el panel SuperAdmin al patrón de producto mostrado por WACatelog, sin convertir WAMERCIO en un clon ni alterar su arquitectura Next.js + Go + PostgreSQL.

## Qué se tomó como referencia de WACatelog

- Landing: hero centrado, tipografía de alto impacto, fondos cálidos, patrón conversacional, mockup grande del producto, bloques narrativos alternados y tarjetas con bordes suaves.
- Flujo comercial: enlace -> navegación -> conversación -> pedido organizado.
- Sección comparativa: checkout web tradicional frente a pedido conversacional.
- Panel: sidebar blanca, navegación agrupada, item activo verde, topbar con búsqueda, KPI cards redondeadas y dashboard modular.
- Densidad visual: menos sombras pesadas, más bordes neutros, radios grandes, espacios amplios y color usado con intención.

## Adaptaciones propias de WAMERCIO

- Todo el copy permanece en español y orientado a República Dominicana.
- Precios en DOP/RD$.
- Se conserva AccessModal y el flujo de acceso actual.
- Se conservan los planes dinámicos del backend.
- Se conserva el modo mantenimiento configurable.
- La landing sigue leyendo `/public/platform` para personalización.
- El dashboard usa datos reales de WAMERCIO; no se introducen cifras ficticias para las tendencias del SuperAdmin.
- Se mantienen permisos del SuperAdmin y filtrado de navegación por `admin_access`.

## Archivos principales modificados

- `apps/web/components/platform-landing.tsx`
- `apps/web/components/superadmin-shell.tsx`
- `apps/web/app/admin/page.tsx`
- `apps/web/app/admin/landing/page.tsx`
- `apps/web/app/globals.css`
- `apps/web/tailwind.config.ts`
- `apps/web/public/sw.js`
- `services/api/internal/httpapi/server.go`
- `services/api/migrations/000048_wacatalog_inspired_platform_ui.*.sql`

## Assets de referencia incorporados

`apps/web/public/wacatalog-inspired/`

- `chat-pattern.png`
- `commerce-guide-1.jpg`
- `commerce-guide-2.jpg`
- `commerce-guide-3.jpg`

Estos assets provienen del paquete WACatelog suministrado por el usuario y se reutilizan únicamente dentro del rediseño solicitado.

## Dashboard SuperAdmin

El endpoint `/admin/dashboard` ahora devuelve además:

- `trend`: seis meses con pedidos, ventas, nuevos comerciantes y nuevas tiendas.
- `order_health`: pagados, no pagados y cancelados.
- `urgent_tickets`.
- `recent_activity`: últimas acciones de `platform_audit_log`.

La interfaz representa esos datos mediante SVG y CSS propios, sin añadir librerías de gráficos.

## Validación realizada

- `gofmt` ejecutado correctamente sobre `server.go`.
- Sintaxis TS/TSX validada con el compilador TypeScript mediante `transpileModule` en los componentes modificados.
- El `go test ./...` no pudo completarse dentro del entorno de trabajo porque el proyecto declara Go `1.26.0` y el contenedor solo dispone de Go `1.23.2`; la descarga automática del toolchain está bloqueada por falta de acceso de red.
- No se pudo ejecutar `next build` porque el ZIP no incluye `node_modules` y el entorno no permite descargar dependencias.

## Despliegue

1. Desplegar normalmente en Dokploy.
2. Ejecutar migraciones hasta `000048`.
3. Reconstruir frontend para que la caché PWA cambie a `v4.2.0`.
4. Validar landing en desktop/móvil y SuperAdmin con un usuario `superadmin` y otro usuario SaaS con permisos parciales.
