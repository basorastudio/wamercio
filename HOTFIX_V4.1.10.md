# WAMERCIO 4.1.10 — Incoming Call UX + WhatsApp Avatar

## Correcciones

1. **Foto de perfil al llamar**
   - El botón del chat y las tablas de Clientes/Contactos pasan la foto disponible al softphone.
   - `POST /calls` acepta `avatar_url`, resuelve la identidad local y guarda `metadata.avatar_url` desde el primer estado de la llamada.
   - Si no existe imagen local, el API consulta `/sessions/{store_id}/profile` al WhatsApp Bridge y actualiza la llamada/conversación en segundo plano.
   - El Bridge solicita la foto completa de WhatsApp (`Preview: false`).

2. **Llamada entrante visible sin clic previo**
   - Chromium exige activación transitoria del usuario para crear una ventana Document Picture-in-Picture nueva.
   - Hierro del Norte evita esa limitación mostrando primero la llamada entrante dentro de la aplicación y usa el clic en **Contestar** para abrir PiP.
   - WAMERCIO adopta ese patrón sin mantener dos softphones: reutiliza exactamente `softphoneSurface()` y el mismo CSS canónico.
   - Si PiP ya está abierto, la llamada aparece directamente allí. Si Chrome bloquea crear uno nuevo, la misma superficie aparece automáticamente dentro de WAMERCIO; **Contestar** la mueve a PiP.

3. **Se elimina el disparo por clic arbitrario**
   - Ya no se espera `pointerdown`/`keydown` global para mostrar una llamada entrante.

## Despliegue

No hay migraciones. Reconstruir **Web + API + WhatsApp Bridge**.
