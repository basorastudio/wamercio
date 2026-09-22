# WAMERCIO V4.3.5 — Chat de soporte unificado

## Objetivo

La sección **SuperAdmin → WhatsApp de soporte** deja de comportarse como una página administrativa con cabecera y banners adicionales. Desde esta versión se comporta como una bandeja de conversaciones a pantalla completa, siguiendo el mismo patrón visual y operativo del WhatsApp de los negocios.

## Cambios de interfaz

- Se elimina el encabezado interno duplicado “Panel central de plataforma / WhatsApp de soporte”.
- Se elimina el banner de estado “Canal de soporte conectado” y el botón “Administrar sesión global”.
- La vinculación sigue existiendo únicamente en **Configuración → WhatsApp**.
- La bandeja ocupa todo el alto disponible debajo de la barra superior del SuperAdmin.
- Lista lateral con búsqueda, filtros, no leídos, estado de propietario y contexto de negocio.
- Cabecera de conversación con llamada, información del comerciante, búsqueda y menú contextual.
- Panel lateral de información del propietario/negocio, plan, estado, número de negocios y accesos administrativos.

## Funciones añadidas al soporte

- Llamada mediante el mismo softphone global del SuperAdmin.
- Adjuntos de imagen, video, audio y documentos.
- Notas de voz grabadas desde el navegador.
- Encuestas nativas de WhatsApp desde la sesión `support`.
- Respuestas rápidas orientadas a soporte.
- Búsqueda dentro de la conversación con navegación entre coincidencias.
- Marcar conversación como no leída.
- Exportar conversación a TXT.
- Vaciar historial local de soporte.
- Eliminar conversación local; el comerciante permanece disponible para iniciar un nuevo chat.
- Vista de propietario y negocio sin abandonar la conversación.

## Backend

Se agregan estos endpoints administrativos:

- `POST /api/v1/admin/whatsapp/conversations/{id}/send-poll`
- `PATCH /api/v1/admin/whatsapp/conversations/{id}/unread`
- `DELETE /api/v1/admin/whatsapp/conversations/{id}/messages`
- `DELETE /api/v1/admin/whatsapp/conversations/{id}`

El listado de conversaciones ahora incluye contexto del negocio principal, plan, cantidad de negocios y estado de la cuenta para que la interfaz del SuperAdmin no dependa de datos simulados.

## Base de datos

No hay migraciones nuevas. Se reutilizan las tablas existentes `support_whatsapp_conversations` y `support_whatsapp_messages`.

## Despliegue

Reconstruir `web` y `api`. El servicio `whatsapp` no requiere cambios en esta versión porque las encuestas y archivos usan rutas del bridge que ya existían.
