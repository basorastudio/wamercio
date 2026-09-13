# Recuperación de acceso por WhatsApp: OTP + CTA URL

Fecha: 2026-08-31

## Implementación

- Se conserva el método existente de código OTP de 6 dígitos.
- Se incorpora un segundo método seleccionable por SuperAdmin: **Enlace seguro · CTA URL**.
- La selección se almacena dentro de `platform_settings/access_policy`, por lo que no requiere una migración adicional.
- El mensaje CTA usa el endpoint tipado de Waxum `POST /api/v1/sessions/{session_id}/messages/cta-url` a través de `waxum-go`.
- El destino del CTA se genera automáticamente para cada solicitud y no es editable por el usuario final.
- Se soportan título, cuerpo, pie, texto del botón e imagen HTTPS opcional.
- El enlace incluye un token aleatorio de 256 bits, se almacena únicamente su hash HMAC en la base de datos y es de un solo uso.
- El token viaja dentro del fragmento `#/recover-account?...`, de modo que no se envía como parte del path HTTP inicial ni del Referer.
- Al abrir el CTA, el frontend valida el enlace contra el mismo endpoint `/verify`, obtiene una autorización de reseteo temporal y elimina el token visible de la URL.
- La vigencia y los intentos máximos utilizan la misma política global de recuperación ya existente.
- Funciona tanto para cuentas de tenant (clientes, administradores, cajeros/repartidores) como para recuperación central (propietarios y usuarios SaaS).

## Flujo CTA

WhatsApp verificado -> Enviar enlace por WhatsApp -> Waxum CTA URL -> Pulsar botón -> Validación automática -> Nuevo PIN -> Acceso recuperado.

## Compatibilidad

El modo OTP sigue disponible y no se eliminó ni se cambió su contrato. El SuperAdmin puede alternar entre `otp` y `link` desde Configuración > Acceso > Recuperación.

## Validación realizada

- `gofmt` aplicado a los archivos Go modificados.
- Se verificó contra el SDK incluido que existen `waxum.SendCtaUrlRequest` y `client.Messages.SendCtaURL`.
- Se validó sintaxis TS/TSX de los archivos modificados mediante TypeScript `transpileModule`.
- `frontend/scripts/verify-production-surface.mjs` finaliza correctamente.
- La suite Go completa no pudo ejecutarse porque el entorno no tiene acceso a `proxy.golang.org` para descargar las dependencias del proyecto.
