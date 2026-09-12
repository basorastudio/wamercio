# Centro de Conversaciones WAMERCIO

La bandeja de conversaciones está diseñada con el patrón de WhatsApp Web y los flujos operativos definidos para el contact center de WAMERCIO.

## Escritorio

- Columna izquierda: búsqueda y conversaciones.
- Centro: historial y compositor.
- Columna derecha contextual: datos del cliente o registros de atención.
- La columna derecha ocupa espacio real dentro de la estructura. No se usa overlay ni blur en escritorio.

## Móvil

- La lista y el chat se convierten en vistas navegables.
- El panel contextual ocupa el área disponible para facilitar lectura y edición.
- La navegación general sigue el patrón mobile-first/PWA.

## Cliente y CRM

Los números directos de WhatsApp se vinculan automáticamente con `customers`. Desde el chat se puede:

- confirmar o cambiar el nombre;
- guardar dirección y notas;
- activar o bloquear el cliente;
- revisar pedidos recientes y gasto acumulado.

Los cambios se reflejan inmediatamente en la cabecera y lista de conversaciones.

## Registros de atención

La pestaña de registros incluye:

- estado de atención (abierta, pendiente, cerrada);
- mensajes recibidos y enviados;
- imágenes, videos, audios y documentos;
- primera y última interacción;
- notas internas cronológicas.

## Tipos de mensaje

WAMERCIO reconoce texto, imagen, video, audio, documento, sticker, ubicación, contacto y reacción. Cuando un adjunto aún no se descarga, se muestra una etiqueta clara de su tipo en vez de `[Mensaje no textual]`.
