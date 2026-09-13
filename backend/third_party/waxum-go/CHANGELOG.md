# Changelog

## 0.1.1 - 2026-07-21

- Añadida compatibilidad automática para instalaciones o proxies que responden 404 en `/api/v1/sessions` pero publican la colección en `/api/v1/sessions/`.
- El reintento conserva el método, la autenticación Bearer y el cuerpo JSON al crear una sesión.
- Agregadas pruebas de regresión para listar y crear sesiones mediante la ruta compatible.

## 0.1.0 - 2026-07-21

- Primera versión del SDK.
- Cobertura de las 103 operaciones del OpenAPI suministrado.
- Modelos tipados para 142 esquemas.
- Cliente Bearer, errores tipados, contextos, timeouts y reintentos opcionales.
- Carga multipart de medios.
- Verificación HMAC-SHA256 de webhooks.
- Helper para descargar grabaciones WAV de llamadas.
- Ejemplos, pruebas y generador reproducible.
