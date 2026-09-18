# WAMERCIO 2.9.0

- Proxy Auth administrado para Facebook, Instagram, LinkedIn y Google Business, sin credenciales OAuth visibles para las tiendas.
- Conexiones sociales multi-tenant con tokens cifrados y PKCE para Google.
- Biblioteca multimedia por tienda y compositor de publicaciones con borradores, aprobadas, programadas, publicadas, parciales y fallidas.
- Publicación/reintento por destino y prellenado desde Promociones.
- Workspace de Perfil de Empresa en Google: perfil, sincronización, reseñas/respuestas, rendimiento y multimedia.
- Evaluaciones mediante encuesta nativa de WhatsApp posterior al cierre de conversaciones: cinco respuestas 1–5, correlación por ID de encuesta, descifrado del voto, feedback, agradecimiento e invitación neutral a reseña.
- Filtros por agente/canal/fecha, impresión y exportación compatible con Excel en Evaluaciones.
- Varias cuentas bancarias por negocio, selección de cuenta para transferencia, cuenta de terminal y comisiones.
- Método Cheque con habilitación del negocio y autorización explícita por cliente/negocio.
- Migraciones nuevas `000038`, `000039` y `000040`.

# WAMERCIO 2.8.12

- Reemplaza la edición rápida del cliente por Bloquear/Desbloquear por negocio.
- Todo bloqueo exige un motivo y registra fecha, actor y evento de auditoría.
- Un cliente bloqueado conserva su identidad global WAMERCIO y puede comprar en otras tiendas, pero no puede operar comercialmente en el negocio que lo bloqueó.
- El bloqueo se aplica a checkout, reservas, pedidos desde conversación, POS y reseñas verificadas.
- Superadmin muestra cuántos negocios han bloqueado al cliente y el detalle con negocio, fecha, motivo y actor.
- La vista de cada negocio mantiene aislamiento multi-tenant y no expone bloqueos de otras tiendas.
- Añade la migración reversible `000037_store_customer_blocking`.

# WAMERCIO 2.8.11 — Mapa interactivo con marcador geográfico real

## Correcciones

- El mapa de ubicación del cliente vuelve a ser completamente interactivo dentro del modal y del perfil.
- Se eliminó la navegación automática hacia Google Maps al pulsar el mapa o el pin.
- Se sustituyó el `iframe` por Leaflet con teselas de OpenStreetMap, permitiendo zoom, desplazamiento, gestos táctiles y controles nativos sin salir de WAMERCIO.
- La foto de WhatsApp ahora es un marcador geográfico real anclado a `latitude`/`longitude`, por lo que permanece unida a la ubicación al hacer zoom o desplazar el mapa.
- El mismo componente interactivo se reutiliza en Superadmin, ficha del negocio y Mi perfil > Direcciones.
- No hay migraciones nuevas; la última continúa siendo `000036_customer_address_geolocation`.

## Dependencias web

- `leaflet` 1.9.4
- `@types/leaflet` 1.9.16
