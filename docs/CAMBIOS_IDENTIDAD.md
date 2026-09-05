# Cambios — Integración Identidad

- Cliente Go server-to-server para `POST /api/v1/identidad/verificar`.
- Cabeceras privadas: API key, Client ID, dominio de aplicación, contexto y request ID.
- Contextos separados para propietario, negocio/RNC y cliente.
- Rate limit público por IP/flujo usando Redis.
- Registro de negocios con cédula obligatoria del responsable y RNC opcional para empresas.
- Autocompletado y bloqueo de nombre, fecha de nacimiento y sexo.
- Revalidación del lado servidor en el alta definitiva.
- Registro independiente de clientes en `/registro` por tenant.
- Verificación de identidad integrada en checkout.
- Modelo global `identity_people` y relación comercial `customers` por tenant.
- Cédulas no persistidas en texto claro: HMAC-SHA256 + máscara.
- Modelo `identity_companies` para RNC, razón social, nombre comercial y estado.
- Panel de clientes muestra estado de verificación, documento enmascarado, fecha de nacimiento y sexo.
- Migración `005_identity.sql`.
- Variables Identity añadidas a `.env.example` y `docker-compose.yml`.
- OpenAPI de referencia conservado en `docs/identidad-openapi.yaml`.
