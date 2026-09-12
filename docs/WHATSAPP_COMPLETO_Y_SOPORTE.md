# WhatsApp completo y soporte SaaS — WAMERCIO 1.7

## Arquitectura

```text
WhatsApp de tienda ─┐
                    ├─> servicio WAMERCIO WhatsApp ─> API ─> PostgreSQL
WhatsApp soporte ───┘                │                    │
                                     └─ medios ─> uploads_data
```

Cada tienda mantiene su propia sesión. El SuperAdmin utiliza una sesión reservada llamada `support`, independiente de todas las tiendas.

## Entrada de mensajes

WAMERCIO consume los eventos de mensaje y clasifica texto, imágenes, videos, notas de voz/audio, documentos, stickers, ubicación, contactos, reacciones y encuestas. Los mensajes de medios descargables se guardan en `uploads_data/whatsapp/...` y sus metadatos quedan asociados al mensaje.

Los JID modernos de tipo LID se resuelven a su PN cuando existe el mapeo local, lo que permite conservar la asociación correcta con Clientes y Comerciantes.

## Salida de mensajes

Texto usa `SendMessage`. Los archivos usan el flujo de `Upload` de la librería y luego se construye el protobuf correspondiente para imagen, video, audio o documento antes de enviarlo.

## Recibos

Los eventos de recibo actualizan `sent/delivered/read`. Cuando el operador abre una conversación, el backend solicita `MarkRead` para los mensajes entrantes pendientes y resetea el contador de no leídos.

## Actividad y presencia

WAMERCIO no mantiene `PresenceAvailable` de forma permanente. Se usa un pulso corto durante conexión/reconexión y luego `PresenceUnavailable`. También se mantiene el compañero no pasivo y se fuerzan recibos de entrega activos. Esto busca conservar una sesión sana sin quitar notificaciones al teléfono principal ni mostrarlo permanentemente en línea.

## Soporte SuperAdmin

`/admin/whatsapp` permite vincular el WhatsApp oficial de soporte, iniciar conversaciones con comerciantes y trabajar con el mismo renderizado de texto/medios que el panel comercial.

El comerciante recibe en `/support` un acceso directo al WhatsApp de soporte cuando la sesión está conectada.
