# Integración Waxum — wamercio

La plataforma utiliza Waxum como gateway multi-sesión de WhatsApp. La credencial SuperAdmin de Waxum pertenece a la plataforma, no a los comercios.

## Variables de entorno

```env
WAXUM_BASE_URL=https://waxum.example.com
WAXUM_SUPERADMIN_TOKEN=token-superadmin
WAXUM_WEBHOOK_BASE_URL=https://app.example.com/api/backend/api/v1/public/webhooks/waxum
```

`WAXUM_WEBHOOK_BASE_URL` también puede apuntar a un dominio público de la API si se decide publicar el backend de forma separada.

## Modelo multi-tenant

Cada negocio obtiene una sesión estable:

```text
wamercio-<uuid-del-tenant-sin-guiones>
```

La tabla `tenant_integrations` conserva únicamente metadatos del tenant: `session_id`, token aleatorio del webhook, último estado, teléfono y push name. El bearer global de Waxum nunca se almacena en esa tabla ni se entrega al navegador.

## Flujo de conexión

1. El administrador del negocio pulsa **Conectar WhatsApp**.
2. Backend comprueba si la sesión existe.
3. Si no existe, crea `POST /api/v1/sessions`.
4. Si ya existe, solicita `POST /api/v1/sessions/{id}/connect`.
5. Frontend consulta `/dashboard/whatsapp/status` y `/dashboard/whatsapp/qr`.
6. El QR se representa localmente con `qrcode.react`.
7. Cuando Waxum reporta conexión, el panel muestra teléfono, nombre y estado.

**Desconectar** conserva el slot/session. **Desvincular** elimina la sesión Waxum y obliga a enlazar nuevamente.

## Endpoints Waxum utilizados

```text
POST   /api/v1/sessions
GET    /api/v1/sessions/{session_id}
POST   /api/v1/sessions/{session_id}/connect
POST   /api/v1/sessions/{session_id}/disconnect
DELETE /api/v1/sessions/{session_id}
GET    /api/v1/sessions/{session_id}/status
GET    /api/v1/sessions/{session_id}/qr
POST   /api/v1/sessions/{session_id}/webhooks

POST   /api/v1/sessions/{session_id}/messages/text
POST   /api/v1/sessions/{session_id}/messages/quick-reply
POST   /api/v1/sessions/{session_id}/messages/list
POST   /api/v1/sessions/{session_id}/messages/cta-url
```

## Quick Reply

Waxum admite entre 1 y 3 botones:

```json
{
  "to": "18095551234@s.whatsapp.net",
  "body_text": "¿Qué deseas hacer?",
  "footer_text": "wamercio",
  "buttons": [
    {"id":"catalogo","display_text":"Ver catálogo"},
    {"id":"pedido","display_text":"Mi pedido"},
    {"id":"soporte","display_text":"Hablar con tienda"}
  ]
}
```

## Lista interactiva

```json
{
  "to": "18095551234@s.whatsapp.net",
  "title": "Menú del comercio",
  "description": "Selecciona una opción",
  "button_text": "Ver opciones",
  "footer": "wamercio",
  "sections": [
    {
      "title": "Compras",
      "rows": [
        {"row_id":"catalogo","title":"Ver catálogo","description":"Explorar productos"},
        {"row_id":"pedidos","title":"Mis pedidos","description":"Consultar pedidos recientes"}
      ]
    }
  ]
}
```

## CTA URL con imagen

```json
{
  "to": "18095551234@s.whatsapp.net",
  "display_text": "Ver producto",
  "url": "https://negocio.example.com/producto/123",
  "header_text": "Producto disponible",
  "body_text": "Mira los detalles y compra desde el catálogo.",
  "footer_text": "wamercio",
  "image": {"url":"https://cdn.example.com/producto.jpg"}
}
```

## Webhooks

Al crear o conectar una sesión se registran eventos útiles para el SaaS:

```text
message
receipt
qr_code
pair_code
connected
disconnected
logged_out
offline_sync_completed
scheduled_sent
scheduled_failed
```

Como el OpenAPI suministrado describe `secret` para HMAC pero no documenta el nombre exacto del header de firma, wamercio protege adicionalmente el receptor con un token aleatorio no adivinable dentro de la propia URL del webhook. Los eventos completos se guardan en `whatsapp_events` para auditoría y para implementar posteriormente automatizaciones de respuestas interactivas sin perder payloads.

## Pedidos

Al crear un pedido, si el negocio tiene Waxum activo, se envía una confirmación al cliente. Los cambios de estado también pueden producir notificaciones automáticas para:

- aceptado;
- preparando;
- en camino;
- completado;
- cancelado;
- reembolsado.

Las plantillas del negocio pueden sustituir el texto predeterminado mediante las variables `{{cliente}}`, `{{pedido}}`, `{{total}}`, `{{negocio}}` y `{{estado}}`.
