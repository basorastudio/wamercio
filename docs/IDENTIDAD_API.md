# Integración de Identidad API en WAMERCIO

WAMERCIO integra `https://id.ltd.do` mediante comunicación **servidor a servidor**. El navegador solo consume rutas protegidas del backend de WAMERCIO y nunca recibe la API key.

## Arquitectura

```text
Frontend Next.js
  -> /api/platform/identity/verify
Backend Go + Chi
  -> X-API-Key + X-Client-ID + X-Application-Domain + X-Usage-Context + X-Request-ID
https://id.ltd.do/api/v1/identidad/verificar
```

## Configuración

La integración puede configurarse desde:

```text
Superadministración -> Configuración -> Identidad
```

También acepta estas variables como valores iniciales o fallback:

```env
IDENTIDAD_API_ENABLED=false
IDENTIDAD_API_REQUIRED=false
IDENTIDAD_API_URL=https://id.ltd.do
IDENTIDAD_API_KEY=
IDENTIDAD_API_CLIENT_ID=wamercio
IDENTIDAD_API_TIMEOUT=12s
APP_DOMAIN=wamercio.com
```

No se debe crear ninguna variable `NEXT_PUBLIC_IDENTIDAD_API_KEY`.

`APP_DOMAIN` identifica a WAMERCIO en llamadas backend-a-backend. El cliente de Go lo normaliza a un dominio concreto (por ejemplo `wamercio.com`) y lo envía en `X-Application-Domain`. Esto es necesario cuando la API key de Identidad está restringida por dominios y el servidor remoto no dispone de `Origin`/`Referer`. No se envían comodines en esta cabecera.

## Rutas internas

- `GET /api/platform/identity`
- `PATCH /api/platform/identity/configure`
- `POST /api/platform/identity/verify`

Todas requieren una sesión de plataforma. La lectura/configuración exige `settings.manage`; la verificación acepta `businesses.manage` o `settings.manage` porque se usa tanto en formularios de alta como en la prueba de configuración.

## Registro de propietarios

El modal de propietarios ahora:

1. Valida localmente la cédula dominicana.
2. Consulta Identidad API automáticamente.
3. Autocompleta nombres y apellidos cuando el proveedor lo permite.
4. Solicita confirmación cuando `requiere_confirmacion=true`.
5. Valida nuevamente en el backend antes de guardar.
6. Guarda estado, fuente, request ID y fecha de verificación.
7. Permite `pending_manual` solo cuando la integración no es obligatoria y el servicio está temporalmente indisponible.

## Creación de negocios y RNC

El modal **Nuevo negocio** organiza el alta en este orden: datos principales, propietario y acceso, dirección y datos fiscales opcionales. La ubicación GPS se configura después, dentro del negocio, porque no forma parte del aprovisionamiento inicial.

1. El RNC es siempre opcional, incluso cuando la política de verificación está configurada como obligatoria.
2. Cuando se suministra un RNC, acepta documentos de 9 u 11 dígitos y consulta Identidad API con el contexto `registro_negocio`.
3. Autocompleta razón social y nombre comercial cuando `puede_autocompletar=true`.
4. Bloquea el alta cuando se suministra un RNC y `puede_registrarse=false`.
5. Solicita confirmación cuando `requiere_confirmacion=true`.
6. Repite la validación en el backend antes de aprovisionar la base de datos del negocio.
7. Sin RNC, guarda el negocio con estado fiscal `unverified` y sin metadatos de una verificación anterior.
8. Con RNC, conserva en `tenants.metadata` el documento, los nombres legales, el estado, la fuente, el request ID, la fecha y la confirmación del usuario.
9. Usa `pending_manual` cuando la integración no es obligatoria y el proveedor está temporalmente indisponible.

## Seguridad

- Límite de 5 verificaciones por minuto por usuario de plataforma.
- Contextos permitidos mediante lista cerrada.
- Documentos enmascarados en auditoría.
- API key redactada en auditorías y respuestas genéricas de configuración.
- `X-Request-ID` propagado al proveedor.
- Respuestas con `Cache-Control: no-store` mediante la política HTTP del backend.
- La configuración de identidad solo puede modificarse por su endpoint dedicado.

## Base de datos

La migración `000021_platform_owner_identity_verification` agrega:

- `identity_verified_at`
- `identity_verification_status`
- `identity_source`
- `identity_request_id`
- `identity_requires_confirmation`
- `identity_confirmed_by_user`

La migración idempotente `000022_platform_owner_identity_schema_repair` repara instalaciones donde la versión anterior quedó registrada sin crear todas las columnas. Además, el backend valida y repara estas columnas al iniciar, antes de consultar propietarios, incluso cuando `RUN_MIGRATIONS=false`.

## Despliegue

1. Configura la API key en Dokploy o desde la pestaña Identidad.
2. Ejecuta las migraciones centrales (`RUN_MIGRATIONS=true`).
3. Redespliega backend y frontend.
4. Abre Configuración -> Identidad, guarda y ejecuta una prueba.
5. Crea un propietario y confirma que la cédula se verifica y el nombre se autocompleta.

## Errores de proveedores y Nginx

Los errores HTTP emitidos intencionalmente por el backend no deben ser sustituidos por Nginx. Un fallo temporal de DGII puede producir `502`, `503` o `504` aunque el backend de WAMERCIO continúe saludable. Por eso la configuración del frontend usa:

```nginx
proxy_intercept_errors off;
```

Así, el navegador recibe el JSON real de Identidad API y muestra el motivo correcto. Los fallos de transporte entre Nginx y el contenedor backend continúan llegando como errores de gateway y el cliente HTTP de WAMERCIO los presenta como indisponibilidad del backend.

## Bootstrap por dominio

`/api/bootstrap` solo se solicita automáticamente desde:

- un subdominio tenant, por ejemplo `negocio.ltd.do`;
- el panel administrativo central cuando existe un tenant seleccionado explícitamente.

La landing `wamercio.com`, el panel `/#/superadmin` y el dominio raíz `ltd.do` no deben consultar el bootstrap tenant. Esto evita respuestas `404` legítimas por ausencia de tenant y elimina reintentos innecesarios en la consola del navegador.

## Mensajes externos de la consola del navegador

Los mensajes `ERR_BLOCKED_BY_CLIENT` para `static.cloudflareinsights.com` y `ChromeRuntimeError: Could not establish connection. Receiving end does not exist` no son emitidos por WAMERCIO. El primero aparece cuando Brave Shields o un bloqueador impide cargar Cloudflare Browser Insights; el segundo corresponde a una extensión de Chrome/Brave cuyo content script intenta comunicarse con un receptor que ya no existe. No se encontraron referencias a `cloudflareinsights`, `chrome.runtime`, `runtime.lastError` ni `Cleanup timeout` en el código de la plataforma.

Para una consola limpia, desactiva Cloudflare Web Analytics/Browser Insights para el dominio o permite el beacon en el navegador, y prueba el panel en una ventana privada sin extensiones. Estas acciones no cambian el funcionamiento de WAMERCIO.
