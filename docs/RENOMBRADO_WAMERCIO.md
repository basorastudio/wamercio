# Renombrado integral a wamercio

La plataforma fue renombrada completamente a **wamercio** sin alterar el patrón de estilo, diseño ni funcionalidad.

## Cambios aplicados

- Marca visible y metadata web.
- PWA/manifest y nombre corto.
- Panel SuperAdmin, panel del negocio, afiliados y login.
- Textos de prueba Waxum y footers interactivos.
- `APP_NAME` / `NEXT_PUBLIC_APP_NAME`.
- Módulo Go: `wamercio/api`.
- Binario: `wamercio-api`.
- Package NPM: `wamercio-web`.
- Cookie: `wamercio_session`.
- Redis: `wamercio:geo:*` y `wamercio:identity:*`.
- ID de sesión Waxum: `wamercio-<tenant>`.
- Client ID de Identidad: `wamercio`.
- HMAC fallback de Identidad: `wamercio-identity`.
- Cache PWA: `wamercio-v1`.
- PostgreSQL por defecto: DB/usuario `wamercio`.
- Emails demo: `@wamercio.local` en desarrollo.
- Documentación y ejemplos de despliegue.

## Compatibilidad con instalaciones anteriores

`007_wamercio_brand.sql` actualiza `platform_settings.platform_name` a `wamercio` aunque la migración antigua de configuración ya se hubiera aplicado.

No se renombran conceptos funcionales como “catálogo”, “Ver catálogo” o identificadores de botones cuyo significado es la acción de abrir el catálogo; esos textos son funcionalidades, no la antigua marca.
