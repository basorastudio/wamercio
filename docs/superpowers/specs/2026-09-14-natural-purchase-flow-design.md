# WAMERCIO 2.5.6 — Flujo natural de compra

## Objetivo

Conservar la identidad visual y arquitectura multi-tenant/mobile-first de WAMERCIO 2.5.5, pero adoptar del flujo maduro de ColmaPro la idea de que el producto ya agregado se edita como parte del pedido, en lugar de forzar al cliente a abrir/cerrar el carrito tras cada selección.

## Diseño aprobado

- Agregar o actualizar un producto no abre el carrito automáticamente.
- La tarjeta del catálogo indica la cantidad ya incluida en el pedido.
- Si el producto tiene una sola configuración en el pedido, abrirlo desde la tarjeta carga esa configuración y permite **Actualizar mi pedido**.
- Si hay varias configuraciones, el detalle abre una selección nueva y el carrito permite editar cada línea de forma individual.
- Las líneas del carrito tienen acción **Editar** y reutilizan el mismo detalle del producto.
- Cambiar variante/adicionales al editar recalcula la clave de la línea y fusiona líneas idénticas en vez de duplicarlas.
- Los productos configurados como venta por libra pueden comprarse por **Libra** o por **Monto**, siguiendo el patrón natural de ColmaPro, pero con el diseño WAMERCIO.
- La venta por libra usa los `attributes` existentes del producto; no requiere nueva tabla ni migración.
- El editor de catálogo permite activar **Vender por libra**, definir incremento/mínimo y habilitar compra por monto.
- El checkout conserva cantidades decimales y el backend formatea correctamente cantidades fraccionarias en las notificaciones.
- Mobile-first: el detalle sigue siendo bottom sheet en móvil y modal centrado en escritorio; el carrito sigue estructural en escritorio y modal en móvil/tablet.

## Exclusiones

- No copiar la UI de ColmaPro.
- No introducir una segunda estructura de carrito.
- No agregar compatibilidad heredada ni migraciones innecesarias.
- No cambiar routing, dominios, PWA, identidad global ni checkout autenticado de 2.5.5.
