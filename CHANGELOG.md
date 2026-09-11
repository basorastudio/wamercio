# WAMERCIO 1.5.0

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
- No cambia Redis ni whatsmeow.
- No cambia el dominio ni las variables `.env` existentes.
- No requiere Fresh Volumes.
