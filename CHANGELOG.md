# WAMERCIO 1.9.0

## Cierre del flujo comercial

- Convierte WhatsApp en un punto de venta conversacional: desde el chat se pueden buscar productos, seleccionar variantes/extras, armar el pedido y enviarlo al cliente sin salir de la conversación.
- Pedidos creados desde WhatsApp quedan vinculados a la conversación y al CRM del cliente.
- Añade seguimiento público de pedidos mediante enlace seguro sin necesidad de crear una cuenta.
- Agrega comprobantes de transferencia: el cliente puede subir imagen/PDF desde el seguimiento y el comercio puede revisarlo desde Pedidos.
- Mejora los estados operativos: Pendiente, Confirmado, Preparando, Listo, En camino, Entregado/Recogido y Cancelado.
- Elimina el bloqueo de ventas por límite mensual de pedidos; WhatsApp pasa a ser una capacidad base de todos los planes.
- Dashboard enfocado en operación diaria: pedidos y ventas de hoy, pedidos por atender, WhatsApp sin leer y alerta de inventario bajo.
- Catálogo agrupa Productos/Categorías; Delivery pasa a Ajustes → Zonas de entrega y el menú diario queda más limpio.
- Añade pausa de pedidos y cumplimiento real de horarios comerciales en el checkout público.
- Añade respuestas rápidas predeterminadas por tienda para WhatsApp.
- Añade eventos en tiempo real vía Redis + Server-Sent Events para el Centro de WhatsApp, manteniendo un refresco de respaldo.
- Mensajes automáticos usan una outbox persistente con reintentos y backoff para evitar perder confirmaciones por desconexiones temporales.
- CORS utiliza `CORS_ALLOWED_ORIGINS` en lugar de permitir todos los orígenes.
- Login WhatsApp+PIN y SuperAdmin incorporan rate limiting con Redis.
- Las tiendas ya no se borran: se archivan para preservar pedidos, clientes e historial y pueden reactivarse.
- Mi cuenta concentra perfil, PIN, plan y acceso directo al soporte por WhatsApp.
- Cache PWA actualizado a `wamercio-store-v1.9`.
- Añade CI con GitHub Actions para compilar frontend, API, bridge de WhatsApp y validar Docker Compose antes de desplegar.
- Añade pruebas unitarias iniciales para normalización de WhatsApp, PIN y slugs.

## Base de datos

Incluye la migración `000010_commerce_flow`, que añade disponibilidad de pedidos, vínculo pedido↔conversación, token público de seguimiento, outbox fiable y respuestas rápidas.

# WAMERCIO 1.8.3

## Hotfix de compatibilidad con whatsmeow

- Corrige `InvoiceMessage`: se usa `note`, único texto descriptivo disponible en el protobuf actual.
- Corrige el getter de GIF de `VideoMessage`: `GetGifPlayback()`.
- Corrige `PollCreationMessageV4`, que llega envuelto en `FutureProofMessage`, desempaquetando su `Message` interno antes de leer el nombre de la encuesta.
- No incluye migraciones ni cambios de infraestructura.

# WAMERCIO 1.8.2

## WhatsApp y navegación refinados

- WhatsApp ahora ocupa el viewport del panel y elimina el desplazamiento externo duplicado; solo se desplazan la lista de chats y el lienzo de mensajes.
- Selector de tienda reubicado a la cabecera en los módulos operativos.
- La opción `Conversaciones` pasa a llamarse `WhatsApp` y utiliza un icono específico de WhatsApp.
- La vinculación técnica deja de ocupar un acceso principal y pasa a `Ajustes → Conexión`.
- Eliminado el segundo botón de `Contraer menú`; se mantiene un único control en la cabecera.
- Vista previa móvil de Ajustes reducida y fijada para funcionar como referencia constante.
- Renderizador de mensajes ampliado para imágenes, GIF/video, video circular, notas de voz, audio, documentos, stickers, ubicaciones, contactos, encuestas, reacciones, mensajes interactivos, productos/pedidos y archivos genéricos.
- El bridge clasifica más tipos del protobuf de WhatsApp antes de guardarlos.

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
