# Integración con Identidad Dominicana

wamercio consume Identidad únicamente desde el backend Go. La API key no se envía nunca al navegador.

## Endpoint usado

`POST /api/v1/identidad/verificar`

Es el endpoint preferido porque devuelve, además de la identidad, las banderas `puede_autocompletar`, `requiere_confirmacion` y `puede_registrarse`.

Cabeceras enviadas desde el backend:

- `X-API-Key`
- `X-Client-ID`
- `X-Application-Domain`
- `X-Usage-Context`
- `X-Request-ID`

## Contextos

La aplicación usa tres contextos distintos y no permite que el navegador los elija libremente:

- `registro_propietario`: cédula del responsable que crea un negocio.
- `registro_negocio`: RNC de una empresa constituida.
- `registro_cliente`: cédula de un cliente de un tenant.

La API key creada en Identidad debe permitir `identity:read` y estos contextos. Si en Identidad se exige Client ID o dominio, deben coincidir exactamente con `IDENTITY_CLIENT_ID` e `IDENTITY_APPLICATION_DOMAIN`.

## Registro de negocio

1. El responsable introduce su cédula.
2. El frontend llama al proxy público limitado del backend.
3. Go consulta Identidad con `tipo_sujeto=persona` y contexto `registro_propietario`.
4. Si `valida`, `encontrada`, `puede_autocompletar` y `puede_registrarse` son verdaderos, la UI completa nombre, fecha de nacimiento y sexo y los deja de solo lectura.
5. Si el negocio es una empresa, se verifica además el RNC con `tipo_sujeto=empresa` y contexto `registro_negocio`.
6. En el POST final de alta, el backend vuelve a resolver/verificar la identidad y no confía en los valores de nombre, fecha o sexo enviados por el navegador.

## Registro de cliente

Cada tenant tiene `/registro`. El cliente verifica su cédula, recibe el autocompletado oficial y añade WhatsApp, correo y dirección. La misma verificación está integrada en el checkout; el primer pedido puede crear o actualizar automáticamente la relación del cliente con el negocio.

Una identidad personal es global en la plataforma (`identity_people`). La relación comercial sigue siendo por tenant (`customers`). Así una misma persona puede ser cliente de varios negocios sin duplicar su documento completo.

## Privacidad

wamercio no persiste la cédula completa. Se guarda:

- HMAC-SHA256 del número normalizado, para deduplicación.
- representación enmascarada, por ejemplo `*******1234`.
- nombre oficial, fecha de nacimiento y sexo necesarios para el perfil.
- fuente, request ID y fecha de verificación para trazabilidad.

El secreto HMAC se configura mediante `IDENTITY_HASH_SECRET`; si está vacío se utiliza `JWT_SECRET` como fallback.

Los RNC sí se almacenan normalizados porque forman parte de la identidad empresarial del tenant.

## Rate limiting

Los endpoints públicos de pre-verificación se limitan por IP y flujo con Redis. El valor por defecto es 8 consultas/minuto y se configura mediante `IDENTITY_PUBLIC_RATE_LIMIT`.

## Variables de entorno

```env
IDENTITY_BASE_URL=https://id.ltd.do
IDENTITY_API_KEY=...
IDENTITY_CLIENT_ID=wamercio
IDENTITY_APPLICATION_DOMAIN=app.tudominio.do
IDENTITY_HASH_SECRET=un-secreto-independiente-y-largo
IDENTITY_OWNER_CONTEXT=registro_propietario
IDENTITY_BUSINESS_CONTEXT=registro_negocio
IDENTITY_CUSTOMER_CONTEXT=registro_cliente
IDENTITY_PUBLIC_RATE_LIMIT=8
```
