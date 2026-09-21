# WAMERCIO 4.1.12 — Chat interno, bloqueo de Contactos y PIN progresivo

## Clientes y Contactos

La tabla de **Clientes** incorpora ahora el botón de chat WhatsApp, igual que Contactos. Ambos botones abren la conversación dentro de WAMERCIO (`/conversations`) usando primero `conversation_id` y, si todavía no existe, el número normalizado.

Se elimina el comportamiento anterior de Contactos que abría `https://wa.me/...` en WhatsApp Web externo.

## Bloqueo de Contactos

Contactos incorpora el mismo patrón operativo de Clientes:

- botón Bloquear/Desbloquear en la fila;
- modal con motivo obligatorio desde la tabla;
- límite de 500 caracteres;
- estado `Bloqueado` visible en la tabla;
- cierre de conversación y limpieza de no leídos al bloquear;
- auditoría `contact_blocked` / `contact_unblocked` en `conversation_events`;
- recuperación del último motivo de bloqueo en el listado.

El menú existente de la conversación sigue siendo compatible. Cuando ese flujo antiguo bloquea sin enviar motivo, el API registra `Bloqueado desde la conversación` para no romper el chat.

## PIN de usuarios

El formulario **Agregar usuario** deja de usar un solo input. Reutiliza el componente oficial `PinInput` de WAMERCIO:

- un dígito por casilla;
- avance automático;
- Backspace al dígito anterior;
- navegación con flechas;
- pegado de un PIN completo;
- entrada numérica móvil;
- validación de longitud antes de guardar.

La longitud respeta `staff_pin_length`. En la configuración estándar de 4 dígitos se muestran exactamente cuatro casillas.

## Despliegue

No hay nuevas migraciones. Esta versión modifica **Web + API**. Si vienes de 4.1.11, reconstruye esos dos servicios. WhatsApp Bridge no necesita cambios.
