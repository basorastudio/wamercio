# Despliegue de wamercio en Dokploy

Esta guía utiliza **Docker Compose** y expone únicamente el servicio `web` en el puerto interno `3000`. El backend Go, PostgreSQL y Redis permanecen privados.

> Ejemplos con `wamercio.com`. Si utilizarás otro dominio, reemplázalo también en `ROOT_DOMAIN`, `APP_URL`, `NEXT_PUBLIC_ROOT_DOMAIN`, `IDENTITY_APPLICATION_DOMAIN` y `WAXUM_WEBHOOK_BASE_URL`.

## 1. Preparar DNS

Para un SaaS multi-tenant se necesitan como mínimo dos registros apuntando al VPS de Dokploy:

```text
A   @   IP_DEL_VPS
A   *   IP_DEL_VPS
```

El wildcard `*` cubre `app`, `admin`, tenants y marketplaces.

Si usas Cloudflare, la configuración recomendada es **Full (Strict)**. Para cubrir todos los tenants con TLS puede utilizarse un certificado Cloudflare Origin CA que incluya:

```text
wamercio.com
*.wamercio.com
```

## 2. Subir el código a Git

Sube esta carpeta completa a un repositorio Git. No subas `.env`: está incluido en `.gitignore`.

Archivos que sí deben quedar en Git:

```text
docker-compose.yml
.env.example
.env.dokploy.example
apps/
docs/
```

## 3. Crear el proyecto en Dokploy

1. Crear **Project**.
2. Crear un servicio **Compose**.
3. Elegir **Docker Compose**, no Docker Stack, porque este proyecto compila imágenes mediante `build:`.
4. Seleccionar GitHub/Git y el repositorio.
5. Branch: normalmente `main`.
6. Compose Path: `./docker-compose.yml`.
7. Guardar.

## 4. Configurar Environment

Abrir **Environment** en el servicio Compose y pegar el contenido de `.env.dokploy.example`.

Cambiar obligatoriamente:

```env
POSTGRES_PASSWORD=
DATABASE_URL=
JWT_SECRET=
SUPERADMIN_PASSWORD=
WAXUM_SUPERADMIN_TOKEN=
IDENTITY_API_KEY=
IDENTITY_HASH_SECRET=
GEO_RD_MAP_API_KEY=
```

Para producción debe permanecer:

```env
APP_ENV=production
COOKIE_SECURE=true
SEED_DEMO=false
```

### Generar secretos

En Linux/macOS puede usarse:

```bash
openssl rand -hex 32
```

Usa valores distintos para `JWT_SECRET`, `IDENTITY_HASH_SECRET` y PostgreSQL.

## 5. Configurar Integraciones

### Waxum

```env
WAXUM_BASE_URL=https://waxum.ltd.do
WAXUM_SUPERADMIN_TOKEN=TOKEN_REAL
WAXUM_WEBHOOK_BASE_URL=https://wamercio.com/api/backend/api/v1/public/webhooks/waxum
```

No crear un token por comercio: wamercio crea una sesión Waxum separada por tenant.

### Identidad Dominicana

```env
IDENTITY_BASE_URL=https://id.ltd.do
IDENTITY_API_KEY=API_KEY_REAL
IDENTITY_CLIENT_ID=wamercio
IDENTITY_APPLICATION_DOMAIN=wamercio.com
```

La integración debe permitir `identity:read` y los contextos:

```text
registro_propietario
registro_negocio
registro_cliente
```

### GEO RD MAP

```env
GEO_RD_MAP_BASE_URL=https://geo.ltd.do
GEO_RD_MAP_API_KEY=API_KEY_REAL
```

Scopes recomendados para todas las funciones implementadas:

```text
territories:read
territories:write
geo:read
geo:write
routing:read
```

## 6. Configurar el dominio en Dokploy

Dokploy recomienda administrar dominios desde la pestaña **Domains** del servicio Compose.

Añade el dominio principal apuntando a:

```text
Service: web
Container Port: 3000
Path: /
```

Dominio principal:

```text
wamercio.com
```

Para el modelo multi-tenant añade también el wildcard:

```text
*.wamercio.com
```

Si tu versión instalada no crea correctamente un router wildcard mediante la UI, usa **Advanced → Traefik Configuration** con una regla `HostRegexp` para `*.wamercio.com`, o Cloudflare Tunnel con hostname wildcard. La aplicación ya está preparada para recibir cualquier subdominio y resolver el tenant.

No crees dominios públicos para:

```text
api
postgres
redis
```

## 7. HTTPS

### Opción recomendada con Cloudflare

1. Cloudflare → SSL/TLS → **Full (Strict)**.
2. Crear Origin Certificate para `wamercio.com` y `*.wamercio.com`.
3. Añadir el certificado en Dokploy.
4. Asociarlo al routing correspondiente.

Para un wildcard con Let's Encrypt se requiere DNS challenge; por eso Cloudflare Origin CA suele ser la opción más sencilla cuando el dominio está detrás de Cloudflare.

## 8. Primera publicación

Antes de desplegar, usa **Preview Compose** en Dokploy y verifica:

- `web` conserva acceso a la red interna.
- `api`, `postgres` y `redis` no tienen puertos publicados al host.
- el dominio está conectado al servicio `web:3000`.

Después pulsa **Deploy**.

El orden esperado es:

```text
postgres healthy
redis healthy
api -> migraciones -> healthy
web -> Next.js
```

Las migraciones PostgreSQL se ejecutan automáticamente al arrancar `wamercio-api`.

## 9. Verificaciones después del deploy

Abrir:

```text
https://wamercio.com
https://app.wamercio.com/login
https://admin.wamercio.com/login
```

Luego crea un negocio de prueba y verifica:

```text
https://slug-del-negocio.wamercio.com
```

En **Logs** confirmar que aparezca:

```text
wamercio escuchando en :8080
```

## 10. SuperAdmin inicial

El usuario SuperAdmin se crea automáticamente al arrancar si `SUPERADMIN_PASSWORD` tiene valor.

Ejemplo:

```env
SUPERADMIN_EMAIL=admin@wamercio.com
SUPERADMIN_PASSWORD=TU_PASSWORD_SEGURO
```

Después del primer login puedes cambiar la contraseña mediante el flujo que se implemente para gestión de credenciales; nunca dejes una contraseña de ejemplo.

## 11. Persistencia y backups

El Compose usa volúmenes nombrados para:

- PostgreSQL.
- Redis.
- `/data/uploads`.

Configura backups de PostgreSQL y de los volúmenes desde Dokploy. Para escala horizontal, migra `media_data` a R2/S3 antes de levantar más de una réplica web/API.

## 12. Actualizaciones

Con Git conectado:

1. Push a `main`.
2. Dokploy → Deploy o AutoDeploy/Webhook.
3. Las nuevas migraciones se aplican automáticamente una sola vez mediante `schema_migrations`.

## 13. Problemas comunes

### 502 / Gateway Timeout

- revisar que `web` escuche en `3000`;
- revisar que `api` esté healthy;
- revisar `DATABASE_URL` y `POSTGRES_PASSWORD`;
- revisar en Preview Compose que Traefik tenga conectividad con `web`.

### Tenant muestra la landing

- verificar el registro DNS wildcard `*`;
- verificar routing `*.wamercio.com` → `web:3000`;
- verificar `ROOT_DOMAIN=wamercio.com`.

### Identidad responde 403

- revisar `IDENTITY_CLIENT_ID=wamercio`;
- revisar `IDENTITY_APPLICATION_DOMAIN=wamercio.com`;
- revisar scopes y contextos de la API key.

### GEO RD MAP responde 403

- revisar los scopes `territories:*`, `geo:*` y `routing:read` necesarios.

### Waxum no recibe webhooks

- `WAXUM_WEBHOOK_BASE_URL` debe ser públicamente accesible por Waxum;
- no usar `localhost` en producción;
- revisar sesión y webhook desde el panel de Integraciones.
