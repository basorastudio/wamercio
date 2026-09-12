# WAMERCIO 1.6.0

## Centro de Conversaciones

- Nueva bandeja inspirada en WhatsApp Web con lista, chat y panel contextual.
- Panel derecho inline de datos del contacto en escritorio, sin overlay ni blur.
- Registros de atención en el mismo espacio lateral.
- Métricas por conversación: recibidos, enviados, imágenes, videos, audios y documentos.
- Notas internas y estado de atención: abierta, pendiente o cerrada.
- Vinculación automática de contactos con el CRM de Clientes.
- Actualización inmediata del nombre/datos del cliente sin refrescar el navegador.
- Mensajes no textuales clasificados por tipo en lugar de una etiqueta genérica.

## WhatsApp

- Las nuevas vinculaciones se identifican como **WAMERCIO** en Dispositivos vinculados.
- Supervisión de actividad y reconexión para mantener saludable la sesión.
- El panel muestra únicamente la identidad WAMERCIO y detalles útiles para el comerciante.
- Se eliminó toda referencia visible a proveedores o nombres técnicos de transporte.

## Datos

- Migración `000008_conversation_center` con vínculo conversación-cliente, estado y notas internas.

## Historial anterior

## WhatsApp internacional

- Integrado `@intl-tel-input/react` + `intl-tel-input` 29.2.3.
- Añadida bandera del país y código de marcación separado en todos los campos de WhatsApp.
- Añadido selector/buscador de países en español.
- Añadido formateo progresivo y validación internacional.
- Añadido endpoint `GET /api/v1/meta/country` que usa `CF-IPCountry` para seleccionar automáticamente el país sin depender de un servicio IP externo.
- Fallback de país por locale del navegador y, finalmente, República Dominicana.
- Corregida la normalización backend para no anteponer `1` a números E.164 internacionales que ya llegan con `+`.

## PIN de acceso

- Sustituido el input único del PIN por cuatro casillas numéricas de un carácter.
- Avance automático al siguiente dígito.
- Retroceso inteligente con Backspace.
- Navegación con flechas.
- Pegado de un PIN completo de cuatro dígitos.
- Login automático al completar el cuarto dígito.
- Eliminado `Repetir PIN` del registro.
- Simplificado el cambio de PIN del perfil a PIN actual + nuevo PIN, ambos con cuatro casillas.

## Plataforma sin correo comercial

- Eliminado correo del registro de comerciantes.
- Eliminado correo de perfiles comerciales.
- Eliminado correo de tiendas y ajustes.
- Eliminado correo de clientes y checkout.
- Eliminado correo de pedidos y vistas administrativas de comerciantes.
- SuperAdmin continúa usando correo + contraseña.
- Panel SuperAdmin identifica comerciantes por nombre + WhatsApp.
- Nueva migración `000007_no_merchant_email` que elimina columnas de correo heredadas de tiendas/clientes/pedidos y limpia email de usuarios no SuperAdmin.

## Compatibilidad

- No cambia el routing Cloudflare/Traefik/gateway.
- No cambia Redis ni el servicio WhatsApp existente.
- No cambia el dominio ni las variables `.env` existentes.
- No requiere Fresh Volumes.

