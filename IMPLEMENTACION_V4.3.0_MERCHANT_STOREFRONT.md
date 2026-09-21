# WAMERCIO 4.3.0 — Panel de negocios + storefront estilo WACatelog

## Objetivo

Esta versión aplica al **panel operativo de cada negocio** y al **frontend público de cada tienda** el mismo lenguaje visual que se tomó como referencia de WACatelog, sin convertir WAMERCIO en una copia ni sustituir su lógica comercial. El criterio principal fue conservar las rutas, permisos, APIs y flujos existentes y cambiar la presentación alrededor de ellos.

## Panel de administración del negocio

El shell del comerciante ahora usa una sidebar verde oscura, fondo cálido, topbar plana, tarjetas de borde ligero y menor elevación. La navegación se reagrupó para acercarse al modelo operativo de WACatelog: Principal, Ventas, Catálogo, Tienda online, Interacción, Relación con clientes, Informes y Ajustes. No se eliminaron módulos; se reorganizaron sus accesos.

El dashboard dejó de ser una portada genérica. Ahora trabaja por la tienda seleccionada y consulta datos reales del backend:

- `GET /api/v1/analytics?store_id={id}&range=7d|30d|90d`
- `GET /api/v1/orders?store_id={id}`
- `GET /api/v1/me`

El selector de período vuelve a consultar analytics. Las tarjetas muestran pedidos, ingresos, pedidos abiertos y clientes. El gráfico SVG de ingresos se construye con `daily`; el gráfico de origen usa `source_breakdown`; pedidos recientes provienen de `/orders`; productos principales provienen de `top_products`.

El resto de las páginas del comerciante heredan el nuevo sistema visual mediante `.merchant-ui`: formularios, tablas, tarjetas, botones, inputs, topbar, sidebar y navegación móvil mantienen sus componentes y lógica previos, pero con el nuevo acabado.

## Backend

`services/api/internal/httpapi/phase1_commerce.go` amplía la consulta de `top_products` para devolver además:

- `product_id`
- `image_url`

La consulta sigue calculando cantidad e ingresos desde `order_items` y `orders`; la imagen se resuelve con `LEFT JOIN products`. No se añadieron tablas ni migraciones.

## Storefront público

El catálogo público se reestructuró sobre la lógica existente de `components/storefront.tsx`:

- Header compacto con identidad del comercio, acceso del cliente y carrito.
- Hero verde profundo con patrón conversacional ya incluido en los assets de WAMERCIO.
- Logo, insignia, nombre, descripción, estado del negocio, respuesta por WhatsApp y dirección.
- CTA real a WhatsApp cuando el negocio tiene número configurado.
- Categorías horizontales en chips, con filtro real mediante el estado ya existente.
- Búsqueda existente reubicada como barra principal del catálogo.
- Tarjetas de producto compactas y responsive, con imagen, categoría, reseña, precio, stock y cantidad en carrito.
- Al pulsar imagen, nombre o botón se utiliza `openProduct(p)`, por lo que siguen funcionando variantes, extras, modificadores, combos, venta por peso y edición de líneas del carrito.
- Se mantienen carrito, checkout, métodos de pago, login del cliente, seguimiento, reseñas y navegación móvil.

## Aislamiento de estilos

Los estilos administrativos del negocio están encapsulados en `.merchant-ui`. SuperAdmin mantiene `.admin-ui` y el frontend público continúa bajo `.storefront`. Esto evita que el rediseño de una superficie afecte accidentalmente a otra.

## Archivos principales modificados

- `apps/web/components/store-shell.tsx`
- `apps/web/app/dashboard/page.tsx`
- `apps/web/components/storefront.tsx`
- `apps/web/app/globals.css`
- `services/api/internal/httpapi/phase1_commerce.go`
- `apps/web/package.json`
- `apps/web/public/sw.js`
- `VERSION`
- `README.md`
- `CHANGELOG.md`

## Validación realizada

- `gofmt` aplicado al archivo Go modificado.
- Parseo sintáctico de 109 archivos `.ts/.tsx`: 0 errores.
- Se revisó que el nuevo storefront siga llamando a la lógica existente de carrito/producto en vez de introducir botones decorativos.
- El entorno local disponible usa Go 1.23.2 mientras el proyecto declara Go 1.26; por ello no se afirma una compilación local del servicio Go.
- La instalación local de dependencias npm agotó el tiempo disponible, por lo que la validación completa de `next build` debe ejecutarse en el pipeline/Dokploy, que ya usa Node 20 y descarga las dependencias durante la imagen.

## Despliegue

No hay migraciones nuevas. Sustituir el código por 4.3.0, reconstruir `web` y `api` y volver a desplegar. La caché PWA cambia a `wamercio-store-v4.3.0` para evitar que el storefront anterior permanezca en clientes que ya lo tenían abierto.
