# WAMERCIO 1.4.0

## Rediseño tipo WhatsApp Food

- Sustituida la identidad azul noche/ámbar por verde turquesa + blanco + gris claro.
- Nueva landing inspirada en la estructura visual de WhatsApp Food/WhatsMenu.
- Hero verde con ilustración UI propia y CTAs compactos.
- Sección de funciones en tarjetas claras.
- Sección de proceso con mockup móvil.
- Planes dinámicos sobre fondo verde.
- Demo con QR y bloques comerciales claros.
- Footer ligero.
- Modal de acceso/registro rediseñado con el mismo lenguaje visual.
- StoreShell actualizado a navegación blanca, activa en verde y mobile bottom-nav verde.
- SuperAdminShell rediseñado con sidebar verde y contenido claro.
- Dashboard de tienda alineado con la nueva identidad.
- Login de SuperAdmin alineado con la nueva identidad.
- Componentes globales (`card`, `field`, `btn`, tablas y modal) actualizados.
- Catálogo público cambia su hero oscuro por el color principal de la tienda.
- Nuevo icono/favcion/PWA theme en verde.
- Cache PWA incrementada a `wamercio-store-v1.4`.
- Nueva migración `000006_whatsapp_food_brand` para actualizar el color por defecto de tiendas a `#36B385`.

## Compatibilidad

- No cambia autenticación.
- No cambia WhatsApp/whatsmeow.
- No cambia PostgreSQL salvo el color visual por defecto de las tiendas.
- No cambia Redis.
- No cambia Traefik/gateway.
- No elimina volúmenes ni datos.
