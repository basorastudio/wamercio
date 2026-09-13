# WhatsApp por negocio

WAMERCIO permite que cada propietario o administrador vincule el WhatsApp de su negocio desde la tarjeta de configuración correspondiente.

## Flujo

1. El usuario presiona **Vincular WhatsApp**.
2. El backend crea en WAXUM una sesión cuyo identificador es el `slug` del negocio, por ejemplo `colmadorafael-mnblt`.
3. El usuario elige **Código QR** o **Emparejamiento**.
4. WAMERCIO consulta periódicamente el estado de la sesión.
5. Cuando WAXUM confirma la vinculación, se muestran el número, nombre e imagen de perfil.
6. Las notificaciones de pedidos, estados y otros eventos del negocio se envían por esa sesión.

El nombre visible del dispositivo vinculado en WhatsApp es **COLMAPRO**. Las credenciales de administración de WAXUM solo existen en el backend y se reutilizan desde la configuración global del panel SaaS.

## Persistencia

El estado sanitizado se guarda dentro de `tenants.metadata.whatsapp`, por lo que no requiere una tabla adicional. No se almacena el token de WAXUM dentro del tenant.

## Contingencia

Si el negocio todavía no ha vinculado su WhatsApp, los workers pueden usar la sesión global de WAMERCIO. Si tampoco existe una sesión global conectada, el envío permanece pendiente según la política de reintentos del worker.

## Endpoints

- `GET /api/admin/businesses/{id}/whatsapp`
- `GET /api/admin/businesses/{id}/whatsapp/qr`
- `POST /api/admin/businesses/{id}/whatsapp/pairing-code`
- `GET /api/admin/businesses/{id}/whatsapp/status`
- `POST /api/admin/businesses/{id}/whatsapp/disconnect`

## Emparejamiento con número de teléfono

WAMERCIO envía a WAXUM la solicitud `POST /api/v1/sessions/{session_id}/pair` con:

```json
{
  "phone_number": "+18095551212",
  "show_push_notification": true,
  "device": {
    "os": "COLMAPRO",
    "platform": "chrome"
  }
}
```

Antes de solicitar el código, el backend detiene cualquier conexión iniciada en modo QR. De esta forma WAXUM abre su flujo dedicado de emparejamiento por número, solicita la notificación push en el teléfono y evita reutilizar un cliente que ya estuviera esperando un QR.

Si WAXUM devuelve temporalmente `pair-code IQ request failed`, WAMERCIO limpia la sesión incompleta, la crea nuevamente con el mismo identificador y realiza un segundo intento controlado. Los detalles internos del proveedor no se exponen al propietario.

### Versión mínima recomendada de WAXUM

Usa **WAXUM 0.11.3 o posterior**. La versión 0.9.8 contiene una implementación anterior del flujo de códigos de emparejamiento. WAXUM 0.11.3 actualizó `whatsapp-rust` e incorporó correcciones específicas para mantener viva la vinculación por número, procesar correctamente la respuesta final y reportar solicitudes rechazadas.

Al actualizar en Dokploy, conserva el volumen de almacenamiento, las variables y el token actuales; cambia únicamente la imagen a una versión 0.11.3 o posterior y reconstruye el servicio.

## Ciclo de vida y eliminación de sesiones huérfanas

La sesión remota solo puede existir en uno de estos dos casos:

1. El WhatsApp está autenticado (`logged_in`).
2. Existe una vinculación explícita mediante QR o código de emparejamiento dentro de una ventana temporal.

WAMERCIO no crea sesiones al abrir la tarjeta, consultar el estado o cargar la configuración. La sesión se crea únicamente después de que el usuario solicita un QR o un código de emparejamiento.

Si la ventana de vinculación vence sin autenticar la cuenta, el backend ejecuta la eliminación completa de la sesión. El mismo procedimiento se aplica cuando:

- el usuario cancela o cierra una vinculación pendiente;
- el propietario presiona **Desvincular** en WAMERCIO;
- WAXUM informa que una cuenta previamente vinculada dejó de estar autenticada;
- el dispositivo elimina a COLMAPRO desde **Dispositivos vinculados**;
- el worker de notificaciones detecta la pérdida de autenticación antes de enviar un mensaje.

La operación usa primero una desconexión compatible con versiones anteriores y después `DELETE /api/v1/sessions/{session_id}`. WAMERCIO solo limpia el estado local cuando WAXUM confirma la eliminación o informa que la sesión ya no existe. Una falla remota mantiene el error visible para no aparentar que la cuenta fue eliminada mientras todavía existe en WAXUM.

Un worker de reconciliación revisa periódicamente la sesión global y las sesiones de los negocios. Las reconexiones transitorias disponen de una gracia corta; una sesión que continúa sin autenticar se elimina automáticamente. El cierre del modal también cancela de inmediato cualquier intento pendiente.

Al eliminar un negocio desde el panel SaaS, WAMERCIO elimina primero la sesión remota correspondiente. Si WAXUM no confirma la eliminación, el negocio no se borra y el administrador recibe el error, evitando que el tenant desaparezca mientras su sesión queda huérfana.
