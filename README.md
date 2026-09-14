# WAMERCIO 2.5.8

WAMERCIO es una plataforma dominicana de comercio conversacional, mobile-first, SPA + PWA y multi-tenant.

## Compra progresiva

La tienda pública conserva el catálogo visible mientras el cliente arma su pedido: agregar o actualizar no fuerza la apertura del carrito, los productos muestran lo que ya está incluido y cada línea puede volver a editarse. Los productos configurados para venta por libra admiten compra por peso o por monto sin duplicar el modelo de datos.

## Publicación

- Plataforma y administración: `https://wamercio.com`
- Tiendas: `https://{slug}.ltd.do`
- Dominios propios: host verificado por negocio

## Storefront 2.5.5

La experiencia pública del negocio se refinó para mantener la tienda útil mientras el cliente compra. Al abrir **Mi pedido**, WAMERCIO cambia a una página completa de carrito/checkout en lugar de usar un panel lateral:

- acceso progresivo por WhatsApp sin botón intermedio;
- búsqueda predictiva en la barra superior sin filtrar el lienzo del catálogo;
- resultados contextuales que abren directamente la ficha del producto;
- tarjetas de producto más consistentes y precios iniciales correctos cuando existen variantes;
- carrito como página completa dedicada: productos a la izquierda y checkout completo visible de inmediato a la derecha en escritorio, con flujo vertical responsive en móvil;
- la edición de una línea del carrito abre la ficha del producto directamente sobre **Mi pedido**, sin regresar al catálogo;
- una sola acción **Seguir comprando** devuelve al catálogo y no existe un paso intermedio para desplegar entrega/pago;
- la dirección deja de ocupar espacio en la barra superior.

La publicación exacta de `*.ltd.do` y dominios personalizados conserva la arquitectura de WAMERCIO 2.5.4.

Consulta `DEPLOY_DOKPLOY.md` para el despliegue.
