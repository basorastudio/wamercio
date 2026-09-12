# WAMERCIO 1.7.0

## Canal comercial

- Eliminado el campo visible **Teléfono** de tiendas y ajustes.
- WhatsApp pasa a ser el único canal de contacto visible del comercio.
- Nuevas tiendas se guardan con `stores.phone = NULL` y `stores.whatsapp` como contacto comercial.
- La migración limpia el teléfono comercial heredado de tiendas sin borrar el WhatsApp.

## Conversaciones WhatsApp

- Recepción y renderizado real de imagen, sticker, video, video circular/PTV, audio, documento, ubicación, ubicación en vivo, contacto, reacción y encuesta.
- Descarga de medios recibidos al volumen persistente compartido con el API.
- Envío desde el chat de imágenes, videos, audios y documentos hasta 32 MB.
- Captura de mensajes enviados desde otros dispositivos vinculados.
- Estados de entrega/lectura mediante eventos `Receipt`.
- Marcado real como leído mediante `MarkRead`.
- Resolución PN↔LID para identificar correctamente contactos modernos de WhatsApp.
- Historial sincronizado procesado por el mismo pipeline de mensajes.

## Actividad del dispositivo

- Sesión reforzada con `SetPassive(false)` al conectar y durante mantenimiento periódico.
- Recibos de entrega activos con `SetForceActiveDeliveryReceipts(true)`.
- Pulso breve de `PresenceAvailable` al conectar/reconectar y regreso inmediato a `PresenceUnavailable` para no mantener la cuenta visible “en línea”.
- Reconexión automática y recuperación ante fallos repetidos de keep-alive.

## Soporte SaaS por WhatsApp

- Nueva sesión independiente `support` para el SuperAdmin.
- Nueva pantalla `/admin/whatsapp` estilo WhatsApp Web.
- Listado de comerciantes e inicio de conversación desde su WhatsApp de acceso.
- Envío y recepción de texto y medios.
- Indicadores de no leídos y recibos de lectura.
- Nueva tarjeta **Soporte directo por WhatsApp** en `/support` para comerciantes cuando el canal oficial está conectado.

## Datos

- Nueva migración `000009_whatsapp_full_support`.
- Nuevas tablas para sesión, conversaciones y mensajes WhatsApp del soporte SaaS.
- Nuevos campos de medios en `messages`.

## Compatibilidad

- Sin cambios en `.env`.
- Sin cambios en Cloudflare, Traefik, Nginx gateway, PostgreSQL, Redis o volúmenes existentes.
- No requiere **Fresh Volumes**.
