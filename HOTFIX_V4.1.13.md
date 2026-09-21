# WAMERCIO 4.1.13 — Botón mágico, notas de voz y acciones de ticket

Esta versión mejora el Centro Conversacional manteniendo el patrón visual de WhatsApp Web y la arquitectura existente de WAMERCIO.

## Composer inteligente

- Cuando el campo está vacío, el botón principal muestra **micrófono**.
- Al escribir, el mismo botón cambia automáticamente a **Enviar**.
- El micrófono abre una grabación real con `MediaRecorder`, contador, cancelación y envío desde el mismo control.
- Durante la grabación se simplifica el composer y se muestran únicamente el estado, el tiempo, cancelar y enviar.
- Las notas de voz salen como **PTT de WhatsApp**, no como un archivo de audio genérico.
- El Bridge normaliza las grabaciones WebM/MP4 del navegador a **OGG/Opus mono 48 kHz** mediante FFmpeg para compatibilidad consistente con WhatsApp.

## Menú de acciones del ticket

El botón redundante **Datos del contacto** fue sustituido por un menú operativo, ya que los datos siguen disponibles pulsando avatar/nombre del contacto.

Acciones disponibles:

- Reabrir ticket.
- Devolver ticket a la cola.
- Resolver.
- Transferir a otro agente.
- Buscar dentro de la conversación.
- Programar mensaje.

Las acciones reutilizan los endpoints existentes de workflow, estado y programación; no son elementos visuales simulados.

## Buscar, transferir y programar

- La búsqueda resalta y centra coincidencias dentro del chat, con navegación anterior/siguiente.
- Transferir abre un modal con agentes activos de la tienda y conserva la cola/prioridad del ticket.
- Programar mensaje abre un modal responsive con fecha/hora, accesos rápidos (30 min, 1 h, 2 h, mañana 9:00) y opción de cancelar si el cliente responde antes.

## Despliegue

Recompila **Web**, **API** y **WhatsApp Bridge**. El contenedor runtime del Bridge instala `ffmpeg` para normalizar notas de voz.

```bash
sh scripts/verify-4.1.13.sh
```
