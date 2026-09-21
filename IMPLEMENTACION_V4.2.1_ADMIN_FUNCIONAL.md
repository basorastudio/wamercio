# WAMERCIO 4.2.1 — SuperAdmin funcional inspirado en WACatelog

## Objetivo

Esta revisión no se limita a “pintar” el panel. Mantiene el backend actual de WAMERCIO y conecta los controles visuales con endpoints reales, siguiendo la composición de WACatelog sin convertir WAMERCIO en una copia literal.

## Cambios de interfaz

- Sidebar verde oscuro tipo panel comercial, grupos de navegación y estado activo con acento.
- Topbar compacta con título, búsqueda global `Ctrl/Cmd + K`, acceso al sitio, soporte, selector de idioma informativo y menú de cuenta.
- Paleta cálida de administración (`#fbf8f3` / `#f3eee5`) con verde WAMERCIO y acento comercial rojizo.
- Cards, tablas, campos, botones y modales del SuperAdmin quedan normalizados mediante el scope `.admin-ui`.

## Dashboard conectado

`GET /api/v1/admin/dashboard?months=3|6|12`

El selector de periodo cambia la consulta real del backend. El API genera los meses solicitados y devuelve:

- ingresos,
- pedidos,
- propietarios,
- negocios,
- productos,
- tickets,
- solicitudes de plan,
- salud de pedidos,
- tendencias por mes,
- actividad reciente.

Los KPI son enlaces reales a sus módulos. El botón Actualizar repite la consulta. El gráfico de ventas muestra tooltip por punto.

## Página comercial

La pantalla `/admin/landing` fue reestructurada con el patrón de `Storefront settings` de WACatelog:

- franja de estado publicada/mantenimiento,
- URL pública con acción Copiar,
- contenidos organizados por tarjetas,
- vista previa del hero,
- indicador de cambios pendientes,
- restauración local de valores base,
- guardado persistente mediante `PUT /api/v1/admin/platform/landing`,
- acceso directo a la vista pública.

El switch Publicada modifica `maintenance_mode`; el cambio se persiste únicamente al guardar, igual que el resto del formulario.

## Negocios

Se agregó un endpoint específico para no reutilizar el PUT completo del negocio al cambiar solo el estado:

`PATCH /api/v1/admin/stores/{id}/status`

Body:

```json
{"is_active": true}
```

El handler actualiza `stores.is_active`, `updated_at` y registra auditoría `store.status.updated`.

La pantalla de negocios ahora permite:

- búsqueda,
- filtro Todos / Activos / Inactivos,
- contadores,
- actualización manual,
- activar/desactivar con switch persistente,
- abrir la tienda,
- eliminar con confirmación.

## Planes

La pantalla de planes usa los endpoints ya existentes:

- `GET /admin/plans`
- `POST /admin/plans`
- `PUT /admin/plans/{id}`

El switch de estado hace un PUT real con los datos del plan, por lo que la activación/desactivación deja de ser meramente visual.

## Archivos principales modificados

- `apps/web/components/superadmin-shell.tsx`
- `apps/web/app/globals.css`
- `apps/web/app/admin/page.tsx`
- `apps/web/app/admin/landing/page.tsx`
- `apps/web/app/admin/stores/page.tsx`
- `apps/web/app/admin/plans/page.tsx`
- `services/api/internal/httpapi/server.go`
- `apps/web/public/sw.js`
- `README.md`
- `CHANGELOG.md`
- `VERSION`

## Base de datos

No requiere nueva migración. La versión 4.2.1 reutiliza el esquema existente de 4.2.0.

## Despliegue

1. Desplegar el paquete 4.2.1 sobre la instalación 4.2.0.
2. Mantener las migraciones existentes hasta `000048`.
3. Reconstruir frontend y API.
4. Reiniciar los servicios de Dokploy.
5. Forzar actualización del PWA/service worker; la caché cambia a `wamercio-store-v4.2.1`.

## Validación realizada en esta entrega

- Formato Go aplicado con `gofmt`.
- Archivos TSX modificados analizados con el compilador TypeScript en modo `transpileModule` para detectar errores de sintaxis JSX/TypeScript.
- Rutas frontend revisadas contra las rutas registradas en el backend.
- No se ejecutó el build completo de Go porque el proyecto declara Go 1.26 y el entorno disponible contiene Go 1.23.2.
- No se ejecutó `next build` porque el paquete entregado no incluye `node_modules` y la instalación de dependencias no pudo completarse dentro del entorno de ejecución.
