# WAMERCIO 4.1.8 — Single PiP Softphone + Caller Identity

## Objetivo

Eliminar la segunda interfaz de softphone que se renderizaba dentro de la aplicación cuando Document Picture-in-Picture no podía abrirse automáticamente. WAMERCIO conserva desde esta versión una sola interfaz de llamadas: el softphone PiP completo con Directorio, Teclado y controles por estado.

## Cambios

- Eliminado `embeddedCss` y el render `embeddedContent`.
- `calls-softphone.tsx` solo crea el portal hacia `documentPictureInPicture`.
- Las llamadas manuales, botones de Chat/Clientes/Contactos y llamadas entrantes apuntan a la misma instancia global.
- Cuando Chromium bloquea `requestWindow()` por falta de activación del usuario, no se dibuja un clon; la sidebar cambia a **Llamada entrante**, muestra el nombre/número y abre el PiP al pulsarla.
- Si el permiso de notificaciones ya estaba concedido, WAMERCIO también emite una notificación del sistema sin solicitar permisos automáticamente.

## Identidad de llamada entrante

El API resuelve, por este orden práctico, la relación local del negocio y la identidad disponible en WAMERCIO antes del push-name recibido por WhatsApp. Se enlaza `conversation_id`, se guarda el nombre resuelto y se propaga el avatar disponible. Por eso un cliente ya conocido debe verse con el mismo nombre tanto en llamadas entrantes como salientes.

## Despliegue

No hay migraciones. Reconstruye **Web + API**. Si vienes de una versión anterior a 4.1.6, reconstruye también WhatsApp Bridge para conservar todas las correcciones del ciclo de llamadas.
