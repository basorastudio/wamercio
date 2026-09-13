# Corrección: sesión WAMERCIO y edición de planes

## Sesión global de WhatsApp

La consola de WAXUM muestra el **ID** de la sesión en la tabla principal. Cambiar únicamente el nombre descriptivo no modifica ese valor, por lo que la integración ahora utiliza ambos campos con el valor canónico:

- ID: `WAMERCIO`
- Nombre: `WAMERCIO`

La migración central `000020_colmapro_whatsapp_session_id` actualiza la configuración persistida. Como la API actual de WAXUM no permite renombrar el ID de una sesión existente, el backend crea automáticamente la sesión `WAMERCIO` y conserva temporalmente `colmapro-saas-superadmin` hasta que la nueva sesión quede vinculada. Después de vincular `WAMERCIO`, la sesión heredada se desconecta y elimina automáticamente.

Esto requiere escanear el QR o usar el código de emparejamiento una sola vez después del despliegue.

## Edición de planes

Cada tarjeta de plan incorpora la acción **Editar**. El modal reutiliza el mismo patrón visual de creación y permite modificar:

- Nombre y descripción.
- Precio mensual.
- Límites de productos, usuarios y sucursales.
- Estado activo o inactivo.

El identificador URL permanece bloqueado durante la edición para no romper suscripciones ni relaciones existentes. El endpoint `PATCH /api/platform/plans/{slug}` ahora procesa actualizaciones parciales correctamente y permite limpiar la descripción sin alterar campos no enviados.
