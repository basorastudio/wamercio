# WAMERCIO 1.8.1

## Ajustes de experiencia operativa

- Barra lateral del comerciante ahora es contraíble y expandible, con mejor aprovechamiento del espacio de trabajo.
- Centro de conversaciones rediseñado con una experiencia mucho más cercana a WhatsApp Web.
- Ajusta el flujo de modales para evitar superposiciones cuando se cambia de resumen a edición.
- Modal de Nuevo producto pasa a una estructura de dos columnas, sin barra de desplazamiento visible.
- Ajustes incorpora vista previa en forma de móvil para validar la tienda en tiempo real.

# WAMERCIO 1.8.0

## Experiencia de tienda

- Simplifica la navegación del comerciante y elimina de la barra principal módulos de baja frecuencia.
- Rediseña Dashboard con hero operativo, accesos rápidos, métricas compactas y mejores estados vacíos.
- Moderniza globalmente modales, campos, botones, tarjetas y formularios con comportamiento mobile-first.

## Productos

- Elimina de la interfaz normal SKU, etiqueta, precio anterior, orden visual, destacado y otros campos técnicos.
- Mantiene foto, nombre, categoría, precio y descripción como flujo principal.
- Mueve inventario, variantes y extras a una sección opcional.
- Cambia listado tipo tabla por tarjetas visuales.

## Categorías

- Elimina slug, orden y URL de imagen de la interfaz.
- Añade subida directa de imagen desde el placeholder.
- Genera automáticamente el orden cuando no se envía.

## Tiendas y ajustes

- Elimina slug, color hexadecimal, URL del logo y estado técnico del formulario principal.
- Añade subida directa de logo y portada.
- Reduce Ajustes de cinco secciones a tres: Mi negocio, Ventas y entrega, Horarios.
- Oculta moneda/color/slug y conserva valores internamente.

## Delivery

- El formulario se reduce a zona y cargo.
- El tiempo estimado utiliza el valor interno por defecto si el comerciante no lo modifica.

## Catálogo público

- Nueva portada más visual.
- Categorías horizontales con imagen opcional.
- Buscador y tarjetas de producto rediseñados.
- Mejor experiencia responsive y estados vacíos.
- Cupón deja de ocupar espacio en el checkout simplificado.

## PWA

- Cache actualizado a `wamercio-store-v1.8`.

## Compatibilidad

- Sin migraciones nuevas.
- Sin cambios de `.env`.
- Sin cambios en Traefik/gateway/volúmenes.
