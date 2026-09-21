# WAMERCIO 4.1.9 — Direct Canonical PiP

## Objetivo

Eliminar el estado alternativo de llamada entrante en la sidebar y conservar una única interfaz de telefonía: el softphone completo de WAMERCIO dentro de Document Picture-in-Picture.

## Cambios

- La sidebar vuelve a mostrar siempre **Abrir softphone / Llamadas WhatsApp**.
- Eliminados de la sidebar:
  - punto rojo de llamada entrante;
  - estado `Llamada entrante`;
  - nombre del contacto como sustituto del launcher.
- Eliminados los eventos de UI alterna `wamercio:incoming-call-attention` y `wamercio:call-attention-clear`.
- Una llamada entrante intenta abrir/focalizar directamente el PiP canónico.
- Si ya existe una ventana Document-PiP, se reutiliza usando `documentPictureInPicture.window`.
- Si Chromium bloquea la creación de una nueva ventana PiP por falta de `transient user activation`, la llamada queda pendiente y la próxima interacción real (`pointerdown` o `keydown`) abre el mismo PiP oficial.
- Si el usuario ya autorizó notificaciones, se genera una notificación del sistema como respaldo; al pulsarla se intenta abrir el mismo PiP.
- No existe softphone embebido, modal, tarjeta lateral ni clon alternativo.
- Se conserva la resolución de identidad entrante de V4.1.8 para mostrar nombre/avatar de Cliente/Contacto de WAMERCIO.

## Limitación del navegador

La creación de una ventana nueva mediante `documentPictureInPicture.requestWindow()` está controlada por Chromium y puede requerir una activación transitoria del usuario. Una aplicación web no puede saltarse esa política. WAMERCIO intenta abrir el PiP directamente; cuando el navegador lo bloquea, no crea otra interfaz: conserva la llamada pendiente y abre el mismo PiP oficial en la siguiente interacción.

## Despliegue

No hay migraciones nuevas. Desde V4.1.8 solo es necesario reconstruir **Web**.
