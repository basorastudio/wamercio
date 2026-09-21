# WAMERCIO 4.1.1 — Softphone global estilo Hierro del Norte

## Objetivo

Completar la experiencia de llamadas de WAMERCIO utilizando el mismo patrón funcional del softphone de Hierro del Norte, pero con la identidad visual verde y la arquitectura nativa de WAMERCIO.

## Softphone global

El softphone se monta en `StoreShell`, por lo que permanece disponible en todas las pantallas del panel del comercio. Un launcher flotante **Abrir softphone** permite recuperar el marcador desde cualquier módulo.

El evento interno `wamercio:open-softphone` permite que cualquier módulo solicite una llamada sin acoplarse al componente visual. Chat, Clientes y Contactos lo utilizan para precargar el destino y realizar llamada directa.

## Picture-in-Picture

Cuando el navegador ofrece `documentPictureInPicture.requestWindow`, el softphone utiliza una ventana Document PiP. La lógica de WebRTC, WhatsApp y estado continúa viviendo en la aplicación principal; PiP es una capa visual compartida.

Características:

- Directorio y teclado antes de una llamada.
- Estado de llamada activa.
- Silenciar/activar micrófono.
- Espera/reanudar.
- Reconectar audio.
- Transferir a otro usuario.
- Colgar.
- Volver a la aplicación principal.
- Cerrar PiP no finaliza la llamada ni destruye el bridge WebRTC.
- Si PiP no existe, se conserva el modal responsive como fallback.

## Directorio

El directorio combina datos nativos de WAMERCIO:

- Contactos: `/contacts?store_id=...`
- Clientes: `/customers?store_id=...`
- Usuarios operativos: `/staff?store_id=...`

Permite búsqueda por nombre/número y filtros **Todos / Contactos / Clientes / Usuarios**. Los contactos que ya son clientes se deduplican por número para evitar entradas repetidas.

## Integración contextual

### Chat

El encabezado del chat contiene el botón de teléfono. Al pulsarlo despacha el mismo softphone global con `conversation_id`, teléfono y nombre del contacto.

### Clientes y Contactos

Las tablas muestran el botón **Llamar**. La acción utiliza el softphone global y solicita llamada directa; no redirige al usuario al Centro de llamadas.

## Llamadas entrantes

El softphone global mantiene un sondeo ligero de estado Calls aunque el modal esté cerrado. Solo se consultan settings/llamadas durante el polling; el directorio se carga al abrirse. Cuando se detecta una llamada entrante en estado `ringing`, WAMERCIO abre la interfaz para responder. Al pulsar **Contestar**, intenta reservar PiP desde el gesto del usuario y luego conecta la llamada.

## Rendimiento

Clientes/Contactos/Usuarios no se consultan cada 2.5 segundos. El refresco periódico solo obtiene estado y llamadas, manteniendo bajo el costo de red del launcher global.

## Compatibilidad

No agrega migraciones y no cambia el motor integrado de 4.1.0. Mantiene las variables WebRTC existentes y no reintroduce `CALLS_ADAPTER_URL` ni `CALLS_ADAPTER_SECRET`.
