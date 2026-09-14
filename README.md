# WAMERCIO 2.5.7

WAMERCIO es una plataforma dominicana de comercio conversacional, mobile-first, SPA + PWA y multi-tenant.

## Compra progresiva

La tienda pública conserva el catálogo visible mientras el cliente arma su pedido: agregar o actualizar no fuerza la apertura del carrito, los productos muestran lo que ya está incluido y cada línea puede volver a editarse. Los productos configurados para venta por libra admiten compra por peso o por monto sin duplicar el modelo de datos.

## Publicación

- Plataforma y administración: `https://wamercio.com`
- Tiendas: `https://{slug}.ltd.do`
- Dominios propios: host verificado por negocio

## Storefront 2.5.5

La experiencia pública del negocio se refinó para mantener la tienda útil mientras el cliente compra:

- acceso progresivo por WhatsApp sin botón intermedio;
- búsqueda predictiva en la barra superior sin filtrar el lienzo del catálogo;
- resultados contextuales que abren directamente la ficha del producto;
- tarjetas de producto más consistentes y precios iniciales correctos cuando existen variantes;
- carrito lateral estructural en escritorio y modal únicamente en móvil/tablet;
- la dirección deja de ocupar espacio en la barra superior.

La publicación exacta de `*.ltd.do` y dominios personalizados conserva la arquitectura de WAMERCIO 2.5.4.

Consulta `DEPLOY_DOKPLOY.md` para el despliegue.
