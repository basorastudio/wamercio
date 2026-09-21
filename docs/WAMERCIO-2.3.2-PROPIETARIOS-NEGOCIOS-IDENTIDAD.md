# WAMERCIO 2.3.2 — Propietarios, WhatsApp e identidad comercial

## Alcance

Esta versión mantiene el modal de dos pestañas `Propietario / Negocio` e incorpora validaciones reales y separación correcta de identidad personal y fiscal.

### Propietario

- WhatsApp validado con la sesión SaaS principal `support` del bridge whatsmeow.
- El backend repite la validación antes de crear o modificar un propietario.
- Cédula dominicana obligatoria en el flujo administrativo, con formato `000-0000000-0`.
- Verificación de Cédula mediante Identidad Dominicana.
- Autocompletado de nombre, apellido, fecha de nacimiento y género cuando la API devuelve esos datos.
- Estado de validación de WhatsApp persistido en `users.whatsapp_verified_at`.

### Negocio

- RNC separado de la identidad del propietario y almacenado en `stores.rnc`.
- RNC opcional; si se completa debe verificarse mediante Identidad Dominicana.
- Razón social y nombre comercial persistidos cuando están disponibles.
- Selector de tipo + nombre comercial unificado; el tipo funciona como prefijo excepto `otro-negocio`.
- Provincia, municipio/distrito, barrio, calle y número con integración opcional de GEO RD MAP y entrada manual de respaldo.
- Ruta pública mostrada según la arquitectura actual: `wamercio.com/{slug}`.

### WhatsApp SaaS

La pantalla `Configuración → WhatsApp` consulta el estado automáticamente mientras la sesión se está vinculando. Cuando whatsmeow emite conexión, el QR desaparece sin refrescar manualmente el navegador.

## Migración

`000017_owner_whatsapp_business_identity` agrega:

- `users.whatsapp_verified_at`.
- identidad fiscal y ubicación estructurada en `stores`.
- índice único parcial para RNC no vacío.

No agrega variables ENV nuevas.
